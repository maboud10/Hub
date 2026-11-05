/**
 * Shared bits for the pipeline dialogs: the gradient icon tile in the modal
 * header, the candidate line at the top of each dialog and the "record no
 * longer exists" fallback.
 */
import type { ReactNode } from 'react';
import { UserRoundX, type LucideIcon } from 'lucide-react';
import type { Candidate } from '@/talent/types';
import { EmptyState } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { CandidateAvatar, SampleTag } from '../components/shared';
import { hueVars } from './pipelineUtils';

export function ModalIcon({ icon: Icon, hue, tone }: { icon: LucideIcon; hue?: number; tone?: 'danger' | 'success' | 'warning' }) {
  return (
    <span className={cx('tl-mm-icon', hue !== undefined && 'tl-mm-icon--hue', tone && `tl-mm-icon--${tone}`)} style={hue !== undefined ? hueVars(hue) : undefined} aria-hidden="true">
      <Icon />
    </span>
  );
}

export function CandidateLine({ cand, sub, aside }: { cand: Candidate; sub?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="tl-mm-who">
      <CandidateAvatar person={cand} size={36} />
      <div className="tl-mm-who__text">
        <div className="tl-mm-who__name">
          {cand.name}
          {cand.sample && <SampleTag />}
        </div>
        {sub && <div className="tl-mm-who__sub">{sub}</div>}
      </div>
      {aside}
    </div>
  );
}

export function MissingRecord({ what = 'application' }: { what?: string }) {
  return (
    <EmptyState icon={<UserRoundX />} title={`This ${what} no longer exists`}>
      It may have been removed, or you no longer have access to it.
    </EmptyState>
  );
}

/** Numbered step heading inside a dialog ("1 · Why are we closing?"). */
export function StepHead({ n, children, hint }: { n: number; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="tl-mm-step">
      <span className="tl-mm-step__n" aria-hidden="true">
        {n}
      </span>
      <span className="tl-mm-step__label">{children}</span>
      {hint && <span className="tl-mm-step__hint">{hint}</span>}
    </div>
  );
}
