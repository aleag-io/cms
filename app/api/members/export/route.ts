import { Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { handle } from '@/lib/api';
import { projectMember } from '@/lib/projection';

function escapeCsv(value: unknown): string {
  let str = value === null || value === undefined ? '' : String(value);
  // Neutralize spreadsheet formula injection (=, +, -, @ leading a cell).
  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }
  if (
    str.includes(',') ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r')
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toISOString().split('T')[0];
}

export const GET = () =>
  handle(async () => {
    const actor = await requireRole([
      Role.DIOCESE_ADMIN,
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
      Role.CLERGY,
      Role.PASTORAL_DATA_ACCESSOR,
      Role.MEMBER,
    ]);
    const claims = await claimsFromUser(actor);
    const parishId = claims.app_metadata.parish_id;
    if (!parishId) {
      return new Response('', {
        status: 200,
        headers: { 'content-type': 'text/csv' },
      });
    }

    const rows = await withTenant(claims, (tx) =>
      tx.member.findMany({
        where: { parishId },
        include: { family: true, privateNote: true, pastoralData: true },
        orderBy: [{ familyId: 'asc' }, { memberIdentifier: 'asc' }],
      }),
    );

    const roles = claims.app_metadata.roles;
    const projectedRows = rows.map((row) => projectMember(row, roles));

    // Build columns dynamically based on what the actor's role can see.
    const baseColumns = [
      { key: 'memberIdentifier', label: 'Member ID' },
      { key: 'firstName', label: 'First name' },
      { key: 'lastName', label: 'Last name' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'status', label: 'Status' },
      { key: 'familyName', label: 'Family' },
    ] as { key: string; label: string }[];

    const firstRow = projectedRows[0];
    if (firstRow) {
      if (firstRow.workNotes !== undefined) {
        baseColumns.push({ key: 'workNotes', label: 'Work notes' });
      }
      if (firstRow.educationLevel !== undefined) {
        baseColumns.push({ key: 'educationLevel', label: 'Education level' });
      }
      if (firstRow.skillsInterests !== undefined) {
        baseColumns.push({
          key: 'skillsInterests',
          label: 'Skills / interests',
        });
      }
      if (firstRow.pastoralData !== undefined) {
        baseColumns.push({ key: 'dateOfBirth', label: 'Date of birth' });
        baseColumns.push({ key: 'baptismDate', label: 'Baptism date' });
        baseColumns.push({ key: 'chrismationDate', label: 'Chrismation date' });
      }
      if (firstRow.privateNote !== undefined) {
        baseColumns.push({ key: 'privateNote', label: 'Private note' });
      }
    }

    const lines: string[] = [
      baseColumns.map((c) => escapeCsv(c.label)).join(','),
    ];

    for (const projected of projectedRows) {
      const familyName =
        projected.family &&
        typeof projected.family === 'object' &&
        projected.family !== null &&
        'familyName' in projected.family
          ? String(projected.family.familyName)
          : '';

      const values: Record<string, string> = {
        memberIdentifier: String(projected.memberIdentifier),
        firstName: projected.firstName,
        lastName: projected.lastName,
        email: projected.email ?? '',
        phone: projected.phone ?? '',
        status: projected.status,
        familyName,
      };

      if (projected.workNotes !== undefined) {
        values.workNotes = projected.workNotes ?? '';
      }
      if (projected.educationLevel !== undefined) {
        values.educationLevel = projected.educationLevel ?? '';
      }
      if (projected.skillsInterests !== undefined) {
        values.skillsInterests = (projected.skillsInterests ?? []).join('; ');
      }
      if (projected.pastoralData !== undefined) {
        values.dateOfBirth = formatDate(projected.pastoralData?.dateOfBirth);
        values.baptismDate = formatDate(projected.pastoralData?.baptismDate);
        values.chrismationDate = formatDate(
          projected.pastoralData?.chrismationDate,
        );
      }
      if (projected.privateNote !== undefined) {
        values.privateNote = projected.privateNote?.note ?? '';
      }

      lines.push(baseColumns.map((c) => escapeCsv(values[c.key])).join(','));
    }

    const csv = lines.join('\n');
    const filename = `members-export-${new Date().toISOString().split('T')[0]}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
      },
    });
  });
