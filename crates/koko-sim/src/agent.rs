//! Simulation agents — NPCs and vehicles that move through the city.
//!
//! Each agent has a current position, a path to follow, a schedule of
//! destinations, and behavioral state (walking, waiting, driving, parked).

use serde::{Deserialize, Serialize};

/// Unique agent identifier.
pub type AgentId = u32;

/// Agent type — determines movement rules and graph used.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentType {
    Pedestrian,
    Vehicle,
}

/// Current behavioral state of an agent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentState {
    /// Moving along a path.
    Moving,
    /// Waiting at a crosswalk or traffic light.
    Waiting,
    /// Idle at a destination (inside a building, parked).
    Idle,
    /// Stopped at intersection (yield/stop sign).
    Stopped,
}

/// A simulation agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: AgentId,
    pub agent_type: AgentType,
    pub state: AgentState,

    /// Current world-space position [x, y, z].
    pub position: [f32; 3],
    /// Current facing direction in degrees (Y-axis rotation).
    pub rotation: f32,
    /// Movement speed in units per second.
    pub speed: f32,

    /// Asset ID used to render this agent (e.g. "pedestrian_a", "kenney_cars_sedan_a").
    pub asset_id: String,

    /// Current path: sequence of nav node IDs to follow.
    pub path: Vec<u32>,
    /// Index into `path` — which node we're heading toward.
    pub path_index: usize,

    /// Schedule: list of destination node IDs to visit in order.
    pub schedule: Vec<u32>,
    /// Index into `schedule` — which destination we're heading to.
    pub schedule_index: usize,

    /// Time spent in current state (seconds). Used for wait timers.
    pub state_timer: f32,
    /// How long to wait in the current state before transitioning.
    pub wait_duration: f32,

    /// Which chunk this agent is currently in (for spatial queries).
    pub current_chunk: String,
}

impl Agent {
    /// Create a new pedestrian agent.
    pub fn new_pedestrian(id: AgentId, position: [f32; 3], asset_id: &str) -> Self {
        Self {
            id,
            agent_type: AgentType::Pedestrian,
            state: AgentState::Idle,
            position,
            rotation: 0.0,
            speed: 1.4, // ~5 km/h average walking speed
            asset_id: asset_id.to_string(),
            path: Vec::new(),
            path_index: 0,
            schedule: Vec::new(),
            schedule_index: 0,
            state_timer: 0.0,
            wait_duration: 0.0,
            current_chunk: String::new(),
        }
    }

    /// Create a new vehicle agent.
    pub fn new_vehicle(id: AgentId, position: [f32; 3], asset_id: &str) -> Self {
        Self {
            id,
            agent_type: AgentType::Vehicle,
            state: AgentState::Idle,
            position,
            rotation: 0.0,
            speed: 8.0, // ~30 km/h city driving
            asset_id: asset_id.to_string(),
            path: Vec::new(),
            path_index: 0,
            schedule: Vec::new(),
            schedule_index: 0,
            state_timer: 0.0,
            wait_duration: 0.0,
            current_chunk: String::new(),
        }
    }

    /// Does this agent have a path to follow?
    pub fn has_path(&self) -> bool {
        !self.path.is_empty() && self.path_index < self.path.len()
    }

    /// Get the current target node ID (next node on path).
    pub fn current_target(&self) -> Option<u32> {
        if self.path_index < self.path.len() {
            Some(self.path[self.path_index])
        } else {
            None
        }
    }

    /// Advance to the next node on the path.
    pub fn advance_path(&mut self) {
        self.path_index += 1;
    }

    /// Has the agent completed its current path?
    pub fn path_complete(&self) -> bool {
        self.path_index >= self.path.len()
    }

    /// Get the next scheduled destination, cycling through the schedule.
    pub fn next_destination(&mut self) -> Option<u32> {
        if self.schedule.is_empty() {
            return None;
        }
        self.schedule_index = (self.schedule_index + 1) % self.schedule.len();
        Some(self.schedule[self.schedule_index])
    }
}

/// Snapshot of an agent's visible state — sent to JS for rendering.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSnapshot {
    pub id: AgentId,
    pub agent_type: AgentType,
    pub state: AgentState,
    pub position: [f32; 3],
    pub rotation: f32,
    pub asset_id: String,
}

impl From<&Agent> for AgentSnapshot {
    fn from(a: &Agent) -> Self {
        Self {
            id: a.id,
            agent_type: a.agent_type,
            state: a.state,
            position: a.position,
            rotation: a.rotation,
            asset_id: a.asset_id.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_pedestrian() {
        let a = Agent::new_pedestrian(0, [10.0, 0.0, 20.0], "ped_a");
        assert_eq!(a.agent_type, AgentType::Pedestrian);
        assert_eq!(a.state, AgentState::Idle);
        assert!(!a.has_path());
    }

    #[test]
    fn path_traversal() {
        let mut a = Agent::new_pedestrian(0, [0.0, 0.0, 0.0], "ped_a");
        a.path = vec![1, 2, 3];
        a.path_index = 0;

        assert!(a.has_path());
        assert_eq!(a.current_target(), Some(1));

        a.advance_path();
        assert_eq!(a.current_target(), Some(2));

        a.advance_path();
        assert_eq!(a.current_target(), Some(3));

        a.advance_path();
        assert!(a.path_complete());
    }

    #[test]
    fn schedule_cycles() {
        let mut a = Agent::new_pedestrian(0, [0.0, 0.0, 0.0], "ped_a");
        a.schedule = vec![10, 20, 30];
        a.schedule_index = 0;

        assert_eq!(a.next_destination(), Some(20));
        assert_eq!(a.next_destination(), Some(30));
        assert_eq!(a.next_destination(), Some(10)); // wraps
    }

    #[test]
    fn snapshot() {
        let a = Agent::new_vehicle(5, [100.0, 0.0, 200.0], "car_a");
        let snap = AgentSnapshot::from(&a);
        assert_eq!(snap.id, 5);
        assert_eq!(snap.agent_type, AgentType::Vehicle);
        assert_eq!(snap.position, [100.0, 0.0, 200.0]);
    }
}
