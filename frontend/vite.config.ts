import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Keep generated output out of the repository root. GitHub Pages receives the
// dist directory through the deployment workflow; relative assets work both at
// localhost and on a repository sub-path.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: '0.0.0.0',
    allowedHosts: ['terminal.local'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    manifest: 'asset-manifest.json',
  },
});
