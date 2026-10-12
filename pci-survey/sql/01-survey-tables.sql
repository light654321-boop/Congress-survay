-- نظرسنجی ارائه‌های کنگره — بخش ۱: جدول‌ها و دسترسی عمومی
-- این فایل را در Supabase > SQL Editor اجرا کنید.
-- به جدول‌های داوری (چکیده‌ها، داورها و ...) دست نمی‌زند.

create table if not exists public.survey_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  speaker text,
  created_at timestamptz not null default now()
);

create table if not exists public.survey_responses (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.survey_sessions(id) on delete cascade,
  quality smallint not null check (quality between 1 and 5),
  applicability smallint not null check (applicability between 1 and 5),
  presentation smallint not null check (presentation between 1 and 5),
  timing smallint not null check (timing between 1 and 5),
  suggestion text check (suggestion is null or char_length(suggestion) <= 400),
  created_at timestamptz not null default now()
);

create index if not exists survey_responses_session_idx
  on public.survey_responses (session_id);

alter table public.survey_sessions enable row level security;
alter table public.survey_responses enable row level security;

-- هر کسی (بدون ورود به سیستم) فقط می‌تواند عنوان و نام سخنران را برای ساخت فرم بخواند
drop policy if exists "survey_sessions_public_read" on public.survey_sessions;
create policy "survey_sessions_public_read"
  on public.survey_sessions for select
  to anon, authenticated
  using (true);

-- هر کسی فقط می‌تواند پاسخ «ثبت» کند؛ هیچ‌کس (جز ادمین، در بخش ۲) نمی‌تواند پاسخ‌ها را بخواند، تغییر دهد یا حذف کند
drop policy if exists "survey_responses_public_insert" on public.survey_responses;
create policy "survey_responses_public_insert"
  on public.survey_responses for insert
  to anon, authenticated
  with check (true);
