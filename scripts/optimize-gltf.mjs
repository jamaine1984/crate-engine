import { access } from 'node:fs/promises';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
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
await access(inputPath);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = io.read(inputPath);

await doc.transform(
  dedup(),
  instance(),
  prune(),
  weld(),
  reorder(),
  flatten(),
  join(),
  resample()
);

io.write(outputPath, doc);
console.log(`Optimized ${inputPath} -> ${outputPath}`);
