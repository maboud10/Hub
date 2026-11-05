import { Eye, Globe, Pin, PinOff, Trash2 } from 'lucide-react';
import type { Announcement, Role, User } from '@/types';
import { Avatar } from '@/components/ui/primitives';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { firstName, formatDateTime, relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { CATEGORY_ICON, DEFAULT_REACTIONS, PRIORITY_META, summarizeNames } from './newsMeta';

interface PostCardProps {
  post: Announcement;
  usersById: Map<string, User>;
  rolesById: Map<string, Role>;
  meId: string | null;
  canPublish: boolean;
  now: number;
  onDelete(post: Announcement): void;
}

const DAY = 86_400_000;

export function PostCard({ post, usersById, rolesById, meId, canPublish, now, onDelete }: PostCardProps) {
  const react = useHub((s) => s.reactToAnnouncement);
  const author = usersById.get(post.authorId);
  const CatIcon = CATEGORY_ICON[post.category];
  const prio = PRIORITY_META[post.priority];
  const PrioIcon = prio.icon;
  const isNew = now - post.createdAt < DAY && post.authorId !== meId;
  const titleId = `post-${post.id}-title`;

  const extra = Object.keys(post.reactions).filter((e) => !DEFAULT_REACTIONS.includes(e) && post.reactions[e].length > 0);
  const emojis = [...DEFAULT_REACTIONS, ...extra];
  const total = Object.values(post.reactions).reduce((n, list) => n + list.length, 0);
  const audience = post.audienceRoleIds.map((id) => rolesById.get(id)?.name ?? id);

  const togglePin = () => toast.result(useHub.getState().togglePinAnnouncement(post.id));

  return (
    <article className={cx('news-post card', `news-post--${post.priority}`, post.pinned && 'is-pinned')} aria-labelledby={titleId}>
      {post.priority === 'critical' && <div className="news-post__alert" aria-hidden="true" />}

      <header className="news-post__head">
        <div className="news-post__tags">
          {post.priority !== 'normal' && (
            <span className={cx('badge', post.priority === 'critical' ? 'badge--danger news-critical' : 'badge--warning')}>
              <PrioIcon /> {prio.label}
            </span>
          )}
          <span className="tag news-cat" data-cat={post.category}>
            <CatIcon aria-hidden="true" /> {post.category}
          </span>
          {post.pinned && (
            <span className="news-pinned">
              <Pin aria-hidden="true" /> Pinned
            </span>
          )}
          {isNew && <span className="badge badge--info">New</span>}
        </div>
        {canPublish && (
          <div className="news-post__tools">
            <button
              type="button"
              className={cx('icon-btn', post.pinned && 'is-on')}
              onClick={togglePin}
              aria-label={post.pinned ? `Unpin “${post.title}”` : `Pin “${post.title}” to the top`}
              data-tip={post.pinned ? 'Unpin' : 'Pin to top'}
            >
              {post.pinned ? <PinOff /> : <Pin />}
            </button>
            <button type="button" className="icon-btn news-post__delete" onClick={() => onDelete(post)} aria-label={`Delete “${post.title}”`} data-tip="Delete">
              <Trash2 />
            </button>
          </div>
        )}
      </header>

      <h2 id={titleId} className="news-post__title">
        {post.title}
      </h2>
      <p className="news-post__body">{post.body}</p>

      <div className="news-post__byline">
        <div className="news-author">
          {author ? <Avatar user={author} size={36} /> : <span className="news-author__ghost" aria-hidden="true" />}
          <div className="news-author__text">
            <span className="news-author__name truncate">
              {author?.name ?? 'Former colleague'}
              {author?.id === meId && <span className="faint"> (you)</span>}
            </span>
            <span className="news-author__meta">
              {author?.title && <span className="truncate">{author.title}</span>}
              <span aria-hidden="true">·</span>
              <time dateTime={new Date(post.createdAt).toISOString()} title={formatDateTime(post.createdAt)}>
                {relativeTime(post.createdAt, now)}
              </time>
            </span>
          </div>
        </div>
        {canPublish && (
          <span
            className={cx('badge news-audience', audience.length ? 'badge--info' : 'badge--muted')}
            title={audience.length ? `Only holders of: ${audience.join(', ')}` : 'Visible to everyone'}
          >
            {audience.length ? <Eye /> : <Globe />}
            <span className="truncate">{audience.length ? `Visible to: ${audience.join(', ')}` : 'Everyone'}</span>
          </span>
        )}
      </div>

      <div className="news-reactions" role="group" aria-label="Reactions">
        {emojis.map((emoji) => {
          const list = post.reactions[emoji] ?? [];
          const mine = !!meId && list.includes(meId);
          const names = list.map((id) => (id === meId ? 'You' : firstName(usersById.get(id)?.name ?? 'Someone')));
          return (
            <button
              key={emoji}
              type="button"
              className={cx('news-react', mine && 'is-mine', !list.length && 'is-empty')}
              aria-pressed={mine}
              aria-label={`${emoji} — ${list.length} ${list.length === 1 ? 'reaction' : 'reactions'}${mine ? ', including yours' : ''}`}
              data-tip={list.length ? summarizeNames(names) : `React with ${emoji}`}
              onClick={() => react(post.id, emoji)}
            >
              <span className="news-react__emoji" aria-hidden="true">
                {emoji}
              </span>
              {list.length > 0 && (
                <span className="news-react__count mono" aria-hidden="true">
                  {list.length}
                </span>
              )}
            </button>
          );
        })}
        <span className="news-reactions__total mono">{total ? `${total} ${total === 1 ? 'reaction' : 'reactions'}` : 'Be the first to react'}</span>
      </div>
    </article>
  );
}
