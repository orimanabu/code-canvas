import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Default: node (for canvas-utils.test.js)
    environment: 'node',
    // DOM tests run in jsdom
    environmentMatchGlobs: [
      ['tests/canvas-dom.test.js', 'jsdom'],
    ],
    // Runs before every test file; guarded inside for node vs jsdom
    setupFiles: ['tests/setup-dom.js'],
  },
});
