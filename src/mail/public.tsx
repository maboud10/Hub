/**
 * Public App Bridge for Helix Mail — "Nova Inbox" (see src/lib/appBridge.ts).
 *
 * Powers ⌘K (actions + the top Nova-ranked threads), Settings → Reset demo,
 * Wellbeing · Rhythm (`rhythm`) and cross-app sending (`sendMail`, used by
 * People / Talent / CRM "Email" actions). Every call re-checks `app:mail`.
 */
import { BarChart3, CalendarClock, CheckCheck, Inbox, Mail, PenSquare, ShieldQuestion, Users } from 'lucide-react';
import type { BridgeViewer, MailBridge, PaletteEntry } from '@/lib/appBridge';
import { useHub } from '@/store/hub';
import { DEFAULT_QUIET, computeRhythm, inInbox, mergeApprovals, rankThreads, reasonText, resolveContact } from './engine';
import { buildMailbox } from './seed';
import { buildRankContext, useMail } from './store';
import type { MailboxData } from './types';

function hasMailAccess(viewer: BridgeViewer): boolean {
  return viewer.perms.has('*') || viewer.perms.has('app:mail');
}

/** The viewer's mailbox without mutating the store (palette + rhythm must be side-effect free). */
function boxFor(viewer: BridgeViewer): { box: MailboxData; live: boolean } {
  const st = useMail.getState();
  if (st.ownerId === viewer.user.id) return { box: st, live: true };
  const stored = st.others[viewer.user.id];
  if (stored) return { box: stored, live: false };
  return { box: buildMailbox(viewer.user.id, useHub.getState().users, Date.now(), st.contacts), live: false };
}

export const api: MailBridge = {
  appId: 'mail',

  paletteEntries(viewer) {
    if (!hasMailAccess(viewer)) return [];
    const st = useMail.getState();
    const { box } = boxFor(viewer);
    const now = Date.now();
    const users = useHub.getState().users;
    const out: PaletteEntry[] = [];
    const action = (id: string, title: string, to: string, icon: PaletteEntry['icon'], keywords: string[], subtitle: string) =>
      out.push({ id: `mail:${id}`, group: 'Actions', title, subtitle, to, icon, keywords: ['mail', 'email', 'inbox', 'nova', ...keywords], hint: 'Open' });

    action('compose', 'Compose email', '/mail?compose=1', <PenSquare />, ['compose', 'write', 'new email', 'send'], 'Draft with Nova, schedule around quiet hours');
    action('priority', 'Priority inbox', '/mail', <Inbox />, ['priority', 'triage', 'unread', 'brief'], 'Nova-ranked triage with reason chips');
    action('approvals', 'Approvals in Mail', '/mail?stream=approvals', <CheckCheck />, ['approvals', 'approve', 'leave', 'expenses', 'procurement'], 'Approve Procurement, HR, Expenses & Talent in place');
    action('screener', 'Mail Screener', '/mail/screener', <ShieldQuestion />, ['screener', 'phishing', 'new sender', 'block', 'trust'], 'Trust radar for first-contact senders');
    action('shared', 'Shared inboxes', '/mail/shared', <Users />, ['shared', 'team inbox', 'it-support', 'sales', 'sla'], 'Team mailboxes with SLA rings & collision detection');
    action('insights', 'Mail Insights', '/mail/insights', <BarChart3 />, ['insights', 'analytics', 'after hours', 'newsletters', 'carbon'], 'Reply-time trends, after-hours sending, clutter');
    action('snoozed', 'Snoozed & scheduled mail', '/mail/later', <CalendarClock />, ['snoozed', 'later', 'scheduled', 'follow up', 'reminders'], 'Wake-up timeline, scheduled sends, follow-up radar');

    const ctx = buildRankContext(viewer.user.id, users, st.contacts, now);
    const userMap = new Map(users.map((u) => [u.id, u]));
    const ranked = rankThreads(
      box.threads.filter((t) => inInbox(t, now, box.prefs) && t.stream !== 'feed' && t.stream !== 'paper'),
      ctx,
    ).slice(0, 15);
    for (const r of ranked) {
      const last = r.thread.messages[r.thread.messages.length - 1];
      const from = resolveContact(last.from, userMap, ctx.contacts);
      const why = r.reasons[0] ? reasonText(r.reasons[0], now) : r.thread.unread ? 'Unread' : 'Inbox';
      out.push({
        id: `mail:thread:${r.thread.id}`,
        group: 'Work',
        title: r.thread.subject,
        subtitle: `${from.name} · ${why}`,
        icon: <Mail />,
        glyphColor: '#38bdf8',
        keywords: ['mail', 'email', 'thread', from.name.toLowerCase(), ...r.thread.labels.map((l) => l.toLowerCase())],
        hint: 'Open thread',
        to: `/mail?thread=${r.thread.id}`,
      });
    }
    return out;
  },

  resetDemo() {
    useMail.getState().resetDemo();
  },

  rhythm(viewer) {
    if (!hasMailAccess(viewer)) return { afterHoursSentThisWeek: 0, unread: 0, avgReplyMins: 0 };
    const st = useMail.getState();
    const { box, live } = boxFor(viewer);
    const now = Date.now();
    const unreadPriority = box.threads.filter((t) => t.stream === 'priority' && t.unread && inInbox(t, now, box.prefs)).length;
    const approvals = mergeApprovals(live ? st.liveApprovals : [], box.approvals, box.decisions, now);
    return computeRhythm({ sentLog: box.sentLog, replyLog: box.replyLog, unreadPriority, pendingApprovals: approvals.pending.length }, DEFAULT_QUIET, now);
  },

  sendMail(viewer, input) {
    return useMail.getState().sendFromApp(viewer, input);
  },
};
