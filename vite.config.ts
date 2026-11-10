import { defineConfig } from 'vite';

// Relative base so the build can be hosted from any path (CDN folder, iframe, artifact).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  server: {
    // `npm run server` runs the RGS on 8787; with ?rgs=/ the dev client talks to it through this proxy.
    proxy: { '/api': 'http://localhost:8787' },
  },
});
