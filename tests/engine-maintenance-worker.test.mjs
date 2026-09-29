import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { sqliteD1 } from '../platform/dev/sqlite-d1.mjs';
import worker from '../worker/engine-maintenance/index.mjs';
import { runMaintenance, MAINTENANCE_LIMITS } from '../platform/server/maintenance.mjs';

const migrationDir = new URL('../platform/migrations/', import.meta.url);
const migrations = await Promise.all((await readdir(migrationDir)).filter(n => n.endsWith('.sql')).sort()
  .map(name => readFile(new URL(name, migrationDir), 'utf8')));
const DAY = 86400, stamp = () => Math.floor(Date.now() / 1000);
const database = () => { const sql = new DatabaseSync(':memory:'); for (const migration of migrations) sql.exec(migration); return sql; };
const storage = files => ({ async get() { return null; }, async put() {}, async delete(key) { files.delete(key); } });
const count = (sql, table) => sql.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;

test('the scheduled worker runs the daily housekeeping, deletes due queued objects and exposes no HTTP actions', async () => {
  const sql = database();
  const due = 'engine-private/user-1/asset-1.glb', later = 'engine-private/user-1/asset-2.glb';
  const files = new Set([due, later]);
  const env = { PLATFORM_DB: sqliteD1(sql), ENGINE_ASSETS: storage(files) };
  const at = stamp();
  sql.prepare('INSERT INTO platform_engine_asset_purge_queue(id,user_id,storage_key,created_at,not_before) VALUES(?,?,?,?,?)').run('asset-1', 'user-1', due, at, at - 1);
  sql.prepare('INSERT INTO platform_engine_asset_purge_queue(id,user_id,storage_key,created_at,not_before) VALUES(?,?,?,?,?)').run('asset-2', 'user-1', later, at, at + 3600);
  const pending = [], logs = [], log = console.log;
  console.log = line => logs.push(line);
  try { await worker.scheduled({ cron: '17 3 * * *' }, env, { waitUntil: promise => pending.push(promise) }); await Promise.all(pending); }
  finally { console.log = log; }
  assert.deepEqual([...files], [later]);
  assert.deepEqual(sql.prepare('SELECT id FROM platform_engine_asset_purge_queue').all().map(r => r.id), ['asset-2']);
  const summary = JSON.parse(logs[0]);
  assert.equal(summary.event, 'platform.maintenance.run'); assert.equal(summary.cron, '17 3 * * *');
  assert.deepEqual(summary.engineAssets, { deleted: 1, failed: 0 });
  for (const name of ['visitStats', 'rateLimits', 'sessions', 'oauthCodes', 'oauthTokens', 'aiCommands', 'aiLinks']) assert.ok(summary[name] && !summary[name].failed, name);
  assert.equal((await worker.fetch(new Request('https://example.test/'))).status, 404);
  sql.close();
});

test('the wrangler schedule is once a day', async () => {
  const toml = await readFile(new URL('../worker/engine-maintenance/wrangler.toml', import.meta.url), 'utf8');
  assert.match(toml, /crons\s*=\s*\["17 3 \* \* \*"\]/);
});

test('housekeeping removes only what is expired and keeps everything else', async () => {
  const sql = database(), at = stamp(), env = { PLATFORM_DB: sqliteD1(sql) };
  const user = 'u1';
  sql.prepare("INSERT INTO platform_users(id,email,username,display_name,email_verified,status,created_at,updated_at) VALUES(?,?,?,?,1,'active',?,?)").run(user, 'a@x.test', 'a', 'A', at, at);
  const session = (id, expires) => sql.prepare('INSERT INTO platform_sessions(id,token_hash,user_id,created_at,expires_at,last_seen_at,auth_time,user_agent,ip_hash) VALUES(?,?,?,?,?,?,?,?,?)').run(id, 'h' + id, user, at - 30 * DAY, expires, at, at, 'x', 'x');
  session('old', at - 8 * DAY); session('recent-expired', at - DAY); session('live', at + DAY);
  const limit = (key, expires) => sql.prepare('INSERT INTO platform_rate_limits(key,window_start,attempts,expires_at) VALUES(?,?,?,?)').run(key, at - 100, 1, expires);
  limit('gone', at - 10); limit('kept', at + 3600);
  const code = (hash, expires) => sql.prepare('INSERT INTO platform_oauth_codes(code_hash,client_id,user_id,redirect_uri,code_challenge,resource,scope,expires_at) VALUES(?,?,?,?,?,?,?,?)').run(hash, 'c', user, 'http://x/', 'ch', 'r', 'editor', expires);
  code('old', at - 3 * DAY); code('fresh', at + 60);
  sql.prepare('INSERT INTO platform_oauth_grants(id,user_id,client_id,client_name,resource,scope,created_at) VALUES(?,?,?,?,?,?,?)').run('grant', user, 'c', 'Claude', 'r', 'editor', at);
  const token = (hash, kind, expires, used = null) => sql.prepare('INSERT INTO platform_oauth_tokens(token_hash,grant_id,kind,expires_at,used_at) VALUES(?,?,?,?,?)').run(hash, 'grant', kind, expires, used);
  token('access-old', 'access', at - 9 * DAY); token('refresh-used-live', 'refresh', at + 20 * DAY, at - DAY); token('refresh-live', 'refresh', at + 30 * DAY);
  const link = (id, created, seen, closed = null) => sql.prepare('INSERT INTO platform_ai_editor_links(id,user_id,project_id,created_at,last_seen_at,closed_at) VALUES(?,?,?,?,?,?)').run(id, user, 'p', created, seen, closed);
  link('closed-old', at - 20 * DAY, at - 20 * DAY, at - 10 * DAY); link('idle-old', at - 60 * DAY, at - 40 * DAY); link('live', at - DAY, at); link('closed-recent', at - 3 * DAY, at - 3 * DAY, at - 2 * DAY);
  const command = (id, linkId, created, status = 'completed') => sql.prepare('INSERT INTO platform_ai_commands(id,link_id,grant_id,command,arguments_json,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').run(id, linkId, 'grant', 'get_scene', '{}', status, created, created + 30);
  command('cmd-old', 'live', at - 3 * DAY); command('cmd-fresh', 'live', at - 60, 'queued'); command('cmd-on-old-link', 'closed-old', at - 12 * DAY); command('cmd-on-idle-link', 'idle-old', at - 41 * DAY, 'expired');

  const summary = await runMaintenance(env, { at });
  assert.deepEqual(sql.prepare('SELECT id FROM platform_sessions ORDER BY id').all().map(r => r.id), ['live', 'recent-expired']);
  assert.deepEqual(sql.prepare('SELECT key FROM platform_rate_limits').all().map(r => r.key), ['kept']);
  assert.deepEqual(sql.prepare('SELECT code_hash FROM platform_oauth_codes').all().map(r => r.code_hash), ['fresh']);
  assert.deepEqual(sql.prepare('SELECT token_hash FROM platform_oauth_tokens ORDER BY token_hash').all().map(r => r.token_hash), ['refresh-live', 'refresh-used-live'], 'a used refresh token stays until it would have expired, so reuse is still detected');
  assert.deepEqual(sql.prepare('SELECT id FROM platform_ai_commands ORDER BY id').all().map(r => r.id), ['cmd-fresh']);
  assert.deepEqual(sql.prepare('SELECT id FROM platform_ai_editor_links ORDER BY id').all().map(r => r.id), ['closed-recent', 'live']);
  assert.equal(summary.sessions.removed, 1); assert.equal(summary.aiLinks.linksRemoved, 2);
  // Running it again finds nothing more to do.
  const again = await runMaintenance(env, { at });
  for (const name of ['rateLimits', 'sessions', 'oauthCodes', 'oauthTokens', 'aiCommands']) assert.equal(again[name].removed, 0, name);
  sql.close();
});

test('every step is capped per run, so a big backlog is cleared over several days, not in one', async () => {
  const sql = database(), at = stamp(), env = { PLATFORM_DB: sqliteD1(sql) };
  for (let i = 0; i < 25; i++) sql.prepare('INSERT INTO platform_rate_limits(key,window_start,attempts,expires_at) VALUES(?,?,?,?)').run('k' + i, at - 100, 1, at - 10);
  const limits = { ...MAINTENANCE_LIMITS, rowsPerStep: 10 };
  assert.equal((await runMaintenance(env, { at, limits })).rateLimits.removed, 10); assert.equal(count(sql, 'platform_rate_limits'), 15);
  assert.equal((await runMaintenance(env, { at, limits })).rateLimits.removed, 10);
  assert.equal((await runMaintenance(env, { at, limits })).rateLimits.removed, 5); assert.equal(count(sql, 'platform_rate_limits'), 0);
  assert.equal(MAINTENANCE_LIMITS.assetBatches * MAINTENANCE_LIMITS.assetBatchSize, 100); assert.equal(MAINTENANCE_LIMITS.rowsPerStep, 2000);
  sql.close();
});

test('a failing step is reported and does not stop the others', async () => {
  const sql = database(), at = stamp();
  sql.exec('DROP TABLE platform_page_views');
  sql.prepare('INSERT INTO platform_rate_limits(key,window_start,attempts,expires_at) VALUES(?,?,?,?)').run('gone', at - 100, 1, at - 10);
  sql.prepare("INSERT INTO platform_visit_days(day, visitor) VALUES('2020-01-01','x')").run();
  const summary = await runMaintenance({ PLATFORM_DB: sqliteD1(sql) }, { at });
  assert.ok(summary.visitStats.failed, 'the broken step is reported');
  assert.equal(summary.rateLimits.removed, 1, 'later steps still ran');
  sql.close();
});
