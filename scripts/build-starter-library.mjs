// Builds starter-library/: the owner's 100 curated models.
// - Picks come from starter-library/picks.json (keep / needsTextureRepair arrays of catalog paths).
// - Models that point at an outside texture file get that file embedded, and the repaired copy is
//   written to starter-library/models/<path>.glb. The original on the asset host is never changed.
// - Writes starter-library/catalog.json in the same shape normalizeCatalog() already reads.
// Usage: node scripts/build-starter-library.mjs
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const libDir = path.join(rootDir, 'starter-library');
const assetHost = 'https://crateship-games-assets.pages.dev';

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const type = response.headers.get('content-type') || '';
  if (type.includes('text/html')) throw new Error(`${url}: the asset host returned a page, not a file`);
  return Buffer.from(await response.arrayBuffer());
}

function readGlb(bytes) {
  if (bytes.toString('latin1', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2) throw new Error('not a glTF 2.0 binary');
  const jsonLength = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error('first chunk is not JSON');
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  let bin = Buffer.alloc(0);
  const binStart = 20 + jsonLength;
  if (binStart < bytes.length) {
    if (bytes.readUInt32LE(binStart + 4) !== 0x004e4942) throw new Error('second chunk is not BIN');
    bin = bytes.subarray(binStart + 8, binStart + 8 + bytes.readUInt32LE(binStart));
  }
  return { json, bin };
}

const pad4 = (buffer, fill) => { const extra = (4 - (buffer.length % 4)) % 4; return extra ? Buffer.concat([buffer, Buffer.alloc(extra, fill)]) : buffer; };

function writeGlb(json, bin) {
  const jsonChunk = pad4(Buffer.from(JSON.stringify(json), 'utf8'), 0x20), binChunk = pad4(bin, 0);
  const header = Buffer.alloc(12), jsonHeader = Buffer.alloc(8), binHeader = Buffer.alloc(8);
  header.write('glTF', 0, 'latin1'); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  binHeader.writeUInt32LE(binChunk.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]);
}

const mimeFor = uri => /\.png$/i.test(uri) ? 'image/png' : /\.jpe?g$/i.test(uri) ? 'image/jpeg' : null;

// Moves every outside image into the GLB's binary chunk as a new buffer view.
async function embedTextures(modelPath, bytes) {
  const { json, bin } = readGlb(bytes);
  if ((json.buffers || []).some(b => b.uri)) throw new Error(`${modelPath}: uses an outside geometry buffer`);
  const parts = [pad4(bin, 0)];
  let offset = parts[0].length, embedded = 0;
  for (const image of json.images || []) {
    if (!image.uri || image.uri.startsWith('data:')) continue;
    const mimeType = mimeFor(image.uri);
    if (!mimeType || image.uri.includes('..')) throw new Error(`${modelPath}: unsupported texture ${image.uri}`);
    // The asset host only has a generic stand-in palette for Kenney packs, so the genuine
    // CC0 texture kept in starter-library/textures/<pack>/ wins when it exists.
    const localTexture = path.join(libDir, 'textures', path.dirname(modelPath), path.basename(image.uri));
    const data = await readFile(localTexture).catch(() => download(new URL(image.uri, `${assetHost}/models/${modelPath}.glb`).href));
    json.bufferViews ||= [];
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length });
    image.bufferView = json.bufferViews.length - 1; image.mimeType = mimeType; delete image.uri;
    const padded = pad4(data, 0); parts.push(padded); offset += padded.length; embedded++;
  }
  if (!embedded) throw new Error(`${modelPath}: listed for repair but has no outside texture`);
  json.buffers = [{ ...(json.buffers?.[0] || {}), byteLength: offset }];
  return writeGlb(json, Buffer.concat(parts));
}

const picks = JSON.parse(await readFile(path.join(libDir, 'picks.json'), 'utf8'));
const fullCatalog = await (await fetch(`${assetHost}/models/catalog.json`, { signal: AbortSignal.timeout(30000) })).json();
const byPath = new Map(Object.values(fullCatalog).map(row => [row.path.toLowerCase(), row]));
const repair = new Set(picks.needsTextureRepair);
const entries = [];
for (const modelPath of picks.keep) {
  const row = byPath.get(modelPath.toLowerCase());
  if (!row) throw new Error(`${modelPath} is not in the live catalog`);
  const entry = { path: row.path, name: picks.names?.[modelPath] || row.name, cat: picks.groups?.[modelPath] || row.category };
  if (repair.has(modelPath)) {
    const repairedFile = path.join(libDir, 'models', `${row.path}.glb`);
    await mkdir(path.dirname(repairedFile), { recursive: true });
    const repaired = await embedTextures(row.path, await download(`${assetHost}/models/${row.path}.glb`));
    readGlb(repaired);
    await writeFile(repairedFile, repaired);
    entry.url = `/starter-library/models/${row.path}.glb`;
    console.log(`Repaired ${row.path} (${repaired.length} bytes)`);
  }
  const thumbName = row.path.replace(/[^a-z0-9]+/gi, '_').toLowerCase() + '.webp';
  try { await access(path.join(libDir, 'thumbs', thumbName)); entry.thumb = `/starter-library/thumbs/${thumbName}`; } catch {}
  entries.push(entry);
}
await writeFile(path.join(libDir, 'catalog.json'), JSON.stringify({ name: 'Crate Ship Starter Library', version: picks.savedAt, models: entries }, null, 1) + '\n');
console.log(`Wrote ${entries.length} starter models (${entries.filter(e => e.url).length} repaired, ${entries.filter(e => e.thumb).length} with thumbnails).`);
