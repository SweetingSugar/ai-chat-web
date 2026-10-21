<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import AppIcon from './components/common/AppIcon.vue'
import ChatHeader from './components/chat/ChatHeader.vue'
import Composer from './components/chat/Composer.vue'
import EmptyState from './components/chat/EmptyState.vue'
import MessageList from './components/chat/MessageList.vue'
import SettingsDrawer from './components/chat/SettingsDrawer.vue'
import Sidebar from './components/chat/Sidebar.vue'
import { clearAuthState } from './api/client'
import { demoMessages, demoRespond, demoSessions } from './data/demoChat'
import { createChatWorkspace } from './composables/useChatWorkspace'
import type { ModelSummary } from './types/chat'

const workspace = createChatWorkspace({
  initialSessions: demoSessions,
  initialMessages: demoMessages,
  respond: demoRespond,
})

const sessions = workspace.sessions
const activeSessionId = workspace.activeSessionId
const messages = workspace.messages
const isGenerating = workspace.isGenerating

const sidebarOpen = ref(false)
const settingsOpen = ref(false)
const toast = ref('')
const theme = ref<'light' | 'dark'>('light')
const composerRef = ref<InstanceType<typeof Composer> | null>(null)
let toastTimer: number | undefined

const activeTitle = computed(() => workspace.activeSession.value?.title ?? '新对话')
const hasMessages = computed(() => workspace.messages.value.length > 0)
const activeModel = ref<ModelSummary>({
  id: 3,
  providerName: 'Lumina',
  modelCode: 'lumina-2.1',
  modelName: 'Lumina 2.1',
  contextWindow: 32768,
  maxOutputTokens: 4096,
  supportStream: true,
  defaultModel: true,
})

function notify(message: string) {
  toast.value = message
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toast.value = '' }, 2400)
}

function selectSession(id: number) {
  workspace.selectSession(id)
}

function newChat() {
  workspace.createSession()
  sidebarOpen.value = false
}

function chooseSuggestion(value: string) {
  composerRef.value?.fill(value)
}

function copyMessage() {
  notify('回答已复制到剪贴板')
}

function handleTheme(value: 'light' | 'dark') {
  theme.value = value
  localStorage.setItem('lumina-theme', value)
}

function logout() {
  clearAuthState()
  settingsOpen.value = false
  notify('已退出登录')
}

watch(theme, (value) => {
  document.documentElement.dataset.theme = value
})

onMounted(async () => {
  theme.value = (localStorage.getItem('lumina-theme') as 'light' | null) ?? 'light'
  await nextTick()
})
</script>

<template>
  <div class="app-shell">
    <div v-if="sidebarOpen" class="mobile-backdrop" @click="sidebarOpen = false"></div>
    <Sidebar
      :sessions="sessions"
      :active-session-id="activeSessionId"
      :mobile-open="sidebarOpen"
      @new-chat="newChat"
      @select="selectSession"
      @rename="workspace.renameSession"
      @pin="workspace.togglePinned"
      @delete="workspace.deleteSession"
      @close-mobile="sidebarOpen = false"
    />
    <main class="chat-main">
      <ChatHeader
        :title="activeTitle"
        :model="activeModel"
        @menu="sidebarOpen = true"
        @settings="settingsOpen = true"
        @model-change="notify('模型选择将在连接后端模型列表后生效')"
      />
      <div class="chat-content">
        <EmptyState v-if="!hasMessages" :suggestions="['帮我制定一个学习计划', '把这段文字改得更清晰', '解释一个我不懂的概念', '帮我写一个周末旅行计划']" @choose="chooseSuggestion" />
        <MessageList v-else :messages="messages" :generating="isGenerating" @copy="copyMessage" @retry="workspace.retry" @regenerate="workspace.regenerate" />
      </div>
      <Composer ref="composerRef" :generating="isGenerating" @submit="workspace.submit" @stop="workspace.stopGeneration" />
    </main>
    <SettingsDrawer :open="settingsOpen" :theme="theme" @close="settingsOpen = false" @theme="handleTheme" @logout="logout" />
    <Transition name="toast"><div v-if="toast" class="toast"><span class="toast__dot"></span>{{ toast }}</div></Transition>
  </div>
</template>
