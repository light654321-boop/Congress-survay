'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSurveyAdmin } from '../../../../../../lib/useSurveyAdmin';
import { loadStructure, loadStats, fetchAllVotes, buildRanking, topSessions } from '../../../../../../lib/surveyData';
import {
  CRITERIA,
  MIN_VOTES,
  CONGRESS_TITLE_EN,
  en,
  enScore,
  enDateTime,
  enHourLabel,
  hourKey,
  pickEn,
} from '../../../../../../lib/surveyConfig';
import { adminCss } from '../../../../../../lib/surveyStyles';

// گزارش‌های PDF انگلیسی هستند. اگر نام انگلیسی ثبت نشده باشد، نام فارسی چاپ می‌شود (با جهت خودکار).
function T({ v }) {
  return <span dir="auto">{v}</span>;
}

const panelName = g => pickEn(g.name_en, g.name);
const sessTitle = s => pickEn(s.title_en, s.title);
const sessSpeaker = s => pickEn(s.speaker_en, s.speaker);

function hourlyRows(votes) {
  const m = {};
  for (const v of votes) {
    const k = hourKey(v.created_at);
    m[k] = (m[k] || 0) + 1;
  }
  return Object.keys(m)
    .sort()
    .map(k => ({ key: k, label: enHourLabel(k), count: m[k] }));
}

function Bar({ value }) {
  const pct = value === null || value === undefined ? 0 : Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <div style={{ height: 8, background: '#E4E4E4', minWidth: 80 }}>
      <div style={{ height: '100%', width: pct + '%', background: '#0E2A3B' }} />
    </div>
  );
}

function Hourly({ votes }) {
  const rows = hourlyRows(votes);
  if (rows.length === 0) return <p className="sub">No votes recorded.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Hour starting (Tehran time)</th>
          <th className="num">Votes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.key}>
            <td>{r.label}</td>
            <td className="num">{en(r.count)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CriteriaTable({ avgs, overall, dist }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Criterion</th>
          <th className="num">Mean (out of 5)</th>
          <th style={{ width: 130 }}></th>
          {dist && [1, 2, 3, 4, 5].map(n => <th className="num" key={n}>{en(n)}</th>)}
        </tr>
      </thead>
      <tbody>
        {CRITERIA.map(c => (
          <tr key={c.key}>
            <td>{c.labelEn}</td>
            <td className="num"><b>{enScore(avgs[c.key])}</b></td>
            <td><Bar value={avgs[c.key]} /></td>
            {dist && [1, 2, 3, 4, 5].map(n => <td className="num" key={n}>{en(dist[c.key][n])}</td>)}
          </tr>
        ))}
        <tr>
          <td><b>Overall score</b></td>
          <td className="num"><b>{enScore(overall)}</b></td>
          <td><Bar value={overall} /></td>
          {dist && <td colSpan={5}></td>}
        </tr>
      </tbody>
    </table>
  );
}

function StateBox({ children }) {
  return (
    <div className="ad" style={{ direction: 'ltr' }}>
      <style>{adminCss}</style>
      <div className="ad-state">{children}</div>
    </div>
  );
}

export default function SurveyReportPage() {
  const access = useSurveyAdmin();
  const params = useParams();
  const type = params && params.type;
  const id = params && params.id;

  const [state, setState] = useState({ status: 'loading', err: '' });
  const [model, setModel] = useState(null);

  useEffect(() => {
    if (access !== 'admin' || !type) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const [st, stats] = await Promise.all([loadStructure(), loadStats()]);
        const { groups, rankable } = buildRanking(st.panels, st.sessions, stats);
        let m = { type, groups, rankable, generatedAt: new Date().toISOString() };

        if (type === 'session') {
          let found = null;
          for (const g of groups) {
            const s = g.sessions.find(x => x.id === id);
            if (s) found = { session: s, group: g };
          }
          if (!found) throw new Error('Session not found.');
          const votes = await fetchAllVotes([id]);
          const dist = {};
          for (const c of CRITERIA) {
            dist[c.key] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
          }
          for (const v of votes) {
            for (const c of CRITERIA) {
              if (dist[c.key][v[c.key]] !== undefined) dist[c.key][v[c.key]] += 1;
            }
          }
          m = { ...m, ...found, votes, dist };
        } else if (type === 'panel') {
          const g = groups.find(x => x.id === id);
          if (!g) throw new Error('Panel not found.');
          const votes = await fetchAllVotes(g.sessions.map(s => s.id));
          m = { ...m, group: g, votes };
        } else if (type === 'final') {
          m = { ...m, top: topSessions(groups, 10) };
        } else {
          throw new Error('Invalid report type.');
        }
        if (!cancelled) {
          setModel(m);
          setState({ status: 'ready', err: '' });
        }
      } catch (e) {
        if (!cancelled) setState({ status: 'error', err: e.message || 'Unknown error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [access, type, id]);

  if (access === 'checking') return <StateBox>Checking access…</StateBox>;
  if (access !== 'admin') {
    return (
      <StateBox>
        <h2>Access denied</h2>
        <p>This report is available to administrators only.</p>
      </StateBox>
    );
  }

  const actions = (
    <div className="rp-actions en no-print">
      <button className="ad-btn" onClick={() => window.print()}>Save as PDF / Print</button>
      <Link className="ad-btn alt" href="/admin/survey/results">Back to results</Link>
    </div>
  );

  if (state.status === 'loading') return <StateBox>Building report…</StateBox>;
  if (state.status === 'error') {
    return (
      <div className="ad" style={{ direction: 'ltr' }}>
        <style>{adminCss}</style>
        {actions}
        <div className="ad-state">Error: {state.err}</div>
      </div>
    );
  }

  const m = model;
  const generated = enDateTime(m.generatedAt);

  // ---------------- Single session report ----------------
  if (m.type === 'session') {
    const s = m.session;
    const comments = m.votes.filter(v => v.suggestion && v.suggestion.trim());
    return (
      <div className="ad" style={{ direction: 'ltr' }}>
        <style>{adminCss}</style>
        {actions}
        <div className="rp en">
          <p className="sub">{CONGRESS_TITLE_EN} — Audience Feedback Report</p>
          <h1><T v={sessTitle(s)} /></h1>
          <p className="sub">
            Speaker: <b><T v={sessSpeaker(s)} /></b> — Panel: <b><T v={panelName(m.group)} /></b>
            {s.rankInPanel ? ` — Rank within panel: ${en(s.rankInPanel)} of ${en(m.group.qualifiedCount)}` : ''}
          </p>
          <p className="sub">Report generated: {generated}</p>

          <div className="kpis">
            <div className="kpi"><b>{en(s.stats.votes)}</b><span>Voters</span></div>
            <div className="kpi"><b>{enScore(s.stats.overall)}</b><span>Overall score (of 5)</span></div>
            <div className="kpi"><b style={{ fontSize: 14 }}>{enDateTime(s.stats.firstVote)}</b><span>First vote</span></div>
            <div className="kpi"><b style={{ fontSize: 14 }}>{enDateTime(s.stats.lastVote)}</b><span>Last vote</span></div>
          </div>
          {s.stats.votes < MIN_VOTES && (
            <p className="sub">
              Note: this session has fewer than the minimum of {en(MIN_VOTES)} votes required for ranking, so it is not counted in the panel competition.
            </p>
          )}

          <h2>Score by criterion and vote distribution</h2>
          <CriteriaTable avgs={s.stats.avgs} overall={s.stats.overall} dist={m.dist} />
          <p className="sub">Columns 1–5 show how many voters gave each score.</p>

          <h2>When votes were cast</h2>
          <Hourly votes={m.votes} />

          <h2>Written comments ({en(comments.length)})</h2>
          {comments.length === 0 && <p className="sub">No written comments.</p>}
          {comments.map(v => (
            <div className="cmt" key={v.id}>
              <T v={v.suggestion} />
              <small>{enDateTime(v.created_at)}</small>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------------- Panel report ----------------
  if (m.type === 'panel') {
    const g = m.group;
    return (
      <div className="ad" style={{ direction: 'ltr' }}>
        <style>{adminCss}</style>
        {actions}
        <div className="rp en">
          <p className="sub">{CONGRESS_TITLE_EN} — Audience Feedback Report</p>
          <h1><T v={panelName(g)} /></h1>
          <p className="sub">
            {g.rank
              ? `Rank in the panel competition: ${en(g.rank)} of ${en(m.rankable.length)}`
              : 'Not yet ranked (not enough votes)'}
          </p>
          <p className="sub">Report generated: {generated}</p>

          <div className="kpis">
            <div className="kpi"><b>{en(g.totalVotes)}</b><span>Total votes</span></div>
            <div className="kpi"><b>{enScore(g.overall)}</b><span>Panel score (of 5)</span></div>
            <div className="kpi"><b>{en(g.sessions.length)}</b><span>Sessions</span></div>
            <div className="kpi"><b style={{ fontSize: 14 }}>{enDateTime(g.firstVote)}</b><span>First vote</span></div>
            <div className="kpi"><b style={{ fontSize: 14 }}>{enDateTime(g.lastVote)}</b><span>Last vote</span></div>
          </div>
          <p className="sub">
            Panel score = mean of the session scores, counting only sessions with at least {en(MIN_VOTES)} votes ({en(g.qualifiedCount)} of {en(g.sessions.length)} sessions), each session weighted equally.
          </p>

          <h2>Criterion scores at panel level</h2>
          <CriteriaTable avgs={g.avgs} overall={g.overall} />

          <h2>Sessions in this panel</h2>
          <table>
            <thead>
              <tr>
                <th className="num">Rank</th>
                <th>Speaker</th>
                <th>Title</th>
                <th className="num">Votes</th>
                {CRITERIA.map(c => <th className="num" key={c.key}>{c.labelEn}</th>)}
                <th className="num">Overall</th>
              </tr>
            </thead>
            <tbody>
              {g.sessions.map(s => (
                <tr key={s.id}>
                  <td className="num">{s.rankInPanel ? en(s.rankInPanel) : '-'}</td>
                  <td><T v={sessSpeaker(s)} /></td>
                  <td><T v={sessTitle(s)} /></td>
                  <td className="num">{en(s.stats.votes)}</td>
                  {CRITERIA.map(c => <td className="num" key={c.key}>{enScore(s.stats.avgs[c.key])}</td>)}
                  <td className="num"><b>{enScore(s.stats.overall)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>When votes were cast in this panel</h2>
          <Hourly votes={m.votes} />
        </div>
      </div>
    );
  }

  // ---------------- Final congress report ----------------
  const totalVotes = m.groups.reduce((a, g) => a + g.totalVotes, 0);
  return (
    <div className="ad" style={{ direction: 'ltr' }}>
      <style>{adminCss}</style>
      {actions}
      <div className="rp en">
        <p className="sub">{CONGRESS_TITLE_EN}</p>
        <h1>Final Report: Audience Feedback on Scientific Sessions</h1>
        <p className="sub">Report generated: {generated}</p>

        <div className="kpis">
          <div className="kpi"><b>{en(totalVotes)}</b><span>Total votes</span></div>
          <div className="kpi"><b>{en(m.groups.length)}</b><span>Panels</span></div>
          <div className="kpi"><b>{en(m.groups.reduce((a, g) => a + g.sessions.length, 0))}</b><span>Sessions</span></div>
        </div>

        <h2>Panel ranking</h2>
        <table>
          <thead>
            <tr>
              <th className="num">Rank</th>
              <th>Panel</th>
              <th className="num">Votes</th>
              {CRITERIA.map(c => <th className="num" key={c.key}>{c.labelEn}</th>)}
              <th className="num">Overall</th>
            </tr>
          </thead>
          <tbody>
            {m.rankable.map(g => (
              <tr key={g.id}>
                <td className="num"><b>{en(g.rank)}</b></td>
                <td><T v={panelName(g)} /></td>
                <td className="num">{en(g.totalVotes)}</td>
                {CRITERIA.map(c => <td className="num" key={c.key}>{enScore(g.avgs[c.key])}</td>)}
                <td className="num"><b>{enScore(g.overall)}</b></td>
              </tr>
            ))}
            {m.rankable.length === 0 && (
              <tr><td colSpan={CRITERIA.length + 4}>No panel has reached the minimum number of votes yet.</td></tr>
            )}
          </tbody>
        </table>
        <p className="sub">
          Each panel score is the mean of its session scores (each session weighted equally), counting only sessions with at least {en(MIN_VOTES)} votes.
        </p>

        <h2>Top sessions</h2>
        <table>
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Speaker</th>
              <th>Title</th>
              <th>Panel</th>
              <th className="num">Votes</th>
              <th className="num">Overall</th>
            </tr>
          </thead>
          <tbody>
            {m.top.map((s, i) => (
              <tr key={s.id}>
                <td className="num">{en(i + 1)}</td>
                <td><T v={sessSpeaker(s)} /></td>
                <td><T v={sessTitle(s)} /></td>
                <td><T v={pickEn(s.panelNameEn, s.panelName)} /></td>
                <td className="num">{en(s.stats.votes)}</td>
                <td className="num"><b>{enScore(s.stats.overall)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
