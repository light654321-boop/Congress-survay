import { supabase } from './supabaseClient';
import { CRITERIA, MIN_VOTES, overallFrom } from './surveyConfig';

// ساختار کنگره: پنل‌ها و سخنرانی‌ها (فقط ادمین پنل‌ها را می‌تواند بخواند)
export async function loadStructure() {
  const [p, s] = await Promise.all([
    supabase.from('survey_panels').select('*').order('sort_order').order('created_at'),
    supabase.from('survey_sessions').select('*').order('sort_order').order('created_at'),
  ]);
  if (p.error) throw p.error;
  if (s.error) throw s.error;
  return { panels: p.data || [], sessions: s.data || [] };
}

// آمار تجمیعی هر سخنرانی (از تابع امن دیتابیس) به‌صورت { [sessionId]: {...} }
export async function loadStats() {
  const { data, error } = await supabase.rpc('survey_session_stats');
  if (error) throw error;
  const map = {};
  for (const r of data || []) {
    const avgs = {};
    for (const c of CRITERIA) {
      const v = r['avg_' + c.key];
      avgs[c.key] = v === null || v === undefined ? null : Number(v);
    }
    map[r.session_id] = {
      votes: Number(r.votes) || 0,
      avgs,
      overall: overallFrom(avgs),
      firstVote: r.first_vote,
      lastVote: r.last_vote,
    };
  }
  return map;
}

// همهٔ آرای یک یا چند سخنرانی (صفحه‌به‌صفحه، چون هر درخواست حداکثر ۱۰۰۰ ردیف برمی‌گرداند)
export async function fetchAllVotes(sessionIds) {
  const out = [];
  if (!sessionIds || sessionIds.length === 0) return out;
  const PAGE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('survey_responses')
      .select('id, session_id, quality, applicability, presentation, timing, suggestion, created_at')
      .in('session_id', sessionIds)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

const NO_PANEL_ID = 'none';

// رتبه‌بندی پنل‌ها.
// امتیاز هر پنل = میانگین امتیاز سخنرانی‌های آن پنل (هر سخنرانی وزن برابر)،
// فقط سخنرانی‌هایی که حداقل MIN_VOTES رأی دارند حساب می‌شوند.
export function buildRanking(panels, sessions, statsMap) {
  const groups = panels.map(p => ({ id: p.id, name: p.name, name_en: p.name_en || null, sort_order: p.sort_order, sessions: [] }));
  const byId = {};
  groups.forEach(g => { byId[g.id] = g; });
  const orphan = { id: NO_PANEL_ID, name: 'بدون پنل', name_en: 'No panel', sort_order: 1e9, sessions: [] };

  for (const s of sessions) {
    const st = statsMap[s.id] || { votes: 0, avgs: {}, overall: null, firstVote: null, lastVote: null };
    const item = { ...s, stats: st, qualified: st.votes >= MIN_VOTES && st.overall !== null };
    (byId[s.panel_id] || orphan).sessions.push(item);
  }
  if (orphan.sessions.length > 0) groups.push(orphan);

  for (const g of groups) {
    g.totalVotes = g.sessions.reduce((a, x) => a + x.stats.votes, 0);
    const q = g.sessions.filter(x => x.qualified);
    g.qualifiedCount = q.length;
    g.avgs = {};
    for (const c of CRITERIA) {
      g.avgs[c.key] = q.length ? q.reduce((a, x) => a + x.stats.avgs[c.key], 0) / q.length : null;
    }
    g.overall = q.length ? overallFrom(g.avgs) : null;
    const firsts = g.sessions.map(x => x.stats.firstVote).filter(Boolean).sort();
    const lasts = g.sessions.map(x => x.stats.lastVote).filter(Boolean).sort();
    g.firstVote = firsts[0] || null;
    g.lastVote = lasts[lasts.length - 1] || null;
    // رتبهٔ سخنرانی‌ها داخل پنل
    const ranked = [...q].sort((a, b) => b.stats.overall - a.stats.overall || b.stats.votes - a.stats.votes);
    ranked.forEach((x, i) => { x.rankInPanel = i + 1; });
  }

  const rankable = groups
    .filter(g => g.id !== NO_PANEL_ID && g.overall !== null)
    .sort((a, b) => b.overall - a.overall || b.totalVotes - a.totalVotes);
  rankable.forEach((g, i) => { g.rank = i + 1; });
  groups.forEach(g => { if (!g.rank) g.rank = null; });

  return { groups, rankable };
}

// برترین سخنرانی‌ها در کل کنگره
export function topSessions(groups, limit = 10) {
  const all = [];
  for (const g of groups) {
    if (g.id === NO_PANEL_ID) continue; // سخنرانی‌های بدون پنل (مثلاً آزمایشی) در جدول برترین‌ها نمی‌آیند
    for (const s of g.sessions) {
      if (s.qualified) all.push({ ...s, panelName: g.name, panelNameEn: g.name_en });
    }
  }
  return all.sort((a, b) => b.stats.overall - a.stats.overall || b.stats.votes - a.stats.votes).slice(0, limit);
}
