//! KOKO Simulation — brings the city to life with NPCs and traffic.
//!
//! ## Architecture
//!
//! - **agent.rs** — Agent data (pedestrians, vehicles) with path/schedule state
//! - **tick.rs** — Per-frame update: move agents, handle waits, assign destinations
//! - **spawner.rs** — Create initial population based on zone density
//!
//! ## Usage Flow
//!
//! 1. Build nav graphs (koko-nav)
//! 2. Spawn agents (spawner)
//! 3. Each frame: call tick() → get TickResult → send to JS for rendering

pub mod agent;
pub mod spawner;
pub mod tick;

pub use agent::{Agent, AgentId, AgentSnapshot, AgentState, AgentType};
pub use spawner::{spawn_population, ChunkInfo, ZonePopulation};
pub use tick::{tick, TickResult};

use koko_nav::Graph;
use serde::{Deserialize, Serialize};

/// Complete simulation state — holds everything needed to run the city.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimState {
    /// All active agents.
    pub agents: Vec<Agent>,
    /// Simulation time in seconds.
    pub time: f32,
    /// Is the simulation running?
    pub running: bool,
    /// Simulation speed multiplier (1.0 = real-time, 2.0 = double speed).
    pub speed: f32,
}

impl SimState {
    /// Create a new simulation state with the given agents.
    pub fn new(agents: Vec<Agent>) -> Self {
        Self {
            agents,
            time: 0.0,
            running: true,
            speed: 1.0,
        }
    }

    /// Run one simulation tick.
    pub fn tick(&mut self, dt: f32, ped_graph: &Graph, veh_graph: &Graph) -> TickResult {
        if !self.running {
            return TickResult {
                updates: Vec::new(),
                spawned: Vec::new(),
                despawned: Vec::new(),
            };
        }

        let effective_dt = dt * self.speed;
        self.time += effective_dt;

        tick::tick(&mut self.agents, ped_graph, veh_graph, effective_dt)
    }

    /// Pause the simulation.
    pub fn pause(&mut self) {
        self.running = false;
    }

    /// Resume the simulation.
    pub fn resume(&mut self) {
        self.running = true;
    }

    /// Set simulation speed.
    pub fn set_speed(&mut self, speed: f32) {
        self.speed = speed.clamp(0.1, 10.0);
    }

    /// Get all agent snapshots for rendering.
    pub fn snapshots(&self) -> Vec<AgentSnapshot> {
        self.agents.iter().map(AgentSnapshot::from).collect()
    }

    /// Count agents by type.
    pub fn agent_counts(&self) -> (usize, usize) {
        let peds = self.agents.iter().filter(|a| a.agent_type == AgentType::Pedestrian).count();
        let vehs = self.agents.iter().filter(|a| a.agent_type == AgentType::Vehicle).count();
        (peds, vehs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use koko_nav::{EdgeType, NodeType};

    fn test_graphs() -> (Graph, Graph) {
        let mut ped = Graph::new();
        ped.add_node([0.0, 0.0, 0.0], NodeType::Sidewalk, "c0");
        ped.add_node([10.0, 0.0, 0.0], NodeType::Sidewalk, "c0");
        ped.add_node([20.0, 0.0, 0.0], NodeType::BuildingEntrance, "c0");
        ped.add_node([30.0, 0.0, 0.0], NodeType::BuildingEntrance, "c0");
        ped.add_edge_bidir(0, 1, EdgeType::Walk, 1.0);
        ped.add_edge_bidir(1, 2, EdgeType::Entrance, 0.8);
        ped.add_edge_bidir(1, 3, EdgeType::Walk, 1.0);
        // Ensure node 3 is reachable from node 2
        ped.add_edge_bidir(2, 3, EdgeType::Walk, 1.0);

        let mut veh = Graph::new();
        veh.add_node([0.0, 0.0, 5.0], NodeType::Intersection, "r");
        veh.add_node([50.0, 0.0, 5.0], NodeType::Intersection, "r");
        veh.add_edge(0, 1, EdgeType::Drive, 1.0);
        veh.add_edge(1, 0, EdgeType::Drive, 1.0);

        (ped, veh)
    }

    #[test]
    fn sim_state_lifecycle() {
        let (ped, veh) = test_graphs();
        let chunks = vec![
            ChunkInfo { id: "c0".into(), zone: "downtown".into(), grid_x: 0, grid_z: 0 },
        ];

        let agents = spawn_population(&chunks, &ped, &veh, &spawner::default_population(), 42);
        let mut sim = SimState::new(agents);

        assert!(sim.running);
        let (peds, vehs) = sim.agent_counts();
        assert!(peds > 0 || vehs > 0);

        // Run a few ticks
        for _ in 0..10 {
            sim.tick(0.016, &ped, &veh); // ~60fps
        }

        assert!(sim.time > 0.0);
    }

    #[test]
    fn pause_stops_updates() {
        let (ped, veh) = test_graphs();
        let mut sim = SimState::new(vec![
            Agent::new_pedestrian(0, [0.0, 0.0, 0.0], "ped"),
        ]);
        sim.agents[0].path = vec![0, 1];
        sim.agents[0].state = AgentState::Moving;

        sim.pause();
        let result = sim.tick(1.0, &ped, &veh);
        assert!(result.updates.is_empty());
    }

    #[test]
    fn speed_multiplier() {
        let (ped, veh) = test_graphs();
        let mut sim = SimState::new(vec![]);
        sim.set_speed(2.0);
        sim.tick(1.0, &ped, &veh);
        assert!((sim.time - 2.0).abs() < 0.01);
    }

    #[test]
    fn snapshots_reflect_state() {
        let mut sim = SimState::new(vec![
            Agent::new_pedestrian(0, [10.0, 0.0, 20.0], "ped_a"),
            Agent::new_vehicle(1, [30.0, 0.0, 40.0], "car_a"),
        ]);

        let snaps = sim.snapshots();
        assert_eq!(snaps.len(), 2);
        assert_eq!(snaps[0].position, [10.0, 0.0, 20.0]);
        assert_eq!(snaps[1].asset_id, "car_a");
    }
}
