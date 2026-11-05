import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Download,
  History,
  Landmark,
  Scale,
  Search,
  SlidersHorizontal,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { computeEosbLiability, fxToAedFor, type EmployeeCompRow } from '@/payroll/engine';
import { useCompReport, usePayrollCaps } from '@/payroll/selectors';
import { usePayroll } from '@/payroll/store';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { formatDateTime } from '@/lib/format';
import { Modal } from '@/components/ui/Modal';
import { Avatar, EmptyState } from '@/components/ui/primitives';
import { downloadTextFile, formatAed, formatMoney } from './shared';

const SCALE_MAX_AED = 80_000;

export function CompensationView() {
  const users = useHub((s) => s.users);
  const caps = usePayrollCaps();
  const report = useCompReport();
  const bands = usePayroll((s) => s.bands);
  const compHistory = usePayroll((s) => s.compHistory);
  const adjustBaseCompensation = usePayroll((s) => s.adjustBaseCompensation);

  const [tableFilter, setTableFilter] = useState<'all' | 'outliers'>('all');
  const [search, setSearch] = useState('');
  const [calibratingUserId, setCalibratingUserId] = useState<string | null>(null);
  const [newBaseLocal, setNewBaseLocal] = useState<string>('');
  const [calibReason, setCalibReason] = useState<string>('');

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const calibratingRow: EmployeeCompRow | undefined = useMemo(
    () =>
      calibratingUserId
        ? report.rows.find((r) => r.user.id === calibratingUserId)
        : undefined,
    [calibratingUserId, report.rows],
  );

  const openCalibration = (row: EmployeeCompRow) => {
    setCalibratingUserId(row.user.id);
    setNewBaseLocal(String(row.comp.baseMonthly));
    setCalibReason(
      row.bandPosition === 'below_band'
        ? `Market & band calibration into ${row.band.level} (${row.band.title}) range.`
        : '',
    );
  };

  const outlierIds = useMemo(
    () => new Set(report.outliers.map((o) => o.user.id)),
    [report.outliers],
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return report.rows.filter((r) => {
      if (tableFilter === 'outliers' && !outlierIds.has(r.user.id)) return false;
      if (!q) return true;
      const hay = [
        r.user.name,
        r.user.title,
        r.user.department,
        r.user.location,
        r.band.level,
        r.band.title,
        r.comp.currency,
        r.eosb.tierLabel,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [report.rows, tableFilter, outlierIds, search]);

  const handleExportCompCsv = () => {
    const headers = [
      'Employee ID',
      'Name',
      'Department',
      'Title',
      'Band',
      'Currency',
      'Base Monthly (Local)',
      'Monthly Fixed (AED)',
      'Band Min (AED)',
      'Band Mid (AED)',
      'Band Max (AED)',
      'Compa-Ratio',
      'Band Penetration %',
      'Band Position',
      'YTD Bonuses (AED)',
      'Annual Total Rewards (AED)',
      'Tenure (Yrs)',
      'EOSB Tier',
      'Accrued UAE EOSB (AED)',
    ];
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = filteredRows.map((r) =>
      [
        r.user.employeeId,
        r.user.name,
        r.user.department,
        r.user.title,
        r.band.level,
        r.comp.currency,
        r.comp.baseMonthly,
        r.monthlyFixedAed,
        r.band.minMonthlyFixedAed,
        r.band.midMonthlyFixedAed,
        r.band.maxMonthlyFixedAed,
        r.compaRatio.toFixed(2),
        r.bandPenetrationPct.toFixed(1),
        r.bandPosition,
        r.ytdBonusesAed,
        r.totalRewardsAnnualAed,
        r.eosb.tenureYears.toFixed(2),
        r.eosb.tierLabel,
        r.eosb.accruedAed,
      ]
        .map(esc)
        .join(','),
    );
    downloadTextFile(
      'HELIX-COMP-EQUITY-EOSB.csv',
      [headers.join(','), ...lines].join('\n'),
      'text/csv;charset=utf-8',
    );
    toast.success('Exported HELIX-COMP-EQUITY-EOSB.csv');
  };

  // Live preview inside Calibrate Base Pay modal
  const calibrationPreview = useMemo(() => {
    if (!calibratingRow) return null;
    const parsed = Number(newBaseLocal);
    const base = Number.isFinite(parsed) && parsed > 0 ? parsed : calibratingRow.comp.baseMonthly;
    const fx = fxToAedFor(calibratingRow.comp.currency);
    const newMonthlyFixedAed =
      Math.round(
        (base + calibratingRow.comp.housingMonthly + calibratingRow.comp.transportMonthly) *
          fx *
          100,
      ) / 100;
    const newCompa =
      Math.round((newMonthlyFixedAed / Math.max(1, calibratingRow.band.midMonthlyFixedAed)) * 100) /
      100;
    const newPos =
      newMonthlyFixedAed < calibratingRow.band.minMonthlyFixedAed
        ? 'below_band'
        : newMonthlyFixedAed > calibratingRow.band.maxMonthlyFixedAed
          ? 'above_band'
          : 'in_band';
    const newEosb = computeEosbLiability(calibratingRow.user, {
      ...calibratingRow.comp,
      baseMonthly: base,
    });
    return { fx, base, newMonthlyFixedAed, newCompa, newPos, newEosb };
  }, [calibratingRow, newBaseLocal]);

  const setTargetMonthlyFixedAed = (targetFixedAed: number) => {
    if (!calibratingRow) return;
    const fx = fxToAedFor(calibratingRow.comp.currency);
    const allowancesLocal =
      calibratingRow.comp.housingMonthly + calibratingRow.comp.transportMonthly;
    const requiredBaseLocal = Math.max(500, Math.round(targetFixedAed / fx - allowancesLocal));
    setNewBaseLocal(String(requiredBaseLocal));
  };

  const handleCalibrateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!calibratingRow) return;
    const res = adjustBaseCompensation(
      calibratingRow.user.id,
      Number(newBaseLocal),
      calibReason,
    );
    if (toast.result(res, 'Updated base compensation')) {
      setCalibratingUserId(null);
    }
  };

  const maxDeptRewards = useMemo(
    () => Math.max(1, ...report.byDepartment.map((d) => d.annualTotalRewardsAed)),
    [report.byDepartment],
  );

  return (
    <div className="stack stack--lg" style={{ minWidth: 0 }}>
      {/* Executive Compensation KPIs */}
      <section className="py-kpi-grid py-kpi-grid--5" aria-label="Executive compensation KPIs">
        <div className="py-kpi">
          <div className="py-kpi__label">
            <span>Monthly Fixed Run-Rate</span>
            <Wallet />
          </div>
          <div className="py-kpi__val">{formatAed(report.monthlyPayrollRunRateAed)}</div>
          <div className="py-kpi__foot">
            {report.headcount} salaried employees · {formatAed(report.annualFixedRunRateAed)}/yr
          </div>
        </div>

        <div className="py-kpi py-kpi--highlight">
          <div className="py-kpi__label">
            <span>Annual Total Rewards</span>
            <TrendingUp />
          </div>
          <div className="py-kpi__val">{formatAed(report.annualTotalRewardsAed)}</div>
          <div className="py-kpi__foot">Fixed + Benefits + YTD Bonuses</div>
        </div>

        <div className="py-kpi">
          <div className="py-kpi__label">
            <span>Median Compa-Ratio</span>
            <Scale />
          </div>
          <div className="py-kpi__val">{report.medianCompaRatio.toFixed(2)}x</div>
          <div className="py-kpi__foot">Target midpoint = 1.00x</div>
        </div>

        <div className="py-kpi">
          <div className="py-kpi__label">
            <span>In-Band Equity</span>
            <CheckCircle2 />
          </div>
          <div className="py-kpi__val">{report.inBandPct}%</div>
          <div className="py-kpi__foot">
            {report.outliers.length} actionable outlier{report.outliers.length === 1 ? '' : 's'}
          </div>
        </div>

        <div className="py-kpi">
          <div className="py-kpi__label">
            <span>Statutory UAE EOSB Liability</span>
            <Landmark />
          </div>
          <div className="py-kpi__val">{formatAed(report.totalEosbLiabilityAed)}</div>
          <div className="py-kpi__foot">21d/yr (1–5y) · 30d/yr (&gt;5y)</div>
        </div>
      </section>

      {/* Two-Column: Visual Salary Band Architecture + Departmental Total Rewards */}
      <div className="py-two-col">
        {/* Visual Salary Band Architecture (IC2 -> M4) */}
        <section className="card" style={{ minWidth: 0 }}>
          <div className="section-head">
            <div>
              <h2 className="section-title" style={{ margin: 0 }}>
                Salary Band Architecture (IC2 → M4)
              </h2>
              <p className="text-xs muted" style={{ marginTop: 3 }}>
                Monthly fixed AED ranges <code>[Min — Mid — Max]</code> with live employee markers. Click any marker to inspect or calibrate.
              </p>
            </div>
          </div>

          <div className="row row--wrap text-xs muted" style={{ gap: 14, marginBottom: 12 }}>
            <span className="row" style={{ gap: 5 }}>
              <span className="py-kind-pill__dot" style={{ background: '#fbbf24' }} /> Band Midpoint
            </span>
            <span className="row" style={{ gap: 5 }}>
              <span className="py-kind-pill__dot" style={{ background: '#4ade80' }} /> In-Band Employee
            </span>
            <span className="row" style={{ gap: 5 }}>
              <span className="py-kind-pill__dot" style={{ background: 'var(--danger)' }} /> Below Band (Calibration Alert)
            </span>
          </div>

          <div className="py-band-list">
            {bands.map((b) => {
              const members = report.rows.filter((r) => r.band.id === b.id);
              const leftPct = Math.min(95, (b.minMonthlyFixedAed / SCALE_MAX_AED) * 100);
              const widthPct = Math.max(
                4,
                ((b.maxMonthlyFixedAed - b.minMonthlyFixedAed) / SCALE_MAX_AED) * 100,
              );
              const midPct = Math.min(98, (b.midMonthlyFixedAed / SCALE_MAX_AED) * 100);

              return (
                <div key={b.id} className="py-band-row">
                  <div className="py-band-row__meta">
                    <div className="py-band-row__lvl">
                      <span>{b.level}</span>
                      <span className="tag">{b.track}</span>
                      <span className="badge badge--muted">{b.targetBonusPct}% bonus</span>
                    </div>
                    <div className="text-xs muted truncate" style={{ marginTop: 2 }}>
                      {b.title} ({members.length})
                    </div>
                  </div>

                  <div className="py-band-track">
                    <div
                      className="py-band-range"
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                    />
                    <div className="py-band-mid" style={{ left: `${midPct}%` }} />
                    {members.map((m) => {
                      const dotPct = Math.max(
                        2,
                        Math.min(98, (m.monthlyFixedAed / SCALE_MAX_AED) * 100),
                      );
                      return (
                        <button
                          key={m.user.id}
                          type="button"
                          className={cx(
                            'py-band-dot',
                            m.bandPosition === 'below_band' && 'py-band-dot--below',
                            m.bandPosition === 'above_band' && 'py-band-dot--above',
                          )}
                          style={{ left: `${dotPct}%` }}
                          title={`${m.user.name} · ${formatAed(m.monthlyFixedAed)}/mo · Compa ${m.compaRatio.toFixed(2)}x`}
                          aria-label={`Inspect ${m.user.name}`}
                          onClick={() => {
                            if (caps.canApprove) openCalibration(m);
                            else setSearch(m.user.name);
                          }}
                        />
                      );
                    })}
                  </div>

                  <div className="mono text-xs muted" style={{ textAlign: 'right' }}>
                    <div>
                      {Math.round(b.minMonthlyFixedAed / 1000)}k –{' '}
                      <b>{Math.round(b.midMonthlyFixedAed / 1000)}k</b> –{' '}
                      {Math.round(b.maxMonthlyFixedAed / 1000)}k
                    </div>
                    <div style={{ fontSize: 10.5 }}>AED / mo</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Total Rewards & Departmental Run-Rate Breakdown */}
        <section className="card" style={{ minWidth: 0 }}>
          <div className="section-head">
            <div>
              <h2 className="section-title" style={{ margin: 0 }}>
                <BarChart3 size={18} /> Departmental Total Rewards & EOSB
              </h2>
              <p className="text-xs muted" style={{ marginTop: 3 }}>
                Annualized fixed pay, employer medical/allowance benefits, YTD bonuses & accrued gratuity.
              </p>
            </div>
          </div>

          <div className="row row--wrap text-xs muted" style={{ gap: 12, marginBottom: 12 }}>
            <span className="row" style={{ gap: 5 }}>
              <span className="py-kind-pill__dot" style={{ background: '#10b981' }} /> Fixed Pay
            </span>
            <span className="row" style={{ gap: 5 }}>
              <span className="py-kind-pill__dot" style={{ background: '#38bdf8' }} /> Employer Benefits
            </span>
            <span className="row" style={{ gap: 5 }}>
              <span className="py-kind-pill__dot" style={{ background: '#fbbf24' }} /> YTD Bonuses
            </span>
          </div>

          <div className="py-dept-stack-list">
            {report.byDepartment.map((dept) => {
              const annualFixed = dept.monthlyFixedAed * 12;
              const annualBonus = dept.ytdBonusesAed;
              const annualBenefits = Math.max(
                0,
                dept.annualTotalRewardsAed - annualFixed - annualBonus,
              );
              const fixedW = (annualFixed / maxDeptRewards) * 100;
              const benW = (annualBenefits / maxDeptRewards) * 100;
              const bonW = (annualBonus / maxDeptRewards) * 100;

              return (
                <div key={dept.department} className="py-dept-stack">
                  <div className="row row--between row--wrap" style={{ gap: 6 }}>
                    <div>
                      <strong>{dept.department}</strong>{' '}
                      <span className="text-xs muted">({dept.headcount} staff)</span>
                    </div>
                    <span className="mono text-xs" style={{ fontWeight: 600 }}>
                      {formatAed(dept.annualTotalRewardsAed)}/yr
                    </span>
                  </div>

                  <div className="py-dept-stack__bar">
                    <div
                      className="py-dept-stack__seg--fixed"
                      style={{ width: `${fixedW}%` }}
                      title={`Annual Fixed: ${formatAed(annualFixed)}`}
                    />
                    <div
                      className="py-dept-stack__seg--benefits"
                      style={{ width: `${benW}%` }}
                      title={`Employer Benefits: ${formatAed(annualBenefits)}`}
                    />
                    {bonW > 0 && (
                      <div
                        className="py-dept-stack__seg--bonus"
                        style={{ width: `${bonW}%` }}
                        title={`YTD Bonuses: ${formatAed(annualBonus)}`}
                      />
                    )}
                  </div>

                  <div className="row row--between text-xs muted">
                    <span>Avg Compa: <b className="mono">{dept.avgCompaRatio.toFixed(2)}x</b></span>
                    <span>Accrued EOSB: <b className="mono">{formatAed(dept.eosbLiabilityAed)}</b></span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Pay Equity, Band Penetration & Statutory EOSB Table */}
      <section className="card py-table-card">
        <div className="py-table-card__head">
          <div>
            <h2 className="section-title" style={{ margin: 0 }}>
              Pay Equity, Band Penetration & Statutory UAE EOSB Ledger
              <span className="count">{filteredRows.length}</span>
            </h2>
            <p className="text-xs muted" style={{ marginTop: 3 }}>
              Highlights below-band retention risks and calculates statutory UAE Labour Law End-of-Service Benefits.
            </p>
          </div>
          <button type="button" className="btn btn--sm" onClick={handleExportCompCsv}>
            <Download /> Export CSV
          </button>
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
                  placeholder="Search employee, band, currency, EOSB tier..."
                />
              </div>

              <div className="chips" style={{ maskImage: 'none', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={cx('chip', tableFilter === 'all' && 'is-active')}
                  onClick={() => setTableFilter('all')}
                >
                  All Employees <span className="count">{report.rows.length}</span>
                </button>
                <button
                  type="button"
                  className={cx('chip', tableFilter === 'outliers' && 'is-active')}
                  onClick={() => setTableFilter('outliers')}
                >
                  <AlertTriangle size={14} style={{ color: 'var(--warning)' }} />
                  Actionable Outliers (&lt;0.88 or Out-of-Band)
                  <span className="count">{report.outliers.length}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {filteredRows.length === 0 ? (
          <EmptyState icon={<Scale />} title="No employees match this equity filter">
            Switch back to All Employees or clear the search query.
          </EmptyState>
        ) : (
          <div className="py-table-wrap">
            <table className="py-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Salary Band</th>
                  <th className="is-right">Local Base + Fixed AED</th>
                  <th>Band Penetration & Compa-Ratio</th>
                  <th className="is-right">Annual Total Rewards</th>
                  <th className="is-right">Tenure & Accrued UAE EOSB</th>
                  {caps.canApprove && <th className="is-right">Action</th>}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const clampedPen = Math.max(4, Math.min(100, row.bandPenetrationPct));
                  const isOutlier = outlierIds.has(row.user.id);

                  return (
                    <tr key={row.user.id}>
                      <td>
                        <div className="py-emp-cell">
                          <Avatar user={row.user} size={34} />
                          <div className="py-emp-cell__meta">
                            <div className="py-emp-cell__name">{row.user.name}</div>
                            <div className="py-emp-cell__sub">
                              {row.user.title} · {row.user.department}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          <span className="tag">{row.band.level}</span>
                          <span className="text-xs muted">
                            {Math.round(row.band.minMonthlyFixedAed / 1000)}k–
                            {Math.round(row.band.maxMonthlyFixedAed / 1000)}k
                          </span>
                        </div>
                        <div className="py-num-sub">{row.band.track} Track</div>
                      </td>

                      <td className="is-right">
                        <div className="py-num" style={{ fontWeight: 600 }}>
                          {formatAed(row.monthlyFixedAed)}/mo
                        </div>
                        <div className="py-num-sub">
                          Base {formatMoney(row.comp.baseMonthly, row.comp.currency)}
                        </div>
                      </td>

                      <td>
                        <div className="py-pen-cell">
                          <div className="row row--between">
                            <span
                              className={cx(
                                'badge',
                                row.bandPosition === 'below_band'
                                  ? 'badge--danger'
                                  : row.bandPosition === 'above_band'
                                    ? 'badge--warning'
                                    : row.compaRatio < 0.88
                                      ? 'badge--warning'
                                      : 'badge--success',
                              )}
                            >
                              {row.compaRatio.toFixed(2)}x ·{' '}
                              {row.bandPosition === 'below_band'
                                ? 'Below Band'
                                : row.bandPosition === 'above_band'
                                  ? 'Above Band'
                                  : `${Math.round(row.bandPenetrationPct)}% pen`}
                            </span>
                            {isOutlier && (
                              <span className="text-xs" style={{ color: 'var(--warning)', fontWeight: 600 }}>
                                Calibrate
                              </span>
                            )}
                          </div>
                          <div className="py-pen-bar">
                            <div
                              className={cx(
                                'py-pen-bar__fill',
                                row.bandPosition === 'below_band' && 'py-pen-bar__fill--below',
                                row.bandPosition === 'above_band' && 'py-pen-bar__fill--above',
                              )}
                              style={{ width: `${clampedPen}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="is-right">
                        <div className="py-num py-num--net">
                          {formatAed(row.totalRewardsAnnualAed)}
                        </div>
                        <div className="py-num-sub">
                          {row.ytdBonusesAed > 0
                            ? `Incl. ${formatAed(row.ytdBonusesAed)} bonus`
                            : 'Incl. benefits & allowances'}
                        </div>
                      </td>

                      <td className="is-right">
                        <div className="py-num" style={{ fontWeight: 600 }}>
                          {formatAed(row.eosb.accruedAed)}
                        </div>
                        <div className="py-num-sub">
                          {row.eosb.tenureYears.toFixed(1)} yrs · {row.eosb.tierLabel}
                        </div>
                      </td>

                      {caps.canApprove && (
                        <td className="is-right">
                          <button
                            type="button"
                            className={cx(
                              'btn btn--sm',
                              row.bandPosition === 'below_band' && 'py-btn-emerald',
                            )}
                            onClick={() => openCalibration(row)}
                          >
                            <SlidersHorizontal /> Calibrate Base Pay
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent Compensation Adjustments Audit Trail */}
      <section className="card">
        <div className="section-head">
          <h2 className="section-title" style={{ margin: 0 }}>
            <History size={18} /> Recent Base Compensation Adjustments Audit Trail
            <span className="count">{compHistory.length}</span>
          </h2>
        </div>

        {compHistory.length === 0 ? (
          <p className="text-sm muted">No base salary adjustments recorded yet.</p>
        ) : (
          <div className="stack stack--sm">
            {compHistory.map((rec) => {
              const emp = userById.get(rec.userId);
              const actor = userById.get(rec.actorId);
              const delta = rec.newBaseLocal - rec.previousBaseLocal;
              const pct =
                rec.previousBaseLocal > 0
                  ? Math.round((delta / rec.previousBaseLocal) * 1000) / 10
                  : 0;
              return (
                <div key={rec.id} className="py-claim-card">
                  <div className="py-claim-card__head">
                    <div className="row" style={{ gap: 10 }}>
                      {emp && <Avatar user={emp} size={32} />}
                      <div>
                        <div className="row row--wrap" style={{ gap: 6 }}>
                          <strong>{emp?.name ?? rec.userId}</strong>
                          <span className="tag">Effective {rec.effectivePeriod}</span>
                          <span className="badge badge--success">
                            {delta >= 0 ? '+' : ''}
                            {pct}%
                          </span>
                        </div>
                        <div className="text-xs muted" style={{ marginTop: 2 }}>
                          {rec.reason}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div className="mono" style={{ fontWeight: 600, fontSize: 13 }}>
                        {formatMoney(rec.previousBaseLocal, rec.currency)} →{' '}
                        <span style={{ color: 'var(--success)' }}>
                          {formatMoney(rec.newBaseLocal, rec.currency)}
                        </span>
                      </div>
                      <div className="text-xs muted">
                        By {actor?.name ?? rec.actorId} · {formatDateTime(rec.createdAt)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Calibrate Base Pay Modal */}
      <Modal
        open={Boolean(calibratingRow)}
        onClose={() => setCalibratingUserId(null)}
        width={580}
        icon={calibratingRow ? <Avatar user={calibratingRow.user} size={38} /> : <Scale />}
        title={
          calibratingRow
            ? `Calibrate Base Pay · ${calibratingRow.user.name}`
            : 'Calibrate Base Pay'
        }
        subtitle={
          calibratingRow
            ? `${calibratingRow.band.level} (${calibratingRow.band.title}) · Syncs live to HR Portal & active Payroll Run`
            : undefined
        }
        footer={
          <>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setCalibratingUserId(null)}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="py-calibrate-comp-form"
              className="btn py-btn-emerald"
            >
              <CheckCircle2 /> Update Base & Sync Payroll
            </button>
          </>
        }
      >
        {calibratingRow && calibrationPreview && (
          <form id="py-calibrate-comp-form" className="stack" onSubmit={handleCalibrateSubmit}>
            <div className="py-payslip-box">
              <div className="py-payslip-box__title">
                Band {calibratingRow.band.level} Benchmark (Monthly Fixed AED)
              </div>
              <div className="row row--between text-xs mono">
                <span>Min: {formatAed(calibratingRow.band.minMonthlyFixedAed)}</span>
                <span>Mid: {formatAed(calibratingRow.band.midMonthlyFixedAed)}</span>
                <span>Max: {formatAed(calibratingRow.band.maxMonthlyFixedAed)}</span>
              </div>
              <div className="row row--wrap" style={{ gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() =>
                    setTargetMonthlyFixedAed(calibratingRow.band.minMonthlyFixedAed)
                  }
                >
                  Align to Band Min
                </button>
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() =>
                    setTargetMonthlyFixedAed(
                      Math.round(calibratingRow.band.midMonthlyFixedAed * 0.94),
                    )
                  }
                >
                  Align to 0.94x Mid
                </button>
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() =>
                    setTargetMonthlyFixedAed(calibratingRow.band.midMonthlyFixedAed)
                  }
                >
                  Align to 1.00x Midpoint
                </button>
              </div>
            </div>

            <label className="field">
              <span className="field-label">
                New Monthly Basic Salary ({calibratingRow.comp.currency})
              </span>
              <input
                type="number"
                min={500}
                step={100}
                className="input mono"
                value={newBaseLocal}
                onChange={(e) => setNewBaseLocal(e.target.value)}
                required
              />
              <span className="field-hint">
                Current Base: {formatMoney(calibratingRow.comp.baseMonthly, calibratingRow.comp.currency)} + Allowances{' '}
                {formatMoney(
                  calibratingRow.comp.housingMonthly + calibratingRow.comp.transportMonthly,
                  calibratingRow.comp.currency,
                )}
              </span>
            </label>

            <div className="py-net-banner">
              <div>
                <div className="text-xs muted mono">PROJECTED MONTHLY FIXED (AED)</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700 }}>
                  {formatAed(calibrationPreview.newMonthlyFixedAed)}
                </div>
                <div className="text-xs muted">
                  Updated Accrued EOSB: {formatAed(calibrationPreview.newEosb.accruedAed)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span
                  className={cx(
                    'badge',
                    calibrationPreview.newPos === 'in_band'
                      ? 'badge--success'
                      : 'badge--warning',
                  )}
                >
                  New Compa: {calibrationPreview.newCompa.toFixed(2)}x (
                  {calibrationPreview.newPos.replace('_', ' ')})
                </span>
              </div>
            </div>

            <label className="field">
              <span className="field-label">Calibration & Audit Justification</span>
              <textarea
                className="textarea"
                value={calibReason}
                onChange={(e) => setCalibReason(e.target.value)}
                placeholder="Explain market benchmark, promotion scope, or retention calibration..."
                required
              />
            </label>
          </form>
        )}
      </Modal>
    </div>
  );
}
