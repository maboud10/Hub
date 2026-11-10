/**
 * Control deck — the Control Center home.
 * Attention banners, HUD ribbon, Nova "Ask about access", security insights,
 * access coverage and role mix; side column: your clearance & scope, grants
 * about to expire and the live audit feed.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import {
  Activity,
  AppWindow,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Clock,
  Crown,
  Fingerprint,
  Hourglass,
  Inbox,
  KeyRound,
  Lock,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  UserX,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { NeoBanner, NeoBanners, NeoEmpty, NeoHome, NeoKpi, NeoKpis, NeoPanel } from '@/components/neo';
import { useHub } from '@/store/hub';
import { useClearance, usePermissions, usePrimaryRole, useReviewableRequests, useSessionUser } from '@/store/selectors';
import { useNow } from '@/hooks/useNow';
import { AppIcon, Avatar, ClearanceBadge, RoleChip } from '@/components/ui/primitives';
import { appPermissionId } from '@/data/permissions';
import { SUPER_ADMIN_ROLE_ID } from '@/data/roles';
import { hasPermission, isGrantActive, primaryRole, requestRisk } from '@/lib/rbac';
import { pluralize, relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import type { AuditEntry, Grant, HubApp, Role, User } from '@/types';
import { ADMIN_TABS, adminHref } from './adminTabs';
import { AccessNova } from './AccessNova';
import { useAdminChrome } from './chrome';
import { Actor, DAY, EMPTY_PERMS, OutcomeBadge, permLabel, severityTone, toneClass, useAppMap, usePermsByUser, useUserMap, type Tone } from './shared';

const COVERAGE_TOP = 8;

interface Insight {
  id: string;
  tone: Tone;
  Icon: LucideIcon;
  title: string;
  detail: string;
  to?: string;
}

const TONE_RANK: Record<Tone, number> = { danger: 0, warning: 1, info: 2, accent: 3, muted: 4, success: 5 };
const TONE_LABEL: Record<Tone, string> = { danger: 'Critical', warning: 'Review', info: 'Info', accent: 'Info', muted: 'Note', success: 'Healthy' };

export function OverviewTab() {
  const now = useNow(60_000);
  const me = useSessionUser();
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  const apps = useHub((s) => s.apps);
  const requests = useHub((s) => s.requests);
  const audit = useHub((s) => s.audit);
  const perms = usePermissions();
  const reviewable = useReviewableRequests();
  const userMap = useUserMap();
  const appMap = useAppMap();

  const canUsers = hasPermission(perms, 'hub.users.manage');
  const canReview = hasPermission(perms, 'hub.requests.review');
  const canApps = hasPermission(perms, 'hub.apps.manage');
  const canAudit = hasPermission(perms, 'hub.audit.view');
  const canRoles = hasPermission(perms, 'hub.roles.manage');
  const scope = useMemo(
    () => ({ users: canUsers, review: canReview, audit: canAudit, apps: canApps, roles: canRoles }),
    [canUsers, canReview, canAudit, canApps, canRoles],
  );

  // ── headline metrics ──
  const m = useMemo(() => {
    const active = users.filter((u) => u.active);
    const pending = requests.filter((r) => r.status === 'pending');
    const enabledApps = apps.filter((a) => a.enabled);
    const operational = enabledApps.filter((a) => a.status === 'operational').length;
    const degraded = enabledApps.filter((a) => a.status === 'degraded').length;
    const maintenance = enabledApps.filter((a) => a.status === 'maintenance').length;
    let temp = 0;
    let permanent = 0;
    let staleHolders = 0;
    const expiring: Array<{ user: User; grant: Grant }> = [];
    for (const u of users) {
      const live = u.grants.filter((g) => isGrantActive(g, now));
      if (!u.active) {
        if (live.length) staleHolders += 1;
        continue;
      }
      for (const g of live) {
        if (g.expiresAt === null) permanent += 1;
        else {
          temp += 1;
          if (g.expiresAt - now <= 7 * DAY) expiring.push({ user: u, grant: g });
        }
      }
    }
    expiring.sort((a, b) => (a.grant.expiresAt ?? 0) - (b.grant.expiresAt ?? 0));
    const admins = active.filter((u) => u.roleIds.includes(SUPER_ADMIN_ROLE_ID));
    const denied = audit.filter((a) => a.outcome === 'denied' && a.at >= now - 7 * DAY);
    const deniedCritical = denied.filter((a) => a.severity === 'critical').length;
    const last24 = audit.filter((a) => a.at >= now - DAY);
    const denied24 = last24.filter((a) => a.outcome === 'denied').sort((a, b) => b.at - a.at);
    const stalePending = pending.filter((r) => now - r.createdAt > DAY).length;
    return {
      active,
      pending,
      enabledApps,
      operational,
      degraded,
      maintenance,
      temp,
      permanent,
      staleHolders,
      expiring,
      admins,
      denied,
      deniedCritical,
      events24h: last24.length,
      denied24,
      stalePending,
    };
  }, [users, requests, apps, audit, now]);

  const queue = useMemo(() => {
    const oldest = [...reviewable].sort((a, b) => a.createdAt - b.createdAt)[0];
    const high = reviewable.filter((r) => {
      const app = appMap.get(r.appId);
      const u = userMap.get(r.userId);
      return app && u ? requestRisk(app, u, roles, r.duration) === 'high' : false;
    }).length;
    return { oldest, high };
  }, [reviewable, appMap, userMap, roles]);

  // ── security insights ──
  const insights = useMemo<Insight[]>(() => {
    const list: Insight[] = [];
    const usersLink = (q: Record<string, string>) => (canUsers ? adminHref('users', q) : undefined);

    if (m.expiring.length) {
      const names = [...new Set(m.expiring.map((e) => e.user.name.split(' ')[0]))].slice(0, 3).join(', ');
      list.push({
        id: 'expiring',
        tone: 'warning',
        Icon: Hourglass,
        title: `${pluralize(m.expiring.length, 'temporary grant')} expiring within 7 days`,
        detail: `${names}${m.expiring.length > 3 ? ' and others' : ''} — renew or let them lapse.`,
        to: usersLink({ grants: 'expiring' }),
      });
    } else {
      list.push({ id: 'expiring', tone: 'success', Icon: Hourglass, title: 'No grants expiring this week', detail: 'Time-boxed access is on track.' });
    }

    list.push(
      m.permanent
        ? {
            id: 'permanent',
            tone: 'warning',
            Icon: KeyRound,
            title: `${pluralize(m.permanent, 'permanent direct grant')}`,
            detail: 'Standing access bypasses time-boxing. Prefer roles or 90-day grants.',
            to: usersLink({ grants: 'permanent' }),
          }
        : { id: 'permanent', tone: 'success', Icon: KeyRound, title: 'No permanent direct grants', detail: 'All direct access expires automatically.' },
    );

    const adminCount = m.admins.length;
    list.push({
      id: 'admins',
      tone: adminCount <= 1 ? 'warning' : adminCount > 3 ? 'warning' : 'success',
      Icon: Crown,
      title: `${pluralize(adminCount, 'active System Admin')}`,
      detail:
        adminCount <= 1
          ? 'Single point of failure — add a second, break-glass admin.'
          : adminCount > 3
            ? 'Large super-admin footprint. Review who truly needs full access.'
            : 'Healthy super-admin footprint.',
      to: usersLink({ role: SUPER_ADMIN_ROLE_ID }),
    });

    list.push(
      m.staleHolders
        ? {
            id: 'stale',
            tone: 'danger',
            Icon: UserX,
            title: `${pluralize(m.staleHolders, 'deactivated account')} still holding grants`,
            detail: 'Dormant grants would revive on reactivation. Revoke what is no longer needed.',
            to: usersLink({ status: 'inactive', grants: 'any' }),
          }
        : { id: 'stale', tone: 'success', Icon: UserX, title: 'No dormant grants on deactivated accounts', detail: 'Offboarding hygiene looks good.' },
    );

    const auditLink = canAudit ? adminHref('audit', { outcome: 'denied' }) : undefined;
    list.push(
      m.denied.length
        ? {
            id: 'denied',
            tone: m.deniedCritical ? 'danger' : 'warning',
            Icon: ShieldAlert,
            title: `${pluralize(m.denied.length, 'denied attempt')} in the last 7 days`,
            detail: m.deniedCritical ? `${m.deniedCritical} critical — e.g. privilege-escalation or self-approval attempts.` : 'Blocked by the policy engine and logged.',
            to: auditLink,
          }
        : { id: 'denied', tone: 'success', Icon: ShieldCheck, title: 'No denied attempts this week', detail: 'Nobody hit an access boundary.' },
    );

    if (m.stalePending) {
      list.push({
        id: 'pending',
        tone: 'warning',
        Icon: Clock,
        title: `${pluralize(m.stalePending, 'request')} waiting over 24 hours`,
        detail: 'Slow approvals push people toward workarounds.',
        to: canReview ? adminHref('requests') : undefined,
      });
    }

    const unhealthy = m.degraded + m.maintenance;
    if (unhealthy) {
      list.push({
        id: 'apps',
        tone: 'info',
        Icon: Wrench,
        title: `${pluralize(unhealthy, 'app')} not fully operational`,
        detail: `${m.degraded} degraded · ${m.maintenance} in maintenance.`,
        to: canApps ? adminHref('apps') : undefined,
      });
    }

    return list.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]);
  }, [m, canUsers, canAudit, canReview, canApps]);

  useAdminChrome({
    actions: (
      <>
        {canAudit && (
          <Link to={adminHref('audit')} className="neo-btn neo-btn--soft">
            <ScrollText /> <span className="neo-btn__label">Audit log</span>
          </Link>
        )}
        {canReview ? (
          <Link to={adminHref('requests')} className="neo-btn neo-btn--plasma" data-qa="adm-review">
            <Inbox /> <span className="neo-btn__label">Review requests</span>
            {reviewable.length > 0 && <span className="adm-btn-count">{reviewable.length}</span>}
          </Link>
        ) : (
          canUsers && (
            <Link to={adminHref('users')} className="neo-btn neo-btn--plasma">
              <Users /> <span className="neo-btn__label">People</span>
            </Link>
          )
        )}
      </>
    ),
  });

  const lastDenied = m.denied24[0];
  const showBanners = (canReview && reviewable.length > 0) || m.denied24.length > 0 || m.staleHolders > 0;

  return (
    <>
      {showBanners && (
        <NeoBanners>
          {canReview && reviewable.length > 0 && (
            <NeoBanner
              tone="warning"
              icon={<Inbox />}
              title={`${pluralize(reviewable.length, 'request')} awaiting your review`}
              meta={queue.oldest ? `Oldest ${relativeTime(queue.oldest.createdAt, now)}` : undefined}
              to={adminHref('requests')}
            >
              {queue.high ? `${queue.high} high risk · ` : ''}
              {queue.oldest
                ? `${userMap.get(queue.oldest.userId)?.name ?? 'Someone'} → ${appMap.get(queue.oldest.appId)?.name ?? queue.oldest.appId}, waiting the longest.`
                : 'Delegated to you as an app holder.'}
            </NeoBanner>
          )}
          {m.denied24.length > 0 && (
            <NeoBanner
              tone="danger"
              icon={<ShieldAlert />}
              title={`${pluralize(m.denied24.length, 'denied attempt')} in the last 24 hours`}
              meta={lastDenied ? relativeTime(lastDenied.at, now) : undefined}
              to={canAudit ? adminHref('audit', { outcome: 'denied' }) : undefined}
            >
              {lastDenied ? `${userMap.get(lastDenied.actorId)?.name ?? 'System'} — ${lastDenied.detail ?? lastDenied.target}` : 'Blocked by the policy engine.'}
            </NeoBanner>
          )}
          {m.staleHolders > 0 && (
            <NeoBanner
              tone="danger"
              icon={<UserX />}
              title={`${pluralize(m.staleHolders, 'deactivated account')} still holding grants`}
              to={canUsers ? adminHref('users', { status: 'inactive', grants: 'any' }) : undefined}
            >
              Dormant grants revive on reactivation — revoke what’s no longer needed.
            </NeoBanner>
          )}
        </NeoBanners>
      )}

      <NeoKpis label="Control Center at a glance">
        <NeoKpi
          icon={<Inbox />}
          label="Awaiting you"
          value={canReview ? reviewable.length : '—'}
          sub={
            canReview
              ? reviewable.length
                ? `${queue.high} high risk · oldest ${queue.oldest ? relativeTime(queue.oldest.createdAt, now).replace(' ago', '') : '—'}`
                : 'Inbox zero'
              : 'No review rights'
          }
          tone={canReview && reviewable.length ? 'warning' : undefined}
          to={canReview ? adminHref('requests') : undefined}
        />
        <NeoKpi
          icon={<Users />}
          label="Active people"
          value={
            <>
              {m.active.length}
              <small>/{users.length}</small>
            </>
          }
          sub={`${users.length - m.active.length} deactivated`}
          to={canUsers ? adminHref('users') : undefined}
        />
        <NeoKpi
          icon={<KeyRound />}
          label="Live grants"
          value={m.temp + m.permanent}
          sub={`${m.expiring.length} expiring ≤ 7d · ${m.permanent} permanent`}
          to={canUsers ? adminHref('users', { grants: 'any' }) : undefined}
        />
        <NeoKpi
          icon={<Activity />}
          label="Events · 24h"
          value={m.events24h}
          sub={m.denied24.length ? `${m.denied24.length} denied` : 'No denials'}
          tone={m.denied24.length ? 'danger' : undefined}
          to={canAudit ? adminHref('audit') : undefined}
        />
        <NeoKpi
          icon={<AppWindow />}
          label="Apps operational"
          value={
            <>
              {m.operational}
              <small>/{m.enabledApps.length}</small>
            </>
          }
          sub={`${m.degraded} degraded · ${m.maintenance} maintenance`}
          tone={m.degraded ? 'warning' : undefined}
          to={canApps ? adminHref('apps') : undefined}
        />
      </NeoKpis>

      <NeoHome
        sideLabel="Your control overview"
        main={
          <>
            <AccessNova can={scope} myPerms={perms} meId={me?.id} />
            <InsightsPanel insights={insights} />
            <div className="adm-duo">
              <CoveragePanel canApps={canApps} now={now} />
              <RoleMixPanel canUsers={canUsers} />
            </div>
          </>
        }
        side={
          <>
            <SessionPanel />
            <ExpiringPanel expiring={m.expiring} canUsers={canUsers} now={now} appMap={appMap} />
            <ActivityPanel audit={audit} canAudit={canAudit} now={now} />
          </>
        }
      />
    </>
  );
}

// ─────────────────────────── main column ───────────────────────────

function InsightsPanel({ insights }: { insights: Insight[] }) {
  const open = insights.filter((i) => i.tone === 'danger' || i.tone === 'warning').length;
  return (
    <NeoPanel
      hud="Posture"
      title="Security insights"
      actions={
        open ? (
          <span className="neo-chip" data-tone="warning">
            {pluralize(open, 'item')} to review
          </span>
        ) : (
          <span className="neo-chip" data-tone="success">
            All clear
          </span>
        )
      }
    >
      <div className="adm-insights neo-stagger">
        {insights.map((ins, i) => {
          const inner = (
            <>
              <span className="adm-insight__icon" aria-hidden="true">
                <ins.Icon />
              </span>
              <span className="adm-insight__title">{ins.title}</span>
              <span className="adm-insight__detail">{ins.detail}</span>
              <span className="adm-insight__go" aria-hidden={ins.to ? 'true' : undefined}>
                {ins.to ? (
                  <>
                    Review <ArrowRight />
                  </>
                ) : (
                  TONE_LABEL[ins.tone]
                )}
              </span>
            </>
          );
          const cls = cx('adm-insight', toneClass(ins.tone), ins.to && 'is-link neo-spot');
          const style = { '--i': i } as CSSProperties;
          return ins.to ? (
            <Link key={ins.id} to={ins.to} className={cls} style={style}>
              {inner}
            </Link>
          ) : (
            <div key={ins.id} className={cls} style={style}>
              {inner}
            </div>
          );
        })}
      </div>
    </NeoPanel>
  );
}

function CoveragePanel({ canApps, now }: { canApps: boolean; now: number }) {
  const apps = useHub((s) => s.apps);
  const users = useHub((s) => s.users);
  const permsByUser = usePermsByUser(now);
  const [showAll, setShowAll] = useState(false);

  const { coverage, active } = useMemo(() => {
    const act = users.filter((u) => u.active);
    const rows = apps
      .filter((a) => a.enabled)
      .map((app) => {
        const perm = appPermissionId(app.id);
        const n = act.reduce((acc, u) => acc + (hasPermission(permsByUser.get(u.id) ?? EMPTY_PERMS, perm) ? 1 : 0), 0);
        return { app, n, pct: act.length ? Math.round((n / act.length) * 100) : 0 };
      })
      .sort((a, b) => b.n - a.n || a.app.name.localeCompare(b.app.name));
    return { coverage: rows, active: act.length };
  }, [apps, users, permsByUser]);
  const shown = showAll ? coverage : coverage.slice(0, COVERAGE_TOP);

  return (
    <NeoPanel
      hud="Reach"
      title="Access coverage"
      actions={
        canApps ? (
          <Link to={adminHref('apps')} className="neo-btn neo-btn--ghost neo-btn--xs">
            Catalog <ArrowRight />
          </Link>
        ) : undefined
      }
    >
      <p className="adm-panel-sub">Share of active people who can open each enabled app · {pluralize(coverage.length, 'app')}</p>
      {coverage.length === 0 ? (
        <NeoEmpty compact icon={<AppWindow />} title="No enabled apps">
          Enable an app in the catalog to see coverage.
        </NeoEmpty>
      ) : (
        <ul className="adm-bars">
          {shown.map(({ app, n, pct }, i) => (
            <li key={app.id} className="adm-bar-row" style={{ '--c1': app.gradient[0], '--c2': app.gradient[1], '--i': i } as CSSProperties}>
              <AppIcon app={app} size={26} />
              <span className="adm-bar-row__name truncate" title={app.name}>
                {app.name}
              </span>
              <span className="adm-bar" role="img" aria-label={`${app.name}: ${pct}% of active people (${n} of ${active})`}>
                <span style={{ width: `${Math.max(pct, n ? 2 : 0)}%` }} />
              </span>
              <span className="adm-bar-row__pct">
                <strong>{pct}%</strong>
                <span className="neo-faint">
                  {n}/{active}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {coverage.length > COVERAGE_TOP && (
        <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm neo-btn--block adm-more" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
          {showAll ? (
            <>
              Show top {COVERAGE_TOP} <ChevronUp aria-hidden="true" />
            </>
          ) : (
            <>
              Show all {coverage.length} <ChevronDown aria-hidden="true" />
            </>
          )}
        </button>
      )}
    </NeoPanel>
  );
}

function RoleMixPanel({ canUsers }: { canUsers: boolean }) {
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);

  // Each active person counted once, by headline role.
  const dist = useMemo(() => {
    const active = users.filter((u) => u.active);
    const counts = new Map<string, number>();
    let none = 0;
    for (const u of active) {
      const r = primaryRole(u, roles);
      if (r) counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
      else none += 1;
    }
    const rows = roles
      .filter((r) => counts.has(r.id))
      .map((r) => ({ id: r.id, name: r.name, color: r.color, n: counts.get(r.id) ?? 0 }))
      .sort((a, b) => b.n - a.n);
    if (none) rows.push({ id: '_none', name: 'No role', color: 'var(--text-3)', n: none });
    const assignments = active.reduce((acc, u) => acc + u.roleIds.length, 0);
    return { rows, total: active.length, assignments };
  }, [users, roles]);

  const donutBg = useMemo(() => {
    if (!dist.total) return 'conic-gradient(var(--track) 0deg 360deg)';
    const gap = dist.rows.length > 1 ? 1.6 : 0;
    let acc = 0;
    const stops = dist.rows.flatMap((r) => {
      const start = acc;
      const end = acc + (r.n / dist.total) * 360;
      acc = end;
      return gap ? [`transparent ${start}deg ${start + gap}deg`, `${r.color} ${start + gap}deg ${end}deg`] : [`${r.color} ${start}deg ${end}deg`];
    });
    return `conic-gradient(${stops.join(', ')})`;
  }, [dist]);

  return (
    <NeoPanel hud="Identity mix" title="Role distribution">
      <p className="adm-panel-sub">Active people by headline (highest-clearance) role</p>
      <div className="adm-donut-wrap">
        <div className="adm-donut" role="img" aria-label={`Role distribution: ${dist.rows.map((r) => `${r.name} ${r.n}`).join(', ')}`}>
          <span className="adm-donut__glow" style={{ background: donutBg }} />
          <span className="adm-donut__ring" style={{ background: donutBg }} />
          <span className="adm-donut__center">
            <span className="adm-donut__value">{dist.total}</span>
            <span className="neo-hud">people</span>
          </span>
        </div>
        <ul className="adm-legend">
          {dist.rows.map((r) => {
            const pct = dist.total ? Math.round((r.n / dist.total) * 100) : 0;
            const inner = (
              <>
                <i className="adm-legend__dot" aria-hidden="true" />
                <span className="truncate">{r.name}</span>
                <span className="neo-mono neo-faint adm-legend__pct">{pct}%</span>
                <strong className="neo-mono">{r.n}</strong>
              </>
            );
            return (
              <li key={r.id} style={{ '--role': r.color } as CSSProperties}>
                {canUsers && r.id !== '_none' ? (
                  <Link className="adm-legend__row" to={adminHref('users', { role: r.id })} aria-label={`${r.name}: ${r.n} people (${pct}%). View people`}>
                    {inner}
                  </Link>
                ) : (
                  <div className="adm-legend__row">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <p className="adm-foot-note">
        <span className="neo-mono">{dist.assignments}</span> role assignments · avg <span className="neo-mono">{(dist.assignments / Math.max(1, dist.total)).toFixed(1)}</span>{' '}
        roles per person
      </p>
    </NeoPanel>
  );
}

// ─────────────────────────── side column ───────────────────────────

function SessionPanel() {
  const me = useSessionUser();
  const role = usePrimaryRole();
  const clearance = useClearance();
  const roles = useHub((s) => s.roles);
  const perms = usePermissions();
  if (!me) return null;
  const otherRoles = me.roleIds.map((id) => roles.find((r) => r.id === id)).filter((r): r is Role => !!r && r.id !== role?.id);

  return (
    <NeoPanel
      hud="Your session"
      title="Clearance & scope"
      actions={
        <span className="neo-chip neo-chip--sm" data-tone="success" title="Signed in with a verified session">
          <ShieldCheck aria-hidden="true" /> Verified
        </span>
      }
    >
      <div className="adm-op">
        <Avatar user={me} size={46} presence />
        <div className="adm-op__id">
          <b className="truncate">{me.name}</b>
          <span className="truncate">{me.title}</span>
        </div>
        <Fingerprint className="adm-op__print" aria-hidden="true" />
      </div>
      <div className="adm-op__roles">
        <ClearanceBadge level={clearance} label={role?.name} />
        {otherRoles.map((r) => (
          <RoleChip key={r.id} name={r.name} color={r.color} />
        ))}
      </div>
      <div className="adm-scope" role="list" aria-label="Your Control Center scope">
        {ADMIN_TABS.map((t) => {
          const on = hasPermission(perms, t.perm);
          return (
            <span key={t.id} role="listitem" className={cx('adm-scope__item', on && 'is-on')} title={on ? `You can open ${t.label}` : `Requires ${t.perm}`}>
              {on ? <Check aria-hidden="true" /> : <Lock aria-hidden="true" />}
              {t.rail}
              <span className="sr-only">{on ? '(granted)' : '(not granted)'}</span>
            </span>
          );
        })}
      </div>
    </NeoPanel>
  );
}

function ExpiringPanel({
  expiring,
  canUsers,
  now,
  appMap,
}: {
  expiring: Array<{ user: User; grant: Grant }>;
  canUsers: boolean;
  now: number;
  appMap: Map<string, HubApp>;
}) {
  return (
    <NeoPanel
      hud="Time-boxed"
      title="Expiring grants"
      actions={
        canUsers && expiring.length > 0 ? (
          <Link to={adminHref('users', { grants: 'expiring' })} className="neo-btn neo-btn--ghost neo-btn--xs">
            All <ArrowRight />
          </Link>
        ) : undefined
      }
    >
      {expiring.length === 0 ? (
        <div className="adm-allclear">
          <CircleCheck aria-hidden="true" />
          <div>
            <b>Nothing expires this week</b>
            <span>Time-boxed access is on track.</span>
          </div>
        </div>
      ) : (
        <ul className="adm-mini-list">
          {expiring.slice(0, 5).map(({ user, grant }) => {
            const days = Math.max(0, Math.ceil(((grant.expiresAt ?? now) - now) / DAY));
            return (
              <li key={`${user.id}:${grant.permission}`} className="adm-mini-row">
                <Avatar user={user} size={30} />
                <span className="adm-mini-row__text">
                  <b className="truncate">{user.name}</b>
                  <span className="truncate">
                    {permLabel(grant.permission, appMap)} · {grant.expiresAt ? relativeTime(grant.expiresAt, now) : 'never'}
                  </span>
                </span>
                <span className="neo-chip neo-chip--sm" data-tone={days <= 2 ? 'danger' : 'warning'}>
                  {days}d
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </NeoPanel>
  );
}

function ActivityPanel({ audit, canAudit, now }: { audit: AuditEntry[]; canAudit: boolean; now: number }) {
  const userMap = useUserMap();
  const recent = useMemo(() => [...audit].sort((a, b) => b.at - a.at).slice(0, 6), [audit]);
  return (
    <NeoPanel
      hud="Live"
      title="Recent activity"
      actions={
        canAudit ? (
          <Link to={adminHref('audit')} className="neo-btn neo-btn--ghost neo-btn--xs">
            All <ArrowRight />
          </Link>
        ) : undefined
      }
    >
      {recent.length === 0 ? (
        <NeoEmpty compact icon={<Activity />} title="No activity yet" />
      ) : (
        <ul className="adm-activity">
          {recent.map((e) => (
            <li key={e.id} className={cx('adm-activity__row', toneClass(severityTone(e.severity)))}>
              <span className="adm-activity__dot" aria-hidden="true" />
              <div className="adm-activity__body">
                <div className="adm-activity__top">
                  <code className="adm-action">{e.action}</code>
                  {e.outcome === 'denied' && <OutcomeBadge outcome="denied" />}
                </div>
                <div className="adm-activity__target truncate">{e.target}</div>
                <div className="adm-activity__meta">
                  <Actor user={userMap.get(e.actorId)} size={16} />
                  <span aria-hidden="true">·</span>
                  <time dateTime={new Date(e.at).toISOString()}>{relativeTime(e.at, now)}</time>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </NeoPanel>
  );
}
