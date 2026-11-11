/**
 * Spaces — "Orbit" persisted Zustand store ('nexus-spaces-v1').
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { BridgeSource } from '@/lib/appBridge';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import {
  advanceRequestStage,
  applyVisitorAction,
  defaultSiteForUser,
  detectGhostDesks,
  generateBadgeCode,
  isResourceFree,
  recommendDesks,
  screenVisitor,
} from './engine';
import {
  DESK_BY_ID,
  LOCKERS,
  PARKING,
  SITE_BY_ID,
  SPACES_DATA_VERSION,
  buildSpacesSeed,
  siteDay,
} from './seed';
import type {
  Booking,
  Catering,
  ServiceKind,
  ServicePriority,
  ServiceRequest,
  ServiceStage,
  SiteId,
  SpacesData,
  VisitPurpose,
  Visitor,
  VisitorAction,
} from './types';

export interface BookDeskInput {
  userId: string;
  site: SiteId;
  deskId?: string;
  date?: string;
  dayOffset?: number;
  start?: number;
  end?: number;
  nearUserId?: string;
  checkInNow?: boolean;
  parkingSpotId?: string;
  lockerId?: string;
  source?: BridgeSource;
}

export interface BookRoomInput {
  userId: string;
  site: SiteId;
  roomId: string;
  roomName: string;
  date?: string;
  dayOffset?: number;
  start: number;
  end: number;
  title: string;
  attendeeIds?: string[];
  catering?: Catering;
  calendarEventId?: string;
  meetRoomId?: string;
  source?: BridgeSource;
}

export interface RegisterVisitorInput {
  hostId: string;
  name: string;
  company?: string;
  email?: string;
  site: SiteId;
  date?: string;
  dayOffset?: number;
  hour: number;
  purpose?: VisitPurpose;
  note?: string;
  ndaRequired?: boolean;
  parking?: boolean;
  source?: BridgeSource;
}

export interface CreateServiceRequestInput {
  requesterId: string;
  site: SiteId;
  kind: ServiceKind;
  title: string;
  detail?: string;
  where?: string;
  priority?: ServicePriority;
  source?: BridgeSource;
}

export interface SpacesActions {
  selectedSite(userId?: string, fallbackLocation?: string): SiteId;
  setSite(userId: string, site: SiteId): void;
  togglePresenceSharing(userId: string): boolean;
  bookDesk(
    input: BookDeskInput,
  ):
    | { ok: true; booking: Booking; parkingBooking?: Booking; lockerBooking?: Booking }
    | { ok: false; error: string };
  checkInBooking(bookingId: string): Booking | null;
  checkOutBooking(bookingId: string): Booking | null;
  cancelBooking(bookingId: string): void;
  releaseGhostDesks(site: SiteId, date?: string): number;
  bookRoom(
    input: BookRoomInput,
  ): { ok: true; booking: Booking; cateringRequest?: ServiceRequest } | { ok: false; error: string };
  registerVisitor(input: RegisterVisitorInput): Visitor;
  advanceVisitor(visitorId: string, action: VisitorAction): Visitor | null;
  recordVisitorHostPing(visitorId: string, toRoute: string): void;
  recordVisitorInviteSent(visitorId: string, toRoute: string): void;
  escalateVisitorWatch(
    visitorId: string,
    patch: { caseId?: string; caseTo?: string; queuedLocally?: boolean },
  ): void;
  clearVisitorWatch(visitorId: string): void;
  createServiceRequest(input: CreateServiceRequestInput): ServiceRequest;
  advanceServiceRequest(
    requestId: string,
    targetStage?: ServiceStage,
    assignee?: string,
  ): ServiceRequest | null;
  rateServiceRequest(requestId: string, rating: number): void;
  linkRequestHelpdeskTicket(requestId: string, ticketId: string, ticketTo: string): void;
  dismissHint(id: string): void;
  resetDemo(): void;
}

export type SpacesStore = SpacesData & SpacesActions;

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

function safeToast(kind: 'success' | 'info' | 'warning' | 'error', title: string, desc?: string) {
  if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
    toast[kind](title, desc);
  }
}

export const useSpaces = create<SpacesStore>()(
  persist(
    (set, get) => ({
      ...buildSpacesSeed(),

      selectedSite(userId, fallbackLocation) {
        const st = get();
        if (userId && st.siteByUser[userId]) return st.siteByUser[userId];
        return defaultSiteForUser({ location: fallbackLocation ?? '' });
      },

      setSite(userId, site) {
        set((s) => ({
          siteByUser: { ...s.siteByUser, [userId]: site },
        }));
      },

      togglePresenceSharing(userId) {
        const st = get();
        const isHidden = st.hiddenPresence.includes(userId);
        const nextHidden = isHidden
          ? st.hiddenPresence.filter((id) => id !== userId)
          : [...st.hiddenPresence, userId];
        set({ hiddenPresence: nextHidden });
        const nowSharing = isHidden;
        safeToast(
          'info',
          nowSharing ? 'Office presence visible to teammates' : 'Office presence hidden',
          nowSharing
            ? 'Teammates can use "Sit near my team" to find a desk near you.'
            : 'Your desk booking remains active, but your location is private.',
        );
        return nowSharing;
      },

      bookDesk(input) {
        const st = get();
        const now = Date.now();
        const date = input.date ?? siteDay(input.site, input.dayOffset ?? 0, now);
        const start = input.start ?? 9;
        const end = input.end ?? 18;
        const users = useHub.getState().users;
        const viewer = users.find((u) => u.id === input.userId) ?? users[0];

        // Check if user already has an active desk booking on this site & date so we can replace/move it
        const existingUserDesk = st.bookings.find(
          (b) =>
            b.userId === input.userId &&
            b.site === input.site &&
            b.date === date &&
            b.kind === 'desk' &&
            (b.status === 'booked' || b.status === 'checked_in'),
        );

        let chosenDesk = input.deskId ? DESK_BY_ID[input.deskId] : undefined;
        if (!chosenDesk) {
          const recs = recommendDesks({
            viewer,
            site: input.site,
            date,
            start,
            end,
            bookings: st.bookings.filter((b) => b.id !== existingUserDesk?.id),
            users,
            nearUserId: input.nearUserId,
          });
          chosenDesk = recs[0]?.desk;
        }

        if (!chosenDesk || chosenDesk.site !== input.site) {
          return { ok: false, error: 'No available desks match your criteria for this day.' };
        }

        if (
          !isResourceFree(
            st.bookings,
            chosenDesk.id,
            date,
            start,
            end,
            existingUserDesk?.id,
          )
        ) {
          return { ok: false, error: `Desk ${chosenDesk.code} is already booked for those hours.` };
        }

        const seq = st.seq + 1;
        const booking: Booking = {
          id: `bk-desk-${seq}`,
          kind: 'desk',
          userId: input.userId,
          site: input.site,
          resourceId: chosenDesk.id,
          label: chosenDesk.code,
          date,
          start,
          end,
          status: input.checkInNow ? 'checked_in' : 'booked',
          createdAt: now,
          checkedInAt: input.checkInNow ? now : undefined,
          nearUserId: input.nearUserId,
          source: input.source,
          origin: 'user',
        };

        const extraBookings: Booking[] = [];
        let parkingBooking: Booking | undefined;
        let lockerBooking: Booking | undefined;

        if (input.parkingSpotId) {
          const spot = PARKING.find((p) => p.id === input.parkingSpotId && p.site === input.site);
          if (spot && isResourceFree(st.bookings, spot.id, date, start, end)) {
            parkingBooking = {
              id: `bk-park-${seq}`,
              kind: 'parking',
              userId: input.userId,
              site: input.site,
              resourceId: spot.id,
              label: spot.code,
              date,
              start,
              end,
              status: input.checkInNow ? 'checked_in' : 'booked',
              createdAt: now,
              checkedInAt: input.checkInNow ? now : undefined,
              accessCode: `GATE-${String(3000 + (seq % 6000)).padStart(4, '0')}`,
              origin: 'user',
            };
            extraBookings.push(parkingBooking);
          }
        }

        if (input.lockerId) {
          const locker = LOCKERS.find((l) => l.id === input.lockerId && l.site === input.site);
          if (locker && isResourceFree(st.bookings, locker.id, date, start, end)) {
            lockerBooking = {
              id: `bk-lock-${seq}`,
              kind: 'locker',
              userId: input.userId,
              site: input.site,
              resourceId: locker.id,
              label: locker.code,
              date,
              start,
              end,
              status: input.checkInNow ? 'checked_in' : 'booked',
              createdAt: now,
              checkedInAt: input.checkInNow ? now : undefined,
              accessCode: `PIN-${String(1000 + ((seq * 7) % 8900)).padStart(4, '0')}`,
              origin: 'user',
            };
            extraBookings.push(lockerBooking);
          }
        }

        set((s) => ({
          seq: seq + extraBookings.length,
          bookings: [
            booking,
            ...extraBookings,
            ...s.bookings.filter((b) => b.id !== existingUserDesk?.id),
          ],
        }));

        safeToast(
          'success',
          `Booked Desk ${chosenDesk.code} · ${SITE_BY_ID[input.site].label}`,
          `${date}${parkingBooking ? ` · Parking ${parkingBooking.label}` : ''}${lockerBooking ? ` · Locker ${lockerBooking.label}` : ''}`,
        );

        return { ok: true, booking, parkingBooking, lockerBooking };
      },

      checkInBooking(bookingId) {
        const now = Date.now();
        let updated: Booking | null = null;
        set((s) => ({
          bookings: s.bookings.map((b) => {
            if (b.id !== bookingId) return b;
            updated = { ...b, status: 'checked_in', checkedInAt: now };
            return updated;
          }),
        }));
        if (updated) {
          safeToast('success', `Checked in to ${(updated as Booking).label}`);
        }
        return updated;
      },

      checkOutBooking(bookingId) {
        const now = Date.now();
        let updated: Booking | null = null;
        set((s) => ({
          bookings: s.bookings.map((b) => {
            if (b.id !== bookingId) return b;
            updated = { ...b, status: 'checked_out', checkedOutAt: now };
            return updated;
          }),
        }));
        if (updated) {
          safeToast('info', `Checked out of ${(updated as Booking).label}`);
        }
        return updated;
      },

      cancelBooking(bookingId) {
        const now = Date.now();
        const target = get().bookings.find((b) => b.id === bookingId);
        set((s) => ({
          bookings: s.bookings.map((b) =>
            b.id === bookingId
              ? { ...b, status: 'cancelled', releasedAt: now, releaseReason: 'user' }
              : b,
          ),
        }));
        if (target) {
          safeToast('info', `Released ${target.label}`, `${SITE_BY_ID[target.site].label} · ${target.date}`);
        }
      },

      releaseGhostDesks(site, date) {
        const now = Date.now();
        const targetDate = date ?? siteDay(site, 0, now);
        const ghosts = detectGhostDesks(get().bookings, site, targetDate, 12);
        if (ghosts.length === 0) {
          safeToast('info', 'No ghost desks to release', `All booked desks in ${SITE_BY_ID[site].label} are checked in.`);
          return 0;
        }
        const ghostIds = new Set(ghosts.map((g) => g.id));
        set((s) => ({
          bookings: s.bookings.map((b) =>
            ghostIds.has(b.id)
              ? { ...b, status: 'released', releasedAt: now, releaseReason: 'ghost' }
              : b,
          ),
        }));
        safeToast(
          'success',
          `Released ${ghosts.length} ghost desk${ghosts.length > 1 ? 's' : ''}`,
          `Reclaimed ${ghosts.map((g) => g.label).join(', ')} in ${SITE_BY_ID[site].label}`,
        );
        return ghosts.length;
      },

      bookRoom(input) {
        const st = get();
        const now = Date.now();
        const date = input.date ?? siteDay(input.site, input.dayOffset ?? 0, now);

        if (!isResourceFree(st.bookings, input.roomId, date, input.start, input.end)) {
          return {
            ok: false,
            error: `${input.roomName} is already reserved during that time window.`,
          };
        }

        let seq = st.seq + 1;
        const booking: Booking = {
          id: `bk-room-${seq}`,
          kind: 'room',
          userId: input.userId,
          site: input.site,
          resourceId: input.roomId,
          label: input.roomName,
          date,
          start: input.start,
          end: input.end,
          status: 'booked',
          createdAt: now,
          title: input.title.trim() || `${input.roomName} Sync`,
          attendeeIds: input.attendeeIds ?? [input.userId],
          catering: input.catering,
          calendarEventId: input.calendarEventId,
          meetRoomId: input.meetRoomId,
          source: input.source,
          origin: 'user',
        };

        let cateringRequest: ServiceRequest | undefined;
        if (input.catering) {
          seq += 1;
          cateringRequest = {
            id: `req-${seq}`,
            code: `FR-${seq}`,
            kind: 'catering',
            title: `${input.catering.kind.charAt(0).toUpperCase()}${input.catering.kind.slice(1)} service for ${input.roomName} (${input.catering.headcount} guests)`,
            detail: input.catering.note || `Deliver to ${input.roomName} before ${input.start}:00.`,
            site: input.site,
            where: `Room ${input.roomName}`,
            requesterId: input.userId,
            assignee: 'Hospitality Team',
            priority: 'normal',
            stage: 'assigned',
            createdAt: now,
            assignedAt: now,
            origin: 'user',
          };
        }

        set((s) => ({
          seq,
          bookings: [booking, ...s.bookings],
          requests: cateringRequest ? [cateringRequest, ...s.requests] : s.requests,
        }));

        safeToast(
          'success',
          `Booked ${input.roomName} · ${SITE_BY_ID[input.site].label}`,
          `${booking.title}${cateringRequest ? ` · Catering ${cateringRequest.code} queued` : ''}`,
        );

        return { ok: true, booking, cateringRequest };
      },

      registerVisitor(input) {
        const st = get();
        const now = Date.now();
        const seq = st.seq + 1;
        const date = input.date ?? siteDay(input.site, input.dayOffset ?? 0, now);
        const company = input.company?.trim() || 'Guest';
        const watch = screenVisitor(input.name, company);
        const badge = generateBadgeCode(input.site, seq);
        const parkingCode = input.parking ? `VIP-B2-0${(seq % 8) + 1}` : undefined;

        const visitor: Visitor = {
          id: `vis-${seq}`,
          name: input.name.trim(),
          company,
          email: input.email?.trim() || undefined,
          hostId: input.hostId,
          site: input.site,
          date,
          hour: input.hour,
          purpose: input.purpose ?? 'meeting',
          note: input.note?.trim() || undefined,
          ndaRequired: input.ndaRequired ?? true,
          ndaSigned: false,
          idVerified: false,
          parking: Boolean(input.parking),
          parkingCode,
          stage: 'invited',
          invitedAt: now,
          badge,
          watch,
          source: input.source,
          origin: 'user',
        };

        set((s) => ({
          seq,
          visitors: [visitor, ...s.visitors],
        }));

        if (watch) {
          safeToast(
            'warning',
            `Visitor flagged by screening · ${visitor.name}`,
            watch.reason,
          );
        } else {
          safeToast(
            'success',
            `Visitor pass created · ${visitor.badge}`,
            `${visitor.name} (${visitor.company}) · ${SITE_BY_ID[input.site].label}`,
          );
        }
        return visitor;
      },

      advanceVisitor(visitorId, action) {
        const now = Date.now();
        let updated: Visitor | null = null;
        const seq = get().seq + 1;
        set((s) => ({
          seq,
          visitors: s.visitors.map((v) => {
            if (v.id !== visitorId) return v;
            updated = applyVisitorAction(v, action, now, seq);
            return updated;
          }),
        }));
        if (updated) {
          const v = updated as Visitor;
          if (action === 'badge') {
            safeToast('success', `Badge ${v.badge} printed`, `${v.name} is badged for ${SITE_BY_ID[v.site].label}`);
          } else if (action === 'checkout') {
            safeToast('info', `Checked out ${v.name}`, `Badge ${v.badge} deactivated`);
          } else if (action === 'arrive') {
            safeToast('info', `${v.name} arrived at kiosk`, 'Ready for host notification & badge print');
          } else if (action === 'preregister' || action === 'sign_nda') {
            safeToast('success', `NDA & pre-check verified for ${v.name}`);
          }
        }
        return updated;
      },

      recordVisitorHostPing(visitorId, toRoute) {
        const now = Date.now();
        set((s) => ({
          visitors: s.visitors.map((v) =>
            v.id === visitorId ? { ...v, hostPingedAt: now, hostPingTo: toRoute } : v,
          ),
        }));
      },

      recordVisitorInviteSent(visitorId, toRoute) {
        const now = Date.now();
        set((s) => ({
          visitors: s.visitors.map((v) =>
            v.id === visitorId ? { ...v, inviteSentAt: now, inviteTo: toRoute } : v,
          ),
        }));
      },

      escalateVisitorWatch(visitorId, patch) {
        const now = Date.now();
        set((s) => ({
          visitors: s.visitors.map((v) =>
            v.id === visitorId && v.watch
              ? {
                  ...v,
                  watch: {
                    ...v.watch,
                    caseId: patch.caseId ?? v.watch.caseId,
                    caseTo: patch.caseTo ?? v.watch.caseTo,
                    queuedLocally: patch.queuedLocally ?? v.watch.queuedLocally,
                    escalatedAt: now,
                  },
                }
              : v,
          ),
        }));
      },

      clearVisitorWatch(visitorId) {
        set((s) => ({
          visitors: s.visitors.map((v) =>
            v.id === visitorId && v.watch
              ? { ...v, watch: { ...v.watch, cleared: true } }
              : v,
          ),
        }));
        safeToast('success', 'Security hold cleared', 'Visitor may now be badged at reception.');
      },

      createServiceRequest(input) {
        const st = get();
        const now = Date.now();
        const seq = st.seq + 1;
        const req: ServiceRequest = {
          id: `req-${seq}`,
          code: `FR-${seq}`,
          kind: input.kind,
          title: input.title.trim(),
          detail: input.detail?.trim() || undefined,
          site: input.site,
          where: input.where?.trim() || SITE_BY_ID[input.site].label,
          requesterId: input.requesterId,
          assignee: 'Mateo García · Workplace Ops',
          priority: input.priority ?? 'normal',
          stage: 'submitted',
          createdAt: now,
          source: input.source,
          origin: 'user',
        };
        set((s) => ({
          seq,
          requests: [req, ...s.requests],
        }));
        safeToast('success', `Facility ticket ${req.code} logged`, `${req.title} · ${SITE_BY_ID[input.site].label}`);
        return req;
      },

      advanceServiceRequest(requestId, targetStage, assignee) {
        const now = Date.now();
        let updated: ServiceRequest | null = null;
        set((s) => ({
          requests: s.requests.map((r) => {
            if (r.id !== requestId) return r;
            updated = advanceRequestStage(r, targetStage, now, assignee);
            return updated;
          }),
        }));
        if (updated) {
          const r = updated as ServiceRequest;
          safeToast('success', `${r.code} → ${r.stage.replace('_', ' ')}`, r.title);
        }
        return updated;
      },

      rateServiceRequest(requestId, rating) {
        set((s) => ({
          requests: s.requests.map((r) => (r.id === requestId ? { ...r, rating } : r)),
        }));
        safeToast('success', `Rated facility service ${rating}/5 ★`);
      },

      linkRequestHelpdeskTicket(requestId, ticketId, ticketTo) {
        set((s) => ({
          requests: s.requests.map((r) =>
            r.id === requestId ? { ...r, ticketId, ticketTo } : r,
          ),
        }));
      },

      dismissHint(id) {
        set((s) => ({
          dismissed: s.dismissed.includes(id) ? s.dismissed : [...s.dismissed, id],
        }));
      },

      resetDemo() {
        const fresh = buildSpacesSeed(Date.now());
        set(fresh);
        safeToast('info', 'Spaces demo data reset');
      },
    }),
    {
      name: 'nexus-spaces-v1',
      version: SPACES_DATA_VERSION,
      storage: createJSONStorage(() => safeStorage),
      migrate: () => buildSpacesSeed(Date.now()),
    },
  ),
);
