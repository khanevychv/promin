// =========================================
// Головний файл застосунку: збирає всі модулі
// =========================================
import { initI18n } from './i18n.js';
import { initTimer } from './timer.js';
import { initTasks } from './tasks.js';
import { initStats } from './stats.js';
import { initSettings } from './settings.js';
import { initPwa } from './pwa.js';
import { initWakeLock } from './wakelock.js';

initI18n(); // мова — першою, щоб усі інші одразу малювали потрібною мовою
initTimer();
initTasks();
initStats();
initSettings();
initPwa();
initWakeLock();