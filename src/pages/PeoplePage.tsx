import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { LayoutGrid, LayoutList, RotateCcw, Search, SearchX, X } from 'lucide-react';
import type { Department, Presence, User } from '@/types';
import { useHub } from '@/store/hub';
import { useCan, useSessionUser } from '@/store/selectors';
import { useUI } from '@/store/ui';
import { toast } from '@/store/toast';
import { useLaunchApp } from '@/components/apps/useLaunchApp';
import { EmptyState, PRESENCE_LABEL, Segmented } from '@/components/ui/primitives';
import { useNow } from '@/hooks/useNow';
import { firstName, formatTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { PersonCard } from './people/PersonCard';
import { ProfileSheet } from './people/ProfileSheet';
import { PRESENCE_ORDER, isVisibleTo, matchesTokens, searchTokens, tzOffsetMinutes } from './people/peopleUtils';

type View = 'grid' | 'list';
type PresenceFilter = 'all' | Presence;

const VIEW_KEY = 'nexus.people.view';

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

const EMPTY_COUNTS = (): Record<Presence, number> => ({ online: 0, focus: 0, meeting: 0, away: 0, offline: 0 });

export function PeoplePage() {
  const users = useHub((s) => s.users);
  const me = useSessionUser();
  const canManage = useCan('hub.users.manage');
  const canKudos = useCan('hub.kudos.give');
  const openKudos = useUI((s) => s.openKudos);
  const launch = useLaunchApp();
  const navigate = useNavigate();
  const now = useNow(60_000);
  const [params, setParams] = useSearchParams();

  const [query, setQuery] = useState(() => params.get('q') ?? '');
  const [dept, setDept] = useState<Department | 'all'>('all');
  const [presence, setPresence] = useState<PresenceFilter>('all');
  const [view, setViewState] = useState<View>(readView);
  const searchRef = useRef<HTMLInputElement>(null);

  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private mode — keep in memory only */
    }
  };

  // ── Population the viewer is allowed to see (deactivated accounts → user managers only) ──
  const visible = useMemo(
    () =>
      users
        .filter((u) => isVisibleTo(u, canManage))
        .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)),
    [users, canManage],
  );

  const totals = useMemo(() => {
    const byPresence = EMPTY_COUNTS();
    let active = 0;
    for (const u of visible) {
      if (!u.active) continue;
      active += 1;
      byPresence[u.presence] += 1;
    }
    return { active, inactive: visible.length - active, byPresence };
  }, [visible]);

  // ── Faceted filtering: each facet's counts respect the *other* filters ──
  const tokens = useMemo(() => searchTokens(query), [query]);
  const bySearch = useMemo(() => visible.filter((u) => matchesTokens(u, tokens)), [visible, tokens]);

  const deptFacets = useMemo(() => {
    const counts = new Map<Department, number>();
    for (const u of visible) counts.set(u.department, 0);
    let all = 0;
    for (const u of bySearch) {
      if (presence !== 'all' && u.presence !== presence) continue;
      counts.set(u.department, (counts.get(u.department) ?? 0) + 1);
      all += 1;
    }
    return { all, list: [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])) };
  }, [visible, bySearch, presence]);

  const presenceFacets = useMemo(() => {
    const counts = EMPTY_COUNTS();
    let all = 0;
    for (const u of bySearch) {
      if (dept !== 'all' && u.department !== dept) continue;
      counts[u.presence] += 1;
      all += 1;
    }
    return { all, counts };
  }, [bySearch, dept]);

  const results = useMemo(
    () => bySearch.filter((u) => (dept === 'all' || u.department === dept) && (presence === 'all' || u.presence === presence)),
    [bySearch, dept, presence],
  );

  const filtersActive = tokens.length > 0 || dept !== 'all' || presence !== 'all';
  const clearFilters = () => {
    setQuery('');
    setDept('all');
    setPresence('all');
    searchRef.current?.focus();
  };

  const viewerOffset = useMemo(() => tzOffsetMinutes(me?.timezone, now), [me?.timezone, now]);

  // ── Profile sheet ⇄ ?u=<id> (deep-linkable, back button closes it) ──
  const uParam = params.get('u');
  const target = uParam ? (visible.find((u) => u.id === uParam) ?? null) : null;
  const [displayId, setDisplayId] = useState<string | null>(target?.id ?? null);
  if (target && target.id !== displayId) setDisplayId(target.id);

  /** Id of the entry *we* pushed onto the history stack, so closing can pop it instead of stacking another. */
  const pushedRef = useRef<string | null>(null);
  const warnedRef = useRef<string | null>(null);

  const writeU = useCallback(
    (id: string | null, replace: boolean) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set('u', id);
          else next.delete('u');
          return next;
        },
        { replace, preventScrollReset: true },
      ),
    [setParams],
  );

  useEffect(() => {
    if (!uParam || target) return;
    if (warnedRef.current !== uParam) {
      warnedRef.current = uParam;
      toast.warning('That profile isn’t available', 'It may have been deactivated or removed.');
    }
    writeU(null, true);
  }, [uParam, target, writeU]);

  const openProfile = useCallback(
    (id: string) => {
      if (uParam) {
        // Already open → switch in place without growing the history stack.
        if (pushedRef.current === uParam) pushedRef.current = id;
        writeU(id, true);
      } else {
        pushedRef.current = id;
        writeU(id, false);
      }
    },
    [uParam, writeU],
  );

  // Every overlay listens for Esc on `window`; remember when Esc was pressed (capture phase runs first)
  // so the profile only defers to dialogs stacked on top for *Escape*, never for its X button or scrim.
  const escAt = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') escAt.current = performance.now();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const closeProfile = useCallback(() => {
    if (performance.now() - escAt.current < 120) {
      const ui = useUI.getState();
      const stacked = ui.kudos.open || !!ui.appSheetId || !!ui.launch || ui.paletteOpen || ui.shortcutsOpen || ui.personaSwitcherOpen || ui.notificationsOpen;
      if (stacked) return;
    }
    if (pushedRef.current && pushedRef.current === uParam) {
      pushedRef.current = null;
      navigate(-1);
    } else {
      writeU(null, true);
    }
  }, [uParam, navigate, writeU]);

  const onMessage = useCallback((u: User) => launch('chat', `Message ${firstName(u.name)}`), [launch]);
  const onKudos = useCallback((u: User) => openKudos(u.id), [openKudos]);
  const onEditSelf = useCallback(() => navigate('/settings#profile'), [navigate]);

  const handlers = { onOpen: openProfile, onMessage, onKudos, onEditSelf };
  const activeTotal = Math.max(1, totals.active);

  return (
    <div className="page ppl-page">
      <header className="page-head ppl-head">
        <div className="ppl-head__intro">
          <div className="eyebrow">Directory</div>
          <h1 className="page-title">People</h1>
          <p className="page-sub ppl-head__counts">
            <span>
              <strong>{totals.active}</strong> colleagues
            </span>
            <span className="faint" aria-hidden="true">
              ·
            </span>
            <span className="ppl-online">
              <span className="dot dot--online dot--pulse" aria-hidden="true" />
              <strong>{totals.byPresence.online}</strong> online now
            </span>
            {canManage && totals.inactive > 0 && (
              <>
                <span className="faint" aria-hidden="true">
                  ·
                </span>
                <span className="faint">{totals.inactive} deactivated</span>
              </>
            )}
          </p>
        </div>

        <div
          className="ppl-spectrum glass"
          role="img"
          aria-label={`Live presence: ${PRESENCE_ORDER.map((p) => `${totals.byPresence[p]} ${PRESENCE_LABEL[p].toLowerCase()}`).join(', ')}`}
        >
          <div className="ppl-spectrum__head">
            <span className="stat-label">Live presence</span>
            <span className="mono faint text-xs">{formatTime(now, me?.timezone)}</span>
          </div>
          <div className="ppl-spectrum__bar">
            {PRESENCE_ORDER.map((p) =>
              totals.byPresence[p] > 0 ? (
                <span
                  key={p}
                  className={`ppl-spectrum__seg dot--${p}`}
                  style={{ flexGrow: totals.byPresence[p], '--share': totals.byPresence[p] / activeTotal } as CSSProperties}
                  title={`${PRESENCE_LABEL[p]}: ${totals.byPresence[p]}`}
                />
              ) : null,
            )}
          </div>
          <div className="ppl-spectrum__legend">
            {PRESENCE_ORDER.map((p) => (
              <span key={p} className={cx('ppl-spectrum__item', totals.byPresence[p] === 0 && 'is-zero')} title={PRESENCE_LABEL[p]}>
                <span className={`dot dot--${p}`} />
                <span className="mono">{totals.byPresence[p]}</span>
                <span className="ppl-spectrum__name">{PRESENCE_LABEL[p]}</span>
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* ── Toolbar ── */}
      <div className="ppl-toolbar">
        <div className="input-wrap ppl-search">
          <Search aria-hidden="true" />
          <input
            ref={searchRef}
            className="input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.stopPropagation();
                setQuery('');
              }
            }}
            placeholder="Search name, title, skill, location…"
            aria-label="Search people"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button type="button" className="icon-btn input-trail" onClick={() => setQuery('')} aria-label="Clear search">
              <X />
            </button>
          )}
        </div>
        <Segmented<View>
          label="Layout"
          value={view}
          onChange={setView}
          options={[
            { value: 'grid', label: <span className="ppl-seg-label">Grid</span>, icon: <LayoutGrid />, title: 'Grid view' },
            { value: 'list', label: <span className="ppl-seg-label">List</span>, icon: <LayoutList />, title: 'List view' },
          ]}
        />
      </div>

      <div className="ppl-filters">
        <div className="ppl-filter">
          <span className="ppl-filter__label" id="ppl-dept-label">
            Team
          </span>
          <div className="chips" role="group" aria-labelledby="ppl-dept-label">
            <button type="button" className={cx('chip', dept === 'all' && 'is-active')} aria-pressed={dept === 'all'} onClick={() => setDept('all')}>
              All <span className="count">{deptFacets.all}</span>
            </button>
            {deptFacets.list.map(([d, n]) => (
              <button
                key={d}
                type="button"
                className={cx('chip', dept === d && 'is-active', n === 0 && 'ppl-chip--empty')}
                aria-pressed={dept === d}
                onClick={() => setDept(dept === d ? 'all' : d)}
              >
                {d} <span className="count">{n}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="ppl-filter">
          <span className="ppl-filter__label" id="ppl-presence-label">
            Status
          </span>
          <div className="chips" role="group" aria-labelledby="ppl-presence-label">
            <button
              type="button"
              className={cx('chip', presence === 'all' && 'is-active')}
              aria-pressed={presence === 'all'}
              onClick={() => setPresence('all')}
            >
              Anyone <span className="count">{presenceFacets.all}</span>
            </button>
            {PRESENCE_ORDER.map((p) => (
              <button
                key={p}
                type="button"
                className={cx('chip', presence === p && 'is-active', presenceFacets.counts[p] === 0 && 'ppl-chip--empty')}
                aria-pressed={presence === p}
                onClick={() => setPresence(presence === p ? 'all' : p)}
              >
                <span className={`dot dot--${p}`} aria-hidden="true" />
                {PRESENCE_LABEL[p]} <span className="count">{presenceFacets.counts[p]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="ppl-results-head">
        <span className="mono faint text-xs" aria-live="polite">
          {filtersActive ? `${results.length} of ${visible.length} shown` : `${visible.length} people`}
        </span>
        {filtersActive && (
          <button type="button" className="btn btn--ghost btn--sm ppl-clear" onClick={clearFilters}>
            <RotateCcw /> Reset filters
          </button>
        )}
      </div>

      {results.length === 0 ? (
        <div className="card ppl-empty">
          <EmptyState
            icon={<SearchX />}
            title="No one matches that"
            action={
              <button type="button" className="btn" onClick={clearFilters}>
                <RotateCcw /> Clear search &amp; filters
              </button>
            }
          >
            {query ? `Nobody matches “${query.trim()}”` : 'Nobody matches these filters'}
            {' — try a name, a skill like “React”, a city, or a different team.'}
          </EmptyState>
        </div>
      ) : (
        <ul className={cx('stagger', view === 'grid' ? 'grid-auto ppl-grid' : 'ppl-list')} style={{ '--min': '272px' } as CSSProperties}>
          {results.map((u, i) => (
            <li key={u.id} style={{ '--i': i } as CSSProperties}>
              <PersonCard
                user={u}
                variant={view}
                now={now}
                viewerOffset={viewerOffset}
                isSelf={u.id === me?.id}
                canKudos={canKudos}
                {...handlers}
              />
            </li>
          ))}
        </ul>
      )}

      <ProfileSheet
        userId={displayId}
        open={!!target}
        now={now}
        viewerOffset={viewerOffset}
        onClose={closeProfile}
        onSelect={openProfile}
        onMessage={onMessage}
        onKudos={onKudos}
        onEditSelf={onEditSelf}
      />
    </div>
  );
}
