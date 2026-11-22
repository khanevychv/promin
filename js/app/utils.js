// =========================================
// Дрібні допоміжні функції для всього застосунку
// =========================================

// 1500 → "25:00"
export function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Дата у вигляді "2026-11-21" (за місцевим часом)
export function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Унікальний id. crypto.randomUUID є лише на https і localhost, тож на http
// (наприклад, телефон у домашній мережі) беремо 16 випадкових байтів
export function createUid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
