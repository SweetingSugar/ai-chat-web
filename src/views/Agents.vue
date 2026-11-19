<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import WorkspaceSidebar from '../components/layout/WorkspaceSidebar.vue'
import SettingsDrawer from '../components/chat/SettingsDrawer.vue'
import AgentFormDialog from '../components/agent/AgentFormDialog.vue'
import AgentList from '../components/agent/AgentList.vue'
import { chatApi } from '../api/chat.js'
import { knowledgeApi } from '../api/knowledge.js'
import { useAuth } from '../composables/useAuth.js'
import { createAgentWorkspace } from '../composables/useAgentWorkspace.js'
import type { Agent, AgentUpsertRequest } from '../types/agent.js'
import type { AvailableTool, KnowledgeBase, ModelSummary } from '../types/chat.js'

const router = useRouter()
const auth = useAuth()
const workspace = createAgentWorkspace()
const user = auth.user

const sidebarOpen = ref(false)
const settingsOpen = ref(false)
const formOpen = ref(false)
const editingAgent = ref<Agent | null>(null)
const models = ref<ModelSummary[]>([])
const knowledgeBases = ref<KnowledgeBase[]>([])
const availableTools = ref<AvailableTool[]>([])
const resourcesLoading = ref(false)
const resourcesError = ref<string | null>(null)
const theme = ref<'light' | 'dark'>('light')
const toast = ref('')
let toastTimer: number | undefined

function notify(message: string) {
  toast.value = message
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toast.value = '' }, 2400)
}

function handleTheme(value: 'light' | 'dark') {
  theme.value = value
  localStorage.setItem('lumina-theme', value)
}

function handleLogout() {
  void auth.logout().then(() => router.push({ name: 'login' }))
}

async function loadAgents() {
  try {
    await workspace.loadAgents()
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Agent 加载失败，请重试')
  }
}

async function loadMore() {
  try {
    await workspace.loadMoreAgents()
  } catch (error) {
    notify(error instanceof Error ? error.message : '加载更多 Agent 失败，请重试')
  }
}

async function loadFormResources() {
  resourcesLoading.value = true
  resourcesError.value = null
  try {
    const [nextModels, bases, tools] = await Promise.all([
      chatApi.listModels(),
      knowledgeApi.list(1, 100),
      chatApi.listAvailableTools(),
    ])
    models.value = nextModels
    knowledgeBases.value = bases.records
    availableTools.value = tools
  } catch (error) {
    resourcesError.value = error instanceof Error ? error.message : '可用资源加载失败，请重试'
  } finally {
    resourcesLoading.value = false
  }
}

function openCreate() {
  editingAgent.value = null
  formOpen.value = true
  void loadFormResources()
}

function openEdit(agent: Agent) {
  editingAgent.value = { ...agent, knowledgeBaseIds: [...agent.knowledgeBaseIds], toolCodes: [...agent.toolCodes] }
  formOpen.value = true
  void loadFormResources()
}

async function submitAgent(payload: AgentUpsertRequest) {
  try {
    if (editingAgent.value) {
      await workspace.updateAgent(editingAgent.value.id, payload)
      notify('Agent 已更新')
    } else {
      await workspace.createAgent(payload)
      notify('Agent 已创建')
    }
    formOpen.value = false
  } catch (error) {
    notify(error instanceof Error ? error.message : '保存 Agent 失败，请重试')
  }
}

async function toggleStatus(agent: Agent) {
  const nextStatus = agent.status === 1 ? 0 : 1
  try {
    await workspace.updateStatus(agent.id, nextStatus)
    notify(nextStatus === 1 ? 'Agent 已启用' : 'Agent 已停用')
  } catch (error) {
    notify(error instanceof Error ? error.message : '更新 Agent 状态失败，请重试')
  }
}

async function deleteAgent(agent: Agent) {
  if (!window.confirm(`确定删除 Agent“${agent.name}”吗？`)) return
  try {
    await workspace.deleteAgent(agent.id)
    notify('Agent 已删除')
  } catch (error) {
    notify(error instanceof Error ? error.message : '删除 Agent 失败，请重试')
  }
}

watch(theme, (value) => { document.documentElement.dataset.theme = value })
watch(() => auth.isAuthenticated.value, (value) => {
  if (!value) router.push({ name: 'login' })
})

onMounted(() => {
  theme.value = (localStorage.getItem('lumina-theme') as 'light' | null) ?? 'light'
  void loadAgents()
})
</script>

<template>
  <div class="app-shell">
    <div v-if="sidebarOpen" class="mobile-backdrop" @click="sidebarOpen = false"></div>
    <WorkspaceSidebar :user="user" :mobile-open="sidebarOpen" @close-mobile="sidebarOpen = false" />

    <main class="agent-main">
      <header class="agent-mobile-header">
        <button class="icon-button" aria-label="打开导航" @click="sidebarOpen = true"><span>☰</span></button>
        <span>Agent</span>
        <button class="icon-button" aria-label="打开设置" @click="settingsOpen = true">⚙</button>
      </header>
      <AgentList
        :agents="workspace.agents.value"
        :models="models"
        :loading="workspace.isLoadingAgents.value"
        :loading-more="workspace.isLoadingMoreAgents.value"
        :error="workspace.agentsError.value"
        :has-more="workspace.hasMoreAgents.value"
        @create="openCreate"
        @edit="openEdit"
        @toggle-status="toggleStatus"
        @delete="deleteAgent"
        @load-more="loadMore"
        @retry="loadAgents"
      />
    </main>

    <SettingsDrawer :open="settingsOpen" :theme="theme" :user="user" @close="settingsOpen = false" @theme="handleTheme" @logout="handleLogout" />
    <AgentFormDialog
      :open="formOpen"
      :agent="editingAgent"
      :models="models"
      :knowledge-bases="knowledgeBases"
      :tools="availableTools"
      :submitting="workspace.isMutating.value"
      :resources-loading="resourcesLoading"
      :resources-error="resourcesError"
      @close="formOpen = false"
      @submit="submitAgent"
      @limit="notify"
      @retry-resources="loadFormResources"
    />
    <Transition name="toast"><div v-if="toast" class="toast"><span class="toast__dot"></span>{{ toast }}</div></Transition>
  </div>
</template>
