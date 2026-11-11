/**
 * Helix Meet — View 1: HoloMeet Command & Pre-Flight Green-Room Lobby
 * Hardware & neural audio/video check, bilingual EN ↔ AR subtitle toggle,
 * instant spatial room launcher, and live-synced Calendar rooms from Helix Calendar.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  AudioWaveform,
  CalendarDays,
  Camera,
  CameraOff,
  Languages,
  Layers,
  Mic,
  MicOff,
  Radio,
  ShieldCheck,
  Sparkles,
  Video,
} from 'lucide-react';
import { Avatars, Chip, NeoPanel, NeoTabs, NeoTracker, NovaChip } from '@/components/neo';
import { useHub } from '@/store/hub';
import { ProjectSigil } from '@/projects/sigils';
import { formatHourRange } from '@/calendar/engine';
import { useCalendar } from '@/calendar/store';
import { useMeet } from '@/meet/store';
import { derivePreflight } from '@/meet/tracking';
import type { BackgroundMode } from '@/meet/types';

const BACKGROUND_OPTIONS: { value: BackgroundMode; label: string }[] = [
  { value: 'nebula_holo', label: 'Nebula Holo-Grid' },
  { value: 'studio_blur', label: 'Bokeh Depth Blur' },
  { value: 'executive_atrium', label: 'Dubai Sky Atrium' },
  { value: 'none', label: 'Natural Frame' },
];

const PREFLIGHT_ICONS: Record<string, ReactNode> = {
  camera: <Camera />,
  mic: <Mic />,
  noise: <AudioWaveform />,
  captions: <Languages />,
  ready: <Video />,
};

export function LobbyView() {
  const navigate = useNavigate();
  const users = useHub((s) => s.users);

  const greenRoom = useMeet((s) => s.greenRoom);
  const rooms = useMeet((s) => s.rooms);
  const activeRoomId = useMeet((s) => s.activeRoomId);
  const updateGreenRoom = useMeet((s) => s.updateGreenRoom);
  const setActiveRoom = useMeet((s) => s.setActiveRoom);
  const launchInstantRoom = useMeet((s) => s.launchInstantRoom);

  const calendarEvents = useCalendar((s) => s.events);

  const [instantTitle, setInstantTitle] = useState('');
  const [instantTemplate, setInstantTemplate] = useState<
    'design' | 'incident' | 'customer' | 'pair'
  >('customer');

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const upcomingVideoEvents = useMemo(
    () => calendarEvents.filter((ev) => Boolean(ev.meetRoomId)),
    [calendarEvents],
  );

  // Pre-flight journey derived from the real green-room config.
  const stageRoom = rooms.find((r) => r.id === activeRoomId) ?? rooms[0];
  const preflight = derivePreflight(greenRoom, stageRoom?.code);

  const handleJoinRoom = (roomId: string) => {
    setActiveRoom(roomId);
    navigate(`/meet/room?room=${roomId}`);
  };

  const handleLaunchInstant = () => {
    const created = launchInstantRoom(instantTitle, instantTemplate);
    navigate(`/meet/room?room=${created.id}`);
  };

  const preflightAction =
    preflight.blockedBy === 'camera' ? (
      <button
        type="button"
        className="neo-btn neo-btn--soft neo-btn--sm"
        onClick={() => updateGreenRoom({ cameraOn: true })}
      >
        <Camera />
        <span>Turn camera on</span>
      </button>
    ) : preflight.blockedBy === 'mic' ? (
      <button
        type="button"
        className="neo-btn neo-btn--soft neo-btn--sm"
        onClick={() => updateGreenRoom({ micOn: true })}
      >
        <Mic />
        <span>Unmute</span>
      </button>
    ) : preflight.blockedBy === 'captions' ? (
      <button
        type="button"
        className="neo-btn neo-btn--soft neo-btn--sm"
        onClick={() => updateGreenRoom({ bilingualCaptionsOn: true })}
      >
        <Languages />
        <span>Arm captions</span>
      </button>
    ) : preflight.state === 'done' && stageRoom ? (
      <button
        type="button"
        className="neo-btn neo-btn--plasma neo-btn--sm"
        onClick={() => handleJoinRoom(stageRoom.id)}
      >
        <Video />
        <span>Enter Stage</span>
      </button>
    ) : null;

  return (
    <div className="meet-view">
      {/* Pre-flight tracker: camera → mic → noise & network → captions → ready to join */}
      <NeoTracker
        className="meet-preflight"
        hud="Pre-flight tracker"
        title={preflight.title}
        steps={preflight.steps.map((s) => ({ ...s, icon: PREFLIGHT_ICONS[s.id] }))}
        current={preflight.current}
        state={preflight.state}
        message={preflight.message}
        actions={preflightAction}
      />

      {/* Top Split: Pre-Flight Green-Room Preview + Instant Spatial Room Launcher */}
      <div className="meet-lobby-grid">
        <NeoPanel
          hud="PRE-FLIGHT GREEN ROOM · NEURAL AUDIO & SPATIAL OPTICS"
          title="HoloMeet Studio Check"
          actions={
            <NovaChip>
              Noise Suppression {greenRoom.noiseSuppressionPct}% · Studio Ready
            </NovaChip>
          }
        >
          <div className={`meet-greenroom-stage is-bg-${greenRoom.backgroundMode}`}>
            <div className="meet-greenroom-hud">
              <Chip tone="emerald" size="sm">
                4K HDR · 60fps
              </Chip>
              {greenRoom.bilingualCaptionsOn && (
                <Chip tone="cyan" size="sm">
                  EN ↔ AR Live Subtitles Armed
                </Chip>
              )}
              {greenRoom.novaScribeAutoJoin && (
                <Chip tone="violet" size="sm">
                  Nova AI Scribe Auto-Join
                </Chip>
              )}
            </div>

            <div className="meet-greenroom-avatar">
              <div className={`meet-voice-halo ${greenRoom.micOn ? 'is-live' : ''}`}>
                <ProjectSigil icon="orbit" color="#34d399" size={64} />
              </div>
              <h3 className="meet-greenroom-avatar__name">Layla Haddad · Head of IT & Security</h3>
              <p className="meet-greenroom-avatar__status">
                {greenRoom.cameraOn
                  ? 'Spatial Eye-Contact & Holographic Depth Active'
                  : 'Camera Muted — Holographic Presence Sigil Active'}
              </p>
            </div>

            <div className="meet-greenroom-controls">
              <button
                type="button"
                className={`neo-btn ${greenRoom.micOn ? 'neo-btn--plasma' : 'neo-btn--soft'} neo-btn--sm`}
                onClick={() => updateGreenRoom({ micOn: !greenRoom.micOn })}
                aria-pressed={greenRoom.micOn}
                data-qa="meet-toggle-mic"
              >
                {greenRoom.micOn ? <Mic /> : <MicOff />}
                <span>{greenRoom.micOn ? 'Mic Live' : 'Mic Muted'}</span>
              </button>

              <button
                type="button"
                className={`neo-btn ${greenRoom.cameraOn ? 'neo-btn--plasma' : 'neo-btn--soft'} neo-btn--sm`}
                onClick={() => updateGreenRoom({ cameraOn: !greenRoom.cameraOn })}
                aria-pressed={greenRoom.cameraOn}
                data-qa="meet-toggle-cam"
              >
                {greenRoom.cameraOn ? <Camera /> : <CameraOff />}
                <span>{greenRoom.cameraOn ? '4K Camera On' : 'Camera Off'}</span>
              </button>

              <button
                type="button"
                className={`neo-btn ${greenRoom.bilingualCaptionsOn ? 'neo-btn--soft' : 'neo-btn--ghost'} neo-btn--sm`}
                onClick={() =>
                  updateGreenRoom({ bilingualCaptionsOn: !greenRoom.bilingualCaptionsOn })
                }
                aria-pressed={greenRoom.bilingualCaptionsOn}
              >
                <Languages />
                <span>{greenRoom.bilingualCaptionsOn ? 'EN ↔ AR Captions On' : 'Captions Off'}</span>
              </button>

              <button
                type="button"
                className={`neo-btn ${greenRoom.spatialAudioOn ? 'neo-btn--soft' : 'neo-btn--ghost'} neo-btn--sm`}
                onClick={() => updateGreenRoom({ spatialAudioOn: !greenRoom.spatialAudioOn })}
                aria-pressed={greenRoom.spatialAudioOn}
              >
                <AudioWaveform />
                <span>{greenRoom.spatialAudioOn ? 'Spatial 3D Audio' : 'Stereo'}</span>
              </button>
            </div>

            <div className="meet-bg-picker">
              <span className="neo-hud">ENVIRONMENT OPTICS:</span>
              <NeoTabs
                value={greenRoom.backgroundMode}
                onChange={(mode) => updateGreenRoom({ backgroundMode: mode })}
                items={BACKGROUND_OPTIONS}
                label="Environment optics"
              />
            </div>
          </div>
        </NeoPanel>

        <NeoPanel
          hud="INSTANT SPATIAL WAR-ROOM & BRIEFING LAUNCHER"
          title="Spin Up an Instant HoloMeet Room"
          actions={
            <button
              type="button"
              className="neo-btn neo-btn--ghost neo-btn--xs"
              onClick={() => navigate('/calendar')}
            >
              <CalendarDays />
              <span>Open Chronos Calendar</span>
            </button>
          }
        >
          <div className="meet-instant-box">
            <span className="neo-hud">CHOOSE SPATIAL ROOM ARCHETYPE</span>
            <div className="meet-template-grid">
              {(
                [
                  [
                    'customer',
                    'Executive Deal Room',
                    'Auto-links CRM MEDDPICC HUD + SOC2 Packet',
                  ],
                  [
                    'design',
                    'Spatial Product & Figma Jam',
                    'Interactive canvas + bilingual EN/AR captions',
                  ],
                  [
                    'incident',
                    'Zero-Trust Incident War-Room',
                    'Links Helpdesk & SRE telemetry with auto-timeline',
                  ],
                  [
                    'pair',
                    'AI & Architecture Pair Lab',
                    'Low-latency code canvas + Projects task extraction',
                  ],
                ] as const
              ).map(([tpl, title, desc]) => (
                <button
                  key={tpl}
                  type="button"
                  className={`meet-tpl-card ${instantTemplate === tpl ? 'is-active' : ''}`}
                  onClick={() => setInstantTemplate(tpl)}
                  aria-pressed={instantTemplate === tpl}
                >
                  <strong className="meet-tpl-card__title">{title}</strong>
                  <small className="meet-tpl-card__desc">{desc}</small>
                </button>
              ))}
            </div>

            <div className="meet-instant-input-row">
              <input
                type="text"
                className="neo-input meet-input"
                value={instantTitle}
                onChange={(e) => setInstantTitle(e.target.value)}
                placeholder="Optional room title (e.g., Q4 Sovereign Cloud Architecture Sync)…"
                data-qa="meet-instant-title"
              />
              <button
                type="button"
                className="neo-btn neo-btn--plasma"
                onClick={handleLaunchInstant}
                data-qa="meet-launch-instant"
              >
                <Sparkles />
                <span>Launch Instant Room</span>
              </button>
            </div>

            {/* Active Live Rooms */}
            <div className="meet-active-rooms">
              <span className="neo-hud">ACTIVE LIVE SPATIAL ROOMS ({rooms.length})</span>
              <div className="meet-room-list">
                {rooms.map((rm) => {
                  const pts = rm.participants
                    .map((p) => userMap.get(p.userId))
                    .filter((u): u is NonNullable<typeof u> => Boolean(u));
                  return (
                    <div key={rm.id} className="meet-room-row" data-qa={`meet-room-${rm.id}`}>
                      <ProjectSigil icon={rm.sigil} color={rm.color} size={36} />
                      <div className="meet-room-row__body">
                        <div className="meet-room-row__top">
                          <span className="neo-mono">{rm.code}</span>
                          <Chip tone="danger" size="sm" icon={<Radio />}>
                            LIVE · {rm.elapsedMinutes}m
                          </Chip>
                          {rm.linkedAppLabel && (
                            <Chip tone="blue" size="sm" icon={<Layers />}>
                              {rm.linkedAppLabel}
                            </Chip>
                          )}
                        </div>
                        <h3 className="meet-room-row__title">{rm.title}</h3>
                      </div>
                      <Avatars users={pts} max={4} size={24} />
                      <button
                        type="button"
                        className="neo-btn neo-btn--plasma neo-btn--xs"
                        onClick={() => handleJoinRoom(rm.id)}
                      >
                        <Video />
                        <span>Enter Stage</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </NeoPanel>
      </div>

      {/* Bottom Panel: Upcoming Calendar Rooms Synced with Helix Calendar */}
      <NeoPanel
        hud="CHRONOS CALENDAR BRIDGE · SCHEDULED SPATIAL ROOMS WITH AI PRE-READS"
        title="Scheduled Meetings Synced from Helix Calendar"
        actions={
          <button
            type="button"
            className="neo-btn neo-btn--soft neo-btn--xs"
            onClick={() => navigate('/calendar')}
          >
            <CalendarDays />
            <span>Manage in Chronos Calendar</span>
          </button>
        }
      >
        <div className="meet-upcoming-grid">
          {upcomingVideoEvents.map((ev) => {
            const attendees = ev.attendeeIds
              .map((id) => userMap.get(id))
              .filter((u): u is NonNullable<typeof u> => Boolean(u));
            const matchingRoom =
              rooms.find((r) => r.id === ev.meetRoomId) ?? rooms[0];

            return (
              <div key={ev.id} className="meet-upcoming-card">
                <div className="meet-upcoming-card__head">
                  <ProjectSigil icon={ev.sigil} color={ev.color} size={36} />
                  <div className="meet-upcoming-card__titles">
                    <span className="neo-mono meet-upcoming-card__when">
                      {ev.dayOffset === 0 ? 'TODAY' : 'UPCOMING'} ·{' '}
                      {formatHourRange(ev.startHour, ev.durationMins)} GST
                    </span>
                    <h3 className="meet-upcoming-card__title">{ev.title}</h3>
                  </div>
                </div>
                <p className="meet-upcoming-card__brief">{ev.aiPrepBrief ?? ev.description}</p>
                <div className="meet-upcoming-card__foot">
                  <Avatars users={attendees} max={4} size={22} />
                  <button
                    type="button"
                    className="neo-btn neo-btn--soft neo-btn--xs"
                    onClick={() => handleJoinRoom(matchingRoom.id)}
                  >
                    <ShieldCheck />
                    <span>Join Room</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </NeoPanel>
    </div>
  );
}
