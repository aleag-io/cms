import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { handle } from '@/lib/api';
import { optionalUuid, requireNonEmptyString } from '@/lib/finance/validate';

const ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.DIOCESE_STAFF,
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
] as const;

const opt = (v: unknown) => (typeof v === 'string' ? v.trim() || null : null);

export const GET = (request: Request) =>
  handle(async () => {
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const url = new URL(request.url);
    const q = url.searchParams.get('q');
    const donors = await withTenant(claims, (tx) =>
      tx.externalDonor.findMany({
        where: {
          dioceseId: claims.app_metadata.diocese_id!,
          isActive: true,
          ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
        },
        orderBy: { name: 'asc' },
        take: 500,
      }),
    );
    return Response.json({ ok: true, donors });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const body = (await request.json()) as Record<string, unknown>;
    const name = requireNonEmptyString('name', body.name);
    const parishId = body.scope === 'diocese' ? null : claims.app_metadata.parish_id;

    const donor = await withTenant(claims, (tx) =>
      tx.externalDonor.create({
        data: {
          dioceseId: claims.app_metadata.diocese_id!,
          parishId,
          name,
          email: opt(body.email),
          phone: opt(body.phone),
          address: opt(body.address),
          notes: opt(body.notes),
          linkedFamilyId: optionalUuid('linkedFamilyId', body.linkedFamilyId),
        },
      }),
    );

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.externaldonor.create',
      entityType: 'finance_external_donor',
      entityId: donor.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: claims.app_metadata.diocese_id!,
      parishId,
      metadata: { name },
    });

    return Response.json({ ok: true, donor }, { status: 201 });
  });
