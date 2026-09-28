import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { sqliteD1 } from '../platform/dev/sqlite-d1.mjs';
import { base64url } from '../platform/server/identity.mjs';
import { onRequest } from '../functions/api/platform/[[path]].js';

const migrationDir = new URL('../platform/migrations/', import.meta.url);
const migrations = await Promise.all((await readdir(migrationDir)).filter(n => n.endsWith('.sql')).sort()
  .map(name => readFile(new URL(name, migrationDir), 'utf8')));
const key = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
function fixture() {
  const sql = new DatabaseSync(':memory:'); for (const migration of migrations) sql.exec(migration);
  return { sql, env: { PLATFORM_DB: sqliteD1(sql), APP_ORIGIN: 'https://example.test', AUTH_SECRET: key(), ENCRYPTION_KEY: key() } };
}
function call(f, path, method = 'GET') {
  const request = new Request(`${f.env.APP_ORIGIN}/api/platform${path}`, { method,
    headers: { origin: f.env.APP_ORIGIN, 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.30' },
    ...(method === 'GET' ? {} : { body: '{}' }) });
  return onRequest({ request, env: f.env, params: { path: path.slice(1).split('/') } });
}
const maintenance = (f, on) => f.sql.prepare("UPDATE platform_feature_flags SET enabled=? WHERE key='MAINTENANCE_MODE'").run(on ? 1 : 0);

test('maintenance mode blocks player, catalog and creator APIs at the router', async () => {
  const f = fixture();
  try {
    assert.equal((await call(f, '/catalog')).status, 200);
    maintenance(f, true);
    for (const [path, method] of [['/catalog', 'GET'], ['/player/sessions', 'POST'], ['/uploads', 'POST'], ['/engine/assets', 'GET'], ['/model-connections', 'GET']]) {
      const response = await call(f, path, method);
      assert.equal(response.status, 503, `${method} ${path}`);
      assert.equal((await response.json()).error.code, 'MAINTENANCE');
    }
    maintenance(f, false);
    assert.equal((await call(f, '/catalog')).status, 200);
  } finally { f.sql.close(); }
});

test('maintenance mode keeps sign-in, config, health and the owner portal reachable', async () => {
  const f = fixture();
  try {
    maintenance(f, true);
    assert.equal((await call(f, '/health')).status, 200);
    const config = await call(f, '/config');
    assert.equal(config.status, 200);
    assert.equal((await config.json()).flags.MAINTENANCE_MODE, true);
    for (const path of ['/me', '/owner/overview']) assert.notEqual((await call(f, path)).status, 503, path);
    assert.notEqual((await call(f, '/auth/session')).status, 503);
  } finally { f.sql.close(); }
});
