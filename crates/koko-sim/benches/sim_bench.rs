use criterion::{criterion_group, criterion_main, Criterion};
use koko_sim::{SimState, spawn_population, ChunkInfo, ZonePopulation};
use koko_nav::graph::{Graph, NodeType, EdgeType};

fn make_graph(node_count: usize, node_type: NodeType) -> Graph {
    let mut graph = Graph::new();

    for i in 0..node_count {
        let angle = (i as f32 / node_count as f32) * std::f32::consts::TAU;
        let pos = [angle.cos() * 100.0, 0.0, angle.sin() * 100.0];
        graph.add_node(pos, node_type, &format!("chunk_{}", i % 4));
    }

    let edge_type = match node_type {
        NodeType::RoadLane | NodeType::Intersection => EdgeType::Drive,
        _ => EdgeType::Walk,
    };

    for i in 0..node_count {
        graph.add_edge(i as u32, ((i + 1) % node_count) as u32, edge_type, 1.0);
    }

    graph
}

fn make_chunks() -> Vec<ChunkInfo> {
    (0..4).map(|i| ChunkInfo {
        id: format!("chunk_{i}"),
        zone: "downtown".to_string(),
        grid_x: i % 2,
        grid_z: i / 2,
    }).collect()
}

fn make_population() -> Vec<ZonePopulation> {
    vec![ZonePopulation { zone: "downtown".to_string(), pedestrians: 8, vehicles: 4 }]
}

fn bench_spawn_population(c: &mut Criterion) {
    let mut ped_graph = make_graph(50, NodeType::Sidewalk);
    // Add some building entrances for spawning
    for i in 0..20 {
        let pos = [i as f32 * 10.0, 0.0, 5.0];
        ped_graph.add_node(pos, NodeType::BuildingEntrance, &format!("chunk_{}", i % 4));
    }
    let veh_graph = make_graph(30, NodeType::RoadLane);
    let chunks = make_chunks();
    let population = make_population();

    c.bench_function("spawn_population", |b| {
        b.iter(|| spawn_population(&chunks, &ped_graph, &veh_graph, &population, 42));
    });
}

fn bench_tick(c: &mut Criterion) {
    let mut ped_graph = make_graph(50, NodeType::Sidewalk);
    for i in 0..20 {
        let pos = [i as f32 * 10.0, 0.0, 5.0];
        ped_graph.add_node(pos, NodeType::BuildingEntrance, &format!("chunk_{}", i % 4));
    }
    let veh_graph = make_graph(30, NodeType::RoadLane);
    let chunks = make_chunks();
    let population = make_population();
    let agents = spawn_population(&chunks, &ped_graph, &veh_graph, &population, 42);

    let mut group = c.benchmark_group("sim_tick");

    group.bench_function(format!("{}_agents", agents.len()), |b| {
        let mut state = SimState::new(agents.clone());
        b.iter(|| state.tick(0.016, &ped_graph, &veh_graph));
    });

    group.finish();
}

criterion_group!(benches, bench_spawn_population, bench_tick);
criterion_main!(benches);
