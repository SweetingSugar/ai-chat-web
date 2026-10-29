# Composer Attachment Preview Design

**Date:** 2026-10-29  
**Status:** Approved for planning

## Goal

Display pending chat attachments above the message input instead of inside it, so the text-entry surface contains only the textarea and its controls.

## Scope

- Move the existing pending-attachment list out of the composer input container.
- Show the list only when one or more files are selected.
- Preserve the current file-selection, validation, removal, upload, and submit behavior.
- Preserve responsive behavior on desktop and mobile.

No API, upload-flow, data-model, or attachment-validation changes are included.

## Selected Approach

Use a conditional, standalone attachment preview area directly above the composer. It will share the composer's outer width through the existing `composer-wrap` container but will not inherit the composer's border, background, rounded input surface, or focus state.

This is preferred over an overlay because it does not obscure chat content and over placing the list in the message area because it keeps pending-file actions visually associated with the composer.

## Component Structure

`Composer.vue` will retain a single `composer-wrap` root:

```text
composer-wrap
├── composer__attachments (conditional)
│   └── attachment-chip × N
└── composer
    ├── textarea
    └── composer__bottom
        ├── attachment trigger
        └── submit controls
```

The hidden file input remains in the composer component and continues to be triggered by the existing attachment button.

## Styling and Responsive Behavior

- The attachment area appears only when `files.length > 0`.
- It spans the same available width as the composer, with an approximately `8px` vertical gap before the input surface.
- Existing attachment-chip visuals—file icon, truncated name, size, and remove button—remain intact.
- The attachment list retains its bounded height and internal vertical scrolling to prevent many selected files from displacing the input surface excessively.
- Mobile continues to use a reduced maximum list height and the existing safe-area-aware composer spacing.
- Composer focus styles apply only to the input surface, not the separate attachment area.

## Error Handling and Accessibility

- Existing disabled states during submission or generation continue to disable attachment removal and file selection.
- Existing accessible labels for the attachment list, remove buttons, and file picker remain unchanged.
- Since the change is structural and presentational, existing validation messages and upload failure behavior are unchanged.

## Verification

1. Add one or more supported files and confirm their cards render above, rather than inside, the input surface.
2. Remove all files and confirm the preview area collapses without leaving space.
3. Confirm the textarea, attachment picker, keyboard sending behavior, and submit controls continue to work.
4. Confirm the list scrolls internally for many files and remains usable at mobile widths.
5. Run the existing attachment and project build checks.
