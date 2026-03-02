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

  // =========================================================================
  // MEDIEVAL TEMPLATE — Buildings
  // =========================================================================
  { id: 'medieval_village_pack_house_1', category: 'building', subcategory: 'cottage', zones: ['cottage', 'market'], style: 'medieval', placement: 'on_lot', footprint: [8, 8], height: 6, snap: 'lot_boundary', variantGroup: 'medieval_house', maxPerChunk: 4, tags: ['house', 'medieval', 'village'] },
  { id: 'medieval_village_pack_house_2', category: 'building', subcategory: 'cottage', zones: ['cottage', 'market'], style: 'medieval', placement: 'on_lot', footprint: [8, 8], height: 6, snap: 'lot_boundary', variantGroup: 'medieval_house', maxPerChunk: 4, tags: ['house', 'medieval', 'village'] },
  { id: 'medieval_village_pack_house_3', category: 'building', subcategory: 'cottage', zones: ['cottage', 'market'], style: 'medieval', placement: 'on_lot', footprint: [8, 10], height: 7, snap: 'lot_boundary', variantGroup: 'medieval_house', maxPerChunk: 4, tags: ['house', 'medieval', 'village'] },
  { id: 'medieval_village_pack_house_4', category: 'building', subcategory: 'cottage', zones: ['cottage', 'market'], style: 'medieval', placement: 'on_lot', footprint: [10, 10], height: 7, snap: 'lot_boundary', variantGroup: 'medieval_house', maxPerChunk: 3, tags: ['house', 'medieval', 'large'] },
  { id: 'medieval_village_pack_inn', category: 'building', subcategory: 'inn', zones: ['market', 'cottage'], style: 'medieval', placement: 'on_lot', footprint: [12, 10], height: 8, snap: 'lot_boundary', variantGroup: 'medieval_inn', maxPerChunk: 1, tags: ['inn', 'tavern', 'medieval'] },
  { id: 'medieval_village_pack_blacksmith', category: 'building', subcategory: 'workshop', zones: ['market', 'cottage'], style: 'medieval', placement: 'on_lot', footprint: [10, 8], height: 6, snap: 'lot_boundary', variantGroup: 'medieval_workshop', maxPerChunk: 1, tags: ['blacksmith', 'forge', 'medieval'] },
  { id: 'medieval_village_pack_stable', category: 'building', subcategory: 'stable', zones: ['farm', 'cottage'], style: 'medieval', placement: 'on_lot', footprint: [12, 8], height: 5, snap: 'lot_boundary', variantGroup: 'medieval_stable', maxPerChunk: 2, tags: ['stable', 'horse', 'medieval'] },
  { id: 'medieval_village_pack_mill', category: 'building', subcategory: 'mill', zones: ['farm', 'cottage'], style: 'medieval', placement: 'on_lot', footprint: [8, 8], height: 10, snap: 'lot_boundary', variantGroup: 'medieval_mill', maxPerChunk: 1, tags: ['mill', 'grain', 'medieval'] },
  { id: 'medieval_village_pack_sawmill', category: 'building', subcategory: 'workshop', zones: ['farm', 'cottage'], style: 'medieval', placement: 'on_lot', footprint: [10, 8], height: 6, snap: 'lot_boundary', variantGroup: 'medieval_workshop', maxPerChunk: 1, tags: ['sawmill', 'wood', 'medieval'] },
  { id: 'medieval_village_pack_bell_tower', category: 'building', subcategory: 'tower', zones: ['castle', 'market'], style: 'medieval', placement: 'on_lot', footprint: [6, 6], height: 15, snap: 'lot_boundary', variantGroup: 'medieval_tower', maxPerChunk: 1, tags: ['tower', 'bell', 'church'] },
  { id: 'cottage_00', category: 'building', subcategory: 'cottage', zones: ['cottage'], style: 'medieval', placement: 'on_lot', footprint: [8, 8], height: 5, snap: 'lot_boundary', variantGroup: 'cottage', maxPerChunk: 4, tags: ['cottage', 'small', 'rural'] },
  { id: 'cottage_01', category: 'building', subcategory: 'cottage', zones: ['cottage'], style: 'medieval', placement: 'on_lot', footprint: [8, 8], height: 5, snap: 'lot_boundary', variantGroup: 'cottage', maxPerChunk: 4, tags: ['cottage', 'small', 'rural'] },
  { id: 'cottage_02', category: 'building', subcategory: 'cottage', zones: ['cottage'], style: 'medieval', placement: 'on_lot', footprint: [8, 10], height: 6, snap: 'lot_boundary', variantGroup: 'cottage', maxPerChunk: 4, tags: ['cottage', 'medium', 'rural'] },
  { id: 'cottage_03', category: 'building', subcategory: 'cottage', zones: ['cottage'], style: 'medieval', placement: 'on_lot', footprint: [10, 8], height: 6, snap: 'lot_boundary', variantGroup: 'cottage', maxPerChunk: 4, tags: ['cottage', 'medium', 'rural'] },
  { id: 'cottage_04', category: 'building', subcategory: 'cottage', zones: ['cottage'], style: 'medieval', placement: 'on_lot', footprint: [10, 10], height: 7, snap: 'lot_boundary', variantGroup: 'cottage', maxPerChunk: 3, tags: ['cottage', 'large', 'rural'] },

  // MEDIEVAL — Castle / fortifications
  { id: 'castle_gate', category: 'building', subcategory: 'castle', zones: ['castle'], style: 'medieval', placement: 'on_lot', footprint: [10, 6], height: 12, snap: 'lot_boundary', variantGroup: 'castle', maxPerChunk: 1, tags: ['castle', 'gate', 'fortification'] },
  { id: 'castle_wall_short', category: 'building', subcategory: 'wall', zones: ['castle'], style: 'medieval', placement: 'on_lot', footprint: [8, 2], height: 8, snap: 'lot_boundary', variantGroup: 'castle_wall', maxPerChunk: 8, tags: ['wall', 'castle', 'stone'] },
  { id: 'castle_wall_medium', category: 'building', subcategory: 'wall', zones: ['castle'], style: 'medieval', placement: 'on_lot', footprint: [12, 2], height: 8, snap: 'lot_boundary', variantGroup: 'castle_wall', maxPerChunk: 6, tags: ['wall', 'castle', 'stone'] },
  { id: 'castle_wall_long', category: 'building', subcategory: 'wall', zones: ['castle'], style: 'medieval', placement: 'on_lot', footprint: [16, 2], height: 8, snap: 'lot_boundary', variantGroup: 'castle_wall', maxPerChunk: 4, tags: ['wall', 'castle', 'stone'] },
  { id: 'modular_medieval_buildings_pack_tower', category: 'building', subcategory: 'tower', zones: ['castle'], style: 'medieval', placement: 'on_lot', footprint: [6, 6], height: 18, snap: 'lot_boundary', variantGroup: 'medieval_tower', maxPerChunk: 2, tags: ['tower', 'castle', 'defense'] },
  { id: 'modular_medieval_buildings_pack_watchtower', category: 'building', subcategory: 'tower', zones: ['castle', 'farm'], style: 'medieval', placement: 'on_lot', footprint: [5, 5], height: 12, snap: 'lot_boundary', variantGroup: 'medieval_tower', maxPerChunk: 2, tags: ['watchtower', 'defense', 'medieval'] },

  // MEDIEVAL — Roads / paths
  { id: 'medieval_village_pack_path_straight', category: 'road', subcategory: 'path', zones: ['any'], style: 'medieval', placement: 'ground', footprint: [10, 10], height: 0.1, snap: 'ground', variantGroup: 'medieval_path', maxPerChunk: 0, tags: ['path', 'dirt', 'medieval'] },
  { id: 'medieval_village_pack_path_square', category: 'road', subcategory: 'path_square', zones: ['any'], style: 'medieval', placement: 'ground', footprint: [10, 10], height: 0.1, snap: 'ground', variantGroup: 'medieval_intersection', maxPerChunk: 0, tags: ['path', 'intersection', 'medieval'] },

  // MEDIEVAL — Street furniture / props
  { id: 'medieval_village_pack_bench_1', category: 'street_furniture', subcategory: 'bench', zones: ['market', 'cottage', 'castle'], style: 'medieval', placement: 'sidewalk', footprint: [1.5, 0.5], height: 0.8, snap: 'sidewalk_edge', variantGroup: 'medieval_bench', maxPerChunk: 4, tags: ['bench', 'wooden', 'medieval'] },
  { id: 'medieval_village_pack_bench_2', category: 'street_furniture', subcategory: 'bench', zones: ['market', 'cottage', 'castle'], style: 'medieval', placement: 'sidewalk', footprint: [1.5, 0.5], height: 0.8, snap: 'sidewalk_edge', variantGroup: 'medieval_bench', maxPerChunk: 4, tags: ['bench', 'wooden', 'medieval'] },
  { id: 'medieval_village_pack_well', category: 'street_furniture', subcategory: 'well', zones: ['market', 'cottage', 'farm'], style: 'medieval', placement: 'ground', footprint: [2, 2], height: 2.0, snap: 'ground', variantGroup: 'medieval_well', maxPerChunk: 1, tags: ['well', 'water', 'medieval'] },
  { id: 'medieval_village_pack_gazebo', category: 'street_furniture', subcategory: 'gazebo', zones: ['market', 'cottage'], style: 'medieval', placement: 'ground', footprint: [4, 4], height: 3.5, snap: 'ground', variantGroup: null, maxPerChunk: 1, tags: ['gazebo', 'gathering', 'medieval'] },
  { id: 'medieval_village_pack_barrel', category: 'street_furniture', subcategory: 'barrel', zones: ['any'], style: 'medieval', placement: 'ground', footprint: [0.6, 0.6], height: 1.0, snap: 'ground', variantGroup: 'medieval_barrel', maxPerChunk: 8, tags: ['barrel', 'storage', 'medieval'] },
  { id: 'medieval_village_pack_crate', category: 'street_furniture', subcategory: 'crate', zones: ['market', 'farm'], style: 'medieval', placement: 'ground', footprint: [0.8, 0.8], height: 0.8, snap: 'ground', variantGroup: 'medieval_crate', maxPerChunk: 6, tags: ['crate', 'storage', 'medieval'] },
  { id: 'medieval_village_pack_cart', category: 'vehicle', subcategory: 'cart', zones: ['market', 'farm', 'cottage'], style: 'medieval', placement: 'ground', footprint: [2, 4], height: 1.5, snap: 'ground', variantGroup: 'medieval_cart', maxPerChunk: 2, tags: ['cart', 'transport', 'medieval'] },
  { id: 'medieval_village_pack_cauldron', category: 'street_furniture', subcategory: 'cauldron', zones: ['market', 'cottage'], style: 'medieval', placement: 'ground', footprint: [1, 1], height: 0.8, snap: 'ground', variantGroup: null, maxPerChunk: 2, tags: ['cauldron', 'cooking', 'medieval'] },
  { id: 'medieval_village_pack_bonfire', category: 'street_furniture', subcategory: 'bonfire', zones: ['any'], style: 'medieval', placement: 'ground', footprint: [2, 2], height: 1.5, snap: 'ground', variantGroup: 'medieval_bonfire', maxPerChunk: 2, tags: ['bonfire', 'fire', 'medieval'] },
  { id: 'medieval_village_pack_fence', category: 'barrier', subcategory: 'fence', zones: ['cottage', 'farm'], style: 'medieval', placement: 'fence_line', footprint: [3, 0.2], height: 1.0, snap: 'fence_post', variantGroup: 'medieval_fence', maxPerChunk: 16, tags: ['fence', 'wooden', 'medieval'] },
  { id: 'medieval_village_pack_hay', category: 'prop', subcategory: 'hay', zones: ['farm', 'stable'], style: 'medieval', placement: 'ground', footprint: [2, 2], height: 1.5, snap: 'ground', variantGroup: 'medieval_hay', maxPerChunk: 6, tags: ['hay', 'farm', 'medieval'] },
  { id: 'medieval_village_pack_market_stand_1', category: 'street_furniture', subcategory: 'market_stall', zones: ['market'], style: 'medieval', placement: 'ground', footprint: [3, 2], height: 2.5, snap: 'ground', variantGroup: 'market_stall', maxPerChunk: 4, tags: ['market', 'stall', 'trade'] },
  { id: 'medieval_village_pack_marketstand_2', category: 'street_furniture', subcategory: 'market_stall', zones: ['market'], style: 'medieval', placement: 'ground', footprint: [3, 2], height: 2.5, snap: 'ground', variantGroup: 'market_stall', maxPerChunk: 4, tags: ['market', 'stall', 'trade'] },
  { id: 'lamp_post_medieval', category: 'street_furniture', subcategory: 'streetlight', zones: ['any'], style: 'medieval', placement: 'sidewalk', footprint: [0.5, 0.5], height: 3.5, snap: 'sidewalk_edge', variantGroup: 'medieval_lamp', maxPerChunk: 8, tags: ['lamp', 'torch', 'medieval'] },
  { id: 'medieval_village_pack_rock_1', category: 'vegetation', subcategory: 'rock', zones: ['any'], style: 'medieval', placement: 'ground', footprint: [2, 2], height: 1.0, snap: 'ground', variantGroup: 'medieval_rock', maxPerChunk: 6, tags: ['rock', 'stone', 'nature'] },
  { id: 'medieval_village_pack_rock_2', category: 'vegetation', subcategory: 'rock', zones: ['any'], style: 'medieval', placement: 'ground', footprint: [1.5, 1.5], height: 0.8, snap: 'ground', variantGroup: 'medieval_rock', maxPerChunk: 6, tags: ['rock', 'stone', 'nature'] },
  { id: 'medieval_village_pack_rock_3', category: 'vegetation', subcategory: 'rock', zones: ['any'], style: 'medieval', placement: 'ground', footprint: [3, 3], height: 1.5, snap: 'ground', variantGroup: 'medieval_rock', maxPerChunk: 4, tags: ['rock', 'boulder', 'nature'] },

  // MEDIEVAL — Characters
  { id: 'char_villager_brown', category: 'character', subcategory: 'villager', zones: ['any'], style: 'medieval', placement: 'sidewalk', footprint: [0.5, 0.5], height: 1.7, snap: 'ground', variantGroup: 'villager', maxPerChunk: 6, tags: ['villager', 'peasant', 'medieval'] },
  { id: 'char_villager_green', category: 'character', subcategory: 'villager', zones: ['any'], style: 'medieval', placement: 'sidewalk', footprint: [0.5, 0.5], height: 1.7, snap: 'ground', variantGroup: 'villager', maxPerChunk: 6, tags: ['villager', 'peasant', 'medieval'] },
  { id: 'char_villager_blue', category: 'character', subcategory: 'villager', zones: ['any'], style: 'medieval', placement: 'sidewalk', footprint: [0.5, 0.5], height: 1.7, snap: 'ground', variantGroup: 'villager', maxPerChunk: 6, tags: ['villager', 'peasant', 'medieval'] },
  { id: 'char_villager_red', category: 'character', subcategory: 'villager', zones: ['any'], style: 'medieval', placement: 'sidewalk', footprint: [0.5, 0.5], height: 1.7, snap: 'ground', variantGroup: 'villager', maxPerChunk: 6, tags: ['villager', 'peasant', 'medieval'] },
  { id: 'char_villager_yellow', category: 'character', subcategory: 'villager', zones: ['any'], style: 'medieval', placement: 'sidewalk', footprint: [0.5, 0.5], height: 1.7, snap: 'ground', variantGroup: 'villager', maxPerChunk: 6, tags: ['villager', 'peasant', 'medieval'] },
  { id: 'char_villager_purple', category: 'character', subcategory: 'villager', zones: ['any'], style: 'medieval', placement: 'sidewalk', footprint: [0.5, 0.5], height: 1.7, snap: 'ground', variantGroup: 'villager', maxPerChunk: 6, tags: ['villager', 'peasant', 'medieval'] },
  { id: 'char_villager_orange', category: 'character', subcategory: 'villager', zones: ['any'], style: 'medieval', placement: 'sidewalk', footprint: [0.5, 0.5], height: 1.7, snap: 'ground', variantGroup: 'villager', maxPerChunk: 6, tags: ['villager', 'peasant', 'medieval'] },
  { id: 'char_villager_dark', category: 'character', subcategory: 'villager', zones: ['any'], style: 'medieval', placement: 'sidewalk', footprint: [0.5, 0.5], height: 1.7, snap: 'ground', variantGroup: 'villager', maxPerChunk: 6, tags: ['villager', 'peasant', 'medieval'] },
  { id: 'char_knight_silver', category: 'character', subcategory: 'knight', zones: ['castle', 'market'], style: 'medieval', placement: 'sidewalk', footprint: [0.6, 0.6], height: 1.9, snap: 'ground', variantGroup: 'knight', maxPerChunk: 3, tags: ['knight', 'guard', 'medieval'] },

  // MEDIEVAL — Traffic control (wooden signs)
  { id: 'modular_medieval_buildings_pack_banner', category: 'traffic_control', subcategory: 'banner', zones: ['castle', 'market'], style: 'medieval', placement: 'intersection', footprint: [0.3, 0.3], height: 3.0, snap: 'road_edge', variantGroup: 'medieval_banner', maxPerChunk: 4, tags: ['banner', 'flag', 'medieval'] },

  // =========================================================================
  // ZOMBIE TEMPLATE — Buildings (reuse modern with zombie style)
  // =========================================================================
  { id: 'kenney_city/building-a', category: 'building', subcategory: 'ruin_commercial', zones: ['ruin', 'barricade'], style: 'zombie', placement: 'on_lot', footprint: [8, 8], height: 12, snap: 'lot_boundary', variantGroup: 'ruin_bldg', maxPerChunk: 4, tags: ['ruin', 'abandoned', 'commercial'] },
  { id: 'kenney_city/building-b', category: 'building', subcategory: 'ruin_commercial', zones: ['ruin', 'barricade'], style: 'zombie', placement: 'on_lot', footprint: [8, 8], height: 15, snap: 'lot_boundary', variantGroup: 'ruin_bldg', maxPerChunk: 4, tags: ['ruin', 'abandoned', 'office'] },
  { id: 'kenney_city/building-c', category: 'building', subcategory: 'ruin_commercial', zones: ['ruin'], style: 'zombie', placement: 'on_lot', footprint: [8, 10], height: 10, snap: 'lot_boundary', variantGroup: 'ruin_bldg', maxPerChunk: 4, tags: ['ruin', 'abandoned', 'retail'] },
  { id: 'kenney_city/building-type-a', category: 'building', subcategory: 'ruin_house', zones: ['ruin', 'safe_zone'], style: 'zombie', placement: 'on_lot', footprint: [8, 10], height: 6, snap: 'lot_boundary', variantGroup: 'ruin_house', maxPerChunk: 5, tags: ['ruin', 'house', 'abandoned'] },
  { id: 'kenney_city/building-type-b', category: 'building', subcategory: 'ruin_house', zones: ['ruin', 'safe_zone'], style: 'zombie', placement: 'on_lot', footprint: [8, 10], height: 6, snap: 'lot_boundary', variantGroup: 'ruin_house', maxPerChunk: 5, tags: ['ruin', 'house', 'abandoned'] },
  { id: 'kenney_city/building-type-c', category: 'building', subcategory: 'ruin_house', zones: ['ruin'], style: 'zombie', placement: 'on_lot', footprint: [8, 10], height: 7, snap: 'lot_boundary', variantGroup: 'ruin_house', maxPerChunk: 5, tags: ['ruin', 'house', 'abandoned'] },
  { id: 'kenney_city/building-skyscraper-a', category: 'building', subcategory: 'ruin_tower', zones: ['ruin'], style: 'zombie', placement: 'on_lot', footprint: [12, 12], height: 40, snap: 'lot_boundary', variantGroup: 'ruin_skyscraper', maxPerChunk: 1, tags: ['ruin', 'skyscraper', 'destroyed'] },
  { id: 'kenney_city/building-skyscraper-b', category: 'building', subcategory: 'ruin_tower', zones: ['ruin'], style: 'zombie', placement: 'on_lot', footprint: [12, 12], height: 45, snap: 'lot_boundary', variantGroup: 'ruin_skyscraper', maxPerChunk: 1, tags: ['ruin', 'skyscraper', 'destroyed'] },
  { id: 'ruined_castle_keep', category: 'building', subcategory: 'ruin_landmark', zones: ['barricade', 'safe_zone'], style: 'zombie', placement: 'on_lot', footprint: [14, 14], height: 12, snap: 'lot_boundary', variantGroup: null, maxPerChunk: 1, tags: ['ruin', 'castle', 'landmark'] },

  // ZOMBIE — Vegetation (dead trees, graves)
  { id: 'dead_tree_00', category: 'vegetation', subcategory: 'dead_tree', zones: ['ruin', 'barricade'], style: 'zombie', placement: 'ground', footprint: [3, 3], height: 6, snap: 'ground', variantGroup: 'dead_tree', maxPerChunk: 6, tags: ['tree', 'dead', 'spooky'] },
  { id: 'dead_tree_01', category: 'vegetation', subcategory: 'dead_tree', zones: ['ruin', 'barricade'], style: 'zombie', placement: 'ground', footprint: [3, 3], height: 7, snap: 'ground', variantGroup: 'dead_tree', maxPerChunk: 6, tags: ['tree', 'dead', 'spooky'] },
  { id: 'dead_tree_02', category: 'vegetation', subcategory: 'dead_tree', zones: ['ruin', 'barricade'], style: 'zombie', placement: 'ground', footprint: [3, 3], height: 5, snap: 'ground', variantGroup: 'dead_tree', maxPerChunk: 6, tags: ['tree', 'dead', 'spooky'] },
  { id: 'dead_tree_03', category: 'vegetation', subcategory: 'dead_tree', zones: ['ruin', 'barricade'], style: 'zombie', placement: 'ground', footprint: [4, 4], height: 8, snap: 'ground', variantGroup: 'dead_tree', maxPerChunk: 6, tags: ['tree', 'dead', 'withered'] },
  { id: 'dead_tree_04', category: 'vegetation', subcategory: 'dead_tree', zones: ['ruin'], style: 'zombie', placement: 'ground', footprint: [3, 3], height: 6, snap: 'ground', variantGroup: 'dead_tree', maxPerChunk: 6, tags: ['tree', 'dead'] },
  { id: 'dead_tree_05', category: 'vegetation', subcategory: 'dead_tree', zones: ['ruin'], style: 'zombie', placement: 'ground', footprint: [3, 3], height: 7, snap: 'ground', variantGroup: 'dead_tree', maxPerChunk: 6, tags: ['tree', 'dead'] },
  { id: 'dead_tree_06', category: 'vegetation', subcategory: 'dead_tree', zones: ['ruin'], style: 'zombie', placement: 'ground', footprint: [4, 4], height: 8, snap: 'ground', variantGroup: 'dead_tree', maxPerChunk: 6, tags: ['tree', 'dead'] },
  { id: 'dead_tree_07', category: 'vegetation', subcategory: 'dead_tree', zones: ['ruin', 'barricade'], style: 'zombie', placement: 'ground', footprint: [3, 3], height: 5, snap: 'ground', variantGroup: 'dead_tree', maxPerChunk: 6, tags: ['tree', 'dead'] },
  { id: 'dead_tree_08', category: 'vegetation', subcategory: 'dead_tree', zones: ['ruin'], style: 'zombie', placement: 'ground', footprint: [3, 3], height: 6, snap: 'ground', variantGroup: 'dead_tree', maxPerChunk: 6, tags: ['tree', 'dead'] },
  { id: 'dead_tree_09', category: 'vegetation', subcategory: 'dead_tree', zones: ['ruin'], style: 'zombie', placement: 'ground', footprint: [3, 3], height: 7, snap: 'ground', variantGroup: 'dead_tree', maxPerChunk: 6, tags: ['tree', 'dead'] },
  { id: 'grave_cross_00', category: 'vegetation', subcategory: 'grave', zones: ['ruin'], style: 'zombie', placement: 'ground', footprint: [1, 1], height: 1.5, snap: 'ground', variantGroup: 'grave', maxPerChunk: 8, tags: ['grave', 'cross', 'cemetery'] },
  { id: 'grave_cross_01', category: 'vegetation', subcategory: 'grave', zones: ['ruin'], style: 'zombie', placement: 'ground', footprint: [1, 1], height: 1.5, snap: 'ground', variantGroup: 'grave', maxPerChunk: 8, tags: ['grave', 'cross', 'cemetery'] },
  { id: 'grave_cross_02', category: 'vegetation', subcategory: 'grave', zones: ['ruin'], style: 'zombie', placement: 'ground', footprint: [1, 1], height: 1.5, snap: 'ground', variantGroup: 'grave', maxPerChunk: 8, tags: ['grave', 'cross'] },
  { id: 'grave_cross_03', category: 'vegetation', subcategory: 'grave', zones: ['ruin'], style: 'zombie', placement: 'ground', footprint: [1, 1], height: 1.8, snap: 'ground', variantGroup: 'grave', maxPerChunk: 8, tags: ['grave', 'cross'] },
  { id: 'grave_cross_04', category: 'vegetation', subcategory: 'grave', zones: ['ruin'], style: 'zombie', placement: 'ground', footprint: [1, 1], height: 1.5, snap: 'ground', variantGroup: 'grave', maxPerChunk: 8, tags: ['grave', 'cross'] },
  { id: 'grave_stone_00', category: 'vegetation', subcategory: 'grave', zones: ['ruin'], style: 'zombie', placement: 'ground', footprint: [0.8, 0.4], height: 1.0, snap: 'ground', variantGroup: 'gravestone', maxPerChunk: 8, tags: ['gravestone', 'cemetery'] },
  { id: 'grave_stone_01', category: 'vegetation', subcategory: 'grave', zones: ['ruin'], style: 'zombie', placement: 'ground', footprint: [0.8, 0.4], height: 1.0, snap: 'ground', variantGroup: 'gravestone', maxPerChunk: 8, tags: ['gravestone', 'cemetery'] },
  { id: 'grave_stone_02', category: 'vegetation', subcategory: 'grave', zones: ['ruin'], style: 'zombie', placement: 'ground', footprint: [0.8, 0.4], height: 1.2, snap: 'ground', variantGroup: 'gravestone', maxPerChunk: 8, tags: ['gravestone', 'cemetery'] },
  { id: 'grave_stone_03', category: 'vegetation', subcategory: 'grave', zones: ['ruin'], style: 'zombie', placement: 'ground', footprint: [0.8, 0.4], height: 1.0, snap: 'ground', variantGroup: 'gravestone', maxPerChunk: 8, tags: ['gravestone', 'cemetery'] },
  { id: 'grave_stone_04', category: 'vegetation', subcategory: 'grave', zones: ['ruin'], style: 'zombie', placement: 'ground', footprint: [0.8, 0.4], height: 1.2, snap: 'ground', variantGroup: 'gravestone', maxPerChunk: 8, tags: ['gravestone', 'cemetery'] },

  // ZOMBIE — Survival props
  { id: 'survival_pack_tent', category: 'building', subcategory: 'shelter', zones: ['safe_zone', 'barricade'], style: 'zombie', placement: 'on_lot', footprint: [4, 4], height: 2.5, snap: 'ground', variantGroup: 'survivor_shelter', maxPerChunk: 2, tags: ['tent', 'shelter', 'survival'] },
  { id: 'survival_pack_bonfire', category: 'street_furniture', subcategory: 'bonfire', zones: ['safe_zone', 'barricade'], style: 'zombie', placement: 'ground', footprint: [2, 2], height: 1.5, snap: 'ground', variantGroup: 'zombie_bonfire', maxPerChunk: 2, tags: ['bonfire', 'fire', 'warmth'] },
  { id: 'survival_pack_beartrap_open', category: 'prop', subcategory: 'trap', zones: ['barricade', 'ruin'], style: 'zombie', placement: 'ground', footprint: [0.8, 0.8], height: 0.3, snap: 'ground', variantGroup: 'trap', maxPerChunk: 4, tags: ['beartrap', 'trap', 'defense'] },
  { id: 'survival_pack_backpack', category: 'prop', subcategory: 'supplies', zones: ['safe_zone', 'ruin'], style: 'zombie', placement: 'ground', footprint: [0.5, 0.5], height: 0.6, snap: 'ground', variantGroup: 'supplies', maxPerChunk: 3, tags: ['backpack', 'supplies', 'survival'] },
  { id: 'survival_pack_firstaidkit', category: 'prop', subcategory: 'medical', zones: ['safe_zone'], style: 'zombie', placement: 'ground', footprint: [0.3, 0.3], height: 0.2, snap: 'ground', variantGroup: 'medical', maxPerChunk: 2, tags: ['medkit', 'health', 'medical'] },
  { id: 'survival_pack_gascan', category: 'prop', subcategory: 'supplies', zones: ['ruin', 'barricade'], style: 'zombie', placement: 'ground', footprint: [0.4, 0.3], height: 0.4, snap: 'ground', variantGroup: 'supplies', maxPerChunk: 3, tags: ['gascan', 'fuel', 'supplies'] },
  { id: 'survival_pack_radio', category: 'prop', subcategory: 'supplies', zones: ['safe_zone', 'evac_point'], style: 'zombie', placement: 'ground', footprint: [0.3, 0.2], height: 0.3, snap: 'ground', variantGroup: 'supplies', maxPerChunk: 1, tags: ['radio', 'communication', 'survival'] },
  { id: 'survival_pack_woodlog', category: 'prop', subcategory: 'debris', zones: ['ruin', 'barricade'], style: 'zombie', placement: 'ground', footprint: [1.5, 0.5], height: 0.4, snap: 'ground', variantGroup: 'debris', maxPerChunk: 6, tags: ['log', 'wood', 'debris'] },
  { id: 'survival_pack_trashcan', category: 'street_furniture', subcategory: 'trash_can', zones: ['ruin'], style: 'zombie', placement: 'sidewalk', footprint: [0.5, 0.5], height: 0.8, snap: 'ground', variantGroup: 'zombie_trash', maxPerChunk: 4, tags: ['trash', 'garbage', 'debris'] },
  { id: 'survival_pack_shovel', category: 'prop', subcategory: 'tool', zones: ['safe_zone', 'barricade'], style: 'zombie', placement: 'ground', footprint: [0.3, 0.3], height: 1.2, snap: 'ground', variantGroup: null, maxPerChunk: 2, tags: ['shovel', 'tool', 'survival'] },
  { id: 'tent_00', category: 'building', subcategory: 'shelter', zones: ['safe_zone', 'evac_point'], style: 'zombie', placement: 'on_lot', footprint: [4, 3], height: 2.0, snap: 'ground', variantGroup: 'tent', maxPerChunk: 3, tags: ['tent', 'camp', 'shelter'] },
  { id: 'tent_01', category: 'building', subcategory: 'shelter', zones: ['safe_zone', 'evac_point'], style: 'zombie', placement: 'on_lot', footprint: [4, 3], height: 2.0, snap: 'ground', variantGroup: 'tent', maxPerChunk: 3, tags: ['tent', 'camp', 'shelter'] },
  { id: 'tent_02', category: 'building', subcategory: 'shelter', zones: ['safe_zone'], style: 'zombie', placement: 'on_lot', footprint: [4, 4], height: 2.5, snap: 'ground', variantGroup: 'tent', maxPerChunk: 3, tags: ['tent', 'camp', 'shelter'] },

  // ZOMBIE — Zombie roads (reuse modern with zombie style)
  { id: 'street_pack_street_straight', category: 'road', subcategory: 'straight', zones: ['any'], style: 'zombie', placement: 'ground', footprint: [10, 10], height: 0.1, snap: 'ground', variantGroup: 'zombie_road', maxPerChunk: 0, tags: ['road', 'cracked', 'damaged'] },
  { id: 'street_pack_street_4way', category: 'road', subcategory: '4way', zones: ['any'], style: 'zombie', placement: 'ground', footprint: [10, 10], height: 0.1, snap: 'ground', variantGroup: 'zombie_intersection', maxPerChunk: 0, tags: ['road', 'intersection', 'damaged'] },

  // ZOMBIE — Vehicles (abandoned)
  { id: 'kenney_cars/sedan', category: 'vehicle', subcategory: 'abandoned_car', zones: ['ruin', 'barricade'], style: 'zombie', placement: 'on_road', footprint: [2, 4.5], height: 1.5, snap: 'road_surface', variantGroup: 'abandoned_car', maxPerChunk: 4, tags: ['car', 'abandoned', 'wreck'] },
  { id: 'kenney_cars/van', category: 'vehicle', subcategory: 'abandoned_van', zones: ['ruin', 'barricade'], style: 'zombie', placement: 'on_road', footprint: [2.2, 5.5], height: 2.2, snap: 'road_surface', variantGroup: 'abandoned_van', maxPerChunk: 2, tags: ['van', 'abandoned', 'wreck'] },
  { id: 'kenney_cars/truck', category: 'vehicle', subcategory: 'abandoned_truck', zones: ['ruin', 'barricade'], style: 'zombie', placement: 'on_road', footprint: [2.5, 6], height: 3.0, snap: 'road_surface', variantGroup: 'abandoned_truck', maxPerChunk: 2, tags: ['truck', 'abandoned', 'blockade'] },
  { id: 'kenney_cars/ambulance', category: 'vehicle', subcategory: 'abandoned_emergency', zones: ['ruin', 'safe_zone'], style: 'zombie', placement: 'on_road', footprint: [2.2, 5.5], height: 2.5, snap: 'road_surface', variantGroup: 'abandoned_emergency', maxPerChunk: 1, tags: ['ambulance', 'abandoned', 'emergency'] },

  // ZOMBIE — Characters
  { id: 'kenney_graveyard/character-zombie', category: 'character', subcategory: 'zombie', zones: ['ruin', 'barricade'], style: 'zombie', placement: 'sidewalk', footprint: [0.5, 0.5], height: 1.7, snap: 'ground', variantGroup: 'zombie_npc', maxPerChunk: 4, tags: ['zombie', 'undead', 'enemy'] },
  { id: 'avatar', category: 'character', subcategory: 'survivor', zones: ['safe_zone', 'evac_point'], style: 'zombie', placement: 'sidewalk', footprint: [0.5, 0.5], height: 1.8, snap: 'ground', variantGroup: 'survivor', maxPerChunk: 4, tags: ['survivor', 'human', 'civilian'] },

  // ZOMBIE — Traffic control (barricades)
  { id: 'ph_concrete_road_barrier', category: 'traffic_control', subcategory: 'barricade', zones: ['barricade', 'safe_zone'], style: 'zombie', placement: 'intersection', footprint: [2.0, 0.5], height: 0.8, snap: 'road_edge', variantGroup: 'zombie_barricade', maxPerChunk: 8, tags: ['barrier', 'barricade', 'defense'] },

  // =========================================================================
  // SPACE TEMPLATE — Buildings / base structures
  // =========================================================================
  { id: 'ultimate_space_pack_base_large-transformed', category: 'building', subcategory: 'base', zones: ['command', 'lab'], style: 'space', placement: 'on_lot', footprint: [14, 14], height: 8, snap: 'lot_boundary', variantGroup: 'space_base', maxPerChunk: 1, tags: ['base', 'command', 'large'] },
  { id: 'ultimate_space_pack_building_l-transformed', category: 'building', subcategory: 'lab', zones: ['lab', 'command'], style: 'space', placement: 'on_lot', footprint: [12, 10], height: 6, snap: 'lot_boundary', variantGroup: 'space_building', maxPerChunk: 2, tags: ['building', 'lab', 'l-shape'] },
  { id: 'ultimate_space_pack_house_cylinder-transformed', category: 'building', subcategory: 'habitat', zones: ['quarters', 'lab'], style: 'space', placement: 'on_lot', footprint: [8, 8], height: 5, snap: 'lot_boundary', variantGroup: 'space_habitat', maxPerChunk: 4, tags: ['habitat', 'cylinder', 'quarters'] },
  { id: 'ultimate_space_pack_house_long-transformed', category: 'building', subcategory: 'habitat', zones: ['quarters'], style: 'space', placement: 'on_lot', footprint: [6, 12], height: 5, snap: 'lot_boundary', variantGroup: 'space_habitat', maxPerChunk: 4, tags: ['habitat', 'long', 'quarters'] },
  { id: 'ultimate_space_pack_house_open-transformed', category: 'building', subcategory: 'habitat', zones: ['quarters', 'lab'], style: 'space', placement: 'on_lot', footprint: [8, 8], height: 5, snap: 'lot_boundary', variantGroup: 'space_habitat', maxPerChunk: 3, tags: ['habitat', 'open', 'quarters'] },
  { id: 'ultimate_space_pack_house_openback-transformed', category: 'building', subcategory: 'habitat', zones: ['quarters'], style: 'space', placement: 'on_lot', footprint: [8, 8], height: 5, snap: 'lot_boundary', variantGroup: 'space_habitat', maxPerChunk: 3, tags: ['habitat', 'openback'] },
  { id: 'ultimate_space_pack_house_single-transformed', category: 'building', subcategory: 'habitat', zones: ['quarters'], style: 'space', placement: 'on_lot', footprint: [6, 6], height: 4, snap: 'lot_boundary', variantGroup: 'space_habitat', maxPerChunk: 6, tags: ['habitat', 'single', 'small'] },
  { id: 'ultimate_space_pack_house_single_support-transformed', category: 'building', subcategory: 'habitat', zones: ['quarters', 'lab'], style: 'space', placement: 'on_lot', footprint: [6, 6], height: 5, snap: 'lot_boundary', variantGroup: 'space_habitat', maxPerChunk: 5, tags: ['habitat', 'support', 'elevated'] },
  { id: 'ultimate_space_pack_geodesicdome-transformed', category: 'building', subcategory: 'dome', zones: ['command', 'lab'], style: 'space', placement: 'on_lot', footprint: [10, 10], height: 8, snap: 'lot_boundary', variantGroup: 'space_dome', maxPerChunk: 2, tags: ['dome', 'geodesic', 'shelter'] },

  // SPACE — Hangar buildings
  { id: 'ultimate_space_pack_ramp-transformed', category: 'building', subcategory: 'ramp', zones: ['hangar'], style: 'space', placement: 'on_lot', footprint: [6, 10], height: 3, snap: 'lot_boundary', variantGroup: 'space_ramp', maxPerChunk: 2, tags: ['ramp', 'landing', 'hangar'] },

  // SPACE — Connector / road pieces
  { id: 'ultimate_space_pack_connector-transformed', category: 'road', subcategory: 'connector', zones: ['any'], style: 'space', placement: 'ground', footprint: [10, 10], height: 0.5, snap: 'ground', variantGroup: 'space_connector', maxPerChunk: 0, tags: ['connector', 'corridor', 'path'] },

  // SPACE — Street furniture / structures
  { id: 'ultimate_space_pack_solarpanel_ground-transformed', category: 'street_furniture', subcategory: 'solar', zones: ['any'], style: 'space', placement: 'ground', footprint: [4, 4], height: 3, snap: 'ground', variantGroup: 'solar_panel', maxPerChunk: 4, tags: ['solar', 'energy', 'panel'] },
  { id: 'ultimate_space_pack_solarpanel_structure-transformed', category: 'street_furniture', subcategory: 'solar', zones: ['any'], style: 'space', placement: 'ground', footprint: [3, 3], height: 4, snap: 'ground', variantGroup: 'solar_panel', maxPerChunk: 4, tags: ['solar', 'energy', 'tall'] },
  { id: 'ultimate_space_pack_solarpanel_roof-transformed', category: 'street_furniture', subcategory: 'solar', zones: ['quarters', 'lab'], style: 'space', placement: 'ground', footprint: [3, 3], height: 2.5, snap: 'ground', variantGroup: 'solar_panel', maxPerChunk: 4, tags: ['solar', 'roof', 'compact'] },
  { id: 'ultimate_space_pack_metalsupport-transformed', category: 'street_furniture', subcategory: 'support', zones: ['any'], style: 'space', placement: 'ground', footprint: [1, 1], height: 4, snap: 'ground', variantGroup: 'metal_support', maxPerChunk: 8, tags: ['support', 'metal', 'structure'] },
  { id: 'ultimate_space_pack_roof_antenna-transformed', category: 'street_furniture', subcategory: 'antenna', zones: ['command', 'lab'], style: 'space', placement: 'ground', footprint: [1, 1], height: 6, snap: 'ground', variantGroup: 'space_antenna', maxPerChunk: 3, tags: ['antenna', 'communication', 'tall'] },
  { id: 'ultimate_space_pack_roof_radar-transformed', category: 'street_furniture', subcategory: 'radar', zones: ['command'], style: 'space', placement: 'ground', footprint: [2, 2], height: 5, snap: 'ground', variantGroup: 'space_radar', maxPerChunk: 2, tags: ['radar', 'detection', 'communication'] },
  { id: 'ultimate_space_pack_roof_ventl-transformed', category: 'street_furniture', subcategory: 'vent', zones: ['any'], style: 'space', placement: 'ground', footprint: [1, 1], height: 1.5, snap: 'ground', variantGroup: 'space_vent', maxPerChunk: 6, tags: ['vent', 'air', 'cooling'] },
  { id: 'ultimate_space_pack_roof_ventr-transformed', category: 'street_furniture', subcategory: 'vent', zones: ['any'], style: 'space', placement: 'ground', footprint: [1, 1], height: 1.5, snap: 'ground', variantGroup: 'space_vent', maxPerChunk: 6, tags: ['vent', 'air', 'intake'] },

  // SPACE — Pickups / props
  { id: 'ultimate_space_pack_pickup_crate-transformed', category: 'prop', subcategory: 'crate', zones: ['hangar', 'lab'], style: 'space', placement: 'ground', footprint: [1, 1], height: 1, snap: 'ground', variantGroup: 'space_pickup', maxPerChunk: 4, tags: ['crate', 'supplies', 'pickup'] },
  { id: 'ultimate_space_pack_pickup_health-transformed', category: 'prop', subcategory: 'medical', zones: ['quarters', 'command'], style: 'space', placement: 'ground', footprint: [0.5, 0.5], height: 0.5, snap: 'ground', variantGroup: 'space_pickup', maxPerChunk: 2, tags: ['health', 'medical', 'pickup'] },
  { id: 'ultimate_space_pack_pickup_jar-transformed', category: 'prop', subcategory: 'jar', zones: ['lab'], style: 'space', placement: 'ground', footprint: [0.4, 0.4], height: 0.5, snap: 'ground', variantGroup: 'space_pickup', maxPerChunk: 3, tags: ['jar', 'specimen', 'lab'] },
  { id: 'ultimate_space_pack_pickup_keycard-transformed', category: 'prop', subcategory: 'keycard', zones: ['command', 'lab'], style: 'space', placement: 'ground', footprint: [0.2, 0.1], height: 0.05, snap: 'ground', variantGroup: 'space_pickup', maxPerChunk: 1, tags: ['keycard', 'access', 'security'] },
  { id: 'ultimate_space_pack_pickup_sphere-transformed', category: 'prop', subcategory: 'sphere', zones: ['lab', 'command'], style: 'space', placement: 'ground', footprint: [0.5, 0.5], height: 0.5, snap: 'ground', variantGroup: 'space_pickup', maxPerChunk: 2, tags: ['sphere', 'energy', 'artifact'] },

  // SPACE — Vehicles (rovers + spaceships)
  { id: 'ultimate_space_pack_rover_1-transformed', category: 'vehicle', subcategory: 'rover', zones: ['any'], style: 'space', placement: 'on_road', footprint: [3, 4], height: 2.0, snap: 'ground', variantGroup: 'space_rover', maxPerChunk: 2, tags: ['rover', 'vehicle', 'exploration'] },
  { id: 'ultimate_space_pack_rover_round-transformed', category: 'vehicle', subcategory: 'rover', zones: ['any'], style: 'space', placement: 'on_road', footprint: [3, 3], height: 2.0, snap: 'ground', variantGroup: 'space_rover', maxPerChunk: 2, tags: ['rover', 'vehicle', 'round'] },
  { id: 'ultimate_space_pack_rover_2-transformed', category: 'vehicle', subcategory: 'rover', zones: ['any'], style: 'space', placement: 'on_road', footprint: [3, 5], height: 2.5, snap: 'ground', variantGroup: 'space_rover', maxPerChunk: 2, tags: ['rover', 'vehicle', 'heavy'] },
  { id: 'spaceship_00', category: 'vehicle', subcategory: 'spaceship', zones: ['hangar'], style: 'space', placement: 'ground', footprint: [6, 8], height: 4, snap: 'ground', variantGroup: 'spaceship', maxPerChunk: 1, tags: ['spaceship', 'ship', 'hangar'] },
  { id: 'spaceship_01', category: 'vehicle', subcategory: 'spaceship', zones: ['hangar'], style: 'space', placement: 'ground', footprint: [6, 8], height: 4, snap: 'ground', variantGroup: 'spaceship', maxPerChunk: 1, tags: ['spaceship', 'ship', 'hangar'] },
  { id: 'spaceship_02', category: 'vehicle', subcategory: 'spaceship', zones: ['hangar'], style: 'space', placement: 'ground', footprint: [8, 10], height: 5, snap: 'ground', variantGroup: 'spaceship', maxPerChunk: 1, tags: ['spaceship', 'ship', 'large'] },
  { id: 'spaceships_pack_dispatcher', category: 'vehicle', subcategory: 'spaceship', zones: ['hangar', 'command'], style: 'space', placement: 'ground', footprint: [5, 7], height: 3.5, snap: 'ground', variantGroup: 'spaceship_pack', maxPerChunk: 1, tags: ['spaceship', 'dispatcher', 'fast'] },
  { id: 'spaceships_pack_bob', category: 'vehicle', subcategory: 'spaceship', zones: ['hangar'], style: 'space', placement: 'ground', footprint: [5, 7], height: 3, snap: 'ground', variantGroup: 'spaceship_pack', maxPerChunk: 1, tags: ['spaceship', 'cargo'] },
  { id: 'spaceships_pack_insurgent', category: 'vehicle', subcategory: 'spaceship', zones: ['hangar'], style: 'space', placement: 'ground', footprint: [6, 8], height: 3.5, snap: 'ground', variantGroup: 'spaceship_pack', maxPerChunk: 1, tags: ['spaceship', 'fighter'] },
  { id: 'spaceships_pack_striker', category: 'vehicle', subcategory: 'spaceship', zones: ['hangar'], style: 'space', placement: 'ground', footprint: [5, 6], height: 3, snap: 'ground', variantGroup: 'spaceship_pack', maxPerChunk: 1, tags: ['spaceship', 'fighter', 'agile'] },

  // SPACE — Vegetation (alien plants)
  { id: 'ultimate_space_pack_plant_1-transformed', category: 'vegetation', subcategory: 'alien_plant', zones: ['any'], style: 'space', placement: 'ground', footprint: [1, 1], height: 1.5, snap: 'ground', variantGroup: 'alien_plant', maxPerChunk: 8, tags: ['plant', 'alien', 'exotic'] },
  { id: 'ultimate_space_pack_plant_2-transformed', category: 'vegetation', subcategory: 'alien_plant', zones: ['any'], style: 'space', placement: 'ground', footprint: [1, 1], height: 1.0, snap: 'ground', variantGroup: 'alien_plant', maxPerChunk: 8, tags: ['plant', 'alien', 'exotic'] },
  { id: 'ultimate_space_pack_plant_3-transformed', category: 'vegetation', subcategory: 'alien_plant', zones: ['any'], style: 'space', placement: 'ground', footprint: [1.5, 1.5], height: 2.0, snap: 'ground', variantGroup: 'alien_plant', maxPerChunk: 8, tags: ['plant', 'alien', 'tall'] },
  { id: 'ultimate_space_pack_tree_blob_1-transformed', category: 'vegetation', subcategory: 'alien_tree', zones: ['quarters', 'lab'], style: 'space', placement: 'ground', footprint: [3, 3], height: 5, snap: 'ground', variantGroup: 'alien_tree', maxPerChunk: 4, tags: ['tree', 'alien', 'blob'] },
  { id: 'ultimate_space_pack_tree_blob_2-transformed', category: 'vegetation', subcategory: 'alien_tree', zones: ['quarters', 'lab'], style: 'space', placement: 'ground', footprint: [3, 3], height: 6, snap: 'ground', variantGroup: 'alien_tree', maxPerChunk: 4, tags: ['tree', 'alien', 'blob'] },
  { id: 'ultimate_space_pack_tree_blob_3-transformed', category: 'vegetation', subcategory: 'alien_tree', zones: ['quarters'], style: 'space', placement: 'ground', footprint: [4, 4], height: 7, snap: 'ground', variantGroup: 'alien_tree', maxPerChunk: 3, tags: ['tree', 'alien', 'blob', 'large'] },
  { id: 'ultimate_space_pack_tree_floating_1-transformed', category: 'vegetation', subcategory: 'alien_tree', zones: ['any'], style: 'space', placement: 'ground', footprint: [2, 2], height: 4, snap: 'ground', variantGroup: 'alien_tree_float', maxPerChunk: 4, tags: ['tree', 'alien', 'floating'] },
  { id: 'ultimate_space_pack_tree_floating_2-transformed', category: 'vegetation', subcategory: 'alien_tree', zones: ['any'], style: 'space', placement: 'ground', footprint: [2, 2], height: 5, snap: 'ground', variantGroup: 'alien_tree_float', maxPerChunk: 4, tags: ['tree', 'alien', 'floating'] },
  { id: 'ultimate_space_pack_tree_floating_3-transformed', category: 'vegetation', subcategory: 'alien_tree', zones: ['any'], style: 'space', placement: 'ground', footprint: [3, 3], height: 6, snap: 'ground', variantGroup: 'alien_tree_float', maxPerChunk: 3, tags: ['tree', 'alien', 'floating'] },
  { id: 'ultimate_space_pack_tree_spiral_1-transformed', category: 'vegetation', subcategory: 'alien_tree', zones: ['any'], style: 'space', placement: 'ground', footprint: [2, 2], height: 5, snap: 'ground', variantGroup: 'alien_tree_spiral', maxPerChunk: 4, tags: ['tree', 'alien', 'spiral'] },
  { id: 'ultimate_space_pack_tree_spiral_2-transformed', category: 'vegetation', subcategory: 'alien_tree', zones: ['any'], style: 'space', placement: 'ground', footprint: [2, 2], height: 6, snap: 'ground', variantGroup: 'alien_tree_spiral', maxPerChunk: 4, tags: ['tree', 'alien', 'spiral'] },
  { id: 'ultimate_space_pack_tree_spiral_3-transformed', category: 'vegetation', subcategory: 'alien_tree', zones: ['any'], style: 'space', placement: 'ground', footprint: [3, 3], height: 7, snap: 'ground', variantGroup: 'alien_tree_spiral', maxPerChunk: 3, tags: ['tree', 'alien', 'spiral', 'large'] },
  { id: 'ultimate_space_pack_tree_swirl_1-transformed', category: 'vegetation', subcategory: 'alien_tree', zones: ['quarters'], style: 'space', placement: 'ground', footprint: [2, 2], height: 4, snap: 'ground', variantGroup: 'alien_tree_swirl', maxPerChunk: 4, tags: ['tree', 'alien', 'swirl'] },
  { id: 'ultimate_space_pack_tree_swirl_2-transformed', category: 'vegetation', subcategory: 'alien_tree', zones: ['quarters', 'lab'], style: 'space', placement: 'ground', footprint: [3, 3], height: 5, snap: 'ground', variantGroup: 'alien_tree_swirl', maxPerChunk: 3, tags: ['tree', 'alien', 'swirl'] },
  { id: 'ultimate_space_pack_bush_1-transformed', category: 'vegetation', subcategory: 'alien_bush', zones: ['any'], style: 'space', placement: 'ground', footprint: [1.5, 1.5], height: 1.0, snap: 'ground', variantGroup: 'alien_bush', maxPerChunk: 10, tags: ['bush', 'alien', 'low'] },
  { id: 'ultimate_space_pack_bush_2-transformed', category: 'vegetation', subcategory: 'alien_bush', zones: ['any'], style: 'space', placement: 'ground', footprint: [1.5, 1.5], height: 1.2, snap: 'ground', variantGroup: 'alien_bush', maxPerChunk: 10, tags: ['bush', 'alien', 'low'] },
  { id: 'ultimate_space_pack_bush_3-transformed', category: 'vegetation', subcategory: 'alien_bush', zones: ['any'], style: 'space', placement: 'ground', footprint: [2, 2], height: 1.5, snap: 'ground', variantGroup: 'alien_bush', maxPerChunk: 8, tags: ['bush', 'alien', 'medium'] },
  { id: 'ultimate_space_pack_grass_1-transformed', category: 'vegetation', subcategory: 'alien_grass', zones: ['any'], style: 'space', placement: 'ground', footprint: [1, 1], height: 0.5, snap: 'ground', variantGroup: 'alien_grass', maxPerChunk: 12, tags: ['grass', 'alien', 'ground'] },
  { id: 'ultimate_space_pack_grass_2-transformed', category: 'vegetation', subcategory: 'alien_grass', zones: ['any'], style: 'space', placement: 'ground', footprint: [1, 1], height: 0.5, snap: 'ground', variantGroup: 'alien_grass', maxPerChunk: 12, tags: ['grass', 'alien', 'ground'] },
  { id: 'ultimate_space_pack_grass_3-transformed', category: 'vegetation', subcategory: 'alien_grass', zones: ['any'], style: 'space', placement: 'ground', footprint: [1.5, 1.5], height: 0.8, snap: 'ground', variantGroup: 'alien_grass', maxPerChunk: 10, tags: ['grass', 'alien', 'tall'] },
  { id: 'ultimate_space_pack_rock_2-transformed', category: 'vegetation', subcategory: 'rock', zones: ['any'], style: 'space', placement: 'ground', footprint: [2, 2], height: 1.5, snap: 'ground', variantGroup: 'space_rock', maxPerChunk: 6, tags: ['rock', 'terrain', 'alien'] },
  { id: 'ultimate_space_pack_rock_3-transformed', category: 'vegetation', subcategory: 'rock', zones: ['any'], style: 'space', placement: 'ground', footprint: [1.5, 1.5], height: 1.0, snap: 'ground', variantGroup: 'space_rock', maxPerChunk: 6, tags: ['rock', 'terrain'] },
  { id: 'ultimate_space_pack_rock_4-transformed', category: 'vegetation', subcategory: 'rock', zones: ['any'], style: 'space', placement: 'ground', footprint: [1, 1], height: 0.8, snap: 'ground', variantGroup: 'space_rock', maxPerChunk: 8, tags: ['rock', 'small'] },
  { id: 'ultimate_space_pack_rock_large_1-transformed', category: 'vegetation', subcategory: 'rock', zones: ['any'], style: 'space', placement: 'ground', footprint: [4, 4], height: 3, snap: 'ground', variantGroup: 'space_rock_large', maxPerChunk: 3, tags: ['rock', 'large', 'terrain'] },
  { id: 'ultimate_space_pack_rock_large_2-transformed', category: 'vegetation', subcategory: 'rock', zones: ['any'], style: 'space', placement: 'ground', footprint: [4, 4], height: 3.5, snap: 'ground', variantGroup: 'space_rock_large', maxPerChunk: 3, tags: ['rock', 'large'] },

  // SPACE — Characters
  { id: 'ultimate_space_pack_astronaut_finnthefrog-transformed', category: 'character', subcategory: 'astronaut', zones: ['any'], style: 'space', placement: 'sidewalk', footprint: [0.5, 0.5], height: 1.8, snap: 'ground', variantGroup: 'astronaut', maxPerChunk: 4, tags: ['astronaut', 'crew', 'green'] },
  { id: 'ultimate_space_pack_astronaut_fernandotheflamingo-transformed', category: 'character', subcategory: 'astronaut', zones: ['any'], style: 'space', placement: 'sidewalk', footprint: [0.5, 0.5], height: 1.8, snap: 'ground', variantGroup: 'astronaut', maxPerChunk: 4, tags: ['astronaut', 'crew', 'pink'] },
  { id: 'ultimate_space_pack_astronaut_barbarathebee-transformed', category: 'character', subcategory: 'astronaut', zones: ['any'], style: 'space', placement: 'sidewalk', footprint: [0.5, 0.5], height: 1.8, snap: 'ground', variantGroup: 'astronaut', maxPerChunk: 4, tags: ['astronaut', 'crew', 'yellow'] },
  { id: 'ultimate_space_pack_astronaut_raetheredpanda-transformed', category: 'character', subcategory: 'astronaut', zones: ['any'], style: 'space', placement: 'sidewalk', footprint: [0.5, 0.5], height: 1.8, snap: 'ground', variantGroup: 'astronaut', maxPerChunk: 4, tags: ['astronaut', 'crew', 'red'] },
  { id: 'ultimate_space_pack_enemy_extrasmall-transformed', category: 'character', subcategory: 'alien_enemy', zones: ['any'], style: 'space', placement: 'ground', footprint: [0.5, 0.5], height: 0.8, snap: 'ground', variantGroup: 'space_enemy', maxPerChunk: 4, tags: ['enemy', 'alien', 'small'] },
  { id: 'ultimate_space_pack_enemy_small-transformed', category: 'character', subcategory: 'alien_enemy', zones: ['any'], style: 'space', placement: 'ground', footprint: [0.6, 0.6], height: 1.2, snap: 'ground', variantGroup: 'space_enemy', maxPerChunk: 3, tags: ['enemy', 'alien', 'medium'] },
  { id: 'ultimate_space_pack_enemy_large-transformed', category: 'character', subcategory: 'alien_enemy', zones: ['any'], style: 'space', placement: 'ground', footprint: [1, 1], height: 2.5, snap: 'ground', variantGroup: 'space_enemy', maxPerChunk: 1, tags: ['enemy', 'alien', 'large', 'boss'] },
  { id: 'ultimate_space_pack_enemy_flying-transformed', category: 'character', subcategory: 'alien_enemy', zones: ['any'], style: 'space', placement: 'ground', footprint: [1, 1], height: 2.0, snap: 'ground', variantGroup: 'space_enemy', maxPerChunk: 2, tags: ['enemy', 'alien', 'flying'] },

  // SPACE — Traffic control (none per se, but use antenna markers)
  { id: 'ultimate_space_pack_roof_opening-transformed', category: 'traffic_control', subcategory: 'marker', zones: ['any'], style: 'space', placement: 'intersection', footprint: [2, 2], height: 1, snap: 'ground', variantGroup: 'space_marker', maxPerChunk: 4, tags: ['opening', 'hatch', 'marker'] },
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
