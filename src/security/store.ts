/**
 * Security Center ("Bastion") — persisted zustand store ('nexus-security-v1').
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { toast } from '@/store/toast';
import {
  analyzeSuspiciousSignal,
  buildAuditorPack,
  computeOrgPosture,
  computePersonalShield,
  nextCaseStage,
  transitionCaseStage,
} from './engine';
import {
  buildSecuritySeed,
  EVIDENCE_SPECS,
  isoDay,
  POLICIES,
  SEED_CVES,
  SECURITY_DATA_VERSION,
  seedPersonalSecurity,
} from './seed';
import type {
  AuditorPack,
  CaseKind,
  CaseStage,
  DlpAction,
  FrameworkId,
  MyReport,
  PersonalSecurity,
  PhishCampaign,
  PlaybookId,
  ReportKind,
  SecCase,
  SecurityData,
  Severity,
} from './types';

export interface SubmitReportInput {
  reporterId: string;
  kind: CaseKind | ReportKind;
  title: string;
  detail?: string;
  channel?: string;
  severity?: Severity;
  source?: { app: string; label: string; to?: string };
}

export interface SecurityActions {
  ensurePerson(userId: string): PersonalSecurity;
  enrollPasskey(userId: string): void;
  revokeStaleSessions(userId: string): void;
  completeTraining(userId: string, moduleId: string): void;
  recordGameRound(userId: string, scorePct: number): void;
  ackPolicy(userId: string, policyId: string): void;
  ackAllPolicies(userId: string): void;
  submitReport(input: SubmitReportInput): { caseId: string; reportId: string; secCase: SecCase };
  advanceCaseStage(caseId: string, actorId: string, targetStage?: CaseStage, note?: string): SecCase | null;
  assignCase(caseId: string, assigneeId: string | undefined, actorId: string): void;
  setCaseSeverity(caseId: string, severity: Severity, actorId: string): void;
  addCaseNote(caseId: string, actorId: string, text: string): void;
  runPlaybook(caseId: string, playbookId: PlaybookId, actorId: string, ref?: { label: string; to: string }): void;
  remediateCheck(checkId: string): void;
  patchCve(cveId: string): void;
  patchAllCriticalCves(): number;
  refreshEvidence(evidenceId?: string): void;
  generateAuditorPack(frameworkId: FrameworkId, actorId: string): AuditorPack;
  updateDlpAction(dlpId: string, action: DlpAction, coached?: boolean): void;
  blockIoc(ioc: string): void;
  launchCampaignDrill(name: string, lure: string, difficulty?: 1 | 2 | 3): PhishCampaign;
  saveRef(key: string, ref: { label: string; to: string }): void;
  resetDemo(): void;
}

export type SecurityStore = SecurityData & SecurityActions;

const memoryMap = new Map<string, string>();
const safeStorage: Storage = {
  getItem: (k) => {
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
        return localStorage.getItem(k);
      }
    } catch {
      // fallback
    }
    return memoryMap.get(k) ?? null;
  },
  setItem: (k, v) => {
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
        localStorage.setItem(k, v);
        return;
      }
    } catch {
      // fallback
    }
    memoryMap.set(k, v);
  },
  removeItem: (k) => {
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.removeItem === 'function') {
        localStorage.removeItem(k);
        return;
      }
    } catch {
      // fallback
    }
    memoryMap.delete(k);
  },
  clear: () => memoryMap.clear(),
  key: (i) => [...memoryMap.keys()][i] ?? null,
  get length() {
    return memoryMap.size;
  },
};

function safeToast(kind: 'success' | 'info' | 'warning', title: string, desc?: string) {
  if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
    toast[kind](title, desc);
  }
}

const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const PLAYBOOK_LABELS: Record<PlaybookId, string> = {
  isolate: 'Isolated endpoint via CrowdStrike EDR',
  reset: 'Revoked active SSO sessions & enforced WebAuthn step-up',
  block: 'Sinkholed IOC domain & IP across edge gateway',
  declare: 'Escalated to Sentinel Incident Command war room',
  rotate: 'Rotated compromised secret lease in Aegis Vault',
  notify: 'Sent security advisory to affected stakeholders',
  warroom: 'Launched instant HoloMeet security bridge',
  task: 'Created engineering remediation task in Projects',
  wipe: 'Triggered remote MDM lock & selective corporate wipe',
  revoke: 'Revoked external Drive share link & quarantined file',
};

export const useSecurity = create<SecurityStore>()(
  persist(
    (set, get) => {
      const patchPerson = (userId: string, fn: (p: PersonalSecurity) => PersonalSecurity) =>
        set((s) => {
          const cur = s.people[userId] ?? seedPersonalSecurity(userId);
          const next = fn(cur);
          const shield = computePersonalShield(next);
          return {
            people: { ...s.people, [userId]: next },
            scoreCache: { ...s.scoreCache, [userId]: shield.score },
          };
        });

      return {
        ...buildSecuritySeed(),

        ensurePerson(userId) {
          const existing = get().people[userId];
          if (existing) return existing;
          const seeded = seedPersonalSecurity(userId);
          set((s) => ({ people: { ...s.people, [userId]: seeded } }));
          return seeded;
        },

        enrollPasskey(userId) {
          patchPerson(userId, (p) => ({
            ...p,
            mfa: 'passkey',
            passkeys: Math.max(2, p.passkeys + 1),
            hardwareKey: true,
            staleSessions: 0,
            xp: p.xp + 40,
            vault: { ...p.vault, score: Math.min(100, p.vault.score + 8), weak: 0, expiringSoon: 0 },
          }));
          safeToast('success', 'WebAuthn passkey registered & idle sessions revoked');
        },

        revokeStaleSessions(userId) {
          patchPerson(userId, (p) => ({
            ...p,
            sessions: Math.max(1, p.sessions - p.staleSessions),
            staleSessions: 0,
            xp: p.xp + 15,
          }));
          safeToast('success', 'Idle SSO sessions revoked');
        },

        completeTraining(userId, moduleId) {
          const now = Date.now();
          patchPerson(userId, (p) => ({
            ...p,
            xp: p.xp + 35,
            training: p.training.map((t) =>
              t.moduleId === moduleId ? { ...t, status: 'done', completedAt: now } : t,
            ),
          }));
          safeToast('success', 'Security micro-module completed (+35 XP)');
        },

        recordGameRound(userId, scorePct) {
          const clean = Math.max(0, Math.min(100, Math.round(scorePct)));
          const today = isoDay(Date.now());
          patchPerson(userId, (p) => {
            const nextStreak = p.game.lastDay === today ? p.game.streak : p.game.streak + 1;
            const badges = new Set(p.game.badges);
            if (clean >= 90) badges.add('Eagle Eye');
            if (nextStreak >= 3) badges.add('Streak Guardian');
            return {
              ...p,
              xp: p.xp + 25,
              game: {
                best: Math.max(p.game.best, clean),
                last: clean,
                plays: p.game.plays + 1,
                streak: nextStreak,
                lastDay: today,
                badges: [...badges],
              },
            };
          });
        },

        ackPolicy(userId, policyId) {
          const now = Date.now();
          set((s) => ({
            acks: {
              ...s.acks,
              [policyId]: { ...(s.acks[policyId] ?? {}), [userId]: now },
            },
          }));
          patchPerson(userId, (p) => ({ ...p, xp: p.xp + 15 }));
        },

        ackAllPolicies(userId) {
          const now = Date.now();
          set((s) => {
            const nextAcks = { ...s.acks };
            for (const pol of POLICIES) {
              nextAcks[pol.id] = { ...(nextAcks[pol.id] ?? {}), [userId]: now };
            }
            return { acks: nextAcks };
          });
          patchPerson(userId, (p) => ({ ...p, xp: p.xp + 30 }));
          safeToast('success', 'All security policies attested');
        },

        submitReport(input) {
          const now = Date.now();
          const s = get();
          const nextSeq = s.seq + 1;
          const caseId = `SEC-${nextSeq}`;
          const reportId = `RPT-${nextSeq}`;
          const title = input.title.trim() || 'Suspicious security signal';
          const detail = input.detail?.trim() || 'Reported via Bastion 1-tap suspicious signal intake.';
          const analysis = analyzeSuspiciousSignal({ title, detail, kind: input.kind });
          const severity: Severity = input.severity ?? analysis.severity;

          const secCase: SecCase = {
            id: caseId,
            title,
            kind: input.kind as CaseKind,
            severity,
            stage: 'detected',
            closed: false,
            createdAt: now,
            updatedAt: now,
            stageAt: { detected: now },
            detail,
            source: input.source ?? { app: 'security', label: input.channel ?? 'Employee Report', to: '/security' },
            reporterId: input.reporterId,
            reporters: [input.reporterId],
            assigneeId: 'u-ethan',
            affectedUserIds: [input.reporterId],
            assets: [],
            hub: 'Dubai',
            mitre: analysis.mitre,
            iocs: analysis.iocs,
            confidence: Math.round(analysis.riskScore) / 100,
            detectedAfterMins: 2,
            timeline: [
              {
                id: uid('ev'),
                at: now,
                kind: 'report',
                actorId: input.reporterId,
                text: `Reported suspicious signal (${input.kind}): ${title}`,
              },
              {
                id: uid('ev'),
                at: now + 1000,
                kind: 'detect',
                text: `Nova auto-enriched signal (${analysis.verdict.toUpperCase()} · ${analysis.riskScore}% risk · MITRE ${analysis.mitre.join(', ')}).`,
              },
            ],
            actions: [],
          };

          const reportKinds: ReportKind[] = ['phishing', 'suspicious_login', 'lost_device', 'data_leak', 'other'];
          const reportKind: ReportKind = reportKinds.includes(input.kind as ReportKind)
            ? (input.kind as ReportKind)
            : 'other';

          const report: MyReport = {
            id: reportId,
            reporterId: input.reporterId,
            caseId,
            kind: reportKind,
            title,
            detail,
            channel: input.channel ?? input.source?.label ?? 'Bastion Intake',
            createdAt: now,
          };

          set((state) => {
            const curPerson = state.people[input.reporterId] ?? seedPersonalSecurity(input.reporterId);
            const updatedPerson = { ...curPerson, xp: curPerson.xp + 25 };
            return {
              seq: nextSeq,
              cases: [secCase, ...state.cases],
              reports: [report, ...state.reports],
              people: { ...state.people, [input.reporterId]: updatedPerson },
            };
          });

          return { caseId, reportId, secCase };
        },

        advanceCaseStage(caseId, actorId, targetStage, note) {
          const existing = get().cases.find((c) => c.id === caseId);
          if (!existing) return null;
          const next = targetStage ?? nextCaseStage(existing.stage);
          const updated = transitionCaseStage(existing, next, actorId, note);
          set((s) => ({
            cases: s.cases.map((c) => (c.id === caseId ? updated : c)),
          }));
          return updated;
        },

        assignCase(caseId, assigneeId, actorId) {
          const now = Date.now();
          set((s) => ({
            cases: s.cases.map((c) =>
              c.id === caseId
                ? {
                    ...c,
                    assigneeId,
                    updatedAt: now,
                    timeline: [
                      ...c.timeline,
                      {
                        id: uid('ev'),
                        at: now,
                        kind: 'assign',
                        actorId,
                        text: assigneeId ? `Assigned case to ${assigneeId}.` : 'Unassigned case.',
                      },
                    ],
                  }
                : c,
            ),
          }));
        },

        setCaseSeverity(caseId, severity, actorId) {
          const now = Date.now();
          set((s) => ({
            cases: s.cases.map((c) =>
              c.id === caseId
                ? {
                    ...c,
                    severity,
                    updatedAt: now,
                    timeline: [
                      ...c.timeline,
                      {
                        id: uid('ev'),
                        at: now,
                        kind: 'severity',
                        actorId,
                        text: `Updated severity to ${severity.toUpperCase()}.`,
                      },
                    ],
                  }
                : c,
            ),
          }));
        },

        addCaseNote(caseId, actorId, text) {
          const clean = text.trim();
          if (!clean) return;
          const now = Date.now();
          set((s) => ({
            cases: s.cases.map((c) =>
              c.id === caseId
                ? {
                    ...c,
                    updatedAt: now,
                    timeline: [
                      ...c.timeline,
                      { id: uid('ev'), at: now, kind: 'note', actorId, text: clean },
                    ],
                  }
                : c,
            ),
          }));
        },

        runPlaybook(caseId, playbookId, actorId, ref) {
          const now = Date.now();
          const containmentPlaybooks: PlaybookId[] = ['isolate', 'reset', 'block', 'rotate', 'revoke', 'wipe'];
          set((s) => {
            const target = s.cases.find((c) => c.id === caseId);
            const nextBlocklist =
              playbookId === 'block' && target
                ? [...new Set([...s.blocklist, ...target.iocs])]
                : s.blocklist;

            return {
              blocklist: nextBlocklist,
              cases: s.cases.map((c) => {
                if (c.id !== caseId) return c;
                const autoContain =
                  containmentPlaybooks.includes(playbookId) && (c.stage === 'detected' || c.stage === 'triaged');
                const nextStage: CaseStage = autoContain ? 'contained' : c.stage;
                return {
                  ...c,
                  stage: nextStage,
                  stageAt: autoContain ? { ...c.stageAt, contained: now } : c.stageAt,
                  updatedAt: now,
                  actions: [...c.actions, { id: playbookId, at: now, actorId, ok: true, ref }],
                  timeline: [
                    ...c.timeline,
                    {
                      id: uid('ev'),
                      at: now,
                      kind: 'action',
                      actorId,
                      text: PLAYBOOK_LABELS[playbookId],
                      link: ref,
                    },
                  ],
                };
              }),
            };
          });
        },

        remediateCheck(checkId) {
          set((s) => {
            if (s.remediatedChecks.includes(checkId)) return s;
            const nextRemediated = [...s.remediatedChecks, checkId];
            const org = computeOrgPosture({ ...s, remediatedChecks: nextRemediated });
            return { remediatedChecks: nextRemediated, orgScore: org.score };
          });
          safeToast('success', 'Posture check remediated & verified');
        },

        patchCve(cveId) {
          set((s) => {
            if (s.patchedCves.includes(cveId)) return s;
            const nextPatched = [...s.patchedCves, cveId];
            const org = computeOrgPosture({ ...s, patchedCves: nextPatched });
            return { patchedCves: nextPatched, orgScore: org.score };
          });
          safeToast('success', `${cveId} hotfix rolled out`);
        },

        patchAllCriticalCves() {
          const s = get();
          const critIds = SEED_CVES.filter((c) => c.severity === 'critical' && !s.patchedCves.includes(c.id)).map((c) => c.id);
          if (!critIds.length) return 0;
          set((state) => {
            const nextPatched = [...new Set([...state.patchedCves, ...critIds])];
            const org = computeOrgPosture({ ...state, patchedCves: nextPatched });
            return { patchedCves: nextPatched, orgScore: org.score };
          });
          safeToast('success', `Patched ${critIds.length} critical CVE(s)`);
          return critIds.length;
        },

        refreshEvidence(evidenceId) {
          const now = Date.now();
          set((s) => {
            if (evidenceId) {
              return { evidenceAt: { ...s.evidenceAt, [evidenceId]: now } };
            }
            const all: Record<string, number> = { ...s.evidenceAt };
            for (const spec of EVIDENCE_SPECS) {
              all[spec.id] = now;
            }
            return { evidenceAt: all };
          });
          safeToast('success', evidenceId ? 'Evidence artifact refreshed' : 'All automated evidence artifacts refreshed');
        },

        generateAuditorPack(frameworkId, actorId) {
          const s = get();
          const pack = buildAuditorPack(frameworkId, actorId, s);
          set((state) => ({
            auditorPacks: [pack, ...state.auditorPacks],
            frameworks: { ...state.frameworks, [frameworkId]: 5 },
          }));
          safeToast('success', `Signed Auditor Pack (${pack.id}) generated`);
          return pack;
        },

        updateDlpAction(dlpId, action, coached) {
          set((s) => ({
            dlp: s.dlp.map((d) =>
              d.id === dlpId ? { ...d, action, coached: coached ?? d.coached } : d,
            ),
          }));
          safeToast('info', `DLP event updated to ${action}`);
        },

        blockIoc(ioc) {
          const clean = ioc.trim();
          if (!clean) return;
          set((s) => ({
            blocklist: s.blocklist.includes(clean) ? s.blocklist : [clean, ...s.blocklist],
          }));
          safeToast('success', `Blocked IOC: ${clean}`);
        },

        launchCampaignDrill(name, lure, difficulty = 2) {
          const now = Date.now();
          const drill: PhishCampaign = {
            id: `CMP-0${get().campaigns.length + 2}`,
            name: name.trim() || 'Spot Phishing Simulation Drill',
            lure: lure.trim() || 'OAuth / Urgent Executive Request Lure',
            launchedAt: now,
            status: 'running',
            difficulty,
            results: [
              { department: 'IT & Security', sent: 14, clicked: 0, reported: 13, submitted: 0 },
              { department: 'Engineering', sent: 48, clicked: 1, reported: 41, submitted: 0 },
              { department: 'Finance', sent: 22, clicked: 1, reported: 19, submitted: 0 },
              { department: 'Sales', sent: 30, clicked: 2, reported: 23, submitted: 0 },
            ],
          };
          set((s) => ({ campaigns: [drill, ...s.campaigns] }));
          safeToast('success', `Launched phishing drill: ${drill.name}`);
          return drill;
        },

        saveRef(key, ref) {
          set((s) => ({ refs: { ...s.refs, [key]: ref } }));
        },

        resetDemo() {
          set(buildSecuritySeed());
          safeToast('info', 'Security Center reset to its demo seed');
        },
      };
    },
    {
      name: 'nexus-security-v1',
      version: SECURITY_DATA_VERSION,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s): SecurityData => ({
        version: s.version,
        seq: s.seq,
        cases: s.cases,
        reports: s.reports,
        people: s.people,
        campaigns: s.campaigns,
        frameworks: s.frameworks,
        evidenceAt: s.evidenceAt,
        acks: s.acks,
        dlp: s.dlp,
        insider: s.insider,
        blocklist: s.blocklist,
        refs: s.refs,
        scoreCache: s.scoreCache,
        orgScore: s.orgScore,
        patchedCves: s.patchedCves,
        remediatedChecks: s.remediatedChecks,
        auditorPacks: s.auditorPacks,
      }),
      migrate: (persisted, version) =>
        version === SECURITY_DATA_VERSION ? (persisted as SecurityData) : buildSecuritySeed(),
    },
  ),
);

export function personalSecurityOf(userId: string): PersonalSecurity {
  return useSecurity.getState().people[userId] ?? seedPersonalSecurity(userId);
}
