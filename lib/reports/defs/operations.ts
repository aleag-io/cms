import { Role } from '@prisma/client';
import { ApiError } from '@/lib/api';
import type { ReportDefinition } from '@/lib/reports/types';

function requireParish(parishId: string | null): string {
  if (!parishId) throw new ApiError(400, 'Parish scope required');
  return parishId;
}

export const programAttendanceReport: ReportDefinition = {
  id: 'program-attendance',
  title: 'Program attendance',
  description: 'Sessions held and attendance outcomes per program.',
  category: 'operations',
  scopes: ['parish'],
  roles: [Role.GLOBAL_ADMIN, Role.DIOCESE_ADMIN, Role.PARISH_ADMIN, Role.PARISH_STAFF],
  params: [],
  async run(tx, ctx) {
    const parishId = requireParish(ctx.parishId);
    const [programs, sessions, attendance] = await Promise.all([
      tx.program.findMany({
        where: { parishId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      tx.programSession.findMany({
        where: { parishId },
        select: { id: true, programId: true },
      }),
      tx.programSessionAttendance.findMany({
        where: { parishId },
        select: { sessionId: true, status: true },
      }),
    ]);

    const sessionProgram = new Map(sessions.map((s) => [s.id, s.programId]));
    const byProgram = new Map<
      string,
      { sessions: Set<string>; present: number; absent: number; excused: number }
    >();
    for (const program of programs) {
      byProgram.set(program.id, {
        sessions: new Set(),
        present: 0,
        absent: 0,
        excused: 0,
      });
    }
    for (const session of sessions) {
      byProgram.get(session.programId)?.sessions.add(session.id);
    }
    for (const record of attendance) {
      const programId = sessionProgram.get(record.sessionId);
      const bucket = programId ? byProgram.get(programId) : undefined;
      if (!bucket) continue;
      if (record.status === 'PRESENT') bucket.present += 1;
      else if (record.status === 'ABSENT') bucket.absent += 1;
      else bucket.excused += 1;
    }

    const rows = programs.map((program) => {
      const bucket = byProgram.get(program.id)!;
      const marked = bucket.present + bucket.absent + bucket.excused;
      return {
        program: program.name,
        sessions: bucket.sessions.size,
        present: bucket.present,
        absent: bucket.absent,
        excused: bucket.excused,
        attendance_rate:
          marked > 0 ? `${Math.round((bucket.present / marked) * 100)}%` : '—',
      };
    });

    return {
      columns: [
        { key: 'program', label: 'Program' },
        { key: 'sessions', label: 'Sessions', kind: 'number' },
        { key: 'present', label: 'Present', kind: 'number' },
        { key: 'absent', label: 'Absent', kind: 'number' },
        { key: 'excused', label: 'Excused', kind: 'number' },
        { key: 'attendance_rate', label: 'Attendance rate' },
      ],
      sections: [{ rows }],
      meta: {
        title: 'Program attendance',
        generatedAt: new Date().toISOString().slice(0, 10),
        params: {},
      },
    };
  },
};

export const eventAttendanceReport: ReportDefinition = {
  id: 'event-attendance',
  title: 'Event attendance',
  description: 'RSVPs and recorded attendance per event for a year.',
  category: 'operations',
  scopes: ['parish'],
  roles: [Role.GLOBAL_ADMIN, Role.DIOCESE_ADMIN, Role.PARISH_ADMIN, Role.PARISH_STAFF],
  params: [{ key: 'year', label: 'Year', type: 'year', required: true }],
  async run(tx, ctx, params) {
    const parishId = requireParish(ctx.parishId);
    const year = Number(params.year);
    if (!Number.isInteger(year) || year < 1900 || year > 2200) {
      throw new ApiError(400, 'Invalid year');
    }

    const events = await tx.event.findMany({
      where: {
        parishId,
        startAt: {
          gte: new Date(Date.UTC(year, 0, 1)),
          lt: new Date(Date.UTC(year + 1, 0, 1)),
        },
      },
      select: {
        name: true,
        eventType: true,
        startAt: true,
        attendance: { select: { rsvpStatus: true, attended: true } },
      },
      orderBy: { startAt: 'asc' },
    });

    const rows = events.map((event) => ({
      event: event.name,
      type: event.eventType,
      date: event.startAt.toISOString().slice(0, 10),
      rsvp_yes: event.attendance.filter((a) => a.rsvpStatus === 'YES').length,
      attended: event.attendance.filter((a) => a.attended).length,
    }));

    return {
      columns: [
        { key: 'event', label: 'Event' },
        { key: 'type', label: 'Type' },
        { key: 'date', label: 'Date', kind: 'date' },
        { key: 'rsvp_yes', label: 'RSVP yes', kind: 'number' },
        { key: 'attended', label: 'Attended', kind: 'number' },
      ],
      sections: [{ rows }],
      grandTotals: {
        event: null,
        type: null,
        date: null,
        rsvp_yes: rows.reduce((n, r) => n + r.rsvp_yes, 0),
        attended: rows.reduce((n, r) => n + r.attended, 0),
      },
      meta: {
        title: 'Event attendance',
        subtitle: `Year ${year}`,
        generatedAt: new Date().toISOString().slice(0, 10),
        params: { year: String(year) },
      },
    };
  },
};
