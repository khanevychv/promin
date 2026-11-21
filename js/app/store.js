// =========================================
// Сховище: усі дані застосунку в одному місці
// =========================================
const STORAGE_KEY = 'promin-app';

const defaultState = {
  lang: 'uk', // uk | en
  mode: 'focus', // focus | short | long
  settings: {
    focus: 25, // хвилин
    short: 5,
    long: 15,
    longEvery: 4, // довга перерва після кожної 4-ї сесії
    sound: true,
    autoStart: false, // самостійно запускати наступний режим
    keepAwake: true, // не гасити екран, поки йде таймер
  },
  tasks: [],
  sessions: [],
  currentTaskId: null,
  completedInCycle: 0, // скільки сесій фокусу вже пройдено в цьому колі
  timer: { running: false, endTime: null, remaining: null },
};

let state = load();
const listeners = [];

// Завантажуємо збережені дані (або беремо стандартні)
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return structuredClone(defaultState);

    return {
      ...defaultState,
      ...saved,
      settings: { ...defaultState.settings, ...saved.settings },
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// Прочитати поточний стан
export function getState() {
  return state;
}

// Змінити стан: зберегти і повідомити всіх, хто підписався
export function setState(changes) {
  state = { ...state, ...changes };
  save();
  listeners.forEach((listener) => listener(state));
}

// Підписатися на зміни стану
export function subscribe(listener) {
  listeners.push(listener);
}