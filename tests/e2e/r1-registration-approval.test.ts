/**
 * R1 — Phase 9 exit gate: a self-registered member is invisible in the parish
 * directory until approved, and appears after approval — proven end-to-end
 * through the real UI (register form → approval queue → directory).
 */
import { test, expect } from '@playwright/test';
import {
  ensureAdminSession,
  ensureMemberSession,
  isSupabaseAuthUp,
  parishAName,
} from './helpers/auth';

test('pending self-registration is invisible in the directory until approved', async ({
  browser,
  baseURL,
}) => {
  test.skip(
    !(await isSupabaseAuthUp()),
    'Supabase auth stack not available (run `supabase start`)',
  );
  test.setTimeout(90000);

  // Seed parish + directory members and get sessions.
  await ensureMemberSession();
  const admin = await ensureAdminSession();

  // Unique name so reruns don't collide with previously approved rows.
  const lastName = `Reg${Date.now()}`;
  const fullName = `Approvable ${lastName}`;

  // 1. Guest submits a self-registration.
  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  await guestPage.goto('/register');
  // Register into Parish A specifically — the approving admin lives there.
  const targetParish = await parishAName();
  const parishTrigger = guestPage.getByRole('combobox');
  await expect(parishTrigger).toBeEnabled({ timeout: 10000 });
  await parishTrigger.click();
  await guestPage.getByRole('option', { name: targetParish }).click();
  await guestPage.getByLabel('First name').fill('Approvable');
  await guestPage.getByLabel('Last name').fill(lastName);
  await guestPage.getByLabel('Email').fill(`${lastName.toLowerCase()}@cms.local`);
  await guestPage.getByRole('button', { name: /submit/i }).click();
  await expect(guestPage.getByText('Registration submitted')).toBeVisible({
    timeout: 15000,
  });
  await guestContext.close();

  // 2. The pending member is NOT in the directory.
  const adminContext = await browser.newContext();
  await adminContext.addCookies([{ ...admin.cookie, url: baseURL! }]);
  const adminPage = await adminContext.newPage();

  await adminPage.goto('/directory');
  await expect(
    adminPage.getByTestId('directory-member').first(),
  ).toBeVisible({ timeout: 10000 });
  expect(await adminPage.locator('body').textContent()).not.toContain(fullName);

  // 3. Admin approves it from the queue.
  await adminPage.goto('/registrations');
  const row = adminPage.locator('li', { hasText: fullName });
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.getByRole('button', { name: /approve/i }).click();
  await expect(adminPage.getByText('Registration approved')).toBeVisible();

  // 4. The approved member IS in the directory.
  await adminPage.goto('/directory');
  await expect(adminPage.getByText(fullName)).toBeVisible({ timeout: 10000 });
  await adminContext.close();
});
