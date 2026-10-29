# 聊天文件附件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户在流式聊天前上传 JPEG、PNG、GIF 或 PDF，并在首次聊天请求中将上传结果的文件 ID 传给后端。

**Architecture:** `Composer` 仅保存并展示本地 `File` 草稿；`Chat.vue` 协调组件状态、toast 和草稿清理；`useChatWorkspace` 负责发送前的图片模型能力检查、串行上传、创建乐观消息和向流式请求注入 `fileIds`。`chatApi` 通过现有动态认证客户端上传文件，纯文本和重新生成路径保持不变。

**Tech Stack:** Vue 3 Composition API、TypeScript、Fetch API、FormData、Node 内置测试运行器、Vite、vue-tsc。

---

## 文件结构与职责

- `src/types/chat.ts`：补充上传后端返回的文件元数据类型、模型视觉能力和聊天请求中的 `fileIds`。
- `src/api/client.ts`：让通用 JSON API 客户端在 `FormData` 请求上不错误地设置 `Content-Type: application/json`。
- `src/api/chat.ts`：新增 `uploadFile(file)`，使用现有认证和响应解析路径调用 `POST /api/files`。
- `src/lib/chatAttachments.ts`：集中定义允许的 MIME 类型、10 MB/10 个限制、文件选择校验、文件大小格式化和仅附件消息的默认文本；该模块不依赖 Vue 或 HTTP。
- `src/components/common/AppIcon.vue`：提供附件、文件、图片、PDF 图标路径。
- `src/components/chat/Composer.vue`：维护本地附件草稿，提供选择、展示、移除和受控清空；将内容与文件一起上送页面。
- `src/composables/useChatWorkspace.ts`：上传并串联 ID 到首次 stream 请求，仅在上传成功后创建乐观消息；公开上传状态。
- `src/views/Chat.vue`：把当前模型视觉能力与附件草稿提交给工作区，上传成功后才清空 Composer，并复用 toast 报错。
- `src/assets/main.css`：布局和响应式样式，保证附件列表位于输入框与工具栏之间。
- `tests/apiClient.test.mjs`：验证 multipart 上传、动态认证头和不设置 JSON 内容类型。
- `tests/chatAttachments.test.mjs`：验证纯函数的类型、大小、数量限制和默认提问文案。
- `tests/chatWorkspace.test.mjs`：验证上传→`fileIds`→流式请求的顺序、上传失败保留消息状态、图片模型能力拦截和纯文本回归。

---

### Task 1: 扩展后端契约类型并实现 multipart 上传 API

**Files:**
- Modify: `src/types/chat.ts:79-114`
- Modify: `src/api/client.ts:63-72`
- Modify: `src/api/chat.ts:15-53`
- Modify: `tests/apiClient.test.mjs:1-116`

- [ ] **Step 1: 写 multipart 上传的失败测试**

在 `tests/apiClient.test.mjs` 的现有 `chatApi` 导入后保留原导入，并添加以下测试。它明确断言文件字段、动态 token 和浏览器自动生成 multipart boundary 所需的“无显式 Content-Type”行为：

```js
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
```

- [ ] **Step 2: 运行 API 测试，确认它因实现缺失而失败**

先使用仓库现有的 TypeScript 测试转译约定刷新 `.tmp-tests`，然后运行：

```bash
node --test tests/apiClient.test.mjs
```

预期：新增测试失败，错误指出 `chatApi.uploadFile is not a function`；已有 API/SSE 测试继续通过。

- [ ] **Step 3: 补齐聊天类型**

在 `src/types/chat.ts` 中，在 `ModelSummary` 增加后端已返回的视觉能力字段，并在 `ChatRequest` 增加可选文件 ID：

```ts
export interface ModelSummary {
  id: number
  providerName: string
  modelCode: string
  modelName: string
  contextWindow: number | null
  maxOutputTokens: number | null
  supportStream: boolean
  supportVision: boolean
  defaultModel: boolean
}

export interface UploadedFile {
  id: number
  userId: number
  originalName: string
  contentType: string
  fileSize: number
  status: string
  createTime: string
  updateTime: string
}

export interface ChatRequest {
  content: string
  fileIds?: number[]
  modelId?: number
  requestId?: string
  temperature?: number
  topP?: number
  maxOutputTokens?: number
}
```

保留其他既有字段和 `ChatRegenerateRequest extends Omit<ChatRequest, 'content'>` 的当前定义；后续 Task 3 不会在 regenerate 调用中提供 `fileIds`。

- [ ] **Step 4: 让通用 API 客户端保留 `FormData` 的浏览器 Content-Type**

将 `src/api/client.ts` 中的自动 JSON Content-Type 判断替换为：

```ts
if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
  headers.set('Content-Type', 'application/json')
}
```

不要手动为 `FormData` 设置 multipart Content-Type；否则浏览器不会附加 boundary，后端不能解析 `@RequestPart("file")`。

- [ ] **Step 5: 添加上传 API 方法**

在 `src/api/chat.ts` 的 `chatApi` 对象中引入 `UploadedFile`，并在 `listModels()` 附近添加：

```ts
uploadFile(file: File) {
  const body = new FormData()
  body.append('file', file)
  return apiRequest<UploadedFile>('/api/files', {
    method: 'POST',
    body,
  })
},
```

此方法不得读取文件内容、不保存 MinIO URL，也不接受 object key；它只返回后端包装响应内的文件元数据。

- [ ] **Step 6: 更新现有模型测试夹具并运行 API 测试**

所有 `ModelSummary` 测试数据新增 `supportVision: false`，包括 `tests/apiClient.test.mjs` 的模型列表数据。刷新 `.tmp-tests` 后运行：

```bash
node --test tests/apiClient.test.mjs
```

预期：全部 API 测试 PASS；新增测试确认 `/api/files` 收到 `FormData`、`file` 字段和动态 token，并且没有显式 JSON Content-Type。

- [ ] **Step 7: 提交 API 与类型变更**

```bash
git add src/types/chat.ts src/api/client.ts src/api/chat.ts tests/apiClient.test.mjs
git commit -m "feat: add chat attachment upload API"
```

---

### Task 2: 建立可测试的附件草稿规则

**Files:**
- Create: `src/lib/chatAttachments.ts`
- Create: `tests/chatAttachments.test.mjs`

- [ ] **Step 1: 写附件规则的失败测试**

创建 `tests/chatAttachments.test.mjs`，使用纯对象模拟浏览器文件；测试不应依赖 Vue DOM：

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ATTACHMENT_LIMIT,
  MAX_ATTACHMENT_BYTES,
  attachmentPrompt,
  formatFileSize,
  selectChatAttachments,
} from '../.tmp-tests/src/lib/chatAttachments.js'

const file = (name, type, size) => ({ name, type, size })

test('keeps supported image and PDF files within the attachment limits', () => {
  const result = selectChatAttachments([], [
    file('diagram.png', 'image/png', 42),
    file('brief.pdf', 'application/pdf', 512),
  ])

  assert.deepEqual(result.files.map(({ name }) => name), ['diagram.png', 'brief.pdf'])
  assert.deepEqual(result.errors, [])
  assert.equal(ATTACHMENT_LIMIT, 10)
  assert.equal(formatFileSize(1536), '1.5 KB')
})

test('rejects unsupported, oversized, and excess attachments without discarding valid files', () => {
  const existing = Array.from({ length: 9 }, (_, index) => file(`image-${index}.jpg`, 'image/jpeg', 1))
  const result = selectChatAttachments(existing, [
    file('report.pdf', 'application/pdf', 1),
    file('notes.txt', 'text/plain', 1),
    file('large.gif', 'image/gif', MAX_ATTACHMENT_BYTES + 1),
    file('overflow.png', 'image/png', 1),
  ])

  assert.equal(result.files.length, 10)
  assert.equal(result.files.at(-1).name, 'report.pdf')
  assert.deepEqual(result.errors, [
    '仅支持 JPEG、PNG、GIF 和 PDF 文件',
    '“large.gif” 超过 10 MB 大小限制',
    '最多可添加 10 个附件',
  ])
})

test('uses a non-empty default prompt only when attachments have no text question', () => {
  assert.equal(attachmentPrompt('  ', [file('brief.pdf', 'application/pdf', 1)]), '请分析这些附件。')
  assert.equal(attachmentPrompt('  总结重点  ', [file('brief.pdf', 'application/pdf', 1)]), '总结重点')
  assert.equal(attachmentPrompt('  ', []), '')
})
```

- [ ] **Step 2: 运行规则测试确认失败**

刷新 `.tmp-tests` 后执行：

```bash
node --test tests/chatAttachments.test.mjs
```

预期：失败，原因是 `chatAttachments.js` 尚不存在。

- [ ] **Step 3: 实现附件规则模块**

创建 `src/lib/chatAttachments.ts`，使用如下完整接口。`File` 在调用处可安全赋值给 `AttachmentCandidate`：

```ts
export interface AttachmentCandidate {
  name: string
  type: string
  size: number
}

export const ATTACHMENT_LIMIT = 10
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const DEFAULT_ATTACHMENT_PROMPT = '请分析这些附件。'

const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'application/pdf'])

export interface AttachmentSelection<T extends AttachmentCandidate> {
  files: T[]
  errors: string[]
}

export function selectChatAttachments<T extends AttachmentCandidate>(
  current: T[],
  candidates: Iterable<T>,
): AttachmentSelection<T> {
  const files = [...current]
  const errors: string[] = []
  let exceededLimit = false

  for (const file of candidates) {
    if (!SUPPORTED_TYPES.has(file.type)) {
      errors.push('仅支持 JPEG、PNG、GIF 和 PDF 文件')
      continue
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      errors.push(`“${file.name}” 超过 10 MB 大小限制`)
      continue
    }
    if (files.length >= ATTACHMENT_LIMIT) {
      exceededLimit = true
      continue
    }
    files.push(file)
  }

  if (exceededLimit) errors.push(`最多可添加 ${ATTACHMENT_LIMIT} 个附件`)
  return { files, errors }
}

export function attachmentPrompt(content: string, files: AttachmentCandidate[]): string {
  const trimmed = content.trim()
  return trimmed || (files.length ? DEFAULT_ATTACHMENT_PROMPT : '')
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(/\.0$/, '')} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`
}
```

不要通过扩展名放宽 MIME 限制；浏览器 `accept` 属性只是选择器提示，发送前的前端 MIME 校验和后端校验都仍需要存在。

- [ ] **Step 4: 运行规则测试确认通过**

刷新 `.tmp-tests` 后运行：

```bash
node --test tests/chatAttachments.test.mjs
```

预期：三个测试 PASS，覆盖正常选择、多个无效附件仍保留有效附件、以及只有附件时的默认问题。

- [ ] **Step 5: 提交附件规则模块**

```bash
git add src/lib/chatAttachments.ts tests/chatAttachments.test.mjs
git commit -m "feat: add chat attachment validation"
```

---

### Task 3: 让工作区上传附件并传递 fileIds

**Files:**
- Modify: `src/composables/useChatWorkspace.ts:1-15, 52-67, 266-335, 363-391`
- Modify: `tests/chatWorkspace.test.mjs:16-62, 167-227`

- [ ] **Step 1: 扩展 fake API 并写上传链路失败测试**

在 `createFakeApi` 的返回对象中新增 `uploadFile`，使测试可检查调用顺序：

```js
uploadFile: async (file) => {
  calls.push(['uploadFile', file.name])
  return { id: calls.filter(([name]) => name === 'uploadFile').length, originalName: file.name }
},
```

在测试文件末尾新增以下测试。用普通对象作为文件，因为工作区只把它们传给 API：

```js
test('uploads attachments before streaming their IDs with the chat request', async () => {
  const api = createFakeApi({
    streamEvents: [{ type: 'COMPLETE', requestId: 'req-1', taskId: 50, assistantMessageId: 11, usage: null }],
    details: { 1: { session: session(1, '附件问题'), messages: [] } },
  })
  const workspace = createChatWorkspace({ api, initialSessions: [session(1, '新会话')] })

  const sent = await workspace.submit('总结这两个文件', 3, [
    { name: 'chart.png', type: 'image/png', size: 10 },
    { name: 'report.pdf', type: 'application/pdf', size: 20 },
  ], true)

  assert.equal(sent, true)
  assert.deepEqual(api.calls.slice(0, 3), [
    ['uploadFile', 'chart.png'],
    ['uploadFile', 'report.pdf'],
    ['stream', 1, {
      content: '总结这两个文件',
      fileIds: [1, 2],
      modelId: 3,
      requestId: api.calls[2][2].requestId,
    }],
  ])
  assert.equal(workspace.messages.value[0].content, '总结这两个文件')
})

test('does not create messages or stream when an attachment upload fails', async () => {
  const api = createFakeApi()
  api.uploadFile = async () => { throw new Error('文件上传失败') }
  const workspace = createChatWorkspace({ api, initialSessions: [session(1, '新会话')] })

  await assert.rejects(
    () => workspace.submit('分析文件', 3, [{ name: 'broken.pdf', type: 'application/pdf', size: 1 }], true),
    /文件上传失败/,
  )

  assert.equal(api.calls.some(([name]) => name === 'stream'), false)
  assert.equal(workspace.messages.value.length, 0)
  assert.equal(workspace.isUploading.value, false)
})

test('does not upload image attachments for a model without vision support', async () => {
  const api = createFakeApi()
  const workspace = createChatWorkspace({ api, initialSessions: [session(1, '新会话')] })

  await assert.rejects(
    () => workspace.submit('看图', 3, [{ name: 'chart.png', type: 'image/png', size: 1 }], false),
    /当前模型不支持图片输入/,
  )

  assert.equal(api.calls.some(([name]) => name === 'uploadFile'), false)
  assert.equal(api.calls.some(([name]) => name === 'stream'), false)
  assert.equal(workspace.messages.value.length, 0)
})
```

在已有 `createFakeApi` 和 `ChatWorkspaceApi` 相关位置补入 `uploadFile`，否则新的 Pick 类型会使 fake API 缺失方法。

- [ ] **Step 2: 运行工作区测试确认失败**

刷新 `.tmp-tests` 后运行：

```bash
node --test tests/chatWorkspace.test.mjs
```

预期：新增测试失败，原因是 `uploadFile` 未包含在工作区 API、`submit` 尚未接收附件、或 `isUploading` 尚未导出。

- [ ] **Step 3: 扩展工作区 API 和状态**

更新 import 和 API Pick：

```ts
import type { ChatMessage, ChatRequest, ChatSession, ChatStreamEvent, UploadedFile } from '../types/chat.js'

export type ChatWorkspaceApi = Pick<
  typeof chatApi,
  'listSessions' | 'createSession' | 'getSession' | 'updateSession' | 'pinSession' | 'deleteSession' | 'uploadFile' | 'stream' | 'regenerate' | 'readStream'
>
```

在现有生成状态附近加入：

```ts
const isUploading = ref(false)
```

添加仅在工作区内使用的类型：

```ts
interface PendingAttachment {
  name: string
  type: string
  size: number
}

function hasImageAttachment(files: PendingAttachment[]) {
  return files.some((file) => file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/gif')
}
```

`File` 满足该结构；让测试可以传普通对象，同时该层不复制 Composer 的选择规则。

- [ ] **Step 4: 将 fileIds 传给生成函数**

将 `generateAssistant` 签名改为：

```ts
async function generateAssistant(
  sessionId: number,
  assistant: ChatMessage,
  content: string,
  regenerate = false,
  fileIds?: number[],
) {
```

构造请求时只为首次发送加入文件 ID：

```ts
const request: ChatRequest = {
  content,
  fileIds: !regenerate && fileIds?.length ? fileIds : undefined,
  modelId: session?.defaultModelId || undefined,
  requestId,
}
```

保留 regenerate 的请求构造 ` { ...request, messageId: assistant.id }`；因为 `fileIds` 在 regenerate 时为 `undefined`，JSON 序列化不会发送该字段。

- [ ] **Step 5: 重写 submit 的准备、上传和乐观消息顺序**

将 `submit` 的签名和前半段替换为下面逻辑；其余更新标题、更新时间和 `await generateAssistant(...)` 沿用现有实现：

```ts
async function submit(
  content: string,
  defaultModelId?: number,
  files: PendingAttachment[] = [],
  supportVision = true,
) {
  const value = content.trim() || (files.length ? '请分析这些附件。' : '')
  if (!value || isGenerating.value || isUploading.value) return false
  if (hasImageAttachment(files) && !supportVision) {
    throw new Error('当前模型不支持图片输入，请切换支持图片的模型后重试')
  }

  isUploading.value = files.length > 0
  let fileIds: number[]
  try {
    fileIds = []
    for (const file of files) {
      const uploaded: UploadedFile = await api.uploadFile(file as File)
      fileIds.push(uploaded.id)
    }
  } finally {
    isUploading.value = false
  }

  if (activeSessionId.value === null) await createSession(defaultModelId)
  const sessionId = activeSessionId.value
  if (sessionId === null) return false
  const session = sessions.value.find((item) => item.id === sessionId)
  if (!session) return false

  // 保留既有的 ensureMessages、createMessage、标题更新和更新时间逻辑。
  // 最后调用：await generateAssistant(sessionId, assistantMessage, value, false, fileIds)
  return true
}
```

删除原先在会话创建之前立即创建本地消息的行为。这样任意上传失败都会在创建消息前抛出，页面可保留草稿。纯文本传入空数组，行为仍为既有流式流程；附件默认文案与 Task 2 的常量必须保持一致，实施时从 `chatAttachments.ts` 导入 `attachmentPrompt`，避免重复字符串。

- [ ] **Step 6: 暴露上传状态并补齐既有测试的模型夹具**

在工作区返回对象中把 `isUploading` 放在 `isGenerating` 后：

```ts
isGenerating,
isUploading,
isChangingModel,
```

所有在 `Chat.vue` 使用的 `ModelSummary` 降级对象、测试模型数据均要包含 Task 1 的 `supportVision` 字段。已有 `submit(content, defaultModelId)` 调用保持有效，因为后两个参数有默认值。

- [ ] **Step 7: 运行工作区测试确认通过**

刷新 `.tmp-tests` 后运行：

```bash
node --test tests/chatWorkspace.test.mjs
```

预期：所有既有测试和三个新增测试 PASS。特别确认上传调用发生在 stream 之前、ID 顺序为 `[1, 2]`、上传失败没有本地消息、视觉能力不足没有 HTTP 调用。

- [ ] **Step 8: 提交工作区上传编排**

```bash
git add src/composables/useChatWorkspace.ts tests/chatWorkspace.test.mjs
git commit -m "feat: send chat attachments"
```

---

### Task 4: 实现 Composer 附件选择、草稿和可访问界面

**Files:**
- Modify: `src/components/common/AppIcon.vue:9-31`
- Modify: `src/components/chat/Composer.vue:1-48`
- Modify: `src/assets/main.css:123-131`

- [ ] **Step 1: 添加所需图标**

在 `AppIcon.vue` 的 `send` 分支前添加下列 `path` 分支：

```vue
<path v-else-if="name === 'paperclip'" d="m21.4 11.6-8.5 8.5a5 5 0 0 1-7.1-7.1l9.2-9.2a3.5 3.5 0 0 1 5 5L10.7 18a2 2 0 0 1-2.8-2.8l8.5-8.5" />
<path v-else-if="name === 'file'" d="M6 3h8l4 4v14H6zM14 3v5h5M9 13h6M9 17h4" />
<path v-else-if="name === 'image'" d="M4 5h16v14H4zM7 16l3.5-4 2.5 3 2-2 2 3M8 9h.01" />
```

复用已有 `close` 图标做移除按钮；无需引入图标库。

- [ ] **Step 2: 将 Composer 改为受控附件草稿组件**

用以下脚本结构替换 `Composer.vue` 的 `<script setup>`。它保持 Enter/Shift+Enter 行为，只有附件时也允许提交，并且只有页面显式调用 `clear()` 才丢弃草稿：

```ts
<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import { formatFileSize, selectChatAttachments } from '../../lib/chatAttachments.js'

defineProps<{ generating: boolean; submitting?: boolean }>()
const emit = defineEmits<{
  submit: [payload: { content: string; files: File[] }]
  stop: []
  invalidFiles: [messages: string[]]
}>()

const value = ref('')
const files = ref<File[]>([])
const inputRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const canSubmit = computed(() => Boolean(value.value.trim() || files.value.length))

function resize() {
  const input = inputRef.value
  if (!input) return
  input.style.height = 'auto'
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`
}

function chooseFiles() {
  fileInputRef.value?.click()
}

function addFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const selection = selectChatAttachments(files.value, Array.from(input.files ?? []))
  files.value = selection.files
  if (selection.errors.length) emit('invalidFiles', selection.errors)
  input.value = ''
}

function removeFile(index: number) {
  files.value.splice(index, 1)
}

function submit() {
  if (!canSubmit.value) return
  emit('submit', { content: value.value, files: [...files.value] })
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    submit()
  }
}

function clear() {
  value.value = ''
  files.value = []
  void nextTick(resize)
}

defineExpose({
  fill: (text: string) => { value.value = text; void nextTick(resize); inputRef.value?.focus() },
  clear,
})
</script>
```

`accept` 必须为 `image/jpeg,image/png,image/gif,application/pdf`，并加 `multiple`。给所有操作按钮保留可访问名称，上传/生成中禁用添加、移除和发送。

- [ ] **Step 3: 添加附件模板**

在 textarea 后、`composer__bottom` 前插入：

```vue
<input
  ref="fileInputRef"
  class="composer__file-input"
  type="file"
  accept="image/jpeg,image/png,image/gif,application/pdf"
  multiple
  :disabled="generating || submitting"
  @change="addFiles"
/>
<div v-if="files.length" class="composer__attachments" aria-label="待发送附件">
  <div v-for="(file, index) in files" :key="`${file.name}-${file.size}-${index}`" class="attachment-chip">
    <AppIcon :name="file.type === 'application/pdf' ? 'file' : 'image'" size="16" />
    <span class="attachment-chip__details"><strong>{{ file.name }}</strong><small>{{ formatFileSize(file.size) }}</small></span>
    <button type="button" :disabled="generating || submitting" :aria-label="`移除附件 ${file.name}`" @click="removeFile(index)"><AppIcon name="close" size="14" /></button>
  </div>
</div>
```

将原有的附件按钮替换为：

```vue
<button type="button" class="composer-tool" :disabled="generating || submitting" aria-label="添加附件" @click="chooseFiles">
  <AppIcon name="paperclip" size="16" /><span>添加</span>
</button>
```

发送按钮改为以 `canSubmit || submitting || generating` 控制，上传时显示 `…` 并有 `aria-label="正在上传附件"`。`generating` 为真时仍优先展示现有停止按钮。

- [ ] **Step 4: 添加样式和移动端适配**

在 `main.css` 的 Composer 规则后添加：

```css
.composer__file-input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; clip-path: inset(50%); }
.composer__attachments { display: flex; max-height: 132px; margin-top: 8px; flex-direction: column; gap: 6px; overflow-y: auto; }
.attachment-chip { display: flex; min-width: 0; align-items: center; gap: 8px; padding: 7px 8px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface-soft); color: var(--text-muted); }
.attachment-chip__details { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 1px; }
.attachment-chip strong { overflow: hidden; color: var(--text); font-size: 11px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.attachment-chip small { color: var(--text-soft); font-size: 10px; }
.attachment-chip button { display: grid; width: 24px; height: 24px; place-items: center; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--text-soft); }
.attachment-chip button:hover:not(:disabled) { background: var(--surface-hover); color: var(--text); }
.composer-tool:disabled, .attachment-chip button:disabled { cursor: not-allowed; opacity: .45; }
```

在现有 `@media (max-width: 760px)` 内加上 `.composer__attachments { max-height: 112px; }`。不要让长文件名扩大 Composer 或在移动端造成横向滚动。

- [ ] **Step 5: 执行静态验证**

```bash
npm run type-check
npm run build
```

预期：事件负载、模板 ref、`File[]` 与图标名称均通过 Vue 类型检查，生产构建成功。

- [ ] **Step 6: 提交 Composer 界面**

```bash
git add src/components/common/AppIcon.vue src/components/chat/Composer.vue src/assets/main.css
git commit -m "feat: add chat attachment composer"
```

---

### Task 5: 连接 Chat 页面、保持草稿并完成回归验证

**Files:**
- Modify: `src/views/Chat.vue:40-59, 122-124, 177-196`
- Modify: `tests/apiClient.test.mjs`
- Modify: `tests/chatAttachments.test.mjs`
- Modify: `tests/chatWorkspace.test.mjs`

- [ ] **Step 1: 先补齐页面使用所需的模型降级字段**

`src/views/Chat.vue` 中 `activeModel` 的降级对象补齐：

```ts
supportVision: false,
```

这样模型列表尚未加载、加载失败或引用已下线模型时，图片会被安全地阻止而不会假定模型支持视觉输入。

- [ ] **Step 2: 替换页面提交处理函数**

将 `submitMessage` 替换为异步函数：

```ts
async function submitMessage(payload: { content: string; files: File[] }) {
  try {
    const sent = await workspace.submit(
      payload.content,
      currentModelId.value,
      payload.files,
      activeModel.value.supportVision,
    )
    if (sent) composerRef.value?.clear()
  } catch (error) {
    notify(error instanceof Error ? error.message : '发送失败，请重试')
  }
}
```

此处必须只在 `sent` 为真后调用 `clear()`：上传错误和视觉能力拦截会抛错，用户的原始文字与附件继续留在 Composer 中。新增：

```ts
function notifyInvalidFiles(messages: string[]) {
  notify(messages[0] ?? '部分附件不可用')
}
```

- [ ] **Step 3: 绑定 Composer 上传状态和新事件**

将页面模板中的 Composer 改为：

```vue
<Composer
  ref="composerRef"
  :generating="isGenerating"
  :submitting="workspace.isUploading"
  @submit="submitMessage"
  @invalid-files="notifyInvalidFiles"
  @stop="workspace.stopGeneration"
/>
```

Vue 会自动解包 `Ref<boolean>`，因此不要在模板中使用 `.value`。将 `workspace.isUploading` 在 script 中赋值为 `const isUploading = workspace.isUploading`，并绑定 `:submitting="isUploading"`，以匹配当前文件中其他 workspace ref 的写法。

- [ ] **Step 4: 更新夹具并运行全部自动化测试**

确保所有测试模型对象都有 `supportVision`，然后刷新 `.tmp-tests` 并执行：

```bash
node --test tests/apiClient.test.mjs tests/chatAttachments.test.mjs tests/chatWorkspace.test.mjs tests/sseParser.test.mjs
npm run type-check
npm run build
```

预期：所有 Node 测试、类型检查和生产构建 PASS。若 Node 版本在测试中没有全局 `File`，在 API 测试中使用 `node:buffer` 导入 `File`：

```js
import { File } from 'node:buffer'
```

仅在实际测试环境需要时加入该导入，避免遮蔽浏览器生产代码。

- [ ] **Step 5: 进行浏览器联调验收**

启动前端：

```bash
npm run dev -- --host localhost
```

在已登录、后端与对象存储可用的环境中逐项验证：

1. 点击“添加”只能选择 JPEG、PNG、GIF、PDF，选择后显示文件名、大小和移除按钮。
2. 尝试 TXT、超过 10 MB 的文件以及第 11 个有效文件时，当前有效草稿保留且显示提示。
3. 仅添加 PDF 后点击发送：UI 使用“请分析这些附件。”作为用户消息，网络面板先出现 `POST /api/files`，再出现 stream 请求，后者 JSON 含上传响应中的 `fileIds`。
4. 添加 PDF 和文本提问：本地用户消息和请求正文都使用该提问，`fileIds` 按附件显示顺序出现。
5. 选择图片并切换到 `supportVision: false` 的模型：显示切换模型提示，不产生 `/api/files` 或 stream 请求，附件草稿仍保留。
6. 人为令一次上传返回错误：不创建用户/助手消息、不调用 stream，文本和附件仍留在 Composer。
7. 成功发送后草稿被清空；生成时添加、移除和发送不可用，停止按钮仍可用。
8. 不选择附件的普通文本聊天、重新生成和后续追问仍可正常工作；后两者不重复传入 `fileIds`。

- [ ] **Step 6: 检查工作区与提交最终页面接入**

```bash
git diff --check
git status --short
git add src/views/Chat.vue tests/apiClient.test.mjs tests/chatAttachments.test.mjs tests/chatWorkspace.test.mjs
git commit -m "feat: wire chat attachment uploads"
git status --short
```

预期：没有空白错误，工作区干净，最后一个提交只包含页面接入及为该接入必要的测试夹具调整。
