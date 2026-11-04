# Knowledge Base Management Design

**Date:** 2026-11-04  
**Status:** Approved for planning

## Goal

Add a user-facing knowledge-base workspace to the chat application. Users can manage knowledge bases and their documents, select up to ten knowledge bases when sending a chat message, and inspect the retrieved sources beneath an assistant response.

The feature must use the existing chat application's visual language, navigation patterns, responsive behavior, authenticated API client, and feedback states.

## Scope

- Add a first-level knowledge-base navigation entry to the existing sidebar.
- Add a knowledge-base list page and a detail page.
- Support all existing knowledge-base management operations:
  - create, edit, delete, and paginate knowledge bases;
  - select or change an embedding model;
  - list, upload, create text, delete, and retry documents.
- Allow the composer to select up to ten knowledge bases per submitted message.
- Send selected knowledge-base IDs with chat requests.
- Render the sources returned by chat history and stream-complete events.

The feature does not change the backend's retrieval, indexing, or model-management behavior.

## Selected Architecture

Use a shared application shell with independent authenticated routes:

- `/chat` continues to render the chat workspace.
- `/knowledge-bases` renders the knowledge-base list.
- `/knowledge-bases/:id` renders one knowledge base and its documents.

The sidebar becomes a reusable navigation component shared by both workspaces. It retains the current brand lockup, account area, mobile drawer behavior, and visual styles. A book-style knowledge-base entry appears below the new-chat button, highlights for either knowledge-base route, and closes the mobile drawer after navigation.

This approach is preferred over conditional rendering inside `Chat.vue` because it provides direct URLs and predictable back/forward navigation while avoiding a duplicate application shell.

## Knowledge-base Pages

### List page

The list page contains a page title, a search field, and a primary create button. It displays knowledge bases as cards using existing panel, border, typography, and button styles.

Each card shows:

- name and description;
- creation or update information;
- knowledge-base and reindexing state;
- configured embedding model state where available.

The page supports loading, empty, error, retry, and paginated-load states. The backend does not supply a document count in `KnowledgeBaseVO`, so the interface must not fabricate one.

### Detail page

The detail page has a back action, name, state indicator, and action menu. Its main area contains a document-management section; its settings area allows name/description editing, embedding-model changes, and knowledge-base deletion.

Document management provides:

- a file picker that posts multipart data directly to the knowledge-base file endpoint;
- an add-text action that opens a title/content form;
- paginated document rows showing title, source type, processing state, chunk count when available, and failure information;
- deletion for all documents;
- retry only for failed documents.

Destructive deletion and embedding-model changes require explicit confirmation. Editing forms validate the backend's limits before submission: a knowledge-base name is required and at most 100 characters, its description is at most 1000 characters, text-document titles are required and at most 255 characters, and text-document content is required and at most 1,000,000 characters.

## API and Types

Add a `knowledgeApi` module built on the existing `apiRequest` client. It calls:

- `GET`, `POST` `/api/knowledge-bases`;
- `GET`, `PUT`, `DELETE` `/api/knowledge-bases/:id`;
- `PUT` `/api/knowledge-bases/:id/embedding-model`;
- `GET` `/api/knowledge-bases/:id/documents`;
- `POST` `/api/knowledge-bases/:id/documents/text`;
- multipart `POST` `/api/knowledge-bases/:id/documents/file`;
- `DELETE` `/api/knowledge-bases/:id/documents/:documentId`;
- `POST` `/api/knowledge-bases/:id/documents/:documentId/retry`;
- `GET` `/api/chat/models/embedding`.

Add TypeScript types for knowledge bases, documents, embedding models, document and knowledge-base states, and retrieved knowledge sources. Reuse the existing `PageResult` type.

## Chat Retrieval Interaction

The composer adds a knowledge-base tool beside the existing attachment tool. Opening it loads the user's knowledge bases and presents a searchable multiselect popover. Users can select at most ten bases; selected bases are visible as removable labels before sending.

The chat request type and streaming payload add `knowledgeBaseIds`. The current selection is supplied on a new request; regeneration continues to rely on the backend's message-bound knowledge-base selection rather than asking the user to select again.

`ChatMessage` and stream-event types add `sources`. On an assistant message with sources, render a collapsed `参考来源（N）` disclosure beneath the response. Expanding it reveals each source's document title, content excerpt, relevance score, and rank. This applies both to messages loaded from history and to streaming completion events.

## Error Handling and Accessibility

- Keep unsent composer text, files, and selected knowledge bases after a failed send.
- Surface server errors through the existing toast pattern, while retaining inline error and retry states for page-level loads.
- Disable conflicting actions while their request is in flight.
- Use descriptive labels for knowledge-base navigation, upload inputs, selection controls, action menus, and source disclosures.
- Keep confirmation dialogs for irreversible deletion actions.
- Preserve the current responsive sidebar and safe-area-aware mobile layout.

## Verification

1. Add focused executable coverage for request construction, source/status mapping, and the ten-knowledge-base selection limit where the project test setup supports it.
2. Run `npm run type-check` and `npm run build`.
3. Manually verify authenticated routing, desktop and mobile sidebar navigation, full knowledge-base CRUD, embedding-model changes, text and file document workflows, document retry/delete states, and pagination.
4. Verify a chat can select knowledge bases, sends their IDs, preserves selection after a failed request, and displays sources for both streamed and historical assistant messages.
