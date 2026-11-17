import test from 'node:test'
import assert from 'node:assert/strict'
import { CHAT_TOOL_LIMIT, toggleChatTool } from '../.tmp-tests/src/lib/toolSelection.js'

test('adds unique tool codes and removes an existing selection', () => {
  assert.deepEqual(toggleChatTool(['weather_current'], 'calendar_events'), {
    toolCodes: ['weather_current', 'calendar_events'],
    error: null,
  })
  assert.deepEqual(toggleChatTool(['weather_current', 'calendar_events'], 'weather_current'), {
    toolCodes: ['calendar_events'],
    error: null,
  })
})

test('keeps the existing selection and reports the backend-aligned twenty-tool limit', () => {
  const current = Array.from({ length: 20 }, (_, index) => `tool_${index + 1}`)

  assert.equal(CHAT_TOOL_LIMIT, 20)
  assert.deepEqual(toggleChatTool(current, 'tool_21'), {
    toolCodes: current,
    error: '最多可选择 20 个工具',
  })
})
