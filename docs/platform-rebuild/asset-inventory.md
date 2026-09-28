# Existing asset inventory

Checked **September 27, 2026 (Pacific time)** against the public [asset-host catalog](https://crateship-games-assets.pages.dev/models/catalog.json) and the checked-in `asset-catalog.json`. This is a read-only inventory: **all existing assets and catalog files are preserved**. No models were added, deleted, replaced or republished, and no paid API was used.

## Counts and confidence

| Measure | Remote catalog | Local fallback | Confidence / meaning |
| --- | ---: | ---: | --- |
| Source rows | 4,122 | 4,122 | Exact parsed row count |
| Distinct paths accepted by current GLB catalog normalizer | **4,077** | **4,077** | Exact catalog-path count; not a count of verified working imports |
| Duplicate normalized paths | 0 | 0 | No same-path duplication within either source |
| Case-only path collisions | 0 | 0 | Exact comparison |
| Temporary `.glb.tmp` rows excluded by the existing loader | 45 | 45 | Already excluded; nothing deleted |
| Categories | 25 | 26 | Source labels, without reclassification |
| Rows labeled `characters` | **132** | **287** | Reliable metadata counts; not verified counts of unique humanoids, rigs or playable actors |
| Tree-related names | 177 | 177 | Heuristic candidates; includes trees, palms, saplings, stumps and roots |

The two active sources have **exactly the same 4,077 normalized paths**: no remote-only or fallback-only GLB paths. Counts were reconciled directly with the current `engine/editor/catalog.mjs` `normalizeCatalog` helper, including its unsafe-path checks.

There are **1,037 category disagreements** for otherwise identical paths. Remote categories are used when the remote catalog succeeds. All 45 temporary rows are in the remote `city-props` group. They remain recorded in the inventory JSON but are not treated as GLB models.

Repeated names are not the same thing as repeated files: the remote catalog has 127 repeated-name groups, representing 138 rows beyond the first occurrence. Paths are distinct. Content hashes were not collected for the complete library, so byte-identical duplicates, LOD variants and separate exports of the same source model remain undetermined. These files must not be removed based on name similarity.

## Category breakdown

Counts below are distinct normalized GLB paths. `sci-fi` and `scifi` are shown together only to compare the two sources; source data was not changed.

| Category | Remote | Fallback |
| --- | ---: | ---: |
| misc | 527 | 367 |
| props | 440 | 410 |
| fantasy | 353 | 272 |
| nature | 340 | 283 |
| sci-fi / scifi | 283 | 245 |
| city-props | 264 | 241 |
| furniture | 227 | 223 |
| buildings | 181 | 179 |
| medieval | 173 | 163 |
| weapons | 170 | 93 |
| characters | 132 | 287 |
| roads | 120 | 97 |
| vehicles | 118 | 108 |
| horror | 105 | 122 |
| farming | 92 | 102 |
| unity-assets | 88 | 88 |
| platformer | 84 | 253 |
| animals | 77 | 99 |
| pirate | 72 | 72 |
| cyberpunk | 71 | 71 |
| dungeon | 60 | 151 |
| survival | 44 | 42 |
| hd-assets | 26 | 10 |
| enemies | 18 | 0 |
| ships | 12 | 19 |
| rocks | 0 | 41 |
| food | 0 | 39 |
| **Total** | **4,077** | **4,077** |

`misc` is a real source label, not evidence that each item was identified. Obscure filenames, tags and broad pack labels leave many assets semantically unclassified. No authoritative material quality, license, rigging, triangle budget or NPC/player compatibility field exists in these catalogs.

## Characters, NPCs and players

All 132 remote `characters` paths are also in the fallback's 287. Of the additional 155 fallback labels, **149 are in `mixamo_anims/`** and six are other character exports: `hd_character_michelle`, `michelle`, `nefertiti`, `hd_soldier`, `soldier_mixamo` and `xbot_mixamo`. Those are separate files, not proof of 155 additional unique character identities. The sampled Mixamo file contains both a skinned mesh and animation, so these should not automatically be described as animation-only files either.

The remote character group includes people, color/skin variants, creatures and robots. Examples include `char_guard_blue`, `char_villager_brown`, `modular_men_swat`, `modular_women_adventurer`, `hd_char_michelle`, `quat_dragon` and `quat_robot`.

**A reliable separate NPC or player-model total cannot be obtained from these labels.** No explicit `npc` name matched. The sole `player` name match was `ph_cassette_player`, an audio prop; it is not a player character. An NPC/player role depends on the scene's behavior and controller configuration. No NPC behavior, retargeting or full animation compatibility was verified by this inventory.

## Existing tree variety and bounded content samples

The 177 tree-related names span base models (93), `nature_pack_` (25), `ultimate_space_pack_` (18), `ph_` (15), `platformer_game_pack_` (2), `fab_assets` (1), and six Kenney pack directories (23 combined). Examples include cone/round/layered trees, cherry/dead trees, palms, pines, willow seasonal variants, fantasy spiral/lava/floating trees and realistic tree scans.

No tree filename explicitly says `low poly` or `high poly`; name-only counts of those terms would therefore be misleading. Across the whole catalog, 91 names contain a low-poly term and zero contain a high-poly term. **Neither is a measured polygon-class total.**

Seven assets received HEAD requests and bounded streamed content reads, capped at 256 KiB per sample. The server returned 200 and a GLB MIME type for all seven, ignoring the Range request. Streams were cancelled after enough JSON was available. Only metadata was analyzed; mesh buffers/textures were not decoded. Roughly 209 KiB of body data was consumed in the final sample pass. Earlier small header probes were also read-only.

| Existing path, under `models/` | Declared triangles | Skins / animations | Actual sampled format and current compatibility |
| --- | ---: | --- | --- |
| `tree_cone_00.glb` | 42 | 0 / 0 | True GLB; no external resources declared; full import not tested |
| `kenney_fantasy/tree.glb` | 168 | 0 / 0 | True GLB but references `Textures/colormap.png`; current self-contained import rejects it |
| `ph_jacaranda_tree.glb` | 3,863,832 | 0 / 0 | JSON glTF at a `.glb` path, with external buffer/textures; current importer rejects it |
| `ph_pine_sapling_medium.glb` | 6,038,139 | 0 / 0 | JSON glTF at a `.glb` path, with external buffer/textures; current importer rejects it |
| `char_guard_blue.glb` | 2,332 | 0 / 0 | True GLB; no skin or animation declared; full import not tested |
| `hd_char_michelle.glb` | 28,106 | 1 / 2 | True GLB; `SambaDance` and `TPose` clips declared; full import not tested |
| `mixamo_anims/Running_Forward.glb` | 49,112 | 1 / 1 | True GLB with skinned mesh and one animation; full import not tested |

Triangle counts are calculated from indexed/non-indexed triangle primitive accessors, not from rendered screenshots. They count mesh geometry once per primitive; they are not a scene-instance performance benchmark. The two detailed tree documents demonstrate existing high-detail assets, while the two small tree documents demonstrate existing low-polygon assets. The full high/low inventory remains unknown.

**Catalog presence and HTTP 200 do not establish importability.** These samples expose three existing compatibility gaps without changing the assets. Any future conversion must preserve originals and be a separate explicit task; none was performed here.

## Catalog display limit

At the start of this audit, `assetCards` rendered only the first 80 matching entries even though `loadCatalog` loaded all 4,077. That was a display limit, not missing catalog data. The current `assetPage` helper defaults to 80 visible items and separately reports total/matching counts and `hasMore`; the primary implementation is wiring counts, category filtering and Show more. This inventory does not claim a browser verification of that UI work.

The historical `model-catalog.json` and `model_catalog.json` use other subsets/maps. They are not the two sources selected by this engine loader and must not be added to the 4,077 as if they were separate new assets. Their parsed statistics are included in the JSON for traceability.

## Deliverables and limits

- `outputs/verification/asset-inventory.json`: source locations/checksums, exact records, all temporary exclusions, category comparisons, classification candidates and seven sampled content results.
- `outputs/verification/asset-inventory.csv`: remote and fallback rows side by side by source (8,154 data rows total), with sample status/format/resources/triangle/skin/animation fields. Two source rows do not mean two distinct files.
- Source catalog bodies were parsed; the complete remote storage bucket, every binary, textures, licenses and every import were not audited. Unlisted files may exist. No claim of 6,000 working models is supported by the currently selected catalogs.
