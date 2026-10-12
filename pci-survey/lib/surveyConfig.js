// تنظیمات و توابع کمکی نظرسنجی ارائه‌ها — برای تغییر شاخص‌ها یا وزن‌ها فقط همین فایل را ویرایش کنید.

export const CONGRESS_TITLE = 'کنگره انجمن ارتوپدی ایران';
export const CONGRESS_TITLE_EN = 'Iranian Orthopedic Association Congress'; // عنوان کنگره در گزارش‌های PDF انگلیسی

// شاخص‌های نظرسنجی. key باید با نام ستون در جدول survey_responses یکی باشد.
// weight: وزن شاخص در امتیاز کل (وزن‌ها لازم نیست جمعشان ۱۰۰ باشد).
export const CRITERIA = [
  { key: 'quality', labelEn: 'Scientific quality of content', label: 'کیفیت علمی محتوا', weight: 1 },
  { key: 'applicability', labelEn: 'Clinical applicability', label: 'کاربردی بودن در عمل بالینی', weight: 1 },
  { key: 'presentation', labelEn: 'Presentation and slide quality', label: 'کیفیت ارائه و اسلایدها', weight: 1 },
  { key: 'timing', labelEn: 'Time management', label: 'مدیریت زمان', weight: 1 },
];

// حداقل تعداد رأی برای اینکه یک سخنرانی در رتبه‌بندی پنل‌ها حساب شود.
export const MIN_VOTES = 5;

const TZ = 'Asia/Tehran';

export function fa(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('fa-IR');
}

export function faScore(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('fa-IR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fa-IR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' });
  } catch (e) {
    return '—';
  }
}

export function fmtTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('fa-IR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '—';
  }
}

// امتیاز کل (میانگین وزنی شاخص‌ها). اگر داده‌ای نباشد null برمی‌گرداند.
export function overallFrom(avgs) {
  let sum = 0;
  let wsum = 0;
  for (const c of CRITERIA) {
    const v = avgs ? avgs[c.key] : null;
    if (v === null || v === undefined || Number.isNaN(Number(v))) return null;
    sum += Number(v) * c.weight;
    wsum += c.weight;
  }
  return wsum > 0 ? sum / wsum : null;
}

// یکسان‌سازی حروف عربی/فارسی و فاصله‌ها برای تشخیص نام‌های تکراری
export function normalizeName(s) {
  return String(s || '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/‌/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// کلید «ساعت» به وقت تهران برای نمودار زمانی آرا، مثل 2026-12-08 10
export function hourKey(iso) {
  return new Date(iso).toLocaleString('sv-SE', { timeZone: TZ }).slice(0, 13);
}

export function hourLabel(key) {
  try {
    const start = new Date(key + ':00:00+03:30');
    return start.toLocaleString('fa-IR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' });
  } catch (e) {
    return key;
  }
}

// ---------- قالب‌بندی انگلیسی برای گزارش‌های PDF ----------
export function en(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '-';
  return Number(n).toLocaleString('en-US');
}

export function enScore(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '-';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function enDateTime(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      timeZone: TZ,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch (e) {
    return '-';
  }
}

export function enHourLabel(key) {
  try {
    return enDateTime(key + ':00:00+03:30');
  } catch (e) {
    return key;
  }
}

// نام انگلیسی اگر ثبت شده باشد، وگرنه نام اصلی (فارسی)
export function pickEn(en_, fa_) {
  return en_ && String(en_).trim() ? String(en_).trim() : fa_ || '';
}
