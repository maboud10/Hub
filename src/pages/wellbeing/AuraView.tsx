/**
 * Helix Wellbeing — Aura (home): the living energy aura, 5-dimension drivers,
 * Nova recharge prescriptions (explainable + one-click), today's energy
 * forecast from the real calendar, streaks, the weekly mood line and a private
 * small-wins journal.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ArrowRight,
  CalendarClock,
  CalendarPlus,
  Check,
  Flame,
  Footprints,
  Heart,
  HeartPulse,
  Leaf,
  LifeBuoy,
  Moon,
  Phone,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingDown,
  Trophy,
  Users,
  Wind,
  Zap,
} from 'lucide-react';
import { Bar, Chip, CountUp, NeoBanner, NeoBanners, NeoHome, NeoKpi, NeoKpis, NeoPanel, NovaChip, Spark } from '@/components/neo';
import { startFocusSession } from '@/components/FocusEngine';
import { relativeTime } from '@/lib/format';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import {
  DIP_REASON,
  WEAKEST_LINE,
  findFreeGap,
  formatHour,
  moodEmoji,
  moodTimeline,
  teamOf,
  weekSteps,
  type DimensionReading,
  type Prescription,
} from '@/wellbeing/engine';
import { DIMENSIONS, DIMENSION_BY_ID, TEAM_BY_ID } from '@/wellbeing/seed';
import { useWellbeing } from '@/wellbeing/store';
import type { DimensionId, JournalEntry, JournalKind } from '@/wellbeing/types';
import {
  DimIcon,
  Facts,
  MoodSpark,
  PrivateChip,
  RadioPills,
  U,
  blockCalendarSlot,
  convertToWalk,
  localValue,
  requestRechargeDay,
  useAuraModel,
  useLocale,
  useOpenCheckIn,
  useReducedMotion,
  type AuraModel,
} from './parts';

const band = (score: number) => (score >= 75 ? 'Charged' : score >= 55 ? 'Steady' : score >= 40 ? 'Running low' : 'Depleted');

export function AuraView() {
  const model = useAuraModel();
  const openCheckIn = useOpenCheckIn();
  const recordScore = useWellbeing((s) => s.recordScore);
  const { uid, checkin, recharge, streak, calmWeek, stepsToday, meeting, data, now } = model;

  // Keep the bridge's snapshot in sync with what the person sees.
  useEffect(() => {
    if (uid && recharge !== null) recordScore(uid, recharge);
  }, [uid, recharge, recordScore]);

  const steps7 = useMemo(() => weekSteps(data, now), [data, now]);

  return (
    <div className="wb-view">
      {!checkin && (
        <NeoBanners>
          <NeoBanner
            tone="app"
            icon={<HeartPulse />}
            title="Your aura is waiting"
            onClick={openCheckIn}
            action={
              <button type="button" className="neo-btn neo-btn--plasma neo-btn--xs" onClick={openCheckIn}>
                Check in
              </button>
            }
          >
            20 seconds: mood, energy, stress and sleep. Private to you.
          </NeoBanner>
        </NeoBanners>
      )}

      <NeoKpis label="Today at a glance">
        <NeoKpi
          label="Recharge"
          icon={<HeartPulse />}
          value={checkin && recharge !== null ? <CountUp value={recharge} /> : '—'}
          sub={checkin && recharge !== null ? band(recharge) : 'Check in to tune your aura'}
          onClick={checkin ? undefined : openCheckIn}
        />
        <NeoKpi
          label="Check-in streak"
          icon={<Flame />}
          value={
            <>
              {streak} <small>days</small>
            </>
          }
          sub={checkin ? 'Checked in today' : 'Check in to keep it going'}
        />
        <NeoKpi
          label="Calm minutes"
          icon={<Leaf />}
          value={
            <>
              {calmWeek} <small>min</small>
            </>
          }
          sub="Last 7 days"
          to="/wellbeing/breathe"
        />
        <NeoKpi
          label="Steps today"
          icon={<Footprints />}
          value={stepsToday.toLocaleString()}
          sub={
            <>
              <span>Goal</span> <b>{data.stepGoal.toLocaleString()}</b>
            </>
          }
          to="/wellbeing/move"
          spark={<Spark data={steps7.map((s) => s.steps)} width={70} height={26} />}
        />
        <NeoKpi
          label="Meetings today"
          icon={<CalendarClock />}
          value={meeting.count}
          sub={
            <>
              <b>
                {meeting.hours}
                <U u="h" />
              </b>{' '}
              <span>·</span>{' '}
              <b>
                {meeting.focusHours}
                <U u="h" />
              </b>{' '}
              <span>focus</span>
            </>
          }
          to="/calendar"
        />
      </NeoKpis>

      <NeoHome
        main={
          <>
            <AuraPanel model={model} />
            <PrescriptionsPanel model={model} />
            <ForecastPanel model={model} />
          </>
        }
        side={
          <>
            <MoodWeekPanel model={model} />
            <JournalPanel uid={uid} />
            <SupportPanel />
          </>
        }
        sideLabel="Your week"
      />
    </div>
  );
}

/* ───────────────────────── living aura ───────────────────────── */

function AuraPanel({ model }: { model: AuraModel }) {
  const openCheckIn = useOpenCheckIn();
  const { readings, recharge, estimate, visual, checkin } = model;
  const [active, setActive] = useState<DimensionId>(model.weakest.id);
  const reading = readings.find((r) => r.id === active) ?? readings[0];

  return (
    <NeoPanel className="wb-aura-panel" hud="Living aura · today" title="Your energy aura" actions={<PrivateChip />}>
      <div className="wb-aura-grid">
        <div className="wb-aura-col">
          <AuraOrb readings={readings} recharge={recharge} estimate={estimate} visual={visual} active={active} onActive={setActive} onCheckIn={openCheckIn} />
          <p className="wb-aura-insight">
            <Sparkles aria-hidden="true" />
            <span>{checkin ? WEAKEST_LINE[model.weakest.id] : 'Your aura is dimmed until today’s check-in. It brightens with every honest answer.'}</span>
          </p>
        </div>
        <div className="wb-aura-side">
          <DriversCard reading={reading} />
          <div className="wb-dimlist" role="group" aria-label="Dimensions">
            {readings.map((r) => {
              const meta = DIMENSION_BY_ID[r.id];
              return (
                <button key={r.id} type="button" className={cx('wb-dimrow', r.id === active && 'is-on')} data-dim={r.id} aria-pressed={r.id === active} onClick={() => setActive(r.id)} onMouseEnter={() => setActive(r.id)}>
                  <DimIcon id={r.id} />
                  <span className="wb-dimrow__label">{meta.label}</span>
                  <Bar value={r.score / 100} fill={meta.color} label={meta.label} />
                  <b className="wb-dimrow__score">{r.score}</b>
                </button>
              );
            })}
          </div>
          <ul className="wb-weights" aria-label="How the Recharge score is weighted">
            {DIMENSIONS.map((d) => (
              <li key={d.id} data-dim={d.id}>
                <span>{d.label}</span>
                <b>{Math.round(d.weight * 100)}%</b>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </NeoPanel>
  );
}

function AuraOrb({
  readings,
  recharge,
  estimate,
  visual,
  active,
  onActive,
  onCheckIn,
}: {
  readings: DimensionReading[];
  recharge: number | null;
  estimate: number;
  visual: AuraModel['visual'];
  active: DimensionId;
  onActive: (id: DimensionId) => void;
  onCheckIn: () => void;
}) {
  const live = recharge !== null;
  const style = {
    '--c1': visual.c1,
    '--c2': visual.c2,
    '--c3': visual.c3,
    '--pulse': `${visual.pulseSecs}s`,
    '--scale': visual.scale,
  } as CSSProperties;
  return (
    <div className="wb-aura" data-state={live ? 'live' : 'asleep'} style={style}>
      <div className="wb-aura__field" aria-hidden="true">
        <i className="wb-aura__halo" />
        {readings.map((r, i) => (
          <i key={r.id} className="wb-aura__lobe" data-dim={r.id} style={{ '--a': `${i * 72}deg`, '--s': (r.score / 100).toFixed(2) } as CSSProperties} />
        ))}
        <i className="wb-aura__swirl" />
        <i className="wb-aura__ring" />
      </div>
      <div className="wb-aura__core">
        <span className="neo-hud">Recharge</span>
        <span className="wb-aura__score" aria-live="polite">
          {live ? <CountUp value={recharge} /> : <span className="wb-aura__est">{estimate}</span>}
        </span>
        {live ? (
          <span className="wb-aura__band">{band(recharge)}</span>
        ) : (
          <button type="button" className="neo-btn neo-btn--plasma neo-btn--xs wb-aura__cta" onClick={onCheckIn}>
            <HeartPulse />
            <span>Check in</span>
          </button>
        )}
      </div>
      {readings.map((r, i) => {
        const meta = DIMENSION_BY_ID[r.id];
        return (
          <button
            key={r.id}
            type="button"
            className={cx('wb-petal', active === r.id && 'is-on')}
            data-dim={r.id}
            style={{ '--a': `${i * 72}deg` } as CSSProperties}
            aria-pressed={active === r.id}
            aria-label={`${meta.label} · ${r.score}`}
            aria-controls="wb-drivers"
            onMouseEnter={() => onActive(r.id)}
            onFocus={() => onActive(r.id)}
            onClick={() => onActive(r.id)}
          >
            <DimIcon id={r.id} />
            <b>{r.score}</b>
          </button>
        );
      })}
    </div>
  );
}

function DriversCard({ reading }: { reading: DimensionReading }) {
  const meta = DIMENSION_BY_ID[reading.id];
  const locale = useLocale();
  return (
    <div className="wb-drivers" id="wb-drivers" data-dim={reading.id} aria-live="polite">
      <div className="wb-drivers__head">
        <DimIcon id={reading.id} />
        <h3 className="wb-drivers__title">{meta.label}</h3>
        {reading.estimated && (
          <Chip tone="slate" size="sm" title="Based on your last check-in">
            Estimated
          </Chip>
        )}
        <b className="wb-drivers__score">{reading.score}</b>
      </div>
      <p className="wb-drivers__blurb">{meta.blurb}</p>
      <ul className="wb-drivers__list">
        {reading.drivers.map((d) => (
          <li key={d.label} data-tone={d.tone}>
            <i aria-hidden="true" />
            <span>{d.label}</span>
            <b>{localValue(d.value, locale)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────────────────────── Nova prescriptions ───────────────────────── */

const RX_ICON: Record<Prescription['id'], ReactNode> = {
  care: <LifeBuoy />,
  reset: <CalendarPlus />,
  breathe: <Wind />,
  'recharge-day': <Sparkles />,
  walk1on1: <Footprints />,
  focus: <Zap />,
  move: <Footprints />,
  'wind-down': <Moon />,
  win: <Trophy />,
};

function PrescriptionsPanel({ model }: { model: AuraModel }) {
  const openCheckIn = useOpenCheckIn();
  const navigate = useNavigate();
  const markRxDone = useWellbeing((s) => s.markRxDone);
  const markWalkTalk = useWellbeing((s) => s.markWalkTalk);
  const logFocusSprint = useWellbeing((s) => s.logFocusSprint);
  const [busy, setBusy] = useState<string | null>(null);
  const { uid, data, today, rx, checkin, me } = model;
  const done = data.doneRx.date === today ? data.doneRx.ids : [];

  const run = async (r: Prescription) => {
    setBusy(r.id);
    try {
      switch (r.id) {
        case 'reset': {
          if (r.payload?.startHour === undefined) break;
          const ok = await blockCalendarSlot(uid, {
            dayOffset: r.payload.dayOffset ?? 0,
            startHour: r.payload.startHour,
            durationMins: 25,
            title: 'Recharge · Aura reset',
            description: 'A 25-minute reset suggested by Aura: step away, breathe, refill your water.',
          });
          if (ok) markRxDone(uid, r.id);
          break;
        }
        case 'breathe':
          markRxDone(uid, r.id);
          navigate('/wellbeing/breathe?pattern=box&mins=2&autostart=1');
          break;
        case 'walk1on1': {
          if (!r.payload?.eventId) break;
          const route = TEAM_BY_ID[teamOf(me?.location)].route;
          const id = await convertToWalk(r.payload.eventId, route);
          if (id) {
            markWalkTalk(uid, id);
            markRxDone(uid, r.id);
            toast.success('Your 1:1 is now a walk & talk', route);
          }
          break;
        }
        case 'focus':
          startFocusSession(25);
          logFocusSprint(uid, 25);
          markRxDone(uid, r.id);
          break;
        case 'recharge-day': {
          if (!r.payload?.date) {
            navigate('/hr/time-off');
            break;
          }
          const res = await requestRechargeDay(r.payload.date);
          if (res.ok) {
            markRxDone(uid, r.id);
            toast.success('Recharge day requested', res.message);
          } else toast.warning('Nova couldn’t book that day', res.message);
          break;
        }
        case 'care':
          navigate('/wellbeing/care');
          break;
        case 'move':
          navigate('/wellbeing/move#log');
          break;
        case 'wind-down':
          markRxDone(uid, r.id);
          navigate('/wellbeing/rhythm#quiet');
          break;
        case 'win': {
          const el = document.getElementById('wb-journal-input') as HTMLInputElement | null;
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el?.focus({ preventScroll: true });
          break;
        }
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <NeoPanel id="wb-rx" className="wb-rx-panel" hud="Nova · recharge prescriptions" title="Your recharge plan" actions={<NovaChip>Explainable</NovaChip>}>
      {!checkin ? (
        <div className="wb-rx-empty">
          <span className="wb-rx-empty__orb" aria-hidden="true" />
          <div>
            <h3>Check in to get today’s plan</h3>
            <p>Nova reads your check-in with your calendar, focus time and leave history, then suggests two or three small, specific moves.</p>
          </div>
          <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={openCheckIn}>
            <HeartPulse />
            <span>Check in</span>
          </button>
        </div>
      ) : rx.length === 0 ? (
        <div className="wb-rx-empty">
          <span className="wb-rx-empty__orb" aria-hidden="true" />
          <div>
            <h3>You’re in a good rhythm</h3>
            <p>Nothing to fix today. Keep protecting what’s working.</p>
          </div>
        </div>
      ) : (
        <div className="wb-rx-grid" aria-live="polite">
          {rx.map((r) => {
            const isDone = done.includes(r.id);
            return (
              <article key={r.id} className={cx('wb-rx', 'neo-spot', isDone && 'is-done')} data-tone={r.tone}>
                <header className="wb-rx__head">
                  <span className="wb-rx__icon" aria-hidden="true">
                    {RX_ICON[r.id]}
                  </span>
                  <h3 className="wb-rx__title">{r.title}</h3>
                  {r.chip && <b className="wb-rx__chip">{r.chip}</b>}
                </header>
                <Facts facts={r.facts} />
                <p className="wb-rx__why">
                  <span className="wb-rx__because">Because</span> <span>{r.because}</span>
                </p>
                <footer className="wb-rx__foot">
                  {isDone ? (
                    <span className="wb-rx__done">
                      <Check aria-hidden="true" />
                      <span>Done</span>
                    </span>
                  ) : (
                    <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" disabled={busy === r.id} onClick={() => void run(r)}>
                      <span>{r.cta}</span>
                      <ArrowRight className="wb-flip" />
                    </button>
                  )}
                  {r.id === 'recharge-day' && (
                    <Link className="neo-btn neo-btn--ghost neo-btn--xs" to="/hr/time-off">
                      Open Time off
                    </Link>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </NeoPanel>
  );
}

/* ───────────────────────── energy forecast ───────────────────────── */

const FROM = 7;
const TO = 21;
const W = 640;
const H = 220;
const PLOT_TOP = 18;
const PLOT_BOTTOM = 176;
const xOf = (h: number) => ((h - FROM) / (TO - FROM)) * W;
const yOf = (e: number) => PLOT_BOTTOM - (e / 100) * (PLOT_BOTTOM - PLOT_TOP);
const pct = (h: number) => `${((h - FROM) / (TO - FROM)) * 100}%`;

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

function ForecastPanel({ model }: { model: AuraModel }) {
  const { forecast, myToday, hourNow, events, uid, data, checkin } = model;
  const [protecting, setProtecting] = useState<string | null>(null);
  const pts = forecast.points.map((p) => ({ x: xOf(p.hour), y: yOf(p.energy) }));
  const line = smoothPath(pts);
  const area = `${line} L${W},${PLOT_BOTTOM} L0,${PLOT_BOTTOM} Z`;
  const quietFrom = data.quiet.enabled ? Math.max(FROM, Math.min(TO, data.quiet.startHour)) : TO;
  const nowIn = hourNow >= FROM && hourNow <= TO;

  const peakSlot = findFreeGap(events, { userId: uid, nowHour: hourNow, durationMins: 60, preferHour: forecast.peak.start });
  const peakFree = peakSlot && Math.abs(peakSlot.startHour - forecast.peak.start) <= 1.5 ? peakSlot : null;

  const protect = async (key: string, startHour: number, durationMins: number, title: string, description: string) => {
    setProtecting(key);
    await blockCalendarSlot(uid, { dayOffset: 0, startHour, durationMins, title, description });
    setProtecting(null);
  };

  return (
    <NeoPanel className="wb-forecast-panel" hud="Energy forecast · today" title="Where your energy goes" actions={<Chip tone="slate" size="sm">{checkin ? 'From check-in + Calendar' : 'From Calendar + last check-in'}</Chip>}>
      <div className="wb-forecast">
        <div className="wb-forecast__chart">
          <svg className="wb-forecast__plot" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Predicted energy from 07:00 to 21:00">
            <defs>
              <linearGradient id="wb-fc-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--app-c1)" stopOpacity="0.42" />
                <stop offset="100%" stopColor="var(--app-c2)" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="wb-fc-line" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--app-c2)" />
                <stop offset="55%" stopColor="var(--app-c1)" />
                <stop offset="100%" stopColor="#fbbf24" />
              </linearGradient>
            </defs>
            <rect className="wb-forecast__quiet" x={xOf(quietFrom)} y={0} width={Math.max(0, W - xOf(quietFrom))} height={PLOT_BOTTOM} />
            <rect className="wb-forecast__peak" x={xOf(forecast.peak.start)} y={PLOT_TOP - 8} width={xOf(forecast.peak.end) - xOf(forecast.peak.start)} height={PLOT_BOTTOM - PLOT_TOP + 8} rx={8} />
            {[25, 50, 75].map((v) => (
              <line key={v} className="wb-forecast__grid" x1={0} x2={W} y1={yOf(v)} y2={yOf(v)} />
            ))}
            <path className="wb-forecast__area" d={area} fill="url(#wb-fc-fill)" />
            <path className="wb-forecast__line" d={line} stroke="url(#wb-fc-line)" />
            {myToday.map((e) => (
              <rect key={e.id} className="wb-forecast__evt" data-kind={e.category === 'focus' ? 'focus' : 'meet'} x={xOf(Math.max(FROM, e.startHour))} y={190} width={Math.max(3, xOf(Math.min(TO, e.startHour + e.durationMins / 60)) - xOf(Math.max(FROM, e.startHour)))} height={14} rx={4} />
            ))}
            {forecast.dips.map((d) => (
              <circle key={d.hour} className="wb-forecast__dip" cx={xOf(d.hour)} cy={yOf(d.energy)} r={6} />
            ))}
            {nowIn && <line className="wb-forecast__now" x1={xOf(hourNow)} x2={xOf(hourNow)} y1={4} y2={PLOT_BOTTOM + 30} />}
          </svg>
          {forecast.dips.map((d) => (
            <span key={d.hour} className="wb-forecast__tag" style={{ insetInlineStart: pct(d.hour), top: `${(yOf(d.energy) / H) * 100}%` }}>
              <TrendingDown aria-hidden="true" />
              <span>{formatHour(d.hour)}</span>
            </span>
          ))}
          {nowIn && (
            <span className="wb-forecast__nowtag" style={{ insetInlineStart: pct(hourNow) }}>
              Now
            </span>
          )}
          <div className="wb-forecast__axis" aria-hidden="true">
            {[8, 10, 12, 14, 16, 18, 20].map((h) => (
              <span key={h} style={{ insetInlineStart: pct(h) }}>
                {formatHour(h)}
              </span>
            ))}
          </div>
        </div>
        <ul className="wb-forecast__legend" aria-label="Legend">
          <li data-k="meet">Meetings</li>
          <li data-k="focus">Focus</li>
          <li data-k="peak">Peak window</li>
          <li data-k="quiet">Quiet hours</li>
        </ul>
        <div className="wb-forecast__insights">
          <div className="wb-insight" data-kind="peak">
            <Zap aria-hidden="true" />
            <div className="wb-insight__text">
              <span className="wb-insight__label">Peak focus window</span>
              <b>
                {formatHour(forecast.peak.start)}–{formatHour(forecast.peak.end)}
              </b>
            </div>
            {peakFree ? (
              <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" disabled={protecting === 'peak'} onClick={() => void protect('peak', peakFree.startHour, 60, 'Deep work · Peak energy window', 'Protected by Aura: your forecast peaks here, so it’s kept for your hardest thinking.')}>
                <ShieldCheck />
                <span>Protect</span>
              </button>
            ) : (
              <span className="wb-insight__meta">{forecast.peak.end <= hourNow ? 'Earlier today' : 'Already booked'}</span>
            )}
          </div>
          {forecast.dips.map((d) => {
            const slot = findFreeGap(events, { userId: uid, nowHour: hourNow, durationMins: 15, preferHour: d.hour - 0.25 });
            const near = slot && Math.abs(slot.startHour - d.hour) <= 1.25 ? slot : null;
            const key = `dip-${d.hour}`;
            return (
              <div key={key} className="wb-insight" data-kind="dip">
                <TrendingDown aria-hidden="true" />
                <div className="wb-insight__text">
                  <span className="wb-insight__label">{DIP_REASON[d.reason]}</span>
                  <b>{formatHour(d.hour)}</b>
                </div>
                {near ? (
                  <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" disabled={protecting === key} onClick={() => void protect(key, near.startHour, 15, 'Recharge · 15-min reset', 'Aura spotted an energy dip here. Walk, stretch or breathe for 15 minutes.')}>
                    <CalendarPlus />
                    <span>Protect {formatHour(near.startHour)}</span>
                  </button>
                ) : (
                  <span className="wb-insight__meta">No free slot nearby</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </NeoPanel>
  );
}

/* ───────────────────────── side column ───────────────────────── */

function MoodWeekPanel({ model }: { model: AuraModel }) {
  const { data, today, streak, calmWeek } = model;
  const week = useMemo(() => moodTimeline(data.checkins, today, 7), [data.checkins, today]);
  const logged = week.filter((d) => d.mood !== null);
  const avg = logged.length ? logged.reduce((s, d) => s + (d.mood ?? 0), 0) / logged.length : null;
  return (
    <NeoPanel hud="This week" title="Mood timeline" actions={<PrivateChip compact />}>
      <div className="wb-moodweek">
        <MoodSpark values={week.map((d) => d.mood)} />
        <ol className="wb-moodweek__days">
          {week.map((d) => (
            <li key={d.date} data-today={d.date === today || undefined} title={d.date}>
              <span className="wb-moodweek__emoji" aria-hidden="true">
                {d.mood ? moodEmoji(d.mood) : '·'}
              </span>
              <span className="wb-moodweek__day">{d.label}</span>
            </li>
          ))}
        </ol>
        <div className="wb-moodweek__stats">
          <span className="wb-stat">
            <Flame aria-hidden="true" />
            <span>Streak</span>
            <b>{streak}</b>
          </span>
          <span className="wb-stat">
            <Leaf aria-hidden="true" />
            <span>Calm minutes</span>
            <b>{calmWeek}</b>
          </span>
          {avg !== null && (
            <span className="wb-stat">
              <Heart aria-hidden="true" />
              <span>Average mood</span>
              <b>{avg.toFixed(1)}</b>
            </span>
          )}
        </div>
      </div>
    </NeoPanel>
  );
}

const EMPTY_JOURNAL: JournalEntry[] = [];

function JournalPanel({ uid }: { uid: string }) {
  const journal = useWellbeing((s) => s.users[uid]?.journal ?? EMPTY_JOURNAL);
  const addJournal = useWellbeing((s) => s.addJournal);
  const removeJournal = useWellbeing((s) => s.removeJournal);
  const [kind, setKind] = useState<JournalKind>('win');
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (addJournal(uid, kind, text)) {
      setText('');
      toast.success(kind === 'win' ? 'Small win saved' : 'Gratitude saved', 'Private to you');
    } else input.current?.focus();
  };

  return (
    <NeoPanel hud="Micro-journal" title="Small wins & gratitude" actions={<PrivateChip compact />}>
      <form className="wb-journal__form" onSubmit={submit}>
        <RadioPills
          label="Entry type"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'win', label: 'Small win', icon: <Trophy /> },
            { value: 'gratitude', label: 'Gratitude', icon: <Heart /> },
          ]}
        />
        <div className="wb-journal__row">
          <input
            id="wb-journal-input"
            ref={input}
            className="neo-input neo-input--sm"
            value={text}
            maxLength={240}
            onChange={(e) => setText(e.target.value)}
            placeholder={kind === 'win' ? 'One small win from today…' : 'Something you’re grateful for…'}
            aria-label={kind === 'win' ? 'Small win' : 'Gratitude'}
          />
          <button type="submit" className="neo-btn neo-btn--soft neo-btn--sm neo-btn--icon" aria-label="Save entry">
            <Plus />
          </button>
        </div>
      </form>
      {journal.length ? (
        <ul className="wb-journal">
          {journal.slice(0, 6).map((j) => (
            <li key={j.id} data-kind={j.kind}>
              <span className="wb-journal__icon" aria-hidden="true">
                {j.kind === 'win' ? <Trophy /> : <Heart />}
              </span>
              <div className="wb-journal__body">
                <p data-no-i18n="">{j.text}</p>
                <span className="wb-journal__time">{relativeTime(j.at)}</span>
              </div>
              <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label="Delete entry" onClick={() => removeJournal(uid, j.id)}>
                <Trash2 />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="wb-muted">Nothing yet. Tiny counts: a good coffee, a kind message, a bug squashed.</p>
      )}
    </NeoPanel>
  );
}

function SupportPanel() {
  const reduced = useReducedMotion();
  return (
    <NeoPanel className="wb-support" hud="Always here" title="Need a moment?">
      <div className="wb-support__grid">
        <Link to="/wellbeing/breathe?pattern=box&mins=2" className="wb-support__tile neo-spot">
          <span className={cx('wb-support__orb', !reduced && 'is-breathing')} aria-hidden="true" />
          <span className="wb-support__text">
            <b>Two-minute breather</b>
            <span>Box breathing, guided</span>
          </span>
        </Link>
        <Link to="/wellbeing/care" className="wb-support__tile neo-spot">
          <span className="wb-support__icon" aria-hidden="true">
            <Phone />
          </span>
          <span className="wb-support__text">
            <b>Talk to someone</b>
            <span>Fully confidential · 24/7</span>
          </span>
        </Link>
        <Link to="/wellbeing/care#circles" className="wb-support__tile neo-spot">
          <span className="wb-support__icon" aria-hidden="true">
            <Users />
          </span>
          <span className="wb-support__text">
            <b>Care circles</b>
            <span>Anonymous peer groups</span>
          </span>
        </Link>
      </div>
    </NeoPanel>
  );
}
