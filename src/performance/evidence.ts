/**
 * Evidence — everything that shows what someone did this quarter, gathered from
 * every corner of NEXUS: shipped work (Helix Projects), kudos (Hub), feedback,
 * OKR movement, and items pinned from other apps. Pure builder (no React/store).
 */
import type { Kudos, KudosValue } from '@/types';
import type { BridgeWorkItem } from '@/lib/appBridge';
import { formatValue } from './okr';
import type { CompetencyId, Evidence, Feedback, KeyResult, Objective } from './types';

export type EvidenceKind = 'work' | 'kudos' | 'feedback' | 'okr' | 'pinned';

export interface EvidenceItem {
  id: string;
  kind: EvidenceKind;
  title: string;
  detail?: string;
  at: number;
  sourceLabel: string;
  to?: string;
  fromId?: string;
  competency?: CompetencyId;
  /** Praise / kudos / wins vs constructive input. */
  positive: boolean;
}

export const KUDOS_COMPETENCY: Record<KudosValue, CompetencyId> = {
  teamwork: 'collaboration',
  innovation: 'impact',
  customer: 'customer',
  ownership: 'ownership',
  craft: 'craft',
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const firstSentence = (s: string) => {
  const m = s.match(/^(.{20,160}?[.!?])(\s|$)/);
  return (m ? m[1] : s).trim();
};

export interface EvidenceInput {
  userId: string;
  since: number;
  until?: number;
  kudos: Kudos[];
  /** Feedback already filtered to what the viewer may see. */
  feedback: Feedback[];
  keyResults: KeyResult[];
  objectives: Objective[];
  pinned: Evidence[];
  work: BridgeWorkItem[];
  nameOf: (id: string) => string;
}

export function buildEvidence(input: EvidenceInput): EvidenceItem[] {
  const until = input.until ?? Number.POSITIVE_INFINITY;
  const inWindow = (t: number) => t >= input.since && t <= until;
  const out: EvidenceItem[] = [];
  const first = (id: string) => input.nameOf(id).split(' ')[0];

  for (const p of input.pinned) {
    if (p.userId !== input.userId || !inWindow(p.at)) continue;
    out.push({ id: p.id, kind: 'pinned', title: p.title, detail: p.detail, at: p.at, sourceLabel: p.source.label, to: p.source.to, positive: true });
  }

  const seen = new Set(out.map((e) => norm(e.title)));
  for (const w of input.work) {
    if (!inWindow(w.completedAt) || seen.has(norm(w.title))) continue;
    seen.add(norm(w.title));
    out.push({ id: `work:${w.id}`, kind: 'work', title: w.title, detail: w.projectName, at: w.completedAt, sourceLabel: w.projectName ? `Helix Projects · ${w.projectName}` : 'Helix Projects', to: w.to, positive: true });
  }

  for (const k of input.kudos) {
    if (k.toId !== input.userId || !inWindow(k.at)) continue;
    out.push({
      id: `kudos:${k.id}`,
      kind: 'kudos',
      title: k.message,
      at: k.at,
      sourceLabel: `Kudos · ${first(k.fromId)}`,
      fromId: k.fromId,
      competency: KUDOS_COMPETENCY[k.value],
      positive: true,
      to: '/',
    });
  }

  for (const f of input.feedback) {
    if (f.toId !== input.userId || !inWindow(f.at)) continue;
    out.push({
      id: `fb:${f.id}`,
      kind: 'feedback',
      title: firstSentence(f.body),
      detail: f.body,
      at: f.at,
      sourceLabel: `${f.kind === 'praise' ? 'Praise' : 'Feedback'} · ${first(f.fromId)}`,
      fromId: f.fromId,
      competency: f.competency,
      positive: f.kind === 'praise',
      to: '/performance/feedback',
    });
  }

  const objById = new Map(input.objectives.map((o) => [o.id, o]));
  for (const kr of input.keyResults) {
    if (kr.ownerId !== input.userId) continue;
    const cks = kr.checkins.filter((c) => inWindow(c.at)).sort((a, b) => a.at - b.at);
    if (!cks.length) continue;
    const before = kr.checkins.filter((c) => c.at < input.since).sort((a, b) => b.at - a.at)[0];
    const from = before?.value ?? kr.start;
    const to = cks[cks.length - 1].value;
    if (from === to) continue;
    const o = objById.get(kr.objectiveId);
    out.push({
      id: `okr:${kr.id}`,
      kind: 'okr',
      title: `Moved “${kr.title}” from ${formatValue(kr, from)} to ${formatValue(kr, to)}`,
      detail: o ? `OKR · ${o.title}` : undefined,
      at: cks[cks.length - 1].at,
      sourceLabel: 'OKR check-ins',
      to: o ? `/performance/okrs/${o.id}` : '/performance/okrs',
      competency: 'impact',
      positive: true,
    });
  }

  return out.sort((a, b) => b.at - a.at);
}

/** Text inserted when evidence is dragged into an answer. */
export function evidenceSnippet(e: EvidenceItem): string {
  const date = new Date(e.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  if (e.kind === 'kudos' || e.kind === 'feedback') return `• ${e.sourceLabel.split(' · ')[1] ?? 'A colleague'} (${date}): “${e.title}”`;
  return `• ${e.title} (${e.sourceLabel}, ${date})`;
}
