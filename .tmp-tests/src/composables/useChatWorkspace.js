import { computed, reactive, ref } from 'vue';
import { chatApi } from '../api/chat.js';
import { attachmentPrompt } from '../lib/chatAttachments.js';
const now = () => new Date().toISOString();
function createMessage(id, sessionId, role, content) {
    const timestamp = now();
    return {
        id,
        sessionId,
        role,
        content,
        sequence: 0,
        status: role === 'USER' ? 'COMPLETED' : 'STREAMING',
        generationTaskId: null,
        requestId: null,
        modelId: role === 'ASSISTANT' ? 3 : null,
        errorCode: null,
        errorMessage: null,
        createTime: timestamp,
        updateTime: timestamp,
    };
}
function getErrorMessage(error, fallback) {
    return error instanceof Error && error.message ? error.message : fallback;
}
function hasImageAttachment(files) {
    return files.some((file) => file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/gif');
}
export function createChatWorkspace(options = {}) {
    const api = options.api ?? chatApi;
    const pageSize = options.pageSize ?? 20;
    const sessions = ref([...(options.initialSessions ?? [])]);
    const messagesBySession = reactive({});
    for (const [sessionId, messages] of Object.entries(options.initialMessages ?? {})) {
        messagesBySession[Number(sessionId)] = messages.map((message) => ({ ...message }));
    }
    const activeSessionId = ref(sessions.value[0]?.id ?? null);
    const generatingSessionId = ref(null);
    const generationController = ref(null);
    const isUploading = ref(false);
    const isChangingModel = ref(false);
    const isLoadingSessions = ref(false);
    const isLoadingMoreSessions = ref(false);
    const isLoadingSessionDetail = ref(false);
    const sessionsError = ref(null);
    const sessionDetailError = ref(null);
    const currentPage = ref(0);
    const totalPages = ref(0);
    let detailRequestId = 0;
    let nextId = Math.max(0, ...sessions.value.map((session) => session.id), ...Object.values(messagesBySession).flat().map((message) => message.id)) + 1;
    const activeSession = computed(() => sessions.value.find((session) => session.id === activeSessionId.value) ?? null);
    const messages = computed(() => activeSessionId.value === null ? [] : messagesBySession[activeSessionId.value] ?? []);
    const isGenerating = computed(() => generatingSessionId.value === activeSessionId.value && activeSessionId.value !== null);
    const hasMoreSessions = computed(() => currentPage.value < totalPages.value);
    function ensureMessages(sessionId) {
        messagesBySession[sessionId] ??= [];
        return messagesBySession[sessionId];
    }
    async function loadSessionDetail(sessionId) {
        const requestId = ++detailRequestId;
        isLoadingSessionDetail.value = true;
        sessionDetailError.value = null;
        try {
            const detail = await api.getSession(sessionId);
            if (requestId !== detailRequestId)
                return detail;
            const sessionIndex = sessions.value.findIndex((session) => session.id === sessionId);
            if (sessionIndex >= 0)
                sessions.value[sessionIndex] = detail.session;
            messagesBySession[sessionId] = detail.messages.map((message) => ({ ...message }));
            activeSessionId.value = sessionId;
            return detail;
        }
        catch (error) {
            if (requestId === detailRequestId)
                sessionDetailError.value = getErrorMessage(error, '加载会话失败，请重试');
            throw error;
        }
        finally {
            if (requestId === detailRequestId)
                isLoadingSessionDetail.value = false;
        }
    }
    async function loadSessions() {
        if (isLoadingSessions.value)
            return;
        isLoadingSessions.value = true;
        sessionsError.value = null;
        sessionDetailError.value = null;
        detailRequestId++;
        currentPage.value = 0;
        totalPages.value = 0;
        activeSessionId.value = null;
        for (const key of Object.keys(messagesBySession))
            delete messagesBySession[Number(key)];
        try {
            const result = await api.listSessions(1, pageSize);
            sessions.value = [...result.records];
            currentPage.value = result.current;
            totalPages.value = result.pages;
        }
        catch (error) {
            sessions.value = [];
            sessionsError.value = getErrorMessage(error, '加载会话失败，请重试');
            isLoadingSessions.value = false;
            return;
        }
        isLoadingSessions.value = false;
        if (sessions.value[0]) {
            try {
                await loadSessionDetail(sessions.value[0].id);
            }
            catch {
                // The list is still usable when only the initial detail request fails.
            }
        }
    }
    async function loadMoreSessions() {
        if (isLoadingSessions.value || isLoadingMoreSessions.value || !hasMoreSessions.value)
            return;
        isLoadingMoreSessions.value = true;
        sessionsError.value = null;
        const nextPage = currentPage.value + 1;
        try {
            const result = await api.listSessions(nextPage, pageSize);
            sessions.value.push(...result.records);
            currentPage.value = result.current;
            totalPages.value = result.pages;
        }
        catch (error) {
            sessionsError.value = getErrorMessage(error, '加载更多会话失败，请重试');
            throw error;
        }
        finally {
            isLoadingMoreSessions.value = false;
        }
    }
    async function createSession(defaultModelId) {
        sessionsError.value = null;
        try {
            const session = await api.createSession(undefined, defaultModelId);
            sessions.value.unshift(session);
            messagesBySession[session.id] = [];
            activeSessionId.value = session.id;
            sessionDetailError.value = null;
            return session;
        }
        catch (error) {
            sessionsError.value = getErrorMessage(error, '创建会话失败，请重试');
            throw error;
        }
    }
    async function selectSession(sessionId) {
        if (!sessions.value.some((session) => session.id === sessionId))
            return;
        activeSessionId.value = sessionId;
        await loadSessionDetail(sessionId);
    }
    async function renameSession(sessionId, title) {
        const value = title.trim().slice(0, 200);
        if (!value)
            return;
        sessionsError.value = null;
        try {
            const updated = await api.updateSession(sessionId, { title: value });
            const index = sessions.value.findIndex((session) => session.id === sessionId);
            if (index >= 0)
                sessions.value[index] = updated;
            return updated;
        }
        catch (error) {
            sessionsError.value = getErrorMessage(error, '重命名失败，请重试');
            throw error;
        }
    }
    async function changeModel(modelId) {
        const sessionId = activeSessionId.value;
        if (sessionId === null || isGenerating.value || isChangingModel.value)
            return;
        const session = sessions.value.find((item) => item.id === sessionId);
        if (!session)
            return;
        if (session.defaultModelId === modelId)
            return session;
        isChangingModel.value = true;
        try {
            const updated = await api.updateSession(sessionId, { defaultModelId: modelId });
            const index = sessions.value.findIndex((item) => item.id === sessionId);
            if (index >= 0)
                sessions.value[index] = updated;
            return updated;
        }
        finally {
            isChangingModel.value = false;
        }
    }
    async function togglePinned(sessionId) {
        const session = sessions.value.find((item) => item.id === sessionId);
        if (!session)
            return;
        sessionsError.value = null;
        try {
            const updated = await api.pinSession(sessionId, !session.pinned);
            const index = sessions.value.findIndex((item) => item.id === sessionId);
            if (index >= 0)
                sessions.value[index] = updated;
            return updated;
        }
        catch (error) {
            sessionsError.value = getErrorMessage(error, '置顶操作失败，请重试');
            throw error;
        }
    }
    async function deleteSession(sessionId) {
        sessionsError.value = null;
        try {
            await api.deleteSession(sessionId);
            const index = sessions.value.findIndex((session) => session.id === sessionId);
            if (index < 0)
                return;
            sessions.value.splice(index, 1);
            delete messagesBySession[sessionId];
            if (activeSessionId.value === sessionId) {
                const nextSession = sessions.value[0];
                if (nextSession) {
                    activeSessionId.value = nextSession.id;
                    await loadSessionDetail(nextSession.id);
                }
                else {
                    activeSessionId.value = null;
                    sessionDetailError.value = null;
                }
            }
        }
        catch (error) {
            sessionsError.value = getErrorMessage(error, '删除会话失败，请重试');
            throw error;
        }
    }
    async function syncSessionDetail(sessionId) {
        const detail = await api.getSession(sessionId);
        const sessionIndex = sessions.value.findIndex((session) => session.id === sessionId);
        if (sessionIndex >= 0)
            sessions.value[sessionIndex] = detail.session;
        messagesBySession[sessionId] = detail.messages.map((message) => ({ ...message }));
        return detail;
    }
    function handleStreamEvent(assistant, event) {
        assistant.requestId = event.requestId || assistant.requestId;
        if (event.type === 'START') {
            assistant.generationTaskId = event.taskId;
            assistant.id = event.assistantMessageId ?? assistant.id;
            assistant.modelId = event.modelId;
            assistant.status = 'STREAMING';
        }
        else if (event.type === 'DELTA') {
            assistant.content += event.delta ?? '';
            assistant.status = 'STREAMING';
        }
        else if (event.type === 'COMPLETE') {
            assistant.status = 'COMPLETED';
            assistant.usage = event.usage ?? undefined;
        }
        else if (event.type === 'FAILED') {
            assistant.status = 'FAILED';
            assistant.errorCode = event.errorCode;
            assistant.errorMessage = event.message || '生成失败，请稍后重试';
        }
        assistant.updateTime = now();
    }
    async function generateAssistant(sessionId, assistant, content, regenerate = false, fileIds) {
        const session = sessions.value.find((item) => item.id === sessionId);
        const requestId = crypto.randomUUID();
        const controller = new AbortController();
        generatingSessionId.value = sessionId;
        generationController.value = controller;
        assistant.status = 'STREAMING';
        assistant.content = '';
        assistant.requestId = requestId;
        assistant.errorCode = null;
        assistant.errorMessage = null;
        assistant.usage = undefined;
        try {
            const request = {
                content,
                modelId: session?.defaultModelId || undefined,
                requestId,
            };
            if (!regenerate && fileIds?.length)
                request.fileIds = fileIds;
            const response = regenerate
                ? await api.regenerate(sessionId, { ...request, messageId: assistant.id }, controller.signal)
                : await api.stream(sessionId, request, controller.signal);
            await api.readStream(response, (event) => handleStreamEvent(assistant, event));
        }
        catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                assistant.status = 'INTERRUPTED';
                assistant.errorMessage = '已停止生成';
            }
            else {
                assistant.status = 'FAILED';
                assistant.errorMessage = getErrorMessage(error, '生成失败，请稍后重试');
            }
            assistant.updateTime = now();
        }
        finally {
            generatingSessionId.value = null;
            generationController.value = null;
            try {
                await syncSessionDetail(sessionId);
            }
            catch (error) {
                if (!assistant.errorMessage)
                    assistant.errorMessage = getErrorMessage(error, '同步会话失败，请刷新重试');
            }
            assistant.updateTime = now();
        }
    }
    async function submit(content, defaultModelId, files = [], supportVision = true) {
        const value = attachmentPrompt(content, files);
        if (!value || isGenerating.value || isUploading.value)
            return false;
        if (hasImageAttachment(files) && !supportVision) {
            throw new Error('当前模型不支持图片输入，请切换支持图片的模型后重试');
        }
        isUploading.value = files.length > 0;
        let fileIds;
        try {
            fileIds = [];
            for (const file of files) {
                const uploaded = await api.uploadFile(file);
                fileIds.push(uploaded.id);
            }
        }
        finally {
            isUploading.value = false;
        }
        if (activeSessionId.value === null)
            await createSession(defaultModelId);
        const sessionId = activeSessionId.value;
        if (sessionId === null)
            return false;
        const session = sessions.value.find((item) => item.id === sessionId);
        if (!session)
            return false;
        const sessionMessages = ensureMessages(sessionId);
        const userMessage = createMessage(nextId++, sessionId, 'USER', value);
        const assistantMessage = createMessage(nextId++, sessionId, 'ASSISTANT', '');
        userMessage.sequence = sessionMessages.length + 1;
        assistantMessage.sequence = sessionMessages.length + 2;
        sessionMessages.push(userMessage, assistantMessage);
        if (session.title === '新会话') {
            try {
                const updated = await api.updateSession(sessionId, { title: value.slice(0, 20) });
                const index = sessions.value.findIndex((item) => item.id === sessionId);
                if (index >= 0)
                    sessions.value[index] = updated;
            }
            catch {
                session.title = value.slice(0, 20);
            }
        }
        session.lastMessageTime = now();
        session.updateTime = now();
        await generateAssistant(sessionId, assistantMessage, value, false, fileIds);
        return true;
    }
    async function retry(messageId) {
        const sessionId = activeSessionId.value;
        if (sessionId === null || isGenerating.value)
            return;
        const sessionMessages = ensureMessages(sessionId);
        const assistant = sessionMessages.find((message) => message.id === messageId);
        const index = assistant ? sessionMessages.indexOf(assistant) : -1;
        const user = index > 0 ? sessionMessages[index - 1] : null;
        if (!assistant || assistant.role !== 'ASSISTANT' || !user || user.role !== 'USER')
            return;
        await generateAssistant(sessionId, assistant, user.content, assistant.generationTaskId !== null);
    }
    async function regenerate(messageId) {
        const sessionId = activeSessionId.value;
        if (sessionId === null || isGenerating.value)
            return;
        const assistant = ensureMessages(sessionId).find((message) => message.id === messageId);
        if (!assistant || assistant.role !== 'ASSISTANT')
            return;
        const index = ensureMessages(sessionId).indexOf(assistant);
        const user = index > 0 ? ensureMessages(sessionId)[index - 1] : null;
        if (!user || user.role !== 'USER')
            return;
        await generateAssistant(sessionId, assistant, user.content, true);
    }
    function stopGeneration() {
        generationController.value?.abort();
    }
    return {
        sessions,
        activeSessionId,
        activeSession,
        messages,
        isGenerating,
        isUploading,
        isChangingModel,
        isLoadingSessions,
        isLoadingMoreSessions,
        isLoadingSessionDetail,
        sessionsError,
        sessionDetailError,
        currentPage,
        totalPages,
        hasMoreSessions,
        loadSessions,
        loadMoreSessions,
        loadSessionDetail,
        createSession,
        selectSession,
        renameSession,
        changeModel,
        togglePinned,
        deleteSession,
        submit,
        retry,
        regenerate,
        stopGeneration,
    };
}
