import { useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Clock,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { canDecideBonus } from '@/payroll/access';
import {
  BONUS_KIND_META,
  formatPeriodLabel,
  periodFromTimestamp,
} from '@/payroll/engine';
import { useCompReport, usePayrollCaps } from '@/payroll/selectors';
import { usePayroll } from '@/payroll/store';
import type { BonusAward, BonusKind, BonusStatus } from '@/payroll/types';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { Avatar, EmptyState } from '@/components/ui/primitives';
import { BONUS_STATUS_META, formatAed, NominateBonusModal } from './shared';

const KIND_FILTERS: Array<{ id: 'all' | BonusKind; label: string }> = [
  { id: 'all', label: 'All Categories' },
  { id: 'performance', label: 'Performance' },
  { id: 'spot', label: 'Spot' },
  { id: 'signing', label: 'Signing' },
  { id: 'milestone', label: 'Milestone' },
  { id: 'retention', label: 'Retention' },
];

const STATUS_FILTERS: Array<{ id: 'all' | BonusStatus; label: string }> = [
  { id: 'all', label: 'All Statuses' },
  { id: 'approved_queued', label: 'Queued in Payroll' },
  { id: 'paid', label: 'Paid' },
  { id: 'pending_approval', label: 'Pending 4-Eyes' },
  { id: 'declined', label: 'Declined' },
];

export function BonusesView() {
  const users = useHub((s) => s.users);
  const caps = usePayrollCaps();
  const bonuses = usePayroll((s) => s.bonuses);
  const decideBonus = usePayroll((s) => s.decideBonus);
  const compReport = useCompReport();

  const [nominateOpen, setNominateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | BonusStatus>('all');
  const [kindFilter, setKindFilter] = useState<'all' | BonusKind>('all');
  const [search, setSearch] = useState('');
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [periodById, setPeriodById] = useState<Record<string, string>>({});

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const pCurrent = useMemo(() => periodFromTimestamp(Date.now(), 0), []);
  const pNext = useMemo(() => periodFromTimestamp(Date.now(), 1), []);
  const currentYearPrefix = String(new Date().getFullYear());

  const pendingList = useMemo(
    () => bonuses.filter((b) => b.status === 'pending_approval'),
    [bonuses],
  );
  const queuedList = useMemo(
    () => bonuses.filter((b) => b.status === 'approved_queued'),
    [bonuses],
  );
  const paidYtdList = useMemo(
    () =>
      bonuses.filter(
        (b) => b.status === 'paid' && b.payrollPeriod.startsWith(currentYearPrefix),
      ),
    [bonuses, currentYearPrefix],
  );

  const pendingTotalAed = useMemo(
    () => pendingList.reduce((s, b) => s + b.amountAed, 0),
    [pendingList],
  );
  const queuedTotalAed = useMemo(
    () => queuedList.reduce((s, b) => s + b.amountAed, 0),
    [queuedList],
  );
  const paidYtdTotalAed = useMemo(
    () => paidYtdList.reduce((s, b) => s + b.amountAed, 0),
    [paidYtdList],
  );

  // Department Variable Pay Pool Burn Bars
  const deptBurnRows = useMemo(() => {
    const map = new Map<
      string,
      {
        department: string;
        annualPoolAed: number;
        paidAed: number;
        queuedAed: number;
        pendingAed: number;
      }
    >();

    for (const row of compReport.rows) {
      const existing = map.get(row.user.department) ?? {
        department: row.user.department,
        annualPoolAed: 0,
        paidAed: 0,
        queuedAed: 0,
        pendingAed: 0,
      };
      // Quarterly / semi-annual discretionary pool benchmarked at 35% of annual target bonus pool
      existing.annualPoolAed += Math.max(
        12_000,
        Math.round(row.annualFixedAed * (row.band.targetBonusPct / 100) * 0.35),
      );
      map.set(row.user.department, existing);
    }

    for (const b of bonuses) {
      if (!b.payrollPeriod.startsWith(currentYearPrefix) || b.status === 'declined') continue;
      const entry = map.get(b.department) ?? {
        department: b.department,
        annualPoolAed: 30_000,
        paidAed: 0,
        queuedAed: 0,
        pendingAed: 0,
      };
      if (b.status === 'paid') entry.paidAed += b.amountAed;
      else if (b.status === 'approved_queued') entry.queuedAed += b.amountAed;
      else if (b.status === 'pending_approval') entry.pendingAed += b.amountAed;
      map.set(b.department, entry);
    }

    return [...map.values()].sort(
      (a, b) =>
        b.paidAed + b.queuedAed + b.pendingAed - (a.paidAed + a.queuedAed + a.pendingAed) ||
        b.annualPoolAed - a.annualPoolAed,
    );
  }, [bonuses, compReport.rows, currentYearPrefix]);

  const filteredLedger = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bonuses.filter((b) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (kindFilter !== 'all' && b.kind !== kindFilter) return false;
      if (!q) return true;
      const recipient = userById.get(b.userId);
      const nominator = userById.get(b.nominatedBy);
      const hay = [
        b.reference,
        b.title,
        b.reason,
        b.department,
        b.payrollPeriod,
        recipient?.name,
        nominator?.name,
        BONUS_KIND_META[b.kind].label,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [bonuses, statusFilter, kindFilter, search, userById]);

  const handleDecision = (bonus: BonusAward, decision: 'approved_queued' | 'declined') => {
    const targetPeriod = periodById[bonus.id] || bonus.payrollPeriod || pCurrent;
    const note = noteById[bonus.id] || '';
    const res = decideBonus(bonus.id, decision, targetPeriod, note);
    toast.result(
      res,
      decision === 'approved_queued' ? 'Bonus approved & queued into payroll' : 'Bonus declined',
    );
  };

  return (
    <div className="stack stack--lg" style={{ minWidth: 0 }}>
      {/* KPI & Variable Pool Strip */}
      <section className="py-kpi-grid py-kpi-grid--4" aria-label="Variable pay metrics">
        <div className="py-kpi">
          <div className="py-kpi__label">
            <span>Pending Four-Eyes Sign-Off</span>
            <Clock />
          </div>
          <div className="py-kpi__val">{formatAed(pendingTotalAed)}</div>
          <div className="py-kpi__foot">
            {pendingList.length} nomination{pendingList.length === 1 ? '' : 's'} awaiting review
          </div>
        </div>

        <div className="py-kpi py-kpi--highlight">
          <div className="py-kpi__label">
            <span>Queued for Active Payday</span>
            <Sparkles />
          </div>
          <div className="py-kpi__val">{formatAed(queuedTotalAed)}</div>
          <div className="py-kpi__foot">
            {queuedList.length} approved award{queuedList.length === 1 ? '' : 's'} in {pCurrent}
          </div>
        </div>

        <div className="py-kpi">
          <div className="py-kpi__label">
            <span>Paid YTD ({currentYearPrefix})</span>
            <CheckCircle2 />
          </div>
          <div className="py-kpi__val">{formatAed(paidYtdTotalAed)}</div>
          <div className="py-kpi__foot">
            {paidYtdList.length} settled award{paidYtdList.length === 1 ? '' : 's'} on HR payslips
          </div>
        </div>

        <div className="py-kpi">
          <div className="py-kpi__label">
            <span>Committed YTD Variable</span>
            <TrendingUp />
          </div>
          <div className="py-kpi__val">{formatAed(paidYtdTotalAed + queuedTotalAed)}</div>
          <div className="py-kpi__foot">Paid + Approved Queued</div>
        </div>
      </section>

      {/* Two-column: Four-Eyes Approval Queue + Department Variable Pay Burn Bars */}
      <div className="py-two-col">
        {/* Four-Eyes Approval Queue */}
        <section className="card" style={{ minWidth: 0 }}>
          <div className="section-head">
            <div>
              <h2 className="section-title" style={{ margin: 0 }}>
                Four-Eyes Approval Queue
                <span className="count">{pendingList.length}</span>
              </h2>
              <p className="text-xs muted" style={{ marginTop: 3 }}>
                Separation of duties prevents nominators or recipients from approving their own awards.
              </p>
            </div>
            {caps.canNominateBonus && (
              <button
                type="button"
                className="btn btn--sm py-btn-emerald"
                onClick={() => setNominateOpen(true)}
              >
                <Plus /> Nominate Bonus
              </button>
            )}
          </div>

          {pendingList.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck />}
              title="All bonus nominations reviewed"
              action={
                caps.canNominateBonus ? (
                  <button
                    type="button"
                    className="btn btn--sm py-btn-emerald"
                    onClick={() => setNominateOpen(true)}
                  >
                    <Plus /> Nominate a Teammate
                  </button>
                ) : undefined
              }
            >
              Approved awards flow directly into the employee’s monthly payroll run.
            </EmptyState>
          ) : (
            <div className="py-bonus-queue">
              {pendingList.map((b) => {
                const recipient = userById.get(b.userId);
                const nominator = userById.get(b.nominatedBy);
                const kindMeta = BONUS_KIND_META[b.kind];
                const gate = canDecideBonus(caps.viewer, b);
                const targetPeriod = periodById[b.id] || b.payrollPeriod || pCurrent;

                return (
                  <article key={b.id} className="py-bonus-card">
                    <div className="py-bonus-card__top">
                      <div className="row" style={{ gap: 10, minWidth: 0 }}>
                        {recipient && <Avatar user={recipient} size={38} />}
                        <div style={{ minWidth: 0 }}>
                          <div className="row row--wrap" style={{ gap: 6 }}>
                            <strong style={{ fontSize: 14.5 }}>
                              {recipient?.name ?? b.userId}
                            </strong>
                            <span className="tag">{b.reference}</span>
                            <span className="py-kind-pill">
                              <span
                                className="py-kind-pill__dot"
                                style={{ background: kindMeta.color }}
                              />
                              {kindMeta.label}
                            </span>
                          </div>
                          <div className="text-xs muted" style={{ marginTop: 2 }}>
                            {recipient?.title ?? b.department} · {b.department} · Nominated by{' '}
                            <b>{nominator?.name ?? b.nominatedBy}</b> ({relativeTime(b.nominatedAt)})
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 19,
                            fontWeight: 700,
                            color: 'var(--text)',
                          }}
                        >
                          {formatAed(b.amountAed)}
                        </div>
                        <div className="text-xs muted mono">
                          Target: {formatPeriodLabel(targetPeriod)}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 5 }}>
                        {b.title}
                      </div>
                      <div className="py-bonus-card__quote">“{b.reason}”</div>
                    </div>

                    {!gate.ok ? (
                      <div className="py-sod-banner" style={{ marginTop: 0 }}>
                        <ShieldAlert />
                        <div>
                          <strong>Four-Eyes Separation of Duties:</strong> {gate.reason}
                        </div>
                      </div>
                    ) : (
                      <div className="row row--wrap row--between" style={{ gap: 10 }}>
                        <div className="row row--wrap" style={{ gap: 8, flex: '1 1 260px' }}>
                          <select
                            className="select"
                            style={{ height: 34, width: 170, fontSize: 12.5 }}
                            value={targetPeriod}
                            onChange={(e) =>
                              setPeriodById((prev) => ({ ...prev, [b.id]: e.target.value }))
                            }
                            aria-label="Target payroll period"
                          >
                            <option value={pCurrent}>{pCurrent} (Active)</option>
                            <option value={pNext}>{pNext} (Next)</option>
                          </select>
                          <input
                            type="text"
                            className="input"
                            style={{ height: 34, flex: '1 1 160px', fontSize: 12.5 }}
                            value={noteById[b.id] ?? ''}
                            onChange={(e) =>
                              setNoteById((prev) => ({ ...prev, [b.id]: e.target.value }))
                            }
                            placeholder="Optional decision note..."
                          />
                        </div>

                        <div className="row" style={{ gap: 8 }}>
                          <button
                            type="button"
                            className="btn btn--danger btn--sm"
                            onClick={() => handleDecision(b, 'declined')}
                          >
                            <XCircle /> Decline
                          </button>
                          <button
                            type="button"
                            className="btn btn--sm py-btn-emerald"
                            onClick={() => handleDecision(b, 'approved_queued')}
                          >
                            <ShieldCheck /> Approve & Queue into Payroll
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Department Variable Pay Burn Bars */}
        <section className="card" style={{ minWidth: 0 }}>
          <div className="section-head">
            <div>
              <h2 className="section-title" style={{ margin: 0 }}>
                Department Variable Pay Burn
              </h2>
              <p className="text-xs muted" style={{ marginTop: 3 }}>
                Paid, payroll-queued & pending awards vs discretionary pool allocation.
              </p>
            </div>
          </div>

          <div className="row row--wrap text-xs muted" style={{ gap: 12, marginBottom: 14 }}>
            <span className="row" style={{ gap: 5 }}>
              <span className="py-kind-pill__dot" style={{ background: '#10b981' }} /> Paid
            </span>
            <span className="row" style={{ gap: 5 }}>
              <span className="py-kind-pill__dot" style={{ background: '#38bdf8' }} /> Queued
            </span>
            <span className="row" style={{ gap: 5 }}>
              <span className="py-kind-pill__dot" style={{ background: '#fbbf24' }} /> Pending
            </span>
          </div>

          <div className="py-burn-list">
            {deptBurnRows.map((d) => {
              const totalUsed = d.paidAed + d.queuedAed + d.pendingAed;
              const denom = Math.max(d.annualPoolAed, totalUsed, 1);
              const paidPct = Math.round((d.paidAed / denom) * 100);
              const queuedPct = Math.round((d.queuedAed / denom) * 100);
              const pendingPct = Math.round((d.pendingAed / denom) * 100);
              const burnPct = Math.round((totalUsed / Math.max(1, d.annualPoolAed)) * 100);

              return (
                <div key={d.department} className="py-burn-row">
                  <div className="py-burn-row__head">
                    <strong>{d.department}</strong>
                    <span className="mono text-xs muted">
                      {formatAed(totalUsed)} / {formatAed(d.annualPoolAed)} ({burnPct}%)
                    </span>
                  </div>
                  <div className="py-burn-bar">
                    {paidPct > 0 && (
                      <i style={{ width: `${paidPct}%`, background: '#10b981' }} title={`Paid: ${formatAed(d.paidAed)}`} />
                    )}
                    {queuedPct > 0 && (
                      <i style={{ width: `${queuedPct}%`, background: '#38bdf8' }} title={`Queued: ${formatAed(d.queuedAed)}`} />
                    )}
                    {pendingPct > 0 && (
                      <i style={{ width: `${pendingPct}%`, background: '#fbbf24' }} title={`Pending: ${formatAed(d.pendingAed)}`} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Queued & Historical Awards Ledger */}
      <section className="card py-table-card">
        <div className="py-table-card__head">
          <div>
            <h2 className="section-title" style={{ margin: 0 }}>
              Queued & Historical Variable Pay Ledger
              <span className="count">{filteredLedger.length}</span>
            </h2>
            <p className="text-xs muted" style={{ marginTop: 3 }}>
              Full audit log of spot awards, SLO milestones, signing tranches, and performance bonuses.
            </p>
          </div>
          {caps.canNominateBonus && (
            <button
              type="button"
              className="btn btn--sm py-btn-emerald"
              onClick={() => setNominateOpen(true)}
            >
              <Award /> Nominate Bonus
            </button>
          )}
        </div>

        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
          <div className="stack stack--sm">
            <div className="py-toolbar" style={{ marginBottom: 0 }}>
              <div className="py-toolbar__left">
                <div className="input-wrap py-search">
                  <Search />
                  <input
                    type="search"
                    className="input"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search reference, employee, award title..."
                  />
                </div>
                <div className="chips" style={{ maskImage: 'none', flexWrap: 'wrap' }}>
                  {STATUS_FILTERS.map((sf) => (
                    <button
                      key={sf.id}
                      type="button"
                      className={cx('chip', statusFilter === sf.id && 'is-active')}
                      onClick={() => setStatusFilter(sf.id)}
                    >
                      {sf.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="chips" style={{ maskImage: 'none', flexWrap: 'wrap' }}>
              {KIND_FILTERS.map((kf) => (
                <button
                  key={kf.id}
                  type="button"
                  className={cx('chip', kindFilter === kf.id && 'is-active')}
                  onClick={() => setKindFilter(kf.id)}
                >
                  {kf.id !== 'all' && (
                    <span
                      className="py-kind-pill__dot"
                      style={{ background: BONUS_KIND_META[kf.id].color }}
                    />
                  )}
                  {kf.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredLedger.length === 0 ? (
          <EmptyState icon={<Award />} title="No bonus awards match your filters">
            Reset status or category filters to view all variable pay awards.
          </EmptyState>
        ) : (
          <div className="py-table-wrap">
            <table className="py-table">
              <thead>
                <tr>
                  <th>Reference & Recipient</th>
                  <th>Category</th>
                  <th>Award & Impact Citation</th>
                  <th>Nominated / Signed Off</th>
                  <th>Target Period</th>
                  <th className="is-right">Amount (AED)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredLedger.map((b) => {
                  const recipient = userById.get(b.userId);
                  const nominator = userById.get(b.nominatedBy);
                  const decider = b.decidedBy ? userById.get(b.decidedBy) : undefined;
                  const kindMeta = BONUS_KIND_META[b.kind];
                  const statusMeta = BONUS_STATUS_META[b.status];

                  return (
                    <tr key={b.id}>
                      <td>
                        <div className="py-emp-cell">
                          {recipient && <Avatar user={recipient} size={32} />}
                          <div className="py-emp-cell__meta">
                            <div className="py-emp-cell__name">
                              {recipient?.name ?? b.userId}
                            </div>
                            <div className="py-emp-cell__sub mono">
                              {b.reference} · {b.department}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="py-kind-pill">
                          <span
                            className="py-kind-pill__dot"
                            style={{ background: kindMeta.color }}
                          />
                          {kindMeta.label}
                        </span>
                      </td>

                      <td style={{ maxWidth: 320 }}>
                        <div style={{ fontWeight: 600 }}>{b.title}</div>
                        <div className="text-xs muted clamp-2" style={{ marginTop: 2 }}>
                          {b.reason}
                        </div>
                      </td>

                      <td>
                        <div className="text-xs">
                          Nom: <b>{nominator?.name ?? b.nominatedBy}</b>
                        </div>
                        {decider && (
                          <div className="text-xs muted">
                            4-Eyes: <b>{decider.name}</b>
                          </div>
                        )}
                      </td>

                      <td>
                        <span className="tag">{b.payrollPeriod}</span>
                        {b.paidRunId && (
                          <div className="py-num-sub">Run {b.paidRunId}</div>
                        )}
                      </td>

                      <td className="is-right">
                        <span className="py-num py-num--net">{formatAed(b.amountAed)}</span>
                      </td>

                      <td>
                        <span className={`badge badge--${statusMeta.badge}`}>
                          {statusMeta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <NominateBonusModal open={nominateOpen} onClose={() => setNominateOpen(false)} />
    </div>
  );
}
