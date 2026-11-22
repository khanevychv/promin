// =========================================
// Акаунт: кнопка в шапці і вікно входу / реєстрації / виходу
// =========================================
import { getState, subscribe } from './store.js';
import { t, pluralize } from './i18n.js';
import { signIn, signUp } from './cloud.js';
import { afterSignIn, getSyncStatus, onSyncStatus, signOutAndClear, deleteAccountAndClear } from './sync.js';

const button = document.querySelector('#account-open');
const dialog = document.querySelector('#account');
const form = document.querySelector('#account-form');
const fields = form.querySelector('.account-fields');
const modeButtons = form.querySelectorAll('.account-mode');
const submitButton = document.querySelector('#account-submit');
const formMessage = form.querySelector('.account-form-message');
const panel = document.querySelector('#account-panel');
const emailText = panel.querySelector('.account-email');
const statusText = panel.querySelector('.account-status');
const panelMessage = panel.querySelector('.account-panel-message');
const signOutButton = document.querySelector('#account-signout');
const deleteButton = document.querySelector('#account-delete');

let mode = 'signin'; // signin | signup
let busy = false;
let confirmSignOut = false; // показали попередження про невідправлені зміни
let confirmDelete = false;
let errorKey = null; // помилка входу, що зараз показана
let panelKey = null; // попередження в панелі: { key, params }

// «щойно», «5 хв тому» / «now», «5 min ago»
function timeAgo(timestamp) {
  const format = new Intl.RelativeTimeFormat(getState().lang, { numeric: 'auto', style: 'short' });
  const seconds = Math.round((timestamp - Date.now()) / 1000);
  if (seconds > -45) return format.format(0, 'second');
  if (seconds > -3600) return format.format(Math.round(seconds / 60), 'minute');
  if (seconds > -86_400) return format.format(Math.round(seconds / 3600), 'hour');
  return format.format(Math.round(seconds / 86_400), 'day');
}

function statusLine(status) {
  if (status.state === 'syncing') return t('account.status.syncing');
  if (status.state === 'error') return t('account.status.error');
  if (status.state === 'pending') {
    return t('account.status.pending', { count: status.pending, word: pluralize(status.pending, 'change') });
  }
  return status.lastSync ? t('account.status.synced', { time: timeAgo(status.lastSync) }) : t('account.status.never');
}

function showMessage(element, text) {
  element.hidden = !text;
  element.textContent = text ?? '';
}

function render() {
  const status = getSyncStatus();
  const signedIn = status.state !== 'guest';

  button.dataset.state = status.state;
  button.setAttribute('aria-label', t(`account.state.${status.state}`));

  form.hidden = signedIn;
  panel.hidden = !signedIn;

  // --- Без входу ---
  modeButtons.forEach((modeButton) => modeButton.setAttribute('aria-pressed', modeButton.dataset.mode === mode));
  submitButton.textContent = t(`account.submit.${mode}`);
  form.elements.password.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  const offline = !navigator.onLine;
  fields.disabled = offline || busy;
  submitButton.disabled = offline || busy;
  showMessage(formMessage, offline ? t('account.offline') : errorKey && t(`account.error.${errorKey}`));

  // --- Після входу ---
  emailText.textContent = signedIn ? t('account.signedAs', { email: status.email ?? '' }) : '';
  statusText.textContent = signedIn ? statusLine(status) : '';
  signOutButton.textContent = confirmSignOut ? t('account.signout.force') : t('account.signout');
  deleteButton.textContent = confirmDelete ? t('account.delete.confirm') : t('account.delete');
  deleteButton.classList.toggle('is-confirm', confirmDelete);
  signOutButton.disabled = busy;
  deleteButton.disabled = busy;
  showMessage(panelMessage, panelKey && t(panelKey.key, panelKey.params));
}

function resetTransient() {
  busy = false;
  confirmSignOut = false;
  confirmDelete = false;
  errorKey = null;
  panelKey = null;
}

async function onSubmit(event) {
  event.preventDefault();
  if (busy || !navigator.onLine) return;

  busy = true;
  errorKey = null;
  render();

  const email = form.elements.email.value.trim();
  const password = form.elements.password.value;
  const result = mode === 'signup' ? await signUp(email, password) : await signIn(email, password);

  if (result.error) {
    busy = false;
    errorKey = result.error;
    render();
    return;
  }

  form.reset();
  await afterSignIn();
  busy = false;
  render();
}

async function onSignOut() {
  busy = true;
  render();
  const result = await signOutAndClear({ force: confirmSignOut });
  busy = false;

  if (result.blocked) {
    confirmSignOut = true;
    panelKey = { key: 'account.signout.warning', params: { count: result.pending } };
    render();
    return;
  }
  resetTransient();
  dialog.close();
  render();
}

async function onDelete() {
  if (!confirmDelete) {
    confirmDelete = true;
    panelKey = { key: 'account.delete.warning' };
    render();
    return;
  }

  busy = true;
  render();
  const result = await deleteAccountAndClear();
  busy = false;

  if (result.error) {
    panelKey = { key: `account.error.${result.error}` };
    render();
    return;
  }
  resetTransient();
  dialog.close();
  render();
}

export function initAccount() {
  button.addEventListener('click', () => {
    resetTransient();
    render();
    dialog.showModal();
  });

  dialog.querySelectorAll('[data-close]').forEach((closeButton) => {
    closeButton.addEventListener('click', () => dialog.close());
  });
  // Клік по затемненню навколо вікна теж закриває його
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  modeButtons.forEach((modeButton) => {
    modeButton.addEventListener('click', () => {
      mode = modeButton.dataset.mode;
      errorKey = null;
      render();
    });
  });

  form.addEventListener('submit', onSubmit);
  signOutButton.addEventListener('click', onSignOut);
  deleteButton.addEventListener('click', onDelete);

  window.addEventListener('online', render);
  window.addEventListener('offline', render);
  onSyncStatus(render);

  // Нова мова — нові тексти (статичні перекладає i18n.js, а ці малюємо тут)
  let lastLang = getState().lang;
  subscribe((state) => {
    if (state.lang === lastLang) return;
    lastLang = state.lang;
    render();
  });

  render();
}
