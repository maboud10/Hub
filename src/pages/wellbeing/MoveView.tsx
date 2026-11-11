/**
 * Helix Wellbeing — Move: the Helix Hub Cup (Dubai vs London vs Singapore vs
 * New York vs Remote) as a glowing race track with milestone tracker, personal
 * step goal + weekly chart, quick activity logging, walk-and-talk conversion
 * of calendar 1:1s and an opt-in "share a win" to Pulse Chat.
 */
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { Activity, Bike, CalendarDays, Check, Flag, Footprints, Minus, Mountain, Plus, Send, Share2, Trophy, Waves, Flower2, MapPin, type LucideIcon } from 'lucide-react';
import { Avatars, Chip, CountUp, NeoHome, NeoKpi, NeoKpis, NeoPanel, NeoTracker, Ring } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { useNow } from '@/hooks/useNow';
import { cx } from '@/lib/cx';
import type { BridgeChannel } from '@/lib/appBridge';
import { activitySteps, formatHour, isMine, stepsOn, stepsToKm, teamOf, teamStandings, weekSteps } from '@/wellbeing/engine';
import { ACTIVITY_KINDS, MILESTONES, TEAM_BY_ID, isoDay } from '@/wellbeing/seed';
import { useWellbeing } from '@/wellbeing/store';
import type { ActivityKind } from '@/wellbeing/types';
import { RadioPills, arLabel, convertToWalk, loadChannels, say, shareToChat, useCalendarEvents, useLocale, useMe } from './parts';

const DAY = 86_400_000;

const KIND_ICON: Record<ActivityKind, LucideIcon> = {
  walk: Footprints,
  run: Activity,
  cycle: Bike,
  yoga: Flower2,
  swim: Waves,
};

const dayLabel = (offset: number) => {
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  return new Date(Date.now() + offset * DAY).toLocaleDateString('en-US', { weekday: 'short' });
};

export function MoveView() {
  const { me, uid, data } = useMe();
  const users = useHub((s) => s.users);
  const challenge = useWellbeing((s) => s.challenge);
  const everyone = useWellbeing((s) => s.users);
  const now = useNow(60_000);
  const { hash } = useLocation();

  const teamId = teamOf(me?.location);
  const team = TEAM_BY_ID[teamId];
  const standings = useMemo(() => teamStandings(challenge, everyone), [challenge, everyone]);
  const mine = standings.find((t) => t.id === teamId) ?? standings[0];
  const daysLeft = Math.max(0, Math.ceil((challenge.endsAt - now) / DAY));
  const today = isoDay(now);
  const stepsToday = stepsOn(data, today, now);
  const week = useMemo(() => weekSteps(data, now), [data, now]);
  const weekTotal = week.reduce((s, d) => s + d.steps, 0);

  useEffect(() => {
    if (hash === '#log') window.setTimeout(() => document.getElementById('log')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  }, [hash]);

  const membersOf = (id: string) => users.filter((u) => u.active && teamOf(u.location) === id);

  // Milestone tracker for my hub.
  const reached = mine.milestones;
  const prevPct = reached > 0 ? MILESTONES[reached - 1].pct : 0;
  const next = MILESTONES[Math.min(reached, MILESTONES.length - 1)];
  const progress = reached >= MILESTONES.length ? 1 : (mine.pct - prevPct) / Math.max(0.0001, next.pct - prevPct);
  const kmToNext = Math.max(0, Math.round(next.pct * challenge.goalKm - mine.km));

  return (
    <div className="wb-view">
      <NeoKpis label="Movement at a glance">
        <NeoKpi
          label="Steps today"
          icon={<Footprints />}
          value={<CountUp value={stepsToday} />}
          sub={
            <>
              <span>Goal</span> <b>{data.stepGoal.toLocaleString()}</b>
            </>
          }
        />
        <NeoKpi label="This week" icon={<CalendarDays />} value={weekTotal.toLocaleString()} sub="Steps, last 7 days" />
        <NeoKpi
          label="Hub rank"
          icon={<Trophy />}
          value={`#${mine.rank}`}
          sub={
            <>
              <span>Team</span> <b>{team.label}</b>
            </>
          }
        />
        <NeoKpi label="Days left" icon={<Flag />} value={daysLeft} sub={challenge.name} />
      </NeoKpis>

      <NeoHome
        main={
          <>
            <NeoPanel className="wb-race-panel" hud="Helix Hub Cup · live" title="Silk Road Relay" actions={
                <Chip tone="app" size="sm" icon={<MapPin />}>
                  <b>{challenge.goalKm.toLocaleString()}</b> <span>km</span>
                </Chip>
              }
            >
              <ol className="wb-race" aria-label="Hub standings">
                {[...standings]
                  .sort((a, b) => a.rank - b.rank)
                  .map((t) => {
                    const members = membersOf(t.id);
                    const p = Math.min(1, t.pct);
                    return (
                      <li key={t.id} className={cx('wb-lane', t.id === teamId && 'is-mine')} style={{ '--p': p.toFixed(4), '--hue': TEAM_BY_ID[t.id].hue } as CSSProperties}>
                        <div className="wb-lane__head">
                          <span className="wb-lane__rank">#{t.rank}</span>
                          <b className="wb-lane__name">{TEAM_BY_ID[t.id].label}</b>
                          {t.id === teamId && (
                            <Chip tone="app" size="sm">
                              Your hub
                            </Chip>
                          )}
                          <span className="wb-lane__meta">
                            <b>{Math.round(t.km).toLocaleString()}</b> <span>km</span> <span>·</span> <b>{t.participants}</b> <span>people</span>
                          </span>
                        </div>
                        <div className="wb-lane__track" role="progressbar" aria-label={TEAM_BY_ID[t.id].label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)}>
                          <span className="wb-lane__trail" />
                          {MILESTONES.map((m) => (
                            <i key={m.label} className="wb-lane__tick" data-reached={t.pct >= m.pct || undefined} style={{ insetInlineStart: `${m.pct * 100}%` }} title={m.label} />
                          ))}
                          <span className="wb-lane__runner">
                            {members.length ? <Avatars users={members} max={3} size={20} /> : <Footprints aria-hidden="true" />}
                          </span>
                        </div>
                      </li>
                    );
                  })}
              </ol>
              <ul className="wb-race__legend">
                {MILESTONES.map((m) => (
                  <li key={m.label}>
                    <Mountain aria-hidden="true" />
                    <span>{m.label}</span>
                    <b>
                      {Math.round(m.pct * challenge.goalKm).toLocaleString()} <span>km</span>
                    </b>
                  </li>
                ))}
              </ul>
            </NeoPanel>

            <NeoTracker
              className="wb-journey"
              hud="Team journey"
              title={
                <>
                  <span>Team</span> <span>{team.label}</span>
                </>
              }
              label="Team journey"
              steps={MILESTONES.map((m) => ({
                label: m.label,
                sub: (
                  <>
                    {Math.round(m.pct * challenge.goalKm).toLocaleString()} <span>km</span>
                  </>
                ),
              }))}
              current={reached}
              progress={progress}
              eta={
                <>
                  <b>{daysLeft}</b> <span>days left</span>
                </>
              }
              message={
                reached >= MILESTONES.length ? (
                  <span>Route complete. Every extra kilometre is a victory lap.</span>
                ) : (
                  <>
                    <span>Next milestone</span> <b>{next.label}</b> <span>·</span> <b>{kmToNext.toLocaleString()}</b> <span>km</span> <span>to go</span>
                  </>
                )
              }
            />

            <WalkTalkPanel uid={uid} route={team.route} routeKm={team.routeKm} />
          </>
        }
        side={
          <>
            <GoalPanel uid={uid} stepsToday={stepsToday} goal={data.stepGoal} week={week} />
            <LogPanel uid={uid} teamLabel={team.label} />
            <SharePanel teamLabel={team.label} pct={Math.round(mine.pct * 100)} rank={mine.rank} />
          </>
        }
        sideLabel="Your movement"
      />
    </div>
  );
}

/* ───────────────────────── personal goal ───────────────────────── */

function GoalPanel({ uid, stepsToday, goal, week }: { uid: string; stepsToday: number; goal: number; week: { date: string; label: string; steps: number; today: boolean }[] }) {
  const setStepGoal = useWellbeing((s) => s.setStepGoal);
  const max = Math.max(goal, ...week.map((d) => d.steps)) * 1.08;
  return (
    <NeoPanel hud="Personal goal" title="Steps">
      <div className="wb-goal">
        <Ring value={stepsToday / goal} size={124} stroke={10} label="Steps today against goal">
          <span className="wb-goal__num">
            <CountUp value={stepsToday} />
          </span>
        </Ring>
        <div className="wb-goal__side">
          <span className="neo-hud">Daily goal</span>
          <div className="wb-goal__stepper">
            <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label="Lower daily goal" onClick={() => setStepGoal(uid, goal - 500)}>
              <Minus />
            </button>
            <b>{goal.toLocaleString()}</b>
            <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label="Raise daily goal" onClick={() => setStepGoal(uid, goal + 500)}>
              <Plus />
            </button>
          </div>
          <span className="wb-muted">
            {stepsToday >= goal ? (
              <span>Goal reached today</span>
            ) : (
              <>
                <b>{(goal - stepsToday).toLocaleString()}</b> <span>to go</span>
              </>
            )}
          </span>
        </div>
      </div>
      <div className="wb-weekbars" role="img" aria-label="Steps over the last 7 days">
        <i className="wb-weekbars__goal" style={{ bottom: `${(goal / max) * 100}%` }} />
        {week.map((d) => (
          <div key={d.date} className={cx('wb-weekbars__col', d.today && 'is-today', d.steps >= goal && 'is-hit')}>
            <span className="wb-weekbars__bar" style={{ height: `${Math.max(3, (d.steps / max) * 100)}%` }} title={d.steps.toLocaleString()} />
            <span className="wb-weekbars__day">{d.label}</span>
          </div>
        ))}
      </div>
    </NeoPanel>
  );
}

/* ───────────────────────── log activity ───────────────────────── */

function LogPanel({ uid, teamLabel }: { uid: string; teamLabel: string }) {
  const logActivity = useWellbeing((s) => s.logActivity);
  const [kind, setKind] = useState<ActivityKind>('walk');
  const [minutes, setMinutes] = useState(30);
  const steps = activitySteps(kind, minutes);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const log = logActivity(uid, { kind, minutes });
    if (log) {
      const n = log.steps.toLocaleString();
      toast.success('Activity logged', say(`+${n} steps for Team ${teamLabel}`, `+${n} خطوة لفريق ${arLabel(teamLabel)}`));
    }
  };

  return (
    <NeoPanel id="log" hud="Quick log" title="Log an activity">
      <form className="wb-log" onSubmit={submit}>
        <RadioPills
          label="Activity"
          variant="tile"
          className="wb-log__kinds"
          value={kind}
          onChange={setKind}
          options={ACTIVITY_KINDS.map((a) => {
            const Icon = KIND_ICON[a.id];
            return { value: a.id, label: a.label, icon: <Icon /> };
          })}
        />
        <RadioPills
          label="Minutes"
          value={minutes}
          onChange={setMinutes}
          options={[10, 20, 30, 45, 60].map((m) => ({
            value: m,
            label: (
              <>
                <b>{m}</b> <span>min</span>
              </>
            ),
          }))}
        />
        <p className="wb-log__preview">
          <b>+{steps.toLocaleString()}</b> <span>steps</span> <span>·</span> <b>{stepsToKm(steps)}</b> <span>km</span> <span>for Team</span> <b>{teamLabel}</b>
        </p>
        <button type="submit" className="neo-btn neo-btn--plasma neo-btn--block">
          <Plus />
          <span>Log activity</span>
        </button>
      </form>
    </NeoPanel>
  );
}

/* ───────────────────────── share a win ───────────────────────── */

function SharePanel({ teamLabel, pct, rank }: { teamLabel: string; pct: number; rank: number }) {
  const [channels, setChannels] = useState<BridgeChannel[]>([]);
  const [channelId, setChannelId] = useState('');
  const [text, setText] = useState('');
  const [sent, setSent] = useState<{ to: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadChannels().then((list) => {
      if (!alive) return;
      setChannels(list);
      const pick = ['watercooler', 'celebrations', 'general'].map((n) => list.find((c) => c.name === n)).find(Boolean) ?? list[0];
      if (pick) setChannelId(pick.id);
    });
    return () => {
      alive = false;
    };
  }, []);

  const locale = useLocale();
  useEffect(() => {
    setText(
      say(
        `🏃 Team ${teamLabel} is ${pct}% along the Silk Road in the Helix Hub Cup (rank #${rank}). Who’s joining me for a walk this week?`,
        `🏃 فريق ${arLabel(teamLabel)} قطع ${pct}% من طريق الحرير في كأس Helix Hub (المركز #${rank}). من ينضم إليّ في نزهة مشي هذا الأسبوع؟`,
      ),
    );
  }, [teamLabel, pct, rank, locale]);

  const share = async () => {
    if (!channelId || text.trim().length < 3) return;
    setBusy(true);
    const res = await shareToChat(channelId, text.trim(), { app: 'wellbeing', title: `Helix Hub Cup · ${teamLabel}`, subtitle: `🏁 ${pct}% · #${rank}`, to: '/wellbeing/move', status: 'Small win' });
    setBusy(false);
    if (res.ok) {
      const name = channels.find((c) => c.id === channelId)?.name ?? 'channel';
      setSent({ to: res.to, name });
      toast.success('Shared to Pulse Chat', `#${name}`);
    } else toast.error('Couldn’t share', res.error);
  };

  return (
    <NeoPanel hud="Pulse Chat" title="Share a win" actions={<Chip tone="slate" size="sm">Opt-in</Chip>}>
      {channels.length === 0 ? (
        <p className="wb-muted">Pulse Chat channels will appear here when you have access.</p>
      ) : (
        <div className="wb-share">
          <label className="neo-field">
            <span className="neo-label">Channel</span>
            <select className="neo-select neo-select--sm" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="neo-field">
            <span className="neo-label">Message</span>
            <textarea className="neo-textarea wb-share__text" rows={3} value={text} maxLength={400} onChange={(e) => setText(e.target.value)} />
          </label>
          <p className="wb-muted wb-share__note">Only what you write here is shared. Your aura, steps history and check-ins stay private.</p>
          <div className="wb-share__row">
            <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" disabled={busy || !channelId} onClick={() => void share()}>
              <Send className="wb-flip" />
              <span>Share to Pulse Chat</span>
            </button>
            {sent && (
              <Link to={sent.to} className="wb-share__sent">
                <Check aria-hidden="true" />
                <span>Shared to</span> <b>#{sent.name}</b>
              </Link>
            )}
          </div>
        </div>
      )}
    </NeoPanel>
  );
}

/* ───────────────────────── walk & talk ───────────────────────── */

function WalkTalkPanel({ uid, route, routeKm }: { uid: string; route: string; routeKm: number }) {
  const events = useCalendarEvents();
  const users = useHub((s) => s.users);
  const markWalkTalk = useWellbeing((s) => s.markWalkTalk);
  const [busy, setBusy] = useState<string | null>(null);
  const rows = events.filter((e) => e.category === '1on1' && isMine(e, uid) && e.dayOffset >= 0 && e.dayOffset <= 4).sort((a, b) => a.dayOffset - b.dayOffset || a.startHour - b.startHour);

  const convert = async (id: string) => {
    setBusy(id);
    const created = await convertToWalk(id, route);
    setBusy(null);
    if (created) {
      markWalkTalk(uid, created);
      toast.success('Your 1:1 is now a walk & talk', route);
    }
  };

  return (
    <NeoPanel hud="Walk & talk" title="Turn 1:1s into walking meetings" actions={<Chip tone="emerald" size="sm" icon={<Footprints />}>≈ 3,000 steps each</Chip>}>
      {rows.length === 0 ? (
        <p className="wb-muted">No 1:1s on your calendar in the next few days.</p>
      ) : (
        <ul className="wb-walks">
          {rows.map((e) => {
            const other = users.find((u) => u.id === (e.attendeeIds.find((a) => a !== uid) ?? e.organizerId));
            const walking = /^walk & talk/i.test(e.title);
            return (
              <li key={e.id} className={cx('wb-walk', walking && 'is-walking')}>
                {other ? <Avatar user={other} size={34} /> : <span className="wb-walk__dot" />}
                <div className="wb-walk__body">
                  <b className="wb-walk__title" data-no-i18n="">
                    {e.title}
                  </b>
                  <span className="wb-walk__meta">
                    <span>{dayLabel(e.dayOffset)}</span> <span>·</span> <b>{formatHour(e.startHour)}</b> <span>·</span> <b>{e.durationMins}</b> <span>min</span>
                    {other && (
                      <>
                        {' '}
                        <span>·</span> <span>{other.name}</span>
                      </>
                    )}
                  </span>
                  {!walking && (
                    <span className="wb-walk__route">
                      <MapPin aria-hidden="true" />
                      <span>{route}</span> <span>·</span> <b>{routeKm.toFixed(1)}</b> <span>km</span>
                    </span>
                  )}
                </div>
                {walking ? (
                  <Chip tone="emerald" size="sm" icon={<Check />}>
                    Walking
                  </Chip>
                ) : (
                  <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" disabled={busy === e.id} onClick={() => void convert(e.id)}>
                    <Share2 />
                    <span>Make it a walk</span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </NeoPanel>
  );
}
