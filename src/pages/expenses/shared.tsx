import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  RotateCcw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { cx } from '@/lib/cx';
import { formatDay } from '@/hr/calendar';
import {
  FLOW_STEPS,
  REPORT_STATUS_META,
  TRIP_STATUS_META,
} from '@/expenses/constants';
import type {
  CurrencyCode,
  ExpenseReportStatus,
  PolicyWarning,
  SpendFlowStage,
  TripStatus,
  VirtualCard,
} from '@/expenses/types';
import { usePayroll } from '@/payroll/store';
import { formatPeriodLabel, periodDates, periodFromTimestamp } from '@/payroll/engine';

export function formatAed(amount: number, showDecimals = false): string {
  const rounded = showDecimals ? amount : Math.round(amount);
  return `AED ${rounded.toLocaleString(undefined, {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  })}`;
}

export function formatOrigCurrency(amount: number, currency: CurrencyCode): string {
  return `${currency} ${amount.toLocaleString(undefined, {
    minimumFractionDigits: currency === 'JPY' ? 0 : 2,
    maximumFractionDigits: currency === 'JPY' ? 0 : 2,
  })}`;
}

const TONE_CLASS: Record<'neutral' | 'info' | 'warning' | 'success' | 'danger', string> = {
  neutral: 'badge--muted',
  info: 'badge--info',
  warning: 'badge--warning',
  success: 'badge--success',
  danger: 'badge--danger',
};

export function TripStatusBadge({ status }: { status: TripStatus }) {
  const meta = TRIP_STATUS_META[status];
  return <span className={cx('badge', TONE_CLASS[meta.tone])}>{meta.label}</span>;
}

export function ReportStatusBadge({ status }: { status: ExpenseReportStatus }) {
  const meta = REPORT_STATUS_META[status];
  return <span className={cx('badge', TONE_CLASS[meta.tone])}>{meta.label}</span>;
}

export function PolicyWarningChips({ warnings }: { warnings: PolicyWarning[] }) {
  if (!warnings.length) return null;
  return (
    <div className="row row--wrap" style={{ gap: 6 }}>
      {warnings.map((w, idx) => (
        <span
          key={`${w.code}-${idx}`}
          className={cx('badge', w.severity === 'warn' ? 'badge--warning' : 'badge--info')}
          title={w.message}
        >
          <AlertTriangle />
          {w.code === 'over_meal_cap'
            ? 'Meal cap guideline'
            : w.code === 'missing_receipt'
              ? 'Missing receipt'
              : w.code === 'duplicate_suspect'
                ? 'Duplicate suspect'
                : w.code === 'high_spend'
                  ? 'High-value VAT check'
                  : w.message}
        </span>
      ))}
    </div>
  );
}

export function SeparationOfDutiesBadge({ breakGlass = false }: { breakGlass?: boolean }) {
  return (
    <span
      className="ex-sod-banner"
      title={
        breakGlass
          ? 'You are viewing your own item. System Admin (*) break-glass is active in demo mode.'
          : 'Four-eyes policy: another manager or Finance auditor must review your own item.'
      }
    >
      <ShieldAlert />
      {breakGlass ? 'Own Item · Admin Break-Glass' : 'Separation of Duties · Peer Sign-Off Required'}
    </span>
  );
}

/** Styled metallic dark-teal Virtual Corporate Travel Card (`•••• 4821`). */
export function VirtualCorporateCard({
  card,
  holderName,
  tripLabel,
  compact = false,
}: {
  card: VirtualCard;
  holderName?: string;
  tripLabel?: string;
  compact?: boolean;
}) {
  const pct = card.limitAed > 0 ? Math.min(100, Math.round((card.spentAed / card.limitAed) * 100)) : 0;
  return (
    <div className={cx('ex-vcard', compact && 'ex-vcard--compact')}>
      <div className="ex-vcard__mesh" aria-hidden="true" />
      <div className="ex-vcard__top">
        <div className="ex-vcard__brand">
          <span className="ex-vcard__chip" aria-hidden="true" />
          <span>Helix Corporate Mobility</span>
        </div>
        <span className={cx('ex-vcard__status', card.frozen && 'ex-vcard__status--frozen')}>
          <CreditCard style={{ width: 12, height: 12 }} />
          {card.frozen ? 'Frozen' : 'Scoped · Active'}
        </span>
      </div>

      <div className="ex-vcard__pan">
        <span>•••• &nbsp;•••• &nbsp;•••• &nbsp;{card.last4}</span>
        {tripLabel && (
          <span className="text-xs" style={{ letterSpacing: '0.03em', color: '#99f6e4', fontWeight: 500 }}>
            {tripLabel}
          </span>
        )}
      </div>

      <div className="ex-vcard__meter">
        <div className="ex-vcard__meter-row">
          <span>Card spend ({pct}% of trip limit)</span>
          <b>
            {formatAed(card.spentAed)} / {formatAed(card.limitAed)}
          </b>
        </div>
        <div className="ex-vcard__bar" aria-hidden="true">
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="ex-vcard__foot">
        <span>{holderName ? holderName.toUpperCase() : 'SCOPED TRAVEL CARD'}</span>
        <span>
          VALID {formatDay(card.activeFrom, { day: 'numeric', month: 'short' })} →{' '}
          {formatDay(card.activeTo, { day: 'numeric', month: 'short' })}
        </span>
      </div>
    </div>
  );
}

export const STAGE_WORKSPACE_META: Record<
  SpendFlowStage,
  { detail: string; actionLabel: string; to: string; externalTab?: boolean }
> = {
  1: {
    detail: 'Destination benchmark, per-diem rate, CO₂ footprint & pre-trip policy check.',
    actionLabel: 'Request Travel',
    to: '/expenses/travel?new=1',
  },
  2: {
    detail: 'Manager pre-approval, scoped Virtual Corporate Card (`•••• XXXX`) & flight/hotel PNR.',
    actionLabel: 'Open Travel Desk',
    to: '/expenses/travel',
  },
  3: {
    detail: 'Drag-and-drop or 1-click AI OCR scan with live FX-to-AED conversion & VAT extraction.',
    actionLabel: 'Open Smart Receipt Vault',
    to: '/expenses/receipts',
  },
  4: {
    detail: 'Bundle vault receipts + 1-click statutory Trip Per Diem, splitting Virtual Card vs Out-of-Pocket.',
    actionLabel: 'Build Expense Report',
    to: '/expenses/reports?new=1',
  },
  5: {
    detail: 'Four-eyes workflow: Manager business sign-off followed by Finance GL & VAT audit.',
    actionLabel: 'View Reports & Audit',
    to: '/expenses/reports',
  },
  6: {
    detail: 'Finance-verified `payroll_queued` claims sync automatically into the monthly Payroll Console run.',
    actionLabel: 'Track Payday Queue',
    to: '/expenses/reimbursements',
  },
  7: {
    detail: 'Disbursed via WPS bank batch (`WPS-HX-...`) and published tax-free on your HR Portal Payslip.',
    actionLabel: 'View on HR Payslip',
    to: '/hr/documents?tab=payslips',
    externalTab: true,
  },
};

/**
 * Interactive 7-Stage Process Flow Stepper (`FLOW_STEPS`).
 * Clicking a stage filters active journeys (when `onSelectStage` is provided)
 * AND reveals a direct 1-click jump button to that stage's workspace/action,
 * or navigates immediately when `onSelectStage` is omitted.
 */
export function ProcessFlowRail({
  selectedStage,
  onSelectStage,
  stageCounts,
  canApproveOrAudit = false,
}: {
  selectedStage?: SpendFlowStage | null;
  onSelectStage?: (stage: SpendFlowStage | null) => void;
  stageCounts?: Partial<Record<SpendFlowStage, number>>;
  canApproveOrAudit?: boolean;
}) {
  const navigate = useNavigate();

  const handleStepClick = (step: SpendFlowStage) => {
    if (onSelectStage) {
      onSelectStage(selectedStage === step ? null : step);
    } else {
      const target = step === 5 && canApproveOrAudit ? '/expenses/approvals' : STAGE_WORKSPACE_META[step].to;
      navigate(target);
    }
  };

  const activeMeta = selectedStage ? STAGE_WORKSPACE_META[selectedStage] : null;
  const activeStepObj = selectedStage ? FLOW_STEPS.find((s) => s.step === selectedStage) : null;
  const activeJumpTo =
    selectedStage === 5 && canApproveOrAudit
      ? '/expenses/approvals'
      : activeMeta?.to ?? '/expenses';

  return (
    <section className="ex-flow-shell" aria-label="End-to-end Travel to Paycheck process flow">
      <div className="ex-flow-head">
        <div>
          <div className="row" style={{ gap: 8 }}>
            <Sparkles style={{ width: 16, height: 16, color: 'var(--ex-ink)' }} />
            <h2 className="section-title" style={{ fontSize: 16 }}>
              End-to-End Trip-to-Paycheck Pipeline
            </h2>
          </div>
          <p className="text-xs muted" style={{ marginTop: 3 }}>
            Click any stage to filter journeys below or jump straight into its workspace.
          </p>
        </div>

        {selectedStage && onSelectStage && (
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => onSelectStage(null)}
          >
            <RotateCcw /> Show all stages
          </button>
        )}
      </div>

      <div className="ex-flow-rail" role="list">
        {FLOW_STEPS.map((s) => {
          const stepNum = s.step as SpendFlowStage;
          const count = stageCounts?.[stepNum] ?? 0;
          const isSelected = selectedStage === stepNum;
          return (
            <button
              key={s.step}
              type="button"
              role="listitem"
              className={cx('ex-flow-step', isSelected && 'is-selected')}
              onClick={() => handleStepClick(stepNum)}
            >
              <div className="ex-flow-step__top">
                <span className="ex-flow-step__num">{s.step}</span>
                <span className={cx('ex-flow-step__count', count > 0 && 'has-items')}>
                  {count > 0 ? `${count} active` : `Stage ${s.step}`}
                </span>
              </div>
              <div className="ex-flow-step__title">{s.title}</div>
              <div className="ex-flow-step__sub">{s.sub}</div>
            </button>
          );
        })}
      </div>

      {selectedStage && activeMeta && activeStepObj && (
        <div className="ex-flow-banner">
          <div className="grow" style={{ minWidth: 200 }}>
            <div className="text-sm" style={{ fontWeight: 650 }}>
              Stage {selectedStage}: {activeStepObj.title}
            </div>
            <div className="text-xs muted" style={{ marginTop: 2 }}>
              {activeMeta.detail}
            </div>
          </div>
          <div className="row row--wrap" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn btn--sm ex-btn-teal"
              onClick={() => navigate(activeJumpTo)}
            >
              {selectedStage === 5 && canApproveOrAudit ? 'Open Approvals & Audit' : activeMeta.actionLabel}
              {activeMeta.externalTab ? <ExternalLink /> : <ArrowRight />}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Reads live Payroll Console runs so employees see real payday dates & run status. */
export function useActivePaydayInfo() {
  const runs = usePayroll((s) => s.runs);
  return useMemo(() => {
    const openRun = runs.find((r) => r.status !== 'paid');
    if (openRun) {
      const statusLabel =
        openRun.status === 'draft'
          ? 'Open · Preparing Run'
          : openRun.status === 'pending_signoff'
            ? 'Pending 4-Eyes Sign-Off'
            : 'Approved · Ready for WPS';
      return {
        period: openRun.period,
        label: openRun.label,
        payDate: openRun.payDate,
        cutoffDate: openRun.cutoffDate,
        runStatus: openRun.status,
        statusLabel,
        wpsRef: openRun.wpsBatchRef,
      };
    }
    const nextPeriod = periodFromTimestamp(Date.now(), 1);
    const dates = periodDates(nextPeriod);
    return {
      period: nextPeriod,
      label: formatPeriodLabel(nextPeriod),
      payDate: dates.payDate,
      cutoffDate: dates.cutoffDate,
      runStatus: 'draft' as const,
      statusLabel: 'Scheduled Next Cycle',
      wpsRef: undefined,
    };
  }, [runs]);
}

export function PayRunStatusPill() {
  const info = useActivePaydayInfo();
  return (
    <span className="badge badge--info" title={`Cutoff ${info.cutoffDate} · Payday ${info.payDate}`}>
      <CheckCircle2 /> {info.label} · Payday {formatDay(info.payDate, { day: 'numeric', month: 'short' })}
    </span>
  );
}
