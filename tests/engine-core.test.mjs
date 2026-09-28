import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, cleanEntity, validateProject, validateProposal, VERSION, FORMAT } from '../engine/core/schema.mjs';
import { ProjectStore } from '../engine/core/project-store.mjs';
import { inspectGLB, hashBytes } from '../engine/core/gltf.mjs';
import { exportGameZip } from '../engine/player/export.mjs';
import { validateGameArchive } from '../platform/server/archive.mjs';
import { readFile } from 'node:fs/promises';

function project(entities = [], assets = []) { return { ...newProject('Test world'), entities: entities.map(cleanEntity), assets }; }
function glb(document = { asset: { version: '2.0' } }, chunks = []) {
  let json = Buffer.from(JSON.stringify(document)); while (json.length % 4) json = Buffer.concat([json, Buffer.from(' ')]);
  const parts = [{ type: 0x4e4f534a, bytes: json }, ...chunks].map(({ type, bytes }) => { const chunk = Buffer.alloc(8 + bytes.length); chunk.writeUInt32LE(bytes.length, 0); chunk.writeUInt32LE(type, 4); Buffer.from(bytes).copy(chunk, 8); return chunk; });
  const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + parts.reduce((sum, p) => sum + p.length, 0), 8); return Buffer.concat([header, ...parts]);
}

test('new projects use versioned format and bounded known components', () => {
  const p = newProject('World'); assert.equal(p.format, FORMAT); assert.equal(p.version, VERSION); assert.equal(validateProject(p).name, 'World');
  const e = cleanEntity({ type: 'box', position: [Infinity, NaN, -1e20], scale: [0, -1, 1e20], components: { execute: { code: 'throw 1' }, player: { speed: 999, jump: -1 }, rigidbody: { type: 'dynamic' } } });
  assert.deepEqual(e.position, [0, .5, -1e6]); assert.deepEqual(e.scale, [.001, .001, 10000]); assert.deepEqual(Object.keys(e.components).sort(), ['player', 'rigidbody']); assert.equal(e.components.player.speed, 50); assert.equal(e.components.player.jump, 0);
});
test('imports and proposals enforce player and spin physics requirements', () => {
  for(const components of [{player:{}},{player:{},rigidbody:{type:'static'}},{spin:{},rigidbody:{type:'dynamic'}}])assert.throws(()=>cleanEntity({type:'box',components}),/player|Spin/i);
  for(const type of ['camera','pointLight','directionalLight','empty'])assert.throws(()=>cleanEntity({type,components:{player:{},rigidbody:{type:'dynamic'}}}),/player/i);
  assert.throws(()=>validateProposal({operations:[{op:'add',entity:{type:'box',components:{player:{}}}}]}),/player/i);
  const store=new ProjectStore(project([{type:'box',id:'player',components:{player:{},rigidbody:{type:'dynamic'}}}]));const before=store.snapshot();
  assert.throws(()=>store.apply({operations:[{op:'update',id:'player',patch:{components:{player:{}}}}]}),/player/i);assert.deepEqual(store.snapshot(),before);
});
test('hierarchy preserves known parents and rejects missing parents, cycles and duplicate IDs', () => {
  const p = project([{ type: 'empty', id: 'root' }, { type: 'box', id: 'child', parentId: 'root' }]); assert.equal(validateProject(p).entities[1].parentId, 'root');
  const missing = structuredClone(p); missing.entities[1].parentId = 'missing'; assert.throws(() => validateProject(missing), /parent/i);
  const cycle = structuredClone(p); cycle.entities[0].parentId = 'child'; assert.throws(() => validateProject(cycle), /cycle|hierarchy/i);
  const self = structuredClone(p); self.entities[0].parentId = 'root'; assert.throws(() => validateProject(self), /cycle|hierarchy/i);
  const duplicate = structuredClone(p); duplicate.entities[1].id = 'root'; assert.throws(() => validateProject(duplicate), /duplicate/i);
});
test('model references must resolve unique assets; remote URLs outside catalog are stripped', () => {
  const p = project([{ type: 'model', id: 'm', assetId: 'a' }], [{ id: 'a', name: 'asset', source: 'remote', url: 'https://evil.test/asset.glb', mime: 'text/html' }]);
  const checked = validateProject(p); assert.equal(checked.assets[0].source, 'local'); assert.equal(checked.assets[0].mime, 'model/gltf-binary'); assert.equal(checked.assets[0].url, undefined);
  assert.throws(() => validateProject({ ...p, assets: [] }), /reference/i); assert.throws(() => validateProject({ ...p, assets: [p.assets[0], p.assets[0]] }), /duplicate/i);
});
test('project entity and asset bounds and unsupported versions reject', () => {
  assert.throws(() => validateProject({ ...newProject(), version: 999 }), /version/i);
  assert.throws(() => validateProject({ ...newProject(), entities: Array.from({ length: 5001 }, () => ({ type: 'box' })) }), /limit/i);
  assert.throws(() => validateProject({ ...newProject(), assets: Array.from({ length: 501 }, () => ({})) }), /limit/i);
});
test('deep hierarchy is rejected within a bounded traversal', () => {
  const entities = Array.from({ length: 70 }, (_, i) => ({ type: 'empty', id: 'entity' + i, parentId: i ? 'entity' + (i - 1) : null }));
  assert.throws(() => validateProject(project(entities)), /hierarchy|levels/i);
});
test('project accepts 32 combined point/directional lights and rolls back a 33rd light', () => {
  const entities = Array.from({ length: 32 }, (_, i) => ({ type: i % 2 ? 'pointLight' : 'directionalLight', id: 'light' + i }));
  entities.push({ type: 'box', id: 'ordinary-mesh' });
  const p = validateProject(project(entities)); assert.equal(p.entities.length, 33, 'Non-light entities do not consume the light limit');
  assert.throws(() => validateProject(project([...entities, { type: 'pointLight', id: 'extra-light' }])), /32.*lights/i);
  const store = new ProjectStore(p), before = store.snapshot(); assert.throws(() => store.add('directionalLight'), /32.*lights/i); assert.deepEqual(store.snapshot(), before); assert.equal(store.past.length, 0);
});
test('legacy migration retains script text as inert source, converts radians and keeps solid objects', () => {
  globalThis.__crateLegacyExecuted = false;
  const legacy = { format: 'crate-engine-project', version: 3, name: 'Old scene', objects: [{ id: 'cube', name: 'Legacy', rotation: [0, Math.PI, 0], userData: { isSolid: true }, script: 'globalThis.__crateLegacyExecuted=true;' }] };
  const p = validateProject(legacy); assert.equal(p.format, FORMAT); assert.equal(p.version, VERSION); assert.equal(p.entities[0].rotation[1], 180); assert.equal(p.entities[0].components.rigidbody.type, 'static'); assert.deepEqual(p.legacySource, legacy); assert.equal(globalThis.__crateLegacyExecuted, false); delete globalThis.__crateLegacyExecuted;
  assert.equal(p.entities[0].script, undefined); assert.ok(p.migrationWarnings.length);
});
test('legacy migration applies current duplicate and asset bounds', () => {
  assert.throws(() => validateProject({ format: 'crate-engine-project', version: 3, objects: [{ id: 'same' }, { id: 'same' }] }), /duplicate/i);
  assert.throws(() => validateProject({ format: 'crate-engine-project', version: 3, objects: Array.from({ length: 501 }, (_, i) => ({ id: 'obj' + i, assetPath: `models/${i}.glb` })) }), /limit/i);
});
test('store commits are isolated snapshots with bounded undo and redo', () => {
  const store = new ProjectStore(); const id = store.add('box', { name: 'Cube' }); store.update(id, { position: [1, 2, 3] });
  const snapshot = store.snapshot(); snapshot.entities[0].position[0] = 100; assert.equal(store.project.entities[0].position[0], 1);
  assert.equal(store.undo(), true); assert.equal(store.project.entities[0].position[0], 0); assert.equal(store.redo(), true); assert.equal(store.project.entities[0].position[0], 1);
  store.undo(); store.update(id, { name: 'Changed' }); assert.equal(store.redo(), false);
  for (let i = 0; i < 100; i++) store.update(id, { name: 'Cube ' + i }); assert.equal(store.past.length, 80);
});
test('invalid store commit or multi-operation proposal rolls back all changes and history', () => {
  const store = new ProjectStore(project([{ type: 'box', id: 'cube', name: 'Before' }])); const before = store.snapshot();
  assert.throws(() => store.apply({ operations: [{ op: 'update', id: 'cube', patch: { name: 'After' } }, { op: 'update', id: 'missing', patch: { name: 'Fail' } }] }), /no longer present/i);
  assert.deepEqual(store.snapshot(), before); assert.equal(store.past.length, 0);
  assert.throws(() => store.commit('Invalid parent', p => p.entities[0].parentId = 'missing'), /parent/i); assert.deepEqual(store.snapshot(), before);
});
test('explicit deletion includes descendants and undo restores hierarchy', () => {
  const store = new ProjectStore(project([{ type: 'empty', id: 'root' }, { type: 'empty', id: 'child', parentId: 'root' }, { type: 'box', id: 'grand', parentId: 'child' }, { type: 'box', id: 'other' }]));
  store.remove('root'); assert.deepEqual(store.project.entities.map(e => e.id), ['other']); store.undo(); assert.equal(store.project.entities.length, 4); assert.equal(store.project.entities[2].parentId, 'child');
});
test('AI proposals cannot execute code, import remote models or mutate project identity', () => {
  for (const proposal of [{ operations: [{ op: 'execute', code: 'process.exit()' }] }, { operations: [{ op: 'add', entity: { type: 'model', assetId: 'remote' } }] }, { operations: [{ op: 'update', id: 'a', patch: { id: 'b' } }] }, { operations: [{ op: 'update', id: 'a', patch: { parentId: 'b' } }] }, { operations: Array.from({ length: 51 }, () => ({ op: 'remove', id: 'a' })) }]) assert.throws(() => validateProposal(proposal));
});
test('valid proposal uses one undo step and requires children removed before their parent', () => {
  const store = new ProjectStore(project([{ type: 'empty', id: 'root' }, { type: 'box', id: 'child', parentId: 'root' }]));
  assert.throws(() => store.apply({ operations: [{ op: 'remove', id: 'root' }] }), /child/i); assert.equal(store.past.length, 0);
  store.apply({ summary: 'Remove hierarchy', operations: [{ op: 'remove', id: 'child' }, { op: 'remove', id: 'root' }] }); assert.equal(store.project.entities.length, 0); assert.equal(store.past.length, 1); store.undo(); assert.equal(store.project.entities.length, 2);
});
test('GLB inspection accepts valid binary, respects typed-array offset and hashes exact bytes', async () => {
  const bytes = glb(), wrapped = Buffer.concat([Buffer.from([1, 2]), bytes, Buffer.from([3])]); const view = wrapped.subarray(2, -1);
  assert.equal(inspectGLB(view).document.asset.version, '2.0'); assert.equal((await hashBytes(view)).length, 64); assert.equal(await hashBytes(view), await hashBytes(bytes));
  assert.equal(inspectGLB(glb({ asset: { version: '2.0' }, buffers: [{ byteLength: 4 }] }, [{ type: 0x004e4942, bytes: Buffer.alloc(4) }])).bytes.length > 20, true);
});
test('GLB inspection rejects external image/buffer resources including executable and local URLs', () => {
  for (const uri of ['https://evil.test/model.bin', '//evil.test/texture.png', 'file:///C:/secret', 'javascript:alert(1)', 'data:text/html;base64,AAAA', 'data:image/svg+xml;base64,AAAA']) {
    assert.throws(() => inspectGLB(glb({ asset: { version: '2.0' }, buffers: [{ byteLength: 4, uri }] })), /external|embed|resource|buffer/i);
    assert.throws(() => inspectGLB(glb({ asset: { version: '2.0' }, images: [{ uri }] })), /external|embed|resource|image|texture/i);
  }
});
test('GLB inspection rejects malformed size, version, trailing and duplicate JSON', () => {
  const wrongSize = glb(); wrongSize.writeUInt32LE(1, 8); assert.throws(() => inspectGLB(wrongSize));
  const wrongVersion = glb(); wrongVersion.writeUInt32LE(1, 4); assert.throws(() => inspectGLB(wrongVersion));
  assert.throws(() => inspectGLB(Buffer.concat([glb(), Buffer.from([1])])));
  assert.throws(() => inspectGLB(glb({}, [{ type: 0x4e4f534a, bytes: Buffer.from('{}  ') }])));
});
test('GLB inspection enforces JSON first, known chunks, one BIN and valid buffer lengths', () => {
  assert.throws(() => inspectGLB(glb({ asset: { version: '2.0' } }, [{ type: 1234, bytes: Buffer.alloc(4) }])));
  assert.throws(() => inspectGLB(glb({ asset: { version: '2.0' } }, [{ type: 0x004e4942, bytes: Buffer.alloc(4) }, { type: 0x004e4942, bytes: Buffer.alloc(4) }])));
  assert.throws(() => inspectGLB(glb({ asset: { version: '2.0' }, buffers: [{ byteLength: 1000 }] }, [{ type: 0x004e4942, bytes: Buffer.alloc(4) }])));
  assert.throws(() => inspectGLB(glb({ asset: { version: '2.0' }, buffers: [{ byteLength: 4, uri: '' }] })));
  const valid = glb({ asset: { version: '2.0' } }, [{ type: 0x004e4942, bytes: Buffer.alloc(4) }]); const size = valid.readUInt32LE(12) + 8; const reordered = Buffer.concat([valid.subarray(0, 12), valid.subarray(12 + size), valid.subarray(12, 12 + size)]); assert.throws(() => inspectGLB(reordered));
});
test('GLB inspection rejects malformed buffer views and invalid UTF8 JSON', () => {
  assert.throws(() => inspectGLB(glb({ asset: { version: '2.0' }, buffers: [{ byteLength: 4 }], bufferViews: [{ buffer: 0, byteOffset: 2, byteLength: 4 }] }, [{ type: 0x004e4942, bytes: Buffer.alloc(4) }])));
  assert.throws(() => inspectGLB(glb({ asset: { version: '2.0' }, images: [{ bufferView: 10, mimeType: 'image/png' }] })));
  const bytes = glb({ asset: { version: '2.0' }, name: 'X' }); const index = bytes.indexOf(Buffer.from('X')); bytes[index] = 0xff; assert.throws(() => inspectGLB(bytes));
});
test('web export packages the actual built runtime, exact models and licenses without private asset references', async t => {
  const original = globalThis.fetch; t.after(() => globalThis.fetch = original);
  globalThis.fetch = async url => {
    const files = { '/engine/distribution/game-runtime.js': '../engine/distribution/game-runtime.js', '/engine/distribution/THIRD-PARTY.txt': '../engine/distribution/THIRD-PARTY.txt' };
    assert.ok(files[url], 'Export must not request providers or cloud data itself'); return new Response(await readFile(new URL(files[url], import.meta.url)));
  };
  const bytes = glb(), p = project([{ type: 'model', id: 'model', assetId: 'asset' }], [{ id: 'asset', name: 'Cube', source: 'local', cloudId: 'private-cloud-id', embedded: 'private-bytes', url: 'https://crateship-games-assets.pages.dev/model.glb', legacyPath: 'old.glb' }]);
  p.legacySource = { script: 'globalThis.secret = true;' }; p.migrationWarnings = ['Legacy source'];
  const result = await exportGameZip(p, async () => bytes); assert.match(result.filename, /-web\.zip$/);
  const archive = await validateGameArchive(new Uint8Array(await result.blob.arrayBuffer())); assert.equal(archive.entryPoint, 'index.html');
  assert.ok(archive.files.has('game-runtime.js')); assert.ok(archive.files.has('THIRD-PARTY.txt')); assert.deepEqual(Buffer.from(archive.files.get('assets/asset.glb')), bytes);
  const exported = JSON.parse(new TextDecoder().decode(archive.files.get('project.json'))); assert.equal(exported.legacySource, undefined); assert.equal(exported.migrationWarnings, undefined);
  for (const key of ['cloudId', 'url', 'embedded', 'legacyPath']) assert.equal(exported.assets[0][key], undefined);
  assert.equal(p.assets[0].cloudId, 'private-cloud-id', 'Export must not mutate authoring state');
});
