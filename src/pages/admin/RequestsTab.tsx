import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  ArrowRight,
  Ban,
  Boxes,
  Check,
  CircleCheck,
  CircleX,
  Clock,
  History,
  Hourglass,
  Inbox,
  Info,
  PartyPopper,
  ScrollText,
  ShieldAlert,
  TriangleAlert,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { NeoEmpty, NeoKpi, NeoKpis, NeoPanel, NeoTabs } from '@/components/neo';
import { useHub } from '@/store/hub';
import { usePermissions, useSessionUser } from '@/store/selectors';
import { useNow } from '@/hooks/useNow';
import { toast } from '@/store/toast';
import { Modal } from '@/components/ui/Modal';
import { AppIcon, Avatar, ClearanceBadge } from '@/components/ui/primitives';
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
import { adminHref } from './adminTabs';
import { useAdminChrome } from './chrome';
import { Actor, DAY, DurationPicker, FilterChip, LockNote, ModalIcon, RiskBadge, useDisclosure, type ChipTone } from './shared';

type ReviewCheck = { ok: boolean; reason?: string };
type HistoryFilter = 'all' | Exclude<RequestStatus, 'pending'>;
type View = 'queue' | 'others' | 'history';

const parseView = (v: string | null): View => (v === 'others' || v === 'history' ? v : 'queue');

const HISTORY_PAGE = 8;
const QUICK_NOTES = [
  'Please use the shared team workspace instead.',
  'Needs your manager’s sign-off first.',
  'Please request a shorter window.',
  'Justification is too vague — add the ticket or project.',
];

const STATUS_META: Record<Exclude<RequestStatus, 'pending'>, { tone: ChipTone; label: string; Icon: LucideIcon }> = {
  approved: { tone: 'success', label: 'Approved', Icon: CircleCheck },
  denied: { tone: 'danger', label: 'Denied', Icon: CircleX },
  cancelled: { tone: 'slate', label: 'Cancelled', Icon: Ban },
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
  const [sp, setSp] = useSearchParams();
  const view = parseView(sp.get('view'));
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE);
  const deny = useDisclosure<string>();
  const canAudit = hasPermission(perms, 'hub.audit.view');

  const setView = (v: View) => {
    const next = new URLSearchParams(sp);
    if (v === 'queue') next.delete('view');
    else next.set('view', v);
    setSp(next, { replace: true });
  };

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
  const week = useMemo(() => {
    const recent = history.filter((r) => (r.reviewedAt ?? r.createdAt) >= now - 7 * DAY && r.status !== 'cancelled');
    return { total: recent.length, approved: recent.filter((r) => r.status === 'approved').length, denied: recent.filter((r) => r.status === 'denied').length };
  }, [history, now]);
  const filteredHistory = historyFilter === 'all' ? history : history.filter((r) => r.status === historyFilter);
  const stale = !!summary.oldest && now - summary.oldest > DAY;

  const denyReq = deny.value ? requests.find((r) => r.id === deny.value) : undefined;

  useAdminChrome({
    toolbar: (
      <>
        <NeoTabs<View>
          label="Request views"
          value={view}
          onChange={setView}
          items={[
            { value: 'queue', label: 'Your queue', icon: <Inbox />, count: mine.length },
            { value: 'others', label: 'Other reviewers', icon: <Users />, count: others.length },
            { value: 'history', label: 'History', icon: <History />, count: history.length },
          ]}
        />
        <div className="grow" />
        <span className="adm-toolbar-hint">{view === 'history' ? 'Newest decisions first' : 'Oldest first · delegated approval'}</span>
      </>
    ),
    actions: canAudit ? (
      <Link to={adminHref('audit', { q: 'access.request' })} className="neo-btn neo-btn--soft">
        <ScrollText /> <span className="neo-btn__label">Decision trail</span>
      </Link>
    ) : undefined,
  });

  return (
    <div className="adm-view">
      <NeoKpis label="Review queue">
        <NeoKpi
          icon={<Inbox />}
          label="Waiting on you"
          value={mine.length}
          sub={mine.length ? 'Delegated to you as an app holder' : 'Inbox zero'}
          tone={mine.length ? 'warning' : undefined}
          onClick={() => setView('queue')}
        />
        <NeoKpi icon={<Users />} label="Other reviewers" value={others.length} sub="Read-only for you" onClick={() => setView('others')} />
        <NeoKpi icon={<ShieldAlert />} label="High risk" value={summary.high} sub="In your queue" tone={summary.high ? 'danger' : undefined} />
        <NeoKpi
          icon={<Clock />}
          label="Oldest in queue"
          value={summary.oldest ? relativeTime(summary.oldest, now).replace(' ago', '') : '—'}
          sub={summary.oldest ? (stale ? 'Over 24h — act soon' : 'Within a day') : 'Nothing waiting'}
          tone={stale ? 'warning' : undefined}
        />
        <NeoKpi
          icon={<History />}
          label="Decided · 7d"
          value={week.total}
          sub={`${week.approved} approved · ${week.denied} denied`}
          onClick={() => setView('history')}
        />
      </NeoKpis>

      {view === 'queue' &&
        (mine.length === 0 ? (
          <NeoPanel className="adm-inbox-zero">
            <NeoEmpty
              icon={<PartyPopper />}
              title="Inbox zero"
              action={
                <div className="adm-empty-actions">
                  {others.length > 0 && (
                    <button type="button" className="neo-btn neo-btn--soft" onClick={() => setView('others')}>
                      <Users /> View {pluralize(others.length, 'other pending request')}
                    </button>
                  )}
                  <button type="button" className="neo-btn neo-btn--ghost" onClick={() => setView('history')}>
                    <History /> Decision history
                  </button>
                </div>
              }
            >
              Nothing is waiting on you. New requests for apps you hold will land here — and in your notifications.
            </NeoEmpty>
          </NeoPanel>
        ) : (
          <div className="adm-req-list neo-stagger">
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
        ))}

      {view === 'others' &&
        (others.length === 0 ? (
          <NeoPanel>
            <NeoEmpty icon={<Users />} title="Nothing with other reviewers">
              Every pending request is either yours to decide or already handled.
            </NeoEmpty>
          </NeoPanel>
        ) : (
          <div className="adm-req-list neo-stagger">
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
        ))}

      {view === 'history' && (
        <NeoPanel
          hud="Decisions"
          title="Request history"
          icon={<History />}
          actions={
            <div className="adm-chips" role="group" aria-label="Filter history">
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
          }
          className="adm-hist-panel"
        >
          {filteredHistory.length === 0 ? (
            <NeoEmpty compact icon={<History />} title="No decisions yet">
              Approved, denied and cancelled requests will appear here.
            </NeoEmpty>
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
                <button type="button" className="neo-btn neo-btn--ghost neo-btn--block adm-more" onClick={() => setHistoryLimit((n) => n + HISTORY_PAGE)}>
                  Show more <span className="neo-faint">({filteredHistory.length - historyLimit} older)</span>
                </button>
              )}
            </>
          )}
        </NeoPanel>
      )}

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
      className={cx('neo-card adm-req', readOnly && 'is-readonly', `adm-req--${risk}`)}
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
            {requester && !requester.active && (
              <span className="neo-chip neo-chip--sm" data-tone="slate">
                Deactivated
              </span>
            )}
          </div>
          <div className="adm-req__sub truncate">{requester ? `${requester.title} · ${requester.department}` : request.userId}</div>
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
          <div className="adm-req__app-meta truncate">{app ? `${app.category} · owned by ${app.owner}` : request.appId}</div>
        </div>
        <div className="adm-req__dur">
          <span className="neo-hud">Requested</span>
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
          <span className="neo-hud">Grant for</span>
          <DurationPicker value={readOnly ? request.duration : duration} onChange={setDuration} requested={request.duration} label={`Grant duration for ${name}`} />
        </div>
        <div className="adm-req__actions">
          <button type="button" className="neo-btn neo-btn--danger" onClick={() => onDeny(request.id)} aria-label={`Deny ${name}’s request for ${appName}`}>
            <X aria-hidden="true" /> Deny
          </button>
          <button
            type="button"
            className="neo-btn neo-btn--success"
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
            <ArrowRight aria-hidden="true" className="neo-faint" />
            {app && <AppIcon app={app} size={20} />}
            <span className="truncate">{app?.name ?? r.appId}</span>
          </div>
          <div className="adm-hist__sub">
            Asked for {DURATION_LABEL[r.duration].toLowerCase()} ·{' '}
            <time dateTime={new Date(r.createdAt).toISOString()} title={formatDateTime(r.createdAt)}>
              {relativeTime(r.createdAt, now)}
            </time>
          </div>
        </div>
      </div>
      <div className="adm-hist__decision">
        <span className="neo-chip" data-tone={meta.tone}>
          <meta.Icon aria-hidden="true" />
          {meta.label}
        </span>
        {r.grantedDuration && (
          <span className="neo-chip" data-tone="blue">
            <Hourglass aria-hidden="true" />
            {DURATION_LABEL[r.grantedDuration]}
          </span>
        )}
      </div>
      <div className="adm-hist__by">
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
          <span className="neo-hud">Quick replies</span>
          <div className="row row--wrap adm-gap-6">
            {QUICK_NOTES.map((q) => (
              <button key={q} type="button" className="neo-suggest adm-quick-note" aria-pressed={note === q} onClick={() => setNote(q)}>
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
