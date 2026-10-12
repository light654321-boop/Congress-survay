// تنظیمات گزارش انگلیسی ارزیابی سخنرانی (معیارها همان معیارهای lib/presentation.js هستند)
export const TALK_CRITERIA_EN = {
  p1: 'Slide structure, timing and affiliation',
  p2: 'Visual design and quality of slide content',
  p3: 'Title, conclusion and final clinical take-home message',
  p4: 'Presentation skills, audience engagement and delivery',
  p5: 'Supplementary audience interaction (QR code)',
};

export function talkBandEn(total) {
  if (total >= 24) return 'Excellent';
  if (total >= 18) return 'Good';
  if (total >= 12) return 'Acceptable with revision';
  return 'Weak';
}

// نام انگلیسی اگر ثبت شده باشد، وگرنه نام اصلی
export function pickEnTalk(en_, fa_) {
  return en_ && String(en_).trim() ? String(en_).trim() : fa_ || '';
}
