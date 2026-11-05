# Knowledge Document Preview Design

**Date:** 2026-11-05  
**Status:** Approved for planning

## Goal

Add a non-destructive **查看** action to each knowledge-base document row. It opens a modal in the current page so users can inspect text documents and preview uploaded files without leaving the knowledge-base detail page.

The feature must preserve the current visual language and reuse the existing authenticated backend APIs. It does not change document indexing, storage, or parsing behavior.

## Scope

- Add a view icon button to every document row.
- Preview `TEXT` documents as scrollable, newline-preserving text in a modal.
- Preview `FILE` documents from a short-lived presigned URL in an iframe.
- Provide a safe new-tab fallback link for files that a browser cannot render inline.
- Display loading, error, retry, and invalid-file states inside the modal.
- Keep preview state independent from existing document list loading and mutation state.

Out of scope:

- Editing document content from the preview.
- Extending the backend to parse or extract file text.
- Downloading, caching, or persisting presigned URLs in the frontend.

## Selected Architecture

### Component boundaries

- `KnowledgeBaseDetail.vue` renders the view control beside retry/delete controls and emits `preview` with the selected `KnowledgeDocument`.
- `KnowledgeBases.vue` owns the selected preview document and the dialog open state. It coordinates user-triggered preview and renders the dialog beside the existing form dialogs.
- `DocumentPreviewDialog.vue` is a new presentation component. It receives dialog state and preview data, renders content according to its kind, and emits close/retry events. It does not make API calls.
- `useKnowledgeBaseWorkspace.ts` owns preview loading, errors, and stale-response protection. It exposes an explicit preview method plus a reset method, separate from document-list and mutation state.
- `knowledgeApi` encapsulates the two backend calls. The shared API client continues to provide authentication and standard response/error behavior.

This keeps list interactions, page state, network access, and rendering independently understandable and testable.

## API and Types

Add two API methods and their response types:

- `GET /api/knowledge-bases/:baseId/documents/:documentId/content` returns `{ documentId, title, content }` for `TEXT` documents.
- `GET /api/files/:fileId/presigned-url` returns `{ fileId, url, expiresIn }` for accessible uploaded files.

Add frontend types for document text content, file download URL, and a discriminated preview payload. A text payload contains the resolved title and content; a file payload contains the resolved title and presigned URL. A file document without `fileId` is rejected locally with a clear error rather than generating an invalid request.

## Interaction and Data Flow

1. A user selects the view control for a document row.
2. The detail view emits the document; the page opens the modal and asks the workspace to load its preview.
3. The workspace branches by `sourceType`:
   - For `TEXT`, request the document-content endpoint and populate a text preview.
   - For `FILE`, validate `fileId`, request its presigned URL, and populate a file preview.
4. While loading, the modal shows `正在加载预览…`; the triggering button is disabled to prevent duplicate requests.
5. On success:
   - Text is rendered as selectable, scrollable plain text with whitespace preserved.
   - Files are rendered in an iframe using the presigned URL. The modal also offers `在新标签页打开` using `target="_blank"` and `rel="noopener noreferrer"`.
6. On request failure, the modal displays the returned error and a retry action. The document list remains usable.
7. Closing the modal clears preview data and errors. Each request is associated with its target document so a late response from a closed or superseded preview cannot overwrite the current selection.

## Visual, Accessibility, and Responsive Behavior

- Reuse the existing `auth-modal-overlay`, modal header, icon-button, and theme CSS variables.
- Use a wider preview-specific modal while keeping it within the viewport and preserving mobile safe-area spacing.
- Give the trigger button `aria-label="查看文档"`; give the modal a contextual accessible label such as `预览：{title}`.
- Retain close controls: header close button, overlay click, and the existing form-dialog conventions.
- Constrain text and iframe bodies to a scrollable area so long content does not cause the modal to exceed the viewport.
- Do not render raw text as HTML.

## Error Handling

- Keep errors scoped to the preview modal; do not surface them as page-wide failures.
- Provide retry for API failures.
- Explain when a file has no associated `fileId`.
- If a browser cannot embed a file format, the external open link lets the browser or configured file handler handle it.
- Presigned URLs are generated only when requested and discarded when preview state resets.

## Verification

1. Add focused tests for the two API request paths and response mappings.
2. Test the workspace’s `TEXT` and `FILE` branches, loading/success/error state, missing `fileId`, retry, and stale-result isolation.
3. Test the detail row’s preview event and disabled state during a preview load.
4. Test the dialog’s text rendering, file iframe, external-link hardening, retry control, and close behavior.
5. Run all existing tests, `npm run type-check`, and `npm run build`.
6. Manually verify text and file preview on desktop and mobile, including a browser-unsupported file format and a failed presigned-URL request.
