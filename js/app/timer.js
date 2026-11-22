// =========================================
// Таймер: фокус → перерва → фокус…
// =========================================
import { getState, setState, subscribe } from './store.js';
import { formatTime, todayKey } from './utils.js';
import { prepareAlerts, playChime, notify } from './alerts.js';
import { t } from './i18n.js';

const panel = document.querySelector('.timer-panel');
const timerBox = document.querySelector('.timer');
const modeButtons = document.querySelectorAll('.mode');
const timeText = document.querySelector('.timer-time');
const progressRing = document.querySelector('.timer-progress');
const startButton = document.querySelector('#timer-start');
const resetButton = document.querySelector('#timer-reset');
const skipButton = document.querySelector('#timer-skip');
const sessionCount = document.querySelector('.session-count');
const currentTask = document.querySelector('.current-task');
const currentTaskTitle = document.querySelector('.current-task-title');

let intervalId = null;
let finishTimeoutId = null;

// Таймер, що стоїть на початку режиму
function idleTimer() {
  return { running: false, endTime: null, remaining: null };
}

// Скільки секунд триває режим
function duration(state) {
  return state.settings[state.mode] * 60;
}

// Скільки секунд лишилося
function secondsLeft(state) {
  if (state.timer.running) {
    return Math.max(0, Math.ceil((state.timer.endTime - Date.now()) / 1000));
  }
  return state.timer.remaining ?? duration(state);
}

// --- Дії ---
function start() {
  prepareAlerts();
  const state = getState();
  const endTime = Date.now() + secondsLeft(state) * 1000;
  setState({ timer: { running: true, endTime, remaining: null } });
}

function pause() {
  const state = getState();
  setState({ timer: { running: false, endTime: null, remaining: secondsLeft(state) } });
}

function reset() {
  setState({ timer: idleTimer() });
}

function changeMode(mode) {
  setState({ mode, timer: idleTimer() });
}

// Режим закінчився (completed = true) або його пропустили (false)
function finishPhase(completed) {
  const state = getState();
  const changes = { timer: idleTimer() };

  if (state.mode === 'focus') {
    if (completed) {
      // Скільки сесій у задачі, рахуємо з цього списку (за taskId), а не окремим лічильником
      changes.sessions = [
        ...state.sessions,
        { id: crypto.randomUUID(), date: todayKey(), minutes: state.settings.focus, taskId: state.currentTaskId },
      ];
      changes.completedInCycle = state.completedInCycle + 1;
    }
    const done = changes.completedInCycle ?? state.completedInCycle;
    changes.mode = done >= state.settings.longEvery ? 'long' : 'short';
  } else {
    if (state.mode === 'long') {
      changes.completedInCycle = 0;
    }
    changes.mode = 'focus';
  }

  setState(changes);

  if (completed) {
    if (state.settings.sound) playChime();
    notify(t(`notify.${state.mode}.title`), t(`notify.${state.mode}.body`));
    if (state.settings.autoStart) start();
  }
}

// --- Кожні 250 мс: оновлюємо час і перевіряємо, чи не кінець ---
function tick() {
  const state = getState();
  renderTime(state);

  if (state.timer.running && secondsLeft(state) === 0) {
    finishPhase(true);
  }
}

// Запускаємо або зупиняємо «годинник» відповідно до стану
function syncTicking(state) {
  clearInterval(intervalId);
  clearTimeout(finishTimeoutId);
  intervalId = null;
  finishTimeoutId = null;

  if (!state.timer.running) return;

  intervalId = setInterval(tick, 250);
  // Окремий «будильник» точно на кінець: спрацює вчасно навіть у фоновій вкладці
  finishTimeoutId = setTimeout(tick, Math.max(0, state.timer.endTime - Date.now()) + 50);
}

// --- Малюємо ---
function renderTime(state) {
  const left = secondsLeft(state);
  timeText.textContent = formatTime(left);
  progressRing.style.strokeDashoffset = 100 - Math.min(left / duration(state), 1) * 100;
  document.title = state.timer.running
    ? `${formatTime(left)} · ${t(`mode.${state.mode}`)}`
    : t('page.title');
}

function render(state) {
  panel.dataset.mode = state.mode;

  modeButtons.forEach((button) => {
    const isActive = button.dataset.mode === state.mode;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive);
  });

  timerBox.classList.toggle('is-running', state.timer.running);
  startButton.textContent = state.timer.running ? t('timer.pause') : t('timer.start');

  const { longEvery } = state.settings;
  sessionCount.textContent = t('timer.session', {
    current: Math.min(state.completedInCycle + 1, longEvery),
    total: longEvery,
  });

  const task = state.tasks.find((item) => item.id === state.currentTaskId);
  currentTask.hidden = !task;
  if (task) currentTaskTitle.textContent = task.title;

  renderTime(state);
  syncTicking(state);
}

export function initTimer() {
  modeButtons.forEach((button) => {
    button.addEventListener('click', () => changeMode(button.dataset.mode));
  });

  startButton.addEventListener('click', () => {
    if (getState().timer.running) {
      pause();
    } else {
      start();
    }
  });

  resetButton.addEventListener('click', reset);
  skipButton.addEventListener('click', () => finishPhase(false));

  subscribe(render);
  render(getState());
  tick(); // якщо таймер скінчився, поки сторінка була закрита
}