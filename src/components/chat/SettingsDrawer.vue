<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import type { User } from '../../types/chat'

const props = defineProps<{ open: boolean; theme: 'light' | 'dark'; user: User | null }>()
const emit = defineEmits<{ close: []; theme: [value: 'light' | 'dark']; logout: [] }>()

const displayName = computed(() => props.user?.nickname || props.user?.username || '用户')
const displayEmail = computed(() => props.user?.email || props.user?.phone || '未绑定邮箱')
const displayInitial = computed(() => (displayName.value.trim()[0] ?? 'U').toUpperCase())
</script>

<template>
  <Transition name="fade">
    <div v-if="open" class="settings-overlay" @click.self="emit('close')">
      <aside class="settings-drawer">
        <div class="settings-drawer__header"><div><p class="eyebrow">PREFERENCES</p><h2>设置</h2></div><button class="icon-button" aria-label="关闭设置" @click="emit('close')"><AppIcon name="close" /></button></div>
        <section class="settings-section"><p class="settings-label">外观主题</p><div class="theme-options"><button :class="{ active: theme === 'light' }" @click="emit('theme', 'light')"><AppIcon name="sun" size="17" />浅色</button><button :class="{ active: theme === 'dark' }" @click="emit('theme', 'dark')"><AppIcon name="moon" size="17" />深色</button></div></section>
        <section class="settings-section"><p class="settings-label">个人账户</p><div class="settings-account"><div class="avatar">{{ displayInitial }}</div><div><strong>{{ displayName }}</strong><span>{{ displayEmail }}</span></div><AppIcon name="chevron-right" size="16" /></div></section>
        <section class="settings-section"><p class="settings-label">关于</p><div class="settings-row"><span>版本</span><span class="muted">0.1.0</span></div><div class="settings-row"><span>快捷键</span><span class="muted">⌘ K</span></div></section>
        <div class="settings-drawer__footer"><button class="logout-button" @click="emit('logout')"><AppIcon name="logout" size="16" />退出登录</button></div>
      </aside>
    </div>
  </Transition>
</template>
