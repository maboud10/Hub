/**
 * Focus Runway — today as a runway (08:00 → 20:00): meetings from the Hub
 * agenda, a live "now" needle, and Nova-planned focus slots you can accept,
 * drag, or launch as a 25-minute focus session.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, Play, RefreshCw, Sparkles, Trash2, Video } from 'lucide-react';
import { NovaChip, Typing, useTypewriter } from '@/components/neo';
import { startFocusSession } from '@/components/FocusEngine';
import { buildAgenda } from '@/data/agenda';
import { useNow } from '@/hooks/useNow';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { MIN, diffDays, hhmm, todayIso } from '@/projects/dates';
import { openBlockers } from '@/projects/graph';
import { taskKey } from '@/projects/metrics';
import { freeGaps, moveSlot, planDay, runwayWindow, totalMinutes } from '@/projects/planner';
import { useProjects } from '@/projects/store';
import type { PlanSlot, Project, Task } from '@/projects/types';
import { useMyState, useProjectsUI } from './ctx';

const fmtDur = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}` : `${min}m`);

export function FocusRunway({ tasks, projects, autoPlan, onAutoPlanned }: { tasks: Task[]; projects: Map<string, Project>; autoPlan?: boolean; onAutoPlanned?: () => void }) {
  const ui = useProjectsUI();
  const now = useNow(30_000);
  const me = useMyState();
  const savePlan = useProjects((s) => s.savePlan);
  const clearPlan = useProjects((s) => s.clearPlan);
  const allTasks = useProjects((s) => s.tasks);
  const [thinking, setThinking] = useState(false);
  const [summary, setSummary] = useState('');
  const [reveal, setReveal] = useState(0);
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ taskId: string; startX: number; orig: PlanSlot; moved: boolean } | null>(null);
  const [dragSlots, setDragSlots] = useState<PlanSlot[] | null>(null);

  const win = useMemo(() => runwayWindow(now), [now]);
  const span = win.end - win.start;
  const pct = (ts: number) => Math.max(0, Math.min(100, ((ts - win.start) / span) * 100));

  const agenda = useMemo(() => {
    const today = todayIso(now);
    return buildAgenda(new Date(now))
      .filter((e) => todayIso(e.start.getTime()) === today && e.end.getTime() > win.start && e.start.getTime() < win.end)
      .map((e) => ({ id: e.id, title: e.title, start: e.start.getTime(), end: e.end.getTime(), location: e.location }));
    // agenda is regenerated relative to the current half hour; recompute every 30 minutes
  }, [Math.floor(now / (30 * MIN)), win.start, win.end]); // eslint-disable-line react-hooks/exhaustive-deps

  const plan = me.plan && me.plan.date === todayIso(now) ? me.plan : undefined;
  const slots = (dragSlots ?? plan?.slots ?? []).filter((s) => tasks.some((t) => t.id === s.taskId && !t.completedAt) || allTasks.some((t) => t.id === s.taskId));
  const byId = useMemo(() => new Map(allTasks.map((t) => [t.id, t])), [allTasks]);

  const free = useMemo(() => {
    const from = Math.max(now, win.start);
    return freeGaps(agenda, from, win.end, 5).reduce((a, g) => a + (g.end - g.start), 0) / MIN;
  }, [agenda, now, win]);

  const [typed, typedDone] = useTypewriter(summary, 110);

  const runPlan = () => {
    if (thinking) return;
    setThinking(true);
    setSummary('');
    setReveal(0);
    const planTasks = tasks
      .filter((t) => !t.completedAt)
      .map((t) => ({ id: t.id, title: t.title, priority: t.priority, dueDate: t.dueDate, dueTime: t.dueTime, estimate: t.estimate, blocked: openBlockers(t, byId).length > 0 }));
    const next = planDay({ now, dayStart: win.start, dayEnd: win.end, busy: agenda, tasks: planTasks, maxSlots: 5 });
    window.setTimeout(() => {
      setThinking(false);
      savePlan(next, false);
      setDragSlots(null);
      // staggered reveal
      next.forEach((_, i) => window.setTimeout(() => setReveal(i + 1), 140 * (i + 1)));
      const blocked = planTasks.filter((t) => t.blocked);
      const keyOf = (id: string) => {
        const t = byId.get(id);
        return t ? taskKey(t.projectId ? projects.get(t.projectId) : undefined, t) : id;
      };
      if (!next.length) {
        setSummary(
          planTasks.length
            ? 'No free window fits a focus block today — your calendar is full. Try again tomorrow morning, or decline a meeting.'
            : 'Nothing assigned to you is open. Enjoy the calm, or capture something above.',
        );
        return;
      }
      const first = byId.get(next[0].taskId)!;
      const d = first.dueDate ? diffDays(todayIso(now), first.dueDate) : null;
      const why =
        d !== null && d < 0
          ? `it’s ${first.priority === 'none' ? 'open' : first.priority} and ${-d}d overdue`
          : d === 0
            ? 'it’s due today'
            : first.priority === 'urgent' || first.priority === 'high'
              ? `it’s ${first.priority} priority`
              : 'it’s the quickest win';
      const used = totalMinutes(next);
      const parts = [
        `Slotted ${next.length} ${next.length === 1 ? 'task' : 'tasks'} into ${fmtDur(used)} of the ${fmtDur(Math.round(free))} you have free.`,
        `${keyOf(first.id)} goes first — ${why}.`,
      ];
      if (blocked.length) parts.push(`Skipped ${blocked.length} blocked ${blocked.length === 1 ? 'task' : 'tasks'} (${blocked.slice(0, 2).map((b) => keyOf(b.id)).join(', ')}).`);
      const spare = Math.round(free - used);
      if (spare >= 30) parts.push(`${fmtDur(spare)} stays open for the unexpected.`);
      setSummary(parts.join(' '));
    }, 950);
  };

  useEffect(() => {
    if (autoPlan) {
      runPlan();
      onAutoPlanned?.();
    }
  }, [autoPlan]); // eslint-disable-line react-hooks/exhaustive-deps

  // keep revealed count in sync for persisted plans (no animation on load)
  useEffect(() => {
    if (!thinking && plan && reveal === 0 && !summary) setReveal(plan.slots.length);
  }, [plan, thinking, reveal, summary]);

  /* drag a slot along the runway */
  const onDown = (e: ReactPointerEvent<HTMLDivElement>, s: PlanSlot) => {
    if ((e.target as HTMLElement).closest('button')) return;
    drag.current = { taskId: s.taskId, startX: e.clientX, orig: s, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !track.current) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 3) d.moved = true;
    const ms = (dx / track.current.clientWidth) * span;
    const moved = moveSlot(d.orig, d.orig.start + ms, win);
    setDragSlots((cur) => (cur ?? slots).map((x) => (x.taskId === d.taskId ? moved : x)));
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      setDragSlots(null);
      ui.openTask(d.taskId);
      return;
    }
    if (dragSlots) savePlan([...dragSlots].sort((a, b) => a.start - b.start), plan?.accepted ?? false);
    setDragSlots(null);
  };

  const startFocus = (s: PlanSlot) => {
    setActiveSlot(s.taskId);
    startFocusSession(25);
  };

  const nowPct = pct(now);
  const hours = Array.from({ length: 13 }, (_, i) => win.start + i * 60 * MIN);
  const planned = slots.length > 0;

  return (
    <section className={cx('pj-runway neo-card', thinking && 'is-thinking')} aria-label="Focus Runway">
      <header className="pj-runway__head">
        <div className="pj-runway__title">
          <span className="neo-hud neo-hud--tint">Focus runway</span>
          <span className="pj-runway__free">
            <strong className="neo-num">{fmtDur(Math.max(0, Math.round(free)))}</strong> free today · {agenda.length} {agenda.length === 1 ? 'meeting' : 'meetings'}
          </span>
        </div>
        <div className="pj-runway__actions">
          {planned && !thinking && (
            <>
              {!plan?.accepted && (
                <button
                  type="button"
                  className="neo-btn neo-btn--success neo-btn--sm"
                  onClick={() => {
                    savePlan(slots, true);
                    toast.success('Plan locked in', `${slots.length} focus ${slots.length === 1 ? 'block' : 'blocks'} today`);
                  }}
                  data-qa="plan-accept"
                >
                  <Check /> Accept
                </button>
              )}
              <button type="button" className="neo-iconbtn" aria-label="Re-plan" data-tip="Re-plan" onClick={runPlan}>
                <RefreshCw />
              </button>
              <button
                type="button"
                className="neo-iconbtn"
                aria-label="Clear plan"
                data-tip="Clear plan"
                onClick={() => {
                  clearPlan();
                  setSummary('');
                  setReveal(0);
                }}
              >
                <Trash2 />
              </button>
            </>
          )}
          {!planned && (
            <button type="button" className="neo-btn neo-btn--nova neo-btn--sm" onClick={runPlan} disabled={thinking} data-qa="plan-day">
              <Sparkles /> {thinking ? 'Planning…' : 'Plan my day'}
            </button>
          )}
        </div>
      </header>

      <div className="pj-runway__track" ref={track}>
        <div className="pj-runway__past" style={{ width: `${nowPct}%` }} aria-hidden="true" />
        {hours.map((h, i) => (
          <span key={h} className={cx('pj-runway__tick', i % 2 === 1 && 'is-odd')} style={{ left: `${(i / 12) * 100}%` }} aria-hidden="true">
            <span>{hhmm(h)}</span>
          </span>
        ))}
        <div className="pj-runway__lane pj-runway__lane--cal" aria-label="Meetings">
          {agenda.map((e) => (
            <div
              key={e.id}
              className={cx('pj-runway__meet', e.end < now && 'is-past', e.start <= now && e.end > now && 'is-now')}
              style={{ left: `${pct(e.start)}%`, width: `${pct(e.end) - pct(e.start)}%` }}
              title={`${e.title} · ${hhmm(e.start)}–${hhmm(e.end)} · ${e.location}`}
            >
              <Video aria-hidden="true" />
              <span className="truncate">{e.title}</span>
            </div>
          ))}
        </div>
        <div className="pj-runway__lane pj-runway__lane--focus" aria-label="Planned focus">
          {!planned && !thinking && <div className="pj-runway__placeholder">Nova can slot your top tasks into the gaps</div>}
          {slots.map((s, i) => {
            const t = byId.get(s.taskId);
            if (!t) return null;
            const p = t.projectId ? projects.get(t.projectId) : undefined;
            const shown = i < reveal || !!dragSlots;
            return (
              <div
                key={s.taskId}
                className={cx('pj-runway__slot', shown && 'is-in', plan?.accepted && 'is-locked', activeSlot === s.taskId && 'is-active', t.completedAt && 'is-done')}
                style={{ left: `${pct(s.start)}%`, width: `${pct(s.end) - pct(s.start)}%`, ['--i' as string]: i }}
                onPointerDown={(e) => onDown(e, s)}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                role="button"
                tabIndex={0}
                aria-label={`${t.title}, ${hhmm(s.start)} to ${hhmm(s.end)}. Drag to move, Enter to open.`}
                onKeyDown={(e) => e.key === 'Enter' && ui.openTask(t.id)}
                data-qa="runway-slot"
              >
                <span className="pj-runway__slot-key">{taskKey(p, t)}</span>
                <span className="pj-runway__slot-title truncate">{t.title}</span>
                <button type="button" className="pj-runway__play" aria-label={`Start a 25-minute focus on ${t.title}`} data-tip="Focus 25 min" onClick={() => startFocus(s)}>
                  <Play />
                </button>
              </div>
            );
          })}
        </div>
        {now >= win.start && now <= win.end && (
          <div className="pj-runway__now" style={{ left: `${nowPct}%` }} aria-label={`Now ${hhmm(now)}`}>
            <span className="pj-runway__now-label">{hhmm(now)}</span>
          </div>
        )}
        {thinking && <div className="pj-runway__scan" aria-hidden="true" />}
      </div>

      {(thinking || summary) && (
        <div className="pj-runway__nova neo-nova">
          <span className="neo-nova__glow" />
          <NovaChip>Nova</NovaChip>
          {thinking ? (
            <span className="pj-runway__thinking">
              Reading your calendar and {tasks.filter((t) => !t.completedAt).length} open tasks <Typing label="Nova is planning" />
            </span>
          ) : (
            <p className="pj-runway__summary">
              {typed}
              {!typedDone && <span className="pj-caret" aria-hidden="true" />}
            </p>
          )}
        </div>
      )}

      {planned && (
        <ol className="pj-runway__list">
          {slots.map((s) => {
            const t = byId.get(s.taskId);
            if (!t) return null;
            const p = t.projectId ? projects.get(t.projectId) : undefined;
            return (
              <li key={s.taskId} className={cx(t.completedAt && 'is-done')}>
                <span className="neo-mono pj-runway__time">
                  {hhmm(s.start)}–{hhmm(s.end)}
                </span>
                <button type="button" className="pj-linkish truncate" onClick={() => ui.openTask(t.id)}>
                  <span className="neo-faint neo-mono">{taskKey(p, t)}</span> {t.title}
                </button>
                <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => startFocus(s)}>
                  <Play /> Focus
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
