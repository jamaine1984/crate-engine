import * as THREE from 'three';

const RECAST_VERSION = '0.42.0';
let recastModPromise = null;
let recastThreePromise = null;
let navMeshState = null;

async function loadRecastCore() {
  if (!recastModPromise) {
    const url = `https://cdn.jsdelivr.net/npm/recast-navigation@${RECAST_VERSION}/+esm`;
    recastModPromise = import(/* @vite-ignore */ url);
  }
  return recastModPromise;
}

async function loadRecastThree() {
  if (!recastThreePromise) {
    const url = `https://cdn.jsdelivr.net/npm/@recast-navigation/three@${RECAST_VERSION}/+esm`;
    recastThreePromise = import(/* @vite-ignore */ url);
  }
  return recastThreePromise;
}

function collectMeshes(root, meshes = []) {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry && child.visible !== false) {
      meshes.push(child);
    }
  });
  return meshes;
}

export async function ensureNavMeshSystem() {
  const [{ init, NavMeshQuery }, recastThree] = await Promise.all([loadRecastCore(), loadRecastThree()]);
  await init();
  return { NavMeshQuery, ...recastThree };
}

export async function buildNavMeshForScene(root, scene, options = {}) {
  const { NavMeshQuery, threeToSoloNavMesh, NavMeshHelper } = await ensureNavMeshSystem();
  const meshes = collectMeshes(root);
  const config = {
    cs: 0.2,
    ch: 0.2,
    walkableSlopeAngle: 45,
    walkableHeight: 2,
    walkableClimb: 0.9,
    walkableRadius: 0.6,
    maxEdgeLen: 12,
    maxSimplificationError: 1.3,
    minRegionArea: 8,
    mergeRegionArea: 20,
    maxVertsPerPoly: 6,
    detailSampleDist: 6,
    detailSampleMaxError: 1,
    ...options
  };
  const { success, navMesh, error } = threeToSoloNavMesh(meshes, config);
  if (!success || !navMesh) {
    throw new Error(error || 'NavMesh generation failed');
  }

  if (navMeshState?.helper && scene) scene.remove(navMeshState.helper);
  const helper = new NavMeshHelper(navMesh, {
    navMeshMaterial: new THREE.MeshBasicMaterial({
      color: 0x00ffd0,
      opacity: 0.22,
      transparent: true,
      depthWrite: false
    })
  });
  helper.visible = false;
  if (scene) scene.add(helper);

  navMeshState = {
    navMesh,
    query: new NavMeshQuery(navMesh),
    helper,
    pathLine: navMeshState?.pathLine || null,
    meshCount: meshes.length,
    config
  };
  return { meshCount: meshes.length, config };
}

export function hasNavMesh() {
  return !!navMeshState?.navMesh;
}

export function toggleNavMeshDebug(scene, forceVisible) {
  if (!navMeshState?.helper) return false;
  if (scene && !navMeshState.helper.parent) scene.add(navMeshState.helper);
  navMeshState.helper.visible = typeof forceVisible === 'boolean' ? forceVisible : !navMeshState.helper.visible;
  return navMeshState.helper.visible;
}

export function clearNavMeshPath(scene) {
  if (navMeshState?.pathLine && scene && navMeshState.pathLine.parent === scene) {
    scene.remove(navMeshState.pathLine);
  }
  if (navMeshState?.pathLine) {
    navMeshState.pathLine.geometry.dispose();
    navMeshState.pathLine.material.dispose();
    navMeshState.pathLine = null;
  }
}

export function computeNavMeshPath(start, end, scene) {
  if (!navMeshState?.query) throw new Error('NavMesh not built yet');
  const { success, path, error } = navMeshState.query.computePath(start, end);
  if (!success || !path?.length) {
    throw new Error(error || 'No navmesh path found');
  }
  clearNavMeshPath(scene);
  const points = path.map((p) => new THREE.Vector3(p.x, p.y + 0.1, p.z));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: 0x7c5cff });
  const line = new THREE.Line(geometry, material);
  if (scene) scene.add(line);
  navMeshState.pathLine = line;
  return points;
}

export function getNavMeshState() {
  return navMeshState;
}
