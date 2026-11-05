import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import {
  Activity,
  AppWindow,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Crown,
  Hourglass,
  Inbox,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  UserX,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useHub } from '@/store/hub';
import { usePermissions, useReviewableRequests } from '@/store/selectors';
import { useNow } from '@/hooks/useNow';
import { AppIcon, EmptyState } from '@/components/ui/primitives';
import { appPermissionId } from '@/data/permissions';
import { SUPER_ADMIN_ROLE_ID } from '@/data/roles';
import { hasPermission, isGrantActive, primaryRole } from '@/lib/rbac';
import { pluralize, relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import type { Grant, User } from '@/types';
import { adminHref } from './adminTabs';
import { Actor, DAY, EMPTY_PERMS, OutcomeBadge, severityTone, toneClass, usePermsByUser, useUserMap, type Tone } from './shared';

const COVERAGE_TOP = 10;

interface Insight {
  id: string;
  tone: Tone;
  Icon: LucideIcon;
  title: string;
  detail: string;
  to?: string;
}

const TONE_RANK: Record<Tone, number> = { danger: 0, warning: 1, info: 2, accent: 3, muted: 4, success: 5 };
const TONE_BADGE: Record<Tone, { cls: string; label: string }> = {
  danger: { cls: 'badge--danger', label: 'Critical' },
  warning: { cls: 'badge--warning', label: 'Review' },
  info: { cls: 'badge--info', label: 'Info' },
  accent: { cls: 'badge--info', label: 'Info' },
  muted: { cls: 'badge--muted', label: 'Note' },
  success: { cls: 'badge--success', label: 'Healthy' },
};

export function OverviewTab() {
  const now = useNow(60_000);
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  const apps = useHub((s) => s.apps);
  const requests = useHub((s) => s.requests);
  const audit = useHub((s) => s.audit);
  const perms = usePermissions();
  const reviewable = useReviewableRequests();
  const permsByUser = usePermsByUser(now);
  const userMap = useUserMap();
  const [showAllCoverage, setShowAllCoverage] = useState(false);

  const canUsers = hasPermission(perms, 'hub.users.manage');
  const canReview = hasPermission(perms, 'hub.requests.review');
  const canApps = hasPermission(perms, 'hub.apps.manage');
  const canAudit = hasPermission(perms, 'hub.audit.view');

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
    const stalePending = pending.filter((r) => now - r.createdAt > DAY).length;
    return { active, pending, enabledApps, operational, degraded, maintenance, temp, permanent, staleHolders, expiring, admins, denied, deniedCritical, stalePending };
  }, [users, requests, apps, audit, now]);

  // ── access coverage ──
  const coverage = useMemo(() => {
    const active = users.filter((u) => u.active);
    return apps
      .filter((a) => a.enabled)
      .map((app) => {
        const perm = appPermissionId(app.id);
        const n = active.reduce((acc, u) => acc + (hasPermission(permsByUser.get(u.id) ?? EMPTY_PERMS, perm) ? 1 : 0), 0);
        return { app, n, pct: active.length ? Math.round((n / active.length) * 100) : 0 };
      })
      .sort((a, b) => b.n - a.n || a.app.name.localeCompare(b.app.name));
  }, [apps, users, permsByUser]);
  const shownCoverage = showAllCoverage ? coverage : coverage.slice(0, COVERAGE_TOP);

  // ── role distribution (each active person counted once, by headline role) ──
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
    if (!dist.total) return 'conic-gradient(var(--surface-3) 0deg 360deg)';
    const gap = dist.rows.length > 1 ? 1.6 : 0;
    let acc = 0;
    const stops = dist.rows.flatMap((r) => {
      const start = acc;
      const end = acc + (r.n / dist.total) * 360;
      acc = end;
      return gap
        ? [`transparent ${start}deg ${start + gap}deg`, `${r.color} ${start + gap}deg ${end}deg`]
        : [`${r.color} ${start}deg ${end}deg`];
    });
    return `conic-gradient(${stops.join(', ')})`;
  }, [dist]);

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

  const openIssues = insights.filter((i) => i.tone === 'danger' || i.tone === 'warning').length;
  const recent = useMemo(() => [...audit].sort((a, b) => b.at - a.at).slice(0, 6), [audit]);

  return (
    <div className="adm-panel">
      <section className="adm-kpis stagger" aria-label="Key metrics">
        <Kpi
          i={0}
          tone="accent"
          Icon={Users}
          label="Active users"
          value={m.active.length}
          total={users.length}
          progress={users.length ? m.active.length / users.length : 0}
          delta={`${users.length - m.active.length} deactivated`}
          to={canUsers ? adminHref('users') : undefined}
        />
        <Kpi
          i={1}
          tone="warning"
          Icon={Inbox}
          label="Pending · for you"
          value={reviewable.length}
          total={m.pending.length}
          delta={reviewable.length ? `${m.pending.length - reviewable.length} with other reviewers` : 'Nothing waiting on you'}
          to={canReview ? adminHref('requests') : undefined}
        />
        <Kpi
          i={2}
          tone="success"
          Icon={Activity}
          label="Apps operational"
          value={m.operational}
          total={m.enabledApps.length}
          progress={m.enabledApps.length ? m.operational / m.enabledApps.length : 0}
          delta={`${m.degraded} degraded · ${m.maintenance} maintenance`}
          to={canApps ? adminHref('apps') : undefined}
        />
        <Kpi
          i={3}
          tone="info"
          Icon={Hourglass}
          label="Temporary grants"
          value={m.temp}
          delta={`${m.expiring.length} expiring ≤ 7d · ${m.permanent} permanent`}
          to={canUsers ? adminHref('users', { grants: 'any' }) : undefined}
        />
        <Kpi
          i={4}
          tone="danger"
          Icon={Crown}
          label="System Admins"
          value={m.admins.length}
          delta="Active · full access (∗)"
          to={canUsers ? adminHref('users', { role: SUPER_ADMIN_ROLE_ID }) : undefined}
        />
        <Kpi
          i={5}
          tone={m.denied.length ? 'danger' : 'success'}
          Icon={ShieldAlert}
          label="Denied · 7 days"
          value={m.denied.length}
          delta={m.deniedCritical ? `${m.deniedCritical} critical` : 'No critical attempts'}
          to={canAudit ? adminHref('audit', { outcome: 'denied' }) : undefined}
        />
      </section>

      <div className="adm-grid-2">
        <section className="card adm-card" aria-labelledby="adm-cov-h">
          <div className="section-head">
            <div>
              <h2 id="adm-cov-h" className="section-title">
                Access coverage <span className="count">{coverage.length} apps</span>
              </h2>
              <p className="text-sm faint">Share of active people who can open each enabled app</p>
            </div>
            {canApps && (
              <Link to={adminHref('apps')} className="btn btn--ghost btn--sm">
                <AppWindow aria-hidden="true" /> Catalog
              </Link>
            )}
          </div>
          {coverage.length === 0 ? (
            <EmptyState icon={<AppWindow />} title="No enabled apps">
              Enable an app in the catalog to see coverage.
            </EmptyState>
          ) : (
            <ul className="adm-bars">
              {shownCoverage.map(({ app, n, pct }, i) => (
                <li
                  key={app.id}
                  className="adm-bar-row"
                  style={{ '--c1': app.gradient[0], '--c2': app.gradient[1], '--i': i } as CSSProperties}
                >
                  <AppIcon app={app} size={28} />
                  <span className="adm-bar-row__name truncate" title={app.name}>
                    {app.name}
                  </span>
                  <span className="adm-bar" role="img" aria-label={`${app.name}: ${pct}% of active people (${n} of ${m.active.length})`}>
                    <span style={{ width: `${Math.max(pct, n ? 2 : 0)}%` }} />
                  </span>
                  <span className="adm-bar-row__pct">
                    <strong>{pct}%</strong>
                    <span className="faint">
                      {n}/{m.active.length}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {coverage.length > COVERAGE_TOP && (
            <button type="button" className="btn btn--ghost btn--sm adm-more" aria-expanded={showAllCoverage} onClick={() => setShowAllCoverage((v) => !v)}>
              {showAllCoverage ? (
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
        </section>

        <section className="card adm-card" aria-labelledby="adm-dist-h">
          <div className="section-head">
            <div>
              <h2 id="adm-dist-h" className="section-title">
                Role distribution
              </h2>
              <p className="text-sm faint">Active people by headline (highest-clearance) role</p>
            </div>
          </div>
          <div className="adm-donut-wrap">
            <div
              className="adm-donut"
              role="img"
              aria-label={`Role distribution: ${dist.rows.map((r) => `${r.name} ${r.n}`).join(', ')}`}
            >
              <span className="adm-donut__glow" style={{ background: donutBg }} />
              <span className="adm-donut__ring" style={{ background: donutBg }} />
              <span className="adm-donut__center">
                <span className="adm-donut__value">{dist.total}</span>
                <span className="adm-micro">people</span>
              </span>
            </div>
            <ul className="adm-legend">
              {dist.rows.map((r) => {
                const pct = dist.total ? Math.round((r.n / dist.total) * 100) : 0;
                const inner = (
                  <>
                    <i className="adm-legend__dot" aria-hidden="true" />
                    <span className="truncate">{r.name}</span>
                    <span className="mono faint text-xs">{pct}%</span>
                    <strong className="mono">{r.n}</strong>
                  </>
                );
                return (
                  <li key={r.id} style={{ '--role': r.color } as CSSProperties}>
                    {canUsers && r.id !== '_none' ? (
                      <Link className="adm-legend__row" to={adminHref('users', { role: r.id })} aria-label={`${r.name}: ${r.n} people (${pct}%). View users`}>
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
            <span className="mono">{dist.assignments}</span> role assignments · avg{' '}
            <span className="mono">{(dist.assignments / Math.max(1, dist.total)).toFixed(1)}</span> roles per person
          </p>
        </section>
      </div>

      <div className="adm-grid-2">
        <section className="card adm-card" aria-labelledby="adm-ins-h">
          <div className="section-head">
            <h2 id="adm-ins-h" className="section-title">
              Security insights
            </h2>
            {openIssues ? (
              <span className="badge badge--warning">{pluralize(openIssues, 'item')} to review</span>
            ) : (
              <span className="badge badge--success">All clear</span>
            )}
          </div>
          <ul className="stack stack--sm">
            {insights.map((ins) => {
              const badge = TONE_BADGE[ins.tone];
              const inner = (
                <>
                  <span className="adm-insight__icon" aria-hidden="true">
                    <ins.Icon />
                  </span>
                  <span className="grow">
                    <span className="adm-insight__title">{ins.title}</span>
                    <span className="adm-insight__detail">{ins.detail}</span>
                  </span>
                  <span className={cx('badge', badge.cls)}>{badge.label}</span>
                  {ins.to && <ChevronRight className="adm-insight__go" aria-hidden="true" />}
                </>
              );
              return (
                <li key={ins.id}>
                  {ins.to ? (
                    <Link to={ins.to} className={cx('adm-insight', 'is-link', toneClass(ins.tone))}>
                      {inner}
                    </Link>
                  ) : (
                    <div className={cx('adm-insight', toneClass(ins.tone))}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card adm-card" aria-labelledby="adm-act-h">
          <div className="section-head">
            <h2 id="adm-act-h" className="section-title">
              Recent activity
            </h2>
            {canAudit && (
              <Link to={adminHref('audit')} className="btn btn--ghost btn--sm">
                Audit log <ArrowRight aria-hidden="true" />
              </Link>
            )}
          </div>
          {recent.length === 0 ? (
            <EmptyState icon={<Activity />} title="No activity yet" />
          ) : (
            <ul className="adm-activity">
              {recent.map((e) => (
                <li key={e.id} className={cx('adm-activity__row', toneClass(severityTone(e.severity)))}>
                  <span className="adm-activity__dot" aria-hidden="true" />
                  <div className="grow">
                    <div className="row row--wrap adm-gap-6">
                      <code className="adm-action">{e.action}</code>
                      {e.outcome === 'denied' && <OutcomeBadge outcome="denied" />}
                    </div>
                    <div className="text-sm adm-activity__target truncate">{e.target}</div>
                    <div className="row text-xs faint adm-gap-6">
                      <Actor user={userMap.get(e.actorId)} size={18} />
                      <span aria-hidden="true">·</span>
                      <time dateTime={new Date(e.at).toISOString()}>{relativeTime(e.at, now)}</time>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Kpi({
  i,
  tone,
  Icon,
  label,
  value,
  total,
  delta,
  progress,
  to,
}: {
  i: number;
  tone: Tone;
  Icon: LucideIcon;
  label: string;
  value: number;
  total?: number;
  delta: string;
  progress?: number;
  to?: string;
}) {
  const body = (
    <>
      <div className="row row--between row--top">
        <span className="stat-label">{label}</span>
        <span className="adm-kpi__icon" aria-hidden="true">
          <Icon />
        </span>
      </div>
      <div className="stat-value">
        {value}
        {total !== undefined && <small> / {total}</small>}
      </div>
      {progress !== undefined && (
        <div className="progress adm-kpi__progress" aria-hidden="true">
          <span style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }} />
        </div>
      )}
      <div className="stat-delta">{delta}</div>
    </>
  );
  const cls = cx('card card--tight adm-kpi', toneClass(tone), to && 'card--interactive');
  const style = { '--i': i } as CSSProperties;
  return to ? (
    <Link to={to} className={cls} style={style} aria-label={`${label}: ${value}${total !== undefined ? ` of ${total}` : ''}. ${delta}`}>
      {body}
    </Link>
  ) : (
    <div className={cls} style={style}>
      {body}
    </div>
  );
}
