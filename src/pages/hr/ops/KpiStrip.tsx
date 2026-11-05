/**
 * People Ops console · KPI strip from `useHrStats()`: headcount, out today,
 * approvals, benefits enrolment, policy compliance, claims YTD, open cases,
 * new-hire pulse, leave liability and new hires. Actionable tiles link to the
 * approvals inbox or jump to the matching console section.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router';
import { ClipboardCheck, HeartPulse, Hourglass, MessagesSquare, Receipt, Rocket, ShieldCheck, Smile, TreePalm, Users, type LucideIcon } from 'lucide-react';
import type { HrStats } from '@/hr/selectors';
import { cx } from '@/lib/cx';
import { formatMoney } from '@/pages/talent/components/format';
import { scoreEmoji } from '../home/Pulse';

type KpiTone = 'ok' | 'warn' | 'bad';

interface Kpi {
  id: string;
  label: string;
  value: ReactNode;
  sub: ReactNode;
  icon: LucideIcon;
  hue: number;
  tone?: KpiTone;
  /** 0–1 meter under the value. */
  meter?: number;
  to?: string;
  jump?: string;
}

export function KpiStrip({ stats, onJump }: { stats: HrStats; onJump: (id: string) => void }) {
  const compliance = stats.policyCompliance.total ? Math.round((stats.policyCompliance.compliant / stats.policyCompliance.total) * 100) : 100;
  const enrolled = stats.enrolment.total ? stats.enrolment.confirmed / stats.enrolment.total : 1;
  const kpis: Kpi[] = [
    { id: 'headcount', label: 'Headcount', value: stats.headcount, sub: 'employees, excluding contractors', icon: Users, hue: 262 },
    { id: 'out', label: 'Out today', value: stats.outToday.length, sub: stats.outToday.length ? 'see who’s away' : 'everyone’s in', icon: TreePalm, hue: 160, jump: 'hr-ops-out' },
    {
      id: 'approvals',
      label: 'Approvals pending',
      value: stats.pendingApprovals,
      sub: stats.pendingApprovals ? 'waiting on you' : 'inbox zero',
      icon: ClipboardCheck,
      hue: 280,
      tone: stats.pendingApprovals ? 'warn' : 'ok',
      to: '/hr/approvals',
    },
    {
      id: 'enrolment',
      label: 'Benefits enrolment',
      value: (
        <>
          {stats.enrolment.confirmed}
          <small>/{stats.enrolment.total}</small>
        </>
      ),
      sub: stats.enrolment.overdue ? `${stats.enrolment.overdue} overdue` : 'none overdue',
      icon: HeartPulse,
      hue: 330,
      tone: stats.enrolment.overdue ? 'bad' : undefined,
      meter: enrolled,
    },
    {
      id: 'compliance',
      label: 'Policy compliance',
      value: (
        <>
          {compliance}
          <small>%</small>
        </>
      ),
      sub: `${stats.policyCompliance.compliant}/${stats.policyCompliance.total} fully up to date`,
      icon: ShieldCheck,
      hue: 199,
      tone: compliance < 60 ? 'bad' : compliance < 90 ? 'warn' : 'ok',
      meter: compliance / 100,
      jump: 'hr-ops-policies',
    },
    { id: 'claims', label: 'Claims YTD', value: formatMoney(stats.claimsYtd, 'AED', { compact: true }), sub: 'approved & paid allowances', icon: Receipt, hue: 45 },
    {
      id: 'cases',
      label: 'Open cases',
      value: stats.openCases,
      sub: stats.openCases ? 'Ask People Ops' : 'all answered',
      icon: MessagesSquare,
      hue: 300,
      tone: stats.openCases ? 'warn' : 'ok',
      jump: 'hr-ops-cases',
    },
    {
      id: 'pulse',
      label: 'New-hire pulse',
      value:
        stats.avgPulse !== null ? (
          <>
            {stats.avgPulse}
            <small>/5</small>
          </>
        ) : (
          '—'
        ),
      sub:
        stats.avgPulse !== null ? (
          <>
            <span aria-hidden="true">{scoreEmoji(stats.avgPulse)}</span> average, last 120 days
          </>
        ) : (
          'no check-ins yet'
        ),
      icon: Smile,
      hue: 42,
      tone: stats.avgPulse !== null && stats.avgPulse <= 2.5 ? 'bad' : undefined,
      jump: 'hr-ops-onboarding',
    },
    {
      id: 'liability',
      label: 'Leave liability',
      value: (
        <>
          {stats.leaveLiability}
          <small> days</small>
        </>
      ),
      sub: 'unused annual leave',
      icon: Hourglass,
      hue: 220,
      jump: 'hr-ops-balances',
    },
    { id: 'newhires', label: 'New hires', value: stats.newHires, sub: 'in their first 100 days', icon: Rocket, hue: 290, jump: 'hr-ops-onboarding' },
  ];

  return (
    <section className="hr-ops-kpis" aria-label="Key people numbers">
      {kpis.map((k) => {
        const Icon = k.icon;
        const body = (
          <>
            <span className="hr-ops-kpi__top">
              <span className="hr-ops-kpi__icon" aria-hidden="true">
                <Icon />
              </span>
              <span className="hr-ops-kpi__label">{k.label}</span>
            </span>
            <span className="hr-ops-kpi__value">{k.value}</span>
            {k.meter !== undefined && (
              <span className="hr-ops-kpi__meter" aria-hidden="true">
                <i style={{ width: `${Math.round(Math.max(0, Math.min(1, k.meter)) * 100)}%` }} />
              </span>
            )}
            <span className="hr-ops-kpi__sub">{k.sub}</span>
          </>
        );
        const cls = cx('hr-ops-kpi', k.tone && `is-${k.tone}`, (k.to || k.jump) && 'is-link');
        const style = { '--k-h': k.hue } as CSSProperties;
        if (k.to)
          return (
            <Link key={k.id} to={k.to} className={cls} style={style}>
              {body}
            </Link>
          );
        if (k.jump)
          return (
            <button key={k.id} type="button" className={cls} style={style} onClick={() => onJump(k.jump!)}>
              {body}
            </button>
          );
        return (
          <div key={k.id} className={cls} style={style}>
            {body}
          </div>
        );
      })}
    </section>
  );
}
