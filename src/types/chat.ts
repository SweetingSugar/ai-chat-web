export type ChatSessionStatus = 'ACTIVE' | 'ARCHIVED'
export type ChatMessageRole = 'USER' | 'ASSISTANT'
export type ChatMessageStatus = 'PENDING' | 'STREAMING' | 'COMPLETED' | 'FAILED' | 'INTERRUPTED'
export type ChatStreamEventType = 'START' | 'DELTA' | 'COMPLETE' | 'FAILED' | 'INTERRUPTED'

export interface ApiResponse<T> {
  success: boolean
  code: string
  message: string
  data: T
}

export interface PageResult<T> {
  records: T[]
  total: number
  current: number
  size: number
  pages: number
}

export interface User {
  id: number
  username: string
  nickname: string | null
  email: string | null
  phone: string | null
  avatar: string | null
  status: number
  lastLoginTime: string | null
  createTime: string
}

export interface LoginData {
  tokenName: string
  tokenValue: string
  user: User
}

export interface ChatSession {
  id: number
  title: string
  defaultModelId: number
  pinned: boolean
  status: ChatSessionStatus
  lastMessageTime: string | null
  createTime: string
  updateTime: string
}

export interface ChatMessage {
  id: number
  sessionId: number
  role: ChatMessageRole
  content: string
  sequence: number
  status: ChatMessageStatus
  generationTaskId: number | null
  requestId: string | null
  modelId: number | null
  errorCode: string | null
  errorMessage: string | null
  createTime: string
  updateTime: string
}

export interface ChatSessionDetail {
  session: ChatSession
  messages: ChatMessage[]
}

export interface ModelSummary {
  id: number
  providerName: string
  modelCode: string
  modelName: string
  contextWindow: number | null
  maxOutputTokens: number | null
  supportStream: boolean
  defaultModel: boolean
}

export interface ChatStreamEvent {
  type: ChatStreamEventType
  taskId: number | null
  requestId: string
  delta: string | null
  assistantMessageId: number | null
  modelId: number | null
  modelCode: string | null
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    source: string
  } | null
  errorCode: string | null
  message: string | null
}

export interface ChatRequest {
  content: string
  modelId?: number
  requestId?: string
  temperature?: number
  topP?: number
  maxOutputTokens?: number
}

export interface ChatRegenerateRequest extends Omit<ChatRequest, 'content'> {
  messageId: number
}
