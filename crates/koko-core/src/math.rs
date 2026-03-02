//! Math utilities

pub use glam::*;

/// Common easing functions for animation/UI
pub mod easing {
    use std::f32::consts::PI;

    pub fn linear(t: f32) -> f32 { t }
    pub fn ease_in_quad(t: f32) -> f32 { t * t }
    pub fn ease_out_quad(t: f32) -> f32 { t * (2.0 - t) }
    pub fn ease_in_out_quad(t: f32) -> f32 {
        if t < 0.5 { 2.0 * t * t } else { -1.0 + (4.0 - 2.0 * t) * t }
    }
    pub fn ease_in_cubic(t: f32) -> f32 { t * t * t }
    pub fn ease_out_cubic(t: f32) -> f32 { let t = t - 1.0; t * t * t + 1.0 }
    pub fn ease_in_out_cubic(t: f32) -> f32 {
        if t < 0.5 { 4.0 * t * t * t } else { (t - 1.0) * (2.0 * t - 2.0) * (2.0 * t - 2.0) + 1.0 }
    }
    pub fn ease_in_elastic(t: f32) -> f32 {
        if t == 0.0 || t == 1.0 { return t; }
        -(2.0_f32.powf(10.0 * (t - 1.0)) * ((t - 1.075) * 2.0 * PI / 0.3).sin())
    }
    pub fn ease_out_elastic(t: f32) -> f32 {
        if t == 0.0 || t == 1.0 { return t; }
        2.0_f32.powf(-10.0 * t) * ((t - 0.075) * 2.0 * PI / 0.3).sin() + 1.0
    }
    pub fn ease_out_bounce(t: f32) -> f32 {
        if t < 1.0 / 2.75 { 7.5625 * t * t }
        else if t < 2.0 / 2.75 { let t = t - 1.5 / 2.75; 7.5625 * t * t + 0.75 }
        else if t < 2.5 / 2.75 { let t = t - 2.25 / 2.75; 7.5625 * t * t + 0.9375 }
        else { let t = t - 2.625 / 2.75; 7.5625 * t * t + 0.984375 }
    }
    pub fn ease_in_bounce(t: f32) -> f32 { 1.0 - ease_out_bounce(1.0 - t) }
}

/// Remap a value from one range to another
pub fn remap(value: f32, from_min: f32, from_max: f32, to_min: f32, to_max: f32) -> f32 {
    to_min + (value - from_min) / (from_max - from_min) * (to_max - to_min)
}

/// Smooth damp (like Unity's Mathf.SmoothDamp)
pub fn smooth_damp(current: f32, target: f32, velocity: &mut f32, smooth_time: f32, dt: f32) -> f32 {
    let smooth_time = smooth_time.max(0.0001);
    let omega = 2.0 / smooth_time;
    let x = omega * dt;
    let exp = 1.0 / (1.0 + x + 0.48 * x * x + 0.235 * x * x * x);
    let change = current - target;
    let temp = (*velocity + omega * change) * dt;
    *velocity = (*velocity - omega * temp) * exp;
    target + (change + temp) * exp
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn easing_linear_endpoints() {
        assert_eq!(easing::linear(0.0), 0.0);
        assert_eq!(easing::linear(1.0), 1.0);
        assert_eq!(easing::linear(0.5), 0.5);
    }

    #[test]
    fn easing_quad_endpoints() {
        assert!((easing::ease_in_quad(0.0)).abs() < 0.001);
        assert!((easing::ease_in_quad(1.0) - 1.0).abs() < 0.001);
        assert!((easing::ease_out_quad(0.0)).abs() < 0.001);
        assert!((easing::ease_out_quad(1.0) - 1.0).abs() < 0.001);
    }

    #[test]
    fn easing_in_out_quad_midpoint() {
        assert!((easing::ease_in_out_quad(0.5) - 0.5).abs() < 0.001);
    }

    #[test]
    fn easing_cubic_endpoints() {
        assert!((easing::ease_in_cubic(1.0) - 1.0).abs() < 0.001);
        assert!((easing::ease_out_cubic(1.0) - 1.0).abs() < 0.001);
        assert!((easing::ease_in_out_cubic(0.0)).abs() < 0.001);
        assert!((easing::ease_in_out_cubic(1.0) - 1.0).abs() < 0.001);
    }

    #[test]
    fn easing_elastic_endpoints() {
        assert_eq!(easing::ease_in_elastic(0.0), 0.0);
        assert_eq!(easing::ease_in_elastic(1.0), 1.0);
        assert_eq!(easing::ease_out_elastic(0.0), 0.0);
        assert_eq!(easing::ease_out_elastic(1.0), 1.0);
    }

    #[test]
    fn easing_bounce_endpoints() {
        assert!((easing::ease_out_bounce(0.0)).abs() < 0.001);
        assert!((easing::ease_out_bounce(1.0) - 1.0).abs() < 0.001);
        assert!((easing::ease_in_bounce(0.0)).abs() < 0.001);
        assert!((easing::ease_in_bounce(1.0) - 1.0).abs() < 0.001);
    }

    #[test]
    fn remap_basic() {
        assert!((remap(5.0, 0.0, 10.0, 0.0, 100.0) - 50.0).abs() < 0.001);
        assert!((remap(0.0, 0.0, 10.0, 100.0, 200.0) - 100.0).abs() < 0.001);
    }

    #[test]
    fn smooth_damp_approaches_target() {
        let mut vel = 0.0_f32;
        let mut current = 0.0_f32;
        for _ in 0..100 {
            current = smooth_damp(current, 10.0, &mut vel, 0.3, 0.016);
        }
        assert!((current - 10.0).abs() < 0.1);
    }
}
