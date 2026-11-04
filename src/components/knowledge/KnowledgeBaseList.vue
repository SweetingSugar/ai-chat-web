<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import type { KnowledgeBase } from '../../types/chat.js'

const props = withDefaults(defineProps<{
  bases: KnowledgeBase[]
  loading?: boolean
  loadingMore?: boolean
  error?: string | null
  hasMore?: boolean
}>(), {
  loading: false,
  loadingMore: false,
  error: null,
  hasMore: false,
})

const emit = defineEmits<{
  create: []
  open: [id: number]
  loadMore: []
  retry: []
}>()

const query = ref('')
const filteredBases = computed(() => {
  const value = query.value.trim().toLowerCase()
  if (!value) return props.bases
  return props.bases.filter((base) => `${base.name} ${base.description ?? ''}`.toLowerCase().includes(value))
})

function handleScroll(event: Event) {
  const element = event.currentTarget as HTMLElement
  if (!props.loadingMore && props.hasMore && element.scrollHeight - element.scrollTop - element.clientHeight <= 48) {
    emit('loadMore')
  }
}

function statusLabel(base: KnowledgeBase) {
  return base.reindexing ? '正在重建索引' : base.status === 'ACTIVE' ? '索引已就绪' : base.status
}
</script>

<template>
  <section class="knowledge-page">
    <header class="knowledge-header">
      <div>
        <p class="eyebrow">个人工作区</p>
        <h1>知识库</h1>
        <p>集中管理资料，并在聊天中按需调用。</p>
      </div>
      <button class="form-button" type="button" @click="emit('create')"><AppIcon name="plus" size="17" />新建知识库</button>
    </header>

    <label class="knowledge-search">
      <AppIcon name="search" size="16" />
      <input v-model="query" type="search" placeholder="搜索知识库" aria-label="搜索知识库" />
    </label>

    <div class="knowledge-list-scroll" @scroll="handleScroll">
      <div v-if="loading" class="knowledge-status">正在加载知识库…</div>
      <div v-else-if="error" class="knowledge-status knowledge-status--error">
        <span>{{ error }}</span><button type="button" @click="emit('retry')">重试</button>
      </div>
      <div v-else-if="filteredBases.length === 0" class="knowledge-empty">
        <div class="knowledge-empty__icon"><AppIcon name="book" size="25" /></div>
        <h2>{{ query.trim() ? '没有找到匹配的知识库' : '还没有知识库' }}</h2>
        <p>{{ query.trim() ? '试试其他关键词。' : '创建一个知识库，开始整理你的资料吧。' }}</p>
        <button v-if="!query.trim()" class="form-button" type="button" @click="emit('create')">新建知识库</button>
      </div>
      <div v-else class="knowledge-grid">
        <button v-for="base in filteredBases" :key="base.id" class="knowledge-card" type="button" @click="emit('open', base.id)">
          <div class="knowledge-card__top"><span class="knowledge-card__icon"><AppIcon name="book" size="18" /></span><span class="status-badge" :class="{ 'status-badge--busy': base.reindexing }">{{ statusLabel(base) }}</span></div>
          <strong>{{ base.name }}</strong>
          <p>{{ base.description || '暂无描述' }}</p>
          <small>更新于 {{ new Date(base.updateTime).toLocaleString('zh-CN') }}</small>
        </button>
      </div>
      <div v-if="loadingMore" class="knowledge-status knowledge-status--more">正在加载更多…</div>
    </div>
  </section>
</template>
