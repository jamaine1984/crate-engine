import { cp, mkdir, rm, symlink, lstat } from 'node:fs/promises';
import path from 'node:path';

const rootDir = '/Users/jamainemartin/Desktop/crate-engine';
const distDir = path.join(rootDir, 'dist');
const deployDir = path.join(rootDir, '.deploy');
const modelsTarget = '/Users/jamainemartin/.openclaw/workspace/crate-engine/web/models';

await rm(deployDir, { recursive: true, force: true });
await mkdir(deployDir, { recursive: true });
await cp(distDir, deployDir, { recursive: true, force: true });

try {
  await lstat(modelsTarget);
  await symlink(modelsTarget, path.join(deployDir, 'models'));
  console.log(`Linked models -> ${modelsTarget}`);
} catch {
  console.warn(`Models directory not found at ${modelsTarget}`);
}

console.log(`Prepared deploy directory at ${deployDir}`);
