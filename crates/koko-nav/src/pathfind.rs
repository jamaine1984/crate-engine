//! A* pathfinding on navigation graphs.
//!
//! Finds shortest paths for both pedestrians (on sidewalk graph)
//! and vehicles (on lane graph). Returns a sequence of node IDs
//! that the agent follows.

use crate::graph::Graph;
use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap};

/// A path result from A* search.
#[derive(Debug, Clone)]
pub struct PathResult {
    /// Ordered list of node IDs from start to goal.
    pub nodes: Vec<u32>,
    /// Total path cost (distance).
    pub total_cost: f32,
}

/// Priority queue entry for A*.
#[derive(Debug)]
struct AStarEntry {
    node: u32,
    f_score: f32, // g + h
}

impl PartialEq for AStarEntry {
    fn eq(&self, other: &Self) -> bool {
        self.node == other.node
    }
}

impl Eq for AStarEntry {}

impl PartialOrd for AStarEntry {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for AStarEntry {
    fn cmp(&self, other: &Self) -> Ordering {
        // Reverse ordering for min-heap (BinaryHeap is max-heap by default)
        other
            .f_score
            .partial_cmp(&self.f_score)
            .unwrap_or(Ordering::Equal)
    }
}

/// Find the shortest path between two nodes using A*.
///
/// Returns None if no path exists.
pub fn find_path(graph: &Graph, start: u32, goal: u32) -> Option<PathResult> {
    if start == goal {
        return Some(PathResult {
            nodes: vec![start],
            total_cost: 0.0,
        });
    }

    let goal_pos = graph.node(goal)?.position;

    let mut open = BinaryHeap::new();
    let mut g_score: HashMap<u32, f32> = HashMap::new();
    let mut came_from: HashMap<u32, u32> = HashMap::new();
    let mut closed: HashMap<u32, bool> = HashMap::new();

    g_score.insert(start, 0.0);
    open.push(AStarEntry {
        node: start,
        f_score: heuristic(graph.node(start)?.position, goal_pos),
    });

    while let Some(current) = open.pop() {
        if current.node == goal {
            // Reconstruct path
            let mut path = vec![goal];
            let mut node = goal;
            while let Some(&prev) = came_from.get(&node) {
                path.push(prev);
                node = prev;
            }
            path.reverse();
            return Some(PathResult {
                nodes: path,
                total_cost: g_score[&goal],
            });
        }

        if closed.contains_key(&current.node) {
            continue;
        }
        closed.insert(current.node, true);

        for edge in graph.neighbors(current.node) {
            if closed.contains_key(&edge.to) {
                continue;
            }

            let tentative_g = g_score[&current.node] + edge.cost / edge.speed_factor;

            let is_better = match g_score.get(&edge.to) {
                Some(&existing) => tentative_g < existing,
                None => true,
            };

            if is_better {
                g_score.insert(edge.to, tentative_g);
                came_from.insert(edge.to, current.node);
                if let Some(to_node) = graph.node(edge.to) {
                    open.push(AStarEntry {
                        node: edge.to,
                        f_score: tentative_g + heuristic(to_node.position, goal_pos),
                    });
                }
            }
        }
    }

    None // No path found
}

/// Find a path from a node to the nearest node of a given type.
pub fn find_path_to_nearest(
    graph: &Graph,
    start: u32,
    target_type: crate::graph::NodeType,
) -> Option<PathResult> {
    let targets = graph.nodes_of_type(target_type);
    if targets.is_empty() {
        return None;
    }

    // Find the closest target by straight-line distance, then pathfind to it
    let start_pos = graph.node(start)?.position;
    let nearest = targets
        .iter()
        .min_by(|&&a, &&b| {
            let da = dist_sq(start_pos, graph.node(a).unwrap().position);
            let db = dist_sq(start_pos, graph.node(b).unwrap().position);
            da.partial_cmp(&db).unwrap()
        })
        .copied()?;

    find_path(graph, start, nearest)
}

/// Euclidean distance heuristic.
fn heuristic(a: [f32; 3], b: [f32; 3]) -> f32 {
    let dx = a[0] - b[0];
    let dz = a[2] - b[2];
    (dx * dx + dz * dz).sqrt()
}

fn dist_sq(a: [f32; 3], b: [f32; 3]) -> f32 {
    let dx = a[0] - b[0];
    let dz = a[2] - b[2];
    dx * dx + dz * dz
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::graph::{EdgeType, NodeType};

    fn line_graph() -> Graph {
        // A -- B -- C -- D
        let mut g = Graph::new();
        let a = g.add_node([0.0, 0.0, 0.0], NodeType::Sidewalk, "c");
        let b = g.add_node([10.0, 0.0, 0.0], NodeType::Sidewalk, "c");
        let c = g.add_node([20.0, 0.0, 0.0], NodeType::Sidewalk, "c");
        let d = g.add_node([30.0, 0.0, 0.0], NodeType::BuildingEntrance, "c");

        g.add_edge_bidir(a, b, EdgeType::Walk, 1.0);
        g.add_edge_bidir(b, c, EdgeType::Walk, 1.0);
        g.add_edge_bidir(c, d, EdgeType::Walk, 1.0);
        g
    }

    fn grid_graph() -> Graph {
        // 0 -- 1 -- 2
        // |    |    |
        // 3 -- 4 -- 5
        // |    |    |
        // 6 -- 7 -- 8
        let mut g = Graph::new();
        for z in 0..3 {
            for x in 0..3 {
                g.add_node(
                    [x as f32 * 10.0, 0.0, z as f32 * 10.0],
                    NodeType::Sidewalk,
                    "c",
                );
            }
        }
        // Horizontal edges
        for z in 0..3u32 {
            for x in 0..2u32 {
                let a = z * 3 + x;
                let b = z * 3 + x + 1;
                g.add_edge_bidir(a, b, EdgeType::Walk, 1.0);
            }
        }
        // Vertical edges
        for z in 0..2u32 {
            for x in 0..3u32 {
                let a = z * 3 + x;
                let b = (z + 1) * 3 + x;
                g.add_edge_bidir(a, b, EdgeType::Walk, 1.0);
            }
        }
        g
    }

    #[test]
    fn path_same_node() {
        let g = line_graph();
        let path = find_path(&g, 0, 0).unwrap();
        assert_eq!(path.nodes, vec![0]);
        assert_eq!(path.total_cost, 0.0);
    }

    #[test]
    fn path_adjacent() {
        let g = line_graph();
        let path = find_path(&g, 0, 1).unwrap();
        assert_eq!(path.nodes, vec![0, 1]);
        assert!((path.total_cost - 10.0).abs() < 0.01);
    }

    #[test]
    fn path_through_line() {
        let g = line_graph();
        let path = find_path(&g, 0, 3).unwrap();
        assert_eq!(path.nodes, vec![0, 1, 2, 3]);
        assert!((path.total_cost - 30.0).abs() < 0.01);
    }

    #[test]
    fn path_reverse() {
        let g = line_graph();
        let path = find_path(&g, 3, 0).unwrap();
        assert_eq!(path.nodes, vec![3, 2, 1, 0]);
    }

    #[test]
    fn path_on_grid_takes_shortest() {
        let g = grid_graph();
        // From corner (0) to opposite corner (8)
        let path = find_path(&g, 0, 8).unwrap();
        // Shortest is 4 edges (L-shaped or diagonal via grid)
        assert_eq!(path.nodes.len(), 5); // 5 nodes = 4 edges
        assert!((path.total_cost - 40.0).abs() < 0.01);
    }

    #[test]
    fn no_path_disconnected() {
        let mut g = Graph::new();
        g.add_node([0.0, 0.0, 0.0], NodeType::Sidewalk, "c");
        g.add_node([100.0, 0.0, 0.0], NodeType::Sidewalk, "c");
        // No edges connecting them
        let path = find_path(&g, 0, 1);
        assert!(path.is_none());
    }

    #[test]
    fn find_nearest_building() {
        let g = line_graph();
        let path = find_path_to_nearest(&g, 0, NodeType::BuildingEntrance).unwrap();
        assert_eq!(*path.nodes.last().unwrap(), 3);
    }

    #[test]
    fn speed_factor_affects_cost() {
        let mut g = Graph::new();
        let a = g.add_node([0.0, 0.0, 0.0], NodeType::Sidewalk, "c");
        let b = g.add_node([10.0, 0.0, 0.0], NodeType::Sidewalk, "c");
        let c = g.add_node([0.0, 0.0, 10.0], NodeType::Sidewalk, "c");
        let d = g.add_node([10.0, 0.0, 10.0], NodeType::Sidewalk, "c");

        // Top path: fast (speed 2.0)
        g.add_edge(a, b, EdgeType::Walk, 2.0);
        g.add_edge(b, d, EdgeType::Walk, 2.0);
        // Bottom path: slow (speed 0.5)
        g.add_edge(a, c, EdgeType::Walk, 0.5);
        g.add_edge(c, d, EdgeType::Walk, 0.5);

        let path = find_path(&g, a, d).unwrap();
        // Should take top (fast) path
        assert_eq!(path.nodes, vec![0, 1, 3]);
    }
}
