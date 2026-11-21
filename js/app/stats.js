// =========================================
// Статистика: сьогодні, тиждень, серія днів
// =========================================
import { getState, subscribe } from './store.js';
import { todayKey } from './utils.js';
import { t, pluralize, dayName } from './i18n.js';

const minutesValue = document.querySelector('#stat-minutes');
const sessionsValue = document.querySelector('#stat-sessions');
const sessionsLabel = document.querySelector('#stat-sessions-label');
const streakValue = document.querySelector('#stat-streak');
const streakLabel = document.querySelector('#stat-streak-label');
const week = document.querySelector('#week');

const DAY_GOAL = 100; // хвилин: стовпчик такої висоти займає весь графік

// Новий день, зсунутий на days днів
function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

// Хвилини фокусу по днях: { "2026-11-21": 75, ... }
function minutesByDay(sessions) {
  const totals = {};
  sessions.forEach((session) => {
    totals[session.date] = (totals[session.date] ?? 0) + session.minutes;
  });
  return totals;
}

// Сім дат поточного тижня, з понеділка по неділю
function weekDates() {
  const today = new Date();
  const daysSinceMonday = (today.getDay() + 6) % 7;
  const monday = addDays(today, -daysSinceMonday);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

// Скільки днів поспіль був хоча б один фокус
function streak(totals) {
  let day = new Date();
  // Сьогодні ще не працював? Серія не обривається, рахуємо від учора
  if (!totals[todayKey(day)]) day = addDays(day, -1);

  let count = 0;
  while (totals[todayKey(day)]) {
    count += 1;
    day = addDays(day, -1);
  }
  return count;
}

// --- Малюємо ---
let lastSessions = null;
let lastLang = null;

function render(state) {
  if (state.sessions === lastSessions && state.lang === lastLang) return;
  lastSessions = state.sessions;
  lastLang = state.lang;

  const totals = minutesByDay(state.sessions);
  const today = todayKey();

  const sessionsToday = state.sessions.filter((session) => session.date === today).length;
  const days = streak(totals);

  minutesValue.textContent = Math.round(totals[today] ?? 0);
  sessionsValue.textContent = sessionsToday;
  sessionsLabel.textContent = t('stats.sessions', { word: pluralize(sessionsToday, 'session') });
  streakValue.textContent = days;
  streakLabel.textContent = t('stats.streak', { word: pluralize(days, 'day') });

  weekDates().forEach((date, index) => {
    const key = todayKey(date);
    const minutes = Math.round(totals[key] ?? 0);
    const column = week.children[index];
    const name = dayName(date);

    column.classList.toggle('is-today', key === today);
    column.title = `${name}: ${minutes} ${t('stats.min')}`;
    column.querySelector('span').textContent = name;
    column.querySelector('.week-bar').style.setProperty('--h', `${Math.min(minutes / DAY_GOAL, 1) * 100}%`);
  });
}

export function initStats() {
  // Сім стовпчиків створюємо один раз, далі лише змінюємо їхню висоту і підписи
  for (let index = 0; index < 7; index += 1) {
    const column = document.createElement('div');
    column.className = 'week-day';

    const bar = document.createElement('div');
    bar.className = 'week-bar';

    column.append(bar, document.createElement('span'));
    week.append(column);
  }

  subscribe(render);
  render(getState());
}