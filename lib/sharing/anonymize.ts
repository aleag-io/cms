const PII_FIELDS = [
  'name',
  'firstName',
  'lastName',
  'email',
  'phone',
  'mobilePhone',
  'address',
  'familyName',
  'memberNumber',
  'memberIdentifier',
  'envelopeNumber',
  'dateOfBirth',
  'primaryContactEmail',
  'primaryContactPhone',
  'photo',
] as const;

export function anonymizeMember(
  member: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...member };
  for (const f of PII_FIELDS) {
    delete out[f];
  }
  delete out.privateNotes;
  delete out.workNotes;
  delete out.privateNote;
  return out;
}

export function anonymizeResource<T extends Record<string, unknown>>(
  resource: T,
): Record<string, unknown> {
  if (
    resource.type === 'member_list' &&
    Array.isArray(resource.members)
  ) {
    return {
      ...resource,
      members: resource.members.map((member) =>
        isRecord(member) ? anonymizeMember(member) : member,
      ),
    };
  }

  if (resource.type === 'member' && isRecord(resource.member)) {
    return {
      ...resource,
      member: anonymizeMember(resource.member),
    };
  }

  return anonymizeMember(resource);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
