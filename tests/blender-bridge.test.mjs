import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createAssetBridge } from '../integrations/blender/bridge.mjs';

const origin = 'http://127.0.0.1:4173';
function glb(document = { asset: { version: '2.0' }, scenes: [{ nodes: [] }], scene: 0 }) {
  let json = Buffer.from(JSON.stringify(document)); while (json.length % 4) json = Buffer.concat([json, Buffer.from(' ')]);
  const bytes = Buffer.alloc(20 + json.length); bytes.writeUInt32LE(0x46546c67, 0); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8); bytes.writeUInt32LE(json.length, 12); bytes.writeUInt32LE(0x4e4f534a, 16); json.copy(bytes, 20); return bytes;
}
async function fixture(t) {
  const bridge = createAssetBridge({ port: 0, origin }); const address = await bridge.listen(); t.after(() => bridge.close());
  const base = `http://127.0.0.1:${address.port}`, headers = { origin, authorization: `Bearer ${bridge.token}` };
  return { bridge, address, base, headers, get: (path = '/status', extra = {}) => fetch(base + path, { headers: { ...headers, ...extra } }),
    post: (bytes = glb(), extra = {}) => fetch(base + '/assets', { method: 'POST', headers: { authorization: headers.authorization, 'content-type': 'model/gltf-binary', ...extra }, body: bytes }) };
}

test('bridge binds only loopback with a fresh per-start 256-bit pairing token', async t => {
  const f = await fixture(t), second = await fixture(t); assert.equal(f.address.address, '127.0.0.1'); assert.match(f.bridge.token, /^[A-Za-z0-9_-]{43}$/); assert.notEqual(f.bridge.token, second.bridge.token);
  assert.deepEqual(await (await f.get()).json(), { ok: true, protocol: 1, assetCount: 0, maxAssetBytes: 16777216 });
});
test('bridge transfers real GLB bytes, integrity metadata and fixed MIME', async t => {
  const f = await fixture(t), bytes = glb(), response = await f.post(bytes, { 'x-asset-name': encodeURIComponent('Cube selection') }); assert.equal(response.status, 201);
  const { asset } = await response.json(); assert.equal(asset.name, 'Cube selection'); assert.equal(asset.sha256, createHash('sha256').update(bytes).digest('hex'));
  const list = await (await f.get('/assets')).json(); assert.equal(list.latestId, asset.id); assert.equal(list.assets[0].size, bytes.length); assert.equal(list.assets[0].bytes, undefined);
  const download = await f.get('/assets/' + asset.id); assert.equal(download.headers.get('content-type'), 'model/gltf-binary'); assert.equal(download.headers.get('x-content-type-options'), 'nosniff'); assert.equal(download.headers.get('access-control-allow-origin'), origin); assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
});
test('bridge bounds retained assets to the latest four', async t => {
  const f = await fixture(t); const ids = []; for (let i = 0; i < 5; i++) ids.push((await (await f.post()).json()).asset.id);
  assert.deepEqual((await (await f.get('/assets')).json()).assets.map(x => x.id), ids.slice(1).reverse()); assert.equal((await f.get('/assets/' + ids[0])).status, 404);
});
for (const [label, headers, expected] of [
  ['unpaired request', { authorization: '' }, 401], ['bad token', { authorization: 'Bearer wrong' }, 401],
  ['foreign browser origin', { origin: 'https://evil.test' }, 403], ['opaque browser origin', { origin: 'null' }, 403],
  ['DNS rebinding Host', { host: 'evil.test' }, 403], ['alternate localhost Host', { host: 'localhost:9877' }, 403],
]) test(`bridge rejects ${label}`, async t => {
  const f = await fixture(t);
  // Fetch normalizes Host; use the native HTTP client to actually exercise rebinding headers.
  const status = await new Promise((resolve, reject) => { const req = http.request(f.base + '/status', { headers: { ...f.headers, ...headers } }, response => { response.resume(); resolve(response.statusCode); }); req.on('error', reject); req.end(); });
  assert.equal(status, expected);
});
test('native GET is forbidden even when paired; addon POST is permitted', async t => { const f = await fixture(t); assert.equal((await fetch(f.base + '/status', { headers: { authorization: f.headers.authorization } })).status, 403); assert.equal((await f.post()).status, 201); });
test('strict CORS preflight allows only configured app and known headers', async t => {
  const f = await fixture(t); const request = headers => fetch(f.base + '/assets', { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization', ...headers } });
  const allowed = await request({}); assert.equal(allowed.status, 204); assert.equal(allowed.headers.get('access-control-allow-origin'), origin); assert.equal(allowed.headers.get('access-control-allow-credentials'), null);
  assert.equal((await request({ origin: 'https://evil.test' })).status, 403); assert.equal((await request({ 'access-control-request-headers': 'x-execute-python' })).status, 403);
});
for (const path of ['/assets?token=secret', '/assets/../../settings', '/assets/%2e%2e', '/assets/C:/file.glb', '/status/']) test(`bridge rejects non-contract path ${path}`, async t => { const f = await fixture(t); assert.equal((await f.get(path)).status, 403); });
test('bridge rejects HTML, glTF external resource, malformed MIME and invalid names', async t => {
  const f = await fixture(t); assert.equal((await f.post(Buffer.from('<html>executable</html>'))).status, 400);
  assert.equal((await f.post(glb({ asset: { version: '2.0' }, buffers: [{ byteLength: 1, uri: 'https://evil.test/file' }] }))).status, 400);
  assert.equal((await f.post(glb(), { 'content-type': 'text/html' })).status, 415);
  assert.equal((await f.post(glb(), { 'x-asset-name': '../secret.glb' })).status, 400);
  assert.equal((await f.post(glb(), { 'x-asset-name': '%' })).status, 400);
});
test('bridge rejects oversized body before accepting asset', async t => { const f = await fixture(t); assert.equal((await f.post(Buffer.alloc(16 * 1024 * 1024 + 1))).status, 413); assert.equal((await (await f.get('/assets')).json()).assets.length, 0); });
test('app origin configuration rejects URL credentials, paths and nonlocal HTTP', () => {
  for (const value of ['https://app.test/', 'http://evil.test', 'https://user:password@app.test', 'https://app.test/path']) assert.throws(() => createAssetBridge({ origin: value }));
});

async function mcpFixture(t, allowEdit = false) {
  const received = [], token = 'a'.repeat(43);
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    received.push({ path: req.url, auth: req.headers.authorization, origin: req.headers.origin, body: JSON.parse(body) });
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ result: { objectCount: 1, objects: [{ name: 'Cube', type: 'MESH' }] } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../integrations/blender/mcp-server.mjs', import.meta.url))], { env: { ...process.env, CRATESHIP_BLENDER_TOKEN: token, CRATESHIP_BLENDER_PORT: String(server.address().port), CRATESHIP_BLENDER_ALLOW_EDIT: String(allowEdit) }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  t.after(async () => { child.kill(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  let partial = '', errors = ''; const responses = [], waiters = [];
  child.stderr.on('data', data => errors += data);
  child.stdout.on('data', data => { partial += data; let index; while ((index = partial.indexOf('\n')) >= 0) { const line = partial.slice(0, index); partial = partial.slice(index + 1); const response = JSON.parse(line); responses.push(response); for (const waiter of [...waiters]) if (response.id === waiter.id) { waiters.splice(waiters.indexOf(waiter), 1); clearTimeout(waiter.timer); waiter.resolve(response); } } });
  const rpc = message => new Promise((resolve, reject) => { const waiter = { id: message.id, resolve, timer: setTimeout(() => reject(new Error('MCP subprocess response timed out: ' + errors)), 5000) }; waiters.push(waiter); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n'); });
  return { child, received, responses, rpc, async init() { const result = await rpc({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }); assert.equal(result.result.protocolVersion, '2025-06-18'); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n'); } };
}
test('real stdio MCP subprocess initializes, lists bounded tools and calls loopback addon', async t => {
  const f = await mcpFixture(t); await f.init(); const list = await f.rpc({ id: 2, method: 'tools/list' }); assert.deepEqual(list.result.tools.map(x => x.name), ['get_scene_info', 'list_assets', 'export_selected']);
  const response = await f.rpc({ id: 3, method: 'tools/call', params: { name: 'get_scene_info', arguments: {} } }); assert.equal(JSON.parse(response.result.content[0].text).objectCount, 1);
  assert.equal(f.received[0].path, '/command'); assert.equal(f.received[0].origin, undefined); assert.deepEqual(f.received[0].body, { command: 'get_scene_info', arguments: {} });
});
test('MCP rejects pre-init access, arbitrary Python, paths, unsupported edits and replay IDs', async t => {
  const f = await mcpFixture(t); assert.equal((await f.rpc({ id: 99, method: 'tools/list' })).error.code, -32000); await f.init();
  for (const [index, params] of [{ name: 'execute_python', arguments: { code: 'import os' } }, { name: 'export_selected', arguments: { path: 'C:/secrets' } }, { name: 'apply_object_operations', arguments: { operations: [] } }].entries()) assert.equal((await f.rpc({ id: 10 + index, method: 'tools/call', params })).error.code, -32602);
  assert.equal((await f.rpc({ id: 99, method: 'tools/list' })).error.code, -32600); assert.equal(f.received.length, 0);
});
test('MCP opt-in edits accept only bounded transforms and primitives', async t => {
  const f = await mcpFixture(t, true); await f.init();
  const valid = { operations: [{ operation: 'transform', name: 'Cube', location: [1, 2, 3] }] };
  assert.ok((await f.rpc({ id: 2, method: 'tools/call', params: { name: 'apply_object_operations', arguments: valid } })).result);
  for (const [i, op] of [{ operation: 'delete', name: 'Cube' }, { operation: 'transform', name: 'Cube', scale: [-1, 1, 1] }, { operation: 'add_primitive', name: 'Cube', primitive: 'SCRIPT' }, { operation: 'transform', name: 'Cube', location: [1e100, 0, 0] }].entries()) assert.equal((await f.rpc({ id: i + 3, method: 'tools/call', params: { name: 'apply_object_operations', arguments: { operations: [op] } } })).error.code, -32602);
  assert.equal(f.received.length, 1);
});
test('actual headless Blender addon registers, exports GLB and exercises native command guards', { skip: !process.env.BLENDER_EXECUTABLE, timeout: 120000 }, async t => {
  const f = await fixture(t);
  const child = spawn(process.env.BLENDER_EXECUTABLE, ['--background', '--factory-startup', '--disable-autoexec', '--python-exit-code', '2', '--python', fileURLToPath(new URL('../integrations/blender/headless-check.py', import.meta.url))], { env: { ...process.env, CRATESHIP_TEST_BRIDGE_PORT: String(f.address.port), CRATESHIP_TEST_BRIDGE_TOKEN: f.bridge.token }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  t.after(() => child.kill()); let log = ''; child.stdout.on('data', x => { log += x; }); child.stderr.on('data', x => { log += x; });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); }); assert.equal(code, 0, log.slice(-5000)); assert.match(log, /CRATESHIP_HEADLESS_OK/);
  const list = await (await f.get('/assets')).json(); assert.equal(list.assets.length, 1); assert.equal(list.assets[0].name, 'Headless test cube');
  const bytes = new Uint8Array(await (await f.get('/assets/' + list.latestId)).arrayBuffer()); assert.equal(Buffer.from(bytes).readUInt32LE(0), 0x46546c67); assert.equal(list.assets[0].sha256, createHash('sha256').update(bytes).digest('hex'));
});
test('Python addon transport and validation with explicit mocked bpy and a real local bridge', { timeout: 20000 }, async t => {
  const f = await fixture(t);
  const child = spawn(process.env.PYTHON_EXECUTABLE || 'python', [fileURLToPath(new URL('../integrations/blender/addon-check.py', import.meta.url))], { env: { ...process.env, CRATESHIP_TEST_BRIDGE_PORT: String(f.address.port), CRATESHIP_TEST_BRIDGE_TOKEN: f.bridge.token, PYTHONDONTWRITEBYTECODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  t.after(() => child.kill()); let log = ''; child.stdout.on('data', x => { log += x; }); child.stderr.on('data', x => { log += x; });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); }); assert.equal(code, 0, log.slice(-5000)); assert.match(log, /CRATESHIP_ADDON_MOCK_OK/);
  const list = await (await f.get('/assets')).json(); assert.equal(list.assets[0].name, 'Python transfer test');
});
