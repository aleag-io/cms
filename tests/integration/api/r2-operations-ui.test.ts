/**
 * @mvp2 @phase:10 @phase:11
 *
 * R2 Parish Operations exit-gate integration coverage for UI-facing APIs.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AttendanceStatus,
  EventType,
  MembershipMode,
  OrganizationType,
  ProgramType,
  RsvpStatus,
} from '@prisma/client';
import { resetTestDb, testDb, FX } from '../../helpers/db';
import { asUser } from '../../helpers/auth';
import * as programsRoute from '@/app/api/programs/route';
import * as enrollmentsRoute from '@/app/api/programs/[id]/enrollments/route';
import * as sessionsRoute from '@/app/api/programs/[id]/sessions/route';
import * as sessionAttendanceRoute from '@/app/api/programs/[id]/sessions/[sessionId]/attendance/route';
import * as orgsRoute from '@/app/api/organizations/route';
import * as orgMembershipsRoute from '@/app/api/organizations/[id]/memberships/route';
import * as eventsRoute from '@/app/api/events/route';
import * as rsvpRoute from '@/app/api/events/[id]/rsvp/route';
import * as eventAttendanceRoute from '@/app/api/events/[id]/attendance/route';
import * as facilitiesRoute from '@/app/api/facilities/route';
import * as facilityBookingsRoute from '@/app/api/facilities/bookings/route';
import * as messagesRoute from '@/app/api/messages/route';

type IdCtx = { params: Promise<{ id: string }> };
type SessionCtx = { params: Promise<{ id: string; sessionId: string }> };
const ctx = (id: string): IdCtx => ({ params: Promise.resolve({ id }) });
const sessionCtx = (id: string, sessionId: string): SessionCtx => ({
  params: Promise.resolve({ id, sessionId }),
});

function jsonReq(url: string, body: unknown, method = 'POST') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('R2 parish operations UI APIs', () => {
  let resetAuth: () => void;

  beforeEach(async () => {
    await resetTestDb();
  });

  afterEach(() => {
    resetAuth?.();
  });

  async function asAdmin() {
    const admin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAAdmin.id },
    });
    resetAuth = asUser(admin);
    return admin;
  }

  it('program enrollment + session attendance writes audit rows', async () => {
    await asAdmin();

    const created = await programsRoute.POST(
      jsonReq('http://localhost/api/programs', {
        name: 'Sunday School',
        programType: ProgramType.FAITH_FORMATION,
      }),
    );
    expect(created.status).toBe(200);
    const { program } = await created.json();

    const enroll = await enrollmentsRoute.POST(
      jsonReq(`http://localhost/api/programs/${program.id}/enrollments`, {
        memberId: FX.members.aliceSmithId,
      }),
      ctx(program.id),
    );
    expect(enroll.status).toBe(200);

    const sessionRes = await sessionsRoute.POST(
      jsonReq(`http://localhost/api/programs/${program.id}/sessions`, {
        title: 'Week 1',
        scheduledAt: '2026-07-12T10:00:00Z',
      }),
      ctx(program.id),
    );
    expect(sessionRes.status).toBe(200);
    const { session } = await sessionRes.json();

    const att = await sessionAttendanceRoute.POST(
      jsonReq(
        `http://localhost/api/programs/${program.id}/sessions/${session.id}/attendance`,
        {
          records: [
            {
              memberId: FX.members.aliceSmithId,
              status: AttendanceStatus.PRESENT,
            },
          ],
        },
      ),
      sessionCtx(program.id, session.id),
    );
    expect(att.status).toBe(200);

    const audits = await testDb.auditEntry.findMany({
      where: {
        entityType: { in: ['program_enrollment', 'program_session'] },
        parishId: FX.parishAId,
      },
      orderBy: { timestamp: 'asc' },
    });
    expect(
      audits.some(
        (a: { action: string }) =>
          a.action === 'operations.program_enrollment.create',
      ),
    ).toBe(true);
    expect(
      audits.some(
        (a: { action: string }) =>
          a.action === 'operations.program_session.attendance',
      ),
    ).toBe(true);
  });

  it('exclusive conflict 409 can be resolved by leave then rejoin', async () => {
    await asAdmin();

    const o1 = await (
      await orgsRoute.POST(
        jsonReq('http://localhost/api/organizations', {
          name: 'Prayer Alpha',
          organizationType: OrganizationType.PRAYER_GROUP,
        }),
      )
    ).json();
    const o2 = await (
      await orgsRoute.POST(
        jsonReq('http://localhost/api/organizations', {
          name: 'Prayer Beta',
          organizationType: OrganizationType.PRAYER_GROUP,
        }),
      )
    ).json();
    expect(o1.organization.membershipMode).toBe(MembershipMode.EXCLUSIVE);

    const first = await orgMembershipsRoute.POST(
      jsonReq(
        `http://localhost/api/organizations/${o1.organization.id}/memberships`,
        { memberId: FX.members.aliceSmithId },
      ),
      ctx(o1.organization.id),
    );
    expect(first.status).toBe(200);

    const conflict = await orgMembershipsRoute.POST(
      jsonReq(
        `http://localhost/api/organizations/${o2.organization.id}/memberships`,
        { memberId: FX.members.aliceSmithId },
      ),
      ctx(o2.organization.id),
    );
    expect(conflict.status).toBe(409);
    const conflictBody = await conflict.json();
    expect(conflictBody.conflict.organizationId).toBe(o1.organization.id);

    const leave = await orgMembershipsRoute.PATCH(
      jsonReq(
        `http://localhost/api/organizations/${o1.organization.id}/memberships`,
        {
          membershipId: conflictBody.conflict.membershipId,
          action: 'leave',
        },
        'PATCH',
      ),
      ctx(o1.organization.id),
    );
    expect(leave.status).toBe(200);

    const second = await orgMembershipsRoute.POST(
      jsonReq(
        `http://localhost/api/organizations/${o2.organization.id}/memberships`,
        { memberId: FX.members.aliceSmithId },
      ),
      ctx(o2.organization.id),
    );
    expect(second.status).toBe(200);
  });

  it('open membership mode allows multiple orgs of the same type', async () => {
    await asAdmin();

    const c1 = await (
      await orgsRoute.POST(
        jsonReq('http://localhost/api/organizations', {
          name: 'Committee A',
          organizationType: OrganizationType.COMMITTEE,
        }),
      )
    ).json();
    const c2 = await (
      await orgsRoute.POST(
        jsonReq('http://localhost/api/organizations', {
          name: 'Committee B',
          organizationType: OrganizationType.COMMITTEE,
        }),
      )
    ).json();
    expect(c1.organization.membershipMode).toBe(MembershipMode.OPEN);

    const m1 = await orgMembershipsRoute.POST(
      jsonReq(
        `http://localhost/api/organizations/${c1.organization.id}/memberships`,
        { memberId: FX.members.aliceSmithId },
      ),
      ctx(c1.organization.id),
    );
    const m2 = await orgMembershipsRoute.POST(
      jsonReq(
        `http://localhost/api/organizations/${c2.organization.id}/memberships`,
        { memberId: FX.members.aliceSmithId },
      ),
      ctx(c2.organization.id),
    );
    expect(m1.status).toBe(200);
    expect(m2.status).toBe(200);
  });

  it('event attendance PATCH marks attended after RSVP', async () => {
    await asAdmin();
    const created = await eventsRoute.POST(
      jsonReq('http://localhost/api/events', {
        name: 'Parish picnic',
        eventType: EventType.SOCIAL,
        startAt: '2026-08-01T16:00:00Z',
        endAt: '2026-08-01T19:00:00Z',
        maxCapacity: 10,
      }),
    );
    const { event } = await created.json();

    const alice = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAMember.id },
    });
    resetAuth = asUser(alice);
    const rsvp = await rsvpRoute.POST(
      jsonReq(`http://localhost/api/events/${event.id}/rsvp`, {
        rsvpStatus: RsvpStatus.YES,
      }),
      ctx(event.id),
    );
    expect(rsvp.status).toBe(200);

    await asAdmin();
    const mark = await eventAttendanceRoute.PATCH(
      jsonReq(
        `http://localhost/api/events/${event.id}/attendance`,
        { memberId: FX.members.aliceSmithId, attended: true },
        'PATCH',
      ),
      ctx(event.id),
    );
    expect(mark.status).toBe(200);
    const body = await mark.json();
    expect(body.attendance.attended).toBe(true);

    const list = await eventAttendanceRoute.GET(
      new Request(`http://localhost/api/events/${event.id}/attendance`),
      ctx(event.id),
    );
    expect(list.status).toBe(200);
    const listed = await list.json();
    expect(listed.attendance).toHaveLength(1);
  });

  it('facility bookings GET lists bookings; overlap still 409', async () => {
    await asAdmin();
    const fac = await (
      await facilitiesRoute.POST(
        jsonReq('http://localhost/api/facilities', {
          name: 'Hall A',
          capacity: 50,
        }),
      )
    ).json();

    const b1 = await facilityBookingsRoute.POST(
      jsonReq('http://localhost/api/facilities/bookings', {
        facilityId: fac.facility.id,
        title: 'Wedding',
        startAt: '2026-09-01T10:00:00Z',
        endAt: '2026-09-01T14:00:00Z',
      }),
    );
    expect(b1.status).toBe(200);

    const overlap = await facilityBookingsRoute.POST(
      jsonReq('http://localhost/api/facilities/bookings', {
        facilityId: fac.facility.id,
        title: 'Conflict',
        startAt: '2026-09-01T12:00:00Z',
        endAt: '2026-09-01T15:00:00Z',
      }),
    );
    expect(overlap.status).toBe(409);

    const list = await facilityBookingsRoute.GET(
      new Request('http://localhost/api/facilities/bookings'),
    );
    expect(list.status).toBe(200);
    const { bookings } = await list.json();
    expect(bookings).toHaveLength(1);
    expect(bookings[0].facility.name).toBe('Hall A');
  });

  it('GET /api/messages returns enqueued messages with status counts', async () => {
    await asAdmin();
    const post = await messagesRoute.POST(
      jsonReq('http://localhost/api/messages', {
        channel: 'EMAIL',
        subject: 'Hello parish',
        body: 'This is a test announcement.',
        audienceType: 'ALL_MEMBERS',
      }),
    );
    expect(post.status).toBe(200);

    const list = await messagesRoute.GET();
    expect(list.status).toBe(200);
    const data = await list.json();
    expect(data.messages.length).toBeGreaterThanOrEqual(1);
    expect(data.messages[0].subject).toBe('Hello parish');
    expect(data.messages[0].status).toBeTruthy();
  });
});
