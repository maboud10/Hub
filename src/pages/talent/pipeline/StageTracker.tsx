/**
 * Stage visuals for the pipeline area:
 *  - `StageTracker` — the 8-step progress rail for one application.
 *  - `StageRoute`   — the from → to "flight path" shown in the move dialog.
 */
import { useMemo, type CSSProperties } from 'react';
import { ArrowRight, Check, Undo2, X } from 'lucide-react';
import type { Application, StageId } from '@/talent/types';
import { STAGES, STAGE_BY_ID, STAGE_ORDER, stageIndex } from '@/talent/constants';
import { cx } from '@/lib/cx';
import { fmtDay } from '../components/format';
import { stageVars } from './pipelineUtils';

export function StageTracker({ app, compact = false, className }: { app: Pick<Application, 'stage' | 'status' | 'history'>; compact?: boolean; className?: string }) {
  const cur = stageIndex(app.stage);
  const closed = app.status === 'rejected' || app.status === 'withdrawn';
  const hired = app.status === 'hired';
  const entered = useMemo(() => {
    const m = new Map<StageId, number>();
    for (const h of app.history) if (!m.has(h.stage) || h.at > (m.get(h.stage) ?? 0)) m.set(h.stage, h.at);
    return m;
  }, [app.history]);
  const progress = hired ? 100 : (cur / (STAGES.length - 1)) * 100;

  return (
    <ol
      className={cx('tl-gate-track', compact && 'tl-gate-track--compact', closed && 'is-closed', hired && 'is-hired', className)}
      style={{ '--progress': `${progress}%` } as CSSProperties}
      aria-label={`Pipeline progress: ${STAGE_BY_ID[app.stage].label}${closed ? ' (closed)' : ''}`}
    >
      {STAGES.map((s, i) => {
        const state = hired || i < cur ? 'done' : i === cur ? (closed ? 'stopped' : 'current') : 'todo';
        const Icon = s.icon;
        const at = entered.get(s.id);
        return (
          <li
            key={s.id}
            className={cx('tl-gate-track__step', `is-${state}`)}
            style={stageVars(s.id)}
            title={`${s.label}${at ? ` · ${fmtDay(at)}` : ''}`}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span className="tl-gate-track__node" aria-hidden="true">
              {state === 'done' ? <Check /> : state === 'stopped' ? <X /> : <Icon />}
            </span>
            {!compact && <span className="tl-gate-track__label">{s.label}</span>}
            <span className="sr-only">
              {s.label} {state === 'done' ? 'done' : state === 'current' ? 'current stage' : state === 'stopped' ? 'closed here' : 'upcoming'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function StagePlate({ stage, role }: { stage: StageId; role: string }) {
  const m = STAGE_BY_ID[stage];
  const Icon = m.icon;
  return (
    <div className="tl-gate-plate" style={stageVars(stage)}>
      <span className="tl-gate-plate__icon" aria-hidden="true">
        <Icon />
      </span>
      <span className="tl-gate-plate__text">
        <span className="tl-gate-plate__role">
          {role} · {m.phase}
        </span>
        <span className="tl-gate-plate__label">{m.label}</span>
      </span>
    </div>
  );
}

/** From → to visual with the stages passed through on the way. */
export function StageRoute({ from, to }: { from: StageId; to: StageId }) {
  const a = stageIndex(from);
  const b = stageIndex(to);
  const back = b < a;
  const between = STAGE_ORDER.slice(Math.min(a, b) + 1, Math.max(a, b));
  return (
    <div
      className={cx('tl-gate-route', back && 'is-back')}
      style={{ '--from-h': STAGE_BY_ID[from].hue, '--to-h': STAGE_BY_ID[to].hue } as CSSProperties}
      role="img"
      aria-label={`${back ? 'Moving back' : 'Moving'} from ${STAGE_BY_ID[from].label} to ${STAGE_BY_ID[to].label}`}
    >
      <StagePlate stage={from} role="From" />
      <div className="tl-gate-route__path" aria-hidden="true">
        <span className="tl-gate-route__beam" />
        <span className="tl-gate-route__dots">
          {between.map((s) => (
            <span key={s} className="tl-gate-route__dot" style={stageVars(s)} title={STAGE_BY_ID[s].label} />
          ))}
        </span>
        <span className="tl-gate-route__arrow">{back ? <Undo2 /> : <ArrowRight />}</span>
        {(between.length > 0 || back) && (
          <span className="tl-gate-route__caption">{back ? 'Moving back' : `Passes ${between.length} stage${between.length === 1 ? '' : 's'}`}</span>
        )}
      </div>
      <StagePlate stage={to} role="To" />
    </div>
  );
}
