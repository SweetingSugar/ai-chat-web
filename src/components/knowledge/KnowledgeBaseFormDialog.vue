<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import type { EmbeddingModel, KnowledgeBase } from '../../types/chat.js'

const props = withDefaults(defineProps<{
  open: boolean
  base?: KnowledgeBase | null
  models: EmbeddingModel[]
  submitting?: boolean
}>(), {
  base: null,
  submitting: false,
})

const emit = defineEmits<{
  close: []
  submit: [payload: { name: string; description?: string; embeddingModelId: number }]
}>()

const name = ref('')
const description = ref('')
const embeddingModelId = ref<number | null>(null)
const isEditing = computed(() => props.base !== null)
const title = computed(() => isEditing.value ? '编辑知识库' : '新建知识库')

function reset() {
  name.value = props.base?.name ?? ''
  description.value = props.base?.description ?? ''
  embeddingModelId.value = props.base?.embeddingModelId ?? props.models[0]?.id ?? null
}

function close() {
  if (!props.submitting) emit('close')
}

function submit() {
  const value = name.value.trim()
  if (!value || embeddingModelId.value === null) return
  emit('submit', {
    name: value,
    description: description.value.trim() || undefined,
    embeddingModelId: embeddingModelId.value,
  })
}

watch(() => [props.open, props.base, props.models] as const, () => {
  if (props.open) reset()
}, { immediate: true, deep: true })
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="auth-modal-overlay" role="presentation" @click.self="close">
      <form class="auth-modal knowledge-form" role="dialog" aria-modal="true" :aria-label="title" @submit.prevent="submit">
        <div class="auth-modal__header">
          <div>
            <p class="eyebrow">个人工作区</p>
            <h2>{{ title }}</h2>
          </div>
          <button class="icon-button" type="button" :disabled="submitting" aria-label="关闭" @click="close"><AppIcon name="close" /></button>
        </div>
        <p class="auth-modal__sub">为资料选择用于建立索引的嵌入模型。</p>

        <label class="auth-field">
          <span>名称</span>
          <input v-model="name" maxlength="100" required placeholder="例如：产品知识库" :disabled="submitting" />
        </label>
        <label class="auth-field">
          <span>描述 <em>可选</em></span>
          <textarea v-model="description" maxlength="1000" rows="3" placeholder="说明知识库的用途" :disabled="submitting"></textarea>
        </label>
        <label class="auth-field">
          <span>嵌入模型</span>
          <select v-model="embeddingModelId" required :disabled="submitting || models.length === 0">
            <option :value="null" disabled>{{ models.length ? '请选择嵌入模型' : '暂无可用嵌入模型' }}</option>
            <option v-for="model in models" :key="model.id" :value="model.id">{{ model.modelName }} · {{ model.providerName }}</option>
          </select>
        </label>

        <div class="form-actions">
          <button type="button" class="form-button form-button--secondary" :disabled="submitting" @click="close">取消</button>
          <button type="submit" class="form-button" :disabled="submitting || !name.trim() || embeddingModelId === null">{{ submitting ? '正在保存…' : '保存' }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
