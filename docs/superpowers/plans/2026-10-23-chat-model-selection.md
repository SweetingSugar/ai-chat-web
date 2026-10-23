# 聊天界面模型选择接口接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 接入 `GET /api/chat/models`，让聊天界面展示用户可用模型，并将选择持久化到当前会话，使后续请求使用所选模型。

**Architecture:** 保持 `Chat.vue → ChatHeader → useChatWorkspace → chatApi` 的现有依赖方向。`chatApi` 负责模型查询，`Chat.vue` 负责模型列表加载和提示，`useChatWorkspace` 负责当前会话模型的持久化更新；流式发送、重试和重新生成继续从当前会话的 `defaultModelId` 构造 `modelId`。模型列表加载失败不阻塞会话加载，切换模型失败时不改变本地会话状态。

**Tech Stack:** Vue 3 Composition API、TypeScript、Fetch API、现有 `apiRequest`、Node 内置测试运行器、Vite/Vue TSC。

---

## 文件结构与职责

- `src/api/chat.ts`：修正 `listModels()` 的后端路径，保持 `ModelSummary[]` 返回类型。
- `src/composables/useChatWorkspace.ts`：新增会话模型更新状态和 `changeModel(modelId)`，以服务端返回的会话对象更新本地会话。
- `src/components/chat/ChatHeader.vue`：接收模型选项并渲染下拉列表；在加载、保存或生成期间禁用选择器。
- `src/views/Chat.vue`：加载模型列表、去重、提供当前模型降级项、调用模型切换并展示结果。
- `tests/apiClient.test.mjs`：覆盖模型接口路径和请求结果解析。
- `tests/chatWorkspace.test.mjs`：覆盖模型持久化、失败回滚语义和生成中禁止切换。

---

### Task 1: 修正模型查询 API 并添加请求测试

**Files:**
- Modify: `tests/apiClient.test.mjs`
- Modify: `src/api/chat.ts:15-53`

- [ ] **Step 1: 在 API 测试中写模型查询的失败测试**

在 `tests/apiClient.test.mjs` 中导入 `chatApi`，增加一个可观察 URL 和返回值的测试。测试先按目标路径调用 API，因此在实现仍使用旧路径时应失败：

```js
import { chatApi } from '../.tmp-tests/src/api/chat.js'

// ...保留文件中已有的测试...

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
        defaultModel: false,
      }],
    }), { status: 200 })
  }

  const models = await chatApi.listModels()

  assert.equal(requestedUrl, '/api/chat/models')
  assert.equal(models[0].id, 7)
  assert.equal(models[0].modelCode, 'gpt-test')
})
```

保持测试数据字段与现有 `ModelSummary` 类型一致；不要在测试中引入新的后端字段。

- [ ] **Step 2: 运行 API 测试确认当前实现失败**

先按仓库现有测试约定生成 `.tmp-tests`（若当前环境已有该目录则直接复用），运行：

```bash
node --test tests/apiClient.test.mjs
```

预期：新增测试失败，失败原因是实际请求仍为 `/api/ai/models`，或模型 API 方法未被正确导入。

- [ ] **Step 3: 将生产 API 路径改为 `/api/chat/models`**

在 `src/api/chat.ts` 中只修改模型查询路径，保留现有泛型和方法形状：

```ts
listModels() {
  return apiRequest<ModelSummary[]>('/api/chat/models')
},
```

不要在这里做模型去重或 UI 降级；这些属于页面展示职责。

- [ ] **Step 4: 运行 API 测试确认通过**

```bash
node --test tests/apiClient.test.mjs
```

预期：API client 测试全部 PASS，包括新模型路径测试、SSE 测试和错误响应测试。

- [ ] **Step 5: 提交 API 变更**

```bash
git add src/api/chat.ts tests/apiClient.test.mjs
git commit -m "feat: use chat models endpoint"
```

---

### Task 2: 为工作区增加会话模型持久化能力

**Files:**
- Modify: `tests/chatWorkspace.test.mjs`
- Modify: `src/composables/useChatWorkspace.ts:5-15, 53-67, 164-177, 344-371`

- [ ] **Step 1: 扩展工作区测试 fake API 以支持可控的模型更新**

在 `tests/chatWorkspace.test.mjs` 的 `createFakeApi` 参数中增加 `updateSessionError = null`，将现有 `updateSession` 替换为：

```js
updateSessionError = null,
// ...
updateSession: async (id, payload) => {
  calls.push(['updateSession', id, payload])
  if (updateSessionError) throw updateSessionError
  return { ...session(id, payload.title ?? `会话 ${id}`), ...payload }
},
```

这样现有重命名测试仍然可用，新测试可以验证失败时本地会话没有被替换。

- [ ] **Step 2: 写模型切换成功和请求参数测试**

在 `tests/chatWorkspace.test.mjs` 末尾增加：

```js
test('persists the selected model on the active session', async () => {
  const api = createFakeApi()
  const workspace = createChatWorkspace({ api, initialSessions: [session(1, '会话 1')] })

  const updated = await workspace.changeModel(8)

  assert.equal(updated.defaultModelId, 8)
  assert.equal(workspace.activeSession.value.defaultModelId, 8)
  assert.equal(workspace.isChangingModel.value, false)
  assert.deepEqual(api.calls, [['updateSession', 1, { defaultModelId: 8 }]])
})
```

- [ ] **Step 3: 写模型切换失败和生成中禁止切换测试**

继续增加以下测试。第一个验证失败后仍保留原模型；第二个用未完成的 stream 验证生成期间不会调用 `updateSession`：

```js
test('keeps the previous model when saving the selection fails', async () => {
  const api = createFakeApi({ updateSessionError: new Error('模型不可用') })
  const workspace = createChatWorkspace({ api, initialSessions: [session(1, '会话 1')] })

  await assert.rejects(() => workspace.changeModel(8), /模型不可用/)

  assert.equal(workspace.activeSession.value.defaultModelId, 3)
  assert.equal(workspace.isChangingModel.value, false)
  assert.deepEqual(api.calls, [['updateSession', 1, { defaultModelId: 8 }]])
})

test('does not change the model while a response is generating', async () => {
  const api = createFakeApi({ initialSessions: [] })
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
```

- [ ] **Step 4: 运行新增测试确认当前工作区缺少实现**

```bash
node --test tests/chatWorkspace.test.mjs
```

预期：已有聊天测试通过，新增测试因 `changeModel` 或 `isChangingModel` 不存在而失败。

- [ ] **Step 5: 将 `updateSession` 保留在工作区 API 类型并新增状态**

确认 `ChatWorkspaceApi` 的 `Pick` 包含 `updateSession`，并在 `createChatWorkspace` 的状态区域加入：

```ts
const isChangingModel = ref(false)
```

现有 API 类型已经包含 `updateSession`；若前一轮流式改动的类型与实际代码不一致，以当前 `chatApi.updateSession` 签名为准，不复制新的会话接口类型。

- [ ] **Step 6: 实现 `changeModel` 并更新本地会话**

在 `togglePinned` 或 `renameSession` 附近加入以下逻辑：

```ts
async function changeModel(modelId: number) {
  const sessionId = activeSessionId.value
  const session = sessionId === null
    ? null
    : sessions.value.find((item) => item.id === sessionId)
  if (!session || isGenerating.value || isChangingModel.value) return
  if (session.defaultModelId === modelId) return session

  isChangingModel.value = true
  try {
    const updated = await api.updateSession(sessionId, { defaultModelId: modelId })
    const index = sessions.value.findIndex((item) => item.id === sessionId)
    if (index >= 0) sessions.value[index] = updated
    return updated
  } finally {
    isChangingModel.value = false
  }
}
```

捕获和转换错误沿用现有 `updateSession` 调用方的模式：不要在工作区内吞掉异常，因为页面需要通过 toast 告知用户；`finally` 必须确保失败后解除禁用状态。模型 ID 是否来自已加载列表由页面负责校验，工作区只负责当前会话持久化。

- [ ] **Step 7: 暴露模型切换状态和方法**

在返回对象中加入：

```ts
isChangingModel,
changeModel,
```

保留 `submit`、`retry` 和 `regenerate` 的现有 `defaultModelId` 读取逻辑，确保它们无需额外参数即可使用切换后的模型。

- [ ] **Step 8: 运行工作区测试确认通过**

```bash
node --test tests/chatWorkspace.test.mjs
```

预期：全部工作区测试 PASS；尤其确认成功更新后会话模型为 `8`，失败后仍为 `3`，生成中没有 `updateSession` 调用。

- [ ] **Step 9: 提交工作区变更**

```bash
git add src/composables/useChatWorkspace.ts tests/chatWorkspace.test.mjs
git commit -m "feat: persist selected chat model"
```

---

### Task 3: 将模型列表接入聊天头部

**Files:**
- Modify: `src/components/chat/ChatHeader.vue:5-35`
- Modify: `src/views/Chat.vue:1-115, 140-146`

- [ ] **Step 1: 扩展 `ChatHeader` 的 props 和模板**

将 `ChatHeader.vue` 的 props 改为接收模型数组和禁用状态：

```ts
defineProps<{
  title: string
  model: ModelSummary
  models: ModelSummary[]
  modelDisabled?: boolean
}>()
```

将选择器改为遍历模型列表，并在没有匹配项时保留传入的当前模型：

```vue
<select
  :value="model.id"
  :disabled="modelDisabled"
  aria-label="选择模型"
  @change="emit('modelChange', Number(($event.target as HTMLSelectElement).value))"
>
  <option v-if="!models.some((item) => item.id === model.id)" :value="model.id">
    {{ model.modelName }}
  </option>
  <option v-for="item in models" :key="item.id" :value="item.id">
    {{ item.modelName }}
  </option>
</select>
```

保留现有 `modelChange: [id: number]` emit，不在组件内发起 API 请求。这样组件只有展示和事件转发职责。

- [ ] **Step 2: 在 `Chat.vue` 增加模型列表状态和加载函数**

在现有 import 中加入 `onMounted` 已存在的 `ref` 使用，并导入 `chatApi`：

```ts
import { chatApi } from '../api/chat'
```

在 toast 状态附近增加：

```ts
const models = ref<ModelSummary[]>([])
const isLoadingModels = ref(false)
const modelsError = ref<string | null>(null)

async function loadModels() {
  isLoadingModels.value = true
  modelsError.value = null
  try {
    const loaded = await chatApi.listModels()
    models.value = [...new Map(loaded.map((model) => [model.id, model])).values()]
  } catch (error) {
    models.value = []
    modelsError.value = error instanceof Error ? error.message : '模型列表加载失败'
    notify(modelsError.value)
  } finally {
    isLoadingModels.value = false
  }
}
```

模型列表加载失败只清空可选列表并提示，不改变工作区会话加载流程。

- [ ] **Step 3: 根据会话模型生成当前模型和降级列表**

用当前会话的 `defaultModelId` 查找真实模型；找不到时创建只用于显示的降级对象，并将它放在列表首位：

```ts
const currentModelId = computed(() => workspace.activeSession.value?.defaultModelId ?? 3)

const activeModel = computed<ModelSummary>(() => models.value.find((model) => model.id === currentModelId.value) ?? {
  id: currentModelId.value,
  providerName: '配置模型',
  modelCode: `model-${currentModelId.value}`,
  modelName: `模型 ${currentModelId.value}`,
  contextWindow: null,
  maxOutputTokens: null,
  supportStream: true,
  defaultModel: false,
})

const selectableModels = computed(() => models.value.some((model) => model.id === activeModel.value.id)
  ? models.value
  : [activeModel.value, ...models.value])
```

此逻辑确保模型接口失败或会话引用已下线模型时，当前模型仍然可见；列表中重复 ID 已由 `loadModels` 去重。

- [ ] **Step 4: 处理模型切换事件和加载时机**

加入页面事件处理函数：

```ts
async function changeModel(modelId: number) {
  if (!selectableModels.value.some((model) => model.id === modelId)) return
  try {
    await workspace.changeModel(modelId)
    notify('模型已切换')
  } catch (error) {
    notify(error instanceof Error ? error.message : '模型切换失败，请重试')
  }
}
```

在 `onMounted` 中同时启动模型列表和会话加载，并等待两者完成：

```ts
onMounted(async () => {
  theme.value = (localStorage.getItem('lumina-theme') as 'light' | null) ?? 'light'
  await Promise.all([loadModels(), workspace.loadSessions()])
  await nextTick()
})
```

不要让模型请求失败阻止 `Promise.all`：`loadModels` 已在自身 `catch` 中处理错误并正常结束。

- [ ] **Step 5: 更新 `ChatHeader` 绑定**

将模板中的头部调用改为：

```vue
<ChatHeader
  :title="activeTitle"
  :model="activeModel"
  :models="selectableModels"
  :model-disabled="isLoadingModels || workspace.isChangingModel.value || isGenerating"
  @menu="sidebarOpen = true"
  @settings="settingsOpen = true"
  @model-change="changeModel"
/>
```

如果 Vue 模板对 `workspace.isChangingModel.value` 的自动解包方式与当前版本不兼容，使用脚本中暴露的同名常量：

```ts
const isChangingModel = workspace.isChangingModel
```

并在模板使用 `isChangingModel`；不要把 `.value` 传入组件 prop。

- [ ] **Step 6: 运行类型检查和生产构建**

```bash
npm run type-check
npm run build
```

预期：Vue 模板、事件参数和 `ModelSummary` 类型全部通过，Vite 生产构建成功。

- [ ] **Step 7: 提交聊天头部接入变更**

```bash
git add src/components/chat/ChatHeader.vue src/views/Chat.vue
git commit -m "feat: add chat model selector"
```

---

### Task 4: 全量验证并检查接口行为

**Files:**
- No new production files
- Review: `src/api/chat.ts`, `src/composables/useChatWorkspace.ts`, `src/components/chat/ChatHeader.vue`, `src/views/Chat.vue`

- [ ] **Step 1: 运行全部自动化检查**

先按仓库现有方式生成或刷新 `.tmp-tests`，然后执行：

```bash
node --test tests/apiClient.test.mjs tests/chatWorkspace.test.mjs tests/sseParser.test.mjs
npm run type-check
npm run build
```

预期：Node 测试、Vue 类型检查和生产构建全部 PASS。

- [ ] **Step 2: 检查模型接口和发送请求的最终链路**

确认以下代码关系没有被测试遗漏：

- `chatApi.listModels()` 使用精确路径 `/api/chat/models`。
- `Chat.vue` 没有调用旧的 `/api/ai/models`。
- `changeModel` 的更新请求只提交 `{ defaultModelId: modelId }`。
- `useChatWorkspace.generateAssistant` 的 `ChatRequest.modelId` 仍读取 `session.defaultModelId`。
- `ChatHeader` 的 `<select>` 只有一个 `modelChange` 事件出口，没有直接修改会话状态。
- 生成或保存期间选择器具有 `disabled` 属性。

运行：

```bash
grep -RInE '/api/ai/models|/api/chat/models|changeModel|defaultModelId' src tests
```

预期：旧模型接口路径不再出现在生产源代码中；新路径和模型切换调用各至少出现一次。

- [ ] **Step 3: 检查工作区差异和格式问题**

```bash
git diff --check
git status --short
git log --oneline -5
```

预期：没有空白错误；工作区只包含本功能的意外未提交改动（若存在则先处理）；实现提交和设计提交均可追溯。

- [ ] **Step 4: 进行浏览器验收**

启动前端：

```bash
npm run dev -- --host localhost
```

在已登录且后端可用的环境中验证：

1. 页面请求 `/api/chat/models`，下拉框显示接口返回的多个模型。
2. 当前会话默认模型处于选中状态。
3. 选择另一个模型时发出 `PUT /api/chat/sessions/{id}`，请求体只有 `defaultModelId`。
4. 新发送消息的流式请求体包含新模型 ID。
5. 刷新页面或重新进入会话后，仍选中刚保存的模型。
6. 生成期间下拉框不可操作。
7. 模型接口或保存接口失败时显示错误，且已有模型选择不被错误覆盖。

若后端模型供应商调用失败，只记录为后端/供应商问题，不用 mock 响应掩盖前端请求链路。
