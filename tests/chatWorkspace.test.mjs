import test from 'node:test'
import assert from 'node:assert/strict'
import { createChatWorkspace } from '../.tmp-tests/src/composables/useChatWorkspace.js'

const session = (id, title) => ({
  id,
  title,
  defaultModelId: 3,
  pinned: false,
  status: 'ACTIVE',
  lastMessageTime: null,
  createTime: '2026-10-23T10:00:00',
  updateTime: '2026-10-23T10:00:00',
})

function createFakeApi({ pages = [], details = {} } = {}) {
  const calls = []
  return {
    calls,
    listSessions: async (page, size) => {
      calls.push(['listSessions', page, size])
      return pages[page - 1] ?? { records: [], total: 0, current: page, size, pages: page - 1 }
    },
    createSession: async () => {
      calls.push(['createSession'])
      return session(99, '服务端新会话')
    },
    getSession: async (id) => {
      calls.push(['getSession', id])
      return details[id] ?? { session: session(id, `会话 ${id}`), messages: [] }
    },
    updateSession: async (id, payload) => {
      calls.push(['updateSession', id, payload])
      return { ...session(id, payload.title ?? `会话 ${id}`), ...payload }
    },
    pinSession: async (id, pinned) => {
      calls.push(['pinSession', id, pinned])
      return { ...session(id, `会话 ${id}`), pinned }
    },
    deleteSession: async (id) => {
      calls.push(['deleteSession', id])
      return null
    },
  }
}

test('creates a session and makes it the active conversation', async () => {
  const api = createFakeApi()
  const workspace = createChatWorkspace({ api, initialSessions: [] })

  const created = await workspace.createSession()

  assert.equal(workspace.activeSessionId.value, created.id)
  assert.equal(workspace.activeSession.value.title, '服务端新会话')
  assert.equal(workspace.sessions.value.length, 1)
  assert.deepEqual(api.calls, [['createSession']])
})

test('loads the first page and its first session detail', async () => {
  const api = createFakeApi({
    pages: [{ records: [session(1, '第一条')], total: 1, current: 1, size: 20, pages: 1 }],
  })
  const workspace = createChatWorkspace({ api })

  await workspace.loadSessions()

  assert.deepEqual(api.calls, [['listSessions', 1, 20], ['getSession', 1]])
  assert.equal(workspace.activeSessionId.value, 1)
  assert.equal(workspace.sessions.value[0].title, '会话 1')
})

test('appends the next page and stops after the last page', async () => {
  const api = createFakeApi({
    pages: [
      { records: [session(1, '一')], total: 2, current: 1, size: 1, pages: 2 },
      { records: [session(2, '二')], total: 2, current: 2, size: 1, pages: 2 },
    ],
  })
  const workspace = createChatWorkspace({ api, pageSize: 1 })

  await workspace.loadSessions()
  await workspace.loadMoreSessions()
  await workspace.loadMoreSessions()

  assert.deepEqual(workspace.sessions.value.map(({ id }) => id), [1, 2])
  assert.deepEqual(api.calls.filter(([name]) => name === 'listSessions'), [
    ['listSessions', 1, 1],
    ['listSessions', 2, 1],
  ])
})

test('selects a session and loads its messages', async () => {
  const api = createFakeApi({
    pages: [{ records: [session(1, '一'), session(2, '二')], total: 2, current: 1, size: 20, pages: 1 }],
    details: {
      2: { session: session(2, '第二条详情'), messages: [{ id: 10, sessionId: 2, role: 'USER', content: '你好' }] },
    },
  })
  const workspace = createChatWorkspace({ api })
  await workspace.loadSessions()

  await workspace.selectSession(2)

  assert.equal(workspace.activeSessionId.value, 2)
  assert.equal(workspace.activeSession.value.title, '第二条详情')
  assert.equal(workspace.messages.value[0].content, '你好')
})

test('persists rename, pin, and delete through the API', async () => {
  const api = createFakeApi({
    pages: [{ records: [session(1, '旧标题')], total: 1, current: 1, size: 20, pages: 1 }],
  })
  const workspace = createChatWorkspace({ api })
  await workspace.loadSessions()

  await workspace.renameSession(1, '新标题')
  await workspace.togglePinned(1)
  await workspace.deleteSession(1)

  assert.deepEqual(api.calls.slice(2), [
    ['updateSession', 1, { title: '新标题' }],
    ['pinSession', 1, true],
    ['deleteSession', 1],
  ])
  assert.equal(workspace.sessions.value.length, 0)
  assert.equal(workspace.activeSessionId.value, null)
})

test('does not let a stale detail response replace the latest selection', async () => {
  let releaseFirst
  const firstDetail = new Promise((resolve) => { releaseFirst = resolve })
  const api = createFakeApi({
    pages: [{ records: [session(1, '一'), session(2, '二')], total: 2, current: 1, size: 20, pages: 1 }],
  })
  api.getSession = async (id) => {
    if (id === 1) return firstDetail
    return { session: session(2, '二'), messages: [] }
  }
  const workspace = createChatWorkspace({ api })
  const loading = workspace.loadSessions()
  await new Promise((resolve) => setImmediate(resolve))
  await workspace.selectSession(2)
  releaseFirst({ session: session(1, '一'), messages: [] })
  await loading

  assert.equal(workspace.activeSessionId.value, 2)
})

test('submits a message and completes the assistant response', async () => {
  const workspace = createChatWorkspace({
    api: createFakeApi(),
    initialSessions: [session(1, '新会话')],
    respond: async (content) => `已回答：${content}`,
  })

  await workspace.submit('你好')

  assert.equal(workspace.messages.value.length, 2)
  assert.equal(workspace.messages.value[0].content, '你好')
  assert.equal(workspace.messages.value[1].content, '已回答：你好')
  assert.equal(workspace.messages.value[1].status, 'COMPLETED')
  assert.equal(workspace.isGenerating.value, false)
})

test('keeps a failed assistant message and restores the composer after an error', async () => {
  const workspace = createChatWorkspace({
    api: createFakeApi(),
    initialSessions: [session(1, '新会话')],
    respond: async () => { throw new Error('provider unavailable') },
  })

  await workspace.submit('请重试')

  const failedMessage = workspace.messages.value[1]
  assert.equal(failedMessage.status, 'FAILED')
  assert.equal(failedMessage.errorMessage, 'provider unavailable')
  assert.equal(workspace.isGenerating.value, false)
})
