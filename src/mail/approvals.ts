/**
 * Approvals that act in place.
 *
 * Synthesizes approval cards from the real Procurement, HR Portal, Travel &
 * Expenses and Talent Hub stores — only items actually waiting on the viewer,
 * filtered with each app's OWN permission rules — and dispatches decisions to
 * the source app's actions, so its tracker advances exactly as if the person
 * had clicked Approve there. Other apps are only ever loaded with dynamic
 * `import()` (type-only references below are erased at build time).
 */
import type { BridgeViewer } from '@/lib/appBridge';
import type { User } from '@/types';
import { useMail } from './store';
import type { ApprovalItem } from './types';

type ProcurementModule = typeof import('@/procurement/store');
type HrModules = { store: typeof import('@/hr/store'); access: typeof import('@/hr/access'); constants: typeof import('@/hr/constants') };
type ExpensesModules = { store: typeof import('@/expenses/store'); access: typeof import('@/expenses/access') };
type TalentModules = { store: typeof import('@/talent/store'); access: typeof import('@/talent/access') };

export interface ApprovalLoaders {
  procurement: () => Promise<ProcurementModule>;
  hr: () => Promise<HrModules>;
  expenses: () => Promise<ExpensesModules>;
  talent: () => Promise<TalentModules>;
}

export const DEFAULT_LOADERS: ApprovalLoaders = {
  procurement: () => import('@/procurement/store'),
  hr: async () => {
    const [store, access, constants] = await Promise.all([import('@/hr/store'), import('@/hr/access'), import('@/hr/constants')]);
    return { store, access, constants };
  },
  expenses: async () => {
    const [store, access] = await Promise.all([import('@/expenses/store'), import('@/expenses/access')]);
    return { store, access };
  },
  talent: async () => {
    const [store, access] = await Promise.all([import('@/talent/store'), import('@/talent/access')]);
    return { store, access };
  },
};

const money = (currency: string, n: number) => `${currency} ${Math.round(n).toLocaleString('en-US')}`;

function fmtRange(start: string, end: string): string {
  const f = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  return start === end ? f(start) : `${f(start)} – ${f(end)}`;
}

export interface LiveApprovals {
  items: ApprovalItem[];
  /** Source apps that failed to load (the UI falls back to the seeded demo when nothing loads). */
  errors: string[];
}

export async function collectLiveApprovals(viewer: BridgeViewer, users: User[], loaders: ApprovalLoaders = DEFAULT_LOADERS): Promise<LiveApprovals> {
  const items: ApprovalItem[] = [];
  const errors: string[] = [];
  const me = viewer.user.id;
  const userById = new Map(users.map((u) => [u.id, u]));

  // Procurement — the live stage of the 5-gate constellation is assigned to the viewer.
  try {
    const { useProcurement } = await loaders.procurement();
    for (const req of useProcurement.getState().requests) {
      if (req.status === 'po_issued' || req.status === 'rejected' || req.status === 'approved') continue;
      const idx = req.stages.findIndex((s) => s.status !== 'approved');
      if (idx < 0 || req.stages[idx].reviewerId !== me) continue;
      const stage = req.stages[idx];
      items.push({
        id: `ap-proc-${req.id}-${idx}`,
        source: 'procurement',
        sourceId: req.id,
        title: req.title,
        requesterId: req.requesterId,
        amount: `${money('USD', req.negotiatedAnnualUsd)} / yr`,
        detail: `${stage.label} · ${req.vendorName} · ${req.department}`,
        steps: req.stages.map((s) => s.label),
        current: idx,
        at: req.updatedAt,
        openTo: '/procurement/requests',
        appLabel: 'Procurement',
        relation: 'reviewer',
        noteRequiredForReject: false,
        canReject: false,
        live: true,
        flags: req.duplicateWarning ? ['Possible duplicate spend'] : undefined,
      });
    }
  } catch {
    errors.push('procurement');
  }

  // HR Portal — time off (line manager or People Ops) and allowance claims (People Ops).
  try {
    const { store, access, constants } = await loaders.hr();
    const st = store.useHr.getState();
    const v = { userId: me, perms: viewer.perms };
    for (const req of st.leave) {
      if (req.status !== 'pending') continue;
      const requester = userById.get(req.userId);
      if (!access.canDecideLeave(v, req, requester).ok) continue;
      const meta = constants.LEAVE_TYPE_BY_ID[req.type];
      const direct = requester?.managerId === me || req.approverId === me;
      items.push({
        id: `ap-leave-${req.id}`,
        source: 'leave',
        sourceId: req.id,
        title: `${meta?.private ? 'Time off' : (meta?.label ?? 'Time off')} · ${req.days} day${req.days === 1 ? '' : 's'}`,
        requesterId: req.userId,
        detail: `${fmtRange(req.start, req.end)}${req.reason ? ` · ${req.reason}` : ''}`,
        steps: ['Requested', direct ? 'Manager' : 'People Ops', 'Booked'],
        current: 1,
        at: req.createdAt,
        openTo: '/hr/approvals',
        appLabel: 'HR Portal',
        relation: direct ? 'direct' : 'queue',
        noteRequiredForReject: true,
        canReject: true,
        live: true,
      });
    }
    for (const c of st.claims) {
      if (c.status !== 'submitted' || !access.canDecideClaim(v, c).ok) continue;
      items.push({
        id: `ap-claim-${c.id}`,
        source: 'claim',
        sourceId: c.id,
        title: `Allowance claim · ${c.description}`,
        requesterId: c.userId,
        amount: money(c.currency, c.amount),
        detail: `${c.merchant}${c.receiptName ? ` · ${c.receiptName}` : ''}`,
        steps: ['Submitted', 'People Ops', 'Payroll'],
        current: 1,
        at: c.createdAt,
        openTo: '/hr/approvals',
        appLabel: 'HR Portal',
        relation: 'queue',
        noteRequiredForReject: true,
        canReject: true,
        live: true,
      });
    }
  } catch {
    errors.push('hr');
  }

  // Travel & Expenses — manager review of reports and travel pre-approvals.
  try {
    const { store, access } = await loaders.expenses();
    const st = store.useExpenses.getState();
    const v = { userId: me, perms: new Set(viewer.perms) };
    for (const r of st.reports) {
      if (r.status !== 'submitted') continue;
      const requester = userById.get(r.userId);
      if (!access.canManagerDecideReport(v, r, requester).ok) continue;
      items.push({
        id: `ap-exp-${r.id}`,
        source: 'expense',
        sourceId: r.id,
        title: `${r.reference} · ${r.title}`,
        requesterId: r.userId,
        amount: money('AED', r.reimbursableAed),
        detail: `${r.receiptIds.length} receipts · ${r.costCenter}`,
        steps: ['Submitted', 'Manager', 'Finance', 'Payroll', 'Paid'],
        current: 1,
        at: r.submittedAt ?? r.updatedAt,
        openTo: '/expenses/approvals',
        appLabel: 'Travel & Expenses',
        relation: requester?.managerId === me ? 'direct' : 'queue',
        noteRequiredForReject: true,
        canReject: true,
        live: true,
      });
    }
    for (const t of st.trips) {
      if (t.status !== 'pending_approval') continue;
      const requester = userById.get(t.userId);
      if (!access.canDecideTrip(v, t, requester).ok) continue;
      items.push({
        id: `ap-trip-${t.id}`,
        source: 'travel',
        sourceId: t.id,
        title: `${t.reference} · ${t.title}`,
        requesterId: t.userId,
        amount: money('AED', t.totalEstimatedAed),
        detail: `${t.originCity} → ${t.destinationCity} · ${fmtRange(t.departureDate, t.returnDate)}`,
        steps: ['Requested', 'Manager', 'Booked', 'Trip'],
        current: 1,
        at: t.createdAt,
        openTo: '/expenses/approvals',
        appLabel: 'Travel & Expenses',
        relation: requester?.managerId === me || t.approverId === me ? 'direct' : 'queue',
        noteRequiredForReject: false,
        canReject: true,
        live: true,
        flags: t.policyFlags.length ? t.policyFlags.slice(0, 2) : undefined,
      });
    }
  } catch {
    errors.push('expenses');
  }

  // Talent Hub — headcount requisitions awaiting approval.
  try {
    const { store, access } = await loaders.talent();
    const st = store.useTalent.getState();
    const v = { userId: me, perms: viewer.perms };
    for (const r of st.requisitions) {
      if (r.status !== 'pending-approval' || !access.canApproveRequisition(v, r).ok) continue;
      items.push({
        id: `ap-req-${r.id}`,
        source: 'requisition',
        sourceId: r.id,
        title: `Headcount · ${r.title} (${r.band})`,
        requesterId: r.hiringManagerId,
        detail: `${r.headcount} seat${r.headcount === 1 ? '' : 's'} · ${r.department} · ${r.location}`,
        steps: ['Draft', 'Approval', 'Open', 'Hiring'],
        current: 1,
        at: r.createdAt,
        openTo: `/talent/requisitions/${r.id}`,
        appLabel: 'Talent Hub',
        relation: 'queue',
        noteRequiredForReject: false,
        canReject: false,
        live: true,
      });
    }
  } catch {
    errors.push('talent');
  }

  return { items, errors };
}

/** Load live approvals into the Mail store (keeps the seeded fallback when nothing loads). */
export async function syncLiveApprovals(viewer: BridgeViewer, users: User[], loaders: ApprovalLoaders = DEFAULT_LOADERS): Promise<LiveApprovals> {
  const res = await collectLiveApprovals(viewer, users, loaders);
  useMail.getState().setLiveApprovals(res.items);
  return res;
}

export interface DecisionOutcome {
  ok: boolean;
  message: string;
  /** The source app already showed its own toast. */
  sourceToasted?: boolean;
}

/** Call the source app's real action. Demo items are decided locally. */
export async function decideApproval(item: ApprovalItem, decision: 'approved' | 'rejected', note?: string, loaders: ApprovalLoaders = DEFAULT_LOADERS): Promise<DecisionOutcome> {
  if (!item.live) return { ok: true, message: decision === 'approved' ? 'Approved' : 'Declined' };
  try {
    switch (item.source) {
      case 'procurement': {
        if (decision === 'rejected') return { ok: false, message: 'Procurement requests are declined in Procurement.' };
        const { useProcurement } = await loaders.procurement();
        const r = useProcurement.getState().advanceApproval(item.sourceId);
        return r.ok ? { ok: true, message: r.allApproved ? 'All approval gates cleared' : `${r.stageApproved ?? 'Stage'} signed off`, sourceToasted: true } : { ok: false, message: 'Request not found.' };
      }
      case 'leave': {
        const { store } = await loaders.hr();
        const r = store.useHr.getState().decideLeave(item.sourceId, decision, note);
        return r.ok ? { ok: true, message: r.message ?? 'Done' } : { ok: false, message: r.error };
      }
      case 'claim': {
        const { store } = await loaders.hr();
        const r = store.useHr.getState().decideClaim(item.sourceId, decision, note);
        return r.ok ? { ok: true, message: r.message ?? 'Done' } : { ok: false, message: r.error };
      }
      case 'expense': {
        const { store } = await loaders.expenses();
        const r = store.useExpenses.getState().managerDecideReport(item.sourceId, decision === 'approved' ? 'manager_approved' : 'rejected', note);
        return r.ok ? { ok: true, message: r.message ?? 'Done' } : { ok: false, message: r.error };
      }
      case 'travel': {
        const { store } = await loaders.expenses();
        const r = store.useExpenses.getState().decideTravel(item.sourceId, decision, note);
        return r.ok ? { ok: true, message: r.message ?? 'Done' } : { ok: false, message: r.error };
      }
      case 'requisition': {
        if (decision === 'rejected') return { ok: false, message: 'Requisitions are declined in Talent Hub.' };
        const { store } = await loaders.talent();
        const r = store.useTalent.getState().approveRequisition(item.sourceId, note);
        return r.ok ? { ok: true, message: r.message ?? 'Done' } : { ok: false, message: r.error };
      }
    }
  } catch {
    return { ok: false, message: `${item.appLabel} isn’t reachable right now.` };
  }
  return { ok: false, message: 'Unsupported approval.' };
}
