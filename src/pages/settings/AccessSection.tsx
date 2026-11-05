import { useMemo } from 'react';
import { Link } from 'react-router';
import {
  AppWindow,
  ArrowRight,
  Ban,
  CircleCheck,
  CircleX,
  ClipboardList,
  Hourglass,
  KeyRound,
  Lock,
  LockOpen,
  MessageSquare,
  ShieldCheck,
  Timer,
  X,
} from 'lucide-react';
import type { RequestStatus, Role, User } from '@/types';
import { HUB_PERMISSIONS } from '@/data/permissions';
import { useHub } from '@/store/hub';
import { useAppAccess, useClearance, useMyRequests, usePermissions, usePrimaryRole, useRoles } from '@/store/selectors';
import { toast } from '@/store/toast';
import { AppIcon, ClearanceBadge, RoleChip } from '@/components/ui/primitives';
import { useNow } from '@/hooks/useNow';
import { DURATION_LABEL, explainAccess, hasPermission, isGrantActive } from '@/lib/rbac';
import { formatDateTime, relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { SettingsSection, SubHead } from './SettingsSection';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const pad = (n: number) => String(n).padStart(2, '0');

const STATUS_META: Record<RequestStatus, { label: string; cls: string; icon: typeof Hourglass; verb: string }> = {
  pending: { label: 'Pending review', cls: 'badge--warning', icon: Hourglass, verb: '' },
  approved: { label: 'Approved', cls: 'badge--success', icon: CircleCheck, verb: 'Approved' },
  denied: { label: 'Declined', cls: 'badge--danger', icon: CircleX, verb: 'Declined' },
  cancelled: { label: 'Cancelled', cls: 'badge--muted', icon: Ban, verb: 'Cancelled' },
};

/** Ticks every second in isolation so the rest of the section doesn't re-render. */
function Countdown({ to }: { to: number }) {
  const now = useNow(1000);
  const ms = Math.max(0, to - now);
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  const m = Math.floor((ms % HOUR) / MIN);
  const s = Math.floor((ms % MIN) / 1000);
  return (
    <span
      className={cx('set-countdown mono', ms < DAY && 'is-urgent')}
      role="timer"
      aria-label={ms ? `Expires in ${d} days, ${h} hours and ${m} minutes` : 'Expired'}
    >
      <Timer aria-hidden="true" />
      {ms ? (
        <span aria-hidden="true">
          {d > 0 && (
            <>
              {d}
              <small>d</small>{' '}
            </>
          )}
          {pad(h)}
          <small>h</small> {pad(m)}
          <small>m</small> {pad(s)}
          <small>s</small>
        </span>
      ) : (
        <span aria-hidden="true">expired</span>
      )}
    </span>
  );
}

export function AccessSection({ me }: { me: User }) {
  const roles = useRoles();
  const perms = usePermissions();
  const clearance = useClearance();
  const primary = usePrimaryRole();
  const apps = useHub((s) => s.apps);
  const users = useHub((s) => s.users);
  const cancelRequest = useHub((s) => s.cancelRequest);
  const access = useAppAccess();
  const requests = useMyRequests();
  const now = useNow(30_000);

  const myRoles = useMemo(
    () =>
      me.roleIds
        .map((id) => roles.find((r) => r.id === id))
        .filter((r): r is Role => !!r)
        .sort((a, b) => b.clearance - a.clearance),
    [me.roleIds, roles],
  );

  const caps = useMemo(
    () =>
      HUB_PERMISSIONS.map((def) => {
        const held = hasPermission(perms, def.id);
        const why = held ? explainAccess(me, roles, def.id) : null;
        const via = why ? [...why.roles.map((r) => r.name), ...(why.grant ? ['direct grant'] : [])].join(', ') : '';
        return { def, held, via };
      }),
    [perms, me, roles],
  );
  const held = caps.filter((c) => c.held);
  const missing = caps.filter((c) => !c.held);

  const appsById = useMemo(() => new Map(apps.map((a) => [a.id, a])), [apps]);
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const granted = access.filter((a) => a.access === 'granted');
  const reachable = access.filter((a) => a.access !== 'disabled').length;
  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  const grants = me.grants
    .filter((g) => isGrantActive(g, now))
    .sort((a, b) => (a.expiresAt ?? Number.POSITIVE_INFINITY) - (b.expiresAt ?? Number.POSITIVE_INFINITY));
  const temporary = grants.filter((g) => g.expiresAt !== null).length;

  return (
    <SettingsSection
      id="access"
      icon={<ShieldCheck />}
      title="My access"
      description="Full transparency on what you can reach, why, and for how long."
      aside={<ClearanceBadge level={clearance} label={primary?.name} />}
    >
      <dl className="set-stats">
        <div className="set-stat">
          <dt className="stat-label">Clearance</dt>
          <dd className="stat-value">
            L{clearance}
            <span className="set-stat__of">/5</span>
          </dd>
        </div>
        <div className="set-stat">
          <dt className="stat-label">Roles</dt>
          <dd className="stat-value">{myRoles.length}</dd>
        </div>
        <div className="set-stat">
          <dt className="stat-label">Apps unlocked</dt>
          <dd className="stat-value">
            {granted.length}
            <span className="set-stat__of">/{reachable}</span>
          </dd>
        </div>
        <div className="set-stat">
          <dt className="stat-label">Pending</dt>
          <dd className={cx('stat-value', pendingCount > 0 && 'set-stat--warn')}>{pendingCount}</dd>
        </div>
      </dl>

      {/* Roles */}
      <SubHead icon={<KeyRound aria-hidden="true" />}>Your roles</SubHead>
      <ul className="set-roles">
        {myRoles.map((r) => (
          <li key={r.id} className="set-role">
            <RoleChip name={r.name} color={r.color} />
            <span className="set-role__desc">{r.description}</span>
            <span className="set-role__level mono">L{r.clearance}</span>
          </li>
        ))}
      </ul>

      {/* Capabilities */}
      <div className="set-caps">
        <div className="set-caps__col">
          <SubHead icon={<LockOpen aria-hidden="true" />} aside={<span className="set-counter mono">{held.length}</span>}>
            Capabilities you hold
          </SubHead>
          {held.length ? (
            <ul className="set-cap-list">
              {held.map(({ def, via }) => (
                <li key={def.id} className="set-cap is-held">
                  <CircleCheck className="set-cap__icon" aria-hidden="true" />
                  <div className="set-cap__text">
                    <div className="set-cap__label">
                      {def.label}
                      {def.sensitive && <span className="badge badge--warning">Sensitive</span>}
                    </div>
                    <div className="set-cap__desc">{def.description}</div>
                    {via && <div className="set-cap__via mono">via {via}</div>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="set-empty-line">No hub capabilities yet — your roles cover app access only.</p>
          )}
        </div>
        <div className="set-caps__col">
          <SubHead icon={<Lock aria-hidden="true" />} aside={<span className="set-counter mono">{missing.length}</span>}>
            Not in your roles
          </SubHead>
          {missing.length ? (
            <ul className="set-cap-list">
              {missing.map(({ def }) => (
                <li key={def.id} className="set-cap is-locked">
                  <Lock className="set-cap__icon" aria-hidden="true" />
                  <div className="set-cap__text">
                    <div className="set-cap__label">
                      {def.label}
                      <span className="sr-only"> (locked)</span>
                    </div>
                    <div className="set-cap__desc">{def.description}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="set-empty-line">Nothing — you hold every hub capability. Use it wisely.</p>
          )}
        </div>
      </div>

      {/* Apps */}
      <SubHead icon={<AppWindow aria-hidden="true" />} aside={<span className="set-counter mono">{granted.length}</span>}>
        Apps you can open
      </SubHead>
      <div className="set-apps">
        <ul className="set-apps__icons" aria-label={`${granted.length} apps unlocked`}>
          {granted.slice(0, 12).map(({ app }) => (
            <li key={app.id} data-tip={app.name}>
              <AppIcon app={app} size={34} />
              <span className="sr-only">{app.name}</span>
            </li>
          ))}
          {granted.length > 12 && <li className="set-apps__more mono">+{granted.length - 12}</li>}
        </ul>
        <Link to="/apps" className="btn btn--ghost set-apps__link">
          Browse apps <ArrowRight />
        </Link>
      </div>

      {/* Grants */}
      <SubHead icon={<Hourglass aria-hidden="true" />} aside={<span className="set-counter mono">{temporary} temporary</span>}>
        Direct grants
      </SubHead>
      {grants.length ? (
        <ul className="set-list">
          {grants.map((g) => {
            const app = g.permission.startsWith('app:') ? appsById.get(g.permission.slice(4)) : undefined;
            const hub = HUB_PERMISSIONS.find((p) => p.id === g.permission);
            const label = app?.name ?? hub?.label ?? g.permission;
            const by = usersById.get(g.grantedBy);
            const left = g.expiresAt ? Math.max(0, Math.min(100, ((g.expiresAt - now) / Math.max(1, g.expiresAt - g.grantedAt)) * 100)) : 100;
            return (
              <li key={g.permission} className="set-item">
                {app ? (
                  <AppIcon app={app} size={40} />
                ) : (
                  <span className="set-item__icon" aria-hidden="true">
                    <KeyRound />
                  </span>
                )}
                <div className="set-item__body">
                  <div className="set-item__top">
                    <strong>{label}</strong>
                    {g.expiresAt ? <Countdown to={g.expiresAt} /> : <span className="badge badge--muted">Permanent</span>}
                  </div>
                  {g.reason && <p className="set-item__quote">“{g.reason}”</p>}
                  <div className="set-item__meta">
                    Granted by {by?.name ?? 'an administrator'} · {relativeTime(g.grantedAt, now)}
                    {g.expiresAt && <> · ends {formatDateTime(g.expiresAt)}</>}
                  </div>
                  {g.expiresAt && (
                    <div className={cx('progress set-item__bar', left < 20 && 'is-low')} aria-hidden="true">
                      <span style={{ width: `${left}%` }} />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="set-empty-line">No direct grants — everything you have comes from your roles.</p>
      )}

      {/* Requests */}
      <SubHead icon={<ClipboardList aria-hidden="true" />} aside={<span className="set-counter mono">{requests.length}</span>}>
        My access requests
      </SubHead>
      {requests.length ? (
        <ul className="set-list">
          {requests.map((r) => {
            const app = appsById.get(r.appId);
            const meta = STATUS_META[r.status];
            const StatusIcon = meta.icon;
            const reviewer = r.reviewedBy ? usersById.get(r.reviewedBy) : undefined;
            return (
              <li key={r.id} className={cx('set-item', `set-item--${r.status}`)}>
                {app ? (
                  <AppIcon app={app} size={40} />
                ) : (
                  <span className="set-item__icon" aria-hidden="true">
                    <AppWindow />
                  </span>
                )}
                <div className="set-item__body">
                  <div className="set-item__top">
                    <strong>{app?.name ?? r.appId}</strong>
                    <span className={cx('badge', meta.cls)}>
                      <StatusIcon /> {meta.label}
                    </span>
                    <span className="tag">{DURATION_LABEL[r.grantedDuration ?? r.duration]}</span>
                  </div>
                  <p className="set-item__quote">“{r.reason}”</p>
                  <div className="set-item__meta">
                    Requested {relativeTime(r.createdAt, now)}
                    {r.reviewedAt && (
                      <>
                        {' '}
                        · {meta.verb} {reviewer ? `by ${reviewer.name}` : ''} {relativeTime(r.reviewedAt, now)}
                      </>
                    )}
                  </div>
                  {r.reviewNote && (
                    <p className="set-item__note">
                      <MessageSquare aria-hidden="true" />
                      <span>
                        <strong>{reviewer?.name.split(' ')[0] ?? 'Reviewer'}:</strong> {r.reviewNote}
                      </span>
                    </p>
                  )}
                </div>
                {r.status === 'pending' && (
                  <button
                    type="button"
                    className="btn btn--ghost set-item__action"
                    onClick={() => toast.result(cancelRequest(r.id))}
                    aria-label={`Cancel request for ${app?.name ?? r.appId}`}
                  >
                    <X /> <span>Cancel</span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="set-empty-line">
          No requests yet. Locked apps can be requested from <Link to="/apps">Apps</Link>.
        </p>
      )}
    </SettingsSection>
  );
}
