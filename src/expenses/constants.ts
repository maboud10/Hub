/**
 * Constants, FX table, city per-diem & flight benchmarks, GL codes,
 * policy guardrails, and Smart Receipt OCR parser for Helix Spend & Mobility.
 */
import type { Department } from '@/types';
import { daysBetween } from '@/hr/calendar';
import type {
  CabinClass,
  CurrencyCode,
  ExpenseCategory,
  ExpenseReportStatus,
  PolicyWarning,
  TripPurpose,
  TripStatus,
} from './types';

export const EXPENSES_DATA_VERSION = 1;

/** Deterministic FX rates into AED (pegged USD = 3.6725). */
export const FX_TO_AED: Record<CurrencyCode, number> = {
  AED: 1,
  USD: 3.6725,
  EUR: 3.98,
  GBP: 4.66,
  SGD: 2.74,
  SAR: 0.979,
  JPY: 0.0245,
};

export interface DestinationPreset {
  city: string;
  country: string;
  currency: CurrencyCode;
  perDiemAed: number;
  typicalFlightAed: number;
  typicalHotelNightAed: number;
  flightHoursFromDubai: number;
  co2KgRoundtrip: number;
  visaHint?: boolean;
}

export const DESTINATION_PRESETS: DestinationPreset[] = [
  {
    city: 'London',
    country: 'United Kingdom',
    currency: 'GBP',
    perDiemAed: 420,
    typicalFlightAed: 3450,
    typicalHotelNightAed: 1050,
    flightHoursFromDubai: 7.5,
    co2KgRoundtrip: 1480,
    visaHint: true,
  },
  {
    city: 'Singapore',
    country: 'Singapore',
    currency: 'SGD',
    perDiemAed: 400,
    typicalFlightAed: 3200,
    typicalHotelNightAed: 980,
    flightHoursFromDubai: 7.5,
    co2KgRoundtrip: 1560,
  },
  {
    city: 'Berlin',
    country: 'Germany',
    currency: 'EUR',
    perDiemAed: 360,
    typicalFlightAed: 2850,
    typicalHotelNightAed: 820,
    flightHoursFromDubai: 6.5,
    co2KgRoundtrip: 1290,
    visaHint: true,
  },
  {
    city: 'Riyadh',
    country: 'Saudi Arabia',
    currency: 'SAR',
    perDiemAed: 380,
    typicalFlightAed: 1450,
    typicalHotelNightAed: 890,
    flightHoursFromDubai: 2.0,
    co2KgRoundtrip: 410,
  },
  {
    city: 'Bengaluru',
    country: 'India',
    currency: 'USD',
    perDiemAed: 310,
    typicalFlightAed: 1680,
    typicalHotelNightAed: 640,
    flightHoursFromDubai: 4.0,
    co2KgRoundtrip: 760,
  },
  {
    city: 'New York',
    country: 'United States',
    currency: 'USD',
    perDiemAed: 460,
    typicalFlightAed: 5600,
    typicalHotelNightAed: 1320,
    flightHoursFromDubai: 14.0,
    co2KgRoundtrip: 2940,
    visaHint: true,
  },
  {
    city: 'Tokyo',
    country: 'Japan',
    currency: 'JPY',
    perDiemAed: 410,
    typicalFlightAed: 4700,
    typicalHotelNightAed: 1020,
    flightHoursFromDubai: 9.5,
    co2KgRoundtrip: 2180,
    visaHint: true,
  },
];

export const CATEGORY_META: Record<
  ExpenseCategory,
  { label: string; glCode: string; hue: number; receiptThresholdAed: number; dailyCapAed?: number }
> = {
  flights: { label: 'Flights & Airfare', glCode: '6100-AIR', hue: 198, receiptThresholdAed: 1 },
  lodging: { label: 'Hotel & Lodging', glCode: '6110-HTL', hue: 262, receiptThresholdAed: 1, dailyCapAed: 1400 },
  meals: { label: 'Business Meals', glCode: '6120-MEL', hue: 34, receiptThresholdAed: 150, dailyCapAed: 280 },
  per_diem: { label: 'Daily Per Diem', glCode: '6125-PDM', hue: 162, receiptThresholdAed: 99_999 },
  ground: { label: 'Ground & Metro / Taxi', glCode: '6130-GND', hue: 186, receiptThresholdAed: 150 },
  client: { label: 'Client Hospitality', glCode: '6140-CLI', hue: 332, receiptThresholdAed: 1, dailyCapAed: 900 },
  conference: { label: 'Conferences & Visas', glCode: '6150-CNF', hue: 284, receiptThresholdAed: 1 },
  software: { label: 'Tools & Cloud Spend', glCode: '6240-SFT', hue: 220, receiptThresholdAed: 1 },
  other: { label: 'Other Business Spend', glCode: '6190-OTH', hue: 210, receiptThresholdAed: 150 },
};

export const TRIP_PURPOSE_META: Record<TripPurpose, { label: string; hint: string }> = {
  'client-summit': { label: 'Client Executive Briefing', hint: 'Customer revenue or renewal milestone' },
  'engineering-onsite': { label: 'Engineering / Architecture Sprint', hint: 'Cross-cell technical alignment' },
  conference: { label: 'Industry Conference / Speaker', hint: 'External talk, booth, or research' },
  'customer-launch': { label: 'Customer Deployment & Go-Live', hint: 'On-site enterprise onboarding' },
  'leadership-offsite': { label: 'Quarterly Leadership Offsite', hint: 'OKR & roadmap planning' },
};

export const TRIP_STATUS_META: Record<TripStatus, { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  pending_approval: { label: 'Awaiting Manager', tone: 'warning' },
  changes_requested: { label: 'Changes Requested', tone: 'warning' },
  approved: { label: 'Pre-Approved', tone: 'info' },
  booked: { label: 'Booked · Active', tone: 'success' },
  completed: { label: 'Trip Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  rejected: { label: 'Declined', tone: 'danger' },
};

export const REPORT_STATUS_META: Record<
  ExpenseReportStatus,
  { label: string; short: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger'; step: number }
> = {
  draft: { label: 'Draft Report', short: 'Draft', tone: 'neutral', step: 4 },
  submitted: { label: 'Manager Review', short: 'Manager Review', tone: 'warning', step: 5 },
  changes_requested: { label: 'Needs Revision', short: 'Needs Revision', tone: 'warning', step: 4 },
  manager_approved: { label: 'Finance Audit', short: 'Finance Audit', tone: 'info', step: 5 },
  payroll_queued: { label: 'Queued for Payroll', short: 'In Payroll Queue', tone: 'info', step: 6 },
  reimbursed: { label: 'Reimbursed & Paid', short: 'Paid', tone: 'success', step: 7 },
  rejected: { label: 'Rejected', short: 'Rejected', tone: 'danger', step: 5 },
};

export const FLOW_STEPS = [
  { step: 1, title: 'Travel Request', sub: 'Itinerary, per-diem & CO₂ check' },
  { step: 2, title: 'Pre-Approval', sub: 'Manager sign-off & virtual card' },
  { step: 3, title: 'Upload Receipts', sub: 'AI OCR scan, FX & VAT extraction' },
  { step: 4, title: 'Submit Expenses', sub: 'Bundle receipts + per diem' },
  { step: 5, title: 'Manager & Finance', sub: 'Four-eyes policy & GL audit' },
  { step: 6, title: 'Payroll Queue', sub: 'Synced into monthly pay run' },
  { step: 7, title: 'Reimbursed', sub: 'Paid via WPS & on HR payslip' },
] as const;

export const DEPT_COST_CENTER: Record<Department, string> = {
  Engineering: 'CC-410 · Platform & R&D',
  Product: 'CC-420 · Product Strategy',
  Design: 'CC-430 · Design & Research',
  'People Ops': 'CC-210 · People & Talent',
  Finance: 'CC-110 · Finance & Legal',
  Sales: 'CC-510 · Global Revenue',
  Marketing: 'CC-520 · Brand & Growth',
  Operations: 'CC-310 · Workplace & Ops',
  'IT & Security': 'CC-440 · Trust & Security',
  'Customer Success': 'CC-530 · Enterprise Success',
};

export const DEPT_QUARTERLY_TRAVEL_BUDGET_AED: Record<Department, number> = {
  Engineering: 68_000,
  Product: 42_000,
  Design: 28_000,
  'People Ops': 26_000,
  Finance: 22_000,
  Sales: 95_000,
  Marketing: 38_000,
  Operations: 30_000,
  'IT & Security': 34_000,
  'Customer Success': 44_000,
};

export function convertToAed(amount: number, currency: CurrencyCode): { fxRate: number; amountAed: number } {
  const fxRate = FX_TO_AED[currency] ?? 1;
  return { fxRate, amountAed: Math.round(amount * fxRate * 100) / 100 };
}

export function evaluateTripPolicy(input: {
  departureDate: string;
  today: string;
  cabinClass: CabinClass;
  flightHours: number;
  totalEstimatedAed: number;
}): string[] {
  const flags: string[] = [];
  const advanceDays = daysBetween(input.today, input.departureDate);
  if (advanceDays >= 0 && advanceDays < 7) {
    flags.push(`Short-notice booking (${advanceDays}d ahead — 7+ days preferred for best fares).`);
  }
  if (input.cabinClass === 'business' && input.flightHours < 6) {
    flags.push('Business class requested on a flight under 6 hours (requires VP/Finance justification).');
  }
  if (input.totalEstimatedAed > 18_000) {
    flags.push('High-value trip (> AED 18,000) — Finance receives automatic visibility.');
  }
  return flags;
}

export function evaluateReceiptWarnings(input: {
  category: ExpenseCategory;
  amountAed: number;
  hasFile: boolean;
  existingReceipts?: { merchant: string; date: string; amountAed: number; id?: string }[];
  merchant: string;
  date: string;
  excludeId?: string;
}): PolicyWarning[] {
  const meta = CATEGORY_META[input.category];
  const warnings: PolicyWarning[] = [];
  if (!input.hasFile && input.amountAed >= meta.receiptThresholdAed && input.category !== 'per_diem') {
    warnings.push({
      code: 'missing_receipt',
      severity: 'warn',
      message: `Receipt attachment required for ${meta.label} ≥ AED ${meta.receiptThresholdAed}.`,
    });
  }
  if (meta.dailyCapAed && input.amountAed > meta.dailyCapAed && input.category === 'meals') {
    warnings.push({
      code: 'over_meal_cap',
      severity: 'warn',
      message: `Exceeds AED ${meta.dailyCapAed} single-meal guideline — add attendee context.`,
    });
  }
  if (input.amountAed > 8_500) {
    warnings.push({
      code: 'high_spend',
      severity: 'info',
      message: 'High-value line item (> AED 8,500) flagged for Finance VAT review.',
    });
  }
  const dup = (input.existingReceipts ?? []).some(
    (r) =>
      r.id !== input.excludeId &&
      r.date === input.date &&
      Math.abs(r.amountAed - input.amountAed) < 1 &&
      r.merchant.toLowerCase() === input.merchant.trim().toLowerCase(),
  );
  if (dup) {
    warnings.push({
      code: 'duplicate_suspect',
      severity: 'warn',
      message: 'Possible duplicate receipt: identical merchant, date, and AED amount already in vault.',
    });
  }
  return warnings;
}

/** Smart simulated OCR receipt scanner from filename or pasted receipt text! */
export interface ScannedReceiptDraft {
  merchant: string;
  category: ExpenseCategory;
  currency: CurrencyCode;
  originalAmount: number;
  date: string;
  vatAed: number;
  confidence: number;
  notes: string;
}

export const SAMPLE_SMART_RECEIPTS: {
  id: string;
  label: string;
  fileName: string;
  merchant: string;
  category: ExpenseCategory;
  currency: CurrencyCode;
  amount: number;
  notes: string;
}[] = [
  {
    id: 'sr-flight',
    label: 'Emirates DXB ⇄ LHR e-Ticket',
    fileName: 'emirates-eticket-lhr.pdf',
    merchant: 'Emirates Airline',
    category: 'flights',
    currency: 'AED',
    amount: 3480,
    notes: 'Return Economy Flex DXB–LHR',
  },
  {
    id: 'sr-hotel',
    label: 'CitizenM Tower of London (3 nights)',
    fileName: 'citizenm-london-folio.pdf',
    merchant: 'CitizenM Hotels London',
    category: 'lodging',
    currency: 'GBP',
    amount: 645,
    notes: '3 nights lodging incl. city tax',
  },
  {
    id: 'sr-taxi',
    label: 'Heathrow Express & Uber UK',
    fileName: 'heathrow-express-receipt.png',
    merchant: 'Heathrow Express',
    category: 'ground',
    currency: 'GBP',
    amount: 42,
    notes: 'Airport rail transfer Paddington',
  },
  {
    id: 'sr-dinner',
    label: 'Dishoom Shoreditch · Team Dinner',
    fileName: 'dishoom-london-dinner.jpg',
    merchant: 'Dishoom Shoreditch',
    category: 'client',
    currency: 'GBP',
    amount: 118,
    notes: 'Customer architecture workshop dinner (4 attendees)',
  },
];

export function scanReceiptFile(fileNameOrText: string, fallbackDate: string): ScannedReceiptDraft {
  const s = fileNameOrText.toLowerCase();
  if (s.includes('emirates') || s.includes('etihad') || s.includes('flight') || s.includes('air') || s.includes('lufthansa')) {
    return {
      merchant: s.includes('lufthansa') ? 'Lufthansa' : 'Emirates Airline',
      category: 'flights',
      currency: 'AED',
      originalAmount: 3420,
      date: fallbackDate,
      vatAed: 0,
      confidence: 98,
      notes: 'Auto-extracted airfare itinerary & e-ticket number',
    };
  }
  if (s.includes('hotel') || s.includes('marriott') || s.includes('hilton') || s.includes('citizenm') || s.includes('folio')) {
    const conv = convertToAed(620, s.includes('london') || s.includes('gbp') ? 'GBP' : 'EUR');
    return {
      merchant: s.includes('citizenm') ? 'CitizenM Hotels' : 'Marriott Courtyard',
      category: 'lodging',
      currency: s.includes('london') || s.includes('gbp') ? 'GBP' : 'EUR',
      originalAmount: 620,
      date: fallbackDate,
      vatAed: Math.round(conv.amountAed * 0.08 * 100) / 100,
      confidence: 96,
      notes: 'Multi-night hotel folio extracted via Smart OCR',
    };
  }
  if (s.includes('uber') || s.includes('careem') || s.includes('taxi') || s.includes('heathrow') || s.includes('rail')) {
    return {
      merchant: s.includes('careem') ? 'Careem Technologies' : s.includes('heathrow') ? 'Heathrow Express' : 'Uber Trip',
      category: 'ground',
      currency: s.includes('careem') ? 'AED' : 'GBP',
      originalAmount: s.includes('careem') ? 94 : 38,
      date: fallbackDate,
      vatAed: 4.5,
      confidence: 97,
      notes: 'Airport / venue ground transport receipt',
    };
  }
  if (s.includes('dinner') || s.includes('cafe') || s.includes('dishoom') || s.includes('lunch') || s.includes('meal')) {
    return {
      merchant: s.includes('dishoom') ? 'Dishoom' : 'Artisan Kitchen',
      category: 'meals',
      currency: s.includes('gbp') || s.includes('dishoom') ? 'GBP' : 'AED',
      originalAmount: s.includes('gbp') || s.includes('dishoom') ? 54 : 185,
      date: fallbackDate,
      vatAed: 9.25,
      confidence: 94,
      notes: 'Itemised dining receipt (alcohol excluded)',
    };
  }
  const cleanName = fileNameOrText
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  const titled = cleanName ? cleanName[0].toUpperCase() + cleanName.slice(1) : 'Merchant Receipt';
  return {
    merchant: titled.slice(0, 38),
    category: 'other',
    currency: 'AED',
    originalAmount: 240,
    date: fallbackDate,
    vatAed: 12,
    confidence: 91,
    notes: 'Extracted from uploaded receipt image',
  };
}
