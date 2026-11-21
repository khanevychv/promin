// =========================================
// Сигнали: звук, вібрація і системні сповіщення
// =========================================
let audioContext = null;

// Викликаємо при натисканні «Старт»: браузер дозволяє звук
// і сповіщення лише після дії користувача
export function prepareAlerts() {
  audioContext ??= new AudioContext();
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// М'який дзвіночок із двох нот, без жодного аудіофайлу
export function playChime() {
  navigator.vibrate?.([200, 100, 200]); // на телефоні ще й вібрація (iPhone її не вміє)
  if (!audioContext) return;

  [660, 880].forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const start = audioContext.currentTime + index * 0.25;

    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;

    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.3, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.9);

    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.9);
  });
}

// Системне сповіщення, якщо застосунок зараз не на екрані
export async function notify(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!document.hidden) return;

  const options = { body, icon: 'icons/icon-512.png', tag: 'promin' };

  // Через service worker сповіщення працюють і на телефонах
  // (на Android new Notification() просто викидає помилку)
  const registration = await navigator.serviceWorker?.getRegistration();
  if (registration) {
    registration.showNotification(title, options);
  } else {
    new Notification(title, options);
  }
}