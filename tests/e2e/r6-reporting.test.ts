/**
 * R6 M11/M12 — reporting + integrations UI smoke: auth gates, report run and
 * export, diocese dashboards, member isolation, a11y.
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

async function injectDioceseAdmin(
  context: import('@playwright/test').BrowserContext,
  baseURL: string,
) {
  const { cookie } = await ensureDioceseAdminSession();
  await context.addCookies([
    { name: cookie.name, value: cookie.value, url: baseURL },
  ]);
}

test.describe('R6 — reporting UI', () => {
  test('unauthenticated /reports redirects to login', async ({ page }) => {
    await page.goto('/reports');
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated /finance/reports redirects to login', async ({ page }) => {
    await page.goto('/finance/reports');
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated /settings/integrations redirects to login', async ({
    page,
  }) => {
    await page.goto('/settings/integrations');
    await expect(page).toHaveURL(/\/login/);
  });

  test('parish admin sees the report catalog and can run one', async ({
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

    await page.goto('/reports');
    await expect(
      page.getByRole('heading', { name: /^reports$/i }),
    ).toBeVisible();
    await expect(page.getByText(/membership status/i).first()).toBeVisible();

    await page.goto('/reports/membership-status');
    await expect(
      page.getByRole('heading', { name: /membership status/i }),
    ).toBeVisible();
    await expect(page.getByText(/download csv/i)).toBeVisible();
  });

  test('parish admin can open Receipts & Payments', async ({
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

    await page.goto('/finance/reports/receipts-payments');
    await expect(
      page.getByRole('heading', { name: /receipts & payments/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/year/i)).toBeVisible();
  });

  test('parish admin can manage webhook endpoints', async ({
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

    await page.goto('/settings/integrations');
    await expect(
      page.getByRole('heading', { name: /integrations/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/endpoint url/i)).toBeVisible();
  });

  test('diocese admin can open the approval policy dashboard', async ({
    page,
    context,
    baseURL,
  }) => {
    test.skip(
      !(await isSupabaseAuthUp()),
      'Supabase auth stack not available (run `supabase start`)',
    );
    test.setTimeout(90_000);
    await injectDioceseAdmin(context, baseURL!);

    await page.goto('/diocese/finance/policies');
    await expect(
      page.getByRole('heading', { name: 'Approval Policies', exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/policy matrix/i)).toBeVisible();
  });

  test('member cannot reach reports or integrations', async ({
    page,
    context,
    baseURL,
  }) => {
    test.skip(
      !(await isSupabaseAuthUp()),
      'Supabase auth stack not available (run `supabase start`)',
    );
    test.setTimeout(90_000);
    const { cookie } = await ensureMemberSession();
    await context.addCookies([
      { name: cookie.name, value: cookie.value, url: baseURL! },
    ]);

    // The API is the boundary: a member must never receive report output.
    const response = await page.request.get('/api/reports/membership-status');
    expect(response.status()).toBe(403);

    const webhooks = await page.request.get('/api/integrations/webhooks');
    expect(webhooks.status()).toBe(403);
  });
});

test.describe('R6 — reporting a11y', () => {
  test('reports hub has no serious accessibility violations', async ({
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

    await page.goto('/reports');
    await expect(
      page.getByRole('heading', { name: /^reports$/i }),
    ).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const serious = results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    );
    expect(serious).toEqual([]);
  });

  test('integrations page has no serious accessibility violations', async ({
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

    await page.goto('/settings/integrations');
    await expect(
      page.getByRole('heading', { name: /integrations/i }),
    ).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const serious = results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    );
    expect(serious).toEqual([]);
  });
});
