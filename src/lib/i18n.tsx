/**
 * NEXUS Arabesque — Bilingual (English LTR / Arabic RTL) & Numeral Engine.
 *
 * Provides:
 *  - `useI18n` reactive store synced with `useHub` user preferences + localStorage
 *  - `ArabicSigil` — futuristic geometric Kufic / orbital calligraphy SVG emblem
 *  - `LanguageOrbButton` — glassmorphic TopBar / Login bilingual switcher pill
 *  - `toArabicDigits` & `translateToArabic` — dictionary + pattern translator
 */
import { create } from 'zustand';
import type { LocaleId, NumeralSystem } from '@/types';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { cx } from './cx';

const LOCALE_KEY = 'nexus-locale';
const NUMERALS_KEY = 'nexus-numerals';

const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'] as const;

export function toArabicDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)] ?? d);
}

function readStoredLocale(): LocaleId {
  if (typeof window === 'undefined') return 'en';
  try {
    const q = new URLSearchParams(window.location.search).get('lang');
    if (q === 'ar' || q === 'en') return q;
    const saved = window.localStorage.getItem(LOCALE_KEY);
    if (saved === 'ar' || saved === 'en') return saved;
  } catch {
    /* ignore */
  }
  return 'en';
}

function readStoredNumerals(): NumeralSystem {
  if (typeof window === 'undefined') return 'latn';
  try {
    const q = new URLSearchParams(window.location.search).get('numerals');
    if (q === 'arab' || q === 'latn') return q;
    const saved = window.localStorage.getItem(NUMERALS_KEY);
    if (saved === 'arab' || saved === 'latn') return saved;
  } catch {
    /* ignore */
  }
  return 'latn';
}

interface I18nState {
  locale: LocaleId;
  numerals: NumeralSystem;
  setLocale: (locale: LocaleId, silent?: boolean) => void;
  toggleLocale: () => void;
  setNumerals: (numerals: NumeralSystem) => void;
}

export const useI18n = create<I18nState>()((set, get) => ({
  locale: readStoredLocale(),
  numerals: readStoredNumerals(),
  setLocale: (locale, silent = false) => {
    try {
      window.localStorage.setItem(LOCALE_KEY, locale);
    } catch {
      /* ignore */
    }
    set({ locale });
    const hub = useHub.getState();
    if (hub.sessionUserId) {
      const cur = hub.prefs[hub.sessionUserId]?.locale;
      if (cur !== locale) hub.updatePrefs({ locale });
    }
    if (!silent) {
      if (locale === 'ar') {
        toast.info('تم تفعيل الواجهة العربية · RTL', 'اضغط L في أي وقت للتبديل بين العربية والإنجليزية');
      } else {
        toast.info('Switched to English · LTR', 'Press L anytime to toggle between English and Arabic');
      }
    }
  },
  toggleLocale: () => {
    const next: LocaleId = get().locale === 'ar' ? 'en' : 'ar';
    get().setLocale(next);
  },
  setNumerals: (numerals) => {
    try {
      window.localStorage.setItem(NUMERALS_KEY, numerals);
    } catch {
      /* ignore */
    }
    set({ numerals });
    const hub = useHub.getState();
    if (hub.sessionUserId) {
      const cur = hub.prefs[hub.sessionUserId]?.numerals;
      if (cur !== numerals) hub.updatePrefs({ numerals });
    }
  },
}));

/**
 * Futuristic geometric Kufic / orbital calligraphy emblem (`ع` / Dhad orbit).
 */
export function ArabicSigil({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cx('nx-arabic-sigil', className)}
      aria-hidden="true"
    >
      {/* Outer octagonal star-orbit */}
      <path
        d="M12 2.2 14.9 5.1 19 5.1 19 9.1 21.8 12 19 14.9 19 19 14.9 19 12 21.8 9.1 19 5 19 5 14.9 2.2 12 5 9.1 5 5.1 9.1 5.1Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
        opacity="0.38"
      />
      {/* Stylized calligraphic 'Ayn (ع) + diacritic star */}
      <path
        d="M14.8 8.2C13.6 7.3 11.4 7.4 10.4 8.7C9.5 9.8 10.1 11.3 11.8 11.7L14.6 12.2C11.2 12.4 8.8 13.8 8.8 15.8C8.8 17.5 10.9 18.6 13.8 18.2C15.1 18 16.2 17.4 17 16.6"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16.2" cy="7.2" r="1.25" fill="currentColor" />
    </svg>
  );
}

/**
 * Sleek glassmorphic bilingual pill for the TopBar and Login screen.
 */
export function LanguageOrbButton({ compact = false, className }: { compact?: boolean; className?: string }) {
  const locale = useI18n((s) => s.locale);
  const toggleLocale = useI18n((s) => s.toggleLocale);
  const isAr = locale === 'ar';

  return (
    <button
      type="button"
      onClick={toggleLocale}
      className={cx('lang-orb-btn', isAr && 'is-ar', compact && 'is-compact', className)}
      aria-label={isAr ? 'Switch language to English' : 'التبديل إلى اللغة العربية'}
      data-tip={isAr ? 'Switch to English (L)' : 'التبديل إلى العربية (L)'}
      data-tip-pos="bottom"
      data-qa="lang-toggle"
    >
      <span className="lang-orb-btn__glyph">
        <ArabicSigil size={16} />
      </span>
      <span className="lang-orb-btn__label">{isAr ? 'EN' : 'عربي'}</span>
      {!compact && <span className="lang-orb-btn__dir">{isAr ? 'LTR' : 'RTL'}</span>}
    </button>
  );
}

/* ==========================================================================
   Exact & Phrase Translation Dictionary (English -> Arabic)
   ========================================================================== */

export const AR_PERSON_NAMES: Record<string, string> = {
  'Layla Haddad': 'ليلى حداد',
  'Sara Al Mansoori': 'سارة المنصوري',
  'Omar Khalid': 'عمر خالد',
  'Daniel Okafor': 'دانيال أوكافور',
  'Mei Tanaka': 'مي تاناكا',
  'Alex Rivera': 'أليكس ريفيرا',
  'Priya Raman': 'بريا رامان',
  'Fatima Zahra': 'فاطمة الزهراء',
  'Ethan Brooks': 'إيثان بروكس',
  'Yusuf Al-Harbi': 'يوسف الحربي',
  'Aisha Bello': 'عائشة بيلو',
  'Lucas Meyer': 'لوكاس ماير',
  'Hana Park': 'هانا بارك',
  'Mateo Gomez': 'ماتيو غوميز',
  'Grace Chen': 'غريس تشين',
  'Noah Kim': 'نوح كيم',
  'Kwame Mensah': 'كوامي منساه',
  'Rania Haddad': 'رانيا حداد',
  Layla: 'ليلى',
  Sara: 'سارة',
  Omar: 'عمر',
  Daniel: 'دانيال',
  Mei: 'مي',
  Alex: 'أليكس',
  Priya: 'بريا',
  Fatima: 'فاطمة',
  Ethan: 'إيثان',
  Sofia: 'صوفيا',
  Yusuf: 'يوسف',
  Aisha: 'عائشة',
  Lucas: 'لوكاس',
  Hana: 'هانا',
  Mateo: 'ماتيو',
  Grace: 'غريس',
  Noah: 'نوح',
  Kwame: 'كوامي',
  Rania: 'رانيا',
};

export const AR_EXACT: Record<string, string> = {
  // Brand & Shell
  'EMPLOYEE HUB': 'منصة الموظفين الذكية',
  'Employee Hub': 'منصة الموظفين الذكية',
  Workspace: 'مساحة العمل',
  WORKSPACE: 'مساحة العمل',
  Governance: 'الحوكمة والتحكم',
  GOVERNANCE: 'الحوكمة والتحكم',
  'Pinned Apps': 'التطبيقات المثبتة',
  'PINNED APPS': 'التطبيقات المثبتة',
  Home: 'الرئيسية',
  Launchpad: 'منصة الإطلاق',
  LAUNCHPAD: 'منصة الإطلاق',
  Apps: 'التطبيقات',
  'All apps': 'جميع التطبيقات',
  'Apps Catalog': 'دليل التطبيقات',
  People: 'فريق العمل',
  'People directory': 'دليل الموظفين',
  Newsroom: 'غرفة الأخبار',
  'Control Center': 'مركز التحكم',
  Settings: 'الإعدادات',
  'Skip to content': 'الانتقال إلى المحتوى',
  'Back to': 'العودة إلى',
  Resume: 'متابعة',
  Return: 'عودة',
  'Your journey': 'مسار تنقلك',
  'You’re here': 'أنت هنا الآن',
  'Earlier stops from this session will collect here.': 'ستظهر محطاتك السابقة في هذه الجلسة هنا.',
  'Ask Nova or search apps, people, actions…': 'اسأل نوفا أو ابحث في التطبيقات والزملاء والإجراءات…',
  'Ask Nova or jump to an app, person or action…': 'اسأل نوفا أو انتقل مباشرةً إلى تطبيق أو زميل أو إجراء…',
  Focus: 'تركيز',
  Break: 'استراحة',
  Expand: 'توسيع',
  Collapse: 'طيّ',
  Customize: 'تخصيص',
  Go: 'انطلاق',
  Add: 'إضافة',
  Save: 'حفظ',
  Cancel: 'إلغاء',
  Close: 'إغلاق',
  Done: 'تم',
  Delete: 'حذف',
  Edit: 'تعديل',
  Remove: 'إزالة',
  Clear: 'مسح',
  Search: 'بحث',
  Filter: 'تصفية',
  All: 'الكل',
  Mine: 'الخاصة بي',
  Requestable: 'متاح للطلب',
  Recommended: 'موصى به',
  Open: 'فتح',
  Review: 'مراجعة',
  'Review →': 'مراجعة ←',
  'All →': 'الكل ←',
  'Open →': 'فتح ←',
  'Track →': 'تتبع ←',
  'Request →': 'طلب ←',
  'Calendar →': 'التقويم ←',
  'Catalog →': 'الدليل ←',
  'Tracks →': 'المسارات ←',
  'Agenda →': 'جدول الأعمال ←',
  'Who’s away →': 'المتغيبون ←',
  'works everywhere': 'يعمل في كل مكان',
  'LIVE NOW': 'مباشر الآن',
  'NOVA · LAUNCH CONSOLE': 'نوفا · منصة القيادة الذكية',
  'What do you need?': 'بماذا يمكن لنوفا مساعدتك اليوم؟',
  'Your apps, your day and Nova — all in one place.': 'تطبيقاتك، يومك، ومساعدك الذكي نوفا — في مكان واحد متكامل.',
  'Request time off': 'طلب إجازة',
  'Book travel': 'حجز رحلة عمل',
  'My payslip': 'قسيمة الراتب',
  'Reset my passkey': 'إعادة ضبط مفتاح المرور',
  'YOUR DOCK': 'منصة التطبيقات المثبتة',
  Pinned: 'المثبتة',
  'Drag to reorder': 'اسحب لإعادة الترتيب',
  'to launch': 'للتشغيل السريع',
  Agenda: 'جدول المواعيد',
  'DEEP WORK': 'العمل العميق',
  'Focus timer': 'مؤقت التركيز',
  READY: 'جاهز',
  '25 min': '25 دقيقة',
  '50 min': '50 دقيقة',
  'Sets your status to': 'يضبط حالتك إلى',
  'so colleagues know.': 'ليعلم زملاؤك أنك في جلسة تركيز.',
  'Company Pulse': 'نبض المؤسسة',
  'Team Kudos': 'تقدير الزملاء',
  'Send kudos': 'إرسال تقدير',
  'System Status': 'حالة الأنظمة',
  Celebrations: 'مناسبات الفريق',

  // Apps Names & Categories
  Communication: 'التواصل والاجتماعات',
  COMMUNICATION: 'التواصل والاجتماعات',
  Productivity: 'الإنتاجية والعمل',
  PRODUCTIVITY: 'الإنتاجية والعمل',
  PEOPLE: 'الموارد البشرية',
  Finance: 'المالية والرواتب',
  FINANCE: 'المالية والرواتب',
  Growth: 'النمو والتطوير',
  GROWTH: 'النمو والتطوير',
  Engineering: 'الهندسة والتقنية',
  ENGINEERING: 'الهندسة والتقنية',
  Operations: 'العمليات التشغيلية',
  OPERATIONS: 'العمليات التشغيلية',
  Security: 'الأمن السيبراني',
  SECURITY: 'الأمن السيبراني',
  Design: 'التصميم وتجربة المستخدم',
  DESIGN: 'التصميم وتجربة المستخدم',
  Product: 'إدارة المنتجات',
  PRODUCT: 'إدارة المنتجات',
  'People Ops': 'عمليات الأفراد',
  'PEOPLE OPS': 'عمليات الأفراد',
  'IT & Security': 'تقنية المعلومات والأمن',
  'IT & SECURITY': 'تقنية المعلومات والأمن',
  Marketing: 'التسويق المؤسسي',
  MARKETING: 'التسويق المؤسسي',
  Sales: 'المبيعات وتطوير الأعمال',
  SALES: 'المبيعات وتطوير الأعمال',
  'Customer Success': 'نجاح العملاء',
  'CUSTOMER SUCCESS': 'نجاح العملاء',

  'Security Center': 'مركز الأمن السيبراني',
  Vault: 'خزنة الأسرار',
  'IT Helpdesk': 'مكتب الدعم التقني',
  Mail: 'البريد المؤسسي',
  'Pulse Chat': 'محادثات نبض',
  'Incident Command': 'قيادة الحوادث',
  'HR Portal': 'بوابة الموارد البشرية',
  'Talent Hub': 'منصة استقطاب المواهب',
  'Performance & OKRs': 'الأداء والأهداف OKRs',
  'Knowledge Base': 'قاعدة المعرفة',
  Academy: 'أكاديمية هيلكس',
  'Helix Academy': 'أكاديمية هيلكس',
  'Travel & Expenses': 'السفر والمصروفات',
  'Payroll Console': 'منصة الرواتب والأجور',
  Projects: 'المشاريع والمهام',
  'Helix Projects': 'مشاريع هيلكس',
  Drive: 'سحابة الملفات Drive',
  'Helix Drive': 'سحابة هيلكس',
  Calendar: 'التقويم المؤسسي',
  Meet: 'اجتماعات الفيديو',
  'CSRM Roster': 'جدول المناوبات',
  DevHub: 'بوابة المطورين',
  Analytics: 'التحليلات والبيانات',
  Procurement: 'المشتريات والعقود',

  // Locations
  Dubai: 'دبي',
  London: 'لندن',
  Singapore: 'سنغافورة',
  'New York': 'نيويورك',
  Berlin: 'برلين',
  Riyadh: 'الرياض',
  'Remote · Lisbon': 'عن بُعد · لشبونة',
  'All offices': 'جميع المكاتب',

  // Presence & Roles
  Available: 'متاح',
  Focusing: 'في جلسة تركيز',
  'In a meeting': 'في اجتماع',
  Away: 'بعيد عن المكتب',
  Offline: 'غير متصل',
  'System Admin': 'مدير النظام',
  'L5 SYSTEM ADMIN': 'المستوى 5 · صلاحيات كاملة',
  'Head of IT & Security': 'رئيس تقنية المعلومات والأمن',
  'VP People': 'نائب الرئيس لعمليات الأفراد',
  'VP Engineering': 'نائب الرئيس للهندسة',
  'Senior Finance Analyst': 'محلل مالي أول',
  'Senior Product Designer': 'مصمم منتجات أول',
  'Frontend Engineer (Contractor)': 'مهندس واجهات أمامية (متعاقد)',
  'Staff Software Engineer': 'مهندس برمجيات رئيسي',
  'Talent Partner': 'شريك استقطاب المواهب',
  'Security Engineer': 'مهندس أمن سيبراني',
  'Product Manager, Growth': 'مدير منتجات النمو',
  'Account Executive': 'مدير حسابات المبيعات',

  // AppsPage / PeoplePage / NewsPage / SettingsPage
  'HUB · APP CATALOG': 'المنصة · دليل التطبيقات',
  'Search apps, tasks or keywords — try "vacation"': 'ابحث في التطبيقات أو المهام — مثل "إجازة"',
  'TRY A TASK': 'جرّب مهمة سريعة',
  'Book time off': 'طلب إجازة',
  'Reset a password': 'إعادة تعيين كلمة المرور',
  'Claim an expense': 'تقديم مطالبة مصروفات',
  'Book a room': 'حجز قاعة اجتماعات',
  'Find my payslip': 'عرض قسيمة الراتب',
  WORKSPACE_TAG: 'مساحة عمل',
  'HUB · DIRECTORY': 'المنصة · دليل الموظفين',
  'Search name, title, skill, location…': 'ابحث بالاسم أو المسمى الوظيفي أو المهارة أو المدينة…',
  'My card': 'بطاقتي',
  'LIVE PRESENCE': 'التواجد المباشر',
  'COMPANY DIRECTORY': 'دليل الشركة',
  Everyone: 'جميع الزملاء',
  Message: 'مراسلة',
  'HUB · NEWSROOM': 'المنصة · غرفة الأخبار',
  'Publish update': 'نشر خبر جديد',
  'Share an update…': 'شارك تحديثاً أو إعلاناً مع الفريق…',
  Post: 'نشر',
  'COMPANY FEED': 'أخبار المؤسسة',
  'Latest announcements': 'أحدث الإعلانات الرسمية',
  'TOP OF FEED': 'أعلى الصفحة',
  AUDIENCE: 'الجمهور المستهدف',
  'Why you see these': 'لماذا تظهر لك هذه الأخبار',
  TELEMETRY: 'مؤشرات التفاعل',
  'Feed signal': 'إشارات التفاعل',
  UPDATES: 'التحديثات',
  PINNED: 'مثبت',
  CRITICAL: 'عاجل',
  Critical: 'عاجل',
  Important: 'مهم',
  'HUB · SETTINGS': 'المنصة · الإعدادات',
  'Your hub, your rules': 'منصتك، بإعداداتك الخاصة',
  'Profile, appearance, notifications and a transparent view of everything you can access.':
    'الملف الشخصي، المظهر، اللغة، الإشعارات، وعرض شفاف لكافة صلاحياتك.',
  'PROFILE & ACCESS': 'الملف الشخصي والصلاحيات',
  'Profile & status': 'الملف الشخصي والحالة',
  Appearance: 'المظهر واللغة',
  'My access': 'صلاحياتي',
  PREFERENCES: 'التفضيلات',
  'Home widgets': 'بطاقات الرئيسية',
  Notifications: 'الإشعارات',
  'WORKSPACE & DEMO': 'مساحة العمل والبيانات التجريبية',
  Shortcuts: 'اختصارات لوحة المفاتيح',
  'Demo data': 'بيانات المحاكاة',
  'View my profile': 'عرض ملفي الشخصي',
  AVAILABILITY: 'حالة التواجد',
  'Status message': 'رسالة الحالة',

  // Projects App
  'My Work': 'مهامي',
  'MY WORK': 'مهامي',
  Inbox: 'صندوق الوارد',
  Portfolios: 'المحافظ البرامجية',
  Workload: 'عبء العمل',
  'Add task': 'إضافة مهمة',
  'New project': 'مشروع جديد',
  'Find a project': 'ابحث عن مشروع',
  STARRED: 'المفضلة',
  'DUE TODAY': 'مستحق اليوم',
  OVERDUE: 'متأخرة',
  'THIS WEEK': 'هذا الأسبوع',
  'DONE THIS WEEK': 'أُنجز هذا الأسبوع',
  '0 high priority': '0 ذات أولوية قصوى',
  'all clear': 'لا توجد متأخرات',
  'due by Sunday': 'مستحقة قبل الأحد',
  'QUICK CAPTURE': 'إضافة ذكية سريعة',
  'FOCUS RUNWAY': 'مدرج التركيز اليومي',
  'Plan my day': 'خطّط ليومي',
  'My tasks': 'مهامي المفتوحة',
  'Projects you lead': 'مشاريع تقودها',
  'Recent activity': 'النشاط الأخير',
  'At risk': 'معرّض للخطر',
  'On track': 'على المسار',
  'Off track': 'متأخر عن الخطة',
  'On hold': 'معلّق',
  Complete: 'مكتمل',
  Overview: 'نظرة عامة',
  List: 'قائمة',
  Board: 'لوحة كانبان',
  Timeline: 'الجدول الزمني',
  Dashboard: 'لوحة المؤشرات',
  Graph: 'شبكة الاعتماديات',
  Files: 'الملفات',
  Automations: 'الأتمتة الذكية',
  'Team workload': 'عبء عمل الفريق',
  Rebalance: 'إعادة موازنة ذكية',

  // IT Helpdesk App
  'SUPPORT DECK': 'منصة الدعم التقني',
  'SUPPORT DECK · LIVE': 'منصة الدعم · مباشر',
  'IT CONSOLE · FLEET': 'وحدة تقنية المعلومات · الأسطول',
  'IT CONSOLE · TAXONOMY': 'وحدة تقنية المعلومات · التصنيف',
  'IT CONSOLE · TELEMETRY': 'وحدة تقنية المعلومات · المؤشرات',
  Tickets: 'التذاكر',
  Devices: 'الأجهزة',
  Catalog: 'متجر الخدمات',
  Guides: 'الأدلة التفاعلية',
  Status: 'حالة الخدمات',
  Queue: 'طابور التذاكر',
  Fleet: 'إدارة الأسطول',
  Tags: 'الوسوم',
  Insights: 'التحليلات',
  'Service status': 'حالة الخدمات التقنية',
  Subscribe: 'اشتراك بالتنبيهات',
  'Declare incident': 'إعلان حادث تقني',
  'INCIDENT COMMAND ACTIVE': 'غرفة قيادة الحوادث نشطة',
  '90-DAY UPTIME': 'الجاهزية خلال 90 يوماً',
  'ACTIVE INCIDENTS': 'الحوادث النشطة',
  'SCHEDULED MAINT.': 'صيانة مجدولة',
  'RESOLVED (90D)': 'تم حلها (90 يوماً)',
  'Upcoming maintenance': 'نوافذ الصيانة القادمة',
  'Resolved history': 'سجل الحوادث المحلولة',
  'Fleet command': 'قيادة أسطول الأجهزة',
  'Scan sticker': 'مسح ملصق الجهاز',
  'Export CSV': 'تصدير CSV',
  'Register device': 'تسجيل جهاز جديد',
  'All devices': 'جميع الأجهزة',
  'Non-compliant': 'غير متوافق',
  Loaners: 'أجهزة الإعارة',
  'In repair': 'قيد الصيانة',
  'In stock': 'في المخزون',
  'TOTAL FLEET': 'إجمالي الأسطول',
  HEALTHY: 'سليمة',
  'NON-COMPLIANT': 'غير متوافقة',
  'LOANERS DUE': 'إعارات مستحقة',
  'IN REPAIR / LOST': 'صيانة / مفقودة',
  'Fleet posture & risk radar': 'رادار جاهزية ومخاطر الأسطول',
  'Device tags': 'وسوم تصنيف الأجهزة',
  'New tag': 'وسم جديد',
  'Fleet radar': 'رادار الأسطول',
  'Ticket queue': 'طابور التذاكر',
  'Weekly support performance': 'أداء الدعم الأسبوعي',
  'Top issues': 'أبرز المشكلات المتكررة',

  // HR Portal
  'PEOPLE DECK': 'منصة الموارد البشرية',
  'My HR': 'ملفي الوظيفي',
  'Time off': 'الإجازات',
  Benefits: 'المزايا والتأمين',
  Docs: 'المستندات والخطابات',
  Onboard: 'رحلة الانضمام',
  Approvals: 'الموافقات',
  Ops: 'عمليات الأفراد',
  'Ask People Ops': 'اسأل عمليات الأفراد',
  'NOVA · PEOPLE OPS': 'نوفا · عمليات الأفراد',
  'What can People Ops help with?': 'كيف يمكن لفريق الأفراد مساعدتك؟',
  'Instant answers · real people': 'إجابات فورية · ودعم بشري حقيقي',
  'Ask anything: payday, leave, visas, letters, insurance…': 'اسأل عن أي شيء: الرواتب، الإجازات، التأشيرات، الخطابات، التأمين الطبي…',
  Ask: 'اسأل',
  'When is payday?': 'متى موعد صرف الراتب؟',
  'How do I get a salary certificate?': 'كيف أحصل على شهادة راتب؟',
  'How much leave do I have?': 'كم رصيد إجازاتي المتبقي؟',
  'How do I add a dependent?': 'كيف أضيف معالاً للتأمين الطبي؟',
  'Where’s my contract?': 'أين أجد عقد العمل الخاص بي؟',
  'I need someone to talk to': 'أحتاج التحدث مع مختص بسرية',
  CONFIDENTIAL: 'سري للغاية',
  'Write to People Ops': 'مراسلة فريق الأفراد',
  'NEEDS YOU': 'بانتظار إجرائك',
  'Your next steps': 'خطواتك القادمة',
  'Public holidays': 'العطلات الرسمية',
  'Your team': 'فريقك',
  'Who’s away this week': 'المتغيبون هذا الأسبوع',

  // Talent Hub
  'TALENT DECK · RECRUITER LENS': 'منصة المواهب · عدسة الاستقطاب',
  Deck: 'القيادة',
  Pipeline: 'المسار',
  Sourcing: 'الاستقطاب الذكي',
  Reqs: 'الشواغر الوظيفية',
  Pool: 'قاعدة المرشحين',
  Interviews: 'المقابلات',
  Offers: 'العروض الوظيفية',
  'New requisition': 'فتح شاغر جديد',
  'Source from a JD': 'استقطاب بالذكاء الاصطناعي',
  'OPEN ROLES': 'الشواغر المفتوحة',
  'IN PIPELINE': 'في مسار التقييم',
  INTERVIEWS: 'المقابلات',
  'OFFERS OUT': 'العروض المرسلة',
  'HIRES · 90D': 'التعيينات · 90 يوماً',
  'PAST SLA': 'متجاوزة لاتفاقية الخدمة',
  'NOVA · AI SOURCING': 'نوفا · الاستقطاب بالذكاء الاصطناعي',
  'Paste a job description or describe the role': 'الصق الوصف الوظيفي أو صِف الدور المطلوب',
  Source: 'ابدأ الاستقطاب',
  'Copilot insights': 'توصيات نوفا الذكية',

  // Knowledge Base (Wiki)
  'KNOWLEDGE DECK': 'منصة المعرفة المؤسسية',
  Explore: 'استكشاف',
  Packs: 'حزم القراءة',
  Saved: 'المحفوظات',
  'Ask Nova Docs': 'اسأل نوفا للمستندات',
  'Write a page': 'كتابة صفحة جديدة',
  'VERIFIED FRESH': 'موثّقة ومحدّثة',
  'SPACES CLEARED': 'المساحات المصرحة',
  'PAGES READ': 'صفحات تمت قراءتها',
  BOOKMARKS: 'الإشارات المرجعية',
  'NEEDS REVIEW': 'بحاجة لمراجعة',
  'NOVA DOCS': 'نوفا · محرك المعرفة',
  'Ask the company brain': 'اسأل العقل المعرفي للمؤسسة',
  'Ask Nova': 'اسأل نوفا',
  'Cited · permission-scoped': 'موثّق بالمصادر · ومقيّد بالصلاحيات',
  'Reading packs': 'حزم القراءة المنهجية',
  Bookmarks: 'الإشارات المرجعية',
  'Browse by space': 'تصفح حسب المساحة المعرفية',

  // Academy
  'LEARNING DECK': 'منصة التعلم والتطوير',
  Learning: 'التعلم',
  Certs: 'الشهادات',
  'Browse catalog': 'تصفح الدورات',
  'Start a course': 'ابدأ دورة تدريبية',
  'RANK & LEVEL': 'المرتبة والمستوى',
  'REQUIRED DUE': 'تدريبات إلزامية مستحقة',
  'IN PROGRESS': 'قيد الدراسة',
  CERTIFICATES: 'الشهادات المعتمدة',
  'NOVA · LEARNING COACH': 'نوفا · مدرب التعلم الذكي',
  'What do you want to learn or practice?': 'ماذا تود أن تتعلم أو تتدرب عليه اليوم؟',
  'Find courses': 'ابحث عن دورات',
  'Skill radar': 'رادار المهارات',
  'Continue learning & required training': 'متابعة التعلم والتدريبات الإلزامية',
  'Zero open trainings — you’re 100% caught up': 'لا توجد تدريبات معلقة — أنت مواكب بنسبة 100%',

  // Travel & Expenses
  'SPEND DECK': 'منصة السفر والمصروفات',
  Flow: 'المسار',
  Travel: 'السفر',
  Receipts: 'الإيصالات',
  Reports: 'التقارير',
  Payday: 'التسوية والراتب',
  Payroll: 'الرواتب',
  'Scan receipt': 'مسح إيصال ضوئياً',
  'Request travel': 'طلب رحلة عمل',
  'PENDING REIMBURSEMENT': 'تعويضات قيد المراجعة',
  'QUEUED FOR PAYDAY': 'مجدولة مع الراتب',
  'UNSUBMITTED RECEIPTS': 'إيصالات غير مرفوعة',
  'APPROVALS INBOX': 'صندوق الموافقات',
  'NOVA · SMART RECEIPTS': 'نوفا · الإيصالات الذكية',
  'Describe an expense or a trip': 'صِف مصروفاً أو رحلة عمل — ونوفا سيسجلها فوراً',
  'File it': 'تسجيل فوري',
  'Files it in seconds': 'يسجلها خلال ثوانٍ',
  'Virtual travel card': 'بطاقة السفر الافتراضية',
  'Reimbursement tracker': 'متتبع صرف التعويضات',
  'Trip-to-paycheck flow': 'مسار الرحلة حتى الإيداع في الراتب',
  'Travel Request': 'طلب سفر',
  'Pre-Approval': 'موافقة مسبقة',
  'Upload Receipts': 'رفع الإيصالات',
  'Submit Expenses': 'تقديم التقرير',
  'Manager & Finance': 'المدير والمالية',
  'Payroll Queue': 'طابور الرواتب',
  Reimbursed: 'تم الصرف',

  // Payroll Console
  'PAYDAY DECK': 'منصة الرواتب والأجور',
  'Pay run': 'مسير الرواتب',
  Bonuses: 'المكافآت',
  Bands: 'النطاقات الوظيفية',
  Claims: 'المطالبات',
  'T&E audit': 'تدقيق المصروفات',
  'Nominate bonus': 'ترشيح مكافأة',
  'WPS .SIF': 'ملف حماية الأجور .SIF',
  'ACTIVE PERIOD': 'الفترة النشطة',
  'PAYDAY IN': 'موعد الصرف خلال',
  'TOTAL NET': 'صافي الرواتب',
  'QUEUED CLAIMS': 'مطالبات مجدولة',
  'BONUS SIGN-OFFS': 'اعتماد المكافآت',
  'PAYDAY CONTROL': 'التحكم بمسير الرواتب',
  'Draft & live sync': 'مسودة ومزامنة حية',
  'Four-eyes sign-off': 'اعتماد رباعي الأعين',
  'WPS bank file': 'ملف البنك لحماية الأجور WPS',
  Disbursed: 'تم الصرف والإيداع',
  'Sync now': 'مزامنة الآن',
  'Submit for sign-off': 'إرسال للاعتماد',
  'Where the money goes': 'توزيع إجمالي وصافي الرواتب',
  'Bank file': 'ملف البنك المركزي WPS',
  'Employee pay register': 'سجل رواتب الموظفين',
  'Bonuses & spot awards': 'المكافآت والجوائز الفورية',
  'Four-eyes approval queue': 'طابور الاعتماد الرباعي',
  'Pool burn by department': 'استهلاك ميزانية المكافآت حسب الإدارة',
  'By award type': 'حسب نوع المكافأة',
  'Variable pay ledger': 'سجل المكافآت المتغيرة',
  'Compensation & bands': 'التعويضات والنطاقات الوظيفية',
  'Salary band architecture': 'هيكلة النطاقات الوظيفية للرواتب',
  'Reimbursements bridge': 'جسر تسوية التعويضات',

  // Control Center (/admin)
  'CONTROL DECK': 'مركز التحكم والحوكمة',
  Requests: 'الطلبات',
  Roles: 'الأدوار الوظيفية',
  Audit: 'سجل التدقيق',
  'Audit log': 'سجل التدقيق',
  'Review requests': 'مراجعة الطلبات',
  'AWAITING YOU': 'بانتظار مراجعتك',
  'ACTIVE PEOPLE': 'الموظفون النشطون',
  'LIVE GRANTS': 'الصلاحيات المؤقتة النشطة',
  'EVENTS · 24H': 'أحداث السجل · 24 ساعة',
  'APPS OPERATIONAL': 'التطبيقات العاملة',
  'NOVA · ACCESS INTELLIGENCE': 'نوفا · ذكاء الصلاحيات والحوكمة',
  'Ask about access': 'اسأل عن الصلاحيات والوصول',
  'Live policy · no guesswork': 'سياسات حية · بدون تخمين',
  'Clearance & scope': 'مستوى التصريح والنطاق',
  'Expiring grants': 'صلاحيات تنتهي قريباً',
  'Security insights': 'رؤى ومؤشرات الأمان',

  // Performance & OKRs
  OKRs: 'الأهداف OKRs',
  'Check-ins': 'المراجعات الفصلية',
  Feedback: 'التغذية الراجعة',
  '1:1s': 'اللقاءات الفردية 1:1',
  Team: 'الفريق',
  Calibrate: 'المعايرة',
  'Self-reflection': 'التقييم الذاتي',
  'Manager review': 'تقييم المدير',
  'Submit review': 'إرسال التقييم',
  'Manager checklist': 'قائمة تحقق المدير',
  'Narrative quality check': 'فحص جودة وعدالة التقييم',
  'Overall rating & potential for Priya': 'التقييم العام وإمكانات النمو لبريا',
  Exceptional: 'استثنائي',
  Exceeds: 'يفوق التوقعات',
  Meets: 'يلبي التوقعات',
  Developing: 'قيد التطور',
  Below: 'أقل من التوقعات',
  'High potential': 'إمكانات نمو عالية',
  'Medium potential': 'إمكانات نمو متوسطة',
  'Low potential': 'إمكانات نمو مستقرة',

  // Login screen
  'Zero-trust SSO ready': 'دخول موحّد صفر-ثقة جاهز',
  'NEXUS WORKSPACE OS · CLEARANCE GATE': 'نظام تشغيل نيكسوس · بوابة التصريح الأمني',
  'Your whole workday,': 'يوم عملك بالكامل،',
  'one secure orbit.': 'في مدارٍ آمنٍ واحد.',
  'Clearance L1–L5': 'مستويات التصريح L1–L5',
  'Role-based access with live policy checks': 'صلاحيات مبنية على الأدوار مع فحص فوري للسياسات',
  'Ephemeral elevation': 'ترقية صلاحيات مؤقتة',
  'Time-boxed grants that expire automatically': 'تصاريح محددة بوقت تنتهي تلقائياً دون تدخل',
  'Full provenance': 'توثيق كامل للأثر',
  'Every decision captured in a tamper-evident audit trail': 'كل إجراء مسجل في سجل تدقيق محمي من التلاعب',
  'Demo sign-in · Persona deck': 'تسجيل دخول تجريبي · بطاقات الشخصيات',
  'Choose an identity': 'اختر هوية للدخول',
  'Each persona holds different roles, so you can explore how permissions shape the hub. No password needed.':
    'تحمل كل شخصية أدواراً وصلاحيات مختلفة لتجربة كيف تتشكل المنصة حسب دورك الوظيفي — دون الحاجة لكلمة مرور.',
  'Passkeys · SSO · device trust — simulated for this demo': 'مفاتيح المرور · الدخول الموحد · ثقة الأجهزة — محاكاة تفاعلية',
  'BIOMETRIC HANDSHAKE': 'المصافحة البيومترية الآمنة',
  'Verifying passkey': 'جاري التحقق من مفتاح المرور',
  'Checking device trust': 'جاري فحص موثوقية الجهاز',

  // Seeded Projects & Common Phrases
  'Passkeys & MFA Rollout': 'إطلاق مفاتيح المرور والمصادقة المتعددة',
  'Exec Offsite · FY27 Strategy': 'ملتقى القيادة · استراتيجية عام 27',
  'Prism v4 Design System': 'نظام التصميم بريزم v4',
  'Platform Reliability 2026': 'اعتمادية المنصة السحابية 2026',
  'EU-Cell Failover & DR': 'التعافي من الكوارث للخلية الأوروبية',
  'Brand refresh': 'تحديث الهوية البصرية',
  'Kwame · 30-60-90 Onboarding': 'خطة انضمام كوامي 30-60-90',
  'Q4 All-Hands & Demo Day': 'اللقاء العام للربع الرابع ويوم العروض',
  'GCC Enterprise Expansion': 'توسع قطاع الأعمال في الخليج',
  'Security insurance questionnaire': 'استبيان التأمين السيبراني',
  'Device trust policy for contractors': 'سياسة موثوقية الأجهزة للمتعاقدين',
  'Lunch & Learn: AI at work': 'لقاء المعرفة: الذكاء الاصطناعي في العمل',
  '1:1 with your manager': 'لقاء فردي 1:1 مع مديرك',
  'Focus block': 'فترة تركيز عميق',
  'Q4 planning sync': 'مزامنة تخطيط الربع الرابع',
  'Design critique: onboarding v3': 'مراجعة تصميم: تجربة الانضمام v3',

  // Settings Appearance
  'Language & script direction': 'اللغة واتجاه الواجهة',
  'Switch between English (LTR) and Arabic (العربية · RTL) across every workspace.':
    'بدّل فوراً بين الإنجليزية (من اليسار لليمين) والعربية (من اليمين لليسار) في جميع التطبيقات.',
  'Numeral system': 'نظام الأرقام',
  'Choose Western (1,234) or Eastern Arabic-Indic (١٬٢٣٤) numerals when in Arabic.':
    'اختر بين الأرقام الغربية (1,234) أو الأرقام العربية المشرقية (١٬٢٣٤) عند تفعيل العربية.',
  Theme: 'المظهر اللوني',
  Dark: 'داكن',
  Light: 'فاتح',
  System: 'النظام',
  Accent: 'اللون المميز',
  'Hover to preview, click to apply.': 'مرّر للمعاينة الحية، وانقر للتطبيق.',
  Density: 'كثافة العرض',
  Comfortable: 'مريح',
  Compact: 'مكثّف',
  'Default app view': 'العرض الافتراضي للتطبيقات',
  Grid: 'شبكة',
  'Ambient background effects': 'تأثيرات الخلفية الضوئية',
  'Reduce motion': 'تقليل الحركة والمؤثرات',
  'Live preview': 'معاينة حية',

  // Additional Launchpad, Projects & Payroll strings
  '3 access requests awaiting your review': '3 طلبات صلاحيات بانتظار مراجعتك',
  'Approve or deny time-boxed access — requesters are notified instantly.':
    'اعتمد أو ارفض الصلاحيات المؤقتة — يتم إشعار مقدمي الطلبات فوراً.',
  'Incident Command is degraded': 'خدمة قيادة الحوادث تشهد بطئاً جزئياً',
  'Some features may be slow while the team works on a fix.': 'قد تتأثر بعض الخصائص ريثما يكمل الفريق المعالجة.',
  'An app you use': 'تطبيق تستخدمه',
  '1 meeting left': 'اجتماع واحد متبقٍ',
  '6 unread': '6 غير مقروءة',
  'My work': 'مهامي',
  'Try “Book venue walkthrough in 3 days #allhands p2”': 'جرّب: "حجز جولة القاعة خلال 3 أيام #allhands p2"',
  'Nova can slot your top tasks into the gaps': 'يمكن لنوفا جدولة أهم مهامك في أوقات الفراغ تلقائياً',
  commented: 'علّق',
  'requested approval': 'طلب موافقة',
  LATER: 'لاحقاً',
  Later: 'لاحقاً',
  Today: 'اليوم',
  person: 'شخص',
  project: 'مشروع',
  priority: 'أولوية',
  tag: 'وسم',
  move: 'تحريك',
  complete: 'إنجاز',
  open: 'فتح',
  'Precision payday with four-eyes control — HR, Expenses and Bonuses synced live.':
    'مسير رواتب دقيق برقابة رباعية الأعين — متزامن لحظياً مع الموارد البشرية والمصروفات والمكافآت.',
  '1 expense report ready for finance audit': 'تقرير مصروفات واحد جاهز للتدقيق المالي',
  'Audit GL codes and VAT, then queue them into this pay run.': 'دقّق رموز الأستاذ العام وضريبة القيمة المضافة ثم أدرجها في مسير الرواتب.',
  'Draft · live sync': 'مسودة · مزامنة حية',
  'HR comp, pro-rata, leave, T&E and bonuses': 'رواتب الموارد البشرية، التناسب، الإجازات، المصروفات والمكافآت',
  'Independent Finance or People Ops counter-sign': 'توقيع مقابل مستقل من المالية أو عمليات الأفراد',
  'Inspect and export the Central Bank .SIF': 'فحص وتصدير ملف البنك المركزي .SIF',
  'Batch settled, payslips live in HR Portal': 'تسوية الدفعة وإتاحة قسائم الرواتب في بوابة الموارد البشرية',
  'Prepared & submitted': 'تم الإعداد والإرسال',
  'The preparer submits the synced draft for sign-off.': 'يرسل مُعدّ المسير المسودة المتزامنة للاعتماد.',
  'Counter-signed': 'التوقيع المقابل',
  'Unlocks once the run is submitted.': 'يُفتح فور إرسال مسير الرواتب للاعتماد.',
  'Released to bank': 'الإرسال إلى البنك',
  'Unlocks after four-eyes sign-off.': 'يُفتح بعد اكتمال الاعتماد رباعي الأعين.',
  'EDR records': 'سجلات الموظفين EDR',
  'Control total': 'إجمالي الرقابة',
  'Value date': 'تاريخ الاستحقاق',
  'Routing banks': 'البنوك المحوّل إليها',
  'Payout currencies': 'عملات الصرف',
  Inspect: 'فحص',
  'HR base & allowances synced': 'تمت مزامنة الراتب الأساسي والبدلات',
  Gross: 'الإجمالي',
  Net: 'الصافي',

  // Helpdesk Home
  'Describe a problem and Nova will diagnose it — and usually fix it.':
    'صِف أي مشكلة تقنية تواجهك وسيتولى نوفا تشخيصها — وغالباً حلها فوراً.',
  'Health check': 'فحص صحة الجهاز',
  'New ticket': 'تذكرة جديدة',
  'Nova triage': 'التشخيص الذكي · نوفا',
  'Describe what’s going on': 'صِف المشكلة التقنية التي تواجهك',
  'Fixes most issues in under a minute': 'يحل معظم المشكلات في أقل من دقيقة',
  'e.g. My VPN drops every few minutes when I’m on calls': 'مثال: اتصال VPN ينقطع كل بضع دقائق أثناء المكالمات',
  Diagnose: 'تشخيص فوري',
  'Laptop is really slow and the fans are loud': 'جهاز اللابتوب بطيء جداًوصوت المروحة مرتفع',
  'My VPN keeps dropping every few minutes': 'اتصال VPN ينقطع باستمرار كل بضع دقائق',
  'My external monitor flickers when docked': 'الشاشة الخارجية تومض عند توصيلها بالقاعدة',
  'Outlook stopped syncing my inbox': 'توقف البريد عن مزامنة الرسائل الواردة',
  'I think I clicked a phishing link': 'أعتقد أنني نقرت على رابط تصيّد احتيالي',
  'I left my phone in a taxi': 'نسيت هاتفي المحمول في سيارة أجرة',
  'One-click fixes': 'إصلاحات بنقرة واحدة',
  'Quick fixes': 'الإصلاحات السريعة التلقائية',
  'Clear disk space': 'تنظيف مساحة القرص',
  'Safely remove caches, leftovers and installers': 'إزالة الملفات المؤقتة وبقايا المثبتات بأمان',
  'Renew Wi-Fi certificate': 'تجديد شهادة Wi-Fi المكتب',
  'Fresh 802.1X certificate for office Wi-Fi': 'إصدار شهادة 802.1X جديدة لشبكة المكتب اللاسلكية',
  'Repair VPN': 'إصلاح اتصال VPN',
  'Pick the healthiest gateway and rebuild the tunnel': 'اختيار أسرع بوابة وإعادة بناء نفق الاتصال الآمن',
  'Reset passkey': 'إعادة ضبط مفتاح المرور',
  'Re-register your passkey and renew device trust': 'إعادة تسجيل مفتاح المرور وتجديد موثوقية الجهاز',
  'Report phishing': 'الإبلاغ عن تصيّد احتيالي',
  'Request software': 'طلب برنامج أو ترخيص',
  'Add a printer': 'إضافة طابعة مكتبية',
  'Fix mail & calendar sync': 'إصلاح مزامنة البريد والتقويم',
  'Your setup': 'أجهزتك المسجلة',
  'My devices': 'أجهزتي',
  'Primary device': 'الجهاز الأساسي',
  'Run check': 'فحص الآن',
  'Security key': 'مفتاح أمان',
  Phone: 'هاتف',
  'In flight': 'التذاكر الجارية',
  'My open tickets': 'تذاكري المفتوحة',
  'Nothing open': 'لا توجد تذاكر مفتوحة',
  'That’s the dream. If something breaks, describe it to Nova above.':
    'كل شيء يعمل بكفاءة. إذا واجهت أي عطل، صِفه لنوفا بالأعلى.',
  Live: 'مباشر',
  'VPN degraded in Singapore': 'بطء جزئي في خدمة VPN في سنغافورة',

  // HR Home & Holidays
  'Time off, pay, benefits and documents in a few taps, and real people when you need them.':
    'الإجازات، الرواتب، التأمين الطبي، والمستندات الرسمية في نقرات معدودة — مع فريق بشري يساندك دائماً.',
  'Commemoration Day': 'يوم الشهيد',
  'National Day': 'اليوم الوطني للإمارات',
  'New Year’s Day': 'رأس السنة الميلادية',
  'Eid al-Fitr': 'عطلة عيد الفطر',
  'days off for everyone': 'عطلة رسمية للجميع',
  'Plan it': 'خطّط لها',
  '7 requests waiting on you': '7 طلبات بانتظار مراجعتك',
  'Time off, claims, letters and cases.': 'طلبات إجازات، مطالبات مالية، خطابات، وحالات دعم.',
  WAITING: 'بانتظارك',
  '1 needs you now.': 'طلب واحد يتطلب إجراءك الآن.',
  'Manager view': 'عرض المدير',
  '1 direct report · everyone’s in today': 'مرؤوس مباشر واحد · الجميع متواجد اليوم',
  'NEXT WEEK': 'الأسبوع القادم',
  Around: 'متواجد',
  Annual: 'إجازة سنوية',
  'Who’s away': 'المتغيبون',

  // Login Persona Roles & Blurbs
  'NEXUS brings every tool your team uses into a single, permission-aware launchpad — you see exactly what your role unlocks, and can request the rest in seconds.':
    'تجمع منصة نيكسوس كل أدوات فريقك في نقطة انطلاق واحدة ذكية تراعي الصلاحيات — لترى ما يتيحه دورك فوراً وتطلب البقية في ثوانٍ.',
  'Full control: every app, roles, users, audit': 'تحكم كامل: جميع التطبيقات، الأدوار، المستخدمين، وسجل التدقيق',
  'HR powers: sensitive data, news, user admin': 'صلاحيات الموارد البشرية: البيانات الحساسة، الأخبار، وإدارة الحسابات',
  'Manager + engineer: approvals, insights, DevHub': 'مدير هندسي: الموافقات، التحليلات، وبوابة المطورين',
  'Finance stack: Ledger, Payroll, Procurement': 'منظومة المالية: الأستاذ العام، مسير الرواتب، والمشتريات',
  'Core employee + a temporary Insights grant': 'موظف أساسي + صلاحية مؤقتة لتطبيق التحليلات',
  'Scoped essentials only — try requesting access': 'صلاحيات أساسية محددة للمتعاقدين — جرّب طلب صلاحية إضافية',
  'People Ops Lead': 'رئيس عمليات الأفراد',
  'Engineering Manager, Platform': 'مدير هندسة المنصة السحابية',
  Manager: 'مدير فريق',
  Employee: 'موظف',
  Contractor: 'متعاقد',

  // Settings Appearance extra descriptions
  'Theme & workspace': 'المظهر ومساحة العمل',
  'Make NEXUS yours. Changes apply instantly and are saved to your profile.':
    'خصّص منصة نيكسوس بأسلوبك. تُطبّق التغييرات فوراً وتُحفظ في ملفك الشخصي.',
  'Dark for the full neon effect, light for daylight.': 'الوضع الداكن لتجربة نيون كاملة، والفاتح لإضاءة النهار.',
  'Compact fits more on screen; comfortable breathes.': 'النمط المكثف يعرض عناصر أكثر، والمريح يمنحك مساحات أوسع.',
  'How the Apps launchpad lays out your tools.': 'طريقة عرض التطبيقات في دليل المنصة.',
  'Aurora glow, HUD grid and film grain behind the interface.': 'توهج الشفق الضوئي وشبكة الأبعاد الخلفية للواجهة.',
  'Tone down animations, parallax and transitions.': 'تخفيف الحركات الانتقالية والمؤثرات البصرية.',

  // Pulse Chat, Drive, Performance & Projects Board
  'Live now': 'غرف صوتية نشطة الآن',
  Starred: 'المفضلة',
  Channels: 'القنوات',
  'Direct messages': 'الرسائل المباشرة',
  Huddle: 'حلقة صوتية',
  'Jump to…': 'انتقل إلى…',
  'All activity': 'كل النشاط',
  Mentions: 'الإشارات',
  Threads: 'المناقشات',
  Directory: 'دليل القنوات',
  'Catch-up': 'ملخص الذكاء',
  'Jump to latest': 'الانتقال للأحدث',
  'HOLO VAULT': 'الخزنة السحابية · درايف',
  'Jump back in': 'متابعة العمل الأخير',
  'All recent': 'كل الملفات الأخيرة',
  'Suggested for you': 'مقترحة لك',
  'Based on activity in your spaces': 'بناءً على النشاط في مساحات عملك',
  'Shared with you recently': 'تمت مشاركتها معك مؤخراً',
  'Shared with me': 'مشتركة معي',
  'My Drive': 'ملفاتي',
  'Shared drives': 'مساحات مشتركة',
  Recent: 'الأخيرة',
  Trash: 'سلة المحذوفات',
  'Access requests': 'طلبات الوصول',
  'Your storage': 'مساحة التخزين الخاصة بك',
  Create: 'إنشاء جديد',
  Doc: 'مستند',
  Sheet: 'جدول بيانات',
  Slides: 'عرض تقديمي',
  Folder: 'مجلد',
  'Upload files': 'رفع ملفات',
  Type: 'النوع',
  Owner: 'المالك',
  Modified: 'تاريخ التعديل',
  Label: 'التصنيف',
  Location: 'الموقع',
  'Time to reflect on your quarter.': 'حان وقت مراجعة إنجازاتك الفصلية.',
  'Start reflecting': 'ابدأ التقييم الذاتي',
  'Check-in hub': 'مركز المراجعات',
  'Write self-reflection': 'كتابة التقييم الذاتي',
  'Give feedback': 'تقديم تغذية راجعة',
  'Team pulse': 'نبض الفريق',
  'My OKRs': 'أهدافي OKRs',
  'Highlights reel': 'شريط الإنجازات',
  'Up next': 'المهام القادمة',
  'Next 1:1': 'اللقاء الفردي القادم',
  'Growth focus': 'محور النمو المهني',
  Self: 'ذاتي',
  Peers: 'الزملاء',
  Calibration: 'المعايرة',
  'Peer & upward feedback': 'تقييم الزملاء والمديرين',
  '1:1 conversations': 'جلسات المراجعة الفردية',
  Blocked: 'معلّق',
  Backlog: 'قائمة الانتظار',
  'This sprint': 'هذا السبرنت',
  'In progress': 'قيد التنفيذ',
  'In review': 'قيد المراجعة',
  Release: 'إعلان النتائج',
  'Release & conversations': 'إعلان النتائج والنقاشات',

  // Ledger, Procurement, CRM & Insights Workspaces
  Ledger: 'الأستاذ العام · Ledger',
  CRM: 'إدارة علاقات العملاء · CRM',
  'Helix Procurement': 'مشتريات هيلكس',
  'Helix CRM': 'علاقات العملاء · هيلكس',
  'Helix Insights': 'تحليلات هيلكس الذكية',
  Command: 'القيادة',
  Vendors: 'المورّدون',
  Contracts: 'العقود',
  Orders: 'أوامر الشراء',
  Spend: 'المصروفات',
  Accounts: 'الحسابات',
  Playbooks: 'خطط النمو',
  Simulator: 'المحاكي',
  Pulse: 'النبض',
  Funnel: 'قمع التحويل',
  Cohorts: 'الأفواج',
  Anomalies: 'الشذوذ',
  Forecast: 'التوقعات',
  'Reset Demo': 'إعادة ضبط المحاكاة',
  'Reset Telemetry': 'إعادة ضبط المؤشرات',
  'New Purchase Request': 'طلب شراء جديد',
  'New Deal': 'صفقة جديدة',
  'Quota Simulator': 'محاكي الحصص البيعية',
  '$100M ARR Modeler': 'نموذج الـ 100 مليون دولار',
  'Executive Pulse': 'نبض القيادة التنفيذية',
  'Autonomous source-to-pay, vendor 360 & renewal radar': 'الشراء والدفع الذاتي، رؤية المورّدين 360° ورادار التجديد',
  'Revenue command, MEDDPICC pipeline & expansion radar': 'قيادة الإيرادات، مسار MEDDPICC ورادار التوسع',
  'Quantum telemetry, cohorts, funnels & Nova BI': 'المؤشرات المتقدمة، الأفواج، قمع التحويل وذكاء الأعمال نوفا',
  'Helix Procurement · Autonomous Source-to-Pay': 'مشتريات هيلكس · منظومة الشراء والدفع الذاتية',
  'Autonomous Source-to-Pay & Vendor Orbit': 'منظومة الشراء والدفع الذاتية ومدار المورّدين',
  'Scope any purchase with Nova P25 peer benchmarks, route across the 5-stage parallel approval constellation, and reclaim idle SaaS spend.':
    'حلّل أي طلب شراء مقارنةً بمعايير السوق المرجعية P25 عبر نوفا، ووجّهه عبر مسار الاعتماد المتوازي من 5 مراحل، واستردّ تراخيص البرامج غير المستغلة.',
  'Helix Procurement · Approval Constellation': 'مشتريات هيلكس · كوكبة الاعتمادات المتوازية',
  'Requisitions & 5-Stage Parallel Approvals': 'طلبات الشراء والاعتمادات المتوازية من 5 مراحل',
  'Helix Procurement · Vendor 360 & SCIM Radar': 'مشتريات هيلكس · رادار المورّدين الشامل 360°',
  'Vendor 360 & License Optimization Radar': 'رؤية المورّدين 360° ورادار تحسين التراخيص',
  'Helix Procurement · Contract Vault & Redlines': 'مشتريات هيلكس · خزنة العقود والمراجعة القانونية',
  'Contract Vault, AI Redlines & Renewal Radar': 'خزنة العقود، التدقيق القانوني الذكي ورادار التجديد',
  'Helix Procurement · 3-Way Match Engine': 'مشتريات هيلكس · محرك المطابقة الثلاثية',
  'Purchase Orders & 3-Way Match Engine': 'أوامر الشراء ومحرك المطابقة الثلاثية الفوري',
  'Helix CRM · Autonomous Revenue & Growth Orbit': 'علاقات العملاء · مدار الإيرادات والنمو الذكي',
  'Revenue Command': 'قيادة الإيرادات والنمو',
  'Live ARR telemetry, Nova deal synthesis, tri-band forecast curves & 1-click autonomous closing plays.':
    'مؤشرات الإيرادات المتكررة الحية، وتحليل الصفقات عبر نوفا، ومنحنيات التوقع ثلاثية النطاقات، وخطط الإغلاق الفورية بنقرة واحدة.',
  'Helix CRM · Deal Pipeline & MEDDPICC Matrix': 'علاقات العملاء · مسار الصفقات ومصفوفة MEDDPICC',
  'Deal Pipeline & MEDDPICC': 'مسار الصفقات ومصفوفة MEDDPICC',
  'Helix CRM · Customer 360 & Expansion Radar': 'علاقات العملاء · الرؤية الشاملة للعملاء ورادار التوسع',
  'Customer 360 & White-Space': 'رؤية العميل 360° وفرص التوسع',
  'Helix CRM · Autonomous Growth Loops': 'علاقات العملاء · حلقات النمو الذاتية',
  'Playbooks & Dark-Funnel Signals': 'خطط النمو التلقائية وإشارات نية الشراء',
  'Helix CRM · Revenue & Quota Simulator': 'علاقات العملاء · محاكي الإيرادات والحصص البيعية',
  'Revenue & Quota Simulator': 'محاكي الإيرادات والحصص البيعية',
  'Helix Insights · Quantum Telemetry & Growth Cortex': 'تحليلات هيلكس · القشرة الذكية للمؤشرات والنمو',
  'Executive Growth Pulse': 'النبض التنفيذي للنمو',
  'Governed North Star KPIs, Nova Natural-Language BI & Causal Copilot, and multi-layer revenue telemetry.':
    'مؤشرات الأداء الاستراتيجية المحكومة، والمساعد التحليلي السببي نوفا باللغة الطبيعية، وقياسات الإيرادات متعددة الطبقات.',
  'Helix Insights · Acquisition, Activation & Expansion': 'تحليلات هيلكس · الاستحواذ والتفعيل والتوسع',
  'Full-Lifecycle Funnel & Experiment Lab': 'قمع التحويل المتكامل ومختبر التجارب A/B',
  'Helix Insights · Net Dollar Retention & Habit Loops': 'تحليلات هيلكس · صافي الاحتفاظ بالدولار وحلقات الولاء',
  'Retention Heatmap & Causal Feature Matrix': 'خريطة الاحتفاظ الحرارية ومصفوفة الأثر السببي للمزايا',
  'Helix Insights · Real-Time Statistical Surveillance': 'تحليلات هيلكس · الرصد الإحصائي اللحظي',
  'Neural Anomaly & Signal Radar': 'الرادار العصبي للشذوذ والإشارات',
  'Helix Insights · Stochastic FP&A Horizon': 'تحليلات هيلكس · النمذجة الاحتمالية للمالية والنمو',
  'Monte-Carlo Growth & $100M ARR Modeler': 'محاكي مونت-كارلو للنمو والوصول إلى 100 مليون دولار',
  'Managed Spend': 'الإنفاق المُدار',
  'Nova Negotiated Savings': 'وفورات التفاوض الذكي · نوفا',
  'Autonomous Cycle Time': 'زمن الدورة الذاتية',
  'Active POs & Requests': 'أوامر الشراء والطلبات النشطة',
  'Vendor Security Score': 'مؤشر أمان المورّدين',
  'Nova Autonomous Intake & Price Benchmark Copilot': 'نوفا · المساعد الذكي للطلبات ومقارنة الأسعار المرجعية',
  'Describe any software, cloud commit, or hardware need — Nova benchmarks peer pricing & builds your approval constellation':
    'صِف أي برنامج أو التزام سحابي أو أجهزة مطلوبة — يقارن نوفا أسعار السوق ويبني مسار الاعتماد المتوازي تلقائياً',
  'P25 Peer Intelligence · Live': 'ذكاء أسعار السوق P25 · مباشر',
  'Benchmark & Scope': 'تحليل السعر والنطاق',
  'In-Flight Requisitions': 'طلبات الشراء الجارية',
  'Live 5-Stage Approval Constellation Queue': 'طابور كوكبة الاعتمادات المتوازية من 5 مراحل',
  'New Request': 'طلب جديد',
  'GL Allocation & Orbit': 'توزيع الأستاذ العام والمدار',
  'Spend Breakdown by Category': 'توزيع الإنفاق حسب الفئة',
  '25 Figma Enterprise seats for Design in Singapore': '25 مقعد Figma Enterprise لفريق التصميم في سنغافورة',
  'Renew Snowflake Enterprise with 15% multi-year cap': 'تجديد عقد Snowflake Enterprise بسقف زيادة 15% متعدد السنوات',
  '40 MacBook Pro M4 Max units for Dubai Engineering': '40 جهاز MacBook Pro M4 Max لفريق الهندسة في دبي',
  'Audit unused SaaS licenses across Engineering & Design': 'تدقيق تراخيص البرامج غير المستغلة في الهندسة والتصميم',
  'Live ARR': 'الإيرادات السنوية المتكررة الحية',
  'Weighted Pipeline': 'خط الصفقات المرجّح',
  'Net Dollar Retention': 'صافي الاحتفاظ بالدولار NDR',
  'Neural Win Rate': 'معدل الفوز العصبي',
  'Q4 Expansion Velocity': 'سرعة التوسع في الربع الرابع',
  'Nova Revenue & Deal Intelligence Copilot': 'نوفا · مساعد ذكاء الإيرادات والصفقات',
  'Synthesize MEDDPICC gaps, dark-funnel telemetry & Q4 closing velocity':
    'تحليل فجوات MEDDPICC، وإشارات نية الشراء الخفية، وسرعة إغلاق صفقات الربع الرابع',
  'Autonomous Revenue Orbit': 'مدار الإيرادات الذاتي',
  Synthesize: 'تحليل ذكي',
  'Execute Closing Play': 'تنفيذ خطة الإغلاق',
  'Audit with Nova': 'تدقيق عبر نوفا',
  'Which Q4 enterprise deals have champion or security risk?': 'ما صفقات الربع الرابع التي تواجه مخاطر في الداعم الداخلي أو المراجعة الأمنية؟',
  'Generate executive closing plan for NEOM Cognitive Mobility': 'إنشاء خطة إغلاق تنفيذية لصفقة نيوم للتنقل الإدراكي',
  'Find accounts ready for Nova AI Copilot expansion': 'اكتشاف الحسابات الجاهزة للتوسع في مساعد نوفا الذكي',
  'Forecast Q4 Commit vs Neural AI projection': 'مقارنة التزامات الربع الرابع مع التوقع العصبي لنوفا',
  'Autonomous Forecast Telemetry · Q1–Q4': 'قياسات التوقع الذاتي · الربع الأول إلى الرابع',
  'Tri-Band Revenue Trajectory Curve': 'منحنى مسار الإيرادات ثلاثي النطاقات',
  'Committed ARR': 'الإيرادات الملتزم بها',
  'Nova Neural Forecast': 'التوقع العصبي · نوفا',
  'Best Case Orbit': 'أفضل سيناريو متوقع',
  '1-Click Autonomous Execution': 'تنفيذ ذاتي بنقرة واحدة',
  'Nova Autonomous Growth Plays': 'خطط النمو الذاتية من نوفا',
  'Open MEDDPICC Matrix': 'فتح مصفوفة MEDDPICC',
  'North Star Active Teams': 'الفرق النشطة (المؤشر القطبي)',
  'Rule of 40 Score': 'مؤشر قاعدة الـ 40',
  'CAC Payback': 'فترة استرداد تكلفة الاستحواذ',
  'Magic Number': 'الرقم السحري للكفاءة',
  'All Global': 'جميع المناطق العالمية',
  'MENA & GCC': 'الشرق الأوسط والخليج',
  Enterprise: 'قطاع المؤسسات الكبرى',
  'PLG Self-Serve': 'النمو الذاتي بقيادة المنتج',
  'Nova Natural-Language BI & Causal Copilot': 'نوفا · مساعد ذكاء الأعمال والتحليل السببي باللغة الطبيعية',
  'Ask any question across governed BigQuery & dbt telemetry marts':
    'اطرح أي سؤال تحليلي عبر نماذج البيانات المحكومة في BigQuery وdbt',
  'Causal Inference v4.2': 'الاستدلال السببي v4.2',
  'Governed SQL': 'استعلام SQL المحكوم',
  'Hide SQL': 'إخفاء SQL',
  'Pin to Executive Board': 'تثبيت في لوحة القيادة التنفيذية',
  'Pinned to Board': 'مثبّت في لوحة القيادة',
  'Why did MENA Net Dollar Retention jump to 142%?': 'لماذا قفز صافي الاحتفاظ بالدولار في الشرق الأوسط والخليج إلى 142%؟',
  'What features drive 90-day enterprise retention?': 'ما المزايا التي تقود الاحتفاظ بالمؤسسات خلال 90 يوماً؟',
  'Compare Enterprise vs Mid-Market CAC payback': 'قارن فترة استرداد تكلفة الاستحواذ بين المؤسسات الكبرى والشركات المتوسطة',
  'Decompose Q4 ARR growth by New vs Expansion vs Churn': 'حلّل نمو إيرادات الربع الرابع بين عملاء جدد وتوسع وتسرب',
  'Real-Time Revenue, Engagement & Efficiency Telemetry': 'القياسات الحية للإيرادات والتفاعل وكفاءة النمو',
  'ARR Growth Waterfall': 'شلال نمو الإيرادات المتكررة',
  'North Star & Nova AI Queries': 'المؤشر القطبي واستعلامات نوفا',
  'Regional ARR Mix': 'توزيع الإيرادات حسب الإقليم',
  'Rule of 40 Frontier': 'حدود كفاءة قاعدة الـ 40',
  'e.g. "25 Figma Enterprise seats for Design in Singapore" or "Renew Snowflake Enterprise with 15% multi-year cap"':
    'مثال: "25 مقعد Figma Enterprise لفريق التصميم في سنغافورة" أو "تجديد عقد Snowflake Enterprise بخصم 15%"',
  'Ask Nova about Q4 commit risks, NEOM closing plan, AI Copilot white-space, or revenue projections…':
    'اسأل نوفا عن مخاطر التزامات الربع الرابع، أو خطة إغلاق نيوم، أو فرص التوسع وتوقعات الإيرادات…',
  'e.g. Why did MENA Net Dollar Retention jump to 142%? Or compare Enterprise vs Mid-Market CAC payback…':
    'مثال: لماذا قفز صافي الاحتفاظ بالدولار في الشرق الأوسط والخليج إلى 142%؟ أو قارن استرداد تكلفة الاستحواذ…',

  // Helix Calendar (Chronos) & Helix Meet (HoloMeet)
  'Helix Calendar': 'تقويم هيلكس الذكي',
  'Helix Meet': 'اجتماعات هيلكس · HoloMeet',
  Schedule: 'الجدول',
  Timezones: 'المناطق',
  Rooms: 'القاعات',
  Links: 'الروابط',
  Lobby: 'الردهة',
  Stage: 'المرحلة',
  Replays: 'التسجيلات',
  Clips: 'المقاطع',
  'Neural time grid, global timezone weaver & smart rooms': 'شبكة الوقت الذكية، مواءمة المناطق الزمنية والقاعات الذكية',
  'Spatial video, live AI scribe, bilingual captions & async clips': 'فيديو مكاني، مدوّن ذكي، ترجمة فورية ومقاطع غير متزامنة',
  'Helix Calendar · Chronos Neural Time & Focus Orbit': 'تقويم هيلكس · مدار كرونوس للوقت والتركيز العصبي',
  'Chronos Time Grid & Focus Runway': 'شبكة الوقت الذكية ومسار التركيز',
  'Natural-language scheduling, autonomous focus shields, cross-app context & 1-click HoloMeet rooms.':
    'جدولة باللغة الطبيعية، دروع تركيز ذاتية، ربط سياقي بالتطبيقات وغرف HoloMeet بنقرة واحدة.',
  'Helix Calendar · Global Circadian Overlap Matrix': 'تقويم هيلكس · مصفوفة التداخل الزمني العالمي',
  'Global Time-Zone Weaver': 'مواءمة المناطق الزمنية العالمية',
  'Golden-window circadian overlap across Dubai, London, Singapore & New York with zero off-hour burnout.':
    'نوافذ التداخل الذهبية بين دبي ولندن وسنغافورة ونيويورك دون إرهاق خارج ساعات العمل.',
  'Helix Calendar · Spatial Pods & IoT Telemetry': 'تقويم هيلكس · القاعات المكانية وقياسات إنترنت الأشياء',
  'Smart Rooms & Spatial Pods': 'القاعات الذكية والمقصورات المكانية',
  'Live CO₂, acoustic & spatial array telemetry across Dubai Atrium, London Shoreditch & Singapore Marina.':
    'قياسات حية لثاني أكسيد الكربون والصوتيات والمصفوفات المكانية في دبي ولندن وسنغافورة.',
  'Helix Calendar · Autonomous Scheduling & Routing': 'تقويم هيلكس · الجدولة الذاتية والتوجيه الذكي',
  'Smart Booking Links & Territory Routers': 'روابط الحجز الذكية وموجّهات الأقاليم',
  'Self-healing booking links wired into CRM deal territories, Talent interview loops & People Ops 1:1s.':
    'روابط حجز ذاتية التكيف مربوطة بأقاليم صفقات CRM، ومقابلات المواهب، واجتماعات الأفراد.',
  'Helix Calendar · Maker vs. Manager Telemetry': 'تقويم هيلكس · قياسات وقت الإنجاز مقابل الإدارة',
  'Time & Focus Telemetry': 'مؤشرات الوقت والتركيز العميق',
  'Weekly meeting load, protected deep-work shields, Fragmentation Index & 1-click async clip deflection.':
    'عبء الاجتماعات الأسبوعي، دروع العمل العميق المحمية، مؤشر التشتت وتحويل الاجتماعات إلى مقاطع غير متزامنة.',
  '25m Focus Shield': 'درع تركيز 25د',
  'Defrag Schedule': 'تنظيم الجدول ذكياً',
  'Schedule Optimized': 'تم تحسين الجدول',
  'Open HoloMeet': 'فتح HoloMeet',
  'New Event': 'موعد جديد',
  'Protected Focus': 'ساعات التركيز المحمية',
  'Meeting Load': 'عبء الاجتماعات',
  'Async Reclaimed': 'وقت مسترد غير متزامن',
  'Fragmentation Index': 'مؤشر تشتت الوقت',
  'Golden Overlap': 'نافذة التداخل الذهبية',
  'Nova Chronos Natural-Language Scheduler': 'نوفا كرونوس · المجدول الذكي باللغة الطبيعية',
  'Type any scheduling intent — Nova resolves global timezones, room telemetry & cross-app links':
    'اكتب أي طلب جدولة — يحلل نوفا المناطق الزمنية العالمية، حالة القاعات والروابط بين التطبيقات',
  'Circadian Engine v4.8': 'محرك الإيقاع الزمني v4.8',
  'Schedule with Nova': 'جدولة عبر نوفا',
  'Helix Meet · HoloMeet Spatial Video & Live AI Scribe': 'اجتماعات هيلكس · الفيديو المكاني والمدوّن الذكي المباشر',
  'HoloMeet Command & Lobby': 'قيادة وردهة HoloMeet',
  '4K studio green-room, neural noise suppression, instant war-rooms & live-synced Calendar sessions.':
    'غرفة تحضير 4K، عزل ضوضاء عصبي، غرف طوارئ فورية وجلسات متزامنة مباشرة مع التقويم.',
  'Helix Meet · Live Spatial Stage & Bilingual Captions': 'اجتماعات هيلكس · المنصة المكانية والترجمة الفورية المزدوجة',
  'Spatial Meeting Stage': 'منصة الاجتماع المكاني المباشر',
  'Real-time EN ↔ AR simultaneous translation, Nova Live Scribe & 1-click push to Projects & CRM.':
    'ترجمة فورية متزامنة بين العربية والإنجليزية، مدوّن نوفا المباشر، وإرسال بنقرة واحدة للمشاريع وCRM.',
  'Helix Meet · AI Recording & Decision Vault': 'اجتماعات هيلكس · خزنة التسجيلات والقرارات الذكية',
  'AI Recordings & Chapters': 'التسجيلات الذكية والفصول',
  'Sentiment waveforms, chaptered replays, verified decisions & cross-app action item sync.':
    'موجات تفاعل المشاعر، تسجيلات مقسمة لفصول، قرارات موثقة ومزامنة المهام عبر التطبيقات.',
  'Helix Meet · Async Video Clips Studio': 'اجتماعات هيلكس · استوديو المقاطع غير المتزامنة',
  'Async Clips Studio': 'استوديو المقاطع السريعة',
  'Replace recurring status calls with 3-minute async walkthroughs, 2x AI playback & timestamped reactions.':
    'استبدل اجتماعات المتابعة المتكررة بمقاطع سريعة من 3 دقائق، وتشغيل ذكي مضاعف، وتفاعلات زمنية.',
  'Helix Meet · Meeting Pulse & Equity Telemetry': 'اجتماعات هيلكس · نبض الاجتماعات وتوازن المشاركة',
  'Meeting Pulse & Equity': 'نبض الاجتماعات وتوازن الحوار',
  'Async hours saved, cross-hub talk-time balance, decision velocity & bilingual subtitle telemetry.':
    'الساعات الموفرة غير المتزامنة، توازن وقت التحدث بين المكاتب، سرعة القرارات وإحصاءات الترجمة المزدوجة.',
  'Calendar Grid': 'شبكة التقويم',
  'Record Clip': 'تسجيل مقطع',
  'Instant War-Room': 'غرفة اجتماع فورية',
  'Live Spatial Rooms': 'الغرف المكانية المباشرة',
  'AI Recording Vault': 'أرشيف التسجيلات الذكي',
  'Async Clips Studio · Live': 'استوديو المقاطع · نشط',
  'Hours Reclaimed': 'الساعات المستردة',
  'Bilingual Equity': 'توازن الترجمة المزدوجة',
  'Join HoloMeet': 'انضم عبر HoloMeet',
  'Enter Spatial Stage': 'دخول المنصة المكانية',

  // One-rail navigation: Rail Return + Hub orb / drawer
  Back: 'رجوع',
  'Return path': 'مسار العودة',
  'Earlier stops': 'محطات سابقة',
  Hub: 'المركز',
  'home, apps & people': 'الرئيسية والتطبيقات والأشخاص',
  'Close hub menu': 'إغلاق قائمة المركز',
  'Open hub menu — home, apps and people': 'فتح قائمة المركز — الرئيسية والتطبيقات والأشخاص',

  // Short "deck" eyebrows (one convention across every app)
  'Insights deck': 'منصة التحليلات',
  'Meet deck': 'منصة الاجتماعات',
  'Time deck': 'منصة الوقت',
  'Live stage': 'المنصة المباشرة',
  'Booking links': 'روابط الحجز',

  // Journey trackers — shared lifecycle vocabulary
  Requested: 'تم الطلب',
  Submitted: 'تم الإرسال',
  Pending: 'قيد الانتظار',
  Approved: 'معتمد',
  Rejected: 'مرفوض',
  Declined: 'مرفوض',
  Denied: 'مرفوض',
  Granted: 'تم المنح',
  Draft: 'مسودة',
  Sent: 'تم الإرسال',
  Accepted: 'مقبول',
  Paid: 'تم الدفع',
  Issued: 'صادر',
  Delivered: 'تم التسليم',
  Fulfilled: 'تم التنفيذ',
  Resolved: 'تم الحل',
  Triaged: 'تم الفرز',
  Waiting: 'بانتظار الرد',
  Published: 'منشور',
  Reviewer: 'المراجع',
  Approval: 'الاعتماد',
  Legal: 'الشؤون القانونية',
  Discovery: 'الاستكشاف',
  Commit: 'الالتزام',
  Won: 'تم الفوز',
  Offer: 'العرض الوظيفي',
  Hired: 'تم التعيين',
  Interview: 'المقابلة',
  Screen: 'الفرز الأولي',
  Applied: 'تقدّم بطلب',
  Peer: 'الزملاء',
  Booked: 'تم الحجز',
  Synced: 'تمت المزامنة',
  Captured: 'تم الالتقاط',
  Tomorrow: 'غداً',
  Yesterday: 'أمس',
  Dismiss: 'تجاهل',

  // Meet — Pre-flight tracker & action-item sync
  'Pre-flight tracker': 'متتبع الجاهزية قبل الانضمام',
  'Almost ready to join': 'أوشكت على الجاهزية للانضمام',
  'You’re cleared to join': 'أنت جاهز للانضمام',
  Camera: 'الكاميرا',
  Mic: 'الميكروفون',
  'Noise & network': 'الضوضاء والشبكة',
  Captions: 'الترجمة الفورية',
  'Ready to join': 'جاهز للانضمام',
  Off: 'متوقف',
  Muted: 'مكتوم',
  'EN ↔ AR': 'إنجليزي ↔ عربي',
  'Spatial 3D Audio': 'صوت مكاني ثلاثي الأبعاد',
  Stereo: 'ستيريو',
  'Camera is off — turn it on to finish pre-flight': 'الكاميرا متوقفة — شغّلها لإكمال فحوصات الجاهزية',
  'Mic is muted — unmute to finish pre-flight': 'الميكروفون مكتوم — ألغِ الكتم لإكمال فحوصات الجاهزية',
  'Noise suppression is under 90% — find a quieter spot to finish pre-flight': 'عزل الضوضاء أقل من 90% — انتقل إلى مكان أهدأ لإكمال الجاهزية',
  'EN ↔ AR captions are off — arm them to finish pre-flight': 'الترجمة الفورية متوقفة — فعّلها لإكمال فحوصات الجاهزية',
  'All checks green — Nova Scribe joins you on stage': 'جميع الفحوصات سليمة — مدوّن نوفا ينضم إليك على المنصة',
  'All checks green — you’re ready to join': 'جميع الفحوصات سليمة — أنت جاهز للانضمام',
  'Turn camera on': 'تشغيل الكاميرا',
  'Arm captions': 'تفعيل الترجمة',
  Unmute: 'إلغاء الكتم',
  'Enter Stage': 'دخول المنصة',
  'Action item sync': 'مزامنة بنود العمل',
  'Environment optics': 'بصريات البيئة',
  'Live rooms': 'الغرف المباشرة',
  'Stage layout': 'تخطيط المنصة',
  Transcript: 'النص المكتوب',
  Actions: 'الإجراءات',

  // Calendar — Chronos booking tracker
  'Chronos booking tracker': 'متتبع حجز كرونوس',
  Understood: 'تم الفهم',
  'Golden window': 'النافذة الذهبية',
  Room: 'القاعة',
  Invites: 'الدعوات',
  'Just you': 'أنت فقط',
  'HoloMeet room': 'غرفة HoloMeet',
  'Nova is holding this golden window — confirm to send invites': 'نوفا يحجز هذه النافذة الذهبية — أكّد لإرسال الدعوات',
  'Nova is holding this golden window — confirm to shield it': 'نوفا يحجز هذه النافذة الذهبية — أكّد لحمايتها',
  'Booked — invites are out and the HoloMeet room is ready': 'تم الحجز — أُرسلت الدعوات وغرفة HoloMeet جاهزة',
  'Booked — your Deep Work shield is on the grid': 'تم الحجز — درع العمل العميق مثبّت في جدولك',

  // Expenses — reimbursement & trip trackers
  'Procurement deck': 'منصة المشتريات',
  'Finance audit': 'تدقيق المالية',
  'Payroll run': 'مسير الرواتب',
  'Pre-approval': 'الموافقة المسبقة',
  Expensed: 'تم تقييد المصروف',
  You: 'أنت',
  'Your manager': 'مديرك',
  'Finance team': 'فريق المالية',
  payslip: 'قسيمة الراتب',
  'Cut-off': 'آخر موعد',
  ETA: 'الوصول المتوقع',
  Lands: 'يصل',
  'Ready when you are': 'جاهز متى شئت',
  'With your manager': 'لدى مديرك',
  'Finance is on it': 'المالية تعمل عليه',
  'Your money is on its way': 'أموالك في الطريق إليك',
  'Money in the bank': 'الأموال في حسابك',
  'Needs a quick fix': 'يحتاج تعديلاً سريعاً',
  'Claim declined': 'تم رفض المطالبة',
  'Parked as a draft': 'محفوظ كمسودة',
  'reviews it as soon as you submit': 'سيراجعه فور إرسالك',
  'is reviewing your receipts': 'يراجع إيصالاتك',
  'Finance audit is next': 'تدقيق المالية هو التالي',
  'approved it': 'وافق عليه',
  'in Finance is double-checking the receipts and VAT': 'من المالية يتحقق من الإيصالات وضريبة القيمة المضافة',
  'is double-checking the receipts and VAT': 'يتحقق من الإيصالات وضريبة القيمة المضافة',
  'queued it for the': 'أدرجه في',
  'sent the': 'أرسل',
  'for four-eyes sign-off': 'للاعتماد المزدوج',
  'is waiting on four-eyes sign-off': 'بانتظار الاعتماد المزدوج',
  'signed off the': 'اعتمد',
  'WPS payout is next': 'صرف نظام حماية الأجور هو التالي',
  'is paying out now': 'يصرف الآن',
  'went out by express wire': 'أُرسل بتحويل سريع',
  'was paid in the': 'صُرف ضمن',
  'it’s on your payslip': 'وهو في قسيمة راتبك',
  'sent it back for a fix': 'أعاده للتعديل',
  'update it and resubmit': 'حدّثه وأعد إرساله',
  'declined this claim': 'رفض هذه المطالبة',
  'follow the claim in Payday': 'تابع المطالبة في يوم الراتب',
  'receipts are filed in an expense report': 'الإيصالات مقيدة في تقرير مصروفات',
  'Saved as a draft': 'محفوظ كمسودة',
  'submit it for pre-approval': 'أرسله للموافقة المسبقة',
  'Waiting on your pre-approval': 'بانتظار موافقتك المسبقة',
  'is reviewing your trip request': 'يراجع طلب رحلتك',
  'is reviewing this trip request': 'يراجع طلب الرحلة هذا',
  'the virtual card is issued on approval': 'تُصدر البطاقة الافتراضية عند الموافقة',
  'asked for changes before approving': 'طلب تعديلات قبل الموافقة',
  'declined this trip': 'رفض هذه الرحلة',
  'book your flight and hotel next': 'احجز رحلتك وفندقك تالياً',
  'flight and hotel booking is next': 'حجز الطيران والفندق هو التالي',
  'All booked': 'تم حجز كل شيء',
  departs: 'يغادر',
  'Safe travels': 'رحلة آمنة',
  'duty-of-care is on until': 'رعاية المسافر مفعّلة حتى',
  'Welcome back': 'مرحباً بعودتك',
  'mark the trip completed and expense it': 'حدّد الرحلة كمكتملة وقيّد مصروفاتها',
  'waiting to be marked completed': 'بانتظار تحديدها كمكتملة',
  'Trip wrapped': 'اكتملت الرحلة',
  'bundle your receipts into an expense report': 'اجمع إيصالاتك في تقرير مصروفات',
  'waiting on the expense report': 'بانتظار تقرير المصروفات',
  'This trip was cancelled': 'أُلغيت هذه الرحلة',
  'Trip tracker': 'متتبع الرحلة',
  'Trip-to-paycheck progress': 'تقدّم الرحلة حتى الراتب',
  'Next payday': 'يوم الراتب القادم',
  receipt: 'إيصال',
  receipts: 'إيصالات',
  VAT: 'ضريبة القيمة المضافة',

  // Payroll & Procurement — payday, bonus, purchase & PO trackers
  'Payday tracker': 'متتبع يوم الراتب',
  'Bonus tracker': 'متتبع المكافآت',
  'Sign-off': 'الاعتماد',
  'Bank release': 'التحويل البنكي',
  Nominated: 'مرشّح',
  'HR review': 'مراجعة الموارد البشرية',
  'You’re up — submit for sign-off by': 'دورك الآن — أرسله للاعتماد قبل',
  'Back in draft for edits — re-submit for sign-off by': 'عاد إلى المسودة للتعديل — أعد إرساله للاعتماد قبل',
  'The payroll team submits for sign-off by': 'يرسله فريق الرواتب للاعتماد قبل',
  'Stuck at four-eyes — no second approver besides': 'متوقف عند الاعتماد المزدوج — لا يوجد معتمد ثانٍ غير',
  'sent it over — it’s your turn for the four-eyes check': 'أرسله — حان دورك للتحقق المزدوج',
  'sent it over — waiting on': 'أرسله — بانتظار',
  'for the four-eyes check': 'للتحقق المزدوج',
  or: 'أو',
  and: 'و',
  'signed off — the WPS batch for': 'اعتمده — دفعة نظام حماية الأجور لـ',
  'is ready for bank release': 'جاهزة للتحويل البنكي',
  'Paid! WPS batch': 'تم الدفع! دفعة نظام حماية الأجور',
  'landed in': 'وصلت إلى',
  accounts: 'حسابات',
  'Purchase tracker': 'متتبع الشراء',
  'PO tracker': 'متتبع أمر الشراء',
  'Moving through approvals': 'يمضي عبر الاعتمادات',
  'Changes requested': 'مطلوب تعديلات',
  'Request declined': 'تم رفض الطلب',
  'On hold for pricing': 'معلّق لحين التسعير',
  'Back with the requester': 'عاد إلى مقدم الطلب',
  'Cleared for a PO': 'جاهز لإصدار أمر الشراء',
  'PO sent to the vendor': 'أُرسل أمر الشراء إلى المورّد',
  Budget: 'الميزانية',
  'PO issued': 'صدر أمر الشراء',
  Receipt: 'الاستلام',
  Invoice: 'الفاتورة',
  '3-way match': 'المطابقة الثلاثية',
  SLA: 'اتفاقية الخدمة',
  'Overdue by': 'متأخر بمقدار',
  'left on SLA': 'متبقية على اتفاقية الخدمة',
  Cleared: 'تم الاعتماد',
  'Cycle time': 'زمن الدورة',
  'is checking it against the budget': 'يطابقه مع الميزانية',
  'is vetting the vendor on security & privacy': 'يفحص المورّد أمنياً ومن حيث الخصوصية',
  'is red-lining the contract': 'يراجع العقد قانونياً',
  'is giving it the final finance sign-off': 'يمنحه الاعتماد المالي النهائي',
  'is reviewing it': 'يراجعه',
  'flagged it': 'وضع عليه علامة',
  'flagged it for changes': 'طلب تعديلات عليه',
  'declined it': 'رفضه',
  'This request was declined': 'تم رفض هذا الطلب',
  'is holding sign-off while Nova negotiates with': 'يؤجل الاعتماد بينما يتفاوض نوفا مع',
  'The PO is on hold while Nova negotiates with': 'أمر الشراء معلّق بينما يتفاوض نوفا مع',
  'needs to add a few details before it can move on': 'يحتاج إلى إضافة بعض التفاصيل قبل المتابعة',
  'cleared the final gate — the PO is ready to issue': 'اجتاز البوابة الأخيرة — أمر الشراء جاهز للإصدار',
  'Every gate is cleared — the PO is ready to issue': 'تم اجتياز جميع البوابات — أمر الشراء جاهز للإصدار',
  'is out —': 'صدر —',
  'has it': 'لديه',
  'The PO': 'أمر الشراء',
  'The reviewer': 'المراجع',

  // Talent — offer & candidate journey trackers
  'Offer tracker': 'متتبع العرض الوظيفي',
  'Candidate journey': 'رحلة المرشح',
  'Requisition tracker': 'متتبع طلب التوظيف',
  'Onboarding tracker': 'متتبع التهيئة',
  'Ready to send': 'جاهز للإرسال',
  'With candidate': 'لدى المرشح',
  Signed: 'تم التوقيع',
  Returned: 'أُعيد',
  Acquire: 'الاستقطاب',
  Assess: 'التقييم',
  Decide: 'القرار',
  'Being drafted': 'قيد الصياغة',
  'Needs changes': 'يحتاج تعديلات',
  'Waiting on approvals': 'بانتظار الاعتمادات',
  'Out for signature': 'بانتظار التوقيع',
  'Signing window closed': 'انتهت مهلة التوقيع',
  'Signed — it’s a hire!': 'تم التوقيع — لدينا تعيين جديد!',
  'First 90 days': 'أول 90 يوماً',
  Starts: 'يبدأ',
  Target: 'المستهدف',
  'Target start': 'تاريخ البدء المستهدف',
  'sent it back:': 'أعاده:',
  'sent it back: “': 'أعاده: «',
  'sent it back for changes': 'أعاده لإجراء تعديلات',
  'is putting the package together — next stop: approvals': 'يُعدّ الحزمة — المحطة التالية: الاعتمادات',
  'Waiting on': 'بانتظار',
  'and People Ops to sign off': 'وعمليات الأفراد للاعتماد',
  'signed off — now with People Ops:': 'اعتمده — الآن لدى عمليات الأفراد:',
  'signed off — People Ops is checking the numbers': 'اعتمده — عمليات الأفراد تراجع الأرقام',
  'approved for People Ops — waiting on': 'اعتمده عن عمليات الأفراد — بانتظار',
  'for the final nod': 'للموافقة النهائية',
  'People Ops approved — waiting on': 'اعتمدت عمليات الأفراد — بانتظار',
  'Both sign-offs are in —': 'اكتمل الاعتمادان —',
  'can send it to': 'يمكنه إرساله إلى',
  'The signing window closed': 'انتهت مهلة التوقيع',
  '— time for': '— حان الوقت لـ',
  'to check in with': 'للتواصل مع',
  'The offer is with': 'العرض لدى',
  'sent it': 'أرسله',
  'signed — day one is': 'وقّع — اليوم الأول هو',
  'declined:': 'رفض:',
  'declined the offer': 'رفض العرض',
  'Rescinded:': 'تم السحب:',
  'The offer was rescinded': 'تم سحب العرض',
  'is hired — onboarding is live in HR Portal': 'تم تعيينه — التهيئة جارية في بوابة الموارد البشرية',
  'is hired —': 'تم تعيينه —',
  'hands off to HR Portal next': 'يسلّم الملف إلى بوابة الموارد البشرية تالياً',
  'withdrew at': 'انسحب في مرحلة',
  'Closed out at': 'أُغلق في مرحلة',
  'The role is on hold —': 'الوظيفة معلّقة —',
  'stays at': 'يبقى في',
  'until it reopens': 'حتى يُعاد فتحها',
  'is writing the first message to': 'يكتب الرسالة الأولى إلى',
  'No reply yet —': 'لا رد بعد —',
  'is sending a follow-up': 'يرسل رسالة متابعة',
  'to reply to': 'ليرد على',
  'is collecting consent from': 'يجمع الموافقة من',
  'is booking a recruiter screen with': 'يحجز مقابلة فرز مع',
  'is booking the interview loop': 'يحجز سلسلة المقابلات',
  meets: 'يلتقي',
  'for the screen': 'لمقابلة الفرز',
  'Screen done — waiting on': 'انتهى الفرز — بانتظار',
  'for the scorecard': 'لبطاقة التقييم',
  'Screen done — the scorecard is due': 'انتهى الفرز — بطاقة التقييم مستحقة',
  'Next up:': 'التالي:',
  with: 'مع',
  'Interviews done — waiting on': 'انتهت المقابلات — بانتظار',
  'for feedback': 'للملاحظات',
  'Interviews done — feedback is due': 'انتهت المقابلات — الملاحظات مستحقة',
  'Screen passed —': 'اجتاز الفرز —',
  'is lining up the interview loop': 'ينظّم سلسلة المقابلات',
  'Loop complete —': 'اكتملت المقابلات —',
  'runs the debrief': 'يدير جلسة المراجعة',
  'Offer accepted — welcome aboard!': 'تم قبول العرض — أهلاً بك في الفريق!',
  'Ready for': 'جاهز لـ',
  '— over to': '— الدور على',
  'isn’t interested right now —': 'غير مهتم حالياً —',
  'will close out kindly': 'سيغلق الملف بلطف',
  'decided not to hire —': 'قرر عدم التعيين —',
  'The screen didn’t recommend advancing —': 'لم يوصِ الفرز بالتقدم —',
  'to make the call after the debrief': 'لاتخاذ القرار بعد جلسة المراجعة',
  'The last offer was rescinded —': 'سُحب العرض الأخير —',
  'is preparing a new one': 'يُعدّ عرضاً جديداً',
  'It’s a yes from': 'موافقة من',
  'is drafting the offer': 'يصوغ العرض',

  // Talent requisitions & onboarding · Performance review-cycle trackers
  'is drafting this role — next stop: headcount approval': 'يصوغ هذه الوظيفة — المحطة التالية: اعتماد الوظيفة الشاغرة',
  'to approve the headcount': 'لاعتماد الوظيفة الشاغرة',
  'Waiting for a recruiter to approve the headcount': 'بانتظار مسؤول توظيف لاعتماد الوظيفة الشاغرة',
  'Offer in flight for': 'عرض جارٍ لـ',
  'is running the search —': 'يدير البحث —',
  'Ready for sourcing — over to': 'جاهز للاستقطاب — الدور على',
  'Paused — candidates stay put until': 'متوقف — يبقى المرشحون في أماكنهم حتى',
  'reopens it': 'يعيد فتحه',
  'seats filled — onboarding continues in HR Portal': 'مقاعد مشغولة — التهيئة مستمرة في بوابة الموارد البشرية',
  'Seat filled — onboarding continues in HR Portal': 'تم شغل المقعد — التهيئة مستمرة في بوابة الموارد البشرية',
  'Closed with': 'أُغلق مع',
  'seats filled': 'مقاعد مشغولة',
  'wrapped up the 90-day journey': 'أنهى رحلة الـ 90 يوماً',
  'Running late —': 'متأخر —',
  'still owes': 'لا يزال مطالباً بـ',
  'All set for day one —': 'كل شيء جاهز لليوم الأول —',
  'starts in': 'يبدأ خلال',
  'All set —': 'كل شيء جاهز —',
  'starts today': 'يبدأ اليوم',
  'is wrapped — next up:': 'اكتملت — التالي:',
  'Final stretch — every task is done': 'المرحلة الأخيرة — اكتملت جميع المهام',
  'the candidate': 'المرشح',
  'the recruiter': 'مسؤول التوظيف',
  'The recruiter': 'مسؤول التوظيف',
  'the hiring manager': 'مدير التوظيف',
  'The hiring manager': 'مدير التوظيف',
  'a candidate': 'مرشح',
  'the panel': 'لجنة المقابلة',
  'or a colleague': 'أو زميل',
  'Peer feedback': 'ملاحظات الزملاء',
  Nominations: 'الترشيحات',
  Responses: 'الردود',
  Themes: 'المحاور',
  'Review cycle tracker': 'متتبع دورة التقييم',
  'Your review is on its way': 'تقييمك في الطريق إليك',
  'Your review is complete': 'اكتمل تقييمك',
  'Not submitted': 'لم يُرسل',
  Leaders: 'القادة',
  Due: 'الاستحقاق',
  Opens: 'يفتح',
  Wraps: 'يُختتم',
  'Your turn — tell the story of your quarter': 'دورك الآن — احكِ قصة ربعك',
  'Your self-reflection is in draft — pick up where you left off': 'تقييمك الذاتي مسودة — تابع من حيث توقفت',
  'Your review unlocks once it’s in': 'يُفتح تقييمك بمجرد إرساله',
  'Your peer reviewers declined — nominate someone new': 'اعتذر زملاؤك المراجعون — رشّح شخصاً جديداً',
  'Pick 2–4 colleagues who saw your work up close': 'اختر من 2 إلى 4 زملاء رأوا عملك عن قرب',
  'Your review is past due — finish it before calibration locks': 'تقييمك متأخر — أكمله قبل إغلاق المعايرة',
  'Your draft is saved — finish it to send it to calibration': 'تم حفظ مسودتك — أكملها لإرسالها إلى المعايرة',
  'Your review is in': 'تم استلام تقييمك',
  'You can share the review once it locks': 'يمكنك مشاركة التقييم بعد قفله',
  'Your review is here — read it, then acknowledge': 'وصل تقييمك — اقرأه ثم أكّد الاطلاع',
  'All wrapped up — you acknowledged your review': 'اكتمل كل شيء — أكّدت الاطلاع على تقييمك',
  'Peer feedback closed before anyone was nominated': 'أُغلقت ملاحظات الزملاء قبل ترشيح أي أحد',
  'Your peer themes are unlocked': 'فُتحت محاور ملاحظات زملائك',
  'Self-reflections are open': 'التقييمات الذاتية مفتوحة',
  'Peers are sharing feedback': 'الزملاء يشاركون ملاحظاتهم',
  'Managers are writing reviews': 'المديرون يكتبون التقييمات',
  'Reviews are being shared': 'تتم مشاركة التقييمات',
  'This cycle has wrapped': 'اختُتمت هذه الدورة',
  'Your self-reflection is due': 'تقييمك الذاتي مستحق',
  'Self-reflections open': 'تفتح التقييمات الذاتية',
  'Peer feedback opens': 'تفتح ملاحظات الزملاء',
  'Calibration opens': 'تفتح المعايرة',
  'Results land by': 'تصل النتائج بحلول',
  'Reviews are shared from': 'تُشارك التقييمات اعتباراً من',
  'Placed on the 9-box by': 'وُضع في مصفوفة التسعة بواسطة',
  'Ready to share with': 'جاهز للمشاركة مع',
  'Review 1:1': 'اجتماع فردي للتقييم',
  'is writing the self-reflection': 'يكتب التقييم الذاتي',
  'hasn’t started the self-reflection yet': 'لم يبدأ التقييم الذاتي بعد',
  'needs new peer reviewers — everyone declined': 'يحتاج مراجعين جدداً — اعتذر الجميع',
  'is approving your peer reviewers': 'يعتمد زملاءك المراجعين',
  'nominated peers — approve them to send the invites': 'رشّح زملاء — اعتمدهم لإرسال الدعوات',
  'is approving the peer reviewers': 'يعتمد الزملاء المراجعين',
  'hasn’t picked peer reviewers yet': 'لم يختر زملاء مراجعين بعد',
  'peers have answered': 'من الزملاء أجابوا',
  'is still writing': 'لا يزال يكتب',
  'is writing your manager review': 'يكتب تقييم المدير الخاص بك',
  'is past the manager-review deadline': 'تجاوز موعد تقييم المدير',
  'is ready for your review': 'جاهز لتقييمك',
  'is writing the manager review': 'يكتب تقييم المدير',
  'and the leadership panel are calibrating ratings': 'ولجنة القيادة يعايرون التقييمات',
  'isn’t on the 9-box yet': 'ليس في مصفوفة التسعة بعد',
  'is reading your review': 'يقرأ تقييمك',
  'is reading the review': 'يقرأ التقييم',
  'is getting ready to share your review': 'يستعد لمشاركة تقييمك',
  'can share the review now': 'يمكنه مشاركة التقييم الآن',
  'acknowledged the review': 'أكّد الاطلاع على التقييم',
  'unlocks your themes when the review is shared': 'يفتح محاورك عند مشاركة التقييم',
  'self-reflections are in': 'تقييمات ذاتية مستلمة',
  'peer reviews are in': 'تقييمات زملاء مستلمة',
  'manager reviews are written': 'تقييمات مديرين مكتوبة',
  'reviews are shared': 'تقييمات تمت مشاركتها',
  '360 tracker': 'متتبع التقييم الشامل 360',

  // Academy — course & recertification trackers
  Enrol: 'التسجيل',
  Enrolled: 'مسجّل',
  Assigned: 'مُسند',
  Lessons: 'الدروس',
  Quiz: 'الاختبار',
  Certified: 'حاصل على الشهادة',
  Earned: 'مُكتسبة',
  Valid: 'سارية',
  'Renewal window': 'فترة التجديد',
  Recertify: 'تجديد الشهادة',
  'HR Onboarding': 'تهيئة الموارد البشرية',
  Expired: 'منتهية',
  Best: 'الأفضل',
  Pass: 'النجاح',
  'Course tracker': 'متتبع الدورة',
  'Recertification tracker': 'متتبع تجديد الشهادة',
  'Your route to the credential': 'طريقك إلى الشهادة',
  'Learning in progress': 'التعلم جارٍ',
  'Quiz unlocked': 'تم فتح الاختبار',
  'Quiz in progress': 'الاختبار جارٍ',
  'Not there yet': 'لم تصل بعد',
  'Credential earned': 'تم الحصول على الشهادة',
  'Credential expired': 'انتهت صلاحية الشهادة',
  'All lessons done': 'اكتملت جميع الدروس',
  left: 'متبقية',
  'Due today': 'مستحق اليوم',
  'Due in': 'مستحق خلال',
  'is your instructor — enrol to unlock the first lesson': 'هو مدربك — سجّل لفتح الدرس الأول',
  'Enrol to unlock the first lesson': 'سجّل لفتح الدرس الأول',
  'assigned this': 'أسند هذا',
  'Part of your onboarding plan': 'جزء من خطة تهيئتك',
  'Required compliance training': 'تدريب امتثال إلزامي',
  'Queued up': 'في قائمة الانتظار',
  '— it’s overdue, let’s get rolling': '— إنه متأخر، لنبدأ الآن',
  '— due soon, let’s get rolling': '— موعده قريب، لنبدأ الآن',
  '— dive in whenever you’re ready': '— ابدأ متى كنت مستعداً',
  'lessons to go — next up:': 'دروس متبقية — التالي:',
  'Last lesson — the quiz unlocks after': 'الدرس الأخير — يُفتح الاختبار بعد',
  'Last lesson to go:': 'الدرس الأخير المتبقي:',
  Scored: 'حصلت على',
  '— you need': '— تحتاج إلى',
  'to earn the credential. One more try?': 'للحصول على الشهادة. محاولة أخرى؟',
  'answered — keep going!': 'تمت الإجابة — واصل!',
  'All answered — submit to see your score': 'تمت الإجابة على الكل — أرسل لترى نتيجتك',
  'All lessons done — score': 'اكتملت جميع الدروس — احصل على',
  'to earn your credential': 'لتحصل على شهادتك',
  'Certified! Skills endorsed on your NEXUS profile': 'حصلت على الشهادة! تم توثيق المهارات في ملفك على NEXUS',
  'Certified! Recertify by': 'حصلت على الشهادة! جدّدها قبل',
  'Renewal window is open — recertify by': 'فترة التجديد مفتوحة — جدّد قبل',
  'Credential expired on': 'انتهت صلاحية الشهادة في',
  '— retake the quiz to recertify': '— أعد الاختبار لتجديد الشهادة',
  'Nice work — every lesson is complete': 'عمل رائع — اكتملت جميع الدروس',
  'Onboarding training complete — welcome aboard!': 'اكتمل تدريب التهيئة — أهلاً بك في الفريق!',
  'needs another quiz attempt': 'يحتاج إلى محاولة اختبار أخرى',
  'is next —': 'هو التالي —',
  'gets a ping the moment you pass': 'سيتلقى إشعاراً لحظة نجاحك',
  'is next — every pass ticks off your HR checklist': 'هو التالي — كل نجاح يُنجز بنداً في قائمة الموارد البشرية',
  'Take the quiz': 'ابدأ الاختبار',
  'Retry the quiz': 'أعد الاختبار',
  'Recertify now': 'جدّد الشهادة الآن',

  // Access requests & CRM — access and deal trackers
  'Access tracker': 'متتبع الصلاحيات',
  'Admin review': 'مراجعة المسؤول',
  'Approver review': 'مراجعة المعتمِد',
  Withdrawn: 'تم السحب',
  'Security check': 'الفحص الأمني',
  'Access granted': 'تم منح الصلاحية',
  'App holder': 'حامل التطبيق',
  Unassigned: 'غير مُسند',
  'Your access is on its way': 'صلاحيتك في الطريق إليك',
  '(your manager)': '(مديرك)',
  '(their manager)': '(مديره)',
  '(System Admin)': '(مسؤول النظام)',
  'is reviewing your request': 'يراجع طلبك',
  'is reviewing': 'يراجع',
  'usually replies in': 'يرد عادةً خلال',
  'Waiting on you': 'بانتظارك',
  'other approver notified': 'تم إشعار معتمِد آخر',
  'other approvers notified': 'تم إشعار معتمِدين آخرين',
  'you can approve too': 'ويمكنك الاعتماد أيضاً',
  'approved the request': 'اعتمد الطلب',
  'declined your request': 'رفض طلبك',
  'declined the request': 'رفض الطلب',
  'Account deactivated — this request can’t be reviewed': 'الحساب معطّل — لا يمكن مراجعة هذا الطلب',
  'No approver is available yet': 'لا يوجد معتمِد متاح بعد',
  'Decision due': 'موعد القرار',
  'Running late': 'متأخر',
  Overdue: 'متأخر',
  'Permanent access': 'صلاحية دائمة',
  Expires: 'تنتهي',
  Journey: 'الرحلة',
  'Hide journey': 'إخفاء الرحلة',
  'You’re in': 'تم منحك الصلاحية',
  'Request withdrawn': 'تم سحب الطلب',
  'approved your request — you’re all set': 'اعتمد طلبك — كل شيء جاهز',
  'Unknown user': 'مستخدم غير معروف',
  'Low risk': 'مخاطر منخفضة',
  'Medium risk': 'مخاطر متوسطة',
  'High risk': 'مخاطر مرتفعة',
  'Withdrawn by the requester': 'سحبه مقدم الطلب',
  Permanent: 'دائم',
  'in a moment': 'خلال لحظات',
  'Revenue deck': 'منصة الإيرادات',
  'Deal tracker': 'متتبع الصفقة',
  'Deal journeys': 'رحلات الصفقات',
  'Move stage': 'نقل المرحلة',
  'Move deal stage': 'نقل مرحلة الصفقة',
  Closes: 'موعد الإغلاق',
  'Slipped past': 'تجاوز الموعد',
  AE: 'مدير الحساب',
  Champion: 'الداعم الداخلي',
  'Exec sponsor': 'الراعي التنفيذي',
  'Economic Buyer': 'صاحب قرار الشراء',
  CSM: 'مدير نجاح العملاء',
  'is scoping the architecture': 'يحدد نطاق البنية التقنية',
  'is running the pilot': 'يدير التجربة الأولية',
  'is lining up the security review': 'يجهّز المراجعة الأمنية',
  'is steering it to signature': 'يقودها نحو التوقيع',
  'is working to unblock it': 'يعمل على إزالة العوائق',
  'is waiting on the customer': 'بانتظار العميل',
  'is taking it live': 'يطلقها للتشغيل',
  'closed by': 'أغلقها',
  'ready for': 'جاهزة لـ',
  'ready to sign': 'جاهزة للتوقيع',
  'ROI case not signed off yet': 'دراسة العائد على الاستثمار لم تُعتمد بعد',
  'still no Economic Buyer': 'لا يوجد صاحب قرار شراء بعد',
  'decision criteria still fuzzy': 'معايير القرار لا تزال غير واضحة',
  'approval path not mapped yet': 'مسار الاعتماد لم يُحدد بعد',
  'paperwork still with legal': 'المستندات لا تزال لدى الشؤون القانونية',
  'pain not proven yet': 'المشكلة لم تُثبت بعد',
  'still hunting for a champion': 'لا يزال البحث جارياً عن داعم داخلي',
  'competition still in play': 'المنافسة لا تزال قائمة',
  'The deal team': 'فريق الصفقة',
  'POC / Pilot': 'إثبات المفهوم / التجربة',
  'Security Review': 'المراجعة الأمنية',
  'Closed Won': 'مغلقة بالفوز',
  'Live Orbit': 'المدار المباشر',

  // Knowledge Base — change & freshness trackers
  Proposed: 'مقترح',
  'Curator review': 'مراجعة المشرف',
  'Sent back': 'أُعيد',
  Verified: 'موثّق',
  'Review due': 'المراجعة مستحقة',
  Flagged: 'تم الإبلاغ',
  'Re-verify': 'إعادة التوثيق',
  'Change tracker': 'متتبع التغييرات',
  'Freshness tracker': 'متتبع حداثة المحتوى',
  'Space steward': 'مشرف المساحة',
  'Page owner': 'مالك الصفحة',
  Curator: 'المشرف',
  'A teammate': 'أحد الزملاء',
  'A curator': 'أحد المشرفين',
  'The owner': 'المالك',
  'Awaiting a curator': 'بانتظار مشرف',
  'Live page unchanged': 'الصفحة المنشورة لم تتغير',
  'Goes live on approval': 'يُنشر عند الاعتماد',
  'is giving your edit a second pair of eyes': 'يراجع تعديلك مراجعة ثانية',
  'is giving this edit a second pair of eyes': 'يراجع هذا التعديل مراجعة ثانية',
  'Your turn —': 'دورك —',
  'is waiting on your review': 'بانتظار مراجعتك',
  'approved it — your edit is live': 'اعتمده — تعديلك منشور الآن',
  'approved it — this edit is live': 'اعتمده — هذا التعديل منشور الآن',
  'You approved this edit — it’s live': 'اعتمدت هذا التعديل — إنه منشور',
  'sent your edit back': 'أعاد تعديلك',
  'sent this edit back': 'أعاد هذا التعديل',
  'You sent this edit back': 'أعدت هذا التعديل',
  'Waiting for a curator to pick this up': 'بانتظار مشرف لتولي هذا الطلب',
  'No other curator is free — you can sign this off yourself': 'لا يوجد مشرف آخر متاح — يمكنك اعتماده بنفسك',
  'flagged something outdated — please give it a fresh check': 'أبلغ عن محتوى قديم — يُرجى مراجعته مجدداً',
  'flagged something outdated —': 'أبلغ عن محتوى قديم —',
  'needs to give it a fresh check': 'يحتاج إلى مراجعته مجدداً',
  'Past its review date — please give it a fresh check': 'تجاوز موعد مراجعته — يُرجى مراجعته مجدداً',
  'Past its review date —': 'تجاوز موعد مراجعته —',
  'Your freshness check is due': 'مراجعة حداثة المحتوى مستحقة عليك',
  'is up for a freshness check': 'حان موعد مراجعة حداثته',
  'Fresh and trusted — nothing to do yet': 'حديث وموثوق — لا شيء مطلوب بعد',
  'Fresh and trusted —': 'حديث وموثوق —',
  'has it covered': 'يتولى الأمر',
  today: 'اليوم',
  'Hide details': 'إخفاء التفاصيل',
  'Review changes': 'مراجعة التغييرات',
  'View details': 'عرض التفاصيل',
  'Open in Governance': 'فتح في الحوكمة',
  'View version': 'عرض النسخة',
  'Propose again': 'اقترح مجدداً',

  // IT Helpdesk & HR — fix, request, leave, claim, letter & enrolment trackers
  'Your hardware fix is on its way': 'إصلاح جهازك في الطريق إليك',
  'Your software fix is on its way': 'إصلاح برنامجك في الطريق إليك',
  'Your connection fix is on its way': 'إصلاح اتصالك في الطريق إليك',
  'Your mailbox fix is on its way': 'إصلاح بريدك في الطريق إليك',
  'Security is on the case': 'فريق الأمن يتولى الأمر',
  'Your fix is on its way': 'الإصلاح في الطريق إليك',
  'is working on your hardware': 'يعمل على جهازك',
  'is sorting out your software': 'يعالج مشكلة برنامجك',
  'is chasing your access with the system owner': 'يتابع صلاحيتك مع مالك النظام',
  'is tracing your connection issue': 'يتتبع مشكلة اتصالك',
  'is resyncing your mailbox': 'يعيد مزامنة بريدك',
  'is investigating with Security': 'يحقق مع فريق الأمن',
  'is working on your fix': 'يعمل على الإصلاح',
  'Finding a specialist': 'جارٍ إيجاد مختص',
  'IT queue': 'قائمة انتظار تقنية المعلومات',
  'Your reply needed': 'مطلوب ردك',
  'Fixed by Nova': 'أصلحه نوفا',
  'Instant fix': 'إصلاح فوري',
  'SLA paused': 'اتفاقية الخدمة متوقفة',
  'Nova fixed it for you': 'أصلحه نوفا لك',
  'Fixed — you’re all set': 'تم الإصلاح — كل شيء جاهز',
  'Over to you — one reply keeps it moving': 'الدور عليك — رد واحد يُبقي الأمور تمضي',
  'Paused on the requester': 'متوقف بانتظار مقدم الطلب',
  'Waiting for an owner': 'بانتظار مسؤول',
  'Owned · not started': 'تم الإسناد · لم يبدأ',
  'not started': 'لم يبدأ',
  Owned: 'تم الإسناد',
  'Fix in progress': 'الإصلاح جارٍ',
  'Fix tracker': 'متتبع الإصلاح',
  'IT approval': 'اعتماد تقنية المعلومات',
  'Security review': 'المراجعة الأمنية',
  'Ready to use': 'جاهز للاستخدام',
  'IT is getting it ready for hand-over': 'تقنية المعلومات تجهّزه للتسليم',
  'IT is setting up your licence': 'تقنية المعلومات تُعدّ ترخيصك',
  'IT is switching on your access': 'تقنية المعلومات تفعّل صلاحيتك',
  'IT team': 'فريق تقنية المعلومات',
  'Not needed': 'غير مطلوب',
  'An approver': 'أحد المعتمِدين',
  '— their note is below.': '— ملاحظته أدناه.',
  'Request tracker': 'متتبع الطلب',
  'Approval route': 'مسار الاعتماد',
  'wrapped this up': 'أنهى هذا الطلب',
  'You’re in the IT queue and the first reply is running late — we’ve flagged it to the team.': 'أنت في قائمة انتظار تقنية المعلومات والرد الأول متأخر — نبّهنا الفريق.',
  'grabbed your ticket — first reply due by': 'تولى تذكرتك — الرد الأول مستحق بحلول',
  'is still on it — this is taking longer than the': 'لا يزال يعمل عليه — يستغرق وقتاً أطول من',
  'resolved it': 'حلّها',
  'owns it — first response due by': 'يتولاها — الرد الأول مستحق بحلول',
  'is working it — past the': 'يعمل عليها — تجاوزت',
  'is working it — fix due by': 'يعمل عليها — الإصلاح مستحق بحلول',
  'has had it for': 'لديه منذ',
  'is reviewing your request — managers usually reply within': 'يراجع طلبك — يرد المديرون عادةً خلال',
  'handed it over': 'سلّمه',
  'switched it on': 'فعّله',
  'First reply': 'الرد الأول',
  'Resolved in': 'تم الحل خلال',
  'usually decides within 2 days': 'يقرر عادةً خلال يومين',
  'waiting on you': 'بانتظارك',
  '— it’s taking longer than usual': '— يستغرق وقتاً أطول من المعتاد',
  'Sara or Fatima in People Ops': 'سارة أو فاطمة في عمليات الأفراد',
  'Sara in People Ops': 'سارة في عمليات الأفراد',
  'in People Ops': 'في عمليات الأفراد',
  'is waiting on you': 'بانتظارك',
  'People Ops review': 'مراجعة عمليات الأفراد',
  'Within policy': 'ضمن السياسة',
  'Approved & synced': 'معتمد ومتزامن',
  'Team calendar': 'تقويم الفريق',
  'Approved instantly': 'اعتُمد فوراً',
  '— synced to the team calendar': '— تمت المزامنة مع تقويم الفريق',
  'Approved by': 'اعتمده',
  'Declined by': 'رفضه',
  '— pick new dates whenever you’re ready': '— اختر تواريخ جديدة متى كنت مستعداً',
  'is waiting on': 'بانتظار',
  '— you can step in as People Ops': '— يمكنك التدخل بصفتك من عمليات الأفراد',
  'is away until': 'غائب حتى',
  '— People Ops can step in if it can’t wait': '— يمكن لعمليات الأفراد التدخل إن لم يحتمل الانتظار',
  'hasn’t decided yet': 'لم يقرر بعد',
  '— People Ops can now step in too': '— يمكن لعمليات الأفراد التدخل الآن أيضاً',
  '— usually decides within 2 days': '— يقرر عادةً خلال يومين',
  'will review your request': 'سيراجع طلبك',
  '— usually within 2 days': '— عادةً خلال يومين',
  'Receipt check': 'فحص الإيصال',
  'Next payroll': 'مسير الرواتب القادم',
  'With your salary': 'مع راتبك',
  'Paid with your salary 💸': 'صُرف مع راتبك 💸',
  '— see the note for what would work': '— راجع الملاحظة لمعرفة ما يناسب',
  '— it lands with your next salary 💸': '— يصل مع راتبك القادم 💸',
  'will check your receipt': 'سيتحقق من إيصالك',
  '— usually within 3 days': '— عادةً خلال 3 أيام',
  'Generated instantly': 'أُنشئ فوراً',
  'Ready to download': 'جاهز للتنزيل',
  '— ready to download': '— جاهز للتنزيل',
  'Signed by': 'وقّعه',
  'will prepare and sign it': 'سيُعدّه ويوقّعه',
  '— usually within 1 working day': '— عادةً خلال يوم عمل واحد',
  'People Ops confirms': 'تأكيد عمليات الأفراد',
  'Usually within a day': 'عادةً خلال يوم',
  'Card goes live': 'تفعيل البطاقة',
  'Same member number': 'رقم العضوية نفسه',
  'Member number issued': 'صدر رقم العضوية',
  'Confirmed by': 'أكّده',
  '— your digital card is live 🎉': '— بطاقتك الرقمية مفعّلة 🎉',
  'will confirm your choices with the insurer': 'سيؤكد اختياراتك مع شركة التأمين',
  '— usually within a day': '— عادةً خلال يوم',
  'Leave tracker': 'متتبع الإجازة',
  'Claim tracker': 'متتبع المطالبة',
  'Letter tracker': 'متتبع الخطاب',
  'Enrolment tracker': 'متتبع التسجيل في المزايا',
};

const AR_MONTHS: Record<string, string> = {
  January: 'يناير',
  February: 'فبراير',
  March: 'مارس',
  April: 'أبريل',
  May: 'مايو',
  June: 'يونيو',
  July: 'يوليو',
  August: 'أغسطس',
  September: 'سبتمبر',
  October: 'أكتوبر',
  November: 'نوفمبر',
  December: 'ديسمبر',
  Jan: 'يناير',
  Feb: 'فبراير',
  Mar: 'مارس',
  Apr: 'أبريل',
  Jun: 'يونيو',
  Jul: 'يوليو',
  Aug: 'أغسطس',
  Sep: 'سبتمبر',
  Oct: 'أكتوبر',
  Nov: 'نوفمبر',
  Dec: 'ديسمبر',
};

const AR_WEEKDAYS: Record<string, string> = {
  Monday: 'الإثنين',
  Tuesday: 'الثلاثاء',
  Wednesday: 'الأربعاء',
  Thursday: 'الخميس',
  Friday: 'الجمعة',
  Saturday: 'السبت',
  Sunday: 'الأحد',
  Mon: 'الإثنين',
  Tue: 'الثلاثاء',
  Wed: 'الأربعاء',
  Thu: 'الخميس',
  Fri: 'الجمعة',
  Sat: 'السبت',
  Sun: 'الأحد',
};

function translateToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return raw;

  if (AR_EXACT[trimmed]) return raw.replace(trimmed, AR_EXACT[trimmed]);
  if (AR_PERSON_NAMES[trimmed]) return raw.replace(trimmed, AR_PERSON_NAMES[trimmed]);

  // Case-insensitive lookup for UPPERCASE HUD labels
  const upperHit = Object.entries(AR_EXACT).find(([k]) => k.toLowerCase() === trimmed.toLowerCase());
  if (upperHit) return raw.replace(trimmed, upperHit[1]);

  // Greetings: "Good afternoon, Layla" / "Good morning, Daniel"
  const greetMatch = /^(Good morning|Good afternoon|Good evening|Good night|Still up|Burning the midnight oil)(?:,\s*(.+))?$/i.exec(trimmed);
  if (greetMatch) {
    const g = greetMatch[1].toLowerCase();
    const greetAr =
      g === 'good morning'
        ? 'صباح الخير'
        : g === 'good afternoon'
          ? 'مساء الخير'
          : g === 'good evening'
            ? 'مساء النور'
            : 'أهلاً بك';
    const who = greetMatch[2]?.trim();
    if (!who) return greetAr;
    const whoAr = AR_PERSON_NAMES[who] ?? who;
    return `${greetAr}، ${whoAr}`;
  }

  // Return path labels: "Back to Launchpad", "Back to Payroll Console, Runs"
  const backTo = /^Back to (.+)$/i.exec(trimmed);
  if (backTo) {
    const dest = backTo[1]
      .split(/,\s*/)
      .map((p) => AR_EXACT[p] ?? AR_PERSON_NAMES[p] ?? p)
      .join('، ');
    return `العودة إلى ${dest}`;
  }

  // Relative time: "2h ago", "15m ago", "3d ago", "in 5d", "just now"
  if (trimmed === 'just now') return 'الآن';
  const agoMatch = /^(\d+)\s*(m|h|d)\s+ago$/i.exec(trimmed);
  if (agoMatch) {
    const n = agoMatch[1];
    const unit = agoMatch[2].toLowerCase() === 'm' ? 'دقيقة' : agoMatch[2].toLowerCase() === 'h' ? 'ساعة' : 'يوم';
    return `منذ ${n} ${unit}`;
  }
  const inMatch = /^in\s+(\d+)\s*(m|h|d|min)$/i.exec(trimmed);
  if (inMatch) {
    const n = inMatch[1];
    const unit = inMatch[2].toLowerCase().startsWith('m') ? 'دقيقة' : inMatch[2].toLowerCase() === 'h' ? 'ساعة' : 'أيام';
    return `خلال ${n} ${unit}`;
  }

  // Days countdown: "15 days", "1 day"
  const daysMatch = /^(\d+)\s+days?$/i.exec(trimmed);
  if (daysMatch) {
    return `${daysMatch[1]} يوماً`;
  }

  // Step 01 · now / Step 02
  const stepMatch = /^Step\s+0?(\d+)(?:\s*·\s*(now|done))?$/i.exec(trimmed);
  if (stepMatch) {
    const suffix = stepMatch[2]?.toLowerCase() === 'now' ? ' · الآن' : stepMatch[2]?.toLowerCase() === 'done' ? ' · مكتمل' : '';
    return `الخطوة 0${stepMatch[1]}${suffix}`;
  }

  // Stage X of Y
  const stageMatch = /^Stage\s+(\d+)\s+of\s+(\d+)$/i.exec(trimmed);
  if (stageMatch) {
    return `المرحلة ${stageMatch[1]} من ${stageMatch[2]}`;
  }

  // Month + Year: "November 2026" / "Nov 2026"
  const monthYear = /^(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})(?:\s+pay\s+run)?$/i.exec(trimmed);
  if (monthYear) {
    const mKey = Object.keys(AR_MONTHS).find((k) => k.toLowerCase() === monthYear[1].toLowerCase());
    const mAr = mKey ? AR_MONTHS[mKey] : monthYear[1];
    const hasPayRun = /pay\s+run$/i.test(trimmed);
    return hasPayRun ? `مسير رواتب ${mAr} ${monthYear[2]}` : `${mAr} ${monthYear[2]}`;
  }

  // "N salaried employees", "N colleagues", "N active devices"
  const countNoun = /^(\d+)\s+(salaried employees|employees|colleagues|online now|deactivated|seats to fill|in pipeline|open|unread|tickets|devices|awards?|nominations awaiting review|items to review|ready for you|due today|approval waiting|meetings?|left)$/i.exec(trimmed);
  if (countNoun) {
    const n = countNoun[1];
    const kind = countNoun[2].toLowerCase();
    const map: Record<string, string> = {
      'salaried employees': 'موظفاً براتب شهري',
      employees: 'موظفاً',
      colleagues: 'زميلاً',
      'online now': 'متصلون الآن',
      deactivated: 'معطّل',
      'seats to fill': 'مقاعد شاغرة',
      'in pipeline': 'في المسار',
      open: 'مفتوحة',
      unread: 'غير مقروءة',
      tickets: 'تذاكر',
      devices: 'أجهزة',
      award: 'مكافأة',
      awards: 'مكافآت',
      'nominations awaiting review': 'ترشيحات بانتظار المراجعة',
      'items to review': 'عناصر للمراجعة',
      'ready for you': 'تطبيقاً جاهزاً لك',
      'due today': 'مستحقة اليوم',
      'approval waiting': 'موافقة بانتظارك',
      meeting: 'اجتماع',
      meetings: 'اجتماعات',
      left: 'متبقية',
    };
    return `${n} ${map[kind] ?? countNoun[2]}`;
  }

  return raw;
}

/**
 * Translates an English UI string into Arabic while preserving separators (`·`, `—`, `/`)
 * and optionally converting Western digits to Eastern Arabic-Indic digits (`٠١٢٣٤٥٦٧٨٩`).
 */
export function translateToArabic(input: string, numerals: NumeralSystem = 'latn'): string {
  if (!input || !input.trim()) return input;

  const trimmed = input.trim();
  let result: string | null = null;

  if (AR_EXACT[trimmed]) {
    result = input.replace(trimmed, AR_EXACT[trimmed]);
  } else if (AR_PERSON_NAMES[trimmed]) {
    result = input.replace(trimmed, AR_PERSON_NAMES[trimmed]);
  } else if (trimmed.includes(' · ')) {
    const parts = trimmed.split(/\s*·\s*/);
    const translatedParts = parts.map((p) => translateToken(p));
    if (translatedParts.some((p, i) => p !== parts[i])) {
      result = translatedParts.join(' · ');
    }
  } else {
    const single = translateToken(trimmed);
    if (single !== trimmed) {
      result = input.replace(trimmed, single);
    } else {
      // Replace known person names, weekdays, or months inside compound strings
      let working = input;
      for (const [enName, arName] of Object.entries(AR_PERSON_NAMES)) {
        if (enName.includes(' ') && working.includes(enName)) {
          working = working.replaceAll(enName, arName);
        }
      }
      for (const [enDay, arDay] of Object.entries(AR_WEEKDAYS)) {
        const re = new RegExp(`\\b${enDay}\\b`, 'g');
        if (re.test(working)) working = working.replace(re, arDay);
      }
      for (const [enMon, arMon] of Object.entries(AR_MONTHS)) {
        const re = new RegExp(`\\b${enMon}\\b`, 'g');
        if (re.test(working)) working = working.replace(re, arMon);
      }
      result = working;
    }
  }

  const finalStr = result ?? input;
  return numerals === 'arab' ? toArabicDigits(finalStr) : finalStr;
}
