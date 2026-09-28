import test from 'node:test';
import assert from 'node:assert/strict';
import { sideViewFollower } from '../engine/runtime/side-follow.mjs';

const authored = { x: 0, y: 3, z: 12 };
function frames(follower, player, count = 240, dt = 1 / 60) {
  let camera;
  for (let i = 0; i < count; i++) { camera = { ...authored }; follower.apply(player, camera, dt); }
  return camera;
}

test('side-view camera follows X, holds height inside the dead zone and rises for high platforms', () => {
  const follower = sideViewFollower();
  const start = { x: 0, y: 1, z: 0 };
  follower.start(start, { ...authored }, 50);
  const walked = frames(follower, { x: 20, y: 1, z: 0 });
  assert.ok(Math.abs(walked.x - 20) < 0.01, 'camera caught up along X');
  assert.equal(walked.y, authored.y, 'no vertical motion on flat ground');
  const smallHop = frames(follower, { x: 20, y: 2, z: 0 });
  assert.equal(smallHop.y, authored.y, 'a normal jump stays inside the dead zone');
  const high = frames(follower, { x: 20, y: 15, z: 0 });
  assert.ok(high.y > authored.y + 8, 'camera lifts for a high platform');
  const visibleHalfHeight = Math.hypot(12, 2) * Math.tan((25 * Math.PI) / 180);
  assert.ok(15 - (high.y - authored.y + 1) < visibleHalfHeight, 'the player stays inside the frame');
  const back = frames(follower, { x: 20, y: 1, z: 0 }, 600);
  assert.ok(Math.abs(back.y - authored.y) < 0.01, 'camera returns to the authored height');
  const pit = frames(follower, { x: 20, y: -20, z: 0 }, 600);
  assert.ok(Math.abs(pit.y - authored.y) < 0.01, 'never drops below the authored framing');
});

test('an inactive follower leaves the authored camera untouched', () => {
  const follower = sideViewFollower(); const camera = { ...authored };
  follower.apply({ x: 50, y: 50, z: 0 }, camera, 1);
  assert.deepEqual(camera, authored);
  follower.start({ x: 0, y: 0, z: 0 }, { ...authored }); follower.stop();
  follower.apply({ x: 50, y: 50, z: 0 }, camera, 1);
  assert.deepEqual(camera, authored);
});
