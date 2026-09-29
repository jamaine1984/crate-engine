import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { sqliteD1 } from '../platform/dev/sqlite-d1.mjs';
import { handleAnalytics, activityOverview, rollUpVisits, pageBucket, dayOf, ignoredPath } from '../platform/server/analytics.mjs';

const migrationDir = new URL('../platform/migrations/', import.meta.url);
const migrations = await Promise.all((await readdir(migrationDir)).filter(n => n.endsWith('.sql')).sort().map(n => readFile(new URL(n, migrationDir), 'utf8')));
const ORIGIN = 'https://example.test', DAY = 86400;
const fixture = () => { const sql = new DatabaseSync(':memory:'); for (const m of migrations) sql.exec(m); return { sql, env: { PLATFORM_DB: sqliteD1(sql), APP_ORIGIN: ORIGIN, AUTH_SECRET: 'x'.repeat(43) } }; };
const beacon = (f, path, { ip = '192.0.2.1', agent = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120', headers = {} } = {}) =>
  handleAnalytics(new Request(ORIGIN + '/api/platform/analytics/visit', { method: 'POST', body: JSON.stringify({ path }), headers: { origin: ORIGIN, 'content-type': 'application/json', 'cf-connecting-ip': ip, 'user-agent': agent, ...headers } }), f.env, '/analytics/visit');
const user = (f, id, at) => f.sql.prepare("INSERT INTO platform_users(id,email,username,display_name,email_verified,status,created_at,updated_at) VALUES(?,?,?,?,1,'active',?,?)").run(id, id + '@x.test', 'u' + id, id, at, at);

test('paths map to a few fixed buckets, and the owner portal is ignored', () => {
  assert.deepEqual(['/', '/play', '/play/', '/games', '/games/space-bunny', '/login', '/settings/ai', '/docs', '/anything?x=1'].map(pageBucket), ['home', 'editor', 'editor', 'games', 'games', 'account', 'account', 'other', 'other']);
  assert.equal(ignoredPath('/owners-portal/games'), true); assert.equal(ignoredPath('/games'), false);
});

test('visits count once per person per day, page views count every time, and no IP address is stored', async () => {
  const f = fixture();
  try {
    for (const path of ['/', '/play', '/play']) assert.equal((await beacon(f, path)).status, 204);
    await beacon(f, '/games', { ip: '192.0.2.2' });
    const days = f.sql.prepare('SELECT day, visitor FROM platform_visit_days').all();
    assert.equal(days.length, 2, 'two different visitors');
    assert.ok(days.every(d => d.day === dayOf() && /^[A-Za-z0-9_-]{22}$/.test(d.visitor) && !d.visitor.includes('192')));
    assert.deepEqual(Object.fromEntries(f.sql.prepare('SELECT page, views FROM platform_page_views').all().map(r => [r.page, r.views])), { home: 1, editor: 2, games: 1 });
    const stored = JSON.stringify([f.sql.prepare('SELECT * FROM platform_visit_days').all(), f.sql.prepare('SELECT * FROM platform_page_views').all()]);
    assert.ok(!stored.includes('192.0.2') && !stored.includes('Mozilla'), 'neither the IP address nor the browser string is kept');
  } finally { f.sql.close(); }
});

test('bots, Do Not Track, the owner portal, bad bodies and cross-site posts are not counted', async () => {
  const f = fixture();
  try {
    assert.equal((await beacon(f, '/', { agent: 'Googlebot/2.1' })).status, 204);
    assert.equal((await beacon(f, '/', { agent: '' })).status, 204);
    assert.equal((await beacon(f, '/', { headers: { dnt: '1' } })).status, 204);
    assert.equal((await beacon(f, '/', { headers: { 'sec-gpc': '1' } })).status, 204);
    assert.equal((await beacon(f, '/owners-portal/games')).status, 204);
    const bad = await handleAnalytics(new Request(ORIGIN + '/api/platform/analytics/visit', { method: 'POST', body: 'not json', headers: { origin: ORIGIN, 'user-agent': 'Chrome', 'cf-connecting-ip': '192.0.2.5' } }), f.env, '/analytics/visit');
    assert.equal(bad.status, 204);
    await assert.rejects(beacon(f, '/', { headers: { origin: 'https://evil.example' } }), /application/);
    assert.equal((await handleAnalytics(new Request(ORIGIN + '/api/platform/analytics/visit'), f.env, '/analytics/visit')).status, 405);
    assert.equal(await handleAnalytics(new Request(ORIGIN + '/api/platform/other'), f.env, '/other'), null);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_visit_days').get().n, 0);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_page_views').get().n, 0);
  } finally { f.sql.close(); }
});

test('one address cannot flood the counters', async () => {
  const f = fixture();
  try {
    for (let i = 0; i < 650; i++) await beacon(f, '/');
    assert.equal(f.sql.prepare("SELECT views FROM platform_page_views WHERE page='home'").get().views, 600);
  } finally { f.sql.close(); }
});

test('the overview reports real sign-ups, plays, visitors and editor opens; finished days roll up and lose their hashes', async () => {
  const f = fixture();
  try {
    const at = Math.floor(Date.now() / 1000);
    user(f, 'a', at); user(f, 'b', at - DAY); user(f, 'c', at - 3 * DAY); user(f, 'old', at - 40 * DAY);
    f.sql.prepare("INSERT INTO platform_users(id,email,username,display_name,email_verified,status,created_at,updated_at) VALUES('gone','g@x.test','gone','g',1,'deleted',?,?)").run(at, at);
    // Old visit data for two finished days, as if the counter had been running.
    const yesterday = dayOf(at - DAY), twoAgo = dayOf(at - 2 * DAY);
    for (const [day, visitors, views] of [[yesterday, ['h1', 'h2', 'h3'], { home: 4, editor: 2 }], [twoAgo, ['h4'], { home: 1 }]]) {
      for (const v of visitors) f.sql.prepare('INSERT INTO platform_visit_days VALUES(?,?)').run(day, v);
      for (const [page, n] of Object.entries(views)) f.sql.prepare('INSERT INTO platform_page_views VALUES(?,?,?)').run(day, page, n);
    }
    await beacon(f, '/play');
    let o = await activityOverview(f.env);
    assert.equal(o.today.visitors, 1); assert.equal(o.today.editorOpens, 1); assert.equal(o.today.signups, 1, 'the deleted account is not counted');
    assert.equal(o.last7.signups, 3); assert.equal(o.totals.signups, 4); assert.equal(o.totals.plays, 0);
    assert.equal(o.last7.visitors, 5); assert.equal(o.last7.pageViews, 8); assert.equal(o.last7.editorOpens, 3);
    assert.equal(o.series.length, 14); assert.equal(o.series.at(-1).day, dayOf(at)); assert.equal(o.timezone, 'UTC');
    const before = JSON.stringify(o.series.map(d => [d.day, d.visitors, d.pageViews, d.editorOpens]));
    assert.deepEqual(await rollUpVisits(f.env), { rolledUp: 2 });
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM platform_visit_days WHERE day < ?").get(dayOf(at)).n, 0, 'finished days keep no visitor hashes');
    assert.equal(f.sql.prepare('SELECT visitors FROM platform_daily_stats WHERE day=?').get(yesterday).visitors, 3);
    o = await activityOverview(f.env);
    assert.equal(JSON.stringify(o.series.map(d => [d.day, d.visitors, d.pageViews, d.editorOpens])), before, 'the numbers are the same after rolling up');
    assert.deepEqual(await rollUpVisits(f.env), { rolledUp: 0 }, 'running it again changes nothing');
  } finally { f.sql.close(); }
});
