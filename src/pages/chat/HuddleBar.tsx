import { useNavigate } from 'react-router';
import {
  Captions,
  ExternalLink,
  Headphones,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Radio,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { HUDDLE_REACTION_EMOJIS } from '@/chat/seed';
import { resolveChatUser, useChatStore } from '@/chat/store';
import { Avatar } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { toast } from '@/store/toast';

export function HuddleBar({ currentUserId }: { currentUserId: string }) {
  const navigate = useNavigate();
  const activeHuddle = useChatStore((s) => s.activeHuddle);
  const leaveHuddle = useChatStore((s) => s.leaveHuddle);
  const toggleHuddleMute = useChatStore((s) => s.toggleHuddleMute);
  const toggleHuddleScreenShare = useChatStore((s) => s.toggleHuddleScreenShare);
  const toggleHuddleCaptions = useChatStore((s) => s.toggleHuddleCaptions);
  const cycleHuddleSpeaker = useChatStore((s) => s.cycleHuddleSpeaker);
  const throwHuddleReaction = useChatStore((s) => s.throwHuddleReaction);
  const generateHuddleNotes = useChatStore((s) => s.generateHuddleNotes);

  if (!activeHuddle) return null;

  const isMuted = activeHuddle.mutedIds.includes(currentUserId);
  const isSharing = activeHuddle.screenSharerId !== null;
  const sharerUser = activeHuddle.screenSharerId
    ? resolveChatUser(activeHuddle.screenSharerId)
    : null;
  const captionSpeaker = resolveChatUser(activeHuddle.liveCaptionSpeakerId);

  return (
    <section className="chat-huddle" aria-label="Pulse Wave Live Huddle Lounge">
      {/* Floating Emoji Reactions */}
      {activeHuddle.floatingReactions.length > 0 && (
        <div className="chat-huddle__floating-layer" aria-hidden="true">
          {activeHuddle.floatingReactions.slice(-6).map((r, idx) => {
            const sender = resolveChatUser(r.userId);
            return (
              <div
                key={r.id}
                className="chat-huddle__floating-emoji"
                style={{ '--float-idx': idx } as React.CSSProperties}
              >
                <span>{r.emoji}</span>
                <small>{sender.name.split(' ')[0]}</small>
              </div>
            );
          })}
        </div>
      )}

      <div className="chat-huddle__top">
        <div className="chat-huddle__title-group">
          <span className="chat-huddle__live-pill">
            <Radio size={13} />
            <span>PULSE WAVE LIVE</span>
          </span>
          <strong className="chat-huddle__topic">{activeHuddle.topic}</strong>
        </div>

        {/* Participant Soundwave Avatars */}
        <div className="chat-huddle__participants">
          {activeHuddle.participantIds.map((pid) => {
            const pUser = resolveChatUser(pid);
            const speaking = activeHuddle.speakingIds.includes(pid);
            const muted = activeHuddle.mutedIds.includes(pid);
            return (
              <div
                key={pid}
                className={cx(
                  'chat-huddle__participant',
                  speaking && !muted && 'is-speaking',
                  muted && 'is-muted',
                )}
                title={`${pUser.name} (${speaking && !muted ? 'Speaking' : muted ? 'Muted' : 'Listening'})`}
              >
                <div className="chat-huddle__ring-wrap">
                  <Avatar user={pUser} size={34} />
                  {speaking && !muted && <span className="chat-huddle__wave-ring" />}
                </div>
                <span className="chat-huddle__participant-name">
                  {pUser.name.split(' ')[0]}
                  {muted && <MicOff size={11} />}
                </span>
              </div>
            );
          })}
        </div>

        {/* Huddle Controls */}
        <div className="chat-huddle__controls">
          <button
            type="button"
            className={cx('btn btn--sm', isMuted ? 'btn--danger' : 'btn--ghost')}
            onClick={() => toggleHuddleMute()}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
            <span>{isMuted ? 'Muted' : 'Mic On'}</span>
          </button>

          <button
            type="button"
            className={cx('btn btn--sm', isSharing ? 'btn--primary' : 'btn--ghost')}
            onClick={() => {
              toggleHuddleScreenShare();
              toast.info(isSharing ? 'Stopped screen share' : 'Sharing screen to Huddle Lounge 🖥️');
            }}
          >
            <MonitorUp size={14} />
            <span>{isSharing ? 'Sharing Screen' : 'Share Screen'}</span>
          </button>

          <button
            type="button"
            className={cx('btn btn--sm', activeHuddle.captionsEnabled ? 'btn--primary' : 'btn--ghost')}
            onClick={() => toggleHuddleCaptions()}
            title="Toggle Live AI Captions"
          >
            <Captions size={14} />
            <span>AI Captions</span>
          </button>

          <div className="chat-huddle__reaction-bar" role="group" aria-label="Throw huddle reaction">
            {HUDDLE_REACTION_EMOJIS.map((em) => (
              <button
                key={em}
                type="button"
                className="chat-huddle__react-btn"
                title={`Throw ${em}`}
                onClick={() => throwHuddleReaction(em)}
              >
                {em}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn btn--primary btn--sm chat-huddle__notes-btn"
            onClick={() => {
              generateHuddleNotes();
              toast.success('Nova AI Huddle Notes & Action Items posted to channel! ✨');
            }}
          >
            <Sparkles size={14} />
            <span>Generate Nova Huddle Notes</span>
          </button>

          <button
            type="button"
            className="btn btn--ghost btn--sm chat-huddle__leave-btn"
            onClick={() => {
              leaveHuddle();
              toast.info('Left Pulse Wave Huddle');
            }}
            title="Leave Huddle"
          >
            <PhoneOff size={14} />
            <span>Leave</span>
          </button>
        </div>
      </div>

      {/* Live Shared Screen Preview Card */}
      {isSharing && sharerUser && (
        <div className="chat-huddle__screen-preview">
          <div className="chat-huddle__screen-head">
            <span className="chat-huddle__screen-badge">
              <MonitorUp size={13} />
              <span>{sharerUser.name} is sharing · {activeHuddle.screenShareTitle}</span>
            </span>
            <div className="row row--sm">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => navigate('/drive/file/df-prism-tokens')}
              >
                <span>Open Drive Spec</span>
                <ExternalLink size={12} />
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => navigate('/projects/p/prj-prism?task=t-p1')}
              >
                <span>Open Task t-p1</span>
                <ExternalLink size={12} />
              </button>
            </div>
          </div>
          <div className="chat-huddle__screen-canvas">
            <div className="chat-huddle__screen-metric">
              <span className="muted text-xs">TOKEN CONTRAST</span>
              <strong className="mono">AAA · 14.8:1</strong>
            </div>
            <div className="chat-huddle__screen-metric">
              <span className="muted text-xs">SPRING SETTLE</span>
              <strong className="mono">220ms cubic-bezier</strong>
            </div>
            <div className="chat-huddle__screen-metric">
              <span className="muted text-xs">CANARY P99</span>
              <strong className="mono">18.4ms · 0% err</strong>
            </div>
          </div>
        </div>
      )}

      {/* Live AI Captions Strip */}
      {activeHuddle.captionsEnabled && (
        <div className="chat-huddle__captions">
          <span className="chat-huddle__captions-badge">
            <Volume2 size={13} />
            <span>Live AI Caption · {captionSpeaker.name.split(' ')[0]}:</span>
          </span>
          <span className="chat-huddle__captions-text">{activeHuddle.liveCaptionText}</span>
          <button
            type="button"
            className="chat-huddle__captions-next"
            onClick={() => cycleHuddleSpeaker()}
          >
            <Headphones size={12} />
            <span>Next speaker</span>
          </button>
        </div>
      )}
    </section>
  );
}
