/**
 * Helix Meet — journey models for the shared NeoTracker
 * (`components/neo/Tracker.tsx`).
 *
 * Pure functions so the lobby pre-flight and the action-item → Projects / CRM
 * sync journeys are always derived from real `useMeet` state (never mocked)
 * and stay unit-testable.
 */
import type { GreenRoomConfig, MeetActionItem } from './types';

export interface MeetTrackStep {
  id: string;
  label: string;
  sub?: string;
  at?: string;
}

/* ---------- Lobby pre-flight ---------- */

export type PreflightCheck = 'camera' | 'mic' | 'noise' | 'captions';

/** Neural noise suppression below this floor fails the pre-flight check. */
export const NOISE_SUPPRESSION_FLOOR_PCT = 90;

export interface PreflightTrack {
  steps: MeetTrackStep[];
  /** Index of the first failing check, or `steps.length` once every check is green. */
  current: number;
  state: 'blocked' | 'done';
  /** The check holding pre-flight up (`null` when cleared). */
  blockedBy: PreflightCheck | null;
  title: string;
  /** Live status line for the tracker. */
  message: string;
}

const PREFLIGHT_BLOCKED_MESSAGE: Record<PreflightCheck, string> = {
  camera: 'Camera is off — turn it on to finish pre-flight',
  mic: 'Mic is muted — unmute to finish pre-flight',
  noise: `Noise suppression is under ${NOISE_SUPPRESSION_FLOOR_PCT}% — find a quieter spot to finish pre-flight`,
  captions: 'EN ↔ AR captions are off — arm them to finish pre-flight',
};

/**
 * Camera → mic → noise suppression & network → bilingual captions → ready to join.
 * The first failing check is the live (blocked) stage; all green = complete.
 */
export function derivePreflight(gr: GreenRoomConfig, roomCode?: string): PreflightTrack {
  const checks: { id: PreflightCheck; ok: boolean; label: string; sub: string }[] = [
    { id: 'camera', ok: gr.cameraOn, label: 'Camera', sub: gr.cameraOn ? '4K HDR · 60fps' : 'Off' },
    { id: 'mic', ok: gr.micOn, label: 'Mic', sub: gr.micOn ? 'Live' : 'Muted' },
    {
      id: 'noise',
      ok: gr.noiseSuppressionPct >= NOISE_SUPPRESSION_FLOOR_PCT,
      label: 'Noise & network',
      sub: `${gr.noiseSuppressionPct}% · ${gr.spatialAudioOn ? 'Spatial 3D Audio' : 'Stereo'}`,
    },
    {
      id: 'captions',
      ok: gr.bilingualCaptionsOn,
      label: 'Captions',
      sub: gr.bilingualCaptionsOn ? 'EN ↔ AR' : 'Off',
    },
  ];

  const steps: MeetTrackStep[] = [
    ...checks.map(({ id, label, sub }) => ({ id, label, sub })),
    { id: 'ready', label: 'Ready to join', at: roomCode },
  ];

  const failing = checks.find((c) => !c.ok);
  if (failing) {
    return {
      steps,
      current: checks.indexOf(failing),
      state: 'blocked',
      blockedBy: failing.id,
      title: 'Almost ready to join',
      message: PREFLIGHT_BLOCKED_MESSAGE[failing.id],
    };
  }

  return {
    steps,
    current: steps.length,
    state: 'done',
    blockedBy: null,
    title: 'You’re cleared to join',
    message: gr.novaScribeAutoJoin
      ? 'All checks green — Nova Scribe joins you on stage'
      : 'All checks green — you’re ready to join',
  };
}

/* ---------- Action item → Projects / CRM sync ---------- */

export type SyncTarget = 'projects' | 'crm';

export interface ActionSyncTrack {
  steps: MeetTrackStep[];
  current: number;
  state: 'active' | 'done';
  /** Next destination waiting for a push (`null` once synced everywhere). */
  next: SyncTarget | null;
}

const SYNC_TARGET_LABEL: Record<SyncTarget, string> = { projects: 'Projects', crm: 'CRM' };

/**
 * Captured by Nova Scribe → Projects → CRM → Synced. Destinations already
 * pushed are listed first (so a CRM-first push still reads in order), then the
 * pending ones with the item's home app (`linkedApp`) leading.
 */
export function deriveActionSync(
  act: Pick<MeetActionItem, 'linkedApp' | 'pushedToProjects' | 'pushedToCrm'>,
): ActionSyncTrack {
  const home: SyncTarget[] = act.linkedApp === 'crm' ? ['crm', 'projects'] : ['projects', 'crm'];
  const isSynced = (t: SyncTarget) => (t === 'projects' ? Boolean(act.pushedToProjects) : Boolean(act.pushedToCrm));
  const ordered = [...home.filter(isSynced), ...home.filter((t) => !isSynced(t))];
  const syncedCount = ordered.filter(isSynced).length;
  const done = syncedCount === ordered.length;

  return {
    steps: [
      { id: 'captured', label: 'Captured' },
      ...ordered.map((t) => ({ id: t, label: SYNC_TARGET_LABEL[t] })),
      { id: 'synced', label: 'Synced' },
    ],
    current: done ? ordered.length + 2 : 1 + syncedCount,
    state: done ? 'done' : 'active',
    next: done ? null : ordered[syncedCount],
  };
}
