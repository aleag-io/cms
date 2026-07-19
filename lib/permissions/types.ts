export type PermissionResource =
  | 'member_profile'
  | 'member_private_note'
  | 'member_pastoral_data'
  | 'member_sacramental_record'
  | 'parish_directory'
  | 'member_export'
  | 'parish_officer'
  | 'parish_permission_override'
  | 'finance_ledger'
  | 'finance_approval'
  | 'finance_giving'
  | 'report'
  | 'member_import';

export type PermissionAction = 'read' | 'write' | 'delete' | 'export' | 'send';

export interface PermissionOverride {
  role: string;
  resource: PermissionResource;
  action: PermissionAction;
  isAllowed: boolean;
}
