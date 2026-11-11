/**
 * Helix Calendar — Persisted Zustand Store ('nexus-calendar-v1')
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { SigilId } from '@/projects/sigils';
import { toast } from '@/store/toast';
import { defragDaySchedule, parseNovaSchedulePrompt } from './engine';
import { buildCalendarSeed, CALENDAR_DATA_VERSION, EVENT_CATEGORY_META } from './seed';
import type {
  CalendarData,
  CalendarEvent,
  EventCategory,
  LinkedAppContext,
  NovaScheduleDraft,
} from './types';

export interface CreateCalendarEventInput {
  title: string;
  description?: string;
  category: EventCategory;
  dayOffset?: number;
  startHour: number;
  durationMins: number;
  organizerId?: string;
  attendeeIds?: string[];
  roomId?: string;
  roomName?: string;
  meetRoomId?: string;
  linkedContext?: LinkedAppContext;
  agendaBullets?: string[];
  sigil?: SigilId;
}

export interface CalendarActions {
  setSelectedDayOffset(offset: number): void;
  setViewMode(mode: 'day' | 'week'): void;
  setCategoryFilter(filter: EventCategory | 'all'): void;
  runNovaSchedule(prompt: string): NovaScheduleDraft;
  clearNovaDraft(): void;
  commitNovaDraft(draft?: NovaScheduleDraft): CalendarEvent | null;
  createEvent(input: CreateCalendarEventInput): CalendarEvent;
  deleteEvent(eventId: string): void;
  moveEventTime(eventId: string, startHour: number, dayOffset?: number): void;
  defragSchedule(dayOffset?: number): { reclaimedMins: number };
  bookSpatialRoom(roomId: string, title?: string, durationMins?: number): CalendarEvent | null;
  toggleBookingLink(linkId: string): void;
  simulateBookingFromLink(linkId: string): CalendarEvent | null;
  convertLowSignalToAsyncClip(): number;
  resetCalendar(): void;
}

export type CalendarStore = CalendarData & CalendarActions;

const memoryMap = new Map<string, string>();
const safeStorage: Storage = {
  getItem: (k) => {
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
        return localStorage.getItem(k);
      }
    } catch {
      // fallback
    }
    return memoryMap.get(k) ?? null;
  },
  setItem: (k, v) => {
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
        localStorage.setItem(k, v);
        return;
      }
    } catch {
      // fallback
    }
    memoryMap.set(k, v);
  },
  removeItem: (k) => {
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.removeItem === 'function') {
        localStorage.removeItem(k);
        return;
      }
    } catch {
      // fallback
    }
    memoryMap.delete(k);
  },
  clear: () => memoryMap.clear(),
  key: (i) => [...memoryMap.keys()][i] ?? null,
  get length() {
    return memoryMap.size;
  },
};

function safeToast(kind: 'success' | 'info', title: string, desc?: string) {
  if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
    toast[kind](title, desc);
  }
}

export const useCalendar = create<CalendarStore>()(
  persist(
    (set, get) => ({
      ...buildCalendarSeed(),

      setSelectedDayOffset(offset) {
        set({ selectedDayOffset: offset });
      },

      setViewMode(mode) {
        set({ viewMode: mode });
      },

      setCategoryFilter(filter) {
        set({ activeCategoryFilter: filter });
      },

      runNovaSchedule(prompt) {
        const draft = parseNovaSchedulePrompt(prompt, get().events);
        set({ activeNovaDraft: draft });
        return draft;
      },

      clearNovaDraft() {
        set({ activeNovaDraft: null });
      },

      commitNovaDraft(draftArg) {
        const draft = draftArg ?? get().activeNovaDraft;
        if (!draft) return null;
        const created = get().createEvent({
          title: draft.title,
          description: draft.rationale,
          category: draft.category,
          dayOffset: draft.dayOffset,
          startHour: draft.startHour,
          durationMins: draft.durationMins,
          attendeeIds: draft.attendeeIds,
          roomId: draft.roomId,
          roomName: draft.roomName,
          meetRoomId: draft.meetRoomId,
          agendaBullets: draft.agendaBullets,
        });
        set({ activeNovaDraft: null, selectedDayOffset: draft.dayOffset });
        return created;
      },

      createEvent(input) {
        const meta = EVENT_CATEGORY_META[input.category];
        const id = `cal-ev-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
        const slug = input.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .slice(0, 18);
        const ev: CalendarEvent = {
          id,
          title: input.title.trim() || 'Untitled Sync',
          description:
            input.description ??
            'Scheduled via Helix Chronos with automatic HoloMeet room & Nova AI Scribe.',
          category: input.category,
          sigil: input.sigil ?? (input.category === 'focus' ? 'spark' : 'orbit'),
          color: meta.color,
          dayOffset: input.dayOffset ?? get().selectedDayOffset,
          startHour: input.startHour,
          durationMins: input.durationMins,
          organizerId: input.organizerId ?? 'u-layla',
          attendeeIds: input.attendeeIds?.length ? input.attendeeIds : ['u-layla', 'u-omar'],
          roomId: input.roomId ?? 'room-nebula',
          roomName:
            input.roomName ??
            (input.category === 'focus'
              ? 'Focus Capsule · Do Not Disturb'
              : 'Atrium · Room Nebula + HoloMeet'),
          meetRoomId:
            input.category === 'focus' ? undefined : (input.meetRoomId ?? `meet-${slug || id}`),
          linkedContext: input.linkedContext,
          agendaBullets: input.agendaBullets?.length
            ? input.agendaBullets
            : [
                'Context alignment & Nova pre-read review',
                'Key decisions & cross-app action items',
              ],
          aiPrepBrief: 'Nova Scribe armed: live bilingual captions & decision extraction ready.',
          autoProtected: input.category === 'focus',
          highSignalScore: 93,
        };

        set((s) => ({
          events: [...s.events, ev].sort((a, b) => a.startHour - b.startHour),
        }));
        safeToast('success', `Scheduled "${ev.title}"`, `${ev.roomName} · ${ev.durationMins}m`);
        return ev;
      },

      deleteEvent(eventId) {
        const target = get().events.find((e) => e.id === eventId);
        set((s) => ({
          events: s.events.filter((e) => e.id !== eventId),
        }));
        if (target) {
          safeToast('info', `Removed "${target.title}"`, 'Slot released back to Maker time');
        }
      },

      moveEventTime(eventId, startHour, dayOffset) {
        set((s) => ({
          events: s.events.map((e) =>
            e.id === eventId
              ? {
                  ...e,
                  startHour: Math.max(7, Math.min(20, startHour)),
                  dayOffset: dayOffset ?? e.dayOffset,
                }
              : e,
          ),
        }));
        safeToast('info', 'Updated event slot', 'Chronos recalculated circadian harmony');
      },

      defragSchedule(dayOffsetArg) {
        const dayOffset = dayOffsetArg ?? get().selectedDayOffset;
        const res = defragDaySchedule(get().events, dayOffset);
        set({
          events: res.events,
          autoDefragEnabled: true,
          focusShieldActive: true,
        });
        safeToast(
          'success',
          'Schedule Defragmented by Chronos',
          `Compacted meetings & shielded 90m of uninterrupted Deep Work (+${res.reclaimedMins}m reclaimed)`,
        );
        return { reclaimedMins: res.reclaimedMins };
      },

      bookSpatialRoom(roomId, customTitle, durationMins = 45) {
        const room = get().rooms.find((r) => r.id === roomId);
        if (!room) return null;

        const title =
          customTitle?.trim() ||
          (room.capacity === 1
            ? `Deep Work Capsule · ${room.name.split('·')[0].trim()}`
            : `Instant Spatial Sync · ${room.name.split('·')[0].trim()}`);

        const ev = get().createEvent({
          title,
          category: room.capacity === 1 ? 'focus' : 'meet',
          dayOffset: get().selectedDayOffset,
          startHour: 14.0,
          durationMins,
          roomId: room.id,
          roomName: `${room.name} (${room.hub})`,
          sigil: room.sigil,
        });

        set((s) => ({
          rooms: s.rooms.map((r) =>
            r.id === roomId
              ? {
                  ...r,
                  status: 'occupied',
                  currentEventTitle: title,
                  nextFreeLabel: `Reserved (${durationMins}m)`,
                }
              : r,
          ),
        }));

        return ev;
      },

      toggleBookingLink(linkId) {
        set((s) => ({
          bookingLinks: s.bookingLinks.map((l) =>
            l.id === linkId ? { ...l, active: !l.active } : l,
          ),
        }));
      },

      simulateBookingFromLink(linkId) {
        const link = get().bookingLinks.find((l) => l.id === linkId);
        if (!link) return null;

        const ev = get().createEvent({
          title: `${link.title} (Auto-Routed)`,
          description: `Booked via Smart Link ${link.slug} (${link.routingMode.replace('_', ' ')}).`,
          category: link.category,
          dayOffset: 1,
          startHour: 11.5,
          durationMins: link.durationMins,
          attendeeIds: link.hostIds,
          sigil: link.sigil,
        });

        set((s) => ({
          bookingLinks: s.bookingLinks.map((l) =>
            l.id === linkId ? { ...l, bookingsThisMonth: l.bookingsThisMonth + 1 } : l,
          ),
        }));

        safeToast(
          'success',
          `Simulated booking on ${link.slug}`,
          `Added "${ev.title}" with HoloMeet room`,
        );
        return ev;
      },

      convertLowSignalToAsyncClip() {
        const createdFocus = get().createEvent({
          title: 'Reclaimed Deep Work · Replaced Status Sync with HoloMeet Clip',
          description: 'Status sync deflected to an async 3-minute HoloMeet Clip; 45m returned to Maker time.',
          category: 'focus',
          dayOffset: get().selectedDayOffset,
          startHour: 17.25,
          durationMins: 60,
          sigil: 'spark',
        });
        return createdFocus ? 60 : 0;
      },

      resetCalendar() {
        set(buildCalendarSeed());
        safeToast('info', 'Helix Calendar reset to baseline seed');
      },
    }),
    {
      name: 'nexus-calendar-v1',
      version: CALENDAR_DATA_VERSION,
      storage: createJSONStorage(() => safeStorage),
    },
  ),
);
