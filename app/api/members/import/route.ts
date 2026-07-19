import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { ApiError, handle } from '@/lib/api';
import { writeAuditEntry } from '@/lib/audit';
import { can } from '@/lib/permissions/resolver';
import { mapOverrides } from '@/lib/sacramental/access';
import {
  MEMBER_IMPORT_MAX_ROWS,
  commitMemberImport,
  parseMemberCsv,
  validateMemberImport,
} from '@/lib/members/import';

const ROLES = [Role.GLOBAL_ADMIN, Role.PARISH_ADMIN] as const;

/**
 * Bulk member import (IN-3). `dry-run` validates and reports without writing;
 * `commit` re-validates and creates, returning a partial-success report.
 *
 * Imports deliberately do NOT emit member.created webhooks (D7) — a bulk load
 * would flood subscribers with hundreds of events that carry no new signal.
 */
export const POST = (request: Request) =>
  handle(async () => {
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const parishId = claims.app_metadata.parish_id;
    if (!parishId) throw new ApiError(400, 'Parish context required');
    const requestId = randomUUID();

    const body = (await request.json()) as {
      content?: unknown;
      mode?: unknown;
    };
    if (typeof body.content !== 'string' || body.content.trim() === '') {
      throw new ApiError(400, 'content is required');
    }
    const mode = body.mode === 'commit' ? 'commit' : 'dry-run';

    const audit = {
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      entityType: 'member_import',
      dioceseId: claims.app_metadata.diocese_id,
      parishId,
    };

    const parsed = parseMemberCsv(body.content);
    if (parsed.rows.length > MEMBER_IMPORT_MAX_ROWS) {
      throw new ApiError(
        400,
        `Too many rows: ${parsed.rows.length} (max ${MEMBER_IMPORT_MAX_ROWS})`,
      );
    }

    const result = await withTenant(claims, async (tx) => {
      const overrides = mapOverrides(
        await tx.parishPermissionOverride.findMany({
          where: { parishId, resource: 'MEMBER_IMPORT' },
        }),
      );
      if (!can(claims.app_metadata.roles, 'member_import', 'write', overrides)) {
        throw new ApiError(403, 'Not permitted to import members');
      }

      const validated = await validateMemberImport(tx, parishId, parsed.rows);
      if (mode === 'dry-run') {
        return {
          created: 0,
          errors: [...parsed.errors, ...validated.errors],
          validCount: validated.valid.length,
        };
      }

      const committed = await commitMemberImport(
        tx,
        { dioceseId: claims.app_metadata.diocese_id, parishId },
        validated.valid,
      );
      return {
        created: committed.created,
        errors: [...parsed.errors, ...validated.errors, ...committed.errors],
        validCount: validated.valid.length,
      };
    }).catch(async (error) => {
      if (error instanceof ApiError && error.status === 403) {
        await writeAuditEntry({
          ...audit,
          action: `member.import.${mode === 'commit' ? 'commit' : 'dry_run'}`,
          outcome: AuditOutcome.DENIED,
        });
      }
      throw error;
    });

    await writeAuditEntry({
      ...audit,
      action: mode === 'commit' ? 'member.import.commit' : 'member.import.dry_run',
      outcome: AuditOutcome.SUCCESS,
      metadata: {
        total: parsed.rows.length,
        valid: result.validCount,
        created: result.created,
        failed: result.errors.length,
      },
    });

    return Response.json({
      ok: true,
      mode,
      total: parsed.rows.length,
      valid: result.validCount,
      created: result.created,
      failed: result.errors.length,
      errors: result.errors.slice(0, 200),
    });
  });
