// ═══════════════════════════════════════════════════════════════
// CRATE ENGINE — MOBILE CONTROLS v1
// Virtual joystick + touch buttons for mobile gameplay
// ═══════════════════════════════════════════════════════════════

let _container = null;
let _joystick = null;
let _active = false;
let _moveX = 0, _moveY = 0;
let _touchButtons = {};

export function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || 
         (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);
}

export function getMoveInput() {
  return { x: _moveX, y: _moveY };
}

export function isButtonDown(name) {
  return !!_touchButtons[name];
}

export function init() {
  if (_container) return; // already init
  if (!isMobile()) return;
  
  _container = document.createElement('div');
  _container.id = 'mobile-controls';
  _container.style.cssText = 'position:fixed;bottom:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9998;';
  document.body.appendChild(_container);
  
  // === LEFT: Virtual Joystick ===
  var joyOuter = document.createElement('div');
  joyOuter.style.cssText = 'position:absolute;bottom:30px;left:30px;width:130px;height:130px;border-radius:50%;background:rgba(255,255,255,0.08);border:2px solid rgba(255,255,255,0.15);pointer-events:auto;touch-action:none;';
  var joyInner = document.createElement('div');
  joyInner.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:50px;height:50px;border-radius:50%;background:rgba(255,255,255,0.25);border:2px solid rgba(255,255,255,0.4);transition:none;';
  joyOuter.appendChild(joyInner);
  _container.appendChild(joyOuter);
  _joystick = { outer: joyOuter, inner: joyInner, radius: 50, active: false };
  
  var joyRect;
  joyOuter.addEventListener('touchstart', function(e) {
    e.preventDefault();
    _joystick.active = true;
    joyRect = joyOuter.getBoundingClientRect();
    handleJoyMove(e);
  }, { passive: false });
  
  joyOuter.addEventListener('touchmove', function(e) {
    e.preventDefault();
    if (_joystick.active) handleJoyMove(e);
  }, { passive: false });
  
  joyOuter.addEventListener('touchend', function(e) {
    _joystick.active = false;
    _moveX = 0; _moveY = 0;
    joyInner.style.transform = 'translate(-50%,-50%)';
    // Simulate key release
    if (window._engine?.playKeys) {
      window._engine.playKeys['w'] = false;
      window._engine.playKeys['s'] = false;
      window._engine.playKeys['a'] = false;
      window._engine.playKeys['d'] = false;
    }
  });
  
  function handleJoyMove(e) {
    var touch = e.touches[0];
    if (!joyRect) joyRect = joyOuter.getBoundingClientRect();
    var cx = joyRect.left + joyRect.width / 2;
    var cy = joyRect.top + joyRect.height / 2;
    var dx = touch.clientX - cx;
    var dy = touch.clientY - cy;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var maxDist = _joystick.radius;
    if (dist > maxDist) { dx = dx / dist * maxDist; dy = dy / dist * maxDist; dist = maxDist; }
    joyInner.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
    _moveX = dx / maxDist;
    _moveY = -dy / maxDist; // invert Y
    
    // Map to WASD keys for character controller
    var keys = window._engine?.playKeys;
    if (keys) {
      keys['w'] = _moveY > 0.3;
      keys['s'] = _moveY < -0.3;
      keys['a'] = _moveX < -0.3;
      keys['d'] = _moveX > 0.3;
      keys['shift'] = dist > maxDist * 0.85; // Sprint when pushed far
    }
  }
  
  // === RIGHT: Action Buttons ===
  var btnConfig = [
    { name: 'attack', label: '⚔️', key: 'e', bottom: 80, right: 30, size: 65, color: 'rgba(239,68,68,0.3)' },
    { name: 'heavy', label: '💥', key: 'q', bottom: 150, right: 80, size: 55, color: 'rgba(249,115,22,0.3)' },
    { name: 'jump', label: '⬆️', key: ' ', bottom: 150, right: 10, size: 55, color: 'rgba(59,130,246,0.3)' },
    { name: 'dodge', label: '🔄', key: 'c', bottom: 80, right: 110, size: 50, color: 'rgba(168,85,247,0.3)' },
    { name: 'interact', label: 'F', key: 'f', bottom: 30, right: 110, size: 45, color: 'rgba(34,197,94,0.3)' },
  ];
  
  btnConfig.forEach(function(cfg) {
    var btn = document.createElement('div');
    btn.style.cssText = 'position:absolute;bottom:' + cfg.bottom + 'px;right:' + cfg.right + 'px;width:' + cfg.size + 'px;height:' + cfg.size + 'px;border-radius:50%;background:' + cfg.color + ';border:2px solid rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:' + (cfg.size * 0.4) + 'px;color:white;pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;';
    btn.textContent = cfg.label;
    
    btn.addEventListener('touchstart', function(e) {
      e.preventDefault();
      _touchButtons[cfg.name] = true;
      btn.style.background = cfg.color.replace('0.3', '0.6');
      // Simulate keydown
      window.dispatchEvent(new KeyboardEvent('keydown', { key: cfg.key, bubbles: true }));
      if (window._engine?.playKeys) window._engine.playKeys[cfg.key] = true;
    }, { passive: false });
    
    btn.addEventListener('touchend', function(e) {
      _touchButtons[cfg.name] = false;
      btn.style.background = cfg.color;
      window.dispatchEvent(new KeyboardEvent('keyup', { key: cfg.key, bubbles: true }));
      if (window._engine?.playKeys) window._engine.playKeys[cfg.key] = false;
    });
    
    _container.appendChild(btn);
  });
  
  // === Camera: Right side swipe for look ===
  var lookArea = document.createElement('div');
  lookArea.style.cssText = 'position:absolute;top:0;right:0;width:50%;height:60%;pointer-events:auto;touch-action:none;';
  _container.appendChild(lookArea);
  
  var lastTouch = null;
  lookArea.addEventListener('touchstart', function(e) {
    if (e.touches.length === 1) lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  
  lookArea.addEventListener('touchmove', function(e) {
    if (!lastTouch || e.touches.length !== 1) return;
    var dx = e.touches[0].clientX - lastTouch.x;
    var dy = e.touches[0].clientY - lastTouch.y;
    lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    // Rotate character/camera
    var char = window._engine?.character;
    if (char) {
      char.rotation -= dx * 0.008;
    }
    var cam = window._engine?.camera;
    if (cam && window._engine?.playMode) {
      // Vertical camera adjustment
      cam.position.y = Math.max(1, Math.min(20, cam.position.y - dy * 0.05));
    }
  }, { passive: true });
  
  lookArea.addEventListener('touchend', function() { lastTouch = null; });
  
  _active = true;
  console.log('[Mobile] Touch controls initialized');
}

export function show() {
  if (_container) _container.style.display = '';
}

export function hide() {
  if (_container) _container.style.display = 'none';
}

export function destroy() {
  if (_container) { _container.remove(); _container = null; _active = false; }
}

// Auto-init on mobile
if (isMobile()) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

window._mobile = { init, show, hide, destroy, isMobile, getMoveInput, isButtonDown };
