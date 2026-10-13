'use client';

import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

// نوار اعلان برای داور: چند سخنرانی هنوز منتظر نمرهٔ اوست.
// اگر جدول pres_talks هنوز ساخته نشده یا خطایی باشد، چیزی نشان نمی‌دهد.
export default function TalkNotice() {
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        const uid = s && s.session && s.session.user.id;
        if (!uid) return;
        const t = await supabase
          .from('pres_talks')
          .select('id')
          .or(`pres_reviewer1.eq.${uid},pres_reviewer2.eq.${uid},pres_reviewer3.eq.${uid}`);
        if (t.error || !t.data || t.data.length === 0) return;
        const r = await supabase
          .from('pres_talk_reviews')
          .select('talk_id')
          .eq('reviewer_id', uid)
          .in('talk_id', t.data.map(x => x.id));
        const done = new Set((r.data || []).map(x => x.talk_id));
        const n = t.data.filter(x => !done.has(x.id)).length;
        if (!cancelled) setPending(n);
      } catch (e) {
        /* بی‌صدا */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!pending) return null;
  const n = pending.toLocaleString('fa-IR');
  return (
    <a
      href="/reviewer/presentation"
      style={{
        display: 'block',
        margin: '0 0 16px',
        padding: '12px 14px',
        background: '#fdf3e2',
        border: '1px solid #e8c88a',
        borderRight: '5px solid #b7791f',
        borderRadius: 10,
        color: '#7a4f0c',
        textDecoration: 'none',
        fontSize: 14,
        fontWeight: 700,
        lineHeight: 1.8,
      }}
    >
      {n} سخنرانی برای ارزیابی به شما اختصاص داده شده و هنوز نمره‌ای ثبت نکرده‌اید. برای امتیازدهی اینجا را بزنید ←
    </a>
  );
}
