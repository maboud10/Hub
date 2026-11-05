/**
 * Helix brand marks for HR documents and the digital insurance card: a
 * double-helix glyph (inherits `currentColor`) and the gradient letterhead tile.
 * No SVG ids/gradients, so sheets can be safely cloned for printing.
 */
import { cx } from '@/lib/cx';

export function HelixGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M7 3c0 5 10 5 10 9s-10 4-10 9" />
      <path d="M17 3c0 5-10 5-10 9s10 4 10 9" />
      <path d="M8.6 4.6h6.8M8.2 12h7.6M8.6 19.4h6.8" strokeWidth="1.4" opacity="0.65" />
    </svg>
  );
}

/** Gradient tile with the glyph, used on letterheads and payslips. */
export function HelixMark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <span className={cx('hr-doc-mark', size === 'sm' && 'hr-doc-mark--sm')} aria-hidden="true">
      <HelixGlyph />
    </span>
  );
}
