export const AGENT_KNOWLEDGE_BASE_LIMIT = 10
export const AGENT_TOOL_LIMIT = 20

export function toggleAgentKnowledgeBase(current: number[], id: number) {
  if (current.includes(id)) return { ids: current.filter((item) => item !== id), error: null }
  if (current.length >= AGENT_KNOWLEDGE_BASE_LIMIT) {
    return { ids: [...current], error: `最多可选择 ${AGENT_KNOWLEDGE_BASE_LIMIT} 个知识库` }
  }
  return { ids: [...current, id], error: null }
}

export function toggleAgentTool(current: string[], toolCode: string) {
  if (current.includes(toolCode)) return { toolCodes: current.filter((item) => item !== toolCode), error: null }
  if (current.length >= AGENT_TOOL_LIMIT) {
    return { toolCodes: [...current], error: `最多可选择 ${AGENT_TOOL_LIMIT} 个工具` }
  }
  return { toolCodes: [...current, toolCode], error: null }
}
