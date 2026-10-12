'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabaseClient';
import { useSurveyAdmin } from '../../../lib/useSurveyAdmin';
import { adminCss } from '../../../lib/surveyStyles';
import { downloadCsv } from '../../../lib/surveyCsv';
import { fa, faScore } from '../../../lib/surveyConfig';
import {
  PRESENTATION_CRITERIA,
  MAX_PRESENTATION_TOTAL,
  PRESENTATION_DISCREPANCY_THRESHOLD,
  presentationBandFor,
} from '../../../lib/presentation';

const REFRESH_MS = 30000;

// خواندن صفحه‌به‌صفحه (هر درخواست حداکثر ۱۰۰۰ ردیف برمی‌گرداند)
async function fetchAll(build) {
  const out = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

function Medal({ rank }) {
  if (!rank) return <span className="ad-medal">—</span>;
  return <span className={'ad-medal' + (rank <= 3 ? ' r' + rank : '')}>{fa(rank)}</span>;
}

export default function PresentationResultsPage() {
  const access = useSurveyAdmin();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState({}); // { [paperId]: true } جزئیات باز
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    try {
      const [papers, reviews, profs, talks, talkReviews] = await Promise.all([
        fetchAll(() =>
          supabase
            .from('papers')
            .select('id, title, pres_reviewer1, pres_reviewer2, pres_reviewer3, created_at')
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
        ),
        fetchAll(() =>
          supabase.from('presentation_reviews').select('paper_id, reviewer_id, slot, scores, total, submitted_at').order('paper_id').order('slot')
        ),
        fetchAll(() => supabase.from('profiles').select('id, name').order('id')),
        fetchAll(() => supabase.from('pres_talks').select('*').order('created_at', { ascending: true }).order('id', { ascending: true })),
        fetchAll(() =>
          supabase.from('pres_talk_reviews').select('talk_id, reviewer_id, slot, scores, total, submitted_at').order('talk_id').order('slot')
        ),
      ]);
      const nameOf = {};
      profs.forEach(p => (nameOf[p.id] = p.name));

      const paperBySlot = {};
      reviews.forEach(r => {
        paperBySlot[r.paper_id] = paperBySlot[r.paper_id] || {};
        paperBySlot[r.paper_id][r.slot] = r;
      });
      const talkBySlot = {};
      talkReviews.forEach(r => {
        talkBySlot[r.talk_id] = talkBySlot[r.talk_id] || {};
        talkBySlot[r.talk_id][r.slot] = r;
      });

      // هر آیتم (مقالهٔ دارای داور ارائه، یا سخنرانی ثبت‌شده توسط ادمین) به یک ساختار یکسان تبدیل می‌شود
      const items = [];
      papers.forEach(p =>
        items.push({
          id: p.id,
          kind: 'paper',
          title: p.title,
          speaker: '',
          reviewerIds: [p.pres_reviewer1, p.pres_reviewer2, p.pres_reviewer3],
          bySlot: paperBySlot[p.id] || {},
        })
      );
      talks.forEach(t =>
        items.push({
          id: t.id,
          kind: 'talk',
          title: t.title,
          speaker: t.speaker,
          reviewerIds: [t.pres_reviewer1, t.pres_reviewer2, t.pres_reviewer3],
          bySlot: talkBySlot[t.id] || {},
        })
      );

      const rows = [];
      for (const it of items) {
        const slots = [1, 2, 3].map(n => {
          const reviewerId = it.reviewerIds[n - 1];
          const r = it.bySlot[n] || null;
          return {
            slot: n,
            reviewerId,
            name: reviewerId ? nameOf[reviewerId] || '—' : null,
            review: r,
            total: r && typeof r.total === 'number' ? r.total : null,
          };
        });
        const assigned = slots.filter(s => s.reviewerId).length;
        if (assigned === 0 && slots.every(s => !s.review)) continue; // هنوز داوری تعیین نشده
        const done = slots.filter(s => s.total !== null);
        const avg = done.length ? done.reduce((a, s) => a + s.total, 0) / done.length : null;
        const t1 = slots[0].total;
        const t2 = slots[1].total;
        const diff = t1 !== null && t2 !== null ? Math.abs(t1 - t2) : null;
        const needsThird = diff !== null && diff >= PRESENTATION_DISCREPANCY_THRESHOLD && slots[2].total === null;
        // میانگین هر معیار روی داوران
        const critAvg = {};
        for (const c of PRESENTATION_CRITERIA) {
          const vals = done.map(s => (s.review.scores || {})[c.id]).filter(v => typeof v === 'number');
          critAvg[c.id] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        }
        // «نهایی» یعنی دست‌کم دو نمره، و اختلاف حل‌نشده‌ای نباشد
        const final = done.length >= 2 && !needsThird;
        rows.push({
          id: it.id,
          kind: it.kind,
          title: it.title,
          speaker: it.speaker,
          slots,
          assigned,
          doneCount: done.length,
          avg,
          diff,
          needsThird,
          critAvg,
          final,
        });
      }

      const ranked = rows.filter(r => r.final).sort((a, b) => b.avg - a.avg || b.doneCount - a.doneCount);
      ranked.forEach((r, i) => (r.rank = i + 1));
      rows.forEach(r => {
        if (!r.rank) r.rank = null;
      });

      setData({
        rows,
        ranked,
        pending: rows.filter(r => !r.final),
        totalAssignments: rows.reduce((a, r) => a + r.assigned, 0),
        totalDone: rows.reduce((a, r) => a + r.doneCount, 0),
      });
      setUpdatedAt(new Date());
      setErr('');
    } catch (e) {
      setErr('دریافت نتایج ناموفق بود: ' + (e.message || 'خطای نامشخص') + ' — اگر پیام دربارهٔ pres_talks است، فایل sql/05-talks.sql را اجرا کنید.');
    }
  }, []);

  useEffect(() => {
    if (access !== 'admin') return undefined;
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [access, load]);

  function exportCsv() {
    const head = ['Rank', 'Speaker', 'Title', 'Average', 'Reviews done', 'Status'];
    PRESENTATION_CRITERIA.forEach(c => head.push('Mean ' + c.id + ' (max ' + c.max + ')'));
    [1, 2, 3].forEach(n => head.push('Reviewer ' + n, 'Reviewer ' + n + ' total'));
    PRESENTATION_CRITERIA.forEach(c => [1, 2, 3].forEach(n => head.push('R' + n + ' ' + c.id)));
    const rows = [head];
    data.rows.forEach(r => {
      const status = r.final ? 'final' : r.needsThird ? 'needs third reviewer' : 'in progress';
      const line = [r.rank || '', r.speaker || '', r.title, r.avg === null ? '' : r.avg.toFixed(2), r.doneCount, status];
      PRESENTATION_CRITERIA.forEach(c => line.push(r.critAvg[c.id] === null ? '' : r.critAvg[c.id].toFixed(2)));
      r.slots.forEach(s => line.push(s.name || '', s.total === null ? '' : s.total));
      PRESENTATION_CRITERIA.forEach(c => r.slots.forEach(s => line.push(s.review ? (s.review.scores || {})[c.id] ?? '' : '')));
      rows.push(line);
    });
    downloadCsv('presentation-reviews-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.csv', rows);
  }

  if (access !== 'admin') {
    return (
      <div className="ad">
        <style>{adminCss}</style>
        <div className="ad-state">
          {access === 'checking' ? 'در حال بررسی دسترسی…' : (
            <>
              <h2>دسترسی ندارید</h2>
              <p>این بخش فقط برای ادمین‌ها در دسترس است.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="ad">
      <style>{adminCss}</style>
      <header className="ad-top">
        <h1>نتایج ارزیابی سخنرانی توسط داوران</h1>
        <p>
          امتیاز اسلاید و اجرای سخنرانی (از {fa(MAX_PRESENTATION_TOTAL)}) — به‌روزرسانی خودکار هر {fa(REFRESH_MS / 1000)} ثانیه
        </p>
        <div className="ad-nav no-print">
          <Link href="/admin">بازگشت به پنل ادمین</Link>
          <Link href="/admin/presentation-talks">ثبت سخنرانی و تعیین داور</Link>
          <Link href="/admin/presentation-results" className="on">نتایج ارزیابی سخنرانی (داوران)</Link>
          <Link href="/admin/survey/results">نتایج نظرسنجی حاضرین</Link>
        </div>
      </header>

      <div className="ad-wrap">
        {err && <div className="ad-msg err">{err}</div>}
        {!data && !err && <div className="ad-state">در حال دریافت نتایج…</div>}

        {data && (
          <>
            <section className="ad-panel">
              <div className="ad-row" style={{ marginTop: 0, justifyContent: 'space-between' }}>
                <div>
                  <b>{fa(data.totalDone)}</b> داوری ثبت‌شده از <b>{fa(data.totalAssignments)}</b> داوری تخصیص‌یافته، در <b>{fa(data.rows.length)}</b> سخنرانی
                </div>
                <button className="ad-btn alt" onClick={exportCsv}>
                  خروجی Excel (CSV)
                </button>
              </div>
              <p className="ad-note">
                روش محاسبه: نمرهٔ هر سخنرانی میانگین نمرات داوران آن است. سخنرانی وقتی در رتبه‌بندی می‌آید که دست‌کم دو داور نمره داده باشند و
                اختلاف دو داور اول کمتر از {fa(PRESENTATION_DISCREPANCY_THRESHOLD)} نمره باشد (یا داور سوم هم نمره داده باشد). این قاعده همان قاعدهٔ
                پنل ادمین است. نمرات PCI چکیده در این صفحه نمایش داده نمی‌شود.
              </p>
            </section>

            <section className="ad-panel">
              <h2>رتبه‌بندی سخنرانی‌ها</h2>
              {data.ranked.length === 0 ? (
                <p className="ad-note">هنوز سخنرانی‌ای دو داوری کامل ندارد.</p>
              ) : (
                <div className="ad-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th className="num">رتبه</th>
                        <th>عنوان سخنرانی</th>
                        <th className="num">داور ۱</th>
                        <th className="num">داور ۲</th>
                        <th className="num">داور ۳</th>
                        <th className="num">میانگین</th>
                        <th>سطح</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data.ranked.map(r => (
                        <Row key={r.id} r={r} open={!!open[r.id]} toggle={() => setOpen(o => ({ ...o, [r.id]: !o[r.id] }))} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {data.pending.length > 0 && (
              <section className="ad-panel">
                <h2>در انتظار تکمیل داوری یا داور سوم</h2>
                <div className="ad-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>عنوان سخنرانی</th>
                        <th className="num">داور ۱</th>
                        <th className="num">داور ۲</th>
                        <th className="num">داور ۳</th>
                        <th>وضعیت</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data.pending.map(r => (
                        <Row key={r.id} r={r} pending open={!!open[r.id]} toggle={() => setOpen(o => ({ ...o, [r.id]: !o[r.id] }))} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            <p className="ad-note">آخرین به‌روزرسانی: {updatedAt ? updatedAt.toLocaleTimeString('fa-IR') : '—'}</p>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ r, open, toggle, pending }) {
  const band = r.avg !== null ? presentationBandFor(r.avg) : null;
  const cell = s =>
    s.total !== null ? fa(s.total) : s.reviewerId ? <span className="ad-badge">در انتظار</span> : <span className="ad-note">—</span>;
  const statusText = r.needsThird
    ? 'اختلاف زیاد؛ نیاز به نمرهٔ داور سوم'
    : r.doneCount < 2
      ? 'کمتر از دو داوری ثبت شده'
      : '';
  const cols = pending ? 6 : 8;
  return (
    <>
      <tr>
        {!pending && (
          <td className="num">
            <Medal rank={r.rank} />
          </td>
        )}
        <td>
          {r.title}
          {r.speaker && <div className="ad-note" style={{ margin: 0 }}>{r.speaker}</div>}
        </td>
        {r.slots.map(s => (
          <td className="num" key={s.slot} title={s.name || ''}>
            {cell(s)}
          </td>
        ))}
        {!pending && <td className="num"><b>{faScore(r.avg)}</b></td>}
        {!pending && <td>{band ? band.label : '—'}</td>}
        {pending && (
          <td>
            <span className={'ad-badge ' + (r.needsThird ? 'closed' : '')}>{statusText}</span>
          </td>
        )}
        <td>
          <div className="ad-row" style={{ margin: 0 }}>
            <button className="ad-btn alt sm" onClick={toggle}>{open ? 'بستن' : 'جزئیات'}</button>
            {r.kind === 'talk' && (
              <Link className="ad-btn alt sm" href={'/talk-report/' + r.id} target="_blank" style={{ textDecoration: 'none' }}>
                PDF
              </Link>
            )}
          </div>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={cols} style={{ background: '#fbfaf7' }}>
            <table>
              <thead>
                <tr>
                  <th>معیار</th>
                  {r.slots.map(s => (
                    <th className="num" key={s.slot}>
                      داور {fa(s.slot)}
                      {s.name ? <div className="ad-note" style={{ margin: 0 }}>{s.name}</div> : null}
                    </th>
                  ))}
                  <th className="num">میانگین</th>
                </tr>
              </thead>
              <tbody>
                {PRESENTATION_CRITERIA.map(c => (
                  <tr key={c.id}>
                    <td>
                      {c.label} <span className="ad-note">(از {fa(c.max)})</span>
                    </td>
                    {r.slots.map(s => {
                      const v = s.review ? (s.review.scores || {})[c.id] : undefined;
                      return (
                        <td className="num" key={s.slot}>
                          {typeof v === 'number' ? fa(v) : '—'}
                        </td>
                      );
                    })}
                    <td className="num">{faScore(r.critAvg[c.id])}</td>
                  </tr>
                ))}
                <tr>
                  <td><b>مجموع (از {fa(MAX_PRESENTATION_TOTAL)})</b></td>
                  {r.slots.map(s => (
                    <td className="num" key={s.slot}><b>{s.total !== null ? fa(s.total) : '—'}</b></td>
                  ))}
                  <td className="num"><b>{faScore(r.avg)}</b></td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}
