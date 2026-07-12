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
  ]),
  diocese_admin: allow([
    ['member_profile', ['read', 'write', 'delete', 'export']],
    ['parish_directory', ['read', 'export']],
    ['finance_ledger', ['read', 'write']],
    ['finance_approval', ['read', 'write']],
    ['finance_giving', ['read', 'write', 'export']],
  ]),
  diocese_staff: allow([
    ['member_profile', ['read']],
    ['parish_directory', ['read']],
    ['finance_ledger', ['read', 'write']],
    ['finance_approval', ['read']],
    ['finance_giving', ['read', 'write']],
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
  ]),
  parish_staff: allow([
    ['member_profile', ['read', 'write']],
    ['parish_directory', ['read']],
    ['member_export', ['read']],
    ['finance_ledger', ['read', 'write']],
    ['finance_approval', ['read']],
    ['finance_giving', ['read', 'write']],
  ]),
  clergy: allow([
    ['member_profile', ['read']],
    ['member_private_note', ['read', 'write']],
    ['member_pastoral_data', ['read', 'write']],
    ['member_sacramental_record', ['read', 'write', 'export']],
    ['parish_directory', ['read']],
  ]),
  pastoral_data_accessor: allow([
    ['member_profile', ['read']],
    ['member_pastoral_data', ['read', 'write']],
    ['member_sacramental_record', ['read', 'write', 'export']],
    ['parish_directory', ['read']],
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
  ]),
  member: allow([
    ['parish_directory', ['read']],
    ['finance_giving', ['read']],
  ]),
};
