/**
 * Helix Mail — deterministic, viewer-aware seed (all times relative to "now").
 *
 * The signed-in person owns the mailbox: their manager (or the CEO office for
 * people without one), their reports and colleagues write to them, alongside
 * customers (Emirates Group, Aramex, DP World), vendors, newsletters, SaaS
 * notifications, receipts and a few phishing lookalikes held in the Screener.
 */
import { SEED_USERS } from '@/data/users';
import type { User } from '@/types';
import { DAY, HOUR, MIN, atLocal, dayKey, nextWeekdayAt, nextWeekdayOffset, whenOnline } from './engine';
import type {
  ApprovalItem,
  AttachmentKind,
  MailAttachment,
  MailContact,
  MailData,
  MailDraft,
  MailHistory,
  MailMessage,
  MailReminder,
  MailStream,
  MailThread,
  MailboxData,
  NovaSignals,
  ScheduledSend,
  Sensitivity,
  SharedConversation,
  SharedMailbox,
  ThreadCategory,
  TrustSignals,
} from './types';

export const MAIL_DATA_VERSION = 2;

/* ==========================================================================
   Shared mailboxes (static config)
   ========================================================================== */

export const SHARED_MAILBOXES: SharedMailbox[] = [
  {
    id: 'it-support',
    address: 'it-support@helix.co',
    name: 'IT Support',
    description: 'Device, access and security questions from every Helix hub.',
    members: ['u-layla', 'u-ethan', 'u-mateo'],
    departments: ['IT & Security'],
    perms: ['helpdesk.manage'],
    slaMins: 240,
    canned: [
      { id: 'c-it-1', title: 'Reset steps sent', body: 'Thanks for reaching out! Please try the steps in the attached guide (sign out, clear the VPN profile, sign back in with your security key). If it still fails, reply here and we will call you.' },
      { id: 'c-it-2', title: 'Phish confirmed', body: 'Good catch — this is a phishing email impersonating Helix. Please don’t click any links. We’ve blocked the sender for everyone and you don’t need to do anything else.' },
      { id: 'c-it-3', title: 'Licence approved', body: 'Your licence request is approved. You’ll receive an activation email within the hour.' },
    ],
  },
  {
    id: 'people-ops',
    address: 'people-ops@helix.co',
    name: 'People Ops',
    description: 'Letters, benefits, leave and policy questions.',
    members: ['u-sara', 'u-fatima'],
    departments: ['People Ops'],
    perms: ['hr.people.manage'],
    slaMins: 480,
    canned: [
      { id: 'c-po-1', title: 'Letter on the way', body: 'Your letter has been requested and will be issued in the HR Portal (Documents) within one working day.' },
      { id: 'c-po-2', title: 'Book a private chat', body: 'Thanks for trusting us with this. Let’s talk privately — pick any slot on my calendar this week and nothing is shared with your manager without your OK.' },
    ],
  },
  {
    id: 'sales',
    address: 'sales@helix.co',
    name: 'Sales',
    description: 'Inbound leads, pricing and demo requests.',
    members: ['u-noah', 'u-yusuf', 'u-aisha'],
    departments: ['Sales', 'Customer Success'],
    perms: [],
    slaMins: 120,
    canned: [
      { id: 'c-sa-1', title: 'Demo slots', body: 'Thanks for your interest in NEXUS! Here are three demo slots this week — pick whichever suits your team best and we’ll tailor it to your use case.' },
      { id: 'c-sa-2', title: 'Pricing overview', body: 'NEXUS is priced per seat with volume tiers from 500 seats. I’ve attached our pricing overview; happy to build a quote once we understand your rollout.' },
    ],
  },
  {
    id: 'procurement',
    address: 'procurement@helix.co',
    name: 'Procurement',
    description: 'Supplier invoices, onboarding and purchase orders.',
    members: ['u-daniel', 'u-grace', 'u-mateo'],
    departments: ['Finance', 'Operations'],
    perms: ['app:finance'],
    slaMins: 720,
    canned: [
      { id: 'c-pr-1', title: 'Invoice received', body: 'Thank you — your invoice is logged and will be matched against the PO and goods receipt. Payment runs every Tuesday and Thursday.' },
      { id: 'c-pr-2', title: 'Need PO number', body: 'Could you re-issue the invoice with our PO number? Invoices without a PO can’t enter the payment run.' },
    ],
  },
];

/* ==========================================================================
   External contacts
   ========================================================================== */

const PASS: TrustSignals = { spf: 'pass', dkim: 'pass', dmarc: 'pass', domainAgeDays: 6800, linkReputation: 96, links: 1 };

const c = (id: string, name: string, email: string, org: string, kind: MailContact['kind'], hue: number, extra: Partial<MailContact> = {}): MailContact => ({
  id,
  name,
  email,
  org,
  kind,
  domain: email.split('@')[1],
  avatarHue: hue,
  trust: PASS,
  ...extra,
});

export function seedContacts(): MailContact[] {
  return [
    c('x-ceo', 'Karim Nasser', 'karim.nasser@helix.co', 'Helix', 'internal', 210, { title: 'Chief Executive Officer', internal: true, timezone: 'Asia/Dubai' }),
    c('x-itdesk', 'Helix IT Service Desk', 'it-service@helix.co', 'Helix', 'internal', 190, { internal: true }),
    c('x-projects', 'Helix Projects', 'projects@helix.co', 'Helix', 'saas', 265, { internal: true }),
    // Customers
    c('x-emirates', 'Khalid Al Suwaidi', 'khalid.alsuwaidi@emirates.com', 'Emirates Group', 'customer', 2, { title: 'VP Digital Cargo Operations', vip: true, timezone: 'Asia/Dubai' }),
    c('x-emirates-2', 'Noura Al Hammadi', 'noura.alhammadi@emirates.com', 'Emirates Group', 'customer', 340, { title: 'Cargo Platform Lead', timezone: 'Asia/Dubai' }),
    c('x-aramex', 'Lina Farouk', 'lina.farouk@aramex.com', 'Aramex', 'customer', 24, { title: 'Head of IT Procurement', vip: true, timezone: 'Asia/Dubai' }),
    c('x-dpworld', 'Marcus Hale', 'marcus.hale@dpworld.com', 'DP World', 'customer', 205, { title: 'Director, Information Security', vip: true, timezone: 'Asia/Dubai' }),
    c('x-dpworld-legal', 'Hessa Al Marri', 'hessa.almarri@dpworld.com', 'DP World', 'customer', 300, { title: 'Legal Counsel', timezone: 'Asia/Dubai' }),
    c('x-enbd', 'Hamad Al Shamsi', 'hamad.alshamsi@emiratesnbd.com', 'Emirates NBD', 'customer', 160, { title: 'Digital Workplace Lead', timezone: 'Asia/Dubai' }),
    c('x-maf-proc', 'Dana Khoury', 'dana.khoury@maf.ae', 'Majid Al Futtaim', 'customer', 50, { title: 'Procurement Manager', timezone: 'Asia/Dubai' }),
    // Vendors & press
    c('x-snowflake', 'Jordan Blake', 'jordan.blake@snowflake.com', 'Snowflake', 'vendor', 198, { title: 'Enterprise Account Executive', timezone: 'America/Los_Angeles' }),
    c('x-snowflake-ar', 'Snowflake Accounts Receivable', 'ar@snowflake.com', 'Snowflake', 'vendor', 198, { timezone: 'America/Los_Angeles' }),
    c('x-okta', 'Megan Ortiz', 'megan.ortiz@okta.com', 'Okta', 'vendor', 220, { title: 'Customer Success Manager', timezone: 'America/Chicago' }),
    c('x-aramex-ap', 'Aramex Vendor Onboarding', 'vendors@aramex.com', 'Aramex', 'customer', 24, { timezone: 'Asia/Dubai' }),
    c('x-gulfnews', 'Farah Siddiqui', 'farah.siddiqui@gulfnews.com', 'Gulf News', 'partner', 12, { title: 'Technology Reporter', timezone: 'Asia/Dubai' }),
    c('x-cisco', 'Cisco Events', 'events@cisco.com', 'Cisco', 'vendor', 200),
    c('x-meetup', 'Dubai Cloud Security Meetup', 'info@meetup.com', 'Meetup', 'partner', 0),
    // SaaS notifications
    c('x-github', 'GitHub', 'notifications@github.com', 'GitHub', 'saas', 250),
    c('x-pagerduty', 'PagerDuty', 'no-reply@pagerduty.com', 'PagerDuty', 'saas', 140),
    c('x-okta-sec', 'Okta Security', 'noreply@okta.com', 'Okta', 'saas', 220),
    c('x-datadog', 'Datadog', 'reports@datadoghq.com', 'Datadog', 'saas', 275),
    c('x-figma', 'Figma', 'no-reply@figma.com', 'Figma', 'saas', 15),
    // Newsletters (Feed)
    c('x-tldr', 'TLDR', 'dan@tldrnewsletter.com', 'TLDR', 'newsletter', 48, { monthlyVolume: 22, readRate: 0.62 }),
    c('x-stratechery', 'Stratechery', 'email@stratechery.com', 'Stratechery', 'newsletter', 30, { monthlyVolume: 12, readRate: 0.71 }),
    c('x-gulfbiz', 'Gulf Business Daily', 'newsletter@gulfbusiness.com', 'Gulf Business', 'newsletter', 186, { monthlyVolume: 30, readRate: 0.08 }),
    c('x-theinfo', 'The Information', 'hello@theinformation.com', 'The Information', 'newsletter', 0, { monthlyVolume: 20, readRate: 0.34 }),
    c('x-wamda', 'Wamda Weekly', 'newsletter@wamda.com', 'Wamda', 'newsletter', 280, { monthlyVolume: 4, readRate: 0.15 }),
    c('x-hbr', 'Harvard Business Review', 'emailteam@hbr.org', 'HBR', 'newsletter', 355, { monthlyVolume: 16, readRate: 0.11 }),
    c('x-awsweekly', 'AWS Week in Review', 'aws-news@amazon.com', 'Amazon Web Services', 'newsletter', 32, { monthlyVolume: 5, readRate: 0.45 }),
    // Receipts (Paper trail)
    c('x-emirates-air', 'Emirates', 'ticketing@emirates.com', 'Emirates', 'receipt', 2),
    c('x-careem', 'Careem', 'receipts@careem.com', 'Careem', 'receipt', 140),
    c('x-amazon', 'Amazon.ae', 'auto-confirm@amazon.ae', 'Amazon', 'receipt', 32),
    c('x-du', 'du', 'ebill@du.ae', 'du', 'receipt', 320),
    c('x-aws-billing', 'Amazon Web Services', 'aws-billing@amazon.com', 'Amazon Web Services', 'receipt', 32),
    c('x-apple', 'Apple', 'no_reply@email.apple.com', 'Apple', 'receipt', 0),
    c('x-uber', 'Uber Receipts', 'noreply@uber.com', 'Uber', 'receipt', 0),
    // First-contact senders (Screener)
    c('x-phish-it', 'Helix IT Support', 'it-support@he1ix-co.com', 'Unknown', 'phish', 0, {
      screener: 'pending',
      trust: { spf: 'fail', dkim: 'none', dmarc: 'fail', domainAgeDays: 3, linkReputation: 6, links: 2 },
    }),
    c('x-phish-ceo', 'Karim Nasser', 'karim.nasser@helixco-mail.com', 'Unknown', 'phish', 210, {
      screener: 'pending',
      trust: { spf: 'softfail', dkim: 'none', dmarc: 'none', domainAgeDays: 9, linkReputation: 50, links: 0 },
    }),
    c('x-phish-aws', 'AWS Billing Support', 'invoices@aws-billing-support.co', 'Unknown', 'phish', 32, {
      screener: 'pending',
      trust: { spf: 'fail', dkim: 'fail', dmarc: 'none', domainAgeDays: 14, linkReputation: 3, links: 3 },
    }),
    c('x-maf', 'Tariq Mansour', 'tariq.mansour@maf.ae', 'Majid Al Futtaim', 'customer', 44, {
      title: 'Head of Partnerships',
      timezone: 'Asia/Dubai',
      screener: 'pending',
      trust: { spf: 'pass', dkim: 'pass', dmarc: 'pass', domainAgeDays: 7300, linkReputation: 94, links: 0 },
    }),
    c('x-gitex', 'GITEX Global Speakers', 'speakers@gitex.com', 'GITEX Global', 'partner', 262, {
      screener: 'pending',
      trust: { spf: 'pass', dkim: 'pass', dmarc: 'pass', domainAgeDays: 8100, linkReputation: 90, links: 1 },
    }),
    c('x-menabytes', 'MENAbytes Weekly', 'digest@menabytes.com', 'MENAbytes', 'newsletter', 150, {
      screener: 'pending',
      monthlyVolume: 4,
      readRate: 0.4,
      trust: { spf: 'pass', dkim: 'pass', dmarc: 'none', domainAgeDays: 3600, linkReputation: 82, links: 3 },
    }),
    c('x-hays', 'Rania Saeed', 'rania.saeed@hays.ae', 'Hays Technology', 'partner', 300, {
      title: 'Senior Consultant',
      timezone: 'Asia/Dubai',
      screener: 'pending',
      trust: { spf: 'pass', dkim: 'pass', dmarc: 'pass', domainAgeDays: 9200, linkReputation: 88, links: 0 },
    }),
  ];
}

/* ==========================================================================
   Thread templates
   ========================================================================== */

type Who = string; // 'me' | 'boss' | 'u-…' | 'x-…'

interface AttSpec {
  name: string;
  kind: AttachmentKind;
  sizeKb: number;
  sensitivity: Sensitivity;
}

interface MsgSpec {
  from: Who;
  to?: Who[];
  cc?: Who[];
  /** Minutes ago. */
  ago: number;
  body: string;
  att?: AttSpec[];
}

interface NovaSpec extends Omit<NovaSignals, 'deadlineAt' | 'meeting'> {
  /** Deadline on the next given weekday (0 = Sun) at `deadlineHour`. */
  deadlineWeekday?: number;
  /** Deadline N days from today at `deadlineHour`. */
  deadlineDays?: number;
  deadlineHour?: number;
  meeting?: { label: string; weekday: number; hour: number; durationMins: number };
}

interface ThreadSpec {
  key: string;
  subject: string;
  stream: MailStream;
  labels?: string[];
  unread?: boolean;
  starred?: boolean;
  folder?: MailThread['folder'];
  msgs: MsgSpec[];
  nova?: NovaSpec;
  ar?: { subject: string; tldr?: string; bodies: string[]; actions?: string[] };
  snooze?: { weekday?: number; days?: number; hour: number };
  followUpDays?: number;
  skipFor?: string[];
}

const ME: Who = 'me';
const BOSS: Who = 'boss';

const att = (name: string, kind: AttachmentKind, sizeKb: number, sensitivity: Sensitivity): AttSpec => ({ name, kind, sizeKb, sensitivity });

const THREADS: ThreadSpec[] = [
  /* ---------------- Priority ---------------- */
  {
    key: 'board-deck',
    subject: 'Board pre-read: Security & Platform section by Thursday',
    stream: 'priority',
    labels: ['Board'],
    unread: true,
    starred: true,
    msgs: [
      {
        from: BOSS,
        to: [ME],
        cc: ['u-grace'],
        ago: 52,
        body: `Hi {me},

The board pre-read goes out Friday morning and I'd like the Security & Platform section from you by Thursday 17:00. Two pages max — the board cares about three things: are we safer than last quarter, what did zero trust cost us, and what could still hurt us in Q1.

Could you include the incident trend (P1/P2 by month), MFA coverage, and the two open audit findings with owners and dates? Grace will send the cost numbers so the story and the finance view match.

Can we do 20 minutes on Wednesday at 15:00 to walk through your outline before you write it up?

Thanks,
{from}`,
      },
    ],
    nova: {
      tldr: '{boss} needs a two-page Security & Platform section for the board pre-read by Thursday 17:00 — incident trend, MFA coverage and the two open audit findings — and wants a 20-minute outline review on Wednesday at 15:00.',
      sentiment: 'neutral',
      urgency: 82,
      deadlineWeekday: 4,
      deadlineHour: 17,
      category: 'leadership',
      actions: ['Draft the two-page Security & Platform section', 'Add the P1/P2 incident trend and MFA coverage', 'List both open audit findings with owners and dates', 'Align the cost figures with Grace'],
      meeting: { label: 'Wednesday 15:00', weekday: 3, hour: 15, durationMins: 20 },
      smartReplies: ['On it — the outline will be ready for Wednesday 15:00.', 'Could we move the review to Wednesday 16:00?', 'Grace and I will sync on the numbers today.'],
    },
    ar: {
      subject: 'مذكرة مجلس الإدارة: قسم الأمن والمنصة قبل الخميس',
      actions: ['صياغة قسم الأمن والمنصة في صفحتين', 'إضافة اتجاه حوادث P1/P2 ونسبة تغطية المصادقة متعددة العوامل', 'إدراج ملاحظتَي التدقيق المفتوحتين مع المسؤولين والمواعيد', 'مطابقة أرقام التكاليف مع غريس'],
      tldr: 'يحتاج {boss} إلى قسم من صفحتين عن الأمن والمنصة لمذكرة مجلس الإدارة قبل الخميس الساعة 17:00، مع مراجعة سريعة للمخطط يوم الأربعاء الساعة 15:00.',
      bodies: [
        `مرحباً {me}،

تُرسل المذكرة التمهيدية لمجلس الإدارة صباح الجمعة، وأودّ أن أستلم منك قسم الأمن والمنصة قبل الخميس الساعة 17:00. صفحتان كحد أقصى — يهتم المجلس بثلاثة أمور: هل أصبحنا أكثر أماناً من الربع الماضي، وكم كلّفتنا الثقة المعدومة، وما الذي قد يضرّنا في الربع الأول.

هل يمكنك تضمين اتجاه الحوادث (P1/P2 شهرياً)، ونسبة تغطية المصادقة متعددة العوامل، وملاحظتي التدقيق المفتوحتين مع المسؤولين والمواعيد؟ سترسل غريس أرقام التكلفة لتتطابق القصة مع الرؤية المالية.

هل يمكننا تخصيص 20 دقيقة يوم الأربعاء الساعة 15:00 لمراجعة المخطط قبل الكتابة؟

شكراً،
{from}`,
      ],
    },
  },
  {
    key: 'emirates-sla',
    subject: 'Escalation: cargo tracking API latency breaching SLA',
    stream: 'priority',
    labels: ['Customers', 'Escalation'],
    unread: true,
    msgs: [
      {
        from: 'x-emirates',
        to: [ME],
        cc: ['x-emirates-2', 'u-yusuf'],
        ago: 95,
        body: `Dear {me},

Since Monday our cargo tracking dashboards have been showing p95 API latency of 2.8 seconds against the 800 ms in our SLA. Our duty managers at DXB and DWC are falling back to phone calls to confirm ULD positions, which is not sustainable during the peak-season ramp-up.

We need three things from Helix: a root cause, a mitigation plan with dates, and a named engineering owner we can call directly. Noura from my team has attached the latency export from our monitoring.

Can we get on a call Thursday 14:00 Dubai? I would like your Head of Platform to join.

Regards,
Khalid Al Suwaidi
VP Digital Cargo Operations · Emirates Group`,
        att: [att('cargo-api-latency-export.csv', 'sheet', 2380, 'internal')],
      },
      {
        from: 'u-yusuf',
        to: ['x-emirates', ME],
        cc: ['x-emirates-2'],
        ago: 61,
        body: `Khalid, thank you — acknowledged. I've opened a priority investigation and I'm looping in {me} so we can confirm Thursday 14:00.

{me}, Lucas thinks this is the connection-pool change from the Nov 9 incident. Could you confirm an owner and whether we can share the mitigation timeline before the call?

Yusuf`,
      },
    ],
    nova: {
      tldr: 'Emirates Group (VIP) reports cargo-API p95 latency of 2.8 s against an 800 ms SLA since Monday. They want a root cause, a dated mitigation plan and a named owner, and propose a call on Thursday 14:00 Dubai.',
      sentiment: 'tense',
      urgency: 90,
      blocking: 3,
      customer: 'Emirates',
      category: 'customer',
      actions: ['Name an engineering owner for the cargo-API latency', 'Share a dated mitigation plan before Thursday', 'Confirm the Thursday 14:00 call with the Head of Platform'],
      meeting: { label: 'Thursday 14:00 Dubai', weekday: 4, hour: 14, durationMins: 45 },
      smartReplies: ['Confirmed for Thursday 14:00 — our Head of Platform will join as owner.', 'We’ll share a dated mitigation plan by tomorrow noon.', 'Looping in Lucas, who led the Nov 9 review.'],
    },
    ar: {
      subject: 'تصعيد: زمن استجابة واجهة تتبع الشحن يتجاوز اتفاقية مستوى الخدمة',
      actions: ['تعيين مسؤول هندسي عن زمن استجابة واجهة الشحن', 'مشاركة خطة معالجة بمواعيد محددة قبل الخميس', 'تأكيد مكالمة الخميس الساعة 14:00 مع رئيس المنصة'],
      tldr: 'تشير مجموعة الإمارات (عميل مميز) إلى أن زمن استجابة واجهة الشحن بلغ 2.8 ثانية مقابل 800 مللي ثانية في الاتفاقية، وتطلب السبب الجذري وخطة معالجة بمواعيد ومسؤولاً محدداً، مع مكالمة يوم الخميس الساعة 14:00 بتوقيت دبي.',
      bodies: [
        `عزيزي {me}،

منذ يوم الاثنين تُظهر لوحات تتبع الشحن لدينا زمن استجابة (p95) يبلغ 2.8 ثانية مقابل 800 مللي ثانية المتفق عليها. يضطر مديرو المناوبة في مطاري دبي الدولي ودبي وورلد سنترال إلى الاتصال هاتفياً لتأكيد مواقع الحاويات، وهذا غير مستدام مع اقتراب موسم الذروة.

نحتاج من هيليكس ثلاثة أمور: السبب الجذري، وخطة معالجة بمواعيد واضحة، ومهندساً مسؤولاً يمكننا الاتصال به مباشرة. أرفقت نورة من فريقي ملف بيانات زمن الاستجابة.

هل يمكننا عقد مكالمة يوم الخميس الساعة 14:00 بتوقيت دبي؟ أودّ أن ينضم رئيس المنصة لديكم.

مع التحية،
خالد السويدي
نائب الرئيس للعمليات الرقمية للشحن · مجموعة الإمارات`,
        `خالد، شكراً لك — تم الاستلام. فتحت تحقيقاً عاجلاً وأضفت {me} لتأكيد موعد الخميس الساعة 14:00.

{me}، يعتقد لوكاس أن السبب هو تغيير مجمع الاتصالات بعد حادثة 9 نوفمبر. هل يمكنك تأكيد المسؤول وما إذا كان بإمكاننا مشاركة الجدول الزمني للمعالجة قبل المكالمة؟

يوسف`,
      ],
    },
  },
  {
    key: 'q4-audit',
    subject: 'Q4 audit: access-review evidence needed by Friday',
    stream: 'priority',
    labels: ['Finance', 'Audit'],
    unread: true,
    msgs: [
      {
        from: 'u-grace',
        to: [ME],
        cc: ['u-daniel'],
        ago: 140,
        body: `Hi {me},

The external auditors moved fieldwork forward, so I need the Q4 access-review evidence by Friday. Specifically: the quarterly privileged-access review export, the signed segregation-of-duties matrix, and evidence that leavers were deprovisioned within 24 hours.

Three people on the audit team are blocked until we upload these to the PBC folder. I've attached the matrix with last quarter's sign-offs pre-filled — it only needs your review and signature.

Thank you!
{from}`,
        att: [att('SoD-matrix-Q4-2026.xlsx', 'sheet', 412, 'confidential'), att('Audit-PBC-request-list.pdf', 'pdf', 186, 'internal')],
      },
    ],
    nova: {
      tldr: 'Grace needs the Q4 access-review evidence — privileged-access export, signed SoD matrix and leaver deprovisioning proof — by Friday. Three auditors are blocked until it is in the PBC folder.',
      sentiment: 'neutral',
      urgency: 78,
      deadlineWeekday: 5,
      deadlineHour: 17,
      blocking: 3,
      category: 'finance',
      actions: ['Export the Q4 privileged-access review', 'Review and sign the SoD matrix', 'Attach leaver deprovisioning evidence (under 24h)'],
      smartReplies: ['All three will be in the PBC folder by Thursday.', 'Ethan will pull the privileged-access export today.', 'Could we have until Monday for the leaver evidence?'],
    },
  },
  {
    key: 'aramex-renewal',
    subject: 'Aramex × NEXUS: revised 3-year quote before steering committee',
    stream: 'priority',
    labels: ['Customers'],
    unread: false,
    starred: true,
    msgs: [
      {
        from: 'x-aramex',
        to: [ME],
        cc: ['u-noah'],
        ago: 380,
        body: `Hello {me},

Thank you for the workshop last week — the team was impressed by the Nova Inbox and Helpdesk demos. We are preparing the business case for a three-year NEXUS rollout across 14 countries (about 4,200 seats).

Before our steering committee on the 24th, could you send a revised quote that reflects the multi-year term, and confirm data residency for our Jordan and KSA entities? Our legal team will also need your latest SOC 2 Type II report.

Would Tuesday 10:30 work for a short call with our CIO?

Kind regards,
Lina Farouk
Head of IT Procurement · Aramex`,
        att: [att('Aramex-NEXUS-RFP-v3.pdf', 'pdf', 1840, 'internal')],
      },
    ],
    nova: {
      tldr: 'Aramex wants a revised three-year quote for about 4,200 seats in 14 countries, data-residency confirmation for Jordan and KSA, and the SOC 2 Type II report before their steering committee on the 24th. They propose a CIO call on Tuesday 10:30.',
      sentiment: 'positive',
      urgency: 64,
      customer: 'Aramex',
      category: 'customer',
      actions: ['Send the revised three-year quote (4,200 seats)', 'Confirm data residency for Jordan and KSA', 'Share the SOC 2 Type II report under NDA'],
      meeting: { label: 'Tuesday 10:30', weekday: 2, hour: 10.5, durationMins: 30 },
      smartReplies: ['Tuesday 10:30 works — sending an invite now.', 'Noah will send the revised quote by Thursday.', 'Happy to share SOC 2 under NDA today.'],
    },
    ar: {
      subject: 'أرامكس × نكسس: عرض سعر معدّل لثلاث سنوات قبل اللجنة التوجيهية',
      actions: ['إرسال عرض السعر المعدّل لثلاث سنوات (4,200 مستخدم)', 'تأكيد إقامة البيانات للأردن والسعودية', 'مشاركة تقرير SOC 2 من النوع الثاني بموجب اتفاقية عدم إفصاح'],
      tldr: 'تطلب أرامكس عرض سعر معدّلاً لثلاث سنوات لنحو 4,200 مستخدم في 14 دولة، وتأكيد إقامة البيانات للأردن والسعودية، وتقرير SOC 2 Type II قبل اجتماع اللجنة التوجيهية.',
      bodies: [
        `مرحباً {me}،

شكراً على ورشة العمل الأسبوع الماضي — أُعجب الفريق كثيراً بعروض صندوق نوفا ومكتب الدعم. نعمل حالياً على دراسة جدوى لنشر نكسس لمدة ثلاث سنوات في 14 دولة (نحو 4,200 مستخدم).

قبل اجتماع لجنتنا التوجيهية في الرابع والعشرين، هل يمكنكم إرسال عرض سعر معدّل يعكس مدة العقد متعددة السنوات، وتأكيد إقامة البيانات لكياناتنا في الأردن والسعودية؟ سيحتاج فريقنا القانوني أيضاً إلى أحدث تقرير SOC 2 Type II.

هل يناسبكم يوم الثلاثاء الساعة 10:30 لمكالمة قصيرة مع مدير تقنية المعلومات لدينا؟

مع أطيب التحيات،
لينا فاروق
رئيسة مشتريات تقنية المعلومات · أرامكس`,
      ],
    },
  },
  {
    key: 'dpworld-questionnaire',
    subject: 'DP World pilot: vendor security questionnaire (186 questions)',
    stream: 'priority',
    labels: ['Customers', 'Security'],
    msgs: [
      {
        from: 'x-dpworld',
        to: [ME],
        ago: 900,
        body: `Hi {me},

As discussed, DP World requires every pilot vendor to complete our vendor security questionnaire before production data can flow. It has 186 questions, but most map directly to ISO 27001 controls you already hold.

We need it back by Wednesday next week to keep the terminal-ops pilot on schedule. Our assessors are happy to take a call for anything that needs context.

Best,
Marcus Hale
Director, Information Security · DP World`,
        att: [att('DPW-Vendor-Security-Questionnaire-v7.xlsx', 'sheet', 960, 'internal')],
      },
    ],
    nova: {
      tldr: 'DP World needs its 186-question vendor security questionnaire back by next Wednesday to keep the terminal-ops pilot on schedule; most answers map to existing ISO 27001 controls.',
      sentiment: 'neutral',
      urgency: 58,
      deadlineDays: 7,
      deadlineHour: 17,
      customer: 'DP World',
      category: 'security',
      actions: ['Split questionnaire sections between Ethan and Lucas', 'Reuse the ISO 27001 statement of applicability', 'Return the questionnaire by next Wednesday'],
      smartReplies: ['Thanks Marcus — we’ll return it by Tuesday.', 'Could your assessors join a call on Monday?', 'Sharing our ISO 27001 SoA to speed things up.'],
    },
  },
  {
    key: 'postmortem',
    subject: 'Postmortem draft: Nov 9 checkout latency incident',
    stream: 'priority',
    labels: ['Ops'],
    unread: true,
    msgs: [
      {
        from: 'u-lucas',
        to: [ME],
        cc: ['u-omar', 'u-priya'],
        ago: 210,
        body: `Hi {me},

Draft postmortem for the Nov 9 checkout latency incident is ready for review. Short version: a connection-pool limit was lowered in a config refactor, and under the evening peak the pool saturated, pushing p95 from 240 ms to 3.1 s for 47 minutes.

We have four action items, two of which need your approval because they change the change-management policy (mandatory canary for config changes, and paging the owner on pool saturation).

Omar, Priya and I are holding the public summary until you sign off — could you take a look today?

Lucas`,
        att: [att('PM-2026-11-09-checkout-latency.pdf', 'pdf', 640, 'internal')],
      },
      {
        from: 'u-omar',
        to: ['u-lucas', ME],
        cc: ['u-priya'],
        ago: 150,
        body: `+1 from me on the canary requirement. {me}, the customer-facing summary is the part Emirates will see, so it's worth a careful read.

Omar`,
      },
    ],
    nova: {
      tldr: 'Lucas’s postmortem for the Nov 9 checkout incident (pool limit lowered → p95 3.1 s for 47 min) needs your approval on two policy changes. Omar, Priya and Lucas are holding the public summary until you sign off.',
      sentiment: 'neutral',
      urgency: 74,
      blocking: 3,
      deadlineDays: 0,
      deadlineHour: 18,
      category: 'ops',
      actions: ['Approve the mandatory canary for config changes', 'Approve paging the owner on pool saturation', 'Review the customer-facing summary'],
      smartReplies: ['Approved both policy changes — publish when ready.', 'Approving the canary; let’s discuss paging tomorrow.', 'I’ll review the customer summary by 16:00.'],
    },
  },
  {
    key: 'mfa-rollout',
    subject: 'MFA rollout: 23 accounts still waiting on hardware keys',
    stream: 'priority',
    labels: ['Security'],
    unread: true,
    msgs: [
      {
        from: 'u-ethan',
        to: [ME],
        ago: 300,
        body: `Hey {me},

Status on the MFA rollout: 412 of 435 accounts are on phishing-resistant MFA. The remaining 23 are mostly field staff in Riyadh and Cairo who are waiting on hardware keys — the shipment is stuck pending a PO approval in Procurement.

Also a heads-up: we saw two lookalike-domain emails (he1ix-co.com) hitting people this morning. I've added a block rule, but it would help if you sent a short note to all staff.

Can you approve the key shipment and send the note today?

Ethan`,
      },
    ],
    nova: {
      tldr: 'MFA coverage is 412/435; the last 23 accounts are waiting on hardware keys stuck behind a Procurement PO. Ethan also flags a he1ix-co.com lookalike phishing wave and asks for an all-staff note today.',
      sentiment: 'neutral',
      urgency: 80,
      category: 'security',
      actions: ['Approve the hardware-key PO in Procurement', 'Send an all-staff phishing awareness note'],
      smartReplies: ['Approving the PO now — the note goes out by 14:00.', 'Could you draft the all-staff note for me?', 'Let’s add the lookalike domain to the Screener blocklist too.'],
    },
  },
  {
    key: 'security-hiring',
    subject: 'Senior Security Engineer finalists — debrief Thursday?',
    stream: 'priority',
    labels: ['Hiring'],
    msgs: [
      {
        from: 'u-fatima',
        to: [ME],
        cc: ['u-ethan'],
        ago: 1500,
        body: `Hi {me},

We have two finalists for the Senior Security Engineer role — Rami (ex-Careem, strong on cloud IAM) and Joanna (ex-Mastercard, red-team background). Scorecards are attached; both cleared the bar with the panel.

Could we hold the debrief on Thursday at 16:00? Both candidates have competing offers, so I'd like to make a decision by Friday.

Thanks,
Fatima`,
        att: [att('Scorecards-Senior-Security-Engineer.pdf', 'pdf', 520, 'confidential')],
      },
    ],
    nova: {
      tldr: 'Two finalists cleared the bar for Senior Security Engineer; Fatima proposes a debrief on Thursday 16:00 and a decision by Friday because of competing offers.',
      sentiment: 'positive',
      urgency: 66,
      deadlineWeekday: 5,
      deadlineHour: 12,
      category: 'hiring',
      actions: ['Review both scorecards', 'Confirm the Thursday 16:00 debrief', 'Decide by Friday (competing offers)'],
      meeting: { label: 'Thursday 16:00', weekday: 4, hour: 16, durationMins: 30 },
    },
  },
  {
    key: 'offsite',
    subject: 'Leadership offsite venue — two options, need a pick by Monday',
    stream: 'priority',
    labels: ['Ops'],
    msgs: [
      {
        from: 'u-mateo',
        to: [ME],
        ago: 2900,
        body: `Hi {me},

Two venue options for the leadership offsite (Jan 21–22):

1) Jumeirah Al Naseem — beach meeting pavilion, 24 pax, AED 38,400 all-in.
2) Al Maha Desert Resort — private majlis, 20 pax, AED 44,900 all-in, includes transfers.

Both hold the dates until Monday 12:00. Photos attached. Which one should I confirm?

Mateo`,
        att: [att('venue-al-naseem.jpg', 'image', 2100, 'public'), att('venue-al-maha.jpg', 'image', 2450, 'public')],
      },
    ],
    nova: {
      tldr: 'Mateo has two offsite venues on hold until Monday 12:00: Al Naseem (24 pax, AED 38.4K) or Al Maha (20 pax, AED 44.9K incl. transfers).',
      sentiment: 'positive',
      urgency: 46,
      deadlineWeekday: 1,
      deadlineHour: 12,
      category: 'ops',
      actions: ['Pick a venue before Monday 12:00'],
      smartReplies: ['Let’s go with Al Maha — please confirm.', 'Al Naseem works — closer for the Dubai team.', 'Could you get a quote for 30 people?'],
    },
    ar: {
      subject: 'مكان الملتقى القيادي — خياران ونحتاج القرار قبل الاثنين',
      actions: ['اختيار المكان قبل الاثنين الساعة 12:00'],
      tldr: 'يحجز ماتيو خيارين للملتقى حتى ظهر الاثنين: النسيم (24 شخصاً، 38,400 درهم) أو المها (20 شخصاً، 44,900 درهم مع التنقلات).',
      bodies: [
        `مرحباً {me}،

خياران لمكان الملتقى القيادي (21–22 يناير):

1) جميرا النسيم — جناح اجتماعات على الشاطئ، 24 شخصاً، 38,400 درهم شاملة.
2) منتجع المها الصحراوي — مجلس خاص، 20 شخصاً، 44,900 درهم شاملة التنقلات.

كلاهما يحجز التواريخ حتى يوم الاثنين الساعة 12:00. الصور مرفقة. أيهما أؤكد؟

ماتيو`,
      ],
    },
  },
  {
    key: 'onboarding-review',
    subject: 'Onboarding redesign v4 — three security questions for you',
    stream: 'priority',
    labels: ['Product'],
    msgs: [
      {
        from: 'u-mei',
        to: [ME],
        ago: 640,
        body: `Hi {me}!

The onboarding redesign v4 is ready for a security look before we test it with customers next week. Three questions where I need your call:

1. Can new hires set up passkeys on day one, before IT ships their laptop?
2. Is it OK to show the employee's manager and team on the first screen (before MFA completes)?
3. Should the "request access" step auto-approve low-risk apps?

The Figma file is attached. Thanks!
Mei`,
        att: [att('Onboarding-v4.fig', 'other', 8400, 'internal')],
      },
    ],
    nova: {
      tldr: 'Mei needs three security calls on onboarding v4 before customer testing next week: day-one passkeys, showing the team before MFA, and auto-approving low-risk apps.',
      sentiment: 'positive',
      urgency: 52,
      category: 'product',
      actions: ['Decide on day-one passkey enrolment', 'Rule on showing team info before MFA', 'Set the auto-approval policy for low-risk apps'],
    },
  },
  {
    key: 'budget-q1',
    subject: 'Q1 budget envelope: Platform & Security lines (v2)',
    stream: 'priority',
    labels: ['Finance'],
    msgs: [
      {
        from: 'u-daniel',
        to: [ME],
        cc: ['u-grace'],
        ago: 4400,
        body: `Hi {me},

Attached is v2 of the Q1 budget envelope for Platform and Security. Headline: we're 6% over the guideline because of the Okta renewal and the hardware-key rollout.

Could you either confirm the overage with a short justification or tell me where to trim? I need to lock the numbers by the end of next week for the CFO review.

Cheers,
Daniel`,
        att: [att('Q1-2027-Budget-Platform-Security-v2.xlsx', 'sheet', 780, 'confidential')],
      },
    ],
    nova: {
      tldr: 'The Q1 Platform & Security envelope is 6% over guideline (Okta renewal + hardware keys). Daniel needs a justification or trims before the CFO review at the end of next week.',
      sentiment: 'neutral',
      urgency: 44,
      deadlineDays: 9,
      deadlineHour: 17,
      category: 'finance',
      actions: ['Justify the 6% overage or propose trims', 'Lock the numbers before the CFO review'],
    },
  },
  {
    key: 'rfc-mesh',
    subject: 'RFC-112: zero-trust service mesh — needs your sign-off',
    stream: 'priority',
    labels: ['Security'],
    msgs: [
      {
        from: 'u-priya',
        to: [ME],
        cc: ['u-omar', 'u-lucas'],
        ago: 3000,
        body: `Hi {me},

RFC-112 (zero-trust service mesh with mTLS everywhere) has passed design review. It needs your sign-off as the security approver before we start the migration — four of us are blocked on it.

Key decisions: SPIFFE identities per workload, 24-hour certificate rotation, and a break-glass path for incidents. Comments welcome in the doc.

Priya`,
      },
    ],
    nova: {
      tldr: 'RFC-112 (mTLS service mesh: SPIFFE identities, 24h cert rotation, break-glass path) passed design review and is waiting on your security sign-off; four engineers are blocked.',
      sentiment: 'neutral',
      urgency: 70,
      blocking: 4,
      category: 'security',
      actions: ['Sign off RFC-112 as security approver', 'Review the break-glass path'],
      smartReplies: ['Signed off — great work, Priya.', 'Approved, with one note on break-glass logging.', 'Can we review break-glass together tomorrow?'],
    },
  },
  {
    key: 'one-on-one',
    subject: 'Agenda for our 1:1 + promotion packet',
    stream: 'priority',
    labels: ['People'],
    skipFor: ['u-priya'],
    msgs: [
      {
        from: 'u-omar',
        to: [ME],
        ago: 720,
        body: `Hi {me},

For our 1:1 on Wednesday at 11:00, I'd like to cover:

• Priya's promotion packet to Principal — calibration is in two weeks
• The hiring plan for the platform team in Q1
• How we split on-call after Lucas's postmortem

Priya's packet is attached. Let me know if you want to add anything.

Omar`,
        att: [att('Promotion-Packet-Principal-Engineer.pdf', 'pdf', 940, 'restricted')],
      },
    ],
    nova: {
      tldr: 'Omar’s agenda for Wednesday’s 1:1: Priya’s promotion packet (calibration in two weeks), Q1 platform hiring and the on-call split.',
      sentiment: 'neutral',
      urgency: 40,
      category: 'people',
      meeting: { label: 'Wednesday 11:00', weekday: 3, hour: 11, durationMins: 30 },
    },
  },
  {
    key: 'press-quote',
    subject: 'Gulf News wants a quote on our zero-trust rollout (today 17:00)',
    stream: 'priority',
    labels: ['Press'],
    unread: true,
    msgs: [
      {
        from: 'u-sofia',
        to: [ME],
        ago: 34,
        body: `Hi {me},

Farah Siddiqui at Gulf News is writing a piece on how UAE companies are rolling out zero trust and asked for a two-line quote from you. Her deadline is today at 17:00.

Suggested angle: phishing-resistant MFA for every employee, including field teams — but happy to use your words. Can you reply with a quote, or a yes/no on the draft below?

Draft: "Zero trust isn't a product, it's a habit. We made the secure path the easiest path for every Helix employee."

Sofia`,
      },
    ],
    nova: {
      tldr: 'Sofia needs a two-line quote (or a yes/no on her draft) for a Gulf News zero-trust piece by 17:00 today.',
      sentiment: 'positive',
      urgency: 72,
      deadlineDays: 0,
      deadlineHour: 17,
      category: 'press',
      smartReplies: ['Approved — please use the draft as is.', 'Use it, but add “including our field teams”.', 'Let’s decline this one for now.'],
    },
    ar: {
      subject: 'غلف نيوز تطلب تصريحاً عن تطبيق الثقة المعدومة (اليوم 17:00)',
      tldr: 'تحتاج صوفيا إلى تصريح من سطرين (أو موافقة على مسودتها) لمقال غلف نيوز قبل الساعة 17:00 اليوم.',
      bodies: [
        `مرحباً {me}،

تكتب فرح صدّيقي من غلف نيوز مقالاً عن كيفية تطبيق الشركات الإماراتية لنموذج الثقة المعدومة، وطلبت تصريحاً من سطرين منك. موعدها النهائي اليوم الساعة 17:00.

الزاوية المقترحة: مصادقة مقاومة للتصيّد لكل موظف بما في ذلك الفرق الميدانية — ويسعدني استخدام كلماتك. هل يمكنك الرد بتصريح أو بالموافقة على المسودة أدناه؟

المسودة: "الثقة المعدومة ليست منتجاً، بل عادة. جعلنا الطريق الآمن هو الأسهل لكل موظف في هيليكس."

صوفيا`,
      ],
    },
  },
  {
    key: 'townhall',
    subject: 'Town hall: 10 minutes on the new phishing-report flow',
    stream: 'priority',
    labels: ['Security'],
    msgs: [
      {
        from: 'x-ceo',
        to: [ME],
        ago: 4300,
        body: `Hi {me},

Thank you for the security update at the leadership meeting. I'd like you to take 10 minutes at next week's town hall to explain the new phishing-report flow — people need to know it's one click and that they won't get in trouble for reporting a false alarm.

My office will send the run of show. Keep it human.

Karim`,
      },
    ],
    nova: {
      tldr: 'Karim wants a 10-minute, human explanation of the one-click phishing-report flow at next week’s town hall.',
      sentiment: 'positive',
      urgency: 38,
      category: 'leadership',
      actions: ['Prepare a 10-minute phishing-report walkthrough'],
    },
  },

  /* ---------------- Updates ---------------- */
  {
    key: 'gh-pr',
    subject: '[helix/nexus] Rotate service tokens before Dec 1 (#4821)',
    stream: 'updates',
    labels: ['Ops'],
    unread: true,
    msgs: [
      {
        from: 'x-github',
        to: [ME],
        ago: 25,
        body: `Lucas Meyer requested your review on helix/nexus#4821.

Rotate service tokens before Dec 1 · 14 files changed (+312 −198)

This PR moves the remaining 9 services to short-lived tokens issued by the mesh CA and removes the static tokens from Vault.

— Reply to this email directly or view it on GitHub: https://github.com/helix/nexus/pull/4821`,
      },
    ],
    nova: { category: 'ops', actions: ['Review PR #4821 (token rotation)'], tldr: 'Lucas requested your review on PR #4821, which moves 9 services to short-lived mesh-issued tokens.' },
  },
  {
    key: 'pd-resolved',
    subject: 'Resolved: checkout-api p95 latency above threshold',
    stream: 'updates',
    labels: ['Ops'],
    msgs: [
      {
        from: 'x-pagerduty',
        to: [ME],
        ago: 1400,
        body: `Incident #8812 has been resolved.

Service: checkout-api · Urgency: high · Duration: 47 min
Resolved by: Lucas Meyer

Timeline and responders are available in PagerDuty.`,
      },
    ],
    nova: { category: 'ops' },
  },
  {
    key: 'okta-signin',
    subject: 'New sign-in to your Helix admin account',
    stream: 'updates',
    labels: ['Security'],
    unread: true,
    msgs: [
      {
        from: 'x-okta-sec',
        to: [ME],
        ago: 180,
        body: `We noticed a new sign-in to your Helix admin account.

Location: Dubai, United Arab Emirates
Device: Chrome on macOS · Security key verified

If this was you, no action is needed. If not, report it to your administrator immediately.`,
      },
    ],
    nova: { category: 'security' },
  },
  {
    key: 'dd-slo',
    subject: 'Weekly SLO report: 99.95% availability (target 99.9%)',
    stream: 'updates',
    msgs: [
      {
        from: 'x-datadog',
        to: [ME],
        ago: 2000,
        body: `Your weekly SLO summary for helix-production.

Availability: 99.95% (target 99.9%) · Error budget remaining: 61%
Slowest service: checkout-api (p95 410 ms)

Open the dashboard for details.`,
      },
    ],
  },
  {
    key: 'enrollment',
    subject: 'Reminder: benefits open enrollment closes Friday',
    stream: 'updates',
    labels: ['People'],
    msgs: [
      {
        from: 'u-sara',
        to: [ME],
        ago: 1300,
        body: `Hi everyone,

A friendly reminder that benefits open enrollment closes this Friday at 18:00. If you want to add a dependent or change your health tier, do it in the HR Portal under Benefits.

Questions? Reply to people-ops@helix.co and we'll get back to you within a day.

Sara`,
      },
    ],
    nova: { category: 'people' },
  },
  {
    key: 'vpn-maint',
    subject: 'Planned maintenance: VPN gateway, Saturday 02:00–04:00 GST',
    stream: 'updates',
    labels: ['Ops'],
    msgs: [
      {
        from: 'x-itdesk',
        to: [ME],
        ago: 2600,
        body: `We'll upgrade the Dubai VPN gateway this Saturday between 02:00 and 04:00 GST. Remote connections may drop for up to 10 minutes.

No action is needed. Status updates will be posted in #it-status.`,
      },
    ],
  },
  {
    key: 'projects-digest',
    subject: 'Helix Projects: 4 of your tasks are due this week',
    stream: 'updates',
    msgs: [
      {
        from: 'x-projects',
        to: [ME],
        ago: 600,
        body: `Good morning! 4 tasks assigned to you are due this week:

• Approve hardware-key rollout budget — due Thu
• Review RFC-112 service mesh — due Thu
• Q4 access review sign-off — due Fri
• Town hall phishing segment — due next Tue

Open My Tasks in Helix Projects to plan your week.`,
      },
    ],
  },
  {
    key: 'figma-share',
    subject: 'Mei Tanaka shared “Onboarding v4” with you',
    stream: 'updates',
    labels: ['Product'],
    msgs: [
      {
        from: 'x-figma',
        to: [ME],
        ago: 650,
        body: `Mei Tanaka invited you to edit the file "Onboarding v4".

"Would love a security pass on frames 12–18 🙏"

Open in Figma: https://www.figma.com/file/onboarding-v4`,
      },
    ],
  },
  {
    key: 'oncall-handover',
    subject: 'Updated invitation: Platform on-call handover (Thu 09:30)',
    stream: 'updates',
    msgs: [
      {
        from: 'u-lucas',
        to: [ME],
        cc: ['u-priya', 'u-kwame'],
        ago: 800,
        body: `Moved the on-call handover to Thursday 09:30 so Kwame can join from Accra.

Agenda: open incidents, the pool-saturation alert, and the new canary checklist.`,
      },
    ],
    nova: { category: 'ops', meeting: { label: 'Thursday 09:30', weekday: 4, hour: 9.5, durationMins: 30 } },
  },
  {
    key: 'snowflake-usage',
    subject: 'Your November usage summary: 71% of committed credits',
    stream: 'updates',
    labels: ['Vendors'],
    msgs: [
      {
        from: 'x-snowflake',
        to: [ME],
        ago: 3500,
        body: `Hi {me},

Quick usage check-in: Helix has consumed 71% of this year's committed credits with seven weeks left in the contract year. At the current run rate you'll land at 94%, so no true-up is expected.

Happy to walk through optimisation ideas for the analytics warehouse.

Jordan Blake
Enterprise Account Executive · Snowflake`,
      },
    ],
  },

  /* ---------------- Feed ---------------- */
  {
    key: 'tldr',
    subject: 'TLDR: Gemini in the terminal, EU AI Act timelines & a $2B security round',
    stream: 'feed',
    unread: true,
    msgs: [{ from: 'x-tldr', to: [ME], ago: 240, body: `Big Tech & Startups\n\nA new terminal agent writes and runs code from natural language; the EU publishes final AI Act guidance for general-purpose models; an identity-security startup raises $2B at a $14B valuation.\n\nQuick links: passkeys pass 15 billion accounts; a guide to zero-downtime Postgres upgrades.` }],
  },
  {
    key: 'stratechery',
    subject: 'Stratechery: The agentic enterprise',
    stream: 'feed',
    msgs: [{ from: 'x-stratechery', to: [ME], ago: 1460, body: `The most important shift in enterprise software isn't AI features — it's who (or what) is doing the work. When agents can act across systems, the integration layer becomes the product.\n\nThat has implications for bundling, pricing and, above all, permissions.` }],
  },
  {
    key: 'gulfbiz',
    subject: 'Gulf Business Daily: UAE data-centre capacity to double by 2028',
    stream: 'feed',
    unread: true,
    msgs: [{ from: 'x-gulfbiz', to: [ME], ago: 300, body: `Today's top stories: UAE data-centre capacity is set to double by 2028; Dubai launches a new SME digital-trade licence; Abu Dhabi sovereign fund backs a regional AI cloud.\n\nPlus: the 10 most innovative companies in the GCC.` }],
  },
  {
    key: 'theinfo',
    subject: 'The Information: Inside the race to sell AI agents to banks',
    stream: 'feed',
    msgs: [{ from: 'x-theinfo', to: [ME], ago: 2950, body: `Banks are piloting AI agents for KYC and dispute handling, but compliance teams are slowing deployments until audit trails catch up.\n\nAlso: why identity providers are suddenly the hottest acquisition targets.` }],
  },
  {
    key: 'wamda',
    subject: 'Wamda Weekly: 14 MENA startups raised $212M this week',
    stream: 'feed',
    msgs: [{ from: 'x-wamda', to: [ME], ago: 4400, body: `This week in MENA tech: 14 startups raised $212M, led by Saudi fintech and Egyptian logistics. Emirati climate-tech had its biggest month yet.\n\nPlus: the founders building for the GCC's 2030 agendas.` }],
  },
  {
    key: 'hbr',
    subject: 'HBR: How to run meetings people actually want to attend',
    stream: 'feed',
    msgs: [{ from: 'x-hbr', to: [ME], ago: 5800, body: `Most meetings fail before they start: no decision to make, the wrong people in the room, and no pre-read.\n\nA simple test — "what will be different after this meeting?" — removes a third of recurring meetings in most teams.` }],
  },
  {
    key: 'aws-week',
    subject: 'AWS Week in Review: new services in the Middle East (UAE) Region',
    stream: 'feed',
    msgs: [{ from: 'x-awsweekly', to: [ME], ago: 7300, body: `New this week: three more services are generally available in the Middle East (UAE) Region, plus updates to IAM Access Analyzer and Security Hub.\n\nRead the full roundup on the AWS News Blog.` }],
  },

  /* ---------------- Paper trail ---------------- */
  {
    key: 'ek-ticket',
    subject: 'E-ticket receipt: DXB → LHR · EK001 · 18 Nov',
    stream: 'paper',
    labels: ['Travel'],
    msgs: [{ from: 'x-emirates-air', to: [ME], ago: 1700, body: `Thank you for choosing Emirates.\n\nBooking reference: K7Q2LM · EK001 Dubai (DXB) 07:45 → London Heathrow (LHR) 11:55 · Business\nTotal paid: AED 4,860.00 (corporate card ending 4417)\n\nYour e-ticket is attached.`, att: [att('EK-eticket-K7Q2LM.pdf', 'pdf', 210, 'internal')] }],
    nova: { amount: 'AED 4,860' },
  },
  {
    key: 'careem',
    subject: 'Your Careem ride receipt — AED 46.50',
    stream: 'paper',
    labels: ['Travel'],
    msgs: [{ from: 'x-careem', to: [ME], ago: 260, body: `Thanks for riding with Careem.\n\nDubai Marina → DIFC · 22 min · Comfort\nTotal: AED 46.50 · Paid with Business profile` }],
    nova: { amount: 'AED 46.50' },
  },
  {
    key: 'amazon',
    subject: 'Order confirmed: Logitech MX Keys S (×2)',
    stream: 'paper',
    msgs: [{ from: 'x-amazon', to: [ME], ago: 3100, body: `Your order #403-118822 has been confirmed.\n\nLogitech MX Keys S (×2) · Arriving Thursday\nOrder total: AED 798.00` }],
    nova: { amount: 'AED 798' },
  },
  {
    key: 'du-bill',
    subject: 'Your du bill for November is ready — AED 525.00',
    stream: 'paper',
    msgs: [{ from: 'x-du', to: [ME], ago: 4700, body: `Your November bill for account 1.3328841 is ready.\n\nAmount due: AED 525.00 · Due date: 28 Nov\nPay in the du app or set up auto-pay.` }],
    nova: { amount: 'AED 525' },
  },
  {
    key: 'aws-invoice',
    subject: 'AWS invoice available: October 2026 — USD 18,402.17',
    stream: 'paper',
    labels: ['Vendors'],
    msgs: [{ from: 'x-aws-billing', to: [ME], ago: 8600, body: `Your invoice for account helix-production (October 2026) is available.\n\nTotal: USD 18,402.17 · Payment method: invoice (net 30)\n\nThe PDF invoice is attached.`, att: [att('aws-invoice-2026-10.pdf', 'pdf', 340, 'confidential')] }],
    nova: { amount: 'USD 18,402' },
  },
  {
    key: 'apple',
    subject: 'Your receipt from Apple — iCloud+ 2 TB',
    stream: 'paper',
    msgs: [{ from: 'x-apple', to: [ME], ago: 9800, body: `Receipt · iCloud+ with 2 TB storage (monthly)\nTotal: AED 39.99\n\nManage your subscriptions in Settings.` }],
    nova: { amount: 'AED 39.99' },
  },
  {
    key: 'uber',
    subject: 'Your Thursday evening trip with Uber',
    stream: 'paper',
    labels: ['Travel'],
    msgs: [{ from: 'x-uber', to: [ME], ago: 10200, body: `Thanks for riding, {me}.\n\nDIFC → Jumeirah Lake Towers · 18 min\nTotal: AED 61.20` }],
    nova: { amount: 'AED 61.20' },
  },

  /* ---------------- Other ---------------- */
  {
    key: 'cisco-webinar',
    subject: 'Webinar: SASE for hybrid workforces — Nov 19',
    stream: 'other',
    msgs: [{ from: 'x-cisco', to: [ME], ago: 1900, body: `Join Cisco's security architects for a 45-minute session on SASE for hybrid teams, with a live demo and Q&A.\n\nNov 19 · 15:00 GST · Register to save your seat.` }],
  },
  {
    key: 'meetup',
    subject: 'Dubai Cloud Security Meetup: talk proposals are open',
    stream: 'other',
    msgs: [{ from: 'x-meetup', to: [ME], ago: 5400, body: `The December meetup is at Area 2071. We're looking for 15-minute talks on identity, detection engineering and incident response.\n\nSubmit a proposal by Nov 25.` }],
  },
  {
    key: 'allhands-notes',
    subject: 'Notes from the Growth all-hands (FYI)',
    stream: 'other',
    msgs: [
      {
        from: 'u-aisha',
        to: ['u-noah', 'u-sofia', 'u-yusuf'],
        cc: [ME],
        ago: 3200,
        body: `Hi all,

Notes from today's Growth all-hands: Q4 pipeline is at 1.4× target, the Aramex and Emirates expansions are our two biggest bets, and we'll pilot the in-product referral flow in December.

Shared the slides in Drive. CC'ing {me} as FYI on the security asks from enterprise prospects.

Aisha`,
      },
    ],
  },
  {
    key: 'lunch-learn',
    subject: 'Lunch & learn: what 12 interviews taught us about onboarding',
    stream: 'other',
    msgs: [{ from: 'u-hana', to: [ME], ago: 2500, body: `Hi {me},\n\nI'm running a 30-minute lunch & learn on Tuesday at 12:30 about our onboarding research — 12 interviews, three big surprises. Pizza is on me.\n\nHana` }],
    nova: { meeting: { label: 'Tuesday 12:30', weekday: 2, hour: 12.5, durationMins: 30 } },
  },
  {
    key: 'dubai-run',
    subject: 'Helix Dubai Run — team sign-ups close Sunday',
    stream: 'other',
    msgs: [{ from: 'u-sofia', to: [ME], ago: 6000, body: `The Dubai Run is on the 29th and we have 22 Helix runners so far. Sign up in #dubai-run by Sunday and grab your team T-shirt from reception.\n\nSofia 🏃‍♀️` }],
  },

  /* ---------------- Snoozed ---------------- */
  {
    key: 'okta-renewal',
    subject: 'Okta renewal: early-renewal incentive expires Nov 30',
    stream: 'priority',
    labels: ['Vendors'],
    msgs: [
      {
        from: 'x-okta',
        to: [ME],
        ago: 4000,
        body: `Hi {me},

Your Okta Workforce Identity contract renews on Jan 15. If you sign the three-year renewal before Nov 30, we can hold this year's pricing and include Okta Identity Threat Protection at no extra cost for year one.

Would you like me to send the order form?

Megan Ortiz
Customer Success Manager · Okta`,
      },
    ],
    snooze: { days: 1, hour: 8 },
    nova: { category: 'finance', deadlineDays: 19, deadlineHour: 17 },
  },
  {
    key: 'kwame-checkin',
    subject: '30-day check-in: questions about data access',
    stream: 'priority',
    labels: ['People'],
    msgs: [
      {
        from: 'u-kwame',
        to: [ME],
        ago: 1800,
        body: `Hi {me},

I'm almost at my first 30 days! Two questions: how do I request read access to the production analytics warehouse, and is there a policy for using customer data in dbt test fixtures?

Thanks for making onboarding so smooth.
Kwame`,
      },
    ],
    snooze: { days: 0, hour: 16 },
  },
  {
    key: 'growth-roadmap',
    subject: 'Q1 growth roadmap — security asks from enterprise prospects',
    stream: 'priority',
    labels: ['Product'],
    msgs: [
      {
        from: 'u-aisha',
        to: [ME],
        ago: 2200,
        body: `Hi {me},

Enterprise prospects keep asking for the same three things: SCIM provisioning, customer-managed keys and a public trust centre. Could we prioritise one of them for Q1?

Happy to bring the deal list to our next sync.

Aisha`,
      },
    ],
    snooze: { weekday: 1, hour: 9 },
  },

  /* ---------------- Sent (owner started) ---------------- */
  {
    key: 'sent-okta-fin',
    subject: 'Okta renewal: need finance sign-off by Thursday',
    stream: 'priority',
    folder: 'sent',
    labels: ['Vendors'],
    followUpDays: 2,
    msgs: [
      {
        from: ME,
        to: ['u-daniel'],
        ago: 4380,
        body: `Hi Daniel,

Okta offered to hold this year's pricing if we sign the three-year renewal before Nov 30 (about USD 186K/year). Could you confirm it fits the Q1 envelope, or flag what you need from me to sign it off by Thursday?

Thanks,
{me}`,
      },
    ],
  },
  {
    key: 'sent-dpw-nda',
    subject: 'Mutual NDA — our redlines attached',
    stream: 'priority',
    folder: 'sent',
    labels: ['Customers'],
    followUpDays: 3,
    msgs: [
      {
        from: ME,
        to: ['x-dpworld-legal'],
        cc: ['x-dpworld'],
        ago: 5800,
        body: `Dear Hessa,

Please find our redlines to the mutual NDA attached. The main change is a carve-out for security assessments under clause 4.2 so your assessors can review our SOC 2 report.

Happy to discuss on a call if useful.

Best regards,
{me}`,
        att: [att('Helix-DPW-Mutual-NDA-redlines.docx', 'doc', 148, 'internal')],
      },
    ],
  },
  {
    key: 'sent-phase2',
    subject: 'Proposal: zero-trust phase 2 budget',
    stream: 'priority',
    folder: 'sent',
    msgs: [
      {
        from: ME,
        to: [BOSS],
        ago: 1440,
        body: `Hi {boss},

Attached is the one-pager for zero-trust phase 2: device posture checks for every app, mesh mTLS (RFC-112) and passwordless for contractors. Total ask is USD 420K over two quarters, with a 30% reduction in identity-related incidents as the target.

Happy to walk you through it before the board pre-read.

{me}`,
        att: [att('ZT-phase-2-one-pager.pdf', 'pdf', 380, 'confidential')],
      },
    ],
  },
  {
    key: 'sent-intro',
    subject: 'Intro: Ethan ↔ DP World security assessors',
    stream: 'priority',
    folder: 'sent',
    msgs: [
      {
        from: ME,
        to: ['u-ethan', 'x-dpworld'],
        ago: 2000,
        body: `Marcus, meet Ethan — our security engineer who will own the vendor questionnaire and any follow-up sessions with your assessors.

Ethan, Marcus leads information security at DP World. I'll let you two take it from here.

{me}`,
      },
    ],
  },
  {
    key: 'access-kickoff',
    subject: 'Q4 access review kickoff — owners & dates',
    stream: 'other',
    msgs: [
      {
        from: ME,
        to: ['u-ethan', 'u-mateo', 'u-grace'],
        ago: 7000,
        body: `Hi all,

Kicking off the Q4 access review. Owners: Ethan (privileged access), Mateo (physical badges), Grace (finance systems). Evidence is due in the PBC folder by next Friday.

Thanks!
{me}`,
      },
      { from: 'u-ethan', to: [ME], cc: ['u-mateo', 'u-grace'], ago: 6200, body: `On it — I'll have the privileged-access export ready by Wednesday.\n\nEthan` },
    ],
  },

  /* ---------------- Screener (first contact) ---------------- */
  {
    key: 'scr-phish-it',
    subject: 'Action required: your Helix password expires in 2 hours',
    stream: 'other',
    folder: 'screener',
    unread: true,
    msgs: [
      {
        from: 'x-phish-it',
        to: [ME],
        ago: 48,
        body: `Dear Helix employee,

Our records show your Helix single sign-on password will expire in 2 hours. To avoid losing access to email and payroll, verify your account now using the secure link below.

Verify account: https://helix-sso.he1ix-co.com/verify

IT Support Team
Helix`,
      },
    ],
    nova: { category: 'security' },
  },
  {
    key: 'scr-phish-ceo',
    subject: 'Quick favour — are you at your desk?',
    stream: 'other',
    folder: 'screener',
    unread: true,
    msgs: [
      {
        from: 'x-phish-ceo',
        to: [ME],
        ago: 130,
        body: `{me}, are you at your desk? I need you to handle something discreetly for a client gesture before 3pm — I'm in back-to-back meetings and can't call.

Reply here and I'll send details. Please keep this between us for now.

Karim
Sent from my iPhone`,
      },
    ],
  },
  {
    key: 'scr-phish-aws',
    subject: 'Overdue invoice #AWS-88314 — service suspension notice',
    stream: 'other',
    folder: 'screener',
    unread: true,
    msgs: [
      {
        from: 'x-phish-aws',
        to: [ME],
        ago: 420,
        body: `Your AWS account has an overdue balance of USD 7,412.90. Services will be suspended within 24 hours unless payment details are updated.

Update billing: http://aws-billing-support.co/account/update
Download invoice: invoice-88314.html

AWS Billing Support`,
        att: [att('invoice-88314.html', 'other', 18, 'public')],
      },
    ],
  },
  {
    key: 'scr-maf',
    subject: 'Partnership: NEXUS for Majid Al Futtaim retail operations',
    stream: 'other',
    folder: 'screener',
    unread: true,
    msgs: [
      {
        from: 'x-maf',
        to: [ME],
        ago: 260,
        body: `Hello {me},

I lead partnerships for Majid Al Futtaim's retail technology group. We saw your session at GITEX and are evaluating employee-hub platforms for 38,000 frontline staff across our malls and Carrefour stores.

Would you be open to an introductory call next week? I can share our requirements beforehand.

Best regards,
Tariq Mansour
Head of Partnerships · Majid Al Futtaim`,
      },
    ],
  },
  {
    key: 'scr-gitex',
    subject: 'Speaker invitation: GITEX Global 2026 · AI & Security stage',
    stream: 'other',
    folder: 'screener',
    unread: true,
    msgs: [
      {
        from: 'x-gitex',
        to: [ME],
        ago: 1200,
        body: `Dear {me},

On behalf of the GITEX Global programme committee, we'd like to invite you to speak on the AI & Security stage (20 minutes + Q&A). Your work on phishing-resistant MFA for distributed teams is exactly the practical story our audience asks for.

Please confirm your interest by Friday so we can hold a slot: https://gitex.com/speakers

Warm regards,
Speaker Relations · GITEX Global`,
      },
    ],
  },
  {
    key: 'scr-menabytes',
    subject: 'Welcome to MENAbytes Weekly',
    stream: 'other',
    folder: 'screener',
    unread: true,
    msgs: [{ from: 'x-menabytes', to: [ME], ago: 2100, body: `Thanks for subscribing! Every Sunday you'll get the top MENA tech and startup stories in five minutes.\n\nThis week: Saudi fintech licences, a new UAE AI fund, and why Cairo is the region's new design hub.` }],
  },
  {
    key: 'scr-hays',
    subject: 'Shortlist: 3 Senior Security Engineer candidates (UAE)',
    stream: 'other',
    folder: 'screener',
    unread: true,
    msgs: [
      {
        from: 'x-hays',
        to: [ME],
        ago: 3300,
        body: `Hi {me},

Following up on your Senior Security Engineer opening — I have three pre-screened candidates available within 30 days, all with cloud IAM and incident-response experience in regulated industries.

Happy to share anonymised profiles if useful. Our standard terms are 18% of first-year base.

Best,
Rania Saeed
Senior Consultant · Hays Technology`,
      },
    ],
  },
];

/* ==========================================================================
   Builders
   ========================================================================== */

const AR_FIRST: Record<string, string> = {
  Layla: 'ليلى',
  Sara: 'سارة',
  Omar: 'عمر',
  Daniel: 'دانيال',
  Mei: 'مي',
  Alex: 'أليكس',
  Priya: 'بريا',
  Lucas: 'لوكاس',
  Aisha: 'عائشة',
  Noah: 'نوح',
  Fatima: 'فاطمة',
  Ethan: 'إيثان',
  Sofia: 'صوفيا',
  Yusuf: 'يوسف',
  Hana: 'هانا',
  Mateo: 'ماتيو',
  Grace: 'غريس',
  Kwame: 'كوامي',
  Elena: 'إيلينا',
  Karim: 'كريم',
};

/** Fallback correspondents when a template's sender would be the owner themself. */
const ALT: Record<string, string[]> = {
  'u-layla': ['u-ethan', 'u-omar'],
  'u-omar': ['u-priya', 'u-lucas'],
  'u-grace': ['u-daniel', 'u-layla'],
  'u-daniel': ['u-grace', 'u-layla'],
  'u-mei': ['u-hana', 'u-sofia'],
  'u-lucas': ['u-priya', 'u-kwame'],
  'u-ethan': ['u-layla', 'u-lucas'],
  'u-fatima': ['u-sara', 'u-aisha'],
  'u-mateo': ['u-sara', 'u-aisha'],
  'u-priya': ['u-lucas', 'u-kwame'],
  'u-sofia': ['u-aisha', 'u-hana'],
  'u-sara': ['u-fatima', 'u-layla'],
  'u-aisha': ['u-noah', 'u-sofia'],
  'u-yusuf': ['u-noah', 'u-aisha'],
  'u-kwame': ['u-lucas', 'u-priya'],
  'u-hana': ['u-mei', 'u-sofia'],
  'u-noah': ['u-yusuf', 'u-aisha'],
};

export interface SeedPeople {
  owner: User;
  managerKey: string;
  users: User[];
}

export function seedPeople(ownerId: string, users: User[] = SEED_USERS): SeedPeople {
  const list = users.length ? users : SEED_USERS;
  const owner = list.find((u) => u.id === ownerId) ?? list.find((u) => u.id === 'u-layla') ?? list[0];
  const manager = owner.managerId ? list.find((u) => u.id === owner.managerId && u.active) : undefined;
  return { owner, managerKey: manager?.id ?? 'x-ceo', users: list };
}

const firstOf = (name: string) => name.split(/\s+/)[0];

function buildThreads(p: SeedPeople, now: number, contacts: MailContact[]): MailThread[] {
  const ownerId = p.owner.id;
  const userById = new Map(p.users.map((u) => [u.id, u]));
  const contactById = new Map(contacts.map((x) => [x.id, x]));
  const sub = (who: Who): string => {
    if (who === ME) return ownerId;
    if (who === BOSS) return p.managerKey;
    if (who !== ownerId) return who;
    return (ALT[who] ?? ['u-aisha', 'u-priya', 'u-hana']).find((x) => x !== ownerId && x !== p.managerKey) ?? 'u-hana';
  };
  const nameOf = (key: string) => (key.startsWith('u-') ? userById.get(key)?.name : contactById.get(key)?.name) ?? 'there';
  const meFirst = firstOf(p.owner.name);
  const bossFirst = firstOf(nameOf(p.managerKey));
  const fill = (s: string, fromKey: string, ar = false) => {
    const tr = (n: string) => (ar ? (AR_FIRST[n] ?? n) : n);
    return s
      .replaceAll('{me}', tr(meFirst))
      .replaceAll('{boss}', tr(bossFirst))
      .replaceAll('{from}', tr(firstOf(nameOf(fromKey))));
  };

  const out: MailThread[] = [];
  for (const spec of THREADS) {
    if (spec.skipFor?.includes(ownerId)) continue;
    const id = `th-${spec.key}`;
    const messages: MailMessage[] = spec.msgs.map((m, i) => {
      const from = sub(m.from);
      const msgId = `${id}-m${i + 1}`;
      return {
        id: msgId,
        from,
        to: [...new Set((m.to ?? [ME]).map(sub))].filter((k) => k !== from),
        cc: [...new Set((m.cc ?? []).map(sub))].filter((k) => k !== from),
        at: now - m.ago * MIN,
        body: fill(m.body, from),
        attachments: m.att?.map(
          (a, j): MailAttachment => ({ id: `${msgId}-a${j + 1}`, name: a.name, kind: a.kind, sizeKb: a.sizeKb, sensitivity: a.sensitivity }),
        ),
        delivery: from === ownerId ? (m.to ?? []).some((k) => sub(k).startsWith('x-') && !contactById.get(sub(k))?.internal) ? 'accepted' : 'delivered' : undefined,
      };
    });
    const lastFrom = messages[messages.length - 1].from;
    const n = spec.nova;
    let nova: NovaSignals | undefined;
    if (n) {
      const { deadlineWeekday, deadlineDays, deadlineHour = 17, meeting, ...rest } = n;
      const deadlineAt =
        deadlineWeekday !== undefined ? nextWeekdayAt(now, deadlineWeekday, deadlineHour) : deadlineDays !== undefined ? atLocal(now, deadlineDays, deadlineHour) : null;
      nova = {
        ...rest,
        tldr: rest.tldr ? fill(rest.tldr, lastFrom) : undefined,
        deadlineAt,
        meeting: meeting ? { label: meeting.label, dayOffset: nextWeekdayOffset(now, meeting.weekday, meeting.hour), startHour: meeting.hour, durationMins: meeting.durationMins } : null,
      };
    }
    let snoozedUntil: number | null = null;
    if (spec.snooze) {
      const s = spec.snooze;
      snoozedUntil = s.weekday !== undefined ? nextWeekdayAt(now, s.weekday, s.hour) : atLocal(now, s.days ?? 1, s.hour);
      if (snoozedUntil <= now) snoozedUntil = atLocal(now, 1, s.hour);
    }
    out.push({
      id,
      subject: spec.subject,
      stream: spec.stream,
      folder: spec.folder ?? 'inbox',
      labels: spec.labels ?? [],
      messages,
      unread: spec.unread ?? false,
      starred: spec.starred ?? false,
      snoozedUntil,
      snoozedAt: snoozedUntil ? now - 3 * HOUR : null,
      nova,
      ar: spec.ar
        ? {
            subject: spec.ar.subject,
            tldr: spec.ar.tldr ? fill(spec.ar.tldr, lastFrom, true) : undefined,
            bodies: spec.ar.bodies.map((b, i) => fill(b, messages[i]?.from ?? lastFrom, true)),
            actions: spec.ar.actions,
          }
        : undefined,
      followUp: spec.followUpDays ? { active: true, afterDays: spec.followUpDays } : null,
    });
  }
  return out;
}

/** Seeded fallback approvals (used when no source app has anything pending for the owner). */
function seedApprovals(p: SeedPeople, now: number): ApprovalItem[] {
  const pick = (id: string) => (id === p.owner.id ? 'u-hana' : id);
  return [
    {
      id: 'ap-demo-proc',
      source: 'procurement',
      sourceId: 'REQ-DEMO-OKTA',
      title: 'Okta Workforce Identity — 3-year renewal',
      requesterId: pick('u-ethan'),
      amount: 'USD 186,000 / yr',
      detail: 'Security & Privacy review · SOC 2 Type II verified · ZDR addendum signed',
      steps: ['Requester', 'Budget owner', 'Security', 'Legal', 'Finance'],
      current: 2,
      at: now - 5 * HOUR,
      openTo: '/procurement/requests',
      appLabel: 'Procurement',
      relation: 'reviewer',
      noteRequiredForReject: false,
      canReject: true,
      live: false,
    },
    {
      id: 'ap-demo-leave',
      source: 'leave',
      sourceId: 'lv-demo',
      title: 'Annual leave · 5 days',
      requesterId: pick('u-mei'),
      detail: 'Family trip to Kyoto 🍁 · cover: Hana Park',
      steps: ['Requested', 'Manager', 'Booked'],
      current: 1,
      at: now - 20 * HOUR,
      openTo: '/hr/approvals',
      appLabel: 'HR Portal',
      relation: 'direct',
      noteRequiredForReject: true,
      canReject: true,
      live: false,
    },
    {
      id: 'ap-demo-exp',
      source: 'expense',
      sourceId: 'EXP-DEMO-0142',
      title: 'EXP-2026-0142 · GITEX booth & client dinners',
      requesterId: pick('u-noah'),
      amount: 'AED 6,379',
      detail: '11 receipts · 1 policy warning (meal cap) · cost centre CC-410 Sales',
      steps: ['Submitted', 'Manager', 'Finance', 'Payroll', 'Paid'],
      current: 1,
      at: now - 30 * HOUR,
      openTo: '/expenses/approvals',
      appLabel: 'Travel & Expenses',
      relation: 'direct',
      noteRequiredForReject: true,
      canReject: true,
      live: false,
      flags: ['Meal cap exceeded'],
    },
    {
      id: 'ap-demo-req',
      source: 'requisition',
      sourceId: 'req-demo-sec',
      title: 'Headcount · Senior Security Engineer (E5)',
      requesterId: pick('u-fatima'),
      detail: '1 seat · IT & Security · Dubai · hybrid',
      steps: ['Draft', 'Approval', 'Open', 'Hiring'],
      current: 1,
      at: now - 2 * DAY,
      openTo: '/talent/requisitions',
      appLabel: 'Talent Hub',
      relation: 'queue',
      noteRequiredForReject: false,
      canReject: false,
      live: false,
    },
  ];
}

function seedSentLog(now: number): number[] {
  const out: number[] = [];
  const workHours = [9.2, 10.6, 11.4, 14.1, 15.3, 16.8];
  for (let d = 0; d <= 20; d++) {
    const day = new Date(atLocal(now, -d, 12)).getDay();
    if (day === 0 || day === 6) continue;
    workHours.forEach((h, i) => {
      if ((d + i) % 3 === 0) return;
      out.push(atLocal(now, -d, h));
    });
  }
  // After-hours sends (the habit Wellbeing nudges you about)
  [
    [-1, 21.6],
    [-2, 23.2],
    [-4, 6.4],
    [-5, 20.3],
    [-9, 22.1],
    [-11, 19.5],
    [-13, 22.8],
  ].forEach(([d, h]) => out.push(atLocal(now, d, h)));
  return out.filter((ts) => ts < now).sort((a, b) => a - b);
}

function seedHistory(): MailHistory {
  const hourly = Array.from({ length: 7 }, (_, row) =>
    Array.from({ length: 24 }, (_, h) => {
      const weekend = row >= 5;
      if (weekend) return h >= 10 && h <= 18 ? ((h * 7 + row) % 3) : h === 21 ? 1 : 0;
      if (h < 7) return h === 6 ? 1 : 0;
      if (h <= 8) return 3 + (row % 2);
      if (h <= 12) return 8 + ((h + row) % 4);
      if (h === 13) return 4;
      if (h <= 17) return 7 + ((h * 3 + row) % 4);
      if (h <= 19) return 3 + (row % 3);
      return h <= 22 ? 1 + ((h + row) % 2) : 0;
    }),
  );
  return { replyMinsWeekly: [148, 131, 122, 104, 96, 81, 72, 63], hourly };
}

function seedScheduled(p: SeedPeople, now: number, userById: Map<string, User>): ScheduledSend[] {
  const ownerId = p.owner.id;
  const pick = (id: string) => (id === ownerId ? 'u-hana' : id);
  const londonTz = userById.get(pick('u-daniel'))?.timezone ?? 'Europe/London';
  const draft = (id: string, to: string[], subject: string, body: string, createdAgoMins: number): MailDraft => ({
    id,
    to,
    cc: [],
    subject,
    body,
    attachments: [],
    sensitivity: 'internal',
    mode: 'new',
    createdAt: now - createdAgoMins * MIN,
    updatedAt: now - createdAgoMins * MIN,
  });
  const meFirst = firstOf(p.owner.name);
  return [
    {
      id: 'sc-digest',
      draft: draft('dr-sc-digest', [pick('u-ethan'), pick('u-lucas'), pick('u-priya')], 'Weekly security digest — week 46', `Hi team,\n\nThis week: MFA coverage hit 95%, the he1ix-co.com lookalike was blocked tenant-wide, and RFC-112 is ready for sign-off. Next week we start the Q4 access review.\n\n${meFirst}`, 700),
      sendAt: atLocal(now, 1, 8),
      reason: 'quiet-hours',
      createdAt: now - 700 * MIN,
      status: 'scheduled',
    },
    {
      id: 'sc-daniel',
      draft: draft('dr-sc-daniel', [pick('u-daniel')], 'Q1 envelope: justification for the 6% overage', `Hi Daniel,\n\nThe overage is the Okta renewal (+3.8%) and hardware keys (+2.2%). Both retire risk the auditors flagged, and keys are a one-off. Happy to trim the observability line by 1% if needed.\n\n${meFirst}`, 95),
      sendAt: whenOnline(now + 30 * MIN, [londonTz]),
      reason: 'recipient-online',
      createdAt: now - 95 * MIN,
      status: 'scheduled',
    },
    {
      id: 'sc-freeze',
      draft: draft('dr-sc-freeze', [pick('u-lucas'), pick('u-omar')], 'Re: weekend change freeze', `Agreed — freeze from Thursday 18:00 until Sunday 08:00, with break-glass via the on-call lead.\n\n${meFirst}`, 3 * 24 * 60),
      sendAt: atLocal(now, -2, 8),
      reason: 'quiet-hours',
      createdAt: now - 3 * DAY,
      status: 'sent',
      sentAt: atLocal(now, -2, 8),
    },
  ];
}

function seedReminders(now: number): MailReminder[] {
  const today14 = atLocal(now, 0, 14);
  return [
    { id: 'rm-board', text: 'Outline the board pre-read before the review', dueAt: today14 > now ? today14 : atLocal(now, 1, 10), threadId: 'th-board-deck', done: false },
    { id: 'rm-nda', text: 'Chase DP World legal on the NDA redlines', dueAt: nextWeekdayAt(now, 5, 10), threadId: 'th-sent-dpw-nda', done: false },
  ];
}

function seedDrafts(p: SeedPeople, now: number): MailDraft[] {
  return [
    {
      id: 'dr-phish-note',
      to: [],
      cc: [],
      subject: 'All staff: how to spot the he1ix-co.com phishing emails',
      body: `Hi everyone,\n\nThis morning some of you received emails from "Helix IT Support" asking you to verify your password. They come from he1ix-co.com — note the number 1 instead of the letter l.\n\n`,
      attachments: [],
      sensitivity: 'internal',
      mode: 'new',
      createdAt: now - 40 * MIN,
      updatedAt: now - 38 * MIN,
      source: { app: 'mail', label: `Draft by ${firstOf(p.owner.name)}`, to: '/mail' },
    },
  ];
}

function seedShared(now: number): SharedConversation[] {
  const m = (id: string, from: string, ago: number, body: string) => ({ id, from, at: now - ago * MIN, body });
  return [
    {
      id: 'sh-it-vpn',
      mailboxId: 'it-support',
      subject: 'VPN keeps disconnecting on hotel Wi-Fi',
      from: 'u-noah',
      messages: [m('sh-it-vpn-1', 'u-noah', 50, 'Hi IT, I’m in New York for a client visit and the VPN drops every few minutes on the hotel Wi-Fi. I have a demo for Aramex in two hours — any quick fix?')],
      notes: [],
      status: 'new',
      receivedAt: now - 50 * MIN,
      slaMins: 240,
      priority: 'high',
      tags: ['VPN', 'Travel'],
      watchers: [{ userId: 'u-ethan', pattern: 'viewing' }],
    },
    {
      id: 'sh-it-screen',
      mailboxId: 'it-support',
      subject: 'Laptop screen flickering after the latest update',
      from: 'u-kwame',
      messages: [m('sh-it-screen-1', 'u-kwame', 190, 'Since yesterday’s macOS update my screen flickers when I connect the external monitor. Restarting didn’t help.')],
      notes: [{ id: 'sh-it-screen-n1', authorId: 'u-mateo', text: 'Known issue with the USB-C dock firmware — swapping his dock tomorrow morning.', at: now - 120 * MIN }],
      status: 'assigned',
      assigneeId: 'u-mateo',
      assignedAt: now - 150 * MIN,
      receivedAt: now - 190 * MIN,
      slaMins: 240,
      priority: 'normal',
      tags: ['Hardware'],
      watchers: [{ userId: 'u-mateo', pattern: 'typing-cycle' }],
    },
    {
      id: 'sh-it-phish',
      mailboxId: 'it-support',
      subject: 'Suspicious email — is this real?',
      from: 'u-sofia',
      messages: [m('sh-it-phish-1', 'u-sofia', 22, 'I got an email from “Helix IT Support” saying my password expires in 2 hours. The address looks like he1ix-co.com. Is this legit? I haven’t clicked anything.')],
      notes: [],
      status: 'new',
      receivedAt: now - 22 * MIN,
      slaMins: 60,
      priority: 'urgent',
      tags: ['Phishing'],
      watchers: [],
    },
    {
      id: 'sh-it-figma',
      mailboxId: 'it-support',
      subject: 'Request: Figma licence for a new contractor',
      from: 'u-alex',
      messages: [
        m('sh-it-figma-1', 'u-alex', 1500, 'Could I get a Figma editor licence? Mei asked me to help with the onboarding frames.'),
        m('sh-it-figma-2', 'u-ethan', 1380, 'Happy to — could you confirm your contract end date so we can set the licence expiry?'),
      ],
      notes: [],
      status: 'waiting',
      assigneeId: 'u-ethan',
      assignedAt: now - 1420 * MIN,
      firstReplyAt: now - 1380 * MIN,
      receivedAt: now - 1500 * MIN,
      slaMins: 240,
      priority: 'low',
      tags: ['Licences'],
    },
    {
      id: 'sh-it-badge',
      mailboxId: 'it-support',
      subject: 'Badge access for Level 21',
      from: 'u-hana',
      messages: [
        m('sh-it-badge-1', 'u-hana', 3000, 'My badge doesn’t open the Level 21 research lab. Could you add access?'),
        m('sh-it-badge-2', 'u-mateo', 2900, 'Done — please tap again and let us know if it works.'),
      ],
      notes: [],
      status: 'resolved',
      assigneeId: 'u-mateo',
      assignedAt: now - 2950 * MIN,
      firstReplyAt: now - 2900 * MIN,
      resolvedAt: now - 2800 * MIN,
      receivedAt: now - 3000 * MIN,
      slaMins: 240,
      priority: 'normal',
      tags: ['Facilities'],
    },
    {
      id: 'sh-po-cert',
      mailboxId: 'people-ops',
      subject: 'Salary certificate for a visa application — urgent',
      from: 'u-priya',
      messages: [m('sh-po-cert-1', 'u-priya', 140, 'Hi People Ops, I need a salary certificate addressed to the Schengen visa centre by Thursday. Is that possible?')],
      notes: [],
      status: 'new',
      receivedAt: now - 140 * MIN,
      slaMins: 480,
      priority: 'high',
      tags: ['Letters'],
      watchers: [{ userId: 'u-fatima', pattern: 'viewing' }],
    },
    {
      id: 'sh-po-leave',
      mailboxId: 'people-ops',
      subject: 'Question about parental leave (confidential)',
      from: 'u-noah',
      messages: [m('sh-po-leave-1', 'u-noah', 600, 'My partner is expecting in April. Could we talk through parental leave and a phased return? I haven’t told my manager yet.')],
      notes: [{ id: 'sh-po-leave-n1', authorId: 'u-sara', text: 'Confidential — don’t loop in his manager until Noah confirms.', at: now - 560 * MIN }],
      status: 'assigned',
      assigneeId: 'u-sara',
      assignedAt: now - 570 * MIN,
      receivedAt: now - 600 * MIN,
      slaMins: 480,
      priority: 'normal',
      tags: ['Leave', 'Confidential'],
    },
    {
      id: 'sh-sa-maf',
      mailboxId: 'sales',
      subject: 'Pricing for 500 seats — Majid Al Futtaim',
      from: 'x-maf-proc',
      messages: [m('sh-sa-maf-1', 'x-maf-proc', 75, 'Hello, we are shortlisting employee-hub vendors for our head-office teams (about 500 seats). Could you share indicative pricing and a reference customer in the region?')],
      notes: [],
      status: 'new',
      receivedAt: now - 75 * MIN,
      slaMins: 120,
      priority: 'high',
      tags: ['Lead', 'Retail'],
      watchers: [{ userId: 'u-yusuf', pattern: 'viewing' }],
    },
    {
      id: 'sh-sa-enbd',
      mailboxId: 'sales',
      subject: 'Demo request — Emirates NBD digital workplace',
      from: 'x-enbd',
      messages: [m('sh-sa-enbd-1', 'x-enbd', 300, 'We would like a demo of NEXUS for our digital workplace team next week, focused on IT Helpdesk and the approvals experience.')],
      notes: [],
      status: 'assigned',
      assigneeId: 'u-noah',
      assignedAt: now - 260 * MIN,
      receivedAt: now - 300 * MIN,
      slaMins: 120,
      priority: 'normal',
      tags: ['Demo', 'Banking'],
      watchers: [{ userId: 'u-noah', pattern: 'typing-cycle' }],
    },
    {
      id: 'sh-pr-invoice',
      mailboxId: 'procurement',
      subject: 'Invoice INV-77812 doesn’t match the PO',
      from: 'x-snowflake-ar',
      messages: [
        m('sh-pr-invoice-1', 'x-snowflake-ar', 2600, 'Hello, our invoice INV-77812 for USD 88,750 is past due. Please advise on payment status.'),
        m('sh-pr-invoice-2', 'u-daniel', 2400, 'Thanks — the invoice is USD 4,200 above PO-2026-311. Could you re-issue it against the PO amount?'),
      ],
      notes: [{ id: 'sh-pr-invoice-n1', authorId: 'u-daniel', text: 'Variance is the 46 unused viewer seats Nova flagged — don’t pay until re-issued.', at: now - 2390 * MIN }],
      status: 'waiting',
      assigneeId: 'u-daniel',
      assignedAt: now - 2450 * MIN,
      firstReplyAt: now - 2400 * MIN,
      receivedAt: now - 2600 * MIN,
      slaMins: 720,
      priority: 'normal',
      tags: ['Invoice', '3-way match'],
    },
    {
      id: 'sh-pr-licence',
      mailboxId: 'procurement',
      subject: 'Trade licence renewal for our vendor file',
      from: 'x-aramex-ap',
      messages: [m('sh-pr-licence-1', 'x-aramex-ap', 420, 'Dear Helix, as part of our annual vendor review please send your renewed trade licence and VAT certificate.')],
      notes: [],
      status: 'new',
      receivedAt: now - 420 * MIN,
      slaMins: 720,
      priority: 'low',
      tags: ['Compliance'],
    },
  ];
}

export function buildMailbox(ownerId: string, users: User[] = SEED_USERS, now = Date.now(), contacts: MailContact[] = seedContacts()): MailboxData {
  const p = seedPeople(ownerId, users);
  const userById = new Map(p.users.map((u) => [u.id, u]));
  return {
    ownerId: p.owner.id,
    threads: buildThreads(p, now, contacts),
    scheduled: seedScheduled(p, now, userById),
    drafts: seedDrafts(p, now),
    reminders: seedReminders(now),
    approvals: seedApprovals(p, now),
    decisions: {},
    phish: {},
    sentLog: seedSentLog(now),
    replyLog: [12, 38, 64, 22, 95, 41, 18, 57, 140, 33, 27],
    history: seedHistory(),
    prefs: { feedDigest: false, briefCollapsed: false, holdLateSends: true, zeroStreak: 3, zeroLastDay: dayKey(now - DAY) },
  };
}

export function buildMailSeed(ownerId: string, users: User[] = SEED_USERS, now = Date.now()): MailData {
  const contacts = seedContacts();
  return {
    version: MAIL_DATA_VERSION,
    ...buildMailbox(ownerId, users, now, contacts),
    contacts,
    shared: seedShared(now),
    liveApprovals: [],
    liveApprovalsAt: null,
    pending: null,
    others: {},
    inbound: {},
  };
}

/** Category label for a thread (used by the Helpdesk & CRM integrations). */
export function categoryOf(t: Pick<MailThread, 'nova'>): ThreadCategory | undefined {
  return t.nova?.category;
}
