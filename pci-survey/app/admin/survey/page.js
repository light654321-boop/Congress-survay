'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useSurveyAdmin } from '../../../lib/useSurveyAdmin';
import { loadStructure } from '../../../lib/surveyData';
import { normalizeName, CONGRESS_TITLE } from '../../../lib/surveyConfig';
import { adminCss } from '../../../lib/surveyStyles';
import SurveyNav from '../../../lib/SurveyNav';

// ---------- خواندن جدول پنل/سخنران/عنوان از متن (کپی از اکسل یا فایل CSV) ----------
function splitLine(line, delim) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          q = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      q = true;
    } else if (ch === delim) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(x => x.trim());
}

function parseStructure(text) {
  const lines = String(text || '')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter(l => l.trim() !== '');
  if (lines.length === 0) return { rows: [], bad: [] };
  const first = lines[0];
  let delim = ',';
  if (first.includes('\t')) delim = '\t';
  else if (first.split(';').length > first.split(',').length) delim = ';';

  let rows = lines.map(l => splitLine(l, delim));
  const h0 = normalizeName(rows[0][0]);
  if (['پنل', 'نام پنل', 'panel'].includes(h0)) rows = rows.slice(1); // ردیف عنوان ستون‌ها

  const good = [];
  const bad = [];
  rows.forEach((r, i) => {
    if (r[0] && r[1] && r[2]) good.push([r[0], r[1], r[2], r[3] || '', r[4] || '', r[5] || '']);
    else bad.push(r.join(' | '));
  });
  return { rows: good, bad };
}

export default function SurveyManagePage() {
  const access = useSurveyAdmin();

  const [panels, setPanels] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loadErr, setLoadErr] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // {type:'ok'|'err', text}
  const [qr, setQr] = useState({}); // { [sessionId]: dataUrl }
  const emptyForm = { panel: '', speaker: '', title: '', panel_en: '', speaker_en: '', title_en: '' };
  const [form, setForm] = useState(emptyForm);
  const [one, setOne] = useState(null); // { session, url, existed } بعد از ثبت تکی
  const [oneBusy, setOneBusy] = useState(false);
  const [oneMsg, setOneMsg] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const d = await loadStructure();
      setPanels(d.panels);
      setSessions(d.sessions);
      setLoadErr('');
    } catch (e) {
      setLoadErr('خواندن اطلاعات ناموفق بود: ' + (e.message || 'خطای نامشخص'));
    }
  }, []);

  useEffect(() => {
    if (access === 'admin') refresh();
  }, [access, refresh]);

  const parsed = parseStructure(text);

  async function onFile(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (/\.xlsx?$/i.test(f.name)) {
      setMsg({
        type: 'err',
        text: 'فایل اکسل را مستقیم نمی‌توان خواند. یا در اکسل «Save As > CSV UTF-8» بگیرید، یا سلول‌های جدول را کپی کنید و در کادر بالا Paste کنید.',
      });
      return;
    }
    const t = await f.text();
    setText(t);
    setMsg(null);
  }

  async function doImport() {
    if (parsed.rows.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const cur = await loadStructure();
      const panelByKey = {};
      cur.panels.forEach(p => {
        panelByKey[normalizeName(p.name)] = p;
      });
      const maxPanelOrder = cur.panels.reduce((m, p) => Math.max(m, p.sort_order || 0), 0);

      // نام انگلیسی هر پنل: اولین مقدار غیرخالی ستون چهارم
      const panelEn = {};
      for (const r of parsed.rows) {
        const k = normalizeName(r[0]);
        if (r[3] && !panelEn[k]) panelEn[k] = r[3];
      }

      const newNames = [];
      for (const r of parsed.rows) {
        const k = normalizeName(r[0]);
        if (!panelByKey[k] && !newNames.some(n => normalizeName(n) === k)) newNames.push(r[0]);
      }
      if (newNames.length) {
        const { data, error } = await supabase
          .from('survey_panels')
          .insert(
            newNames.map((n, i) => ({
              name: n,
              name_en: panelEn[normalizeName(n)] || null,
              sort_order: maxPanelOrder + i + 1,
            }))
          )
          .select();
        if (error) throw error;
        (data || []).forEach(p => {
          panelByKey[normalizeName(p.name)] = p;
        });
      }

      // تکمیل نام انگلیسی پنل‌هایی که از قبل بوده‌اند
      let enUpdated = 0;
      for (const k of Object.keys(panelEn)) {
        const p = panelByKey[k];
        if (p && !p.name_en && !newNames.some(n => normalizeName(n) === k)) {
          const { error } = await supabase.from('survey_panels').update({ name_en: panelEn[k] }).eq('id', p.id);
          if (error) throw error;
          enUpdated++;
        }
      }

      const existingMap = {};
      cur.sessions.forEach(s => {
        existingMap[s.panel_id + '|' + normalizeName(s.speaker) + '|' + normalizeName(s.title)] = s;
      });
      const maxOrder = {};
      cur.sessions.forEach(s => {
        maxOrder[s.panel_id] = Math.max(maxOrder[s.panel_id] || 0, s.sort_order || 0);
      });

      const toInsert = [];
      let dup = 0;
      for (const r of parsed.rows) {
        const p = panelByKey[normalizeName(r[0])];
        if (!p) continue;
        const key = p.id + '|' + normalizeName(r[1]) + '|' + normalizeName(r[2]);
        const old = existingMap[key];
        if (old) {
          dup++;
          // سخنرانی تکراری: فقط نام انگلیسی را تکمیل یا اصلاح کن
          if ((r[4] || r[5]) && (old.speaker_en !== (r[4] || null) || old.title_en !== (r[5] || null))) {
            const { error } = await supabase
              .from('survey_sessions')
              .update({ speaker_en: r[4] || null, title_en: r[5] || null })
              .eq('id', old.id);
            if (error) throw error;
            enUpdated++;
          }
          continue;
        }
        existingMap[key] = { id: 'pending' };
        maxOrder[p.id] = (maxOrder[p.id] || 0) + 1;
        toInsert.push({
          panel_id: p.id,
          speaker: r[1],
          title: r[2],
          speaker_en: r[4] || null,
          title_en: r[5] || null,
          sort_order: maxOrder[p.id],
        });
      }
      if (toInsert.length) {
        const { error } = await supabase.from('survey_sessions').insert(toInsert);
        if (error) throw error;
      }
      setMsg({
        type: 'ok',
        text:
          `ثبت شد: ${toInsert.length} سخنرانی جدید، ${newNames.length} پنل جدید` +
          (dup ? `، ${dup} مورد تکراری نادیده گرفته شد` : '') +
          (enUpdated ? `، نام انگلیسی ${enUpdated} مورد به‌روز شد` : '') +
          '.',
      });
      setText('');
      await refresh();
    } catch (e) {
      setMsg({
        type: 'err',
        text:
          'ثبت ناموفق بود: ' +
          (e.message || 'خطای نامشخص') +
          ' — اگر پیام دربارهٔ ستون name_en/speaker_en است، فایل sql/03-survey-english.sql را اجرا کنید.',
      });
    }
    setBusy(false);
  }

  const formReady = form.panel.trim() && form.speaker.trim() && form.title.trim();

  function setField(k, v) {
    setForm(f => ({ ...f, [k]: v }));
    setOne(null); // با تغییر فیلدها QR قبلی کنار می‌رود
    setOneMsg(null);
  }

  async function addOne() {
    if (!formReady) return;
    setOneBusy(true);
    setOneMsg(null);
    try {
      const f = {
        panel: form.panel.trim(),
        speaker: form.speaker.trim(),
        title: form.title.trim(),
        panel_en: form.panel_en.trim(),
        speaker_en: form.speaker_en.trim(),
        title_en: form.title_en.trim(),
      };
      const cur = await loadStructure();
      let panel = cur.panels.find(p => normalizeName(p.name) === normalizeName(f.panel));
      if (!panel) {
        const maxPanelOrder = cur.panels.reduce((m, p) => Math.max(m, p.sort_order || 0), 0);
        const { data, error } = await supabase
          .from('survey_panels')
          .insert({ name: f.panel, name_en: f.panel_en || null, sort_order: maxPanelOrder + 1 })
          .select()
          .single();
        if (error) throw error;
        panel = data;
      } else if (f.panel_en && !panel.name_en) {
        await supabase.from('survey_panels').update({ name_en: f.panel_en }).eq('id', panel.id);
      }

      let session = cur.sessions.find(
        s =>
          s.panel_id === panel.id &&
          normalizeName(s.speaker) === normalizeName(f.speaker) &&
          normalizeName(s.title) === normalizeName(f.title)
      );
      const existed = !!session;
      if (session) {
        if (f.speaker_en || f.title_en) {
          await supabase
            .from('survey_sessions')
            .update({ speaker_en: f.speaker_en || session.speaker_en || null, title_en: f.title_en || session.title_en || null })
            .eq('id', session.id);
        }
      } else {
        const maxOrder = cur.sessions.filter(s => s.panel_id === panel.id).reduce((m, s) => Math.max(m, s.sort_order || 0), 0);
        const { data, error } = await supabase
          .from('survey_sessions')
          .insert({
            panel_id: panel.id,
            speaker: f.speaker,
            title: f.title,
            speaker_en: f.speaker_en || null,
            title_en: f.title_en || null,
            sort_order: maxOrder + 1,
          })
          .select()
          .single();
        if (error) throw error;
        session = data;
      }

      const url = await buildPlain(session);
      setOne({ session, url, existed });
      setOneMsg({
        type: 'ok',
        text: existed
          ? 'این سخنرانی از قبل ثبت شده بود؛ همان QR نمایش داده شد.'
          : 'ثبت شد. QR آمادهٔ دانلود است.',
      });
      await refresh();
    } catch (e) {
      setOneMsg({
        type: 'err',
        text:
          'ثبت ناموفق بود: ' +
          (e.message || 'خطای نامشخص') +
          ' — اگر پیام دربارهٔ ستون name_en/speaker_en است، فایل sql/03-survey-english.sql را اجرا کنید؛ اگر دربارهٔ qrcode است، npm install qrcode را اجرا کنید.',
      });
    }
    setOneBusy(false);
  }

  function downloadOne() {
    if (!one) return;
    const a = document.createElement('a');
    a.href = one.url;
    a.download = 'QR-' + (one.session.speaker || 'session').replace(/[\\/:*?"<>|]/g, ' ').trim() + '.png';
    a.click();
  }

  function newOne() {
    // سخنرانی بعدی از همان پنل: نام پنل می‌ماند، بقیه پاک می‌شود
    setForm(f => ({ ...emptyForm, panel: f.panel, panel_en: f.panel_en }));
    setOne(null);
    setOneMsg(null);
  }

  function linkFor(id) {
    return window.location.origin + '/survey/' + id;
  }

  // کارت QR برای اسلاید: نام پنل، عنوان، نام سخنران، QR و جملهٔ راهنما
  async function buildCard(s, panelName) {
    const mod = await import('qrcode');
    const QR = mod.default || mod;
    const qrUrl = await QR.toDataURL(linkFor(s.id), { width: 640, margin: 1, errorCorrectionLevel: 'M' });
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = qrUrl;
    });
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    } catch (e) {}

    const fam = (typeof getComputedStyle === 'function' && getComputedStyle(document.body).fontFamily) || 'Tahoma, Arial, sans-serif';
    const W = 1000;
    const pad = 56;
    const maxW = W - pad * 2;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const font = (px, w) => `${w} ${px}px ${fam}`;

    function wrap(text, px, weight, maxLines) {
      ctx.font = font(px, weight);
      const words = String(text || '').split(/\s+/).filter(Boolean);
      const lines = [];
      let cur = '';
      for (const w of words) {
        const t = cur ? cur + ' ' + w : w;
        if (cur && ctx.measureText(t).width > maxW) {
          lines.push(cur);
          cur = w;
        } else {
          cur = t;
        }
      }
      if (cur) lines.push(cur);
      if (lines.length > maxLines) {
        const keep = lines.slice(0, maxLines);
        keep[maxLines - 1] = keep[maxLines - 1] + ' …';
        return keep;
      }
      return lines;
    }

    const panelLines = panelName ? wrap(panelName, 30, '600', 2) : [];
    const titleLines = wrap(s.title, 46, '700', 4);
    const speakerLines = wrap(s.speaker, 40, '600', 2);
    const promptFa = 'برای ثبت نظر دربارهٔ این ارائه، QR را اسکن کنید';
    const promptEn = 'Scan to rate this talk';

    const H =
      pad + 14 +
      panelLines.length * 42 + (panelLines.length ? 20 : 0) +
      titleLines.length * 64 + 14 +
      speakerLines.length * 56 + 30 +
      640 + 30 +
      52 + 44 + pad;

    canvas.width = W;
    canvas.height = H;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#0E2A3B';
    ctx.fillRect(0, 0, W, 14);
    ctx.fillStyle = '#C8922B';
    ctx.fillRect(0, 14, W, 5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    function line(text, px, weight, color, y) {
      ctx.font = font(px, weight);
      ctx.fillStyle = color;
      ctx.direction = /[\u0600-\u06FF]/.test(text) ? 'rtl' : 'ltr';
      ctx.fillText(text, W / 2, y);
    }

    let y = pad + 14;
    panelLines.forEach(t => {
      line(t, 30, '600', '#66767D', y + 21);
      y += 42;
    });
    if (panelLines.length) y += 20;
    titleLines.forEach(t => {
      line(t, 46, '700', '#0E2A3B', y + 32);
      y += 64;
    });
    y += 14;
    speakerLines.forEach(t => {
      line(t, 40, '600', '#182226', y + 28);
      y += 56;
    });
    y += 30;
    ctx.strokeStyle = '#DDD6C7';
    ctx.lineWidth = 3;
    ctx.strokeRect((W - 640) / 2 - 12, y - 12, 664, 664);
    ctx.drawImage(img, (W - 640) / 2, y, 640, 640);
    y += 640 + 30;
    line(promptFa, 34, '600', '#0E2A3B', y + 26);
    y += 52;
    line(promptEn, 28, '500', '#66767D', y + 22);

    return canvas.toDataURL('image/png');
  }

  // QR ساده برای اسلاید: فقط خود QR با حاشیهٔ سفید (نام سخنران و عنوان بعد از اسکن در فرم نمایش داده می‌شود)
  async function buildPlain(s) {
    const mod = await import('qrcode');
    const QR = mod.default || mod;
    return QR.toDataURL(linkFor(s.id), { width: 900, margin: 3, errorCorrectionLevel: 'M' });
  }

  async function toggleQr(s) {
    if (qr[s.id]) {
      setQr(q => {
        const n = { ...q };
        delete n[s.id];
        return n;
      });
      return;
    }
    try {
      const url = await buildPlain(s);
      setQr(q => ({ ...q, [s.id]: url }));
    } catch (e) {
      setMsg({ type: 'err', text: 'ساخت QR ناموفق بود. مطمئن شوید دستور npm install qrcode را اجرا کرده‌اید.' });
    }
  }

  async function downloadCard(s, panelName) {
    try {
      const url = await buildCard(s, panelName);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'QR-card-' + (s.speaker || 'session').replace(/[\\/:*?"<>|]/g, ' ').trim() + '.png';
      a.click();
    } catch (e) {
      setMsg({ type: 'err', text: 'ساخت کارت ناموفق بود.' });
    }
  }

  function downloadQr(s) {
    const a = document.createElement('a');
    a.href = qr[s.id];
    a.download = 'QR-' + (s.speaker || 'session').replace(/[\\/:*?"<>|]/g, ' ').trim() + '.png';
    a.click();
  }

  async function copyLink(s) {
    try {
      await navigator.clipboard.writeText(linkFor(s.id));
      setMsg({ type: 'ok', text: 'لینک کپی شد.' });
    } catch (e) {
      setMsg({ type: 'err', text: linkFor(s.id) });
    }
  }

  async function setOpen(ids, open) {
    if (!ids.length) return;
    const { error } = await supabase.from('survey_sessions').update({ is_open: open }).in('id', ids);
    if (error) setMsg({ type: 'err', text: 'تغییر وضعیت ناموفق بود: ' + error.message });
    await refresh();
  }

  async function clearVotes(s) {
    if (!window.confirm(`همهٔ آرای ثبت‌شده برای «${s.title}» پاک شود؟ این کار برگشت‌پذیر نیست.`)) return;
    const { error } = await supabase.from('survey_responses').delete().eq('session_id', s.id);
    setMsg(error ? { type: 'err', text: error.message } : { type: 'ok', text: 'آرای این سخنرانی پاک شد.' });
  }

  async function delSession(s) {
    if (!window.confirm(`سخنرانی «${s.title}» و همهٔ آرای آن حذف شود؟`)) return;
    const { error } = await supabase.from('survey_sessions').delete().eq('id', s.id);
    if (error) setMsg({ type: 'err', text: error.message });
    await refresh();
  }

  async function delPanel(p) {
    if (!window.confirm(`پنل «${p.name}» همراه با همهٔ سخنرانی‌ها و آرای آن حذف شود؟`)) return;
    const { error } = await supabase.from('survey_panels').delete().eq('id', p.id);
    if (error) setMsg({ type: 'err', text: error.message });
    await refresh();
  }

  if (access === 'checking') {
    return (
      <div className="ad">
        <style>{adminCss}</style>
        <div className="ad-state">در حال بررسی دسترسی…</div>
      </div>
    );
  }
  if (access !== 'admin') {
    return (
      <div className="ad">
        <style>{adminCss}</style>
        <div className="ad-state">
          <h2>دسترسی ندارید</h2>
          <p>این بخش فقط برای ادمین‌ها در دسترس است.</p>
        </div>
      </div>
    );
  }

  const orphanSessions = sessions.filter(s => !panels.some(p => p.id === s.panel_id));
  const groups = panels.map(p => ({ panel: p, items: sessions.filter(s => s.panel_id === p.id) }));
  if (orphanSessions.length) groups.push({ panel: { id: 'none', name: 'بدون پنل' }, items: orphanSessions });

  return (
    <div className="ad">
      <style>{adminCss}</style>
      <header className="ad-top">
        <h1>نظرسنجی حاضرین جلسات — ساختار کنگره و QR</h1>
        <p>{CONGRESS_TITLE}</p>
        <SurveyNav active="manage" />
      </header>

      <div className="ad-wrap">
        <section className="ad-panel">
          <h2>۱. افزودن یک سخنرانی و دریافت QR</h2>
          <p className="ad-note">
            نام پنل، نام سخنران و عنوان سخنرانی را در کادرهای جدا بنویسید. وقتی هر سه پر شد، دکمهٔ ثبت فعال می‌شود و بعد از ثبت، QR برای دانلود ظاهر می‌شود.
            نام پنل را می‌توانید از فهرست پنل‌های موجود انتخاب کنید یا پنل جدید بنویسید.
          </p>
          <div className="ad-form">
            <label>
              نام پنل *
              <input type="text" list="survey-panel-list" value={form.panel} onChange={e => setField('panel', e.target.value)} placeholder="مثلاً پنل زانو" />
              <datalist id="survey-panel-list">
                {panels.map(p => (
                  <option key={p.id} value={p.name} />
                ))}
              </datalist>
            </label>
            <label>
              نام سخنران *
              <input type="text" value={form.speaker} onChange={e => setField('speaker', e.target.value)} placeholder="مثلاً دکتر الف" />
            </label>
            <label>
              عنوان سخنرانی *
              <input type="text" value={form.title} onChange={e => setField('title', e.target.value)} placeholder="موضوع ارائه" />
            </label>
          </div>
          <details className="ad-note" style={{ marginTop: 10 }}>
            <summary style={{ cursor: 'pointer' }}>نام‌های انگلیسی برای PDF (اختیاری)</summary>
            <div className="ad-form" dir="ltr" style={{ marginTop: 8 }}>
              <label>
                Panel name
                <input type="text" value={form.panel_en} onChange={e => setField('panel_en', e.target.value)} />
              </label>
              <label>
                Speaker name
                <input type="text" value={form.speaker_en} onChange={e => setField('speaker_en', e.target.value)} />
              </label>
              <label>
                Talk title
                <input type="text" value={form.title_en} onChange={e => setField('title_en', e.target.value)} />
              </label>
            </div>
          </details>
          <div className="ad-row">
            <button className="ad-btn" disabled={!formReady || oneBusy} onClick={addOne}>
              {oneBusy ? 'در حال ثبت…' : 'ثبت و ساخت QR'}
            </button>
            {(form.speaker || form.title) && (
              <button className="ad-btn alt" onClick={newOne}>
                سخنرانی بعدی (همین پنل)
              </button>
            )}
          </div>
          <div className={'ad-qrbox' + (one ? ' on' : '')}>
            {one ? (
              <>
                <img src={one.url} alt="QR" />
                <div>
                  <b>{one.session.title}</b>
                  <div className="ad-note">{one.session.speaker}</div>
                  <div className="ad-row">
                    <button className="ad-btn" onClick={downloadOne}>
                      دانلود QR برای اسلاید
                    </button>
                    <button className="ad-btn alt" onClick={() => copyLink(one.session)}>
                      کپی لینک
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <span className="ad-note">محل نمایش QR — بعد از پر کردن هر سه کادر و زدن «ثبت و ساخت QR» فعال می‌شود.</span>
            )}
          </div>
          {oneMsg && <div className={'ad-msg ' + oneMsg.type}>{oneMsg.text}</div>}
        </section>

        <section className="ad-panel">
          <h2>۲. بارگذاری گروهی (از اکسل) — برای تعداد زیاد</h2>
          <p className="ad-note">
            هر سطر یک سخنرانی است با سه ستون به ترتیب: <b>نام پنل | نام سخنران | عنوان سخنرانی</b>.
            جدول را از اکسل کپی و اینجا Paste کنید، یا فایل CSV بدهید. ردیف عنوان ستون‌ها (که اولین خانه‌اش «پنل» است) اختیاری است.
            می‌توانید هر زمان دوباره بارگذاری کنید؛ موارد تکراری نادیده گرفته می‌شوند.
          </p>
          <p className="ad-note">
            برای گزارش PDF انگلیسی، سه ستون <b>اختیاری</b> دیگر هم اضافه کنید: <b>نام انگلیسی پنل | نام انگلیسی سخنران | عنوان انگلیسی سخنرانی</b>.
            اگر خالی بماند، گزارش همان نام فارسی را چاپ می‌کند. می‌توانید بعداً با بارگذاری دوبارهٔ همان سطرها، نام‌های انگلیسی را تکمیل یا اصلاح کنید.
          </p>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={'پنل زانو\tدکتر الف\tعنوان سخنرانی اول\tKnee Panel\tDr. Alef\tFirst talk title\nپنل ستون فقرات\tدکتر ج\tعنوان سخنرانی دوم\tSpine Panel\tDr. Jim\tSecond talk title'}
          />
          <div className="ad-row">
            <label className="ad-btn alt" style={{ cursor: 'pointer' }}>
              انتخاب فایل CSV
              <input type="file" accept=".csv,.tsv,.txt" onChange={onFile} style={{ display: 'none' }} />
            </label>
            <button className="ad-btn" disabled={busy || parsed.rows.length === 0} onClick={doImport}>
              {busy ? 'در حال ثبت…' : `ثبت ${parsed.rows.length} سخنرانی در سیستم`}
            </button>
            {text && (
              <button className="ad-btn alt" onClick={() => setText('')}>
                پاک کردن کادر
              </button>
            )}
          </div>

          {parsed.bad.length > 0 && (
            <div className="ad-msg err">
              {parsed.bad.length} سطر ناقص (کمتر از سه ستون) نادیده گرفته می‌شود:
              <br />
              {parsed.bad.slice(0, 5).join(' ⟵ ')}
            </div>
          )}

          {parsed.rows.length > 0 && (
            <div className="ad-scroll" style={{ marginTop: 12, maxHeight: 260, overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>پنل</th>
                    <th>سخنران</th>
                    <th>عنوان سخنرانی</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 50).map((r, i) => (
                    <tr key={i}>
                      <td>{r[0]}</td>
                      <td>{r[1]}</td>
                      <td>{r[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.rows.length > 50 && <p className="ad-note">پیش‌نمایش ۵۰ سطر اول؛ همهٔ سطرها ثبت می‌شوند.</p>}
            </div>
          )}

          {msg && <div className={'ad-msg ' + msg.type}>{msg.text}</div>}
        </section>

        <section className="ad-panel">
          <h2>۳. پنل‌ها، سخنرانی‌ها و QR</h2>
          <p className="ad-note">
            برای هر سخنرانی یک QR جداگانه ساخته می‌شود؛ سخنران فقط همین QR را در آخرین اسلاید می‌گذارد. بعد از اسکن، نام سخنران و عنوان سخنرانی بالای فرم نمایش داده می‌شود. (کارت دارای نام و عنوان هم اختیاری است.)
            «بستن رأی‌گیری» پس از پایان جلسه از ثبت رأی جدید جلوگیری می‌کند و جلوی رأی‌دادن دیرهنگام یا ساختگی را می‌گیرد.
          </p>
          <div className="ad-row" style={{ marginBottom: 12 }}>
            <button className="ad-btn alt sm" onClick={() => setOpen(sessions.map(s => s.id), true)}>
              باز کردن رأی‌گیری همه
            </button>
            <button className="ad-btn alt sm" onClick={() => setOpen(sessions.map(s => s.id), false)}>
              بستن رأی‌گیری همه
            </button>
          </div>

          {loadErr && <div className="ad-msg err">{loadErr}</div>}
          {!loadErr && sessions.length === 0 && <p className="ad-note">هنوز سخنرانی‌ای ثبت نشده است.</p>}

          {groups.map(g => (
            <div className="ad-pgroup" key={g.panel.id}>
              <header>
                <h3>
                  {g.panel.name} <span className="ad-badge">{g.items.length} سخنرانی</span>
                </h3>
                <div className="ad-row" style={{ margin: 0 }}>
                  <button className="ad-btn alt sm" onClick={() => setOpen(g.items.map(s => s.id), true)}>باز</button>
                  <button className="ad-btn alt sm" onClick={() => setOpen(g.items.map(s => s.id), false)}>بسته</button>
                  {g.panel.id !== 'none' && (
                    <button className="ad-btn danger sm" onClick={() => delPanel(g.panel)}>حذف پنل</button>
                  )}
                </div>
              </header>

              {g.items.map(s => (
                <div className="ad-srow" key={s.id}>
                  <div className="ad-sinfo">
                    <b>{s.title}</b>
                    <span>{s.speaker}</span>{' '}
                    <span className={'ad-badge ' + (s.is_open === false ? 'closed' : 'open')}>
                      {s.is_open === false ? 'رأی‌گیری بسته' : 'رأی‌گیری باز'}
                    </span>
                  </div>
                  <div className="ad-row" style={{ margin: 0 }}>
                    <button className="ad-btn sm" onClick={() => toggleQr(s)}>{qr[s.id] ? 'پنهان کردن QR' : 'QR'}</button>
                    <button className="ad-btn alt sm" onClick={() => copyLink(s)}>کپی لینک</button>
                    <button className="ad-btn alt sm" onClick={() => setOpen([s.id], s.is_open === false)}>
                      {s.is_open === false ? 'باز کردن' : 'بستن'}
                    </button>
                    <button className="ad-btn danger sm" onClick={() => clearVotes(s)}>پاک کردن آرا</button>
                    <button className="ad-btn danger sm" onClick={() => delSession(s)}>حذف</button>
                  </div>
                  {qr[s.id] && (
                    <div className="ad-qr">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qr[s.id]} alt={'QR ' + s.title} />
                      <div>
                        <button className="ad-btn sm" onClick={() => downloadQr(s)}>دانلود QR برای اسلاید</button>{' '}
                        <button className="ad-btn alt sm" onClick={() => downloadCard(s, g.panel.id === 'none' ? '' : g.panel.name)}>
                          کارت با نام و عنوان (اختیاری)
                        </button>
                        <code dir="ltr">{linkFor(s.id)}</code>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
