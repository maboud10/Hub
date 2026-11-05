/**
 * HR Home · "Your next steps": the signed-in person's HR to-dos from
 * `useMyHrTasks()` (signatures, policy re-acknowledgements, benefits
 * enrolment, pulse check-ins, the onboarding plan, People Ops replies,
 * approvals and upcoming time off) as a numbered queue with urgency and a
 * one-tap action each. Pulse and Ask People Ops open locally; the rest navigate.
 */
import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, ChevronDown, ChevronUp, ClipboardCheck, GraduationCap, HeartPulse, ListChecks, MessagesSquare, Plane, Rocket, ScrollText, Signature, Smile, Sparkles, TreePalm, type LucideIcon } from 'lucide-react';
import { useMyHrTasks, type HrTask, type HrTaskKind } from '@/hr/selectors';
import type { PulseMilestone } from '@/hr/types';
import { cx } from '@/lib/cx';
import { HrPanel } from '../components/shared';
import { MILESTONE_NOUN } from './format';

const KIND_META: Record<HrTaskKind, { icon: LucideIcon; cta: string; hue: number }> = {
  sign: { icon: Signature, cta: 'Sign now', hue: 262 },
  policy: { icon: ScrollText, cta: 'Read', hue: 199 },
  enrol: { icon: HeartPulse, cta: 'Choose', hue: 330 },
  pulse: { icon: Smile, cta: 'Check in', hue: 42 },
  case: { icon: MessagesSquare, cta: 'Read reply', hue: 160 },
  approvals: { icon: ClipboardCheck, cta: 'Review', hue: 280 },
  onboarding: { icon: Rocket, cta: 'Open plan', hue: 300 },
  training: { icon: GraduationCap, cta: 'Start course', hue: 242 },
  leave: { icon: TreePalm, cta: 'View', hue: 150 },
};
/** Long lists show the first few steps, with a "Show N more" toggle. */
const COLLAPSE_AT = 5;

type Urgency = { label: string; tone: 'now' | 'soon' | 'info' };

function urgencyOf(t: HrTask): Urgency {
  if (t.urgent) return { label: t.kind === 'enrol' || t.kind === 'training' ? 'Due soon' : t.kind === 'approvals' ? 'Waiting' : 'Action needed', tone: 'now' };
  switch (t.kind) {
    case 'pulse':
      return { label: 'Open now', tone: 'soon' };
    case 'policy':
      return { label: 'To read', tone: 'soon' };
    case 'training':
      return { label: 'Required', tone: 'soon' };
    case 'approvals':
      return { label: 'Waiting', tone: 'soon' };
    case 'case':
      return { label: 'New reply', tone: 'info' };
    case 'leave':
      return { label: 'Coming up', tone: 'info' };
    case 'onboarding':
      return { label: 'In progress', tone: 'info' };
    default:
      return { label: 'To do', tone: 'info' };
  }
}

function summary(total: number, urgent: number) {
  if (!total) return 'Nothing is waiting on you.';
  const later = total - urgent;
  if (!urgent) return `${total} thing${total === 1 ? '' : 's'} for when you have a moment.`;
  return `${urgent} need${urgent === 1 ? 's' : ''} you now${later ? ` · ${later} when you have a moment` : ''}.`;
}

export function NextSteps({ onTask }: { onTask: (task: HrTask) => void }) {
  const tasks = useMyHrTasks();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const urgent = tasks.filter((t) => t.urgent).length;
  const collapsible = tasks.length > COLLAPSE_AT + 1;
  const shown = collapsible && !expanded ? tasks.slice(0, COLLAPSE_AT) : tasks;
  return (
    <HrPanel
      className="hr-home-steps"
      title="Your next steps"
      icon={<ListChecks aria-hidden="true" />}
      sub={summary(tasks.length, urgent)}
      actions={tasks.length ? <span className="hr-home-steps__total" aria-label={`${tasks.length} open steps`}>{tasks.length}</span> : undefined}
    >
      {tasks.length ? (
        <>
          <ol className="hr-home-steps__list" id="hr-home-steps-list">
            {shown.map((t, i) => {
              const m = KIND_META[t.kind];
              const Icon = m.icon;
              const u = urgencyOf(t);
              return (
                <li key={t.id}>
                  <button type="button" className={cx('hr-home-step', `is-${u.tone}`)} style={{ '--k-h': m.hue } as CSSProperties} onClick={() => onTask(t)}>
                    <span className="hr-home-step__n" aria-hidden="true">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="hr-home-step__icon" aria-hidden="true">
                      <Icon />
                    </span>
                    <span className="hr-home-step__body">
                      <span className="hr-home-step__title">{t.kind === 'pulse' && t.ref && t.ref in MILESTONE_NOUN ? `Your ${MILESTONE_NOUN[t.ref as PulseMilestone]} check-in` : t.title}</span>
                      <span className="hr-home-step__detail">{t.detail}</span>
                    </span>
                    <span className={cx('hr-home-step__urgency', `is-${u.tone}`)}>{u.label}</span>
                    <span className="hr-home-step__cta">
                      <span className="hr-home-step__cta-text">{m.cta}</span>
                      <ArrowRight aria-hidden="true" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {collapsible && (
            <button type="button" className="hr-home-steps__more" aria-expanded={expanded} aria-controls="hr-home-steps-list" onClick={() => setExpanded((v) => !v)}>
              {expanded ? (
                <>
                  <ChevronUp aria-hidden="true" /> Show fewer
                </>
              ) : (
                <>
                  <ChevronDown aria-hidden="true" /> Show {tasks.length - COLLAPSE_AT} more
                </>
              )}
            </button>
          )}
        </>
      ) : (
        <div className="hr-home-steps__clear">
          <span className="hr-home-steps__clear-icon" aria-hidden="true">
            <Sparkles />
          </span>
          <div className="grow">
            <strong>You’re all caught up</strong>
            <p className="text-sm muted">Nothing needs you right now. Maybe plan something nice?</p>
          </div>
          <div className="hr-home-steps__clear-cta">
            <button type="button" className="btn btn--sm btn--primary" onClick={() => navigate('/hr/time-off?new=1')}>
              <Plane /> Plan time off
            </button>
            <button type="button" className="btn btn--sm" onClick={() => navigate('/hr/benefits')}>
              <HeartPulse /> Explore benefits
            </button>
          </div>
        </div>
      )}
    </HrPanel>
  );
}
