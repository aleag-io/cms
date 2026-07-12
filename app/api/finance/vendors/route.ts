import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { handle } from '@/lib/api';
import { requireNonEmptyString } from '@/lib/finance/validate';

const ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.DIOCESE_STAFF,
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
] as const;

export const GET = () =>
  handle(async () => {
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const vendors = await withTenant(claims, (tx) =>
      tx.vendor.findMany({
        where: { dioceseId: claims.app_metadata.diocese_id! },
        orderBy: { name: 'asc' },
        take: 500,
      }),
    );
    return Response.json({ ok: true, vendors });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const body = (await request.json()) as Record<string, unknown>;
    const name = requireNonEmptyString('name', body.name);
    const parishId =
      body.scope === 'diocese' ? null : claims.app_metadata.parish_id;

    const vendor = await withTenant(claims, (tx) =>
      tx.vendor.create({
        data: {
          dioceseId: claims.app_metadata.diocese_id!,
          parishId,
          name,
          email: typeof body.email === 'string' ? body.email.trim() || null : null,
          phone: typeof body.phone === 'string' ? body.phone.trim() || null : null,
          address:
            typeof body.address === 'string' ? body.address.trim() || null : null,
          taxId: typeof body.taxId === 'string' ? body.taxId.trim() || null : null,
        },
      }),
    );

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.vendor.create',
      entityType: 'finance_vendor',
      entityId: vendor.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: claims.app_metadata.diocese_id!,
      parishId,
      metadata: { name },
    });

    return Response.json({ ok: true, vendor }, { status: 201 });
  });
