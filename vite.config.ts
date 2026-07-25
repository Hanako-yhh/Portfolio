import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const planetRouteIds = ['cinder', 'haven', 'aurelia', 'pelagos'];

function sitesBuildArtifacts() {
  return {
    name: 'sites-build-artifacts',
    apply: 'build' as const,
    async buildStart() {
      await rm(resolve('dist'), { recursive: true, force: true });
    },
    async closeBundle() {
      const serverDirectory = resolve('dist/server');
      const metadataDirectory = resolve('dist/.openai');

      await mkdir(serverDirectory, { recursive: true });
      await mkdir(metadataDirectory, { recursive: true });
      await copyFile(resolve('worker/index.js'), resolve(serverDirectory, 'index.js'));
      await copyFile(resolve('.openai/hosting.json'), resolve(metadataDirectory, 'hosting.json'));
    },
  };
}

function staticRouteArtifacts() {
  return {
    name: 'static-route-artifacts',
    apply: 'build' as const,
    async closeBundle() {
      const clientDirectory = resolve('dist/client');
      const entryFile = resolve(clientDirectory, 'index.html');

      await copyFile(entryFile, resolve(clientDirectory, '404.html'));

      await Promise.all(
        planetRouteIds.map(async (planetId) => {
          const routeDirectory = resolve(clientDirectory, 'planets', planetId);
          await mkdir(routeDirectory, { recursive: true });
          await copyFile(entryFile, resolve(routeDirectory, 'index.html'));
        }),
      );
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    ...(mode === 'pages' ? [] : [sitesBuildArtifacts()]),
    staticRouteArtifacts(),
  ],
  build: {
    outDir: 'dist/client',
    rollupOptions: {
      input: {
        main: 'index.html',
        geometrySystem: 'geometry-system.html',
      },
    },
  },
}));
