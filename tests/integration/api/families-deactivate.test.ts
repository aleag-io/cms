/**
 * Integration tests for DELETE /api/families/[id] (soft-deactivate).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testDb, FX } from '../../helpers/db';
import { asUser, asGuest } from '../../helpers/auth';

let DELETE: (
  req: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;

async function loadRoute() {
  const mod = await import('@/app/api/families/[id]/route');
  DELETE = mod.DELETE;
}

describe('DELETE /api/families/[id]', () => {
  let resetAuth: () => void;

  beforeEach(async () => {
    await loadRoute();
  });

  afterEach(() => {
    resetAuth?.();
  });

  it('deactivates a family and writes an audit row as Parish Admin', async () => {
    const admin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAAdmin.id },
    });
    resetAuth = asUser(admin);

    const res = await DELETE(new Request('http://localhost/api/families/x'), {
      params: Promise.resolve({ id: FX.families.smithId }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.family.isActive).toBe(false);

    const row = await testDb.family.findUniqueOrThrow({
      where: { id: FX.families.smithId },
    });
    expect(row.isActive).toBe(false);

    const audit = await testDb.auditEntry.findFirst({
      where: {
        entityId: FX.families.smithId,
        action: 'membership.family.deactivate',
      },
      orderBy: { timestamp: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect(audit!.outcome).toBe('SUCCESS');
  });

  it('returns 409 when the family is already inactive', async () => {
    const admin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAAdmin.id },
    });
    resetAuth = asUser(admin);

    await testDb.family.update({
      where: { id: FX.families.smithId },
      data: { isActive: false },
    });

    const res = await DELETE(new Request('http://localhost/api/families/x'), {
      params: Promise.resolve({ id: FX.families.smithId }),
    });
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.ok).toBe(false);
  });

  it('returns 403 when called as Parish Staff', async () => {
    const staff = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAStaff.id },
    });
    resetAuth = asUser(staff);

    const res = await DELETE(new Request('http://localhost/api/families/x'), {
      params: Promise.resolve({ id: FX.families.smithId }),
    });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.ok).toBe(false);
  });

  it('returns 401 when called without a session', async () => {
    resetAuth = asGuest();

    const res = await DELETE(new Request('http://localhost/api/families/x'), {
      params: Promise.resolve({ id: FX.families.smithId }),
    });
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.ok).toBe(false);
  });

  it('returns 404 for a cross-parish family id', async () => {
    const admin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAAdmin.id },
    });
    resetAuth = asUser(admin);

    const res = await DELETE(new Request('http://localhost/api/families/x'), {
      params: Promise.resolve({ id: FX.families.jonesBId }),
    });
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.ok).toBe(false);
  });
});
