/**
 * Full file view: large preview (edit for docs/code/text → new version), side panel with
 * Details · Comments · Activity · Versions ("Time Machine": timeline + scrubber, preview any
 * version, compare, restore). Also the friendly Request access screen.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileLock2,
  GitCompare,
  History,
  Info,
  KeyRound,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Save,
  Send,
  Share2,
  ShieldAlert,
  Star,
  Trash2,
  ArchiveRestore,
  X,
} from 'lucide-react';
import { Avatar } from '@/components/ui/primitives';
import { Chip, NeoEmpty, NeoHead, NeoMenu, NeoStage, NeoTabs, Orb } from '@/components/neo';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cx } from '@/lib/cx';
import { formatDateTime, relativeTime } from '@/lib/format';
import { toast } from '@/store/toast';
import { useHub } from '@/store/hub';
import type { Content, Item, Level, Thread } from '@/drive/types';
import { itemRoute, useDrive } from '@/drive/store';
import { EDITABLE_KINDS, LABEL_NAME, LABEL_RANK, LEVEL_LABEL, formatBytes } from '@/drive/meta';
import { ancestors, checkGrant, driveLabel, trashedRoot } from '@/drive/access';
import { contentOf, diffLines, diffStats } from '@/drive/content';
import { overlayOpen, useDriveUI } from './ctx';
import { KindIcon, LabelChip } from './bits';
import { DiffView, InlineText, Preview, Watermark } from './Previews';
import { ActivityPanel, DetailsPanel } from './Inspector';
import { useItemActions } from './menu';

type Tab = 'details' | 'comments' | 'activity' | 'versions';

/* ================================================================== */
/* Request access                                                      */
/* ================================================================== */

export function RequestScreen({ item }: { item: Item }) {
  const ui = useDriveUI();
  const navigate = useNavigate();
  const { ctx, me } = ui.engine;
  const requests = useDrive((s) => s.requests);
  const mine = requests.filter((r) => r.itemId === item.id && r.requesterId === me.id).sort((a, b) => b.at - a.at);
  const pending = mine.find((r) => r.status === 'pending');
  const lastDenied = !pending ? mine.find((r) => r.status === 'denied') : undefined;
  const [level, setLevel] = useState<Level>(item.kind === 'folder' ? 'viewer' : 'commenter');
  const [reason, setReason] = useState('');
  const owner = ctx.user.get(item.ownerId);
  const drive = ctx.drive.get(item.driveId);
  const secret = LABEL_RANK[item.label] >= 2;
  const dlp = checkGrant(ctx, item, { type: 'user', id: me.id }, ctx.policy.rules[item.label].maxShareDays ? Date.now() + 86_400_000 : null);
  const submit = () => {
    const r = useDrive.getState().requestAccess(item.id, level, reason);
    if (r.ok) {
      toast.success('Request sent', `${owner?.name.split(' ')[0] ?? 'The owner'} will get a notification.`);
      setReason('');
    } else toast.error('Couldn’t send request', r.error);
  };
  return (
    <NeoStage label="Request access">
      <NeoHead icon={<KeyRound />} eyebrow="Helix Drive" title="You need access" sub="Ask the owner — they’ll get a notification right away." onToggleSide={ui.toggleSide} actions={<button type="button" className="neo-btn neo-btn--ghost" onClick={() => navigate(-1)}><ArrowLeft /> <span className="neo-btn__label">Back</span></button>} />
      <div className="neo-body neo-pad">
        <div className="dv-request neo-rise">
          <div className="dv-request__holo" aria-hidden="true">
            <FileLock2 />
            <i />
            <i />
          </div>
          <div className="neo-hud neo-hud--tint">{secret ? `${LABEL_NAME[item.label]} ${item.kind === 'folder' ? 'folder' : 'file'}` : item.kind === 'folder' ? 'Folder' : 'File'}</div>
          <h2 className="neo-title neo-title--lg dv-request__name">{secret ? `A ${LABEL_NAME[item.label].toLowerCase()} ${item.kind === 'folder' ? 'folder' : 'file'}` : item.name}</h2>
          <div className="row" style={{ gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {owner && <Avatar user={owner} size={22} />}
            <span className="neo-muted text-sm">
              Owned by <strong>{owner?.name ?? 'someone'}</strong>
              {drive ? ` · ${driveLabel(ctx, drive, me.id)}` : ''}
            </span>
            <LabelChip label={item.label} />
          </div>
          {pending ? (
            <div className="dv-request__status">
              <Orb tone="app" pulse />
              <div className="grow">
                <div className="text-sm">
                  <strong>Request sent {relativeTime(pending.at)}</strong> · {LEVEL_LABEL[pending.level]} access
                </div>
                <div className="neo-faint text-sm">“{pending.reason}”</div>
              </div>
              <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => toast.result(useDrive.getState().cancelRequest(pending.id))}>
                Cancel request
              </button>
            </div>
          ) : !dlp.ok ? (
            <div className="dv-banner dv-banner--danger">
              <ShieldAlert />
              <span>
                <strong>{dlp.reason}</strong> {dlp.fix}
              </span>
            </div>
          ) : (
            <form
              className="dv-request__form"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              {lastDenied && (
                <div className="dv-banner dv-banner--warn">
                  <X />
                  <span>
                    Your last request was declined{lastDenied.note ? `: “${lastDenied.note}”` : '.'} You can ask again with more context.
                  </span>
                </div>
              )}
              <div className="neo-field">
                <span className="neo-label">Access you need</span>
                <NeoTabs
                  label="Requested level"
                  value={level}
                  onChange={setLevel}
                  items={[
                    { value: 'viewer', label: 'View' },
                    { value: 'commenter', label: 'Comment' },
                    { value: 'editor', label: 'Edit' },
                  ]}
                />
              </div>
              <label className="neo-field">
                <span className="neo-label">Why do you need it?</span>
                <textarea className="neo-textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. I’m adding the engineering notes for the token migration." data-qa="request-reason" />
              </label>
              <button type="submit" className="neo-btn neo-btn--plasma neo-btn--block" disabled={reason.trim().length < 5} data-qa="request-submit">
                <Send /> Request access
              </button>
            </form>
          )}
        </div>
      </div>
    </NeoStage>
  );
}

/* ================================================================== */
/* Comments                                                            */
/* ================================================================== */

function MentionBox({ value, onChange, onSubmit, placeholder, small, autoFocus }: { value: string; onChange: (v: string) => void; onSubmit: () => void; placeholder: string; small?: boolean; autoFocus?: boolean }) {
  const users = useHub((s) => s.users);
  const ref = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const m = /@([\p{L}]*)$/u.exec(value.slice(0, caret));
  const q = m ? m[1].toLowerCase() : null;
  const options = q !== null ? users.filter((u) => u.active && u.name.toLowerCase().split(' ').some((p) => p.startsWith(q))).slice(0, 5) : [];
  const [hi, setHi] = useState(0);
  const insert = (name: string) => {
    if (!m) return;
    const start = caret - m[0].length;
    const next = `${value.slice(0, start)}@${name} ${value.slice(caret)}`;
    onChange(next);
    requestAnimationFrame(() => {
      const pos = start + name.length + 2;
      ref.current?.setSelectionRange(pos, pos);
      ref.current?.focus();
      setCaret(pos);
    });
  };
  return (
    <div className="dv-mention-box">
      <textarea
        ref={ref}
        className={cx('neo-textarea', small && 'dv-textarea-sm')}
        rows={small ? 1 : 2}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
          setHi(0);
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
        onKeyDown={(e) => {
          if (options.length) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHi((h) => (h + 1) % options.length);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHi((h) => (h - 1 + options.length) % options.length);
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              insert(options[hi].name);
              return;
            }
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || small)) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      {options.length > 0 && (
        <div className="dv-mention-pop neo-portal" role="listbox" aria-label="Mention someone">
          {options.map((u, i) => (
            <button key={u.id} type="button" role="option" aria-selected={i === hi} className={cx('neo-menu__item', i === hi && 'is-focus')} onMouseDown={(e) => (e.preventDefault(), insert(u.name))}>
              <Avatar user={u} size={22} />
              <span className="grow truncate">{u.name}</span>
              <span className="neo-faint text-xs truncate">{u.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ThreadCard({ item, t, canComment, highlight }: { item: Item; t: Thread; canComment: boolean; highlight: boolean }) {
  const ui = useDriveUI();
  const { ctx, me } = ui.engine;
  const [reply, setReply] = useState('');
  const [open, setOpen] = useState(false);
  const names = useMemo(() => ctx.users.map((u) => u.name), [ctx.users]);
  const author = ctx.user.get(t.by);
  const send = () => {
    const r = useDrive.getState().reply(item.id, t.id, reply);
    if (!r.ok) return toast.error(r.error);
    setReply('');
    if (r.noAccess.length) toast.warning(`${r.noAccess.map((id) => ctx.user.get(id)?.name.split(' ')[0]).join(', ')} can’t open this file yet`, 'Share it with them so they can see your reply.');
  };
  return (
    <article id={`thread-${t.id}`} className={cx('dv-thread', t.resolved && 'is-resolved', highlight && 'is-highlight')}>
      {t.quote && <blockquote className="dv-thread__quote">{t.quote}</blockquote>}
      <div className="dv-thread__msg">
        {author && <Avatar user={author} size={26} />}
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="dv-thread__who">
            <strong>{author?.id === me.id ? 'You' : author?.name}</strong>
            <span className="neo-faint text-xs" title={formatDateTime(t.at)}>
              {relativeTime(t.at)}
            </span>
          </div>
          <p className="dv-thread__text">
            <InlineText text={t.text} names={names} />
          </p>
        </div>
      </div>
      {t.replies.map((r) => {
        const u = ctx.user.get(r.by);
        return (
          <div key={r.id} className="dv-thread__msg is-reply">
            {u && <Avatar user={u} size={22} />}
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="dv-thread__who">
                <strong>{u?.id === me.id ? 'You' : u?.name}</strong>
                <span className="neo-faint text-xs">{relativeTime(r.at)}</span>
              </div>
              <p className="dv-thread__text">
                <InlineText text={r.text} names={names} />
              </p>
            </div>
          </div>
        );
      })}
      <div className="dv-thread__foot">
        {t.resolved ? (
          <span className="neo-faint text-xs row" style={{ gap: 5 }}>
            <CheckCircle2 /> Resolved by {ctx.user.get(t.resolved.by)?.name.split(' ')[0]} {relativeTime(t.resolved.at)}
          </span>
        ) : canComment ? (
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => setOpen((o) => !o)}>
            <MessageSquare /> Reply
          </button>
        ) : null}
        <span className="grow" />
        {canComment && (
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => toast.result(useDrive.getState().resolveThread(item.id, t.id, !t.resolved))}>
            {t.resolved ? <RotateCcw /> : <Check />} {t.resolved ? 'Reopen' : 'Resolve'}
          </button>
        )}
      </div>
      {open && canComment && !t.resolved && (
        <div className="dv-thread__reply">
          <MentionBox value={reply} onChange={setReply} onSubmit={send} placeholder="Reply… (@ to mention, Enter to send)" small autoFocus />
          <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={send} disabled={!reply.trim()} aria-label="Send reply">
            <Send />
          </button>
        </div>
      )}
    </article>
  );
}

function CommentsPanel({ item, focusId }: { item: Item; focusId: string | null }) {
  const ui = useDriveUI();
  const caps = ui.engine.caps(item);
  const [text, setText] = useState('');
  const [noAccess, setNoAccess] = useState<string[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const open = item.threads.filter((t) => !t.resolved).sort((a, b) => b.at - a.at);
  const resolved = item.threads.filter((t) => t.resolved);
  useEffect(() => {
    if (!focusId) return;
    if (resolved.some((t) => t.id === focusId)) setShowResolved(true);
    requestAnimationFrame(() => document.getElementById(`thread-${focusId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }, [focusId]); // eslint-disable-line react-hooks/exhaustive-deps
  const post = () => {
    const r = useDrive.getState().addThread(item.id, text);
    if (!r.ok) return toast.error(r.error);
    setText('');
    setNoAccess(r.noAccess);
    toast.success(r.mentioned.length ? `Comment posted · ${r.mentioned.length} mentioned` : 'Comment posted');
  };
  const shareWith = (ids: string[]) => {
    const r = useDrive.getState().share(item.id, ids.map((id) => ({ principal: { type: 'user', id }, level: 'commenter', expiresAt: null })));
    toast.result(r);
    if (r.ok) setNoAccess([]);
  };
  return (
    <div className="dv-panel">
      {caps.comment ? (
        <div className="dv-composer">
          <MentionBox value={text} onChange={setText} onSubmit={post} placeholder="Add a comment… (@ to mention, ⌘↵ to post)" />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" disabled={text.trim().length < 2} onClick={post} data-qa="post-comment">
              <Send /> Comment
            </button>
          </div>
        </div>
      ) : (
        <div className="dv-banner">
          <Eye />
          <span>You can read comments. Ask the owner for commenter access to join in.</span>
        </div>
      )}
      {noAccess.length > 0 && (
        <div className="dv-banner dv-banner--warn">
          <Lock />
          <span className="grow">
            {noAccess.map((id) => ui.engine.ctx.user.get(id)?.name).join(', ')} can’t open this file.
          </span>
          {caps.share && (
            <button type="button" className="neo-btn neo-btn--xs" onClick={() => shareWith(noAccess)}>
              Share as commenter
            </button>
          )}
        </div>
      )}
      {open.length === 0 && resolved.length === 0 && <NeoEmpty compact icon={<MessageSquare />} title="No comments yet">Start the conversation — mention people with @.</NeoEmpty>}
      {open.map((t) => (
        <ThreadCard key={t.id} item={item} t={t} canComment={caps.comment} highlight={t.id === focusId} />
      ))}
      {resolved.length > 0 && (
        <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => setShowResolved((s) => !s)}>
          <CheckCircle2 /> {showResolved ? 'Hide' : 'Show'} {resolved.length} resolved
        </button>
      )}
      {showResolved && resolved.map((t) => <ThreadCard key={t.id} item={item} t={t} canComment={caps.comment} highlight={t.id === focusId} />)}
    </div>
  );
}

/* ================================================================== */
/* Time Machine                                                        */
/* ================================================================== */

function textOf(c: Content | undefined | null): string | null {
  if (!c) return null;
  if (c.type === 'doc' || c.type === 'code') return c.text;
  if (c.type === 'sheet') return c.rows.map((r) => r.join(' | ')).join('\n');
  return null;
}

function TimeMachine({ item, selected, onSelect, canRestore }: { item: Item; selected: string | null; onSelect: (id: string | null) => void; canRestore: boolean }) {
  const ui = useDriveUI();
  const { ctx, me } = ui.engine;
  const versions = [...item.versions].reverse();
  const currentId = item.versions[item.versions.length - 1]?.id;
  const listRef = useRef<HTMLOListElement>(null);
  const stats = useMemo(() => {
    const out = new Map<string, { added: number; removed: number }>();
    item.versions.forEach((v, i) => {
      const prev = item.versions[i - 1];
      const a = textOf(prev?.content);
      const b = textOf(v.content);
      if (a !== null && b !== null) out.set(v.id, diffStats(a, b));
    });
    return out;
  }, [item.versions]);
  return (
    <div className="dv-panel dv-tm">
      <div className="dv-tm__head">
        <History />
        <div className="grow">
          <div className="neo-title">Time Machine</div>
          <div className="neo-faint text-xs">{item.versions.length} versions · pick one to preview, compare or restore</div>
        </div>
      </div>
      <ol
        ref={listRef}
        className="dv-tm__list"
        role="listbox"
        aria-label="Versions"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
          e.preventDefault();
          const idx = versions.findIndex((v) => v.id === (selected ?? currentId));
          const next = versions[Math.max(0, Math.min(versions.length - 1, idx + (e.key === 'ArrowDown' ? 1 : -1)))];
          if (next) onSelect(next.id === currentId ? null : next.id);
        }}
      >
        {versions.map((v, i) => {
          const u = ctx.user.get(v.by);
          const isCur = v.id === currentId;
          const on = (selected ?? currentId) === v.id;
          const st = stats.get(v.id);
          return (
            <li key={v.id} role="option" aria-selected={on} className={cx('dv-tm__item', on && 'is-on', isCur && 'is-current')} style={{ '--i': i } as CSSProperties} onClick={() => onSelect(isCur ? null : v.id)}>
              <span className="dv-tm__dot" aria-hidden="true" />
              <div className="dv-tm__card">
                <div className="row" style={{ gap: 8 }}>
                  <span className="dv-tm__v neo-mono">v{v.n}</span>
                  {isCur && <Chip size="sm" tone="app">Current</Chip>}
                  <span className="grow" />
                  <span className="neo-faint text-xs" title={formatDateTime(v.at)}>
                    {relativeTime(v.at)}
                  </span>
                </div>
                <div className="dv-tm__summary">{v.summary}</div>
                <div className="row dv-tm__meta" style={{ gap: 6 }}>
                  {u && <Avatar user={u} size={18} />}
                  <span className="truncate">{u?.id === me.id ? 'You' : u?.name}</span>
                  <span className="neo-faint">· {formatBytes(v.size)}</span>
                  {st && (st.added || st.removed) ? (
                    <span className="dv-tm__diff neo-mono">
                      <b>+{st.added}</b> <i>−{st.removed}</i>
                    </span>
                  ) : null}
                  {!v.content && !isCur && <span className="neo-faint text-xs">· metadata only</span>}
                </div>
                {on && !isCur && canRestore && v.content && (
                  <button type="button" className="neo-btn neo-btn--soft neo-btn--xs dv-tm__restore" onClick={(e) => {
                    e.stopPropagation();
                    const r = useDrive.getState().restoreVersion(item.id, v.id);
                    toast.result(r);
                    if (r.ok) onSelect(null);
                  }}>
                    <RotateCcw /> Restore this version
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ================================================================== */
/* File workspace                                                      */
/* ================================================================== */

export function FileView() {
  const { fileId = '' } = useParams();
  const ui = useDriveUI();
  const item = ui.engine.ctx.item.get(fileId);
  if (!item)
    return (
      <NeoStage>
        <NeoHead icon={<FileLock2 />} eyebrow="Helix Drive" title="File not found" onToggleSide={ui.toggleSide} />
        <div className="neo-body">
          <NeoEmpty icon={<FileLock2 />} title="This file doesn’t exist" action={<Link className="neo-btn neo-btn--sm" to="/drive">Back to Drive</Link>}>
            It may have been deleted forever, or the link is wrong.
          </NeoEmpty>
        </div>
      </NeoStage>
    );
  if (item.kind === 'folder') return <Navigate to={itemRoute(item)} replace />;
  if (ui.engine.access(item).level === 'none') return <RequestScreen item={item} />;
  return <FileWorkspace key={item.id} item={item} />;
}

function FileWorkspace({ item }: { item: Item }) {
  const ui = useDriveUI();
  const navigate = useNavigate();
  const actions = useItemActions();
  const [sp, setSp] = useSearchParams();
  const narrow = useMediaQuery('(max-width: 1100px)');
  const { ctx, me } = ui.engine;
  const access = ui.engine.access(item);
  const caps = ui.engine.caps(item);
  const tab = (['details', 'comments', 'activity', 'versions'].includes(sp.get('tab') ?? '') ? sp.get('tab') : sp.get('comment') ? 'comments' : 'details') as Tab;
  const setTab = (t: Tab) => {
    const next = new URLSearchParams(sp);
    next.set('tab', t);
    next.delete('comment');
    setSp(next, { replace: true });
  };
  const [panel, setPanel] = useState(!narrow || !!sp.get('tab') || !!sp.get('comment'));
  useEffect(() => setPanel(!narrow || !!sp.get('tab') || !!sp.get('comment')), [narrow]); // eslint-disable-line react-hooks/exhaustive-deps
  const [versionId, setVersionId] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [summary, setSummary] = useState('');
  const requests = useDrive((s) => s.requests);
  const recordOpen = useDrive((s) => s.recordOpen);
  const pending = caps.share ? requests.filter((r) => r.itemId === item.id && r.status === 'pending') : [];
  const editor = ctx.user.get(item.updatedBy);
  const drive = ctx.drive.get(item.driveId);
  const chain = [...ancestors(ctx, item)].reverse();
  const starred = item.starredBy.includes(me.id);
  const trashed = trashedRoot(ctx, item);
  const breakGlass = access.primary?.source === 'admin' && LABEL_RANK[item.label] >= 2;
  const names = useMemo(() => ctx.users.map((u) => u.name), [ctx.users]);

  useEffect(() => {
    recordOpen(item.id);
    if (breakGlass) useHub.getState().logAudit({ action: 'drive.admin.view', target: item.name, detail: `Break-glass view of ${LABEL_NAME[item.label]} file via Drive governance`, outcome: 'success', severity: 'warning' });
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = contentOf(item);
  const version = versionId ? item.versions.find((v) => v.id === versionId) : null;
  const shown: Content | null = version ? (version.content ?? null) : current;
  const editable = EDITABLE_KINDS.includes(item.kind) && caps.edit && (current?.type === 'doc' || current?.type === 'code');
  const startEdit = () => {
    if (!editable || !current || (current.type !== 'doc' && current.type !== 'code')) return;
    setDraft(current.text);
    setSummary('');
    setVersionId(null);
    setEditing(true);
  };
  const save = () => {
    if (!current || (current.type !== 'doc' && current.type !== 'code')) return;
    if (draft === current.text) {
      setEditing(false);
      return;
    }
    const next: Content = current.type === 'doc' ? { type: 'doc', text: draft } : { type: 'code', lang: current.lang, text: draft };
    const r = useDrive.getState().saveContent(item.id, next, summary);
    toast.result(r);
    if (r.ok) setEditing(false);
  };

  useHotkeys({
    e: (e) => {
      if (overlayOpen() || editing) return;
      if (editable) {
        e.preventDefault();
        startEdit();
      }
    },
    'mod+s': (e) => {
      if (!editing) return;
      e.preventDefault();
      save();
    },
    escape: () => {
      if (overlayOpen()) return;
      if (editing) setEditing(false);
      else if (versionId) setVersionId(null);
    },
    ']': () => !overlayOpen() && setPanel((p) => !p),
    i: () => !overlayOpen() && !editing && setPanel((p) => !p),
  });

  const approve = (id: string, level: Level) => {
    const max = ctx.policy.rules[item.label].maxShareDays;
    toast.result(useDrive.getState().decideRequest(id, 'approve', { level, expiresAt: max ? Date.now() + max * 86_400_000 : null }));
  };

  const versionIdx = version ? item.versions.findIndex((v) => v.id === version.id) : item.versions.length - 1;
  const versionText = textOf(version?.content);
  const currentText = textOf(current);

  return (
    <NeoStage label={item.name}>
      <NeoHead
        className="dv-head dv-filehead"
        icon={<KindIcon kind={item.kind} />}
        eyebrow={
          <span className="dv-path">
            <Link to={`/drive/d/${item.driveId}`}>{driveLabel(ctx, drive, me.id)}</Link>
            {chain.map((a) => (
              <span key={a.id}>
                {' / '}
                {ui.engine.access(a).level !== 'none' ? <Link to={`/drive/d/${item.driveId}/${a.id}`}>{a.name}</Link> : <span>{a.name}</span>}
              </span>
            ))}
          </span>
        }
        title={
          caps.edit ? (
            <button type="button" className="dv-titlebtn" onClick={() => ui.open({ type: 'rename', id: item.id })} data-tip="Rename · F2" data-tip-pos="bottom">
              {item.name}
            </button>
          ) : (
            item.name
          )
        }
        sub={
          <span className="row" style={{ gap: 8 }}>
            <LabelChip label={item.label} />
            <span className="truncate">
              Edited {relativeTime(item.updatedAt)} by {editor?.id === me.id ? 'you' : editor?.name.split(' ')[0]} · v{item.versions[item.versions.length - 1]?.n ?? 1}
            </span>
          </span>
        }
        onToggleSide={ui.toggleSide}
        actions={
          <>
            {caps.share ? (
              <button type="button" className="neo-btn neo-btn--plasma" onClick={() => ui.open({ type: 'share', itemId: item.id })} data-qa="share">
                <Share2 /> <span className="neo-btn__label">Share</span>
              </button>
            ) : (
              <button type="button" className="neo-btn neo-btn--soft" onClick={() => ui.open({ type: 'share', itemId: item.id, tab: 'xray' })} data-qa="xray">
                <Eye /> <span className="neo-btn__label">Access</span>
              </button>
            )}
            <button type="button" className={cx('neo-iconbtn dv-star', starred && 'is-on')} aria-pressed={starred} aria-label={starred ? 'Remove star' : 'Star'} data-tip={starred ? 'Starred' : 'Star'} data-tip-pos="bottom" onClick={() => actions.star([item.id], !starred)}>
              <Star />
            </button>
            <NeoMenu
              label="File actions"
              items={actions.menuFor([item], { hideOpen: true, onDetails: () => (setPanel(true), setTab('details')) })}
              trigger={(p) => (
                <button {...p} type="button" className="neo-iconbtn" aria-label="More file actions">
                  <MoreHorizontal />
                </button>
              )}
            />
          </>
        }
      />
      <div className={cx('neo-split dv-split dv-filesplit', !panel && 'is-solo')}>
        <div className="dv-filemain">
          <div className="dv-filebar">
            {item.versions.length > 1 && !editing ? (
              <label className="dv-scrub" data-tip="Time Machine — drag to travel through versions">
                <History />
                <input
                  type="range"
                  min={0}
                  max={item.versions.length - 1}
                  value={versionIdx}
                  aria-label="Version scrubber"
                  style={{ '--p': `${(versionIdx / Math.max(1, item.versions.length - 1)) * 100}%` } as CSSProperties}
                  onChange={(e) => {
                    const v = item.versions[Number(e.target.value)];
                    setVersionId(v && Number(e.target.value) !== item.versions.length - 1 ? v.id : null);
                    if (!panel || tab !== 'versions') {
                      setPanel(true);
                      setTab('versions');
                    }
                  }}
                />
                <span className="neo-mono text-xs">
                  v{item.versions[versionIdx]?.n}/{item.versions.length}
                </span>
              </label>
            ) : (
              <span className="neo-hud">{editing ? 'Editing' : 'Preview'}</span>
            )}
            <span className="grow" />
            {editing ? (
              <>
                <input className="neo-input neo-input--sm dv-summary" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What changed? (optional)" aria-label="Change summary" />
                <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={save} data-qa="save-version">
                  <Save /> Save version <kbd className="kbd dv-hide-sm">⌘S</kbd>
                </button>
              </>
            ) : (
              <>
                {editable && !version && (
                  <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={startEdit} data-qa="edit">
                    <Pencil /> Edit <kbd className="kbd dv-hide-sm">E</kbd>
                  </button>
                )}
                {caps.download ? (
                  <button type="button" className="neo-iconbtn" aria-label="Download" data-tip="Download" onClick={() => actions.download([item.id])}>
                    <Download />
                  </button>
                ) : (
                  <span className="dv-mini-tag" data-tip={`${LABEL_NAME[item.label]}: downloads and copies are disabled`}>
                    <Lock /> No download
                  </span>
                )}
                <button type="button" className={cx('neo-iconbtn', panel && 'is-on')} aria-label="Toggle side panel" aria-pressed={panel} data-tip="Side panel · ]" data-tip-pos="left" onClick={() => setPanel((p) => !p)}>
                  <Info />
                </button>
              </>
            )}
          </div>
          <div className="dv-filescroll">
            {trashed && (
              <div className="dv-banner dv-banner--warn">
                <Trash2 />
                <span className="grow">This file is in the trash{trashed.id !== item.id ? ` (with folder ${trashed.name})` : ''}.</span>
                <button type="button" className="neo-btn neo-btn--xs" onClick={() => toast.result(useDrive.getState().restore([trashed.id]))}>
                  <ArchiveRestore /> Restore
                </button>
              </div>
            )}
            {breakGlass && (
              <div className="dv-banner dv-banner--hold">
                <ShieldAlert />
                <span>You’re viewing this {LABEL_NAME[item.label]} file through Drive governance. This access is logged.</span>
              </div>
            )}
            {pending.map((r) => {
              const u = ctx.user.get(r.requesterId);
              return (
                <div key={r.id} className="dv-reqbanner neo-rise" data-qa="request-banner">
                  {u && <Avatar user={u} size={30} presence />}
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="text-sm">
                      <strong>{u?.name}</strong> requests <strong>{LEVEL_LABEL[r.level].toLowerCase()}</strong> access · {relativeTime(r.at)}
                    </div>
                    <div className="neo-faint text-sm truncate">“{r.reason}”</div>
                  </div>
                  <button type="button" className="neo-btn neo-btn--success neo-btn--sm" onClick={() => approve(r.id, r.level)} data-qa="approve">
                    <Check /> Approve
                  </button>
                  <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => navigate('/drive/requests')}>
                    Review
                  </button>
                </div>
              );
            })}
            {version && (
              <div className="dv-versionbar neo-rise">
                <Clock3 />
                <span className="grow">
                  Previewing <strong>v{version.n}</strong> · {formatDateTime(version.at)} by {ctx.user.get(version.by)?.name}
                  {version.summary ? ` — ${version.summary}` : ''}
                </span>
                {versionText !== null && currentText !== null && (
                  <button type="button" className={cx('neo-btn neo-btn--xs', compare ? 'neo-btn--soft' : 'neo-btn--ghost')} onClick={() => setCompare((c) => !c)} aria-pressed={compare}>
                    <GitCompare /> Compare with current
                  </button>
                )}
                {caps.edit && version.content && (
                  <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={() => {
                    const r = useDrive.getState().restoreVersion(item.id, version.id);
                    toast.result(r);
                    if (r.ok) setVersionId(null);
                  }}>
                    <RotateCcw /> Restore
                  </button>
                )}
                <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => setVersionId(null)}>
                  Back to current
                </button>
              </div>
            )}
            <div className={cx('dv-stagepreview', `is-${item.kind}`)}>
              {editing ? (
                <textarea className={cx('dv-editor', current?.type === 'code' && 'is-code')} value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={current?.type === 'doc'} autoFocus aria-label={`Edit ${item.name}`} data-qa="editor" />
              ) : version && !version.content ? (
                <NeoEmpty icon={<History />} title={`No snapshot stored for v${version.n}`}>
                  Only metadata was kept for this version: {ctx.user.get(version.by)?.name}, {formatDateTime(version.at)}, {formatBytes(version.size)}.
                </NeoEmpty>
              ) : compare && versionText !== null && currentText !== null ? (
                <DiffView lines={diffLines(versionText, currentText)} />
              ) : (
                <Preview item={item} content={shown} names={names} />
              )}
              {caps.watermark && !editing && <Watermark text={`${me.name} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · ${LABEL_NAME[item.label]}`} />}
            </div>
          </div>
        </div>
        {panel && (
          <aside className="neo-inspector dv-inspector dv-fileinspector" aria-label="File panel">
            <div className="dv-inspector__head">
              <div className="grow">
                <NeoTabs
                  variant="underline"
                  label="File panel"
                  value={tab}
                  onChange={setTab}
                  items={[
                    { value: 'details', label: 'Details' },
                    { value: 'comments', label: 'Comments', count: item.threads.filter((t) => !t.resolved).length || null },
                    { value: 'activity', label: 'Activity' },
                    { value: 'versions', label: 'Versions', count: item.versions.length },
                  ]}
                />
              </div>
              {narrow && (
                <button type="button" className="neo-iconbtn" onClick={() => setPanel(false)} aria-label="Close panel">
                  <X />
                </button>
              )}
            </div>
            <div className="dv-inspector__body">
              {tab === 'details' && <DetailsPanel item={item} />}
              {tab === 'comments' && <CommentsPanel item={item} focusId={sp.get('comment')} />}
              {tab === 'activity' && <ActivityPanel activity={item.activity} />}
              {tab === 'versions' && <TimeMachine item={item} selected={versionId} onSelect={(id) => (setVersionId(id), setCompare(false))} canRestore={caps.edit} />}
            </div>
          </aside>
        )}
      </div>
    </NeoStage>
  );
}
