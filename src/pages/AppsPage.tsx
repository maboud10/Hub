import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { LayoutGrid, LayoutList, LockKeyhole, Search, SearchX, X } from 'lucide-react';
import type { AppCategory, AppWithAccess } from '@/types';
import { useHub } from '@/store/hub';
import { useAppAccess, usePrefs } from '@/store/selectors';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { APP_CATEGORIES } from '@/data/apps';
import { fuzzyScore } from '@/lib/fuzzy';
import { AppGrid, type TileVariant } from '@/components/apps/AppTile';
import { EmptyState, Segmented } from '@/components/ui/primitives';

type AccessFilter = 'all' | 'granted' | 'locked';
type Sort = 'recommended' | 'az' | 'used' | 'new';

export function AppsPage() {
  const apps = useAppAccess();
  const prefs = usePrefs();
  const updatePrefs = useHub((s) => s.updatePrefs);
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<AppCategory | 'all'>('all');
  const [sort, setSort] = useState<Sort>('recommended');
  const access = (params.get('access') as AccessFilter) || 'all';
  const setAccess = (v: AccessFilter) => setParams(v === 'all' ? {} : { access: v }, { replace: true });

  const grantedCount = apps.filter((a) => a.access === 'granted').length;
  const requestable = apps.filter((a) => a.access === 'locked' || a.access === 'pending').length;

  const filtered = useMemo(() => {
    let list: AppWithAccess[] = apps.filter((a) =>
      access === 'all' ? true : access === 'granted' ? a.access === 'granted' : a.access === 'locked' || a.access === 'pending',
    );
    if (category !== 'all') list = list.filter((a) => a.app.category === category);
    const q = query.trim();
    if (q) {
      return list
        .map((a) => ({ a, s: fuzzyScore(q, a.app.name, [a.app.tagline, a.app.category, a.app.description, ...a.app.keywords]) }))
        .filter((x) => x.s)
        .sort((x, y) => y.s!.score - x.s!.score)
        .map((x) => x.a);
    }
    const rank = (a: AppWithAccess) => (a.access === 'granted' ? 0 : a.access === 'pending' ? 1 : a.access === 'locked' ? 2 : 3);
    const sorted = [...list];
    if (sort === 'az') sorted.sort((a, b) => a.app.name.localeCompare(b.app.name));
    else if (sort === 'used') sorted.sort((a, b) => (prefs.launchCounts[b.app.id] ?? 0) - (prefs.launchCounts[a.app.id] ?? 0) || rank(a) - rank(b));
    else if (sort === 'new') sorted.sort((a, b) => b.app.addedAt - a.app.addedAt);
    else sorted.sort((a, b) => rank(a) - rank(b));
    return sorted;
  }, [apps, access, category, query, sort, prefs.launchCounts]);

  const grouped = sort === 'recommended' && !query.trim() && category === 'all';
  const variant: TileVariant = prefs.tileView === 'list' ? 'row' : isMobile ? 'icon' : 'card';
  const catCount = (c: AppCategory) => apps.filter((a) => a.app.category === c).length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">App directory</div>
          <h1 className="page-title">Every tool, one launchpad</h1>
          <p className="page-sub">
            <strong className="accent-ink">{grantedCount}</strong> apps available to you
            {requestable > 0 && (
              <>
                {' '}
                · <strong>{requestable}</strong> more on request <LockKeyhole size={13} style={{ display: 'inline', verticalAlign: '-1px' }} />
              </>
            )}
          </p>
        </div>
      </div>

      <div className="dir-controls">
        <div className="input-wrap dir-controls__search">
          <Search />
          <input
            className="input"
            placeholder="Search apps, tasks or keywords — try “vacation” or “password”"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search apps"
          />
          {query && (
            <button className="icon-btn icon-btn--sm input-trail" onClick={() => setQuery('')} aria-label="Clear search">
              <X />
            </button>
          )}
        </div>
        <Segmented
          label="Access filter"
          value={access}
          onChange={setAccess}
          options={[
            { value: 'all', label: 'All' },
            { value: 'granted', label: 'Mine' },
            { value: 'locked', label: 'Requestable' },
          ]}
        />
        <select className="select dir-controls__sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort apps">
          <option value="recommended">Recommended</option>
          <option value="az">A → Z</option>
          <option value="used">Most used</option>
          <option value="new">Recently added</option>
        </select>
        <Segmented
          label="Layout"
          value={prefs.tileView}
          onChange={(v) => updatePrefs({ tileView: v })}
          options={[
            { value: 'grid', label: '', icon: <LayoutGrid />, title: 'Grid' },
            { value: 'list', label: '', icon: <LayoutList />, title: 'List' },
          ]}
        />
      </div>

      <div className="chips" style={{ margin: '16px 0 22px' }} role="tablist" aria-label="Categories">
        <button role="tab" aria-selected={category === 'all'} className={'chip' + (category === 'all' ? ' is-active' : '')} onClick={() => setCategory('all')}>
          All <span className="count">{apps.length}</span>
        </button>
        {APP_CATEGORIES.filter((c) => catCount(c) > 0).map((c) => (
          <button key={c} role="tab" aria-selected={category === c} className={'chip' + (category === c ? ' is-active' : '')} onClick={() => setCategory(c)}>
            {c} <span className="count">{catCount(c)}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<SearchX />}
          title="No apps match"
          action={
            <button className="btn btn--sm" onClick={() => (setQuery(''), setCategory('all'), setAccess('all'))}>
              Reset filters
            </button>
          }
        >
          Try a different keyword — search also understands tasks like “expense”, “room” or “payslip”.
        </EmptyState>
      ) : grouped ? (
        <div className="stack stack--lg">
          {APP_CATEGORIES.map((c) => {
            const items = filtered.filter((a) => a.app.category === c);
            if (!items.length) return null;
            const mine = items.filter((a) => a.access === 'granted').length;
            return (
              <section key={c} className="dir-group">
                <div className="section-head">
                  <h2 className="section-title">
                    {c} <span className="count">{mine}/{items.length} accessible</span>
                  </h2>
                </div>
                <AppGrid items={items} variant={variant} />
              </section>
            );
          })}
        </div>
      ) : (
        <AppGrid key={`${query}-${category}-${sort}-${access}`} items={filtered} variant={variant} />
      )}
    </div>
  );
}
