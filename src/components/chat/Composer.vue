<script setup lang="ts">
import { nextTick, ref } from 'vue'
import AppIcon from '../common/AppIcon.vue'

defineProps<{ generating: boolean }>()
const emit = defineEmits<{ submit: [value: string]; stop: [] }>()
const value = ref('')
const inputRef = ref<HTMLTextAreaElement | null>(null)

function resize() {
  const input = inputRef.value
  if (!input) return
  input.style.height = 'auto'
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`
}

function submit() {
  if (!value.value.trim()) return
  emit('submit', value.value)
  value.value = ''
  void nextTick(resize)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    submit()
  }
}

defineExpose({ fill: (text: string) => { value.value = text; void nextTick(resize); inputRef.value?.focus() } })
</script>

<template>
  <div class="composer-wrap">
    <div class="composer">
      <textarea ref="inputRef" v-model="value" rows="1" placeholder="输入你的问题…" aria-label="输入消息" @input="resize" @keydown="handleKeydown"></textarea>
      <div class="composer__bottom">
        <div class="composer__tools"><button class="composer-tool" aria-label="添加附件" title="附件功能即将推出">＋ <span>添加</span></button></div>
        <div class="composer__actions">
          <span class="composer__hint">Shift + Enter 换行</span>
          <button v-if="generating" class="send-button send-button--stop" aria-label="停止生成" @click="emit('stop')"><AppIcon name="stop" size="17" /></button>
          <button v-else class="send-button" aria-label="发送消息" :disabled="!value.trim()" @click="submit"><AppIcon name="send" size="17" /></button>
        </div>
      </div>
    </div>
    <p class="composer-disclaimer">ice 可能会出错，请核对重要信息。</p>
  </div>
</template>
