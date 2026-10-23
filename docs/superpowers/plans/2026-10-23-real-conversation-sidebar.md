# Real Conversation Sidebar Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace demo conversations in the chat sidebar with authenticated backend sessions, including infinite pagination and real create/select/rename/pin/delete operations.

**Architecture:** Extend `createChatWorkspace` as the single source of truth for session and active-detail state. Inject a small chat API interface into the workspace so tests can use deterministic fakes while production defaults to `chatApi`. Keep `Sidebar` presentational: it owns search/edit/menu UI and emits `load-more`; `Chat.vue` wires workspace state and displays operation feedback.

**Tech Stack:** Vue 3 Composition API, TypeScript, Vue Router, existing `chatApi`/`apiRequest`, Node built-in test runner with the repository's `.tmp-tests` TypeScript test harness, Vite/Vue TSC.

---

## File map

- Modify `src/composables/useChatWorkspace.ts`: add API-backed loading, pagination, detail loading, CRUD operations, race protection, and exposed async state while preserving local message-generation behavior used by existing tests.
- Modify `src/components/chat/Sidebar.vue`: accept loading/error props, emit `load-more`/`retry-load`, and detect scroll proximity without making API calls.
- Modify `src/views/Chat.vue`: instantiate the workspace without demo data, load sessions on mount, connect all sidebar events, and show loading/error feedback.
- Modify `src/assets/main.css`: add only the loading/error/list-footer styles required by the new sidebar states.
- Modify `tests/chatWorkspace.test.mjs`: add API-backed workspace tests using a fake implementation of the injected API.
- Create `docs/superpowers/plans/2026-10-23-real-conversation-sidebar.md`: this implementation plan.

## Task 1: Add API-backed workspace state with failing tests first

**Files:**
- Test: `tests/chatWorkspace.test.mjs`
- Modify: `src/composables/useChatWorkspace.ts`

- [ ] **Step 1: Define the injected API contract and test fixtures.**

Add a test-only fake API shape matching the production methods:

```js
const session = (id, title) => ({
  id, title, defaultModelId: 3, pinned: false, status: 'ACTIVE',
  lastMessageTime: null, createTime: '2026-10-23T10:00:00', updateTime: '2026-10-23T10:00:00',
})

function createFakeApi({ pages = [], details = {} } = {}) {
  const calls = []
  return {
    calls,
    listSessions: async (page, size) => {
      calls.push(['listSessions', page, size])
      return pages[page - 1] ?? { records: [], total: 0, current: page, size, pages: page - 1 }
    },
    createSession: async () => { calls.push(['createSession']); return session(99, '服务端新会话') },
    getSession: async (id) => { calls.push(['getSession', id]); return details[id] ?? { session: session(id, `会话 ${id}`), messages: [] } },
    updateSession: async (id, payload) => { calls.push(['updateSession', id, payload]); return { ...session(id, payload.title ?? `会话 ${id}`), ...payload } },
    pinSession: async (id, pinned) => { calls.push(['pinSession', id, pinned]); return { ...session(id, `会话 ${id}`), pinned } },
    deleteSession: async (id) => { calls.push(['deleteSession', id]); return null },
  }
}
```

Use `initialSessions: []` in API-backed tests so no demo record can mask a failed load.

- [ ] **Step 2: Write failing tests for load, pagination, and detail selection.**

Add tests asserting the exact request sequence and state:

```js
test('loads the first session page and its first detail', async () => {
  const api = createFakeApi({ pages: [{ records: [session(1, '第一条')], total: 1, current: 1, size: 20, pages: 1 }] })
  const workspace = createChatWorkspace({ api })

  await workspace.loadSessions()

  assert.deepEqual(api.calls, [['listSessions', 1, 20], ['getSession', 1]])
  assert.equal(workspace.activeSessionId.value, 1)
  assert.equal(workspace.sessions.value[0].title, '第一条')
})

test('appends the next page and stops after the last page', async () => {
  const api = createFakeApi({
    pages: [
      { records: [session(1, '一')], total: 2, current: 1, size: 1, pages: 2 },
      { records: [session(2, '二')], total: 2, current: 2, size: 1, pages: 2 },
    ],
  })
  const workspace = createChatWorkspace({ api, pageSize: 1 })

  await workspace.loadSessions()
  await workspace.loadMoreSessions()
  await workspace.loadMoreSessions()

  assert.deepEqual(workspace.sessions.value.map(({ id }) => id), [1, 2])
  assert.deepEqual(api.calls.filter(([name]) => name === 'listSessions'), [['listSessions', 1, 1], ['listSessions', 2, 1]])
})
```

Run the repository's test harness command used for these tests (after the harness has copied TypeScript sources to `.tmp-tests`):

```sh
node --test tests/chatWorkspace.test.mjs
```

Expected: FAIL because `createChatWorkspace` has no `api`, `loadSessions`, `loadMoreSessions`, or `pageSize` support.

- [ ] **Step 3: Implement the minimal workspace API contract and pagination.**

In `useChatWorkspace.ts`, import `chatApi`, `ApiError`, `readonly`, and `ref`; define a local `ChatWorkspaceApi` type from the six existing methods. Default `options.api` to `chatApi`, keep `respond` optional for the existing local-generation tests, and add `pageSize = 20`.

Expose these refs and methods:

```ts
const isLoadingSessions = ref(false)
const isLoadingMoreSessions = ref(false)
const isLoadingSessionDetail = ref(false)
const sessionsError = ref<string | null>(null)
const sessionDetailError = ref<string | null>(null)
const currentPage = ref(0)
const totalPages = ref(0)
const hasMoreSessions = computed(() => currentPage.value < totalPages.value)
```

Implement `loadSessions()` so it clears the list, messages, and active ID; requests page 1; assigns `records` as a copy; sets page metadata; and calls `loadSessionDetail` for the first record. Guard duplicate calls with `isLoadingSessions`, and set `sessionsError` to `error.message` on failure without creating fallback data.

Implement `loadMoreSessions()` so it returns when either load flag is active or `hasMoreSessions` is false; requests `currentPage + 1`; appends records; updates metadata; and leaves the page unchanged after a failure.

Implement `loadSessionDetail(id)` with an incrementing request counter. Only the request whose counter is still current may update `activeSessionId`, `messagesBySession[id]`, or the selected session object. Use a copied message array to avoid mutating API response objects.

- [ ] **Step 4: Run the focused tests and preserve existing local-generation behavior.**

Run:

```sh
node --test tests/chatWorkspace.test.mjs
```

Expected: all existing local create/submit/failure tests plus the new load/pagination/detail tests PASS. If old tests fail because the workspace now defaults to `chatApi`, keep the existing local behavior by only invoking the API from explicit `loadSessions()`/CRUD methods; `createSession()` must use local behavior only until Task 3 wires the view to the async method.

- [ ] **Step 5: Commit the workspace foundation.**

```sh
git add src/composables/useChatWorkspace.ts tests/chatWorkspace.test.mjs
git commit -m "feat: add API-backed conversation workspace"
```

## Task 2: Add CRUD operations and race/error tests

**Files:**
- Test: `tests/chatWorkspace.test.mjs`
- Modify: `src/composables/useChatWorkspace.ts`

- [ ] **Step 1: Write failing CRUD and failure-preservation tests.**

Add tests with explicit fake API return values:

```js
test('creates, renames, pins, and deletes through the API', async () => {
  const api = createFakeApi({ pages: [{ records: [session(1, '旧标题')], total: 1, current: 1, size: 20, pages: 1 }] })
  const workspace = createChatWorkspace({ api })
  await workspace.loadSessions()

  const created = await workspace.createSession()
  await workspace.renameSession(created.id, '新标题')
  await workspace.togglePinned(created.id)
  await workspace.deleteSession(created.id)

  assert.deepEqual(api.calls.slice(2), [
    ['createSession'],
    ['updateSession', 99, { title: '新标题' }],
    ['pinSession', 99, true],
    ['deleteSession', 99],
  ])
  assert.equal(workspace.sessions.value.some(({ id }) => id === 99), false)
})

test('does not overwrite the new selection with a stale detail response', async () => {
  let releaseFirst
  const firstDetail = new Promise((resolve) => { releaseFirst = resolve })
  const api = createFakeApi({ pages: [{ records: [session(1, '一'), session(2, '二')], total: 2, current: 1, size: 20, pages: 1 }] })
  api.getSession = async (id) => id === 1 ? firstDetail : { session: session(2, '二'), messages: [] }
  const workspace = createChatWorkspace({ api })
  const loading = workspace.loadSessions()
  await new Promise((resolve) => setImmediate(resolve))
  await workspace.selectSession(2)
  releaseFirst({ session: session(1, '一'), messages: [] })
  await loading

  assert.equal(workspace.activeSessionId.value, 2)
})
```

Also test that a failed rename/pin/delete leaves the original session unchanged and that deleting the active session selects the first remaining session or sets the ID to `null`.

Run:

```sh
node --test tests/chatWorkspace.test.mjs
```

Expected: FAIL until the async CRUD methods and request sequencing exist.

- [ ] **Step 2: Implement CRUD methods against the injected API.**

Implement the following behavior in `useChatWorkspace.ts`:

- `createSession()`: call `api.createSession()`, unshift the returned object, initialize an empty message array, set active ID, and return the server object.
- `selectSession(id)`: ignore unknown IDs; set the active ID immediately and call `loadSessionDetail(id)`.
- `renameSession(id, title)`: trim and cap at 200 characters before calling `api.updateSession`; replace the matching item with the returned object; do nothing for blank titles.
- `togglePinned(id)`: call `api.pinSession(id, !session.pinned)` and replace the matching item with the returned object.
- `deleteSession(id)`: call `api.deleteSession(id)` first; remove the item and message cache only after success; if active, select the first remaining session and load its detail, or clear active/messages when none remain.

For each failed operation, catch the error, set an operation error message ref (or reuse `sessionsError`), and rethrow only if the caller needs to display it; never mutate the local item before the API succeeds.

- [ ] **Step 3: Implement latest-request protection for detail loading.**

Use a monotonically increasing `detailRequestId` outside the async function. `loadSessionDetail` captures its own request ID and returns without writing state if it is not the latest. When a detail request fails, write `sessionDetailError` only if it is still the latest request.

- [ ] **Step 4: Run focused tests and commit.**

```sh
node --test tests/chatWorkspace.test.mjs
```

Expected: all workspace tests PASS.

```sh
git add src/composables/useChatWorkspace.ts tests/chatWorkspace.test.mjs
git commit -m "feat: persist conversation sidebar operations"
```

## Task 3: Make `Sidebar` support infinite scroll and operation states

**Files:**
- Test: `tests/chatWorkspace.test.mjs` (only if a DOM harness exists; otherwise validate through type-check and browser behavior)
- Modify: `src/components/chat/Sidebar.vue`
- Modify: `src/assets/main.css`

- [ ] **Step 1: Add explicit props/events for loading and pagination.**

Extend the existing props with:

```ts
loading?: boolean
loadingMore?: boolean
hasMore?: boolean
error?: string | null
```

Extend emits with:

```ts
loadMore: []
retryLoad: []
```

Keep all existing `newChat`, `select`, `rename`, `pin`, `delete`, and `closeMobile` events unchanged.

- [ ] **Step 2: Add scroll-bottom detection without API coupling.**

Add a template ref to `.conversation-list` and a handler:

```ts
const listRef = ref<HTMLElement | null>(null)

function handleListScroll(event: Event) {
  const element = event.currentTarget as HTMLElement
  if (!props.loadingMore && props.hasMore && element.scrollHeight - element.scrollTop - element.clientHeight <= 48) {
    emit('loadMore')
  }
}
```

Attach `ref="listRef" @scroll="handleListScroll"` to the list. Do not emit repeatedly while `loadingMore` is true.

- [ ] **Step 3: Render distinct loading, error, empty, and footer states.**

Use this state order in the list:

```vue
<div v-if="loading" class="conversation-status">正在加载会话…</div>
<div v-else-if="error" class="conversation-status conversation-status--error">
  <span>{{ error }}</span>
  <button type="button" @click="emit('retryLoad')">重试</button>
</div>
<template v-else>
  <div v-if="filteredSessions.length === 0" class="conversation-empty">
    {{ query.trim() ? '没有找到匹配的会话' : '还没有会话，开始新对话吧' }}
  </div>
  <!-- existing session items -->
  <div v-if="loadingMore" class="conversation-list__footer">正在加载更多…</div>
</template>
```

Keep the session count based on the loaded server records and keep search filtering entirely local.

- [ ] **Step 4: Add minimal styles.**

Append styles matching the existing single-line CSS convention:

```css
.conversation-status { padding: 18px 10px; color: var(--text-soft); font-size: 12px; text-align: center; }
.conversation-status--error { display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--danger); }
.conversation-status button { padding: 3px 7px; border: 1px solid currentColor; border-radius: 6px; background: transparent; color: inherit; font-size: 11px; }
.conversation-list__footer { padding: 8px; color: var(--text-soft); font-size: 11px; text-align: center; }
```

- [ ] **Step 5: Run type-check to validate component props and events.**

```sh
npm run type-check
```

Expected: PASS after all parent bindings are added in Task 4; if run before Task 4, temporary missing-prop errors are expected and should be resolved in the next task rather than suppressed with `any`.

- [ ] **Step 6: Commit the sidebar state changes.**

```sh
git add src/components/chat/Sidebar.vue src/assets/main.css
git commit -m "feat: add conversation sidebar pagination states"
```

## Task 4: Wire `Chat.vue` to the real workspace and remove demo sessions

**Files:**
- Modify: `src/views/Chat.vue`
- Modify: `src/composables/useChatWorkspace.ts` only if the public return type needs a final adjustment

- [ ] **Step 1: Replace demo initialization.**

Change the workspace construction from the demo configuration to the API-backed configuration:

```ts
const workspace = createChatWorkspace()
```

Remove imports of `demoMessages`, `demoRespond`, and `demoSessions`. Keep the existing composer/message callbacks until the separate streaming implementation replaces them.

- [ ] **Step 2: Expose workspace loading/error state and invoke initial load.**

Add refs for `isLoadingSessions`, `isLoadingMoreSessions`, `hasMoreSessions`, `sessionsError`, and `isLoadingSessionDetail`; call `void workspace.loadSessions()` in `onMounted` before or alongside theme setup.

Add a retry function:

```ts
function retryLoadSessions() {
  void workspace.loadSessions()
}
```

Use the existing toast helper for operation failures, with a fallback message `操作失败，请稍后重试`.

- [ ] **Step 3: Make sidebar handlers call async workspace operations.**

Use wrappers so the template does not create unhandled promises:

```ts
function createChat() {
  void workspace.createSession().catch((error) => notify(error instanceof Error ? error.message : '创建会话失败'))
  sidebarOpen.value = false
}

function renameSession(id: number, title: string) {
  void workspace.renameSession(id, title).catch((error) => notify(error instanceof Error ? error.message : '重命名失败'))
}

function togglePinned(id: number) {
  void workspace.togglePinned(id).catch((error) => notify(error instanceof Error ? error.message : '置顶操作失败'))
}

function deleteSession(id: number) {
  void workspace.deleteSession(id).catch((error) => notify(error instanceof Error ? error.message : '删除会话失败'))
}
```

Connect `@load-more="workspace.loadMoreSessions"` and `@retry-load="retryLoadSessions"`; pass all new state props to `Sidebar`. Update the existing select handler to call the async workspace method and notify on detail errors.

- [ ] **Step 4: Add a detail loading/error presentation without inventing messages.**

While `isLoadingSessionDetail` is true, keep the current content layout and show a small loading indicator in the chat content. If `sessionDetailError` is set, show a retry action that invokes `workspace.loadSessionDetail(activeSessionId)`; do not fabricate messages or sessions.

- [ ] **Step 5: Run type-check and build.**

```sh
npm run type-check
npm run build
```

Expected: both PASS, with no references to `demoSessions` in `Chat.vue` or the sidebar data path.

- [ ] **Step 6: Commit the real API integration.**

```sh
git add src/views/Chat.vue src/composables/useChatWorkspace.ts
 git commit -m "feat: connect chat sidebar to backend sessions"
```

## Task 5: Verify end-to-end behavior and finish documentation

**Files:**
- Modify: `tests/chatWorkspace.test.mjs` if verification exposes a missing state case
- Modify: `docs/frontend-requirements.md` only if the existing requirement text needs a small implementation-status note; do not alter unrelated requirements

- [ ] **Step 1: Run all available automated checks.**

```sh
npm run type-check
npm run build
node --test tests/apiClient.test.mjs tests/chatWorkspace.test.mjs tests/sseParser.test.mjs
```

Expected: type-check, production build, and all Node tests PASS. If the repository test harness requires a `.tmp-tests` preparation command, use the existing project harness to generate it before running `node --test`; do not add a production dependency solely for tests.

- [ ] **Step 2: Manually verify authenticated API behavior against the backend.**

Start the frontend with the configured `VITE_API_BASE_URL`, sign in through the existing login page, then verify:

1. The sidebar requests `GET /api/chat/sessions?page=1&size=20` with the dynamic token header.
2. The first session detail loads after the list.
3. Scrolling the fixed conversation list near its bottom requests page 2 exactly once.
4. New chat, rename, pin/unpin, and delete produce the documented HTTP requests and update only after success.
5. Deleting the active last session shows the welcome empty state.
6. A failed request leaves the previous list intact and shows a retry/error state.

Use browser devtools/network logs rather than mock data for this check.

- [ ] **Step 3: Check the final diff and working tree.**

```sh
git diff --check
git status --short
git log -5 --oneline
```

Expected: no whitespace errors; only intended source/test changes remain; all implementation commits are present.

- [ ] **Step 4: Commit any final test-only corrections.**

```sh
git add tests/chatWorkspace.test.mjs docs/frontend-requirements.md
git commit -m "test: verify real conversation sidebar behavior"
```

Only create this final commit if Task 5 required a correction; otherwise leave the prior commits intact.
