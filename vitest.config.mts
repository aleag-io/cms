import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  test: {
    projects: [
      {
        // Unit tests: pure logic + React component tests (jsdom)
        plugins: [react()],
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['tests/unit/**/*.test.{ts,tsx}'],
          setupFiles: ['tests/setup/unit.ts'],
        },
        resolve: { tsconfigPaths: true },
      },
      {
        // Integration tests: API route handlers + real DB (node)
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          setupFiles: ['tests/setup/integration.ts'],
          // Serialise integration tests — they share a single test DB.
          maxWorkers: 1,
        },
        resolve: { tsconfigPaths: true },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['lib/**', 'app/api/**'],
      exclude: ['**/*.test.*', '**/node_modules/**'],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
      },
    },
  },
});
