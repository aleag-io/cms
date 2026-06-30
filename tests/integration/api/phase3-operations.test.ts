/**
 * @phase:3
 *
 * Phase 3 parish-operations integration coverage:
 *   - PA-4 event RSVP capacity returns 409 when full;
 *   - MM-8 self-registration creates a PENDING member that is invisible in the
 *     parish directory until a Parish Admin approves it;
 *   - PA-16 adding a member to a second exclusive org of the same type returns
 *     409 and surfaces the conflicting membership for the resolve workflow;
 *   - PA-5 overlapping facility booking returns 409.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EventType,
  FacilityBookingStatus,
  OrganizationType,
  RsvpStatus,
} from '@prisma/client';
import { resetTestDb, testDb, FX } from '../../helpers/db';
import { asUser } from '../../helpers/auth';
import * as eventsRoute from '@/app/api/events/route';
import * as rsvpRoute from '@/app/api/events/[id]/rsvp/route';
import * as registrationsRoute from '@/app/api/registrations/route';
import * as approveRoute from '@/app/api/registrations/[id]/approve/route';
import * as directoryRoute from '@/app/api/parish/directory/route';
import * as orgsRoute from '@/app/api/organizations/route';
import * as orgMembershipsRoute from '@/app/api/organizations/[id]/memberships/route';
import * as facilitiesRoute from '@/app/api/facilities/route';
import * as facilityBookingsRoute from '@/app/api/facilities/bookings/route';

type IdCtx = { params: Promise<{ id: string }> };
const ctx = (id: string): IdCtx => ({ params: Promise.resolve({ id }) });

function jsonReq(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Phase 3 parish operations', () => {
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

  it('PA-4: event RSVP enforces capacity with 409', async () => {
    await asAdmin();
    const events = eventsRoute;
    const rsvp = rsvpRoute;

    const created = await events.POST(
      jsonReq('http://localhost/api/events', {
        name: 'Members-only retreat',
        eventType: EventType.OTHER,
        startAt: '2026-05-01T10:00:00Z',
        endAt: '2026-05-01T12:00:00Z',
        maxCapacity: 1,
      }),
    );
    const { event } = await created.json();

    // Alice RSVPs YES — fills the single slot.
    const alice = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAMember.id },
    });
    resetAuth = asUser(alice);
    const first = await rsvp.POST(
      jsonReq(`http://localhost/api/events/${event.id}/rsvp`, {
        rsvpStatus: RsvpStatus.YES,
      }),
      ctx(event.id),
    );
    expect(first.status).toBe(200);

    // Clergy RSVPs YES — event is full → 409.
    const clergy = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.clergyA.id },
    });
    resetAuth = asUser(clergy);
    const second = await rsvp.POST(
      jsonReq(`http://localhost/api/events/${event.id}/rsvp`, {
        rsvpStatus: RsvpStatus.YES,
      }),
      ctx(event.id),
    );
    expect(second.status).toBe(409);
  });

  it('MM-8: self-registration is invisible in the directory until approved', async () => {
    const registrations = registrationsRoute;
    const approve = approveRoute;
    const directory = directoryRoute;

    // Public intake — no session required.
    const submit = await registrations.POST(
      jsonReq('http://localhost/api/registrations', {
        parishId: FX.parishAId,
        firstName: 'Nora',
        lastName: 'Newcomer',
        email: 'nora@test.local',
      }),
    );
    expect(submit.status).toBe(200);

    // The PENDING member exists but is not in the directory view.
    const pending = await testDb.member.findFirstOrThrow({
      where: { firstName: 'Nora', lastName: 'Newcomer' },
    });
    expect(pending.status).toBe('PENDING');

    await asAdmin();
    const before = await directory.GET();
    const beforeData = await before.json();
    expect(
      beforeData.members.some((m: { id: string }) => m.id === pending.id),
    ).toBe(false);

    // Admin sees the registration in the review queue and approves it.
    const queue = await registrations.GET();
    const queueData = await queue.json();
    const reg = queueData.registrations.find(
      (r: { approvedMemberId: string | null }) =>
        r.approvedMemberId === pending.id,
    );
    expect(reg).toBeTruthy();

    const decided = await approve.POST(
      jsonReq(`http://localhost/api/registrations/${reg.id}/approve`, {
        decision: 'APPROVE',
      }),
      ctx(reg.id),
    );
    expect(decided.status).toBe(200);

    // Now visible.
    const after = await directory.GET();
    const afterData = await after.json();
    expect(
      afterData.members.some((m: { id: string }) => m.id === pending.id),
    ).toBe(true);
  });

  it('PA-16: second exclusive membership of the same type returns 409 with conflict', async () => {
    await asAdmin();
    const orgs = orgsRoute;
    const memberships = orgMembershipsRoute;

    const o1 = await (
      await orgs.POST(
        jsonReq('http://localhost/api/organizations', {
          name: 'Prayer Group North',
          organizationType: OrganizationType.PRAYER_GROUP,
        }),
      )
    ).json();
    const o2 = await (
      await orgs.POST(
        jsonReq('http://localhost/api/organizations', {
          name: 'Prayer Group South',
          organizationType: OrganizationType.PRAYER_GROUP,
        }),
      )
    ).json();
    expect(o1.organization.membershipMode).toBe('EXCLUSIVE');

    const join1 = await memberships.POST(
      jsonReq(
        `http://localhost/api/organizations/${o1.organization.id}/memberships`,
        {
          memberId: FX.members.aliceSmithId,
        },
      ),
      ctx(o1.organization.id),
    );
    expect(join1.status).toBe(200);

    const join2 = await memberships.POST(
      jsonReq(
        `http://localhost/api/organizations/${o2.organization.id}/memberships`,
        {
          memberId: FX.members.aliceSmithId,
        },
      ),
      ctx(o2.organization.id),
    );
    expect(join2.status).toBe(409);
    const conflictData = await join2.json();
    expect(conflictData.conflict.organizationId).toBe(o1.organization.id);
  });

  it('PA-5: overlapping facility booking returns 409', async () => {
    await asAdmin();
    const facilities = facilitiesRoute;
    const bookings = facilityBookingsRoute;

    const f = await (
      await facilities.POST(
        jsonReq('http://localhost/api/facilities', { name: 'Fellowship Hall' }),
      )
    ).json();

    const b1 = await bookings.POST(
      jsonReq('http://localhost/api/facilities/bookings', {
        facilityId: f.facility.id,
        title: 'Wedding reception',
        startAt: '2026-06-01T18:00:00Z',
        endAt: '2026-06-01T22:00:00Z',
        status: FacilityBookingStatus.CONFIRMED,
      }),
    );
    expect(b1.status).toBe(200);

    const b2 = await bookings.POST(
      jsonReq('http://localhost/api/facilities/bookings', {
        facilityId: f.facility.id,
        title: 'Birthday party',
        startAt: '2026-06-01T20:00:00Z',
        endAt: '2026-06-01T23:00:00Z',
        status: FacilityBookingStatus.CONFIRMED,
      }),
    );
    expect(b2.status).toBe(409);
  });
});
