const KNOWN_UNAVAILABLE_MODELS = [
  {
    id: 'ph_outdoor_table_chair_set_01',
    refs: [
      'ph_outdoor_table_chair_set_01',
      'outdoor_table_chair_set_01',
      'outdoor table chair set 01',
      'Outdoor Table Chair Set 01',
    ],
    reason: 'This glTF references outdoor_table_chair_set_01.bin and textures that are not present on the production asset host.',
  },
  {
    id: 'ph_namaqualand_rocks_01',
    refs: [
      'ph_namaqualand_rocks_01',
      'namaqualand_rocks_01',
      'namaqualand rocks 01',
      'Namaqualand Rocks 01',
    ],
    reason: 'This glTF references namaqualand_rocks_01.bin and textures that are not present on the production asset host.',
  },
  {
    id: 'ph_namaqualand_stones_01',
    refs: [
      'ph_namaqualand_stones_01',
      'namaqualand_stones_01',
      'namaqualand stones 01',
      'Namaqualand Stones 01',
    ],
    reason: 'This glTF references namaqualand_stones_01.bin and textures that are not present on the production asset host.',
  },
  {
    id: 'ph_moon_rock_01',
    refs: [
      'ph_moon_rock_01',
      'moon_rock_01',
      'moon rock 01',
      'Moon Rock 01',
    ],
    reason: 'This glTF references moon_rock_01.bin and textures that are not present on the production asset host.',
  },
  {
    id: 'ph_food_pears_asian_01',
    refs: [
      'ph_food_pears_asian_01',
      'food_pears_asian_01',
      'food pears asian 01',
      'Food Pears Asian 01',
    ],
    reason: 'This glTF references food_pears_asian_01.bin and textures that are not present on the production asset host.',
  },
];

function normalizeModelRef(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw
    .replace(/\\/g, '/')
    .replace(/^(?:https?:\/\/[^/]+)?\/?models\//i, '')
    .replace(/\.(?:glb|gltf)$/i, '')
    .replace(/^\/+/, '')
    .toLowerCase();
}

function expandRef(value) {
  const normalized = normalizeModelRef(value);
  if (!normalized) return [];
  return [
    normalized,
    normalized.replace(/[-_\s]+/g, ' '),
    normalized.replace(/[-\s]+/g, '_'),
  ];
}

const KNOWN_UNAVAILABLE_REF_SET = new Set(
  KNOWN_UNAVAILABLE_MODELS.flatMap((entry) => [entry.id, ...(entry.refs || [])].flatMap(expandRef))
);

export function isKnownUnavailableModelRef(value) {
  return expandRef(value).some((ref) => KNOWN_UNAVAILABLE_REF_SET.has(ref));
}

export function isKnownUnavailableModelEntry(key, info = {}) {
  return [key, info?.name, info?.path, info?.file].some(isKnownUnavailableModelRef);
}

export function getKnownUnavailableModelReason(value) {
  if (!String(value || '').trim()) return '';
  const match = KNOWN_UNAVAILABLE_MODELS.find((entry) => [entry.id, ...(entry.refs || [])].some((ref) => {
    const expanded = expandRef(ref);
    return expandRef(value).some((candidate) => expanded.includes(candidate));
  }));
  return match?.reason || '';
}
