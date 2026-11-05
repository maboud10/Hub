import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import {
  Hourglass,
  KeyRound,
  Layers,
  LockKeyhole,
  Plus,
  RotateCcw,
  Save,
  ShieldHalf,
  TimerOff,
  Trash2,
  TriangleAlert,
  UserRound,
  X,
} from 'lucide-react';
import { useHub } from '@/store/hub';
import { useClearance, usePermissions, useSessionUser } from '@/store/selectors';
import { useNow } from '@/hooks/useNow';
import { toast } from '@/store/toast';
import { Sheet } from '@/components/ui/Sheet';
import { AppIcon, Avatar, ClearanceBadge, PRESENCE_LABEL, Switch } from '@/components/ui/primitives';
import { APP_CATEGORIES } from '@/data/apps';
import { appPermissionId, HUB_PERMISSIONS } from '@/data/permissions';
import { SUPER_ADMIN_ROLE_ID } from '@/data/roles';
import { clearanceOf, DURATION_LABEL, effectivePermissions, hasPermission, isGrantActive, primaryRole, type PermissionSet } from '@/lib/rbac';
import { firstName, pluralize, relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import type { Grant, GrantDuration, HubApp, Role, User } from '@/types';
import { DurationPicker, grantSpan, isExpiringSoon, LockNote, permLabel, sameMembers, Tip } from './shared';

/** "Manage user" drawer: roles, direct grants, grant form and effective access. */
export function UserSheet({ userId, open, onClose }: { userId: string | null; open: boolean; onClose: () => void }) {
  const user = useHub((s) => (userId ? s.users.find((u) => u.id === userId) : undefined));
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  const apps = useHub((s) => s.apps);
  const me = useSessionUser();
  const myPerms = usePermissions();
  const myClearance = useClearance();
  const now = useNow(60_000);
  const appMap = useMemo(() => new Map(apps.map((a) => [a.id, a])), [apps]);

  if (!user) return null;
  const clearance = clearanceOf(user, roles);
  const headline = primaryRole(user, roles);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      width={540}
      className="adm-overlay adm-user-sheet"
      label={`Manage ${user.name}`}
      header={
        <div className="adm-sheet-head">
          <Avatar user={user} size={54} presence />
          <div className="grow">
            <h2 className="sheet__title truncate">{user.name}</h2>
            <div className="text-sm muted truncate">
              {user.title} · {user.department}
            </div>
            <div className="row row--wrap adm-gap-6 adm-sheet-head__badges">
              <ClearanceBadge level={clearance} label={headline?.name} />
              {user.active ? (
                <span className="badge badge--success">Active</span>
              ) : (
                <span className="badge badge--danger">Deactivated</span>
              )}
              {user.id === me?.id && <span className="tag">You</span>}
            </div>
          </div>
          <button type="button" className="icon-btn icon-btn--sm" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
      }
    >
      <AccountSection user={user} users={users} roles={roles} isSelf={user.id === me?.id} myClearance={myClearance} now={now} />
      <RolesEditor
        key={`${user.id}:${user.roleIds.join(',')}`}
        user={user}
        roles={roles}
        myClearance={myClearance}
        isSelf={user.id === me?.id}
        targetClearance={clearance}
      />
      <GrantsSection user={user} users={users} appMap={appMap} myPerms={myPerms} now={now} />
      <GrantForm key={user.id} user={user} apps={apps} roles={roles} myPerms={myPerms} now={now} />
      <EffectiveAccess user={user} apps={apps} roles={roles} now={now} />
    </Sheet>
  );
}

// ─────────────────────────── account ───────────────────────────

function AccountSection({
  user,
  users,
  roles,
  isSelf,
  myClearance,
  now,
}: {
  user: User;
  users: User[];
  roles: Role[];
  isSelf: boolean;
  myClearance: number;
  now: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const targetClearance = clearanceOf(user, roles);
  const activeAdmins = users.filter((u) => u.active && u.roleIds.includes(SUPER_ADMIN_ROLE_ID)).length;
  const lock = isSelf
    ? 'You can’t deactivate your own account'
    : targetClearance > myClearance
      ? `Higher clearance (L${targetClearance}) than yours (L${myClearance})`
      : user.active && user.roleIds.includes(SUPER_ADMIN_ROLE_ID) && activeAdmins <= 1
        ? 'Last active System Admin'
        : null;
  const manager = user.managerId ? users.find((u) => u.id === user.managerId) : undefined;

  const setActive = (active: boolean) => {
    setConfirming(false);
    toast.result(useHub.getState().setUserActive(user.id, active));
  };

  return (
    <section className="adm-sheet-section" aria-labelledby="adm-acct-h">
      <div className="adm-sheet-section__head">
        <h3 id="adm-acct-h" className="adm-sheet-section__title">
          <UserRound aria-hidden="true" /> Account
        </h3>
      </div>
      <dl className="adm-facts">
        <div>
          <dt>Email</dt>
          <dd className="truncate">{user.email}</dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd className="truncate">{user.location}</dd>
        </div>
        <div>
          <dt>Manager</dt>
          <dd className="truncate">{manager?.name ?? '—'}</dd>
        </div>
        <div>
          <dt>Last active</dt>
          <dd>
            {user.lastActiveAt ? relativeTime(user.lastActiveAt, now) : '—'}
            {user.active && <span className="faint"> · {PRESENCE_LABEL[user.presence]}</span>}
          </dd>
        </div>
      </dl>
      <div className="adm-switch-row adm-switch-row--lg">
        <div className="grow">
          <div className="adm-switch-row__label">Account enabled</div>
          <div className="text-xs faint">{lock ?? (user.active ? 'Turn off to revoke all access immediately' : 'Turn on to restore roles and grants')}</div>
        </div>
        {lock && <LockKeyhole className="adm-lock-icon" aria-hidden="true" />}
        <Switch
          checked={user.active}
          disabled={!!lock}
          label={`Account enabled for ${user.name}`}
          onChange={(v) => (v ? setActive(true) : setConfirming(true))}
        />
      </div>
      {confirming && (
        <div className="adm-inline-confirm" role="group" aria-label="Confirm deactivation">
          <TriangleAlert aria-hidden="true" />
          <span className="grow text-sm">Deactivate {firstName(user.name)}? They lose all access immediately.</span>
          <div className="row">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirming(false)} autoFocus>
              Cancel
            </button>
            <button type="button" className="btn btn--danger btn--sm" onClick={() => setActive(false)}>
              Deactivate
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────── roles ───────────────────────────

function RolesEditor({
  user,
  roles,
  myClearance,
  isSelf,
  targetClearance,
}: {
  user: User;
  roles: Role[];
  myClearance: number;
  isSelf: boolean;
  targetClearance: number;
}) {
  const [draft, setDraft] = useState<string[]>(user.roleIds);
  const sorted = useMemo(() => [...roles].sort((a, b) => b.clearance - a.clearance || a.name.localeCompare(b.name)), [roles]);
  const dirty = !sameMembers(draft, user.roleIds);
  const nextClearance = clearanceOf({ ...user, roleIds: draft }, roles);

  const toggle = (id: string, on: boolean) => setDraft((d) => (on ? [...d, id] : d.filter((x) => x !== id)));

  const save = () => {
    const known = sorted.filter((r) => draft.includes(r.id)).map((r) => r.id);
    const unknown = draft.filter((id) => !roles.some((r) => r.id === id));
    toast.result(useHub.getState().setUserRoles(user.id, [...known, ...unknown]));
  };

  return (
    <section className="adm-sheet-section" aria-labelledby="adm-roles-h">
      <div className="adm-sheet-section__head">
        <h3 id="adm-roles-h" className="adm-sheet-section__title">
          <ShieldHalf aria-hidden="true" /> Roles
        </h3>
        <span className="text-xs faint">You can assign up to L{myClearance}</span>
      </div>
      {targetClearance > myClearance && (
        <LockNote tone="warning" icon={TriangleAlert}>
          {firstName(user.name)} has higher clearance than you. You can only change roles up to L{myClearance}.
        </LockNote>
      )}
      <div className="stack stack--sm" role="group" aria-labelledby="adm-roles-h">
        {sorted.map((role) => {
          const above = role.clearance > myClearance;
          const selfLock = isSelf && role.id === SUPER_ADMIN_ROLE_ID && user.roleIds.includes(role.id);
          const checked = draft.includes(role.id);
          const reason = above
            ? `Above your clearance (L${role.clearance} > L${myClearance})`
            : selfLock
              ? 'Lockout protection: you can’t remove your own System Admin role'
              : null;
          const whyId = `adm-role-why-${role.id}`;
          return (
            <label
              key={role.id}
              className={cx('adm-role-opt', reason && 'is-locked', checked && 'is-checked')}
              style={{ '--role': role.color } as CSSProperties}
            >
              <input
                type="checkbox"
                className="adm-check"
                checked={checked}
                disabled={!!reason}
                onChange={(e) => toggle(role.id, e.target.checked)}
                aria-describedby={reason ? whyId : undefined}
              />
              <span className="adm-swatch-dot" aria-hidden="true" />
              <span className="grow adm-role-opt__body">
                <span className="adm-role-opt__name">{role.name}</span>
                <span className="text-xs faint clamp-2" id={reason ? whyId : undefined}>
                  {reason ?? role.description}
                </span>
              </span>
              <span className="tag">L{role.clearance}</span>
              {reason && (
                <Tip tip={reason}>
                  <LockKeyhole className="adm-lock-icon" aria-hidden="true" />
                </Tip>
              )}
            </label>
          );
        })}
      </div>
      <div className="adm-sheet-actions">
        <span className="text-xs muted">
          Clearance{' '}
          {nextClearance === targetClearance ? (
            <strong className="mono">L{targetClearance}</strong>
          ) : (
            <>
              <span className="mono">L{targetClearance}</span> → <strong className="mono accent-ink">L{nextClearance}</strong>
            </>
          )}
        </span>
        <span className="spacer" />
        <button type="button" className="btn btn--ghost btn--sm" disabled={!dirty} onClick={() => setDraft(user.roleIds)}>
          Reset
        </button>
        <button type="button" className="btn btn--primary btn--sm" disabled={!dirty || !draft.length} onClick={save}>
          <Save aria-hidden="true" /> Save roles
        </button>
      </div>
      {!draft.length && <p className="text-xs adm-text-danger">Users need at least one role.</p>}
    </section>
  );
}

// ─────────────────────────── grants ───────────────────────────

function GrantsSection({
  user,
  users,
  appMap,
  myPerms,
  now,
}: {
  user: User;
  users: User[];
  appMap: Map<string, HubApp>;
  myPerms: PermissionSet;
  now: number;
}) {
  const grants = useMemo(
    () =>
      [...user.grants].sort(
        (a, b) =>
          Number(isGrantActive(b, now)) - Number(isGrantActive(a, now)) ||
          (a.expiresAt ?? Number.POSITIVE_INFINITY) - (b.expiresAt ?? Number.POSITIVE_INFINITY),
      ),
    [user.grants, now],
  );
  const live = grants.filter((g) => isGrantActive(g, now)).length;

  return (
    <section className="adm-sheet-section" aria-labelledby="adm-grants-h">
      <div className="adm-sheet-section__head">
        <h3 id="adm-grants-h" className="adm-sheet-section__title">
          <KeyRound aria-hidden="true" /> Direct grants <span className="count">{live}</span>
        </h3>
        {grants.length > live && <span className="text-xs faint">{grants.length - live} expired</span>}
      </div>
      {grants.length === 0 ? (
        <p className="adm-empty-line">No direct grants — all access comes from roles.</p>
      ) : (
        <ul className="stack stack--sm">
          {grants.map((g) => (
            <GrantRow
              key={g.permission}
              user={user}
              grant={g}
              app={g.permission.startsWith('app:') ? appMap.get(g.permission.slice(4)) : undefined}
              label={permLabel(g.permission, appMap)}
              grantedBy={users.find((u) => u.id === g.grantedBy)}
              canRenew={hasPermission(myPerms, g.permission)}
              now={now}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function GrantRow({
  user,
  grant,
  app,
  label,
  grantedBy,
  canRenew,
  now,
}: {
  user: User;
  grant: Grant;
  app: HubApp | undefined;
  label: string;
  grantedBy: User | undefined;
  canRenew: boolean;
  now: number;
}) {
  const active = isGrantActive(grant, now);
  const soon = isExpiringSoon(grant, now);
  const span = grantSpan(grant);
  const renewSpan: GrantDuration = span === 'permanent' ? '30d' : span;

  const revoke = () => toast.result(useHub.getState().revokeGrant(user.id, grant.permission));
  const renew = () => toast.result(useHub.getState().grantAccess(user.id, grant.permission, renewSpan, grant.reason));

  return (
    <li className={cx('adm-grant', !active && 'is-expired', soon && 'is-soon')}>
      {app ? (
        <AppIcon app={app} size={34} />
      ) : (
        <span className="adm-grant__icon" aria-hidden="true">
          <KeyRound />
        </span>
      )}
      <div className="grow">
        <div className="row row--wrap adm-gap-6">
          <strong className="truncate">{label}</strong>
          <code className="adm-perm-id">{grant.permission}</code>
        </div>
        <div className="adm-grant__meta">
          {grant.expiresAt === null ? (
            <span className="badge badge--warning">Permanent</span>
          ) : active ? (
            <span className={cx('badge', soon ? 'badge--warning' : 'badge--info')}>
              <Hourglass aria-hidden="true" />
              Expires {relativeTime(grant.expiresAt, now)}
            </span>
          ) : (
            <span className="badge badge--muted">
              <TimerOff aria-hidden="true" />
              Expired {relativeTime(grant.expiresAt, now)}
            </span>
          )}
          <span className="text-xs faint">
            by {grantedBy?.name ?? 'System'} · {relativeTime(grant.grantedAt, now)}
          </span>
        </div>
        {grant.reason && <p className="adm-quote adm-quote--sm">“{grant.reason}”</p>}
      </div>
      <div className="adm-grant__actions">
        {(soon || !active) && canRenew && (
          <button type="button" className="btn btn--sm" onClick={renew} aria-label={`Renew ${label} for ${DURATION_LABEL[renewSpan]}`} data-tip={`Renew · ${DURATION_LABEL[renewSpan]}`}>
            <RotateCcw aria-hidden="true" /> Renew
          </button>
        )}
        <button type="button" className="btn btn--danger btn--sm" onClick={revoke} aria-label={`${active ? 'Revoke' : 'Remove'} ${label} from ${user.name}`}>
          <Trash2 aria-hidden="true" /> {active ? 'Revoke' : 'Remove'}
        </button>
      </div>
    </li>
  );
}

function GrantForm({
  user,
  apps,
  roles,
  myPerms,
  now,
}: {
  user: User;
  apps: HubApp[];
  roles: Role[];
  myPerms: PermissionSet;
  now: number;
}) {
  // Evaluate as if active so deactivated users don't get offered apps their roles already cover.
  const potential = useMemo(() => effectivePermissions({ ...user, active: true }, roles, now), [user, roles, now]);
  const { candidates, hidden } = useMemo(() => {
    const lacking = apps.filter((a) => a.enabled && !hasPermission(potential, appPermissionId(a.id)));
    return {
      candidates: lacking.filter((a) => hasPermission(myPerms, appPermissionId(a.id))).sort((a, b) => a.name.localeCompare(b.name)),
      hidden: lacking.filter((a) => !hasPermission(myPerms, appPermissionId(a.id))).length,
    };
  }, [apps, potential, myPerms]);
  const [appId, setAppId] = useState('');
  const [duration, setDuration] = useState<GrantDuration>('30d');
  const [reason, setReason] = useState('');
  const selected = candidates.find((a) => a.id === appId);

  const groups = useMemo(
    () => APP_CATEGORIES.map((c) => [c, candidates.filter((a) => a.category === c)] as const).filter(([, list]) => list.length),
    [candidates],
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    const ok = toast.result(useHub.getState().grantAccess(user.id, appPermissionId(selected.id), duration, reason.trim() || undefined));
    if (ok) {
      setAppId('');
      setReason('');
    }
  };

  return (
    <section className="adm-sheet-section" aria-labelledby="adm-grant-h">
      <div className="adm-sheet-section__head">
        <h3 id="adm-grant-h" className="adm-sheet-section__title">
          <Plus aria-hidden="true" /> Grant app access
        </h3>
      </div>
      {candidates.length === 0 ? (
        <p className="adm-empty-line">
          {firstName(user.name)} already has every app you’re able to grant.
          {hidden > 0 && ` ${pluralize(hidden, 'other app')} require access you don’t hold.`}
        </p>
      ) : (
        <form className="stack adm-grant-form" onSubmit={submit}>
          <div className="field">
            <label className="field-label" htmlFor={`adm-grant-app-${user.id}`}>
              App
            </label>
            <div className="adm-select-icon">
              {selected && <AppIcon app={selected} size={26} />}
              <select id={`adm-grant-app-${user.id}`} className="select" value={appId} onChange={(e) => setAppId(e.target.value)}>
                <option value="">Choose an app…</option>
                {groups.map(([cat, list]) => (
                  <optgroup key={cat} label={cat}>
                    {list.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <span className="field-hint">
              Only apps {firstName(user.name)} lacks and you hold yourself
              {hidden > 0 ? ` · ${hidden} hidden` : ''}.
            </span>
          </div>
          <div className="field">
            <span className="field-label">Duration</span>
            <DurationPicker value={duration} onChange={setDuration} label="Grant duration" />
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`adm-grant-reason-${user.id}`}>
              Reason <span className="faint">(recommended)</span>
            </label>
            <input
              id={`adm-grant-reason-${user.id}`}
              className="input"
              value={reason}
              maxLength={140}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Covering month-end close for Finance"
            />
          </div>
          {!user.active && (
            <LockNote tone="warning" icon={TriangleAlert}>
              Account is deactivated — this grant only takes effect once it’s reactivated.
            </LockNote>
          )}
          {duration === 'permanent' && (
            <LockNote tone="warning" icon={TriangleAlert}>
              Permanent grants never expire. Prefer a role change for standing access.
            </LockNote>
          )}
          <button type="submit" className="btn btn--primary" disabled={!selected}>
            <KeyRound aria-hidden="true" /> {selected ? `Grant ${selected.name} · ${DURATION_LABEL[duration]}` : 'Grant access'}
          </button>
        </form>
      )}
    </section>
  );
}

// ─────────────────────────── effective access ───────────────────────────

function EffectiveAccess({ user, apps, roles, now }: { user: User; apps: HubApp[]; roles: Role[]; now: number }) {
  const potential = useMemo(() => effectivePermissions({ ...user, active: true }, roles, now), [user, roles, now]);
  const appList = useMemo(
    () => apps.filter((a) => a.enabled && hasPermission(potential, appPermissionId(a.id))).sort((a, b) => a.name.localeCompare(b.name)),
    [apps, potential],
  );
  const caps = HUB_PERMISSIONS.filter((p) => hasPermission(potential, p.id));
  const enabledCount = apps.filter((a) => a.enabled).length;

  return (
    <section className="adm-sheet-section" aria-labelledby="adm-eff-h">
      <div className="adm-sheet-section__head">
        <h3 id="adm-eff-h" className="adm-sheet-section__title">
          <Layers aria-hidden="true" /> Effective access
        </h3>
        <span className="badge badge--info">
          {appList.length}/{enabledCount} apps
        </span>
      </div>
      {!user.active && (
        <LockNote tone="warning">Deactivated — no effective access right now. Showing what would return on reactivation.</LockNote>
      )}
      {appList.length > 0 ? (
        <div className="adm-icon-cloud">
          {appList.map((a) => (
            <span key={a.id} className="adm-icon-cloud__item" data-tip={a.name} role="img" aria-label={a.name}>
              <AppIcon app={a} size={32} />
            </span>
          ))}
        </div>
      ) : (
        <p className="adm-empty-line">No app access.</p>
      )}
      {caps.length > 0 && (
        <div className="stack stack--sm adm-caps">
          <span className="adm-micro">Hub capabilities</span>
          <div className="row row--wrap adm-gap-6">
            {caps.map((c) => (
              <span key={c.id} className={cx('tag', c.sensitive && 'adm-tag--sensitive')} title={c.description}>
                {c.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
