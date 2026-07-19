import { describe, it, expect } from 'vitest';
import { Role } from '@prisma/client';
import { REPORTS, getReport, listReportsForRoles } from '@/lib/reports/registry';

describe('report registry', () => {
  it('has unique ids', () => {
    const ids = REPORTS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(0);
  });

  it('never grants MEMBER access to any report (PA-22 / D11)', () => {
    for (const def of REPORTS) {
      expect(def.roles, `report ${def.id}`).not.toContain(Role.MEMBER);
      expect(def.roles.length, `report ${def.id}`).toBeGreaterThan(0);
    }
  });

  it('declares well-formed params and scopes', () => {
    for (const def of REPORTS) {
      expect(def.scopes.length, `report ${def.id}`).toBeGreaterThan(0);
      for (const param of def.params) {
        expect(param.key).toBeTruthy();
        expect(['year', 'dateRange', 'select']).toContain(param.type);
        if (param.type === 'select') {
          expect(param.options?.length, `param ${def.id}.${param.key}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('getReport resolves by id and rejects unknowns', () => {
    expect(getReport(REPORTS[0].id)?.id).toBe(REPORTS[0].id);
    expect(getReport('nope')).toBeUndefined();
  });

  it('listReportsForRoles filters by role and scope', () => {
    const parishAdmin = listReportsForRoles(['parish_admin'], 'parish');
    expect(parishAdmin.length).toBeGreaterThan(0);
    for (const def of parishAdmin) {
      expect(def.scopes).toContain('parish');
      expect(def.roles.map((r) => r.toLowerCase())).toContain('parish_admin');
    }
    expect(listReportsForRoles(['member'], 'parish')).toEqual([]);

    const dioceseViewer = listReportsForRoles(['diocese_report_viewer'], 'diocese');
    expect(dioceseViewer.length).toBeGreaterThan(0);
    for (const def of dioceseViewer) {
      expect(def.scopes).toContain('diocese');
    }
  });
});
