/**
 * Talent Hub persistence backends.
 *
 *  local     (default) — documents live in this browser (persisted Zustand store).
 *  firestore (opt-in)  — every write is mirrored to the `talenthub` Firestore
 *                        database; enable with VITE_TALENT_BACKEND=firestore once
 *                        the database is provisioned (see firestore/README.md).
 *
 * The store calls `write` / `remove` after each mutation, so switching backends
 * needs no changes to UI or business logic.
 */
import type { TalentCollection, TalentData } from '../types';
import { FIREBASE_CONFIG, isFirebaseConfigured } from './firebase';

const env = import.meta.env as Record<string, string | undefined>;

export const TALENT_DATABASE_ID = env.VITE_TALENT_FIRESTORE_DB || 'talenthub';

export const TALENT_COLLECTIONS: TalentCollection[] = [
  'requisitions',
  'candidates',
  'applications',
  'interviews',
  'scorecards',
  'offers',
  'outreach',
  'onboarding',
  'activity',
];

export type BackendKind = 'local' | 'firestore';

/** Who the remote backend authenticated (production: Google sign-in + `members/{email}`). */
export interface BackendIdentity {
  email: string;
  /** NEXUS user id this Google account maps to. */
  hubUserId: string;
  /** Effective permissions from the allowlist entry (mirrored by security rules). */
  perms: string[];
}

export interface TalentBackend {
  kind: BackendKind;
  /** Set by remote backends once the caller is authenticated. */
  identity?: BackendIdentity;
  /** Mirror a created/updated document. */
  write(col: TalentCollection, doc: { id: string }): void;
  /** Mirror a deletion. */
  remove(col: TalentCollection, id: string): void;
  /** Load every collection (remote backends). */
  pull?(): Promise<Partial<TalentData>>;
  /** Push a full snapshot (first-run seeding of an empty database). */
  seed?(data: TalentData): Promise<void>;
}

export interface BackendStatus {
  kind: BackendKind;
  label: string;
  database: string;
  project?: string;
  detail: string;
}

const firestoreRequested = env.VITE_TALENT_BACKEND === 'firestore';

export function backendStatus(): BackendStatus {
  if (firestoreRequested && isFirebaseConfigured())
    return {
      kind: 'firestore',
      label: 'Firestore',
      database: TALENT_DATABASE_ID,
      project: FIREBASE_CONFIG.projectId,
      detail: `Live sync with Firestore database “${TALENT_DATABASE_ID}” in ${FIREBASE_CONFIG.projectId}.`,
    };
  return {
    kind: 'local',
    label: 'Local',
    database: TALENT_DATABASE_ID,
    project: FIREBASE_CONFIG.projectId,
    detail: firestoreRequested
      ? 'VITE_TALENT_BACKEND=firestore is set but Firebase isn’t configured, so data is kept in this browser.'
      : `Kept in this browser. Documents already use the exact shape of the “${TALENT_DATABASE_ID}” Firestore database, ready to sync in production.`,
  };
}

/** Seed an empty remote database with the demo data (never in production by default). */
export const SEED_DEMO_DATA = env.VITE_TALENT_SEED_DEMO === 'true';

const localBackend: TalentBackend = { kind: 'local', write() {}, remove() {} };

let active: TalentBackend = localBackend;

export function getTalentBackend(): TalentBackend {
  return active;
}

/**
 * Connect to Firestore when enabled (lazy-loads the SDK). Falls back to local on error.
 * `getData` gives the adapter read access to the current snapshot so it can
 * derive access fields (teamIds…) without importing the store.
 */
export async function connectTalentBackend(getData: () => TalentData): Promise<TalentBackend> {
  if (backendStatus().kind !== 'firestore') return (active = localBackend);
  try {
    const { createFirestoreBackend } = await import('./firestore');
    active = await createFirestoreBackend(TALENT_DATABASE_ID, getData);
  } catch (e) {
    console.error('[talenthub] Firestore unavailable, staying local', e);
    active = localBackend;
  }
  return active;
}
