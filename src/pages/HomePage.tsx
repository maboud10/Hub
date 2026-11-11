import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Clock, Flame, Hand, Hourglass, Inbox, LayoutGrid, LayoutList, Rocket, TriangleAlert, Wrench } from 'lucide-react';
import type { AppCategory, WidgetId } from '@/types';
import { useHub } from '@/store/hub';
import { useUI } from '@/store/ui';
import { useAppAccess, usePrefs, useReviewableRequests, useSessionUser } from '@/store/selectors';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useNow } from '@/hooks/useNow';
import { APP_CATEGORIES } from '@/data/apps';
import { firstName, formatDate, greeting, pluralize, relativeTime } from '@/lib/format';
import { NeoBanner, NeoBanners, NeoEmpty, NeoHome, NeoPage, NeoPanel } from '@/components/neo';
import { AppGrid, type TileVariant } from '@/components/apps/AppTile';
import { PinnedDock } from '@/components/apps/PinnedDock';
import { Segmented } from '@/components/ui/primitives';
import { NovaLaunch } from '@/components/widgets/HeroGreeting';
import { CustomizeButton } from '@/components/widgets/CustomizeMenu';
import {
  AgendaWidget,
  CelebrationsWidget,
  FocusWidget,
  KudosWidget,
  NewsWidget,
  PulseWidget,
  StatusWidget,
} from '@/components/widgets/Widgets';
import { cx } from '@/lib/cx';

type HomeFilter = 'all' | 'recent' | 'frequent' | AppCategory;

const WIDGETS: Record<WidgetId, () => ReactNode> = {
  agenda: () => <AgendaWidget />,
  focus: () => <FocusWidget />,
  news: () => <NewsWidget />,
  pulse: () => <PulseWidget />,
  kudos: () => <KudosWidget />,
  status: () => <StatusWidget />,
  celebrations: () => <CelebrationsWidget />,
};
const WIDGET_ORDER: WidgetId[] = ['agenda', 'focus', 'news', 'pulse', 'kudos', 'status', 'celebrations'];

const DAY = 86_400_000;

/**
 * Launchpad — the hub's front door, in the NEO anatomy of the Support Deck:
 * header (greeting + Customize / All apps) → attention banners → main column
 * (Nova launch console, pinned dock, your apps, discover) + widget side column.
 */
export function HomePage() {
  const prefs = usePrefs();
  const user = useSessionUser();
  const updatePrefs = useHub((s) => s.updatePrefs);
  const apps = useAppAccess();
  const isMobile = useIsMobile();
  const now = useNow(60_000);
  const [filter, setFilter] = useState<HomeFilter>('all');

  const granted = useMemo(() => apps.filter((a) => a.access === 'granted'), [apps]);
  // In-flight requests lead Discover so their live trackers always make the visible slice.
  const discover = useMemo(
    () => apps.filter((a) => a.access === 'locked' || a.access === 'pending').sort((a, b) => Number(b.access === 'pending') - Number(a.access === 'pending')),
    [apps],
  );
  const categories = APP_CATEGORIES.filter((c) => granted.some((g) => g.app.category === c));
  const pinnedCount = prefs.pinned.filter((id) => granted.some((g) => g.app.id === id)).length;

  const shown = useMemo(() => {
    if (filter === 'recent')
      return prefs.recents.map((r) => granted.find((g) => g.app.id === r.appId)).filter((g): g is (typeof granted)[number] => !!g);
    if (filter === 'frequent')
      return granted
        .filter((g) => (prefs.launchCounts[g.app.id] ?? 0) > 0)
        .sort((a, b) => (prefs.launchCounts[b.app.id] ?? 0) - (prefs.launchCounts[a.app.id] ?? 0));
    if (filter !== 'all') return granted.filter((g) => g.app.category === filter);
    return granted;
  }, [filter, granted, prefs.recents, prefs.launchCounts]);

  const variant: TileVariant = isMobile ? 'icon' : prefs.tileView === 'list' ? 'row' : 'card';
  const widgets = WIDGET_ORDER.filter((id) => prefs.widgets[id] !== false);

  const filters: { id: HomeFilter; label: string; icon?: ReactNode; count?: number }[] = [
    { id: 'all', label: 'All', count: granted.length },
    { id: 'recent', label: 'Recent', icon: <Clock /> },
    { id: 'frequent', label: 'Most used', icon: <Flame /> },
    ...categories.map((c) => ({ id: c as HomeFilter, label: c, count: granted.filter((g) => g.app.category === c).length })),
  ];

  return (
    <NeoPage
      className="launchpad"
      bodyClassName="lp-body"
      icon={<Rocket />}
      eyebrow={<>Launchpad · {formatDate(now, { weekday: 'long', day: 'numeric', month: 'long' })}</>}
      title={`${greeting(new Date(now))}, ${user ? firstName(user.name) : 'there'}`}
      sub="Your apps, your day and Nova — all in one place."
      label="Launchpad"
      actions={
        <>
          <CustomizeButton />
          <Link to="/apps" className="neo-btn neo-btn--plasma" data-qa="home-all-apps">
            <LayoutGrid /> <span className="neo-btn__label">All apps</span>
          </Link>
        </>
      }
    >
      <AttentionBanners />
      <NeoHome
        className="lp-home"
        sideLabel="Widgets"
        main={
          <>
            <NovaLaunch />

            <NeoPanel
              className="lp-pinned"
              hud="Your dock"
              title={
                <>
                  Pinned <span className="neo-count">{pinnedCount}</span>
                </>
              }
              actions={
                <span className="lp-hint">
                  {isMobile ? (
                    'Long-press & drag to reorder'
                  ) : (
                    <>
                      Drag to reorder · <kbd className="lp-kbd">1</kbd>–<kbd className="lp-kbd">9</kbd> to launch
                    </>
                  )}
                </span>
              }
            >
              <PinnedDock />
            </NeoPanel>

            <NeoPanel
              className="lp-apps"
              hud="Workspace"
              title={
                <>
                  Your apps <span className="neo-count">{granted.length}</span>
                </>
              }
              actions={
                !isMobile && (
                  <Segmented
                    label="Tile layout"
                    value={prefs.tileView}
                    onChange={(v) => updatePrefs({ tileView: v })}
                    options={[
                      { value: 'grid', label: '', icon: <LayoutGrid />, title: 'Grid' },
                      { value: 'list', label: '', icon: <LayoutList />, title: 'List' },
                    ]}
                  />
                )
              }
            >
              <div className="lp-filters" role="tablist" aria-label="Filter apps">
                {filters.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="tab"
                    aria-selected={filter === f.id}
                    className={cx('lp-filter', filter === f.id && 'is-active')}
                    onClick={() => setFilter(f.id)}
                  >
                    {f.icon}
                    {f.label}
                    {f.count !== undefined && <span className="lp-filter__count">{f.count}</span>}
                  </button>
                ))}
              </div>
              {shown.length ? (
                <AppGrid key={filter + variant} items={shown} variant={variant} />
              ) : (
                <NeoEmpty compact icon={<Clock />} title="Nothing here yet">
                  Launch a few apps and they’ll show up here.
                </NeoEmpty>
              )}
              {isMobile && (
                <p className="lp-tip">
                  <Hand /> Tip: long-press any app for details, pinning and quick actions.
                </p>
              )}
            </NeoPanel>

            {discover.length > 0 && (
              <NeoPanel
                className="lp-discover"
                hud="Request access"
                title={
                  <>
                    Discover <span className="neo-count">{discover.length}</span>
                  </>
                }
                actions={
                  <Link to="/apps?access=locked" className="neo-btn neo-btn--ghost neo-btn--xs">
                    All <ArrowRight />
                  </Link>
                }
              >
                <p className="lp-lede">Apps outside your role — request time-boxed access in a couple of taps.</p>
                <AppGrid items={discover.slice(0, isMobile ? 8 : 4)} variant={variant} />
              </NeoPanel>
            )}
          </>
        }
        side={widgets.length > 0 ? widgets.map((id) => <Fragment key={id}>{WIDGETS[id]()}</Fragment>) : undefined}
      />
    </NeoPage>
  );
}

/** Only when something needs the person: reviews waiting, access about to lapse, an app they use misbehaving. */
function AttentionBanners() {
  const reviewable = useReviewableRequests();
  const apps = useAppAccess();
  const prefs = usePrefs();
  const openAppSheet = useUI((s) => s.openAppSheet);
  const now = useNow(60_000);

  const expiring = apps
    .filter((a) => a.access === 'granted' && a.expiresAt && a.expiresAt - now < 7 * DAY)
    .sort((a, b) => (a.expiresAt ?? 0) - (b.expiresAt ?? 0))[0];
  const used = (id: string) => prefs.pinned.includes(id) || prefs.recents.some((r) => r.appId === id);
  const troubled = apps.filter((a) => a.access === 'granted' && a.app.status !== 'operational').sort((a, b) => Number(used(b.app.id)) - Number(used(a.app.id)))[0];

  const banners: ReactNode[] = [];
  if (reviewable.length)
    banners.push(
      <NeoBanner key="review" tone="warning" icon={<Inbox />} title={`${pluralize(reviewable.length, 'access request')} awaiting your review`} meta="Control Center" to="/admin/requests">
        Approve or deny time-boxed access — requesters are notified instantly.
      </NeoBanner>,
    );
  if (expiring)
    banners.push(
      <NeoBanner
        key="expiring"
        tone="amber"
        icon={<Hourglass />}
        title={`Your ${expiring.app.name} access expires ${relativeTime(expiring.expiresAt!, now)}`}
        meta="Temporary grant"
        onClick={() => openAppSheet(expiring.app.id)}
      >
        Request an extension before it lapses.
      </NeoBanner>,
    );
  if (troubled)
    banners.push(
      <NeoBanner
        key="status"
        tone={troubled.app.status === 'degraded' ? 'warning' : 'blue'}
        icon={troubled.app.status === 'degraded' ? <TriangleAlert /> : <Wrench />}
        title={`${troubled.app.name} ${troubled.app.status === 'degraded' ? 'is degraded' : 'is under maintenance'}`}
        meta={used(troubled.app.id) ? 'An app you use' : 'Service status'}
        onClick={() => openAppSheet(troubled.app.id)}
      >
        {troubled.app.status === 'degraded' ? 'Some features may be slow while the team works on a fix.' : 'Planned work — it’ll be back shortly.'}
      </NeoBanner>,
    );

  if (!banners.length) return null;
  return <NeoBanners>{banners.slice(0, 2)}</NeoBanners>;
}
