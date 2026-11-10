/**
 * Huddle Stage — a floating live-audio room that persists while you navigate inside Pulse Chat.
 * Modes: pill (minimised) ↔ panel ↔ full stage. Participant orbs with speaking glow rings (simulated speaker
 * rotation), mic / camera / screen / raise hand, emoji bursts, live captions and live Nova notes.
 * Leaving posts a Huddle recap card with key points and action items.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Hand, Maximize2, Mic, MicOff, Minimize2, MonitorUp, PhoneOff, Sparkles, Video, VideoOff, ChevronDown, Captions } from 'lucide-react';
import { NovaChip } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { mmss } from '@/lib/format';
import { useHotkeys } from '@/hooks/useHotkeys';
import { huddleScript, recapFrom } from '@/chat/nova';
import { useChat } from '@/chat/store';
import type { Conversation } from '@/chat/types';
import { convTitle, useNames, useViewer } from './hooks';
import { useChatUI } from './ui';

const BURSTS = ['🎉', '🔥', '👏', '😂', '💜', '🚀'];

export function joinHuddle(convId: string) {
  const ui = useChatUI.getState();
  if (ui.huddle?.convId === convId) {
    ui.setHuddle((h) => ({ ...h, mode: h.mode === 'pill' ? 'panel' : h.mode }));
    return;
  }
  if (ui.huddle) leaveHuddle();
  const conv = useChat.getState().conversations.find((c) => c.id === convId);
  if (!conv) return;
  const res = useChat.getState().startHuddle(convId);
  if (!res.ok) {
    toast.error(res.error);
    return;
  }
  useChatUI.getState().setHuddle({
    convId,
    joinedAt: Date.now(),
    mode: 'panel',
    muted: false,
    camera: false,
    screen: false,
    hand: false,
    notes: true,
    script: huddleScript(conv, ['_']),
    cursor: -1,
    heard: [],
    bursts: [],
  });
}

export function leaveHuddle() {
  const ui = useChatUI.getState();
  const h = ui.huddle;
  if (!h) return;
  const recap = recapFrom(h.heard);
  ui.setHuddle(null);
  const res = useChat.getState().leaveHuddle(h.convId, recap);
  if (!res.ok) toast.error(res.error);
  else if (res.message) toast.success('Huddle ended', 'Nova posted a recap with action items.');
}

function Orb({ userId, speaking, me, muted, hand, camera, size = 64 }: { userId: string; speaking: boolean; me?: boolean; muted?: boolean; hand?: boolean; camera?: boolean; size?: number }) {
  const names = useNames();
  const u = names.user(userId);
  if (!u) return null;
  return (
    <div className={cx('pc-orb', speaking && 'is-speaking', me && 'is-me', camera && 'has-camera')} style={{ ['--orb' as string]: `${size}px`, ['--hue' as string]: u.avatarHue }}>
      <div className="pc-orb__ring" aria-hidden="true" />
      <div className="pc-orb__face">
        {camera ? <div className="pc-orb__cam" aria-label="Camera on" /> : null}
        <Avatar user={u} size={size} />
      </div>
      {speaking && (
        <span className="pc-orb__eq" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
      {muted && (
        <span className="pc-orb__mute" aria-label="Muted">
          <MicOff />
        </span>
      )}
      {hand && <span className="pc-orb__hand" aria-label="Hand raised">✋</span>}
      <span className="pc-orb__name">{me ? 'You' : u.name.split(' ')[0]}</span>
    </div>
  );
}

export function HuddleDock() {
  const v = useViewer();
  const names = useNames();
  const navigate = useNavigate();
  const h = useChatUI((s) => s.huddle);
  const live = useChat((s) => (h ? s.huddles[h.convId] : undefined));
  const conv = useChat((s) => (h ? s.conversations.find((c) => c.id === h.convId) : undefined));
  const users = useHub((s) => s.users);
  const [now, setNow] = useState(Date.now());
  const joinedRef = useRef<string | null>(null);

  // Ticker (timer + simulated speech)
  useEffect(() => {
    if (!h) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [h]);

  // Simulated teammates join a moment after you
  useEffect(() => {
    if (!h || !conv || !v || joinedRef.current === h.convId) return;
    joinedRef.current = h.convId;
    const presence = useChatUI.getState().presence;
    const reachable = conv.memberIds.filter((id) => {
      const u = users.find((x) => x.id === id);
      return u && u.active && id !== v.user.id && (presence[id] ?? u.presence) === 'online';
    });
    const already = useChat.getState().huddles[h.convId]?.participantIds ?? [];
    const others = already.filter((id) => id !== v.user.id);
    const want = Math.max(0, (conv.kind === 'dm' ? 1 : 2) - others.length);
    const pick = reachable.filter((id) => !already.includes(id)).slice(0, want);
    const timers = pick.map((id, i) => window.setTimeout(() => useChat.getState().addHuddleParticipant(h.convId, id), 2200 + i * 2600));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [h, conv, v, users]);

  const others = useMemo(() => (live?.participantIds ?? []).filter((id) => id !== v?.user.id), [live, v]);

  // The huddle ended elsewhere (demo reset, persona switch) → drop the local runtime.
  useEffect(() => {
    if (h && !live) useChatUI.getState().setHuddle(null);
  }, [h, live]);

  // Speaker rotation through the scripted conversation
  useEffect(() => {
    if (!h || !others.length) return;
    const id = window.setInterval(() => {
      useChatUI.getState().setHuddle((x) => {
        if (x.cursor >= x.script.length - 1) return x;
        const cursor = x.cursor + 1;
        const speakers = (useChat.getState().huddles[x.convId]?.participantIds ?? []).filter((p) => p !== v?.user.id);
        if (!speakers.length) return x;
        const line = { ...x.script[cursor], speakerId: speakers[cursor % speakers.length] };
        return { ...x, cursor, heard: [...x.heard, line] };
      });
    }, 3600);
    return () => window.clearInterval(id);
  }, [h?.convId, others.length, v]); // eslint-disable-line react-hooks/exhaustive-deps

  useHotkeys(
    {
      escape: () => {
        if (h?.mode === 'stage') useChatUI.getState().setHuddle((x) => ({ ...x, mode: 'panel' }));
      },
      m: () => h && useChatUI.getState().setHuddle((x) => ({ ...x, muted: !x.muted })),
    },
    !!h,
  );

  if (!h || !v || !conv || !live) return null;

  const set = useChatUI.getState().setHuddle;
  const current = h.cursor >= 0 ? h.heard[h.heard.length - 1] : undefined;
  const speaking = current && now - h.joinedAt > 0 ? current.speakerId : undefined;
  const title = conv.kind === 'channel' ? `#${conv.name}` : convTitle(conv as Conversation, v.user.id, names);
  const elapsed = mmss(now - live.startedAt);
  const burst = (emoji: string) =>
    set((x) => ({ ...x, bursts: [...x.bursts.slice(-10), { id: Date.now() + Math.random(), emoji, x: 10 + Math.random() * 80 }] }));
  const notes = recapFrom(h.heard);
  const waiting = !others.length;

  const controls = (
    <div className="pc-hud-controls">
      <button type="button" className={cx('pc-ctl', h.muted && 'is-off')} onClick={() => set((x) => ({ ...x, muted: !x.muted }))} aria-label={h.muted ? 'Unmute (M)' : 'Mute (M)'} data-tip={h.muted ? 'Unmute (M)' : 'Mute (M)'} data-qa="huddle-mute">
        {h.muted ? <MicOff /> : <Mic />}
      </button>
      <button type="button" className={cx('pc-ctl', h.camera && 'is-on')} onClick={() => set((x) => ({ ...x, camera: !x.camera }))} aria-label="Camera" data-tip={h.camera ? 'Stop video' : 'Start video'}>
        {h.camera ? <Video /> : <VideoOff />}
      </button>
      <button type="button" className={cx('pc-ctl', h.screen && 'is-on')} onClick={() => set((x) => ({ ...x, screen: !x.screen, mode: !x.screen && x.mode === 'pill' ? 'panel' : x.mode }))} aria-label="Share screen" data-tip={h.screen ? 'Stop sharing' : 'Share screen'}>
        <MonitorUp />
      </button>
      <button type="button" className={cx('pc-ctl', h.hand && 'is-on')} onClick={() => set((x) => ({ ...x, hand: !x.hand }))} aria-label="Raise hand" data-tip={h.hand ? 'Lower hand' : 'Raise hand'}>
        <Hand />
      </button>
      <button type="button" className={cx('pc-ctl', h.notes && 'is-on')} onClick={() => set((x) => ({ ...x, notes: !x.notes }))} aria-label="Nova notes" data-tip="Nova notes">
        <Sparkles />
      </button>
      <button type="button" className="pc-ctl pc-ctl--leave" onClick={leaveHuddle} aria-label="Leave huddle" data-tip="Leave" data-qa="huddle-leave">
        <PhoneOff />
      </button>
    </div>
  );

  const bursts = (
    <div className="pc-bursts" aria-hidden="true">
      {h.bursts.map((b) => (
        <span key={b.id} style={{ left: `${b.x}%` }} onAnimationEnd={() => set((x) => ({ ...x, bursts: x.bursts.filter((y) => y.id !== b.id) }))}>
          {b.emoji}
        </span>
      ))}
    </div>
  );

  if (h.mode === 'pill')
    return (
      <div className="pc-huddle-pill neo-portal" role="region" aria-label="Huddle" data-qa="huddle-pill">
        <span className="pc-live-row__wave" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <button type="button" className="pc-huddle-pill__title" onClick={() => set((x) => ({ ...x, mode: 'panel' }))}>
          <strong className="truncate">{title}</strong>
          <span className="neo-mono">
            {elapsed} · {(live.participantIds.length || 1)} in call
          </span>
        </button>
        <button type="button" className={cx('pc-ctl pc-ctl--sm', h.muted && 'is-off')} onClick={() => set((x) => ({ ...x, muted: !x.muted }))} aria-label={h.muted ? 'Unmute' : 'Mute'}>
          {h.muted ? <MicOff /> : <Mic />}
        </button>
        <button type="button" className="pc-ctl pc-ctl--sm pc-ctl--leave" onClick={leaveHuddle} aria-label="Leave huddle">
          <PhoneOff />
        </button>
      </div>
    );

  const people = [v.user.id, ...others];
  const stage = h.mode === 'stage';
  return (
    <div className={cx('pc-huddle neo-portal', stage ? 'is-stage' : 'is-panel')} role="dialog" aria-label={`Huddle in ${title}`} data-qa="huddle-panel">
      <div className="pc-huddle__head">
        <span className="pc-huddle__live">
          <i /> LIVE
        </span>
        <button type="button" className="pc-huddle__title" onClick={() => navigate(`/chat/c/${conv.id}`)} title="Open conversation">
          <strong className="truncate">{title}</strong>
          <span className="neo-mono">{elapsed}</span>
        </button>
        <span className="grow" />
        <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={() => set((x) => ({ ...x, mode: stage ? 'panel' : 'stage' }))} aria-label={stage ? 'Exit full stage' : 'Full stage'} data-tip={stage ? 'Exit stage (Esc)' : 'Full stage'}>
          {stage ? <Minimize2 /> : <Maximize2 />}
        </button>
        <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={() => set((x) => ({ ...x, mode: 'pill' }))} aria-label="Minimise huddle" data-tip="Minimise">
          <ChevronDown />
        </button>
      </div>

      <div className="pc-huddle__main">
        <div className="pc-huddle__room">
          {h.screen && (
            <div className="pc-screen" aria-label="You are sharing your screen">
              <div className="pc-screen__bar">
                <MonitorUp /> You’re presenting · {conv.linked?.label ?? title}
              </div>
              <div className="pc-screen__canvas">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
          <div className={cx('pc-orbs', people.length > 4 && 'is-dense')}>
            {people.map((id) => (
              <Orb key={id} userId={id} me={id === v.user.id} speaking={speaking === id} muted={id === v.user.id && h.muted} hand={id === v.user.id && h.hand} camera={id === v.user.id && h.camera} size={stage ? 96 : 58} />
            ))}
          </div>
          <div className="pc-captions" aria-live="polite">
            <Captions className="pc-hud-icon" />
            {waiting ? (
              <span className="neo-faint">Waiting for teammates to join…</span>
            ) : current ? (
              <span>
                <strong>{names.first(current.speakerId)}:</strong> {current.text}
              </span>
            ) : (
              <span className="neo-faint">Say hi — captions appear here</span>
            )}
          </div>
          {bursts}
        </div>
        {h.notes && (
          <div className="pc-huddle__notes">
            <div className="row" style={{ gap: 6 }}>
              <NovaChip>Nova notes</NovaChip>
              <span className="neo-faint text-xs">live</span>
            </div>
            {notes.keyPoints.length || notes.actionItems.length ? (
              <>
                {notes.keyPoints.length > 0 && (
                  <ul className="pc-notes__points">
                    {notes.keyPoints.slice(-4).map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                )}
                {notes.actionItems.length > 0 && (
                  <>
                    <div className="neo-hud">Action items</div>
                    <ul className="pc-notes__actions">
                      {notes.actionItems.map((a, i) => (
                        <li key={i}>
                          <span className="pc-notes__owner">{names.first(a.ownerId)}</span> {a.text}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            ) : (
              <p className="neo-faint text-sm">Nova is listening and will capture key points and action items.</p>
            )}
          </div>
        )}
      </div>

      <div className="pc-huddle__foot">
        <div className="pc-reactbar" role="group" aria-label="Send a reaction">
          {BURSTS.map((e) => (
            <button key={e} type="button" onClick={() => burst(e)} aria-label={`React ${e}`}>
              {e}
            </button>
          ))}
        </div>
        {controls}
      </div>
    </div>
  );
}
