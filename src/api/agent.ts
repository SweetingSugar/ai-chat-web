import { apiRequest } from './client.js'
import type { PageResult } from '../types/chat.js'
import type { Agent, AgentUpsertRequest } from '../types/agent.js'

export const agentApi = {
  list(page = 1, size = 20) {
    return apiRequest<PageResult<Agent>>(`/api/agents?page=${page}&size=${size}`)
  },
  get(id: number) {
    return apiRequest<Agent>(`/api/agents/${id}`)
  },
  create(payload: AgentUpsertRequest) {
    return apiRequest<Agent>('/api/agents', { method: 'POST', body: JSON.stringify(payload) })
  },
  update(id: number, payload: AgentUpsertRequest) {
    return apiRequest<Agent>(`/api/agents/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
  },
  updateStatus(id: number, status: number) {
    return apiRequest<Agent>(`/api/agents/${id}/status`, {
      method: 'PATCH', body: JSON.stringify({ status }),
    })
  },
  delete(id: number) {
    return apiRequest<null>(`/api/agents/${id}`, { method: 'DELETE' })
  },
}
