// =========================================
// Синхронізація з акаунтом
// Локальні дані головні: зміни складаються в чергу і відправляються, коли є мережа;
// зміни з інших пристроїв підтягуються при старті, поверненні на вкладку, появі мережі
// і раз на хвилину.
// =========================================
import { getState, setState, subscribe, resetAccountData } from './store.js';
import * as core from './sync-core.js';
import { loadClient, getUser, signOut, deleteAccount } from './cloud.js';

const CLOUD_KEY = 'promin-cloud'; // { userId, email, cursor: { tasks, sessions }, lastSync }
const OUTBOX_KEY = 'promin-outbox';
const PUSH_DELAY = 1500;
const PULL_EVERY = 60_000;
const RETRY = [5_000, 30_000, 120_000];
const OVERLAP = 120_000; // мітки часу сервера беремо з перекриттям: злиття однаково не дублює

const read = (key) => {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
};
const write = (key, value) => {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(value));
};
const pick = (state) => ({ tasks: state.tasks, sessions: state.sessions, settings: state.settings });

let cloud = read(CLOUD_KEY);
let outbox = read(OUTBOX_KEY) ?? core.emptyOutbox();
let snapshot = pick(getState());
let syncing = false;
let again = false;
let failed = false;
let failures = 0;
let timer = null;
let started = false;
const listeners = [];

// --- Стан для інтерфейсу ---
export function getSyncStatus() {
  const pending = cloud ? core.pendingCount(outbox) : 0;
  let state = 'guest';
  if (cloud) {
    if (syncing) state = 'syncing';
    else if (failed) state = 'error';
    else if (pending > 0) state = 'pending';
    else state = 'synced';
  }
  return { state, pending, lastSync: cloud?.lastSync ?? null, email: cloud?.email ?? null };
}

export function onSyncStatus(callback) {
  listeners.push(callback);
}

function emit() {
  const status = getSyncStatus();
  listeners.forEach((callback) => callback(status));
}

// --- Черга ---
function onStoreChange(state, meta) {
  const next = pick(state);
  if (cloud && !meta.fromSync && !meta.reset) {
    outbox = core.mergeOutbox(outbox, core.diffState(snapshot, next));
    write(OUTBOX_KEY, outbox);
    schedule(PUSH_DELAY);
  }
  snapshot = next;
  emit();
}

function schedule(delay) {
  clearTimeout(timer);
  timer = setTimeout(syncNow, delay);
}

const check = ({ error, status }) => {
  if (error) throw Object.assign(new Error(error.message), { code: error.code, status });
};

// Відповіді, після яких варто перевірити, чи акаунт ще існує (видалили на іншому пристрої,
// сесію відкликали): 23503 — рядок посилається на неіснуючого користувача, 42501 — немає прав
const AUTH_CODES = new Set(['23503', '42501', 'PGRST301', 'PGRST302', 'PGRST303']);

async function accountGone(client) {
  const { data: session } = await client.auth.getSession();
  if (!session.session) return true;
  const { data, error } = await client.auth.getUser(); // питаємо сервер напряму
  if (data?.user) return false;
  return [401, 403, 404].includes(error?.status) || ['user_not_found', 'session_not_found', 'bad_jwt'].includes(error?.code);
}

async function push(client) {
  const sent = structuredClone(outbox);
  const sentState = pick(getState());
  const tasks = new Map(sentState.tasks.map((task) => [task.id, task]));

  const upserts = Object.entries(sent.tasks)
    .filter(([id, action]) => action === 'upsert' && tasks.has(id))
    .map(([id]) => core.taskToRow(tasks.get(id)));
  const deletes = Object.entries(sent.tasks).filter(([, action]) => action === 'delete').map(([id]) => id);
  const sessions = sentState.sessions.filter((session) => sent.sessions.includes(session.id)).map(core.sessionToRow);

  for (const part of core.chunk(upserts)) check(await client.from('tasks').upsert(part, { onConflict: 'user_id,id' }));
  for (const part of core.chunk(deletes)) check(await client.from('tasks').update({ deleted: true }).in('id', part));
  for (const part of core.chunk(sessions)) {
    check(await client.from('focus_sessions').upsert(part, { onConflict: 'user_id,id', ignoreDuplicates: true }));
  }
  if (sent.settings) check(await client.from('settings').upsert({ data: sentState.settings }, { onConflict: 'user_id' }));

  outbox = core.clearSent(outbox, sent, sentState, pick(getState()));
  write(OUTBOX_KEY, outbox);
}

// Усі рядки таблиці (сторінками по 1000), новіші за курсор; без курсора — усі живі задачі
async function selectSince(client, table, column, cursor) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let query = client.from(table).select('*').order(column).range(from, from + 999);
    if (cursor) query = query.gt(column, new Date(Date.parse(cursor) - OVERLAP).toISOString());
    else if (table === 'tasks') query = query.eq('deleted', false);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

const latest = (rows, column, fallback) => rows.reduce((max, row) => (row[column] > max ? row[column] : max), fallback ?? '');

async function pull(client) {
  const tasks = await selectSince(client, 'tasks', 'updated_at', cloud.cursor?.tasks);
  const sessions = await selectSince(client, 'focus_sessions', 'created_at', cloud.cursor?.sessions);
  const { data: settings, error } = await client.from('settings').select('data, updated_at').maybeSingle();
  if (error) throw error;

  const changes = core.mergeRemote(getState(), { tasks, sessions, settings }, outbox);
  if (Object.keys(changes).length > 0) setState(changes, { fromSync: true });

  cloud.cursor = {
    tasks: latest(tasks, 'updated_at', cloud.cursor?.tasks) || null,
    sessions: latest(sessions, 'created_at', cloud.cursor?.sessions) || null,
  };
}

export async function syncNow() {
  if (!cloud) return;
  if (syncing) { again = true; return; }
  if (!navigator.onLine) { emit(); return; }

  syncing = true;
  emit();
  let client = null;
  try {
    client = await loadClient();
    await push(client);
    await pull(client);
    cloud.lastSync = Date.now();
    write(CLOUD_KEY, cloud);
    failed = false;
    failures = 0;
  } catch (error) {
    const authProblem = client && (error.status === 401 || error.status === 403 || AUTH_CODES.has(error.code));
    if (authProblem && await accountGone(client).catch(() => false)) {
      await signOut();
      clearLocal(); // акаунта більше немає: цей пристрій стає гостем
      again = false;
      return;
    }
    failed = navigator.onLine; // без мережі це не помилка, а очікування
    if (failed) {
      schedule(RETRY[Math.min(failures, RETRY.length - 1)]);
      failures += 1;
    }
  } finally {
    syncing = false;
    emit();
    if (again) { again = false; syncNow(); }
  }
}

function start() {
  if (started) return;
  started = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow();
  });
  window.addEventListener('online', syncNow);
  window.addEventListener('offline', emit);
  setInterval(() => {
    if (document.visibilityState === 'visible') syncNow();
  }, PULL_EVERY);
}

export function initSync() {
  subscribe(onStoreChange);
  if (!cloud) { emit(); return; }
  start();
  syncNow();
}

// Після входу чи реєстрації: усе з цього пристрою йде в акаунт, налаштування — за правилом
export async function afterSignIn() {
  const user = await getUser();
  if (!user) return;
  const client = await loadClient();
  const { data: row, error } = await client.from('settings').select('data, updated_at').maybeSingle();
  const state = getState();
  // Не змогли прочитати налаштування з акаунта — відправляємо свої, лише якщо їх тут справді змінювали
  const settingsFromHere = error ? state.settingsChangedAt > 0 : core.pickSettings(state.settingsChangedAt, row) === 'local';

  cloud = { userId: user.id, email: user.email, cursor: null, lastSync: null };
  write(CLOUD_KEY, cloud);
  outbox = {
    tasks: Object.fromEntries(state.tasks.map((task) => [task.id, 'upsert'])),
    sessions: state.sessions.map((session) => session.id),
    settings: settingsFromHere,
  };
  write(OUTBOX_KEY, outbox);
  snapshot = pick(state);
  failed = false;
  start();
  await syncNow();
}

function clearLocal() {
  clearTimeout(timer);
  cloud = null;
  outbox = core.emptyOutbox();
  write(CLOUD_KEY, null);
  write(OUTBOX_KEY, null);
  // Сесію Supabase прибираємо й самі: без мережі бібліотеки може не бути під рукою
  Object.keys(localStorage)
    .filter((key) => key.startsWith('sb-') && key.endsWith('-auth-token'))
    .forEach((key) => localStorage.removeItem(key));
  failed = false;
  resetAccountData();
  emit();
}

// Вихід: якщо щось не відправлено, спершу пробуємо відправити; не вийшло — питаємо (force)
export async function signOutAndClear({ force = false } = {}) {
  if (cloud && core.pendingCount(outbox) > 0 && !force) {
    await syncNow();
    const pending = core.pendingCount(outbox);
    if (pending > 0) return { blocked: true, pending };
  }
  await signOut();
  clearLocal();
  return { blocked: false, pending: 0 };
}

export async function deleteAccountAndClear() {
  if (!navigator.onLine) return { error: 'offline' };
  const result = await deleteAccount();
  if (result.error) return result;
  await signOut();
  clearLocal();
  return {};
}
