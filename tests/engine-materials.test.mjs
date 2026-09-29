import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { SURFACES, SURFACE_MAPS, cleanMaterial, validMaterial } from '../engine/core/material.mjs';
import { cleanEntity } from '../engine/core/schema.mjs';
import { validArguments } from '../integrations/editor/contracts.mjs';
import { validateWorldRecipe } from '../engine/core/procedural.mjs';
import { createEntityMaterial, worldScaleUVs, needsPhysical } from '../engine/runtime/materials.mjs';

test('old materials are stored exactly as before', () => {
  assert.deepEqual(cleanMaterial({ color: '#112233', metalness: .2, roughness: .4 }), { color: '#112233', metalness: .2, roughness: .4 });
  assert.deepEqual(cleanEntity({ type: 'box', material: { color: '#112233' } }).material, { color: '#112233', metalness: .05, roughness: .65 });
});

test('new fields are kept when valid and dropped when not', () => {
  const m = cleanMaterial({ color: '#ffffff', surface: 'wood', emissive: '#ff0000', emissiveIntensity: 4, transmission: 1, ior: 9, surfaceX: 1 });
  assert.equal(m.surface, 'wood'); assert.equal(m.emissiveIntensity, 4); assert.equal(m.transmission, 1);
  assert.equal(m.ior, undefined); assert.equal(m.surfaceX, undefined);
  assert.equal(validMaterial({ surface: 'lava' }), false);
  assert.equal(validMaterial({ opacity: 2 }), false);
});

test('MCP edits and world recipes accept the new material fields', () => {
  const material = { color: '#ffffff', surface: 'brick', textureScale: 1.5, emissive: '#ffaa00', emissiveIntensity: 5, transmission: .8, ior: 1.33, clearcoat: 1, sheen: .5, opacity: .7 };
  assert.ok(validArguments('edit_objects', { operations: [{ op: 'update', id: 'a', patch: { material } }] }));
  assert.equal(validArguments('edit_objects', { operations: [{ op: 'update', id: 'a', patch: { material: { surface: 'lava' } } }] }), false);
  assert.doesNotThrow(() => validateWorldRecipe({ version: 1, seed: 's', operations: [{ op: 'add', entity: { type: 'box', material } }] }));
});

test('every built-in surface ships its three CC0 maps, small enough for phones', () => {
  const licence = JSON.parse(readFileSync('starter-library/surfaces/LICENSE.json', 'utf8'));
  assert.match(licence.licence, /CC0/);
  for (const surface of Object.keys(SURFACES)) for (const map of SURFACE_MAPS) {
    const file = `starter-library/surfaces/${surface}/${map}.jpg`;
    assert.ok(existsSync(file), file);
    assert.ok(statSync(file).size < 1024 * 1024, file + ' is under 1 MB');
  }
});

test('runtime material: glass/clearcoat/sheen use the physical material; glow and opacity are applied', () => {
  assert.ok(needsPhysical({ transmission: 1 }));
  const glass = createEntityMaterial(THREE, cleanMaterial({ color: '#ffffff', roughness: 0, transmission: 1, ior: 1.33 }));
  assert.ok(glass.isMeshPhysicalMaterial); assert.equal(glass.ior, 1.33);
  const lamp = createEntityMaterial(THREE, cleanMaterial({ emissive: '#ff8800', emissiveIntensity: 8, opacity: .5 }));
  assert.ok(!lamp.isMeshPhysicalMaterial); assert.equal(lamp.emissiveIntensity, 8); assert.ok(lamp.transparent);
  const loads = [];
  const brick = createEntityMaterial(THREE, cleanMaterial({ surface: 'brick' }), { load: surface => { loads.push(surface); return { color: new THREE.Texture(), normal: new THREE.Texture(), arm: new THREE.Texture() }; } });
  assert.deepEqual(loads, ['brick']); assert.ok(brick.map && brick.normalMap && brick.roughnessMap && brick.aoMap);
});

test('surface UVs follow real size so a long wall does not stretch the texture', () => {
  const geometry = worldScaleUVs(new THREE.BoxGeometry(1, 1, 1), [12, 3, .4], 2);
  const uv = geometry.attributes.uv; let maxU = 0;
  for (let i = 0; i < uv.count; i++) maxU = Math.max(maxU, Math.abs(uv.getX(i)));
  assert.ok(Math.abs(maxU - 3) < 1e-6, 'half of 12 m / 2 m tiles = 3');
});
