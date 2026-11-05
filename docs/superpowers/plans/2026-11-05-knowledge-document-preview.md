# Knowledge Document Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-page modal for viewing text knowledge documents and browser-previewing uploaded files through presigned URLs.

**Architecture:** `knowledgeApi` and `createKnowledgeBaseWorkspace` own the two preview API calls and asynchronous state. `KnowledgeBases.vue` coordinates selection and retry, while a dedicated `DocumentPreviewDialog.vue` renders loading, error, text, and file states. The document-list component remains a stateless event emitter.

**Tech Stack:** Vue 3 Composition API, TypeScript, Fetch API, Node built-in test runner, Vite, vue-tsc.

---

## File Structure and Responsibilities

- `src/types/chat.ts`: Defines preview response contracts and a discriminated preview payload.
- `src/api/knowledge.ts`: Adds document-content and file-presigned-URL API methods using the existing authenticated client.
- `src/composables/useKnowledgeBaseWorkspace.ts`: Loads previews, isolates preview errors/loading from document-list state, and rejects late responses after reset.
- `src/components/common/AppIcon.vue`: Adds the eye icon used by the document action.
- `src/components/knowledge/KnowledgeBaseDetail.vue`: Adds a labelled view button and emits the selected document.
- `src/components/knowledge/DocumentPreviewDialog.vue`: Renders the current modal state without making HTTP requests.
- `src/views/KnowledgeBases.vue`: Owns modal visibility/selection and connects component events to workspace methods.
- `src/assets/main.css`: Adds preview-specific modal, content, iframe, and responsive styles while reusing existing theme variables.
- `tests/apiClient.test.mjs`: Verifies the exact two API request paths.
- `tests/knowledgeWorkspace.test.mjs`: Verifies text/file branching, failure recovery, missing file IDs, and stale-result isolation.

The project uses Node tests against TypeScript transpiled into an untracked `.tmp-tests` directory. Before every Node test run, compile the production modules needed by these tests:

```bash
rm -rf .tmp-tests && npx tsc --ignoreConfig --outDir .tmp-tests --rootDir . --module NodeNext --moduleResolution NodeNext --target ES2022 --skipLibCheck src/api/client.ts src/api/chat.ts src/api/knowledge.ts src/composables/useKnowledgeBaseWorkspace.ts src/types/chat.ts
```

## Task 1: Add Preview API Contracts

**Files:**
- Modify: `src/types/chat.ts:160-173`
- Modify: `src/api/knowledge.ts:1-63`
- Modify: `tests/apiClient.test.mjs:159-184`

- [ ] **Step 1: Write the failing API contract test**

Append this test to `tests/apiClient.test.mjs`:

```js
test('requests text content and a file presigned URL for document previews', async () => {
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
```

- [ ] **Step 2: Run the targeted test and confirm it fails**

Run the transpile command from **File Structure and Responsibilities**, then:

```bash
node --test --test-name-pattern="requests text content" tests/apiClient.test.mjs
```

Expected: FAIL because `knowledgeApi.getDocumentContent` and `knowledgeApi.getFilePresignedUrl` do not exist.

- [ ] **Step 3: Define the preview types**

Append these exact declarations after `KnowledgeDocument` in `src/types/chat.ts`:

```ts
export interface KnowledgeDocumentContent {
  documentId: number
  title: string
  content: string
}

export interface FileDownloadUrl {
  fileId: number
  url: string
  expiresIn: number
}

export type KnowledgeDocumentPreview =
  | { kind: 'TEXT'; documentId: number; title: string; content: string }
  | { kind: 'FILE'; documentId: number; title: string; fileId: number; url: string }
```

Do not narrow the existing `KnowledgeDocumentSourceType = string`; the backend contract may add source types in the future.

- [ ] **Step 4: Implement the two API methods**

Extend the type import at the top of `src/api/knowledge.ts`:

```ts
import type {
  EmbeddingModel,
  FileDownloadUrl,
  KnowledgeBase,
  KnowledgeDocument,
  KnowledgeDocumentContent,
  PageResult,
} from '../types/chat.js'
```

Add these methods to `knowledgeApi` immediately after `listDocuments`:

```ts
getDocumentContent(baseId: number, documentId: number) {
  return apiRequest<KnowledgeDocumentContent>(
    `/api/knowledge-bases/${baseId}/documents/${documentId}/content`,
  )
},
getFilePresignedUrl(fileId: number) {
  return apiRequest<FileDownloadUrl>(`/api/files/${fileId}/presigned-url`)
},
```

- [ ] **Step 5: Run the targeted test and confirm it passes**

Run the transpile command, then:

```bash
node --test --test-name-pattern="requests text content" tests/apiClient.test.mjs
```

Expected: PASS with one passing matching test.

- [ ] **Step 6: Commit the API contract work**

```bash
git add src/types/chat.ts src/api/knowledge.ts tests/apiClient.test.mjs
git commit -m "feat: add document preview API contracts"
```

## Task 2: Add Preview Loading to the Knowledge Workspace

**Files:**
- Modify: `src/composables/useKnowledgeBaseWorkspace.ts:1-245`
- Modify: `tests/knowledgeWorkspace.test.mjs:1-114`

- [ ] **Step 1: Extend the fake API and write failing workspace tests**

In `tests/knowledgeWorkspace.test.mjs`, change the `document` helper to accept source type and file ID:

```js
const document = (id, status = 'COMPLETED', sourceType = 'FILE', fileId = 6) => ({
  id,
  title: '员工手册',
  sourceType,
  fileId,
  status,
  indexVersion: 1,
  activeIndexVersion: 1,
  chunkCount: 4,
  errorCode: status === 'FAILED' ? 'INDEX_FAILED' : null,
  errorMessage: status === 'FAILED' ? '索引失败' : null,
  createTime: '2026-11-04T10:00:00',
  updateTime: '2026-11-04T10:00:00',
})
```

Add these fake API methods before the closing object in `createFakeApi`:

```js
getDocumentContent: async (baseId, documentId) => {
  calls.push(['getDocumentContent', baseId, documentId])
  return { documentId, title: '请假制度', content: '第一条\n第二条' }
},
getFilePresignedUrl: async (fileId) => {
  calls.push(['getFilePresignedUrl', fileId])
  return { fileId, url: `https://files.example/${fileId}`, expiresIn: 600 }
},
```

Append these tests:

```js
test('loads text and file previews through their respective API methods', async () => {
  const api = createFakeApi({ detail: base(1, '手册') })
  const workspace = createKnowledgeBaseWorkspace({ api })
  await workspace.openBase(1)

  await workspace.loadDocumentPreview(document(8, 'COMPLETED', 'TEXT', null))
  assert.deepEqual(workspace.preview.value, {
    kind: 'TEXT', documentId: 8, title: '请假制度', content: '第一条\n第二条',
  })

  await workspace.loadDocumentPreview(document(9))
  assert.deepEqual(workspace.preview.value, {
    kind: 'FILE', documentId: 9, title: '员工手册', fileId: 6, url: 'https://files.example/6',
  })
  assert.deepEqual(api.calls.filter(([name]) => name.startsWith('get')), [
    ['get', 1], ['getDocumentContent', 1, 8], ['getFilePresignedUrl', 6],
  ])
})

test('keeps preview errors local and rejects a file document without a file ID', async () => {
  const workspace = createKnowledgeBaseWorkspace({ api: createFakeApi({ detail: base(1, '手册') }) })
  await workspace.openBase(1)

  await assert.rejects(() => workspace.loadDocumentPreview(document(8, 'COMPLETED', 'FILE', null)), /文件信息不完整/)

  assert.equal(workspace.preview.value, null)
  assert.equal(workspace.previewError.value, '文件信息不完整，无法预览')
  assert.equal(workspace.isLoadingPreview.value, false)
})

test('ignores a preview response that arrives after preview state resets', async () => {
  let resolveContent
  const api = createFakeApi({ detail: base(1, '手册') })
  api.getDocumentContent = () => new Promise((resolve) => { resolveContent = resolve })
  const workspace = createKnowledgeBaseWorkspace({ api })
  await workspace.openBase(1)

  const pending = workspace.loadDocumentPreview(document(8, 'COMPLETED', 'TEXT', null))
  workspace.resetDocumentPreview()
  resolveContent({ documentId: 8, title: '请假制度', content: '不应显示' })
  await pending

  assert.equal(workspace.preview.value, null)
  assert.equal(workspace.previewError.value, null)
  assert.equal(workspace.isLoadingPreview.value, false)
})
```

- [ ] **Step 2: Run the workspace tests and confirm they fail**

Run the transpile command, then:

```bash
node --test tests/knowledgeWorkspace.test.mjs
```

Expected: FAIL because `loadDocumentPreview`, `resetDocumentPreview`, and preview refs do not exist.

- [ ] **Step 3: Extend the injectable API type and add preview state**

In the `KnowledgeBaseWorkspaceApi` `Pick`, append `getDocumentContent` and `getFilePresignedUrl`. Extend the type import to include `KnowledgeDocumentPreview`.

After `isMutating`, add these refs and request version:

```ts
const preview = ref<KnowledgeDocumentPreview | null>(null)
const previewError = ref<string | null>(null)
const isLoadingPreview = ref(false)
const previewingDocumentId = ref<number | null>(null)
let previewRequestVersion = 0
```

- [ ] **Step 4: Implement the stale-safe preview methods**

Add these methods before the returned object:

```ts
async function loadDocumentPreview(document: KnowledgeDocument) {
  const base = requireSelectedBase()
  const requestVersion = ++previewRequestVersion
  preview.value = null
  previewError.value = null
  isLoadingPreview.value = true
  previewingDocumentId.value = document.id

  try {
    if (document.sourceType === 'TEXT') {
      const content = await api.getDocumentContent(base.id, document.id)
      if (requestVersion === previewRequestVersion) {
        preview.value = { kind: 'TEXT', documentId: document.id, title: content.title, content: content.content }
      }
      return preview.value
    }

    if (document.sourceType === 'FILE') {
      if (document.fileId === null) throw new Error('文件信息不完整，无法预览')
      const download = await api.getFilePresignedUrl(document.fileId)
      if (requestVersion === previewRequestVersion) {
        preview.value = {
          kind: 'FILE', documentId: document.id, title: document.title,
          fileId: document.fileId, url: download.url,
        }
      }
      return preview.value
    }

    throw new Error('暂不支持预览此文档类型')
  } catch (error) {
    const message = errorMessage(error, '加载文档预览失败，请重试')
    if (requestVersion === previewRequestVersion) previewError.value = message
    throw error
  } finally {
    if (requestVersion === previewRequestVersion) {
      isLoadingPreview.value = false
      previewingDocumentId.value = null
    }
  }
}

function resetDocumentPreview() {
  previewRequestVersion += 1
  preview.value = null
  previewError.value = null
  isLoadingPreview.value = false
  previewingDocumentId.value = null
}
```

Expose `preview`, `previewError`, `isLoadingPreview`, `previewingDocumentId`, `loadDocumentPreview`, and `resetDocumentPreview` in the returned workspace object.

- [ ] **Step 5: Run the workspace tests and confirm they pass**

Run the transpile command, then:

```bash
node --test tests/knowledgeWorkspace.test.mjs
```

Expected: PASS for all workspace tests, including the three preview tests.

- [ ] **Step 6: Commit the workspace work**

```bash
git add src/composables/useKnowledgeBaseWorkspace.ts tests/knowledgeWorkspace.test.mjs
git commit -m "feat: load knowledge document previews"
```

## Task 3: Build the Preview Dialog and Document-Row Trigger

**Files:**
- Modify: `src/components/common/AppIcon.vue:9-35`
- Modify: `src/components/knowledge/KnowledgeBaseDetail.vue:21-31, 97-108`
- Create: `src/components/knowledge/DocumentPreviewDialog.vue`
- Modify: `src/assets/main.css:218-222`

The repository has no browser-component test harness. Keep data logic covered by Task 2; use `npm run type-check` after this task, then manually verify the rendered component in Task 4.

- [ ] **Step 1: Add an eye icon and the detail-view event**

In `AppIcon.vue`, add the following branch immediately before the `trash` branch:

```vue
<path v-else-if="name === 'eye'" d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
```

In `KnowledgeBaseDetail.vue`, add this event to `defineEmits`:

```ts
preview: [document: KnowledgeDocument]
```

Then add this button as the first child of `.document-row__actions`, before the failed-document retry button:

```vue
<button
  class="icon-button"
  type="button"
  :disabled="mutating || previewingDocumentId === document.id"
  aria-label="查看文档"
  @click="emit('preview', document)"
>
  <AppIcon name="eye" size="16" />
</button>
```

Add `previewingDocumentId?: number | null` to the component props and default it to `null` so that only the requested row is disabled.

- [ ] **Step 2: Create the presentation-only dialog**

Create `src/components/knowledge/DocumentPreviewDialog.vue` with this content:

```vue
<script setup lang="ts">
import AppIcon from '../common/AppIcon.vue'
import type { KnowledgeDocument, KnowledgeDocumentPreview } from '../../types/chat.js'

const props = withDefaults(defineProps<{
  open: boolean
  document: KnowledgeDocument | null
  preview: KnowledgeDocumentPreview | null
  loading?: boolean
  error?: string | null
}>(), {
  loading: false,
  error: null,
})

const emit = defineEmits<{
  close: []
  retry: []
}>()

function close() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="auth-modal-overlay" role="presentation" @click.self="close">
      <section
        class="auth-modal document-preview-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="document ? `预览：${document.title}` : '文档预览'"
        tabindex="-1"
      >
        <header class="auth-modal__header">
          <div>
            <p class="eyebrow">知识文档</p>
            <h2>{{ document?.title || '文档预览' }}</h2>
          </div>
          <button class="icon-button" type="button" aria-label="关闭预览" @click="close"><AppIcon name="close" /></button>
        </header>

        <div v-if="loading" class="document-preview-dialog__status">正在加载预览…</div>
        <div v-else-if="error" class="document-preview-dialog__status document-preview-dialog__status--error">
          <p>{{ error }}</p>
          <button class="form-button form-button--secondary" type="button" @click="emit('retry')">重试</button>
        </div>
        <pre v-else-if="preview?.kind === 'TEXT'" class="document-preview-dialog__text">{{ preview.content }}</pre>
        <div v-else-if="preview?.kind === 'FILE'" class="document-preview-dialog__file">
          <iframe
            class="document-preview-dialog__frame"
            :src="preview.url"
            :title="`预览：${preview.title}`"
            referrerpolicy="no-referrer"
          ></iframe>
          <a class="form-button form-button--secondary" :href="preview.url" target="_blank" rel="noopener noreferrer">在新标签页打开</a>
        </div>
        <div v-else class="document-preview-dialog__status">暂无可预览内容。</div>
      </section>
    </div>
  </Teleport>
</template>
```

- [ ] **Step 3: Add modal and responsive styles**

Append this CSS after the knowledge-base workspace styles in `src/assets/main.css`:

```css
.document-preview-dialog { display: flex; width: min(880px, 100%); min-height: min(520px, calc(100vh - 40px)); flex-direction: column; overflow: hidden; }
.document-preview-dialog__status { display: grid; min-height: 260px; place-content: center; gap: 12px; color: var(--text-muted); font-size: 13px; text-align: center; }
.document-preview-dialog__status p { margin: 0; color: var(--danger); }
.document-preview-dialog__status--error { color: var(--danger); }
.document-preview-dialog__status--error .form-button { justify-self: center; }
.document-preview-dialog__text { min-height: 0; margin: 20px 0 0; padding: 14px; overflow: auto; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-soft); color: var(--text); font: 12px/1.65 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.document-preview-dialog__file { display: flex; min-height: 0; flex: 1; margin-top: 20px; flex-direction: column; gap: 12px; }
.document-preview-dialog__frame { width: 100%; min-height: 320px; flex: 1; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-soft); }
.document-preview-dialog__file .form-button { align-self: flex-end; }

@media (max-width: 760px) {
  .document-preview-dialog { min-height: calc(100vh - 40px); padding: 20px; }
  .document-preview-dialog__frame { min-height: 300px; }
  .document-preview-dialog__file .form-button { width: 100%; align-self: stretch; }
}
```

- [ ] **Step 4: Type-check the new components**

```bash
npm run type-check
```

Expected: exits with status 0 and reports no Vue/TypeScript errors.

- [ ] **Step 5: Commit the presentation work**

```bash
git add src/components/common/AppIcon.vue src/components/knowledge/KnowledgeBaseDetail.vue src/components/knowledge/DocumentPreviewDialog.vue src/assets/main.css
git commit -m "feat: add knowledge document preview dialog"
```

## Task 4: Wire Page Coordination and Verify End-to-End Behavior

**Files:**
- Modify: `src/views/KnowledgeBases.vue:1-224`
- Modify: `src/components/knowledge/KnowledgeBaseDetail.vue:5-19` (pass the loading-row ID added in Task 3)

- [ ] **Step 1: Add the dialog import and page state**

In `src/views/KnowledgeBases.vue`, import the dialog and document type:

```ts
import DocumentPreviewDialog from '../components/knowledge/DocumentPreviewDialog.vue'
import type { EmbeddingModel, KnowledgeBase, KnowledgeDocument } from '../types/chat.js'
```

After `textFormOpen`, add:

```ts
const previewOpen = ref(false)
const previewDocument = ref<KnowledgeDocument | null>(null)
```

- [ ] **Step 2: Add page-level preview handlers**

Add these functions after `retryDocument`:

```ts
async function loadPreview(document: KnowledgeDocument) {
  try {
    await workspace.loadDocumentPreview(document)
  } catch {
    // The dialog renders workspace.previewError and lets the user retry.
  }
}

function openPreview(document: KnowledgeDocument) {
  previewDocument.value = document
  previewOpen.value = true
  void loadPreview(document)
}

function closePreview() {
  previewOpen.value = false
  previewDocument.value = null
  workspace.resetDocumentPreview()
}

function retryPreview() {
  if (previewDocument.value) void loadPreview(previewDocument.value)
}
```

Do not call `notify` for preview failures: the error must remain next to the retry action in the open dialog.

- [ ] **Step 3: Connect the list event and render the dialog**

In the `KnowledgeBaseDetail` usage, add the prop and event:

```vue
:previewing-document-id="workspace.previewingDocumentId.value"
@preview="openPreview"
```

After `TextDocumentDialog`, add this dialog instance:

```vue
<DocumentPreviewDialog
  :open="previewOpen"
  :document="previewDocument"
  :preview="workspace.preview.value"
  :loading="workspace.isLoadingPreview.value"
  :error="workspace.previewError.value"
  @close="closePreview"
  @retry="retryPreview"
/>
```

- [ ] **Step 4: Run automated verification**

Run the test transpile command, then:

```bash
node --test tests/apiClient.test.mjs tests/knowledgeWorkspace.test.mjs
npm run type-check
npm run build
```

Expected: all Node tests pass, type checking exits 0, and Vite produces a production bundle successfully.

- [ ] **Step 5: Manually verify the browser flows**

Start the app with `npm run dev`, authenticate, and open a knowledge-base detail page. Verify each condition:

1. Each document row has an eye action labelled `查看文档`; its own button disables while its request is pending.
2. A text document opens a modal with its title and newline-preserving, selectable content; close it using the header button and overlay.
3. A file document requests its presigned URL, renders it in an iframe where supported, and exposes `在新标签页打开` with the same resolved URL.
4. A document with a failed URL request displays its API message and retry control without a global toast or disabled list.
5. Close a modal while a delayed request is pending, then open another document; the first request must not overwrite the second modal's content.
6. On a narrow mobile viewport, the modal body stays in the viewport, text scrolls, the iframe remains usable, and the open-link button fills the available width.

- [ ] **Step 6: Commit the integration**

```bash
git add src/views/KnowledgeBases.vue src/components/knowledge/KnowledgeBaseDetail.vue
git commit -m "feat: wire knowledge document previews"
```

## Final Verification

- [ ] **Step 1: Inspect the final working tree**

```bash
git status --short
git log --oneline -4
```

Expected: no uncommitted feature files; the recent commits cover API contracts, workspace loading, dialog presentation, and page integration.

- [ ] **Step 2: Run the full project checks once more**

```bash
rm -rf .tmp-tests && npx tsc --ignoreConfig --outDir .tmp-tests --rootDir . --module NodeNext --moduleResolution NodeNext --target ES2022 --skipLibCheck src/api/client.ts src/api/chat.ts src/api/knowledge.ts src/composables/useKnowledgeBaseWorkspace.ts src/types/chat.ts
node --test tests/apiClient.test.mjs tests/knowledgeWorkspace.test.mjs
npm run build
```

Expected: all focused tests pass and the production build succeeds.
