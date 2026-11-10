/**
 * Home — Spotlight (natural-language search with smart filter chips, live highlighted results,
 * keyboard navigation), Jump back in (large generated thumbnails), Suggested for you,
 * Shared with you, access-request banner, storage ring by type and quick-create tiles.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowRight, CalendarClock, ChevronDown, CornerDownLeft, FilePlus2, FolderOpen, FolderPlus, HardDrive, KeyRound, MapPin, Presentation, Search, Sheet, Sparkles, Tag, Upload, User, Users, X } from 'lucide-react';
import { Avatar } from '@/components/ui/primitives';
import { CountUp, NeoHead, NeoMenu, NeoStage, Ring, type MenuEntry } from '@/components/neo';
import { useHotkeys } from '@/hooks/useHotkeys';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import type { Item, ItemKind } from '@/drive/types';
import { itemRoute, useDrive } from '@/drive/store';
import { KIND_COLOR, KIND_NAME, LABELS, LABEL_NAME, RANK, formatBytes } from '@/drive/meta';
import { directShareFor, driveAccess, driveUsage, isTrashed, locationOf } from '@/drive/access';
import { EXAMPLE_QUERIES, KIND_QUERY, hasFilters, matchItem, parseQuery, removeChip, withToken, type Match } from '@/drive/query';
import { storageByKind, suggestionsFor } from '@/drive/nova';
import { personalDriveId } from '@/drive/seed';
import { overlayOpen, useDriveUI } from './ctx';
import { Hl, KindTile, LabelChip, Thumb } from './bits';
import { NewMenu } from './Views';

/* ---------------- Spotlight ---------------- */

function FilterChip({ icon, label, active, items }: { icon: ReactNode; label: string; active: boolean; items: MenuEntry[] }) {
  return (
    <NeoMenu
      label={label}
      items={items}
      width={240}
      placement="bottom-start"
      trigger={(p) => (
        <button {...p} type="button" className={cx('dv-fchip', active && 'is-on')}>
          {icon}
          <span>{label}</span>
          <ChevronDown />
        </button>
      )}
    />
  );
}

function Spotlight({ query, setQuery }: { query: string; setQuery: (q: string) => void }) {
  const ui = useDriveUI();
  const navigate = useNavigate();
  const { ctx, me } = ui.engine;
  const input = useRef<HTMLInputElement>(null);
  const [hi, setHi] = useState(0);
  const shared = useMemo(() => ctx.drives.filter((d) => d.kind === 'shared' && driveAccess(ctx, me, d) !== 'none'), [ctx, me]);
  const parsed = useMemo(
    () => parseQuery(query, { users: ctx.users.map((u) => ({ id: u.id, name: u.name })), drives: shared.map((d) => ({ id: d.id, name: d.name })), me: me.id, now: ctx.now }),
    [query, ctx, shared, me.id],
  );
  const active = hasFilters(parsed);
  const results = useMemo(() => {
    if (!active) return [] as { item: Item; m: Match }[];
    const out: { item: Item; m: Match }[] = [];
    for (const i of ctx.items) {
      if (isTrashed(ctx, i)) continue;
      const a = ui.engine.access(i);
      if (!a.discoverable) continue;
      const m = matchItem(
        {
          name: i.name,
          kind: i.kind,
          ownerId: i.ownerId,
          label: i.label,
          updatedAt: i.updatedAt,
          driveId: i.driveId,
          size: i.size,
          extra: [...i.tags, i.description ?? '', ctx.user.get(i.ownerId)?.name ?? ''],
          sharedWithMe: !!directShareFor(ctx, me, a),
          starred: i.starredBy.includes(me.id),
        },
        parsed,
      );
      if (m) out.push({ item: i, m });
    }
    return out.sort((a, b) => b.m.score - a.m.score).slice(0, 40);
  }, [active, ctx, parsed, me, ui.engine]);
  useEffect(() => setHi(0), [query]);

  useHotkeys({
    s: (e) => {
      if (overlayOpen()) return;
      e.preventDefault();
      input.current?.focus();
    },
  });

  const open = (i: Item, folder = false) => navigate(folder ? (i.parentId ? `/drive/d/${i.driveId}/${i.parentId}` : `/drive/d/${i.driveId}`) : itemRoute(i));
  const tok = (key: string, value: string | null) => {
    setQuery(withToken(query, key, value));
    requestAnimationFrame(() => input.current?.focus());
  };
  const has = (key: string) => query.toLowerCase().includes(`${key}:`);
  const kinds: ItemKind[] = ['doc', 'sheet', 'slides', 'pdf', 'image', 'video', 'code', 'archive', 'folder'];
  const people = [me.id, ...ctx.users.filter((u) => u.active && u.id !== me.id).map((u) => u.id)].slice(0, 14);

  return (
    <section className="dv-spot" aria-label="Spotlight search">
      <div className={cx('dv-spot__field', active && 'is-active')}>
        <Search className="dv-spot__icon" />
        <input
          ref={input}
          className="dv-spot__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search everything — try “pdfs from daniel last month”"
          aria-label="Search files"
          data-qa="spotlight"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHi((h) => Math.min(results.length - 1, h + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHi((h) => Math.max(0, h - 1));
            } else if (e.key === 'Enter' && results[hi]) {
              e.preventDefault();
              open(results[hi].item, e.metaKey || e.ctrlKey);
            } else if (e.key === 'Escape' && query) {
              e.stopPropagation();
              setQuery('');
            }
          }}
        />
        {query ? (
          <button type="button" className="neo-iconbtn" onClick={() => setQuery('')} aria-label="Clear search">
            <X />
          </button>
        ) : (
          <kbd className="kbd dv-spot__kbd">S</kbd>
        )}
      </div>
      <div className="dv-spot__chips">
        <FilterChip icon={<FilePlus2 />} label="Type" active={parsed.kinds.length > 0} items={[...kinds.map((k) => ({ label: k === 'folder' ? 'Folders' : KIND_NAME[k], checked: parsed.kinds.includes(k), onSelect: () => tok('type', KIND_QUERY[k]) })), { kind: 'sep' as const }, { label: 'Any type', onSelect: () => tok('type', null), disabled: !has('type') }]} />
        <FilterChip
          icon={<User />}
          label="Owner"
          active={parsed.owners.length > 0}
          items={[
            ...people.map((id) => {
              const u = ctx.user.get(id);
              return { label: id === me.id ? 'Me' : (u?.name ?? id), icon: u ? <Avatar user={u} size={18} /> : undefined, checked: parsed.owners.includes(id), onSelect: () => tok('owner', id === me.id ? 'me' : (u?.name.split(' ')[0].toLowerCase() ?? id)) };
            }),
            { kind: 'sep' as const },
            { label: 'Anyone', onSelect: () => tok('owner', null), disabled: !has('owner') },
          ]}
        />
        <FilterChip
          icon={<CalendarClock />}
          label={parsed.modified?.label ?? 'Modified'}
          active={!!parsed.modified}
          items={[
            { label: 'Last 24 hours', onSelect: () => tok('modified', '1d') },
            { label: 'Last 7 days', onSelect: () => tok('modified', '7d') },
            { label: 'Last 30 days', onSelect: () => tok('modified', '30d') },
            { label: 'Last 90 days', onSelect: () => tok('modified', '90d') },
            { kind: 'sep' as const },
            { label: 'Any time', onSelect: () => tok('modified', null), disabled: !has('modified') },
          ]}
        />
        <FilterChip icon={<Tag />} label="Label" active={parsed.labels.length > 0} items={[...LABELS.map((l) => ({ label: LABEL_NAME[l], checked: parsed.labels.includes(l), onSelect: () => tok('label', l) })), { kind: 'sep' as const }, { label: 'Any label', onSelect: () => tok('label', null), disabled: !has('label') }]} />
        <FilterChip
          icon={<MapPin />}
          label="Location"
          active={parsed.driveIds.length > 0}
          items={[
            { label: 'My Drive', icon: <HardDrive />, checked: parsed.driveIds.includes(personalDriveId(me.id)), onSelect: () => tok('in', 'my') },
            ...shared.map((d) => ({ label: d.name, checked: parsed.driveIds.includes(d.id), onSelect: () => tok('in', d.id) })),
            { kind: 'sep' as const },
            { label: 'Anywhere', onSelect: () => tok('in', null), disabled: !has('in') },
          ]}
        />
        <button type="button" className={cx('dv-fchip', parsed.sharedWithMe && 'is-on')} onClick={() => tok('is', parsed.sharedWithMe ? null : 'shared')}>
          <Users /> <span>Shared with me</span>
        </button>
      </div>
      {active && (
        <div className="dv-spot__panel neo-rise" role="region" aria-live="polite" aria-label="Search results">
          <div className="dv-spot__understood">
            <span className="neo-hud neo-hud--tint">
              <Sparkles /> Understood
            </span>
            {parsed.chips.map((c, i) => (
              <button key={`${c.kind}-${i}`} type="button" className="dv-token" data-kind={c.kind} onClick={() => setQuery(removeChip(parsed, c))} aria-label={`Remove filter ${c.label}`}>
                {c.label}
                <X />
              </button>
            ))}
            {parsed.terms.length > 0 && <span className="dv-token is-text">“{parsed.terms.join(' ')}”</span>}
            <span className="grow" />
            <span className="neo-faint text-xs">
              {results.length} result{results.length === 1 ? '' : 's'}
            </span>
          </div>
          {results.length === 0 ? (
            <div className="dv-spot__empty">
              <Search />
              <div>
                <div className="neo-title">No matches you can open</div>
                <div className="neo-faint text-sm">Try fewer filters — or the file isn’t shared with you yet.</div>
              </div>
            </div>
          ) : (
            <ul className="dv-results" role="listbox" aria-label="Results">
              {results.map(({ item, m }, i) => {
                const owner = ctx.user.get(item.ownerId);
                return (
                  <li key={item.id}>
                    <button type="button" role="option" aria-selected={i === hi} className={cx('dv-result', i === hi && 'is-hi')} onMouseEnter={() => setHi(i)} onClick={() => open(item)} style={{ '--i': i } as CSSProperties}>
                      <KindTile item={item} size={34} />
                      <span className="dv-result__main">
                        <span className="dv-result__name truncate">
                          <Hl text={item.name} hits={m.hits} />
                        </span>
                        <span className="dv-result__loc truncate neo-mono">{locationOf(ctx, item, me.id)}</span>
                      </span>
                      <span className="dv-result__owner dv-hide-sm">
                        {owner && <Avatar user={owner} size={20} />}
                        <span className="truncate">{owner?.id === me.id ? 'You' : owner?.name.split(' ')[0]}</span>
                      </span>
                      <span className="dv-result__time neo-faint text-xs dv-hide-sm">{relativeTime(item.updatedAt)}</span>
                      <LabelChip label={item.label} />
                      {i === hi && <CornerDownLeft className="dv-result__enter" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="dv-spot__foot neo-faint text-xs">
            <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> move · <kbd className="kbd">↵</kbd> open · <kbd className="kbd">⌘↵</kbd> open folder · <kbd className="kbd">Esc</kbd> clear
          </div>
        </div>
      )}
      {!query && (
        <div className="dv-spot__try">
          <span className="neo-faint text-xs">Try</span>
          {EXAMPLE_QUERIES.map((q) => (
            <button key={q} type="button" className="dv-try" onClick={() => setQuery(q)}>
              {q}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------------- Home ---------------- */

export function HomeView() {
  const ui = useDriveUI();
  const [sp, setSp] = useSearchParams();
  const { ctx, me } = ui.engine;
  const query = sp.get('q') ?? '';
  const setQuery = (q: string) => {
    const next = new URLSearchParams(sp);
    if (q) next.set('q', q);
    else next.delete('q');
    setSp(next, { replace: true });
  };
  const recents = useDrive((s) => s.recents[me.id]);
  const requests = useDrive((s) => s.requests);

  const jump = useMemo(() => {
    const when = new Map<string, number>();
    for (const r of recents ?? []) when.set(r.id, Math.max(when.get(r.id) ?? 0, r.at));
    for (const i of ctx.items) {
      const mine = i.activity.find((a) => a.by === me.id && (a.verb === 'version' || a.verb === 'created' || a.verb === 'uploaded'));
      if (mine) when.set(i.id, Math.max(when.get(i.id) ?? 0, mine.at));
    }
    return [...when.entries()]
      .map(([id, at]) => ({ item: ctx.item.get(id), at }))
      .filter((x): x is { item: Item; at: number } => !!x.item && x.item.kind !== 'folder' && !isTrashed(ctx, x.item) && ui.engine.access(x.item).level !== 'none')
      .sort((a, b) => b.at - a.at)
      .slice(0, 6);
  }, [recents, ctx, me.id, ui.engine]);

  const suggestions = useMemo(() => suggestionsFor(ctx, me, new Set((recents ?? []).map((r) => r.id)), 5), [ctx, me, recents]);
  const sharedRecent = useMemo(
    () =>
      ctx.items
        .map((i) => {
          if (isTrashed(ctx, i)) return null;
          const s = directShareFor(ctx, me, ui.engine.access(i));
          return s ? { item: i, at: s.at, by: s.by } : null;
        })
        .filter((x): x is { item: Item; at: number; by: string } => !!x)
        .sort((a, b) => b.at - a.at)
        .slice(0, 5),
    [ctx, me, ui.engine],
  );
  const pending = useMemo(
    () =>
      requests.filter((r) => {
        if (r.status !== 'pending' || r.requesterId === me.id) return false;
        const it = ctx.item.get(r.itemId);
        return !!it && RANK[ui.engine.access(it).level] >= RANK.manager;
      }),
    [requests, ctx, me.id, ui.engine],
  );
  const myDrive = ctx.drive.get(personalDriveId(me.id));
  const used = myDrive ? driveUsage(ctx, myDrive.id) : 0;
  const byKind = useMemo(() => storageByKind(ctx, me.id), [ctx, me.id]);
  const ownedTotal = byKind.reduce((s, k) => s + k.bytes, 0);
  const openable = useMemo(() => ctx.items.filter((i) => i.kind !== 'folder' && !isTrashed(ctx, i) && ui.engine.access(i).discoverable).length, [ctx, ui.engine]);
  const spaces = ctx.drives.filter((d) => d.kind === 'shared' && driveAccess(ctx, me, d) !== 'none').length;

  return (
    <NeoStage label="Drive home">
      <NeoHead icon={<FolderOpen />} eyebrow="Holo Vault" title="Home" sub={`${openable} files you can open across ${spaces + 1} spaces`} onToggleSide={ui.toggleSide} actions={<NewMenu />} />
      <div className="neo-body neo-pad dv-home">
        <Spotlight query={query} setQuery={setQuery} />
        {!query && (
          <div className="dv-home__grid neo-stagger">
            {pending.length > 0 && (
              <Link to="/drive/requests" className="dv-reqcta" style={{ '--i': 0 } as CSSProperties} data-qa="home-requests">
                <span className="dv-reqcta__icon">
                  <KeyRound />
                </span>
                <span className="grow">
                  <strong>
                    {pending.length} access request{pending.length > 1 ? 's' : ''}
                  </strong>{' '}
                  waiting for you
                  <span className="neo-faint text-sm dv-hide-sm"> · {pending.map((r) => ctx.user.get(r.requesterId)?.name.split(' ')[0]).join(', ')}</span>
                </span>
                <span className="neo-avatars dv-hide-xs">
                  {pending.slice(0, 3).map((r) => {
                    const u = ctx.user.get(r.requesterId);
                    return u ? <Avatar key={r.id} user={u} size={28} /> : null;
                  })}
                </span>
                <ArrowRight />
              </Link>
            )}
            <section className="dv-home__jump" style={{ '--i': 1 } as CSSProperties}>
              <div className="neo-section-head">
                <span className="neo-hud">Jump back in</span>
                <Link to="/drive/recent" className="dv-link text-sm">
                  All recent
                </Link>
              </div>
              {jump.length ? (
                <div className="dv-jump">
                  {jump.map(({ item, at }) => {
                    const owner = ctx.user.get(item.ownerId);
                    return (
                      <Link key={item.id} to={itemRoute(item)} className="dv-jumpcard neo-spot" data-qa="jump">
                        <Thumb item={item} />
                        <span className="dv-jumpcard__body">
                          <span className="dv-jumpcard__name">
                            <KindTile item={item} size={20} />
                            <span className="truncate">{item.name}</span>
                          </span>
                          <span className="dv-jumpcard__meta">
                            {owner && <Avatar user={owner} size={18} />}
                            <span className="truncate">You opened {relativeTime(at)}</span>
                            <LabelChip label={item.label} quiet />
                          </span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="neo-faint text-sm">Files you open show up here.</p>
              )}
            </section>
            <div className="dv-home__cols" style={{ '--i': 2 } as CSSProperties}>
              <div className="dv-home__main">
                <section className="neo-card dv-home__card">
                  <div className="neo-section-head">
                    <span className="neo-hud">Suggested for you</span>
                    <span className="neo-faint text-xs">Based on activity in your spaces</span>
                  </div>
                  {suggestions.length ? (
                    <ul className="dv-sugg">
                      {suggestions.map((s) => {
                        const by = s.by ? ctx.user.get(s.by) : undefined;
                        return (
                          <li key={s.item.id}>
                            <Link to={itemRoute(s.item)} className="dv-sugg__row">
                              <KindTile item={s.item} size={34} />
                              <span className="grow" style={{ minWidth: 0 }}>
                                <span className="truncate dv-sugg__name">{s.item.name}</span>
                                <span className="truncate neo-faint text-xs">{locationOf(ctx, s.item, me.id)}</span>
                              </span>
                              <span className="dv-sugg__why">
                                {by && <Avatar user={by} size={18} />}
                                <span>{s.reason}</span>
                                <span className="neo-faint">· {relativeTime(s.at)}</span>
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="neo-faint text-sm">Nothing new — you’re all caught up.</p>
                  )}
                </section>
                <section className="neo-card dv-home__card">
                  <div className="neo-section-head">
                    <span className="neo-hud">Shared with you recently</span>
                    <Link to="/drive/shared" className="dv-link text-sm">
                      See all
                    </Link>
                  </div>
                  {sharedRecent.length ? (
                    <ul className="dv-sugg">
                      {sharedRecent.map(({ item, at, by }) => {
                        const u = ctx.user.get(by);
                        return (
                          <li key={item.id}>
                            <Link to={itemRoute(item)} className="dv-sugg__row">
                              <KindTile item={item} size={34} />
                              <span className="grow" style={{ minWidth: 0 }}>
                                <span className="truncate dv-sugg__name">{item.name}</span>
                                <span className="truncate neo-faint text-xs">
                                  {u?.name} shared {relativeTime(at)}
                                </span>
                              </span>
                              <LabelChip label={item.label} />
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="neo-faint text-sm">Nothing shared with you directly yet.</p>
                  )}
                </section>
              </div>
              <aside className="dv-home__side">
                <section className="neo-card dv-home__card">
                  <div className="neo-section-head">
                    <span className="neo-hud">Create</span>
                  </div>
                  <div className="dv-create">
                    <button type="button" className="dv-create__tile" style={{ '--k': KIND_COLOR.doc } as CSSProperties} onClick={() => ui.create('doc')}>
                      <FilePlus2 /> Doc
                    </button>
                    <button type="button" className="dv-create__tile" style={{ '--k': KIND_COLOR.sheet } as CSSProperties} onClick={() => ui.create('sheet')}>
                      <Sheet /> Sheet
                    </button>
                    <button type="button" className="dv-create__tile" style={{ '--k': KIND_COLOR.slides } as CSSProperties} onClick={() => ui.create('slides')}>
                      <Presentation /> Slides
                    </button>
                    <button type="button" className="dv-create__tile" style={{ '--k': KIND_COLOR.folder } as CSSProperties} onClick={() => ui.create('folder')}>
                      <FolderPlus /> Folder
                    </button>
                    <button type="button" className="dv-create__tile is-wide" style={{ '--k': '#f97316' } as CSSProperties} onClick={() => ui.pickFiles()} data-qa="home-upload">
                      <Upload /> Upload files <kbd className="kbd">U</kbd>
                    </button>
                  </div>
                </section>
                <section className="neo-card dv-home__card">
                  <div className="neo-section-head">
                    <span className="neo-hud">Your storage</span>
                    <Link to="/drive/my" className="dv-link text-sm">
                      My Drive
                    </Link>
                  </div>
                  <div className="dv-storage">
                    <Ring value={myDrive ? used / myDrive.quota : 0} size={92} stroke={9} label="Personal storage used">
                      <span className="dv-storage__pct">
                        <CountUp value={myDrive ? (used / myDrive.quota) * 100 : 0} format={(n) => `${n < 10 ? n.toFixed(1) : Math.round(n)}%`} />
                      </span>
                    </Ring>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="neo-num dv-storage__used">{formatBytes(used)}</div>
                      <div className="neo-faint text-xs">of {formatBytes(myDrive?.quota ?? 0)} in My Drive</div>
                      <div className="neo-faint text-xs">{formatBytes(ownedTotal)} owned across all drives</div>
                    </div>
                  </div>
                  <div className="dv-kinds">
                    {byKind.slice(0, 5).map((k) => (
                      <div key={k.kind} className="dv-kinds__row">
                        <i style={{ background: KIND_COLOR[k.kind] }} />
                        <span className="grow">{KIND_NAME[k.kind]}</span>
                        <span className="neo-mono neo-faint text-xs">{formatBytes(k.bytes)}</span>
                        <span className="dv-kinds__bar">
                          <b style={{ width: `${Math.max(3, (k.bytes / Math.max(1, ownedTotal)) * 100)}%`, background: KIND_COLOR[k.kind] }} />
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              </aside>
            </div>
          </div>
        )}
      </div>
    </NeoStage>
  );
}
