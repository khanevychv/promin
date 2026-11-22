// =========================================
// Три головні справи на сьогодні
// =========================================
import { getState, setState, subscribe } from './store.js';
import { todayKey } from './utils.js';
import { t, pluralize } from './i18n.js';

const MAX_TASKS = 3;

const form = document.querySelector('#task-form');
const input = form.querySelector('input');
const list = document.querySelector('#task-list');
const template = document.querySelector('#task-template');
const hint = document.querySelector('.tasks-panel .panel-hint');

// «1 сесія», «2 сесії», «5 сесій» / «1 session», «2 sessions»
function sessionsLabel(count) {
  if (count === 0) return '';
  return `${count} ${pluralize(count, 'session')}`;
}

function createId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Лише сьогоднішні задачі (вчорашні лишаються в пам'яті для статистики)
function todayTasks(state) {
  return state.tasks.filter((task) => task.date === todayKey());
}

// --- Дії ---
function addTask(title) {
  const state = getState();
  if (todayTasks(state).length >= MAX_TASKS) return;

  const task = { id: createId(), title, done: false, date: todayKey() };
  setState({
    tasks: [...state.tasks, task],
    currentTaskId: state.currentTaskId ?? task.id, // перша задача одразу стає поточною
  });
}

function toggleTask(id) {
  const state = getState();
  const task = state.tasks.find((item) => item.id === id);

  setState({
    tasks: state.tasks.map((item) => (item.id === id ? { ...item, done: !item.done } : item)),
    // Виконану задачу більше не вважаємо поточною
    currentTaskId: !task.done && state.currentTaskId === id ? null : state.currentTaskId,
  });
}

function deleteTask(id) {
  const state = getState();
  setState({
    tasks: state.tasks.filter((item) => item.id !== id),
    currentTaskId: state.currentTaskId === id ? null : state.currentTaskId,
  });
}

function selectTask(id) {
  const state = getState();
  const task = state.tasks.find((item) => item.id === id);
  if (task.done) return;

  // Повторний клік знімає вибір
  setState({ currentTaskId: state.currentTaskId === id ? null : id });
}

// --- Малюємо ---
let lastTasks = null;
let lastSessions = null;
let lastCurrentId;
let lastLang = null;

function render(state) {
  // Ні задачі, ні сесії, ні мова не змінилися — нічого не перемальовуємо
  if (state.tasks === lastTasks && state.sessions === lastSessions && state.currentTaskId === lastCurrentId && state.lang === lastLang) return;
  lastTasks = state.tasks;
  lastSessions = state.sessions;
  lastCurrentId = state.currentTaskId;
  lastLang = state.lang;

  const tasks = todayTasks(state);

  const items = tasks.map((task) => {
    const item = template.content.firstElementChild.cloneNode(true);
    const isCurrent = task.id === state.currentTaskId;

    item.dataset.id = task.id;
    item.classList.toggle('is-done', task.done);
    item.classList.toggle('is-current', isCurrent);

    item.querySelector('.task-title').textContent = task.title;
    item.querySelector('.task-title').setAttribute('aria-pressed', isCurrent);
    const sessions = state.sessions.filter((session) => session.taskId === task.id).length;
    item.querySelector('.task-sessions').textContent = sessionsLabel(sessions);
    item.querySelector('.task-check').setAttribute('aria-label', task.done ? t('tasks.uncheck') : t('tasks.check'));
    item.querySelector('.task-delete').setAttribute('aria-label', t('tasks.delete'));

    return item;
  });

  list.replaceChildren(...items);

    const isFull = tasks.length >= MAX_TASKS;
  form.hidden = isFull; // три справи вже є — поле більше не потрібне
  input.placeholder = t('tasks.placeholder');

  let hintKey = 'tasks.hint';
  if (tasks.length === 0) hintKey = 'tasks.hintEmpty';
  if (isFull) hintKey = 'tasks.full';
  hint.textContent = t(hintKey);
}

export function initTasks() {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) return;

    addTask(title);
    form.reset();
    input.focus();
  });

  // Один слухач на весь список (делегування подій)
  list.addEventListener('click', (event) => {
    const item = event.target.closest('.task');
    if (!item) return;
    const { id } = item.dataset;

    if (event.target.closest('.task-check')) toggleTask(id);
    else if (event.target.closest('.task-delete')) deleteTask(id);
    else if (event.target.closest('.task-title')) selectTask(id);
  });

  subscribe(render);
  render(getState());
}