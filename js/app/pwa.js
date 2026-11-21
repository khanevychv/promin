// =========================================
// PWA: робота без інтернету і встановлення
// =========================================
const installButton = document.querySelector('#install');
let installPrompt = null;

export function initPwa() {
  // Реєструємо service worker (працює лише через http/https, тобто з Live Server)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((error) => {
      console.warn('Service worker не запустився:', error);
    });
  }

  // Браузер повідомляє: «цей застосунок можна встановити»
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // свою плашку браузер не покаже, у нас є кнопка
    installPrompt = event;
    installButton.hidden = false;
  });

  installButton.addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt(); // стандартне вікно «Встановити застосунок?»
    await installPrompt.userChoice;
    installPrompt = null; // одне запрошення можна показати лише раз
    installButton.hidden = true;
  });

  // Застосунок встановили (кнопкою чи через меню браузера)
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installButton.hidden = true;
  });
}