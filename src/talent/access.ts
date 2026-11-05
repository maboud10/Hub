/**
 * Talent Hub authorisation rules — pure functions (no React), mirrored by the
 * Firestore security rules in `firestore/firestore.rules`.
 *
 *  talent.hire            Hiring managers: their requisitions, scorecards, decisions, HM offer sign-off
 *  talent.manage          Recruiters: every requisition, pipeline moves, interviews, offers
 *  talent.source          AI sourcing studio + LinkedIn outreach
 *  talent.comp.view       Salary bands, expectations and offer amounts (sensitive)
 *  talent.offers.approve  People Ops offer approval (never your own draft)
 *  hr.onboarding.manage   HR Portal onboarding journeys + account provisioning
 */
import { hasPermission, type PermissionSet } from '@/lib/rbac';
import type { ApprovalStep, Application, Candidate, Interview, Offer, OnboardingJourney, OnboardingTask, Requisition, StageId } from './types';

export const TALENT_PERMS = {
  hire: 'talent.hire',
  manage: 'talent.manage',
  source: 'talent.source',
  comp: 'talent.comp.view',
  approveOffers: 'talent.offers.approve',
  onboarding: 'hr.onboarding.manage',
} as const;

export interface TalentViewer {
  userId: string;
  perms: PermissionSet;
}

export interface Verdict {
  ok: boolean;
  reason?: string;
}

const yes: Verdict = { ok: true };
const no = (reason: string): Verdict => ({ ok: false, reason });

export const can = (v: TalentViewer, perm: string) => hasPermission(v.perms, perm);
export const canManage = (v: TalentViewer) => can(v, TALENT_PERMS.manage);
export const canHire = (v: TalentViewer) => can(v, TALENT_PERMS.hire) || canManage(v);
export const canSource = (v: TalentViewer) => can(v, TALENT_PERMS.source);
export const canSeeComp = (v: TalentViewer) => can(v, TALENT_PERMS.comp);
export const canManageOnboarding = (v: TalentViewer) => can(v, TALENT_PERMS.onboarding);

export function isOnHiringTeam(userId: string, req: Requisition) {
  return req.hiringManagerId === userId || req.recruiterId === userId || req.interviewPlan.some((s) => s.interviewerIds.includes(userId));
}

export function canSeeRequisition(v: TalentViewer, req: Requisition) {
  if (canManage(v)) return true;
  return can(v, TALENT_PERMS.hire) && isOnHiringTeam(v.userId, req);
}

export function visibleRequisitionIds(v: TalentViewer, reqs: Requisition[]): Set<string> {
  return new Set(reqs.filter((r) => canSeeRequisition(v, r)).map((r) => r.id));
}

export function canSeeCandidate(v: TalentViewer, candidate: Candidate, apps: Application[], visibleReqIds: ReadonlySet<string>) {
  if (canManage(v)) return true;
  return apps.some((a) => a.candidateId === candidate.id && visibleReqIds.has(a.requisitionId));
}

/** Phone numbers and personal emails are recruiter-only. */
export const canSeeContact = (v: TalentViewer) => canManage(v) || canSeeComp(v);

export const canCreateRequisition = (v: TalentViewer) => canHire(v);

export function canEditRequisition(v: TalentViewer, req: Requisition): Verdict {
  if (canManage(v)) return yes;
  if (can(v, TALENT_PERMS.hire) && req.hiringManagerId === v.userId && (req.status === 'draft' || req.status === 'pending-approval')) return yes;
  return no('Only recruiters can edit an open requisition.');
}

export function canApproveRequisition(v: TalentViewer, req: Requisition): Verdict {
  if (!canManage(v)) return no('Requires “Run recruiting”.');
  if (req.hiringManagerId === v.userId) return no('Separation of duties: hiring managers can’t approve headcount for their own team.');
  return yes;
}

const ASSESS: StageId[] = ['screen', 'interview', 'final'];

/** Recruiters move anything; hiring managers move their own candidates within Assess/Decide. */
export function canMoveApplication(v: TalentViewer, app: Application, req: Requisition, to?: StageId): Verdict {
  if (canManage(v)) return yes;
  if (!can(v, TALENT_PERMS.hire) || req.hiringManagerId !== v.userId) return no('Only the recruiter or hiring manager can move this candidate.');
  if (!ASSESS.includes(app.stage) || (to && !ASSESS.includes(to))) return no('Hiring managers can move candidates between Screen, Interviews and Debrief.');
  return yes;
}

export function canRecordDecision(v: TalentViewer, req: Requisition): Verdict {
  if (req.hiringManagerId === v.userId && canHire(v)) return yes;
  if (canManage(v)) return yes;
  return no('Only the hiring manager records the hire decision.');
}

export function canScheduleInterview(v: TalentViewer, req: Requisition): Verdict {
  if (canManage(v)) return yes;
  if (can(v, TALENT_PERMS.hire) && req.hiringManagerId === v.userId) return yes;
  return no('Only the recruiter or hiring manager can schedule interviews.');
}

export function canSubmitScorecard(v: TalentViewer, interview: Interview): Verdict {
  if (!interview.interviewerIds.includes(v.userId)) return no('Only panel members submit scorecards for this interview.');
  if (interview.status === 'cancelled') return no('This interview was cancelled.');
  return yes;
}

export const canDraftOffer = (v: TalentViewer): Verdict => (canManage(v) ? yes : no('Only recruiters draft offers.'));

/** Separation of duties + four-eyes: drafter can't approve; each step needs a different approver. */
export function canApproveOfferStep(v: TalentViewer, offer: Offer, req: Requisition, step: ApprovalStep): Verdict {
  if (offer.status !== 'pending-approval') return no('This offer is not awaiting approval.');
  const entry = offer.approvals.find((a) => a.step === step);
  if (!entry || entry.decision !== 'pending') return no('This step is already decided.');
  if (offer.createdBy === v.userId) return no('Separation of duties: you drafted this offer.');
  const other = offer.approvals.find((a) => a.step !== step && a.decision === 'approved');
  if (other?.approverId === v.userId) return no('Four-eyes rule: a different person must approve each step.');
  if (step === 'hiring-manager') {
    if (req.hiringManagerId === v.userId || can(v, TALENT_PERMS.approveOffers)) return yes;
    return no('Only the hiring manager signs off this step.');
  }
  if (!can(v, TALENT_PERMS.approveOffers)) return no('Requires “Approve offers”.');
  return yes;
}

export function canSeeJourney(v: TalentViewer, j: OnboardingJourney) {
  return canManageOnboarding(v) || j.managerId === v.userId || j.buddyId === v.userId || j.hubUserId === v.userId;
}

export function canToggleTask(v: TalentViewer, j: OnboardingJourney, task: OnboardingTask): Verdict {
  if (canManageOnboarding(v)) return yes;
  switch (task.owner) {
    case 'manager':
      return j.managerId === v.userId ? yes : no('Manager task: only the hiring manager can complete it.');
    case 'buddy':
      return j.buddyId === v.userId ? yes : no('Buddy task: only the assigned buddy can complete it.');
    case 'new-hire':
      return j.hubUserId === v.userId ? yes : no('Only the new hire can complete this.');
    case 'it':
      return can(v, 'hub.users.manage') ? yes : no('IT task: requires user-management rights.');
    default:
      return no('People Ops task.');
  }
}
