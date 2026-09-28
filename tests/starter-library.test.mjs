import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { normalizeCatalog, catalogCategories } from '../engine/editor/catalog.mjs';
import { newProject, validateProject, STARTER_MODEL_URL } from '../engine/core/schema.mjs';
import { inspectGLB } from '../engine/core/gltf.mjs';
import { assetCards } from '../engine/editor/panels.mjs';

const root = new URL('../starter-library/', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('catalog.json', root), 'utf8'));
const picks = JSON.parse(await readFile(new URL('picks.json', root), 'utf8'));

test('starter catalog holds exactly the owner\'s 100 picks', () => {
  const items = normalizeCatalog(catalog);
  assert.equal(items.length, 100);
  assert.deepEqual(items.map(i => i.path.replace(/^models\//, '').replace(/\.glb$/, '').toLowerCase()).sort(), picks.keep.map(p => p.toLowerCase()).sort());
  assert.ok(catalogCategories(items).length >= 10);
});

test('every starter model has a thumbnail file, and repaired models point at the site copy', async () => {
  const repair = new Set(picks.needsTextureRepair.map(p => p.toLowerCase()));
  for (const item of catalog.models) {
    assert.match(item.thumb, /^\/starter-library\/thumbs\/[a-z0-9_]+\.webp$/);
    await access(new URL('..' + item.thumb, root));
    if (repair.has(item.path.toLowerCase())) assert.ok(STARTER_MODEL_URL.test(item.url), item.path);
    else assert.equal(item.url, undefined, item.path);
  }
});

test('repaired models carry their texture inside the GLB', async () => {
  for (const item of catalog.models.filter(i => i.url)) {
    const bytes = new Uint8Array(await readFile(new URL('..' + item.url, root)));
    const { document } = inspectGLB(bytes);
    assert.ok(document.images.length > 0, item.path);
    for (const image of document.images) { assert.equal(image.uri, undefined, item.path); assert.equal(typeof image.bufferView, 'number'); }
  }
});

test('projects keep starter model URLs and drop look-alikes', () => {
  const base = newProject('Starter');
  const keep = { id: 'a', name: 'Wall', source: 'catalog', url: '/starter-library/models/kenney_dungeon/wall.glb' };
  const bad = ['/starter-library/models/../secret.glb', '//evil.example/starter-library/models/x.glb', '/starter-library/thumbs/x.webp', 'https://evil.example/starter-library/models/x.glb'];
  const project = validateProject({ ...base, assets: [keep, ...bad.map((url, n) => ({ id: 'b' + n, name: 'x', source: 'catalog', url }))] });
  assert.equal(project.assets[0].url, keep.url);
  for (const asset of project.assets.slice(1)) assert.equal(asset.url, undefined, asset.id);
});

test('asset cards show only starter thumbnails', () => {
  const html = assetCards([{ file: 'models/a.glb', name: 'A', cat: 'Nature', thumb: '/starter-library/thumbs/a.webp' }, { file: 'models/b.glb', name: 'B', thumb: 'https://evil.example/b.webp' }], 'starter');
  assert.match(html, /<img src="\/starter-library\/thumbs\/a\.webp"/);
  assert.doesNotMatch(html, /evil\.example/);
});
