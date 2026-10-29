<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import { formatFileSize, selectChatAttachments } from '../../lib/chatAttachments.js'

const props = withDefaults(defineProps<{ generating: boolean; submitting?: boolean }>(), { submitting: false })
const emit = defineEmits<{
  submit: [payload: { content: string; files: File[] }]
  stop: []
  invalidFiles: [messages: string[]]
}>()

const value = ref('')
const files = ref<File[]>([])
const inputRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const canSubmit = computed(() => Boolean(value.value.trim() || files.value.length))

function resize() {
  const input = inputRef.value
  if (!input) return
  input.style.height = 'auto'
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`
}

function chooseFiles() {
  fileInputRef.value?.click()
}

function addFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const selection = selectChatAttachments(files.value, Array.from(input.files ?? []))
  files.value = selection.files
  if (selection.errors.length) emit('invalidFiles', selection.errors)
  input.value = ''
}

function removeFile(index: number) {
  files.value.splice(index, 1)
}

function submit() {
  if (!canSubmit.value || props.submitting) return
  emit('submit', { content: value.value, files: [...files.value] })
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    submit()
  }
}

function clear() {
  value.value = ''
  files.value = []
  void nextTick(resize)
}

defineExpose({
  fill: (text: string) => { value.value = text; void nextTick(resize); inputRef.value?.focus() },
  clear,
})
</script>

<template>
  <div class="composer-wrap">
    <div v-if="files.length" class="composer__attachments" aria-label="待发送附件">
      <div v-for="(file, index) in files" :key="`${file.name}-${file.size}-${index}`" class="attachment-chip">
        <AppIcon :name="file.type === 'application/pdf' ? 'file' : 'image'" size="16" />
        <span class="attachment-chip__details"><strong>{{ file.name }}</strong><small>{{ formatFileSize(file.size) }}</small></span>
        <button type="button" :disabled="generating || submitting" :aria-label="`移除附件 ${file.name}`" @click="removeFile(index)"><AppIcon name="close" size="14" /></button>
      </div>
    </div>
    <div class="composer">
      <textarea ref="inputRef" v-model="value" rows="1" placeholder="输入你的问题…" aria-label="输入消息" :disabled="generating || submitting" @input="resize" @keydown="handleKeydown"></textarea>
      <input ref="fileInputRef" class="composer__file-input" type="file" accept="image/jpeg,image/png,image/gif,application/pdf" multiple :disabled="generating || submitting" @change="addFiles">
      <div class="composer__bottom">
        <div class="composer__tools">
          <button type="button" class="composer-tool" :disabled="generating || submitting" aria-label="添加附件" @click="chooseFiles"><AppIcon name="paperclip" size="16" /><span>添加</span></button>
        </div>
        <div class="composer__actions">
          <span class="composer__hint">Shift + Enter 换行</span>
          <button v-if="generating" class="send-button send-button--stop" aria-label="停止生成" @click="emit('stop')"><AppIcon name="stop" size="17" /></button>
          <button v-else class="send-button" :aria-label="submitting ? '正在上传附件' : '发送消息'" :disabled="!canSubmit || submitting" @click="submit">
            <span v-if="submitting">…</span>
            <AppIcon v-else name="send" size="17" />
          </button>
        </div>
      </div>
    </div>
    <p class="composer-disclaimer">ice 可能会出错，请核对重要信息。</p>
  </div>
</template>
