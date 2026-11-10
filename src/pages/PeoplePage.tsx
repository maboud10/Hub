import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { LayoutGrid, LayoutList, MapPin, RotateCcw, SearchX, UserRound, Users } from 'lucide-react';
import type { Department, Presence, User } from '@/types';
import { useHub } from '@/store/hub';
import { useCan, useSessionUser } from '@/store/selectors';
import { useUI } from '@/store/ui';
import { toast } from '@/store/toast';
import { useLaunchApp } from '@/components/apps/useLaunchApp';
import { PRESENCE_LABEL } from '@/components/ui/primitives';
import { NeoEmpty, NeoPage, NeoPanel, NeoSearch, NeoTabs } from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { firstName, formatTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { PersonCard } from './people/PersonCard';
import { ProfileSheet } from './people/ProfileSheet';
import { DEPARTMENT_ICON, PRESENCE_ORDER, isVisibleTo, matchesTokens, searchTokens, tzOffsetMinutes } from './people/peopleUtils';

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
  const [loc, setLoc] = useState<string>('all');
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
      if (loc !== 'all' && u.location !== loc) continue;
      counts.set(u.department, (counts.get(u.department) ?? 0) + 1);
      all += 1;
    }
    return { all, list: [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])) };
  }, [visible, bySearch, presence, loc]);

  const locFacets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const u of visible) counts.set(u.location, 0);
    let all = 0;
    for (const u of bySearch) {
      if (dept !== 'all' && u.department !== dept) continue;
      if (presence !== 'all' && u.presence !== presence) continue;
      counts.set(u.location, (counts.get(u.location) ?? 0) + 1);
      all += 1;
    }
    return { all, list: [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])) };
  }, [visible, bySearch, dept, presence]);

  const presenceFacets = useMemo(() => {
    const counts = EMPTY_COUNTS();
    let all = 0;
    for (const u of bySearch) {
      if (dept !== 'all' && u.department !== dept) continue;
      if (loc !== 'all' && u.location !== loc) continue;
      counts[u.presence] += 1;
      all += 1;
    }
    return { all, counts };
  }, [bySearch, dept, loc]);

  const results = useMemo(
    () =>
      bySearch.filter(
        (u) =>
          (dept === 'all' || u.department === dept) &&
          (loc === 'all' || u.location === loc) &&
          (presence === 'all' || u.presence === presence),
      ),
    [bySearch, dept, loc, presence],
  );

  const filtersActive = tokens.length > 0 || dept !== 'all' || loc !== 'all' || presence !== 'all';
  const clearFilters = () => {
    setQuery('');
    setDept('all');
    setLoc('all');
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
  const DeptActiveIcon = dept !== 'all' ? DEPARTMENT_ICON[dept] : Users;
  const panelTitle = query.trim()
    ? `Matches for “${query.trim()}”`
    : dept !== 'all'
      ? dept
      : loc !== 'all'
        ? loc
        : presence !== 'all'
          ? `${PRESENCE_LABEL[presence]} now`
          : 'Everyone';

  return (
    <NeoPage
      app="people"
      className="ppl-page"
      icon={<Users />}
      eyebrow="Hub · Directory"
      title="People"
      sub={
        <span className="ppl-head__counts">
          <span>
            <b className="neo-tint">{totals.active}</b> colleagues
          </span>
          <span aria-hidden="true">·</span>
          <span className="ppl-online">
            <span className="dot dot--online dot--pulse" aria-hidden="true" />
            <b>{totals.byPresence.online}</b> online now
          </span>
          {canManage && totals.inactive > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>{totals.inactive} deactivated</span>
            </>
          )}
        </span>
      }
      center={
        <NeoSearch
          className="ppl-search"
          inputRef={searchRef}
          value={query}
          onChange={setQuery}
          placeholder="Search name, title, skill, location…"
          label="Search people"
        />
      }
      actions={
        <>
          {me && (
            <button type="button" className="neo-btn neo-btn--soft" onClick={() => openProfile(me.id)}>
              <UserRound /> <span className="neo-btn__label">My card</span>
            </button>
          )}
          <NeoTabs<View>
            label="Layout"
            className="ppl-layout"
            value={view}
            onChange={setView}
            items={[
              { value: 'grid', label: <span className="neo-sr">Grid</span>, icon: <LayoutGrid />, title: 'Grid view' },
              { value: 'list', label: <span className="neo-sr">List</span>, icon: <LayoutList />, title: 'List view' },
            ]}
          />
        </>
      }
      toolbar={
        <>
          <div className="ppl-toolbar__row">
            <div className="ppl-filter-chips" role="group" aria-label="Departments">
              <button
                type="button"
                className="neo-chip"
                data-tone={dept === 'all' ? 'app' : 'slate'}
                aria-pressed={dept === 'all'}
                onClick={() => setDept('all')}
              >
                All <span className="ppl-chip__n">{deptFacets.all}</span>
              </button>
              {deptFacets.list.map(([d, n]) => {
                const Icon = DEPARTMENT_ICON[d];
                return (
                  <button
                    key={d}
                    type="button"
                    className={cx('neo-chip', n === 0 && dept !== d && 'ppl-chip--empty')}
                    data-tone={dept === d ? 'app' : 'slate'}
                    aria-pressed={dept === d}
                    onClick={() => setDept(dept === d ? 'all' : d)}
                  >
                    <Icon aria-hidden="true" /> {d} <span className="ppl-chip__n">{n}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="ppl-toolbar__row ppl-toolbar__row--sub">
            <div className="ppl-filter-chips" role="group" aria-label="Availability status">
              <button
                type="button"
                className="neo-chip"
                data-tone={presence === 'all' ? 'app' : 'slate'}
                aria-pressed={presence === 'all'}
                onClick={() => setPresence('all')}
              >
                Anyone <span className="ppl-chip__n">{presenceFacets.all}</span>
              </button>
              {PRESENCE_ORDER.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={cx('neo-chip', presenceFacets.counts[p] === 0 && presence !== p && 'ppl-chip--empty')}
                  data-tone={presence === p ? 'app' : 'slate'}
                  aria-pressed={presence === p}
                  onClick={() => setPresence(presence === p ? 'all' : p)}
                >
                  <span className={`dot dot--${p}`} aria-hidden="true" />
                  {PRESENCE_LABEL[p]} <span className="ppl-chip__n">{presenceFacets.counts[p]}</span>
                </button>
              ))}
            </div>
            <div className="ppl-toolbar__tools">
              <div className="ppl-loc-wrap">
                <MapPin aria-hidden="true" />
                <select
                  className="neo-select neo-select--sm ppl-loc-select"
                  value={loc}
                  onChange={(e) => setLoc(e.target.value)}
                  aria-label="Filter by location"
                >
                  <option value="all">All locations ({locFacets.all})</option>
                  {locFacets.list.map(([city, n]) => (
                    <option key={city} value={city}>
                      {city} ({n})
                    </option>
                  ))}
                </select>
              </div>
              {filtersActive && (
                <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs ppl-clear" onClick={clearFilters}>
                  <RotateCcw /> Reset
                </button>
              )}
            </div>
          </div>
        </>
      }
    >
      <div className="neo-stack">
        {/* ── Live presence spectrum strip ── */}
        <section
          className="neo-panel ppl-spectrum"
          aria-label={`Live presence: ${PRESENCE_ORDER.map((p) => `${totals.byPresence[p]} ${PRESENCE_LABEL[p].toLowerCase()}`).join(', ')}`}
        >
          <div className="ppl-spectrum__head">
            <div className="ppl-spectrum__titles">
              <span className="neo-hud neo-hud--tint">Live presence</span>
              <span className="ppl-spectrum__summary">
                <strong>{totals.byPresence.online + totals.byPresence.focus + totals.byPresence.meeting}</strong> active right now across{' '}
                <strong>{locFacets.list.length}</strong> hubs
              </span>
            </div>
            <span className="neo-mono neo-faint text-xs">{formatTime(now, me?.timezone)} local</span>
          </div>
          <div className="ppl-spectrum__bar" role="presentation">
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
              <button
                key={p}
                type="button"
                className={cx('ppl-spectrum__item', totals.byPresence[p] === 0 && 'is-zero', presence === p && 'is-active')}
                aria-pressed={presence === p}
                onClick={() => setPresence(presence === p ? 'all' : p)}
                title={`Filter by ${PRESENCE_LABEL[p]}`}
              >
                <span className={`dot dot--${p}`} />
                <span className="mono">{totals.byPresence[p]}</span>
                <span className="ppl-spectrum__name">{PRESENCE_LABEL[p]}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ── Directory results ── */}
        <NeoPanel
          className="ppl-panel"
          icon={<DeptActiveIcon />}
          hud={filtersActive ? `${results.length} of ${visible.length} shown` : 'Company directory'}
          title={panelTitle}
          actions={
            <div className="ppl-panel__actions">
              {filtersActive && (
                <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={clearFilters}>
                  <RotateCcw /> Reset
                </button>
              )}
              <span className="neo-count">{results.length}</span>
            </div>
          }
        >
          {results.length === 0 ? (
            <NeoEmpty
              icon={<SearchX />}
              title="No one matches that"
              action={
                <button type="button" className="neo-btn neo-btn--soft" onClick={clearFilters}>
                  <RotateCcw /> Clear search &amp; filters
                </button>
              }
            >
              {query ? `Nobody matches “${query.trim()}”` : 'Nobody matches these filters'}
              {' — try a name, a skill like “React”, a city, or a different team.'}
            </NeoEmpty>
          ) : (
            <ul className={cx('neo-stagger', view === 'grid' ? 'neo-grid ppl-grid' : 'ppl-list')} style={{ '--min': '272px' } as CSSProperties}>
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
        </NeoPanel>
      </div>

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
    </NeoPage>
  );
}
