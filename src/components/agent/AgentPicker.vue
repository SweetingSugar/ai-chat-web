<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import type { AgentSummary } from '../../types/agent.js'

const props = withDefaults(defineProps<{
  agents: AgentSummary[]
  modelValue: AgentSummary | null
  disabled?: boolean
}>(), { disabled: false })

const emit = defineEmits<{
  'update:modelValue': [agent: AgentSummary | null]
  manage: []
}>()

const enabledAgents = computed(() => props.agents.filter((agent) => agent.status === 1))

function agentById(id: number) {
  const agent = enabledAgents.value.find((item) => item.id === id)
  return agent ? { ...agent } : null
}
</script>

<template>
  <div class="agent-picker">
    <AppIcon name="star" size="14" />
    <select
      :value="modelValue?.id ?? ''"
      :disabled="disabled"
      aria-label="选择 Agent"
      @change="emit('update:modelValue', agentById(Number(($event.target as HTMLSelectElement).value)) ?? null)"
    >
      <option value="">普通对话</option>
      <option v-for="agent in enabledAgents" :key="agent.id" :value="agent.id">{{ agent.name }}</option>
    </select>
    <span v-if="modelValue" class="agent-picker__summary">模型 #{{ modelValue.modelId }} · {{ modelValue.knowledgeBaseIds.length }} 个知识库 · {{ modelValue.toolCodes.length }} 个工具</span>
    <button v-if="enabledAgents.length === 0" type="button" class="agent-picker__manage" :disabled="disabled" @click="emit('manage')">创建 Agent</button>
  </div>
</template>
