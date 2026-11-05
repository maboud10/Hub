/**
 * Access requests: decide requests on items you can share (approve with a
 * role + expiry, or decline with a note) and track your own requests.
 */
import { useState } from 'react';
import { Link } from 'react-router';
import { Check, Clock, Inbox, KeyRound, MessageSquare, Send, X, XCircle } from 'lucide-react';
import { EmptyState } from '@/components/ui/primitives';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { formatDateTime, relativeTime } from '@/lib/format';
import { ROLE_META } from '@/drive/constants';
import { itemLink, useDrive } from '@/drive/store';
import { useAccessRequests } from '@/drive/selectors';
import type { DriveAccessRequest, DriveItem, DriveRole } from '@/drive/types';
import { KindIcon, RolePill, SensitivityPill, UserChip, useLocationOf, useUsersById } from './shared';

type Expiry = 'none' | '7' | '30' | '90';

export function AccessRequestsView() {
  const { toDecide, mine } = useAccessRequests();
  const [tab, setTab] = useState<'decide' | 'mine'>(toDecide.length ? 'decide' : 'mine');
  return (
    <div className="dr-view">
      <header className="dr-view__head">
        <div className="grow" style={{ minWidth: 0 }}>
          <h1 className="dr-view__title">
            <KeyRound /> Access requests
          </h1>
          <p className="text-sm muted">Owners and managers decide. Approvals create a time-boxed, audited share — DLP rules still apply.</p>
        </div>
      </header>
      <div className="dr-seg" role="tablist" aria-label="Access request lists">
        <button type="button" role="tab" aria-selected={tab === 'decide'} aria-pressed={tab === 'decide'} onClick={() => setTab('decide')}>
          <Inbox /> To decide {toDecide.length > 0 && <span className="dr-seg__count">{toDecide.length}</span>}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'mine'} aria-pressed={tab === 'mine'} onClick={() => setTab('mine')}>
          <Send /> My requests {mine.length > 0 && <span className="dr-seg__count">{mine.length}</span>}
        </button>
      </div>

      {tab === 'decide' &&
        (toDecide.length === 0 ? (
          <EmptyState icon={<Inbox />} title="Nothing to decide">
            Requests for files you own or manage will land here with the requester’s message.
          </EmptyState>
        ) : (
          <div className="dr-req-list">
            {toDecide.map(({ request, item }) => item && <DecideCard key={request.id} request={request} item={item} />)}
          </div>
        ))}

      {tab === 'mine' &&
        (mine.length === 0 ? (
          <EmptyState icon={<Send />} title="You haven’t requested access to anything">
            When you hit a file you can’t open, use “Request access” — your requests and their outcomes show up here.
          </EmptyState>
        ) : (
          <div className="dr-req-list">
            {mine.map(({ request, item }) => (
              <MyRequestCard key={request.id} request={request} item={item} />
            ))}
          </div>
        ))}
    </div>
  );
}

function DecideCard({ request, item }: { request: DriveAccessRequest; item: DriveItem }) {
  const decide = useDrive((s) => s.decideAccessRequest);
  const locationOf = useLocationOf();
  const users = useUsersById();
  const [role, setRole] = useState<DriveRole>(request.role);
  const [expiry, setExpiry] = useState<Expiry>('30');
  const [note, setNote] = useState('');
  const [declining, setDeclining] = useState(false);
  const loc = locationOf(item);
  const approve = () => toast.result(decide(request.id, true, { role, expiresInDays: expiry === 'none' ? undefined : Number(expiry), note: note || undefined }));
  const deny = () => toast.result(decide(request.id, false, { note: note || undefined }));

  return (
    <article className="dr-req-card">
      <div className="dr-req-card__who">
        <UserChip userId={request.requesterId} size={36} showName={false} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row row--wrap" style={{ gap: 6 }}>
            <span className="dr-req-card__name truncate">{users.get(request.requesterId)?.name ?? 'Someone'}</span>
            <span className="muted">asked for</span>
            <RolePill role={request.role} />
          </div>
          <div className="text-xs muted" title={formatDateTime(request.createdAt)}>
            <Clock style={{ width: 11, height: 11, display: 'inline', marginRight: 4 }} />
            {relativeTime(request.createdAt)}
          </div>
        </div>
      </div>
      <Link to={itemLink(item.id)} className="dr-req-card__item">
        <KindIcon kind={item.kind} size={20} />
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="block truncate" style={{ fontWeight: 600 }}>
            {item.name}
          </span>
          <span className="block text-xs muted truncate">{loc.label}</span>
        </span>
        <SensitivityPill sensitivity={item.sensitivity} compact />
      </Link>
      {request.message && (
        <blockquote className="dr-req-card__msg">
          <MessageSquare /> {request.message}
        </blockquote>
      )}
      <div className="dr-req-card__form">
        {!declining ? (
          <>
            <label className="field">
              <span className="field-label">Grant</span>
              <select className="select select--sm" value={role} onChange={(e) => setRole(e.target.value as DriveRole)}>
                {(['viewer', 'commenter', 'editor'] as DriveRole[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_META[r].label}
                    {r === request.role ? ' (requested)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">For</span>
              <select className="select select--sm" value={expiry} onChange={(e) => setExpiry(e.target.value as Expiry)}>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="none">No expiry</option>
              </select>
            </label>
            <label className="field grow">
              <span className="field-label">Note (optional)</span>
              <input className="input" style={{ height: 36 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Shown in the share" />
            </label>
            <div className="row" style={{ gap: 6, alignSelf: 'flex-end' }}>
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => setDeclining(true)}>
                <X /> Decline
              </button>
              <button type="button" className="btn btn--sm dr-btn-amber" onClick={approve}>
                <Check /> Approve
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="field grow">
              <span className="field-label">Reason for declining (sent to the requester)</span>
              <input className="input" style={{ height: 36 }} value={note} autoFocus onChange={(e) => setNote(e.target.value)} placeholder="e.g. Ask via your manager — this is Restricted" />
            </label>
            <div className="row" style={{ gap: 6, alignSelf: 'flex-end' }}>
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => setDeclining(false)}>
                Back
              </button>
              <button type="button" className="btn btn--sm btn--danger" onClick={deny}>
                <XCircle /> Decline request
              </button>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

function MyRequestCard({ request, item }: { request: DriveAccessRequest; item: DriveItem | undefined }) {
  const status = request.status;
  return (
    <article className={cx('dr-req-card dr-req-card--mine', `is-${status}`)}>
      <div className="dr-req-card__who">
        {item ? <KindIcon kind={item.kind} size={22} /> : <KeyRound />}
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row row--wrap" style={{ gap: 6 }}>
            {item && status === 'approved' ? (
              <Link to={itemLink(item.id)} style={{ fontWeight: 600 }} className="truncate">
                {item.name}
              </Link>
            ) : (
              <span style={{ fontWeight: 600 }} className="truncate">
                {item?.name ?? 'Deleted file'}
              </span>
            )}
            {item && <SensitivityPill sensitivity={item.sensitivity} compact />}
            <span className={cx('badge', status === 'approved' ? 'badge--success' : status === 'denied' ? 'badge--danger' : 'badge--warning')}>{status === 'pending' ? 'Pending' : status === 'approved' ? 'Approved' : 'Declined'}</span>
          </div>
          <div className="text-xs muted">Requested {ROLE_META[request.role].label.toLowerCase()} access</div>
        </div>
      </div>
      <ol className="dr-status-timeline">
        <li className="is-done">
          <span className="dr-status-timeline__dot" />
          <div>
            <b>Requested</b> <span className="muted">· {formatDateTime(request.createdAt)}</span>
            {request.message && <div className="text-xs muted">“{request.message}”</div>}
          </div>
        </li>
        <li className={cx(status !== 'pending' ? 'is-done' : 'is-waiting', status === 'denied' && 'is-denied')}>
          <span className="dr-status-timeline__dot" />
          <div>
            {status === 'pending' ? (
              <>
                <b>Waiting for a decision</b> <span className="muted">· the owner and drive managers were notified</span>
              </>
            ) : (
              <>
                <b>{status === 'approved' ? 'Approved' : 'Declined'}</b>{' '}
                <span className="muted">
                  · {request.decidedAt ? formatDateTime(request.decidedAt) : ''} {request.decidedBy && <>by <UserChip userId={request.decidedBy} size={14} /></>}
                </span>
              </>
            )}
          </div>
        </li>
        {status === 'approved' && item && (
          <li className="is-done">
            <span className="dr-status-timeline__dot" />
            <div>
              <b>You have access</b>{' '}
              <Link to={itemLink(item.id)} className="muted" style={{ textDecoration: 'underline' }}>
                Open {item.name}
              </Link>
            </div>
          </li>
        )}
      </ol>
    </article>
  );
}
