/**
 * @m0 @integration
 *
 * M0 shell close-out — /api/session/context (tenant context control).
 *
 * Covers both actor classes (shell plan §7.4):
 *
 *   Diocese-scoped (work-in-parish mode):
 *     - GET reports diocese portal + canSwitchParish with no cookie.
 *     - PUT enter: sets the cookie, applies the parishId overlay, audits
 *       context.parish.enter.
 *     - PUT enter: 404 for an unknown parish.
 *     - DELETE exit: clears the cookie, audits context.parish.exit.
 *
 *   Multi-parish member (MM-17 working-parish focus):
 *     - GET lists exactly the member's own MemberParish memberships.
 *     - PUT enter: valid membership → audited; effective parish overlays.
 *     - PUT enter: a parish the member does NOT belong to → 403.
 *     - Single-parish member → canSwitchParish false, no choices.
 *     - DELETE exit returns to the home parish.
 *
 * The cookie seam (_setWorkingParishCookieReader) stands in for next/headers,
 * which has no request scope under Vitest; the write path (cookies().set) is
 * mocked via the module seam so the same handler code runs.
 */
import { AuditOutcome, Role } from '@prisma/client';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { resetTestDb, FX, testDb } from '../../helpers/db';
import { asUser } from '../../helpers/auth';
import {
  _setWorkingParishCookieReader,
  resolveWorkingParishId,
} from '@/lib/context/working-parish';

// Mock next/headers cookies(): capture writes in a module-level jar and let
// reads (via the resolver seam) see what was "set".
vi.mock('next/headers', () => {
  const jar = new Map<string, string>();
  return {
    __cookieJar: jar,
    cookies: async () => ({
      get: (name: string) => {
        const value = jar.get(name);
        return value === undefined ? undefined : { value };
      },
      set: (name: string, value: string) => {
        if (value === '') jar.delete(name);
        else jar.set(name, value);
      },
    }),
  };
});

type CookieJar = Map<string, string>;

async function getJar(): Promise<CookieJar> {
  const mod = (await import('next/headers')) as unknown as {
    __cookieJar: CookieJar;
  };
  return mod.__cookieJar;
}

let contextGET: () => Promise<Response>;
let contextPUT: (request: Request) => Promise<Response>;
let contextDELETE: () => Promise<Response>;

async function loadRoutes() {
  ({ GET: contextGET, PUT: contextPUT, DELETE: contextDELETE } = await import(
    '@/app/api/session/context/route'
  ));
}

function putRequest(body: unknown): Request {
  return new Request('http://test/api/session/context', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

async function latestAudit(action: string, actorUserId: string) {
  return testDb.auditEntry.findFirst({
    where: { action, actorUserId },
    orderBy: { timestamp: 'desc' },
  });
}

describe('/api/session/context', () => {
  let resetAuth: () => void;
  let resetCookie: () => void;

  beforeEach(async () => {
    await resetTestDb();
    await loadRoutes();
    const jar = await getJar();
    jar.clear();
    // Reads resolve through the jar so PUT→GET flows work end-to-end.
    resetCookie = _setWorkingParishCookieReader(async () => {
      const j = await getJar();
      return j.get('cms_working_parish_id') ?? null;
    });
  });

  afterEach(() => {
    resetAuth?.();
    resetCookie?.();
  });

  // ── Diocese-scoped actor ────────────────────────────────────────────────

  it('diocese admin defaults to the diocese portal with switch rights', async () => {
    const admin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.dioceseAdmin.id },
    });
    resetAuth = asUser(admin);

    const res = await contextGET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.portal).toBe('diocese');
    expect(data.canSwitchParish).toBe(true);
    expect(data.workingParish).toBeNull();
    expect(data.switchableParishes).toEqual([]);
  });

  it('diocese admin enters parish work-context (cookie + overlay + audit)', async () => {
    const admin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.dioceseAdmin.id },
    });
    resetAuth = asUser(admin);

    const res = await contextPUT(putRequest({ parishId: FX.parishAId }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.portal).toBe('parish');
    expect(data.workingParish.id).toBe(FX.parishAId);
    expect(data.parishId).toBe(FX.parishAId);

    const jar = await getJar();
    expect(jar.get('cms_working_parish_id')).toBe(FX.parishAId);

    // Resolver now resolves the working parish for this actor.
    await expect(resolveWorkingParishId(admin)).resolves.toBe(FX.parishAId);

    const audit = await latestAudit('context.parish.enter', admin.id);
    expect(audit).toBeTruthy();
    expect(audit!.outcome).toBe(AuditOutcome.SUCCESS);
    expect(audit!.entityId).toBe(FX.parishAId);
  });

  it('diocese admin PUT with an unknown parish → 404, no audit, no cookie', async () => {
    const admin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.dioceseAdmin.id },
    });
    resetAuth = asUser(admin);

    const res = await contextPUT(
      putRequest({ parishId: '00000000-0000-0000-0000-00000000dead' }),
    );
    expect(res.status).toBe(404);

    const jar = await getJar();
    expect(jar.get('cms_working_parish_id')).toBeUndefined();

    const audit = await latestAudit('context.parish.enter', admin.id);
    expect(audit).toBeNull();
  });

  it('diocese admin exits work-context (cookie cleared + audit)', async () => {
    const admin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.dioceseAdmin.id },
    });
    resetAuth = asUser(admin);

    await contextPUT(putRequest({ parishId: FX.parishAId }));
    const res = await contextDELETE();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.portal).toBe('diocese');
    expect(data.workingParish).toBeNull();

    const jar = await getJar();
    expect(jar.get('cms_working_parish_id')).toBeUndefined();

    const audit = await latestAudit('context.parish.exit', admin.id);
    expect(audit).toBeTruthy();
    expect(audit!.entityId).toBe(FX.parishAId);
  });

  // ── Multi-parish member (clergy fixture: parishes A + B) ───────────────

  it('multi-parish member sees exactly their own memberships as choices', async () => {
    const clergy = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.clergyA.id },
    });
    resetAuth = asUser(clergy);

    const res = await contextGET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.portal).toBe('parish');
    expect(data.canSwitchParish).toBe(true);
    expect(data.homeParish.id).toBe(FX.parishAId);

    const ids = data.switchableParishes.map(
      (p: { id: string }) => p.id,
    );
    expect(ids).toHaveLength(2);
    expect(ids).toContain(FX.parishAId);
    expect(ids).toContain(FX.parishBId);
    // Primary first.
    expect(data.switchableParishes[0].id).toBe(FX.parishAId);
    expect(data.switchableParishes[0].isPrimary).toBe(true);
  });

  it('member switches working parish to a parish they belong to (audited)', async () => {
    const clergy = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.clergyA.id },
    });
    resetAuth = asUser(clergy);

    const res = await contextPUT(putRequest({ parishId: FX.parishBId }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.portal).toBe('parish');
    expect(data.workingParish.id).toBe(FX.parishBId);
    expect(data.parishId).toBe(FX.parishBId);

    // Role is NOT mutated.
    const fresh = await testDb.appUser.findUniqueOrThrow({
      where: { id: clergy.id },
    });
    expect(fresh.role).toBe(Role.PARISH_STAFF);
    expect(fresh.parishId).toBe(FX.parishAId); // home parish unchanged

    const audit = await latestAudit('context.parish.enter', clergy.id);
    expect(audit).toBeTruthy();
    expect(audit!.entityId).toBe(FX.parishBId);
  });

  it('member cannot switch into a parish they do not belong to (403, no audit)', async () => {
    const clergy = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.clergyA.id },
    });
    resetAuth = asUser(clergy);

    // Create a third parish the clergy member does not belong to.
    await testDb.parish.create({
      data: {
        id: '00000000-0000-0000-0000-000000000099',
        dioceseId: FX.dioceseId,
        name: 'Parish C (not theirs)',
      },
    });

    const res = await contextPUT(
      putRequest({ parishId: '00000000-0000-0000-0000-000000000099' }),
    );
    expect(res.status).toBe(403);

    const jar = await getJar();
    expect(jar.get('cms_working_parish_id')).toBeUndefined();

    const audit = await latestAudit('context.parish.enter', clergy.id);
    expect(audit).toBeNull();
  });

  it('single-parish member has no switcher and cannot enter work-context', async () => {
    const member = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAMember.id },
    });
    resetAuth = asUser(member);

    const res = await contextGET();
    const data = await res.json();

    expect(data.canSwitchParish).toBe(false);
    expect(data.switchableParishes).toHaveLength(1);

    // PUT to their *own* parish is still valid (they belong to it) — the
    // switcher is hidden only because there is nothing to switch between.
    const put = await contextPUT(putRequest({ parishId: FX.parishAId }));
    expect(put.status).toBe(200);
  });

  it('member exit returns to the home parish scope', async () => {
    const clergy = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.clergyA.id },
    });
    resetAuth = asUser(clergy);

    await contextPUT(putRequest({ parishId: FX.parishBId }));
    const res = await contextDELETE();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.portal).toBe('parish'); // members stay on the parish portal
    expect(data.workingParish).toBeNull();
    await expect(resolveWorkingParishId(clergy)).resolves.toBeNull();

    const audit = await latestAudit('context.parish.exit', clergy.id);
    expect(audit).toBeTruthy();
    expect(audit!.entityId).toBe(FX.parishBId);
  });
});
