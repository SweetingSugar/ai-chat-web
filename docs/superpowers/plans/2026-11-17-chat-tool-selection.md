# Chat Tool Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a chat user select up to 20 available AI tools for one new message and submit their codes with the existing streaming chat request.

**Architecture:** `chatApi` reads the safe, user-facing available-tool projection from `/api/tools/available`; `Chat.vue` owns the cached collection, loading state, and toast errors. A focused `ToolPicker` component manages the popover and selection interaction, while `Composer` owns the per-message selected codes and sends them to `useChatWorkspace`, which injects them only into new stream requests.

**Tech Stack:** Vue 3 Composition API, TypeScript, Fetch API, Node built-in test runner, Vite, vue-tsc.

---

## File structure and responsibilities

- `src/types/chat.ts`: Define the `/api/tools/available` response shape and add optional `toolCodes` to chat requests.
- `src/api/chat.ts`: Add the authenticated `listAvailableTools()` API method.
- `src/lib/toolSelection.ts`: Keep the 20-tool selection rule as a Vue-independent, unit-tested function.
- `src/components/chat/ToolPicker.vue`: Render the compact searchable tool multi-select popover and emit code-list updates.
- `src/components/chat/Composer.vue`: Own selected codes for the current draft, show removable chips, and add them to the submit payload.
- `src/composables/useChatWorkspace.ts`: Forward selected codes to new message streams without changing regeneration requests.
- `src/views/Chat.vue`: Lazily load and cache available tools, surface API failures with the existing toast, and connect the Composer payload to the workspace.
- `src/components/common/AppIcon.vue`: Add the small tool icon used by the picker trigger.
- `src/assets/main.css`: Reuse the knowledge-picker/chip visual language for tools and preserve mobile sizing.
- `tests/apiClient.test.mjs`: Verify the available-tool API path and safe response mapping.
- `tests/toolSelection.test.mjs`: Verify selection, removal, uniqueness, and the 20-tool boundary.
- `tests/chatWorkspace.test.mjs`: Verify selected codes reach only first-message stream requests.

## Test compilation command

The Node tests import TypeScript transpiled into the ignored `.tmp-tests` directory. Before each Node test command below, refresh it with:

```bash
rm -rf .tmp-tests && npx tsc --ignoreConfig --outDir .tmp-tests --rootDir . --module NodeNext --moduleResolution NodeNext --target ES2022 --skipLibCheck src/api/client.ts src/api/chat.ts src/api/knowledge.ts src/composables/useChatWorkspace.ts src/composables/useKnowledgeBaseWorkspace.ts src/lib/chatAttachments.ts src/lib/knowledgeSelection.ts src/lib/sseParser.ts src/types/chat.ts
```

Do not commit `.tmp-tests`.

---

### Task 1: Add available-tool API contract and client method

**Files:**
- Modify: `src/types/chat.ts:80-130`
- Modify: `src/api/chat.ts:1-62`
- Modify: `tests/apiClient.test.mjs:85-118`

- [ ] **Step 1: Write the failing available-tools API test**

Add this test after the existing model-list test in `tests/apiClient.test.mjs`:

```js
test('loads chat-selectable tools from the available-tools endpoint', async () => {
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push([String(url), options])
    return new Response(JSON.stringify({
      success: true,
      code: 'SUCCESS',
      message: 'OK',
      data: [{
        toolCode: 'weather_current',
        toolName: '实时天气',
        description: '查询指定城市当前天气',
        toolType: 'MCP',
        inputSchema: { type: 'object', properties: { city: { type: 'string' } } },
      }],
    }), { status: 200 })
  }

  const tools = await chatApi.listAvailableTools()

  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], '/api/tools/available')
  assert.equal(calls[0][1].method, undefined)
  assert.deepEqual(tools, [{
    toolCode: 'weather_current',
    toolName: '实时天气',
    description: '查询指定城市当前天气',
    toolType: 'MCP',
    inputSchema: { type: 'object', properties: { city: { type: 'string' } } },
  }])
})
```

- [ ] **Step 2: Run the API test and confirm the missing method fails**

Refresh `.tmp-tests` using the compilation command above, then run:

```bash
node --test --test-name-pattern="chat-selectable tools" tests/apiClient.test.mjs
```

Expected: FAIL with `chatApi.listAvailableTools is not a function`.

- [ ] **Step 3: Add the TypeScript contract**

In `src/types/chat.ts`, add the following immediately after `ModelSummary`:

```ts
export type ChatToolType = 'HTTP' | 'MCP'

export interface AvailableTool {
  toolCode: string
  toolName: string
  description: string | null
  toolType: ChatToolType
  inputSchema: unknown | null
}
```

Add the request field to the existing `ChatRequest` interface:

```ts
export interface ChatRequest {
  content: string
  fileIds?: number[]
  knowledgeBaseIds?: number[]
  toolCodes?: string[]
  modelId?: number
  requestId?: string
  temperature?: number
  topP?: number
  maxOutputTokens?: number
}
```

Keep `ChatRegenerateRequest extends Omit<ChatRequest, 'content'>` unchanged. The workspace will deliberately omit `toolCodes` from regeneration calls.

- [ ] **Step 4: Implement the API method**

Import `AvailableTool` from `../types/chat.js` in `src/api/chat.ts`. Add this method next to `listModels()` in `chatApi`:

```ts
listAvailableTools() {
  return apiRequest<AvailableTool[]>('/api/tools/available')
},
```

Do not call the management endpoint and do not filter the response in the browser: the backend already excludes disabled, stale, deleted, and MCP-server-disabled tools.

- [ ] **Step 5: Run the API tests and commit the contract**

Refresh `.tmp-tests`, then run:

```bash
node --test tests/apiClient.test.mjs
npm run type-check
```

Expected: PASS. The new test proves the path is `/api/tools/available`, while the type check confirms the response and request types compile.

```bash
git add src/types/chat.ts src/api/chat.ts tests/apiClient.test.mjs
git commit -m "feat: add available chat tools API"
```

---

### Task 2: Create and test the tool-selection rule

**Files:**
- Create: `src/lib/toolSelection.ts`
- Create: `tests/toolSelection.test.mjs`

- [ ] **Step 1: Write failing selection-rule tests**

Create `tests/toolSelection.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { CHAT_TOOL_LIMIT, toggleChatTool } from '../.tmp-tests/src/lib/toolSelection.js'

test('adds unique tool codes and removes an existing selection', () => {
  assert.deepEqual(toggleChatTool(['weather_current'], 'calendar_events'), {
    toolCodes: ['weather_current', 'calendar_events'],
    error: null,
  })
  assert.deepEqual(toggleChatTool(['weather_current', 'calendar_events'], 'weather_current'), {
    toolCodes: ['calendar_events'],
    error: null,
  })
})

test('keeps the existing selection and reports the backend-aligned twenty-tool limit', () => {
  const current = Array.from({ length: 20 }, (_, index) => `tool_${index + 1}`)

  assert.equal(CHAT_TOOL_LIMIT, 20)
  assert.deepEqual(toggleChatTool(current, 'tool_21'), {
    toolCodes: current,
    error: '最多可选择 20 个工具',
  })
})
```

- [ ] **Step 2: Run the rule tests and confirm the module is absent**

Refresh `.tmp-tests`, then run:

```bash
node --test tests/toolSelection.test.mjs
```

Expected: FAIL because `.tmp-tests/src/lib/toolSelection.js` does not exist.

- [ ] **Step 3: Implement the framework-independent selection helper**

Create `src/lib/toolSelection.ts`:

```ts
export const CHAT_TOOL_LIMIT = 20

export interface ChatToolSelection {
  toolCodes: string[]
  error: string | null
}

export function toggleChatTool(current: string[], toolCode: string): ChatToolSelection {
  if (current.includes(toolCode)) {
    return { toolCodes: current.filter((item) => item !== toolCode), error: null }
  }
  if (current.length >= CHAT_TOOL_LIMIT) {
    return { toolCodes: [...current], error: `最多可选择 ${CHAT_TOOL_LIMIT} 个工具` }
  }
  return { toolCodes: [...current, toolCode], error: null }
}
```

This module accepts and returns codes, rather than tool objects, so `Composer` has no duplicate tool data and the result is ready for the backend request.

- [ ] **Step 4: Compile the new module, run the selection tests, and commit**

Refresh `.tmp-tests` with the new module included, then run:

```bash
rm -rf .tmp-tests && npx tsc --ignoreConfig --outDir .tmp-tests --rootDir . --module NodeNext --moduleResolution NodeNext --target ES2022 --skipLibCheck src/api/client.ts src/api/chat.ts src/api/knowledge.ts src/composables/useChatWorkspace.ts src/composables/useKnowledgeBaseWorkspace.ts src/lib/chatAttachments.ts src/lib/knowledgeSelection.ts src/lib/toolSelection.ts src/lib/sseParser.ts src/types/chat.ts
node --test tests/toolSelection.test.mjs
```

Expected: PASS. The tests cover add, remove, ordering, uniqueness, and the same 20-item upper bound enforced by the backend.

```bash
git add src/lib/toolSelection.ts tests/toolSelection.test.mjs
git commit -m "feat: add chat tool selection rules"
```

---

### Task 3: Forward tool codes through new-message workspace requests

**Files:**
- Modify: `src/composables/useChatWorkspace.ts:274-303,326-374,388-397`
- Modify: `tests/chatWorkspace.test.mjs:284-308,403-435`

- [ ] **Step 1: Write failing workspace tests for a selected-tool request and regeneration**

Append these tests to `tests/chatWorkspace.test.mjs`:

```js
test('sends selected tool codes only with a new chat stream request', async () => {
  const api = createFakeApi({
    streamEvents: [{ type: 'COMPLETE', requestId: 'req-1', taskId: 50, assistantMessageId: 11, usage: null }],
    details: { 1: { session: session(1, '工具问题'), messages: [] } },
  })
  const workspace = createChatWorkspace({ api, initialSessions: [session(1, '新会话')] })

  await workspace.submit('上海天气如何？', 3, [], true, [], ['weather_current', 'calendar_events'])

  const request = api.calls.find(([name]) => name === 'stream')[2]
  assert.deepEqual(request.toolCodes, ['weather_current', 'calendar_events'])
})

test('does not add selected-tool codes to regenerate requests', async () => {
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
    initialMessages: { 1: [{ id: 19, sessionId: 1, role: 'USER', content: '问题', status: 'COMPLETED' }, assistant] },
  })

  await workspace.regenerate(20)

  const request = api.calls.find(([name]) => name === 'regenerate')[2]
  assert.equal('toolCodes' in request, false)
})
```

- [ ] **Step 2: Run the workspace tests and confirm the new-message test fails**

Refresh `.tmp-tests`, then run:

```bash
node --test --test-name-pattern="tool codes" tests/chatWorkspace.test.mjs
```

Expected: the new-message test FAILS because the current `submit` signature ignores its sixth argument and the stream payload has no `toolCodes`. The regeneration test already documents the intended unchanged behavior.

- [ ] **Step 3: Extend `generateAssistant` with an optional first-message tool argument**

In `src/composables/useChatWorkspace.ts`, change the function signature to:

```ts
async function generateAssistant(
  sessionId: number,
  assistant: ChatMessage,
  content: string,
  regenerate = false,
  fileIds?: number[],
  knowledgeBaseIds?: number[],
  toolCodes?: string[],
) {
```

After the existing `fileIds` and `knowledgeBaseIds` assignments, add:

```ts
if (!regenerate && toolCodes?.length) request.toolCodes = toolCodes
```

This conditional prevents an empty property in ordinary chats and prevents selected draft tools from affecting regeneration.

- [ ] **Step 4: Extend `submit` and pass its codes into the initial generation**

Change `submit` to accept a final optional argument:

```ts
async function submit(
  content: string,
  defaultModelId?: number,
  files: AttachmentCandidate[] = [],
  supportVision = true,
  knowledgeBaseIds: number[] = [],
  toolCodes: string[] = [],
) {
```

Change its call to `generateAssistant` to:

```ts
await generateAssistant(sessionId, assistantMessage, value, false, fileIds, knowledgeBaseIds, toolCodes)
```

Do not modify `retry()` or `regenerate()`; both continue to call `generateAssistant` without `toolCodes` and therefore never infer past selections from message history.

- [ ] **Step 5: Run the workspace suite and commit**

Refresh `.tmp-tests`, then run:

```bash
node --test tests/chatWorkspace.test.mjs
npm run type-check
```

Expected: PASS. Existing text, file, knowledge-base, retry, and regeneration tests remain green; the new stream test contains exactly the selected codes.

```bash
git add src/composables/useChatWorkspace.ts tests/chatWorkspace.test.mjs
git commit -m "feat: send selected chat tools"
```

---

### Task 4: Build the composer tool picker and selected-tool chips

**Files:**
- Create: `src/components/chat/ToolPicker.vue`
- Modify: `src/components/chat/Composer.vue:1-127`
- Modify: `src/components/common/AppIcon.vue:20-31`
- Modify: `src/assets/main.css:127-145,224-226`

- [ ] **Step 1: Add the trigger icon**

In `src/components/common/AppIcon.vue`, add this branch before the existing `send` branch:

```vue
<path v-else-if="name === 'tool'" d="m14.7 6.3 3-3a4.2 4.2 0 0 0-5.4 5.4l-7.7 7.7a2.2 2.2 0 0 0 3.1 3.1l7.7-7.7a4.2 4.2 0 0 0 5.4-5.4l-3 3-3.2-3.2Z" />
```

Keep the component’s open `name: string` prop; the existing icon API intentionally does not maintain a union of names.

- [ ] **Step 2: Create the reusable tool picker component**

Create `src/components/chat/ToolPicker.vue` with this implementation:

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import { toggleChatTool } from '../../lib/toolSelection.js'
import type { AvailableTool } from '../../types/chat.js'

const props = withDefaults(defineProps<{
  tools: AvailableTool[]
  modelValue: string[]
  disabled?: boolean
  loading?: boolean
  error?: string | null
}>(), {
  disabled: false,
  loading: false,
  error: null,
})

const emit = defineEmits<{
  'update:modelValue': [toolCodes: string[]]
  limit: [message: string]
  open: []
}>()

const rootRef = ref<HTMLElement | null>(null)
const expanded = ref(false)
const query = ref('')
const filteredTools = computed(() => {
  const value = query.value.trim().toLowerCase()
  if (!value) return props.tools
  return props.tools.filter((tool) => [tool.toolName, tool.toolCode, tool.description ?? '']
    .some((item) => item.toLowerCase().includes(value)))
})

function toggle() {
  if (props.disabled) return
  expanded.value = !expanded.value
  if (expanded.value) emit('open')
}

function select(toolCode: string) {
  const result = toggleChatTool(props.modelValue, toolCode)
  if (result.error) emit('limit', result.error)
  else emit('update:modelValue', result.toolCodes)
}

function closeOutside(event: MouseEvent) {
  if (rootRef.value && !rootRef.value.contains(event.target as Node)) expanded.value = false
}

onMounted(() => document.addEventListener('click', closeOutside))
onBeforeUnmount(() => document.removeEventListener('click', closeOutside))
</script>

<template>
  <div ref="rootRef" class="tool-picker">
    <button type="button" class="composer-tool" :disabled="disabled" :aria-expanded="expanded" aria-haspopup="listbox" @click.stop="toggle">
      <AppIcon name="tool" size="16" /><span>工具</span><span v-if="modelValue.length" class="tool-picker__count">{{ modelValue.length }}</span>
    </button>
    <div v-if="expanded" class="tool-picker__popover" @click.stop>
      <label class="tool-picker__search"><AppIcon name="search" size="14" /><input v-model="query" type="search" placeholder="搜索工具" autofocus /></label>
      <div class="tool-picker__list" role="listbox" aria-label="可选工具" aria-multiselectable="true">
        <p v-if="loading">正在加载工具…</p>
        <p v-else-if="error">工具加载失败，请关闭后重试</p>
        <template v-else>
          <label v-for="tool in filteredTools" :key="tool.toolCode" class="tool-picker__option">
            <input type="checkbox" :checked="modelValue.includes(tool.toolCode)" @change="select(tool.toolCode)" />
            <span>
              <strong>{{ tool.toolName }}</strong>
              <small><em>{{ tool.toolType }}</em>{{ tool.description || '暂无描述' }}</small>
            </span>
          </label>
          <p v-if="filteredTools.length === 0">没有可选工具</p>
        </template>
      </div>
    </div>
  </div>
</template>
```

The component never renders `inputSchema`; this release selects tools, not tool arguments.

- [ ] **Step 3: Extend Composer state, props, events, and clearing behavior**

In `src/components/chat/Composer.vue`:

1. Import `ToolPicker` and `AvailableTool`:

```ts
import ToolPicker from './ToolPicker.vue'
import type { AvailableTool, KnowledgeBase } from '../../types/chat.js'
```

2. Extend props:

```ts
availableTools?: AvailableTool[]
loadingTools?: boolean
toolsError?: string | null
```

with defaults:

```ts
availableTools: () => [],
loadingTools: false,
toolsError: null,
```

3. Extend emitted events and local state:

```ts
submit: [payload: { content: string; files: File[]; knowledgeBaseIds: number[]; toolCodes: string[] }]
toolLimit: [message: string]
openToolPicker: []

const selectedToolCodes = ref<string[]>([])
const selectedTools = computed(() => props.availableTools.filter((tool) => selectedToolCodes.value.includes(tool.toolCode)))
```

4. Add this removal handler beside `removeKnowledgeBase`:

```ts
function removeTool(toolCode: string) {
  selectedToolCodes.value = selectedToolCodes.value.filter((item) => item !== toolCode)
}
```

5. Add the codes to the existing submit payload:

```ts
toolCodes: [...selectedToolCodes.value],
```

6. Reset codes in the existing `clear()` function:

```ts
selectedToolCodes.value = []
```

- [ ] **Step 4: Add Composer template blocks**

After the existing knowledge-base chip region and before `<div class="composer">`, insert:

```vue
<div v-if="selectedTools.length" class="composer__tool-chips" aria-label="已选工具">
  <span v-for="tool in selectedTools" :key="tool.toolCode" class="tool-chip">
    <AppIcon name="tool" size="14" />{{ tool.toolName }}
    <button type="button" :disabled="generating || submitting" :aria-label="`移除工具 ${tool.toolName}`" @click="removeTool(tool.toolCode)"><AppIcon name="close" size="12" /></button>
  </span>
</div>
```

In the existing `composer__tools` row, after `KnowledgeBasePicker`, insert:

```vue
<ToolPicker
  v-model="selectedToolCodes"
  :tools="availableTools"
  :disabled="generating || submitting"
  :loading="loadingTools"
  :error="toolsError"
  @limit="emit('toolLimit', $event)"
  @open="emit('openToolPicker')"
/>
```

The new button receives the same disabled condition as attachments and knowledge bases. The `clear()` method runs only after `Chat.vue` receives a successful `workspace.submit()` result, so all draft chips survive a thrown upload/setup failure.

- [ ] **Step 5: Add matching styles and responsive constraints**

In `src/assets/main.css`, add these rules after the existing knowledge-picker styles:

```css
.composer__tool-chips { display: flex; max-height: 72px; margin-bottom: 8px; flex-wrap: wrap; gap: 6px; overflow-y: auto; }
.tool-chip { display: inline-flex; min-width: 0; align-items: center; gap: 5px; max-width: 210px; padding: 5px 7px; border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--line)); border-radius: 7px; background: var(--accent-soft); color: var(--accent); font-size: 11px; font-weight: 600; }
.tool-chip > .app-icon { flex: none; }.tool-chip button { display: grid; width: 17px; height: 17px; place-items: center; flex: none; padding: 0; border: 0; border-radius: 4px; background: transparent; color: inherit; }.tool-chip button:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 14%, transparent); }.tool-chip button:disabled { opacity: .45; }
.tool-picker { position: relative; }.tool-picker__count { display: grid; width: 16px; height: 16px; place-items: center; border-radius: 99px; background: var(--accent); color: white; font-size: 9px; font-weight: 700; }.tool-picker__popover { position: absolute; z-index: 40; bottom: calc(100% + 9px); left: 0; width: min(320px, calc(100vw - 36px)); padding: 9px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); box-shadow: var(--shadow); }.tool-picker__search { display: flex; align-items: center; gap: 6px; height: 33px; padding: 0 8px; border: 1px solid var(--line); border-radius: 7px; color: var(--text-soft); }.tool-picker__search input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: var(--text); font-size: 11px; }.tool-picker__list { max-height: 220px; margin-top: 7px; overflow-y: auto; }.tool-picker__option { display: flex; align-items: flex-start; gap: 8px; padding: 8px; border-radius: 7px; cursor: pointer; }.tool-picker__option:hover { background: var(--surface-hover); }.tool-picker__option input { margin-top: 3px; accent-color: var(--accent); }.tool-picker__option span { display: flex; min-width: 0; flex-direction: column; }.tool-picker__option strong { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }.tool-picker__option small { display: flex; gap: 5px; overflow: hidden; color: var(--text-soft); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }.tool-picker__option em { flex: none; color: var(--accent); font-size: 9px; font-style: normal; font-weight: 700; }.tool-picker__list > p { margin: 14px 8px; color: var(--text-soft); font-size: 11px; text-align: center; }
```

The `width: min(320px, calc(100vw - 36px))` keeps the popover within the viewport at mobile widths. No additional mobile override is needed because the Composer’s existing mobile rules preserve its tool row and safe-area padding.

- [ ] **Step 6: Type-check and commit the Composer UI**

Run:

```bash
npm run type-check
npm run build
```

Expected: PASS. Vue template type checking must validate the new `v-model`, event payload, tool response type, and icon references.

```bash
git add src/components/common/AppIcon.vue src/components/chat/ToolPicker.vue src/components/chat/Composer.vue src/assets/main.css
git commit -m "feat: add chat tool picker"
```

---

### Task 5: Load tools in the chat view and complete verification

**Files:**
- Modify: `src/views/Chat.vue:1-15,35-105,135-147,223-233`
- Modify: `tests/apiClient.test.mjs:85-145` only if test fixtures need type-aligned edits
- Modify: `tests/chatWorkspace.test.mjs:403-470` only if test fixtures need type-aligned edits

- [ ] **Step 1: Add available-tool state and lazy loader in `Chat.vue`**

Change the type import to include `AvailableTool`:

```ts
import type { AvailableTool, KnowledgeBase, ModelSummary } from '../types/chat'
```

Add state beside the existing knowledge-base state:

```ts
const availableTools = ref<AvailableTool[]>([])
const isLoadingTools = ref(false)
const toolsError = ref<string | null>(null)
const hasLoadedTools = ref(false)
```

Add this function after `loadKnowledgeBases()`:

```ts
async function loadAvailableTools() {
  if (isLoadingTools.value || hasLoadedTools.value) return
  isLoadingTools.value = true
  toolsError.value = null
  try {
    availableTools.value = await chatApi.listAvailableTools()
    hasLoadedTools.value = true
  } catch (error) {
    availableTools.value = []
    toolsError.value = error instanceof Error ? error.message : '工具列表加载失败'
    notify(toolsError.value)
  } finally {
    isLoadingTools.value = false
  }
}
```

A successful empty response is cached. A failed response leaves `hasLoadedTools` false, so closing and reopening the picker retries it.

- [ ] **Step 2: Forward the Composer tool codes to the workspace**

Change `submitMessage` to accept the extended payload:

```ts
async function submitMessage(payload: { content: string; files: File[]; knowledgeBaseIds: number[]; toolCodes: string[] }) {
  try {
    const sent = await workspace.submit(
      payload.content,
      currentModelId.value,
      payload.files,
      activeModel.value.supportVision,
      payload.knowledgeBaseIds,
      payload.toolCodes,
    )
    if (sent) composerRef.value?.clear()
  } catch (error) {
    notify(error instanceof Error ? error.message : '发送失败，请重试')
  }
}
```

Keep the existing `if (sent)` condition: tool selections, text, attachments, and knowledge-base chips remain intact when setup or upload throws before a request is accepted.

- [ ] **Step 3: Wire tool props and events on the Composer**

Extend the existing `<Composer>` in `src/views/Chat.vue`:

```vue
<Composer
  ref="composerRef"
  :generating="isGenerating"
  :submitting="isUploading"
  :knowledge-bases="knowledgeBases"
  :available-tools="availableTools"
  :loading-tools="isLoadingTools"
  :tools-error="toolsError"
  @submit="submitMessage"
  @invalid-files="notifyInvalidFiles"
  @knowledge-limit="notify"
  @tool-limit="notify"
  @open-knowledge-picker="loadKnowledgeBases"
  @open-tool-picker="loadAvailableTools"
  @stop="workspace.stopGeneration"
/>
```

Do not preload available tools in `onMounted`; the first tool-picker open is the only initial request.

- [ ] **Step 4: Run automated checks**

Refresh `.tmp-tests`, then run:

```bash
node --test tests/apiClient.test.mjs tests/chatAttachments.test.mjs tests/chatWorkspace.test.mjs tests/knowledgeSelection.test.mjs tests/knowledgeWorkspace.test.mjs tests/toolSelection.test.mjs tests/sseParser.test.mjs
npm run type-check
npm run build
```

Expected: all Node tests, Vue type checking, and the production build PASS.

- [ ] **Step 5: Perform browser acceptance checks**

Start the application against the backend that exposes `/api/tools/available`:

```bash
npm run dev -- --host localhost
```

Verify the following manually:

1. Opening “工具” issues one `GET /api/tools/available`, then reopening after a success uses the cached list.
2. Each option shows its name, `HTTP`/`MCP` type, and description; the UI never displays `inputSchema` or management/credential fields.
3. Search filters by name, tool code, or description; outside clicks close the popover.
4. Selecting tools creates chips; removing a chip unchecks the corresponding option; the count badge matches the selected-code count.
5. Selecting a 21st tool preserves the first 20 and shows `最多可选择 20 个工具` in the existing toast.
6. An empty result displays “没有可选工具”; a failed request displays the existing toast and the picker’s retry-on-reopen message.
7. Send a message with selected tools and inspect the streaming request body for the ordered `toolCodes` array. Confirm the Composer clears after submission.
8. Force a setup/upload failure and confirm chips and all other Composer draft state remain. Confirm controls are disabled while uploading or generating.
9. Verify the picker, chips, and send controls remain usable at a viewport below 760px, including safe-area spacing.
10. Verify ordinary chat, attachments, knowledge-base selection, retry, and regeneration continue to work; regeneration payloads contain no `toolCodes`.

- [ ] **Step 6: Validate the final diff and commit the integration**

```bash
git diff --check
git status --short
git add src/views/Chat.vue tests/apiClient.test.mjs tests/chatWorkspace.test.mjs
git commit -m "feat: wire chat tool selection"
git status --short
```

Expected: `git diff --check` prints no whitespace errors, and the final status is clean.
