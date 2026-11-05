import { useState, type MouseEvent } from 'react';
import {
  Award,
  BarChart3,
  ClipboardCheck,
  MessageSquarePlus,
  Plus,
  Rocket,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { ChatKudosBadge } from '@/chat/types';
import { VIBE_PRESETS } from '@/chat/seed';
import { getAllChatUsers, useChatStore } from '@/chat/store';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/primitives';
import { burstConfetti } from '@/lib/confetti';
import { cx } from '@/lib/cx';
import { toast } from '@/store/toast';

export type ChatModalKind = 'poll' | 'kudos' | 'standup' | 'vibe' | 'new_dm' | null;

const KUDOS_BADGES: { badge: ChatKudosBadge; desc: string; color: string }[] = [
  { badge: 'Teamwork', desc: 'Lifted the whole squad', color: '#38bdf8' },
  { badge: 'Craft', desc: 'Exceptional quality & polish', color: '#a78bfa' },
  { badge: 'Ownership', desc: 'Took it across the finish line', color: '#34d399' },
  { badge: 'Customer Love', desc: 'Delighted users & stakeholders', color: '#f472b6' },
  { badge: 'Spark', desc: 'Creative, bold fresh thinking', color: '#fbbf24' },
];

export function ComposerModals({
  activeModal,
  onClose,
  channelId,
  currentUserId,
  onSelectChannel,
}: {
  activeModal: ChatModalKind;
  onClose: () => void;
  channelId: string;
  currentUserId: string;
  onSelectChannel: (id: string) => void;
}) {
  const createPoll = useChatStore((s) => s.createPoll);
  const sendKudosCard = useChatStore((s) => s.sendKudosCard);
  const postStandup = useChatStore((s) => s.postStandup);
  const postShipIt = useChatStore((s) => s.postShipIt);
  const setVibe = useChatStore((s) => s.setVibe);
  const clearVibe = useChatStore((s) => s.clearVibe);
  const vibes = useChatStore((s) => s.vibes);
  const startDirectMessage = useChatStore((s) => s.startDirectMessage);

  // Poll state
  const [pollQuestion, setPollQuestion] = useState('What should we prioritize in our next sprint?');
  const [pollOptions, setPollOptions] = useState([
    '⚡ Ship live Huddle AI action item sync',
    '🎨 Expand Prism v2.4 dark/light glass tokens',
    '📊 Add real-time latency telemetry widgets',
  ]);
  const [pollAnonymous, setPollAnonymous] = useState(false);

  // Kudos state
  const allUsers = getAllChatUsers().filter((u) => u.id !== currentUserId);
  const [kudosRecipientId, setKudosRecipientId] = useState(allUsers[0]?.id ?? 'u-mei');
  const [kudosBadge, setKudosBadge] = useState<ChatKudosBadge>('Craft');
  const [kudosHeadline, setKudosHeadline] = useState(
    'Delivered phenomenal craft and unblocked the entire cross-hub launch ahead of schedule!',
  );

  // Standup / Ship-It state
  const [standupMode, setStandupMode] = useState<'standup' | 'ship_it'>('standup');
  const [yesterday, setYesterday] = useState(
    'Completed Prism v2.4 token audit & verified zero-trust session policies.',
  );
  const [today, setToday] = useState(
    'Rolling out Pulse Chat interactive cards & reviewing task t-p1 in Helix Projects.',
  );
  const [blockers, setBlockers] = useState('None — all CI checks and staging probes are green.');
  const [moodEmoji, setMoodEmoji] = useState('🚀');
  const [shipTitle, setShipTitle] = useState('Pulse Chat Interactive Cards & Huddle Notes');
  const [shipVersion, setShipVersion] = useState('v2.5.0');
  const [shipImpact, setShipImpact] = useState('3.4x higher daily employee engagement across 6 global hubs');

  // Vibe state
  const myVibe = vibes[currentUserId];
  const [vibeEmoji, setVibeEmoji] = useState(myVibe?.emoji ?? '🎧');
  const [vibeText, setVibeText] = useState(myVibe?.text ?? 'Deep in Focus');
  const [vibeSound, setVibeSound] = useState(myVibe?.soundTag ?? 'Lo-Fi Beats');
  const [vibeExpires, setVibeExpires] = useState(myVibe?.expiresLabel ?? 'Today');

  // New DM state
  const [dmSearch, setDmSearch] = useState('');

  const handleSubmitPoll = () => {
    const validOpts = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (!pollQuestion.trim() || validOpts.length < 2) return;
    createPoll(channelId, pollQuestion, validOpts, { anonymous: pollAnonymous });
    toast.success('Interactive Poll launched in channel! 📊');
    onClose();
  };

  const handleSubmitKudos = (e: MouseEvent) => {
    if (!kudosRecipientId || kudosHeadline.trim().length < 5) return;
    sendKudosCard(channelId, kudosRecipientId, kudosBadge, kudosHeadline);
    burstConfetti({ x: e.clientX, y: e.clientY });
    toast.success('Kudos Celebration Card posted & synced with NEXUS Hub! 🎉');
    onClose();
  };

  const handleSubmitStandupOrShipIt = (e: MouseEvent) => {
    const defaultLinks = [
      {
        label: 'Helix Project · Prism Task t-p1',
        route: '/projects/p/prj-prism?task=t-p1',
        kind: 'project' as const,
        meta: 'PRJ-PRISM',
      },
      {
        label: 'Helix Drive · Prism Token Spec',
        route: '/drive/file/df-prism-tokens',
        kind: 'drive' as const,
        meta: 'SPEC DOC',
      },
    ];
    if (standupMode === 'standup') {
      postStandup(channelId, {
        yesterday,
        today,
        blockers,
        moodEmoji,
        links: defaultLinks,
      });
      toast.success('Daily Standup card posted! 📋');
    } else {
      postShipIt(channelId, {
        title: shipTitle,
        version: shipVersion,
        impact: shipImpact,
        highlights: [
          'Synced with Helix Projects (/projects/p/prj-prism?task=t-p1)',
          'Documented in Helix Drive (/drive/file/df-prism-tokens)',
        ],
        teamIds: [currentUserId, 'u-mei', 'u-omar'],
        links: defaultLinks,
      });
      burstConfetti({ x: e.clientX, y: e.clientY });
      toast.success('Ship-It Milestone card launched! 🚀');
    }
    onClose();
  };

  const handleSaveVibe = () => {
    if (!vibeText.trim()) return;
    setVibe(vibeEmoji, vibeText, vibeSound, vibeExpires);
    toast.success(`Pulse Vibe updated: ${vibeEmoji} ${vibeText}`);
    onClose();
  };

  return (
    <>
      {/* ─────────── 1. CREATE POLL MODAL ─────────── */}
      <Modal
        open={activeModal === 'poll'}
        onClose={onClose}
        title="Launch Live Poll"
        subtitle="Collect instant votes with animated progress bars and voter avatars."
        icon={<BarChart3 size={20} />}
        width={520}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleSubmitPoll}
              disabled={!pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2}
            >
              <BarChart3 size={15} />
              <span>Launch Poll</span>
            </button>
          </>
        }
      >
        <div className="stack stack--md">
          <div className="field">
            <label className="field-label" htmlFor="poll-q-input">
              Question
            </label>
            <input
              id="poll-q-input"
              className="input"
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              placeholder="Ask the channel a question…"
            />
          </div>

          <div className="field">
            <span className="field-label">Options</span>
            <div className="stack stack--sm">
              {pollOptions.map((opt, idx) => (
                <div key={idx} className="row row--sm">
                  <input
                    className="input grow"
                    value={opt}
                    onChange={(e) =>
                      setPollOptions((prev) => prev.map((item, i) => (i === idx ? e.target.value : item)))
                    }
                    placeholder={`Option ${idx + 1}`}
                  />
                  {pollOptions.length > 2 && (
                    <button
                      type="button"
                      className="icon-btn icon-btn--sm"
                      onClick={() => setPollOptions((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="Remove option"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              {pollOptions.length < 5 && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setPollOptions((prev) => [...prev, ''])}
                >
                  <Plus size={14} />
                  <span>Add option</span>
                </button>
              )}
            </div>
          </div>

          <label className="row row--sm" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={pollAnonymous}
              onChange={(e) => setPollAnonymous(e.target.checked)}
            />
            <span className="text-sm">Anonymous voting (hide voter avatars)</span>
          </label>
        </div>
      </Modal>

      {/* ─────────── 2. SEND KUDOS MODAL ─────────── */}
      <Modal
        open={activeModal === 'kudos'}
        onClose={onClose}
        title="Drop Kudos & Confetti"
        subtitle="Celebrate a teammate in Pulse Chat and sync directly to the NEXUS Hub Kudos Wall."
        icon={<Award size={20} />}
        width={540}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleSubmitKudos}
              disabled={!kudosRecipientId || kudosHeadline.trim().length < 5}
            >
              <Award size={15} />
              <span>Send Kudos Drop 🎉</span>
            </button>
          </>
        }
      >
        <div className="stack stack--md">
          <div className="field">
            <span className="field-label">Teammate to celebrate</span>
            <div className="chat-modal-user-grid">
              {allUsers.slice(0, 8).map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className={cx('chat-modal-user-pill', kudosRecipientId === u.id && 'is-selected')}
                  onClick={() => setKudosRecipientId(u.id)}
                >
                  <Avatar user={u} size={28} />
                  <span className="truncate">{u.name.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-label">Value Badge</span>
            <div className="chat-modal-badge-grid">
              {KUDOS_BADGES.map((b) => (
                <button
                  key={b.badge}
                  type="button"
                  className={cx('chat-modal-badge-btn', kudosBadge === b.badge && 'is-selected')}
                  style={{ '--badge-c': b.color } as React.CSSProperties}
                  onClick={() => setKudosBadge(b.badge)}
                >
                  <strong>{b.badge}</strong>
                  <small>{b.desc}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="chat-kudos-headline">
              Celebration Shoutout
            </label>
            <textarea
              id="chat-kudos-headline"
              className="textarea"
              rows={3}
              value={kudosHeadline}
              onChange={(e) => setKudosHeadline(e.target.value)}
              placeholder="What did they do that made a big impact?"
            />
          </div>
        </div>
      </Modal>

      {/* ─────────── 3. STANDUP / SHIP-IT MODAL ─────────── */}
      <Modal
        open={activeModal === 'standup'}
        onClose={onClose}
        title="Post Standup or Ship-It Milestone"
        subtitle="Structured update with automatic deep links to Helix Projects & Drive."
        icon={<ClipboardCheck size={20} />}
        width={540}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn--primary" onClick={handleSubmitStandupOrShipIt}>
              <Rocket size={15} />
              <span>{standupMode === 'standup' ? 'Post Standup Card' : 'Launch Ship-It Card'}</span>
            </button>
          </>
        }
      >
        <div className="stack stack--md">
          <div className="row row--sm">
            <button
              type="button"
              className={cx('btn btn--sm', standupMode === 'standup' ? 'btn--primary' : 'btn--ghost')}
              onClick={() => setStandupMode('standup')}
            >
              📋 Daily Standup
            </button>
            <button
              type="button"
              className={cx('btn btn--sm', standupMode === 'ship_it' ? 'btn--primary' : 'btn--ghost')}
              onClick={() => setStandupMode('ship_it')}
            >
              🚀 Ship-It Milestone
            </button>
          </div>

          {standupMode === 'standup' ? (
            <>
              <div className="field">
                <label className="field-label">✅ Yesterday</label>
                <input
                  className="input"
                  value={yesterday}
                  onChange={(e) => setYesterday(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label">🚀 Today</label>
                <input
                  className="input"
                  value={today}
                  onChange={(e) => setToday(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label">🛡️ Blockers</label>
                <input
                  className="input"
                  value={blockers}
                  onChange={(e) => setBlockers(e.target.value)}
                />
              </div>
              <div className="field">
                <span className="field-label">Pulse Mood</span>
                <div className="row row--sm">
                  {['🚀', '⚡', '🎧', '☕', '🔥', '🌈'].map((em) => (
                    <button
                      key={em}
                      type="button"
                      className={cx('btn btn--sm', moodEmoji === em ? 'btn--primary' : 'btn--ghost')}
                      onClick={() => setMoodEmoji(em)}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="row row--sm">
                <div className="field grow">
                  <label className="field-label">Milestone Title</label>
                  <input
                    className="input"
                    value={shipTitle}
                    onChange={(e) => setShipTitle(e.target.value)}
                  />
                </div>
                <div className="field" style={{ width: 120 }}>
                  <label className="field-label">Version</label>
                  <input
                    className="input"
                    value={shipVersion}
                    onChange={(e) => setShipVersion(e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label className="field-label">⚡ Impact Metric</label>
                <input
                  className="input"
                  value={shipImpact}
                  onChange={(e) => setShipImpact(e.target.value)}
                />
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ─────────── 4. PULSE VIBE & MOOD MODAL ─────────── */}
      <Modal
        open={activeModal === 'vibe'}
        onClose={onClose}
        title="Set Your Pulse Vibe"
        subtitle="Share your flow state, activity, or ambient soundtrack across Pulse Chat & NEXUS Hub."
        icon={<Sparkles size={20} />}
        width={520}
        footer={
          <>
            {myVibe && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  clearVibe();
                  toast.info('Cleared Pulse Vibe');
                  onClose();
                }}
              >
                Clear Vibe
              </button>
            )}
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn--primary" onClick={handleSaveVibe}>
              <Sparkles size={15} />
              <span>Save Pulse Vibe</span>
            </button>
          </>
        }
      >
        <div className="stack stack--md">
          <div className="row row--sm">
            <div className="field" style={{ width: 84 }}>
              <label className="field-label">Emoji</label>
              <input
                className="input"
                value={vibeEmoji}
                onChange={(e) => setVibeEmoji(e.target.value)}
              />
            </div>
            <div className="field grow">
              <label className="field-label">Vibe Status Text</label>
              <input
                className="input"
                value={vibeText}
                onChange={(e) => setVibeText(e.target.value)}
                placeholder="e.g., Deep in Focus, Shipping Prism v2"
              />
            </div>
          </div>

          <div className="row row--sm">
            <div className="field grow">
              <label className="field-label">Sound / Activity Tag (Optional)</label>
              <input
                className="input"
                value={vibeSound}
                onChange={(e) => setVibeSound(e.target.value)}
                placeholder="e.g., Lo-Fi Beats, DIFC Lounge"
              />
            </div>
            <div className="field" style={{ width: 140 }}>
              <label className="field-label">Clear After</label>
              <select
                className="input"
                value={vibeExpires}
                onChange={(e) => setVibeExpires(e.target.value)}
              >
                <option value="30 mins">30 mins</option>
                <option value="1 hour">1 hour</option>
                <option value="2 hours">2 hours</option>
                <option value="Today">Today</option>
              </select>
            </div>
          </div>

          <div className="field">
            <span className="field-label">Quick Presets</span>
            <div className="chat-vibe-presets">
              {VIBE_PRESETS.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="chat-vibe-preset-btn"
                  onClick={() => {
                    setVibeEmoji(p.emoji);
                    setVibeText(p.text);
                    setVibeSound(p.soundTag ?? '');
                    setVibeExpires(p.expiresLabel);
                  }}
                >
                  <span>{p.emoji}</span>
                  <strong>{p.text}</strong>
                  {p.soundTag && <span className="muted text-xs">· {p.soundTag}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* ─────────── 5. NEW DM / COLLEAGUE PICKER MODAL ─────────── */}
      <Modal
        open={activeModal === 'new_dm'}
        onClose={onClose}
        title="Start a Direct Message"
        subtitle="Connect 1:1 with any colleague across NEXUS Hub."
        icon={<MessageSquarePlus size={20} />}
        width={480}
      >
        <div className="stack stack--md">
          <input
            className="input"
            placeholder="Search by name, role, department, or hub city…"
            value={dmSearch}
            onChange={(e) => setDmSearch(e.target.value)}
          />
          <div className="chat-dm-picker-list">
            {allUsers
              .filter(
                (u) =>
                  !dmSearch.trim() ||
                  `${u.name} ${u.title} ${u.department} ${u.location}`
                    .toLowerCase()
                    .includes(dmSearch.toLowerCase()),
              )
              .map((u) => {
                const uVibe = vibes[u.id];
                return (
                  <button
                    key={u.id}
                    type="button"
                    className="chat-dm-picker-item"
                    onClick={() => {
                      const dm = startDirectMessage(u.id);
                      onSelectChannel(dm.id);
                      onClose();
                    }}
                  >
                    <Avatar user={u} size={36} presence />
                    <div className="grow">
                      <div className="row row--sm">
                        <strong>{u.name}</strong>
                        {uVibe && (
                          <span className="chat-msg__vibe-pill">
                            {uVibe.emoji} {uVibe.text}
                          </span>
                        )}
                      </div>
                      <div className="muted text-xs">
                        {u.title} · {u.department} · {u.location}
                      </div>
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      </Modal>
    </>
  );
}
