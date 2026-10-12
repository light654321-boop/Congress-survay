'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import { adminCss } from '../../../lib/surveyStyles';
import { CONGRESS_TITLE_EN, en, enScore, enDateTime } from '../../../lib/surveyConfig';
import { PRESENTATION_CRITERIA, MAX_PRESENTATION_TOTAL } from '../../../lib/presentation';
import { TALK_CRITERIA_EN, talkBandEn, pickEnTalk } from '../../../lib/talkConfig';

// گزارش PDF انگلیسی ارزیابی یک سخنرانی.
// ادمین نمرات همهٔ داوران را می‌بیند؛ داور فقط نمرهٔ خودش را (این محدودیت را دیتابیس اعمال می‌کند، نه خود صفحه).
function T({ v }) {
  return <span dir="auto">{v}</span>;
}

export default function TalkReportPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id;
  const [state, setState] = useState('loading'); // loading | ok | none | error
  const [talk, setTalk] = useState(null);
  const [slots, setSlots] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showNames, setShowNames] = useState(true);
  const [errText, setErrText] = useState('');

  useEffect(() => {
    if (!id) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        if (!s || !s.session) {
          router.replace('/login');
          return;
        }
        const me = s.session.user.id;
        const [t, adm] = await Promise.all([
          supabase.from('pres_talks').select('*').eq('id', id).maybeSingle(),
          supabase.rpc('survey_is_admin'),
        ]);
        if (cancelled) return;
        if (t.error) throw t.error;
        if (!t.data) {
          setState('none');
          return;
        }
        const [rv, pf] = await Promise.all([
          supabase.from('pres_talk_reviews').select('slot, reviewer_id, scores, total, submitted_at').eq('talk_id', id).order('slot'),
          supabase.from('profiles').select('id, name'),
        ]);
        if (rv.error) throw rv.error;
        const names = {};
        (pf.data || []).forEach(p => (names[p.id] = p.name));
        const bySlot = {};
        (rv.data || []).forEach(r => (bySlot[r.slot] = r));
        const admin = !adm.error && adm.data === true;
        const list = [1, 2, 3]
          .map(n => {
            const reviewerId = t.data['pres_reviewer' + n];
            const r = bySlot[n] || null;
            return { slot: n, reviewerId, name: reviewerId ? names[reviewerId] || '-' : null, review: r, mine: reviewerId === me };
          })
          // ادمین همهٔ جایگاه‌های تعیین‌شده را می‌بیند؛ داور فقط جایگاه خودش را
          .filter(x => (admin ? x.reviewerId || x.review : x.mine));
        setTalk(t.data);
        setIsAdmin(admin);
        setSlots(list);
        setState('ok');
      } catch (e) {
        if (!cancelled) {
          setErrText(e.message || '');
          setState('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  if (state !== 'ok') {
    return (
      <div className="ad">
        <style>{adminCss}</style>
        <div className="ad-state">
          {state === 'loading' && 'Loading…'}
          {state === 'none' && 'This talk was not found, or you do not have access to it.'}
          {state === 'error' && 'Could not load the report. ' + errText}
        </div>
      </div>
    );
  }

  const done = slots.filter(s => s.review && typeof s.review.total === 'number');
  const avg = done.length ? done.reduce((a, s) => a + s.review.total, 0) / done.length : null;
  const critAvg = {};
  PRESENTATION_CRITERIA.forEach(c => {
    const vals = done.map(s => (s.review.scores || {})[c.id]).filter(v => typeof v === 'number');
    critAvg[c.id] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });
  const reviewerLabel = s => (isAdmin ? 'Reviewer ' + s.slot : 'Your evaluation');
  const nameLine = s => (isAdmin ? (showNames && s.name ? <T v={s.name} /> : null) : s.name ? <T v={s.name} /> : null);
  const t1 = slots.find(s => s.slot === 1);
  const t2 = slots.find(s => s.slot === 2);
  const gap =
    isAdmin && t1 && t2 && t1.review && t2.review ? Math.abs(t1.review.total - t2.review.total) : null;

  return (
    <div className="ad" style={{ direction: 'ltr' }}>
      <style>{adminCss}</style>
      <div className="rp-actions en no-print">
        <button className="ad-btn" onClick={() => window.print()}>Save as PDF / Print</button>
        {isAdmin && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={showNames} onChange={e => setShowNames(e.target.checked)} />
            Show reviewer names
          </label>
        )}
      </div>

      <div className="rp en">
        <h1>Presentation Evaluation Report</h1>
        <p className="sub">{CONGRESS_TITLE_EN}</p>
        <p className="sub">
          <b>Speaker:</b> <T v={pickEnTalk(talk.speaker_en, talk.speaker)} />
        </p>
        <p className="sub">
          <b>Topic:</b> <T v={pickEnTalk(talk.title_en, talk.title)} />
        </p>
        <p className="sub">Generated: {enDateTime(new Date().toISOString())}</p>

        <div className="kpis">
          <div className="kpi">
            <b>{en(done.length)}</b>
            <span>Evaluations submitted</span>
          </div>
          {isAdmin && (
            <div className="kpi">
              <b>{enScore(avg)}</b>
              <span>Mean total (of {MAX_PRESENTATION_TOTAL})</span>
            </div>
          )}
          {isAdmin && avg !== null && (
            <div className="kpi">
              <b style={{ fontSize: 15 }}>{talkBandEn(avg)}</b>
              <span>Overall level</span>
            </div>
          )}
        </div>

        <h2>Scores by criterion</h2>
        {done.length === 0 ? (
          <p className="sub">No evaluation has been submitted yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Criterion</th>
                {slots.map(s => (
                  <th className="num" key={s.slot}>
                    {reviewerLabel(s)}
                    <div style={{ fontWeight: 400, fontSize: 11 }}>{nameLine(s)}</div>
                  </th>
                ))}
                {isAdmin && <th className="num">Mean</th>}
              </tr>
            </thead>
            <tbody>
              {PRESENTATION_CRITERIA.map(c => (
                <tr key={c.id}>
                  <td>
                    {TALK_CRITERIA_EN[c.id]} <span style={{ color: '#777' }}>(max {en(c.max)})</span>
                  </td>
                  {slots.map(s => {
                    const v = s.review ? (s.review.scores || {})[c.id] : undefined;
                    return (
                      <td className="num" key={s.slot}>
                        {typeof v === 'number' ? en(v) : '-'}
                      </td>
                    );
                  })}
                  {isAdmin && <td className="num">{enScore(critAvg[c.id])}</td>}
                </tr>
              ))}
              <tr>
                <td>
                  <b>Total (max {en(MAX_PRESENTATION_TOTAL)})</b>
                </td>
                {slots.map(s => (
                  <td className="num" key={s.slot}>
                    <b>{s.review ? en(s.review.total) : '-'}</b>
                  </td>
                ))}
                {isAdmin && (
                  <td className="num">
                    <b>{enScore(avg)}</b>
                  </td>
                )}
              </tr>
              <tr>
                <td>Submitted</td>
                {slots.map(s => (
                  <td className="num" key={s.slot} style={{ fontSize: 11 }}>
                    {s.review ? enDateTime(s.review.submitted_at) : 'Pending'}
                  </td>
                ))}
                {isAdmin && <td />}
              </tr>
            </tbody>
          </table>
        )}
        {gap !== null && gap >= 6 && (
          <p className="sub" style={{ marginTop: 10 }}>
            Note: the difference between Reviewer 1 and Reviewer 2 totals is {en(gap)} points; a third reviewer is recommended if not yet scored.
          </p>
        )}
        <p className="sub" style={{ marginTop: 16, fontSize: 11 }}>
          Evaluation covers slide quality and delivery only; it is independent of the abstract (PCI) score.
        </p>
      </div>
    </div>
  );
}
