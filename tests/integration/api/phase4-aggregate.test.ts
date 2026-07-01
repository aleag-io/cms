/**
 * @phase:4
 */

import { afterEach, describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import { FX, testDb } from '../../helpers/db';
import { asUser } from '../../helpers/auth';
import * as aggregateRoute from '@/app/api/diocese/aggregate/route';

const AGGREGATE_VIEWS = [
  'diocese_parish_member_summary',
  'diocese_parish_family_summary',
] as const;

const PII_COLUMNS = new Set([
  'name',
  'firstname',
  'first_name',
  'lastname',
  'last_name',
  'email',
  'phone',
  'address',
  'dob',
  'date_of_birth',
  'membernumber',
  'member_number',
  'memberidentifier',
  'member_identifier',
  'familyname',
  'family_name',
]);

describe('Phase 4 diocese aggregate views', () => {
  let resetAuth: (() => void) | undefined;

  afterEach(() => {
    resetAuth?.();
    resetAuth = undefined;
  });

  it('aggregate view schemas contain no PII columns', async () => {
    const columns = await testDb.$queryRaw<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('diocese_parish_member_summary', 'diocese_parish_family_summary')
      ORDER BY table_name, ordinal_position
    `;

    for (const view of AGGREGATE_VIEWS) {
      expect(columns.some((col) => col.table_name === view)).toBe(true);
    }

    for (const col of columns) {
      const normalized = col.column_name.toLowerCase().replace(/[^a-z0-9_]/g, '');
      expect(PII_COLUMNS.has(normalized)).toBe(false);
    }
  });

  it('diocese report viewers get counts only from aggregate endpoint', async () => {
    const viewer = await testDb.appUser.create({
      data: {
        email: 'diocese-report-viewer@test.local',
        displayName: 'Diocese Report Viewer',
        role: Role.DIOCESE_REPORT_VIEWER,
        dioceseId: FX.dioceseId,
        parishId: null,
      },
    });
    resetAuth = asUser(viewer);

    const res = await aggregateRoute.GET(
      new Request('http://localhost/api/diocese/aggregate'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.memberSummary.length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toContain('alice@test.local');
    expect(JSON.stringify(body)).not.toContain('Alice');
    expect(Object.keys(body.memberSummary[0]).sort()).toEqual([
      'active_count',
      'deceased_count',
      'inactive_count',
      'moved_count',
      'parish_id',
      'total_count',
    ]);
  });
});
