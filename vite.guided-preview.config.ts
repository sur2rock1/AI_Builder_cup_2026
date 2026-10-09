// Development-only: builds guided-preview.html (src/guided/preview.tsx) into a folder
// OUTSIDE the project, so the guided board can be looked at without a voice session.
//   npx vite build --config vite.guided-preview.config.ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  cacheDir: process.env.GUIDED_PREVIEW_CACHE || '/tmp/guided-preview-cache',
  build: {
    outDir: process.env.GUIDED_PREVIEW_OUT || '/tmp/guided-preview',
    emptyOutDir: true,
    rollupOptions: { input: path.resolve(__dirname, 'guided-preview.html') },
  },
});
