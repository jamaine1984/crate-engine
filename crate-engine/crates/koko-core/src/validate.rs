//! Transform & data validation — catches NaN, bad quats, negative scale

use glam::{Quat, Vec3};
use crate::transform::Transform;

#[derive(Debug)]
pub enum ValidationError {
    PositionNotFinite(String),
    RotationNotFinite(String),
    ScaleNotFinite(String),
    QuaternionNotNormalized(String, f32),
    NegativeScale(String, Vec3),
}

impl std::fmt::Display for ValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::PositionNotFinite(label) => write!(f, "{}: position NaN/Inf", label),
            Self::RotationNotFinite(label) => write!(f, "{}: rotation NaN/Inf", label),
            Self::ScaleNotFinite(label) => write!(f, "{}: scale NaN/Inf", label),
            Self::QuaternionNotNormalized(label, len) => write!(f, "{}: quat not normalized (len={})", label, len),
            Self::NegativeScale(label, s) => write!(f, "{}: negative scale {:?}", label, s),
        }
    }
}

impl std::error::Error for ValidationError {}

/// Validate a transform. Returns Ok(()) or an error describing what's wrong.
/// Also logs warnings for non-uniform scale (physics can't handle it well).
pub fn validate_transform(t: &Transform, label: &str) -> Result<(), ValidationError> {
    // NaN/Inf
    if !t.position.is_finite() {
        return Err(ValidationError::PositionNotFinite(label.to_string()));
    }
    let r = t.rotation;
    if !r.x.is_finite() || !r.y.is_finite() || !r.z.is_finite() || !r.w.is_finite() {
        return Err(ValidationError::RotationNotFinite(label.to_string()));
    }
    if !t.scale.is_finite() {
        return Err(ValidationError::ScaleNotFinite(label.to_string()));
    }

    // Quaternion normalized
    let qlen = t.rotation.length();
    if (qlen - 1.0).abs() > 0.01 {
        return Err(ValidationError::QuaternionNotNormalized(label.to_string(), qlen));
    }

    // Negative scale
    if t.scale.x < 0.0 || t.scale.y < 0.0 || t.scale.z < 0.0 {
        return Err(ValidationError::NegativeScale(label.to_string(), t.scale));
    }

    // Non-uniform scale warning
    let max_s = t.scale.x.max(t.scale.y).max(t.scale.z);
    let min_s = t.scale.x.min(t.scale.y).min(t.scale.z);
    if max_s > 0.0 && (max_s - min_s) / max_s > 0.05 {
        #[cfg(feature = "logging")]
        log::warn!("{}: non-uniform scale {:?} — physics will use max axis", label, t.scale);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_passes() {
        assert!(validate_transform(&Transform::IDENTITY, "test").is_ok());
    }

    #[test]
    fn nan_position_fails() {
        let t = Transform::new(Vec3::new(f32::NAN, 0.0, 0.0), Quat::IDENTITY, Vec3::ONE);
        assert!(validate_transform(&t, "test").is_err());
    }

    #[test]
    fn negative_scale_fails() {
        let t = Transform::new(Vec3::ZERO, Quat::IDENTITY, Vec3::new(-1.0, 1.0, 1.0));
        assert!(validate_transform(&t, "test").is_err());
    }

    #[test]
    fn denormalized_quat_fails() {
        let t = Transform::new(Vec3::ZERO, Quat::from_xyzw(0.0, 0.0, 0.0, 0.5), Vec3::ONE);
        assert!(validate_transform(&t, "test").is_err());
    }

    #[test]
    fn rotated_transform_passes() {
        let t = Transform::new(
            Vec3::new(1.0, 2.0, 3.0),
            Quat::from_rotation_y(std::f32::consts::FRAC_PI_2),
            Vec3::ONE,
        );
        assert!(validate_transform(&t, "test").is_ok());
    }
}
