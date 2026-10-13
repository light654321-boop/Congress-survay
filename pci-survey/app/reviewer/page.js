'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { PCI_CRITERIA, DIM_LABEL, MAX_TOTAL, bandFor } from '../../lib/pci';
import { DIM_EN, CRITERIA_EN, BAND_EN } from '../../lib/pciEnglish';
import TalkNotice from '../../lib/TalkNotice';

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
    <div className="pci-card">
      <div className="pci-label">{criterion.label}</div>
      <div className="pci-range">بازه نمره: ۰ تا {criterion.max}</div>
      <div className="pci-scorerow">
        <div className={`pci-num pci-${level}`}>{v}</div>
        <div className="pci-sliderbox">
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
          <div className="pci-ticks"><span>۰</span><span>{criterion.max}</span></div>
        </div>
      </div>
      <div className={`pci-pop pci-${level}`}>
        <span className="pci-dot" />
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

export default function ReviewerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [papers, setPapers] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [saved, setSaved] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [message, setMessage] = useState('');
  const [myName, setMyName] = useState('');
  const [pdfId, setPdfId] = useState(null);
  const [savedAt, setSavedAt] = useState({});

  // English PDF report of this reviewer's PCI evaluation (for sending to the review chair)
  async function downloadReport(paper) {
    const scores = saved[paper.id];
    if (!scores) return;
    setPdfId(paper.id);
    try {
      const { downloadReviewPdf } = await import('../../lib/reviewPdf');
      const dimKeys = [...new Set(PCI_CRITERIA.map((c) => c.dim))];
      const dimensions = dimKeys.map((k) => {
        const crit = PCI_CRITERIA.filter((c) => c.dim === k);
        return {
          name: DIM_EN[k] || k,
          max: crit.reduce((s, c) => s + c.max, 0),
          criteria: crit.map((c) => ({ label: CRITERIA_EN[c.id] || c.id, score: scores[c.id] ?? 0, max: c.max })),
        };
      });
      const total = PCI_CRITERIA.reduce((s, c) => s + (scores[c.id] ?? 0), 0);
      const code = 'PCI-' + String(paper.id).slice(0, 8).toUpperCase();
      await downloadReviewPdf({
        title: paper.title,
        abstract: paper.abstract_text,
        reviewerName: myName,
        submittedAt: savedAt[paper.id] || new Date(),
        paperCode: code,
        band: BAND_EN[bandFor(total).key],
        dimensions,
      }, `${code}-PCI-evaluation.pdf`);
    } catch (e) {
      setMessage('خطا در ساخت فایل PDF: ' + (e?.message || e));
    }
    setPdfId(null);
  }

  const AI_ENABLED = process.env.NEXT_PUBLIC_AI_ENABLED === 'true';

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
      .select('*')
      .or(`reviewer1.eq.${user.id},reviewer2.eq.${user.id},reviewer3.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (error) {
      setMessage('خطا در دریافت مقالات: ' + error.message);
      setLoading(false);
      return;
    }

    const list = paperRows || [];
    setPapers(list);

    if (list.length) {
      const ids = list.map((p) => p.id);
      const { data: reviewRows } = await supabase
        .from('reviews')
        .select('*')
        .in('paper_id', ids)
        .eq('reviewer_id', user.id);

      const nextDrafts = {};
      const nextSaved = {};
      const nextSavedAt = {};
      (reviewRows || []).forEach((r) => {
        nextDrafts[r.paper_id] = r.scores || {};
        nextSaved[r.paper_id] = r.scores || {};
        nextSavedAt[r.paper_id] = r.submitted_at;
      });
      setDrafts((prev) => ({ ...nextDrafts, ...prev }));
      setSaved(nextSaved);
      setSavedAt(nextSavedAt);
    }

    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  function mySlot(paper) {
    if (paper.reviewer1 === me?.id) return 1;
    if (paper.reviewer2 === me?.id) return 2;
    if (paper.reviewer3 === me?.id) return 3;
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
    return PCI_CRITERIA.reduce((sum, c) => sum + (d[c.id] ?? 0), 0);
  }

  async function submitReview(paper) {
    const slot = mySlot(paper);
    if (!slot) return;
    const d = drafts[paper.id] || {};
    const missing = PCI_CRITERIA.some((c) => d[c.id] === undefined);
    if (missing) {
      setMessage('لطفاً به همه معیارها نمره بدهید.');
      return;
    }
    setSavingId(paper.id);
    const total = liveTotal(paper.id);
    const { error } = await supabase.from('reviews').upsert(
      {
        paper_id: paper.id,
        reviewer_id: me.id,
        slot,
        scores: d,
        total,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: 'paper_id,slot' }
    );
    setSavingId(null);
    if (error) {
      setMessage('خطا در ثبت نظر: ' + error.message);
    } else {
      setSaved((prev) => ({ ...prev, [paper.id]: { ...d } }));
      setSavedAt((prev) => ({ ...prev, [paper.id]: new Date().toISOString() }));
      setMessage('نظر شما با موفقیت ثبت شد.');
    }
  }

  if (loading) return <div className="pci-wrap">در حال بارگذاری...</div>;

  return (
    <div className="pci-wrap" dir="rtl">
      <div style={{ display: 'flex', gap: 14, marginBottom: 18, fontSize: 13, alignItems: 'center' }}>
        <span style={{ color: '#1f3864', fontWeight: 700, borderBottom: '2px solid #1f3864', paddingBottom: 2 }}>امتیازدهی PCI</span>
        <a href="/reviewer/presentation" style={{ color: '#2e5395', fontWeight: 600, textDecoration: 'none' }}>امتیازدهی ارائه سخنرانی</a>
        <button className="ghost small" style={{ marginInlineStart: 'auto' }} onClick={() => supabase.auth.signOut().then(() => router.replace('/login'))}>خروج</button>
      </div>

      <TalkNotice />

      <h1>پنل داوری مقالات</h1>
      {myName && <div className="small-muted" style={{ marginBottom: 14 }}>{myName} (داور)</div>}
      {message && <div className="pci-msg">{message}</div>}

      {papers.length === 0 && (
        <p>در حال حاضر مقاله‌ای برای داوری به شما اختصاص داده نشده است.</p>
      )}

      {papers.map((paper) => {
        const total = liveTotal(paper.id);
        let lastDim = null;
        return (
          <div key={paper.id} className="pci-paper">
            <h2 dir="auto">{paper.title}</h2>
            <p className="pci-abstract" dir="auto">{paper.abstract_text}</p>

            {PCI_CRITERIA.map((c) => {
              const showHeader = c.dim !== lastDim;
              lastDim = c.dim;
              return (
                <div key={c.id}>
                  {showHeader && <h3 className="pci-dimhead">{DIM_LABEL[c.dim]}</h3>}
                  <ScoreSlider
                    criterion={c}
                    value={(drafts[paper.id] || {})[c.id]}
                    onChange={(id, val) => updateDraft(paper.id, id, val)}
                  />
                </div>
              );
            })}

            <div className="pci-total">
              مجموع نمره: <b>{total}</b> / {MAX_TOTAL}
            </div>

            {AI_ENABLED && (
              <p className="pci-note">
                نظر مشورتی هوش مصنوعی در این مرحله نمایش داده نمی‌شود و فقط بعد از ثبت نظر هر دو داور، برای ادمین قابل مشاهده خواهد بود.
              </p>
            )}

            <button
              className="pci-submit"
              disabled={savingId === paper.id}
              onClick={() => submitReview(paper)}
            >
              {savingId === paper.id ? 'در حال ثبت...' : 'ثبت نظر'}
            </button>

            {saved[paper.id] && (
              <ScoreChart
                title="نمودار نمرات ثبت‌شده PCI شما"
                criteria={PCI_CRITERIA}
                scores={saved[paper.id]}
                maxTotal={MAX_TOTAL}
              />
            )}

            {saved[paper.id] && (
              <button
                className="pci-pdf"
                disabled={pdfId === paper.id}
                onClick={() => downloadReport(paper)}
              >
                {pdfId === paper.id ? 'در حال ساخت PDF...' : 'دانلود گزارش ارزیابی (PDF انگلیسی)'}
              </button>
            )}
          </div>
        );
      })}

      <style jsx global>{`
        .pci-wrap { max-width: 760px; margin: 0 auto; padding: 24px 16px 60px; font-family: Vazirmatn, Tahoma, sans-serif; }
        h1 { font-size: 22px; font-weight: 800; margin-bottom: 16px; }
        .pci-msg { background: #eef1f7; border: 1px solid #dde3ee; border-radius: 10px; padding: 10px 14px; margin-bottom: 16px; font-size: 14px; }
        .pci-paper { background: #fff; border: 1px solid #dde3ee; border-radius: 16px; padding: 20px; margin-bottom: 28px; box-shadow: 0 1px 2px rgba(20,30,50,.06); }
        .pci-paper h2 { font-size: 17px; margin: 0 0 8px; }
        .pci-abstract { font-size: 14px; color: #4b5563; line-height: 1.9; margin-bottom: 18px; white-space: pre-wrap; }
        .pci-dimhead { font-size: 14px; font-weight: 700; color: #1f3864; margin: 22px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #dde3ee; }
        .pci-card { border: 1px solid #eef1f7; border-radius: 12px; padding: 14px; margin-bottom: 10px; }
        .pci-label { font-weight: 700; font-size: 14px; margin-bottom: 2px; }
        .pci-range { font-size: 11.5px; color: #8891a0; margin-bottom: 10px; font-weight: 600; }
        .pci-scorerow { display: flex; align-items: center; gap: 12px; }
        .pci-num { width: 42px; height: 42px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px; flex-shrink: 0; background: #eef1f7; }
        .pci-num.pci-weak { background: #fceceb; color: #c0392b; }
        .pci-num.pci-medium { background: #fdf3e2; color: #b7791f; }
        .pci-num.pci-excellent { background: #e7f5ee; color: #1f7a4d; }
        .pci-sliderbox { flex: 1; }
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
        .pci-ticks { display: flex; justify-content: space-between; font-size: 10px; color: #8891a0; margin-top: 4px; }
        .pci-pop { margin-top: 10px; border-radius: 10px; padding: 10px 12px; display: flex; gap: 8px; align-items: flex-start; font-size: 13px; line-height: 1.8; }
        .pci-pop.pci-weak { background: #fceceb; }
        .pci-pop.pci-medium { background: #fdf3e2; }
        .pci-pop.pci-excellent { background: #e7f5ee; }
        .pci-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; background: currentColor; flex-shrink: 0; }
        .pci-total { margin-top: 16px; font-size: 15px; font-weight: 700; }
        .pci-note { font-size: 12.5px; color: #8891a0; margin-top: 10px; }
        .pci-submit { margin-top: 14px; background: #1f3864; color: #fff; border: none; border-radius: 10px; padding: 10px 22px; font-size: 14px; font-weight: 700; cursor: pointer; }
        .pci-submit:disabled { opacity: .6; cursor: default; }

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
        .pci-pdf { margin-top: 14px; background: #fff; color: #1f3864; border: 1.5px solid #1f3864; border-radius: 10px; padding: 9px 18px; font-size: 13.5px; font-weight: 700; cursor: pointer; }
        .pci-pdf:disabled { opacity: .6; cursor: default; }
      `}</style>
    </div>
  );
}
