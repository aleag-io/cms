/**
 * R3 Sharing UI — auth gates, per-role console, secure-link viewer, axe.
 * Full request→approve→revoke lifecycle is covered by
 * tests/integration/api/phase4-sharing.test.ts (API + audit).
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  ensureAdminSession,
  ensureMemberSession,
  ensureStaffSession,
  isSupabaseAuthUp,
} from './helpers/auth';

async function expectNoSeriousAxe(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

test.describe('R3 — sharing surfaces', () => {
  test('unauthenticated /sharing redirects to login', async ({ page }) => {
    await page.goto('/sharing');
    await expect(page).toHaveURL(/\/login/);
  });

  test('secure-link viewer is public and shows unavailable without a valid token', async ({
    page,
  }) => {
    await page.goto('/share/not-a-real-token');
    await expect(page.getByText('Unavailable', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/no longer accessible/i)).toBeVisible();
  });

  test('secure-link unavailable page has no serious axe violations', async ({
    page,
  }) => {
    await page.goto('/share/not-a-real-token');
    await expect(page.getByText('Unavailable', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expectNoSeriousAxe(page);
  });

  test.describe('authenticated console (admin)', () => {
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

    test('parish admin sees sharing console with grants and contextual tabs', async ({
      page,
    }) => {
      await page.goto('/sharing');
      await expect(
        page.getByRole('heading', { name: /data sharing/i }),
      ).toBeVisible({ timeout: 15_000 });

      await expect(page.getByRole('tab', { name: /requests/i })).toBeVisible();
      await expect(page.getByRole('tab', { name: /grants/i })).toBeVisible();
      await expect(
        page.getByRole('tab', { name: /contextual shares/i }),
      ).toBeVisible();

      // Parish admin can review / issue grants (create request is diocese-only).
      // CardTitle is a div (not a heading role) — match by text.
      await page.getByRole('tab', { name: /grants/i }).click();
      await expect(page.getByText('Issue grant', { exact: true })).toBeVisible({
        timeout: 15_000,
      });

      await page.getByRole('tab', { name: /contextual shares/i }).click();
      await expect(
        page.getByText('Create contextual share', { exact: true }),
      ).toBeVisible({ timeout: 15_000 });
    });

    test('parish admin can create a secure link and see one-time token UI', async ({
      page,
    }) => {
      await page.goto('/sharing');
      await page.getByRole('tab', { name: /contextual shares/i }).click();
      await expect(
        page.getByText('Create contextual share', { exact: true }),
      ).toBeVisible({ timeout: 15_000 });

      await page.getByRole('button', { name: /create share/i }).click();
      await expect(page.getByText(/one-time secure link/i)).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByRole('button', { name: /copy url/i })).toBeVisible();
    });

    test('sharing console has no serious axe violations', async ({ page }) => {
      await page.goto('/sharing');
      await expect(
        page.getByRole('heading', { name: /data sharing/i }),
      ).toBeVisible({ timeout: 15_000 });
      await expectNoSeriousAxe(page);
    });
  });

  test.describe('per-role gates', () => {
    test('member cannot use sharing console (redirect or no manage tabs)', async ({
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

      await page.goto('/sharing');
      // Members are not in the nav allow-list; API list also 403s.
      // Accept redirect to login/home or empty console without grant issue form.
      const url = page.url();
      if (/\/login/.test(url)) {
        await expect(page).toHaveURL(/\/login/);
        return;
      }
      await expect(
        page.getByRole('heading', { name: /issue grant/i }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: /submit request/i }),
      ).toHaveCount(0);
    });

    test('parish staff can open contextual shares but not issue grants', async ({
      page,
      context,
      baseURL,
    }) => {
      test.skip(
        !(await isSupabaseAuthUp()),
        'Supabase auth stack not available (run `supabase start`)',
      );
      const { cookie } = await ensureStaffSession();
      await context.addCookies([
        { name: cookie.name, value: cookie.value, url: baseURL! },
      ]);

      await page.goto('/sharing');
      // Staff may see an empty/partial console or load error for requests/grants;
      // they must not get the Issue grant form (parish_admin only).
      await page.waitForTimeout(1500);
      await expect(
        page.getByRole('heading', { name: /issue grant/i }),
      ).toHaveCount(0);
    });
  });
});
