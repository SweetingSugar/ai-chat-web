<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import { toggleAgentKnowledgeBase, toggleAgentTool } from '../../lib/agentSelection.js'
import type { Agent, AgentUpsertRequest } from '../../types/agent.js'
import type { AvailableTool, KnowledgeBase, ModelSummary } from '../../types/chat.js'

const props = withDefaults(defineProps<{
  open: boolean
  agent?: Agent | null
  models: ModelSummary[]
  knowledgeBases: KnowledgeBase[]
  tools: AvailableTool[]
  submitting?: boolean
  resourcesLoading?: boolean
  resourcesError?: string | null
}>(), {
  agent: null,
  submitting: false,
  resourcesLoading: false,
  resourcesError: null,
})

const emit = defineEmits<{
  close: []
  submit: [payload: AgentUpsertRequest]
  limit: [message: string]
  retryResources: []
}>()

const name = ref('')
const description = ref('')
const systemPrompt = ref('')
const modelId = ref<number | null>(null)
const knowledgeBaseIds = ref<number[]>([])
const toolCodes = ref<string[]>([])
const isEditing = computed(() => props.agent !== null)
const title = computed(() => isEditing.value ? '编辑 Agent' : '新建 Agent')
const canSubmit = computed(() => Boolean(
  name.value.trim()
  && systemPrompt.value.trim()
  && modelId.value !== null
  && !props.submitting
  && !props.resourcesLoading,
))

function reset() {
  name.value = props.agent?.name ?? ''
  description.value = props.agent?.description ?? ''
  systemPrompt.value = props.agent?.systemPrompt ?? ''
  modelId.value = props.agent?.modelId ?? props.models[0]?.id ?? null
  knowledgeBaseIds.value = [...(props.agent?.knowledgeBaseIds ?? [])]
  toolCodes.value = [...(props.agent?.toolCodes ?? [])]
}

function close() {
  if (!props.submitting) emit('close')
}

function toggleKnowledgeBase(id: number) {
  const result = toggleAgentKnowledgeBase(knowledgeBaseIds.value, id)
  knowledgeBaseIds.value = result.ids
  if (result.error) emit('limit', result.error)
}

function toggleTool(toolCode: string) {
  const result = toggleAgentTool(toolCodes.value, toolCode)
  toolCodes.value = result.toolCodes
  if (result.error) emit('limit', result.error)
}

function submit() {
  if (!canSubmit.value || modelId.value === null) return
  emit('submit', {
    name: name.value.trim(),
    description: description.value.trim() || undefined,
    systemPrompt: systemPrompt.value.trim(),
    modelId: modelId.value,
    knowledgeBaseIds: [...knowledgeBaseIds.value],
    toolCodes: [...toolCodes.value],
  })
}

watch(() => [props.open, props.agent, props.models, props.knowledgeBases, props.tools] as const, () => {
  if (props.open) reset()
}, { immediate: true, deep: true })
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="auth-modal-overlay" role="presentation" @click.self="close">
      <form class="auth-modal agent-form" role="dialog" aria-modal="true" :aria-label="title" @submit.prevent="submit">
        <div class="auth-modal__header">
          <div><p class="eyebrow">个人工作区</p><h2>{{ title }}</h2></div>
          <button class="icon-button" type="button" :disabled="submitting" aria-label="关闭" @click="close"><AppIcon name="close" /></button>
        </div>
        <p class="auth-modal__sub">配置这个 Agent 的行为方式和可调用资源。</p>

        <div v-if="resourcesError" class="auth-error">
          {{ resourcesError }} <button type="button" @click="emit('retryResources')">重试</button>
        </div>
        <div v-else-if="resourcesLoading" class="knowledge-status agent-form__loading">正在加载可用资源…</div>

        <template v-else>
          <label class="auth-field"><span>名称</span><input v-model="name" maxlength="100" required placeholder="例如：售后助手" :disabled="submitting" /></label>
          <label class="auth-field"><span>描述 <em>可选</em></span><textarea v-model="description" maxlength="1000" rows="2" placeholder="说明 Agent 的用途" :disabled="submitting"></textarea></label>
          <label class="auth-field"><span>系统提示词</span><textarea v-model="systemPrompt" maxlength="10000" rows="5" required placeholder="定义 Agent 的角色、目标和约束" :disabled="submitting"></textarea></label>
          <label class="auth-field">
            <span>模型</span>
            <select v-model="modelId" required :disabled="submitting || models.length === 0">
              <option :value="null" disabled>{{ models.length ? '请选择模型' : '暂无可用模型' }}</option>
              <option v-for="model in models" :key="model.id" :value="model.id">{{ model.modelName }} · {{ model.providerName }}</option>
            </select>
          </label>
          <fieldset class="agent-form__fieldset">
            <legend>知识库 <em>最多 10 个</em></legend>
            <div class="agent-form__choices">
              <label v-for="base in knowledgeBases" :key="base.id" class="agent-form__choice"><input :checked="knowledgeBaseIds.includes(base.id)" type="checkbox" :disabled="submitting" @change="toggleKnowledgeBase(base.id)" /><span>{{ base.name }}</span></label>
              <p v-if="knowledgeBases.length === 0">暂无可用知识库</p>
            </div>
          </fieldset>
          <fieldset class="agent-form__fieldset">
            <legend>工具 <em>最多 20 个</em></legend>
            <div class="agent-form__choices">
              <label v-for="tool in tools" :key="tool.toolCode" class="agent-form__choice"><input :checked="toolCodes.includes(tool.toolCode)" type="checkbox" :disabled="submitting" @change="toggleTool(tool.toolCode)" /><span>{{ tool.toolName }} <small>{{ tool.toolCode }}</small></span></label>
              <p v-if="tools.length === 0">暂无可用工具</p>
            </div>
          </fieldset>
        </template>

        <div class="form-actions">
          <button type="button" class="form-button form-button--secondary" :disabled="submitting" @click="close">取消</button>
          <button type="submit" class="form-button" :disabled="!canSubmit">{{ submitting ? '正在保存…' : '保存' }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
