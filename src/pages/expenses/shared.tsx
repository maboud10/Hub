import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  BedDouble,
  CalendarClock,
  CalendarDays,
  Car,
  CircleCheck,
  Cpu,
  CreditCard,
  ExternalLink,
  FileSpreadsheet,
  Handshake,
  MapPin,
  Plane,
  Receipt,
  RotateCcw,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Ticket,
  TriangleAlert,
  Utensils,
} from 'lucide-react';
import { Chip, type Tone } from '@/components/neo';
import { cx } from '@/lib/cx';
import { formatDay } from '@/hr/calendar';
import {
  CATEGORY_META,
  FLOW_STEPS,
  REPORT_STATUS_META,
  TRIP_STATUS_META,
} from '@/expenses/constants';
import type {
  CurrencyCode,
  ExpenseCategory,
  ExpenseReportStatus,
  PolicyWarning,
  SpendFlowStage,
  TripStatus,
  VirtualCard,
} from '@/expenses/types';
import { usePayroll } from '@/payroll/store';
import { formatPeriodLabel, periodDates, periodFromTimestamp } from '@/payroll/engine';

/** DOM id of the Receipt vault's hidden file input (the header "Upload" action clicks it). */
export const RECEIPT_FILE_INPUT_ID = 'ex-receipt-file';

export function formatAed(amount: number, showDecimals = false): string {
  const rounded = showDecimals ? amount : Math.round(amount);
  return `AED ${rounded.toLocaleString(undefined, {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  })}`;
}

/** "AED 1.24M" / "AED 48.2K" / "AED 4,890" for HUD ribbons and tight spots. */
export function compactAed(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `AED ${(amount / 1_000_000).toFixed(2)}M`;
  if (abs >= 100_000) return `AED ${Math.round(amount / 1000)}K`;
  if (abs >= 10_000) return `AED ${(amount / 1000).toFixed(1)}K`;
  return formatAed(amount);
}

export function formatOrigCurrency(amount: number, currency: CurrencyCode): string {
  return `${currency} ${amount.toLocaleString(undefined, {
    minimumFractionDigits: currency === 'JPY' ? 0 : 2,
    maximumFractionDigits: currency === 'JPY' ? 0 : 2,
  })}`;
}

/** Engine status tones → NEO chip tones. */
export const STATUS_TONE: Record<'neutral' | 'info' | 'warning' | 'success' | 'danger', Tone> = {
  neutral: 'slate',
  info: 'cyan',
  warning: 'warning',
  success: 'success',
  danger: 'danger',
};

export function TripStatusBadge({ status, size }: { status: TripStatus; size?: 'sm' }) {
  const meta = TRIP_STATUS_META[status];
  return (
    <Chip tone={STATUS_TONE[meta.tone]} size={size}>
      {meta.label}
    </Chip>
  );
}

export function ReportStatusBadge({ status, size }: { status: ExpenseReportStatus; size?: 'sm' }) {
  const meta = REPORT_STATUS_META[status];
  return (
    <Chip tone={STATUS_TONE[meta.tone]} size={size}>
      {meta.label}
    </Chip>
  );
}

export function PolicyWarningChips({ warnings }: { warnings: PolicyWarning[] }) {
  if (!warnings.length) return null;
  return (
    <div className="ex-chips">
      {warnings.map((w, idx) => (
        <Chip key={`${w.code}-${idx}`} size="sm" tone={w.severity === 'warn' ? 'warning' : 'cyan'} icon={<TriangleAlert />} title={w.message}>
          {w.code === 'over_meal_cap'
            ? 'Meal cap guideline'
            : w.code === 'missing_receipt'
              ? 'Missing receipt'
              : w.code === 'duplicate_suspect'
                ? 'Duplicate suspect'
                : w.code === 'high_spend'
                  ? 'High-value VAT check'
                  : w.message}
        </Chip>
      ))}
    </div>
  );
}

export function SeparationOfDutiesBadge({ breakGlass = false }: { breakGlass?: boolean }) {
  return (
    <Chip
      size="sm"
      tone="warning"
      icon={<ShieldAlert />}
      title={
        breakGlass
          ? 'You are viewing your own item. System Admin (*) break-glass is active in demo mode.'
          : 'Four-eyes policy: another manager or Finance auditor must review your own item.'
      }
    >
      {breakGlass ? 'Own item · break-glass' : 'Four-eyes · peer sign-off'}
    </Chip>
  );
}

/** Category glyphs for receipts and line items. */
export const CATEGORY_ICON: Record<ExpenseCategory, ReactNode> = {
  flights: <Plane />,
  lodging: <BedDouble />,
  meals: <Utensils />,
  per_diem: <CalendarDays />,
  ground: <Car />,
  client: <Handshake />,
  conference: <Ticket />,
  software: <Cpu />,
  other: <Receipt />,
};

/** Hue-tinted icon tile for an expense category (colour comes from `CATEGORY_META.hue`). */
export function CategoryGlyph({ category, size }: { category: ExpenseCategory; size?: 'sm' }) {
  return (
    <span
      className={cx('ex-cat', size === 'sm' && 'ex-cat--sm')}
      style={{ '--hue': CATEGORY_META[category].hue } as CSSProperties}
      title={CATEGORY_META[category].label}
      aria-hidden="true"
    >
      {CATEGORY_ICON[category]}
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
          <span>Helix Mobility</span>
        </div>
        <span className={cx('ex-vcard__status', card.frozen && 'ex-vcard__status--frozen')}>
          <CreditCard />
          {card.frozen ? 'Frozen' : 'Scoped · Active'}
        </span>
      </div>

      <div className="ex-vcard__pan">
        <span>•••• •••• •••• {card.last4}</span>
        {tripLabel && <span className="ex-vcard__trip">{tripLabel}</span>}
      </div>

      <div className="ex-vcard__meter">
        <div className="ex-vcard__meter-row">
          <span>Spend · {pct}% of limit</span>
          <b>
            {formatAed(card.spentAed)} / {formatAed(card.limitAed)}
          </b>
        </div>
        <div className="ex-vcard__bar" aria-hidden="true">
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="ex-vcard__foot">
        <span className="truncate">{holderName ? holderName.toUpperCase() : 'SCOPED TRAVEL CARD'}</span>
        <span>
          VALID {formatDay(card.activeFrom, { day: 'numeric', month: 'short' })} → {formatDay(card.activeTo, { day: 'numeric', month: 'short' })}
        </span>
      </div>
    </div>
  );
}

/** Stage glyphs for the 7-stage trip-to-paycheck flow. */
export const STAGE_ICON: Record<SpendFlowStage, ReactNode> = {
  1: <MapPin />,
  2: <BadgeCheck />,
  3: <ScanLine />,
  4: <FileSpreadsheet />,
  5: <ShieldCheck />,
  6: <CalendarClock />,
  7: <Banknote />,
};

export const STAGE_WORKSPACE_META: Record<
  SpendFlowStage,
  { detail: string; actionLabel: string; to: string; externalTab?: boolean }
> = {
  1: {
    detail: 'Benchmark the destination, per diem and CO₂, with a live travel-policy check.',
    actionLabel: 'Request travel',
    to: '/expenses/travel?new=1',
  },
  2: {
    detail: 'Manager pre-approval issues a scoped virtual card; then confirm flight PNR and hotel.',
    actionLabel: 'Open travel desk',
    to: '/expenses/travel',
  },
  3: {
    detail: 'Drop a receipt or describe it to Nova — merchant, FX to AED and VAT are extracted for you.',
    actionLabel: 'Open receipt vault',
    to: '/expenses/receipts',
  },
  4: {
    detail: 'Bundle vault receipts plus the trip per diem; card spend and out-of-pocket split automatically.',
    actionLabel: 'Build a report',
    to: '/expenses/reports?new=1',
  },
  5: {
    detail: 'Four-eyes review: your manager signs off, then Finance audits GL codes and VAT.',
    actionLabel: 'View my reports',
    to: '/expenses/reports',
  },
  6: {
    detail: 'Finance-verified claims sync into the monthly Payroll Console run before cut-off.',
    actionLabel: 'Track payday',
    to: '/expenses/reimbursements',
  },
  7: {
    detail: 'Paid with the WPS bank batch and shown tax-free on your HR payslip.',
    actionLabel: 'View payslip',
    to: '/hr/documents?tab=payslips',
    externalTab: true,
  },
};

/** 1..7 segmented progress bar for a single journey. */
export function JourneyProgress({ stage }: { stage: SpendFlowStage }) {
  return (
    <div className="ex-jprog" role="img" aria-label={`Stage ${stage} of 7`}>
      {[1, 2, 3, 4, 5, 6, 7].map((n) => (
        <i key={n} className={cx(n < stage && 'is-done', n === stage && 'is-current')} />
      ))}
    </div>
  );
}

/**
 * Interactive 7-stage trip-to-paycheck flow (`FLOW_STEPS`).
 * Clicking a stage filters journeys (when `onSelectStage` is provided) and
 * reveals a one-click jump into that stage's workspace; without
 * `onSelectStage` it navigates straight away.
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
  const furthest = Math.max(0, ...FLOW_STEPS.filter((s) => (stageCounts?.[s.step as SpendFlowStage] ?? 0) > 0).map((s) => s.step));

  return (
    <div className="ex-flow">
      <div className="ex-flow__scroll">
        <ol
          className="ex-flow__track"
          aria-label="Trip-to-paycheck stages"
          style={{ '--ex-flow-fill': furthest > 1 ? `${((furthest - 1) / 6) * 100}%` : '0%' } as CSSProperties}
        >
          {FLOW_STEPS.map((s) => {
            const step = s.step as SpendFlowStage;
            const count = stageCounts?.[step] ?? 0;
            const selected = selectedStage === step;
            return (
              <li key={s.step} className="ex-flow__stage">
                <button
                  type="button"
                  className={cx('ex-flow__node', selected && 'is-selected', count > 0 && 'has-items')}
                  onClick={() => handleStepClick(step)}
                  aria-pressed={onSelectStage ? selected : undefined}
                  title={s.sub}
                >
                  <span className="ex-flow__dot">
                    {STAGE_ICON[step]}
                    {count > 0 && <span className="ex-flow__count">{count}</span>}
                  </span>
                  <span className="ex-flow__num">{String(s.step).padStart(2, '0')}</span>
                  <span className="ex-flow__title">{s.title}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {selectedStage && activeMeta && activeStepObj ? (
        <div className="ex-flow__detail">
          <span className="ex-flow__detail-icon" aria-hidden="true">
            {STAGE_ICON[selectedStage]}
          </span>
          <div className="ex-flow__detail-text">
            <b>
              Stage {selectedStage} · {activeStepObj.title}
            </b>
            <span>{activeMeta.detail}</span>
          </div>
          <div className="ex-flow__detail-actions">
            {onSelectStage && (
              <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => onSelectStage(null)}>
                <RotateCcw /> All stages
              </button>
            )}
            <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={() => navigate(activeJumpTo)}>
              {selectedStage === 5 && canApproveOrAudit ? 'Open approvals' : activeMeta.actionLabel}
              {activeMeta.externalTab ? <ExternalLink /> : <ArrowRight />}
            </button>
          </div>
        </div>
      ) : (
        <p className="ex-flow__hint">Tap a stage to filter your journeys — or jump straight into its workspace.</p>
      )}
    </div>
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
          ? 'Open · preparing run'
          : openRun.status === 'pending_signoff'
            ? 'Pending four-eyes sign-off'
            : 'Approved · ready for WPS';
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
      statusLabel: 'Scheduled next cycle',
      wpsRef: undefined,
    };
  }, [runs]);
}

export function PayRunStatusPill() {
  const info = useActivePaydayInfo();
  return (
    <Chip tone="cyan" icon={<CircleCheck />} title={`Cutoff ${info.cutoffDate} · Payday ${info.payDate}`}>
      {info.label} · Payday {formatDay(info.payDate, { day: 'numeric', month: 'short' })}
    </Chip>
  );
}

/** Compact "all clear" row for empty queues inside panels. */
export function AllClear({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="ex-allclear">
      <CircleCheck />
      <div>
        <b>{title}</b>
        {children && <span>{children}</span>}
      </div>
    </div>
  );
}
