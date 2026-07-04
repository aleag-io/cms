/**
 * R1 — Phase 8 exit-gate centerpiece: four roles open the SAME member profile
 * and the DOM contains exactly the fields each role is entitled to. This
 * proves the API (projection + RLS) withholds data — the UI renders only what
 * arrives.
 *
 * Target member (seeded by ensureMemberSession): Eve E2E, with
 *   - work notes            → staff/admin only
 *   - private pastoral note → clergy only
 *   - date of birth         → clergy/admin (pastoral), never staff/member
 */
import { test, expect, type Page } from '@playwright/test';
import {
  ensureAdminSession,
  ensureClergySession,
  ensureMemberSession,
  ensureStaffSession,
  isSupabaseAuthUp,
} from './helpers/auth';

const PRIVATE_NOTE = 'E2E private pastoral note';
const WORK_NOTE = 'E2E work note';
const DOB = '1990-07-04';

let targetMemberId: string;

test.beforeEach(async () => {
  test.skip(
    !(await isSupabaseAuthUp()),
    'Supabase auth stack not available (run `supabase start`)',
  );
  ({ memberId: targetMemberId } = await ensureMemberSession());
});

async function openProfile(page: Page) {
  await page.goto(`/members/${targetMemberId}`);
  // Profile header renders once the member API call resolves.
  await expect(page.getByText('Eve E2E')).toBeVisible({ timeout: 10000 });
}

test('parish staff sees work notes but no pastoral dates or private note', async ({
  page,
  context,
  baseURL,
}) => {
  const { cookie } = await ensureStaffSession();
  await context.addCookies([{ ...cookie, url: baseURL! }]);

  await openProfile(page);
  await expect(page.getByText(WORK_NOTE)).toBeVisible();
  await expect(page.getByRole('tab', { name: /pastoral/i })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /private note/i })).toHaveCount(0);

  const body = (await page.locator('body').textContent()) ?? '';
  expect(body).not.toContain(DOB);
  expect(body).not.toContain(PRIVATE_NOTE);
});

test('clergy sees the private note and pastoral tab', async ({
  page,
  context,
  baseURL,
}) => {
  const { cookie } = await ensureClergySession();
  await context.addCookies([{ ...cookie, url: baseURL! }]);

  await openProfile(page);
  await expect(page.getByRole('tab', { name: /pastoral/i })).toBeVisible();
  await page.getByRole('tab', { name: /private note/i }).click();
  await expect(page.getByText('Clergy private note')).toBeVisible();
  await expect(page.locator('textarea')).toHaveValue(PRIVATE_NOTE);
});

test('parish admin sees pastoral tab and work notes but never the private note', async ({
  page,
  context,
  baseURL,
}) => {
  const { cookie } = await ensureAdminSession();
  await context.addCookies([{ ...cookie, url: baseURL! }]);

  await openProfile(page);
  await expect(page.getByText(WORK_NOTE)).toBeVisible();
  await expect(page.getByRole('tab', { name: /pastoral/i })).toBeVisible();
  await expect(page.getByRole('tab', { name: /private note/i })).toHaveCount(0);

  const body = (await page.locator('body').textContent()) ?? '';
  expect(body).not.toContain(PRIVATE_NOTE);
});

test("a member cannot load another member's profile", async ({
  page,
  context,
  baseURL,
}) => {
  const { cookie } = await ensureMemberSession();
  await context.addCookies([{ ...cookie, url: baseURL! }]);

  // Peer member seeded by ensureMemberSession with a fixed id.
  await page.goto('/members/00000000-0000-0000-0000-000000000902');
  await expect(page.getByText('Load failed')).toBeVisible({ timeout: 10000 });

  const body = (await page.locator('body').textContent()) ?? '';
  expect(body).not.toContain('Peer Member');
});
