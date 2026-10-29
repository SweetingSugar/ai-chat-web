<script setup lang="ts">
withDefaults(defineProps<{
  name: string
  size?: number | string
}>(), { size: 18 })
</script>

<template>
  <svg class="app-icon" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-if="name === 'plus'" d="M12 5v14M5 12h14" />
    <path v-else-if="name === 'search'" d="m20 20-4.4-4.4m2.4-5.1a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" />
    <path v-else-if="name === 'menu'" d="M4 6h16M4 12h16M4 18h16" />
    <path v-else-if="name === 'chevron-down'" d="m6 9 6 6 6-6" />
    <path v-else-if="name === 'chevron-right'" d="m9 6 6 6-6 6" />
    <path v-else-if="name === 'star'" d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
    <path v-else-if="name === 'more'" d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3" />
    <path v-else-if="name === 'settings'" d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8 3.5-1.8-.6a6.6 6.6 0 0 0-.5-1.3l.8-1.7-1.8-1.8-1.7.8a6.6 6.6 0 0 0-1.3-.5L13 5h-2l-.6 1.8a6.6 6.6 0 0 0-1.3.5l-1.7-.8-1.8 1.8.8 1.7a6.6 6.6 0 0 0-.5 1.3L4 12v2l1.9.6c.1.5.3.9.5 1.3l-.8 1.7 1.8 1.8 1.7-.8c.4.2.9.4 1.3.5L11 21h2l.6-1.9c.5-.1.9-.3 1.3-.5l1.7.8 1.8-1.8-.8-1.7c.2-.4.4-.9.5-1.3L20 14v-2Z" />
    <path v-else-if="name === 'copy'" d="M8 8V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3M6 8h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" />
    <path v-else-if="name === 'refresh'" d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4" />
    <path v-else-if="name === 'thumb-up'" d="M7 10v10H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3Zm0 10h9.2a2 2 0 0 0 1.9-1.4l1.8-6A2 2 0 0 0 18 10h-4V6a3 3 0 0 0-3-3l-4 7v10Z" />
    <path v-else-if="name === 'thumb-down'" d="M7 14V4H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3Zm0-10h9.2a2 2 0 0 1 1.9 1.4l1.8 6A2 2 0 0 1 18 14h-4v4a3 3 0 0 1-3 3l-4-7V4Z" />
    <path v-else-if="name === 'paperclip'" d="m21.4 11.6-8.5 8.5a5 5 0 0 1-7.1-7.1l9.2-9.2a3.5 3.5 0 0 1 5 5L10.7 18a2 2 0 0 1-2.8-2.8l8.5-8.5" />
    <path v-else-if="name === 'file'" d="M6 3h8l4 4v14H6zM14 3v5h5M9 13h6M9 17h4" />
    <path v-else-if="name === 'image'" d="M4 5h16v14H4zM7 16l3.5-4 2.5 3 2-2 2 3M8 9h.01" />
    <path v-else-if="name === 'send'" d="m4 4 16 8-16 8 3-8-3-8Zm3 8h13" />
    <path v-else-if="name === 'stop'" d="M7 7h10v10H7z" />
    <path v-else-if="name === 'edit'" d="m4 20 4.2-1 9.7-9.7a2.1 2.1 0 0 0-3-3L5.2 16 4 20Zm9.9-12.8 3 3" />
    <path v-else-if="name === 'trash'" d="M5 7h14M10 11v5M14 11v5M9 7V4h6v3m-9 0 1 13h10l1-13" />
    <path v-else-if="name === 'close'" d="m6 6 12 12M18 6 6 18" />
    <path v-else-if="name === 'sun'" d="M12 4V2m0 20v-2M4 12H2m20 0h-2M5.6 5.6 4.2 4.2m15.6 15.6-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
    <path v-else-if="name === 'moon'" d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z" />
    <path v-else-if="name === 'lock'" d="M6 10h12v10H6zM8 10V7a4 4 0 0 1 8 0v3" />
    <path v-else-if="name === 'logout'" d="M10 17H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4m5 7 4-4-4-4m4 4H9" />
    <path v-else d="M12 3a9 9 0 1 0 9 9" />
  </svg>
</template>
