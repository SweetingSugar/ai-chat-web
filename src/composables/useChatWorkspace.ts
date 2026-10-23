import { computed, reactive, ref } from 'vue'
import { chatApi } from '../api/chat.js'
import type { ChatMessage, ChatSession } from '../types/chat.js'

export type ChatWorkspaceApi = Pick<
  typeof chatApi,
  'listSessions' | 'createSession' | 'getSession' | 'updateSession' | 'pinSession' | 'deleteSession'
>

export interface ChatWorkspaceOptions {
  api?: ChatWorkspaceApi
  initialSessions?: ChatSession[]
  initialMessages?: Record<number, ChatMessage[]>
  respond?: (content: string, signal?: AbortSignal) => Promise<string>
  pageSize?: number
}

const now = () => new Date().toISOString()

function createMessage(id: number, sessionId: number, role: ChatMessage['role'], content: string): ChatMessage {
  const timestamp = now()
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
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export function createChatWorkspace(options: ChatWorkspaceOptions = {}) {
  const api = options.api ?? chatApi
  const pageSize = options.pageSize ?? 20
  const sessions = ref<ChatSession[]>([...(options.initialSessions ?? [])])
  const messagesBySession = reactive<Record<number, ChatMessage[]>>({})
  for (const [sessionId, messages] of Object.entries(options.initialMessages ?? {})) {
    messagesBySession[Number(sessionId)] = messages.map((message) => ({ ...message }))
  }

  const activeSessionId = ref<number | null>(sessions.value[0]?.id ?? null)
  const generatingSessionId = ref<number | null>(null)
  const generationController = ref<AbortController | null>(null)
  const isLoadingSessions = ref(false)
  const isLoadingMoreSessions = ref(false)
  const isLoadingSessionDetail = ref(false)
  const sessionsError = ref<string | null>(null)
  const sessionDetailError = ref<string | null>(null)
  const currentPage = ref(0)
  const totalPages = ref(0)
  let detailRequestId = 0
  let nextId = Math.max(0, ...sessions.value.map((session) => session.id), ...Object.values(messagesBySession).flat().map((message) => message.id)) + 1

  const activeSession = computed(() => sessions.value.find((session) => session.id === activeSessionId.value) ?? null)
  const messages = computed(() => activeSessionId.value === null ? [] : messagesBySession[activeSessionId.value] ?? [])
  const isGenerating = computed(() => generatingSessionId.value === activeSessionId.value && activeSessionId.value !== null)
  const hasMoreSessions = computed(() => currentPage.value < totalPages.value)

  function ensureMessages(sessionId: number) {
    messagesBySession[sessionId] ??= []
    return messagesBySession[sessionId]
  }

  async function loadSessionDetail(sessionId: number) {
    const requestId = ++detailRequestId
    isLoadingSessionDetail.value = true
    sessionDetailError.value = null
    try {
      const detail = await api.getSession(sessionId)
      if (requestId !== detailRequestId) return detail
      const sessionIndex = sessions.value.findIndex((session) => session.id === sessionId)
      if (sessionIndex >= 0) sessions.value[sessionIndex] = detail.session
      messagesBySession[sessionId] = detail.messages.map((message) => ({ ...message }))
      activeSessionId.value = sessionId
      return detail
    } catch (error) {
      if (requestId === detailRequestId) sessionDetailError.value = getErrorMessage(error, '加载会话失败，请重试')
      throw error
    } finally {
      if (requestId === detailRequestId) isLoadingSessionDetail.value = false
    }
  }

  async function loadSessions() {
    if (isLoadingSessions.value) return
    isLoadingSessions.value = true
    sessionsError.value = null
    sessionDetailError.value = null
    detailRequestId++
    currentPage.value = 0
    totalPages.value = 0
    activeSessionId.value = null
    for (const key of Object.keys(messagesBySession)) delete messagesBySession[Number(key)]
    try {
      const result = await api.listSessions(1, pageSize)
      sessions.value = [...result.records]
      currentPage.value = result.current
      totalPages.value = result.pages
    } catch (error) {
      sessions.value = []
      sessionsError.value = getErrorMessage(error, '加载会话失败，请重试')
      isLoadingSessions.value = false
      return
    }
    isLoadingSessions.value = false
    if (sessions.value[0]) {
      try {
        await loadSessionDetail(sessions.value[0].id)
      } catch {
        // The list is still usable when only the initial detail request fails.
      }
    }
  }

  async function loadMoreSessions() {
    if (isLoadingSessions.value || isLoadingMoreSessions.value || !hasMoreSessions.value) return
    isLoadingMoreSessions.value = true
    sessionsError.value = null
    const nextPage = currentPage.value + 1
    try {
      const result = await api.listSessions(nextPage, pageSize)
      sessions.value.push(...result.records)
      currentPage.value = result.current
      totalPages.value = result.pages
    } catch (error) {
      sessionsError.value = getErrorMessage(error, '加载更多会话失败，请重试')
      throw error
    } finally {
      isLoadingMoreSessions.value = false
    }
  }

  async function createSession() {
    sessionsError.value = null
    try {
      const session = await api.createSession()
      sessions.value.unshift(session)
      messagesBySession[session.id] = []
      activeSessionId.value = session.id
      sessionDetailError.value = null
      return session
    } catch (error) {
      sessionsError.value = getErrorMessage(error, '创建会话失败，请重试')
      throw error
    }
  }

  async function selectSession(sessionId: number) {
    if (!sessions.value.some((session) => session.id === sessionId)) return
    activeSessionId.value = sessionId
    await loadSessionDetail(sessionId)
  }

  async function renameSession(sessionId: number, title: string) {
    const value = title.trim().slice(0, 200)
    if (!value) return
    sessionsError.value = null
    try {
      const updated = await api.updateSession(sessionId, { title: value })
      const index = sessions.value.findIndex((session) => session.id === sessionId)
      if (index >= 0) sessions.value[index] = updated
      return updated
    } catch (error) {
      sessionsError.value = getErrorMessage(error, '重命名失败，请重试')
      throw error
    }
  }

  async function togglePinned(sessionId: number) {
    const session = sessions.value.find((item) => item.id === sessionId)
    if (!session) return
    sessionsError.value = null
    try {
      const updated = await api.pinSession(sessionId, !session.pinned)
      const index = sessions.value.findIndex((item) => item.id === sessionId)
      if (index >= 0) sessions.value[index] = updated
      return updated
    } catch (error) {
      sessionsError.value = getErrorMessage(error, '置顶操作失败，请重试')
      throw error
    }
  }

  async function deleteSession(sessionId: number) {
    sessionsError.value = null
    try {
      await api.deleteSession(sessionId)
      const index = sessions.value.findIndex((session) => session.id === sessionId)
      if (index < 0) return
      sessions.value.splice(index, 1)
      delete messagesBySession[sessionId]
      if (activeSessionId.value === sessionId) {
        const nextSession = sessions.value[0]
        if (nextSession) {
          activeSessionId.value = nextSession.id
          await loadSessionDetail(nextSession.id)
        } else {
          activeSessionId.value = null
          sessionDetailError.value = null
        }
      }
    } catch (error) {
      sessionsError.value = getErrorMessage(error, '删除会话失败，请重试')
      throw error
    }
  }

  async function generateAssistant(sessionId: number, assistant: ChatMessage, content: string) {
    const respond = options.respond ?? (async (value: string) => `已收到：${value}`)
    generatingSessionId.value = sessionId
    generationController.value = new AbortController()
    assistant.status = 'STREAMING'
    assistant.content = ''
    assistant.errorMessage = null
    try {
      assistant.content = await respond(content, generationController.value.signal)
      assistant.status = 'COMPLETED'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        assistant.status = 'INTERRUPTED'
        assistant.errorMessage = '已停止生成'
      } else {
        assistant.status = 'FAILED'
        assistant.errorMessage = error instanceof Error ? error.message : '生成失败，请稍后重试'
      }
    } finally {
      assistant.updateTime = now()
      generatingSessionId.value = null
      generationController.value = null
    }
  }

  async function submit(content: string) {
    const value = content.trim()
    if (!value || !activeSessionId.value || isGenerating.value) return
    const sessionId = activeSessionId.value
    const session = sessions.value.find((item) => item.id === sessionId)
    const sessionMessages = ensureMessages(sessionId)
    const userMessage = createMessage(nextId++, sessionId, 'USER', value)
    const assistantMessage = createMessage(nextId++, sessionId, 'ASSISTANT', '')
    userMessage.sequence = sessionMessages.length + 1
    assistantMessage.sequence = sessionMessages.length + 2
    sessionMessages.push(userMessage, assistantMessage)
    if (session) {
      session.lastMessageTime = now()
      session.updateTime = now()
    }
    await generateAssistant(sessionId, assistantMessage, value)
  }

  async function retry(messageId: number) {
    const sessionId = activeSessionId.value
    if (!sessionId || isGenerating.value) return
    const sessionMessages = ensureMessages(sessionId)
    const assistant = sessionMessages.find((message) => message.id === messageId)
    const index = assistant ? sessionMessages.indexOf(assistant) : -1
    const user = index > 0 ? sessionMessages[index - 1] : null
    if (!assistant || assistant.role !== 'ASSISTANT' || !user || user.role !== 'USER') return
    await generateAssistant(sessionId, assistant, user.content)
  }

  async function regenerate(messageId: number) {
    await retry(messageId)
  }

  function stopGeneration() {
    generationController.value?.abort()
  }

  return {
    sessions,
    activeSessionId,
    activeSession,
    messages,
    isGenerating,
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
    togglePinned,
    deleteSession,
    submit,
    retry,
    regenerate,
    stopGeneration,
  }
}
