/**
 * 1:1s — `/performance/one-on-ones[/:seriesId]`.
 *
 * Side panel: every 1:1 series you're part of, grouped (with my manager · my
 * reports · mentoring), next-up countdown, open agenda / action counts and a
 * "New 1:1" dialog (`?new=1` or `?new=<userId>` deep links, hotkey N).
 * Stage: the live meeting room for the selected series (default: the next
 * upcoming one) — participants, countdown, mood check-in, shared agenda with
 * Nova talking points, shared + private notes (autosaved), action items,
 * wrap-up (completeMeeting → open items carry over) and the meeting timeline.
 *
 * Privacy (src/performance/access.ts): only the two participants can open a
 * series; private notes are read from / written to the viewer's own slot only.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { CalendarClock, CalendarPlus, ChevronRight, CircleCheckBig, Lock, MessagesSquare, PartyPopper, SearchX, X } from 'lucide-react';
import { NeoBanner, NeoBanners, NeoEmpty, NeoHead, NeoHome, NeoPopover, NeoStage, Orb, Spark, Chip } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { useHotkeys } from '@/hooks/useHotkeys';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { isSeriesMember } from '@/performance/access';
import { usePerf } from '@/performance/store';
import type { Cadence, OneOnOneSeries } from '@/performance/types';
import { dayLabel, report, useMinute, usePerfCtx, useSearchFlag, type PerfCtx } from './hooks';
import { useShell } from './PerformancePage';
import { Seg } from './ui';
import { CADENCE_LABEL, CADENCE_OPTIONS, countdown, DAY, fromLocalInput, meetingPhase, MIN, moodMeta, moodTrail, MOODS, nextSlot, partnerOf, pickDefault, relationOf, RELATION, toLocalInput } from './oneonones-shared';
import { NewSeriesModal, SeriesSide } from './oneonones-side';
import { ActionsPanel, AgendaPanel, NotesPanel } from './oneonones-room';
import { HistoryPanel, WrapUpModal } from './oneonones-history';
import './styles/oneonones.css';

export function OneOnOnesView() {
  const ctx = usePerfCtx();
  const now = useMinute();
  const { seriesId } = useParams();
  const { setPeek } = useShell();
  const all = usePerf((s) => s.series);
  const [newFor, setNewFor] = useState<{ partnerId?: string } | null>(null);
  const [newFlag, clearNew] = useSearchFlag('new');

  const mine = useMemo(() => (ctx ? all.filter((s) => isSeriesMember(ctx.v, s)) : []), [all, ctx]);
  const requested = seriesId ? all.find((s) => s.id === seriesId) : undefined;
  const allowed = !!requested && !!ctx && isSeriesMember(ctx.v, requested);
  const selected = seriesId ? (allowed ? requested : undefined) : pickDefault(mine, now);

  // Close the floating side panel (narrow screens) whenever the selection changes.
  useEffect(() => setPeek(false), [seriesId, setPeek]);
  useHotkeys({ n: () => setNewFor({}) });

  if (!ctx) return null;
  const toggleSide = () => setPeek((p) => !p);
  const flagPartner = newFlag && newFlag !== '1' ? newFlag : undefined;

  let stage: ReactNode;
  if (seriesId && !requested)
    stage = (
      <Wall icon={<SearchX />} title="1:1 not found" onToggleSide={toggleSide}>
        This 1:1 doesn’t exist any more — it may have been removed.
      </Wall>
    );
  else if (seriesId && !allowed)
    stage = (
      <Wall icon={<Lock />} title="This 1:1 is private" onToggleSide={toggleSide}>
        Only the two people in a 1:1 can see its agenda, notes and action items.
      </Wall>
    );
  else if (!selected) stage = <NoSeries ctx={ctx} onNew={(id) => setNewFor({ partnerId: id })} onToggleSide={toggleSide} />;
  else stage = <SeriesStage key={selected.id} ctx={ctx} s={selected} now={now} onToggleSide={toggleSide} />;

  return (
    <>
      <SeriesSide ctx={ctx} list={mine} activeId={selected?.id} now={now} onNew={(id) => setNewFor({ partnerId: id })} />
      {stage}
      <NewSeriesModal
        open={!!newFor || !!newFlag}
        partnerId={newFor?.partnerId ?? flagPartner}
        onClose={() => {
          setNewFor(null);
          if (newFlag) clearNew();
        }}
        ctx={ctx}
        now={now}
      />
    </>
  );
}

/* ═════════════════════ Walls & empty ═════════════════════ */

function Wall({ icon, title, children, onToggleSide }: { icon: ReactNode; title: string; children: ReactNode; onToggleSide: () => void }) {
  return (
    <NeoStage label={title}>
      <NeoHead icon={<MessagesSquare />} eyebrow="Reflect · 1:1s" title="1:1s" sub="Your recurring conversations" onToggleSide={onToggleSide} />
      <div className="neo-body neo-pad">
        <NeoEmpty
          icon={icon}
          title={title}
          action={
            <Link className="neo-btn neo-btn--soft" to="/performance/one-on-ones">
              Back to my 1:1s
            </Link>
          }
        >
          {children}
        </NeoEmpty>
      </div>
    </NeoStage>
  );
}

function NoSeries({ ctx, onNew, onToggleSide }: { ctx: PerfCtx; onNew: (partnerId?: string) => void; onToggleSide: () => void }) {
  const managerId = ctx.me.managerId && ctx.peopleIds.has(ctx.me.managerId) ? ctx.me.managerId : undefined;
  const manager = ctx.user(managerId);
  const reports = ctx.reportIds.map((id) => ctx.user(id)).filter((u): u is NonNullable<typeof u> => !!u);
  return (
    <NeoStage label="1:1s">
      <NeoHead
        icon={<MessagesSquare />}
        eyebrow="Reflect · 1:1s"
        title="1:1s"
        sub="A shared agenda, live notes and action items for every recurring conversation."
        onToggleSide={onToggleSide}
        actions={
          <button type="button" className="neo-btn neo-btn--plasma" onClick={() => onNew()}>
            <CalendarPlus /> <span className="neo-btn__label">New 1:1</span>
          </button>
        }
      />
      <div className="neo-body neo-pad">
        <NeoEmpty
          icon={<MessagesSquare />}
          title="No 1:1s yet"
          action={
            <button type="button" className="neo-btn neo-btn--plasma" onClick={() => onNew()}>
              <CalendarPlus /> Set up a 1:1
            </button>
          }
        >
          {reports.length
            ? 'Regular 1:1s are the heartbeat of a team. Start with your reports — Nova will suggest talking points from their OKRs and feedback.'
            : manager
              ? `${manager.name.split(' ')[0]} can set up your manager 1:1 — or start a mentoring 1:1 with anyone you’d like to learn from.`
              : 'Start a mentoring 1:1 with anyone you’d like to learn from or help grow.'}
        </NeoEmpty>
        {reports.length > 0 && (
          <div className="pf-11-setup">
            {reports.map((u) => (
              <button key={u.id} type="button" className="pf-11-setup__card" onClick={() => onNew(u.id)}>
                <Avatar user={u} size={34} presence />
                <span className="grow">
                  <b>{u.name}</b>
                  <small>{u.title}</small>
                </span>
                <ChevronRight aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </div>
    </NeoStage>
  );
}

/* ═════════════════════ Series stage ═════════════════════ */

function SeriesStage({ ctx, s, now, onToggleSide }: { ctx: PerfCtx; s: OneOnOneSeries; now: number; onToggleSide: () => void }) {
  const [wrap, setWrap] = useState(false);
  const [done, setDone] = useState<{ carried: number; next: number } | null>(null);
  const [glow, setGlow] = useState(false);
  const pid = partnerOf(s, ctx.me.id);
  const partner = ctx.user(pid);
  const rel = relationOf(s, ctx.me.id);
  const phase = meetingPhase(s, now);
  const end = s.nextAt + s.durationMin * MIN;

  useEffect(() => {
    if (!glow) return;
    const t = window.setTimeout(() => setGlow(false), 1900);
    return () => window.clearTimeout(t);
  }, [glow]);

  const sub =
    phase === 'live' ? (
      <span className="pf-11-head-live">
        <Orb tone="danger" pulse size={8} /> Live now · {countdown(end - now)} left · {CADENCE_LABEL[s.cadence]}
      </span>
    ) : (
      `${RELATION[rel].label} · ${CADENCE_LABEL[s.cadence]} · ${s.durationMin} min · ${phase === 'overdue' ? 'was' : 'next'} ${dayLabel(s.nextAt, now)}`
    );

  return (
    <NeoStage label={`1:1 with ${partner?.name ?? 'Unknown'}`} className="pf-11-stage">
      <NeoHead
        icon={<MessagesSquare />}
        eyebrow={`Reflect · ${RELATION[rel].eyebrow}`}
        title={partner?.name ?? 'Unknown'}
        sub={sub}
        onToggleSide={onToggleSide}
        actions={
          <>
            <Reschedule s={s} now={now} />
            <button type="button" className="neo-btn neo-btn--plasma" onClick={() => setWrap(true)} data-qa="oo-complete" aria-label="Complete meeting">
              <CircleCheckBig />
              <span className="neo-btn__label">Complete meeting</span>
            </button>
          </>
        }
      />
      <div className="neo-body neo-pad pf-11-body">
        {(done || phase === 'overdue') && (
          <NeoBanners>
            {done ? (
              <NeoBanner
                tone="success"
                icon={<PartyPopper />}
                title="Meeting complete — nice work"
                meta={`Next ${dayLabel(done.next, now)}`}
                action={
                  <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label="Dismiss" onClick={() => setDone(null)}>
                    <X />
                  </button>
                }
              >
                Notes are on the timeline{done.carried ? ` · ${done.carried} talking point${done.carried === 1 ? '' : 's'} carried over` : ' · clean sweep, every talking point covered'}.
              </NeoBanner>
            ) : (
              <NeoBanner tone="warning" icon={<CalendarClock />} title={`This 1:1 was due ${dayLabel(s.nextAt, now)}`} onClick={() => setWrap(true)}>
                Wrap it up to save the notes and roll the series forward — or reschedule it.
              </NeoBanner>
            )}
          </NeoBanners>
        )}
        <RoomConsole ctx={ctx} s={s} now={now} glow={glow} />
        <NeoHome
          main={
            <>
              <AgendaPanel ctx={ctx} s={s} now={now} />
              <NotesPanel ctx={ctx} s={s} />
            </>
          }
          side={
            <>
              <ActionsPanel ctx={ctx} s={s} now={now} />
              <HistoryPanel key={s.meetings.length} ctx={ctx} s={s} now={now} />
            </>
          }
          sideLabel="Action items and meeting history"
        />
      </div>
      <WrapUpModal
        ctx={ctx}
        s={s}
        open={wrap}
        onClose={() => setWrap(false)}
        onCompleted={(r) => {
          setDone(r);
          setGlow(true);
        }}
      />
    </NeoStage>
  );
}

/* ═════════════════════ Meeting room console ═════════════════════ */

function RoomConsole({ ctx, s, now, glow }: { ctx: PerfCtx; s: OneOnOneSeries; now: number; glow: boolean }) {
  const pid = partnerOf(s, ctx.me.id);
  const partner = ctx.user(pid);
  const first = ctx.first(pid);
  const phase = meetingPhase(s, now);
  const end = s.nextAt + s.durationMin * MIN;
  const myMood = s.moods[ctx.me.id];
  const theirs = moodMeta(s.moods[pid]);
  const open = s.agenda.filter((a) => !a.done).length;
  const acts = s.actionItems.filter((a) => !a.done);
  const overdue = acts.filter((a) => a.dueAt && a.dueAt < now).length;
  const trail = moodTrail(s, pid);
  const last = s.meetings[0]?.at;

  const setMood = (v: number) => report(usePerf.getState().setMood(s.id, v), '');
  const count = phase === 'live' ? `${countdown(end - now)} left` : phase === 'overdue' ? `${countdown(now - s.nextAt)} ago` : countdown(s.nextAt - now);

  return (
    <section className={cx('pf-11-room neo-spot', glow && 'is-celebrating')} data-phase={phase} aria-label="Meeting room">
      <div className="pf-11-pair">
        <span className="pf-11-pair__who">
          <Avatar user={ctx.me} size={46} />
          You
        </span>
        <span className="pf-11-beam" aria-hidden="true" />
        <span className="pf-11-pair__who">
          {partner && <Avatar user={partner} size={46} presence />}
          {first}
        </span>
      </div>

      <div className="pf-11-when">
        <span className="neo-hud">{phase === 'live' ? '● Live now' : phase === 'overdue' ? 'Awaiting wrap-up' : 'Starts in'}</span>
        <span className="pf-11-when__count">{count}</span>
        <span className="pf-11-when__date">
          {dayLabel(s.nextAt, now)} · {s.durationMin} min
        </span>
      </div>

      <div className="pf-11-moodbox">
        <span className="neo-hud">Mood check-in</span>
        <div className="pf-11-moods" role="radiogroup" aria-label="How are you feeling going into this 1:1?">
          {MOODS.map((m) => (
            <button key={m.value} type="button" role="radio" aria-checked={myMood === m.value} className="pf-11-mood" data-tone={m.tone} title={`${m.label} (${m.value}/5)`} onClick={() => setMood(m.value)} data-qa="oo-mood">
              {m.icon}
              <span>{m.label}</span>
            </button>
          ))}
        </div>
        <span className="pf-11-moodbox__them">
          {theirs ? (
            <>
              <span className="pf-11-mooddot" data-tone={theirs.tone}>
                {theirs.icon}
              </span>
              {first} is feeling <b>{theirs.label.toLowerCase()}</b>
            </>
          ) : (
            `${first} hasn’t checked in yet`
          )}
        </span>
      </div>

      <div className="pf-11-hud">
        <span className="pf-11-hud__row">
          <b>{open}</b> open talking point{open === 1 ? '' : 's'}
        </span>
        <span className="pf-11-hud__row" data-tone={overdue ? 'danger' : undefined}>
          <b>{acts.length}</b> open action{acts.length === 1 ? '' : 's'}
          {overdue ? ` · ${overdue} overdue` : ''}
        </span>
        <span className="pf-11-hud__row">
          <b>{s.meetings.length}</b> {last ? `met · last ${relativeTime(last, now)}` : 'meetings so far'}
        </span>
        {trail.length >= 2 && (
          <span className="pf-11-hud__spark" title={`${first}’s mood over the last ${trail.length} meetings: ${trail.join(', ')}`}>
            <Spark data={trail} width={84} height={22} />
            {first}’s mood trend
          </span>
        )}
      </div>
    </section>
  );
}

/* ═════════════════════ Reschedule ═════════════════════ */

function Reschedule({ s, now }: { s: OneOnOneSeries; now: number }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const [when, setWhen] = useState(() => toLocalInput(s.nextAt));
  const [cadence, setCadence] = useState<Cadence>(s.cadence);

  useEffect(() => {
    if (!open) return;
    setWhen(toLocalInput(s.nextAt));
    setCadence(s.cadence);
  }, [open, s.nextAt, s.cadence]);

  const at = fromLocalInput(when);
  const invalid = !Number.isFinite(at) || at < Date.now() - 5 * MIN;
  const unchanged = at === s.nextAt && cadence === s.cadence;
  const base = Math.max(s.nextAt, now);
  const quick = [
    { label: '+1 day', at: base + DAY },
    { label: '+1 week', at: base + 7 * DAY },
    { label: 'Tomorrow 10:00', at: nextSlot(now, 10) },
  ];

  const save = () => {
    if (invalid) return;
    if (report(usePerf.getState().rescheduleSeries(s.id, at, cadence), `1:1 moved to ${dayLabel(at, Date.now())}`)) setOpen(false);
  };

  return (
    <>
      <button ref={btn} type="button" className="neo-btn neo-btn--soft" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog" aria-label="Reschedule" data-qa="oo-reschedule">
        <CalendarClock />
        <span className="neo-btn__label">Reschedule</span>
      </button>
      <NeoPopover open={open} anchor={btn.current} onClose={() => setOpen(false)} placement="bottom-end" width={320} label="Reschedule this 1:1">
        <div className="pf-11-resched">
          <div className="neo-hud">Move the next meeting</div>
          <input type="datetime-local" className="neo-input" value={when} min={toLocalInput(Date.now())} onChange={(e) => setWhen(e.target.value)} aria-label="Next meeting date and time" />
          <div className="pf-11-quick">
            {quick.map((q) => (
              <Chip key={q.label} size="sm" tone={toLocalInput(q.at) === when ? 'app' : 'slate'} pressed={toLocalInput(q.at) === when} onClick={() => setWhen(toLocalInput(q.at))}>
                {q.label}
              </Chip>
            ))}
          </div>
          <span className="neo-label">Cadence</span>
          <Seg size="sm" value={cadence} onChange={setCadence} label="Cadence" options={CADENCE_OPTIONS} />
          <div className="pf-11-resched__foot">
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={save} disabled={invalid || unchanged} title={invalid ? 'Pick a time in the future' : undefined}>
              Save
            </button>
          </div>
        </div>
      </NeoPopover>
    </>
  );
}
