/**
 * One interview as an agenda row (also used for past interviews and the
 * week-view detail peek): time, format, candidate, panel, feedback progress,
 * status and the actions the viewer is allowed to take.
 */
import type { CSSProperties } from 'react';
import { CalendarClock, CalendarX2, ClipboardCheck, ClipboardPen, RotateCcw, UserX, Video } from 'lucide-react';
import type { Application, Candidate, Interview, Requisition, Scorecard } from '@/talent/types';
import * as access from '@/talent/access';
import { useTalentUI } from '@/talent/ui';
import { Avatar } from '@/components/ui/primitives';
import { useUserById } from '@/store/selectors';
import { cx } from '@/lib/cx';
import { CandidateAvatar, PeopleStack, SampleTag } from '../components/shared';
import { FeedbackProgress, HiddenRec, interviewStatus, KindTile, LocationLine, RecBadge, StatusPill } from './bits';
import { canSeePanelFeedback, fmtDate, fmtDuration, fmtTime, hasEnded, isOpenStatus, KIND_HUE, parseLocation, relTime } from './utils';

export type InterviewConfirm = 'cancel' | 'no-show';

export interface InterviewItemProps {
  iv: Interview;
  now: number;
  viewer: access.TalentViewer | null;
  req: Requisition | undefined;
  cand: Candidate | undefined;
  app: Application | undefined;
  cards: Scorecard[];
  variant?: 'agenda' | 'past' | 'peek';
  onConfirm: (iv: Interview, action: InterviewConfirm) => void;
  style?: CSSProperties;
}

export function InterviewItem({ iv, now, viewer, req, cand, app, cards, variant = 'agenda', onConfirm, style }: InterviewItemProps) {
  const me = viewer?.userId ?? '';
  const ui = useTalentUI.getState();
  const status = interviewStatus(iv, cards, now);
  const ended = hasEnded(iv, now);
  const started = iv.scheduledAt <= now;
  const open = isOpenStatus(iv);
  const onPanel = iv.interviewerIds.includes(me);
  const myCard = cards.find((s) => s.interviewerId === me);
  const canSchedule = !!viewer && !!req && access.canScheduleInterview(viewer, req).ok;
  const appActive = app?.status === 'active';
  const loc = parseLocation(iv.location);

  const showScorecard = onPanel && ended && open;
  const showJoin = !!loc.url && open && !ended && iv.scheduledAt - now < 15 * 60_000;
  const showReschedule = canSchedule && appActive && ((iv.status === 'scheduled' && !ended) || iv.status === 'no-show' || iv.status === 'cancelled');
  const showCancel = canSchedule && iv.status === 'scheduled' && !ended;
  const showNoShow = canSchedule && started && open && cards.length === 0;
  const peek = canSeePanelFeedback(me, iv, cards);
  const past = variant === 'past';

  const openCandidate = () => cand && ui.openCandidate(cand.id);

  return (
    <li
      className={cx('tl-iv-item', `tl-iv-item--${variant}`, `is-${status.tone}`, onPanel && 'is-mine', iv.status === 'cancelled' && 'is-cancelled')}
      style={{ '--kind-h': KIND_HUE[iv.kind], ...style } as CSSProperties}
    >
      <div className="tl-iv-item__time">
        {past || variant === 'peek' ? <span className="tl-iv-item__date">{fmtDate(iv.scheduledAt)}</span> : null}
        <span className="tl-iv-item__clock">{fmtTime(iv.scheduledAt)}</span>
        <span className="tl-iv-item__dur">{fmtDuration(iv.durationMins)}</span>
        {!past && open && !ended && iv.scheduledAt - now < 24 * 3_600_000 && (
          <span className="tl-iv-item__rel">{started ? 'now' : relTime(iv.scheduledAt, now)}</span>
        )}
      </div>

      <div className="tl-iv-item__main">
        <div className="tl-iv-item__tags">
          <KindTile kind={iv.kind} size="sm" label />
          <StatusPill {...status} />
          {onPanel && <span className="tl-iv-item__you">On your panel</span>}
        </div>
        <button type="button" className="tl-iv-item__cand" onClick={openCandidate} disabled={!cand} title={cand ? `Open ${cand.name}’s profile` : undefined}>
          {cand && <CandidateAvatar person={cand} size={36} />}
          <span className="tl-iv-item__who">
            <span className="tl-iv-item__name">
              <span className="truncate">{cand?.name ?? 'Candidate'}</span>
              {cand?.sample && <SampleTag />}
            </span>
            <span className="tl-iv-item__sub truncate">
              {iv.title}
              {req && <span className="faint"> · {req.title}</span>}
            </span>
          </span>
        </button>
        <LocationLine location={iv.location} compact />
      </div>

      <div className="tl-iv-item__panel">
        {past ? (
          <span className="tl-iv-item__recs">
            {iv.interviewerIds.map((id) => {
              const card = cards.find((s) => s.interviewerId === id);
              return (
                <span key={id} className="tl-iv-item__rec">
                  <PanelAvatar userId={id} />
                  {card ? peek || id === me ? <RecBadge rec={card.recommendation} short /> : <HiddenRec /> : <span className="tl-iv-item__pending">{iv.status === 'scheduled' || iv.status === 'completed' ? 'Pending' : '—'}</span>}
                </span>
              );
            })}
          </span>
        ) : (
          <>
            <PeopleStack userIds={iv.interviewerIds} size={26} />
            <FeedbackProgress interview={iv} cards={cards} />
          </>
        )}
      </div>

      <div className="tl-iv-item__actions">
        {showJoin && loc.url && (
          <a className="btn btn--sm btn--primary" href={loc.url} target="_blank" rel="noreferrer">
            <Video /> Join
          </a>
        )}
        {showScorecard &&
          (myCard ? (
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => ui.openModal({ kind: 'scorecard', interviewId: iv.id })}>
              <ClipboardCheck /> My scorecard
            </button>
          ) : (
            <button type="button" className="btn btn--sm btn--primary" onClick={() => ui.openModal({ kind: 'scorecard', interviewId: iv.id })}>
              <ClipboardPen /> Scorecard
            </button>
          ))}
        {showReschedule && (
          <button
            type="button"
            className={cx('btn btn--sm', iv.status === 'scheduled' ? 'btn--ghost tl-iv-item__icon-btn' : '')}
            onClick={() => ui.openModal({ kind: 'schedule', applicationId: iv.applicationId, interviewId: iv.id })}
            aria-label={iv.status === 'scheduled' ? 'Reschedule' : 'Rebook'}
            data-tip={iv.status === 'scheduled' ? 'Reschedule' : undefined}
          >
            {iv.status === 'scheduled' ? <CalendarClock /> : <RotateCcw />}
            <span className={iv.status === 'scheduled' ? 'tl-iv-item__btn-label' : undefined}>{iv.status === 'scheduled' ? 'Reschedule' : 'Rebook'}</span>
          </button>
        )}
        {showNoShow && (
          <button type="button" className="btn btn--sm btn--ghost tl-iv-item__icon-btn" onClick={() => onConfirm(iv, 'no-show')} aria-label="Mark no-show" data-tip="Mark no-show">
            <UserX />
            <span className="tl-iv-item__btn-label">No-show</span>
          </button>
        )}
        {showCancel && (
          <button type="button" className="btn btn--sm btn--ghost tl-iv-item__icon-btn tl-iv-item__danger" onClick={() => onConfirm(iv, 'cancel')} aria-label="Cancel interview" data-tip="Cancel interview">
            <CalendarX2 />
            <span className="tl-iv-item__btn-label">Cancel</span>
          </button>
        )}
      </div>
    </li>
  );
}

function PanelAvatar({ userId }: { userId: string }) {
  const u = useUserById(userId);
  return u ? (
    <span title={u.name} className="tl-iv-item__rec-avatar">
      <Avatar user={u} size={22} />
    </span>
  ) : null;
}
