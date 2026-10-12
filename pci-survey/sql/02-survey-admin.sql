-- نظرسنجی ارائه‌های کنگره — بخش ۲: پنل‌ها، دسترسی فقط-ادمین، آمار و رتبه‌بندی
-- پیش‌نیاز: ابتدا 01-survey-tables.sql را اجرا کرده باشید.
-- این فایل را در Supabase > SQL Editor اجرا کنید. چندبار اجرا کردنش مشکلی ایجاد نمی‌کند.

------------------------------------------------------------------
-- ۱) تشخیص «ادمین بودن» — تنها نقطه‌ای که ممکن است نیاز به تنظیم داشته باشد
------------------------------------------------------------------
-- فرض فعلی: جدولی به نام profiles با ستون‌های id (برابر auth.users.id) و role دارید
-- و نقش ادمین در آن «admin» است. اگر پلتفرم شما ادمین را جور دیگری تشخیص می‌دهد
-- (مثلاً جدول یا ستون دیگر، یا فهرست ایمیل)، فقط همین تابع را اصلاح کنید.
-- هر خطایی در این تابع باعث «ادمین نیست» می‌شود (حالت امن).
create or replace function public.survey_is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  return coalesce(
    (select true from public.profiles p where p.id = auth.uid() and p.role = 'admin' limit 1),
    false
  );
exception when others then
  return false;
end;
$$;

revoke all on function public.survey_is_admin() from public;
grant execute on function public.survey_is_admin() to anon, authenticated;

------------------------------------------------------------------
-- ۲) پنل‌ها و ستون‌های جدید سخنرانی
------------------------------------------------------------------
create table if not exists public.survey_panels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.survey_sessions
  add column if not exists panel_id uuid references public.survey_panels(id) on delete cascade,
  add column if not exists sort_order int not null default 0,
  add column if not exists is_open boolean not null default true;

create index if not exists survey_sessions_panel_idx on public.survey_sessions (panel_id);

-- شناسهٔ ناشناس دستگاه برای جلوگیری از رأی تکراری ساده
alter table public.survey_responses
  add column if not exists device_id text;

create unique index if not exists survey_responses_device_uniq
  on public.survey_responses (session_id, device_id)
  where device_id is not null;

alter table public.survey_panels enable row level security;

------------------------------------------------------------------
-- ۳) سیاست‌های دسترسی
------------------------------------------------------------------
-- ثبت رأی: عموم، فقط برای ارائه‌ای که «باز» است و فقط با شناسهٔ دستگاه
drop policy if exists "survey_responses_public_insert" on public.survey_responses;
create policy "survey_responses_public_insert"
  on public.survey_responses for insert
  to anon, authenticated
  with check (
    device_id is not null
    and char_length(device_id) between 8 and 64
    and exists (select 1 from public.survey_sessions s where s.id = session_id and s.is_open)
  );

-- مدیریت کامل: فقط ادمین
drop policy if exists "survey_panels_admin_all" on public.survey_panels;
create policy "survey_panels_admin_all"
  on public.survey_panels for all
  to authenticated
  using (public.survey_is_admin())
  with check (public.survey_is_admin());

drop policy if exists "survey_sessions_admin_all" on public.survey_sessions;
create policy "survey_sessions_admin_all"
  on public.survey_sessions for all
  to authenticated
  using (public.survey_is_admin())
  with check (public.survey_is_admin());

-- خواندن و حذف پاسخ‌ها: فقط ادمین (داور و سایر کاربران وارد‌شده هیچ دسترسی‌ای ندارند)
drop policy if exists "survey_responses_admin_all" on public.survey_responses;
create policy "survey_responses_admin_all"
  on public.survey_responses for all
  to authenticated
  using (public.survey_is_admin())
  with check (public.survey_is_admin());

------------------------------------------------------------------
-- ۴) آمار تجمیعی هر سخنرانی (فقط ادمین)
------------------------------------------------------------------
create or replace function public.survey_session_stats()
returns table (
  session_id uuid,
  votes bigint,
  avg_quality numeric,
  avg_applicability numeric,
  avg_presentation numeric,
  avg_timing numeric,
  first_vote timestamptz,
  last_vote timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.survey_is_admin() then
    raise exception 'not allowed';
  end if;

  return query
  select
    s.id,
    count(r.id),
    round(avg(r.quality)::numeric, 3),
    round(avg(r.applicability)::numeric, 3),
    round(avg(r.presentation)::numeric, 3),
    round(avg(r.timing)::numeric, 3),
    min(r.created_at),
    max(r.created_at)
  from public.survey_sessions s
  left join public.survey_responses r on r.session_id = s.id
  group by s.id;
end;
$$;

revoke all on function public.survey_session_stats() from public;
grant execute on function public.survey_session_stats() to authenticated;

------------------------------------------------------------------
-- ۵) آزمایش (بعد از اجرا، از داخل خود برنامه با حساب ادمین انجام می‌شود)
------------------------------------------------------------------
-- در SQL Editor نتیجهٔ survey_is_admin() همیشه false است، چون کاربر وارد‌شده‌ای وجود ندارد.
-- صفحهٔ /admin/survey با حساب ادمین باید باز شود و با حساب داور باید «دسترسی ندارید» بدهد.
