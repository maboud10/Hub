import { useMemo, useState } from 'react';
import { Award, CheckCircle2, Copy, Download, FileCode2, Sparkles } from 'lucide-react';
import type { User } from '@/types';
import type { AllowanceId } from '@/hr/types';
import { isEmployee } from '@/hr/seed';
import {
  BONUS_KIND_META,
  formatPeriodLabel,
  generatePayrollCsv,
  generateWpsSif,
  periodFromTimestamp,
} from '@/payroll/engine';
import { usePayroll } from '@/payroll/store';
import type { BonusKind, BonusStatus, PayrollRun, PayrollRunStatus } from '@/payroll/types';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { Modal } from '@/components/ui/Modal';

export function formatAed(amount: number, decimals = 0): string {
  const rounded = decimals === 0 ? Math.round(amount) : amount;
  return `AED ${rounded.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function formatMoney(amount: number, currency = 'AED', decimals = 0): string {
  const rounded = decimals === 0 ? Math.round(amount) : amount;
  return `${currency} ${rounded.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function daysUntilIso(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return 0;
  const target = new Date(y, m - 1, d, 12, 0, 0).getTime();
  const now = new Date();
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0).getTime();
  return Math.round((target - todayMid) / 86_400_000);
}

export const RUN_STATUS_META: Record<
  PayrollRunStatus,
  { label: string; badge: 'muted' | 'warning' | 'info' | 'success'; step: 1 | 2 | 3 | 4 }
> = {
  draft: { label: 'Draft · Live Sync', badge: 'muted', step: 1 },
  pending_signoff: { label: 'Awaiting Counter-Sign', badge: 'warning', step: 2 },
  approved_ready: { label: 'WPS File Ready', badge: 'info', step: 3 },
  paid: { label: 'Disbursed & Paid', badge: 'success', step: 4 },
};

export const BONUS_STATUS_META: Record<
  BonusStatus,
  { label: string; badge: 'warning' | 'info' | 'success' | 'danger' }
> = {
  pending_approval: { label: 'Pending 4-Eyes', badge: 'warning' },
  approved_queued: { label: 'Queued in Payroll', badge: 'info' },
  paid: { label: 'Paid', badge: 'success' },
  declined: { label: 'Declined', badge: 'danger' },
};

export const ALLOWANCE_LABELS: Record<AllowanceId, string> = {
  learning: 'Learning & Development',
  wellness: 'Wellbeing & Fitness',
  'home-office': 'Home Office Setup',
  flight: 'Annual Flight Ticket',
};

const BONUS_PRESETS = [2_500, 5_000, 7_500, 10_000, 15_000];
const BONUS_KINDS: BonusKind[] = ['performance', 'spot', 'signing', 'milestone', 'retention'];

export function WpsSifModal({
  open,
  onClose,
  run,
  users,
}: {
  open: boolean;
  onClose: () => void;
  run: PayrollRun | undefined;
  users: User[];
}) {
  const sifText = useMemo(() => (run ? generateWpsSif(run, users) : ''), [run, users]);
  const lines = useMemo(() => (sifText ? sifText.split('\n') : []), [sifText]);
  const edrCount = lines.filter((l) => l.startsWith('EDR,')).length;

  if (!run) return null;

  const handleDownloadSif = () => {
    const filename = `HELIX-WPS-${run.period}.SIF`;
    downloadTextFile(filename, sifText, 'text/plain;charset=utf-8');
    toast.success(`Downloaded ${filename}`, `${edrCount} EDR records + 1 SCR control footer`);
  };

  const handleDownloadCsv = () => {
    const csv = generatePayrollCsv(run, users);
    const filename = `HELIX-PAYROLL-${run.period}.csv`;
    downloadTextFile(filename, csv, 'text/csv;charset=utf-8');
    toast.success(`Exported ${filename}`);
  };

  const handleCopy = () => {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(sifText);
      toast.success('Copied WPS .SIF payload to clipboard');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={760}
      icon={<FileCode2 style={{ color: '#4ade80' }} />}
      title={`UAE Central Bank WPS .SIF Inspector · ${run.label}`}
      subtitle={`MOL Employer 0000849201441 · Agent Routing 026 · ${edrCount} EDR employee records + 1 SCR batch footer`}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={handleCopy}>
            <Copy /> Copy .SIF
          </button>
          <button type="button" className="btn" onClick={handleDownloadCsv}>
            <Download /> Register .CSV
          </button>
          <button type="button" className="btn py-btn-emerald" onClick={handleDownloadSif}>
            <Download /> Download WPS .SIF
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="row row--wrap" style={{ gap: 8 }}>
          <span className="badge badge--success">
            <CheckCircle2 /> {edrCount} EDR Records
          </span>
          <span className="badge badge--info">SCR Control Total: {formatAed(run.totalNetAed, 2)}</span>
          <span className="badge badge--muted">Value Date: {run.payDate}</span>
          {run.wpsBatchRef && <span className="tag">{run.wpsBatchRef}</span>}
        </div>
        <p className="text-xs muted">
          Each <code>EDR</code> line encodes the 14-digit MOL ID, agent routing code, UAE IBAN, pay period window, paid days, fixed net component, and variable/reimbursement component in AED.
        </p>
        <pre className="py-sif-pre">{sifText}</pre>
      </div>
    </Modal>
  );
}

export function NominateBonusModal({
  open,
  onClose,
  defaultUserId,
  defaultPeriod,
}: {
  open: boolean;
  onClose: () => void;
  defaultUserId?: string;
  defaultPeriod?: string;
}) {
  const users = useHub((s) => s.users);
  const nominateBonus = usePayroll((s) => s.nominateBonus);

  const employees = useMemo(
    () => users.filter((u) => isEmployee(u)).sort((a, b) => a.name.localeCompare(b.name)),
    [users],
  );

  const pCurrent = useMemo(() => periodFromTimestamp(Date.now(), 0), []);
  const pNext = useMemo(() => periodFromTimestamp(Date.now(), 1), []);

  const [userId, setUserId] = useState<string>(defaultUserId || employees[0]?.id || '');
  const [kind, setKind] = useState<BonusKind>('spot');
  const [amountAed, setAmountAed] = useState<string>('5000');
  const [payrollPeriod, setPayrollPeriod] = useState<string>(defaultPeriod || pCurrent);
  const [title, setTitle] = useState('');
  const [reason, setReason] = useState('');

  const activeEmployeeId = defaultUserId || userId || employees[0]?.id || '';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(amountAed);
    const res = nominateBonus({
      userId: activeEmployeeId,
      kind,
      amountAed: numeric,
      payrollPeriod,
      title,
      reason,
    });
    if (toast.result(res, 'Bonus nomination submitted')) {
      setTitle('');
      setReason('');
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={600}
      icon={<Award style={{ color: '#4ade80' }} />}
      title="Nominate Bonus or Variable Pay Award"
      subtitle="All awards go through four-eyes separation of duties before queuing into the monthly WPS pay run."
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="py-nominate-bonus-form" className="btn py-btn-emerald">
            <Sparkles /> Submit for Four-Eyes Sign-Off
          </button>
        </>
      }
    >
      <form id="py-nominate-bonus-form" className="stack" onSubmit={handleSubmit}>
        <div className="py-form-grid">
          <label className="field">
            <span className="field-label">Recipient Employee</span>
            <select
              className="select"
              value={activeEmployeeId}
              onChange={(e) => setUserId(e.target.value)}
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} — {emp.department} ({emp.location})
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Target Payday Period</span>
            <select
              className="select"
              value={payrollPeriod}
              onChange={(e) => setPayrollPeriod(e.target.value)}
            >
              <option value={pCurrent}>{formatPeriodLabel(pCurrent)} (Active Run)</option>
              <option value={pNext}>{formatPeriodLabel(pNext)} (Next Month)</option>
            </select>
          </label>
        </div>

        <div className="field">
          <span className="field-label">Award Category</span>
          <div className="chips" style={{ maskImage: 'none', flexWrap: 'wrap' }}>
            {BONUS_KINDS.map((k) => {
              const meta = BONUS_KIND_META[k];
              return (
                <button
                  key={k}
                  type="button"
                  className={`chip ${kind === k ? 'is-active' : ''}`}
                  onClick={() => setKind(k)}
                >
                  <span
                    className="py-kind-pill__dot"
                    style={{ background: meta.color }}
                    aria-hidden="true"
                  />
                  {meta.label}
                </button>
              );
            })}
          </div>
          <span className="field-hint">{BONUS_KIND_META[kind].description}</span>
        </div>

        <div className="field">
          <span className="field-label">Award Amount (AED)</span>
          <div className="py-preset-grid">
            {BONUS_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`btn btn--sm ${Number(amountAed) === preset ? 'py-btn-emerald' : ''}`}
                onClick={() => setAmountAed(String(preset))}
              >
                {preset.toLocaleString()}
              </button>
            ))}
          </div>
          <input
            type="number"
            min={250}
            step={250}
            className="input mono"
            value={amountAed}
            onChange={(e) => setAmountAed(e.target.value)}
            placeholder="Custom amount in AED"
            required
          />
        </div>

        <label className="field">
          <span className="field-label">Award Headline</span>
          <input
            type="text"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Q4 Zero-Downtime Core Migration Milestone"
            required
          />
        </label>

        <label className="field">
          <span className="field-label">Impact Citation (Visible to Approver & Employee Payslip)</span>
          <textarea
            className="textarea"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describe measurable customer, engineering, or commercial impact..."
            required
          />
        </label>
      </form>
    </Modal>
  );
}
