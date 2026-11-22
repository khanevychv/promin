// Pure sync functions: what goes into the outbox, how remote rows merge, which settings win.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyOutbox, diffState, mergeOutbox, pendingCount, clearSent,
  taskToRow, rowToTask, sessionToRow, rowToSession, clampSettings, mergeRemote, pickSettings, chunk,
} from '../js/app/sync-core.js'

const SETTINGS = { focus: 25, short: 5, long: 15, longEvery: 4, sound: true, autoStart: false, keepAwake: true }
const task = (id, extra = {}) => ({ id, title: `Task ${id}`, done: false, date: '2026-11-22', ...extra })
const session = (id, taskId = null) => ({ id, date: '2026-11-22', minutes: 25, taskId })
const base = () => {
  const tasks = [task('a'), task('b')]
  return { tasks, sessions: [session('s1')], settings: SETTINGS, currentTaskId: 'a' }
}

test('diffState: a changed task is an upsert, a removed one a delete, a new session its id', () => {
  const prev = base()
  const next = { ...prev, tasks: [{ ...prev.tasks[0], done: true }, task('c')], sessions: [...prev.sessions, session('s2', 'a')] }
  assert.deepEqual(diffState(prev, next), { tasks: { a: 'upsert', b: 'delete', c: 'upsert' }, sessions: ['s2'], settings: false })
})

test('diffState: an unchanged state gives an empty outbox', () => {
  const prev = base()
  assert.deepEqual(diffState(prev, { ...prev }), emptyOutbox())
})

test('diffState: new settings object marks settings', () => {
  const prev = base()
  assert.equal(diffState(prev, { ...prev, settings: { ...SETTINGS, focus: 30 } }).settings, true)
})

test('mergeOutbox and pendingCount', () => {
  const merged = mergeOutbox({ tasks: { a: 'upsert' }, sessions: ['s1'], settings: false }, { tasks: { a: 'delete', b: 'upsert' }, sessions: ['s1', 's2'], settings: true })
  assert.deepEqual(merged, { tasks: { a: 'delete', b: 'upsert' }, sessions: ['s1', 's2'], settings: true })
  assert.equal(pendingCount(merged), 5)
  assert.equal(pendingCount(emptyOutbox()), 0)
})

test('clearSent keeps what changed while it was being sent', () => {
  const sentState = base()
  const sent = { tasks: { a: 'upsert', b: 'upsert' }, sessions: ['s1'], settings: true }
  const current = { ...sentState, tasks: [{ ...sentState.tasks[0], title: 'edited meanwhile' }, sentState.tasks[1]] }
  const left = clearSent({ ...sent, tasks: { ...sent.tasks, c: 'upsert' } }, sent, sentState, current)
  assert.deepEqual(left, { tasks: { a: 'upsert', c: 'upsert' }, sessions: [], settings: false })
})

test('clearSent clears a delete only while the task is still gone', () => {
  const sentState = { ...base(), tasks: [task('a')] }
  const sent = { tasks: { b: 'delete' }, sessions: [], settings: false }
  assert.deepEqual(clearSent(sent, sent, sentState, sentState).tasks, {})
  const restored = { ...sentState, tasks: [task('a'), task('b')] }
  assert.deepEqual(clearSent(sent, sent, sentState, restored).tasks, { b: 'delete' })
})

test('row mappers translate taskId ↔ task_id and drop user_id', () => {
  assert.deepEqual(taskToRow(task('a', { done: true })), { id: 'a', title: 'Task a', done: true, date: '2026-11-22', deleted: false })
  assert.deepEqual(rowToTask({ user_id: 'u', id: 'a', title: 'T', done: false, date: '2026-11-22', deleted: false, created_at: 'x', updated_at: 'y' }), { id: 'a', title: 'T', done: false, date: '2026-11-22' })
  assert.deepEqual(sessionToRow(session('s', 'a')), { id: 's', date: '2026-11-22', minutes: 25, task_id: 'a' })
  assert.deepEqual(rowToSession({ user_id: 'u', id: 's', date: '2026-11-22', minutes: 25, task_id: null, created_at: 'x' }), { id: 's', date: '2026-11-22', minutes: 25, taskId: null })
})

test('clampSettings trims 999 minutes to 90 and drops unknown keys', () => {
  const result = clampSettings({ focus: 999, short: 0, long: '20', longEvery: 3.6, sound: 0, autoStart: 'yes', evil: '<script>' }, SETTINGS)
  assert.deepEqual(result, { focus: 90, short: 1, long: 15, longEvery: 4, sound: false, autoStart: true, keepAwake: true })
})

test('mergeRemote: an unsent local change wins over the server', () => {
  const state = base()
  const remote = { tasks: [{ ...taskToRow(task('a', { title: 'server title' })), updated_at: 't' }], sessions: [], settings: null }
  assert.deepEqual(mergeRemote(state, remote, { ...emptyOutbox(), tasks: { a: 'upsert' } }), {})
})

test('mergeRemote: the server wins when nothing is pending, and new tasks are added', () => {
  const state = base()
  const remote = { tasks: [{ ...taskToRow(task('a', { title: 'server title' })) }, { ...taskToRow(task('z')) }], sessions: [], settings: null }
  const changes = mergeRemote(state, remote, emptyOutbox())
  assert.deepEqual(changes.tasks.map((t) => [t.id, t.title]), [['a', 'server title'], ['b', 'Task b'], ['z', 'Task z']])
  assert.equal(changes.tasks[1], state.tasks[1], 'untouched tasks keep their object')
})

test('mergeRemote: deleted removes the task and clears the current task', () => {
  const state = base()
  const changes = mergeRemote(state, { tasks: [{ ...taskToRow(task('a')), deleted: true }], sessions: [], settings: null }, emptyOutbox())
  assert.deepEqual(changes.tasks.map((t) => t.id), ['b'])
  assert.equal(changes.currentTaskId, null)
})

test('mergeRemote: sessions are joined without duplicates', () => {
  const state = base()
  const changes = mergeRemote(state, { tasks: [], sessions: [sessionToRow(session('s1')), sessionToRow(session('s9', 'a'))], settings: null }, emptyOutbox())
  assert.deepEqual(changes.sessions.map((s) => s.id), ['s1', 's9'])
})

test('mergeRemote: settings from the server are clamped, unless settings are pending', () => {
  const state = base()
  const row = { data: { ...SETTINGS, focus: 500 }, updated_at: '2026-11-22T10:00:00Z' }
  assert.equal(mergeRemote(state, { tasks: [], sessions: [], settings: row }, emptyOutbox()).settings.focus, 90)
  assert.equal(mergeRemote(state, { tasks: [], sessions: [], settings: row }, { ...emptyOutbox(), settings: true }).settings, undefined)
})

test('pickSettings: untouched defaults on a new device do not overwrite the account', () => {
  assert.equal(pickSettings(0, { data: SETTINGS, updated_at: '2026-11-01T00:00:00Z' }), 'remote')
})

test('pickSettings: newer local settings win, older lose, none on the server keeps local', () => {
  const row = { data: SETTINGS, updated_at: '2026-11-22T10:00:00Z' }
  assert.equal(pickSettings(Date.parse('2026-11-22T11:00:00Z'), row), 'local')
  assert.equal(pickSettings(Date.parse('2026-11-22T09:00:00Z'), row), 'remote')
  assert.equal(pickSettings(Date.parse('2026-11-22T09:00:00Z'), null), 'local')
})

test('chunk splits 1201 items into 500, 500, 201', () => {
  const parts = chunk(Array.from({ length: 1201 }, (_, i) => i))
  assert.deepEqual(parts.map((p) => p.length), [500, 500, 201])
  assert.deepEqual(chunk([]), [])
})
