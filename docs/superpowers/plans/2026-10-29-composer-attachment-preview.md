# Composer Attachment Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move pending attachment cards above the chat text input while preserving all existing attachment behavior and responsive constraints.

**Architecture:** Keep the attachment state and all event handlers in `Composer.vue`; only reorder the conditional attachment-list markup so it becomes a sibling before the existing input surface. Update the existing stylesheet so this sibling has an explicit gap below it, while retaining the bounded, internally scrollable list and the smaller mobile height.

**Tech Stack:** Vue 3 Composition API, TypeScript, scoped component template conventions, global CSS, Vite, Vue TSC.

---

## File Structure

- `src/components/chat/Composer.vue`: owns the selected-file state and renders the attachment list above the `.composer` input surface.
- `src/assets/main.css`: defines composer layout, attachment-list spacing, card presentation, and the mobile height override.
- No test file changes: the repository has Node tests for pure attachment selection and workspace upload behavior, but no Vue DOM/component-test harness. This is a DOM placement-only change with no state or behavior change; validate it with Vue type-checking, production build, and browser inspection.

### Task 1: Reposition the attachment preview markup

**Files:**
- Modify: `src/components/chat/Composer.vue:67-92`
- Test: production type-check and browser DOM inspection

- [ ] **Step 1: Establish the failing visual condition.**

Run the application using the project run workflow or `npm run dev`, choose a JPEG, PNG, GIF, or PDF attachment, and inspect the rendered composer. Before the change, `.composer__attachments` must be a descendant of `.composer`, between the hidden file input and `.composer__bottom`; therefore the attachment card appears within the rounded input surface.

- [ ] **Step 2: Move the existing conditional list before the input surface.**

In `src/components/chat/Composer.vue`, replace the template root with the following exact structure. Preserve the list's `v-if`, keys, labels, icons, formatting, disabled state, and removal callback unchanged:

```vue
<div class="composer-wrap">
  <div v-if="files.length" class="composer__attachments" aria-label="待发送附件">
    <div v-for="(file, index) in files" :key="`${file.name}-${file.size}-${index}`" class="attachment-chip">
      <AppIcon :name="file.type === 'application/pdf' ? 'file' : 'image'" size="16" />
      <span class="attachment-chip__details"><strong>{{ file.name }}</strong><small>{{ formatFileSize(file.size) }}</small></span>
      <button type="button" :disabled="generating || submitting" :aria-label="`移除附件 ${file.name}`" @click="removeFile(index)"><AppIcon name="close" size="14" /></button>
    </div>
  </div>
  <div class="composer">
    <textarea ref="inputRef" v-model="value" rows="1" placeholder="输入你的问题…" aria-label="输入消息" :disabled="generating || submitting" @input="resize" @keydown="handleKeydown"></textarea>
    <input ref="fileInputRef" class="composer__file-input" type="file" accept="image/jpeg,image/png,image/gif,application/pdf" multiple :disabled="generating || submitting" @change="addFiles">
    <div class="composer__bottom">
      <div class="composer__tools">
        <button type="button" class="composer-tool" :disabled="generating || submitting" aria-label="添加附件" @click="chooseFiles"><AppIcon name="paperclip" size="16" /><span>添加</span></button>
      </div>
      <div class="composer__actions">
        <span class="composer__hint">Shift + Enter 换行</span>
        <button v-if="generating" class="send-button send-button--stop" aria-label="停止生成" @click="emit('stop')"><AppIcon name="stop" size="17" /></button>
        <button v-else class="send-button" :aria-label="submitting ? '正在上传附件' : '发送消息'" :disabled="!canSubmit || submitting" @click="submit">
          <span v-if="submitting">…</span>
          <AppIcon v-else name="send" size="17" />
        </button>
      </div>
    </div>
  </div>
  <p class="composer-disclaimer">ice 可能会出错，请核对重要信息。</p>
</div>
```

- [ ] **Step 3: Type-check the moved markup.**

Run:

```bash
npm run type-check
```

Expected: Vue TSC exits with code `0` and reports no template/type errors.

- [ ] **Step 4: Inspect the behavior in the browser.**

With one or more selected files, verify `.composer-wrap` children appear in this order: `.composer__attachments`, `.composer`, `.composer-disclaimer`. Remove the final file and verify Vue removes the attachment-list element entirely, leaving no empty preview-region space. Confirm the attachment picker, remove button, textarea, Enter send behavior, and Shift+Enter newline behavior still work.

- [ ] **Step 5: Commit the structural change.**

```bash
git add src/components/chat/Composer.vue
git commit -m "fix: show attachments above composer"
```

### Task 2: Preserve preview spacing and responsive scrolling

**Files:**
- Modify: `src/assets/main.css:123-141`
- Test: production build and desktop/mobile browser inspection

- [ ] **Step 1: Establish the failing spacing condition.**

After Task 1 but before the CSS update, inspect the selected-file UI at desktop width. The attachment list has `margin-top: 8px`, which was designed for its previous location inside `.composer`; after becoming the first element in `.composer-wrap`, that margin creates no intentional gap between the list and following input surface.

- [ ] **Step 2: Give the external preview area a bottom gap.**

In `src/assets/main.css`, replace the existing `.composer__attachments` rule:

```css
.composer__attachments { display: flex; max-height: 132px; margin-top: 8px; flex-direction: column; gap: 6px; overflow-y: auto; }
```

with:

```css
.composer__attachments { display: flex; max-height: 132px; margin-bottom: 8px; flex-direction: column; gap: 6px; overflow-y: auto; }
```

Do not change the `.attachment-chip` rules, the `.composer` border/focus styles, or the existing mobile rule `.composer__attachments { max-height: 112px; }`.

- [ ] **Step 3: Build the production bundle.**

Run:

```bash
npm run build
```

Expected: both `vue-tsc --build` and `vite build` exit with code `0`.

- [ ] **Step 4: Verify visual and responsive acceptance criteria.**

At a desktop viewport, select multiple files and confirm the cards are outside the rounded, focused `.composer` surface; the same-width list ends roughly `8px` above it. Select enough valid files to exceed the available list height and confirm it scrolls internally. At a viewport at or below `760px`, confirm the list remains above the input, its maximum height is `112px`, the controls remain reachable, and no horizontal page overflow occurs.

- [ ] **Step 5: Commit the style change.**

```bash
git add src/assets/main.css
git commit -m "style: separate composer attachment preview"
```

### Task 3: Run regression checks

**Files:**
- Modify: none unless verification uncovers a defect
- Test: `tests/chatAttachments.test.mjs`, `tests/apiClient.test.mjs`, `tests/chatWorkspace.test.mjs`, `tests/sseParser.test.mjs`

- [ ] **Step 1: Refresh the TypeScript modules consumed by the Node tests.**

Run:

```bash
rm -rf .tmp-tests && npx tsc --ignoreConfig --outDir .tmp-tests --rootDir . --module NodeNext --moduleResolution NodeNext --target ES2022 --skipLibCheck src/api/client.ts src/api/chat.ts src/composables/useChatWorkspace.ts src/lib/chatAttachments.ts src/lib/sseParser.ts src/types/chat.ts
```

Expected: TypeScript exits with code `0` and emits the imported modules beneath `.tmp-tests/src/`. Do not commit `.tmp-tests`; it is generated test output.

- [ ] **Step 2: Run the complete current Node regression suite.**

Run:

```bash
node --test tests/apiClient.test.mjs tests/chatAttachments.test.mjs tests/chatWorkspace.test.mjs tests/sseParser.test.mjs
```

Expected: every subtest passes. The attachment-specific tests must continue to cover supported types, limits, default prompt selection, multipart upload, file-ID streaming, upload failure, and vision-model restrictions.

- [ ] **Step 3: Confirm a clean intended working tree.**

Run:

```bash
git status --short
git diff --check
```

Expected: no whitespace errors; only intentionally uncommitted changes, if any, are shown. If Tasks 1 and 2 were committed, the working tree is clean.
