/**
 * Dashboard — project telemetry: completion, overdue, velocity, forecast,
 * burn-up (interactive SVG), velocity bars, workload by assignee, open work
 * by priority (donut), flow by section, upcoming milestones and status history.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Diamond, Gauge, Megaphone } from 'lucide-react';
import { CountUp, NeoEmpty, Ring, Spark } from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { addDays, diffDays, formatDue, shortDate, todayIso } from '@/projects/dates';
import { burnup, forecastFinish, projectMetrics, STATUS_LABEL, velocity } from '@/projects/metrics';
import { PRIORITY_NAME } from '@/projects/nlp';
import { useProjects } from '@/projects/store';
import type { Priority, Project, Task } from '@/projects/types';
import { useProjectsUI, useUsersMap } from '../ctx';
import { PRIORITIES, PRIORITY_TONE, StatusPill, UserAvatar } from '../ui';

const TONE_RGB: Record<string, string> = {
  rose: 'var(--pj-rose)',
  orange: 'var(--pj-orange)',
  amber: 'var(--pj-amber)',
  blue: 'var(--pj-blue)',
  slate: '148 163 184',
};

export function DashboardView({ project, tasks }: { project: Project; tasks: Task[] }) {
  const now = useNow(60_000);
  const navigate = useNavigate();
  const m = useMemo(() => projectMetrics(project, tasks, now), [project, tasks, now]);
  const vel = useMemo(() => velocity(tasks, now, 8), [tasks, now]);
  const forecast = useMemo(() => forecastFinish(tasks, now), [tasks, now]);
  const today = todayIso(now);
  const recent = vel.slice(-4);
  const avg = recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length);
  const slip = forecast ? diffDays(project.dueDate, forecast) : null;
  const oldestLate = tasks
    .filter((t) => !t.completedAt && t.dueDate && t.dueDate < today)
    .reduce((mx, t) => Math.max(mx, diffDays(t.dueDate!, today)), 0);

  if (!tasks.length)
    return (
      <div className="neo-pad">
        <NeoEmpty icon={<Gauge />} title="Nothing to measure yet">
          Add a few tasks and the dashboard lights up with completion, velocity, burn-up and workload.
        </NeoEmpty>
      </div>
    );

  return (
    <div className="neo-pad pj-dash">
      <div className="pj-kpis neo-stagger" role="list" aria-label="Key numbers">
        <div className="pj-kpi pj-kpi--ring" role="listitem" style={{ ['--i' as string]: 0 }}>
          <Ring value={m.progress} size={64} stroke={6} label={`${Math.round(m.progress * 100)}% complete`}>
            <span style={{ fontSize: 15 }}>{Math.round(m.progress * 100)}%</span>
          </Ring>
          <span className="pj-kpi__text">
            <span className="neo-hud">Completion</span>
            <span className="pj-kpi__cap">
              {m.done} of {m.total} tasks
            </span>
          </span>
        </div>
        <div className="pj-kpi" role="listitem" data-tone={m.overdue ? 'danger' : undefined} style={{ ['--i' as string]: 1 }}>
          <span className="neo-hud">Overdue</span>
          <span className="pj-kpi__v neo-num">
            <CountUp value={m.overdue} />
          </span>
          <span className="pj-kpi__cap">{m.overdue ? `oldest ${oldestLate}d late` : 'nothing late'}</span>
        </div>
        <div className="pj-kpi pj-kpi--spark" role="listitem" style={{ ['--i' as string]: 2 }}>
          <span className="neo-hud">Velocity</span>
          <span className="pj-kpi__v neo-num">
            <CountUp value={avg} format={(n) => n.toFixed(1)} />
            <small>/wk</small>
          </span>
          <Spark data={vel} width={110} height={28} className="pj-kpi__spark" />
        </div>
        <div className="pj-kpi" role="listitem" data-tone={slip !== null && slip > 0 ? 'warning' : undefined} style={{ ['--i' as string]: 3 }}>
          <span className="neo-hud">Forecast finish</span>
          <span className="pj-kpi__v pj-kpi__v--sm">{forecast ? shortDate(forecast) : '—'}</span>
          <span className="pj-kpi__cap">{slip === null ? 'not enough recent completions' : slip > 0 ? `${slip}d after the due date` : slip === 0 ? 'right on the due date' : `${-slip}d ahead of the due date`}</span>
        </div>
        <div className="pj-kpi" role="listitem" data-tone={m.blocked ? 'warning' : undefined} style={{ ['--i' as string]: 4 }}>
          <span className="neo-hud">Blocked</span>
          <span className="pj-kpi__v neo-num">
            <CountUp value={m.blocked} />
          </span>
          <span className="pj-kpi__cap">{m.dueThisWeek} due this week</span>
        </div>
      </div>

      <div className="pj-dash__grid">
        <section className="neo-card pj-chart pj-chart--wide" aria-label="Burn-up">
          <div className="neo-section-head">
            <h2 className="neo-title">Burn-up</h2>
            <span className="pj-legend">
              <i data-k="done" /> Done <i data-k="scope" /> Scope <i data-k="proj" /> Projection
            </span>
          </div>
          <BurnUp project={project} tasks={tasks} now={now} forecast={forecast} />
        </section>

        <section className="neo-card pj-chart" aria-label="Velocity">
          <div className="neo-section-head">
            <h2 className="neo-title">Velocity</h2>
            <span className="neo-faint text-xs">tasks done per week</span>
          </div>
          <VelocityBars data={vel} now={now} />
        </section>

        <section className="neo-card pj-chart" aria-label="Open work by priority">
          <div className="neo-section-head">
            <h2 className="neo-title">Open by priority</h2>
          </div>
          <PriorityDonut tasks={tasks} />
        </section>

        <section className="neo-card pj-chart" aria-label="Workload by assignee">
          <div className="neo-section-head">
            <h2 className="neo-title">By assignee</h2>
            <span className="pj-legend">
              <i data-k="done" /> Done <i data-k="open" /> Open <i data-k="late" /> Overdue
            </span>
          </div>
          <ByAssignee tasks={tasks} today={today} />
        </section>

        <section className="neo-card pj-chart" aria-label="Flow by section">
          <div className="neo-section-head">
            <h2 className="neo-title">Flow</h2>
            <span className="neo-faint text-xs">open tasks per section</span>
          </div>
          <Flow project={project} tasks={tasks} />
        </section>

        <section className="neo-card pj-chart" aria-label="Upcoming milestones">
          <div className="neo-section-head">
            <h2 className="neo-title">Upcoming milestones</h2>
          </div>
          <UpcomingMilestones tasks={tasks} today={today} />
        </section>

        <section className="neo-card pj-chart" aria-label="Status history">
          <div className="neo-section-head">
            <h2 className="neo-title">Status history</h2>
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => navigate(`/projects/p/${project.id}/overview`)}>
              <Megaphone /> All updates
            </button>
          </div>
          <StatusHistory project={project} />
        </section>
      </div>
    </div>
  );
}

/* ───────────────────────── burn-up ───────────────────────── */

const BW = 640;
const BH = 230;
const PAD = { l: 34, r: 14, t: 14, b: 26 };

function BurnUp({ project, tasks, now, forecast }: { project: Project; tasks: Task[]; now: number; forecast: string | null }) {
  const pts = useMemo(() => burnup(project, tasks, now, 48), [project, tasks, now]);
  const [hover, setHover] = useState<number | null>(null);
  const today = todayIso(now);
  const first = pts[0]?.day ?? project.startDate;
  let last = project.dueDate > today ? project.dueDate : today;
  if (forecast && forecast > last && diffDays(first, forecast) < diffDays(first, last) * 1.6) last = forecast;
  const days = Math.max(1, diffDays(first, last));
  const maxY = Math.max(1, ...pts.map((p) => p.scope)) * 1.08;
  const iw = BW - PAD.l - PAD.r;
  const ih = BH - PAD.t - PAD.b;
  const x = (d: string) => PAD.l + (diffDays(first, d) / days) * iw;
  const y = (v: number) => PAD.t + ih - (v / maxY) * ih;
  const line = (k: 'scope' | 'done') => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ');
  const area = `${line('done')} L${x(pts[pts.length - 1].day).toFixed(1)},${y(0)} L${x(pts[0].day).toFixed(1)},${y(0)} Z`;
  const lastPt = pts[pts.length - 1];
  const showForecast = forecast && forecast <= last && lastPt && lastPt.done < lastPt.scope;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((maxY / 1.08) * f));
  const xTicks = [first, addDays(first, Math.round(days / 3)), addDays(first, Math.round((2 * days) / 3)), last];
  const h = hover !== null ? pts[hover] : null;

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - r.left) / r.width) * iw;
    let best = 0;
    let bd = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(x(p.day) - PAD.l - rel);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(best);
  };

  return (
    <div className="pj-burn">
      <svg viewBox={`0 0 ${BW} ${BH}`} className="pj-burn__svg" role="img" aria-label={`Burn-up: ${lastPt?.done ?? 0} of ${lastPt?.scope ?? 0} tasks done`}>
        <defs>
          <linearGradient id="pjBurnFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--app-c1)" stopOpacity="0.42" />
            <stop offset="100%" stopColor="var(--app-c1)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line className="pj-burn__grid" x1={PAD.l} x2={BW - PAD.r} y1={y(t)} y2={y(t)} />
            <text className="pj-burn__ylab" x={PAD.l - 8} y={y(t) + 3.5} textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {xTicks.map((d, i) => (
          <text key={`${d}-${i}`} className="pj-burn__xlab" x={x(d)} y={BH - 8} textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}>
            {shortDate(d)}
          </text>
        ))}
        {project.dueDate >= first && project.dueDate <= last && (
          <g>
            <line className="pj-burn__due" x1={x(project.dueDate)} x2={x(project.dueDate)} y1={PAD.t} y2={PAD.t + ih} />
            <text className="pj-burn__mark" x={x(project.dueDate) - 4} y={PAD.t + 10} textAnchor="end">
              Due
            </text>
          </g>
        )}
        <line className="pj-burn__today" x1={x(today)} x2={x(today)} y1={PAD.t} y2={PAD.t + ih} />
        <path d={area} fill="url(#pjBurnFill)" />
        <path d={line('scope')} className="pj-burn__scope" />
        <path d={line('done')} className="pj-burn__done" />
        {showForecast && lastPt && <path d={`M${x(lastPt.day)},${y(lastPt.done)} L${x(forecast!)},${y(lastPt.scope)}`} className="pj-burn__proj" />}
        {showForecast && lastPt && <circle cx={x(forecast!)} cy={y(lastPt.scope)} r={4} className="pj-burn__projdot" />}
        {lastPt && <circle cx={x(lastPt.day)} cy={y(lastPt.done)} r={4.5} className="pj-burn__dot" />}
        {h && (
          <g className="pj-burn__hover" pointerEvents="none">
            <line x1={x(h.day)} x2={x(h.day)} y1={PAD.t} y2={PAD.t + ih} />
            <circle cx={x(h.day)} cy={y(h.done)} r={4} />
            <circle cx={x(h.day)} cy={y(h.scope)} r={3} className="is-scope" />
          </g>
        )}
        <rect x={PAD.l} y={PAD.t} width={iw} height={ih} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {h && (
        <div className="pj-burn__tip" style={{ left: `${(x(h.day) / BW) * 100}%` }}>
          <strong>{shortDate(h.day)}</strong>
          <span>
            {h.done} done · {h.scope} scope
          </span>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── velocity ───────────────────────── */

function VelocityBars({ data, now }: { data: number[]; now: number }) {
  const max = Math.max(1, ...data);
  const mon = addDays(todayIso(now), -((new Date(now).getDay() + 6) % 7));
  return (
    <div className="pj-vel" role="img" aria-label={`Tasks done per week: ${data.join(', ')}`}>
      {data.map((v, i) => {
        const wk = addDays(mon, (i - (data.length - 1)) * 7);
        const current = i === data.length - 1;
        return (
          <div key={i} className={cx('pj-vel__col', current && 'is-current')} title={`Week of ${shortDate(wk)}: ${v} done`}>
            <span className="pj-vel__v neo-num">{v}</span>
            <span className="pj-vel__track">
              <span className="pj-vel__bar" style={{ height: `${Math.max(4, (v / max) * 100)}%` }} />
            </span>
            <span className="pj-vel__lab">{current ? 'Now' : shortDate(wk).split(' ')[0]}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────────────── priority donut ───────────────────────── */

function PriorityDonut({ tasks }: { tasks: Task[] }) {
  const open = tasks.filter((t) => !t.completedAt);
  const counts = PRIORITIES.map((p) => ({ p, n: open.filter((t) => t.priority === p).length })).filter((x) => x.n > 0);
  const total = open.length;
  const R = 52;
  const C = 2 * Math.PI * R;
  let acc = 0;
  if (!total) return <p className="neo-faint text-sm">No open work — everything is done.</p>;
  return (
    <div className="pj-donut">
      <svg viewBox="0 0 140 140" className="pj-donut__svg" role="img" aria-label={counts.map((c) => `${PRIORITY_NAME[c.p]} ${c.n}`).join(', ')}>
        <circle cx="70" cy="70" r={R} className="pj-donut__track" />
        {counts.map(({ p, n }) => {
          const len = (n / total) * C;
          const seg = (
            <circle
              key={p}
              cx="70"
              cy="70"
              r={R}
              className="pj-donut__seg"
              style={{ stroke: `rgb(${TONE_RGB[PRIORITY_TONE[p]]})`, ['--glow' as string]: `rgb(${TONE_RGB[PRIORITY_TONE[p]]} / 0.55)` }}
              strokeDasharray={`${Math.max(0, len - 3)} ${C}`}
              strokeDashoffset={-acc}
            />
          );
          acc += len;
          return seg;
        })}
        <text x="70" y="68" textAnchor="middle" className="pj-donut__n">
          {total}
        </text>
        <text x="70" y="86" textAnchor="middle" className="pj-donut__cap">
          open
        </text>
      </svg>
      <ul className="pj-donut__legend">
        {PRIORITIES.map((p: Priority) => {
          const n = open.filter((t) => t.priority === p).length;
          return (
            <li key={p} className={cx(!n && 'is-zero')}>
              <i style={{ background: `rgb(${TONE_RGB[PRIORITY_TONE[p]]})` }} />
              <span className="grow">{PRIORITY_NAME[p]}</span>
              <span className="neo-num">{n}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ───────────────────────── by assignee ───────────────────────── */

function ByAssignee({ tasks, today }: { tasks: Task[]; today: string }) {
  const users = useUsersMap();
  const rows = useMemo(() => {
    const m = new Map<string, { id: string | null; done: number; open: number; late: number }>();
    for (const t of tasks) {
      const k = t.assigneeId ?? 'none';
      const r = m.get(k) ?? { id: t.assigneeId, done: 0, open: 0, late: 0 };
      if (t.completedAt) r.done += 1;
      else if (t.dueDate && t.dueDate < today) r.late += 1;
      else r.open += 1;
      m.set(k, r);
    }
    return [...m.values()].sort((a, b) => b.open + b.late - (a.open + a.late) || b.done - a.done).slice(0, 8);
  }, [tasks, today]);
  const max = Math.max(1, ...rows.map((r) => r.done + r.open + r.late));
  return (
    <ul className="pj-who">
      {rows.map((r) => (
        <li key={r.id ?? 'none'} className="pj-who__row">
          <UserAvatar id={r.id} size={22} />
          <span className="pj-who__name truncate">{r.id ? (users.get(r.id)?.name.split(' ')[0] ?? 'Someone') : 'Unassigned'}</span>
          <span className="pj-who__bar" title={`${r.done} done · ${r.open} open · ${r.late} overdue`}>
            <i data-k="done" style={{ width: `${(r.done / max) * 100}%` }} />
            <i data-k="open" style={{ width: `${(r.open / max) * 100}%` }} />
            <i data-k="late" style={{ width: `${(r.late / max) * 100}%` }} />
          </span>
          <span className="pj-who__n neo-num">{r.open + r.late}</span>
        </li>
      ))}
    </ul>
  );
}

/* ───────────────────────── flow ───────────────────────── */

function Flow({ project, tasks }: { project: Project; tasks: Task[] }) {
  const rows = project.sections.map((s) => ({ s, n: tasks.filter((t) => t.sectionId === s.id && !t.completedAt).length, done: tasks.filter((t) => t.sectionId === s.id && t.completedAt).length }));
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ul className="pj-flow">
      {rows.map(({ s, n, done }) => (
        <li key={s.id} className="pj-flow__row" data-stage={s.stage ?? 'todo'}>
          <span className="pj-flow__name truncate">{s.name}</span>
          <span className="pj-flow__bar">
            <i style={{ width: `${(n / max) * 100}%` }} />
          </span>
          <span className="pj-flow__n neo-num" title={`${n} open${done ? ` · ${done} done` : ''}`}>
            {n}
            {s.wip ? <small>/{s.wip}</small> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ───────────────────────── milestones ───────────────────────── */

function UpcomingMilestones({ tasks, today }: { tasks: Task[]; today: string }) {
  const ui = useProjectsUI();
  const list = tasks
    .filter((t) => t.kind === 'milestone' && !t.completedAt && t.dueDate)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
    .slice(0, 5);
  if (!list.length) return <p className="neo-faint text-sm">No upcoming milestones.</p>;
  return (
    <ul className="pj-msl">
      {list.map((t) => {
        const d = diffDays(today, t.dueDate!);
        return (
          <li key={t.id}>
            <button type="button" className={cx('pj-msl__item', d < 0 && 'is-late')} onClick={() => ui.openTask(t.id)}>
              <Diamond className="pj-msl__ico" />
              <span className="pj-msl__title truncate">{t.title}</span>
              <span className="pj-msl__count neo-num">{d < 0 ? `${-d}d late` : d === 0 ? 'today' : `in ${d}d`}</span>
              <span className="neo-faint text-xs">{formatDue(t.dueDate!)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ───────────────────────── status history ───────────────────────── */

function StatusHistory({ project }: { project: Project }) {
  const all = useProjects((s) => s.updates);
  const list = useMemo(() => all.filter((u) => u.projectId === project.id).sort((a, b) => a.at - b.at), [all, project.id]);
  if (!list.length) return <p className="neo-faint text-sm">No status updates yet — post one from the Overview.</p>;
  const recent = [...list].reverse().slice(0, 4);
  return (
    <div className="pj-hist">
      <div className="pj-hist__strip" role="img" aria-label={`Status over time: ${list.map((u) => STATUS_LABEL[u.status]).join(', ')}`}>
        {list.map((u) => (
          <i key={u.id} data-status={u.status} title={`${STATUS_LABEL[u.status]} · ${new Date(u.at).toLocaleDateString()}`} />
        ))}
      </div>
      <ul className="pj-hist__list">
        {recent.map((u) => (
          <li key={u.id}>
            <StatusPill status={u.status} />
            <span className="grow truncate">{u.title}</span>
            <span className="neo-faint text-xs">{relativeTime(u.at)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
