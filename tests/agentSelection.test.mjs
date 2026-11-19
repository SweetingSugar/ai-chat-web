import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AGENT_KNOWLEDGE_BASE_LIMIT,
  AGENT_TOOL_LIMIT,
  toggleAgentKnowledgeBase,
  toggleAgentTool,
} from '../.tmp-tests/src/lib/agentSelection.js'

test('toggles Agent knowledge-base IDs and enforces the ten-item limit', () => {
  assert.deepEqual(toggleAgentKnowledgeBase([1], 2), { ids: [1, 2], error: null })
  assert.deepEqual(toggleAgentKnowledgeBase([1, 2], 1), { ids: [2], error: null })
  const full = Array.from({ length: 10 }, (_, index) => index + 1)
  assert.equal(AGENT_KNOWLEDGE_BASE_LIMIT, 10)
  assert.deepEqual(toggleAgentKnowledgeBase(full, 11), { ids: full, error: '最多可选择 10 个知识库' })
})

test('toggles Agent tool codes and enforces the twenty-item limit', () => {
  assert.deepEqual(toggleAgentTool(['weather_current'], 'order_query'), {
    toolCodes: ['weather_current', 'order_query'], error: null,
  })
  const full = Array.from({ length: 20 }, (_, index) => `tool_${index + 1}`)
  assert.equal(AGENT_TOOL_LIMIT, 20)
  assert.deepEqual(toggleAgentTool(full, 'tool_21'), { toolCodes: full, error: '最多可选择 20 个工具' })
})
