import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Activity, BellOff, CheckCheck, Contact, GraduationCap, Inbox, KeyRound, Megaphone, PartyPopper, UserPlus } from 'lucide-react';
import type { HubNotification, NotificationKind } from '@/types';
import { useHub } from '@/store/hub';
import { useUI } from '@/store/ui';
import { useMyNotifications, usePrefs } from '@/store/selectors';
import { Sheet } from '@/components/ui/Sheet';
import { EmptyState, Segmented } from '@/components/ui/primitives';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';

const KIND_META: Record<NotificationKind, { icon: typeof Inbox; rgb: string; label: string }> = {
  access: { icon: KeyRound, rgb: 'var(--success-rgb)', label: 'Access' },
  request: { icon: Inbox, rgb: 'var(--accent-rgb)', label: 'Requests' },
  announcement: { icon: Megaphone, rgb: 'var(--warning-rgb)', label: 'News' },
  kudos: { icon: PartyPopper, rgb: 'var(--accent-2-rgb)', label: 'Kudos' },
  talent: { icon: UserPlus, rgb: '245 158 11', label: 'Hiring' },
  hr: { icon: Contact, rgb: '192 132 252', label: 'People & HR' },
  learning: { icon: GraduationCap, rgb: '129 140 248', label: 'Academy & Docs' },
  system: { icon: Activity, rgb: 'var(--info-rgb)', label: 'System' },
};

const DAY = 86_400_000;

export function NotificationsPanel() {
  const open = useUI((s) => s.notificationsOpen);
  const setOpen = useUI((s) => s.setNotificationsOpen);
  const all = useMyNotifications();
  const prefs = usePrefs();
  const { markNotificationRead, markAllNotificationsRead } = useHub.getState();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'all' | 'unread'>('all');

  const visible = useMemo(() => all.filter((n) => prefs.notifyKinds[n.kind] !== false), [all, prefs.notifyKinds]);
  const list = tab === 'unread' ? visible.filter((n) => !n.read) : visible;
  const unread = visible.filter((n) => !n.read).length;
  const today = list.filter((n) => Date.now() - n.at < DAY);
  const earlier = list.filter((n) => Date.now() - n.at >= DAY);

  const openItem = (n: HubNotification) => {
    markNotificationRead(n.id);
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  };

  const renderGroup = (label: string, items: HubNotification[]) =>
    items.length > 0 && (
      <div className="notif-group">
        <div className="stat-label" style={{ margin: '4px 4px 8px' }}>
          {label}
        </div>
        <div className="stack stack--sm stagger">
          {items.map((n, i) => {
            const meta = KIND_META[n.kind];
            const Icon = meta.icon;
            return (
              <button key={n.id} className={cx('notif', !n.read && 'is-unread')} onClick={() => openItem(n)} style={{ ['--i' as string]: i, ['--n-rgb' as string]: meta.rgb }}>
                <span className="notif__icon">
                  <Icon />
                </span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="notif__title">{n.title}</span>
                  {n.body && <span className="notif__body">{n.body}</span>}
                  <span className="notif__meta">
                    {meta.label} · {relativeTime(n.at)}
                  </span>
                </span>
                {!n.read && <span className="notif__dot" aria-label="Unread" />}
              </button>
            );
          })}
        </div>
      </div>
    );

  return (
    <Sheet
      open={open}
      onClose={() => setOpen(false)}
      title={
        <span className="row" style={{ gap: 10 }}>
          Notifications {unread > 0 && <span className="counter">{unread}</span>}
        </span>
      }
      label="Notifications"
      width={430}
      footer={
        unread > 0 ? (
          <button className="btn btn--block" onClick={markAllNotificationsRead}>
            <CheckCheck /> Mark all as read
          </button>
        ) : undefined
      }
    >
      <div style={{ marginBottom: 16 }}>
        <Segmented
          label="Filter notifications"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'all', label: `All · ${visible.length}` },
            { value: 'unread', label: `Unread · ${unread}` },
          ]}
        />
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<BellOff />} title={tab === 'unread' ? 'You’re all caught up' : 'No notifications yet'}>
          Access decisions, requests, announcements and kudos will show up here.
        </EmptyState>
      ) : (
        <div className="stack stack--lg">
          {renderGroup('Today', today)}
          {renderGroup('Earlier', earlier)}
        </div>
      )}
    </Sheet>
  );
}
