<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import { useAuth } from '../../composables/useAuth'
import { ApiError } from '../../api/client'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; registered: [username: string] }>()

const auth = useAuth()

const form = reactive({
  username: '',
  password: '',
  confirmPassword: '',
  nickname: '',
  email: '',
  phone: '',
})

const submitting = ref(false)
const error = ref('')

const USERNAME_RE = /^[A-Za-z0-9_]{3,50}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[0-9+\-\s]{5,20}$/

function validate(): string | null {
  if (!USERNAME_RE.test(form.username)) return '用户名需为 3-50 位字母、数字或下划线'
  if (form.password.length < 8) return '密码至少 8 位'
  if (form.password.length > 72) return '密码不能超过 72 位'
  if (form.password !== form.confirmPassword) return '两次输入的密码不一致'
  if (form.nickname && form.nickname.length > 50) return '昵称不能超过 50 个字符'
  if (form.email && !EMAIL_RE.test(form.email)) return '邮箱格式不正确'
  if (form.phone && !PHONE_RE.test(form.phone)) return '手机号格式不正确'
  return null
}

function reset() {
  Object.assign(form, { username: '', password: '', confirmPassword: '', nickname: '', email: '', phone: '' })
  error.value = ''
}

async function submit() {
  if (submitting.value) return
  const message = validate()
  if (message) {
    error.value = message
    return
  }
  submitting.value = true
  error.value = ''
  try {
    await auth.register({
      username: form.username.trim(),
      password: form.password,
      nickname: form.nickname.trim() || undefined,
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
    })
    emit('registered', form.username.trim())
    reset()
    emit('close')
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '注册失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}

// 关闭弹框时清空状态，避免下次打开残留旧数据
watch(() => props.open, (value) => {
  if (value) {
    reset()
  }
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="auth-modal-overlay" @click.self="emit('close')" @keydown="onKeydown">
        <div class="auth-modal" role="dialog" aria-modal="true" aria-label="注册">
          <div class="auth-modal__header">
            <div>
              <p class="eyebrow">JOIN LUMINA</p>
              <h2>创建账号</h2>
            </div>
            <button class="icon-button" aria-label="关闭注册" @click="emit('close')"><AppIcon name="close" /></button>
          </div>
          <p class="auth-modal__sub">注册后即可开始对话</p>

          <form class="auth-form" novalidate @submit.prevent="submit">
            <label class="auth-field">
              <span>用户名 <em>必填</em></span>
              <input v-model="form.username" type="text" autocomplete="username" placeholder="3-50 位字母、数字或下划线" />
            </label>
            <label class="auth-field">
              <span>密码 <em>必填</em></span>
              <input v-model="form.password" type="password" autocomplete="new-password" placeholder="至少 8 位" />
            </label>
            <label class="auth-field">
              <span>确认密码 <em>必填</em></span>
              <input v-model="form.confirmPassword" type="password" autocomplete="new-password" placeholder="再次输入密码" />
            </label>
            <label class="auth-field">
              <span>昵称 <em>可选</em></span>
              <input v-model="form.nickname" type="text" autocomplete="nickname" placeholder="如何称呼你" />
            </label>
            <label class="auth-field">
              <span>邮箱 <em>可选</em></span>
              <input v-model="form.email" type="email" autocomplete="email" placeholder="you@example.com" />
            </label>
            <label class="auth-field">
              <span>手机号 <em>可选</em></span>
              <input v-model="form.phone" type="tel" autocomplete="tel" placeholder="手机号码" />
            </label>

            <p v-if="error" class="auth-error">{{ error }}</p>

            <button class="auth-submit" type="submit" :disabled="submitting">
              <span v-if="!submitting">注册</span>
              <span v-else class="auth-loading">注册中…</span>
            </button>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
