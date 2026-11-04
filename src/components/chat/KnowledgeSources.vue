<script setup lang="ts">
import type { KnowledgeSource } from '../../types/chat.js'

defineProps<{ sources: KnowledgeSource[] }>()
</script>

<template>
  <details class="knowledge-sources">
    <summary>参考来源（{{ sources.length }}）</summary>
    <article v-for="source in sources" :key="`${source.knowledgeBaseId}-${source.documentId}-${source.chunkId}`" class="knowledge-source">
      <div><strong>{{ source.title }}</strong><span>相关度 {{ Math.round(source.score * 100) }}% · #{{ source.rank }}</span></div>
      <p>{{ source.content }}</p>
    </article>
  </details>
</template>
