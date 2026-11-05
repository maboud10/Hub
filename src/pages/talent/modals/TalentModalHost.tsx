/**
 * Renders the single active Talent Hub modal (with exit animation).
 */
import { useEffect, useState } from 'react';
import { useTalentUI, type TalentModal } from '@/talent/ui';
import { MoveStageModal } from './MoveStageModal';
import { RejectModal } from './RejectModal';
import { DecisionModal } from './DecisionModal';
import { ConsentModal } from './ConsentModal';
import { LogReplyModal } from './LogReplyModal';
import { AddToPipelineModal } from './AddToPipelineModal';
import { OutreachModal } from './OutreachModal';
import { ImportModal } from './ImportModal';
import { ScheduleModal } from './ScheduleModal';
import { ScorecardModal } from './ScorecardModal';
import { OfferModal } from './OfferModal';
import { HiredModal } from './HiredModal';

export function TalentModalHost() {
  const modal = useTalentUI((s) => s.modal);
  const close = useTalentUI((s) => s.closeModal);
  const [last, setLast] = useState<TalentModal | null>(modal);

  useEffect(() => {
    if (modal) {
      setLast(modal);
      return;
    }
    const t = window.setTimeout(() => setLast(null), 240);
    return () => clearTimeout(t);
  }, [modal]);

  const current = modal ?? last;
  if (!current) return null;
  const open = !!modal;
  const key = JSON.stringify(current);

  switch (current.kind) {
    case 'move':
      return <MoveStageModal key={key} modal={current} open={open} onClose={close} />;
    case 'reject':
      return <RejectModal key={key} modal={current} open={open} onClose={close} />;
    case 'decision':
      return <DecisionModal key={key} modal={current} open={open} onClose={close} />;
    case 'consent':
      return <ConsentModal key={key} modal={current} open={open} onClose={close} />;
    case 'log-reply':
      return <LogReplyModal key={key} modal={current} open={open} onClose={close} />;
    case 'add-to-pipeline':
      return <AddToPipelineModal key={key} modal={current} open={open} onClose={close} />;
    case 'outreach':
      return <OutreachModal key={key} modal={current} open={open} onClose={close} />;
    case 'import':
      return <ImportModal key={key} modal={current} open={open} onClose={close} />;
    case 'schedule':
      return <ScheduleModal key={key} modal={current} open={open} onClose={close} />;
    case 'scorecard':
      return <ScorecardModal key={key} modal={current} open={open} onClose={close} />;
    case 'offer':
      return <OfferModal key={key} modal={current} open={open} onClose={close} />;
    case 'hired':
      return <HiredModal key={key} modal={current} open={open} onClose={close} />;
    default:
      return null;
  }
}
