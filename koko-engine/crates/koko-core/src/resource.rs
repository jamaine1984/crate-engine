//! Resource storage — singleton data accessible by systems

use std::any::{Any, TypeId};
use std::collections::HashMap;
use parking_lot::RwLock;

/// Stores singleton resources (Time, Input, etc.)
pub struct Resources {
    data: RwLock<HashMap<TypeId, Box<dyn Any + Send + Sync>>>,
}

impl Resources {
    pub fn new() -> Self {
        Self { data: RwLock::new(HashMap::new()) }
    }

    pub fn insert<T: 'static + Send + Sync>(&self, resource: T) {
        self.data.write().insert(TypeId::of::<T>(), Box::new(resource));
    }

    pub fn get<T: 'static + Send + Sync>(&self) -> Option<parking_lot::MappedRwLockReadGuard<'_, T>> {
        let data = self.data.read();
        if data.contains_key(&TypeId::of::<T>()) {
            Some(parking_lot::RwLockReadGuard::map(data, |d| {
                d.get(&TypeId::of::<T>()).unwrap().downcast_ref::<T>().unwrap()
            }))
        } else {
            None
        }
    }

    pub fn remove<T: 'static + Send + Sync>(&self) -> Option<T> {
        self.data.write().remove(&TypeId::of::<T>())
            .and_then(|b| b.downcast::<T>().ok())
            .map(|b| *b)
    }
}

impl Default for Resources {
    fn default() -> Self { Self::new() }
}
