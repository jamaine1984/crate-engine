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

// 3D games: the camera keeps its authored angle and distance from the player and glides after them.
export function chaseFollower() {
  let active = false;
  const offset = { x: 0, y: 0, z: 0 }, pos = { x: 0, y: 0, z: 0 };
  return {
    get active() { return active; },
    start(player, camera) {
      active = true;
      offset.x = camera.x - player.x; offset.y = camera.y - player.y; offset.z = camera.z - player.z;
      pos.x = camera.x; pos.y = camera.y; pos.z = camera.z;
    },
    stop() { active = false; },
    apply(player, camera, dt = 0) {
      if (!active) return;
      const k = 1 - Math.exp(-6 * Math.max(0, dt));
      pos.x += (player.x + offset.x - pos.x) * k; pos.y += (player.y + offset.y - pos.y) * k; pos.z += (player.z + offset.z - pos.z) * k;
      camera.x = pos.x; camera.y = pos.y; camera.z = pos.z;
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
    start(player, camera, fovDegrees, sideView) { current = sideView ? side : chase; current.start(player, camera, fovDegrees); },
    stop() { side.stop(); chase.stop(); current = null; },
    apply(player, camera, dt) { current?.apply(player, camera, dt); },
  };
}

export function isInside(object, ancestor) {
  for (let node = object?.parent; node; node = node.parent) if (node === ancestor) return true;
  return false;
}
