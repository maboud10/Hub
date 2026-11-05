/**
 * File view: header with inline rename & labels, permission-aware action bar
 * (DLP-gated download), content preview with inline editing → new version,
 * and a right rail (Details · Access · Versions · Comments · Activity).
 * Invisible items render a Request-access screen instead.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FolderInput,
  FolderOpen,
  Gavel,
  History,
  Hourglass,
  Info,
  KeyRound,
  Link2,
  Lock,
  LockKeyhole,
  MessageSquare,
  Pencil,
  RotateCcw,
  Save,
  Send,
  Shield,
  SquareKanban,
  Star,
  Tag,
  Trash2,
  Unlock,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, Switch } from '@/components/ui/primitives';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { formatDate, formatDateTime, relativeTime } from '@/lib/format';
import { KIND_META, LINK_ACCESS_META, RETENTION_META, ROLE_META, ROLE_RANK, SENSITIVITY_META, formatBytes } from '@/drive/constants';
import { folderLink, useDrive } from '@/drive/store';
import { useAccessRequests, useDriveContext, useItem } from '@/drive/selectors';
import type { DriveItem, DriveRole, FilePreview } from '@/drive/types';
import { PreviewEditor, PreviewRenderer, isEditablePreview } from './Preview';
import { ShareDialog } from './ShareDialog';
import { ExpiryBadge, KindIcon, KindTile, MovePickerModal, PRINCIPAL_TYPE_LABEL, PrincipalAvatar, RenameInline, RolePill, SensitivityPill, UserChip, collectEffectiveShares, copyItemLink, describeRole, downloadResult, inheritanceBoundary, shortVia, usePrincipalLabel, useRoleExplanation, useUsersById } from './shared';

type ItemData = NonNullable<ReturnType<typeof useItem>>;
type RailTab = 'details' | 'access' | 'versions' | 'comments' | 'activity';
const TABS: { id: RailTab; label: string; icon: ReactNode }[] = [
  { id: 'details', label: 'Details', icon: <Info /> },
  { id: 'access', label: 'Access', icon: <Users /> },
  { id: 'versions', label: 'Versions', icon: <History /> },
  { id: 'comments', label: 'Comments', icon: <MessageSquare /> },
  { id: 'activity', label: 'Activity', icon: <Activity /> },
];

export function FileView() {
  const { itemId } = useParams<{ itemId: string }>();
  const data = useItem(itemId);
  const raw = useDrive((s) => s.items.find((i) => i.id === itemId));
  if (!raw) {
    return (
      <EmptyState icon={<X />} title="File not found" action={<Link to="/drive" className="btn">Back to Drive</Link>}>
        It may have been permanently deleted, or the link is wrong.
      </EmptyState>
    );
  }
  if (!data || !data.canView) return <RequestAccessScreen item={raw} />;
  return <FileDetail key={raw.id} data={data} />;
}

// ───────────────────────── request access ─────────────────────────

function RequestAccessScreen({ item }: { item: DriveItem }) {
  const { mine } = useAccessRequests();
  const requestAccess = useDrive((s) => s.requestAccess);
  const users = useUsersById();
  const [role, setRole] = useState<'viewer' | 'commenter' | 'editor'>('viewer');
  const [message, setMessage] = useState('');
  const forThis = mine.filter((m) => m.request.itemId === item.id);
  const pending = forThis.find((m) => m.request.status === 'pending');
  const last = forThis[0];
  const owner = users.get(item.ownerId);
  const sens = SENSITIVITY_META[item.sensitivity];

  return (
    <div className="dr-locked">
      <div className="dr-locked__art" aria-hidden="true">
        <span className="dr-locked__ring" />
        <LockKeyhole />
      </div>
      <div className="eyebrow">You need access</div>
      <h1 className="dr-locked__title">
        <KindIcon kind={item.kind} size={22} /> {item.name}
      </h1>
      <div className="row row--wrap" style={{ justifyContent: 'center', gap: 8 }}>
        <SensitivityPill sensitivity={item.sensitivity} />
        <span className="text-sm muted">{KIND_META[item.kind].label}</span>
        {owner && (
          <span className="text-sm muted">
            · owned by <UserChip userId={owner.id} size={18} />
          </span>
        )}
      </div>
      <p className="dr-locked__why">
        {sens.rank >= 2 ? `${sens.label} items only open for named people${item.sensitivity === 'restricted' ? ' with clearance L3+' : ' and teams'}.` : 'Your roles, department and the item’s shares don’t give you a way in yet.'} Ask the owner — they’ll get a notification and can grant time-boxed access.
      </p>

      {pending ? (
        <div className="dr-locked__card">
          <div className="row" style={{ gap: 10 }}>
            <Hourglass className="dr-ico-amber" />
            <div className="grow">
              <b>Request pending</b>
              <div className="text-sm muted">
                You asked for <b>{ROLE_META[pending.request.role].label.toLowerCase()}</b> access {relativeTime(pending.request.createdAt)}.{pending.request.message ? ` “${pending.request.message}”` : ''}
              </div>
            </div>
          </div>
          <div className="text-xs muted">We’ll notify you as soon as {owner ? owner.name.split(' ')[0] : 'the owner'} decides. Track it under Access requests → My requests.</div>
        </div>
      ) : (
        <form
          className="dr-locked__card"
          onSubmit={(e) => {
            e.preventDefault();
            toast.result(requestAccess(item.id, role, message));
          }}
        >
          {last && last.request.status === 'denied' && (
            <div className="dr-notice dr-notice--warn">
              <AlertTriangle /> Your previous request was declined {last.request.decidedAt ? relativeTime(last.request.decidedAt) : ''}. You can ask again with more context.
            </div>
          )}
          <label className="field">
            <span className="field-label">Access level</span>
            <div className="dr-seg" role="group" aria-label="Requested role">
              {(['viewer', 'commenter', 'editor'] as const).map((r) => (
                <button key={r} type="button" aria-pressed={role === r} onClick={() => setRole(r)}>
                  {ROLE_META[r].label}
                </button>
              ))}
            </div>
            <span className="field-hint">{ROLE_META[role].description}</span>
          </label>
          <label className="field">
            <span className="field-label">Message to the owner</span>
            <textarea className="textarea" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What do you need it for, and for how long?" rows={3} />
          </label>
          <button type="submit" className="btn dr-btn-amber btn--block">
            <Send /> Request access
          </button>
        </form>
      )}
      <Link to="/drive" className="btn btn--ghost btn--sm">
        Back to Drive
      </Link>
    </div>
  );
}

// ───────────────────────── file detail ─────────────────────────

function FileDetail({ data }: { data: ItemData }) {
  const { item, drive, role, canEdit, canShare, canManage, canDownload, canTrash, crumbs, linkedTasks } = data;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab') as RailTab | null;
  const tab: RailTab = tabParam && TABS.some((t) => t.id === tabParam) ? tabParam : 'details';
  const setTab = (t: RailTab) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next, { replace: true });
  };
  const me = useHub((s) => s.sessionUserId);
  const users = useUsersById();
  const recordOpen = useDrive((s) => s.recordOpen);
  const renameItem = useDrive((s) => s.renameItem);
  const toggleStar = useDrive((s) => s.toggleStar);
  const trashItem = useDrive((s) => s.trashItem);
  const restoreItem = useDrive((s) => s.restoreItem);
  const setLocked = useDrive((s) => s.setLocked);
  const downloadItem = useDrive((s) => s.downloadItem);
  const updateContent = useDrive((s) => s.updateContent);
  const { mine } = useAccessRequests();
  const pendingMore = mine.find((m) => m.request.itemId === item.id && m.request.status === 'pending');

  const chain = useMemo(() => [item, ...[...crumbs].reverse()], [item, crumbs]);
  const explanation = useRoleExplanation(drive, chain);
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    recordOpen(item.id);
  }, [item.id, recordOpen]);

  const [renaming, setRenaming] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<FilePreview>(item.preview);
  const [saveNote, setSaveNote] = useState('');

  const starred = Boolean(me && item.starredBy.includes(me));
  const isFolder = item.kind === 'folder';
  const sens = SENSITIVITY_META[item.sensitivity];
  const canEditContent = canEdit && !isFolder && isEditablePreview(item.preview) && !item.trashed;
  const unresolved = item.comments.filter((c) => !c.resolved).length;
  const canAskForMore = role && role !== 'manager' && role !== 'editor';

  const startEdit = () => {
    setDraft(item.preview);
    setSaveNote('');
    setEditing(true);
  };
  const saveVersion = () => {
    if (toast.result(updateContent(item.id, draft, saveNote))) {
      setEditing(false);
      setSaveNote('');
    }
  };

  return (
    <div className="dr-file">
      {item.trashed && (
        <div className="dr-notice dr-notice--warn">
          <Trash2 /> This {isFolder ? 'folder' : 'file'} is in the trash{item.trashedAt ? ` since ${formatDate(item.trashedAt)}` : ''}.
          {canManage && (
            <button type="button" className="btn btn--sm" style={{ marginLeft: 'auto' }} onClick={() => toast.result(restoreItem(item.id))}>
              <RotateCcw /> Restore
            </button>
          )}
        </div>
      )}
      <header className="dr-file__head">
        <nav className="dr-crumbs dr-crumbs--small" aria-label="Location">
          {drive ? (
            <Link to={folderLink(drive.id)} className="dr-crumb dr-crumb--root">
              <span className="dr-drive-emoji" style={{ '--c': drive.color } as CSSProperties}>
                {drive.icon}
              </span>
              {drive.name}
            </Link>
          ) : (
            <span className="dr-crumb">Drive</span>
          )}
          {crumbs.map((c) => (
            <span key={c.id} className="dr-crumbs__seg">
              <ChevronRight aria-hidden="true" />
              <Link to={folderLink(c.driveId, c.id)} className="dr-crumb">
                {c.name}
              </Link>
            </span>
          ))}
        </nav>
        <div className="dr-file__title">
          <KindTile kind={item.kind} size={56} />
          <div className="grow" style={{ minWidth: 0 }}>
            {renaming && canEdit ? (
              <RenameInline
                initial={item.name}
                className="dr-file__rename"
                onCommit={(n) => {
                  toast.result(renameItem(item.id, n));
                  setRenaming(false);
                }}
                onCancel={() => setRenaming(false)}
              />
            ) : (
              <h1 className={cx('dr-file__name', canEdit && 'is-editable')} onClick={() => canEdit && setRenaming(true)} title={canEdit ? 'Click to rename' : undefined}>
                <span className="truncate">{item.name}</span>
                {canEdit && <Pencil aria-hidden="true" />}
              </h1>
            )}
            <div className="dr-file__meta">
              <SensitivityPill sensitivity={item.sensitivity} />
              {item.locked && (
                <span className="badge badge--warning" title="Only managers can edit while locked">
                  <Lock /> Locked
                </span>
              )}
              {item.retention !== 'none' && (
                <span className={cx('badge', item.retention === 'legal_hold' ? 'badge--danger' : 'badge--info')} title={RETENTION_META[item.retention].description}>
                  {item.retention === 'legal_hold' ? <Gavel /> : <Hourglass />} {RETENTION_META[item.retention].label}
                </span>
              )}
              <RolePill role={role} via={shortVia(explanation)} />
              <span className="dr-file__owner">
                <UserChip userId={item.ownerId} size={18} /> <span className="muted">owner</span>
              </span>
              <span className="muted text-sm">
                {!isFolder && `${formatBytes(item.sizeBytes)} · `}modified {relativeTime(item.modifiedAt)} by <UserChip userId={item.modifiedBy} size={16} />
              </span>
            </div>
          </div>
        </div>
        <div className="dr-actions" role="toolbar" aria-label="File actions">
          {canShare && (
            <button type="button" className="btn dr-btn-amber" onClick={() => setShareOpen(true)}>
              <UserPlus /> Share
            </button>
          )}
          {!canShare && role && (
            <button type="button" className="btn" onClick={() => setShareOpen(true)} title="See who has access">
              <Users /> Access
            </button>
          )}
          {!isFolder && (
            <span data-tip={!canDownload ? 'Restricted files can’t be downloaded by viewers — ask for commenter access.' : sens.rank >= 2 ? `Downloads are watermarked with your name (${sens.label})` : undefined}>
              <button type="button" className="btn" disabled={!canDownload} onClick={() => downloadResult(downloadItem(item.id))}>
                <Download /> Download
                {canDownload && sens.rank >= 2 && <Shield className="dr-ico-amber" aria-label="Watermarked" />}
              </button>
            </span>
          )}
          <button type="button" className={cx('btn btn--icon', starred && 'is-starred')} aria-pressed={starred} title={starred ? 'Remove from starred' : 'Add to starred'} onClick={() => toast.result(toggleStar(item.id))}>
            <Star />
          </button>
          <button type="button" className="btn btn--icon" title="Copy link" aria-label="Copy link" onClick={() => copyItemLink(item)}>
            <Link2 />
          </button>
          {canEdit && (
            <button type="button" className="btn btn--icon" title="Move to…" aria-label="Move to…" disabled={item.retention === 'legal_hold'} onClick={() => setMoveOpen(true)}>
              <FolderInput />
            </button>
          )}
          {canEdit && (
            <button type="button" className="btn btn--icon" title="Rename" aria-label="Rename" onClick={() => setRenaming(true)}>
              <Pencil />
            </button>
          )}
          {canManage && !isFolder && (
            <button type="button" className="btn btn--icon" title={item.locked ? 'Unlock' : 'Lock (managers only can edit)'} aria-label={item.locked ? 'Unlock' : 'Lock'} onClick={() => toast.result(setLocked(item.id, !item.locked))}>
              {item.locked ? <Unlock /> : <Lock />}
            </button>
          )}
          {isFolder && (
            <Link to={folderLink(item.driveId, item.id)} className="btn">
              <FolderOpen /> Open folder
            </Link>
          )}
          {canAskForMore && !item.trashed && (
            <button type="button" className="btn" onClick={() => setRequestOpen(true)} disabled={Boolean(pendingMore)} title={pendingMore ? 'You already have a pending request' : undefined}>
              <KeyRound /> {pendingMore ? 'Request pending' : 'Request access'}
            </button>
          )}
          {linkedTasks.length > 0 && (
            <Link to={`/projects/p/${linkedTasks[0].task.projectId}?task=${linkedTasks[0].task.id}`} className="btn">
              <SquareKanban /> Open in Projects{linkedTasks.length > 1 ? ` (${linkedTasks.length})` : ''}
            </Link>
          )}
          {!item.trashed && (
            <span data-tip={!canTrash ? (role !== 'manager' ? 'Only managers can trash' : item.retention === 'legal_hold' ? 'Under legal hold' : item.locked ? 'Unlock first' : undefined) : undefined}>
              <button
                type="button"
                className="btn btn--icon btn--danger"
                disabled={!canTrash}
                title="Move to trash"
                aria-label="Move to trash"
                onClick={() => {
                  if (toast.result(trashItem(item.id))) navigate(folderLink(item.driveId, item.parentId ?? undefined));
                }}
              >
                <Trash2 />
              </button>
            </span>
          )}
        </div>
      </header>

      <div className="dr-file__body">
        <section className="dr-preview-pane" aria-label="Preview">
          {canEditContent && (
            <div className="dr-edit-bar">
              {editing ? (
                <>
                  <Pencil className="dr-ico-amber" />
                  <span className="text-sm">Editing — changes are saved as a new version.</span>
                  <input className="input" value={saveNote} onChange={(e) => setSaveNote(e.target.value)} placeholder="Version note (optional)" aria-label="Version note" />
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn--sm dr-btn-amber" onClick={saveVersion}>
                    <Save /> Save version
                  </button>
                </>
              ) : (
                <>
                  <Eye />
                  <span className="text-sm muted grow">Viewing v{item.versions.length}. You can edit this {KIND_META[item.kind].label.toLowerCase()} inline.</span>
                  <button type="button" className="btn btn--sm" onClick={startEdit}>
                    <Pencil /> Edit
                  </button>
                </>
              )}
            </div>
          )}
          {!canEditContent && canEdit && !isFolder && !item.trashed && (
            <div className="dr-edit-bar">
              <Upload />
              <span className="text-sm muted grow">This file type can’t be edited inline — upload a new version from the Versions tab.</span>
              <button type="button" className="btn btn--sm" onClick={() => setTab('versions')}>
                Versions
              </button>
            </div>
          )}
          {item.locked && !canManage && (
            <div className="dr-notice dr-notice--info">
              <Lock /> Locked by a manager — view only until it’s unlocked.
            </div>
          )}
          {isFolder ? <FolderSummary item={item} /> : editing ? <PreviewEditor preview={draft} onChange={setDraft} /> : <PreviewRenderer item={item} />}
          {sens.rank >= 2 && !isFolder && (
            <div className="dr-watermark" aria-hidden="true">
              {sens.label.toUpperCase()} · {users.get(me ?? '')?.name ?? 'Helix'}
            </div>
          )}
        </section>

        <aside className="dr-rail" aria-label="File information">
          <div className="dr-rail__tabs" role="tablist">
            {TABS.map((t) => {
              const count = t.id === 'comments' ? unresolved : t.id === 'versions' ? item.versions.length : t.id === 'access' ? item.shares.length : 0;
              return (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={cx('dr-rail__tab', tab === t.id && 'is-active')} onClick={() => setTab(t.id)} title={t.label}>
                  {t.icon}
                  <span>{t.label}</span>
                  {count > 0 && <span className="dr-rail__count">{count}</span>}
                </button>
              );
            })}
          </div>
          <div className="dr-rail__body" role="tabpanel">
            {tab === 'details' && <DetailsTab data={data} explanation={describeRole(explanation, isFolder ? 'in this folder' : 'on this file')} />}
            {tab === 'access' && <AccessTab data={data} onManage={() => setShareOpen(true)} />}
            {tab === 'versions' && <VersionsTab data={data} />}
            {tab === 'comments' && <CommentsTab data={data} />}
            {tab === 'activity' && <ActivityTab item={item} />}
          </div>
        </aside>
      </div>

      <ShareDialog itemId={item.id} open={shareOpen} onClose={() => setShareOpen(false)} />
      <MovePickerModal itemIds={[item.id]} open={moveOpen} onClose={() => setMoveOpen(false)} />
      <RequestMoreModal item={item} role={role} open={requestOpen} onClose={() => setRequestOpen(false)} />
    </div>
  );
}

function FolderSummary({ item }: { item: DriveItem }) {
  const items = useDrive((s) => s.items);
  const children = items.filter((i) => i.parentId === item.id && !i.trashed);
  const bytes = children.reduce((n, c) => n + c.sizeBytes, 0);
  return (
    <div className="dr-nopreview">
      <KindTile kind="folder" size={64} />
      <div className="dr-nopreview__title">{item.name}</div>
      <p className="text-sm muted">
        {children.length} item{children.length === 1 ? '' : 's'} directly inside · {formatBytes(bytes)}
      </p>
      <Link to={folderLink(item.driveId, item.id)} className="btn dr-btn-amber">
        <FolderOpen /> Open folder
      </Link>
    </div>
  );
}

// ───────────────────────── rail: details ─────────────────────────

function DetailsTab({ data, explanation }: { data: ItemData; explanation: string }) {
  const { item, drive, canEdit, crumbs, linkedTasks } = data;
  const updateItemMeta = useDrive((s) => s.updateItemMeta);
  const [description, setDescription] = useState(item.description ?? '');
  const [tagDraft, setTagDraft] = useState('');
  useEffect(() => setDescription(item.description ?? ''), [item.description]);
  const addTag = () => {
    const t = tagDraft.trim().toLowerCase();
    if (!t) return;
    if (!item.tags.includes(t)) toast.result(updateItemMeta(item.id, { tags: [...item.tags, t] }));
    setTagDraft('');
  };
  return (
    <div className="stack">
      <div className="dr-notice dr-notice--role">
        <Shield /> {explanation}
      </div>
      <dl className="dr-kv">
        <dt>Type</dt>
        <dd>
          <KindIcon kind={item.kind} size={16} /> {KIND_META[item.kind].label}
        </dd>
        {item.kind !== 'folder' && (
          <>
            <dt>Size</dt>
            <dd className="mono">{formatBytes(item.sizeBytes)}</dd>
          </>
        )}
        <dt>Location</dt>
        <dd>
          <span className="dr-loc-path">
            {drive && <Link to={folderLink(drive.id)}>{drive.icon} {drive.name}</Link>}
            {crumbs.map((c) => (
              <span key={c.id}>
                <ChevronRight /> <Link to={folderLink(c.driveId, c.id)}>{c.name}</Link>
              </span>
            ))}
          </span>
        </dd>
        <dt>Owner</dt>
        <dd>
          <UserChip userId={item.ownerId} size={18} />
        </dd>
        <dt>Created</dt>
        <dd title={formatDateTime(item.createdAt)}>{formatDate(item.createdAt)}</dd>
        <dt>Modified</dt>
        <dd title={formatDateTime(item.modifiedAt)}>
          {relativeTime(item.modifiedAt)} by <UserChip userId={item.modifiedBy} size={16} />
        </dd>
        <dt>Views</dt>
        <dd className="mono">{item.views}</dd>
        <dt>Label</dt>
        <dd>
          <SensitivityPill sensitivity={item.sensitivity} compact /> <span className="text-xs muted">{SENSITIVITY_META[item.sensitivity].description}</span>
        </dd>
        <dt>Retention</dt>
        <dd>
          {RETENTION_META[item.retention].label} <span className="text-xs muted">— {RETENTION_META[item.retention].description}</span>
        </dd>
      </dl>

      <div className="field">
        <span className="field-label">
          <Tag style={{ width: 13, height: 13, display: 'inline', marginRight: 4 }} /> Tags
        </span>
        <div className="dr-tags">
          {item.tags.map((t) => (
            <span key={t} className="dr-tag">
              #{t}
              {canEdit && (
                <button type="button" aria-label={`Remove tag ${t}`} onClick={() => toast.result(updateItemMeta(item.id, { tags: item.tags.filter((x) => x !== t) }))}>
                  <X />
                </button>
              )}
            </span>
          ))}
          {canEdit && (
            <input
              className="dr-tags__input"
              value={tagDraft}
              placeholder="Add tag…"
              aria-label="Add tag"
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addTag();
                }
              }}
              onBlur={addTag}
            />
          )}
          {!canEdit && item.tags.length === 0 && <span className="text-xs muted">No tags</span>}
        </div>
      </div>

      <div className="field">
        <span className="field-label">Description</span>
        {canEdit ? (
          <>
            <textarea className="textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this and who is it for?" />
            {description !== (item.description ?? '') && (
              <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => setDescription(item.description ?? '')}>
                  Reset
                </button>
                <button type="button" className="btn btn--sm" onClick={() => toast.result(updateItemMeta(item.id, { description }))}>
                  <Check /> Save
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm muted">{item.description || 'No description.'}</p>
        )}
      </div>

      {linkedTasks.length > 0 && (
        <div className="field">
          <span className="field-label">
            <SquareKanban style={{ width: 13, height: 13, display: 'inline', marginRight: 4 }} /> Linked tasks
          </span>
          <ul className="dr-linked">
            {linkedTasks.map(({ task, project }) => (
              <li key={task.id}>
                <Link to={`/projects/p/${task.projectId}?task=${task.id}`}>
                  <span className="mono text-xs">{project ? `${project.key}-${task.number}` : task.number}</span>
                  <span className="truncate">{task.title}</span>
                  <ExternalLink />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── rail: access ─────────────────────────

function AccessTab({ data, onManage }: { data: ItemData; onManage: () => void }) {
  const { item, drive, canManage, canShare } = data;
  const ctx = useDriveContext();
  const label = usePrincipalLabel();
  const setInheritance = useDrive((s) => s.setInheritance);
  const effective = useMemo(() => collectEffectiveShares(item, ctx), [item, ctx]);
  const explicit = effective.filter((e) => !e.inherited);
  const inherited = effective.filter((e) => e.inherited);
  const boundary = inheritanceBoundary(item, ctx);

  return (
    <div className="stack">
      <div className="row row--between row--wrap" style={{ gap: 8 }}>
        <span className="text-sm muted">
          {explicit.length + inherited.length} share{explicit.length + inherited.length === 1 ? '' : 's'} · link {LINK_ACCESS_META[item.linkAccess].label.toLowerCase()}
        </span>
        <button type="button" className="btn btn--sm" onClick={onManage}>
          {canShare ? <UserPlus /> : <Eye />} {canShare ? 'Manage sharing' : 'View sharing'}
        </button>
      </div>

      <div className="dr-access-group">
        <div className="dr-access-group__title">Owner & drive managers</div>
        <div className="dr-access-row">
          <UserChip userId={item.ownerId} size={26} />
          <span className="grow text-xs muted">Owner</span>
          <RolePill role="manager" />
        </div>
        {drive?.managerIds
          .filter((id) => id !== item.ownerId)
          .map((id) => (
            <div key={id} className="dr-access-row">
              <UserChip userId={id} size={26} />
              <span className="grow text-xs muted">{drive.kind === 'personal' ? 'Drive owner' : 'Drive manager'}</span>
              <RolePill role="manager" />
            </div>
          ))}
      </div>

      <div className="dr-access-group">
        <div className="dr-access-group__title">On this {item.kind === 'folder' ? 'folder' : 'file'}</div>
        {explicit.length === 0 && <div className="text-xs muted">No direct shares.</div>}
        {explicit.map(({ share }) => (
          <div key={share.id} className="dr-access-row">
            <PrincipalAvatar principal={share.principal} size={26} />
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="block truncate">{label(share.principal)}</span>
              <span className="block text-xs muted truncate">
                {PRINCIPAL_TYPE_LABEL[share.principal.type]} · by <UserChip userId={share.grantedBy} size={12} showName />
                {share.note ? ` · ${share.note}` : ''}
              </span>
            </span>
            <ExpiryBadge expiresAt={share.expiresAt} />
            <RolePill role={share.role} />
          </div>
        ))}
      </div>

      <div className="dr-access-group">
        <div className="dr-access-group__title">Inherited</div>
        {inherited.length === 0 && <div className="text-xs muted">{item.inheritPermissions ? 'Nothing inherited from parent folders or the drive.' : 'Inheritance is off — nothing flows down from parents.'}</div>}
        {inherited.map(({ share, from, fromHref }) => (
          <div key={`${share.id}-${from}`} className="dr-access-row is-inherited">
            <PrincipalAvatar principal={share.principal} size={26} />
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="block truncate">{label(share.principal)}</span>
              <span className="block text-xs muted truncate">Inherited from {fromHref ? <Link to={fromHref}>{from}</Link> : from}</span>
            </span>
            <ExpiryBadge expiresAt={share.expiresAt} />
            <RolePill role={share.role} />
          </div>
        ))}
      </div>

      <div className="dr-access-group">
        <div className="dr-access-group__title">Link</div>
        <div className="dr-access-row">
          <span className="dr-principal-icon dr-principal-icon--company" style={{ '--size': '26px' } as CSSProperties}>
            <Link2 />
          </span>
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="block">{LINK_ACCESS_META[item.linkAccess].label}</span>
            <span className="block text-xs muted">{LINK_ACCESS_META[item.linkAccess].description}</span>
          </span>
          {item.linkAccess !== 'restricted' && <RolePill role={item.linkRole} />}
        </div>
      </div>

      <div className="dr-inherit">
        <div className="grow">
          <div className="row" style={{ gap: 8 }}>
            <b>Inherit permissions</b>
            <Switch checked={item.inheritPermissions} disabled={!canManage} label="Inherit permissions from parent" onChange={(v) => toast.result(setInheritance(item.id, v))} />
          </div>
          <p className="text-xs muted">
            {item.inheritPermissions
              ? boundary
                ? `Inheriting from parents up to “${boundary.name}”, which has its own permissions.`
                : `Everyone with access to the parent folders and ${drive ? drive.name : 'the drive'} can also open this.`
              : 'Turned off: only the shares listed above apply. Turning it off copies the current inherited shares so nobody loses access by surprise.'}
            {!canManage && ' Only managers can change this.'}
          </p>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── rail: versions ─────────────────────────

function VersionsTab({ data }: { data: ItemData }) {
  const { item, canEdit } = data;
  const uploadNewVersion = useDrive((s) => s.uploadNewVersion);
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState('');
  const versions = [...item.versions].sort((a, b) => b.version - a.version);
  const latest = versions[0]?.version;
  return (
    <div className="stack">
      {canEdit && item.kind !== 'folder' && (
        <div className="dr-version-upload">
          <input
            ref={fileRef}
            type="file"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && toast.result(uploadNewVersion(item.id, f.size, note || f.name))) setNote('');
              e.target.value = '';
            }}
          />
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed? (optional)" aria-label="Version note" />
          <button type="button" className="btn btn--sm dr-btn-amber" onClick={() => fileRef.current?.click()}>
            <Upload /> Upload new version
          </button>
        </div>
      )}
      <ol className="dr-versions">
        {versions.map((v) => (
          <li key={v.id} className={cx('dr-version', v.version === latest && 'is-current')}>
            <span className="dr-version__num">v{v.version}</span>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 6, minWidth: 0 }}>
                <span className="truncate">{v.note ?? 'Updated'}</span>
                {v.version === latest && <span className="tag">current</span>}
              </div>
              <div className="text-xs muted">
                <UserChip userId={v.by} size={14} /> · {formatDateTime(v.at)} · {formatBytes(v.sizeBytes)}
              </div>
            </div>
            {canEdit && v.version !== latest && (
              <button type="button" className="btn btn--sm btn--ghost" title={`Restore v${v.version} as a new version`} onClick={() => toast.result(uploadNewVersion(item.id, v.sizeBytes, `Restored v${v.version}`))}>
                <RotateCcw /> Restore
              </button>
            )}
          </li>
        ))}
        {versions.length === 0 && <li className="text-sm muted">Folders don’t have versions.</li>}
      </ol>
    </div>
  );
}

// ───────────────────────── rail: comments ─────────────────────────

function CommentsTab({ data }: { data: ItemData }) {
  const { item, canComment } = data;
  const users = useUsersById();
  const addComment = useDrive((s) => s.addComment);
  const resolveComment = useDrive((s) => s.resolveComment);
  const [body, setBody] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const comments = item.comments.filter((c) => showResolved || !c.resolved);
  const resolvedCount = item.comments.filter((c) => c.resolved).length;
  return (
    <div className="stack">
      {canComment ? (
        <form
          className="dr-composer"
          onSubmit={(e) => {
            e.preventDefault();
            if (toast.result(addComment(item.id, body))) setBody('');
          }}
        >
          <textarea className="textarea" rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment…" aria-label="New comment" />
          <button type="submit" className="btn btn--sm dr-btn-amber" disabled={!body.trim()}>
            <Send /> Comment
          </button>
        </form>
      ) : (
        <div className="dr-notice dr-notice--info">
          <MessageSquare /> You need commenter access to join the discussion.
        </div>
      )}
      {resolvedCount > 0 && (
        <label className="row text-xs muted" style={{ gap: 8 }}>
          <Switch checked={showResolved} onChange={setShowResolved} label="Show resolved comments" /> Show {resolvedCount} resolved
        </label>
      )}
      <ul className="dr-comments">
        {comments.length === 0 && <li className="text-sm muted">No {showResolved ? '' : 'open '}comments yet.</li>}
        {comments.map((c) => (
          <li key={c.id} className={cx('dr-comment', c.resolved && 'is-resolved')}>
            <UserChip userId={c.authorId} size={26} showName={false} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row row--between" style={{ gap: 6 }}>
                <span className="text-sm truncate" style={{ fontWeight: 600 }}>
                  {users.get(c.authorId)?.name ?? 'Someone'}
                </span>
                <span className="text-xs muted" title={formatDateTime(c.at)}>
                  {relativeTime(c.at)}
                </span>
              </div>
              <p className="text-sm">{c.body}</p>
              {canComment && (
                <button type="button" className="dr-comment__resolve" onClick={() => toast.result(resolveComment(item.id, c.id), c.resolved ? 'Reopened' : 'Resolved')}>
                  <Check /> {c.resolved ? 'Reopen' : 'Resolve'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ───────────────────────── rail: activity ─────────────────────────

function ActivityTab({ item }: { item: DriveItem }) {
  const events = [...item.activity].reverse();
  return (
    <ol className="dr-timeline">
      {events.map((a) => (
        <li key={a.id}>
          <span className="dr-timeline__dot" />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="text-sm">
              <UserChip userId={a.actorId} size={16} /> <b>{a.action}</b>
              {a.detail && <span className="muted"> · {a.detail}</span>}
            </div>
            <div className="text-xs muted" title={formatDateTime(a.at)}>
              <Clock style={{ width: 11, height: 11, display: 'inline', marginRight: 4 }} />
              {relativeTime(a.at)}
            </div>
          </div>
        </li>
      ))}
      {events.length === 0 && <li className="text-sm muted">No activity yet.</li>}
    </ol>
  );
}

// ───────────────────────── request more access ─────────────────────────

function RequestMoreModal({ item, role, open, onClose }: { item: DriveItem; role: DriveRole | null; open: boolean; onClose: () => void }) {
  const requestAccess = useDrive((s) => s.requestAccess);
  const options = (['commenter', 'editor'] as const).filter((r) => !role || ROLE_RANK[r] > ROLE_RANK[role]);
  const [want, setWant] = useState<'commenter' | 'editor'>(options[0] ?? 'editor');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (open) {
      setWant(options[0] ?? 'editor');
      setMessage('');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={460}
      title="Request more access"
      subtitle={
        <>
          You currently have <b>{role ? ROLE_META[role].label.toLowerCase() : 'no'}</b> access to “{item.name}”.
        </>
      }
      icon={
        <span className="dr-modal-icon">
          <KeyRound />
        </span>
      }
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn dr-btn-amber"
            onClick={() => {
              if (toast.result(requestAccess(item.id, want, message))) onClose();
            }}
          >
            <Send /> Send request
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="dr-seg" role="group" aria-label="Requested role">
          {options.map((r) => (
            <button key={r} type="button" aria-pressed={want === r} onClick={() => setWant(r)}>
              {ROLE_META[r].label}
            </button>
          ))}
        </div>
        <p className="field-hint">{ROLE_META[want].description}</p>
        <textarea className="textarea" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Why do you need it?" aria-label="Message" />
      </div>
    </Modal>
  );
}
