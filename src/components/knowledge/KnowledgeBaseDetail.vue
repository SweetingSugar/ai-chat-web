<script setup lang="ts">
import AppIcon from '../common/AppIcon.vue'
import type { KnowledgeBase, KnowledgeDocument } from '../../types/chat.js'

const props = withDefaults(defineProps<{
  base: KnowledgeBase
  documents: KnowledgeDocument[]
  loading?: boolean
  loadingMore?: boolean
  error?: string | null
  hasMore?: boolean
  mutating?: boolean
  previewingDocumentId?: number | null
}>(), {
  loading: false,
  loadingMore: false,
  error: null,
  hasMore: false,
  mutating: false,
  previewingDocumentId: null,
})

const emit = defineEmits<{
  back: []
  edit: []
  deleteBase: []
  addText: []
  upload: [file: File]
  deleteDocument: [id: number]
  retryDocument: [id: number]
  preview: [document: KnowledgeDocument]
  loadMore: []
  retry: []
}>()

function chooseFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('upload', file)
  input.value = ''
}

function handleScroll(event: Event) {
  const element = event.currentTarget as HTMLElement
  if (!props.loadingMore && props.hasMore && element.scrollHeight - element.scrollTop - element.clientHeight <= 48) {
    emit('loadMore')
  }
}

function confirmDeleteBase() {
  if (window.confirm(`确定删除“${props.base.name}”及其全部文档吗？`)) emit('deleteBase')
}

function confirmDeleteDocument(document: KnowledgeDocument) {
  if (window.confirm(`确定删除文档“${document.title}”吗？`)) emit('deleteDocument', document.id)
}

function documentStatus(document: KnowledgeDocument) {
  const labels: Record<string, string> = {
    PENDING: '等待处理',
    INDEXING: '正在索引',
    COMPLETED: '已就绪',
    FAILED: '处理失败',
  }
  return labels[document.status] ?? document.status
}
</script>

<template>
  <section class="knowledge-page knowledge-detail">
    <header class="knowledge-header knowledge-header--detail">
      <div>
        <button class="back-button" type="button" @click="emit('back')"><AppIcon name="chevron-right" size="15" />全部知识库</button>
        <p class="eyebrow">知识库</p>
        <h1>{{ base.name }}</h1>
        <p>{{ base.description || '暂无描述' }}</p>
      </div>
      <div class="knowledge-header__actions">
        <button class="form-button form-button--secondary" type="button" :disabled="mutating" @click="emit('edit')"><AppIcon name="edit" size="16" />编辑设置</button>
        <button class="icon-button knowledge-danger" type="button" :disabled="mutating" aria-label="删除知识库" @click="confirmDeleteBase"><AppIcon name="trash" /></button>
      </div>
    </header>

    <section class="knowledge-panel">
      <div class="knowledge-panel__header">
        <div><h2>文档</h2><p>添加文件或文本，系统会自动建立检索索引。</p></div>
        <div class="knowledge-panel__actions">
          <label class="form-button form-button--secondary" :class="{ 'form-button--disabled': mutating }">
            <AppIcon name="paperclip" size="16" />上传文件
            <input class="composer__file-input" type="file" :disabled="mutating" @change="chooseFile" />
          </label>
          <button class="form-button" type="button" :disabled="mutating" @click="emit('addText')"><AppIcon name="plus" size="16" />添加文本</button>
        </div>
      </div>

      <div class="document-list" @scroll="handleScroll">
        <div v-if="loading" class="knowledge-status">正在加载文档…</div>
        <div v-else-if="error" class="knowledge-status knowledge-status--error"><span>{{ error }}</span><button type="button" @click="emit('retry')">重试</button></div>
        <div v-else-if="documents.length === 0" class="document-empty">暂无文档，上传文件或添加文本开始建立知识库。</div>
        <article v-for="document in documents" v-else :key="document.id" class="document-row">
          <span class="document-row__icon"><AppIcon :name="document.sourceType === 'TEXT' ? 'edit' : 'file'" size="17" /></span>
          <div class="document-row__body">
            <strong>{{ document.title }}</strong>
            <span>{{ document.sourceType === 'TEXT' ? '文本' : '文件' }}<template v-if="document.chunkCount !== null"> · {{ document.chunkCount }} 个分块</template></span>
            <p v-if="document.status === 'FAILED'">{{ document.errorMessage || '文档处理失败，请重试。' }}</p>
          </div>
          <span class="status-badge" :class="{ 'status-badge--danger': document.status === 'FAILED', 'status-badge--busy': document.status === 'PENDING' || document.status === 'INDEXING' }">{{ documentStatus(document) }}</span>
          <div class="document-row__actions">
            <button class="icon-button" type="button" :disabled="mutating || previewingDocumentId === document.id" aria-label="查看文档" @click="emit('preview', document)"><AppIcon name="eye" size="16" /></button>
            <button v-if="document.status === 'FAILED'" class="icon-button" type="button" :disabled="mutating" aria-label="重试处理文档" @click="emit('retryDocument', document.id)"><AppIcon name="refresh" size="16" /></button>
            <button class="icon-button knowledge-danger" type="button" :disabled="mutating" aria-label="删除文档" @click="confirmDeleteDocument(document)"><AppIcon name="trash" size="16" /></button>
          </div>
        </article>
        <div v-if="loadingMore" class="knowledge-status knowledge-status--more">正在加载更多…</div>
      </div>
    </section>
  </section>
</template>
