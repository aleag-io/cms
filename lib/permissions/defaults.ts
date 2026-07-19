import type {
  PermissionAction,
  PermissionResource,
} from '@/lib/permissions/types';

type ResourceActions = Partial<
  Record<PermissionResource, Set<PermissionAction>>
>;

function allow(
  resources: Array<[PermissionResource, PermissionAction[]]>,
): ResourceActions {
  const map: ResourceActions = {};
  for (const [resource, actions] of resources) {
    map[resource] = new Set(actions);
  }
  return map;
}

export const DEFAULT_PERMISSIONS: Record<string, ResourceActions> = {
  global_admin: allow([
    ['member_profile', ['read', 'write', 'delete', 'export']],
    ['member_private_note', ['read', 'write']],
    ['member_pastoral_data', ['read', 'write']],
    ['member_sacramental_record', ['read', 'write', 'export']],
    ['parish_directory', ['read', 'export']],
    ['member_export', ['read', 'export']],
    ['parish_officer', ['read', 'write', 'delete']],
    ['parish_permission_override', ['read', 'write', 'delete']],
    ['finance_ledger', ['read', 'write']],
    ['finance_approval', ['read', 'write']],
    ['finance_giving', ['read', 'write', 'export']],
    ['report', ['read', 'export']],
    ['member_import', ['write']],
  ]),
  diocese_admin: allow([
    ['member_profile', ['read', 'write', 'delete', 'export']],
    ['parish_directory', ['read', 'export']],
    ['finance_ledger', ['read', 'write']],
    ['finance_approval', ['read', 'write']],
    ['finance_giving', ['read', 'write', 'export']],
    ['report', ['read', 'export']],
  ]),
  diocese_staff: allow([
    ['member_profile', ['read']],
    ['parish_directory', ['read']],
    ['finance_ledger', ['read', 'write']],
    ['finance_approval', ['read']],
    ['finance_giving', ['read', 'write']],
    ['report', ['read']],
  ]),
  // R6: the reporting-only diocese role had no defaults entry at all, which
  // silently 403'd every report/export gate.
  diocese_report_viewer: allow([
    ['parish_directory', ['read']],
    ['report', ['read', 'export']],
  ]),
  parish_admin: allow([
    ['member_profile', ['read', 'write', 'delete', 'export']],
    ['member_pastoral_data', ['read', 'write']],
    ['member_sacramental_record', ['read', 'write', 'export']],
    ['parish_directory', ['read', 'export']],
    ['member_export', ['read', 'export']],
    ['parish_officer', ['read', 'write', 'delete']],
    ['parish_permission_override', ['read', 'write', 'delete']],
    ['finance_ledger', ['read', 'write']],
    ['finance_approval', ['read', 'write']],
    ['finance_giving', ['read', 'write', 'export']],
    ['report', ['read', 'export']],
    ['member_import', ['write']],
  ]),
  parish_staff: allow([
    ['member_profile', ['read', 'write']],
    ['parish_directory', ['read']],
    ['member_export', ['read']],
    ['finance_ledger', ['read', 'write']],
    ['finance_approval', ['read']],
    ['finance_giving', ['read', 'write']],
    ['report', ['read']],
  ]),
  clergy: allow([
    ['member_profile', ['read']],
    ['member_private_note', ['read', 'write']],
    ['member_pastoral_data', ['read', 'write']],
    ['member_sacramental_record', ['read', 'write', 'export']],
    ['parish_directory', ['read']],
    ['report', ['read']],
  ]),
  pastoral_data_accessor: allow([
    ['member_profile', ['read']],
    ['member_pastoral_data', ['read', 'write']],
    ['member_sacramental_record', ['read', 'write', 'export']],
    ['parish_directory', ['read']],
    ['report', ['read']],
  ]),
  ministry_leader: allow([
    ['member_profile', ['read']],
    ['parish_directory', ['read']],
  ]),
  organization_leader: allow([
    ['member_profile', ['read']],
    ['parish_directory', ['read']],
    ['finance_ledger', ['read', 'write']],
    ['finance_approval', ['read', 'write']],
    ['report', ['read', 'export']],
  ]),
  member: allow([
    ['parish_directory', ['read']],
    ['finance_giving', ['read']],
  ]),
};
