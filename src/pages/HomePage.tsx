import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Clock, Flame, LayoutGrid, LayoutList, Pin, Sparkles, Hand } from 'lucide-react';
import type { AppCategory, WidgetId } from '@/types';
import { useHub } from '@/store/hub';
import { useAppAccess, usePrefs } from '@/store/selectors';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { APP_CATEGORIES } from '@/data/apps';
import { AppGrid, type TileVariant } from '@/components/apps/AppTile';
import { PinnedDock } from '@/components/apps/PinnedDock';
import { EmptyState, Segmented } from '@/components/ui/primitives';
import { HeroGreeting } from '@/components/widgets/HeroGreeting';
import {
  AgendaWidget,
  CelebrationsWidget,
  FocusWidget,
  KudosWidget,
  NewsWidget,
  PulseWidget,
  StatusWidget,
} from '@/components/widgets/Widgets';

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

export function HomePage() {
  const prefs = usePrefs();
  const updatePrefs = useHub((s) => s.updatePrefs);
  const apps = useAppAccess();
  const isMobile = useIsMobile();
  const [filter, setFilter] = useState<HomeFilter>('all');

  const granted = useMemo(() => apps.filter((a) => a.access === 'granted'), [apps]);
  const discover = useMemo(() => apps.filter((a) => a.access === 'locked' || a.access === 'pending'), [apps]);
  const categories = APP_CATEGORIES.filter((c) => granted.some((g) => g.app.category === c));

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

  return (
    <div className="page home">
      <HeroGreeting />

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">
            <Pin size={18} className="accent-ink" /> Pinned <span className="count">{prefs.pinned.length}</span>
          </h2>
          <span className="text-xs faint home__hint">{isMobile ? 'Long-press & drag to reorder' : 'Drag to reorder · press 1–9 to launch'}</span>
        </div>
        <PinnedDock />
      </section>

      <div className="home__grid">
        <div className="home__main">
          <section className="section">
            <div className="section-head">
              <h2 className="section-title">
                Your apps <span className="count">{granted.length}</span>
              </h2>
              {!isMobile && (
                <Segmented
                  label="Tile layout"
                  value={prefs.tileView}
                  onChange={(v) => updatePrefs({ tileView: v })}
                  options={[
                    { value: 'grid', label: '', icon: <LayoutGrid />, title: 'Grid' },
                    { value: 'list', label: '', icon: <LayoutList />, title: 'List' },
                  ]}
                />
              )}
            </div>
            <div className="chips" style={{ marginBottom: 18 }} role="tablist" aria-label="Filter apps">
              <button role="tab" aria-selected={filter === 'all'} className={'chip' + (filter === 'all' ? ' is-active' : '')} onClick={() => setFilter('all')}>
                All <span className="count">{granted.length}</span>
              </button>
              <button role="tab" aria-selected={filter === 'recent'} className={'chip' + (filter === 'recent' ? ' is-active' : '')} onClick={() => setFilter('recent')}>
                <Clock /> Recent
              </button>
              <button role="tab" aria-selected={filter === 'frequent'} className={'chip' + (filter === 'frequent' ? ' is-active' : '')} onClick={() => setFilter('frequent')}>
                <Flame /> Most used
              </button>
              {categories.map((c) => (
                <button key={c} role="tab" aria-selected={filter === c} className={'chip' + (filter === c ? ' is-active' : '')} onClick={() => setFilter(c)}>
                  {c} <span className="count">{granted.filter((g) => g.app.category === c).length}</span>
                </button>
              ))}
            </div>
            {shown.length ? (
              <AppGrid key={filter + variant} items={shown} variant={variant} />
            ) : (
              <EmptyState icon={<Clock />} title="Nothing here yet">
                Launch a few apps and they’ll show up here.
              </EmptyState>
            )}
            {isMobile && (
              <p className="home__tip">
                <Hand size={14} /> Tip: long-press any app for details, pinning and quick actions.
              </p>
            )}
          </section>

          {discover.length > 0 && (
            <section className="section">
              <div className="section-head">
                <h2 className="section-title">
                  <Sparkles size={18} className="accent-ink" /> Discover <span className="count">{discover.length}</span>
                </h2>
                <Link to="/apps?access=locked" className="btn btn--sm btn--ghost">
                  See all <ArrowRight />
                </Link>
              </div>
              <p className="text-sm muted" style={{ margin: '-6px 0 16px' }}>
                Apps outside your role — request time-boxed access in a couple of taps.
              </p>
              <AppGrid items={discover.slice(0, isMobile ? 8 : 4)} variant={variant} />
            </section>
          )}
        </div>

        {widgets.length > 0 && (
          <aside className="home__rail" aria-label="Widgets">
            {widgets.map((id) => (
              <div key={id} className="home__widget">
                {WIDGETS[id]()}
              </div>
            ))}
          </aside>
        )}
      </div>
    </div>
  );
}
