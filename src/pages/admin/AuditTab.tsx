import { useMemo, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router';
import {
  Activity,
  AppWindow,
  Award,
  Ban,
  Database,
  Download,
  Fingerprint,
  KeyRound,
  Newspaper,
  RotateCcw,
  ScrollText,
  ShieldAlert,
  ShieldHalf,
  UserCog,
  type LucideIcon,
} from 'lucide-react';
import { NeoEmpty, NeoKpi, NeoKpis, NeoPanel, NeoSearch, NeoTabs } from '@/components/neo';
import { useHub } from '@/store/hub';
import { useNow } from '@/hooks/useNow';
import { toast } from '@/store/toast';
import { downloadCsv } from '@/lib/csv';
import { formatDate, formatDateTime, formatTime, pluralize, relativeTime, todayKey } from '@/lib/format';
import { cx } from '@/lib/cx';
import type { AuditEntry, AuditSeverity } from '@/types';
import { useAdminChrome } from './chrome';
import {
  Actor,
  DAY,
  dayLabel,
  FilterChip,
  OutcomeBadge,
  SEVERITY_LABEL,
  SeverityBadge,
  severityTone,
  startOfDay,
  toneClass,
  useUserMap,
} from './shared';

const PAGE = 40;
const HISTO_DAYS = 14;
const SEVERITIES: AuditSeverity[] = ['info', 'warning', 'critical'];

type SeverityFilter = 'all' | AuditSeverity;
type OutcomeFilter = 'all' | AuditEntry['outcome'];

const parseSeverity = (v: string | null): SeverityFilter => (v === 'info' || v === 'warning' || v === 'critical' ? v : 'all');
const parseOutcome = (v: string | null): OutcomeFilter => (v === 'success' || v === 'denied' ? v : 'all');

const ACTION_ICONS: Array<[string, LucideIcon]> = [
  ['access.', KeyRound],
  ['user.', UserCog],
  ['role.', ShieldHalf],
  ['app.', AppWindow],
  ['session.', Fingerprint],
  ['news.', Newspaper],
  ['kudos.', Award],
  ['demo.', RotateCcw],
];
const actionIcon = (action: string): LucideIcon => ACTION_ICONS.find(([p]) => action.startsWith(p))?.[1] ?? Activity;

export function AuditTab() {
  const audit = useHub((s) => s.audit);
  const userMap = useUserMap();
  const now = useNow(60_000);
  const [params] = useSearchParams();
  const [q, setQ] = useState(() => params.get('q') ?? '');
  const [severity, setSeverity] = useState<SeverityFilter>(() => parseSeverity(params.get('severity')));
  const [outcome, setOutcome] = useState<OutcomeFilter>(() => parseOutcome(params.get('outcome')));
  const [actor, setActor] = useState(() => params.get('actor') ?? 'all');
  const [limit, setLimit] = useState(PAGE);

  const actorName = (id: string) => userMap.get(id)?.name ?? 'System';
  const sorted = useMemo(() => [...audit].sort((a, b) => b.at - a.at), [audit]);

  const actors = useMemo(() => {
    const ids = [...new Set(audit.map((e) => e.actorId))];
    return ids
      .map((id) => ({ id, name: userMap.get(id)?.name ?? 'System', count: audit.filter((e) => e.actorId === id).length }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [audit, userMap]);

  // Faceted filtering — each facet's counts respect the other active filters.
  const needle = q.trim().toLowerCase();
  const base = useMemo(
    () =>
      sorted.filter(
        (e) =>
          (actor === 'all' || e.actorId === actor) &&
          (!needle ||
            e.action.toLowerCase().includes(needle) ||
            e.target.toLowerCase().includes(needle) ||
            (e.detail ?? '').toLowerCase().includes(needle) ||
            (userMap.get(e.actorId)?.name ?? 'system').toLowerCase().includes(needle)),
      ),
    [sorted, actor, needle, userMap],
  );
  const severityCounts = useMemo(() => {
    const scoped = base.filter((e) => outcome === 'all' || e.outcome === outcome);
    return {
      all: scoped.length,
      info: scoped.filter((e) => e.severity === 'info').length,
      warning: scoped.filter((e) => e.severity === 'warning').length,
      critical: scoped.filter((e) => e.severity === 'critical').length,
    };
  }, [base, outcome]);
  const outcomeCounts = useMemo(() => {
    const scoped = base.filter((e) => severity === 'all' || e.severity === severity);
    return {
      all: scoped.length,
      success: scoped.filter((e) => e.outcome === 'success').length,
      denied: scoped.filter((e) => e.outcome === 'denied').length,
    };
  }, [base, severity]);
  const filtered = useMemo(
    () => base.filter((e) => (severity === 'all' || e.severity === severity) && (outcome === 'all' || e.outcome === outcome)),
    [base, severity, outcome],
  );

  const visible = filtered.slice(0, limit);
  const groups = useMemo(() => {
    const out: Array<{ key: number; label: string; items: AuditEntry[] }> = [];
    for (const e of visible) {
      const key = startOfDay(e.at);
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(e);
      else out.push({ key, label: dayLabel(e.at, now), items: [e] });
    }
    return out;
  }, [visible, now]);

  // 14-day activity histogram (stacked by severity) over the filtered set.
  const histo = useMemo(() => {
    const start = startOfDay(now) - (HISTO_DAYS - 1) * DAY;
    const buckets = Array.from({ length: HISTO_DAYS }, (_, i) => ({ t: start + i * DAY, info: 0, warning: 0, critical: 0, total: 0 }));
    for (const e of filtered) {
      if (e.at < start) continue;
      const idx = Math.round((startOfDay(e.at) - start) / DAY);
      const b = buckets[idx];
      if (!b) continue;
      b[e.severity] += 1;
      b.total += 1;
    }
    const max = Math.max(1, ...buckets.map((b) => b.total));
    return { buckets, max, total: buckets.reduce((n, b) => n + b.total, 0) };
  }, [filtered, now]);

  const stats = useMemo(
    () => ({
      last24: audit.filter((e) => e.at >= now - DAY).length,
      denied7: audit.filter((e) => e.outcome === 'denied' && e.at >= now - 7 * DAY).length,
      critical7: audit.filter((e) => e.severity === 'critical' && e.at >= now - 7 * DAY).length,
      actors7: new Set(audit.filter((e) => e.at >= now - 7 * DAY).map((e) => e.actorId)).size,
    }),
    [audit, now],
  );

  const resetPage = () => setLimit(PAGE);
  const hasFilters = !!needle || severity !== 'all' || outcome !== 'all' || actor !== 'all';
  const clearFilters = () => {
    setQ('');
    setSeverity('all');
    setOutcome('all');
    setActor('all');
    resetPage();
  };

  const exportCsv = () => {
    if (!filtered.length) return;
    downloadCsv(
      `nexus-audit-${todayKey()}.csv`,
      filtered.map((e) => ({
        timestamp: new Date(e.at).toISOString(),
        actor: actorName(e.actorId),
        actor_id: e.actorId,
        action: e.action,
        target: e.target,
        detail: e.detail ?? '',
        outcome: e.outcome,
        severity: e.severity,
      })),
    );
    toast.success(`Exported ${pluralize(filtered.length, 'event')}`, hasFilters ? 'Only events matching your filters were included.' : undefined);
  };

  useAdminChrome({
    toolbar: (
      <>
        <NeoTabs<SeverityFilter>
          label="Filter by severity"
          value={severity}
          onChange={(v) => {
            setSeverity(v);
            resetPage();
          }}
          items={[
            { value: 'all', label: 'All', count: severityCounts.all },
            ...SEVERITIES.map((s) => ({
              value: s,
              label: (
                <>
                  <i className={cx('adm-sev-dot', toneClass(severityTone(s)))} aria-hidden="true" />
                  {SEVERITY_LABEL[s]}
                </>
              ),
              count: severityCounts[s],
            })),
          ]}
        />
        <div className="adm-chips" role="group" aria-label="Filter by outcome">
          {(['all', 'success', 'denied'] as const).map((o) => (
            <FilterChip
              key={o}
              active={outcome === o}
              count={outcomeCounts[o]}
              icon={o === 'denied' ? Ban : undefined}
              onClick={() => {
                setOutcome(o);
                resetPage();
              }}
            >
              {o === 'all' ? 'Any outcome' : o === 'success' ? 'Success' : 'Denied'}
            </FilterChip>
          ))}
        </div>
        <div className="grow" />
        <NeoSearch
          value={q}
          onChange={(v) => {
            setQ(v);
            resetPage();
          }}
          placeholder="Search action, target, detail or actor…"
          size="sm"
          label="Search audit log"
          className="adm-tool-search"
        />
        <select
          className="neo-select neo-select--sm adm-tool-select"
          value={actor}
          onChange={(e) => {
            setActor(e.target.value);
            resetPage();
          }}
          aria-label="Filter by actor"
        >
          <option value="all">All actors</option>
          {actors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.count})
            </option>
          ))}
        </select>
        {hasFilters && (
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={clearFilters}>
            Clear
          </button>
        )}
      </>
    ),
    actions: (
      <button type="button" className="neo-btn neo-btn--plasma" onClick={exportCsv} disabled={!filtered.length} data-qa="adm-audit-export">
        <Download /> <span className="neo-btn__label">Export CSV</span>
      </button>
    ),
  });

  return (
    <div className="adm-view">
      <NeoKpis label="Audit summary">
        <NeoKpi icon={<Database />} label="Events retained" value={audit.length} sub={`${stats.actors7} actors in the last 7 days`} />
        <NeoKpi icon={<Activity />} label="Last 24h" value={stats.last24} sub={stats.last24 ? 'Fresh activity on the trail' : 'Quiet day'} />
        <NeoKpi
          icon={<Ban />}
          label="Denied · 7d"
          value={stats.denied7}
          sub={stats.denied7 ? 'Blocked by the policy engine' : 'Nobody hit a boundary'}
          tone={stats.denied7 ? 'danger' : undefined}
          onClick={() => {
            setOutcome((o) => (o === 'denied' ? 'all' : 'denied'));
            resetPage();
          }}
          title="Toggle the denied filter"
        />
        <NeoKpi
          icon={<ShieldAlert />}
          label="Critical · 7d"
          value={stats.critical7}
          sub={stats.critical7 ? 'Escalation or self-approval attempts' : 'No critical events'}
          tone={stats.critical7 ? 'danger' : undefined}
          onClick={() => {
            setSeverity((s) => (s === 'critical' ? 'all' : 'critical'));
            resetPage();
          }}
          title="Toggle the critical filter"
        />
      </NeoKpis>

      <NeoPanel
        hud="Activity"
        title={`Last ${HISTO_DAYS} days`}
        actions={<span className="adm-toolbar-hint">{pluralize(histo.total, hasFilters ? 'matching event' : 'event')}</span>}
        className="adm-histo-panel"
      >
        <div className="adm-histo" role="img" aria-label={`Matching audit events over the last ${HISTO_DAYS} days: ${histo.total}`}>
          {histo.buckets.map((b, i) => (
            <div
              key={b.t}
              className="adm-histo__col"
              data-tip={`${formatDate(b.t, { weekday: 'short', day: 'numeric', month: 'short' })} · ${pluralize(b.total, 'event')}`}
              style={{ '--i': i } as CSSProperties}
            >
              <span className="adm-histo__stack" style={{ height: `${(b.total / histo.max) * 100}%` }}>
                {b.critical > 0 && <i className="is-critical" style={{ flexGrow: b.critical }} />}
                {b.warning > 0 && <i className="is-warning" style={{ flexGrow: b.warning }} />}
                {b.info > 0 && <i className="is-info" style={{ flexGrow: b.info }} />}
              </span>
            </div>
          ))}
        </div>
        <div className="adm-histo__axis">
          <span>{formatDate(histo.buckets[0].t, { day: 'numeric', month: 'short' })}</span>
          <span className="adm-histo__legend" aria-hidden="true">
            <i className="is-info" /> Info <i className="is-warning" /> Warning <i className="is-critical" /> Critical
          </span>
          <span>Today</span>
        </div>
      </NeoPanel>

      {filtered.length === 0 ? (
        <NeoPanel>
          <NeoEmpty
            icon={<ScrollText />}
            title={hasFilters ? 'No events match' : 'No audit events yet'}
            action={
              hasFilters ? (
                <button type="button" className="neo-btn neo-btn--soft" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : undefined
            }
          >
            {hasFilters ? 'Loosen the filters to see more of the trail.' : 'Security-relevant actions will be recorded here.'}
          </NeoEmpty>
        </NeoPanel>
      ) : (
        <>
          <div className="adm-timeline" aria-live="polite">
            {groups.map((g) => (
              <section key={g.key} className="adm-day" aria-label={g.label}>
                <h3 className="adm-day__label">
                  {g.label} <span className="adm-day__count">{g.items.length}</span>
                </h3>
                <ol className="adm-tl">
                  {g.items.map((e) => {
                    const Icon = actionIcon(e.action);
                    return (
                      <li key={e.id} className={cx('adm-tl-item', toneClass(severityTone(e.severity)), e.outcome === 'denied' && 'is-denied')}>
                        <span className="adm-tl-item__icon" aria-hidden="true">
                          <Icon />
                        </span>
                        <div className="grow adm-tl-item__body">
                          <div className="adm-tl-item__top">
                            <code className="adm-action">{e.action}</code>
                            <span className="adm-tl-item__badges">
                              {e.outcome === 'denied' && <OutcomeBadge outcome="denied" />}
                              {e.severity !== 'info' && <SeverityBadge severity={e.severity} />}
                            </span>
                          </div>
                          <div className="adm-tl-item__target">{e.target}</div>
                          {e.detail && <div className="adm-tl-item__detail">{e.detail}</div>}
                          <div className="adm-tl-item__meta">
                            <Actor user={userMap.get(e.actorId)} size={20} />
                            <span aria-hidden="true">·</span>
                            <time dateTime={new Date(e.at).toISOString()} title={formatDateTime(e.at)}>
                              {formatTime(e.at)}
                            </time>
                            <span className="neo-faint adm-hide-sm">({relativeTime(e.at, now)})</span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
          <div className="adm-load-more">
            <span className="adm-toolbar-hint">
              Showing {visible.length} of {filtered.length}
            </span>
            {filtered.length > visible.length && (
              <button type="button" className="neo-btn neo-btn--soft neo-btn--block" onClick={() => setLimit((n) => n + PAGE)}>
                Load more <span className="neo-faint">({Math.min(PAGE, filtered.length - visible.length)} of {filtered.length - visible.length})</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
