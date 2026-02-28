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
