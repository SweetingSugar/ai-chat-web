<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import ChatHeader from '../components/chat/ChatHeader.vue'
import Composer from '../components/chat/Composer.vue'
import EmptyState from '../components/chat/EmptyState.vue'
import MessageList from '../components/chat/MessageList.vue'
import SettingsDrawer from '../components/chat/SettingsDrawer.vue'
import Sidebar from '../components/chat/Sidebar.vue'
import { useAuth } from '../composables/useAuth'
import { createChatWorkspace } from '../composables/useChatWorkspace'
import { chatApi } from '../api/chat'
import type { ModelSummary } from '../types/chat'

const router = useRouter()
const auth = useAuth()
const user = auth.user

const workspace = createChatWorkspace()

const sessions = workspace.sessions
const activeSessionId = workspace.activeSessionId
const messages = workspace.messages
const isGenerating = workspace.isGenerating
const isUploading = workspace.isUploading
const isChangingModel = workspace.isChangingModel
const isLoadingSessions = workspace.isLoadingSessions
const isLoadingMoreSessions = workspace.isLoadingMoreSessions
const isLoadingSessionDetail = workspace.isLoadingSessionDetail
const sessionsError = workspace.sessionsError
const sessionDetailError = workspace.sessionDetailError
const hasMoreSessions = workspace.hasMoreSessions

const sidebarOpen = ref(false)
const settingsOpen = ref(false)
const toast = ref('')
const models = ref<ModelSummary[]>([])
const isLoadingModels = ref(false)
const modelsError = ref<string | null>(null)
const theme = ref<'light' | 'dark'>('light')
const composerRef = ref<InstanceType<typeof Composer> | null>(null)
let toastTimer: number | undefined

const activeTitle = computed(() => workspace.activeSession.value?.title ?? '新对话')
const hasMessages = computed(() => workspace.messages.value.length > 0)
const sidebarError = computed(() => sessions.value.length === 0 ? sessionsError.value : null)
const currentModelId = computed(() => workspace.activeSession.value?.defaultModelId
  ?? models.value.find((model) => model.defaultModel)?.id
  ?? models.value[0]?.id
  ?? 3)
const activeModel = computed<ModelSummary>(() => models.value.find((model) => model.id === currentModelId.value) ?? {
  id: currentModelId.value,
  providerName: '配置模型',
  modelCode: `model-${currentModelId.value}`,
  modelName: `模型 ${currentModelId.value}`,
  contextWindow: null,
  maxOutputTokens: null,
  supportStream: true,
  supportVision: false,
  defaultModel: false,
})
const selectableModels = computed(() => models.value.some((model) => model.id === activeModel.value.id)
  ? models.value
  : [activeModel.value, ...models.value])

function notify(message: string) {
  toast.value = message
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toast.value = '' }, 2400)
}

async function loadModels() {
  isLoadingModels.value = true
  modelsError.value = null
  try {
    const loaded = await chatApi.listModels()
    models.value = [...new Map(loaded.map((model) => [model.id, model])).values()]
  } catch (error) {
    models.value = []
    modelsError.value = error instanceof Error ? error.message : '模型列表加载失败'
    notify(modelsError.value)
  } finally {
    isLoadingModels.value = false
  }
}

async function changeModel(modelId: number) {
  if (!selectableModels.value.some((model) => model.id === modelId)) return
  try {
    await workspace.changeModel(modelId)
    notify('模型已切换')
  } catch (error) {
    notify(error instanceof Error ? error.message : '模型切换失败，请重试')
  }
}

function selectSession(id: number) {
  void workspace.selectSession(id).catch((error) => notify(error instanceof Error ? error.message : '加载会话失败'))
}

function newChat() {
  void workspace.createSession(currentModelId.value).catch((error) => notify(error instanceof Error ? error.message : '创建会话失败'))
  sidebarOpen.value = false
}

function loadMoreSessions() {
  void workspace.loadMoreSessions().catch((error) => notify(error instanceof Error ? error.message : '加载更多会话失败'))
}

function retryLoadSessions() {
  void workspace.loadSessions()
}

function retrySessionDetail() {
  if (activeSessionId.value !== null) {
    void workspace.loadSessionDetail(activeSessionId.value).catch((error) => notify(error instanceof Error ? error.message : '加载会话失败'))
  }
}

function chooseSuggestion(value: string) {
  composerRef.value?.fill(value)
}

async function submitMessage(payload: { content: string; files: File[] }) {
  try {
    const sent = await workspace.submit(
      payload.content,
      currentModelId.value,
      payload.files,
      activeModel.value.supportVision,
    )
    if (sent) composerRef.value?.clear()
  } catch (error) {
    notify(error instanceof Error ? error.message : '发送失败，请重试')
  }
}

function notifyInvalidFiles(messages: string[]) {
  notify(messages[0] ?? '部分附件不可用')
}

function copyMessage() {
  notify('回答已复制到剪贴板')
}

function handleTheme(value: 'light' | 'dark') {
  theme.value = value
  localStorage.setItem('lumina-theme', value)
}

function handleLogout() {
  void auth.logout().then(() => router.push({ name: 'login' }))
}

watch(theme, (value) => {
  document.documentElement.dataset.theme = value
})

// 401（token 过期等）导致登录态失效时，自动回到登录页
watch(() => auth.isAuthenticated.value, (value) => {
  if (!value) router.push({ name: 'login' })
})

onMounted(async () => {
  theme.value = (localStorage.getItem('lumina-theme') as 'light' | null) ?? 'light'
  await Promise.all([loadModels(), workspace.loadSessions()])
  await nextTick()
})
</script>

<template>
  <div class="app-shell">
    <div v-if="sidebarOpen" class="mobile-backdrop" @click="sidebarOpen = false"></div>
    <Sidebar
      :sessions="sessions"
      :active-session-id="activeSessionId"
      :user="user"
      :mobile-open="sidebarOpen"
      :loading="isLoadingSessions"
      :loading-more="isLoadingMoreSessions"
      :has-more="hasMoreSessions"
      :error="sidebarError"
      @new-chat="newChat"
      @select="selectSession"
      @rename="(id, title) => void workspace.renameSession(id, title).catch((error) => notify(error instanceof Error ? error.message : '重命名失败'))"
      @pin="(id) => void workspace.togglePinned(id).catch((error) => notify(error instanceof Error ? error.message : '置顶操作失败'))"
      @delete="(id) => void workspace.deleteSession(id).catch((error) => notify(error instanceof Error ? error.message : '删除会话失败'))"
      @load-more="loadMoreSessions"
      @retry-load="retryLoadSessions"
      @close-mobile="sidebarOpen = false"
    />
    <main class="chat-main">
      <ChatHeader
        :title="activeTitle"
        :model="activeModel"
        :models="selectableModels"
        :model-disabled="isLoadingModels || isChangingModel || isGenerating"
        @menu="sidebarOpen = true"
        @settings="settingsOpen = true"
        @model-change="changeModel"
      />
      <div class="chat-content">
        <div v-if="isLoadingSessionDetail" class="chat-status">正在加载会话…</div>
        <div v-else-if="sessionDetailError" class="chat-status chat-status--error">
          <p>{{ sessionDetailError }}</p>
          <button type="button" @click="retrySessionDetail">重新加载</button>
        </div>
        <EmptyState v-else-if="!hasMessages" :suggestions="['帮我制定一个学习计划', '把这段文字改得更清晰', '解释一个我不懂的概念', '帮我写一个周末旅行计划']" @choose="chooseSuggestion" />
        <MessageList v-else :messages="messages" :generating="isGenerating" @copy="copyMessage" @retry="workspace.retry" @regenerate="workspace.regenerate" />
      </div>
      <Composer
        ref="composerRef"
        :generating="isGenerating"
        :submitting="isUploading"
        @submit="submitMessage"
        @invalid-files="notifyInvalidFiles"
        @stop="workspace.stopGeneration"
      />
    </main>
    <SettingsDrawer :open="settingsOpen" :theme="theme" :user="user" @close="settingsOpen = false" @theme="handleTheme" @logout="handleLogout" />
    <Transition name="toast"><div v-if="toast" class="toast"><span class="toast__dot"></span>{{ toast }}</div></Transition>
  </div>
</template>
