/**
 * Glowing line-art device silhouettes (inline SVG) for holograms, catalog
 * cards and the device picker. Stroke uses the app plasma gradient unless a
 * colour is given.
 */
import { useId, type ReactNode } from 'react';
import type { DeviceKind } from '@/helpdesk/types';
import { cx } from '@/lib/cx';

function shape(kind: DeviceKind): ReactNode {
  switch (kind) {
    case 'laptop':
      return (
        <>
          <rect className="g-fill" x="22" y="12" width="76" height="52" rx="5" />
          <rect x="22" y="12" width="76" height="52" rx="5" />
          <rect className="g-screen" x="27" y="17" width="66" height="42" rx="2" />
          <circle cx="60" cy="14.6" r="0.9" />
          <path d="M10 67h100l-5 8.5a3 3 0 0 1-2.6 1.5H17.6a3 3 0 0 1-2.6-1.5Z" />
          <path className="g-faint" d="M51 67.5h18" />
          <path className="g-faint" d="M33 26h22M33 31h34M33 36h16" />
        </>
      );
    case 'desktop':
      return (
        <>
          <rect className="g-fill" x="36" y="10" width="48" height="70" rx="7" />
          <rect x="36" y="10" width="48" height="70" rx="7" />
          <circle cx="60" cy="20" r="2.4" />
          <path className="g-faint" d="M44 40h32M44 46h32M44 52h32M44 58h32M44 64h32" />
          <path className="g-faint" d="M48 72h6M58 72h6" />
        </>
      );
    case 'monitor':
      return (
        <>
          <rect className="g-fill" x="12" y="8" width="96" height="58" rx="4" />
          <rect x="12" y="8" width="96" height="58" rx="4" />
          <rect className="g-screen" x="16" y="12" width="88" height="48" rx="2" />
          <path d="M53 66l-2.5 11M67 66l2.5 11" />
          <path d="M42 78.5h36" />
          <path className="g-faint" d="M24 22h30M24 28h46M24 34h22" />
        </>
      );
    case 'phone':
      return (
        <>
          <rect className="g-fill" x="42" y="6" width="36" height="78" rx="8" />
          <rect x="42" y="6" width="36" height="78" rx="8" />
          <rect className="g-screen" x="45.5" y="9.5" width="29" height="71" rx="5.5" />
          <rect x="54" y="12.5" width="12" height="3.6" rx="1.8" />
          <path d="M79.5 26v9" />
          <path className="g-faint" d="M50 30h20M50 36h14M50 64h20" />
        </>
      );
    case 'tablet':
      return (
        <>
          <rect className="g-fill" x="20" y="12" width="80" height="62" rx="7" />
          <rect x="20" y="12" width="80" height="62" rx="7" />
          <rect className="g-screen" x="25" y="17" width="70" height="52" rx="3" />
          <circle cx="60" cy="14.5" r="0.9" />
          <path className="g-faint" d="M32 28h26M32 34h38M32 40h18" />
        </>
      );
    case 'security-key':
      return (
        <>
          <rect className="g-fill" x="26" y="30" width="58" height="28" rx="8" />
          <rect x="26" y="30" width="58" height="28" rx="8" />
          <rect x="84" y="38" width="13" height="12" rx="2.5" />
          <circle cx="56" cy="44" r="7.5" />
          <circle className="g-dot" cx="56" cy="44" r="3" />
          <circle cx="35" cy="44" r="3" />
        </>
      );
    case 'headset':
      return (
        <>
          <path d="M28 58c0-24 14-40 32-40s32 16 32 40" />
          <path className="g-faint" d="M33 56c0-20 12-33 27-33s27 13 27 33" />
          <rect className="g-fill" x="19" y="52" width="17" height="25" rx="7" />
          <rect x="19" y="52" width="17" height="25" rx="7" />
          <rect className="g-fill" x="84" y="52" width="17" height="25" rx="7" />
          <rect x="84" y="52" width="17" height="25" rx="7" />
          <path d="M27 77c2 8 9 10 20 10" />
          <circle className="g-dot" cx="48" cy="87" r="2" />
        </>
      );
    case 'dock':
      return (
        <>
          <rect className="g-fill" x="16" y="34" width="88" height="26" rx="7" />
          <rect x="16" y="34" width="88" height="26" rx="7" />
          <rect x="26" y="43" width="9" height="6" rx="1.5" />
          <rect x="40" y="43" width="9" height="6" rx="1.5" />
          <rect x="54" y="43" width="12" height="6" rx="1.5" />
          <rect x="71" y="43" width="6" height="6" rx="3" />
          <circle className="g-dot" cx="94" cy="46" r="2" />
        </>
      );
    case 'keyboard':
      return (
        <>
          <rect className="g-fill" x="10" y="28" width="100" height="38" rx="6" />
          <rect x="10" y="28" width="100" height="38" rx="6" />
          {[0, 1, 2].map((row) =>
            Array.from({ length: 11 }, (_, i) => <rect key={`${row}-${i}`} className="g-faint" x={16 + i * 7.6} y={34 + row * 8} width="5.4" height="5" rx="1.2" />),
          )}
          <rect className="g-faint" x="34" y="58" width="44" height="4.6" rx="1.4" />
          <circle cx="102" cy="36.5" r="2.6" />
        </>
      );
  }
}

export function DeviceGlyph({ kind, size = 120, color, className, title }: { kind: DeviceKind; size?: number; color?: string; className?: string; title?: string }) {
  const id = useId().replace(/:/g, '');
  const stroke = color ?? `url(#g${id})`;
  return (
    <svg
      className={cx('hd-glyph', className)}
      width={size}
      height={size * 0.75}
      viewBox="0 0 120 90"
      fill="none"
      stroke={stroke}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ ['--g-color' as string]: color ?? 'var(--app-c1)' }}
    >
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={color ?? 'var(--app-c1)'} />
          <stop offset="100%" stopColor={color ?? 'var(--app-c2)'} />
        </linearGradient>
        <linearGradient id={`f${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color ?? 'var(--app-c1)'} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color ?? 'var(--app-c2)'} stopOpacity="0.04" />
        </linearGradient>
      </defs>
      <g style={{ ['--g-fill' as string]: `url(#f${id})` }}>{shape(kind)}</g>
    </svg>
  );
}
