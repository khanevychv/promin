// Sync between two "devices" (two browser profiles) through the real Supabase project.
// Creates one test account and deletes it at the end.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startServer, openDevice, todayKey } from './harness.mjs'
import { SUPABASE_URL, SUPABASE_KEY } from '../../js/app/config.js'

const EMAIL = `promin-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`
const PASSWORD = 'test-password-1234'
let server
let a
let b

// Code run inside a page with the app's own modules
const inPage = (body) => `(async () => {
  const sync = await import('/js/app/sync.js');
  const cloud = await import('/js/app/cloud.js');
  const store = await import('/js/app/store.js');
  ${body}
})()`
const synced = inPage(`const s = sync.getSyncStatus(); return s.state === 'synced' && s.pending === 0;`)
const serverRows = (device, table) => device.eval(inPage(`
  const client = await cloud.loadClient();
  const { data, error } = await client.from('${table}').select('*');
  if (error) throw new Error(error.message);
  return data;`))
const localState = (device) => device.eval(`JSON.parse(localStorage.getItem('promin-app'))`)
const comeBack = (device) => device.eval(`document.dispatchEvent(new Event('visibilitychange')); 'ok'`)

before(async () => {
  server = await startServer(5612)
  a = await openDevice()
  b = await openDevice()
})

after(async () => {
  // Safety net: delete the test account if a test failed before doing it
  const token = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  }).then((r) => r.json()).then((j) => j.access_token).catch(() => null)
  if (token) await fetch(`${SUPABASE_URL}/rest/v1/rpc/delete_account`, { method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' })
  await a.close()
  await b.close()
  await server.close()
})

test('a guest loads nothing from the CDN and keeps no account record', async () => {
  const today = todayKey()
  await a.goto(`${server.url}/app.html`, 300)
  await a.eval(`localStorage.clear(); localStorage.setItem('lang', 'en'); localStorage.setItem('promin-app', ${JSON.stringify(JSON.stringify({
    tasks: [{ id: 'guest-task', title: 'Guest task', done: false, date: today }],
    sessions: [{ id: 'guest-session', date: today, minutes: 25, taskId: 'guest-task' }],
    settings: { focus: 35 }, settingsChangedAt: Date.now(),
  }))}); 'ok'`)
  await a.reload(2500)
  const cdn = await a.eval(`performance.getEntriesByType('resource').filter((e) => e.name.includes('cdn.jsdelivr.net')).length`)
  assert.equal(cdn, 0)
  assert.equal(await a.eval(`localStorage.getItem('promin-cloud')`), null)
  assert.equal((await a.eval(inPage(`return sync.getSyncStatus();`))).state, 'guest')
})

test('signing up moves the guest data into the account', async () => {
  const result = await a.eval(inPage(`
    const r = await cloud.signUp('${EMAIL}', '${PASSWORD}');
    if (r.error) return r;
    await sync.afterSignIn();
    return { ok: true };`))
  assert.deepEqual(result, { ok: true })
  await a.waitFor(synced, 15_000)
  assert.deepEqual((await serverRows(a, 'tasks')).map((t) => [t.id, t.title, t.deleted]), [['guest-task', 'Guest task', false]])
  assert.deepEqual((await serverRows(a, 'focus_sessions')).map((s) => [s.id, s.task_id]), [['guest-session', 'guest-task']])
  assert.equal((await serverRows(a, 'settings'))[0].data.focus, 35)
})

test('the second device signs in and gets the same tasks, statistics and settings', async () => {
  await b.goto(`${server.url}/app.html`, 300)
  await b.eval(`localStorage.clear(); localStorage.setItem('lang', 'en'); 'ok'`)
  await b.reload(1500)
  const result = await b.eval(inPage(`
    const r = await cloud.signIn('${EMAIL}', '${PASSWORD}');
    if (r.error) return r;
    await sync.afterSignIn();
    return { ok: true };`))
  assert.deepEqual(result, { ok: true })
  await b.waitFor(synced, 15_000)
  const state = await localState(b)
  assert.deepEqual(state.tasks.map((t) => t.title), ['Guest task'])
  assert.deepEqual(state.sessions.map((s) => s.id), ['guest-session'])
  assert.equal(state.settings.focus, 35, 'untouched defaults on B must not overwrite the account settings')
  assert.equal(await b.eval(`document.querySelector('#stat-minutes').textContent`), '25')
  assert.equal(await b.eval(`document.querySelector('.task-sessions').textContent`), '1 session')
})

test('a task added on B reaches A when A comes back to the tab', async () => {
  await b.eval(`(() => { const i = document.querySelector('#task-form input'); i.value = 'From B'; document.querySelector('#task-form').requestSubmit(); return 'ok'; })()`)
  await b.waitFor(synced, 15_000)
  await comeBack(a)
  await a.waitFor(`JSON.parse(localStorage.getItem('promin-app')).tasks.some((t) => t.title === 'From B')`, 15_000)
})

test('deleting a task on A removes it on B', async () => {
  await a.eval(`(() => { const item = [...document.querySelectorAll('.task')].find((li) => li.textContent.includes('From B')); item.querySelector('.task-delete').click(); return 'ok'; })()`)
  await a.waitFor(synced, 15_000)
  assert.ok((await serverRows(a, 'tasks')).some((t) => t.title === 'From B' && t.deleted), 'server keeps a tombstone')
  await comeBack(b)
  await b.waitFor(`!JSON.parse(localStorage.getItem('promin-app')).tasks.some((t) => t.title === 'From B')`, 15_000)
})

test('settings saved on A reach B', async () => {
  await a.eval(`(async () => {
    document.querySelector('#settings-open').click();
    document.querySelector('#settings-form').elements.focus.value = 40;
    document.querySelector('button[value=save]').click();
    await new Promise((r) => setTimeout(r, 300));
    return 'ok';
  })()`)
  await a.waitFor(synced, 15_000)
  await comeBack(b)
  await b.waitFor(`JSON.parse(localStorage.getItem('promin-app')).settings.focus === 40`, 15_000)
})

test('signing out with unsent changes is blocked unless forced, and then clears the device', async () => {
  await b.setOffline(true)
  await b.eval(`(() => { const i = document.querySelector('#task-form input'); i.value = 'Offline on B'; document.querySelector('#task-form').requestSubmit(); return 'ok'; })()`)
  await b.waitFor(inPage(`return sync.getSyncStatus().pending > 0;`), 5000)
  const blocked = await b.eval(inPage(`return sync.signOutAndClear({ force: false });`))
  assert.equal(blocked.blocked, true)
  assert.ok(blocked.pending >= 1)
  const forced = await b.eval(inPage(`return sync.signOutAndClear({ force: true });`))
  assert.equal(forced.blocked, false)
  const state = await localState(b)
  assert.deepEqual(state.tasks, [])
  assert.equal(state.lang, 'en')
  assert.equal(await b.eval(`localStorage.getItem('promin-cloud')`), null)
  assert.equal((await b.eval(inPage(`return sync.getSyncStatus();`))).state, 'guest')
  await b.setOffline(false)
})

test('deleting the account removes it from the server and clears the device', async () => {
  const result = await a.eval(inPage(`return sync.deleteAccountAndClear();`))
  assert.deepEqual(result, {})
  assert.deepEqual((await localState(a)).tasks, [])
  const signIn = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  assert.equal(signIn.status, 400)
})

test('no page errors on either device', () => {
  assert.deepEqual(a.errors, [])
  assert.deepEqual(b.errors, [])
})
