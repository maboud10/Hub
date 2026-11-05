import {
  Activity,
  Award,
  Bell,
  BellOff,
  Cake,
  CalendarDays,
  ClipboardList,
  Contact,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  Megaphone,
  Newspaper,
  Signal,
  SquareKanban,
  Timer,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import type { NotificationKind, WidgetId } from '@/types';
import { useHub } from '@/store/hub';
import { useCan, usePrefs } from '@/store/selectors';
import { Switch } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { SettingRow, SettingsSection } from './SettingsSection';

interface ToggleMeta<T extends string> {
  id: T;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const WIDGETS: ToggleMeta<WidgetId>[] = [
  { id: 'agenda', label: 'Today’s agenda', description: 'Your next meetings and events at a glance.', icon: CalendarDays },
  { id: 'focus', label: 'Focus timer', description: 'Pomodoro sessions that set you to “Focusing”.', icon: Timer },
  { id: 'news', label: 'Newsroom digest', description: 'The latest announcements targeted to you.', icon: Newspaper },
  { id: 'pulse', label: 'Daily pulse', description: 'A one-tap, anonymous mood check-in.', icon: Activity },
  { id: 'kudos', label: 'Kudos wall', description: 'Recent recognition from across the company.', icon: Award },
  { id: 'status', label: 'System status', description: 'Live health of the apps you rely on.', icon: Signal },
  { id: 'celebrations', label: 'Celebrations', description: 'Birthdays and work anniversaries coming up.', icon: Cake },
];

export const NOTIFICATION_KINDS: ToggleMeta<NotificationKind>[] = [
  { id: 'access', label: 'Access updates', description: 'Grants, expiries and decisions on your requests.', icon: KeyRound },
  { id: 'request', label: 'Requests to review', description: 'When a colleague needs your approval.', icon: ClipboardList },
  { id: 'announcement', label: 'Announcements', description: 'New Newsroom posts targeted to you.', icon: Megaphone },
  { id: 'kudos', label: 'Kudos', description: 'When someone recognises your work.', icon: Award },
  { id: 'talent', label: 'Hiring & onboarding', description: 'Scorecards due, offer approvals, hires and onboarding tasks.', icon: UserPlus },
  { id: 'hr', label: 'Time off, benefits & HR', description: 'Leave decisions, claims, letters, documents to sign and replies from People Ops.', icon: Contact },
  { id: 'learning', label: 'Academy & Knowledge Base', description: 'Assigned trainings, certificate renewals, change proposals and doc reviews.', icon: GraduationCap },
  { id: 'work', label: 'Projects & Drive', description: 'Task assignments, mentions, approvals, status updates, file shares and access requests.', icon: SquareKanban },
  { id: 'system', label: 'System status', description: 'Outages and maintenance for apps you pinned.', icon: Activity },
];

/** Read-modify-write against the live store so rapid toggles never clobber each other. */
function currentPrefs() {
  const s = useHub.getState();
  return s.sessionUserId ? s.prefs[s.sessionUserId] : undefined;
}

export function WidgetsSection() {
  const prefs = usePrefs();
  const updatePrefs = useHub((s) => s.updatePrefs);
  const enabled = WIDGETS.filter((w) => prefs.widgets[w.id] !== false).length;

  const setWidget = (id: WidgetId, value: boolean) => {
    const widgets = currentPrefs()?.widgets ?? prefs.widgets;
    updatePrefs({ widgets: { ...widgets, [id]: value } });
  };
  const setAll = (value: boolean) =>
    updatePrefs({ widgets: Object.fromEntries(WIDGETS.map((w) => [w.id, value])) as Record<WidgetId, boolean> });

  return (
    <SettingsSection
      id="widgets"
      icon={<LayoutDashboard />}
      title="Home widgets"
      description="Choose what lives on your Home dashboard."
      aside={
        <div className="set-aside">
          <span className="set-counter mono">
            {enabled}/{WIDGETS.length} on
          </span>
          <button type="button" className="btn btn--ghost btn--sm set-aside__btn" onClick={() => setAll(enabled < WIDGETS.length)}>
            {enabled < WIDGETS.length ? 'Show all' : 'Hide all'}
          </button>
        </div>
      }
    >
      <ul className="set-tiles">
        {WIDGETS.map((w) => {
          const on = prefs.widgets[w.id] !== false;
          const Icon = w.icon;
          return (
            <li key={w.id} className={cx('set-tile', on && 'is-on')}>
              <span className="set-tile__icon" aria-hidden="true">
                <Icon />
              </span>
              <div className="set-tile__text">
                <div className="set-tile__title">{w.label}</div>
                <div className="set-tile__desc">{w.description}</div>
              </div>
              <Switch checked={on} onChange={(v) => setWidget(w.id, v)} label={`Show ${w.label} on Home`} />
            </li>
          );
        })}
      </ul>
    </SettingsSection>
  );
}

export function NotificationsSection() {
  const prefs = usePrefs();
  const updatePrefs = useHub((s) => s.updatePrefs);
  const canReview = useCan('hub.requests.review');
  const enabled = NOTIFICATION_KINDS.filter((k) => prefs.notifyKinds[k.id] !== false).length;

  const setKind = (id: NotificationKind, value: boolean) => {
    const notifyKinds = currentPrefs()?.notifyKinds ?? prefs.notifyKinds;
    updatePrefs({ notifyKinds: { ...notifyKinds, [id]: value } });
  };

  return (
    <SettingsSection
      id="notifications"
      icon={enabled ? <Bell /> : <BellOff />}
      title="Notifications"
      description="Pick which events reach your notification centre."
      aside={
        <span className={cx('set-counter mono', !enabled && 'is-off')}>
          {enabled ? `${enabled}/${NOTIFICATION_KINDS.length} on` : 'All muted'}
        </span>
      }
    >
      <div className="set-rows">
        {NOTIFICATION_KINDS.map((k) => {
          const on = prefs.notifyKinds[k.id] !== false;
          const Icon = k.icon;
          const reviewerOnly = k.id === 'request' && !canReview;
          return (
            <SettingRow
              key={k.id}
              icon={<Icon />}
              title={k.label}
              badge={reviewerOnly ? <span className="badge badge--muted">Reviewers</span> : undefined}
              description={reviewerOnly ? `${k.description} You don’t review requests today — this kicks in if you ever do.` : k.description}
              className={cx(!on && 'is-off')}
            >
              <Switch checked={on} onChange={(v) => setKind(k.id, v)} label={`${k.label} notifications`} />
            </SettingRow>
          );
        })}
      </div>
    </SettingsSection>
  );
}
