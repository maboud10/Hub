/**
 * Helix Mail — persisted Zustand store (`nexus-mail-v1`).
 *
 * One mailbox per owner (persona switching keeps each person's mail), global
 * external contacts and shared mailboxes, an undo-send window, scheduled sends
 * that respect quiet hours, and a `tick()` that wakes snoozed mail and fires
 * due scheduled sends. Every action is synchronous and side-effect free apart
 * from toasts, so it is fully unit-testable in Node.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { BridgeResult, BridgeViewer, NewMailFromApp } from '@/lib/appBridge';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import type { User } from '@/types';
import {
  DAY,
  MIN,
  UNDO_MS,
  applyScreenerDecision,
  assignConversation,
  contactIdForEmail,
  dayKey,
  dlpCheck,
  dueScheduled,
  emailDomain,
  isExternalRecipient,
  isHubKey,
  isValidEmail,
  lastInbound,
  replyToConversation,
  wakeDue,
  type RankContext,
  type ScreenerDecision,
} from './engine';
import { MAIL_DATA_VERSION, buildMailSeed, buildMailbox, seedPeople } from './seed';
import type {
  ApprovalDecision,
  ApprovalItem,
  CrmLink,
  MailContact,
  MailData,
  MailDraft,
  MailMessage,
  MailPrefs,
  MailStream,
  MailThread,
  MailboxData,
  ScheduleReason,
  SharedStatus,
} from './types';

/* ---------------- storage & toasts (pattern from meet/store) ---------------- */

const memoryMap = new Map<string, string>();
const safeStorage: Storage = {
  getItem: (k) => {
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') return localStorage.getItem(k);
    } catch {
      // fallback
    }
    return memoryMap.get(k) ?? null;
  },
  setItem: (k, v) => {
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
        localStorage.setItem(k, v);
        return;
      }
    } catch {
      // fallback
    }
    memoryMap.set(k, v);
  },
  removeItem: (k) => {
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.removeItem === 'function') {
        localStorage.removeItem(k);
        return;
      }
    } catch {
      // fallback
    }
    memoryMap.delete(k);
  },
  clear: () => memoryMap.clear(),
  key: (i) => [...memoryMap.keys()][i] ?? null,
  get length() {
    return memoryMap.size;
  },
};

function safeToast(kind: 'success' | 'info' | 'warning', title: string, desc?: string) {
  if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') toast[kind](title, desc);
}

/* ---------------- helpers ---------------- */

function hubUsers(): User[] {
  try {
    return useHub.getState().users ?? [];
  } catch {
    return [];
  }
}

function sessionOwner(): string {
  try {
    return useHub.getState().sessionUserId ?? 'u-layla';
  } catch {
    return 'u-layla';
  }
}

const MAILBOX_KEYS = ['ownerId', 'threads', 'scheduled', 'drafts', 'reminders', 'approvals', 'decisions', 'phish', 'sentLog', 'replyLog', 'history', 'prefs'] as const;

function snapshotOf(s: MailData): MailboxData {
  const out = {} as Record<string, unknown>;
  for (const k of MAILBOX_KEYS) out[k] = s[k];
  return out as unknown as MailboxData;
}

const rid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function hueOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) % 360;
  return h;
}

function prettyName(email: string): string {
  const local = email.split('@')[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(' ');
}

/** Rank context for the current owner (manager, reports, contacts). */
export function buildRankContext(ownerId: string, users: User[], contacts: MailContact[], now = Date.now()): RankContext {
  const p = seedPeople(ownerId, users);
  return {
    ownerId,
    managerKey: p.managerKey,
    reportIds: p.users.filter((u) => u.managerId === ownerId && u.active).map((u) => u.id),
    contacts: new Map(contacts.map((c) => [c.id, c])),
    now,
    ownerFirstName: p.owner.name.split(/\s+/)[0],
  };
}

export interface ResolvedRecipients {
  keys: string[];
  created: MailContact[];
  invalid: string[];
}

/** Map composer entries (hub ids, contact ids, raw emails) to contact keys, creating external contacts as needed. */
export function resolveRecipients(entries: string[], users: User[], contacts: MailContact[]): ResolvedRecipients {
  const keys: string[] = [];
  const created: MailContact[] = [];
  const invalid: string[] = [];
  const all = [...contacts];
  for (const raw of entries) {
    const e = raw.trim();
    if (!e) continue;
    if (isHubKey(e)) {
      if (users.some((u) => u.id === e) || !users.length) keys.push(e);
      else invalid.push(e);
      continue;
    }
    if (e.startsWith('x-') && all.some((c) => c.id === e)) {
      keys.push(e);
      continue;
    }
    if (!isValidEmail(e)) {
      invalid.push(e);
      continue;
    }
    const lower = e.toLowerCase();
    const user = users.find((u) => u.email.toLowerCase() === lower);
    if (user) {
      keys.push(user.id);
      continue;
    }
    const existing = all.find((c) => c.email.toLowerCase() === lower);
    if (existing) {
      keys.push(existing.id);
      continue;
    }
    const domain = emailDomain(lower);
    const contact: MailContact = {
      id: contactIdForEmail(lower),
      name: prettyName(lower),
      email: lower,
      org: domain,
      kind: domain === 'helix.co' ? 'internal' : 'person',
      domain,
      avatarHue: hueOf(lower),
      internal: domain === 'helix.co' || undefined,
    };
    created.push(contact);
    all.push(contact);
    keys.push(contact.id);
  }
  return { keys: [...new Set(keys)], created, invalid };
}

/* ---------------- store ---------------- */

export interface SendResult {
  ok: boolean;
  error?: string;
  threadId?: string;
}

export interface MailActions {
  ensureOwner(userId: string): void;
  tick(now?: number): { woke: string[]; sent: string[] };
  // threads
  openThread(id: string): void;
  setRead(ids: string[], read: boolean): void;
  archive(ids: string[]): void;
  moveToInbox(ids: string[]): void;
  trash(ids: string[]): void;
  toggleStar(id: string): void;
  snooze(ids: string[], until: number, now?: number): void;
  unsnooze(id: string): void;
  toggleLabel(ids: string[], label: string): void;
  toggleMute(id: string): void;
  moveToStream(ids: string[], stream: MailStream): void;
  linkCrm(threadId: string, link: CrmLink | null): void;
  setThreadTicket(threadId: string, ticket: { id: string; to: string }): void;
  noteChatShare(threadId: string): void;
  noteProjectTasks(threadId: string, titles: string[]): void;
  toggleFollowUp(threadId: string): void;
  // drafts & sending
  createDraft(init?: Partial<MailDraft>): string;
  updateDraft(id: string, patch: Partial<MailDraft>): void;
  discardDraft(id: string): void;
  queueSend(draftId: string, now?: number): SendResult;
  undoSend(): string | null;
  commitSend(now?: number): string | null;
  scheduleDraft(draftId: string, at: number, reason: ScheduleReason, now?: number): SendResult;
  cancelScheduled(id: string): string | null;
  sendScheduledNow(id: string, now?: number): string | null;
  // reminders
  addReminder(text: string, dueAt: number, threadId?: string): void;
  toggleReminder(id: string): void;
  removeReminder(id: string): void;
  // screener
  screen(contactId: string, decision: ScreenerDecision, now?: number): string[];
  setPhishTicket(contactId: string, ticket: { id: string; to: string }): void;
  // shared
  assignShared(convId: string, userId: string | null, now?: number): void;
  replyShared(convId: string, body: string, now?: number): void;
  addSharedNote(convId: string, text: string, now?: number): void;
  setSharedStatus(convId: string, status: SharedStatus, now?: number): void;
  setSharedTicket(convId: string, ticket: { id: string; to: string }): void;
  // approvals
  setLiveApprovals(items: ApprovalItem[], now?: number): void;
  recordDecision(item: ApprovalItem, decision: ApprovalDecision): void;
  // insights & prefs
  unsubscribe(contactIds: string[]): number;
  offloadAttachments(attachmentIds: string[]): number;
  setPrefs(patch: Partial<MailPrefs>): void;
  celebrateZero(now?: number): number;
  // bridge
  sendFromApp(viewer: BridgeViewer, input: NewMailFromApp, now?: number): BridgeResult<{ threadId: string; to: string }>;
  resetDemo(): void;
}

export type MailStore = MailData & MailActions;

const mapThreads = (threads: MailThread[], ids: string[], fn: (t: MailThread) => MailThread) => {
  const set = new Set(ids);
  return threads.map((t) => (set.has(t.id) ? fn(t) : t));
};

export const useMail = create<MailStore>()(
  persist(
    (set, get) => {
      /** Deliver a draft as the current owner. Returns the patch + thread id (no `set`). */
      const deliver = (s: MailData, draft: MailDraft, now: number): { patch: Partial<MailData>; threadId: string } => {
        const users = hubUsers();
        const toR = resolveRecipients(draft.to, users, s.contacts);
        const ccR = resolveRecipients(draft.cc, users, [...s.contacts, ...toR.created]);
        const contacts = [...s.contacts, ...toR.created, ...ccR.created];
        const contactMap = new Map(contacts.map((c) => [c.id, c]));
        const to = toR.keys.filter((k) => k !== s.ownerId);
        const cc = ccR.keys.filter((k) => k !== s.ownerId && !to.includes(k));
        const anyExternal = [...to, ...cc].some((k) => isExternalRecipient(k, contactMap));
        const msg: MailMessage = {
          id: rid('msg'),
          from: s.ownerId,
          to,
          cc,
          at: now,
          body: draft.body.trim() || ' ',
          attachments: draft.attachments.length ? draft.attachments : undefined,
          delivery: anyExternal ? 'accepted' : 'delivered',
          sensitivity: draft.sensitivity,
        };
        const subject = draft.subject.trim() || '(no subject)';
        let threads = s.threads;
        let threadId: string;
        let replyLog = s.replyLog;
        const existing = draft.threadId && draft.mode !== 'forward' ? s.threads.find((t) => t.id === draft.threadId) : undefined;
        if (existing) {
          threadId = existing.id;
          const inbound = lastInbound(existing, s.ownerId);
          if (inbound && draft.mode !== 'new') replyLog = [...replyLog, Math.max(1, Math.round((now - inbound.at) / MIN))].slice(-40);
          threads = s.threads.map((t) => (t.id === existing.id ? { ...t, messages: [...t.messages, msg], unread: false } : t));
        } else {
          threadId = rid('th');
          const thread: MailThread = {
            id: threadId,
            subject,
            stream: 'priority',
            folder: 'sent',
            labels: [],
            messages: [msg],
            unread: false,
            starred: false,
            followUp: anyExternal ? { active: true, afterDays: 3 } : null,
            source: draft.source,
          };
          threads = [thread, ...s.threads];
        }
        // Hub recipients get it in their own Nova Inbox.
        const others = { ...s.others };
        const inbound = { ...s.inbound };
        for (const key of [...to, ...cc]) {
          if (!isHubKey(key)) continue;
          const copy: MailThread = {
            id: `in-${msg.id}-${key}`,
            subject: existing && !subject.toLowerCase().startsWith('re:') ? `Re: ${existing.subject}` : subject,
            stream: 'priority',
            folder: 'inbox',
            labels: [],
            messages: [{ ...msg, id: `${msg.id}-${key}` }],
            unread: true,
            starred: false,
            source: draft.source,
          };
          if (others[key]) others[key] = { ...others[key], threads: [copy, ...others[key].threads] };
          else inbound[key] = [copy, ...(inbound[key] ?? [])];
        }
        return { patch: { threads, contacts, others, inbound, replyLog, sentLog: [...s.sentLog, now] }, threadId };
      };

      const validate = (s: MailData, d: MailDraft): string | null => {
        const entries = [...d.to, ...d.cc].filter((x) => x.trim());
        if (!d.to.filter((x) => x.trim()).length) return 'Add at least one recipient.';
        const users = hubUsers();
        const r = resolveRecipients(entries, users, s.contacts);
        if (r.invalid.length) return `Check these addresses: ${r.invalid.join(', ')}`;
        const contactMap = new Map([...s.contacts, ...r.created].map((c) => [c.id, c]));
        const dlp = dlpCheck(d, (k) => isExternalRecipient(k, contactMap));
        if (dlp.level === 'block') return 'Blocked by DLP: a confidential file can’t go to an external recipient. Share it as a protected link instead.';
        return null;
      };

      return {
        ...buildMailSeed(sessionOwner(), hubUsers()),

        ensureOwner(userId) {
          const s = get();
          if (!userId || s.ownerId === userId) return;
          if (s.pending) get().commitSend();
          const cur = get();
          const others = { ...cur.others, [cur.ownerId]: snapshotOf(cur) };
          const stored = others[userId];
          delete others[userId];
          const box = stored ?? buildMailbox(userId, hubUsers(), Date.now(), cur.contacts);
          const delivered = cur.inbound[userId] ?? [];
          const inbound = { ...cur.inbound };
          delete inbound[userId];
          set({ ...box, threads: [...delivered, ...box.threads], others, inbound, liveApprovals: [], liveApprovalsAt: null, pending: null });
        },

        tick(now = Date.now()) {
          const s0 = get();
          if (s0.pending && now >= s0.pending.commitAt) get().commitSend(now);
          const s = get();
          const { threads, woke } = wakeDue(s.threads, now);
          let patch: Partial<MailData> = woke.length ? { threads } : {};
          const sent: string[] = [];
          const due = dueScheduled(s.scheduled, now);
          if (due.length) {
            let working: MailData = { ...s, ...patch } as MailData;
            const scheduled = [...s.scheduled];
            for (const item of due) {
              const { patch: p, threadId } = deliver(working, item.draft, now);
              working = { ...working, ...p } as MailData;
              const idx = scheduled.findIndex((x) => x.id === item.id);
              scheduled[idx] = { ...item, status: 'sent', sentAt: now, threadId };
              sent.push(item.id);
            }
            patch = { ...patch, threads: working.threads, contacts: working.contacts, others: working.others, inbound: working.inbound, sentLog: working.sentLog, replyLog: working.replyLog, scheduled };
          }
          if (woke.length || sent.length) set(patch);
          if (woke.length) safeToast('info', 'Snoozed mail is back', s.threads.find((t) => t.id === woke[0])?.subject);
          if (sent.length) safeToast('success', 'Scheduled email sent', due[0]?.draft.subject);
          return { woke, sent };
        },

        openThread(id) {
          set((s) => ({ threads: mapThreads(s.threads, [id], (t) => (t.unread ? { ...t, unread: false } : t)) }));
        },
        setRead(ids, read) {
          set((s) => ({ threads: mapThreads(s.threads, ids, (t) => ({ ...t, unread: !read })) }));
        },
        archive(ids) {
          set((s) => ({ threads: mapThreads(s.threads, ids, (t) => (t.folder === 'inbox' ? { ...t, folder: 'archive', unread: false, snoozedUntil: null } : t)) }));
        },
        moveToInbox(ids) {
          set((s) => ({ threads: mapThreads(s.threads, ids, (t) => ({ ...t, folder: 'inbox', snoozedUntil: null })) }));
        },
        trash(ids) {
          set((s) => ({ threads: mapThreads(s.threads, ids, (t) => ({ ...t, folder: 'trash', unread: false })) }));
        },
        toggleStar(id) {
          set((s) => ({ threads: mapThreads(s.threads, [id], (t) => ({ ...t, starred: !t.starred })) }));
        },
        snooze(ids, until, now = Date.now()) {
          set((s) => ({ threads: mapThreads(s.threads, ids, (t) => ({ ...t, snoozedUntil: until, snoozedAt: now, folder: t.folder === 'archive' ? 'inbox' : t.folder })) }));
        },
        unsnooze(id) {
          set((s) => ({ threads: mapThreads(s.threads, [id], (t) => ({ ...t, snoozedUntil: null, snoozedAt: null, unread: true })) }));
        },
        toggleLabel(ids, label) {
          set((s) => {
            const all = s.threads.filter((t) => ids.includes(t.id)).every((t) => t.labels.includes(label));
            return { threads: mapThreads(s.threads, ids, (t) => ({ ...t, labels: all ? t.labels.filter((l) => l !== label) : [...new Set([...t.labels, label])] })) };
          });
        },
        toggleMute(id) {
          set((s) => ({ threads: mapThreads(s.threads, [id], (t) => ({ ...t, muted: !t.muted })) }));
        },
        moveToStream(ids, stream) {
          set((s) => ({ threads: mapThreads(s.threads, ids, (t) => ({ ...t, stream })) }));
        },
        linkCrm(threadId, link) {
          set((s) => ({ threads: mapThreads(s.threads, [threadId], (t) => ({ ...t, crm: link })) }));
        },
        setThreadTicket(threadId, ticket) {
          set((s) => ({ threads: mapThreads(s.threads, [threadId], (t) => ({ ...t, ticket })) }));
        },
        noteChatShare(threadId) {
          set((s) => ({ threads: mapThreads(s.threads, [threadId], (t) => ({ ...t, chatShares: (t.chatShares ?? 0) + 1 })) }));
        },
        noteProjectTasks(threadId, titles) {
          set((s) => ({ threads: mapThreads(s.threads, [threadId], (t) => ({ ...t, projectTasks: [...new Set([...(t.projectTasks ?? []), ...titles])] })) }));
        },
        toggleFollowUp(threadId) {
          set((s) => ({
            threads: mapThreads(s.threads, [threadId], (t) => ({ ...t, followUp: t.followUp?.active ? { ...t.followUp, active: false } : { active: true, afterDays: t.followUp?.afterDays ?? 3 } })),
          }));
        },

        createDraft(init = {}) {
          const now = Date.now();
          const draft: MailDraft = {
            id: rid('dr'),
            to: [],
            cc: [],
            subject: '',
            body: '',
            attachments: [],
            sensitivity: 'internal',
            mode: 'new',
            ...init,
            createdAt: now,
            updatedAt: now,
          };
          set((s) => ({ drafts: [draft, ...s.drafts.filter((d) => d.id !== draft.id)] }));
          return draft.id;
        },
        updateDraft(id, patch) {
          set((s) => ({ drafts: s.drafts.map((d) => (d.id === id ? { ...d, ...patch, updatedAt: Date.now() } : d)) }));
        },
        discardDraft(id) {
          set((s) => ({ drafts: s.drafts.filter((d) => d.id !== id) }));
        },

        queueSend(draftId, now = Date.now()) {
          const s = get();
          const draft = s.drafts.find((d) => d.id === draftId);
          if (!draft) return { ok: false, error: 'Draft not found.' };
          const err = validate(s, draft);
          if (err) return { ok: false, error: err };
          if (s.pending) get().commitSend(now);
          set((st) => ({ pending: { id: rid('ps'), draft, createdAt: now, commitAt: now + UNDO_MS }, drafts: st.drafts.filter((d) => d.id !== draftId) }));
          return { ok: true };
        },
        undoSend() {
          const p = get().pending;
          if (!p) return null;
          set((s) => ({ pending: null, drafts: [{ ...p.draft, updatedAt: Date.now() }, ...s.drafts.filter((d) => d.id !== p.draft.id)] }));
          return p.draft.id;
        },
        commitSend(now = Date.now()) {
          const s = get();
          if (!s.pending) return null;
          const { patch, threadId } = deliver(s, s.pending.draft, now);
          set({ ...patch, pending: null });
          return threadId;
        },
        scheduleDraft(draftId, at, reason, now = Date.now()) {
          const s = get();
          const draft = s.drafts.find((d) => d.id === draftId);
          if (!draft) return { ok: false, error: 'Draft not found.' };
          const err = validate(s, draft);
          if (err) return { ok: false, error: err };
          if (at <= now) return { ok: false, error: 'Pick a time in the future.' };
          set((st) => ({
            scheduled: [{ id: rid('sc'), draft, sendAt: at, reason, createdAt: now, status: 'scheduled' as const }, ...st.scheduled],
            drafts: st.drafts.filter((d) => d.id !== draftId),
          }));
          return { ok: true };
        },
        cancelScheduled(id) {
          const item = get().scheduled.find((x) => x.id === id);
          if (!item || item.status !== 'scheduled') return null;
          set((s) => ({ scheduled: s.scheduled.filter((x) => x.id !== id), drafts: [{ ...item.draft, updatedAt: Date.now() }, ...s.drafts.filter((d) => d.id !== item.draft.id)] }));
          return item.draft.id;
        },
        sendScheduledNow(id, now = Date.now()) {
          const s = get();
          const item = s.scheduled.find((x) => x.id === id);
          if (!item || item.status !== 'scheduled') return null;
          const { patch, threadId } = deliver(s, item.draft, now);
          set({ ...patch, scheduled: s.scheduled.map((x) => (x.id === id ? { ...x, status: 'sent', sentAt: now, threadId } : x)) });
          return threadId;
        },

        addReminder(text, dueAt, threadId) {
          const clean = text.trim();
          if (!clean) return;
          set((s) => ({ reminders: [...s.reminders, { id: rid('rm'), text: clean, dueAt, threadId, done: false }].sort((a, b) => a.dueAt - b.dueAt) }));
        },
        toggleReminder(id) {
          set((s) => ({ reminders: s.reminders.map((r) => (r.id === id ? { ...r, done: !r.done } : r)) }));
        },
        removeReminder(id) {
          set((s) => ({ reminders: s.reminders.filter((r) => r.id !== id) }));
        },

        screen(contactId, decision, now = Date.now()) {
          const s = get();
          const { threads, contacts, moved } = applyScreenerDecision(s.threads, s.contacts, contactId, decision);
          set({ threads, contacts, phish: decision.kind === 'report' ? { ...s.phish, [contactId]: { reportedAt: now } } : s.phish });
          return moved;
        },
        setPhishTicket(contactId, ticket) {
          set((s) => ({ phish: { ...s.phish, [contactId]: { reportedAt: s.phish[contactId]?.reportedAt ?? Date.now(), ticketId: ticket.id, ticketTo: ticket.to } } }));
        },

        assignShared(convId, userId, now = Date.now()) {
          set((s) => ({ shared: s.shared.map((c) => (c.id === convId ? assignConversation(c, userId, now) : c)) }));
        },
        replyShared(convId, body, now = Date.now()) {
          const clean = body.trim();
          if (!clean) return;
          set((s) => ({ shared: s.shared.map((c) => (c.id === convId ? replyToConversation(c, s.ownerId, clean, now) : c)) }));
        },
        addSharedNote(convId, text, now = Date.now()) {
          const clean = text.trim();
          if (!clean) return;
          set((s) => ({ shared: s.shared.map((c) => (c.id === convId ? { ...c, notes: [...c.notes, { id: rid('nt'), authorId: s.ownerId, text: clean, at: now }] } : c)) }));
        },
        setSharedStatus(convId, status, now = Date.now()) {
          set((s) => ({
            shared: s.shared.map((c) =>
              c.id === convId
                ? { ...c, status, resolvedAt: status === 'resolved' ? now : undefined, assigneeId: status === 'new' ? null : (c.assigneeId ?? (status === 'assigned' ? s.ownerId : c.assigneeId)) }
                : c,
            ),
          }));
        },
        setSharedTicket(convId, ticket) {
          set((s) => ({ shared: s.shared.map((c) => (c.id === convId ? { ...c, ticket } : c)) }));
        },

        setLiveApprovals(items, now = Date.now()) {
          set({ liveApprovals: items, liveApprovalsAt: now });
        },
        recordDecision(item, decision) {
          set((s) => ({ decisions: { ...s.decisions, [item.id]: { ...decision, item } } }));
        },

        unsubscribe(contactIds) {
          const s = get();
          const ids = new Set(contactIds);
          let archived = 0;
          const threads = s.threads.map((t) => {
            if (t.folder === 'inbox' && t.messages.some((m) => ids.has(m.from))) {
              archived += 1;
              return { ...t, folder: 'archive' as const, unread: false };
            }
            return t;
          });
          set({ threads, contacts: s.contacts.map((c) => (ids.has(c.id) ? { ...c, unsubscribed: true } : c)) });
          return archived;
        },
        offloadAttachments(attachmentIds) {
          const ids = new Set(attachmentIds);
          let kb = 0;
          set((s) => ({
            threads: s.threads.map((t) => ({
              ...t,
              messages: t.messages.map((m) =>
                m.attachments?.some((a) => ids.has(a.id))
                  ? {
                      ...m,
                      attachments: m.attachments.map((a) => {
                        if (!ids.has(a.id) || a.offloaded) return a;
                        kb += a.sizeKb;
                        return { ...a, offloaded: true };
                      }),
                    }
                  : m,
              ),
            })),
          }));
          return kb;
        },
        setPrefs(patch) {
          set((s) => ({ prefs: { ...s.prefs, ...patch } }));
        },
        celebrateZero(now = Date.now()) {
          const p = get().prefs;
          const today = dayKey(now);
          if (p.zeroLastDay === today) return p.zeroStreak;
          const streak = p.zeroLastDay === dayKey(now - DAY) ? p.zeroStreak + 1 : 1;
          set((s) => ({ prefs: { ...s.prefs, zeroStreak: streak, zeroLastDay: today } }));
          return streak;
        },

        sendFromApp(viewer, input, now = Date.now()) {
          if (!viewer?.user) return { ok: false, error: 'Sign in to send email.' };
          if (!viewer.perms.has('*') && !viewer.perms.has('app:mail')) return { ok: false, error: 'You need Helix Mail access to send email.' };
          const to = (input.to ?? []).map((x) => x.trim()).filter(Boolean);
          if (!to.length) return { ok: false, error: 'Add at least one recipient.' };
          if (!input.subject?.trim()) return { ok: false, error: 'Add a subject.' };
          get().ensureOwner(viewer.user.id);
          const s = get();
          const r = resolveRecipients(to, hubUsers(), s.contacts);
          if (r.invalid.length) return { ok: false, error: `Check these addresses: ${r.invalid.join(', ')}` };
          const draft: MailDraft = {
            id: rid('dr'),
            to,
            cc: [],
            subject: input.subject.trim(),
            body: input.body?.trim() || input.subject.trim(),
            attachments: [],
            sensitivity: 'internal',
            mode: 'new',
            createdAt: now,
            updatedAt: now,
            source: input.source,
          };
          const { patch, threadId } = deliver(s, draft, now);
          set(patch);
          return { ok: true, threadId, to: `/mail?thread=${threadId}` };
        },

        resetDemo() {
          const owner = sessionOwner() || get().ownerId;
          set({ ...buildMailSeed(owner, hubUsers()) });
          safeToast('info', 'Helix Mail reset to the demo seed');
        },
      };
    },
    {
      name: 'nexus-mail-v1',
      version: MAIL_DATA_VERSION,
      storage: createJSONStorage(() => safeStorage),
      migrate: (persisted, version) => (version === MAIL_DATA_VERSION ? (persisted as MailStore) : (buildMailSeed(sessionOwner(), hubUsers()) as MailStore)),
    },
  ),
);
