# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: r3-sharing.test.ts >> R3 — sharing surfaces >> secure-link viewer is public and shows unavailable without a valid token
- Location: tests\e2e\r3-sharing.test.ts:31:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
Call log:
  - navigating to "http://localhost:3000/share/not-a-real-token", waiting until "load"

```

# Test source

```ts
  1   | /**
  2   |  * R3 Sharing UI — auth gates, per-role console, secure-link viewer, axe.
  3   |  * Full request→approve→revoke lifecycle is covered by
  4   |  * tests/integration/api/phase4-sharing.test.ts (API + audit).
  5   |  */
  6   | import { test, expect } from '@playwright/test';
  7   | import AxeBuilder from '@axe-core/playwright';
  8   | import {
  9   |   ensureAdminSession,
  10  |   ensureMemberSession,
  11  |   ensureStaffSession,
  12  |   isSupabaseAuthUp,
  13  | } from './helpers/auth';
  14  | 
  15  | async function expectNoSeriousAxe(page: import('@playwright/test').Page) {
  16  |   const results = await new AxeBuilder({ page })
  17  |     .withTags(['wcag2a', 'wcag2aa'])
  18  |     .analyze();
  19  |   const serious = results.violations.filter(
  20  |     (v) => v.impact === 'serious' || v.impact === 'critical',
  21  |   );
  22  |   expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  23  | }
  24  | 
  25  | test.describe('R3 — sharing surfaces', () => {
  26  |   test('unauthenticated /sharing redirects to login', async ({ page }) => {
  27  |     await page.goto('/sharing');
  28  |     await expect(page).toHaveURL(/\/login/);
  29  |   });
  30  | 
  31  |   test('secure-link viewer is public and shows unavailable without a valid token', async ({
  32  |     page,
  33  |   }) => {
> 34  |     await page.goto('/share/not-a-real-token');
      |                ^ Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
  35  |     await expect(page.getByText('Unavailable', { exact: true })).toBeVisible({
  36  |       timeout: 15_000,
  37  |     });
  38  |     await expect(page.getByText(/no longer accessible/i)).toBeVisible();
  39  |   });
  40  | 
  41  |   test('secure-link unavailable page has no serious axe violations', async ({
  42  |     page,
  43  |   }) => {
  44  |     await page.goto('/share/not-a-real-token');
  45  |     await expect(page.getByText('Unavailable', { exact: true })).toBeVisible({
  46  |       timeout: 15_000,
  47  |     });
  48  |     await expectNoSeriousAxe(page);
  49  |   });
  50  | 
  51  |   test.describe('authenticated console (admin)', () => {
  52  |     test.beforeEach(async ({ context, baseURL }) => {
  53  |       test.skip(
  54  |         !(await isSupabaseAuthUp()),
  55  |         'Supabase auth stack not available (run `supabase start`)',
  56  |       );
  57  |       const { cookie } = await ensureAdminSession();
  58  |       await context.addCookies([
  59  |         { name: cookie.name, value: cookie.value, url: baseURL! },
  60  |       ]);
  61  |     });
  62  | 
  63  |     test('parish admin sees sharing console with grants and contextual tabs', async ({
  64  |       page,
  65  |     }) => {
  66  |       await page.goto('/sharing');
  67  |       await expect(
  68  |         page.getByRole('heading', { name: /data sharing/i }),
  69  |       ).toBeVisible({ timeout: 15_000 });
  70  | 
  71  |       await expect(page.getByRole('tab', { name: /requests/i })).toBeVisible();
  72  |       await expect(page.getByRole('tab', { name: /grants/i })).toBeVisible();
  73  |       await expect(
  74  |         page.getByRole('tab', { name: /contextual shares/i }),
  75  |       ).toBeVisible();
  76  | 
  77  |       // Parish admin can review / issue grants (create request is diocese-only).
  78  |       // CardTitle is a div (not a heading role) — match by text.
  79  |       await page.getByRole('tab', { name: /grants/i }).click();
  80  |       await expect(page.getByText('Issue grant', { exact: true })).toBeVisible({
  81  |         timeout: 15_000,
  82  |       });
  83  | 
  84  |       await page.getByRole('tab', { name: /contextual shares/i }).click();
  85  |       await expect(
  86  |         page.getByText('Create contextual share', { exact: true }),
  87  |       ).toBeVisible({ timeout: 15_000 });
  88  |     });
  89  | 
  90  |     test('parish admin can create a secure link and see one-time token UI', async ({
  91  |       page,
  92  |     }) => {
  93  |       await page.goto('/sharing');
  94  |       await page.getByRole('tab', { name: /contextual shares/i }).click();
  95  |       await expect(
  96  |         page.getByText('Create contextual share', { exact: true }),
  97  |       ).toBeVisible({ timeout: 15_000 });
  98  | 
  99  |       await page.getByRole('button', { name: /create share/i }).click();
  100 |       await expect(page.getByText(/one-time secure link/i)).toBeVisible({
  101 |         timeout: 15_000,
  102 |       });
  103 |       await expect(page.getByRole('button', { name: /copy url/i })).toBeVisible();
  104 |     });
  105 | 
  106 |     test('sharing console has no serious axe violations', async ({ page }) => {
  107 |       await page.goto('/sharing');
  108 |       await expect(
  109 |         page.getByRole('heading', { name: /data sharing/i }),
  110 |       ).toBeVisible({ timeout: 15_000 });
  111 |       await expectNoSeriousAxe(page);
  112 |     });
  113 |   });
  114 | 
  115 |   test.describe('per-role gates', () => {
  116 |     test('member cannot use sharing console (redirect or no manage tabs)', async ({
  117 |       page,
  118 |       context,
  119 |       baseURL,
  120 |     }) => {
  121 |       test.skip(
  122 |         !(await isSupabaseAuthUp()),
  123 |         'Supabase auth stack not available (run `supabase start`)',
  124 |       );
  125 |       const { cookie } = await ensureMemberSession();
  126 |       await context.addCookies([
  127 |         { name: cookie.name, value: cookie.value, url: baseURL! },
  128 |       ]);
  129 | 
  130 |       await page.goto('/sharing');
  131 |       // Members are not in the nav allow-list; API list also 403s.
  132 |       // Accept redirect to login/home or empty console without grant issue form.
  133 |       const url = page.url();
  134 |       if (/\/login/.test(url)) {
```