<script setup lang="ts">
import { ref, watch } from 'vue'
import AppIcon from '../common/AppIcon.vue'

const props = withDefaults(defineProps<{
  open: boolean
  submitting?: boolean
}>(), {
  submitting: false,
})

const emit = defineEmits<{
  close: []
  submit: [payload: { title: string; content: string }]
}>()

const title = ref('')
const content = ref('')

function close() {
  if (!props.submitting) emit('close')
}

function submit() {
  if (!title.value.trim() || !content.value.trim()) return
  emit('submit', { title: title.value.trim(), content: content.value.trim() })
}

watch(() => props.open, (open) => {
  if (open) {
    title.value = ''
    content.value = ''
  }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="auth-modal-overlay" role="presentation" @click.self="close">
      <form class="auth-modal knowledge-form" role="dialog" aria-modal="true" aria-label="添加文本" @submit.prevent="submit">
        <div class="auth-modal__header">
          <div>
            <p class="eyebrow">知识文档</p>
            <h2>添加文本</h2>
          </div>
          <button class="icon-button" type="button" :disabled="submitting" aria-label="关闭" @click="close"><AppIcon name="close" /></button>
        </div>
        <p class="auth-modal__sub">保存后将自动拆分、索引并用于检索。</p>

        <label class="auth-field">
          <span>标题</span>
          <input v-model="title" maxlength="255" required placeholder="例如：请假制度" :disabled="submitting" />
        </label>
        <label class="auth-field">
          <span>内容</span>
          <textarea v-model="content" maxlength="1000000" rows="10" required placeholder="粘贴或输入需要检索的内容" :disabled="submitting"></textarea>
        </label>

        <div class="form-actions">
          <button type="button" class="form-button form-button--secondary" :disabled="submitting" @click="close">取消</button>
          <button type="submit" class="form-button" :disabled="submitting || !title.trim() || !content.trim()">{{ submitting ? '正在添加…' : '添加文档' }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
