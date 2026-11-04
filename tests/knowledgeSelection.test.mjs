import test from 'node:test'
import assert from 'node:assert/strict'
import { KNOWLEDGE_BASE_LIMIT, toggleKnowledgeBase } from '../.tmp-tests/src/lib/knowledgeSelection.js'

test('selects unique knowledge bases up to ten and reports the limit', () => {
  const firstNine = Array.from({ length: 9 }, (_, index) => index + 1)

  assert.deepEqual(toggleKnowledgeBase(firstNine, 10), { ids: [...firstNine, 10], error: null })
  assert.deepEqual(toggleKnowledgeBase([...firstNine, 10], 11), {
    ids: [...firstNine, 10],
    error: '最多可选择 10 个知识库',
  })
  assert.equal(KNOWLEDGE_BASE_LIMIT, 10)
})

test('removes an already-selected knowledge base', () => {
  assert.deepEqual(toggleKnowledgeBase([3, 4, 5], 4), { ids: [3, 5], error: null })
})
