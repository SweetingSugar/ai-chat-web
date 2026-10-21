<script setup lang="ts">
import AppIcon from '../common/AppIcon.vue'

defineProps<{ suggestions: string[] }>()
const emit = defineEmits<{ choose: [value: string] }>()
</script>

<template>
  <section class="empty-state">
    <div class="empty-state__orb"><span></span><span></span><span></span></div>
    <p class="eyebrow">LUMINA AI</p>
    <h2>今天想聊点什么？</h2>
    <p class="empty-state__intro">从一个问题开始，把模糊的想法变成清晰的答案。</p>
    <div class="suggestion-grid">
      <button v-for="suggestion in suggestions" :key="suggestion" class="suggestion-card" @click="emit('choose', suggestion)">
        <span>{{ suggestion }}</span><AppIcon name="chevron-right" size="14" />
      </button>
    </div>
  </section>
</template>

