'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabaseClient';
import { useSurveyAdmin } from '../../../lib/useSurveyAdmin';
import { adminCss } from '../../../lib/surveyStyles';
import { normalizeName, fa } from '../../../lib/surveyConfig';

const empty = { speaker: '', title: '', speaker_en: '', title_en: '', r1: '', r2: '', r3: '' };

function ReviewerSelect({ reviewers, value, onChange, label, optional }) {
  return (
    <label>
      {label}
      <select value={value} onChange={e => onChange(e.target.value)}>
        <option value="">{optional ? '— بدون داور سوم —' : '— انتخاب داور —'}</option>
        {reviewers.map(r => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function FormFields({ f, set, reviewers }) {
  return (
    <>
      <div className="ad-form">
        <label>
          نام سخنران *
          <input type="text" value={f.speaker} onChange={e => set('speaker', e.target.value)} placeholder="مثلاً دکتر الف" />
        </label>
        <label>
          موضوع سخنرانی *
          <input type="text" value={f.title} onChange={e => set('title', e.target.value)} placeholder="عنوان مطلبی که ارائه می‌دهد" />
        </label>
      </div>
      <div className="ad-form" style={{ marginTop: 10 }}>
        <ReviewerSelect reviewers={reviewers} label="داور ۱ *" value={f.r1} onChange={v => set('r1', v)} />
        <ReviewerSelect reviewers={reviewers} label="داور ۲ *" value={f.r2} onChange={v => set('r2', v)} />
        <ReviewerSelect reviewers={reviewers} label="داور سوم (تیم‌بریک، اختیاری)" value={f.r3} onChange={v => set('r3', v)} optional />
      </div>
      <details className="ad-note" style={{ marginTop: 10 }}>
        <summary style={{ cursor: 'pointer' }}>نام انگلیسی برای PDF (اختیاری)</summary>
        <div className="ad-form" dir="ltr" style={{ marginTop: 8 }}>
          <label>
            Speaker name
            <input type="text" value={f.speaker_en} onChange={e => set('speaker_en', e.target.value)} />
          </label>
          <label>
            Talk title
            <input type="text" value={f.title_en} onChange={e => set('title_en', e.target.value)} />
          </label>
        </div>
      </details>
    </>
  );
}

export default function PresentationTalksPage() {
  const access = useSurveyAdmin();
  const [reviewers, setReviewers] = useState([]);
  const [talks, setTalks] = useState([]);
  const [done, setDone] = useState({}); // { [talkId]: { 1:true, 2:true } }
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [ed, setEd] = useState(null); // ویرایش: { id, ...فیلدها }

  const refresh = useCallback(async () => {
    try {
      const [r, t, v] = await Promise.all([
        supabase.from('profiles').select('id, name').eq('role', 'reviewer').order('name'),
        supabase.from('pres_talks').select('*').order('created_at', { ascending: false }),
        supabase.from('pres_talk_reviews').select('talk_id, slot'),
      ]);
      if (t.error) throw t.error;
      if (v.error) throw v.error;
      setReviewers(r.data || []);
      setTalks(t.data || []);
      const m = {};
      (v.data || []).forEach(x => {
        m[x.talk_id] = m[x.talk_id] || {};
        m[x.talk_id][x.slot] = true;
      });
      setDone(m);
    } catch (e) {
      setMsg({
        type: 'err',
        text: 'خواندن اطلاعات ناموفق بود: ' + (e.message || '') + ' — فایل sql/05-talks.sql را در Supabase اجرا کرده‌اید؟',
      });
    }
  }, []);

  useEffect(() => {
    if (access === 'admin') refresh();
  }, [access, refresh]);

  const nameOf = id => (reviewers.find(r => r.id === id) || {}).name || '—';
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // داوران انتخاب‌شده باید متفاوت باشند؛ داور ۱ و ۲ اجباری و داور ۳ (تیم‌بریک) اختیاری است
  function validate(f) {
    if (!f.speaker.trim() || !f.title.trim()) return 'نام سخنران و موضوع سخنرانی را بنویسید.';
    if (!f.r1 || !f.r2) return 'دست‌کم دو داور (داور ۱ و داور ۲) را انتخاب کنید.';
    const ids = [f.r1, f.r2, f.r3].filter(Boolean);
    if (new Set(ids).size !== ids.length) return 'یک داور را نمی‌توان دو بار برای یک سخنرانی انتخاب کرد.';
    return '';
  }

  const ready = !validate(form);

  async function add() {
    const bad = validate(form);
    if (bad) {
      setMsg({ type: 'err', text: bad });
      return;
    }
    const dup = talks.find(
      t => normalizeName(t.speaker) === normalizeName(form.speaker) && normalizeName(t.title) === normalizeName(form.title)
    );
    if (dup && !window.confirm('سخنرانی با همین سخنران و موضوع از قبل ثبت شده است. باز هم یک مورد جدید ساخته شود؟')) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from('pres_talks').insert({
      speaker: form.speaker.trim(),
      title: form.title.trim(),
      speaker_en: form.speaker_en.trim() || null,
      title_en: form.title_en.trim() || null,
      pres_reviewer1: form.r1,
      pres_reviewer2: form.r2,
      pres_reviewer3: form.r3 || null,
    });
    setBusy(false);
    if (error) {
      setMsg({ type: 'err', text: 'ثبت ناموفق بود: ' + error.message });
      return;
    }
    setMsg({ type: 'ok', text: 'ثبت شد و همین الان در پنل داورانِ انتخاب‌شده (بخش «امتیازدهی ارائه سخنرانی») نمایش داده می‌شود.' });
    setForm(empty);
    await refresh();
  }

  function openEd(t) {
    setEd(e =>
      e && e.id === t.id
        ? null
        : {
            id: t.id,
            speaker: t.speaker || '',
            title: t.title || '',
            speaker_en: t.speaker_en || '',
            title_en: t.title_en || '',
            r1: t.pres_reviewer1 || '',
            r2: t.pres_reviewer2 || '',
            r3: t.pres_reviewer3 || '',
          }
    );
  }

  async function saveEd() {
    const bad = validate(ed);
    if (bad) {
      setMsg({ type: 'err', text: bad });
      return;
    }
    const old = talks.find(t => t.id === ed.id) || {};
    // اگر داوری که قبلاً نمره داده را عوض کنیم، نمرهٔ او با جایگاه مربوط می‌ماند؛ پس هشدار می‌دهیم
    const changedWithScore = [1, 2, 3].filter(n => done[ed.id] && done[ed.id][n] && (old['pres_reviewer' + n] || '') !== (ed['r' + n] || ''));
    if (changedWithScore.length) {
      const ok = window.confirm(
        'برای جایگاه داور ' + changedWithScore.map(fa).join(' و ') +
          ' قبلاً نمره ثبت شده است. با تغییر داور، آن نمره حذف می‌شود تا داور جدید خودش نمره بدهد. ادامه می‌دهید؟'
      );
      if (!ok) return;
      const del = await supabase.from('pres_talk_reviews').delete().eq('talk_id', ed.id).in('slot', changedWithScore);
      if (del.error) {
        setMsg({ type: 'err', text: 'حذف نمرهٔ قبلی ناموفق بود: ' + del.error.message });
        return;
      }
    }
    const { error } = await supabase
      .from('pres_talks')
      .update({
        speaker: ed.speaker.trim(),
        title: ed.title.trim(),
        speaker_en: ed.speaker_en.trim() || null,
        title_en: ed.title_en.trim() || null,
        pres_reviewer1: ed.r1,
        pres_reviewer2: ed.r2,
        pres_reviewer3: ed.r3 || null,
      })
      .eq('id', ed.id);
    if (error) {
      setMsg({ type: 'err', text: 'ذخیره ناموفق بود: ' + error.message });
      return;
    }
    setMsg({ type: 'ok', text: 'تغییرات ذخیره شد.' });
    setEd(null);
    await refresh();
  }

  async function del(t) {
    if (!window.confirm(`سخنرانی «${t.title}» همراه با همهٔ نمرات داوران آن حذف شود؟ این کار برگشت‌پذیر نیست.`)) return;
    const { error } = await supabase.from('pres_talks').delete().eq('id', t.id);
    setMsg(error ? { type: 'err', text: error.message } : { type: 'ok', text: 'حذف شد.' });
    await refresh();
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
        <h1>ثبت سخنرانی و تعیین داوران ارزیابی</h1>
        <p>سخنران و موضوع را بنویسید، داوران را انتخاب کنید؛ سخنرانی برای آن داوران نمایش داده می‌شود.</p>
        <div className="ad-nav no-print">
          <Link href="/admin">بازگشت به پنل ادمین</Link>
          <Link href="/admin/presentation-talks" className="on">ثبت سخنرانی و تعیین داور</Link>
          <Link href="/admin/presentation-results">نتایج ارزیابی سخنرانی (داوران)</Link>
        </div>
      </header>

      <div className="ad-wrap">
        <section className="ad-panel">
          <h2>۱. افزودن سخنرانی</h2>
          <p className="ad-note">
            داوران در زمان اجرای سخنرانی، سخنران و موضوع را از همین‌جا می‌بینند و نمره می‌دهند. هر داور فقط نمرهٔ خودش را می‌بیند؛
            نمرات همهٔ داوران فقط در صفحهٔ نتایج برای ادمین نمایش داده می‌شود.
          </p>
          <FormFields f={form} set={setF} reviewers={reviewers} />
          <div className="ad-row">
            <button className="ad-btn" disabled={!ready || busy} onClick={add}>
              {busy ? 'در حال ثبت…' : 'ثبت و ارسال برای داوران'}
            </button>
            {(form.speaker || form.title) && (
              <button className="ad-btn alt" onClick={() => setForm(empty)}>
                پاک کردن فرم
              </button>
            )}
          </div>
          {msg && <div className={'ad-msg ' + msg.type}>{msg.text}</div>}
        </section>

        <section className="ad-panel">
          <h2>۲. سخنرانی‌های ثبت‌شده ({fa(talks.length)})</h2>
          {talks.length === 0 && <p className="ad-note">هنوز سخنرانی‌ای ثبت نشده است.</p>}
          {talks.map(t => (
            <div className="ad-pgroup" key={t.id}>
              <div className="ad-srow">
                <div className="ad-sinfo">
                  <b>{t.title}</b>
                  <span>{t.speaker}</span>
                  <div className="ad-row" style={{ marginTop: 6 }}>
                    {[1, 2, 3].map(n => {
                      const id = t['pres_reviewer' + n];
                      if (!id) return null;
                      const ok = done[t.id] && done[t.id][n];
                      return (
                        <span key={n} className={'ad-badge ' + (ok ? 'open' : '')}>
                          داور {fa(n)}: {nameOf(id)} — {ok ? 'نمره ثبت شد' : 'در انتظار'}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="ad-row" style={{ margin: 0 }}>
                  <Link className="ad-btn alt sm" href={'/talk-report/' + t.id} target="_blank" style={{ textDecoration: 'none' }}>
                    PDF انگلیسی
                  </Link>
                  <button className="ad-btn alt sm" onClick={() => openEd(t)}>ویرایش</button>
                  <button className="ad-btn danger sm" onClick={() => del(t)}>حذف</button>
                </div>
                {ed && ed.id === t.id && (
                  <div className="ad-edit">
                    <FormFields f={ed} set={(k, v) => setEd(e => ({ ...e, [k]: v }))} reviewers={reviewers} />
                    <div className="ad-row">
                      <button className="ad-btn sm" onClick={saveEd}>ذخیره</button>
                      <button className="ad-btn alt sm" onClick={() => setEd(null)}>انصراف</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
