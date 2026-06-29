type RoleName = string;

type MemberForProjection = {
  id: string;
  parishId: string;
  memberIdentifier: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: string;
  family?: unknown;
  workNotes?: string | null;
  educationLevel?: string | null;
  skillsInterests?: string[];
  privateNote?: { note: string } | null;
  pastoralData?: {
    dateOfBirth: Date | null;
    baptismDate: Date | null;
    chrismationDate: Date | null;
  } | null;
};

const WORK_NOTES_ROLES = new Set([
  'parish_admin',
  'parish_staff',
  'organization_leader',
]);
const PRIVATE_NOTE_ROLES = new Set(['clergy']);
const PASTORAL_ROLES = new Set([
  'clergy',
  'parish_admin',
  'pastoral_data_accessor',
]);

function hasRole(roles: RoleName[], accepted: Set<string>) {
  return roles.some((role) => accepted.has(role.toLowerCase()));
}

export function projectMember(member: MemberForProjection, roles: RoleName[]) {
  const canSeeWorkNotes = hasRole(roles, WORK_NOTES_ROLES);
  const canSeePrivateNotes = hasRole(roles, PRIVATE_NOTE_ROLES);
  const canSeePastoral = hasRole(roles, PASTORAL_ROLES);

  return {
    id: member.id,
    parishId: member.parishId,
    memberIdentifier: member.memberIdentifier,
    firstName: member.firstName,
    lastName: member.lastName,
    email: member.email,
    phone: member.phone,
    status: member.status,
    family: member.family ?? null,
    workNotes: canSeeWorkNotes ? (member.workNotes ?? null) : undefined,
    educationLevel: canSeeWorkNotes
      ? (member.educationLevel ?? null)
      : undefined,
    skillsInterests: canSeeWorkNotes
      ? (member.skillsInterests ?? [])
      : undefined,
    privateNote: canSeePrivateNotes ? (member.privateNote ?? null) : undefined,
    pastoralData: canSeePastoral ? (member.pastoralData ?? null) : undefined,
  };
}

export function projectDirectoryMember(member: {
  id: string;
  parishId: string;
  memberIdentifier: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: string;
}) {
  return {
    id: member.id,
    parishId: member.parishId,
    memberIdentifier: member.memberIdentifier,
    firstName: member.firstName,
    lastName: member.lastName,
    email: member.email,
    phone: member.phone,
    status: member.status,
  };
}
