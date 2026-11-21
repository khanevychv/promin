// =========================================
// Налаштування у спливаючому вікні
// =========================================
import { getState, setState } from './store.js';
import { prepareAlerts, playChime } from './alerts.js';

const dialog = document.querySelector('#settings');
const form = document.querySelector('#settings-form');
const openButton = document.querySelector('#settings-open');
const soundTestButton = document.querySelector('#sound-test');

const NUMBER_FIELDS = ['focus', 'short', 'long', 'longEvery'];
const CHECK_FIELDS = ['sound', 'autoStart', 'keepAwake'];

// Заповнюємо поля поточними налаштуваннями
function fillForm() {
  const { settings } = getState();
  NUMBER_FIELDS.forEach((name) => {
    form.elements[name].value = settings[name];
  });
  CHECK_FIELDS.forEach((name) => {
    form.elements[name].checked = settings[name];
  });
}

// Збираємо значення з полів в об'єкт
function readForm() {
  const settings = {};
  NUMBER_FIELDS.forEach((name) => {
    settings[name] = Number(form.elements[name].value);
  });
  CHECK_FIELDS.forEach((name) => {
    settings[name] = form.elements[name].checked;
  });
  return settings;
}

export function initSettings() {
  openButton.addEventListener('click', () => {
    fillForm();
    dialog.returnValue = ''; // забуваємо, чим закінчилося минулого разу
    dialog.showModal();
  });

  // Вікно закрилося: зберігаємо, лише якщо натиснули «Зберегти»
  dialog.addEventListener('close', () => {
    if (dialog.returnValue !== 'save') return;

    const state = getState();
    setState({
      settings: { ...state.settings, ...readForm() },
      // Якщо таймер не йде, режим почнеться з новою тривалістю
      timer: state.timer.running ? state.timer : { running: false, endTime: null, remaining: null },
    });
  });

  // Клік по затемненню навколо вікна теж закриває його
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  soundTestButton.addEventListener('click', () => {
    prepareAlerts();
    playChime();
  });
}