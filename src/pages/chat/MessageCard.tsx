import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  Award,
  Bookmark,
  CalendarPlus,
  CheckCircle2,
  Circle,
  Coffee,
  ExternalLink,
  FileText,
  FolderKanban,
  MessageSquareReply,
  Mic,
  Pause,
  Pin,
  Play,
  RefreshCw,
  Rocket,
  Send,
  SmilePlus,
  Sparkles,
} from 'lucide-react';
import type { ChatChannel, ChatKudosBadge, ChatMessage, DeepLinkRef } from '@/chat/types';
import { CHAT_REACTION_EMOJIS } from '@/chat/seed';
import { resolveChatUser, useChatStore } from '@/chat/store';
import { Avatar } from '@/components/ui/primitives';
import { burstConfetti } from '@/lib/confetti';
import { cx } from '@/lib/cx';
import { formatTime, relativeTime } from '@/lib/format';
import { toast } from '@/store/toast';

const BADGE_COLORS: Record<ChatKudosBadge, { color: string; bg: string }> = {
  Teamwork: { color: '#38bdf8', bg: 'rgb(56 189 248 / 0.14)' },
  Craft: { color: '#a78bfa', bg: 'rgb(167 139 250 / 0.14)' },
  Ownership: { color: '#34d399', bg: 'rgb(52 211 153 / 0.14)' },
  'Customer Love': { color: '#f472b6', bg: 'rgb(244 114 182 / 0.14)' },
  Spark: { color: '#fbbf24', bg: 'rgb(251 191 36 / 0.14)' },
};

function renderFormattedText(
  text: string,
  channels: ChatChannel[],
  onSelectChannel: (id: string) => void,
  onNavigate: (route: string) => void,
): ReactNode[] {
  // Tokenize **bold**, `code`, @Name, #channel-name, and (/projects/... or /drive/... or /apps)
  const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`|@[A-Za-z0-9_-]+|#[a-z0-9-]+|\/(?:projects|drive|apps|wiki|hr|talent|expenses|payroll)[A-Za-z0-9/?=&_-]*)/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, idx) => {
    if (!part) return null;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={idx} className="chat-inline-code">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('@') && part.length > 1) {
      return (
        <span key={idx} className="chat-mention">
          {part}
        </span>
      );
    }
    if (part.startsWith('#') && part.length > 1) {
      const chName = part.slice(1).toLowerCase();
      const matched = channels.find((c) => c.name.toLowerCase() === chName);
      return (
        <button
          key={idx}
          type="button"
          className="chat-channel-link"
          onClick={() => matched && onSelectChannel(matched.id)}
        >
          {part}
        </button>
      );
    }
    if (part.startsWith('/')) {
      return (
        <button
          key={idx}
          type="button"
          className="chat-deeplink-inline"
          onClick={() => onNavigate(part)}
        >
          {part}
          <ExternalLink size={11} />
        </button>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function DeepLinkChips({ links, onNavigate }: { links?: DeepLinkRef[]; onNavigate: (route: string) => void }) {
  if (!links?.length) return null;
  return (
    <div className="chat-deeplinks">
      {links.map((link, idx) => (
        <button
          key={`${link.route}-${idx}`}
          type="button"
          className={cx('chat-deeplink-card', `chat-deeplink-card--${link.kind}`)}
          onClick={() => onNavigate(link.route)}
        >
          <span className="chat-deeplink-card__icon">
            {link.kind === 'project' ? <FolderKanban size={15} /> : <FileText size={15} />}
          </span>
          <span className="chat-deeplink-card__body">
            {link.meta && <span className="chat-deeplink-card__meta">{link.meta}</span>}
            <span className="chat-deeplink-card__label">{link.label}</span>
          </span>
          <ExternalLink size={13} className="chat-deeplink-card__ext" />
        </button>
      ))}
    </div>
  );
}

export function MessageCard({
  message,
  currentUserId,
  onOpenThread,
  onSelectChannel,
  compact = false,
}: {
  message: ChatMessage;
  currentUserId: string;
  onOpenThread?: (messageId: string) => void;
  onSelectChannel: (channelId: string) => void;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const channels = useChatStore((s) => s.channels);
  const vibes = useChatStore((s) => s.vibes);
  const toggleReaction = useChatStore((s) => s.toggleReaction);
  const togglePinMessage = useChatStore((s) => s.togglePinMessage);
  const toggleStarMessage = useChatStore((s) => s.toggleStarMessage);
  const votePoll = useChatStore((s) => s.votePoll);
  const boostKudos = useChatStore((s) => s.boostKudos);
  const spinIcebreakerQuestion = useChatStore((s) => s.spinIcebreakerQuestion);
  const answerIcebreaker = useChatStore((s) => s.answerIcebreaker);
  const spinCoffeeMatch = useChatStore((s) => s.spinCoffeeMatch);
  const scheduleCoffeeHuddle = useChatStore((s) => s.scheduleCoffeeHuddle);
  const startOrJoinHuddle = useChatStore((s) => s.startOrJoinHuddle);
  const toggleHuddleActionItem = useChatStore((s) => s.toggleHuddleActionItem);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [icebreakerInput, setIcebreakerInput] = useState('');
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const [voiceElapsed, setVoiceElapsed] = useState(0);

  const author = resolveChatUser(message.authorId);
  const authorVibe = vibes[message.authorId];
  const isStarred = message.starredByIds.includes(currentUserId);

  useEffect(() => {
    if (!isPlayingVoice || !message.voiceNote) return;
    const dur = message.voiceNote.durationSec;
    const timer = window.setInterval(() => {
      setVoiceElapsed((prev) => {
        if (prev + 1 >= dur) {
          setIsPlayingVoice(false);
          return 0;
        }
        return prev + 1;
      });
    }, 350);
    return () => window.clearInterval(timer);
  }, [isPlayingVoice, message.voiceNote]);

  const handleBoostKudos = (e: MouseEvent) => {
    boostKudos(message.id);
    burstConfetti({ x: e.clientX, y: e.clientY });
    toast.success('High-Five +1 Boost sent! 👏');
  };

  const handleIcebreakerSubmit = () => {
    if (!icebreakerInput.trim()) return;
    answerIcebreaker(message.id, icebreakerInput);
    setIcebreakerInput('');
    toast.success('Answer posted to the Watercooler!');
  };

  const reactionEntries = Object.entries(message.reactions).filter(([, ids]) => ids.length > 0);

  return (
    <article
      className={cx(
        'chat-msg',
        message.pinned && 'is-pinned',
        isStarred && 'is-starred',
        `chat-msg--${message.kind}`,
      )}
      data-message-id={message.id}
    >
      {message.pinned && (
        <div className="chat-msg__pin-banner">
          <Pin size={12} />
          <span>Pinned in channel</span>
        </div>
      )}

      <div className="chat-msg__row">
        <div className="chat-msg__avatar">
          <Avatar user={author} size={compact ? 32 : 38} presence />
        </div>

        <div className="chat-msg__main">
          <header className="chat-msg__header">
            <span className="chat-msg__author">{author.name}</span>
            <span className="chat-msg__role">{author.title}</span>
            {authorVibe && (
              <span
                className="chat-msg__vibe-pill"
                title={`Pulse Vibe: ${authorVibe.emoji} ${authorVibe.text}${authorVibe.soundTag ? ` · ${authorVibe.soundTag}` : ''}`}
              >
                <span>{authorVibe.emoji}</span>
                <span className="chat-msg__vibe-text">{authorVibe.text}</span>
              </span>
            )}
            <time className="chat-msg__time" title={formatTime(message.createdAt)}>
              {relativeTime(message.createdAt)}
            </time>
            {isStarred && (
              <span className="chat-msg__star-badge" title="Saved to your bookmarks">
                <Bookmark size={12} />
              </span>
            )}
          </header>

          <div className="chat-msg__body">
            {renderFormattedText(message.body, channels, onSelectChannel, (r) => navigate(r))}
          </div>

          {/* ─────────── KIND: POLL ─────────── */}
          {message.kind === 'poll' && message.poll && (
            <div className="chat-card chat-card--poll">
              <div className="chat-card__head">
                <span className="chat-card__badge chat-card__badge--poll">
                  📊 LIVE POLL · {message.poll.anonymous ? 'Anonymous' : 'Open Voting'}
                </span>
                <span className="chat-card__meta">
                  {message.poll.options.reduce((sum, o) => sum + o.voterIds.length, 0)} votes
                </span>
              </div>
              <h4 className="chat-poll__question">{message.poll.question}</h4>
              <div className="chat-poll__options">
                {(() => {
                  const totalVotes = Math.max(
                    1,
                    message.poll.options.reduce((sum, o) => sum + o.voterIds.length, 0),
                  );
                  const rawTotal = message.poll.options.reduce((sum, o) => sum + o.voterIds.length, 0);
                  return message.poll.options.map((opt) => {
                    const count = opt.voterIds.length;
                    const pct = rawTotal === 0 ? 0 : Math.round((count / totalVotes) * 100);
                    const votedByMe = opt.voterIds.includes(currentUserId);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        className={cx('chat-poll__option', votedByMe && 'is-voted')}
                        onClick={() => votePoll(message.id, opt.id)}
                      >
                        <div className="chat-poll__bar" style={{ width: `${pct}%` }} />
                        <div className="chat-poll__option-content">
                          <span className="chat-poll__option-label">
                            {opt.emoji && <span className="chat-poll__emoji">{opt.emoji}</span>}
                            <span>{opt.label}</span>
                            {votedByMe && <span className="chat-poll__you-tag">Voted</span>}
                          </span>
                          <span className="chat-poll__option-stats">
                            {!message.poll?.anonymous && opt.voterIds.length > 0 && (
                              <span className="chat-poll__voters">
                                {opt.voterIds.slice(0, 4).map((uidKey) => {
                                  const u = resolveChatUser(uidKey);
                                  return <Avatar key={uidKey} user={u} size={18} />;
                                })}
                              </span>
                            )}
                            <strong className="mono">{pct}%</strong>
                            <span className="muted text-xs">({count})</span>
                          </span>
                        </div>
                      </button>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* ─────────── KIND: KUDOS ─────────── */}
          {message.kind === 'kudos' && message.kudos && (() => {
            const recipient = resolveChatUser(message.kudos.recipientId);
            const styleMeta = BADGE_COLORS[message.kudos.badge] ?? BADGE_COLORS.Teamwork;
            return (
              <div
                className="chat-card chat-card--kudos"
                style={{ '--kudos-color': styleMeta.color, '--kudos-bg': styleMeta.bg } as React.CSSProperties}
              >
                <div className="chat-card__head">
                  <span className="chat-kudos__value-badge">
                    <Award size={14} />
                    <span>{message.kudos.badge}</span>
                  </span>
                  <span className="chat-card__meta">Synced with NEXUS Kudos Wall ✨</span>
                </div>

                <div className="chat-kudos__recipient">
                  <Avatar user={recipient} size={46} presence />
                  <div className="chat-kudos__recipient-info">
                    <div className="chat-kudos__recipient-name">{recipient.name}</div>
                    <div className="chat-kudos__recipient-role">
                      {recipient.title} · {recipient.department}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn--primary btn--sm chat-kudos__boost-btn"
                    onClick={handleBoostKudos}
                  >
                    <span>👏 High-Five Boost</span>
                    <span className="chat-kudos__boost-count mono">+{message.kudos.boostCount}</span>
                  </button>
                </div>

                <p className="chat-kudos__headline">“{message.kudos.headline}”</p>
              </div>
            );
          })()}

          {/* ─────────── KIND: ICEBREAKER ─────────── */}
          {message.kind === 'icebreaker' && message.icebreaker && (
            <div className="chat-card chat-card--icebreaker">
              <div className="chat-card__head">
                <span className="chat-card__badge chat-card__badge--icebreaker">
                  🎲 WATERCOOLER ICEBREAKER · {message.icebreaker.category}
                </span>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    spinIcebreakerQuestion(message.id);
                    toast.info('Spun a fresh Watercooler Icebreaker question! 🎲');
                  }}
                >
                  <RefreshCw size={13} />
                  <span>Spin new question</span>
                </button>
              </div>

              <h4 className="chat-icebreaker__question">{message.icebreaker.question}</h4>

              {message.icebreaker.answers.length > 0 && (
                <div className="chat-icebreaker__answers">
                  {message.icebreaker.answers.map((ans) => {
                    const ansUser = resolveChatUser(ans.userId);
                    return (
                      <div key={ans.id} className="chat-icebreaker__answer">
                        <Avatar user={ansUser} size={24} />
                        <div className="chat-icebreaker__answer-body">
                          <strong>{ansUser.name.split(' ')[0]}:</strong> {ans.text}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="chat-icebreaker__reply">
                <input
                  type="text"
                  className="input chat-icebreaker__input"
                  placeholder="Drop your quick answer to today’s prompt…"
                  value={icebreakerInput}
                  onChange={(e) => setIcebreakerInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleIcebreakerSubmit();
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={handleIcebreakerSubmit}
                  disabled={!icebreakerInput.trim()}
                >
                  <Send size={13} />
                  <span>Answer</span>
                </button>
              </div>
            </div>
          )}

          {/* ─────────── KIND: COFFEE MATCH ─────────── */}
          {message.kind === 'coffee_match' && message.coffeeMatch && (() => {
            const [u1Id, u2Id] = message.coffeeMatch.pairUserIds;
            const u1 = resolveChatUser(u1Id);
            const u2 = resolveChatUser(u2Id);
            return (
              <div className="chat-card chat-card--coffee">
                <div className="chat-card__head">
                  <span className="chat-card__badge chat-card__badge--coffee">
                    <Coffee size={13} /> COFFEE ROULETTE · CROSS-TEAM PAIRING
                  </span>
                  <span className="chat-card__meta">
                    {message.coffeeMatch.status === 'scheduled' ? '✅ 15m Huddle Scheduled' : '✨ Fresh Match'}
                  </span>
                </div>

                <div className="chat-coffee__pair">
                  <div className="chat-coffee__person">
                    <Avatar user={u1} size={44} presence />
                    <div>
                      <div className="chat-coffee__name">{u1.name}</div>
                      <div className="chat-coffee__dept">{u1.department} · {u1.location}</div>
                    </div>
                  </div>
                  <div className="chat-coffee__connector">
                    <span>☕</span>
                    <span className="mono text-xs">15 MIN</span>
                  </div>
                  <div className="chat-coffee__person">
                    <Avatar user={u2} size={44} presence />
                    <div>
                      <div className="chat-coffee__name">{u2.name}</div>
                      <div className="chat-coffee__dept">{u2.department} · {u2.location}</div>
                    </div>
                  </div>
                </div>

                <div className="chat-coffee__details">
                  <div className="chat-coffee__spot">📍 {message.coffeeMatch.suggestedSpot}</div>
                  <div className="chat-coffee__interests">
                    {message.coffeeMatch.commonInterests.map((tag) => (
                      <span key={tag} className="chat-coffee__tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                  {message.coffeeMatch.scheduledAt && (
                    <div className="chat-coffee__scheduled-banner">
                      🗓️ Booked: <strong>{message.coffeeMatch.scheduledAt}</strong>
                    </div>
                  )}
                </div>

                <div className="chat-coffee__actions">
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => {
                      scheduleCoffeeHuddle(message.id);
                      startOrJoinHuddle(
                        message.channelId,
                        `Coffee Roulette 15m Huddle · ${u1.name.split(' ')[0]} & ${u2.name.split(' ')[0]}`,
                      );
                      toast.success('15m Coffee Huddle scheduled & launched! ☕');
                    }}
                  >
                    <CalendarPlus size={14} />
                    <span>Schedule 15m Huddle</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => {
                      spinCoffeeMatch(message.channelId, message.id);
                      toast.info('Spun a new cross-department Coffee Roulette match! 🍩');
                    }}
                  >
                    <RefreshCw size={13} />
                    <span>Spin a New Match</span>
                  </button>
                </div>
              </div>
            );
          })()}

          {/* ─────────── KIND: STANDUP ─────────── */}
          {message.kind === 'standup' && message.standup && (
            <div className="chat-card chat-card--standup">
              <div className="chat-card__head">
                <span className="chat-card__badge chat-card__badge--standup">
                  📋 DAILY STANDUP CHECK-IN
                </span>
                <span className="chat-standup__mood">Mood: {message.standup.moodEmoji}</span>
              </div>
              <div className="chat-standup__grid">
                <div className="chat-standup__row">
                  <span className="chat-standup__label chat-standup__label--done">✅ Yesterday</span>
                  <p>{message.standup.yesterday}</p>
                </div>
                <div className="chat-standup__row">
                  <span className="chat-standup__label chat-standup__label--today">🚀 Today</span>
                  <p>{message.standup.today}</p>
                </div>
                <div className="chat-standup__row">
                  <span className="chat-standup__label chat-standup__label--blockers">🛡️ Blockers</span>
                  <p>{message.standup.blockers}</p>
                </div>
              </div>
              <DeepLinkChips links={message.standup.links} onNavigate={(r) => navigate(r)} />
            </div>
          )}

          {/* ─────────── KIND: SHIP-IT MILESTONE ─────────── */}
          {message.kind === 'ship_it' && message.shipIt && (
            <div className="chat-card chat-card--shipit">
              <div className="chat-card__head">
                <span className="chat-card__badge chat-card__badge--shipit">
                  <Rocket size={13} /> SHIPPED MILESTONE · {message.shipIt.version}
                </span>
                <div className="chat-shipit__team">
                  {message.shipIt.teamIds.map((uidKey) => (
                    <Avatar key={uidKey} user={resolveChatUser(uidKey)} size={22} />
                  ))}
                </div>
              </div>
              <h4 className="chat-shipit__title">{message.shipIt.title}</h4>
              <div className="chat-shipit__impact">⚡ Impact: {message.shipIt.impact}</div>
              <ul className="chat-shipit__highlights">
                {message.shipIt.highlights.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
              <DeepLinkChips links={message.shipIt.links} onNavigate={(r) => navigate(r)} />
            </div>
          )}

          {/* ─────────── KIND: VOICE NOTE ─────────── */}
          {message.kind === 'voice_note' && message.voiceNote && (
            <div className="chat-card chat-card--voice">
              <div className="chat-voice__player">
                <button
                  type="button"
                  className={cx('chat-voice__play-btn', isPlayingVoice && 'is-playing')}
                  onClick={() => setIsPlayingVoice((v) => !v)}
                  aria-label={isPlayingVoice ? 'Pause voice note' : 'Play voice note'}
                >
                  {isPlayingVoice ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <div className="chat-voice__waveform">
                  {message.voiceNote.waveform.map((barHeight, i) => {
                    const progressRatio = isPlayingVoice
                      ? (voiceElapsed + 1) / message.voiceNote!.durationSec
                      : 0;
                    const barActive = i / message.voiceNote!.waveform.length <= progressRatio;
                    return (
                      <span
                        key={i}
                        className={cx(
                          'chat-voice__bar',
                          isPlayingVoice && 'is-animating',
                          barActive && 'is-active',
                        )}
                        style={{ height: `${Math.round(barHeight * 28)}px` }}
                      />
                    );
                  })}
                </div>
                <span className="chat-voice__duration mono">
                  {isPlayingVoice
                    ? `0:${String(voiceElapsed).padStart(2, '0')} / 0:${String(message.voiceNote.durationSec).padStart(2, '0')}`
                    : `0:${String(message.voiceNote.durationSec).padStart(2, '0')}`}
                </span>
              </div>
              <div className="chat-voice__transcript">
                <span className="chat-voice__transcript-tag">
                  <Mic size={11} /> Nova Transcript
                </span>
                <p>{message.voiceNote.transcript}</p>
              </div>
            </div>
          )}

          {/* ─────────── KIND: HUDDLE NOTES ─────────── */}
          {message.kind === 'huddle_notes' && message.huddleNotes && (
            <div className="chat-card chat-card--huddle-notes">
              <div className="chat-card__head">
                <span className="chat-card__badge chat-card__badge--nova">
                  <Sparkles size={13} /> NOVA AI HUDDLE SUMMARY · {message.huddleNotes.durationMin}m
                </span>
                <div className="chat-shipit__team">
                  {message.huddleNotes.attendeeIds.map((uidKey) => (
                    <Avatar key={uidKey} user={resolveChatUser(uidKey)} size={22} />
                  ))}
                </div>
              </div>
              <p className="chat-hnotes__summary">{message.huddleNotes.summary}</p>
              {message.huddleNotes.decisions.length > 0 && (
                <div className="chat-hnotes__section">
                  <div className="chat-hnotes__section-title">Key Decisions</div>
                  <ul className="chat-shipit__highlights">
                    {message.huddleNotes.decisions.map((d, idx) => (
                      <li key={idx}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}
              {message.huddleNotes.actionItems.length > 0 && (
                <div className="chat-hnotes__section">
                  <div className="chat-hnotes__section-title">Action Items</div>
                  <div className="chat-hnotes__actions">
                    {message.huddleNotes.actionItems.map((item) => {
                      const owner = resolveChatUser(item.ownerId);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={cx('chat-hnotes__action-item', item.done && 'is-done')}
                          onClick={() => toggleHuddleActionItem(message.id, item.id)}
                        >
                          {item.done ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                          <span className="grow">{item.text}</span>
                          <span className="chat-hnotes__owner">@{owner.name.split(' ')[0]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <DeepLinkChips links={message.attachments} onNavigate={(r) => navigate(r)} />

          {/* ─────────── REACTIONS & THREAD FOOTER ─────────── */}
          <div className="chat-msg__footer">
            {reactionEntries.map(([emoji, userIds]) => {
              const mine = userIds.includes(currentUserId);
              const names = userIds.map((id) => resolveChatUser(id).name.split(' ')[0]).join(', ');
              return (
                <button
                  key={emoji}
                  type="button"
                  className={cx('chat-reaction-chip', mine && 'is-mine')}
                  title={`Reacted by ${names}`}
                  onClick={() => toggleReaction(message.id, emoji)}
                >
                  <span className="chat-reaction-chip__emoji">{emoji}</span>
                  <span className="chat-reaction-chip__count mono">{userIds.length}</span>
                </button>
              );
            })}

            <div className="chat-reaction-picker-wrap">
              <button
                type="button"
                className="chat-reaction-add"
                title="Add emoji reaction"
                onClick={() => setShowEmojiPicker((v) => !v)}
              >
                <SmilePlus size={14} />
              </button>
              {showEmojiPicker && (
                <div className="chat-emoji-popover">
                  {CHAT_REACTION_EMOJIS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      className="chat-emoji-popover__btn"
                      onClick={() => {
                        toggleReaction(message.id, em);
                        setShowEmojiPicker(false);
                      }}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {onOpenThread && (
              <button
                type="button"
                className={cx('chat-thread-trigger', message.replies.length > 0 && 'has-replies')}
                onClick={() => onOpenThread(message.id)}
              >
                <MessageSquareReply size={14} />
                {message.replies.length > 0 ? (
                  <>
                    <strong>
                      {message.replies.length} {message.replies.length === 1 ? 'reply' : 'replies'}
                    </strong>
                    <span className="chat-thread-trigger__avatars">
                      {[...new Set(message.replies.map((r) => r.authorId))].slice(0, 3).map((uidKey) => (
                        <Avatar key={uidKey} user={resolveChatUser(uidKey)} size={18} />
                      ))}
                    </span>
                  </>
                ) : (
                  <span>Reply in thread</span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* ─────────── HOVER QUICK TOOLBAR ─────────── */}
        <div className="chat-msg__toolbar">
          {['🚀', '🔥', '💜', '🎉', '👏'].map((em) => (
            <button
              key={em}
              type="button"
              className="chat-msg__tool-btn"
              title={`React ${em}`}
              onClick={() => toggleReaction(message.id, em)}
            >
              {em}
            </button>
          ))}
          {onOpenThread && (
            <button
              type="button"
              className="chat-msg__tool-btn"
              title="Reply in thread"
              onClick={() => onOpenThread(message.id)}
            >
              <MessageSquareReply size={14} />
            </button>
          )}
          <button
            type="button"
            className={cx('chat-msg__tool-btn', message.pinned && 'is-active')}
            title={message.pinned ? 'Unpin message' : 'Pin to channel'}
            onClick={() => togglePinMessage(message.id)}
          >
            <Pin size={14} />
          </button>
          <button
            type="button"
            className={cx('chat-msg__tool-btn', isStarred && 'is-active')}
            title={isStarred ? 'Remove bookmark' : 'Star / bookmark message'}
            onClick={() => toggleStarMessage(message.id)}
          >
            <Bookmark size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}
