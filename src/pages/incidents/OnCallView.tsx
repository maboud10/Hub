/**
 * On-Call View (`/incidents/oncall`) — Follow-the-Sun global rotation schedule,
 * Shift Swap NeoTracker (Requested → Accepted → Applied), Calendar hold sync,
 * and Responder Pager Fatigue Radar with Aura Wellbeing recovery nudges.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  ArrowLeftRight,
  CalendarDays,
  Check,
  Clock,
  Globe,
  HeartPulse,
  Moon,
  PhoneCall,
  Plus,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Bar, Chip, NeoHome, NeoPanel, NeoTracker, PeoplePicker } from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { DAY, HOUR } from '@/incidents/meta';
import {
  SWAP_STEPS,
  fatigueFor,
  onCallNow as computeOnCallNow,
  pageHours,
  scheduleDays,
  swapCurrent,
} from '@/incidents/oncall';
import { isIncidentLead, useIncidents } from '@/incidents/store';
import { UserPill, relTimeShort } from './parts';

const RESPONDERS = ['u-lucas', 'u-priya', 'u-omar', 'u-ethan', 'u-kwame', 'u-layla'];

export function OnCallView() {
  const me = useSessionUser();
  const now = useNow(30_000);
  const users = useHub((s) => s.users);

  const rotations = useIncidents((s) => s.rotations);
  const overrides = useIncidents((s) => s.overrides);
  const pages = useIncidents((s) => s.pages);
  const requestSwap = useIncidents((s) => s.requestSwap);
  const stepSwap = useIncidents((s) => s.stepSwap);
  const markSwapCalendar = useIncidents((s) => s.markSwapCalendar);

  const slots = useMemo(() => computeOnCallNow(rotations, now, overrides), [rotations, now, overrides]);

  const [swapRotId, setSwapRotId] = useState('rot-platform');
  const [swapFromId, setSwapFromId] = useState(me?.id ?? 'u-lucas');
  const [swapToId, setSwapToId] = useState('u-priya');
  const [swapHours, setSwapHours] = useState(6);
  const [swapReason, setSwapReason] = useState('');

  const lead = isIncidentLead(me);

  const fatigues = useMemo(
    () =>
      RESPONDERS.map((uid) => {
        const u = users.find((x) => x.id === uid);
        const tz = u?.timezone ?? 'UTC';
        return {
          user: u,
          tz,
          fatigue: fatigueFor(pages, uid, tz, now),
          hours: pageHours(pages, uid, tz, now),
        };
      }).sort((a, b) => b.fatigue.score - a.fatigue.score),
    [users, pages, now],
  );

  const onCreateSwap = (e: FormEvent) => {
    e.preventDefault();
    requestSwap({
      rotationId: swapRotId,
      fromUserId: swapFromId,
      toUserId: swapToId,
      start: now + HOUR,
      end: now + (swapHours + 1) * HOUR,
      reason: swapReason.trim() || 'Recovery shift coverage swap',
      requestedBy: me?.id ?? swapFromId,
    });
    setSwapReason('');
  };

  const syncSwapToCalendar = async (ovId: string) => {
    const ov = overrides.find((o) => o.id === ovId);
    if (!ov) return;
    const rot = rotations.find((r) => r.id === ov.rotationId);
    try {
      const { useCalendar } = await import('@/calendar/store');
      useCalendar.getState().createEvent({
        title: `On-Call Coverage · ${rot?.name ?? ov.rotationId}`,
        description: `Covering for colleague (${ov.reason})`,
        category: 'focus',
        dayOffset: 0,
        startHour: 12,
        durationMins: Math.min(360, Math.max(60, Math.round((ov.end - ov.start) / 60_000))),
        attendeeIds: [ov.fromUserId, ov.toUserId],
        linkedContext: { app: 'incidents', label: 'Sentinel On-Call', to: '/incidents/oncall' },
      });
    } catch {
      // ignore if calendar unavailable
    }
    markSwapCalendar(ov.id);
    toast.success('On-call shift added to Helix Calendar');
  };

  const mainCol = (
    <>
      {/* Follow-the-Sun & Weekly Rotations */}
      <NeoPanel
        hud="Global 24/7 responder coverage"
        title="Follow-the-Sun & Service Rotations"
        icon={<Globe />}
      >
        <div className="inc-rotations-stack">
          {rotations.map((rot) => {
            const activeSlot = slots.find((s) => s.rotationId === rot.id);
            const days = scheduleDays(rot, now, 5, overrides);
            return (
              <div key={rot.id} className="inc-rot-card neo-spot">
                <div className="inc-rot-card__head">
                  <div className="inc-rot-card__title">
                    <span className="inc-dot" style={{ background: rot.color }} />
                    <div>
                      <h3>{rot.name}</h3>
                      <div className="inc-muted">
                        <span>{rot.kind === 'follow-the-sun' ? 'Follow-the-sun · 4 hubs (6h shifts)' : 'Weekly primary rotation'}</span>
                        {rot.services.length > 0 && (
                          <>
                            <span> · </span>
                            <span className="neo-mono">{rot.services.join(', ')}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="inc-rot-card__active">
                    <span className="neo-hud">Carrying pager now</span>
                    <UserPill userId={activeSlot?.userId} roleLabel={activeSlot?.shift?.hub} />
                  </div>
                </div>

                {rot.kind === 'follow-the-sun' && rot.shifts && (
                  <div className="inc-fts-strip">
                    {rot.shifts.map((sh) => {
                      const isLive = activeSlot?.shift?.id === sh.id;
                      return (
                        <div key={sh.id} className="inc-fts-cell" data-live={isLive || undefined}>
                          <div className="inc-fts-cell__top">
                            <b>{sh.hub}</b>
                            <span className="neo-mono">
                              {String(sh.startUtc).padStart(2, '0')}:00–{String(sh.endUtc).padStart(2, '0')}:00 UTC
                            </span>
                          </div>
                          <UserPill userId={sh.userId} size={20} />
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="inc-sched-days">
                  {days.map((blocks, dIdx) => {
                    const dayDate = new Date(now + dIdx * DAY).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    });
                    return (
                      <div key={dIdx} className="inc-sched-day">
                        <span className="inc-sched-day__label">{dIdx === 0 ? 'Today' : dayDate}</span>
                        <div className="inc-sched-day__blocks">
                          {blocks.map((b, bIdx) => (
                            <span
                              key={bIdx}
                              className="inc-sched-block"
                              data-overridden={b.overridden || undefined}
                            >
                              <UserPill userId={b.userId} size={18} />
                              {b.overridden && (
                                <Chip tone="cyan" size="sm">
                                  <span>Swapped</span>
                                </Chip>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </NeoPanel>

      {/* Shift Swaps with NeoTracker */}
      <NeoPanel
        hud="Coverage overrides & handoffs"
        title="Shift Swap Tracker"
        icon={<ArrowLeftRight />}
      >
        <div className="inc-swaps-list">
          {overrides.map((ov) => {
            const rot = rotations.find((r) => r.id === ov.rotationId);
            const current = swapCurrent(ov);
            return (
              <div key={ov.id} className="inc-swap-card">
                <NeoTracker
                  bare
                  hud={rot?.name ?? ov.rotationId}
                  title={ov.reason}
                  steps={SWAP_STEPS.map((label, idx) => ({
                    id: label.toLowerCase(),
                    label,
                    sub:
                      idx === 0
                        ? `From ${users.find((u) => u.id === ov.fromUserId)?.name ?? ov.fromUserId}`
                        : idx === 1
                          ? `Covered by ${users.find((u) => u.id === ov.toUserId)?.name ?? ov.toUserId}`
                          : 'Live in pager schedule',
                  }))}
                  current={current}
                  state={ov.state === 'declined' ? 'blocked' : ov.state === 'applied' ? 'done' : 'active'}
                  eta={relTimeShort(ov.requestedAt, now)}
                  actions={
                    <div className="inc-inline-actions">
                      {ov.state === 'requested' && (
                        <button
                          type="button"
                          className="neo-btn neo-btn--plasma neo-btn--xs"
                          onClick={() => stepSwap(ov.id, 'accept', { id: me?.id ?? ov.toUserId, lead })}
                          data-qa={`swap-accept-${ov.id}`}
                        >
                          <Check />
                          <span>Accept Swap</span>
                        </button>
                      )}
                      {ov.state === 'accepted' && (
                        <button
                          type="button"
                          className="neo-btn neo-btn--success neo-btn--xs"
                          onClick={() => stepSwap(ov.id, 'apply', { id: me?.id ?? ov.toUserId, lead })}
                          data-qa={`swap-apply-${ov.id}`}
                        >
                          <ShieldCheck />
                          <span>Apply Override</span>
                        </button>
                      )}
                      {(ov.state === 'requested' || ov.state === 'accepted') && (
                        <button
                          type="button"
                          className="neo-btn neo-btn--ghost neo-btn--xs"
                          onClick={() => stepSwap(ov.id, 'decline', { id: me?.id ?? ov.toUserId, lead })}
                        >
                          <X />
                          <span>Decline</span>
                        </button>
                      )}
                      {!ov.calendarAdded && ov.state !== 'declined' && (
                        <button
                          type="button"
                          className="neo-btn neo-btn--soft neo-btn--xs"
                          onClick={() => syncSwapToCalendar(ov.id)}
                        >
                          <CalendarDays />
                          <span>Add to Calendar</span>
                        </button>
                      )}
                    </div>
                  }
                />
              </div>
            );
          })}
        </div>

        <form className="inc-swap-form" onSubmit={onCreateSwap}>
          <div className="neo-hud">Request a shift swap</div>
          <div className="inc-swap-form__grid">
            <label className="inc-field">
              <span className="inc-field__label">Rotation</span>
              <select className="neo-input neo-input--sm" value={swapRotId} onChange={(e) => setSwapRotId(e.target.value)}>
                {rotations.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="inc-field">
              <span className="inc-field__label">Responder needing cover</span>
              <PeoplePicker
                value={[swapFromId]}
                onChange={(ids) => setSwapFromId(ids[0] ?? 'u-lucas')}
                label="Choose responder"
                trigger={(props) => (
                  <button {...props} type="button" className="neo-btn neo-btn--soft neo-btn--sm">
                    <UserPill userId={swapFromId} size={20} />
                  </button>
                )}
              />
            </div>

            <div className="inc-field">
              <span className="inc-field__label">Covering colleague</span>
              <PeoplePicker
                value={[swapToId]}
                onChange={(ids) => setSwapToId(ids[0] ?? 'u-priya')}
                label="Choose covering colleague"
                trigger={(props) => (
                  <button {...props} type="button" className="neo-btn neo-btn--soft neo-btn--sm">
                    <UserPill userId={swapToId} size={20} />
                  </button>
                )}
              />
            </div>

            <label className="inc-field">
              <span className="inc-field__label">Duration (hours)</span>
              <input
                type="number"
                min={2}
                max={72}
                className="neo-input neo-input--sm"
                value={swapHours}
                onChange={(e) => setSwapHours(Number(e.target.value) || 6)}
              />
            </label>
          </div>
          <div className="inc-scribe-form">
            <input
              type="text"
              className="neo-input neo-input--sm"
              placeholder="Reason for shift swap (e.g. post-incident sleep recovery)…"
              value={swapReason}
              onChange={(e) => setSwapReason(e.target.value)}
            />
            <button type="submit" className="neo-btn neo-btn--plasma neo-btn--sm" data-qa="swap-request-btn">
              <Plus />
              <span>Request Swap</span>
            </button>
          </div>
        </form>
      </NeoPanel>
    </>
  );

  const sideCol = (
    <>
      <NeoPanel
        hud="Aura Wellbeing × Pager Telemetry"
        title="Responder Pager Fatigue Radar"
        icon={<HeartPulse />}
      >
        <div className="inc-fatigue-list">
          {fatigues.map(({ user, tz, fatigue, hours }) => {
            const nightCount = fatigue.nightPages;
            const tone = fatigue.level === 'high' ? 'danger' : fatigue.level === 'elevated' ? 'warning' : 'success';
            return (
              <div key={fatigue.userId} className="inc-fatigue-card" data-level={fatigue.level}>
                <div className="inc-fatigue-card__head">
                  <UserPill userId={fatigue.userId} roleLabel={tz.split('/')[1]} />
                  <Chip tone={tone} size="sm" icon={nightCount > 0 ? <Moon /> : <Clock />}>
                    <span>{fatigue.pagesThisWeek} pages</span>
                    <span>·</span>
                    <span>{nightCount} night</span>
                  </Chip>
                </div>
                <Bar
                  value={fatigue.score / 100}
                  fill={fatigue.level === 'high' ? '#ef4444' : fatigue.level === 'elevated' ? '#f59e0b' : '#22c55e'}
                  label={`${user?.name ?? fatigue.userId} fatigue score`}
                />
                <div className="inc-hour-heat" title="24h local-time page distribution (22:00–07:00 shaded)">
                  {hours.map((cnt, hr) => {
                    const isNight = hr >= 22 || hr < 7;
                    return (
                      <i
                        key={hr}
                        className="inc-hour-bar"
                        data-night={isNight || undefined}
                        data-active={cnt > 0 || undefined}
                        style={{ height: `${Math.max(4, Math.min(22, cnt * 8 + 4))}px` }}
                      />
                    );
                  })}
                </div>
                {fatigue.level !== 'ok' && (
                  <div className="inc-fatigue-nudge">
                    <span className="inc-muted">Aura recovery nudge:</span>
                    <div className="inc-inline-actions">
                      <Link to="/wellbeing/breathe?pattern=box&mins=2" className="neo-btn neo-btn--soft neo-btn--xs">
                        <HeartPulse />
                        <span>Breather</span>
                      </Link>
                      <Link to="/wellbeing/rhythm#quiet" className="neo-btn neo-btn--ghost neo-btn--xs">
                        <Moon />
                        <span>Quiet Hours</span>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </NeoPanel>

      <NeoPanel hud="Escalation policy" title="SLA & Handoff Rules" icon={<PhoneCall />}>
        <ul className="inc-policy-list">
          <li>
            <b>SEV1 / SEV2:</b> Pages primary service rotation + Incident Commander simultaneously; auto-escalates after 5m.
          </li>
          <li>
            <b>Night-Page Protection:</b> Responders with ≥2 local-night pages (22:00–07:00) receive an automatic Aura recovery swap recommendation.
          </li>
          <li>
            <b>Follow-the-Sun Handoff:</b> Live War Rooms transfer scribe & ops roles at 00:00, 06:00, 12:00, and 18:00 UTC.
          </li>
        </ul>
      </NeoPanel>
    </>
  );

  return <NeoHome main={mainCol} side={sideCol} sideLabel="Pager fatigue & escalation policy" />;
}
