import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { sqliteD1 } from '../platform/dev/sqlite-d1.mjs';
import worker from '../worker/engine-maintenance/index.mjs';

const migrationDir = new URL('../platform/migrations/', import.meta.url);
const migrations = await Promise.all((await readdir(migrationDir)).filter(n => n.endsWith('.sql')).sort()
  .map(name => readFile(new URL(name, migrationDir), 'utf8')));

test('scheduled maintenance deletes due queued objects and exposes no HTTP actions', async () => {
  const sql = new DatabaseSync(':memory:'); for (const migration of migrations) sql.exec(migration);
  const due = 'engine-private/user-1/asset-1.glb', later = 'engine-private/user-1/asset-2.glb';
  const files = new Set([due, later]);
  const env = { PLATFORM_DB: sqliteD1(sql), ENGINE_ASSETS: { async get() { return null; }, async put() {}, async delete(key) { files.delete(key); } } };
  const stamp = Math.floor(Date.now() / 1000);
  sql.prepare('INSERT INTO platform_engine_asset_purge_queue(id,user_id,storage_key,created_at,not_before) VALUES(?,?,?,?,?)').run('asset-1', 'user-1', due, stamp, stamp - 1);
  sql.prepare('INSERT INTO platform_engine_asset_purge_queue(id,user_id,storage_key,created_at,not_before) VALUES(?,?,?,?,?)').run('asset-2', 'user-1', later, stamp, stamp + 3600);
  const pending = [], logs = [], log = console.log;
  console.log = line => logs.push(line);
  try { await worker.scheduled({ cron: '23 * * * *' }, env, { waitUntil: promise => pending.push(promise) }); await Promise.all(pending); }
  finally { console.log = log; }
  assert.deepEqual([...files], [later]);
  assert.deepEqual(sql.prepare('SELECT id FROM platform_engine_asset_purge_queue').all().map(r => r.id), ['asset-2']);
  assert.deepEqual(JSON.parse(logs[0]), { event: 'engine.maintenance.purge', cron: '23 * * * *', deleted: 1, failed: 0 });
  assert.equal((await worker.fetch(new Request('https://example.test/'))).status, 404);
  sql.close();
});
