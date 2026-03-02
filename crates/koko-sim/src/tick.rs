//! Simulation tick — updates all agents each frame.
//!
//! The tick function moves agents along their paths, handles waiting at
//! crosswalks/lights, assigns new destinations when paths complete, and
//! manages traffic flow. Returns a list of state changes for the JS runtime.

use crate::agent::{Agent, AgentId, AgentState, AgentType, AgentSnapshot};
use koko_nav::{find_path, Graph, NodeType};
use serde::{Deserialize, Serialize};

/// Result of a simulation tick — what changed.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TickResult {
    /// Agents that moved or changed state this tick.
    pub updates: Vec<AgentSnapshot>,
    /// New agents spawned this tick.
    pub spawned: Vec<AgentSnapshot>,
    /// Agents removed this tick.
    pub despawned: Vec<AgentId>,
}

/// Crosswalk wait time in seconds.
const CROSSWALK_WAIT: f32 = 3.0;
/// Idle time at a destination before moving to next (seconds).
const DESTINATION_IDLE_TIME: f32 = 5.0;
/// How close to a node counts as "arrived" (squared distance).
const ARRIVAL_THRESHOLD_SQ: f32 = 4.0; // 2.0 units

/// Run one simulation tick for all agents.
///
/// `dt` is the time delta in seconds since the last tick.
pub fn tick(
    agents: &mut Vec<Agent>,
    ped_graph: &Graph,
    veh_graph: &Graph,
    dt: f32,
) -> TickResult {
    let mut updates = Vec::new();
    let spawned = Vec::new();
    let despawned = Vec::new();

    for agent in agents.iter_mut() {
        let changed = tick_agent(agent, ped_graph, veh_graph, dt);
        if changed {
            updates.push(AgentSnapshot::from(&*agent));
        }
    }

    TickResult {
        updates,
        spawned,
        despawned,
    }
}

/// Update a single agent. Returns true if agent state changed.
fn tick_agent(
    agent: &mut Agent,
    ped_graph: &Graph,
    veh_graph: &Graph,
    dt: f32,
) -> bool {
    match agent.state {
        AgentState::Moving => tick_moving(agent, ped_graph, veh_graph, dt),
        AgentState::Waiting => tick_waiting(agent, ped_graph, veh_graph, dt),
        AgentState::Idle => tick_idle(agent, ped_graph, veh_graph, dt),
        AgentState::Stopped => tick_stopped(agent, dt),
    }
}

/// Agent is moving along its path.
fn tick_moving(
    agent: &mut Agent,
    ped_graph: &Graph,
    veh_graph: &Graph,
    dt: f32,
) -> bool {
    let graph = match agent.agent_type {
        AgentType::Pedestrian => ped_graph,
        AgentType::Vehicle => veh_graph,
    };

    let target_id = match agent.current_target() {
        Some(id) => id,
        None => {
            // Path complete — go idle
            agent.state = AgentState::Idle;
            agent.state_timer = 0.0;
            agent.wait_duration = DESTINATION_IDLE_TIME;
            return true;
        }
    };

    let target_node = match graph.node(target_id) {
        Some(n) => n,
        None => {
            agent.state = AgentState::Idle;
            return true;
        }
    };

    let target_pos = target_node.position;
    let target_type = target_node.node_type;

    // Calculate direction and distance to target
    let dx = target_pos[0] - agent.position[0];
    let dz = target_pos[2] - agent.position[2];
    let dist_sq = dx * dx + dz * dz;

    if dist_sq <= ARRIVAL_THRESHOLD_SQ {
        // Arrived at target node
        agent.position = target_pos;
        agent.advance_path();

        // Check if we need to wait (crosswalk, intersection)
        if target_type == NodeType::Crosswalk {
            agent.state = AgentState::Waiting;
            agent.state_timer = 0.0;
            agent.wait_duration = CROSSWALK_WAIT;
            return true;
        }

        if target_type == NodeType::Intersection && agent.agent_type == AgentType::Vehicle {
            agent.state = AgentState::Stopped;
            agent.state_timer = 0.0;
            agent.wait_duration = 1.5; // Brief stop at intersection
            return true;
        }

        // Check if path is complete
        if agent.path_complete() {
            agent.state = AgentState::Idle;
            agent.state_timer = 0.0;
            agent.wait_duration = DESTINATION_IDLE_TIME;
        }

        return true;
    }

    // Move toward target
    let dist = dist_sq.sqrt();
    let move_dist = agent.speed * dt;
    let t = (move_dist / dist).min(1.0);

    agent.position[0] += dx * t;
    agent.position[2] += dz * t;

    // Update rotation to face movement direction
    agent.rotation = dz.atan2(dx).to_degrees();

    true
}

/// Agent is waiting (at crosswalk, traffic light, etc.)
fn tick_waiting(
    agent: &mut Agent,
    _ped_graph: &Graph,
    _veh_graph: &Graph,
    dt: f32,
) -> bool {
    agent.state_timer += dt;
    if agent.state_timer >= agent.wait_duration {
        agent.state = AgentState::Moving;
        agent.state_timer = 0.0;
        return true;
    }
    false
}

/// Agent is idle at a destination — pick next destination when timer expires.
fn tick_idle(
    agent: &mut Agent,
    ped_graph: &Graph,
    veh_graph: &Graph,
    dt: f32,
) -> bool {
    agent.state_timer += dt;
    if agent.state_timer < agent.wait_duration {
        return false;
    }

    // Time to move to next destination
    let graph = match agent.agent_type {
        AgentType::Pedestrian => ped_graph,
        AgentType::Vehicle => veh_graph,
    };

    if let Some(dest) = agent.next_destination() {
        // Find nearest node to current position
        let start = graph.nearest_node(agent.position, None);
        if let Some(start_id) = start {
            if let Some(path_result) = find_path(graph, start_id, dest) {
                agent.path = path_result.nodes;
                agent.path_index = 0;
                agent.state = AgentState::Moving;
                agent.state_timer = 0.0;
                return true;
            }
        }
    }

    // No destination or no path — stay idle but reset timer
    agent.state_timer = 0.0;
    false
}

/// Agent is stopped at an intersection — resume after brief pause.
fn tick_stopped(agent: &mut Agent, dt: f32) -> bool {
    agent.state_timer += dt;
    if agent.state_timer >= agent.wait_duration {
        agent.state = AgentState::Moving;
        agent.state_timer = 0.0;
        return true;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use koko_nav::{Graph, NodeType, EdgeType};

    fn simple_ped_graph() -> Graph {
        let mut g = Graph::new();
        // 0 -- 1 -- CW(2) -- 3 -- ENTRANCE(4)
        g.add_node([0.0, 0.0, 0.0], NodeType::Sidewalk, "c");
        g.add_node([10.0, 0.0, 0.0], NodeType::Sidewalk, "c");
        g.add_node([20.0, 0.0, 0.0], NodeType::Crosswalk, "c");
        g.add_node([30.0, 0.0, 0.0], NodeType::Sidewalk, "c");
        g.add_node([40.0, 0.0, 0.0], NodeType::BuildingEntrance, "c");

        g.add_edge_bidir(0, 1, EdgeType::Walk, 1.0);
        g.add_edge_bidir(1, 2, EdgeType::Crosswalk, 0.6);
        g.add_edge_bidir(2, 3, EdgeType::Walk, 1.0);
        g.add_edge_bidir(3, 4, EdgeType::Entrance, 0.8);
        g
    }

    fn empty_graph() -> Graph {
        Graph::new()
    }

    #[test]
    fn agent_moves_along_path() {
        let g = simple_ped_graph();
        let mut agent = Agent::new_pedestrian(0, [0.0, 0.0, 0.0], "ped");
        agent.path = vec![0, 1, 3]; // skip crosswalk for this test
        agent.path_index = 0;
        agent.state = AgentState::Moving;

        // Run many ticks to move the agent
        for _ in 0..100 {
            tick_agent(&mut agent, &g, &empty_graph(), 0.1);
        }

        // Agent should have moved toward node 3
        assert!(agent.position[0] > 5.0, "Agent should have moved, pos={:?}", agent.position);
    }

    #[test]
    fn agent_waits_at_crosswalk() {
        let g = simple_ped_graph();
        let mut agent = Agent::new_pedestrian(0, [18.0, 0.0, 0.0], "ped");
        agent.path = vec![2, 3];
        agent.path_index = 0;
        agent.state = AgentState::Moving;

        // Move until arrival at crosswalk
        for _ in 0..50 {
            tick_agent(&mut agent, &g, &empty_graph(), 0.1);
            if agent.state == AgentState::Waiting {
                break;
            }
        }

        assert_eq!(agent.state, AgentState::Waiting);

        // Wait through the crosswalk timer
        for _ in 0..40 {
            tick_agent(&mut agent, &g, &empty_graph(), 0.1);
        }

        assert_eq!(agent.state, AgentState::Moving);
    }

    #[test]
    fn idle_agent_picks_next_destination() {
        let g = simple_ped_graph();
        let mut agent = Agent::new_pedestrian(0, [0.0, 0.0, 0.0], "ped");
        agent.schedule = vec![0, 4]; // cycle between node 0 and node 4
        agent.schedule_index = 0;
        agent.state = AgentState::Idle;
        agent.wait_duration = 0.1; // short idle

        // Tick past the idle duration
        tick_agent(&mut agent, &g, &empty_graph(), 0.2);

        assert_eq!(agent.state, AgentState::Moving);
        assert!(!agent.path.is_empty());
    }

    #[test]
    fn tick_batch() {
        let g = simple_ped_graph();
        let mut agents = vec![
            Agent::new_pedestrian(0, [0.0, 0.0, 0.0], "ped_a"),
            Agent::new_pedestrian(1, [40.0, 0.0, 0.0], "ped_b"),
        ];
        agents[0].path = vec![0, 1];
        agents[0].state = AgentState::Moving;
        agents[1].path = vec![4, 3];
        agents[1].state = AgentState::Moving;

        let result = tick(&mut agents, &g, &empty_graph(), 0.1);
        assert_eq!(result.updates.len(), 2);
    }

    #[test]
    fn vehicle_stops_at_intersection() {
        let mut g = Graph::new();
        g.add_node([0.0, 0.0, 0.0], NodeType::RoadLane, "r");
        g.add_node([10.0, 0.0, 0.0], NodeType::Intersection, "r");
        g.add_node([20.0, 0.0, 0.0], NodeType::RoadLane, "r");

        g.add_edge(0, 1, EdgeType::Drive, 1.0);
        g.add_edge(1, 2, EdgeType::Drive, 1.0);

        let mut car = Agent::new_vehicle(0, [8.0, 0.0, 0.0], "car");
        car.path = vec![1, 2];
        car.path_index = 0;
        car.state = AgentState::Moving;

        // Move to intersection
        for _ in 0..20 {
            tick_agent(&mut car, &empty_graph(), &g, 0.1);
            if car.state == AgentState::Stopped {
                break;
            }
        }

        assert_eq!(car.state, AgentState::Stopped);
    }
}
