/**
 * Pulse Chat — the social heartbeat of Helix.
 * Routes: /chat · /chat/c/:conversationId · /chat/activity · /chat/saved · /chat/pulse · /chat/browse · /chat/search
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router';
import { AtSign, Bookmark, Compass, HeartPulse, MessageCirclePlus, MessagesSquare, Search } from 'lucide-react';
import '@/styles/neo.css';
import '@/styles/chat.css';
import { NeoHead, NeoRail, NeoSide, NeoStage, NeoWorkspace, type NeoNavItem } from '@/components/neo';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { canGiveKudos } from '@/chat/access';
import { dateKey } from '@/chat/ids';
import { useChat } from '@/chat/store';
import { ConversationRoute } from './Conversation';
import { KudosDialog, NewChannelDialog, NewMessageDialog } from './Dialogs';
import { HuddleDock } from './Huddle';
import { usePerson, useSideSections, useUnreadTotals, useViewer } from './hooks';
import { useLiveEngine } from './live';
import { PulseView } from './Pulse';
import { ConvNavigator, PresenceDock } from './Side';
import { ChatShellContext, type ChatShell } from './shell';
import { useChatUI } from './ui';
import { ActivityView, BrowseView, SavedView, SearchView, useNewActivityCount } from './Views';

const TINT = { c1: '#22d3ee', c2: '#d946ef' };

/** `/chat` → last conversation (desktop) or the conversation list (phones). */
function ChatIndex() {
  const isMobile = useIsMobile();
  const person = usePerson();
  const v = useViewer();
  const [params] = useSearchParams();
  const conversations = useChat((s) => s.conversations);
  const compose = params.get('compose');
  const wantsConv = params.has('huddle') || !!compose;
  if (!v) return null;
  if (isMobile && !wantsConv) return <MobileHome />;
  const last = person.lastConvId && conversations.some((c) => c.id === person.lastConvId && c.memberIds.includes(v.user.id)) ? person.lastConvId : 'ch-general';
  const target = compose === 'kudos' && conversations.find((c) => c.id === 'ch-kudos')?.memberIds.includes(v.user.id) ? 'ch-kudos' : last;
  const keep = new URLSearchParams(params);
  keep.delete('new');
  const qs = keep.toString();
  return <Navigate to={`/chat/c/${target}${qs ? `?${qs}` : ''}`} replace />;
}

function MobileHome() {
  const navigate = useNavigate();
  return (
    <>
      <NeoHead
        icon={<MessagesSquare />}
        eyebrow="Pulse Chat"
        title="Chats"
        actions={
          <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={() => navigate('?new=dm')} aria-label="New message">
            <MessageCirclePlus /> <span className="neo-btn__label">New</span>
          </button>
        }
      />
      <div className="neo-body pc-mobile-home">
        <ConvNavigator compact />
      </div>
    </>
  );
}

/** Rail badge: today's engagement nudges (vibe check + Daily Spark). */
function usePulseNudges() {
  const v = useViewer();
  const vibes = useChat((s) => s.vibes);
  const messages = useChat((s) => s.messages);
  return useMemo(() => {
    if (!v || v.viewer.contractor) return 0;
    const today = dateKey(Date.now());
    let n = 0;
    if (!vibes[today]?.[v.user.id]) n += 1;
    if (!messages.some((m) => m.spark?.date === today && m.authorId === v.user.id)) n += 1;
    return n;
  }, [v, vibes, messages]);
}

function useDueReminders() {
  const person = usePerson();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return person.saved.filter((s) => s.remindAt && !s.done && s.remindAt <= now).length;
}

export function ChatPage() {
  const v = useViewer();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [peek, setPeek] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const totals = useUnreadTotals();
  const activity = useNewActivityCount();
  const nudges = usePulseNudges();
  const due = useDueReminders();
  const sections = useSideSections();

  useLiveEngine(v?.user.id);

  // Close the floating side panel when the route changes.
  useEffect(() => setPeek(false), [location.pathname]);

  // Persona switch / sign-out: drop live UI state for the previous person.
  useEffect(() => {
    useChatUI.getState().setHuddle(null);
    useChatUI.getState().setEditing(null);
  }, [v?.user.id]);

  const shell: ChatShell = useMemo(
    () => ({
      toggleSide: () => setPeek((p) => !p),
      closeSide: () => setPeek(false),
      focusSearch: () => {
        if (isMobile) navigate('/chat');
        else {
          setPeek(true);
          window.setTimeout(() => searchRef.current?.focus(), 30);
        }
      },
    }),
    [isMobile, navigate],
  );

  const step = useCallback(
    (dir: 1 | -1, unreadOnly = false) => {
      const order = sections.order;
      if (!order.length) return;
      const active = useChatUI.getState().activeConvId;
      const i = order.findIndex((r) => r.conv.id === active);
      for (let k = 1; k <= order.length; k++) {
        const r = order[(i + dir * k + order.length * 2) % order.length];
        if (!unreadOnly || r.state.unread > 0) {
          navigate(`/chat/c/${r.conv.id}`);
          return;
        }
      }
    },
    [sections.order, navigate],
  );

  // alt+↑/↓ switches conversations (works while typing, like Slack); alt+shift jumps to the next unread.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      step(e.key === 'ArrowDown' ? 1 : -1, e.shiftKey);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  useHotkeys({
    s: (e) => {
      e.preventDefault();
      shell.focusSearch();
    },
    c: (e) => {
      e.preventDefault();
      navigate('?new=dm');
    },
    '[': () => setPeek((p) => !p),
  });

  const newKind = params.get('new');
  const closeNew = () => {
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
  };
  const kudosParam = params.get('compose') === 'kudos' && !location.pathname.startsWith('/chat/c/');

  const items: NeoNavItem[] = [
    { to: '/chat', label: 'Chats', icon: <MessagesSquare />, badge: totals.mentions || null, match: (p) => p === '/chat' || p === '/chat/' || p.startsWith('/chat/c/'), title: 'Chats (alt+↑/↓ to switch)' },
    { to: '/chat/activity', label: 'Activity', icon: <AtSign />, badge: activity || null },
    { to: '/chat/pulse', label: 'Pulse', icon: <HeartPulse />, badge: nudges || null },
    { to: '/chat/saved', label: 'Saved', icon: <Bookmark />, badge: due || null, badgeTone: 'danger' },
    { to: '/chat/browse', label: 'Browse', icon: <Compass /> },
  ];

  if (!v) return null;
  return (
    <ChatShellContext.Provider value={shell}>
      <NeoWorkspace app="chat" tint={TINT} side={!isMobile} sidePeek={peek} onSidePeekChange={setPeek} fixed>
        <NeoRail brand={{ icon: <MessagesSquare />, label: 'Pulse Chat', to: '/chat' }} items={items} footer={[{ to: '/chat/search', label: 'Search', icon: <Search /> }]} label="Pulse Chat navigation" />
        {!isMobile && (
          <NeoSide title={<span className="pc-side-title">Pulse<span className="pc-side-title__dot" /></span>} label="Conversations" className="pc-side">
            <ConvNavigator onNavigate={() => setPeek(false)} searchRef={searchRef} />
            <PresenceDock />
          </NeoSide>
        )}
        <NeoStage className="pc-stage" label="Pulse Chat">
          <Routes>
            <Route index element={<ChatIndex />} />
            <Route path="c/:convId" element={<ConversationRoute />} />
            <Route path="activity" element={<ActivityView />} />
            <Route path="saved" element={<SavedView />} />
            <Route path="pulse" element={<PulseView />} />
            <Route path="browse" element={<BrowseView />} />
            <Route path="search" element={<SearchView />} />
            <Route path="*" element={<Navigate to="/chat" replace />} />
          </Routes>
        </NeoStage>
      </NeoWorkspace>
      <HuddleDock />
      <NewMessageDialog open={newKind === 'dm'} onClose={closeNew} />
      <NewChannelDialog open={newKind === 'channel'} onClose={closeNew} />
      <KudosDialog
        open={kudosParam && canGiveKudos(v.viewer)}
        onClose={() => {
          const next = new URLSearchParams(params);
          next.delete('compose');
          setParams(next, { replace: true });
        }}
      />
    </ChatShellContext.Provider>
  );
}
