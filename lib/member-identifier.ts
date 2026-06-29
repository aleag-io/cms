/**
 * Member identifier helpers.
 *
 * Family numbers are parish-assigned strings (e.g. "100" or "PAR-0042").
 * The member identifier within a family is `<familyNumber>.<sequenceIndex>`
 * where sequenceIndex starts at 1 for the first member in the family.
 *
 * Requirements: MM-10, MM-16
 */

export interface FamilyNumberConfig {
  /** Optional alphabetic prefix (e.g. "PAR-"). Empty string for none. */
  prefix: string;
  /** Total digit width, zero-padded (e.g. 4 → "0042"). */
  digitWidth: number;
  /** Starting numeric value. */
  startAt: number;
}

/** Format a raw numeric sequence into a parish family number string. */
export function formatFamilyNumber(
  sequence: number,
  config: FamilyNumberConfig,
): string {
  const digits = String(sequence).padStart(config.digitWidth, '0');
  return `${config.prefix}${digits}`;
}

/** Derive the member identifier from a family number and in-family index (1-based). */
export function deriveMemberIdentifier(
  familyNumber: string,
  inFamilyIndex: number,
): string {
  if (inFamilyIndex < 1) throw new RangeError('inFamilyIndex must be >= 1');
  return `${familyNumber}.${inFamilyIndex}`;
}

/** Parse a member identifier back into its parts. Returns null if malformed. */
export function parseMemberIdentifier(
  identifier: string,
): { familyNumber: string; index: number } | null {
  const lastDot = identifier.lastIndexOf('.');
  if (lastDot < 1) return null;
  const indexPart = identifier.slice(lastDot + 1);
  const index = Number(indexPart);
  if (!Number.isInteger(index) || index < 1) return null;
  return { familyNumber: identifier.slice(0, lastDot), index };
}
