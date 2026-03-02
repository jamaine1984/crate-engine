//! Population spawner — creates pedestrians and vehicles for the city.
//!
//! Spawns agents based on zone density. Downtown gets more pedestrians,
//! commercial areas get parked cars, suburbs get fewer of both.

use crate::agent::{Agent, AgentId};
use koko_nav::{Graph, NodeType};
use serde::{Deserialize, Serialize};

/// Spawn configuration per zone.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZonePopulation {
    pub zone: String,
    pub pedestrians: usize,
    pub vehicles: usize,
}

/// Default population densities per zone.
pub fn default_population() -> Vec<ZonePopulation> {
    vec![
        ZonePopulation { zone: "downtown".into(), pedestrians: 8, vehicles: 4 },
        ZonePopulation { zone: "commercial".into(), pedestrians: 5, vehicles: 3 },
        ZonePopulation { zone: "suburbs".into(), pedestrians: 2, vehicles: 2 },
        ZonePopulation { zone: "industrial".into(), pedestrians: 1, vehicles: 3 },
        ZonePopulation { zone: "park".into(), pedestrians: 4, vehicles: 0 },
    ]
}

/// Chunk info needed for spawning.
#[derive(Debug, Clone)]
pub struct ChunkInfo {
    pub id: String,
    pub zone: String,
    pub grid_x: i32,
    pub grid_z: i32,
}

/// Pedestrian asset IDs to pick from.
const PED_ASSETS: &[&str] = &["pedestrian_a", "pedestrian_b", "pedestrian_c"];
/// Vehicle asset IDs to pick from.
const VEH_ASSETS: &[&str] = &[
    "kenney_cars_sedan_a", "kenney_cars_sedan_b", "kenney_cars_suv",
    "kenney_cars_hatchback", "kenney_cars_taxi",
];

/// Simple deterministic RNG for spawning (matches koko-world's SplitMix64).
struct SpawnRng {
    state: u64,
}

impl SpawnRng {
    fn new(seed: u64) -> Self {
        Self { state: seed.wrapping_add(0x9E3779B97F4A7C15) }
    }

    fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E3779B97F4A7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
        z ^ (z >> 31)
    }

    fn range_usize(&mut self, min: usize, max: usize) -> usize {
        if min >= max { return min; }
        min + (self.next_u64() as usize % (max - min + 1))
    }

    fn pick<'a>(&mut self, items: &'a [&str]) -> &'a str {
        items[self.range_usize(0, items.len() - 1)]
    }
}

/// Spawn all agents for the city.
///
/// Creates pedestrians at building entrances and vehicles at road lane nodes.
/// Each agent gets a schedule of destinations to cycle through.
pub fn spawn_population(
    chunks: &[ChunkInfo],
    ped_graph: &Graph,
    veh_graph: &Graph,
    population: &[ZonePopulation],
    seed: u64,
) -> Vec<Agent> {
    let mut agents: Vec<Agent> = Vec::new();
    let mut rng = SpawnRng::new(seed);
    let mut next_id: AgentId = 0;

    // Get all building entrances and intersection nodes
    let entrances = ped_graph.nodes_of_type(NodeType::BuildingEntrance);
    let sidewalks = ped_graph.nodes_of_type(NodeType::Sidewalk);
    let intersections = veh_graph.nodes_of_type(NodeType::Intersection);
    let lane_nodes = veh_graph.nodes_of_type(NodeType::RoadLane);

    for chunk in chunks {
        let pop = population.iter().find(|p| p.zone == chunk.zone);
        let (ped_count, veh_count) = match pop {
            Some(p) => (p.pedestrians, p.vehicles),
            None => (2, 1),
        };

        // Find entrances in this chunk
        let chunk_entrances: Vec<u32> = entrances
            .iter()
            .filter(|&&n| ped_graph.node(n).map_or(false, |node| node.chunk_id == chunk.id))
            .copied()
            .collect();

        // Spawn pedestrians at building entrances
        let ped_spawn_count = ped_count.min(chunk_entrances.len().max(1));
        for i in 0..ped_spawn_count {
            let spawn_node = if !chunk_entrances.is_empty() {
                chunk_entrances[i % chunk_entrances.len()]
            } else if !sidewalks.is_empty() {
                sidewalks[rng.range_usize(0, sidewalks.len() - 1)]
            } else {
                continue;
            };

            let pos = ped_graph.node(spawn_node).unwrap().position;
            let asset = rng.pick(PED_ASSETS);
            let mut agent = Agent::new_pedestrian(next_id, pos, asset);
            next_id += 1;

            // Build a schedule: visit 2-4 random destinations
            let dest_count = rng.range_usize(2, 4);
            let mut schedule = vec![spawn_node]; // Start at home
            for _ in 0..dest_count {
                if !entrances.is_empty() {
                    let dest = entrances[rng.range_usize(0, entrances.len() - 1)];
                    schedule.push(dest);
                }
            }
            agent.schedule = schedule;
            agent.current_chunk = chunk.id.clone();

            agents.push(agent);
        }

        // Spawn vehicles near intersections
        for _ in 0..veh_count {
            let spawn_node = if !intersections.is_empty() {
                intersections[rng.range_usize(0, intersections.len() - 1)]
            } else if !lane_nodes.is_empty() {
                lane_nodes[rng.range_usize(0, lane_nodes.len() - 1)]
            } else {
                continue;
            };

            let pos = veh_graph.node(spawn_node).unwrap().position;
            let asset = rng.pick(VEH_ASSETS);
            let mut agent = Agent::new_vehicle(next_id, pos, asset);
            next_id += 1;

            // Vehicles drive between intersections
            let dest_count = rng.range_usize(2, 4);
            let mut schedule = vec![spawn_node];
            for _ in 0..dest_count {
                if !intersections.is_empty() {
                    let dest = intersections[rng.range_usize(0, intersections.len() - 1)];
                    schedule.push(dest);
                }
            }
            agent.schedule = schedule;
            agent.current_chunk = chunk.id.clone();

            agents.push(agent);
        }
    }

    agents
}

#[cfg(test)]
mod tests {
    use super::*;
    use koko_nav::{EdgeType};

    fn test_graphs() -> (Graph, Graph) {
        let mut ped = Graph::new();
        ped.add_node([0.0, 0.0, 0.0], NodeType::Sidewalk, "chunk_0_0");
        ped.add_node([10.0, 0.0, 0.0], NodeType::Sidewalk, "chunk_0_0");
        ped.add_node([20.0, 0.0, 0.0], NodeType::BuildingEntrance, "chunk_0_0");
        ped.add_node([50.0, 0.0, 0.0], NodeType::Sidewalk, "chunk_1_0");
        ped.add_node([60.0, 0.0, 0.0], NodeType::BuildingEntrance, "chunk_1_0");
        ped.add_edge_bidir(0, 1, EdgeType::Walk, 1.0);
        ped.add_edge_bidir(1, 2, EdgeType::Entrance, 0.8);
        ped.add_edge_bidir(1, 3, EdgeType::Walk, 1.0);
        ped.add_edge_bidir(3, 4, EdgeType::Entrance, 0.8);

        let mut veh = Graph::new();
        veh.add_node([0.0, 0.0, 5.0], NodeType::Intersection, "road");
        veh.add_node([50.0, 0.0, 5.0], NodeType::Intersection, "road");
        veh.add_node([25.0, 0.0, 5.0], NodeType::RoadLane, "road");
        veh.add_edge(0, 2, EdgeType::Drive, 1.0);
        veh.add_edge(2, 1, EdgeType::Drive, 1.0);

        (ped, veh)
    }

    #[test]
    fn spawns_agents() {
        let (ped, veh) = test_graphs();
        let chunks = vec![
            ChunkInfo { id: "chunk_0_0".into(), zone: "downtown".into(), grid_x: 0, grid_z: 0 },
            ChunkInfo { id: "chunk_1_0".into(), zone: "suburbs".into(), grid_x: 1, grid_z: 0 },
        ];

        let agents = spawn_population(&chunks, &ped, &veh, &default_population(), 42);
        assert!(!agents.is_empty());

        let peds: Vec<_> = agents.iter().filter(|a| a.agent_type == crate::agent::AgentType::Pedestrian).collect();
        let vehs: Vec<_> = agents.iter().filter(|a| a.agent_type == crate::agent::AgentType::Vehicle).collect();

        assert!(!peds.is_empty(), "Should spawn pedestrians");
        assert!(!vehs.is_empty(), "Should spawn vehicles");
        println!("Spawned {} pedestrians, {} vehicles", peds.len(), vehs.len());
    }

    #[test]
    fn agents_have_schedules() {
        let (ped, veh) = test_graphs();
        let chunks = vec![
            ChunkInfo { id: "chunk_0_0".into(), zone: "downtown".into(), grid_x: 0, grid_z: 0 },
        ];

        let agents = spawn_population(&chunks, &ped, &veh, &default_population(), 42);
        for agent in &agents {
            assert!(!agent.schedule.is_empty(), "Agent {} should have schedule", agent.id);
        }
    }

    #[test]
    fn unique_ids() {
        let (ped, veh) = test_graphs();
        let chunks = vec![
            ChunkInfo { id: "chunk_0_0".into(), zone: "downtown".into(), grid_x: 0, grid_z: 0 },
            ChunkInfo { id: "chunk_1_0".into(), zone: "commercial".into(), grid_x: 1, grid_z: 0 },
        ];

        let agents = spawn_population(&chunks, &ped, &veh, &default_population(), 42);
        let ids: Vec<_> = agents.iter().map(|a| a.id).collect();
        let mut unique = ids.clone();
        unique.sort();
        unique.dedup();
        assert_eq!(ids.len(), unique.len(), "All agent IDs should be unique");
    }

    #[test]
    fn deterministic() {
        let (ped, veh) = test_graphs();
        let chunks = vec![
            ChunkInfo { id: "chunk_0_0".into(), zone: "downtown".into(), grid_x: 0, grid_z: 0 },
        ];

        let a1 = spawn_population(&chunks, &ped, &veh, &default_population(), 42);
        let a2 = spawn_population(&chunks, &ped, &veh, &default_population(), 42);

        assert_eq!(a1.len(), a2.len());
        for (a, b) in a1.iter().zip(a2.iter()) {
            assert_eq!(a.id, b.id);
            assert_eq!(a.position, b.position);
            assert_eq!(a.asset_id, b.asset_id);
        }
    }
}
