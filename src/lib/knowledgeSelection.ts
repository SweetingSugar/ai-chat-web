export const KNOWLEDGE_BASE_LIMIT = 10

export function toggleKnowledgeBase(current: number[], id: number) {
  if (current.includes(id)) return { ids: current.filter((item) => item !== id), error: null }
  if (current.length >= KNOWLEDGE_BASE_LIMIT) {
    return { ids: [...current], error: `最多可选择 ${KNOWLEDGE_BASE_LIMIT} 个知识库` }
  }
  return { ids: [...current, id], error: null }
}
