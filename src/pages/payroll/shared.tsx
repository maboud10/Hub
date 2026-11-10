/**
 * Payroll Console — shared helpers, status meta and NEO dialogs
 * (WPS .SIF inspector, bonus nomination) used across the Payday deck.
 */
import { useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
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
import { cx } from '@/lib/cx';
import { Modal } from '@/components/ui/Modal';
import { hexToRgb, type Tone } from '@/components/neo';

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

/** "AED 1.24M" / "AED 482K" — compact figures for HUD ribbons and side panels. */
export function compactAed(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `AED ${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 10_000) return `AED ${Math.round(n / 1000)}K`;
  return formatAed(n);
}

/** "2026-11" → "Nov 2026". */
export function shortPeriodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  return new Date(y, m - 1, 1).toLocaleString('en', { month: 'short', year: 'numeric' });
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

export const RUN_STATUS_META: Record<PayrollRunStatus, { label: string; tone: Tone; step: 1 | 2 | 3 | 4 }> = {
  draft: { label: 'Draft · live sync', tone: 'slate', step: 1 },
  pending_signoff: { label: 'Awaiting counter-sign', tone: 'warning', step: 2 },
  approved_ready: { label: 'WPS file ready', tone: 'cyan', step: 3 },
  paid: { label: 'Disbursed & paid', tone: 'success', step: 4 },
};

export const BONUS_STATUS_META: Record<BonusStatus, { label: string; tone: Tone }> = {
  pending_approval: { label: 'Pending 4-eyes', tone: 'warning' },
  approved_queued: { label: 'Queued in payroll', tone: 'cyan' },
  paid: { label: 'Paid', tone: 'success' },
  declined: { label: 'Declined', tone: 'danger' },
};

export const ALLOWANCE_LABELS: Record<AllowanceId, string> = {
  learning: 'Learning & Development',
  wellness: 'Wellbeing & Fitness',
  'home-office': 'Home Office Setup',
  flight: 'Annual Flight Ticket',
};

/** Award-type chip in the kind's own colour (static, or a pressable filter). */
export function KindChip({
  kind,
  size,
  onClick,
  pressed,
}: {
  kind: BonusKind;
  size?: 'sm' | 'lg';
  onClick?: () => void;
  pressed?: boolean;
}) {
  const meta = BONUS_KIND_META[kind];
  const cls = cx('neo-chip', size && `neo-chip--${size}`);
  const style = { '--tone': hexToRgb(meta.color) } as CSSProperties;
  const inner = (
    <>
      <i className="py-dot" aria-hidden="true" />
      {meta.label}
    </>
  );
  if (onClick)
    return (
      <button type="button" className={cls} style={style} aria-pressed={pressed} onClick={onClick} title={meta.description}>
        {inner}
      </button>
    );
  return (
    <span className={cls} style={style} title={meta.description}>
      {inner}
    </span>
  );
}

/** Tinted icon tile for payroll dialog headers. */
export function DialogIcon({ children }: { children: ReactNode }) {
  return <span className="py-modal__icon">{children}</span>;
}

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
      width={780}
      className="py-modal"
      icon={
        <DialogIcon>
          <FileCode2 />
        </DialogIcon>
      }
      title={`WPS .SIF inspector · ${run.label}`}
      subtitle={`UAE Central Bank WPS · MOL employer 0000849201441 · agent routing 026`}
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={handleCopy}>
            <Copy /> Copy
          </button>
          <button type="button" className="neo-btn neo-btn--soft" onClick={handleDownloadCsv}>
            <Download /> Register .CSV
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={handleDownloadSif}>
            <Download /> Download .SIF
          </button>
        </>
      }
    >
      <div className="py-modal__stack">
        <div className="py-minis py-minis--4">
          <div className="py-mini">
            <span className="neo-hud">EDR records</span>
            <b className="py-mini__val">
              <CheckCircle2 className="py-mini__ok" /> {edrCount}
            </b>
          </div>
          <div className="py-mini">
            <span className="neo-hud">SCR control total</span>
            <b className="py-mini__val">{formatAed(run.totalNetAed, 2)}</b>
          </div>
          <div className="py-mini">
            <span className="neo-hud">Value date</span>
            <b className="py-mini__val py-mini__val--mono">{run.payDate}</b>
          </div>
          <div className="py-mini">
            <span className="neo-hud">Batch ref</span>
            <b className="py-mini__val py-mini__val--mono">{run.wpsBatchRef ?? 'On release'}</b>
          </div>
        </div>
        <p className="py-modal__hint">
          Each <code>EDR</code> line encodes the 14-digit MOL ID, agent routing code, UAE IBAN, pay-period window, paid days, the fixed net component and the
          variable / reimbursement component in AED. The closing <code>SCR</code> record carries the control total.
        </p>
        <pre className="py-sif" aria-label={`WPS .SIF payload, ${lines.length} records`}>
          {lines.map((line, i) => {
            const [tag, ...fields] = line.split(',');
            return (
              <span key={i} className="py-sif__line" data-kind={tag}>
                <span className="py-sif__tag">{tag}</span>
                {fields.map((f, j) => (
                  <span key={j}>
                    <span className="py-sif__sep">,</span>
                    {f}
                  </span>
                ))}
              </span>
            );
          })}
        </pre>
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

  const handleSubmit = (e: FormEvent) => {
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
      className="py-modal"
      icon={
        <DialogIcon>
          <Award />
        </DialogIcon>
      }
      title="Nominate a bonus or award"
      subtitle="Every award passes four-eyes sign-off before it is queued into the monthly WPS pay run."
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="py-nominate-bonus-form" className="neo-btn neo-btn--plasma">
            <Sparkles /> Submit for sign-off
          </button>
        </>
      }
    >
      <form id="py-nominate-bonus-form" className="py-modal__stack" onSubmit={handleSubmit}>
        <div className="py-form-grid">
          <label className="neo-field">
            <span className="neo-label">Recipient</span>
            <select className="neo-select" value={activeEmployeeId} onChange={(e) => setUserId(e.target.value)}>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} — {emp.department} ({emp.location})
                </option>
              ))}
            </select>
          </label>

          <label className="neo-field">
            <span className="neo-label">Target payday</span>
            <select className="neo-select" value={payrollPeriod} onChange={(e) => setPayrollPeriod(e.target.value)}>
              <option value={pCurrent}>{formatPeriodLabel(pCurrent)} · active run</option>
              <option value={pNext}>{formatPeriodLabel(pNext)} · next month</option>
            </select>
          </label>
        </div>

        <div className="neo-field" role="group" aria-label="Award category">
          <span className="neo-label">Award category</span>
          <div className="py-kindpick">
            {BONUS_KINDS.map((k) => (
              <KindChip key={k} kind={k} size="lg" pressed={kind === k} onClick={() => setKind(k)} />
            ))}
          </div>
          <span className="neo-hint">{BONUS_KIND_META[kind].description}</span>
        </div>

        <div className="neo-field">
          <span className="neo-label">Amount (AED)</span>
          <div className="py-presets" role="group" aria-label="Preset amounts">
            {BONUS_PRESETS.map((preset) => {
              const on = Number(amountAed) === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  className={cx('neo-btn neo-btn--sm', on && 'neo-btn--soft')}
                  aria-pressed={on}
                  onClick={() => setAmountAed(String(preset))}
                >
                  {preset.toLocaleString()}
                </button>
              );
            })}
          </div>
          <input
            type="number"
            min={250}
            step={250}
            className="neo-input neo-mono"
            value={amountAed}
            onChange={(e) => setAmountAed(e.target.value)}
            placeholder="Custom amount in AED"
            aria-label="Award amount in AED"
            required
          />
        </div>

        <label className="neo-field">
          <span className="neo-label">Award headline</span>
          <input
            type="text"
            className="neo-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Q4 Zero-Downtime Core Migration Milestone"
            required
          />
        </label>

        <label className="neo-field">
          <span className="neo-label">Impact citation</span>
          <textarea
            className="neo-textarea"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describe measurable customer, engineering, or commercial impact..."
            required
          />
          <span className="neo-hint">Visible to the approver and on the employee’s payslip.</span>
        </label>
      </form>
    </Modal>
  );
}
