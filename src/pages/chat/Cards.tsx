/**
 * Rich, interactive message cards for Pulse Chat.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  Coffee,
  ExternalLink,
  Forward,
  Gavel,
  Lock,
  Pause,
  Play,
  PenLine,
  Sparkles,
  Target,
  Trophy,
  Users,
} from 'lucide-react';
import { Chip, Avatars, NovaChip } from '@/components/neo';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/primitives';
import type { BridgeCard } from '@/lib/appBridge';
import { cx } from '@/lib/cx';
import { formatDate, relativeTime } from '@/lib/format';
import { mmss } from '@/lib/format';
import { toast } from '@/store/toast';
import { canClosePoll } from '@/chat/access';
import { APP_META, kudosMeta } from '@/chat/constants';
import { useChat } from '@/chat/store';
import type { Attachment, ChatMessage, Conversation, DriveFileRef } from '@/chat/types';
import { createTasksFromRecap } from './actions';
import { useNames, useViewer } from './hooks';
import { APP_ICON, AuthorAvatar, bytes, fileIcon, FILE_TONE, fmtTime, GlyphTile, Md } from './parts';
import { useChatUI } from './ui';

/* ---------------------------------------------------------------- poll */

export function PollCard({ m, conv }: { m: ChatMessage; conv: Conversation }) {
  const v = useViewer();
  const names = useNames();
  const poll = m.poll!;
  const total = new Set(Object.values(poll.votes).flat()).size;
  const votesCast = Object.values(poll.votes).reduce((a, b) => a + b.length, 0);
  const mine = v ? poll.options.filter((o) => poll.votes[o.id]?.includes(v.user.id)).map((o) => o.id) : [];
  const max = Math.max(1, ...poll.options.map((o) => poll.votes[o.id]?.length ?? 0));
  const member = !!v && conv.memberIds.includes(v.user.id);
  const showResults = poll.closed || mine.length > 0 || !member;
  const vote = (id: string) => {
    const res = useChat.getState().votePoll(m.id, id);
    if (!res.ok) toast.error(res.error);
  };
  return (
    <div className={cx('pc-card pc-poll', poll.closed && 'is-closed')} data-qa="poll">
      <div className="pc-card__hud">
        <span className="neo-hud neo-hud--tint">Poll</span>
        <span className="neo-hud">{poll.multi ? 'Multiple choice' : 'Single choice'}</span>
        {poll.anonymous && (
          <span className="neo-hud">
            <Lock className="pc-hud-icon" /> Anonymous
          </span>
        )}
        {poll.closed && <Chip tone="slate" size="sm">Closed</Chip>}
      </div>
      <div className="pc-poll__q">{poll.question}</div>
      <div className="pc-poll__opts" role="group" aria-label={poll.question}>
        {poll.options.map((o) => {
          const n = poll.votes[o.id]?.length ?? 0;
          const pct = votesCast ? Math.round((n / votesCast) * 100) : 0;
          const picked = mine.includes(o.id);
          const winner = poll.closed && n === max && n > 0;
          return (
            <button
              key={o.id}
              type="button"
              className={cx('pc-poll__opt', picked && 'is-picked', winner && 'is-winner')}
              onClick={() => vote(o.id)}
              disabled={poll.closed || !member}
              aria-pressed={picked}
            >
              <span className="pc-poll__fill" style={{ width: showResults ? `${(n / max) * 100}%` : 0 }} />
              <span className={cx('pc-poll__check', poll.multi && 'is-square')}>{picked && <Check />}</span>
              <span className="pc-poll__text">{o.text}</span>
              {winner && <Trophy className="pc-poll__trophy" />}
              {!poll.anonymous && n > 0 && showResults && (
                <span className="pc-poll__voters">
                  <Avatars users={(poll.votes[o.id] ?? []).map((id) => names.user(id)).filter((u): u is NonNullable<typeof u> => !!u)} max={3} size={18} />
                </span>
              )}
              {showResults && <span className="pc-poll__pct neo-num">{pct}%</span>}
            </button>
          );
        })}
      </div>
      <div className="pc-card__foot">
        <span className="neo-faint text-xs">
          {total} {total === 1 ? 'person' : 'people'} voted{poll.closed && poll.closedAt ? ` · closed ${relativeTime(poll.closedAt)}` : ''}
          {!showResults && member && ' · vote to see results'}
        </span>
        {!poll.closed && v && canClosePoll(m, conv, v.viewer) && (
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => toast.result(useChat.getState().closePoll(m.id), 'Poll closed')}>
            Close poll
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- kudos */

export function KudosCard({ m }: { m: ChatMessage }) {
  const names = useNames();
  const v = useViewer();
  const k = m.kudos!;
  const meta = kudosMeta(k.value);
  const claps = m.reactions['👏'] ?? [];
  const mine = !!v && claps.includes(v.user.id);
  return (
    <div className="pc-card pc-kudos" data-tone={meta.tone} data-qa="kudos">
      <div className="pc-kudos__glow" aria-hidden="true" />
      <div className="pc-card__hud">
        <span className="neo-hud neo-hud--tint">Kudos</span>
        <Chip tone={meta.tone} size="sm" icon={<Trophy />}>
          {meta.label}
        </Chip>
        {k.hubKudosId && (
          <span className="neo-hud" title="Also on the Hub kudos wall">
            <BadgeCheck className="pc-hud-icon" /> On the Hub wall
          </span>
        )}
      </div>
      <div className="pc-kudos__people">
        <AuthorAvatar id={m.authorId} size={34} names={names} />
        <ArrowRight className="pc-kudos__arrow" />
        <span className="pc-kudos__to">
          <AuthorAvatar id={k.toId} size={46} names={names} />
        </span>
        <div className="pc-kudos__names">
          <span className="pc-kudos__name">{names.name(k.toId)}</span>
          <span className="neo-faint text-xs">from {names.first(m.authorId)} · {meta.blurb}</span>
        </div>
      </div>
      {m.text && <Md text={m.text} className="pc-kudos__note" />}
      <div className="pc-card__foot">
        <button type="button" className={cx('pc-plusone', mine && 'is-on')} onClick={() => useChat.getState().toggleReaction(m.id, '👏')} aria-pressed={mine}>
          👏 <span>{mine ? 'You +1’d' : '+1'}</span>
          {claps.length > 0 && <span className="neo-num">{claps.length}</span>}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- standup */

export function StandupCard({ m }: { m: ChatMessage }) {
  const s = m.standup!;
  return (
    <div className="pc-card pc-standup" data-qa="standup">
      <div className="pc-card__hud">
        <span className="neo-hud neo-hud--tint">Async standup</span>
        <span className="neo-hud">{formatDate(m.at, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
      </div>
      <div className="pc-standup__cols">
        <section>
          <h4>
            <CheckCircle2 /> Yesterday
          </h4>
          <ul>{s.yesterday.length ? s.yesterday.map((x, i) => <li key={i}><Md text={x} /></li>) : <li className="neo-faint">—</li>}</ul>
        </section>
        <section>
          <h4>
            <Target /> Today
          </h4>
          <ul>{s.today.length ? s.today.map((x, i) => <li key={i}><Md text={x} /></li>) : <li className="neo-faint">—</li>}</ul>
        </section>
        <section className={cx(s.blockers.length && 'has-blockers')}>
          <h4>
            <AlertTriangle /> Blockers
          </h4>
          <ul>{s.blockers.length ? s.blockers.map((x, i) => <li key={i}><Md text={x} /></li>) : <li className="pc-standup__clear">No blockers 🎉</li>}</ul>
        </section>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- celebration */

export function CelebrationCard({ m }: { m: ChatMessage }) {
  const v = useViewer();
  const names = useNames();
  const c = m.celebration!;
  const [signing, setSigning] = useState(false);
  const [note, setNote] = useState('');
  const [showAll, setShowAll] = useState(false);
  const me = v?.user.id;
  const isHonoree = me === c.userId;
  const occasionDate = new Date(`${c.date}T00:00:00`);
  const upcoming = occasionDate.getTime() > Date.now() - 86_400_000 * 0.5 && occasionDate.getTime() > new Date().setHours(0, 0, 0, 0);
  const surprise = isHonoree && upcoming;
  const signed = !!me && c.signers.some((s) => s.userId === me);
  const glyph = c.type === 'birthday' ? '🎂' : c.type === 'anniversary' ? '🏆' : '👋';
  const title = c.type === 'birthday' ? `Happy birthday, ${names.first(c.userId)}!` : c.type === 'anniversary' ? `${c.years} year${c.years === 1 ? '' : 's'} at Helix` : `Welcome to Helix, ${names.first(c.userId)}!`;
  const submit = () => {
    const res = useChat.getState().signCard({ type: c.type, userId: c.userId, date: c.date, inDays: 0, years: c.years, key: c.key }, note);
    if (!res.ok) return toast.error(res.error);
    setSigning(false);
    setNote('');
    toast.success(signed ? 'Note updated' : 'Card signed 💌');
  };
  if (surprise)
    return (
      <div className="pc-card pc-celebrate is-surprise" data-qa="celebration">
        <div className="pc-celebrate__glyph">🤫</div>
        <div>
          <div className="pc-celebrate__title">Shh… something is being planned for you</div>
          <div className="neo-faint text-sm">{c.signers.length} teammates are in on it. No peeking until {formatDate(occasionDate, { weekday: 'long', day: 'numeric', month: 'short' })}.</div>
        </div>
      </div>
    );
  const shown = showAll ? c.signers : c.signers.slice(-3);
  return (
    <div className="pc-card pc-celebrate" data-type={c.type} data-qa="celebration">
      <div className="pc-celebrate__head">
        <span className="pc-celebrate__ring">
          <AuthorAvatar id={c.userId} size={54} names={names} />
          <span className="pc-celebrate__badge" aria-hidden="true">
            {glyph}
          </span>
        </span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="neo-hud neo-hud--tint">{c.type === 'birthday' ? 'Birthday card' : c.type === 'anniversary' ? 'Work anniversary' : 'Welcome card'}</div>
          <div className="pc-celebrate__title">{title}</div>
          <div className="neo-faint text-xs">
            <CalendarDays className="pc-hud-icon" /> {formatDate(occasionDate, { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
      </div>
      <div className="pc-celebrate__notes">
        {shown.map((s) => (
          <div key={s.userId} className="pc-celebrate__note">
            <AuthorAvatar id={s.userId} size={22} names={names} />
            <span>
              <strong>{names.first(s.userId)}</strong> {s.note}
            </span>
          </div>
        ))}
        {c.signers.length > 3 && (
          <button type="button" className="pc-textbtn" onClick={() => setShowAll((x) => !x)}>
            {showAll ? 'Show less' : `Show all ${c.signers.length} notes`}
          </button>
        )}
      </div>
      {signing ? (
        <form className="pc-celebrate__sign" onSubmit={(e) => (e.preventDefault(), submit())}>
          <input className="neo-input neo-input--sm" autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder={`A note for ${names.first(c.userId)}…`} maxLength={140} aria-label="Your note" />
          <button type="submit" className="neo-btn neo-btn--plasma neo-btn--sm" disabled={note.trim().length < 2}>
            Sign
          </button>
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => setSigning(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <div className="pc-card__foot">
          <span className="row" style={{ gap: 8 }}>
            <Avatars users={c.signers.map((s) => names.user(s.userId)).filter((u): u is NonNullable<typeof u> => !!u)} max={6} size={22} />
            <span className="neo-faint text-xs">{c.signers.length} signed</span>
          </span>
          {!isHonoree && v && (
            <button type="button" className={cx('neo-btn neo-btn--sm', signed ? 'neo-btn--soft' : 'neo-btn--plasma')} onClick={() => (setNote(c.signers.find((s) => s.userId === me)?.note ?? ''), setSigning(true))} data-qa="sign-card">
              <PenLine /> {signed ? 'Edit your note' : 'Sign the card'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- huddle recap */

export function HuddleRecapCard({ m, conv }: { m: ChatMessage; conv: Conversation }) {
  const names = useNames();
  const h = m.huddle!;
  const [busy, setBusy] = useState(false);
  const pending = h.actionItems.filter((a) => !a.taskTo).length;
  const mins = Math.max(1, Math.round((h.endedAt - h.startedAt) / 60_000));
  return (
    <div className="pc-card pc-recap" data-qa="huddle-recap">
      <div className="pc-card__hud">
        <span className="neo-hud neo-hud--tint">Huddle recap</span>
        <span className="neo-hud">
          {mins} min · {fmtTime(h.startedAt)}–{fmtTime(h.endedAt)}
        </span>
        <NovaChip>Nova notes</NovaChip>
      </div>
      <div className="row" style={{ gap: 10, margin: '4px 0 10px' }}>
        <Avatars users={h.participantIds.map((id) => names.user(id)).filter((u): u is NonNullable<typeof u> => !!u)} max={6} size={24} />
        <span className="neo-faint text-xs">{h.participantIds.map(names.first).join(', ')}</span>
      </div>
      {h.keyPoints.length > 0 && (
        <>
          <div className="pc-recap__label">Key points</div>
          <ul className="pc-recap__points">
            {h.keyPoints.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </>
      )}
      {h.actionItems.length > 0 && (
        <>
          <div className="pc-recap__label">Action items</div>
          <ul className="pc-recap__actions">
            {h.actionItems.map((a) => (
              <li key={a.id} className={cx(a.taskTo && 'is-done')}>
                <span className="pc-recap__tick">{a.taskTo ? <Check /> : null}</span>
                <span className="grow">{a.text}</span>
                {a.ownerId && <AuthorAvatar id={a.ownerId} size={20} names={names} />}
                {a.taskTo && (
                  <Link className="pc-textbtn" to={a.taskTo}>
                    Task <ExternalLink className="pc-hud-icon" />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {pending > 0 && (
        <div className="pc-card__foot">
          <span className="neo-faint text-xs">Turn action items into Helix Projects tasks</span>
          <button
            type="button"
            className="neo-btn neo-btn--soft neo-btn--sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await createTasksFromRecap(m, conv);
              setBusy(false);
            }}
            data-qa="recap-tasks"
          >
            <Target /> Create {pending} task{pending === 1 ? '' : 's'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- voice */

export function VoiceCard({ m }: { m: ChatMessage }) {
  const voice = m.voice!;
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [showText, setShowText] = useState(false);
  const raf = useRef(0);
  useEffect(() => {
    if (!playing) return;
    const start = performance.now() - pos * 1000;
    const step = (t: number) => {
      const s = (t - start) / 1000;
      if (s >= voice.durationSec) {
        setPos(0);
        setPlaying(false);
        return;
      }
      setPos(s);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);
  const progress = pos / voice.durationSec;
  return (
    <div className="pc-card pc-voice" data-qa="voice">
      <div className="pc-voice__row">
        <button type="button" className="pc-voice__play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause voice note' : 'Play voice note'}>
          {playing ? <Pause /> : <Play />}
        </button>
        <div
          className="pc-voice__wave"
          role="slider"
          aria-label="Playback position"
          aria-valuemin={0}
          aria-valuemax={voice.durationSec}
          aria-valuenow={Math.round(pos)}
          tabIndex={0}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setPos(Math.max(0, Math.min(voice.durationSec - 0.1, ((e.clientX - r.left) / r.width) * voice.durationSec)));
          }}
        >
          {voice.peaks.map((p, i) => (
            <i key={i} className={cx(i / voice.peaks.length < progress && 'is-played')} style={{ height: `${Math.max(14, p * 100)}%` }} />
          ))}
        </div>
        <span className="pc-voice__time neo-mono">{mmss((playing || pos ? pos : voice.durationSec) * 1000)}</span>
      </div>
      {voice.transcript && (
        <div className="pc-voice__tx">
          <button type="button" className="pc-textbtn" onClick={() => setShowText((s) => !s)}>
            <Sparkles className="pc-hud-icon" /> {showText ? 'Hide transcript' : 'Show transcript'}
          </button>
          {showText && <p className="pc-voice__text">{voice.transcript}</p>}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- coffee, spark, decision */

export function CoffeeMatchCard({ m }: { m: ChatMessage }) {
  const names = useNames();
  const c = m.coffee!;
  const [a, b] = c.userIds;
  return (
    <div className="pc-card pc-coffee" data-qa="coffee">
      <div className="pc-card__hud">
        <span className="neo-hud neo-hud--tint">
          <Coffee className="pc-hud-icon" /> Coffee Roulette
        </span>
        <span className="neo-hud">It’s a match</span>
      </div>
      <div className="pc-coffee__pair">
        <div className="pc-coffee__person">
          <AuthorAvatar id={a} size={44} names={names} />
          <span className="pc-coffee__name">{names.first(a)}</span>
          <span className="neo-faint text-xs">{names.user(a)?.department}</span>
        </div>
        <div className="pc-coffee__link" aria-hidden="true">
          <span>☕</span>
        </div>
        <div className="pc-coffee__person">
          <AuthorAvatar id={b} size={44} names={names} />
          <span className="pc-coffee__name">{names.first(b)}</span>
          <span className="neo-faint text-xs">{names.user(b)?.department}</span>
        </div>
      </div>
      <div className="pc-coffee__prompt">
        <span className="neo-hud">Conversation starter</span>
        <p>{c.prompt}</p>
      </div>
    </div>
  );
}

export function SparkAnswer({ m }: { m: ChatMessage }) {
  return (
    <div className="pc-spark" data-qa="spark">
      <div className="pc-spark__q">
        <Sparkles className="pc-hud-icon" />
        <span className="neo-hud neo-hud--tint">Daily Spark</span>
        <span className="pc-spark__qtext">{m.spark!.question}</span>
      </div>
      <Md text={m.text} className="pc-spark__a" />
    </div>
  );
}

export function DecisionCard({ m }: { m: ChatMessage }) {
  const names = useNames();
  const d = m.decision!;
  return (
    <div className="pc-card pc-decision" data-status={d.status} data-qa="decision">
      <div className="pc-decision__icon">
        <Gavel />
      </div>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="pc-card__hud">
          <span className="neo-hud neo-hud--tint">Decision</span>
          <Chip tone={d.status === 'decided' ? 'success' : d.status === 'proposed' ? 'amber' : 'rose'} size="sm">
            {d.status === 'decided' ? 'Decided' : d.status === 'proposed' ? 'Proposed' : 'Reversed'}
          </Chip>
        </div>
        <div className="pc-decision__title">{d.title}</div>
        {d.context && <div className="neo-faint text-sm">{d.context}</div>}
        <div className="pc-decision__by">
          <AuthorAvatar id={d.decidedBy} size={18} names={names} /> {names.name(d.decidedBy)} · {formatDate(d.decidedAt, { day: 'numeric', month: 'short' })}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- app & drive cards */

export function AppCard({ card, via }: { card: BridgeCard; via?: string }) {
  const names = useNames();
  const navigate = useNavigate();
  const meta = APP_META[card.app];
  const Icon = APP_ICON[card.app] ?? ExternalLink;
  const tone = /done|resolved|complete|approved|shared/i.test(card.status ?? '') ? 'success' : /pending|waiting|review/i.test(card.status ?? '') ? 'amber' : /overdue|urgent|failed|p1|incident|degraded/i.test(card.status ?? '') ? 'danger' : 'app';
  return (
    <button type="button" className="pc-card pc-appcard neo-spot" onClick={(e) => (e.stopPropagation(), navigate(card.to))} style={{ ['--card-c1' as string]: meta.c1, ['--card-c2' as string]: meta.c2 }} data-qa="app-card">
      <GlyphTile c1={meta.c1} c2={meta.c2} icon={Icon} size={38} />
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="neo-hud">{meta.name}</span>
        <span className="pc-appcard__title">{card.title}</span>
        {card.subtitle && <span className="pc-appcard__sub">{card.subtitle}</span>}
        {via && <span className="pc-appcard__via">via {names.first(via)}</span>}
      </span>
      {card.status && (
        <Chip tone={tone} size="sm">
          {card.status}
        </Chip>
      )}
      <ArrowRight className="pc-appcard__go" />
    </button>
  );
}

export function DriveFileCard({ file }: { file: DriveFileRef }) {
  const names = useNames();
  const navigate = useNavigate();
  const Icon = fileIcon(file.kind);
  const tone = FILE_TONE[file.kind] ?? '#94a3b8';
  return (
    <button type="button" className="pc-card pc-filecard neo-spot" onClick={(e) => (e.stopPropagation(), navigate(file.to))} data-qa="drive-card">
      <span className="pc-filecard__icon" style={{ ['--ft' as string]: tone }}>
        <Icon />
      </span>
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="pc-filecard__name truncate">{file.name}</span>
        <span className="pc-filecard__meta">
          Helix Drive · {names.first(file.ownerId)} · updated {relativeTime(file.updatedAt)}
          {file.size ? ` · ${bytes(file.size)}` : ''}
        </span>
      </span>
      {file.sensitivity !== 'internal' && file.sensitivity !== 'public' && (
        <Chip tone={file.sensitivity === 'restricted' ? 'danger' : 'amber'} size="sm" icon={<Lock />}>
          {file.sensitivity}
        </Chip>
      )}
      <ExternalLink className="pc-appcard__go" />
    </button>
  );
}

export function AttachmentsView({ list }: { list: Attachment[] }) {
  const [zoom, setZoom] = useState<Attachment | null>(null);
  const images = list.filter((a) => a.mime.startsWith('image/') && a.preview);
  const files = list.filter((a) => !(a.mime.startsWith('image/') && a.preview));
  return (
    <>
      {images.length > 0 && (
        <div className={cx('pc-images', images.length > 1 && 'is-grid')}>
          {images.map((a) => (
            <button key={a.id} type="button" className="pc-image" onClick={(e) => (e.stopPropagation(), setZoom(a))} aria-label={`Open ${a.name}`}>
              <img src={a.preview} alt={a.name} loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {files.map((a) => {
        const kind = a.mime.includes('pdf') ? 'pdf' : a.mime.startsWith('image/') ? 'image' : a.mime.startsWith('video/') ? 'video' : a.mime.includes('sheet') || a.name.endsWith('.csv') ? 'sheet' : a.mime.includes('zip') ? 'archive' : 'doc';
        const Icon = fileIcon(kind);
        return (
          <div key={a.id} className="pc-card pc-filecard is-static">
            <span className="pc-filecard__icon" style={{ ['--ft' as string]: FILE_TONE[kind] }}>
              <Icon />
            </span>
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="pc-filecard__name truncate">{a.name}</span>
              <span className="pc-filecard__meta">{bytes(a.size) || 'File'}</span>
            </span>
          </div>
        );
      })}
      <Modal open={!!zoom} onClose={() => setZoom(null)} title={zoom?.name ?? ''} width={880} className="neo-portal pc-lightbox">
        {zoom?.preview && <img src={zoom.preview} alt={zoom.name} className="pc-lightbox__img" />}
      </Modal>
    </>
  );
}

export function ForwardedView({ m }: { m: ChatMessage }) {
  const names = useNames();
  const f = m.forwarded!;
  const conv = useChat((s) => s.conversations.find((c) => c.id === f.convId));
  const label = conv ? (conv.kind === 'channel' ? `#${conv.name}` : 'a direct message') : 'a conversation';
  return (
    <div className="pc-forward">
      <div className="pc-forward__head">
        <Forward className="pc-hud-icon" />
        <AuthorAvatar id={f.authorId} size={18} names={names} />
        <strong>{names.name(f.authorId)}</strong>
        <span className="neo-faint">in {label} · {relativeTime(f.at)}</span>
      </div>
      {f.text && <Md text={f.text} />}
      <Link to={`/chat/c/${f.convId}?msg=${f.messageId}`} className="pc-textbtn">
        View original
      </Link>
    </div>
  );
}

/** Group participant chips used in recap/huddle UIs. */
export function PeopleLine({ ids }: { ids: string[] }) {
  const names = useNames();
  const users = useMemo(() => ids.map((id) => names.user(id)).filter((u): u is NonNullable<typeof u> => !!u), [ids, names]);
  return (
    <span className="row" style={{ gap: 6 }}>
      <Users className="pc-hud-icon" />
      {users.slice(0, 3).map((u) => (
        <Avatar key={u.id} user={u} size={18} />
      ))}
      <span className="neo-faint text-xs">{users.map((u) => u.name.split(' ')[0]).join(', ')}</span>
    </span>
  );
}

/** Scroll the main composer into focus (used by “Say hi” style CTAs). */
export const focusComposer = () => useChatUI.getState().focusComposer();
