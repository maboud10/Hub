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
  Mine: 'تطبيقاتي',
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
  Pipeline: 'مسار المرشحين',
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
  Requests: 'طلبات الصلاحيات',
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
