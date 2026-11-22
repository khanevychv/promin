// =========================================
// Синхронізація: чисті функції (без мережі й сторінки)
// Черга змін, перетворення в рядки бази, злиття з даними з акаунта.
// =========================================

// Черга: що з локальних даних ще треба відправити в акаунт
// tasks: { [id]: 'upsert' | 'delete' }, sessions: [id], settings: true/false
export function emptyOutbox() {
  return { tasks: {}, sessions: [], settings: false };
}

// Що змінилося між двома станами сховища. Дані незмінні, тож змінена задача — це новий об'єкт.
export function diffState(prev, next) {
  const outbox = emptyOutbox();
  const before = new Map(prev.tasks.map((task) => [task.id, task]));
  const after = new Set(next.tasks.map((task) => task.id));

  next.tasks.forEach((task) => {
    if (before.get(task.id) !== task) outbox.tasks[task.id] = 'upsert';
  });
  before.forEach((_, id) => {
    if (!after.has(id)) outbox.tasks[id] = 'delete';
  });

  const known = new Set(prev.sessions.map((session) => session.id));
  outbox.sessions = next.sessions.filter((session) => !known.has(session.id)).map((session) => session.id);
  outbox.settings = prev.settings !== next.settings;
  return outbox;
}

export function mergeOutbox(a, b) {
  return {
    tasks: { ...a.tasks, ...b.tasks },
    sessions: [...new Set([...a.sessions, ...b.sessions])],
    settings: a.settings || b.settings,
  };
}

export function pendingCount(outbox) {
  return Object.keys(outbox.tasks).length + outbox.sessions.length + (outbox.settings ? 1 : 0);
}

// Прибираємо з черги відправлене — але лише те, що не змінилося, поки йшов запит
export function clearSent(outbox, sent, sentState, currentState) {
  const tasks = { ...outbox.tasks };
  const sentTasks = new Map(sentState.tasks.map((task) => [task.id, task]));
  const current = new Map(currentState.tasks.map((task) => [task.id, task]));

  Object.entries(sent.tasks).forEach(([id, action]) => {
    const unchanged = action === 'delete' ? !current.has(id) : current.get(id) === sentTasks.get(id);
    if (unchanged && tasks[id] === action) delete tasks[id];
  });

  const sentSessions = new Set(sent.sessions);
  return {
    tasks,
    sessions: outbox.sessions.filter((id) => !sentSessions.has(id)), // сесії не змінюються після створення
    settings: outbox.settings && !(sent.settings && currentState.settings === sentState.settings),
  };
}

// --- Локальні об'єкти ↔ рядки бази ---
export function taskToRow(task) {
  return { id: task.id, title: task.title, done: Boolean(task.done), date: task.date, deleted: false };
}

export function rowToTask(row) {
  return { id: row.id, title: row.title, done: row.done, date: row.date };
}

export function sessionToRow(session) {
  return { id: session.id, date: session.date, minutes: session.minutes, task_id: session.taskId ?? null };
}

export function rowToSession(row) {
  return { id: row.id, date: row.date, minutes: row.minutes, taskId: row.task_id };
}

// Налаштування з бази можуть бути будь-якими: беремо лише відомі поля і в межах форми
const LIMITS = { focus: [1, 90], short: [1, 30], long: [1, 60], longEvery: [2, 8] };

export function clampSettings(data, defaults) {
  const result = {};
  Object.entries(defaults).forEach(([key, fallback]) => {
    const value = data?.[key];
    if (LIMITS[key]) {
      const [min, max] = LIMITS[key];
      result[key] = typeof value === 'number' && Number.isFinite(value)
        ? Math.min(max, Math.max(min, Math.round(value)))
        : fallback;
    } else if (typeof fallback === 'boolean') {
      result[key] = value === undefined ? fallback : Boolean(value);
    } else {
      result[key] = fallback;
    }
  });
  return result;
}

const sameTask = (a, b) => a.title === b.title && a.done === b.done && a.date === b.date;
const sameSettings = (a, b) => Object.keys(a).every((key) => a[key] === b[key]);

// Зливаємо дані з акаунта в локальний стан. Правило: незвідправлена локальна зміна перемагає,
// інакше перемагає база. Повертаємо лише змінені поля (порожній об'єкт — нічого не змінилося).
export function mergeRemote(state, remote, outbox) {
  const changes = {};

  const tasks = [...state.tasks];
  const index = new Map(tasks.map((task, i) => [task.id, i]));
  const removed = new Set();
  let tasksChanged = false;

  (remote.tasks ?? []).forEach((row) => {
    if (outbox.tasks[row.id]) return;
    const at = index.get(row.id);
    if (row.deleted) {
      if (at !== undefined) { removed.add(row.id); tasksChanged = true; }
      return;
    }
    const incoming = rowToTask(row);
    if (at === undefined) {
      index.set(row.id, tasks.push(incoming) - 1);
      tasksChanged = true;
    } else if (!sameTask(tasks[at], incoming)) {
      tasks[at] = incoming;
      tasksChanged = true;
    }
  });

  if (tasksChanged) {
    changes.tasks = tasks.filter((task) => !removed.has(task.id));
    if (state.currentTaskId && !changes.tasks.some((task) => task.id === state.currentTaskId)) {
      changes.currentTaskId = null;
    }
  }

  const known = new Set(state.sessions.map((session) => session.id));
  const fresh = (remote.sessions ?? []).filter((row) => !known.has(row.id)).map(rowToSession);
  if (fresh.length > 0) changes.sessions = [...state.sessions, ...fresh];

  if (remote.settings && !outbox.settings) {
    const settings = clampSettings(remote.settings.data, state.settings);
    if (!sameSettings(settings, state.settings)) changes.settings = settings;
  }

  return changes;
}

// Перший вхід на пристрої: чиї налаштування взяти. Стандартні (ніколи не змінені) завжди поступаються.
export function pickSettings(settingsChangedAt, remoteRow) {
  if (!remoteRow) return 'local';
  if (!settingsChangedAt) return 'remote';
  return Date.parse(remoteRow.updated_at) > settingsChangedAt ? 'remote' : 'local';
}

export function chunk(list, size = 500) {
  const parts = [];
  for (let i = 0; i < list.length; i += size) parts.push(list.slice(i, i + size));
  return parts;
}
