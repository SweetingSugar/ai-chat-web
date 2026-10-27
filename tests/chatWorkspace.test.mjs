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

function createFakeApi({ pages = [], details = {}, streamEvents = [], regenerateEvents = [], updateSessionError = null } = {}) {
  const calls = []
  const responseEvents = new WeakMap()
  const response = (events) => {
    const value = new Response(null, { headers: { 'Content-Type': 'text/event-stream' } })
    responseEvents.set(value, events)
    return value
  }
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
      if (updateSessionError) throw updateSessionError
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
    stream: async (id, payload) => {
      calls.push(['stream', id, payload])
      return response(streamEvents)
    },
    regenerate: async (id, payload) => {
      calls.push(['regenerate', id, payload])
      return response(regenerateEvents)
    },
    readStream: async (streamResponse, onEvent) => {
      for (const event of responseEvents.get(streamResponse) ?? []) onEvent(event)
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

test('streams deltas, completes the assistant, and synchronizes server messages', async () => {
  const serverMessages = [
    { id: 10, sessionId: 1, role: 'USER', content: '你好', sequence: 1, status: 'COMPLETED' },
    { id: 11, sessionId: 1, role: 'ASSISTANT', content: '你好', sequence: 2, status: 'COMPLETED', generationTaskId: 50, usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6, source: 'ESTIMATED' } },
  ]
  const api = createFakeApi({
    details: { 1: { session: session(1, '你好'), messages: serverMessages } },
    streamEvents: [
      { type: 'START', requestId: 'req-1', taskId: 50, assistantMessageId: 11, modelId: 3 },
      { type: 'DELTA', requestId: 'req-1', taskId: 50, assistantMessageId: 11, delta: '你' },
      { type: 'DELTA', requestId: 'req-1', taskId: 50, assistantMessageId: 11, delta: '好' },
      { type: 'COMPLETE', requestId: 'req-1', taskId: 50, assistantMessageId: 11, usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6, source: 'ESTIMATED' } },
    ],
  })
  const workspace = createChatWorkspace({ api, initialSessions: [session(1, '新会话')] })

  await workspace.submit('你好')

  assert.equal(workspace.messages.value[0].content, '你好')
  assert.equal(workspace.messages.value[1].content, '你好')
  assert.equal(workspace.messages.value[1].status, 'COMPLETED')
  assert.equal(workspace.messages.value[1].generationTaskId, 50)
  assert.equal(workspace.messages.value[1].usage.totalTokens, 6)
  assert.equal(workspace.isGenerating.value, false)
  const streamCall = api.calls.find(([name]) => name === 'stream')
  assert.equal(streamCall[1], 1)
  assert.equal(streamCall[2].content, '你好')
  assert.equal(streamCall[2].modelId, 3)
  assert.match(streamCall[2].requestId, /^[0-9a-f-]{36}$/)
})

test('creates a session before sending from the empty workspace', async () => {
  const api = createFakeApi({
    streamEvents: [{ type: 'FAILED', requestId: 'req-1', errorCode: 'AI_PROVIDER_ERROR', message: 'provider unavailable' }],
    details: { 99: { session: session(99, '服务端新会话'), messages: [] } },
  })
  const workspace = createChatWorkspace({ api, initialSessions: [] })

  await workspace.submit('你好')

  assert.deepEqual(api.calls.slice(0, 2).map(([name]) => name), ['createSession', 'stream'])
  assert.equal(api.calls.find(([name]) => name === 'stream')[1], 99)
})

test('uses the selected model when first sending from an empty workspace', async () => {
  const api = createFakeApi({
    streamEvents: [{ type: 'FAILED', requestId: 'req-1', errorCode: 'AI_PROVIDER_ERROR', message: 'provider unavailable' }],
    details: { 99: { session: { ...session(99, '服务端新会话'), defaultModelId: 8 }, messages: [] } },
  })
  api.createSession = async (title, defaultModelId) => {
    api.calls.push(['createSession', title, defaultModelId])
    return { ...session(99, '服务端新会话'), defaultModelId }
  }
  const workspace = createChatWorkspace({ api, initialSessions: [] })

  await workspace.submit('你好', 8)

  assert.deepEqual(api.calls[0], ['createSession', undefined, 8])
  assert.equal(workspace.activeSession.value.defaultModelId, 8)
  assert.equal(api.calls.find(([name]) => name === 'stream')[2].modelId, 8)
})

test('syncs the persisted interrupted message after stopping a stream', async () => {
  const api = createFakeApi({
    details: { 1: { session: session(1, '会话 1'), messages: [{ id: 21, sessionId: 1, role: 'ASSISTANT', content: '已收到一部分', status: 'INTERRUPTED', errorMessage: 'Chat stream interrupted' }] } },
  })
  api.stream = async (_id, _payload, signal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
  })
  const workspace = createChatWorkspace({ api, initialSessions: [session(1, '会话 1')] })
  const submitting = workspace.submit('停止我')
  await new Promise((resolve) => setImmediate(resolve))
  workspace.stopGeneration()
  await submitting

  assert.equal(workspace.messages.value[0].status, 'INTERRUPTED')
  assert.equal(workspace.isGenerating.value, false)
})

test('does not submit a second message while the current session is generating', async () => {
  const api = createFakeApi({
    streamEvents: [],
  })
  let release
  api.stream = async (id, payload) => {
    api.calls.push(['stream', id, payload])
    return new Promise((resolve) => { release = resolve })
  }
  const workspace = createChatWorkspace({ api, initialSessions: [session(1, '会话 1')] })
  const first = workspace.submit('第一条')
  await new Promise((resolve) => setImmediate(resolve))
  await workspace.submit('第二条')

  assert.equal(api.calls.filter(([name]) => name === 'stream').length, 1)
  release(new Response(null, { headers: { 'Content-Type': 'text/event-stream' } }))
  await first
})

test('keeps a failed assistant message and restores the composer after an SSE error', async () => {
  const api = createFakeApi({
    streamEvents: [{ type: 'FAILED', requestId: 'req-1', errorCode: 'AI_PROVIDER_ERROR', message: 'provider unavailable' }],
    details: { 1: { session: session(1, '新会话'), messages: [{ id: 20, sessionId: 1, role: 'ASSISTANT', content: '', status: 'FAILED', errorCode: 'AI_PROVIDER_ERROR', errorMessage: 'provider unavailable' }] } },
  })
  const workspace = createChatWorkspace({ api, initialSessions: [session(1, '新会话')] })

  await workspace.submit('请重试')

  assert.equal(workspace.messages.value[0].status, 'FAILED')
  assert.equal(workspace.messages.value[0].errorMessage, 'provider unavailable')
  assert.equal(workspace.isGenerating.value, false)
})

test('regenerates a persisted assistant message through the regenerate endpoint', async () => {
  const assistant = { id: 20, sessionId: 1, role: 'ASSISTANT', content: '旧回答', status: 'COMPLETED', generationTaskId: 7 }
  const api = createFakeApi({
    details: { 1: { session: session(1, '会话 1'), messages: [
      { id: 19, sessionId: 1, role: 'USER', content: '问题', status: 'COMPLETED' },
      assistant,
    ] } },
    regenerateEvents: [{ type: 'COMPLETE', requestId: 'retry-1', taskId: 8, assistantMessageId: 20, usage: null }],
  })
  const workspace = createChatWorkspace({
    api,
    initialSessions: [session(1, '会话 1')],
    initialMessages: { 1: [
      { id: 19, sessionId: 1, role: 'USER', content: '问题', status: 'COMPLETED' },
      assistant,
    ] },
  })

  await workspace.regenerate(20)

  const regenerateCall = api.calls.find(([name]) => name === 'regenerate')
  assert.equal(regenerateCall[1], 1)
  assert.equal(regenerateCall[2].messageId, 20)
  assert.equal(workspace.isGenerating.value, false)
})

test('persists the selected model on the active session', async () => {
  const api = createFakeApi()
  const workspace = createChatWorkspace({ api, initialSessions: [session(1, '会话 1')] })

  const updated = await workspace.changeModel(8)

  assert.equal(updated.defaultModelId, 8)
  assert.equal(workspace.activeSession.value.defaultModelId, 8)
  assert.equal(workspace.isChangingModel.value, false)
  assert.deepEqual(api.calls, [['updateSession', 1, { defaultModelId: 8 }]])
})

test('keeps the previous model when saving the selection fails', async () => {
  const api = createFakeApi({ updateSessionError: new Error('模型不可用') })
  const workspace = createChatWorkspace({ api, initialSessions: [session(1, '会话 1')] })

  await assert.rejects(() => workspace.changeModel(8), /模型不可用/)

  assert.equal(workspace.activeSession.value.defaultModelId, 3)
  assert.equal(workspace.isChangingModel.value, false)
  assert.deepEqual(api.calls, [['updateSession', 1, { defaultModelId: 8 }]])
})

test('does not change the model while a response is generating', async () => {
  const api = createFakeApi()
  let releaseStream
  api.stream = async (id, payload) => {
    api.calls.push(['stream', id, payload])
    return new Promise((resolve) => { releaseStream = resolve })
  }
  const workspace = createChatWorkspace({ api, initialSessions: [session(1, '会话 1')] })

  const submitting = workspace.submit('生成中')
  await new Promise((resolve) => setImmediate(resolve))
  const result = await workspace.changeModel(8)

  assert.equal(result, undefined)
  assert.equal(workspace.activeSession.value.defaultModelId, 3)
  assert.equal(api.calls.some(([name]) => name === 'updateSession'), false)

  releaseStream(new Response(null, { headers: { 'Content-Type': 'text/event-stream' } }))
  await submitting
})
