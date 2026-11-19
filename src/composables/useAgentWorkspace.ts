import { computed, ref } from 'vue'
import { agentApi } from '../api/agent.js'
import type { Agent, AgentUpsertRequest } from '../types/agent.js'

export type AgentWorkspaceApi = Pick<typeof agentApi, 'list' | 'get' | 'create' | 'update' | 'updateStatus' | 'delete'>

export interface AgentWorkspaceOptions {
  api?: AgentWorkspaceApi
  pageSize?: number
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export function createAgentWorkspace(options: AgentWorkspaceOptions = {}) {
  const api = options.api ?? agentApi
  const pageSize = options.pageSize ?? 20
  const agents = ref<Agent[]>([])
  const agentsError = ref<string | null>(null)
  const isLoadingAgents = ref(false)
  const isLoadingMoreAgents = ref(false)
  const isMutating = ref(false)
  const currentPage = ref(0)
  const totalPages = ref(0)
  const hasMoreAgents = computed(() => currentPage.value < totalPages.value)

  function replaceAgent(next: Agent) {
    const index = agents.value.findIndex((agent) => agent.id === next.id)
    if (index >= 0) agents.value[index] = next
  }

  async function loadAgents() {
    if (isLoadingAgents.value) return
    isLoadingAgents.value = true
    agentsError.value = null
    try {
      const result = await api.list(1, pageSize)
      agents.value = result.records
      currentPage.value = result.current
      totalPages.value = result.pages
      return result
    } catch (error) {
      agents.value = []
      currentPage.value = 0
      totalPages.value = 0
      agentsError.value = errorMessage(error, '加载 Agent 失败，请重试')
      throw error
    } finally {
      isLoadingAgents.value = false
    }
  }

  async function loadMoreAgents() {
    if (isLoadingAgents.value || isLoadingMoreAgents.value || !hasMoreAgents.value) return
    isLoadingMoreAgents.value = true
    agentsError.value = null
    try {
      const result = await api.list(currentPage.value + 1, pageSize)
      agents.value.push(...result.records)
      currentPage.value = result.current
      totalPages.value = result.pages
      return result
    } catch (error) {
      agentsError.value = errorMessage(error, '加载更多 Agent 失败，请重试')
      throw error
    } finally {
      isLoadingMoreAgents.value = false
    }
  }

  async function runMutation<T>(action: () => Promise<T>) {
    if (isMutating.value) return undefined
    isMutating.value = true
    try {
      return await action()
    } finally {
      isMutating.value = false
    }
  }

  async function createAgent(payload: AgentUpsertRequest) {
    return runMutation(async () => {
      const created = await api.create(payload)
      agents.value.unshift(created)
      return created
    })
  }

  async function updateAgent(id: number, payload: AgentUpsertRequest) {
    return runMutation(async () => {
      const updated = await api.update(id, payload)
      replaceAgent(updated)
      return updated
    })
  }

  async function updateStatus(id: number, status: number) {
    return runMutation(async () => {
      const updated = await api.updateStatus(id, status)
      replaceAgent(updated)
      return updated
    })
  }

  async function deleteAgent(id: number) {
    return runMutation(async () => {
      await api.delete(id)
      agents.value = agents.value.filter((agent) => agent.id !== id)
    })
  }

  return {
    agents,
    agentsError,
    isLoadingAgents,
    isLoadingMoreAgents,
    isMutating,
    currentPage,
    totalPages,
    hasMoreAgents,
    loadAgents,
    loadMoreAgents,
    createAgent,
    updateAgent,
    updateStatus,
    deleteAgent,
  }
}
