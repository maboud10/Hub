import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Activity, ArrowRight, Cake, Coffee, PartyPopper, Pause, Play, Square, TriangleAlert, Video } from 'lucide-react';
import { Bar, Chip, NeoPanel, Orb, Ring } from '@/components/neo';
import { useHub } from '@/store/hub';
import { useUI } from '@/store/ui';
import { useFocus } from '@/store/focus';
import { useCan, useSessionUser, useVisibleAnnouncements } from '@/store/selectors';
import { useNow } from '@/hooks/useNow';
import { buildAgenda } from '@/data/agenda';
import { firstName, formatTime, mmss, relativeTime, todayKey } from '@/lib/format';
import { getIcon } from '@/icons';
import { AppIcon, Avatar } from '@/components/ui/primitives';
import { useLaunchApp } from '@/components/apps/useLaunchApp';
import { startBreak, startFocusSession, stopFocusSession } from '@/components/FocusEngine';
import { KUDOS_VALUES } from '@/components/KudosDialog';
import { STATUS_LABEL } from '@/components/apps/AppTile';
import { cx } from '@/lib/cx';

/**
 * Launchpad side-column widget: a compact NEO panel with a mono HUD eyebrow,
 * a short title and an optional "All →" style action.
 */
export function Widget({
  hud,
  title,
  action,
  children,
  className,
}: {
  /** Mono, tracked-caps eyebrow (e.g. "Today", "Live", "Anonymous"). */
  hud: ReactNode;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <NeoPanel className={cx('lp-widget', className)} hud={hud} title={title} actions={action}>
      {children}
    </NeoPanel>
  );
}

/* ───────────────────────── Agenda ───────────────────────── */
export function AgendaWidget() {
  const now = useNow(30_000);
  const launch = useLaunchApp();
  const events = useMemo(() => buildAgenda(new Date(now)), [Math.floor(now / 60_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const firstRelevant = Math.max(0, events.findIndex((e) => e.end.getTime() > now) - 1);
  const visible = events.slice(firstRelevant);
  const left = events.filter((e) => e.end.getTime() > now).length;
  const upNextId = visible.find((v) => v.start.getTime() > now)?.id;

  return (
    <Widget
      hud={left ? `Today · ${left} left` : 'Today'}
      title="Agenda"
      className="lp-agenda-widget"
      action={
        <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => launch('calendar')}>
          Calendar <ArrowRight />
        </button>
      }
    >
      <ol className="lp-agenda">
        {visible.map((ev) => {
          const start = ev.start.getTime();
          const end = ev.end.getTime();
          const state = end <= now ? 'past' : start <= now ? 'now' : 'next';
          const isNext = ev.id === upNextId;
          const Icon = getIcon(ev.icon);
          const progress = state === 'now' ? (now - start) / (end - start) : 0;
          return (
            <li key={ev.id} className={cx('lp-agenda__item', `is-${state}`, isNext && 'is-upnext')}>
              <time className="lp-agenda__time neo-mono">{formatTime(ev.start)}</time>
              <span className="lp-agenda__rail" aria-hidden="true">
                <i />
              </span>
              <div className="lp-agenda__body">
                <div className="lp-agenda__title">
                  <Icon /> <span className="truncate">{ev.title}</span>
                </div>
                <div className="lp-agenda__meta truncate">
                  {ev.location} · {ev.attendees} {ev.attendees === 1 ? 'person' : 'people'}
                </div>
                {state === 'now' && <Bar value={progress} className="lp-agenda__progress" label="Meeting progress" />}
              </div>
              {state === 'now' && (
                <span className="lp-agenda__cta">
                  <Chip tone="danger" size="sm" icon={<Orb tone="danger" pulse size={6} />}>
                    Live
                  </Chip>
                  {ev.appId === 'meet' && (
                    <button type="button" className="neo-btn neo-btn--plasma neo-btn--xs" onClick={() => launch('meet', `Join “${ev.title}”`)}>
                      <Video /> Join
                    </button>
                  )}
                </span>
              )}
              {isNext && (
                <Chip tone="app" size="sm" className="lp-agenda__in">
                  in {Math.max(1, Math.round((start - now) / 60_000))}m
                </Chip>
              )}
            </li>
          );
        })}
      </ol>
    </Widget>
  );
}

/* ───────────────────────── Focus ───────────────────────── */
export function FocusWidget() {
  const { mode, endsAt, pausedRemaining, duration, pause, resume } = useFocus();
  useNow(1000);
  const remaining = mode === 'idle' ? 25 * 60_000 : (pausedRemaining ?? (endsAt ? Math.max(0, endsAt - Date.now()) : 0));
  const pct = mode === 'idle' ? 0 : 1 - remaining / duration;
  const paused = pausedRemaining !== null;
  const label = mode === 'idle' ? 'Ready' : mode === 'focus' ? (paused ? 'Paused' : 'Focusing') : 'Break';

  return (
    <Widget
      hud="Deep work"
      title="Focus timer"
      className="lp-focus-widget"
      action={
        <span className="lp-keyhint" title="Keyboard shortcut">
          <kbd className="lp-kbd">F</kbd>
        </span>
      }
    >
      <div className={cx('lp-focus', mode !== 'idle' && 'is-running', paused && 'is-paused')}>
        <Ring value={pct} size={92} stroke={7} label={`${label}, ${mmss(remaining)} remaining`} className="lp-focus__ring">
          <span className="lp-focus__readout">
            <span className="lp-focus__time neo-mono" aria-live="off">
              {mmss(remaining)}
            </span>
            <span className="lp-focus__mode neo-hud">{label}</span>
          </span>
        </Ring>
        <div className="lp-focus__controls">
          {mode === 'idle' ? (
            <>
              <p className="lp-focus__copy">
                Sets your status to <strong>Focusing</strong> so colleagues know.
              </p>
              <div className="lp-focus__btns">
                <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={() => startFocusSession(25)}>
                  <Play /> 25 min
                </button>
                <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => startFocusSession(50)}>
                  50 min
                </button>
                <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => startBreak(5)}>
                  <Coffee /> Break
                </button>
              </div>
            </>
          ) : (
            <div className="lp-focus__btns">
              {paused ? (
                <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={resume}>
                  <Play /> Resume
                </button>
              ) : (
                <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={pause}>
                  <Pause /> Pause
                </button>
              )}
              <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={stopFocusSession}>
                <Square /> End
              </button>
            </div>
          )}
        </div>
      </div>
    </Widget>
  );
}

/* ───────────────────────── News ───────────────────────── */
export function NewsWidget() {
  const items = useVisibleAnnouncements().slice(0, 3);
  return (
    <Widget
      hud="Newsroom"
      title="Latest news"
      action={
        <Link to="/news" className="neo-btn neo-btn--ghost neo-btn--xs">
          All <ArrowRight />
        </Link>
      }
    >
      {items.length ? (
        <div className="lp-news">
          {items.map((a) => (
            <Link key={a.id} to="/news" className="lp-news__item" data-priority={a.priority}>
              <div className="lp-news__meta">
                {a.priority !== 'normal' && (
                  <Chip tone={a.priority === 'critical' ? 'danger' : 'warning'} size="sm" icon={a.priority === 'critical' ? <Orb tone="danger" pulse size={6} /> : undefined}>
                    {a.priority}
                  </Chip>
                )}
                <span className="neo-hud">{a.category}</span>
                <span className="lp-news__time">{relativeTime(a.createdAt)}</span>
              </div>
              <div className="lp-news__title clamp-2">{a.title}</div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="lp-widget__empty">No news yet — announcements targeted to you will land here.</p>
      )}
    </Widget>
  );
}

/* ───────────────────────── Pulse ───────────────────────── */
const MOODS = [
  { v: 1, e: '😫', l: 'Drained' },
  { v: 2, e: '😕', l: 'Meh' },
  { v: 3, e: '😐', l: 'Okay' },
  { v: 4, e: '🙂', l: 'Good' },
  { v: 5, e: '🤩', l: 'Energised' },
] as const;
const BASELINE = [1, 3, 7, 12, 6];

export function PulseWidget() {
  const me = useSessionUser();
  const pulse = useHub((s) => s.pulse);
  const vote = useHub((s) => s.votePulse);
  const launch = useLaunchApp();
  const canAura = useCan('app:wellness');
  const today = todayKey();
  const mine = me && pulse[me.id]?.date === today ? pulse[me.id].mood : null;

  const counts = useMemo(() => {
    const c = [...BASELINE];
    Object.values(pulse).forEach((p) => p.date === today && (c[p.mood - 1] += 1));
    return c;
  }, [pulse, today]);
  const total = counts.reduce((a, b) => a + b, 0);
  const avg = counts.reduce((a, n, i) => a + n * (i + 1), 0) / total;
  const max = Math.max(...counts);

  return (
    <Widget
      hud="Anonymous"
      title="Team pulse"
      action={
        mine || canAura ? (
          <span className="lp-pulse__actions">
            {mine && (
              <Chip tone="app" size="sm" title="Team mood today">
                {avg.toFixed(1)} / 5
              </Chip>
            )}
            {canAura && (
              <button
                type="button"
                className="neo-btn neo-btn--ghost neo-btn--xs"
                onClick={() => launch('wellness', mine ? undefined : 'Daily check-in')}
                title="Open your private Aura in Wellbeing"
              >
                Aura <ArrowRight />
              </button>
            )}
          </span>
        ) : undefined
      }
    >
      <p className="lp-widget__lede">{mine ? 'Thanks for checking in! Here’s how the team feels today.' : 'How’s your energy today?'}</p>
      <div className={cx('lp-pulse', mine && 'is-voted')} role="radiogroup" aria-label="Your mood today">
        {MOODS.map((m, i) => (
          <button
            key={m.v}
            type="button"
            role="radio"
            aria-checked={mine === m.v}
            className={cx('lp-pulse__opt', mine === m.v && 'is-active')}
            onClick={() => vote(m.v)}
            title={m.l}
          >
            {mine && (
              <span className="lp-pulse__bar" aria-hidden="true">
                <span style={{ height: `${(counts[i] / max) * 100}%` }} />
              </span>
            )}
            <span className="lp-pulse__emoji">{m.e}</span>
            <span className="lp-pulse__label">{mine ? counts[i] : m.l}</span>
          </button>
        ))}
      </div>
    </Widget>
  );
}

/* ───────────────────────── Kudos ───────────────────────── */
export function KudosWidget() {
  const kudos = useHub((s) => s.kudos);
  const users = useHub((s) => s.users);
  const openKudos = useUI((s) => s.openKudos);
  const canGive = useCan('hub.kudos.give');
  const recent = kudos.slice(0, 3);
  const find = (id: string) => users.find((u) => u.id === id);

  return (
    <Widget
      hud="Recognition"
      title="Kudos wall"
      action={
        canGive ? (
          <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={() => openKudos()}>
            <PartyPopper /> Give
          </button>
        ) : undefined
      }
    >
      <div className="lp-kudos">
        {recent.map((k) => {
          const from = find(k.fromId);
          const to = find(k.toId);
          const v = KUDOS_VALUES[k.value];
          if (!from || !to) return null;
          return (
            <article key={k.id} className="lp-kudos__card" style={{ ['--kv' as string]: v.color }}>
              <div className="lp-kudos__top">
                <span className="lp-kudos__avatars">
                  <Avatar user={from} size={26} />
                  <Avatar user={to} size={26} />
                </span>
                <span className="lp-kudos__who truncate">
                  <strong>{firstName(from.name)}</strong> <span aria-hidden="true">→</span> <strong>{firstName(to.name)}</strong>
                </span>
                <span className="lp-kudos__value">{v.label}</span>
              </div>
              <p className="lp-kudos__msg clamp-2">“{k.message}”</p>
              <span className="lp-kudos__time">{relativeTime(k.at)}</span>
            </article>
          );
        })}
        {!recent.length && <p className="lp-widget__empty">No kudos yet — be the first to recognise someone.</p>}
      </div>
    </Widget>
  );
}

/* ───────────────────────── System status ───────────────────────── */
/** Deterministic pseudo-uptime bars so the status page looks alive without randomness per render. */
function uptimeBars(seed: string, status: string, n = 24) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return Array.from({ length: n }, (_, i) => {
    h = (h * 1103515245 + 12345) >>> 0;
    if (i === n - 1 && status !== 'operational') return status;
    return h % 23 === 0 ? 'degraded' : 'operational';
  });
}

export function StatusWidget() {
  const apps = useHub((s) => s.apps);
  const enabled = apps.filter((a) => a.enabled);
  const issues = enabled.filter((a) => a.status !== 'operational');
  const core = ['mail', 'chat', 'meet', 'drive'];
  const rows = [...issues, ...enabled.filter((a) => core.includes(a.id) && !issues.includes(a))].slice(0, 5);
  const uptime = enabled.length ? Math.round(((enabled.length - issues.length) / enabled.length) * 1000) / 10 : 100;

  return (
    <Widget hud="Live" title="System status">
      <div className="lp-status__sum" data-ok={issues.length === 0 || undefined}>
        {issues.length ? <TriangleAlert /> : <Activity />}
        <span className="grow">{issues.length ? `${issues.length} service${issues.length > 1 ? 's' : ''} need attention` : 'All systems operational'}</span>
        <span className="neo-mono lp-status__pct">{uptime}%</span>
      </div>
      <div className="lp-status">
        {rows.map((a) => (
          <div key={a.id} className="lp-status__row">
            <AppIcon app={a} size={24} />
            <span className="lp-status__name truncate">{a.name}</span>
            <span className="lp-status__bars" aria-hidden="true">
              {uptimeBars(a.id, a.status).map((s, i) => (
                <i key={i} className={`is-${s}`} />
              ))}
            </span>
            <Chip tone={a.status === 'operational' ? 'success' : a.status === 'degraded' ? 'warning' : 'blue'} size="sm">
              {STATUS_LABEL[a.status]}
            </Chip>
          </div>
        ))}
      </div>
    </Widget>
  );
}

/* ───────────────────────── Celebrations ───────────────────────── */
const DAY = 86_400_000;
function daysUntil(mmdd: string, now = new Date()) {
  const [m, d] = mmdd.split('-').map(Number);
  const target = new Date(now.getFullYear(), m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let diff = Math.round((target.getTime() - today.getTime()) / DAY);
  if (diff < 0) diff += 365;
  return diff;
}
const when = (d: number) => (d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d} days`);

export function CelebrationsWidget() {
  const users = useHub((s) => s.users);
  const openKudos = useUI((s) => s.openKudos);
  const me = useSessionUser();
  const canGive = useCan('hub.kudos.give');

  const items = useMemo(() => {
    const out: { id: string; userId: string; kind: 'birthday' | 'anniversary'; days: number; years?: number }[] = [];
    const now = new Date();
    for (const u of users) {
      if (!u.active) continue;
      if (u.birthday) {
        const d = daysUntil(u.birthday, now);
        if (d <= 7) out.push({ id: `b-${u.id}`, userId: u.id, kind: 'birthday', days: d });
      }
      const [sy, sm, sd] = u.startDate.split('-').map(Number);
      const start = new Date(sy, sm - 1, sd);
      const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const annThisYear = new Date(now.getFullYear(), start.getMonth(), start.getDate());
      const targetYear = annThisYear < today0 ? now.getFullYear() + 1 : now.getFullYear();
      const years = targetYear - start.getFullYear();
      if (years > 0) {
        const d = daysUntil(`${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`, now);
        if (d <= 7) out.push({ id: `a-${u.id}`, userId: u.id, kind: 'anniversary', days: d, years });
      }
    }
    return out.sort((a, b) => a.days - b.days).slice(0, 4);
  }, [users]);

  return (
    <Widget hud="This week" title="Celebrations">
      {items.length === 0 ? (
        <div className="lp-widget__empty lp-widget__empty--icon">
          <Cake /> No birthdays or work anniversaries this week.
        </div>
      ) : (
        <div className="lp-celebs">
          {items.map((c) => {
            const u = users.find((x) => x.id === c.userId)!;
            return (
              <div key={c.id} className="lp-celeb" data-kind={c.kind}>
                <Avatar user={u} size={34} />
                <div className="lp-celeb__text">
                  <div className="lp-celeb__name truncate">{u.id === me?.id ? 'You' : u.name}</div>
                  <div className="lp-celeb__meta">
                    {c.kind === 'birthday' ? '🎂 Birthday' : `🎉 ${c.years}-year anniversary`} · <span className={cx(c.days === 0 && 'neo-tint')}>{when(c.days)}</span>
                  </div>
                </div>
                {canGive && u.id !== me?.id && (
                  <button type="button" className="neo-iconbtn lp-celeb__btn" onClick={() => openKudos(u.id)} aria-label={`Celebrate ${u.name}`} title="Send kudos">
                    🎈
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Widget>
  );
}
