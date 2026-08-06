import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Keep generated output out of the repository root. GitHub Pages receives the
// dist directory through the deployment workflow; relative assets work both at
// localhost and on a repository sub-path.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
  },
});
