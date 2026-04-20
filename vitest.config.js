import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Default: node (for canvas-utils.test.js)
    environment: 'node',
    exclude: ['**/node_modules/**', '**/tests/e2e/**'],
    // DOM tests run in jsdom
    environmentMatchGlobs: [
      ['tests/canvas-dom.test.js', 'jsdom'],
      ['tests/canvas-integration.test.js', 'jsdom'],
      ['tests/canvas-dialogs.test.js', 'jsdom'],
      ['tests/canvas-interactions.test.js', 'jsdom'],
    ],
    // Runs before every test file; guarded inside for node vs jsdom
    setupFiles: ['tests/setup-dom.js'],
  },
});
