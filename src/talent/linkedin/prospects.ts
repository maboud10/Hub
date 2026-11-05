/**
 * Sample LinkedIn prospect feed (assisted mode).
 *
 * Deterministically generated, clearly-labelled fictional profiles so the
 * sourcing flow works end-to-end without LinkedIn partner API access. They
 * have no profile URLs on purpose: they are not real LinkedIn members.
 */
import type { Education, Experience, Prospect } from '../types';
import { roleFamilyById } from '../ai/taxonomy';

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  'Aisha', 'Omar', 'Lina', 'Karim', 'Yasmin', 'Yousef', 'Maya', 'Rami', 'Noor', 'Hassan', 'Leila', 'Tariq', 'Farah', 'Ziad', 'Hala', 'Bilal',
  'Dina', 'Samir', 'Rania', 'Faisal', 'Priya', 'Arjun', 'Ananya', 'Rohan', 'Meera', 'Vikram', 'Sofia', 'Lukas', 'Elena', 'Mateo', 'Chloe',
  'Daniel', 'Grace', 'Ethan', 'Amelia', 'Jonas', 'Mira', 'Jun', 'Wei', 'Yuki', 'Kenji', 'Ji-woo', 'Amara', 'Kofi', 'Zainab', 'Tobi', 'Chidi',
  'Fatou', 'Isabel', 'Hugo', 'Ines', 'Marco', 'Nadia', 'Ivan', 'Olga', 'Kai', 'Leo', 'Zara', 'Adam', 'Salma', 'Reem', 'Majid', 'Sana',
];
const LAST = [
  'Haddad', 'Nasser', 'Khoury', 'Saleh', 'Farouk', 'Aziz', 'Rahman', 'Mansour', 'Qureshi', 'Siddiqui', 'Iyer', 'Menon', 'Kapoor', 'Reddy',
  'Sharma', 'Fischer', 'Weber', 'Novak', 'Costa', 'Silva', 'Moreau', 'Laurent', 'Bianchi', 'Conti', 'Han', 'Park', 'Tan', 'Lim', 'Chen',
  'Wong', 'Sato', 'Okoye', 'Asante', 'Adeyemi', 'Diallo', 'Andersson', 'Nielsen', 'Kowalski', 'Ivanova', 'Alvarez', 'Romero', 'Hughes',
  'Brennan', 'Clarke', 'Owusu', 'Bakr', 'Hamdan', 'Zaki', 'Sabry', 'Tawfik', 'Darwish', 'Jaber', 'Kassem', 'Rizk',
];
const COMPANIES = [
  'Nimbus Labs', 'Sandstone Pay', 'Orbital Commerce', 'Falconline Logistics', 'Quanta Health', 'Mirage Studios', 'Dune Analytics', 'Atlas Mobility',
  'Cobalt Security', 'Lumen Retail', 'Zephyr Cloud', 'Oasis Fintech', 'Northwind Systems', 'Vertex Learning', 'Harbor Bank', 'Kite Payments',
  'Pixelforge', 'Meridian Telecom', 'Saffron Foods', 'Beacon Insurance', 'Tessellate AI', 'Crescent Energy', 'Juniper Travel', 'Polaris Gov Digital',
];
const LOCATIONS: [string, number][] = [
  ['Dubai, UAE', 9],
  ['Abu Dhabi, UAE', 3],
  ['Riyadh, Saudi Arabia', 3],
  ['Cairo, Egypt', 3],
  ['Amman, Jordan', 2],
  ['London, UK', 3],
  ['Berlin, Germany', 2],
  ['Lisbon, Portugal', 2],
  ['Bengaluru, India', 3],
  ['Singapore', 2],
  ['Remote · Istanbul', 1],
];
const SCHOOLS: Record<string, [string, string][]> = {
  eng: [
    ['American University of Sharjah', 'BSc Computer Engineering'],
    ['Khalifa University', 'BSc Computer Science'],
    ['IIT Madras', 'BTech Computer Science'],
    ['TU Munich', 'MSc Informatics'],
    ['University of Cairo', 'BSc Computer Science'],
    ['NUS', 'BComp Computer Science'],
    ['University of Manchester', 'MEng Software Engineering'],
  ],
  design: [
    ['Dubai Institute of Design & Innovation', 'BDes Product Design'],
    ['Central Saint Martins', 'BA Graphic Communication Design'],
    ['NID Ahmedabad', 'M.Des Interaction Design'],
    ['Delft University of Technology', 'MSc Design for Interaction'],
  ],
  business: [
    ['INSEAD', 'MBA'],
    ['London Business School', 'MBA'],
    ['American University in Dubai', 'BBA Marketing'],
    ['King Saud University', 'BSc Business Administration'],
    ['University of Jordan', 'BA Human Resources'],
  ],
};
const ACTIVITY: Record<string, string[]> = {
  frontend: ['Posted about migrating a design system to React Server Components', 'Shared a talk on web accessibility audits', 'Wrote about cutting LCP by 40%'],
  backend: ['Posted about event-driven architecture with Kafka', 'Shared lessons from a Postgres migration', 'Wrote about idempotent payment APIs'],
  fullstack: ['Shared a side project built with Next.js', 'Posted about shipping weekly in small teams'],
  'data-eng': ['Posted about dbt testing patterns', 'Shared a lakehouse cost-optimisation story', 'Spoke about streaming pipelines at a Dubai meetup'],
  'data-sci': ['Posted about evaluating LLM outputs', 'Shared a RAG prototype for Arabic documents'],
  sre: ['Wrote about SLOs that teams actually use', 'Shared a Kubernetes cost dashboard', 'Posted an incident post-mortem template'],
  security: ['Posted about zero-trust rollout lessons', 'Spoke on cloud security posture at a GCC summit', 'Shared a threat-modelling workshop guide'],
  mobile: ['Posted about Jetpack Compose in production', 'Shared a React Native performance checklist'],
  designer: ['Shared a case study on onboarding redesign', 'Posted about scaling a design system', 'Wrote about designing for Arabic RTL'],
  researcher: ['Posted about research ops on a budget', 'Shared a usability testing template'],
  pm: ['Posted about payments conversion experiments', 'Shared a product discovery framework', 'Wrote about saying no to roadmap requests'],
  sales: ['Posted about closing enterprise deals in KSA', 'Shared a MEDDICC deal review checklist'],
  'people-partner': ['Posted about manager enablement programmes', 'Shared notes on UAE labour law updates'],
  recruiter: ['Posted about structured interviewing', 'Shared tips on inclusive job descriptions'],
  cs: ['Posted about reducing churn with health scores', 'Shared a QBR template'],
  finance: ['Posted about rolling forecasts', 'Shared a VAT readiness checklist'],
  marketing: ['Posted about B2B brand storytelling', 'Shared a demand-gen campaign teardown'],
  'eng-manager': ['Posted about growing senior engineers', 'Shared an engineering ladder framework'],
};

/** How many sample prospects per role family. */
const MIX: [string, number, keyof typeof SCHOOLS][] = [
  ['frontend', 7, 'eng'],
  ['backend', 5, 'eng'],
  ['fullstack', 3, 'eng'],
  ['data-eng', 5, 'eng'],
  ['data-sci', 3, 'eng'],
  ['sre', 4, 'eng'],
  ['security', 5, 'eng'],
  ['mobile', 2, 'eng'],
  ['eng-manager', 2, 'eng'],
  ['designer', 5, 'design'],
  ['researcher', 2, 'design'],
  ['pm', 5, 'business'],
  ['sales', 4, 'business'],
  ['people-partner', 3, 'business'],
  ['recruiter', 2, 'business'],
  ['cs', 2, 'business'],
  ['finance', 2, 'business'],
  ['marketing', 2, 'business'],
];

function generate(): Prospect[] {
  const r = rng(20261104);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(r() * list.length)];
  const weighted = (list: [string, number][]) => {
    const total = list.reduce((n, [, w]) => n + w, 0);
    let x = r() * total;
    for (const [v, w] of list) if ((x -= w) <= 0) return v;
    return list[0][0];
  };
  const shuffle = <T,>(list: T[]) => {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const usedNames = new Set<string>();
  const out: Prospect[] = [];
  const year = new Date().getFullYear();

  for (const [familyId, count, schoolKind] of MIX) {
    const family = roleFamilyById(familyId);
    if (!family) continue;
    for (let i = 0; i < count; i += 1) {
      let name = '';
      for (let tries = 0; tries < 20 && (!name || usedNames.has(name)); tries += 1) name = `${pick(FIRST)} ${pick(LAST)}`;
      usedNames.add(name);
      const years = Math.round(2 + r() * 13);
      const prefix = years >= 10 ? pick(['Staff ', 'Principal ', 'Lead ']) : years >= 5 ? 'Senior ' : '';
      const baseTitle = pick(family.aliases.slice(0, 3));
      const title = familyId === 'eng-manager' || familyId === 'sales' || familyId === 'pm' ? (years >= 6 ? `Senior ${baseTitle}` : baseTitle) : `${prefix}${baseTitle}`;
      const company = pick(COMPANIES);
      const location = weighted(LOCATIONS);
      const gcc = /UAE|Saudi|Egypt|Jordan/.test(location);
      const skills = shuffle(family.skills).slice(0, 5 + Math.floor(r() * 5));
      if (gcc && r() < 0.45 && !skills.includes('Arabic')) skills.push('Arabic');
      const startCurrent = year - Math.max(1, Math.round(years * (0.25 + r() * 0.35)));
      const prevCompany = pick(COMPANIES.filter((c) => c !== company));
      const experience: Experience[] = [
        { title, company, start: `${startCurrent}-${String(1 + Math.floor(r() * 12)).padStart(2, '0')}`, end: null },
        {
          title: years >= 5 ? baseTitle : `Junior ${baseTitle}`,
          company: prevCompany,
          start: `${year - years}-${String(1 + Math.floor(r() * 12)).padStart(2, '0')}`,
          end: `${startCurrent}-${String(1 + Math.floor(r() * 12)).padStart(2, '0')}`,
        },
      ];
      const [school, degree] = pick(SCHOOLS[schoolKind]);
      const education: Education[] = [{ school, degree, year: year - years - 1 }];
      const headlineTemplates = [
        `${title} at ${company} · ${skills.slice(0, 3).join(', ')}`,
        `${title} · ${skills[0]} & ${skills[1]} · ex-${prevCompany}`,
        `${title} @ ${company} | ${family.keywords[0] ?? skills[0]} | ${skills[1]}`,
      ];
      out.push({
        id: `pr-${familyId}-${i + 1}`,
        name,
        headline: pick(headlineTemplates),
        currentTitle: title,
        currentCompany: company,
        location,
        yearsExperience: years,
        skills,
        experience,
        education,
        openToWork: r() < 0.3,
        profileUrl: '',
        avatarHue: Math.floor(r() * 360),
        connectionDegree: r() < 0.55 ? 2 : 3,
        mutualConnections: Math.floor(r() * 26),
        recentActivity: `${pick(ACTIVITY[familyId] ?? ['Shared an industry update'])} · ${1 + Math.floor(r() * 12)}d ago`,
        sample: true,
      });
    }
  }
  return out;
}

export const SAMPLE_PROSPECTS: Prospect[] = generate();
