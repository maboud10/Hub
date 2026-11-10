/**
 * Requests — my requests with live approval steppers, manager/IT/Security
 * approvals (`?tab=approvals`) and IT fulfilment (`?tab=fulfil`).
 * `?r=REQ-…` deep links highlight a request.
 */
import { useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Inbox, PackageOpen, Plus, Stamp, Truck } from 'lucide-react';
import { NeoEmpty, NeoHead, NeoStage, NeoTabs } from '@/components/neo';
import { formatDate, relativeTime } from '@/lib/format';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { useHub } from '@/store/hub';
import { useHelpdesk } from '@/helpdesk/store';
import type { CatalogItem, CatalogRequest, RequestStatus } from '@/helpdesk/types';
import { fulfilmentQueue, requestsAwaiting, waitingOn } from '@/helpdesk/queries';
import { ApprovalStepper, ItemVisual, priceLabel } from './catalogParts';
import { ApprovalCard, FulfilCard, OptionChips } from './requestCards';
import { Person, plural, useViewer } from './ui';

type Tab = 'mine' | 'approvals' | 'fulfil';
const STATUS_TEXT: Record<RequestStatus, string> = { pending: 'In approval', approved: 'Approved · with IT', fulfilled: 'Delivered', denied: 'Declined', cancelled: 'Cancelled' };

export function RequestsView() {
  const viewer = useViewer();
  const requests = useHelpdesk((s) => s.requests);
  const catalog = useHelpdesk((s) => s.catalog);
  const users = useHub((s) => s.users);
  const [sp, setSp] = useSearchParams();
  const highlight = sp.get('r');
  const me = viewer?.user.id ?? '';

  const mine = useMemo(() => requests.filter((r) => r.requesterId === me).sort((a, b) => Number(isLive(b)) - Number(isLive(a)) || b.updatedAt - a.updatedAt), [requests, me]);
  const awaiting = useMemo(() => (viewer ? requestsAwaiting(viewer, requests) : []), [viewer, requests]);
  const decided = useMemo(() => requests.filter((r) => r.steps.some((s) => s.decidedBy === me) && !awaiting.includes(r)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8), [requests, me, awaiting]);
  const fulfil = useMemo(() => (viewer?.it ? fulfilmentQueue(requests) : []), [viewer, requests]);
  const approver = awaiting.length > 0 || decided.length > 0 || users.some((u) => u.managerId === me) || !!viewer?.it || !!viewer?.security;

  const asked = sp.get('tab') as Tab | null;
  const tab: Tab = asked === 'approvals' && approver ? 'approvals' : asked === 'fulfil' && viewer?.it ? 'fulfil' : 'mine';
  const setTab = (v: Tab) => {
    const next = new URLSearchParams(sp);
    if (v === 'mine') next.delete('tab');
    else next.set('tab', v);
    next.delete('r');
    setSp(next, { replace: true });
  };

  useEffect(() => {
    if (!highlight) return;
    const t = window.setTimeout(() => document.getElementById(`req-${highlight}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250);
    return () => window.clearTimeout(t);
  }, [highlight, tab]);

  if (!viewer) return null;
  const itemOf = (r: CatalogRequest) => catalog.find((c) => c.id === r.itemId);
  const live = mine.filter(isLive).length;

  return (
    <NeoStage label="Requests">
      <NeoHead
        icon={<PackageOpen />}
        eyebrow="Catalog"
        title="Requests"
        sub={[live ? `${plural(live, 'request')} in flight` : 'Nothing in flight', awaiting.length ? `${awaiting.length} waiting on you` : ''].filter(Boolean).join(' · ')}
        actions={
          <Link to="/helpdesk/catalog" className="neo-btn neo-btn--plasma" data-qa="requests-new">
            <Plus /> <span className="neo-btn__label">New request</span>
          </Link>
        }
      />
      <div className="neo-toolbar hd-toolbar">
        <NeoTabs<Tab>
          label="Request views"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'mine', label: 'My requests', count: live || null },
            ...(approver ? [{ value: 'approvals' as Tab, label: 'Approvals', icon: <Stamp />, count: awaiting.length || null }] : []),
            ...(viewer.it ? [{ value: 'fulfil' as Tab, label: 'Fulfilment', icon: <Truck />, count: fulfil.length || null }] : []),
          ]}
        />
      </div>
      <div className="neo-body neo-pad">
        {tab === 'mine' &&
          (mine.length === 0 ? (
            <NeoEmpty icon={<PackageOpen />} title="No requests yet" action={<Link to="/helpdesk/catalog" className="neo-btn neo-btn--plasma">Browse the catalog</Link>}>
              Laptops, licences and access requests show up here with every approval step.
            </NeoEmpty>
          ) : (
            <div className="hd-reqlist neo-stagger">
              {mine.map((r, i) => {
                const item = itemOf(r);
                return item ? <MyRequest key={r.id} r={r} item={item} i={i} highlight={r.id === highlight} waiting={waitingOn(r, users)} /> : null;
              })}
            </div>
          ))}
        {tab === 'approvals' && (
          <>
            {awaiting.length === 0 ? (
              <NeoEmpty compact icon={<Inbox />} title="You’re all caught up">
                New requests from your team land here — you’ll also get a bell notification.
              </NeoEmpty>
            ) : (
              <div className="hd-reqgrid neo-stagger">
                {awaiting.map((r) => {
                  const item = itemOf(r);
                  return item ? <ApprovalCard key={r.id} r={r} item={item} /> : null;
                })}
              </div>
            )}
            {decided.length > 0 && (
              <section className="hd-decided">
                <div className="neo-section-head">
                  <span className="neo-hud">Recently decided by you</span>
                </div>
                {decided.map((r) => {
                  const item = itemOf(r);
                  const mineStep = r.steps.find((s) => s.decidedBy === me);
                  return (
                    <div key={r.id} className="hd-decided__row">
                      <Person userId={r.requesterId} size={26} sub={item?.name} />
                      <span className="hd-reqstatus" data-s={mineStep?.state === 'denied' ? 'denied' : 'approved'}>
                        {mineStep?.state === 'denied' ? 'Declined' : 'Approved'}
                      </span>
                      <span className="neo-faint text-sm">{mineStep?.decidedAt ? relativeTime(mineStep.decidedAt) : ''}</span>
                    </div>
                  );
                })}
              </section>
            )}
          </>
        )}
        {tab === 'fulfil' &&
          (fulfil.length === 0 ? (
            <NeoEmpty compact icon={<Truck />} title="Nothing to fulfil">
              Approved requests queue here for hand-over.
            </NeoEmpty>
          ) : (
            <div className="hd-reqgrid neo-stagger">
              {fulfil.map((r) => {
                const item = itemOf(r);
                return item ? <FulfilCard key={r.id} r={r} item={item} /> : null;
              })}
            </div>
          ))}
      </div>
    </NeoStage>
  );
}

const isLive = (r: CatalogRequest) => r.status === 'pending' || r.status === 'approved';

function MyRequest({ r, item, i, highlight, waiting }: { r: CatalogRequest; item: CatalogItem; i: number; highlight: boolean; waiting: string }) {
  const denied = r.steps.find((s) => s.state === 'denied');
  const cancel = () => {
    const res = useHelpdesk.getState().cancelRequest(r.id);
    if (res.ok) toast.info(`${r.id} cancelled`);
    else toast.error(res.error);
  };
  return (
    <article className={cx('hd-req', highlight && 'is-highlight')} id={`req-${r.id}`} style={{ ['--i' as string]: i, ['--accent' as string]: item.accent }} data-status={r.status} data-qa={`req-${r.id}`}>
      <header className="hd-req__head">
        <div className="hd-req__ask">
          <ItemVisual item={item} size={item.kind === 'hardware' ? 40 : 38} />
          <div className="hd-req__asktext">
            <b>{item.name}</b>
            <span>
              <span className="neo-mono">{r.id}</span> · {priceLabel(item)} · requested {formatDate(r.createdAt)}
            </span>
          </div>
        </div>
        <span className="hd-reqstatus" data-s={r.status}>
          {STATUS_TEXT[r.status]}
        </span>
      </header>
      <ApprovalStepper steps={r.steps} status={r.status} createdAt={r.createdAt} fulfilledAt={r.fulfilment?.at} />
      <footer className="hd-req__foot">
        <div className="hd-req__info">
          <OptionChips r={r} />
          {r.status === 'pending' && waiting && <span className="hd-req__wait">Waiting on {waiting}</span>}
          {denied?.note && <span className="hd-req__note">“{denied.note}”</span>}
          {r.fulfilment && (
            <span className="hd-req__done">
              {r.fulfilment.deviceTag ? (
                <>
                  <Link to={`/helpdesk/devices/${r.fulfilment.deviceTag}`} className="neo-tint neo-mono">
                    {r.fulfilment.deviceTag}
                  </Link>{' '}
                  is yours
                </>
              ) : (
                'Access is live'
              )}
              {r.fulfilment.note ? ` — ${r.fulfilment.note}` : ''}
            </span>
          )}
        </div>
        {r.status === 'pending' && (
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={cancel}>
            Cancel request
          </button>
        )}
      </footer>
    </article>
  );
}
