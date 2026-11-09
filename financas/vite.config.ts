import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// base './' para funcionar em qualquer pasta do GitHub Pages (ex.: /Cenas/contas-da-casa/).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', chunkSizeWarningLimit: 900 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
