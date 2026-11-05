import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  Flag,
  GitPullRequest,
  GraduationCap,
  Hash,
  HelpCircle,
  History,
  Info,
  Lightbulb,
  ListChecks,
  Lock,
  MessageSquarePlus,
  PenLine,
  Pin,
  ShieldCheck,
  Sparkles,
  StickyNote,
  ThumbsUp,
  Unlock,
} from 'lucide-react';
import { useAcademy } from '@/academy/store';
import { Modal } from '@/components/ui/Modal';
import { Avatar, EmptyState, Segmented } from '@/components/ui/primitives';
import { useHasApp, useSessionUser, useUserById } from '@/store/selectors';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { formatDate, formatDateTime, relativeTime } from '@/lib/format';
import {
  canDirectEdit,
  canProposeEdit,
  canReadArticle,
  canVerifyFreshness,
} from '@/wiki/access';
import { computeFreshness } from '@/wiki/constants';
import { useMyWikiState, useWikiCaps, useWikiViewer } from '@/wiki/selectors';
import { useWiki } from '@/wiki/store';
import type { ArticleSection, ArticleVersion, WikiComment } from '@/wiki/types';
import { FreshnessPill, SpaceBoundaryCard, SpacePill, UserBadge } from './wikiUi';

type CommentFilter = 'all' | 'question' | 'open' | 'note';

function CommentRow({
  comment,
  articleOwnerId,
  viewerId,
  canManage,
  onResolve,
}: {
  comment: WikiComment;
  articleOwnerId: string;
  viewerId?: string;
  canManage: boolean;
  onResolve: (id: string) => void;
}) {
  const author = useUserById(comment.authorId);
  const canToggleResolve =
    canManage || comment.authorId === viewerId || articleOwnerId === viewerId;

  return (
    <div
      className={cx(
        'wk-comment-item',
        comment.kind === 'question' && !comment.resolved && 'wk-comment-item--open',
      )}
    >
      {author ? (
        <Avatar user={author} size={32} />
      ) : (
        <span className="avatar" style={{ '--size': '32px', background: '#334155' } as CSSProperties}>
          HX
        </span>
      )}
      <div className="grow stack stack--sm" style={{ minWidth: 0 }}>
        <div className="row row--between row--wrap" style={{ gap: 8 }}>
          <div className="row row--wrap" style={{ gap: 8 }}>
            <strong className="text-sm">{author?.name ?? 'Helix Teammate'}</strong>
            {comment.kind === 'question' ? (
              comment.resolved ? (
                <span className="badge badge--success">
                  <CheckCircle2 /> Answered
                </span>
              ) : (
                <span className="badge badge--warning">
                  <HelpCircle /> Open Question
                </span>
              )
            ) : (
              <span className="badge badge--info">
                <StickyNote /> Field Note
              </span>
            )}
            <span className="text-xs faint">{relativeTime(comment.at)}</span>
          </div>

          {comment.kind === 'question' && canToggleResolve && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => onResolve(comment.id)}
            >
              <CheckCircle2 />
              {comment.resolved ? 'Reopen' : 'Mark resolved'}
            </button>
          )}
        </div>
        <p className="text-sm" style={{ margin: 0, lineHeight: 1.55, color: 'var(--text)' }}>
          {comment.text}
        </p>
      </div>
    </div>
  );
}

export function ArticleReader() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const me = useSessionUser();
  const viewer = useWikiViewer();
  const caps = useWikiCaps();
  const hasAcademy = useHasApp('learning');

  const spaces = useWiki((s) => s.spaces);
  const articles = useWiki((s) => s.articles);
  const proposals = useWiki((s) => s.proposals);
  const allComments = useWiki((s) => s.comments);
  const recordView = useWiki((s) => s.recordView);
  const toggleBookmark = useWiki((s) => s.toggleBookmark);
  const markRead = useWiki((s) => s.markRead);
  const toggleLock = useWiki((s) => s.toggleLock);
  const togglePin = useWiki((s) => s.togglePin);
  const verifyFreshness = useWiki((s) => s.verifyFreshness);
  const flagStale = useWiki((s) => s.flagStale);
  const toggleRunbookCheck = useWiki((s) => s.toggleRunbookCheck);
  const toggleHelpful = useWiki((s) => s.toggleHelpful);
  const addComment = useWiki((s) => s.addComment);
  const resolveComment = useWiki((s) => s.resolveComment);

  const myState = useMyWikiState();
  const academyCourses = useAcademy((s) => s.courses);

  const article = articles.find((a) => a.slug === slug);
  const space = spaces.find((s) => s.id === article?.spaceId);
  const readable = canReadArticle(viewer, article, spaces);

  const verifierUser = useUserById(article?.lastVerifiedBy);
  const flaggerUser = useUserById(article?.flaggedStale?.by);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [flagModalOpen, setFlagModalOpen] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedVerNum, setSelectedVerNum] = useState<number | null>(null);

  const [commentFilter, setCommentFilter] = useState<CommentFilter>('all');
  const [commentKind, setCommentKind] = useState<'question' | 'note'>('question');
  const [commentText, setCommentText] = useState('');

  // Record view on mount / slug change
  useEffect(() => {
    if (slug && readable) {
      recordView(slug);
    }
  }, [slug, readable, recordView]);

  // Smooth scroll to #sectionId anchor when URL hash changes
  useEffect(() => {
    if (!location.hash || !readable) return;
    const id = location.hash.slice(1);
    const timer = window.setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [location.hash, slug, readable]);

  const companionCourses = useMemo(() => {
    if (!article) return [];
    const byId = new Set(article.relatedCourseIds);
    return academyCourses.filter(
      (c) => byId.has(c.id) || c.companionSlugs.includes(article.slug),
    );
  }, [article, academyCourses]);

  const articleComments = useMemo(() => {
    if (!article) return [];
    return allComments
      .filter((c) => c.articleId === article.id)
      .sort((a, b) => b.at - a.at);
  }, [article, allComments]);

  const filteredComments = useMemo(() => {
    return articleComments.filter((c) => {
      if (commentFilter === 'question') return c.kind === 'question';
      if (commentFilter === 'open') return c.kind === 'question' && !c.resolved;
      if (commentFilter === 'note') return c.kind === 'note';
      return true;
    });
  }, [articleComments, commentFilter]);

  const pendingProposalsForArticle = useMemo(() => {
    if (!article) return [];
    return proposals.filter((p) => p.articleId === article.id && p.status === 'pending');
  }, [article, proposals]);

  if (!article) {
    return (
      <div className="card">
        <EmptyState
          icon={<BookOpen />}
          title="Playbook not found"
          action={
            <Link to="/wiki" className="btn btn--primary">
              <ArrowLeft /> Back to Knowledge Base
            </Link>
          }
        >
          We couldn’t find a playbook at <code className="mono">/wiki/doc/{slug}</code>.
        </EmptyState>
      </div>
    );
  }

  if (!readable) {
    return <SpaceBoundaryCard space={space} title={`“${article.title}” requires ${space?.name ?? 'space'} clearance`} />;
  }

  const freshness = computeFreshness(article);
  const isSaved = myState.bookmarks.includes(article.slug);
  const isRead = myState.readSlugs.includes(article.slug);
  const isHelpful = me ? article.helpfulUserIds.includes(me.id) : false;
  const checkedIds = new Set(myState.runbookChecks[article.id] ?? []);

  const allChecklistItems = article.sections.flatMap((s) => s.checklist ?? []);
  const totalCheckCount = allChecklistItems.length;
  const doneCheckCount = allChecklistItems.filter((item) => checkedIds.has(item.id)).length;

  const directEdit = canDirectEdit(viewer, article, spaces);
  const proposeEditAllowed = canProposeEdit(viewer, article, spaces);
  const verifyAllowed = canVerifyFreshness(viewer, article, spaces);

  const latestVersion = article.versions[article.versions.length - 1]?.version ?? 1;
  const sortedVersions = [...article.versions].sort((a, b) => b.version - a.version);
  const inspectedVersion: ArticleVersion | undefined =
    sortedVersions.find((v) => v.version === selectedVerNum) ?? sortedVersions[0];

  const handleCopySnippet = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      toast.success('Copied snippet to clipboard');
      window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 2000);
    } catch {
      toast.info('Clipboard unavailable in this context');
    }
  };

  const handleCopySectionAnchor = async (secId: string) => {
    const url = `${window.location.origin}/wiki/doc/${article.slug}#${secId}`;
    window.history.replaceState(null, '', `#${secId}`);
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Copied deep link to section');
    } catch {
      toast.info(`Jumped to #${secId}`);
    }
  };

  const handleFlagSubmit = (e: FormEvent) => {
    e.preventDefault();
    const res = flagStale(article.slug, flagReason);
    if (toast.result(res)) {
      setFlagReason('');
      setFlagModalOpen(false);
    }
  };

  const handleCommentSubmit = (e: FormEvent) => {
    e.preventDefault();
    const res = addComment(article.slug, commentText, commentKind);
    if (toast.result(res)) {
      setCommentText('');
    }
  };

  const renderCalloutIcon = (tone: NonNullable<ArticleSection['callout']>['tone']) => {
    if (tone === 'tip') return <Lightbulb className="wk-callout__icon" />;
    if (tone === 'warning') return <AlertTriangle className="wk-callout__icon" />;
    if (tone === 'policy') return <ShieldCheck className="wk-callout__icon" />;
    return <Info className="wk-callout__icon" />;
  };

  return (
    <div>
      {/* Top Breadcrumb & Action Bar */}
      <div className="wk-reader-topbar">
        <nav className="wk-breadcrumb" aria-label="Breadcrumb">
          <Link to="/wiki">Knowledge Base</Link>
          <ChevronRight />
          {space && (
            <>
              <Link to={`/wiki/space/${space.id}`}>{space.name}</Link>
              <ChevronRight />
            </>
          )}
          <span className="truncate" style={{ color: 'var(--text)', fontWeight: 600, maxWidth: 280 }}>
            {article.title}
          </span>
        </nav>

        <div className="wk-reader-actions">
          {caps.canManage && (
            <>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => toast.result(toggleLock(article.slug))}
                data-tip={article.locked ? 'Unlock direct contributor edits' : 'Lock canonical page (four-eyes review)'}
              >
                {article.locked ? <Unlock /> : <Lock />}
                {article.locked ? 'Unlock' : 'Lock'}
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => toast.result(togglePin(article.slug))}
              >
                <Pin />
                {article.pinned ? 'Unpin' : 'Pin'}
              </button>
            </>
          )}

          <button
            type="button"
            className={cx('btn btn--sm', isSaved && 'btn--success')}
            onClick={() => toast.result(toggleBookmark(article.slug))}
          >
            <Bookmark fill={isSaved ? 'currentColor' : 'none'} />
            {isSaved ? 'Bookmarked' : 'Bookmark'}
          </button>

          <button
            type="button"
            className={cx('btn btn--sm', isRead && 'btn--success')}
            onClick={() => {
              markRead(article.slug, !isRead);
              toast.info(isRead ? 'Marked as unread' : 'Marked playbook as read ✓');
            }}
          >
            <CheckCircle2 />
            {isRead ? 'Read ✓' : 'Mark as read'}
          </button>

          {directEdit ? (
            <Link to={`/wiki/edit/${article.slug}`} className="wk-btn-cortex" style={{ height: 32, padding: '0 13px', fontSize: 13 }}>
              <PenLine /> Edit page
            </Link>
          ) : proposeEditAllowed ? (
            <Link
              to={`/wiki/edit/${article.slug}?propose=1`}
              className="wk-btn-cortex"
              style={{ height: 32, padding: '0 13px', fontSize: 13 }}
            >
              <GitPullRequest /> Propose Change
            </Link>
          ) : null}
        </div>
      </div>

      {/* Playbook Hero & Executive TL;DR Card */}
      <header className="wk-doc-head">
        <div className="row row--wrap" style={{ gap: 8 }}>
          {space && <SpacePill space={space} />}
          {article.locked ? (
            <span className="badge badge--warning">
              <Lock /> Locked Canonical Policy
            </span>
          ) : (
            <span className="badge badge--info">Open Playbook</span>
          )}
          {article.pinned && (
            <span className="badge">
              <Pin /> Featured Highlight
            </span>
          )}
          <span className="tag">v{latestVersion}</span>
          <span className="text-xs mono muted">
            <Clock style={{ width: 12, height: 12, verticalAlign: '-2px' }} /> {article.readMins} min read
          </span>
          <span className="text-xs mono muted">
            <Eye style={{ width: 12, height: 12, verticalAlign: '-2px' }} /> {article.views} views
          </span>
        </div>

        <h1 className="wk-doc-title">{article.title}</h1>
        <p className="wk-doc-subtitle">{article.subtitle}</p>

        {article.tags.length > 0 && (
          <div className="row row--wrap" style={{ gap: 6 }}>
            {article.tags.map((t) => (
              <span key={t} className="tag">
                #{t}
              </span>
            ))}
          </div>
        )}

        {/* Executive TL;DR Card */}
        <div className="wk-tldr-card">
          <span className="wk-tldr-card__label">
            <Sparkles /> Executive TL;DR
          </span>
          <p className="wk-tldr-card__text">{article.tldr}</p>
        </div>
      </header>

      {/* Freshness Trust Banner */}
      <div
        className={cx(
          'wk-trust-banner',
          freshness.state === 'stale' && 'wk-trust-banner--stale',
          freshness.state === 'due-soon' && 'wk-trust-banner--due-soon',
        )}
      >
        <div className="row row--wrap" style={{ gap: 14, minWidth: 0 }}>
          <UserBadge userId={article.ownerId} size={30} subtitle="Page Owner" />
          <div className="stack stack--sm" style={{ gap: 2 }}>
            <div className="row row--wrap" style={{ gap: 8 }}>
              <FreshnessPill info={freshness} />
              <span className="text-xs muted">
                Last verified <strong>{formatDate(article.lastVerifiedAt)}</strong>
                {verifierUser ? ` by ${verifierUser.name}` : ''} · {article.reviewCadenceDays}d review cycle
              </span>
            </div>
          </div>
        </div>

        <div className="row row--wrap" style={{ gap: 8 }}>
          {verifyAllowed && (
            <button
              type="button"
              className="btn btn--success btn--sm"
              onClick={() => toast.result(verifyFreshness(article.slug))}
            >
              <CheckCircle2 /> Verify up-to-date ✓
            </button>
          )}
          {caps.canWrite && (
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => setFlagModalOpen(true)}
            >
              <Flag /> Flag outdated
            </button>
          )}
        </div>

        {article.flaggedStale && (
          <div className="wk-flag-alert">
            <AlertTriangle />
            <div className="grow" style={{ minWidth: 0 }}>
              <strong>Flagged for freshness review</strong>
              {flaggerUser ? ` by ${flaggerUser.name}` : ''} ({relativeTime(article.flaggedStale.at)}): “
              {article.flaggedStale.reason}”
            </div>
          </div>
        )}
      </div>

      {/* 2-Column Interactive Reader Grid */}
      <div className="wk-reader-grid">
        {/* Main Structured Sections */}
        <div className="wk-reader-main">
          {totalCheckCount > 0 && (
            <div className="wk-runbook-bar">
              <div className="row" style={{ gap: 10 }}>
                <ListChecks style={{ width: 19, height: 19, color: 'var(--wk-ink)' }} />
                <div>
                  <div className="text-sm" style={{ fontWeight: 650 }}>
                    Interactive Runbook Checklist
                  </div>
                  <div className="text-xs muted">
                    Progress is saved to your personal NEXUS profile as you execute each step.
                  </div>
                </div>
              </div>
              <div className="row" style={{ gap: 10 }}>
                <span className="badge" style={{ '--b-rgb': '45 212 191' } as CSSProperties}>
                  {doneCheckCount} / {totalCheckCount} steps completed
                </span>
                {doneCheckCount > 0 && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => {
                      for (const item of allChecklistItems) {
                        if (checkedIds.has(item.id)) toggleRunbookCheck(article.id, item.id);
                      }
                      toast.info('Reset runbook checkboxes for a fresh run');
                    }}
                  >
                    Reset ticks
                  </button>
                )}
              </div>
            </div>
          )}

          {article.sections.map((sec, idx) => {
            const secChecks = sec.checklist ?? [];
            const secDone = secChecks.filter((c) => checkedIds.has(c.id)).length;

            return (
              <section key={sec.id} id={sec.id} className="wk-section-card">
                <div className="wk-section-head">
                  <h2 className="wk-section-heading">
                    <span className="wk-section-num">0{idx + 1}</span>
                    <span>{sec.heading}</span>
                  </h2>
                  <button
                    type="button"
                    className="wk-anchor-btn"
                    onClick={() => void handleCopySectionAnchor(sec.id)}
                    aria-label={`Copy link to ${sec.heading}`}
                    data-tip="Copy section link"
                  >
                    <Hash style={{ width: 15, height: 15 }} />
                  </button>
                </div>

                <p className="wk-section-body">{sec.body}</p>

                {sec.callout && (
                  <div className={cx('wk-callout', `wk-callout--${sec.callout.tone}`)}>
                    {renderCalloutIcon(sec.callout.tone)}
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="wk-callout__title">{sec.callout.title}</div>
                      <div className="wk-callout__text">{sec.callout.text}</div>
                    </div>
                  </div>
                )}

                {sec.code && (
                  <div className="wk-code">
                    <div className="wk-code__head">
                      <span className="truncate">{sec.code.label}</span>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        style={{ height: 26, padding: '0 9px', fontSize: 11.5 }}
                        onClick={() => void handleCopySnippet(sec.id, sec.code!.snippet)}
                      >
                        {copiedId === sec.id ? <Check /> : <Copy />}
                        {copiedId === sec.id ? 'Copied!' : 'Copy snippet'}
                      </button>
                    </div>
                    <pre className="wk-code__pre">
                      <code>{sec.code.snippet}</code>
                    </pre>
                  </div>
                )}

                {secChecks.length > 0 && (
                  <div className="wk-checklist">
                    <div className="wk-checklist__head">
                      <span>Execution Steps</span>
                      <span>
                        {secDone}/{secChecks.length} complete
                      </span>
                    </div>
                    {secChecks.map((item) => {
                      const checked = checkedIds.has(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          className={cx('wk-check-item', checked && 'is-checked')}
                          onClick={() => toggleRunbookCheck(article.id, item.id)}
                        >
                          <span className="wk-check-box" aria-hidden="true">
                            {checked && <Check strokeWidth={3} />}
                          </span>
                          <span className="wk-check-label">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}

          {/* Helpful Vote Bar */}
          <div className="wk-helpful-bar">
            <div className="stack stack--sm" style={{ gap: 3 }}>
              <strong className="text-sm">Was this playbook helpful and accurate?</strong>
              <span className="text-xs muted">
                {article.helpfulUserIds.length} {article.helpfulUserIds.length === 1 ? 'teammate' : 'teammates'} endorsed
                this guide · Need a synthesized cross-playbook answer?
              </span>
            </div>
            <div className="row row--wrap" style={{ gap: 8 }}>
              <button
                type="button"
                className={cx('btn btn--sm', isHelpful && 'btn--success')}
                onClick={() => toast.result(toggleHelpful(article.slug))}
              >
                <ThumbsUp fill={isHelpful ? 'currentColor' : 'none'} />
                {isHelpful ? 'Helpful ✓' : 'Yes, helpful'} ({article.helpfulUserIds.length})
              </button>
              <Link to={`/wiki/doc/${article.slug}?ask=1`} className="btn btn--sm">
                <Sparkles /> Ask Nova Docs
              </Link>
            </div>
          </div>

          {/* Page Q&A & Field Notes Thread */}
          <section id="wiki-qa" className="card stack">
            <div className="row row--between row--wrap" style={{ gap: 10 }}>
              <h3 className="section-title" style={{ margin: 0 }}>
                <MessageSquarePlus style={{ width: 18, height: 18, color: 'var(--wk-ink)' }} />
                Page Q&A & Field Notes
                <span className="count">{articleComments.length}</span>
              </h3>

              <Segmented<CommentFilter>
                label="Filter Q&A and notes"
                value={commentFilter}
                onChange={setCommentFilter}
                options={[
                  { value: 'all', label: `All (${articleComments.length})` },
                  {
                    value: 'question',
                    label: `Questions (${articleComments.filter((c) => c.kind === 'question').length})`,
                  },
                  {
                    value: 'open',
                    label: `Open (${articleComments.filter((c) => c.kind === 'question' && !c.resolved).length})`,
                  },
                  {
                    value: 'note',
                    label: `Notes (${articleComments.filter((c) => c.kind === 'note').length})`,
                  },
                ]}
              />
            </div>

            {caps.canWrite ? (
              <form onSubmit={handleCommentSubmit} className="stack stack--sm" style={{ paddingTop: 4 }}>
                <div className="row row--between row--wrap" style={{ gap: 8 }}>
                  <Segmented<'question' | 'note'>
                    label="Post type"
                    value={commentKind}
                    onChange={setCommentKind}
                    options={[
                      { value: 'question', label: 'Ask a Question', icon: <HelpCircle /> },
                      { value: 'note', label: 'Share Field Note', icon: <StickyNote /> },
                    ]}
                  />
                  <span className="text-xs faint">
                    {commentKind === 'question'
                      ? 'Notifies the page owner & appears in Governance until resolved.'
                      : 'Adds a helpful tip for future readers.'}
                  </span>
                </div>
                <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                  <input
                    type="text"
                    className="input grow"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder={
                      commentKind === 'question'
                        ? 'Ask a clarifying question about an edge case or command…'
                        : 'Share a practical tip or time-saver…'
                    }
                  />
                  <button type="submit" className="btn btn--primary" style={{ height: 42 }}>
                    Post
                  </button>
                </div>
              </form>
            ) : (
              <div className="wk-readonly-pill" style={{ justifyContent: 'flex-start' }}>
                <Lock /> Read-only contractor access — posting Q&A comments requires contributor (`wiki.write`) clearance.
              </div>
            )}

            {filteredComments.length > 0 ? (
              <div className="stack stack--sm">
                {filteredComments.map((c) => (
                  <CommentRow
                    key={c.id}
                    comment={c}
                    articleOwnerId={article.ownerId}
                    viewerId={me?.id}
                    canManage={caps.canManage}
                    onResolve={(id) => toast.result(resolveComment(id))}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm muted" style={{ margin: '6px 0 0' }}>
                No entries in this filter yet.
              </p>
            )}
          </section>
        </div>

        {/* Sticky Right Rail */}
        <aside className="wk-reader-rail" aria-label="Playbook navigation and companion tools">
          {/* Table of Contents */}
          <div className="wk-rail-card">
            <div className="wk-rail-title">
              <BookOpen /> On This Page
            </div>
            <nav className="wk-toc-list" aria-label="Table of contents">
              {article.sections.map((sec, idx) => (
                <a key={sec.id} href={`#${sec.id}`} className="wk-toc-link">
                  <span className="truncate">
                    <span className="mono faint" style={{ marginRight: 6 }}>
                      0{idx + 1}
                    </span>
                    {sec.heading}
                  </span>
                  {sec.checklist && sec.checklist.length > 0 && (
                    <ListChecks style={{ width: 13, height: 13, flex: 'none', color: 'var(--wk-ink)' }} />
                  )}
                </a>
              ))}
              <a href="#wiki-qa" className="wk-toc-link">
                <span className="truncate">Q&A & Field Notes ({articleComments.length})</span>
              </a>
            </nav>
          </div>

          {/* Companion Helix Academy Courses */}
          {companionCourses.length > 0 && (
            <div className="wk-rail-card">
              <div className="wk-rail-title">
                <GraduationCap /> Hands-On in Helix Academy
              </div>
              <p className="text-xs muted" style={{ margin: 0 }}>
                Practice this playbook in an interactive simulation or earn your verified credential:
              </p>
              <div className="stack stack--sm">
                {companionCourses.map((course) =>
                  hasAcademy ? (
                    <Link
                      key={course.id}
                      to={`/academy/course/${course.id}`}
                      className="wk-course-link"
                    >
                      <div className="row row--between" style={{ gap: 6 }}>
                        <span className="tag">{course.track}</span>
                        <span className="text-xs mono" style={{ color: 'var(--wk-ink)' }}>
                          +{course.xp} XP
                        </span>
                      </div>
                      <strong className="text-sm">{course.title}</strong>
                      <div className="row row--between text-xs muted">
                        <span>
                          {course.durationMins} mins · {course.format}
                        </span>
                        <ArrowUpRight style={{ width: 14, height: 14 }} />
                      </div>
                    </Link>
                  ) : (
                    <div key={course.id} className="wk-course-link" style={{ opacity: 0.72 }}>
                      <div className="row row--between">
                        <span className="tag">{course.track}</span>
                        <Lock style={{ width: 13, height: 13 }} />
                      </div>
                      <strong className="text-sm">{course.title}</strong>
                      <span className="text-xs faint">Requires Academy (`app:learning`) access</span>
                    </div>
                  ),
                )}
              </div>
            </div>
          )}

          {/* Connected Workflow Deep Link (HR Portal / Talent Hub) */}
          {article.relatedRoute && (
            <div className="wk-rail-card">
              <div className="wk-rail-title">
                <ExternalLink /> Connected Workflow
              </div>
              <p className="text-xs muted" style={{ margin: 0 }}>
                Jump directly into the live operational module referenced by this playbook:
              </p>
              <Link to={article.relatedRoute.to} className="btn btn--sm btn--block">
                <span>{article.relatedRoute.label}</span>
                <ArrowUpRight />
              </Link>
            </div>
          )}

          {/* Governance, Proposals & Version History */}
          <div className="wk-rail-card">
            <div className="wk-rail-title">
              <History /> Lineage & Governance
            </div>
            <div className="text-xs muted stack stack--sm">
              <div className="row row--between">
                <span>Published revision</span>
                <strong className="mono" style={{ color: 'var(--text)' }}>
                  v{latestVersion}
                </strong>
              </div>
              <div className="row row--between">
                <span>Last updated</span>
                <strong style={{ color: 'var(--text)' }}>{formatDate(article.updatedAt)}</strong>
              </div>
              {pendingProposalsForArticle.length > 0 && (
                <Link
                  to="/wiki/governance"
                  className="badge badge--warning"
                  style={{ justifyContent: 'center', height: 28, textDecoration: 'none' }}
                >
                  <GitPullRequest /> {pendingProposalsForArticle.length} pending proposal
                  {pendingProposalsForArticle.length > 1 ? 's' : ''} →
                </Link>
              )}
            </div>

            <button
              type="button"
              className="btn btn--sm btn--block"
              onClick={() => {
                setSelectedVerNum(latestVersion);
                setHistoryOpen(true);
              }}
            >
              <History /> Inspect Version History ({article.versions.length})
            </button>

            {proposeEditAllowed && article.locked && directEdit && (
              <Link
                to={`/wiki/edit/${article.slug}?propose=1`}
                className="btn btn--ghost btn--sm btn--block"
              >
                <GitPullRequest /> Submit Four-Eyes Proposal
              </Link>
            )}
          </div>
        </aside>
      </div>

      {/* Flag Outdated Modal */}
      <Modal
        open={flagModalOpen}
        onClose={() => setFlagModalOpen(false)}
        title="Flag Playbook for Freshness Review"
        subtitle={`Notify the owner of “${article.title}” so outdated commands or policy details get updated fast.`}
        icon={
          <span className="wk-space-icon" style={{ '--sp-h': 38, '--sz': '40px' } as CSSProperties}>
            <Flag />
          </span>
        }
      >
        <form onSubmit={handleFlagSubmit} className="stack">
          <label className="field">
            <span className="field-label">What looks outdated or changed?</span>
            <textarea
              className="textarea"
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              placeholder="e.g., CLI flag changed in mesh v4.8, or policy allowance increased for 2026…"
              required
              autoFocus
            />
          </label>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn" onClick={() => setFlagModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn--danger">
              <Flag /> Flag for Review
            </button>
          </div>
        </form>
      </Modal>

      {/* Version History Inspection Modal */}
      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        width={700}
        title={`Version History · ${article.title}`}
        subtitle="Audit every verified revision, summary, and section snapshot."
        icon={
          <span className="wk-space-icon" style={{ '--sp-h': 174, '--sz': '40px' } as CSSProperties}>
            <History />
          </span>
        }
        footer={
          <button type="button" className="btn btn--sm" onClick={() => setHistoryOpen(false)}>
            Close history
          </button>
        }
      >
        <div className="stack">
          <div className="wk-ver-list">
            {sortedVersions.map((v) => (
              <VersionSelectorRow
                key={v.version}
                ver={v}
                isLatest={v.version === latestVersion}
                active={inspectedVersion?.version === v.version}
                onSelect={() => setSelectedVerNum(v.version)}
              />
            ))}
          </div>

          {inspectedVersion && (
            <div
              className="stack stack--sm"
              style={{
                padding: 16,
                borderRadius: 'var(--r-md)',
                background: 'var(--bg-2)',
                border: '1px solid var(--border-2)',
              }}
            >
              <div className="row row--between row--wrap" style={{ gap: 8 }}>
                <span className="badge">Snapshot · v{inspectedVersion.version}</span>
                <span className="text-xs muted">{formatDateTime(inspectedVersion.at)}</span>
              </div>
              <strong style={{ fontSize: 16 }}>{inspectedVersion.title}</strong>
              <p className="text-xs muted" style={{ margin: 0, lineHeight: 1.5 }}>
                <strong>TL;DR:</strong> {inspectedVersion.tldr}
              </p>
              <hr className="divider" style={{ margin: '6px 0' }} />
              {inspectedVersion.sections.map((s, i) => (
                <div key={s.id || i} className="stack stack--sm" style={{ gap: 3 }}>
                  <span className="text-xs" style={{ fontWeight: 650 }}>
                    0{i + 1}. {s.heading}
                  </span>
                  <p className="text-xs muted" style={{ margin: 0, lineHeight: 1.5 }}>
                    {s.body}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

function VersionSelectorRow({
  ver,
  isLatest,
  active,
  onSelect,
}: {
  ver: ArticleVersion;
  isLatest: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  const author = useUserById(ver.authorId);
  return (
    <button type="button" className={cx('wk-ver-item', active && 'is-active')} onClick={onSelect}>
      <div className="stack stack--sm" style={{ gap: 3, minWidth: 0 }}>
        <div className="row row--wrap" style={{ gap: 8 }}>
          <span className="tag">v{ver.version}</span>
          {isLatest && <span className="badge badge--success">Current Live</span>}
          <strong className="text-sm">{ver.summary}</strong>
        </div>
        <span className="text-xs muted">
          By {author?.name ?? ver.authorId} · {formatDateTime(ver.at)}
        </span>
      </div>
      <span className="text-xs mono muted">{ver.sections.length} sections</span>
    </button>
  );
}
