import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist/deck/web',
    emptyOutDir: true,
    // Deck is served over localhost/LAN from the daemon, not the public
    // internet, so the single bundle (~750 kB raw / ~230 kB gzipped) is fine.
    // Limit is compared against the uncompressed size in kB; raise Vite's
    // default 500 to silence the cosmetic chunk-size warning.
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:7340' },
      '/ws': { target: 'ws://localhost:7340', ws: true, rewriteWsOrigin: true },
    },
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
