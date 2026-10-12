'use client';

import Link from 'next/link';

// نوار بالای صفحات ادمین نظرسنجی. active: 'manage' | 'results'
export default function SurveyNav({ active }) {
  return (
    <div className="ad-nav no-print">
      <Link href="/admin" className="">بازگشت به پنل ادمین</Link>
      <Link href="/admin/survey" className={active === 'manage' ? 'on' : ''}>ساختار کنگره و QR</Link>
      <Link href="/admin/survey/results" className={active === 'results' ? 'on' : ''}>نتایج و رتبه‌بندی پنل‌ها</Link>
    </div>
  );
}
