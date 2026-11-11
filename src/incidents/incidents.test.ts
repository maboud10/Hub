import { beforeEach, describe, expect, it } from 'vitest';
import { useHub } from '@/store/hub';
import { effectivePermissions } from '@/lib/rbac';
import type { BridgeViewer } from '@/lib/appBridge';
import {
  activeIncidents,
  applyTransition,
  canTransition,
  clockText,
  lifecycleCurrent,
  minutesText,
  mttaMinutes,
  mttrMinutes,
  nextCode,
  sortBySeverity,
} from './engine';
import { DAY, HOUR, MIN } from './meta';
import { advanceSwap, fatigueFor, isNightIn, onCallAt, pageTargets, swapCurrent } from './oncall';
import { api } from './public';
import { buildAlertGroups, buildIncidentsSeed, buildNoiseSuggestions, draftPostmortemFor } from './seed';
import { useIncidents } from './store';

function viewerFor(userId: string): BridgeViewer {
  const s = useHub.getState();
  const user = s.users.find((u) => u.id === userId)!;
  return { user, roles: s.roles, perms: effectivePermissions(user, s.roles) };
}

describe('Incident Command ("Sentinel") domain & bridge', () => {
  beforeEach(() => {
    useHub.getState().login('u-layla');
    useIncidents.getState().resetDemo();
  });

  it('seeds active INC-2047 (SEV2 payments-svc v2.41.0) and INC-2046 (SEV3 SMS carrier) plus resolved history', () => {
    const st = useIncidents.getState();
    const active = activeIncidents(st.incidents);
    expect(active.map((i) => i.code)).toEqual(['INC-2047', 'INC-2046']);
    expect(active[0].severity).toBe('SEV2');
    expect(active[0].services).toContain('payments-svc');
    expect(active[0].timeline.some((t) => t.text.includes('v2.41.0'))).toBe(true);
    expect(st.incidents.map((i) => i.code)).toEqual(['INC-2047', 'INC-2046', 'INC-2044', 'INC-2041', 'INC-2038']);
  });

  it('orders incidents by severity first, then start time and code', () => {
    const st = useIncidents.getState();
    const sorted = sortBySeverity(st.incidents);
    expect(sorted[0].code).toBe('INC-2041'); // SEV1
    expect(sorted[1].severity).toBe('SEV2');
    expect(nextCode(st.incidents)).toBe('INC-2048');
  });

  it('enforces valid status transitions and stamps lifecycle timestamps', () => {
    const inc = useIncidents.getState().incidents.find((i) => i.id === 'inc-2047')!;
    expect(canTransition('mitigating', 'monitoring')).toBe(true);
    expect(canTransition('resolved', 'mitigating')).toBe(false);

    const step1 = applyTransition(inc, 'monitoring', inc.startedAt + 50 * MIN, 'u-lucas', 'Rollback complete, watching metrics');
    expect(step1.ok).toBe(true);
    if (step1.ok) {
      expect(step1.incident.status).toBe('monitoring');
      expect(step1.incident.monitoringAt).toBeDefined();
      expect(lifecycleCurrent(step1.incident, null)).toBe(3);
    }
  });

  it('computes MTTA, MTTR and human-readable clocks accurately', () => {
    const st = useIncidents.getState();
    expect(mttaMinutes(st.incidents)).toBeGreaterThan(0);
    expect(mttrMinutes(st.incidents)).toBeGreaterThan(20);
    expect(clockText(3661_000)).toBe('01:01:01');
    expect(minutesText(45)).toBe('45m');
    expect(minutesText(135)).toBe('2h 15m');
  });

  it('evaluates follow-the-sun shifts and applied overrides in onCallAt', () => {
    const now = Date.now();
    const seed = buildIncidentsSeed(now);
    const rot = seed.rotations.find((r) => r.id === 'rot-platform')!;
    const day0 = Math.floor(now / DAY) * DAY;

    const sgSlot = onCallAt(rot, day0 + 2 * HOUR, []);
    expect(sgSlot.userId).toBe('u-priya');

    const euSlot = onCallAt(rot, day0 + 14 * HOUR, []);
    expect(euSlot.userId).toBe('u-lucas');

    // Applied override replaces Lucas with Priya during 12..18 UTC
    const overridden = onCallAt(rot, day0 + 14 * HOUR, [
      {
        id: 'ov-test',
        rotationId: 'rot-platform',
        fromUserId: 'u-lucas',
        toUserId: 'u-priya',
        start: day0 + 12 * HOUR,
        end: day0 + 18 * HOUR,
        reason: 'Rest',
        state: 'applied',
        requestedBy: 'u-lucas',
        requestedAt: now - HOUR,
        appliedAt: now - 30 * MIN,
      },
    ]);
    expect(overridden.userId).toBe('u-priya');
    expect(overridden.overrideId).toBe('ov-test');
  });

  it('deduplicates pageTargets across service rotations and IC duty for SEV1/SEV2', () => {
    const st = useIncidents.getState();
    const sev2Targets = pageTargets(['payments-svc'], 'SEV2', st.rotations, st.overrides, Date.now());
    expect(sev2Targets.length).toBeGreaterThanOrEqual(1);
    const uniqueUsers = new Set(sev2Targets.map((t) => t.userId));
    expect(uniqueUsers.size).toBe(sev2Targets.length);

    const sev4Targets = pageTargets(['payments-svc'], 'SEV4', st.rotations, st.overrides, Date.now());
    expect(sev4Targets).toEqual([]);
  });

  it('progresses shift swaps through Requested → Accepted → Applied with permission checks', () => {
    const st = useIncidents.getState();
    const ov = st.requestSwap({
      rotationId: 'rot-payments',
      fromUserId: 'u-priya',
      toUserId: 'u-lucas',
      start: Date.now() + HOUR,
      end: Date.now() + 7 * HOUR,
      reason: 'Dentist appointment',
      requestedBy: 'u-priya',
    });
    expect(swapCurrent(ov)).toBe(1);

    // Random non-lead user cannot accept
    const denied = advanceSwap(ov, 'accept', { id: 'u-kwame', lead: false }, Date.now());
    expect(denied.ok).toBe(false);

    // Counterpart accepts
    const accepted = st.stepSwap(ov.id, 'accept', { id: 'u-lucas', lead: false });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) expect(swapCurrent(accepted.override)).toBe(2);

    // Counterpart applies
    const applied = st.stepSwap(ov.id, 'apply', { id: 'u-lucas', lead: false });
    expect(applied.ok).toBe(true);
    if (applied.ok) expect(swapCurrent(applied.override)).toBe(3);
  });

  it('detects night pages in responder local timezone and computes fatigue score', () => {
    const day0 = Math.floor(Date.now() / DAY) * DAY;
    // 01:00 UTC is 02:00 CET in Berlin -> night
    expect(isNightIn(day0 + 1 * HOUR, 'Europe/Berlin')).toBe(true);
    // 13:00 UTC is 14:00 CET in Berlin -> day
    expect(isNightIn(day0 + 13 * HOUR, 'Europe/Berlin')).toBe(false);

    const st = useIncidents.getState();
    const lucasFatigue = fatigueFor(st.pages, 'u-lucas', 'Europe/Berlin', Date.now());
    expect(lucasFatigue.pagesThisWeek).toBeGreaterThanOrEqual(4);
    expect(lucasFatigue.nightPages).toBeGreaterThanOrEqual(2);
    expect(['elevated', 'high']).toContain(lucasFatigue.level);
  });

  it('groups deduplicated alert events and surfaces Nova noise-reduction suggestions', () => {
    const st = useIncidents.getState();
    const groups = buildAlertGroups(st.alertEvents, st.alertStates, Date.now());
    expect(groups.length).toBeGreaterThanOrEqual(5);
    const payGroup = groups.find((g) => g.service === 'payments-svc' && g.severity === 'critical');
    expect(payGroup?.count).toBe(3);

    const suggestions = buildNoiseSuggestions(groups, st.dismissedSuggestions);
    expect(suggestions.length).toBeGreaterThanOrEqual(2);

    st.applyNoiseSuggestion(suggestions[0].fingerprint, 'u-lucas');
    const after = buildNoiseSuggestions(groups, useIncidents.getState().dismissedSuggestions);
    expect(after.length).toBe(suggestions.length - 1);
  });

  it('declares a new incident, pages on-call, and degrades impacted hub apps', () => {
    const inc = useIncidents.getState().declareIncident(
      {
        title: 'Mail API SMTP relay saturation',
        severity: 'SEV2',
        services: ['mail-api'],
        regions: ['me-central-1'],
        summary: 'Outbound queue depth > 5,000 messages',
      },
      'u-omar',
    );
    expect(inc.code).toBe('INC-2048');
    expect(inc.impactedApps).toContain('mail');
    const mailApp = useHub.getState().apps.find((a) => a.id === 'mail');
    expect(mailApp?.status).toBe('degraded');
  });

  it('resolving INC-2046 restores Incident Command hub app health to operational', () => {
    const res = useIncidents.getState().transitionIncident('inc-2046', 'resolved', 'u-lucas', 'SMS carrier failover complete');
    expect(res.ok).toBe(true);
    const incApp = useHub.getState().apps.find((a) => a.id === 'incidents');
    expect(incApp?.status).toBe('operational');
  });

  it('toggles runbook items, deploy freeze, and war-room HoloMeet bridge', () => {
    const st = useIncidents.getState();
    const inc = st.incidents.find((i) => i.id === 'inc-2047')!;
    const openItem = inc.runbook.find((r) => !r.done)!;

    st.toggleRunbookItem('inc-2047', openItem.id, 'u-lucas');
    const updated = useIncidents.getState().incidents.find((i) => i.id === 'inc-2047')!;
    expect(updated.runbook.find((r) => r.id === openItem.id)?.done).toBe(true);

    st.setDeployFreeze('inc-2047', false, 'Rollback verified', 'u-omar', true);
    expect(useIncidents.getState().incidents.find((i) => i.id === 'inc-2047')?.freeze?.active).toBe(false);

    st.setWarRoomBridge('inc-2047', 'room-inc-2047', 'u-omar');
    expect(useIncidents.getState().incidents.find((i) => i.id === 'inc-2047')?.bridge?.meetRoomId).toBe('room-inc-2047');
  });

  it('drafts a blameless postmortem with 5 Whys and tracks action completion', () => {
    const st = useIncidents.getState();
    st.transitionIncident('inc-2047', 'resolved', 'u-omar', 'Rolled back v2.41.0');
    const pm = st.generatePostmortem('inc-2047', 'u-priya');
    expect(pm).not.toBeNull();
    expect(pm?.sections.whys.length).toBe(5);
    expect(pm?.actions.length).toBeGreaterThanOrEqual(3);

    const draft = draftPostmortemFor(st.incidents[0], 'u-priya');
    expect(draft.novaDrafted).toBe(true);
  });

  it('exposes IncidentsBridge methods for authorized engineers and blocks unauthorized viewers', () => {
    const omar = viewerFor('u-omar'); // engineering
    const alex = viewerFor('u-alex'); // contractor (no app:incidents)

    expect(api.listActive(omar).length).toBe(2);
    expect(api.listActive(alex)).toEqual([]);

    expect(api.onCallNow(omar).length).toBe(5);
    expect(api.onCallNow(alex)).toEqual([]);

    const denied = api.declare(alex, { title: 'Test outage', severity: 'SEV3' });
    expect(denied.ok).toBe(false);

    const created = api.declare(omar, {
      title: 'Edge TLS handshake spike in eu-west-2',
      severity: 'SEV3',
      services: ['hub-web'],
    });
    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.to).toContain('/incidents/war-room?id=');
    }
  });

  it('allows self pageLoad checks for Wellbeing while gating cross-user queries', () => {
    const lucas = viewerFor('u-lucas');
    const mei = viewerFor('u-mei'); // Design employee (not engineering)

    const selfLoad = api.pageLoad(lucas, 'u-lucas');
    expect(selfLoad.pagesThisWeek).toBeGreaterThan(0);

    // Mei can query her own (0 pages), but cannot query Lucas's pager load
    expect(api.pageLoad(mei, 'u-mei')).toEqual({ pagesThisWeek: 0, nightPages: 0 });
    expect(api.pageLoad(mei, 'u-lucas')).toEqual({ pagesThisWeek: 0, nightPages: 0 });

    // Palette entries populate for engineers and stay empty for non-engineers
    expect(api.paletteEntries(lucas).length).toBeGreaterThan(5);
    expect(api.paletteEntries(mei)).toEqual([]);
  });
});
