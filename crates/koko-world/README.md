# koko-world — Deterministic World Compiler

Generates complete world layouts from templates + asset catalogs.

## Public API

```rust
use koko_world::{compile_world, WorldBuildRequest, WorldSize};

let request = WorldBuildRequest {
    template: "CITY_MODERN".into(),
    seed: 42,
    size: WorldSize::Medium,
    style: "modern".into(),
    assets: asset_catalog_json,
};

let manifest = compile_world(&request)?;
// manifest is JSON-serializable → send to JS world-client
```

## Architecture

- **manifest.rs** — Output types (WorldManifest, Placement, etc.)
- **grid.rs** — City zone grid (Downtown, Commercial, Suburbs, etc.)
- **roads.rs** — Road network generation (straights, intersections)
- **placer.rs** — Asset placement engine (buildings, furniture, vehicles)
- **catalog.rs** — Asset catalog queries (filter by category/zone/style)

## Rules

- Deterministic: same seed + template → identical output
- Self-contained: no heavy deps, receives asset data as JSON input
- Output is a JSON WorldManifest consumed by JS world-client
