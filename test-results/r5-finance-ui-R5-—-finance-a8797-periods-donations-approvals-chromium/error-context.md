# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: r5-finance-ui.test.ts >> R5 — finance UI >> parish admin can open journal, periods, donations, approvals
- Location: tests/e2e/r5-finance-ui.test.ts:75:7

# Error details

```
Error: page.goto: net::ERR_CONNECTION_RESET at http://localhost:3000/finance/periods
Call log:
  - navigating to "http://localhost:3000/finance/periods", waiting until "domcontentloaded"

```

# Test source

```ts
  1   | /**
  2   |  * R5 M10 — Finance UI smoke: auth gates, admin surfaces, member isolation, a11y.
  3   |  */
  4   | import { test, expect } from '@playwright/test';
  5   | import AxeBuilder from '@axe-core/playwright';
  6   | import {
  7   |   ensureAdminSession,
  8   |   ensureDioceseAdminSession,
  9   |   ensureMemberSession,
  10  |   isSupabaseAuthUp,
  11  | } from './helpers/auth';
  12  | 
  13  | async function injectAdmin(
  14  |   context: import('@playwright/test').BrowserContext,
  15  |   baseURL: string,
  16  | ) {
  17  |   const { cookie } = await ensureAdminSession();
  18  |   await context.addCookies([
  19  |     { name: cookie.name, value: cookie.value, url: baseURL },
  20  |   ]);
  21  | }
  22  | 
  23  | test.describe('R5 — finance UI', () => {
  24  |   test('unauthenticated /finance redirects to login', async ({ page }) => {
  25  |     await page.goto('/finance');
  26  |     await expect(page).toHaveURL(/\/login/);
  27  |   });
  28  | 
  29  |   test('unauthenticated /finance/accounts redirects to login', async ({
  30  |     page,
  31  |   }) => {
  32  |     await page.goto('/finance/accounts');
  33  |     await expect(page).toHaveURL(/\/login/);
  34  |   });
  35  | 
  36  |   test('parish admin can open finance overview and chart of accounts', async ({
  37  |     page,
  38  |     context,
  39  |     baseURL,
  40  |   }) => {
  41  |     test.skip(
  42  |       !(await isSupabaseAuthUp()),
  43  |       'Supabase auth stack not available (run `supabase start`)',
  44  |     );
  45  |     test.setTimeout(90_000);
  46  |     await injectAdmin(context, baseURL!);
  47  | 
  48  |     await page.goto('/finance');
  49  |     await expect(
  50  |       page.getByRole('heading', { name: /^finance$/i }),
  51  |     ).toBeVisible({ timeout: 20_000 });
  52  |     // Prefer the main content card link (sidebar also has the same title).
  53  |     await expect(
  54  |       page
  55  |         .locator('main')
  56  |         .getByRole('link', { name: /chart of accounts/i })
  57  |         .first(),
  58  |     ).toBeVisible();
  59  | 
  60  |     await page.goto('/finance/accounts');
  61  |     await expect(
  62  |       page.getByRole('heading', { name: /chart of accounts/i }),
  63  |     ).toBeVisible({ timeout: 20_000 });
  64  |     await expect(
  65  |       page.getByRole('button', { name: /seed default chart/i }),
  66  |     ).toBeVisible();
  67  | 
  68  |     await page.getByRole('button', { name: /seed default chart/i }).click();
  69  |     await expect(page.getByRole('table')).toBeVisible({ timeout: 20_000 });
  70  |     await expect(page.getByText('Operating Cash').first()).toBeVisible({
  71  |       timeout: 15_000,
  72  |     });
  73  |   });
  74  | 
  75  |   test('parish admin can open journal, periods, donations, approvals', async ({
  76  |     page,
  77  |     context,
  78  |     baseURL,
  79  |   }) => {
  80  |     test.skip(
  81  |       !(await isSupabaseAuthUp()),
  82  |       'Supabase auth stack not available (run `supabase start`)',
  83  |     );
  84  |     test.setTimeout(120_000);
  85  |     await injectAdmin(context, baseURL!);
  86  | 
  87  |     for (const [path, testId, heading] of [
  88  |       ['/finance/journal', 'finance-journal', /^journal$/i],
  89  |       ['/finance/periods', 'finance-periods', /accounting periods/i],
  90  |       ['/finance/donations', 'finance-donations', /^donations$/i],
  91  |       ['/finance/approvals', 'finance-approvals', /^approvals$/i],
  92  |     ] as const) {
> 93  |       await page.goto(path, { waitUntil: 'domcontentloaded' });
      |                  ^ Error: page.goto: net::ERR_CONNECTION_RESET at http://localhost:3000/finance/periods
  94  |       await expect(page.getByTestId(testId)).toBeVisible({ timeout: 25_000 });
  95  |       await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  96  |     }
  97  |   });
  98  | 
  99  |   test('member does not see Finance nav or ledger surfaces', async ({
  100 |     page,
  101 |     context,
  102 |     baseURL,
  103 |   }) => {
  104 |     test.skip(
  105 |       !(await isSupabaseAuthUp()),
  106 |       'Supabase auth stack not available (run `supabase start`)',
  107 |     );
  108 |     test.setTimeout(60_000);
  109 |     const { cookie } = await ensureMemberSession();
  110 |     await context.addCookies([
  111 |       { name: cookie.name, value: cookie.value, url: baseURL! },
  112 |     ]);
  113 | 
  114 |     await page.goto('/app');
  115 |     await expect(
  116 |       page.locator('[data-sidebar="menu"]').getByRole('link', {
  117 |         name: /^finance overview$/i,
  118 |       }),
  119 |     ).toHaveCount(0);
  120 |     await expect(
  121 |       page.locator('[data-sidebar="menu"]').getByRole('link', {
  122 |         name: /chart of accounts/i,
  123 |       }),
  124 |     ).toHaveCount(0);
  125 | 
  126 |     await page.goto('/finance/accounts', { waitUntil: 'domcontentloaded' });
  127 |     await expect(page).toHaveURL(/\/app$/);
  128 |     await expect(page.getByRole('heading', { name: /finance/i })).toHaveCount(0);
  129 |   });
  130 | 
  131 |   test('diocese finance is aggregate-only and axe clean', async ({
  132 |     page,
  133 |     context,
  134 |     baseURL,
  135 |   }) => {
  136 |     test.skip(
  137 |       !(await isSupabaseAuthUp()),
  138 |       'Supabase auth stack not available (run `supabase start`)',
  139 |     );
  140 |     test.setTimeout(60_000);
  141 |     const { cookie } = await ensureDioceseAdminSession();
  142 |     await context.addCookies([
  143 |       { name: cookie.name, value: cookie.value, url: baseURL! },
  144 |     ]);
  145 | 
  146 |     await page.goto('/diocese/finance', { waitUntil: 'domcontentloaded' });
  147 |     await expect(
  148 |       page.getByRole('heading', { name: /diocese finance/i }),
  149 |     ).toBeVisible({ timeout: 20_000 });
  150 |     await expect(page.getByText('Summary only', { exact: true })).toBeVisible();
  151 |     await expect(page.locator('main a[href^="/finance"]')).toHaveCount(0);
  152 | 
  153 |     await page.goto('/finance', { waitUntil: 'domcontentloaded' });
  154 |     await expect(page).toHaveURL(/\/diocese\/finance$/);
  155 |     await expect(
  156 |       page.getByRole('heading', { name: /diocese finance/i }),
  157 |     ).toBeVisible();
  158 | 
  159 |     const results = await new AxeBuilder({ page }).analyze();
  160 |     const serious = results.violations.filter((violation) =>
  161 |       ['serious', 'critical'].includes(violation.impact ?? ''),
  162 |     );
  163 |     expect(serious).toEqual([]);
  164 |   });
  165 | });
  166 | 
  167 | test.describe('R5 — finance a11y', () => {
  168 |   test.beforeEach(async ({ context, baseURL }) => {
  169 |     test.skip(
  170 |       !(await isSupabaseAuthUp()),
  171 |       'Supabase auth stack not available (run `supabase start`)',
  172 |     );
  173 |     await injectAdmin(context, baseURL!);
  174 |   });
  175 | 
  176 |   for (const [path, heading] of [
  177 |     ['/finance', /^finance$/i],
  178 |     ['/finance/accounts', /chart of accounts/i],
  179 |     ['/finance/journal', /^journal$/i],
  180 |     ['/finance/periods', /accounting periods/i],
  181 |     ['/finance/donations', /^donations$/i],
  182 |     ['/finance/approvals', /^approvals$/i],
  183 |   ] as const) {
  184 |     test(`${path} has no serious axe violations`, async ({ page }) => {
  185 |       test.setTimeout(60_000);
  186 |       await page.goto(path, { waitUntil: 'domcontentloaded' });
  187 |       await expect(page.getByRole('heading', { name: heading })).toBeVisible({
  188 |         timeout: 20_000,
  189 |       });
  190 |       const results = await new AxeBuilder({ page }).analyze();
  191 |       const serious = results.violations.filter((v) =>
  192 |         ['serious', 'critical'].includes(v.impact ?? ''),
  193 |       );
```