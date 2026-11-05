/**
 * Talent Hub demo data — a realistic, internally consistent hiring quarter.
 *
 * Everything is generated relative to "now" so interviews are always this
 * week, offers are fresh and onboarding countdowns tick. Candidates are
 * fictional (emails use the reserved example.com domain).
 */
import type {
  Application,
  Candidate,
  CandidateSource,
  Interview,
  InterviewKind,
  InterviewStep,
  Offer,
  OnboardingJourney,
  Outreach,
  OutreachChannel,
  OutreachStatus,
  OutreachTone,
  Rating,
  Recommendation,
  RejectionReason,
  Requisition,
  Scorecard,
  StageEvent,
  StageId,
  TalentActivity,
  TalentData,
} from './types';
import { INTERVIEW_KIND_META, STAGE_BY_ID, STAGE_ORDER, TALENT_DATA_VERSION, stageIndex } from './constants';
import { analyzeJobDescription } from './ai/jd';
import { scoreMatch } from './ai/match';
import { draftOutreach, roleFromProfile } from './ai/outreach';
import { buildJourneyTasks, toISODate } from './onboarding';

const DAY = 86_400_000;
const HOUR = 3_600_000;

// ───────────────────────── sample job descriptions ─────────────────────────
export interface SampleJD {
  id: string;
  label: string;
  fileName: string;
  text: string;
}

export const SAMPLE_JDS: SampleJD[] = [
  {
    id: 'jd-frontend',
    label: 'Senior Frontend Engineer',
    fileName: 'Senior_Frontend_Engineer_JD.pdf',
    text: `Senior Frontend Engineer — Platform Experience
Location: Dubai, UAE (Hybrid, 3 days in office)

About the role
NEXUS is the employee platform 3,000+ Helix colleagues open every morning. As a Senior Frontend Engineer you will shape the web experience end to end, from our design system to the performance budget, working closely with design and product.

What you'll do
- Build and evolve our React + TypeScript design system used by 12 product teams
- Own performance and keep Core Web Vitals green across every surface
- Champion accessibility (WCAG 2.2 AA) and inclusive, RTL-ready interfaces
- Partner with designers and product managers from discovery to launch
- Mentor engineers through code reviews and pairing

What you'll bring
- 5+ years building production web apps with React and TypeScript
- Deep experience with design systems and component libraries
- Strong grasp of web performance and accessibility
- Experience with automated testing (Vitest, Playwright)

Nice to have
- GraphQL and Next.js experience
- Familiarity with micro-frontends or a monorepo setup
- Arabic is a plus

What we offer
- AED 32,000 – 42,000 per month, plus annual bonus
- Visa, family health insurance and annual flights
- Learning budget and a monthly deep-work week`,
  },
  {
    id: 'jd-data',
    label: 'Staff Data Engineer',
    fileName: 'Staff_Data_Engineer.docx',
    text: `Staff Data Engineer
Remote (EMEA) · Full-time

The role
Our data platform powers people analytics, finance forecasting and the AI features inside NEXUS. As a Staff Data Engineer you'll set the technical direction for how data is modelled, moved and trusted across Helix.

Responsibilities
- Design and scale batch and streaming pipelines on GCP (BigQuery, Dataflow, Pub/Sub)
- Lead our dbt modelling standards and data quality framework
- Orchestrate workflows with Airflow and build self-serve data products
- Partner with ML engineers on feature pipelines for LLM-powered features
- Mentor a team of six data engineers and drive architecture reviews

Requirements
- 8+ years in data engineering, with deep SQL and Python
- Production experience with Apache Spark and BigQuery or Snowflake
- Strong data modeling skills (dimensional modeling, data vault)
- Experience running Airflow and dbt at scale

Nice to have
- Kafka or Flink stream processing
- Terraform and Kubernetes
- Data governance experience in regulated industries

Benefits
- Fully remote within EMEA, home-office budget, annual team offsite`,
  },
  {
    id: 'jd-design',
    label: 'Product Designer, Growth',
    fileName: 'Product_Designer_Growth.pdf',
    text: `Product Designer, Growth
London, UK · Hybrid

About the role
Join our growth squad to design the moments that turn first-time visitors into loyal teams. You'll run experiments, prototype fast and obsess over every step of the funnel.

What you'll do
- Own end-to-end design for onboarding, activation and upgrade flows
- Run A/B testing with product and data partners and learn from every result
- Prototype rapidly in Figma and ProtoPie to test ideas with real users
- Contribute to our design system and keep the craft bar high
- Lead user research sessions and turn insights into design direction

What you'll bring
- 4+ years of product design experience in a digital product company
- A portfolio showing strong interaction design and visual design craft
- Experience with experimentation and product analytics
- Fluency in Figma, prototyping and usability testing

Nice to have
- Motion design skills (Lottie, After Effects)
- Experience designing for RTL languages
- B2B SaaS background

Benefits
- £70,000 – £88,000 a year
- Hybrid working, private healthcare and a learning budget`,
  },
  {
    id: 'jd-pm',
    label: 'Product Manager, Payments',
    fileName: 'PM_Payments.txt',
    text: `Product Manager, Payments
Dubai, UAE · Hybrid

About the role
Payments touch every Helix customer. You'll own the payment experience across cards, wallets and bank transfers in the GCC, from discovery to launch and iteration.

Key responsibilities
- Own the payments roadmap and prioritisation for checkout, payouts and reconciliation
- Run product discovery with merchants and turn insights into clear requirements
- Define success metrics and run experimentation to lift conversion
- Partner with engineering, risk, finance and compliance stakeholders
- Launch new payment methods across the UAE and KSA

Requirements
- 5+ years of product management, including 2+ in payments or fintech
- Strong product analytics skills; comfortable writing SQL
- Track record of stakeholder management across engineering and commercial teams
- Experience with agile delivery

Nice to have
- Card issuing or acquiring experience
- Arabic
- Open banking knowledge

What we offer
- AED 38,000 – 48,000 per month, equity and annual bonus`,
  },
  {
    id: 'jd-security',
    label: 'Cloud Security Engineer',
    fileName: 'Cloud_Security_Engineer.pdf',
    text: `Cloud Security Engineer
Dubai, UAE · On-site

About the role
You'll be the engineer who makes our cloud estate secure by default. Working with platform and IT teams, you'll embed guardrails, detection and response across GCP and AWS.

What you'll do
- Build preventive guardrails for Kubernetes, IAM and network security
- Run threat modeling with product teams and review designs for risk
- Own incident response playbooks and lead investigations
- Automate cloud security posture management with Terraform and Python
- Drive our zero trust roadmap and ISO 27001 controls

What you'll need
- 6+ years in security engineering with strong cloud security experience (GCP or AWS)
- Hands-on Kubernetes security and identity and access management expertise
- Experience with SIEM tooling and incident response
- Scripting in Python or Go (Golang)

Nice to have
- Security certifications (CKS, CCSP, OSCP)
- NESA / UAE IA compliance experience
- Penetration testing background

Benefits
- Competitive package, visa, family medical cover and certification budget`,
  },
  {
    id: 'jd-sales',
    label: 'Enterprise Account Executive (needs a rewrite)',
    fileName: 'AE_KSA_draft.docx',
    text: `Enterprise Account Executive — KSA
Riyadh, Saudi Arabia · Hybrid

We're looking for a rockstar closer to join our young, energetic sales team! You will be aggressive in chasing new logos and dominate the enterprise market in Saudi Arabia.

Responsibilities
- Build and manage a pipeline of enterprise customers across KSA
- Run complex sales cycles using MEDDIC and close six-figure deals
- Negotiate commercial terms with procurement and legal teams
- Keep Salesforce up to date and own sales forecasting

Requirements
- 7+ years of B2B SaaS sales experience, with enterprise sales in KSA
- Proven quota attainment
- Native Arabic speaker`,
  },
  {
    id: 'jd-people',
    label: 'People Partner',
    fileName: 'People_Partner.pdf',
    text: `People Partner
Dubai, UAE · Hybrid

About the role
Partner with engineering and product leaders to build a high-performing, inclusive organisation. You'll be a trusted advisor on organisational design, performance and employee relations.

What you'll do
- Act as HR business partner to 400+ employees across Engineering and Product
- Lead performance management and calibration cycles
- Handle employee relations cases with empathy and sound judgement
- Advise on UAE labour law, Emiratisation and policy
- Use HRIS data to spot trends and shape people programmes

What you'll bring
- 6+ years in HR business partnering, ideally in tech
- Solid knowledge of UAE labour law and WPS
- Experience with Workday or another HRIS
- Excellent stakeholder management and coaching skills

Nice to have
- Compensation & benefits exposure
- Change management certification

Benefits
- AED 30,000 – 38,000 per month, visa, family medical cover`,
  },
  {
    id: 'jd-data-platform',
    label: 'Data Engineer, Platform',
    fileName: 'Data_Engineer_Platform.txt',
    text: `Data Engineer, Platform
Dubai, UAE · Hybrid

What you'll do
- Build reliable data pipelines in Python and SQL on GCP
- Model data in BigQuery with dbt
- Orchestrate jobs with Airflow

Requirements
- 3+ years of data engineering experience
- Strong SQL and Python
- Experience with BigQuery and dbt`,
  },
];

const jdText = (id: string) => SAMPLE_JDS.find((j) => j.id === id)!.text;

// ───────────────────────── builders ─────────────────────────
function plan(reqId: string, steps: [InterviewKind, string[], string?][]): InterviewStep[] {
  return steps.map(([kind, interviewerIds, label], i) => ({
    id: `${reqId}-s${i + 1}`,
    kind,
    label: label ?? INTERVIEW_KIND_META[kind].label,
    durationMins: INTERVIEW_KIND_META[kind].defaultMins,
    interviewerIds,
    focus: INTERVIEW_KIND_META[kind].focus,
  }));
}

interface CandSpec {
  id: string;
  name: string;
  title: string;
  company: string;
  location: string;
  years: number;
  skills: string[];
  source: CandidateSource;
  hue: number;
  referrerId?: string;
  prevCompany?: string;
  school?: [string, string];
  openToWork?: boolean;
  salary?: [number, string, 'year' | 'month'];
  notice?: number;
  tags?: string[];
  activity?: string;
  consent?: boolean;
  workPref?: Candidate['workModelPreference'];
}

const SCHOOL_BY_FAMILY: [RegExp, [string, string]][] = [
  [/design/i, ['Dubai Institute of Design & Innovation', 'BDes Product Design']],
  [/product manager|product owner/i, ['INSEAD', 'MBA']],
  [/account|sales/i, ['King Saud University', 'BSc Business Administration']],
  [/security|soc/i, ['Khalifa University', 'BSc Computer Engineering']],
  [/data/i, ['University of Manchester', 'MSc Data Science']],
];

function candidate(s: CandSpec, now: number, createdDaysAgo: number): Candidate {
  const slug = s.name.toLowerCase().replace(/[^a-z]+/g, '.');
  const year = new Date(now).getFullYear();
  const currentStart = year - Math.max(1, Math.round(s.years * 0.4));
  const school = s.school ?? SCHOOL_BY_FAMILY.find(([re]) => re.test(s.title))?.[1] ?? ['American University of Sharjah', 'BSc Computer Science'];
  const consentGiven = s.consent ?? false;
  return {
    id: s.id,
    name: s.name,
    headline: `${s.title} at ${s.company} · ${s.skills.slice(0, 3).join(', ')}`,
    currentTitle: s.title,
    currentCompany: s.company,
    location: s.location,
    email: `${slug}@example.com`,
    phone: `+971 5${(s.hue % 9) + 1} ${String(100 + (s.hue * 7) % 900)} ${String(1000 + (s.hue * 37) % 9000)}`,
    avatarHue: s.hue,
    yearsExperience: s.years,
    skills: s.skills,
    experience: [
      { title: s.title, company: s.company, start: `${currentStart}-0${(s.hue % 8) + 1}`, end: null, summary: `Owns ${s.skills.slice(0, 2).join(' and ')} work across the product.` },
      {
        title: s.title.replace(/^(Senior|Staff|Lead|Principal)\s+/i, ''),
        company: s.prevCompany ?? 'Northwind Systems',
        start: `${year - s.years}-0${(s.hue % 9) + 1}`,
        end: `${currentStart}-0${(s.hue % 8) + 1}`,
      },
    ],
    education: [{ school: school[0], degree: school[1], year: year - s.years - 1 }],
    source: s.source,
    sourceDetail:
      s.source === 'linkedin'
        ? 'LinkedIn · sourced'
        : s.source === 'referral'
          ? 'Employee referral'
          : s.source === 'silver-medalist'
            ? 'Silver medalist · past process'
            : s.source === 'event'
              ? 'Met at STEP Conference Dubai'
              : 'Applied via careers site',
    referrerId: s.referrerId,
    tags: s.tags ?? [],
    openToWork: s.openToWork,
    noticePeriodDays: s.notice ?? 30,
    salaryExpectation: s.salary ? { amount: s.salary[0], currency: s.salary[1], period: s.salary[2] } : undefined,
    workModelPreference: s.workPref,
    consent: consentGiven
      ? { given: true, at: now - (createdDaysAgo - 1) * DAY, retentionUntil: now + 540 * DAY, method: s.source === 'inbound' ? 'application' : 'email' }
      : { given: false },
    status: 'active',
    sample: true,
    recentActivity: s.activity,
    createdAt: now - createdDaysAgo * DAY,
    createdBy: 'u-fatima',
    updatedAt: now - Math.min(createdDaysAgo, 2) * DAY,
  };
}

interface AppSpec {
  id: string;
  c: string;
  r: string;
  stage: StageId;
  /** Days spent in the current stage. */
  days: number;
  status?: Application['status'];
  decision?: 'hire' | 'no-hire';
  decisionBy?: string;
  rejection?: RejectionReason;
  owner?: string;
}

// ───────────────────────── seed ─────────────────────────
export function createTalentSeed(now = Date.now()): TalentData {
  const today = new Date(now);
  const dayAt = (offset: number, h: number, m = 0) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset, h, m).getTime();
  /** ~`h` hours from now (half-hour aligned), kept within weekday business hours (09:00–17:30). */
  const inHours = (h: number) => {
    const t = Math.ceil((now + h * HOUR) / (30 * 60_000)) * 30 * 60_000;
    const d = new Date(t);
    const hour = d.getHours() + d.getMinutes() / 60;
    const weekday = d.getDay() !== 0 && d.getDay() !== 6;
    if (weekday && hour >= 9 && hour <= 17.5) return t;
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (hour > 17.5 ? 1 : 0), 9 + Math.min(5, Math.round(h)), 0);
    while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
    return next.getTime();
  };
  const iso = (offsetDays: number) => toISODate(now + offsetDays * DAY);

  // ── requisitions
  const mkReq = (r: Omit<Requisition, 'jd' | 'seniority' | 'employmentType'> & { jdId: string; fileName: string; seniority?: Requisition['seniority'] }): Requisition => {
    const text = jdText(r.jdId);
    const profile = analyzeJobDescription(text, { fileName: r.fileName, now: r.createdAt });
    const { jdId, fileName, seniority, ...rest } = r;
    void jdId;
    return { ...rest, seniority: seniority ?? profile.seniority, employmentType: profile.employmentType, jd: { text, fileName, profile } };
  };

  const requisitions: Requisition[] = [
    mkReq({
      id: 'req-fe',
      jdId: 'jd-frontend',
      fileName: 'Senior_Frontend_Engineer_JD.pdf',
      title: 'Senior Frontend Engineer',
      department: 'Engineering',
      location: 'Dubai',
      workModel: 'hybrid',
      band: 'E5',
      salary: { min: 384_000, max: 504_000, currency: 'AED' },
      headcount: 2,
      hires: 1,
      status: 'open',
      priority: 'high',
      hiringManagerId: 'u-omar',
      recruiterId: 'u-fatima',
      interviewPlan: plan('req-fe', [
        ['screen', ['u-fatima']],
        ['technical', ['u-priya'], 'React & TypeScript deep-dive'],
        ['system-design', ['u-lucas', 'u-omar'], 'Frontend architecture'],
        ['culture', ['u-mei'], 'Design partnership & values'],
        ['final', ['u-omar']],
      ]),
      createdBy: 'u-omar',
      createdAt: now - 46 * DAY,
      openedAt: now - 44 * DAY,
      approvedBy: 'u-sara',
      targetStartDate: iso(40),
    }),
    mkReq({
      id: 'req-data',
      jdId: 'jd-data',
      fileName: 'Staff_Data_Engineer.docx',
      title: 'Staff Data Engineer',
      department: 'Engineering',
      location: 'Remote (EMEA)',
      workModel: 'remote',
      band: 'E6',
      salary: { min: 480_000, max: 600_000, currency: 'AED' },
      headcount: 1,
      hires: 0,
      status: 'open',
      priority: 'normal',
      hiringManagerId: 'u-omar',
      recruiterId: 'u-fatima',
      interviewPlan: plan('req-data', [
        ['screen', ['u-fatima']],
        ['technical', ['u-priya'], 'Data modelling & SQL'],
        ['system-design', ['u-lucas'], 'Pipeline architecture'],
        ['final', ['u-omar']],
      ]),
      createdBy: 'u-omar',
      createdAt: now - 21 * DAY,
      openedAt: now - 19 * DAY,
      approvedBy: 'u-fatima',
      targetStartDate: iso(60),
    }),
    mkReq({
      id: 'req-design',
      jdId: 'jd-design',
      fileName: 'Product_Designer_Growth.pdf',
      title: 'Product Designer, Growth',
      department: 'Design',
      location: 'London',
      workModel: 'hybrid',
      band: 'E5',
      salary: { min: 70_000, max: 88_000, currency: 'GBP' },
      headcount: 1,
      hires: 0,
      status: 'open',
      priority: 'normal',
      hiringManagerId: 'u-aisha',
      recruiterId: 'u-sara',
      interviewPlan: plan('req-design', [
        ['screen', ['u-sara']],
        ['portfolio', ['u-mei', 'u-hana']],
        ['case', ['u-aisha'], 'Growth design challenge'],
        ['culture', ['u-sofia']],
      ]),
      createdBy: 'u-aisha',
      createdAt: now - 35 * DAY,
      openedAt: now - 33 * DAY,
      approvedBy: 'u-sara',
      targetStartDate: iso(30),
    }),
    mkReq({
      id: 'req-pm',
      jdId: 'jd-pm',
      fileName: 'PM_Payments.txt',
      title: 'Product Manager, Payments',
      department: 'Product',
      location: 'Dubai',
      workModel: 'hybrid',
      band: 'E5',
      salary: { min: 456_000, max: 576_000, currency: 'AED' },
      headcount: 1,
      hires: 0,
      status: 'open',
      priority: 'high',
      hiringManagerId: 'u-aisha',
      recruiterId: 'u-fatima',
      interviewPlan: plan('req-pm', [
        ['screen', ['u-fatima']],
        ['case', ['u-aisha'], 'Payments product case'],
        ['panel', ['u-omar', 'u-yusuf'], 'Engineering & customer partnership'],
        ['final', ['u-aisha']],
      ]),
      createdBy: 'u-aisha',
      createdAt: now - 16 * DAY,
      openedAt: now - 14 * DAY,
      approvedBy: 'u-sara',
      targetStartDate: iso(55),
    }),
    mkReq({
      id: 'req-sec',
      jdId: 'jd-security',
      fileName: 'Cloud_Security_Engineer.pdf',
      title: 'Cloud Security Engineer',
      department: 'IT & Security',
      location: 'Dubai',
      workModel: 'onsite',
      band: 'E5',
      salary: { min: 420_000, max: 540_000, currency: 'AED' },
      headcount: 1,
      hires: 0,
      status: 'open',
      priority: 'critical',
      hiringManagerId: 'u-layla',
      recruiterId: 'u-fatima',
      interviewPlan: plan('req-sec', [
        ['screen', ['u-fatima']],
        ['technical', ['u-ethan'], 'Cloud security deep-dive'],
        ['system-design', ['u-lucas'], 'Secure architecture review'],
        ['final', ['u-layla']],
      ]),
      createdBy: 'u-layla',
      createdAt: now - 12 * DAY,
      openedAt: now - 12 * DAY,
      approvedBy: 'u-sara',
      targetStartDate: iso(45),
    }),
    mkReq({
      id: 'req-ae',
      jdId: 'jd-sales',
      fileName: 'AE_KSA_draft.docx',
      title: 'Enterprise Account Executive, KSA',
      department: 'Sales',
      location: 'Riyadh',
      workModel: 'hybrid',
      band: 'E5',
      salary: { min: 360_000, max: 480_000, currency: 'SAR' },
      headcount: 1,
      hires: 0,
      status: 'on-hold',
      priority: 'normal',
      hiringManagerId: 'u-aisha',
      recruiterId: 'u-sara',
      interviewPlan: plan('req-ae', [
        ['screen', ['u-sara']],
        ['case', ['u-noah'], 'Mock discovery call'],
        ['final', ['u-aisha']],
      ]),
      createdBy: 'u-aisha',
      createdAt: now - 30 * DAY,
      openedAt: now - 28 * DAY,
      approvedBy: 'u-sara',
    }),
    mkReq({
      id: 'req-pp',
      jdId: 'jd-people',
      fileName: 'People_Partner.pdf',
      title: 'People Partner',
      department: 'People Ops',
      location: 'Dubai',
      workModel: 'hybrid',
      band: 'E4',
      salary: { min: 360_000, max: 456_000, currency: 'AED' },
      headcount: 1,
      hires: 0,
      status: 'pending-approval',
      priority: 'normal',
      hiringManagerId: 'u-sara',
      recruiterId: 'u-fatima',
      interviewPlan: plan('req-pp', [
        ['screen', ['u-fatima']],
        ['case', ['u-sara'], 'Employee-relations scenario'],
        ['culture', ['u-mateo']],
      ]),
      createdBy: 'u-sara',
      createdAt: now - 1 * DAY,
      targetStartDate: iso(70),
    }),
    mkReq({
      id: 'req-de',
      jdId: 'jd-data-platform',
      fileName: 'Data_Engineer_Platform.txt',
      title: 'Data Engineer, Platform',
      department: 'Engineering',
      location: 'Dubai',
      workModel: 'hybrid',
      band: 'E4',
      salary: { min: 300_000, max: 372_000, currency: 'AED' },
      headcount: 1,
      hires: 1,
      status: 'filled',
      priority: 'normal',
      hiringManagerId: 'u-omar',
      recruiterId: 'u-fatima',
      interviewPlan: plan('req-de', [
        ['screen', ['u-fatima']],
        ['technical', ['u-priya']],
        ['final', ['u-omar']],
      ]),
      createdBy: 'u-omar',
      createdAt: now - 80 * DAY,
      openedAt: now - 78 * DAY,
      approvedBy: 'u-sara',
      closedAt: now - 40 * DAY,
    }),
  ];
  const reqById = new Map(requisitions.map((r) => [r.id, r]));

  // ── candidates
  const specs: [CandSpec, number][] = [
    // Senior Frontend Engineer
    [{ id: 'c-01', name: 'Rania Haddad', title: 'Senior Frontend Engineer', company: 'Sandstone Pay', location: 'Dubai, UAE', years: 7, skills: ['React', 'TypeScript', 'Design Systems', 'Accessibility', 'Web Performance', 'GraphQL', 'Next.js', 'Automated Testing', 'Arabic'], source: 'linkedin', hue: 340, salary: [450_000, 'AED', 'year'], consent: true, activity: 'Posted about migrating a design system to React Server Components · 3d ago' }, 30],
    [{ id: 'c-02', name: 'Arjun Iyer', title: 'Frontend Lead', company: 'Kite Payments', location: 'Dubai, UAE', years: 9, skills: ['React', 'TypeScript', 'Design Systems', 'Web Performance', 'Next.js', 'State Management', 'Mentoring', 'Automated Testing'], source: 'referral', referrerId: 'u-priya', hue: 28, salary: [500_000, 'AED', 'year'], consent: true }, 18],
    [{ id: 'c-03', name: 'Chloé Laurent', title: 'Senior UI Engineer', company: 'Mirage Studios', location: 'Lisbon, Portugal', years: 6, skills: ['React', 'TypeScript', 'Accessibility', 'Design Systems', 'HTML & CSS', 'Motion Design'], source: 'linkedin', hue: 300, salary: [95_000, 'EUR', 'year'], consent: true, workPref: 'hybrid' }, 22],
    [{ id: 'c-04', name: 'Karim Nasser', title: 'Frontend Engineer', company: 'Orbital Commerce', location: 'Dubai, UAE', years: 5, skills: ['React', 'TypeScript', 'Web Performance', 'GraphQL', 'Automated Testing', 'Vue'], source: 'inbound', hue: 205, salary: [396_000, 'AED', 'year'], consent: true }, 14],
    [{ id: 'c-05', name: 'Lukas Fischer', title: 'Senior Frontend Engineer', company: 'Zephyr Cloud', location: 'Berlin, Germany', years: 8, skills: ['React', 'TypeScript', 'Next.js', 'Design Systems', 'Web Performance', 'Build Tooling'], source: 'linkedin', hue: 160, salary: [92_000, 'EUR', 'year'], consent: true, openToWork: true }, 11],
    [{ id: 'c-06', name: 'Noor Saleh', title: 'Frontend Engineer', company: 'Lumen Retail', location: 'Abu Dhabi, UAE', years: 4, skills: ['React', 'TypeScript', 'Accessibility', 'HTML & CSS', 'Automated Testing', 'Arabic'], source: 'linkedin', hue: 265, salary: [312_000, 'AED', 'year'], consent: true }, 9],
    [{ id: 'c-07', name: 'Yousef Aziz', title: 'React Developer', company: 'Harbor Bank', location: 'Dubai, UAE', years: 3, skills: ['React', 'JavaScript', 'TypeScript', 'HTML & CSS', 'State Management'], source: 'inbound', hue: 45, consent: true }, 3],
    [{ id: 'c-08', name: 'Ivana Novak', title: 'Senior Frontend Engineer', company: 'Northwind Systems', location: 'Remote · Sofia', years: 6, skills: ['React', 'TypeScript', 'Design Systems', 'Accessibility', 'GraphQL'], source: 'referral', referrerId: 'u-lucas', hue: 190, consent: true, workPref: 'remote' }, 2],
    [{ id: 'c-09', name: 'Tariq Mansour', title: 'UI Engineer', company: 'Falconline Logistics', location: 'Dubai, UAE', years: 5, skills: ['React', 'TypeScript', 'Web Performance', 'HTML & CSS'], source: 'linkedin', hue: 12, activity: 'Wrote about cutting LCP by 40% · 1w ago' }, 7],
    [{ id: 'c-10', name: 'Abena Owusu', title: 'Frontend Engineer', company: 'Pixelforge', location: 'London, UK', years: 6, skills: ['React', 'TypeScript', 'Next.js', 'Accessibility', 'Design Systems'], source: 'linkedin', hue: 120, activity: 'Shared a talk on web accessibility audits · 5d ago' }, 5],
    [{ id: 'c-11', name: 'Vikram Menon', title: 'Senior Software Engineer, Frontend', company: 'Tessellate AI', location: 'Bengaluru, India', years: 8, skills: ['React', 'TypeScript', 'GraphQL', 'Web Performance', 'Node.js'], source: 'linkedin', hue: 230, openToWork: true }, 1],
    [{ id: 'c-12', name: 'Lina Khoury', title: 'Frontend Developer', company: 'Quanta Health', location: 'Amman, Jordan', years: 4, skills: ['React', 'JavaScript', 'HTML & CSS', 'Accessibility', 'Arabic'], source: 'linkedin', hue: 330 }, 1],
    [{ id: 'c-13', name: 'Diego Romero', title: 'Frontend Engineer', company: 'Juniper Travel', location: 'Madrid, Spain', years: 3, skills: ['Vue', 'JavaScript', 'HTML & CSS'], source: 'inbound', hue: 75, consent: true }, 26],
    [{ id: 'c-14', name: 'Salma Darwish', title: 'Senior Frontend Engineer', company: 'Nimbus Labs', location: 'Dubai, UAE', years: 7, skills: ['React', 'TypeScript', 'Design Systems', 'Accessibility', 'Web Performance', 'Arabic'], source: 'referral', referrerId: 'u-mei', hue: 18, salary: [440_000, 'AED', 'year'], consent: true }, 40],
    // Staff Data Engineer
    [{ id: 'c-15', name: 'Jun Park', title: 'Senior Data Engineer', company: 'Dune Analytics', location: 'Berlin, Germany', years: 9, skills: ['SQL', 'Python', 'Apache Spark', 'Airflow', 'dbt', 'BigQuery', 'Data Modeling', 'Kafka'], source: 'linkedin', hue: 210, salary: [105_000, 'EUR', 'year'], consent: true }, 12],
    [{ id: 'c-16', name: 'Hassan Qureshi', title: 'Data Platform Engineer', company: 'Atlas Mobility', location: 'Dubai, UAE', years: 10, skills: ['SQL', 'Python', 'Apache Spark', 'Airflow', 'BigQuery', 'Data Modeling', 'Terraform', 'GCP'], source: 'linkedin', hue: 150, salary: [540_000, 'AED', 'year'], consent: true }, 8],
    [{ id: 'c-17', name: 'Inès Moreau', title: 'Analytics Engineer', company: 'Lumen Retail', location: 'Paris, France', years: 6, skills: ['SQL', 'dbt', 'BigQuery', 'Data Modeling', 'Python', 'BI & Visualisation'], source: 'linkedin', hue: 285, activity: 'Posted about dbt testing patterns · 4d ago' }, 3],
    [{ id: 'c-18', name: 'Kofi Asante', title: 'Big Data Engineer', company: 'Meridian Telecom', location: 'London, UK', years: 11, skills: ['Apache Spark', 'Kafka', 'Stream Processing', 'Python', 'SQL', 'Snowflake', 'Airflow'], source: 'linkedin', hue: 35 }, 1],
    [{ id: 'c-19', name: 'Ananya Reddy', title: 'Data Engineer', company: 'Kite Payments', location: 'Bengaluru, India', years: 7, skills: ['SQL', 'Python', 'Airflow', 'dbt', 'Snowflake', 'Data Pipelines'], source: 'linkedin', hue: 320, openToWork: true }, 1],
    // Product Designer, Growth
    [{ id: 'c-20', name: 'Amelia Clarke', title: 'Senior Product Designer', company: 'Pixelforge', location: 'London, UK', years: 7, skills: ['Figma', 'Product Design', 'Prototyping', 'Experimentation', 'UX Research', 'Design Systems', 'Interaction Design', 'Usability Testing'], source: 'referral', referrerId: 'u-sofia', hue: 350, salary: [84_000, 'GBP', 'year'], consent: true }, 24],
    [{ id: 'c-21', name: 'Jonas Andersson', title: 'Product Designer', company: 'Vertex Learning', location: 'Stockholm, Sweden', years: 5, skills: ['Figma', 'Product Design', 'Prototyping', 'Visual Design', 'Motion Design'], source: 'linkedin', hue: 195, consent: true }, 12],
    [{ id: 'c-22', name: 'Zara Hughes', title: 'Product Designer', company: 'Lumen Retail', location: 'London, UK', years: 4, skills: ['Figma', 'Product Design', 'Usability Testing', 'Prototyping'], source: 'inbound', hue: 100, consent: true }, 4],
    [{ id: 'c-23', name: 'Maya Rizk', title: 'UX/UI Designer', company: 'Mirage Studios', location: 'Dubai, UAE', years: 6, skills: ['Figma', 'Product Design', 'Interaction Design', 'Design Systems', 'Arabic'], source: 'linkedin', hue: 310, consent: true }, 6],
    // Product Manager, Payments
    [{ id: 'c-24', name: 'Faisal Jaber', title: 'Senior Product Manager', company: 'Oasis Fintech', location: 'Dubai, UAE', years: 8, skills: ['Product Management', 'Payments & Fintech', 'Product Analytics', 'Experimentation', 'Stakeholder Management', 'SQL', 'Roadmapping', 'Arabic'], source: 'linkedin', hue: 40, salary: [540_000, 'AED', 'year'], consent: true }, 10],
    [{ id: 'c-25', name: 'Dina Sabry', title: 'Product Manager', company: 'Sandstone Pay', location: 'Cairo, Egypt', years: 5, skills: ['Product Management', 'Payments & Fintech', 'Agile', 'Roadmapping', 'Stakeholder Management'], source: 'referral', referrerId: 'u-noah', hue: 15, consent: true }, 3],
    [{ id: 'c-26', name: 'Leo Brennan', title: 'Product Owner', company: 'Harbor Bank', location: 'Dublin, Ireland', years: 6, skills: ['Product Management', 'Agile', 'Payments & Fintech', 'Stakeholder Management'], source: 'linkedin', hue: 140 }, 2],
    // Cloud Security Engineer
    [{ id: 'c-27', name: 'Reem Hamdan', title: 'Senior Cloud Security Engineer', company: 'Cobalt Security', location: 'Abu Dhabi, UAE', years: 8, skills: ['Cloud Security', 'Kubernetes', 'Identity & Access', 'Threat Modeling', 'Incident Response', 'GCP', 'Terraform', 'Python', 'Zero Trust'], source: 'linkedin', hue: 255, salary: [510_000, 'AED', 'year'], consent: true }, 10],
    [{ id: 'c-28', name: 'Ivan Kowalski', title: 'Security Engineer', company: 'Zephyr Cloud', location: 'Warsaw, Poland', years: 6, skills: ['Cloud Security', 'AWS', 'SIEM', 'Incident Response', 'Python', 'Vulnerability Management'], source: 'linkedin', hue: 220, consent: true }, 6],
    [{ id: 'c-29', name: 'Bilal Siddiqui', title: 'Cloud Security Architect', company: 'Beacon Insurance', location: 'Riyadh, Saudi Arabia', years: 12, skills: ['Cloud Security', 'Security Compliance', 'Zero Trust', 'Identity & Access', 'AWS', 'Azure'], source: 'linkedin', hue: 175 }, 1],
    [{ id: 'c-30', name: 'Nadia Kassem', title: 'SOC Analyst', company: 'Meridian Telecom', location: 'Dubai, UAE', years: 3, skills: ['SIEM', 'Incident Response', 'Network Security', 'Python'], source: 'inbound', hue: 290, consent: true }, 2],
    // Enterprise AE (on hold)
    [{ id: 'c-31', name: 'Majid Zaki', title: 'Enterprise Account Executive', company: 'Northwind Systems', location: 'Riyadh, Saudi Arabia', years: 9, skills: ['Enterprise Sales', 'B2B Sales', 'Salesforce', 'Negotiation', 'Sales Methodology', 'Arabic', 'Pipeline Management'], source: 'linkedin', hue: 25, consent: true }, 20],
    [{ id: 'c-32', name: 'Sana Rahman', title: 'Account Executive', company: 'Kite Payments', location: 'Jeddah, Saudi Arabia', years: 5, skills: ['B2B Sales', 'Salesforce', 'Prospecting', 'Account Management', 'Arabic'], source: 'inbound', hue: 335, consent: true }, 16],
    // Data Engineer, Platform (filled)
    [{ id: 'c-33', name: 'Kwame Mensah', title: 'Data Engineer', company: 'Dune Analytics', location: 'Accra, Ghana', years: 5, skills: ['SQL', 'Python', 'BigQuery', 'dbt', 'Airflow', 'GCP'], source: 'linkedin', hue: 30, consent: true }, 75],
    [{ id: 'c-34', name: 'Olga Ivanova', title: 'Data Engineer', company: 'Polaris Gov Digital', location: 'Cairo, Egypt', years: 4, skills: ['SQL', 'Python', 'ETL / ELT', 'BI & Visualisation'], source: 'inbound', hue: 265, consent: true }, 70],
    // Talent pool (no active application)
    [{ id: 'c-35', name: 'Hala Bakr', title: 'Frontend Engineer', company: 'Atlas Mobility', location: 'Dubai, UAE', years: 6, skills: ['React', 'TypeScript', 'Design Systems', 'Accessibility', 'Next.js', 'Automated Testing'], source: 'silver-medalist', hue: 5, consent: true, tags: ['silver medalist', 'frontend'] }, 130],
    [{ id: 'c-36', name: 'Marco Conti', title: 'Senior Data Engineer', company: 'Tessellate AI', location: 'Milan, Italy', years: 8, skills: ['SQL', 'Python', 'Apache Spark', 'Airflow', 'dbt', 'BigQuery', 'Kafka'], source: 'silver-medalist', hue: 60, consent: true, tags: ['silver medalist', 'data'] }, 160],
    [{ id: 'c-37', name: 'Leila Tawfik', title: 'UX Researcher', company: 'Quanta Health', location: 'Dubai, UAE', years: 5, skills: ['UX Research', 'Usability Testing', 'Figma', 'Product Discovery'], source: 'event', hue: 280, consent: true, tags: ['research', 'event'] }, 45],
    [{ id: 'c-38', name: 'Samir Chaudhry', title: 'Security Analyst', company: 'Cobalt Security', location: 'Dubai, UAE', years: 4, skills: ['SIEM', 'Incident Response', 'Cloud Security', 'Python', 'Vulnerability Management'], source: 'silver-medalist', hue: 240, consent: true, tags: ['silver medalist', 'security'] }, 100],
  ];
  const candidates = specs.map(([s, d]) => candidate(s, now, d));
  const candById = new Map(candidates.map((c) => [c.id, c]));

  // ── applications
  const appSpecs: AppSpec[] = [
    { id: 'a-01', c: 'c-01', r: 'req-fe', stage: 'offer', days: 3, decision: 'hire', decisionBy: 'u-omar' },
    { id: 'a-02', c: 'c-02', r: 'req-fe', stage: 'final', days: 3 },
    { id: 'a-03', c: 'c-03', r: 'req-fe', stage: 'interview', days: 6 },
    { id: 'a-04', c: 'c-04', r: 'req-fe', stage: 'interview', days: 5 },
    { id: 'a-05', c: 'c-05', r: 'req-fe', stage: 'screen', days: 2 },
    { id: 'a-06', c: 'c-06', r: 'req-fe', stage: 'screen', days: 4 },
    { id: 'a-07', c: 'c-07', r: 'req-fe', stage: 'applied', days: 3 },
    { id: 'a-08', c: 'c-08', r: 'req-fe', stage: 'applied', days: 1 },
    { id: 'a-09', c: 'c-09', r: 'req-fe', stage: 'contacted', days: 6 },
    { id: 'a-10', c: 'c-10', r: 'req-fe', stage: 'contacted', days: 4 },
    { id: 'a-11', c: 'c-11', r: 'req-fe', stage: 'sourced', days: 1 },
    { id: 'a-12', c: 'c-12', r: 'req-fe', stage: 'sourced', days: 1 },
    { id: 'a-13', c: 'c-13', r: 'req-fe', stage: 'screen', days: 20, status: 'rejected', rejection: 'skills' },
    { id: 'a-14', c: 'c-14', r: 'req-fe', stage: 'hired', days: 6, status: 'hired', decision: 'hire', decisionBy: 'u-omar' },
    { id: 'a-15', c: 'c-15', r: 'req-data', stage: 'interview', days: 4 },
    { id: 'a-16', c: 'c-16', r: 'req-data', stage: 'screen', days: 2 },
    { id: 'a-17', c: 'c-17', r: 'req-data', stage: 'contacted', days: 2 },
    { id: 'a-18', c: 'c-18', r: 'req-data', stage: 'sourced', days: 1 },
    { id: 'a-19', c: 'c-19', r: 'req-data', stage: 'sourced', days: 1 },
    { id: 'a-20', c: 'c-20', r: 'req-design', stage: 'offer', days: 6, decision: 'hire', decisionBy: 'u-aisha', owner: 'u-sara' },
    { id: 'a-21', c: 'c-21', r: 'req-design', stage: 'interview', days: 5, owner: 'u-sara' },
    { id: 'a-22', c: 'c-22', r: 'req-design', stage: 'applied', days: 4, owner: 'u-sara' },
    { id: 'a-23', c: 'c-23', r: 'req-design', stage: 'screen', days: 3, owner: 'u-sara' },
    { id: 'a-24', c: 'c-24', r: 'req-pm', stage: 'interview', days: 3 },
    { id: 'a-25', c: 'c-25', r: 'req-pm', stage: 'applied', days: 3 },
    { id: 'a-26', c: 'c-26', r: 'req-pm', stage: 'contacted', days: 1 },
    { id: 'a-27', c: 'c-27', r: 'req-sec', stage: 'interview', days: 4 },
    { id: 'a-28', c: 'c-28', r: 'req-sec', stage: 'screen', days: 2 },
    { id: 'a-29', c: 'c-29', r: 'req-sec', stage: 'sourced', days: 1 },
    { id: 'a-30', c: 'c-30', r: 'req-sec', stage: 'applied', days: 2 },
    { id: 'a-31', c: 'c-31', r: 'req-ae', stage: 'screen', days: 14, owner: 'u-sara' },
    { id: 'a-32', c: 'c-32', r: 'req-ae', stage: 'applied', days: 15, owner: 'u-sara' },
    { id: 'a-33', c: 'c-33', r: 'req-de', stage: 'hired', days: 40, status: 'hired', decision: 'hire', decisionBy: 'u-omar' },
    { id: 'a-34', c: 'c-34', r: 'req-de', stage: 'final', days: 50, status: 'rejected', decision: 'no-hire', decisionBy: 'u-omar', rejection: 'skills' },
  ];

  const applications: Application[] = appSpecs.map((s) => {
    const cand = candById.get(s.c)!;
    const req = reqById.get(s.r)!;
    const warm = cand.source !== 'linkedin';
    const startStage: StageId = warm ? 'applied' : 'sourced';
    const enteredCurrent = now - s.days * DAY;
    const path = STAGE_ORDER.slice(stageIndex(startStage), stageIndex(s.stage) + 1);
    const span = Math.max(1, Math.round((cand.createdAt > enteredCurrent ? 1 : (enteredCurrent - cand.createdAt) / DAY) / Math.max(1, path.length - 1)));
    const history: StageEvent[] = path.map((stage, i) => ({
      stage,
      at: i === path.length - 1 ? enteredCurrent : Math.min(enteredCurrent - (path.length - 1 - i) * span * DAY, enteredCurrent),
      by: stage === 'final' || stage === 'interview' ? req.recruiterId : s.owner ?? req.recruiterId,
    }));
    const match = req.jd.profile ? scoreMatch(req.jd.profile, cand, { location: req.location, workModel: req.workModel }) : null;
    const app: Application = {
      id: s.id,
      candidateId: s.c,
      requisitionId: s.r,
      stage: s.stage,
      stageEnteredAt: enteredCurrent,
      status: s.status ?? 'active',
      history,
      match,
      ownerId: s.owner ?? req.recruiterId,
      createdAt: history[0].at,
      updatedAt: enteredCurrent,
    };
    if (s.decision) app.decision = { verdict: s.decision, by: s.decisionBy ?? req.hiringManagerId, at: enteredCurrent - DAY, note: s.decision === 'hire' ? 'Unanimous hire from the panel.' : 'Not enough depth on data modelling.' };
    if (s.rejection) app.rejection = { reason: s.rejection, by: req.recruiterId, at: enteredCurrent + DAY, note: 'Thanked and kept warm for future roles.' };
    return app;
  });
  const appById = new Map(applications.map((a) => [a.id, a]));

  // ── interviews & scorecards
  const interviews: Interview[] = [];
  const scorecards: Scorecard[] = [];
  const iv = (id: string, appId: string, kind: InterviewKind, when: number, interviewerIds: string[], cards: [string, Recommendation, Rating[], string][] = []) => {
    const app = appById.get(appId)!;
    const req = reqById.get(app.requisitionId)!;
    const step = req.interviewPlan.find((p) => p.kind === kind);
    const mins = step?.durationMins ?? INTERVIEW_KIND_META[kind].defaultMins;
    const past = when + mins * 60_000 < now;
    interviews.push({
      id,
      applicationId: appId,
      candidateId: app.candidateId,
      requisitionId: app.requisitionId,
      kind,
      title: step?.label ?? INTERVIEW_KIND_META[kind].label,
      scheduledAt: when,
      durationMins: mins,
      interviewerIds,
      location: kind === 'screen' ? 'Google Meet' : req.workModel === 'remote' ? 'Google Meet' : 'Helix HQ · Room Orbit',
      status: past ? 'completed' : 'scheduled',
      createdBy: req.recruiterId,
      createdAt: when - 4 * DAY,
    });
    const focus = step?.focus ?? INTERVIEW_KIND_META[kind].focus;
    cards.forEach(([by, rec, ratings, notes], i) =>
      scorecards.push({
        id: `${id}-sc${i + 1}`,
        interviewId: id,
        applicationId: appId,
        interviewerId: by,
        ratings: Object.fromEntries(focus.map((f, k) => [f, ratings[k] ?? 3])) as Record<string, Rating>,
        recommendation: rec,
        notes,
        submittedAt: when + (mins + 90) * 60_000,
      }),
    );
  };

  // Senior Frontend Engineer
  iv('iv-01', 'a-01', 'screen', dayAt(-16, 10), ['u-fatima'], [['u-fatima', 'strong-yes', [4, 4, 3], 'Clear motivation, great communicator, expectations within band.']]);
  iv('iv-02', 'a-01', 'technical', dayAt(-12, 14), ['u-priya'], [['u-priya', 'strong-yes', [4, 4, 4], 'Exceptional TypeScript depth; refactored a gnarly component live.']]);
  iv('iv-03', 'a-01', 'system-design', dayAt(-11, 11), ['u-lucas', 'u-omar'], [
    ['u-lucas', 'yes', [3, 4, 3], 'Solid architecture thinking, good trade-off discussion.'],
    ['u-omar', 'strong-yes', [4, 4, 3], 'Thinks in systems; would raise the bar on the team.'],
  ]);
  iv('iv-04', 'a-01', 'final', dayAt(-9, 16), ['u-omar'], [['u-omar', 'strong-yes', [4, 4, 4], 'Strongest frontend loop this year.']]);
  iv('iv-05', 'a-02', 'screen', dayAt(-10, 9, 30), ['u-fatima'], [['u-fatima', 'yes', [3, 4, 3], 'Leadership-curious; wants a hands-on role.']]);
  iv('iv-06', 'a-02', 'technical', dayAt(-6, 13), ['u-priya'], [['u-priya', 'strong-yes', [4, 4, 4], 'Deep performance expertise and very clean code.']]);
  iv('iv-07', 'a-02', 'system-design', dayAt(-5, 11), ['u-lucas', 'u-omar'], [
    ['u-lucas', 'yes', [3, 3, 4], 'Good scaling instincts for the design system.'],
    ['u-omar', 'yes', [3, 4, 3], 'Strong, slightly light on testing strategy.'],
  ]);
  iv('iv-08', 'a-02', 'culture', dayAt(-4, 15), ['u-mei'], [['u-mei', 'yes', [4, 3, 3], 'Great design partner energy, genuinely curious about users.']]);
  iv('iv-09', 'a-03', 'screen', dayAt(-9, 12), ['u-fatima'], [['u-fatima', 'yes', [3, 4, 3], 'Open to relocating to Dubai with family support.']]);
  iv('iv-10', 'a-03', 'technical', dayAt(-4, 11), ['u-priya'], [['u-priya', 'yes', [3, 3, 4], 'Accessibility knowledge is outstanding.']]);
  iv('iv-11', 'a-03', 'culture', dayAt(-3, 16), ['u-mei'], [['u-mei', 'strong-yes', [4, 4, 4], 'Would love to work with Chloé, craft-obsessed.']]);
  iv('iv-12', 'a-03', 'final', inHours(2), ['u-omar']);
  iv('iv-13', 'a-04', 'screen', dayAt(-8, 10), ['u-fatima'], [['u-fatima', 'yes', [3, 3, 3], 'Applied directly; strong performance story.']]);
  iv('iv-14', 'a-04', 'technical', dayAt(-3, 14), ['u-priya'], [['u-priya', 'yes', [3, 4, 3], 'Good fundamentals; GraphQL experience is a plus.']]);
  iv('iv-15', 'a-04', 'system-design', dayAt(-1, 13), ['u-lucas', 'u-omar'], [['u-lucas', 'yes', [3, 3, 3], 'Reasonable design; needs more depth on caching.']]);
  iv('iv-16', 'a-05', 'screen', dayAt(1, 11), ['u-fatima']);
  iv('iv-17', 'a-06', 'screen', dayAt(-2, 15), ['u-fatima'], [['u-fatima', 'yes', [3, 4, 3], 'Motivated, Arabic speaker, available in 30 days.']]);
  iv('iv-18', 'a-13', 'screen', dayAt(-20, 10), ['u-fatima'], [['u-fatima', 'no', [2, 3, 2], 'Vue-only background; not ready for senior scope.']]);
  iv('iv-19', 'a-14', 'technical', dayAt(-30, 11), ['u-priya'], [['u-priya', 'strong-yes', [4, 4, 4], 'Outstanding; built our kind of design system before.']]);
  iv('iv-20', 'a-14', 'final', dayAt(-25, 15), ['u-omar'], [['u-omar', 'strong-yes', [4, 4, 4], 'Hire. Great culture add.']]);
  // Staff Data Engineer
  iv('iv-21', 'a-15', 'screen', dayAt(-6, 10), ['u-fatima'], [['u-fatima', 'yes', [3, 4, 3], 'Wants staff-level scope; remote in Berlin works.']]);
  iv('iv-22', 'a-15', 'technical', dayAt(2, 10, 30), ['u-priya']);
  iv('iv-23', 'a-16', 'screen', dayAt(1, 14), ['u-fatima']);
  // Product Designer, Growth
  iv('iv-24', 'a-20', 'screen', dayAt(-18, 11), ['u-sara'], [['u-sara', 'strong-yes', [4, 4, 4], 'Referral from Sofia, superb portfolio.']]);
  iv('iv-25', 'a-20', 'portfolio', dayAt(-12, 14), ['u-mei', 'u-hana'], [
    ['u-mei', 'strong-yes', [4, 4, 4], 'Best growth case studies I’ve seen.'],
    ['u-hana', 'yes', [3, 4, 3], 'Strong research instincts.'],
  ]);
  iv('iv-26', 'a-20', 'case', dayAt(-9, 10), ['u-aisha'], [['u-aisha', 'strong-yes', [4, 4, 4], 'Nailed the activation challenge.']]);
  iv('iv-27', 'a-21', 'screen', dayAt(-7, 9), ['u-sara'], [['u-sara', 'yes', [3, 3, 3], 'Open to relocating to London.']]);
  iv('iv-28', 'a-21', 'portfolio', dayAt(-2, 13), ['u-mei', 'u-hana'], [['u-mei', 'yes', [3, 4, 3], 'Lovely visual craft; growth metrics less clear.']]);
  iv('iv-29', 'a-21', 'case', dayAt(3, 13), ['u-aisha']);
  iv('iv-30', 'a-23', 'screen', dayAt(3, 10), ['u-sara']);
  // Product Manager, Payments
  iv('iv-31', 'a-24', 'screen', dayAt(-5, 11), ['u-fatima'], [['u-fatima', 'strong-yes', [4, 4, 4], 'Deep payments background in the GCC.']]);
  iv('iv-32', 'a-24', 'case', dayAt(1, 10), ['u-aisha']);
  // Cloud Security Engineer
  iv('iv-33', 'a-27', 'screen', dayAt(-7, 12), ['u-fatima'], [['u-fatima', 'yes', [3, 4, 3], 'Abu Dhabi based, happy with on-site in Dubai.']]);
  iv('iv-34', 'a-27', 'technical', dayAt(-2, 10), ['u-ethan'], [['u-ethan', 'strong-yes', [4, 4, 4], 'Best Kubernetes security depth we’ve interviewed.']]);
  iv('iv-35', 'a-27', 'system-design', dayAt(1, 15), ['u-lucas']);
  iv('iv-36', 'a-28', 'screen', inHours(4), ['u-fatima']);
  // Enterprise AE (paused)
  iv('iv-37', 'a-31', 'screen', dayAt(-15, 10), ['u-sara'], [['u-sara', 'yes', [3, 4, 3], 'Strong KSA network; paused while the role is on hold.']]);
  // Data Engineer, Platform (filled)
  iv('iv-38', 'a-33', 'technical', dayAt(-55, 11), ['u-priya'], [['u-priya', 'strong-yes', [4, 4, 3], 'Pragmatic, great dbt instincts.']]);
  iv('iv-39', 'a-34', 'technical', dayAt(-55, 14), ['u-priya'], [['u-priya', 'no', [2, 2, 3], 'Gaps in data modelling fundamentals.']]);

  // ── offers
  const offers: Offer[] = [
    {
      id: 'of-1',
      applicationId: 'a-01',
      candidateId: 'c-01',
      requisitionId: 'req-fe',
      title: 'Senior Frontend Engineer',
      band: 'E5',
      baseSalary: 456_000,
      currency: 'AED',
      bonusPct: 10,
      equity: '1,200 RSUs over 4 years',
      signOnBonus: 25_000,
      startDate: iso(38),
      expiresAt: now + 12 * DAY,
      status: 'pending-approval',
      approvals: [
        { step: 'hiring-manager', approverId: 'u-omar', decision: 'approved', at: now - 1 * DAY, note: 'Strongest frontend loop this year.' },
        { step: 'people-ops', decision: 'pending' },
      ],
      createdBy: 'u-fatima',
      createdAt: now - 3 * DAY,
      note: 'Within band; sign-on covers her unvested bonus.',
    },
    {
      id: 'of-2',
      applicationId: 'a-20',
      candidateId: 'c-20',
      requisitionId: 'req-design',
      title: 'Senior Product Designer, Growth',
      band: 'E5',
      baseSalary: 86_000,
      currency: 'GBP',
      bonusPct: 8,
      equity: '900 RSUs over 4 years',
      signOnBonus: 5_000,
      startDate: iso(30),
      expiresAt: now + 5 * DAY,
      status: 'sent',
      approvals: [
        { step: 'hiring-manager', approverId: 'u-aisha', decision: 'approved', at: now - 5 * DAY },
        { step: 'people-ops', approverId: 'u-layla', decision: 'approved', at: now - 4 * DAY },
      ],
      createdBy: 'u-sara',
      createdAt: now - 6 * DAY,
      sentAt: now - 2 * DAY,
    },
    {
      id: 'of-3',
      applicationId: 'a-14',
      candidateId: 'c-14',
      requisitionId: 'req-fe',
      title: 'Senior Frontend Engineer',
      band: 'E5',
      baseSalary: 444_000,
      currency: 'AED',
      bonusPct: 10,
      equity: '1,000 RSUs over 4 years',
      signOnBonus: 0,
      startDate: iso(9),
      expiresAt: now - 3 * DAY,
      status: 'accepted',
      approvals: [
        { step: 'hiring-manager', approverId: 'u-omar', decision: 'approved', at: now - 13 * DAY },
        { step: 'people-ops', approverId: 'u-sara', decision: 'approved', at: now - 12 * DAY },
      ],
      createdBy: 'u-fatima',
      createdAt: now - 14 * DAY,
      sentAt: now - 10 * DAY,
      respondedAt: now - 6 * DAY,
    },
    {
      id: 'of-4',
      applicationId: 'a-33',
      candidateId: 'c-33',
      requisitionId: 'req-de',
      title: 'Data Engineer, Platform',
      band: 'E4',
      baseSalary: 336_000,
      currency: 'AED',
      bonusPct: 8,
      equity: '600 RSUs over 4 years',
      signOnBonus: 0,
      startDate: iso(-26),
      expiresAt: now - 38 * DAY,
      status: 'accepted',
      approvals: [
        { step: 'hiring-manager', approverId: 'u-omar', decision: 'approved', at: now - 47 * DAY },
        { step: 'people-ops', approverId: 'u-sara', decision: 'approved', at: now - 46 * DAY },
      ],
      createdBy: 'u-fatima',
      createdAt: now - 48 * DAY,
      sentAt: now - 45 * DAY,
      respondedAt: now - 40 * DAY,
    },
  ];

  // ── outreach (bodies drafted by the offline writer for realism)
  const senders: Record<string, { name: string; title: string }> = {
    'u-fatima': { name: 'Fatima Zahra', title: 'Talent Partner' },
    'u-sara': { name: 'Sara Al Mansoori', title: 'People Ops Lead' },
  };
  const outreach: Outreach[] = [];
  const out = (id: string, candId: string, reqId: string, channel: OutreachChannel, tone: OutreachTone, status: OutreachStatus, sentDaysAgo: number, repliedDaysAgo?: number) => {
    const cand = candById.get(candId)!;
    const req = reqById.get(reqId)!;
    const by = req.recruiterId;
    const app = applications.find((a) => a.candidateId === candId && a.requisitionId === reqId);
    const draft = draftOutreach({
      role: roleFromProfile(req.jd.profile, req),
      person: cand,
      match: app?.match,
      channel,
      tone,
      step: 1,
      sender: senders[by] ?? senders['u-fatima'],
    });
    outreach.push({
      id,
      candidateId: candId,
      requisitionId: reqId,
      channel,
      tone,
      subject: draft.subject,
      body: draft.body,
      step: 1,
      status,
      engine: 'offline',
      createdBy: by,
      createdAt: now - sentDaysAgo * DAY - HOUR,
      sentAt: now - sentDaysAgo * DAY,
      respondedAt: repliedDaysAgo !== undefined ? now - repliedDaysAgo * DAY : undefined,
      followUpAt: status === 'sent' ? now - sentDaysAgo * DAY + 4 * DAY : undefined,
    });
  };
  out('o-01', 'c-09', 'req-fe', 'linkedin-inmail', 'warm', 'sent', 6);
  out('o-02', 'c-10', 'req-fe', 'linkedin-inmail', 'visionary', 'interested', 4, 1);
  out('o-03', 'c-17', 'req-data', 'linkedin-connect', 'concise', 'sent', 2);
  out('o-04', 'c-26', 'req-pm', 'linkedin-inmail', 'technical', 'sent', 1);
  out('o-05', 'c-01', 'req-fe', 'linkedin-inmail', 'warm', 'interested', 27, 25);
  out('o-06', 'c-03', 'req-fe', 'linkedin-connect', 'warm', 'interested', 20, 18);
  out('o-07', 'c-05', 'req-fe', 'linkedin-inmail', 'technical', 'interested', 9, 7);
  out('o-08', 'c-06', 'req-fe', 'linkedin-inmail', 'warm', 'interested', 8, 6);
  out('o-09', 'c-15', 'req-data', 'linkedin-inmail', 'technical', 'interested', 11, 9);
  out('o-10', 'c-16', 'req-data', 'linkedin-inmail', 'visionary', 'interested', 7, 5);
  out('o-11', 'c-21', 'req-design', 'linkedin-inmail', 'warm', 'interested', 11, 9);
  out('o-12', 'c-23', 'req-design', 'linkedin-connect', 'concise', 'interested', 5, 4);
  out('o-13', 'c-24', 'req-pm', 'linkedin-inmail', 'visionary', 'interested', 9, 8);
  out('o-14', 'c-27', 'req-sec', 'linkedin-inmail', 'technical', 'interested', 9, 8);
  out('o-15', 'c-28', 'req-sec', 'linkedin-inmail', 'concise', 'interested', 5, 4);
  out('o-16', 'c-31', 'req-ae', 'linkedin-inmail', 'warm', 'interested', 19, 17);
  out('o-17', 'c-33', 'req-de', 'linkedin-inmail', 'warm', 'interested', 74, 72);
  for (const o of outreach) {
    const c = candById.get(o.candidateId);
    if (c) c.lastContactedAt = Math.max(c.lastContactedAt ?? 0, o.sentAt ?? 0);
  }

  // ── onboarding (hand-offs to HR Portal)
  const j1Tasks = buildJourneyTasks('j-1').map((t) => {
    const done = t.dueOffsetDays <= -9 || t.title.startsWith('Assign an onboarding buddy') || t.title.startsWith('Order laptop');
    return done ? { ...t, done, doneAt: now - (6 - Math.min(5, Math.abs(t.dueOffsetDays) % 6)) * DAY, doneBy: t.owner === 'manager' ? 'u-omar' : t.owner === 'it' ? 'u-layla' : 'u-sara' } : t;
  });
  const j2Tasks = buildJourneyTasks('j-2').map((t) => {
    const done = t.dueOffsetDays <= 7 && !t.title.startsWith('Benefits');
    const doneBy = t.owner === 'manager' ? 'u-omar' : t.owner === 'buddy' ? 'u-priya' : t.owner === 'new-hire' ? 'u-kwame' : t.owner === 'it' ? 'u-layla' : 'u-sara';
    return done ? { ...t, done, doneAt: now - 26 * DAY + t.dueOffsetDays * DAY + 2 * HOUR, doneBy } : t;
  });
  const onboarding: OnboardingJourney[] = [
    {
      id: 'j-1',
      candidateId: 'c-14',
      applicationId: 'a-14',
      requisitionId: 'req-fe',
      offerId: 'of-3',
      name: 'Salma Darwish',
      email: 'salma.darwish@example.com',
      title: 'Senior Frontend Engineer',
      department: 'Engineering',
      location: 'Dubai',
      managerId: 'u-omar',
      buddyId: 'u-mei',
      startDate: iso(9),
      status: 'pre-boarding',
      tasks: j1Tasks,
      avatarHue: 18,
      welcomeNote: 'Salma, we can’t wait to build the next generation of NEXUS with you. Your first week is all about people, not tickets. — Omar',
      handedOffBy: 'u-fatima',
      handedOffAt: now - 6 * DAY,
    },
    {
      id: 'j-2',
      candidateId: 'c-33',
      applicationId: 'a-33',
      requisitionId: 'req-de',
      offerId: 'of-4',
      name: 'Kwame Mensah',
      email: 'kwame.mensah@example.com',
      title: 'Data Engineer',
      department: 'Engineering',
      location: 'Accra (Remote)',
      managerId: 'u-omar',
      buddyId: 'u-priya',
      startDate: iso(-26),
      status: 'active',
      tasks: j2Tasks,
      avatarHue: 30,
      hubUserId: 'u-kwame',
      workEmail: 'kwame.mensah@helix.co',
      welcomeNote: 'Karibu, Kwame! Priya will be your guide for the first 90 days.',
      handedOffBy: 'u-fatima',
      handedOffAt: now - 40 * DAY,
    },
  ];

  // ── activity timeline (derived)
  const activity: TalentActivity[] = [];
  let n = 0;
  const act = (a: Omit<TalentActivity, 'id'>) => activity.push({ id: `act-${++n}`, ...a });
  for (const app of applications) {
    const cand = candById.get(app.candidateId)!;
    const req = reqById.get(app.requisitionId)!;
    app.history.forEach((h, i) =>
      act({
        at: h.at,
        actorId: h.by,
        kind: i === 0 ? 'created' : 'stage',
        text: i === 0 ? `${cand.name} added to ${req.title} (${STAGE_BY_ID[h.stage].label})` : `${cand.name} moved to ${STAGE_BY_ID[h.stage].label}`,
        candidateId: cand.id,
        applicationId: app.id,
        requisitionId: req.id,
      }),
    );
    if (app.decision)
      act({ at: app.decision.at, actorId: app.decision.by, kind: 'decision', text: `Hire decision for ${cand.name}: ${app.decision.verdict === 'hire' ? 'Hire' : 'No hire'}`, candidateId: cand.id, applicationId: app.id, requisitionId: req.id });
    if (app.rejection) act({ at: app.rejection.at, actorId: app.rejection.by, kind: 'rejected', text: `${cand.name} closed out (not progressing)`, candidateId: cand.id, applicationId: app.id, requisitionId: req.id });
  }
  for (const o of outreach) {
    const cand = candById.get(o.candidateId)!;
    act({ at: o.sentAt ?? o.createdAt, actorId: o.createdBy, kind: 'outreach', text: `LinkedIn message sent to ${cand.name}`, candidateId: cand.id, requisitionId: o.requisitionId ?? undefined });
    if (o.respondedAt) act({ at: o.respondedAt, actorId: o.createdBy, kind: 'reply', text: `${cand.name} replied: interested`, candidateId: cand.id, requisitionId: o.requisitionId ?? undefined });
  }
  for (const i of interviews) {
    const cand = candById.get(i.candidateId)!;
    act({ at: i.createdAt, actorId: i.createdBy, kind: 'interview', text: `${i.title} scheduled with ${cand.name}`, candidateId: cand.id, applicationId: i.applicationId, requisitionId: i.requisitionId });
  }
  for (const s of scorecards) {
    const app = appById.get(s.applicationId)!;
    const cand = candById.get(app.candidateId)!;
    act({ at: s.submittedAt, actorId: s.interviewerId, kind: 'scorecard', text: `Scorecard submitted for ${cand.name}`, candidateId: cand.id, applicationId: app.id, requisitionId: app.requisitionId });
  }
  for (const o of offers) {
    const cand = candById.get(o.candidateId)!;
    act({ at: o.createdAt, actorId: o.createdBy, kind: 'offer', text: `Offer drafted for ${cand.name}`, candidateId: cand.id, applicationId: o.applicationId, requisitionId: o.requisitionId });
    if (o.sentAt) act({ at: o.sentAt, actorId: o.createdBy, kind: 'offer', text: `Offer sent to ${cand.name}`, candidateId: cand.id, applicationId: o.applicationId, requisitionId: o.requisitionId });
    if (o.status === 'accepted' && o.respondedAt) act({ at: o.respondedAt, actorId: o.createdBy, kind: 'hired', text: `${cand.name} accepted the offer 🎉`, candidateId: cand.id, applicationId: o.applicationId, requisitionId: o.requisitionId });
  }
  for (const j of onboarding) act({ at: j.handedOffAt, actorId: j.handedOffBy, kind: 'handoff', text: `${j.name} handed off to HR Portal onboarding`, candidateId: j.candidateId, applicationId: j.applicationId, requisitionId: j.requisitionId });
  for (const r of requisitions) act({ at: r.createdAt, actorId: r.createdBy, kind: 'requisition', text: `Requisition raised: ${r.title}`, requisitionId: r.id });
  activity.sort((a, b) => b.at - a.at);

  return {
    version: TALENT_DATA_VERSION,
    requisitions,
    candidates,
    applications,
    interviews: interviews.sort((a, b) => a.scheduledAt - b.scheduledAt),
    scorecards,
    offers,
    outreach,
    onboarding,
    activity: activity.slice(0, 400),
  };
}
