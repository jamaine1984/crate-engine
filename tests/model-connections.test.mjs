import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { sqliteD1 } from '../platform/dev/sqlite-d1.mjs';
import { base64url, tokenHash } from '../platform/server/identity.mjs';
import { HttpError } from '../platform/server/common.mjs';
import { handleModelConnections, modelConnectionErasureStatements, parseProposal, projectSceneSummary, repairOperationBraces, MODEL_BILLING_POLICY } from '../platform/server/model-connections.mjs';
import retiredAI from '../worker/index.js';
import { modelSceneContext } from '../engine/editor/scene-context.mjs';

const migrationDir = new URL('../platform/migrations/', import.meta.url);
const migrations = await Promise.all((await readdir(migrationDir)).filter(name => name.endsWith('.sql')).sort()
  .map(name => readFile(new URL(name, migrationDir), 'utf8')));
const stamp = () => Math.floor(Date.now() / 1000);
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
const API_KEY = 'fixture-api-key-this-is-not-a-real-credential';
const scene = { name: 'Fixture scene', settings: { background: '#123456', gravity: -9.81, ambientIntensity: 0.5 }, entities: [
  { id: 'cube-1', type: 'box', name: 'Cube', position: [0, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
] };
const proposal = { summary: 'Move the cube.', operations: [{ op: 'update', id: 'cube-1', patch: { position: [1, 2, 3] } }] };
const reject = (status, code) => error => error instanceof HttpError && error.status === status && (!code || error.code === code);
function fixture(t, extra = {}) {
  const sql = new DatabaseSync(':memory:'); migrations.forEach(migration => sql.exec(migration));
  const f = { sql, env: { PLATFORM_DB: sqliteD1(sql), APP_ORIGIN: 'https://example.test', AUTH_SECRET: random(), ENCRYPTION_KEY: random(), ...extra } };
  t.after(() => sql.close()); return f;
}
async function actor(f, options = {}) {
  const id = crypto.randomUUID(), token = random(), sessionId = crypto.randomUUID(), at = stamp();
  f.sql.prepare(`INSERT INTO platform_users(id,email,username,display_name,email_verified,status,created_at,updated_at)
    VALUES(?,?,?,?,?,'active',?,?)`).run(id, `${id}@example.test`, `u_${id}`, 'Fixture', options.verified === false ? 0 : 1, at, at);
  f.sql.prepare('INSERT INTO platform_user_roles VALUES(?,?,?)').run(id, options.role || 'PLAYER', at);
  f.sql.prepare(`INSERT INTO platform_sessions(id,token_hash,user_id,created_at,expires_at,last_seen_at,auth_time,mfa_time,user_agent,ip_hash)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(sessionId, await tokenHash(token), id, at, at + 3600, at, options.authTime ?? at, options.mfaTime ?? null, 'fixture', 'fixture');
  return { id, sessionId, cookie: `__Host-crateship_session=${token}` };
}
function request(f, user, path, method = 'GET', body, headers = {}) {
  return new Request(`${f.env.APP_ORIGIN}/api/platform${path}`, { method,
    headers: { origin: f.env.APP_ORIGIN, 'content-type': 'application/json', ...(user ? { cookie: user.cookie } : {}), ...headers },
    ...(['GET', 'HEAD'].includes(method) ? {} : { body: JSON.stringify(body ?? {}) }) });
}
const call = (f, user, path, method, body) => handleModelConnections(request(f, user, path, method, body), f.env, path);
function enable(f, enabled = true) { f.sql.prepare("UPDATE platform_feature_flags SET enabled=? WHERE key='ENGINE_AI_ENABLED'").run(Number(enabled)); }
async function connection(f, user, provider = 'openai', model = 'user-supplied-model') {
  return (await (await call(f, user, '/model-connections', 'POST', { provider, label: 'My provider', model, apiKey: API_KEY })).json()).connection;
}
const input = extra => ({ prompt: 'Move the cube.', sceneSummary: scene, maxOutputTokens: 512, requestId: crypto.randomUUID(), confirmProviderUsage: true, ...extra });
const generate = (f, user, row, body) => call(f, user, `/model-connections/${row.id}/propose`, 'POST', body);
const upstream = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
function openaiOutput(text = JSON.stringify(proposal)) {
  return { output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }], usage: { input_tokens: 120, output_tokens: 40 } };
}
function fetchMock(t, callback) {
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return callback(String(url), init); };
  t.after(() => { globalThis.fetch = original; }); return calls;
}

test('all migrations support encrypted account-bound storage without provider calls', async t => {
  const f = fixture(t), user = await actor(f);
  const calls = fetchMock(t, () => { throw new Error('No network expected'); });
  const row = await connection(f, user);
  const stored = f.sql.prepare('SELECT * FROM platform_model_connections').get();
  assert.match(stored.key_ciphertext, /^v1\.[\w-]+\.[\w-]+$/); assert.equal(stored.key_ciphertext.includes(API_KEY), false);
  assert.equal(row.keyHint, `…${API_KEY.slice(-4)}`); assert.equal(row.key_ciphertext, undefined);
  const listing = await (await call(f, user, '/model-connections', 'GET')).json();
  assert.equal(listing.enabled, false); assert.equal(listing.items.length, 1); assert.equal(JSON.stringify(listing).includes(API_KEY), false);
  assert.equal(listing.limits.maxOperations, 50); assert.equal(calls.length, 0);
  assert.equal(f.sql.prepare('SELECT detail_json FROM platform_audit').get().detail_json.includes(API_KEY), false);
});

test('billing policy states user account charges and cannot enable platform credits', async t => {
  const f = fixture(t), user = await actor(f);
  const listing = await (await call(f, user, '/model-connections', 'GET')).json();
  assert.ok(Object.isFrozen(MODEL_BILLING_POLICY));
  assert.deepEqual(listing.billing, { mode: 'user_provider_account', credentialSource: 'user_connection_only', platformFundedGeneration: false, platformCreditsProvided: false, explicitUsageConfirmationRequired: true });
  await assert.rejects(call(f, user, '/model-connections', 'POST', { provider: 'openai', label: 'No user key', model: 'model', usePlatformCredits: true }), reject(400));
});

for (const provider of ['openai', 'anthropic', 'openrouter']) test(`${provider} never reads platform credentials or credits, including on replay`, async t => {
  const f = fixture(t), user = await actor(f), row = await connection(f, user, provider); enable(f);
  for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY', 'FAL_KEY', 'REPLICATE_API_TOKEN', 'PLATFORM_AI_KEY', 'PLATFORM_AI_CREDITS']) {
    Object.defineProperty(f.env, key, { get() { throw new Error('Platform-funded credential or credits must never be read.'); } });
  }
  const calls = fetchMock(t, (_url, init) => {
    assert.equal(provider === 'anthropic' ? init.headers['x-api-key'] : init.headers.authorization, provider === 'anthropic' ? API_KEY : `Bearer ${API_KEY}`);
    return upstream(provider === 'openai' ? openaiOutput() : provider === 'anthropic' ? { content: [{ type: 'text', text: JSON.stringify(proposal) }] } : { choices: [{ message: { content: JSON.stringify(proposal) } }] });
  });
  const body = input(), result = await (await generate(f, user, row, body)).json(); assert.deepEqual(result.billing, MODEL_BILLING_POLICY);
  assert.deepEqual((await (await generate(f, user, row, body)).json()).billing, MODEL_BILLING_POLICY); assert.equal(calls.length, 1);
});

test('missing or corrupted user credential fails closed even when platform keys exist', async t => {
  const f = fixture(t, { OPENAI_API_KEY: 'platform-fixture-key-not-real', OPENROUTER_API_KEY: 'platform-fixture-key-not-real' }), user = await actor(f), row = await connection(f, user); enable(f);
  const calls = fetchMock(t, () => { throw new Error('No fallback network request allowed'); });
  f.sql.prepare('UPDATE platform_model_connections SET key_ciphertext=? WHERE id=?').run('', row.id);
  await assert.rejects(generate(f, user, row, input()), reject(503, 'MODEL_USER_CREDENTIAL_REQUIRED'));
  await assert.rejects(call(f, user, `/model-connections/${row.id}/test`, 'POST', {}), reject(503, 'MODEL_USER_CREDENTIAL_REQUIRED'));
  f.sql.prepare('UPDATE platform_model_connections SET key_ciphertext=? WHERE id=?').run('v1.corrupted.ciphertext', row.id);
  await assert.rejects(generate(f, user, row, input()), reject(503, 'MODEL_VAULT_UNAVAILABLE'));
  assert.equal(calls.length, 0); assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_model_requests').get().n, 0);
});

test('generation rejects request-level key and credit overrides', async t => {
  const f = fixture(t), user = await actor(f), row = await connection(f, user); enable(f);
  const calls = fetchMock(t, () => { throw new Error('No override network request allowed'); });
  for (const extra of [{ apiKey: 'request-fixture-key-not-real' }, { usePlatformCredits: true }, { billing: { platformFundedGeneration: true } }, { credentialSource: 'platform' }]) {
    await assert.rejects(generate(f, user, row, input(extra)), reject(400, 'MODEL_USAGE_CONFIRMATION_REQUIRED'));
  }
  assert.equal(calls.length, 0);
});

test('legacy AI Worker is retired for every request and never reads keys or fetches', async t => {
  const calls = fetchMock(t, () => { throw new Error('Retired worker must not fetch'); });
  const env = new Proxy({}, { get() { throw new Error('Retired worker must not read environment keys'); } });
  for (const method of ['GET', 'OPTIONS', 'POST']) {
    const request = new Request('https://legacy-worker.test/', { method, headers: { origin: 'https://untrusted.test', 'content-type': 'application/json' }, ...(method === 'POST' ? { body: '{"input":"run", "apiKey":"request-fixture-key-not-real"}' } : {}) });
    const response = await retiredAI.fetch(request, env); assert.equal(response.status, 410); assert.equal(response.headers.get('access-control-allow-origin'), null);
    const body = await response.json(); assert.equal(body.error.code, 'LEGACY_AI_PROXY_RETIRED'); assert.deepEqual(body.commands, []); assert.equal(body.billing.platformFundedGeneration, false);
  }
  assert.equal(calls.length, 0);
});

test('requires a real verified session and strict mutation origin', async t => {
  const f = fixture(t), user = await actor(f, { verified: false });
  await assert.rejects(call(f, null, '/model-connections', 'GET'), reject(401));
  await assert.rejects(call(f, user, '/model-connections', 'GET'), reject(403, 'EMAIL_VERIFICATION_REQUIRED'));
  const verified = await actor(f);
  await assert.rejects(handleModelConnections(request(f, verified, '/model-connections', 'POST', {}, { origin: 'https://evil.test' }), f.env, '/model-connections'), reject(403, 'ORIGIN_DENIED'));
  assert.equal(await handleModelConnections(new Request('https://example.test/other'), f.env, '/other'), null);
});

test('cross-account reads and all connection operations fail closed', async t => {
  const f = fixture(t), owner = await actor(f), other = await actor(f), row = await connection(f, owner); enable(f);
  const calls = fetchMock(t, () => { throw new Error('No network expected'); });
  assert.deepEqual((await (await call(f, other, '/model-connections', 'GET')).json()).items, []);
  for (const [suffix, method, body] of [['', 'DELETE', {}], ['/test', 'POST', {}], ['/propose', 'POST', input()]]) {
    await assert.rejects(call(f, other, `/model-connections/${row.id}${suffix}`, method, body), reject(404));
  }
  assert.equal(calls.length, 0);
});

test('only fixed supported providers and exact model identifiers are accepted', async t => {
  const f = fixture(t), user = await actor(f);
  for (const extra of [{ provider: 'custom' }, { model: 'https://evil.test/?key=secret' }, { model: 'https://evil.test' }, { model: 'model/../other' }, { endpoint: 'https://evil.test' }, { apiKey: 'key\r\ninjected: value' }, { model: '' }, { label: API_KEY }, { model: API_KEY }]) {
    await assert.rejects(call(f, user, '/model-connections', 'POST', { provider: 'openai', label: 'Provider', model: 'provided-model', apiKey: API_KEY, ...extra }), reject(400));
  }
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_model_connections').get().n, 0);
});

test('vault fails closed without a valid encryption key', async t => {
  const f = fixture(t, { ENCRYPTION_KEY: '' }), user = await actor(f);
  await assert.rejects(connection(f, user), reject(503, 'MODEL_VAULT_UNAVAILABLE'));
});

test('AES-GCM authenticates user, connection ID, and provider as additional data', async t => {
  const f = fixture(t), a = await actor(f), b = await actor(f), first = await connection(f, a), second = await connection(f, b); enable(f);
  const ciphertext = f.sql.prepare('SELECT key_ciphertext FROM platform_model_connections WHERE id=?').get(first.id).key_ciphertext;
  f.sql.prepare('UPDATE platform_model_connections SET key_ciphertext=? WHERE id=?').run(ciphertext, second.id);
  const calls = fetchMock(t, () => { throw new Error('No network expected'); });
  await assert.rejects(call(f, b, `/model-connections/${second.id}/test`, 'POST', {}), reject(503, 'MODEL_VAULT_UNAVAILABLE'));
  f.sql.prepare("UPDATE platform_model_connections SET provider='anthropic' WHERE id=?").run(first.id);
  await assert.rejects(call(f, a, `/model-connections/${first.id}/test`, 'POST', {}), reject(503, 'MODEL_VAULT_UNAVAILABLE'));
  assert.equal(calls.length, 0);
});

test('disabled provider flag stops metadata tests and generation before network or reservation', async t => {
  const f = fixture(t), user = await actor(f), row = await connection(f, user);
  const calls = fetchMock(t, () => { throw new Error('No network expected'); });
  await assert.rejects(call(f, user, `/model-connections/${row.id}/test`, 'POST', {}), reject(503, 'FEATURE_DISABLED'));
  await assert.rejects(generate(f, user, row, input()), reject(503, 'FEATURE_DISABLED'));
  assert.equal(calls.length, 0); assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_model_requests').get().n, 0);
});

test('OpenAI explicit test only retrieves model metadata', async t => {
  const f = fixture(t), user = await actor(f), row = await connection(f, user, 'openai', 'exact-model'); enable(f);
  const calls = fetchMock(t, (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/models/exact-model'); assert.equal(init.method, 'GET');
    assert.equal(init.headers.authorization, `Bearer ${API_KEY}`); assert.equal(init.redirect, 'manual'); assert.equal(init.body, undefined);
    return upstream({ id: 'exact-model' });
  });
  const result = await (await call(f, user, `/model-connections/${row.id}/test`, 'POST', {})).json();
  assert.equal(result.verified, true); assert.equal(result.generationTested, false); assert.equal(calls.length, 1);
  assert.equal(f.sql.prepare('SELECT last_test_status FROM platform_model_connections').get().last_test_status, 'verified');
});

test('Anthropic test uses model metadata and its required headers', async t => {
  const f = fixture(t), user = await actor(f), row = await connection(f, user, 'anthropic'); enable(f);
  const calls = fetchMock(t, (url, init) => {
    assert.equal(url, 'https://api.anthropic.com/v1/models/user-supplied-model'); assert.equal(init.method, 'GET');
    assert.equal(init.headers['x-api-key'], API_KEY); assert.equal(init.headers['anthropic-version'], '2023-06-01');
    return upstream({ id: 'resolved-alias-model' });
  });
  assert.equal((await (await call(f, user, `/model-connections/${row.id}/test`, 'POST', {})).json()).verified, true); assert.equal(calls.length, 1);
});

test('OpenRouter test validates credential plus exact model catalog entry with no completion', async t => {
  const f = fixture(t), user = await actor(f), row = await connection(f, user, 'openrouter', 'maker/exact-model'); enable(f);
  const calls = fetchMock(t, (url, init) => {
    assert.equal(init.method, 'GET'); assert.equal(init.headers.authorization, `Bearer ${API_KEY}`);
    if (url === 'https://openrouter.ai/api/v1/key') return upstream({ data: { label: 'private upstream label', limit: 100 } });
    assert.equal(url, 'https://openrouter.ai/api/v1/models?search=maker%2Fexact-model');
    return upstream({ data: [{ id: 'maker/exact-model' }] });
  });
  const result = await (await call(f, user, `/model-connections/${row.id}/test`, 'POST', {})).json();
  assert.equal(result.verified, true); assert.equal(result.limit, undefined); assert.equal(calls.length, 2);
});

test('deletion requires recent authentication and recent MFA when enrolled', async t => {
  const f = fixture(t), user = await actor(f, { authTime: stamp() - 301 }), row = await connection(f, user);
  await assert.rejects(call(f, user, `/model-connections/${row.id}`, 'DELETE', {}), reject(403, 'REAUTH_REQUIRED'));
  f.sql.prepare('UPDATE platform_sessions SET auth_time=? WHERE id=?').run(stamp(), user.sessionId);
  f.sql.prepare('INSERT INTO platform_mfa(user_id,secret_ciphertext,enabled,created_at,updated_at) VALUES(?,?,1,?,?)').run(user.id, 'not-used-in-this-test', stamp(), stamp());
  await assert.rejects(call(f, user, `/model-connections/${row.id}`, 'DELETE', {}), reject(403, 'REAUTH_REQUIRED'));
  f.sql.prepare('UPDATE platform_sessions SET mfa_time=? WHERE id=?').run(stamp(), user.sessionId);
  assert.equal((await (await call(f, user, `/model-connections/${row.id}`, 'DELETE', {})).json()).deleted, true);
});

test('generation requires explicit usage consent and bounded input', async t => {
  const f = fixture(t), user = await actor(f), row = await connection(f, user); enable(f);
  const calls = fetchMock(t, () => { throw new Error('No network expected'); });
  await assert.rejects(generate(f, user, row, input({ confirmProviderUsage: false })), reject(400, 'MODEL_USAGE_CONFIRMATION_REQUIRED'));
  for (const extra of [{ prompt: '' }, { prompt: 'x'.repeat(8001) }, { maxOutputTokens: 32769 }, { maxOutputTokens: 127 }, { requestId: 'short' }]) {
    await assert.rejects(generate(f, user, row, input(extra)), reject(400));
  }
  assert.equal(calls.length, 0);
});

test('scene summary projects asset metadata without raw bytes, URLs or arbitrary settings', () => {
  const projected = projectSceneSummary({ ...scene, apiKey: 'secret', assets: [{ id: 'existing-model', name: 'Tree', url: 'https://private.test', embedded: 'raw-bytes', cloudId: 'private-id' }],
    settings: { ...scene.settings, secret: 'password' }, entities: [{ ...scene.entities[0], script: 'danger()', url: 'https://private.test', raw: 'bytes' }] });
  assert.equal(JSON.stringify(projected).includes('secret'), false); assert.equal(JSON.stringify(projected).includes('private.test'), false);
  assert.equal(JSON.stringify(projected).includes('danger'), false); assert.equal(projected.settings.gravity, -9.81);
  assert.deepEqual(projected.assets, [{ id: 'existing-model', name: 'Tree', mime: 'model/gltf-binary' }]);
  assert.equal(JSON.stringify(projected).includes('raw-bytes'), false); assert.equal(JSON.stringify(projected).includes('private-id'), false);
  assert.throws(() => projectSceneSummary({ entities: [{ ...scene.entities[0], position: [Infinity, 0, 0] }] }), reject(400));
  assert.throws(() => projectSceneSummary({ entities: Array(251).fill(scene.entities[0]) }), reject(400));
  const runtime = projectSceneSummary({ ...scene, entities: [{ ...scene.entities[0], type: 'model', components: {
    rigidbody: { type: 'dynamic', mass: 1, restitution: 0.5 }, spin: { speed: 1 }, player: { speed: 5 }, animation: { clip: 'walk', url: 'private' },
  } }, { id: 'group', name: 'Group', type: 'empty' }] });
  assert.deepEqual(runtime.entities[0].components, { rigidbody: { type: 'dynamic' }, spin: { speed: 1 } });
  assert.equal(runtime.entities[1].type, 'empty'); assert.equal(JSON.stringify(runtime).includes('private'), false);
});

test('OpenAI makes one Responses request with store:false and no tools or agent loop', async t => {
  const f = fixture(t), user = await actor(f), row = await connection(f, user); enable(f);
  const calls = fetchMock(t, (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses'); assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'manual');
    const sent = JSON.parse(init.body); assert.equal(sent.model, 'user-supplied-model'); assert.equal(sent.store, false);
    assert.equal(sent.max_output_tokens, 512); assert.equal(sent.tools, undefined); assert.equal(sent.background, undefined);
    assert.equal(sent.input.includes(API_KEY), false); assert.equal(sent.input.includes('existing-model'), true); assert.equal(sent.input.includes('private-model-url'), false);
    assert.equal(f.sql.prepare('SELECT status FROM platform_model_requests').get().status, 'pending');
    return upstream(openaiOutput());
  });
  const result = await (await generate(f, user, row, input({ sceneSummary: { ...scene, assets: [{ id: 'existing-model', url: 'private-model-url' }] } }))).json();
  assert.deepEqual(result.operations, proposal.operations); assert.deepEqual(result.usage, { inputTokens: 120, outputTokens: 40 }); assert.equal(calls.length, 1);
  const stored = f.sql.prepare('SELECT * FROM platform_model_requests').get(); assert.equal(stored.status, 'succeeded');
  assert.equal(stored.response_json.includes(API_KEY), false); assert.equal(stored.prompt, undefined);
});

test('Anthropic proposes through Messages with bounded output and no tools', async t => {
  const f = fixture(t), user = await actor(f), row = await connection(f, user, 'anthropic'); enable(f);
  const calls = fetchMock(t, (url, init) => {
    assert.equal(url, 'https://api.anthropic.com/v1/messages'); assert.equal(init.headers['x-api-key'], API_KEY);
    const sent = JSON.parse(init.body); assert.equal(sent.max_tokens, 512); assert.equal(sent.tools, undefined); assert.equal(sent.messages.length, 1);
    return upstream({ content: [{ type: 'text', text: JSON.stringify(proposal) }], usage: { input_tokens: 50, output_tokens: 20 } });
  });
  assert.deepEqual((await (await generate(f, user, row, input())).json()).operations, proposal.operations); assert.equal(calls.length, 1);
});

test('OpenRouter proposes once through compatible completion endpoint', async t => {
  const f = fixture(t), user = await actor(f), row = await connection(f, user, 'openrouter', 'maker/exact-model'); enable(f);
  const calls = fetchMock(t, (url, init) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions'); const sent = JSON.parse(init.body);
    assert.equal(sent.model, 'maker/exact-model'); assert.equal(sent.stream, false); assert.equal(sent.tools, undefined);
    return upstream({ choices: [{ message: { content: JSON.stringify(proposal) } }], usage: { prompt_tokens: 50, completion_tokens: 20 } });
  });
  assert.deepEqual((await (await generate(f, user, row, input())).json()).operations, proposal.operations); assert.equal(calls.length, 1);
});

test('same request replays stored result without double billing; changed input conflicts', async t => {
  const f = fixture(t), user = await actor(f), row = await connection(f, user); enable(f);
  const calls = fetchMock(t, () => upstream(openaiOutput())), body = input();
  await generate(f, user, row, body); enable(f, false);
  assert.equal((await (await generate(f, user, row, body)).json()).replayed, true);
  await assert.rejects(generate(f, user, row, { ...body, prompt: 'Different prompt' }), reject(409, 'MODEL_IDEMPOTENCY_CONFLICT'));
  assert.equal(calls.length, 1); assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_model_requests').get().n, 1);
});

test('concurrent identical requests make only one provider call', async t => {
  const f = fixture(t), user = await actor(f), row = await connection(f, user); enable(f);
  let release, started; const gate = new Promise(resolve => { release = resolve; }); const began = new Promise(resolve => { started = resolve; });
  const calls = fetchMock(t, async () => { started(); await gate; return upstream(openaiOutput()); }), body = input();
  const first = generate(f, user, row, body); await began;
  await assert.rejects(generate(f, user, row, body), reject(409, 'MODEL_REQUEST_PENDING')); release(); await first;
  assert.equal(calls.length, 1);
});

test('atomic daily request reservations stop spend at configured cap', async t => {
  const f = fixture(t, { ENGINE_AI_REQUESTS_PER_DAY: '1' }), user = await actor(f), row = await connection(f, user); enable(f);
  const calls = fetchMock(t, () => upstream(openaiOutput()));
  const results = await Promise.allSettled([generate(f, user, row, input()), generate(f, user, row, input())]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'MODEL_USAGE_LIMIT'); assert.equal(calls.length, 1);
});

test('daily reserved token cap and rolling minute cap apply across connections', async t => {
  const f = fixture(t, { ENGINE_AI_OUTPUT_TOKENS_PER_DAY: '512' }), user = await actor(f), a = await connection(f, user), b = await connection(f, user, 'anthropic'); enable(f);
  const calls = fetchMock(t, () => upstream(openaiOutput()));
  await generate(f, user, a, input()); await assert.rejects(generate(f, user, b, input({ maxOutputTokens: 128 })), reject(429, 'MODEL_USAGE_LIMIT'));
  f.env.ENGINE_AI_OUTPUT_TOKENS_PER_DAY = '32768'; f.env.ENGINE_AI_REQUESTS_PER_MINUTE = '1';
  await assert.rejects(generate(f, user, a, input()), reject(429, 'MODEL_USAGE_LIMIT')); assert.equal(calls.length, 1);
});

test('game-sized requests reserve up to 32768 output tokens (migration 0011)', async t => {
  const f = fixture(t), user = await actor(f), row = await connection(f, user); enable(f);
  const calls = fetchMock(t, () => upstream(openaiOutput()));
  await generate(f, user, row, input({ maxOutputTokens: 32768 }));
  assert.equal(calls.length, 1);
  await assert.rejects(generate(f, user, row, input({ maxOutputTokens: 32769 })), reject(400));
});

test('replies missing operation closers are repaired, then fully validated', () => {
  const ctx = { entities: [], assets: [], entityCount: 0, lightCount: 0 };
  const art = '{"type":"customMesh","name":"Rock","shape":{"paths":[{"points":[[0,0],[1,0],[0,1]],"color":"#777777"}]}';
  // Real Space Bunny reply shape: the closing brace of each operation is dropped before the next {"op":.
  const dropped = '{"summary":"s","worldRecipe":{"version":1,"seed":"a","operations":[{"op":"add","entity":' + art + '},{"op":"add","entity":' + art + '}]}}';
  const report = {}; const parsed = parseProposal(dropped, new Set(), ctx, report);
  assert.ok(parsed?.worldRecipe, report.error); assert.equal(parsed.worldRecipe.operations.length, 2);
  // "}" written where "]}" belongs is supplied too.
  const skipped = '{"summary":"s","worldRecipe":{"version":1,"seed":"a","operations":[{"op":"add","entity":{"type":"customMesh","name":"Rock","shape":{"paths":[{"points":[[0,0],[1,0],[0,1]],"color":"#777777"}}}}]}}';
  assert.ok(parseProposal(skipped, new Set(), ctx)?.worldRecipe);
  // Well-formed text is never rewritten; unrepairable text still fails with a reason.
  assert.equal(repairOperationBraces('{"summary":"s","operations":[]}'), null);
  const bad = {}; assert.equal(parseProposal('{"summary":"s","worldRecipe":{"paths":[[0,0],"color":"#fff"]}}', new Set(), ctx, bad), null);
  assert.equal(bad.error, 'The reply is not a single JSON object.');
  // Repair never loosens validation: a repaired reply with a forbidden field is still rejected with the reason.
  const forbidden = {}; assert.equal(parseProposal(dropped.replace('"name":"Rock"', '"name":"Rock","script":"x"'), new Set(), ctx, forbidden), null);
  assert.match(forbidden.error, /script is unsupported/);
});

test('network failures remain reserved and are never automatically retried', async t => {
  const f = fixture(t), user = await actor(f), row = await connection(f, user); enable(f);
  const calls = fetchMock(t, () => { throw new Error(`private network error ${API_KEY}`); }), body = input();
  await assert.rejects(generate(f, user, row, body), error => reject(502, 'MODEL_NETWORK_FAILED')(error) && !error.message.includes(API_KEY));
  await assert.rejects(generate(f, user, row, body), reject(409, 'MODEL_REQUEST_PREVIOUSLY_FAILED'));
  assert.equal(f.sql.prepare('SELECT status FROM platform_model_requests').get().status, 'billing_unknown'); assert.equal(calls.length, 1);
});

test('timeouts abort request and retain ambiguous billing state', async t => {
  const f = fixture(t, { ENGINE_AI_TIMEOUT_MS: '10' }), user = await actor(f), row = await connection(f, user); enable(f);
  const calls = fetchMock(t, (_url, init) => new Promise((resolve, reject) => { init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }); }));
  await assert.rejects(generate(f, user, row, input()), reject(502, 'MODEL_TIMEOUT')); assert.equal(calls.length, 1);
  assert.equal(f.sql.prepare('SELECT status FROM platform_model_requests').get().status, 'billing_unknown');
});

test('provider rejection never exposes raw provider error or keys', async t => {
  const f = fixture(t), user = await actor(f), row = await connection(f, user); enable(f);
  fetchMock(t, () => new Response(JSON.stringify({ message: `Credential was ${API_KEY}` }), { status: 401 }));
  await assert.rejects(generate(f, user, row, input()), error => reject(502, 'MODEL_CREDENTIAL_REJECTED')(error) && !error.message.includes(API_KEY));
  assert.equal(f.sql.prepare('SELECT status FROM platform_model_requests').get().status, 'failed');
});

test('response size caps include streamed bodies and persist uncertain state', async t => {
  const f = fixture(t), user = await actor(f), row = await connection(f, user); enable(f);
  fetchMock(t, () => new Response('x'.repeat(1_048_577)));
  await assert.rejects(generate(f, user, row, input()), reject(502, 'MODEL_RESPONSE_TOO_LARGE'));
  assert.equal(f.sql.prepare('SELECT status FROM platform_model_requests').get().status, 'billing_unknown');
});

test('unparseable or unsafe model output remains inert text with null operations', async t => {
  const f = fixture(t), user = await actor(f), row = await connection(f, user); enable(f);
  fetchMock(t, () => upstream(openaiOutput(`<script>danger()</script> ${API_KEY}`)));
  const result = await (await generate(f, user, row, input())).json();
  assert.equal(result.operations, null); assert.equal(result.summary, null); assert.equal(result.text.includes(API_KEY), false);
  assert.match(result.text, /credential redacted/); assert.equal(f.sql.prepare('SELECT response_json FROM platform_model_requests').get().response_json.includes(API_KEY), false);
});

test('strict proposal parser accepts only bounded declarative operations and known entity IDs', () => {
  const allowed = new Set(['cube-1']); assert.deepEqual(parseProposal(JSON.stringify(proposal), allowed), proposal);
  assert.deepEqual(parseProposal('```json\n' + JSON.stringify(proposal) + '\n```', allowed), proposal);
  const add = { summary: 'Add a sphere.', operations: [{ op: 'add', entity: { name: 'Sphere', type: 'sphere', material: { color: '#12ABcd', roughness: 1 }, components: { spin: { speed: 0.5 } } } }] };
  assert.deepEqual(parseProposal(JSON.stringify(add), allowed), add);
  for (const operations of [
    [{ op: 'execute', script: 'evil()' }], [{ op: 'add', entity: { type: 'script', name: 'Evil' } }],
    [{ op: 'add', entity: { type: 'box', name: 'Box', url: 'https://evil.test' } }],
    [{ op: 'update', id: 'cube-1', patch: { components: { script: { code: 'evil()' } } } }],
    [{ op: 'update', id: 'cube-1', patch: { components: { rigidbody: { type: 'dynamic' }, spin: { speed: 1 } } } }],
    [{ op: 'add', entity: { type: 'box', name: 'Conflict', components: { rigidbody: { type: 'static' }, spin: { speed: 1 } } } }],
    [{ op: 'update', id: 'cube-1', patch: { rotation: [36001, 0, 0] } }],
    [{ op: 'update', id: 'cube-1', patch: { scale: [0, 1, 1] } }], [{ op: 'remove', id: 'unlisted' }],
    [{ op: 'update', id: 'cube-1', patch: { material: { color: 'javascript:evil()' } } }],
    Array(51).fill({ op: 'remove', id: 'cube-1' }),
  ]) assert.equal(parseProposal(JSON.stringify({ summary: 'Unsafe', operations }), allowed), null);
  assert.equal(parseProposal('{"summary":"Unsafe","operations":[],"__proto__":{}}'), null);
});

test('account erasure removes credentials and request results only for that account', async t => {
  const f = fixture(t), a = await actor(f), b = await actor(f), row = await connection(f, a); await connection(f, b); enable(f);
  fetchMock(t, () => upstream(openaiOutput())); await generate(f, a, row, input());
  await f.env.PLATFORM_DB.batch(modelConnectionErasureStatements(f.env, a.id));
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_model_requests WHERE user_id=?').get(a.id).n, 0);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_model_connections WHERE user_id=?').get(a.id).n, 0);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_model_connections WHERE user_id=?').get(b.id).n, 1);
  assert.ok(f.sql.prepare('SELECT COUNT(*) n FROM platform_audit WHERE actor_id=?').get(a.id).n > 0);
});

const recipe = () => ({ version: 1, seed: 'fixture-world-seed', operations: [
  { op: 'grid', entity: { name: 'Platform', type: 'box', components: { rigidbody: { type: 'static' } } },
    counts: [3, 2], spacing: [4, 4], origin: [0, 0, 0] },
] });
const recipeProposal = () => ({ summary: 'Build six editable platforms.', worldRecipe: recipe() });

test('scene context exposes truthful totals and opaque fingerprint without secrets', () => {
  const baseFingerprint = 'a'.repeat(64);
  const projected = projectSceneSummary({ ...scene, projectId: 'my-project', entityCount: 400, truncated: true, lightCount: 7,
    baseFingerprint, assets: [{ id: 'tree', name: 'Tree', mime: 'model/gltf-binary', url: 'https://private.test', apiKey: API_KEY }],
    assetCount: 200, assetsTruncated: true });
  assert.equal(projected.entityCount, 400); assert.equal(projected.truncated, true); assert.equal(projected.lightCount, 7);
  assert.equal(projected.projectId, 'my-project'); assert.equal(projected.baseFingerprint, baseFingerprint);
  assert.equal(projected.assetCount, 200); assert.equal(projected.assetsTruncated, true);
  assert.deepEqual(projected.assets, [{ id: 'tree', name: 'Tree', mime: 'model/gltf-binary' }]);
  assert.equal(JSON.stringify(projected).includes(API_KEY), false);
  const legacy = projectSceneSummary(scene); assert.equal(legacy.entityCount, 1); assert.equal(legacy.truncated, false);
  assert.deepEqual(legacy.assets, []); assert.equal(legacy.baseFingerprint, undefined);
  const largeTransforms = projectSceneSummary({ ...scene, entities: [{ ...scene.entities[0], position: [1000000, 0, -1000000], scale: [.001, 10000, 1] }] });
  assert.deepEqual(largeTransforms.entities[0].scale, [.001, 10000, 1]);
});

test('scene context rejects contradictory totals, fingerprint shape and malformed assets', () => {
  for (const extra of [
    { entityCount: 400 }, { entityCount: 400, truncated: true }, { entityCount: 0 }, { entityCount: 5001, truncated: true, lightCount: 0 },
    { truncated: true }, { lightCount: 33 }, { lightCount: 1 }, { baseFingerprint: 'not-a-hash' }, { baseFingerprint: null },
    { assets: {} }, { assets: [{ id: '../escape' }] }, { assets: [{ id: 'tree', mime: 'text/html' }] },
    { assets: [{ id: 'tree' }, { id: 'tree' }] }, { assetCount: 2 }, { assetsTruncated: true }, { assetCount: 501, assetsTruncated: true },
    { projectId: 'https://not-a-project' },
  ]) assert.throws(() => projectSceneSummary({ ...scene, ...extra }), reject(400));
});

test('real editor projection and backend projection agree for a large scene with omitted asset metadata', async () => {
  const project = { id: 'large-world', name: 'Large world', settings: scene.settings,
    entities: Array.from({ length: 400 }, (_, index) => ({ ...scene.entities[0], id: 'model-' + index,
      type: 'model', name: 'Tree ' + index, assetId: 'asset-499' })),
    assets: Array.from({ length: 500 }, (_, index) => ({ id: 'asset-' + index, name: 'Asset ' + index, mime: 'model/gltf-binary', sha256: 'a'.repeat(64) })) };
  const context = await modelSceneContext(project), projected = projectSceneSummary(context);
  assert.equal(projected.entityCount, 400); assert.equal(projected.assetCount, 500);
  assert.equal(projected.truncated, true); assert.equal(projected.assetsTruncated, true);
  assert.equal(projected.baseFingerprint, context.baseFingerprint); assert.equal(projected.entities[0].assetId, undefined);
  assert.ok(new TextEncoder().encode(JSON.stringify(projected)).length < 32768);
});

test('truncated asset lists never disclose or authorize omitted asset references', () => {
  const projected = projectSceneSummary({ ...scene, assets: [{ id: 'known' }], assetCount: 2, assetsTruncated: true,
    entities: [{ ...scene.entities[0], type: 'model', assetId: 'omitted' }] });
  assert.equal(projected.entities[0].assetId, undefined);
  const proposal = { summary: 'Unknown asset', worldRecipe: { version: 1, seed: 1,
    operations: [{ op: 'add', entity: { name: 'Model', type: 'model', assetId: 'omitted' } }] } };
  assert.equal(parseProposal(JSON.stringify(proposal), new Set(['cube-1']), projected), null);
  assert.throws(() => projectSceneSummary({ ...scene, entities: [{ ...scene.entities[0], assetId: 'missing' }] }), reject(400));
});

test('recipe parser accepts bounded seeded worlds and preserves legacy operations', () => {
  const parsed = parseProposal(JSON.stringify(recipeProposal()), new Set(['cube-1']), projectSceneSummary(scene));
  assert.equal(parsed.summary, 'Build six editable platforms.'); assert.equal(parsed.worldRecipe.seed, 'fixture-world-seed');
  assert.equal(parsed.worldRecipe.version, 1); assert.equal(parsed.worldRecipe.operations[0].op, 'grid');
  assert.equal(parsed.operations, undefined); assert.deepEqual(parseProposal(JSON.stringify(proposal), new Set(['cube-1'])), proposal);
});

test('recipe parser rejects mixed forms, execution fields, unknown asset IDs and excessive expansion', () => {
  const context = projectSceneSummary(scene), allowed = new Set(['cube-1']);
  const invalid = [
    { ...recipeProposal(), operations: [] }, { ...recipeProposal(), tool: 'execute' },
    { summary: 'No form' }, { ...recipeProposal(), worldRecipe: { ...recipe(), script: 'evil()' } },
    { ...recipeProposal(), worldRecipe: { ...recipe(), operations: [{ op: 'execute', code: 'evil()' }] } },
    { ...recipeProposal(), worldRecipe: { ...recipe(), operations: [{ op: 'add', entity: { type: 'model', name: 'Remote', assetId: 'unknown' } }] } },
    { ...recipeProposal(), worldRecipe: { ...recipe(), operations: [{ op: 'add', entity: { type: 'box', name: 'Unsafe', url: 'https://evil.test' } }] } },
    { ...recipeProposal(), worldRecipe: { ...recipe(), operations: [{ ...recipe().operations[0], counts: [1000, 1000] }] } },
    { ...recipeProposal(), worldRecipe: { ...recipe(), operations: Array(65).fill(recipe().operations[0]) } },
    { ...recipeProposal(), worldRecipe: { ...recipe(), operations: [{ op: 'add', entity: { type: 'box', name: 'Bad components', components: { player: { speed: 5 } } } }] } },
    { ...recipeProposal(), worldRecipe: { ...recipe(), operations: [{ op: 'add', entity: { type: 'box', name: 'Bad components', components: { rigidbody: { type: 'dynamic' }, spin: { speed: 1 } } } }] } },
  ];
  for (const value of invalid) assert.equal(parseProposal(JSON.stringify(value), allowed, context), null, JSON.stringify(value));
});

test('recipe validation uses complete scene entity and light totals beyond projected entities', () => {
  const full = projectSceneSummary({ ...scene, entityCount: 5000, truncated: true, lightCount: 0 });
  assert.equal(parseProposal(JSON.stringify(recipeProposal()), new Set(['cube-1']), full), null);
  const lights = projectSceneSummary({ ...scene, entityCount: 400, truncated: true, lightCount: 32 });
  const value = { summary: 'Light', worldRecipe: { version: 1, seed: 2,
    operations: [{ op: 'add', entity: { type: 'pointLight', name: 'Additional light' } }] } };
  assert.equal(parseProposal(JSON.stringify(value), new Set(['cube-1']), lights), null);
});

for (const provider of ['openai', 'anthropic', 'openrouter']) test(`${provider} returns reviewed recipe using only own key and existing asset context`, async t => {
  const f = fixture(t), user = await actor(f), row = await connection(f, user, provider); enable(f);
  const baseFingerprint = 'b'.repeat(64), value = { summary: 'Add the known tree.', worldRecipe: { version: 1, seed: 44,
    operations: [{ op: 'add', entity: { type: 'model', name: 'Tree', assetId: 'tree' } }] } };
  const calls = fetchMock(t, (_url, init) => {
    const sent = JSON.parse(init.body), instructions = sent.instructions || sent.system || sent.messages[0].content;
    assert.match(instructions, /worldRecipe/); assert.match(instructions, /truncated/); assert.match(instructions, /assetId/);
    assert.equal(sent.tools, undefined); assert.equal(JSON.stringify(sent).includes('private-asset-bytes'), false);
    assert.equal(provider === 'anthropic' ? init.headers['x-api-key'] : init.headers.authorization, provider === 'anthropic' ? API_KEY : `Bearer ${API_KEY}`);
    return upstream(provider === 'openai' ? openaiOutput(JSON.stringify(value)) : provider === 'anthropic' ?
      { content: [{ type: 'text', text: JSON.stringify(value) }] } : { choices: [{ message: { content: JSON.stringify(value) } }] });
  });
  const body = input({ sceneSummary: { ...scene, baseFingerprint, assets: [{ id: 'tree', name: 'Tree', embedded: 'private-asset-bytes' }] } });
  const result = await (await generate(f, user, row, body)).json();
  assert.equal(result.operations, null); assert.equal(result.worldRecipe.operations[0].entity.assetId, 'tree');
  assert.equal(result.baseFingerprint, baseFingerprint); assert.deepEqual(result.billing, MODEL_BILLING_POLICY);
  assert.deepEqual(result.sceneContext, { entityCount: 1, includedEntityCount: 1, lightCount: 0, truncated: false,
    assetCount: 1, includedAssetCount: 1, assetsTruncated: false });
  const replayed = await (await generate(f, user, row, body)).json();
  assert.equal(replayed.replayed, true); assert.deepEqual(replayed.worldRecipe, result.worldRecipe); assert.equal(calls.length, 1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_projects').get().n, 0);
});

test('scene fingerprint is echoed for legacy proposals and participates in spend idempotency', async t => {
  const f = fixture(t), user = await actor(f), row = await connection(f, user); enable(f);
  const calls = fetchMock(t, () => upstream(openaiOutput()));
  const body = input({ sceneSummary: { ...scene, baseFingerprint: 'c'.repeat(64) } });
  const result = await (await generate(f, user, row, body)).json();
  assert.equal(result.baseFingerprint, 'c'.repeat(64)); assert.equal(result.worldRecipe, null); assert.deepEqual(result.operations, proposal.operations);
  await assert.rejects(generate(f, user, row, { ...body, sceneSummary: { ...body.sceneSummary, baseFingerprint: 'd'.repeat(64) } }), reject(409, 'MODEL_IDEMPOTENCY_CONFLICT'));
  assert.equal(calls.length, 1);
});

test('invalid world recipes remain inert text and never create project or asset records', async t => {
  const f = fixture(t), user = await actor(f), row = await connection(f, user); enable(f);
  fetchMock(t, () => upstream(openaiOutput(JSON.stringify({ summary: 'Execute', worldRecipe: { version: 1, seed: 1,
    operations: [{ op: 'execute', script: 'evil()' }] } }))));
  const result = await (await generate(f, user, row, input())).json();
  assert.equal(result.operations, null); assert.equal(result.worldRecipe, null); assert.equal(result.summary, null);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_projects').get().n, 0);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_engine_assets').get().n, 0);
});

test('deleting a connection preserves request reservation and removes the encrypted credential', async t => {
  const f = fixture(t), user = await actor(f), row = await connection(f, user); enable(f);
  fetchMock(t, () => upstream(openaiOutput())); await generate(f, user, row, input());
  await call(f, user, `/model-connections/${row.id}`, 'DELETE', {});
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_model_connections').get().n, 0);
  const reserved = f.sql.prepare('SELECT * FROM platform_model_requests').get(); assert.equal(reserved.connection_id, null); assert.equal(reserved.status, 'succeeded');
});
