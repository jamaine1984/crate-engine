//! Typed handles for assets

use std::marker::PhantomData;
use serde::{Deserialize, Serialize};

/// A typed handle to an asset. Lightweight (just an index + generation).
#[derive(Debug, Serialize, Deserialize)]
pub struct Handle<T> {
    pub index: u32,
    pub generation: u32,
    #[serde(skip)]
    _marker: PhantomData<T>,
}

impl<T> Handle<T> {
    pub fn new(index: u32, generation: u32) -> Self {
        Self { index, generation, _marker: PhantomData }
    }

    pub fn invalid() -> Self {
        Self { index: u32::MAX, generation: 0, _marker: PhantomData }
    }

    pub fn is_valid(&self) -> bool {
        self.index != u32::MAX
    }
}

impl<T> Clone for Handle<T> {
    fn clone(&self) -> Self { Self { index: self.index, generation: self.generation, _marker: PhantomData } }
}
impl<T> Copy for Handle<T> {}
impl<T> PartialEq for Handle<T> {
    fn eq(&self, other: &Self) -> bool { self.index == other.index && self.generation == other.generation }
}
impl<T> Eq for Handle<T> {}
impl<T> std::hash::Hash for Handle<T> {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) { self.index.hash(state); self.generation.hash(state); }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_handle_is_valid() {
        let h = Handle::<u32>::new(0, 1);
        assert!(h.is_valid());
    }

    #[test]
    fn invalid_handle() {
        let h = Handle::<u32>::invalid();
        assert!(!h.is_valid());
        assert_eq!(h.index, u32::MAX);
    }

    #[test]
    fn equality() {
        let a = Handle::<u32>::new(1, 2);
        let b = Handle::<u32>::new(1, 2);
        assert_eq!(a, b);
    }

    #[test]
    fn different_generation_not_equal() {
        let a = Handle::<u32>::new(1, 1);
        let b = Handle::<u32>::new(1, 2);
        assert_ne!(a, b);
    }

    #[test]
    fn clone_and_copy() {
        let a = Handle::<u32>::new(5, 3);
        let b = a;
        let c = a.clone();
        assert_eq!(a, b);
        assert_eq!(a, c);
    }
}
