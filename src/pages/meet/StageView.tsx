/**
 * Helix Meet — View 2: Live Spatial Meeting Stage & Nova AI Scribe Co-Pilot
 * Spatial Orbit / Speaker Spotlight / Grid layouts, live bilingual EN ↔ AR
 * simultaneous subtitles, floating emoji reactions, and 1-click push of
 * AI-extracted action items directly into Helix Projects & Helix CRM.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  CheckCircle2,
  Disc,
  ExternalLink,
  FolderKanban,
  Hand,
  Languages,
  LayoutGrid,
  Mic,
  MicOff,
  MonitorUp,
  Orbit,
  Plus,
  Send,
  Sparkles,
  TrendingUp,
  Video,
  VideoOff,
} from 'lucide-react';
import { Chip, NeoPanel, NeoTabs, NeoTracker, NovaChip } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { useHub } from '@/store/hub';
import { ProjectSigil } from '@/projects/sigils';
import { useMeet } from '@/meet/store';
import { deriveActionSync } from '@/meet/tracking';
import type { StageLayoutMode } from '@/meet/types';

const REACTION_EMOJIS = ['🚀', '🔥', '👏', '💡', '❤️', '✅'];

const LAYOUT_TABS: { value: StageLayoutMode; label: string; icon: React.ReactNode }[] = [
  { value: 'spatial_orbit', label: 'Spatial Orbit', icon: <Orbit /> },
  { value: 'speaker_spotlight', label: 'Spotlight', icon: <Sparkles /> },
  { value: 'grid', label: 'Equal Grid', icon: <LayoutGrid /> },
];

type DockTab = 'scribe' | 'actions' | 'poll';

export function StageView() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const users = useHub((s) => s.users);

  const greenRoom = useMeet((s) => s.greenRoom);
  const rooms = useMeet((s) => s.rooms);
  const activeRoomId = useMeet((s) => s.activeRoomId);

  const setActiveRoom = useMeet((s) => s.setActiveRoom);
  const updateGreenRoom = useMeet((s) => s.updateGreenRoom);
  const injectLiveMoment = useMeet((s) => s.injectLiveMoment);
  const sendReaction = useMeet((s) => s.sendReaction);
  const voteLivePoll = useMeet((s) => s.voteLivePoll);
  const addWhiteboardNote = useMeet((s) => s.addWhiteboardNote);
  const pushActionToProjects = useMeet((s) => s.pushActionToProjects);
  const pushActionToCrm = useMeet((s) => s.pushActionToCrm);
  const saveRoomToRecordingVault = useMeet((s) => s.saveRoomToRecordingVault);

  const queryRoomId = searchParams.get('room');
  useEffect(() => {
    if (queryRoomId) {
      setActiveRoom(queryRoomId);
    }
  }, [queryRoomId, setActiveRoom]);

  const room = useMemo(
    () => rooms.find((r) => r.id === activeRoomId) ?? rooms[0],
    [rooms, activeRoomId],
  );

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const [dockTab, setDockTab] = useState<DockTab>('scribe');
  const [customUtterance, setCustomUtterance] = useState('');
  const [newBoardNote, setNewBoardNote] = useState('');

  if (!room) return null;

  const latestLine = room.transcript[room.transcript.length - 1];

  return (
    <div className="meet-view">
      {/* Stage Top Bar: Room Selector + Layout Switcher + Linked Context */}
      <div className="meet-stage-topbar">
        <NeoTabs
          value={room.id}
          onChange={setActiveRoom}
          label="Live rooms"
          className="meet-room-tabs"
          items={rooms.map((r) => ({
            value: r.id,
            title: r.title,
            icon: <ProjectSigil icon={r.sigil} color={r.color} size={20} />,
            label: (
              <>
                <span className="neo-mono meet-room-tab__code">{r.code}</span>
                <span className="meet-room-tab__title">{r.title.split('·')[0].trim()}</span>
              </>
            ),
          }))}
        />

        <NeoTabs
          value={greenRoom.stageLayout}
          onChange={(mode) => updateGreenRoom({ stageLayout: mode })}
          label="Stage layout"
          items={LAYOUT_TABS}
        />
      </div>

      {/* Main Split: Spatial Video Canvas + Live Nova AI Scribe Side-Dock */}
      <div className="meet-stage-split">
        <div className="meet-stage-canvas-wrap">
          <div className={`meet-stage-canvas is-layout-${greenRoom.stageLayout}`}>
            <div className="meet-stage-hud">
              <div className="meet-stage-hud__left">
                <Chip tone="danger" size="sm">
                  ● REC · {room.elapsedMinutes}:18
                </Chip>
                <span className="neo-mono">{room.code}</span>
                {room.linkedAppLabel && room.linkedAppTo && (
                  <button
                    type="button"
                    className="neo-chip meet-stage-link-pill"
                    data-tone="blue"
                    onClick={() => navigate(room.linkedAppTo!)}
                  >
                    <span>{room.linkedAppLabel}</span>
                    <ExternalLink />
                  </button>
                )}
              </div>

              { room.recentReactions.length > 0 && (
                <div className="meet-reaction-stream" data-qa="meet-reaction-stream">
                  {room.recentReactions.slice(0, 5).map((rx) => (
                    <span key={rx.id} className="meet-reaction-bubble">
                      {rx.emoji}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Participant Spatial Tiles */}
            <div className="meet-participants-grid">
              {room.participants.map((pt) => {
                const u = userMap.get(pt.userId);
                return (
                  <div
                    key={pt.userId}
                    className={`meet-participant-tile ${pt.speaking ? 'is-speaking' : ''}`}
                  >
                    <div className="meet-participant-tile__top">
                      <span className="neo-mono">{pt.hub}</span>
                      <Chip
                        tone={
                          pt.sentiment === 'energized'
                            ? 'emerald'
                            : pt.sentiment === 'aligned'
                              ? 'cyan'
                              : 'violet'
                        }
                        size="sm"
                      >
                        {pt.talkTimePct}% talk share
                      </Chip>
                    </div>

                    <div className="meet-participant-tile__center">
                      <div className={`meet-audio-ring ${pt.speaking ? 'is-active' : ''}`}>
                        {u ? (
                          <Avatar user={u} size={64} presence />
                        ) : (
                          <ProjectSigil icon="orbit" color={room.color} size={64} />
                        )}
                      </div>
                      <h3 className="meet-participant-tile__name">{u?.name ?? pt.userId}</h3>
                      <small className="meet-participant-tile__role">{pt.roleLabel}</small>
                    </div>

                    <div className="meet-participant-tile__foot">
                      <span className="meet-audio-bars">
                        <i style={{ height: `${Math.max(20, pt.audioLevel * 0.8)}%` }} />
                        <i style={{ height: `${Math.max(20, pt.audioLevel)}%` }} />
                        <i style={{ height: `${Math.max(20, pt.audioLevel * 0.6)}%` }} />
                      </span>
                      <span>{pt.muted ? 'Muted' : pt.speaking ? 'Speaking Live' : 'Listening'}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Live Bilingual EN <-> AR Simultaneous Caption Ribbon */}
            {greenRoom.bilingualCaptionsOn && latestLine && (
              <div className="meet-bilingual-caption-bar" data-qa="meet-bilingual-captions">
                <div className="meet-caption-speaker">
                  <Languages />
                  <strong>
                    {userMap.get(latestLine.speakerId)?.name ?? 'Speaker'} ({latestLine.timestamp})
                  </strong>
                </div>
                <div className="meet-caption-lines">
                  <p className="meet-caption-en">{latestLine.textEn}</p>
                  <p className="meet-caption-ar" dir="rtl">
                    {latestLine.textAr}
                  </p>
                </div>
              </div>
            )}

            {/* Bottom Holo-Control Dock */}
            <div className="meet-control-dock">
              <button
                type="button"
                className={`neo-btn ${greenRoom.micOn ? 'neo-btn--soft' : 'neo-btn--plasma'} neo-btn--sm`}
                onClick={() => updateGreenRoom({ micOn: !greenRoom.micOn })}
              >
                {greenRoom.micOn ? <Mic /> : <MicOff />}
                <span>{greenRoom.micOn ? 'Mute' : 'Unmute'}</span>
              </button>

              <button
                type="button"
                className={`neo-btn ${greenRoom.cameraOn ? 'neo-btn--soft' : 'neo-btn--plasma'} neo-btn--sm`}
                onClick={() => updateGreenRoom({ cameraOn: !greenRoom.cameraOn })}
              >
                {greenRoom.cameraOn ? <Video /> : <VideoOff />}
                <span>{greenRoom.cameraOn ? 'Video' : 'Start Video'}</span>
              </button>

              <button
                type="button"
                className={`neo-btn ${greenRoom.screenShareOn ? 'neo-btn--plasma' : 'neo-btn--soft'} neo-btn--sm`}
                onClick={() => updateGreenRoom({ screenShareOn: !greenRoom.screenShareOn })}
                aria-pressed={greenRoom.screenShareOn}
              >
                <MonitorUp />
                <span>{greenRoom.screenShareOn ? 'Sharing Canvas' : 'Share Canvas'}</span>
              </button>

              <button
                type="button"
                className={`neo-btn ${greenRoom.handRaised ? 'neo-btn--plasma' : 'neo-btn--soft'} neo-btn--sm`}
                onClick={() => updateGreenRoom({ handRaised: !greenRoom.handRaised })}
                aria-pressed={greenRoom.handRaised}
              >
                <Hand />
                <span>{greenRoom.handRaised ? 'Hand Raised' : 'Raise Hand'}</span>
              </button>

              <div className="meet-emoji-bar">
                {REACTION_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    className="neo-btn neo-btn--ghost neo-btn--sm neo-btn--icon meet-emoji-btn"
                    onClick={() => sendReaction(em)}
                    title={`React ${em}`}
                  >
                    <span className="meet-emoji">{em}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="neo-btn neo-btn--plasma neo-btn--sm"
                onClick={() => {
                  saveRoomToRecordingVault();
                  navigate('/meet/recordings');
                }}
                data-qa="meet-save-recording"
              >
                <Disc />
                <span>Save to AI Vault</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Nova Live Scribe, Action Item Bridge & Poll/Whiteboard */}
        <NeoPanel
          hud="NOVA LIVE SCRIBE · BILINGUAL TRANSCRIPT & CROSS-APP EXECUTION"
          title="Co-Pilot Intelligence Dock"
          className="meet-scribe-dock"
        >
          <NeoTabs<DockTab>
            value={dockTab}
            onChange={setDockTab}
            label="Co-Pilot Intelligence Dock"
            className="meet-dock-tabs"
            items={[
              { value: 'scribe', label: 'Transcript', count: room.transcript.length },
              { value: 'actions', label: 'Actions', count: room.actionItems.length },
              { value: 'poll', label: 'Poll & Board' },
            ]}
          />

          {dockTab === 'scribe' && (
            <div className="meet-scribe-pane">
              <div className="meet-scribe-inject">
                <input
                  type="text"
                  className="neo-input neo-input--sm meet-input"
                  value={customUtterance}
                  onChange={(e) => setCustomUtterance(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      injectLiveMoment(customUtterance);
                      setCustomUtterance('');
                    }
                  }}
                  placeholder="Simulate live spoken decision or click + Capture Moment…"
                  data-qa="meet-inject-input"
                />
                <button
                  type="button"
                  className="neo-btn neo-btn--plasma neo-btn--sm"
                  onClick={() => {
                    injectLiveMoment(customUtterance);
                    setCustomUtterance('');
                  }}
                  data-qa="meet-inject-btn"
                >
                  <Plus />
                  <span>Capture Moment</span>
                </button>
              </div>

              <div className="meet-transcript-list">
                {room.transcript.map((line) => {
                  const spk = userMap.get(line.speakerId);
                  return (
                    <div key={line.id} className="meet-transcript-item">
                      <div className="meet-transcript-item__head">
                        <strong>{spk?.name ?? line.speakerId}</strong>
                        <span className="neo-mono">{line.timestamp}</span>
                        {line.highlightKind && (
                          <Chip tone="cyan" size="sm">
                            {line.highlightKind.toUpperCase()}
                          </Chip>
                        )}
                      </div>
                      <p className="meet-transcript-en">{line.textEn}</p>
                      <p className="meet-transcript-ar" dir="rtl">
                        {line.textAr}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {dockTab === 'actions' && (
            <div className="meet-actions-pane">
              <div className="meet-decisions-block">
                <span className="neo-hud">LOCKED DECISIONS ({room.decisions.length})</span>
                <ul>
                  {room.decisions.map((d, i) => (
                    <li key={i}>
                      <CheckCircle2 className="meet-inline-icon" /> {d}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="meet-actions-block">
                <span className="neo-hud">
                  EXTRACTED ACTION ITEMS · 1-CLICK PUSH TO PROJECTS & CRM
                </span>
                <div className="meet-action-cards">
                  {room.actionItems.map((act) => {
                    const owner = userMap.get(act.ownerId);
                    const sync = deriveActionSync(act);
                    return (
                      <div key={act.id} className="meet-action-card" data-qa={`meet-act-${act.id}`}>
                        <h3 className="meet-action-card__title">{act.title}</h3>
                        <div className="meet-action-card__meta">
                          <span>Owner: {owner?.name ?? act.ownerId}</span>
                          <span className="neo-mono">Due: {act.dueLabel}</span>
                        </div>
                        <NeoTracker
                          compact
                          steps={sync.steps}
                          current={sync.current}
                          state={sync.state}
                          label="Action item sync"
                        />
                        <div className="meet-action-card__btns">
                          <button
                            type="button"
                            className={`neo-btn ${act.pushedToProjects ? 'neo-btn--ghost' : 'neo-btn--plasma'} neo-btn--xs`}
                            onClick={() => pushActionToProjects(act.id)}
                            data-qa={`meet-push-proj-${act.id}`}
                          >
                            <FolderKanban />
                            <span>
                              {act.pushedToProjects
                                ? 'Synced to Helix Projects ✓'
                                : 'Push to Helix Projects'}
                            </span>
                          </button>
                          <button
                            type="button"
                            className={`neo-btn ${act.pushedToCrm ? 'neo-btn--ghost' : 'neo-btn--soft'} neo-btn--xs`}
                            onClick={() => pushActionToCrm(act.id)}
                            data-qa={`meet-push-crm-${act.id}`}
                          >
                            <TrendingUp />
                            <span>
                              {act.pushedToCrm ? 'Logged in CRM ✓' : 'Log to CRM Deal'}
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {dockTab === 'poll' && (
            <div className="meet-poll-pane">
              <div className="meet-poll-box">
                <NovaChip>Live Room Poll</NovaChip>
                <h3 className="meet-poll-box__question">{room.livePoll.question}</h3>
                <div className="meet-poll-opts">
                  {room.livePoll.options.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className="meet-poll-opt"
                      onClick={() => voteLivePoll(room.id, opt.id)}
                    >
                      <span>{opt.label}</span>
                      <Chip tone="cyan" size="sm">
                        {opt.votes.length} votes
                      </Chip>
                    </button>
                  ))}
                </div>
              </div>

              <div className="meet-whiteboard-box">
                <span className="neo-hud">SHARED SPATIAL WHITEBOARD NOTES</span>
                <ul className="meet-board-list">
                  {room.whiteboardNotes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
                <div className="meet-scribe-inject">
                  <input
                    type="text"
                    className="neo-input neo-input--sm meet-input"
                    value={newBoardNote}
                    onChange={(e) => setNewBoardNote(e.target.value)}
                    placeholder="Add architecture note to spatial board…"
                  />
                  <button
                    type="button"
                    className="neo-btn neo-btn--soft neo-btn--sm"
                    onClick={() => {
                      addWhiteboardNote(room.id, newBoardNote);
                      setNewBoardNote('');
                    }}
                  >
                    <Send />
                    <span>Pin</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </NeoPanel>
      </div>
    </div>
  );
}
