import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // GitHub Pages serves this as a project site at /ml-portfolio/, so every
  // asset URL needs that prefix in the gh-pages build (see
  // .github/workflows/deploy-pages.yml, which builds with --mode gh-pages).
  // The Docker/local dev build stays at root ('/').
  base: mode === 'gh-pages' ? '/ml-portfolio/' : '/',
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: 'all',
  },
}));
