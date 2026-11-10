import { useMemo, useState, type CSSProperties } from 'react';
import {
  Building2,
  Check,
  Fingerprint,
  LayoutGrid,
  LockKeyhole,
  Newspaper,
  Search,
  ShieldHalf,
  TriangleAlert,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useHub } from '@/store/hub';
import { useClearance, usePermissions } from '@/store/selectors';
import { useNow } from '@/hooks/useNow';
import { toast } from '@/store/toast';
import { NeoEmpty, NeoPanel, NeoSearch } from '@/components/neo';
import { AppIcon, Avatar } from '@/components/ui/primitives';
import { APP_CATEGORIES } from '@/data/apps';
import { buildPermissionCatalog, hasPermission, matchesPermission } from '@/lib/rbac';
import { pluralize } from '@/lib/format';
import { cx } from '@/lib/cx';
import type { PermissionCategory, PermissionDef, Role } from '@/types';
import { ConfirmModal, EMPTY_PERMS, FilterChip, usePermsByUser, useDisclosure } from './shared';

type CatFilter = 'all' | PermissionCategory;
type CellMode = 'ok' | 'locked' | 'inherited' | 'above' | 'unheld';

const HUB_CATEGORIES: Exclude<PermissionCategory, 'Apps'>[] = ['Workspace', 'People', 'Talent', 'Content', 'Governance'];
const CATEGORY_ICON: Record<PermissionCategory, LucideIcon> = {
  Workspace: Building2,
  People: Users,
  Talent: UserPlus,
  Content: Newspaper,
  Governance: ShieldHalf,
  Apps: LayoutGrid,
};

interface Group {
  key: string;
  label: string;
  Icon: LucideIcon;
  rows: PermissionDef[];
}

/** Role × permission matrix. Every toggle goes through `setRolePermission` (which re-checks policy). */
export function PermissionMatrix() {
  const roles = useHub((s) => s.roles);
  const apps = useHub((s) => s.apps);
  const users = useHub((s) => s.users);
  const myPerms = usePermissions();
  const myClearance = useClearance();
  const now = useNow(60_000);
  const permsByUser = usePermsByUser(now);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<CatFilter>('all');
  const [sensitiveOnly, setSensitiveOnly] = useState(false);
  const confirm = useDisclosure<{ roleId: string; permId: string }>();

  const catalog = useMemo(() => buildPermissionCatalog(apps), [apps]);
  const appMap = useMemo(() => new Map(apps.map((a) => [a.id, a])), [apps]);
  const columns = useMemo(() => [...roles].sort((a, b) => b.clearance - a.clearance || a.name.localeCompare(b.name)), [roles]);

  const catCounts = useMemo(() => {
    const counts: Record<string, number> = { all: catalog.length };
    for (const p of catalog) counts[p.category] = (counts[p.category] ?? 0) + 1;
    return counts;
  }, [catalog]);
  const sensitiveCount = useMemo(() => catalog.filter((p) => p.sensitive).length, [catalog]);

  const groups = useMemo<Group[]>(() => {
    const needle = q.trim().toLowerCase();
    const match = (p: PermissionDef) =>
      (cat === 'all' || p.category === cat) &&
      (!sensitiveOnly || !!p.sensitive) &&
      (!needle || p.label.toLowerCase().includes(needle) || p.id.toLowerCase().includes(needle) || p.description.toLowerCase().includes(needle));
    const out: Group[] = [];
    for (const c of HUB_CATEGORIES) {
      const rows = catalog.filter((p) => p.category === c && match(p));
      if (rows.length) out.push({ key: c, label: c, Icon: CATEGORY_ICON[c], rows });
    }
    for (const ac of APP_CATEGORIES) {
      const rows = catalog
        .filter((p) => p.category === 'Apps' && appMap.get(p.id.slice(4))?.category === ac && match(p))
        .sort((a, b) => a.label.localeCompare(b.label));
      if (rows.length) out.push({ key: `apps-${ac}`, label: `Apps · ${ac}`, Icon: CATEGORY_ICON.Apps, rows });
    }
    return out;
  }, [catalog, appMap, q, cat, sensitiveOnly]);
  const rowCount = groups.reduce((n, g) => n + g.rows.length, 0);

  const cellState = (role: Role, p: PermissionDef): { on: boolean; mode: CellMode; reason?: string } => {
    if (role.locked) return { on: true, mode: 'locked', reason: `${role.name} is locked with full access (∗)` };
    const exact = role.permissions.includes(p.id);
    if (!exact && role.permissions.some((g) => matchesPermission(g, p.id))) return { on: true, mode: 'inherited', reason: 'Granted via a wildcard permission' };
    if (role.clearance > myClearance) return { on: exact, mode: 'above', reason: `${role.name} (L${role.clearance}) is above your clearance (L${myClearance})` };
    if (!exact && !hasPermission(myPerms, p.id)) return { on: false, mode: 'unheld', reason: 'You can’t grant a permission you don’t hold' };
    return { on: exact, mode: 'ok' };
  };

  const onCell = (role: Role, p: PermissionDef) => {
    const st = cellState(role, p);
    if (st.mode !== 'ok') {
      toast.info(st.reason ?? 'This cell can’t be changed');
      return;
    }
    if (!st.on && p.sensitive) {
      confirm.show({ roleId: role.id, permId: p.id });
      return;
    }
    toast.result(useHub.getState().setRolePermission(role.id, p.id, !st.on));
  };

  // ── sensitive confirmation ──
  const pendingRole = confirm.value ? roles.find((r) => r.id === confirm.value?.roleId) : undefined;
  const pendingPerm = confirm.value ? catalog.find((p) => p.id === confirm.value?.permId) : undefined;
  const impact = useMemo(() => {
    if (!pendingRole || !pendingPerm) return { members: 0, active: 0, newly: [] as typeof users };
    const members = users.filter((u) => u.roleIds.includes(pendingRole.id));
    const active = members.filter((u) => u.active);
    const newly = active.filter((u) => !hasPermission(permsByUser.get(u.id) ?? EMPTY_PERMS, pendingPerm.id));
    return { members: members.length, active: active.length, newly };
  }, [pendingRole, pendingPerm, users, permsByUser]);

  return (
    <NeoPanel
      flush
      hud="Policy"
      title="Permission matrix"
      icon={<Fingerprint />}
      className="adm-matrix-panel"
      actions={<span className="adm-toolbar-hint adm-hide-sm">Click a cell to grant or revoke · sensitive ones ask first</span>}
    >
      <div className="adm-matrix-tools">
        <NeoSearch value={q} onChange={setQ} placeholder="Search permissions or apps…" size="sm" label="Search permissions" className="adm-tool-search" />
        <div className="adm-chips" role="group" aria-label="Permission category">
          <FilterChip active={cat === 'all'} count={catCounts.all} onClick={() => setCat('all')}>
            All
          </FilterChip>
          {[...HUB_CATEGORIES, 'Apps' as const].map((c) => (
            <FilterChip key={c} active={cat === c} count={catCounts[c] ?? 0} icon={CATEGORY_ICON[c]} onClick={() => setCat(c)}>
              {c}
            </FilterChip>
          ))}
          <FilterChip active={sensitiveOnly} count={sensitiveCount} icon={TriangleAlert} onClick={() => setSensitiveOnly((v) => !v)}>
            Sensitive
          </FilterChip>
        </div>
      </div>

      {rowCount === 0 ? (
        <NeoEmpty compact icon={<Search />} title="No permissions match">
          Try another search term or category.
        </NeoEmpty>
      ) : (
        <div className="adm-matrix-wrap" tabIndex={0} role="region" aria-label="Permission matrix (scrolls horizontally)">
          <table className="adm-matrix">
            <thead>
              <tr>
                <th scope="col" className="adm-mx-corner">
                  <span className="adm-micro">Permission</span>
                  <span className="adm-micro faint">
                    {rowCount} × {columns.length}
                  </span>
                </th>
                {columns.map((role) => (
                  <th key={role.id} scope="col" className="adm-mx-role" style={{ '--role': role.color } as CSSProperties}>
                    <span className="adm-mx-role__bar" aria-hidden="true" />
                    <span className="adm-mx-role__name" title={role.name}>
                      {role.name}
                    </span>
                    <span className="adm-mx-role__lvl">
                      L{role.clearance}
                      {role.locked && ' · ∗'}
                      {!role.locked && role.clearance > myClearance && <LockKeyhole aria-label="Above your clearance" />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.key}>
                <tr className="adm-mx-group">
                  <th scope="colgroup" colSpan={columns.length + 1}>
                    <span className="adm-mx-group__label">
                      <g.Icon aria-hidden="true" />
                      {g.label}
                      <span className="count">{g.rows.length}</span>
                    </span>
                  </th>
                </tr>
                {g.rows.map((p) => {
                  const app = p.category === 'Apps' ? appMap.get(p.id.slice(4)) : undefined;
                  return (
                    <tr key={p.id}>
                      <th scope="row" className="adm-mx-perm">
                        <span className="adm-mx-perm__inner">
                          {app && <AppIcon app={app} size={24} />}
                          <span className="grow adm-mx-perm__text">
                            <span className="adm-mx-perm__label">
                              <span className="truncate" title={p.description}>
                                {p.label}
                              </span>
                              {p.sensitive && (
                                <span className="adm-sensitive" data-tip="Sensitive · confirmation required" role="img" aria-label="Sensitive permission">
                                  <TriangleAlert aria-hidden="true" />
                                </span>
                              )}
                              {app && !app.enabled && <span className="tag">Off</span>}
                            </span>
                            <code className="adm-perm-id">{p.id}</code>
                          </span>
                        </span>
                      </th>
                      {columns.map((role) => {
                        const st = cellState(role, p);
                        return (
                          <td key={role.id} className="adm-mx-cell" style={{ '--role': role.color } as CSSProperties}>
                            <button
                              type="button"
                              className={cx('adm-cell', `is-${st.mode}`)}
                              aria-pressed={st.on}
                              aria-disabled={st.mode !== 'ok' || undefined}
                              aria-label={`Grant ${p.label} to ${role.name}${st.reason ? ` — ${st.reason}` : ''}`}
                              data-tip={st.reason ?? `${st.on ? 'Revoke from' : 'Grant to'} ${role.name}`}
                              onClick={() => onCell(role, p)}
                            >
                              {st.mode === 'locked' ? (
                                <span className="adm-cell__star" aria-hidden="true">
                                  ∗
                                </span>
                              ) : st.on ? (
                                <Check aria-hidden="true" />
                              ) : st.mode === 'above' || st.mode === 'unheld' ? (
                                <LockKeyhole aria-hidden="true" className="adm-cell__lock" />
                              ) : null}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}

      <ul className="adm-matrix-legend" aria-label="Legend">
        <li>
          <span className="adm-cell adm-cell--legend is-on" aria-hidden="true">
            <Check />
          </span>
          Granted
        </li>
        <li>
          <span className="adm-cell adm-cell--legend is-on is-locked" aria-hidden="true">
            <span className="adm-cell__star">∗</span>
          </span>
          Full access (locked)
        </li>
        <li>
          <span className="adm-cell adm-cell--legend is-on is-inherited" aria-hidden="true">
            <Check />
          </span>
          Via wildcard
        </li>
        <li>
          <span className="adm-cell adm-cell--legend is-unheld" aria-hidden="true">
            <LockKeyhole className="adm-cell__lock" />
          </span>
          Above clearance / not held
        </li>
        <li>
          <span className="adm-sensitive" aria-hidden="true">
            <TriangleAlert />
          </span>
          Sensitive
        </li>
      </ul>

      <ConfirmModal
        open={confirm.open}
        onClose={confirm.hide}
        tone="warning"
        icon={TriangleAlert}
        title={pendingRole && pendingPerm ? `Grant “${pendingPerm.label}” to ${pendingRole.name}?` : 'Grant sensitive permission?'}
        subtitle="This is a sensitive permission."
        confirmLabel="Grant permission"
        onConfirm={() => {
          if (pendingRole && pendingPerm) toast.result(useHub.getState().setRolePermission(pendingRole.id, pendingPerm.id, true));
          confirm.hide();
        }}
      >
        {pendingRole && pendingPerm && (
          <div className="stack">
            <p className="muted">{pendingPerm.description}</p>
            <div className="adm-impact">
              <span className="adm-impact__value">{impact.newly.length}</span>
              <span className="text-sm">
                {impact.newly.length === 1 ? 'person' : 'people'} will newly gain this capability.{' '}
                <span className="faint">
                  {pluralize(impact.members, 'member')} hold {pendingRole.name}
                  {impact.members !== impact.active ? ` (${impact.active} active)` : ''}.
                </span>
              </span>
            </div>
            {impact.newly.length > 0 && (
              <div className="row row--wrap adm-gap-6">
                <span className="avatar-stack">
                  {impact.newly.slice(0, 8).map((u) => (
                    <Avatar key={u.id} user={u} size={28} />
                  ))}
                </span>
                <span className="text-xs faint">
                  {impact.newly
                    .slice(0, 3)
                    .map((u) => u.name)
                    .join(', ')}
                  {impact.newly.length > 3 ? ` +${impact.newly.length - 3} more` : ''}
                </span>
              </div>
            )}
            <p className="text-xs faint">Recorded in the audit log as a warning-level change.</p>
          </div>
        )}
      </ConfirmModal>
    </NeoPanel>
  );
}
