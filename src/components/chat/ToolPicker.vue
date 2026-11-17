<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import { toggleChatTool } from '../../lib/toolSelection.js'
import type { AvailableTool } from '../../types/chat.js'

const props = withDefaults(defineProps<{
  tools: AvailableTool[]
  modelValue: string[]
  disabled?: boolean
  loading?: boolean
  error?: string | null
}>(), {
  disabled: false,
  loading: false,
  error: null,
})

const emit = defineEmits<{
  'update:modelValue': [toolCodes: string[]]
  limit: [message: string]
  open: []
}>()

const rootRef = ref<HTMLElement | null>(null)
const expanded = ref(false)
const query = ref('')
const filteredTools = computed(() => {
  const value = query.value.trim().toLowerCase()
  if (!value) return props.tools
  return props.tools.filter((tool) => [tool.toolName, tool.toolCode, tool.description ?? '']
    .some((item) => item.toLowerCase().includes(value)))
})

function toggle() {
  if (props.disabled) return
  expanded.value = !expanded.value
  if (expanded.value) emit('open')
}

function select(toolCode: string) {
  const result = toggleChatTool(props.modelValue, toolCode)
  if (result.error) emit('limit', result.error)
  else emit('update:modelValue', result.toolCodes)
}

function closeOutside(event: MouseEvent) {
  if (rootRef.value && !rootRef.value.contains(event.target as Node)) expanded.value = false
}

onMounted(() => document.addEventListener('click', closeOutside))
onBeforeUnmount(() => document.removeEventListener('click', closeOutside))
</script>

<template>
  <div ref="rootRef" class="tool-picker">
    <button type="button" class="composer-tool" :disabled="disabled" :aria-expanded="expanded" aria-haspopup="listbox" @click.stop="toggle">
      <AppIcon name="tool" size="16" /><span>工具</span><span v-if="modelValue.length" class="tool-picker__count">{{ modelValue.length }}</span>
    </button>
    <div v-if="expanded" class="tool-picker__popover" @click.stop>
      <label class="tool-picker__search"><AppIcon name="search" size="14" /><input v-model="query" type="search" placeholder="搜索工具" autofocus /></label>
      <div class="tool-picker__list" role="listbox" aria-label="可选工具" aria-multiselectable="true">
        <p v-if="loading">正在加载工具…</p>
        <p v-else-if="error">工具加载失败，请关闭后重试</p>
        <template v-else>
          <label v-for="tool in filteredTools" :key="tool.toolCode" class="tool-picker__option">
            <input type="checkbox" :checked="modelValue.includes(tool.toolCode)" @change="select(tool.toolCode)" />
            <span>
              <strong>{{ tool.toolName }}</strong>
              <small><em>{{ tool.toolType }}</em>{{ tool.description || '暂无描述' }}</small>
            </span>
          </label>
          <p v-if="filteredTools.length === 0">没有可选工具</p>
        </template>
      </div>
    </div>
  </div>
</template>
