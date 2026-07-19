import { randomUUID } from 'node:crypto';
import { AuditOutcome } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { ApiError, handle } from '@/lib/api';
import { writeAuditEntry } from '@/lib/audit';
import { parseOwnerQuery, type LedgerRef } from '@/lib/finance/ledger-scope';
import { resolveOrgLedgerParishId } from '@/lib/finance/resolve-org';
import { getReport } from '@/lib/reports/registry';
import { reportToCsv } from '@/lib/reports/render-csv';
import { canRunReport, loadReportOverrides } from '@/lib/reports/access';
import type { ReportContext, ReportFormat, ReportScope } from '@/lib/reports/types';

function parseFormat(raw: string | null): ReportFormat {
  if (raw === 'csv' || raw === 'pdf' || raw === 'json' || raw === null) {
    return (raw ?? 'json') as ReportFormat;
  }
  throw new ApiError(400, 'format must be json, csv, or pdf');
}

export const GET = (
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const { id } = await ctx.params;
    const def = getReport(id);
    if (!def) throw new ApiError(404, 'Unknown report');

    const actor = await requireRole([...def.roles]);
    const claims = await claimsFromUser(actor);
    const url = new URL(request.url);
    const format = parseFormat(url.searchParams.get('format'));
    const requestId = randomUUID();

    const parishId = claims.app_metadata.parish_id;
    const scope: ReportScope = def.scopes.includes('parish') && parishId
      ? 'parish'
      : 'diocese';
    if (!def.scopes.includes(scope)) {
      throw new ApiError(400, `Report ${def.id} does not support ${scope} scope`);
    }

    const params: Record<string, string> = {};
    for (const param of def.params) {
      const value = url.searchParams.get(param.key);
      if (value === null || value === '') {
        if (param.required) {
          throw new ApiError(400, `Missing required parameter: ${param.key}`);
        }
        continue;
      }
      if (value.length > 64) {
        throw new ApiError(400, `Parameter too long: ${param.key}`);
      }
      params[param.key] = value;
    }

    const auditBase = {
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      entityType: 'Report',
      dioceseId: claims.app_metadata.diocese_id,
      parishId,
    };

    let ledger: LedgerRef | undefined;
    if (def.needsLedgerOwner) {
      ledger = parseOwnerQuery(url.searchParams.get('owner'), claims);
      if (ledger.ownerType === 'ORGANIZATION') {
        ledger = await resolveOrgLedgerParishId(claims, ledger);
      }
    }

    const action = format === 'json' ? 'report.run' : 'report.export';

    const result = await withTenant(claims, async (tx) => {
      const overrides = await loadReportOverrides(tx, parishId);
      if (
        !canRunReport(claims, 'read', overrides) ||
        (format !== 'json' && !canRunReport(claims, 'export', overrides))
      ) {
        throw new ApiError(403, 'Not permitted to run this report');
      }
      const reportCtx: ReportContext = {
        claims,
        scope,
        dioceseId: claims.app_metadata.diocese_id,
        parishId: parishId ?? null,
        ledger,
      };
      return def.run(tx, reportCtx, params);
    }).catch(async (error) => {
      if (error instanceof ApiError && error.status === 403) {
        await writeAuditEntry({
          ...auditBase,
          action,
          outcome: AuditOutcome.DENIED,
          metadata: { reportId: def.id, format, params },
        });
      }
      throw error;
    });

    await writeAuditEntry({
      ...auditBase,
      action,
      outcome: AuditOutcome.SUCCESS,
      metadata: { reportId: def.id, format, params },
    });

    const stamp = Object.values(params).join('-') || 'all';
    if (format === 'csv') {
      return new Response(reportToCsv(result), {
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${def.id}-${stamp}.csv"`,
        },
      });
    }
    if (format === 'pdf') {
      // Imported lazily: @react-pdf/renderer is heavy and only the PDF path needs it.
      const { renderReportPdf } = await import('@/lib/reports/render-pdf');
      const buffer = await renderReportPdf(result);
      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': `attachment; filename="${def.id}-${stamp}.pdf"`,
        },
      });
    }

    return Response.json({ ok: true, report: { id: def.id, title: def.title }, result });
  });

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
