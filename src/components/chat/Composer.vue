<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import AgentPicker from '../agent/AgentPicker.vue'
import KnowledgeBasePicker from './KnowledgeBasePicker.vue'
import ToolPicker from './ToolPicker.vue'
import { formatFileSize, selectChatAttachments } from '../../lib/chatAttachments.js'
import type { AgentSummary } from '../../types/agent.js'
import type { AvailableTool, KnowledgeBase } from '../../types/chat.js'

const props = withDefaults(defineProps<{
  generating: boolean
  submitting?: boolean
  knowledgeBases?: KnowledgeBase[]
  availableTools?: AvailableTool[]
  loadingTools?: boolean
  toolsError?: string | null
  agents?: AgentSummary[]
  selectedAgent?: AgentSummary | null
  agentLocked?: boolean
}>(), {
  submitting: false,
  knowledgeBases: () => [],
  availableTools: () => [],
  loadingTools: false,
  toolsError: null,
  agents: () => [],
  selectedAgent: null,
  agentLocked: false,
})

const emit = defineEmits<{
  submit: [payload: { content: string; files: File[]; knowledgeBaseIds: number[]; toolCodes: string[] }]
  stop: []
  invalidFiles: [messages: string[]]
  knowledgeLimit: [message: string]
  toolLimit: [message: string]
  agentChange: [agent: AgentSummary | null]
  manageAgents: []
  openKnowledgePicker: []
  openToolPicker: []
}>()

const value = ref('')
const files = ref<File[]>([])
const selectedKnowledgeBaseIds = ref<number[]>([])
const selectedToolCodes = ref<string[]>([])
const inputRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const canSubmit = computed(() => Boolean(value.value.trim() || files.value.length))
const selectedKnowledgeBases = computed(() => props.knowledgeBases.filter((base) => selectedKnowledgeBaseIds.value.includes(base.id)))
const selectedTools = computed(() => props.availableTools.filter((tool) => selectedToolCodes.value.includes(tool.toolCode)))

watch(() => props.agentLocked, (locked) => {
  if (!locked) return
  selectedKnowledgeBaseIds.value = []
  selectedToolCodes.value = []
})

function resize() {
  const input = inputRef.value
  if (!input) return
  input.style.height = 'auto'
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`
}

function chooseFiles() {
  fileInputRef.value?.click()
}

function addFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const selection = selectChatAttachments(files.value, Array.from(input.files ?? []))
  files.value = selection.files
  if (selection.errors.length) emit('invalidFiles', selection.errors)
  input.value = ''
}

function removeFile(index: number) {
  files.value.splice(index, 1)
}

function removeKnowledgeBase(id: number) {
  selectedKnowledgeBaseIds.value = selectedKnowledgeBaseIds.value.filter((item) => item !== id)
}

function removeTool(toolCode: string) {
  selectedToolCodes.value = selectedToolCodes.value.filter((item) => item !== toolCode)
}

function submit() {
  if (!canSubmit.value || props.submitting) return
  emit('submit', {
    content: value.value,
    files: [...files.value],
    knowledgeBaseIds: [...selectedKnowledgeBaseIds.value],
    toolCodes: [...selectedToolCodes.value],
  })
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    submit()
  }
}

function clear() {
  value.value = ''
  files.value = []
  selectedKnowledgeBaseIds.value = []
  selectedToolCodes.value = []
  void nextTick(resize)
}

defineExpose({
  fill: (text: string) => { value.value = text; void nextTick(resize); inputRef.value?.focus() },
  clear,
})
</script>

<template>
  <div class="composer-wrap">
    <div v-if="files.length" class="composer__attachments" aria-label="待发送附件">
      <div v-for="(file, index) in files" :key="`${file.name}-${file.size}-${index}`" class="attachment-chip">
        <AppIcon :name="file.type === 'application/pdf' ? 'file' : 'image'" size="16" />
        <span class="attachment-chip__details"><strong>{{ file.name }}</strong><small>{{ formatFileSize(file.size) }}</small></span>
        <button type="button" :disabled="generating || submitting" :aria-label="`移除附件 ${file.name}`" @click="removeFile(index)"><AppIcon name="close" size="14" /></button>
      </div>
    </div>
    <div v-if="selectedKnowledgeBases.length" class="composer__knowledge-chips" aria-label="已选知识库">
      <span v-for="base in selectedKnowledgeBases" :key="base.id" class="knowledge-chip"><AppIcon name="book" size="14" />{{ base.name }}<button type="button" :disabled="generating || submitting" :aria-label="`移除知识库 ${base.name}`" @click="removeKnowledgeBase(base.id)"><AppIcon name="close" size="12" /></button></span>
    </div>
    <div v-if="selectedTools.length" class="composer__tool-chips" aria-label="已选工具">
      <span v-for="tool in selectedTools" :key="tool.toolCode" class="tool-chip"><AppIcon name="tool" size="14" />{{ tool.toolName }}<button type="button" :disabled="generating || submitting" :aria-label="`移除工具 ${tool.toolName}`" @click="removeTool(tool.toolCode)"><AppIcon name="close" size="12" /></button></span>
    </div>
    <p v-if="agentLocked" class="composer__agent-lock" role="status">正在使用 Agent 配置；模型、知识库和工具由 Agent 固定。</p>
    <div class="composer">
      <textarea ref="inputRef" v-model="value" rows="1" placeholder="输入你的问题…" aria-label="输入消息" :disabled="generating || submitting" @input="resize" @keydown="handleKeydown"></textarea>
      <input ref="fileInputRef" class="composer__file-input" type="file" accept="image/jpeg,image/png,image/gif,application/pdf" multiple :disabled="generating || submitting" @change="addFiles">
      <div class="composer__bottom">
        <div class="composer__tools">
          <button type="button" class="composer-tool" :disabled="generating || submitting" aria-label="添加附件" @click="chooseFiles"><AppIcon name="paperclip" size="16" /><span>添加</span></button>
          <AgentPicker
            :agents="agents"
            :model-value="selectedAgent"
            :disabled="generating || submitting"
            @update:model-value="emit('agentChange', $event)"
            @manage="emit('manageAgents')"
          />
          <KnowledgeBasePicker
            v-model="selectedKnowledgeBaseIds"
            :bases="knowledgeBases"
            :disabled="generating || submitting || agentLocked"
            @limit="emit('knowledgeLimit', $event)"
            @open="emit('openKnowledgePicker')"
          />
          <ToolPicker
            v-model="selectedToolCodes"
            :tools="availableTools"
            :disabled="generating || submitting || agentLocked"
            :loading="loadingTools"
            :error="toolsError"
            @limit="emit('toolLimit', $event)"
            @open="emit('openToolPicker')"
          />
        </div>
        <div class="composer__actions">
          <span class="composer__hint">Shift + Enter 换行</span>
          <button v-if="generating" class="send-button send-button--stop" aria-label="停止生成" @click="emit('stop')"><AppIcon name="stop" size="17" /></button>
          <button v-else class="send-button" :aria-label="submitting ? '正在上传附件' : '发送消息'" :disabled="!canSubmit || submitting" @click="submit">
            <span v-if="submitting">…</span>
            <AppIcon v-else name="send" size="17" />
          </button>
        </div>
      </div>
    </div>
    <p class="composer-disclaimer">ice 可能会出错，请核对重要信息。</p>
  </div>
</template>
