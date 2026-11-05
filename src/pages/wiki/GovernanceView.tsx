import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  GitPullRequest,
  HelpCircle,
  Lock,
  PenLine,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Avatar, EmptyState } from '@/components/ui/primitives';
import { useUserById } from '@/store/selectors';
import { toast } from '@/store/toast';
import { formatDateTime, relativeTime } from '@/lib/format';
import { canReviewProposal, canVerifyFreshness, type WikiViewer } from '@/wiki/access';
import {
  useGovernanceQueue,
  useVisibleArticles,
  useWikiCaps,
  useWikiViewer,
} from '@/wiki/selectors';
import { useWiki } from '@/wiki/store';
import type { ChangeProposal, WikiArticle, WikiComment, WikiSpace } from '@/wiki/types';
import { FreshnessPill, SpacePill, UserBadge } from './wikiUi';

function ProposalCard({
  proposal,
  article,
  space,
  viewer,
  canManage,
  onDecide,
}: {
  proposal: ChangeProposal;
  article?: WikiArticle;
  space?: WikiSpace;
  viewer: WikiViewer | null;
  canManage: boolean;
  onDecide: (id: string, decision: 'approved' | 'declined', note: string) => void;
}) {
  const [note, setNote] = useState('');
  const [showFullSections, setShowFullSections] = useState(false);

  const gate = canReviewProposal(viewer, proposal);
  const isSelfAuthor = !!viewer && proposal.authorId === viewer.userId;

  return (
    <article className="card stack">
      <div className="row row--between row--wrap" style={{ gap: 10 }}>
        <div className="row row--wrap" style={{ gap: 8 }}>
          <span className="badge badge--warning">
            <GitPullRequest /> Pending Four-Eyes Review
          </span>
          {space && <SpacePill space={space} />}
          {article?.locked && (
            <span className="badge badge--muted">
              <Lock /> Locked Canonical
            </span>
          )}
        </div>
        <span className="text-xs faint">Submitted {relativeTime(proposal.createdAt)}</span>
      </div>

      <div className="row row--between row--wrap" style={{ gap: 12 }}>
        <div className="stack stack--sm" style={{ gap: 4, minWidth: 0 }}>
          {article ? (
            <Link
              to={`/wiki/doc/${article.slug}`}
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                fontWeight: 650,
                color: 'var(--text)',
                textDecoration: 'none',
              }}
            >
              {article.title}
            </Link>
          ) : (
            <strong style={{ fontSize: 18 }}>{proposal.proposedTitle}</strong>
          )}
          <p className="text-sm" style={{ margin: 0, color: 'var(--text-2)' }}>
            <strong>Change summary:</strong> {proposal.summary}
          </p>
        </div>

        <UserBadge userId={proposal.authorId} size={28} subtitle="Proposal Author" />
      </div>

      {/* Side-by-Side Comparison (Current vs Proposed) */}
      <div className="wk-diff-grid">
        <div className="wk-diff-pane">
          <div className="row row--between">
            <span className="stat-label">Current Live Playbook</span>
            <span className="text-xs faint">{article?.sections.length ?? 0} sections</span>
          </div>
          {article ? (
            <>
              <div className="text-xs">
                <strong>Title:</strong> {article.title}
              </div>
              <div className="text-xs muted" style={{ lineHeight: 1.5 }}>
                <strong>TL;DR:</strong> {article.tldr}
              </div>
              {(showFullSections ? article.sections : article.sections.slice(0, 2)).map((s, i) => (
                <div
                  key={s.id || i}
                  style={{
                    paddingTop: 6,
                    borderTop: '1px solid var(--border)',
                    fontSize: 12,
                  }}
                >
                  <strong>
                    0{i + 1}. {s.heading}
                  </strong>
                  <p className="muted clamp-2" style={{ margin: '2px 0 0' }}>
                    {s.body}
                  </p>
                </div>
              ))}
            </>
          ) : (
            <span className="text-xs muted">Original article unavailable</span>
          )}
        </div>

        <div className="wk-diff-pane wk-diff-pane--proposed">
          <div className="row row--between">
            <span className="stat-label" style={{ color: 'var(--wk-ink)' }}>
              Proposed Revision
            </span>
            <span className="text-xs mono" style={{ color: 'var(--wk-ink)' }}>
              {proposal.proposedSections.length} sections
            </span>
          </div>
          <div className="text-xs">
            <strong>Title:</strong> {proposal.proposedTitle}
          </div>
          <div className="text-xs" style={{ lineHeight: 1.5, color: 'var(--text)' }}>
            <strong>TL;DR:</strong> {proposal.proposedTldr}
          </div>
          {(showFullSections ? proposal.proposedSections : proposal.proposedSections.slice(0, 2)).map(
            (s, i) => (
              <div
                key={s.id || i}
                style={{
                  paddingTop: 6,
                  borderTop: '1px solid var(--border)',
                  fontSize: 12,
                }}
              >
                <strong style={{ color: 'var(--wk-ink)' }}>
                  0{i + 1}. {s.heading}
                </strong>
                <p className="clamp-2" style={{ margin: '2px 0 0', color: 'var(--text-2)' }}>
                  {s.body}
                </p>
              </div>
            ),
          )}
        </div>
      </div>

      {((article?.sections.length ?? 0) > 2 || proposal.proposedSections.length > 2) && (
        <div>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setShowFullSections((v) => !v)}
          >
            {showFullSections
              ? 'Collapse section diff'
              : `Inspect all ${Math.max(article?.sections.length ?? 0, proposal.proposedSections.length)} sections`}
          </button>
        </div>
      )}

      {/* Review Decision Controls */}
      <div style={{ paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        {gate.ok ? (
          <div className="row row--wrap" style={{ gap: 10 }}>
            <input
              type="text"
              className="input grow"
              style={{ height: 36, fontSize: 13, minWidth: 200 }}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional curator review note (sent to author & audit trail)…"
            />
            <button
              type="button"
              className="btn btn--success btn--sm"
              onClick={() => onDecide(proposal.id, 'approved', note)}
            >
              <Check /> Approve & Publish
            </button>
            <button
              type="button"
              className="btn btn--danger btn--sm"
              onClick={() => onDecide(proposal.id, 'declined', note)}
            >
              <X /> Decline
            </button>
          </div>
        ) : isSelfAuthor && canManage ? (
          <div className="row row--between row--wrap" style={{ gap: 10 }}>
            <div className="wk-sod-notice grow">
              <ShieldAlert />
              <span>
                <strong>Four-eyes separation-of-duties rule:</strong> You authored this proposal — another Knowledge Base
                curator must review and approve it.
              </span>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn btn--sm" disabled title={gate.reason}>
                <Check /> Approve & Publish
              </button>
              <button type="button" className="btn btn--sm" disabled title={gate.reason}>
                <X /> Decline
              </button>
            </div>
          </div>
        ) : (
          <div className="row row--between row--wrap" style={{ gap: 8 }}>
            <span className="text-xs muted">
              <Lock style={{ width: 12, height: 12, verticalAlign: '-2px', marginRight: 5 }} />
              {isSelfAuthor
                ? 'Your proposal is in the queue awaiting curator review.'
                : 'Awaiting review by a Knowledge Base curator (`wiki.manage`).'}
            </span>
            {article && (
              <Link to={`/wiki/doc/${article.slug}`} className="btn btn--ghost btn--sm">
                View live page <ArrowRight />
              </Link>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function QuestionQueueRow({
  comment,
  article,
  canResolve,
  onResolve,
}: {
  comment: WikiComment;
  article?: WikiArticle;
  canResolve: boolean;
  onResolve: (id: string) => void;
}) {
  const author = useUserById(comment.authorId);

  return (
    <div className="list-row" style={{ alignItems: 'flex-start', border: '1px solid var(--border)', background: 'var(--surface)' }}>
      {author && <Avatar user={author} size={32} />}
      <div className="grow stack stack--sm" style={{ minWidth: 0, gap: 4 }}>
        <div className="row row--wrap" style={{ gap: 8 }}>
          <strong className="text-sm">{author?.name ?? 'Teammate'}</strong>
          <span className="text-xs faint">asked {relativeTime(comment.at)} on</span>
          {article ? (
            <Link
              to={`/wiki/doc/${article.slug}#wiki-qa`}
              className="text-xs"
              style={{ fontWeight: 650, color: 'var(--wk-ink)', textDecoration: 'none' }}
            >
              {article.title}
            </Link>
          ) : (
            <span className="text-xs muted">Playbook</span>
          )}
        </div>
        <p className="text-sm" style={{ margin: 0, color: 'var(--text)' }}>
          “{comment.text}”
        </p>
      </div>
      <div className="row row--wrap" style={{ gap: 6 }}>
        {canResolve && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onResolve(comment.id)}>
            <CheckCircle2 /> Resolve
          </button>
        )}
        {article && (
          <Link to={`/wiki/doc/${article.slug}#wiki-qa`} className="btn btn--sm">
            Open Q&A <ArrowRight />
          </Link>
        )}
      </div>
    </div>
  );
}

export function GovernanceView() {
  const viewer = useWikiViewer();
  const caps = useWikiCaps();
  const spaces = useWiki((s) => s.spaces);
  const decideProposal = useWiki((s) => s.decideProposal);
  const verifyFreshness = useWiki((s) => s.verifyFreshness);
  const resolveComment = useWiki((s) => s.resolveComment);

  const visibleArticles = useVisibleArticles();
  const {
    pendingProposals,
    decidedProposals,
    attentionArticles,
    openQuestions,
    verifiedPct,
    totalVisible,
  } = useGovernanceQueue();

  const [showDecided, setShowDecided] = useState(false);

  const articleById = useMemo(
    () => new Map(visibleArticles.map((a) => [a.id, a])),
    [visibleArticles],
  );
  const spaceById = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);

  const handleDecide = (id: string, decision: 'approved' | 'declined', note: string) => {
    toast.result(decideProposal(id, decision, note));
  };

  return (
    <div className="stack stack--lg">
      {/* KPI Strip */}
      <div className="wk-kpi-grid">
        <div className="card stat">
          <span className="stat-label">Verified Health</span>
          <span className="stat-value" style={{ color: verifiedPct >= 80 ? 'var(--success)' : 'var(--warning)' }}>
            {verifiedPct}%
          </span>
          <span className="stat-delta">
            {totalVisible - attentionArticles.length} of {totalVisible} playbooks verified
          </span>
        </div>

        <div className="card stat">
          <span className="stat-label">Pending Change Proposals</span>
          <span className="stat-value" style={{ color: pendingProposals.length > 0 ? 'var(--wk-ink)' : 'var(--text)' }}>
            {pendingProposals.length}
          </span>
          <span className="stat-delta">Four-eyes canonical review queue</span>
        </div>

        <div className="card stat">
          <span className="stat-label">Stale / Flagged Pages</span>
          <span className="stat-value" style={{ color: attentionArticles.length > 0 ? 'var(--warning)' : 'var(--success)' }}>
            {attentionArticles.length}
          </span>
          <span className="stat-delta">Reader-flagged or review cycle due</span>
        </div>

        <div className="card stat">
          <span className="stat-label">Open Reader Questions</span>
          <span className="stat-value">{openQuestions.length}</span>
          <span className="stat-delta">Unresolved threads on playbooks</span>
        </div>
      </div>

      {/* 1. Pending Change Proposals */}
      <section aria-labelledby="wk-gov-proposals">
        <div className="section-head">
          <h2 id="wk-gov-proposals" className="section-title">
            <GitPullRequest style={{ width: 19, height: 19, color: 'var(--wk-ink)' }} />
            Pending Change Proposals
            <span className="count">{pendingProposals.length}</span>
          </h2>
          {decidedProposals.length > 0 && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setShowDecided((v) => !v)}
            >
              {showDecided ? 'Hide decided history' : `Show decided (${decidedProposals.length})`}
            </button>
          )}
        </div>

        {pendingProposals.length > 0 ? (
          <div className="stack">
            {pendingProposals.map((p) => {
              const art = articleById.get(p.articleId);
              const sp = art ? spaceById.get(art.spaceId) : undefined;
              return (
                <ProposalCard
                  key={p.id}
                  proposal={p}
                  article={art}
                  space={sp}
                  viewer={viewer}
                  canManage={caps.canManage}
                  onDecide={handleDecide}
                />
              );
            })}
          </div>
        ) : (
          <div className="card">
            <EmptyState icon={<ShieldCheck />} title="Zero pending change proposals">
              All canonical policy proposals in your cleared spaces have been reviewed.
            </EmptyState>
          </div>
        )}

        {showDecided && decidedProposals.length > 0 && (
          <div className="card stack stack--sm" style={{ marginTop: 12 }}>
            <span className="stat-label">Recently Decided Proposals</span>
            {decidedProposals.map((p) => {
              const art = articleById.get(p.articleId);
              return (
                <div key={p.id} className="list-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <div className="row row--wrap" style={{ gap: 8 }}>
                    <span className={p.status === 'approved' ? 'badge badge--success' : 'badge badge--danger'}>
                      {p.status}
                    </span>
                    <strong className="text-sm">{art?.title ?? p.proposedTitle}</strong>
                    <span className="text-xs muted">— {p.summary}</span>
                  </div>
                  <span className="text-xs faint">
                    {p.reviewedAt ? formatDateTime(p.reviewedAt) : ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 2. Freshness Queue */}
      <section className="section" aria-labelledby="wk-gov-freshness">
        <div className="section-head">
          <h2 id="wk-gov-freshness" className="section-title">
            <AlertTriangle style={{ width: 19, height: 19, color: 'var(--warning)' }} />
            Freshness & Stale Flag Queue
            <span className="count">{attentionArticles.length}</span>
          </h2>
        </div>

        {attentionArticles.length > 0 ? (
          <div className="stack">
            {attentionArticles.map(({ article, freshness }) => {
              const sp = spaceById.get(article.spaceId);
              const canVerify = canVerifyFreshness(viewer, article, spaces);

              return (
                <div key={article.id} className="card card--tight stack stack--sm" style={{ padding: '16px 18px' }}>
                  <div className="row row--between row--wrap" style={{ gap: 12 }}>
                    <div className="stack stack--sm" style={{ minWidth: 0, gap: 5 }}>
                      <div className="row row--wrap" style={{ gap: 8 }}>
                        {sp && <SpacePill space={sp} />}
                        <FreshnessPill info={freshness} />
                        <span className="text-xs muted">
                          Verified {freshness.daysSinceVerified}d ago · {article.reviewCadenceDays}d cycle
                        </span>
                      </div>

                      <Link
                        to={`/wiki/doc/${article.slug}`}
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: 17,
                          fontWeight: 650,
                          color: 'var(--text)',
                          textDecoration: 'none',
                        }}
                      >
                        {article.title}
                      </Link>

                      {article.flaggedStale && (
                        <div className="wk-flag-alert" style={{ marginTop: 2 }}>
                          <AlertTriangle />
                          <span>
                            <strong>Reader flag:</strong> “{article.flaggedStale.reason}” (
                            {relativeTime(article.flaggedStale.at)})
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="row row--wrap" style={{ gap: 10 }}>
                      <UserBadge userId={article.ownerId} size={26} subtitle="Owner" />
                      {canVerify && (
                        <button
                          type="button"
                          className="btn btn--success btn--sm"
                          onClick={() => toast.result(verifyFreshness(article.slug))}
                        >
                          <CheckCircle2 /> Verify now
                        </button>
                      )}
                      <Link
                        to={caps.canWrite ? `/wiki/edit/${article.slug}` : `/wiki/doc/${article.slug}`}
                        className="btn btn--sm"
                      >
                        <PenLine /> {caps.canWrite ? 'Open & update' : 'Inspect'}
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card">
            <EmptyState icon={<CheckCircle2 />} title="Every playbook is verified up-to-date!">
              Zero stale or reader-flagged playbooks across your cleared spaces.
            </EmptyState>
          </div>
        )}
      </section>

      {/* 3. Open Reader Questions */}
      <section className="section" aria-labelledby="wk-gov-questions">
        <div className="section-head">
          <h2 id="wk-gov-questions" className="section-title">
            <HelpCircle style={{ width: 19, height: 19, color: 'var(--wk-ink)' }} />
            Open Reader Questions
            <span className="count">{openQuestions.length}</span>
          </h2>
        </div>

        {openQuestions.length > 0 ? (
          <div className="stack stack--sm">
            {openQuestions.map((q) => {
              const art = articleById.get(q.articleId);
              const canResolve =
                caps.canManage ||
                q.authorId === viewer?.userId ||
                art?.ownerId === viewer?.userId;
              return (
                <QuestionQueueRow
                  key={q.id}
                  comment={q}
                  article={art}
                  canResolve={canResolve}
                  onResolve={(id) => toast.result(resolveComment(id))}
                />
              );
            })}
          </div>
        ) : (
          <div className="card">
            <EmptyState icon={<CheckCircle2 />} title="All reader questions answered">
              No unresolved questions across Knowledge Base pages.
            </EmptyState>
          </div>
        )}
      </section>
    </div>
  );
}
