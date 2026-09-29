import test from 'node:test';
import assert from 'node:assert/strict';
import { chaseFollower, playerCameraFollower, isInside, PITCH_MAX } from '../engine/runtime/side-follow.mjs';
import { readGamepad } from '../engine/runtime/look-controls.mjs';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('3D orbit camera starts exactly at the authored camera and glides after the player', () => {
  const follow = chaseFollower();
  const player = { x: 0, y: 1, z: 0 }, authored = { x: 0, y: 4, z: 10 };
  follow.start(player, authored);
  const cam = { ...authored }; follow.apply(player, cam, 1 / 60);
  assert.ok(near(cam.x, 0) && near(cam.y, 4) && near(cam.z, 10), JSON.stringify(cam));
  const moved = { x: 0, y: 1, z: -20 };
  for (let i = 0; i < 240; i++) follow.apply(moved, cam, 1 / 60);
  assert.ok(near(cam.z, -10, 0.01), 'camera ends 10 m behind the player again: ' + cam.z);
  assert.ok(near(follow.target.z, -20, 0.01));
});

test('rotate turns the camera around the player and clamps the pitch; yaw faces the player', () => {
  const follow = chaseFollower();
  follow.start({ x: 0, y: 0, z: 0 }, { x: 0, y: 1.3, z: 8 });
  assert.ok(near(follow.yaw, 0));
  follow.rotate(Math.PI / 2, 5);
  assert.equal(follow.pitch, PITCH_MAX);
  const cam = { x: 0, y: 0, z: 0 }; follow.apply({ x: 0, y: 0, z: 0 }, cam, 1);
  assert.ok(cam.x > 0 && near(cam.z, 0, 1e-6) && cam.y > 1.3, JSON.stringify(cam));
});

test('the picker exposes chase yaw only in 3D; isInside detects a camera carried by the player', () => {
  const pick = playerCameraFollower();
  pick.start({ x: 0, y: 0, z: 0 }, { x: 0, y: 2, z: 8 }, 50, false);
  assert.equal(pick.mode, 'chase'); assert.equal(typeof pick.yaw, 'number');
  pick.stop(); pick.start({ x: 0, y: 0, z: 0 }, { x: 0, y: 2, z: 8 }, 50, true);
  assert.equal(pick.mode, 'side'); assert.equal(pick.yaw, null);
  const player = { parent: null }, holder = { parent: player }, cam = { parent: holder };
  assert.equal(isInside(cam, player), true);
  assert.equal(isInside({ parent: null }, player), false);
});

test('gamepads: left stick moves, right stick looks, A jumps, small drift is ignored', () => {
  const button = pressed => ({ pressed });
  const pad = { connected: true, mapping: 'standard', axes: [0.9, -1, 0.1, 0.6], buttons: Array.from({ length: 16 }, (_, i) => button(i === 0)) };
  const read = readGamepad([null, pad]);
  assert.ok(read.active && read.jump && read.x > 0.8 && read.z === -1 && read.lookX === 0 && read.lookY > 0.4);
  assert.equal(readGamepad([]).active, false);
});
