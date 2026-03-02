//! KOKO Input System — keyboard, mouse, gamepad abstraction

use glam::Vec2;
use std::collections::{HashMap, HashSet};
use winit::keyboard::KeyCode;
use winit::event::{ElementState, MouseButton};

/// Complete input state, updated each frame
pub struct Input {
    // Keyboard
    keys_down: HashSet<KeyCode>,
    keys_pressed: HashSet<KeyCode>,  // just pressed this frame
    keys_released: HashSet<KeyCode>, // just released this frame

    // Mouse
    mouse_buttons_down: HashSet<MouseButton>,
    mouse_buttons_pressed: HashSet<MouseButton>,
    mouse_buttons_released: HashSet<MouseButton>,
    pub mouse_position: Vec2,
    pub mouse_delta: Vec2,
    pub scroll_delta: Vec2,

    // Action mapping
    action_map: HashMap<String, Vec<InputBinding>>,
    axis_map: HashMap<String, Vec<AxisBinding>>,
}

#[derive(Clone)]
pub enum InputBinding {
    Key(KeyCode),
    Mouse(MouseButton),
}

#[derive(Clone)]
pub struct AxisBinding {
    pub positive: InputBinding,
    pub negative: InputBinding,
}

impl Input {
    pub fn new() -> Self {
        let mut input = Self {
            keys_down: HashSet::new(),
            keys_pressed: HashSet::new(),
            keys_released: HashSet::new(),
            mouse_buttons_down: HashSet::new(),
            mouse_buttons_pressed: HashSet::new(),
            mouse_buttons_released: HashSet::new(),
            mouse_position: Vec2::ZERO,
            mouse_delta: Vec2::ZERO,
            scroll_delta: Vec2::ZERO,
            action_map: HashMap::new(),
            axis_map: HashMap::new(),
        };
        input.setup_default_bindings();
        input
    }

    fn setup_default_bindings(&mut self) {
        // Default FPS/third-person bindings
        self.bind_action("jump", InputBinding::Key(KeyCode::Space));
        self.bind_action("attack", InputBinding::Mouse(MouseButton::Left));
        self.bind_action("block", InputBinding::Mouse(MouseButton::Right));
        self.bind_action("interact", InputBinding::Key(KeyCode::KeyE));
        self.bind_action("sprint", InputBinding::Key(KeyCode::ShiftLeft));
        self.bind_action("crouch", InputBinding::Key(KeyCode::ControlLeft));
        self.bind_action("roll", InputBinding::Key(KeyCode::AltLeft));
        self.bind_action("inventory", InputBinding::Key(KeyCode::Tab));
        self.bind_action("pause", InputBinding::Key(KeyCode::Escape));

        self.bind_axis("move_x", AxisBinding {
            positive: InputBinding::Key(KeyCode::KeyD),
            negative: InputBinding::Key(KeyCode::KeyA),
        });
        self.bind_axis("move_y", AxisBinding {
            positive: InputBinding::Key(KeyCode::KeyW),
            negative: InputBinding::Key(KeyCode::KeyS),
        });
    }

    pub fn bind_action(&mut self, name: &str, binding: InputBinding) {
        self.action_map.entry(name.to_string()).or_default().push(binding);
    }

    pub fn bind_axis(&mut self, name: &str, binding: AxisBinding) {
        self.axis_map.entry(name.to_string()).or_default().push(binding);
    }

    // === Query Methods ===

    pub fn key_down(&self, key: KeyCode) -> bool { self.keys_down.contains(&key) }
    pub fn key_pressed(&self, key: KeyCode) -> bool { self.keys_pressed.contains(&key) }
    pub fn key_released(&self, key: KeyCode) -> bool { self.keys_released.contains(&key) }

    pub fn mouse_down(&self, button: MouseButton) -> bool { self.mouse_buttons_down.contains(&button) }
    pub fn mouse_pressed(&self, button: MouseButton) -> bool { self.mouse_buttons_pressed.contains(&button) }
    pub fn mouse_released(&self, button: MouseButton) -> bool { self.mouse_buttons_released.contains(&button) }

    /// Check if an action is currently held
    pub fn action_down(&self, name: &str) -> bool {
        self.action_map.get(name).map_or(false, |bindings| {
            bindings.iter().any(|b| self.binding_down(b))
        })
    }

    /// Check if an action was just pressed this frame
    pub fn action_pressed(&self, name: &str) -> bool {
        self.action_map.get(name).map_or(false, |bindings| {
            bindings.iter().any(|b| self.binding_pressed(b))
        })
    }

    /// Get axis value (-1.0 to 1.0)
    pub fn axis(&self, name: &str) -> f32 {
        self.axis_map.get(name).map_or(0.0, |bindings| {
            let mut value: f32 = 0.0;
            for binding in bindings {
                if self.binding_down(&binding.positive) { value += 1.0; }
                if self.binding_down(&binding.negative) { value -= 1.0; }
            }
            value.clamp(-1.0, 1.0)
        })
    }

    /// Get WASD movement as Vec2
    pub fn movement(&self) -> Vec2 {
        Vec2::new(self.axis("move_x"), self.axis("move_y"))
    }

    fn binding_down(&self, binding: &InputBinding) -> bool {
        match binding {
            InputBinding::Key(k) => self.keys_down.contains(k),
            InputBinding::Mouse(b) => self.mouse_buttons_down.contains(b),
        }
    }

    fn binding_pressed(&self, binding: &InputBinding) -> bool {
        match binding {
            InputBinding::Key(k) => self.keys_pressed.contains(k),
            InputBinding::Mouse(b) => self.mouse_buttons_pressed.contains(b),
        }
    }

    // === Frame update methods (called by engine) ===

    pub fn begin_frame(&mut self) {
        self.keys_pressed.clear();
        self.keys_released.clear();
        self.mouse_buttons_pressed.clear();
        self.mouse_buttons_released.clear();
        self.mouse_delta = Vec2::ZERO;
        self.scroll_delta = Vec2::ZERO;
    }

    pub fn on_key(&mut self, key: KeyCode, state: ElementState) {
        match state {
            ElementState::Pressed => {
                if !self.keys_down.contains(&key) {
                    self.keys_pressed.insert(key);
                }
                self.keys_down.insert(key);
            }
            ElementState::Released => {
                self.keys_down.remove(&key);
                self.keys_released.insert(key);
            }
        }
    }

    pub fn on_mouse_button(&mut self, button: MouseButton, state: ElementState) {
        match state {
            ElementState::Pressed => {
                if !self.mouse_buttons_down.contains(&button) {
                    self.mouse_buttons_pressed.insert(button);
                }
                self.mouse_buttons_down.insert(button);
            }
            ElementState::Released => {
                self.mouse_buttons_down.remove(&button);
                self.mouse_buttons_released.insert(button);
            }
        }
    }

    pub fn on_mouse_move(&mut self, position: Vec2) {
        self.mouse_delta = position - self.mouse_position;
        self.mouse_position = position;
    }

    pub fn on_scroll(&mut self, delta: Vec2) {
        self.scroll_delta += delta;
    }
}

impl Default for Input {
    fn default() -> Self { Self::new() }
}
