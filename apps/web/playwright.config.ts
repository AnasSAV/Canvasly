import { defineConfig, devices } from '@playwright/test';

// Dedicated ports so the suite never collides with (or reuses) a developer's `pnpm dev` on 5173/8787.
const WEB_PORT = 5174;
const WORKER_PORT = 8788;
const origin = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: origin,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1400, height: 900 },
  },
  webServer: [
    {
      // Worker + D1 + Durable Objects, all local (state in apps/worker/.wrangler).
      command: `pnpm --filter @canvasly/worker db:migrate:local && pnpm --filter @canvasly/worker exec wrangler dev --port ${WORKER_PORT} --var BETTER_AUTH_URL:${origin}`,
      cwd: '../..',
      url: `http://127.0.0.1:${WORKER_PORT}/api/health`,
      env: { CI: '1' }, // non-interactive migrations
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `pnpm exec vite --port ${WEB_PORT} --strictPort`,
      env: { WORKER_PORT: String(WORKER_PORT) },
      url: origin,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
