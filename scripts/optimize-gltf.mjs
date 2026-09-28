import { access } from 'node:fs/promises';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import {
  dedup,
  flatten,
  instance,
  join,
  prune,
  reorder,
  resample,
  weld
} from '@gltf-transform/functions';

const [, , inputArg, outputArg] = process.argv;
if (!inputArg || !outputArg) {
  console.error('Usage: npm run optimize:gltf -- <input.glb> <output.glb>');
  process.exit(1);
}

const inputPath = path.resolve(inputArg);
const outputPath = path.resolve(outputArg);
if(inputPath===outputPath)throw new Error('Choose a different output path to preserve the original model.');
await access(inputPath);
try{await access(outputPath);throw new Error('Output already exists. Choose a new output filename.');}catch(error){if(error.code!=='ENOENT')throw error;}

await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const doc = await io.read(inputPath);

await doc.transform(
  dedup(),
  instance(),
  prune(),
  weld(),
  reorder({encoder:MeshoptEncoder}),
  flatten(),
  join(),
  resample()
);

await io.write(outputPath, doc);
console.log(`Optimized ${inputPath} -> ${outputPath}`);
