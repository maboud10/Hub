/**
 * Helix Wellbeing — persisted zustand store ('nexus-wellbeing-v1').
 *
 * All personal data is keyed by user id (`users[userId]`), so switching
 * personas shows a different aura. Actions take the user id explicitly; the UI
 * always passes the signed-in person, and the bridge only ever reads the viewer.
 * The shared Hub Cup challenge totals are derived from logged activities.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { activitySteps, stepsToKm, teamOf } from './engine';
import { buildWellbeingSeed, DEFAULT_QUIET, isoDay, seedUserWellbeing, WELLBEING_DATA_VERSION } from './seed';
import type {
  ActivityKind,
  ActivityLog,
  BreathPatternId,
  CareBooking,
  CareFormat,
  CareLanguage,
  CareTopic,
  CheckIn,
  CircleId,
  JournalKind,
  Level5,
  Mood,
  PerkCategory,
  PerkClaim,
  PerkClaimStatus,
  QuietHoursSettings,
  SoundscapeId,
  UserWellbeing,
  WellbeingData,
} from './types';

export interface CheckInInput {
  mood: Mood;
  energy: Level5;
  stress: Level5;
  sleepHours: number;
  note?: string;
}

export interface ClaimInput {
  merchant: string;
  partnerId?: string;
  category: PerkCategory;
  amount: number;
  date: string;
  description: string;
  receiptName: string;
}

export interface WellbeingActions {
  /** Create the person's private record if it doesn't exist yet. */
  ensureUser(userId: string): void;
  checkIn(userId: string, input: CheckInInput): CheckIn;
  /** Snapshot today's Recharge score (read by the bridge); no-op when unchanged. */
  recordScore(userId: string, score: number): void;
  addJournal(userId: string, kind: JournalKind, text: string): boolean;
  removeJournal(userId: string, id: string): void;
  logBreath(userId: string, patternId: BreathPatternId, minutes: number): void;
  setSoundscape(userId: string, id: SoundscapeId): void;
  logActivity(userId: string, input: { kind: ActivityKind; minutes: number }): ActivityLog | null;
  setStepGoal(userId: string, steps: number): void;
  logFocusSprint(userId: string, minutes: number): void;
  markRxDone(userId: string, rxId: string): void;
  markWalkTalk(userId: string, eventId: string): void;
  requestCare(userId: string, input: { topic: CareTopic; language: CareLanguage; format: CareFormat }): CareBooking;
  bookCare(userId: string, bookingId: string, counsellorId: string, sessionAt: number, calendarHold: boolean): void;
  completeCareSession(userId: string, bookingId: string, followUpAt?: number): void;
  closeCare(userId: string, bookingId: string): void;
  cancelCare(userId: string, bookingId: string): void;
  toggleCircle(userId: string, circleId: CircleId): boolean;
  setQuietHours(userId: string, patch: Partial<QuietHoursSettings>): void;
  submitClaim(userId: string, input: ClaimInput, hrClaimId?: string): PerkClaim | null;
  syncClaim(userId: string, claimId: string, patch: { status: PerkClaimStatus; payrollMonth?: string; note?: string }): void;
  redeem(userId: string, partnerId: string, credits: number): void;
  toggleCampaign(userId: string, campaignId: string): boolean;
  resetDemo(): void;
}

export type WellbeingStore = WellbeingData & WellbeingActions;

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

const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const useWellbeing = create<WellbeingStore>()(
  persist(
    (set, get) => {
      /** Read-modify-write one person's record (seeding it on first touch). */
      const patchUser = (userId: string, fn: (u: UserWellbeing) => UserWellbeing) =>
        set((s) => {
          const current = s.users[userId] ?? seedUserWellbeing(userId);
          return { users: { ...s.users, [userId]: fn(current) } };
        });
      const userOf = (userId: string) => get().users[userId] ?? seedUserWellbeing(userId);

      return {
        ...buildWellbeingSeed(),

        ensureUser(userId) {
          if (!userId || get().users[userId]) return;
          set((s) => ({ users: { ...s.users, [userId]: seedUserWellbeing(userId) } }));
        },

        checkIn(userId, input) {
          const now = Date.now();
          const date = isoDay(now);
          const entry: CheckIn = {
            id: `ci-${userId}-${date}`,
            date,
            at: now,
            mood: input.mood,
            energy: input.energy,
            stress: input.stress,
            sleepHours: Math.round(Math.max(0, Math.min(14, input.sleepHours)) * 2) / 2,
            note: input.note?.trim() || undefined,
          };
          patchUser(userId, (u) => ({ ...u, checkins: [...u.checkins.filter((c) => c.date !== date), entry] }));
          // Also count — anonymously — in the Launchpad "Team pulse".
          const hub = useHub.getState();
          if (hub.sessionUserId === userId) hub.votePulse(input.mood);
          return entry;
        },

        recordScore(userId, score) {
          const date = isoDay(Date.now());
          const prev = get().users[userId]?.lastScore;
          if (prev && prev.date === date && prev.score === score) return;
          patchUser(userId, (u) => ({ ...u, lastScore: { date, score: Math.round(score) } }));
        },

        addJournal(userId, kind, text) {
          const clean = text.trim();
          if (clean.length < 2) return false;
          patchUser(userId, (u) => ({ ...u, journal: [{ id: uid('jr'), at: Date.now(), kind, text: clean.slice(0, 240) }, ...u.journal].slice(0, 60) }));
          return true;
        },

        removeJournal(userId, id) {
          patchUser(userId, (u) => ({ ...u, journal: u.journal.filter((j) => j.id !== id) }));
        },

        logBreath(userId, patternId, minutes) {
          const m = Math.max(0, Math.round(minutes * 10) / 10);
          if (!m) return;
          patchUser(userId, (u) => ({ ...u, breaths: [...u.breaths, { id: uid('br'), at: Date.now(), patternId, minutes: m }] }));
        },

        setSoundscape(userId, id) {
          patchUser(userId, (u) => ({ ...u, soundscape: id }));
        },

        logActivity(userId, { kind, minutes }) {
          const mins = Math.round(minutes);
          if (!(mins > 0) || mins > 600) return null;
          const now = Date.now();
          const location = useHub.getState().users.find((x) => x.id === userId)?.location;
          const steps = activitySteps(kind, mins);
          const log: ActivityLog = { id: uid('act'), at: now, date: isoDay(now), kind, minutes: mins, steps, km: stepsToKm(steps), teamId: teamOf(location) };
          patchUser(userId, (u) => ({ ...u, activities: [...u.activities, log] }));
          return log;
        },

        setStepGoal(userId, steps) {
          const goal = Math.round(Math.max(2000, Math.min(30000, steps)) / 500) * 500;
          patchUser(userId, (u) => ({ ...u, stepGoal: goal }));
        },

        logFocusSprint(userId, minutes) {
          patchUser(userId, (u) => ({ ...u, focusSprints: [...u.focusSprints, { at: Date.now(), minutes }].slice(-60) }));
        },

        markRxDone(userId, rxId) {
          const today = isoDay(Date.now());
          patchUser(userId, (u) => {
            const ids = u.doneRx.date === today ? u.doneRx.ids : [];
            return { ...u, doneRx: { date: today, ids: ids.includes(rxId) ? ids : [...ids, rxId] } };
          });
        },

        markWalkTalk(userId, eventId) {
          patchUser(userId, (u) => ({ ...u, walkTalks: u.walkTalks.includes(eventId) ? u.walkTalks : [...u.walkTalks, eventId] }));
        },

        requestCare(userId, input) {
          const booking: CareBooking = { id: uid('care'), createdAt: Date.now(), ...input, stage: 1 };
          // One open journey at a time: earlier open requests are superseded.
          patchUser(userId, (u) => ({ ...u, care: [booking, ...u.care.filter((b) => b.stage >= 2)] }));
          return booking;
        },

        bookCare(userId, bookingId, counsellorId, sessionAt, calendarHold) {
          patchUser(userId, (u) => ({ ...u, care: u.care.map((b) => (b.id === bookingId ? { ...b, counsellorId, sessionAt, calendarHold, stage: 2 } : b)) }));
        },

        completeCareSession(userId, bookingId, followUpAt) {
          patchUser(userId, (u) => ({ ...u, care: u.care.map((b) => (b.id === bookingId && b.stage === 2 ? { ...b, stage: 3, followUpAt } : b)) }));
        },

        closeCare(userId, bookingId) {
          patchUser(userId, (u) => ({ ...u, care: u.care.map((b) => (b.id === bookingId ? { ...b, stage: 4, closedAt: Date.now() } : b)) }));
        },

        cancelCare(userId, bookingId) {
          patchUser(userId, (u) => ({ ...u, care: u.care.filter((b) => b.id !== bookingId) }));
        },

        toggleCircle(userId, circleId) {
          const joined = userOf(userId).circles.includes(circleId);
          patchUser(userId, (u) => ({ ...u, circles: joined ? u.circles.filter((c) => c !== circleId) : [...u.circles, circleId] }));
          return !joined;
        },

        setQuietHours(userId, patch) {
          patchUser(userId, (u) => {
            const next = { ...DEFAULT_QUIET, ...u.quiet, ...patch };
            next.startHour = Math.max(0, Math.min(23, Math.round(next.startHour)));
            next.endHour = Math.max(0, Math.min(23, Math.round(next.endHour)));
            return { ...u, quiet: next };
          });
        },

        submitClaim(userId, input, hrClaimId) {
          const amount = Math.round(input.amount * 100) / 100;
          if (!(amount > 0) || input.merchant.trim().length < 2 || !input.receiptName) return null;
          const claim: PerkClaim = {
            id: uid('wb-cl'),
            createdAt: Date.now(),
            merchant: input.merchant.trim(),
            partnerId: input.partnerId,
            category: input.category,
            amount,
            date: input.date,
            description: input.description.trim() || input.merchant.trim(),
            receiptName: input.receiptName,
            status: 'submitted',
            hrClaimId,
          };
          patchUser(userId, (u) => ({ ...u, claims: [claim, ...u.claims] }));
          return claim;
        },

        syncClaim(userId, claimId, patch) {
          patchUser(userId, (u) => ({ ...u, claims: u.claims.map((c) => (c.id === claimId ? { ...c, ...patch } : c)) }));
        },

        redeem(userId, partnerId, credits) {
          if (!(credits > 0)) return;
          patchUser(userId, (u) => ({ ...u, redemptions: [...u.redemptions, { id: uid('rd'), at: Date.now(), partnerId, credits }] }));
        },

        toggleCampaign(userId, campaignId) {
          const joined = userOf(userId).campaigns.includes(campaignId);
          patchUser(userId, (u) => ({ ...u, campaigns: joined ? u.campaigns.filter((c) => c !== campaignId) : [...u.campaigns, campaignId] }));
          return !joined;
        },

        resetDemo() {
          set(buildWellbeingSeed());
          safeToast('info', 'Helix Wellbeing reset to its demo seed');
        },
      };
    },
    {
      name: 'nexus-wellbeing-v1',
      version: WELLBEING_DATA_VERSION,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s): WellbeingData => ({ version: s.version, users: s.users, challenge: s.challenge }),
      migrate: (persisted, version) => (version === WELLBEING_DATA_VERSION ? (persisted as WellbeingData) : buildWellbeingSeed()),
    },
  ),
);

/** Snapshot of one person's record (seeded on the fly, never mutating). */
export function wellbeingOf(userId: string): UserWellbeing {
  return useWellbeing.getState().users[userId] ?? seedUserWellbeing(userId);
}
