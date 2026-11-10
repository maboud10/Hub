/**
 * Performance & OKRs store. Every action behaves like an API endpoint: it resolves
 * the actor (session user, or an explicit bridge viewer), re-checks permissions and
 * privacy rules, validates input, writes audit entries for sensitive operations and
 * notifies the people affected with deep links.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { User } from '@/types';
import type { BridgeSource, BridgeViewer } from '@/lib/appBridge';
import { useHub } from '@/store/hub';
import { effectivePermissions, hasPermission } from '@/lib/rbac';
import { uid } from '@/lib/id';
import {
  APP_PERM,
  canAddEvidence,
  canCalibrate,
  canCheckIn,
  canCreateObjective,
  canEditGrowth,
  canEditObjective,
  canNudge,
  canViewObjective,
  hasApp,
  isAbove,
  isAdmin,
  isManagerOf,
  isSeriesMember,
  reviewAccess,
  type PerfViewer,
} from './access';
import { CADENCE_DAYS, PERF_DATA_VERSION, PERF_STORE_KEY, PHASE } from './constants';
import { canAnswerPeer, canEditSelf, canWriteManager, getPhase, validatePhases } from './cycle';
import { krStatus, milestoneTotal } from './okr';
import { createPerfSeed } from './seed';
import type {
  BoxAxis,
  Cadence,
  CompetencyId,
  Cycle,
  CycleFeedback,
  CyclePhase,
  Evidence,
  Feedback,
  FeedbackKind,
  FeedbackVisibility,
  GoalStatus,
  GrowthGoal,
  KeyResult,
  LadderId,
  MetricType,
  Objective,
  OkrComment,
  OkrLevel,
  OverallRating,
  PerfData,
  PerfResult,
  PhaseKey,
  Potential,
  Review,
  ReviewTemplate,
  Score5,
  TemplateQuestion,
  UpwardDimension,
  Visibility,
} from './types';

const DAY = 86_400_000;

/* ───────────────────────── Inputs ───────────────────────── */

export interface KrInput {
  title: string;
  metric: MetricType;
  start: number;
  target: number;
  unit?: string;
  decimals?: number;
  ceiling?: boolean;
  ownerId?: string;
  confidence?: number;
  milestones?: string[];
}

export interface ObjectiveInput {
  title: string;
  description?: string;
  level: OkrLevel;
  ownerId: string;
  coOwnerIds?: string[];
  periodId?: string;
  parentId?: string;
  visibility: Visibility;
  tags?: string[];
  keyResults: KrInput[];
}

export interface CheckinEntry {
  krId: string;
  value: number;
  confidence: number;
  note?: string;
  /** Milestone KRs: ids of milestones that are done. */
  doneMilestones?: string[];
}

export interface GiveFeedbackInput {
  toId: string;
  kind: FeedbackKind;
  visibility: FeedbackVisibility;
  situation?: string;
  behaviour?: string;
  impact?: string;
  body: string;
  competency?: CompetencyId;
  objectiveId?: string;
  requestId?: string;
  kudosValue?: Feedback['kudosValue'];
}

export interface CycleInput {
  name: string;
  periodId: string;
  phases: CyclePhase[];
  departments: Cycle['departments'];
  templateId: string;
  peerAnonymous: boolean;
  upwardMin: number;
  launch: boolean;
}

type Undo = () => PerfResult;

/* ───────────────────────── Actor & helpers ───────────────────────── */

interface Actor {
  user: User;
  perms: ReadonlySet<string>;
  users: User[];
  v: PerfViewer;
}

function actorOf(viewer?: BridgeViewer | null): Actor | null {
  const hub = useHub.getState();
  const user = viewer?.user ?? hub.users.find((u) => u.id === hub.sessionUserId) ?? null;
  if (!user || !user.active) return null;
  const perms = viewer?.perms ?? effectivePermissions(user, hub.roles);
  return { user, perms, users: hub.users, v: { id: user.id, perms } };
}

const fail = (error: string) => ({ ok: false as const, error });
const okr = <T extends object>(extra: T, message?: string) => ({ ok: true as const, message, ...extra });
const first = (u: User | undefined | null) => (u?.name ?? 'Someone').split(' ')[0];
const nameOf = (users: User[], id: string) => users.find((u) => u.id === id)?.name ?? 'Unknown';
const clean = (s: string | undefined, max = 4000) => (s ?? '').replace(/\s+$/g, '').slice(0, max);
const words = (s: string | undefined) => (s ?? '').trim().split(/\s+/).filter(Boolean).length;

function notify(userIds: string[], n: { kind?: 'hr' | 'kudos' | 'work'; title: string; body?: string; link: string }, exceptId?: string) {
  const ids = [...new Set(userIds)].filter((id) => id && id !== exceptId);
  if (!ids.length) return;
  useHub.getState().pushNotifications(ids, { kind: n.kind ?? 'hr', title: n.title, body: n.body, link: n.link });
}

function audit(actorId: string, action: string, target: string, detail?: string, severity: 'info' | 'warning' | 'critical' = 'info', outcome: 'success' | 'denied' = 'success') {
  useHub.getState().logAudit({ actorId, action, target, detail, outcome, severity });
}

/** Active users who can use Performance & OKRs. */
export function performanceUsers(): User[] {
  const hub = useHub.getState();
  return hub.users.filter((u) => u.active && hasPermission(effectivePermissions(u, hub.roles), APP_PERM));
}

const viewedPackets = new Set<string>();

/* ───────────────────────── Store ───────────────────────── */

export interface PerfActions {
  // OKRs
  createObjective(input: ObjectiveInput): PerfResult<{ id: string }>;
  updateObjective(id: string, patch: Partial<Pick<Objective, 'title' | 'description' | 'visibility' | 'tags' | 'parentId' | 'ownerId' | 'coOwnerIds'>>): PerfResult;
  deleteObjective(id: string): PerfResult<{ undo: Undo }>;
  addKeyResult(objectiveId: string, input: KrInput): PerfResult<{ id: string }>;
  updateKeyResult(id: string, patch: Partial<Pick<KeyResult, 'title' | 'target' | 'start' | 'unit' | 'ownerId' | 'decimals'>>): PerfResult;
  deleteKeyResult(id: string): PerfResult<{ undo: Undo }>;
  checkIn(entries: CheckinEntry[]): PerfResult<{ updated: number; improved: number; completed: string[] }>;
  toggleMilestone(krId: string, milestoneId: string): PerfResult<{ completed: boolean }>;
  closeObjective(id: string, scores: Record<string, number>, reflection: string): PerfResult;
  reopenObjective(id: string): PerfResult;
  addComment(objectiveId: string, body: string, kind?: OkrComment['kind']): PerfResult<{ id: string }>;
  // Quarterly check-ins
  saveSelf(reviewId: string, patch: { answers?: Record<string, string>; ratings?: Partial<Record<CompetencyId, Score5>>; cited?: string[] }): PerfResult;
  submitSelf(reviewId: string): PerfResult;
  nominatePeers(reviewId: string, peerIds: string[]): PerfResult<{ requested: number; proposed: number }>;
  approveNominations(reviewId: string, keepAuthorIds: string[], addAuthorIds?: string[]): PerfResult<{ requested: number }>;
  submitPeer(feedbackId: string, input: { start: string; stop: string; continue: string; highlight?: CompetencyId; anonymous: boolean }): PerfResult;
  declinePeer(feedbackId: string, reason?: string): PerfResult;
  submitUpward(feedbackId: string, input: { scores: Partial<Record<UpwardDimension, Score5>>; keep: string; change: string }): PerfResult;
  saveManager(reviewId: string, patch: { answers?: Record<string, string>; ratings?: Partial<Record<CompetencyId, Score5>>; overall?: OverallRating; potential?: Potential; privateNote?: string; cited?: string[] }): PerfResult;
  submitManager(reviewId: string): PerfResult;
  calibrate(reviewId: string, performance: BoxAxis, potential: BoxAxis, note?: string): PerfResult;
  clearCalibration(reviewId: string): PerfResult;
  setCalibrationLock(cycleId: string, locked: boolean): PerfResult;
  releaseReview(reviewId: string): PerfResult;
  releaseAll(cycleId: string): PerfResult<{ count: number }>;
  acknowledgeReview(reviewId: string, comment?: string): PerfResult;
  scheduleConversation(reviewId: string, at: number): PerfResult;
  viewPacket(reviewId: string): void;
  // Cycles admin
  createCycle(input: CycleInput): PerfResult<{ id: string; participants: number }>;
  updateCycle(id: string, patch: { name?: string; phases?: CyclePhase[] }): PerfResult;
  setCycleStatus(id: string, status: Cycle['status']): PerfResult;
  updateTemplate(id: string, questions: TemplateQuestion[], competencies?: boolean): PerfResult;
  nudge(cycleId: string, userIds: string[], phase: PhaseKey): PerfResult<{ count: number }>;
  // Continuous feedback
  giveFeedback(input: GiveFeedbackInput): PerfResult<{ id: string; kudos: boolean }>;
  thankFeedback(id: string): PerfResult;
  deleteFeedback(id: string): PerfResult<{ undo: Undo }>;
  requestFeedback(input: { respondentIds: string[]; topic: string; note?: string; dueAt: number }): PerfResult<{ id: string }>;
  declineRequest(requestId: string): PerfResult;
  remindRequest(requestId: string): PerfResult<{ count: number }>;
  closeRequest(requestId: string): PerfResult;
  addNote(subjectId: string, body: string): PerfResult<{ id: string }>;
  deleteNote(id: string): PerfResult<{ undo: Undo }>;
  // 1:1s
  createSeries(input: { partnerId: string; kind: 'manager' | 'mentor'; cadence: Cadence; firstAt: number }): PerfResult<{ id: string }>;
  addAgendaItem(seriesId: string, text: string, source?: 'nova' | 'review' | 'okr' | 'feedback'): PerfResult<{ id: string }>;
  toggleAgendaItem(seriesId: string, itemId: string): PerfResult;
  removeAgendaItem(seriesId: string, itemId: string): PerfResult<{ undo: Undo }>;
  reorderAgenda(seriesId: string, ids: string[]): PerfResult;
  saveSharedNotes(seriesId: string, text: string): PerfResult;
  savePrivateNotes(seriesId: string, text: string): PerfResult;
  addActionItem(seriesId: string, input: { text: string; ownerId: string; dueAt?: number }): PerfResult<{ id: string }>;
  toggleActionItem(seriesId: string, itemId: string): PerfResult;
  removeActionItem(seriesId: string, itemId: string): PerfResult;
  setMood(seriesId: string, mood: number): PerfResult;
  completeMeeting(seriesId: string): PerfResult<{ meetingId: string; carried: number }>;
  rescheduleSeries(seriesId: string, at: number, cadence?: Cadence): PerfResult;
  // Growth
  addGoal(userId: string, input: { title: string; competency?: CompetencyId; why?: string; dueAt?: number; actions: string[]; learning?: { title: string; to: string }[] }): PerfResult<{ id: string }>;
  updateGoal(id: string, patch: Partial<Pick<GrowthGoal, 'title' | 'why' | 'dueAt' | 'status' | 'competency'>>): PerfResult;
  toggleGoalAction(goalId: string, actionId: string): PerfResult<{ status: GoalStatus }>;
  addGoalAction(goalId: string, text: string): PerfResult;
  deleteGoal(id: string): PerfResult<{ undo: Undo }>;
  setLevel(userId: string, ladderId: LadderId, levelId: string): PerfResult;
  // Evidence
  addEvidence(input: { userId: string; title: string; detail?: string; source: BridgeSource; keyResultId?: string }, viewer?: BridgeViewer | null): PerfResult<{ id: string }>;
  removeEvidence(id: string): PerfResult;
  // Demo
  resetDemo(): void;
}

export type PerfStore = PerfData & PerfActions;

const DATA_KEYS: (keyof PerfData)[] = ['version', 'seededAt', 'periods', 'objectives', 'keyResults', 'comments', 'cycles', 'templates', 'reviews', 'cycleFeedback', 'feedback', 'requests', 'notes', 'series', 'levels', 'goals', 'evidence'];

// Remove legacy keys (the app is new, but be tidy with earlier prototypes).
try {
  if (typeof localStorage !== 'undefined') for (const k of ['nexus-performance', 'nexus-perf', 'nexus-okrs']) localStorage.removeItem(k);
} catch {
  /* storage unavailable */
}

export const usePerf = create<PerfStore>()(
  persist(
    (set, get) => {
      /** Resolve the actor and require app access. */
      const need = (viewer?: BridgeViewer | null): Actor | { error: string } => {
        const a = actorOf(viewer);
        if (!a) return { error: 'You are not signed in.' };
        if (!hasApp(a.v)) return { error: 'You don’t have access to Performance & OKRs.' };
        return a;
      };
      const isErr = (x: Actor | { error: string }): x is { error: string } => 'error' in x;

      const objective = (id: string) => get().objectives.find((o) => o.id === id);
      const kr = (id: string) => get().keyResults.find((k) => k.id === id);
      const review = (id: string) => get().reviews.find((r) => r.id === id);
      const cycleOf = (id: string) => get().cycles.find((c) => c.id === id);
      const periodOf = (id: string) => get().periods.find((p) => p.id === id);

      const patchReview = (id: string, fn: (r: Review) => Review) => set((s) => ({ reviews: s.reviews.map((r) => (r.id === id ? fn(r) : r)) }));
      const patchSeries = (id: string, fn: (s: PerfData['series'][number]) => PerfData['series'][number]) => set((s) => ({ series: s.series.map((x) => (x.id === id ? fn(x) : x)) }));
      const patchGoal = (id: string, fn: (g: GrowthGoal) => GrowthGoal) => set((s) => ({ goals: s.goals.map((g) => (g.id === id ? fn(g) : g)) }));

      const krFrom = (objectiveId: string, input: KrInput, ownerId: string, order: number): KeyResult | string => {
        const title = input.title.trim();
        if (title.length < 4) return 'Each key result needs a title (4+ characters).';
        if (!Number.isFinite(input.start) || !Number.isFinite(input.target)) return `“${title}”: start and target must be numbers.`;
        const milestones = input.metric === 'milestone' ? (input.milestones ?? []).map((m) => m.trim()).filter(Boolean) : undefined;
        if (input.metric === 'milestone' && (!milestones || milestones.length < 2)) return `“${title}”: add at least two milestones.`;
        if (input.metric !== 'boolean' && input.metric !== 'milestone' && !input.ceiling && input.start === input.target) return `“${title}”: the target must differ from the start.`;
        const id = uid('kr');
        return {
          id,
          objectiveId,
          title,
          metric: input.metric,
          start: input.metric === 'boolean' || input.metric === 'milestone' ? 0 : input.start,
          target: input.metric === 'boolean' ? 1 : input.metric === 'milestone' ? milestones!.length : input.target,
          current: input.metric === 'boolean' || input.metric === 'milestone' ? 0 : input.start,
          unit: input.unit?.trim() || undefined,
          decimals: input.decimals,
          ceiling: input.ceiling || undefined,
          ownerId: input.ownerId ?? ownerId,
          confidence: Math.max(1, Math.min(10, Math.round(input.confidence ?? 7))),
          checkins: [],
          milestones: milestones?.map((m, i) => ({ id: `${id}-m${i + 1}`, title: m, done: false })),
          order,
          createdAt: Date.now(),
        };
      };

      /** Would `parentId` create a cycle for `id`? */
      const createsCycle = (id: string, parentId: string | undefined) => {
        let cur = parentId;
        const seen = new Set<string>();
        while (cur && !seen.has(cur)) {
          if (cur === id) return true;
          seen.add(cur);
          cur = objective(cur)?.parentId;
        }
        return false;
      };

      const LEVEL_RANK: Record<OkrLevel, number> = { company: 0, team: 1, individual: 2 };

      const validParent = (a: Actor, level: OkrLevel, parentId: string | undefined, periodId: string): string | null => {
        if (!parentId) return null;
        const p = objective(parentId);
        if (!p) return 'The parent objective no longer exists.';
        if (!canViewObjective(a.v, a.users, p)) return 'You can’t align to an objective you can’t see.';
        if (p.periodId !== periodId) return 'Align to an objective in the same period.';
        if (LEVEL_RANK[p.level] >= LEVEL_RANK[level]) return 'Align to a higher-level objective (company → team → individual).';
        return null;
      };

      return {
        ...createPerfSeed(),

        /* ═════════════════════ OKRs ═════════════════════ */

        createObjective(input) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const title = input.title.trim();
          if (title.length < 4) return fail('Give the objective a title (4+ characters).');
          if (title.length > 120) return fail('Keep the title under 120 characters.');
          const owner = a.users.find((u) => u.id === input.ownerId && u.active);
          if (!owner) return fail('Choose an active owner.');
          const allowed = canCreateObjective(a.v, a.users, input.level, owner.id);
          if (!allowed.ok) {
            audit(a.user.id, 'performance.objective.create', title, allowed.reason, 'warning', 'denied');
            return fail(allowed.reason);
          }
          const periodId = input.periodId ?? get().periods[0]?.id;
          if (!periodOf(periodId)) return fail('Unknown period.');
          const parentErr = validParent(a, input.level, input.parentId, periodId);
          if (parentErr) return fail(parentErr);
          if (input.keyResults.length > 7) return fail('Keep it focused: at most 7 key results.');
          const id = uid('obj');
          const krs: KeyResult[] = [];
          for (const [i, k] of input.keyResults.entries()) {
            const r = krFrom(id, k, owner.id, i);
            if (typeof r === 'string') return fail(r);
            krs.push(r);
          }
          const now = Date.now();
          const o: Objective = {
            id,
            title,
            description: input.description?.trim() || undefined,
            level: input.level,
            department: owner.department,
            ownerId: owner.id,
            coOwnerIds: [...new Set(input.coOwnerIds ?? [])].filter((x) => x !== owner.id),
            periodId,
            parentId: input.parentId || undefined,
            visibility: input.visibility,
            tags: (input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 6),
            state: 'active',
            createdAt: now,
            createdBy: a.user.id,
            updatedAt: now,
          };
          set((s) => ({ objectives: [...s.objectives, o], keyResults: [...s.keyResults, ...krs] }));
          if (input.level === 'company') audit(a.user.id, 'performance.objective.created', title, 'Company objective', 'info');
          const link = `/performance/okrs/${id}`;
          if (owner.id !== a.user.id) notify([owner.id], { title: `${first(a.user)} set an objective for you`, body: `“${title}”`, link }, a.user.id);
          if (o.parentId) {
            const p = objective(o.parentId)!;
            notify([p.ownerId], { kind: 'work', title: `${first(owner)} aligned an objective to yours`, body: `“${title}” → “${p.title}”`, link }, a.user.id);
          }
          return okr({ id }, 'Objective created');
        },

        updateObjective(id, patch) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const o = objective(id);
          if (!o) return fail('Objective not found.');
          if (!canEditObjective(a.v, a.users, o)) return fail('Only owners and their managers can edit this objective.');
          if (patch.title !== undefined && patch.title.trim().length < 4) return fail('Give the objective a title (4+ characters).');
          if (patch.parentId !== undefined && patch.parentId) {
            const err = validParent(a, o.level, patch.parentId, o.periodId);
            if (err) return fail(err);
            if (createsCycle(id, patch.parentId)) return fail('That would create an alignment loop.');
          }
          if (patch.ownerId && !a.users.some((u) => u.id === patch.ownerId && u.active)) return fail('Choose an active owner.');
          set((s) => ({
            objectives: s.objectives.map((x) =>
              x.id === id
                ? {
                    ...x,
                    ...patch,
                    title: patch.title?.trim() ?? x.title,
                    parentId: patch.parentId === '' ? undefined : (patch.parentId ?? x.parentId),
                    updatedAt: Date.now(),
                  }
                : x,
            ),
          }));
          if (patch.ownerId && patch.ownerId !== o.ownerId) notify([patch.ownerId], { title: `${first(a.user)} made you owner of an objective`, body: `“${o.title}”`, link: `/performance/okrs/${id}` }, a.user.id);
          return okr({}, 'Objective updated');
        },

        deleteObjective(id) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const o = objective(id);
          if (!o) return fail('Objective not found.');
          if (!canEditObjective(a.v, a.users, o)) return fail('Only owners and their managers can delete this objective.');
          const snapshot = { o, krs: get().keyResults.filter((k) => k.objectiveId === id), comments: get().comments.filter((c) => c.objectiveId === id) };
          set((s) => ({ objectives: s.objectives.filter((x) => x.id !== id), keyResults: s.keyResults.filter((k) => k.objectiveId !== id), comments: s.comments.filter((c) => c.objectiveId !== id) }));
          audit(a.user.id, 'performance.objective.deleted', o.title, `${o.level} objective`, o.level === 'company' ? 'warning' : 'info');
          return okr({
            undo: () => {
              if (objective(id)) return fail('Already restored.');
              set((s) => ({ objectives: [...s.objectives, snapshot.o], keyResults: [...s.keyResults, ...snapshot.krs], comments: [...s.comments, ...snapshot.comments] }));
              return okr({}, 'Objective restored');
            },
          }, 'Objective deleted');
        },

        addKeyResult(objectiveId, input) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const o = objective(objectiveId);
          if (!o) return fail('Objective not found.');
          if (!canEditObjective(a.v, a.users, o)) return fail('Only owners and their managers can add key results.');
          if (o.state === 'closed') return fail('This objective is closed.');
          const existing = get().keyResults.filter((k) => k.objectiveId === objectiveId);
          if (existing.length >= 7) return fail('Keep it focused: at most 7 key results.');
          const r = krFrom(objectiveId, input, o.ownerId, existing.length);
          if (typeof r === 'string') return fail(r);
          set((s) => ({ keyResults: [...s.keyResults, r] }));
          return okr({ id: r.id }, 'Key result added');
        },

        updateKeyResult(id, patch) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const k = kr(id);
          const o = k && objective(k.objectiveId);
          if (!k || !o) return fail('Key result not found.');
          if (!canEditObjective(a.v, a.users, o)) return fail('Only owners and their managers can edit key results.');
          if (patch.title !== undefined && patch.title.trim().length < 4) return fail('Key result titles need 4+ characters.');
          if (patch.target !== undefined && !Number.isFinite(patch.target)) return fail('Target must be a number.');
          set((s) => ({ keyResults: s.keyResults.map((x) => (x.id === id ? { ...x, ...patch, title: patch.title?.trim() ?? x.title } : x)) }));
          return okr({}, 'Key result updated');
        },

        deleteKeyResult(id) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const k = kr(id);
          const o = k && objective(k.objectiveId);
          if (!k || !o) return fail('Key result not found.');
          if (!canEditObjective(a.v, a.users, o)) return fail('Only owners and their managers can delete key results.');
          set((s) => ({ keyResults: s.keyResults.filter((x) => x.id !== id) }));
          return okr({
            undo: () => {
              if (kr(id)) return fail('Already restored.');
              set((s) => ({ keyResults: [...s.keyResults, k] }));
              return okr({}, 'Key result restored');
            },
          }, 'Key result deleted');
        },

        checkIn(entries) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          if (!entries.length) return fail('Nothing to check in.');
          const now = Date.now();
          const updates = new Map<string, KeyResult>();
          let improved = 0;
          const completed: string[] = [];
          const statusAlerts: { o: Objective; k: KeyResult; status: string }[] = [];
          for (const e of entries) {
            const k = kr(e.krId);
            const o = k && objective(k.objectiveId);
            if (!k || !o) return fail('Key result not found.');
            const allowed = canCheckIn(a.v, a.users, k.ownerId, o);
            if (!allowed.ok) return fail(`${k.title}: ${allowed.reason}`);
            const conf = Math.round(e.confidence);
            if (conf < 1 || conf > 10) return fail('Confidence must be between 1 and 10.');
            let value = e.value;
            let milestones = k.milestones;
            if (k.metric === 'milestone') {
              const done = new Set(e.doneMilestones ?? k.milestones?.filter((m) => m.done).map((m) => m.id) ?? []);
              milestones = (k.milestones ?? []).map((m) => (done.has(m.id) ? { ...m, done: true, doneAt: m.doneAt ?? now } : { ...m, done: false, doneAt: undefined }));
              value = milestones.filter((m) => m.done).length;
            }
            if (k.metric === 'boolean') value = value >= 1 ? 1 : 0;
            if (!Number.isFinite(value)) return fail(`${k.title}: enter a number.`);
            if (k.metric === 'percent' && (value < 0 || value > 100)) return fail(`${k.title}: percentages go from 0 to 100.`);
            const period = periodOf(o.periodId);
            const before = period ? krStatus(k, period, now) : 'on-track';
            const goodDir = k.ceiling ? value < k.current : k.target >= k.start ? value > k.current : value < k.current;
            if (goodDir) improved += 1;
            const next: KeyResult = {
              ...k,
              current: value,
              confidence: conf,
              milestones,
              checkins: [...k.checkins, { id: uid('ck'), at: now, value, confidence: conf, note: clean(e.note, 500) || undefined, byId: a.user.id }],
            };
            const after = period ? krStatus(next, period, now) : 'on-track';
            if (after === 'done' && before !== 'done') completed.push(k.id);
            if ((after === 'off-track' || after === 'at-risk') && after !== before) statusAlerts.push({ o, k: next, status: after });
            updates.set(k.id, next);
          }
          set((s) => ({ keyResults: s.keyResults.map((k) => updates.get(k.id) ?? k) }));
          for (const { o, k, status } of statusAlerts)
            notify([o.ownerId, ...o.coOwnerIds], { kind: 'work', title: `Key result ${status === 'off-track' ? 'off track' : 'at risk'}: ${k.title}`, body: `${first(a.user)} checked in · confidence ${k.confidence}/10`, link: `/performance/okrs/${o.id}` }, a.user.id);
          return okr({ updated: updates.size, improved, completed }, `Checked in on ${updates.size} key result${updates.size === 1 ? '' : 's'}`);
        },

        toggleMilestone(krId, milestoneId) {
          const k = kr(krId);
          if (!k?.milestones) return fail('Milestone not found.');
          const done = new Set(k.milestones.filter((m) => m.done).map((m) => m.id));
          if (done.has(milestoneId)) done.delete(milestoneId);
          else done.add(milestoneId);
          const r = get().checkIn([{ krId, value: done.size, confidence: k.confidence, doneMilestones: [...done] }]);
          if (!r.ok) return r;
          return okr({ completed: done.size >= milestoneTotal(k) });
        },

        closeObjective(id, scores, reflection) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const o = objective(id);
          if (!o) return fail('Objective not found.');
          if (!canEditObjective(a.v, a.users, o)) return fail('Only owners and their managers can grade this objective.');
          const krs = get().keyResults.filter((k) => k.objectiveId === id);
          for (const k of krs) {
            const s = scores[k.id];
            if (s === undefined || !Number.isFinite(s) || s < 0 || s > 1) return fail(`Grade “${k.title}” between 0.0 and 1.0.`);
          }
          const now = Date.now();
          set((s) => ({
            objectives: s.objectives.map((x) => (x.id === id ? { ...x, state: 'closed', reflection: reflection.trim() || undefined, closedAt: now, closedBy: a.user.id, updatedAt: now } : x)),
            keyResults: s.keyResults.map((k) => (k.objectiveId === id ? { ...k, score: Math.round(scores[k.id] * 10) / 10 } : k)),
            comments: [...s.comments, { id: uid('cm'), objectiveId: id, authorId: a.user.id, at: now, kind: 'system', body: `Closed and graded ${(krs.reduce((t, k) => t + scores[k.id], 0) / Math.max(1, krs.length)).toFixed(1)}${reflection.trim() ? ` — “${reflection.trim().slice(0, 140)}”` : ''}` }],
          }));
          if (o.parentId) {
            const p = objective(o.parentId);
            if (p) notify([p.ownerId], { kind: 'work', title: `Aligned objective graded: ${o.title}`, body: `${first(a.user)} closed it out`, link: `/performance/okrs/${id}` }, a.user.id);
          }
          return okr({}, 'Objective closed & graded');
        },

        reopenObjective(id) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const o = objective(id);
          if (!o) return fail('Objective not found.');
          if (!canEditObjective(a.v, a.users, o)) return fail('Only owners and their managers can reopen this objective.');
          set((s) => ({ objectives: s.objectives.map((x) => (x.id === id ? { ...x, state: 'active', closedAt: undefined, closedBy: undefined, updatedAt: Date.now() } : x)) }));
          return okr({}, 'Objective reopened');
        },

        addComment(objectiveId, body, kind = 'comment') {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const o = objective(objectiveId);
          if (!o || !canViewObjective(a.v, a.users, o)) return fail('Objective not found.');
          const text = body.trim();
          if (text.length < 2) return fail('Write something first.');
          if (kind === 'update' && !canEditObjective(a.v, a.users, o)) return fail('Only owners can post status updates.');
          const c: OkrComment = { id: uid('cm'), objectiveId, authorId: a.user.id, at: Date.now(), body: text.slice(0, 2000), kind: kind === 'system' ? 'comment' : kind };
          set((s) => ({ comments: [...s.comments, c] }));
          notify([o.ownerId, ...o.coOwnerIds], { kind: 'work', title: `${first(a.user)} commented on “${o.title}”`, body: text.slice(0, 90), link: `/performance/okrs/${o.id}` }, a.user.id);
          return okr({ id: c.id }, kind === 'update' ? 'Update posted' : 'Comment posted');
        },

        /* ═════════════════════ Quarterly check-ins ═════════════════════ */

        saveSelf(reviewId, patch) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const r = review(reviewId);
          const c = r && cycleOf(r.cycleId);
          if (!r || !c) return fail('Review not found.');
          if (r.employeeId !== a.user.id) return fail('Only you can write your self-reflection.');
          if (!canEditSelf(c, r, Date.now())) return fail('The self-reflection phase is closed.');
          patchReview(reviewId, (x) => ({
            ...x,
            self: {
              ...x.self,
              status: x.self.status === 'submitted' ? 'submitted' : 'draft',
              answers: patch.answers ? { ...x.self.answers, ...Object.fromEntries(Object.entries(patch.answers).map(([k, v]) => [k, clean(v)])) } : x.self.answers,
              ratings: patch.ratings ? { ...x.self.ratings, ...patch.ratings } : x.self.ratings,
              cited: patch.cited ? [...new Set([...x.self.cited, ...patch.cited])] : x.self.cited,
              updatedAt: Date.now(),
            },
          }));
          return okr({});
        },

        submitSelf(reviewId) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const r = review(reviewId);
          const c = r && cycleOf(r.cycleId);
          if (!r || !c) return fail('Review not found.');
          if (r.employeeId !== a.user.id) return fail('Only you can submit your self-reflection.');
          if (!canEditSelf(c, r, Date.now())) return fail('The self-reflection phase is closed.');
          const tpl = get().templates.find((t) => t.id === c.templateId);
          const qs = tpl?.questions ?? [];
          const missing = qs.filter((q) => words(r.self.answers[q.id]) < 5);
          if (missing.length) return fail(`Answer every question (5+ words). Missing: “${missing[0].prompt}”`);
          if (tpl?.competencies && Object.keys(r.self.ratings).length < 5) return fail('Rate yourself on all five competencies.');
          const now = Date.now();
          const firstTime = r.self.status !== 'submitted';
          patchReview(reviewId, (x) => ({ ...x, self: { ...x.self, status: 'submitted', submittedAt: x.self.submittedAt ?? now, updatedAt: now } }));
          if (firstTime && r.managerId)
            notify([r.managerId], { title: `${first(a.user)} submitted their self-reflection`, body: `${c.name} · your manager review is unlocked`, link: `/performance/checkins/${r.id}` }, a.user.id);
          return okr({}, firstTime ? 'Self-reflection submitted' : 'Self-reflection updated');
        },

        nominatePeers(reviewId, peerIds) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const r = review(reviewId);
          const c = r && cycleOf(r.cycleId);
          if (!r || !c) return fail('Review not found.');
          const isEmployee = r.employeeId === a.user.id;
          const isMgr = r.managerId === a.user.id || isAdmin(a.v);
          if (!isEmployee && !isMgr) return fail('Only the employee or their manager can choose peer reviewers.');
          if (!canAnswerPeer(c, Date.now())) return fail('The peer feedback phase is closed.');
          const ids = [...new Set(peerIds)].filter((id) => id !== r.employeeId && id !== r.managerId);
          const eligible = new Set(performanceUsers().map((u) => u.id));
          const bad = ids.find((id) => !eligible.has(id));
          if (bad) return fail(`${nameOf(a.users, bad)} can’t give feedback in Performance & OKRs.`);
          const existing = get().cycleFeedback.filter((f) => f.cycleId === c.id && f.kind === 'peer' && f.subjectId === r.employeeId && f.status !== 'declined');
          const locked = existing.filter((f) => f.status === 'requested' || f.status === 'submitted');
          const total = new Set([...locked.map((f) => f.authorId), ...ids]).size;
          if (total < 2 || total > 4) return fail('Choose 2–4 peers.');
          const now = Date.now();
          const peerPhase = getPhase(c, 'peer');
          const status: CycleFeedback['status'] = isEmployee && !isAdmin(a.v) && r.managerId ? 'proposed' : 'requested';
          const fresh: CycleFeedback[] = ids
            .filter((id) => !locked.some((f) => f.authorId === id))
            .map((authorId) => ({ id: uid('pf'), cycleId: c.id, kind: 'peer', subjectId: r.employeeId, authorId, status, nominatedBy: a.user.id, requestedAt: now, dueAt: peerPhase?.end ?? now + 10 * DAY }));
          set((s) => ({
            cycleFeedback: [...s.cycleFeedback.filter((f) => !(f.cycleId === c.id && f.kind === 'peer' && f.subjectId === r.employeeId && f.status === 'proposed')), ...fresh],
          }));
          const emp = a.users.find((u) => u.id === r.employeeId);
          if (status === 'proposed') {
            notify([r.managerId], { title: `${first(emp)} nominated ${fresh.length} peer reviewers`, body: `${c.name} · approve or adjust`, link: `/performance/checkins/${r.id}?tab=peers` }, a.user.id);
          } else {
            notify(fresh.map((f) => f.authorId), { title: `${first(emp)} would value your feedback`, body: `${c.name} · Start / Stop / Continue · due ${new Date(peerPhase?.end ?? now).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`, link: '/performance/checkins' }, a.user.id);
          }
          return okr({ requested: status === 'requested' ? fresh.length : 0, proposed: status === 'proposed' ? fresh.length : 0 }, status === 'proposed' ? `Sent to ${first(a.users.find((u) => u.id === r.managerId))} for approval` : 'Peer requests sent');
        },

        approveNominations(reviewId, keepAuthorIds, addAuthorIds = []) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const r = review(reviewId);
          const c = r && cycleOf(r.cycleId);
          if (!r || !c) return fail('Review not found.');
          if (!(r.managerId === a.user.id || isAdmin(a.v))) return fail('Only the manager can approve peer reviewers.');
          const now = Date.now();
          const all = get().cycleFeedback.filter((f) => f.cycleId === c.id && f.kind === 'peer' && f.subjectId === r.employeeId);
          const proposed = all.filter((f) => f.status === 'proposed');
          const keep = new Set(keepAuthorIds);
          const active = all.filter((f) => f.status === 'requested' || f.status === 'submitted');
          const eligible = new Set(performanceUsers().map((u) => u.id));
          const adds = [...new Set(addAuthorIds)].filter((id) => id !== r.employeeId && id !== r.managerId && eligible.has(id) && !all.some((f) => f.authorId === id && f.status !== 'declined'));
          const total = active.length + proposed.filter((f) => keep.has(f.authorId)).length + adds.length;
          if (total < 2 || total > 4) return fail('Peer reviewers must total 2–4.');
          const peerPhase = getPhase(c, 'peer');
          const added: CycleFeedback[] = adds.map((authorId) => ({ id: uid('pf'), cycleId: c.id, kind: 'peer', subjectId: r.employeeId, authorId, status: 'requested', nominatedBy: a.user.id, requestedAt: now, dueAt: peerPhase?.end ?? now + 10 * DAY }));
          set((s) => ({
            cycleFeedback: [
              ...s.cycleFeedback
                .filter((f) => !(f.status === 'proposed' && f.subjectId === r.employeeId && f.cycleId === c.id && !keep.has(f.authorId)))
                .map((f) => (f.status === 'proposed' && f.subjectId === r.employeeId && f.cycleId === c.id ? { ...f, status: 'requested' as const, requestedAt: now } : f)),
              ...added,
            ],
          }));
          const requested = [...proposed.filter((f) => keep.has(f.authorId)).map((f) => f.authorId), ...adds];
          const emp = a.users.find((u) => u.id === r.employeeId);
          notify(requested, { title: `${first(emp)} would value your feedback`, body: `${c.name} · Start / Stop / Continue`, link: '/performance/checkins' }, a.user.id);
          notify([r.employeeId], { title: `${first(a.user)} approved your peer reviewers`, body: requested.map((id) => first(a.users.find((u) => u.id === id))).join(', '), link: `/performance/checkins/${r.id}?tab=peers` }, a.user.id);
          return okr({ requested: requested.length }, 'Peer reviewers approved');
        },

        submitPeer(feedbackId, input) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const f = get().cycleFeedback.find((x) => x.id === feedbackId);
          const c = f && cycleOf(f.cycleId);
          if (!f || !c || f.kind !== 'peer') return fail('Request not found.');
          if (f.authorId !== a.user.id) return fail('This request is for someone else.');
          if (f.status === 'proposed') return fail('This request is waiting for manager approval.');
          if (!canAnswerPeer(c, Date.now())) return fail('The peer feedback phase is closed.');
          const filled = [input.start, input.stop, input.continue].filter((t) => words(t) >= 3).length;
          if (filled < 2) return fail('Fill in at least two of Start, Stop and Continue (3+ words each).');
          set((s) => ({
            cycleFeedback: s.cycleFeedback.map((x) =>
              x.id === feedbackId ? { ...x, status: 'submitted', start: clean(input.start, 1200), stop: clean(input.stop, 1200), continue: clean(input.continue, 1200), highlight: input.highlight, anonymous: input.anonymous, submittedAt: Date.now() } : x,
            ),
          }));
          return okr({}, 'Feedback shared — thank you');
        },

        declinePeer(feedbackId, reason) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const f = get().cycleFeedback.find((x) => x.id === feedbackId);
          if (!f) return fail('Request not found.');
          if (f.authorId !== a.user.id) return fail('This request is for someone else.');
          if (f.status === 'submitted') return fail('You already submitted this feedback.');
          set((s) => ({ cycleFeedback: s.cycleFeedback.map((x) => (x.id === feedbackId ? { ...x, status: 'declined', declineReason: reason?.trim() || undefined } : x)) }));
          const r = get().reviews.find((x) => x.cycleId === f.cycleId && x.employeeId === f.subjectId);
          if (f.kind === 'peer' && r?.managerId)
            notify([r.managerId], { title: `${first(a.user)} declined a peer request for ${first(a.users.find((u) => u.id === f.subjectId))}`, body: reason?.trim() || 'Pick another reviewer.', link: `/performance/checkins/${r.id}?tab=peers` }, a.user.id);
          return okr({}, 'Request declined');
        },

        submitUpward(feedbackId, input) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const f = get().cycleFeedback.find((x) => x.id === feedbackId);
          const c = f && cycleOf(f.cycleId);
          if (!f || !c || f.kind !== 'upward') return fail('Request not found.');
          if (f.authorId !== a.user.id) return fail('This request is for someone else.');
          if (!canAnswerPeer(c, Date.now())) return fail('The upward feedback phase is closed.');
          const dims: UpwardDimension[] = ['clarity', 'feedback', 'growth', 'safety', 'unblock'];
          if (dims.some((d) => !input.scores[d])) return fail('Rate every statement (1–5).');
          if (words(input.keep) + words(input.change) < 4) return fail('Add a sentence on what to keep doing or change.');
          set((s) => ({ cycleFeedback: s.cycleFeedback.map((x) => (x.id === feedbackId ? { ...x, status: 'submitted', scores: input.scores, keep: clean(input.keep, 1200), change: clean(input.change, 1200), anonymous: true, submittedAt: Date.now() } : x)) }));
          return okr({}, 'Upward feedback shared anonymously');
        },

        saveManager(reviewId, patch) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const r = review(reviewId);
          const c = r && cycleOf(r.cycleId);
          if (!r || !c) return fail('Review not found.');
          if (r.managerId !== a.user.id) return fail('Only the direct manager writes this review.');
          if (!canWriteManager(c, r, Date.now())) return fail(r.self.status !== 'submitted' ? 'Unlocks when the self-reflection is submitted (or the self phase closes).' : 'Manager reviews are closed for this cycle.');
          patchReview(reviewId, (x) => ({
            ...x,
            manager: {
              ...x.manager,
              authorId: a.user.id,
              status: x.manager.status === 'submitted' ? 'submitted' : 'draft',
              answers: patch.answers ? { ...x.manager.answers, ...Object.fromEntries(Object.entries(patch.answers).map(([k, v]) => [k, clean(v)])) } : x.manager.answers,
              ratings: patch.ratings ? { ...x.manager.ratings, ...patch.ratings } : x.manager.ratings,
              overall: patch.overall ?? x.manager.overall,
              potential: patch.potential ?? x.manager.potential,
              privateNote: patch.privateNote !== undefined ? clean(patch.privateNote, 2000) : x.manager.privateNote,
              cited: patch.cited ? [...new Set([...x.manager.cited, ...patch.cited])] : x.manager.cited,
              updatedAt: Date.now(),
            },
          }));
          return okr({});
        },

        submitManager(reviewId) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const r = review(reviewId);
          const c = r && cycleOf(r.cycleId);
          if (!r || !c) return fail('Review not found.');
          if (r.managerId !== a.user.id) return fail('Only the direct manager submits this review.');
          if (!canWriteManager(c, r, Date.now())) return fail('Manager reviews are closed for this cycle.');
          const tpl = get().templates.find((t) => t.id === c.templateId);
          const answered = (tpl?.questions ?? []).filter((q) => words(r.manager.answers[q.id]) >= 10).length;
          if (answered < Math.min(2, tpl?.questions.length ?? 2)) return fail('Write at least two answers (10+ words each).');
          if (!r.manager.overall) return fail('Choose an overall rating.');
          if (!r.manager.potential) return fail('Choose a potential level.');
          if (tpl?.competencies && Object.keys(r.manager.ratings).length < 5) return fail('Rate all five competencies.');
          const now = Date.now();
          patchReview(reviewId, (x) => ({ ...x, manager: { ...x.manager, status: 'submitted', submittedAt: x.manager.submittedAt ?? now, updatedAt: now } }));
          audit(a.user.id, 'performance.review.submitted', nameOf(a.users, r.employeeId), c.name, 'info');
          return okr({}, 'Manager review submitted — it joins calibration');
        },

        calibrate(reviewId, performance, potential, note) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const r = review(reviewId);
          const c = r && cycleOf(r.cycleId);
          if (!r || !c) return fail('Review not found.');
          if (!canCalibrate(a.v, a.users) || !(isAdmin(a.v) || isAbove(a.users, a.user.id, r.employeeId))) {
            audit(a.user.id, 'performance.calibration.move', nameOf(a.users, r.employeeId), 'Outside calibration scope', 'warning', 'denied');
            return fail('You can only calibrate people in your org.');
          }
          if (r.employeeId === a.user.id) return fail('You can’t calibrate yourself.');
          if (c.calibrationLockedAt) return fail('Calibration is locked for this cycle.');
          if (c.status !== 'active') return fail('This cycle is closed.');
          const now = Date.now();
          patchReview(reviewId, (x) => ({ ...x, calibration: { performance, potential, note: note?.trim() || undefined, byId: a.user.id, at: now } }));
          audit(a.user.id, 'performance.calibration.move', nameOf(a.users, r.employeeId), `${c.name} → performance ${performance}, potential ${potential}${note ? ` · ${note.trim().slice(0, 80)}` : ''}`, 'info');
          if (r.managerId && r.managerId !== a.user.id)
            notify([r.managerId], { title: `${first(a.user)} calibrated ${first(a.users.find((u) => u.id === r.employeeId))}`, body: `${c.name}${note ? ` · “${note.trim().slice(0, 70)}”` : ''}`, link: '/performance/calibration' }, a.user.id);
          return okr({}, 'Placement recorded');
        },

        clearCalibration(reviewId) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const r = review(reviewId);
          const c = r && cycleOf(r.cycleId);
          if (!r || !c) return fail('Review not found.');
          if (!(isAdmin(a.v) || isAbove(a.users, a.user.id, r.employeeId))) return fail('You can only calibrate people in your org.');
          if (c.calibrationLockedAt) return fail('Calibration is locked for this cycle.');
          patchReview(reviewId, (x) => ({ ...x, calibration: undefined }));
          return okr({}, 'Calibration cleared');
        },

        setCalibrationLock(cycleId, locked) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const c = cycleOf(cycleId);
          if (!c) return fail('Cycle not found.');
          if (!isAdmin(a.v)) {
            audit(a.user.id, 'performance.calibration.lock', c.name, 'Missing performance.manage', 'warning', 'denied');
            return fail('Only People Ops can lock calibration.');
          }
          set((s) => ({ cycles: s.cycles.map((x) => (x.id === cycleId ? { ...x, calibrationLockedAt: locked ? Date.now() : undefined, calibrationLockedBy: locked ? a.user.id : undefined } : x)) }));
          audit(a.user.id, locked ? 'performance.calibration.locked' : 'performance.calibration.unlocked', c.name, undefined, 'warning');
          return okr({}, locked ? 'Calibration locked & finalized' : 'Calibration reopened');
        },

        releaseReview(reviewId) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const r = review(reviewId);
          const c = r && cycleOf(r.cycleId);
          if (!r || !c) return fail('Review not found.');
          const acc = reviewAccess(a.v, a.users, r);
          if (!acc.release) return fail('Only the manager or People Ops can share this review.');
          if (r.manager.status !== 'submitted') return fail('Submit the manager review before sharing it.');
          if (r.release) return fail('Already shared.');
          const now = Date.now();
          patchReview(reviewId, (x) => ({ ...x, release: { releasedAt: now, releasedBy: a.user.id } }));
          audit(a.user.id, 'performance.review.released', nameOf(a.users, r.employeeId), c.name, 'info');
          notify([r.employeeId], { title: `Your ${c.name} review is ready`, body: `${first(a.users.find((u) => u.id === r.managerId))} shared it. Read it, acknowledge and add your thoughts.`, link: `/performance/checkins/${r.id}?tab=summary` }, a.user.id);
          return okr({}, 'Review shared');
        },

        releaseAll(cycleId) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const c = cycleOf(cycleId);
          if (!c) return fail('Cycle not found.');
          if (!isAdmin(a.v)) return fail('Only People Ops can release reviews in bulk.');
          const ready = get().reviews.filter((r) => r.cycleId === cycleId && r.manager.status === 'submitted' && !r.release);
          if (!ready.length) return fail('No submitted reviews are waiting to be shared.');
          const now = Date.now();
          const ids = new Set(ready.map((r) => r.id));
          set((s) => ({ reviews: s.reviews.map((r) => (ids.has(r.id) ? { ...r, release: { releasedAt: now, releasedBy: a.user.id } } : r)) }));
          audit(a.user.id, 'performance.review.released', c.name, `${ready.length} reviews released in bulk`, 'warning');
          for (const r of ready) notify([r.employeeId], { title: `Your ${c.name} review is ready`, body: 'Read it, acknowledge and add your thoughts.', link: `/performance/checkins/${r.id}?tab=summary` }, a.user.id);
          return okr({ count: ready.length }, `Shared ${ready.length} review${ready.length === 1 ? '' : 's'}`);
        },

        acknowledgeReview(reviewId, comment) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const r = review(reviewId);
          const c = r && cycleOf(r.cycleId);
          if (!r || !c) return fail('Review not found.');
          if (r.employeeId !== a.user.id) return fail('Only the employee can acknowledge their review.');
          if (!r.release) return fail('This review hasn’t been shared yet.');
          patchReview(reviewId, (x) => ({ ...x, release: { ...x.release!, acknowledgedAt: x.release!.acknowledgedAt ?? Date.now(), employeeComment: comment?.trim() ? clean(comment, 2000) : x.release!.employeeComment } }));
          notify([r.managerId], { title: `${first(a.user)} acknowledged their ${c.name} review`, body: comment?.trim() ? `“${comment.trim().slice(0, 90)}”` : undefined, link: `/performance/checkins/${r.id}?tab=summary` }, a.user.id);
          return okr({}, 'Review acknowledged');
        },

        scheduleConversation(reviewId, at) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const r = review(reviewId);
          const c = r && cycleOf(r.cycleId);
          if (!r || !c) return fail('Review not found.');
          if (a.user.id !== r.managerId && a.user.id !== r.employeeId) return fail('Only the employee or manager can schedule the conversation.');
          if (!Number.isFinite(at) || at < Date.now() - DAY) return fail('Pick a time in the future.');
          patchReview(reviewId, (x) => ({ ...x, release: x.release ? { ...x.release, conversationAt: at } : x.release }));
          // Put it on the 1:1 agenda (create the series if needed).
          const s = get().series.find((x) => (x.leadId === r.managerId && x.memberId === r.employeeId) || (x.leadId === r.employeeId && x.memberId === r.managerId));
          const text = `Review conversation: ${c.name}`;
          if (s) {
            if (!s.agenda.some((g) => g.text === text)) patchSeries(s.id, (x) => ({ ...x, nextAt: Math.min(x.nextAt, at) > Date.now() ? Math.min(x.nextAt, at) : at, agenda: [{ id: uid('ag'), text, byId: a.user.id, createdAt: Date.now(), done: false, source: 'review' }, ...x.agenda] }));
          } else {
            set((st) => ({
              series: [
                ...st.series,
                { id: uid('oo'), leadId: r.managerId, memberId: r.employeeId, kind: 'manager', cadence: 'biweekly', durationMin: 30, nextAt: at, agenda: [{ id: uid('ag'), text, byId: a.user.id, createdAt: Date.now(), done: false, source: 'review' }], sharedNotes: '', privateNotes: {}, actionItems: [], meetings: [], moods: {}, createdAt: Date.now() },
              ],
            }));
          }
          const other = a.user.id === r.managerId ? r.employeeId : r.managerId;
          notify([other], { title: `Review conversation scheduled`, body: `${c.name} · ${new Date(at).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`, link: '/performance/one-on-ones' }, a.user.id);
          return okr({}, 'Conversation scheduled & added to your 1:1 agenda');
        },

        viewPacket(reviewId) {
          const a = actorOf();
          const r = review(reviewId);
          if (!a || !r) return;
          const acc = reviewAccess(a.v, a.users, r);
          if (!acc.audited) return;
          const key = `${a.user.id}:${reviewId}`;
          if (viewedPackets.has(key)) return;
          viewedPackets.add(key);
          audit(a.user.id, 'performance.review.viewed', nameOf(a.users, r.employeeId), cycleOf(r.cycleId)?.name, 'info');
        },

        /* ═════════════════════ Cycles admin ═════════════════════ */

        createCycle(input) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          if (!isAdmin(a.v)) {
            audit(a.user.id, 'performance.cycle.create', input.name, 'Missing performance.manage', 'warning', 'denied');
            return fail('Only People Ops can create cycles.');
          }
          const name = input.name.trim();
          if (name.length < 3) return fail('Name the cycle.');
          if (!periodOf(input.periodId)) return fail('Pick a period.');
          const err = validatePhases(input.phases);
          if (err) return fail(err);
          if (!get().templates.some((t) => t.id === input.templateId)) return fail('Pick a template.');
          const people = performanceUsers().filter((u) => !input.departments || input.departments.includes(u.department));
          if (!people.length) return fail('No participants match those departments.');
          const now = Date.now();
          const id = uid('cyc');
          const tag = id.slice(-5);
          const participantIds = people.map((u) => u.id);
          const pSet = new Set(participantIds);
          const reviews: Review[] = people.map((u) => ({
            id: `rv-${tag}-${u.id.replace(/^u-/, '')}`,
            cycleId: id,
            employeeId: u.id,
            managerId: u.managerId && a.users.some((x) => x.id === u.managerId && x.active) ? u.managerId : '',
            self: { status: 'not-started', answers: {}, ratings: {}, cited: [] },
            manager: { status: 'not-started', answers: {}, ratings: {}, cited: [], authorId: u.managerId ?? '' },
          }));
          const peerEnd = input.phases.find((p) => p.key === 'peer')?.end ?? now + 14 * DAY;
          const upward: CycleFeedback[] = people
            .filter((u) => u.managerId && pSet.has(u.managerId))
            .map((u) => ({ id: uid('uf'), cycleId: id, kind: 'upward', subjectId: u.managerId!, authorId: u.id, status: 'requested', requestedAt: now, dueAt: peerEnd, anonymous: true }));
          const cycle: Cycle = {
            id,
            name,
            periodId: input.periodId,
            status: input.launch ? 'active' : 'draft',
            phases: input.phases,
            departments: input.departments,
            participantIds,
            templateId: input.templateId,
            peerAnonymous: input.peerAnonymous,
            upwardMin: Math.max(2, Math.min(10, Math.round(input.upwardMin))),
            createdAt: now,
            createdBy: a.user.id,
            launchedAt: input.launch ? now : undefined,
          };
          set((s) => ({ cycles: [cycle, ...s.cycles], reviews: [...s.reviews, ...reviews], cycleFeedback: [...s.cycleFeedback, ...upward] }));
          audit(a.user.id, input.launch ? 'performance.cycle.launched' : 'performance.cycle.created', name, `${participantIds.length} participants`, 'warning');
          if (input.launch) {
            const selfEnd = input.phases.find((p) => p.key === 'self')?.end ?? now;
            notify(participantIds, { title: `${name} is open`, body: `Self-reflection due ${new Date(selfEnd).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · Nova can draft it from your highlights.`, link: '/performance/checkins' }, a.user.id);
          }
          return okr({ id, participants: participantIds.length }, input.launch ? `${name} launched to ${participantIds.length} people` : 'Draft cycle saved');
        },

        updateCycle(id, patch) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          if (!isAdmin(a.v)) return fail('Only People Ops can edit cycles.');
          const c = cycleOf(id);
          if (!c) return fail('Cycle not found.');
          if (patch.phases) {
            const err = validatePhases(patch.phases);
            if (err) return fail(err);
          }
          if (patch.name !== undefined && patch.name.trim().length < 3) return fail('Name the cycle.');
          set((s) => ({ cycles: s.cycles.map((x) => (x.id === id ? { ...x, name: patch.name?.trim() ?? x.name, phases: patch.phases ?? x.phases } : x)) }));
          audit(a.user.id, 'performance.cycle.updated', c.name, patch.phases ? 'Phase dates changed' : 'Renamed', 'info');
          return okr({}, 'Cycle updated');
        },

        setCycleStatus(id, status) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          if (!isAdmin(a.v)) return fail('Only People Ops can change cycle status.');
          const c = cycleOf(id);
          if (!c) return fail('Cycle not found.');
          set((s) => ({ cycles: s.cycles.map((x) => (x.id === id ? { ...x, status, launchedAt: status === 'active' ? (x.launchedAt ?? Date.now()) : x.launchedAt } : x)) }));
          audit(a.user.id, `performance.cycle.${status === 'active' ? 'launched' : status === 'closed' ? 'closed' : 'drafted'}`, c.name, undefined, 'warning');
          if (status === 'active' && c.status === 'draft') notify(c.participantIds, { title: `${c.name} is open`, body: 'Your quarterly check-in has started.', link: '/performance/checkins' }, a.user.id);
          return okr({}, status === 'active' ? 'Cycle launched' : status === 'closed' ? 'Cycle closed' : 'Cycle moved to draft');
        },

        updateTemplate(id, questions, competencies) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          if (!isAdmin(a.v)) return fail('Only People Ops can edit templates.');
          const t = get().templates.find((x) => x.id === id);
          if (!t) return fail('Template not found.');
          if (!questions.length || questions.length > 8) return fail('Templates need 1–8 questions.');
          const bad = questions.find((q) => q.prompt.trim().length < 8);
          if (bad) return fail('Each question needs a prompt (8+ characters).');
          const next: ReviewTemplate = {
            ...t,
            questions: questions.map((q) => ({ ...q, prompt: q.prompt.trim(), managerPrompt: q.managerPrompt.trim() || q.prompt.trim(), help: q.help?.trim() || undefined })),
            competencies: competencies ?? t.competencies,
            updatedAt: Date.now(),
            updatedBy: a.user.id,
          };
          set((s) => ({ templates: s.templates.map((x) => (x.id === id ? next : x)) }));
          audit(a.user.id, 'performance.template.updated', t.name, `${questions.length} questions`, 'info');
          return okr({}, 'Template saved');
        },

        nudge(cycleId, userIds, phase) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const c = cycleOf(cycleId);
          if (!c) return fail('Cycle not found.');
          const allowed = [...new Set(userIds)].filter((id) => canNudge(a.v, a.users, id));
          if (!allowed.length) return fail('You can only nudge people in your org.');
          const due = getPhase(c, phase)?.end;
          const when = due ? new Date(due).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : 'soon';
          const link = phase === 'manager' ? '/performance/team' : '/performance/checkins';
          notify(allowed, { title: `Reminder: ${PHASE[phase].verb.toLowerCase()}`, body: `${c.name} · due ${when}. ${first(a.user)} sent a friendly nudge.`, link }, a.user.id);
          audit(a.user.id, 'performance.nudge', c.name, `${PHASE[phase].label}: ${allowed.length} people`, 'info');
          return okr({ count: allowed.length }, `Nudged ${allowed.length} ${allowed.length === 1 ? 'person' : 'people'}`);
        },

        /* ═════════════════════ Continuous feedback ═════════════════════ */

        giveFeedback(input) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          if (input.toId === a.user.id) return fail('Feedback is for others — try a growth goal for yourself.');
          const to = a.users.find((u) => u.id === input.toId && u.active);
          if (!to) return fail('Choose a recipient.');
          if (!performanceUsers().some((u) => u.id === to.id)) return fail(`${first(to)} doesn’t use Performance & OKRs — try kudos or Pulse Chat.`);
          const body = input.body.trim();
          if (body.length < 12) return fail('Say a little more (12+ characters).');
          if (input.kind === 'constructive' && input.visibility === 'public') return fail('Constructive feedback can’t be public. Share it privately or with their manager.');
          const now = Date.now();
          const id = uid('fb');
          let kudos = false;
          if (input.kind === 'praise' && input.visibility === 'public') {
            const res = useHub.getState().giveKudos(to.id, input.kudosValue ?? 'teamwork', body.slice(0, 280));
            kudos = res.ok;
          }
          const f: Feedback = {
            id,
            fromId: a.user.id,
            toId: to.id,
            at: now,
            kind: input.kind,
            visibility: input.visibility,
            situation: input.situation?.trim() || undefined,
            behaviour: input.behaviour?.trim() || undefined,
            impact: input.impact?.trim() || undefined,
            body: body.slice(0, 3000),
            competency: input.competency,
            objectiveId: input.objectiveId,
            requestId: input.requestId,
            kudosValue: kudos ? (input.kudosValue ?? 'teamwork') : undefined,
          };
          set((s) => ({
            feedback: [f, ...s.feedback],
            requests: input.requestId
              ? s.requests.map((r) => (r.id === input.requestId && r.respondentIds.includes(a.user.id) ? { ...r, responses: { ...r.responses, [a.user.id]: { feedbackId: id, at: now } } } : r))
              : s.requests,
          }));
          const req = input.requestId ? get().requests.find((r) => r.id === input.requestId) : undefined;
          const answering = req && req.requesterId === to.id;
          if (!kudos || answering)
            notify(
              [to.id],
              {
                kind: input.kind === 'praise' ? 'kudos' : 'hr',
                title: answering ? `${first(a.user)} answered your feedback request` : `${first(a.user)} shared ${input.kind === 'praise' ? 'praise' : 'feedback'} with you`,
                body: answering ? `${req!.topic} · “${body.slice(0, 70)}${body.length > 70 ? '…' : ''}”` : `“${body.slice(0, 90)}${body.length > 90 ? '…' : ''}”`,
                link: answering ? '/performance/feedback?tab=requests' : '/performance/feedback',
              },
              a.user.id,
            );
          if (req && !answering) notify([req.requesterId], { title: `${first(a.user)} answered your feedback request`, body: req.topic, link: '/performance/feedback?tab=requests' }, a.user.id);
          return okr({ id, kudos }, input.kind === 'praise' ? `Praise sent to ${first(to)}` : `Feedback shared with ${first(to)}`);
        },

        thankFeedback(id) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const f = get().feedback.find((x) => x.id === id);
          if (!f || f.toId !== a.user.id) return fail('Feedback not found.');
          if (f.thankedAt) return okr({});
          set((s) => ({ feedback: s.feedback.map((x) => (x.id === id ? { ...x, thankedAt: Date.now() } : x)) }));
          notify([f.fromId], { kind: 'kudos', title: `${first(a.user)} said thanks for your feedback`, body: `“${f.body.slice(0, 80)}”`, link: '/performance/feedback?tab=given' }, a.user.id);
          return okr({}, 'Thanks sent');
        },

        deleteFeedback(id) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const f = get().feedback.find((x) => x.id === id);
          if (!f) return fail('Feedback not found.');
          if (f.fromId !== a.user.id) return fail('Only the author can delete feedback.');
          set((s) => ({ feedback: s.feedback.filter((x) => x.id !== id) }));
          return okr({
            undo: () => {
              if (get().feedback.some((x) => x.id === id)) return fail('Already restored.');
              set((s) => ({ feedback: [f, ...s.feedback].sort((x, y) => y.at - x.at) }));
              return okr({}, 'Feedback restored');
            },
          }, 'Feedback deleted');
        },

        requestFeedback(input) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const ids = [...new Set(input.respondentIds)].filter((id) => id !== a.user.id);
          if (!ids.length) return fail('Pick at least one person.');
          if (ids.length > 6) return fail('Ask up to 6 people at a time.');
          const eligible = new Set(performanceUsers().map((u) => u.id));
          const bad = ids.find((id) => !eligible.has(id));
          if (bad) return fail(`${nameOf(a.users, bad)} doesn’t use Performance & OKRs.`);
          const topic = input.topic.trim();
          if (topic.length < 3) return fail('What would you like feedback on?');
          if (!Number.isFinite(input.dueAt) || input.dueAt < Date.now()) return fail('Pick a due date in the future.');
          const id = uid('fr');
          set((s) => ({ requests: [{ id, requesterId: a.user.id, respondentIds: ids, topic: topic.slice(0, 120), note: input.note?.trim() || undefined, createdAt: Date.now(), dueAt: input.dueAt, responses: {} }, ...s.requests] }));
          notify(ids, { title: `${first(a.user)} asked for your feedback`, body: `On “${topic.slice(0, 60)}” · due ${new Date(input.dueAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`, link: '/performance/feedback?tab=requests' }, a.user.id);
          return okr({ id }, `Request sent to ${ids.length} ${ids.length === 1 ? 'person' : 'people'}`);
        },

        declineRequest(requestId) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const r = get().requests.find((x) => x.id === requestId);
          if (!r || !r.respondentIds.includes(a.user.id)) return fail('Request not found.');
          set((s) => ({ requests: s.requests.map((x) => (x.id === requestId ? { ...x, responses: { ...x.responses, [a.user.id]: { declinedAt: Date.now(), at: Date.now() } } } : x)) }));
          notify([r.requesterId], { title: `${first(a.user)} passed on your feedback request`, body: r.topic, link: '/performance/feedback?tab=requests' }, a.user.id);
          return okr({}, 'Request declined');
        },

        remindRequest(requestId) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const r = get().requests.find((x) => x.id === requestId);
          if (!r || r.requesterId !== a.user.id) return fail('Request not found.');
          const pending = r.respondentIds.filter((id) => !r.responses[id]);
          if (!pending.length) return fail('Everyone has responded.');
          notify(pending, { title: `Reminder from ${first(a.user)}`, body: `Feedback on “${r.topic}” · due ${new Date(r.dueAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`, link: '/performance/feedback?tab=requests' }, a.user.id);
          return okr({ count: pending.length }, `Reminded ${pending.length}`);
        },

        closeRequest(requestId) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const r = get().requests.find((x) => x.id === requestId);
          if (!r || r.requesterId !== a.user.id) return fail('Request not found.');
          set((s) => ({ requests: s.requests.map((x) => (x.id === requestId ? { ...x, closedAt: Date.now() } : x)) }));
          return okr({}, 'Request closed');
        },

        addNote(subjectId, body) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          if (!(isAbove(a.users, a.user.id, subjectId) || isAdmin(a.v))) return fail('Private notes are for people in your org.');
          const text = body.trim();
          if (text.length < 3) return fail('Write a note first.');
          const id = uid('pn');
          set((s) => ({ notes: [{ id, authorId: a.user.id, subjectId, body: text.slice(0, 3000), at: Date.now() }, ...s.notes] }));
          return okr({ id }, 'Private note saved — only you can see it');
        },

        deleteNote(id) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const n = get().notes.find((x) => x.id === id);
          if (!n || n.authorId !== a.user.id) return fail('Note not found.');
          set((s) => ({ notes: s.notes.filter((x) => x.id !== id) }));
          return okr({
            undo: () => {
              if (get().notes.some((x) => x.id === id)) return fail('Already restored.');
              set((s) => ({ notes: [n, ...s.notes].sort((x, y) => y.at - x.at) }));
              return okr({}, 'Note restored');
            },
          }, 'Note deleted');
        },

        /* ═════════════════════ 1:1s ═════════════════════ */

        createSeries(input) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const partner = a.users.find((u) => u.id === input.partnerId && u.active);
          if (!partner || partner.id === a.user.id) return fail('Choose someone to meet with.');
          if (!performanceUsers().some((u) => u.id === partner.id)) return fail(`${first(partner)} doesn’t use Performance & OKRs.`);
          if (input.kind === 'manager' && !isManagerOf(a.users, a.user.id, partner.id)) return fail('Manager 1:1s are with your direct reports. Use a mentoring 1:1 instead.');
          if (get().series.some((s) => (s.leadId === a.user.id && s.memberId === partner.id) || (s.leadId === partner.id && s.memberId === a.user.id))) return fail(`You already have a 1:1 with ${first(partner)}.`);
          if (!Number.isFinite(input.firstAt) || input.firstAt < Date.now() - 60 * 60_000) return fail('Pick a time in the future.');
          const id = uid('oo');
          set((s) => ({ series: [...s.series, { id, leadId: a.user.id, memberId: partner.id, kind: input.kind, cadence: input.cadence, durationMin: 30, nextAt: input.firstAt, agenda: [], sharedNotes: '', privateNotes: {}, actionItems: [], meetings: [], moods: {}, createdAt: Date.now() }] }));
          notify([partner.id], { title: `${first(a.user)} set up a ${input.kind === 'mentor' ? 'mentoring ' : ''}1:1 with you`, body: `${input.cadence === 'weekly' ? 'Weekly' : input.cadence === 'biweekly' ? 'Every 2 weeks' : 'Monthly'} · first on ${new Date(input.firstAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`, link: `/performance/one-on-ones/${id}` }, a.user.id);
          return okr({ id }, '1:1 created');
        },

        addAgendaItem(seriesId, text, source) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const s = get().series.find((x) => x.id === seriesId);
          if (!s || !isSeriesMember(a.v, s)) return fail('1:1 not found.');
          const t = text.trim();
          if (t.length < 2) return fail('Add a talking point.');
          if (s.agenda.length >= 20) return fail('That’s a full agenda — finish some items first.');
          const id = uid('ag');
          patchSeries(seriesId, (x) => ({ ...x, agenda: [...x.agenda, { id, text: t.slice(0, 200), byId: a.user.id, createdAt: Date.now(), done: false, source }] }));
          return okr({ id }, 'Added to the agenda');
        },

        toggleAgendaItem(seriesId, itemId) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const s = get().series.find((x) => x.id === seriesId);
          if (!s || !isSeriesMember(a.v, s)) return fail('1:1 not found.');
          patchSeries(seriesId, (x) => ({ ...x, agenda: x.agenda.map((g) => (g.id === itemId ? { ...g, done: !g.done } : g)) }));
          return okr({});
        },

        removeAgendaItem(seriesId, itemId) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const s = get().series.find((x) => x.id === seriesId);
          if (!s || !isSeriesMember(a.v, s)) return fail('1:1 not found.');
          const idx = s.agenda.findIndex((g) => g.id === itemId);
          const item = s.agenda[idx];
          if (!item) return fail('Item not found.');
          patchSeries(seriesId, (x) => ({ ...x, agenda: x.agenda.filter((g) => g.id !== itemId) }));
          return okr({
            undo: () => {
              patchSeries(seriesId, (x) => (x.agenda.some((g) => g.id === itemId) ? x : { ...x, agenda: [...x.agenda.slice(0, idx), item, ...x.agenda.slice(idx)] }));
              return okr({}, 'Restored');
            },
          }, 'Removed from the agenda');
        },

        reorderAgenda(seriesId, ids) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const s = get().series.find((x) => x.id === seriesId);
          if (!s || !isSeriesMember(a.v, s)) return fail('1:1 not found.');
          const byId = new Map(s.agenda.map((g) => [g.id, g]));
          const next = ids.map((id) => byId.get(id)).filter((g): g is NonNullable<typeof g> => !!g);
          for (const g of s.agenda) if (!ids.includes(g.id)) next.push(g);
          patchSeries(seriesId, (x) => ({ ...x, agenda: next }));
          return okr({});
        },

        saveSharedNotes(seriesId, text) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const s = get().series.find((x) => x.id === seriesId);
          if (!s || !isSeriesMember(a.v, s)) return fail('1:1 not found.');
          patchSeries(seriesId, (x) => ({ ...x, sharedNotes: text.slice(0, 8000) }));
          return okr({});
        },

        savePrivateNotes(seriesId, text) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const s = get().series.find((x) => x.id === seriesId);
          if (!s || !isSeriesMember(a.v, s)) return fail('1:1 not found.');
          patchSeries(seriesId, (x) => ({ ...x, privateNotes: { ...x.privateNotes, [a.user.id]: text.slice(0, 8000) } }));
          return okr({});
        },

        addActionItem(seriesId, input) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const s = get().series.find((x) => x.id === seriesId);
          if (!s || !isSeriesMember(a.v, s)) return fail('1:1 not found.');
          const t = input.text.trim();
          if (t.length < 3) return fail('Describe the action item.');
          if (input.ownerId !== s.leadId && input.ownerId !== s.memberId) return fail('Assign it to someone in this 1:1.');
          const id = uid('ac');
          patchSeries(seriesId, (x) => ({ ...x, actionItems: [...x.actionItems, { id, text: t.slice(0, 200), ownerId: input.ownerId, dueAt: input.dueAt, done: false, createdAt: Date.now() }] }));
          if (input.ownerId !== a.user.id) notify([input.ownerId], { kind: 'work', title: `New action item from your 1:1`, body: t.slice(0, 90), link: `/performance/one-on-ones/${seriesId}` }, a.user.id);
          return okr({ id }, 'Action item added');
        },

        toggleActionItem(seriesId, itemId) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const s = get().series.find((x) => x.id === seriesId);
          if (!s || !isSeriesMember(a.v, s)) return fail('1:1 not found.');
          patchSeries(seriesId, (x) => ({ ...x, actionItems: x.actionItems.map((i) => (i.id === itemId ? { ...i, done: !i.done, doneAt: i.done ? undefined : Date.now() } : i)) }));
          return okr({});
        },

        removeActionItem(seriesId, itemId) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const s = get().series.find((x) => x.id === seriesId);
          if (!s || !isSeriesMember(a.v, s)) return fail('1:1 not found.');
          patchSeries(seriesId, (x) => ({ ...x, actionItems: x.actionItems.filter((i) => i.id !== itemId) }));
          return okr({}, 'Action item removed');
        },

        setMood(seriesId, mood) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const s = get().series.find((x) => x.id === seriesId);
          if (!s || !isSeriesMember(a.v, s)) return fail('1:1 not found.');
          const m = Math.round(mood);
          if (m < 1 || m > 5) return fail('Mood is 1–5.');
          patchSeries(seriesId, (x) => ({ ...x, moods: { ...x.moods, [a.user.id]: m } }));
          return okr({});
        },

        completeMeeting(seriesId) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const s = get().series.find((x) => x.id === seriesId);
          if (!s || !isSeriesMember(a.v, s)) return fail('1:1 not found.');
          if (!s.agenda.length && !s.sharedNotes.trim()) return fail('Add a talking point or notes before completing the meeting.');
          const now = Date.now();
          const meetingId = uid('mt');
          const carried = s.agenda.filter((g) => !g.done);
          const cadenceMs = CADENCE_DAYS[s.cadence] * DAY;
          let next = s.nextAt + cadenceMs;
          while (next < now + 60 * 60_000) next += cadenceMs;
          patchSeries(seriesId, (x) => ({
            ...x,
            meetings: [{ id: meetingId, at: Math.min(now, x.nextAt > now ? now : x.nextAt), agenda: x.agenda.map((g) => ({ text: g.text, byId: g.byId, done: g.done })), notes: x.sharedNotes, moods: x.moods }, ...x.meetings],
            agenda: carried.map((g) => ({ ...g, carried: (g.carried ?? 0) + 1 })),
            sharedNotes: '',
            moods: {},
            nextAt: next,
          }));
          const other = a.user.id === s.leadId ? s.memberId : s.leadId;
          notify([other], { kind: 'work', title: `Notes from your 1:1 with ${first(a.user)}`, body: carried.length ? `${carried.length} item${carried.length === 1 ? '' : 's'} carried over to next time` : 'Agenda completed', link: `/performance/one-on-ones/${seriesId}` }, a.user.id);
          return okr({ meetingId, carried: carried.length }, 'Meeting completed');
        },

        rescheduleSeries(seriesId, at, cadence) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const s = get().series.find((x) => x.id === seriesId);
          if (!s || !isSeriesMember(a.v, s)) return fail('1:1 not found.');
          if (!Number.isFinite(at) || at < Date.now() - 60 * 60_000) return fail('Pick a time in the future.');
          patchSeries(seriesId, (x) => ({ ...x, nextAt: at, cadence: cadence ?? x.cadence }));
          const other = a.user.id === s.leadId ? s.memberId : s.leadId;
          notify([other], { kind: 'work', title: `${first(a.user)} moved your 1:1`, body: new Date(at).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), link: `/performance/one-on-ones/${seriesId}` }, a.user.id);
          return okr({}, '1:1 rescheduled');
        },

        /* ═════════════════════ Growth ═════════════════════ */

        addGoal(userId, input) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          if (!canEditGrowth(a.v, a.users, userId)) return fail('You can only edit your own plan or your reports’.');
          const title = input.title.trim();
          if (title.length < 4) return fail('Name the growth goal.');
          if (get().goals.filter((g) => g.userId === userId && g.status !== 'done').length >= 6) return fail('Focus: at most 6 active growth goals.');
          const now = Date.now();
          const id = uid('gg');
          const g: GrowthGoal = {
            id,
            userId,
            title: title.slice(0, 120),
            competency: input.competency,
            why: input.why?.trim() || undefined,
            status: 'not-started',
            dueAt: input.dueAt,
            actions: input.actions.map((t) => t.trim()).filter(Boolean).slice(0, 8).map((text, i) => ({ id: `${id}-a${i + 1}`, text, done: false })),
            learning: input.learning ?? [],
            createdAt: now,
            createdBy: a.user.id,
            updatedAt: now,
          };
          set((s) => ({ goals: [...s.goals, g] }));
          if (userId !== a.user.id) notify([userId], { title: `${first(a.user)} added a growth goal to your plan`, body: `“${g.title}”`, link: '/performance/growth' }, a.user.id);
          return okr({ id }, 'Growth goal added');
        },

        updateGoal(id, patch) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const g = get().goals.find((x) => x.id === id);
          if (!g) return fail('Goal not found.');
          if (!canEditGrowth(a.v, a.users, g.userId)) return fail('You can only edit your own plan or your reports’.');
          if (patch.title !== undefined && patch.title.trim().length < 4) return fail('Name the growth goal.');
          patchGoal(id, (x) => ({ ...x, ...patch, title: patch.title?.trim() ?? x.title, updatedAt: Date.now() }));
          return okr({}, patch.status === 'done' ? 'Growth goal completed' : 'Growth goal updated');
        },

        toggleGoalAction(goalId, actionId) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const g = get().goals.find((x) => x.id === goalId);
          if (!g) return fail('Goal not found.');
          if (!canEditGrowth(a.v, a.users, g.userId)) return fail('You can only edit your own plan or your reports’.');
          const actions = g.actions.map((x) => (x.id === actionId ? { ...x, done: !x.done } : x));
          const doneCount = actions.filter((x) => x.done).length;
          const status: GoalStatus = actions.length && doneCount === actions.length ? 'done' : doneCount > 0 ? 'in-progress' : g.status === 'done' ? 'in-progress' : g.status;
          patchGoal(goalId, (x) => ({ ...x, actions, status, updatedAt: Date.now() }));
          return okr({ status });
        },

        addGoalAction(goalId, text) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const g = get().goals.find((x) => x.id === goalId);
          if (!g) return fail('Goal not found.');
          if (!canEditGrowth(a.v, a.users, g.userId)) return fail('You can only edit your own plan or your reports’.');
          const t = text.trim();
          if (t.length < 3) return fail('Describe the action.');
          patchGoal(goalId, (x) => ({ ...x, actions: [...x.actions, { id: uid('ga'), text: t.slice(0, 160), done: false }], status: x.status === 'done' ? 'in-progress' : x.status, updatedAt: Date.now() }));
          return okr({});
        },

        deleteGoal(id) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const g = get().goals.find((x) => x.id === id);
          if (!g) return fail('Goal not found.');
          if (!canEditGrowth(a.v, a.users, g.userId)) return fail('You can only edit your own plan or your reports’.');
          set((s) => ({ goals: s.goals.filter((x) => x.id !== id) }));
          return okr({
            undo: () => {
              if (get().goals.some((x) => x.id === id)) return fail('Already restored.');
              set((s) => ({ goals: [...s.goals, g] }));
              return okr({}, 'Goal restored');
            },
          }, 'Growth goal deleted');
        },

        setLevel(userId, ladderId, levelId) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          if (!(isManagerOf(a.users, a.user.id, userId) || isAdmin(a.v))) {
            audit(a.user.id, 'performance.level.change', nameOf(a.users, userId), 'Not manager or People Ops', 'warning', 'denied');
            return fail('Only their manager or People Ops can change a level.');
          }
          if (userId === a.user.id) return fail('You can’t change your own level.');
          const prev = get().levels[userId];
          set((s) => ({ levels: { ...s.levels, [userId]: { ladderId, levelId, since: Date.now() } } }));
          audit(a.user.id, 'performance.level.changed', nameOf(a.users, userId), `${prev ? `${prev.levelId} → ` : ''}${levelId}`, 'warning');
          notify([userId], { title: `Your career level is now ${levelId}`, body: `Updated by ${first(a.user)}. Congratulations!`, link: '/performance/growth' }, a.user.id);
          return okr({}, `Level set to ${levelId}`);
        },

        /* ═════════════════════ Evidence ═════════════════════ */

        addEvidence(input, viewer) {
          const a = need(viewer);
          if (isErr(a)) return fail(a.error);
          const target = a.users.find((u) => u.id === input.userId && u.active);
          if (!target) return fail('Person not found.');
          const allowed = canAddEvidence(a.v, a.users, target.id);
          if (!allowed.ok) {
            audit(a.user.id, 'performance.evidence.add', target.name, allowed.reason, 'warning', 'denied');
            return fail(allowed.reason);
          }
          const title = input.title.trim();
          if (title.length < 3) return fail('Evidence needs a title.');
          if (input.keyResultId && !kr(input.keyResultId)) return fail('Unknown key result.');
          const dup = get().evidence.find((e) => e.userId === target.id && e.title.toLowerCase() === title.toLowerCase() && Date.now() - e.at < 7 * DAY);
          if (dup) return okr({ id: dup.id }, 'Already in highlights');
          const ev: Evidence = { id: uid('ev'), userId: target.id, title: title.slice(0, 160), detail: input.detail?.trim().slice(0, 500) || undefined, source: input.source, keyResultId: input.keyResultId, at: Date.now(), addedBy: a.user.id };
          set((s) => ({ evidence: [ev, ...s.evidence] }));
          if (target.id !== a.user.id) notify([target.id], { title: `${first(a.user)} added to your highlights`, body: `“${ev.title}” · ${input.source.label}`, link: '/performance' }, a.user.id);
          return okr({ id: ev.id }, 'Added to highlights');
        },

        removeEvidence(id) {
          const a = need();
          if (isErr(a)) return fail(a.error);
          const e = get().evidence.find((x) => x.id === id);
          if (!e) return fail('Evidence not found.');
          if (!(e.userId === a.user.id || e.addedBy === a.user.id || isAdmin(a.v))) return fail('You can’t remove this evidence.');
          set((s) => ({ evidence: s.evidence.filter((x) => x.id !== id) }));
          return okr({}, 'Removed from highlights');
        },

        resetDemo() {
          viewedPackets.clear();
          set({ ...createPerfSeed() });
        },
      };
    },
    {
      name: PERF_STORE_KEY,
      version: PERF_DATA_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => Object.fromEntries(DATA_KEYS.map((k) => [k, s[k]])) as unknown as PerfData,
      migrate: () => createPerfSeed() as unknown as PerfStore,
    },
  ),
);
