# 15 — Input System: Keyboard, Gamepad, Touch, Rebinding

> Supporting every way people play

---

## Unified Input Manager

```javascript
class InputManager {
    constructor() {
        this.actions = new Map(); // action name → boolean
        this.axes = new Map();    // axis name → -1 to 1
        this.bindings = this.defaultBindings();
        this.keysDown = new Set();
        this.gamepad = null;
        this.isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
        
        this.setupKeyboard();
        this.setupGamepad();
        if (this.isMobile) this.setupTouch();
    }
    
    defaultBindings() {
        return {
            keyboard: {
                'KeyW': 'forward', 'KeyS': 'backward',
                'KeyA': 'left', 'KeyD': 'right',
                'Space': 'jump', 'ShiftLeft': 'sprint',
                'KeyE': 'interact', 'KeyQ': 'ability',
                'ControlLeft': 'crouch', 'KeyV': 'toggleCamera',
                'KeyR': 'reload', 'KeyF': 'melee',
                'Digit1': 'weapon1', 'Digit2': 'weapon2', 'Digit3': 'weapon3',
                'Tab': 'inventory', 'Escape': 'menu',
            },
            mouse: {
                0: 'attack',      // left click
                2: 'block',       // right click
                1: 'lockOn',      // middle click
            },
            gamepad: {
                // Xbox layout
                0: 'attack',      // A
                1: 'interact',    // B
                2: 'block',       // X
                3: 'ability',     // Y
                4: 'weapon_prev', // LB
                5: 'weapon_next', // RB
                6: 'sprint',      // LT (axis)
                7: 'attack',      // RT (axis)
                8: 'menu',        // Back
                9: 'inventory',   // Start
                10: 'crouch',     // L3
                11: 'lockOn',     // R3
                12: 'dpad_up', 13: 'dpad_down',
                14: 'dpad_left', 15: 'dpad_right',
            },
        };
    }
    
    setupKeyboard() {
        document.addEventListener('keydown', (e) => {
            this.keysDown.add(e.code);
            const action = this.bindings.keyboard[e.code];
            if (action) this.actions.set(action, true);
        });
        document.addEventListener('keyup', (e) => {
            this.keysDown.delete(e.code);
            const action = this.bindings.keyboard[e.code];
            if (action) this.actions.set(action, false);
        });
        
        // Mouse
        document.addEventListener('mousedown', (e) => {
            const action = this.bindings.mouse[e.button];
            if (action) this.actions.set(action, true);
        });
        document.addEventListener('mouseup', (e) => {
            const action = this.bindings.mouse[e.button];
            if (action) this.actions.set(action, false);
        });
        
        // Mouse movement for camera
        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement) {
                this.axes.set('lookX', e.movementX);
                this.axes.set('lookY', e.movementY);
            }
        });
        
        // Scroll for zoom
        document.addEventListener('wheel', (e) => {
            this.axes.set('zoom', Math.sign(e.deltaY));
        });
    }
    
    setupGamepad() {
        window.addEventListener('gamepadconnected', (e) => {
            this.gamepad = e.gamepad;
            showNotification(`Controller connected: ${e.gamepad.id}`);
        });
        window.addEventListener('gamepaddisconnected', () => {
            this.gamepad = null;
        });
    }
    
    setupTouch() {
        // Virtual joystick + buttons (see mobile section below)
        this.touchControls = new TouchControls();
    }
    
    update() {
        // Reset per-frame axes
        this.axes.set('lookX', 0);
        this.axes.set('lookY', 0);
        this.axes.set('zoom', 0);
        
        // Gamepad polling
        if (this.gamepad) {
            const gp = navigator.getGamepads()[this.gamepad.index];
            if (gp) {
                // Buttons
                for (let i = 0; i < gp.buttons.length; i++) {
                    const action = this.bindings.gamepad[i];
                    if (action) this.actions.set(action, gp.buttons[i].pressed);
                }
                
                // Sticks
                this.axes.set('moveX', applyDeadzone(gp.axes[0], 0.15));
                this.axes.set('moveY', applyDeadzone(gp.axes[1], 0.15));
                this.axes.set('lookX', applyDeadzone(gp.axes[2], 0.1) * 15);
                this.axes.set('lookY', applyDeadzone(gp.axes[3], 0.1) * 15);
                
                // Triggers as axes
                this.axes.set('triggerL', gp.buttons[6].value);
                this.axes.set('triggerR', gp.buttons[7].value);
            }
        }
        
        // Touch
        if (this.touchControls) {
            const stick = this.touchControls.getLeftStick();
            this.axes.set('moveX', stick.x);
            this.axes.set('moveY', stick.y);
        }
    }
    
    // Check action state
    get(action) { return this.actions.get(action) || false; }
    getAxis(axis) { return this.axes.get(axis) || 0; }
    
    // Was action just pressed this frame?
    justPressed(action) {
        const current = this.actions.get(action);
        const prev = this.prevActions?.get(action);
        return current && !prev;
    }
    
    lateUpdate() {
        this.prevActions = new Map(this.actions);
    }
}

function applyDeadzone(value, threshold) {
    if (Math.abs(value) < threshold) return 0;
    return (value - Math.sign(value) * threshold) / (1 - threshold);
}
```

---

## Mobile Touch Controls

```javascript
class TouchControls {
    constructor() {
        this.container = document.createElement('div');
        this.container.id = 'touch-controls';
        this.container.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:100;';
        document.body.appendChild(this.container);
        
        this.leftStick = { x: 0, y: 0, active: false, touchId: null };
        this.rightStick = { x: 0, y: 0, active: false, touchId: null };
        
        this.createJoystick('left', 80, window.innerHeight - 160);
        this.createJoystick('right', window.innerWidth - 160, window.innerHeight - 160);
        this.createButtons();
        
        document.addEventListener('touchstart', (e) => this.onTouch(e), { passive: false });
        document.addEventListener('touchmove', (e) => this.onTouch(e), { passive: false });
        document.addEventListener('touchend', (e) => this.onTouchEnd(e));
    }
    
    createJoystick(side, x, y) {
        const base = document.createElement('div');
        base.style.cssText = `
            position:absolute;left:${x}px;top:${y}px;
            width:120px;height:120px;border-radius:60px;
            background:rgba(255,255,255,0.15);border:2px solid rgba(255,255,255,0.3);
            pointer-events:auto;
        `;
        
        const knob = document.createElement('div');
        knob.style.cssText = `
            position:absolute;left:35px;top:35px;
            width:50px;height:50px;border-radius:25px;
            background:rgba(255,255,255,0.4);
            transition:none;
        `;
        knob.id = `${side}-knob`;
        
        base.appendChild(knob);
        base.dataset.side = side;
        this.container.appendChild(base);
    }
    
    createButtons() {
        const buttons = [
            { label: 'A', action: 'jump', x: window.innerWidth - 80, y: window.innerHeight - 200 },
            { label: 'B', action: 'attack', x: window.innerWidth - 140, y: window.innerHeight - 140 },
            { label: 'X', action: 'interact', x: window.innerWidth - 20, y: window.innerHeight - 140 },
        ];
        
        for (const btn of buttons) {
            const el = document.createElement('div');
            el.style.cssText = `
                position:absolute;left:${btn.x}px;top:${btn.y}px;
                width:50px;height:50px;border-radius:25px;
                background:rgba(255,255,255,0.2);border:2px solid rgba(255,255,255,0.4);
                display:flex;align-items:center;justify-content:center;
                color:white;font-size:16px;font-weight:bold;
                pointer-events:auto;
            `;
            el.textContent = btn.label;
            el.addEventListener('touchstart', () => input.actions.set(btn.action, true));
            el.addEventListener('touchend', () => input.actions.set(btn.action, false));
            this.container.appendChild(el);
        }
    }
    
    getLeftStick() { return { x: this.leftStick.x, y: this.leftStick.y }; }
}
```

---

## Key Rebinding UI

```javascript
class KeyBindingUI {
    constructor(inputManager) {
        this.input = inputManager;
        this.listening = null; // which action we're rebinding
    }
    
    startRebind(action) {
        this.listening = action;
        showPrompt(`Press a key for "${action}"...`);
        
        const handler = (e) => {
            e.preventDefault();
            // Find old binding and remove
            for (const [key, act] of Object.entries(this.input.bindings.keyboard)) {
                if (act === action) delete this.input.bindings.keyboard[key];
            }
            // Set new
            this.input.bindings.keyboard[e.code] = action;
            this.listening = null;
            document.removeEventListener('keydown', handler);
            this.save();
            this.render();
        };
        
        document.addEventListener('keydown', handler);
    }
    
    save() {
        localStorage.setItem('keybindings', JSON.stringify(this.input.bindings));
    }
    
    load() {
        const saved = localStorage.getItem('keybindings');
        if (saved) this.input.bindings = JSON.parse(saved);
    }
}
```

---

## Implementation Plan

1. **Phase 1:** InputManager class replacing current raw key listeners
2. **Phase 2:** Gamepad support (Xbox/PS layout)
3. **Phase 3:** Mobile touch joysticks + buttons
4. **Phase 4:** Settings UI with key rebinding
5. **Phase 5:** Input buffering for combat (queue inputs during animations)

---

*Next: 16-lighting-shadows.md*
