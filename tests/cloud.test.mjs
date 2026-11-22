// Checks of the real Supabase project: auth settings, row level security, account deletion.
// Run: node --test tests/   (needs internet; creates test accounts and deletes them at the end)
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { SUPABASE_URL, SUPABASE_KEY } from '../js/app/config.js'

const headers = (token) => ({
  apikey: SUPABASE_KEY,
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
})
const json = async (response) => ({ status: response.status, body: await response.json().catch(() => null) })

const email = () => `promin-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
const PASSWORD = 'test-password-1234'
const created = [] // access tokens of accounts to delete at the end

async function signUp(address, password = PASSWORD) {
  const result = await json(await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ email: address, password }),
  }))
  if (result.body?.access_token) created.push(result.body.access_token)
  return result
}

async function signIn(address, password = PASSWORD) {
  return json(await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ email: address, password }),
  }))
}

async function rest(token, path, options = {}) {
  return json(await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options, headers: { ...headers(token), Prefer: 'return=representation', ...options.headers },
  }))
}

async function deleteAccount(token) {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/delete_account`, { method: 'POST', headers: headers(token), body: '{}' })
}

after(async () => {
  for (const token of created) await deleteAccount(token)
})

test('sign-up without email confirmation returns a session', async () => {
  const result = await signUp(email())
  assert.equal(result.status, 200)
  assert.ok(result.body.access_token, 'no access_token: email confirmation is still on')
})

test('passwords shorter than 8 characters are rejected', async () => {
  const result = await signUp(email(), 'short12')
  assert.equal(result.status, 422)
})

test('each account sees only its own tasks, sessions and settings', async () => {
  const a = (await signUp(email())).body.access_token
  const b = (await signUp(email())).body.access_token
  const id = `t-${Date.now()}`

  assert.equal((await rest(a, 'tasks', { method: 'POST', body: JSON.stringify({ id, title: 'A task', date: '2026-11-22' }) })).status, 201)
  assert.equal((await rest(a, 'focus_sessions', { method: 'POST', body: JSON.stringify({ id: `s-${id}`, date: '2026-11-22', minutes: 25, task_id: id }) })).status, 201)
  assert.equal((await rest(a, 'settings', { method: 'POST', body: JSON.stringify({ data: { focus: 30 } }) })).status, 201)

  for (const table of ['tasks', 'focus_sessions', 'settings']) {
    assert.equal((await rest(a, `${table}?select=*`)).body.length, 1, `A should see its ${table} row`)
    assert.deepEqual((await rest(b, `${table}?select=*`)).body, [], `B must not see A's ${table}`)
  }
})

test('without signing in the tables are closed', async () => {
  const result = await rest(null, 'tasks?select=*')
  assert.ok(result.status === 401 || (result.status === 200 && result.body.length === 0), `status ${result.status}`)
})

test('the server sets updated_at, not the client', async () => {
  const a = (await signUp(email())).body.access_token
  const row = (await rest(a, 'tasks', { method: 'POST', body: JSON.stringify({ id: 'clock', title: 'Clock', date: '2026-11-22', updated_at: '2000-01-01T00:00:00Z' }) })).body[0]
  assert.ok(new Date(row.updated_at).getFullYear() >= 2026, row.updated_at)
})

test('delete_account removes the account', async () => {
  const address = email()
  const a = (await signUp(address)).body.access_token
  await rest(a, 'tasks', { method: 'POST', body: JSON.stringify({ id: 'bye', title: 'Bye', date: '2026-11-22' }) })
  const response = await deleteAccount(a)
  assert.ok(response.ok, `delete_account status ${response.status}`)
  assert.equal((await signIn(address)).status, 400)
})
