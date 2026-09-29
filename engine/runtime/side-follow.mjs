// Side-view camera follow shared by the editor preview and exported games.
// X tracks the player smoothly. Y stays at the authored framing until the player
// climbs out of a dead zone (a share of the visible half-height), then rises
// with them; it never drops below the authored height, so pits stay framed.
export const DEAD_ZONE_SHARE = 0.3;

export function sideViewFollower() {
  let active = false, offsetX = 0, x = 0, startY = 0, deadZone = 1, targetY = 0, liftY = 0;
  return {
    get active() { return active; },
    start(player, camera, fovDegrees = 50) {
      active = true; x = camera.x; offsetX = camera.x - player.x; startY = player.y; targetY = 0; liftY = 0;
      const distance = Math.hypot(camera.x - player.x, camera.y - player.y, camera.z - player.z) || 1;
      deadZone = Math.max(0.25, distance * Math.tan((fovDegrees * Math.PI / 180) / 2) * DEAD_ZONE_SHARE);
    },
    stop() { active = false; },
    // `camera` already holds the authored camera position for this frame; it is adjusted in place.
    apply(player, camera, dt = 0) {
      if (!active) return;
      const step = Math.max(0, dt);
      x += (player.x + offsetX - x) * (1 - Math.exp(-7 * step));
      camera.x = x;
      const rise = player.y - startY;
      if (rise - targetY > deadZone) targetY = rise - deadZone;
      else if (rise - targetY < -deadZone) targetY = rise + deadZone;
      // Back near the starting height, settle into the authored framing again.
      if (rise <= deadZone) targetY = Math.min(targetY, Math.max(0, rise));
      targetY = Math.max(0, targetY);
      liftY += (targetY - liftY) * (1 - Math.exp(-5 * step));
      camera.y += liftY;
    },
  };
}

// 3D games: a third-person orbit camera. It starts at the authored camera's distance and angle, glides after the
// player, and turns with rotate() (mouse drag, touch drag, right stick). yaw is the direction the camera looks,
// so movement can be made camera-relative.
export const PITCH_MIN = -0.15, PITCH_MAX = 1.25;
export function chaseFollower() {
  let active = false, distance = 8, yaw = 0, pitch = 0.3, height = 1.3;
  const focus = { x: 0, y: 0, z: 0 }, target = { x: 0, y: 0, z: 0 };
  return {
    get active() { return active; },
    get yaw() { return yaw; },
    get pitch() { return pitch; },
    get target() { return target; },
    start(player, camera) {
      active = true;
      const dx = camera.x - player.x, dz = camera.z - player.z, dy = camera.y - (player.y + height);
      distance = Math.max(2.5, Math.hypot(dx, dy, dz));
      yaw = Math.atan2(dx, dz);
      pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, Math.atan2(dy, Math.hypot(dx, dz))));
      focus.x = player.x; focus.y = player.y; focus.z = player.z;
    },
    stop() { active = false; },
    rotate(dYaw = 0, dPitch = 0) {
      if (!active) return;
      yaw = (yaw + dYaw) % (Math.PI * 2);
      pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitch + dPitch));
    },
    zoom(factor = 1) { if (active) distance = Math.min(40, Math.max(2.5, distance * factor)); },
    apply(player, camera, dt = 0) {
      if (!active) return;
      const k = 1 - Math.exp(-8 * Math.max(0, dt));
      focus.x += (player.x - focus.x) * k; focus.y += (player.y - focus.y) * k; focus.z += (player.z - focus.z) * k;
      target.x = focus.x; target.y = focus.y + height; target.z = focus.z;
      const flat = Math.cos(pitch) * distance;
      camera.x = target.x + Math.sin(yaw) * flat; camera.y = target.y + Math.sin(pitch) * distance; camera.z = target.z + Math.cos(yaw) * flat;
    },
  };
}

// Picks how the game camera follows the player: side-view games use sideViewFollower, 3D games chase.
// A camera placed inside the player (a child object) already moves with them and is left alone.
export function playerCameraFollower() {
  const side = sideViewFollower(), chase = chaseFollower();
  let current = null;
  return {
    get active() { return !!current?.active; },
    get mode() { return current === chase ? 'chase' : current === side ? 'side' : null; },
    get yaw() { return current === chase ? chase.yaw : null; },
    get target() { return current === chase ? chase.target : null; },
    rotate(dYaw, dPitch) { if (current === chase) chase.rotate(dYaw, dPitch); },
    zoom(factor) { if (current === chase) chase.zoom(factor); },
    start(player, camera, fovDegrees, sideView) { current = sideView ? side : chase; current.start(player, camera, fovDegrees); },
    stop() { side.stop(); chase.stop(); current = null; },
    apply(player, camera, dt) { current?.apply(player, camera, dt); },
  };
}

export function isInside(object, ancestor) {
  for (let node = object?.parent; node; node = node.parent) if (node === ancestor) return true;
  return false;
}
