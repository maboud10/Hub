import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import type { User } from '@/types';
import { Avatar } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';

export type Tone = 'violet' | 'indigo' | 'blue' | 'cyan' | 'teal' | 'emerald' | 'lime' | 'amber' | 'orange' | 'rose' | 'pink' | 'slate' | 'app' | 'success' | 'warning' | 'danger';

/* ==========================================================================
   Data viz
   ========================================================================== */

/** Circular progress ring. `value` is 0..1. */
export function Ring({
  value,
  size = 56,
  stroke = 6,
  color,
  track,
  children,
  label,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  /** Stroke colour or gradient id; defaults to the app plasma gradient. */
  color?: string;
  track?: string;
  children?: ReactNode;
  label?: string;
  className?: string;
}) {
  const gid = useId().replace(/:/g, '');
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <span className={cx('neo-ring', className)} style={{ width: size, height: size }} role="img" aria-label={label ?? `${Math.round(v * 100)}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={`rg${gid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--app-c1)" />
            <stop offset="100%" stopColor="var(--app-c2)" />
          </linearGradient>
        </defs>
        <circle className="neo-ring__track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} style={track ? { stroke: track } : undefined} />
        {v > 0 && (
          <circle
            className="neo-ring__halo"
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color ?? `url(#rg${gid})`}
            strokeWidth={stroke + 5}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - v)}
          />
        )}
        <circle
          className="neo-ring__value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color ?? `url(#rg${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
        />
      </svg>
      {children !== undefined && (
        <span className="neo-ring__label" style={{ fontSize: Math.max(11, size * 0.26) }}>
          {children}
        </span>
      )}
    </span>
  );
}

/** Tiny line chart. */
export function Spark({
  data,
  width = 120,
  height = 36,
  area = true,
  color,
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  area?: boolean;
  color?: string;
  className?: string;
}) {
  const gid = useId().replace(/:/g, '');
  if (data.length < 2) return <svg width={width} height={height} className={cx('neo-spark', className)} aria-hidden="true" />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = 3;
  const pts = data.map((d, i) => [(i / (data.length - 1)) * (width - pad * 2) + pad, height - pad - ((d - min) / span) * (height - pad * 2)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const fill = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cx('neo-spark', className)} aria-hidden="true">
      <defs>
        <linearGradient id={`sf${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color ?? 'var(--app-c1)'} stopOpacity="0.45" />
          <stop offset="100%" stopColor={color ?? 'var(--app-c1)'} stopOpacity="0" />
        </linearGradient>
      </defs>
      {area && <path d={fill} fill={`url(#sf${gid})`} />}
      <path d={line} className="neo-spark__line" style={color ? { stroke: color } : undefined} />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.6} fill={color ?? 'var(--app-c1)'} />
    </svg>
  );
}

/** Horizontal progress bar. `value` is 0..1. */
export function Bar({ value, fill, className, label, height }: { value: number; fill?: string; className?: string; label?: string; height?: number }) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div
      className={cx('neo-bar', className)}
      style={{ ...(fill ? ({ '--bar-fill': fill } as CSSProperties) : {}), ...(height ? { height } : {}) }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      aria-label={label}
    >
      <i style={{ width: `${v * 100}%` }} />
    </div>
  );
}

/** Segmented meter (e.g. 3/5 lit). */
export function Meter({ value, segments = 5, label }: { value: number; segments?: number; label?: string }) {
  return (
    <div className="neo-meter" role="img" aria-label={label ?? `${value} of ${segments}`}>
      {Array.from({ length: segments }, (_, i) => (
        <i key={i} className={i < value ? 'on' : undefined} />
      ))}
    </div>
  );
}

/** Animated number that counts up to `value` when it changes. */
export function CountUp({ value, duration = 700, format = (n: number) => Math.round(n).toLocaleString() }: { value: number; duration?: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const b = value;
    if (a === b) return;
    const reduce = document.documentElement.dataset.motion === 'reduced' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setShown(b);
      from.current = b;
      return;
    }
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(a + (b - a) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = b;
    };
  }, [value, duration]);
  return <>{format(shown)}</>;
}

/* ==========================================================================
   Bits
   ========================================================================== */

export function Chip({
  tone = 'slate',
  size,
  icon,
  children,
  onClick,
  pressed,
  title,
  solid,
  className,
}: {
  tone?: Tone;
  size?: 'sm' | 'lg';
  icon?: ReactNode;
  children?: ReactNode;
  onClick?: () => void;
  pressed?: boolean;
  title?: string;
  solid?: boolean;
  className?: string;
}) {
  const cls = cx('neo-chip', size && `neo-chip--${size}`, solid && 'neo-chip--solid', className);
  if (onClick)
    return (
      <button type="button" className={cls} data-tone={tone} onClick={onClick} aria-pressed={pressed} title={title}>
        {icon}
        {children}
      </button>
    );
  return (
    <span className={cls} data-tone={tone} title={title}>
      {icon}
      {children}
    </span>
  );
}

/** Glowing status dot. */
export function Orb({ tone = 'slate', pulse, size, title }: { tone?: Tone; pulse?: boolean; size?: number; title?: string }) {
  return (
    <span
      className={cx('neo-orb', pulse && 'neo-orb--pulse')}
      data-tone={tone}
      style={size ? { width: size, height: size } : undefined}
      title={title}
      role={title ? 'img' : undefined}
      aria-label={title}
    />
  );
}

/** Holographic empty state. */
export function NeoEmpty({ icon, title, children, action, compact }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className="neo-empty" style={compact ? { padding: '22px 16px' } : undefined}>
      <div className="neo-empty__holo">{icon}</div>
      <div className="neo-empty__title">{title}</div>
      {children && <div className="neo-empty__text">{children}</div>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  );
}

/** "Nova" AI marker chip. */
export function NovaChip({ children = 'Nova' }: { children?: ReactNode }) {
  return (
    <span className="neo-nova-chip">
      <Sparkles />
      {children}
    </span>
  );
}

/** Three-dot typing / thinking indicator. */
export function Typing({ label = 'Typing' }: { label?: string }) {
  return (
    <span className="neo-typing" role="status" aria-label={label}>
      <i />
      <i />
      <i />
    </span>
  );
}

/** Overlapping avatars with a +N overflow pill. */
export function Avatars({ users, max = 4, size = 26 }: { users: Pick<User, 'id' | 'name' | 'avatarHue'>[]; max?: number; size?: number }) {
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  return (
    <span className="neo-avatars" title={users.map((u) => u.name).join(', ')}>
      {shown.map((u) => (
        <Avatar key={u.id} user={u} size={size} />
      ))}
      {extra > 0 && (
        <span className="neo-avatars__more" style={{ ['--size' as string]: `${size}px` }}>
          +{extra}
        </span>
      )}
    </span>
  );
}

/**
 * Streams `text` in like an AI response. Restarts when `text` changes.
 * Returns `[visibleText, done]`.
 */
export function useTypewriter(text: string, cps = 90): [string, boolean] {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    if (!text) return;
    const reduce = document.documentElement.dataset.motion === 'reduced' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setN(text.length);
      return;
    }
    const step = Math.max(1, Math.round(cps / 30));
    const id = window.setInterval(() => {
      setN((v) => {
        if (v + step >= text.length) {
          window.clearInterval(id);
          return text.length;
        }
        return v + step;
      });
    }, 1000 / 30);
    return () => window.clearInterval(id);
  }, [text, cps]);
  return [text.slice(0, n), n >= text.length];
}
