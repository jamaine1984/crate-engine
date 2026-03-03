//! KOKO Navigation — pathfinding and navigation graphs for world simulation.
//!
//! Generates pedestrian sidewalk graphs and vehicle lane graphs from world
//! manifests. Powers NPC walking, vehicle driving, and crowd behavior.
//!
//! ## Architecture
//!
//! - **graph.rs** — Generic nav graph (nodes + directed weighted edges)
//! - **pathfind.rs** — A* shortest path search
//! - **builder.rs** — Builds nav/lane graphs from world manifest data

pub mod builder;
pub mod graph;
pub mod pathfind;

pub use builder::{build_nav, NavBuildInput, NavChunkInput, NavIntersectionInput, NavManifest};
pub use graph::{EdgeType, Graph, NavEdge, NavNode, NodeType};
pub use pathfind::{find_path, find_path_to_nearest, PathResult};
