'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import {
  PRESENTATION_CRITERIA,
  MAX_PRESENTATION_TOTAL,
} from '../../../lib/presentation';

const LEVEL_FA = { weak: 'ضعیف', medium: 'متوسط', excellent: 'عالی' };
const TRACK_COLOR = { weak: '#c0392b', medium: '#b7791f', excellent: '#1f7a4d' };

function levelFor(value, criterion) {
  const { weakMax, medMax } = criterion.guidance;
  if (value <= weakMax) return 'weak';
  if (value <= medMax) return 'medium';
  return 'excellent';
}
function textFor(level, criterion) {
  if (level === 'weak') return criterion.guidance.weak;
  if (level === 'medium') return criterion.guidance.medium;
  return criterion.guidance.excellent;
}

function ScoreSlider({ criterion, value, onChange }) {
  const v = value ?? 0;
  const level = levelFor(v, criterion);
  const pct = criterion.max ? (v / criterion.max) * 100 : 0;

  return (
    <div className="pp-card">
      <div className="pp-label">{criterion.label}</div>
      <div className="pp-range">بازه نمره: ۰ تا {criterion.max}</div>
      <div className="pp-scorerow">
        <div className={`pp-num pp-${level}`}>{v}</div>
        <div className="pp-sliderbox">
          <input
            type="range"
            min={0}
            max={criterion.max}
            step={1}
            value={v}
            onChange={(e) => onChange(criterion.id, Number(e.target.value))}
            style={{
              background: `linear-gradient(90deg, ${TRACK_COLOR[level]} ${pct}%, #e3e7ee ${pct}%)`,
            }}
            aria-label={criterion.label}
          />
          <div className="pp-ticks"><span>۰</span><span>{criterion.max}</span></div>
        </div>
      </div>
      <div className={`pp-pop pp-${level}`}>
        <span className="pp-dot" />
        <span><b>{LEVEL_FA[level]}:</b> {textFor(level, criterion)}</span>
      </div>
    </div>
  );
}

// نمودار ستونی نمرات ثبت‌شده (هر ستون = یک معیار، ارتفاع = درصد از حداکثر نمره آن معیار)
function ScoreChart({ title, criteria, scores, maxTotal }) {
  const total = criteria.reduce((sum, c) => sum + (scores?.[c.id] ?? 0), 0);
  return (
    <div className="sc-box">
      <div className="sc-head">
        <span className="sc-title">{title}</span>
        <span className="sc-total">{total} / {maxTotal}</span>
      </div>
      <div className="sc-plot">
        {criteria.map((c, i) => {
          const v = scores?.[c.id] ?? 0;
          const pct = c.max ? (v / c.max) * 100 : 0;
          const level = levelFor(v, c);
          return (
            <div key={c.id} className="sc-col" title={`${c.label}: ${v} از ${c.max}`}>
              <span className="sc-val" style={{ color: TRACK_COLOR[level] }}>{v}</span>
              <div className="sc-track">
                <div className="sc-bar" style={{ height: `${pct}%`, background: TRACK_COLOR[level] }} />
              </div>
              <span className="sc-idx">{i + 1}</span>
            </div>
          );
        })}
      </div>
      <ol className="sc-legend">
        {criteria.map((c) => (
          <li key={c.id}>
            {c.label} <span className="sc-legend-num">({scores?.[c.id] ?? 0} از {c.max})</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function PresentationReviewPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [papers, setPapers] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [saved, setSaved] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [message, setMessage] = useState('');
  const [myName, setMyName] = useState('');

  // این صفحه عمداً هیچ کوئری‌ای به جدول reviews (نمرات PCI) نمی‌زند
  // تا داور هنگام امتیازدهی سخنرانی، از نمرات PCI بی‌اطلاع بماند.
  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace('/login');
      return;
    }
    setMe(user);
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    setMyName(prof?.full_name || prof?.name || user.email);

    const { data: paperRows, error } = await supabase
      .from('papers')
      .select('id, title, abstract_text, pres_reviewer1, pres_reviewer2, pres_reviewer3')
      .or(`pres_reviewer1.eq.${user.id},pres_reviewer2.eq.${user.id},pres_reviewer3.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (error) {
      setMessage('خطا در دریافت مقالات: ' + error.message);
      setLoading(false);
      return;
    }

    // سخنرانی‌هایی که ادمین (با نام سخنران و موضوع) برای این داور ثبت کرده است
    // اگر جدول pres_talks هنوز ساخته نشده باشد، فقط نادیده گرفته می‌شود
    const { data: talkRows } = await supabase
      .from('pres_talks')
      .select('id, speaker, title, pres_reviewer1, pres_reviewer2, pres_reviewer3')
      .or(`pres_reviewer1.eq.${user.id},pres_reviewer2.eq.${user.id},pres_reviewer3.eq.${user.id}`)
      .order('created_at', { ascending: false });

    const paperList = (paperRows || []).map((p) => ({ ...p, _kind: 'paper' }));
    const talkList = (talkRows || []).map((t) => ({ ...t, _kind: 'talk' }));
    const list = [...talkList, ...paperList];
    setPapers(list);

    const nextDrafts = {};
    const nextSaved = {};

    if (paperList.length) {
      const ids = paperList.map((p) => p.id);
      const { data: reviewRows } = await supabase
        .from('presentation_reviews')
        .select('*')
        .in('paper_id', ids)
        .eq('reviewer_id', user.id);
      (reviewRows || []).forEach((r) => {
        nextDrafts[r.paper_id] = r.scores || {};
        nextSaved[r.paper_id] = r.scores || {};
      });
    }

    if (talkList.length) {
      const ids = talkList.map((t) => t.id);
      const { data: talkReviewRows } = await supabase
        .from('pres_talk_reviews')
        .select('*')
        .in('talk_id', ids)
        .eq('reviewer_id', user.id);
      (talkReviewRows || []).forEach((r) => {
        nextDrafts[r.talk_id] = r.scores || {};
        nextSaved[r.talk_id] = r.scores || {};
      });
    }

    if (list.length) {
      setDrafts((prev) => ({ ...nextDrafts, ...prev }));
      setSaved(nextSaved);
    }

    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  function mySlot(paper) {
    if (paper.pres_reviewer1 === me?.id) return 1;
    if (paper.pres_reviewer2 === me?.id) return 2;
    if (paper.pres_reviewer3 === me?.id) return 3;
    return null;
  }

  function updateDraft(paperId, criterionId, value) {
    setDrafts((prev) => ({
      ...prev,
      [paperId]: { ...(prev[paperId] || {}), [criterionId]: value },
    }));
  }

  function liveTotal(paperId) {
    const d = drafts[paperId] || {};
    return PRESENTATION_CRITERIA.reduce((sum, c) => sum + (d[c.id] ?? 0), 0);
  }

  async function submitReview(paper) {
    const slot = mySlot(paper);
    if (!slot) return;
    const d = drafts[paper.id] || {};
    const missing = PRESENTATION_CRITERIA.some((c) => d[c.id] === undefined);
    if (missing) {
      setMessage('لطفاً به همه معیارها نمره بدهید.');
      return;
    }
    setSavingId(paper.id);
    const total = liveTotal(paper.id);
    const isTalk = paper._kind === 'talk';
    const { error } = await supabase.from(isTalk ? 'pres_talk_reviews' : 'presentation_reviews').upsert(
      {
        ...(isTalk ? { talk_id: paper.id } : { paper_id: paper.id }),
        reviewer_id: me.id,
        slot,
        scores: d,
        total,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: isTalk ? 'talk_id,slot' : 'paper_id,slot' }
    );
    setSavingId(null);
    if (error) {
      setMessage('خطا در ثبت نظر: ' + error.message);
    } else {
      setSaved((prev) => ({ ...prev, [paper.id]: { ...d } }));
      setMessage('نظر شما درباره ارائه سخنرانی با موفقیت ثبت شد.');
    }
  }

  if (loading) return <div className="pp-wrap">در حال بارگذاری...</div>;

  return (
    <div className="pp-wrap" dir="rtl">
      <div className="pp-nav">
        <a href="/reviewer">امتیازدهی PCI (چکیده مقاله)</a>
        <span className="pp-nav-current">امتیازدهی ارائه سخنرانی</span>
        <button className="ghost small" style={{ marginInlineStart: 'auto' }} onClick={() => supabase.auth.signOut().then(() => router.replace('/login'))}>خروج</button>
      </div>

      <h1>پنل داوری ارائه سخنرانی و اسلایدها</h1>
      {myName && <div className="small-muted" style={{ marginBottom: 14 }}>{myName} (داور)</div>}
      <p className="pp-sub">این ارزیابی مستقل از شاخص PCI است و فقط کیفیت اسلاید و نحوه اجرای سخنرانی را می‌سنجد. نمرات PCI در این صفحه در دسترس شما نیست.</p>

      {message && <div className="pp-msg">{message}</div>}

      {papers.length === 0 && (
        <p>در حال حاضر سخنرانی‌ای برای داوری به شما اختصاص داده نشده است.</p>
      )}

      {papers.map((paper) => {
        const total = liveTotal(paper.id);
        return (
          <div key={paper.id} className="pp-paper">
            <h2 dir="auto">{paper.title}</h2>
            {paper._kind === 'talk' && paper.speaker && (
              <div className="small-muted" style={{ marginBottom: 12 }}>سخنران: {paper.speaker}</div>
            )}

            {PRESENTATION_CRITERIA.map((c) => (
              <ScoreSlider
                key={c.id}
                criterion={c}
                value={(drafts[paper.id] || {})[c.id]}
                onChange={(id, val) => updateDraft(paper.id, id, val)}
              />
            ))}

            <div className="pp-total">
              مجموع نمره ارائه: <b>{total}</b> / {MAX_PRESENTATION_TOTAL}
            </div>

            <button
              className="pp-submit"
              disabled={savingId === paper.id}
              onClick={() => submitReview(paper)}
            >
              {savingId === paper.id ? 'در حال ثبت...' : 'ثبت نظر'}
            </button>

            {paper._kind === 'talk' && saved[paper.id] && (
              <div style={{ marginTop: 12 }}>
                <a className="ghost small" href={'/talk-report/' + paper.id} target="_blank" rel="noreferrer" style={{ display: 'inline-block', padding: '6px 11px', border: '1px solid #1f3864', borderRadius: 8, color: '#1f3864', textDecoration: 'none', fontSize: 12.5 }}>
                  خروجی PDF انگلیسی از نمرات من
                </a>
              </div>
            )}

            {saved[paper.id] && (
              <ScoreChart
                title="نمودار نمرات ثبت‌شده ارائه شما"
                criteria={PRESENTATION_CRITERIA}
                scores={saved[paper.id]}
                maxTotal={MAX_PRESENTATION_TOTAL}
              />
            )}
          </div>
        );
      })}

      <style jsx global>{`
        .pp-wrap { max-width: 760px; margin: 0 auto; padding: 24px 16px 60px; font-family: Vazirmatn, Tahoma, sans-serif; }
        .pp-nav { display: flex; gap: 14px; margin-bottom: 18px; font-size: 13px; align-items: center; }
        .pp-nav a { color: #2e5395; text-decoration: none; font-weight: 600; }
        .pp-nav a:hover { text-decoration: underline; }
        .pp-nav-current { color: #1f3864; font-weight: 700; border-bottom: 2px solid #1f3864; padding-bottom: 2px; }
        h1 { font-size: 22px; font-weight: 800; margin-bottom: 6px; }
        .pp-sub { font-size: 13px; color: #5b6472; margin-bottom: 18px; line-height: 1.8; }
        .pp-msg { background: #eef1f7; border: 1px solid #dde3ee; border-radius: 10px; padding: 10px 14px; margin-bottom: 16px; font-size: 14px; }
        .pp-paper { background: #fff; border: 1px solid #dde3ee; border-radius: 16px; padding: 20px; margin-bottom: 28px; box-shadow: 0 1px 2px rgba(20,30,50,.06); }
        .pp-paper h2 { font-size: 17px; margin: 0 0 16px; }
        .pp-card { border: 1px solid #eef1f7; border-radius: 12px; padding: 14px; margin-bottom: 10px; }
        .pp-label { font-weight: 700; font-size: 14px; margin-bottom: 2px; }
        .pp-range { font-size: 11.5px; color: #8891a0; margin-bottom: 10px; font-weight: 600; }
        .pp-scorerow { display: flex; align-items: center; gap: 12px; }
        .pp-num { width: 42px; height: 42px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px; flex-shrink: 0; background: #eef1f7; }
        .pp-num.pp-weak { background: #fceceb; color: #c0392b; }
        .pp-num.pp-medium { background: #fdf3e2; color: #b7791f; }
        .pp-num.pp-excellent { background: #e7f5ee; color: #1f7a4d; }
        .pp-sliderbox { flex: 1; }
        input[type='range'] {
          -webkit-appearance: none; appearance: none; width: 100%; height: 8px; border-radius: 999px;
          outline: none; cursor: pointer; direction: ltr; transform: scaleX(-1);
        }
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none; width: 22px; height: 22px; border-radius: 50%;
          background: #1f3864; border: 3px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.3); cursor: grab;
        }
        input[type='range']::-moz-range-thumb {
          width: 22px; height: 22px; border-radius: 50%; background: #1f3864; border: 3px solid #fff; cursor: grab;
        }
        .pp-ticks { display: flex; justify-content: space-between; font-size: 10px; color: #8891a0; margin-top: 4px; }
        .pp-pop { margin-top: 10px; border-radius: 10px; padding: 10px 12px; display: flex; gap: 8px; align-items: flex-start; font-size: 13px; line-height: 1.8; }
        .pp-pop.pp-weak { background: #fceceb; }
        .pp-pop.pp-medium { background: #fdf3e2; }
        .pp-pop.pp-excellent { background: #e7f5ee; }
        .pp-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; background: currentColor; flex-shrink: 0; }
        .pp-total { margin-top: 16px; font-size: 15px; font-weight: 700; }
        .pp-submit { margin-top: 14px; background: #1f3864; color: #fff; border: none; border-radius: 10px; padding: 10px 22px; font-size: 14px; font-weight: 700; cursor: pointer; }
        .pp-submit:disabled { opacity: .6; cursor: default; }

        .sc-box { margin-top: 18px; border: 1px solid #dde3ee; border-radius: 14px; padding: 16px; background: #fafbfd; }
        .sc-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 14px; }
        .sc-title { font-weight: 700; font-size: 14px; color: #1f3864; }
        .sc-total { font-weight: 800; font-size: 16px; color: #1f3864; direction: ltr; }
        .sc-plot { display: flex; align-items: flex-end; gap: 6px; height: 170px; padding-bottom: 4px; border-bottom: 1px solid #dde3ee; }
        .sc-col { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; align-items: center; }
        .sc-val { font-size: 11px; font-weight: 700; margin-bottom: 4px; }
        .sc-track { flex: 1; width: 100%; max-width: 34px; background: #eef1f7; border-radius: 6px; display: flex; align-items: flex-end; overflow: hidden; }
        .sc-bar { width: 100%; border-radius: 6px 6px 0 0; transition: height .4s ease; }
        .sc-idx { font-size: 11px; color: #8891a0; margin-top: 6px; }
        .sc-legend { margin: 12px 0 0; padding-inline-start: 22px; font-size: 12px; color: #4b5563; line-height: 1.9; }
        .sc-legend-num { color: #8891a0; }
      `}</style>
    </div>
  );
}
