import type { CSSProperties, ReactNode } from 'react';
import { Check, Clock3, PauseCircle, TriangleAlert } from 'lucide-react';
import { cx } from '@/lib/cx';
import '@/styles/neo-tracker.css';

/* ==========================================================================
   NeoTracker — the NEXUS "pizza tracker"
   One segmented, living progress bar for every multi-step journey
   (requests, approvals, reimbursements, tickets, offers, pay runs…).

     <NeoTracker
       hud="Reimbursement tracker"
       title="Your money is on its way"
       steps={[{ label: 'Submitted' }, { label: 'Manager' }, { label: 'Finance' }, { label: 'Paid' }]}
       current={2}
       message="Daniel in Finance is double-checking your receipts"
       eta="Lands Nov 25"
     />

   - Stages before `current` are done, `current` is live (a glowing courier
     travels inside its segment), later stages wait. `current >= steps.length`
     means the journey is complete.
   - `state="blocked"` flags the live stage (changes requested, policy hold),
     `state="paused"` greys it (waiting on someone outside the flow).
   - Container queries reflow it: labels thin out on narrow cards and it turns
     into a vertical timeline in side panels. RTL and reduced motion aware.
   - It is an inline-size container, so it takes its width from its parent:
     inside auto-width table cells give the cell (or the tracker) a definite
     width — compact trackers keep a 140px floor.
   ========================================================================== */

export interface NeoTrackStep {
  id?: string;
  label: string;
  /** Who or what handles the stage ("Omar · Manager"), or a short detail. */
  sub?: ReactNode;
  icon?: ReactNode;
  /** Time chip under the label ("09:42", "2h ago", "ETA Fri"). */
  at?: ReactNode;
}

export type NeoTrackState = 'active' | 'blocked' | 'paused' | 'done';

export interface NeoTrackerProps {
  steps: NeoTrackStep[];
  /** 0-based index of the live stage. `steps.length` (or more) = complete. */
  current: number;
  state?: NeoTrackState;
  /** Mono HUD eyebrow, e.g. "Purchase tracker". */
  hud?: ReactNode;
  title?: ReactNode;
  /** Live status line under the bar ("Kwame is re-imaging your laptop"). */
  message?: ReactNode;
  /** ETA / due chip in the header. */
  eta?: ReactNode;
  actions?: ReactNode;
  /** 0..1 — how far the courier is inside the live segment. */
  progress?: number;
  /** Slim inline version for rows and cards: bar + live label only. */
  compact?: boolean;
  /** Render without the glass card (when already inside a panel). */
  bare?: boolean;
  label?: string;
  className?: string;
  style?: CSSProperties;
}

type SegState = 'done' | 'live' | 'todo';

export function NeoTracker({
  steps,
  current,
  state,
  hud,
  title,
  message,
  eta,
  actions,
  progress = 0.55,
  compact,
  bare,
  label,
  className,
  style,
}: NeoTrackerProps) {
  const n = Math.max(1, steps.length);
  const complete = current >= n || state === 'done';
  const live = complete ? n : Math.max(0, Math.min(current, n - 1));
  const mood: NeoTrackState = complete ? 'done' : (state ?? 'active');
  const liveStep = complete ? steps[n - 1] : steps[live];
  const doneCount = complete ? n : live;
  const segOf = (i: number): SegState => (complete || i < live ? 'done' : i === live ? 'live' : 'todo');
  const valueText = complete ? `Complete · ${liveStep?.label ?? ''}` : `Stage ${live + 1} of ${n} · ${liveStep?.label ?? ''}`;
  const vars = {
    '--n': n,
    '--p': Math.max(0.06, Math.min(0.94, progress)),
    ...style,
  } as CSSProperties;

  const bar = (
    <div
      className="neo-tracker__bar"
      role="progressbar"
      aria-label={label ?? (typeof hud === 'string' ? hud : typeof title === 'string' ? title : 'Progress')}
      aria-valuemin={0}
      aria-valuemax={n}
      aria-valuenow={doneCount}
      aria-valuetext={valueText}
    >
      {steps.map((s, i) => {
        const seg = segOf(i);
        return (
          <span key={s.id ?? `${s.label}-${i}`} className="neo-tracker__seg" data-s={seg}>
            {seg === 'live' && mood === 'active' && <i className="neo-tracker__courier" aria-hidden="true" />}
          </span>
        );
      })}
    </div>
  );

  if (compact) {
    return (
      <div className={cx('neo-tracker', 'neo-tracker--compact', className)} data-state={mood} style={vars}>
        {bar}
        <div className="neo-tracker__compact-row">
          <span className="neo-tracker__compact-label">
            {complete ? <Check aria-hidden="true" /> : mood === 'blocked' ? <TriangleAlert aria-hidden="true" /> : <i className="neo-tracker__pulse" aria-hidden="true" />}
            {liveStep?.label}
          </span>
          <span className="neo-tracker__count" data-state={mood}>{complete ? 'Complete' : `Stage ${live + 1} of ${n}`}</span>
        </div>
      </div>
    );
  }

  return (
    <section className={cx('neo-tracker', bare && 'neo-tracker--bare', className)} data-state={mood} style={vars} aria-label={label ?? (typeof title === 'string' ? title : undefined)}>
      {(hud || title || eta || actions) && (
        <header className="neo-tracker__head">
          <div className="neo-tracker__titles">
            {hud && <div className="neo-hud">{hud}</div>}
            {title && <h3 className="neo-tracker__title">{title}</h3>}
          </div>
          <div className="neo-tracker__meta">
            <span className="neo-tracker__count" data-state={mood}>
              {complete ? (
                <>
                  <Check aria-hidden="true" /> Complete
                </>
              ) : (
                `Stage ${live + 1} of ${n}`
              )}
            </span>
            {eta && (
              <span className="neo-tracker__eta">
                <Clock3 aria-hidden="true" />
                {eta}
              </span>
            )}
            {actions}
          </div>
        </header>
      )}

      {bar}

      <ol className="neo-tracker__steps">
        {steps.map((s, i) => {
          const seg = segOf(i);
          const isLive = seg === 'live';
          return (
            <li key={s.id ?? `${s.label}-${i}`} className="neo-tracker__step" data-s={seg} aria-current={isLive ? 'step' : undefined}>
              <span className="neo-tracker__node" aria-hidden="true">
                {seg === 'done' ? (
                  <Check />
                ) : isLive && mood === 'blocked' ? (
                  <TriangleAlert />
                ) : isLive && mood === 'paused' ? (
                  <PauseCircle />
                ) : (
                  (s.icon ?? <b>{i + 1}</b>)
                )}
              </span>
              <span className="neo-tracker__text">
                <span className="neo-tracker__label">{s.label}</span>
                {s.sub && <span className="neo-tracker__sub">{s.sub}</span>}
                {s.at && <span className="neo-tracker__at">{s.at}</span>}
              </span>
            </li>
          );
        })}
      </ol>

      {message && (
        <p className="neo-tracker__msg" aria-live="polite">
          <i className="neo-tracker__pulse" aria-hidden="true" />
          <span>{message}</span>
        </p>
      )}
    </section>
  );
}
