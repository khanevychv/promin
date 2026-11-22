// Store changes that make sync possible: session ids, derived task counts, settingsChangedAt, reset, meta.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startServer, openDevice, todayKey } from './harness.mjs'

let server
let device
before(async () => {
  server = await startServer(5611)
  device = await openDevice()
})
after(async () => {
  await device.close()
  await server.close()
})

const openWith = async (state) => {
  await device.goto(`${server.url}/app.html`, 300)
  await device.eval(`localStorage.clear(); localStorage.setItem('lang', 'en'); localStorage.setItem('promin-app', ${JSON.stringify(JSON.stringify(state))}); 'ok'`)
  await device.reload(1500)
}
const state = () => device.eval(`JSON.parse(localStorage.getItem('promin-app'))`)

test('old sessions get ids on load, task counts come from sessions', async () => {
  const today = todayKey()
  await openWith({
    tasks: [{ id: 't1', title: 'Old task', done: false, sessions: 2, date: today }],
    sessions: [
      { date: today, minutes: 25, taskId: 't1' },
      { date: today, minutes: 25, taskId: 't1' },
      { date: today, minutes: 25, taskId: null },
    ],
    currentTaskId: 't1',
  })
  await device.eval(`document.querySelector('.task-title').click(); 'ok'`) // any state change saves the store
  const saved = await state()
  assert.equal(saved.sessions.length, 3)
  assert.ok(saved.sessions.every((s) => typeof s.id === 'string' && s.id.length > 8), JSON.stringify(saved.sessions))
  assert.equal(await device.eval(`document.querySelector('.task-sessions').textContent`), '2 sessions')
  assert.equal(await device.eval(`document.querySelector('#stat-sessions').textContent`), '3')
})

test('a finished focus session is recorded with an id and the current task', async () => {
  const today = todayKey()
  await openWith({
    tasks: [{ id: 't1', title: 'Now', done: false, date: today }],
    sessions: [],
    currentTaskId: 't1',
    timer: { running: true, endTime: Date.now() + 1200, remaining: null },
  })
  await device.waitFor(`JSON.parse(localStorage.getItem('promin-app')).sessions.length === 1`, 6000)
  const [session] = (await state()).sessions
  assert.equal(session.taskId, 't1')
  assert.ok(typeof session.id === 'string' && session.id.length > 8)
  assert.equal(await device.eval(`document.querySelector('.task-sessions').textContent`), '1 session')
})

test('saving the settings dialog stamps settingsChangedAt', async () => {
  await openWith({})
  assert.equal((await state())?.settingsChangedAt ?? 0, 0)
  await device.eval(`(async () => {
    document.querySelector('#settings-open').click();
    document.querySelector('#settings-form').elements.focus.value = 40;
    document.querySelector('button[value=save]').click();
    await new Promise((r) => setTimeout(r, 300));
    return 'ok';
  })()`)
  const saved = await state()
  assert.equal(saved.settings.focus, 40)
  assert.ok(saved.settingsChangedAt > Date.now() - 60_000, String(saved.settingsChangedAt))
})

test('resetAccountData clears account data but keeps the language', async () => {
  const today = todayKey()
  await openWith({ lang: 'en', tasks: [{ id: 't1', title: 'Keep?', done: false, date: today }], sessions: [{ id: 's1', date: today, minutes: 25, taskId: 't1' }], currentTaskId: 't1', settings: { focus: 50 }, settingsChangedAt: 123 })
  const after = await device.eval(`(async () => {
    const store = await import('/js/app/store.js');
    store.resetAccountData();
    return store.getState();
  })()`)
  assert.deepEqual(after.tasks, [])
  assert.deepEqual(after.sessions, [])
  assert.equal(after.currentTaskId, null)
  assert.equal(after.settings.focus, 25)
  assert.equal(after.settingsChangedAt, 0)
  assert.equal(after.lang, 'en')
})

test('setState passes meta to listeners', async () => {
  await openWith({})
  const meta = await device.eval(`(async () => {
    const store = await import('/js/app/store.js');
    let seen = null;
    store.subscribe((state, meta) => { seen = meta; });
    store.setState({ mode: 'short' }, { fromSync: true });
    return seen;
  })()`)
  assert.deepEqual(meta, { fromSync: true })
})

test('no page errors', () => {
  assert.deepEqual(device.errors, [])
})
