/**
 * Inspector panels shared by the folder browser and the file view:
 * Details (with Nova summary + label suggestion), Activity, and Access ("why can I open this?").
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  ArchiveRestore,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FolderInput,
  Link2,
  MessageSquare,
  Pencil,
  Plus,
  Scissors,
  Share2,
  ShieldAlert,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  UserMinus,
  X,
  XCircle,
  History,
  Radar,
} from 'lucide-react';
import { Avatar } from '@/components/ui/primitives';
import { Chip, NovaChip, Typing, useTypewriter } from '@/components/neo';
import { formatDateTime, relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { toast } from '@/store/toast';
import type { Activity, Item, Verb } from '@/drive/types';
import { useDrive } from '@/drive/store';
import { KIND_NAME, LABEL_NAME, LINK_NAME, LEVEL_LABEL, formatBytes } from '@/drive/meta';
import { audience, driveLabel, folderSize, holdOf, inactiveText, locationOf, reasonText } from '@/drive/access';
import { classify, shouldSuggest, summarize } from '@/drive/nova';
import { childrenOf } from '@/drive/access';
import { useDriveUI } from './ctx';
import { LabelChip, Thumb } from './bits';

/* ---------------- Nova summary ---------------- */

export function NovaSummary({ item }: { item: Item }) {
  const [state, setState] = useState<'idle' | 'thinking' | 'done'>('idle');
  const s = useMemo(() => summarize(item), [item]);
  const text = state === 'done' ? [s.headline, ...s.bullets.map((b) => `• ${b}`)].join('\n') : '';
  const [shown, done] = useTypewriter(text, 140);
  useEffect(() => setState('idle'), [item.id]);
  if (state === 'idle')
    return (
      <button type="button" className="neo-btn neo-btn--nova neo-btn--sm neo-btn--block" onClick={() => {
        setState('thinking');
        window.setTimeout(() => setState('done'), 650);
      }}>
        <Sparkles /> Summarize with Nova
      </button>
    );
  return (
    <div className="neo-nova dv-nova">
      <div className="neo-nova__glow" />
      <div className="row" style={{ gap: 8, marginBottom: 6 }}>
        <NovaChip>Nova summary</NovaChip>
        {state === 'thinking' && <Typing label="Nova is reading" />}
      </div>
      {state === 'done' && (
        <div className="dv-nova__text">
          {shown.split('\n').map((l, i) => (
            <p key={i} className={l.startsWith('•') ? 'is-bullet' : undefined}>
              {l}
            </p>
          ))}
          {!done && <span className="dv-caret" />}
        </div>
      )}
    </div>
  );
}

export function NovaLabel({ item }: { item: Item }) {
  const ui = useDriveUI();
  const caps = ui.engine.caps(item);
  const s = useMemo(() => classify(item), [item]);
  if (!caps.label || !shouldSuggest(item, s)) return null;
  const apply = () => {
    if (s.label === 'public') return ui.open({ type: 'label', ids: [item.id] });
    toast.result(useDrive.getState().setLabel([item.id], s.label));
  };
  return (
    <div className="neo-nova dv-nova dv-nova--label">
      <div className="neo-nova__glow" />
      <div className="row" style={{ gap: 8 }}>
        <NovaChip>Label check</NovaChip>
        <span className="neo-faint text-xs">{Math.round(s.confidence * 100)}% confident</span>
      </div>
      <p className="text-sm" style={{ margin: '8px 0 10px' }}>
        Looks <strong>{LABEL_NAME[s.label]}</strong> — {s.reason}
      </p>
      <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={apply}>
        <ShieldAlert /> Apply {LABEL_NAME[s.label]}
      </button>
    </div>
  );
}

/* ---------------- details ---------------- */

function TagEditor({ item, canEdit }: { item: Item; canEdit: boolean }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    const r = useDrive.getState().updateDetails(item.id, { tags: [...item.tags, t] });
    if (!r.ok) toast.error(r.error);
    setDraft('');
  };
  return (
    <div className="dv-tags">
      {item.tags.map((t) => (
        <span key={t} className="dv-tag">
          #{t}
          {canEdit && (
            <button type="button" aria-label={`Remove tag ${t}`} onClick={() => useDrive.getState().updateDetails(item.id, { tags: item.tags.filter((x) => x !== t) })}>
              <X />
            </button>
          )}
        </span>
      ))}
      {canEdit && (
        <input
          className="dv-tag-input"
          value={draft}
          placeholder={item.tags.length ? 'Add…' : 'Add a tag…'}
          aria-label="Add tag"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
        />
      )}
      {!canEdit && !item.tags.length && <span className="neo-faint text-xs">No tags</span>}
    </div>
  );
}

function DescriptionEditor({ item, canEdit }: { item: Item; canEdit: boolean }) {
  const [v, setV] = useState(item.description ?? '');
  useEffect(() => setV(item.description ?? ''), [item.id, item.description]);
  if (!canEdit) return <p className="text-sm neo-muted" style={{ margin: 0 }}>{item.description || <span className="neo-faint">No description</span>}</p>;
  return (
    <textarea
      className="neo-textarea dv-desc"
      rows={2}
      value={v}
      placeholder="Add a description…"
      aria-label="Description"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v !== (item.description ?? '')) toast.result(useDrive.getState().updateDetails(item.id, { description: v }), 'Description saved');
      }}
    />
  );
}

export function DetailsPanel({ item }: { item: Item }) {
  const ui = useDriveUI();
  const { ctx, me } = ui.engine;
  const caps = ui.engine.caps(item);
  const owner = ctx.user.get(item.ownerId);
  const editor = ctx.user.get(item.updatedBy);
  const hold = holdOf(ctx, item);
  const count = item.kind === 'folder' ? childrenOf(ctx, item.driveId, item.id).length : 0;
  const parentRoute = item.parentId ? `/drive/d/${item.driveId}/${item.parentId}` : `/drive/d/${item.driveId}`;
  return (
    <div className="dv-panel">
      {item.kind !== 'folder' && <Thumb item={item} className="dv-panel__thumb" />}
      {hold && (
        <div className="dv-banner dv-banner--hold">
          <ShieldAlert />
          <span>
            Legal hold on {hold.where}: <strong>{hold.hold.reason}</strong>. Nothing here can be deleted.
          </span>
        </div>
      )}
      {item.kind !== 'folder' && <NovaSummary item={item} />}
      <NovaLabel item={item} />
      <dl className="neo-kv dv-kv">
        <dt>Type</dt>
        <dd>{item.kind === 'folder' ? `Folder · ${count} item${count === 1 ? '' : 's'}` : KIND_NAME[item.kind]}</dd>
        <dt>Size</dt>
        <dd>{formatBytes(item.kind === 'folder' ? folderSize(ctx, item) : item.size)}</dd>
        <dt>Location</dt>
        <dd>
          <Link to={parentRoute} className="dv-link truncate" style={{ display: 'block' }}>
            {locationOf(ctx, item, me.id)}
          </Link>
        </dd>
        <dt>Owner</dt>
        <dd className="row" style={{ gap: 6 }}>
          {owner && <Avatar user={owner} size={20} />}
          <span className="truncate">{owner?.id === me.id ? 'You' : owner?.name}</span>
        </dd>
        <dt>Modified</dt>
        <dd title={formatDateTime(item.updatedAt)}>
          {relativeTime(item.updatedAt)} by {editor?.id === me.id ? 'you' : editor?.name.split(' ')[0]}
        </dd>
        <dt>Created</dt>
        <dd>{formatDateTime(item.createdAt)}</dd>
        <dt>Label</dt>
        <dd className="row" style={{ gap: 8 }}>
          <LabelChip label={item.label} />
          {caps.label && (
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => ui.open({ type: 'label', ids: [item.id] })}>
              Change
            </button>
          )}
        </dd>
      </dl>
      <div className="dv-panel__sec">
        <div className="neo-hud">Description</div>
        <DescriptionEditor item={item} canEdit={caps.edit} />
      </div>
      <div className="dv-panel__sec">
        <div className="neo-hud">Tags</div>
        <TagEditor item={item} canEdit={caps.edit} />
      </div>
    </div>
  );
}

/* ---------------- activity ---------------- */

const VERB: Record<Verb, { icon: ReactNode; text: string }> = {
  created: { icon: <Plus />, text: 'created this' },
  uploaded: { icon: <Upload />, text: 'uploaded this' },
  edited: { icon: <Pencil />, text: 'edited' },
  version: { icon: <History />, text: 'saved' },
  renamed: { icon: <Pencil />, text: 'renamed' },
  moved: { icon: <FolderInput />, text: 'moved' },
  shared: { icon: <Share2 />, text: 'shared with' },
  unshared: { icon: <UserMinus />, text: 'removed access for' },
  commented: { icon: <MessageSquare />, text: 'commented' },
  labelled: { icon: <Tag />, text: 'changed governance' },
  trashed: { icon: <Trash2 />, text: 'moved this to trash' },
  restored: { icon: <ArchiveRestore />, text: 'restored this' },
  link: { icon: <Link2 />, text: 'changed link sharing' },
  inheritance: { icon: <Scissors />, text: 'changed inheritance' },
  approved: { icon: <CheckCircle2 />, text: 'approved access for' },
  denied: { icon: <XCircle />, text: 'declined access for' },
  downloaded: { icon: <Download />, text: 'downloaded this' },
  copied: { icon: <Copy />, text: 'copied' },
  viewed: { icon: <Eye />, text: 'viewed this' },
};

export function ActivityPanel({ activity }: { activity: Activity[] }) {
  const ui = useDriveUI();
  const { ctx, me } = ui.engine;
  if (!activity.length) return <p className="neo-faint text-sm" style={{ padding: 16 }}>No activity yet.</p>;
  return (
    <ol className="dv-activity">
      {activity.slice(0, 40).map((a) => {
        const u = ctx.user.get(a.by);
        const v = VERB[a.verb];
        return (
          <li key={a.id} className={cx('dv-activity__row', `is-${a.verb}`)}>
            <span className="dv-activity__icon">{v.icon}</span>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="text-sm">
                <strong>{u?.id === me.id ? 'You' : (u?.name ?? 'System')}</strong> {v.text}
                {a.detail && <span className="neo-muted"> {a.detail}</span>}
              </div>
              <div className="neo-faint text-xs" title={formatDateTime(a.at)}>
                {relativeTime(a.at)}
              </div>
            </div>
            {u && <Avatar user={u} size={22} />}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------- access ---------------- */

export function AccessPanel({ item }: { item: Item }) {
  const ui = useDriveUI();
  const { ctx, me } = ui.engine;
  const a = ui.engine.access(item);
  const caps = ui.engine.caps(item);
  const aud = useMemo(() => audience(ctx, item), [ctx, item]);
  const drive = ctx.drive.get(item.driveId);
  const people = aud.people.slice(0, 8).map((p) => ctx.user.get(p.id)).filter((u): u is NonNullable<typeof u> => !!u);
  return (
    <div className="dv-panel">
      <div className="dv-panel__sec">
        <div className="neo-hud neo-hud--tint">Why you can open this</div>
        {a.reasons.length ? (
          <ul className="dv-reasons">
            {a.reasons.map((r) => (
              <li key={r.key}>
                <span className="dv-reasons__lvl">{LEVEL_LABEL[r.level]}</span>
                <span>{reasonText(r).split(' — ')[1]}</span>
                {r.expiresAt && <Chip size="sm" tone="amber">{`until ${new Date(r.expiresAt).toLocaleDateString()}`}</Chip>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="neo-faint text-sm">You don’t have access.</p>
        )}
        {a.inactive.length > 0 && (
          <details className="dv-inactive">
            <summary>
              {a.inactive.length} path{a.inactive.length > 1 ? 's' : ''} not in effect
            </summary>
            <ul>
              {a.inactive.map((r) => (
                <li key={r.key} className={`is-${r.status}`}>
                  {inactiveText(r)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <div className="dv-panel__sec">
        <div className="neo-hud">Who can open it</div>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <span className="neo-avatars">
            {people.map((u) => (
              <Avatar key={u.id} user={u} size={26} />
            ))}
          </span>
          <span className="text-sm">
            <strong>{aud.people.length}</strong> people{aud.editors ? ` · ${aud.editors} can edit` : ''}
          </span>
        </div>
        <div className="dv-chiprow">
          <Chip size="sm" tone={item.link.scope === 'anyone' ? 'rose' : item.link.scope === 'org' ? 'cyan' : 'slate'} icon={<Link2 />}>
            {LINK_NAME[item.link.scope]}
          </Chip>
          {aud.blocked > 0 && (
            <Chip size="sm" tone="danger" icon={<ShieldAlert />}>
              {aud.blocked} blocked by DLP
            </Chip>
          )}
          {!item.inherit && (
            <Chip size="sm" tone="violet" icon={<Scissors />}>
              Inheritance restricted
            </Chip>
          )}
          {drive && (
            <Chip size="sm" tone="slate">
              {driveLabel(ctx, drive, me.id)}
            </Chip>
          )}
        </div>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="neo-btn neo-btn--soft neo-btn--sm grow" onClick={() => ui.open({ type: 'share', itemId: item.id, tab: 'xray' })}>
          <Radar /> Access X-Ray
        </button>
        {caps.share && (
          <button type="button" className="neo-btn neo-btn--sm grow" onClick={() => ui.open({ type: 'share', itemId: item.id })}>
            <Share2 /> Manage access
          </button>
        )}
      </div>
    </div>
  );
}
