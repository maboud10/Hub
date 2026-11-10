/**
 * UI-level actions that cross app boundaries (Projects, IT Helpdesk, Drive) through the App Bridge.
 * Bridges load lazily and may be mid-rebuild → every call degrades to a friendly toast.
 */
import { currentViewer, loadBridge, type BridgeFile, type BridgeProject } from '@/lib/appBridge';
import { toast } from '@/store/toast';
import { dmId } from '@/chat/ids';
import { toPlainText } from '@/chat/markdown';
import { useChat } from '@/chat/store';
import type { ChatMessage, Conversation } from '@/chat/types';

const convName = (c: Conversation) => (c.kind === 'channel' ? `#${c.name}` : 'a direct message');
const msgLink = (m: ChatMessage) => (m.parentId ? `/chat/c/${m.convId}?thread=${m.parentId}&msg=${m.id}` : `/chat/c/${m.convId}?msg=${m.id}`);

export function suggestTitle(m: ChatMessage): string {
  const t = toPlainText(m.text).replace(/^@\w+\s*/, '');
  const first = /^(.{8,}?[.!?])(\s|$)/.exec(t)?.[1] ?? t;
  return (first || m.card?.title || m.poll?.question || 'Follow up').slice(0, 120);
}

/** The project a channel is linked to (e.g. #proj-prism → prj-prism). */
export const linkedProjectId = (c: Conversation | undefined) => (c?.linked?.app === 'projects' ? c.linked.to.split('/').pop()?.split('?')[0] : undefined);

export async function listWritableProjects(): Promise<BridgeProject[]> {
  const viewer = currentViewer();
  if (!viewer) return [];
  try {
    const api = await loadBridge('projects');
    return api.listProjects(viewer, { writableOnly: true });
  } catch {
    return [];
  }
}

export async function createTaskFromMessage(m: ChatMessage, c: Conversation, input: { title: string; projectId?: string; dueDate?: string; notes?: string }): Promise<boolean> {
  const viewer = currentViewer();
  if (!viewer) return false;
  try {
    const api = await loadBridge('projects');
    const res = api.createTask(viewer, {
      title: input.title.trim(),
      notes: input.notes ?? toPlainText(m.text).slice(0, 1000),
      projectId: input.projectId || undefined,
      dueDate: input.dueDate || undefined,
      source: { app: 'chat', label: `Pulse Chat · ${convName(c)}`, to: msgLink(m) },
    });
    if (!res.ok) {
      toast.error('Couldn’t create the task', res.error);
      return false;
    }
    const project = input.projectId ? api.listProjects(viewer).find((p) => p.id === input.projectId)?.name : undefined;
    useChat.getState().send(
      c.id,
      { text: '', parentId: m.parentId ?? m.id, card: { app: 'projects', title: input.title.trim(), subtitle: project ? `Task in ${project}` : 'Personal task · My Tasks', to: res.to, status: 'To do' } },
      { bot: 'bot-projects', internal: true, silent: true },
    );
    toast.success('Task created', project ? `Added to ${project}` : 'Added to My Tasks');
    return true;
  } catch {
    toast.error('Helix Projects is updating', 'Try again in a moment.');
    return false;
  }
}

export async function createTasksFromRecap(m: ChatMessage, c: Conversation): Promise<number> {
  const viewer = currentViewer();
  if (!viewer || !m.huddle) return 0;
  try {
    const api = await loadBridge('projects');
    const projectId = linkedProjectId(c);
    let n = 0;
    for (const ai of m.huddle.actionItems) {
      if (ai.taskTo) continue;
      const res = api.createTask(viewer, {
        title: ai.text,
        projectId,
        assigneeId: ai.ownerId,
        source: { app: 'chat', label: `Huddle recap · ${convName(c)}`, to: msgLink(m) },
      });
      if (res.ok) {
        useChat.getState().setActionItemTask(m.id, ai.id, res.to);
        n += 1;
      } else {
        toast.error('Couldn’t create a task', res.error);
        break;
      }
    }
    if (n) toast.success(`${n} task${n === 1 ? '' : 's'} created`, projectId ? 'Added to the linked project' : 'Assigned to their owners');
    return n;
  } catch {
    toast.error('Helix Projects is updating', 'Try again in a moment.');
    return 0;
  }
}

export async function createTaskQuick(title: string, c: Conversation | undefined): Promise<boolean> {
  const viewer = currentViewer();
  if (!viewer) return false;
  try {
    const api = await loadBridge('projects');
    const projectId = linkedProjectId(c);
    const res = api.createTask(viewer, { title, projectId, source: c ? { app: 'chat', label: `Pulse Chat · ${convName(c)}`, to: `/chat/c/${c.id}` } : undefined });
    if (!res.ok) {
      toast.error('Couldn’t create the task', res.error);
      return false;
    }
    if (c) {
      const project = projectId ? api.listProjects(viewer).find((p) => p.id === projectId)?.name : undefined;
      useChat.getState().send(c.id, { text: '', card: { app: 'projects', title, subtitle: project ? `Task in ${project}` : 'Personal task · My Tasks', to: res.to, status: 'To do' } }, { bot: 'bot-projects', internal: true, silent: true });
    }
    toast.success('Task created', title);
    return true;
  } catch {
    toast.error('Helix Projects is updating', 'Try again in a moment.');
    return false;
  }
}

export async function raiseTicket(input: { subject: string; description?: string; priority?: 'P1' | 'P2' | 'P3' | 'P4'; source?: ChatMessage; conv?: Conversation }): Promise<boolean> {
  const viewer = currentViewer();
  if (!viewer) return false;
  try {
    const api = await loadBridge('helpdesk');
    const res = api.createTicket(viewer, {
      subject: input.subject.trim(),
      description: input.description,
      category: 'Reported from Pulse Chat',
      priority: input.priority ?? 'P3',
      source: input.source && input.conv ? { app: 'chat', label: `Pulse Chat · ${convName(input.conv)}`, to: msgLink(input.source) } : { app: 'chat', label: 'Pulse Chat', to: '/chat' },
    });
    if (!res.ok) {
      toast.error('Couldn’t raise the ticket', res.error);
      return false;
    }
    // Private confirmation in your IT Helpdesk app conversation (tickets are never posted to channels).
    useChat.getState().send(
      dmId(['bot-helpdesk', viewer.user.id]),
      { text: 'Your ticket was raised from Pulse Chat — I’ll keep you posted here.', card: { app: 'helpdesk', title: input.subject.trim(), subtitle: `Priority ${input.priority ?? 'P3'} · IT Helpdesk`, to: res.to, status: 'Open' } },
      { bot: 'bot-helpdesk', internal: true, silent: true },
    );
    toast.success('Ticket raised', 'IT Helpdesk will follow up — updates arrive in your IT Helpdesk app chat.');
    return true;
  } catch {
    toast.error('IT Helpdesk is updating', 'Try again in a moment.');
    return false;
  }
}

export async function searchDrive(query: string, limit = 8): Promise<BridgeFile[] | null> {
  const viewer = currentViewer();
  if (!viewer) return [];
  try {
    const api = await loadBridge('drive');
    return api.searchFiles(viewer, query, limit);
  } catch {
    return null;
  }
}
