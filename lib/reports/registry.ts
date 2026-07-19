import type { ReportDefinition, ReportScope } from './types';
import { receiptsPaymentsReport } from './defs/receipts-payments';
import { membershipStatusReport, sacramentalRegisterReport } from './defs/people';
import { programAttendanceReport, eventAttendanceReport } from './defs/operations';
import {
  givingSummaryReport,
  pledgeFulfillmentReport,
  incomeVsBudgetReport,
  fundBalancesReport,
} from './defs/finance';
import {
  dioceseMembershipReport,
  dioceseSacramentalReport,
  dioceseGivingReport,
  diocesePledgesReport,
} from './defs/diocese';

/// Every report the platform can run. The cross-cutting sensitive-field leak
/// test iterates this list, so a new definition is covered the moment it lands.
export const REPORTS: readonly ReportDefinition[] = [
  receiptsPaymentsReport,
  membershipStatusReport,
  sacramentalRegisterReport,
  programAttendanceReport,
  eventAttendanceReport,
  givingSummaryReport,
  pledgeFulfillmentReport,
  incomeVsBudgetReport,
  fundBalancesReport,
  dioceseMembershipReport,
  dioceseSacramentalReport,
  dioceseGivingReport,
  diocesePledgesReport,
];

export function getReport(id: string): ReportDefinition | undefined {
  return REPORTS.find((def) => def.id === id);
}

/// Reports the given claim roles may run in the given portal scope.
export function listReportsForRoles(
  roles: string[],
  scope: ReportScope,
): ReportDefinition[] {
  const held = new Set(roles.map((role) => role.toLowerCase()));
  return REPORTS.filter(
    (def) =>
      def.scopes.includes(scope) &&
      def.roles.some((role) => held.has(role.toLowerCase())),
  );
}
