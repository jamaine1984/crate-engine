// Re-encodes starter-library/surfaces JPGs (mozjpeg q78 colour, q85 normal) so phones download less.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const root = path.resolve(process.cwd(), 'starter-library', 'surfaces');
for (const surface of await readdir(root, { withFileTypes: true })) {
  if (!surface.isDirectory()) continue;
  for (const file of ['color.jpg', 'normal.jpg', 'arm.jpg']) {
    const target = path.join(root, surface.name, file), input = await readFile(target);
    const output = await sharp(input).jpeg({ quality: file === 'normal.jpg' ? 85 : 78, mozjpeg: true }).toBuffer();
    if (output.length < input.length * .95) await writeFile(target, output);
  }
}
