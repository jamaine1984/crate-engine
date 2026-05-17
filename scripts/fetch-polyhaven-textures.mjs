import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const modelRoot = process.env.CRATE_MODELS_DIR || path.resolve(process.cwd(), 'models');
const textureRoot = path.join(modelRoot, 'textures');

const textureFamilies = {
  modular_street_seating: [
    'modular_street_seating_armrests_diff_1k.jpg',
    'modular_street_seating_armrests_arm_1k.jpg',
    'modular_street_seating_armrests_nor_gl_1k.jpg',
    'modular_street_seating_supports_diff_1k.jpg',
    'modular_street_seating_supports_arm_1k.jpg',
    'modular_street_seating_supports_nor_gl_1k.jpg',
    'modular_street_seating_timber_diff_1k.jpg',
    'modular_street_seating_timber_arm_1k.jpg',
    'modular_street_seating_timber_nor_gl_1k.jpg',
    'modular_street_seating_connectors_diff_1k.jpg',
    'modular_street_seating_connectors_arm_1k.jpg',
    'modular_street_seating_connectors_nor_gl_1k.jpg',
  ],
  modular_electricity_poles: [
    'modular_electricity_poles_pieces_diff_1k.jpg',
    'modular_electricity_poles_pieces_arm_1k.jpg',
    'modular_electricity_poles_pieces_nor_gl_1k.jpg',
    'modular_electricity_poles_diff_1k.jpg',
    'modular_electricity_poles_arm_1k.jpg',
    'modular_electricity_poles_nor_gl_1k.jpg',
  ],
};

async function downloadTexture(family, file) {
  const url = `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/${family}/${file}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const outPath = path.join(textureRoot, file);
  await writeFile(outPath, bytes);
  console.log(`saved ${path.relative(modelRoot, outPath)} (${bytes.length} bytes)`);
}

await mkdir(textureRoot, { recursive: true });

for (const [family, files] of Object.entries(textureFamilies)) {
  for (const file of files) {
    await downloadTexture(family, file);
  }
}

console.log(`Poly Haven textures ready in ${textureRoot}`);
