-- نظرسنجی ارائه‌ها — بخش ۳: نام‌های انگلیسی برای گزارش PDF انگلیسی
-- پیش‌نیاز: 01 و 02. چندبار اجرا کردنش مشکلی ایجاد نمی‌کند.
-- اگر نام انگلیسی ثبت نشود، گزارش PDF همان نام فارسی را چاپ می‌کند.

alter table public.survey_panels
  add column if not exists name_en text;

alter table public.survey_sessions
  add column if not exists speaker_en text,
  add column if not exists title_en text;
