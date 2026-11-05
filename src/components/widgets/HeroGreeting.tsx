import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { ArrowUpRight, Command, Inbox, LayoutGrid, Bell } from 'lucide-react';
import { useUI } from '@/store/ui';
import { useAppAccess, useClearance, usePrimaryRole, useReviewableRequests, useSessionUser, useUnreadCount } from '@/store/selectors';
import { useNow } from '@/hooks/useNow';
import { buildAgenda } from '@/data/agenda';
import { firstName, formatDate, formatTime, greeting, pluralize, tzLabel } from '@/lib/format';
import { getIcon } from '@/icons';
import { ClearanceBadge } from '@/components/ui/primitives';
import { NovaOrb } from '@/components/shell/Brand';
import { useLaunchApp } from '@/components/apps/useLaunchApp';
import { BRAND } from '@/config/brand';

/** Ordered pool of suggested quick actions; only ones the user can access are shown. */
const SUGGESTIONS: { appId: string; label: string }[] = [
  { appId: 'hr', label: 'Request time off' },
  { appId: 'spaces', label: 'Book a room' },
  { appId: 'expenses', label: 'Submit expense' },
  { appId: 'helpdesk', label: 'Raise a ticket' },
  { appId: 'devhub', label: 'My pull requests' },
  { appId: 'projects', label: 'Create task' },
  { appId: 'meet', label: 'Start instant meeting' },
];

export function HeroGreeting() {
  const user = useSessionUser();
  const role = usePrimaryRole();
  const clearance = useClearance();
  const apps = useAppAccess();
  const reviewable = useReviewableRequests();
  const unread = useUnreadCount();
  const setPaletteOpen = useUI((s) => s.setPaletteOpen);
  const launch = useLaunchApp();
  const navigate = useNavigate();
  const now = useNow(30_000);

  const agenda = useMemo(() => buildAgenda(new Date(now)), [Math.floor(now / 60_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!user) return null;

  const granted = apps.filter((a) => a.access === 'granted');
  const meetingsLeft = agenda.filter((e) => e.end.getTime() > now && e.appId === 'meet').length;
  const next = agenda.find((e) => e.start.getTime() > now);
  const minsToNext = next ? Math.round((next.start.getTime() - now) / 60_000) : null;

  const suggestions = SUGGESTIONS.map((s) => ({ ...s, item: granted.find((g) => g.app.id === s.appId) }))
    .filter((s) => s.item)
    .slice(0, 4);

  const lines: string[] = [];
  if (meetingsLeft) lines.push(`${pluralize(meetingsLeft, 'meeting')} left today`);
  if (reviewable.length) lines.push(`${pluralize(reviewable.length, 'access request')} awaiting your review`);
  if (next && minsToNext !== null) lines.push(`next up: ${next.title} in ${minsToNext}m`);
  const sub = lines.length ? lines.join(' · ') : 'Your day looks clear — perfect for deep work.';

  return (
    <section className="hero card glow-border" aria-label="Welcome">
      <div className="hero__scan" aria-hidden="true" />
      <div className="hero__main">
        <div className="eyebrow">
          {formatDate(now, { weekday: 'long', day: 'numeric', month: 'long' })} · {formatTime(now)} {tzLabel()}
        </div>
        <h1 className="hero__title">
          {greeting(new Date(now))}, <span className="hero__name">{firstName(user.name)}</span>
        </h1>
        <p className="hero__sub">{sub.charAt(0).toUpperCase() + sub.slice(1)}.</p>
        <div className="hero__chips">
          <ClearanceBadge level={clearance} label={role?.name} />
          <span className="hero-chip">
            <LayoutGrid /> {pluralize(granted.length, 'app')} available
          </span>
          {unread > 0 && (
            <button className="hero-chip hero-chip--btn" onClick={() => useUI.getState().setNotificationsOpen(true)}>
              <Bell /> {unread} unread
            </button>
          )}
          {reviewable.length > 0 && (
            <button className="hero-chip hero-chip--btn hero-chip--alert" onClick={() => navigate('/admin/requests')}>
              <Inbox /> {reviewable.length} to review
            </button>
          )}
        </div>
      </div>

      <div className="hero__nova">
        <NovaOrb size={92} onClick={() => setPaletteOpen(true)} label={`Ask ${BRAND.assistant}`} className="hero__orb" />
        <button className="hero__ask" onClick={() => setPaletteOpen(true)}>
          <span className="grow">Ask {BRAND.assistant} anything…</span>
          <span className="kbd">
            <Command size={11} />
          </span>
          <span className="kbd">K</span>
        </button>
        {suggestions.length > 0 && (
          <div className="hero__suggest">
            {suggestions.map(({ appId, label, item }) => {
              const qa = item!.app.quickActions?.find((q) => q.label === label);
              const Icon = getIcon(qa?.icon ?? item!.app.icon);
              return (
                <button key={label} className="suggest-chip" onClick={() => launch(appId, label)}>
                  <Icon />
                  {label}
                  <ArrowUpRight className="suggest-chip__go" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
