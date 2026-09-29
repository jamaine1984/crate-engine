// Compress Blender-exported GLBs for the editor: dedup, prune, JPEG textures (1024), meshopt.
// Usage: node scripts/optimize-kit-glb.mjs <srcDir> <outDir> [name ...]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { readdirSync, statSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const [src, out, ...only] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
for (const file of readdirSync(src).filter(f => f.endsWith('.glb') && (!only.length || only.includes(f.slice(0, -4))))) {
  const doc = await io.read(join(src, file));
  await doc.transform(dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [1024, 1024], quality: 86 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(join(out, file), doc);
  console.log(file, (statSync(join(out, file)).size / 1e6).toFixed(2), 'MB');
}
