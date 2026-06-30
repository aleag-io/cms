import { randomUUID } from 'node:crypto';
import {
  AuditOutcome,
  MembershipMode,
  OrganizationType,
  Role,
} from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { defaultMembershipMode } from '@/lib/organizations/membership-mode';

function requireParishId(parishId: string | null): string {
  if (!parishId) throw new ApiError(400, 'Parish scope required');
  return parishId;
}

export const GET = () =>
  handle(async () => {
    const actor = await requireRole([
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
      Role.ORGANIZATION_LEADER,
      Role.MEMBER,
    ]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const organizations = await withTenant(claims, (tx) =>
      tx.organization.findMany({
        where: { parishId },
        orderBy: { name: 'asc' },
      }),
    );

    return Response.json({ ok: true, organizations });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([Role.PARISH_ADMIN, Role.PARISH_STAFF]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const body = (await request.json()) as {
      name?: string;
      description?: string | null;
      organizationType?: OrganizationType;
      membershipMode?: MembershipMode;
      hasOwnLedger?: boolean;
    };

    if (!body.name?.trim()) throw new ApiError(400, 'name is required');
    const organizationType = body.organizationType ?? OrganizationType.OTHER;
    // Mode defaults from type (PA-16); admin may override.
    const membershipMode =
      body.membershipMode ?? defaultMembershipMode(organizationType);

    const organization = await withTenant(claims, (tx) =>
      tx.organization.create({
        data: {
          dioceseId: actor.dioceseId,
          parishId,
          name: body.name!.trim(),
          description: body.description?.trim() || null,
          organizationType,
          membershipMode,
          hasOwnLedger: body.hasOwnLedger ?? false,
        },
      }),
    );

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'operations.organization.create',
      entityType: 'organization',
      entityId: organization.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId,
      metadata: { name: organization.name, organizationType, membershipMode },
    });

    return Response.json({ ok: true, organization });
  });
