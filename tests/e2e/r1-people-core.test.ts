/**
 * R1 People Core E2E — app shell, auth gates, and self-registration flow.
 *
 * These tests exercise the UI built in phases 5–9. They require the full
 * Supabase auth stack and self-skip when it is unavailable.
 */
import { test, expect } from '@playwright/test';
import { ensureMemberSession, isSupabaseAuthUp } from './helpers/auth';

const PROTECTED_ROUTES = [
  '/app',
  '/directory',
  '/self-service',
  '/members',
  '/families',
  '/registrations',
  '/programs',
  '/organizations',
  '/events',
  '/facilities',
  '/messages',
  '/settings/permissions',
  '/audit',
  '/diocese/aggregate',
  '/parishes',
  '/sharing',
];

test.describe('R1 — auth gates', () => {
  test('unauthenticated user is redirected to login from every protected route', async ({
    page,
  }) => {
    test.setTimeout(60000);
    for (const route of PROTECTED_ROUTES) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/);
    }
  });
});

test.describe('R1 — app shell & dashboard', () => {
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

  test('authenticated member lands on the role dashboard', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL('/app');
    await expect(page.getByText('Member portal')).toBeVisible();
    // Member mode: safe links (directory / self-service) and/or quick links.
    await expect(
      page
        .getByRole('link', { name: /directory|self-service|my profile|people/i })
        .first(),
    ).toBeVisible();
  });

  test('signed-in user visiting home is redirected into the app', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/app');
    await expect(page.getByText('Member portal')).toBeVisible();
  });

  test('sign out returns to the login page', async ({ page }) => {
    await page.goto('/app');
    // The user menu trigger shows the display name and role.
    await page.getByRole('button', { name: /e2e member/i }).click();
    await page.getByRole('menuitem', { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('R1 — self-registration', () => {
  test.beforeEach(async () => {
    test.skip(
      !(await isSupabaseAuthUp()),
      'Supabase auth stack not available (run `supabase start`)',
    );
    // Seed the parishes that the public select needs.
    await ensureMemberSession();
  });

  test('guest can submit self-registration and is told it is pending', async ({
    page,
  }) => {
    await page.goto('/register');
    await expect(page.getByText('Self-registration')).toBeVisible();

    // The parish select is populated asynchronously from the public endpoint.
    const parishTrigger = page.getByRole('combobox');
    await expect(parishTrigger).toBeEnabled({ timeout: 10000 });
    await parishTrigger.click();
    await page.getByRole('option').first().click();

    await page.getByLabel('First name').fill('Guest');
    await page.getByLabel('Last name').fill('Registrant');
    await page.getByLabel('Email').fill('guest-registrant@cms.local');
    await page.getByRole('button', { name: /submit/i }).click();

    await expect(page.getByText('Registration submitted')).toBeVisible();
    await expect(page.getByText('pending review')).toBeVisible();
  });
});
