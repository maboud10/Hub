/**
 * Incident Command ("Sentinel") — persisted zustand store ('nexus-incidents-v1').
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import type { AppStatus, User } from '@/types';
import { MIN, ROLE_META, SERVICES } from './meta';
import { applyTransition, isActive, nextCode, rid, timelineEntry, type TransitionResult } from './engine';
import { advanceSwap, pageTargets, type SwapAction, type SwapResult } from './oncall';
import {
  buildAlertGroups,
  buildIncidentsSeed,
  draftPostmortemFor,
  INCIDENTS_DATA_VERSION,
  runbookForService,
} from './seed';
import type {
  DeploySignal,
  HealthSignal,
  Incident,
  IncidentsData,
  IncidentStatus,
  Maintenance,
  NewIncidentInput,
  Override,
  Postmortem,
  PostmortemSections,
  PostmortemStatus,
  Region,
  RoleKey,
  StatusPhase,
  StatusUpdate,
  TimelineKind,
  TimelineSource,
} from './types';

export function canUseIncidents(perms: ReadonlySet<string>): boolean {
  return perms.has('*') || perms.has('app:incidents');
}

export function isIncidentLead(user?: User | null, perms?: ReadonlySet<string>): boolean {
  if (!user) return false;
  if (perms?.has('*')) return true;
  return user.department === 'IT & Security' || user.roleIds.includes('manager') || user.id === 'u-lucas' || user.id === 'u-priya';
}

export interface IncidentsActions {
  declareIncident(input: NewIncidentInput, actorId?: string): Incident;
  transitionIncident(incidentId: string, to: IncidentStatus, actorId?: string, note?: string): TransitionResult;
  assignRole(incidentId: string, role: RoleKey, userId: string | undefined, actorId?: string): void;
  addTimelineNote(incidentId: string, text: string, authorId?: string, kind?: TimelineKind, source?: TimelineSource, key?: string): void;
  toggleRunbookItem(incidentId: string, itemId: string, actorId?: string): void;
  ackPaging(incidentId: string, actorId: string): void;
  escalatePaging(incidentId: string, actorId?: string): void;
  setDeployFreeze(incidentId: string, active: boolean, reason?: string, actorId?: string, synced?: boolean): void;
  setWarRoomBridge(incidentId: string, meetRoomId: string, actorId?: string): void;
  recordComms(incidentId: string, channel: 'chat' | 'mail' | 'status', summary: string, actorId?: string): void;
  syncExternalSignals(deploys?: DeploySignal[], health?: HealthSignal[]): void;
  ackAlert(fingerprint: string, actorId: string): void;
  snoozeAlert(fingerprint: string, minutes: number, actorId?: string): void;
  resolveAlert(fingerprint: string, actorId?: string): void;
  escalateAlertToIncident(fingerprint: string, actorId: string): Incident | null;
  toggleRule(ruleId: string): void;
  applyNoiseSuggestion(fingerprint: string, actorId?: string): void;
  dismissNoiseSuggestion(fingerprint: string): void;
  requestSwap(input: {
    rotationId: string;
    fromUserId: string;
    toUserId: string;
    start: number;
    end: number;
    reason: string;
    requestedBy: string;
  }): Override;
  stepSwap(overrideId: string, action: SwapAction, actor: { id: string; lead: boolean }): SwapResult;
  markSwapCalendar(overrideId: string): void;
  publishStatusUpdate(input: {
    incidentId?: string;
    phase: StatusPhase;
    title: string;
    body: string;
    componentIds: string[];
    authorId: string;
  }): StatusUpdate;
  setComponentStatus(componentId: string, status: AppStatus, reason?: string): void;
  scheduleMaintenance(input: {
    title: string;
    componentIds: string[];
    start: number;
    end: number;
    createdBy: string;
    notify: boolean;
  }): Maintenance;
  cancelMaintenance(id: string): void;
  generatePostmortem(incidentId: string, authorId: string): Postmortem | null;
  updatePostmortemStatus(pmId: string, status: PostmortemStatus): void;
  updatePostmortemSections(pmId: string, patch: Partial<PostmortemSections>): void;
  toggleActionItem(pmId: string, actionId: string): void;
  addActionItem(pmId: string, item: { title: string; ownerId: string; due: string; priority: 'P1' | 'P2' | 'P3' }): void;
  linkActionTask(pmId: string, actionId: string, taskId: string, taskTo: string): void;
  setPostmortemReviewEvent(pmId: string, eventId: string, reviewAt: number): void;
  resetDemo(): void;
}

export type IncidentsStore = IncidentsData & IncidentsActions;

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

function safeToast(kind: 'success' | 'info' | 'warning' | 'error', title: string, desc?: string) {
  if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
    toast[kind](title, desc);
  }
}

export const useIncidents = create<IncidentsStore>()(
  persist(
    (set, get) => ({
      ...buildIncidentsSeed(),

      declareIncident(input, actorId = 'u-lucas') {
        const now = Date.now();
        const state = get();
        const code = nextCode(state.incidents);
        const id = code.toLowerCase();
        const services = input.services?.length ? input.services : ['hub-web'];
        const regions: Region[] = input.regions?.length ? input.regions : ['eu-west-2'];
        const derivedApps = Array.from(
          new Set(
            input.impactedApps ??
              services.flatMap((svc) => SERVICES.find((s) => s.id === svc)?.apps ?? []),
          ),
        );
        const targets = pageTargets(services, input.severity, state.rotations, state.overrides, now);
        const commanderId = input.commanderId ?? (input.severity === 'SEV1' || input.severity === 'SEV2' ? 'u-omar' : actorId);

        const tl = [
          timelineEntry({
            at: now,
            kind: 'status',
            source: 'human',
            authorId: actorId,
            status: 'triggered',
            text: `Declared ${code} (${input.severity}): ${input.title.trim()}`,
          }),
        ];
        if (targets.length) {
          tl.push(
            timelineEntry({
              at: now,
              kind: 'page',
              source: 'sentinel',
              text: `Paged ${targets.length} on-call responder${targets.length > 1 ? 's' : ''} across ${services.join(', ')}`,
            }),
          );
        }

        const inc: Incident = {
          id,
          code,
          title: input.title.trim(),
          severity: input.severity,
          status: 'triggered',
          summary: input.summary?.trim() || `Investigating ${input.title.trim()} on ${services.join(', ')}.`,
          services,
          regions,
          impactedApps: derivedApps,
          roles: {
            commander: commanderId,
            ops: targets[0]?.userId ?? actorId,
          },
          startedAt: now,
          declaredBy: actorId,
          source: input.source,
          impact: input.severity === 'SEV1' ? 88 : input.severity === 'SEV2' ? 62 : input.severity === 'SEV3' ? 28 : 8,
          impactNote: input.summary?.trim(),
          timeline: tl,
          runbook: runbookForService(services, 0, actorId, now),
          paging: {
            targets,
            pagedAt: now,
            ackDueAt: now + 5 * MIN,
            escalations: 0,
          },
          chatPosts: 0,
          mails: 0,
          statusPosts: 0,
        };

        const newPages = targets.map((t) => ({
          id: rid('pg'),
          userId: t.userId,
          at: now,
          service: services[0] ?? 'hub-web',
          rotationId: t.rotationId,
          incidentId: inc.id,
          fingerprint: input.fromFingerprint,
          ackMins: 2,
        }));

        const nextAlertStates = { ...state.alertStates };
        if (input.fromFingerprint) {
          nextAlertStates[input.fromFingerprint] = {
            ...nextAlertStates[input.fromFingerprint],
            state: 'acknowledged',
            ackBy: actorId,
            ackAt: now,
            incidentId: inc.id,
            escalated: true,
          };
        }

        const nextServiceStatus = { ...state.serviceStatus };
        for (const svc of services) {
          nextServiceStatus[svc] = 'degraded';
        }

        set({
          incidents: [inc, ...state.incidents],
          pages: [...newPages, ...state.pages],
          alertStates: nextAlertStates,
          serviceStatus: nextServiceStatus,
          managedApps: Array.from(new Set([...state.managedApps, ...derivedApps])),
        });

        try {
          const hub = useHub.getState();
          for (const appId of derivedApps) {
            hub.setAppHealth(appId, 'degraded', `${code}: ${inc.title}`);
          }
        } catch {
          // ignore if hub restricts permission
        }

        safeToast('warning', `${code} declared`, `${inc.severity} · ${inc.title}`);
        return inc;
      },

      transitionIncident(incidentId, to, actorId = 'u-lucas', note) {
        const state = get();
        const current = state.incidents.find((i) => i.id === incidentId);
        if (!current) return { ok: false, error: 'Incident not found.' };
        const now = Date.now();
        const res = applyTransition(current, to, now, actorId, note);
        if (!res.ok) return res;

        let updated = res.incident;
        if (to === 'resolved') {
          updated = {
            ...updated,
            impact: 0,
            resolution: note?.trim() || updated.resolution || 'Mitigation verified and synthetic checks green.',
            freeze: updated.freeze?.active ? { ...updated.freeze, active: false, liftedAt: now } : updated.freeze,
          };
        }

        const nextIncidents = state.incidents.map((i) => (i.id === incidentId ? updated : i));
        const stillOpen = nextIncidents.filter(isActive);
        const nextServiceStatus = { ...state.serviceStatus };

        if (to === 'resolved') {
          for (const svc of updated.services) {
            const otherOpen = stillOpen.some((o) => o.services.includes(svc));
            if (!otherOpen) delete nextServiceStatus[svc];
          }
        }

        set({ incidents: nextIncidents, serviceStatus: nextServiceStatus });

        if (to === 'resolved') {
          try {
            const hub = useHub.getState();
            if (updated.id === 'inc-2046' || updated.code === 'INC-2046' || updated.services.includes('incident-paging')) {
              hub.setAppHealth('incidents', 'operational', 'SMS carrier failover complete');
            }
            for (const appId of updated.impactedApps) {
              if (appId === 'incidents') continue;
              const otherImpacting = stillOpen.some((o) => o.impactedApps.includes(appId));
              if (!otherImpacting) {
                hub.setAppHealth(appId, 'operational', `${updated.code} resolved`);
              }
            }
          } catch {
            // ignore
          }
          safeToast('success', `${updated.code} resolved`, updated.title);
        } else {
          safeToast('info', `${updated.code} → ${to}`, note || updated.title);
        }

        return { ok: true, incident: updated };
      },

      assignRole(incidentId, role, userId, actorId = 'u-omar') {
        const now = Date.now();
        set((s) => ({
          incidents: s.incidents.map((inc) => {
            if (inc.id !== incidentId) return inc;
            const nextRoles = { ...inc.roles };
            if (userId) nextRoles[role] = userId;
            else delete nextRoles[role];
            const user = useHub.getState().users.find((u) => u.id === userId);
            const text = user ? `Assigned ${ROLE_META[role].label} to ${user.name}` : `Cleared ${ROLE_META[role].label}`;
            return {
              ...inc,
              roles: nextRoles,
              timeline: [...inc.timeline, timelineEntry({ at: now, kind: 'role', source: 'human', authorId: actorId, text })],
            };
          }),
        }));
      },

      addTimelineNote(incidentId, text, authorId = 'u-lucas', kind = 'update', source = 'human', key) {
        const clean = text.trim();
        if (!clean) return;
        const now = Date.now();
        set((s) => ({
          incidents: s.incidents.map((inc) => {
            if (inc.id !== incidentId) return inc;
            if (key && inc.timeline.some((t) => t.key === key)) return inc;
            return {
              ...inc,
              timeline: [...inc.timeline, timelineEntry({ at: now, kind, source, authorId, text: clean, key })],
            };
          }),
        }));
      },

      toggleRunbookItem(incidentId, itemId, actorId = 'u-lucas') {
        const now = Date.now();
        set((s) => ({
          incidents: s.incidents.map((inc) => {
            if (inc.id !== incidentId) return inc;
            const item = inc.runbook.find((r) => r.id === itemId);
            if (!item) return inc;
            const nextDone = !item.done;
            const runbook = inc.runbook.map((r) =>
              r.id === itemId ? { ...r, done: nextDone, doneBy: nextDone ? actorId : undefined, doneAt: nextDone ? now : undefined } : r,
            );
            const timeline = nextDone
              ? [...inc.timeline, timelineEntry({ at: now, kind: 'action', source: 'human', authorId: actorId, text: `Runbook step completed: ${item.text}` })]
              : inc.timeline;
            return { ...inc, runbook, timeline };
          }),
        }));
      },

      ackPaging(incidentId, actorId) {
        const now = Date.now();
        set((s) => ({
          incidents: s.incidents.map((inc) => {
            if (inc.id !== incidentId) return inc;
            const nextStatus = inc.status === 'triggered' ? 'acknowledged' : inc.status;
            return {
              ...inc,
              status: nextStatus,
              ackAt: inc.ackAt ?? now,
              paging: { ...inc.paging, ackAt: now, ackBy: actorId },
              timeline: [
                ...inc.timeline,
                timelineEntry({ at: now, kind: 'page', source: 'human', authorId: actorId, text: 'On-call page acknowledged' }),
              ],
            };
          }),
        }));
      },

      escalatePaging(incidentId, actorId = 'u-omar') {
        const now = Date.now();
        set((s) => ({
          incidents: s.incidents.map((inc) => {
            if (inc.id !== incidentId) return inc;
            return {
              ...inc,
              paging: { ...inc.paging, escalations: inc.paging.escalations + 1, pagedAt: now, ackDueAt: now + 5 * MIN },
              timeline: [
                ...inc.timeline,
                timelineEntry({
                  at: now,
                  kind: 'page',
                  source: 'sentinel',
                  authorId: actorId,
                  text: `Escalated page to secondary rotation & Incident Commander (#${inc.paging.escalations + 1})`,
                }),
              ],
            };
          }),
        }));
        safeToast('warning', 'Escalation page sent', 'Secondary on-call and IC notified via push + voice.');
      },

      setDeployFreeze(incidentId, active, reason, actorId = 'u-omar', synced = true) {
        const now = Date.now();
        set((s) => ({
          incidents: s.incidents.map((inc) => {
            if (inc.id !== incidentId) return inc;
            const why = reason?.trim() || `Production deploy freeze for ${inc.code}`;
            const freeze = active
              ? { active: true, reason: why, at: now, synced }
              : { active: false, reason: inc.freeze?.reason ?? why, at: inc.freeze?.at ?? now, synced, liftedAt: now };
            const text = active ? `Production deploys frozen: ${why}` : `Production deploy freeze lifted for ${inc.code}`;
            return {
              ...inc,
              freeze,
              timeline: [...inc.timeline, timelineEntry({ at: now, kind: 'freeze', source: 'devhub', authorId: actorId, text })],
            };
          }),
        }));
      },

      setWarRoomBridge(incidentId, meetRoomId, actorId = 'u-omar') {
        const now = Date.now();
        set((s) => ({
          incidents: s.incidents.map((inc) => {
            if (inc.id !== incidentId) return inc;
            return {
              ...inc,
              bridge: { meetRoomId, startedAt: now },
              timeline: [
                ...inc.timeline,
                timelineEntry({
                  at: now,
                  kind: 'comms',
                  source: 'meet',
                  authorId: actorId,
                  text: `Opened HoloMeet War Room bridge (${meetRoomId})`,
                }),
              ],
            };
          }),
        }));
      },

      recordComms(incidentId, channel, summary, actorId = 'u-aisha') {
        const now = Date.now();
        set((s) => ({
          incidents: s.incidents.map((inc) => {
            if (inc.id !== incidentId) return inc;
            return {
              ...inc,
              chatPosts: channel === 'chat' ? inc.chatPosts + 1 : inc.chatPosts,
              mails: channel === 'mail' ? inc.mails + 1 : inc.mails,
              statusPosts: channel === 'status' ? inc.statusPosts + 1 : inc.statusPosts,
              lastCommsAt: now,
              timeline: [
                ...inc.timeline,
                timelineEntry({
                  at: now,
                  kind: 'comms',
                  source: channel,
                  authorId: actorId,
                  text: summary,
                }),
              ],
            };
          }),
        }));
      },

      syncExternalSignals(deploys, health) {
        set((s) => ({
          deploys: deploys && deploys.length ? deploys : s.deploys,
          health: health && health.length ? health : s.health,
        }));
      },

      ackAlert(fingerprint, actorId) {
        const now = Date.now();
        set((s) => ({
          alertStates: {
            ...s.alertStates,
            [fingerprint]: { ...s.alertStates[fingerprint], state: 'acknowledged', ackBy: actorId, ackAt: now },
          },
        }));
        safeToast('info', 'Alert acknowledged');
      },

      snoozeAlert(fingerprint, minutes, actorId = 'u-lucas') {
        const now = Date.now();
        set((s) => ({
          alertStates: {
            ...s.alertStates,
            [fingerprint]: {
              ...s.alertStates[fingerprint],
              state: 'snoozed',
              snoozedUntil: now + minutes * MIN,
              ackBy: actorId,
            },
          },
        }));
        safeToast('info', `Alert snoozed for ${minutes}m`);
      },

      resolveAlert(fingerprint) {
        const now = Date.now();
        set((s) => ({
          alertStates: {
            ...s.alertStates,
            [fingerprint]: { ...s.alertStates[fingerprint], state: 'resolved', resolvedAt: now },
          },
        }));
        safeToast('success', 'Alert group resolved');
      },

      escalateAlertToIncident(fingerprint, actorId) {
        const state = get();
        const groups = buildAlertGroups(state.alertEvents, state.alertStates, Date.now());
        const g = groups.find((x) => x.fingerprint === fingerprint);
        if (!g) return null;
        if (g.incidentId) {
          const existing = state.incidents.find((i) => i.id === g.incidentId);
          if (existing) return existing;
        }
        const severity = g.severity === 'critical' ? 'SEV1' : g.severity === 'high' ? 'SEV2' : 'SEV3';
        return get().declareIncident(
          {
            title: g.title,
            severity,
            services: [g.service],
            regions: [g.region as Region],
            summary: `Escalated from firing ${g.source} alert (${g.count} events in window).`,
            fromFingerprint: fingerprint,
          },
          actorId,
        );
      },

      toggleRule(ruleId) {
        set((s) => ({
          rules: s.rules.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r)),
        }));
      },

      applyNoiseSuggestion(fingerprint, actorId = 'u-lucas') {
        const state = get();
        const groups = buildAlertGroups(state.alertEvents, state.alertStates, Date.now());
        const g = groups.find((x) => x.fingerprint === fingerprint);
        const newRule = {
          id: rid('rule'),
          name: g ? `Nova auto-tune: suppress flapping ${g.service} (${g.title.slice(0, 38)})` : `Nova noise rule (${fingerprint})`,
          match: { service: g?.service, fingerprint },
          action: 'suppress' as const,
          target: '#sre-noise-log',
          enabled: true,
          hits7d: g?.count7d ?? 12,
          createdBy: actorId,
          nova: true,
        };
        set((s) => ({
          rules: [newRule, ...s.rules],
          dismissedSuggestions: [...s.dismissedSuggestions, fingerprint],
          alertStates: {
            ...s.alertStates,
            [fingerprint]: { ...s.alertStates[fingerprint], state: 'resolved', resolvedAt: Date.now() },
          },
        }));
        safeToast('success', 'Nova routing rule applied', newRule.name);
      },

      dismissNoiseSuggestion(fingerprint) {
        set((s) => ({
          dismissedSuggestions: s.dismissedSuggestions.includes(fingerprint)
            ? s.dismissedSuggestions
            : [...s.dismissedSuggestions, fingerprint],
        }));
      },

      requestSwap(input) {
        const now = Date.now();
        const ov: Override = {
          id: rid('ov'),
          rotationId: input.rotationId,
          fromUserId: input.fromUserId,
          toUserId: input.toUserId,
          start: input.start,
          end: input.end,
          reason: input.reason.trim() || 'Shift coverage swap',
          state: 'requested',
          requestedBy: input.requestedBy,
          requestedAt: now,
        };
        set((s) => ({ overrides: [ov, ...s.overrides] }));
        safeToast('info', 'On-call swap requested');
        return ov;
      },

      stepSwap(overrideId, action, actor) {
        const state = get();
        const current = state.overrides.find((o) => o.id === overrideId);
        if (!current) return { ok: false, error: 'Swap request not found.' };
        const res = advanceSwap(current, action, actor, Date.now());
        if (!res.ok) {
          safeToast('error', res.error);
          return res;
        }
        set((s) => ({
          overrides: s.overrides.map((o) => (o.id === overrideId ? res.override : o)),
        }));
        safeToast('success', `Swap ${res.override.state}`);
        return res;
      },

      markSwapCalendar(overrideId) {
        set((s) => ({
          overrides: s.overrides.map((o) => (o.id === overrideId ? { ...o, calendarAdded: true } : o)),
        }));
      },

      publishStatusUpdate(input) {
        const now = Date.now();
        const upd: StatusUpdate = {
          id: rid('su'),
          at: now,
          incidentId: input.incidentId,
          phase: input.phase,
          title: input.title.trim(),
          body: input.body.trim(),
          componentIds: input.componentIds,
          authorId: input.authorId,
        };
        const nextServiceStatus = { ...get().serviceStatus };
        const appStatus: AppStatus =
          input.phase === 'resolved'
            ? 'operational'
            : input.phase === 'maintenance'
              ? 'maintenance'
              : 'degraded';

        for (const cid of input.componentIds) {
          if (SERVICES.some((s) => s.id === cid)) {
            if (appStatus === 'operational') delete nextServiceStatus[cid];
            else nextServiceStatus[cid] = appStatus;
          }
        }

        set((s) => ({
          updates: [upd, ...s.updates],
          serviceStatus: nextServiceStatus,
        }));

        if (input.incidentId) {
          get().recordComms(input.incidentId, 'status', `Status page update (${input.phase}): ${upd.title}`, input.authorId);
        }

        try {
          const hub = useHub.getState();
          const touchesIncidents =
            input.incidentId === 'inc-2046' ||
            input.componentIds.includes('incidents') ||
            input.componentIds.includes('incident-paging');
          if (touchesIncidents && input.phase === 'resolved') {
            hub.setAppHealth('incidents', 'operational', 'SMS carrier failover complete');
          }
          for (const cid of input.componentIds) {
            const isHubApp = hub.apps.some((a) => a.id === cid);
            if (isHubApp) {
              const reason =
                cid === 'incidents' && appStatus === 'operational'
                  ? 'SMS carrier failover complete'
                  : `${upd.title}`;
              hub.setAppHealth(cid, appStatus, reason);
            }
          }
        } catch {
          // ignore
        }

        safeToast('success', 'Status page updated', upd.title);
        return upd;
      },

      setComponentStatus(componentId, status, reason) {
        const nextServiceStatus = { ...get().serviceStatus };
        if (SERVICES.some((s) => s.id === componentId)) {
          if (status === 'operational') delete nextServiceStatus[componentId];
          else nextServiceStatus[componentId] = status;
          set({ serviceStatus: nextServiceStatus });
        }
        try {
          const hub = useHub.getState();
          if ((componentId === 'incidents' || componentId === 'incident-paging') && status === 'operational') {
            hub.setAppHealth('incidents', 'operational', reason || 'SMS carrier failover complete');
          } else if (hub.apps.some((a) => a.id === componentId)) {
            hub.setAppHealth(componentId, status, reason);
          }
        } catch {
          // ignore
        }
      },

      scheduleMaintenance(input) {
        const mnt: Maintenance = {
          id: rid('mnt'),
          title: input.title.trim(),
          componentIds: input.componentIds,
          start: input.start,
          end: input.end,
          createdBy: input.createdBy,
          notify: input.notify,
        };
        set((s) => ({ maintenance: [mnt, ...s.maintenance] }));
        safeToast('info', 'Maintenance window scheduled', mnt.title);
        return mnt;
      },

      cancelMaintenance(id) {
        set((s) => ({
          maintenance: s.maintenance.map((m) => (m.id === id ? { ...m, cancelled: true } : m)),
        }));
      },

      generatePostmortem(incidentId, authorId) {
        const state = get();
        const existing = state.postmortems.find((p) => p.incidentId === incidentId);
        if (existing) return existing;
        const inc = state.incidents.find((i) => i.id === incidentId);
        if (!inc) return null;
        const pm = draftPostmortemFor(inc, authorId, Date.now());
        set((s) => ({
          postmortems: [pm, ...s.postmortems],
          incidents: s.incidents.map((i) => (i.id === incidentId ? { ...i, postmortemId: pm.id } : i)),
        }));
        safeToast('success', 'Nova drafted blameless postmortem', pm.title);
        return pm;
      },

      updatePostmortemStatus(pmId, status) {
        const now = Date.now();
        set((s) => ({
          postmortems: s.postmortems.map((p) =>
            p.id === pmId
              ? {
                  ...p,
                  status,
                  updatedAt: now,
                  publishedAt: status === 'published' || status === 'actions-complete' ? (p.publishedAt ?? now) : p.publishedAt,
                  wikiTo: status === 'published' || status === 'actions-complete' ? '/wiki' : p.wikiTo,
                }
              : p,
          ),
        }));
        safeToast('success', `Postmortem → ${status}`);
      },

      updatePostmortemSections(pmId, patch) {
        const now = Date.now();
        set((s) => ({
          postmortems: s.postmortems.map((p) =>
            p.id === pmId ? { ...p, updatedAt: now, sections: { ...p.sections, ...patch } } : p,
          ),
        }));
      },

      toggleActionItem(pmId, actionId) {
        const now = Date.now();
        set((s) => ({
          postmortems: s.postmortems.map((p) => {
            if (p.id !== pmId) return p;
            const actions = p.actions.map((a) => (a.id === actionId ? { ...a, done: !a.done } : a));
            const allDone = actions.length > 0 && actions.every((a) => a.done);
            const nextStatus = allDone && p.status === 'published' ? 'actions-complete' : p.status;
            return { ...p, updatedAt: now, actions, status: nextStatus };
          }),
        }));
      },

      addActionItem(pmId, item) {
        const clean = item.title.trim();
        if (!clean) return;
        const now = Date.now();
        set((s) => ({
          postmortems: s.postmortems.map((p) =>
            p.id === pmId
              ? {
                  ...p,
                  updatedAt: now,
                  actions: [...p.actions, { id: rid('act'), title: clean, ownerId: item.ownerId, due: item.due, priority: item.priority, done: false }],
                }
              : p,
          ),
        }));
      },

      linkActionTask(pmId, actionId, taskId, taskTo) {
        set((s) => ({
          postmortems: s.postmortems.map((p) =>
            p.id === pmId
              ? {
                  ...p,
                  actions: p.actions.map((a) => (a.id === actionId ? { ...a, taskId, taskTo } : a)),
                }
              : p,
          ),
        }));
      },

      setPostmortemReviewEvent(pmId, eventId, reviewAt) {
        set((s) => ({
          postmortems: s.postmortems.map((p) =>
            p.id === pmId ? { ...p, reviewEventId: eventId, reviewAt, status: p.status === 'draft' ? 'review' : p.status } : p,
          ),
        }));
      },

      resetDemo() {
        set(buildIncidentsSeed());
        try {
          useHub.getState().setAppHealth('incidents', 'degraded', 'INC-2046: SMS paging delays via EU carrier');
        } catch {
          // ignore
        }
        safeToast('info', 'Incident Command reset to demo seed');
      },
    }),
    {
      name: 'nexus-incidents-v1',
      version: INCIDENTS_DATA_VERSION,
      storage: createJSONStorage(() => safeStorage),
      migrate: (persisted, version) =>
        version === INCIDENTS_DATA_VERSION ? (persisted as IncidentsData) : buildIncidentsSeed(),
    },
  ),
);
