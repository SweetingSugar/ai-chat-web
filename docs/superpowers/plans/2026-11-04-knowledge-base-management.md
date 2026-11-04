# 知识库管理与聊天检索 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为已登录用户提供知识库及文档的完整管理界面，并允许聊天使用知识库检索和显示可展开的引用来源。

**Architecture:** 将现有侧栏拆为共享导航壳和保留会话列表能力的聊天侧栏，使 `/chat` 与知识库路由使用相同的主题、账户区和移动端抽屉。`knowledgeApi` 与 `useKnowledgeBaseWorkspace` 分别封装 HTTP 契约与分页/突变状态；页面组件只负责呈现与触发操作。Composer 本地维护知识库选择，工作区将选择注入首次 stream 请求，MessageList 渲染后端返回的 sources。

**Tech Stack:** Vue 3 Composition API、Vue Router 4、TypeScript、Fetch API/FormData、Node 内置测试运行器、Vite、vue-tsc。

---

## 文件结构与职责

- `src/types/chat.ts`：增加知识库、文档、嵌入模型和引用来源的后端契约；扩展聊天请求/消息/流事件类型。
- `src/api/knowledge.ts`：以现有 `apiRequest` 实现知识库和文档 API，以及嵌入模型列表。
- `src/lib/knowledgeSelection.ts`：不依赖 Vue 的十项选择限制和 ID 去重规则。
- `src/composables/useKnowledgeBaseWorkspace.ts`：管理列表、详情、文档分页、突变和可测试的错误状态。
- `src/components/layout/WorkspaceSidebar.vue`：共享品牌、知识库入口、账户区与移动端关闭行为。
- `src/components/chat/Sidebar.vue`：保留会话列表，并组合共享侧栏。
- `src/components/knowledge/KnowledgeBaseFormDialog.vue`：创建/编辑知识库及嵌入模型选择表单。
- `src/components/knowledge/TextDocumentDialog.vue`：新建文本知识文档表单。
- `src/components/knowledge/KnowledgeBaseList.vue`：可搜索的知识库卡片、加载/空/失败/更多状态。
- `src/components/knowledge/KnowledgeBaseDetail.vue`：知识库标题、文档管理、设置和破坏性操作。
- `src/components/chat/KnowledgeBasePicker.vue`：Composer 内的可搜索多选浮层与选中标签。
- `src/components/chat/KnowledgeSources.vue`：助手回答的可折叠来源卡片。
- `src/components/chat/Composer.vue`：保存所选知识库并与已有文本/附件一起提交。
- `src/components/chat/MessageList.vue`：在助手消息下渲染 `KnowledgeSources`。
- `src/views/Chat.vue`：加载可选知识库并把 selection 传给 Composer/工作区。
- `src/views/KnowledgeBases.vue`：基于路由参数协调知识库列表与详情视图、toast、抽屉和共享侧栏。
- `src/router/index.ts`：新增受认证保护的知识库路由。
- `src/components/common/AppIcon.vue`、`src/assets/main.css`：追加复用现有视觉语言的图标、布局、状态和响应式样式。
- `tests/apiClient.test.mjs`：覆盖知识库 HTTP 路径、JSON 负载与 multipart 文档上传。
- `tests/knowledgeSelection.test.mjs`：覆盖纯选择规则。
- `tests/knowledgeWorkspace.test.mjs`：覆盖分页、突变和失败恢复。
- `tests/chatWorkspace.test.mjs`：覆盖 `knowledgeBaseIds` 和流式来源保存。

测试转译统一使用以下命令（不要提交 `.tmp-tests`）：

```bash
rm -rf .tmp-tests && npx tsc --ignoreConfig --outDir .tmp-tests --rootDir . --module NodeNext --moduleResolution NodeNext --target ES2022 --skipLibCheck src/api/client.ts src/api/chat.ts src/api/knowledge.ts src/composables/useChatWorkspace.ts src/composables/useKnowledgeBaseWorkspace.ts src/lib/chatAttachments.ts src/lib/knowledgeSelection.ts src/lib/sseParser.ts src/types/chat.ts
```

---

### Task 1: 建立知识库与引用的前端契约和 API

**Files:**
- Modify: `src/types/chat.ts:1-128`
- Create: `src/api/knowledge.ts`
- Modify: `tests/apiClient.test.mjs:1-156`

- [ ] **Step 1: 写知识库 API 的失败测试**

在 `tests/apiClient.test.mjs` 导入 `knowledgeApi`，追加一项测试，统一验证创建知识库、加载嵌入模型和上传文档的请求契约：

```js
import { knowledgeApi } from '../.tmp-tests/src/api/knowledge.js'

test('calls knowledge-base APIs with JSON, query pagination, and multipart upload', async () => {
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push([String(url), options])
    return new Response(JSON.stringify({ success: true, code: 'SUCCESS', message: 'OK', data: { records: [], total: 0, current: 1, size: 20, pages: 0 } }), { status: 200 })
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
```

- [ ] **Step 2: 运行测试，确认 API 尚不存在**

运行测试转译命令后执行：

```bash
node --test tests/apiClient.test.mjs
```

预期：失败于找不到 `src/api/knowledge.ts` 或 `knowledgeApi` 导出；现有 API 测试通过。

- [ ] **Step 3: 补充精确 TypeScript 类型**

在 `src/types/chat.ts` 追加下列类型，并将 `knowledgeBaseIds?: number[]` 添加到 `ChatRequest`；`ChatRegenerateRequest` 保持 `Omit<ChatRequest, 'content'>`：

```ts
export interface EmbeddingModel {
  id: number
  providerId: number
  providerName: string
  modelCode: string
  modelName: string
  embeddingDimension: number
}

export type KnowledgeBaseStatus = 'ACTIVE' | 'REINDEXING' | 'DISABLED' | string
export type KnowledgeDocumentSourceType = 'TEXT' | 'FILE' | string
export type KnowledgeDocumentStatus = 'PENDING' | 'INDEXING' | 'COMPLETED' | 'FAILED' | string

export interface KnowledgeBase {
  id: number
  name: string
  description: string | null
  embeddingModelId: number
  embeddingModelVersion: number | null
  pendingEmbeddingModelId: number | null
  pendingEmbeddingModelVersion: number | null
  activeIndexVersion: number | null
  reindexing: boolean
  status: KnowledgeBaseStatus
  createTime: string
  updateTime: string
}

export interface KnowledgeDocument {
  id: number
  title: string
  sourceType: KnowledgeDocumentSourceType
  fileId: number | null
  status: KnowledgeDocumentStatus
  indexVersion: number | null
  activeIndexVersion: number | null
  chunkCount: number | null
  errorCode: string | null
  errorMessage: string | null
  createTime: string
  updateTime: string
}

export interface KnowledgeSource {
  knowledgeBaseId: number
  documentId: number
  chunkId: number
  title: string
  content: string
  score: number
  rank: number
}
```

扩展 `ChatMessage` 与 `ChatStreamEvent`：分别增加 `sources?: KnowledgeSource[]` 与 `sources: KnowledgeSource[] | null`。这些 optional/nullable 声明兼容没有知识库的既有消息和 SSE 事件。

- [ ] **Step 4: 实现 API 模块**

创建 `src/api/knowledge.ts`。该模块仅调用 `apiRequest`，不保存 Vue 状态：

```ts
import { apiRequest } from './client.js'
import type { EmbeddingModel, KnowledgeBase, KnowledgeDocument, PageResult } from '../types/chat.js'

export const knowledgeApi = {
  list(page = 1, size = 20) {
    return apiRequest<PageResult<KnowledgeBase>>(`/api/knowledge-bases?page=${page}&size=${size}`)
  },
  get(id: number) { return apiRequest<KnowledgeBase>(`/api/knowledge-bases/${id}`) },
  create(payload: { name: string; description?: string; embeddingModelId: number }) {
    return apiRequest<KnowledgeBase>('/api/knowledge-bases', { method: 'POST', body: JSON.stringify(payload) })
  },
  update(id: number, payload: { name: string; description?: string }) {
    return apiRequest<KnowledgeBase>(`/api/knowledge-bases/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
  },
  delete(id: number) { return apiRequest<null>(`/api/knowledge-bases/${id}`, { method: 'DELETE' }) },
  changeEmbeddingModel(id: number, embeddingModelId: number) {
    return apiRequest<KnowledgeBase>(`/api/knowledge-bases/${id}/embedding-model`, { method: 'PUT', body: JSON.stringify({ embeddingModelId }) })
  },
  listDocuments(id: number, page = 1, size = 20) {
    return apiRequest<PageResult<KnowledgeDocument>>(`/api/knowledge-bases/${id}/documents?page=${page}&size=${size}`)
  },
  addTextDocument(id: number, payload: { title: string; content: string }) {
    return apiRequest<KnowledgeDocument>(`/api/knowledge-bases/${id}/documents/text`, { method: 'POST', body: JSON.stringify(payload) })
  },
  uploadDocument(id: number, file: File, title?: string) {
    const body = new FormData()
    body.append('file', file)
    if (title?.trim()) body.append('title', title.trim())
    return apiRequest<KnowledgeDocument>(`/api/knowledge-bases/${id}/documents/file`, { method: 'POST', body })
  },
  deleteDocument(baseId: number, documentId: number) {
    return apiRequest<null>(`/api/knowledge-bases/${baseId}/documents/${documentId}`, { method: 'DELETE' })
  },
  retryDocument(baseId: number, documentId: number) {
    return apiRequest<null>(`/api/knowledge-bases/${baseId}/documents/${documentId}/retry`, { method: 'POST' })
  },
  listEmbeddingModels() { return apiRequest<EmbeddingModel[]>('/api/chat/models/embedding') },
}
```

- [ ] **Step 5: 运行 API 测试确认通过**

运行测试转译命令和：

```bash
node --test tests/apiClient.test.mjs
npm run type-check
```

预期：全部 API 测试 PASS；TypeScript 接受 `FormData` 并确认 JSON 与 multipart 请求使用现有动态认证路径。

- [ ] **Step 6: 提交契约与 API**

```bash
git add src/types/chat.ts src/api/knowledge.ts tests/apiClient.test.mjs
git commit -m "feat: add knowledge base API"
```

---

### Task 2: 实现可测试的知识库选择限制

**Files:**
- Create: `src/lib/knowledgeSelection.ts`
- Create: `tests/knowledgeSelection.test.mjs`

- [ ] **Step 1: 写十项限制和去重的失败测试**

创建 `tests/knowledgeSelection.test.mjs`：

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { KNOWLEDGE_BASE_LIMIT, toggleKnowledgeBase } from '../.tmp-tests/src/lib/knowledgeSelection.js'

test('selects unique knowledge bases up to ten and reports the limit', () => {
  const firstNine = Array.from({ length: 9 }, (_, index) => index + 1)
  assert.deepEqual(toggleKnowledgeBase(firstNine, 10), { ids: [...firstNine, 10], error: null })
  assert.deepEqual(toggleKnowledgeBase([...firstNine, 10], 11), { ids: [...firstNine, 10], error: '最多可选择 10 个知识库' })
  assert.equal(KNOWLEDGE_BASE_LIMIT, 10)
})

test('removes an already-selected knowledge base', () => {
  assert.deepEqual(toggleKnowledgeBase([3, 4, 5], 4), { ids: [3, 5], error: null })
})
```

- [ ] **Step 2: 运行测试确认失败**

运行测试转译命令，然后：

```bash
node --test tests/knowledgeSelection.test.mjs
```

预期：失败，提示 `knowledgeSelection.js` 不存在。

- [ ] **Step 3: 实现纯选择模块**

创建 `src/lib/knowledgeSelection.ts`：

```ts
export const KNOWLEDGE_BASE_LIMIT = 10

export function toggleKnowledgeBase(current: number[], id: number) {
  if (current.includes(id)) return { ids: current.filter((item) => item !== id), error: null }
  if (current.length >= KNOWLEDGE_BASE_LIMIT) return { ids: [...current], error: `最多可选择 ${KNOWLEDGE_BASE_LIMIT} 个知识库` }
  return { ids: [...current, id], error: null }
}
```

不要在此模块过滤后端状态；选择器展示的列表就是可选范围，后端仍是最终授权和可用性判断方。

- [ ] **Step 4: 运行测试确认通过并提交**

```bash
node --test tests/knowledgeSelection.test.mjs
git add src/lib/knowledgeSelection.ts tests/knowledgeSelection.test.mjs
git commit -m "feat: add knowledge base selection rules"
```

预期：两个测试 PASS。

---

### Task 3: 建立知识库工作区状态与回归测试

**Files:**
- Create: `src/composables/useKnowledgeBaseWorkspace.ts`
- Create: `tests/knowledgeWorkspace.test.mjs`

- [ ] **Step 1: 写工作区分页、创建、文档重试的失败测试**

创建 `tests/knowledgeWorkspace.test.mjs`，fake API 仅实现将被工作区 Pick 的方法。至少包括下列行为：

```js
const base = (id, name) => ({ id, name, description: null, embeddingModelId: 7, embeddingModelVersion: 1, pendingEmbeddingModelId: null, pendingEmbeddingModelVersion: null, activeIndexVersion: 1, reindexing: false, status: 'ACTIVE', createTime: '2026-11-04T10:00:00', updateTime: '2026-11-04T10:00:00' })

test('loads pages, prepends a created base, and opens it', async () => {
  const api = createFakeApi({ pages: [{ records: [base(1, '手册')], total: 1, current: 1, size: 20, pages: 1 }], created: base(2, '规范') })
  const workspace = createKnowledgeBaseWorkspace({ api })
  await workspace.loadBases()
  await workspace.createBase({ name: '规范', description: '', embeddingModelId: 7 })
  assert.deepEqual(workspace.bases.value.map(({ id }) => id), [2, 1])
  assert.equal(workspace.selectedBaseId.value, 2)
})

test('retries a failed document and replaces its returned row', async () => {
  const api = createFakeApi({ detail: base(1, '手册'), documents: [{ records: [{ id: 8, title: '失败文档', status: 'FAILED', sourceType: 'FILE', fileId: 6, indexVersion: null, activeIndexVersion: 1, chunkCount: null, errorCode: 'INDEX_FAILED', errorMessage: '索引失败', createTime: '2026-11-04T10:00:00', updateTime: '2026-11-04T10:00:00' }], total: 1, current: 1, size: 20, pages: 1 }] })
  const workspace = createKnowledgeBaseWorkspace({ api })
  await workspace.openBase(1)
  await workspace.retryDocument(8)
  assert.deepEqual(api.calls.at(-1), ['retryDocument', 1, 8])
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
node --test tests/knowledgeWorkspace.test.mjs
```

预期：失败，提示组合式函数尚未导出。

- [ ] **Step 3: 实现工作区的受限 API、状态和突变规则**

创建 `src/composables/useKnowledgeBaseWorkspace.ts`。使用 `ref`、`computed` 和以下结构：

```ts
export type KnowledgeBaseWorkspaceApi = Pick<typeof knowledgeApi,
  'list' | 'get' | 'create' | 'update' | 'delete' | 'changeEmbeddingModel' |
  'listDocuments' | 'addTextDocument' | 'uploadDocument' | 'deleteDocument' | 'retryDocument'>

export function createKnowledgeBaseWorkspace(options: { api?: KnowledgeBaseWorkspaceApi; pageSize?: number } = {}) {
  const api = options.api ?? knowledgeApi
  const pageSize = options.pageSize ?? 20
  const bases = ref<KnowledgeBase[]>([])
  const selectedBase = ref<KnowledgeBase | null>(null)
  const documents = ref<KnowledgeDocument[]>([])
  const basesError = ref<string | null>(null)
  const detailError = ref<string | null>(null)
  const documentsError = ref<string | null>(null)
  const isLoadingBases = ref(false)
  const isLoadingDetail = ref(false)
  const isLoadingDocuments = ref(false)
  const isMutating = ref(false)
  const basePage = ref(0)
  const basePages = ref(0)
  const documentPage = ref(0)
  const documentPages = ref(0)
  // Return hasMoreBases/hasMoreDocuments computed refs and all actions below.
}
```

`loadBases()` resets list and requests page 1; `loadMoreBases()` appends only while `basePage < basePages`. `openBase(id)` fetches the base then resets and loads document page 1. All methods catch an `Error` message into their relevant error ref and rethrow so `KnowledgeBases.vue` can toast it.

For mutations: `createBase` unshifts the returned base and assigns it to `selectedBase`; `updateBase` and `changeEmbeddingModel` replace both `selectedBase` and matching list item; `deleteBase` removes it and clears selected documents when applicable; `addTextDocument`/`uploadDocument` unshift returned rows; `deleteDocument` filters the row; `retryDocument` calls the endpoint then reloads document page 1 because retry returns no document body. Guard every mutation with `isMutating` and reset it in `finally`.

- [ ] **Step 4: 运行工作区测试并补齐失败恢复覆盖**

给测试追加：当 `list()` 拒绝 `new Error('加载失败')` 时，`basesError.value === '加载失败'` 且 `isLoadingBases.value === false`。然后运行：

```bash
node --test tests/knowledgeWorkspace.test.mjs
```

预期：分页、创建定位、文档重试和错误复位全部 PASS。

- [ ] **Step 5: 提交工作区状态层**

```bash
git add src/composables/useKnowledgeBaseWorkspace.ts tests/knowledgeWorkspace.test.mjs
git commit -m "feat: add knowledge base workspace"
```

---

### Task 4: 抽取共享侧栏并注册知识库路由

**Files:**
- Create: `src/components/layout/WorkspaceSidebar.vue`
- Modify: `src/components/chat/Sidebar.vue:1-158`
- Modify: `src/components/common/AppIcon.vue:9-34`
- Modify: `src/router/index.ts:4-35`
- Modify: `src/assets/main.css:11-67,140-145`

- [ ] **Step 1: 添加知识库图标路径**

在 `AppIcon.vue` 的 `file` 分支附近添加：

```vue
<path v-else-if="name === 'book'" d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v17H7.5A2.5 2.5 0 0 0 5 21.5Zm0-17v17M8.5 6H16M8.5 10H16" />
```

- [ ] **Step 2: 实现共享侧栏**

创建 `WorkspaceSidebar.vue`，接收 `user`、`mobileOpen`，发射 `closeMobile`。它必须保留现有品牌和 footer，使用 `RouterLink` 将以下入口渲染在“新建对话”下方：

```vue
<RouterLink class="workspace-nav__item" active-class="workspace-nav__item--active" :to="{ name: 'knowledge-bases' }" @click="emit('closeMobile')">
  <AppIcon name="book" size="16" /><span>知识库</span>
</RouterLink>
```

父级 `<aside>` 必须保留 `sidebar`、`sidebar--mobile-open` 和移动端关闭按钮，保证现有样式和抽屉逻辑不变。插槽暴露给聊天专属的新建按钮、搜索与会话列表。

- [ ] **Step 3: 让聊天 Sidebar 使用共享壳**

将现有 `Sidebar.vue` 的品牌、根 `<aside>`、footer 与关闭按钮移动到 `WorkspaceSidebar`；会话专属内容通过默认插槽放入。原有的 session emits、滚动加载、重命名、删除和样式类不得改名。新增一个插槽内 `RouterLink` 到 `{ name: 'chat' }`，包装现有新建对话按钮；点击该按钮仍 emit `newChat`。

- [ ] **Step 4: 注册路由**

在 `src/router/index.ts` 添加：

```ts
{
  path: '/knowledge-bases',
  name: 'knowledge-bases',
  component: () => import('../views/KnowledgeBases.vue'),
  meta: { requiresAuth: true },
},
{
  path: '/knowledge-bases/:id',
  name: 'knowledge-base-detail',
  component: () => import('../views/KnowledgeBases.vue'),
  meta: { requiresAuth: true },
},
```

将登录页重定向逻辑中仅比较 `/chat` 的条件替换为 `to.name === 'chat' ? {} : { redirect: to.fullPath }`，这样从知识库页失效后登录会返回原页面。

- [ ] **Step 5: 添加共享导航 CSS 并执行静态检查**

在现有新建对话样式后添加 `.workspace-nav` 和 `.workspace-nav__item`，样式采用会话项的 42px 高度、10px 圆角、hover/active 左侧 accent inset shadow。确保 `.workspace-nav__item--active` 与 `.conversation-item--active` 的视觉规则一致，移动端不新增不同断点。

运行：

```bash
npm run type-check
npm run build
```

预期：路由懒加载、`RouterLink` 与插槽 props 均通过类型检查，生产构建成功。

- [ ] **Step 6: 提交导航基础设施**

```bash
git add src/components/layout/WorkspaceSidebar.vue src/components/chat/Sidebar.vue src/components/common/AppIcon.vue src/router/index.ts src/assets/main.css
git commit -m "feat: add knowledge base navigation"
```

---

### Task 5: 实现知识库管理界面和操作对话框

**Files:**
- Create: `src/components/knowledge/KnowledgeBaseFormDialog.vue`
- Create: `src/components/knowledge/TextDocumentDialog.vue`
- Create: `src/components/knowledge/KnowledgeBaseList.vue`
- Create: `src/components/knowledge/KnowledgeBaseDetail.vue`
- Create: `src/views/KnowledgeBases.vue`
- Modify: `src/assets/main.css:146-184`

- [ ] **Step 1: 实现两个受控表单对话框**

`KnowledgeBaseFormDialog.vue` props 为 `open`、`base?: KnowledgeBase | null`、`models: EmbeddingModel[]`、`submitting`；emit `close` 和 `submit(payload)`。创建时显示必填模型 `<select>`，编辑时显示名称、描述和一个模型变更 select。输入约束必须为：`name maxlength="100" required`、`description maxlength="1000"`。提交 payload 为：

```ts
{ name: name.value.trim(), description: description.value.trim() || undefined, embeddingModelId: Number(embeddingModelId.value) }
```

`TextDocumentDialog.vue` props 为 `open`、`submitting`，emit `close` 和 `submit({ title, content })`。使用 `title maxlength="255" required` 与 `textarea maxlength="1000000" required`。关闭不提交，父页重新打开时初始化空表单。

二者复用现有 `.auth-modal-overlay`/`.auth-modal` 表现形式，支持 Escape、点击遮罩关闭（提交中禁止关闭）和明确的取消/保存按钮。

- [ ] **Step 2: 实现列表组件**

`KnowledgeBaseList.vue` 接收 `bases`、`loading`、`loadingMore`、`error`、`hasMore`，emit `create`、`open(id)`、`loadMore`、`retry`。本地 `query` 使用 `name` 和 `description ?? ''` 过滤，不再发额外搜索 API。

每张卡使用 `button` 语义并显示 `base.name`、描述或“暂无描述”、`base.status`、`base.reindexing ? '正在重建索引' : '索引已就绪'` 与 `new Date(base.updateTime).toLocaleString('zh-CN')`。在 card 容器 scroll 到距底部 48px 时 emit `loadMore`；空状态文字为“还没有知识库，创建一个开始整理资料吧”。

- [ ] **Step 3: 实现详情组件**

`KnowledgeBaseDetail.vue` 接收选中的 `base`、`documents`、`loading`、`loadingMore`、`error`、`hasMore`、`mutating`。发射 `back`、`edit`、`changeModel`、`deleteBase`、`addText`、`upload(file)`、`deleteDocument(id)`、`retryDocument(id)`、`loadMore`、`retry`。

文件 input 使用隐藏控件和 `@change="emit('upload', ($event.target as HTMLInputElement).files?.[0])"`；父页忽略 undefined。每条文档显示：标题、`TEXT`→“文本”、其他→“文件”、状态、非 null 的 `chunkCount`、失败时 `errorMessage`。仅 `document.status === 'FAILED'` 显示重试按钮。删除知识库和文档前分别调用：

```ts
window.confirm(`确定删除“${base.name}”及其全部文档吗？`)
window.confirm(`确定删除文档“${document.title}”吗？`)
```

- [ ] **Step 4: 协调页面路由、工作区、模型和 toast**

创建 `KnowledgeBases.vue`。使用 `useRoute()`/`useRouter()`、`useAuth()`、`createKnowledgeBaseWorkspace()` 和 `knowledgeApi.listEmbeddingModels()`。在 `onMounted` 并行加载 `workspace.loadBases()` 和模型；watch `route.params.id`，有合法数字时 `workspace.openBase(id)`，否则清除详情选择。首次创建成功 `router.push({ name: 'knowledge-base-detail', params: { id: created.id } })`；删除当前知识库后 `router.push({ name: 'knowledge-bases' })`。

复制 `Chat.vue` 的 `sidebarOpen`、theme 初始化/watcher、401 登录跳转、`notify()` timer、mobile backdrop、`SettingsDrawer` 和 toast 结构。用 `WorkspaceSidebar` 放入主壳，主内容在没有 `:id` 时显示 `KnowledgeBaseList`，否则显示 `KnowledgeBaseDetail`。任意工作区异常由 async handler `catch` 后 `notify(error instanceof Error ? error.message : '操作失败，请重试')` 显示；成功操作显示“知识库已创建”“知识库已更新”“文档已添加”等 toast。

- [ ] **Step 5: 添加一致的样式与窄屏布局**

在 `main.css` 末尾增加以 `knowledge-page`、`knowledge-header`、`knowledge-grid`、`knowledge-card`、`knowledge-detail`、`document-row`、`status-badge`、`form-actions` 命名的规则。必须使用现有 CSS variables、12px 卡片圆角、`var(--line)` 边框和 existing shadow；不要引入硬编码亮/暗主题色。

在已有 760px 媒体查询中让卡片栅格变为单列、标题操作换行、文档行可纵向堆叠，且保留 `max(18px, env(safe-area-inset-bottom))` 底部空间。

- [ ] **Step 6: 执行构建验证并提交管理界面**

```bash
npm run type-check
npm run build
git add src/components/knowledge src/views/KnowledgeBases.vue src/assets/main.css
git commit -m "feat: add knowledge base management"
```

预期：Vue 模板事件负载、路由参数、表单 ref 和 upload optional 值全部通过类型检查。

---

### Task 6: 在 Composer 中选择知识库并传入聊天请求

**Files:**
- Create: `src/components/chat/KnowledgeBasePicker.vue`
- Modify: `src/components/chat/Composer.vue:1-94`
- Modify: `src/views/Chat.vue:1-221`
- Modify: `src/composables/useChatWorkspace.ts:1-428`
- Modify: `tests/chatWorkspace.test.mjs:16-400`
- Modify: `src/assets/main.css:123-144`

- [ ] **Step 1: 写知识库请求和流式来源的失败测试**

在 `tests/chatWorkspace.test.mjs` 追加：

```js
test('sends selected knowledge-base IDs and retains stream sources', async () => {
  const source = { knowledgeBaseId: 4, documentId: 8, chunkId: 12, title: '员工手册', content: '请假规则', score: 0.93, rank: 1 }
  const api = createFakeApi({
    streamEvents: [
      { type: 'START', requestId: 'req-1', taskId: 50, assistantMessageId: 11, modelId: 3, sources: [] },
      { type: 'COMPLETE', requestId: 'req-1', taskId: 50, assistantMessageId: 11, usage: null, sources: [source] },
    ],
    details: { 1: { session: session(1, '知识库问题'), messages: [] } },
  })
  const workspace = createChatWorkspace({ api, initialSessions: [session(1, '新会话')] })
  await workspace.submit('请说明请假规则', 3, [], true, [4])
  const request = api.calls.find(([name]) => name === 'stream')[2]
  assert.deepEqual(request.knowledgeBaseIds, [4])
  assert.deepEqual(workspace.messages.value[1].sources, [source])
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
node --test tests/chatWorkspace.test.mjs
```

预期：新增断言失败，因为 `submit` 尚未接收 IDs 且 COMPLETE 尚未保存 sources。

- [ ] **Step 3: 更新工作区发送路径**

在 `handleStreamEvent` 的 COMPLETE 分支设置：

```ts
assistant.sources = event.sources ?? []
```

`createMessage` 初始化 `sources: []`。将 `generateAssistant` 加入末尾参数 `knowledgeBaseIds?: number[]`，并仅在非 regenerate 且 `knowledgeBaseIds?.length` 时写入请求：

```ts
if (!regenerate && knowledgeBaseIds?.length) request.knowledgeBaseIds = knowledgeBaseIds
```

将 `submit` 扩展为：

```ts
async function submit(content: string, defaultModelId?: number, files: AttachmentCandidate[] = [], supportVision = true, knowledgeBaseIds: number[] = [])
```

并最终调用 `generateAssistant(sessionId, assistantMessage, value, false, fileIds, knowledgeBaseIds)`。`retry` 和 `regenerate` 不传 IDs，确保后端使用持久化的消息绑定。

- [ ] **Step 4: 实现受控选择器**

创建 `KnowledgeBasePicker.vue`，props 为 `bases: KnowledgeBase[]`、`modelValue: number[]`、`disabled`，emit `update:modelValue`、`limit`。它有一个“知识库”工具按钮和条件 popover；本地 `query` 按名字过滤；每项 checkbox 使用 `toggleKnowledgeBase()`。函数遇到限制时 emit `limit(error)`，否则 emit 新 IDs。按钮下方由 Composer 展示 `selectedBases` 的 `knowledge-chip`，每项有可访问的移除按钮。

外部点击时用 `onMounted`/`onBeforeUnmount` 监听 document click；popover 内 click 使用 `.stop`。关闭后不清空已选项。

- [ ] **Step 5: 将选择器接入 Composer 与 Chat 页面**

将 Composer props 扩展为 `knowledgeBases: KnowledgeBase[]`，`submit` payload 扩展为：

```ts
{ content: string; files: File[]; knowledgeBaseIds: number[] }
```

本地 `selectedKnowledgeBaseIds` 只有在 `clear()` 后才清空；这保证网络或上传失败后选择仍保留。放置 `KnowledgeBasePicker` 于 `composer__tools`、已有附件按钮后；`@limit` 转发新增 `knowledge-limit` emit。

在 `Chat.vue` 增加：

```ts
const knowledgeBases = ref<KnowledgeBase[]>([])
async function loadKnowledgeBases() {
  knowledgeBases.value = (await knowledgeApi.list(1, 100)).records
}
```

在 `onMounted` 的 `Promise.all` 加入 `loadKnowledgeBases()`；加载失败时通知“知识库列表加载失败”，但不阻塞聊天。`submitMessage` 将 `payload.knowledgeBaseIds` 作为第五参数传入 `workspace.submit`。模板为 Composer 绑定 `:knowledge-bases="knowledgeBases"`，并把 `@knowledge-limit="notify"` 连接到现有 toast。

- [ ] **Step 6: 运行工作区测试和类型检查**

```bash
node --test tests/chatWorkspace.test.mjs
npm run type-check
```

预期：既有附件、纯聊天和 regenerate 测试仍通过；新增测试断言首次 stream 请求有 `[4]`，COMPLETE 来源在乐观助手消息上保留。

- [ ] **Step 7: 提交聊天检索选择**

```bash
git add src/components/chat/KnowledgeBasePicker.vue src/components/chat/Composer.vue src/views/Chat.vue src/composables/useChatWorkspace.ts tests/chatWorkspace.test.mjs src/assets/main.css
git commit -m "feat: select knowledge bases for chat"
```

---

### Task 7: 展示历史与流式回答的参考来源并完成验收

**Files:**
- Create: `src/components/chat/KnowledgeSources.vue`
- Modify: `src/components/chat/MessageList.vue:1-81`
- Modify: `src/assets/main.css:100-122`
- Modify: `tests/chatWorkspace.test.mjs`

- [ ] **Step 1: 实现折叠来源组件**

创建 `KnowledgeSources.vue`，接收 `sources: KnowledgeSource[]`。仅有来源时渲染原生 `<details class="knowledge-sources">`，摘要为 `参考来源（{{ sources.length }}）`。逐项显示：

```vue
<article v-for="source in sources" :key="`${source.knowledgeBaseId}-${source.documentId}-${source.chunkId}`" class="knowledge-source">
  <div><strong>{{ source.title }}</strong><span>相关度 {{ Math.round(source.score * 100) }}% · #{{ source.rank }}</span></div>
  <p>{{ source.content }}</p>
</article>
```

不要用 `v-html`，来源文本必须作为纯文本输出。

- [ ] **Step 2: 接入消息列表**

在 `MessageList.vue` 导入组件，并在助手内容后、操作按钮前插入：

```vue
<KnowledgeSources
  v-if="message.role === 'ASSISTANT' && message.status !== 'STREAMING' && message.sources?.length"
  :sources="message.sources"
/>
```

完成流立即显示来源；历史 detail 返回的 message 已携带 sources，因此不需要另一套加载逻辑。

- [ ] **Step 3: 添加样式**

添加 `.knowledge-sources`、`.knowledge-sources summary`、`.knowledge-source`、`.knowledge-source p` 等规则：卡片最大宽度跟随 assistant message、使用 `var(--surface-soft)`、`var(--line)`、10–12px 辅助文字，不改变用户消息气泡；在 760px 下不让摘要或内容横向溢出。

- [ ] **Step 4: 扩展测试，确认历史来源保留**

在 `tests/chatWorkspace.test.mjs` 增加一个 `initialMessages` 带 `sources: [source]` 的 workspace，并断言 `workspace.messages.value[0].sources[0].title === '员工手册'`。这保证 `loadSessionDetail()` 的浅拷贝不会丢失后端来源字段。

- [ ] **Step 5: 运行所有自动化和静态验证**

```bash
rm -rf .tmp-tests && npx tsc --ignoreConfig --outDir .tmp-tests --rootDir . --module NodeNext --moduleResolution NodeNext --target ES2022 --skipLibCheck src/api/client.ts src/api/chat.ts src/api/knowledge.ts src/composables/useChatWorkspace.ts src/composables/useKnowledgeBaseWorkspace.ts src/lib/chatAttachments.ts src/lib/knowledgeSelection.ts src/lib/sseParser.ts src/types/chat.ts
node --test tests/apiClient.test.mjs tests/chatAttachments.test.mjs tests/chatWorkspace.test.mjs tests/knowledgeSelection.test.mjs tests/knowledgeWorkspace.test.mjs tests/sseParser.test.mjs
npm run type-check
npm run build
git diff --check
```

预期：所有 Node 测试、类型检查、生产构建和空白检查 PASS。

- [ ] **Step 6: 进行浏览器验收并提交**

启动：

```bash
npm run dev -- --host localhost
```

在后端运行且已登录时验证：

1. 桌面和窄屏均能从侧栏进入知识库、浏览器前进/后退和直接 URL 可用。
2. 创建、编辑、删除知识库，及切换嵌入模型均更新卡片/详情和 toast；删除必须确认。
3. 文件和文本可添加，文档状态、失败错误、失败重试、删除和分页可用。
4. 聊天中选择 1–10 个知识库可见标签；第 11 个显示 toast；发送 JSON 包含 `knowledgeBaseIds`。
5. 故意让首次 stream 或文件上传失败时，文字、附件和知识库选择都保留。
6. 助手流结束后及刷新历史会话后，均显示默认折叠的“参考来源（N）”；展开项显示标题、片段、相关度、排名。
7. 普通聊天、聊天附件、模型切换、重新生成、深色模式和移动端侧栏不回归。

然后提交：

```bash
git add src/components/chat/KnowledgeSources.vue src/components/chat/MessageList.vue src/assets/main.css tests/chatWorkspace.test.mjs
git commit -m "feat: show chat knowledge sources"
```
