'use client';

import { useEffect, useState } from 'react';
import { useSurveyAdmin } from '../../../../lib/useSurveyAdmin';
import { loadStructure } from '../../../../lib/surveyData';
import { supabase } from '../../../../lib/supabaseClient';
import { adminCss } from '../../../../lib/surveyStyles';
import { CONGRESS_TITLE } from '../../../../lib/surveyConfig';

// برگهٔ چاپی QR همهٔ سخنرانی‌ها (برای ارسال به سخنرانان یا بایگانی). «ذخیره به‌صورت PDF» از پنجرهٔ چاپ.
const css =
  adminCss +
  `
.qs-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
.qs-card{border:1px solid #bbb;border-radius:4px;padding:12px;text-align:center;break-inside:avoid;background:#fff}
.qs-card img{width:100%;max-width:230px;height:auto}
.qs-panel{font-size:12px;color:#555}
.qs-title{font-size:14px;font-weight:700;line-height:1.7;margin:4px 0}
.qs-speaker{font-size:13px}
.qs-code{font-size:15px;font-weight:700;letter-spacing:4px;direction:ltr;margin-top:4px}
.qs-h{font-size:15px;margin:18px 0 8px;padding-bottom:4px;border-bottom:2px solid #0E2A3B}
@media print{.qs-grid{grid-template-columns:repeat(2,1fr)} .ad-top{display:none}}
`;

export default function QrSheetPage() {
  const access = useSurveyAdmin();
  const [groups, setGroups] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (access !== 'admin') return;
    (async () => {
      try {
        const [st, c] = await Promise.all([loadStructure(), supabase.from('survey_session_codes').select('session_id, code')]);
        const codes = {};
        (c.data || []).forEach(r => (codes[r.session_id] = r.code));
        const mod = await import('qrcode');
        const QR = mod.default || mod;
        const out = [];
        for (const p of st.panels) {
          const items = [];
          for (const s of st.sessions.filter(x => x.panel_id === p.id)) {
            const url = await QR.toDataURL(window.location.origin + '/survey/' + s.id, { width: 500, margin: 2, errorCorrectionLevel: 'M' });
            items.push({ s, url, code: s.requires_code ? codes[s.id] : null });
          }
          if (items.length) out.push({ p, items });
        }
        setGroups(out);
      } catch (e) {
        setErr('ساخت برگه ناموفق بود: ' + (e.message || ''));
      }
    })();
  }, [access]);

  if (access !== 'admin') {
    return (
      <div className="ad">
        <style>{css}</style>
        <div className="ad-state">{access === 'checking' ? 'در حال بررسی دسترسی…' : 'دسترسی ندارید'}</div>
      </div>
    );
  }

  return (
    <div className="ad">
      <style>{css}</style>
      <div className="ad-wrap">
        <div className="ad-row no-print" style={{ marginBottom: 12 }}>
          <button className="ad-btn" onClick={() => window.print()}>
            چاپ / ذخیره به‌صورت PDF
          </button>
        </div>
        <h1 style={{ fontSize: 19 }}>QR سخنرانی‌ها — {CONGRESS_TITLE}</h1>
        {err && <div className="ad-msg err">{err}</div>}
        {!groups && !err && <p className="ad-note">در حال ساخت QRها…</p>}
        {groups &&
          groups.map(g => (
            <section key={g.p.id}>
              <h2 className="qs-h">{g.p.name}</h2>
              <div className="qs-grid">
                {g.items.map(({ s, url, code }) => (
                  <div className="qs-card" key={s.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={s.title} />
                    <div className="qs-title">{s.title}</div>
                    <div className="qs-speaker">{s.speaker}</div>
                    {code && <div className="qs-code">{code}</div>}
                  </div>
                ))}
              </div>
            </section>
          ))}
        {groups && groups.length === 0 && <p className="ad-note">هنوز سخنرانی‌ای ثبت نشده است.</p>}
      </div>
    </div>
  );
}
