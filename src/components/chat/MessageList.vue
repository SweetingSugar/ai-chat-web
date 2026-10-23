<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import type { ChatMessage } from '../../types/chat'

const props = defineProps<{
  messages: ChatMessage[]
  generating: boolean
}>()

const emit = defineEmits<{
  copy: [message: ChatMessage]
  retry: [id: number]
  regenerate: [id: number]
}>()

const listRef = ref<HTMLElement | null>(null)
const showScrollButton = ref(false)

function scrollToBottom(smooth = true) {
  if (!listRef.value) return
  listRef.value.scrollTo({ top: listRef.value.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  handleScroll()
}

function handleScroll() {
  if (!listRef.value) return
  const distance = listRef.value.scrollHeight - listRef.value.scrollTop - listRef.value.clientHeight
  showScrollButton.value = distance > 1
}

async function copyMessage(message: ChatMessage) {
  try {
    await navigator.clipboard.writeText(message.content)
    emit('copy', message)
  } catch {
    // The parent still receives the action and can show a fallback notice.
    emit('copy', message)
  }
}

watch(() => props.messages.map((message) => `${message.id}:${message.content.length}:${message.status}`).join('|'), async () => {
  await nextTick()
  if (!showScrollButton.value) scrollToBottom()
})

onMounted(() => scrollToBottom(false))
</script>

<template>
  <div class="message-list-shell">
    <div ref="listRef" class="message-list" @scroll="handleScroll">
      <div v-if="messages.length === 0" class="message-list__empty"></div>
    <article v-for="message in messages" :key="message.id" class="message" :class="`message--${message.role.toLowerCase()}`">
      <div v-if="message.role === 'ASSISTANT'" class="message__avatar avatar avatar--assistant">✦</div>
      <div class="message__body">
        <div class="message__meta"><span>{{ message.role === 'ASSISTANT' ? 'AI' : '你' }}</span><span v-if="message.role === 'ASSISTANT' && message.modelId">· 模型 {{ message.modelId }}</span></div>
        <div class="message__content" :class="{ 'message__content--error': message.status === 'FAILED', 'message__content--interrupted': message.status === 'INTERRUPTED' }">
          <template v-if="message.status === 'STREAMING' && !message.content">
            <span class="thinking"><i></i><i></i><i></i><span>正在思考</span></span>
          </template>
          <template v-else>
            <p v-for="(paragraph, index) in message.content.split('\n')" :key="`${message.id}-${index}`">{{ paragraph || '\u00a0' }}</p>
          </template>
          <span v-if="message.status === 'STREAMING' && message.content" class="typing-cursor"></span>
          <div v-if="message.status === 'FAILED'" class="message__error"><span>{{ message.errorMessage || '生成失败，请重试。' }}</span><button @click="emit('retry', message.id)">重试</button></div>
          <div v-if="message.status === 'INTERRUPTED'" class="message__interrupted">{{ message.errorMessage }}</div>
        </div>
        <div v-if="message.role === 'ASSISTANT' && message.status !== 'STREAMING' && !generating" class="message__actions">
          <button aria-label="复制回答" @click="copyMessage(message)"><AppIcon name="copy" size="15" /></button>
          <button aria-label="重新生成" @click="emit('regenerate', message.id)"><AppIcon name="refresh" size="15" /></button>
          <span class="message__actions-spacer"></span>
          <button aria-label="赞"><AppIcon name="thumb-up" size="15" /></button>
          <button aria-label="踩"><AppIcon name="thumb-down" size="15" /></button>
        </div>
      </div>
      </article>
    </div>
    <button v-if="showScrollButton" class="scroll-bottom-button" @click="scrollToBottom()"><AppIcon name="chevron-down" size="16" />回到底部</button>
  </div>
</template>
