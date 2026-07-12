# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: r5-finance-ui.test.ts >> R5 — finance a11y >> /finance/accounts has no serious axe violations
- Location: tests/e2e/r5-finance-ui.test.ts:184:9

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  -  1
+ Received  + 58

- Array []
+ Array [
+   Object {
+     "description": "Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds",
+     "help": "Elements must meet minimum color contrast ratio thresholds",
+     "helpUrl": "https://dequeuniversity.com/rules/axe/4.12/color-contrast?application=playwright",
+     "id": "color-contrast",
+     "impact": "serious",
+     "nodes": Array [
+       Object {
+         "all": Array [],
+         "any": Array [
+           Object {
+             "data": Object {
+               "bgColor": "#ffffff",
+               "contrastRatio": 3.69,
+               "expectedContrastRatio": "4.5:1",
+               "fgColor": "#858585",
+               "fontSize": "9.0pt (12px)",
+               "fontWeight": "normal",
+               "messageKey": null,
+             },
+             "id": "color-contrast",
+             "impact": "serious",
+             "message": "Element has insufficient color contrast of 3.69 (foreground color: #858585, background color: #ffffff, font size: 9.0pt (12px), font weight: normal). Expected contrast ratio of 4.5:1",
+             "relatedNodes": Array [
+               Object {
+                 "html": "<header class=\"flex flex-col gap-3 border-b bg-background px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6\">",
+                 "target": Array [
+                   ".gap-3",
+                 ],
+               },
+             ],
+           },
+         ],
+         "failureSummary": "Fix any of the following:
+   Element has insufficient color contrast of 3.69 (foreground color: #858585, background color: #ffffff, font size: 9.0pt (12px), font weight: normal). Expected contrast ratio of 4.5:1",
+         "html": "<button data-slot=\"button\" data-variant=\"outline\" data-size=\"default\" class=\"group/button inline-...\" type=\"button\">",
+         "impact": "serious",
+         "none": Array [],
+         "target": Array [
+           ".hover\\:bg-input\\/50",
+         ],
+       },
+     ],
+     "tags": Array [
+       "cat.color",
+       "wcag2aa",
+       "wcag143",
+       "TTv5",
+       "TT13.c",
+       "EN-301-549",
+       "EN-9.1.4.3",
+       "ACT",
+       "RGAAv4",
+       "RGAA-3.2.1",
+     ],
+   },
+ ]
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e5]:
      - generic [ref=e7]:
        - img [ref=e9]
        - generic [ref=e11]:
          - paragraph [ref=e12]: Mar Thoma CMS
          - paragraph [ref=e13]: Church Management System
      - generic [ref=e14]:
        - generic [ref=e15]:
          - generic [ref=e16]: People
          - list [ref=e18]:
            - listitem [ref=e19]:
              - link "Dashboard" [ref=e20] [cursor=pointer]:
                - /url: /app
                - img [ref=e21]
                - generic [ref=e23]: Dashboard
            - listitem [ref=e24]:
              - link "Directory" [ref=e25] [cursor=pointer]:
                - /url: /directory
                - img [ref=e26]
                - generic [ref=e28]: Directory
            - listitem [ref=e29]:
              - link "Registrations" [ref=e30] [cursor=pointer]:
                - /url: /registrations
                - img [ref=e31]
                - generic [ref=e33]: Registrations
            - listitem [ref=e34]:
              - link "Members" [ref=e35] [cursor=pointer]:
                - /url: /members
                - img [ref=e36]
                - generic [ref=e38]: Members
            - listitem [ref=e39]:
              - link "Families" [ref=e40] [cursor=pointer]:
                - /url: /families
                - img [ref=e41]
                - generic [ref=e43]: Families
            - listitem [ref=e44]:
              - link "Sacramental register" [ref=e45] [cursor=pointer]:
                - /url: /sacramental-records
                - img [ref=e46]
                - generic [ref=e48]: Sacramental register
        - generic [ref=e49]:
          - generic [ref=e50]: Parish
          - list [ref=e52]:
            - listitem [ref=e53]:
              - link "Programs" [ref=e54] [cursor=pointer]:
                - /url: /programs
                - img [ref=e55]
                - generic [ref=e57]: Programs
            - listitem [ref=e58]:
              - link "Organizations" [ref=e59] [cursor=pointer]:
                - /url: /organizations
                - img [ref=e60]
                - generic [ref=e62]: Organizations
            - listitem [ref=e63]:
              - link "Events" [ref=e64] [cursor=pointer]:
                - /url: /events
                - img [ref=e65]
                - generic [ref=e67]: Events
            - listitem [ref=e68]:
              - link "Facilities" [ref=e69] [cursor=pointer]:
                - /url: /facilities
                - img [ref=e70]
                - generic [ref=e72]: Facilities
            - listitem [ref=e73]:
              - link "Messages" [ref=e74] [cursor=pointer]:
                - /url: /messages
                - img [ref=e75]
                - generic [ref=e77]: Messages
        - generic [ref=e78]:
          - generic [ref=e79]: Sharing
          - list [ref=e81]:
            - listitem [ref=e82]:
              - link "Sharing" [ref=e83] [cursor=pointer]:
                - /url: /sharing
                - img [ref=e84]
                - generic [ref=e86]: Sharing
        - generic [ref=e87]:
          - generic [ref=e88]: Administration
          - list [ref=e90]:
            - listitem [ref=e91]:
              - link "Parish Settings" [ref=e92] [cursor=pointer]:
                - /url: /settings/parish
                - img [ref=e93]
                - generic [ref=e95]: Parish Settings
            - listitem [ref=e96]:
              - link "Officers" [ref=e97] [cursor=pointer]:
                - /url: /settings/officers
                - img [ref=e98]
                - generic [ref=e100]: Officers
            - listitem [ref=e101]:
              - link "Parish Users" [ref=e102] [cursor=pointer]:
                - /url: /settings/users
                - img [ref=e103]
                - generic [ref=e105]: Parish Users
            - listitem [ref=e106]:
              - link "Permissions" [ref=e107] [cursor=pointer]:
                - /url: /settings/permissions
                - img [ref=e108]
                - generic [ref=e110]: Permissions
            - listitem [ref=e111]:
              - link "Audit Log" [ref=e112] [cursor=pointer]:
                - /url: /audit
                - img [ref=e113]
                - generic [ref=e115]: Audit Log
        - generic [ref=e116]:
          - generic [ref=e117]: Finance
          - list [ref=e119]:
            - listitem [ref=e120]:
              - link "Finance Overview" [ref=e121] [cursor=pointer]:
                - /url: /finance
                - img [ref=e122]
                - generic [ref=e124]: Finance Overview
            - listitem [ref=e125]:
              - link "Chart of Accounts" [ref=e126] [cursor=pointer]:
                - /url: /finance/accounts
                - img [ref=e127]
                - generic [ref=e129]: Chart of Accounts
            - listitem [ref=e130]:
              - link "Journal" [ref=e131] [cursor=pointer]:
                - /url: /finance/journal
                - img [ref=e132]
                - generic [ref=e134]: Journal
            - listitem [ref=e135]:
              - link "Periods" [ref=e136] [cursor=pointer]:
                - /url: /finance/periods
                - img [ref=e137]
                - generic [ref=e139]: Periods
            - listitem [ref=e140]:
              - link "Donations" [ref=e141] [cursor=pointer]:
                - /url: /finance/donations
                - img [ref=e142]
                - generic [ref=e144]: Donations
            - listitem [ref=e145]:
              - link "Approvals" [ref=e146] [cursor=pointer]:
                - /url: /finance/approvals
                - img [ref=e147]
                - generic [ref=e149]: Approvals
      - button "EA E2E Admin PARISH ADMIN" [ref=e151]:
        - generic [ref=e153]: EA
        - generic [ref=e154]:
          - generic [ref=e155]: E2E Admin
          - generic [ref=e156]: PARISH ADMIN
        - img
    - main [ref=e157]:
      - generic [ref=e158]:
        - generic [ref=e159]:
          - button "Toggle Sidebar" [ref=e160]:
            - img
            - generic [ref=e161]: Toggle Sidebar
          - navigation "breadcrumb" [ref=e163]:
            - list [ref=e164]:
              - listitem [ref=e165]:
                - link "Home" [ref=e166] [cursor=pointer]:
                  - /url: /app
              - listitem [ref=e167]:
                - img [ref=e168]
              - listitem [ref=e170]:
                - link "Chart of Accounts" [disabled] [ref=e171]
          - generic [ref=e172]:
            - img [ref=e173]
            - text: St. Thomas Parish (Parish A)
        - main [ref=e175]:
          - generic [ref=e177]:
            - generic [ref=e178]:
              - heading "Chart of Accounts" [level=1] [ref=e179]
              - paragraph [ref=e180]: Accounts are grouped by type and scoped to the selected ledger. Organization oversight remains read-only for parish administrators.
            - generic [ref=e181]:
              - generic [ref=e183]:
                - img
                - text: Parish general ledger
              - button "Seed default chart" [ref=e184]:
                - img
                - text: Seed default chart
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e200] [cursor=pointer]:
    - img [ref=e201]
  - alert [ref=e204]
```

# Test source

```ts
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
> 194 |       expect(serious).toEqual([]);
      |                       ^ Error: expect(received).toEqual(expected) // deep equality
  195 |     });
  196 |   }
  197 | });
  198 | 
```