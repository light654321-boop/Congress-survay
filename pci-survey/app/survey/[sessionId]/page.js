'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';

const QUESTIONS = [
  { key: 'quality', text: '۱. کیفیت علمی محتوای ارائه‌شده چگونه بود؟', lo: 'ضعیف', hi: 'عالی' },
  { key: 'applicability', text: '۲. مطالب تا چه حد در عمل بالینی روزمره قابل استفاده است؟', lo: 'کم‌کاربرد', hi: 'پرکاربرد' },
  { key: 'presentation', text: '۳. کیفیت ارائه و اسلایدها را چطور ارزیابی می‌کنید؟', lo: 'ضعیف', hi: 'عالی' },
  { key: 'timing', text: '۴. مدیریت زمان ارائه چگونه بود؟', lo: 'ضعیف', hi: 'عالی' },
];

// شناسهٔ ناشناس دستگاه برای جلوگیری از ثبت رأی تکراری (فقط روی همین مرورگر ذخیره می‌شود)
function getDeviceId() {
  try {
    let id = localStorage.getItem('survey_device_id');
    if (!id || id.length < 8) {
      id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : 'd' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('survey_device_id', id);
    }
    return id;
  } catch (e) {
    return 'd' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

// ارقام فارسی/عربی را لاتین می‌کند تا کد با هر کیبوردی درست تطبیق کند
function toLatinDigits(str) {
  return String(str || '')
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660));
}

// اختلاف ساعت سرور با ساعت گوشی؛ اگر در دسترس نبود صفر
async function getSkew() {
  try {
    const t0 = Date.now();
    const { data, error } = await supabase.rpc('survey_server_now');
    if (error || !data) return 0;
    const t1 = Date.now();
    return new Date(data).getTime() - (t0 + t1) / 2;
  } catch (e) {
    return 0;
  }
}

// وضعیت ارائه: form | closed | notyet
function stateOf(sess, skew) {
  if (sess.is_open === false) return 'closed';
  const now = Date.now() + (skew || 0);
  if (sess.opens_at && now < new Date(sess.opens_at).getTime()) return 'notyet';
  if (sess.closes_at && now >= new Date(sess.closes_at).getTime()) return 'closed';
  return 'form';
}

const css = `
.sv{--navy:#0E2A3B;--gold:#C8922B;--paper:#F7F4EE;--ink:#182226;--muted:#66767D;--line:#DDD6C7;--ok:#2E6E52;
  min-height:100vh;background:var(--paper);color:var(--ink);font-family:inherit;direction:rtl}
.sv *{box-sizing:border-box}
.sv-wrap{max-width:520px;margin:0 auto;padding-bottom:60px}
.sv-top{background:var(--navy);color:#fff;padding:26px 20px 22px;border-bottom:3px solid var(--gold)}
.sv-eyebrow{font-size:13px;color:#E8B85A;font-weight:600;margin:0 0 6px}
.sv-top h1{font-size:20px;line-height:1.6;margin:0;font-weight:700}
.sv-speaker{font-size:17px;color:#F0D9A4;margin-top:8px;font-weight:600}
.sv-main{padding:22px 18px 0}
.sv-intro{font-size:14px;color:var(--muted);line-height:1.9;margin:0 0 20px}
.sv-q{background:#fff;border:1px solid var(--line);border-radius:4px;padding:16px;margin-bottom:14px}
.sv-q h3{font-size:15px;font-weight:600;margin:0 0 14px;line-height:1.8}
.sv-scale{display:flex;justify-content:space-between;gap:6px}
.sv-dot{flex:1;display:flex;justify-content:center}
.sv-dot button{width:40px;height:40px;border-radius:50%;border:2px solid var(--line);background:#fff;
  font-family:inherit;font-weight:700;font-size:14px;color:var(--muted);cursor:pointer}
.sv-dot button.on{background:var(--navy);border-color:var(--navy);color:#fff}
.sv-legend{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:10px}
.sv textarea{width:100%;border:1px solid var(--line);border-radius:4px;padding:12px;font-family:inherit;
  font-size:14px;min-height:90px;resize:vertical;background:#fff}
.sv-submit{width:100%;background:var(--navy);color:#fff;border:none;border-radius:4px;padding:16px;
  font-family:inherit;font-size:16px;font-weight:700;cursor:pointer}
.sv-submit:disabled{opacity:.5;cursor:default}
.sv-state{text-align:center;padding:70px 24px}
.sv-state h2{font-size:19px;margin:0 0 10px}
.sv-state p{color:var(--muted);font-size:14px;line-height:1.9;margin:0}
.sv-check{width:60px;height:60px;border-radius:50%;background:var(--ok);color:#fff;display:flex;
  align-items:center;justify-content:center;font-size:30px;margin:0 auto 18px}
.sv-err{color:#B3402C;font-size:13px;margin-top:10px;text-align:center}
.sv-code{width:100%;border:1px solid var(--line);border-radius:4px;padding:12px;font-family:inherit;font-size:20px;text-align:center;letter-spacing:6px;direction:ltr;background:#fff}
.sv-retry{margin-top:16px;background:none;border:1px solid var(--navy);color:var(--navy);border-radius:4px;
  padding:10px 20px;font-family:inherit;font-size:14px;cursor:pointer}
`;

export default function SurveyPage() {
  const params = useParams();
  const sessionId = params?.sessionId;

  // loading | slow | form | notfound | done
  const [status, setStatus] = useState('loading');
  const [session, setSession] = useState(null);
  const [answers, setAnswers] = useState({});
  const [suggestion, setSuggestion] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [code, setCode] = useState('');
  const [skew, setSkew] = useState(0); // اختلاف ساعت سرور و گوشی (میلی‌ثانیه)

  useEffect(() => {
    if (!sessionId) return;

    let doneBefore = false;
    try {
      doneBefore = localStorage.getItem('survey_done_' + sessionId) === '1';
    } catch (e) {}
    if (doneBefore) {
      setStatus('done');
      return;
    }

    setStatus('loading');
    // اگر اتصال بعد از ۱۲ ثانیه جواب نداد، به‌جای «در حال بارگذاری» بی‌پایان پیام و دکمه تلاش مجدد نشان بده
    const slowTimer = setTimeout(() => {
      setStatus(prev => (prev === 'loading' ? 'slow' : prev));
    }, 12000);

    let cancelled = false;
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from('survey_sessions')
          .select('title, speaker, is_open, opens_at, closes_at, requires_code')
          .eq('id', sessionId)
          .maybeSingle();
        clearTimeout(slowTimer);
        if (cancelled) return;
        if (err || !data) {
          setStatus('notfound');
          return;
        }
        const sk = await getSkew();
        setSkew(sk);
        setSession(data);
        setStatus(stateOf(data, sk));
      } catch (e3) {
        clearTimeout(slowTimer);
        if (!cancelled) setStatus('slow');
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
    };
  }, [sessionId, attempt]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    for (const q of QUESTIONS) {
      if (!answers[q.key]) {
        setError('لطفاً به همه سؤال‌های امتیازی پاسخ دهید.');
        return;
      }
    }
    if (session && session.requires_code && !code.trim()) {
      setError('کد نمایش‌داده‌شده روی اسلاید را وارد کنید.');
      return;
    }
    setSending(true);
    const { error: err } = await supabase.from('survey_responses').insert({
      session_id: sessionId,
      quality: answers.quality,
      applicability: answers.applicability,
      presentation: answers.presentation,
      timing: answers.timing,
      suggestion: suggestion.trim().slice(0, 400) || null,
      device_id: getDeviceId(),
      access_code: session && session.requires_code ? toLatinDigits(code.trim()) : null,
    });
    setSending(false);
    if (err) {
      if (err.code === '23505') {
        // قبلاً از همین دستگاه رأی ثبت شده است
        try {
          localStorage.setItem('survey_done_' + sessionId, '1');
        } catch (e4) {}
        setStatus('done');
        return;
      }
      if (err.code === '42501') {
        // بسته شده، هنوز باز نشده، یا کد نادرست؟ وضعیت را دوباره از سرور بپرس
        try {
          const { data } = await supabase
            .from('survey_sessions')
            .select('title, speaker, is_open, opens_at, closes_at, requires_code')
            .eq('id', sessionId)
            .maybeSingle();
          if (data) {
            const sk = await getSkew();
            const st = stateOf(data, sk);
            if (st !== 'form') {
              setSession(data);
              setStatus(st);
              return;
            }
          }
        } catch (e5) {}
        setError('کد واردشده نادرست است. کد را از روی اسلاید دوباره بخوانید.');
        return;
      }
      setError('ارسال با خطا مواجه شد. لطفاً دوباره تلاش کنید.');
      return;
    }
    try {
      localStorage.setItem('survey_done_' + sessionId, '1');
    } catch (e2) {}
    setStatus('done');
  }

  return (
    <div className="sv">
      <style>{css}</style>
      <div className="sv-wrap">
        <header className="sv-top">
          <p className="sv-eyebrow">نظرسنجی کیفیت ارائه</p>
          <h1>{session ? session.title : 'در حال بارگذاری…'}</h1>
          {session && session.speaker ? (
            <div className="sv-speaker">سخنران: {session.speaker}</div>
          ) : null}
        </header>

        <main className="sv-main">
          {(status === 'loading') && (
            <div className="sv-state"><p>در حال بارگذاری اطلاعات ارائه…</p></div>
          )}

          {status === 'slow' && (
            <div className="sv-state">
              <h2>اتصال برقرار نشد</h2>
              <p>اینترنت خود را بررسی کنید و دوباره تلاش کنید.</p>
              <button className="sv-retry" onClick={() => setAttempt(a => a + 1)}>تلاش مجدد</button>
            </div>
          )}

          {status === 'notfound' && (
            <div className="sv-state">
              <h2>ارائه پیدا نشد</h2>
              <p>کد QR اسکن‌شده معتبر نیست یا این نظرسنجی فعال نشده است.</p>
            </div>
          )}

          {status === 'closed' && (
            <div className="sv-state">
              <h2>نظرسنجی این ارائه بسته شده است</h2>
              <p>مهلت ثبت نظر برای این ارائه به پایان رسیده است.</p>
            </div>
          )}

          {status === 'notyet' && (
            <div className="sv-state">
              <h2>رأی‌گیری هنوز شروع نشده است</h2>
              <p>
                {session && session.opens_at
                  ? 'شروع نظرسنجی این ارائه: ' +
                    new Date(session.opens_at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) +
                    '. پس از آن همین صفحه را دوباره باز کنید.'
                  : 'کمی بعد دوباره تلاش کنید.'}
              </p>
              <button className="sv-retry" onClick={() => setAttempt(a => a + 1)}>بررسی دوباره</button>
            </div>
          )}

          {status === 'done' && (
            <div className="sv-state">
              <div className="sv-check">✓</div>
              <h2>نظر شما ثبت شد</h2>
              <p>از وقتی که گذاشتید سپاسگزاریم.</p>
            </div>
          )}

          {status === 'form' && (
            <form onSubmit={handleSubmit}>
              <p className="sv-intro">
                نظر شما درباره این ارائه، بدون ثبت‌نام و بدون ذخیره اطلاعات شخصی، به بهبود کیفیت علمی کنگره کمک می‌کند. تکمیل آن کمتر از یک دقیقه طول می‌کشد.
              </p>

              {QUESTIONS.map(q => (
                <div className="sv-q" key={q.key}>
                  <h3>{q.text}</h3>
                  <div className="sv-scale">
                    {[1, 2, 3, 4, 5].map(n => (
                      <div className="sv-dot" key={n}>
                        <button
                          type="button"
                          className={answers[q.key] === n ? 'on' : ''}
                          aria-label={`${q.text} امتیاز ${n}`}
                          onClick={() => setAnswers(a => ({ ...a, [q.key]: n }))}
                        >
                          {n}
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="sv-legend"><span>{q.lo}</span><span>{q.hi}</span></div>
                </div>
              ))}

              {session && session.requires_code && (
                <div className="sv-q">
                  <h3>کد ارائه (روی اسلاید نوشته شده است)</h3>
                  <input
                    className="sv-code"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={12}
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    placeholder="مثلاً ۴۸۲۱"
                  />
                </div>
              )}

              <div className="sv-q">
                <h3>۵. نظر یا پیشنهاد شما برای بهبود این ارائه (اختیاری)</h3>
                <textarea
                  maxLength={400}
                  value={suggestion}
                  onChange={e => setSuggestion(e.target.value)}
                  placeholder="در صورت تمایل بنویسید…"
                />
              </div>

              <button className="sv-submit" type="submit" disabled={sending}>
                {sending ? 'در حال ارسال…' : 'ثبت نظر'}
              </button>
              {error ? <p className="sv-err">{error}</p> : null}
            </form>
          )}
        </main>
      </div>
    </div>
  );
}
