# Промінь: акаунти й синхронізація — план реалізації

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** акаунт (пошта + пароль) і синхронізація задач, сесій фокусу й налаштувань між пристроями, без втрати офлайну і без змін для гостя.

**Architecture:** локальне сховище (`store.js`) лишається головним. Чисті функції синхронізації (`sync-core.js`, тестуються в Node) рахують чергу змін і злиття; `sync.js` відправляє чергу в Supabase і підтягує чужі зміни; `cloud.js` — єдиний модуль, що вантажить supabase-js (динамічно, з CDN). RLS у базі пускає лише до своїх рядків.

**Tech Stack:** ванільний JS (ES-модулі, без збирача), Supabase (Postgres + Auth), `@supabase/supabase-js@2.119.0` з `cdn.jsdelivr.net`, Supabase CLI 3.1, `node --test` для чистих функцій і хмарних перевірок через `fetch`, headless Edge (`cdp.js`) для сценаріїв у браузері.

**Spec:** `docs/superpowers/specs/2026-11-22-promin-accounts-sync-design.md`

## Global Constraints

- Вхід: пошта + пароль; підтвердження пошти вимкнене; мінімум 8 символів; реєстрація відкрита.
- Проєкт Supabase `promin`, регіон `eu-central-1`, безкоштовний тариф, організація Віталія.
- Site URL `https://khanevychv.github.io/promin/app.html`; додаткові адреси `http://127.0.0.1:5500/**`, `http://localhost:5500/**`.
- Синхронізуються: задачі, сесії фокусу, налаштування `focus, short, long, longEvery, sound, autoStart, keepAwake`. Не синхронізуються: `lang`, `mode`, `timer`, `currentTaskId`, `completedInCycle`.
- supabase-js лише через `import()` у `cloud.js`; ядро застосунку не імпортує нічого з CDN.
- У репозиторій не потрапляють `service_role`/секретні ключі і пароль бази. Публічний ключ (`sb_publishable_…`) — можна.
- Усі нові тексти — у `i18n.js`, UA і EN.
- Коміти з поштою `171191919+khanevychv@users.noreply.github.com`, повідомлення закінчуються `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Тестові акаунти: `promin-test-<random>@example.com`, видаляються наприкінці кожного прогону.

## Review Focus

1. Запит обривається посеред відправлення (повільна мережа): елемент лишається в черзі, повтор не створює дублікатів (upsert за `(user_id, id)`). → Task 4, тест `clearSent лишає змінене під час відправлення`.
2. Проєкт на паузі / Supabase недоступний: стан «помилка», застосунок працює, повтори з паузою, а не безперервно. → Task 7, сценарій «Supabase недоступний».
3. Багато даних при першому вході (сотні сесій): відправлення частинами по 500. → Task 4, тест `chunk ділить на частини по 500`.
4. Акаунт видалили на іншому пристрої, а тут ще є сесія: відповідь 401/403 на синхронізацію → локальний вихід без втрати гостьового режиму. → Task 7, сценарій «акаунт видалено деінде».
5. Дві вкладки на одному пристрої: черга спільна (`localStorage`), повторне відправлення того самого безпечне. → Task 7, сценарій «дві вкладки».

---

### Task 1: Репозиторій у `D:\Web\promin`

**Files:** `.gitignore` (новий), `docs/superpowers/specs/…`, `docs/superpowers/plans/…`

- [ ] **Step 1:** `git init -b main`, `remote add origin https://github.com/khanevychv/promin.git`, `fetch`, `git reset origin/main` (mixed: робоче дерево не чіпаємо). Локальні `user.name khanevychv`, `user.email` з Global Constraints.
- [ ] **Step 2:** `git status` — змінені лише `docs/…` (файли сайту збігаються з `origin/main`). Якщо ні — зупинитись і з'ясувати.
- [ ] **Step 3:** `.gitignore`: `supabase/.temp/`, `supabase/.branches/`, `*.log`.
- [ ] **Step 4:** Коміт `docs: stage B design and plan (accounts + sync)`. Не пушити до Task 8.

### Task 2: Проєкт Supabase і схема бази

**Files:** `supabase/config.toml` (через `supabase init`), `supabase/migrations/20261122000000_init.sql`, `js/app/config.js`, `tests/cloud.test.mjs`

**Interfaces — Produces:** таблиці `tasks`, `focus_sessions`, `settings`; RPC `delete_account()`; `config.js` експортує `SUPABASE_URL`, `SUPABASE_KEY`.

- [ ] **Step 1:** Віталій виконує `supabase login` (браузер). Без цього кроку далі не йти.
- [ ] **Step 2:** `supabase orgs list` → id організації; згенерувати пароль бази (32 випадкові символи, тримати лише в змінній середовища сесії); `supabase projects create promin --org-id <id> --db-password $env:PROMIN_DB_PASSWORD --region eu-central-1`; дочекатися `ACTIVE_HEALTHY` у `supabase projects list`.
- [ ] **Step 3:** `supabase init` у `D:\Web\promin`; у `config.toml`: `[auth] site_url`, `additional_redirect_urls`, `minimum_password_length = 8`, `enable_signup = true`; `[auth.email] enable_signup = true`, `enable_confirmations = false`. `supabase link --project-ref <ref>`.
- [ ] **Step 4: Написати тест, що падає** — `tests/cloud.test.mjs` (`node --test`, лише `fetch` до `/auth/v1` і `/rest/v1`), читає URL і ключ з `js/app/config.js`:
  - `реєстрація без підтвердження пошти дає сесію` — `POST /auth/v1/signup` повертає `access_token`.
  - `пароль коротший за 8 відхиляється` — статус 422.
  - `A бачить свої задачі, B — ні` — A вставляє задачу; `GET /rest/v1/tasks` від B → `[]`.
  - `без входу таблиці недоступні` — запит лише з `apikey` → `[]` або 401.
  - `updated_at ставить сервер` — A шле `updated_at: '2000-01-01'`, читає назад → свіжий час.
  - `delete_account прибирає користувача і рядки` — після `POST /rest/v1/rpc/delete_account` вхід A → 400, рядків немає.
  - `after()` видаляє всіх створених тестових користувачів.
- [ ] **Step 5:** `node --test tests/` → FAIL (таблиць ще немає / config.js відсутній).
- [ ] **Step 6:** Міграція `…_init.sql`: таблиці як у спеці (`tasks(user_id, id, title 1–80, done, date, deleted, created_at, updated_at)`, `focus_sessions(user_id, id, date, minutes 1–240, task_id, created_at)`, `settings(user_id pk, data jsonb, updated_at)`), `user_id default auth.uid() references auth.users on delete cascade`, ключі `(user_id, id)`, тригер `set_updated_at` (before insert or update → `now()`), індекси `(user_id, updated_at)` / `(user_id, created_at)`, RLS + одна політика `for all to authenticated using/with check (user_id = (select auth.uid()))` на кожну таблицю, `revoke all … from anon`, функція `public.delete_account()` (`security definer`, `set search_path = ''`, `delete from auth.users where id = auth.uid()`), `revoke execute … from public, anon`, `grant execute … to authenticated`.
- [ ] **Step 7:** `supabase db push -p $env:PROMIN_DB_PASSWORD`; `supabase config push --yes`; `supabase projects api-keys --project-ref <ref>` → publishable ключ у `js/app/config.js`.
- [ ] **Step 8:** `node --test tests/` → PASS (6 тестів).
- [ ] **Step 9:** Коміт `feat(cloud): Supabase project schema with RLS, auth config`.

### Task 3: Сховище готове до синхронізації

**Files:** `js/app/store.js`, `js/app/timer.js`, `js/app/tasks.js`, `js/app/settings.js`

**Interfaces — Produces:**
- кожна сесія `{ id, date, minutes, taskId }`; `load()` дає `id` (`crypto.randomUUID()`) старим сесіям без нього;
- `state.settingsChangedAt: number` (мс, `0` за замовчуванням) — ставить `settings.js` при «Зберегти»;
- `resetAccountData(): void` у `store.js` — повертає `tasks, sessions, settings, settingsChangedAt, currentTaskId, completedInCycle, mode, timer` до стандартних, `lang` лишає;
- `setState(changes, meta = {})` передає `meta` слухачам: `listener(state, meta)`;
- лічильник сесій задачі в `tasks.js` = кількість `state.sessions` з `taskId === task.id`; `timer.js` більше не збільшує `task.sessions`.

- [ ] **Step 1:** Браузерний сценарій (`cdp.js`, копія в scratchpad): у `localStorage` старий стан без `id` у сесіях і з `task.sessions = 2` → після завантаження в усіх сесій є `id`, задача показує «2 сесії», статистика та сама.
- [ ] **Step 2:** Запустити → FAIL (`id` немає).
- [ ] **Step 3:** Реалізувати інтерфейси вище.
- [ ] **Step 4:** Сценарій → PASS; крім того: завершена сесія фокусу додає сесію з `id` і `taskId`; «Зберегти» в налаштуваннях ставить `settingsChangedAt`; `resetAccountData()` лишає `lang`.
- [ ] **Step 5:** Коміт `refactor(store): session ids, derived task counts, settingsChangedAt`.

### Task 4: Чисті функції синхронізації

**Files:** `js/app/sync-core.js`, `tests/sync-core.test.mjs`

**Interfaces — Produces** (усе — чисті функції, без DOM і мережі):
- `emptyOutbox(): Outbox` — `{ tasks: {}, sessions: [], settings: false }`, де `tasks[id] = 'upsert' | 'delete'`.
- `diffState(prev, next): Outbox` — змінені/нові задачі за посиланням, зниклі → `'delete'`, нові сесії за `id`, `settings !== ` → `true`.
- `mergeOutbox(a, b): Outbox`; `pendingCount(outbox): number`.
- `clearSent(outbox, sent, prevSnapshot, nextSnapshot): Outbox` — прибирає відправлене, якщо елемент не змінився відтоді.
- `taskToRow(task)`, `rowToTask(row)`, `sessionToRow(s)`, `rowToSession(row)` — `taskId ↔ task_id`, без `user_id`.
- `clampSettings(data, defaults): Settings` — межі як у формі: focus 1–90, short 1–30, long 1–60, longEvery 2–8, булеві — `Boolean`.
- `mergeRemote(state, remote, outbox): Partial<State>` — `remote = { tasks: rows, sessions: rows, settings: row|null }`; локальне з черги перемагає; `deleted` прибирає задачу; зникла поточна задача → `currentTaskId: null`; сесії — об'єднання за `id`.
- `pickSettings(local, settingsChangedAt, remoteRow): 'local' | 'remote'` — `remote`, якщо `settingsChangedAt === 0` або `remoteRow.updated_at` новіше; без рядка → `'local'`.
- `chunk(list, size = 500): Array[]`.

- [ ] **Step 1: Тести, що падають** (`node --test tests/sync-core.test.mjs`), зокрема:
  - `diffState: змінена задача → upsert, видалена → delete, нова сесія → id`;
  - `diffState: незмінений стан → порожня черга`;
  - `mergeRemote: незвідправлена локальна зміна перемагає`;
  - `mergeRemote: deleted прибирає задачу і знімає currentTaskId`;
  - `mergeRemote: сесії об'єднуються без дублікатів`;
  - `pickSettings: нові стандартні налаштування не перезаписують базу`;
  - `pickSettings: свіжіші локальні перемагають`;
  - `clearSent лишає змінене під час відправлення` (Review Focus 1);
  - `chunk ділить 1201 елемент на 500, 500, 201` (Review Focus 3);
  - `clampSettings обрізає 999 хв до 90 і відкидає зайві ключі`.
- [ ] **Step 2:** Запустити → FAIL (модуля немає).
- [ ] **Step 3:** Реалізувати.
- [ ] **Step 4:** Запустити → PASS.
- [ ] **Step 5:** Коміт `feat(sync): pure outbox and merge functions with tests`.

### Task 5: Хмара і синхронізація в браузері

**Files:** `js/app/cloud.js`, `js/app/sync.js`

**Interfaces:**
- Consumes: `config.js`, `sync-core.js`, `store.js` (`getState`, `setState`, `subscribe`, `resetAccountData`).
- Produces (`cloud.js`): `loadClient(): Promise<SupabaseClient>` (одноразовий `import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm')`), `signUp(email, password)`, `signIn(email, password)`, `signOut()`, `deleteAccount()`, `getUser(): Promise<User|null>` — помилки повертають `{ error: 'invalid' | 'exists' | 'weak' | 'offline' | 'unavailable' }`.
- Produces (`sync.js`): `initSync(): void`, `syncNow(): Promise<void>`, `getSyncStatus(): { state: 'guest'|'syncing'|'synced'|'pending'|'error', pending: number, lastSync: number|null, email: string|null }`, `onSyncStatus(cb): void`, `afterSignIn(): Promise<void>` (перший вхід: злиття за спекою), `signOutAndClear({ force }): Promise<{ blocked: boolean, pending: number }>`, `deleteAccountAndClear(): Promise<{ error? }>`.
- Ключі `localStorage`: `promin-outbox`, `promin-cloud` (`{ userId, email, cursor, lastSync }`).

- [ ] **Step 1:** Сценарій у браузері (копія + справжній проєкт, тестовий акаунт): гість → нічого не вантажиться з `cdn.jsdelivr.net`; реєстрація → задачі й сесії гостя з'являються в базі (перевірка через REST); новий профіль браузера (другий «пристрій») → вхід → ті самі задачі й статистика; зміна на другому → видно на першому після повернення на вкладку; видалення задачі доходить; налаштування за `pickSettings`.
- [ ] **Step 2:** Запустити → FAIL.
- [ ] **Step 3:** Реалізувати: відправлення через 1,5 с після змін (`chunk`, `upsert` з `onConflict: 'user_id,id'`, сесії — `ignoreDuplicates`); підтягування при старті, `visibilitychange`, `online`, після відправлення, раз на 60 с, поки вкладку видно; курсор — максимальний `updated_at`/`created_at` з відповіді мінус 2 хв; повтори після помилки 5 с → 30 с → 2 хв; 401/403 → локальний вихід (Review Focus 4).
- [ ] **Step 4:** Сценарій → PASS; видалити тестові акаунти.
- [ ] **Step 5:** Коміт `feat(sync): offline-first sync with Supabase`.

### Task 6: Кнопка й вікно акаунта

**Files:** `js/app/account.js`, `app.html`, `css/app.css`, `js/app/i18n.js`, `js/app/main.js`

**Interfaces — Consumes:** `cloud.js`, `sync.js` (Task 5). **Produces:** `initAccount(): void`, викликається в `main.js` після `initPwa()`; `initSync()` — перед `initAccount()`.

- [ ] **Step 1:** Сценарій: кнопка `#account-open` (SVG-значок людини, `aria-label` зі станом) поруч із ⚙; на 320/360/375/390 px немає горизонтальної прокрутки (на ≤ 400 px текст логотипа візуально прихований, доступна назва лишається); вікно без входу — «Вхід / Реєстрація», пошта, пароль, підказка, примітка про пароль; офлайн — форма неактивна з «Потрібен інтернет»; помилки зрозумілі (неправильний пароль, пошта зайнята, короткий пароль); з входом — пошта, стан, «Вийти», «Видалити акаунт» з підтвердженням; вихід з невідправленими змінами попереджає; UA/EN.
- [ ] **Step 2:** Запустити → FAIL.
- [ ] **Step 3:** Реалізувати; стилі — з наявних `.settings`, `.field`, `.btn`, `.icon-button`; крапка стану `.account-dot[data-state]`.
- [ ] **Step 4:** Сценарій → PASS; скриншоти десктоп і телефон.
- [ ] **Step 5:** Коміт `feat(account): sign in, sign up, sign out and delete account`.

### Task 7: Офлайн, service worker і повний прогін

**Files:** `sw.js`

- [ ] **Step 1:** Сценарії: увійшли → сервер вимкнено → перезавантаження офлайн → застосунок і стан акаунта на місці, зміна йде в чергу («Чекає інтернету: 1»), сервер і мережа повернулися → відправлено; запити до Supabase заблоковані (проєкт «на паузі») → стан «помилка», застосунок працює, повторів не більше ніж за розкладом (Review Focus 2); акаунт видалено через REST з іншого «пристрою» → тут локальний вихід (Review Focus 4); дві вкладки змінюють одночасно → у базі без дублікатів (Review Focus 5); RLS: B не бачить A.
- [ ] **Step 2:** Запустити → FAIL (офлайн-старт із входом без кешу CDN).
- [ ] **Step 3:** `sw.js`: `CACHE = 'promin-v3'`; `APP_FILES` + `js/app/config.js`, `cloud.js`, `sync.js`, `sync-core.js`, `account.js`; `cdn.jsdelivr.net` → `cacheFirst`; `*.supabase.co` не перехоплюється.
- [ ] **Step 4:** Усі сценарії Tasks 3–7 і `node --test tests/` → PASS; тестові акаунти видалено (перевірити через `GET /auth/v1/admin` недоступно — тому кожен тест видаляє свої через `delete_account`, а підсумкова перевірка: вхід кожним тестовим акаунтом → 400).
- [ ] **Step 5:** Коміт `feat(pwa): cache supabase-js for offline start, promin-v3`.

### Task 8: Публікація

- [ ] **Step 1:** `git push origin main`; дочекатися збірки GitHub Pages (`gh api repos/khanevychv/promin/pages/builds/latest` → `built`).
- [ ] **Step 2:** На живому сайті: гість працює; тестовий акаунт: реєстрація → задача → другий профіль бачить її → видалення акаунта; офлайн-старт.
- [ ] **Step 3:** Коротке пояснення для Віталія: як влаштовано, що робити, якщо проєкт Supabase на паузі.
