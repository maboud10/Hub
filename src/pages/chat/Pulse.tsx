/**
 * Pulse — the engagement hub (/chat/pulse): workspace heartbeat (ECG), Team Vibe, Daily Spark,
 * kudos wall + leaderboard, celebrations, Coffee Roulette, streaks & badges and live polls.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import {
  Award,
  CalendarHeart,
  Coffee,
  Flame,
  HeartPulse,
  Headphones,
  MessageSquare,
  PenLine,
  Shuffle,
  Sparkles,
  Trophy,
  Vote,
  Zap,
  Heart,
  Check,
  ArrowRight,
} from 'lucide-react';
import { Chip, CountUp, NeoHead, NeoPopover, NeoTabs, NovaChip, Ring, Spark } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { burstConfetti } from '@/lib/confetti';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { canGiveKudos, canView } from '@/chat/access';
import { kudosMeta, MOODS, sparkOfDay } from '@/chat/constants';
import { dateKey } from '@/chat/ids';
import { badgeProgress, heartbeat, heartbeatPath, kudosLeaders, levelOf, levelTitle, streakOf, upcomingOccasions, vibeDistribution, vibeSeries, xpOf, emptyStats, type Occasion } from '@/chat/pulse';
import { useChat } from '@/chat/store';
import type { ChatMessage, Mood } from '@/chat/types';
import { PollCard } from './Cards';
import { KudosDialog } from './Dialogs';
import { chatLink, useNames, useViewer } from './hooks';
import { AuthorAvatar, fmtTime, localTime, Md } from './parts';
import { useChatShell } from './shell';
import { useChatUI } from './ui';

const DAY = 86_400_000;

/* ---------------------------------------------------------------- heartbeat */

function Heartbeat({ messages, online }: { messages: ChatMessage[]; online: number }) {
  const buckets = useMemo(() => heartbeat(messages, Date.now(), 24, 30), [messages]);
  const today = useMemo(() => messages.filter((m) => !m.system && dateKey(m.at) === dateKey(Date.now())).length, [messages]);
  const peakIdx = buckets.indexOf(Math.max(...buckets));
  const peakAt = Date.now() - (buckets.length - peakIdx - 0.5) * 30 * 60_000;
  const W = 1000;
  const H = 120;
  const d = heartbeatPath(buckets, W, H);
  return (
    <div className="pc-beat" data-qa="heartbeat">
      <div className="pc-beat__stats">
        <div>
          <div className="neo-hud neo-hud--tint">Workspace heartbeat · 24h</div>
          <div className="pc-beat__big neo-num">
            <CountUp value={today} />
            <span className="pc-beat__unit">messages today</span>
          </div>
        </div>
        <div className="pc-beat__kpis">
          <span>
            <span className="neo-orb neo-orb--pulse" data-tone="success" /> <strong className="neo-num">{online}</strong> online now
          </span>
          {buckets[peakIdx] > 0 && (
            <span>
              <Zap className="pc-hud-icon" /> Peak at <strong>{fmtTime(peakAt)}</strong> · {buckets[peakIdx]} msgs
            </span>
          )}
        </div>
      </div>
      <svg className="pc-beat__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="pcBeatGrad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="var(--app-c1)" stopOpacity="0.15" />
            <stop offset="55%" stopColor="var(--app-c1)" />
            <stop offset="100%" stopColor="var(--app-c2)" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((y) => (
          <line key={y} x1="0" x2={W} y1={H * y} y2={H * y} className="pc-beat__grid" />
        ))}
        <path d={d} className="pc-beat__glow" />
        <path d={d} className="pc-beat__line" stroke="url(#pcBeatGrad)" />
        <circle r="5" className="pc-beat__dot">
          <animateMotion dur="7s" repeatCount="indefinite" path={d} />
        </circle>
      </svg>
      <div className="pc-beat__axis neo-mono">
        <span>24h ago</span>
        <span>12h</span>
        <span>now</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- me */

function MyPulse() {
  const v = useViewer();
  const stats = useChat((s) => (v ? s.stats[v.user.id] : undefined)) ?? emptyStats();
  const xp = xpOf(stats);
  const lvl = levelOf(xp);
  const streak = streakOf(stats.activeDays);
  return (
    <div className="pc-me" data-qa="my-pulse">
      <div className="pc-me__top">
        <Ring value={lvl.progress} size={92} stroke={8} label={`Level ${lvl.level}, ${Math.round(lvl.progress * 100)}% to next`}>
          <span className="pc-me__lvl">
            <span className="neo-hud">LVL</span>
            {lvl.level}
          </span>
        </Ring>
        <div className="pc-me__text">
          <div className="neo-hud neo-hud--tint">Your pulse</div>
          <div className="pc-me__title">{levelTitle(lvl.level)}</div>
          <div className="pc-me__xp neo-mono">
            <strong>{xp.toLocaleString()}</strong> XP
          </div>
          <div className="pc-me__next neo-faint text-xs">{(lvl.next - xp).toLocaleString()} XP to level {lvl.level + 1}</div>
        </div>
      </div>
      <div className={cx('pc-streak', streak.current >= 3 && 'is-hot')}>
        <Flame />
        <span>
          <strong className="neo-num">{streak.current}</strong>-day streak
        </span>
        <span className="grow" />
        <span className="neo-faint text-xs">{streak.activeToday ? 'Active today' : streak.current > 0 ? 'Say hi to keep it' : 'Start one today'}</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- vibe */

function Vibe() {
  const v = useViewer();
  const vibes = useChat((s) => s.vibes);
  const users = useHub((s) => s.users);
  const today = dateKey(Date.now());
  const mine = v ? vibes[today]?.[v.user.id] : undefined;
  const dist = vibeDistribution(vibes);
  const series = vibeSeries(vibes, Date.now(), 14);
  const votes = dist.reduce((a, b) => a + b, 0);
  const avg = votes ? dist.reduce((a, n, i) => a + n * (i + 1), 0) / votes : 0;
  const color = avg ? MOODS[Math.min(4, Math.max(0, Math.round(avg) - 1))].color : '#64748b';
  const eligible = users.filter((u) => u.active && !u.roleIds.includes('contractor')).length;
  const vote = (m: Mood) => {
    const res = useChat.getState().voteVibe(m);
    if (!res.ok) return toast.error(res.error);
    toast.success('Thanks for checking in', 'Your vote is anonymous — only team averages are shown.');
  };
  return (
    <section className="pc-tile pc-vibe" data-qa="vibe">
      <header className="pc-tile__head">
        <HeartPulse />
        <h2>Team vibe</h2>
        <span className="neo-hud">Anonymous</span>
      </header>
      <div className="pc-vibe__core">
        <div className="pc-vibe__orb" style={{ ['--vibe' as string]: color }} aria-hidden="true">
          <span className="pc-vibe__value neo-num">{avg ? avg.toFixed(1) : '—'}</span>
          <span className="pc-vibe__label">{avg ? MOODS[Math.round(avg) - 1]?.label : 'No votes yet'}</span>
        </div>
        <div className="pc-vibe__side">
          <div className="pc-vibe__q">{mine ? 'You checked in today — change it anytime.' : 'How’s your energy today?'}</div>
          <div className="pc-moods" role="radiogroup" aria-label="Your mood today">
            {MOODS.map((m) => (
              <button key={m.value} type="button" role="radio" aria-checked={mine === m.value} className={cx('pc-mood', mine === m.value && 'is-on')} style={{ ['--mood' as string]: m.color }} onClick={() => vote(m.value)} aria-label={m.label} data-tip={m.label}>
                <span className="pc-mood__e">{m.emoji}</span>
              </button>
            ))}
          </div>
          <div className="pc-dist" aria-label="Today’s distribution">
            {dist.map((n, i) => (
              <div key={i} className="pc-dist__col" title={`${MOODS[i].label}: ${n}`}>
                <i style={{ height: `${votes ? Math.max(6, (n / Math.max(...dist)) * 100) : 6}%`, background: MOODS[i].color }} />
              </div>
            ))}
          </div>
          <div className="neo-faint text-xs">
            {votes} check-in{votes === 1 ? '' : 's'} today · {eligible ? Math.round((votes / eligible) * 100) : 0}% of the team
          </div>
        </div>
      </div>
      <div className="pc-vibe__trend">
        <span className="neo-hud">14-day trend</span>
        <Spark data={series.map((d) => d.avg ?? 3)} width={260} height={40} />
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- spark */

function DailySpark() {
  const v = useViewer();
  const names = useNames();
  const messages = useChat((s) => s.messages);
  const conv = useChat((s) => s.conversations.find((c) => c.id === 'ch-watercooler'));
  const [text, setText] = useState('');
  const today = dateKey(Date.now());
  const answers = useMemo(() => messages.filter((m) => m.spark?.date === today && !m.deleted).sort((a, b) => Object.values(b.reactions).flat().length - Object.values(a.reactions).flat().length || b.at - a.at), [messages, today]);
  const mine = answers.find((a) => a.authorId === v?.user.id);
  const member = !!v && !!conv?.memberIds.includes(v.user.id);
  const submit = () => {
    const res = useChat.getState().answerSpark(text);
    if (!res.ok) return toast.error(res.error);
    setText('');
    toast.success(mine ? 'Answer updated' : 'Spark shared ✨', 'Posted to #watercooler');
  };
  return (
    <section className="pc-tile pc-sparktile" id="spark" data-qa="daily-spark">
      <header className="pc-tile__head">
        <Sparkles />
        <h2>Daily Spark</h2>
        <span className="neo-hud">{answers.length} answers today</span>
        <Link to="/chat/c/ch-watercooler" className="pc-textbtn pc-tile__link">
          #watercooler <ArrowRight className="pc-hud-icon" />
        </Link>
      </header>
      <blockquote className="pc-sparktile__q">{sparkOfDay()}</blockquote>
      {member ? (
        <form className="pc-sparktile__form" onSubmit={(e) => (e.preventDefault(), submit())}>
          <input className="neo-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={mine ? 'Update your answer…' : 'Your answer…'} maxLength={600} aria-label="Your answer" />
          <button type="submit" className="neo-btn neo-btn--plasma" disabled={text.trim().length < 2} data-qa="spark-submit">
            {mine ? 'Update' : 'Share'}
          </button>
        </form>
      ) : (
        <p className="neo-faint text-sm">Join #watercooler to answer the Daily Spark.</p>
      )}
      <div className="pc-sparkwall">
        {answers.slice(0, 6).map((a) => {
          const hearts = a.reactions['❤️'] ?? [];
          const on = !!v && hearts.includes(v.user.id);
          return (
            <article key={a.id} className={cx('pc-sparkcard', a.authorId === v?.user.id && 'is-mine')}>
              <Md text={a.text} className="pc-sparkcard__text" />
              <footer>
                <AuthorAvatar id={a.authorId} size={22} names={names} />
                <span className="grow truncate text-xs">
                  <strong>{names.first(a.authorId)}</strong> · {relativeTime(a.at)}
                </span>
                <button type="button" className={cx('pc-heart', on && 'is-on')} onClick={() => member && useChat.getState().toggleReaction(a.id, '❤️')} aria-pressed={on} aria-label="Love this answer" disabled={!member}>
                  <Heart /> {hearts.length || ''}
                </button>
              </footer>
            </article>
          );
        })}
        {!answers.length && <p className="neo-faint text-sm">Be the first to answer today ✨</p>}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- kudos */

interface KudosEntry {
  id: string;
  fromId: string;
  toId: string;
  value: import('@/types').KudosValue;
  message: string;
  at: number;
  to: string;
}

function useKudos(): KudosEntry[] {
  const v = useViewer();
  const hubKudos = useHub((s) => s.kudos);
  const messages = useChat((s) => s.messages);
  const conversations = useChat((s) => s.conversations);
  return useMemo(() => {
    const visible = new Set(v ? conversations.filter((c) => canView(c, v.viewer)).map((c) => c.id) : []);
    const mirror = new Map<string, ChatMessage>();
    const chatOnly: KudosEntry[] = [];
    for (const m of messages) {
      if (!m.kudos || m.deleted) continue;
      if (m.kudos.hubKudosId) mirror.set(m.kudos.hubKudosId, m);
      else if (visible.has(m.convId)) chatOnly.push({ id: m.id, fromId: m.authorId, toId: m.kudos.toId, value: m.kudos.value, message: m.text, at: m.at, to: chatLink(m.convId, { msg: m.id }) });
    }
    const fromHub = hubKudos.map((k) => {
      const m = mirror.get(k.id);
      return { id: k.id, fromId: k.fromId, toId: k.toId, value: k.value, message: k.message, at: k.at, to: m && visible.has(m.convId) ? chatLink(m.convId, { msg: m.id }) : '/' };
    });
    return [...fromHub, ...chatOnly].sort((a, b) => b.at - a.at);
  }, [hubKudos, messages, conversations, v]);
}

function KudosWall({ onSend }: { onSend?: () => void }) {
  const names = useNames();
  const list = useKudos();
  return (
    <section className="pc-tile pc-kudoswall" data-qa="kudos-wall">
      <header className="pc-tile__head">
        <Trophy />
        <h2>Kudos wall</h2>
        <span className="neo-hud">Hub + chat</span>
        {onSend && (
          <button type="button" className="neo-btn neo-btn--soft neo-btn--sm pc-tile__link" onClick={onSend}>
            <Trophy /> Send kudos
          </button>
        )}
      </header>
      <div className="pc-kudosgrid">
        {list.slice(0, 6).map((k) => {
          const meta = kudosMeta(k.value);
          return (
            <Link key={k.id} to={k.to} className="pc-kcard neo-spot" data-tone={meta.tone}>
              <div className="row" style={{ gap: 8 }}>
                <AuthorAvatar id={k.toId} size={30} names={names} />
                <span className="grow" style={{ minWidth: 0 }}>
                  <strong className="truncate" style={{ display: 'block' }}>
                    {names.name(k.toId)}
                  </strong>
                  <span className="neo-faint text-xs">from {names.first(k.fromId)} · {relativeTime(k.at)}</span>
                </span>
                <Chip tone={meta.tone} size="sm">
                  {meta.label}
                </Chip>
              </div>
              <p className="pc-kcard__msg clamp-2">“{k.message}”</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Leaderboard() {
  const names = useNames();
  const list = useKudos();
  const [tab, setTab] = useState<'receivers' | 'givers'>('receivers');
  const leaders = useMemo(() => kudosLeaders(list, Date.now() - 30 * DAY, 5), [list]);
  const rows = leaders[tab];
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="pc-tile pc-leaders" data-qa="leaderboard">
      <header className="pc-tile__head">
        <Award />
        <h2>Leaderboard</h2>
        <span className="neo-hud">Last 30 days</span>
      </header>
      <NeoTabs
        value={tab}
        onChange={setTab}
        variant="underline"
        label="Leaderboard"
        items={[
          { value: 'receivers', label: 'Most appreciated' },
          { value: 'givers', label: 'Top givers' },
        ]}
      />
      <ol className="pc-leaders__list">
        {rows.map((r, i) => (
          <li key={r.id}>
            <span className={cx('pc-rank', i === 0 && 'is-gold')}>{i + 1}</span>
            <AuthorAvatar id={r.id} size={28} names={names} />
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="truncate" style={{ display: 'block', fontWeight: 600 }}>
                {names.name(r.id)}
              </span>
              <span className="pc-leaders__bar">
                <i style={{ width: `${(r.count / max) * 100}%` }} />
              </span>
            </span>
            <span className="neo-num">{r.count}</span>
          </li>
        ))}
        {!rows.length && <li className="neo-faint text-sm">No kudos yet this month.</li>}
      </ol>
    </section>
  );
}

/* ---------------------------------------------------------------- celebrations */

function SignButton({ occ, signed }: { occ: Occasion; signed: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const names = useNames();
  const submit = () => {
    const res = useChat.getState().signCard(occ, note);
    if (!res.ok) return toast.error(res.error);
    setOpen(false);
    setNote('');
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      burstConfetti({ x: r.left + r.width / 2, y: r.top });
    }
    toast.success(res.created ? 'Card started in #celebrations 💌' : 'Card signed 💌');
  };
  return (
    <>
      <button ref={ref} type="button" className={cx('neo-btn neo-btn--xs', signed ? 'neo-btn--ghost' : 'neo-btn--soft')} onClick={() => setOpen(true)} data-qa="pulse-sign">
        {signed ? <Check /> : <PenLine />} {signed ? 'Signed' : 'Sign the card'}
      </button>
      <NeoPopover open={open} anchor={ref.current} onClose={() => setOpen(false)} placement="bottom-end" width={300} label="Sign the card">
        <form className="stack" style={{ gap: 8, padding: 8 }} onSubmit={(e) => (e.preventDefault(), submit())}>
          <div className="neo-hud">A note for {names.first(occ.userId)}</div>
          <input className="neo-input neo-input--sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Happy birthday! 🎂" maxLength={140} autoFocus aria-label="Your note" />
          <button type="submit" className="neo-btn neo-btn--plasma neo-btn--sm" disabled={note.trim().length < 2}>
            {signed ? 'Update note' : 'Sign'}
          </button>
        </form>
      </NeoPopover>
    </>
  );
}

function Celebrations() {
  const v = useViewer();
  const names = useNames();
  const users = useHub((s) => s.users);
  const messages = useChat((s) => s.messages);
  const occasions = useMemo(() => upcomingOccasions(users, Date.now(), 14).slice(0, 7), [users]);
  const cards = useMemo(() => new Map(messages.filter((m) => m.celebration && !m.deleted).map((m) => [m.celebration!.key, m])), [messages]);
  const when = (o: Occasion) => (o.type === 'welcome' ? (o.inDays === 0 ? 'Joined today' : `Joined ${-o.inDays} days ago`) : o.inDays === 0 ? 'Today' : o.inDays === 1 ? 'Tomorrow' : `In ${o.inDays} days`);
  return (
    <section className="pc-tile pc-celebs" data-qa="celebrations">
      <header className="pc-tile__head">
        <CalendarHeart />
        <h2>Celebrations</h2>
        <span className="neo-hud">Next 2 weeks</span>
        <Link to="/chat/c/ch-celebrations" className="pc-textbtn pc-tile__link">
          #celebrations <ArrowRight className="pc-hud-icon" />
        </Link>
      </header>
      <ul className="pc-celebs__list">
        {occasions.map((o) => {
          const card = cards.get(o.key);
          const signed = !!card?.celebration?.signers.some((s) => s.userId === v?.user.id);
          const me = o.userId === v?.user.id;
          const u = names.user(o.userId);
          return (
            <li key={o.key} className={cx(o.inDays === 0 && 'is-today')}>
              <span className="pc-celebs__glyph" aria-hidden="true">
                {o.type === 'birthday' ? '🎂' : o.type === 'anniversary' ? '🏆' : '👋'}
              </span>
              {u && <Avatar user={u} size={34} />}
              <span className="grow" style={{ minWidth: 0 }}>
                <strong className="truncate" style={{ display: 'block' }}>
                  {names.name(o.userId)}
                </strong>
                <span className="neo-faint text-xs">
                  {o.type === 'birthday' ? 'Birthday' : o.type === 'anniversary' ? `${o.years} year${o.years === 1 ? '' : 's'} at Helix` : 'New joiner'} · {when(o)}
                  {card && !me ? ` · ${card.celebration!.signers.length} signed` : ''}
                </span>
              </span>
              {me ? <span className="pc-surprise">🤫 Something’s being planned</span> : <SignButton occ={o} signed={signed} />}
            </li>
          );
        })}
        {!occasions.length && <li className="neo-faint text-sm">No celebrations in the next two weeks.</li>}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------------- coffee */

function CoffeeRoulette({ autoSpin }: { autoSpin: boolean }) {
  const v = useViewer();
  const names = useNames();
  const navigate = useNavigate();
  const users = useHub((s) => s.users);
  const optIn = useChat((s) => (v ? (s.people[v.user.id]?.coffeeOptIn ?? true) : false));
  const matches = useChat((s) => s.coffee.matches);
  const [spinning, setSpinning] = useState(false);
  const [face, setFace] = useState<string | null>(null);
  const [result, setResult] = useState<{ partnerId: string; convId: string } | null>(null);
  const spun = useRef(false);
  const pool = useMemo(() => users.filter((u) => u.active && u.id !== v?.user.id && !u.roleIds.includes('contractor')), [users, v]);
  const mine = matches.filter((m) => v && m.userIds.includes(v.user.id)).slice(-3).reverse();

  const spin = () => {
    if (spinning || !v) return;
    const res = useChat.getState().spinCoffee();
    if (!res.ok) return toast.error(res.error);
    setResult(null);
    setSpinning(true);
    let i = 0;
    let delay = 60;
    const step = () => {
      i += 1;
      setFace(pool[(i * 7) % pool.length]?.id ?? null);
      delay *= 1.12;
      if (delay < 340) window.setTimeout(step, delay);
      else {
        setFace(res.partnerId);
        setSpinning(false);
        setResult(res);
        burstConfetti();
      }
    };
    step();
  };

  useEffect(() => {
    if (autoSpin && !spun.current && v && !v.viewer.contractor) {
      spun.current = true;
      document.getElementById('coffee')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const t = window.setTimeout(spin, 450);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSpin, v]);

  const partner = result ? names.user(result.partnerId) : face ? names.user(face) : undefined;
  if (v?.viewer.contractor)
    return (
      <section className="pc-tile pc-coffee-tile" id="coffee">
        <header className="pc-tile__head">
          <Coffee />
          <h2>Coffee Roulette</h2>
        </header>
        <p className="neo-faint text-sm">Coffee Roulette is available to Helix employees.</p>
      </section>
    );
  return (
    <section className="pc-tile pc-coffee-tile" id="coffee" data-qa="coffee-roulette">
      <header className="pc-tile__head">
        <Coffee />
        <h2>Coffee Roulette</h2>
        <label className="pc-optin">
          <input type="checkbox" className="neo-check" checked={optIn} onChange={(e) => useChat.getState().setCoffeeOptIn(e.target.checked)} /> Opted in
        </label>
      </header>
      <div className="pc-roulette">
        <div className={cx('pc-roulette__wheel', spinning && 'is-spinning', result && 'is-done')}>
          <div className="pc-roulette__ring" aria-hidden="true" />
          {partner ? <Avatar user={partner} size={78} /> : <Shuffle className="pc-roulette__idle" />}
        </div>
        <div className="pc-roulette__info">
          {result && partner ? (
            <>
              <div className="neo-hud neo-hud--tint">It’s a match ☕</div>
              <div className="pc-roulette__name">{partner.name}</div>
              <div className="neo-faint text-xs">
                {partner.title} · {partner.department} · {localTime(partner.timezone)} in {partner.location}
              </div>
              <div className="row" style={{ gap: 6, marginTop: 10 }}>
                <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={() => navigate(`/chat/c/${result.convId}`)} data-qa="coffee-open">
                  <MessageSquare /> Open chat
                </button>
                <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={spin}>
                  <Shuffle /> Spin again
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="pc-roulette__name">{spinning ? 'Finding your match…' : 'Meet someone new'}</div>
              <p className="neo-faint text-sm">We pair you with a colleague from another team for a 15-minute chat — and break the ice for you.</p>
              <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={spin} disabled={spinning} data-qa="coffee-spin">
                <Shuffle /> {spinning ? 'Spinning…' : 'Spin'}
              </button>
            </>
          )}
        </div>
      </div>
      {mine.length > 0 && (
        <div className="pc-coffee-recent">
          <span className="neo-hud">Recent matches</span>
          {mine.map((m) => {
            const other = m.userIds.find((id) => id !== v?.user.id)!;
            return (
              <Link key={m.id} to={`/chat/c/${m.convId}`} className="pc-coffee-recent__item">
                <AuthorAvatar id={other} size={20} names={names} /> {names.first(other)} <span className="neo-faint">· {relativeTime(m.at)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- badges */

const BADGE_ICON = { vote: Vote, trophy: Trophy, headphones: Headphones, sparkles: Sparkles, coffee: Coffee, heart: Heart, flame: Flame, message: MessageSquare, zap: Zap, award: Award };

function Badges() {
  const v = useViewer();
  const stats = useChat((s) => (v ? s.stats[v.user.id] : undefined)) ?? emptyStats();
  const streak = streakOf(stats.activeDays);
  const list = badgeProgress(stats, streak.current);
  const earned = list.filter((b) => b.earned).length;
  return (
    <section className="pc-tile pc-badges" data-qa="badges">
      <header className="pc-tile__head">
        <Award />
        <h2>Streaks & badges</h2>
        <span className="neo-hud">
          {earned}/{list.length} earned
        </span>
      </header>
      <div className="pc-badges__grid">
        {list.map((b) => {
          const I = BADGE_ICON[b.icon];
          return (
            <div key={b.id} className={cx('pc-badge', b.earned && 'is-earned')} title={`${b.label} — ${b.description} (${b.current}/${b.target})`}>
              <Ring value={b.progress} size={52} stroke={4}>
                <I className="pc-badge__icon" />
              </Ring>
              <span className="pc-badge__label">{b.label}</span>
              <span className="pc-badge__sub neo-mono">{b.earned ? 'Earned' : `${b.current}/${b.target}`}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- live polls */

function LivePolls() {
  const v = useViewer();
  const messages = useChat((s) => s.messages);
  const conversations = useChat((s) => s.conversations);
  const polls = useMemo(() => {
    if (!v) return [];
    const mine = new Map(conversations.filter((c) => c.memberIds.includes(v.user.id) && canView(c, v.viewer)).map((c) => [c.id, c]));
    return messages
      .filter((m) => m.poll && !m.poll.closed && !m.deleted && mine.has(m.convId))
      .sort((a, b) => b.at - a.at)
      .slice(0, 3)
      .map((m) => ({ m, c: mine.get(m.convId)! }));
  }, [messages, conversations, v]);
  return (
    <section className="pc-tile pc-livepolls" data-qa="live-polls">
      <header className="pc-tile__head">
        <Vote />
        <h2>Live polls</h2>
        <span className="neo-hud">{polls.length} open</span>
      </header>
      <div className="stack" style={{ gap: 10 }}>
        {polls.map(({ m, c }) => (
          <div key={m.id}>
            <Link to={chatLink(c.id, { msg: m.id })} className="pc-textbtn">
              {c.kind === 'channel' ? `#${c.name}` : 'Direct message'} <ArrowRight className="pc-hud-icon" />
            </Link>
            <PollCard m={m} conv={c} />
          </div>
        ))}
        {!polls.length && <p className="neo-faint text-sm">No open polls in your conversations. Start one with /poll.</p>}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- page */

export function PulseView() {
  const v = useViewer();
  const shell = useChatShell();
  const users = useHub((s) => s.users);
  const live = useChatUI((s) => s.presence);
  const messages = useChat((s) => s.messages);
  const conversations = useChat((s) => s.conversations);
  const [params] = useSearchParams();
  const { hash } = useLocation();
  const [kudos, setKudos] = useState(false);
  const visibleMessages = useMemo(() => {
    if (!v) return [];
    const vis = new Set(conversations.filter((c) => canView(c, v.viewer)).map((c) => c.id));
    return messages.filter((m) => vis.has(m.convId));
  }, [messages, conversations, v]);
  const online = users.filter((u) => u.active && (live[u.id] ?? u.presence) === 'online').length;
  useEffect(() => {
    if (hash === '#spark') document.getElementById('spark')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [hash]);
  const canKudos = !!v && canGiveKudos(v.viewer);
  return (
    <>
      <NeoHead
        icon={<HeartPulse />}
        eyebrow="Pulse Chat"
        title="Pulse"
        sub="The social heartbeat of Helix"
        onToggleSide={shell.toggleSide}
        actions={
          canKudos ? (
            <button type="button" className="neo-btn neo-btn--plasma" onClick={() => setKudos(true)} data-qa="pulse-kudos">
              <Trophy /> <span className="neo-btn__label">Send kudos</span>
            </button>
          ) : (
            <NovaChip>Read-only for contractors</NovaChip>
          )
        }
      />
      <div className="neo-body neo-pad pc-pulse">
        <div className="pc-pulse__top">
          <Heartbeat messages={visibleMessages} online={online} />
          <MyPulse />
        </div>
        <div className="pc-pulse__grid">
          <Vibe />
          <DailySpark />
          <KudosWall onSend={canKudos ? () => setKudos(true) : undefined} />
          <Leaderboard />
          <Celebrations />
          <CoffeeRoulette autoSpin={params.get('spin') === '1'} />
          <Badges />
          <LivePolls />
        </div>
      </div>
      <KudosDialog open={kudos} onClose={() => setKudos(false)} />
    </>
  );
}
