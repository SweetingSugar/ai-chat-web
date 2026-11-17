# Chat Tool Selection Design

**Date:** 2026-11-17  
**Status:** Approved for planning

## Goal

Let a chat user manually select one or more available AI tools for a single new message, using the existing composer visual language and interaction patterns.

## Scope

- Load chat-selectable tools from `GET /api/tools/available`.
- Add a multi-select tool picker to the existing composer tool row.
- Show selected tools as removable chips above the composer input.
- Include selected `toolCodes` in new-message chat requests.
- Clear selected tools only after a message has been accepted for submission, together with the existing composer state.

The feature does not add a tool-management UI, parameter-entry UI, tool-invocation transcript, or tool selection for regeneration. It does not change the chat history data model.

## Backend Contract

The picker uses the user-facing `GET /api/tools/available` endpoint. Each item has:

```ts
interface AvailableTool {
  toolCode: string
  toolName: string
  description: string | null
  toolType: 'HTTP' | 'MCP'
  inputSchema: unknown | null
}
```

The endpoint already returns only enabled, available tools and only includes MCP tools whose server is enabled. It does not expose management configuration or credentials. The frontend submits only `toolCode` values in the existing chat request field:

```ts
interface ChatRequest {
  // existing fields
  toolCodes?: string[]
}
```

The request must contain no more than 20 codes, matching the backend validation rule. `inputSchema` is retained in the frontend response type for forward compatibility but is not rendered or used to collect parameters in this scope.

## Component Structure and Data Flow

`Chat.vue` owns the available-tools collection and its loading state, following the existing knowledge-base loading pattern. It loads the collection when the picker is opened, caches a successful result for the page lifetime, and passes it to `Composer`.

```text
Chat.vue
├── chatApi.listAvailableTools()
├── availableTools / tool-load error state
└── Composer
    ├── tool-picker trigger and popover
    ├── selected-tool chips
    └── submit { content, files, knowledgeBaseIds, toolCodes }

Composer submit
  → Chat.vue submitMessage
  → useChatWorkspace.submit
  → ChatRequest.toolCodes
  → POST /api/chat/sessions/{id}/stream
```

`Composer` owns the transient selected code list. It resets that list in its existing `clear()` method, which is called only when `workspace.submit()` reports a successful send. Failed sends leave the text, files, knowledge bases, and selected tools intact.

## Tool Picker Interaction

A new `Composer` tool-row button labelled “工具” sits alongside the existing attachment and knowledge-base controls. It opens a compact multi-select popover, reusing the existing picker spacing, borders, typography, buttons, focus treatment, and responsive behavior.

Each option displays the tool name, its `HTTP` or `MCP` type, and its description when present. Selecting and deselecting an option updates `selectedToolCodes`. The picker remains usable with an empty result set, displaying an explicit no-available-tools state instead of hiding the trigger.

When one or more tools are selected, removable chips appear in the existing pre-composer chip area. Chips use the same visual treatment and disabled behavior as knowledge-base chips. Selecting a twenty-first tool does not change the selection and emits a user-facing limit message through the existing toast pathway.

## Loading, Errors, and Accessibility

- Opening the picker requests available tools when they have not yet been loaded; subsequent opens reuse the loaded list.
- If loading fails, the picker presents an empty/error state and `Chat.vue` shows the existing toast notification. A later open may retry the request.
- The button, picker, list, selected-tool region, and removal controls have meaningful accessible labels.
- Tool selection and removal are disabled while a message is being submitted or generated, consistent with existing composer controls.
- The new UI must preserve the current desktop and mobile Composer layout, including its safe-area behavior.

## Verification

1. Mock or run `GET /api/tools/available`; confirm the picker shows each returned name, type, and description without exposing `inputSchema`.
2. Select, deselect, and remove tools; confirm the chip list and picker state remain synchronized.
3. Verify the twenty-tool limit prevents an additional selection and shows the existing toast feedback.
4. Send a message and confirm the streaming request contains the selected `toolCodes`.
5. Confirm tools clear after a successful send and remain selected when sending fails.
6. Confirm tool controls are disabled during upload and generation.
7. Confirm empty, loading, and failed tool-list states are usable on desktop and mobile widths.
8. Run the frontend type check and production build.
