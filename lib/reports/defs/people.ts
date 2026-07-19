import { Role } from '@prisma/client';
import { ApiError } from '@/lib/api';
import type { ReportDefinition } from '@/lib/reports/types';

function requireParish(parishId: string | null): string {
  if (!parishId) throw new ApiError(400, 'Parish scope required');
  return parishId;
}

// D10: status × gender only — deliberately no DOB/age bands so pastoral dates
// never enter report surfaces.
export const membershipStatusReport: ReportDefinition = {
  id: 'membership-status',
  title: 'Membership status',
  description: 'Member counts by status and gender for the parish.',
  category: 'people',
  scopes: ['parish'],
  roles: [
    Role.GLOBAL_ADMIN,
    Role.DIOCESE_ADMIN,
    Role.PARISH_ADMIN,
    Role.PARISH_STAFF,
    Role.CLERGY,
  ],
  params: [],
  async run(tx, ctx) {
    const parishId = requireParish(ctx.parishId);
    const groups = await tx.member.groupBy({
      by: ['status', 'gender'],
      where: { parishId },
      _count: { _all: true },
    });

    const statuses = [...new Set(groups.map((g) => g.status))].sort();
    const rows = statuses.map((status) => {
      const forStatus = groups.filter((g) => g.status === status);
      const count = (gender: string) =>
        forStatus
          .filter((g) => g.gender === gender)
          .reduce((n, g) => n + g._count._all, 0);
      const total = forStatus.reduce((n, g) => n + g._count._all, 0);
      return {
        status,
        male: count('MALE'),
        female: count('FEMALE'),
        other: count('OTHER') + count('UNSPECIFIED'),
        total,
      };
    });

    return {
      columns: [
        { key: 'status', label: 'Status' },
        { key: 'male', label: 'Male', kind: 'number' },
        { key: 'female', label: 'Female', kind: 'number' },
        { key: 'other', label: 'Other / unspecified', kind: 'number' },
        { key: 'total', label: 'Total', kind: 'number' },
      ],
      sections: [{ rows }],
      grandTotals: {
        status: null,
        male: rows.reduce((n, r) => n + r.male, 0),
        female: rows.reduce((n, r) => n + r.female, 0),
        other: rows.reduce((n, r) => n + r.other, 0),
        total: rows.reduce((n, r) => n + r.total, 0),
      },
      meta: {
        title: 'Membership status',
        generatedAt: new Date().toISOString().slice(0, 10),
        params: {},
      },
    };
  },
};

export const sacramentalRegisterReport: ReportDefinition = {
  id: 'sacramental-register',
  title: 'Sacramental register summary',
  description: 'Record counts by sacrament type and year (no names or register text).',
  category: 'people',
  scopes: ['parish'],
  roles: [
    Role.GLOBAL_ADMIN,
    Role.PARISH_ADMIN,
    Role.CLERGY,
    Role.PASTORAL_DATA_ACCESSOR,
  ],
  params: [],
  async run(tx, ctx) {
    const parishId = requireParish(ctx.parishId);
    const records = await tx.sacramentalRecord.findMany({
      where: { parishId, isActive: true },
      select: { sacramentType: true, occurredOn: true },
    });

    const byKey = new Map<string, number>();
    for (const record of records) {
      const year = record.occurredOn.getUTCFullYear();
      const key = `${year}|${record.sacramentType}`;
      byKey.set(key, (byKey.get(key) ?? 0) + 1);
    }
    const rows = [...byKey.entries()]
      .map(([key, count]) => {
        const [year, type] = key.split('|');
        return { year: Number(year), sacrament: type, count };
      })
      .sort((a, b) => b.year - a.year || a.sacrament.localeCompare(b.sacrament));

    return {
      columns: [
        { key: 'year', label: 'Year', kind: 'number' },
        { key: 'sacrament', label: 'Sacrament' },
        { key: 'count', label: 'Records', kind: 'number' },
      ],
      sections: [{ rows }],
      grandTotals: {
        year: null,
        sacrament: null,
        count: records.length,
      },
      meta: {
        title: 'Sacramental register summary',
        generatedAt: new Date().toISOString().slice(0, 10),
        params: {},
      },
    };
  },
};
