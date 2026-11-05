/**
 * AI Sourcing studio session store — module-level and deliberately NOT persisted.
 *
 * Holds the recruiter's place in the five-step flow (decoded JD, target
 * requisition, filters, LinkedIn prospect hits, people picked for outreach and
 * their drafts) so switching tabs and coming back resumes exactly where they
 * left off. Async work (JD decoding, prospect search, drafting) writes here
 * directly, so it completes even if the studio unmounts mid-flight.
 * A page reload or "Start over" clears everything.
 *
 * Actions live on the `studio` object (stable references, no selector needed):
 *   studio.goTo(2); studio.loadRequisition(req); studio.togglePick(pick)…
 */
import { useMemo } from 'react';
import { create } from 'zustand';
import type { AiEngine, CandidateSource, JobProfile, OutreachChannel, OutreachTone, Prospect, Requisition } from '@/talent/types';
import { analyzeJD, extractDocumentText, writeOutreach, type OutreachInput } from '@/talent/ai/engine';
import { MAX_DOC_BYTES } from '@/talent/ai/docs';
import { getLinkedInConnector, type ProspectHit, type ProspectSearchOptions } from '@/talent/linkedin/connector';
import type { JDAnalysis, JDStatus } from '../components/jd';

/** Step indexes (match the <Stepper> order). */
export const STEP = { jd: 0, decode: 1, pool: 2, linkedin: 3, outreach: 4 } as const;
export type StudioStep = (typeof STEP)[keyof typeof STEP];

/** Someone picked for outreach — a talent-pool candidate or a LinkedIn prospect. */
export interface StudioPick {
  /** `c:<candidateId>` or `p:<prospectId>`. */
  key: string;
  kind: 'candidate' | 'prospect';
  candidateId?: string;
  prospect?: Prospect;
  from: 'pool' | 'linkedin';
}

export interface StudioDraft {
  status: 'drafting' | 'ready';
  subject: string;
  body: string;
  hooks: string[];
  engine: AiEngine;
  fallbackReason?: string;
  /** Settings signature the draft was generated with (channel · tone · req · profile rev). */
  sig: string;
  /** The recruiter edited the text (never silently overwritten). */
  edited: boolean;
  run: number;
  logged?: { candidateId: string; at: number; pipeline: boolean; savedToPool: boolean; channel: OutreachChannel };
}

export type PoolMin = 0 | 58 | 72 | 85;

interface StudioData {
  step: StudioStep;
  maxReached: StudioStep;
  // ── job description
  text: string;
  fileName?: string;
  doc?: JDAnalysis['doc'];
  profile: JobProfile | null;
  /** Bumped on every profile change (decode or edit) so drafts know they're stale. */
  profileRev: number;
  jdStatus: JDStatus;
  jdError?: string;
  fallbackReason?: string;
  /** Requisition whose JD is loaded (so `?req=` doesn't reload it on every visit). */
  sourceReqId: string | null;
  /** Requisition prospects / candidates get added to. */
  targetReqId: string | null;
  // ── talent pool filters
  poolMin: PoolMin;
  poolOpenToWork: boolean;
  poolSource: CandidateSource | 'all';
  poolHideInPipe: boolean;
  poolShowLow: boolean;
  // ── LinkedIn
  /** undefined = default from the JD, '' = anywhere. */
  liLocation?: string;
  liOpenToWork: boolean;
  hits: ProspectHit[];
  hitsSig: string;
  hitsStatus: 'idle' | 'loading' | 'ready' | 'error';
  hitsError?: string;
  // ── outreach
  picks: StudioPick[];
  channel: OutreachChannel;
  tone: OutreachTone;
  /** Add everyone logged as sent to the target requisition's pipeline. */
  autoPipeline: boolean;
  drafts: Record<string, StudioDraft>;
  finished: boolean;
}

const initial = (): StudioData => ({
  step: STEP.jd,
  maxReached: STEP.jd,
  text: '',
  fileName: undefined,
  doc: undefined,
  profile: null,
  profileRev: 0,
  jdStatus: 'idle',
  jdError: undefined,
  fallbackReason: undefined,
  sourceReqId: null,
  targetReqId: null,
  poolMin: 0,
  poolOpenToWork: false,
  poolSource: 'all',
  poolHideInPipe: false,
  poolShowLow: false,
  liLocation: undefined,
  liOpenToWork: false,
  hits: [],
  hitsSig: '',
  hitsStatus: 'idle',
  hitsError: undefined,
  picks: [],
  channel: 'linkedin-connect',
  tone: 'warm',
  autoPipeline: true,
  drafts: {},
  finished: false,
});

export const useStudio = create<StudioData>()(() => initial());

const set = useStudio.setState;
const get = useStudio.getState;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Minimum "scan" time so the decode / search animations read as deliberate, not glitchy. */
const MIN_DECODE_MS = 1100;
const MIN_SEARCH_MS = 900;

let jdRun = 0;
let hitRun = 0;
let draftRun = 0;

/** Anything derived from the previous JD is invalid once a new one is decoded. */
const downstreamReset = (): Partial<StudioData> => ({
  picks: [],
  drafts: {},
  hits: [],
  hitsSig: '',
  hitsStatus: 'idle',
  hitsError: undefined,
  liLocation: undefined,
  finished: false,
});

async function decode(text: string, fileName: string | undefined, keepTarget: boolean): Promise<JobProfile | null> {
  const body = text.trim();
  if (body.length < 40) {
    set({ jdError: 'Add a little more of the job description (at least a few sentences).', jdStatus: 'error' });
    return null;
  }
  const id = ++jdRun;
  set({ jdStatus: 'analyzing', jdError: undefined, fileName });
  const started = Date.now();
  const res = await analyzeJD(body, { fileName });
  const wait = MIN_DECODE_MS - (Date.now() - started);
  if (wait > 0) await sleep(wait);
  if (id !== jdRun) return null;
  const s = get();
  // A manual decode of a different JD unlinks the requisition it came from.
  const unlink = !keepTarget && s.sourceReqId ? { sourceReqId: null, targetReqId: null } : {};
  set({
    profile: res.profile,
    profileRev: s.profileRev + 1,
    fallbackReason: res.fallbackReason,
    jdStatus: 'ready',
    ...downstreamReset(),
    ...unlink,
    step: STEP.decode,
    maxReached: STEP.decode,
  });
  return res.profile;
}

const blankDraft: StudioDraft = { status: 'drafting', subject: '', body: '', hooks: [], engine: 'offline', sig: '', edited: false, run: 0 };

export const studio = {
  goTo(step: StudioStep) {
    set((s) => ({ step, maxReached: (Math.max(s.maxReached, step) as StudioStep), finished: step === STEP.outreach ? s.finished : false }));
  },

  // ───────────── JD (JDAnalysis-compatible) ─────────────
  setText(text: string) {
    set((s) => ({ text, jdStatus: s.jdStatus === 'error' ? 'idle' : s.jdStatus, jdError: s.jdStatus === 'error' ? undefined : s.jdError }));
  },

  analyze(text?: string, fileName?: string): Promise<JobProfile | null> {
    const s = get();
    if (text !== undefined) set({ text });
    // A different document (e.g. a sample JD) replaces the previous upload's metadata.
    if (fileName !== undefined && fileName !== s.fileName) set({ doc: undefined });
    return decode(text ?? s.text, fileName ?? s.fileName, false);
  },

  async loadFile(file: File): Promise<void> {
    if (file.size > MAX_DOC_BYTES) {
      set({ jdError: 'That file is over 10 MB. Try a smaller export or paste the text.', jdStatus: 'error' });
      return;
    }
    const id = ++jdRun;
    set({ jdStatus: 'reading', jdError: undefined });
    try {
      const out = await extractDocumentText(file);
      if (id !== jdRun) return;
      if (out.text.trim().length < 40) throw new Error('We couldn’t find readable text in that file. If it’s a scanned PDF, paste the text instead.');
      set({ text: out.text, fileName: out.fileName, doc: { kind: out.kind, pages: out.pages, bytes: out.bytes } });
      await decode(out.text, out.fileName, false);
    } catch (e) {
      if (id !== jdRun) return;
      set({ jdError: e instanceof Error ? e.message : 'Could not read that file.', jdStatus: 'error' });
    }
  },

  setProfile(profile: JobProfile) {
    set((s) => ({ profile, profileRev: s.profileRev + 1 }));
  },

  resetJD() {
    jdRun += 1;
    set({ text: '', fileName: undefined, doc: undefined, profile: null, jdStatus: 'idle', jdError: undefined, fallbackReason: undefined, sourceReqId: null, ...downstreamReset(), step: STEP.jd, maxReached: STEP.jd });
  },

  /** Load an open requisition's JD + decoded profile and make it the target. */
  loadRequisition(req: Requisition) {
    jdRun += 1;
    const base: Partial<StudioData> = {
      text: req.jd.text,
      fileName: req.jd.fileName,
      doc: undefined,
      jdError: undefined,
      fallbackReason: undefined,
      sourceReqId: req.id,
      targetReqId: req.id,
      ...downstreamReset(),
    };
    if (req.jd.profile) {
      set((s) => ({ ...base, profile: req.jd.profile, profileRev: s.profileRev + 1, jdStatus: 'ready', step: STEP.decode, maxReached: STEP.decode }));
    } else {
      set({ ...base, profile: null, jdStatus: 'idle', step: STEP.jd, maxReached: STEP.jd });
      void decode(req.jd.text, req.jd.fileName, true);
    }
  },

  setTarget(reqId: string | null) {
    set({ targetReqId: reqId });
  },

  // ───────────── filters ─────────────
  setPool(patch: Partial<Pick<StudioData, 'poolMin' | 'poolOpenToWork' | 'poolSource' | 'poolHideInPipe' | 'poolShowLow'>>) {
    set(patch);
  },

  setLinkedIn(patch: Partial<Pick<StudioData, 'liLocation' | 'liOpenToWork'>>) {
    set(patch);
  },

  async searchProspects(profile: JobProfile, opts: ProspectSearchOptions, sig: string) {
    const id = ++hitRun;
    set({ hitsStatus: 'loading', hitsSig: sig, hitsError: undefined });
    const started = Date.now();
    try {
      const hits = await getLinkedInConnector().search(profile, opts);
      const wait = MIN_SEARCH_MS - (Date.now() - started);
      if (wait > 0) await sleep(wait);
      if (id !== hitRun) return;
      set({ hits, hitsStatus: 'ready' });
    } catch (e) {
      if (id !== hitRun) return;
      set({ hits: [], hitsStatus: 'error', hitsError: e instanceof Error ? e.message : 'The prospect search failed.' });
    }
  },

  // ───────────── picks ─────────────
  togglePick(pick: StudioPick) {
    set((s) => (s.picks.some((p) => p.key === pick.key) ? { picks: s.picks.filter((p) => p.key !== pick.key) } : { picks: [...s.picks, pick], finished: false }));
  },

  addPicks(list: StudioPick[]) {
    set((s) => {
      const have = new Set(s.picks.map((p) => p.key));
      const fresh = list.filter((p) => !have.has(p.key));
      return fresh.length ? { picks: [...s.picks, ...fresh], finished: false } : {};
    });
  },

  removePicks(keys: string[]) {
    const drop = new Set(keys);
    set((s) => ({ picks: s.picks.filter((p) => !drop.has(p.key)) }));
  },

  // ───────────── outreach ─────────────
  setOutreach(patch: Partial<Pick<StudioData, 'channel' | 'tone' | 'autoPipeline' | 'finished'>>) {
    set(patch);
  },

  /** Mark drafts as in-flight synchronously (prevents duplicate generation). */
  markDrafting(keys: string[], sig: string) {
    set((s) => {
      const drafts = { ...s.drafts };
      for (const k of keys) drafts[k] = { ...(drafts[k] ?? blankDraft), status: 'drafting', sig };
      return { drafts };
    });
  },

  async draft(key: string, input: OutreachInput, sig: string) {
    const run = ++draftRun;
    set((s) => ({ drafts: { ...s.drafts, [key]: { ...(s.drafts[key] ?? blankDraft), status: 'drafting', sig, run } } }));
    const res = await writeOutreach(input);
    const cur = get().drafts[key];
    if (!cur || cur.run !== run || cur.logged) return;
    set((s) => ({
      drafts: {
        ...s.drafts,
        [key]: { ...cur, status: 'ready', subject: res.draft.subject ?? '', body: res.draft.body, hooks: res.draft.hooks, engine: res.draft.engine, fallbackReason: res.fallbackReason, edited: false },
      },
    }));
  },

  editDraft(key: string, patch: Partial<Pick<StudioDraft, 'subject' | 'body'>>) {
    set((s) => (s.drafts[key] ? { drafts: { ...s.drafts, [key]: { ...s.drafts[key], ...patch, edited: true } } } : {}));
  },

  markLogged(key: string, logged: NonNullable<StudioDraft['logged']>) {
    set((s) => (s.drafts[key] ? { drafts: { ...s.drafts, [key]: { ...s.drafts[key], logged } } } : {}));
  },

  startOver() {
    jdRun += 1;
    hitRun += 1;
    draftRun += 1;
    set(initial());
  },
};

/** The studio's JD state shaped as a `JDAnalysis`, so the shared <JDInput> works on it. */
export function useStudioJD(): JDAnalysis {
  const text = useStudio((s) => s.text);
  const fileName = useStudio((s) => s.fileName);
  const profile = useStudio((s) => s.profile);
  const status = useStudio((s) => s.jdStatus);
  const error = useStudio((s) => s.jdError);
  const fallbackReason = useStudio((s) => s.fallbackReason);
  const doc = useStudio((s) => s.doc);
  return useMemo(
    () => ({
      text,
      fileName,
      profile,
      status,
      error,
      fallbackReason,
      doc,
      setText: studio.setText,
      loadFile: studio.loadFile,
      analyze: studio.analyze,
      setProfile: studio.setProfile,
      reset: studio.resetJD,
    }),
    [text, fileName, profile, status, error, fallbackReason, doc],
  );
}

export const pickKey = {
  candidate: (id: string) => `c:${id}`,
  prospect: (id: string) => `p:${id}`,
};
