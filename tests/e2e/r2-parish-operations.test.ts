/**
 * R2 Parish Operations E2E — programs, orgs, events, facilities, messages.
 * @mvp2 @phase:10 @phase:11
 */
import { test, expect } from '@playwright/test';
import {
  ensureAdminSession,
  ensureMemberSession,
  isSupabaseAuthUp,
} from './helpers/auth';

test.describe('R2 — parish operations (admin)', () => {
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

  test('admin can create program and open detail', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto('/programs');
    await expect(page.getByRole('heading', { name: /programs/i })).toBeVisible({
      timeout: 15000,
    });

    await page.getByRole('link', { name: /add program/i }).click();
    await page.getByLabel(/^name$/i).fill('R2 E2E Ministry');
    await page.getByRole('button', { name: /create program/i }).click();

    await expect(
      page.getByRole('heading', { name: 'R2 E2E Ministry' }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('program-enrollments')).toBeVisible();
    await expect(page.getByTestId('program-sessions')).toBeVisible();
  });

  test('admin can create exclusive org and open roster', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto('/organizations/new');
    await expect(
      page.getByRole('heading', { name: /add organization/i }),
    ).toBeVisible({ timeout: 15000 });

    await page.getByLabel(/^name$/i).fill('R2 Prayer Circle');
    await page.getByLabel(/^type$/i).click();
    await page.getByRole('option', { name: /prayer group/i }).click();
    await expect(page.getByTestId('mode-default-hint')).toContainText(
      /default/i,
    );

    await page.getByRole('button', { name: /create organization/i }).click();
    await expect(
      page.getByRole('heading', { name: 'R2 Prayer Circle' }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('org-roster')).toBeVisible();
  });

  test('admin can create event', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto('/events/new');
    await expect(page.getByRole('heading', { name: /add event/i })).toBeVisible(
      { timeout: 15000 },
    );

    await page.getByLabel(/^name$/i).fill('R2 Parish Gathering');
    await page.getByLabel(/^starts$/i).fill('2026-10-01T10:00');
    await page.getByLabel(/^ends$/i).fill('2026-10-01T12:00');
    await page.getByLabel(/max capacity/i).fill('25');
    await page.getByRole('button', { name: /create event/i }).click();

    await expect(
      page.getByRole('heading', { name: 'R2 Parish Gathering' }),
    ).toBeVisible({ timeout: 15000 });
  });

  test('admin can create facility and book it', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto('/facilities');
    await expect(
      page.getByRole('heading', { name: /facilities/i }),
    ).toBeVisible({ timeout: 15000 });

    const unique = `Hall ${Date.now()}`;
    await page.getByLabel(/^name$/i).first().fill(unique);
    await page.getByRole('button', { name: /^create$/i }).click();
    await expect(
      page.getByTestId('facility-row').filter({ hasText: unique }),
    ).toBeVisible({ timeout: 15000 });

    await page.getByLabel(/^facility$/i).click();
    await page.getByRole('option', { name: unique }).click();
    await page.getByLabel(/^title$/i).fill('Choir practice');
    await page.getByLabel(/^starts$/i).fill('2026-11-01T18:00');
    await page.getByLabel(/^ends$/i).fill('2026-11-01T20:00');
    await page.getByRole('button', { name: /^book$/i }).click();

    await expect(page.getByText('Choir practice')).toBeVisible({
      timeout: 15000,
    });
  });

  test('admin can compose a message and see it queued', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto('/messages');
    await expect(page.getByTestId('message-composer')).toBeVisible({
      timeout: 15000,
    });

    await page.getByLabel(/^body$/i).fill('R2 E2E announcement body');
    await page.getByRole('button', { name: /queue send/i }).click();

    const statusList = page.getByTestId('message-status-list');
    await expect(statusList).toBeVisible();
    // Scope to the status list so the composer textarea body does not match.
    await expect(
      statusList.getByText(/R2 E2E announcement body/i),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('message-status').first()).toBeVisible();
  });
});

test.describe('R2 — member surfaces', () => {
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

  test('member can open events list', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/events');
    await expect(page.getByRole('heading', { name: /events/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId('events-calendar')).toBeVisible();
  });

  test('member does not see messages nav destination', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/app');
    await expect(page.getByText(/member portal/i)).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('link', { name: /^messages$/i })).toHaveCount(
      0,
    );
  });
});

test.describe('R2 — auth gates', () => {
  test('unauthenticated users are redirected from R2 routes', async ({
    page,
  }) => {
    test.setTimeout(60000);
    for (const route of [
      '/programs',
      '/organizations',
      '/events',
      '/facilities',
      '/messages',
    ]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/);
    }
  });
});
