import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  // Local runs hit the dev server; first navigation to a route pays a compile
  // cost that regularly exceeds the 5s default expect timeout.
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 2 : 0,
  // Serial everywhere: tests share seeded auth users/sessions in one database,
  // and the dev server degrades under parallel first-compile load.
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL,
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Start the Next.js dev server automatically when running E2E locally.
  // In CI the server is started separately so this block is skipped.
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
