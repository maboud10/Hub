/**
 * Seed catalog for Helix Academy:
 *  - 10 interactive courses (micro-lessons, branching workplace scenarios, graded quizzes)
 *  - 4 curated multi-course learning paths
 *  - Role & phase-aware onboarding training rules
 *  - Starter enrollments & verifiable certificates across NEXUS personas
 */
import { SEED_USERS } from '@/data/users';
import { addDaysISO, todayISO } from '@/hr/calendar';
import { ACADEMY_DATA_VERSION, buildCredentialCode } from './constants';
import type { AcademyData, Certificate, Course, Enrollment, LearningPath, OnboardingRule } from './types';

const DAY = 86_400_000;

export const SEED_COURSES: Course[] = [
  {
    id: 'c-sec-101',
    slug: 'security-zero-trust-essentials',
    title: 'Security & Zero-Trust Essentials',
    tagline: 'Passkeys, phishing defence, Vault hygiene & 15-minute incident reporting.',
    description:
      'Mandatory Day-1 security certification for everyone at Helix. Practice spotting targeted social engineering, securing credentials in Vault, and escalating incidents before blast radius grows.',
    track: 'security',
    level: 'foundations',
    format: 'certification',
    durationMins: 20,
    xp: 200,
    hue: 346,
    instructorId: 'u-layla',
    skills: ['Zero Trust', 'Passkeys & MFA', 'Incident Response'],
    mandatory: true,
    recertDays: 365,
    passScore: 80,
    featured: true,
    companionSlugs: ['passkeys-and-zero-trust', 'incident-response-and-phishing'],
    createdAt: Date.now() - 90 * DAY,
    updatedAt: Date.now() - 6 * DAY,
    lessons: [
      {
        id: 'sec-l1',
        kind: 'concept',
        title: 'Identity is the Perimeter: Passkeys & Least Privilege',
        durationMins: 6,
        summary: 'Why Helix enforces hardware-backed WebAuthn passkeys, time-boxed NEXUS grants, and device posture checks.',
        blocks: [
          {
            kind: 'paragraph',
            heading: 'Why passwords & SMS codes aren’t enough',
            text: 'Modern adversary-in-the-middle proxies capture passwords and six-digit TOTP codes in real time. WebAuthn passkeys bind authentication cryptographically to the genuine helix.co origin — a fake domain mathematically cannot replay them.',
          },
          {
            kind: 'callout',
            tone: 'policy',
            title: 'Information Security Policy v3',
            text: 'All production and corporate SSO sessions require a registered hardware or Touch ID passkey. Shared credentials belong exclusively in Vault — never in Pulse Chat, docs, or .env files.',
          },
          {
            kind: 'bullets',
            heading: 'Three habits of Zero-Trust at Helix',
            items: [
              'Request time-boxed app access (7 or 30 days) in NEXUS rather than permanent elevated privileges.',
              'Lock your screen (⌃⌘Q / Win+L) whenever stepping away — even in badge-controlled hubs.',
              'Store API keys and vendor logins in Vault collections, never in tickets or DMs.',
            ],
          },
          {
            kind: 'flashcheck',
            question: 'A teammate DMs you asking for a staging API key to unblock a hotfix. What is the safest 30-second move?',
            answer: 'Share the item via a scoped Vault link so access is encrypted, auditable, and revocable without leaving plaintext secrets in chat history.',
          },
        ],
        keyTakeaways: [
          'Passkeys eliminate credential phishing by binding to the exact domain.',
          'Prefer 7-day or 30-day NEXUS access grants for sensitive tools.',
          'Secrets live only in Vault — never in chat, email, or git.',
        ],
      },
      {
        id: 'sec-l2',
        kind: 'scenario',
        title: 'Scenario Lab: The Urgent “SSO Re-Verification” Ping',
        durationMins: 8,
        summary: 'Evaluate a realistic late-afternoon message and decide how to respond under pressure.',
        contextLabel: 'Thursday · 17:42 GST · Pulse Chat + Email',
        artifact: {
          kind: 'email',
          header: 'From: IT Identity Desk <it-security@helix-sso-verify.com> · Subject: [URGENT] Passkey sync expiring in 30 mins',
          body: 'Hi team — Following today’s Information Security v3 update, your laptop certificate will be revoked at 18:15 GST unless you re-bind your session at https://helix-sso-verify.com/rebind and approve the MFA push on your phone.',
        },
        prompt: 'You are wrapping up before a customer call. Which action protects both you and the wider team?',
        choices: [
          {
            id: 'c1',
            label: 'Click the link on mobile first to inspect the page before entering credentials.',
            optimal: false,
            impact: 'High risk · Exposes browser/device telemetry and risks accidental autofill.',
            feedback: 'Look closely at the sender domain: `helix-sso-verify.com` is a lookalike domain, and passkeys never require “approving an MFA push” on an external URL.',
          },
          {
            id: 'c2',
            label: 'Ignore and delete the email — since you didn’t click it, you are safe.',
            optimal: false,
            impact: 'Partial · Protects you, leaves colleagues exposed to the active campaign.',
            feedback: 'Not clicking is good, but silent deletion means Security Operations cannot block the domain before another teammate falls for it.',
          },
          {
            id: 'c3',
            label: 'Do not click; report via the #sec-incident / Phish-Report button within 15 minutes so SOC blocks the domain company-wide.',
            optimal: true,
            impact: 'Zero blast radius · SOC blocks domain & revokes any sibling sessions in <4 mins.',
            feedback: 'Spot on! Early reporting turns one person’s sharp eye into an instant shield for all 200+ colleagues — completely blameless.',
          },
        ],
      },
      {
        id: 'sec-l3',
        kind: 'concept',
        title: 'Data Classification & Blameless 15-Minute Escalation',
        durationMins: 6,
        summary: 'How we classify Public, Internal, Confidential, and Restricted data — and what to do if something slips.',
        blocks: [
          {
            kind: 'bullets',
            heading: 'Four data tiers in 60 seconds',
            items: [
              'Public: Approved marketing pages, open-source repos, published press releases.',
              'Internal: General playbooks, non-sensitive roadmaps, org announcements.',
              'Confidential: Customer metadata, architecture diagrams, vendor contracts.',
              'Restricted (L4+): Customer PII, payroll/compensation, production keys, unpublished financials.',
            ],
          },
          {
            kind: 'callout',
            tone: 'warning',
            title: 'Lost device or accidental share? Tell us fast — zero blame',
            text: 'Mistakes happen. Hiding them causes breaches. Ping Incident Command or IT Helpdesk within 15 minutes of noticing a lost phone/laptop, leaked token, or mis-addressed email.',
          },
        ],
        keyTakeaways: [
          'Restricted data never leaves governed Helix systems or approved enterprise AI endpoints.',
          'Report suspected incidents within 15 minutes — speed beats perfection.',
        ],
      },
    ],
    quiz: [
      {
        id: 'q1',
        prompt: 'Why are WebAuthn passkeys resistant to lookalike-domain phishing?',
        options: [
          'They rotate a 6-digit number every 30 seconds',
          'The browser cryptographically binds the signature to the exact legitimate domain origin',
          'They require a 24-character password alongside SMS',
          'They only work on office Wi-Fi',
        ],
        correctIndex: 1,
        explanation: 'Passkeys are origin-bound: even if an attacker builds a pixel-perfect clone on another domain, your authenticator refuses to sign.',
      },
      {
        id: 'q2',
        prompt: 'You accidentally paste a customer debug log containing emails into an external public tool. What should you do first?',
        options: [
          'Delete your browser history and hope nobody notices',
          'Wait until the weekly engineering retro to mention it',
          'Report it immediately (within 15 minutes) to Security / Incident Command so containment can start',
          'Email the customer directly from your personal account',
        ],
        correctIndex: 2,
        explanation: 'Blameless, rapid escalation lets Security revoke tokens, request vendor purge, and meet regulatory obligations.',
      },
      {
        id: 'q3',
        prompt: 'Which NEXUS access duration should you choose when covering a teammate’s analytics queue for one week?',
        options: ['Permanent role elevation', 'A time-boxed 7-day grant', 'Ask them for their password', 'Disable MFA temporarily'],
        correctIndex: 1,
        explanation: 'Time-boxed grants expire automatically when coverage ends, preventing privilege creep.',
      },
    ],
  },
  {
    id: 'c-ai-privacy',
    slug: 'ai-safety-and-data-privacy',
    title: 'AI Safety, Data Privacy & Responsible Prompting',
    tagline: 'Use generative AI boldly without exposing PII, secrets, or unverified claims.',
    description:
      'Required Week-1 training. Learn which AI tools are enterprise-governed at Helix, what never goes into an unvetted model, and how to verify AI outputs before shipping to customers.',
    track: 'ai',
    level: 'foundations',
    format: 'certification',
    durationMins: 18,
    xp: 180,
    hue: 192,
    instructorId: 'u-priya',
    skills: ['AI Governance', 'Data Privacy', 'Prompt Engineering'],
    mandatory: true,
    recertDays: 365,
    passScore: 80,
    companionSlugs: ['ai-safety-and-prompt-playbook'],
    createdAt: Date.now() - 60 * DAY,
    updatedAt: Date.now() - 8 * DAY,
    lessons: [
      {
        id: 'aip-l1',
        kind: 'concept',
        title: 'Green, Amber & Red Data in Generative AI',
        durationMins: 8,
        summary: 'Clear guardrails on enterprise Gemini / Vertex endpoints vs consumer AI tools.',
        blocks: [
          {
            kind: 'paragraph',
            heading: 'Enterprise Zero-Retention vs Consumer Training',
            text: 'Helix’s provisioned Gemini & Vertex AI workspaces run under zero-data-retention enterprise agreements — prompts never train public models. Unapproved consumer web chatbots do not offer that guarantee.',
          },
          {
            kind: 'callout',
            tone: 'policy',
            title: 'Never paste Restricted secrets anywhere',
            text: 'Production API keys, raw customer PII, compensation tables, and confidential HR cases must never be pasted into external prompts — scrub or synthesize sample data instead.',
          },
          {
            kind: 'code',
            label: 'Safe anonymised prompt pattern',
            code: '// Instead of pasting real customer records:\n"Given a JSON payload shaped { tenantTier: \'enterprise\', retryCount: number, region: \'me-central1\' }, suggest idempotent backoff logic..."',
          },
        ],
        keyTakeaways: [
          'Always use Helix SSO-backed enterprise AI tools for internal work.',
          'Replace real PII and keys with synthetic placeholders.',
          'Keep a human in the loop for legal, hiring, financial, and production changes.',
        ],
      },
      {
        id: 'aip-l2',
        kind: 'scenario',
        title: 'Scenario Lab: Summarising Candidate & Customer Feedback',
        durationMins: 10,
        summary: 'Choose the compliant workflow when synthesizing sensitive qualitative notes.',
        contextLabel: 'Week 1 · Product & People Workflow',
        artifact: {
          kind: 'document',
          header: 'CSV Export: 42 Enterprise Customer Escalations (includes contact names, phone numbers & contract values)',
          body: 'Goal: Cluster top 5 root causes for tomorrow’s product review.',
        },
        prompt: 'How do you accelerate this analysis with AI while staying 100% compliant?',
        choices: [
          {
            id: 'a1',
            label: 'Upload the raw CSV into a free personal browser extension to get instant charts.',
            optimal: false,
            impact: 'Policy breach · Leaks customer PII & contract values to third-party servers.',
            feedback: 'Free browser extensions frequently log payloads for model training.',
          },
          {
            id: 'a2',
            label: 'Strip PII columns (names/phones) and run the synthesis inside Helix’s enterprise Gemini workspace, then spot-check citations.',
            optimal: true,
            impact: 'Fast & compliant · Zero PII exposure + verified enterprise endpoint.',
            feedback: 'Exactly right: data minimisation + enterprise zero-retention + human verification gives you speed and trust.',
          },
          {
            id: 'a3',
            label: 'Avoid AI completely and spend two days tagging rows manually.',
            optimal: false,
            impact: 'Safe but unnecessarily slow · Misses approved enterprise tooling.',
            feedback: 'Helix encourages high-leverage AI use — that is why we provide governed enterprise endpoints!',
          },
        ],
      },
    ],
    quiz: [
      {
        id: 'q1',
        prompt: 'Which AI environment is approved for analysing internal (non-secret) Helix engineering and product docs?',
        options: [
          'Any free web chatbot signed in with a personal Gmail',
          'Helix’s SSO-governed enterprise Gemini / Vertex workspace with zero-training guarantees',
          'Unverified open-weights endpoints hosted on public demo servers',
          'Public pastebins with AI plugins',
        ],
        correctIndex: 1,
        explanation: 'Enterprise-provisioned endpoints enforce zero data retention, audit logging, and tenant isolation.',
      },
      {
        id: 'q2',
        prompt: 'Can an AI model make an automated final rejection decision on a job candidate or employee case at Helix?',
        options: [
          'Yes, if confidence is above 90%',
          'No — AI may assist with drafting and structured matching, while accountable humans make and own every people decision',
          'Yes, for junior roles only',
          'Only on Fridays',
        ],
        correctIndex: 1,
        explanation: 'Human-in-the-loop is mandatory for all hiring, performance, HR, legal, and customer-impacting decisions.',
      },
    ],
  },
  {
    id: 'c-ai-101',
    slug: 'ai-fundamentals-at-helix',
    title: 'AI Fundamentals & Agentic Workflows',
    tagline: 'From structured prompting and grounding to multi-step agent verification.',
    description:
      'Day-30 core certification for every Helix team member. Master context engineering, retrieval grounding (RAG), evaluation rubrics, and practical daily workflows across roles.',
    track: 'ai',
    level: 'foundations',
    format: 'certification',
    durationMins: 30,
    xp: 300,
    hue: 198,
    instructorId: 'u-priya',
    skills: ['Prompt Engineering', 'Agentic Workflows', 'Evaluation'],
    passScore: 75,
    featured: true,
    companionSlugs: ['ai-safety-and-prompt-playbook', 'engineering-architecture-overview'],
    createdAt: Date.now() - 45 * DAY,
    updatedAt: Date.now() - 3 * DAY,
    lessons: [
      {
        id: 'ai1-l1',
        kind: 'concept',
        title: 'Context Engineering: Role, Grounding, Constraints & Rubric',
        durationMins: 10,
        summary: 'Why clear inputs, explicit source documents, and output schemas outperform vague one-liners by 10×.',
        blocks: [
          {
            kind: 'paragraph',
            heading: 'Think like a clear tech lead, not a slot machine',
            text: 'Models cannot read unspoken team context. High-reliability prompts supply four ingredients: (1) Objective & audience, (2) Grounded reference text, (3) Explicit constraints & non-goals, and (4) Output format or self-check rubric.',
          },
          {
            kind: 'code',
            label: 'The R-G-C-O Blueprint',
            code: 'Role & Goal: Draft a customer-facing postmortem summary for enterprise admins.\nGrounding: Use ONLY the timeline facts below — mark anything unknown as [TBD].\nConstraints: Blameless tone, <180 words, plain English.\nOutput: { impact, rootCause, remediationSteps[], prevention }',
          },
          {
            kind: 'flashcheck',
            question: 'How do you stop an LLM from inventing policy numbers when answering handbook questions?',
            answer: 'Ground it on retrieved source passages (RAG), instruct it to answer strictly from those passages or say "Not covered in docs", and require inline citations.',
          },
        ],
        keyTakeaways: [
          'Grounding + explicit "say I don’t know" instructions dramatically cut hallucinations.',
          'Structured schemas make AI outputs composable and testable.',
        ],
      },
      {
        id: 'ai1-l2',
        kind: 'scenario',
        title: 'Scenario Lab: Designing a Reliable Triage Agent',
        durationMins: 10,
        summary: 'Pick the right architecture before shipping an internal workflow helper.',
        contextLabel: 'Cross-functional AI Guild Lab',
        prompt: 'Your team wants an agent that drafts replies to incoming vendor procurement questions and updates ticket tags. Which rollout design meets Helix’s bar?',
        choices: [
          {
            id: 'm1',
            label: 'Let the agent auto-send emails directly to vendors on day one to maximise time saved.',
            optimal: false,
            impact: 'High risk · Unreviewed commitments could bind Finance or Legal.',
            feedback: 'External commitments need human approval until accuracy is proven and bounded.',
          },
          {
            id: 'm2',
            label: 'Ground drafts on the Procurement Playbook, cite source sections, stage replies as drafts for 1-click human review, and track edit distance on a 30-case eval set.',
            optimal: true,
            impact: 'High leverage & safe · Saves 75% of drafting time with measurable quality.',
            feedback: 'Assistive draft mode + citations + a golden evaluation set is our gold-standard shipping pattern.',
          },
        ],
      },
      {
        id: 'ai1-l3',
        kind: 'concept',
        title: 'Small Golden Evals Beat Vibes',
        durationMins: 10,
        summary: 'How any PM, ops partner, or engineer can maintain a 25-example evaluation suite.',
        blocks: [
          {
            kind: 'bullets',
            heading: 'What belongs in your 25-row golden set',
            items: [
              '10 common happy-path requests you see every week.',
              '10 tricky edge cases (ambiguous dates, conflicting docs, missing fields).',
              '5 adversarial or out-of-scope prompts where the right answer is a polite refusal.',
            ],
          },
        ],
        keyTakeaways: ['25 real edge cases catch regressions far better than ad-hoc manual spot checks.'],
      },
    ],
    quiz: [
      {
        id: 'q1',
        prompt: 'What is the most effective way to prevent fabricated facts when answering internal policy questions with AI?',
        options: [
          'Set temperature to 2.0',
          'Ask the model to sound confident',
          'Retrieve authorised source passages (RAG), require inline citations, and instruct it to state when docs don’t cover the answer',
          'Use ALL CAPS in the prompt',
        ],
        correctIndex: 2,
        explanation: 'Retrieval grounding + citation enforcement + explicit abstention rules keep answers faithful to source truth.',
      },
      {
        id: 'q2',
        prompt: 'What should a 25-example golden evaluation set always include alongside normal requests?',
        options: [
          'Only 3-word prompts',
          'Ambiguous edge cases and out-of-scope prompts that test safe refusal',
          'Duplicate copies of the same question',
          'Production database passwords',
        ],
        correctIndex: 1,
        explanation: 'Edge cases and refusal cases verify that your workflow fails gracefully rather than confidently guessing.',
      },
      {
        id: 'q3',
        prompt: 'When launching an agent that communicates externally (e.g. vendors or candidates), how should actions be gated?',
        options: [
          'Auto-send immediately without logs',
          'Stage cited drafts for human review & explicit send confirmation, with full audit logging',
          'Run only from personal laptops',
          'Skip testing until customers complain',
        ],
        correctIndex: 1,
        explanation: 'Human-reviewed drafts give 80% of the speed gain while keeping accountability and tone rock-solid.',
      },
    ],
  },
  {
    id: 'c-culture-101',
    slug: 'life-at-helix-onboarding',
    title: 'How We Work at Helix: Culture, Rituals & Async Craft',
    tagline: 'Written-first decisions, high ownership, Dubai–London–Singapore collaboration & NEXUS mastery.',
    description:
      'Your warm welcome to Helix. Learn our core operating principles, how we run meetings across time zones without burnout, and where every tool & handbook lives.',
    track: 'onboarding',
    level: 'foundations',
    format: 'interactive',
    durationMins: 15,
    xp: 150,
    hue: 292,
    instructorId: 'u-sara',
    skills: ['Async Collaboration', 'Helix Culture', 'Written Communication'],
    passScore: 75,
    companionSlugs: ['first-week-at-helix', 'async-communication-charter'],
    createdAt: Date.now() - 80 * DAY,
    updatedAt: Date.now() - 10 * DAY,
    lessons: [
      {
        id: 'cul-l1',
        kind: 'concept',
        title: 'Written-First, Low-Ego, High-Velocity',
        durationMins: 8,
        summary: 'How teams from Accra to Dubai to Singapore ship together without 11pm status calls.',
        blocks: [
          {
            kind: 'paragraph',
            heading: 'Decisions live in docs, not just in whoever was on the call',
            text: 'Because Helix spans GMT to GMT+8, every meaningful proposal starts as a 1-page doc in the Knowledge Base. Teammates can read and comment asynchronously before live debate.',
          },
          {
            kind: 'bullets',
            heading: 'Four rituals you’ll meet in Week 1',
            items: [
              'Monday Async Intentions in Pulse Chat (3 bullets: shipping, unblocking, learning).',
              'Core overlap window: 11:00–15:00 GST reserved for collaborative huddles; mornings/late afternoons protected for deep Focus.',
              'Friday Demo Reel: 3-minute screen recordings of working software, designs, or process wins.',
              'Kudos Wall in NEXUS: celebrate craft, ownership, teamwork, innovation, and customer love.',
            ],
          },
        ],
        keyTakeaways: [
          'Write decisions down in Knowledge Base so every timezone has an equal voice.',
          'Use the NEXUS Focus Timer (`f`) to protect deep-work blocks.',
        ],
      },
      {
        id: 'cul-l2',
        kind: 'scenario',
        title: 'Scenario Lab: Cross-Timezone Architecture Trade-Off',
        durationMins: 7,
        summary: 'Pick the most inclusive, high-velocity way to align colleagues across Dubai, London & Singapore.',
        contextLabel: 'Week 2 · Cross-Hub Project Kickoff',
        prompt: 'You need sign-off from Mei in Singapore (GMT+8), Omar in Dubai (GMT+4), and Lucas in Berlin (GMT+1) by Wednesday. How do you run it?',
        choices: [
          {
            id: 'w1',
            label: 'Book a mandatory 60-minute live brainstorm at 22:30 Singapore time with no pre-read.',
            optimal: false,
            impact: 'Burnout & shallow feedback · Late-night surprise call with zero prep.',
            feedback: 'Unprepared late-night calls penalise remote hubs and favour whoever talks loudest.',
          },
          {
            id: 'w2',
            label: 'Publish a 1-page RFC in Knowledge Base with a clear recommendation + open questions 24h ahead, resolve 80% in comments, and hold a focused 20-min decision huddle in the overlap window.',
            optimal: true,
            impact: 'Fast, inclusive & documented · Decision is recorded for future hires too.',
            feedback: 'That’s the Helix way: async pre-read → focused overlap decision → living record.',
          },
        ],
      },
    ],
    quiz: [
      {
        id: 'q1',
        prompt: 'Where should lasting project decisions and runbooks be recorded so every timezone stays aligned?',
        options: ['Only in ephemeral DM threads', 'In the Helix Knowledge Base (`/wiki`) with an owner', 'Local desktop sticky notes', 'Verbal hallway chats'],
        correctIndex: 1,
        explanation: 'Living Knowledge Base pages make context searchable, citable by Nova Docs, and accessible across timezones.',
      },
      {
        id: 'q2',
        prompt: 'How can you signal deep-work time automatically in NEXUS?',
        options: ['Log out of your account', 'Start a Focus session (`f` or Command Palette) which sets your presence to Focusing', 'Delete Calendar', 'Turn off your monitor'],
        correctIndex: 1,
        explanation: 'The built-in Focus Engine updates your presence and protects uninterrupted maker time.',
      },
    ],
  },
  {
    id: 'c-eng-sec',
    slug: 'secure-engineering-production-readiness',
    title: 'Secure Engineering, CI/CD & Production Readiness',
    tagline: 'Canary deploys, feature flags, secret scanning, SLOs & blameless Sev-1 command.',
    description:
      'Day-30 core course for Engineering & IT. Walk through Helix’s production checklist, progressive rollouts, observability budgets, and how we lead calm incidents.',
    track: 'engineering',
    level: 'practitioner',
    format: 'workshop',
    durationMins: 35,
    xp: 350,
    hue: 148,
    instructorId: 'u-omar',
    skills: ['System Design', 'Incident Command', 'Production Readiness', 'Cloud Security'],
    passScore: 80,
    featured: true,
    companionSlugs: ['engineering-architecture-overview', 'production-deploy-and-incident-runbook'],
    createdAt: Date.now() - 50 * DAY,
    updatedAt: Date.now() - 4 * DAY,
    lessons: [
      {
        id: 'eng-l1',
        kind: 'concept',
        title: 'Progressive Delivery: Ship Small, Flag Everything, Watch Golden Signals',
        durationMins: 12,
        summary: 'How we deploy 40+ times a day with <0.1% change-failure rate.',
        blocks: [
          {
            kind: 'paragraph',
            heading: 'Decouple deploy from release',
            text: 'Every user-facing or schema-touching change lands behind a typed feature flag. Deploys roll out 1% → 10% → 50% → 100% with automated rollback if p99 latency or 5xx error budgets trip.',
          },
          {
            kind: 'code',
            label: 'Expand → Migrate → Contract for zero-downtime schemas',
            code: '1. Expand: Add nullable column / dual-write while old pods still run\n2. Backfill: Idempotent batch job with rate-limiting\n3. Switch reads: Flip feature flag & verify p99 + parity metrics\n4. Contract: Drop legacy column in a follow-up PR',
          },
        ],
        keyTakeaways: [
          'Never couple a risky migration and traffic cutover in a single irreversible step.',
          'Every service defines latency, availability, and saturation SLOs before GA.',
        ],
      },
      {
        id: 'eng-l2',
        kind: 'scenario',
        title: 'Scenario Lab: Checkout p99 Spikes 4 Minutes After Deploy',
        durationMins: 13,
        summary: 'You are on-call when error budget burn jumps 14× right after a release.',
        contextLabel: 'Sev-2 Alert · Incident Command',
        artifact: {
          kind: 'code',
          header: 'Alert: payments-api p99 latency 2,840ms (SLO < 350ms) · Started 4m after build #4812',
          body: 'Canary cohort (10% traffic) shows DB connection pool saturation=98%. Main cohort healthy.',
        },
        prompt: 'What is your first move in the first 3 minutes?',
        choices: [
          {
            id: 'e1',
            label: 'Dive into profiling SQL queries in production for 30 minutes while 10% of users time out.',
            optimal: false,
            impact: 'Prolonged customer pain · Violates “mitigate first, root-cause second”.',
            feedback: 'During an active incident, restoring customer health always comes before debugging clever root causes.',
          },
          {
            id: 'e2',
            label: 'Declare incident in Incident Command, flip the feature flag / halt & roll back canary #4812 immediately, verify p99 recovers, then investigate in staging.',
            optimal: true,
            impact: 'Customer impact <5 mins · Clean blameless postmortem follow-up.',
            feedback: 'Textbook incident response: stop the bleeding first via flag/rollback, communicate clearly, debug calmly.',
          },
        ],
      },
      {
        id: 'eng-l3',
        kind: 'concept',
        title: 'Blameless Postmortems & Action Items with Teeth',
        durationMins: 10,
        summary: 'Turning every surprise into systemic guardrails within 5 business days.',
        blocks: [
          {
            kind: 'callout',
            tone: 'insight',
            title: 'Human error is never the root cause — it’s the starting point',
            text: 'If a single mistyped command could drop a table, the bug is that our tooling allowed an unguarded destructive command without dry-run and peer confirmation.',
          },
        ],
        keyTakeaways: ['Every Sev-1/Sev-2 produces at least one automated guardrail, test, or alert improvement.'],
      },
    ],
    quiz: [
      {
        id: 'q1',
        prompt: 'When an alert fires minutes after a canary rollout and customer requests are failing, what comes first?',
        options: [
          'Write a 4-page root-cause analysis before touching anything',
          'Mitigate customer impact immediately (flip kill-switch / roll back canary) and declare in Incident Command',
          'Mute the alert channel for an hour',
          'Push an untested hotfix directly to main bypassing CI',
        ],
        correctIndex: 1,
        explanation: 'Mitigate first, investigate second: rolling back a 10% canary restores SLOs in seconds.',
      },
      {
        id: 'q2',
        prompt: 'Which pattern prevents downtime during breaking database schema changes while old and new pods run concurrently?',
        options: ['Drop and recreate the table at midnight', 'Expand → Dual-write/Backfill → Switch → Contract', 'Lock the database for 2 hours', 'Edit production rows manually'],
        correctIndex: 1,
        explanation: 'Expand-and-contract keeps every intermediate step backward-compatible and instantaneously reversible.',
      },
    ],
  },
  {
    id: 'c-mgr-hiring',
    slug: 'structured-hiring-and-bar-raising',
    title: 'Inclusive Hiring, Structured Interviews & Scorecards',
    tagline: 'Run fair, high-signal interviews in Talent Hub and eliminate gut-feel bias.',
    description:
      'Required license for Hiring Managers & Interviewers. Connects directly to Talent Hub: competency rubrics, legal & inclusive questions, independent scorecards, and four-eyes offer discipline.',
    track: 'leadership',
    level: 'practitioner',
    format: 'certification',
    durationMins: 25,
    xp: 260,
    hue: 252,
    instructorId: 'u-fatima',
    skills: ['Structured Interviewing', 'Inclusive Leadership', 'Talent Calibration'],
    passScore: 80,
    companionSlugs: ['structured-interviewing-and-hiring-guide', 'manager-30-60-90-guide'],
    createdAt: Date.now() - 55 * DAY,
    updatedAt: Date.now() - 5 * DAY,
    lessons: [
      {
        id: 'hir-l1',
        kind: 'concept',
        title: 'Evidence Over Vibes: Why Talent Hub Enforces Stage Gates',
        durationMins: 12,
        summary: 'How structured rubrics double predictive validity and give every candidate a fair shot.',
        blocks: [
          {
            kind: 'paragraph',
            heading: 'Independent scorecards before panel chat',
            text: 'Groupthink happens when the most senior interviewer speaks first in Slack. In Talent Hub, every interviewer submits their 1–4 competency scorecard independently before Debrief.',
          },
          {
            kind: 'bullets',
            heading: 'Three rules of a great Helix interview',
            items: [
              'Ask behavioural (“Tell me about a time…”) and work-sample questions tied to the requisition’s competencies.',
              'Write concrete evidence quotes in your scorecard — never “good culture fit” or “reminds me of my old team”.',
              'Leave 7 minutes at the end for the candidate’s questions — selling is mutual.',
            ],
          },
        ],
        keyTakeaways: [
          'Submit your Talent Hub scorecard within 24h without discussing ratings first.',
          'Evaluate “culture add & values alignment”, never personal similarity.',
        ],
      },
      {
        id: 'hir-l2',
        kind: 'scenario',
        title: 'Scenario Lab: Calibrating a Split Debrief Panel',
        durationMins: 13,
        summary: 'Spot confirmation bias in scorecard feedback before recording a Hire / No-Hire decision.',
        contextLabel: 'Talent Hub · Debrief Stage',
        artifact: {
          kind: 'message',
          header: 'Scorecard snippet on Candidate #4',
          body: 'Interviewer A (2/4 Mixed): “Solved the distributed cache problem cleanly, but took 20 seconds of silence to think before answering — felt slightly reserved compared to extroverted engineers.”',
        },
        prompt: 'As Hiring Manager leading the debrief, how do you handle Interviewer A’s concern?',
        choices: [
          {
            id: 'h1',
            label: 'Reject the candidate to be safe whenever any scorecard isn’t a 4/4.',
            optimal: false,
            impact: 'False negative · Penalises thoughtful communication style unrelated to job performance.',
            feedback: 'Pausing 20 seconds to think through distributed trade-offs is a strength, not a competency gap!',
          },
          {
            id: 'h2',
            label: 'Anchor back to the rubric: separate technical & collaboration evidence from personality style, and evaluate actual system-design depth across the loop.',
            optimal: true,
            impact: 'Fair, high-signal decision · Protects cognitive & cultural diversity.',
            feedback: 'Bravo! Structured debriefs separate rubric-aligned evidence from stylistic preferences.',
          },
        ],
      },
    ],
    quiz: [
      {
        id: 'q1',
        prompt: 'When should interviewers discuss their impression of a candidate with fellow panellists?',
        options: [
          'Immediately in Pulse Chat before writing anything down',
          'Only AFTER each interviewer has submitted their independent scorecard in Talent Hub',
          'During the candidate’s next interview',
          'Scorecards are optional',
        ],
        correctIndex: 1,
        explanation: 'Submitting scorecards independently prevents anchoring and authority bias.',
      },
      {
        id: 'q2',
        prompt: 'Why can’t the person who drafted an offer in Talent Hub also give the final People Ops approval?',
        options: [
          'Because the button is hidden on Tuesdays',
          'Four-eyes separation of duties prevents unilateral compensation errors or band overrides',
          'Only contractors approve offers',
          'Offers don’t need approval',
        ],
        correctIndex: 1,
        explanation: 'Four-eyes approval is enforced in the store and audited for compensation governance.',
      },
    ],
  },
  {
    id: 'c-prod-craft',
    slug: 'accessible-product-design-and-experimentation',
    title: 'Accessible Product Craft & High-Velocity Experimentation',
    tagline: 'WCAG AA interfaces, keyboard-first ergonomics & hypothesis-driven product bets.',
    description:
      'For Designers, PMs & Frontend Engineers. Build tactile interfaces that work effortlessly with keyboards, screen readers, reduced motion, and measurable product hypotheses.',
    track: 'product',
    level: 'practitioner',
    format: 'interactive',
    durationMins: 28,
    xp: 280,
    hue: 36,
    instructorId: 'u-sofia',
    skills: ['Accessibility', 'Design Systems', 'Experimentation', 'Product Discovery'],
    passScore: 75,
    companionSlugs: ['design-system-and-accessibility', 'experimentation-playbook'],
    createdAt: Date.now() - 40 * DAY,
    updatedAt: Date.now() - 7 * DAY,
    lessons: [
      {
        id: 'prd-l1',
        kind: 'concept',
        title: 'Accessibility Is Craft, Not a Post-Launch Checklist',
        durationMins: 14,
        summary: 'Focus traps, semantic landmarks, contrast tokens, and `prefers-reduced-motion` built into every component.',
        blocks: [
          {
            kind: 'bullets',
            heading: 'Non-negotiables in Helix UI',
            items: [
              'Every interactive element is reachable via Tab, announces its role/state (`aria-pressed`, `aria-expanded`), and shows a crisp `:focus-visible` ring.',
              'Modals and sheets trap focus and restore it to the trigger when closed with Escape.',
              'Colour is never the sole carrier of status — pair hues with icons and clear text labels.',
            ],
          },
        ],
        keyTakeaways: ['Keyboard + screen-reader ergonomics make interfaces faster for power users and accessible for everyone.'],
      },
      {
        id: 'prd-l2',
        kind: 'concept',
        title: 'Crisp Hypotheses & Guardrail Metrics',
        durationMins: 14,
        summary: 'Every experiment pairs a primary conversion metric with a quality guardrail.',
        blocks: [
          {
            kind: 'code',
            label: 'Hypothesis template',
            code: 'Because [observed user friction], changing [specific flow] for [segment] will lift [primary metric] by +X% without degrading [guardrail metric: latency / support tickets / 7-day retention].',
          },
        ],
        keyTakeaways: ['Never ship a growth win that silently hurts retention, trust, or accessibility.'],
      },
    ],
    quiz: [
      {
        id: 'q1',
        prompt: 'What must every modal or slide-over sheet do for keyboard users?',
        options: [
          'Disable the Escape key',
          'Trap Tab focus inside while open, close on Escape, and restore focus to the triggering element',
          'Require a mouse click on an X icon',
          'Auto-close after 3 seconds',
        ],
        correctIndex: 1,
        explanation: 'Focus trapping + Escape dismissal + focus restoration are foundational WCAG modal patterns.',
      },
      {
        id: 'q2',
        prompt: 'Why do Helix experiments define a guardrail metric alongside the primary metric?',
        options: [
          'To make dashboards look busier',
          'To ensure short-term conversion gains don’t degrade latency, accessibility, or long-term trust',
          'Because SQL requires two columns',
          'Guardrails are only for backend teams',
        ],
        correctIndex: 1,
        explanation: 'Guardrail metrics catch unintended harm early.',
      },
    ],
  },
  {
    id: 'c-respect-101',
    slug: 'workplace-respect-inclusion-speak-up',
    title: 'Workplace Respect, Psychological Safety & Speak-Up',
    tagline: 'Creating an environment where every voice is heard, respected, and safe.',
    description:
      'Universal Helix values training: micro-inclusions across global cultures, constructive dissent, bystander allyship, and confidential Speak-Up / Ask People Ops channels.',
    track: 'onboarding',
    level: 'foundations',
    format: 'scenario',
    durationMins: 16,
    xp: 160,
    hue: 315,
    instructorId: 'u-sara',
    skills: ['Psychological Safety', 'Inclusive Collaboration'],
    mandatory: true,
    recertDays: 365,
    passScore: 80,
    companionSlugs: ['code-of-conduct-and-speak-up'],
    createdAt: Date.now() - 70 * DAY,
    updatedAt: Date.now() - 12 * DAY,
    lessons: [
      {
        id: 'res-l1',
        kind: 'concept',
        title: 'Hard on Problems, Warm with People',
        durationMins: 8,
        summary: 'Psychological safety means rigorous debate without personal friction or retaliation.',
        blocks: [
          {
            kind: 'paragraph',
            heading: 'Disagree clearly, credit generously',
            text: 'High-performing teams challenge ideas early — especially junior engineers questioning senior architects — because everyone knows curiosity is rewarded and credit is shared.',
          },
          {
            kind: 'callout',
            tone: 'policy',
            title: 'Confidential Speak-Up & Zero Retaliation',
            text: 'Anyone can raise a confidential case via HR Portal → Ask People Ops (Confidential toggle). Only People Ops partners see confidential cases — never your manager.',
          },
        ],
        keyTakeaways: [
          'Critique ideas and trade-offs, never people.',
          'Confidential HR Portal cases are strictly isolated from managers and peers.',
        ],
      },
      {
        id: 'res-l2',
        kind: 'scenario',
        title: 'Scenario Lab: Active Allyship in a Hybrid Meeting',
        durationMins: 8,
        summary: 'Notice and redirect subtle interruption dynamics in real time.',
        contextLabel: 'Product Sync · Hybrid Room + Remote Dial-in',
        prompt: 'A remote new hire starts raising an edge case twice, gets talked over by two folks in the room, and goes quiet. What is the best move?',
        choices: [
          {
            id: 'r1',
            label: 'Message them privately after the meeting saying “sorry that room is loud”.',
            optimal: false,
            impact: 'Kind but misses the moment · The team loses their insight during the decision.',
            feedback: 'Private empathy helps, but amplifying in the room changes team norms immediately.',
          },
          {
            id: 'r2',
            label: 'Pause the room warmly: “Hold on one sec — Kwame was flagging an edge case I want to make sure we hear. Kwame, go ahead?”',
            optimal: true,
            impact: 'High psychological safety · Surfaces critical risk & reinforces hybrid norms.',
            feedback: 'Simple, warm amplification takes 5 seconds and sets the tone for the whole team.',
          },
        ],
      },
    ],
    quiz: [
      {
        id: 'q1',
        prompt: 'Who can view a case marked “Confidential” in HR Portal → Ask People Ops?',
        options: ['Everyone in your department', 'Your direct manager and buddy', 'Authorised People Ops partners only (never your manager)', 'All managers L3+'],
        correctIndex: 2,
        explanation: 'Confidential cases are access-controlled strictly to People Ops (`hr.people.manage`).',
      },
    ],
  },
  {
    id: 'c-ai-eng',
    slug: 'ai-native-engineering-gemini',
    title: 'AI-Native Engineering: Grounded Agents & Structured Outputs',
    tagline: 'Build resilient Gemini integrations with schema validation, fallbacks & latency budgets.',
    description:
      'Advanced workshop for engineers building AI features inside Helix products (like Talent Hub’s JD decoder & Cortex Q&A). Covers typed schemas, deterministic offline fallbacks, streaming UX, and token cost control.',
    track: 'ai',
    level: 'advanced',
    format: 'workshop',
    durationMins: 40,
    xp: 420,
    hue: 184,
    instructorId: 'u-priya',
    skills: ['TypeScript', 'Gemini API', 'System Design', 'Agentic Workflows'],
    passScore: 80,
    companionSlugs: ['ai-safety-and-prompt-playbook', 'engineering-architecture-overview'],
    createdAt: Date.now() - 25 * DAY,
    updatedAt: Date.now() - 2 * DAY,
    lessons: [
      {
        id: 'aie-l1',
        kind: 'concept',
        title: 'Typed JSON Schemas + Graceful Deterministic Fallbacks',
        durationMins: 20,
        summary: 'How Helix ships AI features that never blank-screen even if an upstream model times out.',
        blocks: [
          {
            kind: 'code',
            label: 'Resilient dual-engine pattern (used in Talent Hub)',
            code: 'export async function decodeBrief(raw: string): Promise<JobProfile> {\n  if (isGeminiConfigured()) {\n    try { return await geminiDecodeWithSchema(raw, JOB_SCHEMA, { timeoutMs: 8000 }); }\n    catch (err) { logTelemetry("ai.fallback", err); }\n  }\n  return deterministicRuleEngine(raw); // Instant offline guarantee\n}',
          },
        ],
        keyTakeaways: [
          'Always enforce response schemas and strict timeouts on model calls.',
          'Pair generative enrichment with deterministic guardrails so core workflows never break.',
        ],
      },
      {
        id: 'aie-l2',
        kind: 'concept',
        title: 'Permission-First Retrieval (ACL Filtering Before Generation)',
        durationMins: 20,
        summary: 'Never retrieve documents the session user lacks RBAC clearance to view.',
        blocks: [
          {
            kind: 'callout',
            tone: 'warning',
            title: 'Filter at retrieval time, never via prompt polite-requests',
            text: 'Telling an LLM “please ignore secret paragraphs” is not access control. Always filter candidate documents through `rbac.ts` / space permissions BEFORE passing context to the synthesiser.',
          },
        ],
        keyTakeaways: ['RBAC filtering happens in code before context assembly — prompts are UX, not security.'],
      },
    ],
    quiz: [
      {
        id: 'q1',
        prompt: 'Where must permission checks happen in a RAG / Q&A system like Nova Docs?',
        options: [
          'In the system prompt (“do not mention restricted docs”)',
          'In application/server code BEFORE candidate chunks are retrieved or passed to the model',
          'In CSS (`display: none`)',
          'After the answer is emailed',
        ],
        correctIndex: 1,
        explanation: 'Only pre-retrieval ACL enforcement guarantees unauthorized content can never leak into model context.',
      },
    ],
  },
  {
    id: 'c-mgr-lead',
    slug: 'leading-high-trust-teams-30-60-90',
    title: 'Leading High-Trust Teams: 1:1s, Coaching & Day-90 Onboarding',
    tagline: 'Turn new hires into confident owners and run 1:1s people actually look forward to.',
    description:
      'Practical leadership toolkit for Helix managers: designing 30/60/90 onboarding plans, coaching vs micromanaging, fair leave & wellbeing support, and actionable feedback.',
    track: 'leadership',
    level: 'practitioner',
    format: 'interactive',
    durationMins: 24,
    xp: 240,
    hue: 266,
    instructorId: 'u-aisha',
    skills: ['Coaching', 'Onboarding Leadership', 'Feedback'],
    passScore: 75,
    companionSlugs: ['manager-30-60-90-guide', 'onboarding-buddy-playbook'],
    createdAt: Date.now() - 35 * DAY,
    updatedAt: Date.now() - 5 * DAY,
    lessons: [
      {
        id: 'mgl-l1',
        kind: 'concept',
        title: 'The 30 / 60 / 90 Arc: Learn → Contribute → Own',
        durationMins: 12,
        summary: 'Setting crystal-clear milestones before Day 1 so new hires feel momentum, not ambiguity.',
        blocks: [
          {
            kind: 'bullets',
            heading: 'What great looks like at each horizon',
            items: [
              'Days 1–30 (Learn): Absorb domain context, complete core Academy certifications, pair with buddy, and ship one small low-risk win in production.',
              'Days 31–60 (Contribute): Lead a scoped feature or workflow end-to-end with light scaffolding.',
              'Days 61–90 (Own): Drive a problem from framing to measurable outcome and propose one improvement to team playbooks.',
            ],
          },
        ],
        keyTakeaways: [
          'Pair every new hire with a peer Buddy outside their reporting line before Day 1.',
          'Protect 70% of 1:1 time for growth, blockers, and energy — not ticket status.',
        ],
      },
      {
        id: 'mgl-l2',
        kind: 'concept',
        title: 'Privacy-Respecting Care: Pulse Check-Ins & Time Off',
        durationMins: 12,
        summary: 'How managers support wellbeing while respecting HR Portal privacy boundaries.',
        blocks: [
          {
            kind: 'callout',
            tone: 'insight',
            title: 'Why onboarding pulse scores stay with People Ops',
            text: 'Candid feedback requires safety. Managers see onboarding comments only when the new hire opts in to share — treat shared notes with gratitude and curiosity.',
          },
        ],
        keyTakeaways: ['Approve time off promptly and model healthy disconnection yourself.'],
      },
    ],
    quiz: [
      {
        id: 'q1',
        prompt: 'Who makes the most effective onboarding buddy for a new hire?',
        options: [
          'Their hiring manager',
          'A welcoming peer outside the reporting line who can answer “silly” day-to-day questions safely',
          'An external vendor',
          'Nobody — docs are enough',
        ],
        correctIndex: 1,
        explanation: 'A peer buddy gives psychological safety for informal questions while the manager focuses on role clarity and coaching.',
      },
    ],
  },
];

export const SEED_PATHS: LearningPath[] = [
  {
    id: 'path-onboarding',
    slug: 'new-hire-day-30-foundations',
    title: 'New-Hire Foundations (Day 1 → Day 30)',
    tagline: 'Everything every new Helixian completes in their first 30 days — synced live with HR Onboarding.',
    description: 'Covers zero-trust security, culture & async rituals, workplace respect, AI data privacy, and AI fundamentals.',
    track: 'onboarding',
    hue: 292,
    badgeTitle: 'Helix Certified Joiner',
    targetAudience: 'All new hires (Days 1–30)',
    courseIds: ['c-sec-101', 'c-culture-101', 'c-ai-privacy', 'c-respect-101', 'c-ai-101'],
  },
  {
    id: 'path-ai-builder',
    slug: 'ai-native-builder-track',
    title: 'AI-Native Builder Track',
    tagline: 'Go from responsible prompting to shipping schema-validated Gemini agents in production.',
    description: 'Master safe enterprise prompting, evaluation sets, permission-first RAG, and resilient dual-engine architectures.',
    track: 'ai',
    hue: 192,
    badgeTitle: 'AI Vanguard',
    targetAudience: 'Engineers, PMs & Data Builders',
    courseIds: ['c-ai-privacy', 'c-ai-101', 'c-ai-eng'],
  },
  {
    id: 'path-eng-excellence',
    slug: 'production-engineering-mastery',
    title: 'Production & Security Engineering',
    tagline: 'Zero-trust identity, progressive delivery, incident command, and accessible frontend craft.',
    description: 'The complete technical bar for shipping resilient, accessible, secure systems at Helix.',
    track: 'engineering',
    hue: 148,
    badgeTitle: 'Production Guardian',
    targetAudience: 'Engineering, Design & IT',
    courseIds: ['c-sec-101', 'c-eng-sec', 'c-prod-craft'],
  },
  {
    id: 'path-people-leader',
    slug: 'people-leader-and-hiring-license',
    title: 'People Leader & Hiring License',
    tagline: 'Structured interviewing in Talent Hub, 30/60/90 onboarding leadership, and psychological safety.',
    description: 'Unlocks calibrated interviewing and equips managers to lead high-trust global teams.',
    track: 'leadership',
    hue: 252,
    badgeTitle: 'Calibrated People Leader',
    targetAudience: 'Managers & Interview Panellists',
    courseIds: ['c-respect-101', 'c-mgr-hiring', 'c-mgr-lead'],
  },
];

export const SEED_ONBOARDING_RULES: OnboardingRule[] = [
  {
    id: 'rule-sec-d1',
    courseId: 'c-sec-101',
    phase: 'day-1',
    dueOffsetDays: 0,
    departments: [],
    roleIds: [],
    enabled: true,
    rationale: 'Day-1 zero-trust & passkey certification (auto-ticks Day-1 onboarding task).',
  },
  {
    id: 'rule-culture-w1',
    courseId: 'c-culture-101',
    phase: 'week-1',
    dueOffsetDays: 3,
    departments: [],
    roleIds: [],
    enabled: true,
    rationale: 'Async rituals, core overlap hours & Knowledge Base norms in Week 1.',
  },
  {
    id: 'rule-privacy-w1',
    courseId: 'c-ai-privacy',
    phase: 'week-1',
    dueOffsetDays: 4,
    departments: [],
    roleIds: [],
    enabled: true,
    rationale: 'Enterprise AI guardrails & data classification (auto-ticks Week-1 onboarding task).',
  },
  {
    id: 'rule-respect-w1',
    courseId: 'c-respect-101',
    phase: 'week-1',
    dueOffsetDays: 6,
    departments: [],
    roleIds: [],
    enabled: true,
    rationale: 'Psychological safety, allyship & confidential Speak-Up awareness.',
  },
  {
    id: 'rule-ai-d30',
    courseId: 'c-ai-101',
    phase: 'day-30',
    dueOffsetDays: 28,
    departments: [],
    roleIds: [],
    enabled: true,
    rationale: 'Day-30 AI Fundamentals certification (auto-ticks Day-30 onboarding task).',
  },
  {
    id: 'rule-eng-d30',
    courseId: 'c-eng-sec',
    phase: 'day-30',
    dueOffsetDays: 30,
    departments: ['Engineering', 'IT & Security'],
    roleIds: ['engineering'],
    enabled: true,
    rationale: 'Production readiness, canary deploys & Sev-1 runbook for technical joiners.',
  },
  {
    id: 'rule-prod-d30',
    courseId: 'c-prod-craft',
    phase: 'day-30',
    dueOffsetDays: 30,
    departments: ['Design', 'Product'],
    roleIds: [],
    enabled: true,
    rationale: 'WCAG AA accessibility & hypothesis-driven experimentation for Product/Design joiners.',
  },
  {
    id: 'rule-mgr-d30',
    courseId: 'c-mgr-hiring',
    phase: 'day-30',
    dueOffsetDays: 21,
    departments: [],
    roleIds: ['manager', 'people-ops'],
    enabled: true,
    rationale: 'Structured interviewing & Talent Hub calibration license for people leaders.',
  },
];

export function createAcademySeed(now = Date.now()): AcademyData {
  const courses = structuredClone(SEED_COURSES);
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const enrollments: Enrollment[] = [];
  const certificates: Certificate[] = [];
  const today = todayISO(now);

  const addCompleted = (
    userId: string,
    courseId: string,
    daysAgo: number,
    opts: { score?: number; source?: Enrollment['source']; journeyId?: string; required?: boolean } = {},
  ) => {
    const c = courseById.get(courseId)!;
    const completedAt = now - daysAgo * DAY;
    const score = opts.score ?? 100;
    enrollments.push({
      id: `enr-${userId}-${courseId}`,
      userId,
      courseId,
      status: 'completed',
      required: opts.required ?? !!c.mandatory,
      source: opts.source ?? (c.mandatory ? 'compliance' : 'self'),
      assignedAt: completedAt - 5 * DAY,
      journeyId: opts.journeyId,
      completedLessonIds: c.lessons.map((l) => l.id),
      scenarioAnswers: Object.fromEntries(
        c.lessons
          .filter((l) => l.kind === 'scenario')
          .map((l) => [l.id, l.choices.find((ch) => ch.optimal)?.id ?? l.choices[0].id]),
      ),
      lastLessonId: c.lessons[c.lessons.length - 1]?.id,
      bestQuizScore: score,
      attempts: 1,
      startedAt: completedAt - 2 * 3_600_000,
      completedAt,
      notes: {},
    });
    const cred = buildCredentialCode(userId, courseId, completedAt);
    certificates.push({
      id: `cert-${userId}-${courseId}`,
      credentialCode: cred.code,
      verificationHash: cred.hash,
      userId,
      courseId,
      courseTitle: c.title,
      track: c.track,
      score,
      xpEarned: c.xp,
      skills: c.skills,
      issuedAt: completedAt,
      expiresAt: c.recertDays ? completedAt + c.recertDays * DAY : undefined,
      issuedBy: 'Helix Academy',
    });
  };

  const addActive = (
    userId: string,
    courseId: string,
    opts: {
      required: boolean;
      source: Enrollment['source'];
      dueInDays?: number;
      lessonsDone?: number;
      journeyId?: string;
      assignedBy?: string;
      note?: string;
    },
  ) => {
    const c = courseById.get(courseId)!;
    const doneCount = opts.lessonsDone ?? 0;
    const doneIds = c.lessons.slice(0, doneCount).map((l) => l.id);
    enrollments.push({
      id: `enr-${userId}-${courseId}`,
      userId,
      courseId,
      status: doneCount > 0 ? 'in-progress' : 'assigned',
      required: opts.required,
      source: opts.source,
      assignedBy: opts.assignedBy,
      assignedAt: now - 10 * DAY,
      dueDate: opts.dueInDays !== undefined ? addDaysISO(today, opts.dueInDays) : undefined,
      journeyId: opts.journeyId,
      note: opts.note,
      completedLessonIds: doneIds,
      scenarioAnswers: {},
      lastLessonId: c.lessons[Math.min(doneCount, c.lessons.length - 1)]?.id,
      attempts: 0,
      startedAt: doneCount > 0 ? now - 2 * DAY : undefined,
      notes:
        userId === 'u-kwame' && courseId === 'c-ai-101'
          ? { 'ai1-l1': 'Great R-G-C-O prompt pattern — want to apply this to our dbt lineage descriptions!' }
          : {},
    });
  };

  // 1. Kwame Mensah (u-kwame, Day 26 new hire in j-2):
  //    Completed Day-1 & Week-1 onboarding trainings; actively finishing Day-30 courses!
  addCompleted('u-kwame', 'c-sec-101', 25, { score: 100, source: 'onboarding', journeyId: 'j-2', required: true });
  addCompleted('u-kwame', 'c-culture-101', 23, { score: 100, source: 'onboarding', journeyId: 'j-2', required: true });
  addCompleted('u-kwame', 'c-ai-privacy', 22, { score: 100, source: 'onboarding', journeyId: 'j-2', required: true });
  addCompleted('u-kwame', 'c-respect-101', 20, { score: 100, source: 'onboarding', journeyId: 'j-2', required: true });
  addActive('u-kwame', 'c-ai-101', {
    required: true,
    source: 'onboarding',
    dueInDays: 2,
    lessonsDone: 2,
    journeyId: 'j-2',
    note: 'Day-30 onboarding milestone — passing the quiz auto-completes your HR onboarding task!',
  });
  addActive('u-kwame', 'c-eng-sec', {
    required: true,
    source: 'onboarding',
    dueInDays: 4,
    lessonsDone: 1,
    journeyId: 'j-2',
    assignedBy: 'u-omar',
    note: 'Engineering Day-30 readiness before joining the primary on-call rotation.',
  });

  // 2. Sara Al Mansoori (u-sara, People Ops):
  addCompleted('u-sara', 'c-sec-101', 42, { score: 100 });
  addCompleted('u-sara', 'c-ai-privacy', 38, { score: 100 });
  addCompleted('u-sara', 'c-respect-101', 35, { score: 100 });
  addCompleted('u-sara', 'c-mgr-hiring', 28, { score: 100, source: 'self' });
  addCompleted('u-sara', 'c-mgr-lead', 19, { score: 100, source: 'self' });
  addActive('u-sara', 'c-ai-101', { required: false, source: 'self', lessonsDone: 1 });

  // 3. Omar Khalid (u-omar, Engineering Manager):
  addCompleted('u-omar', 'c-sec-101', 50, { score: 100 });
  addCompleted('u-omar', 'c-ai-privacy', 44, { score: 100 });
  addCompleted('u-omar', 'c-respect-101', 40, { score: 100 });
  addCompleted('u-omar', 'c-eng-sec', 30, { score: 100, source: 'self' });
  addCompleted('u-omar', 'c-mgr-hiring', 32, { score: 100, source: 'compliance', required: true });
  addActive('u-omar', 'c-mgr-lead', { required: false, source: 'self', lessonsDone: 1 });

  // 4. Mei Tanaka (u-mei, Product Designer — has 1 compliance recertification due soon + active Product course):
  addCompleted('u-mei', 'c-ai-privacy', 31, { score: 100 });
  addCompleted('u-mei', 'c-respect-101', 29, { score: 100 });
  addCompleted('u-mei', 'c-culture-101', 120, { score: 100, source: 'self' });
  addActive('u-mei', 'c-sec-101', {
    required: true,
    source: 'compliance',
    dueInDays: 5,
    lessonsDone: 1,
    note: 'Annual Security v3 recertification (includes new Passkeys module).',
  });
  addActive('u-mei', 'c-prod-craft', { required: false, source: 'self', lessonsDone: 1 });

  // 5. Baseline compliance across remaining full-time staff so L&D compliance stats are rich & realistic:
  for (const u of SEED_USERS) {
    if (!u.active || u.roleIds.includes('contractor')) continue;
    if (['u-kwame', 'u-sara', 'u-omar', 'u-mei'].includes(u.id)) continue;
    addCompleted(u.id, 'c-sec-101', 35 + (u.avatarHue % 40), { score: 100 });
    addCompleted(u.id, 'c-respect-101', 30 + (u.avatarHue % 30), { score: 100 });
    if (u.id === 'u-lucas') {
      // One overdue item on Omar's team so Team & Compliance view showcases overdue nudges!
      addActive('u-lucas', 'c-ai-privacy', {
        required: true,
        source: 'compliance',
        dueInDays: -2,
        lessonsDone: 1,
        note: 'Annual AI & Data Privacy compliance.',
      });
    } else {
      addCompleted(u.id, 'c-ai-privacy', 25 + (u.avatarHue % 25), { score: 100 });
    }
    if (u.id === 'u-priya') {
      addCompleted('u-priya', 'c-ai-101', 20, { score: 100, source: 'self' });
      addCompleted('u-priya', 'c-ai-eng', 12, { score: 100, source: 'self' });
      addCompleted('u-priya', 'c-eng-sec', 28, { score: 100, source: 'self' });
    }
  }

  return {
    version: ACADEMY_DATA_VERSION,
    courses,
    paths: structuredClone(SEED_PATHS),
    enrollments,
    certificates,
    rules: structuredClone(SEED_ONBOARDING_RULES),
  };
}
