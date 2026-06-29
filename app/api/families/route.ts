import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { requireRole, claimsFromUser } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { formatFamilyNumber } from '@/lib/member-identifier';

function requireParishId(parishId: string | null): string {
  if (!parishId) throw new ApiError(400, 'Parish scope required');
  return parishId;
}

export const GET = () =>
  handle(async () => {
    const actor = await requireRole([
      Role.DIOCESE_ADMIN,
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
      Role.MEMBER,
    ]);
    const parishId = requireParishId(actor.parishId);
    const claims = claimsFromUser(actor);

    const families = await withTenant(claims, (tx) =>
      tx.family.findMany({
        where: { parishId },
        orderBy: { familyNumber: 'asc' },
      }),
    );

    return Response.json({ ok: true, families });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([
      Role.DIOCESE_ADMIN,
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
    ]);
    const parishId = requireParishId(actor.parishId);
    const claims = claimsFromUser(actor);

    const body = (await request.json()) as {
      familyName?: string;
      familyNumber?: string;
      primaryContactEmail?: string;
      primaryContactPhone?: string;
      address?: string;
    };

    const familyName = body.familyName?.trim();
    if (!familyName) throw new ApiError(400, 'familyName is required');

    // Auto-generate familyNumber from the parish scheme if not provided.
    let familyNumber = body.familyNumber?.trim();

    const family = await withTenant(claims, async (tx) => {
      if (!familyNumber) {
        // Read parish scheme + current count to derive the next number.
        const parish = await tx.parish.findUniqueOrThrow({
          where: { id: parishId },
          select: {
            familyNumberPrefix: true,
            familyNumberWidth: true,
            familyNumberStart: true,
          },
        });
        const lastFamily = await tx.family.findFirst({
          where: { parishId },
          orderBy: { createdAt: 'desc' },
        });
        const sequence = lastFamily
          ? (parseInt(
              lastFamily.familyNumber.replace(parish.familyNumberPrefix, ''),
              10,
            ) || parish.familyNumberStart - 1) + 1
          : parish.familyNumberStart;

        familyNumber = formatFamilyNumber(sequence, {
          prefix: parish.familyNumberPrefix,
          digitWidth: parish.familyNumberWidth,
          startAt: parish.familyNumberStart,
        });
      }

      return tx.family.create({
        data: {
          dioceseId: actor.dioceseId,
          parishId,
          familyName,
          familyNumber: familyNumber!,
          primaryContactEmail: body.primaryContactEmail?.trim() || null,
          primaryContactPhone: body.primaryContactPhone?.trim() || null,
          address: body.address?.trim() || null,
        },
      });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'membership.family.create',
      entityType: 'family',
      entityId: family.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId,
      metadata: { familyNumber: family.familyNumber },
    });

    return Response.json({ ok: true, family });
  });
