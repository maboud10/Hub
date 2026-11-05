/**
 * One place that turns a "next best action" into UI: opens the right modal
 * or runs the store action. Pipeline cards, the candidate sheet, the command
 * deck and requisition pages all call `runNextAction` so behaviour is identical.
 */
import type { NextAction } from '@/talent/gates';
import type { Application } from '@/talent/types';
import type { TalentTask } from '@/talent/selectors';
import { useTalent } from '@/talent/store';
import { useTalentUI } from '@/talent/ui';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';

export function runNextAction(action: NextAction, app: Application, navigate?: (to: string) => void) {
  const ui = useTalentUI.getState();
  const store = useTalent.getState();
  const latestOffer = () =>
    store.offers.filter((o) => o.applicationId === app.id && o.status !== 'rescinded').sort((a, b) => b.createdAt - a.createdAt)[0];

  switch (action.kind) {
    case 'outreach':
      ui.openModal({ kind: 'outreach', candidateId: app.candidateId, requisitionId: app.requisitionId, step: 1 });
      return;
    case 'follow-up': {
      const sent = store.outreach
        .filter((o) => o.candidateId === app.candidateId && o.requisitionId === app.requisitionId && o.status !== 'draft')
        .sort((a, b) => b.step - a.step)[0];
      ui.openModal({ kind: 'outreach', candidateId: app.candidateId, requisitionId: app.requisitionId, step: Math.min(3, (sent?.step ?? 1) + 1) as 1 | 2 | 3 });
      return;
    }
    case 'log-reply':
      ui.openModal({ kind: 'log-reply', candidateId: app.candidateId, requisitionId: app.requisitionId });
      return;
    case 'consent':
      ui.openModal({ kind: 'consent', candidateId: app.candidateId });
      return;
    case 'schedule-screen':
      ui.openModal({ kind: 'schedule', applicationId: app.id, interviewKind: 'screen' });
      return;
    case 'schedule-interview':
      ui.openModal({ kind: 'schedule', applicationId: app.id });
      return;
    case 'scorecard': {
      const me = useHub.getState().sessionUserId;
      const now = Date.now();
      const mine = store.interviews
        .filter((i) => i.applicationId === app.id && i.status !== 'cancelled' && i.interviewerIds.includes(me ?? '') && i.scheduledAt < now)
        .find((i) => !store.scorecards.some((s) => s.interviewId === i.id && s.interviewerId === me));
      if (mine) ui.openModal({ kind: 'scorecard', interviewId: mine.id });
      else ui.openCandidate(app.candidateId);
      return;
    }
    case 'decision':
      ui.openModal({ kind: 'decision', applicationId: app.id });
      return;
    case 'draft-offer':
      ui.openModal({ kind: 'offer', applicationId: app.id });
      return;
    case 'submit-offer': {
      const o = latestOffer();
      if (o) toast.result(store.submitOffer(o.id));
      return;
    }
    case 'approve-offer':
      if (navigate) navigate('/talent/offers');
      else ui.openModal({ kind: 'offer', applicationId: app.id, offerId: latestOffer()?.id });
      return;
    case 'send-offer': {
      const o = latestOffer();
      if (o) toast.result(store.sendOffer(o.id));
      return;
    }
    case 'record-response':
      ui.openModal({ kind: 'offer', applicationId: app.id, offerId: latestOffer()?.id });
      return;
    case 'handoff': {
      const res = store.handOffToHR(app.id);
      if (toast.result(res) && res.journeyId) ui.openModal({ kind: 'hired', applicationId: app.id, journeyId: res.journeyId });
      return;
    }
    case 'advance':
      if (action.to) ui.openModal({ kind: 'move', applicationId: app.id, to: action.to });
      return;
    case 'reject':
      ui.openModal({ kind: 'reject', applicationId: app.id });
      return;
    default:
      ui.openCandidate(app.candidateId);
  }
}

/** Open the right modal / page for an item from "My next steps". */
export function runTalentTask(task: TalentTask, navigate: (to: string) => void) {
  const ui = useTalentUI.getState();
  const store = useTalent.getState();
  switch (task.kind) {
    case 'scorecard':
      if (task.interviewId) ui.openModal({ kind: 'scorecard', interviewId: task.interviewId });
      else navigate(task.link);
      return;
    case 'decision':
      if (task.applicationId) ui.openModal({ kind: 'decision', applicationId: task.applicationId });
      else navigate(task.link);
      return;
    case 'interview':
      if (task.candidateId) ui.openCandidate(task.candidateId);
      else navigate(task.link);
      return;
    case 'follow-up': {
      if (!task.candidateId) return navigate(task.link);
      const last = store.outreach
        .filter((o) => o.candidateId === task.candidateId && (o.requisitionId ?? undefined) === task.requisitionId && o.status !== 'draft')
        .sort((a, b) => b.step - a.step)[0];
      ui.openModal({ kind: 'outreach', candidateId: task.candidateId, requisitionId: task.requisitionId ?? null, step: Math.min(3, (last?.step ?? 1) + 1) as 1 | 2 | 3 });
      return;
    }
    default:
      navigate(task.link);
  }
}
