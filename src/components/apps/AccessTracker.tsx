import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { KeyRound, Send, ShieldCheck, UserCheck } from 'lucide-react';
import type { AccessRequest, User } from '@/types';
import { useHub } from '@/store/hub';
import { useNow } from '@/hooks/useNow';
import { NeoTracker, tintVars, type NeoTint, type NeoTrackState, type NeoTrackStep } from '@/components/neo';
import { DURATION_LABEL, type RiskLevel } from '@/lib/rbac';
import { firstName, relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { buildAccessJourney, shortSpan, type AccessJourney, type ReviewerKind } from './accessJourney';

/* ==========================================================================
   Access tracker — the hub's "pizza tracker" for access requests:
   Requested → Manager review → Security check → Access granted.
   Used by the app details sheet, pending app tiles and Control Center.
   Copy is split into static text nodes (names/numbers in their own elements)
   so the DOM translator can localise every phrase.
   ========================================================================== */

export interface AccessViewer {
  /** Session user. When it is the requester, copy speaks to them ("your request"). */
  id?: string | null;
  /** Reviewer perspective: can the viewer decide this request themselves? */
  canReview?: boolean;
}

export interface AccessTrackerView {
  steps: NeoTrackStep[];
  current: number;
  state: NeoTrackState;
  progress?: number;
  /** Live status line (full tracker). */
  message: ReactNode;
  /** One-liner for tiles: who has it right now. */
  short: ReactNode;
  eta?: string;
  /** Pending review past its 24h window. */
  overdue: boolean;
  title?: string;
  label: string;
}

const RISK_LABEL: Record<RiskLevel, string> = { low: 'Low risk', medium: 'Medium risk', high: 'High risk' };

const Sep = () => (
  <span className="acc-trk__sep" aria-hidden="true">
    ·
  </span>
);

function Who({ user, viewerId }: { user?: User; viewerId?: string | null }) {
  return <b className="acc-trk__who">{!user ? 'Unknown user' : user.id === viewerId ? 'You' : firstName(user.name)}</b>;
}

function reviewLabel(j: AccessJourney): string {
  if (j.request.status === 'denied') return 'Declined';
  if (j.request.status === 'cancelled') return 'Withdrawn';
  return j.leadKind === 'manager' ? 'Manager review' : j.leadKind === 'admin' ? 'Admin review' : 'Approver review';
}

const RELATION: Record<ReviewerKind, (mine: boolean) => string> = {
  manager: (mine) => (mine ? 'Your manager' : 'Manager'),
  admin: () => 'System Admin',
  holder: () => 'App holder',
};

/** "(your manager)" / "(their manager)" / "(System Admin)" tag after the reviewer's name. */
function roleTag(kind: ReviewerKind | undefined, mine: boolean): ReactNode {
  if (kind === 'manager') return <span className="acc-trk__role">{mine ? '(your manager)' : '(their manager)'}</span>;
  if (kind === 'admin') return <span className="acc-trk__role">(System Admin)</span>;
  return null;
}

/** Turns a journey into NeoTracker props + copy for one viewer. Pure (no hooks). */
export function accessTrackerView(j: AccessJourney, viewer: AccessViewer, now: number): AccessTrackerView {
  const { request: r, lead, requester } = j;
  const mine = !!viewer.id && viewer.id === r.userId;
  const status = r.status;
  const grantWindow = DURATION_LABEL[r.grantedDuration ?? r.duration];

  const steps: NeoTrackStep[] = [
    {
      id: 'requested',
      label: 'Requested',
      icon: <Send />,
      sub: mine ? 'You' : requester ? firstName(requester.name) : 'Unknown user',
      at: relativeTime(r.createdAt, now),
    },
    {
      id: 'review',
      label: reviewLabel(j),
      icon: <UserCheck />,
      sub:
        status === 'cancelled'
          ? mine
            ? 'You'
            : requester
              ? firstName(requester.name)
              : 'Unknown user'
          : lead
            ? `${lead.id === viewer.id ? 'You' : firstName(lead.name)} · ${RELATION[j.leadKind ?? 'holder'](mine)}`
            : 'Unassigned',
      at: (status === 'approved' || status === 'denied') && r.reviewedAt ? relativeTime(r.reviewedAt, now) : undefined,
    },
    { id: 'checks', label: 'Security check', icon: <ShieldCheck />, sub: RISK_LABEL[j.risk] },
    {
      id: 'granted',
      label: 'Access granted',
      icon: <KeyRound />,
      sub: grantWindow,
      at: status === 'approved' && r.reviewedAt ? relativeTime(r.reviewedAt, now) : undefined,
    },
  ];

  let message: ReactNode;
  let short: ReactNode;
  let eta: string | undefined;
  let title: string | undefined;

  if (status === 'pending') {
    title = 'Your access is on its way';
    if (j.stall === 'requester-inactive') {
      message = short = 'Account deactivated — this request can’t be reviewed';
    } else if (j.stall === 'no-approver' || !lead) {
      message = short = 'No approver is available yet';
    } else {
      eta = now < j.dueAt ? `Decision due · ${relativeTime(j.dueAt, now)}` : mine ? 'Running late' : 'Overdue';
      if (mine) {
        short = (
          <>
            <Who user={lead} /> {roleTag(j.leadKind, true)} is reviewing your request
          </>
        );
        message = (
          <>
            {short}
            {j.typicalMs !== null && (
              <>
                <Sep />
                usually replies in <b className="acc-trk__num">~{shortSpan(j.typicalMs)}</b>
              </>
            )}
          </>
        );
      } else if (lead.id === viewer.id) {
        const others = j.approvers.length - 1;
        message = short = (
          <>
            <b className="acc-trk__who">Waiting on you</b>
            {others > 0 && (
              <>
                <Sep />
                <b className="acc-trk__num">{others}</b> {others === 1 ? 'other approver notified' : 'other approvers notified'}
              </>
            )}
          </>
        );
      } else {
        message = short = (
          <>
            <Who user={lead} viewerId={viewer.id} /> {roleTag(j.leadKind, false)} is reviewing
            {viewer.canReview && (
              <>
                <Sep />
                you can approve too
              </>
            )}
          </>
        );
      }
    }
  } else if (status === 'approved') {
    title = 'You’re in';
    message = short = (
      <>
        <Who user={lead} viewerId={viewer.id} /> {mine ? 'approved your request — you’re all set' : 'approved the request'}
      </>
    );
    if (j.expiresAt === null) eta = 'Permanent access';
    else if (j.expiresAt !== undefined) eta = j.expiresAt > now ? `Expires · ${relativeTime(j.expiresAt, now)}` : `Expired · ${relativeTime(j.expiresAt, now)}`;
  } else if (status === 'denied') {
    title = 'Request declined';
    message = short = (
      <>
        <Who user={lead} viewerId={viewer.id} /> {mine ? 'declined your request' : 'declined the request'}
        {r.reviewNote && (
          <>
            :{' '}
            <q className="acc-trk__note" data-no-i18n>
              {r.reviewNote}
            </q>
          </>
        )}
      </>
    );
  } else {
    title = 'Request withdrawn';
    message = short = 'Withdrawn by the requester';
  }

  return {
    steps,
    current: j.current,
    state: j.state,
    progress: status === 'pending' && j.state === 'active' ? j.elapsed : undefined,
    message,
    short,
    eta,
    overdue: status === 'pending' && j.state === 'active' && now >= j.dueAt,
    title: mine ? title : undefined,
    label: `Access tracker · ${j.app?.name ?? r.appId}`,
  };
}

/** Builds the journey for one request from live store data. */
export function useAccessJourney(request: AccessRequest | undefined, now: number): AccessJourney | null {
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  const apps = useHub((s) => s.apps);
  const requests = useHub((s) => s.requests);
  return useMemo(() => (request ? buildAccessJourney(request, { users, roles, apps, requests, now }) : null), [request, users, roles, apps, requests, now]);
}

/** Tracker view for one request, refreshed every minute (the courier advances with the review window). */
export function useAccessTracker(request: AccessRequest | undefined, viewer: AccessViewer): AccessTrackerView | null {
  const now = useNow(60_000);
  const journey = useAccessJourney(request, now);
  const { id, canReview } = viewer;
  return useMemo(() => (journey ? accessTrackerView(journey, { id, canReview }, now) : null), [journey, id, canReview, now]);
}

export interface AccessTrackProps {
  view: AccessTrackerView;
  compact?: boolean;
  bare?: boolean;
  /** Hide the status line (when the host shows `view.message` itself). */
  noMessage?: boolean;
  actions?: ReactNode;
  /** Paint the tracker in the requested app's own plasma. */
  tint?: NeoTint;
  className?: string;
}

/** Presentational tracker for a precomputed view. */
export function AccessTrack({ view, compact, bare, noMessage, actions, tint, className }: AccessTrackProps) {
  return (
    <NeoTracker
      className={cx('acc-trk', tint && 'acc-trk--tinted', view.overdue && 'acc-trk--overdue', className)}
      style={tint ? (tintVars(tint) as CSSProperties) : undefined}
      steps={view.steps}
      current={view.current}
      state={view.state}
      progress={view.progress}
      label={view.label}
      compact={compact}
      bare={bare}
      hud={compact ? undefined : 'Access tracker'}
      title={compact ? undefined : view.title}
      eta={compact ? undefined : view.eta}
      message={compact || noMessage ? undefined : view.message}
      actions={actions}
    />
  );
}

/** Connected tracker: give it a request, it names the people and keeps itself fresh. */
export function AccessTracker({ request, viewerId, canReview, ...rest }: Omit<AccessTrackProps, 'view'> & { request: AccessRequest | undefined; viewerId?: string | null; canReview?: boolean }) {
  const view = useAccessTracker(request, { id: viewerId, canReview });
  return view ? <AccessTrack view={view} {...rest} /> : null;
}
