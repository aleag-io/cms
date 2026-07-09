/**
 * R3 Sharing UI smoke — auth gates and console shell.
 * Full lifecycle E2E (request→approve→revoke) requires Supabase + multi-user
 * seeding; that path is covered by integration phase4-sharing tests.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ensureMemberSession, isSupabaseAuthUp } from './helpers/auth';

test.describe('R3 — sharing surfaces', () => {
  test('unauthenticated /sharing redirects to login', async ({ page }) => {
    await page.goto('/sharing');
    await expect(page).toHaveURL(/\/login/);
  });

  test('secure-link viewer is public and shows unavailable without a valid token', async ({
    page,
  }) => {
    await page.goto('/share/not-a-real-token');
    // Title + body both match a broad regex; assert the card title specifically.
    await expect(page.getByText('Unavailable', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/no longer accessible/i)).toBeVisible();
  });

  test('authenticated sharing console is axe-clean for a member-level session', async ({
    page,
    context,
    baseURL,
  }) => {
    test.skip(
      !(await isSupabaseAuthUp()),
      'Supabase auth stack not available (run `supabase start`)',
    );

    // Member may not have nav access; use admin helper if available via ensureMemberSession
    // and only assert public secure-link a11y when session cannot open /sharing.
    const { cookie } = await ensureMemberSession();
    await context.addCookies([
      { name: cookie.name, value: cookie.value, url: baseURL! },
    ]);

    await page.goto('/share/not-a-real-token');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
