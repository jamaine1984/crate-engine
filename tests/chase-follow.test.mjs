import test from 'node:test';
import assert from 'node:assert/strict';
import { chaseFollower, playerCameraFollower, isInside } from '../engine/runtime/side-follow.mjs';

test('3D chase camera keeps the authored offset and glides after the player', () => {
  const follow = chaseFollower();
  const player = { x: 0, y: 1, z: 0 }, camera = { x: 5, y: 4, z: 10 };
  follow.start(player, camera);
  const moved = { x: 0, y: 1, z: -20 };
  let cam = { ...camera };
  for (let i = 0; i < 240; i++) { cam = { x: 5, y: 4, z: 10 }; follow.apply(moved, cam, 1 / 60); }
  assert.ok(Math.abs(cam.x - 5) < 1e-6 && Math.abs(cam.y - 4) < 1e-6);
  assert.ok(Math.abs(cam.z - (-10)) < 0.01, 'camera ends 10 m behind the player again: ' + cam.z);
  const first = chaseFollower(); first.start(player, camera); const c = { ...camera }; first.apply(moved, c, 1 / 60);
  assert.ok(c.z < 10 && c.z > -10, 'one frame moves part of the way, not a jump');
});

test('the picker uses side view only for side-view players, and isInside detects a camera carried by the player', () => {
  const pick = playerCameraFollower();
  pick.start({ x: 0, y: 0, z: 0 }, { x: 0, y: 2, z: 8 }, 50, false);
  assert.equal(pick.active, true);
  pick.stop(); assert.equal(pick.active, false);
  const player = { parent: null }, holder = { parent: player }, cam = { parent: holder };
  assert.equal(isInside(cam, player), true);
  assert.equal(isInside({ parent: null }, player), false);
});
