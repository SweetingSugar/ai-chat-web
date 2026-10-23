# Real Streaming Chat Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the local simulated assistant response with the authenticated backend SSE chat stream, including incremental rendering, stop, failure recovery, regeneration, and server-authoritative synchronization.

**Architecture:** Keep `Chat.vue → Composer → useChatWorkspace → chatApi` as the existing dependency flow. `chatApi` owns POST/SSE transport and `readChatStream` owns SSE frame decoding; `useChatWorkspace` owns optimistic message state, AbortController lifecycle, stream event mapping, and detail refresh. Use the existing wide chat workspace without adding Pinia or a new model-list endpoint.

**Tech Stack:** Vue 3 Composition API, TypeScript, Fetch `ReadableStream`, existing `SseParser`, Node built-in test runner, Vite/Vue TSC.

---

## File map

- Modify `src/types/chat.ts`: add the optional client-side usage field to `ChatMessage` and keep stream request/event types aligned with the backend contract.
- Modify `src/api/chat.ts`: expose a typed stream event reader that ignores empty events, converts malformed JSON into a useful error, and preserves the existing API surface.
- Modify `src/composables/useChatWorkspace.ts`: replace simulated `respond` generation with real `stream`/`regenerate` calls, request IDs, server synchronization, and correct generation state.
- Modify `src/views/Chat.vue`: pass the active session model to the header, handle model display without calling the unavailable public model endpoint, and surface send/sync errors.
- Modify `src/components/chat/MessageList.vue`: display the actual model code/name when available and keep failed/interrupted/streaming actions consistent.
- Modify `tests/apiClient.test.mjs`: add stream response and non-2xx error tests.
- Modify `tests/sseParser.test.mjs`: add empty data and invalid-event coverage where needed.
- Modify `tests/chatWorkspace.test.mjs`: replace local `respond` assertions with fake stream events and add complete, failed, abort, regeneration, and server-sync cases.

The existing `vite.config.ts` proxy already forwards `/api` to `http://localhost:8080`; no proxy change is required.

## Task 1: Harden typed stream consumption

**Files:**
- Modify: `src/types/chat.ts`
- Modify: `src/api/chat.ts`
- Test: `tests/apiClient.test.mjs`
- Test: `tests/sseParser.test.mjs`

- [ ] **Step 1: Add a stream-reader test for multiple backend events.**

Use a `Response` whose body is a `ReadableStream` with two chunks containing a `start`, two `delta` events, and a `complete` event. Assert that `readChatStream` emits four parsed objects in order and preserves the concatenated delta text:

```js
const events = []
await readChatStream(response, (event) => events.push(event))
assert.deepEqual(events.map(({ type }) => type), ['START', 'DELTA', 'DELTA', 'COMPLETE'])
assert.equal(events.filter(({ type }) => type === 'DELTA').map(({ delta }) => delta).join(''), '你好')
```

The test fixture must encode each SSE event as `event: <lowercase>\ndata: <JSON>\n\n`, split at a position inside one JSON payload, and close the stream after the final event.

- [ ] **Step 2: Add tests for empty and malformed data.**

Assert that an SSE comment and an event with no `data` do not invoke the callback. Assert that malformed JSON causes `readChatStream` to reject with an `Error` whose message identifies an invalid stream event rather than exposing an uncaught `SyntaxError`:

```js
await assert.rejects(
  () => readChatStream(responseWith('event: delta\ndata: {bad}\n\n'), () => {}),
  /无法解析|invalid stream event/i,
)
```

- [ ] **Step 3: Extend `ChatMessage` with optional usage metadata.**

Add this property without changing the backend wire shape:

```ts
usage?: ChatStreamEvent['usage']
```

Keep `ChatStreamEventType` limited to `START | DELTA | COMPLETE | FAILED`; `INTERRUPTED` is a persisted message status, not an SSE event emitted by this backend.

- [ ] **Step 4: Make `readChatStream` validate each event explicitly.**

In `src/api/chat.ts`, parse each non-empty `event.data` in a `try/catch`, verify it is an object with a string `type`, and throw `new Error('无法解析流式事件')` for invalid JSON or an invalid payload. Keep the current reader loop and call `parser.finish()` after `done` so a final event without a blank line is delivered.

- [ ] **Step 5: Run focused tests and commit.**

Run the repository's TypeScript test preparation command if required to create `.tmp-tests`, then run:

```bash
node --test tests/apiClient.test.mjs tests/sseParser.test.mjs
```

Expected: all API client and parser tests pass. Commit:

```bash
git add src/types/chat.ts src/api/chat.ts tests/apiClient.test.mjs tests/sseParser.test.mjs
git commit -m "feat: harden chat stream parsing"
```

## Task 2: Replace simulated generation with backend streaming

**Files:**
- Modify: `src/composables/useChatWorkspace.ts`
- Test: `tests/chatWorkspace.test.mjs`

- [ ] **Step 1: Define a fake stream-capable API in the workspace tests.**

Extend the workspace API contract with the two transport methods and one reader method. Add this exact interface shape in `useChatWorkspace.ts`:

```ts
type ChatTransportApi = Pick<typeof chatApi, 'stream' | 'regenerate'> & {
  readStream: typeof readChatStream
}
export type ChatWorkspaceApi = Pick<typeof chatApi, 'listSessions' | 'createSession' | 'getSession' | 'updateSession' | 'pinSession' | 'deleteSession'> & ChatTransportApi
```

Add `readStream: readChatStream` to the production `chatApi` object. In tests, fake `stream` and `regenerate` return a `Response` whose body contains the fixture SSE text, and fake `readStream` calls the callback once per fixture event. Each method records its arguments:

```js
stream: async (id, payload, signal) => {
  calls.push(['stream', id, payload])
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
  return new Response(null, { headers: { 'Content-Type': 'text/event-stream' } })
},
regenerate: async (id, payload) => {
  calls.push(['regenerate', id, payload])
  return new Response(null, { headers: { 'Content-Type': 'text/event-stream' } })
},
readStream: async (response, onEvent) => {
  assert.equal(response.headers.get('Content-Type'), 'text/event-stream')
  const events = calls.at(-1)[0] === 'regenerate' ? regenerateEvents : streamEvents
  for (const event of events) onEvent(event)
},
```

Production generation must call `const response = await api.stream(...)` followed by `await api.readStream(response, onStreamEvent)`, so tests cover the same response/reader boundary without importing browser transport into the Node test fake.

- [ ] **Step 2: Write a failing complete-stream test.**

Use a session with `defaultModelId: 3`, submit `你好`, emit `START`, two `DELTA` events (`你` and `好`), and `COMPLETE`. Assert:

```js
assert.equal(messages[0].content, '你好')
assert.equal(messages[1].content, '你好')
assert.equal(messages[1].status, 'COMPLETED')
assert.equal(messages[1].generationTaskId, 50)
assert.equal(messages[1].usage.totalTokens, 12)
assert.equal(workspace.isGenerating.value, false)
assert.equal(calls[0][0], 'stream')
assert.equal(calls[0][1], 1)
assert.equal(calls[0][2].content, '你好')
assert.equal(calls[0][2].modelId, 3)
assert.match(calls[0][2].requestId, /^[0-9a-f-]{36}$/)
```

- [ ] **Step 3: Implement request construction and optimistic messages.**

In `submit`, trim and reject empty input, create a session first if `activeSessionId` is null, append the user message and an empty assistant message, and call a helper with:

```ts
const request: ChatRequest = {
  content,
  modelId: session.defaultModelId || undefined,
  requestId: crypto.randomUUID(),
}
```

Import `ChatRequest` and the stream event type, and use the injected `api.stream`, `api.regenerate`, and `api.readStream` methods for all generation paths. Do not retain the old `respond` option. Set the generation session ID and a fresh `AbortController` before starting the request.

- [ ] **Step 4: Implement event mapping in one helper.**

Add a helper such as `handleStreamEvent(sessionId, assistant, event)` with these exact branches:

```ts
if (event.type === 'START') {
  assistant.generationTaskId = event.taskId
  assistant.id = event.assistantMessageId ?? assistant.id
  assistant.modelId = event.modelId
  assistant.status = 'STREAMING'
} else if (event.type === 'DELTA') {
  assistant.content += event.delta ?? ''
  assistant.status = 'STREAMING'
} else if (event.type === 'COMPLETE') {
  assistant.status = 'COMPLETED'
  assistant.usage = event.usage ?? undefined
} else if (event.type === 'FAILED') {
  assistant.status = 'FAILED'
  assistant.errorCode = event.errorCode
  assistant.errorMessage = event.message || '生成失败，请稍后重试'
}
assistant.requestId = event.requestId || assistant.requestId
assistant.updateTime = now()
```

Use the event's `assistantMessageId` only for correlation; the final detail refresh replaces all temporary objects with server objects.

- [ ] **Step 5: Add server-authoritative synchronization.**

After a stream resolves, rejects, or is aborted, call `loadSessionDetail(sessionId)` in a `finally`-style synchronization path. Do not overwrite a `FAILED` message with a generic error before the refresh has had a chance to return the persisted message. If the refresh itself fails after a transport error, retain the received content/status and set an error only when no more specific message exists.

- [ ] **Step 6: Add failing tests for failure, abort, and empty-session send.**

Add tests asserting:

1. `FAILED` sets `status === 'FAILED'`, copies `errorCode` and `message`, and leaves `isGenerating === false`.
2. An `AbortError` calls the fake `getSession` and leaves the final server-provided `INTERRUPTED` message.
3. With no initial sessions, `submit('你好')` calls `createSession`, then `stream` using the returned ID.
4. A second `submit` while the first stream is unresolved does not call `stream` twice.

- [ ] **Step 7: Implement abort and regeneration.**

`stopGeneration` calls the active controller's `abort()`. `retry` finds the assistant message and its preceding user message, then starts a new stream via `/stream` only for a failed local submission if no persisted assistant ID exists. `regenerate` sends:

```ts
{
  messageId: assistant.id,
  modelId: activeSession.defaultModelId || undefined,
  requestId: crypto.randomUUID(),
}
```

through `/regenerate`, retaining the existing assistant message until the final detail refresh. Both operations must return immediately when the workspace is already generating.

- [ ] **Step 8: Run workspace tests and commit.**

Run:

```bash
node --test tests/chatWorkspace.test.mjs
```

Expected: all existing session tests and the new stream tests pass. Commit:

```bash
git add src/composables/useChatWorkspace.ts tests/chatWorkspace.test.mjs
git commit -m "feat: connect workspace to streaming chat API"
```

## Task 3: Wire the real state into the wide chat UI

**Files:**
- Modify: `src/views/Chat.vue`
- Modify: `src/components/chat/MessageList.vue`

- [ ] **Step 1: Write the UI-facing model and error behavior before editing.**

Use the active session's `defaultModelId` as the model ID passed to `ChatHeader`. Keep the existing visual fallback label (`ice 2.1`) when the backend has no public model metadata. Remove the `@model-change` notification that implies a model list will become available automatically; either disable the single-option selector or show the stable fallback without issuing a nonexistent `/api/ai/models` request.

- [ ] **Step 2: Update `Chat.vue` to use workspace model/session state.**

Replace the hardcoded `activeModel` ref with a computed model derived from `workspace.activeSession.value?.defaultModelId`, while retaining the existing `ModelSummary` fallback for the header. Route submit errors through `notify`, and ensure `workspace.submit` is passed as a function that catches rejected promises so an HTTP error does not become an unhandled event-handler rejection:

```ts
async function submitMessage(content: string) {
  try {
    await workspace.submit(content)
  } catch (error) {
    notify(error instanceof Error ? error.message : '发送失败，请重试')
  }
}
```

Bind `@submit="submitMessage"` and keep stop as a synchronous action.

- [ ] **Step 3: Update `MessageList.vue` for actual stream metadata.**

Use `message.modelId` only to decide whether to show model metadata; do not hardcode a different model ID. Keep the existing paragraph rendering, typing cursor, failed retry, copy, and regenerate controls. Hide retry/regenerate controls while `generating` is true, and ensure failed/interrupted messages do not render an empty action row.

- [ ] **Step 4: Verify wide-layout behavior and commit.**

Run:

```bash
npm run type-check
npm run build
```

Expected: both commands pass with no Vue template or TypeScript errors. Commit:

```bash
git add src/views/Chat.vue src/components/chat/MessageList.vue
git commit -m "feat: show real streaming state in chat UI"
```

## Task 4: End-to-end verification and documentation alignment

**Files:**
- Modify: `docs/frontend-requirements.md` only if implementation behavior differs from the approved design.
- Modify: `README.md` only if the project lacks a documented local verification command.

- [ ] **Step 1: Run all automated checks.**

Prepare `.tmp-tests` using the existing project harness, then run:

```bash
node --test tests/apiClient.test.mjs tests/chatWorkspace.test.mjs tests/sseParser.test.mjs
npm run type-check
npm run build
```

Expected: all tests pass, Vue type-check passes, and Vite produces a production build.

- [ ] **Step 2: Start the frontend against the running backend.**

Run:

```bash
npm run dev -- --host localhost
```

Use an existing backend account to verify the following manually in the browser:

1. Existing sessions load from `/api/chat/sessions`.
2. A new session can be created.
3. Sending a question produces a POST request with the dynamic token header and a UUID request ID.
4. The assistant text appears incrementally as `delta` events arrive.
5. The send button becomes stop, and stopping refreshes the persisted status.
6. A provider failure shows the server message and exposes retry/regenerate.
7. Refreshing the page restores the session and completed messages from the backend.

- [ ] **Step 3: Diagnose real-backend failures without masking them.**

If the browser receives `AI_PROVIDER_ERROR`, `CHAT_GENERATION_IN_PROGRESS`, or a model-related failure, record the HTTP/SSE code and message separately from frontend behavior. Do not replace a provider configuration failure with a mock response. If CORS appears, use the existing Vite `/api` proxy rather than adding a permissive production CORS workaround.

- [ ] **Step 4: Review the final diff and commit verification changes.**

Run:

```bash
git diff --check
 git status --short
```

Confirm `.superpowers/` preview artifacts remain uncommitted. If only documentation changed during verification, commit it with:

```bash
git add README.md docs/frontend-requirements.md
git commit -m "docs: document streaming chat verification"
```

Otherwise leave the working tree with only intentional implementation changes and report the exact automated and manual verification results.
