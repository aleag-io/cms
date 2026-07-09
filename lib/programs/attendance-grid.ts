export type AttendanceStatusValue = 'PRESENT' | 'ABSENT' | 'EXCUSED';

export type AttendanceGridRow = {
  memberId: string;
  firstName: string;
  lastName: string;
  status: AttendanceStatusValue | null;
};

/**
 * Build the session attendance grid from active enrollments + saved marks.
 * Enrolled members without a saved row appear with status null (unset).
 */
export function buildAttendanceGrid(input: {
  enrollments: Array<{
    memberId: string;
    member: { firstName: string; lastName: string };
    status?: string;
  }>;
  attendance: Array<{ memberId: string; status: AttendanceStatusValue }>;
}): AttendanceGridRow[] {
  const byMember = new Map(
    input.attendance.map((row) => [row.memberId, row.status]),
  );

  return input.enrollments
    .filter((e) => !e.status || e.status === 'ACTIVE')
    .map((e) => ({
      memberId: e.memberId,
      firstName: e.member.firstName,
      lastName: e.member.lastName,
      status: byMember.get(e.memberId) ?? null,
    }))
    .sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(
        `${b.lastName} ${b.firstName}`,
      ),
    );
}

/** Apply a single status change immutably. */
export function setAttendanceStatus(
  rows: AttendanceGridRow[],
  memberId: string,
  status: AttendanceStatusValue,
): AttendanceGridRow[] {
  return rows.map((row) =>
    row.memberId === memberId ? { ...row, status } : row,
  );
}

/** Payload for POST attendance bulk save — only rows with a chosen status. */
export function attendanceRecordsPayload(
  rows: AttendanceGridRow[],
): Array<{ memberId: string; status: AttendanceStatusValue }> {
  return rows
    .filter(
      (row): row is AttendanceGridRow & { status: AttendanceStatusValue } =>
        row.status != null,
    )
    .map((row) => ({ memberId: row.memberId, status: row.status }));
}
