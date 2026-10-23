import { apiRequest, apiStream } from './client.js'
import { SseParser } from '../lib/sseParser.js'
import type {
  ApiResponse,
  ChatMessage,
  ChatRegenerateRequest,
  ChatRequest,
  ChatSession,
  ChatSessionDetail,
  ChatStreamEvent,
  ModelSummary,
  PageResult,
} from '../types/chat.js'

export const chatApi = {
  listSessions(page = 1, size = 20) {
    return apiRequest<PageResult<ChatSession>>(`/api/chat/sessions?page=${page}&size=${size}`)
  },
  createSession(title?: string, defaultModelId?: number) {
    return apiRequest<ChatSession>('/api/chat/sessions', {
      method: 'POST',
      body: JSON.stringify({ title, defaultModelId }),
    })
  },
  getSession(id: number) {
    return apiRequest<ChatSessionDetail>(`/api/chat/sessions/${id}`)
  },
  updateSession(id: number, payload: { title?: string; defaultModelId?: number }) {
    return apiRequest<ChatSession>(`/api/chat/sessions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },
  pinSession(id: number, pinned: boolean) {
    return apiRequest<ChatSession>(`/api/chat/sessions/${id}/pin?pinned=${pinned}`, { method: 'PUT' })
  },
  deleteSession(id: number) {
    return apiRequest<null>(`/api/chat/sessions/${id}`, { method: 'DELETE' })
  },
  listMessages(id: number, page = 1, size = 20) {
    return apiRequest<PageResult<ChatMessage>>(`/api/chat/sessions/${id}/messages?page=${page}&size=${size}`)
  },
  stream(id: number, payload: ChatRequest, signal?: AbortSignal) {
    return apiStream(`/api/chat/sessions/${id}/stream`, payload, signal)
  },
  regenerate(id: number, payload: ChatRegenerateRequest, signal?: AbortSignal) {
    return apiStream(`/api/chat/sessions/${id}/regenerate`, payload, signal)
  },
  readStream: readChatStream,
  listModels() {
    return apiRequest<ModelSummary[]>('/api/chat/models')
  },
}

export async function readChatStream(response: Response, onEvent: (event: ChatStreamEvent) => void) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('当前浏览器不支持流式响应')

  const decoder = new TextDecoder()
  const parser = new SseParser()

  const deliver = (events: ReturnType<SseParser['push']>) => {
    for (const event of events) {
      if (!event.data) continue
      let parsed: unknown
      try {
        parsed = JSON.parse(event.data)
      } catch {
        throw new Error('无法解析流式事件')
      }
      if (!parsed || typeof parsed !== 'object' || typeof (parsed as { type?: unknown }).type !== 'string') {
        throw new Error('无法解析流式事件')
      }
      onEvent(parsed as ChatStreamEvent)
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    deliver(parser.push(decoder.decode(value ?? new Uint8Array(), { stream: !done })))
    if (done) break
  }
  deliver(parser.finish())
}
