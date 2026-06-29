/**
 * Phase 2 E2E — intra-parish access through the real browser + middleware.
 *
 * Auth-gate tests run everywhere (no Supabase needed). The authenticated member
 * journey needs the full Supabase stack (GoTrue); it self-skips when the auth
 * endpoint is unreachable (e.g. CI on plain Postgres).
 */
import { test, expect } from '@playwright/test';
import { ensureMemberSession, isSupabaseAuthUp } from './helpers/auth';

test.describe('Phase 2 — auth gate on new surfaces', () => {
  test('unauthenticated /directory redirects to login', async ({ page }) => {
    await page.goto('/directory');
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated /settings/permissions redirects to login', async ({
    page,
  }) => {
    await page.goto('/settings/permissions');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Phase 2 — member directory (MM-14)', () => {
  test('member sees parish peers and no date of birth leaks', async ({
    page,
    context,
    baseURL,
  }) => {
    test.skip(
      !(await isSupabaseAuthUp()),
      'Supabase auth stack not available (run `supabase start`)',
    );

    const { cookie } = await ensureMemberSession();
    await context.addCookies([
      { name: cookie.name, value: cookie.value, url: baseURL! },
    ]);

    await page.goto('/directory');

    // MM-14: a plain MEMBER sees the directory, including peers (not just self).
    await expect(page.getByTestId('directory-list')).toBeVisible();
    const rows = await page.getByTestId('directory-member').count();
    expect(rows).toBeGreaterThan(1);

    // The seeded date of birth (1990-07-04) must never reach this surface.
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('1990');
  });
});
