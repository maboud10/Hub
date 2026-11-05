/**
 * Small building blocks for the requisitions & offers area: permission-aware
 * salary range, seat meter, stacked pipeline mini-bar, KPI tiles, the
 * top-candidate avatar stack and a few form controls.
 */
import { useId, useMemo, type CSSProperties, type ReactNode } from 'react';
import { ArrowLeftRight, Building2, Globe, Minus, Plus, type LucideIcon } from 'lucide-react';
import type { Application, Candidate, Requisition, WorkModel } from '@/talent/types';
import { LOCATIONS, WORK_MODEL_LABEL } from '@/talent/constants';
import { useTalentCaps } from '@/talent/selectors';
import { useTalentUI } from '@/talent/ui';
import { cx } from '@/lib/cx';
import { Segmented } from '@/components/ui/primitives';
import { CandidateAvatar, Comp, PersonChip } from '../components/shared';
import { fmtDay } from '../components/format';
import { LIVE_STAGES, stageCounts } from './helpers';

// ───────────────────────── form controls ─────────────────────────
/** − [n] + stepper (headcount and friends). */
export function NumberStepper({ value, onChange, min = 1, max = 50, label, id }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string; id?: string }) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="tl-req-stepper" role="group" aria-label={label}>
      <button type="button" className="tl-req-stepper__btn" onClick={() => onChange(clamp(value - 1))} disabled={value <= min} aria-label={`Decrease ${label}`}>
        <Minus />
      </button>
      <input
        id={id}
        className="tl-req-stepper__input"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value));
          if (!Number.isNaN(n)) onChange(clamp(n));
        }}
        aria-label={label}
      />
      <button type="button" className="tl-req-stepper__btn" onClick={() => onChange(clamp(value + 1))} disabled={value >= max} aria-label={`Increase ${label}`}>
        <Plus />
      </button>
    </div>
  );
}

/** Free-text location with the standard offices as suggestions. */
export function LocationInput({ value, onChange, id, invalid }: { value: string; onChange: (v: string) => void; id?: string; invalid?: boolean }) {
  const listId = useId();
  return (
    <>
      <input id={id} className="input" list={listId} value={value} onChange={(e) => onChange(e.target.value)} placeholder="City or Remote (region)" aria-invalid={invalid || undefined} autoComplete="off" />
      <datalist id={listId}>
        {LOCATIONS.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
    </>
  );
}

const WORK_MODEL_ICON: Record<WorkModel, LucideIcon> = { onsite: Building2, hybrid: ArrowLeftRight, remote: Globe };

export function WorkModelPicker({ value, onChange }: { value: WorkModel; onChange: (v: WorkModel) => void }) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      label="Work model"
      options={(Object.keys(WORK_MODEL_LABEL) as WorkModel[]).map((w) => {
        const Icon = WORK_MODEL_ICON[w];
        return { value: w, label: WORK_MODEL_LABEL[w], icon: <Icon aria-hidden="true" /> };
      })}
    />
  );
}

// ───────────────────────── approval summary ─────────────────────────
/** Compact fact sheet shown when approving headcount. */
export function ReqApprovalFacts({ req }: { req: Requisition }) {
  return (
    <dl className="tl-req-facts">
      <div>
        <dt>Seats · band</dt>
        <dd>
          {req.headcount} · <span className="mono">{req.band}</span>
        </dd>
      </div>
      <div>
        <dt>Salary range</dt>
        <dd>
          <CompRange salary={req.salary} />
        </dd>
      </div>
      <div>
        <dt>Hiring manager</dt>
        <dd>
          <PersonChip userId={req.hiringManagerId} />
        </dd>
      </div>
      <div>
        <dt>Recruiter</dt>
        <dd>
          <PersonChip userId={req.recruiterId} />
        </dd>
      </div>
      {req.targetStartDate && (
        <div>
          <dt>Target start</dt>
          <dd>{fmtDay(req.targetStartDate)}</dd>
        </div>
      )}
    </dl>
  );
}

// ───────────────────────── salary range ─────────────────────────
/** Requisition salary range via <Comp>: a single lock when comp is restricted. */
export function CompRange({ salary, compact = true, emptyLabel = 'Range not set' }: { salary: Requisition['salary']; compact?: boolean; emptyLabel?: string }) {
  const caps = useTalentCaps();
  if (!caps.comp) return <Comp amount={null} currency={salary?.currency ?? 'AED'} />;
  if (!salary) return <span className="faint">{emptyLabel}</span>;
  return (
    <span className="tl-req-range">
      <Comp amount={salary.min} currency={salary.currency} compact={compact} />
      <span className="tl-req-range__dash" aria-hidden="true">
        –
      </span>
      <Comp amount={salary.max} currency={salary.currency} compact={compact} />
    </span>
  );
}

// ───────────────────────── seats ─────────────────────────
/** Headcount progress: one pip per seat (bar for big requisitions). */
export function SeatMeter({ hires, headcount, label = true, className }: { hires: number; headcount: number; label?: boolean; className?: string }) {
  const pct = headcount ? Math.min(100, Math.round((hires / headcount) * 100)) : 0;
  return (
    <span className={cx('tl-req-seats', className)} role="img" aria-label={`${hires} of ${headcount} seat${headcount === 1 ? '' : 's'} filled`}>
      {headcount <= 10 ? (
        <span className="tl-req-seats__pips" aria-hidden="true">
          {Array.from({ length: Math.max(1, headcount) }, (_, i) => (
            <i key={i} className={i < hires ? 'is-filled' : ''} style={{ '--i': i } as CSSProperties} />
          ))}
        </span>
      ) : (
        <span className="tl-req-seats__bar" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </span>
      )}
      {label && (
        <span className="tl-req-seats__label">
          <b>{hires}</b>/{headcount} hired
        </span>
      )}
    </span>
  );
}

// ───────────────────────── pipeline mini-bar ─────────────────────────
/** Active applications per stage as a stacked bar, with a hover/focus legend. */
export function ReqPipelineBar({ apps, legend = true, className }: { apps: Application[]; legend?: boolean; className?: string }) {
  const counts = useMemo(() => stageCounts(apps), [apps]);
  const total = [...counts.values()].reduce((s, n) => s + n, 0);
  const summary = total
    ? LIVE_STAGES.filter((s) => counts.get(s.id))
        .map((s) => `${counts.get(s.id)} ${s.label}`)
        .join(', ')
    : 'no active candidates';
  return (
    <span className={cx('tl-req-pipe', legend && total > 0 && 'has-legend', className)} tabIndex={legend && total > 0 ? 0 : undefined} role="img" aria-label={`Pipeline: ${summary}`}>
      <span className="tl-req-pipe__bar" aria-hidden="true">
        {total === 0 ? (
          <span className="tl-req-pipe__empty" />
        ) : (
          LIVE_STAGES.map((s) => {
            const n = counts.get(s.id) ?? 0;
            return n ? <span key={s.id} className="tl-req-pipe__seg" style={{ '--stage-h': s.hue, flexGrow: n } as CSSProperties} /> : null;
          })
        )}
      </span>
      {legend && total > 0 && (
        <span className="tl-req-pipe__legend" aria-hidden="true">
          <span className="tl-req-pipe__legend-title">
            Pipeline <b>{total} active</b>
          </span>
          {LIVE_STAGES.map((s) => {
            const n = counts.get(s.id) ?? 0;
            const Icon = s.icon;
            return (
              <span key={s.id} className={cx('tl-req-pipe__row', !n && 'is-zero')} style={{ '--stage-h': s.hue } as CSSProperties}>
                <i />
                <Icon />
                <span className="grow">{s.label}</span>
                <b>{n}</b>
              </span>
            );
          })}
        </span>
      )}
    </span>
  );
}

// ───────────────────────── KPI tile ─────────────────────────
export function KpiTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'amber' | 'rose' | 'success' | 'info' | 'warning';
  className?: string;
}) {
  return (
    <div className={cx('tl-req-kpi', tone && `tl-req-kpi--${tone}`, className)}>
      <span className="tl-req-kpi__icon" aria-hidden="true">
        <Icon />
      </span>
      <span className="tl-req-kpi__body">
        <span className="stat-label">{label}</span>
        <span className="tl-req-kpi__value">{value}</span>
        {hint && <span className="tl-req-kpi__hint">{hint}</span>}
      </span>
    </div>
  );
}

// ───────────────────────── top candidates ─────────────────────────
/** Best-matching active candidates as an avatar stack (click → profile sheet). */
export function TopCandidates({ apps, candById, max = 4 }: { apps: Application[]; candById: Map<string, Candidate>; max?: number }) {
  const top = useMemo(
    () =>
      apps
        .filter((a) => a.status === 'active')
        .sort((a, b) => (b.match?.score ?? -1) - (a.match?.score ?? -1))
        .map((a) => ({ app: a, cand: candById.get(a.candidateId) }))
        .filter((x): x is { app: Application; cand: Candidate } => !!x.cand),
    [apps, candById],
  );
  if (!top.length) return <span className="faint text-xs">No candidates yet</span>;
  return (
    <span className="tl-req-top">
      {top.slice(0, max).map(({ app, cand }) => (
        <button
          key={app.id}
          type="button"
          className="tl-req-top__btn"
          title={`${cand.name}${app.match ? ` · ${app.match.score}% match` : ''}`}
          aria-label={`Open ${cand.name}${app.match ? `, ${app.match.score}% match` : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            useTalentUI.getState().openCandidate(cand.id);
          }}
        >
          <CandidateAvatar person={cand} size={28} />
        </button>
      ))}
      {top.length > max && <span className="tl-req-top__more">+{top.length - max}</span>}
    </span>
  );
}
