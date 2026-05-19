import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const ignoredDirs = new Set([
  '.deploy',
  '.deploy-assets',
  '.git',
  '.wrangler',
  'crate-engine',
  'dist',
  'node_modules',
]);

async function collectSyntaxFiles(dir = rootDir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(rootDir, fullPath).split(path.sep).join('/');

    if (entry.isDirectory()) {
      await collectSyntaxFiles(fullPath, files);
      continue;
    }

    const shouldCheck =
      entry.isFile() &&
      (
        entry.name.endsWith('.mjs') ||
        relPath === 'service-worker.js' ||
        (relPath.startsWith('functions/') && entry.name.endsWith('.js')) ||
        (relPath.startsWith('worker/') && entry.name.endsWith('.js'))
      );

    if (shouldCheck) files.push(relPath);
  }
  return files;
}

const files = (await collectSyntaxFiles()).sort();

let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: rootDir, stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}

if (failed) process.exit(1);
console.log(`Checked ${files.length} files.`);
