<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '../components/common/AppIcon.vue'
import RegisterModal from '../components/auth/RegisterModal.vue'
import { useAuth } from '../composables/useAuth'
import { ApiError } from '../api/client'

const router = useRouter()
const route = useRoute()
const auth = useAuth()

const form = reactive({ username: '', password: '' })

const submitting = ref(false)
const error = ref('')
const toast = ref('')
const registerOpen = ref(false)
let toastTimer: number | undefined

async function submit() {
  if (submitting.value) return
  if (!form.username.trim()) {
    error.value = '请输入用户名'
    return
  }
  if (!form.password) {
    error.value = '请输入密码'
    return
  }
  submitting.value = true
  error.value = ''
  try {
    await auth.login(form.username.trim(), form.password)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/chat'
    await router.push(redirect)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '登录失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}

function notify(message: string) {
  toast.value = message
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toast.value = '' }, 2400)
}

function onRegistered(username: string) {
  form.username = username
  form.password = ''
  error.value = ''
  notify('注册成功，请登录')
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-brand">
        <div class="brand-mark">✦</div>
        <span>ice</span>
      </div>
      <p class="eyebrow">WELCOME BACK</p>
      <h1>登录</h1>
      <p class="auth-intro">登录后继续你的 AI 对话</p>

      <form class="auth-form" novalidate @submit.prevent="submit">
        <label class="auth-field">
          <span>用户名</span>
          <input v-model="form.username" type="text" autocomplete="username" placeholder="请输入用户名" autofocus />
        </label>
        <label class="auth-field">
          <span>密码</span>
          <input v-model="form.password" type="password" autocomplete="current-password" placeholder="请输入密码" />
        </label>

        <p v-if="error" class="auth-error">{{ error }}</p>

        <button class="auth-submit" type="submit" :disabled="submitting">
          <span v-if="!submitting">登录</span>
          <span v-else class="auth-loading">登录中…</span>
        </button>
      </form>

      <p class="auth-switch">
        还没有账号？
        <button type="button" @click="registerOpen = true">去注册</button>
      </p>
    </div>

    <RegisterModal :open="registerOpen" @close="registerOpen = false" @registered="onRegistered" />

    <Transition name="toast"><div v-if="toast" class="toast"><span class="toast__dot"></span>{{ toast }}</div></Transition>
  </div>
</template>
