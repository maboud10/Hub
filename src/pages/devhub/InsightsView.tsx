/**
 * DevHub ("Forge") — InsightsView (/devhub/insights)
 * DORA Four Keys, end-to-end Cycle Time breakdown, Review Load Equity
 * heatmap, DevEx pulse survey, and Performance & OKRs evidence hand-off.
 */
import { Link } from 'react-router';
import {
  Activity,
  Award,
  BarChart3,
  Clock,
  HeartHandshake,
  MessagesSquare,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Bar,
  Chip,
  NeoKpi,
  NeoKpis,
  NeoPanel,
  NeoTracker,
  Spark,
} from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { useSessionUser } from '@/store/selectors';
import {
  cycleBreakdown,
  deploySeries,
  doraMetrics,
  reviewLoad,
} from '@/devhub/engine';
import { useDevHub } from '@/devhub/store';
import {
  UserPill,
  logPerformanceEvidenceFromDevhub,
  shareToPulseChat,
  useDevHubLive,
} from './parts';

const REVIEWER_IDS = ['u-priya', 'u-lucas', 'u-omar', 'u-ethan', 'u-kwame'];

export function InsightsView() {
  const me = useSessionUser();
  const userId = me?.id ?? 'u-priya';
  const now = useNow(30_000);
  const live = useDevHubLive();

  const deploys = useDevHub((s) => s.deploys);
  const merged = useDevHub((s) => s.merged);
  const prs = useDevHub((s) => s.prs);
  const devex = useDevHub((s) => s.devex);
  const devexVotes = useDevHub((s) => s.devexVotes);
  const voteDevEx = useDevHub((s) => s.voteDevEx);

  const dora = doraMetrics({ deploys, merged, now, openIncidents: live.incidents });
  const depSpark = deploySeries(deploys, now, 14);
  const cycle = cycleBreakdown(merged, now, 4);
  const equity = reviewLoad(merged, prs, REVIEWER_IDS, now, 14);

  return (
    <div className="dh-stack">
      <NeoKpis label="DORA four keys">
        <NeoKpi
          label="Deployment frequency"
          value={`${dora.deployFreq.perDay}/day`}
          sub={`${dora.deployFreq.total} prod deploys · ${dora.deployFreq.level.toUpperCase()}`}
          icon={<TrendingUp />}
          tone="success"
          spark={<Spark data={depSpark.deploys} />}
        />
        <NeoKpi
          label="Lead time for changes"
          value={`${dora.leadTime.hours}h`}
          sub={`Median commit → prod · ${dora.leadTime.level.toUpperCase()}`}
          icon={<Clock />}
          tone="app"
        />
        <NeoKpi
          label="Change failure rate"
          value={`${Math.round(dora.cfr.rate * 100)}%`}
          sub={`${dora.cfr.failed}/${dora.cfr.total} failed · ${dora.cfr.level.toUpperCase()}`}
          icon={<RotateCcw />}
          tone={dora.cfr.rate > 0.1 ? 'warning' : 'success'}
          spark={<Spark data={depSpark.failures} color="var(--warning)" />}
        />
        <NeoKpi
          label="Time to restore (MTTR)"
          value={dora.mttr.openMinutes ? `${dora.mttr.openMinutes}m live` : `${dora.mttr.minutes}m`}
          sub={dora.mttr.openMinutes ? 'INC-2047 active in eu-west-2' : `Median recovery · ${dora.mttr.level.toUpperCase()}`}
          icon={<Activity />}
          tone={dora.mttr.openMinutes ? 'warning' : 'success'}
        />
      </NeoKpis>

      {/* End-to-End Cycle Time Breakdown */}
      <NeoPanel
        hud="Lead Time Anatomy · 28-Day Rolling Median"
        title={`Cycle Time Breakdown · ${cycle.total}h Total`}
        icon={<BarChart3 />}
        actions={
          <div className="dh-inline-actions">
            <button
              type="button"
              className="neo-btn neo-btn--soft neo-btn--xs"
              onClick={() =>
                void logPerformanceEvidenceFromDevhub({
                  userId,
                  title: `DORA ${dora.overall.toUpperCase()} velocity (${dora.deployFreq.perDay}/day, lead time ${dora.leadTime.hours}h)`,
                  detail: `Cycle time ${cycle.total}h across ${dora.deployFreq.total} production releases.`,
                  to: '/devhub/insights',
                  label: 'Forge DORA Insights',
                })
              }
            >
              <Award />
              <span>Pin DORA Evidence to Performance</span>
            </button>
            <button
              type="button"
              className="neo-btn neo-btn--ghost neo-btn--xs"
              onClick={() =>
                void shareToPulseChat({
                  title: `DORA Report · ${dora.overall.toUpperCase()}`,
                  subtitle: `Freq ${dora.deployFreq.perDay}/d · Lead ${dora.leadTime.hours}h · CFR ${Math.round(dora.cfr.rate * 100)}%`,
                  to: '/devhub/insights',
                  status: dora.overall.toUpperCase(),
                  text: `Weekly DORA snapshot: ${dora.deployFreq.perDay}/day deploy frequency, ${cycle.total}h median cycle time.`,
                })
              }
            >
              <MessagesSquare />
              <span>Share to Chat</span>
            </button>
          </div>
        }
      >
        <NeoTracker
          bare
          hud="4-Stage Delivery Cycle"
          steps={[
            { id: 'coding', label: 'Coding', sub: 'First commit → PR open', at: `${cycle.coding}h` },
            { id: 'pickup', label: 'Review Pickup', sub: 'PR open → First review', at: `${cycle.pickup}h` },
            { id: 'review', label: 'Code Review', sub: 'First review → Merge', at: `${cycle.review}h` },
            { id: 'deploy', label: 'Prod Rollout', sub: 'Merge → Production', at: `${cycle.deploy}h` },
          ]}
          current={4}
          state="done"
          eta={`Median total ${cycle.total}h`}
        />

        <div className="dh-cycle-bars">
          {[
            { label: 'Coding', hours: cycle.coding, color: 'var(--app-c1)' },
            { label: 'Review Pickup', hours: cycle.pickup, color: '#38bdf8' },
            { label: 'Code Review', hours: cycle.review, color: '#a78bfa' },
            { label: 'Prod Rollout', hours: cycle.deploy, color: 'var(--success)' },
          ].map((ph) => (
            <div key={ph.label} className="dh-cycle-bar-item">
              <div className="dh-cycle-bar-item__head">
                <span>{ph.label}</span>
                <span className="neo-mono">{`${ph.hours}h`}</span>
              </div>
              <Bar value={ph.hours / Math.max(1, cycle.total)} fill={ph.color} />
            </div>
          ))}
        </div>
      </NeoPanel>

      <div className="dh-grid-2">
        {/* Review Load Equity */}
        <NeoPanel
          hud={`Fair Share Target · ${Math.round(equity.fairShare * 100)}% per Reviewer`}
          title="Review Load Equity & Stewardship"
          icon={<Users />}
        >
          <div className="dh-list">
            {equity.rows.map((row) => (
              <div key={row.userId} className="dh-equity-row">
                <div className="dh-equity-row__top">
                  <UserPill userId={row.userId} size={22} />
                  <div className="dh-inline-actions">
                    {row.overloaded && (
                      <Chip tone="warning" size="sm">
                        <span>Overloaded</span>
                      </Chip>
                    )}
                    <span className="neo-mono">{`${Math.round(row.share * 100)}% share`}</span>
                    <span className="neo-mono">{`(${row.pending} pending)`}</span>
                  </div>
                </div>
                <Bar
                  value={Math.min(1, row.share * 2)}
                  fill={row.overloaded ? 'var(--warning)' : 'var(--app-c1)'}
                />
                <div className="dh-equity-row__bottom">
                  <div className="dh-heat-strip" dir="ltr" title="14-day review activity">
                    {row.days.map((count, i) => (
                      <i
                        key={i}
                        className="dh-heat-cell"
                        data-level={count === 0 ? 0 : count === 1 ? 1 : 2}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    className="neo-btn neo-btn--ghost neo-btn--xs"
                    onClick={() =>
                      void logPerformanceEvidenceFromDevhub({
                        userId: row.userId,
                        title: `Completed ${row.total} code reviews (${Math.round(row.share * 100)}% of team load)`,
                        detail: 'Recognized for tier-1 code review stewardship in DevHub Forge.',
                        to: '/devhub/insights',
                        label: 'Review Stewardship',
                      })
                    }
                  >
                    <Award />
                    <span>Log Kudos in Performance</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </NeoPanel>

        {/* DevEx Pulse & Sustainable Pace */}
        <NeoPanel
          hud="Developer Experience & Sustainable Pace"
          title="DevEx Pulse Survey"
          icon={<Sparkles />}
          actions={
            <Link to="/wellbeing" className="neo-btn neo-btn--soft neo-btn--xs">
              <HeartHandshake />
              <span>Aura Wellbeing</span>
            </Link>
          }
        >
          <div className="dh-list">
            {devex.map((item) => {
              const myVote = devexVotes[userId]?.[item.id];
              return (
                <div key={item.id} className="dh-devex-row">
                  <div className="dh-devex-row__top">
                    <span className="dh-devex-row__q">{item.question}</span>
                    <Chip tone={item.score >= 85 ? 'success' : 'app'} size="sm">
                      <span className="neo-mono">{`${item.score}/100 (+${item.trend})`}</span>
                    </Chip>
                  </div>
                  <Bar value={item.score / 100} />
                  <div className="dh-devex-row__votes" role="group" aria-label={item.question}>
                    <span className="neo-hud">Your pulse:</span>
                    {[60, 80, 95].map((val) => (
                      <button
                        key={val}
                        type="button"
                        className="neo-chip neo-chip--sm"
                        data-tone={myVote === val ? 'app' : 'slate'}
                        onClick={() => voteDevEx(userId, item.id, val)}
                      >
                        <span className="neo-mono">{val === 60 ? 'Needs work (60)' : val === 80 ? 'Good (80)' : 'Flow state (95)'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </NeoPanel>
      </div>
    </div>
  );
}
