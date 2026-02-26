//!

pub mod layers;
pub mod character;
// KOKO Physics — Rapier integration (native), stub on WASM

#[cfg(not(target_arch = "wasm32"))]
pub use rapier3d::prelude::RigidBodyHandle;

#[cfg(not(target_arch = "wasm32"))]
pub mod world3d;

#[cfg(not(target_arch = "wasm32"))]
pub mod world2d;

#[cfg(target_arch = "wasm32")]
pub struct RigidBodyHandle;
