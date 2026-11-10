/**
 * Policy & tips for Time off: the rules in plain words (carry-over, notice,
 * sick leave, privacy, half days, work from anywhere) with a personal
 * carry-over nudge and links to the Flexible & Remote Work policy in
 * Documents and to Ask People Ops.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { BellRing, BookOpen, EyeOff, Globe, Lightbulb, MessageCircleQuestion, RotateCcw, Sun, Thermometer, type LucideIcon } from 'lucide-react';
import type { LeaveTypeId } from '@/hr/types';
import { ANNUAL_CARRY_OVER_MAX, LEAVE_TYPE_BY_ID } from '@/hr/constants';
import { useBalances } from '@/hr/selectors';
import { cx } from '@/lib/cx';
import { HrPanel } from '../components/shared';
import { num } from './utils';

interface TipDef {
  id: string;
  icon: LucideIcon;
  title: string;
  body: ReactNode;
  tone?: 'warning';
  action?: ReactNode;
}

export function PolicyTips({ onRequest }: { onRequest: (type: LeaveTypeId) => void }) {
  const balances = useBalances();
  const annual = balances.find((b) => b.type === 'annual');
  const month = new Date().getMonth();
  const lapse = annual?.available !== null && annual?.available !== undefined && month >= 9 ? Math.max(0, annual.available - ANNUAL_CARRY_OVER_MAX) : 0;
  const year = new Date().getFullYear();
  const wfa = LEAVE_TYPE_BY_ID.wfa;
  const sick = LEAVE_TYPE_BY_ID.sick;

  const tips: TipDef[] = [
    {
      id: 'carry',
      icon: RotateCcw,
      title: 'Carry-over',
      tone: lapse ? 'warning' : undefined,
      body: lapse ? (
        <>
          Up to {ANNUAL_CARRY_OVER_MAX} unused annual days roll into {year + 1}. You have <b>{num(annual?.available ?? 0)}</b> left, so book <b>{num(lapse)}</b> before 31 December or they lapse.
        </>
      ) : (
        <>Up to {ANNUAL_CARRY_OVER_MAX} unused annual days roll into next year. Anything above that lapses on 31 December.</>
      ),
      action: lapse ? (
        <button type="button" className="btn btn--sm" onClick={() => onRequest('annual')}>
          Plan those days
        </button>
      ) : undefined,
    },
    {
      id: 'notice',
      icon: BellRing,
      title: 'Notice',
      body: 'Two weeks for annual and study leave, one week for work from anywhere, a month for parental, Hajj and unpaid leave. It’s a heads-up for your team, never a blocker.',
    },
    {
      id: 'sick',
      icon: Thermometer,
      title: 'Feeling unwell?',
      body: `Up to ${sick.autoApproveUpTo} sick days are approved instantly, no note needed. Longer absences need a medical certificate. Rest first, paperwork later.`,
      action: (
        <button type="button" className="btn btn--sm" onClick={() => onRequest('sick')}>
          Log sick leave
        </button>
      ),
    },
    {
      id: 'private',
      icon: EyeOff,
      title: 'Private by default',
      body: 'Sick, parental and compassionate leave show as “Away” to colleagues. Only your manager and People Ops see the type or your note.',
    },
    {
      id: 'half',
      icon: Sun,
      title: 'Half days',
      body: 'Annual, sick, study and compassionate leave can be a morning or an afternoon. Pick a single day and choose.',
    },
    {
      id: 'wfa',
      icon: Globe,
      title: 'Work from anywhere',
      body: `${wfa.allowance} days a year, booked like time off. You stay online, core hours are 10:00–15:00 Gulf time.`,
      action: (
        <Link className="btn btn--sm" to="/hr/documents?tab=policies">
          <BookOpen /> Read the policy
        </Link>
      ),
    },
  ];

  return (
    <HrPanel
      className="hr-to-tips"
      hud="Good to know"
      title="Policy & tips"
      icon={<Lightbulb aria-hidden="true" />}
      sub="The rules in plain words. Questions are always welcome."
      actions={
        <>
          <Link className="btn btn--ghost btn--sm" to="/hr/documents?tab=policies">
            <BookOpen /> Flexible &amp; Remote Work policy
          </Link>
          <Link className="btn btn--ghost btn--sm" to="/hr?ask=1">
            <MessageCircleQuestion /> Ask People Ops
          </Link>
        </>
      }
    >
      <ul className="hr-to-tips__grid">
        {tips.map((t) => {
          const Icon = t.icon;
          return (
            <li key={t.id} className={cx('hr-to-tip-card', t.tone && `is-${t.tone}`)}>
              <span className="hr-to-tip-card__icon" aria-hidden="true">
                <Icon />
              </span>
              <div className="hr-to-tip-card__body">
                <b>{t.title}</b>
                <p>{t.body}</p>
                {t.action}
              </div>
            </li>
          );
        })}
      </ul>
    </HrPanel>
  );
}
