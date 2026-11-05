/**
 * Pipeline funnel: stage-by-stage counts with conversion between stages.
 */
import type { CSSProperties } from 'react';
import type { FunnelStep } from '@/talent/selectors';
import { STAGE_BY_ID } from '@/talent/constants';
import { cx } from '@/lib/cx';

export function Funnel({ steps, compact = false, onSelect }: { steps: FunnelStep[]; compact?: boolean; onSelect?: (stage: FunnelStep['stage']) => void }) {
  const max = Math.max(1, ...steps.map((s) => s.reached));
  return (
    <ol className={cx('funnel', compact && 'funnel--compact')} aria-label="Hiring funnel">
      {steps.map((s, i) => {
        const m = STAGE_BY_ID[s.stage];
        const Icon = m.icon;
        const pct = Math.max(6, Math.round((s.reached / max) * 100));
        return (
          <li key={s.stage} className="funnel__row" style={{ '--stage-h': m.hue, '--w': `${pct}%`, '--i': i } as CSSProperties}>
            <button type="button" className="funnel__btn" onClick={() => onSelect?.(s.stage)} disabled={!onSelect} title={m.description}>
              <span className="funnel__label">
                <Icon aria-hidden="true" />
                {m.label}
              </span>
              <span className="funnel__bar">
                <span className="funnel__fill" />
                <span className="funnel__count">
                  {s.reached}
                  {s.current > 0 && s.stage !== 'hired' && <span className="funnel__now"> · {s.current} now</span>}
                </span>
              </span>
              <span className="funnel__conv">{s.conversion === null ? '' : `${Math.round(s.conversion * 100)}%`}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
