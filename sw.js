// =========================================
// Service worker: застосунок працює без інтернету
// =========================================
const CACHE = 'promin-v2'; // змінив список файлів? Збільш номер: promin-v3

// Усе, без чого застосунок не відкриється
const APP_FILES = [
  'app.html',
  'manifest.webmanifest',
  'css/style.css',
  'css/app.css',
  'js/app/main.js',
  'js/app/store.js',
  'js/app/utils.js',
  'js/app/i18n.js',
  'js/app/alerts.js',
  'js/app/timer.js',
  'js/app/tasks.js',
  'js/app/stats.js',
  'js/app/settings.js',
  'js/app/pwa.js',
  'js/app/wakelock.js',
  'icons/icon.svg',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

// 1. Встановлення: одразу кладемо всі файли застосунку в кеш
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting(); // нова версія не чекає, поки закриють старі вкладки
});

// 2. Активація: прибираємо кеші старих версій
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()) // беремо під контроль уже відкриті вкладки
  );
});

// 3. Кожен запит сторінки проходить через нас
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
  } else if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request));
  }
  // Решту запитів не чіпаємо: браузер обробить їх сам
});

// 4. Клік по сповіщенню: повертаємо на екран вікно застосунку
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((windows) => {
      if (windows.length > 0) return windows[0].focus();
      return self.clients.openWindow('app.html');
    })
  );
});

// Свої файли: спершу свіжі з мережі, а без інтернету — з кешу
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) ?? Response.error();
  }
}

// Шрифти не змінюються: спершу кеш, і лише якщо там нема — мережа
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
  return response;
}