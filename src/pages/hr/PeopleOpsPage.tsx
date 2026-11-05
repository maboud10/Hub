/**
 * HR Portal · People Ops console (`hr.people.manage`): live KPIs, who's out
 * today, the onboarding overview with new-hire pulse scores and low-score
 * alerts, policy compliance with nudges, leave balance administration (with
 * separation of duties) and the Ask People Ops cases board.
 */
import { ClipboardCheck, MessagesSquare, Rocket, ScrollText, ShieldHalf, SlidersHorizontal, TreePalm } from 'lucide-react';
import { formatDay, todayISO } from '@/hr/calendar';
import { useHrStats } from '@/hr/selectors';
import { useNow } from '@/hooks/useNow';
import { EmptyState } from '@/components/ui/primitives';
import { KpiStrip } from './ops/KpiStrip';
import { OnboardingOverview, OutToday } from './ops/OpsOnboarding';
import { PolicyCompliance } from './ops/PolicyCompliance';
import { LeaveAdmin } from './ops/LeaveAdmin';
import { CasesBoard } from './ops/CasesBoard';

const JUMPS = [
  { id: 'hr-ops-out', label: 'Out today', icon: TreePalm },
  { id: 'hr-ops-onboarding', label: 'Onboarding', icon: Rocket },
  { id: 'hr-ops-policies', label: 'Policies', icon: ScrollText },
  { id: 'hr-ops-balances', label: 'Balances', icon: SlidersHorizontal },
  { id: 'hr-ops-cases', label: 'Cases', icon: MessagesSquare },
];

export function PeopleOpsPage() {
  const stats = useHrStats();
  const now = useNow(60_000);
  const jump = (id: string) => {
    const reduced = document.documentElement.dataset.motion === 'reduced' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  if (!stats)
    return (
      <div className="card card--flat">
        <EmptyState icon={<ShieldHalf />} title="People Ops only">
          The console needs “Run HR operations”. Your own time off, benefits and documents are all in My HR.
        </EmptyState>
      </div>
    );

  return (
    <div className="hr-ops">
      <header className="hr-ops__head">
        <div className="grow">
          <div className="eyebrow">People Ops console · {formatDay(todayISO(now), { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h2 className="hr-ops__title">Run the people side of Helix</h2>
          <p className="hr-ops__sub">
            <ClipboardCheck aria-hidden="true" className="inline-icon" /> Separation of duties applies everywhere: your own requests always go to another partner.
          </p>
        </div>
        <nav className="hr-ops__jump" aria-label="Jump to section">
          {JUMPS.map((j) => {
            const Icon = j.icon;
            return (
              <button key={j.id} type="button" className="chip" onClick={() => jump(j.id)}>
                <Icon aria-hidden="true" /> {j.label}
              </button>
            );
          })}
        </nav>
      </header>

      <KpiStrip stats={stats} onJump={jump} />

      <div className="hr-ops__row">
        <div id="hr-ops-out" className="hr-ops__anchor">
          <OutToday stats={stats} />
        </div>
        <div id="hr-ops-onboarding" className="hr-ops__anchor">
          <OnboardingOverview />
        </div>
      </div>
      <div id="hr-ops-policies" className="hr-ops__anchor">
        <PolicyCompliance />
      </div>
      <div id="hr-ops-balances" className="hr-ops__anchor">
        <LeaveAdmin />
      </div>
      <div id="hr-ops-cases" className="hr-ops__anchor">
        <CasesBoard />
      </div>
    </div>
  );
}
