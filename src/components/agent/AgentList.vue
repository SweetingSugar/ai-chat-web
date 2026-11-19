<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import AgentCard from './AgentCard.vue'
import type { Agent } from '../../types/agent.js'
import type { ModelSummary } from '../../types/chat.js'

const props = withDefaults(defineProps<{
  agents: Agent[]
  models: ModelSummary[]
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
  edit: [agent: Agent]
  toggleStatus: [agent: Agent]
  delete: [agent: Agent]
  loadMore: []
  retry: []
}>()

const query = ref('')
const filteredAgents = computed(() => {
  const value = query.value.trim().toLowerCase()
  if (!value) return props.agents
  return props.agents.filter((agent) => `${agent.name} ${agent.description ?? ''}`.toLowerCase().includes(value))
})

function handleScroll(event: Event) {
  const element = event.currentTarget as HTMLElement
  if (!props.loadingMore && props.hasMore && element.scrollHeight - element.scrollTop - element.clientHeight <= 48) {
    emit('loadMore')
  }
}
</script>

<template>
  <section class="agent-page">
    <header class="agent-header">
      <div>
        <p class="eyebrow">个人工作区</p>
        <h1>Agent</h1>
        <p>配置专属角色、模型、知识库和工具。</p>
      </div>
      <button class="form-button" type="button" @click="emit('create')"><AppIcon name="plus" size="17" />新建 Agent</button>
    </header>

    <label class="agent-search">
      <AppIcon name="search" size="16" />
      <input v-model="query" type="search" placeholder="搜索 Agent" aria-label="搜索 Agent" />
    </label>

    <div class="agent-list-scroll" @scroll="handleScroll">
      <div v-if="loading" class="knowledge-status">正在加载 Agent…</div>
      <div v-else-if="error" class="knowledge-status knowledge-status--error">
        <span>{{ error }}</span><button type="button" @click="emit('retry')">重试</button>
      </div>
      <div v-else-if="filteredAgents.length === 0" class="knowledge-empty">
        <div class="knowledge-empty__icon"><AppIcon name="star" size="25" /></div>
        <h2>{{ query.trim() ? '没有找到匹配的 Agent' : '还没有 Agent' }}</h2>
        <p>{{ query.trim() ? '试试其他关键词。' : '创建一个 Agent，开始配置专属对话吧。' }}</p>
        <button v-if="!query.trim()" class="form-button" type="button" @click="emit('create')">新建 Agent</button>
      </div>
      <div v-else class="agent-grid">
        <AgentCard
          v-for="agent in filteredAgents"
          :key="agent.id"
          :agent="agent"
          :models="models"
          @edit="emit('edit', agent)"
          @toggle-status="emit('toggleStatus', agent)"
          @delete="emit('delete', agent)"
        />
      </div>
      <div v-if="loadingMore" class="knowledge-status knowledge-status--more">正在加载更多…</div>
    </div>
  </section>
</template>
