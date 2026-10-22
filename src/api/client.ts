import type { ApiResponse, LoginData } from '../types/chat.js'

const AUTH_STORAGE_KEY = 'ai-chat-auth'
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface AuthState {
  tokenName: string
  tokenValue: string
  user: LoginData['user']
}

export function getAuthState(): AuthState | null {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthState
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY)
    return null
  }
}

export function setAuthState(data: LoginData): AuthState {
  const state: AuthState = {
    tokenName: data.tokenName,
    tokenValue: data.tokenValue,
    user: data.user,
  }
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state))
  return state
}

export function clearAuthState() {
  localStorage.removeItem(AUTH_STORAGE_KEY)
}

async function parseResponse<T>(response: Response): Promise<T> {
  let payload: ApiResponse<T> | null = null
  try {
    payload = (await response.json()) as ApiResponse<T>
  } catch {
    throw new ApiError(response.status, 'INTERNAL_ERROR', '服务器返回了无法解析的响应')
  }

  if (!response.ok || !payload.success) {
    if (response.status === 401) clearAuthState()
    throw new ApiError(response.status, payload.code, payload.message)
  }
  return payload.data
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const auth = getAuthState()
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (auth) headers.set(auth.tokenName, auth.tokenValue)

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers })
  return parseResponse<T>(response)
}

export async function apiStream(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  const auth = getAuthState()
  const headers = new Headers({
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
  })
  if (auth) headers.set(auth.tokenName, auth.tokenValue)

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok) return parseResponse(response)
  return response
}
