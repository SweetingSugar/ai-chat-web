# Chat Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Vue starter page with a responsive ChatGPT-style chat workspace connected to the existing backend contract.

**Architecture:** Keep the UI in focused Vue components, centralize chat/session state in a lightweight composable/store module, and isolate SSE parsing from rendering. The first version uses a small demo fallback when the backend is unavailable, while the API client remains ready for real authentication and chat endpoints.

**Tech Stack:** Vue 3, TypeScript, Vite, CSS variables, browser Fetch/ReadableStream APIs, Node built-in test runner for the pure SSE parser.

**Spec:** `docs/frontend-requirements.md`

## Global Constraints

- Focus only on ordinary-user chat; do not build admin pages.
- Use POST + `fetch` + `ReadableStream` for chat SSE; do not use native `EventSource`.
- Preserve backend enum names and response field names in the API layer.
- Make desktop and mobile chat usable without horizontal page scrolling.
- Do not expose an admin model endpoint to ordinary users.

## Review Focus

- SSE events split across network chunks must be parsed only after a complete event boundary; covered by parser tests.
- A failed or aborted generation must restore an interactive composer; covered by chat state tests and manual build verification.
- Empty sessions and deleted current sessions must render a recoverable empty state; covered by session state tests.
- Token header names are dynamic from login response; covered by API client tests.
- The UI must remain usable when the backend is unavailable; covered by the demo fallback and build verification.

### Task 1: Chat contracts and SSE parser

**Files:**
- Create: `src/types/chat.ts`
- Create: `src/api/client.ts`
- Create: `src/api/chat.ts`
- Create: `src/lib/sseParser.ts`
- Test: `tests/sseParser.test.ts`

- [ ] Write failing parser tests for split chunks, multiple events, complete events, and malformed data.
- [ ] Run the parser test through a temporary TypeScript compile and Node built-in test runner; confirm it fails because the parser is absent.
- [ ] Implement the minimal parser and API contracts.
- [ ] Run the parser test again and confirm it passes.

### Task 2: Chat state and demo fallback

**Files:**
- Create: `src/composables/useChatWorkspace.ts`
- Create: `src/data/demoChat.ts`
- Test: `tests/chatWorkspace.test.ts`

- [ ] Write failing tests for creating a session, selecting a session, appending a user message, and recovering from a failed generation.
- [ ] Implement the workspace state and demo fallback while keeping real API methods injectable.
- [ ] Run the focused state tests and then the parser/state suite.

### Task 3: Chat workspace UI

**Files:**
- Modify: `src/App.vue`
- Modify: `src/assets/main.css`
- Modify: `src/assets/base.css`
- Create: `src/components/chat/Sidebar.vue`
- Create: `src/components/chat/ChatHeader.vue`
- Create: `src/components/chat/MessageList.vue`
- Create: `src/components/chat/Composer.vue`
- Create: `src/components/chat/EmptyState.vue`
- Create: `src/components/chat/SettingsDrawer.vue`

- [ ] Implement the shell, sidebar, header, empty state, message list, composer, and settings drawer from the approved specification.
- [ ] Connect UI events to workspace state: new chat, selection, rename, pin, delete, send, stop, retry, regenerate, copy, and theme.
- [ ] Run type-check and production build.

### Task 4: Responsive and interaction polish

**Files:**
- Modify: `src/App.vue`
- Modify: `src/assets/main.css`
- Modify: `src/assets/base.css`

- [ ] Add mobile sidebar drawer, scroll-to-bottom behavior, focus states, reduced-motion behavior, and safe-area padding.
- [ ] Verify no admin routes or admin UI are included.
- [ ] Run the complete available test suite, type-check, and production build.

