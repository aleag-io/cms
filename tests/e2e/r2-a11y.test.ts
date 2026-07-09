/**
 * R2 — axe accessibility checks on parish operations surfaces.
 * @mvp2 @phase:10 @phase:11
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ensureAdminSession, isSupabaseAuthUp } from './helpers/auth';

async function seriousViolations(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((violation) =>
    ['serious', 'critical'].includes(violation.impact ?? ''),
  );
}

test.describe('R2 authenticated a11y', () => {
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

  test('programs list has no serious axe violations', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/programs');
    await expect(page.getByRole('heading', { name: /programs/i })).toBeVisible({
      timeout: 15000,
    });
    expect(await seriousViolations(page)).toEqual([]);
  });

  test('organizations list has no serious axe violations', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/organizations');
    await expect(
      page.getByRole('heading', { name: /organizations/i }),
    ).toBeVisible({ timeout: 15000 });
    expect(await seriousViolations(page)).toEqual([]);
  });

  test('events calendar has no serious axe violations', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/events');
    await expect(page.getByTestId('events-calendar')).toBeVisible({
      timeout: 15000,
    });
    expect(await seriousViolations(page)).toEqual([]);
  });

  test('message composer has no serious axe violations', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/messages');
    await expect(page.getByTestId('message-composer')).toBeVisible({
      timeout: 15000,
    });
    expect(await seriousViolations(page)).toEqual([]);
  });

  test('facilities booking surface has no serious axe violations', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.goto('/facilities');
    await expect(page.getByTestId('booking-calendar')).toBeVisible({
      timeout: 15000,
    });
    expect(await seriousViolations(page)).toEqual([]);
  });
});
