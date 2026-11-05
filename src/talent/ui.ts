/**
 * Ephemeral Talent Hub UI state: the candidate profile sheet and the single
 * active modal. Any screen can open them, e.g.
 *   useTalentUI.getState().openCandidate('c-01')
 *   useTalentUI.getState().openModal({ kind: 'schedule', applicationId: 'a-05', interviewKind: 'screen' })
 */
import { create } from 'zustand';
import type { InterviewKind, Prospect, StageId } from './types';

export type TalentModal =
  /** Gate checklist + confirm (with recruiter override). */
  | { kind: 'move'; applicationId: string; to: StageId }
  | { kind: 'reject'; applicationId: string }
  | { kind: 'decision'; applicationId: string }
  | { kind: 'consent'; candidateId: string }
  | { kind: 'log-reply'; candidateId: string; requisitionId?: string | null }
  | { kind: 'add-to-pipeline'; candidateId: string }
  /** AI outreach composer (LinkedIn connect / InMail / email). */
  | { kind: 'outreach'; candidateId: string; requisitionId?: string | null; step?: 1 | 2 | 3; prospect?: Prospect }
  /** Import from a LinkedIn URL, "Save to PDF" export or pasted profile. */
  | { kind: 'import'; requisitionId?: string | null }
  | { kind: 'schedule'; applicationId: string; interviewKind?: InterviewKind; interviewId?: string }
  | { kind: 'scorecard'; interviewId: string }
  | { kind: 'offer'; applicationId: string; offerId?: string }
  /** Celebration + HR Portal hand-off after an accepted offer. */
  | { kind: 'hired'; applicationId: string; journeyId?: string };

export type TalentModalKind = TalentModal['kind'];

interface TalentUIState {
  candidateId: string | null;
  modal: TalentModal | null;
  openCandidate(id: string): void;
  closeCandidate(): void;
  openModal(modal: TalentModal): void;
  closeModal(): void;
}

export const useTalentUI = create<TalentUIState>()((set) => ({
  candidateId: null,
  modal: null,
  openCandidate: (candidateId) => set({ candidateId }),
  closeCandidate: () => set({ candidateId: null }),
  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: null }),
}));
