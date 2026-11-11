/**
 * Helix Mail — Approvals stream: approval emails rendered as rich cards with the
 * underlying journey (compact NeoTracker) and inline Approve / Reject / Ask.
 * Live items come from Procurement, HR Portal, Travel & Expenses and Talent Hub
 * and are decided through each app's real action; press-and-hold batch-approves.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { BadgeCheck, Briefcase, CheckCheck, CircleHelp, ExternalLink, Plane, Receipt, RefreshCw, ShoppingCart, Square, SquareCheckBig, Sun, UserPlus, Wallet, X, Zap } from 'lucide-react';
import { Chip, NeoBanner, NeoEmpty, NeoTracker, type Tone } from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { AR_PERSON_NAMES } from '@/lib/i18n';
import { toast } from '@/store/toast';
import { decideApproval, syncLiveApprovals } from '@/mail/approvals';
import type { ApprovalsView } from '@/mail/engine';
import { useMail } from '@/mail/store';
import type { ApprovalItem, ApprovalSource } from '@/mail/types';
import { ContactAvatar, HoldButton, firstOf, useFmt, useMailCtx } from './parts';
import { openComposer } from './ui';

const SOURCE_ICON: Record<ApprovalSource, ReactNode> = {
  procurement: <ShoppingCart />,
  leave: <Sun />,
  claim: <Wallet />,
  expense: <Receipt />,
  travel: <Plane />,
  requisition: <UserPlus />,
};

const RELATION: Record<ApprovalItem['relation'], { label: string; tone: Tone }> = {
  direct: { label: 'Your direct report', tone: 'violet' },
  queue: { label: 'Your approval queue', tone: 'cyan' },
  reviewer: { label: 'Your review stage', tone: 'amber' },
};

export function ApprovalsDeck({ view }: { view: ApprovalsView }) {
  const ctx = useMailCtx();
  const fmt = useFmt();
  const navigate = useNavigate();
  const now = useNow(60_000);
  const recordDecision = useMail((s) => s.recordDecision);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const viewer = ctx.viewer;
  const users = ctx.users;
  const sync = useCallback(async () => {
    if (!viewer) return;
    setLoading(true);
    try {
      const res = await syncLiveApprovals(viewer, users);
      setErrors(res.errors);
    } finally {
      setLoading(false);
    }
  }, [viewer, users]);

  useEffect(() => {
    void sync();
  }, [sync]);

  const decide = async (item: ApprovalItem, decision: 'approved' | 'rejected', why?: string) => {
    setBusy(item.id);
    const out = await decideApproval(item, decision, why);
    setBusy(null);
    if (!out.ok) {
      toast.error(decision === 'approved' ? 'Couldn’t approve' : 'Couldn’t decline', out.message);
      return false;
    }
    recordDecision(item, { decision, at: Date.now(), note: why, message: out.message });
    if (!out.sourceToasted) toast.success(decision === 'approved' ? 'Approved' : 'Declined', out.message);
    setRejecting(null);
    setNote('');
    setSelected((s) => {
      const n = new Set(s);
      n.delete(item.id);
      return n;
    });
    if (item.live) window.setTimeout(() => void sync(), 250);
    return true;
  };

  const batchApprove = async () => {
    const items = view.pending.filter((i) => selected.has(i.id));
    let ok = 0;
    for (const it of items) {
      const out = await decideApproval(it, 'approved');
      if (out.ok) {
        recordDecision(it, { decision: 'approved', at: Date.now(), message: out.message });
        ok += 1;
      }
    }
    setSelected(new Set());
    toast.success('Batch approved', `${ok} / ${items.length}`);
    void sync();
  };

  const ask = (item: ApprovalItem) => {
    const who = ctx.resolve(item.requesterId);
    const ar = fmt.locale === 'ar';
    const them = firstOf(who.name);
    const meFirst = firstOf(ctx.me?.name ?? '');
    openComposer({
      to: [item.requesterId],
      subject: ar ? `سؤال حول: ${item.title}` : `Question about: ${item.title}`,
      body: ar
        ? `مرحباً ${AR_PERSON_NAMES[them] ?? them}،\n\nقبل أن أعتمد «${item.title}»، هل يمكنك مشاركة مزيد من التفاصيل؟\n\nشكراً،\n${AR_PERSON_NAMES[meFirst] ?? meFirst}`
        : `Hi ${them},\n\nBefore I approve “${item.title}”, could you share a bit more context?\n\nThanks,\n${meFirst}`,
    });
  };

  const allSelected = view.pending.length > 0 && view.pending.every((i) => selected.has(i.id));

  return (
    <div className="ml-aps">
      {view.mode === 'live' ? (
        <NeoBanner
          tone="success"
          icon={<Zap />}
          title="Live from your apps"
          action={
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => void sync()} disabled={loading}>
              <RefreshCw className={loading ? 'neo-spin' : undefined} /> <span>Refresh</span>
            </button>
          }
        >
          <span>Pulled from Procurement, HR Portal, Travel & Expenses and Talent Hub — every decision runs through that app’s own approval flow.</span>
        </NeoBanner>
      ) : (
        <NeoBanner
          tone="indigo"
          icon={<CircleHelp />}
          title="Demo approvals"
          action={
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => void sync()} disabled={loading}>
              <RefreshCw className={loading ? 'neo-spin' : undefined} /> <span>Refresh</span>
            </button>
          }
        >
          <span>Nothing is waiting on you in the source apps right now, so Nova shows sample requests.</span>
        </NeoBanner>
      )}
      {errors.length > 0 && errors.length < 4 && (
        <p className="ml-aps__err">
          <span>Some apps couldn’t be reached</span> <span className="neo-mono">{errors.join(' · ')}</span>
        </p>
      )}

      {view.pending.length > 0 && (
        <div className="ml-aps__bar" role="toolbar" aria-label="Batch approval">
          <button
            type="button"
            className="neo-btn neo-btn--ghost neo-btn--xs"
            role="checkbox"
            aria-checked={allSelected}
            onClick={() => setSelected(allSelected ? new Set() : new Set(view.pending.map((i) => i.id)))}
          >
            {allSelected ? <SquareCheckBig /> : <Square />} <span>Select all</span>
          </button>
          <span className="ml-aps__count">
            <b>{fmt.num(view.pending.length)}</b> <span>waiting on you</span>
          </span>
          <span className="grow" />
          <HoldButton onComplete={() => void batchApprove()} disabled={!selected.size} label="Hold to approve selected">
            <span>Hold to approve</span> <b>{fmt.num(selected.size)}</b>
          </HoldButton>
        </div>
      )}

      {view.pending.length === 0 ? (
        <NeoEmpty icon={<CheckCheck />} title="All caught up">
          <span>No approvals are waiting on you. Nova will surface new requests here the moment they arrive.</span>
        </NeoEmpty>
      ) : (
        <div className="ml-aps__grid">
          {view.pending.map((item) => {
            const who = ctx.resolve(item.requesterId);
            const rel = RELATION[item.relation];
            const isRejecting = rejecting === item.id;
            const on = selected.has(item.id);
            return (
              <article key={item.id} className="ml-ap neo-spot" data-source={item.source} data-selected={on || undefined} aria-label={item.title}>
                <header className="ml-ap__head">
                  <span className="ml-ap__app">
                    {SOURCE_ICON[item.source]}
                    <span>{item.appLabel}</span>
                  </span>
                  <Chip tone={rel.tone} size="sm">
                    {rel.label}
                  </Chip>
                  <span className="ml-ap__age">{fmt.when(item.at, now)}</span>
                  <button
                    type="button"
                    className="neo-iconbtn neo-iconbtn--sm"
                    role="checkbox"
                    aria-checked={on}
                    aria-label="Select for batch approval"
                    onClick={() =>
                      setSelected((s) => {
                        const n = new Set(s);
                        if (n.has(item.id)) n.delete(item.id);
                        else n.add(item.id);
                        return n;
                      })
                    }
                  >
                    {on ? <SquareCheckBig /> : <Square />}
                  </button>
                </header>
                <div className="ml-ap__who">
                  <ContactAvatar c={who} size={30} presence />
                  <span className="ml-ap__whotext">
                    <b>{who.name}</b>
                    <span>{who.title ?? who.org}</span>
                  </span>
                  {item.amount && <span className="ml-ap__amount neo-mono">{item.amount}</span>}
                </div>
                <h3 className="ml-ap__title" dir="auto">
                  {item.title}
                </h3>
                <p className="ml-ap__detail" data-no-i18n dir="auto">
                  {item.detail}
                </p>
                {!!item.flags?.length && (
                  <div className="ml-ap__flags">
                    {item.flags.map((f) => (
                      <Chip key={f} tone="warning" size="sm">
                        {f}
                      </Chip>
                    ))}
                  </div>
                )}
                <NeoTracker compact steps={item.steps.map((label) => ({ label }))} current={item.current} label="Approval journey" />
                {isRejecting && (
                  <form
                    className="ml-ap__note"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void decide(item, 'rejected', note.trim() || undefined);
                    }}
                  >
                    <input
                      className="neo-input neo-input--sm"
                      autoFocus
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={item.noteRequiredForReject ? 'Add a short note for the requester (required)' : 'Add a note (optional)'}
                      aria-label="Decline note"
                    />
                    <button type="submit" className="neo-btn neo-btn--danger neo-btn--xs" disabled={busy === item.id || (item.noteRequiredForReject && note.trim().length < 5)}>
                      <span>Decline</span>
                    </button>
                    <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={() => setRejecting(null)} aria-label="Cancel">
                      <X />
                    </button>
                  </form>
                )}
                <footer className="ml-ap__acts">
                  <button type="button" className="neo-btn neo-btn--success neo-btn--xs" onClick={() => void decide(item, 'approved')} disabled={busy === item.id}>
                    <BadgeCheck /> <span>Approve</span>
                  </button>
                  {item.canReject ? (
                    <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs ml-ap__reject" onClick={() => setRejecting(isRejecting ? null : item.id)} aria-expanded={isRejecting}>
                      <X /> <span>Reject</span>
                    </button>
                  ) : null}
                  <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => ask(item)}>
                    <CircleHelp /> <span>Ask</span>
                  </button>
                  <span className="grow" />
                  <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => navigate(item.openTo)}>
                    <ExternalLink /> <span>Open in</span> <span>{item.appLabel}</span>
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {view.decided.length > 0 && (
        <section className="ml-aps__done" aria-label="Decided today">
          <div className="neo-hud">Decided today</div>
          <ul>
            {view.decided.slice(0, 8).map((d) => (
              <li key={d.id}>
                <span className="ml-ap__app">
                  {SOURCE_ICON[d.source]}
                  <span>{d.appLabel}</span>
                </span>
                <span className="ml-aps__done-title" dir="auto">
                  {d.title}
                </span>
                <Chip tone={d.decision.decision === 'approved' ? 'success' : 'danger'} size="sm" icon={d.decision.decision === 'approved' ? <BadgeCheck /> : <X />}>
                  {d.decision.decision === 'approved' ? 'Approved' : 'Declined'}
                </Chip>
                <span className="ml-aps__done-msg">
                  {d.decision.message}
                </span>
                <span className="ml-ap__age">{fmt.when(d.decision.at, now)}</span>
                <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={() => navigate(d.openTo)} aria-label={`Open in `} title={`Open in `}>
                  <Briefcase />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
