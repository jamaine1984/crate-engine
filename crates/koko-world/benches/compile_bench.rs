use criterion::{criterion_group, criterion_main, Criterion};
use koko_world::{WorldBuildRequest, WorldSize, compile_world};

fn make_request(template: &str, size: WorldSize) -> WorldBuildRequest {
    WorldBuildRequest {
        template: template.to_string(),
        seed: 42,
        size,
        style: "default".to_string(),
        assets: vec![], // empty catalog — placer uses fallbacks
    }
}

fn bench_compile_world(c: &mut Criterion) {
    let mut group = c.benchmark_group("compile_world");

    for template in &["CITY_MODERN", "MEDIEVAL_VILLAGE", "ZOMBIELAND", "SPACE_STATION"] {
        for (label, size) in &[("small", WorldSize::Small), ("medium", WorldSize::Medium)] {
            group.bench_function(format!("{template}/{label}"), |b| {
                let req = make_request(template, *size);
                b.iter(|| compile_world(&req).unwrap());
            });
        }
    }

    group.finish();
}

criterion_group!(benches, bench_compile_world);
criterion_main!(benches);
