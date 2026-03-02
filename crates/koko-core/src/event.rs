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

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Clone, Debug, PartialEq)]
    struct TestEvent(String);

    #[derive(Clone, Debug, PartialEq)]
    struct OtherEvent(i32);

    #[test]
    fn send_and_read() {
        let events = Events::new();
        events.send(TestEvent("hello".into()));
        let read = events.read::<TestEvent>();
        assert_eq!(read.len(), 1);
        assert_eq!(read[0], TestEvent("hello".into()));
    }

    #[test]
    fn read_empty_returns_empty() {
        let events = Events::new();
        let read = events.read::<TestEvent>();
        assert!(read.is_empty());
    }

    #[test]
    fn multiple_events() {
        let events = Events::new();
        events.send(TestEvent("a".into()));
        events.send(TestEvent("b".into()));
        assert_eq!(events.read::<TestEvent>().len(), 2);
    }

    #[test]
    fn clear_removes_all() {
        let events = Events::new();
        events.send(TestEvent("x".into()));
        events.send(OtherEvent(42));
        events.clear();
        assert!(events.read::<TestEvent>().is_empty());
        assert!(events.read::<OtherEvent>().is_empty());
    }

    #[test]
    fn typed_channels_isolated() {
        let events = Events::new();
        events.send(TestEvent("hello".into()));
        events.send(OtherEvent(99));
        assert_eq!(events.read::<TestEvent>().len(), 1);
        assert_eq!(events.read::<OtherEvent>().len(), 1);
    }
}
