/**
 * Interview plan: a read-only timeline and a step-by-step builder (kind,
 * name, panel, duration; add / remove / reorder). Shared by the requisition
 * wizard and the requisition detail page.
 */
import type { CSSProperties } from 'react';
import { ArrowDown, ArrowUp, Clock, Plus, Trash2, TriangleAlert, Users } from 'lucide-react';
import type { InterviewKind, InterviewStep } from '@/talent/types';
import { INTERVIEW_KIND_META } from '@/talent/constants';
import { cx } from '@/lib/cx';
import { PeopleStack, PersonChip } from '../components/shared';
import { UserMultiSelect } from '../components/pickers';
import { fmtMinutes, makeStep, planInterviewers, planMinutes } from './helpers';

const KINDS = Object.keys(INTERVIEW_KIND_META) as InterviewKind[];
const DURATIONS = [15, 30, 45, 60, 75, 90, 120, 150, 180, 240];
export const MAX_PLAN_STEPS = 8;

/** One-line summary: "5 steps · 4h 15m · 6 interviewers". */
export function PlanSummary({ steps, className }: { steps: InterviewStep[]; className?: string }) {
  const people = planInterviewers(steps).length;
  return (
    <span className={cx('tl-req-plan-sum', className)}>
      <span>
        <b>{steps.length}</b> step{steps.length === 1 ? '' : 's'}
      </span>
      <span>
        <Clock aria-hidden="true" /> {fmtMinutes(planMinutes(steps))}
      </span>
      <span>
        <Users aria-hidden="true" /> {people} interviewer{people === 1 ? '' : 's'}
      </span>
    </span>
  );
}

// ───────────────────────── read-only ─────────────────────────
export function InterviewPlanView({ steps }: { steps: InterviewStep[] }) {
  if (!steps.length) return <p className="faint text-sm">No interview steps yet.</p>;
  return (
    <ol className="tl-req-plan">
      {steps.map((s, i) => {
        const m = INTERVIEW_KIND_META[s.kind];
        const Icon = m.icon;
        return (
          <li key={s.id} className="tl-req-plan__step" style={{ '--i': i } as CSSProperties}>
            <span className="tl-req-plan__rail" aria-hidden="true">
              <span className="tl-req-plan__num">{i + 1}</span>
            </span>
            <div className="tl-req-plan__card">
              <div className="tl-req-plan__head">
                <span className="tl-req-plan__icon" aria-hidden="true">
                  <Icon />
                </span>
                <div className="grow">
                  <div className="tl-req-plan__title">{s.label}</div>
                  <div className="tl-req-plan__kind">{m.label}</div>
                </div>
                <span className="tl-req-plan__dur">
                  <Clock aria-hidden="true" /> {fmtMinutes(s.durationMins)}
                </span>
              </div>
              <div className="tl-req-plan__people">
                {s.interviewerIds.length ? (
                  s.interviewerIds.map((id) => <PersonChip key={id} userId={id} size={22} />)
                ) : (
                  <span className="tl-req-plan__warn">
                    <TriangleAlert aria-hidden="true" /> No interviewers yet
                  </span>
                )}
              </div>
              {s.focus.length > 0 && (
                <div className="tl-req-plan__focus" aria-label="Competencies assessed">
                  {s.focus.map((f) => (
                    <span key={f} className="tag">
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ───────────────────────── builder ─────────────────────────
function withKind(s: InterviewStep, kind: InterviewKind): InterviewStep {
  const prev = INTERVIEW_KIND_META[s.kind];
  const next = INTERVIEW_KIND_META[kind];
  return {
    ...s,
    kind,
    label: !s.label.trim() || s.label === prev.label ? next.label : s.label,
    durationMins: s.durationMins === prev.defaultMins ? next.defaultMins : s.durationMins,
    focus: [...next.focus],
  };
}

export function InterviewPlanEditor({ steps, onChange }: { steps: InterviewStep[]; onChange: (steps: InterviewStep[]) => void }) {
  const update = (id: string, fn: (s: InterviewStep) => InterviewStep) => onChange(steps.map((s) => (s.id === id ? fn(s) : s)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const full = steps.length >= MAX_PLAN_STEPS;

  return (
    <div className="tl-req-plan-edit">
      {steps.length === 0 ? (
        <p className="tl-req-plan__empty">No steps yet. Add the first interview below.</p>
      ) : (
        <ol className="tl-req-plan tl-req-plan--edit">
          {steps.map((s, i) => {
            const m = INTERVIEW_KIND_META[s.kind];
            const Icon = m.icon;
            const durations = DURATIONS.includes(s.durationMins) ? DURATIONS : [...DURATIONS, s.durationMins].sort((a, b) => a - b);
            return (
              <li key={s.id} className="tl-req-plan__step" style={{ '--i': i } as CSSProperties}>
                <span className="tl-req-plan__rail" aria-hidden="true">
                  <span className="tl-req-plan__num">{i + 1}</span>
                </span>
                <div className="tl-req-plan__card">
                  <div className="tl-req-plan__head tl-req-plan__head--edit">
                    <span className="tl-req-plan__icon" aria-hidden="true">
                      <Icon />
                    </span>
                    <select className="select tl-req-plan__kind-select" value={s.kind} onChange={(e) => update(s.id, (x) => withKind(x, e.target.value as InterviewKind))} aria-label={`Step ${i + 1} type`}>
                      {KINDS.map((k) => (
                        <option key={k} value={k}>
                          {INTERVIEW_KIND_META[k].label}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input tl-req-plan__label-input"
                      value={s.label}
                      maxLength={60}
                      onChange={(e) => update(s.id, (x) => ({ ...x, label: e.target.value }))}
                      onBlur={(e) => !e.target.value.trim() && update(s.id, (x) => ({ ...x, label: INTERVIEW_KIND_META[x.kind].label }))}
                      aria-label={`Step ${i + 1} name`}
                    />
                    <span className="tl-req-plan__tools">
                      <button type="button" className="icon-btn icon-btn--sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move step ${i + 1} up`}>
                        <ArrowUp />
                      </button>
                      <button type="button" className="icon-btn icon-btn--sm" onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label={`Move step ${i + 1} down`}>
                        <ArrowDown />
                      </button>
                      <button type="button" className="icon-btn icon-btn--sm tl-req-plan__remove" onClick={() => onChange(steps.filter((x) => x.id !== s.id))} aria-label={`Remove step ${i + 1}`}>
                        <Trash2 />
                      </button>
                    </span>
                  </div>
                  <div className="tl-req-plan__grid">
                    <div className="field">
                      <span className="field-label">Interviewers</span>
                      <UserMultiSelect value={s.interviewerIds} onChange={(ids) => update(s.id, (x) => ({ ...x, interviewerIds: ids }))} max={4} ariaLabel={`Interviewers for ${s.label}`} placeholder="Add interviewers…" />
                    </div>
                    <label className="field">
                      <span className="field-label">Duration</span>
                      <select className="select" value={s.durationMins} onChange={(e) => update(s.id, (x) => ({ ...x, durationMins: Number(e.target.value) }))}>
                        {durations.map((d) => (
                          <option key={d} value={d}>
                            {fmtMinutes(d)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="tl-req-plan__focus" aria-label="Competencies assessed">
                    <span className="tl-req-plan__focus-label">Scorecard</span>
                    {s.focus.map((f) => (
                      <span key={f} className="tag">
                        {f}
                      </span>
                    ))}
                    {!s.interviewerIds.length && (
                      <span className="tl-req-plan__warn">
                        <TriangleAlert aria-hidden="true" /> Add an interviewer
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div className="tl-req-plan__add">
        <span className="tl-req-plan__add-label">
          <Plus aria-hidden="true" /> Add a step
        </span>
        <div className="tl-req-plan__add-chips">
          {KINDS.map((k) => {
            const KIcon = INTERVIEW_KIND_META[k].icon;
            return (
              <button key={k} type="button" className="chip" disabled={full} onClick={() => onChange([...steps, makeStep(k)])} title={`${INTERVIEW_KIND_META[k].defaultMins} min · ${INTERVIEW_KIND_META[k].focus.join(', ')}`}>
                <KIcon aria-hidden="true" />
                {INTERVIEW_KIND_META[k].label}
              </button>
            );
          })}
        </div>
        {full && <span className="field-hint">Loops longer than {MAX_PLAN_STEPS} steps hurt the candidate experience.</span>}
      </div>
      {steps.length > 0 && (
        <div className="tl-req-plan__foot">
          <PlanSummary steps={steps} />
          <PeopleStack userIds={planInterviewers(steps)} max={6} size={22} />
        </div>
      )}
    </div>
  );
}
