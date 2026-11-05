# NEXUS · Employee Hub

A futuristic, **permission-controlled** employee hub: a launchpad of app tiles that adapts to each person's role, with an admin Control Center, a ⌘K assistant, team widgets and a fully responsive, installable (PWA) mobile experience.

```bash
npm install
npm run dev        # http://localhost:5180 (also exposed on your LAN for phone testing)
npm test           # permission engine + enforcement tests
npm run build      # type-check + production build
```

Sign in by picking a **demo persona** — each holds different roles so you can watch tiles, menus and admin powers change:

| Persona | Roles | Clearance | Try this |
|---|---|---|---|
| Layla Haddad | System Admin | L5 | Edit the permission matrix, register an app, export the audit log |
| Sara Al Mansoori | People Ops + Employee | L4 | See unredacted employee data; try (and fail) to grant System Admin |
| Omar Khalid | Manager + Engineering + Employee | L3 | Approve Alex's DevHub request from the review queue |
| Daniel Okafor | Finance + Employee | L3 | Finance stack; pending Cloud Console request |
| Mei Tanaka | Employee | L2 | Temporary "Insights" grant with a live expiry countdown |
| Alex Rivera | Contractor | L1 | Locked tiles → request access; People directory is off-limits |

Switch persona anytime from the user menu (or ⌘K → "Switch persona").

## Features

**Launchpad**
- Tiles in three variants: rich cards (desktop, cursor spotlight + 3D tilt), phone-style icon grid (mobile), and list rows
- Pinned dock with macOS-style magnification, drag-to-reorder (touch: long-press), `1–9` hotkeys
- Long-press / right-click any tile for details, quick actions and pinning
- Secure **launch sequence** (identity → clearance → session) into an app window with SSO hand-off
- App Directory with intent-aware search ("vacation" → HR Portal, "password" → IT Helpdesk), category grouping, Mine/Requestable filters

**Permission control**
- RBAC with permission strings (`hub.users.manage`, `app:payroll`), wildcards (`*`, `app:*`), multi-role users and **clearance levels L1–L5**
- **Time-boxed grants** (7/30/90 days or permanent) that expire automatically — tiles re-lock live
- **Request access** flow on locked tiles with justification, duration, reviewer routing and pending state
- **Delegated approval** (reviewers can only approve access they hold), **separation of duties** (no self-approval), **anti-escalation** (you can't assign roles above your clearance or grant what you don't hold), **lockout protection** (last admin can't be removed)
- "Why do I have access?" transparency on every app; redacted sensitive fields in the directory
- Discoverable vs hidden apps; disabled apps visible only to app managers
- Every decision (including **denied attempts**) written to an exportable audit log

**Control Center** (permission-gated tabs): overview & security insights, access-request queue with risk scoring, user & role assignment, live permission matrix, app catalog management (register apps with live preview), audit log with CSV export.

**Team & personal**: time-aware hero with Nova assistant, live agenda with Join, focus timer that auto-sets your status, newsroom with audience targeting & reactions, anonymous team pulse, kudos wall with confetti, system status with uptime bars, celebrations, notifications center, people directory with live local times.

**Experience**: dark/light/system themes, 5 dual-tone accents, compact density, reduced-motion & ambient toggles, customizable home widgets, global keyboard shortcuts (`⌘K`, `/`, `g h`, `g a`, `t`, `f`, `?`), skip link, focus traps, ARIA roles, PWA manifest, safe-area aware mobile layout.

## Talent Hub (`/talent`) + HR Portal onboarding (`/hr`)

A step-by-step hiring system from job description to day 90, running inside NEXUS with the same sign-in, roles, notifications and audit log.

- **AI Sourcing studio**: drop a JD (PDF / Word / text) → the AI decodes its "Search DNA" (skills, seniority, location, salary, JD health & inclusive-language flags) → ranks your existing talent pool with explainable match scores → builds LinkedIn Recruiter Boolean, people-search and Google X-ray searches → drafts personalised LinkedIn connection notes / InMails / emails for everyone you pick.
- **LinkedIn (assisted mode)**: one-click searches, AI-drafted messages you copy & send, profile import from a URL or LinkedIn "Save to PDF". The prospect feed is a clearly labelled sample; the connector can switch to LinkedIn Recruiter System Connect later.
- **Pipeline**: Sourced → Engaged → Interested → Screen → Interviews → Debrief → Offer → Hired, with **stage gates** (outreach logged, interest + consent, screen booked, scorecards in, hire decision, accepted offer), recruiter overrides that are audited, SLA tracking and a "next best action" on every card.
- **Requisitions** with a guided creation wizard and headcount approval; **interviews** with smart slot suggestions and structured scorecards; **offers** with salary-band guardrails and a two-step, four-eyes approval chain.
- **Hand-off to HR Portal**: an accepted offer creates an onboarding journey (pre-boarding → day 1 → week 1 → 30/60/90 days) with owners (People Ops, IT, manager, buddy, new hire) and one-click NEXUS account provisioning.
- **AI**: Gemini via Firebase AI Logic when configured, with a built-in offline engine as automatic fallback (the default today).
- **Data**: local by default, already shaped for the `talenthub` Firestore database. Production kit: [`firestore/README.md`](firestore/README.md) (rules, indexes, provisioning scripts, go-live checklist).

Try it: **Sara** (recruiter lens: source from a JD, approve Rania's offer, record Amelia's acceptance → hire → onboarding), **Omar** (hiring-manager lens: scorecard + hire decision, compensation redacted), **Mei** (no Talent access, but sees Salma's onboarding as her buddy).

### HR Portal (`/hr`): people-first, from offer to day 90

- **My HR**: a personal dashboard of next steps (sign documents, re-acknowledge updated policies, enrol in benefits before the deadline, new-hire pulse, People Ops replies, approvals), balances, payday, holidays and who's away on your team.
- **Time off**: 8 leave types (annual with first-year pro-rating and carry-over, work-from-anywhere, sick with instant approval for short absences, parental, compassionate, study, Hajj, unpaid); a guided request flow that counts working days (weekends + UAE public holidays excluded), explains the balance before/after, flags notice and team overlap; manager approval with separation of duties; a privacy-aware team calendar (peers only see "Away").
- **Benefits**: digital insurance card, plan comparison and a step-by-step enrolment wizard (dependents, dental, vision, life cover) with live cost, allowances (learning, wellness, home office, flight home) with claims paid through payroll, perks and the confidential EAP.
- **Documents**: a vault (offer letter carried over from Talent Hub, contract, agreements), e-signature, instant letters (salary certificate, employment, bank) with reference + verification code and print-to-PDF, reviewed letters (embassy, NOC), payslips and versioned policies with acknowledgement tracking.
- **Onboarding**: journeys handed over from Talent Hub (pre-boarding → day 1 → week 1 → 30/60/90) with pulse check-ins at week 1, 30, 60 and 90 days.
- **Approvals & People Ops**: one inbox for managers and People Ops (time off, claims, letters, benefits changes, confidential cases), plus a People Ops console (out today, enrolment, policy compliance, leave liability, pulse, balance adjustments).

Try it: **Kwame** (`?persona=u-kwame`, day ~26: sign the IP agreement, enrol in benefits, answer the 30-day pulse), **Omar** (approve Mei's trip), **Sara** (People Ops queue incl. a confidential case), **Mei** (salary certificate in one tap).

## Knowledge Base (`/wiki`) + Helix Academy (`/academy`)

Living company intelligence and interactive mastery — tightly wired to HR Portal onboarding from Day 1 to Day 90.

### Knowledge Base (`/wiki`): Helix Cortex
- **Permission-scoped Spaces**: 6 curated spaces (`Company Handbook`, `Onboarding & First 90 Days`, `Trust & Security`, `Product & Design`, `Engineering & SRE`, `People & Leadership`). Contractors (`u-alex`) automatically see open spaces only (`handbook`, `onboarding`, `security`).
- **Ask Nova Docs (`?ask=1`)**: permission-first Q&A synthesizer that filters strictly through the viewer's cleared spaces *before* ranking or synthesis, returning grounded answers with `[1]`, `[2]` section citations, freshness warnings, and companion Academy course links.
- **Interactive Runbooks & Playbooks**: multi-section docs with TL;DR executive cards, copyable CLI snippets, per-user persistent runbook checklists, version history viewer, helpful votes, and Q&A comment threads.
- **Canonical Governance & Freshness**: owners and curators (`wiki.manage`) lock canonical policies, verify freshness cadences, triage stale flags, and review **Change Proposals** under a strict four-eyes separation-of-duties rule (authors cannot self-approve).
- **Reading Packs**: curated sequences including the **New-Hire Week-1 Reading Pack** (`/wiki/collections/col-new-hire`) linked directly from HR Portal onboarding journeys.

### Helix Academy (`/academy`): Interactive Courses, Scenarios & Onboarding Sync
- **Bidirectional HR Onboarding Integration**:
  - Provisioning a new hire's NEXUS account in HR Portal (`provisionHubAccount`) automatically triggers role- and phase-based Academy enrollments (`syncOnboarding()`).
  - Passing an Academy course's certification quiz automatically mints a verifiable digital credential (`HX-...`), endorses mastered skills on the user's NEXUS profile, **and checks off the linked task in their HR Portal Onboarding Journey**.
  - Onboarding checklist tasks in `/hr/onboarding/:id` deep-link directly to their Academy course (`Take course`) and Knowledge Base playbook (`Playbook`), alongside a live **Required Training & Reading** side card.
- **Interactive Course Player**: concept modules with *"Check your intuition"* flashchecks, branching workplace **Scenario Simulators** (inspect realistic Slack/email/PR artifacts, choose a response, inspect impact & coaching), personal per-lesson study notes, and graded certification quizzes.
- **Skill Radar, Paths & Verifiable Certificates**: 6-domain mastery radar, multi-course role Learning Paths, and holographic printable certificates.
- **Team & L&D Compliance Studio (`/academy/manage`)**: direct-report vs company-wide compliance matrix, 1-click learner nudges, manager course assignments, live Onboarding Auto-Assignment Rules toggles, and an in-app **Course Authoring Studio**.

## Travel & Expenses (`/expenses`, `/travel`) + Payroll Console (`/payroll`)

An end-to-end financial & people-ops workflow connecting business travel, multi-currency receipt OCR, four-eyes spend governance, monthly WPS payroll disbursement, bonuses, compensation bands, and HR Portal payslips.

### Travel & Expenses (`/expenses` & `/travel`): 7-Stage Process Flow
1. **Stage 1 · Request Travel**: pick a destination preset (`London`, `Singapore`, `Berlin`, `Riyadh`, `Bengaluru`, `New York`, `Tokyo`) with automatic per-diem rates, benchmark flight/hotel budgets, flight hours, CO₂ footprint, quarterly department budget check, policy guardrails, and Visa/NOC letter link to `/hr/documents?tab=letters`.
2. **Stage 2 · Pre-Approval & Scoped Virtual Card**: manager review enforcing separation of duties (no self-approval), automatic issuance of a trip-scoped **Virtual Corporate Card** (`•••• XXXX` with spend limit & active window), and flight/hotel PNR booking with duty-of-care check-in.
3. **Stage 3 · Smart Receipt OCR Vault**: drag-and-drop or 1-click AI receipt scanner extracting merchant, category, currency (`AED`, `USD`, `GBP`, `EUR`, `SGD`, `SAR`, `JPY`), FX conversion to AED, recoverable VAT, GL code, duplicate/meal-cap policy flags, and a 1-click **Trip Per-Diem Generator**.
4. **Stage 4 · Expense Report Submission**: bundle unsubmitted receipts + automatic trip per diem into a single report, cleanly separating corporate-card spend from out-of-pocket reimbursable AED.
5. **Stage 5 · Four-Eyes Review**: Manager approval → Finance GL & VAT audit (`expenses.audit`).
6. **Stage 6 · Queued in Payroll Console**: Finance queues approved reimbursements into a target `YYYY-MM` payroll period (`payroll_queued`), appearing live inside `/payroll`.
7. **Stage 7 · Reimbursed & On HR Payslip**: disbursing the monthly Pay Run in `/payroll` (or sending an **Express Off-Cycle Wire**) flips queued claims to `reimbursed` with `WPS-HX-...` payment references and adds the tax-free reimbursement line directly onto the employee's **HR Portal Payslip** (`/hr/documents?tab=payslips`).

### Payroll Console (`/payroll`): Payday, Bonuses & Compensation Intelligence
- **Four-Eyes Monthly Pay Run Wizard**: live sync from HR (`comp` in 8 global currencies normalized to AED, first-month starter pro-rating, unpaid leave deductions, pension & confirmed benefit shares, approved HR allowance claims), Expenses (`payroll_queued` reports), and Bonuses (`approved_queued` awards) → Variance & flag inspection + one-off line adjustments → Four-eyes sign-off (`preparedBy !== approvedBy`) → **UAE Central Bank WPS `.SIF` (`EDR` + `SCR`) & `.CSV` export** → **Payday Disbursement** (settles Expenses, HR Claims, Bonuses, and publishes official payslips to HR Portal).
- **Bonuses, Spot Awards & Variable Pay (`/payroll/bonuses`)**: nominate `Performance`, `Spot`, `Signing`, `Milestone`, and `Retention` awards with departmental variable-pay burn bars and separation-of-duties approval (`payroll.approve`, never on self or own nomination).
- **Compensation Reports, Salary Bands & Statutory EOSB (`/payroll/compensation`)**: visual `IC2`–`M4` salary band architecture, Compa-Ratio & band-penetration equity matrix, Total Rewards waterfall by department, statutory **UAE End-of-Service Gratuity (EOSB)** liability calculator (`21d/yr` yrs 1–5, `30d/yr` >5 yrs, `<1yr` cliff), live base-salary calibration synced with HR, and CSV export.
- **Reimbursements Settlement Bridge (`/payroll/reimbursements`)**: unified Finance queue linking `/expenses` and `/hr/benefits` to monthly payday or instant off-cycle wire.

## Architecture

```
src/
  types.ts              Domain model (users, roles, grants, apps, requests, audit…)
  lib/rbac.ts           Pure permission engine — framework-free, unit-tested, backend-portable
  store/hub.ts          Zustand store = API layer; every mutation re-checks permissions + audits
  store/selectors.ts    useCan(), usePermissions(), useAppAccess(), …
  components/auth/      <Can>, RequireAuth, RequirePermission, AccessDenied (403)
  components/apps/      AppTile, PinnedDock, AppDetailsSheet, LaunchOverlay
  components/shell/     Sidebar, TopBar, MobileNav, Brand/Nova orb, AppShell (+ hotkeys)
  components/widgets/   Hero + dashboard widgets
  pages/                Home, Apps, People, News, Settings, Login, admin/*
  talent/               Talent Hub engine: types, store (gated, audited actions), access rules, stage gates,
                        AI (JD decoder, matcher, outreach writer, Gemini adapter), LinkedIn builders, backends
  pages/talent/         Talent Hub UI (command deck, pipeline, AI sourcing, requisitions, pool, interviews, offers)
  hr/                   HR Portal engine: types, store, access rules, calendar/working-days, seed & unit tests
  pages/hr/             HR Portal UI (My HR, time off, benefits, documents, onboarding journeys, approvals, People Ops)
  wiki/                 Knowledge Base ("Cortex") engine: spaces, RBAC, permission-first Q&A, proposals, freshness & tests
  pages/wiki/           Knowledge Base UI (Explore, Nova Docs Q&A, Reading Packs, Interactive Reader, Composer, Governance)
  academy/              Helix Academy engine: courses, scenarios, quizzes, certificates, onboarding rules sync & tests
  pages/academy/        Academy UI (My Learning + Skill Radar, Course Player & Simulator, Catalog & Paths, Certificates, Studio)
  expenses/             Travel & Expenses engine: 7-stage flow, virtual cards, Smart OCR vault, policy/GL audit & E2E tests
  pages/expenses/       Travel & Expenses UI (7-Stage Flow, Travel Desk, Receipt Vault, Reports, Reimbursement Tracker, Audit)
  payroll/              Payroll Console engine: four-eyes pay runs, multi-currency FX, bonuses, bands, EOSB & WPS .SIF export
  pages/payroll/        Payroll Console UI (Payday Wizard, Bonuses & Awards, Compensation & Bands, Reimbursements Bridge)
  firestore/            Production kit for the `talenthub` database (rules, indexes, runbook)
  data/                 Seed catalog, roles, users, content (demo)
  styles/               tokens → base → ui kit → feature stylesheets (plain CSS, themable via data-attributes)
```

### Customising
- **Brand**: `src/config/brand.ts` (product, company, domain, assistant name)
- **Apps**: `src/data/apps.ts` (or register at runtime in Control Center › Apps — set real URLs there)
- **Roles/permissions**: `src/data/roles.ts`, `src/data/permissions.ts`
- **Theme tokens**: `src/styles/tokens.css`

## Going to production

> [!IMPORTANT]
> This build runs entirely in the browser with demo data in `localStorage`. Client-side checks are UX only — **real enforcement must happen on a server.**

1. Put an API behind `store/hub.ts`: each action already mirrors an endpoint (validate → authorize → mutate → audit → notify). Move `lib/rbac.ts` server-side unchanged and call it from your API handlers.
2. Replace the persona picker with your IdP (OIDC/SAML — Entra ID, Okta, Google Workspace). Map IdP groups → roles.
3. Issue short-lived tokens; have each launched app validate SSO rather than trusting the hub.
4. Store the audit log in append-only storage.
5. Remove `src/devBootstrap.ts` usage if you don't want the dev-only `?persona=` helper (it's already stripped from production builds).
