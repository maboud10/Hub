/**
 * Helix Meet — View 5: Meeting Pulse & Talk-Time Equity Telemetry
 * Measures async hours saved, talk-time inclusion across global hubs,
 * decision velocity per call, and bilingual EN/AR subtitle adoption.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { CalendarDays, Film, FolderKanban } from 'lucide-react';
import { Bar, Chip, NeoPanel, NovaChip } from '@/components/neo';
import { computeMeetPulseAnalytics } from '@/meet/engine';
import { useMeet } from '@/meet/store';

export function AnalyticsView() {
  const navigate = useNavigate();
  const rooms = useMeet((s) => s.rooms);
  const recordings = useMeet((s) => s.recordings);
  const clips = useMeet((s) => s.clips);

  const pulse = useMemo(
    () => computeMeetPulseAnalytics(rooms, recordings, clips),
    [rooms, recordings, clips],
  );

  return (
    <div className="meet-view">
      <div className="cal-kpi-grid">
        <div className="cal-kpi-card">
          <div className="cal-kpi-card__top">
            <span className="neo-hud">ASYNC HOURS SAVED (30D)</span>
            <Chip tone="emerald" size="sm">
              +{pulse.meetingsDeflectedCount} calls deflected
            </Chip>
          </div>
          <div className="cal-kpi-card__val">{pulse.asyncHoursSavedMonth}h</div>
          <div className="cal-kpi-card__sub">
            Returned to Engineering, Design & Product Maker time
          </div>
        </div>

        <div className="cal-kpi-card">
          <div className="cal-kpi-card__top">
            <span className="neo-hud">TALK-TIME EQUITY SCORE</span>
            <Chip tone="cyan" size="sm">
              Balanced
            </Chip>
          </div>
          <div className="cal-kpi-card__val">{pulse.talkTimeEquityScore}%</div>
          <div className="cal-kpi-card__sub">
            Inclusive participation across remote & HQ hubs
          </div>
        </div>

        <div className="cal-kpi-card">
          <div className="cal-kpi-card__top">
            <span className="neo-hud">DECISION VELOCITY</span>
            <Chip tone="violet" size="sm">
              Nova Scribe
            </Chip>
          </div>
          <div className="cal-kpi-card__val">{pulse.avgDecisionVelocityPerCall}</div>
          <div className="cal-kpi-card__sub">
            Verified decisions captured & indexed per session
          </div>
        </div>

        <div className="cal-kpi-card">
          <div className="cal-kpi-card__top">
            <span className="neo-hud">BILINGUAL EN ↔ AR ADOPTION</span>
            <Chip tone="amber" size="sm">
              MENA Ready
            </Chip>
          </div>
          <div className="cal-kpi-card__val">{pulse.bilingualSessionsPct}%</div>
          <div className="cal-kpi-card__sub">
            Sessions running simultaneous Arabic/English subtitles
          </div>
        </div>
      </div>

      <div className="meet-stage-split">
        <NeoPanel
          hud="TALK-TIME INCLUSION & HUB PARTICIPATION"
          title="Cross-Hub Participation Balance"
        >
          <div className="cal-alloc-list">
            {[
              { label: 'Dubai HQ (GST) · Security & Platform', pct: 36 },
              { label: 'London Hub (GMT) · Growth, Product & FinOps', pct: 28 },
              { label: 'Singapore Lab (SGT) · Product Design & UX Research', pct: 22 },
              { label: 'Remote & Distributed (Berlin, Bengaluru, Accra)', pct: 14 },
            ].map((row) => (
              <div key={row.label} className="cal-alloc-row">
                <div className="cal-alloc-row__head">
                  <strong>{row.label}</strong>
                  <span className="neo-mono">{row.pct}% share</span>
                </div>
                <Bar value={row.pct / 100} label={row.label} />
              </div>
            ))}
          </div>
        </NeoPanel>

        <NeoPanel
          hud="CROSS-APP EXECUTION LOOP"
          title="Where HoloMeet Outcomes Land"
        >
          <div className="cal-audit-cards">
            <div className="cal-audit-card">
              <div className="cal-audit-card__top">
                <NovaChip>Helix Projects Bridge</NovaChip>
                <Chip tone="emerald" size="sm">
                  {pulse.actionItemCompletionPct}% On-Time
                </Chip>
              </div>
              <h3 className="cal-audit-card__title">Zero Dropped Action Items</h3>
              <p>
                Every action item captured by Nova Scribe links directly to a Helix Projects sprint
                task with owner and due date.
              </p>
              <div className="cal-audit-card__actions">
                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--sm"
                  onClick={() => navigate('/projects')}
                >
                  <FolderKanban />
                  <span>Open Helix Projects</span>
                </button>
                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--sm"
                  onClick={() => navigate('/calendar')}
                >
                  <CalendarDays />
                  <span>Open Chronos Calendar</span>
                </button>
                <button
                  type="button"
                  className="neo-btn neo-btn--plasma neo-btn--sm"
                  onClick={() => navigate('/meet/clips')}
                >
                  <Film />
                  <span>Record Async Clip</span>
                </button>
              </div>
            </div>
          </div>
        </NeoPanel>
      </div>
    </div>
  );
}
