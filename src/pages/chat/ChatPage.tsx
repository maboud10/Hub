import '@/styles/chat.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import {
  Award,
  BarChart3,
  Bookmark,
  ClipboardCheck,
  Coffee,
  Dices,
  Hash,
  Headphones,
  Lock,
  Menu,
  MessageSquarePlus,
  Mic,
  Pin,
  Plus,
  Radio,
  Search,
  Send,
  Slash,
  Sparkles,
  Star,
  Users,
  X,
} from 'lucide-react';
import {
  canViewChannel,
  resolveChatUser,
  useChatStore,
} from '@/chat/store';
import { Avatar } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { ComposerModals, type ChatModalKind } from './ComposerModals';
import { HuddleBar } from './HuddleBar';
import { MessageCard } from './MessageCard';
import { ThreadDrawer } from './ThreadDrawer';

interface SlashCommandDef {
  cmd: string;
  label: string;
  description: string;
  badge: string;
  run: () => void;
}

export function ChatPage() {
  const me = useSessionUser();
  const currentUserId = me?.id ?? 'u-layla';
  const currentUser = me ?? resolveChatUser(currentUserId);

  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const channels = useChatStore((s) => s.channels);
  const messages = useChatStore((s) => s.messages);
  const vibes = useChatStore((s) => s.vibes);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const threadMessageId = useChatStore((s) => s.threadMessageId);
  const activeHuddle = useChatStore((s) => s.activeHuddle);
  const catchUpSummaries = useChatStore((s) => s.catchUpSummaries);
  const searchQuery = useChatStore((s) => s.searchQuery);
  const filterStarredOnly = useChatStore((s) => s.filterStarredOnly);

  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const openThread = useChatStore((s) => s.openThread);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);
  const setFilterStarredOnly = useChatStore((s) => s.setFilterStarredOnly);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const toggleStarChannel = useChatStore((s) => s.toggleStarChannel);
  const dropIcebreaker = useChatStore((s) => s.dropIcebreaker);
  const spinCoffeeMatch = useChatStore((s) => s.spinCoffeeMatch);
  const sendVoiceNote = useChatStore((s) => s.sendVoiceNote);
  const startOrJoinHuddle = useChatStore((s) => s.startOrJoinHuddle);
  const leaveHuddle = useChatStore((s) => s.leaveHuddle);
  const generateCatchUpSummary = useChatStore((s) => s.generateCatchUpSummary);
  const dismissCatchUpSummary = useChatStore((s) => s.dismissCatchUpSummary);

  const [composerText, setComposerText] = useState('');
  const [activeModal, setActiveModal] = useState<ChatModalKind>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(1);
  const [showPinnedStrip, setShowPinnedStrip] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);

  const feedEndRef = useRef<HTMLDivElement>(null);

  // Sync URL path (/chat/c/:id or /chat/dm/:id) with store activeChannelId
  useEffect(() => {
    const match = location.pathname.match(/\/chat\/(?:c|dm)\/([^/]+)/);
    if (match?.[1]) {
      const targetId = match[1];
      if (channels.some((c) => c.id === targetId) && targetId !== activeChannelId) {
        setActiveChannel(targetId);
      }
    }
  }, [location.pathname, channels, activeChannelId, setActiveChannel]);

  // Sync ?huddle=1 and ?compose=poll|kudos|standup query params
  useEffect(() => {
    const huddleParam = searchParams.get('huddle');
    const composeParam = searchParams.get('compose');
    if (huddleParam === '1') {
      startOrJoinHuddle();
      const next = new URLSearchParams(searchParams);
      next.delete('huddle');
      setSearchParams(next, { replace: true });
    }
    if (composeParam === 'poll' || composeParam === 'kudos' || composeParam === 'standup') {
      setActiveModal(composeParam);
      const next = new URLSearchParams(searchParams);
      next.delete('compose');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, startOrJoinHuddle]);

  // Voice recording simulator timer
  useEffect(() => {
    if (!recordingVoice) return;
    const t = window.setInterval(() => {
      setRecordSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(t);
  }, [recordingVoice]);

  const visibleChannels = useMemo(
    () => channels.filter((c) => canViewChannel(c, currentUser)),
    [channels, currentUser],
  );

  const activeChannel = useMemo(
    () =>
      visibleChannels.find((c) => c.id === activeChannelId) ??
      visibleChannels[0] ??
      channels[0],
    [visibleChannels, activeChannelId, channels],
  );

  const channelMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return messages.filter((m) => {
      if (m.channelId !== activeChannel?.id) return false;
      if (filterStarredOnly && !m.starredByIds.includes(currentUserId)) return false;
      if (q) {
        const author = resolveChatUser(m.authorId);
        const hay = `${m.body} ${author.name} ${m.poll?.question ?? ''} ${m.kudos?.headline ?? ''} ${m.icebreaker?.question ?? ''} ${m.shipIt?.title ?? ''}`.toLowerCase();
        return hay.includes(q);
      }
      return true;
    });
  }, [messages, activeChannel?.id, filterStarredOnly, currentUserId, searchQuery]);

  const pinnedMessages = useMemo(
    () => messages.filter((m) => m.channelId === activeChannel?.id && m.pinned),
    [messages, activeChannel?.id],
  );

  const myVibe = vibes[currentUserId];
  const activeCatchUp = activeChannel ? catchUpSummaries[activeChannel.id] : undefined;
  const isInThisHuddle = activeHuddle?.channelId === activeChannel?.id;

  const handleSelectChannel = (channelId: string) => {
    const ch = channels.find((c) => c.id === channelId);
    setActiveChannel(channelId);
    setMobileSidebarOpen(false);
    if (ch) {
      const prefix = ch.kind === 'dm' || ch.kind === 'group_dm' ? 'dm' : 'c';
      navigate(`/chat/${prefix}/${ch.id}`, { replace: true });
    }
  };

  const slashCommands: SlashCommandDef[] = useMemo(
    () => [
      {
        cmd: '/poll',
        label: 'Launch Live Poll',
        description: 'Open interactive multi-option poll builder',
        badge: '📊 Poll',
        run: () => {
          setComposerText('');
          setActiveModal('poll');
        },
      },
      {
        cmd: '/kudos',
        label: 'Send Kudos & Confetti Drop',
        description: 'Celebrate a teammate & sync with NEXUS Hub Kudos Wall',
        badge: '🎉 Kudos',
        run: () => {
          setComposerText('');
          setActiveModal('kudos');
        },
      },
      {
        cmd: '/standup',
        label: 'Post Daily Standup / Ship-It Milestone',
        description: 'Structured Yesterday / Today / Blockers card linked to Projects & Drive',
        badge: '📋 Standup',
        run: () => {
          setComposerText('');
          setActiveModal('standup');
        },
      },
      {
        cmd: '/icebreaker',
        label: 'Drop Watercooler Icebreaker',
        description: 'Post a fun daily Question of the Day card',
        badge: '🎲 Icebreaker',
        run: () => {
          const customQ = composerText.replace(/^\/icebreaker\s*/i, '').trim();
          setComposerText('');
          dropIcebreaker(activeChannel.id, customQ || undefined);
          toast.success('Watercooler Icebreaker card dropped! 🎲');
        },
      },
      {
        cmd: '/coffee',
        label: 'Spin a Coffee Roulette Match',
        description: 'Pair two cross-department colleagues for a 15m espresso chat',
        badge: '☕ Coffee',
        run: () => {
          setComposerText('');
          spinCoffeeMatch(activeChannel.id);
          toast.success('Spun a fresh Coffee Roulette match! ☕');
        },
      },
      {
        cmd: '/huddle',
        label: 'Start or Join Channel Huddle',
        description: 'Launch the Pulse Wave live audio & screen lounge',
        badge: '🎧 Huddle',
        run: () => {
          setComposerText('');
          startOrJoinHuddle(activeChannel.id);
          toast.success('Joined Pulse Wave Live Huddle! 🎧');
        },
      },
      {
        cmd: '/shrug',
        label: 'Append ¯\\_(ツ)_/¯',
        description: 'Insert classic shrug kaomoji into your message',
        badge: '¯\\_(ツ)_/¯',
        run: () => {
          const rest = composerText.replace(/^\/shrug\s*/i, '').trim();
          const finalMsg = `${rest ? `${rest} ` : ''}¯\\_(ツ)_/¯`;
          sendMessage(activeChannel.id, finalMsg);
          setComposerText('');
        },
      },
    ],
    [activeChannel?.id, composerText, dropIcebreaker, sendMessage, spinCoffeeMatch, startOrJoinHuddle],
  );

  const matchingSlashCommands = useMemo(() => {
    const trimmed = composerText.trimStart();
    if (!trimmed.startsWith('/')) return [];
    const token = trimmed.split(/\s+/)[0].toLowerCase();
    return slashCommands.filter((c) => c.cmd.startsWith(token));
  }, [composerText, slashCommands]);

  const handleSendMessage = () => {
    const trimmed = composerText.trim();
    if (!trimmed || !activeChannel) return;

    if (trimmed.startsWith('/')) {
      const cmdToken = trimmed.split(/\s+/)[0].toLowerCase();
      const exact = slashCommands.find((c) => c.cmd === cmdToken) ?? matchingSlashCommands[0];
      if (exact) {
        exact.run();
        return;
      }
    }

    sendMessage(activeChannel.id, trimmed);
    setComposerText('');
  };

  const handleVoiceNoteAction = () => {
    if (!recordingVoice) {
      setRecordSeconds(1);
      setRecordingVoice(true);
      return;
    }
    const dur = Math.max(8, recordSeconds);
    setRecordingVoice(false);
    sendVoiceNote(activeChannel.id, dur);
    toast.success(`Voice note (${dur}s) posted with Nova AI transcript! 🎙️`);
  };

  const dmPartner = useMemo(() => {
    if (!activeChannel || activeChannel.kind !== 'dm') return null;
    const otherId = activeChannel.memberIds.find((id) => id !== currentUserId) ?? activeChannel.memberIds[0];
    return resolveChatUser(otherId);
  }, [activeChannel, currentUserId]);

  const publicAndPrivateChannels = visibleChannels.filter(
    (c) => c.kind === 'public' || c.kind === 'private',
  );
  const dmChannels = visibleChannels.filter((c) => c.kind === 'dm' || c.kind === 'group_dm');
  const starredChannels = visibleChannels.filter((c) => c.starred);

  return (
    <div className="chat-shell">
      {/* Mobile Sidebar Backdrop */}
      {mobileSidebarOpen && (
        <div
          className="chat-mobile-scrim"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ═══════════════════ LEFT SIDEBAR ═══════════════════ */}
      <aside className={cx('chat-sidebar', mobileSidebarOpen && 'is-open')} aria-label="Pulse Chat navigation">
        <div className="chat-sidebar__brand">
          <div className="row row--sm">
            <span className="chat-sidebar__logo">
              <Radio size={17} />
            </span>
            <div>
              <div className="chat-sidebar__title">Pulse Chat</div>
              <div className="chat-sidebar__subtitle">Channels · Huddles · Kudos</div>
            </div>
          </div>
          <button
            type="button"
            className="icon-btn icon-btn--sm"
            title="Start new Direct Message"
            onClick={() => setActiveModal('new_dm')}
          >
            <MessageSquarePlus size={16} />
          </button>
        </div>

        {/* Employee Vibe & Mood Status Card */}
        <button
          type="button"
          className="chat-vibe-card"
          onClick={() => setActiveModal('vibe')}
          title="Click to update your Pulse Vibe & Mood status"
        >
          <Avatar user={currentUser} size={36} presence />
          <div className="chat-vibe-card__info">
            <div className="chat-vibe-card__name">{currentUser.name}</div>
            {myVibe ? (
              <div className="chat-vibe-card__status">
                <span>{myVibe.emoji}</span>
                <span className="truncate">{myVibe.text}</span>
                {myVibe.soundTag && <span className="chat-vibe-card__tag">· {myVibe.soundTag}</span>}
              </div>
            ) : (
              <div className="chat-vibe-card__status muted">✨ Set your Pulse Vibe…</div>
            )}
          </div>
          <span className="chat-vibe-card__edit">Vibe</span>
        </button>

        {/* Sidebar Search */}
        <div className="chat-sidebar__search">
          <Search size={14} />
          <input
            type="text"
            placeholder="Filter messages in channel…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="chat-sidebar__search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear filter"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="chat-sidebar__scroll">
          {/* Starred Section */}
          {starredChannels.length > 0 && (
            <div className="chat-nav-group">
              <div className="chat-nav-group__label">
                <span>⭐ STARRED</span>
              </div>
              {starredChannels.map((ch) => (
                <button
                  key={`star-${ch.id}`}
                  type="button"
                  className={cx('chat-nav-item', activeChannel?.id === ch.id && 'is-active')}
                  onClick={() => handleSelectChannel(ch.id)}
                >
                  <span className="chat-nav-item__icon">{ch.emoji ?? '#'}</span>
                  <span className="chat-nav-item__name truncate">{ch.name}</span>
                  {Boolean(ch.unreadCount) && (
                    <span className="chat-nav-item__badge">{ch.unreadCount}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Channels Section */}
          <div className="chat-nav-group">
            <div className="chat-nav-group__label">
              <span>CHANNELS ({publicAndPrivateChannels.length})</span>
            </div>
            {publicAndPrivateChannels.map((ch) => {
              const hasHuddle = activeHuddle?.channelId === ch.id;
              return (
                <button
                  key={ch.id}
                  type="button"
                  className={cx(
                    'chat-nav-item',
                    activeChannel?.id === ch.id && 'is-active',
                    Boolean(ch.unreadCount) && 'is-unread',
                  )}
                  onClick={() => handleSelectChannel(ch.id)}
                >
                  <span className="chat-nav-item__icon">
                    {ch.kind === 'private' ? <Lock size={13} /> : ch.emoji ?? <Hash size={14} />}
                  </span>
                  <span className="chat-nav-item__name truncate">{ch.name}</span>
                  {hasHuddle && (
                    <span className="chat-nav-item__huddle" title="Live Huddle Active">
                      <Headphones size={12} />
                    </span>
                  )}
                  {Boolean(ch.mentionCount) && (
                    <span className="chat-nav-item__mention">@</span>
                  )}
                  {Boolean(ch.unreadCount) && (
                    <span className="chat-nav-item__badge">{ch.unreadCount}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Direct Messages Section */}
          <div className="chat-nav-group">
            <div className="chat-nav-group__label">
              <span>DIRECT MESSAGES ({dmChannels.length})</span>
              <button
                type="button"
                className="chat-nav-group__add"
                onClick={() => setActiveModal('new_dm')}
                title="Start a new DM"
              >
                <Plus size={13} />
              </button>
            </div>
            {dmChannels.map((dm) => {
              const partnerId =
                dm.memberIds.find((id) => id !== currentUserId) ?? dm.memberIds[0];
              const partner = resolveChatUser(partnerId);
              const partnerVibe = vibes[partnerId];
              return (
                <button
                  key={dm.id}
                  type="button"
                  className={cx(
                    'chat-nav-item chat-nav-item--dm',
                    activeChannel?.id === dm.id && 'is-active',
                    Boolean(dm.unreadCount) && 'is-unread',
                  )}
                  onClick={() => handleSelectChannel(dm.id)}
                >
                  <Avatar user={partner} size={24} presence={dm.kind === 'dm'} />
                  <span className="chat-nav-item__name truncate">{dm.name}</span>
                  {partnerVibe && (
                    <span className="chat-nav-item__vibe" title={`${partnerVibe.emoji} ${partnerVibe.text}`}>
                      {partnerVibe.emoji}
                    </span>
                  )}
                  {Boolean(dm.unreadCount) && (
                    <span className="chat-nav-item__badge">{dm.unreadCount}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      {/* ═══════════════════ MAIN STAGE ═══════════════════ */}
      <main className="chat-stage">
        {/* Channel Header */}
        <header className="chat-header">
          <div className="chat-header__left">
            <button
              type="button"
              className="icon-btn icon-btn--sm chat-header__menu-btn"
              onClick={() => setMobileSidebarOpen((v) => !v)}
              aria-label="Toggle channels sidebar"
            >
              <Menu size={17} />
            </button>

            {activeChannel?.kind === 'dm' && dmPartner ? (
              <Avatar user={dmPartner} size={34} presence />
            ) : (
              <span className="chat-header__channel-badge">
                {activeChannel?.kind === 'private' ? (
                  <Lock size={15} />
                ) : (
                  activeChannel?.emoji ?? <Hash size={16} />
                )}
              </span>
            )}

            <div className="chat-header__titles">
              <div className="row row--sm">
                <h1 className="chat-header__name">
                  {activeChannel?.kind === 'dm' || activeChannel?.kind === 'group_dm'
                    ? activeChannel.name
                    : `#${activeChannel?.name ?? 'general'}`}
                </h1>
                {activeChannel && (
                  <button
                    type="button"
                    className={cx('chat-star-btn', activeChannel.starred && 'is-starred')}
                    onClick={() => toggleStarChannel(activeChannel.id)}
                    title={activeChannel.starred ? 'Unstar channel' : 'Star channel'}
                  >
                    <Star size={14} />
                  </button>
                )}
                {pinnedMessages.length > 0 && (
                  <button
                    type="button"
                    className={cx('chat-header__pill', showPinnedStrip && 'is-active')}
                    onClick={() => setShowPinnedStrip((v) => !v)}
                  >
                    <Pin size={12} />
                    <span>{pinnedMessages.length} pinned</span>
                  </button>
                )}
              </div>
              <p className="chat-header__topic truncate">{activeChannel?.topic}</p>
            </div>
          </div>

          <div className="chat-header__actions">
            {/* Member Avatars */}
            {activeChannel && (
              <div className="chat-header__members" title={`${activeChannel.memberIds.length} members`}>
                {activeChannel.memberIds.slice(0, 4).map((uidKey) => (
                  <Avatar key={uidKey} user={resolveChatUser(uidKey)} size={24} />
                ))}
                <span className="chat-header__member-count mono">
                  <Users size={12} />
                  {activeChannel.memberIds.length}
                </span>
              </div>
            )}

            {/* Starred Filter Toggle */}
            <button
              type="button"
              className={cx('btn btn--sm', filterStarredOnly ? 'btn--primary' : 'btn--ghost')}
              onClick={() => setFilterStarredOnly(!filterStarredOnly)}
              title="Show only bookmarked messages"
            >
              <Bookmark size={14} />
              <span className="chat-hide-sm">Saved</span>
            </button>

            {/* Nova AI "Catch Me Up" Summarizer */}
            <button
              type="button"
              className="btn btn--ghost btn--sm chat-header__catchup-btn"
              onClick={() => {
                if (!activeChannel) return;
                generateCatchUpSummary(activeChannel.id);
                toast.success('Nova AI synthesized channel highlights & decisions! ✨');
              }}
            >
              <Sparkles size={14} />
              <span>✨ Catch me up (Nova AI)</span>
            </button>

            {/* Start / Join Huddle Toggle */}
            <button
              type="button"
              className={cx('btn btn--sm chat-header__huddle-btn', isInThisHuddle ? 'btn--primary' : 'btn--ghost')}
              onClick={() => {
                if (!activeChannel) return;
                if (isInThisHuddle) {
                  leaveHuddle();
                  toast.info('Left channel huddle');
                } else {
                  startOrJoinHuddle(activeChannel.id);
                  toast.success(`Joined live huddle in #${activeChannel.name}! 🎧`);
                }
              }}
            >
              <Headphones size={15} />
              <span>{isInThisHuddle ? 'In Huddle · Live' : 'Start / Join Huddle'}</span>
            </button>
          </div>
        </header>

        {/* Active Live Huddle Lounge Bar */}
        <HuddleBar currentUserId={currentUserId} />

        {/* Pinned Messages Strip */}
        {showPinnedStrip && pinnedMessages.length > 0 && (
          <div className="chat-pinned-strip">
            <div className="row row--between">
              <span className="chat-pinned-strip__title">
                <Pin size={13} /> Pinned in #{activeChannel?.name}
              </span>
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                onClick={() => setShowPinnedStrip(false)}
              >
                <X size={14} />
              </button>
            </div>
            <div className="chat-pinned-strip__list">
              {pinnedMessages.map((pm) => {
                const pAuthor = resolveChatUser(pm.authorId);
                return (
                  <div key={pm.id} className="chat-pinned-strip__item">
                    <Avatar user={pAuthor} size={22} />
                    <strong>{pAuthor.name.split(' ')[0]}:</strong>
                    <span className="truncate">{pm.body.replace(/\*\*/g, '')}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Nova AI "Catch Me Up" Executive Summary Card */}
        {activeCatchUp && activeChannel && (
          <section className="chat-catchup-card" aria-label="Nova AI Catch Me Up Summary">
            <div className="chat-catchup-card__head">
              <div className="row row--sm">
                <span className="chat-catchup-card__badge">
                  <Sparkles size={13} /> NOVA AI · CATCH ME UP BRIEFING
                </span>
                <strong>{activeCatchUp.headline}</strong>
              </div>
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                onClick={() => dismissCatchUpSummary(activeChannel.id)}
                aria-label="Dismiss Nova summary"
              >
                <X size={14} />
              </button>
            </div>

            <div className="chat-catchup-card__grid">
              <div>
                <div className="chat-catchup-card__label">Key Highlights</div>
                <ul className="chat-catchup-card__list">
                  {activeCatchUp.keyHighlights.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="chat-catchup-card__label">Decisions & Open Polls</div>
                <ul className="chat-catchup-card__list">
                  {activeCatchUp.decisions.map((d, idx) => (
                    <li key={idx}>{d}</li>
                  ))}
                  {activeCatchUp.openPolls.map((p) => (
                    <li key={p.messageId}>
                      📊 Open Poll: <strong>{p.question}</strong> ({p.totalVotes} votes)
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* Message Stream */}
        <div className="chat-feed" role="log" aria-live="polite">
          <div className="chat-feed__welcome">
            <div className="chat-feed__welcome-icon">
              {activeChannel?.emoji ?? <Hash size={22} />}
            </div>
            <div>
              <h2 className="chat-feed__welcome-title">
                {activeChannel?.kind === 'dm'
                  ? `Conversation with ${activeChannel.name}`
                  : `Welcome to #${activeChannel?.name}`}
              </h2>
              <p className="muted text-sm">{activeChannel?.description}</p>
            </div>
          </div>

          {channelMessages.length === 0 ? (
            <div className="chat-feed__empty">
              <p className="muted">
                {filterStarredOnly
                  ? 'No saved messages in this channel yet.'
                  : searchQuery
                    ? `No messages matching "${searchQuery}".`
                    : 'No messages yet — launch a poll, drop kudos, or start the conversation!'}
              </p>
            </div>
          ) : (
            channelMessages.map((msg) => (
              <MessageCard
                key={msg.id}
                message={msg}
                currentUserId={currentUserId}
                onOpenThread={(id) => openThread(id)}
                onSelectChannel={handleSelectChannel}
              />
            ))
          )}
          <div ref={feedEndRef} />
        </div>

        {/* ═══════════════════ RICH COMPOSER & SLASH COMMANDS ═══════════════════ */}
        <footer className="chat-composer-wrap">
          {/* Slash Command Popover Menu */}
          {matchingSlashCommands.length > 0 && (
            <div className="chat-slash-menu" role="listbox" aria-label="Slash commands">
              <div className="chat-slash-menu__head">
                <Slash size={12} />
                <span>PULSE SLASH COMMANDS</span>
              </div>
              {matchingSlashCommands.map((cmd, idx) => (
                <button
                  key={cmd.cmd}
                  type="button"
                  className={cx('chat-slash-menu__item', idx === slashIndex && 'is-active')}
                  onClick={() => cmd.run()}
                >
                  <code className="chat-slash-menu__cmd">{cmd.cmd}</code>
                  <div className="grow">
                    <div className="chat-slash-menu__label">{cmd.label}</div>
                    <div className="chat-slash-menu__desc">{cmd.description}</div>
                  </div>
                  <span className="chat-slash-menu__badge">{cmd.badge}</span>
                </button>
              ))}
            </div>
          )}

          {/* 1-Click Interactive Feature Pills */}
          <div className="chat-quick-pills" role="toolbar" aria-label="Interactive card triggers">
            <button
              type="button"
              className="chat-quick-pill"
              onClick={() => setActiveModal('poll')}
            >
              <BarChart3 size={13} />
              <span>📊 Poll</span>
            </button>
            <button
              type="button"
              className="chat-quick-pill"
              onClick={() => setActiveModal('kudos')}
            >
              <Award size={13} />
              <span>🎉 Kudos</span>
            </button>
            <button
              type="button"
              className="chat-quick-pill"
              onClick={() => {
                if (!activeChannel) return;
                spinCoffeeMatch(activeChannel.id);
                toast.success('Spun a new Coffee Roulette pairing! ☕');
              }}
            >
              <Coffee size={13} />
              <span>☕ Coffee Match</span>
            </button>
            <button
              type="button"
              className="chat-quick-pill"
              onClick={() => {
                if (!activeChannel) return;
                dropIcebreaker(activeChannel.id);
                toast.success('Dropped a Watercooler Icebreaker card! 🎲');
              }}
            >
              <Dices size={13} />
              <span>🎲 Icebreaker</span>
            </button>
            <button
              type="button"
              className={cx('chat-quick-pill', recordingVoice && 'is-recording')}
              onClick={handleVoiceNoteAction}
            >
              <Mic size={13} />
              <span>
                {recordingVoice ? `🔴 Stop & Send (0:${String(recordSeconds).padStart(2, '0')})` : '🎙️ Voice Note'}
              </span>
            </button>
            <button
              type="button"
              className="chat-quick-pill"
              onClick={() => setActiveModal('standup')}
            >
              <ClipboardCheck size={13} />
              <span>📋 Standup</span>
            </button>
          </div>

          <div className="chat-composer">
            <textarea
              className="chat-composer__input"
              rows={2}
              placeholder={
                activeChannel?.kind === 'dm'
                  ? `Message ${activeChannel.name}… (type / for commands: /poll, /kudos, /coffee, /standup)`
                  : `Message #${activeChannel?.name ?? 'general'}… (type / for /poll, /kudos, /icebreaker, /coffee, /huddle, /standup)`
              }
              value={composerText}
              onChange={(e) => {
                setComposerText(e.target.value);
                setSlashIndex(0);
              }}
              onKeyDown={(e) => {
                if (matchingSlashCommands.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSlashIndex((i) => (i + 1) % matchingSlashCommands.length);
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSlashIndex(
                      (i) => (i - 1 + matchingSlashCommands.length) % matchingSlashCommands.length,
                    );
                    return;
                  }
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />
            <div className="chat-composer__bar">
              <span className="muted text-xs">
                Tip: Type <code>/</code> for commands, <code>@name</code> to mention, or <code>#channel</code> to link
              </span>
              <div className="row row--sm">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setComposerText((prev) => (prev.startsWith('/') ? '' : '/'))}
                  title="Open slash commands"
                >
                  <Slash size={13} />
                  <span>Commands</span>
                </button>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={handleSendMessage}
                  disabled={!composerText.trim()}
                >
                  <Send size={14} />
                  <span>Send</span>
                </button>
              </div>
            </div>
          </div>
        </footer>
      </main>

      {/* ═══════════════════ SLIDE-OVER THREAD DRAWER ═══════════════════ */}
      {threadMessageId && (
        <ThreadDrawer currentUserId={currentUserId} onSelectChannel={handleSelectChannel} />
      )}

      {/* ═══════════════════ COMPOSER MODALS ═══════════════════ */}
      {activeChannel && (
        <ComposerModals
          activeModal={activeModal}
          onClose={() => setActiveModal(null)}
          channelId={activeChannel.id}
          currentUserId={currentUserId}
          onSelectChannel={handleSelectChannel}
        />
      )}
    </div>
  );
}
