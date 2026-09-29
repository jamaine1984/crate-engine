/* Character helpers: find a named bone for held items, and switch walk/idle clips from real movement. */

const BONE_ALIASES = {
 righthand: /right_?hand$/i, lefthand: /left_?hand$/i, head: /(^|[^a-z])head$/i,
 spine: /spine0?2$|spine2$|chest$/i, hips: /hips$|pelvis$/i, rightfoot: /right_?foot$/i, leftfoot: /left_?foot$/i
};

/** Bone under a model for an alias (rightHand, leftHand, head, spine, hips, rightFoot, leftFoot) or an exact bone name. */
export function findBone(object, name) {
 const bones = []; object.traverse(child => { if (child.isBone) bones.push(child); });
 const exact = bones.find(bone => bone.name === name); if (exact) return exact;
 const alias = BONE_ALIASES[String(name).toLowerCase().replace(/[^a-z]/g, '')];
 const clean = bone => bone.name.replace(/^mixamorig:?/i, '');
 return alias ? bones.find(bone => alias.test(clean(bone))) || null : bones.find(bone => clean(bone).toLowerCase() === String(name).toLowerCase()) || null;
}
export function boneNames(object) { const names = []; object.traverse(child => { if (child.isBone) names.push(child.name); }); return names; }

/** Walk while moving, idle (or stand on the first frame) while still. */
export function createLocomotion(THREE, mixer, clips, animation) {
 const find = name => name ? clips.find(clip => clip.name === name) : null;
 const move = find(animation.moveClip), idle = find(animation.idleClip);
 if (!move && !idle) return null;
 const actions = { move: move ? mixer.clipAction(move) : null, idle: idle ? mixer.clipAction(idle) : null };
 const last = new THREE.Vector3(), now = new THREE.Vector3(); let moving = null, started = false, speed = 0;
 function set(next) {
  if (next === moving) return; moving = next;
  const on = next ? actions.move : actions.idle, off = next ? actions.idle : actions.move;
  if (on) { on.enabled = true; on.paused = false; on.setEffectiveTimeScale(animation.speed ?? 1); on.setEffectiveWeight(1); on.play(); if (off && off.isRunning()) on.crossFadeFrom(off, .25, false); }
  else if (off) { off.paused = true; off.time = 0; } // no idle clip: stand on the walk cycle's first frame
 }
 return {
  update(object, dt) {
   object.getWorldPosition(now);
   if (!started) { started = true; last.copy(now); set(false); return; }
   if (dt > 0) { const v = Math.hypot(now.x - last.x, now.z - last.z) / dt; speed += (v - speed) * Math.min(1, dt * 8); }
   last.copy(now); set(speed > .35);
  },
  get moving() { return !!moving; }
 };
}
