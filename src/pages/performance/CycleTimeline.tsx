/**
 * Cycle timeline (signature) — the quarter's five phases as a glowing track with a
 * comet for "today". Proportional on desktop, equal segments on phones.
 */
import type { CSSProperties } from 'react';
import { Check } from 'lucide-react';
import { cx } from '@/lib/cx';
import { PHASE } from '@/performance/constants';
import { currentPhaseKey, timelineProgress, timelineSegments } from '@/performance/cycle';
import type { Cycle, PhaseKey } from '@/performance/types';
import { shortDate } from './hooks';

export type PhaseMark = 'done' | 'todo' | 'na';

export function CycleTimeline({ cycle, now, marks, compact }: { cycle: Cycle; now: number; marks?: Partial<Record<PhaseKey, PhaseMark>>; compact?: boolean }) {
  const segs = timelineSegments(cycle);
  if (!segs.length) return null;
  const total = Math.max(1, segs[segs.length - 1].to - segs[0].from);
  const current = currentPhaseKey(cycle, now);
  const p = timelineProgress(cycle, now);
  const idx = segs.findIndex((s) => s.key === current);
  const within = idx >= 0 ? Math.max(0, Math.min(1, (now - segs[idx].from) / Math.max(1, segs[idx].to - segs[idx].from))) : now > segs[segs.length - 1].to ? 1 : 0;
  const eq = idx >= 0 ? (idx + within) / segs.length : now > segs[segs.length - 1].to ? 1 : 0;
  const style = { '--now': `${p * 100}%`, '--now-eq': `${eq * 100}%` } as CSSProperties;
  return (
    <div className={cx('pf-tl', compact && 'pf-tl--compact')} style={style}>
      <div className="pf-tl__track" aria-hidden="true">
        {segs.map((s) => {
          const state = now > s.to ? 'done' : s.key === current ? 'open' : 'upcoming';
          const fill = state === 'done' ? 1 : state === 'open' ? within : 0;
          return (
            <div key={s.key} className="pf-tl__seg" data-state={state} style={{ '--grow': (s.to - s.from) / total } as CSSProperties}>
              <i style={{ width: `${fill * 100}%` }} />
            </div>
          );
        })}
        {cycle.status === 'active' && p > 0 && p < 1 && (
          <span className="pf-tl__now">
            <b>Today</b>
          </span>
        )}
      </div>
      <ol className="pf-tl__labels" aria-label={`${cycle.name} phases`}>
        {segs.map((s) => {
          const state = now > s.to ? 'done' : s.key === current ? 'open' : 'upcoming';
          const mark = marks?.[s.key];
          return (
            <li key={s.key} className="pf-tl__label" data-state={state} style={{ '--grow': (s.to - s.from) / total } as CSSProperties} aria-current={state === 'open' ? 'step' : undefined}>
              <span className="pf-tl__name">
                {mark === 'done' && (
                  <span className="pf-tl__tick" title="You’re done with this phase">
                    <Check aria-label="Done" />
                  </span>
                )}
                <span className="pf-tl__full">{PHASE[s.key].label}</span>
                <span className="pf-tl__short">{PHASE[s.key].short}</span>
              </span>
              <span className="pf-tl__date">
                {state === 'open' ? 'Due ' : ''}
                {shortDate(s.to)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
