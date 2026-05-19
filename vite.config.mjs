import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const staticFiles = [
  '_headers',
  '_routes.json',
  '404.html',
  'asset-catalog.json',
  'city_assets.json',
  'favicon.svg',
  'model-catalog.json',
  'model-aliases.json',
  'model_catalog.json',
  'og-image.svg',
  'service-worker.js'
];
const staticDirs = [
  'docs'
];

function isThreeImport(id) {
  return id === 'three' || id.startsWith('three/addons/');
}

function copyStaticAssets() {
  return {
    name: 'crate-copy-static-assets',
    async closeBundle() {
      const outDir = path.join(rootDir, 'dist');
      for (const file of staticFiles) {
        const src = path.join(rootDir, file);
        const dest = path.join(outDir, file);
        await mkdir(path.dirname(dest), { recursive: true });
        await cp(src, dest, { force: true, recursive: false });
      }
      for (const dir of staticDirs) {
        const src = path.join(rootDir, dir);
        const dest = path.join(outDir, dir);
        await cp(src, dest, { recursive: true, force: true });
      }
    }
  };
}

export default defineConfig({
  root: rootDir,
  publicDir: false,
  server: {
    host: '127.0.0.1',
    port: 4173
  },
  preview: {
    host: '127.0.0.1',
    port: 4174
  },
  build: {
    outDir: path.join(rootDir, 'dist'),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      external(id) {
        return isThreeImport(id);
      },
      output: {
        manualChunks(id) {
          const normalized = id.split(path.sep).join('/');

          if (normalized.endsWith('/auth.mjs')) return 'app-auth';
          if (normalized.endsWith('/model-registry.mjs') || normalized.endsWith('/asset-gallery.mjs')) return 'app-assets';
          if (normalized.endsWith('/weather.mjs') || normalized.endsWith('/sound.mjs')) return 'app-worldfx';
          if (normalized.endsWith('/physics.mjs')) return 'app-physics';
          if (normalized.endsWith('/collision.mjs')) return 'app-collision';
          if (normalized.endsWith('/character.mjs')) return 'app-gameplay';
          if (normalized.endsWith('/town-builder.mjs')) return 'app-town-builder';
          if (normalized.endsWith('/buildings.mjs') || normalized.endsWith('/city-builder.mjs')) return 'app-builder';
          if (normalized.endsWith('/godmode.mjs')) return 'app-godmode';
        }
      },
      input: {
        index: path.join(rootDir, 'index.html'),
        play: path.join(rootDir, 'play.html'),
        compare: path.join(rootDir, 'compare.html'),
        creators: path.join(rootDir, 'creators.html'),
        demo: path.join(rootDir, 'demo.html'),
        features: path.join(rootDir, 'features.html'),
        game: path.join(rootDir, 'game.html'),
        marketplace: path.join(rootDir, 'marketplace.html'),
        pricing: path.join(rootDir, 'pricing.html'),
        generate_favicon: path.join(rootDir, 'generate_favicon.html'),
        generate_npcs: path.join(rootDir, 'generate_npcs.html'),
        docs: path.join(rootDir, 'docs/index.html')
      }
    }
  },
  plugins: [copyStaticAssets()]
});
