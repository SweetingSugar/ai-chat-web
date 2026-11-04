<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import { toggleKnowledgeBase } from '../../lib/knowledgeSelection.js'
import type { KnowledgeBase } from '../../types/chat.js'

const props = withDefaults(defineProps<{
  bases: KnowledgeBase[]
  modelValue: number[]
  disabled?: boolean
}>(), {
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [ids: number[]]
  limit: [message: string]
  open: []
}>()

const rootRef = ref<HTMLElement | null>(null)
const expanded = ref(false)
const query = ref('')
const filteredBases = computed(() => {
  const value = query.value.trim().toLowerCase()
  if (!value) return props.bases
  return props.bases.filter((base) => base.name.toLowerCase().includes(value))
})

function toggle() {
  if (props.disabled) return
  expanded.value = !expanded.value
  if (expanded.value) emit('open')
}

function select(id: number) {
  const result = toggleKnowledgeBase(props.modelValue, id)
  if (result.error) emit('limit', result.error)
  else emit('update:modelValue', result.ids)
}

function closeOutside(event: MouseEvent) {
  if (rootRef.value && !rootRef.value.contains(event.target as Node)) expanded.value = false
}

onMounted(() => document.addEventListener('click', closeOutside))
onBeforeUnmount(() => document.removeEventListener('click', closeOutside))
</script>

<template>
  <div ref="rootRef" class="knowledge-picker">
    <button type="button" class="composer-tool" :disabled="disabled" :aria-expanded="expanded" aria-haspopup="listbox" @click.stop="toggle">
      <AppIcon name="book" size="16" /><span>知识库</span><span v-if="modelValue.length" class="knowledge-picker__count">{{ modelValue.length }}</span>
    </button>
    <div v-if="expanded" class="knowledge-picker__popover" @click.stop>
      <label class="knowledge-picker__search"><AppIcon name="search" size="14" /><input v-model="query" type="search" placeholder="搜索知识库" autofocus /></label>
      <div class="knowledge-picker__list" role="listbox" aria-multiselectable="true">
        <label v-for="base in filteredBases" :key="base.id" class="knowledge-picker__option">
          <input type="checkbox" :checked="modelValue.includes(base.id)" @change="select(base.id)" />
          <span><strong>{{ base.name }}</strong><small>{{ base.description || '暂无描述' }}</small></span>
        </label>
        <p v-if="filteredBases.length === 0">没有可选知识库</p>
      </div>
    </div>
  </div>
</template>
