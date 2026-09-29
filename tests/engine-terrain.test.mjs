import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cleanTerrain, validTerrain, terrainHeight, sampleTerrain, TERRAIN_DEFAULTS } from '../engine/core/terrain.mjs';
import { newProject, cleanEntity } from '../engine/core/schema.mjs';
import { validArguments } from '../integrations/editor/contracts.mjs';
import { validateWorldRecipe } from '../engine/core/procedural.mjs';
import { createTerrainMesh } from '../engine/runtime/terrain.mjs';
import { createPhysics } from '../engine/runtime/physics.mjs';

const fakeSurfaces = { load: () => ({ color: new THREE.Texture(), normal: new THREE.Texture(), arm: new THREE.Texture() }) };

test('terrain is deterministic and features shape it', () => {
  const t = cleanTerrain({ height: 5, seed: 3, features: [{ kind: 'hill', x: 0, z: 0, radius: 20, height: 12 }, { kind: 'flatten', x: 40, z: 0, radius: 8, height: 2 }] });
  assert.equal(terrainHeight(t, 3, 4), terrainHeight(cleanTerrain(structuredClone(t)), 3, 4));
  assert.ok(terrainHeight(t, 0, 0) > terrainHeight(t, 0, 30) + 8, 'hill top is high');
  assert.ok(Math.abs(terrainHeight(t, 40, 0) - 2) < .05, 'flatten pad is level');
  const flat = cleanTerrain({ height: 0 });
  assert.equal(terrainHeight(flat, 12, -7), 0);
  assert.equal(sampleTerrain(cleanTerrain({ resolution: 16 }), 10, 10).length, 17 * 17);
});

test('terrain values are validated everywhere and cleaned with defaults', () => {
  assert.deepEqual(cleanTerrain({}), { ...TERRAIN_DEFAULTS, features: [] });
  assert.equal(validTerrain({ resolution: 1000 }), false);
  assert.equal(validTerrain({ low: 'lava' }), false);
  assert.equal(validTerrain({ features: [{ kind: 'volcano', x: 0, z: 0, radius: 5 }] }), false);
  assert.ok(validArguments('edit_objects', { operations: [{ op: 'update', id: 'a', patch: { components: { terrain: { height: 10, features: [{ kind: 'valley', x: 1, z: 2, radius: 9, height: 4 }] } } } }] }));
  assert.doesNotThrow(() => validateWorldRecipe({ version: 1, seed: 's', operations: [{ op: 'add', entity: { type: 'plane', scale: [100, 1, 100], components: { terrain: { height: 8 } } } }] }));
  assert.throws(() => validateWorldRecipe({ version: 1, seed: 's', operations: [{ op: 'add', entity: { type: 'box', components: { terrain: {} } } }] }));
  assert.throws(() => cleanEntity({ type: 'plane', components: { terrain: {}, water: {} } }), /Terrain/);
});

test('the mesh follows the height field and a dropped ball comes to rest on the terrain', async t => {
  const previous = globalThis.window; globalThis.window = { performance: globalThis.performance, addEventListener() {}, removeEventListener() {} };
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  const project = newProject('Terrain');
  const ground = cleanEntity({ type: 'plane', id: 'land', position: [0, 0, 0], scale: [60, 1, 60], components: { terrain: { resolution: 48, height: 0, features: [{ kind: 'hill', x: 0, z: 0, radius: 25, height: 6 }] } } });
  const ball = cleanEntity({ type: 'sphere', id: 'ball', position: [0, 12, 0], components: { rigidbody: { type: 'dynamic', restitution: 0 } } });
  project.entities = [ground, ball];
  const scene = new THREE.Scene(), objects = new Map();
  const land = createTerrainMesh(THREE, ground, fakeSurfaces); land.userData.entityId = 'land'; land.scale.fromArray(ground.scale);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(.5, 16, 12), new THREE.MeshBasicMaterial()); sphere.position.fromArray(ball.position); sphere.userData.entityId = 'ball';
  objects.set('land', land); objects.set('ball', sphere); scene.add(land, sphere); scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(land);
  assert.ok(Math.abs(box.max.y - terrainHeight(ground.components.terrain, 0, 0)) < .2, 'mesh peak matches height field');
  const physics = await createPhysics(project, objects, {});
  for (let i = 0; i < 240; i++) physics.step(1 / 60);
  const top = terrainHeight(ground.components.terrain, sphere.position.x, sphere.position.z);
  physics.dispose();
  assert.ok(sphere.position.y > top && sphere.position.y < top + 1.2, `ball rests on the ground (y=${sphere.position.y.toFixed(2)}, ground=${top.toFixed(2)})`);
});
