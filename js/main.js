// =========================================
// Мови: українська / англійська
// =========================================
const translations = {
  uk: {
    // Цих текстів немає в HTML, їх ставить таймер
    'timer.pause': 'Пауза',
    'timer.again': 'Ще раз',
  },
  en: {
    'page.title': 'Promin — focus like a ray of light',
    'brand': 'Promin',
    'nav.features': 'Features',
    'nav.demo': 'Demo',
    'nav.pricing': 'Pricing',
    'nav.faq': 'FAQ',
    'header.cta': 'Try it',

    'hero.badge': '✦ New: version 2.0',
    'hero.title': 'Focus like a ray of light',
    'hero.text': 'Timer, tasks and silence — all in one place. Promin helps you do deep work without distractions.',
    'hero.start': 'Start for free',
    'hero.how': 'How it works',
    'card.label': 'Focus session',
    'card.task1': 'Reply to emails',
    'card.task2': 'Finish the report',
    'card.task3': 'Read 20 pages',

    'features.eyebrow': 'Features',
    'features.title': 'Everything for deep work',
    'features.timer.title': 'Focus timer',
    'features.timer.text': 'Work in 25-minute intervals with short breaks. Promin reminds you when it’s time to rest.',
    'features.quiet.title': 'Quiet mode',
    'features.quiet.text': 'Notifications are muted while a session is running.',
    'features.tasks.title': 'Daily tasks',
    'features.tasks.text': 'Just three main things — nothing extra.',
    'features.stats.title': 'Statistics',
    'features.stats.text': 'See how many hours of focus you logged this week and how your streak keeps growing.',

    'demo.eyebrow': 'Demo',
    'demo.title': 'Try it right now',
    'demo.text': 'This is a real timer. Press “Start” and work for 25 minutes without distractions.',
    'timer.start': 'Start',
    'timer.pause': 'Pause',
    'timer.again': 'Again',
    'timer.reset': 'Reset',

    'pricing.eyebrow': 'Pricing',
    'pricing.title': 'A simple choice',
    'pricing.monthly': 'Monthly',
    'pricing.yearly': 'Yearly',
    'plan.period': '/ mo',
    'plan.currency': '$',
    'plan.start.name': 'Starter',
    'plan.start.text': 'To get started',
    'plan.start.item1': 'Focus timer',
    'plan.start.item2': '3 tasks a day',
    'plan.start.item3': 'Basic statistics',
    'plan.start.button': 'Get started',
    'plan.pro.badge': 'Popular',
    'plan.pro.name': 'Pro',
    'plan.pro.text': 'For everyday work',
    'plan.pro.item1': 'Everything in Starter',
    'plan.pro.item2': 'Unlimited tasks',
    'plan.pro.item3': 'Quiet mode',
    'plan.pro.item4': 'Detailed statistics',
    'plan.pro.button': 'Choose Pro',
    'plan.team.name': 'Team',
    'plan.team.text': 'Up to 10 members',
    'plan.team.item1': 'Everything in Pro',
    'plan.team.item2': 'Shared goals',
    'plan.team.item3': 'Team statistics',
    'plan.team.item4': 'Priority support',
    'plan.team.button': 'Choose Team',

    'faq.eyebrow': 'FAQ',
    'faq.title': 'Frequently asked questions',
    'faq.q1': 'Can I use it for free?',
    'faq.a1': 'Yes. The Starter plan is free forever, no card required.',
    'faq.q2': 'Which devices does Promin work on?',
    'faq.a2': 'Computers, phones and tablets. Everything syncs automatically.',
    'faq.q3': 'Why 25 minutes?',
    'faq.a3': 'It’s the classic Pomodoro rhythm: 25 minutes of work, 5 minutes of rest. You can change the length in settings.',
    'faq.q4': 'Can I cancel my subscription?',
    'faq.a4': 'Anytime, in one click. No hidden fees.',

    'finale.title': 'Start your first focus session',
    'finale.text': 'Free. No card. Takes 10 seconds.',
    'finale.button': 'Try Promin',
    'footer.copy': '© 2026 Promin · Learning project',
  },
};

const translatable = document.querySelectorAll('[data-i18n]');
const langButtons = document.querySelectorAll('.lang-option');

// Українські тексти вже є в HTML: просто запам'ятовуємо їх
translatable.forEach((element) => {
  translations.uk[element.dataset.i18n] = element.textContent.trim();
});

let currentLang = 'uk';

// Повертає текст потрібною мовою (якщо перекладу немає, то українською)
function t(key) {
  return translations[currentLang][key] ?? translations.uk[key];
}

// Ставить текст і запам'ятовує ключ, щоб потім його можна було перекласти
function setText(element, key) {
  element.dataset.i18n = key;
  element.textContent = t(key);
}

function setLanguage(lang) {
  currentLang = lang;
  document.documentElement.lang = lang;
  localStorage.setItem('lang', lang);

  translatable.forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });

  langButtons.forEach((button) => {
    const isActive = button.dataset.lang === lang;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive);
  });
    // Повідомляємо решту сайту, що мова змінилася
  document.dispatchEvent(new Event('langchange'));
}

langButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setLanguage(button.dataset.lang);
  });
});

// Мова при відкритті: збережена раніше, інакше мова браузера
const savedLang = localStorage.getItem('lang');
const browserLang = navigator.language.startsWith('uk') ? 'uk' : 'en';
setLanguage(savedLang || browserLang);
// =========================================
// Світіння карток за курсором
// =========================================
const bento = document.querySelector('.bento');
const cards = document.querySelectorAll('.card');

bento.addEventListener('pointermove', (event) => {
  cards.forEach((card) => {
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--x', `${event.clientX - rect.left}px`);
    card.style.setProperty('--y', `${event.clientY - rect.top}px`);
  });
});

// =========================================
// Таймер фокусу
// =========================================
const FOCUS_TIME = 25 * 60; // 25 хвилин у секундах

const timer = document.querySelector('.timer');
const timeText = document.querySelector('.timer-time');
const progressRing = document.querySelector('.timer-progress');
const startButton = document.querySelector('#timer-start');
const resetButton = document.querySelector('#timer-reset');
const pageTitle = document.title;

let timeLeft = FOCUS_TIME; // скільки секунд залишилось
let endTime = null;        // момент, коли таймер має закінчитися
let intervalId = null;     // «номер» запущеного інтервалу

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function render() {
  timeText.textContent = formatTime(timeLeft);
  progressRing.style.strokeDashoffset = 100 - (timeLeft / FOCUS_TIME) * 100;
  document.title = intervalId ? `${formatTime(timeLeft)} · Промінь` : pageTitle;
}

function tick() {
  timeLeft = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
  render();

  if (timeLeft === 0) {
    stopTimer();
    startButton.textContent = 'Ще раз';
  }
}

function startTimer() {
  if (timeLeft === 0) {
    timeLeft = FOCUS_TIME;
  }
  endTime = Date.now() + timeLeft * 1000;
  intervalId = setInterval(tick, 250);
  timer.classList.add('is-running');
  startButton.textContent = 'Пауза';
  render();
}

function stopTimer() {
  clearInterval(intervalId);
  intervalId = null;
  timer.classList.remove('is-running');
  startButton.textContent = 'Старт';
  render();
}

startButton.addEventListener('click', () => {
  if (intervalId) {
    stopTimer();
  } else {
    startTimer();
  }
});

resetButton.addEventListener('click', () => {
  stopTimer();
  timeLeft = FOCUS_TIME;
  render();
});

render();

// =========================================
// Ціни: щомісяця / щороку
// =========================================
const billing = document.querySelector('.billing');
const billingOptions = document.querySelectorAll('.billing-option');
const prices = document.querySelectorAll('.price');
let currentPeriod = 'month';

function setPeriod(period) {
  currentPeriod = period;

  billingOptions.forEach((option) => {
    const isActive = option.dataset.period === period;
    option.classList.toggle('is-active', isActive);
    option.setAttribute('aria-pressed', isActive);
  });

  billing.classList.toggle('is-year', period === 'year');

  // Для англійської беремо ціни в доларах: data-month-en / data-year-en
  const priceKey = currentLang === 'en' ? `${period}En` : period;

  prices.forEach((price) => {
    const newPrice = price.dataset[priceKey];
    if (price.textContent === newPrice) return;

    price.textContent = newPrice;
    price.animate(
      [
        { opacity: 0, translate: '0 10px' },
        { opacity: 1, translate: '0 0' },
      ],
      { duration: 400, easing: 'ease-out' }
    );
  });
}

billingOptions.forEach((option) => {
  option.addEventListener('click', () => {
    setPeriod(option.dataset.period);
  });
});

setPeriod('month');

// Мова змінилася: перераховуємо ціни у правильній валюті
document.addEventListener('langchange', () => {
  setPeriod(currentPeriod);
});

// =========================================
// Поява блоків при прокрутці
// =========================================
const revealItems = document.querySelectorAll(
  '.eyebrow, section > h2, .section-text, .card, .timer, .timer-buttons, .billing, .plan, .faq-item, .finale p'
);

const observer = new IntersectionObserver((entries) => {
  const visibleEntries = entries.filter((entry) => entry.isIntersecting);

  visibleEntries.forEach((entry, index) => {
    entry.target.style.transitionDelay = `${index * 0.1}s`;
    entry.target.classList.add('is-visible');
    observer.unobserve(entry.target);
  });
}, { threshold: 0.15 });

revealItems.forEach((item) => {
  item.classList.add('reveal');
  observer.observe(item);
});

// =========================================
// Курсор-світлячок
// =========================================
function startCursor() {
  const hasMouse = window.matchMedia('(pointer: fine)').matches;
  if (!hasMouse) return; // на телефонах і планшетах курсора немає

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const smoothness = reduceMotion ? 1 : 0.15;

  const dot = document.createElement('div');
  const glow = document.createElement('div');
  dot.className = 'cursor-dot is-hidden';
  glow.className = 'cursor-glow is-hidden';
  document.body.append(dot, glow);
  document.body.classList.add('has-custom-cursor');

  let mouseX = 0;
  let mouseY = 0;
  let glowX = 0;
  let glowY = 0;

  // Крапка: точно під мишкою
  window.addEventListener('pointermove', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
    dot.style.transform = `translate(${mouseX}px, ${mouseY}px)`;
    dot.classList.remove('is-hidden');
    glow.classList.remove('is-hidden');
  });

  // Сяйво: плавно наздоганяє крапку
  function follow() {
    glowX += (mouseX - glowX) * smoothness;
    glowY += (mouseY - glowY) * smoothness;
    glow.style.transform = `translate(${glowX}px, ${glowY}px)`;
    requestAnimationFrame(follow);
  }
  follow();

  // Над посиланнями і кнопками сяйво збільшується
  document.addEventListener('pointerover', (event) => {
    const isInteractive = event.target.closest('a, button, summary');
    glow.classList.toggle('is-hover', Boolean(isInteractive));
  });

  // Під час кліку стискається
  window.addEventListener('pointerdown', () => glow.classList.add('is-down'));
  window.addEventListener('pointerup', () => glow.classList.remove('is-down'));

  // Мишка пішла за межі вікна: ховаємо
  document.documentElement.addEventListener('mouseleave', () => {
    dot.classList.add('is-hidden');
    glow.classList.add('is-hidden');
  });
}

startCursor();

