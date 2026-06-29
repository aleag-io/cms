import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { requireRole, requireSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

function requireParishScope(
  parishId: string | null,
): asserts parishId is string {
  if (!parishId) throw new ApiError(400, 'Parish scope required');
}

export const GET = () =>
  handle(async () => {
    const user = await requireSessionUser();
    requireParishScope(user.parishId);

    const families = await prisma.family.findMany({
      where: { dioceseId: user.dioceseId, parishId: user.parishId },
      orderBy: { familyNumber: 'asc' },
    });

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

    requireParishScope(actor.parishId);

    const body = (await request.json()) as {
      familyName?: string;
      familyNumber?: string;
      primaryContactEmail?: string;
      primaryContactPhone?: string;
      address?: string;
    };

    const familyName = body.familyName?.trim();
    const familyNumber = body.familyNumber?.trim();

    if (!familyName || !familyNumber) {
      throw new ApiError(400, 'familyName and familyNumber are required');
    }

    const family = await prisma.family.create({
      data: {
        dioceseId: actor.dioceseId,
        parishId: actor.parishId,
        familyName,
        familyNumber,
        primaryContactEmail: body.primaryContactEmail?.trim() || null,
        primaryContactPhone: body.primaryContactPhone?.trim() || null,
        address: body.address?.trim() || null,
      },
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
      parishId: actor.parishId,
    });

    return Response.json({ ok: true, family });
  });
