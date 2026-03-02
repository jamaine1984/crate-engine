# koko-nav — Navigation & Pathfinding

Generates navigation data from world manifests so NPCs walk sidewalks
and vehicles follow roads.

## Core Systems

- **NavGraph** — walkable node graph for pedestrians (sidewalks, paths, crosswalks)
- **LaneGraph** — directed lane graph for vehicles (road lanes, turns at intersections)
- **Pathfinding** — A* shortest path on both graph types
- **Waypoints** — key locations NPCs navigate between (building entrances, bus stops)
- **NavManifest** — JSON output consumed by JS simulation runtime

## Usage

```rust
use koko_nav::{generate_nav, NavBuildInput};

let nav = generate_nav(&world_manifest_data)?;
let json = serde_json::to_string(&nav)?;
// Send to JS runtime
```
