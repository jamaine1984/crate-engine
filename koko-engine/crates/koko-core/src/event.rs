//! Event system — typed event channels for decoupled communication

use std::any::{Any, TypeId};
use std::collections::HashMap;
use parking_lot::RwLock;

struct EventChannel {
    events: Vec<Box<dyn Any + Send + Sync>>,
}

/// Global event bus
pub struct Events {
    channels: RwLock<HashMap<TypeId, EventChannel>>,
}

impl Events {
    pub fn new() -> Self {
        Self { channels: RwLock::new(HashMap::new()) }
    }

    pub fn send<T: 'static + Send + Sync>(&self, event: T) {
        let mut channels = self.channels.write();
        let channel = channels.entry(TypeId::of::<T>()).or_insert(EventChannel { events: Vec::new() });
        channel.events.push(Box::new(event));
    }

    /// Read all events of a type, returning owned copies
    pub fn read<T: 'static + Send + Sync + Clone>(&self) -> Vec<T> {
        let channels = self.channels.read();
        if let Some(channel) = channels.get(&TypeId::of::<T>()) {
            channel.events.iter()
                .filter_map(|e| e.downcast_ref::<T>().cloned())
                .collect()
        } else {
            Vec::new()
        }
    }

    pub fn clear(&self) {
        let mut channels = self.channels.write();
        for channel in channels.values_mut() {
            channel.events.clear();
        }
    }
}

impl Default for Events {
    fn default() -> Self { Self::new() }
}
