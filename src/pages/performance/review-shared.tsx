/**
 * Shared sub-components and helpers for the quarterly check-in Review Packet
 * (`/performance/checkins/:reviewId`):
 *  - Nova DraftContext builder grounded in real OKRs, evidence, ladders & 360 themes
 *  - 5-point Competency rating editor with behavioural anchors & level/self comparisons
 *  - Live Bias & Quality checker (`checkReview` + one-click `applySuggestion` rewrites)
 *  - Evidence & highlights drawer (filter, pin new evidence, cite/uncite, insert snippet)
 *  - Acknowledge, Schedule 1:1 conversation & Submit/Release confirmation modals
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  BookmarkPlus,
  CalendarClock,
  Check,
  CircleCheck,
  ExternalLink,
  FileCheck2,
  Flame,
  Info,
  Lightbulb,
  MessagesSquare,
  Paperclip,
  Pin,
  Plus,
  Quote,
  Send,
  ShieldAlert,
  Sparkles,
  Target,
  WandSparkles,
} from 'lucide-react';
import { Chip, NeoEmpty, NeoPanel, NeoSearch, Ring, type Tone } from '@/components/neo';
import { burstConfetti } from '@/lib/confetti';
import { cx } from '@/lib/cx';
import { canAddEvidence } from '@/performance/access';
import { applySuggestion, checkReview, type BiasFlag } from '@/performance/bias';
import { COMPETENCIES, COMPETENCY, COMPETENCY_IDS, SCORE_LABEL } from '@/performance/constants';
import { evidenceSnippet, type EvidenceItem, type EvidenceKind } from '@/performance/evidence';
import { defaultLadderFor, gapsTo, LADDER, levelOf } from '@/performance/ladders';
import { type DraftContext, type DraftKrFact, type PeerThemes } from '@/performance/nova';
import { formatValue, isStalled, krProgress, krStatus } from '@/performance/okr';
import { usePerf } from '@/performance/store';
import type { CompetencyId, OverallRating, PerfData, Period, Review, Score5 } from '@/performance/types';
import { toast } from '@/store/toast';
import { COMP_ICON, DAY, longDate } from './checkins-shared';
import { report, shortDate, type PerfCtx } from './hooks';
import { PfModal, Seg } from './ui';

/* ═════════════════════════ Nova Draft Context Builder ═════════════════════════ */

export function buildDraftContext(input: {
  ctx: PerfCtx;
  review: Review;
  period: Period;
  now: number;
  data: PerfData;
  evidence: EvidenceItem[];
  peerThemes?: PeerThemes;
}): DraftContext {
  const { ctx, review, period, now, data, evidence, peerThemes } = input;
  const uid = review.employeeId;
  const user = ctx.user(uid);
  const firstName = ctx.first(uid);
  const managerFirstName = review.managerId ? ctx.first(review.managerId) : undefined;

  const ownedObjIds = new Set(
    data.objectives
      .filter((o) => o.periodId === period.id && (o.ownerId === uid || o.coOwnerIds.includes(uid)))
      .map((o) => o.id),
  );
  const objById = new Map(data.objectives.map((o) => [o.id, o]));
  const userKrs = data.keyResults.filter(
    (k) => (k.ownerId === uid || ownedObjIds.has(k.objectiveId)) && objById.get(k.objectiveId)?.periodId === period.id,
  );

  const krs: DraftKrFact[] = userKrs.map((k) => {
    const o = objById.get(k.objectiveId);
    const cks = k.checkins.slice().sort((a, b) => b.at - a.at);
    return {
      title: k.title,
      objectiveTitle: o?.title ?? 'Quarterly objective',
      progress: krProgress(k),
      status: krStatus(k, period, now),
      from: formatValue(k, k.start),
      now: formatValue(k, k.current),
      target: formatValue(k, k.target),
      note: cks[0]?.note,
      stalled: isStalled(k, period, now),
    };
  });

  const ul = data.levels[uid];
  const lv = levelOf(ul);
  const ladder = lv?.ladder ?? LADDER[defaultLadderFor(user?.department)];
  const targetLevel = lv?.next ?? lv?.level ?? ladder.levels[Math.min(2, ladder.levels.length - 1)];

  const basisRatings: Partial<Record<CompetencyId, Score5>> =
    Object.keys(review.manager.ratings).length > 0
      ? review.manager.ratings
      : Object.keys(review.self.ratings).length > 0
        ? review.self.ratings
        : {};

  const gaps = targetLevel
    ? gapsTo(targetLevel, basisRatings)
        .filter((g) => g.gap > 0)
        .sort((a, b) => b.gap - a.gap)
        .map((g) => g.competency)
    : [];

  const praiseCounts: Record<CompetencyId, number> = { craft: 0, collaboration: 0, ownership: 0, impact: 0, customer: 0 };
  for (const e of evidence) {
    if (e.positive && e.competency) praiseCounts[e.competency] += 1;
  }
  const strengths = [...COMPETENCY_IDS].sort(
    (a, b) => (basisRatings[b] ?? 3) - (basisRatings[a] ?? 3) || praiseCounts[b] - praiseCounts[a],
  );

  const goals = data.goals
    .filter((g) => g.userId === uid && g.status !== 'done')
    .map((g) => g.title);

  return {
    firstName,
    managerFirstName,
    evidence,
    krs,
    goals,
    gaps,
    strengths,
    peerThemes,
  };
}

/* ═════════════════════════ 5-Point Competency Rating Editor ═════════════════════════ */

export function CompetencyRatingList({
  values,
  onChange,
  readOnly = false,
  compareSelf,
  compareLevel,
  levelLabel,
  subjectFirst,
}: {
  values: Partial<Record<CompetencyId, Score5>>;
  onChange?: (id: CompetencyId, score: Score5) => void;
  readOnly?: boolean;
  /** Optional self-ratings shown for comparison when a manager is rating. */
  compareSelf?: Partial<Record<CompetencyId, Score5>>;
  /** Optional career-ladder expectations shown for context. */
  compareLevel?: Partial<Record<CompetencyId, number>>;
  levelLabel?: string;
  subjectFirst?: string;
}) {
  const [hover, setHover] = useState<{ id: CompetencyId; score: Score5 } | null>(null);

  return (
    <div className="pf-rv-comps">
      {COMPETENCIES.map((c) => {
        const val = values[c.id];
        const preview = hover?.id === c.id ? hover.score : val;
        const selfVal = compareSelf?.[c.id];
        const expVal = compareLevel?.[c.id];
        const delta = val && selfVal ? val - selfVal : null;

        return (
          <div key={c.id} className={cx('pf-rv-comp', val && 'is-rated')} data-qa={`rv-comp-${c.id}`}>
            <div className="pf-rv-comp__top">
              <span className="pf-rv-comp__icon" aria-hidden="true">
                {COMP_ICON[c.id]}
              </span>
              <div className="pf-rv-comp__info">
                <div className="pf-rv-comp__title-row">
                  <h4 className="pf-rv-comp__title">{c.label}</h4>
                  {selfVal !== undefined && (
                    <Chip size="sm" tone="slate" title={`${subjectFirst ?? 'Employee'} rated themselves ${selfVal} (${SCORE_LABEL[selfVal]})`}>
                      {subjectFirst ? `${subjectFirst}: ` : 'Self: '}
                      {selfVal} · {SCORE_LABEL[selfVal]}
                    </Chip>
                  )}
                  {expVal !== undefined && levelLabel && (
                    <Chip size="sm" tone="violet" title={`${levelLabel} expectation: ${expVal} (${SCORE_LABEL[expVal]})`}>
                      {levelLabel} bar: {expVal}
                    </Chip>
                  )}
                  {delta !== null && delta !== 0 && (
                    <span className={cx('pf-rv-comp__delta', delta > 0 ? 'is-up' : 'is-down')}>
                      {delta > 0 ? `+${delta} vs self` : `${delta} vs self`}
                    </span>
                  )}
                </div>
                <p className="pf-rv-comp__blurb">{c.blurb}</p>
              </div>
              <div className="pf-rv-comp__scale" role="radiogroup" aria-label={`Rate ${c.label}`}>
                {([1, 2, 3, 4, 5] as Score5[]).map((n) => {
                  const active = val === n;
                  const lit = val !== undefined && n <= val;
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={readOnly}
                      className={cx('pf-rv-score-btn', active && 'is-active', lit && 'is-lit')}
                      title={`${n} · ${SCORE_LABEL[n]} — ${c.anchors[n - 1]}`}
                      onMouseEnter={() => !readOnly && setHover({ id: c.id, score: n })}
                      onMouseLeave={() => setHover((h) => (h?.id === c.id ? null : h))}
                      onClick={() => !readOnly && onChange?.(c.id, n)}
                      data-qa={`rv-rate-${c.id}-${n}`}
                    >
                      <span className="pf-rv-score-btn__num">{n}</span>
                      <span className="pf-rv-score-btn__lbl">{SCORE_LABEL[n]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className={cx('pf-rv-comp__anchor', preview && 'is-lit')}>
              {preview ? (
                <>
                  <span className="neo-hud">
                    Level {preview} · {SCORE_LABEL[preview]}
                  </span>
                  <span>{c.anchors[preview - 1]}</span>
                </>
              ) : (
                <span className="pf-faint">
                  {readOnly ? 'Not rated yet' : `Hover or select 1–5 to see the behavioural anchor for ${c.label.toLowerCase()}.`}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═════════════════════════ Bias & Narrative Quality Coach ═════════════════════════ */

export function BiasCoachPanel({
  answers,
  rating,
  evidence,
  cited,
  now,
  onApplyRewrite,
  questionLabels,
}: {
  answers: Record<string, string>;
  rating?: OverallRating;
  evidence: EvidenceItem[];
  cited: string[];
  now: number;
  onApplyRewrite?: (questionId: string, nextText: string, flag: BiasFlag) => void;
  questionLabels?: Record<string, string>;
}) {
  const bias = useMemo(
    () =>
      checkReview({
        answers: Object.entries(answers).map(([id, text]) => ({ id, text })),
        rating,
        evidence: evidence.map((e) => ({ id: e.id, title: e.title, at: e.at })),
        cited,
        now,
      }),
    [answers, rating, evidence, cited, now],
  );

  const tone: Tone = bias.score >= 85 ? 'success' : bias.score >= 65 ? 'warning' : 'danger';

  return (
    <NeoPanel
      hud="Nova · Fairness & specificity"
      title="Narrative quality check"
      icon={<ShieldAlert />}
      className="pf-rv-bias"
      actions={
        <Chip size="sm" tone={tone}>
          {bias.words ? `${bias.score}/100` : 'Write first'}
        </Chip>
      }
    >
      <div className="pf-rv-bias__summary">
        <Ring value={bias.words ? bias.score / 100 : 0} size={62} stroke={6} label={`Quality score ${bias.score} of 100`}>
          <span className="pf-rv-bias__num">{bias.words ? bias.score : '—'}</span>
        </Ring>
        <div className="pf-rv-bias__meta">
          <b>
            {bias.words === 0
              ? 'Checks your answers as you write'
              : bias.flags.length === 0
                ? 'Specific, behaviour-based & balanced'
                : `${bias.flags.length} suggestion${bias.flags.length === 1 ? '' : 's'} to sharpen`}
          </b>
          <span>
            {bias.words} words across answers · {cited.length} evidence item{cited.length === 1 ? '' : 's'} cited
            {bias.recencyShare !== null ? ` (${Math.round(bias.recencyShare * 100)}% from last 14d)` : ''}
          </span>
        </div>
      </div>

      {bias.flags.length > 0 ? (
        <ul className="pf-rv-bias__flags">
          {bias.flags.map((f) => {
            const qText = f.questionId ? answers[f.questionId] ?? '' : '';
            const canRewrite = !!onApplyRewrite && !!f.questionId && !!f.match && f.suggestion !== undefined;
            return (
              <li key={f.id} className="pf-rv-bias__flag" data-sev={f.severity}>
                <div className="pf-rv-bias__flag-top">
                  {f.severity === 'warn' ? <AlertTriangle aria-hidden="true" /> : <Info aria-hidden="true" />}
                  <b>{f.title}</b>
                  {f.questionId && questionLabels?.[f.questionId] && (
                    <span className="neo-hud">{questionLabels[f.questionId]}</span>
                  )}
                </div>
                <p className="pf-rv-bias__flag-msg">{f.message}</p>
                {canRewrite && (
                  <button
                    type="button"
                    className="neo-btn neo-btn--soft neo-btn--xs pf-rv-bias__fix"
                    onClick={() => {
                      const next = applySuggestion(qText, f);
                      onApplyRewrite!(f.questionId!, next, f);
                      toast.success('Applied specific phrasing');
                    }}
                    data-qa={`rv-bias-fix-${f.kind}`}
                  >
                    <WandSparkles />
                    {f.suggestion ? `Replace “${f.match}” → “${f.suggestion.slice(0, 44)}${f.suggestion.length > 44 ? '…' : ''}”` : `Remove “${f.match}”`}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        bias.words > 0 && (
          <div className="pf-rv-bias__clean">
            <CircleCheck aria-hidden="true" /> No vague clichés, personality labels, coded terms, or recency bias detected.
          </div>
        )
      )}
    </NeoPanel>
  );
}

/* ═════════════════════════ Evidence & Highlights Picker ═════════════════════════ */

const KIND_META: Record<EvidenceKind, { label: string; tone: Tone; icon: ReactNode }> = {
  work: { label: 'Shipped', tone: 'teal', icon: <FileCheck2 /> },
  okr: { label: 'OKR', tone: 'violet', icon: <Target /> },
  kudos: { label: 'Kudos', tone: 'pink', icon: <Flame /> },
  feedback: { label: 'Feedback', tone: 'blue', icon: <Quote /> },
  pinned: { label: 'Pinned', tone: 'amber', icon: <Pin /> },
};

export function EvidenceDrawer({
  ctx,
  subjectId,
  evidence,
  cited,
  canCite,
  onToggleCite,
  onInsertSnippet,
  activeQuestionPrompt,
}: {
  ctx: PerfCtx;
  subjectId: string;
  evidence: EvidenceItem[];
  cited: string[];
  canCite: boolean;
  onToggleCite?: (id: string) => void;
  onInsertSnippet?: (item: EvidenceItem) => void;
  activeQuestionPrompt?: string;
}) {
  const [filter, setFilter] = useState<'all' | 'work' | 'okr' | 'praise'>('all');
  const [q, setQ] = useState('');
  const [pinOpen, setPinOpen] = useState(false);
  const [pinTitle, setPinTitle] = useState('');
  const [pinDetail, setPinDetail] = useState('');

  const citedSet = useMemo(() => new Set(cited), [cited]);
  const canPin = canAddEvidence(ctx.v, ctx.users, subjectId).ok;
  const first = ctx.first(subjectId);

  const filtered = useMemo(() => {
    return evidence.filter((e) => {
      if (filter === 'work' && e.kind !== 'work' && e.kind !== 'pinned') return false;
      if (filter === 'okr' && e.kind !== 'okr') return false;
      if (filter === 'praise' && e.kind !== 'kudos' && e.kind !== 'feedback') return false;
      if (q.trim()) {
        const hay = `${e.title} ${e.detail ?? ''} ${e.sourceLabel}`.toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [evidence, filter, q]);

  const handlePin = () => {
    if (pinTitle.trim().length < 3) {
      toast.info('Give the highlight a short title (3+ characters)');
      return;
    }
    const res = usePerf.getState().addEvidence({
      userId: subjectId,
      title: pinTitle.trim(),
      detail: pinDetail.trim() || undefined,
      source: { app: 'performance', label: 'Review packet', to: '/performance/checkins' },
    });
    if (!report(res)) return;
    if (res.ok && canCite && onToggleCite && !citedSet.has(res.id)) {
      onToggleCite(res.id);
    }
    setPinTitle('');
    setPinDetail('');
    setPinOpen(false);
  };

  return (
    <NeoPanel
      hud={`Quarter highlights · ${cited.length} cited`}
      title={`${subjectId === ctx.me.id ? 'Your' : `${first}’s`} evidence`}
      icon={<Paperclip />}
      className="pf-rv-ev"
      actions={
        canPin ? (
          <button
            type="button"
            className="neo-btn neo-btn--ghost neo-btn--xs"
            onClick={() => setPinOpen((o) => !o)}
            data-qa="rv-pin-evidence-toggle"
          >
            <BookmarkPlus /> Pin
          </button>
        ) : undefined
      }
    >
      {pinOpen && (
        <div className="pf-rv-ev__pin-form">
          <div className="neo-field">
            <label className="neo-label" htmlFor="rv-pin-title">
              Highlight title
            </label>
            <input
              id="rv-pin-title"
              className="neo-input neo-input--sm"
              value={pinTitle}
              onChange={(e) => setPinTitle(e.target.value)}
              placeholder="e.g. Led the zero-downtime auth cutover"
            />
          </div>
          <div className="neo-field">
            <label className="neo-label" htmlFor="rv-pin-detail">
              Impact or metric (optional)
            </label>
            <input
              id="rv-pin-detail"
              className="neo-input neo-input--sm"
              value={pinDetail}
              onChange={(e) => setPinDetail(e.target.value)}
              placeholder="e.g. Cut login tickets by 28%"
            />
          </div>
          <div className="pf-row">
            <span className="pf-spacer" />
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => setPinOpen(false)}>
              Cancel
            </button>
            <button type="button" className="neo-btn neo-btn--plasma neo-btn--xs" onClick={handlePin}>
              <Plus /> Add highlight
            </button>
          </div>
        </div>
      )}

      <div className="pf-rv-ev__controls">
        <Seg
          size="sm"
          label="Filter evidence"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `All · ${evidence.length}` },
            { value: 'work', label: 'Shipped' },
            { value: 'okr', label: 'OKRs' },
            { value: 'praise', label: 'Praise' },
          ]}
        />
        {evidence.length > 4 && (
          <NeoSearch value={q} onChange={setQ} placeholder="Filter highlights…" size="sm" />
        )}
      </div>

      {canCite && activeQuestionPrompt && (
        <p className="pf-rv-ev__hint">
          <Lightbulb aria-hidden="true" /> Citing or inserting adds to: <b>{activeQuestionPrompt}</b>
        </p>
      )}

      {filtered.length > 0 ? (
        <ul className="pf-rv-ev__list">
          {filtered.map((item) => {
            const isCited = citedSet.has(item.id);
            const km = KIND_META[item.kind];
            return (
              <li key={item.id} className={cx('pf-rv-ev__item', isCited && 'is-cited')} data-kind={item.kind}>
                <div className="pf-rv-ev__item-top">
                  <Chip size="sm" tone={km.tone} icon={km.icon}>
                    {km.label}
                  </Chip>
                  {item.competency && (
                    <Chip size="sm" tone="slate">
                      {COMPETENCY[item.competency].short}
                    </Chip>
                  )}
                  <span className="pf-spacer" />
                  <span className="neo-mono pf-faint text-xs">{shortDate(item.at)}</span>
                </div>
                <p className="pf-rv-ev__title">{item.title}</p>
                {item.detail && item.detail !== item.title && (
                  <p className="pf-rv-ev__detail pf-clamp-2">{item.detail}</p>
                )}
                <div className="pf-rv-ev__foot">
                  <span className="pf-faint text-xs truncate">{item.sourceLabel}</span>
                  <span className="pf-spacer" />
                  {item.to && (
                    <Link to={item.to} className="neo-btn neo-btn--ghost neo-btn--xs" title={`Open ${item.sourceLabel}`}>
                      <ExternalLink />
                    </Link>
                  )}
                  {canCite && onInsertSnippet && (
                    <button
                      type="button"
                      className="neo-btn neo-btn--ghost neo-btn--xs"
                      onClick={() => onInsertSnippet(item)}
                      title={`Insert quote into answer: ${evidenceSnippet(item)}`}
                      data-qa={`rv-ev-insert-${item.id}`}
                    >
                      <ArrowUpRight /> Quote
                    </button>
                  )}
                  {canCite && onToggleCite ? (
                    <button
                      type="button"
                      className={cx('neo-btn neo-btn--xs', isCited ? 'neo-btn--soft' : 'neo-btn--plasma')}
                      onClick={() => onToggleCite(item.id)}
                      data-qa={`rv-ev-cite-${item.id}`}
                    >
                      {isCited ? <Check /> : <Plus />}
                      {isCited ? 'Cited' : 'Cite'}
                    </button>
                  ) : (
                    isCited && (
                      <Chip size="sm" tone="success" icon={<Check />}>
                        Cited
                      </Chip>
                    )
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <NeoEmpty compact icon={<Sparkles />} title="No matching highlights">
          {q ? `Nothing matches “${q}”.` : 'Shipped work, OKR movement, kudos and feedback from this quarter appear here.'}
        </NeoEmpty>
      )}
    </NeoPanel>
  );
}

/* ═════════════════════════ Modals: Acknowledge, Schedule, Confirm ═════════════════════════ */

export function AcknowledgeModal({
  open,
  onClose,
  review,
  cycleName,
  managerFirst,
}: {
  open: boolean;
  onClose: () => void;
  review: Review;
  cycleName: string;
  managerFirst: string;
}) {
  const [comment, setComment] = useState(review.release?.employeeComment ?? '');
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleAck = () => {
    const res = usePerf.getState().acknowledgeReview(review.id, comment);
    if (!report(res)) return;
    const r = btnRef.current?.getBoundingClientRect();
    burstConfetti(r ? { x: r.left + r.width / 2, y: r.top } : undefined);
    onClose();
  };

  return (
    <PfModal
      open={open}
      onClose={onClose}
      width={560}
      icon={<BadgeCheck />}
      title={`Acknowledge your ${cycleName} review`}
      subtitle={`Confirming means you’ve read ${managerFirst}’s review — you can also add your own note to the packet.`}
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            ref={btnRef}
            type="button"
            className="neo-btn neo-btn--plasma"
            onClick={handleAck}
            data-qa="rv-ack-confirm"
          >
            <BadgeCheck /> Acknowledge review
          </button>
        </>
      }
    >
      <div className="pf-stack">
        <div className="neo-field">
          <label className="neo-label" htmlFor="rv-ack-comment">
            Your thoughts or follow-ups (optional, shared with {managerFirst})
          </label>
          <textarea
            id="rv-ack-comment"
            className="neo-textarea"
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="e.g. Thank you for the feedback — agreed on delegating the runbooks and focusing on Prism GA next quarter."
            data-qa="rv-ack-comment"
          />
        </div>
        <p className="pf-faint text-xs">
          Acknowledging records today’s timestamp on the review packet and notifies {managerFirst}.
        </p>
      </div>
    </PfModal>
  );
}

export function ScheduleConversationModal({
  open,
  onClose,
  review,
  cycleName,
  partnerFirst,
  now,
}: {
  open: boolean;
  onClose: () => void;
  review: Review;
  cycleName: string;
  partnerFirst: string;
  now: number;
}) {
  const presets = useMemo(() => {
    const mk = (daysAhead: number, hour: number, label: string) => {
      const d = new Date(now + daysAhead * DAY);
      d.setHours(hour, 0, 0, 0);
      return { label, at: d.getTime(), sub: `${longDate(d.getTime())} · ${hour}:00` };
    };
    return [
      mk(1, 10, 'Tomorrow morning'),
      mk(2, 14, 'In 2 days · afternoon'),
      mk(5, 11, 'Next week · 11:00'),
    ];
  }, [now]);

  const initialAt = review.release?.conversationAt && review.release.conversationAt > now ? review.release.conversationAt : presets[0].at;
  const [selectedAt, setSelectedAt] = useState<number>(initialAt);

  const toDateTimeLocal = (t: number) => {
    const d = new Date(t);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const handleSave = () => {
    const res = usePerf.getState().scheduleConversation(review.id, selectedAt);
    if (!report(res)) return;
    onClose();
  };

  return (
    <PfModal
      open={open}
      onClose={onClose}
      width={520}
      icon={<CalendarClock />}
      title={`Schedule 1:1 review conversation`}
      subtitle={`Puts “Review conversation: ${cycleName}” on your 1:1 agenda with ${partnerFirst}.`}
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={handleSave} data-qa="rv-schedule-confirm">
            <MessagesSquare /> Schedule & add to 1:1
          </button>
        </>
      }
    >
      <div className="pf-stack">
        <div className="pf-rv-presets" role="group" aria-label="Quick time slots">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              className={cx('pf-rv-preset', Math.abs(selectedAt - p.at) < 60_000 && 'is-active')}
              onClick={() => setSelectedAt(p.at)}
            >
              <b>{p.label}</b>
              <span>{p.sub}</span>
            </button>
          ))}
        </div>
        <div className="neo-field">
          <label className="neo-label" htmlFor="rv-conv-dt">
            Or pick a date & time
          </label>
          <input
            id="rv-conv-dt"
            type="datetime-local"
            className="neo-input"
            value={toDateTimeLocal(selectedAt)}
            onChange={(e) => {
              const parsed = new Date(e.target.value).getTime();
              if (Number.isFinite(parsed)) setSelectedAt(parsed);
            }}
          />
        </div>
      </div>
    </PfModal>
  );
}

export function ConfirmActionModal({
  open,
  onClose,
  onConfirm,
  title,
  subtitle,
  confirmLabel,
  icon,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  subtitle: string;
  confirmLabel: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <PfModal
      open={open}
      onClose={onClose}
      width={500}
      icon={icon ?? <Send />}
      title={title}
      subtitle={subtitle}
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Keep editing
          </button>
          <button
            ref={btnRef}
            type="button"
            className="neo-btn neo-btn--plasma"
            onClick={() => {
              const r = btnRef.current?.getBoundingClientRect();
              onConfirm();
              burstConfetti(r ? { x: r.left + r.width / 2, y: r.top } : undefined);
            }}
            data-qa="rv-confirm-submit"
          >
            {icon ?? <Send />} {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </PfModal>
  );
}
