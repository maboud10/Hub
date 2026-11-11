/**
 * Catalog — hardware, software and access with live eligibility (role,
 * department, contractor status, existing devices), approval-chain preview
 * and a request sheet that submits straight into the approval workflow.
 */
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Info, PackageOpen, ShoppingBag, Sparkles, Stamp } from 'lucide-react';
import { NeoEmpty, NeoHead, NeoSearch, NeoStage, NeoTabs } from '@/components/neo';
import { Sheet } from '@/components/ui/Sheet';
import { cx } from '@/lib/cx';
import { toast } from '@/store/toast';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useHub } from '@/store/hub';
import { useHelpdesk } from '@/helpdesk/store';
import type { CatalogItem, CatalogKind, CatalogRequest } from '@/helpdesk/types';
import { approvalChain, checkEligibility, type Eligibility } from '@/helpdesk/eligibility';
import { requestsAwaiting, waitingOn } from '@/helpdesk/queries';
import { CATALOG_KIND_LABEL, officeOf } from '@/helpdesk/meta';
import { EligibilityBadge, etaLabel, ItemVisual, priceLabel } from './catalogParts';
import { RequestTracker } from './trackers';
import { Kbd, useViewer } from './ui';

type Tab = 'all' | CatalogKind;
const KINDS: CatalogKind[] = ['hardware', 'software', 'access'];

export function CatalogView() {
  const viewer = useViewer();
  const catalog = useHelpdesk((s) => s.catalog);
  const devices = useHelpdesk((s) => s.devices);
  const requests = useHelpdesk((s) => s.requests);
  const [sp, setSp] = useSearchParams();
  const tab = (KINDS as string[]).includes(sp.get('kind') ?? '') ? (sp.get('kind') as CatalogKind) : 'all';
  const itemId = sp.get('item');
  const [q, setQ] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const me = viewer?.user.id ?? '';
  useHotkeys({
    s: (e) => {
      e.preventDefault();
      search.current?.focus();
    },
  });

  const elig = useMemo(() => {
    const m = new Map<string, Eligibility>();
    if (!viewer) return m;
    const now = Date.now();
    for (const it of catalog) m.set(it.id, checkEligibility(it, { user: viewer.user, devices, requests, now }));
    return m;
  }, [catalog, devices, requests, viewer]);
  const inflight = requests.filter((r) => r.requesterId === me && (r.status === 'pending' || r.status === 'approved')).length;
  const approvals = viewer ? requestsAwaiting(viewer, requests).length : 0;

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return catalog
      .filter((i) => tab === 'all' || i.kind === tab)
      .filter((i) => !term || `${i.name} ${i.vendor} ${i.blurb} ${i.kind}`.toLowerCase().includes(term))
      .sort((a, b) => rank(elig.get(a.id)) - rank(elig.get(b.id)) || Number(!!b.popular) - Number(!!a.popular));
  }, [catalog, tab, q, elig]);
  const groups = tab === 'all' ? KINDS.map((k) => ({ k, items: list.filter((i) => i.kind === k) })).filter((g) => g.items.length) : [{ k: tab, items: list }];

  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(sp);
    if (v === null) next.delete(k);
    else next.set(k, v);
    setSp(next, { replace: k === 'kind' });
  };
  const open = itemId ? catalog.find((c) => c.id === itemId) : undefined;

  if (!viewer) return null;
  return (
    <NeoStage label="Catalog">
      <NeoHead
        icon={<ShoppingBag />}
        eyebrow="Catalog"
        title="Get what you need"
        sub="Hardware, software and access — approvals route themselves"
        actions={
          <>
            {approvals > 0 && (
              <Link to="/helpdesk/requests?tab=approvals" className="neo-btn neo-btn--plasma" data-qa="catalog-approvals">
                <Stamp /> <span className="neo-btn__label">Approvals</span> <span className="neo-count">{approvals}</span>
              </Link>
            )}
            <Link to="/helpdesk/requests" className="neo-btn neo-btn--soft" data-qa="catalog-myreq">
              <PackageOpen /> <span className="neo-btn__label">My requests</span>
              {inflight > 0 && <span className="neo-count neo-count--app">{inflight}</span>}
            </Link>
          </>
        }
      />
      <div className="neo-toolbar hd-toolbar">
        <NeoTabs<Tab>
          label="Catalog sections"
          value={tab}
          onChange={(v) => set('kind', v === 'all' ? null : v)}
          items={[{ value: 'all', label: 'All', count: catalog.length }, ...KINDS.map((k) => ({ value: k as Tab, label: CATALOG_KIND_LABEL[k], count: catalog.filter((c) => c.kind === k).length }))]}
        />
        <div className="grow" />
        <NeoSearch value={q} onChange={setQ} placeholder="Search the catalog" kbd="S" inputRef={search} size="sm" className="hd-toolbar__search" />
      </div>
      <div className="neo-body neo-pad">
        {list.length === 0 ? (
          <NeoEmpty icon={<ShoppingBag />} title="Nothing matches" action={<button type="button" className="neo-btn neo-btn--soft" onClick={() => setQ('')}>Clear search</button>}>
            Can’t find it? Raise a ticket and IT will source it for you.
          </NeoEmpty>
        ) : (
          groups.map((g) => (
            <section key={g.k} className="hd-catsec">
              {tab === 'all' && (
                <div className="neo-section-head">
                  <span className="neo-hud">{CATALOG_KIND_LABEL[g.k as CatalogKind]}</span>
                </div>
              )}
              <div className="hd-catgrid neo-stagger">
                {g.items.map((it, i) => (
                  <ItemCard key={it.id} item={it} e={elig.get(it.id)!} i={i} onOpen={() => set('item', it.id)} />
                ))}
              </div>
            </section>
          ))
        )}
        <div className="hd-listfoot">
          <Kbd>S</Kbd> search · eligibility is checked live against your role, team and devices
        </div>
      </div>
      {open && <RequestSheet key={open.id} item={open} e={elig.get(open.id)!} onClose={() => set('item', null)} />}
    </NeoStage>
  );
}

const rank = (e?: Eligibility) => (e?.status === 'ineligible' ? 2 : e?.status === 'conditional' ? 1 : 0);

function ItemCard({ item, e, i, onOpen }: { item: CatalogItem; e: Eligibility; i: number; onOpen: () => void }) {
  return (
    <button type="button" className={cx('hd-item neo-spot', e.status === 'ineligible' && 'is-dim')} style={{ ['--i' as string]: i, ['--accent' as string]: item.accent }} onClick={onOpen} data-qa={`item-${item.id}`}>
      <span className="hd-item__top">
        <ItemVisual item={item} size={item.kind === 'hardware' ? 54 : 46} />
        <EligibilityBadge e={e} item={item} />
      </span>
      <span className="hd-item__name">
        {item.name}
        {item.popular && <span className="hd-item__pop">Popular</span>}
      </span>
      <span className="hd-item__vendor">{item.vendor}</span>
      <span className="hd-item__blurb">{item.blurb}</span>
      <span className="hd-item__foot">
        <b>{priceLabel(item)}</b>
        <span>{etaLabel(item)}</span>
      </span>
    </button>
  );
}

function RequestSheet({ item, e, onClose }: { item: CatalogItem; e: Eligibility; onClose: () => void }) {
  const viewer = useViewer()!;
  const users = useHub((s) => s.users);
  const navigate = useNavigate();
  const [options, setOptions] = useState<Record<string, string>>(() => Object.fromEntries((item.options ?? []).map((o) => [o.id, o.choices[0]])));
  const [why, setWhy] = useState('');
  const [error, setError] = useState('');
  const route = useMemo<CatalogRequest>(
    () => ({ id: 'preview', itemId: item.id, requesterId: viewer.user.id, options: {}, justification: '', status: 'pending', steps: approvalChain(item, viewer.user), createdAt: 0, updatedAt: 0 }),
    [item, viewer.user],
  );
  const blocked = e.status === 'ineligible';

  const submit = () => {
    const r = useHelpdesk.getState().submitRequest(item.id, { options, justification: why });
    if (!r.ok) return setError(r.error);
    const next = waitingOn(r.request, users);
    toast.success(`${r.request.id} submitted`, next ? `Waiting on ${next}` : 'IT will pick it up shortly.');
    navigate(`/helpdesk/requests?r=${r.request.id}`);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={item.name}
      width={500}
      className="neo-portal hd-reqsheet"
      label={`Request ${item.name}`}
      footer={
        <div className="hd-reqsheet__foot">
          <span className="hd-reqsheet__price">
            <b>{priceLabel(item)}</b> · {etaLabel(item)}
          </span>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={submit} disabled={blocked} data-qa="request-submit">
            {blocked ? 'Not available' : item.kind === 'access' ? 'Request access' : 'Submit request'}
          </button>
        </div>
      }
    >
      <div className="hd-reqsheet__body">
        <div className="hd-reqsheet__hero" style={{ ['--accent' as string]: item.accent }}>
          <ItemVisual item={item} size={item.kind === 'hardware' ? 76 : 60} />
          <div>
            <div className="neo-hud">{item.vendor}</div>
            <p>{item.description}</p>
          </div>
        </div>
        {blocked ? (
          <div className="hd-warnnote">
            {e.reasons.map((r) => (
              <div key={r}>{r}</div>
            ))}
          </div>
        ) : (
          <>
            {(item.options ?? []).map((o) => (
              <div key={o.id} className="neo-field">
                <span className="neo-label">{o.label}</span>
                <div className="hd-choicerow" role="radiogroup" aria-label={o.label}>
                  {o.choices.map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={options[o.id] === c} className="hd-choice" onClick={() => setOptions((x) => ({ ...x, [o.id]: c }))}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="neo-field">
              <span className="neo-label">Approval route</span>
              <RequestTracker r={route} item={item} preview bare />
            </div>
            {e.reasons.length > 0 && (
              <ul className="hd-reasons">
                {e.reasons.map((r) => (
                  <li key={r}>
                    <Info /> {r}
                  </li>
                ))}
              </ul>
            )}
            <label className="neo-field">
              <span className="neo-label">{e.needsJustification ? 'Why do you need it?' : 'Note for approvers (optional)'}</span>
              <textarea className="neo-textarea" rows={3} value={why} onChange={(ev) => setWhy(ev.target.value)} placeholder={item.kind === 'access' ? 'Which project or task needs this access?' : 'What will you use it for?'} data-qa="request-why" />
              {e.needsJustification && <span className="neo-hint">{why.trim().length < 10 ? `${10 - why.trim().length} more characters` : 'Thanks — approvers see this first.'}</span>}
            </label>
            {item.kind === 'hardware' && <StockHint item={item} />}
          </>
        )}
        {error && (
          <p className="hd-formerr" role="alert">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

/** Live stock check for hardware: matching shelf devices in the requester's office. */
function StockHint({ item }: { item: CatalogItem }) {
  const viewer = useViewer()!;
  const devices = useHelpdesk((s) => s.devices);
  const office = officeOf(viewer.user.location);
  const stock = devices.filter((d) => d.status === 'in_stock' && d.kind === item.deviceKind && (!item.stockModel || d.model.startsWith(item.stockModel)));
  const here = stock.filter((d) => d.office === office).length;
  const elsewhere = [...new Set(stock.filter((d) => d.office !== office).map((d) => d.office))];
  return (
    <p className="hd-reqsheet__nova">
      <Sparkles />
      {here > 0
        ? `${here} on the shelf in ${office === 'Remote' ? 'the remote depot' : office} — IT can usually hand it over the day it’s approved.`
        : stock.length > 0
          ? `None in ${office === 'Remote' ? 'the remote depot' : office} right now; ${stock.length} in ${elsewhere.slice(0, 2).join(' and ')}. Expect about ${etaLabel(item).toLowerCase()}.`
          : `Ordered on approval from the vendor — about ${etaLabel(item).toLowerCase()} after sign-off.`}
    </p>
  );
}
