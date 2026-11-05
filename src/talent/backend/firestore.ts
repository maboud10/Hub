/**
 * Firestore backend for the `talenthub` named database (lazy-loaded).
 * Collections mirror `TalentData` keys; document IDs are the entity IDs.
 *
 * Production behaviour (mirrors `firestore/firestore.rules`):
 *  - Signs in with Google (Firebase Auth) and loads the caller's allowlist
 *    entry `members/{email}` → { hubUserId, perms[], active }.
 *  - Decorates documents with derived access fields so the rules stay
 *    join-free: `requisitions.panelIds` and `teamIds` (the requisition's hiring
 *    team) on applications, interviews, scorecards, offers, outreach,
 *    candidates and activity.
 *  - Splits sensitive fields into `<collection>/{id}/private/data` (contact
 *    details, salary expectations, salary bands, offer amounts), readable only
 *    by recruiters and compensation viewers.
 *  - Pulls only what the caller may read (team-scoped queries for hiring
 *    managers, own journeys for managers / buddies / new hires).
 */
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import type { BackendIdentity, TalentBackend } from './index';
import { TALENT_COLLECTIONS } from './index';
import { ensureSignedIn, getFirebaseApp } from './firebase';
import type { Requisition, TalentCollection, TalentData } from '../types';

/** Firestore rejects `undefined` values; a JSON round-trip strips them. */
const clean = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const uniq = (ids: (string | undefined | null)[]) => [...new Set(ids.filter((x): x is string => !!x))];

/** Sensitive fields stored in the `private/data` sub-document. */
const PRIVATE_FIELDS: Partial<Record<TalentCollection, string[]>> = {
  candidates: ['email', 'phone', 'salaryExpectation'],
  requisitions: ['salary'],
  offers: ['baseSalary', 'bonusPct', 'signOnBonus', 'equity'],
};
/** Placeholders for viewers without compensation access (UI shows "Restricted"). */
const REDACTED_DEFAULTS: Partial<Record<TalentCollection, Record<string, unknown>>> = {
  requisitions: { salary: null },
  offers: { baseSalary: 0, bonusPct: 0, signOnBonus: 0, equity: '' },
};
const DERIVED_FIELDS = ['teamIds', 'panelIds'];

type AnyDoc = { id: string } & Record<string, unknown>;

function split(col: TalentCollection, d: AnyDoc) {
  const fields = PRIVATE_FIELDS[col];
  if (!fields) return { pub: d, priv: null as Record<string, unknown> | null };
  const pub: AnyDoc = { ...d };
  const priv: Record<string, unknown> = {};
  for (const f of fields) {
    if (f in pub) priv[f] = pub[f];
    delete pub[f];
  }
  return { pub, priv };
}

export function teamOf(r: Pick<Requisition, 'hiringManagerId' | 'recruiterId' | 'interviewPlan'> | undefined): string[] {
  if (!r) return [];
  return uniq([r.hiringManagerId, r.recruiterId, ...r.interviewPlan.flatMap((s) => s.interviewerIds)]);
}

/** Derived, rule-friendly access fields for a document. */
export function accessFields(col: TalentCollection, d: AnyDoc, data: TalentData): Record<string, string[]> {
  const req = (id: unknown) => data.requisitions.find((r) => r.id === id);
  const candidateTeam = (candidateId: unknown) =>
    uniq(data.applications.filter((a) => a.candidateId === candidateId).flatMap((a) => teamOf(req(a.requisitionId))));
  switch (col) {
    case 'requisitions': {
      const r = d as unknown as Requisition;
      return { panelIds: uniq(r.interviewPlan.flatMap((s) => s.interviewerIds)), teamIds: teamOf(r) };
    }
    case 'applications':
    case 'interviews':
    case 'scorecards':
    case 'offers':
      return { teamIds: teamOf(req(d.requisitionId)) };
    case 'outreach':
      return { teamIds: d.requisitionId ? teamOf(req(d.requisitionId)) : candidateTeam(d.candidateId) };
    case 'candidates':
      return { teamIds: candidateTeam(d.id) };
    case 'activity':
      return { teamIds: d.requisitionId ? teamOf(req(d.requisitionId)) : d.candidateId ? candidateTeam(d.candidateId) : [] };
    default:
      return {};
  }
}

function permit(perms: string[], p: string) {
  return perms.includes('*') || perms.includes(p) || (p.startsWith('app:') && perms.includes('app:*'));
}

async function loadIdentity(db: Firestore): Promise<BackendIdentity> {
  const user = await ensureSignedIn();
  const snap = await getDoc(doc(db, 'members', user.email));
  const m = snap.data() as { hubUserId?: string; perms?: string[]; active?: boolean } | undefined;
  if (!snap.exists() || !m?.active || !m.hubUserId) throw new Error(`${user.email} is not on the Talent Hub allowlist (members/${user.email}).`);
  return { email: user.email, hubUserId: m.hubUserId, perms: m.perms ?? [] };
}

export async function createFirestoreBackend(databaseId: string, getData: () => TalentData): Promise<TalentBackend> {
  const app = await getFirebaseApp();
  const db = getFirestore(app, databaseId);
  const identity = await loadIdentity(db);
  const fail = (op: string) => (e: unknown) => console.error(`[talenthub] ${op} failed`, e);
  const can = (p: string) => permit(identity.perms, p);

  const writeOne = (col: TalentCollection, d: AnyDoc) => {
    const data = getData();
    const { pub, priv } = split(col, d);
    void setDoc(doc(db, col, d.id), clean({ ...pub, ...accessFields(col, d, data) })).catch(fail(`write ${col}/${d.id}`));
    if (priv) void setDoc(doc(db, col, d.id, 'private', 'data'), clean(priv)).catch(fail(`write ${col}/${d.id}/private`));
  };

  /** Re-stamp `teamIds` on everything hanging off a requisition after its hiring team changed. */
  const refreshTeam = (reqId: string) => {
    const data = getData();
    const team = teamOf(data.requisitions.find((r) => r.id === reqId));
    const batch = writeBatch(db);
    const set = (col: TalentCollection, id: string, teamIds: string[]) => batch.set(doc(db, col, id), { teamIds }, { merge: true });
    const appIds = new Set(data.applications.filter((a) => a.requisitionId === reqId).map((a) => a.id));
    for (const a of data.applications) if (appIds.has(a.id)) set('applications', a.id, team);
    for (const i of data.interviews) if (i.requisitionId === reqId) set('interviews', i.id, team);
    for (const s of data.scorecards) if (appIds.has(s.applicationId)) set('scorecards', s.id, team);
    for (const o of data.offers) if (o.requisitionId === reqId) set('offers', o.id, team);
    for (const o of data.outreach) if (o.requisitionId === reqId) set('outreach', o.id, team);
    for (const c of uniq(data.applications.filter((a) => appIds.has(a.id)).map((a) => a.candidateId))) {
      const cand = data.candidates.find((x) => x.id === c);
      if (cand) set('candidates', c, accessFields('candidates', cand as unknown as AnyDoc, data).teamIds);
    }
    void batch.commit().catch(fail(`refresh team ${reqId}`));
  };

  // Caches so refreshes only happen when access actually changes.
  const knownApps = new Set<string>(getData().applications.map((a) => a.id));
  const teamKeys = new Map<string, string>(getData().requisitions.map((r) => [r.id, teamOf(r).join(',')]));

  return {
    kind: 'firestore',
    identity,
    write(col, d) {
      writeOne(col, d as AnyDoc);
      if (col === 'requisitions') {
        const key = teamOf(d as unknown as Requisition).join(',');
        const before = teamKeys.get(d.id);
        teamKeys.set(d.id, key);
        if (before !== undefined && before !== key) refreshTeam(d.id);
      }
      if (col === 'applications' && !knownApps.has(d.id)) {
        // A new application links the candidate to this hiring team.
        knownApps.add(d.id);
        const candidateId = (d as unknown as { candidateId: string }).candidateId;
        const cand = getData().candidates.find((c) => c.id === candidateId);
        if (cand)
          void setDoc(doc(db, 'candidates', candidateId), { teamIds: accessFields('candidates', cand as unknown as AnyDoc, getData()).teamIds }, { merge: true }).catch(
            fail(`team candidates/${candidateId}`),
          );
      }
    },
    remove(col, id) {
      void deleteDoc(doc(db, col, id, 'private', 'data')).catch(() => undefined);
      void deleteDoc(doc(db, col, id)).catch(fail(`delete ${col}/${id}`));
    },
    async pull() {
      const me = identity.hubUserId;
      const manage = can('talent.manage');
      const source = can('talent.source');
      const comp = manage || can('talent.comp.view');
      const onboard = can('hr.onboarding.manage');
      const recruit = manage || can('app:recruit');
      const read = async (q: Parameters<typeof getDocs>[0]) => (await getDocs(q)).docs.map((s) => s.data() as AnyDoc);
      const out: Partial<Record<TalentCollection, AnyDoc[]>> = {};

      for (const col of TALENT_COLLECTIONS) {
        const ref = collection(db, col);
        if (col === 'onboarding') {
          if (onboard) out[col] = await read(ref);
          else {
            const lists = await Promise.all(['managerId', 'buddyId', 'hubUserId'].map((f) => read(query(ref, where(f, '==', me)))));
            out[col] = [...new Map(lists.flat().map((d) => [d.id, d])).values()];
          }
        } else if (!recruit) out[col] = [];
        else if (manage || (source && (col === 'candidates' || col === 'outreach'))) out[col] = await read(ref);
        else if (can('talent.hire')) out[col] = await read(query(ref, where('teamIds', 'array-contains', me)));
        else out[col] = [];
      }

      // Merge sensitive sub-documents for those allowed to see them.
      const priv = new Map<string, Record<string, unknown>>();
      if (comp) for (const s of (await getDocs(collectionGroup(db, 'private'))).docs) if (s.ref.parent.parent) priv.set(s.ref.parent.parent.path, s.data());
      for (const col of TALENT_COLLECTIONS) {
        out[col] = (out[col] ?? []).map((d) => {
          const merged: AnyDoc = { ...(REDACTED_DEFAULTS[col] ?? {}), ...d, ...(priv.get(`${col}/${d.id}`) ?? {}) };
          for (const f of DERIVED_FIELDS) delete merged[f];
          return merged;
        });
      }
      // The remote snapshot replaces local data: rebuild the access caches from it.
      knownApps.clear();
      for (const a of out.applications ?? []) knownApps.add(a.id);
      teamKeys.clear();
      for (const r of (out.requisitions ?? []) as unknown as Requisition[]) teamKeys.set(r.id, teamOf(r).join(','));
      return out as unknown as Partial<TalentData>;
    },
    async seed(data) {
      let batch = writeBatch(db);
      let n = 0;
      const add = async (path: [string, ...string[]], value: unknown) => {
        batch.set(doc(db, ...path), clean(value));
        n += 1;
        if (n % 450 === 0) {
          await batch.commit();
          batch = writeBatch(db);
        }
      };
      for (const col of TALENT_COLLECTIONS) {
        for (const d of data[col] as unknown as AnyDoc[]) {
          const { pub, priv } = split(col, d);
          await add([col, d.id], { ...pub, ...accessFields(col, d, data) });
          if (priv) await add([col, d.id, 'private', 'data'], priv);
        }
      }
      await batch.commit();
    },
  };
}
