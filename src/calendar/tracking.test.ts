import { beforeEach, describe, expect, it } from 'vitest';
import { useCalendar } from './store';
import { bookingDayLabel, inviteeSummary, shortRoomName, trackBookedEvent, trackNovaDraft } from './tracking';

const NAMES: Record<string, string> = {
  'u-layla': 'Layla Haddad',
  'u-omar': 'Omar Farouk',
  'u-mei': 'Mei Tanaka',
  'u-daniel': 'Daniel Okafor',
};
const nameOf = (id: string) => NAMES[id];

describe('Chronos booking tracker', () => {
  beforeEach(() => {
    useCalendar.getState().resetCalendar();
  });

  it('holds a Nova draft on the Invites stage until it is confirmed', () => {
    const draft = useCalendar.getState().runNovaSchedule('45m Design Review with Omar & Mei tomorrow');
    const track = trackNovaDraft(draft, nameOf);
    expect(track.steps.map((s) => s.id)).toEqual(['understood', 'window', 'room', 'invites', 'booked']);
    expect(track.current).toBe(3);
    expect(track.state).toBe('active');
    expect(track.steps[1].at).toBe(`${draft.harmonyScore}%`);
    expect(track.steps[3].sub).toBe('Omar, Mei');
    expect(track.when.startsWith('Tomorrow · ')).toBe(true);
    expect(track.message).toBe('Nova is holding this golden window — confirm to send invites');
  });

  it('completes the journey from the committed event', () => {
    const store = useCalendar.getState();
    const draft = store.runNovaSchedule('30m Q4 Architecture Sync with Omar today');
    const created = store.commitNovaDraft();
    expect(created).not.toBeNull();
    expect(useCalendar.getState().activeNovaDraft).toBeNull();

    const track = trackBookedEvent(created!, draft.harmonyScore, nameOf);
    expect(track.state).toBe('done');
    expect(track.current).toBe(track.steps.length);
    expect(track.steps[4].sub).toBe('HoloMeet room');
  });

  it('treats Deep Work drafts as solo shields', () => {
    const draft = useCalendar.getState().runNovaSchedule('Shield 90m Deep Work block for RTL polish');
    const track = trackNovaDraft(draft, nameOf);
    expect(track.solo).toBe(true);
    expect(track.steps[3].sub).toBe('Just you');
    expect(track.message).toBe('Nova is holding this golden window — confirm to shield it');
  });

  it('formats rooms, invitees and day labels', () => {
    expect(shortRoomName('Room Nebula · Holo-Boardroom + HoloMeet')).toBe('Room Nebula');
    expect(inviteeSummary(['u-layla', 'u-omar', 'u-mei', 'u-daniel'], 'u-layla', nameOf)).toBe('Omar, Mei +1');
    expect(inviteeSummary(['u-layla'], 'u-layla', nameOf)).toBeNull();
    expect(inviteeSummary(['u-layla', 'u-sara'], 'u-layla', () => undefined)).toBe('Sara');
    expect(bookingDayLabel(0)).toBe('Today');
    expect(bookingDayLabel(1)).toBe('Tomorrow');
    expect(bookingDayLabel(3)).toBe('Day +3');
  });
});
