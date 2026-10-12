-- ارزیابی سخنرانی توسط داوران — بخش ۵: سخنرانی‌هایی که ادمین ثبت می‌کند و برای داوران می‌فرستد
-- پیش‌نیاز: 01 تا 04 (از جمله تابع survey_is_admin). چندبار اجرا کردنش مشکلی ایجاد نمی‌کند.

-- ۱) سخنرانی (نام سخنران و موضوع) و سه داور
create table if not exists public.pres_talks (
  id uuid primary key default gen_random_uuid(),
  speaker text not null,
  title text not null,
  speaker_en text,
  title_en text,
  pres_reviewer1 uuid references public.profiles(id) on delete set null,
  pres_reviewer2 uuid references public.profiles(id) on delete set null,
  pres_reviewer3 uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ۲) نمرات هر داور برای هر سخنرانی (هر جایگاه ۱ تا ۳ یک نمره)
create table if not exists public.pres_talk_reviews (
  id uuid primary key default gen_random_uuid(),
  talk_id uuid not null references public.pres_talks(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id),
  slot int not null check (slot in (1, 2, 3)),
  scores jsonb not null,
  total int not null,
  submitted_at timestamptz not null default now(),
  unique (talk_id, slot)
);

-- ۳) اعتبارسنجی نمرات در خود دیتابیس: معیارهای p1..p5 با سقف ۸، ۸، ۴، ۸، ۲ و جمع درست
create or replace function public.pres_scores_ok(s jsonb, t int)
returns boolean
language plpgsql
immutable
as $$
declare a int; b int; c int; d int; e int;
begin
  a := (s->>'p1')::int;
  b := (s->>'p2')::int;
  c := (s->>'p3')::int;
  d := (s->>'p4')::int;
  e := (s->>'p5')::int;
  return a between 0 and 8 and b between 0 and 8 and c between 0 and 4
     and d between 0 and 8 and e between 0 and 2 and t = a + b + c + d + e;
exception when others then
  return false;
end;
$$;

alter table public.pres_talk_reviews drop constraint if exists pres_talk_reviews_scores_ok;
alter table public.pres_talk_reviews
  add constraint pres_talk_reviews_scores_ok check (public.pres_scores_ok(scores, total));

-- ۴) آیا کاربر فعلی داور همین جایگاه همین سخنرانی است؟
create or replace function public.pres_talk_slot_ok(p_talk uuid, p_slot int)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.pres_talks t
    where t.id = p_talk
      and (case p_slot when 1 then t.pres_reviewer1 when 2 then t.pres_reviewer2 when 3 then t.pres_reviewer3 end) = auth.uid()
  );
$$;
revoke all on function public.pres_talk_slot_ok(uuid, int) from public;
grant execute on function public.pres_talk_slot_ok(uuid, int) to authenticated;

-- ۵) سیاست‌های دسترسی
alter table public.pres_talks enable row level security;
alter table public.pres_talk_reviews enable row level security;

-- سخنرانی‌ها: ادمین همه‌کاره؛ داور فقط سخنرانی‌هایی را می‌بیند که به او داده شده
drop policy if exists "pres_talks_admin_all" on public.pres_talks;
create policy "pres_talks_admin_all" on public.pres_talks for all to authenticated
  using (public.survey_is_admin()) with check (public.survey_is_admin());

drop policy if exists "pres_talks_reviewer_read" on public.pres_talks;
create policy "pres_talks_reviewer_read" on public.pres_talks for select to authenticated
  using (auth.uid() = pres_reviewer1 or auth.uid() = pres_reviewer2 or auth.uid() = pres_reviewer3);

-- نمرات: ادمین همه را می‌بیند و می‌تواند حذف کند؛ هر داور فقط نمرهٔ خودش را می‌بیند و فقط برای
-- جایگاهی که به او داده شده می‌تواند ثبت یا اصلاح کند (داوران نمرهٔ یکدیگر را نمی‌بینند)
drop policy if exists "pres_talk_reviews_admin_all" on public.pres_talk_reviews;
create policy "pres_talk_reviews_admin_all" on public.pres_talk_reviews for all to authenticated
  using (public.survey_is_admin()) with check (public.survey_is_admin());

drop policy if exists "pres_talk_reviews_own_read" on public.pres_talk_reviews;
create policy "pres_talk_reviews_own_read" on public.pres_talk_reviews for select to authenticated
  using (reviewer_id = auth.uid());

drop policy if exists "pres_talk_reviews_own_insert" on public.pres_talk_reviews;
create policy "pres_talk_reviews_own_insert" on public.pres_talk_reviews for insert to authenticated
  with check (reviewer_id = auth.uid() and public.pres_talk_slot_ok(talk_id, slot));

drop policy if exists "pres_talk_reviews_own_update" on public.pres_talk_reviews;
create policy "pres_talk_reviews_own_update" on public.pres_talk_reviews for update to authenticated
  using (reviewer_id = auth.uid() and public.pres_talk_slot_ok(talk_id, slot))
  with check (reviewer_id = auth.uid() and public.pres_talk_slot_ok(talk_id, slot));

grant select, insert, update, delete on public.pres_talks to authenticated;
grant select, insert, update, delete on public.pres_talk_reviews to authenticated;
