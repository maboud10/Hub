/**
 * Helix Mail — Shared inboxes: team mailboxes (it-support@, people-ops@,
 * sales@, procurement@ — scoped to the viewer) with SLA rings, assignees,
 * live collision detection ("Mateo is typing…"), sticky internal notes,
 * canned responses, a per-conversation NeoTracker and Helpdesk conversion.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { CheckCircle2, ChevronDown, Eye, Hand, Inbox, LifeBuoy, MessageSquareQuote, PenLine, Send, StickyNote, TriangleAlert, UserPlus, Users } from 'lucide-react';
import { Chip, NeoEmpty, NeoMenu, NeoTabs, NeoTracker, PeoplePicker, Ring, Typing, type MenuEntry, type Tone } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { useNow } from '@/hooks/useNow';
import { loadBridge } from '@/lib/appBridge';
import { toast } from '@/store/toast';
import { SHARED_STEPS, collision, sharedStage, slaState, visibleMailboxes } from '@/mail/engine';
import { SHARED_MAILBOXES } from '@/mail/seed';
import { useMail } from '@/mail/store';
import type { SharedConversation, SharedMailboxId, SharedStatus } from '@/mail/types';
import { ContactAvatar, FirstNames, firstOf, useFmt, useMailCtx } from './parts';

const STATUS: Record<SharedStatus, { label: string; tone: Tone }> = {
  new: { label: 'New', tone: 'cyan' },
  assigned: { label: 'Assigned', tone: 'violet' },
  waiting: { label: 'Waiting on customer', tone: 'amber' },
  resolved: { label: 'Resolved', tone: 'success' },
};
const PRIORITY: Record<SharedConversation['priority'], { label: string; tone: Tone }> = {
  urgent: { label: 'Urgent', tone: 'danger' },
  high: { label: 'High', tone: 'warning' },
  normal: { label: 'Normal', tone: 'slate' },
  low: { label: 'Low', tone: 'slate' },
};
type Filter = 'open' | 'new' | 'mine' | 'waiting' | 'resolved';

export function SharedView() {
  const ctx = useMailCtx();
  const fmt = useFmt();
  const navigate = useNavigate();
  const now = useNow(3_000);
  const shared = useMail((s) => s.shared);
  const { assignShared, replyShared, addSharedNote, setSharedStatus, setSharedTicket } = useMail.getState();

  const boxes = useMemo(
    () => (ctx.viewer ? visibleMailboxes(SHARED_MAILBOXES, { id: ctx.viewer.user.id, department: ctx.viewer.user.department, perms: ctx.viewer.perms }) : []),
    [ctx.viewer],
  );
  const [boxId, setBoxId] = useState<SharedMailboxId>(() => boxes[0]?.mailbox.id ?? 'it-support');
  const [filter, setFilter] = useState<Filter>('open');
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<'reply' | 'note'>('reply');
  const [text, setText] = useState('');
  const [confirmCollide, setConfirmCollide] = useState(false);

  const box = boxes.find((b) => b.mailbox.id === boxId) ?? boxes[0];
  const me = ctx.ownerId;
  const all = useMemo(() => shared.filter((c) => c.mailboxId === box?.mailbox.id), [shared, box]);
  const convs = useMemo(() => {
    const f = all.filter((c) =>
      filter === 'open' ? c.status !== 'resolved' : filter === 'mine' ? c.assigneeId === me && c.status !== 'resolved' : c.status === filter,
    );
    return f.sort((a, b) => Number(a.status === 'resolved') - Number(b.status === 'resolved') || slaState(a, now).dueAt - slaState(b, now).dueAt);
  }, [all, filter, me, now]);
  const conv = convs.find((c) => c.id === sel) ?? convs[0] ?? null;

  useEffect(() => {
    setConfirmCollide(false);
  }, [conv?.id, mode]);

  if (!box) return <NeoEmpty icon={<Inbox />} title="No shared mailboxes" />;

  const counts = {
    open: all.filter((c) => c.status !== 'resolved').length,
    new: all.filter((c) => c.status === 'new').length,
    mine: all.filter((c) => c.assigneeId === me && c.status !== 'resolved').length,
    waiting: all.filter((c) => c.status === 'waiting').length,
    resolved: all.filter((c) => c.status === 'resolved').length,
  };
  const members = ctx.users.filter((u) => u.active && (box.mailbox.members.includes(u.id) || u.id === me || box.mailbox.departments.includes(u.department)));
  const clash = conv ? collision(conv, me, now) : { others: [], typing: null };
  const sla = conv ? slaState(conv, now) : null;

  const submit = () => {
    if (!conv || !text.trim()) return;
    if (mode === 'note') {
      addSharedNote(conv.id, text);
      setText('');
      toast.success('Internal note added');
      return;
    }
    if (clash.typing && !confirmCollide) {
      setConfirmCollide(true);
      return;
    }
    replyShared(conv.id, text);
    setText('');
    setConfirmCollide(false);
    toast.success('Reply sent', box.mailbox.address);
  };

  const toTicket = async () => {
    if (!conv || !ctx.viewer) return;
    try {
      const hd = await loadBridge('helpdesk');
      const r = hd.createTicket(ctx.viewer, {
        subject: conv.subject,
        description: conv.messages.map((m) => `${ctx.resolve(m.from).name}: ${m.body}`).join('\n\n'),
        category: conv.tags.includes('Phishing') ? 'security' : box.mailbox.id === 'it-support' ? 'access' : 'other',
        priority: conv.priority === 'urgent' ? 'P2' : conv.priority === 'high' ? 'P3' : 'P4',
        source: { app: 'mail', label: `Shared · ${box.mailbox.address}`, to: '/mail/shared' },
      });
      if (r.ok) {
        setSharedTicket(conv.id, { id: r.ticketId, to: r.to });
        toast.success('Helpdesk ticket created', r.ticketId);
      } else toast.error('Couldn’t create a ticket', r.error);
    } catch {
      toast.error('IT Helpdesk is unavailable');
    }
  };

  const statusMenu: MenuEntry[] = (Object.keys(STATUS) as SharedStatus[]).map((s) => ({
    label: STATUS[s].label,
    checked: conv?.status === s,
    onSelect: () => conv && setSharedStatus(conv.id, s),
  }));
  const canned: MenuEntry[] = box.mailbox.canned.map((c) => ({ label: c.title, icon: <MessageSquareQuote />, onSelect: () => setText(c.body) }));
  const timeline = conv
    ? [...conv.messages.map((m) => ({ kind: 'msg' as const, at: m.at, m })), ...conv.notes.map((n) => ({ kind: 'note' as const, at: n.at, n }))].sort((a, b) => a.at - b.at)
    : [];

  return (
    <div className="ml-view ml-shared">
      <div className="ml-shared__top">
        <NeoTabs
          value={box.mailbox.id}
          onChange={(v) => {
            setBoxId(v);
            setSel(null);
          }}
          label="Shared mailboxes"
          items={boxes.map((b) => ({
            value: b.mailbox.id,
            label: <span data-no-i18n>{b.mailbox.address}</span>,
            icon: <Users />,
            count: shared.filter((c) => c.mailboxId === b.mailbox.id && c.status === 'new').length || null,
          }))}
        />
        {box.observer && (
          <Chip tone="slate" size="sm" icon={<Eye />}>
            <span>Observer access</span>
          </Chip>
        )}
        <p className="ml-shared__desc">{box.mailbox.description}</p>
      </div>

      <div className="ml-shared__grid">
        <section className="ml-queue" aria-label="Queue">
          <div className="ml-queue__filters" role="radiogroup" aria-label="Filter conversations">
            {(['open', 'new', 'mine', 'waiting', 'resolved'] as Filter[]).map((f) => (
              <button key={f} type="button" role="radio" aria-checked={filter === f} className="ml-pill" onClick={() => setFilter(f)}>
                <span>{{ open: 'All open', new: 'New', mine: 'Mine', waiting: 'Waiting', resolved: 'Resolved' }[f]}</span>
                <b>{fmt.num(counts[f])}</b>
              </button>
            ))}
          </div>
          {convs.length ? (
            <ul className="ml-queue__list">
              {convs.map((c) => {
                const s = slaState(c, now);
                const from = ctx.resolve(c.from);
                const others = collision(c, me, now).others;
                const color = c.status === 'resolved' || s.met ? 'rgb(var(--success-rgb))' : s.breached ? 'rgb(var(--danger-rgb))' : s.pct > 0.75 ? 'rgb(var(--warning-rgb))' : undefined;
                const assignee = c.assigneeId ? ctx.userMap.get(c.assigneeId) : undefined;
                return (
                  <li key={c.id}>
                    <button type="button" className="ml-q" aria-current={c.id === conv?.id || undefined} onClick={() => setSel(c.id)}>
                      <Ring value={c.status === 'resolved' ? 1 : Math.min(1, s.pct)} size={36} stroke={4} color={color} label="SLA">
                        {c.status === 'resolved' ? <CheckCircle2 /> : s.breached ? <TriangleAlert /> : <span className="ml-q__mins">{Math.max(0, Math.round(s.remainingMins / 60))}</span>}
                      </Ring>
                      <span className="ml-q__body">
                        <span className="ml-q__top">
                          <b>{from.name}</b>
                          <span className="ml-q__time">{fmt.when(c.receivedAt, now)}</span>
                        </span>
                        <span className="ml-q__subj" data-no-i18n dir="auto">
                          {c.subject}
                        </span>
                        <span className="ml-q__meta">
                          <Chip tone={STATUS[c.status].tone} size="sm">
                            {STATUS[c.status].label}
                          </Chip>
                          {(c.priority === 'urgent' || c.priority === 'high') && (
                            <Chip tone={PRIORITY[c.priority].tone} size="sm">
                              {PRIORITY[c.priority].label}
                            </Chip>
                          )}
                          {assignee && <Avatar user={assignee} size={18} />}
                          {others.length > 0 && (
                            <span className="ml-q__eye" title="Someone else is here">
                              <Eye aria-hidden="true" /> <FirstNames names={others.map((o) => ctx.userMap.get(o.userId)?.name ?? '')} />
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <NeoEmpty icon={<CheckCircle2 />} title="Queue is clear" compact />
          )}
        </section>

        {conv && sla ? (
          <section className="ml-conv" aria-label={conv.subject}>
            <header className="ml-conv__head">
              <ContactAvatar c={ctx.resolve(conv.from)} size={40} presence />
              <div className="ml-conv__titles">
                <h2 className="ml-conv__subject" data-no-i18n dir="auto">
                  {conv.subject}
                </h2>
                <span className="ml-conv__from">
                  <b>{ctx.resolve(conv.from).name}</b> <span data-no-i18n>{ctx.resolve(conv.from).email}</span> {fmt.locale === 'ar' ? '←' : '→'} <span data-no-i18n>{box.mailbox.address}</span>
                </span>
                <span className="ml-conv__tags">
                  <Chip tone={PRIORITY[conv.priority].tone} size="sm">
                    {PRIORITY[conv.priority].label}
                  </Chip>
                  {conv.tags.map((t) => (
                    <span key={t} className="ml-label">
                      {t}
                    </span>
                  ))}
                </span>
              </div>
              <div className="ml-conv__sla">
                <Ring value={conv.status === 'resolved' ? 1 : Math.min(1, sla.pct)} size={54} stroke={5} label="First-response SLA" color={sla.met || conv.status === 'resolved' ? 'rgb(var(--success-rgb))' : sla.breached ? 'rgb(var(--danger-rgb))' : undefined}>
                  {sla.met || conv.status === 'resolved' ? <CheckCircle2 /> : sla.breached ? <TriangleAlert /> : `${Math.round(Math.min(1, sla.pct) * 100)}%`}
                </Ring>
                <span className="ml-conv__slatext">
                  <span className="neo-hud">First-response SLA</span>
                  {sla.met ? (
                    <b>
                      <span>Met</span> · {fmt.duration((conv.firstReplyAt ?? now) - conv.receivedAt)}
                    </b>
                  ) : sla.breached ? (
                    <b className="ml-danger">
                      <span>Breached</span> · {fmt.duration(now - sla.dueAt)}
                    </b>
                  ) : (
                    <b>
                      <span>Due in</span> {fmt.duration(sla.dueAt - now)}
                    </b>
                  )}
                </span>
              </div>
            </header>

            <NeoTracker
              steps={SHARED_STEPS.map((label, i) => ({
                label,
                at: i === 0 ? fmt.time(conv.receivedAt) : i === 1 && conv.assignedAt ? fmt.time(conv.assignedAt) : i === 2 && conv.firstReplyAt ? fmt.time(conv.firstReplyAt) : i === 3 && conv.resolvedAt ? fmt.time(conv.resolvedAt) : undefined,
              }))}
              current={sharedStage(conv)}
              hud="Conversation tracker"
              bare
              label="Conversation tracker"
            />

            <div className="ml-conv__bar">
              <div className="ml-presence-row" aria-live="polite">
                {clash.others.length ? (
                  clash.others.map((p) => {
                    const u = ctx.userMap.get(p.userId);
                    if (!u) return null;
                    return (
                      <span key={p.userId} className="ml-presence" data-mode={p.mode}>
                        <Avatar user={u} size={20} presence />
                        <b>{firstOf(u.name)}</b>
                        <span>{p.mode === 'typing' ? 'is typing a reply' : 'is viewing'}</span>
                        {p.mode === 'typing' && <Typing label="Typing" />}
                      </span>
                    );
                  })
                ) : (
                  <span className="ml-presence" data-mode="alone">
                    <Eye aria-hidden="true" /> <span>Only you are here</span>
                  </span>
                )}
              </div>
              <span className="grow" />
              <PeoplePicker
                value={conv.assigneeId ? [conv.assigneeId] : []}
                onChange={(ids) => {
                  assignShared(conv.id, ids[0] ?? null);
                  if (ids[0]) toast.success('Assigned', ctx.userMap.get(ids[0])?.name);
                }}
                users={members}
                allowNone
                label="Assign conversation"
                trigger={(p) => (
                  <button {...p} type="button" className="neo-btn neo-btn--soft neo-btn--xs">
                    {conv.assigneeId && ctx.userMap.get(conv.assigneeId) ? <Avatar user={ctx.userMap.get(conv.assigneeId)!} size={18} /> : <UserPlus />}
                    <span>{conv.assigneeId ? firstOf(ctx.userMap.get(conv.assigneeId)?.name ?? '') : 'Assign'}</span>
                    <ChevronDown />
                  </button>
                )}
              />
              {conv.assigneeId !== me && conv.status !== 'resolved' && (
                <button
                  type="button"
                  className="neo-btn neo-btn--plasma neo-btn--xs"
                  onClick={() => {
                    assignShared(conv.id, me);
                    toast.success('Claimed', conv.subject);
                  }}
                >
                  <Hand /> <span>Claim</span>
                </button>
              )}
              <NeoMenu
                items={statusMenu}
                label="Status"
                trigger={(p) => (
                  <button {...p} type="button" className="neo-btn neo-btn--ghost neo-btn--xs">
                    <span>{STATUS[conv.status].label}</span> <ChevronDown />
                  </button>
                )}
              />
              {conv.ticket ? (
                <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => navigate(conv.ticket!.to)}>
                  <LifeBuoy /> <b className="neo-mono">{conv.ticket.id}</b>
                </button>
              ) : (
                <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => void toTicket()}>
                  <LifeBuoy /> <span>Convert to Helpdesk ticket</span>
                </button>
              )}
            </div>

            <ol className="ml-conv__thread">
              {timeline.map((item) =>
                item.kind === 'msg' ? (
                  <li key={item.m.id} className="ml-bubble" data-side={item.m.from === conv.from ? 'them' : 'us'}>
                    <ContactAvatar c={ctx.resolve(item.m.from)} size={28} />
                    <div className="ml-bubble__body">
                      <span className="ml-bubble__meta">
                        <b>{ctx.resolve(item.m.from).name}</b> <span>{fmt.full(item.m.at)}</span>
                      </span>
                      <p data-no-i18n dir="auto">
                        {item.m.body}
                      </p>
                    </div>
                  </li>
                ) : (
                  <li key={item.n.id} className="ml-sticky">
                    <StickyNote aria-hidden="true" />
                    <div>
                      <span className="ml-sticky__meta">
                        <b>{firstOf(ctx.userMap.get(item.n.authorId)?.name ?? '')}</b> · <span>Internal note — not sent to the customer</span> · <span>{fmt.when(item.n.at, now)}</span>
                      </span>
                      <p data-no-i18n dir="auto">
                        {item.n.text}
                      </p>
                    </div>
                  </li>
                ),
              )}
            </ol>

            <div className="ml-conv__reply" data-mode={mode}>
              <div className="ml-conv__modes" role="tablist" aria-label="Reply or note">
                <button type="button" role="tab" aria-selected={mode === 'reply'} onClick={() => setMode('reply')}>
                  <Send className="ml-flip" /> <span>Reply</span>
                </button>
                <button type="button" role="tab" aria-selected={mode === 'note'} onClick={() => setMode('note')}>
                  <StickyNote /> <span>Internal note</span>
                </button>
              </div>
              <textarea
                className="neo-textarea ml-conv__input"
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={mode === 'reply' ? 'Reply on behalf of the team…' : 'Add an internal note — only your team sees this'}
                aria-label={mode === 'reply' ? 'Reply' : 'Internal note'}
                dir="auto"
              />
              {confirmCollide && clash.typing && (
                <div className="ml-collide" role="alert">
                  <Typing label="Typing" />
                  <span>
                    <b>{firstOf(ctx.userMap.get(clash.typing.userId)?.name ?? '')}</b> <span>is typing a reply right now — send anyway?</span>
                  </span>
                  <button type="button" className="neo-btn neo-btn--danger neo-btn--xs" onClick={() => { replyShared(conv.id, text); setText(''); setConfirmCollide(false); toast.success('Reply sent', box.mailbox.address); }}>
                    <span>Send anyway</span>
                  </button>
                </div>
              )}
              <div className="ml-conv__foot">
                {mode === 'reply' && (
                  <NeoMenu
                    items={canned}
                    label="Canned responses"
                    placement="top-start"
                    trigger={(p) => (
                      <button {...p} type="button" className="neo-btn neo-btn--ghost neo-btn--xs">
                        <MessageSquareQuote /> <span>Canned responses</span>
                      </button>
                    )}
                  />
                )}
                <span className="grow" />
                <button type="button" className={`neo-btn neo-btn--${mode === 'reply' ? 'plasma' : 'soft'} neo-btn--sm`} onClick={submit} disabled={!text.trim()}>
                  {mode === 'reply' ? <Send className="ml-flip" /> : <PenLine />} <span>{mode === 'reply' ? 'Send reply' : 'Add note'}</span>
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="ml-conv ml-conv--empty">
            <NeoEmpty icon={<Inbox />} title="Pick a conversation" compact />
          </section>
        )}
      </div>
    </div>
  );
}
