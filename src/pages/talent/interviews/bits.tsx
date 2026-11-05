/**
 * Small presentational pieces shared by the Interviews tab and the
 * schedule / scorecard modals: kind tiles, recommendation badges, location
 * line, panel feedback progress and live status.
 */
import type { CSSProperties, ReactNode } from 'react';
import { ChevronsDown, ChevronsUp, ExternalLink, Lock, MapPin, Phone, ThumbsDown, ThumbsUp, Video, type LucideIcon } from 'lucide-react';
import type { Interview, InterviewKind, Recommendation, Scorecard } from '@/talent/types';
import { INTERVIEW_KIND_META, RECOMMENDATION_META } from '@/talent/constants';
import { useUserById } from '@/store/selectors';
import { Avatar } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { hasEnded, isLive, KIND_HUE, parseLocation } from './utils';

export const REC_ICON: Record<Recommendation, LucideIcon> = {
  'strong-no': ChevronsDown,
  no: ThumbsDown,
  yes: ThumbsUp,
  'strong-yes': ChevronsUp,
};

/** Colour-coded format tile (icon + optional label). */
export function KindTile({ kind, size = 'md', label = false }: { kind: InterviewKind; size?: 'sm' | 'md' | 'lg'; label?: boolean }) {
  const m = INTERVIEW_KIND_META[kind];
  const Icon = m.icon;
  return (
    <span className={cx('tl-iv-kind', `tl-iv-kind--${size}`, label && 'tl-iv-kind--label')} style={{ '--kind-h': KIND_HUE[kind] } as CSSProperties} title={m.label}>
      <span className="tl-iv-kind__icon">
        <Icon aria-hidden="true" />
      </span>
      {label && <span className="tl-iv-kind__label">{m.label}</span>}
    </span>
  );
}

export function RecBadge({ rec, size = 'sm', short = false }: { rec: Recommendation; size?: 'sm' | 'md'; short?: boolean }) {
  const m = RECOMMENDATION_META[rec];
  const Icon = REC_ICON[rec];
  return (
    <span className={cx('tl-sc-rec', `tl-sc-rec--${rec}`, size === 'md' && 'tl-sc-rec--md')} title={m.label}>
      <Icon aria-hidden="true" />
      {short ? m.short : m.label}
    </span>
  );
}

/** "Hidden until you submit" placeholder for independent feedback. */
export function HiddenRec() {
  return (
    <span className="tl-sc-rec tl-sc-rec--hidden" title="Hidden until you submit your own scorecard">
      <Lock aria-hidden="true" />
      Hidden
    </span>
  );
}

export function LocationLine({ location, compact = false }: { location: string; compact?: boolean }) {
  const loc = parseLocation(location);
  const Icon = loc.kind === 'video' ? Video : loc.kind === 'phone' ? Phone : MapPin;
  const label = loc.url ? loc.label.replace(/\s*·?\s*(https?:\/\/)?(meet\.google\.com|zoom\.us|teams\.microsoft\.com)\/\S+/i, '').trim() || 'Video call' : loc.label;
  return (
    <span className={cx('tl-iv-loc', compact && 'tl-iv-loc--compact')}>
      <Icon aria-hidden="true" />
      <span className="truncate">{label}</span>
      {loc.url && (
        <a className="tl-iv-loc__link" href={loc.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title={loc.url}>
          {loc.url.replace(/^https?:\/\//, '')}
          <ExternalLink aria-hidden="true" />
        </a>
      )}
    </span>
  );
}

/** One segment per panelist, filled when their scorecard is in. */
export function FeedbackProgress({ interview, cards, showLabel = true }: { interview: Interview; cards: Scorecard[]; showLabel?: boolean }) {
  const submitted = new Set(cards.map((s) => s.interviewerId));
  const total = interview.interviewerIds.length;
  const done = interview.interviewerIds.filter((id) => submitted.has(id)).length;
  const complete = total > 0 && done === total;
  return (
    <span className={cx('tl-iv-fb', complete && 'is-complete')} role="img" aria-label={`${done} of ${total} scorecards submitted`} title={`${done}/${total} scorecards submitted`}>
      <span className="tl-iv-fb__bar" aria-hidden="true">
        {interview.interviewerIds.map((id) => (
          <i key={id} className={submitted.has(id) ? 'on' : ''} />
        ))}
      </span>
      {showLabel && (
        <span className="tl-iv-fb__label">
          {done}/{total}
        </span>
      )}
    </span>
  );
}

export type StatusTone = 'info' | 'success' | 'warning' | 'danger' | 'muted' | 'live';

export function interviewStatus(iv: Interview, cards: Scorecard[], now: number): { label: string; tone: StatusTone } {
  if (iv.status === 'cancelled') return { label: 'Cancelled', tone: 'muted' };
  if (iv.status === 'no-show') return { label: 'No-show', tone: 'danger' };
  if (isLive(iv, now)) return { label: 'Live now', tone: 'live' };
  if (hasEnded(iv, now)) {
    const submitted = new Set(cards.map((s) => s.interviewerId));
    const missing = iv.interviewerIds.filter((id) => !submitted.has(id)).length;
    return missing ? { label: 'Awaiting feedback', tone: 'warning' } : { label: 'Feedback in', tone: 'success' };
  }
  if (iv.scheduledAt - now < 60 * 60_000) return { label: 'Starting soon', tone: 'info' };
  return { label: 'Scheduled', tone: 'info' };
}

export function StatusPill({ label, tone }: { label: string; tone: StatusTone }) {
  return (
    <span className={cx('tl-iv-status', `tl-iv-status--${tone}`)}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
}

/** Interviewer avatar + first name, used in availability lists. */
export function MiniPerson({ userId, children }: { userId: string; children?: ReactNode }) {
  const u = useUserById(userId);
  if (!u) return null;
  return (
    <span className="tl-iv-person">
      <Avatar user={u} size={26} />
      <span className="tl-iv-person__text">
        <span className="tl-iv-person__name truncate">{u.name}</span>
        {children && <span className="tl-iv-person__meta">{children}</span>}
      </span>
    </span>
  );
}
