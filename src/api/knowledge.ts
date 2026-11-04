import { apiRequest } from './client.js'
import type { EmbeddingModel, KnowledgeBase, KnowledgeDocument, PageResult } from '../types/chat.js'

export const knowledgeApi = {
  list(page = 1, size = 20) {
    return apiRequest<PageResult<KnowledgeBase>>(`/api/knowledge-bases?page=${page}&size=${size}`)
  },
  get(id: number) {
    return apiRequest<KnowledgeBase>(`/api/knowledge-bases/${id}`)
  },
  create(payload: { name: string; description?: string; embeddingModelId: number }) {
    return apiRequest<KnowledgeBase>('/api/knowledge-bases', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  update(id: number, payload: { name: string; description?: string }) {
    return apiRequest<KnowledgeBase>(`/api/knowledge-bases/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },
  delete(id: number) {
    return apiRequest<null>(`/api/knowledge-bases/${id}`, { method: 'DELETE' })
  },
  changeEmbeddingModel(id: number, embeddingModelId: number) {
    return apiRequest<KnowledgeBase>(`/api/knowledge-bases/${id}/embedding-model`, {
      method: 'PUT',
      body: JSON.stringify({ embeddingModelId }),
    })
  },
  listDocuments(id: number, page = 1, size = 20) {
    return apiRequest<PageResult<KnowledgeDocument>>(`/api/knowledge-bases/${id}/documents?page=${page}&size=${size}`)
  },
  addTextDocument(id: number, payload: { title: string; content: string }) {
    return apiRequest<KnowledgeDocument>(`/api/knowledge-bases/${id}/documents/text`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  uploadDocument(id: number, file: File, title?: string) {
    const body = new FormData()
    body.append('file', file)
    if (title?.trim()) body.append('title', title.trim())
    return apiRequest<KnowledgeDocument>(`/api/knowledge-bases/${id}/documents/file`, {
      method: 'POST',
      body,
    })
  },
  deleteDocument(baseId: number, documentId: number) {
    return apiRequest<null>(`/api/knowledge-bases/${baseId}/documents/${documentId}`, {
      method: 'DELETE',
    })
  },
  retryDocument(baseId: number, documentId: number) {
    return apiRequest<null>(`/api/knowledge-bases/${baseId}/documents/${documentId}/retry`, {
      method: 'POST',
    })
  },
  listEmbeddingModels() {
    return apiRequest<EmbeddingModel[]>('/api/chat/models/embedding')
  },
}
