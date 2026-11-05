import test from 'node:test'
import assert from 'node:assert/strict'
import { apiRequest, apiStream, clearAuthState, setAuthState } from '../.tmp-tests/src/api/client.js'
import { chatApi, readChatStream } from '../.tmp-tests/src/api/chat.js'
import { knowledgeApi } from '../.tmp-tests/src/api/knowledge.js'

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

test('calls knowledge-base APIs with JSON, query pagination, and multipart upload', async () => {
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push([String(url), options])
    return new Response(JSON.stringify({
      success: true,
      code: 'SUCCESS',
      message: 'OK',
      data: { records: [], total: 0, current: 1, size: 20, pages: 0 },
    }), { status: 200 })
  }

  await knowledgeApi.list(2, 20)
  await knowledgeApi.create({ name: '产品手册', description: '内部资料', embeddingModelId: 7 })
  await knowledgeApi.listEmbeddingModels()
  await knowledgeApi.uploadDocument(9, new File(['content'], 'manual.txt', { type: 'text/plain' }), '手册')

  assert.equal(calls[0][0], '/api/knowledge-bases?page=2&size=20')
  assert.deepEqual(JSON.parse(calls[1][1].body), { name: '产品手册', description: '内部资料', embeddingModelId: 7 })
  assert.equal(calls[2][0], '/api/chat/models/embedding')
  assert.equal(calls[3][0], '/api/knowledge-bases/9/documents/file')
  assert.equal(calls[3][1].headers.get('Content-Type'), null)
  assert.ok(calls[3][1].body instanceof FormData)
  assert.equal(calls[3][1].body.get('file').name, 'manual.txt')
  assert.equal(calls[3][1].body.get('title'), '手册')
})

test('requests text content and a file presigned URL for document previews', async () => {
  const values = new Map()
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push([String(url), options])
    return new Response(JSON.stringify({
      success: true,
      code: 'SUCCESS',
      message: 'OK',
      data: calls.length === 1
        ? { documentId: 12, title: '请假制度', content: '第一条\n第二条' }
        : { fileId: 19, url: 'https://files.example/report.pdf?signature=x', expiresIn: 600 },
    }), { status: 200 })
  }

  const text = await knowledgeApi.getDocumentContent(7, 12)
  const file = await knowledgeApi.getFilePresignedUrl(19)

  assert.equal(calls[0][0], '/api/knowledge-bases/7/documents/12/content')
  assert.equal(calls[0][1].method, undefined)
  assert.equal(calls[1][0], '/api/files/19/presigned-url')
  assert.equal(file.url, 'https://files.example/report.pdf?signature=x')
  assert.equal(file.expiresIn, 600)
  assert.equal(text.content, '第一条\n第二条')
})
