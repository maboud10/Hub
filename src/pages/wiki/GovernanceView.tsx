import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  GitPullRequest,
  HelpCircle,
  History,
  Lock,
  PenLine,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Avatar } from '@/components/ui/primitives';
import { NeoEmpty, NeoHome, NeoKpi, NeoKpis, NeoPanel } from '@/components/neo';
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
import { FreshnessPill, sectionNumber, SpacePill, UserBadge } from './wikiUi';

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
    <article className="wk-proposal">
      <div className="wk-proposal__top">
        <div className="wk-proposal__chips">
          <span className="neo-chip" data-tone="warning">
            <GitPullRequest /> Pending four-eyes review
          </span>
          {space && <SpacePill space={space} />}
          {article?.locked && (
            <span className="neo-chip" data-tone="amber">
              <Lock /> Locked canonical
            </span>
          )}
        </div>
        <span className="wk-proposal__when">Submitted {relativeTime(proposal.createdAt)}</span>
      </div>

      <div className="wk-proposal__head">
        <div className="wk-proposal__titles">
          {article ? (
            <Link to={`/wiki/doc/${article.slug}`} className="wk-proposal__title">
              {article.title}
            </Link>
          ) : (
            <strong className="wk-proposal__title">{proposal.proposedTitle}</strong>
          )}
          <p className="wk-proposal__summary">
            <strong>Change summary:</strong> {proposal.summary}
          </p>
        </div>
        <UserBadge userId={proposal.authorId} size={28} subtitle="Proposal author" />
      </div>

      {/* Side-by-Side Comparison (Current vs Proposed) */}
      <div className="wk-diff">
        <div className="wk-diff__pane">
          <div className="wk-diff__head">
            <span className="neo-hud">Current live playbook</span>
            <span className="wk-diff__count">{article?.sections.length ?? 0} sections</span>
          </div>
          {article ? (
            <>
              <div>
                <strong>Title:</strong> {article.title}
              </div>
              <div className="wk-diff__tldr">
                <strong>TL;DR:</strong> {article.tldr}
              </div>
              {(showFullSections ? article.sections : article.sections.slice(0, 2)).map((s, i) => (
                <div key={s.id || i} className="wk-diff__sec">
                  <strong>
                    {sectionNumber(i)}. {s.heading}
                  </strong>
                  <p>{s.body}</p>
                </div>
              ))}
            </>
          ) : (
            <span className="wk-diff__tldr">Original article unavailable</span>
          )}
        </div>

        <div className="wk-diff__pane wk-diff__pane--new">
          <div className="wk-diff__head">
            <span className="neo-hud neo-hud--tint">Proposed revision</span>
            <span className="wk-diff__count wk-diff__count--new">{proposal.proposedSections.length} sections</span>
          </div>
          <div>
            <strong>Title:</strong> {proposal.proposedTitle}
          </div>
          <div className="wk-diff__tldr wk-diff__tldr--new">
            <strong>TL;DR:</strong> {proposal.proposedTldr}
          </div>
          {(showFullSections ? proposal.proposedSections : proposal.proposedSections.slice(0, 2)).map((s, i) => (
            <div key={s.id || i} className="wk-diff__sec wk-diff__sec--new">
              <strong>
                {sectionNumber(i)}. {s.heading}
              </strong>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </div>

      {((article?.sections.length ?? 0) > 2 || proposal.proposedSections.length > 2) && (
        <div>
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => setShowFullSections((v) => !v)}>
            {showFullSections
              ? 'Collapse section diff'
              : `Inspect all ${Math.max(article?.sections.length ?? 0, proposal.proposedSections.length)} sections`}
          </button>
        </div>
      )}

      {/* Review Decision Controls */}
      <div className="wk-decide">
        {gate.ok ? (
          <>
            <input
              type="text"
              className="neo-input neo-input--sm"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional curator review note (sent to author & audit trail)…"
              aria-label="Curator review note"
            />
            <button type="button" className="neo-btn neo-btn--success neo-btn--sm" onClick={() => onDecide(proposal.id, 'approved', note)}>
              <Check /> Approve &amp; publish
            </button>
            <button type="button" className="neo-btn neo-btn--danger neo-btn--sm" onClick={() => onDecide(proposal.id, 'declined', note)}>
              <X /> Decline
            </button>
          </>
        ) : isSelfAuthor && canManage ? (
          <>
            <div className="wk-sod">
              <ShieldAlert aria-hidden="true" />
              <span>
                <strong>Four-eyes separation-of-duties rule:</strong> You authored this proposal — another Knowledge Base curator must
                review and approve it.
              </span>
            </div>
            <button type="button" className="neo-btn neo-btn--sm" disabled title={gate.reason}>
              <Check /> Approve &amp; publish
            </button>
            <button type="button" className="neo-btn neo-btn--sm" disabled title={gate.reason}>
              <X /> Decline
            </button>
          </>
        ) : (
          <>
            <span className="wk-decide__wait">
              <Lock aria-hidden="true" />
              {isSelfAuthor
                ? 'Your proposal is in the queue awaiting curator review.'
                : 'Awaiting review by a Knowledge Base curator (`wiki.manage`).'}
            </span>
            {article && (
              <Link to={`/wiki/doc/${article.slug}`} className="neo-btn neo-btn--ghost neo-btn--sm">
                View live page <ArrowRight />
              </Link>
            )}
          </>
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
    <div className="wk-q">
      {author && <Avatar user={author} size={30} />}
      <div className="wk-q__body">
        <div className="wk-q__meta">
          <strong>{author?.name ?? 'Teammate'}</strong>
          <span>asked {relativeTime(comment.at)} on</span>
          {article ? (
            <Link to={`/wiki/doc/${article.slug}#wiki-qa`} className="wk-q__page">
              {article.title}
            </Link>
          ) : (
            <span>Playbook</span>
          )}
        </div>
        <p className="wk-q__text">“{comment.text}”</p>
        <div className="wk-q__acts">
          {canResolve && (
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => onResolve(comment.id)}>
              <CheckCircle2 /> Resolve
            </button>
          )}
          {article && (
            <Link to={`/wiki/doc/${article.slug}#wiki-qa`} className="neo-btn neo-btn--soft neo-btn--xs">
              Open Q&amp;A <ArrowRight />
            </Link>
          )}
        </div>
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

  const approvedCount = decidedProposals.filter((p) => p.status === 'approved').length;
  const flaggedCount = attentionArticles.filter((x) => x.freshness.flagged).length;

  return (
    <>
      {/* KPI Strip */}
      <NeoKpis label="Governance at a glance">
        <NeoKpi
          icon={<ShieldCheck />}
          label="Verified health"
          value={`${verifiedPct}%`}
          sub={`${totalVisible - attentionArticles.length} of ${totalVisible} playbooks verified`}
          tone={verifiedPct >= 80 ? 'success' : 'warning'}
        />
        <NeoKpi
          icon={<GitPullRequest />}
          label="Pending proposals"
          value={pendingProposals.length}
          sub="Four-eyes canonical review queue"
          tone={pendingProposals.length > 0 ? 'warning' : undefined}
        />
        <NeoKpi
          icon={<AlertTriangle />}
          label="Stale / flagged"
          value={attentionArticles.length}
          sub={`${flaggedCount} reader-flagged · ${attentionArticles.length - flaggedCount} review due`}
          tone={attentionArticles.length > 0 ? 'danger' : 'success'}
        />
        <NeoKpi icon={<HelpCircle />} label="Open questions" value={openQuestions.length} sub="Unresolved threads on playbooks" />
      </NeoKpis>

      <NeoHome
        sideLabel="Reader questions and audit trail"
        main={
          <>
            {/* 1. Pending Change Proposals */}
            <NeoPanel
              hud="Four-eyes review"
              title="Pending change proposals"
              icon={<GitPullRequest />}
              actions={<span className="neo-count neo-count--app">{pendingProposals.length}</span>}
            >
              {pendingProposals.length > 0 ? (
                <div className="wk-stack">
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
                <NeoEmpty compact icon={<ShieldCheck />} title="Zero pending change proposals">
                  All canonical policy proposals in your cleared spaces have been reviewed.
                </NeoEmpty>
              )}
            </NeoPanel>

            {/* 2. Freshness Queue */}
            <NeoPanel
              flush
              hud="Freshness"
              title="Stale & flagged playbooks"
              icon={<AlertTriangle />}
              actions={<span className="neo-count">{attentionArticles.length}</span>}
            >
              {attentionArticles.length > 0 ? (
                <div className="wk-frows">
                  {attentionArticles.map(({ article, freshness }) => {
                    const sp = spaceById.get(article.spaceId);
                    const canVerify = canVerifyFreshness(viewer, article, spaces);

                    return (
                      <div key={article.id} className="wk-frow" data-state={freshness.state}>
                        <div className="wk-frow__main">
                          <div className="wk-frow__chips">
                            {sp && <SpacePill space={sp} />}
                            <FreshnessPill info={freshness} compact />
                            <span className="wk-frow__cycle">
                              Verified {freshness.daysSinceVerified}d ago · {article.reviewCadenceDays}d cycle
                            </span>
                          </div>
                          <Link to={`/wiki/doc/${article.slug}`} className="wk-frow__title">
                            {article.title}
                          </Link>
                          {article.flaggedStale && (
                            <div className="wk-flag">
                              <AlertTriangle aria-hidden="true" />
                              <span>
                                <strong>Reader flag:</strong> “{article.flaggedStale.reason}” ({relativeTime(article.flaggedStale.at)})
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="wk-frow__acts">
                          <UserBadge userId={article.ownerId} size={26} subtitle="Owner" />
                          {canVerify && (
                            <button
                              type="button"
                              className="neo-btn neo-btn--success neo-btn--sm"
                              onClick={() => toast.result(verifyFreshness(article.slug))}
                            >
                              <CheckCircle2 /> Verify now
                            </button>
                          )}
                          <Link
                            to={caps.canWrite ? `/wiki/edit/${article.slug}` : `/wiki/doc/${article.slug}`}
                            className="neo-btn neo-btn--soft neo-btn--sm"
                          >
                            <PenLine /> {caps.canWrite ? 'Open & update' : 'Inspect'}
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <NeoEmpty compact icon={<CheckCircle2 />} title="Every playbook is verified up-to-date!">
                  Zero stale or reader-flagged playbooks across your cleared spaces.
                </NeoEmpty>
              )}
            </NeoPanel>
          </>
        }
        side={
          <>
            {/* 3. Open Reader Questions */}
            <NeoPanel
              hud="Readers ask"
              title="Open questions"
              icon={<HelpCircle />}
              actions={<span className="neo-count">{openQuestions.length}</span>}
            >
              {openQuestions.length > 0 ? (
                <div className="wk-qs">
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
                <div className="wk-allclear">
                  <CheckCircle2 aria-hidden="true" />
                  <div>
                    <b>All reader questions answered</b>
                    <span>No unresolved questions across Knowledge Base pages.</span>
                  </div>
                </div>
              )}
            </NeoPanel>

            <NeoPanel
              hud="Audit trail"
              title="Recently decided"
              icon={<History />}
              actions={
                decidedProposals.length > 0 ? (
                  <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => setShowDecided((v) => !v)}>
                    {showDecided ? 'Hide decided history' : `Show decided (${decidedProposals.length})`}
                  </button>
                ) : undefined
              }
            >
              {decidedProposals.length === 0 ? (
                <div className="wk-allclear">
                  <History aria-hidden="true" />
                  <div>
                    <b>No decisions yet</b>
                    <span>Approved and declined proposals are logged here for audit.</span>
                  </div>
                </div>
              ) : showDecided ? (
                <div className="wk-decided">
                  {decidedProposals.map((p) => {
                    const art = articleById.get(p.articleId);
                    return (
                      <div key={p.id} className="wk-decided__row">
                        <span className="neo-chip neo-chip--sm" data-tone={p.status === 'approved' ? 'success' : 'danger'}>
                          {p.status}
                        </span>
                        <span className="wk-decided__text">
                          <b>{art?.title ?? p.proposedTitle}</b>
                          <span>{p.summary}</span>
                        </span>
                        <span className="wk-decided__when">{p.reviewedAt ? formatDateTime(p.reviewedAt) : ''}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="wk-about__desc">
                  {approvedCount} approved · {decidedProposals.length - approvedCount} declined. Every decision records the curator, note and
                  timestamp.
                </p>
              )}
            </NeoPanel>
          </>
        }
      />
    </>
  );
}
