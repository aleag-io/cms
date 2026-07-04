/**
 * R1 — axe accessibility checks on the key surfaces (Phase 5 exit gate 4:
 * shell, /login, dashboard; plus the directory per Phase 9). Serious/critical
 * violations fail the gate.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ensureMemberSession, isSupabaseAuthUp } from './helpers/auth';

async function seriousViolations(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((violation) =>
    ['serious', 'critical'].includes(violation.impact ?? ''),
  );
}

test('login page has no serious axe violations', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByLabel(/email/i)).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test.describe('authenticated surfaces', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    test.skip(
      !(await isSupabaseAuthUp()),
      'Supabase auth stack not available (run `supabase start`)',
    );
    const { cookie } = await ensureMemberSession();
    await context.addCookies([
      { name: cookie.name, value: cookie.value, url: baseURL! },
    ]);
  });

  test('dashboard (app shell) has no serious axe violations', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByText('Member portal')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  test('directory has no serious axe violations', async ({ page }) => {
    await page.goto('/directory');
    await expect(page.getByTestId('directory-member').first()).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  test('self-service has no serious axe violations', async ({ page }) => {
    await page.goto('/self-service');
    await expect(page.getByText('My information')).toBeVisible({
      timeout: 15000,
    });
    expect(await seriousViolations(page)).toEqual([]);
  });
});
