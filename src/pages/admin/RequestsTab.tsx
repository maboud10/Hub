import { useMemo, useState, type CSSProperties } from 'react';
import {
  ArrowRight,
  Ban,
  Boxes,
  Check,
  CircleCheck,
  CircleX,
  Clock,
  Eye,
  EyeOff,
  History,
  Hourglass,
  Info,
  PartyPopper,
  ShieldAlert,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useHub } from '@/store/hub';
import { usePermissions, useSessionUser } from '@/store/selectors';
import { useNow } from '@/hooks/useNow';
import { toast } from '@/store/toast';
import { Modal } from '@/components/ui/Modal';
import { AppIcon, Avatar, ClearanceBadge, EmptyState } from '@/components/ui/primitives';
import { appPermissionId } from '@/data/permissions';
import {
  canReviewRequest,
  clearanceOf,
  DURATION_LABEL,
  effectivePermissions,
  explainAccess,
  hasPermission,
  requestRisk,
} from '@/lib/rbac';
import { firstName, formatDateTime, pluralize, relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import type { AccessRequest, GrantDuration, HubApp, RequestStatus, Role, User } from '@/types';
import { Actor, DAY, DurationPicker, FilterChip, LockNote, ModalIcon, RiskBadge, useDisclosure } from './shared';

type ReviewCheck = { ok: boolean; reason?: string };
type HistoryFilter = 'all' | Exclude<RequestStatus, 'pending'>;

const HISTORY_PAGE = 8;
const QUICK_NOTES = [
  'Please use the shared team workspace instead.',
  'Needs your manager’s sign-off first.',
  'Please request a shorter window.',
  'Justification is too vague — add the ticket or project.',
];

const STATUS_META: Record<Exclude<RequestStatus, 'pending'>, { cls: string; label: string; Icon: LucideIcon }> = {
  approved: { cls: 'badge--success', label: 'Approved', Icon: CircleCheck },
  denied: { cls: 'badge--danger', label: 'Denied', Icon: CircleX },
  cancelled: { cls: 'badge--muted', label: 'Cancelled', Icon: Ban },
};

export function RequestsTab() {
  const now = useNow(60_000);
  const me = useSessionUser();
  const perms = usePermissions();
  const requests = useHub((s) => s.requests);
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  const apps = useHub((s) => s.apps);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const appMap = useMemo(() => new Map(apps.map((a) => [a.id, a])), [apps]);
  const [showAll, setShowAll] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE);
  const deny = useDisclosure<string>();

  const { mine, others } = useMemo(() => {
    const pending = requests.filter((r) => r.status === 'pending').sort((a, b) => a.createdAt - b.createdAt);
    const mineList: Array<{ r: AccessRequest; check: ReviewCheck }> = [];
    const otherList: Array<{ r: AccessRequest; check: ReviewCheck }> = [];
    for (const r of pending) {
      const check: ReviewCheck =
        r.userId === me?.id
          ? { ok: false, reason: 'Separation of duties — you can’t review your own request.' }
          : canReviewRequest(perms, r.appId);
      (check.ok ? mineList : otherList).push({ r, check });
    }
    return { mine: mineList, others: otherList };
  }, [requests, me, perms]);

  const summary = useMemo(() => {
    const oldest = mine[0]?.r.createdAt;
    const high = mine.filter(({ r }) => {
      const app = appMap.get(r.appId);
      const u = userMap.get(r.userId);
      return app && u ? requestRisk(app, u, roles, r.duration) === 'high' : false;
    }).length;
    return { oldest, high };
  }, [mine, appMap, userMap, roles]);

  const history = useMemo(
    () =>
      requests
        .filter((r) => r.status !== 'pending')
        .sort((a, b) => (b.reviewedAt ?? b.createdAt) - (a.reviewedAt ?? a.createdAt)),
    [requests],
  );
  const historyCounts = useMemo(
    () => ({
      all: history.length,
      approved: history.filter((r) => r.status === 'approved').length,
      denied: history.filter((r) => r.status === 'denied').length,
      cancelled: history.filter((r) => r.status === 'cancelled').length,
    }),
    [history],
  );
  const filteredHistory = historyFilter === 'all' ? history : history.filter((r) => r.status === historyFilter);

  const denyReq = deny.value ? requests.find((r) => r.id === deny.value) : undefined;

  return (
    <div className="adm-panel">
      <div className="adm-req-summary" role="status" aria-live="polite">
        <SummaryStat tone="accent" label="Waiting on you" value={mine.length} />
        <SummaryStat tone="muted" label="With other reviewers" value={others.length} />
        <SummaryStat tone="danger" label="High risk" value={summary.high} />
        <SummaryStat
          tone={summary.oldest && now - summary.oldest > DAY ? 'warning' : 'muted'}
          label="Oldest in queue"
          value={summary.oldest ? relativeTime(summary.oldest, now).replace(' ago', '') : '—'}
        />
        <span className="spacer" />
        {others.length > 0 && (
          <button type="button" className={cx('chip', showAll && 'is-active')} aria-pressed={showAll} onClick={() => setShowAll((v) => !v)}>
            {showAll ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            {showAll ? 'Hide others' : 'Show all pending'}
            <span className="count">{mine.length + others.length}</span>
          </button>
        )}
      </div>

      <section className="section adm-section-first" aria-labelledby="adm-queue-h">
        <div className="section-head">
          <h2 id="adm-queue-h" className="section-title">
            Your review queue <span className="count">{mine.length}</span>
          </h2>
          <span className="text-xs faint adm-hide-sm">Oldest first · delegated approval</span>
        </div>
        {mine.length === 0 ? (
          <div className="card adm-inbox-zero">
            <EmptyState
              icon={<PartyPopper />}
              title="Inbox zero"
              action={
                others.length > 0 && !showAll ? (
                  <button type="button" className="btn btn--sm" onClick={() => setShowAll(true)}>
                    <Eye aria-hidden="true" /> View {pluralize(others.length, 'other pending request')}
                  </button>
                ) : undefined
              }
            >
              Nothing is waiting on you. New requests for apps you hold will land here — and in your notifications.
            </EmptyState>
          </div>
        ) : (
          <div className="adm-req-list stagger">
            {mine.map(({ r, check }, i) => (
              <RequestCard
                key={r.id}
                index={i}
                request={r}
                requester={userMap.get(r.userId)}
                app={appMap.get(r.appId)}
                roles={roles}
                check={check}
                now={now}
                onDeny={deny.show}
              />
            ))}
          </div>
        )}
      </section>

      {showAll && others.length > 0 && (
        <section className="section" aria-labelledby="adm-others-h">
          <div className="section-head">
            <h2 id="adm-others-h" className="section-title">
              Waiting on other reviewers <span className="count">{others.length}</span>
            </h2>
            <span className="text-xs faint adm-hide-sm">Read-only</span>
          </div>
          <div className="adm-req-list stagger">
            {others.map(({ r, check }, i) => (
              <RequestCard
                key={r.id}
                index={i}
                request={r}
                requester={userMap.get(r.userId)}
                app={appMap.get(r.appId)}
                roles={roles}
                check={check}
                now={now}
                onDeny={deny.show}
              />
            ))}
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="adm-hist-h">
        <div className="section-head adm-wrap-head">
          <h2 id="adm-hist-h" className="section-title">
            <History aria-hidden="true" /> History
          </h2>
          <div className="chips" role="group" aria-label="Filter history">
            {(['all', 'approved', 'denied', 'cancelled'] as const).map((f) => (
              <FilterChip
                key={f}
                active={historyFilter === f}
                count={historyCounts[f]}
                onClick={() => {
                  setHistoryFilter(f);
                  setHistoryLimit(HISTORY_PAGE);
                }}
              >
                {f === 'all' ? 'All' : STATUS_META[f].label}
              </FilterChip>
            ))}
          </div>
        </div>
        {filteredHistory.length === 0 ? (
          <div className="card">
            <EmptyState icon={<History />} title="No decisions yet">
              Approved, denied and cancelled requests will appear here.
            </EmptyState>
          </div>
        ) : (
          <>
            <ul className="adm-hist-list">
              {filteredHistory.slice(0, historyLimit).map((r) => (
                <HistoryRow
                  key={r.id}
                  r={r}
                  requester={userMap.get(r.userId)}
                  reviewer={r.reviewedBy ? userMap.get(r.reviewedBy) : undefined}
                  app={appMap.get(r.appId)}
                  now={now}
                />
              ))}
            </ul>
            {filteredHistory.length > historyLimit && (
              <button type="button" className="btn btn--ghost btn--block adm-more" onClick={() => setHistoryLimit((n) => n + HISTORY_PAGE)}>
                Show more <span className="faint">({filteredHistory.length - historyLimit} older)</span>
              </button>
            )}
          </>
        )}
      </section>

      <DenyModal
        key={deny.value ?? 'none'}
        open={deny.open}
        onClose={deny.hide}
        request={denyReq}
        requester={denyReq ? userMap.get(denyReq.userId) : undefined}
        app={denyReq ? appMap.get(denyReq.appId) : undefined}
      />
    </div>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: number | string; tone: 'accent' | 'muted' | 'danger' | 'warning' }) {
  return (
    <div className={cx('adm-sumstat', `adm-tone--${tone}`)}>
      <span className="adm-sumstat__value">{value}</span>
      <span className="adm-micro">{label}</span>
    </div>
  );
}

// ─────────────────────────── request card ───────────────────────────

function RequestCard({
  request,
  requester,
  app,
  roles,
  check,
  now,
  onDeny,
  index,
}: {
  request: AccessRequest;
  requester: User | undefined;
  app: HubApp | undefined;
  roles: Role[];
  check: ReviewCheck;
  now: number;
  onDeny: (id: string) => void;
  index: number;
}) {
  const [duration, setDuration] = useState<GrantDuration>(request.duration);
  const readOnly = !check.ok;
  const risk = app && requester ? requestRisk(app, requester, roles, readOnly ? request.duration : duration) : 'high';
  const perm = appPermissionId(request.appId);

  const already = useMemo(() => {
    if (!requester || !app) return null;
    if (!hasPermission(effectivePermissions(requester, roles, now), perm)) return null;
    const why = explainAccess(requester, roles, perm, now);
    return why.roles.length
      ? `${firstName(requester.name)} already has access via ${why.roles.map((r) => r.name).join(', ')} — approving adds a redundant direct grant.`
      : `${firstName(requester.name)} already holds a direct grant — approving replaces it with the window you choose.`;
  }, [requester, app, roles, perm, now]);

  const approve = () => {
    toast.result(useHub.getState().reviewRequest(request.id, 'approved', { duration }));
  };

  const name = requester?.name ?? 'Unknown user';
  const appName = app?.name ?? 'Removed app';

  return (
    <article
      className={cx('card adm-req', readOnly && 'is-readonly', `adm-req--${risk}`)}
      style={{ '--i': index } as CSSProperties}
      aria-label={`Access request from ${name} for ${appName}`}
    >
      <span className="adm-req__risk-rail" aria-hidden="true" />
      <header className="adm-req__head">
        {requester ? <Avatar user={requester} size={42} presence /> : <span className="adm-avatar-missing" aria-hidden="true" />}
        <div className="grow">
          <div className="row row--wrap adm-gap-6">
            <strong className="adm-req__name">{name}</strong>
            {requester && <ClearanceBadge level={clearanceOf(requester, roles)} compact />}
            {requester && !requester.active && <span className="badge badge--muted">Deactivated</span>}
          </div>
          <div className="text-sm muted truncate">{requester ? `${requester.title} · ${requester.department}` : request.userId}</div>
        </div>
        <div className="adm-req__meta">
          <RiskBadge level={risk} />
          <time className="adm-req__time" dateTime={new Date(request.createdAt).toISOString()} title={formatDateTime(request.createdAt)}>
            <Clock aria-hidden="true" /> {relativeTime(request.createdAt, now)}
          </time>
        </div>
      </header>

      <div className="adm-req__app">
        {app ? (
          <AppIcon app={app} size={40} />
        ) : (
          <span className="adm-app-missing" aria-hidden="true">
            <Boxes />
          </span>
        )}
        <div className="grow">
          <div className="adm-req__app-name truncate">{appName}</div>
          <div className="text-xs faint truncate">{app ? `${app.category} · owned by ${app.owner}` : request.appId}</div>
        </div>
        <div className="adm-req__dur">
          <span className="adm-micro">Requested</span>
          <span className="adm-req__dur-value">
            <Hourglass aria-hidden="true" /> {DURATION_LABEL[request.duration]}
          </span>
        </div>
      </div>

      <blockquote className="adm-quote">“{request.reason}”</blockquote>

      {already && (
        <LockNote tone="info" icon={Info}>
          {already}
        </LockNote>
      )}
      {app && !app.enabled && (
        <LockNote tone="warning" icon={TriangleAlert}>
          {app.name} is currently disabled in the catalog.
        </LockNote>
      )}
      {readOnly && <LockNote tone="muted">{check.reason}</LockNote>}

      <fieldset className="adm-req__controls" disabled={readOnly} aria-label={readOnly ? 'Review controls (unavailable)' : 'Review controls'}>
        <div className="adm-req__dur-pick">
          <span className="adm-micro">Grant for</span>
          <DurationPicker value={readOnly ? request.duration : duration} onChange={setDuration} requested={request.duration} label={`Grant duration for ${name}`} />
        </div>
        <div className="adm-req__actions">
          <button type="button" className="btn btn--danger" onClick={() => onDeny(request.id)} aria-label={`Deny ${name}’s request for ${appName}`}>
            <X aria-hidden="true" /> Deny
          </button>
          <button
            type="button"
            className="btn btn--success"
            onClick={approve}
            disabled={!app}
            aria-label={`Approve ${appName} for ${name}, ${DURATION_LABEL[duration]}`}
          >
            <Check aria-hidden="true" /> Approve
          </button>
        </div>
      </fieldset>
      {!readOnly && duration === 'permanent' && (
        <LockNote tone="warning" icon={ShieldAlert}>
          Permanent grants never expire and are flagged in the audit log. Prefer a time-boxed window.
        </LockNote>
      )}
    </article>
  );
}

// ─────────────────────────── history ───────────────────────────

function HistoryRow({
  r,
  requester,
  reviewer,
  app,
  now,
}: {
  r: AccessRequest;
  requester: User | undefined;
  reviewer: User | undefined;
  app: HubApp | undefined;
  now: number;
}) {
  const meta = STATUS_META[r.status as Exclude<RequestStatus, 'pending'>] ?? STATUS_META.cancelled;
  return (
    <li className={cx('adm-hist', `is-${r.status}`)}>
      <div className="adm-hist__who">
        {requester ? <Avatar user={requester} size={34} /> : <span className="adm-avatar-missing" aria-hidden="true" />}
        <div className="grow">
          <div className="adm-hist__line">
            <strong className="truncate">{requester?.name ?? 'Unknown user'}</strong>
            <ArrowRight aria-hidden="true" className="faint" />
            {app && <AppIcon app={app} size={20} />}
            <span className="truncate">{app?.name ?? r.appId}</span>
          </div>
          <div className="text-xs faint">
            Asked for {DURATION_LABEL[r.duration].toLowerCase()} ·{' '}
            <time dateTime={new Date(r.createdAt).toISOString()} title={formatDateTime(r.createdAt)}>
              {relativeTime(r.createdAt, now)}
            </time>
          </div>
        </div>
      </div>
      <div className="adm-hist__decision">
        <span className={cx('badge', meta.cls)}>
          <meta.Icon aria-hidden="true" />
          {meta.label}
        </span>
        {r.grantedDuration && (
          <span className="badge badge--info">
            <Hourglass aria-hidden="true" />
            {DURATION_LABEL[r.grantedDuration]}
          </span>
        )}
      </div>
      <div className="adm-hist__by text-xs muted">
        {r.status === 'cancelled' ? (
          <span>Withdrawn by the requester</span>
        ) : (
          <>
            <span>by</span>
            <Actor user={reviewer} size={18} />
            {r.reviewedAt && (
              <time dateTime={new Date(r.reviewedAt).toISOString()} title={formatDateTime(r.reviewedAt)}>
                · {relativeTime(r.reviewedAt, now)}
              </time>
            )}
          </>
        )}
      </div>
      {r.reviewNote && <blockquote className="adm-quote adm-quote--sm adm-hist__note">“{r.reviewNote}”</blockquote>}
    </li>
  );
}

// ─────────────────────────── deny modal ───────────────────────────

function DenyModal({
  open,
  onClose,
  request,
  requester,
  app,
}: {
  open: boolean;
  onClose: () => void;
  request: AccessRequest | undefined;
  requester: User | undefined;
  app: HubApp | undefined;
}) {
  const [note, setNote] = useState('');
  const who = requester ? firstName(requester.name) : 'the requester';

  const submit = () => {
    if (!request) return;
    const ok = toast.result(useHub.getState().reviewRequest(request.id, 'denied', { note }));
    if (ok) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Deny access request"
      subtitle={requester && app ? `${requester.name} → ${app.name}` : undefined}
      icon={<ModalIcon icon={Ban} tone="danger" />}
      className="adm-overlay"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--danger" onClick={submit} disabled={!request || request.status !== 'pending'}>
            <X aria-hidden="true" /> Deny request
          </button>
        </>
      }
    >
      <div className="stack">
        {request && <blockquote className="adm-quote">“{request.reason}”</blockquote>}
        <div className="field">
          <label className="field-label" htmlFor="adm-deny-note">
            Note to {who} <span className="faint">(optional)</span>
          </label>
          <textarea
            id="adm-deny-note"
            className="textarea"
            rows={3}
            maxLength={280}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Explain why, or point to an alternative…"
            data-autofocus
          />
          <span className="field-hint">
            Shared in their notification and recorded in the audit log · {note.length}/280
          </span>
        </div>
        <div className="stack stack--sm">
          <span className="adm-micro">Quick replies</span>
          <div className="row row--wrap adm-gap-6">
            {QUICK_NOTES.map((q) => (
              <button key={q} type="button" className={cx('chip', 'adm-chip-wrap-text', note === q && 'is-active')} onClick={() => setNote(q)}>
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
