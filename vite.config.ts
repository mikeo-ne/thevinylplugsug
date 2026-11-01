import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // A visible build stamp: screenshots of a stale tab are otherwise
  // indistinguishable from a broken deploy.
  define: {
    __BUILD_STAMP__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
