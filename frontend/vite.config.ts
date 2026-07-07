import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build-Ziel ist das Repo-Root: GitHub Pages (Deploy from branch, / root)
// serviert die gebaute App direkt. base './' hält alle Asset-Pfade relativ,
// damit sowohl username.github.io als auch /repo-name/-Subpfade funktionieren.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '..',
    emptyOutDir: false,   // manifest.json, sw.js, icons/, legacy/, backend/ NIE löschen
    assetsDir: 'assets',
  },
});
