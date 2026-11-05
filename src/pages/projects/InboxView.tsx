import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Bell, CheckCheck, Inbox } from 'lucide-react';
import { useHub } from '@/store/hub';
import { EmptyState, Segmented } from '@/components/ui/primitives';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { useMyProjectsState, useWorkInbox } from '@/projects/selectors';
import { api } from './shared';

export function InboxView() {
  const navigate = useNavigate();
  const { items, unread } = useWorkInbox();
  const state = useMyProjectsState();
  const markNotificationRead = useHub((s) => s.markNotificationRead);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const openItem = (id: string, link?: string) => {
    markNotificationRead(id);
    if (link) navigate(link);
  };

  const visibleItems = filter === 'unread' ? items.filter((n) => n.at > state.inboxReadAt && !n.read) : items;

  return (
    <div className="pj-view pj-inbox">
      <div className="pj-view__head">
        <div>
          <h2 className="pj-view__title">Inbox</h2>
          <p className="pj-view__sub">Assignments, mentions, approvals, unblocked work and status updates from projects you’re part of.</p>
        </div>
        <div className="row row--wrap" style={{ gap: 10 }}>
          <Segmented
            label="Filter inbox"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `All (${items.length})` },
              { value: 'unread', label: `Unread (${unread})` },
            ]}
          />
          {unread > 0 && (
            <span className="pj-count pj-count--accent">
              <Bell /> <b>{unread}</b> unread
            </span>
          )}
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              api().markInboxRead();
              useHub.getState().markAllNotificationsRead();
            }}
            disabled={unread === 0}
          >
            <CheckCheck /> Mark all read
          </button>
        </div>
      </div>

      {visibleItems.length === 0 ? (
        <EmptyState icon={<Inbox />} title={filter === 'unread' ? 'No unread notifications' : 'Your inbox is clear'}>
          {filter === 'unread' ? 'You’re all caught up on unread items.' : 'When teammates assign you work, mention you in a comment or ask for an approval, it shows up here.'}
        </EmptyState>
      ) : (
        <ul className="pj-inbox__list">
          {visibleItems.map((n) => {
            const isUnread = n.at > state.inboxReadAt && !n.read;
            return (
              <li key={n.id}>
                <button type="button" className={cx('pj-inbox__item', isUnread && 'is-unread')} onClick={() => openItem(n.id, n.link)}>
                  <span className="pj-inbox__dot" aria-hidden="true" />
                  <span className="grow">
                    <span className="pj-inbox__title">{n.title}</span>
                    {n.body && <span className="pj-inbox__body">{n.body}</span>}
                  </span>
                  <time className="pj-inbox__time" dateTime={new Date(n.at).toISOString()}>
                    {relativeTime(n.at)}
                  </time>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

