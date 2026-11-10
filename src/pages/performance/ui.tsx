/**
 * Shared building blocks for Performance & OKRs screens.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { BadgeCheck, Building2, CircleCheck, OctagonAlert, Sparkles, TriangleAlert, Undo2, User as UserIcon, Users, X } from 'lucide-react';
import { Chip, NovaChip, Ring, Typing, useTypewriter, type Tone } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { cx } from '@/lib/cx';
import { STATUS_META } from '@/performance/constants';
import type { KrStatus, OkrLevel } from '@/performance/types';
import { toast } from '@/store/toast';
import { dueLabel, useUndo, type PerfCtx } from './hooks';

/* ───────── Status ───────── */

export function StatusIcon({ status }: { status: KrStatus }) {
  if (status === 'on-track') return <CircleCheck aria-hidden="true" />;
  if (status === 'at-risk') return <TriangleAlert aria-hidden="true" />;
  if (status === 'off-track') return <OctagonAlert aria-hidden="true" />;
  return <BadgeCheck aria-hidden="true" />;
}

export function StatusChip({ status, size = 'sm', className }: { status: KrStatus; size?: 'sm' | 'md'; className?: string }) {
  const m = STATUS_META[status];
  return (
    <Chip tone={m.tone as Tone} size={size === 'sm' ? 'sm' : undefined} icon={<StatusIcon status={status} />} className={cx('pf-status', className)}>
      {m.label}
    </Chip>
  );
}

export function OkrRing({ value, status, size = 46, stroke, label }: { value: number; status?: KrStatus; size?: number; stroke?: number; label?: ReactNode }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <Ring value={value} size={size} stroke={stroke ?? Math.max(4, Math.round(size / 10))} color={status ? STATUS_META[status].color : undefined} label={`${pct}% complete${status ? `, ${STATUS_META[status].label}` : ''}`}>
      {label ?? (
        <span className="pf-ring-num">
          {pct}
          <small>%</small>
        </span>
      )}
    </Ring>
  );
}

const LEVEL_META: Record<OkrLevel, { label: string; icon: ReactNode; tone: Tone }> = {
  company: { label: 'Company', icon: <Building2 />, tone: 'violet' },
  team: { label: 'Team', icon: <Users />, tone: 'pink' },
  individual: { label: 'Individual', icon: <UserIcon />, tone: 'slate' },
};

export function LevelChip({ level }: { level: OkrLevel }) {
  const m = LEVEL_META[level];
  return (
    <Chip tone={m.tone} size="sm" icon={m.icon}>
      {m.label}
    </Chip>
  );
}

/** 10-segment confidence meter. */
export function Confidence({ value, compact }: { value: number; compact?: boolean }) {
  const tone = value >= 7 ? 'success' : value >= 4 ? 'warning' : 'danger';
  return (
    <span className={cx('pf-conf', compact && 'pf-conf--compact')} data-tone={tone} role="img" aria-label={`Confidence ${value} of 10`} title={`Confidence ${value}/10`}>
      {Array.from({ length: 10 }, (_, i) => (
        <i key={i} className={i < value ? 'on' : undefined} />
      ))}
      {!compact && <b>{value}</b>}
    </span>
  );
}

export function DueChip({ at, now, prefix }: { at: number; now: number; prefix?: string }) {
  const d = dueLabel(at, now);
  return (
    <Chip tone={d.tone} size="sm">
      {prefix ? `${prefix} · ` : ''}
      {d.text}
    </Chip>
  );
}

/* ───────── People ───────── */

export function Who({ ctx, id, size = 28, sub, to, presence }: { ctx: PerfCtx; id: string; size?: number; sub?: ReactNode; to?: string; presence?: boolean }) {
  const u = ctx.user(id);
  if (!u) return <span className="pf-who pf-faint">Unknown</span>;
  const inner = (
    <>
      <Avatar user={u} size={size} presence={presence} />
      <span className="pf-who__text">
        <span className="pf-who__name">{u.name}</span>
        {sub !== undefined ? <span className="pf-who__sub">{sub}</span> : <span className="pf-who__sub">{u.title}</span>}
      </span>
    </>
  );
  return to ? (
    <Link to={to} className="pf-who pf-who--link">
      {inner}
    </Link>
  ) : (
    <span className="pf-who">{inner}</span>
  );
}

export function Face({ ctx, id, size = 22, title }: { ctx: PerfCtx; id: string; size?: number; title?: string }) {
  const u = ctx.user(id);
  if (!u) return null;
  return (
    <span className="pf-face" title={title ?? u.name} data-tip={title ?? u.name}>
      <Avatar user={u} size={size} />
    </span>
  );
}

/* ───────── Layout ───────── */

export function Section({
  title,
  icon,
  hud,
  actions,
  children,
  className,
  id,
  flush,
}: {
  title: ReactNode;
  icon?: ReactNode;
  hud?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  flush?: boolean;
}) {
  return (
    <section className={cx('neo-card pf-section', flush && 'pf-section--flush', className)} id={id} aria-label={typeof title === 'string' ? title : undefined}>
      <header className="pf-section__head">
        {icon && <span className="pf-section__icon">{icon}</span>}
        <div className="pf-section__titles">
          {hud && <div className="neo-hud">{hud}</div>}
          <h2 className="pf-section__title">{title}</h2>
        </div>
        {actions && <div className="pf-section__actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

/** Segmented control (radio group) for short option lists. */
export function Seg<T extends string | number>({ value, onChange, options, label, size }: { value: T | undefined; onChange: (v: T) => void; options: { value: T; label: ReactNode; title?: string; tone?: string }[]; label: string; size?: 'sm' }) {
  return (
    <div className={cx('pf-seg', size === 'sm' && 'pf-seg--sm')} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value} className="pf-seg__btn" data-tone={o.tone} title={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 1–5 score picker with behavioural anchor tooltips. */
export function ScorePicker({ value, onChange, anchors, label, readOnly }: { value?: number; onChange?: (v: 1 | 2 | 3 | 4 | 5) => void; anchors?: string[]; label: string; readOnly?: boolean }) {
  return (
    <div className="pf-score" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          disabled={readOnly}
          className={cx('pf-score__dot', value !== undefined && n <= value && 'is-lit')}
          title={anchors?.[n - 1] ? `${n} — ${anchors[n - 1]}` : `${n}`}
          onClick={() => onChange?.(n as 1 | 2 | 3 | 4 | 5)}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

/* ───────── Nova ───────── */

/**
 * Deterministic "AI" reveal: think briefly, then stream the text in.
 * `run()` recomputes; `key` changes reset the state.
 */
export function useNova(compute: () => string, key: string, delay = 650) {
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const computeRef = useRef(compute);
  computeRef.current = compute;
  const [shown, done] = useTypewriter(text, 160);
  useEffect(() => {
    setText('');
    setThinking(false);
    window.clearTimeout(timer.current);
  }, [key]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const run = useCallback(() => {
    window.clearTimeout(timer.current);
    setThinking(true);
    setText('');
    timer.current = window.setTimeout(() => {
      setThinking(false);
      setText(computeRef.current());
    }, delay);
  }, [delay]);
  return { text, shown, done: done && !!text, thinking, run, clear: () => setText('') };
}

export function NovaBox({ title = 'Nova', children, actions, className, hud }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string; hud?: ReactNode }) {
  return (
    <div className={cx('neo-nova pf-nova', className)}>
      <span className="neo-nova__glow" aria-hidden="true" />
      <div className="pf-nova__head">
        <NovaChip>{title}</NovaChip>
        {hud && <span className="neo-hud">{hud}</span>}
        {actions && <span className="pf-nova__actions">{actions}</span>}
      </div>
      <div className="pf-nova__body">{children}</div>
    </div>
  );
}

export function NovaThinking({ label = 'Nova is thinking' }: { label?: string }) {
  return (
    <span className="pf-nova-thinking">
      <Sparkles aria-hidden="true" /> {label} <Typing label={label} />
    </span>
  );
}

/* ───────── Modal ───────── */

export function PfModal(props: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number; className?: string }) {
  return <Modal {...props} className={cx('neo-portal pf-modal', props.className)} icon={props.icon ? <span className="pf-modal__icon">{props.icon}</span> : undefined} />;
}

/* ───────── Undo bar ───────── */

export function UndoHost() {
  const entry = useUndo((s) => s.entry);
  const dismiss = useUndo((s) => s.dismiss);
  if (!entry) return null;
  return (
    <div className="pf-undo" role="status" aria-live="polite">
      <span className="grow truncate">{entry.message}</span>
      <button
        type="button"
        className="neo-btn neo-btn--soft neo-btn--xs"
        onClick={() => {
          const r = entry.undo();
          dismiss();
          if (r.ok) toast.success(r.message ?? 'Restored');
          else toast.error(r.error);
        }}
      >
        <Undo2 /> Undo
      </button>
      <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label="Dismiss" onClick={dismiss}>
        <X />
      </button>
    </div>
  );
}

/* ───────── Misc ───────── */

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd pf-kbd">{children}</kbd>;
}

/** Big, friendly number with a small unit. */
export function Num({ value, unit, className }: { value: ReactNode; unit?: ReactNode; className?: string }) {
  return (
    <span className={cx('neo-num pf-num', className)}>
      {value}
      {unit && <small>{unit}</small>}
    </span>
  );
}

export const pctText = (v: number) => `${Math.round(v * 100)}%`;
