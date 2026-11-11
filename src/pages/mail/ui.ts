/**
 * Helix Mail — ephemeral UI state (composer dock, overlays). Not persisted:
 * drafts themselves live (and autosave) in the Mail store.
 */
import { create } from 'zustand';
import { lastInbound, lastMessage } from '@/mail/engine';
import { useMail } from '@/mail/store';
import type { DraftMode, MailDraft, MailThread } from '@/mail/types';

interface MailUiState {
  /** Draft ids open in the composer dock (oldest first). */
  dock: string[];
  /** Expanded (focused) draft; others show as minimised chips. */
  active: string | null;
  /** Large, centred composer. */
  expanded: boolean;
  shortcutsOpen: boolean;
  openDraft(id: string): void;
  minimize(): void;
  closeDraft(id: string): void;
  setExpanded(v: boolean): void;
  setShortcuts(v: boolean): void;
}

export const useMailUi = create<MailUiState>()((set) => ({
  dock: [],
  active: null,
  expanded: false,
  shortcutsOpen: false,
  openDraft: (id) => set((s) => ({ dock: s.dock.includes(id) ? s.dock : [...s.dock, id].slice(-3), active: id })),
  minimize: () => set({ active: null, expanded: false }),
  closeDraft: (id) => set((s) => ({ dock: s.dock.filter((d) => d !== id), active: s.active === id ? null : s.active, expanded: s.active === id ? false : s.expanded })),
  setExpanded: (expanded) => set({ expanded }),
  setShortcuts: (shortcutsOpen) => set({ shortcutsOpen }),
}));

/** Create a draft and open it in the composer. */
export function openComposer(init: Partial<MailDraft> = {}): string {
  const id = useMail.getState().createDraft(init);
  useMailUi.getState().openDraft(id);
  return id;
}

const prefixed = (prefix: string, subject: string) => (subject.toLowerCase().startsWith(prefix.toLowerCase()) ? subject : `${prefix} ${subject}`);

/** Reply / reply-all / forward draft for a thread. */
export function composeFor(thread: MailThread, mode: Exclude<DraftMode, 'new'>, ownerId: string, body = ''): string {
  const inbound = lastInbound(thread, ownerId);
  const last = lastMessage(thread);
  if (mode === 'forward') {
    const src = inbound ?? last;
    return openComposer({
      mode,
      threadId: thread.id,
      subject: prefixed('Fwd:', thread.subject),
      body: `${body}\n\n---------- Forwarded message ----------\n${src.body}`.trimStart(),
      attachments: src.attachments ?? [],
      to: [],
      cc: [],
    });
  }
  const base = inbound ?? last;
  const to = base.from === ownerId ? base.to : [base.from];
  const cc = mode === 'replyAll' ? [...new Set([...base.to, ...base.cc])].filter((k) => k !== ownerId && !to.includes(k)) : [];
  return openComposer({ mode, threadId: thread.id, subject: prefixed('Re:', thread.subject), body, to, cc });
}
