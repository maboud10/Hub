import { useMemo, type CSSProperties } from 'react';
import { AlertTriangle, ArrowRight, Gauge } from 'lucide-react';
import { EmptyState } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { WEEKLY_CAPACITY_HOURS } from '@/projects/constants';
import { useWorkload } from '@/projects/selectors';
import type { ViewProps } from '../ProjectView';
import { Bar, SectionTitle, UserAvatar, useUserMap } from '../shared';

const STATE_META = {
  under: { label: 'Has room', color: '#38bdf8' },
  healthy: { label: 'Healthy', color: '#34d399' },
  over: { label: 'Over capacity', color: '#f87171' },
} as const;

export function WorkloadView({ project, allTasks, today }: ViewProps) {
  const { rows } = useWorkload(project.id);
  const users = useUserMap();
  const over = rows.filter((r) => r.state === 'over');
  const under = rows.filter((r) => r.state === 'under');
  const unassigned = useMemo(() => allTasks.filter((t) => !t.assigneeId && t.status !== 'done'), [allTasks]);
  const totalHours = rows.reduce((s, r) => s + r.hours, 0);

  return (
    <div className="pj-workload">
      <div className="pj-workload__summary">
        <span className="pj-count">
          <b>{rows.length}</b> people
        </span>
        <span className="pj-count">
          <b>{totalHours}h</b> planned this week
        </span>
        <span className="pj-count">
          <b>{WEEKLY_CAPACITY_HOURS}h</b> focus capacity each
        </span>
        {over.length > 0 && (
          <span className="pj-count pj-count--danger">
            <AlertTriangle /> <b>{over.length}</b> over capacity
          </span>
        )}
        {unassigned.length > 0 && (
          <span className="pj-count pj-count--warn">
            <b>{unassigned.length}</b> unassigned open
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<Gauge />} title="No workload to show">
          Assign tasks to teammates and add estimates to see capacity.
        </EmptyState>
      ) : (
        <div className="pj-panelcard">
          <SectionTitle>Capacity · next 7 days</SectionTitle>
          <div className="pj-wl">
            {rows.map((r) => {
              const u = users.get(r.userId);
              const meta = STATE_META[r.state];
              const hint = r.state === 'over' ? (under[0] ? `Consider moving ${Math.ceil((r.hours - r.capacity) / 2)}h+ to ${users.get(under[0].userId)?.name.split(' ')[0] ?? 'someone with room'}` : 'Reduce scope or extend the deadline') : r.state === 'under' ? (over[0] ? `Could pick up work from ${users.get(over[0].userId)?.name.split(' ')[0] ?? 'an overloaded teammate'}` : 'Room for new work') : 'Balanced';
              return (
                <div key={r.userId} className={cx('pj-wl__row', `is-${r.state}`)}>
                  <div className="pj-wl__who">
                    <UserAvatar userId={r.userId} size={34} />
                    <span className="grow truncate">
                      <span className="pj-wl__name">{u?.name ?? 'Unknown'}</span>
                      <small className="muted">{u?.title}</small>
                    </span>
                  </div>
                  <div className="pj-wl__nums">
                    <span>
                      <b>{r.openTasks}</b> open
                    </span>
                    <span className={cx(r.overdue > 0 && 'pj-danger-text')}>
                      <b>{r.overdue}</b> overdue
                    </span>
                  </div>
                  <div className="pj-wl__bar">
                    <div className="row row--between text-xs">
                      <span className="muted">
                        <b style={{ color: meta.color }}>{r.hours}h</b> / {r.capacity}h · {r.loadPct}%
                      </span>
                      <span className="pj-pill" style={{ '--pill': meta.color } as CSSProperties}>
                        {meta.label}
                      </span>
                    </div>
                    <Bar pct={Math.min(100, r.loadPct)} color={meta.color} height={8} />
                    {r.loadPct > 100 && <span className="pj-wl__overflow" style={{ width: `${Math.min(40, (r.loadPct - 100) / 2)}%` }} aria-hidden="true" />}
                  </div>
                  <div className="pj-wl__hint text-xs muted">
                    <ArrowRight /> {hint}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="field-hint" style={{ marginTop: 12 }}>
            Hours = remaining estimate (default 4h per task) for open work due within 7 days or undated, as of {today}. Reassign from the task panel to rebalance.
          </p>
        </div>
      )}
    </div>
  );
}
