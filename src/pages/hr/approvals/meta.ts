/**
 * Approvals inbox vocabulary: label, icon, hue and service level per kind
 * (how long a request should wait before it counts as late), plus the SLA
 * maths used for the age chips.
 */
import { FileText, HeartPulse, MessageCircleQuestion, Palmtree, Receipt, type LucideIcon } from 'lucide-react';
import type { ApprovalItem, ApprovalKind } from '@/hr/selectors';

export interface KindMeta {
  label: string;
  plural: string;
  icon: LucideIcon;
  hue: number;
  /** Target turnaround in hours. */
  slaHours: number;
}

export const KIND_META: Record<ApprovalKind, KindMeta> = {
  leave: { label: 'Time off', plural: 'Time off', icon: Palmtree, hue: 160, slaHours: 48 },
  claim: { label: 'Claim', plural: 'Claims', icon: Receipt, hue: 42, slaHours: 72 },
  letter: { label: 'Letter', plural: 'Letters', icon: FileText, hue: 199, slaHours: 24 },
  election: { label: 'Benefits', plural: 'Benefits', icon: HeartPulse, hue: 330, slaHours: 48 },
  case: { label: 'Case', plural: 'Cases', icon: MessageCircleQuestion, hue: 270, slaHours: 24 },
};

export const KIND_ORDER: ApprovalKind[] = ['leave', 'claim', 'letter', 'election', 'case'];

export function ageLabel(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.floor(hours / 24)}d`;
}

export type SlaState = 'ok' | 'soon' | 'late';

/** Waiting time against the kind's service level. */
export function slaOf(item: Pick<ApprovalItem, 'kind' | 'at'>, now: number) {
  const hours = Math.max(0, (now - item.at) / 3_600_000);
  const target = KIND_META[item.kind].slaHours;
  const ratio = hours / target;
  const state: SlaState = ratio >= 1 ? 'late' : ratio >= 0.6 ? 'soon' : 'ok';
  return { hours, target, ratio: Math.min(1, ratio), state, label: ageLabel(hours) };
}
