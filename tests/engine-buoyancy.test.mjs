import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { newProject, cleanEntity } from '../engine/core/schema.mjs';
import { createPhysics } from '../engine/runtime/physics.mjs';

async function drop(t, withWater) {
  const previous = globalThis.window; globalThis.window = { performance: globalThis.performance, addEventListener() {}, removeEventListener() {} };
  const project = newProject('Float');
  const floor = cleanEntity({ type: 'box', id: 'seabed', position: [0, -10.5, 0], scale: [40, 1, 40], components: { rigidbody: { type: 'static' } } });
  const sea = cleanEntity({ type: 'plane', id: 'sea', position: [0, 0, 0], scale: [40, 1, 40], components: { water: { waveHeight: 0 } } });
  const crate = cleanEntity({ type: 'box', id: 'crate', position: [0, 3, 0], components: { rigidbody: { type: 'dynamic' } } });
  project.entities = withWater ? [floor, sea, crate] : [floor, crate];
  const scene = new THREE.Scene(), objects = new Map();
  for (const e of project.entities) { const o = new THREE.Mesh(new THREE.BoxGeometry(1, e.type === 'plane' ? .02 : 1, 1)); o.position.fromArray(e.position); o.scale.fromArray(e.scale); o.userData.entityId = e.id; objects.set(e.id, o); scene.add(o); }
  scene.updateMatrixWorld(true);
  const physics = await createPhysics(project, objects, {});
  for (let i = 0; i < 600; i++) physics.step(1 / 60);
  const y = objects.get('crate').position.y; physics.dispose();
  if (previous === undefined) delete globalThis.window; else globalThis.window = previous;
  return y;
}

test('a dynamic crate floats at the water surface instead of sinking to the seabed', async t => {
  const floating = await drop(t, true), sunk = await drop(t, false);
  assert.ok(floating > -.6 && floating < .6, `crate floats near y=0 (got ${floating.toFixed(2)})`);
  assert.ok(sunk < -9, `without water it lands on the seabed (got ${sunk.toFixed(2)})`);
});
