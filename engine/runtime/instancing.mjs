/*
 Automatic GPU instancing. Meshes that share one geometry and one material (copies of the same model, or
 primitives with the same shape and material) are drawn by one InstancedMesh per group instead of one draw
 call each. The original objects stay in the scene graph on HIDDEN_LAYER, so picking, physics, transforms,
 gizmos and scene checks work exactly as before; every frame each instance copies its original's world matrix
 (hidden or removed originals collapse to zero scale). Skinned, morphing, water and transparent meshes are
 never instanced.
*/
export const HIDDEN_LAYER = 1;
export const MIN_GROUP = 4;
const MAX_GROUPS = 256;

/** Group key for a mesh that may be instanced, or null. Primitive meshes pass a shared key through userData. */
export function instanceKey(mesh) {
 if (!mesh.isMesh || mesh.isInstancedMesh || mesh.isSkinnedMesh || mesh.userData.noInstancing) return null;
 if (Array.isArray(mesh.material) || !mesh.material || mesh.material.transparent || mesh.morphTargetInfluences?.length) return null;
 if (mesh.userData.instanceKey) return mesh.userData.instanceKey;
 return mesh.geometry.uuid + '|' + mesh.material.uuid;
}

/** Pure grouping step (tested without WebGL): returns [key, meshes[]] for groups big enough to instance. */
export function groupMeshes(meshes, minGroup = MIN_GROUP) {
 const groups = new Map();
 for (const mesh of meshes) { const key = instanceKey(mesh); if (!key) continue; let list = groups.get(key); if (!list) groups.set(key, list = []); list.push(mesh); }
 return [...groups].filter(([, list]) => list.length >= minGroup).sort((a, b) => b[1].length - a[1].length).slice(0, MAX_GROUPS);
}

function visibleInScene(object) { for (let node = object; node; node = node.parent) { if (node.visible === false) return false; if (node.isScene) return true; } return false; }

/** Budget a phone can hold at 60 fps; used to warn the builder AI. */
export const PERFORMANCE_BUDGET = Object.freeze({ drawCalls: 500, triangles: 2500000, textures: 120 });

export function performanceTips(report, budget = PERFORMANCE_BUDGET) {
 const tips = [];
 if (report.drawCalls > budget.drawCalls) tips.push(`${report.drawCalls} draw calls (budget ${budget.drawCalls}): reuse the same model or primitive+material for repeated props so they are instanced automatically (4+ identical copies become one draw call).`);
 if (report.triangles > budget.triangles) tips.push(`${Math.round(report.triangles / 1000)}k triangles (budget ${budget.triangles / 1000}k): use lower-poly models or fewer high-detail copies far from the camera.`);
 if (report.textures > budget.textures) tips.push(`${report.textures} textures loaded (budget ${budget.textures}): share materials between models.`);
 return tips;
}

/* Level of detail for instanced groups: heavy meshes get a simplified copy (meshoptimizer) that is drawn once a
   copy is far enough away to look small on screen. */
export const LOD_MIN_TRIANGLES = 1500;
export const LOD_RATIO = .25;
export const LOD_DISTANCE = 30; // switch when distance > bounding radius × this

let simplifier = null;
const simplifierReady = import('meshoptimizer').then(async module => { await module.MeshoptSimplifier.ready; simplifier = module.MeshoptSimplifier; return simplifier; }).catch(() => null);
export function whenSimplifierReady() { return simplifierReady; }

/** Simplified copy sharing the original vertex buffers, or null when it would not help. */
export function simplifyGeometry(THREE, geometry, ratio = LOD_RATIO) {
 const index = geometry.index, position = geometry.attributes.position;
 if (!simplifier || !index || !position || position.isInterleavedBufferAttribute || index.count / 3 < LOD_MIN_TRIANGLES) return null;
 const indices = index.array instanceof Uint32Array ? index.array : new Uint32Array(index.array);
 const positions = position.array instanceof Float32Array ? position.array : new Float32Array(position.array);
 const target = Math.max(3, Math.floor(index.count * ratio / 3) * 3);
 const [simplified] = simplifier.simplify(indices, positions, position.itemSize, target, .02, ['LockBorder']);
 if (!simplified?.length || simplified.length > index.count * .8) return null;
 const low = new THREE.BufferGeometry();
 for (const [name, attribute] of Object.entries(geometry.attributes)) low.setAttribute(name, attribute);
 low.setIndex(new THREE.BufferAttribute(simplified, 1)); low.boundingBox = geometry.boundingBox; low.boundingSphere = geometry.boundingSphere;
 return low;
}

export function createInstancer(THREE, { scene, onReady = () => {} }) {
 const group = new THREE.Group(); group.name = 'Instanced copies'; group.userData.internal = true; scene.add(group);
 const zero = new THREE.Matrix4().makeScale(0, 0, 0), world = new THREE.Vector3(), scale = new THREE.Vector3(), eye = new THREE.Vector3();
 const lowCache = new Map();
 let batches = [], saved = 0, lastRoot = null;
 simplifierReady.then(ready => { if (ready && lastRoot) { rebuild(lastRoot); onReady(); } });
 function lowFor(geometry) {
  if (!lowCache.has(geometry.uuid)) lowCache.set(geometry.uuid, simplifyGeometry(THREE, geometry));
  return lowCache.get(geometry.uuid);
 }
 function makeInstanced(geometry, material, count, source) {
  const instanced = new THREE.InstancedMesh(geometry, material, count);
  instanced.castShadow = source.some(mesh => mesh.castShadow); instanced.receiveShadow = source.some(mesh => mesh.receiveShadow);
  instanced.raycast = () => {}; instanced.userData.internal = true; instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(instanced); return instanced;
 }
 function clear() {
  for (const batch of batches) { for (const instanced of [batch.near, batch.far]) if (instanced) { instanced.removeFromParent(); instanced.dispose(); } for (const mesh of batch.meshes) mesh.layers.set(0); }
  batches = []; saved = 0;
 }
 function trimCache() { const live = new Set(batches.map(batch => batch.meshes[0].geometry.uuid)); for (const [key, low] of lowCache) if (!live.has(key)) { low?.dispose(); lowCache.delete(key); } }
 /** Rebuild groups after the scene graph changes (called from sync). */
 function rebuild(root, enabled = true) {
  clear(); lastRoot = root; if (!enabled) { trimCache(); return; }
  const meshes = []; root.traverse(object => { if (object.isMesh) meshes.push(object); });
  for (const [, list] of groupMeshes(meshes)) {
   const first = list[0], low = lowFor(first.geometry);
   const near = makeInstanced(first.geometry, first.material, list.length, list); near.name = `${first.name || 'Mesh'} ×${list.length}`;
   const far = low ? makeInstanced(low, first.material, list.length, list) : null; if (far) far.name = near.name + ' (far)';
   if (!first.geometry.boundingSphere) first.geometry.computeBoundingSphere();
   for (const mesh of list) mesh.layers.set(HIDDEN_LAYER);
   batches.push({ near, far, meshes: list, radius: first.geometry.boundingSphere.radius }); saved += list.length - (far ? 2 : 1);
  }
  trimCache(); update();
 }
 function write(instanced, index, matrix) {
  const array = instanced.instanceMatrix.array, offset = index * 16, source = matrix.elements; let changed = false;
  for (let i = 0; i < 16; i++) if (array[offset + i] !== source[i]) { array[offset + i] = source[i]; changed = true; }
  return changed;
 }
 /** Copy world matrices (and pick near/far copies when a camera is given); only re-uploads what changed. */
 function update(camera = null) {
  if (camera) camera.getWorldPosition(eye);
  for (const batch of batches) {
   let nearCount = 0, farCount = 0, nearChanged = false, farChanged = false;
   for (const mesh of batch.meshes) {
    if (!visibleInScene(mesh)) continue;
    let useFar = false;
    if (batch.far && camera) useFar = scale.setFromMatrixScale(mesh.matrixWorld) &&world.setFromMatrixPosition(mesh.matrixWorld).distanceTo(eye) > batch.radius * Math.max(scale.x, scale.y, scale.z) * LOD_DISTANCE;
    if (useFar) farChanged = write(batch.far, farCount++, mesh.matrixWorld) || farChanged;
    else nearChanged = write(batch.near, nearCount++, mesh.matrixWorld) || nearChanged;
   }
   if (batch.near.count !== nearCount) { batch.near.count = nearCount; nearChanged = true; }
   if (nearChanged) { batch.near.instanceMatrix.needsUpdate = true; batch.near.computeBoundingSphere(); }
   if (batch.far) { if (batch.far.count !== farCount) { batch.far.count = farCount; farChanged = true; } if (farChanged) { batch.far.instanceMatrix.needsUpdate = true; batch.far.computeBoundingSphere(); } }
  }
 }
 function stats() {
  let far = 0; for (const batch of batches) far += batch.far ? batch.far.count : 0;
  return { groups: batches.length, instancedObjects: batches.reduce((sum, batch) => sum + batch.meshes.length, 0), drawCallsSaved: Math.max(0, saved), lodGroups: batches.filter(batch => batch.far).length, farCopies: far };
 }
 function dispose() { clear(); trimCache(); for (const low of lowCache.values()) low?.dispose(); lowCache.clear(); group.removeFromParent(); }
 return { rebuild, update, stats, dispose, group };
}
