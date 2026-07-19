import type { Prisma } from '@prisma/client';
import { parseCsv } from '@/lib/csv';
import { deriveMemberIdentifier } from '@/lib/member-identifier';

// R6 / IN-3 — member CSV import.
// Stateless by design (D7): the client holds the file and calls dry-run, then
// commit. Both passes validate identically; commit re-validates against the DB
// so a row that became invalid between passes fails rather than corrupting.

export const MEMBER_IMPORT_MAX_ROWS = 2000;

export type MemberImportRowInput = {
  line: number;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  gender?: string;
  status?: string;
  memberIdentifier?: string;
  familyName?: string;
};

export type MemberImportRowError = {
  line: number;
  field?: string;
  reason: string;
};

const GENDERS = ['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED'];
const STATUSES = ['PENDING', 'ACTIVE', 'INACTIVE', 'DECEASED', 'MOVED'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Header aliases so exports from other systems import without hand-editing. */
const HEADER_ALIASES: Record<string, keyof Omit<MemberImportRowInput, 'line'>> = {
  firstname: 'firstName',
  first_name: 'firstName',
  'first name': 'firstName',
  given_name: 'firstName',
  lastname: 'lastName',
  last_name: 'lastName',
  'last name': 'lastName',
  surname: 'lastName',
  family_name: 'lastName',
  email: 'email',
  'email address': 'email',
  phone: 'phone',
  'phone number': 'phone',
  mobile: 'phone',
  gender: 'gender',
  status: 'status',
  memberid: 'memberIdentifier',
  member_id: 'memberIdentifier',
  'member id': 'memberIdentifier',
  memberidentifier: 'memberIdentifier',
  family: 'familyName',
  familyname: 'familyName',
  'family name': 'familyName',
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function parseMemberCsv(text: string): {
  rows: MemberImportRowInput[];
  errors: MemberImportRowError[];
} {
  const parsed = parseCsv(text);
  const errors: MemberImportRowError[] = parsed.errors.map((error) => ({
    line: error.line,
    reason: error.reason,
  }));
  if (parsed.headers.length === 0) return { rows: [], errors };

  const mapping = parsed.headers.map(
    (header) => HEADER_ALIASES[normalizeHeader(header)],
  );
  if (!mapping.includes('firstName') || !mapping.includes('lastName')) {
    errors.push({
      line: 1,
      reason: 'CSV must have first name and last name columns',
    });
    return { rows: [], errors };
  }

  const rows: MemberImportRowInput[] = [];
  for (const row of parsed.rows) {
    const record: MemberImportRowInput = { line: row.line, firstName: '', lastName: '' };
    mapping.forEach((field, index) => {
      if (!field) return;
      const value = row.cells[index]?.trim();
      if (value) record[field] = value;
    });
    rows.push(record);
  }
  return { rows, errors };
}

type Tx = Prisma.TransactionClient;

export async function validateMemberImport(
  tx: Tx,
  parishId: string,
  rows: MemberImportRowInput[],
): Promise<{ valid: MemberImportRowInput[]; errors: MemberImportRowError[] }> {
  const errors: MemberImportRowError[] = [];
  const valid: MemberImportRowInput[] = [];

  const explicitIdentifiers = rows
    .map((row) => row.memberIdentifier)
    .filter((value): value is string => Boolean(value));
  const existing = explicitIdentifiers.length
    ? await tx.member.findMany({
        where: { parishId, memberIdentifier: { in: explicitIdentifiers } },
        select: { memberIdentifier: true },
      })
    : [];
  const taken = new Set(existing.map((row) => row.memberIdentifier));
  const seenInFile = new Set<string>();

  for (const row of rows) {
    const rowErrors: MemberImportRowError[] = [];
    if (!row.firstName) {
      rowErrors.push({ line: row.line, field: 'firstName', reason: 'first name is required' });
    }
    if (!row.lastName) {
      rowErrors.push({ line: row.line, field: 'lastName', reason: 'last name is required' });
    }
    if (row.email && !EMAIL_RE.test(row.email)) {
      rowErrors.push({ line: row.line, field: 'email', reason: `invalid email "${row.email}"` });
    }
    if (row.gender && !GENDERS.includes(row.gender.toUpperCase())) {
      rowErrors.push({
        line: row.line,
        field: 'gender',
        reason: `gender must be one of ${GENDERS.join(', ')}`,
      });
    }
    if (row.status && !STATUSES.includes(row.status.toUpperCase())) {
      rowErrors.push({
        line: row.line,
        field: 'status',
        reason: `status must be one of ${STATUSES.join(', ')}`,
      });
    }
    if (row.memberIdentifier) {
      if (taken.has(row.memberIdentifier)) {
        rowErrors.push({
          line: row.line,
          field: 'memberIdentifier',
          reason: `member id "${row.memberIdentifier}" already exists in this parish`,
        });
      } else if (seenInFile.has(row.memberIdentifier)) {
        rowErrors.push({
          line: row.line,
          field: 'memberIdentifier',
          reason: `member id "${row.memberIdentifier}" is duplicated in this file`,
        });
      } else {
        seenInFile.add(row.memberIdentifier);
      }
    }

    if (rowErrors.length > 0) errors.push(...rowErrors);
    else valid.push(row);
  }

  return { valid, errors };
}

/**
 * Create the validated rows. Each row is created independently so one bad row
 * (a race with a concurrent create, say) fails alone and is reported rather
 * than rolling back the whole import.
 */
export async function commitMemberImport(
  tx: Tx,
  ctx: { dioceseId: string; parishId: string },
  rows: MemberImportRowInput[],
): Promise<{ created: number; errors: MemberImportRowError[] }> {
  const errors: MemberImportRowError[] = [];
  let created = 0;

  for (const row of rows) {
    try {
      let familyId: string | null = null;
      let familyNumber: string | null = null;

      if (row.familyName) {
        const family = await tx.family.findFirst({
          where: { parishId: ctx.parishId, familyName: row.familyName },
          select: { id: true, familyNumber: true },
        });
        if (family) {
          familyId = family.id;
          familyNumber = family.familyNumber;
        } else {
          const count = await tx.family.count({ where: { parishId: ctx.parishId } });
          const nextNumber = String(100 + count);
          const createdFamily = await tx.family.create({
            data: {
              dioceseId: ctx.dioceseId,
              parishId: ctx.parishId,
              familyNumber: nextNumber,
              familyName: row.familyName,
            },
            select: { id: true, familyNumber: true },
          });
          familyId = createdFamily.id;
          familyNumber = createdFamily.familyNumber;
        }
      }

      let memberIdentifier = row.memberIdentifier;
      if (!memberIdentifier) {
        if (familyId && familyNumber) {
          const inFamily = await tx.member.count({ where: { familyId } });
          memberIdentifier = deriveMemberIdentifier(familyNumber, inFamily + 1);
        } else {
          const unassigned = await tx.member.count({
            where: { parishId: ctx.parishId, familyId: null },
          });
          memberIdentifier = `UNASSIGNED.${unassigned + 1}`;
        }
      }

      await tx.member.create({
        data: {
          dioceseId: ctx.dioceseId,
          parishId: ctx.parishId,
          familyId,
          memberIdentifier,
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email ?? null,
          phone: row.phone ?? null,
          ...(row.gender
            ? { gender: row.gender.toUpperCase() as 'MALE' | 'FEMALE' | 'OTHER' | 'UNSPECIFIED' }
            : {}),
          status: (row.status?.toUpperCase() ?? 'ACTIVE') as
            | 'PENDING'
            | 'ACTIVE'
            | 'INACTIVE'
            | 'DECEASED'
            | 'MOVED',
        },
      });
      created += 1;
    } catch (cause) {
      errors.push({
        line: row.line,
        reason: cause instanceof Error ? cause.message.split('\n')[0] : 'failed to create',
      });
    }
  }

  return { created, errors };
}
