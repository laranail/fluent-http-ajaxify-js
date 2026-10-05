import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
    // A standalone node script with its own harness (it calls process.exit);
    // `npm test` runs it separately with `node`.
    exclude: ['tests/security.test.js', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['assets/js/**/*.js'],
    },
  },
});
