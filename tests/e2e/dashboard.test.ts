/**
 * Operational dashboard smoke — stats + a11y on `/app`.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ensureAdminSession, isSupabaseAuthUp } from './helpers/auth';

test.describe('Operational dashboard', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    test.skip(
      !(await isSupabaseAuthUp()),
      'Supabase auth stack not available (run `supabase start`)',
    );
    const { cookie } = await ensureAdminSession();
    await context.addCookies([
      { name: cookie.name, value: cookie.value, url: baseURL! },
    ]);
  });

  test('parish admin sees KPI stats and work queue sections', async ({
    page,
  }) => {
    await page.goto('/app');
    await expect(page).toHaveURL('/app');
    await expect(page.getByText(/active members/i).first()).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText(/demographics/i).first()).toBeVisible();
    await expect(page.getByText(/needs attention/i).first()).toBeVisible();
  });

  test('dashboard has no critical a11y violations', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByText(/active members/i).first()).toBeVisible({
      timeout: 30000,
    });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(critical).toEqual([]);
  });
});
