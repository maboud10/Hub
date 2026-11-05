import { useMemo, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router';
import { AppWindow, Pencil, Plus, Search, Users } from 'lucide-react';
import { useHub } from '@/store/hub';
import { useNow } from '@/hooks/useNow';
import { toast } from '@/store/toast';
import { AppIcon, EmptyState, RoleChip, Switch } from '@/components/ui/primitives';
import { APP_CATEGORIES } from '@/data/apps';
import { appPermissionId } from '@/data/permissions';
import { hasPermission, rolesGranting } from '@/lib/rbac';
import { pluralize } from '@/lib/format';
import { cx } from '@/lib/cx';
import type { AppCategory, AppStatus, HubApp, Role } from '@/types';
import { AppSheet } from './AppSheet';
import { RegisterAppModal } from './RegisterAppModal';
import { ConfirmModal, EMPTY_PERMS, FilterChip, usePermsByUser, useDisclosure } from './shared';

type StatusFilter = 'all' | AppStatus | 'disabled';
type CatFilter = 'all' | AppCategory;

const STATUSES: AppStatus[] = ['operational', 'degraded', 'maintenance'];
const STATUS_LABEL: Record<AppStatus, string> = { operational: 'Operational', degraded: 'Degraded', maintenance: 'Maintenance' };

const parseStatus = (v: string | null): StatusFilter =>
  v === 'operational' || v === 'degraded' || v === 'maintenance' || v === 'disabled' ? v : 'all';
const parseCat = (v: string | null): CatFilter => (APP_CATEGORIES.includes(v as AppCategory) ? (v as AppCategory) : 'all');

interface AccessInfo {
  roles: Role[];
  people: number;
}

export function AppsTab() {
  const apps = useHub((s) => s.apps);
  const roles = useHub((s) => s.roles);
  const users = useHub((s) => s.users);
  const now = useNow(60_000);
  const permsByUser = usePermsByUser(now);
  const [params] = useSearchParams();
  const [q, setQ] = useState(() => params.get('q') ?? '');
  const [cat, setCat] = useState<CatFilter>(() => parseCat(params.get('category')));
  const [status, setStatus] = useState<StatusFilter>(() => parseStatus(params.get('status')));
  const [register, setRegister] = useState({ open: false, key: 0 });
  const sheet = useDisclosure<string>();
  const disable = useDisclosure<string>();

  const access = useMemo(() => {
    const active = users.filter((u) => u.active);
    return new Map<string, AccessInfo>(
      apps.map((a) => {
        const perm = appPermissionId(a.id);
        return [
          a.id,
          {
            roles: rolesGranting(roles, perm).sort((x, y) => y.clearance - x.clearance),
            people: active.filter((u) => hasPermission(permsByUser.get(u.id) ?? EMPTY_PERMS, perm)).length,
          },
        ];
      }),
    );
  }, [apps, roles, users, permsByUser]);

  const summary = useMemo(
    () => ({
      total: apps.length,
      enabled: apps.filter((a) => a.enabled).length,
      degraded: apps.filter((a) => a.enabled && a.status === 'degraded').length,
      maintenance: apps.filter((a) => a.enabled && a.status === 'maintenance').length,
      custom: apps.filter((a) => a.custom).length,
      hidden: apps.filter((a) => !a.discoverable).length,
    }),
    [apps],
  );

  // Faceted: category counts respect search + status; the list respects all three.
  const preCat = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return apps.filter((a) => {
      if (status === 'disabled' ? a.enabled : status !== 'all' && (a.status !== status || !a.enabled)) return false;
      if (!needle) return true;
      return [a.name, a.tagline, a.owner, a.category, ...a.keywords].some((f) => f.toLowerCase().includes(needle));
    });
  }, [apps, q, status]);
  const catCounts = useMemo(() => {
    const counts: Record<string, number> = { all: preCat.length };
    for (const a of preCat) counts[a.category] = (counts[a.category] ?? 0) + 1;
    return counts;
  }, [preCat]);
  const filtered = useMemo(
    () =>
      preCat
        .filter((a) => cat === 'all' || a.category === cat)
        .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name)),
    [preCat, cat],
  );

  const update = (app: HubApp, patch: Partial<Omit<HubApp, 'id'>>) => toast.result(useHub.getState().updateApp(app.id, patch));
  const onEnabled = (app: HubApp, next: boolean) => {
    if (!next && (access.get(app.id)?.people ?? 0) > 0) {
      disable.show(app.id);
      return;
    }
    update(app, { enabled: next });
  };

  const hasFilters = !!q.trim() || cat !== 'all' || status !== 'all';
  const clearFilters = () => {
    setQ('');
    setCat('all');
    setStatus('all');
  };
  const disableApp = disable.value ? apps.find((a) => a.id === disable.value) : undefined;

  return (
    <div className="adm-panel">
      <div className="adm-apps-summary">
        <div className="adm-sumstat adm-tone--accent">
          <span className="adm-sumstat__value">
            {summary.enabled}
            <small>/{summary.total}</small>
          </span>
          <span className="adm-micro">Enabled</span>
        </div>
        <div className={cx('adm-sumstat', summary.degraded ? 'adm-tone--warning' : 'adm-tone--muted')}>
          <span className="adm-sumstat__value">{summary.degraded}</span>
          <span className="adm-micro">Degraded</span>
        </div>
        <div className={cx('adm-sumstat', summary.maintenance ? 'adm-tone--info' : 'adm-tone--muted')}>
          <span className="adm-sumstat__value">{summary.maintenance}</span>
          <span className="adm-micro">Maintenance</span>
        </div>
        <div className="adm-sumstat adm-tone--muted">
          <span className="adm-sumstat__value">{summary.hidden}</span>
          <span className="adm-micro">Not discoverable</span>
        </div>
        <div className="adm-sumstat adm-tone--muted">
          <span className="adm-sumstat__value">{summary.custom}</span>
          <span className="adm-micro">Custom</span>
        </div>
        <span className="spacer" />
        <button type="button" className="btn btn--primary" onClick={() => setRegister((r) => ({ open: true, key: r.key + 1 }))}>
          <Plus aria-hidden="true" /> Register app
        </button>
      </div>

      <div className="adm-toolbar">
        <label className="input-wrap adm-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Search apps</span>
          <input className="input" type="search" placeholder="Search apps, owners, keywords…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="adm-select-label">
          <span className="sr-only">Filter by status</span>
          <select className="select" value={status} onChange={(e) => setStatus(parseStatus(e.target.value))}>
            <option value="all">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
            <option value="disabled">Disabled</option>
          </select>
        </label>
      </div>
      <div className="adm-toolbar adm-toolbar--sub">
        <div className="chips" role="group" aria-label="Filter by category">
          <FilterChip active={cat === 'all'} count={catCounts.all} onClick={() => setCat('all')}>
            All
          </FilterChip>
          {APP_CATEGORIES.map((c) => (
            <FilterChip key={c} active={cat === c} count={catCounts[c] ?? 0} onClick={() => setCat(c)}>
              {c}
            </FilterChip>
          ))}
        </div>
        <span className="spacer" />
        <span className="text-xs faint" aria-live="polite">
          {pluralize(filtered.length, 'app')}
        </span>
        {hasFilters && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={clearFilters}>
            Clear
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<AppWindow />}
            title="No apps match"
            action={
              hasFilters ? (
                <button type="button" className="btn btn--sm" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : undefined
            }
          >
            Try another search, category or status.
          </EmptyState>
        </div>
      ) : (
        <div className="adm-apps-grid stagger">
          {filtered.map((app, i) => (
            <AppCard
              key={app.id}
              app={app}
              index={i}
              info={access.get(app.id) ?? { roles: [], people: 0 }}
              onEdit={() => sheet.show(app.id)}
              onUpdate={(patch) => update(app, patch)}
              onEnabled={(v) => onEnabled(app, v)}
            />
          ))}
        </div>
      )}

      <AppSheet appId={sheet.value} open={sheet.open} onClose={sheet.hide} />
      <RegisterAppModal key={register.key} open={register.open} onClose={() => setRegister((r) => ({ ...r, open: false }))} />
      <ConfirmModal
        open={disable.open}
        onClose={disable.hide}
        tone="warning"
        title={disableApp ? `Disable ${disableApp.name}?` : 'Disable app?'}
        subtitle="It disappears from every launchpad, search result and dock."
        confirmLabel="Disable app"
        onConfirm={() => {
          if (disableApp) update(disableApp, { enabled: false });
          disable.hide();
        }}
      >
        {disableApp && (
          <p className="muted">
            {pluralize(access.get(disableApp.id)?.people ?? 0, 'person', 'people')} currently {(access.get(disableApp.id)?.people ?? 0) === 1 ? 'has' : 'have'}{' '}
            access. Their permissions are kept, so re-enabling restores everything.
          </p>
        )}
      </ConfirmModal>
    </div>
  );
}

function AppCard({
  app,
  index,
  info,
  onEdit,
  onUpdate,
  onEnabled,
}: {
  app: HubApp;
  index: number;
  info: AccessInfo;
  onEdit: () => void;
  onUpdate: (patch: Partial<Omit<HubApp, 'id'>>) => void;
  onEnabled: (v: boolean) => void;
}) {
  const shownRoles = info.roles.slice(0, 4);
  return (
    <article
      className={cx('card adm-app', !app.enabled && 'is-disabled')}
      style={{ '--i': index, '--c1': app.gradient[0], '--c2': app.gradient[1] } as CSSProperties}
      aria-labelledby={`adm-app-${app.id}`}
    >
      <span className="adm-app__glow" aria-hidden="true" />
      <div className="adm-app__head">
        <AppIcon app={app} size={46} />
        <div className="grow">
          <div className="adm-app__title">
            <h3 id={`adm-app-${app.id}`} className="adm-app__name truncate">
              {app.name}
            </h3>
            {app.badge && <span className="badge badge--info">{app.badge === 'new' ? 'New' : 'Beta'}</span>}
            {app.custom && <span className="tag">Custom</span>}
          </div>
          <div className="text-xs faint truncate">
            {app.category} · {app.owner}
          </div>
        </div>
        <button type="button" className="icon-btn icon-btn--sm" onClick={onEdit} aria-label={`Edit ${app.name}`}>
          <Pencil />
        </button>
      </div>

      <div className="adm-app__controls">
        <label className="adm-mini-field">
          <span className="adm-micro">Status</span>
          <span className="adm-status-select">
            <span className={`dot dot--${app.status}`} aria-hidden="true" />
            <select
              className="select adm-select-sm"
              value={app.status}
              onChange={(e) => onUpdate({ status: e.target.value as AppStatus })}
              aria-label={`Status of ${app.name}`}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className="adm-mini-field">
          <span className="adm-micro">Badge</span>
          <select
            className="select adm-select-sm"
            value={app.badge ?? 'none'}
            onChange={(e) => {
              const v = e.target.value;
              onUpdate({ badge: v === 'new' || v === 'beta' ? v : null });
            }}
            aria-label={`Badge of ${app.name}`}
          >
            <option value="none">None</option>
            <option value="new">New</option>
            <option value="beta">Beta</option>
          </select>
        </label>
      </div>

      <div className="adm-app__switches">
        <div className="adm-switch-row">
          <span>Enabled</span>
          <Switch checked={app.enabled} onChange={onEnabled} label={`${app.name} enabled`} />
        </div>
        <div className="adm-switch-row">
          <span>Discoverable</span>
          <Switch checked={app.discoverable} onChange={(v) => onUpdate({ discoverable: v })} label={`${app.name} discoverable`} />
        </div>
      </div>

      <div className="adm-app__access">
        <div className="row row--between">
          <span className="adm-micro">Access</span>
          <span className="text-xs muted adm-app__people">
            <Users aria-hidden="true" /> {pluralize(info.people, 'person', 'people')}
          </span>
        </div>
        <div className="row row--wrap adm-gap-6">
          {shownRoles.map((r) => (
            <RoleChip key={r.id} name={r.name} color={r.color} />
          ))}
          {info.roles.length > shownRoles.length && <span className="badge badge--muted">+{info.roles.length - shownRoles.length}</span>}
          {info.roles.length === 0 && <span className="text-xs faint">No roles — direct grants only</span>}
        </div>
      </div>
    </article>
  );
}
