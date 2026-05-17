import { cp, mkdir, rm, symlink, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(process.env.CRATE_ENGINE_ROOT || path.join(scriptDir, '..'));
const distDir = path.join(rootDir, 'dist');
const deployDir = path.resolve(process.env.CRATE_DEPLOY_DIR || path.join(rootDir, '.deploy'));
const modelsTarget = path.resolve(process.env.CRATE_MODELS_DIR || path.join(rootDir, 'models'));

await rm(deployDir, { recursive: true, force: true });
await mkdir(deployDir, { recursive: true });
await cp(distDir, deployDir, { recursive: true, force: true });

try {
  const modelsStat = await lstat(modelsTarget);
  if (!modelsStat.isDirectory() && !modelsStat.isSymbolicLink()) {
    throw new Error('models path is not a directory or symlink');
  }
  await symlink(modelsTarget, path.join(deployDir, 'models'), process.platform === 'win32' ? 'junction' : 'dir');
  console.log(`Linked models -> ${modelsTarget}`);
} catch (err) {
  console.warn(`Models directory unavailable at ${modelsTarget}: ${err.message}`);
}

console.log(`Prepared deploy directory at ${deployDir}`);
