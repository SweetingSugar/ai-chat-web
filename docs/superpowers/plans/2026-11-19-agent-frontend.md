# Agent Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Agent management workspace and per-chat Agent selection to the existing Vue application, using the existing backend Agent API and preserving ordinary chat behavior.

**Architecture:** Add an Agent API/type layer and a focused `useAgentWorkspace` composable for server-backed CRUD state. Build the management UI from small Agent-specific components that reuse the existing workspace/sidebar/form patterns. Extend `createChatWorkspace` with an in-memory per-session Agent selection map so both new chats and regenerations explicitly send `agentId`, while the existing Composer and ChatHeader lock controls whose request values would be overridden by an Agent.

**Tech Stack:** Vue 3 Composition API and SFCs, TypeScript, Vue Router, existing `apiRequest` client, Node built-in test runner with the repository `.tmp-tests` transpilation convention, Vite, Vue TSC.

---

## Repository test convention

The repository runs Node tests against selected TypeScript files transpiled into ignored `.tmp-tests/`. Do not add a test framework or commit `.tmp-tests/`.

Before Node test commands in this plan, create fresh output using the current project convention. Once the Agent source files exist, use:

```bash
rm -rf .tmp-tests && npx tsc --ignoreConfig --outDir .tmp-tests --rootDir . --module NodeNext --moduleResolution NodeNext --target ES2022 --skipLibCheck src/api/client.ts src/api/chat.ts src/api/knowledge.ts src/api/agent.ts src/composables/useChatWorkspace.ts src/composables/useKnowledgeBaseWorkspace.ts src/composables/useAgentWorkspace.ts src/lib/chatAttachments.ts src/lib/knowledgeSelection.ts src/lib/toolSelection.ts src/lib/agentSelection.ts src/lib/sseParser.ts src/types/chat.ts src/types/agent.ts
```

Expected: TypeScript exits with status `0` and emits the imported modules under `.tmp-tests/src/`.

## File structure

| File | Responsibility |
| --- | --- |
| `src/types/agent.ts` | Agent domain and Agent API request types. |
| `src/api/agent.ts` | Typed wrapper for `/api/agents` CRUD and status endpoints. |
| `src/lib/agentSelection.ts` | Pure, backend-aligned selection-limit helpers for Agent form resource selectors. |
| `src/composables/useAgentWorkspace.ts` | Agent page list pagination, mutations, local list replacement, and error/loading state. |
| `src/components/agent/AgentCard.vue` | One management-list card and its edit/status/delete intents. |
| `src/components/agent/AgentList.vue` | Searchable, paginated Agent management list with loading/error/empty states. |
| `src/components/agent/AgentFormDialog.vue` | Shared create/edit dialog and model/knowledge/tool multi-selects. |
| `src/components/agent/AgentPicker.vue` | Composer-level ordinary-chat/Agent selector and fixed-configuration summary. |
| `src/views/Agents.vue` | Agent workspace composition, form candidate-data loading, toast, mobile navigation, and actions. |
| `src/router/index.ts` | Authenticated `/agents` route. |
| `src/components/layout/WorkspaceSidebar.vue` | Agent navigation entry. |
| `src/types/chat.ts` | Optional `agentId` on both chat request shapes. |
| `src/composables/useChatWorkspace.ts` | Per-session selected Agent state and propagation to stream/regenerate payloads. |
| `src/components/chat/Composer.vue` | Agent picker integration and locked knowledge/tool controls. |
| `src/components/chat/ChatHeader.vue` | Disabled model selector and a reason when an Agent owns the configuration. |
| `src/views/Chat.vue` | Loads enabled Agents, owns picker state wiring, and sends the selected Agent. |
| `src/assets/main.css` | Agent workspace/card/form/picker styling, disabled explanation, and mobile layout. |
| `tests/apiClient.test.mjs` | Contract tests for Agent API endpoints. |
| `tests/agentSelection.test.mjs` | Pure Agent form selection rules. |
| `tests/agentWorkspace.test.mjs` | Agent workspace paging and mutation state tests. |
| `tests/chatWorkspace.test.mjs` | Agent propagation, per-session isolation, cleanup, and normal-chat regression tests. |

### Task 1: Define Agent contracts and the API client

**Files:**
- Create: `src/types/agent.ts`
- Create: `src/api/agent.ts`
- Modify: `tests/apiClient.test.mjs:1-6, after current API endpoint tests`

- [ ] **Step 1: Write failing Agent API contract tests**

Add the Agent import alongside the existing clients and append tests that inspect the URL, method, and JSON payload. Use these exact representative values:

```js
import { agentApi } from '../.tmp-tests/src/api/agent.js'

test('uses Agent endpoints with backend-aligned request bodies', async () => {
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push([String(url), options])
    return new Response(JSON.stringify({
      success: true,
      code: 'SUCCESS',
      message: 'OK',
      data: {
        id: 9,
        name: '售后助手',
        description: '处理售后问题',
        systemPrompt: '保持准确。',
        modelId: 3,
        knowledgeBaseIds: [4],
        toolCodes: ['order_query'],
        status: 1,
        createTime: '2026-11-19T10:00:00',
        updateTime: '2026-11-19T10:00:00',
      },
    }), { status: 200 })
  }
  const payload = {
    name: '售后助手', description: '处理售后问题', systemPrompt: '保持准确。',
    modelId: 3, knowledgeBaseIds: [4], toolCodes: ['order_query'],
  }

  await agentApi.list(2, 10)
  await agentApi.get(9)
  await agentApi.create(payload)
  await agentApi.update(9, payload)
  await agentApi.updateStatus(9, 0)
  await agentApi.delete(9)

  assert.deepEqual(calls.map(([url, options]) => [url, options.method, options.body]), [
    ['/api/agents?page=2&size=10', undefined, undefined],
    ['/api/agents/9', undefined, undefined],
    ['/api/agents', 'POST', JSON.stringify(payload)],
    ['/api/agents/9', 'PUT', JSON.stringify(payload)],
    ['/api/agents/9/status', 'PATCH', JSON.stringify({ status: 0 })],
    ['/api/agents/9', 'DELETE', undefined],
  ])
})
```

- [ ] **Step 2: Refresh the test output and verify failure**

Run:

```bash
rm -rf .tmp-tests && npx tsc --ignoreConfig --outDir .tmp-tests --rootDir . --module NodeNext --moduleResolution NodeNext --target ES2022 --skipLibCheck src/api/client.ts src/api/chat.ts src/api/knowledge.ts src/types/chat.ts
node --test --test-name-pattern="Agent endpoints" tests/apiClient.test.mjs
```

Expected: FAIL because `.tmp-tests/src/api/agent.js` does not exist.

- [ ] **Step 3: Add exact Agent types**

Create `src/types/agent.ts`:

```ts
export interface Agent {
  id: number
  name: string
  description: string | null
  systemPrompt: string
  modelId: number
  knowledgeBaseIds: number[]
  toolCodes: string[]
  status: number
  createTime: string
  updateTime: string
}

export interface AgentUpsertRequest {
  name: string
  description?: string
  systemPrompt: string
  modelId: number
  knowledgeBaseIds: number[]
  toolCodes: string[]
}

export type AgentSummary = Pick<Agent, 'id' | 'name' | 'description' | 'modelId' | 'knowledgeBaseIds' | 'toolCodes' | 'status'>
```

- [ ] **Step 4: Implement the Agent API wrapper**

Create `src/api/agent.ts` using the existing client and types:

```ts
import { apiRequest } from './client.js'
import type { PageResult } from '../types/chat.js'
import type { Agent, AgentUpsertRequest } from '../types/agent.js'

export const agentApi = {
  list(page = 1, size = 20) {
    return apiRequest<PageResult<Agent>>(`/api/agents?page=${page}&size=${size}`)
  },
  get(id: number) {
    return apiRequest<Agent>(`/api/agents/${id}`)
  },
  create(payload: AgentUpsertRequest) {
    return apiRequest<Agent>('/api/agents', { method: 'POST', body: JSON.stringify(payload) })
  },
  update(id: number, payload: AgentUpsertRequest) {
    return apiRequest<Agent>(`/api/agents/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
  },
  updateStatus(id: number, status: number) {
    return apiRequest<Agent>(`/api/agents/${id}/status`, {
      method: 'PATCH', body: JSON.stringify({ status }),
    })
  },
  delete(id: number) {
    return apiRequest<null>(`/api/agents/${id}`, { method: 'DELETE' })
  },
}
```

- [ ] **Step 5: Refresh output and verify API tests pass**

Run:

```bash
rm -rf .tmp-tests && npx tsc --ignoreConfig --outDir .tmp-tests --rootDir . --module NodeNext --moduleResolution NodeNext --target ES2022 --skipLibCheck src/api/client.ts src/api/chat.ts src/api/knowledge.ts src/api/agent.ts src/types/chat.ts src/types/agent.ts
node --test --test-name-pattern="Agent endpoints" tests/apiClient.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit the API contract layer**

```bash
git add src/types/agent.ts src/api/agent.ts tests/apiClient.test.mjs
git commit -m "feat: add agent API client" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

### Task 2: Add pure Agent form selection rules

**Files:**
- Create: `src/lib/agentSelection.ts`
- Create: `tests/agentSelection.test.mjs`

- [ ] **Step 1: Write failing selection-rule tests**

Create `tests/agentSelection.test.mjs`:

```js
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
```

- [ ] **Step 2: Compile without the helper and verify failure**

Run:

```bash
rm -rf .tmp-tests && npx tsc --ignoreConfig --outDir .tmp-tests --rootDir . --module NodeNext --moduleResolution NodeNext --target ES2022 --skipLibCheck src/types/agent.ts
node --test tests/agentSelection.test.mjs
```

Expected: FAIL because `.tmp-tests/src/lib/agentSelection.js` does not exist.

- [ ] **Step 3: Implement the pure selection helpers**

Create `src/lib/agentSelection.ts`:

```ts
export const AGENT_KNOWLEDGE_BASE_LIMIT = 10
export const AGENT_TOOL_LIMIT = 20

export function toggleAgentKnowledgeBase(current: number[], id: number) {
  if (current.includes(id)) return { ids: current.filter((item) => item !== id), error: null }
  if (current.length >= AGENT_KNOWLEDGE_BASE_LIMIT) {
    return { ids: [...current], error: `最多可选择 ${AGENT_KNOWLEDGE_BASE_LIMIT} 个知识库` }
  }
  return { ids: [...current, id], error: null }
}

export function toggleAgentTool(current: string[], toolCode: string) {
  if (current.includes(toolCode)) return { toolCodes: current.filter((item) => item !== toolCode), error: null }
  if (current.length >= AGENT_TOOL_LIMIT) {
    return { toolCodes: [...current], error: `最多可选择 ${AGENT_TOOL_LIMIT} 个工具` }
  }
  return { toolCodes: [...current, toolCode], error: null }
}
```

- [ ] **Step 4: Compile and run the selection tests**

Run:

```bash
rm -rf .tmp-tests && npx tsc --ignoreConfig --outDir .tmp-tests --rootDir . --module NodeNext --moduleResolution NodeNext --target ES2022 --skipLibCheck src/lib/agentSelection.ts
node --test tests/agentSelection.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Agent selection rules**

```bash
git add src/lib/agentSelection.ts tests/agentSelection.test.mjs
git commit -m "feat: add agent selection rules" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

### Task 3: Add the Agent management workspace state

**Files:**
- Create: `src/composables/useAgentWorkspace.ts`
- Create: `tests/agentWorkspace.test.mjs`

- [ ] **Step 1: Write failing Agent workspace tests**

Create `tests/agentWorkspace.test.mjs` with a fake API exposing `list`, `get`, `create`, `update`, `updateStatus`, and `delete`. Define an Agent factory and cover the following exact outcomes:

```js
test('loads pages, prepends a created Agent, and updates its status', async () => {
  const api = createFakeApi({
    pages: [{ records: [agent(1, '资料助手')], total: 1, current: 1, size: 20, pages: 1 }],
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
  await workspace.deleteAgent(1)
  assert.equal(workspace.agents.value.length, 0)
})
```

Make the fake `update` return a full `Agent` with the new name, and make every `PageResult` include `records`, `total`, `current`, `size`, and `pages`.

- [ ] **Step 2: Compile and verify the test fails**

Run:

```bash
rm -rf .tmp-tests && npx tsc --ignoreConfig --outDir .tmp-tests --rootDir . --module NodeNext --moduleResolution NodeNext --target ES2022 --skipLibCheck src/api/client.ts src/api/agent.ts src/types/chat.ts src/types/agent.ts
node --test tests/agentWorkspace.test.mjs
```

Expected: FAIL because `.tmp-tests/src/composables/useAgentWorkspace.js` does not exist.

- [ ] **Step 3: Implement `createAgentWorkspace`**

Create `src/composables/useAgentWorkspace.ts` following the established `createKnowledgeBaseWorkspace` shape. Define its API boundary and options as follows:

```ts
export type AgentWorkspaceApi = Pick<typeof agentApi, 'list' | 'get' | 'create' | 'update' | 'updateStatus' | 'delete'>

export interface AgentWorkspaceOptions {
  api?: AgentWorkspaceApi
  pageSize?: number
}

export function createAgentWorkspace(options: AgentWorkspaceOptions = {}) {
  // refs: agents, agentsError, isLoadingAgents, isLoadingMoreAgents, isMutating, currentPage, totalPages
  // computed: hasMoreAgents
  // methods: loadAgents, loadMoreAgents, createAgent, updateAgent, updateStatus, deleteAgent
}
```

Use `pageSize = options.pageSize ?? 20`. On first-page load failure, clear `agents`, reset `currentPage` and `totalPages` to zero, set `agentsError` to the thrown message or `加载 Agent 失败，请重试`, then rethrow. For successful mutations, update local state only:

```ts
function replaceAgent(next: Agent) {
  const index = agents.value.findIndex((agent) => agent.id === next.id)
  if (index >= 0) agents.value[index] = next
}

async function createAgent(payload: AgentUpsertRequest) {
  return runMutation(async () => {
    const created = await api.create(payload)
    agents.value.unshift(created)
    return created
  })
}

async function deleteAgent(id: number) {
  return runMutation(async () => {
    await api.delete(id)
    agents.value = agents.value.filter((agent) => agent.id !== id)
  })
}
```

`runMutation` must prevent duplicate simultaneous writes using `isMutating`, reset the flag in `finally`, and return `undefined` if a write is already running.

- [ ] **Step 4: Compile and run the workspace tests**

Run:

```bash
rm -rf .tmp-tests && npx tsc --ignoreConfig --outDir .tmp-tests --rootDir . --module NodeNext --moduleResolution NodeNext --target ES2022 --skipLibCheck src/api/client.ts src/api/agent.ts src/composables/useAgentWorkspace.ts src/types/chat.ts src/types/agent.ts
node --test tests/agentWorkspace.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Agent workspace state**

```bash
git add src/composables/useAgentWorkspace.ts tests/agentWorkspace.test.mjs
git commit -m "feat: add agent workspace state" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

### Task 4: Build the Agent management route and management components

**Files:**
- Create: `src/components/agent/AgentCard.vue`
- Create: `src/components/agent/AgentList.vue`
- Create: `src/components/agent/AgentFormDialog.vue`
- Create: `src/views/Agents.vue`
- Modify: `src/router/index.ts:20-32`
- Modify: `src/components/layout/WorkspaceSidebar.vue:34-43`
- Modify: `src/assets/main.css:after knowledge workspace styles`

- [ ] **Step 1: Create the Agent card component**

Create `AgentCard.vue` with an `agent: Agent` prop, `edit`, `toggleStatus`, and `delete` emits, and readable status derived with:

```ts
const statusLabel = computed(() => props.agent.status === 1 ? '已启用' : '已停用')
const model = computed(() => props.models.find((item) => item.id === props.agent.modelId))
```

Render name, description fallback `暂无描述`, model name fallback `模型 #${agent.modelId}`, `知识库 ${agent.knowledgeBaseIds.length} 个`, `工具 ${agent.toolCodes.length} 个`, update time, and three explicit buttons. The status button must emit `toggleStatus` rather than making an API call itself; destructive action must emit `delete` only.

- [ ] **Step 2: Create the searchable paginated Agent list**

Create `AgentList.vue` with props `agents`, `models`, `loading`, `loadingMore`, `error`, and `hasMore`. Copy the established `KnowledgeBaseList` scroll threshold (`<= 48`) and filter by name and description. Expose events:

```ts
const emit = defineEmits<{
  create: []
  edit: [agent: Agent]
  toggleStatus: [agent: Agent]
  delete: [agent: Agent]
  loadMore: []
  retry: []
}>()
```

Use loading text `正在加载 Agent…`, empty text `还没有 Agent`, and a create button in the no-query empty state. Delegate each card event upward.

- [ ] **Step 3: Create the shared Agent form dialog**

Create `AgentFormDialog.vue`. Its props must be:

```ts
withDefaults(defineProps<{
  open: boolean
  agent?: Agent | null
  models: ModelSummary[]
  knowledgeBases: KnowledgeBase[]
  tools: AvailableTool[]
  submitting?: boolean
  resourcesLoading?: boolean
  resourcesError?: string | null
}>(), { agent: null, submitting: false, resourcesLoading: false, resourcesError: null })
```

Keep refs for `name`, `description`, `systemPrompt`, `modelId`, `knowledgeBaseIds`, and `toolCodes`. Watch `open`, `agent`, `models`, `knowledgeBases`, and `tools`; when the dialog opens, reset all fields from `agent` or defaults. Use `toggleAgentKnowledgeBase` and `toggleAgentTool` for checkboxes; emit their non-null error through `limit`.

The dialog submit payload must exactly be:

```ts
{
  name: name.value.trim(),
  description: description.value.trim() || undefined,
  systemPrompt: systemPrompt.value.trim(),
  modelId: modelId.value,
  knowledgeBaseIds: [...knowledgeBaseIds.value],
  toolCodes: [...toolCodes.value],
}
```

Disable Save unless trimmed name and system prompt are non-empty, `modelId` is non-null, candidates are not loading, and the dialog is not submitting. Render a retry event when `resourcesError` exists. Reuse `auth-modal-overlay`, `auth-modal`, `auth-field`, and `form-button` classes.

- [ ] **Step 4: Create the Agent workspace view**

Create `Agents.vue`, structurally matching `KnowledgeBases.vue` without a detail route. It must:

- create `createAgentWorkspace()` and access `useAuth`, `useRoute` only if needed, and `useRouter`;
- load models, `knowledgeApi.list(1, 100)`, and `chatApi.listAvailableTools()` when opening the form; store candidate resource errors separately from workspace errors;
- invoke `workspace.loadAgents()` on mount;
- open a create dialog with `editingAgent = null`, or edit with a cloned selected Agent reference;
- call `workspace.createAgent` or `workspace.updateAgent`, close on success, and toast `Agent 已创建` or `Agent 已更新`;
- call `workspace.updateStatus(agent.id, agent.status === 1 ? 0 : 1)` and toast `Agent 已启用` / `Agent 已停用`;
- use `window.confirm(\`确定删除 Agent“${agent.name}”吗？\`)` before `workspace.deleteAgent(agent.id)` and toast `Agent 已删除`;
- retain the existing theme, logout, mobile sidebar, `SettingsDrawer`, and toast logic.

Use this component composition:

```vue
<WorkspaceSidebar :user="user" :mobile-open="sidebarOpen" @close-mobile="sidebarOpen = false" />
<main class="agent-main">
  <header class="agent-mobile-header">
    <button class="icon-button" aria-label="打开导航" @click="sidebarOpen = true"><span>☰</span></button>
    <span>Agent</span>
    <button class="icon-button" aria-label="打开设置" @click="settingsOpen = true">⚙</button>
  </header>
  <AgentList
    :agents="workspace.agents.value"
    :models="models"
    :loading="workspace.isLoadingAgents.value"
    :loading-more="workspace.isLoadingMoreAgents.value"
    :error="workspace.agentsError.value"
    :has-more="workspace.hasMoreAgents.value"
    @create="openCreate"
    @edit="openEdit"
    @toggle-status="toggleStatus"
    @delete="deleteAgent"
    @load-more="loadMore"
    @retry="loadAgents"
  />
</main>
<AgentFormDialog
  :open="formOpen"
  :agent="editingAgent"
  :models="models"
  :knowledge-bases="knowledgeBases"
  :tools="availableTools"
  :submitting="workspace.isMutating.value"
  :resources-loading="resourcesLoading"
  :resources-error="resourcesError"
  @close="formOpen = false"
  @submit="submitAgent"
  @limit="notify"
  @retry-resources="loadFormResources"
/>
```

- [ ] **Step 5: Add route and sidebar navigation**

Add this route before the catch-all in `src/router/index.ts`:

```ts
{
  path: '/agents',
  name: 'agents',
  component: () => import('../views/Agents.vue'),
  meta: { requiresAuth: true },
},
```

Add this `RouterLink` after the knowledge-base link in `WorkspaceSidebar.vue`:

```vue
<RouterLink class="workspace-nav__item" active-class="workspace-nav__item--active" :to="{ name: 'agents' }" @click="emit('closeMobile')">
  <AppIcon name="star" size="16" />
  <span>Agent</span>
</RouterLink>
```

- [ ] **Step 6: Add Agent visual styles**

Append focused CSS near the existing knowledge workspace styles in `src/assets/main.css`. Create separate Agent class names, not generic overrides:

```css
.agent-main { display: flex; min-width: 0; flex: 1; flex-direction: column; overflow: hidden; }
.agent-page { width: min(980px, calc(100% - 56px)); margin: 0 auto; padding: 42px 0 30px; }
.agent-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 13px; }
.agent-card { display: flex; min-height: 210px; flex-direction: column; padding: 17px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); }
.agent-card:hover { border-color: color-mix(in srgb, var(--accent) 42%, var(--line)); box-shadow: 0 10px 24px color-mix(in srgb, var(--accent) 11%, transparent); }
.agent-card__meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; color: var(--text-soft); font-size: 11px; }
.agent-card__actions { display: flex; gap: 7px; margin-top: auto; padding-top: 14px; }
.agent-status--disabled { background: var(--surface-soft); color: var(--text-soft); }
.agent-form__choices { display: grid; max-height: 160px; gap: 6px; overflow-y: auto; padding: 8px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface-soft); }
.agent-form__choice { display: flex; align-items: center; gap: 8px; color: var(--text); font-size: 12px; }
.agent-mobile-header { display: none; }
@media (max-width: 760px) {
  .agent-page { width: calc(100% - 28px); padding: 22px 0 max(22px, env(safe-area-inset-bottom)); }
  .agent-mobile-header { display: flex; align-items: center; justify-content: space-between; min-height: 60px; padding: 0 12px; border-bottom: 1px solid var(--line); background: color-mix(in srgb, var(--surface) 74%, transparent); font-size: 14px; font-weight: 650; }
  .agent-grid { grid-template-columns: 1fr; }
}
```

Style the dialog text area and the empty/error states by reusing `.auth-field textarea`, `.knowledge-empty`, and `.knowledge-status` selectors where their existing generic visual treatment is sufficient; do not duplicate the global rules.

- [ ] **Step 7: Type-check and build the management interface**

Run:

```bash
npm run type-check
npm run build
```

Expected: both commands exit with status `0`.

- [ ] **Step 8: Commit the Agent management interface**

```bash
git add src/components/agent/AgentCard.vue src/components/agent/AgentList.vue src/components/agent/AgentFormDialog.vue src/views/Agents.vue src/router/index.ts src/components/layout/WorkspaceSidebar.vue src/assets/main.css
git commit -m "feat: add agent management interface" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

### Task 5: Add Agent state to the chat workspace with TDD

**Files:**
- Modify: `src/types/chat.ts:127-141`
- Modify: `src/composables/useChatWorkspace.ts:1-435`
- Modify: `tests/chatWorkspace.test.mjs:existing fake API and append cases`

- [ ] **Step 1: Extend the chat workspace tests with Agent behavior**

Import no new runtime client; define a test Agent summary inside `tests/chatWorkspace.test.mjs`:

```js
const agent = {
  id: 7,
  name: '售后助手',
  description: '处理订单售后问题',
  modelId: 8,
  knowledgeBaseIds: [4],
  toolCodes: ['order_query'],
  status: 1,
}
```

Append these focused tests:

```js
test('sends the selected Agent ID without manual model, knowledge, or tool overrides', async () => {
  const api = createFakeApi({ streamEvents: [{ type: 'COMPLETE', requestId: 'r', taskId: 1, assistantMessageId: 2, usage: null }] })
  const workspace = createChatWorkspace({ api, initialSessions: [session(1, '会话 1')] })
  workspace.selectAgent(1, agent)

  await workspace.submit('查询订单', 3, [], true, [4], ['weather_current'])

  const request = api.calls.find(([name]) => name === 'stream')[2]
  assert.equal(request.agentId, 7)
  assert.equal('modelId' in request, false)
  assert.equal('knowledgeBaseIds' in request, false)
  assert.equal('toolCodes' in request, false)
})

test('sends the current session Agent ID when regenerating', async () => {
  const assistant = { id: 20, sessionId: 1, role: 'ASSISTANT', content: '旧回答', status: 'COMPLETED', generationTaskId: 7 }
  const api = createFakeApi({
    details: { 1: { session: session(1, '会话 1'), messages: [
      { id: 19, sessionId: 1, role: 'USER', content: '订单状态', status: 'COMPLETED' },
      assistant,
    ] } },
    regenerateEvents: [{ type: 'COMPLETE', requestId: 'retry-1', taskId: 8, assistantMessageId: 20, usage: null }],
  })
  const workspace = createChatWorkspace({
    api,
    initialSessions: [session(1, '会话 1')],
    initialMessages: { 1: [
      { id: 19, sessionId: 1, role: 'USER', content: '订单状态', status: 'COMPLETED' },
      assistant,
    ] },
  })
  workspace.selectAgent(1, agent)

  await workspace.regenerate(20)

  const request = api.calls.find(([name]) => name === 'regenerate')[2]
  assert.equal(request.messageId, 20)
  assert.equal(request.agentId, 7)
  assert.equal('modelId' in request, false)
  assert.equal('knowledgeBaseIds' in request, false)
  assert.equal('toolCodes' in request, false)
})

test('keeps Agent selection separate per session and clears it when the session is deleted', async () => {
  const workspace = createChatWorkspace({ api: createFakeApi(), initialSessions: [session(1, '一'), session(2, '二')] })
  workspace.selectAgent(1, agent)
  workspace.selectAgent(2, { ...agent, id: 8, name: '旅行助手' })
  assert.equal(workspace.selectedAgent(1)?.id, 7)
  assert.equal(workspace.selectedAgent(2)?.id, 8)
  await workspace.deleteSession(1)
  assert.equal(workspace.selectedAgent(1), null)
  assert.equal(workspace.selectedAgent(2)?.id, 8)
})

test('uses the ordinary request fields when no Agent is selected', async () => {
  const api = createFakeApi({ streamEvents: [{ type: 'COMPLETE', requestId: 'r', taskId: 1, assistantMessageId: 2, usage: null }] })
  const workspace = createChatWorkspace({ api, initialSessions: [session(1, '会话 1')] })
  await workspace.submit('普通对话', 3, [], true, [4], ['weather_current'])
  const request = api.calls.find(([name]) => name === 'stream')[2]
  assert.equal(request.modelId, 3)
  assert.deepEqual(request.knowledgeBaseIds, [4])
  assert.deepEqual(request.toolCodes, ['weather_current'])
  assert.equal('agentId' in request, false)
})
```

For the regeneration test, use the existing `regenerates a persisted assistant message` fixture and assert individual properties rather than asserting an entire UUID-bearing object.

- [ ] **Step 2: Refresh output and verify the Agent workspace tests fail**

Run:

```bash
rm -rf .tmp-tests && npx tsc --ignoreConfig --outDir .tmp-tests --rootDir . --module NodeNext --moduleResolution NodeNext --target ES2022 --skipLibCheck src/api/client.ts src/api/chat.ts src/composables/useChatWorkspace.ts src/types/chat.ts src/types/agent.ts
node --test --test-name-pattern="selected Agent|session Agent|Agent selection|ordinary request" tests/chatWorkspace.test.mjs
```

Expected: FAIL because `selectAgent` and `selectedAgent` are missing, and Agent IDs are not sent.

- [ ] **Step 3: Add optional Agent IDs to chat payload types**

Modify the request interfaces in `src/types/chat.ts`:

```ts
export interface ChatRequest {
  content: string
  fileIds?: number[]
  knowledgeBaseIds?: number[]
  toolCodes?: string[]
  modelId?: number
  agentId?: number
  requestId?: string
  temperature?: number
  topP?: number
  maxOutputTokens?: number
}
```

Keep `ChatRegenerateRequest extends Omit<ChatRequest, 'content'>` unchanged so it receives optional `agentId` automatically.

- [ ] **Step 4: Add per-session Agent selection and request construction**

In `src/composables/useChatWorkspace.ts`, import `AgentSummary`, create a reactive map, and add these helpers near the existing session state:

```ts
const selectedAgentsBySession = reactive<Record<number, AgentSummary | null>>({})

function selectedAgent(sessionId = activeSessionId.value) {
  return sessionId === null ? null : selectedAgentsBySession[sessionId] ?? null
}

function selectAgent(sessionId: number, agent: AgentSummary | null) {
  if (generatingSessionId.value === sessionId) return
  if (agent === null) delete selectedAgentsBySession[sessionId]
  else selectedAgentsBySession[sessionId] = { ...agent }
}
```

Delete `selectedAgentsBySession[sessionId]` in `deleteSession` after deleting message state. Do not add entries in `createSession`, so new sessions default to ordinary chat. Return `selectedAgent` and `selectAgent` from the composable.

Change `generateAssistant` to obtain `const agent = selectedAgent(sessionId)` and construct the base request from it:

```ts
const request: ChatRequest = {
  content,
  requestId,
  ...(agent ? { agentId: agent.id } : { modelId: session?.defaultModelId || undefined }),
}
if (!agent && !regenerate && fileIds?.length) request.fileIds = fileIds
if (!agent && !regenerate && knowledgeBaseIds?.length) request.knowledgeBaseIds = knowledgeBaseIds
if (!agent && !regenerate && toolCodes?.length) request.toolCodes = toolCodes
if (agent && !regenerate && fileIds?.length) request.fileIds = fileIds
```

This deliberately preserves attachments in Agent mode, excludes manual model/knowledge/tool overrides, sends `agentId` for both stream and regenerate, and maintains ordinary behavior when no Agent is selected.

- [ ] **Step 5: Run the focused chat workspace tests**

Run:

```bash
rm -rf .tmp-tests && npx tsc --ignoreConfig --outDir .tmp-tests --rootDir . --module NodeNext --moduleResolution NodeNext --target ES2022 --skipLibCheck src/api/client.ts src/api/chat.ts src/composables/useChatWorkspace.ts src/types/chat.ts src/types/agent.ts
node --test --test-name-pattern="selected Agent|session Agent|Agent selection|ordinary request" tests/chatWorkspace.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit the chat Agent state**

```bash
git add src/types/chat.ts src/composables/useChatWorkspace.ts tests/chatWorkspace.test.mjs
git commit -m "feat: send selected agents with chat requests" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

### Task 6: Integrate Agent choice and locking into the chat UI

**Files:**
- Create: `src/components/agent/AgentPicker.vue`
- Modify: `src/components/chat/Composer.vue:1-155`
- Modify: `src/components/chat/ChatHeader.vue:1-38`
- Modify: `src/views/Chat.vue:1-264`
- Modify: `src/assets/main.css:composer and agent styles`

- [ ] **Step 1: Create the Agent picker component**

Create `AgentPicker.vue` with props `agents: AgentSummary[]`, `modelValue: AgentSummary | null`, and `disabled?: boolean`; use `update:modelValue` and `manage` emits. Filter source data in the parent, but defensively only render entries with `status === 1`.

Its select control must include the ordinary-chat option and send a copied summary or `null`:

```vue
<select
  :value="modelValue?.id ?? ''"
  :disabled="disabled"
  aria-label="选择 Agent"
  @change="emit('update:modelValue', agentById(Number(($event.target as HTMLSelectElement).value)) ?? null)"
>
  <option value="">普通对话</option>
  <option v-for="agent in enabledAgents" :key="agent.id" :value="agent.id">
    {{ agent.name }}
  </option>
</select>
```

When a selected Agent exists, render `模型 #{{ modelValue.modelId }} · {{ modelValue.knowledgeBaseIds.length }} 个知识库 · {{ modelValue.toolCodes.length }} 个工具`. When no enabled Agent exists, render a compact `创建 Agent` button that emits `manage`.

- [ ] **Step 2: Integrate Agent picker into Composer**

Modify `Composer.vue`:

1. Import `AgentPicker` and `AgentSummary`.
2. Add props `agents?: AgentSummary[]`, `selectedAgent?: AgentSummary | null`, and `agentLocked?: boolean` with defaults `[]`, `null`, and `false`.
3. Add emitted events `agentChange: [agent: AgentSummary | null]` and `manageAgents: []`.
4. Watch `props.agentLocked`; when it becomes true, clear `selectedKnowledgeBaseIds` and `selectedToolCodes`.
5. Place `<AgentPicker>` before `KnowledgeBasePicker` in `.composer__tools`.
6. Bind `:disabled="generating || submitting"`; on selection forward `emit('agentChange', $event)`.
7. Pass `:disabled="generating || submitting || agentLocked"` to both `KnowledgeBasePicker` and `ToolPicker`.
8. Render this explanatory text between the chips and composer box only when `agentLocked`:

```vue
<p class="composer__agent-lock" role="status">
  正在使用 Agent 配置；模型、知识库和工具由 Agent 固定。
</p>
```

Do not disable attachment controls or the textarea.

- [ ] **Step 3: Lock the chat header model select**

Modify `ChatHeader.vue` to accept `agent?: AgentSummary | null`, and make the select disabled when `modelDisabled || agent !== null`. Under the model selector, or via a visually hidden title/tooltip if space is constrained, render:

```vue
<span v-if="agent" class="model-select__locked" :title="`由 Agent“${agent.name}”固定`">Agent 已锁定</span>
```

The `modelChange` event must not emit when `agent` exists. Keep the actual shown model as the session/default model; it is an informational UI selection only because the backend resolves the Agent model for the request.

- [ ] **Step 4: Load eligible Agents and wire state in Chat view**

In `Chat.vue`:

- import `agentApi` and `AgentSummary`;
- add refs `agents`, `isLoadingAgents`, and `agentsError`;
- implement `loadAgents()` with `agentApi.list(1, 100)`, retain only `status === 1`, deduplicate by ID, and report `Agent 列表加载失败，请重试` through the existing toast;
- call `loadAgents()` with the initial `Promise.all` alongside models, sessions, and knowledge bases;
- derive `selectedAgent` using `workspace.selectedAgent(activeSessionId.value)`;
- set `agentLocked` to `selectedAgent.value !== null`;
- block `changeModel` when `agentLocked` is true;
- make `submitMessage` continue passing the existing manual values; workspace state deliberately ignores them when selected Agent exists;
- pass Agent props and events exactly as follows:

```vue
<ChatHeader
  :title="activeTitle"
  :model="activeModel"
  :models="selectableModels"
  :model-disabled="isLoadingModels || isChangingModel || isGenerating || agentLocked"
  :agent="selectedAgent"
  @menu="sidebarOpen = true"
  @settings="settingsOpen = true"
  @model-change="changeModel"
/>
<Composer
  ref="composerRef"
  :generating="isGenerating"
  :submitting="isUploading"
  :knowledge-bases="knowledgeBases"
  :available-tools="availableTools"
  :loading-tools="isLoadingTools"
  :tools-error="toolsError"
  :agents="agents"
  :selected-agent="selectedAgent"
  :agent-locked="agentLocked"
  @agent-change="(agent) => activeSessionId !== null && workspace.selectAgent(activeSessionId, agent)"
  @manage-agents="router.push({ name: 'agents' })"
  @submit="submitMessage"
  @invalid-files="notifyInvalidFiles"
  @knowledge-limit="notify"
  @tool-limit="notify"
  @open-knowledge-picker="loadKnowledgeBases"
  @open-tool-picker="loadAvailableTools"
  @stop="workspace.stopGeneration"
/>
```

If Agent loading failed, keep ordinary chat operational and let the picker show its empty/manage state; do not prevent message submission.

- [ ] **Step 5: Style picker and lock feedback**

Add only focused rules to `src/assets/main.css`:

```css
.agent-picker { display: flex; align-items: center; gap: 5px; min-height: 27px; padding: 0 6px; border: 1px solid var(--line); border-radius: 7px; color: var(--text-soft); }
.agent-picker select { max-width: 126px; border: 0; outline: 0; background: transparent; color: var(--text); font-size: 12px; }
.agent-picker__summary { max-width: 180px; overflow: hidden; color: var(--text-soft); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.agent-picker__manage { border: 0; background: transparent; color: var(--accent); font-size: 11px; }
.composer__agent-lock { margin: 0 0 8px; padding: 7px 9px; border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--line)); border-radius: 8px; background: var(--accent-soft); color: var(--accent); font-size: 11px; }
.model-select__locked { color: var(--text-soft); font-size: 10px; }
@media (max-width: 760px) {
  .agent-picker__summary, .model-select__locked { display: none; }
  .agent-picker select { max-width: 88px; }
}
```

Ensure disabled selectors follow the existing opacity and `cursor: not-allowed` convention.

- [ ] **Step 6: Type-check and production-build chat integration**

Run:

```bash
npm run type-check
npm run build
```

Expected: both commands exit with status `0`.

- [ ] **Step 7: Commit chat UI integration**

```bash
git add src/components/agent/AgentPicker.vue src/components/chat/Composer.vue src/components/chat/ChatHeader.vue src/views/Chat.vue src/assets/main.css
git commit -m "feat: add agent chat selection" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

### Task 7: Run the complete regression suite and manually verify the UI

**Files:**
- Modify only if verification identifies a concrete defect in files from Tasks 1–6.

- [ ] **Step 1: Refresh all Node-test outputs**

Run:

```bash
rm -rf .tmp-tests && npx tsc --ignoreConfig --outDir .tmp-tests --rootDir . --module NodeNext --moduleResolution NodeNext --target ES2022 --skipLibCheck src/api/client.ts src/api/chat.ts src/api/knowledge.ts src/api/agent.ts src/composables/useChatWorkspace.ts src/composables/useKnowledgeBaseWorkspace.ts src/composables/useAgentWorkspace.ts src/lib/chatAttachments.ts src/lib/knowledgeSelection.ts src/lib/toolSelection.ts src/lib/agentSelection.ts src/lib/sseParser.ts src/types/chat.ts src/types/agent.ts
```

Expected: exit status `0`; `.tmp-tests/` is generated and remains untracked.

- [ ] **Step 2: Run all Node regression tests**

Run:

```bash
node --test tests/apiClient.test.mjs tests/chatAttachments.test.mjs tests/chatWorkspace.test.mjs tests/knowledgeSelection.test.mjs tests/knowledgeWorkspace.test.mjs tests/toolSelection.test.mjs tests/agentSelection.test.mjs tests/agentWorkspace.test.mjs tests/sseParser.test.mjs
```

Expected: every test passes.

- [ ] **Step 3: Run final static and production checks**

Run:

```bash
npm run type-check
npm run build
git status --short
```

Expected: type check and build pass; `.tmp-tests/` is absent from Git status; only intentional source/test changes remain before the final commit.

- [ ] **Step 4: Manually validate the backend-connected flow**

Run the app using the repository run workflow, then verify in a browser while authenticated:

1. The new Agent navigation entry loads `/agents` and is active.
2. Create an Agent with a model, one knowledge base, and one tool; edit it; disable and re-enable it; verify list status text changes.
3. Delete a disposable Agent only after the confirmation dialog appears.
4. In `/chat`, select an enabled Agent and verify model, knowledge-base, and tool controls are disabled with the Agent explanation, while attachments still open.
5. Send a message and inspect the network request body: it contains `agentId`, contains file IDs if files were attached, and does not contain `modelId`, `knowledgeBaseIds`, or `toolCodes`.
6. Regenerate a response and inspect that its request also contains `agentId`.
7. Cancel Agent selection and verify ordinary chat resumes with manual model, knowledge-base, and tool choices.
8. Refresh the page and verify no Agent remains selected for the loaded session.

- [ ] **Step 5: Route any verification fix back through its owning task**

If verification reveals a concrete defect, update the task that owns the affected source file, re-run that task's focused test command followed by Steps 1–3 above, and use that task's explicit commit command. Do not create an empty verification commit.
