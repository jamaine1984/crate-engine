import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { scanGameArchive, WEB_BUILD_LIMITS } from '../platform/server/game-scan.mjs';
import scanner from '../worker/game-scanner/index.mjs';

const page = strToU8('<!doctype html><html><body><canvas></canvas><script src="game.js"></script></body></html>');
const make = (files = {}) => zipSync({ 'index.html': page, 'game.js': strToU8('requestAnimationFrame(()=>{})'), ...files });

test('a normal browser game passes with a manifest, checksum and scan reference', async () => {
  const result = await scanGameArchive(make({ 'assets/hero.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]) }));
  assert.equal(result.status, 'clean');
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.match(result.reference, /^crateship-check-1:/);
  assert.deepEqual(result.manifest.map(f => f.path).sort(), ['assets/hero.png', 'game.js', 'index.html']);
  assert.deepEqual(result.warnings, []);
});

test('native programs are refused by extension and by file signature', async () => {
  const renamed = await scanGameArchive(make({ 'data/level.dat': new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0]) }));
  assert.equal(renamed.status, 'rejected'); assert.match(renamed.errors[0], /Windows program/);
  const exe = await scanGameArchive(make({ 'setup.exe': new Uint8Array([1, 2, 3, 4]) }));
  assert.equal(exe.status, 'rejected'); assert.match(exe.errors[0], /\.exe files are not allowed/);
  const elf = await scanGameArchive(make({ 'bin/run': new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 2, 1]) }));
  assert.equal(elf.status, 'rejected');
  const nested = await scanGameArchive(make({ 'more.dat': zipSync({ 'a.txt': strToU8('x') }) }));
  assert.equal(nested.status, 'rejected'); assert.match(nested.errors[0], /ZIP archive/);
});

test('known crypto-miner code is refused and password fields are flagged for the owner', async () => {
  const miner = await scanGameArchive(make({ 'lib/m.js': strToU8('var m=new CoinHive.Anonymous("key");m.start();') }));
  assert.equal(miner.status, 'rejected'); assert.match(miner.errors[0], /crypto-mining/);
  const phish = await scanGameArchive(zipSync({ 'index.html': strToU8('<form><input type="password" name="p"></form>') }));
  assert.equal(phish.status, 'clean'); assert.match(phish.warnings[0], /password field/);
});

test('structural problems become readable rejections instead of exceptions', async () => {
  const noIndex = await scanGameArchive(zipSync({ 'game/index.html': page }));
  assert.equal(noIndex.status, 'rejected'); assert.match(noIndex.errors[0], /index\.html/);
  const big = await scanGameArchive(make({ 'huge.bin': new Uint8Array(WEB_BUILD_LIMITS.maxEntryBytes + 1) }));
  assert.equal(big.status, 'rejected');
  const junk = await scanGameArchive(new Uint8Array(100));
  assert.equal(junk.status, 'rejected');
});

test('scanner worker only answers POST /scan and reads the named quarantine object', async () => {
  const bytes = make();
  const env = { PLATFORM_UPLOADS: { async get(key) { return key === 'quarantine/u/g/x.zip' ? { size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) } : null; } } };
  assert.equal((await scanner.fetch(new Request('https://scanner.internal/scan'), env)).status, 404);
  const missing = await scanner.fetch(new Request('https://scanner.internal/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ objectKey: 'quarantine/u/g/other.zip' }) }), env);
  assert.equal(missing.status, 404);
  const outside = await scanner.fetch(new Request('https://scanner.internal/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ objectKey: 'media/x.webp' }) }), env);
  assert.equal(outside.status, 400);
  const ok = await (await scanner.fetch(new Request('https://scanner.internal/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ objectKey: 'quarantine/u/g/x.zip' }) }), env)).json();
  assert.equal(ok.status, 'clean'); assert.equal(ok.sizeBytes, bytes.length);
});
