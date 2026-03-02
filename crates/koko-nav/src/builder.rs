//! Nav builder — generates navigation graphs from world manifest data.
//!
//! Reads chunk boundaries, road positions, and building placements to create:
//! 1. Sidewalk graph (pedestrian navigation)
//! 2. Lane graph (vehicle navigation)
//! Both are output as part of the NavManifest.

use crate::graph::{EdgeType, Graph, NodeType};
use serde::{Deserialize, Serialize};

/// Input data extracted from a WorldManifest.
/// We don't depend on koko-world directly — just take the data we need.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NavBuildInput {
    /// Grid dimensions.
    pub grid_width: i32,
    pub grid_height: i32,
    /// Size of each chunk in world units.
    pub chunk_size: f32,
    /// Chunk data (zone, bounds, building positions).
    pub chunks: Vec<NavChunkInput>,
    /// Road intersection positions.
    pub intersections: Vec<NavIntersectionInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NavChunkInput {
    pub id: String,
    pub grid_x: i32,
    pub grid_z: i32,
    pub zone: String,
    /// Building positions in this chunk (for entrance waypoints).
    pub building_positions: Vec<[f32; 3]>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NavIntersectionInput {
    pub position: [f32; 3],
    pub intersection_type: String,
}

/// Complete navigation output.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NavManifest {
    /// Pedestrian navigation graph (sidewalks, crosswalks, entrances).
    pub pedestrian_graph: Graph,
    /// Vehicle navigation graph (road lanes, intersections).
    pub vehicle_graph: Graph,
    /// Statistics.
    pub stats: NavStats,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NavStats {
    pub pedestrian_nodes: usize,
    pub pedestrian_edges: usize,
    pub vehicle_nodes: usize,
    pub vehicle_edges: usize,
    pub building_entrances: usize,
    pub crosswalks: usize,
}

/// Sidewalk offset from chunk edge (matches placer.rs ROAD_BUFFER area).
const SIDEWALK_OFFSET: f32 = 5.0;
/// Spacing between sidewalk nodes along a chunk edge.
const SIDEWALK_NODE_SPACING: f32 = 15.0;
/// Spacing between road lane nodes.
const LANE_NODE_SPACING: f32 = 12.0;

/// Build the complete navigation system from world data.
pub fn build_nav(input: &NavBuildInput) -> NavManifest {
    let mut ped_graph = Graph::new();
    let mut veh_graph = Graph::new();
    let mut building_entrances = 0;
    let mut crosswalk_count = 0;

    // =========================================================================
    // 1. PEDESTRIAN GRAPH — sidewalk nodes along chunk edges + crosswalks
    // =========================================================================

    // For each chunk, create sidewalk nodes along all 4 edges (inside the chunk)
    // Then connect adjacent chunks via crosswalk nodes at road crossings.

    // Track sidewalk corner nodes per chunk for cross-chunk connections
    // Key: (grid_x, grid_z, corner) → node_id
    // Corners: 0=NW, 1=NE, 2=SW, 3=SE
    let mut chunk_corner_nodes: std::collections::HashMap<(i32, i32, u8), u32> =
        std::collections::HashMap::new();

    // Track sidewalk edge endpoints for cross-chunk connections
    // Key: (grid_x, grid_z, edge, position_index) → node_id
    // Edges: 0=north, 1=south, 2=west, 3=east
    let mut chunk_edge_nodes: std::collections::HashMap<(i32, i32, u8, usize), u32> =
        std::collections::HashMap::new();

    for chunk in &input.chunks {
        let gx = chunk.grid_x;
        let gz = chunk.grid_z;
        let cs = input.chunk_size;
        let wx = gx as f32 * cs;
        let wz = gz as f32 * cs;

        let chunk_id = &chunk.id;

        // Create sidewalk nodes along each edge
        let edges = [
            // (start_x, start_z, dx, dz, edge_id)
            (wx + SIDEWALK_OFFSET, wz + SIDEWALK_OFFSET, 1.0_f32, 0.0_f32, 0u8), // North
            (wx + SIDEWALK_OFFSET, wz + cs - SIDEWALK_OFFSET, 1.0, 0.0, 1),       // South
            (wx + SIDEWALK_OFFSET, wz + SIDEWALK_OFFSET, 0.0, 1.0, 2),            // West
            (wx + cs - SIDEWALK_OFFSET, wz + SIDEWALK_OFFSET, 0.0, 1.0, 3),       // East
        ];

        for &(sx, sz, dx, dz, edge_id) in &edges {
            let edge_length = cs - 2.0 * SIDEWALK_OFFSET;
            let node_count = (edge_length / SIDEWALK_NODE_SPACING).ceil() as usize + 1;
            let mut prev_id = None;

            for i in 0..node_count {
                let t = if node_count > 1 {
                    i as f32 / (node_count - 1) as f32
                } else {
                    0.5
                };
                let x = sx + dx * t * edge_length;
                let z = sz + dz * t * edge_length;

                let node_id = ped_graph.add_node([x, 0.0, z], NodeType::Sidewalk, chunk_id);
                chunk_edge_nodes.insert((gx, gz, edge_id, i), node_id);

                // Store corner references
                if i == 0 {
                    match edge_id {
                        0 => { chunk_corner_nodes.insert((gx, gz, 0), node_id); }
                        1 => { chunk_corner_nodes.insert((gx, gz, 2), node_id); }
                        2 => { chunk_corner_nodes.insert((gx, gz, 0), node_id); }
                        _ => { chunk_corner_nodes.insert((gx, gz, 1), node_id); }
                    }
                }

                // Connect to previous node on same edge
                if let Some(prev) = prev_id {
                    ped_graph.add_edge_bidir(prev, node_id, EdgeType::Walk, 1.0);
                }
                prev_id = Some(node_id);
            }
        }

        // Connect the 4 sidewalk edges at chunk corners to form a rectangle
        let edge_len = cs - 2.0 * SIDEWALK_OFFSET;
        let last_idx = (edge_len / SIDEWALK_NODE_SPACING).ceil() as usize;

        // NW corner: north start ↔ west start
        let n0 = chunk_edge_nodes.get(&(gx, gz, 0, 0)).copied();
        let w0 = chunk_edge_nodes.get(&(gx, gz, 2, 0)).copied();
        if let (Some(a), Some(b)) = (n0, w0) {
            if a != b { ped_graph.add_edge_bidir(a, b, EdgeType::Walk, 1.0); }
        }
        // NE corner: north end ↔ east start
        let n_end = chunk_edge_nodes.get(&(gx, gz, 0, last_idx)).copied();
        let e0 = chunk_edge_nodes.get(&(gx, gz, 3, 0)).copied();
        if let (Some(a), Some(b)) = (n_end, e0) {
            if a != b { ped_graph.add_edge_bidir(a, b, EdgeType::Walk, 1.0); }
        }
        // SW corner: south start ↔ west end
        let s0 = chunk_edge_nodes.get(&(gx, gz, 1, 0)).copied();
        let w_end = chunk_edge_nodes.get(&(gx, gz, 2, last_idx)).copied();
        if let (Some(a), Some(b)) = (s0, w_end) {
            if a != b { ped_graph.add_edge_bidir(a, b, EdgeType::Walk, 1.0); }
        }
        // SE corner: south end ↔ east end
        let s_end = chunk_edge_nodes.get(&(gx, gz, 1, last_idx)).copied();
        let e_end = chunk_edge_nodes.get(&(gx, gz, 3, last_idx)).copied();
        if let (Some(a), Some(b)) = (s_end, e_end) {
            if a != b { ped_graph.add_edge_bidir(a, b, EdgeType::Walk, 1.0); }
        }

        // Add building entrance waypoints
        for bpos in &chunk.building_positions {
            let entrance_id =
                ped_graph.add_node(*bpos, NodeType::BuildingEntrance, chunk_id);
            building_entrances += 1;

            // Connect entrance to nearest sidewalk node
            if let Some(nearest) = ped_graph.nearest_node(*bpos, Some(NodeType::Sidewalk)) {
                ped_graph.add_edge_bidir(nearest, entrance_id, EdgeType::Entrance, 0.8);
            }
        }
    }

    // Cross-chunk connections: crosswalks between adjacent chunks
    for chunk in &input.chunks {
        let gx = chunk.grid_x;
        let gz = chunk.grid_z;

        // Connect to east neighbor
        if gx + 1 < input.grid_width {
            let node_count =
                ((input.chunk_size - 2.0 * SIDEWALK_OFFSET) / SIDEWALK_NODE_SPACING).ceil()
                    as usize;
            // Connect east edge of this chunk to west edge of next chunk
            let mid = node_count / 2;
            let this_east = chunk_edge_nodes.get(&(gx, gz, 3, mid)).copied();
            let next_west = chunk_edge_nodes.get(&(gx + 1, gz, 2, mid)).copied();

            if let (Some(a), Some(b)) = (this_east, next_west) {
                // Add crosswalk nodes at the road
                let pos_a = ped_graph.node(a).unwrap().position;
                let pos_b = ped_graph.node(b).unwrap().position;
                let mid_x = (pos_a[0] + pos_b[0]) / 2.0;
                let mid_z = (pos_a[2] + pos_b[2]) / 2.0;

                let cw = ped_graph.add_node(
                    [mid_x, 0.0, mid_z],
                    NodeType::Crosswalk,
                    &chunk.id,
                );
                ped_graph.add_edge_bidir(a, cw, EdgeType::Crosswalk, 0.6);
                ped_graph.add_edge_bidir(cw, b, EdgeType::Crosswalk, 0.6);
                crosswalk_count += 1;
            }
        }

        // Connect to south neighbor
        if gz + 1 < input.grid_height {
            let node_count =
                ((input.chunk_size - 2.0 * SIDEWALK_OFFSET) / SIDEWALK_NODE_SPACING).ceil()
                    as usize;
            let mid = node_count / 2;
            let this_south = chunk_edge_nodes.get(&(gx, gz, 1, mid)).copied();
            let next_north = chunk_edge_nodes.get(&(gx, gz + 1, 0, mid)).copied();

            if let (Some(a), Some(b)) = (this_south, next_north) {
                let pos_a = ped_graph.node(a).unwrap().position;
                let pos_b = ped_graph.node(b).unwrap().position;
                let mid_x = (pos_a[0] + pos_b[0]) / 2.0;
                let mid_z = (pos_a[2] + pos_b[2]) / 2.0;

                let cw = ped_graph.add_node(
                    [mid_x, 0.0, mid_z],
                    NodeType::Crosswalk,
                    &chunk.id,
                );
                ped_graph.add_edge_bidir(a, cw, EdgeType::Crosswalk, 0.6);
                ped_graph.add_edge_bidir(cw, b, EdgeType::Crosswalk, 0.6);
                crosswalk_count += 1;
            }
        }
    }

    // =========================================================================
    // 2. VEHICLE GRAPH — lane nodes along roads + intersection connections
    // =========================================================================

    // Create intersection nodes first
    let mut intersection_node_ids: Vec<u32> = Vec::new();
    for inter in &input.intersections {
        let node_id = veh_graph.add_node(
            inter.position,
            NodeType::Intersection,
            "road",
        );
        intersection_node_ids.push(node_id);
    }

    // Connect intersections along grid lines with lane nodes between them
    // E-W connections (along Z grid lines)
    for gz in 0..=input.grid_height {
        let z = gz as f32 * input.chunk_size;
        let mut row_intersections: Vec<u32> = Vec::new();

        for &int_id in &intersection_node_ids {
            let node = veh_graph.node(int_id).unwrap();
            if (node.position[2] - z).abs() < 1.0 {
                row_intersections.push(int_id);
            }
        }

        // Sort by X position
        row_intersections.sort_by(|&a, &b| {
            let pa = veh_graph.node(a).unwrap().position[0];
            let pb = veh_graph.node(b).unwrap().position[0];
            pa.partial_cmp(&pb).unwrap()
        });

        // Connect consecutive intersections with lane nodes
        for pair in row_intersections.windows(2) {
            let (from, to) = (pair[0], pair[1]);
            let p1 = veh_graph.node(from).unwrap().position;
            let p2 = veh_graph.node(to).unwrap().position;
            let dist = (p2[0] - p1[0]).abs();
            let lane_count = (dist / LANE_NODE_SPACING).ceil() as usize;

            // Forward lane (left to right)
            let mut prev = from;
            for i in 1..lane_count {
                let t = i as f32 / lane_count as f32;
                let x = p1[0] + t * (p2[0] - p1[0]);
                let lane_z = z + 2.0; // Offset for forward lane
                let lane_id = veh_graph.add_node([x, 0.0, lane_z], NodeType::RoadLane, "road");
                veh_graph.add_edge(prev, lane_id, EdgeType::Drive, 1.0);
                prev = lane_id;
            }
            veh_graph.add_edge(prev, to, EdgeType::Drive, 1.0);

            // Reverse lane (right to left)
            prev = to;
            for i in 1..lane_count {
                let t = i as f32 / lane_count as f32;
                let x = p2[0] + t * (p1[0] - p2[0]);
                let lane_z = z - 2.0; // Offset for reverse lane
                let lane_id = veh_graph.add_node([x, 0.0, lane_z], NodeType::RoadLane, "road");
                veh_graph.add_edge(prev, lane_id, EdgeType::Drive, 1.0);
                prev = lane_id;
            }
            veh_graph.add_edge(prev, from, EdgeType::Drive, 1.0);
        }
    }

    // N-S connections (along X grid lines)
    for gx in 0..=input.grid_width {
        let x = gx as f32 * input.chunk_size;
        let mut col_intersections: Vec<u32> = Vec::new();

        for &int_id in &intersection_node_ids {
            let node = veh_graph.node(int_id).unwrap();
            if (node.position[0] - x).abs() < 1.0 {
                col_intersections.push(int_id);
            }
        }

        col_intersections.sort_by(|&a, &b| {
            let pa = veh_graph.node(a).unwrap().position[2];
            let pb = veh_graph.node(b).unwrap().position[2];
            pa.partial_cmp(&pb).unwrap()
        });

        for pair in col_intersections.windows(2) {
            let (from, to) = (pair[0], pair[1]);
            let p1 = veh_graph.node(from).unwrap().position;
            let p2 = veh_graph.node(to).unwrap().position;
            let dist = (p2[2] - p1[2]).abs();
            let lane_count = (dist / LANE_NODE_SPACING).ceil() as usize;

            // Forward lane (top to bottom)
            let mut prev = from;
            for i in 1..lane_count {
                let t = i as f32 / lane_count as f32;
                let z = p1[2] + t * (p2[2] - p1[2]);
                let lane_x = x + 2.0;
                let lane_id = veh_graph.add_node([lane_x, 0.0, z], NodeType::RoadLane, "road");
                veh_graph.add_edge(prev, lane_id, EdgeType::Drive, 1.0);
                prev = lane_id;
            }
            veh_graph.add_edge(prev, to, EdgeType::Drive, 1.0);

            // Reverse lane
            prev = to;
            for i in 1..lane_count {
                let t = i as f32 / lane_count as f32;
                let z = p2[2] + t * (p1[2] - p2[2]);
                let lane_x = x - 2.0;
                let lane_id = veh_graph.add_node([lane_x, 0.0, z], NodeType::RoadLane, "road");
                veh_graph.add_edge(prev, lane_id, EdgeType::Drive, 1.0);
                prev = lane_id;
            }
            veh_graph.add_edge(prev, from, EdgeType::Drive, 1.0);
        }
    }

    // Add turn connections at intersections (all-way turns)
    for &int_id in &intersection_node_ids {
        let incoming: Vec<u32> = veh_graph
            .edges
            .iter()
            .filter(|e| e.to == int_id)
            .map(|e| e.from)
            .collect();
        let outgoing: Vec<u32> = veh_graph
            .neighbors(int_id)
            .iter()
            .map(|e| e.to)
            .collect();

        // Allow turns from any incoming to any outgoing
        // (the intersection node itself is the "turn" point)
        // Edges already go through the intersection node, so turns happen naturally.
        // Add slight delay for turning
        let _ = (incoming, outgoing); // Used implicitly through graph structure
    }

    let stats = NavStats {
        pedestrian_nodes: ped_graph.node_count(),
        pedestrian_edges: ped_graph.edge_count(),
        vehicle_nodes: veh_graph.node_count(),
        vehicle_edges: veh_graph.edge_count(),
        building_entrances,
        crosswalks: crosswalk_count,
    };

    NavManifest {
        pedestrian_graph: ped_graph,
        vehicle_graph: veh_graph,
        stats,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn small_city_input() -> NavBuildInput {
        let mut chunks = Vec::new();
        for gx in 0..4 {
            for gz in 0..4 {
                let zone = if gx >= 1 && gx <= 2 && gz >= 1 && gz <= 2 {
                    "downtown"
                } else {
                    "suburbs"
                };
                let wx = gx as f32 * 50.0;
                let wz = gz as f32 * 50.0;
                chunks.push(NavChunkInput {
                    id: format!("chunk_{}_{}", gx, gz),
                    grid_x: gx,
                    grid_z: gz,
                    zone: zone.to_string(),
                    building_positions: vec![[wx + 25.0, 0.0, wz + 25.0]],
                });
            }
        }

        let mut intersections = Vec::new();
        for gx in 0..=4 {
            for gz in 0..=4 {
                intersections.push(NavIntersectionInput {
                    position: [gx as f32 * 50.0, 0.0, gz as f32 * 50.0],
                    intersection_type: "4way".to_string(),
                });
            }
        }

        NavBuildInput {
            grid_width: 4,
            grid_height: 4,
            chunk_size: 50.0,
            chunks,
            intersections,
        }
    }

    #[test]
    fn builds_pedestrian_graph() {
        let input = small_city_input();
        let nav = build_nav(&input);
        assert!(nav.stats.pedestrian_nodes > 50);
        assert!(nav.stats.pedestrian_edges > 50);
        println!(
            "Pedestrian: {} nodes, {} edges",
            nav.stats.pedestrian_nodes, nav.stats.pedestrian_edges
        );
    }

    #[test]
    fn builds_vehicle_graph() {
        let input = small_city_input();
        let nav = build_nav(&input);
        assert!(nav.stats.vehicle_nodes > 20);
        assert!(nav.stats.vehicle_edges > 20);
        println!(
            "Vehicle: {} nodes, {} edges",
            nav.stats.vehicle_nodes, nav.stats.vehicle_edges
        );
    }

    #[test]
    fn has_building_entrances() {
        let input = small_city_input();
        let nav = build_nav(&input);
        assert_eq!(nav.stats.building_entrances, 16); // 4x4 = 16 chunks, 1 building each
    }

    #[test]
    fn has_crosswalks() {
        let input = small_city_input();
        let nav = build_nav(&input);
        assert!(nav.stats.crosswalks > 0);
        println!("Crosswalks: {}", nav.stats.crosswalks);
    }

    #[test]
    fn pedestrian_can_pathfind() {
        let input = small_city_input();
        let nav = build_nav(&input);

        // Find path between two building entrances
        let entrances = nav.pedestrian_graph.nodes_of_type(NodeType::BuildingEntrance);
        assert!(entrances.len() >= 2);

        let path = crate::pathfind::find_path(&nav.pedestrian_graph, entrances[0], entrances[1]);
        assert!(path.is_some(), "Should find path between buildings");
        let p = path.unwrap();
        assert!(p.nodes.len() >= 2);
        println!(
            "Ped path: {} nodes, cost {:.1}",
            p.nodes.len(),
            p.total_cost
        );
    }

    #[test]
    fn vehicle_can_pathfind() {
        let input = small_city_input();
        let nav = build_nav(&input);

        let intersections = nav.vehicle_graph.nodes_of_type(NodeType::Intersection);
        assert!(intersections.len() >= 2);

        let path =
            crate::pathfind::find_path(&nav.vehicle_graph, intersections[0], intersections[1]);
        assert!(path.is_some(), "Should find path between intersections");
    }

    #[test]
    fn json_roundtrip() {
        let input = small_city_input();
        let nav = build_nav(&input);
        let json = serde_json::to_string(&nav).unwrap();
        assert!(json.len() > 100);
        let _back: NavManifest = serde_json::from_str(&json).unwrap();
    }
}
