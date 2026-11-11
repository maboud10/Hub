/**
 * Spaces — "Workplace Insights" (/spaces/insights)
 * Multi-hub occupancy, verified check-in rates, ghost-desk reclamation,
 * environmental air quality (CO₂ / °C / dBA), and GreenOps carbon & energy
 * savings across Dubai, London, Singapore, and New York.
 */
import { useMemo } from 'react';
import {
  BarChart3,
  Building2,
  Leaf,
  Sparkles,
  Users,
  Wind,
  Zap,
} from 'lucide-react';
import {
  Bar,
  Chip,
  NeoHome,
  NeoKpi,
  NeoKpis,
  NeoPanel,
  Ring,
  Spark,
} from '@/components/neo';
import {
  computeGlobalCarbonSummary,
  computeWorkplacePulse,
} from '@/spaces/engine';
import {
  SITES,
  SITE_BY_ID,
  dateMapForOffset,
} from '@/spaces/seed';
import { useSpaces } from '@/spaces/store';
import { SensorStrip, useSpacesUi } from './parts';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function InsightsView() {
  const { site, setSite, dayOffset, date } = useSpacesUi();
  const bookings = useSpaces((s) => s.bookings);
  const visitors = useSpaces((s) => s.visitors);
  const requests = useSpaces((s) => s.requests);
  const releaseGhostDesks = useSpaces((s) => s.releaseGhostDesks);

  const siteMeta = SITE_BY_ID[site];
  const datesMap = useMemo(() => dateMapForOffset(dayOffset), [dayOffset]);

  const pulse = useMemo(
    () => computeWorkplacePulse(site, date, bookings, visitors, requests),
    [site, date, bookings, visitors, requests],
  );

  const global = useMemo(
    () => computeGlobalCarbonSummary(datesMap, bookings, visitors, requests),
    [datesMap, bookings, visitors, requests],
  );

  return (
    <div className="sp-view">
      <NeoKpis>
        <NeoKpi
          label="Global Hub Occupancy"
          icon={<Users />}
          value={
            <>
              <b>{global.globalOccupancyPct}%</b>
            </>
          }
          sub={
            <>
              <b>{global.totalBooked}</b> <span>of</span> <b>{global.totalDesks}</b> <span>desks active</span>
            </>
          }
        />
        <NeoKpi
          label="Global Carbon Saved"
          icon={<Leaf />}
          tone="emerald"
          value={
            <>
              <b>{global.totalCarbonKg}</b> <span className="sp-kpi-unit">kg CO₂e</span>
            </>
          }
          sub={<span>Hybrid consolidation & zone power-down</span>}
        />
        <NeoKpi
          label="Smart HVAC Energy Saved"
          icon={<Zap />}
          tone="cyan"
          value={
            <>
              <b>{global.totalEnergyKwh}</b> <span className="sp-kpi-unit">kWh</span>
            </>
          }
          sub={
            <>
              <span>Active hub:</span> <b>{siteMeta.renewablePct}%</b> <span>renewable</span>
            </>
          }
        />
        <NeoKpi
          label={`${siteMeta.city} Check-In Rate`}
          icon={<BarChart3 />}
          tone={pulse.ghostDesks.length > 0 ? 'amber' : 'emerald'}
          value={
            <>
              <b>{pulse.checkInRatePct}%</b>
            </>
          }
          sub={
            <>
              <b>{pulse.ghostDesks.length}</b> <span>ghost holds</span> ·{' '}
              <b>{pulse.releasedGhostsCount}</b> <span>reclaimed</span>
            </>
          }
        />
      </NeoKpis>

      <NeoHome
        main={
          <>
            {/* Global 4-Hub Matrix */}
            <NeoPanel
              hud="GLOBAL WORKPLACE BENCHMARK"
              title="Four-Hub Occupancy, Air Quality & GreenOps Savings"
              icon={<Building2 />}
            >
              <div className="sp-insights-grid">
                {SITES.map((s) => {
                  const p =
                    global.pulses.find((x) => x.siteId === s.id) ??
                    computeWorkplacePulse(s.id, datesMap[s.id], bookings, visitors, requests);
                  const isActive = s.id === site;

                  return (
                    <div
                      key={s.id}
                      className={`sp-insight-card neo-spot ${isActive ? 'is-selected' : ''}`}
                      onClick={() => setSite(s.id)}
                    >
                      <div className="sp-insight-card__head">
                        <div>
                          <div className="neo-hud">{s.building}</div>
                          <h3 className="sp-insight-card__title">{s.label}</h3>
                        </div>
                        <Ring value={p.occupancyPct / 100} size={50} stroke={5} color={s.color}>
                          {p.occupancyPct}%
                        </Ring>
                      </div>

                      <div className="sp-insight-card__stats">
                        <div className="sp-stat-cell">
                          <span className="neo-hud">DESKS</span>
                          <b>
                            {p.bookedDesks}/{p.totalDesks}
                          </b>
                        </div>
                        <div className="sp-stat-cell">
                          <span className="neo-hud">CO₂ SAVED</span>
                          <b>{p.carbonSavedKg} kg</b>
                        </div>
                        <div className="sp-stat-cell">
                          <span className="neo-hud">COST SAVED</span>
                          <b>
                            {s.currency} {p.costSavedLocal.toLocaleString()}
                          </b>
                        </div>
                        <div className="sp-stat-cell">
                          <span className="neo-hud">RENEWABLE</span>
                          <b>{s.renewablePct}%</b>
                        </div>
                      </div>

                      <SensorStrip
                        co2={p.avgCo2}
                        tempC={p.avgTempC}
                        noiseDb={p.avgNoiseDb}
                      />

                      <div className="sp-insight-card__foot">
                        <Spark data={p.weeklyRhythmPct} width={110} height={28} color={s.color} />
                        {p.ghostDesks.length > 0 ? (
                          <button
                            type="button"
                            className="neo-btn neo-btn--xs neo-btn--plasma"
                            onClick={(e) => {
                              e.stopPropagation();
                              releaseGhostDesks(s.id, datesMap[s.id]);
                            }}
                          >
                            <Zap />
                            <span>Sweep {p.ghostDesks.length} ghost(s)</span>
                          </button>
                        ) : (
                          <Chip tone="emerald" size="sm">
                            <span>Zero ghost desks</span>
                          </Chip>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </NeoPanel>

            {/* Zone Utilisation & Environmental Breakdown */}
            <NeoPanel
              hud="NEIGHBOURHOOD TELEMETRY"
              title={`${siteMeta.label} Zone Utilization & Sensor Audit`}
              icon={<Wind />}
            >
              <div className="sp-zone-audit-list">
                {pulse.zoneUtilization.map((zu) => (
                  <div key={zu.zone.id} className="sp-zone-audit-row">
                    <div className="sp-zone-audit-row__head">
                      <div>
                        <strong>{zu.zone.team ?? zu.zone.kind}</strong>
                        <span className="sp-zone-audit-row__sub">
                          {' '}
                          · {zu.bookedDesks} of {zu.totalDesks} desks booked ({zu.checkedInDesks}{' '}
                          checked in)
                        </span>
                      </div>
                      <Chip tone="cyan" size="sm">
                        <b>{zu.pct}%</b>
                      </Chip>
                    </div>
                    <Bar value={zu.pct / 100} height={8} />
                    <div style={{ marginTop: 8 }}>
                      <SensorStrip
                        co2={zu.zone.sensors.co2}
                        tempC={zu.zone.sensors.tempC}
                        noiseDb={zu.zone.sensors.noiseDb}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </NeoPanel>
          </>
        }
        side={
          <>
            {/* Weekly Attendance Rhythm */}
            <NeoPanel
              hud="WEEKLY RHYTHM"
              title={`${siteMeta.label} Attendance Curve`}
              icon={<BarChart3 />}
            >
              <div className="sp-rhythm-list">
                {WEEKDAYS.map((day, idx) => {
                  const pct = pulse.weeklyRhythmPct[idx] ?? 0;
                  return (
                    <div key={day} className="sp-rhythm-row">
                      <span className="sp-rhythm-row__day neo-mono">{day}</span>
                      <div className="sp-rhythm-row__bar">
                        <Bar value={pct / 100} fill={siteMeta.color} height={8} />
                      </div>
                      <span className="sp-rhythm-row__val neo-mono">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </NeoPanel>

            {/* Nova GreenOps Recommendations */}
            <NeoPanel
              hud="NOVA GREENOPS"
              title="Smart Building Optimizations"
              icon={<Sparkles />}
            >
              <div className="sp-side-list">
                <div className="sp-side-card">
                  <div className="sp-side-card__head">
                    <Chip tone="emerald" size="sm">
                      HVAC Consolidation
                    </Chip>
                    <span className="neo-mono">-{pulse.energySavedKwh} kWh</span>
                  </div>
                  <div className="sp-side-card__title">
                    Low-density Friday setback active on non-plan floors
                  </div>
                  <p className="sp-side-card__body">
                    Consolidating Friday bookings onto {siteMeta.floors.find((f) => f.plan)?.label ?? 'the main floor'}{' '}
                    saves {siteMeta.currency} {pulse.costSavedLocal.toLocaleString()} and{' '}
                    {pulse.carbonSavedKg} kg CO₂e per day.
                  </p>
                </div>

                <div className="sp-side-card">
                  <div className="sp-side-card__head">
                    <Chip tone="cyan" size="sm">
                      Fresh-Air Damper
                    </Chip>
                    <span className="neo-mono">{pulse.avgCo2} ppm avg</span>
                  </div>
                  <div className="sp-side-card__title">
                    Pre-warming & CO₂ demand control linked to Calendar
                  </div>
                  <p className="sp-side-card__body">
                    Spatial rooms pre-ventilate 15 minutes before meetings with 6+ attendees to keep
                    CO₂ under 650 ppm.
                  </p>
                </div>
              </div>
            </NeoPanel>
          </>
        }
      />
    </div>
  );
}
