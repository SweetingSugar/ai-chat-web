import { readonly, ref } from 'vue'
import { authApi, type RegisterPayload } from '../api/auth'
import { ApiError, clearAuthState, getAuthState, setAuthState } from '../api/client'
import type { User } from '../types/chat'

// 会话是否有效的响应式标志。基于 localStorage 的 getAuthState() 不是响应式的，
// 因此用 authenticated 这一可控 ref 作为单一真相来源，供模板/守卫/ watcher 依赖。
const user = ref<User | null>(null)
const authenticated = ref(!!getAuthState())

function syncAuth() {
  authenticated.value = !!getAuthState()
}

const isAuthenticated = readonly(authenticated)

async function login(username: string, password: string): Promise<User> {
  const data = await authApi.login(username, password)
  setAuthState(data)
  user.value = data.user
  syncAuth()
  return data.user
}

async function register(payload: RegisterPayload): Promise<User> {
  return authApi.register(payload)
}

async function logout(): Promise<void> {
  try {
    await authApi.logout()
  } catch {
    // 即使登出接口失败也要清理本地登录态
  }
  clearAuthState()
  user.value = null
  syncAuth()
}

/** 启动时有已保存的 token 时调用，校验会话并刷新用户信息；401 由 client 自动清态。 */
async function hydrate(): Promise<void> {
  if (!getAuthState()) return
  try {
    user.value = await authApi.me()
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      user.value = null
      syncAuth()
    }
    // 其他网络/服务端错误：保留已存 token，不登出，用户信息待下次成功刷新
  }
}

export function useAuth() {
  return {
    user: readonly(user),
    isAuthenticated,
    login,
    register,
    logout,
    hydrate,
  }
}
