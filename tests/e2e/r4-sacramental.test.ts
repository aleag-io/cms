/**
 * R4 M8 smoke — sacramental surfaces auth + admin can open register,
 * plus the axe gate on the register surface (exit gate 5).
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ensureAdminSession, isSupabaseAuthUp } from './helpers/auth';

test.describe('R4 — sacramental register', () => {
  test('unauthenticated /sacramental-records redirects to login', async ({
    page,
  }) => {
    await page.goto('/sacramental-records');
    await expect(page).toHaveURL(/\/login/);
  });

  test('parish admin can open sacramental register', async ({
    page,
    context,
    baseURL,
  }) => {
    test.skip(
      !(await isSupabaseAuthUp()),
      'Supabase auth stack not available (run `supabase start`)',
    );
    const { cookie } = await ensureAdminSession();
    await context.addCookies([
      { name: cookie.name, value: cookie.value, url: baseURL! },
    ]);

    await page.goto('/sacramental-records');
    await expect(
      page.getByRole('heading', { name: /sacramental register/i }),
    ).toBeVisible({ timeout: 15_000 });

    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    );
    expect(serious).toEqual([]);
  });
});
