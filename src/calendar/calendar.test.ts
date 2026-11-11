import { beforeEach, describe, expect, it } from 'vitest';
import {
  computeChronosAnalytics,
  computeTimezoneOverlapMatrix,
  defragDaySchedule,
  formatDecimalHour,
  parseNovaSchedulePrompt,
} from './engine';
import { useCalendar } from './store';
import { buildAgenda } from '@/data/agenda';

describe('Helix Calendar (Chronos) Engine & Store', () => {
  beforeEach(() => {
    useCalendar.getState().resetCalendar();
  });

  it('computes 14-hour global circadian overlap matrix with Golden Window hours', () => {
    const matrix = computeTimezoneOverlapMatrix(['Dubai', 'London', 'Singapore']);
    expect(matrix).toHaveLength(14);

    // 13:00–16:00 Dubai (GST) is 09:00–12:00 London (GMT) and 17:00–20:00 Singapore (SGT)
    const slot13 = matrix.find((s) => s.dubaiHour === 13);
    expect(slot13).toBeDefined();
    expect(slot13?.label).toBe('golden');
    expect(slot13?.harmonyScore).toBeGreaterThanOrEqual(82);
  });

  it('parses natural-language Nova Chronos prompts into rich scheduled drafts', () => {
    const events = useCalendar.getState().events;
    const draft = parseNovaSchedulePrompt(
      '30m NEOM Customer Deal Sync with Aisha & Priya',
      events,
    );
    expect(draft.durationMins).toBe(30);
    expect(draft.category).toBe('customer');
    expect(draft.roomId).toBe('room-orbit');
    expect(draft.attendeeIds).toContain('u-aisha');
    expect(draft.attendeeIds).toContain('u-priya');
  });

  it('defragments a day schedule by compacting meetings and inserting a Deep Work shield', () => {
    const events = useCalendar.getState().events;
    const { events: updated, reclaimedMins } = defragDaySchedule(events, 0);
    expect(reclaimedMins).toBeGreaterThanOrEqual(60);
    expect(updated.length).toBeGreaterThan(0);
  });

  it('schedules via Nova, books smart rooms, simulates booking links, and syncs to buildAgenda', () => {
    const store = useCalendar.getState();
    const initialCount = store.events.length;

    const draft = store.runNovaSchedule(
      '30m Q4 Architecture Sync with Omar today',
    );
    const created = store.commitNovaDraft(draft);
    expect(created).not.toBeNull();
    expect(useCalendar.getState().events.length).toBe(initialCount + 1);
    expect(created?.meetRoomId).toContain('meet-');

    // Verify buildAgenda picks up custom day-0 events from useCalendar
    const agenda = buildAgenda();
    expect(agenda.some((item) => item.title === created?.title)).toBe(true);

    // Book a smart room
    const roomEvt = store.bookSpatialRoom('room-orbit', 'London Deal War-Room', 45);
    expect(roomEvt).not.toBeNull();
    const updatedRoom = useCalendar
      .getState()
      .rooms.find((r) => r.id === 'room-orbit');
    expect(updatedRoom?.status).toBe('occupied');

    // Simulate a smart booking link hit
    const firstLinkId = useCalendar.getState().bookingLinks[0].id;
    const beforeBookings = useCalendar.getState().bookingLinks[0].bookingsThisMonth;
    const bookedEvt = store.simulateBookingFromLink(firstLinkId);
    expect(bookedEvt).not.toBeNull();
    const afterBookings = useCalendar
      .getState()
      .bookingLinks.find((l) => l.id === firstLinkId)?.bookingsThisMonth;
    expect(afterBookings).toBe((beforeBookings ?? 0) + 1);
  });

  it('converts low-signal meetings to Async HoloMeet Clips and computes focus telemetry', () => {
    const deflected = useCalendar.getState().convertLowSignalToAsyncClip();
    expect(deflected).toBeGreaterThanOrEqual(1);

    const afterMetrics = computeChronosAnalytics(useCalendar.getState().events);
    expect(afterMetrics.makerHoursWeek).toBeGreaterThan(14);
    expect(formatDecimalHour(14.5)).toBe('14:30');
  });
});
