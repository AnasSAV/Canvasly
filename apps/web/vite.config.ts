import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Overridable so e2e tests can run their own servers next to a developer's `pnpm dev`.
const workerPort = process.env.WORKER_PORT ?? '8787';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // `pnpm dev` runs wrangler on :8787; the browser only ever talks to Vite's origin.
    proxy: {
      '/api': { target: `http://127.0.0.1:${workerPort}`, ws: true },
    },
  },
});
