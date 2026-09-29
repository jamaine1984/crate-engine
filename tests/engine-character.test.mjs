import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { findBone, createLocomotion } from '../engine/runtime/character.mjs';
import { cleanEntity } from '../engine/core/schema.mjs';
import { validArguments } from '../integrations/editor/contracts.mjs';

function rig(prefix = '') {
  const root = new THREE.Group(), hips = new THREE.Bone(), spine = new THREE.Bone(), hand = new THREE.Bone(), left = new THREE.Bone(), head = new THREE.Bone();
  hips.name = prefix + 'Hips'; spine.name = prefix + 'Spine2'; hand.name = prefix + 'RightHand'; left.name = prefix + 'LeftHand'; head.name = prefix + 'Head';
  root.add(hips); hips.add(spine); spine.add(hand, left, head); return { root, hand, left, head, spine, hips };
}

test('bone aliases work for Mixamo and plain rigs, and exact names still win', () => {
  for (const prefix of ['', 'mixamorig', 'mixamorig:']) {
    const r = rig(prefix);
    assert.equal(findBone(r.root, 'rightHand'), r.hand, prefix);
    assert.equal(findBone(r.root, 'leftHand'), r.left);
    assert.equal(findBone(r.root, 'head'), r.head);
    assert.equal(findBone(r.root, 'spine'), r.spine);
    assert.equal(findBone(r.root, 'hips'), r.hips);
  }
  const r = rig(); assert.equal(findBone(r.root, 'RightHand'), r.hand); assert.equal(findBone(r.root, 'tail'), null);
});

test('attach and walk/idle clips are stored, validated, and cannot combine with physics', () => {
  const item = cleanEntity({ type: 'cylinder', components: { attach: { to: 'human-1', bone: 'leftHand' } } });
  assert.deepEqual(item.components.attach, { to: 'human-1', bone: 'leftHand' });
  assert.equal(cleanEntity({ type: 'box', components: { attach: { to: 'bad id!' } } }).components.attach, undefined);
  assert.throws(() => cleanEntity({ type: 'box', components: { attach: { to: 'h' }, rigidbody: { type: 'dynamic' } } }), /attached/);
  assert.ok(validArguments('edit_objects', { operations: [{ op: 'update', id: 'a', patch: { components: { attach: { to: 'h1', bone: 'rightHand' }, animation: { clip: 'Walking', moveClip: 'Walking', idleClip: 'Idle' } } } }] }));
  const model = cleanEntity({ type: 'model', assetId: 'a', components: { animation: { clip: 'Walking', moveClip: 'Walking' } } });
  assert.equal(model.components.animation.moveClip, 'Walking');
});

test('walk clip plays only while the character moves', () => {
  const root = new THREE.Group(), bone = new THREE.Bone(); bone.name = 'Hips'; root.add(bone);
  const clip = new THREE.AnimationClip('Walking', 1, [new THREE.NumberKeyframeTrack('Hips.position[x]', [0, 1], [0, 1])]);
  const mixer = new THREE.AnimationMixer(root), loco = createLocomotion(THREE, mixer, [clip], { moveClip: 'Walking', speed: 1 });
  const action = mixer.existingAction(clip);
  loco.update(root, 1 / 60); assert.equal(loco.moving, false);
  for (let i = 0; i < 30; i++) { root.position.x += 2 / 60; root.updateMatrixWorld(true); loco.update(root, 1 / 60); }
  assert.equal(loco.moving, true); assert.equal(action.paused, false);
  for (let i = 0; i < 60; i++) { root.updateMatrixWorld(true); loco.update(root, 1 / 60); }
  assert.equal(loco.moving, false); assert.equal(action.paused, true); assert.equal(action.time, 0);
  assert.equal(createLocomotion(THREE, mixer, [clip], { moveClip: 'Missing' }), null);
});
