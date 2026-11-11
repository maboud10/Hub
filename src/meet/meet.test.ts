import { beforeEach, describe, expect, it } from 'vitest';
import {
  computeMeetPulseAnalytics,
  synthesizeLiveMoment,
} from './engine';
import { useMeet } from './store';

describe('Helix Meet (HoloMeet) Engine & Store', () => {
  beforeEach(() => {
    useMeet.getState().resetMeet();
  });

  it('computes meeting pulse and equity telemetry across rooms, recordings, and async clips', () => {
    const state = useMeet.getState();
    const metrics = computeMeetPulseAnalytics(state.rooms, state.recordings, state.clips);
    expect(metrics.meetingsDeflectedCount).toBeGreaterThan(15);
    expect(metrics.asyncHoursSavedMonth).toBeGreaterThan(40);
    expect(metrics.bilingualSessionsPct).toBeGreaterThanOrEqual(90);
    expect(metrics.talkTimeEquityScore).toBeGreaterThanOrEqual(85);
  });

  it('synthesizes live bilingual (EN + AR) transcript moments, decisions, and action items', () => {
    const room = useMeet.getState().rooms[0];
    const moment = synthesizeLiveMoment(room);
    expect(moment.line.textEn).toBeTruthy();
    expect(moment.line.textAr).toBeTruthy();
    expect(moment.decision).toBeTruthy();
    expect(moment.actionItem.title).toBeTruthy();
  });

  it('manages green-room config, instant spatial rooms, live moment injection, and vault archiving', () => {
    const store = useMeet.getState();
    expect(store.greenRoom.micOn).toBe(true);
    store.updateGreenRoom({ micOn: false });
    expect(useMeet.getState().greenRoom.micOn).toBe(false);

    // Launch an instant spatial war-room
    const newRoom = store.launchInstantRoom('Q4 Sovereign Cloud War-Room', 'customer');
    expect(newRoom.code).toContain('HOLO-LIVE-');
    expect(useMeet.getState().activeRoomId).toBe(newRoom.id);

    // Inject a live Nova Scribe moment
    const linesBefore = newRoom.transcript.length;
    store.injectLiveMoment();
    const updatedRoom = useMeet.getState().rooms.find((r) => r.id === newRoom.id)!;
    expect(updatedRoom.transcript.length).toBe(linesBefore + 1);
    expect(updatedRoom.decisions.length).toBeGreaterThan(0);
    expect(updatedRoom.actionItems.length).toBeGreaterThan(0);

    // Push action item to Helix Projects & log to Helix CRM
    const actionId = updatedRoom.actionItems[0].id;
    store.pushActionToProjects(actionId);
    store.pushActionToCrm(actionId);
    const afterPush = useMeet
      .getState()
      .rooms.find((r) => r.id === newRoom.id)!
      .actionItems.find((a) => a.id === actionId)!;
    expect(afterPush.pushedToProjects).toBe(true);
    expect(afterPush.pushedToCrm).toBe(true);

    // Archive live room into AI Recording Vault
    const vaultBefore = useMeet.getState().recordings.length;
    const rec = store.saveRoomToRecordingVault();
    expect(rec).toBeDefined();
    expect(useMeet.getState().recordings.length).toBe(vaultBefore + 1);
  });

  it('creates async video clips, increments reactions, and adds comments', () => {
    const store = useMeet.getState();
    const initialClips = store.clips.length;

    const clip = store.createAsyncClip({
      title: 'Async Architecture Walkthrough: Zero-Latency Sync',
      category: 'eng_demo',
      summary: 'Replaces Friday status call with a 3m walkthrough of the sync engine.',
    });
    expect(useMeet.getState().clips.length).toBe(initialClips + 1);

    const rocketBefore = clip.reactions['🚀'] ?? 0;
    store.reactToClip(clip.id, '🚀');
    store.commentOnClip(clip.id, 'LGTM — shipping to staging today!');

    const updatedClip = useMeet.getState().clips.find((c) => c.id === clip.id)!;
    const rocketAfter = updatedClip.reactions['🚀'] ?? 0;
    expect(rocketAfter).toBe(rocketBefore + 1);
    expect(updatedClip.comments.length).toBe(1);
    expect(updatedClip.comments[0].text).toContain('LGTM');
  });
});
