/**
 * Bonuses & spot awards — variable-pay HUD ribbon, four-eyes approval queue,
 * department pool burn, award mix and the full variable-pay ledger.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { Award, CheckCircle2, Clock, Plus, Search, ShieldAlert, ShieldCheck, Sparkles, TrendingUp, XCircle } from 'lucide-react';
import { canDecideBonus } from '@/payroll/access';
import { BONUS_KIND_META, formatPeriodLabel, periodFromTimestamp } from '@/payroll/engine';
import { useCompReport, usePayrollCaps } from '@/payroll/selectors';
import { usePayroll } from '@/payroll/store';
import type { BonusAward, BonusKind, BonusStatus } from '@/payroll/types';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { pluralize, relativeTime } from '@/lib/format';
import { Avatar } from '@/components/ui/primitives';
import { Bar, Chip, NeoEmpty, NeoHome, NeoKpi, NeoKpis, NeoPanel, NeoSearch, NeoTabs } from '@/components/neo';
import { BONUS_STATUS_META, compactAed, formatAed, KindChip, NominateBonusModal } from './shared';

const KINDS: BonusKind[] = ['performance', 'spot', 'signing', 'milestone', 'retention'];

const STATUS_TABS: Array<{ id: 'all' | BonusStatus; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'pending_approval', label: 'Pending' },
  { id: 'approved_queued', label: 'Queued' },
  { id: 'paid', label: 'Paid' },
  { id: 'declined', label: 'Declined' },
];

/** Departments shown in the pool-burn panel before "All". */
const BURN_PREVIEW = 6;

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
  const [showAllBurn, setShowAllBurn] = useState(false);

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const pCurrent = useMemo(() => periodFromTimestamp(Date.now(), 0), []);
  const pNext = useMemo(() => periodFromTimestamp(Date.now(), 1), []);
  const currentYearPrefix = String(new Date().getFullYear());

  const pendingList = useMemo(() => bonuses.filter((b) => b.status === 'pending_approval'), [bonuses]);
  const queuedList = useMemo(() => bonuses.filter((b) => b.status === 'approved_queued'), [bonuses]);
  const paidYtdList = useMemo(
    () => bonuses.filter((b) => b.status === 'paid' && b.payrollPeriod.startsWith(currentYearPrefix)),
    [bonuses, currentYearPrefix],
  );

  const pendingTotalAed = useMemo(() => pendingList.reduce((s, b) => s + b.amountAed, 0), [pendingList]);
  const queuedTotalAed = useMemo(() => queuedList.reduce((s, b) => s + b.amountAed, 0), [queuedList]);
  const paidYtdTotalAed = useMemo(() => paidYtdList.reduce((s, b) => s + b.amountAed, 0), [paidYtdList]);

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
      existing.annualPoolAed += Math.max(12_000, Math.round(row.annualFixedAed * (row.band.targetBonusPct / 100) * 0.35));
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
        b.paidAed + b.queuedAed + b.pendingAed - (a.paidAed + a.queuedAed + a.pendingAed) || b.annualPoolAed - a.annualPoolAed,
    );
  }, [bonuses, compReport.rows, currentYearPrefix]);

  // Award mix (this year, excluding declined)
  const mixRows = useMemo(() => {
    const rows = KINDS.map((kind) => {
      const list = bonuses.filter((b) => b.kind === kind && b.status !== 'declined' && b.payrollPeriod.startsWith(currentYearPrefix));
      return { kind, count: list.length, amountAed: list.reduce((s, b) => s + b.amountAed, 0) };
    });
    return rows.sort((a, b) => b.amountAed - a.amountAed);
  }, [bonuses, currentYearPrefix]);
  const maxMixAed = Math.max(1, ...mixRows.map((m) => m.amountAed));

  const statusCounts = useMemo(() => {
    const counts: Record<'all' | BonusStatus, number> = { all: bonuses.length, pending_approval: 0, approved_queued: 0, paid: 0, declined: 0 };
    for (const b of bonuses) counts[b.status] += 1;
    return counts;
  }, [bonuses]);

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
    toast.result(res, decision === 'approved_queued' ? 'Bonus approved & queued into payroll' : 'Bonus declined');
  };

  const burnRows = showAllBurn ? deptBurnRows : deptBurnRows.slice(0, BURN_PREVIEW);

  return (
    <div className="py-view">
      <NeoKpis label="Variable pay at a glance">
        <NeoKpi
          icon={<Clock />}
          label="Pending sign-off"
          value={compactAed(pendingTotalAed)}
          sub={`${pluralize(pendingList.length, 'nomination')} awaiting review`}
          tone={pendingList.length ? 'warning' : undefined}
        />
        <NeoKpi
          icon={<Sparkles />}
          label="Queued for payday"
          value={compactAed(queuedTotalAed)}
          sub={`${pluralize(queuedList.length, 'approved award')} · ${formatPeriodLabel(pCurrent)}`}
          to="/payroll"
          title="Open the pay run"
        />
        <NeoKpi
          icon={<CheckCircle2 />}
          label={`Paid YTD ${currentYearPrefix}`}
          value={compactAed(paidYtdTotalAed)}
          sub={`${pluralize(paidYtdList.length, 'award')} settled on payslips`}
        />
        <NeoKpi icon={<TrendingUp />} label="Committed YTD" value={compactAed(paidYtdTotalAed + queuedTotalAed)} sub="Paid + approved queued" />
      </NeoKpis>

      <NeoHome
        sideLabel="Variable pay budget"
        main={
          /* Four-Eyes Approval Queue */
          <NeoPanel
            hud="Needs you"
            title="Four-eyes approval queue"
            actions={<span className={pendingList.length ? 'neo-count neo-count--app' : 'neo-count'}>{pendingList.length}</span>}
          >
            <p className="py-panel-sub">Separation of duties: nominators and recipients can never approve their own awards.</p>
            {pendingList.length === 0 ? (
              <NeoEmpty
                compact
                icon={<ShieldCheck />}
                title="All bonus nominations reviewed"
                action={
                  caps.canNominateBonus ? (
                    <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => setNominateOpen(true)}>
                      <Plus /> Nominate a teammate
                    </button>
                  ) : undefined
                }
              >
                Approved awards flow straight into the employee’s monthly pay run.
              </NeoEmpty>
            ) : (
              <div className="py-awards neo-stagger">
                {pendingList.map((b, i) => {
                  const recipient = userById.get(b.userId);
                  const nominator = userById.get(b.nominatedBy);
                  const gate = canDecideBonus(caps.viewer, b);
                  const targetPeriod = periodById[b.id] || b.payrollPeriod || pCurrent;

                  return (
                    <article key={b.id} className="py-award" style={{ '--i': i } as CSSProperties}>
                      <header className="py-award__head">
                        {recipient && <Avatar user={recipient} size={38} />}
                        <div className="py-award__who">
                          <div className="py-award__name">
                            <b>{recipient?.name ?? b.userId}</b>
                            <KindChip kind={b.kind} size="sm" />
                          </div>
                          <div className="py-award__meta">
                            {recipient?.title ?? b.department} · {b.department} · nominated by <b>{nominator?.name ?? b.nominatedBy}</b>{' '}
                            {relativeTime(b.nominatedAt)}
                          </div>
                        </div>
                        <div className="py-award__amt">
                          <b>{formatAed(b.amountAed)}</b>
                          <span>{b.reference}</span>
                        </div>
                      </header>

                      <div>
                        <div className="py-award__title">{b.title}</div>
                        <blockquote className="py-quote">“{b.reason}”</blockquote>
                      </div>

                      {!gate.ok ? (
                        <div className="py-note" data-tone="warning">
                          <ShieldAlert />
                          <span>
                            <b>Separation of duties:</b> {gate.reason} Targets {formatPeriodLabel(targetPeriod)}.
                          </span>
                        </div>
                      ) : (
                        <footer className="py-award__foot">
                          <div className="py-award__decide">
                            <select
                              className="neo-select neo-select--sm"
                              value={targetPeriod}
                              onChange={(e) => setPeriodById((prev) => ({ ...prev, [b.id]: e.target.value }))}
                              aria-label="Target payroll period"
                            >
                              <option value={pCurrent}>{formatPeriodLabel(pCurrent)} · active</option>
                              <option value={pNext}>{formatPeriodLabel(pNext)} · next</option>
                            </select>
                            <input
                              type="text"
                              className="neo-input neo-input--sm"
                              value={noteById[b.id] ?? ''}
                              onChange={(e) => setNoteById((prev) => ({ ...prev, [b.id]: e.target.value }))}
                              placeholder="Optional decision note…"
                              aria-label="Decision note"
                            />
                          </div>
                          <div className="py-award__btns">
                            <button type="button" className="neo-btn neo-btn--danger neo-btn--sm" onClick={() => handleDecision(b, 'declined')}>
                              <XCircle /> Decline
                            </button>
                            <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={() => handleDecision(b, 'approved_queued')}>
                              <ShieldCheck /> Approve & queue
                            </button>
                          </div>
                        </footer>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </NeoPanel>
        }
        side={
          <>
            {/* Department Variable Pay Burn Bars */}
            <NeoPanel
              hud={`Budget burn · ${currentYearPrefix}`}
              title="Pool burn by department"
              actions={
                deptBurnRows.length > BURN_PREVIEW ? (
                  <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => setShowAllBurn((v) => !v)} aria-expanded={showAllBurn}>
                    {showAllBurn ? 'Top 6' : `All ${deptBurnRows.length}`}
                  </button>
                ) : undefined
              }
            >
              <div className="py-legend" aria-hidden="true">
                <span>
                  <i className="py-dot" data-tone="app" /> Paid
                </span>
                <span>
                  <i className="py-dot" data-tone="cyan" /> Queued
                </span>
                <span>
                  <i className="py-dot" data-tone="amber" /> Pending
                </span>
              </div>
              <div className="py-burn">
                {burnRows.map((d) => {
                  const totalUsed = d.paidAed + d.queuedAed + d.pendingAed;
                  const denom = Math.max(d.annualPoolAed, totalUsed, 1);
                  const burnPct = Math.round((totalUsed / Math.max(1, d.annualPoolAed)) * 100);
                  return (
                    <div key={d.department} className="py-burn__row">
                      <div className="py-burn__head">
                        <b>{d.department}</b>
                        <span className="py-burn__fig" data-over={burnPct > 100 || undefined}>
                          {compactAed(totalUsed)} / {compactAed(d.annualPoolAed)} · <em>{burnPct}%</em>
                        </span>
                      </div>
                      <div
                        className="py-seg"
                        role="img"
                        aria-label={`${d.department}: paid ${formatAed(d.paidAed)}, queued ${formatAed(d.queuedAed)}, pending ${formatAed(d.pendingAed)} of ${formatAed(d.annualPoolAed)} pool`}
                      >
                        {d.paidAed > 0 && <i data-tone="app" style={{ width: `${(d.paidAed / denom) * 100}%` }} title={`Paid: ${formatAed(d.paidAed)}`} />}
                        {d.queuedAed > 0 && (
                          <i data-tone="cyan" style={{ width: `${(d.queuedAed / denom) * 100}%` }} title={`Queued: ${formatAed(d.queuedAed)}`} />
                        )}
                        {d.pendingAed > 0 && (
                          <i data-tone="amber" style={{ width: `${(d.pendingAed / denom) * 100}%` }} title={`Pending: ${formatAed(d.pendingAed)}`} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </NeoPanel>

            {/* Award mix by type */}
            <NeoPanel hud={`Mix · ${currentYearPrefix}`} title="By award type">
              <div className="py-mix">
                {mixRows.map((m) => (
                  <div key={m.kind} className="py-mix__row">
                    <div className="py-mix__head">
                      <KindChip kind={m.kind} size="sm" />
                      <span className="py-mix__count">{pluralize(m.count, 'award')}</span>
                      <b className="py-mix__amt">{compactAed(m.amountAed)}</b>
                    </div>
                    <Bar value={m.amountAed / maxMixAed} fill={BONUS_KIND_META[m.kind].color} label={`${BONUS_KIND_META[m.kind].label} share`} />
                  </div>
                ))}
              </div>
            </NeoPanel>
          </>
        }
      />

      {/* Queued & Historical Awards Ledger */}
      <NeoPanel flush hud="Audit log" title="Variable pay ledger" actions={<span className="neo-count">{filteredLedger.length}</span>}>
        <p className="py-panel-sub">Spot awards, SLO milestones, signing tranches and performance bonuses — each with its four-eyes approver.</p>
        <div className="py-toolbar">
          <NeoSearch
            size="sm"
            className="py-toolbar__search"
            value={search}
            onChange={setSearch}
            placeholder="Search reference, employee, award…"
            label="Search the variable pay ledger"
          />
          <NeoTabs
            value={statusFilter}
            onChange={setStatusFilter}
            label="Filter by status"
            items={STATUS_TABS.map((t) => ({ value: t.id, label: t.label, count: statusCounts[t.id] }))}
          />
        </div>
        <div className="py-toolbar py-toolbar--chips" role="group" aria-label="Filter by award type">
          <Chip size="lg" tone="app" onClick={() => setKindFilter('all')} pressed={kindFilter === 'all'}>
            All types
          </Chip>
          {KINDS.map((k) => (
            <KindChip key={k} kind={k} size="lg" onClick={() => setKindFilter(k)} pressed={kindFilter === k} />
          ))}
        </div>

        {filteredLedger.length === 0 ? (
          <NeoEmpty compact icon={<Search />} title="No bonus awards match your filters">
            Reset the status or award-type filter to see every variable pay award.
          </NeoEmpty>
        ) : (
          <div className="neo-table-wrap">
            <table className="neo-table py-table py-table--ledger">
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Type</th>
                  <th>Award & citation</th>
                  <th>Nominated · signed off</th>
                  <th>Period</th>
                  <th className="is-right">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredLedger.map((b) => {
                  const recipient = userById.get(b.userId);
                  const nominator = userById.get(b.nominatedBy);
                  const decider = b.decidedBy ? userById.get(b.decidedBy) : undefined;
                  const statusMeta = BONUS_STATUS_META[b.status];
                  return (
                    <tr key={b.id}>
                      <td>
                        <div className="py-person">
                          {recipient && <Avatar user={recipient} size={30} />}
                          <div className="py-person__text">
                            <b>{recipient?.name ?? b.userId}</b>
                            <span className="py-mono">
                              {b.reference} · {b.department}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <KindChip kind={b.kind} size="sm" />
                      </td>
                      <td className="py-cell-wide">
                        <div className="py-cell-title">{b.title}</div>
                        <div className="py-cell-sub clamp-2">{b.reason}</div>
                      </td>
                      <td>
                        <div className="py-cell-sub">
                          Nom <b>{nominator?.name ?? b.nominatedBy}</b>
                        </div>
                        {decider && (
                          <div className="py-cell-sub">
                            4-eyes <b>{decider.name}</b>
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="py-ccy">{b.payrollPeriod}</span>
                        {b.paidRunId && <div className="py-sub">Run {b.paidRunId}</div>}
                      </td>
                      <td className="is-right">
                        <span className="py-amt py-amt--net">{formatAed(b.amountAed)}</span>
                      </td>
                      <td>
                        <Chip size="sm" tone={statusMeta.tone}>
                          {statusMeta.label}
                        </Chip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="py-panel-foot">
          <Award /> Nominate from the header — awards always pass four-eyes before they reach a payslip.
        </div>
      </NeoPanel>

      <NominateBonusModal open={nominateOpen} onClose={() => setNominateOpen(false)} />
    </div>
  );
}
