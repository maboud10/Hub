/**
 * Compensation & Bands — executive compensation HUD ribbon, visual salary band
 * architecture (IC2 → M4) with interactive employee dots, departmental total
 * rewards & EOSB stack, pay equity ledger, and live base-pay calibration modal.
 */
import { useMemo, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Download,
  Landmark,
  Scale,
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
import { Avatar } from '@/components/ui/primitives';
import { Chip, NeoEmpty, NeoHome, NeoKpi, NeoKpis, NeoPanel, NeoSearch, NeoTabs } from '@/components/neo';
import { compactAed, downloadTextFile, formatAed, formatMoney } from './shared';

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
    () => (calibratingUserId ? report.rows.find((r) => r.user.id === calibratingUserId) : undefined),
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

  const outlierIds = useMemo(() => new Set(report.outliers.map((o) => o.user.id)), [report.outliers]);

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
    downloadTextFile('HELIX-COMP-EQUITY-EOSB.csv', [headers.join(','), ...lines].join('\n'), 'text/csv;charset=utf-8');
    toast.success('Exported HELIX-COMP-EQUITY-EOSB.csv');
  };

  // Live preview inside Calibrate Base Pay modal
  const calibrationPreview = useMemo(() => {
    if (!calibratingRow) return null;
    const parsed = Number(newBaseLocal);
    const base = Number.isFinite(parsed) && parsed > 0 ? parsed : calibratingRow.comp.baseMonthly;
    const fx = fxToAedFor(calibratingRow.comp.currency);
    const newMonthlyFixedAed =
      Math.round((base + calibratingRow.comp.housingMonthly + calibratingRow.comp.transportMonthly) * fx * 100) / 100;
    const newCompa = Math.round((newMonthlyFixedAed / Math.max(1, calibratingRow.band.midMonthlyFixedAed)) * 100) / 100;
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
    const allowancesLocal = calibratingRow.comp.housingMonthly + calibratingRow.comp.transportMonthly;
    const requiredBaseLocal = Math.max(500, Math.round(targetFixedAed / fx - allowancesLocal));
    setNewBaseLocal(String(requiredBaseLocal));
  };

  const handleCalibrateSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!calibratingRow) return;
    const res = adjustBaseCompensation(calibratingRow.user.id, Number(newBaseLocal), calibReason);
    if (toast.result(res, 'Updated base compensation')) {
      setCalibratingUserId(null);
    }
  };

  const maxDeptRewards = useMemo(
    () => Math.max(1, ...report.byDepartment.map((d) => d.annualTotalRewardsAed)),
    [report.byDepartment],
  );

  return (
    <div className="py-view">
      {/* Executive Compensation KPIs */}
      <NeoKpis label="Executive compensation KPIs">
        <NeoKpi
          icon={<Wallet />}
          label="Monthly fixed run-rate"
          value={compactAed(report.monthlyPayrollRunRateAed)}
          sub={`${report.headcount} salaried · ${compactAed(report.annualFixedRunRateAed)}/yr`}
        />
        <NeoKpi
          icon={<TrendingUp />}
          label="Annual total rewards"
          value={compactAed(report.annualTotalRewardsAed)}
          sub="Fixed + benefits + YTD bonuses"
        />
        <NeoKpi
          icon={<Scale />}
          label="Median compa-ratio"
          value={`${report.medianCompaRatio.toFixed(2)}x`}
          sub="Target midpoint = 1.00x"
        />
        <NeoKpi
          icon={<CheckCircle2 />}
          label="In-band equity"
          value={`${report.inBandPct}%`}
          sub={`${report.outliers.length} actionable outlier${report.outliers.length === 1 ? '' : 's'}`}
          tone={report.outliers.length ? 'warning' : 'success'}
        />
        <NeoKpi
          icon={<Landmark />}
          label="UAE EOSB liability"
          value={compactAed(report.totalEosbLiabilityAed)}
          sub="21d/yr (1–5y) · 30d/yr (>5y)"
        />
      </NeoKpis>

      <NeoHome
        sideLabel="Departmental total rewards and audit history"
        main={
          <NeoPanel hud="Architecture · IC2 → M4" title="Salary band architecture">
            <p className="py-panel-sub">
              Monthly fixed AED ranges <code>[Min — Mid — Max]</code> with live employee markers. Click any marker to inspect or calibrate.
            </p>
            <div className="py-legend" aria-hidden="true">
              <span>
                <i className="py-dot" data-tone="amber" /> Band midpoint
              </span>
              <span>
                <i className="py-dot" data-tone="app" /> In-band employee
              </span>
              <span>
                <i className="py-dot py-dot--cut" /> Below band (calibrate)
              </span>
            </div>

            <div className="py-band-list">
              {bands.map((b) => {
                const members = report.rows.filter((r) => r.band.id === b.id);
                const leftPct = Math.min(95, (b.minMonthlyFixedAed / SCALE_MAX_AED) * 100);
                const widthPct = Math.max(4, ((b.maxMonthlyFixedAed - b.minMonthlyFixedAed) / SCALE_MAX_AED) * 100);
                const midPct = Math.min(98, (b.midMonthlyFixedAed / SCALE_MAX_AED) * 100);

                return (
                  <div key={b.id} className="py-band-row">
                    <div className="py-band-row__meta">
                      <div className="py-band-row__lvl">
                        <span>{b.level}</span>
                        <Chip size="sm" tone="slate">
                          {b.track}
                        </Chip>
                        <Chip size="sm" tone="app">
                          {b.targetBonusPct}% bonus
                        </Chip>
                      </div>
                      <div className="text-xs muted truncate" style={{ marginTop: 2 }}>
                        {b.title} ({members.length})
                      </div>
                    </div>

                    <div className="py-band-track">
                      <div className="py-band-range" style={{ left: `${leftPct}%`, width: `${widthPct}%` }} />
                      <div className="py-band-mid" style={{ left: `${midPct}%` }} />
                      {members.map((m) => {
                        const dotPct = Math.max(2, Math.min(98, (m.monthlyFixedAed / SCALE_MAX_AED) * 100));
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
                        {Math.round(b.minMonthlyFixedAed / 1000)}k – <b>{Math.round(b.midMonthlyFixedAed / 1000)}k</b> –{' '}
                        {Math.round(b.maxMonthlyFixedAed / 1000)}k
                      </div>
                      <div style={{ fontSize: 10.5 }}>AED / mo</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </NeoPanel>
        }
        side={
          <>
            <NeoPanel hud="Total rewards" title="By department & EOSB">
              <div className="py-legend" aria-hidden="true">
                <span>
                  <i className="py-dot" data-tone="app" /> Fixed
                </span>
                <span>
                  <i className="py-dot" data-tone="cyan" /> Benefits
                </span>
                <span>
                  <i className="py-dot" data-tone="amber" /> Bonuses
                </span>
              </div>
              <div className="py-dept-stack-list">
                {report.byDepartment.map((dept) => {
                  const annualFixed = dept.monthlyFixedAed * 12;
                  const annualBonus = dept.ytdBonusesAed;
                  const annualBenefits = Math.max(0, dept.annualTotalRewardsAed - annualFixed - annualBonus);
                  const fixedW = (annualFixed / maxDeptRewards) * 100;
                  const benW = (annualBenefits / maxDeptRewards) * 100;
                  const bonW = (annualBonus / maxDeptRewards) * 100;

                  return (
                    <div key={dept.department} className="py-dept-stack">
                      <div className="py-burn__head">
                        <span>
                          <b>{dept.department}</b> <span className="text-xs muted">({dept.headcount})</span>
                        </span>
                        <span className="py-burn__fig">{compactAed(dept.annualTotalRewardsAed)}/yr</span>
                      </div>
                      <div className="py-dept-stack__bar">
                        <div className="py-dept-stack__seg--fixed" style={{ width: `${fixedW}%` }} title={`Annual Fixed: ${formatAed(annualFixed)}`} />
                        <div className="py-dept-stack__seg--benefits" style={{ width: `${benW}%` }} title={`Employer Benefits: ${formatAed(annualBenefits)}`} />
                        {bonW > 0 && <div className="py-dept-stack__seg--bonus" style={{ width: `${bonW}%` }} title={`YTD Bonuses: ${formatAed(annualBonus)}`} />}
                      </div>
                      <div className="py-burn__head text-xs muted">
                        <span>
                          Avg compa: <b className="mono">{dept.avgCompaRatio.toFixed(2)}x</b>
                        </span>
                        <span>
                          EOSB: <b className="mono">{compactAed(dept.eosbLiabilityAed)}</b>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </NeoPanel>

            <NeoPanel hud="Audit log" title="Recent base calibrations" actions={<span className="neo-count">{compHistory.length}</span>}>
              {compHistory.length === 0 ? (
                <p className="py-panel-sub">No base salary adjustments recorded yet.</p>
              ) : (
                <div className="py-awards">
                  {compHistory.map((rec) => {
                    const emp = userById.get(rec.userId);
                    const actor = userById.get(rec.actorId);
                    const delta = rec.newBaseLocal - rec.previousBaseLocal;
                    const pct = rec.previousBaseLocal > 0 ? Math.round((delta / rec.previousBaseLocal) * 1000) / 10 : 0;
                    return (
                      <div key={rec.id} className="py-claim-card">
                        <div className="py-claim-card__head">
                          <div className="py-person" style={{ minWidth: 0 }}>
                            {emp && <Avatar user={emp} size={30} />}
                            <div className="py-person__text">
                              <b>{emp?.name ?? rec.userId}</b>
                              <span>{rec.reason}</span>
                            </div>
                          </div>
                          <Chip size="sm" tone="success">
                            {delta >= 0 ? '+' : ''}
                            {pct}%
                          </Chip>
                        </div>
                        <div className="py-burn__head text-xs muted">
                          <span className="mono">
                            {formatMoney(rec.previousBaseLocal, rec.currency)} → {formatMoney(rec.newBaseLocal, rec.currency)}
                          </span>
                          <span>By {actor?.name ?? rec.actorId} · {formatDateTime(rec.createdAt)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </NeoPanel>
          </>
        }
      />

      {/* Pay Equity, Band Penetration & Statutory EOSB Table */}
      <NeoPanel
        flush
        hud="Equity & statutory ledger"
        title="Pay equity, band penetration & UAE EOSB"
        actions={
          <>
            <span className="neo-count">{filteredRows.length}</span>
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={handleExportCompCsv}>
              <Download /> Export CSV
            </button>
          </>
        }
      >
        <p className="py-panel-sub">Highlights below-band retention risks and calculates statutory UAE Labour Law End-of-Service Benefits.</p>
        <div className="py-toolbar">
          <NeoSearch
            size="sm"
            className="py-toolbar__search"
            value={search}
            onChange={setSearch}
            placeholder="Search employee, band, currency, EOSB tier…"
            label="Search compensation ledger"
          />
          <NeoTabs
            value={tableFilter}
            onChange={setTableFilter}
            label="Filter compensation ledger"
            items={[
              { value: 'all', label: 'All employees', count: report.rows.length },
              { value: 'outliers', label: 'Actionable outliers (<0.88 or out-of-band)', count: report.outliers.length },
            ]}
          />
        </div>

        {filteredRows.length === 0 ? (
          <NeoEmpty compact icon={<Scale />} title="No employees match this equity filter">
            Switch back to All employees or clear the search query.
          </NeoEmpty>
        ) : (
          <div className="neo-table-wrap">
            <table className="neo-table py-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Salary band</th>
                  <th className="is-right">Local base + fixed AED</th>
                  <th>Band penetration & compa</th>
                  <th className="is-right">Annual total rewards</th>
                  <th className="is-right">Tenure & UAE EOSB</th>
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
                        <div className="py-person">
                          <Avatar user={row.user} size={32} />
                          <div className="py-person__text">
                            <b>{row.user.name}</b>
                            <span>
                              {row.user.title} · {row.user.department}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className="py-award__name">
                          <Chip size="sm" tone="slate">
                            {row.band.level}
                          </Chip>
                          <span className="py-sub">
                            {Math.round(row.band.minMonthlyFixedAed / 1000)}k–{Math.round(row.band.maxMonthlyFixedAed / 1000)}k
                          </span>
                        </div>
                        <div className="py-sub">{row.band.track} track</div>
                      </td>

                      <td className="is-right">
                        <div className="py-amt">{formatAed(row.monthlyFixedAed)}/mo</div>
                        <div className="py-sub">Base {formatMoney(row.comp.baseMonthly, row.comp.currency)}</div>
                      </td>

                      <td>
                        <div className="py-pen-cell">
                          <div className="py-burn__head">
                            <Chip
                              size="sm"
                              tone={
                                row.bandPosition === 'below_band'
                                  ? 'danger'
                                  : row.bandPosition === 'above_band' || row.compaRatio < 0.88
                                    ? 'warning'
                                    : 'success'
                              }
                            >
                              {row.compaRatio.toFixed(2)}x ·{' '}
                              {row.bandPosition === 'below_band'
                                ? 'Below band'
                                : row.bandPosition === 'above_band'
                                  ? 'Above band'
                                  : `${Math.round(row.bandPenetrationPct)}% pen`}
                            </Chip>
                            {isOutlier && <span className="py-sub" data-tone="warning">Calibrate</span>}
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
                        <div className="py-amt py-amt--net">{formatAed(row.totalRewardsAnnualAed)}</div>
                        <div className="py-sub">
                          {row.ytdBonusesAed > 0 ? `Incl. ${formatAed(row.ytdBonusesAed)} bonus` : 'Incl. benefits & allowances'}
                        </div>
                      </td>

                      <td className="is-right">
                        <div className="py-amt">{formatAed(row.eosb.accruedAed)}</div>
                        <div className="py-sub">
                          {row.eosb.tenureYears.toFixed(1)} yrs · {row.eosb.tierLabel}
                        </div>
                      </td>

                      {caps.canApprove && (
                        <td className="is-right">
                          <button
                            type="button"
                            className={cx('neo-btn neo-btn--sm', row.bandPosition === 'below_band' ? 'neo-btn--plasma' : 'neo-btn--soft')}
                            onClick={() => openCalibration(row)}
                          >
                            <SlidersHorizontal /> Calibrate
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
      </NeoPanel>

      {/* Calibrate Base Pay Modal */}
      <Modal
        open={Boolean(calibratingRow)}
        onClose={() => setCalibratingUserId(null)}
        width={580}
        className="py-modal"
        icon={calibratingRow ? <Avatar user={calibratingRow.user} size={38} /> : <Scale />}
        title={calibratingRow ? `Calibrate base pay · ${calibratingRow.user.name}` : 'Calibrate base pay'}
        subtitle={
          calibratingRow
            ? `${calibratingRow.band.level} (${calibratingRow.band.title}) · Syncs live to HR Portal & active Payroll Run`
            : undefined
        }
        footer={
          <>
            <button type="button" className="neo-btn neo-btn--ghost" onClick={() => setCalibratingUserId(null)}>
              Cancel
            </button>
            <button type="submit" form="py-calibrate-comp-form" className="neo-btn neo-btn--plasma">
              <CheckCircle2 /> Update base & sync payroll
            </button>
          </>
        }
      >
        {calibratingRow && calibrationPreview && (
          <form id="py-calibrate-comp-form" className="py-modal__stack" onSubmit={handleCalibrateSubmit}>
            <div className="py-box">
              <div className="neo-hud">Band {calibratingRow.band.level} benchmark (monthly fixed AED)</div>
              <div className="py-burn__head text-xs mono">
                <span>Min: {formatAed(calibratingRow.band.minMonthlyFixedAed)}</span>
                <span>Mid: {formatAed(calibratingRow.band.midMonthlyFixedAed)}</span>
                <span>Max: {formatAed(calibratingRow.band.maxMonthlyFixedAed)}</span>
              </div>
              <div className="py-presets" style={{ marginTop: 6 }}>
                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--sm"
                  onClick={() => setTargetMonthlyFixedAed(calibratingRow.band.minMonthlyFixedAed)}
                >
                  Align to band min
                </button>
                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--sm"
                  onClick={() => setTargetMonthlyFixedAed(Math.round(calibratingRow.band.midMonthlyFixedAed * 0.94))}
                >
                  Align to 0.94x mid
                </button>
                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--sm"
                  onClick={() => setTargetMonthlyFixedAed(calibratingRow.band.midMonthlyFixedAed)}
                >
                  Align to 1.00x midpoint
                </button>
              </div>
            </div>

            <label className="neo-field">
              <span className="neo-label">New monthly basic salary ({calibratingRow.comp.currency})</span>
              <input
                type="number"
                min={500}
                step={100}
                className="neo-input neo-mono"
                value={newBaseLocal}
                onChange={(e) => setNewBaseLocal(e.target.value)}
                required
              />
              <span className="neo-hint">
                Current base: {formatMoney(calibratingRow.comp.baseMonthly, calibratingRow.comp.currency)} + allowances{' '}
                {formatMoney(
                  calibratingRow.comp.housingMonthly + calibratingRow.comp.transportMonthly,
                  calibratingRow.comp.currency,
                )}
              </span>
            </label>

            <div className="py-net">
              <div>
                <div className="neo-hud">Projected monthly fixed (AED)</div>
                <div className="py-net__val">{formatAed(calibrationPreview.newMonthlyFixedAed)}</div>
                <div className="py-net__sub">Updated accrued EOSB: {formatAed(calibrationPreview.newEosb.accruedAed)}</div>
              </div>
              <Chip size="sm" tone={calibrationPreview.newPos === 'in_band' ? 'success' : 'warning'}>
                New compa: {calibrationPreview.newCompa.toFixed(2)}x ({calibrationPreview.newPos.replace('_', ' ')})
              </Chip>
            </div>

            <label className="neo-field">
              <span className="neo-label">Calibration & audit justification</span>
              <textarea
                className="neo-textarea"
                value={calibReason}
                onChange={(e) => setCalibReason(e.target.value)}
                placeholder="Explain market benchmark, promotion scope, or retention calibration…"
                required
              />
            </label>
          </form>
        )}
      </Modal>
    </div>
  );
}
