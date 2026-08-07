/**
 * M0 shell close-out E2E — tenant context & portal scope (shell plan §7.7).
 *
 * Acceptance journey:
 *   1. Parish Admin: no Diocese chrome anywhere; direct URL to a diocese route
 *      is blocked by the role guard (load fails, no aggregate data).
 *   2. Diocese Admin: defaults to the diocese portal (no parish-ops nav);
 *      enters Parish X via the switcher → parish-portal nav only + chip shows
 *      the parish; exit returns to the diocese portal.
 *   3. Multi-parish member (MM-17): switcher lists only their own parishes;
 *      switching re-scopes the directory; a foreign parish never appears.
 *   4. Report Viewer: may enter work-context but write affordances stay hidden.
 *   5. axe gate on the switcher dropdown.
 *
 * Requires the full Supabase auth stack; self-skips otherwise.
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  ensureAdminSession,
  ensureDioceseAdminSession,
  ensureMultiParishMemberSession,
  ensureReportViewerSession,
  isSupabaseAuthUp,
  parishAName,
} from './helpers/auth';

type Cookie = { name: string; value: string };

async function inject(
  context: import('@playwright/test').BrowserContext,
  baseURL: string,
  cookie: Cookie,
) {
  await context.addCookies([{ name: cookie.name, value: cookie.value, url: baseURL }]);
}

async function openSwitcher(page: Page) {
  await page.getByTestId('tenant-context-switcher').click();
}

test.describe('M0 — tenant context & portal scope', () => {
  test.beforeEach(async () => {
    test.skip(
      !(await isSupabaseAuthUp()),
      'Supabase auth stack not available (run `supabase start`)',
    );
  });

  test('parish admin sees no diocese chrome and diocese URLs are blocked', async ({
    context,
    page,
    baseURL,
  }) => {
    const { cookie } = await ensureAdminSession();
    await inject(context, baseURL!, cookie);

    await page.goto('/app');
    await expect(page.getByTestId('tenant-context-label')).toBeVisible();

    // No Diocese section in the sidebar; no diocese destinations.
    const sidebar = page.locator('[data-slot="sidebar"]').first();
    await expect(sidebar.getByText('Diocese', { exact: true })).toHaveCount(0);
    for (const href of ['/diocese/aggregate', '/diocese/settings', '/parishes']) {
      await expect(
        sidebar.locator(`a[href="${href}"]`),
        `no nav link to ${href}`,
      ).toHaveCount(0);
    }

    // Direct URL to a diocese-only route: the page-level guard renders a
    // forbidden state, never aggregate content.
    await page.goto('/diocese/aggregate');
    await expect(page.getByText(/access restricted/i)).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(/parish portfolio|member summary/i)).toHaveCount(0);
  });

  test('diocese admin defaults to diocese portal, enters and exits parish context', async ({
    context,
    page,
    baseURL,
  }) => {
    const { cookie } = await ensureDioceseAdminSession();
    await inject(context, baseURL!, cookie);

    await page.goto('/app');
    // Default: diocese portal — switcher shows Diocese context, no parish-ops nav.
    const sidebar = page.locator('[data-slot="sidebar"]').first();
    await expect(page.getByTestId('tenant-context-switcher')).toHaveText(
      /diocese context/i,
    );
    await expect(sidebar.locator('a[href="/programs"]')).toHaveCount(0);
    await expect(sidebar.locator('a[href="/members"]')).toHaveCount(0);
    // And the diocese dashboard never links into parish-ops member pages.
    await expect(page.locator('main a[href^="/members/"]')).toHaveCount(0);
    await expect(page.locator('main a[href="/members"]')).toHaveCount(0);

    // Enter parish work-context.
    await openSwitcher(page);
    const parishName = await parishAName();
    await page.getByRole('menuitem', { name: parishName }).click();
    await expect(page.getByTestId('tenant-context-switcher')).toHaveText(
      new RegExp(parishName.replace(/[()]/g, '.'), 'i'),
      { timeout: 15000 },
    );

    // Parish portal: parish-ops nav appears, diocese-only items hidden.
    await expect(sidebar.locator('a[href="/members"]')).toBeVisible();
    await expect(sidebar.locator('a[href="/diocese/aggregate"]')).toHaveCount(0);

    // Exit back to the diocese portal.
    await openSwitcher(page);
    await page.getByRole('menuitem', { name: /diocese \(all parishes\)/i }).click();
    await expect(page.getByTestId('tenant-context-switcher')).toHaveText(
      /diocese context/i,
      { timeout: 15000 },
    );
    await expect(sidebar.locator('a[href="/diocese/aggregate"]')).toBeVisible();
  });

  test('multi-parish member switches working parish; directory re-scopes', async ({
    context,
    page,
    baseURL,
  }) => {
    const session = await ensureMultiParishMemberSession();
    await inject(context, baseURL!, session.cookie);

    await page.goto('/app');
    await expect(page.getByTestId('tenant-context-switcher')).toHaveText(
      new RegExp(session.parishAName.replace(/[()]/g, '.'), 'i'),
    );

    // Switcher lists exactly the member's own parishes.
    await openSwitcher(page);
    await expect(
      page.getByRole('menuitem', { name: new RegExp(session.parishAName.replace(/[()]/g, '.')) }),
    ).toBeVisible();
    await expect(
      page.getByRole('menuitem', { name: new RegExp(session.parishBName.replace(/[()]/g, '.')) }),
    ).toBeVisible();
    await expect(
      page.getByRole('menuitem', { name: /diocese \(all parishes\)/i }),
    ).toHaveCount(0);

    // Home parish directory: the parish-B-only member is absent.
    await page.goto('/directory');
    const dirList = page.getByTestId('directory-list');
    await expect(page.getByTestId('directory-member').first()).toBeVisible();
    await expect(dirList.getByText('Zebulon')).toHaveCount(0);

    // Switch to parish B → directory re-scopes and shows the B-only member.
    await openSwitcher(page);
    await page
      .getByRole('menuitem', { name: new RegExp(session.parishBName.replace(/[()]/g, '.')) })
      .click();
    await expect(page.getByTestId('tenant-context-switcher')).toHaveText(
      new RegExp(session.parishBName.replace(/[()]/g, '.'), 'i'),
      { timeout: 15000 },
    );

    await page.goto('/directory');
    const dirListB = page.getByTestId('directory-list');
    await expect(dirListB.getByText('Zebulon')).toBeVisible({ timeout: 15000 });
    // Eve (a parish-A-only member from the shared E2E seed) is out of scope.
    await expect(dirListB.getByText(/\bEve\b/)).toHaveCount(0);
  });

  test('report viewer can enter work-context but write affordances stay hidden', async ({
    context,
    page,
    baseURL,
  }) => {
    const { cookie } = await ensureReportViewerSession();
    await inject(context, baseURL!, cookie);

    await page.goto('/app');
    await expect(page.getByTestId('tenant-context-switcher')).toHaveText(
      /diocese context/i,
    );

    // Report viewers may list parishes (diocese portal structural read), so
    // the switcher offers the portfolio.
    await openSwitcher(page);
    const parishName = await parishAName();
    const item = page.getByRole('menuitem', {
      name: new RegExp(parishName.replace(/[()]/g, '.')),
    });
    await expect(item).toBeVisible();
    await item.click();

    // Work-context entered → parish-portal nav (member-level read surfaces).
    await expect(page.getByTestId('tenant-context-switcher')).toHaveText(
      new RegExp(parishName.replace(/[()]/g, '.'), 'i'),
      { timeout: 15000 },
    );

    // Read surfaces are reachable; write affordances are not rendered. The
    // directory for a report viewer in work-context resolves to member scope
    // (elevated MEMBER role), so it loads without a 403 abort.
    await page.goto('/directory');
    await expect(
      page.getByRole('heading', { name: /parish member directory/i }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/load failed/i)).toHaveCount(0);

    await page.goto('/members');
    await expect(
      page.getByRole('link', { name: /add member/i }),
    ).toHaveCount(0);
  });

  test('switcher dropdown has no serious axe violations', async ({
    context,
    page,
    baseURL,
  }) => {
    // Diocese admin for the interactive dropdown axe pass.
    const admin = await ensureDioceseAdminSession();
    await inject(context, baseURL!, admin.cookie);
    await page.goto('/app');
    await openSwitcher(page);
    await expect(
      page.getByRole('menuitem', { name: /diocese \(all parishes\)/i }),
    ).toBeVisible();

    // Scope the audit to the open dropdown menu. Opening a Radix modal
    // dropdown applies inert/aria-hidden to the rest of the shell (including
    // the sidebar), which trips a pre-existing aria-hidden-focus condition
    // unrelated to this control.
    const menu = page.getByRole('menu');
    const results = await new AxeBuilder({ page })
      .include('[role="menu"]')
      .analyze();
    await expect(menu).toBeVisible();
    const serious = results.violations.filter((v) =>
      ['serious', 'critical'].includes(v.impact ?? ''),
    );
    expect(serious).toEqual([]);
  });
});
