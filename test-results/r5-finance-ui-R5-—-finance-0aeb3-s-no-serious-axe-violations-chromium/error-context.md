# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: r5-finance-ui.test.ts >> R5 — finance a11y >> /finance/journal has no serious axe violations
- Location: tests\e2e\r5-finance-ui.test.ts:185:9

# Error details

```
Error: page.goto: net::ERR_CONNECTION_RESET at http://localhost:3000/finance/journal
Call log:
  - navigating to "http://localhost:3000/finance/journal", waiting until "domcontentloaded"

```

# Test source

```ts
  87  |     for (const [path, testId, heading] of [
  88  |       ['/finance/journal', 'finance-journal', /^journal$/i],
  89  |       ['/finance/periods', 'finance-periods', /accounting periods/i],
  90  |       ['/finance/donations', 'finance-donations', /^donations$/i],
  91  |       ['/finance/approvals', 'finance-approvals', /^approvals$/i],
  92  |     ] as const) {
  93  |       await page.goto(path, { waitUntil: 'domcontentloaded' });
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
  153 |     // Axe the aggregate surface itself — the subject of this test.
  154 |     const results = await new AxeBuilder({ page }).analyze();
  155 |     const serious = results.violations.filter((violation) =>
  156 |       ['serious', 'critical'].includes(violation.impact ?? ''),
  157 |     );
  158 |     expect(serious).toEqual([]);
  159 | 
  160 |     // /finance is the diocese's OWN standalone ledger (see the doc comment on
  161 |     // app/(app)/finance/layout.tsx): a diocese-scoped user stays there rather
  162 |     // than being bounced to the cross-parish aggregate.
  163 |     await page.goto('/finance', { waitUntil: 'domcontentloaded' });
  164 |     await expect(page).toHaveURL(/\/finance(\?|$)/);
  165 |   });
  166 | });
  167 | 
  168 | test.describe('R5 — finance a11y', () => {
  169 |   test.beforeEach(async ({ context, baseURL }) => {
  170 |     test.skip(
  171 |       !(await isSupabaseAuthUp()),
  172 |       'Supabase auth stack not available (run `supabase start`)',
  173 |     );
  174 |     await injectAdmin(context, baseURL!);
  175 |   });
  176 | 
  177 |   for (const [path, heading] of [
  178 |     ['/finance', /^finance$/i],
  179 |     ['/finance/accounts', /chart of accounts/i],
  180 |     ['/finance/journal', /^journal$/i],
  181 |     ['/finance/periods', /accounting periods/i],
  182 |     ['/finance/donations', /^donations$/i],
  183 |     ['/finance/approvals', /^approvals$/i],
  184 |   ] as const) {
  185 |     test(`${path} has no serious axe violations`, async ({ page }) => {
  186 |       test.setTimeout(60_000);
> 187 |       await page.goto(path, { waitUntil: 'domcontentloaded' });
      |                  ^ Error: page.goto: net::ERR_CONNECTION_RESET at http://localhost:3000/finance/journal
  188 |       await expect(page.getByRole('heading', { name: heading })).toBeVisible({
  189 |         timeout: 20_000,
  190 |       });
  191 |       const results = await new AxeBuilder({ page }).analyze();
  192 |       const serious = results.violations.filter((v) =>
  193 |         ['serious', 'critical'].includes(v.impact ?? ''),
  194 |       );
  195 |       expect(serious).toEqual([]);
  196 |     });
  197 |   }
  198 | });
  199 | 
```