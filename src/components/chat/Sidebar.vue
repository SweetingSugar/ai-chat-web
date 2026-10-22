<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import type { ChatSession, User } from '../../types/chat'

const props = defineProps<{
  sessions: ChatSession[]
  activeSessionId: number | null
  user: User | null
  mobileOpen?: boolean
}>()

const displayName = computed(() => props.user?.nickname || props.user?.username || '用户')
const displayInitial = computed(() => (displayName.value.trim()[0] ?? 'U').toUpperCase())

const emit = defineEmits<{
  newChat: []
  select: [id: number]
  rename: [id: number, title: string]
  pin: [id: number]
  delete: [id: number]
  closeMobile: []
}>()

const query = ref('')
const editingId = ref<number | null>(null)
const editingTitle = ref('')
const openMenuId = ref<number | null>(null)

const filteredSessions = computed(() => {
  const value = query.value.trim().toLowerCase()
  if (!value) return props.sessions
  return props.sessions.filter((session) => session.title.toLowerCase().includes(value))
})

function startRename(session: ChatSession) {
  editingId.value = session.id
  editingTitle.value = session.title
  openMenuId.value = null
}

function saveRename() {
  if (editingId.value !== null && editingTitle.value.trim()) emit('rename', editingId.value, editingTitle.value)
  editingId.value = null
}

function confirmDelete(session: ChatSession) {
  openMenuId.value = null
  if (window.confirm(`确定删除“${session.title}”吗？`)) emit('delete', session.id)
}

function closeMenu() {
  openMenuId.value = null
}

onMounted(() => document.addEventListener('click', closeMenu))
onBeforeUnmount(() => document.removeEventListener('click', closeMenu))
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar--mobile-open': mobileOpen }">
    <div class="sidebar__topline">
      <div class="brand-lockup">
        <div class="brand-mark">✦</div>
        <span>ice</span>
      </div>
      <button class="icon-button sidebar__close" aria-label="关闭会话导航" @click="emit('closeMobile')">
        <AppIcon name="close" />
      </button>
    </div>

    <button class="new-chat-button" @click="emit('newChat')">
      <span class="new-chat-button__icon"><AppIcon name="plus" size="16" /></span>
      <span>新建对话</span>
      <span class="new-chat-button__shortcut">⌘ K</span>
    </button>

    <label class="search-box">
      <AppIcon name="search" size="16" />
      <input v-model="query" type="search" placeholder="搜索会话" aria-label="搜索会话" />
      <kbd>/</kbd>
    </label>

    <div class="sidebar__section-label"><span>你的对话</span><span class="sidebar__count">{{ sessions.length }}</span></div>

    <div class="conversation-list" role="list">
      <div v-if="filteredSessions.length === 0" class="conversation-empty">没有找到匹配的会话</div>
      <div
        v-for="session in filteredSessions"
        :key="session.id"
        class="conversation-item"
        :class="{ 'conversation-item--active': activeSessionId === session.id }"
        role="listitem"
        @click="emit('select', session.id); emit('closeMobile')"
      >
        <div class="conversation-item__main">
          <AppIcon name="chevron-right" size="14" class="conversation-item__chevron" />
          <form v-if="editingId === session.id" @submit.prevent="saveRename">
            <input v-model="editingTitle" class="rename-input" autofocus @keyup.esc="editingId = null" @blur="saveRename" />
          </form>
          <span v-else class="conversation-item__title">{{ session.title }}</span>
          <span v-if="session.pinned" class="pin-indicator"><AppIcon name="star" size="12" /></span>
        </div>
        <button class="conversation-item__more" aria-label="会话操作" @click.stop="openMenuId = openMenuId === session.id ? null : session.id">
          <AppIcon name="more" size="16" />
        </button>
        <div v-if="openMenuId === session.id" class="conversation-menu" @click.stop>
          <button @click="startRename(session)"><AppIcon name="edit" size="15" />重命名</button>
          <button @click="emit('pin', session.id); openMenuId = null"><AppIcon name="star" size="15" />{{ session.pinned ? '取消置顶' : '置顶会话' }}</button>
          <button class="conversation-menu__danger" @click="confirmDelete(session)"><AppIcon name="trash" size="15" />删除会话</button>
        </div>
      </div>
    </div>

    <div class="sidebar__footer">
      <div class="usage-card">
        <div class="usage-card__row"><span>本月使用情况</span><span>32%</span></div>
        <div class="usage-card__track"><span style="width: 32%"></span></div>
        <p>继续探索，让想法变得更清晰。</p>
      </div>
      <div class="profile-mini">
        <div class="avatar avatar--small">{{ displayInitial }}</div>
        <div><strong>{{ displayName }}</strong><span>个人工作区</span></div>
        <AppIcon name="more" size="16" />
      </div>
    </div>
  </aside>
</template>
