/**
 * HR Portal selectors: permission-aware views over the HR store — balances,
 * the approvals inbox, "my next steps", who's away, payslips and People Ops
 * stats. Pure `compute*` helpers are exported for tests; hooks memoise them.
 */
import { useMemo } from 'react';
import type { User } from '@/types';
import { useHub } from '@/store/hub';
import { usePermissions, useSessionUser } from '@/store/selectors';
import { useNow } from '@/hooks/useNow';
import { useTalent } from '@/talent/store';
import type { OnboardingJourney } from '@/talent/types';
import { useHr } from './store';
import * as access from './access';
import { ALLOWANCE_BY_ID, LEAVE_TYPE_BY_ID, LETTER_BY_ID, POLICIES, holidaysFor, type PublicHoliday } from './constants';
import { daysBetween, formatRange, overlaps, todayISO } from './calendar';
import { allowanceUsage, computeBalances, isNewHire, payslipsFor, pulseSchedule, pulseScore, type AllowanceUsage, type LeaveBalance, type Payslip } from './engine';
import { isEmployee } from './seed';
import type { HrData, LeaveStatus, LeaveTypeId } from './types';

const DAY = 86_400_000;

// ───────────────────────── viewer & caps ─────────────────────────
export function useHrViewer(): access.HrViewer | null {
  const user = useSessionUser();
  const perms = usePermissions();
  return useMemo(() => (user ? { userId: user.id, perms } : null), [user, perms]);
}

export interface HrCaps {
  /** Can use the HR Portal at all. */
  hr: boolean;
  /** People Ops (`hr.people.manage`). */
  manage: boolean;
  /** Sees others' pay (`hub.people.sensitive`). */
  sensitive: boolean;
  /** Has active direct reports. */
  manager: boolean;
  reports: number;
}

export function useHrCaps(): HrCaps {
  const v = useHrViewer();
  const users = useHub((s) => s.users);
  return useMemo(() => {
    if (!v) return { hr: false, manage: false, sensitive: false, manager: false, reports: 0 };
    const reports = users.filter((u) => u.active && u.managerId === v.userId && isEmployee(u)).length;
    return { hr: access.canUseHR(v), manage: access.canManageHR(v), sensitive: access.canSeePay(v, '__other__'), manager: reports > 0, reports };
  }, [v, users]);
}

/** Snapshot of HR data (stable between renders of the same state). */
export function useHrData(): HrData {
  const s = useHr();
  return useMemo(
    () => ({
      version: s.version,
      leave: s.leave,
      adjustments: s.adjustments,
      elections: s.elections,
      claims: s.claims,
      documents: s.documents,
      letters: s.letters,
      acks: s.acks,
      comp: s.comp,
      pulses: s.pulses,
      cases: s.cases,
    }),
    [s.version, s.leave, s.adjustments, s.elections, s.claims, s.documents, s.letters, s.acks, s.comp, s.pulses, s.cases],
  );
}

/** Me, my manager, my direct reports and my teammates (same manager). */
export function useTeam() {
  const me = useSessionUser();
  const users = useHub((s) => s.users);
  return useMemo(() => {
    const active = users.filter((u) => u.active && isEmployee(u));
    return {
      me,
      manager: me?.managerId ? users.find((u) => u.id === me.managerId) : undefined,
      reports: me ? active.filter((u) => u.managerId === me.id) : [],
      peers: me ? active.filter((u) => u.id !== me.id && !!me.managerId && u.managerId === me.managerId) : [],
    };
  }, [me, users]);
}

// ───────────────────────── balances & holidays ─────────────────────────
export function useBalances(userId?: string, year?: number): LeaveBalance[] {
  const me = useSessionUser();
  const users = useHub((s) => s.users);
  const leave = useHr((s) => s.leave);
  const adjustments = useHr((s) => s.adjustments);
  const minute = useNow(60_000);
  return useMemo(() => {
    const u = userId ? users.find((x) => x.id === userId) : me;
    if (!u) return [];
    return computeBalances(u, leave, adjustments, year ?? new Date(minute).getFullYear(), todayISO(minute));
  }, [userId, users, me, leave, adjustments, year, minute]);
}

export function useAllowanceUsage(userId?: string): AllowanceUsage[] {
  const me = useSessionUser();
  const claims = useHr((s) => s.claims);
  return useMemo(() => {
    const id = userId ?? me?.id;
    return id ? allowanceUsage(id, claims, new Date().getFullYear()) : [];
  }, [userId, me, claims]);
}

/** Public holidays for my location: upcoming (next 12 months) and this year's full list. */
export function useHolidays(location?: string): { upcoming: PublicHoliday[]; year: PublicHoliday[]; applies: boolean } {
  const me = useSessionUser();
  return useMemo(() => {
    const loc = location ?? me?.location ?? '';
    const all = holidaysFor(loc);
    const today = todayISO();
    const horizon = todayISO(Date.now() + 365 * DAY);
    const y = today.slice(0, 4);
    return { upcoming: all.filter((h) => h.date >= today && h.date <= horizon), year: all.filter((h) => h.date.startsWith(y)), applies: all.length > 0 };
  }, [location, me]);
}

// ───────────────────────── approvals inbox ─────────────────────────
export type ApprovalKind = 'leave' | 'claim' | 'letter' | 'election' | 'case';

export interface ApprovalItem {
  id: string;
  kind: ApprovalKind;
  /** Id of the underlying record. */
  refId: string;
  /** Whose request it is. */
  userId: string;
  title: string;
  detail: string;
  at: number;
  urgent?: boolean;
}

/** Everything waiting on this person's decision (pure). */
export function computeApprovals(v: access.HrViewer | null, data: HrData, users: User[], now = Date.now()): ApprovalItem[] {
  if (!v || !access.canUseHR(v)) return [];
  const out: ApprovalItem[] = [];
  const userOf = (id: string) => users.find((u) => u.id === id);
  const name = (id: string) => userOf(id)?.name ?? 'Someone';
  const today = todayISO(now);
  for (const r of data.leave) {
    if (r.status !== 'pending' || !access.canDecideLeave(v, r, userOf(r.userId)).ok) continue;
    // Managers see their reports; People Ops also sees requests without a manager and escalations.
    const responsible = access.isManagerOf(v, userOf(r.userId)) || r.approverId === v.userId || !r.approverId || now - r.createdAt > 3 * DAY;
    if (!responsible) continue;
    const t = LEAVE_TYPE_BY_ID[r.type];
    const soon = daysBetween(today, r.start) <= 3;
    out.push({
      id: `ap-leave-${r.id}`,
      kind: 'leave',
      refId: r.id,
      userId: r.userId,
      title: `${name(r.userId)} · ${t.label}`,
      detail: `${formatRange(r.start, r.end, r.halfDay)} · ${r.days} day${r.days === 1 ? '' : 's'}${r.reason && !t.private ? ` · ${r.reason}` : ''}`,
      at: r.createdAt,
      urgent: soon || now - r.createdAt > 2 * DAY,
    });
  }
  for (const c of data.claims)
    if (access.canDecideClaim(v, c).ok)
      out.push({ id: `ap-claim-${c.id}`, kind: 'claim', refId: c.id, userId: c.userId, title: `${name(c.userId)} · ${ALLOWANCE_BY_ID[c.allowance].label}`, detail: `AED ${c.amount.toLocaleString()} · ${c.description}`, at: c.createdAt, urgent: now - c.createdAt > 3 * DAY });
  for (const l of data.letters)
    if (access.canDecideLetter(v, l).ok)
      out.push({ id: `ap-letter-${l.id}`, kind: 'letter', refId: l.id, userId: l.userId, title: `${name(l.userId)} · ${LETTER_BY_ID[l.kind].label}`, detail: `${l.addressedTo}${l.country ? ` · ${l.country}` : ''}`, at: l.createdAt, urgent: now - l.createdAt > DAY });
  for (const e of data.elections)
    if (access.canConfirmElection(v, e).ok)
      out.push({ id: `ap-election-${e.id}`, kind: 'election', refId: e.id, userId: e.userId, title: `${name(e.userId)} · Benefits enrolment`, detail: `${e.health[0].toUpperCase()}${e.health.slice(1)} plan · ${e.dependents.length} dependent${e.dependents.length === 1 ? '' : 's'}`, at: e.submittedAt ?? now });
  if (access.canManageHR(v))
    for (const c of data.cases)
      if (c.status === 'open' && c.userId !== v.userId)
        out.push({
          id: `ap-case-${c.id}`,
          kind: 'case',
          refId: c.id,
          userId: c.userId,
          title: c.confidential ? `Confidential · ${name(c.userId)}` : `${name(c.userId)} · ${c.subject}`,
          detail: c.confidential ? 'Only People Ops can see this case.' : c.messages[c.messages.length - 1]?.text.slice(0, 110) ?? '',
          at: c.updatedAt,
          urgent: c.confidential || now - c.updatedAt > DAY,
        });
  return out.sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent) || a.at - b.at);
}

export function useApprovals(): ApprovalItem[] {
  const v = useHrViewer();
  const data = useHrData();
  const users = useHub((s) => s.users);
  const minute = useNow(60_000);
  return useMemo(() => computeApprovals(v, data, users, minute), [v, data, users, minute]);
}

// ───────────────────────── my next steps ─────────────────────────
export type HrTaskKind = 'sign' | 'policy' | 'enrol' | 'pulse' | 'case' | 'approvals' | 'onboarding' | 'leave';

export interface HrTask {
  id: string;
  kind: HrTaskKind;
  title: string;
  detail: string;
  link: string;
  urgent?: boolean;
  /** Record to act on (document id, policy id, milestone…). */
  ref?: string;
}

/** Personal HR to-dos for the signed-in person (pure). */
export function computeHrTasks(v: access.HrViewer | null, user: User | null, data: HrData, journeys: OnboardingJourney[], users: User[], now = Date.now()): HrTask[] {
  if (!v || !user || !access.canUseHR(v)) return [];
  const tasks: HrTask[] = [];
  const today = todayISO(now);
  for (const d of data.documents)
    if (d.userId === user.id && d.signature?.required && !d.signature.signedAt)
      tasks.push({ id: `sign-${d.id}`, kind: 'sign', title: `Sign: ${d.title}`, detail: 'E-signature takes under a minute.', link: '/hr/documents?tab=sign', urgent: true, ref: d.id });
  for (const p of POLICIES) {
    if (!p.mandatory) continue;
    const acked = data.acks.some((a) => a.userId === user.id && a.policyId === p.id && a.version === p.version);
    if (acked) continue;
    const older = data.acks.some((a) => a.userId === user.id && a.policyId === p.id);
    tasks.push({ id: `policy-${p.id}`, kind: 'policy', title: `${older ? 'Updated' : 'Read'}: ${p.title} v${p.version}`, detail: older && p.changes ? p.changes : `${p.readMins}-minute read · acknowledge when done`, link: '/hr/documents?tab=policies', ref: p.id });
  }
  const election = data.elections.find((e) => e.userId === user.id && e.year === new Date(now).getFullYear());
  if (election?.status === 'not-started') {
    const left = election.deadline ? daysBetween(today, election.deadline) : null;
    tasks.push({
      id: 'enrol',
      kind: 'enrol',
      title: 'Choose your benefits',
      detail: left === null ? 'Health, dental, vision and life cover.' : left >= 0 ? `Enrol within ${left} day${left === 1 ? '' : 's'} (deadline ${formatRange(election.deadline!, election.deadline!)}).` : 'The enrolment window has passed. People Ops can still help.',
      link: '/hr/benefits?enrol=1',
      urgent: left !== null && left <= 7,
    });
  }
  if (isNewHire(user.startDate, now)) {
    const slot = pulseSchedule(user.startDate, data.pulses.filter((r) => r.userId === user.id), now).find((s) => s.state === 'open');
    if (slot) tasks.push({ id: `pulse-${slot.milestone}`, kind: 'pulse', title: `Your ${slot.label.toLowerCase()} check-in`, detail: '4 quick questions about your onboarding. 30 seconds.', link: '/hr?pulse=1', ref: slot.milestone });
    const j = journeys.find((x) => x.hubUserId === user.id && x.status !== 'completed');
    if (j) {
      const open = j.tasks.filter((t) => t.owner === 'new-hire' && !t.done).length;
      if (open) tasks.push({ id: `onb-${j.id}`, kind: 'onboarding', title: 'Your onboarding plan', detail: `${open} task${open === 1 ? '' : 's'} for you in your journey.`, link: `/hr/onboarding/${j.id}` });
    }
  }
  for (const c of data.cases)
    if (c.userId === user.id && c.status === 'answered')
      tasks.push({ id: `case-${c.id}`, kind: 'case', title: 'People Ops replied', detail: c.subject, link: '/hr?ask=1', ref: c.id });
  const approvals = computeApprovals(v, data, users, now);
  if (approvals.length)
    tasks.push({ id: 'approvals', kind: 'approvals', title: `${approvals.length} request${approvals.length === 1 ? '' : 's'} waiting on you`, detail: 'Time off, claims, letters and cases.', link: '/hr/approvals', urgent: approvals.some((a) => a.urgent) });
  const next = data.leave
    .filter((r) => r.userId === user.id && r.status === 'approved' && r.end >= today)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  if (next && daysBetween(today, next.start) <= 14)
    tasks.push({ id: `leave-${next.id}`, kind: 'leave', title: next.start <= today ? 'Enjoy your time off 🌴' : `Time off in ${daysBetween(today, next.start)} day${daysBetween(today, next.start) === 1 ? '' : 's'}`, detail: `${LEAVE_TYPE_BY_ID[next.type].label} · ${formatRange(next.start, next.end, next.halfDay)}`, link: '/hr/time-off', ref: next.id });
  return tasks.sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent));
}

export function useMyHrTasks(): HrTask[] {
  const v = useHrViewer();
  const me = useSessionUser();
  const data = useHrData();
  const journeys = useTalent((s) => s.onboarding);
  const users = useHub((s) => s.users);
  const minute = useNow(60_000);
  return useMemo(() => computeHrTasks(v, me, data, journeys, users, minute), [v, me, data, journeys, users, minute]);
}

// ───────────────────────── who's away ─────────────────────────
export interface Absence {
  id: string;
  userId: string;
  start: string;
  end: string;
  days: number;
  status: LeaveStatus;
  /** Undefined when the viewer may only see "Away" (privacy). */
  type?: LeaveTypeId;
  halfDay?: 'am' | 'pm';
  coverId?: string;
}

export type AbsenceScope = 'team' | 'company';

/**
 * Leave visible to the viewer in a date window. Approved leave is visible to
 * teammates as "Away"; pending requests only to the requester, their manager
 * and People Ops. `company` scope is People Ops only (others get their department).
 */
export function computeAbsences(v: access.HrViewer | null, viewer: User | null, data: HrData, users: User[], scope: AbsenceScope, from: string, to: string): Absence[] {
  if (!v || !viewer) return [];
  const manage = access.canManageHR(v);
  const userOf = new Map(users.map((u) => [u.id, u]));
  const inScope = (u: User | undefined) => {
    if (!u || !u.active) return false;
    if (u.id === viewer.id) return true;
    if (scope === 'company') return manage || u.department === viewer.department;
    return u.managerId === viewer.id || u.id === viewer.managerId || (!!viewer.managerId && u.managerId === viewer.managerId);
  };
  return data.leave
    .filter((r) => (r.status === 'approved' || r.status === 'pending') && overlaps(r.start, r.end, from, to))
    .filter((r) => inScope(userOf.get(r.userId)))
    .filter((r) => r.status === 'approved' || access.canSeeLeaveDetail(v, r, userOf.get(r.userId)))
    .map((r) => {
      const detail = access.canSeeLeaveDetail(v, r, userOf.get(r.userId)) || !LEAVE_TYPE_BY_ID[r.type].private;
      return { id: r.id, userId: r.userId, start: r.start, end: r.end, days: r.days, status: r.status, type: detail ? r.type : undefined, halfDay: r.halfDay, coverId: r.coverId };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function useAbsences(scope: AbsenceScope, from: string, to: string): Absence[] {
  const v = useHrViewer();
  const me = useSessionUser();
  const data = useHrData();
  const users = useHub((s) => s.users);
  return useMemo(() => computeAbsences(v, me, data, users, scope, from, to), [v, me, data, users, scope, from, to]);
}

// ───────────────────────── pay ─────────────────────────
/** Payslips for a person (yourself, or anyone with `hub.people.sensitive`). */
export function usePayslips(userId?: string, count = 6): Payslip[] {
  const v = useHrViewer();
  const me = useSessionUser();
  const users = useHub((s) => s.users);
  const comp = useHr((s) => s.comp);
  const claims = useHr((s) => s.claims);
  const elections = useHr((s) => s.elections);
  return useMemo(() => {
    const u = userId ? users.find((x) => x.id === userId) : me;
    if (!u || !v || !access.canSeePay(v, u.id)) return [];
    const year = new Date().getFullYear();
    return payslipsFor(u, comp.find((c) => c.userId === u.id), { claims, election: elections.find((e) => e.userId === u.id && e.year === year) ?? null, count });
  }, [userId, users, me, v, comp, claims, elections, count]);
}

// ───────────────────────── People Ops ─────────────────────────
export interface HrStats {
  headcount: number;
  outToday: Absence[];
  pendingApprovals: number;
  enrolment: { confirmed: number; total: number; overdue: number };
  policyCompliance: { compliant: number; total: number };
  claimsYtd: number;
  openCases: number;
  avgPulse: number | null;
  /** Unused annual leave across the company (days). */
  leaveLiability: number;
  newHires: number;
}

export function computeHrStats(v: access.HrViewer | null, data: HrData, users: User[], now = Date.now()): HrStats | null {
  if (!v || !access.canManageHR(v)) return null;
  const today = todayISO(now);
  const year = new Date(now).getFullYear();
  const staff = users.filter(isEmployee);
  const mandatory = POLICIES.filter((p) => p.mandatory);
  const compliant = staff.filter((u) => mandatory.every((p) => data.acks.some((a) => a.userId === u.id && a.policyId === p.id && a.version === p.version))).length;
  const elections = data.elections.filter((e) => e.year === year && staff.some((u) => u.id === e.userId));
  const outToday = data.leave
    .filter((r) => r.status === 'approved' && r.start <= today && r.end >= today)
    .map((r) => ({ id: r.id, userId: r.userId, start: r.start, end: r.end, days: r.days, status: r.status, type: r.type, halfDay: r.halfDay, coverId: r.coverId }));
  const liability = staff.reduce((n, u) => {
    const b = computeBalances(u, data.leave, data.adjustments, year, today).find((x) => x.type === 'annual');
    return n + Math.max(0, b?.available ?? 0);
  }, 0);
  const pulses = data.pulses.filter((p) => now - p.at < 120 * DAY);
  return {
    headcount: staff.length,
    outToday,
    pendingApprovals: computeApprovals(v, data, users, now).length,
    enrolment: {
      confirmed: elections.filter((e) => e.status === 'confirmed').length,
      total: elections.length,
      overdue: elections.filter((e) => e.status === 'not-started' && !!e.deadline && e.deadline < today).length,
    },
    policyCompliance: { compliant, total: staff.length },
    claimsYtd: data.claims.filter((c) => c.date.startsWith(String(year)) && (c.status === 'approved' || c.status === 'paid')).reduce((n, c) => n + c.amount, 0),
    openCases: data.cases.filter((c) => c.status === 'open').length,
    avgPulse: pulses.length ? Math.round((pulses.reduce((n, p) => n + pulseScore(p), 0) / pulses.length) * 10) / 10 : null,
    leaveLiability: Math.round(liability * 10) / 10,
    newHires: staff.filter((u) => isNewHire(u.startDate, now)).length,
  };
}

export function useHrStats(): HrStats | null {
  const v = useHrViewer();
  const data = useHrData();
  const users = useHub((s) => s.users);
  const minute = useNow(60_000);
  return useMemo(() => computeHrStats(v, data, users, minute), [v, data, users, minute]);
}
