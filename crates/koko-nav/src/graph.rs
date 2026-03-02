//! Generic navigation graph — shared between pedestrian and vehicle systems.
//!
//! A simple directed graph with weighted edges. Nodes have world-space positions.
//! Used as the foundation for both NavGraph (sidewalks) and LaneGraph (roads).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// A node in the navigation graph.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NavNode {
    pub id: u32,
    /// World-space position [x, y, z].
    pub position: [f32; 3],
    /// Node type for filtering/behavior.
    pub node_type: NodeType,
    /// Which chunk this node belongs to (for spatial queries).
    pub chunk_id: String,
}

/// Types of navigation nodes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeType {
    /// Sidewalk waypoint — pedestrians walk here.
    Sidewalk,
    /// Crosswalk — pedestrians cross the road.
    Crosswalk,
    /// Building entrance — NPC destination/spawn.
    BuildingEntrance,
    /// Park path — walkable path in parks.
    ParkPath,
    /// Bus stop — NPCs wait here.
    BusStop,
    /// Road lane point — vehicles drive here.
    RoadLane,
    /// Intersection — vehicles turn/wait here.
    Intersection,
    /// Parking spot — vehicles park here.
    ParkingSpot,
}

/// A directed edge between two nodes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NavEdge {
    pub from: u32,
    pub to: u32,
    /// Travel cost (typically distance in world units).
    pub cost: f32,
    /// Edge type affects movement behavior.
    pub edge_type: EdgeType,
    /// Speed limit multiplier (1.0 = normal, 0.5 = slow zone).
    pub speed_factor: f32,
}

/// Types of navigation edges.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EdgeType {
    /// Normal sidewalk walking.
    Walk,
    /// Crossing a road (check traffic first).
    Crosswalk,
    /// Entering/exiting a building.
    Entrance,
    /// Park path (relaxed walking).
    Path,
    /// Vehicle road lane (normal driving).
    Drive,
    /// Vehicle turning at intersection.
    Turn,
    /// Vehicle entering/leaving parking.
    Parking,
}

/// A navigation graph.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Graph {
    pub nodes: Vec<NavNode>,
    pub edges: Vec<NavEdge>,
    #[serde(skip)]
    adjacency: HashMap<u32, Vec<usize>>,
}

impl Graph {
    pub fn new() -> Self {
        Self {
            nodes: Vec::new(),
            edges: Vec::new(),
            adjacency: HashMap::new(),
        }
    }

    /// Add a node and return its ID.
    pub fn add_node(&mut self, position: [f32; 3], node_type: NodeType, chunk_id: &str) -> u32 {
        let id = self.nodes.len() as u32;
        self.nodes.push(NavNode {
            id,
            position,
            node_type,
            chunk_id: chunk_id.to_string(),
        });
        id
    }

    /// Add a directed edge.
    pub fn add_edge(&mut self, from: u32, to: u32, edge_type: EdgeType, speed_factor: f32) {
        let cost = self.distance(from, to);
        let idx = self.edges.len();
        self.edges.push(NavEdge {
            from,
            to,
            cost,
            edge_type,
            speed_factor,
        });
        self.adjacency.entry(from).or_default().push(idx);
    }

    /// Add a bidirectional edge (two directed edges).
    pub fn add_edge_bidir(&mut self, a: u32, b: u32, edge_type: EdgeType, speed_factor: f32) {
        self.add_edge(a, b, edge_type, speed_factor);
        self.add_edge(b, a, edge_type, speed_factor);
    }

    /// Get all outgoing edges from a node.
    pub fn neighbors(&self, node_id: u32) -> Vec<&NavEdge> {
        self.adjacency
            .get(&node_id)
            .map(|indices| indices.iter().map(|&i| &self.edges[i]).collect())
            .unwrap_or_default()
    }

    /// Get node by ID.
    pub fn node(&self, id: u32) -> Option<&NavNode> {
        self.nodes.get(id as usize)
    }

    /// Euclidean distance between two nodes.
    fn distance(&self, a: u32, b: u32) -> f32 {
        let na = &self.nodes[a as usize];
        let nb = &self.nodes[b as usize];
        let dx = na.position[0] - nb.position[0];
        let dy = na.position[1] - nb.position[1];
        let dz = na.position[2] - nb.position[2];
        (dx * dx + dy * dy + dz * dz).sqrt()
    }

    /// Rebuild adjacency map (needed after deserialization).
    pub fn rebuild_adjacency(&mut self) {
        self.adjacency.clear();
        for (idx, edge) in self.edges.iter().enumerate() {
            self.adjacency.entry(edge.from).or_default().push(idx);
        }
    }

    /// Find the nearest node to a world position.
    pub fn nearest_node(&self, pos: [f32; 3], filter: Option<NodeType>) -> Option<u32> {
        self.nodes
            .iter()
            .filter(|n| filter.is_none() || Some(n.node_type) == filter)
            .min_by(|a, b| {
                let da = dist_sq(pos, a.position);
                let db = dist_sq(pos, b.position);
                da.partial_cmp(&db).unwrap()
            })
            .map(|n| n.id)
    }

    /// Find all nodes of a given type.
    pub fn nodes_of_type(&self, node_type: NodeType) -> Vec<u32> {
        self.nodes
            .iter()
            .filter(|n| n.node_type == node_type)
            .map(|n| n.id)
            .collect()
    }

    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }

    pub fn edge_count(&self) -> usize {
        self.edges.len()
    }
}

fn dist_sq(a: [f32; 3], b: [f32; 3]) -> f32 {
    let dx = a[0] - b[0];
    let dy = a[1] - b[1];
    let dz = a[2] - b[2];
    dx * dx + dy * dy + dz * dz
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_nodes_and_edges() {
        let mut g = Graph::new();
        let a = g.add_node([0.0, 0.0, 0.0], NodeType::Sidewalk, "chunk_0_0");
        let b = g.add_node([10.0, 0.0, 0.0], NodeType::Sidewalk, "chunk_0_0");
        let c = g.add_node([10.0, 0.0, 10.0], NodeType::Crosswalk, "chunk_0_0");

        g.add_edge(a, b, EdgeType::Walk, 1.0);
        g.add_edge(b, c, EdgeType::Crosswalk, 0.8);

        assert_eq!(g.node_count(), 3);
        assert_eq!(g.edge_count(), 2);

        let nb = g.neighbors(a);
        assert_eq!(nb.len(), 1);
        assert_eq!(nb[0].to, b);
        assert!((nb[0].cost - 10.0).abs() < 0.01);
    }

    #[test]
    fn bidir_edges() {
        let mut g = Graph::new();
        let a = g.add_node([0.0, 0.0, 0.0], NodeType::Sidewalk, "c");
        let b = g.add_node([5.0, 0.0, 0.0], NodeType::Sidewalk, "c");
        g.add_edge_bidir(a, b, EdgeType::Walk, 1.0);

        assert_eq!(g.edge_count(), 2);
        assert_eq!(g.neighbors(a).len(), 1);
        assert_eq!(g.neighbors(b).len(), 1);
    }

    #[test]
    fn nearest_node() {
        let mut g = Graph::new();
        g.add_node([0.0, 0.0, 0.0], NodeType::Sidewalk, "c");
        g.add_node([100.0, 0.0, 0.0], NodeType::Sidewalk, "c");
        g.add_node([50.0, 0.0, 50.0], NodeType::Crosswalk, "c");

        let nearest = g.nearest_node([48.0, 0.0, 48.0], None).unwrap();
        assert_eq!(nearest, 2);

        let nearest_sw = g.nearest_node([48.0, 0.0, 48.0], Some(NodeType::Sidewalk)).unwrap();
        assert_eq!(nearest_sw, 0);
    }

    #[test]
    fn nodes_of_type() {
        let mut g = Graph::new();
        g.add_node([0.0, 0.0, 0.0], NodeType::Sidewalk, "c");
        g.add_node([10.0, 0.0, 0.0], NodeType::Crosswalk, "c");
        g.add_node([20.0, 0.0, 0.0], NodeType::Sidewalk, "c");

        let sidewalks = g.nodes_of_type(NodeType::Sidewalk);
        assert_eq!(sidewalks.len(), 2);
    }

    #[test]
    fn json_roundtrip() {
        let mut g = Graph::new();
        let a = g.add_node([0.0, 0.0, 0.0], NodeType::Sidewalk, "c0");
        let b = g.add_node([10.0, 0.0, 0.0], NodeType::Intersection, "c0");
        g.add_edge(a, b, EdgeType::Walk, 1.0);

        let json = serde_json::to_string(&g).unwrap();
        let mut back: Graph = serde_json::from_str(&json).unwrap();
        back.rebuild_adjacency();

        assert_eq!(back.node_count(), 2);
        assert_eq!(back.edge_count(), 1);
        assert_eq!(back.neighbors(a).len(), 1);
    }
}
