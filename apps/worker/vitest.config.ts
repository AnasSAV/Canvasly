import { defineConfig } from 'vitest/config';

// Pure modules only (no Workers runtime): password hashing, wire formats, storage helpers.
export default defineConfig({
  test: {
    name: 'worker',
    include: ['src/**/*.test.ts'],
  },
});
