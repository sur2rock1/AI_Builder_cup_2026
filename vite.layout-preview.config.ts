// Development-only: builds layout-preview.html into a folder OUTSIDE the project.
//   npx vite build --config vite.layout-preview.config.ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  cacheDir: process.env.LAYOUT_PREVIEW_CACHE || '/tmp/layout-preview-cache',
  build: {
    outDir: process.env.LAYOUT_PREVIEW_OUT || '/tmp/layout-preview',
    emptyOutDir: true,
    rollupOptions: { input: path.resolve(__dirname, 'layout-preview.html') },
  },
});
