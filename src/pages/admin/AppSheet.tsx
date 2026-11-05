import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { ExternalLink, Hourglass, KeyRound, PenLine, Save, ShieldHalf, Trash2, TriangleAlert, Users, X } from 'lucide-react';
import { useHub } from '@/store/hub';
import { useClearance, usePermissions } from '@/store/selectors';
import { useNow } from '@/hooks/useNow';
import { toast } from '@/store/toast';
import { Sheet } from '@/components/ui/Sheet';
import { AppIcon, Avatar, Switch } from '@/components/ui/primitives';
import { APP_CATEGORIES } from '@/data/apps';
import { appPermissionId } from '@/data/permissions';
import { buildPermissionCatalog, hasPermission, isGrantActive, matchesPermission, rolesGranting, type PermissionSet } from '@/lib/rbac';
import { pluralize, relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import type { AppCategory, HubApp, Role, User } from '@/types';
import type { IconName } from '@/icons';
import { GradientPicker, IconPicker } from './AppDesign';
import { EMPTY_PERMS, InlineConfirm, LockNote, URL_PATTERN, usePermsByUser } from './shared';

const STATUS_LABEL: Record<HubApp['status'], string> = { operational: 'Operational', degraded: 'Degraded', maintenance: 'Maintenance' };

/** Edit drawer for a single app. */
export function AppSheet({ appId, open, onClose }: { appId: string | null; open: boolean; onClose: () => void }) {
  const app = useHub((s) => (appId ? s.apps.find((a) => a.id === appId) : undefined));
  const roles = useHub((s) => s.roles);
  const users = useHub((s) => s.users);
  const myPerms = usePermissions();
  const myClearance = useClearance();
  const now = useNow(60_000);
  const permsByUser = usePermsByUser(now);

  if (!app) return null;
  const canRoles = hasPermission(myPerms, 'hub.roles.manage');

  return (
    <Sheet
      open={open}
      onClose={onClose}
      width={560}
      className="adm-overlay adm-app-sheet"
      label={`Edit ${app.name}`}
      header={
        <div className="adm-sheet-head" style={{ '--c1': app.gradient[0], '--c2': app.gradient[1] } as CSSProperties}>
          <AppIcon app={app} size={54} />
          <div className="grow">
            <h2 className="sheet__title truncate">{app.name}</h2>
            <div className="text-sm muted truncate">
              {app.category} · owned by {app.owner}
            </div>
            <div className="row row--wrap adm-gap-6 adm-sheet-head__badges">
              <span className="badge badge--muted">
                <span className={`dot dot--${app.status}`} aria-hidden="true" /> {STATUS_LABEL[app.status]}
              </span>
              {!app.enabled && <span className="badge badge--danger">Disabled</span>}
              {app.custom ? <span className="tag">Custom</span> : <span className="tag">Built-in</span>}
            </div>
          </div>
          <button type="button" className="icon-btn icon-btn--sm" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
      }
    >
      <AppDetailsForm key={app.id} app={app} />
      <RoleAccess app={app} roles={roles} users={users} canRoles={canRoles} myClearance={myClearance} myPerms={myPerms} permsByUser={permsByUser} />
      <PeopleWithAccess app={app} users={users} permsByUser={permsByUser} now={now} />
      <section className="adm-sheet-section adm-danger-zone" aria-labelledby="adm-app-danger-h">
        <div className="adm-sheet-section__head">
          <h3 id="adm-app-danger-h" className="adm-sheet-section__title">
            <TriangleAlert aria-hidden="true" /> Availability
          </h3>
        </div>
        <div className="adm-switch-row adm-switch-row--lg">
          <div className="grow">
            <div className="adm-switch-row__label">Enabled</div>
            <div className="text-xs faint">Disabled apps disappear for everyone except app managers.</div>
          </div>
          <Switch
            checked={app.enabled}
            label={`${app.name} enabled`}
            onChange={(v) => toast.result(useHub.getState().updateApp(app.id, { enabled: v }))}
          />
        </div>
        {app.custom ? (
          <InlineConfirm
            label="Delete app"
            icon={Trash2}
            prompt={`Delete ${app.name}? Role access, grants and pins are removed.`}
            confirmLabel="Delete"
            onConfirm={() => {
              const ok = toast.result(useHub.getState().deleteApp(app.id));
              if (ok) onClose();
            }}
          />
        ) : (
          <p className="text-xs faint">Built-in apps can be disabled, not deleted.</p>
        )}
      </section>
    </Sheet>
  );
}

// ─────────────────────────── details ───────────────────────────

function AppDetailsForm({ app }: { app: HubApp }) {
  const [name, setName] = useState(app.name);
  const [tagline, setTagline] = useState(app.tagline);
  const [description, setDescription] = useState(app.description);
  const [url, setUrl] = useState(app.url);
  const [category, setCategory] = useState<AppCategory>(app.category);
  const [owner, setOwner] = useState(app.owner);
  const [icon, setIcon] = useState<IconName>(app.icon);
  const [gradient, setGradient] = useState<[string, string]>(app.gradient);

  const patch = useMemo(() => {
    const p: Partial<Omit<HubApp, 'id'>> = {};
    if (name.trim() !== app.name) p.name = name.trim();
    if (tagline.trim() !== app.tagline) p.tagline = tagline.trim();
    if (description.trim() !== app.description) p.description = description.trim();
    if (url.trim() !== app.url) p.url = url.trim();
    if (category !== app.category) p.category = category;
    if (owner.trim() !== app.owner) p.owner = owner.trim();
    if (icon !== app.icon) p.icon = icon;
    if (gradient[0] !== app.gradient[0] || gradient[1] !== app.gradient[1]) p.gradient = gradient;
    return p;
  }, [name, tagline, description, url, category, owner, icon, gradient, app]);
  const dirty = Object.keys(patch).length > 0;
  const nameError = name.trim().length < 2 ? 'Name is required (2+ characters).' : null;
  const urlError = URL_PATTERN.test(url.trim()) ? null : 'Enter a full URL starting with https://';

  const reset = () => {
    setName(app.name);
    setTagline(app.tagline);
    setDescription(app.description);
    setUrl(app.url);
    setCategory(app.category);
    setOwner(app.owner);
    setIcon(app.icon);
    setGradient(app.gradient);
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!dirty || nameError || urlError) return;
    toast.result(useHub.getState().updateApp(app.id, patch));
  };

  const id = (s: string) => `adm-app-${app.id}-${s}`;

  return (
    <section className="adm-sheet-section" aria-labelledby={id('details-h')}>
      <div className="adm-sheet-section__head">
        <h3 id={id('details-h')} className="adm-sheet-section__title">
          <PenLine aria-hidden="true" /> Details
        </h3>
        <a className="btn btn--ghost btn--sm" href={app.url} target="_blank" rel="noreferrer noopener">
          Open <ExternalLink aria-hidden="true" />
        </a>
      </div>
      <form className="stack" onSubmit={save} noValidate>
        <div className="field">
          <label className="field-label" htmlFor={id('name')}>
            Name
          </label>
          <input id={id('name')} className="input" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} aria-invalid={!!nameError} />
          {nameError && <span className="field-hint adm-text-danger">{nameError}</span>}
        </div>
        <div className="field">
          <label className="field-label" htmlFor={id('tagline')}>
            Tagline
          </label>
          <input id={id('tagline')} className="input" value={tagline} maxLength={48} onChange={(e) => setTagline(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor={id('desc')}>
            Description
          </label>
          <textarea id={id('desc')} className="textarea" rows={3} maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor={id('url')}>
            Launch URL
          </label>
          <input id={id('url')} className="input mono" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} aria-invalid={!!urlError} />
          {urlError && <span className="field-hint adm-text-danger">{urlError}</span>}
        </div>
        <div className="adm-form-2">
          <div className="field">
            <label className="field-label" htmlFor={id('cat')}>
              Category
            </label>
            <select id={id('cat')} className="select" value={category} onChange={(e) => setCategory(e.target.value as AppCategory)}>
              {APP_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor={id('owner')}>
              Owner
            </label>
            <input id={id('owner')} className="input" value={owner} maxLength={40} onChange={(e) => setOwner(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <span className="field-label" id={id('icon-l')}>
            Icon
          </span>
          <IconPicker value={icon} onChange={setIcon} labelledBy={id('icon-l')} />
        </div>
        <div className="field">
          <span className="field-label" id={id('grad-l')}>
            Gradient
          </span>
          <GradientPicker value={gradient} onChange={setGradient} labelledBy={id('grad-l')} />
        </div>
        <div className="adm-sheet-actions">
          <span className="text-xs muted">{dirty ? `${pluralize(Object.keys(patch).length, 'unsaved change')}` : 'All changes saved'}</span>
          <span className="spacer" />
          <button type="button" className="btn btn--ghost btn--sm" disabled={!dirty} onClick={reset}>
            Reset
          </button>
          <button type="submit" className="btn btn--primary btn--sm" disabled={!dirty || !!nameError || !!urlError}>
            <Save aria-hidden="true" /> Save details
          </button>
        </div>
      </form>
    </section>
  );
}

// ─────────────────────────── role access ───────────────────────────

function RoleAccess({
  app,
  roles,
  users,
  canRoles,
  myClearance,
  myPerms,
  permsByUser,
}: {
  app: HubApp;
  roles: Role[];
  users: User[];
  canRoles: boolean;
  myClearance: number;
  myPerms: PermissionSet;
  permsByUser: Map<string, Set<string>>;
}) {
  const [pendingRoleId, setPendingRoleId] = useState<string | null>(null);
  const perm = appPermissionId(app.id);
  const sensitive = useMemo(() => !!buildPermissionCatalog([app]).find((p) => p.id === perm)?.sensitive, [app, perm]);
  const iHold = hasPermission(myPerms, perm);
  const sorted = useMemo(() => [...roles].sort((a, b) => b.clearance - a.clearance || a.name.localeCompare(b.name)), [roles]);
  const granting = rolesGranting(roles, perm).length;

  const apply = (role: Role, on: boolean) => {
    setPendingRoleId(null);
    toast.result(useHub.getState().setRolePermission(role.id, perm, on));
  };

  return (
    <section className="adm-sheet-section" aria-labelledby="adm-app-roles-h">
      <div className="adm-sheet-section__head">
        <h3 id="adm-app-roles-h" className="adm-sheet-section__title">
          <ShieldHalf aria-hidden="true" /> Role access
        </h3>
        <span className="text-xs faint">{pluralize(granting, 'role')} grant access</span>
      </div>
      {!canRoles && <LockNote>Changing role access requires “Manage roles &amp; permissions”.</LockNote>}
      {sensitive && canRoles && (
        <LockNote tone="warning" icon={TriangleAlert}>
          Sensitive app — granting it to a role asks for confirmation.
        </LockNote>
      )}
      <ul className="stack stack--sm">
        {sorted.map((role) => {
          const exact = role.permissions.includes(perm);
          const on = exact || role.permissions.some((p) => matchesPermission(p, perm));
          const members = users.filter((u) => u.roleIds.includes(role.id));
          const reason = !canRoles
            ? 'Requires Manage roles & permissions'
            : role.locked
              ? 'Locked role — always has full access'
              : on && !exact
                ? 'Granted via a wildcard permission'
                : role.clearance > myClearance
                  ? `Above your clearance (L${role.clearance})`
                  : !on && !iHold
                    ? 'You can’t grant access you don’t hold'
                    : null;
          const newly = members.filter((u) => u.active && !hasPermission(permsByUser.get(u.id) ?? EMPTY_PERMS, perm)).length;
          return (
            <li key={role.id} className={cx('adm-access-row', reason && 'is-locked')} style={{ '--role': role.color } as CSSProperties}>
              <div className="adm-access-row__main">
                <span className="adm-swatch-dot" aria-hidden="true" />
                <div className="grow">
                  <div className="adm-access-row__name">
                    <span className="truncate">{role.name}</span>
                    <span className="tag">L{role.clearance}</span>
                  </div>
                  <div className="text-xs faint">{reason ?? pluralize(members.length, 'member')}</div>
                </div>
                <Switch
                  checked={on}
                  disabled={!!reason}
                  label={`${role.name} can open ${app.name}`}
                  onChange={(v) => (v && sensitive ? setPendingRoleId(role.id) : apply(role, v))}
                />
              </div>
              {pendingRoleId === role.id && (
                <div className="adm-inline-confirm" role="group" aria-label={`Confirm granting ${app.name} to ${role.name}`}>
                  <TriangleAlert aria-hidden="true" />
                  <span className="grow text-sm">
                    Grant sensitive {app.name} to {role.name}? {pluralize(newly, 'person', 'people')} will newly gain access.
                  </span>
                  <div className="row">
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPendingRoleId(null)} autoFocus>
                      Cancel
                    </button>
                    <button type="button" className="btn btn--primary btn--sm" onClick={() => apply(role, true)}>
                      Grant
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ─────────────────────────── people ───────────────────────────

function PeopleWithAccess({
  app,
  users,
  permsByUser,
  now,
}: {
  app: HubApp;
  users: User[];
  permsByUser: Map<string, Set<string>>;
  now: number;
}) {
  const perm = appPermissionId(app.id);
  const withAccess = useMemo(
    () => users.filter((u) => u.active && hasPermission(permsByUser.get(u.id) ?? EMPTY_PERMS, perm)),
    [users, permsByUser, perm],
  );
  const direct = useMemo(
    () =>
      users
        .map((u) => ({ user: u, grant: u.grants.find((g) => g.permission === perm && isGrantActive(g, now)) }))
        .filter((x): x is { user: User; grant: NonNullable<typeof x.grant> } => !!x.grant)
        .sort((a, b) => (a.grant.expiresAt ?? Number.POSITIVE_INFINITY) - (b.grant.expiresAt ?? Number.POSITIVE_INFINITY)),
    [users, perm, now],
  );
  const activeCount = users.filter((u) => u.active).length;

  return (
    <section className="adm-sheet-section" aria-labelledby="adm-app-people-h">
      <div className="adm-sheet-section__head">
        <h3 id="adm-app-people-h" className="adm-sheet-section__title">
          <Users aria-hidden="true" /> People with access <span className="count">{withAccess.length}</span>
        </h3>
        <span className="text-xs faint">
          {activeCount ? Math.round((withAccess.length / activeCount) * 100) : 0}% of active people
        </span>
      </div>
      {withAccess.length > 0 ? (
        <span className="avatar-stack adm-people-stack">
          {withAccess.slice(0, 12).map((u) => (
            <Avatar key={u.id} user={u} size={30} />
          ))}
          {withAccess.length > 12 && <span className="adm-stack-more">+{withAccess.length - 12}</span>}
        </span>
      ) : (
        <p className="adm-empty-line">Nobody can open this app yet.</p>
      )}
      {direct.length > 0 && (
        <div className="stack stack--sm adm-direct-list">
          <span className="adm-micro">
            <KeyRound aria-hidden="true" className="adm-inline-icon" /> Direct grants
          </span>
          <ul className="stack stack--sm">
            {direct.map(({ user, grant }) => (
              <li key={user.id} className="adm-direct-row">
                <Avatar user={user} size={28} />
                <span className="grow truncate text-sm">{user.name}</span>
                {grant.expiresAt === null ? (
                  <span className="badge badge--warning">Permanent</span>
                ) : (
                  <span className="badge badge--info">
                    <Hourglass aria-hidden="true" />
                    {relativeTime(grant.expiresAt, now)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
