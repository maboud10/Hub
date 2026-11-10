/**
 * Pulse Chat permission policy (pure). The store and the App Bridge both call these — the UI hiding a
 * button is only UX, never security.
 *
 *  - Public channels: visible to every employee; contractors only see channels they're members of.
 *  - Private channels, DMs, group DMs and app conversations: members only (workspace admins can't read DMs).
 *  - Posting requires membership; announcement-only channels (`posting: 'admins'`) also require being a
 *    channel admin or holding `hub.news.publish`.
 *  - Channel admins (and workspace moderators) edit the topic and remove members.
 *  - Workspace moderation (`hub.users.manage`, incl. `*`): delete any message (audited).
 */
import type { User } from '@/types';
import { hasPermission } from '@/lib/rbac';
import type { ChatMessage, Conversation } from './types';

export interface ChatViewer {
  id: string;
  perms: ReadonlySet<string>;
  /** Contractors (scoped access): only see channels they're a member of. */
  contractor: boolean;
}

export type Gate = { ok: true } | { ok: false; reason: string };
const allow: Gate = { ok: true };
const deny = (reason: string): Gate => ({ ok: false, reason });

export function toViewer(user: Pick<User, 'id' | 'roleIds'>, perms: ReadonlySet<string>): ChatViewer {
  return { id: user.id, perms, contractor: user.roleIds.includes('contractor') && !perms.has('*') };
}

export const isModerator = (v: ChatViewer) => hasPermission(v.perms, 'hub.users.manage');
export const canAnnounce = (v: ChatViewer) => hasPermission(v.perms, 'hub.news.publish');
export const canUseChat = (v: ChatViewer) => hasPermission(v.perms, 'app:chat');
export const canGiveKudos = (v: ChatViewer) => hasPermission(v.perms, 'hub.kudos.give');
export const canCreateChannel = (v: ChatViewer) => canUseChat(v) && !v.contractor;

export const isMember = (c: Conversation, userId: string) => c.memberIds.includes(userId);
export const isChannelAdmin = (c: Conversation, userId: string) => c.kind === 'channel' && c.adminIds.includes(userId);

/** May the viewer see this conversation (in lists) and read its messages? */
export function canView(c: Conversation, v: ChatViewer): boolean {
  if (isMember(c, v.id)) return true;
  if (c.kind !== 'channel') return false; // DMs / groups / app conversations: members only
  if (c.visibility === 'private') return false;
  return !v.contractor;
}

export function canJoin(c: Conversation, v: ChatViewer): boolean {
  return c.kind === 'channel' && !c.archived && !isMember(c, v.id) && c.visibility === 'public' && !v.contractor && canUseChat(v);
}

export function canLeave(c: Conversation, v: ChatViewer): boolean {
  return c.kind === 'channel' && isMember(c, v.id) && !c.mandatory;
}

/** Can the viewer post a (human) message here? */
export function canPost(c: Conversation, v: ChatViewer): Gate {
  if (!canUseChat(v)) return deny('Pulse Chat isn’t enabled for your account.');
  if (c.archived) return deny('This channel is archived.');
  if (!isMember(c, v.id)) {
    if (c.kind === 'channel' && canJoin(c, v)) return deny(`Join #${c.name} to post.`);
    return deny('You’re not a member of this conversation.');
  }
  if (c.kind === 'app') return allow;
  if (c.posting === 'admins' && !isChannelAdmin(c, v.id) && !canAnnounce(v)) return deny(`Only admins and People Ops can post in #${c.name}.`);
  return allow;
}

/** Can an integration bot post here on the viewer's behalf (App Bridge `asBot`)? */
export function canBotPost(c: Conversation, v: ChatViewer): Gate {
  if (c.archived) return deny('This channel is archived.');
  if (!canView(c, v)) return deny('You can’t see that conversation.');
  if (c.posting === 'admins' && !isChannelAdmin(c, v.id) && !canAnnounce(v)) return deny(`Only admins and People Ops can post in #${c.name}.`);
  return allow;
}

/** Edit topic / description, remove members. */
export function canManage(c: Conversation, v: ChatViewer): boolean {
  if (c.kind !== 'channel') return false;
  return isChannelAdmin(c, v.id) || (isModerator(v) && canView(c, v));
}

/** Add people: any member of a channel or group (contractors may not invite). */
export function canInvite(c: Conversation, v: ChatViewer): boolean {
  if (c.kind === 'dm' || c.kind === 'app') return false;
  if (c.archived || v.contractor) return false;
  return isMember(c, v.id);
}

export function canEditMessage(m: ChatMessage, v: ChatViewer): boolean {
  return m.authorId === v.id && !m.deleted && !m.system;
}

/** `own` = author deleting; `moderator` = workspace moderation (audited). */
export function deleteMode(m: ChatMessage, c: Conversation, v: ChatViewer): 'own' | 'moderator' | null {
  if (m.deleted) return null;
  if (m.authorId === v.id) return 'own';
  if (isModerator(v) && canView(c, v)) return 'moderator';
  return null;
}

export function canPin(c: Conversation, v: ChatViewer): boolean {
  return isMember(c, v.id) && !c.archived;
}

export function canClosePoll(m: ChatMessage, c: Conversation, v: ChatViewer): boolean {
  return m.authorId === v.id || isChannelAdmin(c, v.id) || (isModerator(v) && canView(c, v));
}

export function canRemoveMember(c: Conversation, v: ChatViewer, targetId: string): Gate {
  if (!canManage(c, v)) return deny('Only channel admins can remove people.');
  if (c.mandatory) return deny(`Everyone stays in #${c.name}.`);
  if (targetId === v.id) return deny('Use “Leave channel” instead.');
  if (!isMember(c, targetId)) return deny('They’re not a member.');
  return allow;
}
