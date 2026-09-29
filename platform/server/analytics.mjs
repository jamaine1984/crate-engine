// Privacy-friendly visit counting and the numbers behind the Owner Portal overview.
// No cookies, no stored IP addresses: a visitor is a one-way daily hash (see migration 0012).
import { json, now, database, requireMutationOrigin } from './common.mjs';
import { rateLimit } from './identity.mjs';

const encoder = new TextEncoder();
export const PAGES = ['home', 'editor', 'games', 'account', 'other'];
const BOT = /bot|crawl|spider|slurp|headless|preview|monitor|uptime|curl|wget|python|httpclient|axios|node-fetch|lighthouse|pingdom|facebookexternalhit/i;

export const dayOf = (seconds = now()) => new Date(seconds * 1000).toISOString().slice(0, 10);
const daysBack = (count, from = now()) => Array.from({ length: count }, (_, i) => dayOf(from - i * 86400));

/** Which part of the site a path belongs to. The server decides; the client's word is never stored. */
export function pageBucket(path) {
  const p = String(path || '/').split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (p === '/') return 'home';
  if (p === '/play' || p.startsWith('/play/')) return 'editor';
  if (p === '/games' || p.startsWith('/games/') || p.startsWith('/game/')) return 'games';
  if (/^\/(login|signup|register|settings|account|library|my-games|creator|creators)(\/|$)/.test(p)) return 'account';
  return 'other';
}
// The owner's own pages are not traffic.
export const ignoredPath = path => /^\/owners?-portal(\/|$)/.test(String(path || ''));

async function visitorHash(request, env, day) {
  const secret = env.AUTH_SECRET || 'local-development';
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const ip = request.headers.get('cf-connecting-ip') || 'local', agent = (request.headers.get('user-agent') || '').slice(0, 200);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`visit|${day}|${ip}|${agent}`)));
  return btoa(String.fromCharCode(...sig.slice(0, 16))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export async function handleAnalytics(request, env, path) {
  if (path !== '/analytics/visit') return null;
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  const quiet = () => new Response(null, { status: 204 });
  requireMutationOrigin(request, env);
  if (request.headers.get('dnt') === '1' || request.headers.get('sec-gpc') === '1') return quiet();
  const agent = request.headers.get('user-agent') || '';
  if (!agent || BOT.test(agent)) return quiet();
  let body; try { body = JSON.parse((await request.text()).slice(0, 500)); } catch { return quiet(); }
  if (!body || typeof body.path !== 'string' || ignoredPath(body.path)) return quiet();
  try { await rateLimit(request, env, 'visit', '', 600, 3600); } catch { return quiet(); }
  const db = database(env), day = dayOf(), page = pageBucket(body.path), visitor = await visitorHash(request, env, day);
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO platform_visit_days(day, visitor) VALUES(?,?)').bind(day, visitor),
    db.prepare('INSERT INTO platform_page_views(day, page, views) VALUES(?,?,1) ON CONFLICT(day, page) DO UPDATE SET views = views + 1').bind(day, page),
  ]);
  return quiet();
}

/** Rolls finished days into platform_daily_stats and deletes their visitor hashes. Safe to run any number of times. */
export async function rollUpVisits(env, { today = dayOf() } = {}) {
  const db = database(env);
  const finished = ((await db.prepare('SELECT DISTINCT day FROM platform_visit_days WHERE day < ? UNION SELECT DISTINCT day FROM platform_page_views WHERE day < ?').bind(today, today).all()).results || []).map(r => r.day);
  for (const day of finished) {
    const visitors = (await db.prepare('SELECT COUNT(*) n FROM platform_visit_days WHERE day=?').bind(day).first())?.n || 0;
    const views = (await db.prepare("SELECT COALESCE(SUM(views),0) total, COALESCE(SUM(CASE WHEN page='editor' THEN views END),0) editor FROM platform_page_views WHERE day=?").bind(day).first()) || {};
    await db.batch([
      db.prepare('INSERT INTO platform_daily_stats(day, visitors, page_views, editor_opens) VALUES(?,?,?,?) ON CONFLICT(day) DO UPDATE SET visitors = MAX(visitors, excluded.visitors), page_views = MAX(page_views, excluded.page_views), editor_opens = MAX(editor_opens, excluded.editor_opens)').bind(day, visitors, views.total || 0, views.editor || 0),
      db.prepare('DELETE FROM platform_visit_days WHERE day=?').bind(day),
      db.prepare('DELETE FROM platform_page_views WHERE day=?').bind(day),
    ]);
  }
  return { rolledUp: finished.length };
}

/** Real visitor, sign-up, editor and play numbers for the last 14 days (UTC days) plus totals. */
export async function activityOverview(env, { at = now() } = {}) {
  const db = database(env), days = daysBack(14, at).reverse(), first = days[0];
  const start = Math.floor(Date.parse(first + 'T00:00:00Z') / 1000);
  const all = async (sql, ...binds) => (await db.prepare(sql).bind(...binds).all()).results || [];
  const byDay = rows => new Map(rows.map(r => [r.day, r]));
  const visitors = byDay(await all('SELECT day, COUNT(*) n FROM platform_visit_days WHERE day >= ? GROUP BY day', first));
  const views = byDay(await all("SELECT day, SUM(views) total, SUM(CASE WHEN page='editor' THEN views ELSE 0 END) editor FROM platform_page_views WHERE day >= ? GROUP BY day", first));
  const rolled = byDay(await all('SELECT day, visitors, page_views, editor_opens FROM platform_daily_stats WHERE day >= ?', first));
  const signups = byDay(await all("SELECT strftime('%Y-%m-%d', created_at, 'unixepoch') day, COUNT(*) n FROM platform_users WHERE created_at >= ? AND status != 'deleted' GROUP BY day", start));
  const plays = byDay(await all("SELECT strftime('%Y-%m-%d', created_at, 'unixepoch') day, COUNT(*) n FROM platform_game_sessions WHERE created_at >= ? GROUP BY day", start));
  const series = days.map(day => ({
    day,
    visitors: Math.max(visitors.get(day)?.n || 0, rolled.get(day)?.visitors || 0),
    pageViews: Math.max(views.get(day)?.total || 0, rolled.get(day)?.page_views || 0),
    editorOpens: Math.max(views.get(day)?.editor || 0, rolled.get(day)?.editor_opens || 0),
    signups: signups.get(day)?.n || 0,
    plays: plays.get(day)?.n || 0,
  }));
  const sum = (key, count) => series.slice(-count).reduce((n, d) => n + d[key], 0);
  const window = count => Object.fromEntries(['visitors', 'pageViews', 'editorOpens', 'signups', 'plays'].map(k => [k, sum(k, count)]));
  const totals = {
    signups: (await db.prepare("SELECT COUNT(*) n FROM platform_users WHERE status != 'deleted'").first())?.n || 0,
    plays: (await db.prepare('SELECT COUNT(*) n FROM platform_game_sessions').first())?.n || 0,
  };
  return { timezone: 'UTC', today: window(1), last7: window(7), last14: window(14), totals, series, since: (await db.prepare('SELECT MIN(day) d FROM (SELECT day FROM platform_visit_days UNION SELECT day FROM platform_daily_stats UNION SELECT day FROM platform_page_views)').first())?.d || null };
}
