import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowUpRight, Ban, Clock, Hourglass, KeyRound, LockKeyhole, Pin, PinOff, Rocket, Send, ShieldCheck, Users, X } from 'lucide-react';
import type { GrantDuration } from '@/types';
import { useHub } from '@/store/hub';
import { useUI } from '@/store/ui';
import { toast } from '@/store/toast';
import { useAppAccessMap, usePrefs, useSessionUser } from '@/store/selectors';
import { appPermissionId } from '@/data/permissions';
import { DURATION_LABEL, effectivePermissions, explainAccess, hasPermission, rolesGranting } from '@/lib/rbac';
import { formatDate, relativeTime } from '@/lib/format';
import { getIcon } from '@/icons';
import { Sheet } from '@/components/ui/Sheet';
import { AppIcon, RoleChip, Segmented } from '@/components/ui/primitives';
import { useLaunchApp } from './useLaunchApp';
import { STATUS_LABEL } from './AppTile';
import { cx } from '@/lib/cx';

const DURATIONS: GrantDuration[] = ['7d', '30d', '90d', 'permanent'];

export function AppDetailsSheet() {
  const appId = useUI((s) => s.appSheetId);
  const close = useUI((s) => s.closeAppSheet);
  const accessMap = useAppAccessMap();
  const user = useSessionUser();
  const prefs = usePrefs();
  const roles = useHub((s) => s.roles);
  const users = useHub((s) => s.users);
  const requests = useHub((s) => s.requests);
  const { togglePin, requestAccess, cancelRequest } = useHub.getState();
  const launch = useLaunchApp();

  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState<GrantDuration>('30d');
  useEffect(() => {
    setReason('');
    setDuration('30d');
  }, [appId]);

  // Keep showing the last app while the sheet animates out.
  const lastId = useRef(appId);
  if (appId) lastId.current = appId;
  const shownId = appId ?? lastId.current;
  const item = shownId ? accessMap.get(shownId) : undefined;
  const app = item?.app;

  const reviewers = useMemo(() => {
    if (!app || !user) return [];
    const perm = appPermissionId(app.id);
    return users.filter((u) => {
      if (u.id === user.id || !u.active) return false;
      const p = effectivePermissions(u, roles);
      return hasPermission(p, 'hub.requests.review') && hasPermission(p, perm);
    });
  }, [app, user, users, roles]);

  if (!item || !app || !user) return null;

  const perm = appPermissionId(app.id);
  const explanation = explainAccess(user, roles, perm);
  const grantedBy = explanation.grant ? users.find((u) => u.id === explanation.grant!.grantedBy) : undefined;
  const pending = item.pendingRequestId ? requests.find((r) => r.id === item.pendingRequestId) : undefined;
  const pinned = prefs.pinned.includes(app.id);
  const opened = prefs.launchCounts[app.id] ?? 0;
  const lastUsed = prefs.recents.find((r) => r.appId === app.id)?.at;
  const granting = rolesGranting(roles, perm).filter((r) => !r.locked);

  const submit = () => {
    if (toast.result(requestAccess(app.id, reason, duration))) setReason('');
  };

  const header = (
    <div className="appsheet__head" style={{ '--c1': app.gradient[0], '--c2': app.gradient[1] } as CSSProperties}>
      <div className="appsheet__glow" />
      <button className="icon-btn icon-btn--sm appsheet__close" onClick={close} aria-label="Close">
        <X />
      </button>
      <AppIcon app={app} size={72} locked={item.access !== 'granted'} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 8 }}>
          <h2 className="appsheet__title truncate">{app.name}</h2>
          {app.badge && <span className={cx('badge', app.badge === 'new' ? 'badge--solid' : 'badge--info')}>{app.badge}</span>}
        </div>
        <div className="text-sm muted">{app.tagline}</div>
        <div className="row row--wrap" style={{ marginTop: 10, gap: 6 }}>
          <span className="tag">{app.category}</span>
          <span className="tag">Owner · {app.owner}</span>
          <span className={cx('badge', app.status === 'operational' ? 'badge--success' : app.status === 'degraded' ? 'badge--warning' : 'badge--info')}>
            <span className={cx('dot', `dot--${app.status}`)} /> {STATUS_LABEL[app.status]}
          </span>
        </div>
      </div>
    </div>
  );

  const footer =
    item.access === 'granted' ? (
      <>
        <button className="btn" onClick={() => toast.result(togglePin(app.id))} aria-pressed={pinned}>
          {pinned ? <PinOff /> : <Pin />} {pinned ? 'Unpin' : 'Pin to dock'}
        </button>
        <button className="btn btn--primary grow" onClick={() => launch(app.id)}>
          <Rocket /> Launch {app.name}
        </button>
      </>
    ) : item.access === 'locked' ? (
      <button className="btn btn--primary btn--block" onClick={submit} disabled={reason.trim().length < 10}>
        <Send /> Request access · {DURATION_LABEL[duration]}
      </button>
    ) : item.access === 'pending' && pending ? (
      <button className="btn btn--danger btn--block" onClick={() => toast.result(cancelRequest(pending.id))}>
        <Ban /> Cancel request
      </button>
    ) : undefined;

  return (
    <Sheet open={!!appId} onClose={close} header={header} footer={footer} label={`${app.name} details`} width={480}>
      <p className="muted">{app.description}</p>

      {item.access === 'granted' && (
        <>
          <div className="appsheet__access appsheet__access--ok">
            <ShieldCheck />
            <div className="grow">
              <div className="appsheet__access-title">You have access</div>
              <div className="text-sm muted">
                {explanation.roles.length > 0 && 'Granted through your role' + (explanation.roles.length > 1 ? 's' : '')}
                {explanation.roles.length === 0 && explanation.grant && 'Temporary access grant'}
              </div>
              <div className="row row--wrap" style={{ marginTop: 8, gap: 6 }}>
                {explanation.roles.map((r) => (
                  <RoleChip key={r.id} name={r.name} color={r.color} />
                ))}
                {explanation.grant && (
                  <span className="badge badge--info">
                    <Hourglass />
                    {explanation.grant.expiresAt ? `Expires ${relativeTime(explanation.grant.expiresAt)}` : 'Permanent grant'}
                    {grantedBy ? ` · by ${grantedBy.name.split(' ')[0]}` : ''}
                  </span>
                )}
              </div>
            </div>
          </div>

          {!!app.quickActions?.length && (
            <>
              <div className="stat-label" style={{ margin: '22px 0 10px' }}>
                Quick actions
              </div>
              <div className="appsheet__actions">
                {app.quickActions.map((qa) => {
                  const Icon = getIcon(qa.icon);
                  return (
                    <button key={qa.label} className="appsheet__action" onClick={() => launch(app.id, qa.label)}>
                      <span className="appsheet__action-icon">
                        <Icon />
                      </span>
                      <span className="grow">{qa.label}</span>
                      <ArrowUpRight size={16} className="faint" />
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className="appsheet__stats">
            <div className="stat">
              <span className="stat-label">Opened</span>
              <span className="stat-value" style={{ fontSize: 22 }}>
                {opened}×
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Last used</span>
              <span className="stat-value" style={{ fontSize: 16 }}>
                {lastUsed ? relativeTime(lastUsed) : 'Never'}
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Added</span>
              <span className="stat-value" style={{ fontSize: 16 }}>
                {formatDate(app.addedAt, { month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>
        </>
      )}

      {item.access === 'pending' && pending && (
        <div className="appsheet__access appsheet__access--pending">
          <Clock />
          <div className="grow">
            <div className="appsheet__access-title">Request pending review</div>
            <div className="text-sm muted">
              Sent {relativeTime(pending.createdAt)} · {DURATION_LABEL[pending.duration]} requested
            </div>
            <blockquote className="appsheet__quote">“{pending.reason}”</blockquote>
            <div className="text-xs faint">
              <Users size={12} style={{ display: 'inline', verticalAlign: '-2px' }} /> {reviewers.length} eligible reviewer
              {reviewers.length === 1 ? '' : 's'} notified
            </div>
          </div>
        </div>
      )}

      {item.access === 'locked' && (
        <>
          <div className="appsheet__access appsheet__access--locked">
            <LockKeyhole />
            <div className="grow">
              <div className="appsheet__access-title">You don’t have access yet</div>
              <div className="text-sm muted">
                Requires <code className="mono accent-ink">{perm}</code>
                {granting.length > 0 ? ' — included in these roles:' : ' — restricted to System Admins.'}
              </div>
              {granting.length > 0 && (
                <div className="row row--wrap" style={{ marginTop: 8, gap: 6 }}>
                  {granting.map((r) => (
                    <RoleChip key={r.id} name={r.name} color={r.color} />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="stack" style={{ marginTop: 20 }}>
            <div className="field">
              <label className="field-label" htmlFor="req-reason">
                Why do you need access?
              </label>
              <textarea
                id="req-reason"
                className="textarea"
                placeholder="e.g. Reviewing customer feedback for the Q4 research synthesis"
                value={reason}
                maxLength={400}
                onChange={(e) => setReason(e.target.value)}
              />
              <span className="field-hint row row--between">
                <span>Be specific — reviewers approve faster with context.</span>
                <span className="mono">{reason.trim().length}/400</span>
              </span>
            </div>
            <div className="field">
              <span className="field-label">Duration</span>
              <Segmented
                label="Access duration"
                value={duration}
                onChange={setDuration}
                options={DURATIONS.map((d) => ({ value: d, label: d === 'permanent' ? 'Permanent' : d.replace('d', ' days') }))}
              />
              <span className="field-hint">
                <KeyRound size={12} style={{ display: 'inline', verticalAlign: '-2px' }} /> Time-boxed access is approved faster and expires
                automatically.
              </span>
            </div>
            <div className="appsheet__route">
              <span className="stat-label">Routing</span>
              <div className="row" style={{ marginTop: 8 }}>
                <span className="text-sm muted grow">
                  {reviewers.length
                    ? `${reviewers.length} reviewer${reviewers.length === 1 ? '' : 's'} who hold this access will be notified.`
                    : 'No delegated reviewers — System Admins will be notified.'}
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {item.access === 'disabled' && (
        <div className="appsheet__access appsheet__access--locked">
          <Ban />
          <div className="grow">
            <div className="appsheet__access-title">Disabled by an administrator</div>
            <div className="text-sm muted">Hidden from everyone except app managers. Re-enable it in Control Center › Apps.</div>
          </div>
        </div>
      )}
    </Sheet>
  );
}
