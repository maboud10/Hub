import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { Eye, Megaphone, Newspaper, Pin, RotateCcw, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react';
import type { Announcement, AnnouncementCategory } from '@/types';
import { useHub } from '@/store/hub';
import { useCan, useRoles, useSessionUser, useVisibleAnnouncements } from '@/store/selectors';
import { toast } from '@/store/toast';
import { Can } from '@/components/auth/Can';
import { Modal } from '@/components/ui/Modal';
import { RoleChip } from '@/components/ui/primitives';
import { NeoEmpty, NeoHome, NeoPage, NeoPanel } from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { Composer } from './news/Composer';
import { PostCard } from './news/PostCard';
import { CATEGORY_ICON, NEWS_CATEGORIES } from './news/newsMeta';

type CategoryFilter = AnnouncementCategory | 'all';

export function NewsPage() {
  const posts = useVisibleAnnouncements();
  const users = useHub((s) => s.users);
  const roles = useRoles();
  const me = useSessionUser();
  const canPublish = useCan('hub.news.publish');
  const now = useNow(60_000);
  const [params, setParams] = useSearchParams();
  const location = useLocation();

  const [cat, setCat] = useState<CategoryFilter>('all');
  const [composerOpen, setComposerOpen] = useState(() => params.get('compose') === '1');
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // `?compose=1` (command palette → "Publish an announcement") opens the composer once, then is consumed.
  const composeParam = params.get('compose') === '1';
  const consumedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!composeParam || consumedKey.current === location.key) return;
    consumedKey.current = location.key;
    if (canPublish) setComposerOpen(true);
    else toast.warning('Publishing is restricted', 'Your roles don’t include “Publish announcements”.');
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('compose');
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }, [composeParam, canPublish, setParams, location.key]);

  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const rolesById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);

  const counts = useMemo(() => {
    const byCat = new Map<AnnouncementCategory, number>();
    let pinned = 0;
    let critical = 0;
    let targeted = 0;
    let myReactions = 0;
    for (const p of posts) {
      byCat.set(p.category, (byCat.get(p.category) ?? 0) + 1);
      if (p.pinned) pinned += 1;
      if (p.priority === 'critical') critical += 1;
      if (p.audienceRoleIds.length) targeted += 1;
      if (me && Object.values(p.reactions).some((list) => list.includes(me.id))) myReactions += 1;
    }
    return { byCat, pinned, critical, targeted, myReactions };
  }, [posts, me]);

  const filtered = useMemo(() => (cat === 'all' ? posts : posts.filter((p) => p.category === cat)), [posts, cat]);
  const pinnedPosts = useMemo(() => posts.filter((p) => p.pinned), [posts]);
  const latest = posts.reduce<Announcement | null>((a, p) => (!a || p.createdAt > a.createdAt ? p : a), null);
  const myRoles = useMemo(() => roles.filter((r) => me?.roleIds.includes(r.id)), [roles, me]);

  const askDelete = useCallback((post: Announcement) => {
    setDeleteTarget(post);
    setDeleteOpen(true);
  }, []);

  const confirmDelete = () => {
    if (!deleteTarget) return;
    toast.result(useHub.getState().deleteAnnouncement(deleteTarget.id));
    setDeleteOpen(false);
  };

  const jumpToPost = (post: Announcement) => {
    if (cat !== 'all' && cat !== post.category) setCat('all');
    requestAnimationFrame(() => {
      document.getElementById(`post-${post.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const deleteReactions = deleteTarget ? Object.values(deleteTarget.reactions).reduce((n, l) => n + l.length, 0) : 0;
  const ActiveCatIcon = cat !== 'all' ? CATEGORY_ICON[cat] : Newspaper;

  return (
    <NeoPage
      app="news"
      className="news-page"
      icon={<Newspaper />}
      eyebrow="Hub · Newsroom"
      title="Newsroom"
      sub={
        canPublish
          ? 'Publish, pin and target updates. As a publisher you see every post — including ones aimed at other roles.'
          : 'Announcements targeted to you and your teams, freshest first.'
      }
      actions={
        canPublish ? (
          <button type="button" className="neo-btn neo-btn--plasma" onClick={() => setComposerOpen((o) => !o)}>
            <Megaphone /> <span className="neo-btn__label">{composerOpen ? 'Close composer' : 'Publish update'}</span>
          </button>
        ) : undefined
      }
      toolbar={
        <div className="news-filters" role="group" aria-label="Filter by category">
          <button
            type="button"
            className="neo-chip neo-chip--lg"
            data-tone={cat === 'all' ? 'app' : 'slate'}
            aria-pressed={cat === 'all'}
            onClick={() => setCat('all')}
          >
            All <span className="news-chip__n">{posts.length}</span>
          </button>
          {NEWS_CATEGORIES.map((c) => {
            const Icon = CATEGORY_ICON[c];
            const n = counts.byCat.get(c) ?? 0;
            return (
              <button
                key={c}
                type="button"
                className={cx('neo-chip neo-chip--lg', n === 0 && cat !== c && 'news-chip--empty')}
                data-tone={cat === c ? 'app' : 'slate'}
                aria-pressed={cat === c}
                onClick={() => setCat(cat === c ? 'all' : c)}
              >
                <Icon aria-hidden="true" /> {c} <span className="news-chip__n">{n}</span>
              </button>
            );
          })}
          {cat !== 'all' && (
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs news-filters__reset" onClick={() => setCat('all')}>
              <RotateCcw /> Show all
            </button>
          )}
        </div>
      }
    >
      <NeoHome
        className="news-home"
        sideLabel="About this feed"
        main={
          <div className="news-main">
            <Can perm="hub.news.publish">
              <Composer open={composerOpen} onOpenChange={setComposerOpen} />
            </Can>

            <NeoPanel
              className="news-feed-panel"
              icon={<ActiveCatIcon />}
              hud={cat === 'all' ? 'Company feed' : 'Category filter'}
              title={cat === 'all' ? 'Latest announcements' : `${cat} updates`}
              actions={<span className="neo-count">{filtered.length}</span>}
            >
              {filtered.length ? (
                <ol className="news-feed neo-stagger" aria-label="Announcements">
                  {filtered.map((post, i) => (
                    <li key={post.id} style={{ '--i': i } as CSSProperties}>
                      <PostCard
                        post={post}
                        usersById={usersById}
                        rolesById={rolesById}
                        meId={me?.id ?? null}
                        canPublish={canPublish}
                        now={now}
                        onDelete={askDelete}
                      />
                    </li>
                  ))}
                </ol>
              ) : (
                <NeoEmpty
                  icon={<Megaphone />}
                  title={cat === 'all' ? 'No announcements yet' : `Nothing in ${cat} yet`}
                  action={
                    cat !== 'all' ? (
                      <button type="button" className="neo-btn neo-btn--soft" onClick={() => setCat('all')}>
                        Show all categories
                      </button>
                    ) : canPublish ? (
                      <button type="button" className="neo-btn neo-btn--plasma" onClick={() => setComposerOpen(true)}>
                        <Megaphone /> Write the first one
                      </button>
                    ) : undefined
                  }
                >
                  {cat === 'all' ? 'When something is announced for your roles, it lands here.' : 'Try another category — or check back later.'}
                </NeoEmpty>
              )}
            </NeoPanel>
          </div>
        }
        side={
          <>
            <NeoPanel
              className="news-rail__card"
              icon={<Pin />}
              hud="Top of feed"
              title="Pinned"
              actions={<span className="neo-count">{pinnedPosts.length}</span>}
            >
              {pinnedPosts.length ? (
                <ul className="news-pinned-list">
                  {pinnedPosts.map((p) => {
                    const CatIcon = CATEGORY_ICON[p.category];
                    return (
                      <li key={p.id}>
                        <button type="button" className="news-pinned-item neo-spot" onClick={() => jumpToPost(p)}>
                          <span className="news-pinned-item__top">
                            <span className="tag news-cat" data-cat={p.category}>
                              <CatIcon aria-hidden="true" /> {p.category}
                            </span>
                            <span className="neo-mono neo-faint text-xs">{relativeTime(p.createdAt, now)}</span>
                          </span>
                          <span className="news-pinned-item__title">{p.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm muted">Nothing pinned right now — publishers can pin priority updates to the top of everyone’s feed.</p>
              )}
            </NeoPanel>

            <NeoPanel className="news-rail__card" icon={<Eye />} hud="Audience" title="Why you see these">
              {canPublish ? (
                <p className="text-sm muted">
                  You hold <strong>Publish announcements</strong>, so the feed shows everything —{' '}
                  <strong>{counts.targeted}</strong> {counts.targeted === 1 ? 'post is' : 'posts are'} targeted to specific roles. Look for the audience
                  badge on each post.
                </p>
              ) : (
                <p className="text-sm muted">Posts for everyone, plus those targeted to the roles you hold:</p>
              )}
              <div className="row row--wrap" style={{ marginTop: 10 }}>
                {myRoles.map((r) => (
                  <RoleChip key={r.id} name={r.name} color={r.color} />
                ))}
              </div>
            </NeoPanel>

            <NeoPanel className="news-rail__card" icon={<ShieldCheck />} hud="Telemetry" title="Feed signal">
              <dl className="news-kpis" aria-label="Feed summary">
                <div className="news-kpi">
                  <dt className="stat-label">Updates</dt>
                  <dd className="stat-value">{posts.length}</dd>
                </div>
                <div className="news-kpi">
                  <dt className="stat-label">Pinned</dt>
                  <dd className="stat-value">{counts.pinned}</dd>
                </div>
                <div className={cx('news-kpi', counts.critical > 0 && 'news-kpi--alert')}>
                  <dt className="stat-label">Critical</dt>
                  <dd className="stat-value">{counts.critical}</dd>
                </div>
              </dl>
              <ul className="news-signal">
                <li>
                  <TriangleAlert aria-hidden="true" className="news-signal__icon news-signal__icon--danger" />
                  <span className="grow">Critical alerts</span>
                  <span className="mono">{counts.critical}</span>
                </li>
                <li>
                  <Pin aria-hidden="true" className="news-signal__icon" />
                  <span className="grow">Pinned to top</span>
                  <span className="mono">{counts.pinned}</span>
                </li>
                <li>
                  <span className="news-signal__icon news-signal__emoji" aria-hidden="true">
                    👍
                  </span>
                  <span className="grow">Posts you reacted to</span>
                  <span className="mono">{counts.myReactions}</span>
                </li>
              </ul>
              {latest && <p className="field-hint">Last update {relativeTime(latest.createdAt, now)}</p>}
            </NeoPanel>
          </>
        }
      />

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this announcement?"
        subtitle="It disappears from everyone’s feed. This can’t be undone."
        icon={
          <span className="news-modal-icon" aria-hidden="true">
            <Trash2 />
          </span>
        }
        width={480}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn--danger" onClick={confirmDelete}>
              <Trash2 /> Delete post
            </button>
          </>
        }
      >
        {deleteTarget && (
          <div className="news-delete-preview">
            <div className="news-delete-preview__title">{deleteTarget.title}</div>
            <div className="text-xs faint mono">
              {usersById.get(deleteTarget.authorId)?.name ?? 'Unknown author'} · {relativeTime(deleteTarget.createdAt, now)} · {deleteReactions}{' '}
              {deleteReactions === 1 ? 'reaction' : 'reactions'}
            </div>
          </div>
        )}
      </Modal>
    </NeoPage>
  );
}
