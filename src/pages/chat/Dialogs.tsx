/**
 * Pulse Chat dialogs: poll, kudos, standup, Drive picker, share/forward, create task, report to IT,
 * new message (DM / group) and create channel.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ClipboardList, Forward, Globe2, HardDrive, Hash, Lock, MessageCirclePlus, Plus, Target, Trash2, Trophy, Vote, LifeBuoy, X, Sparkles } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/primitives';
import { Chip, NeoSearch, NovaChip, PeoplePicker } from '@/components/neo';
import { burstConfetti } from '@/lib/confetti';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import type { BridgeFile, BridgeProject } from '@/lib/appBridge';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import type { KudosValue } from '@/types';
import { canPost, canView, canCreateChannel } from '@/chat/access';
import { KUDOS_VALUES } from '@/chat/constants';
import { slugifyChannel } from '@/chat/ids';
import { useChat } from '@/chat/store';
import type { ChatMessage, Conversation, DriveFileRef } from '@/chat/types';
import { createTaskFromMessage, linkedProjectId, listWritableProjects, raiseTicket, searchDrive, suggestTitle } from './actions';
import { convTitle, useNames, useViewer } from './hooks';
import { ConvIcon, fileIcon, FILE_TONE, Md } from './parts';
import { ProjectSigil } from '@/projects/sigils';

const icon = (I: typeof Vote) => (
  <span className="pc-dialog-icon">
    <I />
  </span>
);

/* ---------------------------------------------------------------- poll */

export function PollDialog({ open, onClose, conv, prefill }: { open: boolean; onClose: () => void; conv: Conversation; prefill?: { question?: string; options?: string[] } }) {
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState<string[]>(['', '']);
  const [multi, setMulti] = useState(false);
  const [anon, setAnon] = useState(false);
  useEffect(() => {
    if (!open) return;
    setQ(prefill?.question ?? '');
    const o = prefill?.options?.length ? [...prefill.options] : [];
    while (o.length < 2) o.push('');
    setOpts(o);
    setMulti(false);
    setAnon(false);
  }, [open, prefill]);
  const valid = q.trim().length >= 3 && opts.filter((o) => o.trim()).length >= 2;
  const submit = () => {
    const res = useChat.getState().createPoll(conv.id, { question: q, options: opts, multi, anonymous: anon });
    if (!res.ok) return toast.error(res.error);
    toast.success('Poll posted', conv.kind === 'channel' ? `in #${conv.name}` : undefined);
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a poll"
      subtitle={conv.kind === 'channel' ? `Posting to #${conv.name}` : 'Posting to this conversation'}
      icon={icon(Vote)}
      className="neo-portal pc-dialog"
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" disabled={!valid} onClick={submit} data-qa="poll-submit">
            Post poll
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <div className="neo-field">
          <label htmlFor="pc-poll-q">Question</label>
          <input id="pc-poll-q" className="neo-input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="What should we do for the Friday social?" maxLength={200} />
        </div>
        <div className="neo-field">
          <label>Options</label>
          {opts.map((o, i) => (
            <div key={i} className="row" style={{ gap: 6 }}>
              <span className="pc-opt-n neo-mono">{i + 1}</span>
              <input
                className="neo-input neo-input--sm"
                value={o}
                onChange={(e) => setOpts((x) => x.map((y, j) => (j === i ? e.target.value : y)))}
                placeholder={`Option ${i + 1}`}
                maxLength={80}
                aria-label={`Option ${i + 1}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && i === opts.length - 1 && opts.length < 10) {
                    e.preventDefault();
                    setOpts((x) => [...x, '']);
                  }
                }}
              />
              {opts.length > 2 && (
                <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={() => setOpts((x) => x.filter((_, j) => j !== i))} aria-label={`Remove option ${i + 1}`}>
                  <Trash2 />
                </button>
              )}
            </div>
          ))}
          {opts.length < 10 && (
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => setOpts((x) => [...x, ''])}>
              <Plus /> Add option
            </button>
          )}
        </div>
        <div className="row row--wrap" style={{ gap: 16 }}>
          <label className="pc-check">
            <input type="checkbox" className="neo-check" checked={multi} onChange={(e) => setMulti(e.target.checked)} /> Allow multiple choices
          </label>
          <label className="pc-check">
            <input type="checkbox" className="neo-check" checked={anon} onChange={(e) => setAnon(e.target.checked)} /> Anonymous votes
          </label>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- kudos */

export function KudosDialog({ open, onClose, conv, prefill }: { open: boolean; onClose: () => void; conv?: Conversation; prefill?: { toId?: string; message?: string; value?: string } }) {
  const v = useViewer();
  const names = useNames();
  const users = useHub((s) => s.users);
  const [to, setTo] = useState<string[]>([]);
  const [value, setValue] = useState<KudosValue>('teamwork');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (!open) return;
    setTo(prefill?.toId ? [prefill.toId] : []);
    setValue((KUDOS_VALUES.find((k) => k.id === prefill?.value)?.id as KudosValue) ?? 'teamwork');
    setMsg(prefill?.message ?? '');
  }, [open, prefill]);
  const target = conv && v && conv.kind === 'channel' && canPost(conv, v.viewer).ok ? conv : undefined;
  const dest = target ?? useChat.getState().conversations.find((c) => c.id === 'ch-kudos');
  const candidates = useMemo(() => users.filter((u) => u.active && u.id !== v?.user.id), [users, v]);
  const submit = () => {
    const res = useChat.getState().sendKudos({ convId: dest?.id, toId: to[0], value, message: msg });
    if (!res.ok) return toast.error(res.error);
    burstConfetti();
    toast.success(`Kudos sent to ${names.first(to[0])}! 🎉`, 'Posted in chat and added to the Hub kudos wall.');
    onClose();
  };
  const person = to[0] ? names.user(to[0]) : undefined;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send kudos"
      subtitle={`Celebrate a teammate${dest ? ` in #${dest.name}` : ''} — it also lands on the Hub kudos wall.`}
      icon={icon(Trophy)}
      width={560}
      className="neo-portal pc-dialog"
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" disabled={!to.length || msg.trim().length < 5} onClick={submit} data-qa="kudos-submit">
            <Trophy /> Send kudos
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 16 }}>
        <div className="neo-field">
          <label>Who are you celebrating?</label>
          <PeoplePicker
            value={to}
            onChange={setTo}
            users={candidates}
            label="Choose a teammate"
            trigger={(p) => (
              <button {...p} type="button" className="pc-picker-btn" data-qa="kudos-person">
                {person ? (
                  <>
                    <Avatar user={person} size={28} presence />
                    <span className="grow" style={{ textAlign: 'left' }}>
                      <strong>{person.name}</strong>
                      <span className="neo-faint text-xs" style={{ display: 'block' }}>
                        {person.title}
                      </span>
                    </span>
                  </>
                ) : (
                  <span className="neo-faint grow" style={{ textAlign: 'left' }}>
                    Pick a teammate…
                  </span>
                )}
              </button>
            )}
          />
        </div>
        <div className="neo-field">
          <label>Value</label>
          <div className="pc-values" role="radiogroup" aria-label="Kudos value">
            {KUDOS_VALUES.map((k) => (
              <button key={k.id} type="button" role="radio" aria-checked={value === k.id} className={cx('pc-value', value === k.id && 'is-on')} data-tone={k.tone} onClick={() => setValue(k.id)}>
                <span className="pc-value__label">{k.label}</span>
                <span className="pc-value__blurb">{k.blurb}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="neo-field">
          <label htmlFor="pc-kudos-msg">Your note</label>
          <textarea id="pc-kudos-msg" className="neo-textarea" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={person ? `What did ${person.name.split(' ')[0]} do that made a difference?` : 'What did they do that made a difference?'} maxLength={400} rows={3} />
          <span className="neo-hint">Be specific — great kudos name the moment and the impact.</span>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- standup */

export function StandupDialog({ open, onClose, conv }: { open: boolean; onClose: () => void; conv: Conversation }) {
  const v = useViewer();
  const [y, setY] = useState('');
  const [t, setT] = useState('');
  const [b, setB] = useState('');
  const last = useMemo(() => {
    if (!v) return null;
    return [...useChat.getState().messages].reverse().find((m) => m.authorId === v.user.id && m.standup) ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, open]);
  useEffect(() => {
    if (open) {
      setY('');
      setT('');
      setB('');
    }
  }, [open]);
  const lines = (s: string) => s.split('\n').map((x) => x.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
  const submit = () => {
    const res = useChat.getState().postStandup(conv.id, { yesterday: lines(y), today: lines(t), blockers: lines(b) });
    if (!res.ok) return toast.error(res.error);
    toast.success('Standup posted');
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Async standup"
      subtitle="One item per line. Your team sees it as a tidy card."
      icon={icon(ClipboardList)}
      width={560}
      className="neo-portal pc-dialog"
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" disabled={!lines(y).length && !lines(t).length} onClick={submit} data-qa="standup-submit">
            Post standup
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        {last?.standup && (
          <button type="button" className="pc-nova-suggest" onClick={() => setY(last.standup!.today.join('\n'))}>
            <NovaChip>Nova</NovaChip>
            <span className="grow">Carry over yesterday’s plan ({last.standup.today.length} item{last.standup.today.length === 1 ? '' : 's'}) into “Yesterday”</span>
          </button>
        )}
        <div className="neo-field">
          <label htmlFor="pc-su-y">Yesterday</label>
          <textarea id="pc-su-y" className="neo-textarea" rows={3} value={y} onChange={(e) => setY(e.target.value)} placeholder="Shipped the token contrast fixes" autoFocus />
        </div>
        <div className="neo-field">
          <label htmlFor="pc-su-t">Today</label>
          <textarea id="pc-su-t" className="neo-textarea" rows={3} value={t} onChange={(e) => setT(e.target.value)} placeholder="Pair with @priya on the planner rollout" />
        </div>
        <div className="neo-field">
          <label htmlFor="pc-su-b">Blockers</label>
          <textarea id="pc-su-b" className="neo-textarea" rows={2} value={b} onChange={(e) => setB(e.target.value)} placeholder="Nothing blocking — leave empty" />
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- drive picker */

export function DrivePickerDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (f: DriveFileRef) => void }) {
  const names = useNames();
  const [q, setQ] = useState('');
  const [files, setFiles] = useState<BridgeFile[] | null>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    const t = window.setTimeout(() => {
      void searchDrive(q, 12).then((res) => {
        if (!alive) return;
        setFiles(res);
        setLoading(false);
      });
    }, 160);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [open, q]);
  useEffect(() => {
    if (open) setQ('');
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Attach from Helix Drive" subtitle="Only files you can open are shown." icon={icon(HardDrive)} width={560} className="neo-portal pc-dialog">
      <div className="stack" style={{ gap: 12 }}>
        <NeoSearch value={q} onChange={setQ} placeholder="Search Drive…" autoFocus label="Search Drive" />
        <div className="pc-picklist" data-qa="drive-list">
          {files === null ? (
            <div className="pc-pick-empty">Helix Drive is updating — try again in a moment.</div>
          ) : loading && !files.length ? (
            <div className="pc-pick-empty">Searching…</div>
          ) : files.length ? (
            files.map((f) => {
              const I = fileIcon(f.kind);
              return (
                <button
                  key={f.id}
                  type="button"
                  className="neo-li"
                  onClick={() => {
                    onPick({ id: f.id, name: f.name, kind: f.kind, to: f.to, ownerId: f.ownerId, updatedAt: f.updatedAt, sensitivity: f.sensitivity, size: f.size });
                    onClose();
                  }}
                >
                  <span className="pc-filecard__icon" style={{ ['--ft' as string]: FILE_TONE[f.kind] ?? '#94a3b8' }}>
                    <I />
                  </span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="truncate" style={{ display: 'block', fontWeight: 600 }}>
                      {f.name}
                    </span>
                    <span className="neo-faint text-xs">
                      {names.first(f.ownerId)} · updated {relativeTime(f.updatedAt)}
                    </span>
                  </span>
                  {f.sensitivity !== 'internal' && f.sensitivity !== 'public' && (
                    <Chip tone="amber" size="sm" icon={<Lock />}>
                      {f.sensitivity}
                    </Chip>
                  )}
                </button>
              );
            })
          ) : (
            <div className="pc-pick-empty">{q ? `No files match “${q}”.` : 'No recent files.'}</div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- forward */

export function ForwardDialog({ open, onClose, message }: { open: boolean; onClose: () => void; message: ChatMessage | null }) {
  const v = useViewer();
  const names = useNames();
  const conversations = useChat((s) => s.conversations);
  const [q, setQ] = useState('');
  const [dest, setDest] = useState<string | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (open) {
      setQ('');
      setDest(null);
      setNote('');
    }
  }, [open]);
  const list = useMemo(() => {
    if (!v) return [];
    const s = q.trim().toLowerCase();
    return conversations
      .filter((c) => c.memberIds.includes(v.user.id) && canView(c, v.viewer) && canPost(c, v.viewer).ok && c.kind !== 'app')
      .map((c) => ({ c, title: convTitle(c, v.user.id, names) }))
      .filter((x) => !s || x.title.toLowerCase().includes(s))
      .slice(0, 30);
  }, [conversations, v, q, names]);
  const submit = () => {
    if (!message || !dest) return;
    const res = useChat.getState().forward(message.id, dest, note.trim() || undefined);
    if (!res.ok) return toast.error(res.error);
    toast.success('Message shared');
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Share message"
      icon={icon(Forward)}
      width={540}
      className="neo-portal pc-dialog"
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" disabled={!dest} onClick={submit}>
            <Forward /> Share
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        {message && (
          <div className="pc-forward">
            <div className="pc-forward__head">
              <strong>{names.name(message.authorId)}</strong>
            </div>
            <Md text={message.text || message.card?.title || message.poll?.question || 'Attachment'} />
          </div>
        )}
        <NeoSearch value={q} onChange={setQ} placeholder="Search channels and people…" size="sm" label="Search destinations" />
        <div className="pc-picklist pc-picklist--short">
          {list.map(({ c, title }) => (
            <button key={c.id} type="button" className={cx('neo-li', dest === c.id && 'is-active')} onClick={() => setDest(c.id)} aria-pressed={dest === c.id}>
              <ConvIcon conv={c} viewerId={v?.user.id} size={24} />
              <span className="grow truncate">{c.kind === 'channel' ? `#${title}` : title}</span>
              {c.visibility === 'private' && c.kind === 'channel' && <Lock className="pc-hud-icon" />}
            </button>
          ))}
        </div>
        <input className="neo-input neo-input--sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional)" aria-label="Note" />
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- task */

export function TaskDialog({ open, onClose, message, conv }: { open: boolean; onClose: () => void; message: ChatMessage | null; conv: Conversation }) {
  const [title, setTitle] = useState('');
  const [projects, setProjects] = useState<BridgeProject[] | null>(null);
  const [projectId, setProjectId] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || !message) return;
    setTitle(suggestTitle(message));
    setDue('');
    setProjects(null);
    void listWritableProjects().then((p) => {
      setProjects(p);
      const linked = linkedProjectId(conv);
      setProjectId(linked && p.some((x) => x.id === linked) ? linked : '');
    });
  }, [open, message, conv]);
  const submit = async () => {
    if (!message) return;
    setBusy(true);
    const ok = await createTaskFromMessage(message, conv, { title, projectId, dueDate: due });
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create task"
      subtitle="Adds a Helix Projects task linked back to this message."
      icon={icon(Target)}
      className="neo-portal pc-dialog"
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" disabled={title.trim().length < 2 || busy} onClick={() => void submit()} data-qa="task-submit">
            Create task
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <div className="neo-field">
          <label htmlFor="pc-task-title">Title</label>
          <input id="pc-task-title" className="neo-input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus maxLength={160} />
        </div>
        <div className="row row--wrap" style={{ gap: 12 }}>
          <div className="neo-field grow" style={{ minWidth: 200 }}>
            <label htmlFor="pc-task-project">Project</label>
            <select id="pc-task-project" className="neo-select" value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={projects === null}>
              <option value="">My Tasks (personal)</option>
              {(projects ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  <ProjectSigil icon={p.icon} color={p.color} size={18} /> {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="neo-field" style={{ width: 170 }}>
            <label htmlFor="pc-task-due">Due date</label>
            <input id="pc-task-due" type="date" className="neo-input" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
        </div>
        {message && (
          <div className="pc-quote">
            <span className="neo-hud">From the message</span>
            <Md text={message.text || message.card?.title || ''} />
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- ticket */

export function TicketDialog({ open, onClose, message, conv }: { open: boolean; onClose: () => void; message: ChatMessage | null; conv: Conversation }) {
  const [subject, setSubject] = useState('');
  const [priority, setPriority] = useState<'P1' | 'P2' | 'P3' | 'P4'>('P3');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || !message) return;
    setSubject(suggestTitle(message));
    setDesc('');
    setPriority(/urgent|down|outage|can't|cannot|blocked/i.test(message.text) ? 'P2' : 'P3');
  }, [open, message]);
  const submit = async () => {
    if (!message) return;
    setBusy(true);
    const ok = await raiseTicket({ subject, description: [desc, '', `From Pulse Chat: “${message.text.slice(0, 400)}”`].join('\n').trim(), priority, source: message, conv });
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Report to IT"
      subtitle="Raises a private IT Helpdesk ticket — nothing is posted to the channel."
      icon={icon(LifeBuoy)}
      className="neo-portal pc-dialog"
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" disabled={subject.trim().length < 4 || busy} onClick={() => void submit()} data-qa="ticket-submit">
            Raise ticket
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <div className="neo-field">
          <label htmlFor="pc-tk-subject">Subject</label>
          <input id="pc-tk-subject" className="neo-input" value={subject} onChange={(e) => setSubject(e.target.value)} autoFocus maxLength={160} />
        </div>
        <div className="neo-field">
          <label>Priority</label>
          <div className="row" style={{ gap: 6 }}>
            {(['P1', 'P2', 'P3', 'P4'] as const).map((p) => (
              <Chip key={p} tone={p === 'P1' ? 'danger' : p === 'P2' ? 'orange' : p === 'P3' ? 'app' : 'slate'} onClick={() => setPriority(p)} pressed={priority === p} size="lg">
                {p}
              </Chip>
            ))}
          </div>
        </div>
        <div className="neo-field">
          <label htmlFor="pc-tk-desc">Anything else IT should know?</label>
          <textarea id="pc-tk-desc" className="neo-textarea" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Device, when it started, what you tried…" />
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- new message */

export function NewMessageDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const v = useViewer();
  const users = useHub((s) => s.users);
  const navigate = useNavigate();
  const [ids, setIds] = useState<string[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (open) {
      setIds([]);
      setQ('');
    }
  }, [open]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return users.filter((u) => u.active && u.id !== v?.user.id && (!s || `${u.name} ${u.title} ${u.department}`.toLowerCase().includes(s))).slice(0, 40);
  }, [users, v, q]);
  const go = () => {
    const res = useChat.getState().openDm(ids);
    if (!res.ok) return toast.error(res.error);
    onClose();
    navigate(`/chat/c/${res.convId}`);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New message"
      subtitle="Pick one person for a DM, or several for a group conversation."
      icon={icon(MessageCirclePlus)}
      width={520}
      className="neo-portal pc-dialog"
      footer={
        <>
          <span className="grow neo-faint text-sm">{ids.length > 1 ? `Group with ${ids.length} people` : ids.length ? 'Direct message' : ''}</span>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" disabled={!ids.length} onClick={go} data-qa="new-dm-go">
            Start conversation
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 10 }}>
        {ids.length > 0 && (
          <div className="row row--wrap" style={{ gap: 6 }}>
            {ids.map((id) => {
              const u = users.find((x) => x.id === id)!;
              return (
                <span key={id} className="pc-token">
                  <Avatar user={u} size={20} />
                  {u.name}
                  <button type="button" onClick={() => setIds((x) => x.filter((y) => y !== id))} aria-label={`Remove ${u.name}`}>
                    <X />
                  </button>
                </span>
              );
            })}
          </div>
        )}
        <NeoSearch value={q} onChange={setQ} placeholder="Search people…" autoFocus label="Search people" />
        <div className="pc-picklist">
          {list.map((u) => {
            const on = ids.includes(u.id);
            return (
              <button key={u.id} type="button" className={cx('neo-li', on && 'is-active')} onClick={() => setIds((x) => (on ? x.filter((y) => y !== u.id) : [...x, u.id]))} aria-pressed={on} onDoubleClick={() => (setIds([u.id]), window.setTimeout(go, 0))}>
                <Avatar user={u} size={30} presence />
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="truncate" style={{ display: 'block', fontWeight: 600 }}>
                    {u.name}
                  </span>
                  <span className="neo-faint text-xs truncate" style={{ display: 'block' }}>
                    {u.title} · {u.location}
                  </span>
                </span>
                <input type="checkbox" className="neo-check" checked={on} readOnly tabIndex={-1} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- new channel */

const CHANNEL_ICONS = ['💬', '🚀', '🎨', '🛠️', '📣', '☕', '🧪', '📈', '🌍', '🎯', '🔐', '🎉'];

export function NewChannelDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const v = useViewer();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'private'>('public');
  const [members, setMembers] = useState<string[]>([]);
  const [glyph, setGlyph] = useState('💬');
  const names = useNames();
  useEffect(() => {
    if (open) {
      setName('');
      setTopic('');
      setPrivacy('public');
      setMembers([]);
      setGlyph('💬');
    }
  }, [open]);
  const slug = slugifyChannel(name);
  const exists = useChat((s) => s.conversations.some((c) => c.kind === 'channel' && c.name === slug));
  const allowed = !!v && canCreateChannel(v.viewer);
  const submit = () => {
    const res = useChat.getState().createChannel({ name, topic, visibility: privacy, memberIds: members, icon: glyph });
    if (!res.ok) return toast.error(res.error);
    toast.success(`#${res.conv.name} created`, privacy === 'private' ? 'Only members can see it.' : 'Anyone at Helix can find and join it.');
    onClose();
    navigate(`/chat/c/${res.conv.id}`);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a channel"
      subtitle="Channels are where your team talks about a topic or project."
      icon={icon(Hash)}
      width={560}
      className="neo-portal pc-dialog"
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" disabled={!allowed || slug.length < 2 || exists} onClick={submit} data-qa="channel-submit">
            Create channel
          </button>
        </>
      }
    >
      {!allowed ? (
        <div className="pc-locked">Your account can’t create channels — ask an employee to create one and add you.</div>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          <div className="neo-field">
            <label htmlFor="pc-ch-name">Name</label>
            <div className="pc-chname">
              <span className="pc-chname__glyph">{glyph}</span>
              <input id="pc-ch-name" className="neo-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. launch-week" autoFocus maxLength={40} />
            </div>
            <span className={cx('neo-hint', exists && 'pc-hint-err')}>{slug ? (exists ? `#${slug} already exists` : `Will be created as #${slug}`) : 'Lowercase, numbers and dashes.'}</span>
          </div>
          <div className="neo-field">
            <label>Icon</label>
            <div className="row row--wrap" style={{ gap: 4 }}>
              {CHANNEL_ICONS.map((g) => (
                <button key={g} type="button" className={cx('pc-glyphpick', glyph === g && 'is-on')} onClick={() => setGlyph(g)} aria-pressed={glyph === g} aria-label={`Icon ${g}`}>
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div className="neo-field">
            <label htmlFor="pc-ch-topic">Topic (optional)</label>
            <input id="pc-ch-topic" className="neo-input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What’s this channel about?" maxLength={250} />
          </div>
          <div className="neo-field">
            <label>Visibility</label>
            <div className="pc-privacy">
              <button type="button" className={cx('pc-privacy__opt', privacy === 'public' && 'is-on')} onClick={() => setPrivacy('public')} aria-pressed={privacy === 'public'}>
                <Globe2 />
                <span>
                  <strong>Public</strong>
                  <span className="neo-faint text-xs">Anyone at Helix can find and join</span>
                </span>
              </button>
              <button type="button" className={cx('pc-privacy__opt', privacy === 'private' && 'is-on')} onClick={() => setPrivacy('private')} aria-pressed={privacy === 'private'}>
                <Lock />
                <span>
                  <strong>Private</strong>
                  <span className="neo-faint text-xs">Only invited members can see it</span>
                </span>
              </button>
            </div>
          </div>
          <div className="neo-field">
            <label>Add people</label>
            <PeoplePicker
              value={members}
              onChange={setMembers}
              multiple
              label="Add people"
              trigger={(p) => (
                <button {...p} type="button" className="pc-picker-btn">
                  {members.length ? (
                    <span className="row row--wrap" style={{ gap: 4 }}>
                      {members.slice(0, 6).map((id) => (
                        <span key={id} className="pc-token pc-token--sm">
                          {names.first(id)}
                        </span>
                      ))}
                      {members.length > 6 && <span className="neo-faint text-xs">+{members.length - 6}</span>}
                    </span>
                  ) : (
                    <span className="neo-faint">
                      <Sparkles className="pc-hud-icon" /> Choose teammates (you can add more later)
                    </span>
                  )}
                </button>
              )}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
