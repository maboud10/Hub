import { useMemo, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router';
import { Download, Hourglass, KeyRound, LockKeyhole, UserCog, UserX, Users } from 'lucide-react';
import { NeoEmpty, NeoPanel, NeoSearch, NeoTabs } from '@/components/neo';
import { useHub } from '@/store/hub';
import { useClearance, useSessionUser } from '@/store/selectors';
import { useNow } from '@/hooks/useNow';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { toast } from '@/store/toast';
import { Avatar, ClearanceBadge, RoleChip, Switch } from '@/components/ui/primitives';
import { SUPER_ADMIN_ROLE_ID } from '@/data/roles';
import { clearanceOf, isGrantActive } from '@/lib/rbac';
import { downloadCsv } from '@/lib/csv';
import { pluralize, relativeTime, todayKey } from '@/lib/format';
import { cx } from '@/lib/cx';
import type { Grant, Role, User } from '@/types';
import { useAdminChrome } from './chrome';
import { ConfirmModal, isExpiringSoon, Tip, useDisclosure } from './shared';
import { UserSheet } from './UserSheet';

type StatusFilter = 'all' | 'active' | 'inactive';
type GrantFilter = 'all' | 'any' | 'expiring' | 'permanent';

const parseStatus = (v: string | null): StatusFilter => (v === 'active' || v === 'inactive' ? v : 'all');
const parseGrants = (v: string | null): GrantFilter => (v === 'any' || v === 'expiring' || v === 'permanent' ? v : 'all');

interface Row {
  user: User;
  clearance: number;
  roles: Role[];
  live: Grant[];
  expiring: number;
  permanent: number;
}

export function UsersTab() {
  const now = useNow(60_000);
  const me = useSessionUser();
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  const myClearance = useClearance();
  const isMobile = useIsMobile();
  const [params] = useSearchParams();
  const [q, setQ] = useState(() => params.get('q') ?? '');
  const [roleId, setRoleId] = useState(() => params.get('role') ?? 'all');
  const [status, setStatus] = useState<StatusFilter>(() => parseStatus(params.get('status')));
  const [grantFilter, setGrantFilter] = useState<GrantFilter>(() => parseGrants(params.get('grants')));
  const sheet = useDisclosure<string>();
  const deactivate = useDisclosure<string>();

  const roleMap = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const sortedRoles = useMemo(() => [...roles].sort((a, b) => b.clearance - a.clearance || a.name.localeCompare(b.name)), [roles]);

  const rows = useMemo<Row[]>(
    () =>
      users.map((user) => {
        const live = user.grants.filter((g) => isGrantActive(g, now));
        return {
          user,
          clearance: clearanceOf(user, roles),
          roles: user.roleIds
            .map((id) => roleMap.get(id))
            .filter((r): r is Role => !!r)
            .sort((a, b) => b.clearance - a.clearance),
          live,
          expiring: live.filter((g) => isExpiringSoon(g, now)).length,
          permanent: live.filter((g) => g.expiresAt === null).length,
        };
      }),
    [users, roles, roleMap, now],
  );

  const activeAdmins = useMemo(() => users.filter((u) => u.active && u.roleIds.includes(SUPER_ADMIN_ROLE_ID)).length, [users]);

  // Faceted filtering: status counts reflect every other active filter.
  const preStatus = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(({ user, live, expiring, permanent }) => {
      if (roleId !== 'all' && !user.roleIds.includes(roleId)) return false;
      if (grantFilter === 'any' && !live.length) return false;
      if (grantFilter === 'expiring' && !expiring) return false;
      if (grantFilter === 'permanent' && !permanent) return false;
      if (!needle) return true;
      return [user.name, user.email, user.title, user.department, user.location].some((f) => f.toLowerCase().includes(needle));
    });
  }, [rows, q, roleId, grantFilter]);

  const statusCounts = useMemo(
    () => ({
      all: preStatus.length,
      active: preStatus.filter((r) => r.user.active).length,
      inactive: preStatus.filter((r) => !r.user.active).length,
    }),
    [preStatus],
  );

  const filtered = useMemo(
    () =>
      preStatus
        .filter((r) => status === 'all' || (status === 'active' ? r.user.active : !r.user.active))
        .sort((a, b) => a.user.name.localeCompare(b.user.name)),
    [preStatus, status],
  );

  const hasFilters = !!q.trim() || roleId !== 'all' || status !== 'all' || grantFilter !== 'all';
  const clearFilters = () => {
    setQ('');
    setRoleId('all');
    setStatus('all');
    setGrantFilter('all');
  };

  const statusLock = (row: Row): string | null => {
    if (row.user.id === me?.id) return 'You can’t deactivate your own account';
    if (row.clearance > myClearance) return `Higher clearance (L${row.clearance}) than yours (L${myClearance})`;
    if (row.user.active && row.user.roleIds.includes(SUPER_ADMIN_ROLE_ID) && activeAdmins <= 1) return 'Last active System Admin';
    return null;
  };

  const onStatus = (user: User, next: boolean) => {
    if (!next) {
      deactivate.show(user.id);
      return;
    }
    toast.result(useHub.getState().setUserActive(user.id, true));
  };

  /** Access-review export of the people currently in view. */
  const exportRoster = () => {
    if (!filtered.length) return;
    downloadCsv(
      `nexus-access-roster-${todayKey()}.csv`,
      filtered.map(({ user, clearance, roles: rs, live, expiring, permanent }) => ({
        name: user.name,
        email: user.email,
        title: user.title,
        department: user.department,
        location: user.location,
        status: user.active ? 'active' : 'deactivated',
        roles: rs.map((r) => r.name).join('; '),
        clearance: `L${clearance}`,
        direct_grants: live.length,
        expiring_7d: expiring,
        permanent_grants: permanent,
        last_active: user.lastActiveAt ? new Date(user.lastActiveAt).toISOString() : '',
      })),
    );
    toast.success(`Exported ${pluralize(filtered.length, 'person', 'people')}`, hasFilters ? 'Only people matching your filters were included.' : 'Full access roster for your review.');
  };

  useAdminChrome({
    toolbar: (
      <>
        <NeoTabs<StatusFilter>
          label="Account status"
          value={status}
          onChange={setStatus}
          items={[
            { value: 'all', label: 'All', count: statusCounts.all },
            { value: 'active', label: 'Active', count: statusCounts.active },
            { value: 'inactive', label: 'Deactivated', count: statusCounts.inactive },
          ]}
        />
        <NeoSearch value={q} onChange={setQ} placeholder="Search name, email, title, department…" size="sm" label="Search people" className="adm-tool-search" />
        <select className="neo-select neo-select--sm adm-tool-select" value={roleId} onChange={(e) => setRoleId(e.target.value)} aria-label="Filter by role">
          <option value="all">All roles</option>
          {sortedRoles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} · L{r.clearance}
            </option>
          ))}
        </select>
        <select
          className="neo-select neo-select--sm adm-tool-select"
          value={grantFilter}
          onChange={(e) => setGrantFilter(parseGrants(e.target.value))}
          aria-label="Filter by direct grants"
        >
          <option value="all">Any grants</option>
          <option value="any">Has direct grants</option>
          <option value="expiring">Expiring ≤ 7 days</option>
          <option value="permanent">Permanent grants</option>
        </select>
        <div className="grow" />
        <span className="adm-toolbar-hint" aria-live="polite">
          {pluralize(filtered.length, 'person', 'people')}
        </span>
        {hasFilters && (
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={clearFilters}>
            Clear
          </button>
        )}
      </>
    ),
    actions: (
      <button type="button" className="neo-btn neo-btn--soft" onClick={exportRoster} disabled={!filtered.length}>
        <Download /> <span className="neo-btn__label">Export roster</span>
      </button>
    ),
  });

  const pendingDeactivation = deactivate.value ? rows.find((r) => r.user.id === deactivate.value) : undefined;

  return (
    <div className="adm-view">
      {filtered.length === 0 ? (
        <NeoPanel>
          <NeoEmpty
            icon={<Users />}
            title="No people match"
            action={
              hasFilters ? (
                <button type="button" className="neo-btn neo-btn--soft" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : undefined
            }
          >
            Try a different search or loosen the filters.
          </NeoEmpty>
        </NeoPanel>
      ) : isMobile ? (
        <ul className="adm-user-cards neo-stagger">
          {filtered.map((row, i) => {
            const lock = statusLock(row);
            const { user } = row;
            return (
              <li key={user.id} className={cx('neo-card adm-user-card', !user.active && 'is-inactive')} style={{ '--i': i } as CSSProperties}>
                <div className="adm-user-card__top">
                  <Avatar user={user} size={44} presence />
                  <div className="grow">
                    <div className="adm-user-name">
                      <span className="truncate">{user.name}</span>
                      {user.id === me?.id && <YouChip />}
                    </div>
                    <div className="adm-cell-sub truncate">{user.email}</div>
                    <div className="adm-cell-sub truncate">
                      {user.title} · {user.department}
                    </div>
                  </div>
                  <StatusSwitch user={user} lock={lock} onChange={onStatus} />
                </div>
                <div className="row row--wrap adm-gap-6">
                  {row.roles.length ? row.roles.map((r) => <RoleChip key={r.id} name={r.name} color={r.color} />) : <NoRoleChip />}
                </div>
                <div className="adm-user-card__meta">
                  <ClearanceBadge level={row.clearance} compact />
                  <GrantsCell row={row} />
                  <span className="adm-cell-sub">{user.lastActiveAt ? `Active ${relativeTime(user.lastActiveAt, now)}` : 'Never active'}</span>
                </div>
                {lock && (
                  <div className="adm-cell-sub adm-lock-line">
                    <LockKeyhole aria-hidden="true" /> {lock}
                  </div>
                )}
                <button type="button" className="neo-btn neo-btn--soft neo-btn--block" onClick={() => sheet.show(user.id)}>
                  <UserCog aria-hidden="true" /> Manage access
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="neo-table-wrap adm-table-wrap">
          <table className="neo-table adm-table">
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Department</th>
                <th scope="col">Roles</th>
                <th scope="col">Clearance</th>
                <th scope="col">Direct grants</th>
                <th scope="col">Status</th>
                <th scope="col">Last active</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const { user } = row;
                const lock = statusLock(row);
                return (
                  <tr key={user.id} className={cx(!user.active && 'is-inactive')}>
                    <td>
                      <div className="adm-user-cell">
                        <Avatar user={user} size={34} presence />
                        <div className="grow">
                          <div className="adm-user-name">
                            <span className="truncate">{user.name}</span>
                            {user.id === me?.id && <YouChip />}
                          </div>
                          <div className="adm-cell-sub truncate">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="adm-dim">{user.department}</div>
                      <div className="adm-cell-sub truncate adm-cell-title">{user.title}</div>
                    </td>
                    <td>
                      <div className="adm-chip-cell">{row.roles.length ? row.roles.map((r) => <RoleChip key={r.id} name={r.name} color={r.color} />) : <NoRoleChip />}</div>
                    </td>
                    <td>
                      <ClearanceBadge level={row.clearance} compact />
                    </td>
                    <td>
                      <GrantsCell row={row} />
                    </td>
                    <td>
                      <div className="row adm-gap-6">
                        <StatusSwitch user={user} lock={lock} onChange={onStatus} />
                        <span className={cx('adm-cell-sub', !user.active && 'adm-text-danger')}>{user.active ? 'Active' : 'Off'}</span>
                      </div>
                    </td>
                    <td className="adm-cell-sub adm-nowrap">{user.lastActiveAt ? relativeTime(user.lastActiveAt, now) : '—'}</td>
                    <td className="adm-cell-actions">
                      <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => sheet.show(user.id)} aria-label={`Manage ${user.name}`}>
                        <UserCog aria-hidden="true" /> Manage
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <UserSheet userId={sheet.value} open={sheet.open} onClose={sheet.hide} />

      <ConfirmModal
        open={deactivate.open}
        onClose={deactivate.hide}
        title={pendingDeactivation ? `Deactivate ${pendingDeactivation.user.name}?` : 'Deactivate account?'}
        subtitle="Access is cut immediately across every app."
        icon={UserX}
        confirmLabel="Deactivate"
        onConfirm={() => {
          if (pendingDeactivation) toast.result(useHub.getState().setUserActive(pendingDeactivation.user.id, false));
          deactivate.hide();
        }}
      >
        {pendingDeactivation && (
          <div className="stack">
            <p className="muted">
              They won’t be able to sign in and lose all effective permissions. Roles
              {pendingDeactivation.live.length ? ` and ${pluralize(pendingDeactivation.live.length, 'direct grant')}` : ''} stay on file
              so you can reactivate later.
            </p>
            {pendingDeactivation.live.length > 0 && (
              <p className="text-sm adm-text-warning">Tip: revoke grants that shouldn’t survive offboarding from the Manage panel.</p>
            )}
          </div>
        )}
      </ConfirmModal>
    </div>
  );
}

function YouChip() {
  return (
    <span className="neo-chip neo-chip--sm" data-tone="app">
      You
    </span>
  );
}

function NoRoleChip() {
  return (
    <span className="neo-chip" data-tone="danger">
      No role
    </span>
  );
}

function StatusSwitch({ user, lock, onChange }: { user: User; lock: string | null; onChange: (u: User, next: boolean) => void }) {
  return (
    <Tip tip={lock}>
      <Switch
        checked={user.active}
        disabled={!!lock}
        onChange={(v) => onChange(user, v)}
        label={`${user.name}: account ${user.active ? 'active' : 'deactivated'}${lock ? ` — ${lock}` : ''}`}
      />
    </Tip>
  );
}

function GrantsCell({ row }: { row: Row }) {
  if (!row.live.length) return <span className="adm-cell-sub">—</span>;
  return (
    <span className="row adm-gap-6">
      <span className="adm-grant-count" title={`${row.live.length} active direct grants`}>
        <KeyRound aria-hidden="true" />
        {row.live.length}
      </span>
      {row.expiring > 0 && (
        <span className="neo-chip neo-chip--sm" data-tone="warning" title={`${row.expiring} expiring within 7 days`}>
          <Hourglass aria-hidden="true" />
          Expiring
        </span>
      )}
      {row.permanent > 0 && (
        <span className="neo-chip neo-chip--sm" data-tone="slate" title={`${row.permanent} never expire`}>
          Permanent
        </span>
      )}
    </span>
  );
}
