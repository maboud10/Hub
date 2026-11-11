/**
 * Helix Meet — View 3: AI Recordings & Decision Intelligence Vault
 * Chaptered replays, sentiment & engagement waveform, executive summaries,
 * and 1-click export of decisions & tasks to Helix Projects, CRM, and Pulse Chat.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  CheckCircle2,
  ExternalLink,
  FolderKanban,
  MessagesSquare,
  Play,
  TrendingUp,
} from 'lucide-react';
import { Avatars, Chip, NeoPanel, NeoTracker, NovaChip } from '@/components/neo';
import { useHub } from '@/store/hub';
import { ProjectSigil } from '@/projects/sigils';
import { useMeet } from '@/meet/store';
import { deriveActionSync } from '@/meet/tracking';

export function RecordingsView() {
  const navigate = useNavigate();
  const users = useHub((s) => s.users);

  const recordings = useMeet((s) => s.recordings);
  const activeRecordingId = useMeet((s) => s.activeRecordingId);
  const activeChapterId = useMeet((s) => s.activeChapterId);

  const setActiveRecording = useMeet((s) => s.setActiveRecording);
  const pushActionToProjects = useMeet((s) => s.pushActionToProjects);
  const pushActionToCrm = useMeet((s) => s.pushActionToCrm);
  const shareRecordingToChat = useMeet((s) => s.shareRecordingToChat);

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const activeRec = useMemo(
    () => recordings.find((r) => r.id === activeRecordingId) ?? recordings[0],
    [recordings, activeRecordingId],
  );

  const activeChapter = useMemo(
    () =>
      activeRec?.chapters.find((c) => c.id === activeChapterId) ??
      activeRec?.chapters[0],
    [activeRec, activeChapterId],
  );

  if (!activeRec) return null;

  return (
    <div className="meet-view">
      <div className="meet-stage-split">
        {/* Left List: Recording Vault Library + Active Replay Player */}
        <NeoPanel
          hud="AI RECORDING & DECISION VAULT · INDEXED BY NOVA SCRIBE"
          title="Chaptered Replays & Sentiment Waveforms"
          actions={
            <button
              type="button"
              className="neo-btn neo-btn--plasma neo-btn--xs"
              onClick={() => shareRecordingToChat(activeRec.id)}
              data-qa="meet-share-rec-chat"
            >
              <MessagesSquare />
              <span>
                {activeRec.sharedToChat
                  ? 'Shared to Pulse Chat ✓'
                  : 'Post Recap to Pulse Chat'}
              </span>
            </button>
          }
        >
          {/* Recording Selector Pills */}
          <div className="meet-rec-selector">
            {recordings.map((rec) => (
              <button
                key={rec.id}
                type="button"
                className={`meet-rec-card ${rec.id === activeRec.id ? 'is-active' : ''}`}
                onClick={() => setActiveRecording(rec.id)}
                aria-pressed={rec.id === activeRec.id}
                data-qa={`meet-rec-${rec.id}`}
              >
                <ProjectSigil icon={rec.sigil} color={rec.color} size={34} />
                <span className="meet-rec-card__body">
                  <span className="meet-rec-card__top">
                    <span className="neo-mono">{rec.code}</span>
                    <Chip tone="emerald" size="sm">
                      {rec.durationLabel}
                    </Chip>
                  </span>
                  <span className="meet-rec-card__title">{rec.title}</span>
                  <small className="meet-rec-card__when">{rec.recordedAtLabel}</small>
                </span>
              </button>
            ))}
          </div>

          {/* Active Recording Replay Stage */}
          <div className="meet-replay-stage">
            <div className="meet-replay-head">
              <div className="meet-replay-head__text">
                <span className="neo-hud">
                  ACTIVE CHAPTER · {activeChapter?.startLabel ?? '00:00'}
                </span>
                <h3 className="meet-replay-head__title">{activeChapter?.title ?? activeRec.title}</h3>
                <p className="meet-replay-head__summary">
                  {activeChapter?.summary ?? activeRec.executiveSummary}
                </p>
              </div>
              <Chip tone="cyan" size="sm">
                Sentiment {activeRec.sentimentScore}%
              </Chip>
            </div>

            {/* Engagement Waveform Bars */}
            <div className="meet-waveform">
              {activeRec.engagementWaveform.map((val, idx) => (
                <div key={idx} className="meet-waveform__col">
                  <div
                    className="meet-waveform__bar"
                    style={{
                      height: `${val}%`,
                      background: val >= 90 ? '#22d3ee' : val >= 80 ? '#34d399' : '#818cf8',
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Interactive Chapter Scrubber */}
            <div className="meet-chapters-grid">
              {activeRec.chapters.map((ch) => {
                const spk = userMap.get(ch.speakerId);
                const isSelected = activeChapter?.id === ch.id;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    className={`meet-chapter-btn ${isSelected ? 'is-active' : ''}`}
                    onClick={() => setActiveRecording(activeRec.id, ch.id)}
                    aria-pressed={isSelected}
                  >
                    <span className="meet-chapter-btn__top">
                      <span className="neo-mono">
                        <Play className="meet-inline-icon" /> {ch.startLabel}
                      </span>
                      <span>{spk?.name ?? ch.speakerId}</span>
                    </span>
                    <strong className="meet-chapter-btn__title">{ch.title}</strong>
                    <small className="meet-chapter-btn__summary">{ch.summary}</small>
                  </button>
                );
              })}
            </div>
          </div>
        </NeoPanel>

        {/* Right Dossier: Executive Summary, Decisions & Cross-App Action Export */}
        <NeoPanel
          hud={`NOVA EXECUTIVE BRIEF · ${activeRec.code}`}
          title="Decisions & Cross-App Action Sync"
          actions={
            <button
              type="button"
              className="neo-btn neo-btn--ghost neo-btn--xs"
              onClick={() => navigate(activeRec.linkedAppTo)}
            >
              <span>{activeRec.linkedAppLabel}</span>
              <ExternalLink />
            </button>
          }
        >
          <div className="meet-rec-dossier">
            <div className="meet-rec-summary-box">
              <NovaChip>Nova Executive Synthesis</NovaChip>
              <p>{activeRec.executiveSummary}</p>
              <div className="meet-rec-participants">
                <Avatars
                  users={activeRec.participantIds
                    .map((id) => userMap.get(id))
                    .filter((u): u is NonNullable<typeof u> => Boolean(u))}
                  max={6}
                  size={24}
                />
                <span>{activeRec.viewsCount} workspace views</span>
              </div>
            </div>

            <div className="meet-decisions-block">
              <span className="neo-hud">
                VERIFIED DECISIONS ({activeRec.decisions.length})
              </span>
              <ul>
                {activeRec.decisions.map((d, i) => (
                  <li key={i}>
                    <CheckCircle2 className="meet-inline-icon" /> {d}
                  </li>
                ))}
              </ul>
            </div>

            <div className="meet-actions-block">
              <span className="neo-hud">
                ACTION ITEMS ({activeRec.actionItems.length}) · SYNC TO PROJECTS & CRM
              </span>
              <div className="meet-action-cards">
                {activeRec.actionItems.map((act) => {
                  const owner = userMap.get(act.ownerId);
                  const sync = deriveActionSync(act);
                  return (
                    <div key={act.id} className="meet-action-card">
                      <h3 className="meet-action-card__title">{act.title}</h3>
                      <div className="meet-action-card__meta">
                        <span>Owner: {owner?.name ?? act.ownerId}</span>
                        <span className="neo-mono">{act.dueLabel}</span>
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
                        >
                          <FolderKanban />
                          <span>
                            {act.pushedToProjects
                              ? 'In Helix Projects ✓'
                              : 'Push to Projects'}
                          </span>
                        </button>
                        <button
                          type="button"
                          className={`neo-btn ${act.pushedToCrm ? 'neo-btn--ghost' : 'neo-btn--soft'} neo-btn--xs`}
                          onClick={() => pushActionToCrm(act.id)}
                        >
                          <TrendingUp />
                          <span>{act.pushedToCrm ? 'In CRM ✓' : 'Log to CRM'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </NeoPanel>
      </div>
    </div>
  );
}
