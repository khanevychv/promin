// Hard cases: offline start while signed in, Supabase unreachable, account deleted elsewhere, two tabs.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startServer, openDevice } from './harness.mjs'
import { SUPABASE_URL, SUPABASE_KEY } from '../../js/app/config.js'

const PORT = 5614
const PASSWORD = 'test-password-1234'
const emails = [] // every test account, deleted in after()
const newEmail = () => {
  const email = `promin-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`
  emails.push(email)
  return email
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let server

const inPage = (body) => `(async () => {
  const sync = await import('/js/app/sync.js');
  const cloud = await import('/js/app/cloud.js');
  ${body}
})()`
const status = (device) => device.eval(inPage(`return sync.getSyncStatus();`))
const addTask = (device, title) => device.eval(`(() => { const i = document.querySelector('#task-form input'); i.value = ${JSON.stringify(title)}; document.querySelector('#task-form').requestSubmit(); return 'ok'; })()`)
const serverTasks = (device) => device.eval(inPage(`
  const client = await cloud.loadClient();
  const { data, error } = await client.from('tasks').select('id, title, deleted');
  if (error) throw new Error(error.message);
  return data;`))

async function signedInDevice(email) {
  const device = await openDevice()
  await device.goto(`${server.url}/app.html`, 300)
  await device.eval(`localStorage.clear(); localStorage.setItem('lang', 'en'); 'ok'`)
  await device.reload(2000)
  const result = await device.eval(inPage(`
    const r = await cloud.signUp(${JSON.stringify(email)}, '${PASSWORD}');
    if (r.error) return r;
    await sync.afterSignIn();
    return { ok: true };`))
  assert.deepEqual(result, { ok: true })
  await device.waitFor(inPage(`return sync.getSyncStatus().state === 'synced';`), 15_000)
  return device
}

async function tokenFor(email) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }),
  })
  return (await response.json()).access_token ?? null
}
const deleteByEmail = async (email) => {
  const token = await tokenFor(email)
  if (token) await fetch(`${SUPABASE_URL}/rest/v1/rpc/delete_account`, { method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' })
}

before(async () => { server = await startServer(PORT) })
after(async () => {
  for (const email of emails) await deleteByEmail(email)
  await server.close()
})

test('the service worker caches the new modules and supabase-js, and drops old caches', async () => {
  const device = await signedInDevice(newEmail())
  try {
    await device.reload(3000) // now the service worker controls the page and sees supabase-js load
    await device.eval(inPage(`await cloud.loadClient(); return 'ok';`))
    const caches = await device.eval(`(async () => {
      const out = {};
      for (const name of await caches.keys()) out[name] = (await (await caches.open(name)).keys()).map((r) => r.url);
      return out;
    })()`)
    assert.deepEqual(Object.keys(caches), ['promin-v3'])
    const urls = caches['promin-v3'].map((url) => url.replace(server.url, ''))
    for (const file of ['/js/app/config.js', '/js/app/cloud.js', '/js/app/sync.js', '/js/app/sync-core.js', '/js/app/account.js']) {
      assert.ok(urls.includes(file), `${file} is not cached`)
    }
    assert.ok(urls.some((url) => url.startsWith('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/')), 'supabase-js is not cached')
  } finally {
    await device.close()
  }
})

test('signed in, the app starts with no internet at all, queues a change, sends it later, and signs out offline', async () => {
  const device = await signedInDevice(newEmail())
  try {
    await device.reload(3000)
    await device.eval(inPage(`await cloud.loadClient(); return 'ok';`))
    await device.clearHttpCache() // from here on only the service worker cache can help
    await server.close()
    await device.setOffline(true)
    await device.reload(3000)
    assert.notEqual(await device.eval(`document.querySelector('#account-open').dataset.state`), 'guest')
    await addTask(device, 'Written offline')
    await device.waitFor(inPage(`return sync.getSyncStatus().pending === 1;`), 5000)
    assert.equal(await device.eval(`document.querySelector('#account-open').dataset.state`), 'pending')

    server = await startServer(PORT)
    await device.setOffline(false)
    await device.waitFor(inPage(`const s = sync.getSyncStatus(); return s.state === 'synced' && s.pending === 0;`), 15_000)
    assert.ok((await serverTasks(device)).some((t) => t.title === 'Written offline'))

    // Signing out with no connection must still remove the session from this device
    await device.setOffline(true)
    await device.eval(inPage(`return sync.signOutAndClear({ force: true });`))
    const leftovers = await device.eval(`Object.keys(localStorage).filter((key) => key.startsWith('sb-'))`)
    assert.deepEqual(leftovers, [])
    await device.setOffline(false)
    assert.deepEqual(device.errors, [])
  } finally {
    if (!server.url || !(await fetch(`${server.url}/app.html`).then(() => true).catch(() => false))) server = await startServer(PORT)
    await device.close()
  }
})

test('signing out right after an offline start removes the session from the device', async () => {
  const device = await signedInDevice(newEmail())
  try {
    await device.reload(3000)
    await device.eval(inPage(`await cloud.loadClient(); return 'ok';`))
    await device.clearHttpCache()
    await server.close()
    await device.setOffline(true)
    await device.reload(3000) // supabase-js is not in memory now; only caches can provide it
    const result = await device.eval(inPage(`return sync.signOutAndClear({ force: true });`))
    assert.equal(result.blocked, false)
    assert.deepEqual(await device.eval(`Object.keys(localStorage).filter((key) => key.startsWith('sb-'))`), [])
    assert.equal(await device.eval(`document.querySelector('#account-open').dataset.state`), 'guest')
  } finally {
    await device.setOffline(false)
    server = await startServer(PORT).catch(() => server)
    // the account still exists on the server; after() deletes it by email
    await device.close()
  }
})

test('when Supabase is unreachable the app keeps working, shows an error and retries on a schedule', async () => {
  const device = await signedInDevice(newEmail())
  try {
    await device.blockUrls(['*supabase.co*'])
    const before = device.requests.length
    await addTask(device, 'While paused')
    await device.waitFor(inPage(`return sync.getSyncStatus().state === 'error';`), 10_000)
    assert.ok(await device.eval(`JSON.parse(localStorage.getItem('promin-app')).tasks.some((t) => t.title === 'While paused')`))
    await sleep(12_000)
    const attempts = device.requests.slice(before).filter((url) => url.includes('supabase.co')).length
    assert.ok(attempts <= 6, `${attempts} requests to Supabase in ~14 s`)

    await device.blockUrls([])
    await device.eval(`document.dispatchEvent(new Event('visibilitychange')); 'ok'`)
    await device.waitFor(inPage(`const s = sync.getSyncStatus(); return s.state === 'synced' && s.pending === 0;`), 15_000)
    assert.ok((await serverTasks(device)).some((t) => t.title === 'While paused'))
    assert.deepEqual(device.errors, [])
  } finally {
    await device.close()
  }
})

test('an account deleted on another device signs this one out locally', async () => {
  const email = newEmail()
  const device = await signedInDevice(email)
  try {
    await deleteByEmail(email)
    await addTask(device, 'After deletion')
    await device.waitFor(`document.querySelector('#account-open').dataset.state === 'guest'`, 20_000)
    assert.equal(await device.eval(`localStorage.getItem('promin-cloud')`), null)
    assert.deepEqual(device.errors, [])
  } finally {
    await device.close()
  }
})

test('two tabs on one device converge without duplicates on the server', async () => {
  const one = await signedInDevice(newEmail())
  try {
    const two = await one.newTab()
    await two.goto(`${server.url}/app.html`, 2500)
    await two.waitFor(inPage(`return sync.getSyncStatus().state === 'synced';`), 15_000)

    await addTask(one, 'From tab one')
    await one.waitFor(inPage(`const s = sync.getSyncStatus(); return s.state === 'synced' && s.pending === 0;`), 15_000)
    await two.eval(`document.dispatchEvent(new Event('visibilitychange')); 'ok'`)
    await two.waitFor(`[...document.querySelectorAll('.task-title')].some((el) => el.textContent === 'From tab one')`, 15_000)
    await two.waitFor(inPage(`const s = sync.getSyncStatus(); return s.state === 'synced' && s.pending === 0;`), 15_000)

    const rows = (await serverTasks(one)).filter((t) => t.title === 'From tab one')
    assert.equal(rows.length, 1)
    assert.deepEqual([...one.errors, ...two.errors], [])
  } finally {
    await one.close()
  }
})
