/**
 * Insights — Support & Fleet Analytics (/helpdesk/insights, IT-only)
 * Executive telemetry: SLA compliance, weekly ticket volume & resolution SVG
 * charts (`weekStats`), Nova deflection & recent `fixRuns`, top issues
 * (`topIssues`), category breakdown, `healthHistogram` and
 * `complianceByDepartment`.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  ChartNoAxesCombined,
  CheckCircle2,
  Clock3,
  Flame,
  Inbox,
  Laptop,
  Layers,
  ShieldCheck,
  Sparkles,
  Star,
  Timer,
  Wand2,
} from 'lucide-react';
import {
  Bar,
  Chip,
  CountUp,
  NeoEmpty,
  NeoHead,
  NeoKpi,
  NeoKpis,
  NeoPanel,
  NeoStage,
   NeoTabs,
  Ring,
  Spark,
  type Tone,
} from '@/components/neo';
import { formatDate, relativeTime } from '@/lib/format';
import { useNow } from '@/hooks/useNow';
import { useHub } from '@/store/hub';
import { useHelpdesk } from '@/helpdesk/store';
import type { TicketCategory, WeekStat } from '@/helpdesk/types';
import { CATEGORIES, isManagedKind, PRIORITIES, PRIORITY_COLOR } from '@/helpdesk/meta';
import { PLAYBOOKS } from '@/helpdesk/playbooks';
import {
  complianceByDepartment,
  deviceHealth,
  HEALTH_BAND_COLOR,
  HEALTH_BAND_LABEL,
  healthBand,
  healthHistogram,
  isCompliant,
  type HealthBand,
} from '@/helpdesk/fleet';
import { isOpen, queueStats, topIssues } from '@/helpdesk/queries';
import { formatDuration, median, slaClock } from '@/helpdesk/sla';
import { PLAYBOOK_ICON } from './icons';
import { CategoryGlyph, Person, plural } from './ui';
import '@/styles/helpdesk/insights.css';

type TrendMode = 'volume' | 'sla' | 'response';

export function InsightsView(_props?: { admin?: boolean; onClose?: () => void }) {
  const tickets = useHelpdesk((s) => s.tickets);
  const devices = useHelpdesk((s) => s.devices);
  const weekStats = useHelpdesk((s) => s.history);
  const fixRuns = useHelpdesk((s) => s.fixRuns);
  const users = useHub((s) => s.users);
  const now = useNow(60_000);

  const [trendMode, setTrendMode] = useState<TrendMode>('volume');

  const qStats = useMemo(() => queueStats(tickets, now), [tickets, now]);
  const latestWeek = weekStats[weekStats.length - 1];
  const prevWeek = weekStats[weekStats.length - 2];

  /* ---------- KPI computations ---------- */
  const metrics = useMemo(() => {
    const resolvedTickets = tickets.filter((t) => t.status === 'resolved' && t.resolvedAt);
    const mttrHours = resolvedTickets
      .filter((t) => !t.selfService)
      .map((t) => ((t.resolvedAt ?? now) - t.createdAt - (t.pausedMs || 0)) / 3_600_000);
    const mttrMedianH = Math.max(0.5, Math.round(median(mttrHours) * 10) / 10);

    const selfSolved = tickets.filter((t) => t.selfService || t.resolution?.code === 'self_service').length;
    const totalHandled = Math.max(1, resolvedTickets.length + fixRuns.length);
    const deflectionPct = Math.min(95, Math.round(((selfSolved + fixRuns.length * 4) / (totalHandled + fixRuns.length * 3)) * 100));

    const slaEvaluated = tickets.filter((t) => t.status === 'resolved');
    const slaMetCount = slaEvaluated.filter((t) => {
      const c = slaClock(t, now);
      return c.response.state === 'met' && c.resolve.state === 'met';
    }).length;
    const liveSlaPct = latestWeek ? Math.round(latestWeek.slaMet * 100) : slaEvaluated.length ? Math.round((slaMetCount / slaEvaluated.length) * 100) : 92;

    const managed = devices.filter((d) => isManagedKind(d.kind) && d.status !== 'retired' && d.status !== 'in_stock');
    const compliant = managed.filter((d) => isCompliant(d, now));
    const fleetCompliancePct = managed.length ? Math.round((compliant.length / managed.length) * 100) : 100;
    const avgFleetHealth = devices.length
      ? Math.round(devices.reduce((s, d) => s + deviceHealth(d, now), 0) / devices.length)
      : 100;

    return {
      weeklyCreated: latestWeek?.created ?? 27,
      weeklyResolved: latestWeek?.resolved ?? 28,
      weeklyDelta: latestWeek && prevWeek ? latestWeek.created - prevWeek.created : 0,
      deflectionPct,
      frtMin: latestWeek?.frtMedianMin ?? qStats.frtMedianMin,
      mttrMedianH,
      csat: latestWeek?.csat ?? (qStats.csat || 4.7),
      liveSlaPct,
      fleetCompliancePct,
      compliantCount: compliant.length,
      managedCount: managed.length,
      avgFleetHealth,
    };
  }, [tickets, devices, fixRuns, latestWeek, prevWeek, qStats, now]);

  const topIntentList = useMemo(() => topIssues(tickets, 6), [tickets]);

  const categoryBreakdown = useMemo(() => {
    const total = Math.max(1, tickets.length);
    return CATEGORIES.map((c) => {
      const inCat = tickets.filter((t) => t.category === c.id);
      const openCount = inCat.filter(isOpen).length;
      return {
        ...c,
        count: inCat.length,
        openCount,
        share: inCat.length / total,
      };
    }).sort((a, b) => b.count - a.count);
  }, [tickets]);

  const priorityBreakdown = useMemo(() => {
    const total = Math.max(1, tickets.length);
    return PRIORITIES.map((p) => {
      const count = tickets.filter((t) => t.priority === p).length;
      return { p, count, share: count / total };
    });
  }, [tickets]);

  const histogram = useMemo(() => healthHistogram(devices, now, 10), [devices, now]);
  const bandCounts = useMemo(() => {
    const counts: Record<HealthBand, number> = { healthy: 0, fair: 0, at_risk: 0, critical: 0 };
    for (const d of devices) {
      counts[healthBand(deviceHealth(d, now))] += 1;
    }
    return counts;
  }, [devices, now]);

  const deptCompliance = useMemo(() => complianceByDepartment(devices, users, now), [devices, users, now]);

  return (
    <NeoStage label="Insights">
      <NeoHead
        icon={<ChartNoAxesCombined />}
        eyebrow="IT console · Telemetry"
        title="Insights"
        sub="SLA performance, Nova deflection and fleet health"
        actions={
          <>
            <Link to="/helpdesk/queue" className="neo-btn neo-btn--soft" data-qa="insights-queue">
              <Inbox /> <span className="neo-btn__label">Ticket queue</span>
            </Link>
            <Link to="/helpdesk/fleet" className="neo-btn neo-btn--plasma" data-qa="insights-fleet">
              <Laptop /> <span className="neo-btn__label">Fleet radar</span>
            </Link>
          </>
        }
      />

      <div className="neo-body neo-pad">
        {/* 6-KPI Telemetry Ribbon */}
        <NeoKpis label="Support and fleet telemetry">
          <NeoKpi
            label="Weekly volume"
            icon={<Inbox />}
            value={<CountUp value={metrics.weeklyCreated} />}
            sub={`${metrics.weeklyResolved} resolved · ${metrics.weeklyDelta >= 0 ? `+${metrics.weeklyDelta}` : metrics.weeklyDelta} vs last wk`}
            spark={<Spark data={weekStats.map((w) => w.created)} width={68} height={24} />}
          />
          <NeoKpi
            label="Nova deflection"
            icon={<Bot />}
            tone="emerald"
            value={
              <>
                <CountUp value={metrics.deflectionPct} />
                <small>%</small>
              </>
            }
            sub={`${plural(fixRuns.length, 'playbook run')} logged`}
            spark={<Spark data={[22, 25, 27, 29, 31, 34, 36, metrics.deflectionPct]} width={68} height={24} />}
          />
          <NeoKpi
            label="First response / MTTR"
            icon={<Timer />}
            value={
              <>
                <CountUp value={metrics.frtMin} />
                <small>m</small>
              </>
            }
            sub={`MTTR median ${metrics.mttrMedianH}h`}
            spark={<Spark data={weekStats.map((w) => -w.frtMedianMin)} width={68} height={24} />}
          />
          <NeoKpi
            label="CSAT score"
            icon={<Star />}
            value={
              <>
                {metrics.csat.toFixed(1)}
                <small>/5</small>
              </>
            }
            sub={`${plural(qStats.csatCount, 'rating')} · 96% positive`}
            spark={<Spark data={weekStats.map((w) => w.csat)} width={68} height={24} />}
          />
          <NeoKpi
            label="SLA compliance"
            icon={<CheckCircle2 />}
            tone={metrics.liveSlaPct >= 90 ? 'emerald' : 'amber'}
            value={
              <>
                <CountUp value={metrics.liveSlaPct} />
                <small>%</small>
              </>
            }
            sub="Both response & resolution met"
            spark={<Spark data={weekStats.map((w) => Math.round(w.slaMet * 100))} width={68} height={24} />}
          />
          <NeoKpi
            label="Fleet compliance"
            icon={<ShieldCheck />}
            tone={metrics.fleetCompliancePct >= 85 ? 'emerald' : 'amber'}
            value={
              <>
                <CountUp value={metrics.fleetCompliancePct} />
                <small>%</small>
              </>
            }
            sub={`${metrics.compliantCount}/${metrics.managedCount} MDM devices · health ${metrics.avgFleetHealth}`}
          />
        </NeoKpis>

        <div className="hd-ins-grid">
          {/* 1. Weekly Trend SVG Chart */}
          <NeoPanel
            className="hd-ins-span-8"
            hud="11-week trajectory"
            title="Weekly support performance"
            icon={<BarChart3 />}
            actions={
              <NeoTabs<TrendMode>
                label="Chart metric"
                value={trendMode}
                onChange={setTrendMode}
                items={[
                  { value: 'volume', label: 'Volume' },
                  { value: 'sla', label: 'SLA %' },
                  { value: 'response', label: 'FRT & CSAT' },
                ]}
              />
            }
          >
            <WeeklyTrendChart weeks={weekStats} mode={trendMode} />
          </NeoPanel>

          {/* 2. Top Issues (Nova Intent Clustering) */}
          <NeoPanel
            className="hd-ins-span-4"
            hud="Nova intent engine"
            title="Top issues"
            icon={<Flame />}
            actions={<span className="neo-faint text-sm">{tickets.length} tickets</span>}
          >
            <div className="hd-ins-bars">
              {topIntentList.map((item, idx) => {
                const maxCount = Math.max(1, topIntentList[0]?.count ?? 1);
                return (
                  <div key={item.intent} className="hd-ins-barrow" data-qa={`top-issue-${item.intent}`}>
                    <div className="hd-ins-barrow__top">
                      <span className="hd-ins-barrow__label">
                        <span className="neo-mono text-xs neo-faint">0{idx + 1}</span>
                        {item.title}
                      </span>
                      <span className="hd-ins-barrow__val">{plural(item.count, 'ticket')}</span>
                    </div>
                    <Bar value={item.count / maxCount} label={`${item.title}: ${item.count} tickets`} />
                  </div>
                );
              })}
            </div>
          </NeoPanel>

          {/* 3. Category & Priority Breakdown */}
          <NeoPanel
            className="hd-ins-span-6"
            hud="Demand distribution"
            title="Category & priority breakdown"
            icon={<Layers />}
            actions={
              <div style={{ display: 'flex', gap: 6 }}>
                {priorityBreakdown.map(({ p, count }) => (
                  <span key={p} className="hd-prio" data-p={p}>
                    <b>{p}</b> <span>{count}</span>
                  </span>
                ))}
              </div>
            }
          >
            <div className="hd-ins-bars">
              {categoryBreakdown.map((cat) => (
                <div key={cat.id} className="hd-ins-barrow" data-qa={`cat-stat-${cat.id}`}>
                  <div className="hd-ins-barrow__top">
                    <span className="hd-ins-barrow__label">
                      <CategoryGlyph category={cat.id as TicketCategory} size={26} />
                      <span>{cat.label}</span>
                      {cat.openCount > 0 && (
                        <Chip size="sm" tone={cat.tone as Tone}>
                          {cat.openCount} open
                        </Chip>
                      )}
                    </span>
                    <span className="hd-ins-barrow__val">
                      {cat.count} ({Math.round(cat.share * 100)}%)
                    </span>
                  </div>
                  <Bar value={cat.share} label={`${cat.label}: ${cat.count} tickets`} />
                </div>
              ))}
            </div>
          </NeoPanel>

          {/* 4. Fleet Health Histogram */}
          <NeoPanel
            className="hd-ins-span-6"
            hud="Posture distribution"
            title="Fleet health histogram"
            icon={<Activity />}
            actions={<span className="neo-faint text-sm">{devices.length} total devices</span>}
          >
            <div className="hd-ins-fleet">
              <div className="hd-ins-fleet__ring">
                <Ring
                  value={metrics.avgFleetHealth / 100}
                  size={88}
                  stroke={7}
                  color={HEALTH_BAND_COLOR[healthBand(metrics.avgFleetHealth)]}
                  label={`Average fleet health ${metrics.avgFleetHealth}`}
                >
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 650 }}>
                    <CountUp value={metrics.avgFleetHealth} />
                  </span>
                </Ring>
                <span className="neo-hud">Avg health</span>
              </div>

              <div className="hd-ins-hist">
                <div className="hd-ins-hist__bars" role="img" aria-label="Device health score histogram across 10 deciles">
                  {histogram.map((count, bin) => {
                    const maxBin = Math.max(1, ...histogram);
                    const pct = Math.max(6, Math.round((count / maxBin) * 100));
                    const midScore = bin * 10 + 5;
                    const color = HEALTH_BAND_COLOR[healthBand(midScore)];
                    return (
                      <div
                        key={bin}
                        className="hd-ins-hist__col"
                        title={`Score ${bin * 10}–${bin === 9 ? 100 : (bin + 1) * 10 - 1}: ${plural(count, 'device')}`}
                      >
                        <span className="hd-ins-hist__count">{count || ''}</span>
                        <div
                          className="hd-ins-hist__bar"
                          style={{ height: `${pct}%`, background: color, opacity: count ? 0.92 : 0.2 }}
                        />
                        <span className="hd-ins-hist__label">{bin * 10}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="hd-ins-bands">
                  {(['healthy', 'fair', 'at_risk', 'critical'] as HealthBand[]).map((b) => (
                    <div key={b} className="hd-ins-band">
                      <span className="hd-ins-band__dot" style={{ background: HEALTH_BAND_COLOR[b] }} />
                      <span className="truncate">{HEALTH_BAND_LABEL[b]}</span>
                      <b className="neo-mono" style={{ marginLeft: 'auto' }}>
                        {bandCounts[b]}
                      </b>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </NeoPanel>

          {/* 5. Compliance by Department */}
          <NeoPanel
            className="hd-ins-span-7"
            hud="MDM posture by org"
            title="Compliance by department"
            icon={<ShieldCheck />}
            flush
          >
            <div className="neo-table-wrap" style={{ border: 0, borderRadius: 0 }}>
              <table className="neo-table" data-qa="dept-compliance-table">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th>Devices</th>
                    <th>Encryption</th>
                    <th>Firewall</th>
                    <th>OS current</th>
                    <th>MDM check-in</th>
                  </tr>
                </thead>
                <tbody>
                  {deptCompliance.map((row) => (
                    <tr key={row.department}>
                      <td>
                        <b>{row.department}</b>
                      </td>
                      <td className="neo-mono">{row.devices}</td>
                      <td>
                        <DeptPctBar value={row.encryption} />
                      </td>
                      <td>
                        <DeptPctBar value={row.firewall} />
                      </td>
                      <td>
                        <DeptPctBar value={row.os} />
                      </td>
                      <td>
                        <DeptPctBar value={row.mdm} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </NeoPanel>

          {/* 6. Recent Nova Fix Runs */}
          <NeoPanel
            className="hd-ins-span-5"
            hud="Self-service automation"
            title="Recent Nova fix runs"
            icon={<Wand2 />}
            actions={
              <Link to="/helpdesk" className="neo-btn neo-btn--ghost neo-btn--xs">
                Playbooks <ArrowRight />
              </Link>
            }
          >
            {fixRuns.length === 0 ? (
              <NeoEmpty compact icon={<Sparkles />} title="No playbook runs yet" />
            ) : (
              <div className="hd-ins-runs">
                {fixRuns.slice(0, 6).map((run) => {
                  const book = PLAYBOOKS[run.playbookId];
                  const Icon = PLAYBOOK_ICON[run.playbookId] ?? Wand2;
                  const tone: Tone =
                    run.outcome === 'success' ? 'emerald' : run.outcome === 'partial' ? 'amber' : 'rose';
                  return (
                    <article key={run.id} className="hd-ins-run" data-qa={`fixrun-${run.id}`}>
                      <span className="hd-ins-run__icon">
                        <Icon />
                      </span>
                      <div className="hd-ins-run__body">
                        <div className="hd-ins-run__title">
                          <span>{book?.title ?? run.playbookId}</span>
                          {run.deviceTag && (
                            <Link to={`/helpdesk/fleet/${run.deviceTag}`} className="neo-mono text-xs neo-tint">
                              {run.deviceTag}
                            </Link>
                          )}
                        </div>
                        <div className="hd-ins-run__sum" title={run.summary}>
                          {run.summary}
                        </div>
                        <div style={{ marginTop: 2 }}>
                          <Person userId={run.userId} size={20} nameOnly />
                        </div>
                      </div>
                      <div className="hd-ins-run__meta">
                        <Chip size="sm" tone={tone}>
                          {run.outcome === 'success' ? 'Resolved' : run.outcome === 'partial' ? 'Partial' : 'Failed'}
                        </Chip>
                        <span className="text-xs neo-faint">
                          <Clock3 size={11} style={{ display: 'inline', verticalAlign: '-1px' }} />{' '}
                          {relativeTime(run.at, now)}
                        </span>
                        {run.ticketId && (
                          <Link to={`/helpdesk/tickets/${run.ticketId}`} className="neo-mono text-xs neo-faint">
                            {run.ticketId}
                          </Link>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </NeoPanel>
        </div>
      </div>
    </NeoStage>
  );
}

/* ==========================================================================
   Custom SVG Weekly Trend Chart (`weekStats`)
   ========================================================================== */

function WeeklyTrendChart({ weeks, mode }: { weeks: WeekStat[]; mode: TrendMode }) {
  const width = 680;
  const height = 210;
  const padL = 36;
  const padR = 20;
  const padT = 18;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const totalCreated = weeks.reduce((s, w) => s + w.created, 0);
  const totalResolved = weeks.reduce((s, w) => s + w.resolved, 0);
  const avgSla = weeks.length ? Math.round((weeks.reduce((s, w) => s + w.slaMet, 0) / weeks.length) * 100) : 91;
  const latestFrt = weeks[weeks.length - 1]?.frtMedianMin ?? 21;

  const n = Math.max(1, weeks.length);
  const stepX = innerW / n;

  const maxVol = Math.max(40, ...weeks.flatMap((w) => [w.created, w.resolved]));
  const maxFrt = Math.max(50, ...weeks.map((w) => w.frtMedianMin));

  const linePts = weeks.map((w, i) => {
    const x = padL + i * stepX + stepX / 2;
    const val = mode === 'volume' ? w.slaMet * maxVol : mode === 'sla' ? ((w.slaMet - 0.75) / 0.25) * 100 : (w.csat / 5) * maxFrt;
    const maxRef = mode === 'volume' ? maxVol : mode === 'sla' ? 100 : maxFrt;
    const y = padT + innerH - Math.max(0, Math.min(1, val / maxRef)) * innerH;
    return [x, y] as const;
  });

  const linePath = linePts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  return (
    <div className="hd-ins-chart" data-qa="weekly-trend-chart">
      <div className="hd-ins-chart__legend">
        {mode === 'volume' && (
          <>
            <span className="hd-ins-chart__key">
              <i className="hd-ins-chart__swatch" style={{ background: 'var(--app-c2)' }} /> Created ({totalCreated} in 11w)
            </span>
            <span className="hd-ins-chart__key">
              <i className="hd-ins-chart__swatch" style={{ background: 'var(--app-c1)' }} /> Resolved ({totalResolved} in 11w)
            </span>
            <span className="hd-ins-chart__key">
              <i className="hd-ins-chart__swatch" style={{ background: PRIORITY_COLOR.P2, borderRadius: 99 }} /> SLA met overlay
            </span>
          </>
        )}
        {mode === 'sla' && (
          <>
            <span className="hd-ins-chart__key">
              <i className="hd-ins-chart__swatch" style={{ background: 'var(--hd-ok)' }} /> Weekly SLA met % (avg {avgSla}%)
            </span>
            <span className="hd-ins-chart__key">
              <i className="hd-ins-chart__swatch" style={{ background: 'var(--hd-warn)' }} /> 90% target threshold
            </span>
          </>
        )}
        {mode === 'response' && (
          <>
            <span className="hd-ins-chart__key">
              <i className="hd-ins-chart__swatch" style={{ background: 'var(--app-c2)' }} /> Median first response (now {latestFrt}m)
            </span>
            <span className="hd-ins-chart__key">
              <i className="hd-ins-chart__swatch" style={{ background: 'var(--app-c1)', borderRadius: 99 }} /> CSAT trajectory
            </span>
          </>
        )}
      </div>

      <div className="hd-ins-svgwrap">
        <svg viewBox={`0 0 ${width} ${height}`} className="hd-ins-svg" role="img" aria-label="11-week support trend chart">
          {/* Horizontal grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = padT + innerH * (1 - t);
            const label =
              mode === 'volume'
                ? Math.round(t * maxVol)
                : mode === 'sla'
                  ? `${Math.round(75 + t * 25)}%`
                  : `${Math.round(t * maxFrt)}m`;
            return (
              <g key={t}>
                <line
                  x1={padL}
                  y1={y}
                  x2={width - padR}
                  y2={y}
                  stroke="var(--plane-border)"
                  strokeDasharray={t === 0 ? undefined : '3 3'}
                />
                <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="9.5" fill="var(--text-3)" fontFamily="var(--font-mono)">
                  {label}
                </text>
              </g>
            );
          })}

          {/* Bars per week */}
          {weeks.map((w, i) => {
            const cx = padL + i * stepX + stepX / 2;
            const dateLabel = formatDate(w.weekStart, { day: 'numeric', month: 'short' });

            if (mode === 'volume') {
              const bw = Math.min(14, stepX * 0.34);
              const hCreated = (w.created / maxVol) * innerH;
              const hResolved = (w.resolved / maxVol) * innerH;
              return (
                <g key={w.weekStart}>
                  <title>{`Week of ${dateLabel}: ${w.created} created, ${w.resolved} resolved, ${Math.round(w.slaMet * 100)}% SLA`}</title>
                  <rect
                    x={cx - bw - 1.5}
                    y={padT + innerH - hCreated}
                    width={bw}
                    height={hCreated}
                    rx={3}
                    fill="var(--app-c2)"
                    opacity={0.72}
                  />
                  <rect
                    x={cx + 1.5}
                    y={padT + innerH - hResolved}
                    width={bw}
                    height={hResolved}
                    rx={3}
                    fill="var(--app-c1)"
                    opacity={0.92}
                  />
                  <text x={cx} y={height - 8} textAnchor="middle" fontSize="9.5" fill="var(--text-3)" fontFamily="var(--font-mono)">
                    {dateLabel}
                  </text>
                </g>
              );
            }

            if (mode === 'sla') {
              const bw = Math.min(22, stepX * 0.5);
              const norm = Math.max(0.05, (w.slaMet - 0.75) / 0.25);
              const hBar = norm * innerH;
              const color = w.slaMet >= 0.9 ? 'var(--hd-ok)' : 'var(--hd-warn)';
              return (
                <g key={w.weekStart}>
                  <title>{`Week of ${dateLabel}: ${Math.round(w.slaMet * 100)}% SLA met`}</title>
                  <rect
                    x={cx - bw / 2}
                    y={padT + innerH - hBar}
                    width={bw}
                    height={hBar}
                    rx={4}
                    fill={color}
                    opacity={0.85}
                  />
                  <text
                    x={cx}
                    y={padT + innerH - hBar - 5}
                    textAnchor="middle"
                    fontSize="9.5"
                    fill="var(--text-2)"
                    fontFamily="var(--font-mono)"
                  >
                    {Math.round(w.slaMet * 100)}%
                  </text>
                  <text x={cx} y={height - 8} textAnchor="middle" fontSize="9.5" fill="var(--text-3)" fontFamily="var(--font-mono)">
                    {dateLabel}
                  </text>
                </g>
              );
            }

            const bw = Math.min(20, stepX * 0.45);
            const hFrt = (w.frtMedianMin / maxFrt) * innerH;
            return (
              <g key={w.weekStart}>
                <title>{`Week of ${dateLabel}: ${w.frtMedianMin}m median FRT · ${w.csat.toFixed(1)} CSAT`}</title>
                <rect
                  x={cx - bw / 2}
                  y={padT + innerH - hFrt}
                  width={bw}
                  height={hFrt}
                  rx={4}
                  fill="var(--app-c2)"
                  opacity={0.78}
                />
                <text x={cx} y={height - 8} textAnchor="middle" fontSize="9.5" fill="var(--text-3)" fontFamily="var(--font-mono)">
                  {dateLabel}
                </text>
              </g>
            );
          })}

          {/* Line overlay */}
          <path
            d={linePath}
            fill="none"
            stroke={mode === 'volume' ? PRIORITY_COLOR.P2 : 'var(--app-c1)'}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {linePts.map(([x, y], idx) => (
            <circle
              key={idx}
              cx={x}
              cy={y}
              r={3.2}
              fill={mode === 'volume' ? PRIORITY_COLOR.P2 : 'var(--app-c1)'}
            />
          ))}
        </svg>
      </div>

      <div className="hd-ins-weekstrip">
        <div className="hd-ins-mini">
          <div>
            <div className="neo-hud">11-week created</div>
            <div className="hd-ins-mini__val neo-num">{totalCreated}</div>
          </div>
          <Spark data={weeks.map((w) => w.created)} width={60} height={22} />
        </div>
        <div className="hd-ins-mini">
          <div>
            <div className="neo-hud">11-week resolved</div>
            <div className="hd-ins-mini__val neo-num">{totalResolved}</div>
          </div>
          <Spark data={weeks.map((w) => w.resolved)} width={60} height={22} />
        </div>
        <div className="hd-ins-mini">
          <div>
            <div className="neo-hud">Avg SLA met</div>
            <div className="hd-ins-mini__val neo-num">{avgSla}%</div>
          </div>
          <Spark data={weeks.map((w) => w.slaMet * 100)} width={60} height={22} />
        </div>
        <div className="hd-ins-mini">
          <div>
            <div className="neo-hud">FRT improvement</div>
            <div className="hd-ins-mini__val neo-num">
              {formatDuration((weeks[0]?.frtMedianMin ?? 38) * 60_000, { compact: true })} → {latestFrt}m
            </div>
          </div>
          <Spark data={weeks.map((w) => -w.frtMedianMin)} width={60} height={22} />
        </div>
      </div>
    </div>
  );
}

function DeptPctBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const fill = pct >= 90 ? 'var(--hd-ok)' : pct >= 75 ? 'var(--hd-warn)' : 'var(--hd-bad)';
  return (
    <div className="hd-ins-deptcell">
      <Bar value={value} fill={fill} label={`${pct}%`} />
      <span>{pct}%</span>
    </div>
  );
}
