/**
 * Admin Control Center — mounted by the router at `/admin/*`.
 *
 * Every tab is shown only to holders of its permission, and every tab route is
 * wrapped in <RequirePermission> so deep links are protected too. The store
 * re-checks permissions on every action regardless — hiding UI is only UX.
 */
import { useMemo, type ComponentType } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router';
import { Check, Fingerprint, Lock } from 'lucide-react';
import { useHub } from '@/store/hub';
import {
  useClearance,
  usePermissions,
  usePrimaryRole,
  useReviewableRequests,
  useRoles,
  useSessionUser,
} from '@/store/selectors';
import { useNow } from '@/hooks/useNow';
import { RequirePermission } from '@/components/auth/Can';
import { Avatar, ClearanceBadge, RoleChip } from '@/components/ui/primitives';
import { ADMIN_PERMISSIONS } from '@/data/permissions';
import { hasPermission, isGrantActive } from '@/lib/rbac';
import { cx } from '@/lib/cx';
import type { Role } from '@/types';
import { ADMIN_TABS, adminHref, type AdminTabId } from './adminTabs';
import { DAY } from './shared';
import { OverviewTab } from './OverviewTab';
import { RequestsTab } from './RequestsTab';
import { UsersTab } from './UsersTab';
import { RolesTab } from './RolesTab';
import { AppsTab } from './AppsTab';
import { AuditTab } from './AuditTab';

const TAB_COMPONENTS: Record<AdminTabId, ComponentType> = {
  overview: OverviewTab,
  requests: RequestsTab,
  users: UsersTab,
  roles: RolesTab,
  apps: AppsTab,
  audit: AuditTab,
};

export function AdminPage() {
  const perms = usePermissions();
  const visibleTabs = useMemo(() => ADMIN_TABS.filter((t) => hasPermission(perms, t.perm)), [perms]);
  const first = visibleTabs[0];
  const home = first ? adminHref(first.id) : '/';

  return (
    <RequirePermission perm={ADMIN_PERMISSIONS} area="Control Center">
      <div className="page adm">
        <header className="page-head adm-head">
          <div>
            <div className="eyebrow">Control Center</div>
            <h1 className="page-title">Control Center</h1>
            <p className="page-sub">
              Govern identities, access and the app catalog. Every change is permission-checked, time-boxed where possible and
              written to the audit trail.
            </p>
          </div>
        </header>

        <AdminHero />
        <AdminTabs />

        <Routes>
          <Route index element={<Navigate replace to={home} />} />
          {ADMIN_TABS.map((t) => {
            const Tab = TAB_COMPONENTS[t.id];
            return (
              <Route
                key={t.id}
                path={t.id}
                element={
                  <RequirePermission perm={t.perm} area={`Control Center · ${t.label}`}>
                    <Tab />
                  </RequirePermission>
                }
              />
            );
          })}
          <Route path="*" element={<Navigate replace to={home} />} />
        </Routes>
      </div>
    </RequirePermission>
  );
}

// ─────────────────────────── tabs ───────────────────────────

function AdminTabs() {
  const perms = usePermissions();
  const reviewable = useReviewableRequests();
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  const apps = useHub((s) => s.apps);
  const audit = useHub((s) => s.audit);
  const now = useNow(60_000);

  const denied24h = useMemo(() => audit.filter((a) => a.outcome === 'denied' && a.at >= now - DAY).length, [audit, now]);

  const counts: Partial<Record<AdminTabId, { value: number; alert?: boolean; label: string }>> = {
    requests: { value: reviewable.length, alert: true, label: `${reviewable.length} awaiting your review` },
    users: { value: users.length, label: `${users.length} people` },
    roles: { value: roles.length, label: `${roles.length} roles` },
    apps: { value: apps.length, label: `${apps.length} apps` },
    audit: { value: denied24h, alert: true, label: `${denied24h} denied attempts in the last 24 hours` },
  };

  return (
    <nav className="tabs adm-tabs" aria-label="Control Center sections">
      {ADMIN_TABS.filter((t) => hasPermission(perms, t.perm)).map((t) => {
        const c = counts[t.id];
        const Icon = t.icon;
        return (
          <NavLink key={t.id} to={adminHref(t.id)} className={({ isActive }) => 'tab' + (isActive ? ' is-active' : '')}>
            <Icon aria-hidden="true" />
            {t.label}
            {c && c.alert && c.value > 0 && (
              <span className={cx('counter', t.id === 'audit' && 'adm-counter--warn')}>
                <span aria-hidden="true">{c.value > 99 ? '99+' : c.value}</span>
                <span className="sr-only">, {c.label}</span>
              </span>
            )}
            {c && !c.alert && (
              <span className="adm-tab-count">
                <span aria-hidden="true">{c.value}</span>
                <span className="sr-only">, {c.label}</span>
              </span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

// ─────────────────────────── hero ───────────────────────────

function AdminHero() {
  const me = useSessionUser();
  const role = usePrimaryRole();
  const clearance = useClearance();
  const roles = useRoles();
  const perms = usePermissions();
  const users = useHub((s) => s.users);
  const audit = useHub((s) => s.audit);
  const reviewable = useReviewableRequests();
  const now = useNow(60_000);

  const stats = useMemo(() => {
    let liveGrants = 0;
    let active = 0;
    for (const u of users) {
      if (!u.active) continue;
      active += 1;
      liveGrants += u.grants.filter((g) => isGrantActive(g, now)).length;
    }
    const events24h = audit.filter((a) => a.at >= now - DAY).length;
    const denied24h = audit.filter((a) => a.at >= now - DAY && a.outcome === 'denied').length;
    return { active, total: users.length, liveGrants, events24h, denied24h };
  }, [users, audit, now]);

  if (!me) return null;
  const otherRoles = me.roleIds
    .map((id) => roles.find((r) => r.id === id))
    .filter((r): r is Role => !!r && r.id !== role?.id);
  const canReview = hasPermission(perms, 'hub.requests.review');

  return (
    <section className="card glow-border hud adm-hero" aria-label="Your admin session">
      <span className="adm-hero__scan" aria-hidden="true" />
      <div className="adm-hero__id">
        <Avatar user={me} size={58} presence />
        <div className="grow">
          <div className="adm-micro adm-hero__op">
            <Fingerprint aria-hidden="true" /> Operator · session verified
          </div>
          <div className="adm-hero__name truncate">{me.name}</div>
          <div className="text-sm muted truncate">{me.title}</div>
          <div className="adm-hero__roles">
            <ClearanceBadge level={clearance} label={role?.name} />
            {otherRoles.map((r) => (
              <RoleChip key={r.id} name={r.name} color={r.color} />
            ))}
          </div>
        </div>
      </div>

      <div className="adm-hero__side">
        <div className="adm-hero__stats">
          <HeroStat
            label="Awaiting you"
            value={canReview ? reviewable.length : '—'}
            hint={canReview ? (reviewable.length ? 'Requests to review' : 'Inbox zero') : 'No review rights'}
            hot={canReview && reviewable.length > 0}
          />
          <HeroStat label="Active people" value={stats.active} suffix={`/${stats.total}`} hint="Identities enabled" />
          <HeroStat label="Live grants" value={stats.liveGrants} hint="Direct, non-expired" />
          <HeroStat
            label="Events · 24h"
            value={stats.events24h}
            hint={stats.denied24h ? `${stats.denied24h} denied` : 'No denials'}
            hot={stats.denied24h > 0}
          />
        </div>
        <div className="adm-scope" aria-label="Your admin scope">
          <span className="adm-micro">Scope</span>
          {ADMIN_TABS.map((t) => {
            const on = hasPermission(perms, t.perm);
            return (
              <span key={t.id} className={cx('adm-scope__item', on && 'is-on')} title={on ? `You can access ${t.label}` : `Requires ${t.perm}`}>
                {on ? <Check aria-hidden="true" /> : <Lock aria-hidden="true" />}
                {t.short}
                <span className="sr-only">{on ? '(granted)' : '(not granted)'}</span>
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function HeroStat({
  label,
  value,
  suffix,
  hint,
  hot,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  hint: string;
  hot?: boolean;
}) {
  return (
    <div className={cx('adm-hero-stat', hot && 'is-hot')}>
      <span className="adm-micro">{label}</span>
      <span className="adm-hero-stat__value">
        {value}
        {suffix && <small>{suffix}</small>}
      </span>
      <span className="adm-hero-stat__hint">{hint}</span>
    </div>
  );
}
