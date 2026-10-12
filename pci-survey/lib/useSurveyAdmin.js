'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from './supabaseClient';

// وضعیت دسترسی ادمین به بخش نظرسنجی: 'checking' | 'admin' | 'denied'
// بدون ورود → هدایت به /login . ورود با نقش غیر ادمین (مثلاً داور) → 'denied'
// توجه: این فقط برای نمایش صفحه است؛ محافظت اصلی داده‌ها در سیاست‌های دیتابیس (RLS) است.
export function useSurveyAdmin() {
  const router = useRouter();
  const [state, setState] = useState('checking');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data || !data.session) {
          router.replace('/login');
          return;
        }
        const { data: ok, error } = await supabase.rpc('survey_is_admin');
        if (cancelled) return;
        setState(!error && ok === true ? 'admin' : 'denied');
      } catch (e) {
        if (!cancelled) setState('denied');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return state;
}
