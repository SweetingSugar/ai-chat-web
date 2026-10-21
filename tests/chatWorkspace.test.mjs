import test from 'node:test'
import assert from 'node:assert/strict'
import { createChatWorkspace } from '../.tmp-tests/src/composables/useChatWorkspace.js'

test('creates a session and makes it the active conversation', () => {
  const workspace = createChatWorkspace({ initialSessions: [] })

  const session = workspace.createSession()

  assert.equal(workspace.activeSessionId.value, session.id)
  assert.equal(workspace.activeSession.value.title, '新会话')
  assert.equal(workspace.sessions.value.length, 1)
})

test('submits a message and completes the assistant response', async () => {
  const workspace = createChatWorkspace({
    initialSessions: [],
    respond: async (content) => `已回答：${content}`,
  })
  workspace.createSession()

  await workspace.submit('你好')

  assert.equal(workspace.messages.value.length, 2)
  assert.equal(workspace.messages.value[0].content, '你好')
  assert.equal(workspace.messages.value[1].content, '已回答：你好')
  assert.equal(workspace.messages.value[1].status, 'COMPLETED')
  assert.equal(workspace.isGenerating.value, false)
})

test('keeps a failed assistant message and restores the composer after an error', async () => {
  const workspace = createChatWorkspace({
    initialSessions: [],
    respond: async () => { throw new Error('provider unavailable') },
  })
  workspace.createSession()

  await workspace.submit('请重试')

  const failedMessage = workspace.messages.value[1]
  assert.equal(failedMessage.status, 'FAILED')
  assert.equal(failedMessage.errorMessage, 'provider unavailable')
  assert.equal(workspace.isGenerating.value, false)
})
