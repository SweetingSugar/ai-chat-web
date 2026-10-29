import test from 'node:test'
import assert from 'node:assert/strict'
import { apiRequest, apiStream, clearAuthState, setAuthState } from '../.tmp-tests/src/api/client.js'
import { chatApi, readChatStream } from '../.tmp-tests/src/api/chat.js'

test('uses the token header name returned by the login response', async () => {
  const values = new Map()
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers.get('x-session-token'), 'token-value')
    return new Response(JSON.stringify({ success: true, code: 'SUCCESS', message: 'OK', data: { ok: true } }), { status: 200 })
  }

  setAuthState({ tokenName: 'x-session-token', tokenValue: 'token-value', user: { id: 1 } })
  const result = await apiRequest('/api/auth/me')

  assert.deepEqual(result, { ok: true })
  clearAuthState()
})

function streamResponse(chunks) {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  }), { headers: { 'Content-Type': 'text/event-stream' } })
}

test('reads split SSE events and preserves event order', async () => {
  const values = new Map()
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
  const events = []
  const response = streamResponse([
    'event: start\ndata: {"type":"START","requestId":"req-1","taskId":50}\n\n',
    'event: delta\ndata: {"type":"DELTA","requestId":"req-1","delta":"你',
    '好"}\n\nevent: complete\ndata: {"type":"COMPLETE","requestId":"req-1","usage":{"inputTokens":4,"outputTokens":2,"totalTokens":6,"source":"ESTIMATED"}}\n\n',
  ])

  await readChatStream(response, (event) => events.push(event))

  assert.deepEqual(events.map(({ type }) => type), ['START', 'DELTA', 'COMPLETE'])
  assert.equal(events.filter(({ type }) => type === 'DELTA').map(({ delta }) => delta).join(''), '你好')
})

test('rejects malformed SSE JSON with a stream-specific error', async () => {
  const response = streamResponse(['event: delta\ndata: {invalid}\n\n'])

  await assert.rejects(
    () => readChatStream(response, () => {}),
    /无法解析流式事件/,
  )
})

test('parses non-success stream responses as API errors', async () => {
  const values = new Map()
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
  globalThis.fetch = async () => new Response(JSON.stringify({
    success: false,
    code: 'CHAT_CONVERSATION_NOT_FOUND',
    message: '会话不存在',
    data: null,
  }), { status: 404 })

  await assert.rejects(
    () => apiStream('/api/chat/sessions/99/stream', { content: '你好' }),
    /会话不存在/,
  )
})

test('loads user-visible chat models from the chat models endpoint', async () => {
  const values = new Map()
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
  let requestedUrl
  globalThis.fetch = async (url) => {
    requestedUrl = String(url)
    return new Response(JSON.stringify({
      success: true,
      code: 'SUCCESS',
      message: 'OK',
      data: [{
        id: 7,
        providerName: 'OpenAI',
        modelCode: 'gpt-test',
        modelName: '测试模型',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportStream: true,
        supportVision: false,
        defaultModel: false,
      }],
    }), { status: 200 })
  }

  const models = await chatApi.listModels()

  assert.equal(requestedUrl, '/api/chat/models')
  assert.equal(models[0].id, 7)
  assert.equal(models[0].modelCode, 'gpt-test')
})

test('uploads a chat attachment as multipart form data with the dynamic token header', async () => {
  const values = new Map()
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), '/api/files')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.get('x-session-token'), 'token-value')
    assert.equal(options.headers.get('Content-Type'), null)
    assert.ok(options.body instanceof FormData)
    assert.equal(options.body.get('file').name, 'report.pdf')
    return new Response(JSON.stringify({
      success: true,
      code: 'SUCCESS',
      message: 'OK',
      data: {
        id: 1001,
        userId: 1,
        originalName: 'report.pdf',
        contentType: 'application/pdf',
        fileSize: 12,
        status: 'ACTIVE',
        createTime: '2026-10-29T10:00:00',
        updateTime: '2026-10-29T10:00:00',
      },
    }), { status: 200 })
  }

  setAuthState({ tokenName: 'x-session-token', tokenValue: 'token-value', user: { id: 1 } })
  const uploaded = await chatApi.uploadFile(new File(['pdf'], 'report.pdf', { type: 'application/pdf' }))

  assert.equal(uploaded.id, 1001)
  assert.equal(uploaded.originalName, 'report.pdf')
  clearAuthState()
})
