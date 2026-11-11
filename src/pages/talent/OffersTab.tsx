/**
 * Offers — from approval to signature. KPI strip, "Needs your approval"
 * first, then drafts, awaiting approval, ready to send and sent offers, with
 * closed offers tucked away. Every action mirrors the store's separation-of-
 * duties and four-eyes rules (disabled with the reason when not allowed).
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  Ban,
  ChevronDown,
  CircleCheck,
  CircleX,
  FilePen,
  Hourglass,
  Lock,
  Maximize2,
  Percent,
  Send,
  ShieldCheck,
  Signature,
  SquareKanban,
  Timer,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import type { ApprovalStep, Candidate, Offer, Requisition } from '@/talent/types';
import { APPROVAL_STEP_LABEL } from '@/talent/constants';
import type { TalentViewer } from '@/talent/access';
import { useTalent } from '@/talent/store';
import { useTalentCaps, useTalentLookups, useTalentScope, useTalentViewer, type TalentCaps } from '@/talent/selectors';
import { useTalentUI } from '@/talent/ui';
import { useUserById } from '@/store/selectors';
import { toast } from '@/store/toast';
import { useNow } from '@/hooks/useNow';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { EmptyState } from '@/components/ui/primitives';
import { NeoKpi, NeoKpis } from '@/components/neo';
import { HeadActions } from './components/head';
import { CandidateAvatar, Comp, OfferStatusBadge, SampleTag } from './components/shared';
import { useNoteDialog, type NoteRequest } from './reqs/NoteDialog';
import { ApprovalBrief, BandGuardrail, ExpiryPill, OfferApprovalChain, OfferFigures, recordOfferResponse } from './reqs/offer';
import { DAY, firstYearTotal, viewerApproval } from './reqs/helpers';
import { OfferTracker } from './trackers';

type Ask = (r: NoteRequest) => void;

export function OffersTab() {
  const scope = useTalentScope();
  const offersAll = useTalent((s) => s.offers);
  const { candById, reqById } = useTalentLookups();
  const viewer = useTalentViewer();
  const caps = useTalentCaps();
  const now = useNow(60_000);
  const note = useNoteDialog();
  const [closedOpen, setClosedOpen] = useState(false);

  const offers = useMemo(() => offersAll.filter((o) => scope.reqIds.has(o.requisitionId)), [offersAll, scope.reqIds]);

  const groups = useMemo(() => {
    const g = { needs: [] as Offer[], drafts: [] as Offer[], pending: [] as Offer[], approved: [] as Offer[], sent: [] as Offer[], closed: [] as Offer[] };
    for (const o of offers) {
      if (o.status === 'pending-approval' && viewerApproval(viewer, o, reqById.get(o.requisitionId)).verdict.ok) g.needs.push(o);
      else if (o.status === 'draft') g.drafts.push(o);
      else if (o.status === 'pending-approval') g.pending.push(o);
      else if (o.status === 'approved') g.approved.push(o);
      else if (o.status === 'sent') g.sent.push(o);
      else g.closed.push(o);
    }
    g.needs.sort((a, b) => a.createdAt - b.createdAt);
    g.drafts.sort((a, b) => b.createdAt - a.createdAt);
    g.pending.sort((a, b) => a.createdAt - b.createdAt);
    g.approved.sort((a, b) => a.createdAt - b.createdAt);
    g.sent.sort((a, b) => a.expiresAt - b.expiresAt);
    g.closed.sort((a, b) => (b.respondedAt ?? b.createdAt) - (a.respondedAt ?? a.createdAt));
    return g;
  }, [offers, reqById, viewer]);

  const kpi = useMemo(() => {
    const accepted = offers.filter((o) => o.status === 'accepted');
    const declined = offers.filter((o) => o.status === 'declined').length;
    const decided = accepted.length + declined;
    const days = accepted.filter((o) => o.sentAt && o.respondedAt).map((o) => (o.respondedAt! - o.sentAt!) / DAY);
    return {
      out: offers.filter((o) => o.status === 'pending-approval' || o.status === 'approved' || o.status === 'sent').length,
      awaiting: offers.filter((o) => o.status === 'pending-approval').length,
      sent: offers.filter((o) => o.status === 'sent').length,
      rate: decided ? Math.round((accepted.length / decided) * 100) : null,
      accepted: accepted.length,
      declined,
      avgDays: days.length ? days.reduce((s, n) => s + n, 0) / days.length : null,
    };
  }, [offers]);

  const card = (o: Offer, i: number, highlight = false) => {
    const req = reqById.get(o.requisitionId);
    const cand = candById.get(o.candidateId);
    if (!cand) return null;
    return <OfferCard key={o.id} offer={o} req={req} cand={cand} viewer={viewer} caps={caps} now={now} ask={note.ask} highlight={highlight} style={{ '--i': i } as CSSProperties} />;
  };

  const closedCounts = {
    accepted: groups.closed.filter((o) => o.status === 'accepted').length,
    declined: groups.closed.filter((o) => o.status === 'declined').length,
    rescinded: groups.closed.filter((o) => o.status === 'rescinded').length,
  };

  return (
    <section className="tl-offer-page" aria-label="Offers">
      <HeadActions>
        <Link to="/talent/pipeline" className="neo-btn neo-btn--soft">
          <SquareKanban /> <span className="neo-btn__label">Pipeline</span>
        </Link>
      </HeadActions>

      <NeoKpis label="Offers at a glance">
        <NeoKpi icon={<Signature />} label="Offers out" value={kpi.out} sub={`${kpi.sent} with candidates`} />
        <NeoKpi
          icon={<Hourglass />}
          label="Awaiting approval"
          value={kpi.awaiting}
          sub={groups.needs.length ? `${groups.needs.length} need your sign-off` : 'HM → People Ops'}
          tone={groups.needs.length ? 'warning' : undefined}
        />
        <NeoKpi icon={<Percent />} label="Acceptance rate" value={kpi.rate !== null ? `${kpi.rate}%` : '—'} sub={`${kpi.accepted} accepted · ${kpi.declined} declined`} tone="success" />
        <NeoKpi icon={<Timer />} label="Avg days to accept" value={kpi.avgDays !== null ? `${kpi.avgDays.toFixed(1)}d` : '—'} sub="Sent → signed" />
      </NeoKpis>

      {offers.length === 0 ? (
        <div className="card card--flat">
          <EmptyState icon={<Signature />} title="No offers yet">
            Offers appear here once the hiring manager records a hire decision and a recruiter drafts the package.
          </EmptyState>
        </div>
      ) : (
        <>
          {groups.needs.length > 0 && (
            <section className="tl-offer-needs" aria-labelledby="tl-offer-needs-h">
              <div className="tl-offer-needs__head">
                <span className="tl-offer-needs__icon" aria-hidden="true">
                  <ShieldCheck />
                </span>
                <div className="grow">
                  <h3 id="tl-offer-needs-h">
                    Needs your approval <span className="tl-offer-col__count">{groups.needs.length}</span>
                  </h3>
                  <p className="muted text-sm">You’re an eligible approver: you didn’t draft these and haven’t signed the other step.</p>
                </div>
              </div>
              <div className="tl-offer-needs__grid">{groups.needs.map((o, i) => card(o, i, true))}</div>
            </section>
          )}

          <div className={cx('tl-offer-board', groups.drafts.length > 0 && 'has-drafts')}>
            {groups.drafts.length > 0 && <Column title="Drafts" icon={FilePen} hint="Not routed yet" offers={groups.drafts} render={card} empty="" />}
            <Column title="Awaiting approval" icon={Hourglass} hint="HM → People Ops" offers={groups.pending} render={card} empty={groups.needs.length ? 'Only the ones above need you.' : 'Nothing waiting on approvers.'} />
            <Column title="Ready to send" icon={Send} hint="Both approvals in" offers={groups.approved} render={card} empty="Approved offers land here." />
            <Column title="Sent · awaiting signature" icon={Signature} hint="With the candidate" offers={groups.sent} render={card} empty="Nothing out with candidates." />
          </div>

          {groups.closed.length > 0 && (
            <section className={cx('tl-offer-closed', closedOpen && 'is-open')}>
              <button type="button" className="tl-offer-closed__toggle" aria-expanded={closedOpen} aria-controls="tl-offer-closed-list" onClick={() => setClosedOpen((v) => !v)}>
                <span className="tl-offer-closed__title">Closed</span>
                <span className="tl-offer-col__count">{groups.closed.length}</span>
                <span className="tl-offer-closed__sum">
                  {closedCounts.accepted} accepted · {closedCounts.declined} declined · {closedCounts.rescinded} rescinded
                </span>
                <span className="spacer" />
                <ChevronDown className="tl-offer-closed__chev" aria-hidden="true" />
              </button>
              {closedOpen && (
                <ul id="tl-offer-closed-list" className="tl-offer-closed__list">
                  {groups.closed.map((o) => {
                    const cand = candById.get(o.candidateId);
                    if (!cand) return null;
                    return <ClosedRow key={o.id} offer={o} cand={cand} req={reqById.get(o.requisitionId)} now={now} />;
                  })}
                </ul>
              )}
            </section>
          )}
        </>
      )}
      {note.dialog}
    </section>
  );
}

function Column({ title, icon: Icon, hint, offers, render, empty }: { title: string; icon: LucideIcon; hint: string; offers: Offer[]; render: (o: Offer, i: number) => ReactNode; empty: string }) {
  const id = `tl-offer-col-${title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <section className="tl-offer-col" aria-labelledby={id}>
      <header className="tl-offer-col__head">
        <Icon aria-hidden="true" />
        <h3 id={id}>{title}</h3>
        <span className="tl-offer-col__count">{offers.length}</span>
        <span className="tl-offer-col__hint">{hint}</span>
      </header>
      <div className="tl-offer-col__body">{offers.length ? offers.map((o, i) => render(o, i)) : <p className="tl-offer-col__empty">{empty}</p>}</div>
    </section>
  );
}

// ───────────────────────── card ─────────────────────────
function OfferCard({
  offer,
  req,
  cand,
  viewer,
  caps,
  now,
  ask,
  highlight,
  style,
}: {
  offer: Offer;
  req: Requisition | undefined;
  cand: Candidate;
  viewer: TalentViewer | null;
  caps: TalentCaps;
  now: number;
  ask: Ask;
  highlight: boolean;
  style?: CSSProperties;
}) {
  const drafter = useUserById(offer.createdBy);
  const store = useTalent.getState;
  const ui = useTalentUI.getState;
  const approval = viewerApproval(viewer, offer, req);
  const subtitle = `${cand.name} · ${offer.title}`;
  const open = () => ui().openModal({ kind: 'offer', applicationId: offer.applicationId, offerId: offer.id });
  const returned = offer.status === 'draft' ? offer.approvals.find((a) => a.decision === 'rejected') : undefined;

  const approve = (step: ApprovalStep) =>
    ask({
      title: `Approve · ${APPROVAL_STEP_LABEL[step]} sign-off`,
      subtitle,
      icon: <CircleCheck />,
      tone: 'success',
      confirmLabel: 'Approve offer',
      label: 'Approval note',
      placeholder: 'e.g. Within band and consistent with the team.',
      body: <ApprovalBrief offer={offer} req={req} cand={cand} now={now} />,
      onConfirm: (text) => toast.result(store().decideOffer(offer.id, step, 'approved', text || undefined)),
    });
  const reject = (step: ApprovalStep) =>
    ask({
      title: 'Return the offer to the recruiter',
      subtitle,
      icon: <Undo2 />,
      tone: 'danger',
      confirmLabel: 'Return offer',
      label: 'What needs to change?',
      minLength: 5,
      placeholder: 'e.g. Base is above band: justify or bring it to the midpoint.',
      body: <p className="muted text-sm">The offer goes back to draft and the recruiter is notified with your note.</p>,
      onConfirm: (text) => toast.result(store().decideOffer(offer.id, step, 'rejected', text)),
    });
  const rescind = () =>
    ask({
      title: 'Rescind offer',
      subtitle,
      icon: <Ban />,
      tone: 'danger',
      confirmLabel: 'Rescind offer',
      label: 'Reason',
      minLength: 5,
      placeholder: 'e.g. Role re-scoped after the re-org.',
      body: <p className="tl-req-warn">This withdraws the offer and is written to the audit trail. The candidate stays in the pipeline.</p>,
      onConfirm: (text) => toast.result(store().rescindOffer(offer.id, text)),
    });
  const accept = () =>
    ask({
      title: `${cand.name.split(' ')[0]} accepted?`,
      subtitle,
      icon: <CircleCheck />,
      tone: 'success',
      confirmLabel: 'Record acceptance',
      label: 'Note',
      placeholder: 'e.g. Signed via DocuSign this morning.',
      body: <p className="muted text-sm">Marks them hired, fills a seat on {req?.title ?? 'the requisition'} and hands onboarding to the HR Portal.</p>,
      onConfirm: (text) => recordOfferResponse(offer, 'accepted', text || undefined),
    });
  const decline = () =>
    ask({
      title: 'Record a decline',
      subtitle,
      icon: <CircleX />,
      tone: 'danger',
      confirmLabel: 'Record decline',
      label: 'Why did they decline?',
      placeholder: 'e.g. Accepted a counter-offer.',
      onConfirm: (text) => recordOfferResponse(offer, 'declined', text || undefined),
    });

  const actions: ReactNode[] = [];
  if (offer.status === 'draft' && caps.manage)
    actions.push(
      <button key="submit" type="button" className="btn btn--sm btn--primary" onClick={() => toast.result(store().submitOffer(offer.id))}>
        <Send /> Submit for approval
      </button>,
    );
  if (offer.status === 'pending-approval') {
    if (approval.verdict.ok && approval.step) {
      const step = approval.step;
      actions.push(
        <button key="approve" type="button" className="btn btn--sm btn--success" onClick={() => approve(step)}>
          <CircleCheck /> Approve
        </button>,
        <button key="reject" type="button" className="btn btn--sm btn--ghost tl-req-danger" onClick={() => reject(step)}>
          <Undo2 /> Return
        </button>,
      );
    } else
      actions.push(
        <span key="approve" className="tl-req-tip" data-tip={approval.verdict.reason}>
          <button type="button" className="btn btn--sm" disabled>
            <CircleCheck /> Approve
          </button>
        </span>,
      );
  }
  if (offer.status === 'approved' && caps.manage)
    actions.push(
      <button key="send" type="button" className="btn btn--sm btn--primary" onClick={() => toast.result(store().sendOffer(offer.id))}>
        <Send /> Send offer
      </button>,
    );
  if (offer.status === 'sent' && caps.manage)
    actions.push(
      <button key="acc" type="button" className="btn btn--sm btn--success" onClick={accept}>
        <CircleCheck /> Accepted
      </button>,
      <button key="dec" type="button" className="btn btn--sm btn--ghost" onClick={decline}>
        <CircleX /> Declined
      </button>,
    );

  const canRescind = caps.manage && (offer.status === 'draft' || offer.status === 'pending-approval' || offer.status === 'approved' || offer.status === 'sent');
  const expectation = annualExpectation(cand);

  const body = (
    <>
      <header className="tl-offer-card__head">
        <CandidateAvatar person={cand} size={40} />
        <div className="grow">
          <div className="tl-offer-card__name">
            <button type="button" onClick={() => ui().openCandidate(cand.id)}>
              {cand.name}
            </button>
            {cand.sample && <SampleTag />}
          </div>
          <div className="tl-offer-card__role truncate">
            {req ? <Link to={`/talent/requisitions/${req.id}`}>{offer.title}</Link> : offer.title}
          </div>
        </div>
        <span className="tl-offer-card__tools">
          <button type="button" className="icon-btn icon-btn--sm" onClick={open} aria-label={`Open the offer for ${cand.name}`} data-tip="Open offer">
            <Maximize2 />
          </button>
          {canRescind && (
            <button type="button" className="icon-btn icon-btn--sm tl-req-danger" onClick={rescind} aria-label={`Rescind the offer for ${cand.name}`} data-tip="Rescind">
              <Ban />
            </button>
          )}
        </span>
      </header>
      <OfferTracker offer={offer} req={req} candName={cand.name} now={now} compact className="tl-offer-card__track" />
      <div className="tl-offer-card__meta">
        <ExpiryPill offer={offer} now={now} />
        <span className="faint text-xs">
          Drafted by {drafter?.name.split(' ')[0] ?? 'a recruiter'} · {relativeTime(offer.createdAt, now)}
        </span>
      </div>
      <OfferFigures offer={offer} compact />
      <OfferApprovalChain offer={offer} req={req} now={now} hints={offer.status === 'pending-approval' && !highlight} />
      {returned?.note && (
        <p className="tl-offer-card__returned">
          <Undo2 aria-hidden="true" /> Returned: “{returned.note}”
        </p>
      )}
      {offer.note && !returned && <p className="tl-offer-card__note">“{offer.note}”</p>}
      {offer.status === 'pending-approval' && !approval.verdict.ok && approval.verdict.reason && (
        <p className="tl-offer-card__why">
          <Lock aria-hidden="true" /> {approval.verdict.reason}
        </p>
      )}
    </>
  );

  return (
    <article className={cx('tl-offer-card', `tl-offer-card--${offer.status}`, highlight && 'is-mine')} style={style}>
      {highlight ? (
        <div className="tl-offer-card__split">
          <div className="tl-offer-card__main">{body}</div>
          <aside className="tl-offer-card__side" aria-label="Approval brief">
            <ApprovalBrief offer={offer} req={req} cand={cand} now={now} />
            <BandGuardrail band={req?.salary ?? null} expectation={expectation} amount={offer.baseSalary} currency={offer.currency} />
          </aside>
        </div>
      ) : (
        body
      )}
      {actions.length > 0 && <footer className="tl-offer-card__actions">{actions}</footer>}
    </article>
  );
}

function annualExpectation(cand: Candidate) {
  const e = cand.salaryExpectation;
  return e ? { amount: e.amount * (e.period === 'month' ? 12 : 1), currency: e.currency } : null;
}

function ClosedRow({ offer, cand, req, now }: { offer: Offer; cand: Candidate; req: Requisition | undefined; now: number }) {
  return (
    <li className={cx('tl-offer-closed__row', `is-${offer.status}`)}>
      <CandidateAvatar person={cand} size={32} />
      <div className="grow">
        <div className="tl-offer-closed__name">
          {cand.name} {cand.sample && <SampleTag />}
        </div>
        <div className="faint text-xs truncate">
          {req ? <Link to={`/talent/requisitions/${req.id}`}>{offer.title}</Link> : offer.title} · <span className="mono">{offer.band}</span>
        </div>
      </div>
      <OfferStatusBadge status={offer.status} />
      <span className="tl-offer-closed__when">
        <ExpiryPill offer={offer} now={now} />
      </span>
      <span className="tl-offer-closed__total">
        <Comp amount={firstYearTotal(offer)} currency={offer.currency} compact />
      </span>
      <button type="button" className="btn btn--sm btn--ghost" onClick={() => useTalentUI.getState().openModal({ kind: 'offer', applicationId: offer.applicationId, offerId: offer.id })}>
        Open
      </button>
    </li>
  );
}
