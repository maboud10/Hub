/**
 * Requisition card: identity, seats, days open, pipeline mini-bar, best
 * candidates, hiring team, salary range and approval call-outs. Also used as
 * the live preview in the creation wizard (`preview`).
 */
import type { CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router';
import { FilePen, MapPin, Send, ShieldAlert, ShieldCheck, Wallet } from 'lucide-react';
import type { Application, Candidate, Requisition } from '@/talent/types';
import { EMPLOYMENT_LABEL, WORK_MODEL_LABEL } from '@/talent/constants';
import type { Verdict } from '@/talent/access';
import { useUserById } from '@/store/selectors';
import { cx } from '@/lib/cx';
import { MatchRing, PersonChip, PriorityBadge, ReqStatusBadge } from '../components/shared';
import { avgMatch, daysOpen, daysSince } from './helpers';
import { CompRange, ReqPipelineBar, SeatMeter, TopCandidates } from './pieces';
import { ReqTracker } from '../trackers';

export function ReqCard({
  req,
  apps,
  candById,
  now,
  preview = false,
  approval,
  onApprove,
  onSubmit,
  style,
}: {
  req: Requisition;
  apps: Application[];
  candById: Map<string, Candidate>;
  now: number;
  preview?: boolean;
  /** Headcount approval verdict for pending requisitions. */
  approval?: Verdict | null;
  onApprove?: () => void;
  /** Submit a draft for approval (when the viewer may). */
  onSubmit?: () => void;
  style?: CSSProperties;
}) {
  const navigate = useNavigate();
  const creator = useUserById(req.createdBy);
  const open = daysOpen(req, now);
  const avg = avgMatch(apps);
  const active = apps.filter((a) => a.status === 'active').length;
  const go = () => navigate(`/talent/requisitions/${req.id}`);

  return (
    <article
      className={cx('tl-req-card', `tl-req-card--${req.priority}`, `tl-req-card--${req.status}`, preview && 'is-preview')}
      onClick={preview ? undefined : go}
      style={style}
      aria-label={preview ? `Preview of ${req.title || 'the new requisition'}` : undefined}
    >
      <span className="tl-req-card__glow" aria-hidden="true" />
      <header className="tl-req-card__head">
        <div className="grow">
          <div className="tl-req-card__eyebrow">
            {req.department}
            {!preview && <span className="mono"> · {req.id}</span>}
          </div>
          <h3 className="tl-req-card__title">
            {preview ? (
              req.title || <span className="faint">Untitled role</span>
            ) : (
              <Link to={`/talent/requisitions/${req.id}`} onClick={(e) => e.stopPropagation()}>
                {req.title}
              </Link>
            )}
          </h3>
          <div className="tl-req-card__meta">
            <MapPin aria-hidden="true" />
            <span className="truncate">
              {req.location || 'Location TBD'} · {WORK_MODEL_LABEL[req.workModel]}
              {req.employmentType !== 'full-time' ? ` · ${EMPLOYMENT_LABEL[req.employmentType]}` : ''}
            </span>
            <span className="tag tl-req-card__band">{req.band}</span>
          </div>
        </div>
        <div className="tl-req-card__badges">
          <PriorityBadge priority={req.priority} />
          <ReqStatusBadge status={req.status} />
        </div>
      </header>

      {!preview && <ReqTracker req={req} apps={apps} now={now} compact className="tl-req-card__track" />}

      <div className="tl-req-card__row">
        <div className="tl-req-card__cell">
          <span className="stat-label">Seats</span>
          <SeatMeter hires={req.hires} headcount={req.headcount} />
        </div>
        <div className="tl-req-card__cell tl-req-card__cell--end">
          <span className="stat-label">{open !== null ? (req.status === 'filled' || req.status === 'closed' ? 'Was open' : 'Days open') : 'Raised'}</span>
          <span className="tl-req-card__num">
            {open !== null ? (
              <>
                {open}
                <small>d</small>
              </>
            ) : preview ? (
              'Today'
            ) : (
              `${daysSince(req.createdAt, now)}d ago`
            )}
          </span>
        </div>
      </div>

      <div className="tl-req-card__pipe">
        <div className="row row--between">
          <span className="stat-label">Pipeline</span>
          <span className="tl-req-card__count">{active ? `${active} active` : req.status === 'open' ? 'Ready to source' : '—'}</span>
        </div>
        <ReqPipelineBar apps={apps} />
      </div>

      {!preview && apps.length > 0 && (
        <div className="tl-req-card__row">
          <TopCandidates apps={apps} candById={candById} />
          <span className="tl-req-card__match">
            {avg !== null ? (
              <>
                <MatchRing score={avg} size={34} stroke={3} />
                <span className="stat-label">Avg match</span>
              </>
            ) : null}
          </span>
        </div>
      )}

      <footer className="tl-req-card__foot">
        <span className="tl-req-card__team">
          <span className="tl-req-card__role" title="Hiring manager">
            HM
          </span>
          <PersonChip userId={req.hiringManagerId} label={req.hiringManagerId ? undefined : 'Not set'} />
          <span className="tl-req-card__role" title="Recruiter">
            Rec
          </span>
          <PersonChip userId={req.recruiterId} label={req.recruiterId ? undefined : 'Not set'} />
        </span>
        <span className="tl-req-card__salary">
          <Wallet aria-hidden="true" />
          <CompRange salary={req.salary} />
        </span>
      </footer>

      {!preview && req.status === 'pending-approval' && approval && (
        <div className={cx('tl-req-card__callout', approval.ok ? 'is-actionable' : 'is-blocked')} onClick={(e) => e.stopPropagation()}>
          <ShieldAlert aria-hidden="true" />
          <div className="grow">
            <b>Headcount approval needed</b>
            <span>{approval.ok ? `Raised by ${creator?.name.split(' ')[0] ?? 'someone'} ${daysSince(req.createdAt, now) ? `${daysSince(req.createdAt, now)}d ago` : 'today'} · ${req.headcount} seat${req.headcount === 1 ? '' : 's'}` : approval.reason}</span>
          </div>
          {approval.ok && onApprove && (
            <button type="button" className="btn btn--sm btn--primary" onClick={onApprove}>
              <ShieldCheck /> Approve headcount
            </button>
          )}
        </div>
      )}
      {!preview && req.status === 'draft' && (
        <div className="tl-req-card__callout is-draft" onClick={(e) => e.stopPropagation()}>
          <FilePen aria-hidden="true" />
          <div className="grow">
            <b>Draft</b>
            <span>Not submitted for headcount approval yet.</span>
          </div>
          {onSubmit && (
            <button type="button" className="btn btn--sm" onClick={onSubmit}>
              <Send /> Submit
            </button>
          )}
        </div>
      )}
    </article>
  );
}
