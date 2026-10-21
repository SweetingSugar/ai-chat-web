<script setup lang="ts">
import AppIcon from '../common/AppIcon.vue'
import type { ModelSummary } from '../../types/chat'

defineProps<{
  title: string
  model: ModelSummary
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
        <select :value="model.id" aria-label="选择模型" @change="emit('modelChange', Number(($event.target as HTMLSelectElement).value))">
          <option :value="model.id">{{ model.modelName }}</option>
        </select>
        <AppIcon name="chevron-down" size="15" />
      </label>
      <button class="icon-button" aria-label="打开设置" @click="emit('settings')"><AppIcon name="settings" /></button>
    </div>
  </header>
</template>
