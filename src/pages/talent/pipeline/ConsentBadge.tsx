/**
 * Small candidate badges shared by the talent pool, profile sheet and
 * pipeline modals (consent state).
 */
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import type { Candidate } from '@/talent/types';
import { cx } from '@/lib/cx';
import { fmtDay } from '../components/format';

const METHOD: Record<NonNullable<Candidate['consent']['method']>, string> = {
  email: 'email',
  linkedin: 'LinkedIn',
  application: 'application form',
  verbal: 'verbal',
};

/** GDPR / UAE PDPL consent state: recorded, expiring (< 30 days) or missing. */
export function ConsentBadge({ consent, compact = false }: { consent: Candidate['consent']; compact?: boolean }) {
  if (!consent.given)
    return (
      <span className="badge badge--warning" title="No data-processing consent recorded yet">
        <ShieldAlert aria-hidden="true" />
        {compact ? 'No consent' : 'No consent yet'}
      </span>
    );
  const soon = !!consent.retentionUntil && consent.retentionUntil - Date.now() < 30 * 86_400_000;
  return (
    <span
      className={cx('badge', soon ? 'badge--warning' : 'badge--success')}
      title={`Consent via ${consent.method ? METHOD[consent.method] : 'unspecified method'}${consent.retentionUntil ? ` · retained until ${fmtDay(consent.retentionUntil)}` : ''}`}
    >
      <ShieldCheck aria-hidden="true" />
      {soon ? 'Consent expiring' : 'Consent'}
    </span>
  );
}
