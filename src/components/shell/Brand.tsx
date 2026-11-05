import { useId, type CSSProperties } from 'react';
import { Sparkles } from 'lucide-react';
import { BRAND } from '@/config/brand';
import { cx } from '@/lib/cx';

/** Animated orbital logo mark. */
export function BrandMark({ withText = true, sub = 'Employee Hub' }: { withText?: boolean; sub?: string }) {
  const gid = `bm-${useId().replace(/:/g, '')}`;
  return (
    <span className="brand">
      <span className="brand__mark" aria-hidden="true">
        <svg viewBox="0 0 64 64">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--accent)" />
              <stop offset="1" stopColor="var(--accent-2)" />
            </linearGradient>
          </defs>
          <circle cx="32" cy="32" r="15" fill="none" stroke={`url(#${gid})`} strokeWidth="3.5" />
          <g className="brand__orbit">
            <ellipse cx="32" cy="32" rx="27" ry="10" fill="none" stroke={`url(#${gid})`} strokeWidth="2.2" opacity="0.75" transform="rotate(-28 32 32)" />
            <circle cx="56" cy="20" r="3.2" fill="var(--accent)" />
          </g>
          <circle cx="32" cy="32" r="6" fill={`url(#${gid})`} />
        </svg>
      </span>
      {withText && (
        <span className="brand__text">
          <div className="brand__name">{BRAND.product}</div>
          <div className="brand__sub">{sub}</div>
        </span>
      )}
    </span>
  );
}

/** The "Nova" assistant orb — a living conic-gradient core. */
export function NovaOrb({
  size = 56,
  onClick,
  label = `Ask ${BRAND.assistant}`,
  className,
}: {
  size?: number;
  onClick?: () => void;
  label?: string;
  className?: string;
}) {
  const style = { '--size': `${size}px` } as CSSProperties;
  const inner = (
    <>
      <span className="nova-orb__halo" />
      <span className="nova-orb__core" />
      <span className="nova-orb__glint" />
      <Sparkles className="nova-orb__icon" />
    </>
  );
  if (!onClick)
    return (
      <span className={cx('nova-orb', className)} style={style} aria-hidden="true">
        {inner}
      </span>
    );
  return (
    <button type="button" className={cx('nova-orb', className)} style={style} onClick={onClick} aria-label={label}>
      {inner}
    </button>
  );
}

export function AmbientBackground() {
  return (
    <div className="ambient" aria-hidden="true">
      <div className="ambient__blob ambient__blob--a" />
      <div className="ambient__blob ambient__blob--b" />
      <div className="ambient__blob ambient__blob--c" />
      <div className="ambient__grid" />
      <div className="ambient__horizon" />
      <div className="ambient__noise" />
    </div>
  );
}
