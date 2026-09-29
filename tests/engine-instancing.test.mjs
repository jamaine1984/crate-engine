import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { groupMeshes, instanceKey, simplifyGeometry, whenSimplifierReady, createInstancer, performanceTips, PERFORMANCE_BUDGET, HIDDEN_LAYER } from '../engine/runtime/instancing.mjs';

const box = new THREE.BoxGeometry(), wood = new THREE.MeshStandardMaterial();
const copies = (n, geometry = box, material = wood) => Array.from({ length: n }, () => new THREE.Mesh(geometry, material));

test('only meshes sharing geometry and material, four or more, are grouped', () => {
  const glass = new THREE.MeshStandardMaterial({ transparent: true });
  const groups = groupMeshes([...copies(5), ...copies(3, new THREE.SphereGeometry()), ...copies(6, box, glass)]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0][1].length, 5);
});

test('skinned, multi-material and opted-out meshes are never instanced; primitives group by their shared key', () => {
  const skinned = new THREE.SkinnedMesh(box, wood); assert.equal(instanceKey(skinned), null);
  assert.equal(instanceKey(new THREE.Mesh(box, [wood, wood])), null);
  const opted = new THREE.Mesh(box, wood); opted.userData.noInstancing = true; assert.equal(instanceKey(opted), null);
  const a = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()), b = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  a.userData.instanceKey = b.userData.instanceKey = 'primitive|box|{}';
  assert.equal(instanceKey(a), instanceKey(b));
});

test('instanced copies follow their originals, hide with them, and originals move to the hidden layer', () => {
  const scene = new THREE.Scene(), root = new THREE.Group(); scene.add(root);
  const meshes = copies(4); meshes.forEach((mesh, i) => { mesh.position.x = i * 2; root.add(mesh); });
  const instancer = createInstancer(THREE, { scene }); scene.updateMatrixWorld(true); instancer.rebuild(root);
  assert.ok(meshes.every(mesh => mesh.layers.mask === 1 << HIDDEN_LAYER));
  assert.deepEqual(instancer.stats(), { groups: 1, instancedObjects: 4, drawCallsSaved: 3, lodGroups: 0, farCopies: 0 });
  meshes[2].position.y = 5; meshes[3].visible = false; scene.updateMatrixWorld(true); instancer.update();
  const instanced = instancer.group.children[0], m = new THREE.Matrix4();
  assert.equal(instanced.count, 3);
  instanced.getMatrixAt(2, m); assert.equal(m.elements[13], 5);
  instancer.rebuild(root, false); assert.ok(meshes.every(mesh => mesh.layers.mask === 1), 'disabling restores the originals');
  instancer.dispose();
});

test('heavy repeated meshes get a simplified far copy that shares vertex buffers', async () => {
  assert.ok(await whenSimplifierReady(), 'meshoptimizer simplifier loads');
  const sphere = new THREE.SphereGeometry(1, 128, 64), low = simplifyGeometry(THREE, sphere);
  assert.ok(low, 'sphere was simplified');
  assert.ok(low.index.count < sphere.index.count * .5);
  assert.equal(low.attributes.position, sphere.attributes.position);
  assert.equal(simplifyGeometry(THREE, new THREE.BoxGeometry()), null, 'light meshes are left alone');

  const scene = new THREE.Scene(), root = new THREE.Group(); scene.add(root);
  const material = new THREE.MeshStandardMaterial(), trees = copies(4, sphere, material);
  trees[3].position.z = -500; trees.forEach(mesh => root.add(mesh));
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 0, 5); scene.add(camera);
  const instancer = createInstancer(THREE, { scene }); scene.updateMatrixWorld(true); instancer.rebuild(root); instancer.update(camera);
  const stats = instancer.stats();
  assert.equal(stats.lodGroups, 1); assert.equal(stats.farCopies, 1);
  instancer.dispose();
});

test('performance tips fire only above the phone budget', () => {
  assert.deepEqual(performanceTips({ drawCalls: 10, triangles: 1000, textures: 5 }), []);
  const tips = performanceTips({ drawCalls: PERFORMANCE_BUDGET.drawCalls + 1, triangles: PERFORMANCE_BUDGET.triangles + 1, textures: PERFORMANCE_BUDGET.textures + 1 });
  assert.equal(tips.length, 3);
  assert.match(tips[0], /instanced/);
});
