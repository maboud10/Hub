/**
 * Right inspector: Thread panel (with Nova recap) and Conversation details
 * (About · Members · Pinned · Files & links · notifications · leave).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Bell, BellOff, BellRing, ExternalLink, FileText, Hash, Link2, LogOut, Pencil, Pin, Search, Star, UserMinus, UserPlus, Users, X, Sparkles, Info } from 'lucide-react';
import { Chip, NeoEmpty, NeoSearch, NeoTabs, NovaChip, PeoplePicker, Typing, useTypewriter } from '@/components/neo';
import { Avatar, PRESENCE_LABEL } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { formatDate, relativeTime } from '@/lib/format';
import { toast } from '@/store/toast';
import { canInvite, canLeave, canManage, canRemoveMember } from '@/chat/access';
import { BOTS } from '@/chat/constants';
import { threadRecap } from '@/chat/nova';
import { indexMessages } from '@/chat/selectors';
import { useChat } from '@/chat/store';
import type { ChatMessage, Conversation, NotifyLevel } from '@/chat/types';
import { Composer, type ComposerDialog } from './Composer';
import { Message, type MessageAction } from './Message';
import { convTitle, dmPeer, useNames, usePerson, usePlain, useViewer } from './hooks';
import { AuthorAvatar, ConvIcon, fileIcon, FILE_TONE, localTime, Md } from './parts';

/* ---------------------------------------------------------------- thread */

function NovaRecap({ text, onClose }: { text: string; onClose: () => void }) {
  const [shown, done] = useTypewriter(text, 160);
  return (
    <div className="neo-nova pc-novacard" data-qa="nova-recap">
      <span className="neo-nova__glow" />
      <div className="pc-novacard__head">
        <NovaChip>Nova recap</NovaChip>
        <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={onClose} aria-label="Dismiss recap">
          <X />
        </button>
      </div>
      <Md text={shown + (done ? '' : ' ▍')} className="pc-novacard__body" />
    </div>
  );
}

export function ThreadPanel({ conv, parentId, onClose, onAction, onDialog, focusMsg }: { conv: Conversation; parentId: string; onClose: () => void; onAction: (k: MessageAction, m: ChatMessage) => void; onDialog: (d: ComposerDialog, attach?: (f: import('@/chat/types').DriveFileRef) => void) => void; focusMsg?: string | null }) {
  const messages = useChat((s) => s.messages);
  const names = useNames();
  const plain = usePlain();
  const idx = indexMessages(messages);
  const parent = idx.byId.get(parentId);
  const replies = idx.threads.get(parentId) ?? [];
  const [thinking, setThinking] = useState(false);
  const [recap, setRecap] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    useChat.getState().markThreadRead(parentId);
  }, [parentId, replies.length]);
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    if (focusMsg) {
      const target = el.querySelector(`[data-msg="${focusMsg}"]`);
      if (target) {
        target.scrollIntoView({ block: 'center' });
        return;
      }
    }
    el.scrollTop = el.scrollHeight;
  }, [replies.length, focusMsg]);

  if (!parent)
    return (
      <div className="pc-insp">
        <div className="pc-insp__head">
          <div className="pc-insp__title">Thread</div>
          <button type="button" className="neo-iconbtn" onClick={onClose} aria-label="Close thread">
            <X />
          </button>
        </div>
        <NeoEmpty icon={<Info />} title="Thread not found" compact>
          It may have been deleted.
        </NeoEmpty>
      </div>
    );

  const summarize = () => {
    setThinking(true);
    setRecap(null);
    window.setTimeout(() => {
      setThinking(false);
      setRecap(threadRecap(parent, replies, { meId: '', now: Date.now(), userName: names.name, plain, convLabel: () => '', replyCount: () => replies.length }));
    }, 650);
  };

  return (
    <div className="pc-insp" data-qa="thread-panel">
      <div className="pc-insp__head">
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="pc-insp__title">Thread</div>
          <div className="pc-insp__sub truncate">{conv.kind === 'channel' ? `#${conv.name}` : convTitle(conv, undefined, names)}</div>
        </div>
        {replies.length > 1 && (
          <button type="button" className="neo-btn neo-btn--nova neo-btn--sm" onClick={summarize} disabled={thinking} data-qa="thread-summarize">
            <Sparkles /> Summarize
          </button>
        )}
        <button type="button" className="neo-iconbtn" onClick={onClose} aria-label="Close thread" data-tip="Close (Esc)">
          <X />
        </button>
      </div>
      <div className="pc-insp__body pc-scroll" ref={body}>
        {thinking && (
          <div className="neo-nova pc-novacard">
            <span className="neo-nova__glow" />
            <div className="pc-novacard__head">
              <NovaChip>Nova is reading the thread</NovaChip>
              <Typing label="Thinking" />
            </div>
          </div>
        )}
        {recap && <NovaRecap text={recap} onClose={() => setRecap(null)} />}
        <Message m={parent} conv={conv} inThread onAction={onAction} />
        <div className="pc-thread-divider">
          <span>
            {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
          </span>
        </div>
        {replies.map((r, i) => (
          <Message key={r.id} m={r} conv={conv} inThread grouped={i > 0 && replies[i - 1].authorId === r.authorId && r.at - replies[i - 1].at < 5 * 60_000} highlight={focusMsg === r.id} onAction={onAction} />
        ))}
      </div>
      <div className="pc-insp__foot">
        <Composer conv={conv} parentId={parentId} placeholder="Reply in thread…" autoFocus onDialog={onDialog} onHuddle={() => undefined} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- details */

type Tab = 'about' | 'members' | 'pinned' | 'files';

export function DetailsPanel({ conv, tab, onTab, onClose }: { conv: Conversation; tab: Tab; onTab: (t: Tab) => void; onClose: () => void }) {
  const v = useViewer();
  const names = useNames();
  const person = usePerson();
  const messages = useChat((s) => s.messages);
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [topic, setTopic] = useState(conv.topic ?? '');
  const [desc, setDesc] = useState(conv.description ?? '');
  const [q, setQ] = useState('');
  const idx = indexMessages(messages);
  const title = convTitle(conv, v?.user.id, names);
  const manage = !!v && canManage(conv, v.viewer);
  const level: NotifyLevel = person.notify[conv.id] ?? (person.muted.includes(conv.id) ? 'none' : conv.kind === 'channel' ? 'mentions' : 'all');
  const peer = dmPeer(conv, v?.user.id);
  const peerUser = peer ? names.user(peer) : undefined;

  const pinned = useMemo(() => conv.pinnedIds.map((id) => idx.byId.get(id)).filter((m): m is ChatMessage => !!m && !m.deleted), [conv.pinnedIds, idx]);
  const filesAndLinks = useMemo(() => {
    const list = (idx.byConv.get(conv.id) ?? []).concat(...[...idx.threads.entries()].filter(([pid]) => idx.byId.get(pid)?.convId === conv.id).map(([, r]) => r));
    const files: { key: string; name: string; kind: string; to?: string; by: string; at: number }[] = [];
    const links: { key: string; href: string; label: string; by: string; at: number }[] = [];
    for (const m of list) {
      if (m.deleted) continue;
      for (const f of m.files ?? []) files.push({ key: `${m.id}:${f.id}`, name: f.name, kind: f.kind, to: f.to, by: m.authorId, at: m.at });
      for (const a of m.attachments ?? []) files.push({ key: `${m.id}:${a.id}`, name: a.name, kind: a.mime.startsWith('image/') ? 'image' : a.mime.includes('pdf') ? 'pdf' : 'doc', by: m.authorId, at: m.at });
      if (m.card) links.push({ key: `${m.id}:card`, href: m.card.to, label: m.card.title, by: m.authorId, at: m.at });
      for (const mm of m.text.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>"]+)/g)) links.push({ key: `${m.id}:${mm.index}`, href: mm[2] ?? mm[3], label: mm[1] ?? mm[3].replace(/^https?:\/\//, ''), by: m.authorId, at: m.at });
    }
    return { files: files.sort((a, b) => b.at - a.at), links: links.sort((a, b) => b.at - a.at) };
  }, [idx, conv.id]);

  const members = useMemo(() => {
    const s = q.trim().toLowerCase();
    return conv.memberIds
      .filter((id) => !id.startsWith('bot-'))
      .map((id) => names.user(id))
      .filter((u): u is NonNullable<typeof u> => !!u && (!s || u.name.toLowerCase().includes(s)))
      .sort((a, b) => Number(conv.adminIds.includes(b.id)) - Number(conv.adminIds.includes(a.id)) || a.name.localeCompare(b.name));
  }, [conv, names, q]);

  const saveAbout = () => {
    const res = useChat.getState().updateChannel(conv.id, { topic, description: desc });
    if (!res.ok) return toast.error(res.error);
    setEditing(false);
    toast.success('Channel updated');
  };

  const tabs = [
    { value: 'about' as const, label: 'About' },
    ...(conv.kind !== 'app' ? [{ value: 'members' as const, label: 'Members', count: members.length }] : []),
    { value: 'pinned' as const, label: 'Pinned', count: pinned.length || null },
    { value: 'files' as const, label: 'Files', count: filesAndLinks.files.length + filesAndLinks.links.length || null },
  ];

  return (
    <div className="pc-insp" data-qa="details-panel">
      <div className="pc-insp__head">
        <div className="pc-insp__title">Details</div>
        <span className="grow" />
        <button type="button" className="neo-iconbtn" onClick={onClose} aria-label="Close details" data-tip="Close (Esc)">
          <X />
        </button>
      </div>
      <div className="pc-details__hero">
        <ConvIcon conv={conv} viewerId={v?.user.id} size={56} />
        <div className="pc-details__name">{conv.kind === 'channel' ? `#${title}` : title}</div>
        <div className="row row--wrap" style={{ gap: 6, justifyContent: 'center' }}>
          {conv.kind === 'channel' && <Chip tone={conv.visibility === 'private' ? 'amber' : 'app'} size="sm">{conv.visibility === 'private' ? 'Private channel' : 'Public channel'}</Chip>}
          {conv.posting === 'admins' && <Chip tone="violet" size="sm">Announcements</Chip>}
          {conv.kind === 'group' && <Chip tone="app" size="sm">Group · {conv.memberIds.length}</Chip>}
          {conv.kind === 'app' && <Chip tone="violet" size="sm">App</Chip>}
          {peerUser && <Chip tone="slate" size="sm">{PRESENCE_LABEL[names.presence(peerUser.id)]}</Chip>}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className={cx('neo-btn neo-btn--sm', person.starred.includes(conv.id) ? 'neo-btn--soft' : 'neo-btn--ghost')} onClick={() => useChat.getState().toggleStar(conv.id)}>
            <Star /> {person.starred.includes(conv.id) ? 'Starred' : 'Star'}
          </button>
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => navigate(`/chat/search?q=${encodeURIComponent(conv.kind === 'channel' ? `in:#${conv.name} ` : peer ? `in:@${names.handle(peer)} ` : '')}`)}>
            <Search /> Search
          </button>
        </div>
      </div>
      <div className="pc-details__tabs">
        <NeoTabs value={tab} onChange={onTab} items={tabs} variant="underline" label="Conversation details" />
      </div>
      <div className="pc-insp__body pc-scroll">
        {tab === 'about' && (
          <div className="stack" style={{ gap: 16 }}>
            {peerUser && (
              <div className="pc-about-card">
                <div className="row" style={{ gap: 12 }}>
                  <Avatar user={{ ...peerUser, presence: names.presence(peerUser.id) }} size={44} presence />
                  <div style={{ minWidth: 0 }}>
                    <div className="neo-title">{peerUser.name}</div>
                    <div className="neo-faint text-sm">{peerUser.title}</div>
                  </div>
                </div>
                <dl className="neo-kv" style={{ marginTop: 12 }}>
                  <dt>Local time</dt>
                  <dd>
                    {localTime(peerUser.timezone)} · {peerUser.location}
                  </dd>
                  <dt>Department</dt>
                  <dd>{peerUser.department}</dd>
                  <dt>Handle</dt>
                  <dd className="neo-mono">@{names.handle(peerUser.id)}</dd>
                  {peerUser.statusMessage && (
                    <>
                      <dt>Status</dt>
                      <dd>{peerUser.statusMessage}</dd>
                    </>
                  )}
                </dl>
              </div>
            )}
            {conv.kind === 'app' && conv.botId && <p className="neo-muted text-sm">{BOTS[conv.botId].blurb}</p>}
            {conv.kind === 'channel' && (
              <div className="pc-about-card">
                <div className="row row--between">
                  <span className="neo-hud">Topic & description</span>
                  {manage && !editing && (
                    <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => (setTopic(conv.topic ?? ''), setDesc(conv.description ?? ''), setEditing(true))} data-qa="edit-topic">
                      <Pencil /> Edit
                    </button>
                  )}
                </div>
                {editing ? (
                  <div className="stack" style={{ gap: 8, marginTop: 8 }}>
                    <input className="neo-input neo-input--sm" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic" maxLength={250} aria-label="Topic" autoFocus />
                    <textarea className="neo-textarea" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description" maxLength={600} aria-label="Description" />
                    <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => setEditing(false)}>
                        Cancel
                      </button>
                      <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={saveAbout}>
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="pc-about-topic">{conv.topic || <span className="neo-faint">No topic yet</span>}</p>
                    {conv.description && <p className="neo-muted text-sm">{conv.description}</p>}
                  </>
                )}
                <dl className="neo-kv" style={{ marginTop: 12 }}>
                  <dt>Created</dt>
                  <dd>
                    by {names.name(conv.createdBy)} · {formatDate(conv.createdAt)}
                  </dd>
                  <dt>Admins</dt>
                  <dd>{conv.adminIds.map(names.first).join(', ') || '—'}</dd>
                  {conv.linked && (
                    <>
                      <dt>Linked</dt>
                      <dd>
                        <Link to={conv.linked.to} className="pc-link">
                          {conv.linked.label} <ExternalLink className="pc-hud-icon" />
                        </Link>
                      </dd>
                    </>
                  )}
                </dl>
              </div>
            )}
            <div className="pc-about-card">
              <span className="neo-hud">Notifications</span>
              <div className="pc-notify" role="radiogroup" aria-label="Notification level">
                {(
                  [
                    ['all', 'All messages', BellRing],
                    ['mentions', 'Mentions', Bell],
                    ['none', 'Muted', BellOff],
                  ] as const
                ).map(([val, label, I]) => (
                  <button key={val} type="button" role="radio" aria-checked={level === val} className={cx('pc-notify__opt', level === val && 'is-on')} onClick={() => useChat.getState().setNotify(conv.id, val)}>
                    <I /> {label}
                  </button>
                ))}
              </div>
            </div>
            {v && conv.kind === 'channel' && canLeave(conv, v.viewer) && (
              <button
                type="button"
                className="neo-btn neo-btn--danger neo-btn--sm"
                style={{ alignSelf: 'flex-start' }}
                onClick={() => {
                  const res = useChat.getState().leaveChannel(conv.id);
                  if (!res.ok) return toast.error(res.error);
                  toast.success(`Left #${conv.name}`);
                  navigate('/chat/c/ch-general');
                }}
              >
                <LogOut /> Leave channel
              </button>
            )}
          </div>
        )}

        {tab === 'members' && (
          <div className="stack" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 8 }}>
              <NeoSearch value={q} onChange={setQ} placeholder="Find members…" size="sm" label="Find members" />
              {v && canInvite(conv, v.viewer) && (
                <PeoplePicker
                  value={[]}
                  multiple
                  label="Add people"
                  onChange={(ids) => {
                    if (!ids.length) return;
                    const res = useChat.getState().addMembers(conv.id, ids);
                    if (!res.ok) return toast.error(res.error);
                    toast.success('People added');
                    if (res.convId !== conv.id) navigate(`/chat/c/${res.convId}`);
                  }}
                  trigger={(p) => (
                    <button {...p} type="button" className="neo-btn neo-btn--soft neo-btn--sm" data-qa="add-members">
                      <UserPlus /> Add
                    </button>
                  )}
                />
              )}
            </div>
            <div className="neo-list">
              {members.map((u) => (
                <div key={u.id} className="neo-li pc-member">
                  <Avatar user={{ ...u, presence: names.presence(u.id) }} size={32} presence />
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="truncate" style={{ display: 'block', fontWeight: 600 }}>
                      {u.name} {u.id === v?.user.id && <span className="neo-faint">(you)</span>}
                    </span>
                    <span className="neo-faint text-xs truncate" style={{ display: 'block' }}>
                      {u.title}
                    </span>
                  </span>
                  {conv.adminIds.includes(u.id) && <Chip tone="app" size="sm">Admin</Chip>}
                  {v && canRemoveMember(conv, v.viewer, u.id).ok && (
                    <button
                      type="button"
                      className="neo-iconbtn neo-iconbtn--sm"
                      onClick={() => toast.result(useChat.getState().removeMember(conv.id, u.id), `${u.name.split(' ')[0]} removed`)}
                      aria-label={`Remove ${u.name}`}
                      data-tip="Remove from channel"
                    >
                      <UserMinus />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'pinned' &&
          (pinned.length ? (
            <div className="stack" style={{ gap: 8 }}>
              {pinned.map((m) => (
                <Link key={m.id} to={`/chat/c/${conv.id}?msg=${m.id}`} className="pc-pin">
                  <div className="row" style={{ gap: 8 }}>
                    <AuthorAvatar id={m.authorId} size={22} names={names} />
                    <strong className="text-sm">{names.name(m.authorId)}</strong>
                    <span className="neo-faint text-xs">{relativeTime(m.at)}</span>
                    <Pin className="pc-hud-icon" style={{ marginLeft: 'auto' }} />
                  </div>
                  <Md text={m.text || m.card?.title || m.poll?.question || m.decision?.title || 'Attachment'} className="pc-pin__text" />
                </Link>
              ))}
            </div>
          ) : (
            <NeoEmpty icon={<Pin />} title="Nothing pinned yet" compact>
              Pin important messages from the message menu so everyone can find them.
            </NeoEmpty>
          ))}

        {tab === 'files' &&
          (filesAndLinks.files.length || filesAndLinks.links.length ? (
            <div className="stack" style={{ gap: 14 }}>
              {filesAndLinks.files.length > 0 && (
                <div>
                  <div className="neo-hud" style={{ marginBottom: 6 }}>
                    Files
                  </div>
                  {filesAndLinks.files.map((f) => {
                    const I = fileIcon(f.kind);
                    const inner = (
                      <>
                        <span className="pc-filecard__icon" style={{ ['--ft' as string]: FILE_TONE[f.kind] ?? '#94a3b8' }}>
                          <I />
                        </span>
                        <span className="grow" style={{ minWidth: 0 }}>
                          <span className="truncate" style={{ display: 'block', fontWeight: 600 }}>
                            {f.name}
                          </span>
                          <span className="neo-faint text-xs">
                            {names.first(f.by)} · {relativeTime(f.at)}
                          </span>
                        </span>
                      </>
                    );
                    return f.to ? (
                      <Link key={f.key} to={f.to} className="neo-li">
                        {inner}
                      </Link>
                    ) : (
                      <div key={f.key} className="neo-li">
                        {inner}
                      </div>
                    );
                  })}
                </div>
              )}
              {filesAndLinks.links.length > 0 && (
                <div>
                  <div className="neo-hud" style={{ marginBottom: 6 }}>
                    Links
                  </div>
                  {filesAndLinks.links.slice(0, 30).map((l) =>
                    l.href.startsWith('/') ? (
                      <Link key={l.key} to={l.href} className="neo-li">
                        <Link2 className="pc-hud-icon" />
                        <span className="grow truncate">{l.label}</span>
                        <span className="neo-faint text-xs">{relativeTime(l.at)}</span>
                      </Link>
                    ) : (
                      <a key={l.key} href={l.href} target="_blank" rel="noreferrer noopener" className="neo-li">
                        <ExternalLink className="pc-hud-icon" />
                        <span className="grow truncate">{l.label}</span>
                        <span className="neo-faint text-xs">{relativeTime(l.at)}</span>
                      </a>
                    ),
                  )}
                </div>
              )}
            </div>
          ) : (
            <NeoEmpty icon={<FileText />} title="No files or links yet" compact>
              Files, Drive documents and links shared here will collect in this tab.
            </NeoEmpty>
          ))}
      </div>
      <div className="pc-insp__meta neo-faint">
        <Users className="pc-hud-icon" /> {conv.memberIds.filter((m) => !m.startsWith('bot-')).length} members · <Hash className="pc-hud-icon" /> {(idx.byConv.get(conv.id) ?? []).length} messages
      </div>
    </div>
  );
}
