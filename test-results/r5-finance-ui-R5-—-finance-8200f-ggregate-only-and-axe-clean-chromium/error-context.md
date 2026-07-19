# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: r5-finance-ui.test.ts >> R5 — finance UI >> diocese finance is aggregate-only and axe clean
- Location: tests\e2e\r5-finance-ui.test.ts:131:7

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/diocese\/finance$/
Received string:  "http://localhost:3000/finance?owner=diocese"
Timeout: 15000ms

Call log:
  - Expect "toHaveURL" with timeout 15000ms
    29 × unexpected value "http://localhost:3000/finance"
    4 × unexpected value "http://localhost:3000/finance?owner=diocese"

```

```yaml
- img
- paragraph: Mar Thoma CMS
- paragraph: Church Management System
- text: People
- list:
  - listitem:
    - link "Dashboard":
      - /url: /app
      - img
      - text: Dashboard
- text: Diocese
- list:
  - listitem:
    - link "Diocese Settings":
      - /url: /diocese/settings
      - img
      - text: Diocese Settings
  - listitem:
    - link "Parishes":
      - /url: /parishes
      - img
      - text: Parishes
  - listitem:
    - link "Diocese Users":
      - /url: /diocese/users
      - img
      - text: Diocese Users
  - listitem:
    - link "Aggregate":
      - /url: /diocese/aggregate
      - img
      - text: Aggregate
  - listitem:
    - link "Liturgical calendar":
      - /url: /diocese/liturgical
      - img
      - text: Liturgical calendar
  - listitem:
    - link "Reports":
      - /url: /reports
      - img
      - text: Reports
- text: Sharing
- list:
  - listitem:
    - link "Sharing":
      - /url: /sharing
      - img
      - text: Sharing
- text: Administration
- list:
  - listitem:
    - link "Audit Log":
      - /url: /audit
      - img
      - text: Audit Log
- text: Finance
- list:
  - listitem:
    - link "Finance Overview":
      - /url: /finance
      - img
      - text: Finance Overview
  - listitem:
    - link "Chart of Accounts":
      - /url: /finance/accounts
      - img
      - text: Chart of Accounts
  - listitem:
    - link "Journal":
      - /url: /finance/journal
      - img
      - text: Journal
  - listitem:
    - link "Periods":
      - /url: /finance/periods
      - img
      - text: Periods
  - listitem:
    - link "Donations":
      - /url: /finance/donations
      - img
      - text: Donations
  - listitem:
    - link "Batches":
      - /url: /finance/batches
      - img
      - text: Batches
  - listitem:
    - link "Giving Categories":
      - /url: /finance/giving-categories
      - img
      - text: Giving Categories
  - listitem:
    - link "Approvals":
      - /url: /finance/approvals
      - img
      - text: Approvals
  - listitem:
    - link "Campaigns":
      - /url: /finance/campaigns
      - img
      - text: Campaigns
  - listitem:
    - link "Pledges":
      - /url: /finance/pledges
      - img
      - text: Pledges
  - listitem:
    - link "Vendors":
      - /url: /finance/vendors
      - img
      - text: Vendors
  - listitem:
    - link "Bills & Payments":
      - /url: /finance/bills
      - img
      - text: Bills & Payments
  - listitem:
    - link "Budgets":
      - /url: /finance/budgets
      - img
      - text: Budgets
  - listitem:
    - link "Reconciliation":
      - /url: /finance/reconciliation
      - img
      - text: Reconciliation
  - listitem:
    - link "Giving Statements":
      - /url: /finance/giving-statements
      - img
      - text: Giving Statements
  - listitem:
    - link "Financial Reports":
      - /url: /finance/reports
      - img
      - text: Financial Reports
  - listitem:
    - link "Approval Policies":
      - /url: /diocese/finance/policies
      - img
      - text: Approval Policies
- button "ED E2E Diocese Admin DIOCESE ADMIN":
  - text: ED E2E Diocese Admin DIOCESE ADMIN
  - img
- main:
  - button "Toggle Sidebar":
    - img
    - text: Toggle Sidebar
  - navigation "breadcrumb":
    - list:
      - listitem:
        - link "Home":
          - /url: /app
      - listitem:
        - link "Finance Overview" [disabled]
  - button "Diocese context":
    - img
    - text: Diocese context
    - img
  - main:
    - heading "Finance" [level=1]
    - paragraph: Ledger, approvals, periods, and giving for the selected book. Database policies remain the source of truth for every owner scope.
    - img
    - text: Diocese general ledger
    - link "Chart of Accounts Funds and ledger accounts":
      - /url: /finance/accounts?owner=diocese
      - img
      - text: Chart of Accounts Funds and ledger accounts
    - link "Journal Review postings and reversals":
      - /url: /finance/journal?owner=diocese
      - img
      - text: Journal Review postings and reversals
    - link "Accounting Periods Review open and closed periods":
      - /url: /finance/periods?owner=diocese
      - img
      - text: Accounting Periods Review open and closed periods
    - link "Donations Review gifts and attribution":
      - /url: /finance/donations
      - img
      - text: Donations Review gifts and attribution
    - link "Approvals Maker-checker request queue":
      - /url: /finance/approvals?owner=diocese
      - img
      - text: Approvals Maker-checker request queue
- region "Notifications alt+T"
- alert
```

# Test source

```ts
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
  153 |     await page.goto('/finance', { waitUntil: 'domcontentloaded' });
> 154 |     await expect(page).toHaveURL(/\/diocese\/finance$/);
      |                        ^ Error: expect(page).toHaveURL(expected) failed
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
  194 |       expect(serious).toEqual([]);
  195 |     });
  196 |   }
  197 | });
  198 | 
```