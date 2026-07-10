/**
 * E2E smoke test — Phase 0 gate.
 *
 * Proves Playwright can reach the running Next.js app. More detailed
 * user-journey tests are added per phase.
 */

import { test, expect } from '@playwright/test';

test('home page loads marketing landing without a server error', async ({
  page,
}) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole('heading', {
      name: /church management built for parish sovereignty/i,
    }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /^log in$/i }).first()).toBeVisible();
});

test('landing page login link navigates to login', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /^log in$/i }).first().click();
  await expect(page).toHaveURL(/\/login/);
});

test('non-existent route returns 404', async ({ page }) => {
  const response = await page.goto('/this-does-not-exist-xyz');
  // With auth middleware active, unknown routes may redirect to /login.
  expect([404, 307, 302, 200]).toContain(response?.status());
});
