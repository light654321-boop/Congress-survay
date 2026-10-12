'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSurveyAdmin } from '../../../../lib/useSurveyAdmin';
import { loadStructure, loadStats, buildRanking, topSessions, fetchAllVotes } from '../../../../lib/surveyData';
import { downloadCsv } from '../../../../lib/surveyCsv';
import { CRITERIA, MIN_VOTES, CONGRESS_TITLE, fa, faScore, fmtDateTime } from '../../../../lib/surveyConfig';
import { adminCss } from '../../../../lib/surveyStyles';
import SurveyNav from '../../../../lib/SurveyNav';

const REFRESH_MS = 15000;

function Medal({ rank }) {
  if (!rank) return <span className="ad-medal">—</span>;
  const cls = rank <= 3 ? ' r' + rank : '';
  return <span className={'ad-medal' + cls}>{fa(rank)}</span>;
}

export default function SurveyResultsPage() {
  const access = useSurveyAdmin();
  const [data, setData] = useState(null); // { groups, rankable, top, totalVotes, sessionCount }
  const [err, setErr] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [st, stats] = await Promise.all([loadStructure(), loadStats()]);
      const { groups, rankable } = buildRanking(st.panels, st.sessions, stats);
      const totalVotes = Object.values(stats).reduce((a, x) => a + x.votes, 0);
      setData({
        groups,
        rankable,
        top: topSessions(groups, 10),
        totalVotes,
        sessionCount: st.sessions.length,
        panelCount: st.panels.length,
      });
      setUpdatedAt(new Date().toISOString());
      setErr('');
    } catch (e) {
      setErr('دریافت نتایج ناموفق بود: ' + (e.message || 'خطای نامشخص'));
    }
  }, []);

  useEffect(() => {
    if (access !== 'admin') return undefined;
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [access, load]);

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

  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

  function exportSummary() {
    const rows = [
      ['Panel', 'Panel rank', 'Speaker', 'Title', 'Votes', ...CRITERIA.map(c => c.labelEn || c.key), 'Overall', 'First vote', 'Last vote'],
    ];
    for (const g of data.groups) {
      for (const x of g.sessions) {
        rows.push([
          g.name,
          g.rank || '',
          x.speaker,
          x.title,
          x.stats.votes,
          ...CRITERIA.map(c => (x.stats.avgs[c.key] === null || x.stats.avgs[c.key] === undefined ? '' : x.stats.avgs[c.key].toFixed(2))),
          x.stats.overall === null || x.stats.overall === undefined ? '' : x.stats.overall.toFixed(2),
          x.stats.firstVote || '',
          x.stats.lastVote || '',
        ]);
      }
    }
    downloadCsv('survey-summary-' + stamp() + '.csv', rows);
  }

  async function exportVotes() {
    setExporting(true);
    try {
      const info = {};
      data.groups.forEach(g => g.sessions.forEach(x => (info[x.id] = { panel: g.name, speaker: x.speaker, title: x.title })));
      const votes = await fetchAllVotes(Object.keys(info));
      const rows = [['Time', 'Panel', 'Speaker', 'Title', ...CRITERIA.map(c => c.labelEn || c.key), 'Comment']];
      votes.forEach(v => {
        const i = info[v.session_id] || {};
        rows.push([v.created_at, i.panel, i.speaker, i.title, ...CRITERIA.map(c => v[c.key]), v.suggestion || '']);
      });
      downloadCsv('survey-all-votes-' + stamp() + '.csv', rows);
    } catch (e) {
      setErr('خروجی ناموفق بود: ' + (e.message || ''));
    }
    setExporting(false);
  }

  const unranked = data ? data.groups.filter(g => g.rank === null) : [];

  return (
    <div className="ad">
      <style>{adminCss}</style>
      <header className="ad-top">
        <h1>نتایج نظرسنجی حاضرین و رقابت پنل‌ها</h1>
        <p>
          {CONGRESS_TITLE} — به‌روزرسانی خودکار هر {fa(REFRESH_MS / 1000)} ثانیه
          {updatedAt ? ' — آخرین دریافت: ' + fmtDateTime(updatedAt) : ''}
        </p>
        <SurveyNav active="results" />
      </header>

      <div className="ad-wrap">
        {err && <div className="ad-msg err">{err}</div>}
        {!data && !err && <div className="ad-state">در حال دریافت نتایج…</div>}

        {data && (
          <>
            <section className="ad-panel">
              <div className="ad-row" style={{ marginTop: 0, justifyContent: 'space-between' }}>
                <div>
                  <b>{fa(data.totalVotes)}</b> رأی ثبت‌شده در <b>{fa(data.sessionCount)}</b> سخنرانی و <b>{fa(data.panelCount)}</b> پنل
                </div>
                <div className="ad-row" style={{ margin: 0 }}>
                  <Link className="ad-btn" href="/admin/survey/report/final/all" target="_blank">
                    گزارش نهایی کنگره (PDF)
                  </Link>
                  <button className="ad-btn alt" onClick={exportSummary}>
                    خروجی Excel: خلاصه سخنرانی‌ها
                  </button>
                  <button className="ad-btn alt" disabled={exporting} onClick={exportVotes}>
                    {exporting ? 'در حال آماده‌سازی…' : 'خروجی Excel: همهٔ آرا'}
                  </button>
                </div>
              </div>
              <p className="ad-note">
                روش محاسبه: امتیاز هر سخنرانی میانگین وزنی شاخص‌هاست (وزن‌ها در فایل lib/surveyConfig.js). امتیاز هر پنل میانگین امتیاز
                سخنرانی‌های آن پنل است، با وزن برابر برای هر سخنرانی، تا پنلی که سخنرانی بیشتر یا رأی بیشتر دارد برتری ساختگی نگیرد.
                فقط سخنرانی‌هایی که دست‌کم {fa(MIN_VOTES)} رأی دارند در رتبه‌بندی حساب می‌شوند.
              </p>
            </section>

            <section className="ad-panel">
              <h2>رتبه‌بندی پنل‌ها</h2>
              <div className="ad-scroll">
                <table>
                  <thead>
                    <tr>
                      <th className="num">رتبه</th>
                      <th>پنل</th>
                      <th className="num">سخنرانی‌های حسابی</th>
                      <th className="num">مجموع آرا</th>
                      {CRITERIA.map(c => (
                        <th className="num" key={c.key}>{c.label}</th>
                      ))}
                      <th className="num">امتیاز کل</th>
                      <th className="num">گزارش</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rankable.map(g => (
                      <tr key={g.id}>
                        <td className="num"><Medal rank={g.rank} /></td>
                        <td><b>{g.name}</b></td>
                        <td className="num">{fa(g.qualifiedCount)} از {fa(g.sessions.length)}</td>
                        <td className="num">{fa(g.totalVotes)}</td>
                        {CRITERIA.map(c => (
                          <td className="num" key={c.key}>{faScore(g.avgs[c.key])}</td>
                        ))}
                        <td className="num"><b>{faScore(g.overall)}</b></td>
                        <td className="num">
                          <Link href={'/admin/survey/report/panel/' + g.id} target="_blank">PDF</Link>
                        </td>
                      </tr>
                    ))}
                    {data.rankable.length === 0 && (
                      <tr>
                        <td colSpan={CRITERIA.length + 5} className="ad-note">
                          هنوز هیچ پنلی به حداقل رأی لازم نرسیده است.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {unranked.length > 0 && (
                <p className="ad-note">
                  در انتظار رأی کافی (کمتر از {fa(MIN_VOTES)} رأی در همهٔ سخنرانی‌ها):{' '}
                  {unranked.map(g => `${g.name} (${fa(g.totalVotes)} رأی)`).join('، ')}
                </p>
              )}
            </section>

            <section className="ad-panel">
              <h2>برترین سخنرانی‌ها از نظر حاضرین</h2>
              <div className="ad-scroll">
                <table>
                  <thead>
                    <tr>
                      <th className="num">#</th>
                      <th>سخنران</th>
                      <th>عنوان</th>
                      <th>پنل</th>
                      <th className="num">آرا</th>
                      <th className="num">امتیاز کل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top.map((s, i) => (
                      <tr key={s.id}>
                        <td className="num"><Medal rank={i + 1} /></td>
                        <td>{s.speaker}</td>
                        <td>{s.title}</td>
                        <td>{s.panelName}</td>
                        <td className="num">{fa(s.stats.votes)}</td>
                        <td className="num"><b>{faScore(s.stats.overall)}</b></td>
                      </tr>
                    ))}
                    {data.top.length === 0 && (
                      <tr><td colSpan={6} className="ad-note">هنوز سخنرانی‌ای به حداقل رأی لازم نرسیده است.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="ad-panel">
              <h2>جزئیات هر پنل و سخنرانی</h2>
              {data.groups.map(g => (
                <div className="ad-pgroup" key={g.id}>
                  <header>
                    <h3>
                      {g.name} {g.rank ? <span className="ad-badge">رتبه {fa(g.rank)}</span> : null}
                    </h3>
                    {g.id !== 'none' && (
                      <Link className="ad-btn alt sm" href={'/admin/survey/report/panel/' + g.id} target="_blank">
                        PDF پنل
                      </Link>
                    )}
                  </header>
                  <div className="ad-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>سخنران / عنوان</th>
                          <th className="num">آرا</th>
                          {CRITERIA.map(c => (
                            <th className="num" key={c.key}>{c.label}</th>
                          ))}
                          <th className="num">امتیاز کل</th>
                          <th className="num">اولین رأی</th>
                          <th className="num">آخرین رأی</th>
                          <th className="num">گزارش</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.sessions.map(s => (
                          <tr key={s.id}>
                            <td>
                              <b>{s.speaker}</b>
                              <br />
                              <span style={{ color: '#66767D', fontSize: 12 }}>{s.title}</span>
                            </td>
                            <td className="num">
                              {fa(s.stats.votes)}
                              {s.is_open === false ? ' (بسته)' : ''}
                            </td>
                            {CRITERIA.map(c => (
                              <td className="num" key={c.key}>{faScore(s.stats.avgs[c.key])}</td>
                            ))}
                            <td className="num"><b>{faScore(s.stats.overall)}</b></td>
                            <td className="num">{fmtDateTime(s.stats.firstVote)}</td>
                            <td className="num">{fmtDateTime(s.stats.lastVote)}</td>
                            <td className="num">
                              <Link href={'/admin/survey/report/session/' + s.id} target="_blank">PDF</Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
