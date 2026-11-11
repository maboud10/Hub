/**
 * Helix Calendar — View 5: Chronos Time & Focus Telemetry
 * Maker vs. Manager ratio, weekly synchronous meeting cost calculator,
 * and 1-click conversion of low-signal status calls into Async HoloMeet Clips.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Film, Flame, Hourglass, ShieldCheck, Sparkles, Wand2 } from 'lucide-react';
import { Bar, Chip, NeoPanel, NovaChip } from '@/components/neo';
import { computeChronosAnalytics } from '@/calendar/engine';
import { useCalendar } from '@/calendar/store';

export function AnalyticsView() {
  const navigate = useNavigate();
  const events = useCalendar((s) => s.events);
  const defragSchedule = useCalendar((s) => s.defragSchedule);
  const convertLowSignalToAsyncClip = useCalendar((s) => s.convertLowSignalToAsyncClip);

  const stats = useMemo(() => computeChronosAnalytics(events), [events]);

  return (
    <div className="cal-view">
      <div className="cal-kpi-grid">
        <div className="cal-kpi-card">
          <div className="cal-kpi-card__top">
            <span className="neo-hud">MAKER TIME (WEEKLY)</span>
            <Chip tone="violet" size="sm">
              Deep Work
            </Chip>
          </div>
          <div className="cal-kpi-card__val">{stats.makerHoursWeek}h</div>
          <div className="cal-kpi-card__sub">
            Uninterrupted blocks ≥ 90m protected by Chronos
          </div>
        </div>

        <div className="cal-kpi-card">
          <div className="cal-kpi-card__top">
            <span className="neo-hud">MANAGER / SYNC TIME</span>
            <Chip tone="cyan" size="sm">
              High-Signal
            </Chip>
          </div>
          <div className="cal-kpi-card__val">{stats.managerHoursWeek}h</div>
          <div className="cal-kpi-card__sub">
            Customer deals, 1:1 coaching & architecture reviews
          </div>
        </div>

        <div className="cal-kpi-card">
          <div className="cal-kpi-card__top">
            <span className="neo-hud">DEEP WORK SHIELD INDEX</span>
            <Chip tone="emerald" size="sm">
              +18% vs Q3
            </Chip>
          </div>
          <div className="cal-kpi-card__val">{stats.deepWorkShieldPct}%</div>
          <div className="cal-kpi-card__sub">
            Focus blocks defended from ad-hoc calendar invites
          </div>
        </div>

        <div className="cal-kpi-card">
          <div className="cal-kpi-card__top">
            <span className="neo-hud">WEEKLY MEETING COST</span>
            <Chip tone="amber" size="sm">
              FinOps Audited
            </Chip>
          </div>
          <div className="cal-kpi-card__val">
            ${stats.weeklyMeetingBurnUsd.toLocaleString()}
          </div>
          <div className="cal-kpi-card__sub">
            {stats.reclaimableHoursWeek}h/wk reclaimable via Async Clips
          </div>
        </div>
      </div>

      <div className="cal-main-split">
        <NeoPanel
          hud="WEEKLY TIME ALLOCATION · CROSS-APP WORKLOAD BREAKDOWN"
          title="Maker vs. Manager Time Distribution"
        >
          <div className="cal-alloc-list">
            {stats.categoryBreakdown.map((item) => (
              <div key={item.category} className="cal-alloc-row">
                <div className="cal-alloc-row__head">
                  <span className="cal-alloc-dot" style={{ background: item.color }} />
                  <strong>{item.label}</strong>
                  <span className="neo-mono">
                    {item.hours}h · {item.pct}%
                  </span>
                </div>
                <Bar value={item.pct / 100} label={item.label} />
              </div>
            ))}
          </div>
        </NeoPanel>

        <NeoPanel
          hud="NOVA CHRONOS TIME AUDIT · AUTONOMOUS RECLAMATION PLAYS"
          title="Reclaim 4.5 Hours of Deep Work This Week"
        >
          <div className="cal-audit-cards">
            <div className="cal-audit-card">
              <div className="cal-audit-card__top">
                <NovaChip>Play 01 · Async Deflection</NovaChip>
                <Chip tone="emerald" size="sm">
                  +60m Maker Time
                </Chip>
              </div>
              <h3 className="cal-audit-card__title">Convert Status Syncs into 3-Min HoloMeet Async Clips</h3>
              <p>
                Nova identified 2 recurring status check-ins where 80% of time is one-way readout.
                Replace with an async video clip and reclaim 60m today.
              </p>
              <div className="cal-audit-card__actions">
                <button
                  type="button"
                  className="neo-btn neo-btn--plasma neo-btn--sm"
                  onClick={() => convertLowSignalToAsyncClip()}
                  data-qa="cal-convert-async"
                >
                  <Sparkles />
                  <span>Reclaim 60m Now</span>
                </button>
                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--sm"
                  onClick={() => navigate('/meet/clips')}
                >
                  <Film />
                  <span>Open Clips Studio</span>
                </button>
              </div>
            </div>

            <div className="cal-audit-card">
              <div className="cal-audit-card__top">
                <NovaChip>Play 02 · Gap Consolidation</NovaChip>
                <Chip tone="violet" size="sm">
                  +75m Deep Work
                </Chip>
              </div>
              <h3 className="cal-audit-card__title">Compact Fragmented 30m Gaps into a 90m Focus Runway</h3>
              <p>
                Eliminates context-switching tax between morning stand-up and customer calls,
                syncing directly with Helix Projects Focus Runway.
              </p>
              <div className="cal-audit-card__actions">
                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--sm"
                  onClick={() => defragSchedule(0)}
                >
                  <Wand2 />
                  <span>Run Schedule Defrag</span>
                </button>
                <button
                  type="button"
                  className="neo-btn neo-btn--ghost neo-btn--sm"
                  onClick={() => navigate('/projects')}
                >
                  <Hourglass />
                  <span>View Projects Runway</span>
                </button>
              </div>
            </div>

            <div className="cal-audit-card">
              <div className="cal-audit-card__top">
                <NovaChip>Play 03 · No-Meeting Friday</NovaChip>
                <Chip tone="cyan" size="sm">
                  Org-Wide Policy
                </Chip>
              </div>
              <h3 className="cal-audit-card__title">Enforce Zero-Sync Maker Fridays Across Engineering & Design</h3>
              <p>
                Automatically routes external Friday requests to Monday Golden Windows via Smart
                Booking Links.
              </p>
              <div className="cal-audit-card__actions">
                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--sm"
                  onClick={() => navigate('/calendar/links')}
                >
                  <ShieldCheck />
                  <span>Configure Smart Routers</span>
                </button>
                <button
                  type="button"
                  className="neo-btn neo-btn--ghost neo-btn--sm"
                  onClick={() => navigate('/crm')}
                >
                  <Flame />
                  <span>Customer Exceptions</span>
                </button>
              </div>
            </div>
          </div>
        </NeoPanel>
      </div>
    </div>
  );
}
