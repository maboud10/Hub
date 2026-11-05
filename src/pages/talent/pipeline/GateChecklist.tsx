/**
 * Gate checklist: the exit criteria for a stage move, each unmet check with a
 * "Do it" shortcut that opens the right dialog (or says who owns the step).
 */
import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, Check, CircleDashed, Lock } from 'lucide-react';
import type { Application, Requisition, StageId } from '@/talent/types';
import type { GateCheck } from '@/talent/gates';
import { STAGE_BY_ID } from '@/talent/constants';
import { useTalentViewer } from '@/talent/selectors';
import { cx } from '@/lib/cx';
import { actionVerdict, ownerOf, runGateCheck, stageVars } from './pipelineUtils';

export function GateChecklist({
  app,
  req,
  checks,
  title,
  compact = false,
  className,
}: {
  app: Application;
  req: Requisition | undefined;
  checks: GateCheck[];
  title?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  const viewer = useTalentViewer();
  const navigate = useNavigate();
  const groups = useMemo(() => {
    const m = new Map<StageId, GateCheck[]>();
    for (const c of checks) m.set(c.stage, [...(m.get(c.stage) ?? []), c]);
    return [...m.entries()];
  }, [checks]);

  if (!checks.length) return null;
  const done = checks.filter((c) => c.done).length;
  const clear = done === checks.length;

  return (
    <section className={cx('tl-gate', compact && 'tl-gate--compact', clear && 'is-clear', className)} aria-label="Exit criteria">
      <header className="tl-gate__head">
        <span className="tl-gate__title">{title ?? 'Exit criteria'}</span>
        <span className="tl-gate__count" aria-label={`${done} of ${checks.length} met`}>
          {done}/{checks.length}
        </span>
      </header>
      <div className="tl-gate__bar" aria-hidden="true">
        <span style={{ width: `${Math.round((done / checks.length) * 100)}%` }} />
      </div>
      {groups.map(([stage, list]) => {
        const Icon = STAGE_BY_ID[stage].icon;
        return (
          <div key={stage} className="tl-gate__group" style={stageVars(stage)}>
            {groups.length > 1 && (
              <div className="tl-gate__stage">
                <Icon aria-hidden="true" />
                {STAGE_BY_ID[stage].label}
              </div>
            )}
            <ul className="tl-gate__list">
              {list.map((c) => {
                const v = actionVerdict(c.action, viewer, app, req);
                return (
                  <li key={c.id} className={cx('tl-gate__item', c.done ? 'is-done' : 'is-pending')}>
                    <span className="tl-gate__mark" aria-hidden="true">
                      {c.done ? <Check /> : <CircleDashed />}
                    </span>
                    <span className="tl-gate__text">
                      <span className="tl-gate__label">
                        {c.label}
                        <span className="sr-only">{c.done ? ' — done' : ' — pending'}</span>
                      </span>
                      {!c.done && <span className="tl-gate__hint">{c.hint}</span>}
                    </span>
                    {!c.done &&
                      c.action !== 'none' &&
                      (v.ok ? (
                        <button
                          type="button"
                          className="btn btn--sm tl-gate__do"
                          onClick={(e) => {
                            e.stopPropagation();
                            runGateCheck(c, app, navigate);
                          }}
                          aria-label={`Do it: ${c.hint}`}
                        >
                          Do it <ArrowRight aria-hidden="true" />
                        </button>
                      ) : (
                        <span className="tl-gate__owner" title={v.reason}>
                          <Lock aria-hidden="true" />
                          {ownerOf(c.action)}
                        </span>
                      ))}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
