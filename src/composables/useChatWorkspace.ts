import { computed, reactive, ref } from 'vue'
import type { ChatMessage, ChatSession } from '../types/chat.js'

export interface ChatWorkspaceOptions {
  initialSessions?: ChatSession[]
  initialMessages?: Record<number, ChatMessage[]>
  respond?: (content: string, signal?: AbortSignal) => Promise<string>
}

const now = () => new Date().toISOString()

function createSessionRecord(id: number, title = '新会话'): ChatSession {
  const timestamp = now()
  return {
    id,
    title,
    defaultModelId: 3,
    pinned: false,
    status: 'ACTIVE',
    lastMessageTime: null,
    createTime: timestamp,
    updateTime: timestamp,
  }
}

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

export function createChatWorkspace(options: ChatWorkspaceOptions = {}) {
  const sessions = ref<ChatSession[]>([...(options.initialSessions ?? [])])
  const messagesBySession = reactive<Record<number, ChatMessage[]>>({})
  for (const [sessionId, messages] of Object.entries(options.initialMessages ?? {})) {
    messagesBySession[Number(sessionId)] = messages.map((message) => ({ ...message }))
  }

  const activeSessionId = ref<number | null>(sessions.value[0]?.id ?? null)
  const generatingSessionId = ref<number | null>(null)
  const generationController = ref<AbortController | null>(null)
  let nextId = Math.max(0, ...sessions.value.map((session) => session.id), ...Object.values(messagesBySession).flat().map((message) => message.id)) + 1

  const activeSession = computed(() => sessions.value.find((session) => session.id === activeSessionId.value) ?? null)
  const messages = computed(() => activeSessionId.value === null ? [] : messagesBySession[activeSessionId.value] ?? [])
  const isGenerating = computed(() => generatingSessionId.value === activeSessionId.value && activeSessionId.value !== null)

  function ensureMessages(sessionId: number) {
    messagesBySession[sessionId] ??= []
    return messagesBySession[sessionId]
  }

  function createSession(title?: string) {
    const session = createSessionRecord(nextId++, title?.trim() || '新会话')
    sessions.value.unshift(session)
    messagesBySession[session.id] = []
    activeSessionId.value = session.id
    return session
  }

  function selectSession(sessionId: number) {
    if (sessions.value.some((session) => session.id === sessionId)) activeSessionId.value = sessionId
  }

  function renameSession(sessionId: number, title: string) {
    const session = sessions.value.find((item) => item.id === sessionId)
    if (session && title.trim()) session.title = title.trim().slice(0, 200)
  }

  function togglePinned(sessionId: number) {
    const session = sessions.value.find((item) => item.id === sessionId)
    if (session) session.pinned = !session.pinned
  }

  function deleteSession(sessionId: number) {
    const index = sessions.value.findIndex((session) => session.id === sessionId)
    if (index < 0) return
    sessions.value.splice(index, 1)
    delete messagesBySession[sessionId]
    if (activeSessionId.value === sessionId) activeSessionId.value = sessions.value[0]?.id ?? null
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
    if (session?.title === '新会话') session.title = value.slice(0, 20)
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
