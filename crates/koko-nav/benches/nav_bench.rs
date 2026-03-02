use criterion::{criterion_group, criterion_main, Criterion};
use koko_nav::builder::{NavBuildInput, NavChunkInput, NavIntersectionInput, build_nav};
use koko_nav::pathfind::find_path;

fn make_input(grid_size: i32) -> NavBuildInput {
    let mut chunks = Vec::new();
    let mut intersections = Vec::new();
    let chunk_size = 50.0;

    for z in 0..grid_size {
        for x in 0..grid_size {
            chunks.push(NavChunkInput {
                id: format!("chunk_{x}_{z}"),
                grid_x: x,
                grid_z: z,
                zone: "downtown".to_string(),
                building_positions: vec![
                    [x as f32 * chunk_size + 10.0, 0.0, z as f32 * chunk_size + 10.0],
                ],
            });

            intersections.push(NavIntersectionInput {
                position: [x as f32 * chunk_size, 0.0, z as f32 * chunk_size],
                intersection_type: "four_way".to_string(),
            });
        }
    }

    NavBuildInput {
        grid_width: grid_size,
        grid_height: grid_size,
        chunk_size,
        chunks,
        intersections,
    }
}

fn bench_build_nav(c: &mut Criterion) {
    let mut group = c.benchmark_group("build_nav");

    for grid in &[6, 10, 16] {
        group.bench_function(format!("{grid}x{grid}"), |b| {
            let input = make_input(*grid);
            b.iter(|| build_nav(&input));
        });
    }

    group.finish();
}

fn bench_find_path(c: &mut Criterion) {
    let input = make_input(10);
    let manifest = build_nav(&input);
    let graph = &manifest.pedestrian_graph;

    if graph.nodes.len() >= 2 {
        c.bench_function("find_path_ped_graph", |b| {
            let last = graph.nodes.len() as u32 - 1;
            b.iter(|| find_path(graph, 0, last));
        });
    }
}

criterion_group!(benches, bench_build_nav, bench_find_path);
criterion_main!(benches);
