import test from 'node:test'
import assert from 'node:assert/strict'
import { createKnowledgeBaseWorkspace } from '../.tmp-tests/src/composables/useKnowledgeBaseWorkspace.js'

const base = (id, name) => ({
  id,
  name,
  description: null,
  embeddingModelId: 7,
  embeddingModelVersion: 1,
  pendingEmbeddingModelId: null,
  pendingEmbeddingModelVersion: null,
  activeIndexVersion: 1,
  reindexing: false,
  status: 'ACTIVE',
  createTime: '2026-11-04T10:00:00',
  updateTime: '2026-11-04T10:00:00',
})

const document = (id, status = 'COMPLETED') => ({
  id,
  title: '员工手册',
  sourceType: 'FILE',
  fileId: 6,
  status,
  indexVersion: 1,
  activeIndexVersion: 1,
  chunkCount: 4,
  errorCode: status === 'FAILED' ? 'INDEX_FAILED' : null,
  errorMessage: status === 'FAILED' ? '索引失败' : null,
  createTime: '2026-11-04T10:00:00',
  updateTime: '2026-11-04T10:00:00',
})

function createFakeApi({ pages = [], detail = null, documents = [], created = null, listError = null } = {}) {
  const calls = []
  return {
    calls,
    list: async (page, size) => {
      calls.push(['list', page, size])
      if (listError) throw listError
      return pages[page - 1] ?? { records: [], total: 0, current: page, size, pages: 0 }
    },
    get: async (id) => {
      calls.push(['get', id])
      return detail ?? base(id, `知识库 ${id}`)
    },
    create: async (payload) => {
      calls.push(['create', payload])
      return created ?? base(99, payload.name)
    },
    update: async (id, payload) => {
      calls.push(['update', id, payload])
      return { ...base(id, payload.name), description: payload.description ?? null }
    },
    delete: async (id) => { calls.push(['delete', id]) },
    changeEmbeddingModel: async (id, embeddingModelId) => {
      calls.push(['changeEmbeddingModel', id, embeddingModelId])
      return { ...base(id, `知识库 ${id}`), embeddingModelId }
    },
    listDocuments: async (id, page, size) => {
      calls.push(['listDocuments', id, page, size])
      return documents[page - 1] ?? { records: [], total: 0, current: page, size, pages: 0 }
    },
    addTextDocument: async (id, payload) => {
      calls.push(['addTextDocument', id, payload])
      return document(88)
    },
    uploadDocument: async (id, file) => {
      calls.push(['uploadDocument', id, file.name])
      return document(89)
    },
    deleteDocument: async (baseId, documentId) => { calls.push(['deleteDocument', baseId, documentId]) },
    retryDocument: async (baseId, documentId) => { calls.push(['retryDocument', baseId, documentId]) },
  }
}

test('loads pages, prepends a created base, and selects it', async () => {
  const api = createFakeApi({
    pages: [{ records: [base(1, '手册')], total: 1, current: 1, size: 20, pages: 1 }],
    created: base(2, '规范'),
  })
  const workspace = createKnowledgeBaseWorkspace({ api })

  await workspace.loadBases()
  const created = await workspace.createBase({ name: '规范', description: '', embeddingModelId: 7 })

  assert.equal(created.id, 2)
  assert.deepEqual(workspace.bases.value.map(({ id }) => id), [2, 1])
  assert.equal(workspace.selectedBase.value.id, 2)
})

test('retries a failed document and reloads its first page', async () => {
  const api = createFakeApi({
    detail: base(1, '手册'),
    documents: [{ records: [document(8, 'FAILED')], total: 1, current: 1, size: 20, pages: 1 }],
  })
  const workspace = createKnowledgeBaseWorkspace({ api })

  await workspace.openBase(1)
  await workspace.retryDocument(8)

  assert.deepEqual(api.calls.filter(([name]) => name === 'retryDocument'), [['retryDocument', 1, 8]])
  assert.equal(api.calls.filter(([name]) => name === 'listDocuments').length, 2)
})

test('retains a readable list error and clears loading state', async () => {
  const workspace = createKnowledgeBaseWorkspace({ api: createFakeApi({ listError: new Error('加载失败') }) })

  await assert.rejects(() => workspace.loadBases(), /加载失败/)

  assert.equal(workspace.basesError.value, '加载失败')
  assert.equal(workspace.isLoadingBases.value, false)
})
