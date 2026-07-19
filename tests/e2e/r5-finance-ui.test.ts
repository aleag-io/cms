/**
 * R5 M10 — Finance UI smoke: auth gates, admin surfaces, member isolation, a11y.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  ensureAdminSession,
  ensureDioceseAdminSession,
  ensureMemberSession,
  isSupabaseAuthUp,
} from './helpers/auth';

async function injectAdmin(
  context: import('@playwright/test').BrowserContext,
  baseURL: string,
) {
  const { cookie } = await ensureAdminSession();
  await context.addCookies([
    { name: cookie.name, value: cookie.value, url: baseURL },
  ]);
}

test.describe('R5 — finance UI', () => {
  test('unauthenticated /finance redirects to login', async ({ page }) => {
    await page.goto('/finance');
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated /finance/accounts redirects to login', async ({
    page,
  }) => {
    await page.goto('/finance/accounts');
    await expect(page).toHaveURL(/\/login/);
  });

  test('parish admin can open finance overview and chart of accounts', async ({
    page,
    context,
    baseURL,
  }) => {
    test.skip(
      !(await isSupabaseAuthUp()),
      'Supabase auth stack not available (run `supabase start`)',
    );
    test.setTimeout(90_000);
    await injectAdmin(context, baseURL!);

    await page.goto('/finance');
    await expect(
      page.getByRole('heading', { name: /^finance$/i }),
    ).toBeVisible({ timeout: 20_000 });
    // Prefer the main content card link (sidebar also has the same title).
    await expect(
      page
        .locator('main')
        .getByRole('link', { name: /chart of accounts/i })
        .first(),
    ).toBeVisible();

    await page.goto('/finance/accounts');
    await expect(
      page.getByRole('heading', { name: /chart of accounts/i }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole('button', { name: /seed default chart/i }),
    ).toBeVisible();

    await page.getByRole('button', { name: /seed default chart/i }).click();
    await expect(page.getByRole('table')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Operating Cash').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('parish admin can open journal, periods, donations, approvals', async ({
    page,
    context,
    baseURL,
  }) => {
    test.skip(
      !(await isSupabaseAuthUp()),
      'Supabase auth stack not available (run `supabase start`)',
    );
    test.setTimeout(120_000);
    await injectAdmin(context, baseURL!);

    for (const [path, testId, heading] of [
      ['/finance/journal', 'finance-journal', /^journal$/i],
      ['/finance/periods', 'finance-periods', /accounting periods/i],
      ['/finance/donations', 'finance-donations', /^donations$/i],
      ['/finance/approvals', 'finance-approvals', /^approvals$/i],
    ] as const) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId(testId)).toBeVisible({ timeout: 25_000 });
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
  });

  test('member does not see Finance nav or ledger surfaces', async ({
    page,
    context,
    baseURL,
  }) => {
    test.skip(
      !(await isSupabaseAuthUp()),
      'Supabase auth stack not available (run `supabase start`)',
    );
    test.setTimeout(60_000);
    const { cookie } = await ensureMemberSession();
    await context.addCookies([
      { name: cookie.name, value: cookie.value, url: baseURL! },
    ]);

    await page.goto('/app');
    await expect(
      page.locator('[data-sidebar="menu"]').getByRole('link', {
        name: /^finance overview$/i,
      }),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-sidebar="menu"]').getByRole('link', {
        name: /chart of accounts/i,
      }),
    ).toHaveCount(0);

    await page.goto('/finance/accounts', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('heading', { name: /finance/i })).toHaveCount(0);
  });

  test('diocese finance is aggregate-only and axe clean', async ({
    page,
    context,
    baseURL,
  }) => {
    test.skip(
      !(await isSupabaseAuthUp()),
      'Supabase auth stack not available (run `supabase start`)',
    );
    test.setTimeout(60_000);
    const { cookie } = await ensureDioceseAdminSession();
    await context.addCookies([
      { name: cookie.name, value: cookie.value, url: baseURL! },
    ]);

    await page.goto('/diocese/finance', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: /diocese finance/i }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Summary only', { exact: true })).toBeVisible();
    await expect(page.locator('main a[href^="/finance"]')).toHaveCount(0);

    // Axe the aggregate surface itself — the subject of this test.
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    );
    expect(serious).toEqual([]);

    // /finance is the diocese's OWN standalone ledger (see the doc comment on
    // app/(app)/finance/layout.tsx): a diocese-scoped user stays there rather
    // than being bounced to the cross-parish aggregate.
    await page.goto('/finance', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/finance(\?|$)/);
  });
});

test.describe('R5 — finance a11y', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    test.skip(
      !(await isSupabaseAuthUp()),
      'Supabase auth stack not available (run `supabase start`)',
    );
    await injectAdmin(context, baseURL!);
  });

  for (const [path, heading] of [
    ['/finance', /^finance$/i],
    ['/finance/accounts', /chart of accounts/i],
    ['/finance/journal', /^journal$/i],
    ['/finance/periods', /accounting periods/i],
    ['/finance/donations', /^donations$/i],
    ['/finance/approvals', /^approvals$/i],
  ] as const) {
    test(`${path} has no serious axe violations`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: heading })).toBeVisible({
        timeout: 20_000,
      });
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) =>
        ['serious', 'critical'].includes(v.impact ?? ''),
      );
      expect(serious).toEqual([]);
    });
  }
});
