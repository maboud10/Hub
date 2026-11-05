/**
 * Skills taxonomy + role families for the offline intelligence engine.
 *
 * - `SKILLS` maps synonyms ("reactjs", "React.js") to one canonical label so the
 *   matcher compares like with like.
 * - `ROLE_FAMILIES` power title aliases for LinkedIn Boolean searches, department
 *   inference and the sample prospect feed.
 */
import type { Department } from '@/types';

export type SkillCategory =
  | 'Frontend'
  | 'Backend'
  | 'Engineering'
  | 'Data'
  | 'Cloud & DevOps'
  | 'Security'
  | 'Mobile'
  | 'AI/ML'
  | 'Design'
  | 'Product'
  | 'Sales'
  | 'Marketing'
  | 'People'
  | 'Finance'
  | 'Operations'
  | 'Leadership'
  | 'Languages';

export interface SkillDef {
  label: string;
  category: SkillCategory;
  /** Case-insensitive synonyms (matched on word boundaries). */
  aliases: string[];
  /** Case-sensitive tokens for ambiguous words (Go, Swift, Spark, Excel). */
  cs: string[];
}

const S = (label: string, category: SkillCategory, aliases: string[] = [], cs: string[] = []): SkillDef => ({ label, category, aliases, cs });

export const SKILLS: SkillDef[] = [
  // Frontend
  S('React', 'Frontend', ['react', 'react.js', 'reactjs']),
  S('TypeScript', 'Frontend', ['typescript']),
  S('JavaScript', 'Frontend', ['javascript', 'js', 'es6', 'ecmascript']),
  S('Next.js', 'Frontend', ['next.js', 'nextjs']),
  S('Vue', 'Frontend', ['vue', 'vue.js', 'vuejs', 'nuxt']),
  S('Angular', 'Frontend', ['angular']),
  S('HTML & CSS', 'Frontend', ['html', 'css', 'html5', 'css3', 'sass', 'scss', 'tailwind', 'tailwind css']),
  S('Accessibility', 'Frontend', ['accessibility', 'a11y', 'wcag']),
  S('Web Performance', 'Frontend', ['web performance', 'core web vitals', 'lighthouse', 'performance optimization', 'performance optimisation']),
  S('GraphQL', 'Frontend', ['graphql', 'apollo']),
  S('State Management', 'Frontend', ['redux', 'zustand', 'state management', 'mobx']),
  S('Build Tooling', 'Frontend', ['webpack', 'vite', 'build tooling', 'monorepo', 'turborepo']),
  // Cross-cutting engineering
  S('Automated Testing', 'Engineering', ['jest', 'vitest', 'cypress', 'playwright', 'testing library', 'unit testing', 'e2e testing', 'test automation', 'tdd']),
  S('System Design', 'Engineering', ['system design', 'software architecture', 'architecture reviews']),
  S('Distributed Systems', 'Engineering', ['distributed systems', 'distributed system', 'high availability', 'large-scale systems', 'scalable systems']),
  S('Code Review', 'Engineering', ['code review', 'code reviews', 'engineering best practices']),
  // Backend
  S('Node.js', 'Backend', ['node.js', 'nodejs', 'express.js', 'expressjs', 'nestjs']),
  S('Python', 'Backend', ['python', 'django', 'flask', 'fastapi']),
  S('Go', 'Backend', ['golang', 'go lang'], ['Go']),
  S('Java', 'Backend', ['java', 'spring boot', 'spring framework', 'jvm']),
  S('Kotlin', 'Backend', ['kotlin']),
  S('.NET / C#', 'Backend', ['c#', '.net', 'dotnet', 'asp.net']),
  S('Ruby on Rails', 'Backend', ['ruby', 'rails', 'ruby on rails']),
  S('PHP', 'Backend', ['php', 'laravel']),
  S('Rust', 'Backend', ['rust']),
  S('Scala', 'Backend', ['scala']),
  S('REST APIs', 'Backend', ['restful', 'rest api', 'rest apis', 'api design', 'openapi']),
  S('gRPC', 'Backend', ['grpc', 'protobuf']),
  S('Microservices', 'Backend', ['microservices', 'micro-services', 'service-oriented architecture']),
  S('Event-driven Architecture', 'Backend', ['event-driven', 'event driven', 'pub/sub', 'pubsub', 'rabbitmq', 'message queues']),
  S('PostgreSQL', 'Backend', ['postgresql', 'postgres']),
  S('MySQL', 'Backend', ['mysql']),
  S('MongoDB', 'Backend', ['mongodb', 'mongo']),
  S('Redis', 'Backend', ['redis']),
  S('Kafka', 'Backend', ['kafka', 'event streaming']),
  S('Elasticsearch', 'Backend', ['elasticsearch', 'opensearch']),
  // Data
  S('SQL', 'Data', ['sql']),
  S('BigQuery', 'Data', ['bigquery', 'big query']),
  S('Snowflake', 'Data', ['snowflake']),
  S('dbt', 'Data', ['dbt']),
  S('Apache Spark', 'Data', ['apache spark', 'pyspark', 'spark sql'], ['Spark']),
  S('Airflow', 'Data', ['airflow', 'cloud composer', 'dagster', 'prefect']),
  S('Data Modeling', 'Data', ['data modeling', 'data modelling', 'dimensional modeling', 'star schema', 'data warehouse', 'data warehousing']),
  S('ETL / ELT', 'Data', ['etl', 'elt', 'data integration']),
  S('Data Pipelines', 'Data', ['data pipelines', 'data pipeline', 'streaming pipelines', 'batch pipelines']),
  S('Databricks', 'Data', ['databricks', 'delta lake']),
  S('Stream Processing', 'Data', ['flink', 'stream processing', 'apache beam', 'dataflow']),
  S('BI & Visualisation', 'Data', ['looker', 'tableau', 'power bi', 'looker studio', 'data studio']),
  S('Statistics', 'Data', ['statistics', 'statistical analysis', 'hypothesis testing', 'regression analysis']),
  S('Experimentation', 'Data', ['a/b testing', 'ab testing', 'experimentation', 'split testing']),
  S('Pandas', 'Data', ['pandas', 'numpy']),
  // Cloud & DevOps
  S('AWS', 'Cloud & DevOps', ['aws', 'amazon web services']),
  S('GCP', 'Cloud & DevOps', ['gcp', 'google cloud', 'google cloud platform']),
  S('Azure', 'Cloud & DevOps', ['azure']),
  S('Kubernetes', 'Cloud & DevOps', ['kubernetes', 'k8s', 'gke', 'eks', 'aks', 'helm']),
  S('Docker', 'Cloud & DevOps', ['docker', 'containers', 'containerization', 'containerisation']),
  S('Terraform', 'Cloud & DevOps', ['terraform', 'infrastructure as code', 'pulumi']),
  S('CI/CD', 'Cloud & DevOps', ['ci/cd', 'cicd', 'continuous integration', 'continuous delivery', 'github actions', 'jenkins', 'gitlab ci']),
  S('Linux', 'Cloud & DevOps', ['linux', 'unix', 'bash']),
  S('Observability', 'Cloud & DevOps', ['observability', 'prometheus', 'grafana', 'datadog', 'opentelemetry']),
  S('Site Reliability', 'Cloud & DevOps', ['sre', 'slos', 'slo', 'error budgets', 'site reliability']),
  S('Incident Management', 'Cloud & DevOps', ['incident management', 'on-call', 'oncall', 'postmortems', 'post-mortems']),
  S('Serverless', 'Cloud & DevOps', ['serverless', 'cloud functions', 'cloud run', 'aws lambda']),
  // Security
  S('Cloud Security', 'Security', ['cloud security', 'cspm', 'cloud security posture']),
  S('Application Security', 'Security', ['application security', 'appsec', 'secure code review', 'sast', 'dast', 'owasp']),
  S('Threat Modeling', 'Security', ['threat modeling', 'threat modelling']),
  S('SIEM', 'Security', ['siem', 'splunk', 'chronicle', 'security operations', 'soc']),
  S('Incident Response', 'Security', ['incident response', 'dfir', 'digital forensics']),
  S('Penetration Testing', 'Security', ['penetration testing', 'pentest', 'pentesting', 'red team', 'red teaming']),
  S('Identity & Access', 'Security', ['iam', 'identity and access management', 'identity & access', 'okta', 'sso']),
  S('Zero Trust', 'Security', ['zero trust', 'zero-trust', 'beyondcorp']),
  S('Security Compliance', 'Security', ['iso 27001', 'soc 2', 'soc2', 'nist', 'pci dss', 'pci-dss', 'nesa', 'uae ia']),
  S('Vulnerability Management', 'Security', ['vulnerability management', 'vulnerability scanning', 'patch management']),
  S('Network Security', 'Security', ['network security', 'firewalls', 'ids/ips', 'waf']),
  // Mobile
  S('iOS', 'Mobile', ['ios', 'uikit']),
  S('Swift', 'Mobile', ['swiftui'], ['Swift']),
  S('Android', 'Mobile', ['android', 'jetpack compose']),
  S('React Native', 'Mobile', ['react native', 'react-native']),
  S('Flutter', 'Mobile', ['flutter', 'dart']),
  // AI / ML
  S('Machine Learning', 'AI/ML', ['machine learning', 'ml', 'scikit-learn', 'sklearn', 'xgboost']),
  S('LLMs & GenAI', 'AI/ML', ['llm', 'llms', 'large language models', 'generative ai', 'genai', 'gen ai', 'prompt engineering', 'rag', 'retrieval-augmented generation']),
  S('PyTorch', 'AI/ML', ['pytorch']),
  S('TensorFlow', 'AI/ML', ['tensorflow', 'keras']),
  S('NLP', 'AI/ML', ['nlp', 'natural language processing']),
  S('Computer Vision', 'AI/ML', ['computer vision', 'opencv', 'image recognition']),
  S('MLOps', 'AI/ML', ['mlops', 'ml ops', 'model deployment', 'vertex ai', 'sagemaker', 'kubeflow']),
  // Design
  S('Figma', 'Design', ['figma', 'figjam']),
  S('Product Design', 'Design', ['product design', 'end-to-end design', 'ux design', 'ui design', 'ui/ux', 'ux/ui']),
  S('Design Systems', 'Design', ['design system', 'design systems', 'component library', 'component libraries']),
  S('UX Research', 'Design', ['ux research', 'user research', 'user interviews', 'research synthesis']),
  S('Usability Testing', 'Design', ['usability testing', 'usability studies']),
  S('Interaction Design', 'Design', ['interaction design', 'micro-interactions', 'microinteractions']),
  S('Prototyping', 'Design', ['prototyping', 'prototypes', 'protopie', 'framer']),
  S('Visual Design', 'Design', ['visual design', 'typography', 'iconography']),
  S('Motion Design', 'Design', ['motion design', 'after effects', 'lottie']),
  S('Information Architecture', 'Design', ['information architecture', 'user flows', 'journey mapping', 'wireframing', 'wireframes']),
  // Product
  S('Product Management', 'Product', ['product management', 'product ownership', 'product owner']),
  S('Roadmapping', 'Product', ['roadmap', 'roadmaps', 'roadmapping', 'prioritization', 'prioritisation']),
  S('Product Strategy', 'Product', ['product strategy', 'product vision', 'go-to-market', 'gtm']),
  S('Product Discovery', 'Product', ['product discovery', 'customer discovery', 'jobs to be done', 'jtbd']),
  S('Product Analytics', 'Product', ['product analytics', 'amplitude', 'mixpanel', 'funnel analysis', 'cohort analysis']),
  S('Stakeholder Management', 'Product', ['stakeholder management', 'stakeholders', 'cross-functional', 'cross functional']),
  S('Agile', 'Product', ['agile', 'scrum', 'kanban', 'sprint planning']),
  S('OKRs', 'Product', ['okrs', 'okr', 'kpis', 'north star metric']),
  S('Payments & Fintech', 'Product', ['payments', 'payment processing', 'card issuing', 'acquiring', 'fintech', 'open banking']),
  S('B2B SaaS', 'Product', ['b2b saas', 'saas']),
  // Sales
  S('B2B Sales', 'Sales', ['b2b sales', 'b2b']),
  S('Enterprise Sales', 'Sales', ['enterprise sales', 'enterprise accounts', 'strategic accounts', 'enterprise customers']),
  S('Solution Selling', 'Sales', ['solution selling', 'consultative selling', 'value selling']),
  S('Salesforce', 'Sales', ['salesforce', 'sfdc', 'crm']),
  S('Negotiation', 'Sales', ['negotiation', 'negotiating', 'closing deals', 'deal closing']),
  S('Pipeline Management', 'Sales', ['pipeline management', 'pipeline generation', 'sales forecasting', 'quota attainment', 'quota']),
  S('Prospecting', 'Sales', ['prospecting', 'outbound', 'cold calling', 'lead generation']),
  S('Account Management', 'Sales', ['account management', 'key accounts', 'upsell', 'cross-sell', 'renewals']),
  S('Sales Methodology', 'Sales', ['meddic', 'meddpicc', 'challenger sale', 'spin selling']),
  // Marketing
  S('Content Marketing', 'Marketing', ['content marketing', 'content strategy', 'editorial']),
  S('SEO', 'Marketing', ['seo', 'search engine optimization', 'sem']),
  S('Performance Marketing', 'Marketing', ['performance marketing', 'paid social', 'google ads', 'paid acquisition', 'ppc']),
  S('Brand Strategy', 'Marketing', ['brand strategy', 'branding', 'brand positioning', 'brand guidelines']),
  S('Copywriting', 'Marketing', ['copywriting', 'storytelling']),
  S('Marketing Automation', 'Marketing', ['marketing automation', 'hubspot', 'marketo', 'braze', 'lifecycle marketing']),
  S('Demand Generation', 'Marketing', ['demand generation', 'demand gen', 'abm', 'account-based marketing']),
  S('Social Media', 'Marketing', ['social media', 'community management']),
  // People
  S('Talent Acquisition', 'People', ['talent acquisition', 'recruiting', 'recruitment', 'full-cycle recruiting', 'sourcing', 'headhunting', 'linkedin recruiter']),
  S('Employer Branding', 'People', ['employer branding', 'employer brand', 'evp']),
  S('HR Business Partnering', 'People', ['hr business partner', 'hrbp', 'business partnering', 'people partner']),
  S('Employee Relations', 'People', ['employee relations', 'grievances', 'disciplinary', 'workplace investigations']),
  S('Compensation & Benefits', 'People', ['compensation & benefits', 'compensation and benefits', 'total rewards', 'comp & ben', 'compensation benchmarking', 'pay equity']),
  S('Learning & Development', 'People', ['learning and development', 'learning & development', 'l&d', 'training programs']),
  S('HRIS', 'People', ['hris', 'workday', 'successfactors', 'bamboohr', 'hibob']),
  S('Performance Management', 'People', ['performance management', 'performance reviews', 'calibration']),
  S('UAE Labour Law', 'People', ['uae labor law', 'uae labour law', 'labour law', 'labor law', 'mohre', 'wps', 'emiratisation', 'emiratization']),
  S('Organisational Design', 'People', ['organizational design', 'organisational design', 'org design', 'change management', 'workforce planning']),
  S('Structured Interviewing', 'People', ['structured interviewing', 'structured interviews', 'competency-based interviews', 'interview training']),
  // Finance
  S('Financial Modeling', 'Finance', ['financial modeling', 'financial modelling', 'valuation', 'dcf']),
  S('FP&A', 'Finance', ['fp&a', 'financial planning', 'budgeting', 'forecasting']),
  S('Accounting', 'Finance', ['accounting', 'ifrs', 'gaap', 'general ledger', 'month-end close', 'reconciliation']),
  S('Excel', 'Finance', ['microsoft excel', 'advanced excel', 'spreadsheets'], ['Excel']),
  S('Payroll', 'Finance', ['payroll']),
  S('Audit', 'Finance', ['internal audit', 'external audit', 'audit']),
  S('Tax & VAT', 'Finance', ['vat', 'corporate tax', 'transfer pricing']),
  S('ERP', 'Finance', ['erp', 'sap', 'oracle financials', 'netsuite']),
  S('Treasury', 'Finance', ['treasury', 'cash management', 'liquidity management']),
  // Operations
  S('Project Management', 'Operations', ['project management', 'pmp', 'prince2']),
  S('Program Management', 'Operations', ['program management', 'programme management', 'pmo']),
  S('Process Improvement', 'Operations', ['process improvement', 'lean', 'six sigma', 'continuous improvement', 'process optimization']),
  S('Vendor Management', 'Operations', ['vendor management', 'procurement', 'supplier management']),
  S('Customer Success', 'Operations', ['customer success', 'churn', 'nps', 'customer health', 'qbr', 'qbrs']),
  S('Customer Support', 'Operations', ['customer support', 'zendesk', 'intercom', 'service desk']),
  // Leadership
  S('People Management', 'Leadership', ['people management', 'line management', 'managing a team', 'manage a team', 'team leadership', 'led a team', 'lead a team', 'direct reports']),
  S('Mentoring', 'Leadership', ['mentoring', 'mentorship', 'coaching']),
  S('Team Building', 'Leadership', ['team building', 'building teams', 'grow the team', 'scale the team', 'scaling teams']),
  S('Strategic Planning', 'Leadership', ['strategic planning', 'business strategy']),
  // Languages
  S('Arabic', 'Languages', ['arabic']),
  S('French', 'Languages', ['french']),
  S('German', 'Languages', ['german']),
  S('Hindi', 'Languages', ['hindi']),
  S('Mandarin', 'Languages', ['mandarin']),
  S('Spanish', 'Languages', ['spanish']),
];

export const CATEGORY_DEPARTMENT: Record<SkillCategory, Department | null> = {
  Frontend: 'Engineering',
  Backend: 'Engineering',
  Engineering: 'Engineering',
  Data: 'Engineering',
  'Cloud & DevOps': 'Engineering',
  Security: 'IT & Security',
  Mobile: 'Engineering',
  'AI/ML': 'Engineering',
  Design: 'Design',
  Product: 'Product',
  Sales: 'Sales',
  Marketing: 'Marketing',
  People: 'People Ops',
  Finance: 'Finance',
  Operations: 'Operations',
  Leadership: null,
  Languages: null,
};

// ───────────────────────── compiled matchers ─────────────────────────
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface Compiled {
  def: SkillDef;
  ci: RegExp | null;
  cs: RegExp | null;
}

const COMPILED: Compiled[] = SKILLS.map((def) => {
  const ciTerms = [...new Set([def.label.toLowerCase(), ...def.aliases.map((a) => a.toLowerCase())])]
    .filter((t) => !def.cs.some((c) => c.toLowerCase() === t))
    .sort((a, b) => b.length - a.length);
  const ci = ciTerms.length ? new RegExp(`(?<![a-z0-9+#.])(?:${ciTerms.map(esc).join('|')})(?![a-z0-9+#]|\\.[a-z0-9])`, 'gi') : null;
  const cs = def.cs.length ? new RegExp(`(?<![A-Za-z0-9+#.])(?:${def.cs.map(esc).join('|')})(?![A-Za-z0-9+#-])`, 'g') : null;
  return { def, ci, cs };
});

const BY_LABEL = new Map(SKILLS.map((s) => [s.label.toLowerCase(), s]));
const BY_ALIAS = new Map<string, SkillDef>();
for (const s of SKILLS) {
  BY_ALIAS.set(s.label.toLowerCase(), s);
  for (const a of s.aliases) if (!BY_ALIAS.has(a.toLowerCase())) BY_ALIAS.set(a.toLowerCase(), s);
  for (const c of s.cs) if (!BY_ALIAS.has(c.toLowerCase())) BY_ALIAS.set(c.toLowerCase(), s);
}

/** Every taxonomy skill mentioned in `text`, with occurrence counts. */
export function findSkills(text: string): Map<string, number> {
  const found = new Map<string, number>();
  if (!text) return found;
  for (const { def, ci, cs } of COMPILED) {
    let n = 0;
    if (ci) n += text.match(ci)?.length ?? 0;
    if (cs) n += text.match(cs)?.length ?? 0;
    if (n) found.set(def.label, n);
  }
  return found;
}

/** Character ranges of skill mentions (for inline highlighting). Optionally limited to `labels`. */
export function skillRanges(text: string, labels?: ReadonlySet<string>): { start: number; end: number; label: string }[] {
  const out: { start: number; end: number; label: string }[] = [];
  if (!text) return out;
  for (const { def, ci, cs } of COMPILED) {
    if (labels && !labels.has(def.label)) continue;
    for (const re of [ci, cs]) {
      if (!re) continue;
      for (const m of text.matchAll(re)) out.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, label: def.label });
    }
  }
  return out.sort((a, b) => a.start - b.start || b.end - a.end);
}

/** Map any spelling ("reactjs", "K8s", "golang") to its canonical label, or null. */
export function canonicalSkill(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  const direct = BY_ALIAS.get(key);
  if (direct) return direct.label;
  const scan = findSkills(raw);
  return scan.size ? [...scan.keys()][0] : null;
}

/** Canonicalise and de-duplicate a list of skills (unknown skills are kept as typed). */
export function normalizeSkills(list: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const label = canonicalSkill(raw) ?? raw.trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

export function skillDef(label: string): SkillDef | undefined {
  return BY_LABEL.get(label.toLowerCase());
}

export function skillCategory(label: string): SkillCategory | undefined {
  return skillDef(label)?.category;
}

/** Suggestions for skill pickers. */
export function suggestSkills(query: string, exclude: string[] = [], limit = 8): string[] {
  const q = query.trim().toLowerCase();
  const ex = new Set(exclude.map((e) => e.toLowerCase()));
  if (!q) return [];
  const scored: { label: string; s: number }[] = [];
  for (const def of SKILLS) {
    if (ex.has(def.label.toLowerCase())) continue;
    const l = def.label.toLowerCase();
    let s = 0;
    if (l === q) s = 100;
    else if (l.startsWith(q)) s = 80;
    else if (l.includes(q)) s = 60;
    else if (def.aliases.some((a) => a.startsWith(q))) s = 50;
    else if (def.aliases.some((a) => a.includes(q))) s = 30;
    if (s) scored.push({ label: def.label, s });
  }
  return scored.sort((a, b) => b.s - a.s || a.label.localeCompare(b.label)).slice(0, limit).map((x) => x.label);
}

// ───────────────────────── role families ─────────────────────────
export interface RoleFamily {
  id: string;
  label: string;
  match: RegExp;
  department: Department;
  aliases: string[];
  /** Typical skills — used for sample prospects and as weak priors. */
  skills: string[];
  keywords: string[];
}

export const ROLE_FAMILIES: RoleFamily[] = [
  {
    id: 'eng-manager',
    label: 'Engineering Manager',
    match: /engineering manager|head of engineering|vp,? engineering|director of engineering|tech(nical)? lead/i,
    department: 'Engineering',
    aliases: ['Engineering Manager', 'Tech Lead', 'Head of Engineering', 'Software Engineering Manager'],
    skills: ['People Management', 'System Design', 'Distributed Systems', 'Team Building', 'Agile', 'Mentoring', 'Stakeholder Management'],
    keywords: ['engineering leadership'],
  },
  {
    id: 'security',
    label: 'Security Engineer',
    match: /secur|appsec|soc analyst|penetration|cyber|threat/i,
    department: 'IT & Security',
    aliases: ['Security Engineer', 'Cloud Security Engineer', 'Application Security Engineer', 'Cybersecurity Engineer', 'Security Analyst'],
    skills: ['Cloud Security', 'Application Security', 'Threat Modeling', 'Identity & Access', 'SIEM', 'Incident Response', 'Zero Trust', 'Kubernetes', 'AWS', 'GCP', 'Python', 'Security Compliance', 'Vulnerability Management', 'Terraform'],
    keywords: ['cloud security', 'detection & response'],
  },
  {
    id: 'sre',
    label: 'Site Reliability Engineer',
    match: /\bsre\b|site reliability|devops|infrastructure engineer|cloud engineer|platform reliability/i,
    department: 'Engineering',
    aliases: ['Site Reliability Engineer', 'DevOps Engineer', 'Infrastructure Engineer', 'Cloud Engineer', 'Platform Engineer'],
    skills: ['Kubernetes', 'Terraform', 'AWS', 'GCP', 'Linux', 'Observability', 'CI/CD', 'Docker', 'Incident Management', 'Go', 'Python', 'Site Reliability'],
    keywords: ['reliability', 'infrastructure'],
  },
  {
    id: 'data-sci',
    label: 'Machine Learning Engineer',
    match: /data scientist|machine learning|\bml engineer|ai engineer|applied scientist|research scientist/i,
    department: 'Engineering',
    aliases: ['Machine Learning Engineer', 'Data Scientist', 'Applied Scientist', 'AI Engineer'],
    skills: ['Python', 'Machine Learning', 'PyTorch', 'TensorFlow', 'LLMs & GenAI', 'NLP', 'Statistics', 'MLOps', 'SQL', 'Experimentation'],
    keywords: ['machine learning', 'generative ai'],
  },
  {
    id: 'data-eng',
    label: 'Data Engineer',
    match: /data engineer|analytics engineer|data platform|etl developer|big data/i,
    department: 'Engineering',
    aliases: ['Data Engineer', 'Analytics Engineer', 'Data Platform Engineer', 'Big Data Engineer'],
    skills: ['SQL', 'Python', 'Apache Spark', 'Airflow', 'dbt', 'BigQuery', 'Snowflake', 'Kafka', 'Data Modeling', 'ETL / ELT', 'Data Pipelines', 'GCP', 'AWS', 'Stream Processing'],
    keywords: ['data platform', 'lakehouse'],
  },
  {
    id: 'mobile',
    label: 'Mobile Engineer',
    match: /\bios\b|android|mobile (engineer|developer)|react native|flutter/i,
    department: 'Engineering',
    aliases: ['Mobile Engineer', 'iOS Engineer', 'Android Engineer', 'React Native Developer'],
    skills: ['Swift', 'iOS', 'Kotlin', 'Android', 'React Native', 'Flutter', 'TypeScript', 'Automated Testing'],
    keywords: ['mobile apps'],
  },
  {
    id: 'frontend',
    label: 'Frontend Engineer',
    match: /front[\s-]?end|\bui engineer|react (developer|engineer)|web (engineer|developer)/i,
    department: 'Engineering',
    aliases: ['Frontend Engineer', 'Front End Developer', 'UI Engineer', 'React Engineer', 'Software Engineer, Frontend'],
    skills: ['React', 'TypeScript', 'JavaScript', 'Next.js', 'HTML & CSS', 'Design Systems', 'Accessibility', 'GraphQL', 'Web Performance', 'Automated Testing', 'State Management', 'Vue'],
    keywords: ['web platform', 'design systems'],
  },
  {
    id: 'backend',
    label: 'Backend Engineer',
    match: /back[\s-]?end|api engineer|platform engineer|server[\s-]side/i,
    department: 'Engineering',
    aliases: ['Backend Engineer', 'Back End Developer', 'Platform Engineer', 'Software Engineer, Backend', 'API Engineer'],
    skills: ['Node.js', 'Go', 'Java', 'Python', 'PostgreSQL', 'Kafka', 'Microservices', 'Distributed Systems', 'REST APIs', 'Redis', 'Kubernetes', 'gRPC'],
    keywords: ['platform', 'apis'],
  },
  {
    id: 'fullstack',
    label: 'Full Stack Engineer',
    match: /full[\s-]?stack|software (engineer|developer)/i,
    department: 'Engineering',
    aliases: ['Full Stack Engineer', 'Full Stack Developer', 'Software Engineer', 'Product Engineer'],
    skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'REST APIs', 'GraphQL', 'AWS', 'Automated Testing'],
    keywords: ['product engineering'],
  },
  {
    id: 'researcher',
    label: 'UX Researcher',
    match: /ux researcher|user researcher|design researcher/i,
    department: 'Design',
    aliases: ['UX Researcher', 'User Researcher', 'Design Researcher'],
    skills: ['UX Research', 'Usability Testing', 'Product Discovery', 'Information Architecture', 'Statistics', 'Figma'],
    keywords: ['research ops'],
  },
  {
    id: 'designer',
    label: 'Product Designer',
    match: /product designer|ux designer|ui\/ux|ux\/ui|interaction designer|visual designer|experience designer/i,
    department: 'Design',
    aliases: ['Product Designer', 'UX Designer', 'UI/UX Designer', 'Interaction Designer', 'Experience Designer'],
    skills: ['Figma', 'Product Design', 'Prototyping', 'Design Systems', 'UX Research', 'Interaction Design', 'Usability Testing', 'Visual Design', 'Accessibility', 'Information Architecture'],
    keywords: ['design systems', 'growth design'],
  },
  {
    id: 'pm',
    label: 'Product Manager',
    match: /product manager|product owner|head of product|product lead|group product/i,
    department: 'Product',
    aliases: ['Product Manager', 'Senior Product Manager', 'Product Owner', 'Technical Product Manager'],
    skills: ['Product Management', 'Roadmapping', 'Product Strategy', 'Product Discovery', 'Product Analytics', 'Experimentation', 'Stakeholder Management', 'Agile', 'SQL', 'OKRs'],
    keywords: ['product-led growth'],
  },
  {
    id: 'recruiter',
    label: 'Talent Partner',
    match: /recruit|talent acquisition|talent partner|sourcer/i,
    department: 'People Ops',
    aliases: ['Talent Acquisition Partner', 'Recruiter', 'Technical Recruiter', 'Talent Partner', 'Sourcer'],
    skills: ['Talent Acquisition', 'Employer Branding', 'Structured Interviewing', 'Stakeholder Management', 'HRIS'],
    keywords: ['recruitment'],
  },
  {
    id: 'people-partner',
    label: 'People Partner',
    match: /people partner|hr business partner|hrbp|hr manager|people operations|human resources/i,
    department: 'People Ops',
    aliases: ['People Partner', 'HR Business Partner', 'HRBP', 'People Operations Manager'],
    skills: ['HR Business Partnering', 'Employee Relations', 'Performance Management', 'UAE Labour Law', 'Compensation & Benefits', 'Organisational Design', 'HRIS', 'Stakeholder Management'],
    keywords: ['people operations'],
  },
  {
    id: 'sales',
    label: 'Account Executive',
    match: /account executive|sales manager|business development|sales representative|sales director/i,
    department: 'Sales',
    aliases: ['Account Executive', 'Enterprise Account Executive', 'Business Development Manager', 'Sales Manager'],
    skills: ['B2B Sales', 'Enterprise Sales', 'Solution Selling', 'Salesforce', 'Negotiation', 'Pipeline Management', 'Prospecting', 'Account Management', 'Sales Methodology', 'Arabic'],
    keywords: ['b2b saas', 'enterprise software'],
  },
  {
    id: 'cs',
    label: 'Customer Success Manager',
    match: /customer success|technical account manager|customer support|support engineer/i,
    department: 'Customer Success',
    aliases: ['Customer Success Manager', 'Customer Success Lead', 'Technical Account Manager'],
    skills: ['Customer Success', 'Account Management', 'Salesforce', 'Stakeholder Management', 'Customer Support', 'Negotiation'],
    keywords: ['retention'],
  },
  {
    id: 'finance',
    label: 'Financial Analyst',
    match: /financ|fp&a|accountant|controller|treasury|audit/i,
    department: 'Finance',
    aliases: ['Financial Analyst', 'FP&A Analyst', 'Finance Business Partner', 'Senior Accountant'],
    skills: ['Financial Modeling', 'FP&A', 'Excel', 'Accounting', 'ERP', 'SQL', 'Tax & VAT', 'Audit'],
    keywords: ['fp&a'],
  },
  {
    id: 'marketing',
    label: 'Marketing Manager',
    match: /marketing|brand|content (lead|manager|strategist)|growth marketer|seo/i,
    department: 'Marketing',
    aliases: ['Marketing Manager', 'Growth Marketing Manager', 'Content Lead', 'Brand Manager'],
    skills: ['Content Marketing', 'SEO', 'Performance Marketing', 'Brand Strategy', 'Copywriting', 'Marketing Automation', 'Demand Generation', 'Social Media'],
    keywords: ['growth marketing'],
  },
  {
    id: 'ops',
    label: 'Operations Manager',
    match: /operations manager|program manager|programme manager|project manager|workplace|chief of staff/i,
    department: 'Operations',
    aliases: ['Operations Manager', 'Program Manager', 'Project Manager'],
    skills: ['Project Management', 'Program Management', 'Process Improvement', 'Vendor Management', 'Stakeholder Management'],
    keywords: ['operations'],
  },
];

export function detectRoleFamily(title: string): RoleFamily | null {
  if (!title) return null;
  return ROLE_FAMILIES.find((f) => f.match.test(title)) ?? null;
}

export function roleFamilyById(id: string): RoleFamily | undefined {
  return ROLE_FAMILIES.find((f) => f.id === id);
}
