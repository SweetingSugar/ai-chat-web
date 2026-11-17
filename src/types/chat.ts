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

export interface ChatUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  source: string
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
  usage?: ChatUsage
  sources?: KnowledgeSource[]
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
  supportVision: boolean
  defaultModel: boolean
}

export type ChatToolType = 'HTTP' | 'MCP'

export interface AvailableTool {
  toolCode: string
  toolName: string
  description: string | null
  toolType: ChatToolType
  inputSchema: unknown | null
}

export interface UploadedFile {
  id: number
  userId: number
  originalName: string
  contentType: string
  fileSize: number
  status: string
  createTime: string
  updateTime: string
}

export interface ChatStreamEvent {
  type: ChatStreamEventType
  taskId: number | null
  requestId: string
  delta: string | null
  assistantMessageId: number | null
  modelId: number | null
  modelCode: string | null
  usage: ChatUsage | null
  errorCode: string | null
  message: string | null
  sources: KnowledgeSource[] | null
}

export interface ChatRequest {
  content: string
  fileIds?: number[]
  knowledgeBaseIds?: number[]
  toolCodes?: string[]
  modelId?: number
  requestId?: string
  temperature?: number
  topP?: number
  maxOutputTokens?: number
}

export interface ChatRegenerateRequest extends Omit<ChatRequest, 'content'> {
  messageId: number
}

export interface EmbeddingModel {
  id: number
  providerId: number
  providerName: string
  modelCode: string
  modelName: string
  embeddingDimension: number
}

export type KnowledgeBaseStatus = string
export type KnowledgeDocumentSourceType = string
export type KnowledgeDocumentStatus = string

export interface KnowledgeBase {
  id: number
  name: string
  description: string | null
  embeddingModelId: number
  embeddingModelVersion: number | null
  pendingEmbeddingModelId: number | null
  pendingEmbeddingModelVersion: number | null
  activeIndexVersion: number | null
  reindexing: boolean
  status: KnowledgeBaseStatus
  createTime: string
  updateTime: string
}

export interface KnowledgeDocument {
  id: number
  title: string
  sourceType: KnowledgeDocumentSourceType
  fileId: number | null
  status: KnowledgeDocumentStatus
  indexVersion: number | null
  activeIndexVersion: number | null
  chunkCount: number | null
  errorCode: string | null
  errorMessage: string | null
  createTime: string
  updateTime: string
}

export interface KnowledgeDocumentContent {
  documentId: number
  title: string
  content: string
}

export interface FileDownloadUrl {
  fileId: number
  url: string
  expiresIn: number
}

export type KnowledgeDocumentPreview =
  | { kind: 'TEXT'; documentId: number; title: string; content: string }
  | { kind: 'FILE'; documentId: number; title: string; fileId: number; url: string }

export interface KnowledgeSource {
  knowledgeBaseId: number
  documentId: number
  chunkId: number
  title: string
  content: string
  score: number
  rank: number
}
