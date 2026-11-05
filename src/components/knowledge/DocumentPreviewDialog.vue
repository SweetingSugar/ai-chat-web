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
