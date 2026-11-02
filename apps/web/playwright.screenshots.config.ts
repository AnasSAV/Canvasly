import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Regenerates docs/screenshots from the running app: pnpm --filter @canvasly/web screenshots
export default defineConfig({
  ...base,
  testMatch: '**/*.shot.ts',
  timeout: 300_000,
  use: { ...base.use, viewport: { width: 1600, height: 1000 } },
});
