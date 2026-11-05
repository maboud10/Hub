import { useMemo, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router';
import {
  Activity,
  AppWindow,
  Award,
  Download,
  Fingerprint,
  KeyRound,
  Newspaper,
  RotateCcw,
  ScrollText,
  Search,
  ShieldHalf,
  UserCog,
  type LucideIcon,
} from 'lucide-react';
import { useHub } from '@/store/hub';
import { useNow } from '@/hooks/useNow';
import { toast } from '@/store/toast';
import { EmptyState } from '@/components/ui/primitives';
import { downloadCsv } from '@/lib/csv';
import { formatDate, formatDateTime, formatTime, pluralize, relativeTime, todayKey } from '@/lib/format';
import { cx } from '@/lib/cx';
import type { AuditEntry, AuditSeverity } from '@/types';
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

  return (
    <div className="adm-panel">
      <section className="card adm-audit-head" aria-label="Audit summary">
        <div className="adm-audit-head__stats">
          <div className="adm-sumstat adm-tone--accent">
            <span className="adm-sumstat__value">{audit.length}</span>
            <span className="adm-micro">Events retained</span>
          </div>
          <div className="adm-sumstat adm-tone--info">
            <span className="adm-sumstat__value">{stats.last24}</span>
            <span className="adm-micro">Last 24h</span>
          </div>
          <div className={cx('adm-sumstat', stats.denied7 ? 'adm-tone--danger' : 'adm-tone--muted')}>
            <span className="adm-sumstat__value">{stats.denied7}</span>
            <span className="adm-micro">Denied · 7d</span>
          </div>
          <div className={cx('adm-sumstat', stats.critical7 ? 'adm-tone--danger' : 'adm-tone--muted')}>
            <span className="adm-sumstat__value">{stats.critical7}</span>
            <span className="adm-micro">Critical · 7d</span>
          </div>
        </div>
        <div className="adm-histo-wrap">
          <div className="row row--between">
            <span className="adm-micro">Activity · {HISTO_DAYS} days</span>
            <span className="adm-micro faint">{pluralize(histo.total, 'event')}</span>
          </div>
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
          <div className="row row--between text-xs faint">
            <span>{formatDate(histo.buckets[0].t, { day: 'numeric', month: 'short' })}</span>
            <span>Today</span>
          </div>
        </div>
      </section>

      <div className="adm-toolbar">
        <label className="input-wrap adm-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Search audit log</span>
          <input
            className="input"
            type="search"
            placeholder="Search action, target, detail or actor…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              resetPage();
            }}
          />
        </label>
        <label className="adm-select-label">
          <span className="sr-only">Filter by actor</span>
          <select
            className="select"
            value={actor}
            onChange={(e) => {
              setActor(e.target.value);
              resetPage();
            }}
          >
            <option value="all">All actors</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.count})
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn" onClick={exportCsv} disabled={!filtered.length}>
          <Download aria-hidden="true" /> Export CSV
        </button>
      </div>
      <div className="adm-toolbar adm-toolbar--sub adm-audit-facets">
        <div className="chips" role="group" aria-label="Filter by severity">
          <FilterChip
            active={severity === 'all'}
            count={severityCounts.all}
            onClick={() => {
              setSeverity('all');
              resetPage();
            }}
          >
            All
          </FilterChip>
          {SEVERITIES.map((s) => (
            <FilterChip
              key={s}
              active={severity === s}
              count={severityCounts[s]}
              onClick={() => {
                setSeverity(s);
                resetPage();
              }}
            >
              <i className={cx('adm-sev-dot', toneClass(severityTone(s)))} aria-hidden="true" />
              {SEVERITY_LABEL[s]}
            </FilterChip>
          ))}
        </div>
        <div className="chips" role="group" aria-label="Filter by outcome">
          {(['all', 'success', 'denied'] as const).map((o) => (
            <FilterChip
              key={o}
              active={outcome === o}
              count={outcomeCounts[o]}
              onClick={() => {
                setOutcome(o);
                resetPage();
              }}
            >
              {o === 'all' ? 'Any outcome' : o === 'success' ? 'Success' : 'Denied'}
            </FilterChip>
          ))}
        </div>
        <span className="spacer" />
        {hasFilters && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<ScrollText />}
            title={hasFilters ? 'No events match' : 'No audit events yet'}
            action={
              hasFilters ? (
                <button type="button" className="btn btn--sm" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : undefined
            }
          >
            {hasFilters ? 'Loosen the filters to see more of the trail.' : 'Security-relevant actions will be recorded here.'}
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="adm-timeline" aria-live="polite">
            {groups.map((g) => (
              <section key={g.key} className="adm-day" aria-label={g.label}>
                <h3 className="adm-day__label">
                  {g.label} <span className="count">{g.items.length}</span>
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
                            <span className="faint adm-hide-sm">({relativeTime(e.at, now)})</span>
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
            <span className="text-xs faint">
              Showing {visible.length} of {filtered.length}
            </span>
            {filtered.length > visible.length && (
              <button type="button" className="btn btn--block" onClick={() => setLimit((n) => n + PAGE)}>
                Load more <span className="faint">({Math.min(PAGE, filtered.length - visible.length)} of {filtered.length - visible.length})</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
