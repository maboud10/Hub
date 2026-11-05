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
