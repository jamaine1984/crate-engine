// Camera look + gamepad input for 3D play, shared by the editor preview and exported games.
// Desktop: drag with the mouse (any button) to turn, wheel to zoom. Phones/tablets: drag anywhere that is not a
// control button. Xbox/PlayStation/other standard gamepads: left stick moves, right stick turns, A/Cross jumps.
const DEAD = 0.18;
const deadzone = v => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

export function readGamepad(pads) {
  for (const pad of pads || []) {
    if (!pad || !pad.connected || pad.mapping !== 'standard' && pad.axes.length < 4) continue;
    const b = i => !!pad.buttons[i]?.pressed;
    const x = deadzone(pad.axes[0] || 0) + (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
    const z = deadzone(pad.axes[1] || 0) + (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
    const lookX = deadzone(pad.axes[2] || 0), lookY = deadzone(pad.axes[3] || 0);
    const jump = b(0);
    if (x || z || lookX || lookY || jump || pad.buttons.some(button => button?.pressed)) return { x: Math.max(-1, Math.min(1, x)), z: Math.max(-1, Math.min(1, z)), jump, lookX, lookY, active: true };
  }
  return { x: 0, z: 0, jump: false, lookX: 0, lookY: 0, active: false };
}

export function mountLookControls(canvas, { onLook = () => {}, onZoom = () => {} } = {}) {
  const drags = new Map();
  let disposed = false;
  const isControl = event => event.target?.closest?.('button,input,select,textarea,a,.crate-touch-controls button');
  const down = event => {
    if (disposed || isControl(event)) return;
    drags.set(event.pointerId, { x: event.clientX, y: event.clientY, touch: event.pointerType !== 'mouse' });
    try { canvas.setPointerCapture(event.pointerId); } catch {}
  };
  const move = event => {
    const drag = drags.get(event.pointerId);
    if (!drag) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    drag.x = event.clientX; drag.y = event.clientY;
    const speed = drag.touch ? 0.0075 : 0.0055;
    onLook(-dx * speed, dy * speed);
    event.preventDefault();
  };
  const up = event => { drags.delete(event.pointerId); try { canvas.releasePointerCapture(event.pointerId); } catch {} };
  const wheel = event => { if (disposed) return; event.preventDefault(); onZoom(event.deltaY > 0 ? 1.1 : 1 / 1.1); };
  const menu = event => event.preventDefault();
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('contextmenu', menu);
  const prevTouchAction = canvas.style.touchAction;
  canvas.style.touchAction = 'none';
  return {
    /** Call once per frame: applies right-stick look and returns the gamepad movement for physics. */
    poll(dt = 0) {
      const pad = readGamepad(globalThis.navigator?.getGamepads?.());
      if (pad.lookX || pad.lookY) onLook(-pad.lookX * 2.6 * dt, pad.lookY * 1.8 * dt);
      return pad;
    },
    dispose() {
      disposed = true; drags.clear();
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('contextmenu', menu);
      canvas.style.touchAction = prevTouchAction;
    },
  };
}
