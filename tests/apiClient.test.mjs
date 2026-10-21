import test from 'node:test'
import assert from 'node:assert/strict'
import { apiRequest, clearAuthState, setAuthState } from '../.tmp-tests/src/api/client.js'

test('uses the token header name returned by the login response', async () => {
  const values = new Map()
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers.get('x-session-token'), 'token-value')
    return new Response(JSON.stringify({ success: true, code: 'SUCCESS', message: 'OK', data: { ok: true } }), { status: 200 })
  }

  setAuthState({ tokenName: 'x-session-token', tokenValue: 'token-value', user: { id: 1 } })
  const result = await apiRequest('/api/auth/me')

  assert.deepEqual(result, { ok: true })
  clearAuthState()
})
