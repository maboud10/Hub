import { beforeEach, describe, expect, it } from 'vitest';
import type { BridgeViewer } from '@/lib/appBridge';
import { useHub } from '@/store/hub';
import { hasSpacesAccess, isWorkplaceAdmin } from './access';
import {
  VISITOR_JOURNEY_STEPS,
  applyVisitorAction,
  askSpacesNova,
  computePresenceToday,
  computeWorkplacePulse,
  defaultSiteForUser,
  detectGhostDesks,
  recommendDesks,
  requestTrackerState,
  scoreRooms,
  screenVisitor,
  sensorHealth,
  visitorTrackerState,
} from './engine';
import { api as spacesBridge } from './public';
import {
  FALLBACK_CAL_ROOMS,
  SITES,
  buildRooms,
  dateMapForOffset,
  desksOf,
  siteDay,
  siteFromText,
} from './seed';
import { useSpaces } from './store';

function makeViewer(userId: string, permsList: string[]): BridgeViewer {
  const users = useHub.getState().users;
  const user = users.find((u) => u.id === userId) ?? users[0];
  return {
    user,
    roles: useHub.getState().roles,
    perms: new Set(permsList),
  };
}

describe('Spaces ("Orbit") — engine, store & bridge', () => {
  beforeEach(() => {
    useSpaces.getState().resetDemo();
  });

  it('1. maps site locations and seeds all four global hubs with desks and zones', () => {
    expect(SITES.map((s) => s.id)).toEqual(['dubai', 'london', 'singapore', 'newyork']);
    expect(siteFromText('Dubai Marina')).toBe('dubai');
    expect(siteFromText('London UK')).toBe('london');
    expect(siteFromText('Singapore')).toBe('singapore');
    expect(siteFromText('New York NYC')).toBe('newyork');
    expect(defaultSiteForUser({ location: 'London' })).toBe('london');
    expect(desksOf('dubai').length).toBeGreaterThan(15);
    expect(desksOf('london').length).toBeGreaterThan(10);
  });

  it('2. computes office presence today and respects hiddenPresence privacy toggle', () => {
    const st = useSpaces.getState();
    const users = useHub.getState().users;
    const dates = dateMapForOffset(0);
    const initial = computePresenceToday(st.bookings, users, st.hiddenPresence, dates, 'dubai');
    expect(initial.some((p) => p.userId === 'u-omar')).toBe(true);

    // Hide Omar's presence
    useSpaces.getState().togglePresenceSharing('u-omar');
    const updatedSt = useSpaces.getState();
    const afterHide = computePresenceToday(
      updatedSt.bookings,
      users,
      updatedSt.hiddenPresence,
      dates,
      'dubai',
    );
    expect(afterHide.some((p) => p.userId === 'u-omar')).toBe(false);
  });

  it('3. recommends desks near teammates and prioritizes a target colleague ("Sit near my team")', () => {
    const st = useSpaces.getState();
    const users = useHub.getState().users;
    const priya = users.find((u) => u.id === 'u-priya')!;
    const date = siteDay('dubai', 0);

    const recs = recommendDesks({
      viewer: priya,
      site: 'dubai',
      date,
      bookings: st.bookings,
      users,
      nearUserId: 'u-omar', // Omar is at F-02 in Focus zone
    });

    expect(recs.length).toBeGreaterThan(0);
    const top = recs[0];
    expect(top.desk.zoneId).toBe('dxb-focus');
    expect(top.score).toBeGreaterThanOrEqual(80);
    expect(top.reasons.join(' ')).toMatch(/Omar|teammates|Engineering/i);
  });

  it('4. filters recommended desks by required amenities (standing, window, dual-monitor)', () => {
    const st = useSpaces.getState();
    const users = useHub.getState().users;
    const layla = users.find((u) => u.id === 'u-layla')!;
    const date = siteDay('dubai', 0);

    const standingRecs = recommendDesks({
      viewer: layla,
      site: 'dubai',
      date,
      bookings: st.bookings,
      users,
      requiredAmenities: ['standing', 'window'],
    });

    expect(standingRecs.length).toBeGreaterThan(0);
    for (const r of standingRecs) {
      expect(r.desk.amenities).toContain('standing');
      expect(r.desk.amenities).toContain('window');
    }
  });

  it('5. scores meeting rooms by availability, HoloMeet gear, and CO₂/temp/acoustic sensor health', () => {
    const st = useSpaces.getState();
    const rooms = buildRooms(FALLBACK_CAL_ROOMS);
    const date = siteDay('dubai', 0);

    // At 10:00–11:00 Nebula is booked, Orbit is free
    const scoredMorning = scoreRooms(rooms, {
      site: 'dubai',
      date,
      start: 10,
      end: 11,
      minCapacity: 6,
      bookings: st.bookings,
    });

    const nebula = scoredMorning.find((s) => s.room.id === 'room-nebula')!;
    const orbit = scoredMorning.find((s) => s.room.id === 'room-orbit')!;
    expect(nebula.available).toBe(false);
    expect(orbit.available).toBe(true);
    expect(orbit.health.grade).toBe('optimal');

    const badHealth = sensorHealth({ co2: 920, tempC: 25.5, noiseDb: 62 });
    expect(badHealth.co2Tone).toBe('rose');
    expect(badHealth.score).toBeLessThan(65);
  });

  it('6. books a desk with EV parking and smart locker add-ons and generates access codes', () => {
    const res = useSpaces.getState().bookDesk({
      userId: 'u-ethan',
      site: 'dubai',
      deskId: 'dxb-f-04',
      parkingSpotId: 'dxb-p-3',
      lockerId: 'dxb-l-5',
      checkInNow: true,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.booking.label).toBe('F-04');
      expect(res.booking.status).toBe('checked_in');
      expect(res.parkingBooking?.label).toBe('P-03');
      expect(res.parkingBooking?.accessCode).toMatch(/^GATE-/);
      expect(res.lockerBooking?.label).toBe('L-05');
      expect(res.lockerBooking?.accessCode).toMatch(/^PIN-/);
    }
  });

  it('7. prevents double-booking the same desk for overlapping hours by another person', () => {
    // F-01 in Dubai is booked by u-layla today 8.5..18
    const conflict = useSpaces.getState().bookDesk({
      userId: 'u-ethan',
      site: 'dubai',
      deskId: 'dxb-f-01',
      start: 10,
      end: 14,
    });
    expect(conflict.ok).toBe(false);
  });

  it('8. detects and releases ghost desks (un-checked-in bookings past grace window)', () => {
    const st = useSpaces.getState();
    const date = siteDay('dubai', 0);
    const ghostsBefore = detectGhostDesks(st.bookings, 'dubai', date, 12);
    expect(ghostsBefore.length).toBeGreaterThanOrEqual(1);
    expect(ghostsBefore.some((b) => b.userId === 'u-lucas')).toBe(true);

    const releasedCount = useSpaces.getState().releaseGhostDesks('dubai', date);
    expect(releasedCount).toBe(ghostsBefore.length);

    const ghostsAfter = detectGhostDesks(useSpaces.getState().bookings, 'dubai', date, 12);
    expect(ghostsAfter.length).toBe(0);
  });

  it('9. books a meeting room and auto-creates a hospitality catering ServiceRequest when catering is attached', () => {
    const beforeReqs = useSpaces.getState().requests.length;
    const res = useSpaces.getState().bookRoom({
      userId: 'u-layla',
      site: 'dubai',
      roomId: 'room-orbit',
      roomName: 'Orbit',
      start: 16,
      end: 17,
      title: 'CISO Board Prep',
      attendeeIds: ['u-layla', 'u-omar'],
      catering: { kind: 'coffee', headcount: 6, note: 'Sparkling water & espresso' },
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.booking.label).toBe('Orbit');
      expect(res.cateringRequest).toBeDefined();
      expect(res.cateringRequest?.kind).toBe('catering');
      expect(useSpaces.getState().requests.length).toBe(beforeReqs + 1);
    }
  });

  it('10. transitions a visitor through the 5-stage badge state machine', () => {
    expect(VISITOR_JOURNEY_STEPS).toHaveLength(5);
    const v = useSpaces.getState().registerVisitor({
      hostId: 'u-omar',
      name: 'Nadia Mansour',
      company: 'Desert Cloud Partners',
      email: 'nadia@desertcloud.ae',
      site: 'dubai',
      hour: 13.5,
      purpose: 'meeting',
      ndaRequired: true,
      parking: true,
    });

    expect(v.stage).toBe('invited');
    expect(v.badge).toMatch(/^HLX-DXB-/);
    expect(visitorTrackerState(v).current).toBe(0);

    const s1 = useSpaces.getState().advanceVisitor(v.id, 'preregister')!;
    expect(s1.stage).toBe('preregistered');
    expect(s1.ndaSigned).toBe(true);
    expect(visitorTrackerState(s1).current).toBe(1);

    const s2 = useSpaces.getState().advanceVisitor(v.id, 'arrive')!;
    expect(s2.stage).toBe('arrived');
    expect(visitorTrackerState(s2).current).toBe(2);

    const s3 = useSpaces.getState().advanceVisitor(v.id, 'badge')!;
    expect(s3.stage).toBe('badged');
    expect(visitorTrackerState(s3).current).toBe(3);

    const s4 = useSpaces.getState().advanceVisitor(v.id, 'checkout')!;
    expect(s4.stage).toBe('checked_out');
    expect(visitorTrackerState(s4).state).toBe('done');
    expect(visitorTrackerState(s4).current).toBe(5);
  });

  it('11. flags watchlist visitors, blocks badge issuance until cleared, and unblocks on clearance', () => {
    const watchMatch = screenVisitor('Marcus Vane', 'Northwind Recon');
    expect(watchMatch).toBeDefined();

    const flagged = useSpaces.getState().visitors.find((v) => v.id === 'vis-5')!;
    expect(flagged.watch).toBeDefined();
    expect(visitorTrackerState(flagged).state).toBe('blocked');

    // Attempt to print badge while blocked should not advance to 'badged'
    const blockedAttempt = applyVisitorAction(flagged, 'badge');
    expect(blockedAttempt.stage).toBe('arrived');

    // Clear watchlist hold
    useSpaces.getState().clearVisitorWatch(flagged.id);
    const afterClear = useSpaces.getState().advanceVisitor(flagged.id, 'badge')!;
    expect(afterClear.stage).toBe('badged');
  });

  it('12. creates and advances facility service requests through the 5-stage tracker', () => {
    const req = useSpaces.getState().createServiceRequest({
      requesterId: 'u-sara',
      site: 'dubai',
      kind: 'cleaning',
      title: 'Refresh L41 Quiet Zone whiteboard markers & glass wall',
      where: 'Quiet Zone · L41',
      priority: 'normal',
    });

    expect(req.stage).toBe('submitted');
    expect(requestTrackerState(req).current).toBe(0);

    const assigned = useSpaces.getState().advanceServiceRequest(req.id)!;
    expect(assigned.stage).toBe('assigned');
    expect(requestTrackerState(assigned).current).toBe(2);

    const inProg = useSpaces.getState().advanceServiceRequest(req.id)!;
    expect(inProg.stage).toBe('in_progress');
    expect(requestTrackerState(inProg).current).toBe(3);

    const done = useSpaces.getState().advanceServiceRequest(req.id)!;
    expect(done.stage).toBe('done');
    expect(requestTrackerState(done).state).toBe('done');
  });

  it('13. calculates workplace pulse, occupancy, zone utilization, and hybrid carbon saved', () => {
    const st = useSpaces.getState();
    const date = siteDay('dubai', 0);
    const pulse = computeWorkplacePulse('dubai', date, st.bookings, st.visitors, st.requests);

    expect(pulse.totalDesks).toBe(26);
    expect(pulse.bookedDesks).toBeGreaterThanOrEqual(7);
    expect(pulse.occupancyPct).toBeGreaterThan(20);
    expect(pulse.carbonSavedKg).toBeGreaterThan(50);
    expect(pulse.energySavedKwh).toBeGreaterThan(100);
    expect(pulse.zoneUtilization.length).toBeGreaterThanOrEqual(3);
  });

  it('14. generates explainable Nova copilot responses with actionable recommendations', () => {
    const st = useSpaces.getState();
    const users = useHub.getState().users;
    const rooms = buildRooms(FALLBACK_CAL_ROOMS);
    const date = siteDay('dubai', 0);

    const deskResp = askSpacesNova('Find me a desk near Omar', {
      viewer: users.find((u) => u.id === 'u-priya')!,
      site: 'dubai',
      date,
      bookings: st.bookings,
      visitors: st.visitors,
      requests: st.requests,
      rooms,
      users,
    });
    expect(deskResp.headline).toMatch(/Recommended desk/i);
    expect(deskResp.actions.some((a) => a.kind === 'book_desk')).toBe(true);

    const roomResp = askSpacesNova('Book a HoloMeet room for 6', {
      viewer: users[0],
      site: 'dubai',
      date,
      bookings: st.bookings,
      visitors: st.visitors,
      requests: st.requests,
      rooms,
      users,
    });
    expect(roomResp.actions.some((a) => a.kind === 'book_room')).toBe(true);
  });

  it('15. enforces permission gating on SpacesBridge (employees allowed, contractors blocked)', () => {
    const employeeViewer = makeViewer('u-omar', ['app:spaces']);
    const contractorViewer = makeViewer('u-alex', ['app:projects', 'app:chat']);

    expect(hasSpacesAccess(employeeViewer)).toBe(true);
    expect(hasSpacesAccess(contractorViewer)).toBe(false);

    // Contractor bridge calls must be rejected / empty
    expect(spacesBridge.paletteEntries(contractorViewer)).toEqual([]);
    expect(spacesBridge.presenceToday(contractorViewer)).toEqual([]);
    expect(spacesBridge.bookDesk(contractorViewer, { dayOffset: 0, site: 'Dubai' }).ok).toBe(false);
    expect(
      spacesBridge.registerVisitor(contractorViewer, {
        name: 'External Guest',
        dayOffset: 0,
        hour: 11,
      }).ok,
    ).toBe(false);

    // Employee bridge calls succeed
    expect(spacesBridge.paletteEntries(employeeViewer).length).toBeGreaterThan(5);
    expect(spacesBridge.presenceToday(employeeViewer).length).toBeGreaterThan(5);

    const deskRes = spacesBridge.bookDesk(employeeViewer, {
      dayOffset: 0,
      site: 'London',
      nearUserId: 'u-daniel',
    });
    expect(deskRes.ok).toBe(true);
    if (deskRes.ok) {
      expect(deskRes.desk).toMatch(/^[FCQ]-\d{2}$/);
    }

    const visRes = spacesBridge.registerVisitor(employeeViewer, {
      name: 'Samira Al-Farsi',
      company: 'MENA Ventures',
      dayOffset: 0,
      hour: 15,
      site: 'Dubai',
      purpose: 'meeting',
    });
    expect(visRes.ok).toBe(true);
  });

  it('16. identifies Workplace Ops admins (Operations, IT & Security, wildcard)', () => {
    const users = useHub.getState().users;
    const mateo = users.find((u) => u.id === 'u-mateo')!;
    const mei = users.find((u) => u.id === 'u-mei')!;
    expect(isWorkplaceAdmin(mateo, new Set(['app:spaces']))).toBe(true);
    expect(isWorkplaceAdmin(mei, new Set(['app:spaces']))).toBe(false);
    expect(isWorkplaceAdmin(mei, new Set(['*']))).toBe(true);
  });
});
