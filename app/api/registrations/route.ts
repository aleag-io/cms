import { randomUUID } from 'node:crypto';
import {
  AuditOutcome,
  MemberStatus,
  RegistrationStatus,
  Role,
} from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Public self-registration intake (MM-8). Unauthenticated — added to the proxy
 * allowlist. Uses the privileged client (like /api/bootstrap) and creates a
 * PENDING member that is invisible everywhere (directory view filters
 * status='ACTIVE') until a Parish Admin/Staff approves it. Strict input
 * validation guards the open endpoint.
 */
export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const body = (await request.json().catch(() => null)) as {
      parishId?: string;
      firstName?: string;
      lastName?: string;
      email?: string | null;
      phone?: string | null;
      familyName?: string | null;
      notes?: string | null;
    } | null;

    if (!body) throw new ApiError(400, 'Invalid request body');
    const firstName = body.firstName?.trim();
    const lastName = body.lastName?.trim();
    if (!body.parishId || !firstName || !lastName) {
      throw new ApiError(400, 'parishId, firstName, and lastName are required');
    }
    if (firstName.length > 100 || lastName.length > 100) {
      throw new ApiError(400, 'Name too long');
    }
    if (body.email && !EMAIL_RE.test(body.email)) {
      throw new ApiError(400, 'Invalid email');
    }

    const parish = await prisma.parish.findFirst({
      where: { id: body.parishId, isActive: true },
      select: { id: true, dioceseId: true, autoApprove: true },
    });
    if (!parish) throw new ApiError(404, 'Parish not found');

    const autoApprove = parish.autoApprove;

    // Create the PENDING member + the registration record atomically (privileged).
    const { registration } = await prisma.$transaction(async (tx) => {
      const member = await tx.member.create({
        data: {
          dioceseId: parish.dioceseId,
          parishId: parish.id,
          memberIdentifier: `PENDING-${randomUUID().slice(0, 8)}`,
          firstName,
          lastName,
          email: body.email?.trim() || null,
          phone: body.phone?.trim() || null,
          status: autoApprove ? MemberStatus.ACTIVE : MemberStatus.PENDING,
        },
      });

      const reg = await tx.memberRegistration.create({
        data: {
          dioceseId: parish.dioceseId,
          parishId: parish.id,
          firstName,
          lastName,
          email: body.email?.trim() || null,
          phone: body.phone?.trim() || null,
          familyName: body.familyName?.trim() || null,
          notes: body.notes?.trim() || null,
          approvalStatus: autoApprove
            ? RegistrationStatus.APPROVED
            : RegistrationStatus.PENDING,
          reviewedAt: autoApprove ? new Date() : null,
          approvedMemberId: member.id,
        },
      });

      return { member, registration: reg };
    });

    await writeAuditEntry({
      requestId,
      actorLabel: `self-registration:${body.email ?? 'anonymous'}`,
      action: 'membership.registration.submit',
      entityType: 'member_registration',
      entityId: registration.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: parish.dioceseId,
      parishId: parish.id,
      metadata: { autoApprove },
    });

    return Response.json({
      ok: true,
      registration: {
        id: registration.id,
        approvalStatus: registration.approvalStatus,
      },
    });
  });

export const GET = () =>
  handle(async () => {
    const actor = await requireRole([Role.PARISH_ADMIN, Role.PARISH_STAFF]);
    if (!actor.parishId) throw new ApiError(400, 'Parish scope required');
    const claims = await claimsFromUser(actor);

    const registrations = await withTenant(claims, (tx) =>
      tx.memberRegistration.findMany({
        where: { parishId: actor.parishId!, approvalStatus: RegistrationStatus.PENDING },
        orderBy: { submittedAt: 'asc' },
      }),
    );

    return Response.json({ ok: true, registrations });
  });
