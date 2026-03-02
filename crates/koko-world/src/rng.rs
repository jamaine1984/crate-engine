//! Deterministic seeded RNG — SplitMix64 algorithm.
//!
//! Zero external dependencies. Same seed → same sequence every time.
//! Used throughout the world compiler for all random decisions.

/// A deterministic pseudo-random number generator using SplitMix64.
///
/// SplitMix64 is simple, fast, and has excellent statistical properties.
/// Same seed produces identical sequences across all platforms.
pub struct SeededRng {
    state: u64,
}

impl SeededRng {
    /// Create a new RNG with the given seed.
    pub fn new(seed: u64) -> Self {
        // Avoid zero state by mixing
        Self {
            state: seed.wrapping_add(0x9E3779B97F4A7C15),
        }
    }

    /// Generate the next u64 value.
    pub fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E3779B97F4A7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
        z ^ (z >> 31)
    }

    /// Generate a float in [0.0, 1.0).
    pub fn next_f32(&mut self) -> f32 {
        (self.next_u64() >> 40) as f32 / (1u64 << 24) as f32
    }

    /// Generate a bool (50/50).
    pub fn next_bool(&mut self) -> bool {
        self.next_u64() & 1 == 0
    }

    /// Generate a usize in [min, max] (inclusive).
    pub fn range_usize(&mut self, min: usize, max: usize) -> usize {
        if min >= max {
            return min;
        }
        min + (self.next_u64() as usize % (max - min + 1))
    }

    /// Generate an i32 in [min, max] (inclusive).
    pub fn range_i32(&mut self, min: i32, max: i32) -> i32 {
        if min >= max {
            return min;
        }
        min + (self.next_u64() as i32).unsigned_abs() as i32 % (max - min + 1)
    }

    /// Generate a f32 in [min, max).
    pub fn range_f32(&mut self, min: f32, max: f32) -> f32 {
        min + self.next_f32() * (max - min)
    }

    /// Pick a random element from a slice.
    pub fn pick<'a, T>(&mut self, items: &'a [T]) -> &'a T {
        &items[self.range_usize(0, items.len() - 1)]
    }

    /// Pick a random f32 from a slice (convenience for rotation values, etc.)
    pub fn pick_from(&mut self, values: &[f32]) -> f32 {
        values[self.range_usize(0, values.len() - 1)]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deterministic() {
        let mut a = SeededRng::new(42);
        let mut b = SeededRng::new(42);
        for _ in 0..100 {
            assert_eq!(a.next_u64(), b.next_u64());
        }
    }

    #[test]
    fn different_seeds_differ() {
        let mut a = SeededRng::new(1);
        let mut b = SeededRng::new(2);
        let va: Vec<u64> = (0..10).map(|_| a.next_u64()).collect();
        let vb: Vec<u64> = (0..10).map(|_| b.next_u64()).collect();
        assert_ne!(va, vb);
    }

    #[test]
    fn float_in_range() {
        let mut rng = SeededRng::new(42);
        for _ in 0..1000 {
            let f = rng.next_f32();
            assert!(f >= 0.0 && f < 1.0);
        }
    }

    #[test]
    fn range_usize_respects_bounds() {
        let mut rng = SeededRng::new(42);
        for _ in 0..1000 {
            let v = rng.range_usize(5, 10);
            assert!(v >= 5 && v <= 10);
        }
    }

    #[test]
    fn range_f32_respects_bounds() {
        let mut rng = SeededRng::new(42);
        for _ in 0..1000 {
            let v = rng.range_f32(-10.0, 10.0);
            assert!(v >= -10.0 && v < 10.0);
        }
    }

    #[test]
    fn pick_returns_valid_element() {
        let mut rng = SeededRng::new(42);
        let items = [10, 20, 30, 40, 50];
        for _ in 0..100 {
            let v = rng.pick(&items);
            assert!(items.contains(v));
        }
    }

    #[test]
    fn bool_distribution_roughly_even() {
        let mut rng = SeededRng::new(42);
        let trues = (0..10000).filter(|_| rng.next_bool()).count();
        // Should be roughly 50% (allow 45-55%)
        assert!(trues > 4500 && trues < 5500, "Got {} trues", trues);
    }
}
