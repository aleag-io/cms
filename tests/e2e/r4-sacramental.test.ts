/**
 * R4 M8 smoke — sacramental surfaces auth + admin can open register.
 */
import { test, expect } from '@playwright/test';
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
  });
});
