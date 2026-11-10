import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import {
  ChartNoAxesCombined,
  Code,
  Hourglass,
  LayoutGrid,
  LayoutList,
  Lightbulb,
  LockKeyhole,
  MessagesSquare,
  RotateCcw,
  SearchX,
  ShieldCheck,
  SquareKanban,
  UsersRound,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { AppCategory, AppWithAccess } from '@/types';
import { useHub } from '@/store/hub';
import { useAppAccess, useMyRequests, usePrefs } from '@/store/selectors';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { APP_CATEGORIES } from '@/data/apps';
import { fuzzyScore } from '@/lib/fuzzy';
import { AppGrid, type TileVariant } from '@/components/apps/AppTile';
import { NeoBanner, NeoBanners, NeoEmpty, NeoPage, NeoPanel, NeoSearch, NeoTabs } from '@/components/neo';

type AccessFilter = 'all' | 'granted' | 'locked';
type Sort = 'recommended' | 'az' | 'used' | 'new';

const DAY = 86_400_000;

const CATEGORY_ICON: Record<AppCategory, LucideIcon> = {
  Communication: MessagesSquare,
  Productivity: SquareKanban,
  People: UsersRound,
  Finance: Wallet,
  Growth: ChartNoAxesCombined,
  Engineering: Code,
  Operations: Wrench,
  Security: ShieldCheck,
};

const SORT_LABEL: Record<Sort, string> = { recommended: 'Recommended', az: 'A → Z', used: 'Most used', new: 'Recently added' };

/** Task-style prompts — the search understands intents, not just app names. */
const INTENTS: { label: string; q: string }[] = [
  { label: 'Book time off', q: 'vacation' },
  { label: 'Reset a password', q: 'password' },
  { label: 'Claim an expense', q: 'expense' },
  { label: 'Book a room', q: 'room' },
  { label: 'Find my payslip', q: 'payslip' },
];

export function AppsPage() {
  const apps = useAppAccess();
  const prefs = usePrefs();
  const updatePrefs = useHub((s) => s.updatePrefs);
  const requests = useMyRequests();
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<AppCategory | 'all'>('all');
  const [sort, setSort] = useState<Sort>('recommended');
  const raw = params.get('access');
  const access: AccessFilter = raw === 'granted' || raw === 'locked' ? raw : 'all';
  const setAccess = (v: AccessFilter) => setParams(v === 'all' ? {} : { access: v }, { replace: true });

  const grantedCount = apps.filter((a) => a.access === 'granted').length;
  const requestable = apps.filter((a) => a.access === 'locked' || a.access === 'pending').length;
  const pending = requests.filter((r) => r.status === 'pending').length;
  const expiring = apps.filter((a) => a.access === 'granted' && a.expiresAt && a.expiresAt - Date.now() < 7 * DAY);

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

  const q = query.trim();
  const grouped = sort === 'recommended' && !q && category === 'all';
  const variant: TileVariant = prefs.tileView === 'list' ? 'row' : isMobile ? 'icon' : 'card';
  const catCount = (c: AppCategory) => apps.filter((a) => a.app.category === c).length;
  const filtersActive = !!q || category !== 'all' || access !== 'all' || sort !== 'recommended';
  const reset = () => {
    setQuery('');
    setCategory('all');
    setSort('recommended');
    setAccess('all');
  };

  const flatHud = q ? 'Search' : category !== 'all' ? 'Category' : SORT_LABEL[sort];
  const flatTitle = q ? `Matches for “${q}”` : category !== 'all' ? category : access === 'granted' ? 'Your apps' : access === 'locked' ? 'On request' : 'Every app';
  const FlatIcon = category !== 'all' ? CATEGORY_ICON[category] : null;
  const expiringNames = expiring.slice(0, 2).map((a) => a.app.name).join(', ') + (expiring.length > 2 ? ` +${expiring.length - 2}` : '');

  return (
    <NeoPage
      className="apps-page"
      icon={<LayoutGrid />}
      eyebrow="Hub · App catalog"
      title="All apps"
      sub={
        <>
          <b className="neo-tint">{grantedCount}</b> ready for you
          {requestable > 0 && (
            <>
              {' '}
              · <b>{requestable}</b> more on request
            </>
          )}
        </>
      }
      center={
        <NeoSearch
          className="apps-search"
          value={query}
          onChange={setQuery}
          placeholder="Search apps, tasks or keywords — try “vacation”"
          label="Search apps"
        />
      }
      actions={
        <NeoTabs<AccessFilter>
          label="Access filter"
          value={access}
          onChange={setAccess}
          items={[
            { value: 'all', label: 'All', count: apps.length },
            { value: 'granted', label: 'Mine', count: grantedCount },
            { value: 'locked', label: 'Requestable', icon: <LockKeyhole />, count: requestable },
          ]}
        />
      }
      toolbar={
        <>
          <div className="apps-cats" role="group" aria-label="Categories">
            <button
              type="button"
              className="neo-chip"
              data-tone={category === 'all' ? 'app' : 'slate'}
              aria-pressed={category === 'all'}
              onClick={() => setCategory('all')}
            >
              All <span className="apps-cats__n">{apps.length}</span>
            </button>
            {APP_CATEGORIES.filter((c) => catCount(c) > 0).map((c) => {
              const Icon = CATEGORY_ICON[c];
              return (
                <button
                  key={c}
                  type="button"
                  className="neo-chip"
                  data-tone={category === c ? 'app' : 'slate'}
                  aria-pressed={category === c}
                  onClick={() => setCategory(category === c ? 'all' : c)}
                >
                  <Icon aria-hidden="true" /> {c} <span className="apps-cats__n">{catCount(c)}</span>
                </button>
              );
            })}
          </div>
          <div className="apps-tools">
            <select className="neo-select neo-select--sm apps-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort apps">
              {(Object.keys(SORT_LABEL) as Sort[]).map((s) => (
                <option key={s} value={s}>
                  {SORT_LABEL[s]}
                </option>
              ))}
            </select>
            <NeoTabs<'grid' | 'list'>
              label="Layout"
              className="apps-layout"
              value={prefs.tileView}
              onChange={(v) => updatePrefs({ tileView: v })}
              items={[
                { value: 'grid', label: <span className="neo-sr">Grid</span>, icon: <LayoutGrid />, title: 'Grid' },
                { value: 'list', label: <span className="neo-sr">List</span>, icon: <LayoutList />, title: 'List' },
              ]}
            />
          </div>
        </>
      }
    >
      {(pending > 0 || expiring.length > 0) && (
        <NeoBanners>
          {pending > 0 && (
            <NeoBanner tone="warning" icon={<Hourglass />} title={`${pending} access ${pending === 1 ? 'request' : 'requests'} in review`} to="/settings#access" meta="Track in Settings">
              Reviewers are notified — you’ll get a ping the moment there’s a decision.
            </NeoBanner>
          )}
          {expiring.length > 0 && (
            <NeoBanner tone="cyan" icon={<LockKeyhole />} title={`${expiring.length} temporary ${expiring.length === 1 ? 'grant' : 'grants'} ending soon`} to="/settings#access" meta={expiringNames}>
              Request an extension before access lapses.
            </NeoBanner>
          )}
        </NeoBanners>
      )}

      <div className="apps-intents" aria-live="polite">
        {q || filtersActive ? (
          <>
            <span className="neo-hud">
              {filtered.length} {filtered.length === 1 ? 'app' : 'apps'}
              {q ? ` match “${q}”` : ' shown'}
            </span>
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={reset}>
              <RotateCcw /> Reset filters
            </button>
          </>
        ) : (
          <>
            <span className="neo-hud apps-intents__label">
              <Lightbulb aria-hidden="true" /> Try a task
            </span>
            {INTENTS.map((it) => (
              <button key={it.q} type="button" className="neo-suggest" onClick={() => setQuery(it.q)}>
                {it.label}
              </button>
            ))}
          </>
        )}
      </div>

      {filtered.length === 0 ? (
        <NeoPanel>
          <NeoEmpty
            icon={<SearchX />}
            title="No apps match"
            action={
              <button type="button" className="neo-btn neo-btn--soft" onClick={reset}>
                <RotateCcw /> Reset filters
              </button>
            }
          >
            Try a different keyword — search also understands tasks like “expense”, “room” or “payslip”.
          </NeoEmpty>
        </NeoPanel>
      ) : grouped ? (
        <div className="neo-stack">
          {APP_CATEGORIES.map((c) => {
            const items = filtered.filter((a) => a.app.category === c);
            if (!items.length) return null;
            const mine = items.filter((a) => a.access === 'granted').length;
            const Icon = CATEGORY_ICON[c];
            return (
              <CategoryPanel key={c} icon={<Icon />} hud={`${mine}/${items.length} accessible`} title={c} onFocus={() => setCategory(c)}>
                <AppGrid items={items} variant={variant} />
              </CategoryPanel>
            );
          })}
        </div>
      ) : (
        <NeoPanel
          className="apps-panel"
          hud={flatHud}
          title={flatTitle}
          icon={FlatIcon ? <FlatIcon /> : undefined}
          actions={<span className="neo-count">{filtered.length}</span>}
        >
          <AppGrid key={`${query}-${category}-${sort}-${access}`} items={filtered} variant={variant} />
        </NeoPanel>
      )}
    </NeoPage>
  );
}

function CategoryPanel({ icon, hud, title, onFocus, children }: { icon: ReactNode; hud: string; title: string; onFocus: () => void; children: ReactNode }) {
  return (
    <NeoPanel
      className="apps-panel"
      icon={icon}
      hud={hud}
      title={title}
      actions={
        <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={onFocus} aria-label={`Show only ${title}`}>
          Only {title}
        </button>
      }
    >
      {children}
    </NeoPanel>
  );
}
