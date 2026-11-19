<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import type { Agent } from '../../types/agent.js'
import type { ModelSummary } from '../../types/chat.js'

const props = defineProps<{
  agent: Agent
  models: ModelSummary[]
}>()

const emit = defineEmits<{
  edit: []
  toggleStatus: []
  delete: []
}>()

const statusLabel = computed(() => props.agent.status === 1 ? '已启用' : '已停用')
const model = computed(() => props.models.find((item) => item.id === props.agent.modelId))
</script>

<template>
  <article class="agent-card">
    <div class="agent-card__top">
      <span class="agent-card__icon"><AppIcon name="star" size="18" /></span>
      <span class="status-badge" :class="{ 'agent-status--disabled': agent.status !== 1 }">{{ statusLabel }}</span>
    </div>
    <strong>{{ agent.name }}</strong>
    <p>{{ agent.description || '暂无描述' }}</p>
    <div class="agent-card__meta">
      <span>{{ model?.modelName || `模型 #${agent.modelId}` }}</span>
      <span>知识库 {{ agent.knowledgeBaseIds.length }} 个</span>
      <span>工具 {{ agent.toolCodes.length }} 个</span>
    </div>
    <small>更新于 {{ new Date(agent.updateTime).toLocaleString('zh-CN') }}</small>
    <div class="agent-card__actions">
      <button class="form-button form-button--secondary" type="button" @click="emit('edit')"><AppIcon name="edit" size="14" />编辑</button>
      <button class="form-button form-button--secondary" type="button" @click="emit('toggleStatus')">{{ agent.status === 1 ? '停用' : '启用' }}</button>
      <button class="icon-button knowledge-danger" type="button" aria-label="删除 Agent" @click="emit('delete')"><AppIcon name="trash" size="15" /></button>
    </div>
  </article>
</template>
