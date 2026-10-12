-- نظرسنجی ارائه‌ها — بخش ۴: زمان‌بندی رأی‌گیری و کد دسترسی اختیاری
-- پیش‌نیاز: 01، 02 و 03. چندبار اجرا کردنش مشکلی ایجاد نمی‌کند.

-- ۱) ستون‌های زمان‌بندی (خالی = بدون محدودیت زمانی) و پرچم «نیاز به کد»
alter table public.survey_sessions
  add column if not exists opens_at timestamptz,
  add column if not exists closes_at timestamptz,
  add column if not exists requires_code boolean not null default false;

-- ۲) خود کدها در جدولی جدا و فقط برای ادمین قابل‌خواندن هستند (عموم فقط می‌داند «کد لازم است»)
create table if not exists public.survey_session_codes (
  session_id uuid primary key references public.survey_sessions(id) on delete cascade,
  code text not null
);
alter table public.survey_session_codes enable row level security;
drop policy if exists "survey_codes_admin_all" on public.survey_session_codes;
create policy "survey_codes_admin_all"
  on public.survey_session_codes for all
  to authenticated
  using (public.survey_is_admin())
  with check (public.survey_is_admin());

-- کدی که رأی‌دهنده وارد کرده (فقط برای بررسی هنگام ثبت؛ خواندنش فقط ادمین)
alter table public.survey_responses
  add column if not exists access_code text;

-- ۳) ساعت سرور (تا ساعت غلط گوشی حاضران باعث پیام اشتباه نشود)
create or replace function public.survey_server_now()
returns timestamptz
language sql
stable
as $$ select now(); $$;
grant execute on function public.survey_server_now() to anon, authenticated;

-- ۴) آیا الان می‌شود به این ارائه رأی داد؟ (باز بودن + بازهٔ زمانی + کد)
create or replace function public.survey_vote_allowed(p_session uuid, p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.survey_sessions s
    where s.id = p_session
      and s.is_open
      and (s.opens_at is null or now() >= s.opens_at)
      and (s.closes_at is null or now() < s.closes_at)
      and (
        not s.requires_code
        or exists (
          select 1 from public.survey_session_codes c
          where c.session_id = s.id and c.code = btrim(coalesce(p_code, ''))
        )
      )
  );
$$;
revoke all on function public.survey_vote_allowed(uuid, text) from public;
grant execute on function public.survey_vote_allowed(uuid, text) to anon, authenticated;

-- ۵) سیاست ثبت رأی با شرط‌های جدید جایگزین می‌شود
drop policy if exists "survey_responses_public_insert" on public.survey_responses;
create policy "survey_responses_public_insert"
  on public.survey_responses for insert
  to anon, authenticated
  with check (
    device_id is not null
    and char_length(device_id) between 8 and 64
    and public.survey_vote_allowed(session_id, access_code)
  );
