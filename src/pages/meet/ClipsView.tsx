/**
 * Helix Meet — View 4: Async Video Clips Studio
 * Loom-grade async screen & camera walkthroughs that replace status calls,
 * complete with timestamped reactions, comments, and an instant Clip Recorder.
 */
import { useMemo, useState } from 'react';
import { Film, MessageSquarePlus, Play, Sparkles } from 'lucide-react';
import { Chip, NeoPanel, NovaChip } from '@/components/neo';
import { useHub } from '@/store/hub';
import { ProjectSigil } from '@/projects/sigils';
import { useMeet } from '@/meet/store';
import type { AsyncVideoClip } from '@/meet/types';

export function ClipsView() {
  const users = useHub((s) => s.users);
  const clips = useMeet((s) => s.clips);
  const createAsyncClip = useMeet((s) => s.createAsyncClip);
  const reactToClip = useMeet((s) => s.reactToClip);
  const commentOnClip = useMeet((s) => s.commentOnClip);

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const [selectedClipId, setSelectedClipId] = useState<string>(clips[0]?.id ?? 'clip-1');
  const [newClipTitle, setNewClipTitle] = useState('');
  const [newClipSummary, setNewClipSummary] = useState('');
  const [newClipCat, setNewClipCat] =
    useState<AsyncVideoClip['category']>('design_walkthrough');
  const [commentText, setCommentText] = useState('');

  const activeClip = useMemo(
    () => clips.find((c) => c.id === selectedClipId) ?? clips[0],
    [clips, selectedClipId],
  );

  const totalHoursSaved = useMemo(
    () => clips.reduce((acc, c) => acc + c.hoursSavedTotal, 0),
    [clips],
  );

  const handlePublishClip = () => {
    const created = createAsyncClip({
      title: newClipTitle || 'Q4 Sovereign Cloud & Arabic RTL Demo Walkthrough',
      summary:
        newClipSummary ||
        '3-minute async walkthrough replacing the weekly cross-hub status sync.',
      category: newClipCat,
    });
    setNewClipTitle('');
    setNewClipSummary('');
    setSelectedClipId(created.id);
  };

  return (
    <div className="meet-view">
      {/* Studio Recorder Panel */}
      <NeoPanel
        hud="ASYNC VIDEO CLIPS STUDIO · REPLACE SYNCHRONOUS STATUS MEETINGS"
        title="Record & Publish a 3-Minute Async HoloMeet Clip"
        actions={
          <NovaChip>
            {totalHoursSaved.toFixed(1)} Team Maker Hours Saved by Async Clips
          </NovaChip>
        }
      >
        <div className="meet-clip-composer">
          <div className="meet-clip-composer__row">
            <input
              type="text"
              className="neo-input meet-input"
              value={newClipTitle}
              onChange={(e) => setNewClipTitle(e.target.value)}
              placeholder="Clip title (e.g., 3-Min Demo: New MEDDPICC & Monte-Carlo Surfaces)…"
              data-qa="meet-clip-title"
            />
            <select
              className="neo-select meet-select"
              value={newClipCat}
              onChange={(e) =>
                setNewClipCat(e.target.value as AsyncVideoClip['category'])
              }
            >
              <option value="design_walkthrough">Design Walkthrough</option>
              <option value="eng_demo">Engineering Demo</option>
              <option value="exec_update">Executive Flash Update</option>
              <option value="customer_brief">Customer Deal Brief</option>
            </select>
            <button
              type="button"
              className="neo-btn neo-btn--plasma"
              onClick={handlePublishClip}
              data-qa="meet-publish-clip"
            >
              <Film />
              <span>Record & Publish Clip</span>
            </button>
          </div>
          <input
            type="text"
            className="neo-input meet-input"
            value={newClipSummary}
            onChange={(e) => setNewClipSummary(e.target.value)}
            placeholder="Optional summary or key takeaway for Nova auto-chapters…"
          />
        </div>
      </NeoPanel>

      {/* Main Split: Clips Feed + Active Clip Player & Timestamped Comments */}
      <div className="meet-stage-split">
        <NeoPanel
          hud={`TEAM ASYNC FEED · ${clips.length} CLIPS PUBLISHED`}
          title="Watch at 2x Speed · Zero Calendar Load"
        >
          <div className="meet-clips-list">
            {clips.map((c) => {
              const author = userMap.get(c.authorId);
              const isSelected = activeClip?.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`meet-clip-card ${isSelected ? 'is-active' : ''}`}
                  onClick={() => setSelectedClipId(c.id)}
                  aria-pressed={isSelected}
                  data-qa={`meet-clip-${c.id}`}
                >
                  <ProjectSigil icon={c.sigil} color={c.color} size={38} />
                  <span className="meet-clip-card__body">
                    <span className="meet-clip-card__top">
                      <span className="neo-mono">
                        {c.code} · {c.durationLabel}
                      </span>
                      <Chip tone="emerald" size="sm">
                        +{c.hoursSavedTotal}h saved
                      </Chip>
                    </span>
                    <span className="meet-clip-card__title">{c.title}</span>
                    <span className="meet-clip-card__summary">{c.summary}</span>
                    <span className="meet-clip-card__foot">
                      <span>
                        By {author?.name ?? c.authorId} · {c.createdAtLabel}
                      </span>
                      <span>{c.views} views</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </NeoPanel>

        {activeClip && (
          <NeoPanel
            hud={`ASYNC CLIP PLAYER · ${activeClip.code} (${activeClip.durationLabel})`}
            title={activeClip.title}
          >
            <div className="meet-clip-player">
              <div className="meet-clip-screen">
                <Play className="meet-clip-play-icon" />
                <div className="meet-clip-screen__text">
                  <NovaChip>2x Speed AI Playback · EN & AR Subtitles Ready</NovaChip>
                  <h3 className="meet-clip-screen__title">{activeClip.title}</h3>
                  <p className="meet-clip-screen__summary">{activeClip.summary}</p>
                </div>
              </div>

              <div className="meet-clip-reactions">
                {(['🔥', '🚀', '💡', '👏', '❤️', '✅'] as const).map((em) => (
                  <button
                    key={em}
                    type="button"
                    className="neo-btn neo-btn--sm meet-emoji-btn"
                    onClick={() => reactToClip(activeClip.id, em)}
                  >
                    <span className="meet-emoji">{em}</span>
                    <small className="neo-mono">{activeClip.reactions[em] ?? 0}</small>
                  </button>
                ))}
              </div>

              <div className="meet-decisions-block">
                <span className="neo-hud">NOVA KEY TAKEAWAYS</span>
                <ul>
                  {activeClip.keyTakeaways.map((k, i) => (
                    <li key={i}>
                      <Sparkles className="meet-inline-icon" /> {k}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="meet-clip-comments">
                <span className="neo-hud">
                  TIMESTAMPED COMMENTS ({activeClip.comments.length})
                </span>
                <div className="meet-comment-list">
                  {activeClip.comments.map((cm) => {
                    const u = userMap.get(cm.authorId);
                    return (
                      <div key={cm.id} className="meet-comment-row">
                        <span className="neo-mono">01:{String(cm.timestampSec % 60).padStart(2, '0')}</span>
                        <strong>{u?.name ?? cm.authorId}:</strong>
                        <span>{cm.text}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="meet-scribe-inject">
                  <input
                    type="text"
                    className="neo-input neo-input--sm meet-input"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add a timestamped reaction or question…"
                  />
                  <button
                    type="button"
                    className="neo-btn neo-btn--soft neo-btn--sm"
                    onClick={() => {
                      commentOnClip(activeClip.id, commentText);
                      setCommentText('');
                    }}
                  >
                    <MessageSquarePlus />
                    <span>Post</span>
                  </button>
                </div>
              </div>
            </div>
          </NeoPanel>
        )}
      </div>
    </div>
  );
}
