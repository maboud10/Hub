import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  Activity,
  ArrowRight,
  Cake,
  CalendarDays,
  Coffee,
  Megaphone,
  Pause,
  PartyPopper,
  Play,
  Square,
  Timer,
  Video,
  Smile,
} from 'lucide-react';
import { useHub } from '@/store/hub';
import { useUI } from '@/store/ui';
import { useFocus } from '@/store/focus';
import { useCan, useSessionUser, useVisibleAnnouncements } from '@/store/selectors';
import { useNow } from '@/hooks/useNow';
import { buildAgenda } from '@/data/agenda';
import { firstName, formatTime, mmss, relativeTime, todayKey } from '@/lib/format';
import { getIcon } from '@/icons';
import { AppIcon, Avatar, EmptyState } from '@/components/ui/primitives';
import { useLaunchApp } from '@/components/apps/useLaunchApp';
import { startBreak, startFocusSession, stopFocusSession } from '@/components/FocusEngine';
import { KUDOS_VALUES } from '@/components/KudosDialog';
import { STATUS_LABEL } from '@/components/apps/AppTile';
import { cx } from '@/lib/cx';

export function Widget({
  title,
  icon,
  action,
  children,
  className,
}: {
  title: string;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx('widget card', className)} aria-label={title}>
      <header className="widget__head">
        <span className="widget__icon">{icon}</span>
        <h3 className="widget__title">{title}</h3>
        <span className="spacer" />
        {action}
      </header>
      {children}
    </section>
  );
}

/* ───────────────────────── Agenda ───────────────────────── */
export function AgendaWidget() {
  const now = useNow(30_000);
  const launch = useLaunchApp();
  const events = useMemo(() => buildAgenda(new Date(now)), [Math.floor(now / 60_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const firstRelevant = Math.max(0, events.findIndex((e) => e.end.getTime() > now) - 1);
  const visible = events.slice(firstRelevant);

  return (
    <Widget
      title="Today"
      icon={<CalendarDays />}
      action={
        <button className="btn btn--sm btn--ghost" onClick={() => launch('calendar')}>
          Calendar <ArrowRight />
        </button>
      }
    >
      <ol className="agenda">
        {visible.map((ev) => {
          const start = ev.start.getTime();
          const end = ev.end.getTime();
          const state = end <= now ? 'past' : start <= now ? 'now' : 'next';
          const isNext = state === 'next' && visible.find((v) => v.start.getTime() > now)?.id === ev.id;
          const Icon = getIcon(ev.icon);
          const progress = state === 'now' ? ((now - start) / (end - start)) * 100 : 0;
          return (
            <li key={ev.id} className={cx('agenda__item', `is-${state}`, isNext && 'is-upnext')}>
              <time className="agenda__time">{formatTime(ev.start)}</time>
              <span className="agenda__rail" aria-hidden="true">
                <i />
              </span>
              <div className="agenda__body">
                <div className="agenda__title">
                  <Icon size={14} /> <span className="truncate">{ev.title}</span>
                </div>
                <div className="agenda__meta">
                  {ev.location} · {ev.attendees} {ev.attendees === 1 ? 'person' : 'people'}
                </div>
                {state === 'now' && (
                  <div className="progress" style={{ marginTop: 8 }}>
                    <span style={{ width: `${progress}%` }} />
                  </div>
                )}
              </div>
              {state === 'now' && (
                <span className="agenda__cta">
                  <span className="badge badge--danger">
                    <span className="dot dot--meeting dot--pulse" /> Live
                  </span>
                  {ev.appId === 'meet' && (
                    <button className="btn btn--sm btn--primary" onClick={() => launch('meet', `Join “${ev.title}”`)}>
                      <Video /> Join
                    </button>
                  )}
                </span>
              )}
              {isNext && <span className="badge">in {Math.max(1, Math.round((start - now) / 60_000))}m</span>}
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
  const R = 52;
  const C = 2 * Math.PI * R;

  return (
    <Widget title="Focus" icon={<Timer />} className="focus-widget">
      <div className="focus">
        <div className={cx('focus__ring', mode !== 'idle' && 'is-running', pausedRemaining !== null && 'is-paused')}>
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <defs>
              <linearGradient id="focus-g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--accent)" />
                <stop offset="1" stopColor="var(--accent-2)" />
              </linearGradient>
            </defs>
            <circle cx="60" cy="60" r={R} className="focus__track" />
            <circle cx="60" cy="60" r={R} className="focus__bar" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
          </svg>
          <div className="focus__readout">
            <span className="focus__time" aria-live="off">
              {mmss(remaining)}
            </span>
            <span className="focus__mode">{mode === 'idle' ? 'Ready' : mode === 'focus' ? (pausedRemaining !== null ? 'Paused' : 'Focusing') : 'Break'}</span>
          </div>
        </div>
        <div className="focus__controls">
          {mode === 'idle' ? (
            <>
              <p className="text-sm muted">Deep-work timer. Sets your status to <strong>Focusing</strong> so colleagues know.</p>
              <div className="row row--wrap">
                <button className="btn btn--primary btn--sm" onClick={() => startFocusSession(25)}>
                  <Play /> 25 min
                </button>
                <button className="btn btn--sm" onClick={() => startFocusSession(50)}>
                  50 min
                </button>
                <button className="btn btn--sm btn--ghost" onClick={() => startBreak(5)}>
                  <Coffee /> Break
                </button>
              </div>
            </>
          ) : (
            <div className="row row--wrap">
              {pausedRemaining !== null ? (
                <button className="btn btn--sm btn--primary" onClick={resume}>
                  <Play /> Resume
                </button>
              ) : (
                <button className="btn btn--sm" onClick={pause}>
                  <Pause /> Pause
                </button>
              )}
              <button className="btn btn--sm btn--ghost" onClick={stopFocusSession}>
                <Square /> End
              </button>
            </div>
          )}
          <span className="text-xs faint">
            Shortcut: <span className="kbd">F</span>
          </span>
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
      title="Newsroom"
      icon={<Megaphone />}
      action={
        <Link to="/news" className="btn btn--sm btn--ghost">
          All <ArrowRight />
        </Link>
      }
    >
      <div className="stack stack--sm">
        {items.map((a) => (
          <Link key={a.id} to="/news" className={cx('news-mini', `news-mini--${a.priority}`)}>
            <div className="row" style={{ gap: 6, marginBottom: 4 }}>
              {a.priority !== 'normal' && (
                <span className={cx('badge', a.priority === 'critical' ? 'badge--danger' : 'badge--warning')}>
                  {a.priority === 'critical' && <span className="dot dot--meeting dot--pulse" />}
                  {a.priority}
                </span>
              )}
              <span className="tag">{a.category}</span>
              <span className="spacer" />
              <span className="text-xs faint">{relativeTime(a.createdAt)}</span>
            </div>
            <div className="news-mini__title clamp-2">{a.title}</div>
          </Link>
        ))}
        {!items.length && <EmptyState icon={<Megaphone />} title="No news yet" />}
      </div>
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
    <Widget title="Team pulse" icon={<Smile />} action={<span className="tag">Anonymous</span>}>
      <p className="text-sm muted" style={{ marginBottom: 12 }}>
        {mine ? 'Thanks for checking in! Here’s how the team feels today.' : 'How’s your energy today?'}
      </p>
      <div className="pulse" role="radiogroup" aria-label="Your mood today">
        {MOODS.map((m, i) => (
          <button
            key={m.v}
            role="radio"
            aria-checked={mine === m.v}
            className={cx('pulse__opt', mine === m.v && 'is-active', mine && 'is-voted')}
            onClick={() => vote(m.v)}
            title={m.l}
          >
            {mine && (
              <span className="pulse__bar" aria-hidden="true">
                <span style={{ height: `${(counts[i] / max) * 100}%` }} />
              </span>
            )}
            <span className="pulse__emoji">{m.e}</span>
            <span className="pulse__label">{mine ? counts[i] : m.l}</span>
          </button>
        ))}
      </div>
      {mine && (
        <div className="row row--between text-sm" style={{ marginTop: 12 }}>
          <span className="muted">Team mood</span>
          <strong className="mono accent-ink">{avg.toFixed(1)} / 5</strong>
        </div>
      )}
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
      title="Kudos wall"
      icon={<PartyPopper />}
      action={
        canGive ? (
          <button className="btn btn--sm" onClick={() => openKudos()}>
            Give kudos
          </button>
        ) : undefined
      }
    >
      <div className="stack">
        {recent.map((k) => {
          const from = find(k.fromId);
          const to = find(k.toId);
          const v = KUDOS_VALUES[k.value];
          if (!from || !to) return null;
          return (
            <article key={k.id} className="kudos-card" style={{ ['--kv' as string]: v.color }}>
              <div className="row" style={{ gap: 8 }}>
                <span className="avatar-stack">
                  <Avatar user={from} size={28} />
                  <Avatar user={to} size={28} />
                </span>
                <span className="text-sm grow truncate">
                  <strong>{firstName(from.name)}</strong> <span className="faint">→</span> <strong>{firstName(to.name)}</strong>
                </span>
                <span className="kudos-card__value">{v.label}</span>
              </div>
              <p className="text-sm muted clamp-2" style={{ marginTop: 8 }}>
                “{k.message}”
              </p>
              <span className="text-xs faint">{relativeTime(k.at)}</span>
            </article>
          );
        })}
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

  return (
    <Widget title="System status" icon={<Activity />}>
      <div className={cx('status-summary', issues.length ? 'has-issues' : 'is-ok')}>
        <span className={cx('dot dot--pulse', issues.length ? 'dot--degraded' : 'dot--operational')} />
        <span className="grow">{issues.length ? `${issues.length} service${issues.length > 1 ? 's' : ''} need attention` : 'All systems operational'}</span>
        <span className="mono text-xs faint">{Math.round(((enabled.length - issues.length) / enabled.length) * 1000) / 10}%</span>
      </div>
      <div className="stack stack--sm" style={{ marginTop: 12 }}>
        {rows.map((a) => (
          <div key={a.id} className="status-row">
            <AppIcon app={a} size={26} />
            <span className="status-row__name truncate">{a.name}</span>
            <span className="status-row__bars" aria-hidden="true">
              {uptimeBars(a.id, a.status).map((s, i) => (
                <i key={i} className={`is-${s}`} />
              ))}
            </span>
            <span className={cx('badge', a.status === 'operational' ? 'badge--success' : a.status === 'degraded' ? 'badge--warning' : 'badge--info')}>
              {STATUS_LABEL[a.status]}
            </span>
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
    <Widget title="Celebrations" icon={<Cake />}>
      {items.length === 0 ? (
        <p className="text-sm muted">No birthdays or work anniversaries this week.</p>
      ) : (
        <div className="stack stack--sm">
          {items.map((c) => {
            const u = users.find((x) => x.id === c.userId)!;
            return (
              <div key={c.id} className="celebration">
                <Avatar user={u} size={34} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="text-sm truncate" style={{ fontWeight: 600 }}>
                    {u.id === me?.id ? 'You' : u.name}
                  </div>
                  <div className="text-xs faint">
                    {c.kind === 'birthday' ? '🎂 Birthday' : `🎉 ${c.years}-year anniversary`} · {when(c.days)}
                  </div>
                </div>
                {canGive && u.id !== me?.id && (
                  <button className="btn btn--sm btn--ghost" onClick={() => openKudos(u.id)} aria-label={`Celebrate ${u.name}`}>
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
