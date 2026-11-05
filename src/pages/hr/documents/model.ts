/**
 * Documents area helpers: tab ids, labels, the signed-in person's documents,
 * policy acknowledgement state, the e-signature name rule (same normalisation
 * as the store) and "print just this sheet" (clones the sheet into a
 * print-only root so the app chrome never ends up on paper).
 */
import { useMemo } from 'react';
import type { DocKind, EmployeeDocument, LetterKind, PolicyAck } from '@/hr/types';
import { LETTER_TYPES, type PolicyMeta } from '@/hr/constants';
import { useHr } from '@/hr/store';
import { useSessionUser } from '@/store/selectors';

export type DocTab = 'vault' | 'sign' | 'letters' | 'payslips' | 'policies';
export const DOC_TABS: readonly DocTab[] = ['vault', 'sign', 'letters', 'payslips', 'policies'];
export const isDocTab = (v: string | null): v is DocTab => !!v && (DOC_TABS as readonly string[]).includes(v);
export const isLetterKind = (v: string | null): v is LetterKind => !!v && LETTER_TYPES.some((l) => l.id === v);

export const SOURCE_LABEL: Record<EmployeeDocument['source'], string> = {
  'talent-hub': 'From Talent Hub',
  'people-ops': 'From People Ops',
  self: 'Uploaded by you',
  system: 'Generated',
};

/** Display order for vault groups. */
export const KIND_ORDER: readonly DocKind[] = ['contract', 'nda', 'offer', 'letter', 'certificate', 'id', 'payslip', 'other'];

/** Same normalisation the store applies before comparing a typed signature. */
export const normName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const asDate = (v: number | string) => new Date(typeof v === 'string' ? `${v}T00:00:00` : v);
/** "4 November 2026" (locale-aware). */
export const longDate = (v: number | string) => asDate(v).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
/** "2026-10" → "October 2026". */
export function monthLabel(period: string, month: 'long' | 'short' = 'long') {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString(undefined, { month, year: 'numeric' });
}
export const fileSize = (kb?: number) => (kb === undefined ? '' : kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`);
export function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** My documents, newest first. People Ops never sees other people's files here. */
export function useMyDocuments(): EmployeeDocument[] {
  const me = useSessionUser();
  const documents = useHr((s) => s.documents);
  return useMemo(() => (me ? documents.filter((d) => d.userId === me.id).sort((a, b) => b.createdAt - a.createdAt) : []), [documents, me]);
}

export interface PolicyState {
  state: 'done' | 'updated' | 'todo';
  current?: PolicyAck;
  /** Latest acknowledgement of an older version. */
  older?: PolicyAck;
}

export function policyState(p: PolicyMeta, acks: PolicyAck[], userId: string | undefined): PolicyState {
  const mine = acks.filter((a) => a.userId === userId && a.policyId === p.id).sort((a, b) => b.version - a.version);
  const current = mine.find((a) => a.version === p.version);
  if (current) return { state: 'done', current };
  return mine.length ? { state: 'updated', older: mine[0] } : { state: 'todo' };
}

/** Print only the given sheet (letter, contract, payslip…), then clean up. */
export function printSheet(sheet: HTMLElement | null, title?: string) {
  if (!sheet) {
    window.print();
    return;
  }
  document.querySelectorAll('.hr-doc-print-root').forEach((n) => n.remove());
  const root = document.createElement('div');
  root.className = 'hr-doc-print-root';
  root.setAttribute('aria-hidden', 'true');
  root.appendChild(sheet.cloneNode(true));
  document.body.appendChild(root);
  document.body.classList.add('hr-doc-printing');
  const previousTitle = document.title;
  if (title) document.title = title;
  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup);
    root.remove();
    document.body.classList.remove('hr-doc-printing');
    document.title = previousTitle;
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
