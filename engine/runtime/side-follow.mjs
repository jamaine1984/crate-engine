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
