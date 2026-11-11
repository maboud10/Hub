import { describe, expect, it } from 'vitest';
import { buildMeetSeed } from './seed';
import { deriveActionSync, derivePreflight } from './tracking';

describe('Helix Meet journey trackers', () => {
  it('clears pre-flight when the seeded green room is fully armed', () => {
    const { greenRoom } = buildMeetSeed();
    const track = derivePreflight(greenRoom, 'HOLO-DXB-101');
    expect(track.steps.map((s) => s.id)).toEqual(['camera', 'mic', 'noise', 'captions', 'ready']);
    expect(track.state).toBe('done');
    expect(track.current).toBe(track.steps.length);
    expect(track.blockedBy).toBeNull();
    expect(track.steps[4].at).toBe('HOLO-DXB-101');
  });

  it('blocks pre-flight on the first failing check (muted mic before captions)', () => {
    const { greenRoom } = buildMeetSeed();
    const track = derivePreflight({ ...greenRoom, micOn: false, bilingualCaptionsOn: false });
    expect(track.state).toBe('blocked');
    expect(track.blockedBy).toBe('mic');
    expect(track.current).toBe(1);
    expect(track.message).toBe('Mic is muted — unmute to finish pre-flight');

    const camOff = derivePreflight({ ...greenRoom, cameraOn: false });
    expect(camOff.blockedBy).toBe('camera');
    expect(camOff.current).toBe(0);

    const noisy = derivePreflight({ ...greenRoom, noiseSuppressionPct: 72 });
    expect(noisy.blockedBy).toBe('noise');
    expect(noisy.current).toBe(2);
  });

  it('tracks action items from capture to Projects + CRM sync', () => {
    const fresh = deriveActionSync({ linkedApp: 'projects' });
    expect(fresh.steps.map((s) => s.id)).toEqual(['captured', 'projects', 'crm', 'synced']);
    expect(fresh.current).toBe(1);
    expect(fresh.next).toBe('projects');

    // CRM-homed item pushed to CRM first: the synced destination leads the bar.
    const crmFirst = deriveActionSync({ linkedApp: 'crm', pushedToCrm: true });
    expect(crmFirst.steps.map((s) => s.id)).toEqual(['captured', 'crm', 'projects', 'synced']);
    expect(crmFirst.current).toBe(2);
    expect(crmFirst.next).toBe('projects');

    const projectsFirst = deriveActionSync({ linkedApp: 'crm', pushedToProjects: true });
    expect(projectsFirst.steps.map((s) => s.id)).toEqual(['captured', 'projects', 'crm', 'synced']);
    expect(projectsFirst.next).toBe('crm');

    const done = deriveActionSync({ linkedApp: 'projects', pushedToProjects: true, pushedToCrm: true });
    expect(done.state).toBe('done');
    expect(done.current).toBe(done.steps.length);
    expect(done.next).toBeNull();
  });
});
