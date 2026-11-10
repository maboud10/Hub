/**
 * Balance strip for Time off: a BalanceRing card per leave type that matters
 * (annual, work from anywhere, sick, study, compassionate; the rest behind
 * "More types"). Hover / focus / click on desktop opens a popover, a tap on
 * phones opens a sheet, explaining the maths in plain words: allowance incl.
 * first-year pro-rating, carry-over and adjustments, taken, booked, pending
 * and available, plus the policy itself.
 */
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronDown, Info, Plane } from 'lucide-react';
import type { LeaveTypeId } from '@/hr/types';
import { ANNUAL_CARRY_OVER_MAX, LEAVE_TYPE_BY_ID } from '@/hr/constants';
import { balanceOf, type LeaveBalance } from '@/hr/engine';
import { useBalances } from '@/hr/selectors';
import { useHr } from '@/hr/store';
import { useSessionUser } from '@/store/selectors';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { Sheet } from '@/components/ui/Sheet';
import { cx } from '@/lib/cx';
import { BalanceRing, HrPanel } from '../components/shared';
import { allowanceStory, KEY_TYPES, MORE_TYPES, num } from './utils';

interface MathRow {
  sign: '' | '+' | '−' | '=';
  label: string;
  value: number;
  note?: string;
  total?: boolean;
}

/** The ledger behind a balance: allowance → entitlement → available. */
export function BalanceMath({ balance, year, onRequest }: { balance: LeaveBalance; year: number; onRequest?: () => void }) {
  const me = useSessionUser();
  const adjustments = useHr((s) => s.adjustments);
  const meta = LEAVE_TYPE_BY_ID[balance.type];
  const adj = useMemo(() => adjustments.filter((a) => a.userId === me?.id && a.type === balance.type && a.year === year), [adjustments, me, balance.type, year]);
  const story = allowanceStory(meta, me?.startDate ?? `${year}-01-01`, year);

  const rows: MathRow[] = [];
  if (balance.entitled !== null && balance.allowance !== null) {
    rows.push({ sign: '', label: 'Policy allowance', value: balance.allowance, note: story });
    if (adj.length) for (const a of adj) rows.push({ sign: a.days >= 0 ? '+' : '−', label: a.reason, value: Math.abs(a.days) });
    else if (meta.id === 'annual') rows.push({ sign: '+', label: 'Carried over', value: 0, note: `Up to ${ANNUAL_CARRY_OVER_MAX} unused days roll into next year.` });
    rows.push({ sign: '=', label: 'Your entitlement', value: balance.entitled, total: true });
  }
  rows.push({ sign: rows.length ? '−' : '', label: 'Taken', value: balance.taken, note: 'Approved days already behind you' });
  rows.push({ sign: '−', label: 'Booked', value: balance.booked, note: 'Approved days still to come' });
  rows.push({ sign: '−', label: 'Pending', value: balance.pending, note: 'Waiting for approval, returned if declined' });

  const entitled = balance.entitled ?? 0;
  const seg = (n: number) => (entitled > 0 ? `${Math.max(0, Math.min(100, (n / entitled) * 100))}%` : '0%');

  return (
    <div className="hr-to-math" style={{ '--lt-h': meta.hue } as CSSProperties}>
      <div className="hr-to-math__head">
        <span className="tag">{meta.label} · {year}</span>
        {meta.private && <span className="hr-to-math__private">Private: colleagues only see “Away”</span>}
      </div>
      <ol className="hr-to-math__rows">
        {rows.map((r, i) => (
          <li key={i} className={cx('hr-to-math__row', r.total && 'is-total')}>
            <span className="hr-to-math__sign" aria-hidden="true">
              {r.sign}
            </span>
            <span className="hr-to-math__label">
              {r.label}
              {r.note && <small>{r.note}</small>}
            </span>
            <span className="hr-to-math__value">{num(r.value)}</span>
          </li>
        ))}
        {balance.available !== null ? (
          <li className="hr-to-math__row is-total is-result">
            <span className="hr-to-math__sign" aria-hidden="true">
              =
            </span>
            <span className="hr-to-math__label">Available now</span>
            <span className="hr-to-math__value">{num(balance.available)}</span>
          </li>
        ) : (
          <li className="hr-to-math__row is-total is-result">
            <span className="hr-to-math__sign" aria-hidden="true" />
            <span className="hr-to-math__label">
              No fixed allowance
              <small>{story}</small>
            </span>
            <span className="hr-to-math__value">∞</span>
          </li>
        )}
      </ol>
      {entitled > 0 && (
        <div className="hr-to-math__bar" aria-hidden="true">
          <span className="is-taken" style={{ width: seg(balance.taken) }} />
          <span className="is-booked" style={{ width: seg(balance.booked) }} />
          <span className="is-pending" style={{ width: seg(balance.pending) }} />
          <span className="is-free" style={{ width: seg(balance.available ?? 0) }} />
        </div>
      )}
      <p className="hr-to-math__policy">{meta.description}</p>
      {onRequest && (balance.available === null || balance.available > 0) && (
        <button type="button" className="btn btn--sm btn--primary hr-to-math__cta" onClick={onRequest}>
          <Plane /> Request {meta.label.toLowerCase()}
        </button>
      )}
    </div>
  );
}

function headline(b: LeaveBalance) {
  const meta = LEAVE_TYPE_BY_ID[b.type];
  if (b.available === null) return { big: 'Flexible', sub: b.taken + b.booked + b.pending ? `${num(b.taken + b.booked)} used · ${num(b.pending)} pending` : 'Your manager decides' };
  if (meta.oncePerEmployment && b.taken + b.booked + b.pending > 0) return { big: 'Used', sub: 'Once per employment' };
  const used = b.taken + b.booked;
  const parts = [used ? `${num(used)} used` : '', b.pending ? `${num(b.pending)} pending` : ''].filter(Boolean);
  return { big: `${num(b.available)} day${b.available === 1 ? '' : 's'} left`, sub: parts.length ? parts.join(' · ') : 'Nothing used yet' };
}

function BalanceCard({ balance, year, index, onRequest }: { balance: LeaveBalance; year: number; index: number; onRequest: (t: LeaveTypeId) => void }) {
  const meta = LEAVE_TYPE_BY_ID[balance.type];
  const isMobile = useIsMobile();
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popId = useId();
  const open = !isMobile && (pinned || hovered || focused);
  const h = headline(balance);
  const month = new Date().getMonth();
  const willLapse = meta.id === 'annual' && month >= 9 && balance.available !== null ? Math.max(0, balance.available - ANNUAL_CARRY_OVER_MAX) : 0;

  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: PointerEvent) => !wrapRef.current?.contains(e.target as Node) && setPinned(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPinned(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [pinned]);

  const measure = () => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) setAlignRight(r.left + 340 > window.innerWidth - 16);
  };
  const request = () => {
    setPinned(false);
    setHovered(false);
    setFocused(false);
    setSheet(false);
    onRequest(balance.type);
  };

  return (
    <div
      ref={wrapRef}
      className={cx('hr-to-bal', open && 'is-open')}
      style={{ '--lt-h': meta.hue, '--i': index } as CSSProperties}
      onPointerEnter={(e: ReactPointerEvent) => {
        if (e.pointerType !== 'mouse') return;
        measure();
        setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onFocus={(e: FocusEvent<HTMLDivElement>) => {
        if (e.target instanceof HTMLElement && e.target.matches(':focus-visible')) {
          measure();
          setFocused(true);
        }
      }}
      onBlur={(e: FocusEvent<HTMLDivElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <button
        type="button"
        className="hr-to-bal__card"
        aria-expanded={open || sheet}
        aria-controls={open ? popId : undefined}
        onClick={() => {
          if (isMobile) setSheet(true);
          else {
            measure();
            setPinned((p) => !p);
          }
        }}
      >
        <BalanceRing balance={balance} size={isMobile ? 62 : 74} />
        <span className="hr-to-bal__label">{meta.label}</span>
        <span className="hr-to-bal__big">{h.big}</span>
        <span className="hr-to-bal__sub">{h.sub}</span>
        {willLapse > 0 ? (
          <span className="hr-to-bal__nudge">{num(willLapse)} won’t carry over</span>
        ) : (
          <span className="hr-to-bal__how">
            <Info aria-hidden="true" /> How it adds up
          </span>
        )}
      </button>
      {open && (
        <div id={popId} className={cx('hr-to-bal__pop', alignRight && 'is-right')} role="dialog" aria-label={`How your ${meta.label.toLowerCase()} adds up`}>
          <BalanceMath balance={balance} year={year} onRequest={request} />
        </div>
      )}
      {isMobile && (
        <Sheet open={sheet} onClose={() => setSheet(false)} title={meta.label} className="hr-to-sheet">
          <BalanceMath balance={balance} year={year} onRequest={request} />
        </Sheet>
      )}
    </div>
  );
}

/** Balance cards + "More types" toggle. */
export function BalanceCards({ onRequest }: { onRequest: (type: LeaveTypeId) => void }) {
  const balances = useBalances();
  const [more, setMore] = useState(false);
  const year = new Date().getFullYear();
  if (!balances.length) return null;
  const types = more ? [...KEY_TYPES, ...MORE_TYPES] : KEY_TYPES;
  return (
    <HrPanel
      className="hr-to-bals"
      hud={`Leave & allowances · ${year}`}
      title="Your balances"
      actions={
        <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" aria-expanded={more} onClick={() => setMore((m) => !m)}>
          {more ? 'Fewer types' : `More types (${MORE_TYPES.length})`}
          <ChevronDown className={cx('hr-to-chev', more && 'is-up')} aria-hidden="true" />
        </button>
      }
    >
      <div className="hr-to-bals__grid">
        {types.map((t, i) => (
          <BalanceCard key={t} balance={balanceOf(balances, t)} year={year} index={i} onRequest={onRequest} />
        ))}
      </div>
    </HrPanel>
  );
}
