// =========================================
// Мови застосунку: українська / англійська
// =========================================
import { getState, setState, subscribe } from './store.js';

const translations = {
  uk: {
    'page.title': 'Промінь — застосунок',
    'brand': 'Промінь',
    'language': 'Мова',
    'settings.open': 'Налаштування',
    'app.install': 'Встановити',

    'timer.heading': 'Таймер фокусу',
    'mode.focus': 'Фокус',
    'mode.short': 'Перерва',
    'mode.long': 'Довга перерва',
    'timer.now': 'Зараз:',
    'timer.start': 'Старт',
    'timer.pause': 'Пауза',
    'timer.reset': 'Скинути',
    'timer.skip': 'Пропустити',
    'timer.session': 'Сесія {current} з {total}',

    'notify.focus.title': 'Сесію завершено 🎉',
    'notify.focus.body': 'Час на перерву.',
    'notify.short.title': 'Перерва скінчилась',
    'notify.short.body': 'Повертаймося до фокусу.',
    'notify.long.title': 'Довга перерва скінчилась',
    'notify.long.body': 'Починаємо нове коло.',

    'tasks.title': 'Три головні справи',
    'tasks.placeholder': 'Що важливе сьогодні?',
    'tasks.full': 'Три справи на сьогодні вже є 💪 Натисни на задачу, щоб працювати над нею.',
    'tasks.add': 'Додати',
    'tasks.hintEmpty': 'Додай до трьох головних справ на сьогодні.',
    'tasks.hint': 'Натисни на задачу, щоб працювати над нею.',
    'tasks.check': 'Позначити виконаною',
    'tasks.uncheck': 'Позначити невиконаною',
    'tasks.delete': 'Видалити',

    'stats.title': 'Статистика',
    'stats.minutes': 'хв фокусу сьогодні',
    'stats.sessions': '{word} сьогодні',
    'stats.streak': '{word} поспіль',
    'stats.week': 'Хвилини фокусу за цей тиждень',
    'stats.min': 'хв',

    'settings.title': 'Налаштування',
    'settings.focus': 'Фокус, хв',
    'settings.short': 'Перерва, хв',
    'settings.long': 'Довга перерва, хв',
    'settings.longEvery': 'Сесій до довгої перерви',
    'settings.sound': 'Звук і вібрація наприкінці сесії',
    'settings.autoStart': 'Автоматично запускати наступний режим',
    'settings.keepAwake': 'Не гасити екран, поки йде таймер',
    'settings.soundTest': 'Перевірити звук',
    'settings.cancel': 'Скасувати',
    'settings.save': 'Зберегти',
    'account.open': 'Акаунт',
    'account.state.guest': 'Акаунт: вхід не виконано',
    'account.state.synced': 'Акаунт: синхронізовано',
    'account.state.pending': 'Акаунт: чекає інтернету',
    'account.state.syncing': 'Акаунт: синхронізація',
    'account.state.error': 'Акаунт: помилка синхронізації',
    'account.title': 'Акаунт',
    'account.lead': 'Увійди, щоб задачі й статистика були на всіх твоїх пристроях.',
    'account.modes': 'Вхід або реєстрація',
    'account.signin': 'Вхід',
    'account.signup': 'Реєстрація',
    'account.email': 'Пошта',
    'account.password': 'Пароль (від 8 символів)',
    'account.note': 'Відновити пароль поки не можна, тож запиши його.',
    'account.submit.signin': 'Увійти',
    'account.submit.signup': 'Створити акаунт',
    'account.close': 'Закрити',
    'account.offline': 'Потрібен інтернет.',
    'account.error.invalid': 'Неправильна пошта або пароль.',
    'account.error.exists': 'Ця пошта вже зареєстрована. Спробуй увійти.',
    'account.error.weak': 'Пароль закороткий: потрібно щонайменше 8 символів.',
    'account.error.email': 'Перевір адресу пошти.',
    'account.error.offline': 'Немає інтернету. Спробуй, коли з’явиться мережа.',
    'account.error.unavailable': 'Сервер зараз недоступний. Спробуй пізніше.',
    'account.signedAs': 'Вхід виконано: {email}',
    'account.status.synced': 'Синхронізовано · {time}',
    'account.status.never': 'Ще не синхронізовано',
    'account.status.syncing': 'Синхронізую…',
    'account.status.pending': 'Чекає інтернету: {count} {word}',
    'account.status.error': 'Не вдалося синхронізувати, спробую ще раз.',
    'account.signout': 'Вийти',
    'account.signout.force': 'Вийти все одно',
    'account.signout.warning': 'Є невідправлені зміни ({count}): після виходу вони зникнуть. Підключись до інтернету або вийди все одно.',
    'account.delete': 'Видалити акаунт',
    'account.delete.confirm': 'Так, видалити назавжди',
    'account.delete.warning': 'Акаунт і всі його задачі, сесії та налаштування буде видалено назавжди.',
  },
  en: {
    'page.title': 'Promin — app',
    'brand': 'Promin',
    'language': 'Language',
    'settings.open': 'Settings',
    'app.install': 'Install',

    'timer.heading': 'Focus timer',
    'mode.focus': 'Focus',
    'mode.short': 'Break',
    'mode.long': 'Long break',
    'timer.now': 'Now:',
    'timer.start': 'Start',
    'timer.pause': 'Pause',
    'timer.reset': 'Reset',
    'timer.skip': 'Skip',
    'timer.session': 'Session {current} of {total}',

    'notify.focus.title': 'Session complete 🎉',
    'notify.focus.body': 'Time for a break.',
    'notify.short.title': 'Break is over',
    'notify.short.body': 'Back to focus.',
    'notify.long.title': 'Long break is over',
    'notify.long.body': 'Starting a new round.',

    'tasks.title': 'Three main things',
    'tasks.placeholder': 'What matters today?',
    'tasks.full': 'You have three for today 💪 Click a task to work on it.',
    'tasks.add': 'Add',
    'tasks.hintEmpty': 'Add up to three main things for today.',
    'tasks.hint': 'Click a task to work on it.',
    'tasks.check': 'Mark as done',
    'tasks.uncheck': 'Mark as not done',
    'tasks.delete': 'Delete',

    'stats.title': 'Statistics',
    'stats.minutes': 'min of focus today',
    'stats.sessions': '{word} today',
    'stats.streak': '{word} in a row',
    'stats.week': 'Focus minutes this week',
    'stats.min': 'min',

    'settings.title': 'Settings',
    'settings.focus': 'Focus, min',
    'settings.short': 'Break, min',
    'settings.long': 'Long break, min',
    'settings.longEvery': 'Sessions before a long break',
    'settings.sound': 'Sound and vibration at the end of a session',
    'settings.autoStart': 'Start the next mode automatically',
    'settings.keepAwake': 'Keep the screen on while the timer runs',
    'settings.soundTest': 'Test sound',
    'settings.cancel': 'Cancel',
    'settings.save': 'Save',
    'account.open': 'Account',
    'account.state.guest': 'Account: not signed in',
    'account.state.synced': 'Account: synced',
    'account.state.pending': 'Account: waiting for the internet',
    'account.state.syncing': 'Account: syncing',
    'account.state.error': 'Account: sync error',
    'account.title': 'Account',
    'account.lead': 'Sign in to have your tasks and statistics on all your devices.',
    'account.modes': 'Sign in or sign up',
    'account.signin': 'Sign in',
    'account.signup': 'Sign up',
    'account.email': 'Email',
    'account.password': 'Password (8+ characters)',
    'account.note': 'Passwords can’t be recovered yet, so write yours down.',
    'account.submit.signin': 'Sign in',
    'account.submit.signup': 'Create account',
    'account.close': 'Close',
    'account.offline': 'You need an internet connection.',
    'account.error.invalid': 'Wrong email or password.',
    'account.error.exists': 'This email is already registered. Try signing in.',
    'account.error.weak': 'The password is too short: use at least 8 characters.',
    'account.error.email': 'Check the email address.',
    'account.error.offline': 'No internet. Try again when you are online.',
    'account.error.unavailable': 'The server is unavailable right now. Try again later.',
    'account.signedAs': 'Signed in as {email}',
    'account.status.synced': 'Synced · {time}',
    'account.status.never': 'Not synced yet',
    'account.status.syncing': 'Syncing…',
    'account.status.pending': 'Waiting for the internet: {count} {word}',
    'account.status.error': 'Could not sync, will try again.',
    'account.signout': 'Sign out',
    'account.signout.force': 'Sign out anyway',
    'account.signout.warning': 'There are unsent changes ({count}): they will be lost after signing out. Connect to the internet or sign out anyway.',
    'account.delete': 'Delete account',
    'account.delete.confirm': 'Yes, delete forever',
    'account.delete.warning': 'The account and all its tasks, sessions and settings will be deleted forever.',
  },
};

// Форми слів після чисел: в українській їх три, в англійській дві
const pluralWords = {
  uk: {
    session: { one: 'сесія', few: 'сесії', many: 'сесій' },
    day: { one: 'день', few: 'дні', many: 'днів' },
    change: { one: 'зміна', few: 'зміни', many: 'змін' },
  },
  en: {
    session: { one: 'session', other: 'sessions' },
    day: { one: 'day', other: 'days' },
    change: { one: 'change', other: 'changes' },
  },
};

// Текст поточною мовою; {назва} у тексті замінюється на значення з params
export function t(key, params = {}) {
  const { lang } = getState();
  let text = translations[lang]?.[key] ?? translations.uk[key] ?? key;

  Object.entries(params).forEach(([name, value]) => {
    text = text.replace(`{${name}}`, value);
  });
  return text;
}

// Правильна форма слова: pluralize(5, 'session') → «сесій» / «sessions»
export function pluralize(count, word) {
  const { lang } = getState();
  const forms = pluralWords[lang][word];
  const category = new Intl.PluralRules(lang).select(count);
  return forms[category] ?? forms.other ?? forms.many;
}

// Назва дня тижня: «Пн» / «Mon»
export function dayName(date) {
  const { lang } = getState();
  const name = new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(date);
  return name[0].toUpperCase() + name.slice(1);
}

export function setLanguage(lang) {
  localStorage.setItem('lang', lang); // спільна з лендінгом пам'ять про мову
  setState({ lang });
}

// --- Тексти, що стоять прямо в HTML ---
let lastLang = null;

function applyStatic(state) {
  if (state.lang === lastLang) return;
  lastLang = state.lang;

  document.documentElement.lang = state.lang;

  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-label]').forEach((element) => {
    element.setAttribute('aria-label', t(element.dataset.i18nLabel));
  });

  document.querySelectorAll('.lang-option').forEach((button) => {
    const isActive = button.dataset.lang === state.lang;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive);
  });
}

export function initI18n() {
  // Мова: та, що вибрали на лендінгу чи тут, інакше мова браузера
  const saved = localStorage.getItem('lang');
  const lang = saved || (navigator.language.startsWith('uk') ? 'uk' : 'en');
  setState({ lang });

  document.querySelectorAll('.lang-option').forEach((button) => {
    button.addEventListener('click', () => setLanguage(button.dataset.lang));
  });

  subscribe(applyStatic);
  applyStatic(getState());
}