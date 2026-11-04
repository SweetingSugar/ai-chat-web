<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import WorkspaceSidebar from '../components/layout/WorkspaceSidebar.vue'
import KnowledgeBaseDetail from '../components/knowledge/KnowledgeBaseDetail.vue'
import KnowledgeBaseFormDialog from '../components/knowledge/KnowledgeBaseFormDialog.vue'
import KnowledgeBaseList from '../components/knowledge/KnowledgeBaseList.vue'
import TextDocumentDialog from '../components/knowledge/TextDocumentDialog.vue'
import SettingsDrawer from '../components/chat/SettingsDrawer.vue'
import { knowledgeApi } from '../api/knowledge.js'
import { useAuth } from '../composables/useAuth.js'
import { createKnowledgeBaseWorkspace } from '../composables/useKnowledgeBaseWorkspace.js'
import type { EmbeddingModel, KnowledgeBase } from '../types/chat.js'

const router = useRouter()
const route = useRoute()
const auth = useAuth()
const workspace = createKnowledgeBaseWorkspace()
const user = auth.user

const sidebarOpen = ref(false)
const settingsOpen = ref(false)
const formOpen = ref(false)
const textFormOpen = ref(false)
const editingBase = ref<KnowledgeBase | null>(null)
const models = ref<EmbeddingModel[]>([])
const theme = ref<'light' | 'dark'>('light')
const toast = ref('')
let toastTimer: number | undefined

const routeBaseId = computed(() => {
  const raw = route.params.id
  const value = typeof raw === 'string' ? Number(raw) : Number.NaN
  return Number.isSafeInteger(value) && value > 0 ? value : null
})

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

async function loadModels() {
  try {
    models.value = await knowledgeApi.listEmbeddingModels()
  } catch (error) {
    models.value = []
    notify(error instanceof Error ? error.message : '嵌入模型加载失败，请重试')
  }
}

async function loadBases() {
  try {
    await workspace.loadBases()
  } catch (error) {
    notify(error instanceof Error ? error.message : '知识库加载失败，请重试')
  }
}

async function syncRoute() {
  if (routeBaseId.value === null) {
    workspace.selectedBase.value = null
    workspace.documents.value = []
    return
  }
  try {
    await workspace.openBase(routeBaseId.value)
  } catch (error) {
    notify(error instanceof Error ? error.message : '知识库详情加载失败，请重试')
  }
}

function openCreate() {
  editingBase.value = null
  formOpen.value = true
}

function openEdit() {
  editingBase.value = workspace.selectedBase.value
  formOpen.value = true
}

async function submitBase(payload: { name: string; description?: string; embeddingModelId: number }) {
  try {
    if (editingBase.value) {
      const updated = await workspace.updateBase({ name: payload.name, description: payload.description })
      if (updated && updated.embeddingModelId !== payload.embeddingModelId) await workspace.changeEmbeddingModel(payload.embeddingModelId)
      notify('知识库已更新')
    } else {
      const created = await workspace.createBase(payload)
      if (created) {
        await router.push({ name: 'knowledge-base-detail', params: { id: created.id } })
        notify('知识库已创建')
      }
    }
    formOpen.value = false
  } catch (error) {
    notify(error instanceof Error ? error.message : '保存知识库失败，请重试')
  }
}

async function deleteBase() {
  try {
    await workspace.deleteBase()
    await router.push({ name: 'knowledge-bases' })
    notify('知识库已删除')
  } catch (error) {
    notify(error instanceof Error ? error.message : '删除知识库失败，请重试')
  }
}

async function addTextDocument(payload: { title: string; content: string }) {
  try {
    await workspace.addTextDocument(payload)
    textFormOpen.value = false
    notify('文档已添加，正在建立索引')
  } catch (error) {
    notify(error instanceof Error ? error.message : '添加文档失败，请重试')
  }
}

async function uploadDocument(file: File) {
  try {
    await workspace.uploadDocument(file)
    notify('文件已上传，正在建立索引')
  } catch (error) {
    notify(error instanceof Error ? error.message : '上传文件失败，请重试')
  }
}

async function deleteDocument(id: number) {
  try {
    await workspace.deleteDocument(id)
    notify('文档已删除')
  } catch (error) {
    notify(error instanceof Error ? error.message : '删除文档失败，请重试')
  }
}

async function retryDocument(id: number) {
  try {
    await workspace.retryDocument(id)
    notify('已重新提交文档处理')
  } catch (error) {
    notify(error instanceof Error ? error.message : '重试文档失败，请重试')
  }
}

watch(theme, (value) => {
  document.documentElement.dataset.theme = value
})

watch(() => auth.isAuthenticated.value, (value) => {
  if (!value) router.push({ name: 'login' })
})

watch(routeBaseId, () => { void syncRoute() }, { immediate: true })

onMounted(async () => {
  theme.value = (localStorage.getItem('lumina-theme') as 'light' | null) ?? 'light'
  await Promise.all([loadBases(), loadModels()])
})
</script>

<template>
  <div class="app-shell">
    <div v-if="sidebarOpen" class="mobile-backdrop" @click="sidebarOpen = false"></div>
    <WorkspaceSidebar :user="user" :mobile-open="sidebarOpen" @close-mobile="sidebarOpen = false" />

    <main class="knowledge-main">
      <header class="knowledge-mobile-header">
        <button class="icon-button" aria-label="打开导航" @click="sidebarOpen = true"><span>☰</span></button>
        <span>知识库</span>
        <button class="icon-button" aria-label="打开设置" @click="settingsOpen = true">⚙</button>
      </header>
      <div v-if="routeBaseId !== null && workspace.isLoadingDetail.value" class="knowledge-status knowledge-status--full">正在加载知识库…</div>
      <KnowledgeBaseDetail
        v-else-if="routeBaseId !== null && workspace.selectedBase.value"
        :base="workspace.selectedBase.value"
        :documents="workspace.documents.value"
        :loading="workspace.isLoadingDocuments.value"
        :loading-more="workspace.isLoadingMoreDocuments.value"
        :error="workspace.documentsError.value"
        :has-more="workspace.hasMoreDocuments.value"
        :mutating="workspace.isMutating.value"
        @back="router.push({ name: 'knowledge-bases' })"
        @edit="openEdit"
        @delete-base="deleteBase"
        @add-text="textFormOpen = true"
        @upload="uploadDocument"
        @delete-document="deleteDocument"
        @retry-document="retryDocument"
        @load-more="workspace.selectedBase.value && workspace.loadDocuments(workspace.selectedBase.value.id, false).catch((error) => notify(error instanceof Error ? error.message : '加载更多文档失败'))"
        @retry="workspace.selectedBase.value && workspace.loadDocuments(workspace.selectedBase.value.id).catch((error) => notify(error instanceof Error ? error.message : '加载文档失败'))"
      />
      <KnowledgeBaseList
        v-else
        :bases="workspace.bases.value"
        :loading="workspace.isLoadingBases.value"
        :loading-more="workspace.isLoadingMoreBases.value"
        :error="workspace.basesError.value"
        :has-more="workspace.hasMoreBases.value"
        @create="openCreate"
        @open="(id) => router.push({ name: 'knowledge-base-detail', params: { id } })"
        @load-more="workspace.loadMoreBases().catch((error) => notify(error instanceof Error ? error.message : '加载更多知识库失败'))"
        @retry="loadBases"
      />
    </main>

    <SettingsDrawer :open="settingsOpen" :theme="theme" :user="user" @close="settingsOpen = false" @theme="handleTheme" @logout="handleLogout" />
    <KnowledgeBaseFormDialog :open="formOpen" :base="editingBase" :models="models" :submitting="workspace.isMutating.value" @close="formOpen = false" @submit="submitBase" />
    <TextDocumentDialog :open="textFormOpen" :submitting="workspace.isMutating.value" @close="textFormOpen = false" @submit="addTextDocument" />
    <Transition name="toast"><div v-if="toast" class="toast"><span class="toast__dot"></span>{{ toast }}</div></Transition>
  </div>
</template>
