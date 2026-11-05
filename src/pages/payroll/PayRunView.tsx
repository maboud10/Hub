import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  Banknote,
  Building2,
  Check,
  CheckCircle2,
  Download,
  ExternalLink,
  FileCode2,
  FileSpreadsheet,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  Users,
  Wallet,
} from 'lucide-react';
import { canCounterSignRun, canDisburseRun } from '@/payroll/access';
import { generatePayrollCsv, generateWpsSif } from '@/payroll/engine';
import { useLivePayrollRuns, usePayrollCaps } from '@/payroll/selectors';
import { usePayroll } from '@/payroll/store';
import type { PayrollEmployeeLine, PayrollRun } from '@/payroll/types';
import { useExpenses } from '@/expenses/store';
import { useHr } from '@/hr/store';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { formatDateTime } from '@/lib/format';
import { Modal } from '@/components/ui/Modal';
import { Avatar, EmptyState } from '@/components/ui/primitives';
import {
  ALLOWANCE_LABELS,
  downloadTextFile,
  formatAed,
  formatMoney,
  RUN_STATUS_META,
  WpsSifModal,
} from './shared';

type RegisterFilter = 'all' | 'variance' | 'bonus' | 'reimbursement';

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

  const counterSignGate = useMemo(
    () => canCounterSignRun(caps.viewer, activeRun),
    [caps.viewer, activeRun],
  );
  const disburseGate = useMemo(
    () => canDisburseRun(caps.viewer, activeRun),
    [caps.viewer, activeRun],
  );

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

  const selectedEmp = selectedLine ? userById.get(selectedLine.userId) : undefined;
  const linkedBonuses = useMemo(
    () =>
      selectedLine
        ? bonuses.filter((b) => selectedLine.bonusIds.includes(b.id))
        : [],
    [bonuses, selectedLine],
  );
  const linkedExpenses = useMemo(
    () =>
      selectedLine
        ? expenseReports.filter((r) => selectedLine.expenseReportIds.includes(r.id))
        : [],
    [expenseReports, selectedLine],
  );
  const linkedHrClaims = useMemo(
    () =>
      selectedLine
        ? hrClaims.filter((c) => selectedLine.hrClaimIds.includes(c.id))
        : [],
    [hrClaims, selectedLine],
  );

  if (!activeRun) {
    return (
      <EmptyState icon={<Wallet />} title="No payroll runs initialized">
        Refresh the Payroll Console to generate your active monthly pay run.
      </EmptyState>
    );
  }

  const currentStage = RUN_STATUS_META[activeRun.status].step;
  const isSelfPrepared =
    activeRun.status === 'pending_signoff' &&
    Boolean(caps.viewer && activeRun.preparedBy === caps.viewer.userId);

  const settledExpenseCount = activeRun.lines.reduce(
    (sum, l) => sum + l.expenseReportIds.length,
    0,
  );
  const settledHrClaimCount = activeRun.lines.reduce((sum, l) => sum + l.hrClaimIds.length, 0);
  const settledBonusCount = activeRun.lines.reduce((sum, l) => sum + l.bonusIds.length, 0);

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

  const handleSaveAdjustment = (e: React.FormEvent) => {
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

  const stages = [
    {
      step: 1 as const,
      title: '1. Draft & Live Sync',
      desc: 'Pulls HR comp, pro-rata, leave, T&E claims & bonuses',
    },
    {
      step: 2 as const,
      title: '2. Four-Eyes Sign-Off',
      desc: 'Independent People Ops / Finance counter-signature',
    },
    {
      step: 3 as const,
      title: '3. WPS Bank File Ready',
      desc: 'Inspect & export UAE Central Bank .SIF & .CSV',
    },
    {
      step: 4 as const,
      title: '4. Disbursed & Payslips Live',
      desc: 'Batch settled & official payslips published to HR Portal',
    },
  ];

  const canEditAdjustment =
    caps.canRun && (activeRun.status === 'draft' || activeRun.status === 'pending_signoff');

  return (
    <div className="stack stack--lg" style={{ minWidth: 0 }}>
      {/* Period Switcher Pills */}
      <div className="py-period-bar">
        <div className="py-period-pills" role="tablist" aria-label="Payroll periods">
          {runs.map((r, idx) => {
            const isSelected = r.period === activeRun.period;
            const meta = RUN_STATUS_META[r.status];
            return (
              <button
                key={r.period}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={cx('py-period-pill', isSelected && 'is-active')}
                onClick={() => setSelectedPeriod(r.period)}
              >
                <span
                  className={cx(
                    'dot',
                    r.status === 'paid'
                      ? 'dot--online'
                      : r.status === 'approved_ready'
                        ? 'dot--maintenance'
                        : r.status === 'pending_signoff'
                          ? 'dot--away'
                          : 'dot--offline',
                  )}
                />
                <span>
                  {r.label}
                  {idx === 0 ? ' (Active)' : ''}
                </span>
                <span className={`badge badge--${meta.badge}`}>{meta.label}</span>
                <span className="py-period-pill__meta">{formatAed(r.totalNetAed)}</span>
              </button>
            );
          })}
        </div>

        <div className="row row--wrap" style={{ gap: 8 }}>
          <span className="tag">Cut-off {activeRun.cutoffDate}</span>
          <span className="tag">Payday {activeRun.payDate}</span>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => setSifModalOpen(true)}
          >
            <FileCode2 /> Inspect WPS .SIF
          </button>
        </div>
      </div>

      {/* Interactive 4-Stage Payday Control Stepper */}
      <section className="card py-stepper-card">
        <div className="py-stepper">
          {stages.map((st) => {
            const isDone =
              activeRun.status === 'paid' ? true : currentStage > st.step;
            const isCurrent =
              activeRun.status !== 'paid' && currentStage === st.step;
            return (
              <div
                key={st.step}
                className={cx(
                  'py-step',
                  isDone && 'is-done',
                  isCurrent && 'is-current',
                )}
              >
                <span className="py-step__num">
                  {isDone ? <Check size={14} strokeWidth={2.6} /> : st.step}
                </span>
                <div className="py-step__body">
                  <div className="py-step__title">{st.title}</div>
                  <div className="py-step__desc">{st.desc}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Stage 1: Draft & Live Sync */}
        {activeRun.status === 'draft' && (
          <div className="py-stage-panel">
            <div className="py-stage-panel__info">
              <div className="py-stage-panel__title">
                <Sparkles size={17} style={{ color: '#4ade80' }} />
                Stage 1 · Live Payroll Sync Active for {activeRun.label}
              </div>
              <p className="py-stage-panel__sub">
                Continuously reconciling {activeRun.headcount} active employee comp records, starter pro-rata, unpaid leave deductions, confirmed health/benefit shares,{' '}
                <b>{settledExpenseCount}</b> Finance-queued Travel & Expense report
                {settledExpenseCount === 1 ? '' : 's'}, <b>{settledHrClaimCount}</b> HR allowance claim
                {settledHrClaimCount === 1 ? '' : 's'}, and <b>{settledBonusCount}</b> approved bonus
                {settledBonusCount === 1 ? '' : 'es'}.
              </p>
              <div className="py-sync-tags">
                <span className="py-vpill py-vpill--pos">HR Base & Allowances Synced</span>
                <span className="py-vpill py-vpill--info">
                  T&E Reimbursements: {formatAed(activeRun.totalReimbursementsAed)}
                </span>
                <span className="py-vpill py-vpill--pos">
                  Approved Bonuses: {formatAed(activeRun.totalVariableBonusesAed)}
                </span>
              </div>
            </div>

            <div className="py-stage-panel__actions">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  syncActiveRun();
                  toast.info(`Re-synced ${activeRun.label} with live HR & T&E stores`);
                }}
              >
                <RefreshCw /> Sync Now
              </button>
              <button
                type="button"
                className="btn py-btn-emerald"
                disabled={!caps.canRun}
                title={!caps.canRun ? 'Requires payroll.run or hr.people.manage permission' : undefined}
                onClick={() => {
                  const res = submitRunForSignoff(activeRun.period);
                  toast.result(res, 'Submitted run for four-eyes sign-off');
                }}
              >
                <Send /> Submit for Four-Eyes Sign-Off
              </button>
            </div>
          </div>
        )}

        {/* Stage 2: Four-Eyes Counter-Sign */}
        {activeRun.status === 'pending_signoff' && (
          <div className="py-stage-panel">
            <div className="py-stage-panel__info">
              <div className="py-stage-panel__title">
                <ShieldCheck size={18} style={{ color: 'var(--warning)' }} />
                Stage 2 · Awaiting Four-Eyes Counter-Signature
                {preparerUser && (
                  <span className="py-actor-pill">
                    <Avatar user={preparerUser} size={20} />
                    Prepared by <b>{preparerUser.name}</b>
                    {activeRun.preparedAt ? ` · ${formatDateTime(activeRun.preparedAt)}` : ''}
                  </span>
                )}
              </div>
              <p className="py-stage-panel__sub">
                Verify variance flags, FX spot rates, and net disbursement ({formatAed(activeRun.totalNetAed)}) before unlocking the UAE Central Bank WPS batch file.
              </p>

              {!counterSignGate.ok ? (
                <div className="py-sod-banner">
                  <ShieldAlert />
                  <div>
                    <strong>Four-Eyes Separation of Duties:</strong>{' '}
                    {isSelfPrepared
                      ? preparerUser?.id === 'u-sara'
                        ? 'Prepared by you — switch persona to Daniel Okafor (Finance) or Layla Haddad (Admin) to counter-sign this pay run.'
                        : 'Prepared by you — switch persona to Sara Al Mansoori (People Ops) or Layla Haddad (Admin) to counter-sign this pay run.'
                      : counterSignGate.reason}
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 10, maxWidth: 480 }}>
                  <input
                    type="text"
                    className="input"
                    style={{ height: 36, fontSize: 13 }}
                    value={approvalNote}
                    onChange={(e) => setApprovalNote(e.target.value)}
                    placeholder="Optional sign-off note (e.g., Verified pro-rata, T&E queue & FX sheet)..."
                  />
                </div>
              )}
            </div>

            <div className="py-stage-panel__actions">
              {(caps.canRun || caps.canApprove) && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    const res = reopenRunToDraft(activeRun.period);
                    toast.result(res, 'Reopened to draft');
                  }}
                >
                  <RotateCcw /> Reopen to Draft
                </button>
              )}
              <button
                type="button"
                className="btn py-btn-emerald"
                disabled={!counterSignGate.ok}
                title={!counterSignGate.ok ? counterSignGate.reason : undefined}
                onClick={() => {
                  const res = approvePayRun(activeRun.period, approvalNote);
                  if (toast.result(res, 'Pay run counter-signed')) {
                    setApprovalNote('');
                  }
                }}
              >
                <ShieldCheck /> Counter-Sign & Approve Run
              </button>
            </div>
          </div>
        )}

        {/* Stage 3: WPS Bank File Ready */}
        {activeRun.status === 'approved_ready' && (
          <div className="py-stage-panel">
            <div className="py-stage-panel__info">
              <div className="py-stage-panel__title">
                <FileCode2 size={18} style={{ color: 'var(--info)' }} />
                Stage 3 · Four-Eyes Verified — WPS Bank Batch Ready
              </div>
              <div className="row row--wrap" style={{ gap: 8, marginTop: 8 }}>
                {preparerUser && (
                  <span className="py-actor-pill">
                    <Avatar user={preparerUser} size={20} />
                    Prepared: <b>{preparerUser.name}</b>
                  </span>
                )}
                {approverUser && (
                  <span className="py-actor-pill">
                    <Avatar user={approverUser} size={20} />
                    Counter-signed: <b>{approverUser.name}</b>
                  </span>
                )}
                {activeRun.approvalNote && (
                  <span className="text-xs muted">“{activeRun.approvalNote}”</span>
                )}
              </div>
              <p className="py-stage-panel__sub">
                Download or inspect the UAE Central Bank <code>.SIF</code> file and Payroll Register <code>.CSV</code>, then release payday to settle salaries, queued T&E reports, HR claims, and bonuses simultaneously.
              </p>
            </div>

            <div className="py-stage-panel__actions">
              {(caps.canRun || caps.canApprove) && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    const res = reopenRunToDraft(activeRun.period);
                    toast.result(res, 'Reopened to draft');
                  }}
                >
                  <RotateCcw /> Reopen to Draft
                </button>
              )}
              <button type="button" className="btn btn--sm" onClick={() => setSifModalOpen(true)}>
                <FileCode2 /> Preview .SIF
              </button>
              <button type="button" className="btn btn--sm" onClick={handleDownloadSif}>
                <Download /> Download .SIF
              </button>
              <button type="button" className="btn btn--sm" onClick={handleDownloadCsv}>
                <FileSpreadsheet /> Export .CSV
              </button>
              <button
                type="button"
                className="btn py-btn-emerald"
                disabled={!disburseGate.ok}
                title={!disburseGate.ok ? disburseGate.reason : undefined}
                onClick={() => {
                  const res = disbursePayRun(activeRun.period);
                  toast.result(res, 'Payday disbursed!');
                }}
              >
                <Banknote /> Release Payday & Disburse WPS
              </button>
            </div>
          </div>
        )}

        {/* Stage 4: Disbursed & Payslips Live */}
        {activeRun.status === 'paid' && (
          <div className="py-stage-panel py-stage-panel--paid">
            <div className="py-stage-panel__info">
              <div className="py-stage-panel__title">
                <CheckCircle2 size={19} style={{ color: '#4ade80' }} />
                Payday Settled · {activeRun.label} Disbursed via UAE WPS
                {activeRun.wpsBatchRef && (
                  <span className="badge badge--success mono">{activeRun.wpsBatchRef}</span>
                )}
              </div>
              <div className="row row--wrap" style={{ gap: 8, marginTop: 8 }}>
                {preparerUser && (
                  <span className="py-actor-pill">
                    <Avatar user={preparerUser} size={20} />
                    Prepared: <b>{preparerUser.name}</b>
                  </span>
                )}
                {approverUser && (
                  <span className="py-actor-pill">
                    <Avatar user={approverUser} size={20} />
                    Signed off: <b>{approverUser.name}</b>
                  </span>
                )}
                {disburserUser && (
                  <span className="py-actor-pill">
                    <Avatar user={disburserUser} size={20} />
                    Released: <b>{disburserUser.name}</b>
                    {activeRun.disbursedAt ? ` · ${formatDateTime(activeRun.disbursedAt)}` : ''}
                  </span>
                )}
              </div>
              <p className="py-stage-panel__sub">
                Settled <b>{formatAed(activeRun.totalNetAed)}</b> net across <b>{activeRun.headcount}</b> employees — including{' '}
                <b>{settledExpenseCount}</b> T&E claim{settledExpenseCount === 1 ? '' : 's'} +{' '}
                <b>{settledHrClaimCount}</b> HR allowance{settledHrClaimCount === 1 ? '' : 's'} ({formatAed(activeRun.totalReimbursementsAed)}) and{' '}
                <b>{settledBonusCount}</b> bonus award{settledBonusCount === 1 ? '' : 's'} ({formatAed(activeRun.totalVariableBonusesAed)}). Official itemised payslips are live in the HR Portal.
              </p>
            </div>

            <div className="py-stage-panel__actions">
              <button type="button" className="btn btn--sm" onClick={() => setSifModalOpen(true)}>
                <FileCode2 /> WPS .SIF
              </button>
              <button type="button" className="btn btn--sm" onClick={handleDownloadCsv}>
                <Download /> Register .CSV
              </button>
              <button
                type="button"
                className="btn py-btn-emerald"
                onClick={() => navigate('/hr/documents?tab=payslips')}
              >
                Inspect HR Portal Payslips <ArrowRight />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Payroll Breakdown KPI Strip */}
      <section className="py-kpi-grid" aria-label="Payroll run breakdown">
        <div className="py-kpi">
          <div className="py-kpi__label">
            <span>Headcount Paid</span>
            <Users />
          </div>
          <div className="py-kpi__val">{activeRun.headcount}</div>
          <div className="py-kpi__foot">{filterCounts.variance} with period variance flags</div>
        </div>

        <div className="py-kpi">
          <div className="py-kpi__label">
            <span>Fixed Salaries & Allowances</span>
            <Building2 />
          </div>
          <div className="py-kpi__val">{formatAed(activeRun.totalFixedAed)}</div>
          <div className="py-kpi__foot">Basic + Housing + Transport</div>
        </div>

        <div className="py-kpi">
          <div className="py-kpi__label">
            <span>Bonuses & Variable Pay</span>
            <Award />
          </div>
          <div className="py-kpi__val">{formatAed(activeRun.totalVariableBonusesAed)}</div>
          <div className="py-kpi__foot">
            {settledBonusCount} award{settledBonusCount === 1 ? '' : 's'} in {activeRun.period}
          </div>
        </div>

        <div className="py-kpi">
          <div className="py-kpi__label">
            <span>Tax-Free Reimbursements</span>
            <Receipt />
          </div>
          <div className="py-kpi__val">{formatAed(activeRun.totalReimbursementsAed)}</div>
          <div className="py-kpi__foot">
            {settledExpenseCount} T&E + {settledHrClaimCount} HR claims
          </div>
        </div>

        <div className="py-kpi">
          <div className="py-kpi__label">
            <span>Total Deductions</span>
            <TrendingDown />
          </div>
          <div className="py-kpi__val">−{formatAed(activeRun.totalDeductionsAed)}</div>
          <div className="py-kpi__foot">Pension, benefit share & unpaid leave</div>
        </div>

        <div className="py-kpi py-kpi--highlight">
          <div className="py-kpi__label">
            <span>Total Net Disbursement</span>
            <Wallet />
          </div>
          <div className="py-kpi__val">{formatAed(activeRun.totalNetAed)}</div>
          <div className="py-kpi__foot">Gross {formatAed(activeRun.totalGrossAed)}</div>
        </div>
      </section>

      {/* Filterable Employee Pay Register Table */}
      <section className="card py-table-card">
        <div className="py-table-card__head">
          <div>
            <h2 className="section-title" style={{ margin: 0 }}>
              Employee Pay Register · {activeRun.label}
              <span className="count">{filteredLines.length}</span>
            </h2>
            <p className="text-xs muted" style={{ marginTop: 3 }}>
              Click any employee row to inspect their itemised payslip, linked T&E / bonus references, or apply a one-off adjustment.
            </p>
          </div>

          <div className="row row--wrap" style={{ gap: 8 }}>
            <button type="button" className="btn btn--sm" onClick={() => setSifModalOpen(true)}>
              <FileCode2 /> WPS .SIF
            </button>
            <button type="button" className="btn btn--sm" onClick={handleDownloadCsv}>
              <Download /> Export .CSV
            </button>
          </div>
        </div>

        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
          <div className="py-toolbar" style={{ marginBottom: 0 }}>
            <div className="py-toolbar__left">
              <div className="input-wrap py-search">
                <Search />
                <input
                  type="search"
                  className="input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search employee, dept, hub, currency..."
                />
              </div>

              <div className="chips" style={{ maskImage: 'none', flexWrap: 'wrap' }}>
                {(
                  [
                    { id: 'all', label: 'All', count: filterCounts.all },
                    { id: 'variance', label: 'Has Variance / Flags', count: filterCounts.variance },
                    { id: 'bonus', label: 'Has Bonus', count: filterCounts.bonus },
                    { id: 'reimbursement', label: 'Has Reimbursement', count: filterCounts.reimbursement },
                  ] as const
                ).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={cx('chip', filter === c.id && 'is-active')}
                    onClick={() => setFilter(c.id)}
                  >
                    {c.label}
                    <span className="count">{c.count}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {filteredLines.length === 0 ? (
          <EmptyState icon={<Search />} title="No matching employee lines">
            Clear your search or variance filter to see all {activeRun.headcount} employees in {activeRun.label}.
          </EmptyState>
        ) : (
          <div className="py-table-wrap">
            <table className="py-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Currency / FX</th>
                  <th className="is-right">Fixed Pay</th>
                  <th className="is-right">Bonuses</th>
                  <th className="is-right">T&E + HR Claims</th>
                  <th className="is-right">Deductions</th>
                  <th className="is-right">Net Pay (AED & Local)</th>
                  <th>Bank · IBAN</th>
                  <th>Variance & Line Flags</th>
                </tr>
              </thead>
              <tbody>
                {filteredLines.map((line) => {
                  const emp = userById.get(line.userId);
                  const fixedAed = line.baseAed + line.housingAed + line.transportAed;
                  const reimbAed = line.expenseReimbursementsAed + line.hrClaimsAed;
                  return (
                    <tr
                      key={line.userId}
                      className="py-row-clickable"
                      onClick={() => openEmployeeDrawer(line)}
                    >
                      <td>
                        <div className="py-emp-cell">
                          {emp && <Avatar user={emp} size={34} />}
                          <div className="py-emp-cell__meta">
                            <div className="py-emp-cell__name">{emp?.name ?? line.userId}</div>
                            <div className="py-emp-cell__sub">
                              {line.department} · {line.location}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="tag">{line.localCurrency}</span>
                        <div className="py-num-sub">
                          {line.localCurrency === 'AED'
                            ? '1.0000 PEG'
                            : `1 ${line.localCurrency} = ${line.fxToAed} AED`}
                        </div>
                      </td>

                      <td className="is-right">
                        <div className="py-num">{formatAed(fixedAed)}</div>
                        {line.proRataFraction < 1 && (
                          <div className="py-num-sub" style={{ color: 'var(--warning)' }}>
                            {Math.round(line.proRataFraction * 100)}% pro-rata
                          </div>
                        )}
                      </td>

                      <td className="is-right">
                        {line.bonusesAed > 0 ? (
                          <span className="py-num" style={{ color: 'var(--success)', fontWeight: 600 }}>
                            +{formatAed(line.bonusesAed)}
                          </span>
                        ) : (
                          <span className="faint mono">—</span>
                        )}
                      </td>

                      <td className="is-right">
                        {reimbAed > 0 ? (
                          <div>
                            <div className="py-num" style={{ color: 'var(--info)', fontWeight: 600 }}>
                              +{formatAed(reimbAed)}
                            </div>
                            <div className="py-num-sub">
                              {line.expenseReimbursementsAed > 0 && 'T&E'}
                              {line.expenseReimbursementsAed > 0 && line.hrClaimsAed > 0 && ' + '}
                              {line.hrClaimsAed > 0 && 'HR'}
                            </div>
                          </div>
                        ) : (
                          <span className="faint mono">—</span>
                        )}
                      </td>

                      <td className="is-right">
                        <div className="py-num muted">−{formatAed(line.totalDeductionsAed)}</div>
                        {line.unpaidLeaveDays > 0 && (
                          <div className="py-num-sub" style={{ color: 'var(--danger)' }}>
                            {line.unpaidLeaveDays}d unpaid leave
                          </div>
                        )}
                      </td>

                      <td className="is-right">
                        <div className="py-num py-num--net">{formatAed(line.netAed)}</div>
                        {line.localCurrency !== 'AED' && (
                          <div className="py-num-sub">
                            {formatMoney(line.netLocal, line.localCurrency)}
                          </div>
                        )}
                      </td>

                      <td>
                        <div className="text-xs" style={{ fontWeight: 550 }}>
                          {line.bankName}
                        </div>
                        <div className="py-num-sub">•••• {line.ibanLast4}</div>
                      </td>

                      <td>
                        {line.varianceFlags.length === 0 ? (
                          <span className="py-vpill">Baseline · 0% var</span>
                        ) : (
                          <div className="py-variance-pills">
                            {line.varianceFlags.map((flag, idx) => {
                              const isNeg = flag.includes('−') || flag.toLowerCase().includes('pro-rata');
                              const isReimb = flag.includes('T&E') || flag.includes('HR allowance');
                              return (
                                <span
                                  key={idx}
                                  className={cx(
                                    'py-vpill',
                                    isNeg
                                      ? 'py-vpill--warn'
                                      : isReimb
                                        ? 'py-vpill--info'
                                        : 'py-vpill--pos',
                                  )}
                                >
                                  {flag}
                                </span>
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
      </section>

      {/* WPS .SIF Inspector Modal */}
      <WpsSifModal
        open={sifModalOpen}
        onClose={() => setSifModalOpen(false)}
        run={activeRun}
        users={users}
      />

      {/* Employee Payslip & One-Off Line Adjustment Modal */}
      <Modal
        open={Boolean(selectedLine)}
        onClose={() => setSelectedLineUserId(null)}
        width={680}
        icon={selectedEmp ? <Avatar user={selectedEmp} size={40} /> : <Wallet />}
        title={
          selectedEmp
            ? `${selectedEmp.name} · ${activeRun.label} Payslip`
            : `Employee Payslip · ${activeRun.label}`
        }
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
                className="btn btn--ghost"
                onClick={() => {
                  setSelectedLineUserId(null);
                  navigate('/hr/documents?tab=payslips');
                }}
              >
                <ExternalLink /> View in HR Portal
              </button>
            )}
            <button
              type="button"
              className="btn py-btn-emerald"
              onClick={() => setSelectedLineUserId(null)}
            >
              Done
            </button>
          </>
        }
      >
        {selectedLine && (
          <div className="stack">
            <div className="py-net-banner">
              <div>
                <div className="text-xs muted mono">NET DISBURSEMENT ({activeRun.payDate})</div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 24,
                    fontWeight: 700,
                    marginTop: 2,
                  }}
                >
                  {formatAed(selectedLine.netAed, 2)}
                </div>
                {selectedLine.localCurrency !== 'AED' && (
                  <div className="text-xs muted mono">
                    Local Payout: {formatMoney(selectedLine.netLocal, selectedLine.localCurrency, 2)} (@ {selectedLine.fxToAed} AED/{selectedLine.localCurrency})
                  </div>
                )}
              </div>

              <div style={{ textAlign: 'right' }}>
                <div className="text-xs muted">Disbursement Account</div>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{selectedLine.bankName}</div>
                <div className="mono text-xs muted">IBAN •••• {selectedLine.ibanLast4}</div>
              </div>
            </div>

            <div className="py-payslip-grid">
              {/* Earnings Box */}
              <div className="py-payslip-box">
                <div className="py-payslip-box__title">Earnings & Reimbursements</div>
                <div className="py-line-row">
                  <span>
                    Basic Salary
                    {selectedLine.proRataFraction < 1
                      ? ` (${Math.round(selectedLine.proRataFraction * 100)}% pro-rata)`
                      : ''}
                  </span>
                  <span className="py-num">{formatAed(selectedLine.baseAed, 2)}</span>
                </div>
                <div className="py-line-row">
                  <span>Housing Allowance</span>
                  <span className="py-num">{formatAed(selectedLine.housingAed, 2)}</span>
                </div>
                <div className="py-line-row">
                  <span>Transport Allowance</span>
                  <span className="py-num">{formatAed(selectedLine.transportAed, 2)}</span>
                </div>
                {selectedLine.bonusesAed > 0 && (
                  <div className="py-line-row" style={{ color: 'var(--success)' }}>
                    <span>Variable Bonus Awards ({selectedLine.bonusIds.length})</span>
                    <span className="py-num">+{formatAed(selectedLine.bonusesAed, 2)}</span>
                  </div>
                )}
                {selectedLine.expenseReimbursementsAed > 0 && (
                  <div className="py-line-row" style={{ color: 'var(--info)' }}>
                    <span>T&E Reimbursements ({selectedLine.expenseReportIds.length})</span>
                    <span className="py-num">
                      +{formatAed(selectedLine.expenseReimbursementsAed, 2)}
                    </span>
                  </div>
                )}
                {selectedLine.hrClaimsAed > 0 && (
                  <div className="py-line-row" style={{ color: 'var(--info)' }}>
                    <span>HR Benefit Claims ({selectedLine.hrClaimIds.length})</span>
                    <span className="py-num">+{formatAed(selectedLine.hrClaimsAed, 2)}</span>
                  </div>
                )}
                {selectedLine.manualAdjustmentAed > 0 && (
                  <div className="py-line-row" style={{ color: 'var(--success)' }}>
                    <span>One-Off Credit Adjustment</span>
                    <span className="py-num">
                      +{formatAed(selectedLine.manualAdjustmentAed, 2)}
                    </span>
                  </div>
                )}
                <div className="py-line-row py-line-row--total">
                  <span>Total Gross</span>
                  <span className="py-num">{formatAed(selectedLine.grossAed, 2)}</span>
                </div>
              </div>

              {/* Deductions Box */}
              <div className="py-payslip-box">
                <div className="py-payslip-box__title">Statutory & Benefit Deductions</div>
                <div className="py-line-row">
                  <span>Pension / Social Security</span>
                  <span className="py-num">−{formatAed(selectedLine.pensionDeductionAed, 2)}</span>
                </div>
                <div className="py-line-row">
                  <span>Health & Dependent Plan Share</span>
                  <span className="py-num">
                    −{formatAed(selectedLine.benefitsDeductionAed, 2)}
                  </span>
                </div>
                <div className="py-line-row">
                  <span>
                    Unpaid Leave
                    {selectedLine.unpaidLeaveDays > 0
                      ? ` (${selectedLine.unpaidLeaveDays}d)`
                      : ' (0d)'}
                  </span>
                  <span className="py-num">
                    −{formatAed(selectedLine.unpaidLeaveDeductionAed, 2)}
                  </span>
                </div>
                {selectedLine.manualAdjustmentAed < 0 && (
                  <div className="py-line-row" style={{ color: 'var(--danger)' }}>
                    <span>One-Off Debit Adjustment</span>
                    <span className="py-num">
                      −{formatAed(Math.abs(selectedLine.manualAdjustmentAed), 2)}
                    </span>
                  </div>
                )}
                <div className="py-line-row py-line-row--total">
                  <span>Total Deductions</span>
                  <span className="py-num">
                    −{formatAed(selectedLine.totalDeductionsAed, 2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Linked Source Items (Expenses, Bonuses, HR Claims) */}
            {(linkedBonuses.length > 0 ||
              linkedExpenses.length > 0 ||
              linkedHrClaims.length > 0) && (
              <div className="py-payslip-box">
                <div className="py-payslip-box__title">Linked Source Records in This Run</div>
                <div className="stack stack--sm">
                  {linkedBonuses.map((b) => (
                    <div key={b.id} className="row row--between text-xs">
                      <span>
                        <span className="tag">{b.reference}</span> <b>{b.title}</b>
                      </span>
                      <span className="mono" style={{ color: 'var(--success)' }}>
                        +{formatAed(b.amountAed)}
                      </span>
                    </div>
                  ))}
                  {linkedExpenses.map((r) => (
                    <div key={r.id} className="row row--between text-xs">
                      <span>
                        <span className="tag">{r.reference}</span> <b>{r.title}</b> ({r.costCenter})
                      </span>
                      <span className="mono" style={{ color: 'var(--info)' }}>
                        +{formatAed(r.reimbursableAed)}
                      </span>
                    </div>
                  ))}
                  {linkedHrClaims.map((cl) => (
                    <div key={cl.id} className="row row--between text-xs">
                      <span>
                        <span className="tag">HR CLAIM</span>{' '}
                        <b>{ALLOWANCE_LABELS[cl.allowance]}</b> · {cl.merchant}
                      </span>
                      <span className="mono" style={{ color: 'var(--info)' }}>
                        +{formatAed(cl.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Inline One-Off Payroll Adjustment Form */}
            {canEditAdjustment ? (
              <form className="py-payslip-box stack stack--sm" onSubmit={handleSaveAdjustment}>
                <div className="row row--between">
                  <div className="py-payslip-box__title" style={{ marginBottom: 0 }}>
                    <SlidersHorizontal size={12} style={{ verticalAlign: '-2px', marginRight: 5 }} />
                    One-Off Payroll Adjustment ({activeRun.period})
                  </div>
                  {selectedLine.manualAdjustmentAed !== 0 && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={handleClearAdjustment}
                    >
                      Clear Adjustment
                    </button>
                  )}
                </div>
                <div className="py-form-grid">
                  <label className="field">
                    <span className="field-label">Amount AED (+ credit / − deduction)</span>
                    <input
                      type="number"
                      step="50"
                      className="input mono"
                      value={adjAmount}
                      onChange={(e) => setAdjAmount(e.target.value)}
                      placeholder="e.g. 1500 or -500"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Audit Reason</span>
                    <input
                      type="text"
                      className="input"
                      value={adjNote}
                      onChange={(e) => setAdjNote(e.target.value)}
                      placeholder="e.g. On-call holiday stipend or retro adjustment"
                    />
                  </label>
                </div>
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <button type="submit" className="btn btn--sm py-btn-emerald">
                    Apply Line Adjustment
                  </button>
                </div>
              </form>
            ) : (
              selectedLine.manualAdjustmentNote && (
                <div className="py-sod-banner">
                  <AlertTriangle />
                  <div>
                    <strong>Manual Adjustment ({formatAed(selectedLine.manualAdjustmentAed)}):</strong>{' '}
                    {selectedLine.manualAdjustmentNote}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
