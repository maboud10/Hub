/**
 * Helix Wellbeing — Perks: the wellbeing wallet (annual allowance ring),
 * claims tracked Submitted → People Ops review → Approved → Paid with payroll
 * (filed into and synced from the HR Portal), recharge credits earned from
 * streaks and challenges, a partner marketplace and seasonal campaigns.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { BadgePercent, Coins, ExternalLink, Gift, MapPin, Receipt, Sparkles, Star, Ticket, Upload, Wallet, X } from 'lucide-react';
import { Chip, CountUp, NeoHome, NeoKpi, NeoKpis, NeoPanel, NeoTracker, Ring } from '@/components/neo';
import { currentViewer, loadBridge } from '@/lib/appBridge';
import { toast } from '@/store/toast';
import { useNow } from '@/hooks/useNow';
import { cx } from '@/lib/cx';
import { claimTracker, creditsEarned, isPerkStatus, teamOf, teamStandings, walletSummary } from '@/wellbeing/engine';
import { PARTNERS, PERK_CATEGORIES, PERK_CATEGORY_LABEL, PERK_CITIES, WALLET_ALLOWANCE, WALLET_CURRENCY, buildCampaigns, hashStr, isoDay } from '@/wellbeing/seed';
import { useWellbeing } from '@/wellbeing/store';
import type { Partner, PerkCategory, PerkCity, PerkClaimStatus } from '@/wellbeing/types';
import { RadioPills, fileHrClaim, say, useDialogA11y, useHrSnapshot, useLocale, useMe } from './parts';

const STEPS = ['Submitted', 'People Ops review', 'Approved', 'Paid with payroll'];
const aed = (n: number) => `${WALLET_CURRENCY} ${Math.round(n).toLocaleString('en-US')}`;

/** Money in the active language: "AED 3,000" ↔ "3,000 د.إ". */
function Aed({ n }: { n: number }) {
  const locale = useLocale();
  const v = Math.round(n).toLocaleString('en-US');
  return <>{locale === 'ar' ? `${v} د.إ` : `${WALLET_CURRENCY} ${v}`}</>;
}

const monthLabel = (ym?: string) => {
  if (!ym) return undefined;
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
};

interface ClaimRow {
  id: string;
  merchant: string;
  amount: number;
  status: PerkClaimStatus;
  date: string;
  description: string;
  payrollMonth?: string;
  note?: string;
  source: 'aura' | 'hr';
}

export function PerksView() {
  const { me, uid, data } = useMe();
  const hr = useHrSnapshot(me?.location);
  const syncClaim = useWellbeing((s) => s.syncClaim);
  const challenge = useWellbeing((s) => s.challenge);
  const everyone = useWellbeing((s) => s.users);
  const now = useNow(60_000);
  const today = isoDay(now);
  const [claimFor, setClaimFor] = useState<Partner | 'custom' | null>(null);

  // Keep claims filed via Aura in sync with People Ops decisions in the HR Portal.
  useEffect(() => {
    if (!hr.ready) return;
    for (const c of data.claims) {
      if (!c.hrClaimId) continue;
      const h = hr.claims.find((x) => x.id === c.hrClaimId);
      if (h && isPerkStatus(h.status) && (h.status !== c.status || h.payrollMonth !== c.payrollMonth)) syncClaim(uid, c.id, { status: h.status, payrollMonth: h.payrollMonth, note: h.note });
    }
  }, [hr, data.claims, uid, syncClaim]);

  const rows: ClaimRow[] = useMemo(() => {
    const linked = new Set(data.claims.map((c) => c.hrClaimId).filter(Boolean));
    const fromHr: ClaimRow[] = hr.claims
      .filter((c) => c.userId === uid && c.allowance === 'wellness' && !linked.has(c.id))
      .map((c) => ({ id: c.id, merchant: c.merchant, amount: c.amount, status: isPerkStatus(c.status) ? c.status : 'submitted', date: c.date, description: c.description, payrollMonth: c.payrollMonth, note: c.note, source: 'hr' }));
    const mine: ClaimRow[] = data.claims.map((c) => ({ id: c.id, merchant: c.merchant, amount: c.amount, status: c.status, date: c.date, description: c.description, payrollMonth: c.payrollMonth, note: c.note, source: 'aura' }));
    return [...mine, ...fromHr].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [data.claims, hr.claims, uid]);

  const wallet = walletSummary(rows);
  const standing = teamStandings(challenge, everyone).find((t) => t.id === teamOf(me?.location));
  const campaigns = useMemo(() => buildCampaigns(now), [now]);
  const campaignCredits = campaigns.filter((c) => data.campaigns.includes(c.id)).reduce((s, c) => s + c.credits, 0);
  const earned = creditsEarned(data, today, standing?.milestones ?? 0, campaignCredits);
  const redeemed = data.redemptions.reduce((s, r) => s + r.credits, 0);
  const balance = Math.max(0, earned.total - redeemed);
  const open = rows.find((r) => r.status === 'submitted' || r.status === 'approved' || r.status === 'rejected');

  return (
    <div className="wb-view">
      <NeoKpis label="Wallet at a glance">
        <NeoKpi
          label="Allowance left"
          icon={<Wallet />}
          value={<Aed n={wallet.remaining} />}
          sub={
            <>
              <b>
                <Aed n={WALLET_ALLOWANCE} />
              </b>{' '}
              <span>annual allowance</span>
            </>
          }
        />
        <NeoKpi label="Spent" icon={<Receipt />} value={<Aed n={wallet.spent} />} sub="Approved and paid" />
        <NeoKpi label="In review" icon={<BadgePercent />} value={<Aed n={wallet.pending} />} sub="With People Ops" tone={wallet.pending ? 'warning' : undefined} />
        <NeoKpi label="Recharge credits" icon={<Coins />} value={<CountUp value={balance} />} sub="Earned from streaks & challenges" />
      </NeoKpis>

      <NeoHome
        main={
          <>
            <NeoPanel className="wb-wallet-panel" hud="Wellness allowance" title="Wellbeing wallet" icon={<Wallet />} actions={<button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => setClaimFor('custom')}><Receipt /><span>New claim</span></button>}>
              <div className="wb-wallet">
                <Ring value={wallet.usedPct} size={136} stroke={11} label="Allowance used">
                  <span className="wb-wallet__ring">
                    <b>{Math.round((1 - wallet.usedPct) * 100)}%</b>
                    <span>remaining</span>
                  </span>
                </Ring>
                <ul className="wb-wallet__rows">
                  <li data-k="paid">
                    <span>Paid with payroll</span>
                    <b>
                      <Aed n={wallet.paid} />
                    </b>
                  </li>
                  <li data-k="approved">
                    <span>Approved, next payroll</span>
                    <b>
                      <Aed n={wallet.spent - wallet.paid} />
                    </b>
                  </li>
                  <li data-k="review">
                    <span>In People Ops review</span>
                    <b>
                      <Aed n={wallet.pending} />
                    </b>
                  </li>
                  <li data-k="left">
                    <span>Remaining</span>
                    <b>
                      <Aed n={wallet.remaining} />
                    </b>
                  </li>
                </ul>
              </div>
              <p className="wb-wallet__links">
                <span>Claims are reviewed by People Ops in the HR Portal and paid with your salary.</span>
                <Link to="/hr/benefits">
                  <span>HR Portal · Benefits</span>
                  <ExternalLink aria-hidden="true" />
                </Link>
                <Link to="/expenses">
                  <span>Expenses</span>
                  <ExternalLink aria-hidden="true" />
                </Link>
              </p>
            </NeoPanel>

            <NeoPanel hud="Claim tracker" title="Your claims">
              {rows.length === 0 ? (
                <p className="wb-muted">No claims yet. Spend on a gym, a class or a meditation app and claim it here.</p>
              ) : (
                <div className="wb-claims">
                  {rows.map((r) => {
                    const t = claimTracker(r.status);
                    const full = open?.id === r.id;
                    return (
                      <article key={r.id} className={cx('wb-claim', full && 'is-open')}>
                        <header className="wb-claim__head">
                          <span className="wb-claim__icon" aria-hidden="true">
                            <Receipt />
                          </span>
                          <div className="wb-claim__titles">
                            <b data-no-i18n="">{r.merchant}</b>
                            <span data-no-i18n="">{r.description}</span>
                          </div>
                          <span className="wb-claim__amt neo-mono">
                            <Aed n={r.amount} />
                          </span>
                          {r.source === 'hr' && (
                            <Chip tone="slate" size="sm">
                              From HR Portal
                            </Chip>
                          )}
                        </header>
                        <NeoTracker
                          compact={!full}
                          bare
                          label="Claim tracker"
                          steps={STEPS.map((label, i) => ({ label, sub: i === 0 ? r.date : i === 1 ? 'People Ops' : i === 3 ? monthLabel(r.payrollMonth) : undefined }))}
                          current={t.current}
                          state={t.state}
                          message={full ? (r.status === 'rejected' ? (r.note ?? 'People Ops declined this claim.') : r.status === 'approved' ? 'Approved. It lands with your next salary.' : 'People Ops usually reviews wellness claims within two working days.') : undefined}
                        />
                      </article>
                    );
                  })}
                </div>
              )}
            </NeoPanel>

            <Marketplace balance={balance} onClaim={setClaimFor} uid={uid} />
          </>
        }
        side={
          <>
            <NeoPanel className="wb-credits" hud="Recharge credits" title="Earned, not bought" icon={<Coins />}>
              <div className="wb-credits__big">
                <b>
                  <CountUp value={balance} />
                </b>
                <span>credits</span>
              </div>
              <ul className="wb-credits__list">
                {earned.breakdown
                  .filter((b) => b.credits > 0)
                  .map((b) => (
                    <li key={b.label}>
                      <span>{b.label}</span>
                      <b>+{b.credits}</b>
                    </li>
                  ))}
                {redeemed > 0 && (
                  <li data-k="spent">
                    <span>Redeemed</span>
                    <b>−{redeemed}</b>
                  </li>
                )}
              </ul>
            </NeoPanel>
            <CampaignsPanel uid={uid} joined={data.campaigns} campaigns={campaigns} now={now} />
          </>
        }
        sideLabel="Recharge credits"
      />
      {claimFor && <ClaimDialog uid={uid} partner={claimFor === 'custom' ? null : claimFor} remaining={wallet.remaining} onClose={() => setClaimFor(null)} />}
    </div>
  );
}

/* ───────────────────────── marketplace ───────────────────────── */

function Marketplace({ balance, onClaim, uid }: { balance: number; onClaim: (p: Partner) => void; uid: string }) {
  const redeem = useWellbeing((s) => s.redeem);
  const [cat, setCat] = useState<PerkCategory | 'all'>('all');
  const [city, setCity] = useState<PerkCity | 'all'>('all');
  const list = PARTNERS.filter((p) => (cat === 'all' || p.category === cat) && (city === 'all' || p.city === city));

  const doRedeem = async (p: Partner) => {
    if (!p.credits || balance < p.credits) return;
    redeem(uid, p.id, p.credits);
    const code = `AURA-${(hashStr(`${uid}:${p.id}:${Date.now()}`) % 0xfffff).toString(36).toUpperCase().padStart(4, '0')}`;
    let mailed = false;
    try {
      const viewer = currentViewer();
      if (viewer) {
        const mail = await loadBridge('mail');
        const res = mail.sendMail(viewer, { to: [viewer.user.id], subject: `Your Helix perk: ${p.name}`, body: `Voucher code: ${code}\n${p.offer}\n\nRedeemed with recharge credits in Helix Wellbeing.`, source: { app: 'wellbeing', label: 'Perks', to: '/wellbeing/perks' } });
        mailed = res.ok;
      }
    } catch {
      mailed = false;
    }
    toast.success(mailed ? 'Voucher sent to your inbox' : 'Perk redeemed', `${p.name} · ${code}`);
  };

  return (
    <NeoPanel hud="Partner marketplace" title="Perks near you" icon={<Gift />}>
      <div className="wb-market__filters">
        <RadioPills label="Category" value={cat} onChange={setCat} options={[{ value: 'all' as const, label: 'All' }, ...PERK_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))]} />
        <RadioPills label="City" value={city} onChange={setCity} options={[{ value: 'all' as const, label: 'Everywhere' }, ...PERK_CITIES.map((c) => ({ value: c, label: c }))]} />
      </div>
      {list.length === 0 ? (
        <p className="wb-muted">No partners match those filters yet.</p>
      ) : (
        <div className="wb-market">
          {list.map((p) => (
            <article key={p.id} className="wb-partner neo-spot" style={{ ['--hue' as string]: p.hue }}>
              <header className="wb-partner__head">
                <span className="wb-partner__logo" aria-hidden="true">
                  {p.name
                    .split(' ')
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join('')}
                </span>
                <div className="wb-partner__titles">
                  <h3 data-no-i18n="">{p.name}</h3>
                  <span className="wb-partner__where">
                    <MapPin aria-hidden="true" />
                    <span>{p.area}</span>
                    <span>·</span>
                    <span>{p.city}</span>
                  </span>
                </div>
              </header>
              <div className="wb-partner__chips">
                <Chip size="sm" tone="app">
                  {PERK_CATEGORY_LABEL[p.category]}
                </Chip>
              </div>
              <p className="wb-partner__offer">
                <Star aria-hidden="true" />
                <span>{p.offer}</span>
              </p>
              <footer className="wb-partner__foot">
                <span className="wb-partner__price">
                  {p.priceAed > 0 ? (
                    <b className="neo-mono">
                      <Aed n={p.priceAed} />
                    </b>
                  ) : (
                    <b>No cost</b>
                  )}
                </span>
                {p.credits !== undefined && (
                  <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" disabled={balance < p.credits} title={balance < p.credits ? 'Not enough credits yet' : undefined} onClick={() => void doRedeem(p)}>
                    <Ticket />
                    <span>{p.credits}</span>
                  </button>
                )}
                {p.priceAed > 0 && (
                  <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={() => onClaim(p)}>
                    <Receipt />
                    <span>Claim it</span>
                  </button>
                )}
              </footer>
            </article>
          ))}
        </div>
      )}
    </NeoPanel>
  );
}

/* ───────────────────────── campaigns ───────────────────────── */

function CampaignsPanel({ uid, joined, campaigns, now }: { uid: string; joined: string[]; campaigns: ReturnType<typeof buildCampaigns>; now: number }) {
  const toggleCampaign = useWellbeing((s) => s.toggleCampaign);
  return (
    <NeoPanel hud="Seasonal campaigns" title="Join the moment" icon={<Sparkles />}>
      <div className="wb-campaigns">
        {campaigns.map((c) => {
          const live = now >= c.startsAt && now <= c.endsAt;
          const on = joined.includes(c.id);
          return (
            <article key={c.id} className={cx('wb-campaign', live && 'is-live', on && 'is-on')} data-id={c.id}>
              <header className="wb-campaign__head">
                <h3>{c.name}</h3>
                <Chip size="sm" tone={live ? 'success' : 'slate'}>
                  {live ? 'Happening now' : 'Upcoming'}
                </Chip>
              </header>
              <span className="wb-campaign__window neo-mono">{c.window}</span>
              <p>{c.description}</p>
              <footer className="wb-campaign__foot">
                <span>
                  <b>+{c.credits}</b> <span>credits</span>
                </span>
                <button
                  type="button"
                  className={cx('neo-btn', 'neo-btn--xs', on ? 'neo-btn--ghost' : 'neo-btn--soft')}
                  aria-pressed={on}
                  onClick={() => {
                    const nowOn = toggleCampaign(uid, c.id);
                    toast.info(nowOn ? 'Campaign joined' : 'Left campaign', c.name);
                  }}
                >
                  {on ? 'Joined' : live ? 'Join' : 'Remind me'}
                </button>
              </footer>
            </article>
          );
        })}
      </div>
    </NeoPanel>
  );
}

/* ───────────────────────── claim dialog ───────────────────────── */

function ClaimDialog({ uid, partner, remaining, onClose }: { uid: string; partner: Partner | null; remaining: number; onClose: () => void }) {
  const submitClaim = useWellbeing((s) => s.submitClaim);
  const ref = useRef<HTMLDivElement>(null);
  useDialogA11y(ref, onClose, 'input');
  const today = isoDay(Date.now());
  const [merchant, setMerchant] = useState(partner?.name ?? '');
  const [amount, setAmount] = useState(partner ? String(Math.min(partner.priceAed, remaining)) : '');
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState(partner?.offer ?? '');
  const [receipt, setReceipt] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const category: PerkCategory = partner?.category ?? 'fitness';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (merchant.trim().length < 2) return setError('Where did you spend it?');
    if (!(n > 0)) return setError('Enter the amount you spent.');
    if (n > remaining) return setError(say(`Only ${aed(remaining)} left in your wallet this year.`, `تبقّى في محفظتك هذا العام ${Math.round(remaining).toLocaleString('en-US')} د.إ فقط.`));
    if (!receipt) return setError('Attach the receipt.');
    setBusy(true);
    const input = { merchant: merchant.trim(), partnerId: partner?.id, category, amount: n, date, description: description.trim() || merchant.trim(), receiptName: receipt };
    const res = await fileHrClaim({ amount: n, merchant: input.merchant, description: input.description, date, receiptName: receipt });
    setBusy(false);
    if (res.ok) {
      submitClaim(uid, input, res.id);
      toast.success('Claim submitted', 'People Ops will review it in the HR Portal');
      onClose();
    } else if (res.localOnly) {
      submitClaim(uid, input);
      toast.info('Claim saved to your wallet', 'People Ops will pick it up');
      onClose();
    } else setError(res.error);
  };

  return createPortal(
    <div className="neo-portal wb-portal wb-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="wb-dialog wb-dialog--sm" role="dialog" aria-modal="true" aria-labelledby="wb-claim-title">
        <header className="wb-dialog__head">
          <span className="wb-dialog__orb" aria-hidden="true">
            <Receipt />
          </span>
          <div className="wb-dialog__titles">
            <div className="neo-hud">Wellness allowance</div>
            <h2 id="wb-claim-title" className="wb-dialog__title">
              Claim a perk
            </h2>
          </div>
          <button type="button" className="neo-iconbtn" onClick={onClose} aria-label="Close claim">
            <X />
          </button>
        </header>
        <form className="wb-claimform" onSubmit={submit}>
          <label className="neo-field">
            <span className="neo-label">Merchant</span>
            <input className="neo-input" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Gym, studio or app" />
          </label>
          <div className="wb-claimform__row">
            <label className="neo-field">
              <span className="neo-label">Amount (AED)</span>
              <input className="neo-input" type="number" min={1} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="neo-field">
              <span className="neo-label">Date of purchase</span>
              <input className="neo-input" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
          <label className="neo-field">
            <span className="neo-label">What did you buy?</span>
            <input className="neo-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. 10-class yoga pack" />
          </label>
          <div className="neo-field">
            <span className="neo-label">Purchase receipt</span>
            <div className="wb-claimform__receipt">
              <label className="neo-btn neo-btn--soft neo-btn--sm wb-file">
                <Upload />
                <span>{receipt ? 'Replace receipt' : 'Attach receipt'}</span>
                <input type="file" accept="image/*,.pdf" onChange={(e) => setReceipt(e.target.files?.[0]?.name ?? '')} />
              </label>
              {receipt ? (
                <span className="wb-claimform__file" data-no-i18n="">
                  {receipt}
                </span>
              ) : (
                <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => setReceipt(`${(merchant || 'receipt').toLowerCase().replace(/[^a-z]+/g, '-')}-receipt.pdf`)}>
                  Use a sample receipt
                </button>
              )}
            </div>
          </div>
          {error && (
            <p className="wb-claimform__err" role="alert">
              {error}
            </p>
          )}
          <footer className="wb-claimform__foot">
            <span className="wb-muted">
              <span>Remaining this year</span>{' '}
              <b>
                <Aed n={remaining} />
              </b>
            </span>
            <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="neo-btn neo-btn--plasma" disabled={busy}>
              <Receipt />
              <span>Submit claim</span>
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}
