import { apiRequest } from './client.js'
import type { LoginData, User } from '../types/chat.js'

export interface RegisterPayload {
  username: string
  password: string
  nickname?: string
  email?: string
  phone?: string
}

export const authApi = {
  login(username: string, password: string) {
    return apiRequest<LoginData>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
  },
  register(payload: RegisterPayload) {
    return apiRequest<User>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  me() {
    return apiRequest<User>('/api/auth/me')
  },
  logout() {
    return apiRequest<null>('/api/auth/logout', { method: 'POST' })
  },
}
