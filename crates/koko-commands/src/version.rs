//! Schema versioning — tracks command format evolution.

/// Current schema version. Bumped when existing payload shapes change.
/// Adding new command types does NOT bump this.
pub const SCHEMA_VERSION: u32 = 1;

/// Check if a given version is supported.
pub fn is_supported(v: u32) -> bool {
    // We support version 1 indefinitely (backwards compat guarantee).
    v >= 1 && v <= SCHEMA_VERSION
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_1_is_supported() {
        assert!(is_supported(1));
    }

    #[test]
    fn version_0_is_not_supported() {
        assert!(!is_supported(0));
    }

    #[test]
    fn future_version_is_not_supported() {
        assert!(!is_supported(SCHEMA_VERSION + 1));
    }
}
