<script setup lang="ts">
import AppIcon from '../common/AppIcon.vue'
import type { AgentSummary } from '../../types/agent.js'
import type { ModelSummary } from '../../types/chat'

defineProps<{
  title: string
  model: ModelSummary
  models: ModelSummary[]
  modelDisabled?: boolean
  agent?: AgentSummary | null
}>()

const emit = defineEmits<{
  menu: []
  settings: []
  modelChange: [id: number]
}>()
</script>

<template>
  <header class="chat-header">
    <button class="icon-button chat-header__menu" aria-label="打开会话导航" @click="emit('menu')"><AppIcon name="menu" /></button>
    <div class="chat-header__title-wrap">
      <h1>{{ title }}</h1>
      <span class="chat-header__status"><i></i> 已保存</span>
    </div>
    <div class="chat-header__actions">
      <label class="model-select">
        <span class="model-select__dot"></span>
        <select :value="model.id" :disabled="modelDisabled || agent !== null" aria-label="选择模型" @change="!agent && emit('modelChange', Number(($event.target as HTMLSelectElement).value))">
          <option v-if="!models.some((item) => item.id === model.id)" :value="model.id">{{ model.modelName }}</option>
          <option v-for="item in models" :key="item.id" :value="item.id">{{ item.modelName }}</option>
        </select>
        <AppIcon name="chevron-down" size="15" />
        <span v-if="agent" class="model-select__locked" :title="`由 Agent“${agent.name}”固定`">Agent 已锁定</span>
      </label>
      <button class="icon-button" aria-label="打开设置" @click="emit('settings')"><AppIcon name="settings" /></button>
    </div>
  </header>
</template>
