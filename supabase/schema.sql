-- סכמת מסד הנתונים למשימות הבית.
-- להריץ פעם אחת ב: Supabase → SQL Editor → New query → Run.

-- ---------- משימות ----------
create table if not exists public.tasks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title            text not null,
  description      text,
  type             text not null check (type in ('one_time', 'recurring')),
  due_date         date not null,            -- תאריך היעד הנוכחי (למופע הבא, במשימה חוזרת)
  due_time         time,                     -- שעה אופציונלית
  recurrence_kind  text check (recurrence_kind in ('daily', 'interval', 'weekly', 'monthly', 'yearly')),
  recurrence_every int check (recurrence_every > 0),   -- למשל כל 3 ימים
  recurrence_days  int[],                    -- לחזרה שבועית: 0 = ראשון ... 6 = שבת
  recurrence_mode  text check (recurrence_mode in ('schedule', 'after_completion')),
  estimated_minutes int check (estimated_minutes >= 0),
  assignee         text,                     -- טקסט חופשי, לתיעוד בלבד
  status           text not null default 'active' check (status in ('active', 'completed', 'paused')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint recurring_needs_rule check (
    type = 'one_time' or (recurrence_kind is not null and recurrence_mode is not null)
  )
);

-- ---------- ביצועים (היסטוריה) ----------
create table if not exists public.completions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id          uuid not null references public.tasks(id) on delete cascade,
  occurrence_date  date not null,            -- תאריך היעד של המופע שבוצע
  completed_at     timestamptz not null default now(),   -- השעה שבה סומן כבוצע
  actual_minutes   int check (actual_minutes >= 0),      -- משך הביצוע בפועל
  note             text
);

-- ---------- הגדרות התראות ----------
create table if not exists public.settings (
  user_id                 uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  timezone                text not null default 'Asia/Jerusalem',
  daily_summary_enabled   boolean not null default true,
  daily_summary_time      time not null default '07:00',
  weekly_summary_enabled  boolean not null default true
);

-- ---------- אבטחה: כל משתמש רואה רק את הנתונים שלו ----------
alter table public.tasks       enable row level security;
alter table public.completions enable row level security;
alter table public.settings    enable row level security;

create policy "own tasks" on public.tasks
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "own completions" on public.completions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "own settings" on public.settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- הרשאות גישה לטבלאות ----------
-- משתמש מחובר בלבד (authenticated). אורח (anon) לא מקבל גישה.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.tasks, public.completions, public.settings to authenticated;

-- אינדקסים לשאילתות של היום והשבוע
create index if not exists tasks_user_due_idx on public.tasks (user_id, due_date) where status = 'active';
create index if not exists completions_task_idx on public.completions (task_id, occurrence_date);

-- מונע רישום כפול של אותו מופע (נדרש מהשלב השלישי)
create unique index if not exists completions_task_occurrence_uniq
  on public.completions (task_id, occurrence_date);
