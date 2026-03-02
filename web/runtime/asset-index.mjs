// ============================================================================
// CRATE ENGINE 2.0 — ASSET INDEX
// Tagged asset database for world generation.
// Mirrors crates/koko-assets/src/tags.rs — keep in sync.
// See research/ENGINE_2_0_SPEC.md §5B
//
// Each entry: { id, category, subcategory, zones, style, placement,
//               footprint, height, snap, variantGroup, maxPerChunk, tags }
// ============================================================================

// ---------------------------------------------------------------------------
// The tagged index: every model the world compiler can query
// ---------------------------------------------------------------------------

const ASSET_INDEX = [

  // =========================================================================
  // ROADS (street_pack_*)
  // =========================================================================
  { id: 'street_pack_street_straight', category: 'road', subcategory: 'straight', zones: ['any'], style: 'modern', placement: 'ground', footprint: [10, 10], height: 0.1, snap: 'ground', variantGroup: 'road_straight', maxPerChunk: 0, tags: ['road', 'asphalt', '2lane'] },
  { id: 'street_pack_street_curve', category: 'road', subcategory: 'curve', zones: ['any'], style: 'modern', placement: 'ground', footprint: [10, 10], height: 0.1, snap: 'ground', variantGroup: 'road_curve', maxPerChunk: 0, tags: ['road', 'asphalt', 'turn'] },
  { id: 'street_pack_street_3way', category: 'road', subcategory: 't_intersection', zones: ['any'], style: 'modern', placement: 'ground', footprint: [10, 10], height: 0.1, snap: 'ground', variantGroup: 'road_3way', maxPerChunk: 0, tags: ['road', 'intersection', '3way'] },
  { id: 'street_pack_street_3way_2', category: 'road', subcategory: 't_intersection', zones: ['any'], style: 'modern', placement: 'ground', footprint: [10, 10], height: 0.1, snap: 'ground', variantGroup: 'road_3way', maxPerChunk: 0, tags: ['road', 'intersection', '3way'] },
  { id: 'street_pack_street_4way', category: 'road', subcategory: 'crossroads', zones: ['any'], style: 'modern', placement: 'ground', footprint: [10, 10], height: 0.1, snap: 'ground', variantGroup: 'road_4way', maxPerChunk: 0, tags: ['road', 'intersection', '4way', 'crossroads'] },
  { id: 'street_pack_street_4way_2', category: 'road', subcategory: 'crossroads', zones: ['any'], style: 'modern', placement: 'ground', footprint: [10, 10], height: 0.1, snap: 'ground', variantGroup: 'road_4way', maxPerChunk: 0, tags: ['road', 'intersection', '4way'] },
  { id: 'street_pack_street_deadend', category: 'road', subcategory: 'deadend', zones: ['suburbs'], style: 'modern', placement: 'ground', footprint: [10, 10], height: 0.1, snap: 'ground', variantGroup: null, maxPerChunk: 2, tags: ['road', 'cul-de-sac'] },
  { id: 'street_pack_street_elevated', category: 'road', subcategory: 'elevated', zones: ['downtown', 'highway'], style: 'modern', placement: 'ground', footprint: [10, 10], height: 4.0, snap: 'ground', variantGroup: 'road_elevated', maxPerChunk: 0, tags: ['road', 'overpass', 'bridge'] },
  { id: 'street_pack_street_elevated_ramp', category: 'road', subcategory: 'ramp', zones: ['downtown', 'highway'], style: 'modern', placement: 'ground', footprint: [10, 10], height: 4.0, snap: 'ground', variantGroup: null, maxPerChunk: 2, tags: ['road', 'ramp', 'onramp'] },
  { id: 'street_pack_street_empty', category: 'road', subcategory: 'empty', zones: ['any'], style: 'modern', placement: 'ground', footprint: [10, 10], height: 0.1, snap: 'ground', variantGroup: null, maxPerChunk: 0, tags: ['road', 'flat', 'lot'] },

  // =========================================================================
  // TRAFFIC CONTROL
  // =========================================================================
  { id: 'street_pack_sign_stop', category: 'traffic_control', subcategory: 'stop_sign', zones: ['any'], style: 'modern', placement: 'intersection', footprint: [0.3, 0.3], height: 2.5, snap: 'road_edge', variantGroup: null, maxPerChunk: 4, tags: ['sign', 'stop', 'traffic'] },
  { id: 'street_pack_sign_triangle', category: 'traffic_control', subcategory: 'yield_sign', zones: ['any'], style: 'modern', placement: 'intersection', footprint: [0.3, 0.3], height: 2.5, snap: 'road_edge', variantGroup: null, maxPerChunk: 4, tags: ['sign', 'yield', 'traffic'] },
  { id: 'street_pack_trafficlight', category: 'traffic_control', subcategory: 'traffic_light', zones: ['downtown', 'commercial'], style: 'modern', placement: 'intersection', footprint: [0.5, 0.5], height: 5.0, snap: 'intersection_center', variantGroup: 'trafficlight', maxPerChunk: 4, tags: ['light', 'traffic', 'signal'] },
  { id: 'street_pack_trafficlight_2', category: 'traffic_control', subcategory: 'traffic_light', zones: ['downtown', 'commercial'], style: 'modern', placement: 'intersection', footprint: [0.5, 0.5], height: 5.0, snap: 'intersection_center', variantGroup: 'trafficlight', maxPerChunk: 4, tags: ['light', 'traffic', 'signal'] },

  // =========================================================================
  // STREETLIGHTS
  // =========================================================================
  { id: 'street_pack_streetlight_single', category: 'street_furniture', subcategory: 'streetlight', zones: ['any'], style: 'modern', placement: 'sidewalk', footprint: [0.5, 0.5], height: 5.0, snap: 'sidewalk_edge', variantGroup: 'streetlight', maxPerChunk: 8, tags: ['light', 'lamp', 'street'] },
  { id: 'street_pack_streetlight_double', category: 'street_furniture', subcategory: 'streetlight', zones: ['downtown', 'commercial'], style: 'modern', placement: 'sidewalk', footprint: [0.5, 0.5], height: 5.0, snap: 'sidewalk_edge', variantGroup: 'streetlight', maxPerChunk: 6, tags: ['light', 'lamp', 'double'] },
  { id: 'street_pack_streetlight_triple', category: 'street_furniture', subcategory: 'streetlight', zones: ['downtown'], style: 'modern', placement: 'sidewalk', footprint: [0.5, 0.5], height: 6.0, snap: 'sidewalk_edge', variantGroup: 'streetlight', maxPerChunk: 4, tags: ['light', 'lamp', 'triple', 'grand'] },
  { id: 'streetlight', category: 'street_furniture', subcategory: 'streetlight', zones: ['any'], style: 'any', placement: 'sidewalk', footprint: [0.5, 0.5], height: 5.0, snap: 'sidewalk_edge', variantGroup: 'streetlight', maxPerChunk: 8, tags: ['light', 'lamp'] },
  { id: 'ph_street_lamp_01', category: 'street_furniture', subcategory: 'streetlight', zones: ['any'], style: 'modern', placement: 'sidewalk', footprint: [0.5, 0.5], height: 4.5, snap: 'sidewalk_edge', variantGroup: 'streetlight', maxPerChunk: 6, tags: ['light', 'lamp', 'realistic'] },
  { id: 'ph_street_lamp_02', category: 'street_furniture', subcategory: 'streetlight', zones: ['any'], style: 'modern', placement: 'sidewalk', footprint: [0.5, 0.5], height: 4.5, snap: 'sidewalk_edge', variantGroup: 'streetlight', maxPerChunk: 6, tags: ['light', 'lamp', 'realistic'] },
  { id: 'lamp_post_modern', category: 'street_furniture', subcategory: 'streetlight', zones: ['any'], style: 'modern', placement: 'sidewalk', footprint: [0.5, 0.5], height: 4.0, snap: 'sidewalk_edge', variantGroup: 'streetlight', maxPerChunk: 6, tags: ['light', 'lamp'] },

  // =========================================================================
  // STREET FURNITURE (benches, trash, etc.)
  // =========================================================================
  { id: 'ph_painted_wooden_bench', category: 'street_furniture', subcategory: 'bench', zones: ['park', 'suburbs', 'commercial'], style: 'modern', placement: 'sidewalk', footprint: [1.5, 0.5], height: 0.8, snap: 'sidewalk_edge', variantGroup: 'bench', maxPerChunk: 4, tags: ['bench', 'seat', 'sit'] },
  { id: 'ph_metal_trash_can', category: 'street_furniture', subcategory: 'trash_can', zones: ['any'], style: 'modern', placement: 'sidewalk', footprint: [0.4, 0.4], height: 0.8, snap: 'sidewalk_edge', variantGroup: 'trash', maxPerChunk: 4, tags: ['trash', 'bin', 'garbage'] },
  { id: 'ph_concrete_road_barrier', category: 'street_furniture', subcategory: 'barrier', zones: ['highway', 'industrial'], style: 'modern', placement: 'road_edge', footprint: [2.0, 0.5], height: 0.8, snap: 'road_edge', variantGroup: 'barrier', maxPerChunk: 8, tags: ['barrier', 'concrete', 'jersey'] },
  { id: 'ph_concrete_road_barrier_02', category: 'street_furniture', subcategory: 'barrier', zones: ['highway', 'industrial'], style: 'modern', placement: 'road_edge', footprint: [2.0, 0.5], height: 0.8, snap: 'road_edge', variantGroup: 'barrier', maxPerChunk: 8, tags: ['barrier', 'concrete'] },

  // =========================================================================
  // PATHS & WALKWAYS
  // =========================================================================
  { id: 'kenney_city/path-long', category: 'walkway', subcategory: 'path', zones: ['suburbs', 'park'], style: 'modern', placement: 'ground', footprint: [2, 6], height: 0.05, snap: 'ground', variantGroup: 'path', maxPerChunk: 0, tags: ['path', 'walkway', 'sidewalk'] },
  { id: 'kenney_city/path-short', category: 'walkway', subcategory: 'path', zones: ['suburbs', 'park'], style: 'modern', placement: 'ground', footprint: [2, 3], height: 0.05, snap: 'ground', variantGroup: 'path', maxPerChunk: 0, tags: ['path', 'walkway'] },
  { id: 'kenney_city/path-stones-long', category: 'walkway', subcategory: 'stone_path', zones: ['park', 'suburbs'], style: 'modern', placement: 'ground', footprint: [2, 6], height: 0.05, snap: 'ground', variantGroup: 'path_stone', maxPerChunk: 0, tags: ['path', 'stone', 'garden'] },
  { id: 'kenney_city/driveway-long', category: 'walkway', subcategory: 'driveway', zones: ['suburbs'], style: 'modern', placement: 'ground', footprint: [3, 8], height: 0.05, snap: 'road_edge', variantGroup: 'driveway', maxPerChunk: 4, tags: ['driveway', 'garage'] },
  { id: 'kenney_city/driveway-short', category: 'walkway', subcategory: 'driveway', zones: ['suburbs'], style: 'modern', placement: 'ground', footprint: [3, 4], height: 0.05, snap: 'road_edge', variantGroup: 'driveway', maxPerChunk: 4, tags: ['driveway'] },

  // =========================================================================
  // BUILDINGS — DOWNTOWN (skyscrapers, high-rise)
  // =========================================================================
  { id: 'kenney_city/building-skyscraper-a', category: 'building', subcategory: 'skyscraper', zones: ['downtown'], style: 'modern', placement: 'on_lot', footprint: [12, 12], height: 40, snap: 'lot_boundary', variantGroup: 'skyscraper', maxPerChunk: 2, tags: ['tall', 'glass', 'office', 'highrise'] },
  { id: 'kenney_city/building-skyscraper-b', category: 'building', subcategory: 'skyscraper', zones: ['downtown'], style: 'modern', placement: 'on_lot', footprint: [12, 12], height: 45, snap: 'lot_boundary', variantGroup: 'skyscraper', maxPerChunk: 2, tags: ['tall', 'glass', 'office'] },
  { id: 'kenney_city/building-skyscraper-c', category: 'building', subcategory: 'skyscraper', zones: ['downtown'], style: 'modern', placement: 'on_lot', footprint: [10, 10], height: 35, snap: 'lot_boundary', variantGroup: 'skyscraper', maxPerChunk: 2, tags: ['tall', 'office'] },
  { id: 'kenney_city/building-skyscraper-d', category: 'building', subcategory: 'skyscraper', zones: ['downtown'], style: 'modern', placement: 'on_lot', footprint: [10, 10], height: 50, snap: 'lot_boundary', variantGroup: 'skyscraper', maxPerChunk: 1, tags: ['tall', 'glass', 'landmark'] },
  { id: 'kenney_city/building-skyscraper-e', category: 'building', subcategory: 'skyscraper', zones: ['downtown'], style: 'modern', placement: 'on_lot', footprint: [14, 14], height: 55, snap: 'lot_boundary', variantGroup: 'skyscraper', maxPerChunk: 1, tags: ['tall', 'glass', 'landmark'] },

  // BUILDINGS — COMMERCIAL (medium, 2-6 floors)
  { id: 'kenney_city/building-a', category: 'building', subcategory: 'commercial', zones: ['commercial', 'downtown'], style: 'modern', placement: 'on_lot', footprint: [8, 8], height: 12, snap: 'lot_boundary', variantGroup: 'commercial_bldg', maxPerChunk: 4, tags: ['shop', 'store', 'office'] },
  { id: 'kenney_city/building-b', category: 'building', subcategory: 'commercial', zones: ['commercial', 'downtown'], style: 'modern', placement: 'on_lot', footprint: [8, 8], height: 15, snap: 'lot_boundary', variantGroup: 'commercial_bldg', maxPerChunk: 4, tags: ['shop', 'office'] },
  { id: 'kenney_city/building-c', category: 'building', subcategory: 'commercial', zones: ['commercial'], style: 'modern', placement: 'on_lot', footprint: [8, 10], height: 10, snap: 'lot_boundary', variantGroup: 'commercial_bldg', maxPerChunk: 4, tags: ['shop', 'retail'] },
  { id: 'kenney_city/building-d', category: 'building', subcategory: 'commercial', zones: ['commercial'], style: 'modern', placement: 'on_lot', footprint: [8, 8], height: 12, snap: 'lot_boundary', variantGroup: 'commercial_bldg', maxPerChunk: 4, tags: ['office'] },
  { id: 'kenney_city/building-e', category: 'building', subcategory: 'commercial', zones: ['commercial'], style: 'modern', placement: 'on_lot', footprint: [10, 8], height: 14, snap: 'lot_boundary', variantGroup: 'commercial_bldg', maxPerChunk: 4, tags: ['office', 'retail'] },
  { id: 'kenney_city/building-f', category: 'building', subcategory: 'commercial', zones: ['commercial'], style: 'modern', placement: 'on_lot', footprint: [8, 8], height: 11, snap: 'lot_boundary', variantGroup: 'commercial_bldg', maxPerChunk: 4, tags: ['shop'] },
  { id: 'kenney_city/building-g', category: 'building', subcategory: 'commercial', zones: ['commercial'], style: 'modern', placement: 'on_lot', footprint: [10, 10], height: 16, snap: 'lot_boundary', variantGroup: 'commercial_bldg', maxPerChunk: 3, tags: ['office', 'tall'] },
  { id: 'kenney_city/building-h', category: 'building', subcategory: 'commercial', zones: ['commercial', 'downtown'], style: 'modern', placement: 'on_lot', footprint: [10, 8], height: 18, snap: 'lot_boundary', variantGroup: 'commercial_bldg', maxPerChunk: 3, tags: ['office'] },

  // BUILDINGS — RESIDENTIAL (1-2 floors, suburbs)
  { id: 'kenney_city/building-type-a', category: 'building', subcategory: 'house', zones: ['suburbs'], style: 'modern', placement: 'on_lot', footprint: [8, 10], height: 6, snap: 'lot_boundary', variantGroup: 'house', maxPerChunk: 6, tags: ['house', 'residential', 'family'] },
  { id: 'kenney_city/building-type-b', category: 'building', subcategory: 'house', zones: ['suburbs'], style: 'modern', placement: 'on_lot', footprint: [8, 10], height: 6, snap: 'lot_boundary', variantGroup: 'house', maxPerChunk: 6, tags: ['house', 'residential'] },
  { id: 'kenney_city/building-type-c', category: 'building', subcategory: 'house', zones: ['suburbs'], style: 'modern', placement: 'on_lot', footprint: [8, 10], height: 7, snap: 'lot_boundary', variantGroup: 'house', maxPerChunk: 6, tags: ['house', 'residential'] },
  { id: 'kenney_city/building-type-d', category: 'building', subcategory: 'house', zones: ['suburbs'], style: 'modern', placement: 'on_lot', footprint: [8, 8], height: 6, snap: 'lot_boundary', variantGroup: 'house', maxPerChunk: 6, tags: ['house', 'residential'] },
  { id: 'kenney_city/building-type-e', category: 'building', subcategory: 'house', zones: ['suburbs'], style: 'modern', placement: 'on_lot', footprint: [10, 10], height: 7, snap: 'lot_boundary', variantGroup: 'house', maxPerChunk: 5, tags: ['house', 'residential', 'large'] },
  { id: 'kenney_city/building-type-f', category: 'building', subcategory: 'house', zones: ['suburbs'], style: 'modern', placement: 'on_lot', footprint: [8, 8], height: 6, snap: 'lot_boundary', variantGroup: 'house', maxPerChunk: 6, tags: ['house', 'residential'] },
  { id: 'kenney_city/building-type-g', category: 'building', subcategory: 'house', zones: ['suburbs'], style: 'modern', placement: 'on_lot', footprint: [10, 8], height: 6, snap: 'lot_boundary', variantGroup: 'house', maxPerChunk: 6, tags: ['house', 'residential'] },
  { id: 'kenney_city/building-type-h', category: 'building', subcategory: 'house', zones: ['suburbs'], style: 'modern', placement: 'on_lot', footprint: [8, 10], height: 7, snap: 'lot_boundary', variantGroup: 'house', maxPerChunk: 6, tags: ['house', 'residential'] },
  { id: 'kenney_city/building-type-i', category: 'building', subcategory: 'house', zones: ['suburbs'], style: 'modern', placement: 'on_lot', footprint: [8, 8], height: 6, snap: 'lot_boundary', variantGroup: 'house', maxPerChunk: 6, tags: ['house', 'residential'] },
  { id: 'kenney_city/building-type-j', category: 'building', subcategory: 'house', zones: ['suburbs'], style: 'modern', placement: 'on_lot', footprint: [10, 10], height: 8, snap: 'lot_boundary', variantGroup: 'house', maxPerChunk: 5, tags: ['house', 'residential', '2story'] },
  { id: 'buildings_pack_2_house1', category: 'building', subcategory: 'house', zones: ['suburbs'], style: 'modern', placement: 'on_lot', footprint: [8, 10], height: 6, snap: 'lot_boundary', variantGroup: 'house', maxPerChunk: 6, tags: ['house', 'residential'] },
  { id: 'buildings_pack_2_house2', category: 'building', subcategory: 'house', zones: ['suburbs'], style: 'modern', placement: 'on_lot', footprint: [8, 10], height: 6, snap: 'lot_boundary', variantGroup: 'house', maxPerChunk: 6, tags: ['house', 'residential'] },

  // BUILDINGS — LOW DETAIL (background/distance)
  { id: 'kenney_city/low-detail-building-a', category: 'building', subcategory: 'background', zones: ['any'], style: 'modern', placement: 'on_lot', footprint: [8, 8], height: 15, snap: 'lot_boundary', variantGroup: 'low_detail_bldg', maxPerChunk: 0, tags: ['lod', 'distant', 'background'] },
  { id: 'kenney_city/low-detail-building-b', category: 'building', subcategory: 'background', zones: ['any'], style: 'modern', placement: 'on_lot', footprint: [8, 8], height: 20, snap: 'lot_boundary', variantGroup: 'low_detail_bldg', maxPerChunk: 0, tags: ['lod', 'distant'] },
  { id: 'kenney_city/low-detail-building-c', category: 'building', subcategory: 'background', zones: ['any'], style: 'modern', placement: 'on_lot', footprint: [8, 8], height: 12, snap: 'lot_boundary', variantGroup: 'low_detail_bldg', maxPerChunk: 0, tags: ['lod', 'distant'] },
  { id: 'kenney_city/low-detail-building-wide-a', category: 'building', subcategory: 'background', zones: ['any'], style: 'modern', placement: 'on_lot', footprint: [16, 8], height: 10, snap: 'lot_boundary', variantGroup: 'low_detail_wide', maxPerChunk: 0, tags: ['lod', 'wide', 'warehouse'] },
  { id: 'kenney_city/low-detail-building-wide-b', category: 'building', subcategory: 'background', zones: ['industrial'], style: 'modern', placement: 'on_lot', footprint: [16, 8], height: 8, snap: 'lot_boundary', variantGroup: 'low_detail_wide', maxPerChunk: 0, tags: ['lod', 'warehouse', 'industrial'] },

  // =========================================================================
  // FENCES & BARRIERS
  // =========================================================================
  { id: 'kenney_city/fence', category: 'barrier', subcategory: 'fence', zones: ['suburbs', 'park'], style: 'modern', placement: 'fence_line', footprint: [3, 0.2], height: 1.2, snap: 'fence_post', variantGroup: 'fence', maxPerChunk: 16, tags: ['fence', 'yard', 'boundary'] },
  { id: 'kenney_city/fence-low', category: 'barrier', subcategory: 'fence_low', zones: ['suburbs', 'park'], style: 'modern', placement: 'fence_line', footprint: [3, 0.2], height: 0.8, snap: 'fence_post', variantGroup: 'fence', maxPerChunk: 16, tags: ['fence', 'low', 'garden'] },
  { id: 'fence', category: 'barrier', subcategory: 'fence', zones: ['any'], style: 'any', placement: 'fence_line', footprint: [3, 0.2], height: 1.2, snap: 'fence_post', variantGroup: 'fence_generic', maxPerChunk: 16, tags: ['fence'] },
  { id: 'fence_long', category: 'barrier', subcategory: 'fence', zones: ['any'], style: 'any', placement: 'fence_line', footprint: [6, 0.2], height: 1.2, snap: 'fence_post', variantGroup: 'fence_generic', maxPerChunk: 10, tags: ['fence', 'long'] },

  // =========================================================================
  // VEHICLES
  // =========================================================================
  // Cars
  { id: 'kenney_cars/sedan', category: 'vehicle', subcategory: 'car', zones: ['any'], style: 'modern', placement: 'on_road', footprint: [2, 4.5], height: 1.5, snap: 'road_surface', variantGroup: 'car', maxPerChunk: 6, tags: ['car', 'sedan', 'civilian'] },
  { id: 'kenney_cars/sedan-sports', category: 'vehicle', subcategory: 'car', zones: ['downtown', 'suburbs'], style: 'modern', placement: 'on_road', footprint: [2, 4.5], height: 1.3, snap: 'road_surface', variantGroup: 'car', maxPerChunk: 4, tags: ['car', 'sports', 'fast'] },
  { id: 'kenney_cars/suv', category: 'vehicle', subcategory: 'suv', zones: ['suburbs', 'commercial'], style: 'modern', placement: 'on_road', footprint: [2.2, 5], height: 1.8, snap: 'road_surface', variantGroup: 'car', maxPerChunk: 5, tags: ['suv', 'family'] },
  { id: 'kenney_cars/suv-luxury', category: 'vehicle', subcategory: 'suv', zones: ['downtown', 'suburbs'], style: 'modern', placement: 'on_road', footprint: [2.2, 5.2], height: 1.9, snap: 'road_surface', variantGroup: 'car', maxPerChunk: 3, tags: ['suv', 'luxury'] },
  { id: 'kenney_cars/hatchback-sports', category: 'vehicle', subcategory: 'car', zones: ['any'], style: 'modern', placement: 'on_road', footprint: [1.8, 4], height: 1.4, snap: 'road_surface', variantGroup: 'car', maxPerChunk: 5, tags: ['car', 'hatchback', 'compact'] },
  { id: 'kenney_cars/van', category: 'vehicle', subcategory: 'van', zones: ['commercial', 'suburbs'], style: 'modern', placement: 'on_road', footprint: [2.2, 5.5], height: 2.2, snap: 'road_surface', variantGroup: 'van', maxPerChunk: 3, tags: ['van', 'delivery'] },
  { id: 'kenney_cars/taxi', category: 'vehicle', subcategory: 'taxi', zones: ['downtown', 'commercial'], style: 'modern', placement: 'on_road', footprint: [2, 4.5], height: 1.5, snap: 'road_surface', variantGroup: 'taxi', maxPerChunk: 4, tags: ['taxi', 'cab', 'yellow'] },
  // Trucks
  { id: 'kenney_cars/truck', category: 'vehicle', subcategory: 'truck', zones: ['industrial', 'highway'], style: 'modern', placement: 'on_road', footprint: [2.5, 6], height: 3.0, snap: 'road_surface', variantGroup: 'truck', maxPerChunk: 3, tags: ['truck', 'cargo', 'freight'] },
  { id: 'kenney_cars/truck-flat', category: 'vehicle', subcategory: 'truck', zones: ['industrial'], style: 'modern', placement: 'on_road', footprint: [2.5, 6], height: 2.0, snap: 'road_surface', variantGroup: 'truck', maxPerChunk: 2, tags: ['truck', 'flatbed'] },
  { id: 'kenney_cars/delivery', category: 'vehicle', subcategory: 'truck', zones: ['commercial', 'industrial'], style: 'modern', placement: 'on_road', footprint: [2.5, 6], height: 3.0, snap: 'road_surface', variantGroup: 'delivery', maxPerChunk: 3, tags: ['delivery', 'truck', 'box'] },
  { id: 'kenney_cars/delivery-flat', category: 'vehicle', subcategory: 'truck', zones: ['industrial'], style: 'modern', placement: 'on_road', footprint: [2.5, 6], height: 2.5, snap: 'road_surface', variantGroup: 'delivery', maxPerChunk: 2, tags: ['delivery', 'flatbed'] },
  { id: 'kenney_cars/garbage-truck', category: 'vehicle', subcategory: 'service', zones: ['any'], style: 'modern', placement: 'on_road', footprint: [2.5, 7], height: 3.5, snap: 'road_surface', variantGroup: null, maxPerChunk: 1, tags: ['garbage', 'service', 'municipal'] },
  // Emergency
  { id: 'kenney_cars/police', category: 'vehicle', subcategory: 'emergency', zones: ['any'], style: 'modern', placement: 'on_road', footprint: [2, 4.5], height: 1.6, snap: 'road_surface', variantGroup: 'emergency', maxPerChunk: 2, tags: ['police', 'cop', 'law'] },
  { id: 'kenney_cars/ambulance', category: 'vehicle', subcategory: 'emergency', zones: ['any'], style: 'modern', placement: 'on_road', footprint: [2.2, 5.5], height: 2.5, snap: 'road_surface', variantGroup: 'emergency', maxPerChunk: 1, tags: ['ambulance', 'medical', 'hospital'] },
  { id: 'kenney_cars/firetruck', category: 'vehicle', subcategory: 'emergency', zones: ['any'], style: 'modern', placement: 'on_road', footprint: [2.5, 8], height: 3.5, snap: 'road_surface', variantGroup: 'emergency', maxPerChunk: 1, tags: ['firetruck', 'fire', 'rescue'] },
  // Construction
  { id: 'kenney_cars/tractor', category: 'vehicle', subcategory: 'construction', zones: ['industrial', 'suburbs'], style: 'modern', placement: 'on_road', footprint: [2.5, 4], height: 2.5, snap: 'road_surface', variantGroup: 'construction', maxPerChunk: 1, tags: ['tractor', 'farm', 'construction'] },
  { id: 'kenney_cars/tractor-shovel', category: 'vehicle', subcategory: 'construction', zones: ['industrial'], style: 'modern', placement: 'ground', footprint: [2.5, 5], height: 3.0, snap: 'ground', variantGroup: 'construction', maxPerChunk: 1, tags: ['bulldozer', 'construction', 'excavator'] },

  // =========================================================================
  // VEGETATION
  // =========================================================================
  { id: 'kenney_city/tree-large', category: 'vegetation', subcategory: 'tree', zones: ['any'], style: 'modern', placement: 'ground', footprint: [4, 4], height: 8, snap: 'ground', variantGroup: 'city_tree', maxPerChunk: 8, tags: ['tree', 'large', 'deciduous'] },
  { id: 'kenney_city/tree-small', category: 'vegetation', subcategory: 'tree', zones: ['any'], style: 'modern', placement: 'sidewalk', footprint: [2, 2], height: 4, snap: 'sidewalk_edge', variantGroup: 'city_tree', maxPerChunk: 10, tags: ['tree', 'small', 'street'] },
  { id: 'kenney_city/planter', category: 'vegetation', subcategory: 'planter', zones: ['downtown', 'commercial'], style: 'modern', placement: 'sidewalk', footprint: [1, 1], height: 0.8, snap: 'sidewalk_edge', variantGroup: 'planter', maxPerChunk: 6, tags: ['planter', 'flower', 'pot'] },
  { id: 'oak_tree_00', category: 'vegetation', subcategory: 'tree', zones: ['park', 'suburbs'], style: 'any', placement: 'ground', footprint: [5, 5], height: 10, snap: 'ground', variantGroup: 'oak', maxPerChunk: 6, tags: ['tree', 'oak', 'large'] },
  { id: 'pine_tree_00', category: 'vegetation', subcategory: 'tree', zones: ['park', 'suburbs'], style: 'any', placement: 'ground', footprint: [3, 3], height: 12, snap: 'ground', variantGroup: 'pine', maxPerChunk: 8, tags: ['tree', 'pine', 'evergreen'] },
  { id: 'palm_tree_00', category: 'vegetation', subcategory: 'tree', zones: ['commercial', 'park'], style: 'modern', placement: 'ground', footprint: [3, 3], height: 10, snap: 'ground', variantGroup: 'palm', maxPerChunk: 6, tags: ['tree', 'palm', 'tropical'] },
  { id: 'bush_00', category: 'vegetation', subcategory: 'bush', zones: ['any'], style: 'any', placement: 'ground', footprint: [1.5, 1.5], height: 1.0, snap: 'ground', variantGroup: 'bush', maxPerChunk: 12, tags: ['bush', 'hedge', 'shrub'] },

  // =========================================================================
  // BUILDING DETAILS (awnings, chimneys, etc.)
  // =========================================================================
  { id: 'kenney_city/detail-awning', category: 'prop', subcategory: 'awning', zones: ['commercial', 'downtown'], style: 'modern', placement: 'on_lot', footprint: [2, 1], height: 3, snap: 'building_wall', variantGroup: 'awning', maxPerChunk: 8, tags: ['awning', 'shop', 'shade'] },
  { id: 'kenney_city/detail-awning-wide', category: 'prop', subcategory: 'awning', zones: ['commercial'], style: 'modern', placement: 'on_lot', footprint: [4, 1], height: 3, snap: 'building_wall', variantGroup: 'awning', maxPerChunk: 6, tags: ['awning', 'wide', 'shop'] },
  { id: 'kenney_city/detail-parasol-a', category: 'prop', subcategory: 'parasol', zones: ['commercial', 'park'], style: 'modern', placement: 'sidewalk', footprint: [2, 2], height: 2.5, snap: 'ground', variantGroup: 'parasol', maxPerChunk: 4, tags: ['parasol', 'umbrella', 'cafe'] },
  { id: 'kenney_city/chimney-basic', category: 'prop', subcategory: 'chimney', zones: ['suburbs'], style: 'modern', placement: 'on_lot', footprint: [0.5, 0.5], height: 1.5, snap: 'building_wall', variantGroup: 'chimney', maxPerChunk: 4, tags: ['chimney', 'roof'] },

  // =========================================================================
  // CHARACTERS / NPCs
  // =========================================================================
  { id: 'avatar', category: 'character', subcategory: 'pedestrian', zones: ['any'], style: 'modern', placement: 'sidewalk', footprint: [0.5, 0.5], height: 1.8, snap: 'ground', variantGroup: 'pedestrian', maxPerChunk: 8, tags: ['person', 'civilian', 'walk'] },
  { id: 'walking_man', category: 'character', subcategory: 'pedestrian', zones: ['any'], style: 'modern', placement: 'sidewalk', footprint: [0.5, 0.5], height: 1.8, snap: 'ground', variantGroup: 'pedestrian', maxPerChunk: 8, tags: ['person', 'man', 'walk'] },
  { id: 'women_soldier', category: 'character', subcategory: 'pedestrian', zones: ['any'], style: 'modern', placement: 'sidewalk', footprint: [0.5, 0.5], height: 1.7, snap: 'ground', variantGroup: 'pedestrian', maxPerChunk: 6, tags: ['person', 'woman'] },

  // =========================================================================
  // ROAD DEBRIS / PROPS (cones, boxes for roads)
  // =========================================================================
  { id: 'kenney_cars/cone', category: 'prop', subcategory: 'cone', zones: ['any'], style: 'modern', placement: 'road_edge', footprint: [0.3, 0.3], height: 0.5, snap: 'road_edge', variantGroup: 'cone', maxPerChunk: 8, tags: ['cone', 'traffic', 'construction', 'orange'] },
  { id: 'kenney_cars/cone-flat', category: 'prop', subcategory: 'cone', zones: ['any'], style: 'modern', placement: 'on_road', footprint: [0.3, 0.3], height: 0.1, snap: 'road_surface', variantGroup: 'cone', maxPerChunk: 4, tags: ['cone', 'flat', 'knocked'] },
  { id: 'kenney_cars/box', category: 'prop', subcategory: 'crate', zones: ['industrial', 'commercial'], style: 'modern', placement: 'ground', footprint: [1, 1], height: 1, snap: 'ground', variantGroup: null, maxPerChunk: 4, tags: ['box', 'crate', 'cargo'] },
];

// ---------------------------------------------------------------------------
// Index lookup (built once, queried fast)
// ---------------------------------------------------------------------------

class AssetIndexDB {
  constructor(entries) {
    this._entries = entries;
    this._byId = new Map();
    this._byCategory = new Map();
    this._byVariantGroup = new Map();

    for (const entry of entries) {
      this._byId.set(entry.id, entry);

      if (!this._byCategory.has(entry.category)) {
        this._byCategory.set(entry.category, []);
      }
      this._byCategory.get(entry.category).push(entry);

      if (entry.variantGroup) {
        if (!this._byVariantGroup.has(entry.variantGroup)) {
          this._byVariantGroup.set(entry.variantGroup, []);
        }
        this._byVariantGroup.get(entry.variantGroup).push(entry);
      }
    }
  }

  /** Get asset by exact ID */
  get(id) {
    return this._byId.get(id) || null;
  }

  /** Get all assets in a category */
  byCategory(category) {
    return this._byCategory.get(category) || [];
  }

  /** Query with filters */
  query({ category, zone, style, placement, subcategory, search, minHeight, maxHeight } = {}) {
    let results = this._entries;

    if (category) results = results.filter(a => a.category === category);
    if (zone) results = results.filter(a => a.zones.includes('any') || a.zones.includes(zone));
    if (style) results = results.filter(a => a.style === 'any' || a.style === style);
    if (placement) results = results.filter(a => a.placement === placement);
    if (subcategory) results = results.filter(a => a.subcategory.includes(subcategory));
    if (minHeight !== undefined) results = results.filter(a => a.height >= minHeight);
    if (maxHeight !== undefined) results = results.filter(a => a.height <= maxHeight);
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(a =>
        a.id.toLowerCase().includes(q) ||
        a.subcategory.toLowerCase().includes(q) ||
        a.tags.some(t => t.includes(q))
      );
    }

    return results;
  }

  /** Pick a random asset from a variant group */
  randomVariant(groupName) {
    const group = this._byVariantGroup.get(groupName);
    if (!group || group.length === 0) return null;
    return group[Math.floor(Math.random() * group.length)];
  }

  /** Pick a random asset matching a query */
  randomMatch(queryOpts) {
    const matches = this.query(queryOpts);
    if (matches.length === 0) return null;
    return matches[Math.floor(Math.random() * matches.length)];
  }

  /** Stats */
  get count() { return this._entries.length; }
  get categories() { return [...this._byCategory.keys()]; }
  get variantGroups() { return [...this._byVariantGroup.keys()]; }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

const assetIndex = new AssetIndexDB(ASSET_INDEX);

export { assetIndex, AssetIndexDB, ASSET_INDEX };
export default assetIndex;
