//! Color types

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct Color {
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
}

impl Color {
    pub const WHITE: Self = Self { r: 1.0, g: 1.0, b: 1.0, a: 1.0 };
    pub const BLACK: Self = Self { r: 0.0, g: 0.0, b: 0.0, a: 1.0 };
    pub const RED: Self = Self { r: 1.0, g: 0.0, b: 0.0, a: 1.0 };
    pub const GREEN: Self = Self { r: 0.0, g: 1.0, b: 0.0, a: 1.0 };
    pub const BLUE: Self = Self { r: 0.0, g: 0.0, b: 1.0, a: 1.0 };
    pub const YELLOW: Self = Self { r: 1.0, g: 1.0, b: 0.0, a: 1.0 };
    pub const CYAN: Self = Self { r: 0.0, g: 1.0, b: 1.0, a: 1.0 };
    pub const MAGENTA: Self = Self { r: 1.0, g: 0.0, b: 1.0, a: 1.0 };
    pub const TRANSPARENT: Self = Self { r: 0.0, g: 0.0, b: 0.0, a: 0.0 };
    pub const CORNFLOWER_BLUE: Self = Self { r: 0.392, g: 0.584, b: 0.929, a: 1.0 };
    pub const DARK_GRAY: Self = Self { r: 0.15, g: 0.15, b: 0.15, a: 1.0 };

    pub const fn new(r: f32, g: f32, b: f32, a: f32) -> Self { Self { r, g, b, a } }
    pub const fn rgb(r: f32, g: f32, b: f32) -> Self { Self { r, g, b, a: 1.0 } }

    pub fn from_rgba8(r: u8, g: u8, b: u8, a: u8) -> Self {
        Self { r: r as f32 / 255.0, g: g as f32 / 255.0, b: b as f32 / 255.0, a: a as f32 / 255.0 }
    }

    pub fn from_hex(hex: &str) -> Option<Self> {
        let hex = hex.trim_start_matches('#');
        let bytes: Vec<u8> = (0..hex.len()).step_by(2)
            .filter_map(|i| u8::from_str_radix(&hex[i..i+2], 16).ok())
            .collect();
        match bytes.len() {
            3 => Some(Self::from_rgba8(bytes[0], bytes[1], bytes[2], 255)),
            4 => Some(Self::from_rgba8(bytes[0], bytes[1], bytes[2], bytes[3])),
            _ => None,
        }
    }

    pub fn lerp(self, other: Self, t: f32) -> Self {
        Self {
            r: self.r + (other.r - self.r) * t,
            g: self.g + (other.g - self.g) * t,
            b: self.b + (other.b - self.b) * t,
            a: self.a + (other.a - self.a) * t,
        }
    }

    pub fn to_array(self) -> [f32; 4] { [self.r, self.g, self.b, self.a] }
}

impl Default for Color {
    fn default() -> Self { Self::WHITE }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn white_is_full() {
        assert_eq!(Color::WHITE, Color::new(1.0, 1.0, 1.0, 1.0));
    }

    #[test]
    fn black_is_zero_rgb() {
        assert_eq!(Color::BLACK.r, 0.0);
        assert_eq!(Color::BLACK.g, 0.0);
        assert_eq!(Color::BLACK.b, 0.0);
        assert_eq!(Color::BLACK.a, 1.0);
    }

    #[test]
    fn from_hex_rgb() {
        let c = Color::from_hex("#FF0000").unwrap();
        assert!((c.r - 1.0).abs() < 0.01);
        assert!((c.g - 0.0).abs() < 0.01);
        assert!((c.b - 0.0).abs() < 0.01);
    }

    #[test]
    fn from_hex_rgba() {
        let c = Color::from_hex("FF000080").unwrap();
        assert!((c.a - 128.0 / 255.0).abs() < 0.01);
    }

    #[test]
    fn from_hex_invalid() {
        assert!(Color::from_hex("ZZ").is_none());
    }

    #[test]
    fn from_rgba8_conversion() {
        let c = Color::from_rgba8(255, 0, 128, 255);
        assert!((c.r - 1.0).abs() < 0.01);
        assert!((c.b - 128.0 / 255.0).abs() < 0.01);
    }

    #[test]
    fn lerp_midpoint() {
        let mid = Color::BLACK.lerp(Color::WHITE, 0.5);
        assert!((mid.r - 0.5).abs() < 0.01);
        assert!((mid.g - 0.5).abs() < 0.01);
        assert!((mid.b - 0.5).abs() < 0.01);
    }

    #[test]
    fn to_array() {
        let arr = Color::RED.to_array();
        assert_eq!(arr, [1.0, 0.0, 0.0, 1.0]);
    }

    #[test]
    fn default_is_white() {
        assert_eq!(Color::default(), Color::WHITE);
    }
}
