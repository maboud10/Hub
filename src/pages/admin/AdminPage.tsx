/**
 * Admin Control Center — mounted by the router at `/admin/*`.
 *
 * Every tab is shown only to holders of its permission, and every tab route is
 * wrapped in <RequirePermission> so deep links are protected too. The store
 * re-checks permissions on every action regardless — hiding UI is only UX.
 *
 * NEO workspace ("Control deck"): rail (Overview · Requests · People · Roles ·
 * Apps · Audit — only the tabs you hold) + glass stage. The header follows the
 * active section (SECTIONS); tabs publish their own header actions and toolbar
 * row through `useAdminChrome` (see ./chrome).
 */
import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { Fingerprint, LockKeyhole } from 'lucide-react';
import { NeoAppFrame, isNavActive, type NeoHeadProps, type NeoNavItem } from '@/components/neo';
import { useHub } from '@/store/hub';
import { useClearance, usePermissions, usePrimaryRole, useReviewableRequests, useSessionUser } from '@/store/selectors';
import { useNow } from '@/hooks/useNow';
import { RequirePermission } from '@/components/auth/Can';
import { ADMIN_PERMISSIONS } from '@/data/permissions';
import { hasPermission } from '@/lib/rbac';
import { firstName, greeting, pluralize } from '@/lib/format';
import { ADMIN_BASE, ADMIN_TABS, adminHref, type AdminTabDef, type AdminTabId } from './adminTabs';
import { AdminChromeProvider, type AdminChrome } from './chrome';
import { CLEARANCE_NAMES, DAY } from './shared';
import { OverviewTab } from './OverviewTab';
import { RequestsTab } from './RequestsTab';
import { UsersTab } from './UsersTab';
import { RolesTab } from './RolesTab';
import { AppsTab } from './AppsTab';
import { AuditTab } from './AuditTab';

const TINT = { c1: '#38bdf8', c2: '#818cf8' };

const TAB_COMPONENTS: Record<AdminTabId, ComponentType> = {
  overview: OverviewTab,
  requests: RequestsTab,
  users: UsersTab,
  roles: RolesTab,
  apps: AppsTab,
  audit: AuditTab,
};

interface Section {
  eyebrow: string;
  title: string;
  sub: string;
}

/** Header per route. The Overview (home) swaps in a greeting + your clearance. */
const SECTIONS: Record<AdminTabId, Section> = {
  overview: { eyebrow: 'Control deck', title: 'Overview', sub: 'Identity, access and audit at a glance.' },
  requests: {
    eyebrow: 'Control Center · Access',
    title: 'Access requests',
    sub: 'Approve or deny time-boxed access — oldest first, delegated to the people who hold the app.',
  },
  users: {
    eyebrow: 'Control Center · Identity',
    title: 'People & access',
    sub: 'Roles, direct grants and account status for every identity in NEXUS.',
  },
  roles: {
    eyebrow: 'Control Center · Policy',
    title: 'Roles & permissions',
    sub: 'The role catalog and the permission matrix behind every access check.',
  },
  apps: {
    eyebrow: 'Control Center · Catalog',
    title: 'App catalog',
    sub: 'Register apps, set status and discoverability, and see who can open them.',
  },
  audit: {
    eyebrow: 'Control Center · Security',
    title: 'Audit log',
    sub: 'Every permission-checked action — filter the trail, spot denials, export evidence.',
  },
};

export function AdminPage() {
  return (
    <AdminShell>
      <RequirePermission perm={ADMIN_PERMISSIONS} area="Control Center">
        <AdminRoutes />
      </RequirePermission>
    </AdminShell>
  );
}

// ─────────────────────────── routes ───────────────────────────

function AdminRoutes() {
  const perms = usePermissions();
  const first = ADMIN_TABS.find((t) => hasPermission(perms, t.perm));
  const home = first ? adminHref(first.id) : '/';

  return (
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
  );
}

// ─────────────────────────── frame ───────────────────────────

/**
 * Rail + header for the active section. Holds the chrome slot state; `children`
 * (the routes) is a stable element, so tabs publishing their actions/toolbar
 * re-render only this frame.
 */
function AdminShell({ children }: { children: ReactNode }) {
  const me = useSessionUser();
  const role = usePrimaryRole();
  const clearance = useClearance();
  const perms = usePermissions();
  const reviewable = useReviewableRequests();
  const audit = useHub((s) => s.audit);
  const now = useNow(60_000);
  const { pathname } = useLocation();
  const [chrome, setChrome] = useState<AdminChrome>({});

  const visible = useMemo(() => ADMIN_TABS.filter((t) => hasPermission(perms, t.perm)), [perms]);
  const denied24h = useMemo(() => audit.filter((a) => a.outcome === 'denied' && a.at >= now - DAY).length, [audit, now]);

  const items: NeoNavItem[] = visible.map((t) => {
    const Icon = t.icon;
    const badge = t.id === 'requests' ? reviewable.length : t.id === 'audit' ? denied24h : 0;
    return {
      to: adminHref(t.id),
      label: t.rail,
      icon: <Icon />,
      badge: badge || null,
      badgeTone: t.id === 'audit' ? 'danger' : undefined,
      title: railTitle(t, badge),
    };
  });

  // Deep links to a tab you don't hold still get that section's header (the body shows the permission wall).
  const active = ADMIN_TABS.find((t) => isNavActive({ to: adminHref(t.id) }, pathname)) ?? visible[0];

  let head: NeoHeadProps;
  if (!visible.length || !active) {
    head = {
      icon: <LockKeyhole />,
      eyebrow: 'Control Center',
      title: 'Restricted area',
      sub: 'Identity, access and audit tooling for NEXUS administrators.',
    };
  } else if (active.id === 'overview') {
    const level = clearance ? `L${clearance} ${CLEARANCE_NAMES[clearance] ?? ''}`.trim() : 'No clearance';
    head = {
      icon: <Fingerprint />,
      eyebrow: SECTIONS.overview.eyebrow,
      title: `${greeting()}${me ? `, ${firstName(me.name)}` : ''}`,
      sub: `${role?.name ?? 'Operator'} · ${level} · session verified — every change is permission-checked and audited.`,
      actions: chrome.actions,
    };
  } else {
    const s = SECTIONS[active.id];
    const Icon = active.icon;
    head = { icon: <Icon />, eyebrow: s.eyebrow, title: s.title, sub: s.sub, actions: chrome.actions };
  }

  return (
    <AdminChromeProvider value={setChrome}>
      <NeoAppFrame
        app="admin"
        tint={TINT}
        className="adm"
        brand={{ icon: <Fingerprint />, label: 'Control Center', to: ADMIN_BASE }}
        items={items}
        head={head}
        toolbar={chrome.toolbar}
      >
        {children}
      </NeoAppFrame>
    </AdminChromeProvider>
  );
}

function railTitle(t: AdminTabDef, badge: number): string {
  if (t.id === 'requests' && badge) return `Requests · ${pluralize(badge, 'request')} awaiting your review`;
  if (t.id === 'audit' && badge) return `Audit log · ${pluralize(badge, 'denied attempt')} in the last 24 hours`;
  return `${t.label} — ${t.description}`;
}
