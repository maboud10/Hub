/**
 * Pay run — home of the Payday deck. The Payday tracker (NeoTracker) with stage
 * actions, the gross → net composition, the four-eyes audit trail, the WPS
 * bank file and the filterable employee pay register (payslip + one-off
 * adjustment dialog). Period-level summaries live in the shell's HUD ribbon.
 */
import { useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Check,
  Download,
  ExternalLink,
  FileCode2,
  FileSpreadsheet,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { canCounterSignRun, canDisburseRun } from '@/payroll/access';
import { generatePayrollCsv, generateWpsSif } from '@/payroll/engine';
import { useLivePayrollRuns, usePayrollCaps } from '@/payroll/selectors';
import { usePayroll } from '@/payroll/store';
import type { PayrollEmployeeLine, PayrollRun } from '@/payroll/types';
import type { User } from '@/types';
import { useExpenses } from '@/expenses/store';
import { useHr } from '@/hr/store';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { formatDateTime, pluralize, relativeTime } from '@/lib/format';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/primitives';
import { Bar, Chip, NeoEmpty, NeoHome, NeoPanel, NeoSearch, NeoTabs, Orb, type NeoTabItem, type Tone } from '@/components/neo';
import {
  ALLOWANCE_LABELS,
  compactAed,
  downloadTextFile,
  formatAed,
  formatMoney,
  RUN_STATUS_META,
  shortPeriodLabel,
  WpsSifModal,
} from './shared';
import { PaydayTracker } from './trackers';

type RegisterFilter = 'all' | 'variance' | 'bonus' | 'reimbursement';
type StepState = 'done' | 'active' | 'todo';

const sumBy = <T,>(list: T[], pick: (x: T) => number) => list.reduce((s, x) => s + pick(x), 0);
const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

interface Breakdown {
  adjustmentsAed: number;
  pensionAed: number;
  benefitsAed: number;
  leaveAed: number;
  debitsAed: number;
  expenseCount: number;
  hrClaimCount: number;
  bonusCount: number;
  banks: Array<{ name: string; count: number; netAed: number }>;
  currencies: Array<{ code: string; count: number }>;
}

export function PayRunView() {
  const navigate = useNavigate();
  const users = useHub((s) => s.users);
  const caps = usePayrollCaps();
  const runs = useLivePayrollRuns();
  const bonuses = usePayroll((s) => s.bonuses);
  const expenseReports = useExpenses((s) => s.reports);
  const hrClaims = useHr((s) => s.claims);

  const syncActiveRun = usePayroll((s) => s.syncActiveRun);
  const submitRunForSignoff = usePayroll((s) => s.submitRunForSignoff);
  const approvePayRun = usePayroll((s) => s.approvePayRun);
  const reopenRunToDraft = usePayroll((s) => s.reopenRunToDraft);
  const disbursePayRun = usePayroll((s) => s.disbursePayRun);
  const setLineAdjustment = usePayroll((s) => s.setLineAdjustment);

  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [approvalNote, setApprovalNote] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<RegisterFilter>('all');
  const [sifModalOpen, setSifModalOpen] = useState(false);
  const [selectedLineUserId, setSelectedLineUserId] = useState<string | null>(null);

  // Adjustment form state inside employee modal
  const [adjAmount, setAdjAmount] = useState<string>('0');
  const [adjNote, setAdjNote] = useState<string>('');

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const activeRun: PayrollRun | undefined = useMemo(() => {
    if (!runs.length) return undefined;
    return runs.find((r) => r.period === selectedPeriod) ?? runs[0];
  }, [runs, selectedPeriod]);

  const selectedLine: PayrollEmployeeLine | undefined = useMemo(() => {
    if (!activeRun || !selectedLineUserId) return undefined;
    return activeRun.lines.find((l) => l.userId === selectedLineUserId);
  }, [activeRun, selectedLineUserId]);

  const openEmployeeDrawer = (line: PayrollEmployeeLine) => {
    setSelectedLineUserId(line.userId);
    setAdjAmount(line.manualAdjustmentAed !== 0 ? String(line.manualAdjustmentAed) : '');
    setAdjNote(line.manualAdjustmentNote ?? '');
  };

  const counterSignGate = useMemo(() => canCounterSignRun(caps.viewer, activeRun), [caps.viewer, activeRun]);
  const disburseGate = useMemo(() => canDisburseRun(caps.viewer, activeRun), [caps.viewer, activeRun]);

  const preparerUser = activeRun?.preparedBy ? userById.get(activeRun.preparedBy) : undefined;
  const approverUser = activeRun?.approvedBy ? userById.get(activeRun.approvedBy) : undefined;
  const disburserUser = activeRun?.disbursedBy ? userById.get(activeRun.disbursedBy) : undefined;

  const filterCounts = useMemo(() => {
    const list = activeRun?.lines ?? [];
    return {
      all: list.length,
      variance: list.filter((l) => l.varianceFlags.length > 0).length,
      bonus: list.filter((l) => l.bonusesAed > 0).length,
      reimbursement: list.filter((l) => l.expenseReimbursementsAed + l.hrClaimsAed > 0).length,
    };
  }, [activeRun]);

  const filteredLines = useMemo(() => {
    if (!activeRun) return [];
    const q = search.trim().toLowerCase();
    return activeRun.lines.filter((line) => {
      if (filter === 'variance' && line.varianceFlags.length === 0) return false;
      if (filter === 'bonus' && line.bonusesAed <= 0) return false;
      if (filter === 'reimbursement' && line.expenseReimbursementsAed + line.hrClaimsAed <= 0) {
        return false;
      }
      if (!q) return true;
      const emp = userById.get(line.userId);
      const hay = [
        emp?.name,
        emp?.employeeId,
        emp?.title,
        line.department,
        line.location,
        line.localCurrency,
        line.bankName,
        ...line.varianceFlags,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [activeRun, filter, search, userById]);

  const breakdown: Breakdown | null = useMemo(() => {
    if (!activeRun) return null;
    const lines = activeRun.lines;
    const bankMap = new Map<string, { name: string; count: number; netAed: number }>();
    const ccyMap = new Map<string, number>();
    for (const l of lines) {
      const bank = bankMap.get(l.bankName) ?? { name: l.bankName, count: 0, netAed: 0 };
      bank.count += 1;
      bank.netAed += l.netAed;
      bankMap.set(l.bankName, bank);
      ccyMap.set(l.localCurrency, (ccyMap.get(l.localCurrency) ?? 0) + 1);
    }
    return {
      adjustmentsAed: Math.max(
        0,
        activeRun.totalGrossAed - activeRun.totalFixedAed - activeRun.totalVariableBonusesAed - activeRun.totalReimbursementsAed,
      ),
      pensionAed: sumBy(lines, (l) => l.pensionDeductionAed),
      benefitsAed: sumBy(lines, (l) => l.benefitsDeductionAed),
      leaveAed: sumBy(lines, (l) => l.unpaidLeaveDeductionAed),
      debitsAed: sumBy(lines, (l) => Math.max(0, -l.manualAdjustmentAed)),
      expenseCount: sumBy(lines, (l) => l.expenseReportIds.length),
      hrClaimCount: sumBy(lines, (l) => l.hrClaimIds.length),
      bonusCount: sumBy(lines, (l) => l.bonusIds.length),
      banks: [...bankMap.values()].sort((a, b) => b.netAed - a.netAed),
      currencies: [...ccyMap.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
    };
  }, [activeRun]);

  const selectedEmp = selectedLine ? userById.get(selectedLine.userId) : undefined;
  const linkedBonuses = useMemo(
    () => (selectedLine ? bonuses.filter((b) => selectedLine.bonusIds.includes(b.id)) : []),
    [bonuses, selectedLine],
  );
  const linkedExpenses = useMemo(
    () => (selectedLine ? expenseReports.filter((r) => selectedLine.expenseReportIds.includes(r.id)) : []),
    [expenseReports, selectedLine],
  );
  const linkedHrClaims = useMemo(
    () => (selectedLine ? hrClaims.filter((c) => selectedLine.hrClaimIds.includes(c.id)) : []),
    [hrClaims, selectedLine],
  );

  if (!activeRun || !breakdown) {
    return (
      <NeoPanel>
        <NeoEmpty icon={<Wallet />} title="No payroll runs initialized">
          Refresh the Payroll Console to generate your active monthly pay run.
        </NeoEmpty>
      </NeoPanel>
    );
  }

  const isSelfPrepared =
    activeRun.status === 'pending_signoff' && Boolean(caps.viewer && activeRun.preparedBy === caps.viewer.userId);
  const prevRun = runs[runs.findIndex((r) => r.period === activeRun.period) + 1];

  const handleDownloadSif = () => {
    const sif = generateWpsSif(activeRun, users);
    downloadTextFile(`HELIX-WPS-${activeRun.period}.SIF`, sif, 'text/plain;charset=utf-8');
    toast.success(
      `Downloaded HELIX-WPS-${activeRun.period}.SIF`,
      `${activeRun.headcount} EDR records · ${formatAed(activeRun.totalNetAed)} net`,
    );
  };

  const handleDownloadCsv = () => {
    const csv = generatePayrollCsv(activeRun, users);
    downloadTextFile(`HELIX-PAYROLL-${activeRun.period}.csv`, csv, 'text/csv;charset=utf-8');
    toast.success(`Exported HELIX-PAYROLL-${activeRun.period}.csv`);
  };

  const handleSaveAdjustment = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedLine) return;
    const numeric = adjAmount.trim() === '' ? 0 : Number(adjAmount);
    if (!Number.isFinite(numeric)) {
      toast.error('Enter a valid AED adjustment amount');
      return;
    }
    const res = setLineAdjustment(activeRun.period, selectedLine.userId, numeric, adjNote);
    toast.result(res, 'Saved payroll adjustment');
  };

  const handleClearAdjustment = () => {
    if (!selectedLine) return;
    const res = setLineAdjustment(activeRun.period, selectedLine.userId, 0, '');
    if (toast.result(res, 'Cleared payroll adjustment')) {
      setAdjAmount('');
      setAdjNote('');
    }
  };

  const reopen = () => {
    const res = reopenRunToDraft(activeRun.period);
    toast.result(res, 'Reopened to draft');
  };

  const canEditAdjustment = caps.canRun && (activeRun.status === 'draft' || activeRun.status === 'pending_signoff');

  const periodTabs: NeoTabItem<string>[] = runs.map((r, idx) => ({
    value: r.period,
    label: shortPeriodLabel(r.period),
    icon: <Orb tone={RUN_STATUS_META[r.status].tone} pulse={idx === 0 && r.status !== 'paid'} size={7} />,
    title: `${r.label}${idx === 0 ? ' (active)' : ''} · ${RUN_STATUS_META[r.status].label} · ${formatAed(r.totalNetAed)} net`,
  }));

  /* ---------- Stage card (actions for the current step) ---------- */
  let stage: ReactNode = null;
  if (activeRun.status === 'draft') {
    stage = (
      <StageCard
        tone="app"
        icon={<RefreshCw />}
        title={`Live payroll sync is running for ${activeRun.label}`}
        actions={
          <>
            <button
              type="button"
              className="neo-btn neo-btn--soft"
              onClick={() => {
                syncActiveRun();
                toast.info(`Re-synced ${activeRun.label} with live HR & T&E stores`);
              }}
            >
              <RefreshCw /> Sync now
            </button>
            <button
              type="button"
              className="neo-btn neo-btn--plasma"
              disabled={!caps.canRun}
              title={!caps.canRun ? 'Requires payroll.run or hr.people.manage permission' : undefined}
              onClick={() => {
                const res = submitRunForSignoff(activeRun.period);
                toast.result(res, 'Submitted run for four-eyes sign-off');
              }}
            >
              <Send /> Submit for sign-off
            </button>
          </>
        }
      >
        <p className="py-stage__text">
          Reconciling {activeRun.headcount} employee comp records, starter pro-rata, unpaid leave and confirmed benefit shares — plus{' '}
          <b>{pluralize(breakdown.expenseCount, 'queued T&E report')}</b>, <b>{pluralize(breakdown.hrClaimCount, 'HR allowance claim')}</b> and{' '}
          <b>{pluralize(breakdown.bonusCount, 'approved bonus', 'approved bonuses')}</b>.
        </p>
        <div className="py-stage__meta">
          <Chip size="sm" tone="success" icon={<Check />}>
            HR base & allowances synced
          </Chip>
          <Chip size="sm" tone="cyan">
            Reimbursements {formatAed(activeRun.totalReimbursementsAed)}
          </Chip>
          <Chip size="sm" tone="amber">
            Bonuses {formatAed(activeRun.totalVariableBonusesAed)}
          </Chip>
        </div>
      </StageCard>
    );
  } else if (activeRun.status === 'pending_signoff') {
    stage = (
      <StageCard
        tone="warning"
        icon={<ShieldCheck />}
        title="Awaiting counter-signature"
        actions={
          <>
            {(caps.canRun || caps.canApprove) && (
              <button type="button" className="neo-btn neo-btn--ghost" onClick={reopen}>
                <RotateCcw /> Reopen
              </button>
            )}
            <button
              type="button"
              className="neo-btn neo-btn--plasma"
              disabled={!counterSignGate.ok}
              title={!counterSignGate.ok ? counterSignGate.reason : undefined}
              onClick={() => {
                const res = approvePayRun(activeRun.period, approvalNote);
                if (toast.result(res, 'Pay run counter-signed')) {
                  setApprovalNote('');
                }
              }}
            >
              <ShieldCheck /> Counter-sign & approve
            </button>
          </>
        }
      >
        <p className="py-stage__text">
          Verify variance flags, FX spot rates and the <b>{formatAed(activeRun.totalNetAed)}</b> net disbursement before the UAE Central Bank WPS file
          unlocks.
        </p>
        {!counterSignGate.ok ? (
          <div className="py-note" data-tone="warning">
            <ShieldAlert />
            <span>
              <b>Separation of duties:</b>{' '}
              {isSelfPrepared
                ? preparerUser?.id === 'u-sara'
                  ? 'Prepared by you — switch persona to Daniel Okafor (Finance) or Layla Haddad (Admin) to counter-sign this pay run.'
                  : 'Prepared by you — switch persona to Sara Al Mansoori (People Ops) or Layla Haddad (Admin) to counter-sign this pay run.'
                : counterSignGate.reason}
            </span>
          </div>
        ) : (
          <input
            type="text"
            className="neo-input neo-input--sm py-stage__input"
            value={approvalNote}
            onChange={(e) => setApprovalNote(e.target.value)}
            placeholder="Optional sign-off note (e.g., Verified pro-rata, T&E queue & FX sheet)…"
            aria-label="Sign-off note"
          />
        )}
      </StageCard>
    );
  } else if (activeRun.status === 'approved_ready') {
    stage = (
      <StageCard
        tone="cyan"
        icon={<FileCode2 />}
        title="Four-eyes verified — WPS batch ready"
        actions={
          <>
            {(caps.canRun || caps.canApprove) && (
              <button type="button" className="neo-btn neo-btn--ghost" onClick={reopen}>
                <RotateCcw /> Reopen
              </button>
            )}
            <button type="button" className="neo-btn neo-btn--soft" onClick={() => setSifModalOpen(true)}>
              <FileCode2 /> Preview .SIF
            </button>
            <button
              type="button"
              className="neo-btn neo-btn--plasma"
              disabled={!disburseGate.ok}
              title={!disburseGate.ok ? disburseGate.reason : undefined}
              onClick={() => {
                const res = disbursePayRun(activeRun.period);
                toast.result(res, 'Payday disbursed!');
              }}
            >
              <Banknote /> Release payday
            </button>
          </>
        }
      >
        <p className="py-stage__text">
          Inspect the <code>.SIF</code> and the payroll register, then release payday to settle salaries, queued T&E reports, HR claims and bonuses in
          one WPS batch.
        </p>
        {activeRun.approvalNote && <blockquote className="py-quote">“{activeRun.approvalNote}”</blockquote>}
      </StageCard>
    );
  } else {
    stage = (
      <StageCard
        tone="success"
        icon={<Banknote />}
        title={`${activeRun.label} disbursed via UAE WPS`}
        badge={activeRun.wpsBatchRef ? <span className="neo-chip neo-chip--sm py-mono-chip" data-tone="success">{activeRun.wpsBatchRef}</span> : undefined}
        actions={
          <>
            <button type="button" className="neo-btn neo-btn--ghost" onClick={handleDownloadCsv}>
              <Download /> Register .CSV
            </button>
            <button type="button" className="neo-btn neo-btn--plasma" onClick={() => navigate('/hr/documents?tab=payslips')}>
              Payslips <ArrowRight />
            </button>
          </>
        }
      >
        <p className="py-stage__text">
          Settled <b>{formatAed(activeRun.totalNetAed)}</b> net across <b>{activeRun.headcount}</b> employees — including{' '}
          <b>{pluralize(breakdown.expenseCount, 'T&E claim')}</b> + <b>{pluralize(breakdown.hrClaimCount, 'HR allowance')}</b> (
          {formatAed(activeRun.totalReimbursementsAed)}) and <b>{pluralize(breakdown.bonusCount, 'bonus award')}</b> (
          {formatAed(activeRun.totalVariableBonusesAed)}). Itemised payslips are live in the HR Portal.
        </p>
      </StageCard>
    );
  }

  return (
    <div className="py-view">
      <NeoHome
        sideLabel="Sign-off trail and bank file"
        main={
          <>
            <NeoPanel
              className="py-payday"
              hud="Payday control"
              title={`${activeRun.label} pay run`}
              actions={runs.length > 1 ? <NeoTabs value={activeRun.period} onChange={setSelectedPeriod} label="Payroll periods" items={periodTabs} /> : undefined}
            >
              <PaydayTracker run={activeRun} runs={runs} className="py-payday-trk" />
              {stage}
            </NeoPanel>
            <CompositionPanel run={activeRun} prevRun={prevRun} b={breakdown} />
          </>
        }
        side={
          <>
            <TrailPanel run={activeRun} preparer={preparerUser} approver={approverUser} disburser={disburserUser} />
            <BankFilePanel
              run={activeRun}
              b={breakdown}
              onInspect={() => setSifModalOpen(true)}
              onDownloadSif={handleDownloadSif}
              onDownloadCsv={handleDownloadCsv}
            />
          </>
        }
      />

      {/* Filterable employee pay register */}
      <NeoPanel
        flush
        className="py-register"
        hud={`Register · ${activeRun.label}`}
        title="Employee pay register"
        actions={
          <>
            <span className="neo-count" title="Lines shown">
              {filteredLines.length}
            </span>
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={handleDownloadCsv}>
              <FileSpreadsheet /> CSV
            </button>
          </>
        }
      >
        <p className="py-panel-sub">Open any row for the itemised payslip, linked T&E / bonus records and one-off adjustments.</p>
        <div className="py-toolbar">
          <NeoSearch
            size="sm"
            className="py-toolbar__search"
            value={search}
            onChange={setSearch}
            placeholder="Search employee, dept, hub, currency…"
            label="Search the pay register"
          />
          <NeoTabs
            value={filter}
            onChange={setFilter}
            label="Filter the pay register"
            items={[
              { value: 'all', label: 'All', count: filterCounts.all },
              { value: 'variance', label: 'Flags', count: filterCounts.variance, title: 'Lines with variance or line flags' },
              { value: 'bonus', label: 'Bonus', count: filterCounts.bonus, title: 'Lines with a bonus award' },
              { value: 'reimbursement', label: 'Claims', count: filterCounts.reimbursement, title: 'Lines with T&E or HR reimbursements' },
            ]}
          />
        </div>

        {filteredLines.length === 0 ? (
          <NeoEmpty compact icon={<Search />} title="No matching employee lines">
            Clear your search or filter to see all {activeRun.headcount} employees in {activeRun.label}.
          </NeoEmpty>
        ) : (
          <div className="neo-table-wrap">
            <table className="neo-table py-table py-table--register">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Currency</th>
                  <th className="is-right">Fixed</th>
                  <th className="is-right">Bonuses</th>
                  <th className="is-right">Claims</th>
                  <th className="is-right">Deductions</th>
                  <th className="is-right">Net pay</th>
                  <th>Bank</th>
                  <th>Flags</th>
                </tr>
              </thead>
              <tbody>
                {filteredLines.map((line) => {
                  const emp = userById.get(line.userId);
                  const fixedAed = line.baseAed + line.housingAed + line.transportAed;
                  const reimbAed = line.expenseReimbursementsAed + line.hrClaimsAed;
                  const onKey = (e: KeyboardEvent<HTMLTableRowElement>) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openEmployeeDrawer(line);
                    }
                  };
                  return (
                    <tr
                      key={line.userId}
                      className="py-row"
                      tabIndex={0}
                      onClick={() => openEmployeeDrawer(line)}
                      onKeyDown={onKey}
                      aria-label={`Open ${emp?.name ?? line.userId} payslip`}
                    >
                      <td>
                        <div className="py-person">
                          {emp && <Avatar user={emp} size={32} />}
                          <div className="py-person__text">
                            <b>{emp?.name ?? line.userId}</b>
                            <span>
                              {line.department} · {line.location}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="py-ccy">{line.localCurrency}</span>
                        <div className="py-sub">{line.localCurrency === 'AED' ? '1.0000 peg' : `1 ${line.localCurrency} = ${line.fxToAed} AED`}</div>
                      </td>
                      <td className="is-right">
                        <div className="py-amt">{formatAed(fixedAed)}</div>
                        {line.proRataFraction < 1 && (
                          <div className="py-sub" data-tone="warning">
                            {Math.round(line.proRataFraction * 100)}% pro-rata
                          </div>
                        )}
                      </td>
                      <td className="is-right">
                        {line.bonusesAed > 0 ? <span className="py-amt py-amt--plus">+{formatAed(line.bonusesAed)}</span> : <span className="py-nil">—</span>}
                      </td>
                      <td className="is-right">
                        {reimbAed > 0 ? (
                          <>
                            <div className="py-amt py-amt--claim">+{formatAed(reimbAed)}</div>
                            <div className="py-sub">
                              {line.expenseReimbursementsAed > 0 && 'T&E'}
                              {line.expenseReimbursementsAed > 0 && line.hrClaimsAed > 0 && ' + '}
                              {line.hrClaimsAed > 0 && 'HR'}
                            </div>
                          </>
                        ) : (
                          <span className="py-nil">—</span>
                        )}
                      </td>
                      <td className="is-right">
                        <div className="py-amt py-amt--minus">−{formatAed(line.totalDeductionsAed)}</div>
                        {line.unpaidLeaveDays > 0 && (
                          <div className="py-sub" data-tone="danger">
                            {line.unpaidLeaveDays}d unpaid leave
                          </div>
                        )}
                      </td>
                      <td className="is-right">
                        <div className="py-amt py-amt--net">{formatAed(line.netAed)}</div>
                        {line.localCurrency !== 'AED' && <div className="py-sub">{formatMoney(line.netLocal, line.localCurrency)}</div>}
                      </td>
                      <td>
                        <div className="py-bankcell">{line.bankName}</div>
                        <div className="py-sub">•••• {line.ibanLast4}</div>
                      </td>
                      <td>
                        {line.varianceFlags.length === 0 ? (
                          <Chip size="sm" tone="slate">
                            Baseline · 0% var
                          </Chip>
                        ) : (
                          <div className="py-flags">
                            {line.varianceFlags.map((flag, idx) => {
                              const isNeg = flag.includes('−') || flag.toLowerCase().includes('pro-rata');
                              const isReimb = flag.includes('T&E') || flag.includes('HR allowance');
                              return (
                                <Chip key={idx} size="sm" tone={isNeg ? 'warning' : isReimb ? 'cyan' : 'success'}>
                                  {flag}
                                </Chip>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </NeoPanel>

      {/* WPS .SIF Inspector Modal */}
      <WpsSifModal open={sifModalOpen} onClose={() => setSifModalOpen(false)} run={activeRun} users={users} />

      {/* Employee Payslip & One-Off Line Adjustment Modal */}
      <Modal
        open={Boolean(selectedLine)}
        onClose={() => setSelectedLineUserId(null)}
        width={680}
        className="py-modal"
        icon={selectedEmp ? <Avatar user={selectedEmp} size={40} /> : <Wallet />}
        title={selectedEmp ? `${selectedEmp.name} · ${activeRun.label} payslip` : `Employee payslip · ${activeRun.label}`}
        subtitle={
          selectedLine
            ? `${selectedEmp?.employeeId ?? selectedLine.userId} · ${selectedEmp?.title ?? ''} · ${selectedLine.department} (${selectedLine.location})`
            : undefined
        }
        footer={
          <>
            {activeRun.status === 'paid' && (
              <button
                type="button"
                className="neo-btn neo-btn--ghost"
                onClick={() => {
                  setSelectedLineUserId(null);
                  navigate('/hr/documents?tab=payslips');
                }}
              >
                <ExternalLink /> View in HR Portal
              </button>
            )}
            <button type="button" className="neo-btn neo-btn--plasma" onClick={() => setSelectedLineUserId(null)}>
              Done
            </button>
          </>
        }
      >
        {selectedLine && (
          <div className="py-modal__stack">
            <div className="py-net">
              <div>
                <div className="neo-hud">Net disbursement · value {activeRun.payDate}</div>
                <div className="py-net__val">{formatAed(selectedLine.netAed, 2)}</div>
                {selectedLine.localCurrency !== 'AED' && (
                  <div className="py-net__sub">
                    Local payout {formatMoney(selectedLine.netLocal, selectedLine.localCurrency, 2)} @ {selectedLine.fxToAed} AED/{selectedLine.localCurrency}
                  </div>
                )}
              </div>
              <div className="py-net__bank">
                <span className="neo-hud">Disbursement account</span>
                <b>{selectedLine.bankName}</b>
                <span className="py-net__sub">IBAN •••• {selectedLine.ibanLast4}</span>
              </div>
            </div>

            <div className="py-slip">
              {/* Earnings Box */}
              <div className="py-box">
                <div className="neo-hud">Earnings & reimbursements</div>
                <div className="py-line">
                  <span>
                    Basic salary
                    {selectedLine.proRataFraction < 1 ? ` (${Math.round(selectedLine.proRataFraction * 100)}% pro-rata)` : ''}
                  </span>
                  <span>{formatAed(selectedLine.baseAed, 2)}</span>
                </div>
                <div className="py-line">
                  <span>Housing allowance</span>
                  <span>{formatAed(selectedLine.housingAed, 2)}</span>
                </div>
                <div className="py-line">
                  <span>Transport allowance</span>
                  <span>{formatAed(selectedLine.transportAed, 2)}</span>
                </div>
                {selectedLine.bonusesAed > 0 && (
                  <div className="py-line" data-tone="success">
                    <span>Variable bonus awards ({selectedLine.bonusIds.length})</span>
                    <span>+{formatAed(selectedLine.bonusesAed, 2)}</span>
                  </div>
                )}
                {selectedLine.expenseReimbursementsAed > 0 && (
                  <div className="py-line" data-tone="info">
                    <span>T&E reimbursements ({selectedLine.expenseReportIds.length})</span>
                    <span>+{formatAed(selectedLine.expenseReimbursementsAed, 2)}</span>
                  </div>
                )}
                {selectedLine.hrClaimsAed > 0 && (
                  <div className="py-line" data-tone="info">
                    <span>HR benefit claims ({selectedLine.hrClaimIds.length})</span>
                    <span>+{formatAed(selectedLine.hrClaimsAed, 2)}</span>
                  </div>
                )}
                {selectedLine.manualAdjustmentAed > 0 && (
                  <div className="py-line" data-tone="success">
                    <span>One-off credit adjustment</span>
                    <span>+{formatAed(selectedLine.manualAdjustmentAed, 2)}</span>
                  </div>
                )}
                <div className="py-line py-line--total">
                  <span>Total gross</span>
                  <span>{formatAed(selectedLine.grossAed, 2)}</span>
                </div>
              </div>

              {/* Deductions Box */}
              <div className="py-box">
                <div className="neo-hud">Statutory & benefit deductions</div>
                <div className="py-line">
                  <span>Pension / social security</span>
                  <span>−{formatAed(selectedLine.pensionDeductionAed, 2)}</span>
                </div>
                <div className="py-line">
                  <span>Health & dependent plan share</span>
                  <span>−{formatAed(selectedLine.benefitsDeductionAed, 2)}</span>
                </div>
                <div className="py-line">
                  <span>Unpaid leave ({selectedLine.unpaidLeaveDays}d)</span>
                  <span>−{formatAed(selectedLine.unpaidLeaveDeductionAed, 2)}</span>
                </div>
                {selectedLine.manualAdjustmentAed < 0 && (
                  <div className="py-line" data-tone="danger">
                    <span>One-off debit adjustment</span>
                    <span>−{formatAed(Math.abs(selectedLine.manualAdjustmentAed), 2)}</span>
                  </div>
                )}
                <div className="py-line py-line--total">
                  <span>Total deductions</span>
                  <span>−{formatAed(selectedLine.totalDeductionsAed, 2)}</span>
                </div>
              </div>
            </div>

            {/* Linked Source Items (Expenses, Bonuses, HR Claims) */}
            {(linkedBonuses.length > 0 || linkedExpenses.length > 0 || linkedHrClaims.length > 0) && (
              <div className="py-box">
                <div className="neo-hud">Linked source records in this run</div>
                <div className="py-refs">
                  {linkedBonuses.map((b) => (
                    <div key={b.id} className="py-ref">
                      <span className="py-ref__l">
                        <span className="py-ref__tag">{b.reference}</span>
                        <b>{b.title}</b>
                      </span>
                      <span className="py-amt py-amt--plus">+{formatAed(b.amountAed)}</span>
                    </div>
                  ))}
                  {linkedExpenses.map((r) => (
                    <div key={r.id} className="py-ref">
                      <span className="py-ref__l">
                        <span className="py-ref__tag">{r.reference}</span>
                        <b>{r.title}</b>
                        <span className="py-ref__dim">{r.costCenter}</span>
                      </span>
                      <span className="py-amt py-amt--claim">+{formatAed(r.reimbursableAed)}</span>
                    </div>
                  ))}
                  {linkedHrClaims.map((cl) => (
                    <div key={cl.id} className="py-ref">
                      <span className="py-ref__l">
                        <span className="py-ref__tag">HR claim</span>
                        <b>{ALLOWANCE_LABELS[cl.allowance]}</b>
                        <span className="py-ref__dim">{cl.merchant}</span>
                      </span>
                      <span className="py-amt py-amt--claim">+{formatAed(cl.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Inline One-Off Payroll Adjustment Form */}
            {canEditAdjustment ? (
              <form className="py-box py-adjust" onSubmit={handleSaveAdjustment}>
                <div className="py-adjust__head">
                  <span className="neo-hud">
                    <SlidersHorizontal /> One-off adjustment · {activeRun.period}
                  </span>
                  {selectedLine.manualAdjustmentAed !== 0 && (
                    <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={handleClearAdjustment}>
                      Clear
                    </button>
                  )}
                </div>
                <div className="py-form-grid">
                  <label className="neo-field">
                    <span className="neo-label">Amount AED (+ credit / − deduction)</span>
                    <input
                      type="number"
                      step="50"
                      className="neo-input neo-input--sm neo-mono"
                      value={adjAmount}
                      onChange={(e) => setAdjAmount(e.target.value)}
                      placeholder="e.g. 1500 or -500"
                    />
                  </label>
                  <label className="neo-field">
                    <span className="neo-label">Audit reason</span>
                    <input
                      type="text"
                      className="neo-input neo-input--sm"
                      value={adjNote}
                      onChange={(e) => setAdjNote(e.target.value)}
                      placeholder="e.g. On-call holiday stipend or retro adjustment"
                    />
                  </label>
                </div>
                <div className="py-actions py-actions--end">
                  <button type="submit" className="neo-btn neo-btn--soft neo-btn--sm">
                    <Check /> Apply adjustment
                  </button>
                </div>
              </form>
            ) : (
              selectedLine.manualAdjustmentNote && (
                <div className="py-note" data-tone="warning">
                  <AlertTriangle />
                  <span>
                    <b>Manual adjustment ({formatAed(selectedLine.manualAdjustmentAed)}):</b> {selectedLine.manualAdjustmentNote}
                  </span>
                </div>
              )
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ==========================================================================
   Building blocks
   ========================================================================== */

function StageCard({
  tone,
  icon,
  title,
  badge,
  actions,
  children,
}: {
  tone: Tone;
  icon: ReactNode;
  title: string;
  badge?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="py-stage" data-tone={tone}>
      <span className="py-stage__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="py-stage__body">
        <h3 className="py-stage__title">
          {title}
          {badge}
        </h3>
        {children}
      </div>
      {actions && <div className="py-stage__actions">{actions}</div>}
    </div>
  );
}

/** Gross → net: earnings stack vs. what actually reaches employees, plus component tiles. */
function CompositionPanel({ run, prevRun, b }: { run: PayrollRun; prevRun?: PayrollRun; b: Breakdown }) {
  const gross = run.totalGrossAed;
  const delta = prevRun ? run.totalNetAed - prevRun.totalNetAed : 0;
  const deltaPct = prevRun && prevRun.totalNetAed > 0 ? (delta / prevRun.totalNetAed) * 100 : 0;

  const parts: Array<{ key: string; label: string; tone: Tone; value: number; sub: string; to?: string }> = [
    { key: 'fixed', label: 'Fixed pay', tone: 'app', value: run.totalFixedAed, sub: 'Basic + housing + transport' },
    { key: 'bonus', label: 'Bonuses', tone: 'amber', value: run.totalVariableBonusesAed, sub: pluralize(b.bonusCount, 'award'), to: '/payroll/bonuses' },
    {
      key: 'reimb',
      label: 'Reimbursements',
      tone: 'cyan',
      value: run.totalReimbursementsAed,
      sub: `${b.expenseCount} T&E · ${b.hrClaimCount} HR`,
      to: '/payroll/reimbursements',
    },
    { key: 'credit', label: 'Credits', tone: 'violet', value: b.adjustmentsAed, sub: 'One-off adjustments' },
  ];
  const shown = parts.filter((p) => p.key === 'fixed' || p.value > 0);
  const deductionBits = [
    b.pensionAed > 0 && `pension ${compactAed(b.pensionAed)}`,
    b.benefitsAed > 0 && `benefits ${compactAed(b.benefitsAed)}`,
    b.leaveAed > 0 && `leave ${compactAed(b.leaveAed)}`,
    b.debitsAed > 0 && `debits ${compactAed(b.debitsAed)}`,
  ].filter(Boolean);

  return (
    <NeoPanel
      hud="Gross → net"
      title="Where the money goes"
      actions={
        prevRun ? (
          <Chip
            size="sm"
            tone="slate"
            icon={delta >= 0 ? <TrendingUp /> : <TrendingDown />}
            title={`Net ${delta >= 0 ? '+' : '−'}${formatAed(Math.abs(delta))} vs ${prevRun.label}`}
          >
            {delta >= 0 ? '+' : '−'}
            {Math.abs(deltaPct).toFixed(1)}% vs {shortPeriodLabel(prevRun.period).split(' ')[0]}
          </Chip>
        ) : undefined
      }
    >
      <div className="py-flow">
        <div className="py-flow__row">
          <span className="neo-hud">Gross</span>
          <div className="py-seg py-seg--lg" role="img" aria-label={shown.map((p) => `${p.label} ${formatAed(p.value)}`).join(', ')}>
            {shown.map((p) => (
              <i key={p.key} data-tone={p.tone} style={{ flexGrow: Math.max(p.value, gross * 0.004) }} title={`${p.label}: ${formatAed(p.value)}`} />
            ))}
          </div>
          <b className="py-flow__val">{formatAed(gross)}</b>
        </div>
        <div className="py-flow__row">
          <span className="neo-hud">Net</span>
          <div className="py-seg py-seg--lg" role="img" aria-label={`Net ${formatAed(run.totalNetAed)}, deductions ${formatAed(run.totalDeductionsAed)}`}>
            <i data-tone="app" style={{ flexGrow: run.totalNetAed }} title={`Net: ${formatAed(run.totalNetAed)}`} />
            {run.totalDeductionsAed > 0 && (
              <i className="py-seg__cut" style={{ flexGrow: Math.max(run.totalDeductionsAed, gross * 0.004) }} title={`Deductions: ${formatAed(run.totalDeductionsAed)}`} />
            )}
          </div>
          <b className="py-flow__val">{formatAed(run.totalNetAed)}</b>
        </div>
      </div>
      <div className="py-tiles">
        {shown.map((p) => {
          const body = (
            <>
              <span className="py-tile__label">
                <i className="py-dot" data-tone={p.tone} aria-hidden="true" />
                {p.label}
                {p.to && <ArrowRight className="py-tile__go" aria-hidden="true" />}
              </span>
              <b className="py-tile__val">{formatAed(p.value)}</b>
              <span className="py-tile__sub">
                {p.sub} · {pct(p.value, gross).toFixed(1)}%
              </span>
            </>
          );
          return p.to ? (
            <Link key={p.key} to={p.to} className="py-tile py-tile--link">
              {body}
            </Link>
          ) : (
            <div key={p.key} className="py-tile">
              {body}
            </div>
          );
        })}
        <div className="py-tile">
          <span className="py-tile__label">
            <i className="py-dot py-dot--cut" aria-hidden="true" />
            Deductions
          </span>
          <b className="py-tile__val py-tile__val--minus">−{formatAed(run.totalDeductionsAed)}</b>
          <span className="py-tile__sub">{deductionBits.length ? deductionBits.join(' · ') : 'None this period'}</span>
        </div>
      </div>
    </NeoPanel>
  );
}

/** Four-eyes audit trail: prepared → counter-signed → released. */
function TrailPanel({ run, preparer, approver, disburser }: { run: PayrollRun; preparer?: User; approver?: User; disburser?: User }) {
  const s = run.status;
  const meta = RUN_STATUS_META[s];
  const signed = s === 'approved_ready' || s === 'paid';
  const items: Array<{
    key: string;
    icon: ReactNode;
    title: string;
    state: StepState;
    who?: User;
    at?: number;
    note?: string;
    ref?: string;
    wait: string;
  }> = [
    {
      key: 'prepared',
      icon: <Send />,
      title: 'Prepared & submitted',
      state: s === 'draft' ? 'active' : 'done',
      who: s === 'draft' ? undefined : preparer,
      at: s === 'draft' ? undefined : run.preparedAt,
      wait: s === 'draft' ? 'The preparer submits the synced draft for sign-off.' : 'Submitted for sign-off.',
    },
    {
      key: 'signed',
      icon: <ShieldCheck />,
      title: 'Counter-signed',
      state: signed ? 'done' : s === 'pending_signoff' ? 'active' : 'todo',
      who: signed ? approver : undefined,
      at: signed ? run.approvedAt : undefined,
      note: signed ? run.approvalNote : undefined,
      wait: signed ? 'Counter-signed.' : s === 'pending_signoff' ? 'Needs a second Payroll approver — never the preparer.' : 'Unlocks once the run is submitted.',
    },
    {
      key: 'released',
      icon: <Banknote />,
      title: 'Released to bank',
      state: s === 'paid' ? 'done' : s === 'approved_ready' ? 'active' : 'todo',
      who: s === 'paid' ? disburser : undefined,
      at: s === 'paid' ? run.disbursedAt : undefined,
      ref: s === 'paid' ? run.wpsBatchRef : undefined,
      wait: s === 'paid' ? 'Released.' : s === 'approved_ready' ? 'WPS batch is ready — release payday to settle.' : 'Unlocks after four-eyes sign-off.',
    },
  ];

  return (
    <NeoPanel
      hud="Audit trail"
      title="Four-eyes sign-off"
      actions={
        <Chip size="sm" tone={meta.tone}>
          {meta.label}
        </Chip>
      }
    >
      <ol className="py-trail">
        {items.map((it) => (
          <li key={it.key} className="py-trail__item" data-state={it.state}>
            <span className="py-trail__dot" aria-hidden="true">
              {it.state === 'done' ? <Check strokeWidth={2.6} /> : it.icon}
            </span>
            <div className="py-trail__body">
              <div className="py-trail__head">
                <b>{it.title}</b>
                {it.at ? (
                  <span className="py-trail__time" title={formatDateTime(it.at)}>
                    {relativeTime(it.at)}
                  </span>
                ) : null}
              </div>
              {it.who ? (
                <div className="py-trail__who">
                  <Avatar user={it.who} size={22} />
                  <span className="truncate">
                    <b>{it.who.name}</b> · {it.who.title}
                  </span>
                </div>
              ) : (
                <div className="py-trail__wait">{it.wait}</div>
              )}
              {it.note && <blockquote className="py-quote">“{it.note}”</blockquote>}
              {it.ref && (
                <span className="neo-chip neo-chip--sm py-mono-chip" data-tone="success">
                  {it.ref}
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </NeoPanel>
  );
}

/** WPS bank file: SIF facts, routing banks and payout currencies for the selected run. */
function BankFilePanel({
  run,
  b,
  onInspect,
  onDownloadSif,
  onDownloadCsv,
}: {
  run: PayrollRun;
  b: Breakdown;
  onInspect: () => void;
  onDownloadSif: () => void;
  onDownloadCsv: () => void;
}) {
  const top = b.banks.slice(0, 4);
  const rest = b.banks.slice(4);
  const restCount = rest.reduce((s, x) => s + x.count, 0);
  return (
    <NeoPanel
      hud="UAE WPS"
      title="Bank file"
      actions={
        <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={onInspect}>
          Inspect <ArrowRight />
        </button>
      }
    >
      <div className="py-minis">
        <div className="py-mini">
          <span className="neo-hud">EDR records</span>
          <b className="py-mini__val">{run.headcount}</b>
        </div>
        <div className="py-mini">
          <span className="neo-hud">Control total</span>
          <b className="py-mini__val">{compactAed(run.totalNetAed)}</b>
        </div>
        <div className="py-mini">
          <span className="neo-hud">Value date</span>
          <b className="py-mini__val py-mini__val--mono">{run.payDate}</b>
        </div>
      </div>

      <div className="neo-hud py-sect">Routing banks</div>
      <ul className="py-banks">
        {top.map((bank) => (
          <li key={bank.name}>
            <div className="py-bank__head">
              <b className="truncate">{bank.name}</b>
              <span>
                {bank.count} · {compactAed(bank.netAed)}
              </span>
            </div>
            <Bar value={bank.netAed / Math.max(1, run.totalNetAed)} label={`${bank.name} share of net pay`} />
          </li>
        ))}
        {restCount > 0 && (
          <li className="py-bank__more">
            + {pluralize(restCount, 'employee')} across {pluralize(rest.length, 'more bank')}
          </li>
        )}
      </ul>

      <div className="neo-hud py-sect">Payout currencies</div>
      <div className="py-chips">
        {b.currencies.map((c) => (
          <Chip key={c.code} size="sm" tone={c.code === 'AED' ? 'app' : 'slate'}>
            {c.code} · {c.count}
          </Chip>
        ))}
      </div>

      <div className="py-actions">
        <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={onDownloadSif}>
          <Download /> .SIF
        </button>
        <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={onDownloadCsv}>
          <FileSpreadsheet /> Register .CSV
        </button>
      </div>
    </NeoPanel>
  );
}
