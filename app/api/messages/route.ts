import { randomUUID } from 'node:crypto';
import {
  AudienceType,
  AuditOutcome,
  MessageChannel,
  MessageStatus,
  RecipientStatus,
  Role,
} from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import {
  resolveRecipients,
  type AudienceMember,
} from '@/lib/communications/audience';

function requireParishId(parishId: string | null): string {
  if (!parishId) throw new ApiError(400, 'Parish scope required');
  return parishId;
}

export const GET = () =>
  handle(async () => {
    const actor = await requireRole([Role.PARISH_ADMIN, Role.PARISH_STAFF]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const messages = await withTenant(claims, (tx) =>
      tx.message.findMany({
        where: { parishId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          _count: { select: { recipients: true } },
          recipients: {
            select: { status: true },
          },
        },
      }),
    );

    const projected = messages.map((message) => {
      const statusCounts = message.recipients.reduce(
        (acc, r) => {
          acc[r.status] = (acc[r.status] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );
      const { recipients: _recipients, ...rest } = message;
      return { ...rest, statusCounts };
    });

    return Response.json({ ok: true, messages: projected });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([Role.PARISH_ADMIN, Role.PARISH_STAFF]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const body = (await request.json()) as {
      channel?: MessageChannel;
      subject?: string | null;
      body?: string;
      audienceType?: AudienceType;
      audienceRefId?: string | null;
    };

    if (!body.body?.trim()) throw new ApiError(400, 'body is required');
    const channel = body.channel ?? MessageChannel.EMAIL;
    const audienceType = body.audienceType ?? AudienceType.ALL_MEMBERS;

    const { message, queued } = await withTenant(claims, async (tx) => {
      // Resolve the audience to candidate members.
      let members: AudienceMember[] = [];
      if (audienceType === AudienceType.PROGRAM) {
        if (!body.audienceRefId) {
          throw new ApiError(
            400,
            'audienceRefId required for PROGRAM audience',
          );
        }
        const enrollments = await tx.programEnrollment.findMany({
          where: { programId: body.audienceRefId, parishId, status: 'ACTIVE' },
          select: {
            member: { select: { id: true, email: true, phone: true } },
          },
        });
        members = enrollments.map((e) => ({
          memberId: e.member.id,
          email: e.member.email,
          phone: e.member.phone,
        }));
      } else if (audienceType === AudienceType.ORGANIZATION) {
        if (!body.audienceRefId) {
          throw new ApiError(
            400,
            'audienceRefId required for ORGANIZATION audience',
          );
        }
        const memberships = await tx.organizationMembership.findMany({
          where: { organizationId: body.audienceRefId, parishId, leftAt: null },
          select: {
            member: { select: { id: true, email: true, phone: true } },
          },
        });
        members = memberships.map((m) => ({
          memberId: m.member.id,
          email: m.member.email,
          phone: m.member.phone,
        }));
      } else {
        // ALL_MEMBERS / FAMILIES / CUSTOM → all active parish members.
        const all = await tx.member.findMany({
          where: { parishId, status: 'ACTIVE' },
          select: { id: true, email: true, phone: true },
        });
        members = all.map((m) => ({
          memberId: m.id,
          email: m.email,
          phone: m.phone,
        }));
      }

      const memberIds = members.map((m) => m.memberId);
      const prefs = await tx.communicationPreference.findMany({
        where: { memberId: { in: memberIds }, channel },
        select: { memberId: true, channel: true, optedOut: true },
      });

      const recipients = resolveRecipients(members, prefs, channel);

      const created = await tx.message.create({
        data: {
          dioceseId: actor.dioceseId,
          parishId,
          channel,
          subject: body.subject?.trim() || null,
          body: body.body!.trim(),
          audienceType,
          audienceRefId: body.audienceRefId || null,
          status:
            recipients.length > 0 ? MessageStatus.QUEUED : MessageStatus.SENT,
          createdByUserId: actor.id,
        },
      });

      if (recipients.length > 0) {
        await tx.messageRecipient.createMany({
          data: recipients.map((r) => ({
            dioceseId: actor.dioceseId,
            parishId,
            messageId: created.id,
            memberId: r.memberId,
            channel,
            status: RecipientStatus.QUEUED,
            destination: r.destination,
          })),
        });
      }

      return { message: created, queued: recipients.length };
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'operations.message.enqueue',
      entityType: 'message',
      entityId: message.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId,
      metadata: { channel, audienceType, queued },
    });

    return Response.json({ ok: true, message, queued });
  });
