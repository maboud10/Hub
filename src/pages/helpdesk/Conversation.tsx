/**
 * Ticket conversation building blocks — shared by the ticket page and the
 * IT queue inspector: timeline, composer (replies, internal notes, macros,
 * attachments), facts panel with agent controls, CSAT and resolve dialog.
 */
import { useMemo, useRef, useState, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ArrowRightLeft,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Flag,
  FolderInput,
  Laptop,
  Link2,
  Lock,
  MessageSquareText,
  Paperclip,
  Send,
  ShieldAlert,
  Siren,
  Sparkles,
  Star,
  UserPlus,
  WandSparkles,
  X,
} from 'lucide-react';
import { Avatar } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { NeoMenu, PeoplePicker, type MenuEntry } from '@/components/neo';
import { relativeTime, formatDateTime } from '@/lib/format';
import { burstConfetti } from '@/lib/confetti';
import { uid } from '@/lib/id';
import { cx } from '@/lib/cx';
import { toast } from '@/store/toast';
import { useHub } from '@/store/hub';
import { currentViewer, loadBridge } from '@/lib/appBridge';
import { useHelpdesk } from '@/helpdesk/store';
import type { Attachment, Priority, ResolutionCode, Ticket, TicketEvent, TicketStatus } from '@/helpdesk/types';
import { canSeeInternal, canWorkTicket, isStaff } from '@/helpdesk/access';
import { assignableAgents } from '@/helpdesk/queries';
import { CATEGORIES, CATEGORY_LABEL, PRIORITIES, PRIORITY_LABEL, RESOLUTION_LABEL, STATUS_LABEL, STATUS_LABEL_AGENT, STATUS_ORDER, officeOf } from '@/helpdesk/meta';
import { SLA_TARGETS, formatDuration } from '@/helpdesk/sla';
import { deviceHealth } from '@/helpdesk/fleet';
import { firstNameOf } from '@/helpdesk/util';
import { DeviceGlyph } from './glyphs';
import { HealthRing, Person, PriorityPill, StatusPill, type HdViewer } from './ui';

/* ---------------------------------------------------------------- bridges */

export function useTicketBridges() {
  const navigate = useNavigate();
  return {
    chatWith: async (userId: string) => {
      try {
        const chat = await loadBridge('chat');
        const v = currentViewer();
        if (!v) return;
        navigate(chat.dmRoute(v, userId));
      } catch {
        toast.info('Pulse Chat is unavailable right now', 'Try again in a moment.');
      }
    },
    followUp: async (t: Ticket) => {
      try {
        const projects = await loadBridge('projects');
        const v = currentViewer();
        if (!v) return;
        const due = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
        const r = projects.createTask(v, { title: `Follow up: ${t.subject}`, notes: `${t.id} · ${CATEGORY_LABEL[t.category]} · ${t.priority}`, dueDate: due, source: { app: 'helpdesk', label: t.id, to: `/helpdesk/tickets/${t.id}` } });
        if (r.ok) toast.success('Follow-up task created', 'Due in 3 days in Helix Projects');
        else toast.error('Couldn’t create the task', r.error);
      } catch {
        toast.info('Helix Projects is unavailable right now', 'Try again in a moment.');
      }
    },
  };
}

/* ---------------------------------------------------------------- attachments */

export async function readAttachment(file: File): Promise<Attachment> {
  const base: Attachment = { id: uid('att'), name: file.name, size: file.size, type: file.type || 'application/octet-stream' };
  if (!file.type.startsWith('image/')) return base;
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 480 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    return { ...base, preview: c.toDataURL('image/jpeg', 0.72) };
  } catch {
    return base;
  }
}

export function AttachmentList({ items, onRemove }: { items: Attachment[]; onRemove?: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="hd-atts">
      {items.map((a) => (
        <span key={a.id} className="hd-att" title={`${a.name} · ${Math.max(1, Math.round(a.size / 1024))} KB`}>
          {a.preview ? <img src={a.preview} alt={a.name} /> : <Paperclip />}
          <span className="hd-att__name">{a.name}</span>
          {onRemove && (
            <button type="button" onClick={() => onRemove(a.id)} aria-label={`Remove ${a.name}`}>
              <X />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- timeline */

export function Timeline({ ticket, viewer }: { ticket: Ticket; viewer: HdViewer }) {
  const users = useHub((s) => s.users);
  const devices = useHelpdesk((s) => s.devices);
  const internal = canSeeInternal(viewer);
  const nameOf = (id?: string) => users.find((u) => u.id === id)?.name ?? (id ? 'Someone' : 'Nova');
  const events = internal ? ticket.events : ticket.events.filter((e) => e.kind !== 'note');
  return (
    <ol className="hd-timeline" aria-label="Conversation">
      {events.map((e) => (
        <li key={e.id}>
          <EventItem e={e} ticket={ticket} viewer={viewer} nameOf={nameOf} users={users} device={e.kind === 'created' && ticket.deviceTag ? devices.find((d) => d.assetTag === ticket.deviceTag) : undefined} />
        </li>
      ))}
    </ol>
  );
}

function EventItem({
  e,
  ticket,
  viewer,
  nameOf,
  users,
  device,
}: {
  e: TicketEvent;
  ticket: Ticket;
  viewer: HdViewer;
  nameOf: (id?: string) => string;
  users: ReturnType<typeof useHub.getState>['users'];
  device?: ReturnType<typeof useHelpdesk.getState>['devices'][number];
}) {
  const actor = users.find((u) => u.id === e.actorId);
  const when = <time dateTime={new Date(e.at).toISOString()} title={formatDateTime(e.at)}>{relativeTime(e.at)}</time>;
  const agentView = viewer.it || isStaff(viewer.user.id);

  if (e.kind === 'created') {
    return (
      <article className="hd-origin">
        <header>
          {actor && <Avatar user={actor} size={34} />}
          <div className="grow" style={{ minWidth: 0 }}>
            <b>{actor?.name ?? 'Someone'}</b> <span className="neo-faint">opened this ticket</span>
            <div className="hd-origin__meta">
              {when} · {CATEGORY_LABEL[ticket.category]} · <PriorityPill priority={ticket.priority} full />
            </div>
          </div>
        </header>
        <p className="hd-origin__body">{e.body}</p>
        {e.attachments && <AttachmentList items={e.attachments} />}
        {(device || ticket.source) && (
          <div className="hd-origin__chips">
            {device && (
              <Link to={agentView ? `/helpdesk/fleet/${device.assetTag}` : `/helpdesk/devices/${device.assetTag}`} className="hd-devchip">
                <DeviceGlyph kind={device.kind} size={30} />
                <span>
                  <b>{device.model}</b>
                  <span className="neo-mono">{device.assetTag}</span>
                </span>
              </Link>
            )}
            {ticket.source && (
              <Link to={ticket.source.to} className="hd-srcchip">
                <FolderInput /> From {ticket.source.label}
              </Link>
            )}
          </div>
        )}
      </article>
    );
  }

  if (e.kind === 'reply') {
    const mine = e.actorId === viewer.user.id;
    const fromAgent = e.actorId !== ticket.requesterId;
    return (
      <div className="hd-msg" data-side={mine ? 'me' : 'them'} data-agent={fromAgent || undefined}>
        {!mine && actor && <Avatar user={actor} size={30} />}
        <div className="hd-msg__bubble">
          <div className="hd-msg__head">
            <b>{mine ? 'You' : (actor?.name ?? 'Someone')}</b>
            {fromAgent && <span className="hd-itbadge">IT</span>}
            {e.macroId && <span className="hd-macrobadge">Macro</span>}
            {when}
          </div>
          {e.body && <div className="hd-msg__body">{e.body}</div>}
          {e.attachments && <AttachmentList items={e.attachments} />}
        </div>
      </div>
    );
  }

  if (e.kind === 'note') {
    return (
      <div className="hd-inote">
        <div className="hd-inote__head">
          <Lock /> <b>Internal note</b> · {nameOf(e.actorId)} · {when}
        </div>
        <div className="hd-inote__body">{e.body}</div>
      </div>
    );
  }

  if (e.kind === 'automation') {
    return (
      <div className="hd-auto">
        <span className="hd-auto__icon">
          <Sparkles />
        </span>
        <div className="hd-auto__body">
          <div className="hd-auto__head">
            <b className="neo-nova-text">Nova</b> {when}
          </div>
          <p>{e.body}</p>
        </div>
      </div>
    );
  }

  if (e.kind === 'csat') {
    const n = Number(e.to ?? 0);
    return (
      <div className="hd-sys hd-sys--csat">
        <Star />
        <span>
          {e.actorId === viewer.user.id ? 'You' : nameOf(e.actorId)} rated this <b>{n}/5</b>
          {e.body ? ` — “${e.body}”` : ''}
        </span>
        {when}
      </div>
    );
  }

  const who = e.actorId ? (e.actorId === viewer.user.id ? 'You' : firstNameOf(nameOf(e.actorId))) : 'Nova';
  let Icon = CircleDot;
  let text = '';
  switch (e.kind) {
    case 'status': {
      const to = e.to as TicketStatus;
      Icon = to === 'resolved' ? CheckCircle2 : ArrowRightLeft;
      const label = agentView ? STATUS_LABEL_AGENT[to] : STATUS_LABEL[to];
      text = to === 'resolved' ? `${who} resolved this` : `${who} moved this to ${label}`;
      if (e.body) text += ` · ${e.body}`;
      break;
    }
    case 'assign':
      Icon = UserPlus;
      text = e.to ? (e.to === e.actorId ? `${who} picked this up` : `${who} assigned ${firstNameOf(nameOf(e.to))}`) : `${who} unassigned it`;
      if (!e.actorId && e.to) text = `Assigned to ${nameOf(e.to)}`;
      break;
    case 'priority':
      Icon = Flag;
      text = `${who} changed priority ${e.from} → ${e.to}`;
      break;
    case 'category':
      Icon = FolderInput;
      text = `${who} moved this to ${CATEGORY_LABEL[e.to as Ticket['category']] ?? e.to}`;
      break;
    case 'device':
      Icon = Laptop;
      text = e.to ? `${who} linked ${e.to}` : `${who} unlinked ${e.from}`;
      break;
    case 'escalation':
      Icon = Siren;
      text = e.body ?? 'Escalated to Security';
      break;
  }
  return (
    <div className="hd-sys" data-kind={e.kind} data-to={e.to}>
      <Icon />
      <span>{text}</span>
      {when}
    </div>
  );
}

/* ---------------------------------------------------------------- composer */

export function Composer({ ticket, viewer, compact }: { ticket: Ticket; viewer: HdViewer; compact?: boolean }) {
  const agent = canWorkTicket(viewer, ticket);
  const macros = useHelpdesk((s) => s.macros);
  const [mode, setMode] = useState<'reply' | 'note'>('reply');
  const [text, setText] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const isRequester = ticket.requesterId === viewer.user.id;
  const placeholder = mode === 'note' ? 'Add an internal note (only IT sees this)…' : agent ? `Reply to ${firstNameOf(useHub.getState().users.find((u) => u.id === ticket.requesterId)?.name)}…` : 'Add details or reply to IT…';

  const send = () => {
    if (!text.trim() && !files.length) return;
    const r = useHelpdesk.getState().reply(ticket.id, text, { internal: mode === 'note', attachments: files });
    if (!r.ok) return toast.error(r.error);
    setText('');
    setFiles([]);
    if (isRequester && ticket.status === 'resolved') toast.info('Ticket reopened', 'IT has been notified.');
  };

  const onFiles = async (list: FileList | null) => {
    if (!list) return;
    const picked = [...list].slice(0, 4);
    if (picked.some((f) => f.size > 10 * 1024 * 1024)) toast.warning('Files over 10 MB were skipped');
    const atts = await Promise.all(picked.filter((f) => f.size <= 10 * 1024 * 1024).map(readAttachment));
    setFiles((prev) => [...prev, ...atts].slice(0, 6));
  };

  const macroItems: MenuEntry[] = [
    { kind: 'label', label: 'Macros' },
    ...macros.map((m) => ({
      label: m.name,
      hint: m.status ? STATUS_LABEL_AGENT[m.status] : undefined,
      icon: <WandSparkles />,
      onSelect: () => {
        const r = useHelpdesk.getState().applyMacro(ticket.id, m.id);
        if (!r.ok) toast.error(r.error);
        else toast.success(`Sent “${m.name}”`);
      },
    })),
  ];

  return (
    <div className={cx('hd-composer', compact && 'hd-composer--compact')} data-mode={mode}>
      {agent && (
        <div className="hd-composer__modes">
          <div className="hd-seg" role="tablist" aria-label="Message type">
            <button type="button" role="tab" aria-selected={mode === 'reply'} onClick={() => setMode('reply')}>
              <MessageSquareText /> Reply
            </button>
            <button type="button" role="tab" aria-selected={mode === 'note'} onClick={() => setMode('note')} data-qa="mode-note">
              <Lock /> Internal note
            </button>
          </div>
          <NeoMenu
            items={macroItems}
            width={290}
            label="Macros"
            trigger={(p) => (
              <button {...p} type="button" className="neo-btn neo-btn--ghost neo-btn--xs" data-qa="macros">
                <WandSparkles /> Macros <ChevronDown />
              </button>
            )}
          />
        </div>
      )}
      <AttachmentList items={files} onRemove={(id) => setFiles((f) => f.filter((x) => x.id !== id))} />
      <textarea
        className="hd-composer__input"
        rows={compact ? 2 : 3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            send();
          }
        }}
        placeholder={placeholder}
        aria-label={mode === 'note' ? 'Internal note' : 'Reply'}
        data-qa="composer"
      />
      <div className="hd-composer__bar">
        <button type="button" className="neo-iconbtn" onClick={() => fileRef.current?.click()} aria-label="Attach files" data-tip="Attach screenshots or files">
          <Paperclip />
        </button>
        <input ref={fileRef} type="file" hidden multiple accept="image/*,.pdf,.txt,.log,.har,.zip" onChange={(e) => void onFiles(e.target.files).then(() => (e.target.value = ''))} />
        <span className="hd-composer__hint">{isRequester && ticket.status === 'resolved' ? 'Replying reopens this ticket' : mode === 'note' ? 'Visible to IT only' : '⌘↵ to send'}</span>
        <button type="button" className={mode === 'note' ? 'neo-btn neo-btn--soft neo-btn--sm' : 'neo-btn neo-btn--plasma neo-btn--sm'} onClick={send} disabled={!text.trim() && !files.length} data-qa="send">
          <Send /> {mode === 'note' ? 'Add note' : 'Send'}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- facts / agent controls */

export function TicketFacts({ ticket, viewer, onEscalate }: { ticket: Ticket; viewer: HdViewer; onEscalate?: () => void }) {
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  const devices = useHelpdesk((s) => s.devices);
  const incidents = useHelpdesk((s) => s.incidents);
  const bridges = useTicketBridges();
  const agent = canWorkTicket(viewer, ticket);
  const it = viewer.it;
  const team = useMemo(() => assignableAgents(users, roles), [users, roles]);
  const requester = users.find((u) => u.id === ticket.requesterId);
  const device = devices.find((d) => d.assetTag === ticket.deviceTag);
  const reqDevices = devices.filter((d) => d.assigneeId === ticket.requesterId && d.status !== 'retired');
  const incident = incidents.find((i) => i.id === ticket.incidentId);
  const isRequester = ticket.requesterId === viewer.user.id;
  const s = useHelpdesk.getState;
  const res = (r: { ok: boolean; error?: string }) => !r.ok && toast.error((r as { error: string }).error);
  const local = requester ? new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: requester.timezone }) : '';

  return (
    <div className="hd-facts">
      <dl className="neo-kv hd-facts__kv">
        <dt>Status</dt>
        <dd>
          {agent ? (
            <select className="neo-select neo-select--sm" value={ticket.status} onChange={(e) => res(s().setStatus(ticket.id, e.target.value as TicketStatus))} aria-label="Status" data-qa="facts-status">
              {STATUS_ORDER.map((st) => (
                <option key={st} value={st}>
                  {STATUS_LABEL_AGENT[st]}
                </option>
              ))}
            </select>
          ) : (
            <StatusPill status={ticket.status} />
          )}
        </dd>
        <dt>Priority</dt>
        <dd>
          {agent ? (
            <div className="hd-prioseg" role="radiogroup" aria-label="Priority">
              {PRIORITIES.map((p: Priority) => (
                <button key={p} type="button" role="radio" aria-checked={ticket.priority === p} data-p={p} onClick={() => res(s().setPriority(ticket.id, p))} title={PRIORITY_LABEL[p]}>
                  {p}
                </button>
              ))}
            </div>
          ) : (
            <PriorityPill priority={ticket.priority} full />
          )}
        </dd>
        <dt>Category</dt>
        <dd>
          {agent ? (
            <select className="neo-select neo-select--sm" value={ticket.category} onChange={(e) => res(s().setCategory(ticket.id, e.target.value as Ticket['category']))} aria-label="Category">
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          ) : (
            CATEGORY_LABEL[ticket.category]
          )}
        </dd>
        <dt>Assignee</dt>
        <dd>
          {it ? (
            <PeoplePicker
              value={ticket.assigneeId ? [ticket.assigneeId] : []}
              onChange={(ids) => res(s().assign(ticket.id, ids[0] ?? null))}
              users={team}
              allowNone
              label="Assign to"
              trigger={(p) => (
                <button {...p} type="button" className="hd-pick" data-qa="facts-assign">
                  <Person userId={ticket.assigneeId} size={24} nameOnly />
                  <ChevronDown />
                </button>
              )}
            />
          ) : ticket.assigneeId ? (
            <Person userId={ticket.assigneeId} size={24} nameOnly />
          ) : (
            <span className="neo-faint">{ticket.sim ? 'Finding an agent…' : 'Unassigned'}</span>
          )}
        </dd>
        <dt>Requester</dt>
        <dd>
          <Person userId={ticket.requesterId} size={24} sub={requester ? `${officeOf(requester.location)} · ${local} local` : undefined} />
        </dd>
        <dt>Device</dt>
        <dd>
          {agent && reqDevices.length > 0 ? (
            <select className="neo-select neo-select--sm" value={ticket.deviceTag ?? ''} onChange={(e) => res(s().linkDevice(ticket.id, e.target.value || null))} aria-label="Linked device">
              <option value="">Not device-related</option>
              {reqDevices.map((d) => (
                <option key={d.assetTag} value={d.assetTag}>
                  {d.assetTag} · {d.model}
                </option>
              ))}
            </select>
          ) : device ? (
            <Link to={it ? `/helpdesk/fleet/${device.assetTag}` : `/helpdesk/devices/${device.assetTag}`} className="neo-tint neo-mono text-sm">
              {device.assetTag}
            </Link>
          ) : (
            <span className="neo-faint">—</span>
          )}
        </dd>
        <dt>SLA</dt>
        <dd className="text-sm">
          {ticket.priority} · reply {formatDuration(SLA_TARGETS[ticket.priority].response)} · fix {formatDuration(SLA_TARGETS[ticket.priority].resolve)}
          {ticket.pausedMs > 0 && <div className="neo-faint">paused {formatDuration(ticket.pausedMs, { compact: true })} waiting on requester</div>}
        </dd>
        {ticket.resolution && (
          <>
            <dt>Resolution</dt>
            <dd className="text-sm">
              {RESOLUTION_LABEL[ticket.resolution.code]}
              {ticket.resolution.note && <div className="neo-faint">{ticket.resolution.note}</div>}
            </dd>
          </>
        )}
      </dl>

      {device && (
        <Link to={it ? `/helpdesk/fleet/${device.assetTag}` : `/helpdesk/devices/${device.assetTag}`} className="hd-factdev">
          <DeviceGlyph kind={device.kind} size={64} />
          <span className="hd-factdev__text">
            <b>{device.model}</b>
            <span className="neo-mono">{device.assetTag}</span>
          </span>
          <HealthRing score={deviceHealth(device, Date.now())} size={40} />
        </Link>
      )}

      {incident && (
        <Link to="/helpdesk/status" className="hd-factinc" data-resolved={incident.status === 'resolved' || undefined}>
          <Siren />
          <span>
            <b>{incident.id}</b> · {incident.title}
            <span className="neo-faint"> · {incident.status === 'resolved' ? 'resolved' : incident.status}</span>
          </span>
        </Link>
      )}

      <div className="hd-facts__actions">
        {isRequester && ticket.assigneeId && (
          <button type="button" className="neo-btn neo-btn--soft neo-btn--sm neo-btn--block" onClick={() => bridges.chatWith(ticket.assigneeId!)} data-qa="chat-agent">
            <MessageSquareText /> Chat with {firstNameOf(users.find((u) => u.id === ticket.assigneeId)?.name)}
          </button>
        )}
        {agent && !isRequester && (
          <button type="button" className="neo-btn neo-btn--soft neo-btn--sm neo-btn--block" onClick={() => bridges.chatWith(ticket.requesterId)}>
            <MessageSquareText /> Chat with {firstNameOf(requester?.name)}
          </button>
        )}
        {agent && !ticket.escalated && ticket.status !== 'resolved' && (
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm neo-btn--block" onClick={onEscalate ?? (() => res(s().escalate(ticket.id)))}>
            <ShieldAlert /> Escalate to Security
          </button>
        )}
        {agent && (
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm neo-btn--block" onClick={() => bridges.followUp(ticket)}>
            <Link2 /> Create follow-up task
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- CSAT */

const CSAT_LABEL = ['', 'Not good', 'Could be better', 'Okay', 'Good', 'Excellent'];

export function CsatCard({ ticket }: { ticket: Ticket }) {
  const users = useHub((s) => s.users);
  const [score, setScore] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const shown = hover || score;
  const agent = firstNameOf(users.find((u) => u.id === ticket.assigneeId)?.name) || 'IT';
  const submit = (e: MouseEvent<HTMLButtonElement>) => {
    const r = useHelpdesk.getState().rate(ticket.id, score, comment);
    if (!r.ok) return toast.error(r.error);
    toast.success('Thanks for the feedback!', score >= 4 ? `${agent} will love that.` : 'We’ll use it to get better.');
    if (score === 5) {
      const b = e.currentTarget.getBoundingClientRect();
      burstConfetti({ x: b.left + b.width / 2, y: b.top });
    }
  };
  return (
    <section className="hd-csat" id="rate" aria-label="Rate this ticket">
      <div className="neo-hud neo-hud--tint">Resolved · how did we do?</div>
      <h3>Rate your experience with {agent}</h3>
      <div className="hd-csat__stars" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={score === n} aria-label={`${n} — ${CSAT_LABEL[n]}`} data-on={n <= shown || undefined} onMouseEnter={() => setHover(n)} onClick={() => setScore(n)} data-qa={`csat-${n}`}>
            <Star />
          </button>
        ))}
        <span className="hd-csat__label">{shown ? CSAT_LABEL[shown] : 'Tap a star'}</span>
      </div>
      {score > 0 && <textarea className="neo-textarea" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={score >= 4 ? 'Anything that stood out? (optional)' : 'What could we have done better? (optional)'} />}
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" disabled={!score} onClick={submit} data-qa="csat-send">
          Send feedback
        </button>
        <span className="neo-faint text-sm">Still broken? Reply below to reopen.</span>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- resolve dialog */

const RESOLUTIONS: ResolutionCode[] = ['fixed', 'workaround', 'replaced', 'no_fault', 'duplicate'];

export function ResolveModal({ ticket, open, onClose }: { ticket: Ticket; open: boolean; onClose: () => void }) {
  const users = useHub((s) => s.users);
  const [code, setCode] = useState<ResolutionCode>('fixed');
  const [note, setNote] = useState('');
  const first = firstNameOf(users.find((u) => u.id === ticket.requesterId)?.name);
  const submit = () => {
    const r = useHelpdesk.getState().setStatus(ticket.id, 'resolved', { resolution: code, note });
    if (!r.ok) return toast.error(r.error);
    toast.success(`${ticket.id} resolved`, `${first} has been notified and asked for feedback.`);
    setNote('');
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Resolve ${ticket.id}`}
      subtitle={ticket.subject}
      width={540}
      className="neo-portal hd-resolve"
      icon={
        <span className="hd-fixmodal__icon">
          <CheckCircle2 />
        </span>
      }
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={submit} data-qa="resolve-confirm">
            <CheckCircle2 /> Resolve &amp; notify {first}
          </button>
        </>
      }
    >
      <div className="neo-field">
        <span className="neo-label">Resolution</span>
        <div className="hd-chipset" role="radiogroup" aria-label="Resolution code">
          {RESOLUTIONS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={code === c} className="hd-choice" onClick={() => setCode(c)}>
              {RESOLUTION_LABEL[c]}
            </button>
          ))}
        </div>
      </div>
      <div className="neo-field" style={{ marginTop: 14 }}>
        <label className="neo-label" htmlFor="hd-resolve-note">
          Tell {first} what fixed it
        </label>
        <textarea id="hd-resolve-note" className="neo-textarea" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I re-authorised your token for the helix-platform org — pushes work again." />
        <span className="neo-hint">Sent as a reply. {first} can rate the fix or reopen it by replying.</span>
      </div>
    </Modal>
  );
}
