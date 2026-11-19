import test from 'node:test'
import assert from 'node:assert/strict'
import { createAgentWorkspace } from '../.tmp-tests/src/composables/useAgentWorkspace.js'

const payload = (name) => ({
  name,
  description: `${name}描述`,
  systemPrompt: '保持准确。',
  modelId: 3,
  knowledgeBaseIds: [4],
  toolCodes: ['order_query'],
})

const agent = (id, name, status = 1) => ({
  id,
  name,
  description: `${name}描述`,
  systemPrompt: '保持准确。',
  modelId: 3,
  knowledgeBaseIds: [4],
  toolCodes: ['order_query'],
  status,
  createTime: '2026-11-19T10:00:00',
  updateTime: '2026-11-19T10:00:00',
})

const page = (records, current = 1, pages = 1) => ({
  records,
  total: records.length,
  current,
  size: 20,
  pages,
})

function createFakeApi({ pages = [], created = null, listError = null } = {}) {
  const calls = []
  return {
    calls,
    list: async (current, size) => {
      calls.push(['list', current, size])
      if (listError) throw listError
      return pages[current - 1] ?? { records: [], total: 0, current, size, pages: 0 }
    },
    get: async (id) => {
      calls.push(['get', id])
      return agent(id, `Agent ${id}`)
    },
    create: async (request) => {
      calls.push(['create', request])
      return created ?? agent(99, request.name)
    },
    update: async (id, request) => {
      calls.push(['update', id, request])
      return agent(id, request.name)
    },
    updateStatus: async (id, status) => {
      calls.push(['updateStatus', id, status])
      return agent(id, `Agent ${id}`, status)
    },
    delete: async (id) => {
      calls.push(['delete', id])
      return null
    },
  }
}

test('loads pages, prepends a created Agent, and updates its status', async () => {
  const api = createFakeApi({
    pages: [page([agent(1, '资料助手')])],
    created: agent(2, '售后助手'),
  })
  const workspace = createAgentWorkspace({ api })

  await workspace.loadAgents()
  await workspace.createAgent(payload('售后助手'))
  await workspace.updateStatus(2, 0)

  assert.deepEqual(workspace.agents.value.map(({ id }) => id), [2, 1])
  assert.equal(workspace.agents.value[0].status, 0)
  assert.deepEqual(api.calls.filter(([name]) => name === 'updateStatus'), [['updateStatus', 2, 0]])
})

test('retains a readable list error and clears loading state', async () => {
  const workspace = createAgentWorkspace({ api: createFakeApi({ listError: new Error('加载失败') }) })

  await assert.rejects(() => workspace.loadAgents(), /加载失败/)

  assert.equal(workspace.agentsError.value, '加载失败')
  assert.equal(workspace.isLoadingAgents.value, false)
})

test('replaces an updated Agent and removes a deleted Agent', async () => {
  const workspace = createAgentWorkspace({ api: createFakeApi({ pages: [page([agent(1, '旧名称')])] }) })

  await workspace.loadAgents()
  await workspace.updateAgent(1, payload('新名称'))
  assert.equal(workspace.agents.value[0].name, '新名称')
  await workspace.deleteAgent(1)

  assert.equal(workspace.agents.value.length, 0)
})
