/**
 * Pipeline Kanban card. `PipelineCardView` is presentational (also rendered in
 * the drag overlay); `PipelineCard` wires dnd-kit: pointer/touch drags start
 * anywhere on the card, keyboard drags start from the grip handle, and the
 * "Move to…" menu is the accessible alternative.
 */
import type { ReactNode } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Ban, Briefcase, CalendarCheck, ClipboardCheck, Clock, Gavel, GripVertical, HandHeart, MessageSquareReply, PartyPopper, Send, ThumbsDown, Timer } from 'lucide-react';
import type { Application, Candidate, Outreach, Requisition } from '@/talent/types';
import type { NextAction } from '@/talent/gates';
import { APPLICATION_STATUS_LABEL, OUTREACH_STATUS_META, REJECTION_LABEL, STAGE_BY_ID, stageIndex } from '@/talent/constants';
import { useTalentUI } from '@/talent/ui';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { CandidateAvatar, MatchRing, NextActionButton, SampleTag, SourceBadge } from '../components/shared';
import { fmtRelativeDay } from '../components/format';
import { MoveMenu } from './MoveMenu';
import { isClosedApp, stageVars } from './pipelineUtils';

/** Everything a card / list row needs, derived once per render in PipelineTab. */
export interface PipeRow {
  app: Application;
  cand: Candidate | undefined;
  req: Requisition | undefined;
  action: NextAction | undefined;
  needsAction: boolean;
  days: number;
  sla: 'ok' | 'warn' | 'stale';
  ivTotal: number;
  ivDone: number;
  /** Next upcoming interview (epoch ms). */
  nextIv?: number;
  cards: number;
  cardsPositive: number;
  /** Latest non-draft outreach for this candidate + requisition. */
  outreach?: Outreach;
  /** When the application reached its current status (hired / closed). */
  closedAt?: number;
}

const OUTREACH_ICON = { sent: Send, replied: MessageSquareReply, interested: HandHeart, 'not-interested': ThumbsDown, 'no-response': Timer, draft: Send } as const;

function CardMeta({ row }: { row: PipeRow }) {
  const { app, cand } = row;
  const m = STAGE_BY_ID[app.stage];
  const closed = isClosedApp(app);
  const hired = app.status === 'hired';
  const acquire = stageIndex(app.stage) <= stageIndex('applied');
  const o = row.outreach;
  const OIcon = o ? OUTREACH_ICON[o.status] : Send;
  const cardTone = row.cards === 0 ? '' : row.cardsPositive === row.cards ? 'is-success' : row.cardsPositive === 0 ? 'is-danger' : 'is-warning';
  return (
    <div className="tl-pipe-card__meta">
      {hired ? (
        <span className="tl-pipe-sla is-hired" title={row.closedAt ? `Hired ${relativeTime(row.closedAt)}` : 'Hired'}>
          <PartyPopper aria-hidden="true" />
          {row.closedAt ? relativeTime(row.closedAt) : 'Hired'}
        </span>
      ) : closed ? (
        <span className="tl-pipe-sla" title="Closed">
          <Ban aria-hidden="true" />
          {row.closedAt ? relativeTime(row.closedAt) : 'Closed'}
        </span>
      ) : (
        <span
          className={cx('tl-pipe-sla', `is-${row.sla}`)}
          title={`${row.days} day${row.days === 1 ? '' : 's'} in ${m.label}${m.slaDays ? ` · target ${m.slaDays}d` : ''}${row.sla === 'stale' ? ' · over SLA' : row.sla === 'warn' ? ' · nearing SLA' : ''}`}
        >
          <Clock aria-hidden="true" />
          {row.days}d<span className="sr-only"> in stage{row.sla === 'stale' ? ', over SLA' : ''}</span>
        </span>
      )}
      {cand && <SourceBadge source={cand.source} detail={cand.sourceDetail} />}
      {cand?.sample && <SampleTag />}
      {row.ivTotal > 0 && (
        <span
          className={cx('tl-pipe-ind', row.nextIv && row.nextIv - Date.now() < 2 * 86_400_000 && 'is-soon')}
          title={`${row.ivTotal} interview${row.ivTotal === 1 ? '' : 's'} · ${row.ivDone} done${row.nextIv ? ` · next ${fmtRelativeDay(row.nextIv)}` : ''}`}
        >
          <CalendarCheck aria-hidden="true" />
          {row.ivDone}/{row.ivTotal}
          <span className="sr-only"> interviews done</span>
        </span>
      )}
      {row.cards > 0 && (
        <span className={cx('tl-pipe-ind', cardTone)} title={`${row.cards} scorecard${row.cards === 1 ? '' : 's'} · ${row.cardsPositive} recommend hiring`}>
          <ClipboardCheck aria-hidden="true" />
          {row.cards}
          <span className="sr-only"> scorecards</span>
        </span>
      )}
      {o && acquire && !closed && (
        <span className={cx('tl-pipe-ind', `is-${OUTREACH_STATUS_META[o.status].tone}`)} title={`Outreach · ${OUTREACH_STATUS_META[o.status].label}${o.step > 1 ? ` · follow-up #${o.step - 1}` : ''}`}>
          <OIcon aria-hidden="true" />
          {OUTREACH_STATUS_META[o.status].label}
        </span>
      )}
      {app.decision && !hired && (
        <span className={cx('tl-pipe-ind', app.decision.verdict === 'hire' ? 'is-success' : 'is-danger')} title="Hiring manager decision">
          <Gavel aria-hidden="true" />
          {app.decision.verdict === 'hire' ? 'Hire' : 'No hire'}
        </span>
      )}
    </div>
  );
}

export function PipelineCardView({
  row,
  showReq,
  overlay = false,
  dragging = false,
  handle,
}: {
  row: PipeRow;
  showReq: boolean;
  overlay?: boolean;
  dragging?: boolean;
  handle?: ReactNode;
}) {
  const { app, cand, req } = row;
  const name = cand?.name ?? 'Unknown candidate';
  const closed = isClosedApp(app);
  const hired = app.status === 'hired';
  const open = () => useTalentUI.getState().openCandidate(app.candidateId);

  return (
    <div
      className={cx(
        'tl-pipe-card',
        !closed && !hired && `is-sla-${row.sla}`,
        closed && 'is-closed',
        hired && 'is-hired',
        row.action?.urgent && !closed && 'is-urgent',
        overlay && 'is-overlay',
        dragging && 'is-source',
      )}
      style={stageVars(app.stage)}
    >
      <div className="tl-pipe-card__top">
        {cand && <CandidateAvatar person={cand} size={34} />}
        <div className="tl-pipe-card__who">
          <div className="tl-pipe-card__namerow">
            {overlay ? (
              <span className="tl-pipe-card__name">{name}</span>
            ) : (
              <button type="button" className="tl-pipe-card__name" onClick={open} title={`Open ${name}’s profile`}>
                {name}
              </button>
            )}
          </div>
          <div className="tl-pipe-card__role" title={cand ? `${cand.currentTitle} @ ${cand.currentCompany}` : undefined}>
            {cand ? (
              <>
                {cand.currentTitle} <span className="faint">@</span> {cand.currentCompany}
              </>
            ) : (
              '—'
            )}
          </div>
        </div>
        {app.match ? (
          <MatchRing score={app.match.score} size={38} stroke={3.5} />
        ) : (
          <span className="tl-pipe-card__nomatch" title="No decoded JD on this requisition, so no match score">
            —
          </span>
        )}
        {handle}
      </div>

      {showReq && req && (
        <div className="tl-pipe-card__req" title={req.title}>
          <Briefcase aria-hidden="true" />
          <span className="truncate">{req.title}</span>
        </div>
      )}

      {closed && app.rejection && (
        <div className="tl-pipe-card__closed">
          <Ban aria-hidden="true" />
          <span className="truncate">
            {APPLICATION_STATUS_LABEL[app.status]} · {REJECTION_LABEL[app.rejection.reason]}
          </span>
        </div>
      )}

      <CardMeta row={row} />

      {!closed && (
        <div className="tl-pipe-card__foot">
          {overlay ? (
            row.action && row.action.kind !== 'none' && <span className="tl-pipe-card__ghost">{row.action.label}</span>
          ) : (
            <>
              <NextActionButton applicationId={app.id} className="tl-pipe-card__next" />
              {hired && row.action?.kind === 'none' && <span className="tl-pipe-card__done">{row.action.label}</span>}
              <span className="spacer" />
              <MoveMenu app={app} req={req} name={name} showProfile />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function PipelineCard({ row, showReq, canDrag }: { row: PipeRow; showReq: boolean; canDrag: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: row.app.id,
    disabled: !canDrag,
    data: { stage: row.app.stage },
  });
  const name = row.cand?.name ?? 'candidate';
  return (
    <div
      ref={setNodeRef}
      className={cx('tl-pipe-card-wrap', canDrag && 'is-draggable')}
      data-app={row.app.id}
      {...(canDrag ? listeners : {})}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
        useTalentUI.getState().openCandidate(row.app.candidateId);
      }}
    >
      <PipelineCardView
        row={row}
        showReq={showReq}
        dragging={isDragging}
        handle={
          canDrag ? (
            <button
              ref={setActivatorNodeRef}
              type="button"
              className="tl-pipe-card__grip"
              {...attributes}
              aria-label={`Drag ${name} to another stage`}
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical aria-hidden="true" />
            </button>
          ) : null
        }
      />
    </div>
  );
}
