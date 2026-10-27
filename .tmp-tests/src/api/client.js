const AUTH_STORAGE_KEY = 'ai-chat-auth';
const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
export class ApiError extends Error {
    status;
    code;
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
        this.name = 'ApiError';
    }
}
export function getAuthState() {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        return null;
    }
}
export function setAuthState(data) {
    const state = {
        tokenName: data.tokenName,
        tokenValue: data.tokenValue,
        user: data.user,
    };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));
    return state;
}
export function clearAuthState() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
}
async function parseResponse(response) {
    let payload = null;
    try {
        payload = (await response.json());
    }
    catch {
        throw new ApiError(response.status, 'INTERNAL_ERROR', '服务器返回了无法解析的响应');
    }
    if (!response.ok || !payload.success) {
        if (response.status === 401)
            clearAuthState();
        throw new ApiError(response.status, payload.code, payload.message);
    }
    return payload.data;
}
export async function apiRequest(path, options = {}) {
    const auth = getAuthState();
    const headers = new Headers(options.headers);
    headers.set('Accept', 'application/json');
    if (options.body && !headers.has('Content-Type'))
        headers.set('Content-Type', 'application/json');
    if (auth)
        headers.set(auth.tokenName, auth.tokenValue);
    const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
    return parseResponse(response);
}
export async function apiStream(path, body, signal) {
    const auth = getAuthState();
    const headers = new Headers({
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
    });
    if (auth)
        headers.set(auth.tokenName, auth.tokenValue);
    const response = await fetch(`${API_BASE_URL}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
    });
    if (!response.ok)
        return parseResponse(response);
    return response;
}
