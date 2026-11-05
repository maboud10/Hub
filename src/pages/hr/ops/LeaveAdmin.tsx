/**
 * People Ops console · leave balances admin: searchable employee list with
 * annual / sick / work-from-anywhere availability, an "Adjust balance" modal
 * (type, ± days, reason, live before → after preview) wired to
 * `adjustBalance` — which enforces separation of duties for your own balance —
 * and the latest adjustments as an audit trail.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ChevronDown, ChevronUp, History, Lock, Minus, Plus, Search, ShieldAlert, SlidersHorizontal } from 'lucide-react';
import type { LeaveTypeId } from '@/hr/types';
import { LEAVE_TYPES, LEAVE_TYPE_BY_ID } from '@/hr/constants';
import { canAdjustBalance } from '@/hr/access';
import { balanceOf, computeBalances, type LeaveBalance } from '@/hr/engine';
import { todayISO } from '@/hr/calendar';
import { isEmployee } from '@/hr/seed';
import { useHr } from '@/hr/store';
import { useBalances, useHrViewer } from '@/hr/selectors';
import { useHub } from '@/store/hub';
import { useUserById } from '@/store/selectors';
import { toast } from '@/store/toast';
import { useNow } from '@/hooks/useNow';
import { Modal } from '@/components/ui/Modal';
import { cx } from '@/lib/cx';
import { HrPanel, LeaveTypeBadge, UserLine } from '../components/shared';
import { ago } from '../home/format';

const ADJUSTABLE = LEAVE_TYPES.filter((t) => t.allowance !== null);
const REASONS = ['Carry-over correction', 'Time in lieu for weekend work', 'Joining date correction', 'Manual correction after review'];
/** Rows shown before "Show all" (search always covers everyone). */
const LIMIT = 8;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function BalanceCell({ b }: { b: LeaveBalance }) {
  const ent = b.entitled ?? 0;
  const avail = b.available ?? 0;
  const pct = ent > 0 ? Math.max(0, Math.min(1, avail / ent)) : 0;
  const m = LEAVE_TYPE_BY_ID[b.type];
  return (
    <span className={cx('hr-ops-bal', avail <= 2 && 'is-low')} style={{ '--lt-h': m.hue } as CSSProperties}>
      <span className="hr-ops-bal__num">
        <b>{fmt(avail)}</b>
        <small>/ {fmt(ent)}</small>
      </span>
      <span className="hr-ops-bal__bar" aria-hidden="true">
        <i style={{ width: `${pct * 100}%` }} />
      </span>
      {b.pending > 0 && <span className="hr-ops-bal__pending">{fmt(b.pending)} pending</span>}
    </span>
  );
}

export function LeaveAdmin() {
  const users = useHub((s) => s.users);
  const leave = useHr((s) => s.leave);
  const adjustments = useHr((s) => s.adjustments);
  const v = useHrViewer();
  const now = useNow(60_000);
  const [q, setQ] = useState('');
  const [target, setTarget] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const today = todayISO(now);
  const year = new Date(now).getFullYear();
  const rows = useMemo(
    () =>
      users
        .filter(isEmployee)
        .map((u) => {
          const b = computeBalances(u, leave, adjustments, year, today);
          return { u, annual: balanceOf(b, 'annual'), sick: balanceOf(b, 'sick'), wfa: balanceOf(b, 'wfa') };
        })
        .sort((a, b) => a.u.name.localeCompare(b.u.name)),
    [users, leave, adjustments, year, today],
  );
  const needle = q.trim().toLowerCase();
  const shown = needle ? rows.filter((r) => `${r.u.name} ${r.u.department} ${r.u.location} ${r.u.title}`.toLowerCase().includes(needle)) : rows;
  const visible = needle || all ? shown : shown.slice(0, LIMIT);
  const recent = useMemo(() => [...adjustments].sort((a, b) => b.at - a.at).slice(0, 5), [adjustments]);
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? 'Someone';

  return (
    <HrPanel
      className="hr-ops-leave"
      title="Leave balances"
      icon={<SlidersHorizontal aria-hidden="true" />}
      sub={`${year} balances: available of entitled days. Adjustments are logged and the employee is notified.`}
      actions={
        <label className="input-wrap hr-ops-leave__search">
          <Search aria-hidden="true" />
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people, teams, cities" aria-label="Search employees" />
        </label>
      }
    >
      <div className="table-wrap hr-ops-leave__wrap">
        <table className="table hr-ops-leave__table" id="hr-ops-leave-table">
          <thead>
            <tr>
              <th scope="col">Employee</th>
              <th scope="col">Annual</th>
              <th scope="col">Sick</th>
              <th scope="col">Work from anywhere</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ u, annual, sick, wfa }) => {
              const self = !!v && !canAdjustBalance(v, u.id).ok;
              return (
                <tr key={u.id}>
                  <td data-label="Employee">
                    <UserLine userId={u.id} size={30} sub={`${u.department} · ${u.location}`} />
                  </td>
                  <td data-label="Annual">
                    <BalanceCell b={annual} />
                  </td>
                  <td data-label="Sick">
                    <BalanceCell b={sick} />
                  </td>
                  <td data-label="Anywhere">
                    <BalanceCell b={wfa} />
                  </td>
                  <td className="hr-ops-leave__act">
                    <button type="button" className="btn btn--sm" onClick={() => setTarget(u.id)} data-tip={self ? 'Separation of duties applies' : undefined}>
                      {self ? <Lock /> : <SlidersHorizontal />} Adjust
                    </button>
                  </td>
                </tr>
              );
            })}
            {!shown.length && (
              <tr>
                <td colSpan={5} className="hr-ops-empty">
                  No one matches “{q}”. Try a name, team or city.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!needle && shown.length > LIMIT && (
        <button type="button" className="hr-ops-more" aria-expanded={all} aria-controls="hr-ops-leave-table" onClick={() => setAll((x) => !x)}>
          {all ? (
            <>
              <ChevronUp aria-hidden="true" /> Show fewer
            </>
          ) : (
            <>
              <ChevronDown aria-hidden="true" /> Show all {shown.length} people
            </>
          )}
        </button>
      )}
      {recent.length > 0 && (
        <div className="hr-ops-leave__log">
          <span className="stat-label">
            <History aria-hidden="true" className="inline-icon" /> Recent adjustments
          </span>
          <ul>
            {recent.map((a) => (
              <li key={a.id}>
                <b className={a.days > 0 ? 'is-plus' : 'is-minus'}>
                  {a.days > 0 ? '+' : ''}
                  {fmt(a.days)}
                </b>
                <LeaveTypeBadge type={a.type} />
                <span className="grow truncate">
                  {nameOf(a.userId)} · {a.reason}
                </span>
                <span className="faint text-xs">
                  by {nameOf(a.by).split(' ')[0]} · {ago(a.at, now)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <AdjustBalanceModal userId={target} onClose={() => setTarget(null)} />
    </HrPanel>
  );
}

// ───────────────────────── adjust modal ─────────────────────────
function AdjustBalanceModal({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const [shownId, setShownId] = useState<string | null>(userId);
  useEffect(() => {
    if (userId) setShownId(userId);
  }, [userId]);
  const open = !!userId;
  const id = userId ?? shownId;
  const user = useUserById(id);
  const v = useHrViewer();
  const adjustBalance = useHr((s) => s.adjustBalance);
  const balances = useBalances(id ?? undefined);
  const [type, setType] = useState<LeaveTypeId>('annual');
  const [days, setDays] = useState(1);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) return;
    setType('annual');
    setDays(1);
    setReason('');
  }, [open, userId]);

  const verdict = v && id ? canAdjustBalance(v, id) : { ok: false, reason: 'You are not signed in.' };
  const bal = balances.find((b) => b.type === type);
  const after = bal && bal.available !== null ? Math.round((bal.available + days) * 10) / 10 : null;
  const valid = verdict.ok && days !== 0 && Math.abs(days) <= 60 && reason.trim().length >= 5;
  const step = (delta: number) => setDays((d) => Math.max(-60, Math.min(60, Math.round((d + delta) * 2) / 2)));
  const apply = () => {
    if (!id) return;
    if (toast.result(adjustBalance(id, type, days, reason))) onClose();
  };
  const first = user?.name.split(' ')[0] ?? 'them';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adjust balance"
      subtitle={user ? `${user.name} · ${user.department}` : undefined}
      icon={
        <span className="hr-ops-modal-icon" aria-hidden="true">
          <SlidersHorizontal />
        </span>
      }
      width={540}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={apply} disabled={!valid}>
            Apply adjustment
          </button>
        </>
      }
    >
      <div className="hr-ops-adj">
        {!verdict.ok && (
          <div className="hr-ops-adj__sod" role="alert">
            <ShieldAlert aria-hidden="true" />
            <p>
              <b>{verdict.reason}</b> Balance changes always need a second pair of eyes.
            </p>
          </div>
        )}
        <label className="field">
          <span className="field-label">Leave type</span>
          <select className="select" value={type} onChange={(e) => setType(e.target.value as LeaveTypeId)} disabled={!verdict.ok}>
            {ADJUSTABLE.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span className="field-label" id="hr-ops-adj-days">
            Days to add or remove
          </span>
          <div className="hr-ops-adj__days">
            <button type="button" className="btn btn--icon" onClick={() => step(-0.5)} aria-label="Remove half a day" disabled={!verdict.ok}>
              <Minus />
            </button>
            <input
              className="input"
              type="number"
              step={0.5}
              min={-60}
              max={60}
              value={days}
              onChange={(e) => setDays(Math.max(-60, Math.min(60, Math.round((Number(e.target.value) || 0) * 2) / 2)))}
              aria-labelledby="hr-ops-adj-days"
              disabled={!verdict.ok}
            />
            <button type="button" className="btn btn--icon" onClick={() => step(0.5)} aria-label="Add half a day" disabled={!verdict.ok}>
              <Plus />
            </button>
            <span className="hr-ops-adj__quick">
              {[-1, 1, 2, 5].map((n) => (
                <button key={n} type="button" className={cx('chip', days === n && 'is-active')} onClick={() => setDays(n)} disabled={!verdict.ok}>
                  {n > 0 ? '+' : ''}
                  {n}
                </button>
              ))}
            </span>
          </div>
        </div>
        {bal && (
          <div className={cx('hr-ops-adj__preview', days < 0 && 'is-minus')} aria-live="polite">
            <LeaveTypeBadge type={type} size="md" />
            <span className="hr-ops-adj__from">{bal.available !== null ? fmt(bal.available) : '—'}</span>
            <span className="hr-ops-adj__arrow" aria-hidden="true">
              →
            </span>
            <span className="hr-ops-adj__to">{after !== null ? fmt(after) : '—'}</span>
            <span className="text-xs faint">days available for {first}</span>
          </div>
        )}
        <label className="field">
          <span className="field-label">Reason</span>
          <textarea className="textarea" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder={`Shown on ${first}’s balance history`} disabled={!verdict.ok} />
          <span className="hr-ops-adj__reasons">
            {REASONS.map((r) => (
              <button key={r} type="button" className="chip" onClick={() => setReason(r)} disabled={!verdict.ok}>
                {r}
              </button>
            ))}
          </span>
        </label>
        <p className="field-hint">{first} gets a notification, and the change is written to the audit trail.</p>
      </div>
    </Modal>
  );
}
