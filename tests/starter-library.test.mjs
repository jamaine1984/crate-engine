import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { normalizeCatalog, catalogCategories } from '../engine/editor/catalog.mjs';
import { newProject, validateProject, STARTER_MODEL_URL } from '../engine/core/schema.mjs';
import { inspectGLB } from '../engine/core/gltf.mjs';
import { assetCards } from '../engine/editor/panels.mjs';

const root = new URL('../starter-library/', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('catalog.json', root), 'utf8'));
const picks = JSON.parse(await readFile(new URL('picks.json', root), 'utf8'));

const CHARACTERS = ['human', 'goat_kid', 'blue_robot'];
const isCharacter = item => CHARACTERS.includes(item.path);

test('the starter library is the three characters plus the approved Blender-made kit', () => {
  const items = normalizeCatalog(catalog);
  assert.equal(items.length, picks.keep.length);
  assert.deepEqual(items.map(i => i.path.replace(/^models\//, '').replace(/\.glb$/, '')).sort(), [...picks.keep].sort());
  for (const id of CHARACTERS) assert.ok(picks.keep.includes(id), id + ' stays in the library');
  assert.deepEqual(catalogCategories(items).map(([cat]) => cat).sort(), ['Boats', 'Buildings', 'Creatures', 'Nature', 'People', 'Props', 'Robots', 'Terrain']);
  assert.equal(items.filter(i => i.cat === 'People').length, 1, 'exactly one human');
  for (const id of picks.keep) assert.ok(picks.names[id] && picks.groups[id], id + ' has a name and a category');
});

test('every starter model is a real GLB served from the site, with a thumbnail; characters are rigged and animated', async () => {
  for (const item of catalog.models) {
    assert.ok(STARTER_MODEL_URL.test(item.url), item.path);
    assert.match(item.thumb, /^\/starter-library\/thumbs\/[a-z0-9_]+\.webp$/);
    await access(new URL('..' + item.thumb, root));
    const bytes = new Uint8Array(await readFile(new URL('..' + item.url, root)));
    const { document } = inspectGLB(bytes);
    for (const image of document.images || []) assert.equal(image.uri, undefined, item.path + ' has no outside textures');
    if (!isCharacter(item)) {
      assert.ok(bytes.length < 8 * 1024 * 1024, item.path + ' stays under 8 MB so it loads fast');
      assert.ok((document.meshes || []).length > 0, item.path + ' has geometry');
      continue;
    }
    assert.ok(bytes.length < 5 * 1024 * 1024, item.path + ' stays under 5 MB so it loads fast');
    assert.ok(document.skins?.length > 0, item.path + ' is rigged');
    assert.deepEqual((document.animations || []).map(a => a.name).sort(), ['Running', 'Walking'], item.path + ' has Walking and Running clips');
    const joints = new Set(document.skins[0].joints);
    for (const animation of document.animations) for (const channel of animation.channels) assert.ok(joints.has(channel.target.node), item.path + ': every animation channel drives a bone of its skeleton');
  }
});

test('nothing else is left in the library folders (the old catalog was deleted on purpose)', async () => {
  assert.deepEqual((await readdir(new URL('models/', root))).sort(), catalog.models.map(m => m.url.split('/').pop()).sort());
  assert.deepEqual((await readdir(new URL('thumbs/', root))).sort(), catalog.models.map(m => m.thumb.split('/').pop()).sort());
  for (const gone of ['textures', 'models/kenney_dungeon', 'models/kenney_pirate']) await assert.rejects(access(new URL(gone, root)), gone);
});

test('projects keep starter model URLs and drop look-alikes, including the retired asset host', () => {
  const base = newProject('Starter');
  const keep = { id: 'a', name: 'Goat', source: 'catalog', url: '/starter-library/models/goat_kid.glb' };
  const bad = ['/starter-library/models/../secret.glb', '//evil.example/starter-library/models/x.glb', '/starter-library/thumbs/x.webp', 'https://evil.example/starter-library/models/x.glb', 'https://crateship-games-assets.pages.dev/models/kenney_cars/sedan.glb'];
  const project = validateProject({ ...base, assets: [keep, ...bad.map((url, n) => ({ id: 'b' + n, name: 'x', source: 'catalog', url }))] });
  assert.equal(project.assets[0].url, keep.url);
  for (const asset of project.assets.slice(1)) assert.equal(asset.url, undefined, asset.id);
});

test('asset cards show only starter thumbnails', () => {
  const html = assetCards([{ file: 'models/a.glb', name: 'A', cat: 'Nature', thumb: '/starter-library/thumbs/a.webp' }, { file: 'models/b.glb', name: 'B', thumb: 'https://evil.example/b.webp' }], 'starter');
  assert.match(html, /<img src="\/starter-library\/thumbs\/a\.webp"/);
  assert.doesNotMatch(html, /evil\.example/);
});
