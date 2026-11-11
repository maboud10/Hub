import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  BookOpen,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  Flag,
  GitPullRequest,
  GraduationCap,
  HelpCircle,
  History,
  Link2,
  ListChecks,
  Lock,
  MessageSquare,
  MessageSquarePlus,
  MoreHorizontal,
  PenLine,
  Pin,
  Sparkles,
  StickyNote,
  ThumbsUp,
  Unlock,
} from 'lucide-react';
import { useAcademy } from '@/academy/store';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/primitives';
import { Bar, NeoEmpty, NeoMenu, NeoPanel, NeoTabs, type MenuEntry } from '@/components/neo';
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
import type { ArticleVersion, WikiComment } from '@/wiki/types';
import { FreshnessTracker, ProposalTracker, publishedVersionOf, useMyArticleProposals } from './wikiTrackers';
import {
  DocSection,
  FreshnessPill,
  sectionNumber,
  SpaceBoundaryCard,
  SpacePill,
  UserBadge,
  useCortex,
  WikiHeadActions,
} from './wikiUi';

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
    <div className={cx('wk-comment', comment.kind === 'question' && !comment.resolved && 'wk-comment--open')}>
      {author ? (
        <Avatar user={author} size={32} />
      ) : (
        <span className="avatar wk-comment__anon" style={{ '--size': '32px' } as CSSProperties}>
          HX
        </span>
      )}
      <div className="wk-comment__body">
        <div className="wk-comment__head">
          <strong className="wk-comment__name">{author?.name ?? 'Helix Teammate'}</strong>
          {comment.kind === 'question' ? (
            comment.resolved ? (
              <span className="neo-chip neo-chip--sm" data-tone="success">
                <CheckCircle2 /> Answered
              </span>
            ) : (
              <span className="neo-chip neo-chip--sm" data-tone="warning">
                <HelpCircle /> Open question
              </span>
            )
          ) : (
            <span className="neo-chip neo-chip--sm" data-tone="blue">
              <StickyNote /> Field note
            </span>
          )}
          <span className="wk-comment__time">{relativeTime(comment.at)}</span>

          {comment.kind === 'question' && canToggleResolve && (
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs wk-comment__resolve" onClick={() => onResolve(comment.id)}>
              <CheckCircle2 />
              {comment.resolved ? 'Reopen' : 'Mark resolved'}
            </button>
          )}
        </div>
        <p className="wk-comment__text">{comment.text}</p>
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
  const cortex = useCortex();
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

  /** Scroll-spy: section in view + reading progress through the stage scroller. */
  const readerRef = useRef<HTMLDivElement>(null);
  const [activeSec, setActiveSec] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

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

  // Track the active section and reading progress (`.neo-body` scrolls on desktop, the window on phones)
  const sectionKey = article && readable ? article.sections.map((s) => s.id).join('|') : '';
  useEffect(() => {
    const host = readerRef.current;
    if (!host || !sectionKey) return;
    const ids = sectionKey.split('|');
    const scroller = host.closest<HTMLElement>('.neo-body');
    const ownScroll = !!scroller && /(auto|scroll)/.test(getComputedStyle(scroller).overflowY);
    let raf = 0;
    const update = () => {
      raf = 0;
      const top = ownScroll && scroller ? scroller.getBoundingClientRect().top : 0;
      const height = ownScroll && scroller ? scroller.clientHeight : window.innerHeight;
      const line = top + height * 0.32;
      let current = ids[0] ?? null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      setActiveSec(current);
      const max = ownScroll && scroller ? scroller.scrollHeight - scroller.clientHeight : document.documentElement.scrollHeight - window.innerHeight;
      const pos = ownScroll && scroller ? scroller.scrollTop : window.scrollY;
      setProgress(max > 4 ? Math.min(100, Math.round((pos / max) * 100)) : 100);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    const target: HTMLElement | Window = ownScroll && scroller ? scroller : window;
    target.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      target.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [sectionKey]);

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

  /** Your own proposals on this page: live journeys + recent outcomes (the decision notification links here). */
  const myProposals = useMyArticleProposals(article?.id);

  if (!article) {
    return (
      <NeoPanel>
        <NeoEmpty
          icon={<BookOpen />}
          title="Playbook not found"
          action={
            <Link to="/wiki" className="neo-btn neo-btn--soft">
              <ArrowLeft /> Back to Knowledge Base
            </Link>
          }
        >
          We couldn’t find a playbook at <code className="neo-mono">/wiki/doc/{slug}</code>.
        </NeoEmpty>
      </NeoPanel>
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

  const questionCount = articleComments.filter((c) => c.kind === 'question').length;
  const openCount = articleComments.filter((c) => c.kind === 'question' && !c.resolved).length;
  const noteCount = articleComments.filter((c) => c.kind === 'note').length;

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

  const handleCopyPageLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/wiki/doc/${article.slug}`);
      toast.success('Copied link to this playbook');
    } catch {
      toast.info('Clipboard unavailable in this context');
    }
  };

  const handleToggleRead = () => {
    markRead(article.slug, !isRead);
    toast.info(isRead ? 'Marked as unread' : 'Marked playbook as read ✓');
  };

  const openHistory = () => {
    setSelectedVerNum(latestVersion);
    setHistoryOpen(true);
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

  const menuItems: MenuEntry[] = [
    { label: isRead ? 'Mark as unread' : 'Mark as read', icon: <CheckCircle2 />, onSelect: handleToggleRead },
    { label: 'Copy page link', icon: <Link2 />, onSelect: () => void handleCopyPageLink() },
    { label: 'Ask Nova Docs about this page', icon: <Sparkles />, onSelect: () => cortex.open(article.title) },
    { label: 'Version history', icon: <History />, hint: `v${latestVersion}`, onSelect: openHistory },
    ...(caps.canWrite ? [{ label: 'Flag as outdated', icon: <Flag />, onSelect: () => setFlagModalOpen(true) }] : []),
    ...(caps.canManage
      ? [
          { kind: 'sep' as const },
          { kind: 'label' as const, label: 'Curator tools' },
          { label: article.pinned ? 'Unpin highlight' : 'Pin as highlight', icon: <Pin />, onSelect: () => toast.result(togglePin(article.slug)) },
          {
            label: article.locked ? 'Unlock direct contributor edits' : 'Lock as canonical (four-eyes)',
            icon: article.locked ? <Unlock /> : <Lock />,
            onSelect: () => toast.result(toggleLock(article.slug)),
          },
        ]
      : []),
  ];

  return (
    <div className="wk-reader" ref={readerRef}>
      {/* Page actions live in the NEO header */}
      <WikiHeadActions>
        <NeoMenu
          label="Page actions"
          width={268}
          items={menuItems}
          trigger={(p) => (
            <button {...p} type="button" className="neo-btn neo-btn--ghost neo-btn--icon" aria-label="More page actions" data-tip="More actions">
              <MoreHorizontal />
            </button>
          )}
        />
        <button
          type="button"
          className={cx('neo-btn', isSaved ? 'neo-btn--soft' : 'neo-btn--ghost')}
          aria-pressed={isSaved}
          onClick={() => toast.result(toggleBookmark(article.slug))}
        >
          <Bookmark fill={isSaved ? 'currentColor' : 'none'} /> <span className="neo-btn__label">{isSaved ? 'Bookmarked' : 'Bookmark'}</span>
        </button>
        {directEdit ? (
          <Link to={`/wiki/edit/${article.slug}`} className="neo-btn neo-btn--plasma">
            <PenLine /> <span className="neo-btn__label">Edit page</span>
          </Link>
        ) : proposeEditAllowed ? (
          <Link to={`/wiki/edit/${article.slug}?propose=1`} className="neo-btn neo-btn--plasma">
            <GitPullRequest /> <span className="neo-btn__label">Propose change</span>
          </Link>
        ) : null}
      </WikiHeadActions>

      <div className="wk-reader__main">
        <article className="wk-doc" aria-label={article.title}>
          {/* Playbook meta & executive TL;DR */}
          <header className="wk-doc__intro">
            <div className="wk-doc__chips">
              {space && <SpacePill space={space} />}
              {article.locked ? (
                <span className="neo-chip" data-tone="amber">
                  <Lock /> Locked canonical policy
                </span>
              ) : (
                <span className="neo-chip" data-tone="cyan">
                  <BookOpen /> Open playbook
                </span>
              )}
              {article.pinned && (
                <span className="neo-chip" data-tone="app">
                  <Pin /> Featured highlight
                </span>
              )}
              {isRead && (
                <span className="neo-chip" data-tone="success">
                  <CheckCircle2 /> Read
                </span>
              )}
              <span className="wk-doc__meta">
                <span className="neo-mono">v{latestVersion}</span>
                <span>
                  <Clock aria-hidden="true" /> {article.readMins} min read
                </span>
                <span>
                  <Eye aria-hidden="true" /> {article.views} views
                </span>
              </span>
            </div>

            <div className="wk-tldr">
              <span className="neo-hud neo-hud--tint">
                <Sparkles aria-hidden="true" /> Executive TL;DR
              </span>
              <p>{article.tldr}</p>
            </div>

            {article.tags.length > 0 && (
              <div className="wk-doc__tags">
                {article.tags.map((t) => (
                  <span key={t} className="wk-tag">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </header>

          {/* Your change proposals on this page — live four-eyes journey or its recent outcome */}
          {myProposals.map((p) => {
            const version = publishedVersionOf(p, article);
            return (
              <ProposalTracker
                key={p.id}
                proposal={p}
                article={article}
                space={space}
                title={p.summary}
                actions={
                  p.status === 'pending' ? (
                    <Link to={`/wiki/governance?proposal=${p.id}`} className="neo-btn neo-btn--ghost neo-btn--sm">
                      Open in Governance <ArrowRight />
                    </Link>
                  ) : p.status === 'approved' && version ? (
                    <button
                      type="button"
                      className="neo-btn neo-btn--soft neo-btn--sm"
                      onClick={() => {
                        setSelectedVerNum(version);
                        setHistoryOpen(true);
                      }}
                    >
                      <History /> View version
                    </button>
                  ) : p.status === 'declined' && proposeEditAllowed ? (
                    <Link to={`/wiki/edit/${article.slug}?propose=1`} className="neo-btn neo-btn--soft neo-btn--sm">
                      <GitPullRequest /> Propose again
                    </Link>
                  ) : undefined
                }
              />
            );
          })}

          {/* Freshness Trust Banner */}
          <div className="wk-trust" data-state={freshness.state}>
            <UserBadge userId={article.ownerId} size={30} subtitle="Page owner" />
            <div className="wk-trust__info">
              <FreshnessPill info={freshness} />
              <span>
                Last verified <b>{formatDate(article.lastVerifiedAt)}</b>
                {verifierUser ? ` by ${verifierUser.name}` : ''} · {article.reviewCadenceDays}d review cycle
              </span>
            </div>
            <div className="wk-trust__acts">
              {verifyAllowed && (
                <button type="button" className="neo-btn neo-btn--success neo-btn--sm" onClick={() => toast.result(verifyFreshness(article.slug))}>
                  <CheckCircle2 /> Verify up to date
                </button>
              )}
              {caps.canWrite && (
                <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => setFlagModalOpen(true)}>
                  <Flag /> Flag outdated
                </button>
              )}
            </div>

            {/* Verification cycle: Verified → Review due (or Flagged) → Overdue */}
            <FreshnessTracker article={article} />

            {article.flaggedStale && (
              <div className="wk-flag">
                <AlertTriangle aria-hidden="true" />
                <div className="grow" style={{ minWidth: 0 }}>
                  <strong>Flagged for freshness review</strong>
                  {flaggerUser ? ` by ${flaggerUser.name}` : ''} ({relativeTime(article.flaggedStale.at)}): “{article.flaggedStale.reason}”
                </div>
              </div>
            )}
          </div>

          {totalCheckCount > 0 && (
            <div className="wk-runbook">
              <span className="wk-runbook__icon" aria-hidden="true">
                <ListChecks />
              </span>
              <div className="wk-runbook__text">
                <b>Interactive runbook checklist</b>
                <span>Progress is saved to your personal NEXUS profile as you execute each step.</span>
              </div>
              <div className="wk-runbook__meter">
                <Bar value={doneCheckCount / totalCheckCount} label="Runbook progress" />
                <span className="neo-mono">
                  {doneCheckCount}/{totalCheckCount}
                </span>
              </div>
              {doneCheckCount > 0 && (
                <button
                  type="button"
                  className="neo-btn neo-btn--ghost neo-btn--xs"
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
          )}

          {/* Structured sections — long-form measure */}
          <div className="wk-doc__sections">
            {article.sections.map((sec, idx) => (
              <DocSection
                key={sec.id}
                section={sec}
                index={idx}
                checkedIds={checkedIds}
                onToggleCheck={(itemId) => toggleRunbookCheck(article.id, itemId)}
                onCopyAnchor={(secId) => void handleCopySectionAnchor(secId)}
                onCopySnippet={(secId, snippet) => void handleCopySnippet(secId, snippet)}
                copied={copiedId === sec.id}
              />
            ))}
          </div>

          {/* Helpful Vote Bar */}
          <footer className="wk-endcap">
            <div className="wk-endcap__text">
              <span className="neo-hud">End of playbook</span>
              <b>Was this playbook helpful and accurate?</b>
              <span>
                {article.helpfulUserIds.length} {article.helpfulUserIds.length === 1 ? 'teammate' : 'teammates'} endorsed this guide · need a
                synthesized cross-playbook answer?
              </span>
            </div>
            <div className="wk-endcap__acts">
              <button type="button" className={cx('neo-btn neo-btn--sm', isRead ? 'neo-btn--success' : 'neo-btn--soft')} onClick={handleToggleRead}>
                <CheckCircle2 />
                {isRead ? 'Read ✓' : 'Mark as read'}
              </button>
              <button
                type="button"
                className={cx('neo-btn neo-btn--sm', isHelpful ? 'neo-btn--success' : 'neo-btn--ghost')}
                aria-pressed={isHelpful}
                onClick={() => toast.result(toggleHelpful(article.slug))}
              >
                <ThumbsUp fill={isHelpful ? 'currentColor' : 'none'} />
                {isHelpful ? 'Helpful ✓' : 'Yes, helpful'} ({article.helpfulUserIds.length})
              </button>
              <button type="button" className="neo-btn neo-btn--nova neo-btn--sm" onClick={() => cortex.open(article.title)}>
                <Sparkles /> Ask Nova Docs
              </button>
            </div>
          </footer>
        </article>

        {/* Page Q&A & Field Notes Thread */}
        <NeoPanel
          id="wiki-qa"
          className="wk-qa"
          hud="Discussion"
          title="Page Q&A & field notes"
          icon={<MessageSquarePlus />}
          actions={<span className="neo-count">{articleComments.length}</span>}
        >
          {caps.canWrite ? (
            <form onSubmit={handleCommentSubmit} className="wk-qa__compose">
              <div className="wk-qa__compose-top">
                <NeoTabs<'question' | 'note'>
                  label="Post type"
                  value={commentKind}
                  onChange={setCommentKind}
                  items={[
                    { value: 'question', label: 'Ask a question', icon: <HelpCircle /> },
                    { value: 'note', label: 'Share a field note', icon: <StickyNote /> },
                  ]}
                />
                <span className="wk-qa__hint">
                  {commentKind === 'question'
                    ? 'Notifies the page owner & appears in Governance until resolved.'
                    : 'Adds a helpful tip for future readers.'}
                </span>
              </div>
              <div className="wk-qa__compose-row">
                <input
                  type="text"
                  className="neo-input"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  aria-label={commentKind === 'question' ? 'Your question' : 'Your field note'}
                  placeholder={
                    commentKind === 'question'
                      ? 'Ask a clarifying question about an edge case or command…'
                      : 'Share a practical tip or time-saver…'
                  }
                />
                <button type="submit" className="neo-btn neo-btn--plasma">
                  Post
                </button>
              </div>
            </form>
          ) : (
            <div className="wk-readonly-note">
              <Lock aria-hidden="true" /> Read-only contractor access — posting Q&amp;A comments requires contributor (`wiki.write`) clearance.
            </div>
          )}

          <NeoTabs<CommentFilter>
            label="Filter Q&A and notes"
            value={commentFilter}
            onChange={setCommentFilter}
            variant="underline"
            className="wk-qa__filters"
            items={[
              { value: 'all', label: 'All', count: articleComments.length },
              { value: 'question', label: 'Questions', count: questionCount },
              { value: 'open', label: 'Open', count: openCount },
              { value: 'note', label: 'Notes', count: noteCount },
            ]}
          />

          {filteredComments.length > 0 ? (
            <div className="wk-comments">
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
            <p className="wk-qa__empty">No entries in this filter yet.</p>
          )}
        </NeoPanel>
      </div>

      {/* Sticky Right Rail */}
      <aside className="wk-reader__rail" aria-label="Playbook navigation and companion tools">
        {/* Table of Contents */}
        <nav className="wk-toc" aria-label="Table of contents">
          <div className="wk-toc__head">
            <span className="neo-hud">On this page</span>
            <span className="wk-toc__pct neo-mono">{progress}% read</span>
          </div>
          <Bar value={progress / 100} label="Reading progress" />
          <ol className="wk-toc__list">
            {article.sections.map((sec, idx) => (
              <li key={sec.id}>
                <a
                  href={`#${sec.id}`}
                  className={cx('wk-toc__link', activeSec === sec.id && 'is-active')}
                  aria-current={activeSec === sec.id ? 'location' : undefined}
                >
                  <span className="wk-toc__num">{sectionNumber(idx)}</span>
                  <span className="wk-toc__label">{sec.heading}</span>
                  {sec.checklist && sec.checklist.length > 0 && <ListChecks aria-label="Has a runbook checklist" />}
                </a>
              </li>
            ))}
            <li>
              <a href="#wiki-qa" className="wk-toc__link">
                <span className="wk-toc__num">
                  <MessageSquare aria-hidden="true" />
                </span>
                <span className="wk-toc__label">Q&amp;A &amp; field notes ({articleComments.length})</span>
              </a>
            </li>
          </ol>
        </nav>

        <div className="wk-tools">
          {/* Companion Helix Academy Courses */}
          {companionCourses.length > 0 && (
            <NeoPanel hud="Hands-on in Academy" title="Practice this playbook" icon={<GraduationCap />}>
              <div className="wk-courses">
                {companionCourses.map((course) =>
                  hasAcademy ? (
                    <Link key={course.id} to={`/academy/course/${course.id}`} className="wk-course">
                      <span className="wk-course__top">
                        <span className="wk-tag">{course.track}</span>
                        <span className="wk-course__xp">+{course.xp} XP</span>
                      </span>
                      <span className="wk-course__title">{course.title}</span>
                      <span className="wk-course__meta">
                        <span>
                          {course.durationMins} mins · {course.format}
                        </span>
                        <ArrowUpRight aria-hidden="true" />
                      </span>
                    </Link>
                  ) : (
                    <div key={course.id} className="wk-course is-locked">
                      <span className="wk-course__top">
                        <span className="wk-tag">{course.track}</span>
                        <Lock aria-hidden="true" />
                      </span>
                      <span className="wk-course__title">{course.title}</span>
                      <span className="wk-course__meta">Requires Academy (`app:learning`) access</span>
                    </div>
                  ),
                )}
              </div>
            </NeoPanel>
          )}

          {/* Connected Workflow Deep Link (HR Portal / Talent Hub) */}
          {article.relatedRoute && (
            <NeoPanel hud="Connected workflow" title="Do it in NEXUS" icon={<ExternalLink />}>
              <p className="wk-about__desc">Jump directly into the live operational module referenced by this playbook.</p>
              <Link to={article.relatedRoute.to} className="neo-btn neo-btn--soft neo-btn--sm neo-btn--block">
                <span>{article.relatedRoute.label}</span>
                <ArrowUpRight />
              </Link>
            </NeoPanel>
          )}

          {/* Governance, Proposals & Version History */}
          <NeoPanel hud="Lineage" title="Versions & governance" icon={<History />}>
            <dl className="neo-kv wk-lineage">
              <dt>Published</dt>
              <dd className="neo-mono">v{latestVersion}</dd>
              <dt>Last updated</dt>
              <dd>{formatDate(article.updatedAt)}</dd>
              <dt>Review cycle</dt>
              <dd>{article.reviewCadenceDays} days</dd>
            </dl>
            {pendingProposalsForArticle.length > 0 && (
              <Link to="/wiki/governance" className="wk-pending">
                <GitPullRequest aria-hidden="true" /> {pendingProposalsForArticle.length} pending proposal
                {pendingProposalsForArticle.length > 1 ? 's' : ''}
                <ArrowRight aria-hidden="true" />
              </Link>
            )}
            {pendingProposalsForArticle.length > 0 && (
              <div className="wk-rail-props">
                {pendingProposalsForArticle.map((p) => (
                  <Link key={p.id} to={`/wiki/governance?proposal=${p.id}`} className="wk-rail-prop">
                    <span className="wk-rail-prop__sum">{p.summary}</span>
                    <ProposalTracker proposal={p} article={article} space={space} variant="compact" />
                  </Link>
                ))}
              </div>
            )}
            <div className="wk-lineage__acts">
              <button type="button" className="neo-btn neo-btn--soft neo-btn--sm neo-btn--block" onClick={openHistory}>
                <History /> Version history ({article.versions.length})
              </button>
              {proposeEditAllowed && article.locked && directEdit && (
                <Link to={`/wiki/edit/${article.slug}?propose=1`} className="neo-btn neo-btn--ghost neo-btn--sm neo-btn--block">
                  <GitPullRequest /> Submit four-eyes proposal
                </Link>
              )}
            </div>
          </NeoPanel>
        </div>
      </aside>

      {/* Flag Outdated Modal */}
      <Modal
        open={flagModalOpen}
        onClose={() => setFlagModalOpen(false)}
        className="wk-portal neo-portal"
        title="Flag playbook for freshness review"
        subtitle={`Notify the owner of “${article.title}” so outdated commands or policy details get updated fast.`}
        icon={
          <span className="wk-modal-icon" data-tone="warning">
            <Flag />
          </span>
        }
      >
        <form onSubmit={handleFlagSubmit} className="wk-form">
          <label className="neo-field">
            <span className="neo-label">What looks outdated or changed?</span>
            <textarea
              className="neo-textarea"
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              placeholder="e.g., CLI flag changed in mesh v4.8, or policy allowance increased for 2026…"
              required
              autoFocus
            />
          </label>
          <div className="wk-form__acts">
            <button type="button" className="neo-btn neo-btn--ghost" onClick={() => setFlagModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="neo-btn neo-btn--danger">
              <Flag /> Flag for review
            </button>
          </div>
        </form>
      </Modal>

      {/* Version History Inspection Modal */}
      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        width={720}
        className="wk-portal neo-portal"
        title={`Version history · ${article.title}`}
        subtitle="Audit every verified revision, summary, and section snapshot."
        icon={
          <span className="wk-modal-icon" data-tone="app">
            <History />
          </span>
        }
        footer={
          <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => setHistoryOpen(false)}>
            Close history
          </button>
        }
      >
        <div className="wk-form">
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
            <div className="wk-snapshot">
              <div className="wk-snapshot__head">
                <span className="neo-chip neo-chip--sm" data-tone="app">
                  Snapshot · v{inspectedVersion.version}
                </span>
                <span className="wk-snapshot__when">{formatDateTime(inspectedVersion.at)}</span>
              </div>
              <strong className="wk-snapshot__title">{inspectedVersion.title}</strong>
              <p className="wk-snapshot__tldr">
                <strong>TL;DR:</strong> {inspectedVersion.tldr}
              </p>
              <hr className="neo-divider" />
              {inspectedVersion.sections.map((s, i) => (
                <div key={s.id || i} className="wk-snapshot__sec">
                  <span>
                    {sectionNumber(i)}. {s.heading}
                  </span>
                  <p>{s.body}</p>
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
    <button type="button" className={cx('wk-ver-item', active && 'is-active')} onClick={onSelect} aria-pressed={active}>
      <span className="wk-ver-item__text">
        <span className="wk-ver-item__top">
          <span className="wk-tag">v{ver.version}</span>
          {isLatest && (
            <span className="neo-chip neo-chip--sm" data-tone="success">
              Current live
            </span>
          )}
          <strong>{ver.summary}</strong>
        </span>
        <span className="wk-ver-item__meta">
          By {author?.name ?? ver.authorId} · {formatDateTime(ver.at)}
        </span>
      </span>
      <span className="wk-ver-item__count neo-mono">{ver.sections.length} sections</span>
    </button>
  );
}
