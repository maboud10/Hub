/**
 * Knowledge deck home — Support-Deck anatomy: attention banners, HUD ribbon,
 * Nova Docs prompt, spaces grid and the library (main) + reading packs,
 * bookmarks, governance queue and "how answers are grounded" (side).
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Bookmark,
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  Compass,
  GitPullRequest,
  HelpCircle,
  History,
  Layers,
  Lock,
  Pin,
  Quote,
  Rocket,
  ShieldCheck,
} from 'lucide-react';
import { NeoBanner, NeoBanners, NeoEmpty, NeoHome, NeoKpi, NeoKpis, NeoNovaPrompt, NeoPanel, NeoTabs, Ring } from '@/components/neo';
import { useSessionUser, useUserById } from '@/store/selectors';
import { firstName, pluralize, relativeTime } from '@/lib/format';
import { SUGGESTED_CORTEX_PROMPTS } from '@/wiki/constants';
import {
  useGovernanceQueue,
  useMyWikiState,
  useSpaceViews,
  useVisibleArticles,
  useVisibleCollections,
  useWikiCaps,
} from '@/wiki/selectors';
import { useWiki } from '@/wiki/store';
import type { WikiArticle } from '@/wiki/types';
import { FreshnessTracker, ProposalTracker } from './wikiTrackers';
import { FreshDot, FreshnessPill, RoleAudienceChips, SpaceIcon, UserBadge, useCortex } from './wikiUi';

const DAY = 86_400_000;
type LibraryTab = 'updated' | 'pinned' | 'recent';

export function WikiHome() {
  const me = useSessionUser();
  const cortex = useCortex();
  const caps = useWikiCaps();
  const spaceViews = useSpaceViews();
  const visibleArticles = useVisibleArticles();
  const collections = useVisibleCollections();
  const myState = useMyWikiState();
  const gov = useGovernanceQueue();

  const onboardingPack = useMemo(
    () => collections.find((c) => c.collection.slug === 'col-new-hire' || c.collection.onboardingPack),
    [collections],
  );

  const hasUnreadOnboarding = !!onboardingPack && onboardingPack.readCount < onboardingPack.totalCount;

  const nextUnreadOnboardingArticle = useMemo(() => {
    if (!onboardingPack) return null;
    const readSet = new Set(myState.readSlugs);
    return onboardingPack.articles.find((a) => !readSet.has(a.slug)) ?? null;
  }, [onboardingPack, myState.readSlugs]);

  const isNewJoiner = useMemo(() => {
    const start = me?.startDate ? Date.parse(me.startDate) : Number.NaN;
    return Number.isFinite(start) && Date.now() - start <= 90 * DAY;
  }, [me?.startDate]);

  const bookmarked = useMemo(() => {
    const bySlug = new Map(visibleArticles.map((a) => [a.slug, a]));
    return myState.bookmarks.map((slug) => bySlug.get(slug)).filter((a): a is WikiArticle => !!a);
  }, [myState.bookmarks, visibleArticles]);

  const readCount = useMemo(() => {
    const readSet = new Set(myState.readSlugs);
    return visibleArticles.filter((a) => readSet.has(a.slug)).length;
  }, [myState.readSlugs, visibleArticles]);

  const readableCount = spaceViews.filter((s) => s.readable).length;
  const flaggedCount = gov.attentionArticles.filter((x) => x.freshness.flagged).length;
  const myAttention = me ? gov.attentionArticles.filter((x) => x.article.ownerId === me.id) : [];

  const banners: ReactNode[] = [];
  if (isNewJoiner && hasUnreadOnboarding && onboardingPack) {
    banners.push(
      <NeoBanner
        key="onboarding"
        tone="cyan"
        icon={<Rocket />}
        title={`Welcome aboard — ${onboardingPack.collection.title}`}
        meta={`${onboardingPack.readCount}/${onboardingPack.totalCount} read · ~${onboardingPack.totalMins}m`}
        to={`/wiki/collections/${onboardingPack.collection.slug}`}
      >
        {nextUnreadOnboardingArticle ? `Up next: ${nextUnreadOnboardingArticle.title}` : onboardingPack.collection.tagline}
      </NeoBanner>,
    );
  }
  if (caps.canManage && gov.pendingProposals.length > 0) {
    banners.push(
      <NeoBanner
        key="proposals"
        tone="warning"
        icon={<GitPullRequest />}
        title={`${pluralize(gov.pendingProposals.length, 'change proposal')} awaiting four-eyes review`}
        meta="Governance"
        to="/wiki/governance"
      >
        Locked canonical pages only change after a second curator approves.
      </NeoBanner>,
    );
  }
  if (myAttention.length > 0) {
    banners.push(
      <NeoBanner
        key="mine"
        tone="danger"
        icon={<AlertTriangle />}
        title={`${myAttention.length === 1 ? 'One of your pages needs' : `${myAttention.length} of your pages need`} a freshness check`}
        meta={myAttention[0].freshness.label}
        to="/wiki/governance"
      >
        Verify or update them so Nova Docs keeps citing trusted guidance.
      </NeoBanner>,
    );
  }

  return (
    <>
      {banners.length > 0 && <NeoBanners>{banners.slice(0, 2)}</NeoBanners>}

      <NeoKpis label="Knowledge Base at a glance">
        <NeoKpi
          icon={<ShieldCheck />}
          label="Verified fresh"
          value={`${gov.verifiedPct}%`}
          sub={`${gov.totalVisible - gov.attentionArticles.length} of ${gov.totalVisible} pages in cycle`}
          tone={gov.verifiedPct < 80 ? 'warning' : undefined}
          to="/wiki/governance"
          title="Open governance & freshness"
        />
        <NeoKpi
          icon={<Compass />}
          label="Spaces cleared"
          value={
            <>
              {readableCount}
              <small>/ {spaceViews.length}</small>
            </>
          }
          sub={readableCount < spaceViews.length ? `${spaceViews.length - readableCount} role-restricted` : 'Full clearance'}
        />
        <NeoKpi icon={<BookOpenCheck />} label="Pages read" value={readCount} sub={`of ${visibleArticles.length} you can open`} />
        <NeoKpi
          icon={<Bookmark />}
          label="Bookmarks"
          value={bookmarked.length}
          sub={bookmarked.length ? 'On your shelf' : 'Save pages for later'}
          to="/wiki/bookmarks"
        />
        <NeoKpi
          icon={<AlertTriangle />}
          label="Needs review"
          value={gov.attentionArticles.length}
          sub={`${flaggedCount} flagged · ${gov.attentionArticles.length - flaggedCount} due or overdue`}
          tone={gov.attentionArticles.length ? 'warning' : undefined}
          to="/wiki/governance"
        />
      </NeoKpis>

      <NeoHome
        sideLabel="Your knowledge overview"
        main={
          <>
            <NeoNovaPrompt
              hud="Nova docs"
              title="Ask the company brain"
              badge="Cited · permission-scoped"
              placeholder="e.g. How do I set up passkeys and zero-trust access on Day 1?"
              suggestions={SUGGESTED_CORTEX_PROMPTS.slice(0, 5)}
              onSubmit={(text) => cortex.open(text)}
              submitLabel="Ask Nova"
              clearOnSubmit
              label="Ask Nova Docs"
            >
              <div className="wk-nova-foot">
                <span>
                  <Lock aria-hidden="true" /> Answers only from the {pluralize(readableCount, 'space')} you’re cleared for
                </span>
                <span>
                  <Quote aria-hidden="true" /> Every claim cites its source section
                </span>
              </div>
            </NeoNovaPrompt>
            <SpacesPanel />
            <LibraryPanel />
          </>
        }
        side={
          <>
            <PacksPanel />
            <BookmarksPanel bookmarked={bookmarked} />
            {caps.canManage && <GovernancePanel />}
            <GroundedPanel />
          </>
        }
      />
    </>
  );
}

/* ---------- Main column ---------- */

function SpacesPanel() {
  const spaceViews = useSpaceViews();
  const readable = spaceViews.filter((s) => s.readable).length;

  return (
    <NeoPanel
      hud="Knowledge spaces"
      title="Browse by space"
      actions={
        <span className="neo-chip" data-tone="app">
          {readable}/{spaceViews.length} cleared
        </span>
      }
    >
      {/* Knowledge Spaces Grid (all 6 spaces: readable + locked clearance boundary) */}
      <div className="wk-spaces neo-stagger">
        {spaceViews.map(({ space, readable: canRead, articleCount, verifiedCount, attentionCount }, i) => {
          const style = { '--sp-h': space.hue, '--i': i } as CSSProperties;
          if (canRead) {
            const healthPct = articleCount ? Math.round((verifiedCount / articleCount) * 100) : 100;
            return (
              <Link key={space.id} to={`/wiki/space/${space.id}`} className="wk-space" style={style}>
                <span className="wk-space__top">
                  <SpaceIcon space={space} size={38} />
                  {attentionCount > 0 ? (
                    <span className="neo-chip neo-chip--sm" data-tone="warning">
                      <AlertTriangle /> {attentionCount} to review
                    </span>
                  ) : (
                    <span className="neo-chip neo-chip--sm" data-tone="success">
                      <CheckCircle2 /> {healthPct}% verified
                    </span>
                  )}
                </span>
                <span className="wk-space__name">{space.name}</span>
                <span className="wk-space__tag">{space.description}</span>
                <span className="wk-space__foot">
                  <UserBadge userId={space.stewardId} size={20} subtitle="Steward" />
                  <span className="wk-space__count">
                    {pluralize(articleCount, 'playbook')} <ArrowRight aria-hidden="true" />
                  </span>
                </span>
              </Link>
            );
          }
          return (
            <div key={space.id} className="wk-space wk-space--locked" style={style} aria-label={`${space.name} — restricted space`}>
              <span className="wk-space__top">
                <SpaceIcon space={space} size={38} />
                <span className="neo-chip neo-chip--sm" data-tone="amber">
                  <Lock /> Restricted
                </span>
              </span>
              <span className="wk-space__name">{space.name}</span>
              <span className="wk-space__tag">{space.tagline}</span>
              <span className="wk-space__foot wk-space__foot--roles">
                <span className="neo-hud">Visible to</span>
                <RoleAudienceChips roleIds={space.audienceRoleIds} />
              </span>
            </div>
          );
        })}
      </div>
    </NeoPanel>
  );
}

function LibraryPanel() {
  const visibleArticles = useVisibleArticles();
  const myState = useMyWikiState();
  const [tab, setTab] = useState<LibraryTab>('updated');

  const updated = useMemo(() => [...visibleArticles].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6), [visibleArticles]);
  const pinned = useMemo(() => visibleArticles.filter((a) => a.pinned), [visibleArticles]);
  const recent = useMemo(() => {
    const bySlug = new Map(visibleArticles.map((a) => [a.slug, a]));
    return myState.recentSlugs
      .map((slug) => bySlug.get(slug))
      .filter((a): a is WikiArticle => !!a)
      .slice(0, 6);
  }, [myState.recentSlugs, visibleArticles]);

  const list = tab === 'updated' ? updated : tab === 'pinned' ? pinned : recent;
  const title = tab === 'updated' ? 'Recently updated' : tab === 'pinned' ? 'Pinned canonical highlights' : 'Continue reading';

  return (
    <NeoPanel
      hud="Library"
      title={title}
      className="wk-library"
      actions={
        <Link to="/wiki/governance" className="neo-btn neo-btn--ghost neo-btn--xs">
          Freshness <ArrowRight />
        </Link>
      }
    >
      <NeoTabs<LibraryTab>
        label="Library view"
        value={tab}
        onChange={setTab}
        className="wk-library__tabs"
        items={[
          { value: 'updated', label: 'Updated', icon: <History /> },
          { value: 'pinned', label: 'Pinned', icon: <Pin />, count: pinned.length },
          { value: 'recent', label: 'Your recent', icon: <BookOpenCheck />, count: recent.length || null },
        ]}
      />
      {list.length > 0 ? (
        <div className="neo-list">
          {list.map((article) => (
            <LibraryRow key={article.id} article={article} mode={tab} />
          ))}
        </div>
      ) : (
        <NeoEmpty compact icon={tab === 'pinned' ? <Pin /> : <History />} title={tab === 'pinned' ? 'No pinned highlights in your spaces' : 'Nothing read yet'}>
          {tab === 'pinned'
            ? 'Curators pin canonical pages here — explore any cleared space meanwhile.'
            : 'Pages you open appear here so you can pick up where you left off.'}
        </NeoEmpty>
      )}
    </NeoPanel>
  );
}

function LibraryRow({ article, mode }: { article: WikiArticle; mode: LibraryTab }) {
  const spaces = useWiki((s) => s.spaces);
  const myState = useMyWikiState();
  const lastVersion = article.versions[article.versions.length - 1];
  const editor = useUserById(lastVersion?.authorId ?? article.ownerId);
  const space = spaces.find((s) => s.id === article.spaceId);
  const isRead = myState.readSlugs.includes(article.slug);
  const totalChecks = article.sections.reduce((n, s) => n + (s.checklist?.length ?? 0), 0);
  const doneChecks = (myState.runbookChecks[article.id] ?? []).length;

  let meta = `${article.readMins} min read`;
  if (mode === 'updated') {
    meta = `Updated ${relativeTime(article.updatedAt)}${editor ? ` by ${firstName(editor.name)}` : ''} · v${lastVersion?.version ?? 1}`;
  } else if (mode === 'recent' && totalChecks > 0) {
    meta = `Runbook checklist ${doneChecks}/${totalChecks} steps ticked`;
  }

  return (
    <Link to={`/wiki/doc/${article.slug}`} className="neo-li wk-lrow">
      {space && <SpaceIcon space={space} size={34} />}
      <span className="wk-lrow__text">
        <span className="wk-lrow__title">{article.title}</span>
        <span className="wk-lrow__meta">
          {space ? `${space.name} · ` : ''}
          {meta}
        </span>
      </span>
      <span className="wk-lrow__end">
        {isRead && (
          <span className="neo-chip neo-chip--sm" data-tone="success">
            <CheckCircle2 /> Read
          </span>
        )}
        <FreshnessPill article={article} compact />
      </span>
    </Link>
  );
}

/* ---------- Side column ---------- */

function PacksPanel() {
  const collections = useVisibleCollections();
  return (
    <NeoPanel
      hud="Learning paths"
      title="Reading packs"
      actions={
        <Link to="/wiki/collections" className="neo-btn neo-btn--ghost neo-btn--xs">
          All <ArrowRight />
        </Link>
      }
    >
      {collections.length > 0 ? (
        <div className="neo-list">
          {collections.slice(0, 4).map(({ collection, readCount, totalCount, pct, totalMins }) => (
            <Link
              key={collection.id}
              to={`/wiki/collections/${collection.slug}`}
              className="neo-li wk-packrow"
              style={{ '--pk-h': collection.hue } as CSSProperties}
            >
              <Ring value={totalCount ? readCount / totalCount : 0} size={40} stroke={4} label={`${pct}% read`}>
                {pct}
              </Ring>
              <span className="wk-packrow__text">
                <span className="wk-packrow__title">{collection.title}</span>
                <span className="wk-packrow__meta">
                  {readCount}/{totalCount} read · ~{totalMins}m{collection.onboardingPack ? ' · Week 1' : ''}
                </span>
              </span>
              <ChevronRight className="wk-chev" aria-hidden="true" />
            </Link>
          ))}
        </div>
      ) : (
        <NeoEmpty compact icon={<Layers />} title="No reading packs yet">
          Curated sequences appear here once a curator publishes them.
        </NeoEmpty>
      )}
    </NeoPanel>
  );
}

function BookmarksPanel({ bookmarked }: { bookmarked: WikiArticle[] }) {
  const spaces = useWiki((s) => s.spaces);
  return (
    <NeoPanel
      hud="Your shelf"
      title="Bookmarks"
      actions={
        <Link to="/wiki/bookmarks" className="neo-btn neo-btn--ghost neo-btn--xs">
          All <ArrowRight />
        </Link>
      }
    >
      {bookmarked.length > 0 ? (
        <div className="neo-list">
          {bookmarked.slice(0, 4).map((article) => {
            const sp = spaces.find((s) => s.id === article.spaceId);
            return (
              <Link key={article.id} to={`/wiki/doc/${article.slug}`} className="neo-li wk-mini">
                <FreshDot article={article} />
                <span className="wk-mini__text">
                  <span className="wk-mini__title">{article.title}</span>
                  <span className="wk-mini__meta">
                    {sp?.name ?? 'Knowledge Base'} · {article.readMins} min
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="wk-allclear">
          <Bookmark aria-hidden="true" />
          <div>
            <b>Nothing saved yet</b>
            <span>Tap the bookmark on any playbook to keep it one click away.</span>
          </div>
        </div>
      )}
    </NeoPanel>
  );
}

function GovernancePanel() {
  const gov = useGovernanceQueue();
  const visibleArticles = useVisibleArticles();
  const spaces = useWiki((s) => s.spaces);
  const byId = useMemo(() => new Map(visibleArticles.map((a) => [a.id, a])), [visibleArticles]);
  const queue = [
    ...gov.pendingProposals.slice(0, 2).map((p) => {
      const article = byId.get(p.articleId);
      return {
        key: p.id,
        to: `/wiki/governance?proposal=${p.id}`,
        icon: <GitPullRequest className="wk-mini__icon" data-tone="warning" aria-hidden="true" />,
        title: article?.title ?? p.proposedTitle,
        meta: `Change proposal · ${relativeTime(p.createdAt)}`,
        track: (
          <ProposalTracker
            proposal={p}
            article={article}
            space={spaces.find((s) => s.id === article?.spaceId)}
            variant="compact"
            className="wk-mini__track"
          />
        ),
      };
    }),
    ...gov.attentionArticles.slice(0, 2).map(({ article, freshness }) => ({
      key: article.id,
      to: `/wiki/doc/${article.slug}`,
      icon: <FreshDot article={article} />,
      title: article.title,
      meta: freshness.label,
      track: <FreshnessTracker article={article} variant="compact" className="wk-mini__track" />,
    })),
  ].slice(0, 3);

  return (
    <NeoPanel
      hud="Needs you"
      title="Governance queue"
      actions={
        <Link to="/wiki/governance" className="neo-btn neo-btn--ghost neo-btn--xs">
          Open <ArrowRight />
        </Link>
      }
    >
      <div className="wk-govstats">
        <Link to="/wiki/governance" className="wk-govstat" data-tone="warning">
          <GitPullRequest aria-hidden="true" />
          <b>{gov.pendingProposals.length}</b>
          <span>Proposals</span>
        </Link>
        <Link to="/wiki/governance" className="wk-govstat" data-tone="danger">
          <AlertTriangle aria-hidden="true" />
          <b>{gov.attentionArticles.length}</b>
          <span>Freshness</span>
        </Link>
        <Link to="/wiki/governance" className="wk-govstat" data-tone="cyan">
          <HelpCircle aria-hidden="true" />
          <b>{gov.openQuestions.length}</b>
          <span>Questions</span>
        </Link>
      </div>
      {queue.length > 0 ? (
        <div className="neo-list">
          {queue.map((q) => (
            <Link key={q.key} to={q.to} className="neo-li wk-mini">
              {q.icon}
              <span className="wk-mini__text">
                <span className="wk-mini__title">{q.title}</span>
                <span className="wk-mini__meta">{q.meta}</span>
                {q.track}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="wk-allclear">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <b>Queue is clear</b>
            <span>No proposals, stale pages or open questions in your spaces.</span>
          </div>
        </div>
      )}
    </NeoPanel>
  );
}

function GroundedPanel() {
  return (
    <NeoPanel hud="Grounded by design" title="How Nova Docs answers">
      <ul className="wk-how">
        <li>
          <span className="wk-how__icon">
            <Lock />
          </span>
          <div>
            <b>Permission-first</b>
            <p>Only spaces cleared for your role are searched — restricted pages never reach an answer.</p>
          </div>
        </li>
        <li>
          <span className="wk-how__icon">
            <Quote />
          </span>
          <div>
            <b>Line-level citations</b>
            <p>Every claim links back to the exact playbook section it came from.</p>
          </div>
        </li>
        <li>
          <span className="wk-how__icon">
            <BadgeCheck />
          </span>
          <div>
            <b>Freshness-aware</b>
            <p>Owners re-verify pages on a review cadence; stale sources are flagged inline.</p>
          </div>
        </li>
      </ul>
      <div className="wk-kbdhint">
        <kbd className="kbd">↵</kbd> in search opens the top hit · <kbd className="kbd">⌘K</kbd> searches all of NEXUS
      </div>
    </NeoPanel>
  );
}
