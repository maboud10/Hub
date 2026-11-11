/**
 * Helix Wellbeing — Rhythm: Sustainable Pace Index + 6-signal burnout radar
 * from real Calendar, Focus Engine, HR Portal and Mail data, right-to-
 * disconnect quiet hours (served to Mail via the bridge) and — for people
 * leaders — an anonymised team heatmap that only unlocks at k ≥ 5.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { BellOff, CalendarPlus, Clapperboard, Clock, Gauge, Lock, Mail, Moon, ShieldCheck, Users } from 'lucide-react';
import { Chip, CountUp, NeoHome, NeoPanel, NeoTabs } from '@/components/neo';
import { useHub } from '@/store/hub';
import { usePermissions } from '@/store/selectors';
import { toast } from '@/store/toast';
import { useNow } from '@/hooks/useNow';
import { cx } from '@/lib/cx';
import {
  K_ANON,
  SIGNAL_META,
  SIGNAL_ORDER,
  afterHoursEvents,
  daysSinceLastLeave,
  formatHour,
  isMine,
  isQuietAt,
  managerScope,
  meetingStats,
  paceBand,
  paceIndex,
  quietSpanHours,
  radarSignals,
  signalRisk,
  syntheticRisk,
  teamHeatmap,
  type RadarSignal,
} from '@/wellbeing/engine';
import { isoDay, startOfDay } from '@/wellbeing/seed';
import { useWellbeing } from '@/wellbeing/store';
import type { CalEventLite, HoldPolicy, SignalId, SignalLevel } from '@/wellbeing/types';
import { PrivateChip, RadioPills, Switch, U, localValue, useCalendarEvents, useHrSnapshot, useLocale, useMailRhythm, useMe } from './parts';

const DAY = 86_400_000;
const LEVEL_LABEL: Record<SignalLevel, string> = { ok: 'Healthy', watch: 'Elevated', high: 'High risk' };
const LEVEL_TONE: Record<SignalLevel, 'success' | 'warning' | 'danger'> = { ok: 'success', watch: 'warning', high: 'danger' };
const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** Monday..Sunday day offsets of the current week. */
function weekWindow(now: number): [number, number] {
  const d = new Date(now).getDay();
  const mon = d === 0 ? -6 : 1 - d;
  return [mon, mon + 6];
}

/** Average meeting hours on days that have meetings this week (0 when none). */
function meetingDensity(events: CalEventLite[], userId: string, now: number): number {
  const [from, to] = weekWindow(now);
  const days: number[] = [];
  for (let o = from; o <= to; o += 1) {
    const h = meetingStats(events, userId, o).hours;
    if (h > 0) days.push(h);
  }
  return days.length ? days.reduce((a, b) => a + b, 0) / days.length : 0;
}

/** Monday of the week `ago` weeks back, e.g. "26 Oct" (month names are translated by the shell). */
function weekStartLabel(now: number, ago: number): string {
  const [mon] = weekWindow(now);
  return new Date(startOfDay(now) + (mon - ago * 7) * DAY + 12 * 3_600_000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function RhythmView() {
  const { me, uid, data } = useMe();
  const events = useCalendarEvents();
  const hr = useHrSnapshot(me?.location);
  const mail = useMailRhythm();
  const now = useNow(60_000);
  const locale = useLocale();
  const { hash } = useLocation();

  useEffect(() => {
    if (hash === '#quiet') window.setTimeout(() => document.getElementById('quiet')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, [hash]);

  const today = isoDay(now);
  const [from, to] = weekWindow(now);
  const focusHoursWeek =
    events.filter((e) => e.category === 'focus' && isMine(e, uid) && e.dayOffset >= from && e.dayOffset <= to).reduce((s, e) => s + e.durationMins / 60, 0) +
    data.focusSprints.filter((f) => f.at >= startOfDay(now) - 6 * DAY).reduce((s, f) => s + f.minutes / 60, 0);
  const daysSinceLeave = (hr.ready ? daysSinceLastLeave(hr.leave, uid, today) : null) ?? data.lastLeaveDaysAgo;

  const signals = radarSignals({
    afterHoursEmails: mail.afterHoursSentThisWeek,
    afterHoursEvents: afterHoursEvents(events, uid, data.quiet, now),
    meetingHoursPerDay: meetingDensity(events, uid, now),
    focusHoursWeek,
    weekendSessions: data.weekendSessions,
    daysSinceLeave,
    unread: mail.unread,
    avgReplyMins: mail.avgReplyMins,
  });
  const pace = paceIndex(signals);
  const source: Record<SignalId, string> = {
    afterHours: mail.live ? 'Mail + Calendar' : 'Calendar',
    meetings: 'Calendar',
    focus: 'Calendar + Focus Engine',
    weekend: 'Synced activity',
    leave: hr.ready ? 'HR Portal' : 'Estimate',
    inbox: 'Mail',
  };

  return (
    <div className="wb-view">
      <NeoHome
        main={
          <>
            <div className="wb-rhythm-top">
              <NeoPanel className="wb-pace-panel" hud="Sustainable Pace Index" title="Your pace" actions={<PrivateChip compact />}>
                <PaceGauge value={pace} />
                <p className="wb-pace__note">{pace >= 70 ? 'You’re working at a pace you can keep. Protect it.' : pace >= 50 ? 'Stretched. One or two signals need attention this week.' : 'Running hot. Time to recover before it costs you.'}</p>
              </NeoPanel>
              <NeoPanel className="wb-radar-panel" hud="Burnout radar · 6 signals" title="What’s driving it">
                <Radar signals={signals} />
              </NeoPanel>
            </div>

            <NeoPanel hud="Signals" title="Explained, with sources" actions={!mail.live && mail.ready ? <Chip tone="slate" size="sm" icon={<Mail />}>Mail signals appear once Mail syncs</Chip> : undefined}>
              <ul className="wb-signals">
                {signals.map((s) => (
                  <li key={s.id} className="wb-signal" data-level={s.level}>
                    <div className="wb-signal__main">
                      <b className="wb-signal__label">{s.label}</b>
                      <span className="wb-signal__tip">{s.tip}</span>
                    </div>
                    <span className="wb-signal__value neo-mono">{localValue(s.value, locale)}</span>
                    <span className="wb-signal__bar" aria-hidden="true">
                      <i style={{ width: `${Math.max(3, s.risk)}%` }} />
                    </span>
                    <Chip size="sm" tone={LEVEL_TONE[s.level]}>
                      {LEVEL_LABEL[s.level]}
                    </Chip>
                    <span className="wb-signal__src">{source[s.id]}</span>
                  </li>
                ))}
              </ul>
            </NeoPanel>

            <TeamPanel uid={uid} events={events} now={now} />
          </>
        }
        side={<QuietPanel uid={uid} now={now} mailReady={mail.ready} />}
        sideLabel="Quiet hours"
      />
    </div>
  );
}

/* ───────────────────────── gauge & radar ───────────────────────── */

function PaceGauge({ value }: { value: number }) {
  const angle = -90 + (value / 100) * 180;
  return (
    <div className="wb-gauge" data-band={value >= 70 ? 'ok' : value >= 50 ? 'watch' : 'high'}>
      <svg className="wb-gauge__svg" viewBox="0 0 200 116" role="img" aria-label={`Sustainable Pace Index · ${value}`}>
        <defs>
          <linearGradient id="wb-gauge-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fb7185" />
            <stop offset="50%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
        </defs>
        <path className="wb-gauge__track" d="M 20 100 A 80 80 0 0 1 180 100" pathLength={100} />
        <path className="wb-gauge__value" d="M 20 100 A 80 80 0 0 1 180 100" pathLength={100} style={{ strokeDashoffset: 100 - value }} />
        <g className="wb-gauge__needle" style={{ transform: `rotate(${angle}deg)` }}>
          <line x1="100" y1="100" x2="100" y2="34" />
          <circle cx="100" cy="100" r="6" />
        </g>
      </svg>
      <div className="wb-gauge__readout">
        <span className="wb-gauge__num">
          <CountUp value={value} />
        </span>
        <span className="wb-gauge__band">{paceBand(value)}</span>
      </div>
    </div>
  );
}

function Radar({ signals }: { signals: RadarSignal[] }) {
  const n = signals.length;
  const pt = (i: number, r: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [100 + Math.cos(a) * r, 100 + Math.sin(a) * r] as const;
  };
  const ring = (r: number) => signals.map((_, i) => pt(i, r).join(',')).join(' ');
  const poly = signals.map((s, i) => pt(i, 18 + (s.risk / 100) * 62).join(',')).join(' ');
  return (
    <div className="wb-radar">
      <svg className="wb-radar__svg" viewBox="0 0 200 200" role="img" aria-label="Burnout radar">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <polygon key={f} className="wb-radar__ring" points={ring(18 + f * 62)} />
        ))}
        {signals.map((s, i) => {
          const [x, y] = pt(i, 80);
          return <line key={s.id} className="wb-radar__axis" x1={100} y1={100} x2={x} y2={y} />;
        })}
        <polygon className="wb-radar__shape" points={poly} />
        {signals.map((s, i) => {
          const [x, y] = pt(i, 18 + (s.risk / 100) * 62);
          return <circle key={s.id} className="wb-radar__dot" data-level={s.level} cx={x} cy={y} r={4} />;
        })}
      </svg>
      {signals.map((s, i) => {
        const [x, y] = pt(i, 96);
        return (
          <span key={s.id} className="wb-radar__label" data-level={s.level} style={{ insetInlineStart: `${x / 2}%`, top: `${y / 2}%` }}>
            <span>{SIGNAL_META[s.id].label}</span>
            <b>{s.risk}</b>
          </span>
        );
      })}
    </div>
  );
}

/* ───────────────────────── quiet hours ───────────────────────── */

function QuietPanel({ uid, now, mailReady }: { uid: string; now: number; mailReady: boolean }) {
  const q = useWellbeing((s) => s.users[uid]?.quiet);
  const setQuietHours = useWellbeing((s) => s.setQuietHours);
  const quiet = q ?? { enabled: true, startHour: 19, endHour: 8, weekendsOff: true, holdPolicy: 'hold' as HoldPolicy };
  const quietNow = isQuietAt(quiet, new Date(now));
  const nowHour = new Date(now).getHours();
  const inWindow = (h: number) => (quiet.startHour > quiet.endHour ? h >= quiet.startHour || h < quiet.endHour : h >= quiet.startHour && h < quiet.endHour);
  const set = (patch: Partial<typeof quiet>) => setQuietHours(uid, patch);

  return (
    <NeoPanel id="quiet" className="wb-quiet" hud="Right to disconnect" title="Quiet hours" icon={<Moon />}>
      <Switch checked={quiet.enabled} onChange={(v) => set({ enabled: v })} label="Quiet hours">
        <b>Quiet hours</b>
        <span>Hold work notifications and schedule-send outside your hours.</span>
      </Switch>

      <div className={cx('wb-quiet__body', !quiet.enabled && 'is-off')}>
        <div className="wb-quiet__times">
          <label className="neo-field">
            <span className="neo-label">Starts</span>
            <select className="neo-select neo-select--sm" value={quiet.startHour} disabled={!quiet.enabled} onChange={(e) => set({ startHour: Number(e.target.value) })}>
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {formatHour(h)}
                </option>
              ))}
            </select>
          </label>
          <label className="neo-field">
            <span className="neo-label">Ends</span>
            <select className="neo-select neo-select--sm" value={quiet.endHour} disabled={!quiet.enabled} onChange={(e) => set({ endHour: Number(e.target.value) })}>
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {formatHour(h)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="wb-quiet__clock" role="img" aria-label="Quiet hours across the day">
          {HOURS.map((h) => (
            <i key={h} data-quiet={quiet.enabled && inWindow(h) ? 'true' : undefined} data-now={h === nowHour ? 'true' : undefined} />
          ))}
        </div>
        <div className="wb-quiet__scale" aria-hidden="true">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>23:00</span>
        </div>

        <Switch checked={quiet.weekendsOff} onChange={(v) => set({ weekendsOff: v })} label="Weekends off">
          <b>Weekends off</b>
          <span>Saturday and Sunday are quiet all day.</span>
        </Switch>

        <div className="wb-quiet__policy">
          <span className="neo-label">When someone messages you in quiet hours</span>
          <RadioPills
            label="Hold policy"
            variant="tile"
            value={quiet.holdPolicy}
            onChange={(v) => set({ holdPolicy: v })}
            options={[
              { value: 'hold', label: 'Hold until morning', icon: <BellOff /> },
              { value: 'digest', label: 'Morning digest', icon: <Clock /> },
              { value: 'urgent', label: 'Let urgent through', icon: <ShieldCheck /> },
            ]}
          />
        </div>
      </div>

      <p className={cx('wb-quiet__status', quietNow && 'is-quiet')} aria-live="polite">
        <Moon aria-hidden="true" />
        <span>{!quiet.enabled ? 'Quiet hours are off' : quietNow ? 'Quiet hours are on right now' : 'You’re in working hours'}</span>
        {quiet.enabled && (
          <>
            <span>·</span>{' '}
            <b>
              {quietSpanHours(quiet)}
              <U u="h" />
            </b>{' '}
            <span>quiet window</span>
          </>
        )}
      </p>
      <p className="wb-quiet__mail">
        <Mail aria-hidden="true" />
        <span>{mailReady ? 'Helix Mail’s schedule-send honours these hours.' : 'Helix Mail will honour these hours for schedule-send.'}</span>
      </p>
    </NeoPanel>
  );
}

/* ───────────────────────── manager view (k-anonymous) ───────────────────────── */

function TeamPanel({ uid, events, now }: { uid: string; events: CalEventLite[]; now: number }) {
  const users = useHub((s) => s.users);
  const perms = usePermissions();
  const navigate = useNavigate();
  const scope = useMemo(() => managerScope(uid, perms, users), [uid, perms, users]);
  const isAdmin = perms.has('*');
  const [view, setView] = useState<'team' | 'org'>(scope.kind === 'org' ? 'org' : 'team');
  const orgIds = useMemo(() => users.filter((u) => u.active && u.id !== uid).map((u) => u.id), [users, uid]);
  const memberIds = view === 'org' ? orgIds : scope.memberIds;

  const heat = useMemo(() => {
    // This week's meeting signal blends each person's real Calendar density with their baseline.
    const valueFor = (m: string, w: number, s: SignalId) => {
      const base = syntheticRisk(m, w, s);
      if (w !== 0 || s !== 'meetings') return base;
      const real = signalRisk('meetings', { afterHoursEmails: 0, afterHoursEvents: 0, meetingHoursPerDay: meetingDensity(events, m, now), focusHoursWeek: 0, weekendSessions: 0, daysSinceLeave: null, unread: 0, avgReplyMins: 0 });
      return Math.round((base + real) / 2);
    };
    return teamHeatmap(memberIds, 6, valueFor);
  }, [memberIds, events, now]);

  if (scope.kind === 'none') return null;

  const current = heat?.weeks[heat.weeks.length - 1];
  const rituals: { id: string; title: string; why: string; cta: string; icon: ReactNode; run: () => void }[] = [];
  if (current) {
    const add = (cond: boolean, r: (typeof rituals)[number]) => cond && rituals.push(r);
    add(current.cells.meetings >= 40 || rituals.length === 0, {
      id: 'nmw',
      title: 'No-meeting Wednesday',
      why: 'Meeting density is one of the team’s top signals. Give everyone one maker day a week.',
      cta: 'Block next Wednesday',
      icon: <CalendarPlus />,
      run: async () => {
        try {
          const { useCalendar } = await import('@/calendar/store');
          const dow = new Date(now).getDay();
          const offset = ((3 - dow + 7) % 7) || 7;
          useCalendar.getState().createEvent({
            title: 'No-meeting Wednesday · Team focus day',
            description: 'A team ritual suggested by Helix Wellbeing (anonymised team signals). Async updates only.',
            category: 'focus',
            dayOffset: offset,
            startHour: 9,
            durationMins: 480,
            organizerId: uid,
            attendeeIds: [uid, ...scope.memberIds],
            roomName: 'Everywhere · async day',
            linkedContext: { app: 'wellbeing', label: 'Team rituals', to: '/wellbeing/rhythm' },
            agendaBullets: ['No recurring meetings', 'Async updates via Meet clips', 'Deep work by default'],
          });
        } catch {
          toast.error('Calendar is unavailable', 'Try again in a moment.');
        }
      },
    });
    add(current.cells.focus >= 40, {
      id: 'async',
      title: 'Async stand-ups via Meet clips',
      why: 'Focus time is squeezed. Swap the daily stand-up for three-minute clips.',
      cta: 'Open Meet clips',
      icon: <Clapperboard />,
      run: () => navigate('/meet/clips'),
    });
    add(current.cells.afterHours >= 35, {
      id: 'quiet',
      title: 'Model quiet hours',
      why: 'After-hours activity is climbing. Teams copy what their lead does after 19:00.',
      cta: 'Set my quiet hours',
      icon: <Moon />,
      run: () => document.getElementById('quiet')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    });
    add(current.cells.leave >= 45, {
      id: 'leave',
      title: 'Nudge the team to plan time off',
      why: 'Time since leave is high across the team. Encourage everyone to book a break.',
      cta: 'Open Time off',
      icon: <CalendarPlus />,
      run: () => navigate('/hr/time-off'),
    });
    if (rituals.length < 2)
      rituals.push({ id: 'async', title: 'Async stand-ups via Meet clips', why: 'Three-minute clips beat a daily call across time zones.', cta: 'Open Meet clips', icon: <Clapperboard />, run: () => navigate('/meet/clips') });
  }

  return (
    <NeoPanel
      className="wb-team-panel"
      hud="People leaders · anonymised"
      title="Team rhythm"
      icon={<Users />}
      actions={
        isAdmin && scope.kind === 'team' ? (
          <NeoTabs
            label="Scope"
            value={view}
            onChange={setView}
            items={[
              { value: 'team', label: 'My team' },
              { value: 'org', label: 'Organisation' },
            ]}
          />
        ) : undefined
      }
    >
      {!heat ? (
        <div className="wb-kanon">
          <span className="wb-kanon__icon" aria-hidden="true">
            <Lock />
          </span>
          <div>
            <h3>Below the privacy threshold</h3>
            <p>
              <span>Your team has</span> <b>{memberIds.length}</b> <span>people. Aggregates unlock at</span> <b>{K_ANON}</b> <span>so nobody can be singled out.</span>
            </p>
          </div>
        </div>
      ) : (
        <>
          <p className="wb-kanon__note">
            <ShieldCheck aria-hidden="true" />
            <span>Averages of</span> <b>{heat.n}</b> <span>people, rounded to 5 (k ≥ 5). Individual data is never shown to managers, and Care is never included.</span>
          </p>
          <div className="wb-heat" role="table" aria-label="Team signals by week">
            <div className="wb-heat__row wb-heat__row--head" role="row">
              <span role="columnheader" className="wb-heat__rowlabel">
                <Gauge aria-hidden="true" />
              </span>
              {heat.weeks.map((w) => (
                <span key={w.label} role="columnheader" className="wb-heat__week">
                  {w.ago === 0 ? 'This week' : weekStartLabel(now, w.ago)}
                </span>
              ))}
            </div>
            {SIGNAL_ORDER.map((s) => (
              <div key={s} className="wb-heat__row" role="row">
                <span role="rowheader" className="wb-heat__rowlabel">
                  {SIGNAL_META[s].label}
                </span>
                {heat.weeks.map((w) => (
                  <span key={w.label} role="cell" className="wb-heat__cell" style={{ '--r': w.cells[s] } as CSSProperties} data-level={w.cells[s] >= 70 ? 'high' : w.cells[s] >= 40 ? 'watch' : 'ok'}>
                    {w.cells[s]}
                  </span>
                ))}
              </div>
            ))}
            <div className="wb-heat__row wb-heat__row--pace" role="row">
              <span role="rowheader" className="wb-heat__rowlabel">
                Team pace
              </span>
              {heat.weeks.map((w) => (
                <span key={w.label} role="cell" className="wb-heat__pace">
                  {w.pace}
                </span>
              ))}
            </div>
          </div>
          <div className="wb-rituals">
            <div className="neo-hud">Team rituals</div>
            {rituals.slice(0, 3).map((r) => (
              <article key={r.id} className="wb-ritual neo-spot">
                <span className="wb-ritual__icon" aria-hidden="true">
                  {r.icon}
                </span>
                <div className="wb-ritual__text">
                  <h3>{r.title}</h3>
                  <p>{r.why}</p>
                </div>
                <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={() => void r.run()}>
                  {r.cta}
                </button>
              </article>
            ))}
          </div>
          <p className="wb-muted wb-team__foot">
            <span>Want to talk it through?</span> <Link to="/performance/one-on-ones">Plan it in your next 1:1s</Link>
          </p>
        </>
      )}
    </NeoPanel>
  );
}
