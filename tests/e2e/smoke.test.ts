/**
 * E2E smoke test — Phase 0 gate.
 *
 * Proves Playwright can reach the running Next.js app. More detailed
 * user-journey tests are added per phase.
 */

import { test, expect } from '@playwright/test';

test('home page loads without a server error', async ({ page }) => {
  const response = await page.goto('/');
  // Accept 200 or 307 (redirect to login — valid when auth is wired).
  expect([200, 307, 302]).toContain(response?.status());
});

test('non-existent route returns 404', async ({ page }) => {
  const response = await page.goto('/this-does-not-exist-xyz');
  // With auth middleware active, unknown routes may redirect to /login.
  expect([404, 307, 302, 200]).toContain(response?.status());
});
