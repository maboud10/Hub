/**
 * Requisitions & offers area — pure helpers shared by the requisition list,
 * detail page, creation wizard, offers board and offer modal.
 */
import type {
  Application,
  ApprovalStep,
  Department,
  InterviewKind,
  InterviewStep,
  JobProfile,
  Offer,
  ReqPriority,
  ReqStatus,
  Requisition,
  Seniority,
  StageId,
} from '@/talent/types';
import { INTERVIEW_KIND_META, LOCATIONS, STAGES } from '@/talent/constants';
import { canApproveOfferStep, type TalentViewer, type Verdict } from '@/talent/access';
import type { User } from '@/types';
import { uid } from '@/lib/id';

export const DAY = 86_400_000;

/** Stable (module-level) picker filter: recruiters live in People Ops. */
export const isPeopleOps = (u: User) => u.department === 'People Ops';

export const DEPARTMENTS: Department[] = [
  'Engineering',
  'Design',
  'Product',
  'People Ops',
  'Finance',
  'Sales',
  'Marketing',
  'IT & Security',
  'Operations',
  'Customer Success',
];

export const PRIORITY_ORDER: ReqPriority[] = ['critical', 'high', 'normal', 'low'];
export const PRIORITY_RANK: Record<ReqPriority, number> = { critical: 0, high: 1, normal: 2, low: 3 };
export const STATUS_RANK: Record<ReqStatus, number> = { 'pending-approval': 0, open: 1, draft: 2, 'on-hold': 3, filled: 4, closed: 5 };
/** Pipeline stages a live application can sit in (hired apps are counted as seats). */
export const LIVE_STAGES = STAGES.filter((s) => s.id !== 'hired');

// ───────────────────────── requisitions ─────────────────────────
export const daysSince = (ts: number, now = Date.now()) => Math.max(0, Math.floor((now - ts) / DAY));

/** Days a requisition has been (or was) open; null until headcount is approved. */
export function daysOpen(r: Requisition, now = Date.now()): number | null {
  if (!r.openedAt) return null;
  const end = (r.status === 'filled' || r.status === 'closed') && r.closedAt ? r.closedAt : now;
  return Math.max(0, Math.floor((end - r.openedAt) / DAY));
}

export const isMine = (r: Requisition, userId: string | undefined) => !!userId && (r.hiringManagerId === userId || r.recruiterId === userId);

export function activeApps(apps: Application[]) {
  return apps.filter((a) => a.status === 'active');
}

export function avgMatch(apps: Application[]): number | null {
  const scores = apps.filter((a) => a.status === 'active' && typeof a.match?.score === 'number').map((a) => a.match!.score);
  return scores.length ? Math.round(scores.reduce((s, n) => s + n, 0) / scores.length) : null;
}

export function stageCounts(apps: Application[]): Map<StageId, number> {
  const m = new Map<StageId, number>();
  for (const a of apps) if (a.status === 'active') m.set(a.stage, (m.get(a.stage) ?? 0) + 1);
  return m;
}

/** Group applications by requisition id (one pass). */
export function appsByReq(apps: Application[]): Map<string, Application[]> {
  const m = new Map<string, Application[]>();
  for (const a of apps) {
    const list = m.get(a.requisitionId);
    if (list) list.push(a);
    else m.set(a.requisitionId, [a]);
  }
  return m;
}

/** Map a decoded JD location ("Dubai, UAE") onto the picker list when possible. */
export function normaliseLocation(loc: string | null | undefined): string {
  if (!loc) return '';
  const l = loc.toLowerCase();
  return LOCATIONS.find((x) => l.includes(x.toLowerCase())) ?? loc;
}

const BAND_BY_SENIORITY: Record<Seniority, string> = {
  intern: 'E2',
  junior: 'E3',
  mid: 'E4',
  senior: 'E5',
  staff: 'E6',
  principal: 'E7',
  lead: 'E6',
  manager: 'M4',
  director: 'M5',
  executive: 'M6',
};
export const bandForSeniority = (s: Seniority) => BAND_BY_SENIORITY[s] ?? 'E4';

/** Annual salary range from a decoded JD (monthly figures are annualised). */
export function annualSalary(p: JobProfile | null | undefined): { min: number; max: number; currency: string } | null {
  if (!p?.salary) return null;
  const k = p.salary.period === 'month' ? 12 : 1;
  return { min: Math.round(p.salary.min * k), max: Math.round(p.salary.max * k), currency: p.salary.currency };
}

export const roundTo = (n: number, step = 1000) => Math.round(n / step) * step;

// ───────────────────────── interview plans ─────────────────────────
export type PlanFamily = 'engineering' | 'design' | 'product' | 'sales' | 'default';

export const PLAN_TEMPLATES: Record<PlanFamily, { label: string; kinds: InterviewKind[] }> = {
  engineering: { label: 'Engineering loop', kinds: ['screen', 'technical', 'system-design', 'culture', 'final'] },
  design: { label: 'Design loop', kinds: ['screen', 'portfolio', 'culture', 'final'] },
  product: { label: 'Product loop', kinds: ['screen', 'case', 'panel', 'final'] },
  sales: { label: 'Go-to-market loop', kinds: ['screen', 'case', 'panel', 'final'] },
  default: { label: 'Standard loop', kinds: ['screen', 'panel', 'culture', 'final'] },
};

/** Role family from the title first (it is more specific), then the department. */
export function planFamily(department: Department, title = ''): PlanFamily {
  const t = title.toLowerCase();
  if (/engineer|developer|\bsre\b|devops|architect|programmer/.test(t)) return 'engineering';
  if (/design|\bux\b|researcher/.test(t)) return 'design';
  if (/product manager|product owner|product lead/.test(t)) return 'product';
  if (/account executive|sales|business development|account manager/.test(t)) return 'sales';
  switch (department) {
    case 'Engineering':
    case 'IT & Security':
      return 'engineering';
    case 'Design':
      return 'design';
    case 'Product':
      return 'product';
    case 'Sales':
      return 'sales';
    default:
      return 'default';
  }
}

export function makeStep(kind: InterviewKind, interviewerIds: string[] = []): InterviewStep {
  const m = INTERVIEW_KIND_META[kind];
  return { id: uid('step'), kind, label: m.label, durationMins: m.defaultMins, interviewerIds, focus: [...m.focus] };
}

/** Template loop with sensible owners: the recruiter screens, the hiring manager closes. */
export function templatePlan(family: PlanFamily, team: { recruiterId?: string; hiringManagerId?: string } = {}): InterviewStep[] {
  return PLAN_TEMPLATES[family].kinds.map((kind) =>
    makeStep(kind, kind === 'screen' && team.recruiterId ? [team.recruiterId] : kind === 'final' && team.hiringManagerId ? [team.hiringManagerId] : []),
  );
}

export function planMinutes(steps: InterviewStep[]) {
  return steps.reduce((s, x) => s + x.durationMins, 0);
}

export function fmtMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function planInterviewers(steps: InterviewStep[]) {
  return [...new Set(steps.flatMap((s) => s.interviewerIds))];
}

// ───────────────────────── offers ─────────────────────────
export const ACTIVE_OFFER_STATUSES: Offer['status'][] = ['draft', 'pending-approval', 'approved', 'sent'];
export const CLOSED_OFFER_STATUSES: Offer['status'][] = ['accepted', 'declined', 'rescinded'];
export const isActiveOffer = (o: Offer) => ACTIVE_OFFER_STATUSES.includes(o.status);

/** Latest offer per application, newest first. */
export function offersFor(offers: Offer[], applicationId: string) {
  return offers.filter((o) => o.applicationId === applicationId).sort((a, b) => b.createdAt - a.createdAt);
}

/** The offer that is still in play (draft → accepted); declined/rescinded ones are history. */
export function liveOffer(offers: Offer[], applicationId: string): Offer | undefined {
  const latest = offersFor(offers, applicationId)[0];
  return latest && latest.status !== 'declined' && latest.status !== 'rescinded' ? latest : undefined;
}

export function firstYearTotal(o: { baseSalary: number; bonusPct: number; signOnBonus: number }) {
  const base = Number(o.baseSalary) || 0;
  return Math.round(base + (base * (Number(o.bonusPct) || 0)) / 100 + (Number(o.signOnBonus) || 0));
}

const BONUS_BY_BAND: Record<string, number> = { E2: 5, E3: 6, E4: 8, E5: 10, E6: 12, E7: 15, M4: 12, M5: 15, M6: 20 };
export const defaultBonus = (band: string) => BONUS_BY_BAND[band] ?? 10;

export type ExpiryTone = 'ok' | 'warn' | 'danger' | 'expired';

export function expiryInfo(expiresAt: number, now = Date.now()): { label: string; short: string; tone: ExpiryTone } {
  const diff = expiresAt - now;
  if (diff <= 0) {
    const d = Math.max(1, Math.floor(-diff / DAY));
    return { label: `Expired ${d}d ago`, short: 'Expired', tone: 'expired' };
  }
  const days = Math.floor(diff / DAY);
  const hours = Math.max(1, Math.floor(diff / 3_600_000));
  const short = days >= 1 ? `${days}d` : `${hours}h`;
  return { label: `Expires in ${days >= 1 ? `${days} day${days === 1 ? '' : 's'}` : `${hours}h`}`, short, tone: days <= 1 ? 'danger' : days <= 3 ? 'warn' : 'ok' };
}

/** First pending step the viewer may decide, or the reason they can't. */
export function viewerApproval(v: TalentViewer | null, offer: Offer, req: Requisition | undefined): { step: ApprovalStep | null; verdict: Verdict } {
  const pending = offer.approvals.filter((a) => a.decision === 'pending');
  if (!v || !req || offer.status !== 'pending-approval' || !pending.length) return { step: null, verdict: { ok: false, reason: 'Nothing to approve.' } };
  let first: Verdict | null = null;
  for (const ap of pending) {
    const verdict = canApproveOfferStep(v, offer, req, ap.step);
    if (verdict.ok) return { step: ap.step, verdict };
    first ??= verdict;
  }
  return { step: pending[0].step, verdict: first ?? { ok: false, reason: 'Not allowed.' } };
}
