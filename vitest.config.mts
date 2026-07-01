import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

const env = loadEnv('test', process.cwd(), '');

export default defineConfig({
  test: {
    // Load .env.local (and .env) so DATABASE_URL is available without
    // needing to set it in the shell before running tests locally.
    env: {
      DATABASE_URL: env.DATABASE_URL ?? '',
      TEST_DATABASE_URL: env.TEST_DATABASE_URL ?? env.DATABASE_URL ?? '',
      POSTGRES_URL: env.POSTGRES_URL ?? env.DATABASE_URL ?? '',
    },
    projects: [
      {
        // Unit tests: pure logic + React component tests (jsdom)
        plugins: [tsconfigPaths(), react()],
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['tests/unit/**/*.test.{ts,tsx}'],
          setupFiles: ['tests/setup/unit.ts'],
        },
      },
      {
        // Integration tests: API route handlers + real DB (node)
        plugins: [tsconfigPaths()],
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          setupFiles: ['tests/setup/integration.ts'],
          // Serialise integration tests — they share a single test DB.
          fileParallelism: false,
          maxWorkers: 1,
        },
      },
      {
        // RLS tests: raw SQL sessions as app_authenticated against a real DB.
        // These prove tenant isolation at the database layer, independent of
        // the application. Tagged @phase:1 @rls — they are the Phase 1 exit gate.
        plugins: [tsconfigPaths()],
        test: {
          name: 'rls',
          environment: 'node',
          include: ['tests/rls/**/*.test.ts'],
          setupFiles: ['tests/setup/integration.ts'],
          // Serialise RLS tests — they share a single test DB.
          fileParallelism: false,
          maxWorkers: 1,
        },
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
