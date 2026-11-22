// The account button and dialog: states, phone header, sign in / up, errors, sign out, delete, UA/EN.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startServer, openDevice } from './harness.mjs'
import { SUPABASE_URL, SUPABASE_KEY } from '../../js/app/config.js'

const EMAIL = `promin-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`
const PASSWORD = 'test-password-1234'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let server
let d

const text = (selector) => d.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent.trim() ?? null`)
const click = (selector) => d.eval(`document.querySelector(${JSON.stringify(selector)}).click(); 'ok'`)
const state = () => d.eval(`document.querySelector('#account-open').dataset.state`)
const openDialog = () => click('#account-open')
const submit = (mode, email, password) => d.eval(`(() => {
  document.querySelector('.account-mode[data-mode=${mode}]').click();
  const form = document.querySelector('#account-form');
  form.elements.email.value = ${JSON.stringify(email)};
  form.elements.password.value = ${JSON.stringify(password)};
  form.requestSubmit();
  return 'ok';
})()`)
const serverSignIn = () => fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
})

before(async () => {
  server = await startServer(5613)
  d = await openDevice()
  await d.goto(`${server.url}/app.html`, 300)
  await d.eval(`localStorage.clear(); localStorage.setItem('lang', 'en'); 'ok'`)
  await d.reload(2000)
})

after(async () => {
  const token = await serverSignIn().then((r) => r.json()).then((j) => j.access_token).catch(() => null)
  if (token) await fetch(`${SUPABASE_URL}/rest/v1/rpc/delete_account`, { method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' })
  await d.close()
  await server.close()
})

test('the header has an account button that tells its state', async () => {
  assert.equal(await state(), 'guest')
  assert.equal(await d.eval(`document.querySelector('#account-open').getAttribute('aria-label')`), 'Account: not signed in')
  assert.equal(await d.eval(`Boolean(document.querySelector('#account-open svg'))`), true)
})

test('the header fits phones from 320 to 390 px, and the logo keeps its name', async () => {
  await d.eval(`document.querySelector('#install').hidden = false; 'ok'`) // worst case: the install button is shown too
  for (const width of [320, 360, 375, 390]) {
    await d.resize(width, 800)
    await sleep(300)
    const box = await d.eval(`({
      scroll: document.documentElement.scrollWidth,
      width: document.documentElement.clientWidth,
      buttons: Math.round(document.querySelector('.app-header-actions').getBoundingClientRect().right),
      header: Math.round(document.querySelector('.app-header').getBoundingClientRect().right),
    })`)
    assert.ok(box.scroll <= box.width, `${width}px: the page scrolls sideways (${box.scroll} > ${box.width})`)
    assert.ok(box.buttons <= box.header, `${width}px: the buttons stick out of the header`)
    assert.equal(await d.eval(`getComputedStyle(document.querySelector('.logo-text')).position`), 'absolute', `${width}px: logo text should be visually hidden`)
  }
  assert.equal(await text('.logo'), 'Promin')
  await d.resize(1280, 860)
  await d.eval(`document.querySelector('#install').hidden = true; 'ok'`)
  assert.equal(await d.eval(`getComputedStyle(document.querySelector('.logo-text')).position`), 'static')
})

test('signed out, the dialog offers sign in and sign up, with the recovery note', async () => {
  await openDialog()
  assert.equal(await d.eval(`document.querySelector('#account').open`), true)
  assert.equal(await d.eval(`document.querySelector('#account-form').hidden`), false)
  assert.equal(await d.eval(`document.querySelector('#account-form').elements.email.type`), 'email')
  assert.equal(await d.eval(`document.querySelector('#account-form').elements.password.minLength`), 8)
  assert.equal(await text('#account-submit'), 'Sign in')
  await click('.account-mode[data-mode=signup]')
  assert.equal(await text('#account-submit'), 'Create account')
  assert.equal(await d.eval(`document.querySelector('#account-form').elements.password.autocomplete`), 'new-password')
  assert.match(await text('.account-note'), /can’t be recovered/)
})

test('offline, the form is disabled and says why', async () => {
  await d.setOffline(true)
  await d.waitFor(`document.querySelector('.account-fields').disabled`, 3000)
  assert.equal(await text('.account-form-message'), 'You need an internet connection.')
  await d.setOffline(false)
  await d.waitFor(`!document.querySelector('.account-fields').disabled`, 3000)
})

test('a wrong password gets a clear message', async () => {
  await submit('signin', EMAIL, 'wrong-password-123')
  await d.waitFor(`document.querySelector('.account-form-message').textContent === 'Wrong email or password.'`, 10_000)
})

test('signing up shows the signed-in view and the header turns synced', async () => {
  await submit('signup', EMAIL, PASSWORD)
  await d.waitFor(`!document.querySelector('#account-panel').hidden`, 15_000)
  assert.equal(await text('.account-email'), `Signed in as ${EMAIL}`)
  await d.waitFor(`document.querySelector('#account-open').dataset.state === 'synced'`, 15_000)
  assert.match(await text('.account-status'), /^Synced/)
  assert.equal(await d.eval(`document.querySelector('#account-open').getAttribute('aria-label')`), 'Account: synced')
})

test('the same email cannot sign up twice', async () => {
  await click('#account-signout')
  await d.waitFor(`document.querySelector('#account-open').dataset.state === 'guest'`, 10_000)
  await openDialog()
  await submit('signup', EMAIL, PASSWORD)
  await d.waitFor(`document.querySelector('.account-form-message').textContent === 'This email is already registered. Try signing in.'`, 10_000)
})

test('signing out with unsent changes warns first, and signs out on the second click', async () => {
  await submit('signin', EMAIL, PASSWORD)
  await d.waitFor(`document.querySelector('#account-open').dataset.state === 'synced'`, 15_000)
  await d.eval(`document.querySelector('#account').close(); 'ok'`)
  await d.setOffline(true)
  await d.eval(`(() => { const i = document.querySelector('#task-form input'); i.value = 'Unsent'; document.querySelector('#task-form').requestSubmit(); return 'ok'; })()`)
  await d.waitFor(`document.querySelector('#account-open').dataset.state === 'pending'`, 5000)
  await openDialog()
  assert.match(await text('.account-status'), /^Waiting for the internet: 1 change$/)
  await click('#account-signout')
  await d.waitFor(`document.querySelector('.account-panel-message').textContent.includes('unsent changes')`, 5000)
  assert.equal(await text('#account-signout'), 'Sign out anyway')
  await click('#account-signout')
  await d.waitFor(`document.querySelector('#account-open').dataset.state === 'guest'`, 5000)
  await d.setOffline(false)
})

test('deleting the account asks once more, then removes it', async () => {
  await openDialog()
  await submit('signin', EMAIL, PASSWORD)
  await d.waitFor(`!document.querySelector('#account-panel').hidden`, 15_000)
  // while signing in the buttons are disabled; wait until the sign-in has finished
  await d.waitFor(`document.querySelector('#account-open').dataset.state === 'synced' && !document.querySelector('#account-delete').disabled`, 15_000)
  await click('#account-delete')
  assert.equal(await text('#account-delete'), 'Yes, delete forever')
  assert.match(await text('.account-panel-message'), /deleted forever/)
  await click('#account-delete')
  await d.waitFor(`document.querySelector('#account-open').dataset.state === 'guest'`, 15_000)
  assert.equal((await serverSignIn()).status, 400)
})

test('the account texts are in Ukrainian too', async () => {
  await click('[data-lang=uk]')
  assert.equal(await d.eval(`document.querySelector('#account-open').getAttribute('aria-label')`), 'Акаунт: вхід не виконано')
  await openDialog()
  assert.equal(await text('#account-title'), 'Акаунт')
  assert.equal(await text('#account-submit'), 'Увійти')
  assert.match(await text('.account-note'), /Відновити пароль поки не можна/)
})

test('no page errors', () => {
  assert.deepEqual(d.errors, [])
})
