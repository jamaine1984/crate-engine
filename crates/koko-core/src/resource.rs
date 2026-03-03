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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn insert_and_get() {
        let res = Resources::new();
        res.insert(42_i32);
        let val = res.get::<i32>().unwrap();
        assert_eq!(*val, 42);
    }

    #[test]
    fn get_missing_returns_none() {
        let res = Resources::new();
        assert!(res.get::<String>().is_none());
    }

    #[test]
    fn remove_returns_value() {
        let res = Resources::new();
        res.insert("hello".to_string());
        let val = res.remove::<String>().unwrap();
        assert_eq!(val, "hello");
        assert!(res.get::<String>().is_none());
    }

    #[test]
    fn overwrite_resource() {
        let res = Resources::new();
        res.insert(10_i32);
        res.insert(20_i32);
        assert_eq!(*res.get::<i32>().unwrap(), 20);
    }
}
