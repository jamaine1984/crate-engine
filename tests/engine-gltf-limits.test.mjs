import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshoptEncoder } from 'meshoptimizer';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { inspectGLB, MAX_DECODED_GEOMETRY_BYTES } from '../engine/core/gltf.mjs';

const EXT = 'EXT_meshopt_compression';
const pad = bytes => { const result = Buffer.alloc(Math.ceil(bytes.length / 4) * 4); Buffer.from(bytes).copy(result); return result; };
function glb(document, binary = Buffer.alloc(0)) {
  const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, ...document }));
  const jsonPadded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(jsonPadded);
  const bin = pad(binary), result = Buffer.alloc(20 + jsonPadded.length + (bin.length ? 8 + bin.length : 0));
  result.writeUInt32LE(0x46546c67); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(jsonPadded.length, 12); result.writeUInt32LE(0x4e4f534a, 16); jsonPadded.copy(result, 20);
  if (bin.length) { result.writeUInt32LE(bin.length, 20 + jsonPadded.length); result.writeUInt32LE(0x004e4942, 24 + jsonPadded.length); bin.copy(result, 28 + jsonPadded.length); }
  return result;
}
const parse = bytes => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
async function compressedFixture(extension = EXT) {
  await MeshoptEncoder.ready;
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices = new Uint16Array([0, 1, 2]);
  const vertexData = MeshoptEncoder.encodeGltfBuffer(new Uint8Array(positions.buffer), 3, 12, 'ATTRIBUTES');
  const indexData = MeshoptEncoder.encodeGltfBuffer(new Uint8Array(indices.buffer), 3, 2, 'TRIANGLES');
  const paddedVertex = pad(vertexData), binary = Buffer.concat([paddedVertex, indexData]);
  const document = {
    extensionsUsed: [extension], extensionsRequired: [extension],
    buffers: [{ byteLength: binary.length }, { byteLength: 42, extensions: { [extension]: { fallback: true } } }],
    bufferViews: [
      { buffer: 1, byteLength: 36, byteStride: 12, extensions: { [extension]: { buffer: 0, byteLength: vertexData.length, byteStride: 12, count: 3, mode: 'ATTRIBUTES' } } },
      { buffer: 1, byteOffset: 36, byteLength: 6, extensions: { [extension]: { buffer: 0, byteOffset: paddedVertex.length, byteLength: indexData.length, byteStride: 2, count: 3, mode: 'TRIANGLES' } } },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
  };
  return { document, binary, positions, indices };
}

for (const extension of [EXT, 'KHR_meshopt_compression']) test(`real ${extension} GLB fallback decodes through Three GLTFLoader`, async () => {
  const fixture = await compressedFixture(extension), bytes = glb(fixture.document, fixture.binary);
  const inspected = inspectGLB(bytes); assert.ok(inspected.decodedGeometryBytes < MAX_DECODED_GEOMETRY_BYTES);
  const loaded = await parse(bytes), geometry = loaded.scene.children[0].geometry;
  assert.deepEqual(Array.from(geometry.attributes.position.array), Array.from(fixture.positions));
  assert.deepEqual(Array.from(geometry.index.array), Array.from(fixture.indices)); geometry.dispose(); loaded.scene.children[0].material.dispose();
});

test('untagged required placeholder buffer is valid and decodes', async () => {
  const f = await compressedFixture(); delete f.document.buffers[1].extensions;
  const bytes = glb(f.document, f.binary); inspectGLB(bytes); const loaded = await parse(bytes);
  assert.equal(loaded.scene.children[0].geometry.attributes.position.count, 3);
  loaded.scene.children[0].geometry.dispose(); loaded.scene.children[0].material.dispose();
});

for (const [name, edit] of [
  ['huge count', d => d.bufferViews[0].extensions[EXT].count = Number.MAX_SAFE_INTEGER],
  ['fractional count', d => d.bufferViews[0].extensions[EXT].count = 3.5],
  ['zero count', d => d.bufferViews[0].extensions[EXT].count = 0],
  ['string count', d => d.bufferViews[0].extensions[EXT].count = '3'],
  ['oversized stride', d => d.bufferViews[0].extensions[EXT].byteStride = 260],
  ['nonaligned attributes', d => { d.bufferViews[0].byteLength = 9; delete d.bufferViews[0].byteStride; d.bufferViews[0].extensions[EXT].byteStride = 3; }],
  ['stride mismatch', d => d.bufferViews[0].byteStride = 16],
  ['unknown mode', d => d.bufferViews[0].extensions[EXT].mode = 'EXECUTE'],
  ['unknown filter', d => d.bufferViews[0].extensions[EXT].filter = 'EXECUTE'],
  ['octahedral stride', d => d.bufferViews[0].extensions[EXT].filter = 'OCTAHEDRAL'],
  ['quaternion stride', d => d.bufferViews[0].extensions[EXT].filter = 'QUATERNION'],
  ['triangles filter', d => d.bufferViews[1].extensions[EXT].filter = 'EXPONENTIAL'],
  ['triangles count', d => { d.buffers[1].byteLength = 44; d.bufferViews[1].byteLength = 8; d.bufferViews[1].extensions[EXT].count = 4; }],
  ['negative compressed offset', d => d.bufferViews[0].extensions[EXT].byteOffset = -1],
  ['compressed range overflow', d => d.bufferViews[0].extensions[EXT].byteLength = Number.MAX_SAFE_INTEGER],
  ['missing source buffer', d => d.bufferViews[0].extensions[EXT].buffer = 9],
  ['fallback used as source', d => d.bufferViews[0].extensions[EXT].buffer = 1],
  ['missing required declaration', d => delete d.extensionsRequired],
  ['missing used declaration', d => delete d.extensionsUsed],
  ['uncompressed placeholder reference', d => d.bufferViews.push({ buffer: 1, byteLength: 4 })],
  ['unused placeholder', d => d.buffers.push({ byteLength: 4 })],
  ['ambiguous compression extensions', d => d.bufferViews[0].extensions.KHR_meshopt_compression = { ...d.bufferViews[0].extensions[EXT] }],
]) test(`rejects meshopt ${name} before decoding`, async () => {
  const f = await compressedFixture(); edit(f.document); assert.throws(() => inspectGLB(glb(f.document, f.binary)));
});

test('combined decoded views cannot each consume the whole geometry budget', () => {
  const size = 72_000_000, view = { buffer: 1, byteLength: size, extensions: { [EXT]: { buffer: 0, byteLength: 4, byteStride: 12, count: size / 12, mode: 'ATTRIBUTES' } } };
  const document = { extensionsUsed: [EXT], extensionsRequired: [EXT], buffers: [{ byteLength: 4 }, { byteLength: size }], bufferViews: [view, structuredClone(view)] };
  const bytes = glb(document, Buffer.alloc(4)); assert.ok(bytes.length < 1024);
  assert.throws(() => inspectGLB(bytes), /decoded geometry limit/);
});

test('zero-initialized accessor arrays share the aggregate decoded allocation budget', () => {
  const accessor = { componentType: 5126, type: 'SCALAR', count: 20_000_000 };
  assert.throws(() => inspectGLB(glb({ accessors: [accessor, accessor] })), /decoded geometry limit/);
  assert.throws(() => inspectGLB(glb({ accessors: [{ ...accessor, count: Number.MAX_SAFE_INTEGER }] })), /decoded geometry limit/);
});

function sparseFixture() {
  const binary = Buffer.alloc(16); binary.writeUInt8(2, 0); new Uint8Array(new Float32Array([1, 2, 3]).buffer).forEach((v, i) => binary[i + 4] = v);
  return { binary, document: { buffers: [{ byteLength: 16 }], bufferViews: [{ buffer: 0, byteLength: 1 }, { buffer: 0, byteOffset: 4, byteLength: 12 }], accessors: [{ componentType: 5126, type: 'VEC3', count: 3, sparse: { count: 1, indices: { bufferView: 0, componentType: 5121 }, values: { bufferView: 1 } } }] } };
}

test('real sparse and zero initialized accessors load with bounded allocation', async () => {
  const f = sparseFixture(); f.document.accessors.push({ componentType: 5126, type: 'VEC3', count: 2 });
  const bytes = glb(f.document, f.binary); inspectGLB(bytes); const loaded = await parse(bytes);
  const sparse = await loaded.parser.getDependency('accessor', 0), empty = await loaded.parser.getDependency('accessor', 1);
  assert.deepEqual(Array.from(sparse.array), [0, 0, 0, 0, 0, 0, 1, 2, 3]); assert.deepEqual(Array.from(empty.array), [0, 0, 0, 0, 0, 0]);
});

for (const [name, edit] of [
  ['huge base count', a => a.count = 16_000_000],
  ['huge sparse count', a => a.sparse.count = Number.MAX_SAFE_INTEGER],
  ['sparse count exceeds accessor', a => a.sparse.count = 4],
  ['negative accessor count', a => a.count = -1],
  ['fractional accessor count', a => a.count = 1.5],
  ['unknown component type', a => a.componentType = 5130],
  ['unknown accessor type', a => a.type = 'VEC100'],
  ['invalid indices type', a => a.sparse.indices.componentType = 5126],
  ['missing values view', a => a.sparse.values.bufferView = 20],
  ['unaligned values offset', a => a.sparse.values.byteOffset = 1],
  ['indices range exceeds buffer', a => a.sparse.indices.byteOffset = 1],
  ['values range exceeds buffer', a => a.sparse.values.byteOffset = 4],
]) test(`rejects accessor ${name}`, () => {
  const f = sparseFixture(); edit(f.document.accessors[0]); assert.throws(() => inspectGLB(glb(f.document, f.binary)));
});

test('accessor storage ranges, alignment and stride are checked', () => {
  const document = { buffers: [{ byteLength: 32 }], bufferViews: [{ buffer: 0, byteLength: 32, byteStride: 16 }], accessors: [{ bufferView: 0, componentType: 5126, type: 'VEC3', count: 2 }] };
  assert.ok(inspectGLB(glb(document, Buffer.alloc(32))).decodedGeometryBytes > 0);
  for (const patch of [{ count: 3 }, { byteOffset: 2 }, { byteOffset: 16 }, { type: 'MAT4' }]) {
    const bad = structuredClone(document); Object.assign(bad.accessors[0], patch); assert.throws(() => inspectGLB(glb(bad, Buffer.alloc(32))));
  }
  const bad = structuredClone(document); bad.bufferViews[0].byteStride = 2; assert.throws(() => inspectGLB(glb(bad, Buffer.alloc(32))));
});

test('embedded buffer declared size must fit its decoded data URI', () => {
  assert.throws(() => inspectGLB(glb({ buffers: [{ byteLength: 1000, uri: 'data:application/octet-stream;base64,AAAA' }] })), /Incomplete/);
  assert.ok(inspectGLB(glb({ buffers: [{ byteLength: 3, uri: 'data:application/octet-stream;base64,AAAA' }] })).decodedGeometryBytes === 3);
});
