// =========================================
// Екран не гасне, поки йде таймер
// =========================================
import { getState, subscribe } from './store.js';

let lock = null;
let lastWanted = false;

// Чи треба зараз тримати екран увімкненим
function shouldKeepOn(state) {
  return state.timer.running && state.settings.keepAwake;
}

async function keepScreenOn() {
  try {
    const newLock = await navigator.wakeLock.request('screen');
    // Поки браузер думав, таймер могли вже зупинити
    if (shouldKeepOn(getState())) lock = newLock;
    else newLock.release();
  } catch {
    // Браузер відмовив (наприклад, увімкнено енергозбереження). Нічого страшного
  }
}

function letScreenSleep() {
  lock?.release();
  lock = null;
}

function render(state) {
  const wanted = shouldKeepOn(state);
  if (wanted === lastWanted) return; // нічого не змінилося
  lastWanted = wanted;

  if (wanted) keepScreenOn();
  else letScreenSleep();
}

export function initWakeLock() {
  if (!('wakeLock' in navigator)) return; // старий браузер або сайт без https

  subscribe(render);
  render(getState());

  // Згорнув застосунок — браузер сам відпустив екран. Повернувся — тримаємо знову
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && shouldKeepOn(getState())) keepScreenOn();
  });
}