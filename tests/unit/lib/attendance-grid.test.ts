import { describe, expect, it } from 'vitest';
import {
  attendanceRecordsPayload,
  buildAttendanceGrid,
  setAttendanceStatus,
} from '@/lib/programs/attendance-grid';

describe('attendance grid helpers', () => {
  const enrollments = [
    {
      memberId: 'm2',
      status: 'ACTIVE',
      member: { firstName: 'Bob', lastName: 'Baker' },
    },
    {
      memberId: 'm1',
      status: 'ACTIVE',
      member: { firstName: 'Ann', lastName: 'Adams' },
    },
    {
      memberId: 'm3',
      status: 'WITHDRAWN',
      member: { firstName: 'Zed', lastName: 'Zulu' },
    },
  ];

  it('builds sorted rows from enrollments and saved marks', () => {
    const grid = buildAttendanceGrid({
      enrollments,
      attendance: [{ memberId: 'm1', status: 'PRESENT' }],
    });

    expect(grid.map((r) => r.memberId)).toEqual(['m1', 'm2']);
    expect(grid[0].status).toBe('PRESENT');
    expect(grid[1].status).toBeNull();
  });

  it('updates a single row immutably', () => {
    const grid = buildAttendanceGrid({ enrollments, attendance: [] });
    const next = setAttendanceStatus(grid, 'm2', 'ABSENT');
    expect(next.find((r) => r.memberId === 'm2')?.status).toBe('ABSENT');
    expect(grid.find((r) => r.memberId === 'm2')?.status).toBeNull();
  });

  it('payload includes only rows with a chosen status', () => {
    const grid = setAttendanceStatus(
      buildAttendanceGrid({ enrollments, attendance: [] }),
      'm1',
      'EXCUSED',
    );
    expect(attendanceRecordsPayload(grid)).toEqual([
      { memberId: 'm1', status: 'EXCUSED' },
    ]);
  });
});
