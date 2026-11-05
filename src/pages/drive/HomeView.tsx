/**
 * Drive home: greeting, pending-decisions callout, "Suggested for you" with a
 * one-line reason, a Recent strip, Starred and quick access to your drives.
 */
import { useMemo, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, Clock, HardDrive, Inbox, MessageSquare, MoreHorizontal, Pencil, Sparkles, Star, TrendingUp, type LucideIcon } from 'lucide-react';
import { EmptyState } from '@/components/ui/primitives';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import { firstName, greeting, relativeTime } from '@/lib/format';
import { KIND_META, formatBytes } from '@/drive/constants';
import { folderLink, itemLink } from '@/drive/store';
import { useAccessRequests, useDriveRootRole, useRecentItems, useSharedWithMe, useStarredItems, useSuggestedItems, useVisibleDrives, type ItemWithRole } from '@/drive/selectors';
import { useItemActions } from './actions';
import { ItemList, KindIcon, KindTile, RolePill, SensitivityPill, StorageBar, UserChip, anchorBelow, useLocationOf, useUsersById } from './shared';

const WEEK = 7 * 86_400_000;

function whySuggested(row: ItemWithRole, me: string | null, name: (id: string) => string): { icon: LucideIcon; text: string } {
  const it = row.item;
  const unresolved = it.comments.filter((c) => !c.resolved).length;
  const opens = me ? (it.openedBy[me] ?? 0) : 0;
  if (it.modifiedAt > Date.now() - WEEK && it.modifiedBy !== me) return { icon: Pencil, text: `Edited ${relativeTime(it.modifiedAt)} by ${name(it.modifiedBy)}` };
  if (opens >= 3) return { icon: TrendingUp, text: `You open this often (${opens} times)` };
  if (unresolved) return { icon: MessageSquare, text: `${unresolved} unresolved comment${unresolved === 1 ? '' : 's'}` };
  if (me && it.starredBy.includes(me)) return { icon: Star, text: 'Starred by you' };
  return { icon: Clock, text: `Modified ${relativeTime(it.modifiedAt)}` };
}

export function HomeView() {
  const me = useSessionUser();
  const meId = useHub((s) => s.sessionUserId);
  const users = useUsersById();
  const navigate = useNavigate();
  const suggested = useSuggestedItems(6);
  const recent = useRecentItems(10);
  const starred = useStarredItems();
  const shared = useSharedWithMe();
  const drives = useVisibleDrives();
  const { toDecide, mine } = useAccessRequests();
  const actions = useItemActions();
  const locationOf = useLocationOf();
  const name = (id: string) => users.get(id)?.name.split(' ')[0] ?? 'someone';
  const pendingMine = mine.filter((m) => m.request.status === 'pending').length;
  const starredRows = useMemo(() => [...starred].sort((a, b) => b.item.modifiedAt - a.item.modifiedAt).slice(0, 6), [starred]);

  return (
    <div className="dr-home">
      <header className="dr-home__hero">
        <div className="dr-home__glow" aria-hidden="true" />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="eyebrow dr-eyebrow">Helix Drive · Home</div>
          <h1 className="dr-home__title">
            {greeting()}
            {me ? `, ${firstName(me.name)}` : ''}.
          </h1>
          <p className="page-sub">Files follow your roles: departments, Hub roles and permissions decide what you see — sensitivity labels decide how far it can travel.</p>
        </div>
        <div className="dr-home__stats">
          <Link to="/drive/shared" className="dr-stat">
            <b>{shared.length}</b>
            <span>shared with you</span>
          </Link>
          <Link to="/drive/starred" className="dr-stat">
            <b>{starred.length}</b>
            <span>starred</span>
          </Link>
          <Link to="/drive/requests" className="dr-stat">
            <b>{toDecide.length}</b>
            <span>to decide</span>
          </Link>
        </div>
      </header>

      {toDecide.length > 0 && (
        <Link to="/drive/requests" className="dr-callout">
          <Inbox />
          <div className="grow" style={{ minWidth: 0 }}>
            <b>
              {toDecide.length} access request{toDecide.length === 1 ? '' : 's'} waiting for you
            </b>
            <div className="text-sm muted truncate">
              {toDecide
                .slice(0, 3)
                .map((r) => `${name(r.request.requesterId)} → ${r.item?.name ?? 'file'}`)
                .join(' · ')}
            </div>
          </div>
          <span className="btn btn--sm dr-btn-amber">
            Review <ArrowRight />
          </span>
        </Link>
      )}
      {pendingMine > 0 && toDecide.length === 0 && (
        <div className="dr-notice dr-notice--info">
          <Clock /> You have {pendingMine} pending access request{pendingMine === 1 ? '' : 's'}.{' '}
          <Link to="/drive/requests" style={{ textDecoration: 'underline' }}>
            Track them
          </Link>
        </div>
      )}

      <section className="dr-section">
        <div className="dr-section__head">
          <h2>
            <Sparkles className="dr-ico-amber" /> Suggested for you
          </h2>
          <span className="text-xs muted">Based on what you open, star and what teammates edited this week</span>
        </div>
        {suggested.length === 0 ? (
          <EmptyState icon={<Sparkles />} title="Nothing to suggest yet">
            Open and star a few files — we’ll surface what matters here.
          </EmptyState>
        ) : (
          <div className="dr-suggest">
            {suggested.map((row) => {
              const why = whySuggested(row, meId, name);
              const Why = why.icon;
              const loc = locationOf(row.item);
              return (
                <article
                  key={row.item.id}
                  className="dr-suggest-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(itemLink(row.item.id))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') navigate(itemLink(row.item.id));
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    actions.openMenu(row, { x: e.clientX, y: e.clientY });
                  }}
                >
                  <div className="dr-suggest-card__head">
                    <KindTile kind={row.item.kind} size={38} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="dr-suggest-card__name truncate">{row.item.name}</div>
                      <div className="text-xs muted truncate">{loc.label}</div>
                    </div>
                    <button
                      type="button"
                      className="icon-btn icon-btn--sm"
                      aria-label={`More actions for ${row.item.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        actions.openMenu(row, anchorBelow(e.currentTarget));
                      }}
                    >
                      <MoreHorizontal />
                    </button>
                  </div>
                  <div className="dr-suggest-card__why">
                    <Why /> {why.text}
                  </div>
                  <div className="dr-suggest-card__foot">
                    <SensitivityPill sensitivity={row.item.sensitivity} compact />
                    <RolePill role={row.role} />
                    <span className="spacer" />
                    <UserChip userId={row.item.ownerId} size={18} showName={false} />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="dr-section">
        <div className="dr-section__head">
          <h2>
            <Clock /> Recent
          </h2>
          <Link to="/drive/recent" className="dr-more">
            All recent <ArrowRight />
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm muted">Files you open will show up here.</p>
        ) : (
          <div className="dr-recent-strip">
            {recent.map((row) => (
              <Link key={row.item.id} to={itemLink(row.item.id)} className="dr-mini" title={row.item.name}>
                <KindIcon kind={row.item.kind} size={20} />
                <span className="dr-mini__name truncate">{row.item.name}</span>
                <span className="text-xs muted truncate">
                  {KIND_META[row.item.kind].label} · {relativeTime(row.item.modifiedAt)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="dr-home__cols">
        <section className="dr-section" style={{ minWidth: 0 }}>
          <div className="dr-section__head">
            <h2>
              <Star /> Starred
            </h2>
            <Link to="/drive/starred" className="dr-more">
              All starred <ArrowRight />
            </Link>
          </div>
          {starredRows.length === 0 ? (
            <p className="text-sm muted">Star files to pin them here.</p>
          ) : (
            <ItemList rows={starredRows} mode="list" onOpen={actions.open} onMenu={actions.openMenu} onStar={actions.star} showLocation />
          )}
        </section>

        <section className="dr-section" style={{ minWidth: 0 }}>
          <div className="dr-section__head">
            <h2>
              <HardDrive /> Quick access
            </h2>
            <span className="text-xs muted">{drives.length} drives</span>
          </div>
          <div className="dr-drive-cards">
            {drives.map((d) => (
              <DriveCard key={d.drive.id} driveId={d.drive.id} name={d.drive.name} icon={d.drive.icon} color={d.drive.color} kind={d.drive.kind} used={d.usedBytes} quota={d.drive.quotaBytes} itemCount={d.itemCount} description={d.drive.description} />
            ))}
          </div>
        </section>
      </div>
      {actions.overlays}
    </div>
  );
}

function DriveCard({ driveId, name, icon, color, kind, used, quota, itemCount, description }: { driveId: string; name: string; icon: string; color: string; kind: string; used: number; quota: number; itemCount: number; description: string }) {
  const role = useDriveRootRole(driveId);
  return (
    <Link to={folderLink(driveId)} className="dr-drive-card" style={{ '--c': color } as CSSProperties}>
      <span className="dr-drive-emoji dr-drive-emoji--lg">{icon}</span>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 8, minWidth: 0 }}>
          <b className="truncate">{name}</b>
          <span className="tag">{kind}</span>
        </div>
        <div className="text-xs muted truncate">{description}</div>
        <StorageBar used={used} quota={quota} color={color} compact className="dr-drive-card__bar" />
        <div className="row row--between text-xs muted">
          <span>
            {itemCount} item{itemCount === 1 ? '' : 's'} · {formatBytes(used)}
          </span>
          <RolePill role={role} />
        </div>
      </div>
    </Link>
  );
}
