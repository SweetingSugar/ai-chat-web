export interface Agent {
  id: number
  name: string
  description: string | null
  systemPrompt: string
  modelId: number
  knowledgeBaseIds: number[]
  toolCodes: string[]
  status: number
  createTime: string
  updateTime: string
}

export interface AgentUpsertRequest {
  name: string
  description?: string
  systemPrompt: string
  modelId: number
  knowledgeBaseIds: number[]
  toolCodes: string[]
}

export type AgentSummary = Pick<Agent, 'id' | 'name' | 'description' | 'modelId' | 'knowledgeBaseIds' | 'toolCodes' | 'status'>
