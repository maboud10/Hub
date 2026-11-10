/**
 * Nova · Smart receipts — a tiny, deterministic intent parser for the
 * Travel & Expenses home prompt.
 *
 * One line of plain English ("Taxi to DXB airport 85 AED", "Trip to London
 * next week for the summit") becomes a structured draft that pre-fills the
 * Receipt vault form or the Travel desk request. Drafts are (de)serialised
 * to URL search params so the hand-off survives navigation and deep links.
 * Pure functions only (no React, no store) — see nova.test.ts.
 */
import { addDaysISO, daysBetween, startOfWeek } from '@/hr/calendar';
import { CATEGORY_META, DESTINATION_PRESETS, FX_TO_AED, TRIP_PURPOSE_META, type DestinationPreset } from '@/expenses/constants';
import type { CabinClass, CurrencyCode, ExpenseCategory, PaymentMethod, TripPurpose } from '@/expenses/types';

export interface ReceiptDraft {
  merchant: string;
  amount: number;
  currency: CurrencyCode;
  category: ExpenseCategory;
  date: string;
  notes: string;
  attendees?: string;
  payment: PaymentMethod;
}

export interface TripDraft {
  /** Destination city ('' when Nova could not tell). */
  city: string;
  country: string;
  departureDate: string;
  returnDate: string;
  purpose: TripPurpose;
  title: string;
  justification: string;
  cabin: CabinClass;
}

export type NovaIntent =
  | { kind: 'expense'; draft: ReceiptDraft }
  | { kind: 'trip'; draft: TripDraft }
  | { kind: 'status' }
  | { kind: 'report' }
  | { kind: 'unknown'; notes: string };

export interface NovaContext {
  /** ISO `YYYY-MM-DD` used for relative dates ("yesterday", "next week"). */
  today: string;
  /** Traveller's home city — never picked as a trip destination. */
  homeCity?: string;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ---------- small helpers ---------- */

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  'a couple of': 2,
  'a few': 3,
};
const NUM_WORD = String.raw`(\d+|a couple of|a few|an?|one|two|three|four|five|six|seven|eight|nine|ten)`;

function wordNum(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : (NUMBER_WORDS[raw.toLowerCase()] ?? 1);
}

const capFirst = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const titleCase = (s: string) => s.replace(/(^|[\s/-])([a-z])/g, (_m, sep: string, c: string) => sep + c.toUpperCase());
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/* ---------- money ---------- */

const CURRENCY_WORDS: Record<string, CurrencyCode> = {
  aed: 'AED',
  dh: 'AED',
  dhs: 'AED',
  dirham: 'AED',
  dirhams: 'AED',
  usd: 'USD',
  dollar: 'USD',
  dollars: 'USD',
  bucks: 'USD',
  eur: 'EUR',
  euro: 'EUR',
  euros: 'EUR',
  gbp: 'GBP',
  pound: 'GBP',
  pounds: 'GBP',
  quid: 'GBP',
  sgd: 'SGD',
  sar: 'SAR',
  riyal: 'SAR',
  riyals: 'SAR',
  jpy: 'JPY',
  yen: 'JPY',
};
const CURRENCY_SYMBOLS: Record<string, CurrencyCode> = { s$: 'SGD', '£': 'GBP', '€': 'EUR', $: 'USD', '¥': 'JPY' };

const AMOUNT = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s?(k\b)?`;
const WORDS = Object.keys(CURRENCY_WORDS)
  .sort((a, b) => b.length - a.length)
  .join('|');
const RE_CODE_FIRST = new RegExp(String.raw`\b(${WORDS})\.?\s?${AMOUNT}`, 'i');
const RE_CODE_AFTER = new RegExp(String.raw`${AMOUNT}\s?(${WORDS})\b`, 'i');
const RE_SYMBOL = new RegExp(String.raw`(s\$|£|€|\$|¥)\s?${AMOUNT}`, 'i');

const toAmount = (raw: string, k?: string) => {
  const n = Number(raw.replace(/,/g, ''));
  return Math.round((k ? n * 1000 : n) * 100) / 100;
};

export interface MoneyMatch {
  amount: number;
  currency: CurrencyCode;
  /** Exact substring that carried the amount (removed before merchant extraction). */
  match: string;
}

/** "85 AED", "AED 1,240", "£42", "$120", "1.5k dirhams" → amount + currency. */
export function parseMoney(text: string): MoneyMatch | null {
  const found: (MoneyMatch & { index: number })[] = [];
  const sym = RE_SYMBOL.exec(text);
  if (sym) found.push({ amount: toAmount(sym[2], sym[3]), currency: CURRENCY_SYMBOLS[sym[1].toLowerCase()], match: sym[0], index: sym.index });
  const first = RE_CODE_FIRST.exec(text);
  if (first) found.push({ amount: toAmount(first[2], first[3]), currency: CURRENCY_WORDS[first[1].toLowerCase()], match: first[0], index: first.index });
  const after = RE_CODE_AFTER.exec(text);
  if (after) found.push({ amount: toAmount(after[1], after[2]), currency: CURRENCY_WORDS[after[3].toLowerCase()], match: after[0], index: after.index });
  const best = found.filter((f) => f.amount > 0 && f.currency).sort((a, b) => a.index - b.index)[0];
  return best ? { amount: best.amount, currency: best.currency, match: best.match } : null;
}

const UNIT_AFTER = /^\s*(nights?|days?|weeks?|months?|people|persons?|pax|guests?|clients?|customers?|attendees?|colleagues?|ppl|km|kms|miles?|mi|h|hrs?|hours?|mins?|minutes?|x|%|pm|am|st|nd|rd|th)\b/i;

/** Largest bare number that is not a count, duration, time or terminal number ("Taxi to T3 85" → 85). */
function looseAmount(text: string): number | null {
  const re = /(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g;
  let best = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const rest = text.slice(m.index + m[0].length);
    const before = text.slice(Math.max(0, m.index - 12), m.index);
    if (UNIT_AFTER.test(rest)) continue;
    if (/\b(terminal|gate|t|flight|room|table|no\.?|#)\s*$/i.test(before) || /[a-z]$/i.test(before)) continue;
    if (/[:/-]$/.test(before) || /^[:/-]\d/.test(rest)) continue;
    const n = Number(m[0].replace(/,/g, ''));
    if (/^20\d{2}$/.test(m[0]) && MONTH_RE.test(text)) continue;
    if (n > best) best = n;
  }
  return best > 0 ? best : null;
}

/* ---------- dates ---------- */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const isoOf = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const weekdayOf = (iso: string) => new Date(`${iso}T12:00:00`).getDay();

/**
 * Relative / absolute date hints. `past` bias suits receipts ("Friday" =
 * last Friday), `future` suits trips ("Friday" = the coming Friday).
 */
export function parseDateHint(text: string, today: string, bias: 'past' | 'future'): string | null {
  const t = text.toLowerCase();
  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];
  if (/\bday before yesterday\b/.test(t)) return addDaysISO(today, -2);
  if (/\byesterday\b/.test(t)) return addDaysISO(today, -1);
  if (/\bday after tomorrow\b/.test(t)) return addDaysISO(today, 2);
  if (/\btomorrow\b/.test(t)) return addDaysISO(today, 1);
  if (/\b(today|tonight|this morning|this afternoon|this evening)\b/.test(t)) return today;
  if (/\bnext week\b/.test(t)) return addDaysISO(startOfWeek(today), 7);
  if (/\blast week\b/.test(t)) return addDaysISO(startOfWeek(today), -7);
  if (/\bthis week(end)?\b/.test(t)) return bias === 'future' ? addDaysISO(today, 1) : today;
  if (/\bnext month\b/.test(t)) {
    const [y, m] = today.split('-').map(Number);
    const first = isoOf(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1);
    const dow = weekdayOf(first);
    return addDaysISO(first, (8 - dow) % 7);
  }
  const inN = t.match(new RegExp(String.raw`\bin\s+${NUM_WORD}\s+(days?|weeks?|months?)\b`));
  if (inN) {
    const n = wordNum(inN[1]);
    return addDaysISO(today, inN[2].startsWith('week') ? n * 7 : inN[2].startsWith('month') ? n * 30 : n);
  }
  const ago = t.match(new RegExp(String.raw`\b${NUM_WORD}\s+(days?|weeks?)\s+ago\b`));
  if (ago) return addDaysISO(today, -(wordNum(ago[1]) * (ago[2].startsWith('week') ? 7 : 1)));

  const dm = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/);
  const md = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (dm || md) {
    const day = Number(dm ? dm[1] : md![2]);
    const mon = MONTHS.indexOf((dm ? dm[2] : md![1]).slice(0, 3));
    if (day >= 1 && day <= 31 && mon >= 0) {
      const y = Number(today.slice(0, 4));
      let candidate = isoOf(y, mon, day);
      if (bias === 'future' && candidate < today) candidate = isoOf(y + 1, mon, day);
      if (bias === 'past' && candidate > today) candidate = isoOf(y - 1, mon, day);
      return candidate;
    }
  }

  const wd = t.match(/\b(?:(last|next|this|on)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (wd) {
    const target = WEEKDAYS.indexOf(wd[2]);
    const now = weekdayOf(today);
    if (bias === 'past' || wd[1] === 'last') {
      const back = (now - target + 7) % 7 || 7;
      return addDaysISO(today, -back);
    }
    const ahead = (target - now + 7) % 7 || 7;
    return addDaysISO(today, ahead);
  }
  return null;
}

/** "for 3 days" → 2 nights, "4 nights" → 4, "for a week" → 6 nights. */
export function parseNights(text: string): number | null {
  const t = text.toLowerCase();
  const nights = t.match(new RegExp(String.raw`\b${NUM_WORD}[\s-]+nights?\b`));
  if (nights) return Math.max(1, wordNum(nights[1]));
  const forDur = t.match(new RegExp(String.raw`\bfor\s+${NUM_WORD}\s+(days?|weeks?)\b`));
  const dashDay = t.match(/\b(\d+)-day\b/);
  if (forDur) {
    const n = wordNum(forDur[1]);
    return forDur[2].startsWith('week') ? n * 7 - 1 : Math.max(1, n - 1);
  }
  if (dashDay) return Math.max(1, Number(dashDay[1]) - 1);
  return null;
}

/* ---------- places ---------- */

const CITY_ALIASES: Record<string, string> = {
  nyc: 'New York',
  'new york city': 'New York',
  manhattan: 'New York',
  jfk: 'New York',
  bangalore: 'Bengaluru',
  blr: 'Bengaluru',
  lhr: 'London',
  ldn: 'London',
  heathrow: 'London',
  ksa: 'Riyadh',
  ruh: 'Riyadh',
  tyo: 'Tokyo',
  hnd: 'Tokyo',
  nrt: 'Tokyo',
  changi: 'Singapore',
};

/** First destination preset mentioned by name or common alias. */
export function findPreset(text: string): DestinationPreset | undefined {
  const t = text.toLowerCase();
  const direct = DESTINATION_PRESETS.find((p) => new RegExp(String.raw`\b${p.city.toLowerCase()}\b`).test(t));
  if (direct) return direct;
  for (const [alias, city] of Object.entries(CITY_ALIASES)) {
    if (new RegExp(String.raw`\b${alias}\b`).test(t)) return DESTINATION_PRESETS.find((p) => p.city === city);
  }
  return undefined;
}

const NOT_A_PLACE = new Set(['The', 'A', 'An', 'My', 'Our', 'Meet', 'See', 'Visit', 'Next', 'This', 'Q1', 'Q2', 'Q3', 'Q4', 'HQ', 'Nova']);

function capturedCity(text: string, homeCity?: string): string {
  const re = /\b(?:to|in|visit(?:ing)?)\s+([A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+)?)/gu;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const words = m[1].split(/\s+/).filter((w) => !NOT_A_PLACE.has(w) && !MONTH_RE.test(w) && !WEEKDAYS.includes(w.toLowerCase()));
    const city = words.join(' ');
    if (city && city.toLowerCase() !== homeCity?.toLowerCase()) return city;
  }
  return '';
}

/* ---------- receipts ---------- */

const BRANDS: [RegExp, string, ExpenseCategory][] = [
  [/\buber\b/i, 'Uber', 'ground'],
  [/\bcareem\b/i, 'Careem', 'ground'],
  [/\blyft\b/i, 'Lyft', 'ground'],
  [/\bsalik\b/i, 'Salik (RTA)', 'ground'],
  [/\bheathrow express\b/i, 'Heathrow Express', 'ground'],
  [/\bemirates\b/i, 'Emirates Airline', 'flights'],
  [/\betihad\b/i, 'Etihad Airways', 'flights'],
  [/\bflydubai\b/i, 'flydubai', 'flights'],
  [/\bqatar airways\b/i, 'Qatar Airways', 'flights'],
  [/\blufthansa\b/i, 'Lufthansa', 'flights'],
  [/\bsingapore airlines\b/i, 'Singapore Airlines', 'flights'],
  [/\bmarriott\b/i, 'Marriott', 'lodging'],
  [/\bhilton\b/i, 'Hilton', 'lodging'],
  [/\bhyatt\b/i, 'Hyatt', 'lodging'],
  [/\bcitizen ?m\b/i, 'CitizenM', 'lodging'],
  [/\bairbnb\b/i, 'Airbnb', 'lodging'],
  [/\brove\b/i, 'Rove Hotels', 'lodging'],
  [/\bstarbucks\b/i, 'Starbucks', 'meals'],
  [/\bzuma\b/i, 'Zuma', 'meals'],
  [/\bdishoom\b/i, 'Dishoom', 'meals'],
  [/\bpret\b/i, 'Pret A Manger', 'meals'],
  [/\b(aws|amazon web services)\b/i, 'Amazon Web Services', 'software'],
  [/\bfigma\b/i, 'Figma', 'software'],
  [/\bgithub\b/i, 'GitHub', 'software'],
  [/\bnotion\b/i, 'Notion', 'software'],
  [/\b(openai|chatgpt)\b/i, 'OpenAI', 'software'],
];

const CATEGORY_RULES: [RegExp, ExpenseCategory][] = [
  [/\b(per ?diem|daily allowance)\b/i, 'per_diem'],
  [/\b(flights?|airfare|air ticket|plane ticket|e-?ticket|airline|baggage)\b/i, 'flights'],
  [/\b(taxi|cab|uber|careem|lyft|metro|train|rail|tram|bus|parking|fuel|petrol|toll|salik|transfer|car rental|rental car|ride)\b/i, 'ground'],
  [/\b(hotel|lodging|accommodation|airbnb|room|stay|nights?)\b/i, 'lodging'],
  [/\b(lunch|dinner|breakfast|brunch|coffee|meal|cafe|café|restaurant|snacks?|food|drinks)\b/i, 'meals'],
  [/\b(conference|summit|expo|registration|visa|event pass|tickets?)\b/i, 'conference'],
  [/\b(software|subscription|saas|licen[cs]e|seats?|cloud|hosting|domain)\b/i, 'software'],
];
const MEAL_WORD = /\b(lunch|dinner|breakfast|brunch|coffee|meal|drinks|restaurant)\b/i;
const CLIENT_WORD = /\b(clients?|customers?|partners?|prospects?|hospitality)\b/i;

/** Category whose keyword appears first; client + meal words → client hospitality. */
export function classifyExpense(text: string): ExpenseCategory {
  if (MEAL_WORD.test(text) && CLIENT_WORD.test(text)) return 'client';
  let best: { at: number; cat: ExpenseCategory } | null = null;
  for (const [re, cat] of CATEGORY_RULES) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.at)) best = { at: m.index, cat };
  }
  return best?.cat ?? 'other';
}

const STOP_WORDS = /\b(to|at|for|with|on|from|in|via|near|by|incl|including|and|yesterday|today|tonight|last|this)\b/i;

function merchantFor(text: string, money: MoneyMatch | null, category: ExpenseCategory, city?: string): string {
  const brand = BRANDS.find(([re]) => re.test(text));
  if (brand) return brand[1];
  const at = text.match(/\bat\s+(?:the\s+)?([A-Z][\w&'’.-]*(?:\s+[A-Z][\w&'’.-]*){0,3})/);
  if (at) return at[1];
  let s = money ? text.replace(money.match, ' ') : text;
  s = s.replace(/\d[\d,.]*\s?k?\b/g, ' ');
  const stop = s.search(STOP_WORDS);
  const head = clean(stop >= 0 ? s.slice(0, stop) : s)
    .split(' ')
    .filter(Boolean)
    .slice(0, 3)
    .join(' ');
  if (!head) return CATEGORY_META[category].label;
  if (/^taxi$/i.test(head) && money?.currency === 'AED') return 'Dubai Taxi';
  const nice = capFirst(head);
  return city && !nice.toLowerCase().includes(city.toLowerCase()) ? `${nice} · ${city}` : nice;
}

function attendeesFor(text: string, category: ExpenseCategory): string | undefined {
  if (category !== 'meals' && category !== 'client') return undefined;
  const m = text.match(/\bwith\s+(.+?)(?=\s+(?:at|for|on|in|yesterday|today|last)\b|[,.;]|$)/i);
  if (!m) return undefined;
  const who = clean(m[1].replace(RE_CODE_AFTER, ' ').replace(RE_CODE_FIRST, ' ').replace(RE_SYMBOL, ' '));
  return who.length >= 2 ? who : undefined;
}

/* ---------- trips ---------- */

const TRIP_WORDS = /\b(trip|travel(?:l?ing)?|fly(?:ing)?|visit(?:ing)?|onsite|on-site|offsite|off-site|summit|conference|go(?:ing)? to|head(?:ing)? to|journey|business trip)\b/i;

const PURPOSE_RULES: [RegExp, TripPurpose][] = [
  [/\b(offsite|off-site|leadership|planning|strategy|okrs?)\b/i, 'leadership-offsite'],
  [/\b(launch|go-?live|deployment|deploy|rollout|roll-out|implementation|onboarding)\b/i, 'customer-launch'],
  [/\b(conference|expo|keynote|talk|speaker|speaking|meetup)\b/i, 'conference'],
  [/\b(onsite|on-site|sprint|hackathon|architecture|engineering|workshop)\b/i, 'engineering-onsite'],
  [/\b(client|customer|briefing|summit|renewal|qbr|account|sales|pitch|deal)\b/i, 'client-summit'],
];

const PURPOSE_SHORT: Record<TripPurpose, string> = {
  'client-summit': 'Client Briefing',
  'engineering-onsite': 'Engineering Onsite',
  conference: 'Conference',
  'customer-launch': 'Customer Go-Live',
  'leadership-offsite': 'Leadership Offsite',
};

export function classifyPurpose(text: string): TripPurpose {
  return PURPOSE_RULES.find(([re]) => re.test(text))?.[1] ?? 'client-summit';
}

const DURATION_ONLY = new RegExp(String.raw`^${NUM_WORD}\s+(nights?|days?|weeks?)$`, 'i');

function tripTitle(text: string, city: string, purpose: TripPurpose): string {
  const re = /\bfor\s+(?:the\s+|a\s+|an\s+|our\s+|my\s+)?([^,.;]+?)(?=\s+(?:for|next|this|on|in|from|tomorrow|with)\b|[,.;]|$)/gi;
  let topic = '';
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const t = clean(m[1]);
    if (t && !DURATION_ONLY.test(t)) topic = t;
  }
  const label = topic ? titleCase(topic) : PURPOSE_SHORT[purpose];
  return city ? `${city} ${label}` : label;
}

/* ---------- entry point ---------- */

/** Understand one line from the Nova prompt. */
export function parseNovaIntent(input: string, ctx: NovaContext): NovaIntent {
  const text = clean(input);
  if (!text) return { kind: 'unknown', notes: '' };
  const money = parseMoney(text);
  const preset = findPreset(text);

  const wantsTrip = TRIP_WORDS.test(text);
  if (money || (!wantsTrip && looseAmount(text) && classifyExpense(text) !== 'other')) {
    const brand = BRANDS.find(([re]) => re.test(text));
    const classified = classifyExpense(text);
    const category = classified === 'client' ? 'client' : (brand?.[2] ?? classified);
    const amount = money?.amount ?? looseAmount(text) ?? 0;
    const currency = money?.currency ?? 'AED';
    return {
      kind: 'expense',
      draft: {
        merchant: merchantFor(text, money, category, preset?.city),
        amount,
        currency,
        category,
        date: parseDateHint(text, ctx.today, 'past') ?? ctx.today,
        notes: capFirst(text).slice(0, 160),
        attendees: attendeesFor(text, category),
        payment: /\b(corp(?:orate)?|company|virtual|travel)\s+card\b/i.test(text) ? 'corporate_card' : 'personal_reimbursable',
      },
    };
  }

  if (wantsTrip || (preset && preset.city.toLowerCase() !== ctx.homeCity?.toLowerCase())) {
    const city = preset?.city ?? capturedCity(text, ctx.homeCity);
    const departureDate = parseDateHint(text, ctx.today, 'future') ?? addDaysISO(ctx.today, 14);
    const nights = parseNights(text) ?? 3;
    const purpose = classifyPurpose(text);
    return {
      kind: 'trip',
      draft: {
        city,
        country: preset?.country ?? '',
        departureDate,
        returnDate: addDaysISO(departureDate, nights),
        purpose,
        title: tripTitle(text, city, purpose),
        justification: capFirst(text),
        cabin: /\b(business class|in business|flying business)\b/i.test(text) ? 'business' : /\bpremium\b/i.test(text) ? 'premium-economy' : 'economy',
      },
    };
  }

  if (/\b(where(?:'s|’s| is) my (?:money|reimbursement|refund|claim)|reimburse(?:d|ment|ments)?|payday|pay ?slip|get paid|claim status|status of my)\b/i.test(text)) {
    return { kind: 'status' };
  }
  if (/\b(submit|bundle|create|file|build|start|new)\b.*\b(report|claim)\b|\bexpense report\b/i.test(text)) {
    return { kind: 'report' };
  }
  return { kind: 'unknown', notes: capFirst(text).slice(0, 160) };
}

/* ---------- URL hand-off ---------- */

/** Search-param keys owned by the receipt hand-off (stripped once applied). */
export const RECEIPT_DRAFT_KEYS = ['nova', 'merchant', 'amount', 'currency', 'category', 'date', 'notes', 'attendees', 'pay'] as const;
/** Search-param keys owned by the trip hand-off (stripped once applied). */
export const TRIP_DRAFT_KEYS = ['dest', 'country', 'depart', 'ret', 'purpose', 'title', 'why', 'cabin'] as const;

export function receiptDraftToSearch(d: Partial<ReceiptDraft>): string {
  const p = new URLSearchParams({ nova: '1' });
  if (d.merchant) p.set('merchant', d.merchant);
  if (d.amount) p.set('amount', String(d.amount));
  if (d.currency) p.set('currency', d.currency);
  if (d.category) p.set('category', d.category);
  if (d.date) p.set('date', d.date);
  if (d.notes) p.set('notes', d.notes);
  if (d.attendees) p.set('attendees', d.attendees);
  if (d.payment) p.set('pay', d.payment === 'corporate_card' ? 'card' : 'personal');
  return p.toString();
}

/** Reads a receipt hand-off (`?nova=1&…`); every field is validated. */
export function readReceiptDraft(sp: URLSearchParams): Partial<ReceiptDraft> | null {
  if (sp.get('nova') !== '1') return null;
  const d: Partial<ReceiptDraft> = {};
  const merchant = sp.get('merchant')?.trim();
  if (merchant) d.merchant = merchant.slice(0, 60);
  const amount = Number(sp.get('amount'));
  if (Number.isFinite(amount) && amount > 0) d.amount = amount;
  const currency = sp.get('currency')?.toUpperCase();
  if (currency && currency in FX_TO_AED) d.currency = currency as CurrencyCode;
  const category = sp.get('category');
  if (category && category in CATEGORY_META) d.category = category as ExpenseCategory;
  const date = sp.get('date');
  if (date && ISO_RE.test(date)) d.date = date;
  const notes = sp.get('notes')?.trim();
  if (notes) d.notes = notes.slice(0, 200);
  const attendees = sp.get('attendees')?.trim();
  if (attendees) d.attendees = attendees.slice(0, 120);
  const pay = sp.get('pay');
  if (pay === 'card') d.payment = 'corporate_card';
  else if (pay === 'personal') d.payment = 'personal_reimbursable';
  return d;
}

export function tripDraftToSearch(d: TripDraft): string {
  const p = new URLSearchParams({ new: '1' });
  if (d.city) p.set('dest', d.city);
  if (d.country) p.set('country', d.country);
  p.set('depart', d.departureDate);
  p.set('ret', d.returnDate);
  p.set('purpose', d.purpose);
  if (d.title) p.set('title', d.title);
  if (d.justification) p.set('why', d.justification);
  if (d.cabin !== 'economy') p.set('cabin', d.cabin);
  return p.toString();
}

/** Reads a trip hand-off (`?new=1&dest=…`); `null` when there is nothing to apply. */
export function readTripDraft(sp: URLSearchParams): Partial<TripDraft> | null {
  if (!TRIP_DRAFT_KEYS.some((k) => sp.has(k))) return null;
  const d: Partial<TripDraft> = {};
  const city = sp.get('dest')?.trim();
  if (city) d.city = city.slice(0, 48);
  const country = sp.get('country')?.trim();
  if (country) d.country = country.slice(0, 48);
  const dep = sp.get('depart');
  if (dep && ISO_RE.test(dep)) d.departureDate = dep;
  const ret = sp.get('ret');
  if (ret && ISO_RE.test(ret) && (!d.departureDate || ret >= d.departureDate)) d.returnDate = ret;
  const purpose = sp.get('purpose');
  if (purpose && purpose in TRIP_PURPOSE_META) d.purpose = purpose as TripPurpose;
  const title = sp.get('title')?.trim();
  if (title) d.title = title.slice(0, 90);
  const why = sp.get('why')?.trim();
  if (why) d.justification = why.slice(0, 400);
  const cabin = sp.get('cabin');
  if (cabin === 'business' || cabin === 'premium-economy' || cabin === 'economy') d.cabin = cabin;
  return d;
}

/** Nights between two ISO dates (≥ 1) — used to scale hotel estimates. */
export const nightsBetween = (dep: string, ret: string) => Math.max(1, daysBetween(dep, ret));
