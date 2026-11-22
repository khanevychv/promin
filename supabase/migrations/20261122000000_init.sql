-- =========================================
-- Промінь: таблиці для синхронізації між пристроями
-- Кожна людина бачить і змінює лише свої рядки (Row Level Security).
-- =========================================

-- Час останньої зміни ставить сервер, а не пристрій (годинники пристроїв можуть брехати)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- --- Задачі ---
create table public.tasks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  title text not null check (char_length(title) between 1 and 80),
  done boolean not null default false,
  date date not null,
  deleted boolean not null default false, -- видалена задача лишається «надгробком», щоб інші пристрої дізналися
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index tasks_user_updated on public.tasks (user_id, updated_at);
create trigger tasks_updated_at before insert or update on public.tasks
  for each row execute function public.set_updated_at();

-- --- Сесії фокусу (лише додаються) ---
create table public.focus_sessions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  date date not null,
  minutes smallint not null check (minutes between 1 and 240),
  task_id text check (task_id is null or char_length(task_id) between 1 and 64),
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index focus_sessions_user_created on public.focus_sessions (user_id, created_at);

-- --- Налаштування таймера: один рядок на людину ---
create table public.settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);
create trigger settings_updated_at before insert or update on public.settings
  for each row execute function public.set_updated_at();

-- --- Доступ: лише свої рядки, лише після входу ---
alter table public.tasks enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.settings enable row level security;

create policy "own tasks" on public.tasks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own focus sessions" on public.focus_sessions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own settings" on public.settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.tasks, public.focus_sessions, public.settings from anon;
grant select, insert, update, delete on public.tasks, public.focus_sessions, public.settings to authenticated;

-- --- Видалення власного акаунта (дані зникають каскадом) ---
create or replace function public.delete_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
