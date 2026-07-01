import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role, SharingRequestStatus } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { prisma } from '@/lib/prisma';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

function parseStatus(value: string | null): SharingRequestStatus | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  if (!Object.values(SharingRequestStatus).includes(upper as SharingRequestStatus)) {
    throw new ApiError(400, 'Invalid status filter');
  }
  return upper as SharingRequestStatus;
}

export const GET = (request: Request) =>
  handle(async () => {
    const actor = await requireRole([
      Role.DIOCESE_ADMIN,
      Role.DIOCESE_STAFF,
      Role.PARISH_ADMIN,
      Role.PARISH_DATA_SHARING_MANAGER,
    ]);
    const claims = await claimsFromUser(actor);
    const status = parseStatus(new URL(request.url).searchParams.get('status'));

    const requests = await withTenant(claims, (tx) =>
      tx.dataSharingRequest.findMany({
        where:
          actor.parishId
            ? { parishId: actor.parishId, ...(status ? { status } : {}) }
            : { dioceseId: actor.dioceseId, ...(status ? { status } : {}) },
        orderBy: [{ createdAt: 'desc' }],
      }),
    );

    return Response.json({ ok: true, requests });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([Role.DIOCESE_ADMIN, Role.DIOCESE_STAFF]);
    const claims = await claimsFromUser(actor);

    const body = (await request.json().catch(() => null)) as
      | {
          parishId?: string;
          dataCategory?: string;
          reason?: string;
        }
      | null;

    if (!body?.parishId || !body.dataCategory || !body.reason?.trim()) {
      throw new ApiError(400, 'parishId, dataCategory, and reason are required');
    }

    const dataCategory = body.dataCategory.toUpperCase();
    const allowedCategories = [
      'MEMBER_DIRECTORY',
      'MEMBER_DEMOGRAPHICS_DETAIL',
      'FAMILY_RECORDS',
      'SACRAMENTAL_RECORDS',
      'GIVING_DETAIL',
      'GIVING_STATEMENTS',
      'PROGRAM_ROSTER',
      'FINANCIAL_STATEMENTS',
      'LEDGER_DETAIL',
      'ATTENDANCE_DETAIL',
      'AUDIT_LOG',
      'COMMUNICATIONS_HISTORY',
    ];
    if (!allowedCategories.includes(dataCategory)) {
      throw new ApiError(400, 'Invalid dataCategory');
    }

    const parish = await prisma.parish.findFirst({
      where: { id: body.parishId, dioceseId: actor.dioceseId },
      select: { id: true },
    });
    if (!parish) throw new ApiError(404, 'Parish not found');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14);

    const created = await withTenant(claims, (tx) =>
      tx.dataSharingRequest.create({
        data: {
          parishId: body.parishId!,
          dioceseId: actor.dioceseId,
          dataCategory: dataCategory as never,
          reason: body.reason!.trim(),
          requestedByUserId: actor.id,
          expiresAt,
        },
      }),
    );

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'sharing.request.create',
      entityType: 'data_sharing_request',
      entityId: created.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId: created.parishId,
      metadata: {
        dataCategory: created.dataCategory,
      },
    });

    return Response.json({ ok: true, request: created });
  });
