/**
 * Inbox — every signal addressed to you: mentions, assignments, comments on
 * followed work, status updates, approvals, automation pings. Triage fast with
 * j/k · ↵ open · e archive · u read/unread; tasks open in the side panel so
 * you never lose your place.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  AlarmClock,
  Archive,
  ArchiveRestore,
  AtSign,
  Bell,
  Check,
  CheckCheck,
  CircleCheckBig,
  Inbox as InboxIcon,
  KeyRound,
  Mail,
  MailOpen,
  Megaphone,
  MessageSquare,
  MoreHorizontal,
  Plus,
  ShieldCheck,
  UserPlus,
  Zap,
} from 'lucide-react';
import { NeoEmpty, NeoHead, NeoMenu, NeoSearch, NeoTabs, type MenuEntry } from '@/components/neo';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useNow } from '@/hooks/useNow';
import { burstConfetti } from '@/lib/confetti';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { toast } from '@/store/toast';
import { canDecideApproval, canSeeTask, canViewProject } from '@/projects/access';
import { DAY, todayIso, parseIso, startOfWeek } from '@/projects/dates';
import { taskKey } from '@/projects/metrics';
import { useProjects } from '@/projects/store';
import type { InboxItem, InboxKind } from '@/projects/types';
import { pushUndo, useActor, useProjectMap, useProjectsUI, useUsersMap } from './ctx';
import { ProjectGlyph, UserAvatar } from './ui';

type Tab = 'all' | 'mentions' | 'assigned' | 'approvals' | 'archived';

const KIND_ICON: Record<InboxKind, ReactNode> = {
  mention: <AtSign />,
  assigned: <UserPlus />,
  comment: <MessageSquare />,
  status: <Megaphone />,
  approval: <ShieldCheck />,
  decision: <Check />,
  completed: <CircleCheckBig />,
  automation: <Zap />,
  due: <AlarmClock />,
  access: <KeyRound />,
};
const KIND_TONE: Record<InboxKind, string> = {
  mention: 'violet',
  assigned: 'blue',
  comment: 'slate',
  status: 'amber',
  approval: 'emerald',
  decision: 'emerald',
  completed: 'emerald',
  automation: 'cyan',
  due: 'rose',
  access: 'indigo',
};

const inTab = (i: InboxItem, tab: Tab) => {
  if (tab === 'archived') return i.archived;
  if (i.archived) return false;
  if (tab === 'mentions') return i.kind === 'mention';
  if (tab === 'assigned') return i.kind === 'assigned' || i.kind === 'due';
  if (tab === 'approvals') return i.kind === 'approval' || i.kind === 'decision';
  return true;
};

export function InboxScreen() {
  const actor = useActor();
  const ui = useProjectsUI();
  const navigate = useNavigate();
  const now = useNow(60_000);
  const users = useUsersMap();
  const projects = useProjectMap();
  const inbox = useProjects((s) => s.inbox);
  const tasks = useProjects((s) => s.tasks);
  const markRead = useProjects((s) => s.markInboxRead);
  const markAll = useProjects((s) => s.markAllInboxRead);
  const archive = useProjects((s) => s.archiveInbox);
  const decide = useProjects((s) => s.decideApproval);
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [sel, setSel] = useState(0);
  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const mine = useMemo(() => inbox.filter((i) => i.userId === actor?.id).sort((a, b) => b.at - a.at), [inbox, actor]);
  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: 0, mentions: 0, assigned: 0, approvals: 0, archived: 0 };
    for (const i of mine) for (const t of ['all', 'mentions', 'assigned', 'approvals'] as Tab[]) if (inTab(i, t) && !i.read) c[t] += 1;
    c.archived = mine.filter((i) => i.archived).length;
    return c;
  }, [mine]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return mine.filter((i) => {
      if (!inTab(i, tab)) return false;
      if (unreadOnly && i.read) return false;
      if (!s) return true;
      const t = i.taskId ? tasksById.get(i.taskId) : undefined;
      const p = projects.get(i.projectId ?? t?.projectId ?? '');
      return `${i.title} ${i.body ?? ''} ${t?.title ?? ''} ${p?.name ?? ''} ${p?.key ?? ''} ${users.get(i.actorId)?.name ?? ''}`.toLowerCase().includes(s);
    });
  }, [mine, tab, unreadOnly, q, tasksById, projects, users]);

  useEffect(() => setSel((i) => Math.min(i, Math.max(0, list.length - 1))), [list.length]);

  const groups = useMemo(() => {
    const today = todayIso(now);
    const startToday = parseIso(today).getTime();
    const startWeek = parseIso(startOfWeek(today)).getTime();
    const out: { label: string; items: InboxItem[] }[] = [];
    const push = (label: string, it: InboxItem) => {
      const g = out.find((x) => x.label === label);
      if (g) g.items.push(it);
      else out.push({ label, items: [it] });
    };
    for (const it of list) {
      if (it.at >= startToday) push('Today', it);
      else if (it.at >= startToday - DAY) push('Yesterday', it);
      else if (it.at >= startWeek) push('Earlier this week', it);
      else push('Older', it);
    }
    return out;
  }, [list, now]);

  const unreadInView = list.filter((i) => !i.read);
  const open = (it: InboxItem) => {
    if (!actor) return;
    if (!it.read) markRead(it.id, true);
    const t = it.taskId ? tasksById.get(it.taskId) : undefined;
    const p = projects.get(it.projectId ?? t?.projectId ?? '');
    if (it.taskId) {
      if (!t || !canSeeTask(t, p, actor)) return toast.error('That task is no longer available to you.');
      ui.openTask(t.id);
      return;
    }
    if (p) {
      if (!canViewProject(p, actor)) return toast.error('You no longer have access to that project.');
      navigate(`/projects/p/${p.id}/overview`);
    }
  };
  const doArchive = (it: InboxItem) => {
    archive(it.id, !it.archived);
    if (!it.archived) pushUndo('Archived', () => archive(it.id, false));
  };
  const toggleRead = (it: InboxItem) => markRead(it.id, !it.read);

  const current = list[sel];
  const blocked = () => !!document.querySelector('.modal') || !!document.activeElement?.closest('.pj-panel, .neo-pop');
  useHotkeys({
    j: (e) => {
      if (blocked()) return;
      e.preventDefault();
      setSel((i) => Math.min(list.length - 1, i + 1));
    },
    k: (e) => {
      if (blocked()) return;
      e.preventDefault();
      setSel((i) => Math.max(0, i - 1));
    },
    enter: () => {
      if (current && !blocked() && !document.activeElement?.closest('button, a, input, textarea')) open(current);
    },
    e: (e) => {
      if (!current || blocked()) return;
      e.preventDefault();
      doArchive(current);
    },
    u: (e) => {
      if (!current || blocked()) return;
      e.preventDefault();
      toggleRead(current);
    },
  });
  useEffect(() => {
    document.querySelector('.pj-inbox__item.is-selected')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!actor) return null;

  const menu: MenuEntry[] = [
    { label: 'Mark all as read', icon: <CheckCheck />, disabled: !unreadInView.length, onSelect: () => markAll(unreadInView.map((i) => i.id)) },
    {
      label: 'Archive read items',
      icon: <Archive />,
      disabled: tab === 'archived' || !list.some((i) => i.read),
      onSelect: () => {
        const ids = list.filter((i) => i.read).map((i) => i.id);
        ids.forEach((id) => archive(id, true));
        pushUndo(`Archived ${ids.length} ${ids.length === 1 ? 'item' : 'items'}`, () => ids.forEach((id) => archive(id, false)));
      },
    },
  ];

  return (
    <>
      <NeoHead
        onToggleSide={ui.toggleSide}
        icon={<InboxIcon />}
        eyebrow={<>Inbox · {counts.all ? `${counts.all} unread` : 'all caught up'}</>}
        title="Inbox"
        sub="Mentions, assignments, approvals and updates on work you follow."
        actions={
          <>
            <button type="button" className="neo-btn neo-btn--ghost" disabled={!unreadInView.length} onClick={() => markAll(unreadInView.map((i) => i.id))} data-qa="mark-all-read">
              <CheckCheck /> <span className="neo-btn__label">Mark all read</span>
            </button>
            <button type="button" className="neo-btn neo-btn--plasma" onClick={() => ui.quickAdd({})} data-tip="New task  C" data-tip-pos="bottom">
              <Plus /> <span className="neo-btn__label">Add task</span>
            </button>
            <NeoMenu
              items={menu}
              width={220}
              trigger={(p) => (
                <button {...p} type="button" className="neo-iconbtn" aria-label="Inbox actions">
                  <MoreHorizontal />
                </button>
              )}
            />
          </>
        }
      />
      <div className="neo-toolbar pj-toolbar pj-inbox__toolbar">
        <NeoTabs
          label="Inbox filter"
          variant="underline"
          value={tab}
          onChange={(t) => {
            setTab(t);
            setSel(0);
          }}
          items={[
            { value: 'all', label: 'All', icon: <Bell />, count: counts.all || null },
            { value: 'mentions', label: 'Mentions', icon: <AtSign />, count: counts.mentions || null },
            { value: 'assigned', label: 'Assigned', icon: <UserPlus />, count: counts.assigned || null },
            { value: 'approvals', label: 'Approvals', icon: <ShieldCheck />, count: counts.approvals || null },
            { value: 'archived', label: 'Archived', icon: <Archive /> },
          ]}
          className="pj-viewtabs"
        />
        <div className="pj-filters">
          <SearchField value={q} onChange={setQ} />
          <button type="button" className={cx('pj-fchip', unreadOnly && 'is-on')} aria-pressed={unreadOnly} onClick={() => setUnreadOnly((v) => !v)}>
            <Mail /> Unread
          </button>
        </div>
      </div>
      <div className="neo-body neo-pad pj-inbox">
        {list.length === 0 ? (
          <InboxEmpty
            tab={tab}
            filtered={!!q || unreadOnly}
            onClear={() => {
              setQ('');
              setUnreadOnly(false);
            }}
          />
        ) : (
          <>
            <div className="pj-keys neo-faint pj-inbox__keys">
              <kbd className="kbd">j</kbd>
              <kbd className="kbd">k</kbd> move <kbd className="kbd">↵</kbd> open <kbd className="kbd">e</kbd> archive <kbd className="kbd">u</kbd> read/unread
            </div>
            {groups.map((g) => (
              <section key={g.label} className="pj-inbox__group" aria-label={g.label}>
                <h2 className="pj-inbox__day">{g.label}</h2>
                <ul className="pj-inbox__list" role="listbox" aria-label={g.label}>
                  {g.items.map((it) => {
                    const t = it.taskId ? tasksById.get(it.taskId) : undefined;
                    const p = projects.get(it.projectId ?? t?.projectId ?? '');
                    const idx = list.indexOf(it);
                    const pending = it.kind === 'approval' && t?.approval?.state === 'pending' && !t.completedAt;
                    const canApprove = pending && t ? canDecideApproval(t, p, actor) : false;
                    const decided = it.kind === 'approval' && t?.approval && t.approval.state !== 'pending';
                    return (
                      <li
                        key={it.id}
                        role="option"
                        aria-selected={idx === sel}
                        className={cx('pj-inbox__item', !it.read && 'is-unread', idx === sel && 'is-selected', t && ui.taskId === t.id && 'is-open')}
                        onClick={() => {
                          setSel(idx);
                          open(it);
                        }}
                        data-inbox={it.id}
                      >
                        <span className="pj-inbox__dot" aria-label={it.read ? undefined : 'Unread'} />
                        <span className="pj-inbox__who">
                          <UserAvatar id={it.actorId} size={34} />
                          <span className="pj-inbox__kind" data-tone={KIND_TONE[it.kind]} aria-hidden="true">
                            {KIND_ICON[it.kind]}
                          </span>
                        </span>
                        <span className="pj-inbox__main">
                          <span className="pj-inbox__title">{it.title}</span>
                          {it.body && <span className="pj-inbox__body">{it.body}</span>}
                          <span className="pj-inbox__meta">
                            {p && (
                              <span className="pj-inbox__proj">
                                <ProjectGlyph project={p} size={14} />
                                <span className="neo-mono">{t ? taskKey(p, t) : p.key}</span>
                              </span>
                            )}
                            {t && <span className="truncate">{t.title}</span>}
                            {decided && <span className="pj-inbox__decided">{t!.approval!.state === 'approved' ? 'Approved' : t!.approval!.state === 'changes' ? 'Changes requested' : 'Rejected'}</span>}
                          </span>
                        </span>
                        <span className="pj-inbox__end">
                          <span className="pj-inbox__time" title={new Date(it.at).toLocaleString()}>
                            {relativeTime(it.at)}
                          </span>
                          <span className="pj-inbox__acts" onClick={(e) => e.stopPropagation()}>
                            {canApprove && t && (
                              <button
                                type="button"
                                className="neo-btn neo-btn--success neo-btn--xs"
                                onClick={() => {
                                  if (toast.result(decide(t.id, 'approved'), `Approved ${taskKey(p, t)}`)) {
                                    burstConfetti();
                                    archive(it.id, true);
                                  }
                                }}
                                data-qa="inbox-approve"
                              >
                                <Check /> Approve
                              </button>
                            )}
                            <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label={it.read ? 'Mark unread' : 'Mark read'} data-tip={it.read ? 'Mark unread  U' : 'Mark read  U'} onClick={() => toggleRead(it)}>
                              {it.read ? <Mail /> : <MailOpen />}
                            </button>
                            <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label={it.archived ? 'Move to inbox' : 'Archive'} data-tip={it.archived ? 'Move to inbox' : 'Archive  E'} onClick={() => doArchive(it)}>
                              {it.archived ? <ArchiveRestore /> : <Archive />}
                            </button>
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>
    </>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ui = useProjectsUI();
  const [el, setEl] = useState<HTMLInputElement | null>(null);
  useEffect(() => {
    ui.registerSearch(el);
    return () => ui.registerSearch(null);
  }, [ui, el]);
  return <NeoSearch value={value} onChange={onChange} size="sm" placeholder="Search inbox" kbd="s" inputRef={setEl} className="pj-filters__search" label="Search inbox" />;
}

function InboxEmpty({ tab, filtered, onClear }: { tab: Tab; filtered: boolean; onClear: () => void }) {
  const navigate = useNavigate();
  if (filtered)
    return (
      <NeoEmpty
        icon={<InboxIcon />}
        title="Nothing matches"
        action={
          <button type="button" className="neo-btn neo-btn--soft" onClick={onClear}>
            Clear filters
          </button>
        }
      >
        Try a different search, or show read items too.
      </NeoEmpty>
    );
  const copy: Record<Tab, [string, string]> = {
    all: ['You’re all caught up', 'New mentions, assignments, approvals and status updates land here.'],
    mentions: ['No mentions', 'When someone @mentions you on a task, it shows up here.'],
    assigned: ['Nothing newly assigned', 'Tasks people hand to you — and due-date nudges — appear here.'],
    approvals: ['No approvals waiting', 'Approval requests and decisions on your requests show up here.'],
    archived: ['Archive is empty', 'Archived items stay here so you can always find them again.'],
  };
  return (
    <div className="pj-inbox__zero">
      <NeoEmpty
        icon={tab === 'all' ? <CheckCheck /> : <InboxIcon />}
        title={copy[tab][0]}
        action={
          <button type="button" className="neo-btn neo-btn--soft" onClick={() => navigate('/projects')}>
            Go to My Work
          </button>
        }
      >
        {copy[tab][1]}
      </NeoEmpty>
    </div>
  );
}
