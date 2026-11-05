/**
 * HR Portal store — the "API" for time off, benefits, documents & letters,
 * policy acknowledgements, new-hire pulse check-ins and Ask People Ops.
 *
 * Like the Talent Hub store, every action re-checks the session user's
 * permissions (UI hiding is only UX), enforces separation of duties, writes to
 * the shared NEXUS audit trail and notifies the right people (kind `hr`).
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ActionResult, HubNotification, User } from '@/types';
import { useHub } from '@/store/hub';
import { effectivePermissions, usersWithPermission } from '@/lib/rbac';
import { uid } from '@/lib/id';
import { useTalent } from '@/talent/store';
import * as access from './access';
import { HR_DATA_VERSION, LEAVE_TYPE_BY_ID, LETTER_BY_ID, POLICY_BY_ID, type PublicHoliday } from './constants';
import { addDaysISO, daysBetween, formatRange, holidaySet, holidaysInRange, overlaps, todayISO, workingDays } from './calendar';
import { allowanceUsage, balanceOf, computeBalances, isNewHire, letterReference, pulseSchedule, pulseScore, verificationCode, type LeaveBalance } from './engine';
import { createHrSeed, isEmployee } from './seed';
import type {
  AllowanceId,
  BenefitClaim,
  BenefitElection,
  CaseCategory,
  Dependent,
  DocKind,
  EmployeeDocument,
  HalfDay,
  HealthTier,
  HrCase,
  HrCollection,
  HrData,
  LeaveRequest,
  LeaveTypeId,
  LetterKind,
  LetterRequest,
  PulseMilestone,
  PulseResponse,
} from './types';

// ───────────────────────── inputs ─────────────────────────
export interface LeaveInput {
  type: LeaveTypeId;
  start: string;
  end: string;
  halfDay?: HalfDay;
  reason?: string;
  coverId?: string;
  attachmentName?: string;
}

export interface LeavePreview {
  days: number;
  /** Public holidays inside the range (not deducted). */
  holidays: PublicHoliday[];
  balance: LeaveBalance;
  /** Available after this request (null = no fixed allowance). */
  after: number | null;
  errors: string[];
  warnings: string[];
  autoApprove: boolean;
  approverId?: string;
  needsAttachment: boolean;
  /** Teammates away on overlapping dates. */
  overlapping: { userId: string; start: string; end: string }[];
}

export interface ElectionInput {
  health: HealthTier;
  dental: boolean;
  vision: boolean;
  lifeMultiple: 2 | 3 | 4;
  dependents: Dependent[];
}

export interface ClaimInput {
  allowance: AllowanceId;
  amount: number;
  merchant: string;
  description: string;
  /** ISO date of the purchase. */
  date: string;
  receiptName?: string;
}

export interface LetterInput {
  kind: LetterKind;
  addressedTo: string;
  purpose: string;
  includeSalary: boolean;
  country?: string;
  travelFrom?: string;
  travelTo?: string;
}

export interface UploadInput {
  title: string;
  kind: DocKind;
  fileName: string;
  sizeKb: number;
  confidential?: boolean;
}

export interface PulseInput {
  milestone: PulseMilestone;
  scores: PulseResponse['scores'];
  comment?: string;
  shareWithManager: boolean;
}

export interface CaseInput {
  category: CaseCategory;
  subject: string;
  message: string;
  confidential: boolean;
}

export type IdResult = ActionResult & { id?: string };

export interface HrActions {
  // time off
  previewLeave(input: LeaveInput, userId?: string): LeavePreview;
  requestLeave(input: LeaveInput): IdResult;
  decideLeave(id: string, decision: 'approved' | 'rejected', note?: string): ActionResult;
  cancelLeave(id: string, note?: string): ActionResult;
  adjustBalance(userId: string, type: LeaveTypeId, days: number, reason: string): ActionResult;
  // benefits
  submitElection(input: ElectionInput): ActionResult;
  confirmElection(id: string, note?: string): ActionResult;
  submitClaim(input: ClaimInput): IdResult;
  decideClaim(id: string, decision: 'approved' | 'rejected', note?: string): ActionResult;
  // documents
  requestLetter(input: LetterInput): IdResult & { issued?: boolean };
  decideLetter(id: string, decision: 'issued' | 'rejected', note?: string): ActionResult;
  signDocument(id: string, signedName: string): ActionResult;
  uploadDocument(input: UploadInput): IdResult;
  acknowledgePolicy(policyId: string): ActionResult;
  // people-first
  submitPulse(input: PulseInput): ActionResult;
  openCase(input: CaseInput): IdResult;
  replyCase(id: string, text: string): ActionResult;
  closeCase(id: string): ActionResult;
  // system
  /** Idempotent housekeeping: records for new joiners, payroll settlement of approved claims. */
  syncEmployees(): void;
  resetHrDemo(): void;
}

export type HrStore = HrData & HrActions;

const ok = (message?: string): ActionResult => ({ ok: true, message });
const fail = (error: string): ActionResult => ({ ok: false, error });
const first = (name: string) => name.split(/\s+/)[0];
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** Payroll month an approval lands in (cut-off on the 20th). */
function payrollMonthFor(now: number) {
  const d = new Date(now);
  const m = d.getDate() <= 20 ? d : new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
}

type Doc<K extends HrCollection> = HrData[K][number];

export const useHr = create<HrStore>()(
  persist(
    (set, get) => {
      // ───────────────────────── context ─────────────────────────
      const hub = () => useHub.getState();
      const me = (): User | null => {
        const h = hub();
        return h.users.find((u) => u.id === h.sessionUserId) ?? null;
      };
      const viewerOf = (u: User | null): access.HrViewer | null => (u ? { userId: u.id, perms: effectivePermissions(u, hub().roles) } : null);
      const userOf = (id?: string) => hub().users.find((u) => u.id === id);
      const nameOf = (id?: string) => userOf(id)?.name ?? 'Someone';
      const peopleOps = () => usersWithPermission(hub().users, hub().roles, access.HR_PERMS.manage).filter((u) => u.active);

      const audit = (e: { action: string; target: string; detail?: string; outcome?: 'success' | 'denied'; severity?: 'info' | 'warning' | 'critical' }) =>
        hub().logAudit({ outcome: 'success', severity: 'info', ...e });

      /** Notify users (never the actor themselves). */
      const notify = (ids: (string | undefined | null)[], n: Omit<HubNotification, 'id' | 'userId' | 'at' | 'read' | 'kind'>) => {
        const actor = hub().sessionUserId;
        const list = [...new Set(ids.filter((x): x is string => !!x && x !== actor))];
        if (list.length) hub().pushNotifications(list, { kind: 'hr', ...n });
      };
      const notifyPeopleOps = (n: Omit<HubNotification, 'id' | 'userId' | 'at' | 'read' | 'kind'>, except?: string) =>
        notify(
          peopleOps()
            .map((u) => u.id)
            .filter((id) => id !== except),
          n,
        );

      const deny = (action: string, target: string, reason: string) => {
        audit({ action, target, detail: reason, outcome: 'denied', severity: 'warning' });
        return fail(reason);
      };

      /** Server-style gate: signed in, holds `app:hr`, passes the specific rule. */
      const guard = (action: string, target: string, check: (v: access.HrViewer, user: User) => access.Verdict | boolean): { v: access.HrViewer; user: User } | { error: ActionResult } => {
        const user = me();
        const v = viewerOf(user);
        if (!user || !v) return { error: fail('You are not signed in.') };
        if (!access.canUseHR(v)) return { error: deny(action, target, 'You don’t have access to the HR Portal.') };
        const r = check(v, user);
        const verdict: access.Verdict = typeof r === 'boolean' ? (r ? { ok: true } : { ok: false, reason: 'You don’t have permission to do that.' }) : r;
        if (!verdict.ok) return { error: deny(action, target, verdict.reason ?? 'Not allowed.') };
        return { v, user };
      };

      // ───────────────────────── persistence helpers ─────────────────────────
      const put = <K extends HrCollection>(col: K, doc: Doc<K>) =>
        set((s) => {
          const list = s[col] as Doc<K>[];
          const key = (d: Doc<K>) => (d as { id?: string; userId: string }).id ?? (d as { userId: string }).userId;
          const idx = list.findIndex((d) => key(d) === key(doc));
          const next = idx >= 0 ? list.map((d, i) => (i === idx ? doc : d)) : [doc, ...list];
          return { [col]: next } as unknown as Partial<HrStore>;
        });

      const patch = <K extends HrCollection>(col: K, id: string, fn: (d: Doc<K>) => Doc<K>): Doc<K> | null => {
        const current = (get()[col] as Doc<K>[]).find((d) => (d as { id: string }).id === id);
        if (!current) return null;
        const next = fn(current);
        put(col, next);
        return next;
      };

      const teammatesOf = (u: User) => {
        const users = hub().users.filter((x) => x.active && x.id !== u.id);
        return users.filter((x) => (u.managerId && x.managerId === u.managerId) || x.managerId === u.id || x.id === u.managerId);
      };

      const issueLetterDoc = (l: LetterRequest, at: number) => {
        const meta = LETTER_BY_ID[l.kind];
        put('documents', {
          id: `doc-${l.id}`,
          userId: l.userId,
          kind: 'letter',
          title: `${meta.label} · ${l.addressedTo}`,
          source: 'system',
          letterId: l.id,
          createdAt: at,
          confidential: l.includeSalary,
        });
      };

      return {
        ...createHrSeed(),

        // ───────────────────────── time off ─────────────────────────
        previewLeave(input, userId) {
          const user = userId ? userOf(userId) : me();
          const s = get();
          const today = todayISO();
          const meta = LEAVE_TYPE_BY_ID[input.type];
          const errors: string[] = [];
          const warnings: string[] = [];
          const start = input.start;
          const end = input.end || input.start;
          const year = Number((start || today).slice(0, 4));
          const balances = user ? computeBalances(user, s.leave, s.adjustments, year, today) : [];
          const balance = balances.length
            ? balanceOf(balances, input.type)
            : { type: input.type, allowance: null, adjustments: 0, entitled: null, taken: 0, booked: 0, pending: 0, available: null };
          if (!user) return { days: 0, holidays: [], balance, after: null, errors: ['You are not signed in.'], warnings, autoApprove: false, needsAttachment: false, overlapping: [] };
          if (!start) errors.push('Pick your dates.');
          else if (end < start) errors.push('The end date is before the start date.');
          const halfDay = input.halfDay && start === end && meta.halfDays ? input.halfDay : undefined;
          const days = start && end >= start ? workingDays(start, end, holidaySet(user.location), halfDay) : 0;
          if (start && end >= start && days === 0) errors.push('Those dates are weekends or public holidays, so there’s nothing to book.');
          if (start && end > start && daysBetween(start, end) > 120) errors.push('Requests can cover up to 120 days. Ask People Ops about longer leave.');
          if (balance.available !== null && days > balance.available)
            errors.push(balance.available > 0 ? `You have ${balance.available} ${meta.short.toLowerCase()} day${balance.available === 1 ? '' : 's'} left.` : `No ${meta.label.toLowerCase()} left this year.`);
          if (meta.oncePerEmployment && s.leave.some((r) => r.userId === user.id && r.type === meta.id && (r.status === 'approved' || r.status === 'pending')))
            errors.push(`${meta.label} can be taken once during your employment.`);
          if (start && s.leave.some((r) => r.userId === user.id && (r.status === 'approved' || r.status === 'pending') && overlaps(r.start, r.end, start, end)))
            errors.push('You already have time off booked on some of these days.');
          if (start && start < today && meta.id !== 'sick') warnings.push('These dates are in the past. Your manager will see it was logged afterwards.');
          if (start && meta.noticeDays && days > 2 && start >= today && daysBetween(today, start) < meta.noticeDays)
            warnings.push(`We recommend ${meta.noticeDays} days’ notice for ${meta.label.toLowerCase()}. It’s fine, just a heads-up for your team.`);
          const overlapping = start
            ? s.leave
                .filter((r) => r.status !== 'cancelled' && r.status !== 'rejected' && teammatesOf(user).some((t) => t.id === r.userId) && overlaps(r.start, r.end, start, end))
                .map((r) => ({ userId: r.userId, start: r.start, end: r.end }))
            : [];
          if (overlapping.length >= 2) warnings.push(`${overlapping.length} teammates are also away during these dates.`);
          const needsAttachment = meta.attachmentAfterDays !== undefined && days > meta.attachmentAfterDays;
          return {
            days,
            holidays: start ? holidaysInRange(start, end, user.location) : [],
            balance,
            after: balance.available === null ? null : Math.round((balance.available - days) * 10) / 10,
            errors,
            warnings,
            autoApprove: meta.autoApproveUpTo !== undefined && days > 0 && days <= meta.autoApproveUpTo,
            approverId: access.approverFor(user, hub().users),
            needsAttachment,
            overlapping,
          };
        },

        requestLeave(input) {
          const meta = LEAVE_TYPE_BY_ID[input.type];
          const g = guard('hr.leave.request', meta?.label ?? input.type, () => !!meta);
          if ('error' in g) return g.error;
          const p = get().previewLeave(input);
          if (p.errors.length) return fail(p.errors[0]);
          if (p.needsAttachment && !input.attachmentName) return fail(`Please attach a ${meta.id === 'sick' ? 'medical certificate' : 'supporting document'} for more than ${meta.attachmentAfterDays} days.`);
          const now = Date.now();
          const end = input.end || input.start;
          const req: LeaveRequest = {
            id: uid('lv'),
            userId: g.user.id,
            type: input.type,
            start: input.start,
            end,
            halfDay: input.halfDay && input.start === end && meta.halfDays ? input.halfDay : undefined,
            days: p.days,
            reason: input.reason?.trim() || undefined,
            coverId: input.coverId || undefined,
            attachmentName: input.attachmentName,
            status: p.autoApprove ? 'approved' : 'pending',
            approverId: p.approverId,
            decidedBy: p.autoApprove ? 'system' : undefined,
            decidedAt: p.autoApprove ? now : undefined,
            createdAt: now,
          };
          put('leave', req);
          const when = formatRange(req.start, req.end, req.halfDay);
          const label = meta.private ? 'Time off' : meta.label;
          if (p.autoApprove) {
            notify([p.approverId], { title: `${first(g.user.name)} is off ${req.days <= 1 ? 'today' : 'for a couple of days'}`, body: `${when} · approved automatically. No action needed.`, link: '/hr/time-off' });
          } else if (p.approverId) {
            notify([p.approverId], { title: `${g.user.name} requested time off`, body: `${label} · ${when} · ${req.days} day${req.days === 1 ? '' : 's'}`, link: '/hr/approvals' });
          } else notifyPeopleOps({ title: `${g.user.name} requested time off`, body: `${label} · ${when} · no line manager, so People Ops decides.`, link: '/hr/approvals' }, g.user.id);
          if (req.coverId) notify([req.coverId], { title: `${first(g.user.name)} asked you to cover`, body: `${when}. Thanks for having their back!`, link: '/hr/time-off' });
          audit({ action: 'hr.leave.request', target: `${g.user.name} · ${meta.label}`, detail: `${when} · ${req.days}d · ${req.status}` });
          return { ...ok(p.autoApprove ? 'Approved automatically. Get well soon!' : p.approverId ? `Sent to ${nameOf(p.approverId)} for approval` : 'Sent to People Ops for approval'), id: req.id };
        },

        decideLeave(id, decision, note) {
          const req = get().leave.find((r) => r.id === id);
          const requester = userOf(req?.userId);
          const g = guard(`hr.leave.${decision === 'approved' ? 'approve' : 'decline'}`, requester?.name ?? id, (v) => (req ? access.canDecideLeave(v, req, requester) : access.canManageHR(v)));
          if ('error' in g) return g.error;
          if (!req) return fail('Request not found.');
          if (decision === 'rejected' && (note?.trim().length ?? 0) < 5) return fail('Add a short note so they know why (and what would work instead).');
          const now = Date.now();
          patch('leave', id, (r) => ({ ...r, status: decision, decidedBy: g.user.id, decidedAt: now, decisionNote: note?.trim() || undefined }));
          const meta = LEAVE_TYPE_BY_ID[req.type];
          const when = formatRange(req.start, req.end, req.halfDay);
          notify([req.userId], {
            title: decision === 'approved' ? `Time off approved ✅` : 'Time off declined',
            body: `${meta.label} · ${when} · ${first(g.user.name)}${note?.trim() ? `: “${note.trim()}”` : ''}`,
            link: '/hr/time-off',
          });
          audit({ action: `hr.leave.${decision === 'approved' ? 'approve' : 'decline'}`, target: `${requester?.name ?? req.userId} · ${meta.label}`, detail: `${when}${note ? ` · ${note.trim()}` : ''}` });
          return ok(decision === 'approved' ? `Approved ${first(requester?.name ?? 'their')}’s time off` : 'Declined with your note');
        },

        cancelLeave(id, note) {
          const req = get().leave.find((r) => r.id === id);
          const today = todayISO();
          const g = guard('hr.leave.cancel', id, (v) => (req ? access.canCancelLeave(v, req, today) : false));
          if ('error' in g) return g.error;
          if (!req) return fail('Request not found.');
          const wasApproved = req.status === 'approved';
          patch('leave', id, (r) => ({ ...r, status: 'cancelled', decisionNote: note?.trim() || r.decisionNote }));
          const when = formatRange(req.start, req.end, req.halfDay);
          if (req.userId === g.user.id) notify([req.approverId ?? (wasApproved ? req.decidedBy : undefined)], { title: `${g.user.name} cancelled time off`, body: when, link: '/hr/time-off' });
          else notify([req.userId], { title: 'Your time off was cancelled', body: `${when} · by ${g.user.name}${note ? `: “${note.trim()}”` : ''}`, link: '/hr/time-off' });
          audit({ action: 'hr.leave.cancel', target: `${nameOf(req.userId)} · ${LEAVE_TYPE_BY_ID[req.type].label}`, detail: when });
          return ok('Time off cancelled and days returned to your balance');
        },

        adjustBalance(userId, type, days, reason) {
          const target = userOf(userId);
          const g = guard('hr.balance.adjust', target?.name ?? userId, (v) => access.canAdjustBalance(v, userId));
          if ('error' in g) return g.error;
          if (!target) return fail('Employee not found.');
          if (!days || Math.abs(days) > 60) return fail('Adjust by between 0.5 and 60 days.');
          if (reason.trim().length < 5) return fail('Add a reason (it appears on their balance history).');
          const now = Date.now();
          put('adjustments', { id: uid('adj'), userId, type, year: new Date(now).getFullYear(), days, reason: reason.trim(), by: g.user.id, at: now });
          notify([userId], { title: `Your ${LEAVE_TYPE_BY_ID[type].label.toLowerCase()} balance changed`, body: `${days > 0 ? '+' : ''}${days} day${Math.abs(days) === 1 ? '' : 's'} · ${reason.trim()}`, link: '/hr/time-off' });
          audit({ action: 'hr.balance.adjust', target: `${target.name} · ${LEAVE_TYPE_BY_ID[type].label}`, detail: `${days > 0 ? '+' : ''}${days}d · ${reason.trim()}`, severity: 'warning' });
          return ok(`Balance updated for ${first(target.name)}`);
        },

        // ───────────────────────── benefits ─────────────────────────
        submitElection(input) {
          const g = guard('hr.benefits.submit', 'Benefits enrolment', () => true);
          if ('error' in g) return g.error;
          if (input.dependents.length > 6) return fail('Up to 6 dependents can be covered. Ask People Ops about more.');
          if (input.dependents.some((d) => d.name.trim().length < 2)) return fail('Add a name for every dependent.');
          if (input.dependents.some((d) => d.birthDate && d.birthDate > todayISO())) return fail('A birth date is in the future.');
          const now = Date.now();
          const year = new Date(now).getFullYear();
          const existing = get().elections.find((e) => e.userId === g.user.id && e.year === year);
          const late = !!existing?.deadline && todayISO() > existing.deadline;
          const next: BenefitElection = {
            id: `${g.user.id}-${year}`,
            userId: g.user.id,
            year,
            ...input,
            dependents: input.dependents.map((d) => ({ ...d, name: d.name.trim() })),
            status: 'submitted',
            deadline: existing?.deadline,
            submittedAt: now,
            memberNumber: existing?.memberNumber,
          };
          put('elections', next);
          notifyPeopleOps({ title: `Benefits ${existing?.status === 'confirmed' ? 'change' : 'enrolment'} to confirm`, body: `${g.user.name}${late ? ' · after the deadline' : ''}`, link: '/hr/approvals' }, g.user.id);
          audit({ action: 'hr.benefits.submit', target: g.user.name, detail: `${input.health} · ${input.dependents.length} dependents${late ? ' · late' : ''}` });
          return ok('Submitted! People Ops will confirm with the insurer, usually within a day.');
        },

        confirmElection(id, note) {
          const e = get().elections.find((x) => x.id === id);
          const g = guard('hr.benefits.confirm', nameOf(e?.userId), (v) => (e ? access.canConfirmElection(v, e) : false));
          if ('error' in g) return g.error;
          if (!e) return fail('Enrolment not found.');
          const now = Date.now();
          patch('elections', id, (x) => ({
            ...x,
            status: 'confirmed',
            confirmedAt: now,
            confirmedBy: g.user.id,
            memberNumber: x.memberNumber ?? `${x.health === 'premier' ? 'BG' : 'DM'}-${verificationCode(`${x.id}-${now}`).replace('-', '')}`,
          }));
          notify([e.userId], { title: 'Your benefits are active 🎉', body: `Confirmed by ${first(g.user.name)}${note ? `: “${note}”` : ''}. Your digital insurance card is in Benefits.`, link: '/hr/benefits' });
          audit({ action: 'hr.benefits.confirm', target: nameOf(e.userId), detail: e.health });
          return ok(`Benefits confirmed for ${first(nameOf(e.userId))}`);
        },

        submitClaim(input) {
          const g = guard('hr.claim.submit', input.allowance, () => true);
          if ('error' in g) return g.error;
          const amount = Math.round(input.amount * 100) / 100;
          if (!(amount > 0)) return fail('Enter the amount you spent.');
          if (input.merchant.trim().length < 2) return fail('Where did you buy it?');
          if (input.description.trim().length < 3) return fail('Describe what you bought.');
          if (!input.receiptName) return fail('Attach the receipt.');
          const today = todayISO();
          if (!input.date || input.date > today) return fail('The purchase date can’t be in the future.');
          if (daysBetween(input.date, today) > 60) return fail('Claims must be submitted within 60 days of the purchase.');
          const usage = allowanceUsage(g.user.id, get().claims, Number(input.date.slice(0, 4))).find((u) => u.id === input.allowance)!;
          if (amount > usage.remaining) return fail(`Only AED ${usage.remaining.toLocaleString()} left in this allowance this year.`);
          const now = Date.now();
          const claim: BenefitClaim = {
            id: uid('cl'),
            userId: g.user.id,
            allowance: input.allowance,
            amount,
            currency: 'AED',
            merchant: input.merchant.trim(),
            description: input.description.trim(),
            receiptName: input.receiptName,
            date: input.date,
            status: 'submitted',
            createdAt: now,
          };
          put('claims', claim);
          notifyPeopleOps({ title: 'Allowance claim to review', body: `${g.user.name} · AED ${amount.toLocaleString()} · ${claim.description}`, link: '/hr/approvals' }, g.user.id);
          audit({ action: 'hr.claim.submit', target: `${g.user.name} · ${input.allowance}`, detail: `AED ${amount}` });
          return { ...ok('Claim submitted. Approved claims are paid with the next payroll.'), id: claim.id };
        },

        decideClaim(id, decision, note) {
          const c = get().claims.find((x) => x.id === id);
          const g = guard(`hr.claim.${decision === 'approved' ? 'approve' : 'decline'}`, nameOf(c?.userId), (v) => (c ? access.canDecideClaim(v, c) : false));
          if ('error' in g) return g.error;
          if (!c) return fail('Claim not found.');
          if (decision === 'rejected' && (note?.trim().length ?? 0) < 5) return fail('Add a short note explaining why.');
          const now = Date.now();
          const payrollMonth = decision === 'approved' ? payrollMonthFor(now) : undefined;
          patch('claims', id, (x) => ({ ...x, status: decision, reviewerId: g.user.id, decidedAt: now, note: note?.trim() || undefined, payrollMonth }));
          notify([c.userId], {
            title: decision === 'approved' ? 'Claim approved 💸' : 'Claim declined',
            body: `AED ${c.amount.toLocaleString()} · ${c.description}${decision === 'approved' ? ' · paid with the next payroll' : note ? `: “${note.trim()}”` : ''}`,
            link: '/hr/benefits',
          });
          audit({ action: `hr.claim.${decision === 'approved' ? 'approve' : 'decline'}`, target: `${nameOf(c.userId)} · ${c.allowance}`, detail: `AED ${c.amount}` });
          return ok(decision === 'approved' ? 'Claim approved' : 'Claim declined');
        },

        // ───────────────────────── documents ─────────────────────────
        requestLetter(input) {
          const meta = LETTER_BY_ID[input.kind];
          const g = guard('hr.letter.request', meta?.label ?? input.kind, () => !!meta);
          if ('error' in g) return g.error;
          if (input.addressedTo.trim().length < 2) return fail('Who should the letter be addressed to?');
          if (input.purpose.trim().length < 3) return fail('Add the purpose (it’s printed on the letter).');
          if (meta.needsTravel) {
            if (!input.country?.trim()) return fail('Which country are you travelling to?');
            if (!input.travelFrom || !input.travelTo || input.travelTo < input.travelFrom) return fail('Add valid travel dates.');
          }
          const includeSalary = meta.salary === 'always' ? true : meta.salary === 'never' ? false : input.includeSalary;
          if (includeSalary && !get().comp.some((c) => c.userId === g.user.id)) return fail('We don’t have a pay record for you yet. Ask People Ops.');
          const now = Date.now();
          const id = uid('ltr');
          const seq = 45 + get().letters.length;
          const letter: LetterRequest = {
            id,
            userId: g.user.id,
            kind: input.kind,
            addressedTo: input.addressedTo.trim(),
            purpose: input.purpose.trim(),
            includeSalary,
            country: input.country?.trim() || undefined,
            travelFrom: input.travelFrom,
            travelTo: input.travelTo,
            status: meta.instant ? 'issued' : 'pending',
            reference: letterReference(new Date(now).getFullYear(), seq),
            verifyCode: verificationCode(id),
            createdAt: now,
            issuedAt: meta.instant ? now : undefined,
            issuedBy: meta.instant ? 'auto' : undefined,
          };
          put('letters', letter);
          if (meta.instant) issueLetterDoc(letter, now);
          else notifyPeopleOps({ title: `${meta.label} requested`, body: `${g.user.name} · ${letter.addressedTo}`, link: '/hr/approvals' }, g.user.id);
          audit({ action: meta.instant ? 'hr.letter.issue' : 'hr.letter.request', target: `${g.user.name} · ${meta.label}`, detail: `${letter.reference}${includeSalary ? ' · includes salary' : ''}` });
          return { ...ok(meta.instant ? `${meta.label} ready: ${letter.reference}` : `Requested. People Ops usually turns this around ${meta.turnaround.toLowerCase()}.`), id, issued: meta.instant };
        },

        decideLetter(id, decision, note) {
          const l = get().letters.find((x) => x.id === id);
          const g = guard(`hr.letter.${decision === 'issued' ? 'issue' : 'decline'}`, nameOf(l?.userId), (v) => (l ? access.canDecideLetter(v, l) : false));
          if ('error' in g) return g.error;
          if (!l) return fail('Letter not found.');
          if (decision === 'rejected' && (note?.trim().length ?? 0) < 5) return fail('Add a short note explaining why.');
          const now = Date.now();
          const next = patch('letters', id, (x) => ({ ...x, status: decision, issuedAt: decision === 'issued' ? now : undefined, issuedBy: decision === 'issued' ? g.user.id : undefined, note: note?.trim() || undefined }));
          if (decision === 'issued' && next) issueLetterDoc(next, now);
          const meta = LETTER_BY_ID[l.kind];
          notify([l.userId], {
            title: decision === 'issued' ? `Your ${meta.label.toLowerCase()} is ready` : `${meta.label} declined`,
            body: decision === 'issued' ? `${l.reference} · download it from Documents.` : note?.trim(),
            link: '/hr/documents',
          });
          audit({ action: `hr.letter.${decision === 'issued' ? 'issue' : 'decline'}`, target: `${nameOf(l.userId)} · ${meta.label}`, detail: l.reference });
          return ok(decision === 'issued' ? 'Letter issued' : 'Letter declined');
        },

        signDocument(id, signedName) {
          const d = get().documents.find((x) => x.id === id);
          const g = guard('hr.document.sign', d?.title ?? id, (v) => (d && d.userId === v.userId ? true : { ok: false, reason: 'You can only sign your own documents.' }));
          if ('error' in g) return g.error;
          if (!d?.signature?.required) return fail('This document doesn’t need a signature.');
          if (d.signature.signedAt) return fail('Already signed.');
          if (norm(signedName) !== norm(g.user.name)) return fail(`Type your full name exactly as “${g.user.name}”.`);
          const now = Date.now();
          patch('documents', id, (x) => ({ ...x, signature: { required: true, signedAt: now, signedName: signedName.trim() } }));
          notifyPeopleOps({ title: `${g.user.name} signed a document`, body: d.title, link: '/hr/ops' }, g.user.id);
          audit({ action: 'hr.document.sign', target: `${g.user.name} · ${d.title}` });
          return ok('Signed. A copy is saved in your documents.');
        },

        uploadDocument(input) {
          const g = guard('hr.document.upload', input.title, () => true);
          if ('error' in g) return g.error;
          if (input.title.trim().length < 2) return fail('Give the document a name.');
          if (input.sizeKb > 10 * 1024) return fail('Files must be under 10 MB.');
          const doc: EmployeeDocument = {
            id: uid('doc'),
            userId: g.user.id,
            kind: input.kind,
            title: input.title.trim(),
            source: 'self',
            fileName: input.fileName,
            sizeKb: Math.round(input.sizeKb),
            confidential: input.confidential ?? input.kind === 'id',
            createdAt: Date.now(),
          };
          put('documents', doc);
          audit({ action: 'hr.document.upload', target: `${g.user.name} · ${doc.title}` });
          return { ...ok('Uploaded to your documents'), id: doc.id };
        },

        acknowledgePolicy(policyId) {
          const p = POLICY_BY_ID[policyId];
          const g = guard('hr.policy.ack', p?.title ?? policyId, () => !!p);
          if ('error' in g) return g.error;
          if (get().acks.some((a) => a.userId === g.user.id && a.policyId === policyId && a.version === p.version)) return ok('Already acknowledged');
          const now = Date.now();
          put('acks', { id: `ack-${g.user.id}-${policyId}-${p.version}`, policyId, userId: g.user.id, version: p.version, at: now });
          audit({ action: 'hr.policy.ack', target: `${g.user.name} · ${p.title} v${p.version}` });
          return ok(`Thanks! ${p.title} v${p.version} acknowledged.`);
        },

        // ───────────────────────── people-first ─────────────────────────
        submitPulse(input) {
          const g = guard('hr.pulse.submit', input.milestone, () => true);
          if ('error' in g) return g.error;
          if (!isNewHire(g.user.startDate)) return fail('Pulse check-ins are for your first 90 days.');
          const mine = get().pulses.filter((r) => r.userId === g.user.id);
          const slot = pulseSchedule(g.user.startDate, mine).find((s) => s.milestone === input.milestone);
          if (!slot || slot.state === 'done') return fail('You’ve already shared this check-in. Thank you!');
          if (slot.state !== 'open') return fail('This check-in isn’t open right now.');
          const journey = useTalent.getState().onboarding.find((j) => j.hubUserId === g.user.id);
          const res: PulseResponse = {
            id: uid('pulse'),
            userId: g.user.id,
            journeyId: journey?.id,
            milestone: input.milestone,
            scores: input.scores,
            comment: input.comment?.trim() || undefined,
            shareWithManager: input.shareWithManager,
            at: Date.now(),
          };
          put('pulses', res);
          const score = pulseScore(res);
          if (res.shareWithManager && res.comment) notify([g.user.managerId], { title: `${first(g.user.name)} shared ${slot.label.toLowerCase()} feedback`, body: `“${res.comment.slice(0, 120)}${res.comment.length > 120 ? '…' : ''}”`, link: journey ? `/hr/onboarding/${journey.id}` : '/hr' });
          if (score <= 2.5) notifyPeopleOps({ title: `Check in with ${first(g.user.name)}`, body: `${slot.label} pulse averaged ${score}/5. A quick conversation could help.`, link: journey ? `/hr/onboarding/${journey.id}` : '/hr/ops' }, g.user.id);
          audit({ action: 'hr.pulse.submit', target: `${g.user.name} · ${slot.label}`, detail: `avg ${score}` });
          return ok('Thank you! Your feedback shapes onboarding for everyone after you.');
        },

        openCase(input) {
          const g = guard('hr.case.open', input.category, () => true);
          if ('error' in g) return g.error;
          if (input.subject.trim().length < 4) return fail('Add a short subject.');
          if (input.message.trim().length < 10) return fail('Tell us a little more so we can help.');
          const now = Date.now();
          const c: HrCase = {
            id: uid('case'),
            userId: g.user.id,
            category: input.category,
            subject: input.subject.trim(),
            confidential: input.confidential,
            status: 'open',
            messages: [{ id: uid('cm'), by: g.user.id, at: now, text: input.message.trim() }],
            createdAt: now,
            updatedAt: now,
          };
          put('cases', c);
          notifyPeopleOps(
            input.confidential
              ? { title: 'New confidential case', body: 'Open the HR Portal to view it. Details are hidden from notifications.', link: '/hr/approvals' }
              : { title: `New question from ${g.user.name}`, body: c.subject, link: '/hr/approvals' },
            g.user.id,
          );
          audit({ action: 'hr.case.open', target: `case ${c.id}`, detail: input.confidential ? 'confidential' : input.category });
          return { ...ok('Sent to People Ops. We usually reply within one working day.'), id: c.id };
        },

        replyCase(id, text) {
          const c = get().cases.find((x) => x.id === id);
          const g = guard('hr.case.reply', `case ${id}`, (v) => (c ? access.canReplyCase(v, c) : false));
          if ('error' in g) return g.error;
          if (!c) return fail('Case not found.');
          if (text.trim().length < 2) return fail('Write a reply first.');
          const now = Date.now();
          const fromOwner = c.userId === g.user.id;
          patch('cases', id, (x) => ({
            ...x,
            messages: [...x.messages, { id: uid('cm'), by: g.user.id, at: now, text: text.trim() }],
            status: fromOwner ? 'open' : 'answered',
            assigneeId: fromOwner ? x.assigneeId : g.user.id,
            updatedAt: now,
          }));
          if (fromOwner) {
            if (c.assigneeId) notify([c.assigneeId], { title: `${first(g.user.name)} replied`, body: c.confidential ? 'Confidential case' : c.subject, link: '/hr/approvals' });
            else notifyPeopleOps({ title: `${first(g.user.name)} added to their case`, body: c.confidential ? 'Confidential case' : c.subject, link: '/hr/approvals' }, g.user.id);
          } else notify([c.userId], { title: 'People Ops replied', body: `${c.subject} · ${first(g.user.name)}`, link: '/hr' });
          audit({ action: 'hr.case.reply', target: `case ${id}` });
          return ok('Reply sent');
        },

        closeCase(id) {
          const c = get().cases.find((x) => x.id === id);
          const g = guard('hr.case.close', `case ${id}`, (v) => (c ? access.canSeeCase(v, c) && c.status !== 'closed' : false));
          if ('error' in g) return g.error;
          if (!c) return fail('Case not found.');
          patch('cases', id, (x) => ({ ...x, status: 'closed', updatedAt: Date.now() }));
          if (c.userId !== g.user.id) notify([c.userId], { title: 'Case resolved', body: c.subject, link: '/hr' });
          audit({ action: 'hr.case.close', target: `case ${id}` });
          return ok('Marked as resolved');
        },

        // ───────────────────────── system ─────────────────────────
        syncEmployees() {
          const s = get();
          const now = Date.now();
          const today = todayISO(now);
          const year = new Date(now).getFullYear();
          const talent = useTalent.getState();
          const elections = [...s.elections];
          const documents = [...s.documents];
          const comp = [...s.comp];
          let changed = false;
          for (const u of hub().users.filter(isEmployee)) {
            if (!elections.some((e) => e.userId === u.id && e.year === year)) {
              const from = u.startDate > today ? u.startDate : today;
              elections.push({ id: `${u.id}-${year}`, userId: u.id, year, health: 'plus', dental: false, vision: false, lifeMultiple: 2, dependents: [], status: 'not-started', deadline: addDaysISO(from, 30) });
              changed = true;
            }
            const journey = talent.onboarding.find((j) => j.hubUserId === u.id);
            const offer = journey ? talent.offers.find((o) => o.id === journey.offerId) : undefined;
            if (!documents.some((d) => d.userId === u.id && d.kind === 'contract')) {
              const preboarding = u.startDate > today;
              documents.push(
                { id: `doc-${u.id}-contract`, userId: u.id, kind: 'contract', title: 'Employment contract', description: `${u.title} · permanent, full-time`, source: 'people-ops', createdAt: now, signature: preboarding ? { required: true } : { required: true, signedAt: now, signedName: u.name }, confidential: true },
                { id: `doc-${u.id}-nda`, userId: u.id, kind: 'nda', title: 'Confidentiality & IP agreement', source: 'people-ops', createdAt: now, signature: preboarding ? { required: true } : { required: true, signedAt: now, signedName: u.name } },
              );
              changed = true;
            }
            if (offer && !documents.some((d) => d.userId === u.id && d.kind === 'offer')) {
              documents.push({ id: `doc-${u.id}-offer`, userId: u.id, kind: 'offer', title: `Offer letter: ${offer.title}`, description: 'Accepted in Talent Hub · handed over to People Ops', source: 'talent-hub', offerId: offer.id, createdAt: offer.respondedAt ?? now, confidential: true });
              changed = true;
            }
            if (offer && !comp.some((c) => c.userId === u.id)) {
              comp.push({ userId: u.id, currency: offer.currency, baseMonthly: Math.round(offer.baseSalary / 12), housingMonthly: 0, transportMonthly: 0, pensionRate: 0, bank: { name: 'To be confirmed', ibanLast4: '----' }, payDay: 25 });
              changed = true;
            }
          }
          // Payroll: approved claims are paid on pay day of their payroll month.
          const claims = s.claims.map((c) => {
            if (c.status !== 'approved' || !c.payrollMonth) return c;
            const payDate = `${c.payrollMonth}-25`;
            if (payDate > today) return c;
            changed = true;
            return { ...c, status: 'paid' as const };
          });
          if (changed) set({ elections, documents, comp, claims });
        },

        resetHrDemo() {
          set(createHrSeed());
        },
      };
    },
    {
      name: 'nexus-hr',
      version: HR_DATA_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): HrData => ({
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
      migrate: (persisted, version) => (version === HR_DATA_VERSION ? (persisted as HrData) : createHrSeed()),
    },
  ),
);

/** Housekeeping once per session (new joiners, payroll settlement). */
let synced = false;
export function initHr() {
  if (synced) return;
  synced = true;
  useHr.getState().syncEmployees();
}
