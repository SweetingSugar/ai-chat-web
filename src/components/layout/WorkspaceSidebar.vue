<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '../common/AppIcon.vue'
import type { User } from '../../types/chat'

const props = withDefaults(defineProps<{
  user: User | null
  mobileOpen?: boolean
}>(), {
  mobileOpen: false,
})

const emit = defineEmits<{ closeMobile: [] }>()

const displayName = computed(() => props.user?.nickname || props.user?.username || '用户')
const displayInitial = computed(() => (displayName.value.trim()[0] ?? 'U').toUpperCase())
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar--mobile-open': mobileOpen }">
    <div class="sidebar__topline">
      <div class="brand-lockup">
        <div class="brand-mark">✦</div>
        <span>ice</span>
      </div>
      <button class="icon-button sidebar__close" aria-label="关闭导航" @click="emit('closeMobile')">
        <AppIcon name="close" />
      </button>
    </div>

    <slot name="actions" />

    <nav class="workspace-nav" aria-label="工作区导航">
      <RouterLink class="workspace-nav__item" active-class="workspace-nav__item--active" :to="{ name: 'chat' }" @click="emit('closeMobile')">
        <AppIcon name="send" size="16" />
        <span>对话</span>
      </RouterLink>
      <RouterLink class="workspace-nav__item" active-class="workspace-nav__item--active" :to="{ name: 'knowledge-bases' }" @click="emit('closeMobile')">
        <AppIcon name="book" size="16" />
        <span>知识库</span>
      </RouterLink>
    </nav>

    <slot />

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
