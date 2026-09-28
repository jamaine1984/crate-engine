import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateRawSync, constants as zlibConstants } from 'node:zlib';
import { zipSync, strToU8, Zip, ZipDeflate } from 'fflate';
import { validateGameArchive } from '../platform/server/archive.mjs';

const page = strToU8('<!doctype html><html><body>Game</body></html>');
const make = (files = {}, options = {}) => zipSync({ 'index.html': page, ...files }, options);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const reject = (bytes, code, options) => assert.rejects(validateGameArchive(bytes, options), (error) => {
  assert.equal(error.name, 'HttpError');
  if (code) assert.equal(error.code, code);
  return true;
});

function records(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22, result = [];
  let central = view.getUint32(end + 16, true);
  for (let index = 0; index < view.getUint16(end + 10, true); index++) {
    const local = view.getUint32(central + 42, true);
    const nameLength = view.getUint16(central + 28, true);
    result.push({ central, local, name: new TextDecoder().decode(bytes.subarray(central + 46, central + 46 + nameLength)),
      data: local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true) });
    central += 46 + nameLength + view.getUint16(central + 30, true) + view.getUint16(central + 32, true);
  }
  return { view, end, entries: result };
}

function streamingArchive() {
  const chunks = [];
  const zip = new Zip((error, data) => { if (error) throw error; chunks.push(data); });
  const file = new ZipDeflate('index.html'); zip.add(file); file.push(page, true); zip.end();
  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

function replaceCompressed(bytes, compressed) {
  const { view, end, entries } = records(bytes), entry = entries[0];
  assert.equal(entries.length, 1);
  const previousSize = view.getUint32(entry.central + 20, true), delta = compressed.length - previousSize;
  const result = new Uint8Array(bytes.length + delta);
  result.set(bytes.subarray(0, entry.data)); result.set(compressed, entry.data);
  result.set(bytes.subarray(entry.data + previousSize), entry.data + compressed.length);
  const updated = new DataView(result.buffer), central = entry.central + delta;
  updated.setUint16(entry.local + 8, 8, true); updated.setUint16(central + 10, 8, true);
  updated.setUint32(entry.local + 18, compressed.length, true); updated.setUint32(central + 20, compressed.length, true);
  updated.setUint32(end + delta + 16, central, true);
  return result;
}

for (const level of [0, 6]) {
  test(`valid ${level ? 'deflated' : 'stored'} archive preserves binary bytes and reports no malware verdict`, async () => {
    const binary = Uint8Array.from({ length: 1024 }, (_, index) => (index * 61 + 29) % 256);
    const bytes = make({ 'assets/model.glb': binary, 'assets/テクスチャ.bin': binary, 'main.js': strToU8('throw new Error("MUST NOT RUN")') }, { level });
    const result = await validateGameArchive(bytes);
    assert.equal(result.status, 'structurally_valid'); assert.equal(result.malwareScan, 'required');
    assert.equal(result.sha256, digest(bytes)); assert.equal(result.sizeBytes, bytes.length);
    assert.equal(result.entryPoint, 'index.html'); assert.equal(result.manifest.length, 4);
    assert.deepEqual(result.files.get('assets/model.glb'), binary);
    assert.equal(result.manifest.find((entry) => entry.path === 'assets/model.glb').sha256, digest(binary));
    assert.notEqual(result.status, 'clean');
  });
}

test('bounded Uint8Array views and ArrayBuffers are handled as exact ZIP bytes', async () => {
  const bytes = make(); const wrapped = new Uint8Array(bytes.length + 8); wrapped.set(bytes, 4);
  const result = await validateGameArchive(wrapped.subarray(4, -4));
  assert.equal(result.sha256, digest(bytes));
  assert.equal((await validateGameArchive(bytes.buffer)).sha256, digest(bytes));
});

test('standard streaming ZIP descriptors are accepted and checked', async () => {
  const bytes = streamingArchive();
  assert.equal((await validateGameArchive(bytes)).manifest[0].path, 'index.html');
  const { view, entries } = records(bytes), record = entries[0];
  const descriptor = record.data + view.getUint32(record.central + 20, true);
  view.setUint32(descriptor + 4, 0, true);
  await reject(bytes, 'ARCHIVE_INVALID');
});

for (const path of ['../secret', 'assets/../../secret', '/etc/passwd', 'C:/file', '//server/share', '\\server\\file', 'assets\\main.js', 'assets//main.js', './main.js', 'assets/./main.js', 'nul.txt', 'COM1.bin', 'assets/main.js.', 'assets/main.js ', 'assets/%2e%2e/file', 'assets/file:stream', 'assets/file?query', 'assets/file#fragment', 'assets/\0evil']) {
  test(`rejects unsafe ZIP path ${JSON.stringify(path)}`, async () => {
    await reject(make({ [path]: strToU8('content') }), 'ARCHIVE_PATH');
  });
}

test('rejects non-normalized and invalid UTF-8 paths', async () => {
  await reject(make({ 'cafe\u0301.txt': strToU8('content') }), 'ARCHIVE_PATH');
  const bytes = make({ 'test.txt': strToU8('content') }); const { view, entries } = records(bytes);
  const entry = entries[1];
  view.setUint16(entry.central + 8, 0x0800, true); view.setUint16(entry.local + 6, 0x0800, true);
  bytes[entry.central + 46] = 0xff; bytes[entry.local + 30] = 0xff;
  await reject(bytes, 'ARCHIVE_PATH');
});

test('rejects duplicate names despite unique central directory entries', async () => {
  const bytes = make({ 'a.js': strToU8('a'), 'b.js': strToU8('b') }); const { entries } = records(bytes);
  const entry = entries.find((value) => value.name === 'b.js');
  bytes[entry.central + 46] = 'a'.charCodeAt(0); bytes[entry.local + 30] = 'a'.charCodeAt(0);
  await reject(bytes, 'ARCHIVE_PATH_COLLISION');
});

test('rejects file, implicit directory, and case collisions', async () => {
  await reject(make({ 'Main.js': strToU8('a'), 'main.js': strToU8('b') }), 'ARCHIVE_PATH_COLLISION');
  await reject(make({ 'Assets/a.js': strToU8('a'), 'assets/b.js': strToU8('b') }), 'ARCHIVE_PATH_COLLISION');
  await reject(make({ 'assets': strToU8('file'), 'assets/a.js': strToU8('a') }), 'ARCHIVE_PATH_COLLISION');
});

test('accepts an explicit empty directory beside regular files', async () => {
  const bytes = make({ 'assets/': [new Uint8Array(), { level: 0, os: 3, attrs: (0x41ed << 16) | 0x10 }], 'assets/main.js': strToU8('content') });
  const result = await validateGameArchive(bytes);
  assert.equal(result.files.has('assets'), false); assert.equal(result.manifest.length, 2);
});

test('rejects symlinks and Unix special files regardless of filename', async () => {
  await reject(make({ 'link': [strToU8('../../secret'), { os: 3, attrs: 0xa1ff << 16 }] }), 'ARCHIVE_SYMLINK');
  await reject(make({ 'pipe': [new Uint8Array(), { os: 3, attrs: 0x11ff << 16 }] }), 'ARCHIVE_SYMLINK');
});

for (const [label, flags, method] of [['encrypted', 1, 8], ['strong encryption', 64, 8], ['patched', 32, 8], ['masked names', 8192, 8], ['unsupported method', 0, 12]]) {
  test(`rejects ${label}`, async () => {
    const bytes = make(); const { view, entries } = records(bytes); const entry = entries[0];
    view.setUint16(entry.central + 8, flags, true); view.setUint16(entry.local + 6, flags, true);
    view.setUint16(entry.central + 10, method, true); view.setUint16(entry.local + 8, method, true);
    await reject(bytes, 'ARCHIVE_UNSUPPORTED');
  });
}

test('rejects ZIP64 and multi-volume records', async () => {
  let bytes = make(); let info = records(bytes);
  info.view.setUint16(info.end + 10, 0xffff, true); info.view.setUint16(info.end + 8, 0xffff, true);
  await reject(bytes, 'ARCHIVE_UNSUPPORTED');
  bytes = make(); info = records(bytes); info.view.setUint16(info.end + 4, 1, true);
  await reject(bytes, 'ARCHIVE_UNSUPPORTED');
});

test('rejects unknown, alternate-path, or encryption extra records', async () => {
  await reject(make({ 'main.js': [strToU8('content'), { extra: { 0x7075: strToU8('../hidden') } }] }), 'ARCHIVE_UNSUPPORTED');
  await reject(make({ 'main.js': [strToU8('content'), { extra: { 0x9901: new Uint8Array(7) } }] }), 'ARCHIVE_UNSUPPORTED');
});

test('rejects contradictory local filename, length, CRC, and overlapping offsets', async () => {
  let bytes = make({ 'a.js': strToU8('a') }); let info = records(bytes);
  bytes[info.entries[1].local + 30] = 'z'.charCodeAt(0); await reject(bytes, 'ARCHIVE_PATH');
  bytes = make(); info = records(bytes); info.view.setUint32(info.entries[0].local + 22, 999, true); await reject(bytes, 'ARCHIVE_INVALID');
  bytes = make(); info = records(bytes); info.view.setUint32(info.entries[0].local + 14, 999, true); await reject(bytes, 'ARCHIVE_INVALID');
  bytes = make({ 'a.js': strToU8('a') }); info = records(bytes); info.view.setUint32(info.entries[1].central + 42, 0, true); await reject(bytes);
});

test('rejects a stored payload changed after CRC was written', async () => {
  const bytes = make({}, { level: 0 }); const { entries } = records(bytes); bytes[entries[0].data] ^= 1;
  await reject(bytes, 'ARCHIVE_INTEGRITY');
});

test('rejects declared decompression bombs before inflation', async () => {
  await reject(make({ 'bomb.bin': new Uint8Array(500_000) }, { level: 9 }), 'ARCHIVE_LIMIT');
});

test('rejects a forged small expanded size using actual bounded inflation', async () => {
  const bytes = make({ 'bomb.bin': new Uint8Array(500_000) }, { level: 9 }); const { view, entries } = records(bytes);
  const entry = entries.find((value) => value.name === 'bomb.bin');
  view.setUint32(entry.central + 24, 100, true); view.setUint32(entry.local + 22, 100, true);
  await reject(bytes, 'ARCHIVE_LIMIT', { maxEntryBytes: 1000 });
});

test('rejects trailing bytes hidden inside a declared DEFLATE payload', async () => {
  const valid = make(), { view, entries } = records(valid), entry = entries[0];
  const compressed = valid.subarray(entry.data, entry.data + view.getUint32(entry.central + 20, true));
  const extra = new Uint8Array(compressed.length + 4); extra.set(compressed); extra.set([1, 2, 3, 4], compressed.length);
  await reject(replaceCompressed(valid, extra), 'ARCHIVE_INVALID');
});

test('verifies the stored DEFLATE block length complement independently of fflate', async () => {
  const stored = new Uint8Array(5 + page.length), view = new DataView(stored.buffer);
  stored[0] = 1; view.setUint16(1, page.length, true); view.setUint16(3, page.length ^ 0xffff, true); stored.set(page, 5);
  const original = make(); assert.equal((await validateGameArchive(replaceCompressed(original, stored))).manifest[0].size, page.length);
  stored[3] ^= 1; await reject(replaceCompressed(original, stored), 'ARCHIVE_INVALID');
});

test('accepts independent zlib stored, fixed and dynamic DEFLATE streams with exact binary results', async () => {
  let seed = 0x513db;
  const random = (size) => Uint8Array.from({ length: size }, () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed & 255;
  });
  const samples = [random(1), random(257), random(65536), strToU8('function updatePlayer(position, delta) { return position + delta; }\n'.repeat(80))];
  for (const sample of samples) {
    for (const options of [{ level: 0 }, { level: 6 }, { level: 6, strategy: zlibConstants.Z_FIXED }]) {
      const original = zipSync({ 'index.html': sample }, { level: 0 });
      const result = await validateGameArchive(replaceCompressed(original, deflateRawSync(sample, options)), { maxCompressionRatio: 200 });
      assert.deepEqual(result.files.get('index.html'), sample);
    }
  }
});

test('enforces compressed size, file count, entry size, total extracted bytes and path depth', async () => {
  const bytes = make({ 'main.js': strToU8('abc') }, { level: 0 });
  await reject(bytes, 'ARCHIVE_LIMIT', { maxArchiveBytes: bytes.length - 1 });
  await reject(bytes, 'ARCHIVE_LIMIT', { maxFiles: 1 });
  await reject(bytes, 'ARCHIVE_LIMIT', { maxEntryBytes: page.length - 1 });
  await reject(bytes, 'ARCHIVE_LIMIT', { maxExtractedBytes: page.length + 2 });
  await reject(make({ 'a/b/c/d.js': strToU8('a') }), 'ARCHIVE_PATH', { maxDepth: 3 });
  await reject(bytes, 'ARCHIVE_LIMIT', { uploadBytes: bytes.length - 1 });
  await reject(bytes, 'ARCHIVE_LIMIT', { files: 1 });
});

test('requires a nonempty root index.html with exact case', async () => {
  await reject(zipSync({ 'game/index.html': page }), 'ARCHIVE_ENTRYPOINT');
  await reject(zipSync({ 'INDEX.HTML': page }), 'ARCHIVE_ENTRYPOINT');
  await reject(zipSync({ 'index.html': new Uint8Array() }), 'ARCHIVE_ENTRYPOINT');
});

test('rejects truncation, appended data, and self-extracting prefixes', async () => {
  const original = make(); await reject(original.subarray(0, -1), 'ARCHIVE_INVALID');
  const appended = new Uint8Array(original.length + 1); appended.set(original); await reject(appended, 'ARCHIVE_INVALID');
  const prefixed = new Uint8Array(original.length + 2); prefixed.set([77, 90]); prefixed.set(original, 2);
  const view = new DataView(prefixed.buffer); const old = records(original); const end = old.end + 2;
  view.setUint32(end + 16, old.entries[0].central + 2, true);
  for (const entry of old.entries) view.setUint32(entry.central + 2 + 42, entry.local + 2, true);
  await reject(prefixed, 'ARCHIVE_INVALID');
});

test('invalid scanner limits and nonbinary inputs fail explicitly', async () => {
  await reject(make(), 'SCANNER_CONFIGURATION', { maxFiles: Infinity });
  await reject('not bytes', 'ARCHIVE_INVALID');
});
