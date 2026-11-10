/**
 * Drive dialogs: Rename, Move (folder navigator with permission-aware targets), Label (DLP impact +
 * justification for downgrades), Upload, Quick Look, Delete forever, New shared drive, Drive members,
 * Create task (Projects bridge) and Send to channel (Pulse bridge).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  ExternalLink,
  FolderInput,
  Hash,
  ListTodo,
  Lock,
  MessagesSquare,
  Plus,
  ShieldAlert,
  Tag,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Sheet } from '@/components/ui/Sheet';
import { Avatar } from '@/components/ui/primitives';
import { Chip, NeoEmpty, NovaChip, PeoplePicker, Typing } from '@/components/neo';
import { useEscapeToClose, useFocusTrap } from '@/hooks/useOverlay';
import { currentViewer, loadBridge, type BridgeChannel, type BridgeProject } from '@/lib/appBridge';
import { cx } from '@/lib/cx';
import { todayKey } from '@/lib/format';
import { toast } from '@/store/toast';
import type { Department } from '@/types';
import type { Item, Level, Place, Principal, Sensitivity } from '@/drive/types';
import { itemRoute, useDrive } from '@/drive/store';
import { DAY, LABELS, LABEL_HINT, LABEL_NAME, LABEL_RANK, LEVEL_LABEL, LEVELS, atLeast } from '@/drive/meta';
import { childrenOf, driveAccess, driveLabel, isWithin, labelImpact, locationOf, placeAccess, principalKey, principalMembers, principalName } from '@/drive/access';
import { classify } from '@/drive/nova';
import { contentOf } from '@/drive/content';
import { useDriveUI } from './ctx';
import { DRIVE_COLORS, DRIVE_ICONS, DriveGlyph, KindTile, LABEL_ICON, LabelChip, LevelSelect, PrincipalGlyph } from './bits';
import { Preview, Watermark } from './Previews';
import { PrincipalPicker } from './ShareDialog';
import { ProjectSigil } from '@/projects/sigils';

/* ---------------- Rename ---------------- */

export function RenameDialog({ id, then, onClose }: { id: string; then?: string; onClose: () => void }) {
  const ui = useDriveUI();
  const navigate = useNavigate();
  const item = ui.engine.ctx.item.get(id);
  const [name, setName] = useState(item?.name ?? '');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      const dot = item && item.kind !== 'folder' ? el.value.lastIndexOf('.') : -1;
      el.setSelectionRange(0, dot > 0 ? dot : el.value.length);
    }, 60);
    return () => window.clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!item) return null;
  const finish = () => {
    onClose();
    if (then) navigate(then);
  };
  const save = () => {
    const r = useDrive.getState().rename(id, name);
    if (!r.ok) return toast.error('Can’t rename', r.error);
    if (r.message) toast.success(r.message);
    finish();
  };
  return (
    <Modal
      open
      onClose={finish}
      width={460}
      className="neo-portal dv-modal"
      icon={<KindTile item={item} size={34} />}
      title="Rename"
      subtitle={locationOf(ui.engine.ctx, item, ui.engine.me.id)}
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={finish}>
            {then ? 'Keep name' : 'Cancel'}
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={save} disabled={!name.trim()} data-qa="rename-save">
            <Check /> Save
          </button>
        </>
      }
    >
      <input
        ref={ref}
        className="neo-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            save();
          }
        }}
        aria-label="Name"
        data-qa="rename-input"
      />
    </Modal>
  );
}

/* ---------------- Move ---------------- */

export function MoveDialog({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const ui = useDriveUI();
  const { ctx, me } = ui.engine;
  const items = ids.map((id) => ctx.item.get(id)).filter((i): i is Item => !!i);
  const first = items[0];
  const [loc, setLoc] = useState<Place | null>(first ? { driveId: first.driveId, parentId: first.parentId } : null);
  if (!first) return null;
  const drives = ctx.drives.filter((d) => (d.kind === 'personal' ? d.ownerId === me.id : driveAccess(ctx, me, d) !== 'none' || ctx.items.some((i) => i.driveId === d.id && i.kind === 'folder' && atLeast(ui.engine.access(i).level, 'editor'))));
  const valid = (p: Place): string | null => {
    if (p.parentId && ids.includes(p.parentId)) return 'Can’t move into itself';
    const target = p.parentId ? ctx.item.get(p.parentId) : null;
    if (target && ids.some((id) => isWithin(ctx, target, id))) return 'Can’t move a folder inside itself';
    if (!atLeast(placeAccess(ctx, me, p.driveId, p.parentId), 'editor')) return 'You don’t have edit access here';
    if (items.every((i) => i.parentId === p.parentId && i.driveId === p.driveId)) return 'Already here';
    return null;
  };
  const drive = loc ? ctx.drive.get(loc.driveId) : null;
  const folder = loc?.parentId ? ctx.item.get(loc.parentId) : null;
  const folders = loc ? childrenOf(ctx, loc.driveId, loc.parentId).filter((i) => i.kind === 'folder' && ui.engine.access(i).discoverable) : [];
  const err = loc ? valid(loc) : 'Pick a destination';
  const go = () => {
    if (!loc) return;
    const r = useDrive.getState().move(ids, loc);
    if (!r.ok) return toast.error('Can’t move', r.error);
    toast.success(r.message ?? 'Moved');
    import('./ctx').then((m) => m.useUndo.getState().push(r.message ?? 'Moved', r.revert));
    onClose();
  };
  const up = () => {
    if (!loc) return;
    if (!loc.parentId) return setLoc(null);
    const p = ctx.item.get(loc.parentId);
    setLoc({ driveId: loc.driveId, parentId: p?.parentId ?? null });
  };
  return (
    <Modal
      open
      onClose={onClose}
      width={560}
      className="neo-portal dv-modal"
      icon={<span className="dv-modal-icon"><FolderInput /></span>}
      title={items.length === 1 ? `Move “${first.name}”` : `Move ${items.length} items`}
      subtitle={`Currently in ${locationOf(ctx, first, me.id).split(' / ').slice(0, -0 || undefined).join(' / ')}`}
      footer={
        <>
          <span className="grow neo-faint text-sm truncate">{loc && !err ? `To ${drive ? driveLabel(ctx, drive, me.id) : ''}${folder ? ` / ${folder.name}` : ''}` : err}</span>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" disabled={!!err} onClick={go} data-qa="move-here">
            <FolderInput /> Move here
          </button>
        </>
      }
    >
      <div className="dv-mover">
        <div className="dv-mover__bar">
          <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={up} disabled={!loc} aria-label="Up one level">
            <ArrowLeft />
          </button>
          <span className="truncate text-sm">
            {loc ? (
              <>
                <strong>{drive ? driveLabel(ctx, drive, me.id) : ''}</strong>
                {folder ? ` / ${[...(folder ? [folder] : [])].map((f) => f.name).join(' / ')}` : ''}
              </>
            ) : (
              <strong>All drives</strong>
            )}
          </span>
        </div>
        <ul className="dv-mover__list" role="listbox" aria-label="Destinations">
          {!loc &&
            drives.map((d) => {
              const v = valid({ driveId: d.id, parentId: null });
              return (
                <li key={d.id}>
                  <button type="button" className="dv-mover__row" onClick={() => setLoc({ driveId: d.id, parentId: null })}>
                    <DriveGlyph drive={d} size={26} />
                    <span className="grow truncate">{driveLabel(ctx, d, me.id)}</span>
                    {v && v !== 'Already here' && <Lock className="dv-mover__lock" />}
                    <ChevronRight />
                  </button>
                </li>
              );
            })}
          {loc && folders.length === 0 && <li className="neo-faint text-sm" style={{ padding: 14 }}>No folders here — you can move into this location.</li>}
          {loc &&
            folders.map((f) => {
              const v = valid({ driveId: f.driveId, parentId: f.id });
              const self = ids.includes(f.id);
              return (
                <li key={f.id}>
                  <button type="button" className={cx('dv-mover__row', self && 'is-disabled')} disabled={self} onClick={() => setLoc({ driveId: f.driveId, parentId: f.id })} data-tip={v && v !== 'Already here' ? v : undefined}>
                    <KindTile item={f} size={26} />
                    <span className="grow truncate">{f.name}</span>
                    {v && v !== 'Already here' && <Lock className="dv-mover__lock" />}
                    <ChevronRight />
                  </button>
                </li>
              );
            })}
        </ul>
      </div>
    </Modal>
  );
}

/* ---------------- Label ---------------- */

const RULE_SUMMARY: Record<Sensitivity, string[]> = {
  public: ['Public links OK', 'Contractors OK'],
  internal: ['Org & public links OK', 'Contractors OK'],
  confidential: ['No public links', 'No contractors'],
  restricted: ['Named people only', 'No download', '≤ 30-day shares', 'Watermark'],
};

export function LabelDialog({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const ui = useDriveUI();
  const { ctx } = ui.engine;
  const items = ids.map((id) => ctx.item.get(id)).filter((i): i is Item => !!i);
  const [label, setLabel] = useState<Sensitivity>(items[0]?.label ?? 'internal');
  const [why, setWhy] = useState('');
  const nova = useMemo(() => (items.length === 1 ? classify(items[0]) : null), [items]);
  if (!items.length) return null;
  const downgrade = items.some((i) => LABEL_RANK[label] < LABEL_RANK[i.label]);
  const impact = items.length === 1 && label !== items[0].label ? labelImpact(ctx, items[0], label) : [];
  const apply = () => {
    const r = useDrive.getState().setLabel(ids, label, why);
    if (!r.ok) return toast.error('Label not changed', r.error);
    toast.success(r.message ?? 'Label updated');
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      width={620}
      className="neo-portal dv-modal"
      icon={<span className="dv-modal-icon"><Tag /></span>}
      title={items.length === 1 ? `Label “${items[0].name}”` : `Label ${items.length} items`}
      subtitle="Sensitivity labels drive sharing rules (DLP) everywhere this file goes."
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={apply} disabled={downgrade && why.trim().length < 10} data-qa="label-apply">
            <Check /> Apply {LABEL_NAME[label]}
          </button>
        </>
      }
    >
      {nova && nova.label !== items[0].label && (
        <div className="neo-nova dv-nova" style={{ marginBottom: 12 }}>
          <div className="neo-nova__glow" />
          <div className="row" style={{ gap: 8 }}>
            <NovaChip>Label check</NovaChip>
            <span className="text-sm grow">
              Nova suggests <strong>{LABEL_NAME[nova.label]}</strong> — {nova.reason}
            </span>
            <button type="button" className="neo-btn neo-btn--xs" onClick={() => setLabel(nova.label)}>
              Use
            </button>
          </div>
        </div>
      )}
      <div className="dv-labels" role="radiogroup" aria-label="Sensitivity label">
        {LABELS.map((l) => {
          const I = LABEL_ICON[l];
          return (
            <button key={l} type="button" role="radio" aria-checked={label === l} className={cx('dv-labelopt', `is-${l}`, label === l && 'is-on')} onClick={() => setLabel(l)}>
              <span className="dv-labelopt__icon">
                <I />
              </span>
              <span className="dv-labelopt__name">{LABEL_NAME[l]}</span>
              <span className="dv-labelopt__hint">{LABEL_HINT[l]}</span>
              <span className="dv-labelopt__rules">
                {RULE_SUMMARY[l].map((r) => (
                  <span key={r}>{r}</span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
      {impact.length > 0 && (
        <div className="dv-banner dv-banner--warn" style={{ marginTop: 12 }}>
          <ShieldAlert />
          <span>
            <strong>DLP will block:</strong> {impact.map((x) => `${x.name} (${x.reason})`).join(' · ')}
          </span>
        </div>
      )}
      {downgrade && (
        <label className="neo-field" style={{ marginTop: 12 }}>
          <span className="neo-label">Why is it safe to lower the label? (required)</span>
          <textarea className="neo-textarea" rows={2} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. Figures were published in the annual report." data-qa="label-why" />
          <span className="neo-hint">Downgrades are written to the audit trail as warnings.</span>
        </label>
      )}
    </Modal>
  );
}

/* ---------------- Upload ---------------- */

export function UploadDialog({ place, onClose }: { place: Place; onClose: () => void }) {
  const ui = useDriveUI();
  const { ctx, me } = ui.engine;
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const drive = ctx.drive.get(place.driveId);
  const folder = place.parentId ? ctx.item.get(place.parentId) : null;
  const send = (files: File[]) => {
    if (!files.length) return;
    ui.upload(files, place);
    onClose();
  };
  return (
    <Modal open onClose={onClose} width={560} className="neo-portal dv-modal" icon={<span className="dv-modal-icon"><Upload /></span>} title="Upload files" subtitle={`To ${drive ? driveLabel(ctx, drive, me.id) : 'My Drive'}${folder ? ` / ${folder.name}` : ''}`}>
      <div
        className={cx('neo-drop dv-uploadzone', over && 'is-over')}
        onDragOver={(e: DragEvent) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setOver(false);
          send([...e.dataTransfer.files]);
        }}
      >
        <div className="dv-uploadzone__orb">
          <Upload />
        </div>
        <div className="neo-title">Drop files here</div>
        <p className="neo-faint text-sm">Images up to 2 MB and text/code up to 200 KB keep a live preview.</p>
        <button type="button" className="neo-btn neo-btn--plasma" onClick={() => input.current?.click()} data-qa="choose-files">
          <Plus /> Choose files
        </button>
        <input ref={input} type="file" multiple hidden onChange={(e) => send([...(e.target.files ?? [])])} />
      </div>
    </Modal>
  );
}

/* ---------------- Quick Look ---------------- */

export function QuickLook({ ids, index, onClose }: { ids: string[]; index: number; onClose: () => void }) {
  const ui = useDriveUI();
  const navigate = useNavigate();
  const { ctx, me } = ui.engine;
  const [i, setI] = useState(index);
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);
  useEscapeToClose(true, onClose);
  const item = ctx.item.get(ids[i]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI((v) => Math.min(ids.length - 1, v + 1));
      else if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1));
      else if (e.key === ' ') {
        const t = e.target as HTMLElement;
        if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter' && item) {
        e.preventDefault();
        onClose();
        navigate(itemRoute(item));
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [ids.length, item, navigate, onClose]);
  if (!item) return null;
  const caps = ui.engine.caps(item);
  return createPortal(
    <div className="neo-portal dv-ql" role="dialog" aria-modal="true" aria-label={`Quick Look: ${item.name}`}>
      <div className="dv-ql__scrim" onClick={onClose} />
      <div ref={ref} className="dv-ql__panel" tabIndex={-1}>
        <div className="dv-ql__head">
          <KindTile item={item} size={30} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="dv-ql__name truncate">{item.name}</div>
            <div className="neo-faint text-xs truncate">{locationOf(ctx, item, me.id)}</div>
          </div>
          <LabelChip label={item.label} />
          <span className="neo-mono neo-faint text-xs">
            {i + 1} / {ids.length}
          </span>
          <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => (onClose(), navigate(itemRoute(item)))}>
            <ExternalLink /> Open
          </button>
          <button type="button" className="neo-iconbtn" onClick={onClose} aria-label="Close Quick Look">
            <X />
          </button>
        </div>
        <div className={cx('dv-ql__body', `is-${item.kind}`)} key={item.id}>
          <Preview item={item} content={contentOf(item)} names={ctx.users.map((u) => u.name)} />
          {caps.watermark && <Watermark text={`${me.name} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · ${LABEL_NAME[item.label]}`} />}
        </div>
        <div className="dv-ql__foot">
          <button type="button" className="neo-iconbtn" disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Previous">
            <ArrowLeft />
          </button>
          <span className="neo-faint text-xs">
            <kbd className="kbd">←</kbd> <kbd className="kbd">→</kbd> browse · <kbd className="kbd">↵</kbd> open · <kbd className="kbd">Space</kbd> close
          </span>
          <button type="button" className="neo-iconbtn" disabled={i === ids.length - 1} onClick={() => setI(i + 1)} aria-label="Next">
            <ArrowRight />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ---------------- Delete forever ---------------- */

export function PurgeDialog({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const ui = useDriveUI();
  const items = ids.map((id) => ui.engine.ctx.item.get(id)).filter((i): i is Item => !!i);
  const go = () => {
    const r = ids.length > 1 && items.every((i) => i.trashed) ? useDrive.getState().purge(ids) : useDrive.getState().purge(ids);
    if (!r.ok) return toast.error('Not deleted', r.error);
    toast.success(r.message ?? 'Deleted forever');
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      width={480}
      className="neo-portal dv-modal"
      icon={<span className="dv-modal-icon is-danger"><Trash2 /></span>}
      title={items.length === 1 ? `Delete “${items[0]?.name}” forever?` : `Delete ${items.length} items forever?`}
      subtitle="This can’t be undone. Folders take everything inside with them."
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--danger" onClick={go} data-qa="purge-confirm">
            <Trash2 /> Delete forever
          </button>
        </>
      }
    >
      <ul className="dv-purgelist">
        {items.slice(0, 6).map((i) => (
          <li key={i.id}>
            <KindTile item={i} size={24} />
            <span className="truncate grow">{i.name}</span>
            <LabelChip label={i.label} quiet />
          </li>
        ))}
        {items.length > 6 && <li className="neo-faint text-sm">+{items.length - 6} more</li>}
      </ul>
    </Modal>
  );
}

/* ---------------- New shared drive ---------------- */

export function NewDriveDialog({ onClose }: { onClose: () => void }) {
  const ui = useDriveUI();
  const navigate = useNavigate();
  const { ctx } = ui.engine;
  const depts = [...new Set(ctx.users.map((u) => u.department))].sort() as Department[];
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [icon, setIcon] = useState('rocket');
  const [color, setColor] = useState(DRIVE_COLORS[0]);
  const [dept, setDept] = useState<Department | ''>('');
  const [label, setLabel] = useState<Sensitivity>('internal');
  const [managers, setManagers] = useState<string[]>([]);
  const [deptLevel, setDeptLevel] = useState<Level>('editor');
  const create = () => {
    const members = [
      ...managers.map((id) => ({ principal: { type: 'user', id } as Principal, level: 'manager' as Level, expiresAt: null })),
      ...(dept ? [{ principal: { type: 'dept', id: dept } as Principal, level: deptLevel, expiresAt: null }] : []),
    ];
    const r = useDrive.getState().createDrive({ name, description: desc, icon, color, department: dept || undefined, defaultLabel: label, members });
    if (!r.ok) return toast.error('Drive not created', r.error);
    toast.success(r.message ?? 'Drive created');
    onClose();
    navigate(`/drive/d/${r.id}`);
  };
  return (
    <Modal
      open
      onClose={onClose}
      width={620}
      className="neo-portal dv-modal"
      icon={<DriveGlyph drive={{ icon, color, kind: 'shared' }} size={38} />}
      title="New shared drive"
      subtitle="Members and roles you add here apply to everything inside."
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" disabled={name.trim().length < 2} onClick={create} data-qa="create-drive">
            <Check /> Create drive
          </button>
        </>
      }
    >
      <div className="dv-form">
        <label className="neo-field">
          <span className="neo-label">Name</span>
          <input className="neo-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Launch Studio" autoFocus />
        </label>
        <label className="neo-field">
          <span className="neo-label">Description</span>
          <input className="neo-input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What lives here?" />
        </label>
        <div className="neo-field">
          <span className="neo-label">Icon & colour</span>
          <div className="dv-iconpick">
            {Object.keys(DRIVE_ICONS)
              .filter((k) => k !== 'user')
              .map((k) => {
                const I = DRIVE_ICONS[k];
                return (
                  <button key={k} type="button" className={cx('dv-iconpick__opt', icon === k && 'is-on')} onClick={() => setIcon(k)} aria-label={k} aria-pressed={icon === k} style={{ '--d': color } as CSSProperties}>
                    <I />
                  </button>
                );
              })}
          </div>
          <div className="dv-swatches">
            {DRIVE_COLORS.map((c) => (
              <button key={c} type="button" className={cx('dv-swatchbtn', color === c && 'is-on')} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Colour ${c}`} aria-pressed={color === c} />
            ))}
          </div>
        </div>
        <div className="dv-form__row">
          <label className="neo-field grow">
            <span className="neo-label">Department</span>
            <select className="neo-select" value={dept} onChange={(e) => setDept(e.target.value as Department | '')}>
              <option value="">None</option>
              {depts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          {dept && (
            <label className="neo-field">
              <span className="neo-label">{dept} gets</span>
              <LevelSelect value={deptLevel} onChange={setDeptLevel} levels={['viewer', 'commenter', 'editor']} size="md" />
            </label>
          )}
          <label className="neo-field grow">
            <span className="neo-label">Default label</span>
            <select className="neo-select" value={label} onChange={(e) => setLabel(e.target.value as Sensitivity)}>
              {LABELS.map((l) => (
                <option key={l} value={l}>
                  {LABEL_NAME[l]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="neo-field">
          <span className="neo-label">Managers (you’re added automatically)</span>
          <div className="row row--wrap" style={{ gap: 6 }}>
            {managers.map((id) => {
              const u = ctx.user.get(id);
              return u ? (
                <Chip key={id} tone="app" icon={<Avatar user={u} size={16} />}>
                  {u.name}
                </Chip>
              ) : null;
            })}
            <PeoplePicker
              multiple
              value={managers}
              onChange={setManagers}
              label="Add managers"
              trigger={(p) => (
                <button {...p} type="button" className="neo-btn neo-btn--sm">
                  <Plus /> Add managers
                </button>
              )}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Drive members ---------------- */

export function MembersSheet({ driveId, onClose }: { driveId: string; onClose: () => void }) {
  const ui = useDriveUI();
  const { ctx, me } = ui.engine;
  const drive = ctx.drive.get(driveId);
  const [name, setName] = useState(drive?.name ?? '');
  const [desc, setDesc] = useState(drive?.description ?? '');
  if (!drive) return null;
  const canManage = atLeast(driveAccess(ctx, me, drive), 'manager');
  const exclude = new Set(drive.members.map((m) => principalKey(m.principal)));
  const add = (p: Principal) => toast.result(useDrive.getState().setDriveMember(drive.id, p, 'viewer'));
  return (
    <Sheet open onClose={onClose} width={520} className="neo-portal dv-membersheet" title={`${drive.name} · members`}>
      <div className="dv-form">
        <div className="row" style={{ gap: 12 }}>
          <DriveGlyph drive={drive} size={44} />
          <div className="grow">
            <input className="neo-input" value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} aria-label="Drive name" onBlur={() => name !== drive.name && toast.result(useDrive.getState().updateDrive(drive.id, { name }))} />
          </div>
        </div>
        <input className="neo-input" value={desc} onChange={(e) => setDesc(e.target.value)} disabled={!canManage} aria-label="Description" placeholder="Description" onBlur={() => desc !== drive.description && toast.result(useDrive.getState().updateDrive(drive.id, { description: desc }))} />
        <div className="dv-form__row">
          <label className="neo-field grow">
            <span className="neo-label">Default label for new items</span>
            <select className="neo-select" value={drive.defaultLabel} disabled={!canManage} onChange={(e) => toast.result(useDrive.getState().updateDrive(drive.id, { defaultLabel: e.target.value as Sensitivity }))}>
              {LABELS.map((l) => (
                <option key={l} value={l}>
                  {LABEL_NAME[l]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {canManage && <PrincipalPicker onPick={add} exclude={exclude} />}
        <div className="dv-arows">
          {drive.members.map((m) => {
            const user = m.principal.type === 'user' ? ctx.user.get(m.principal.id) : undefined;
            const role = m.principal.type === 'role' ? ctx.roles.find((r) => r.id === (m.principal as { id: string }).id) : undefined;
            const count = m.principal.type === 'user' ? 1 : principalMembers(ctx, m.principal).length;
            return (
              <div key={m.id} className="dv-arow">
                <PrincipalGlyph p={m.principal} user={user} roleColor={role?.color} size={30} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="truncate dv-arow__name">{principalName(ctx, m.principal)}</div>
                  <div className="truncate dv-arow__sub">{count > 1 ? `${count} people` : user?.title}</div>
                </div>
                {canManage ? (
                  <>
                    <LevelSelect value={m.level} levels={LEVELS} onChange={(l) => toast.result(useDrive.getState().setDriveMember(drive.id, m.principal, l))} />
                    <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label={`Remove ${principalName(ctx, m.principal)}`} onClick={() => toast.result(useDrive.getState().setDriveMember(drive.id, m.principal, null))}>
                      <X />
                    </button>
                  </>
                ) : (
                  <span className="dv-arow__lvl">{LEVEL_LABEL[m.level]}</span>
                )}
              </div>
            );
          })}
        </div>
        {!canManage && (
          <div className="dv-banner">
            <Users />
            <span>Only drive managers can change members.</span>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ---------------- Create task (Projects) ---------------- */

export function TaskDialog({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const ui = useDriveUI();
  const navigate = useNavigate();
  const item = ui.engine.ctx.item.get(itemId);
  const [projects, setProjects] = useState<BridgeProject[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState(item ? `Review “${item.name}”` : '');
  const [due, setDue] = useState(todayKey(new Date(Date.now() + 3 * DAY)));
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    const v = currentViewer();
    if (!v) return;
    loadBridge('projects')
      .then((api) => setProjects(api.listProjects(v, { writableOnly: true })))
      .catch(() => setFailed(true));
  }, []);
  if (!item) return null;
  const create = async () => {
    const v = currentViewer();
    if (!v) return;
    try {
      const api = await loadBridge('projects');
      const r = api.createTask(v, { title, notes: `From Helix Drive: ${item.name}\n${window.location.origin}${itemRoute(item)}`, projectId: projectId || undefined, dueDate: due || undefined, source: { app: 'drive', label: item.name, to: itemRoute(item) } });
      if (!r.ok) return toast.error('Task not created', r.error);
      toast.success('Task created in Projects');
      setDone(r.to);
    } catch {
      toast.info('Projects is unavailable right now', 'Try again in a moment.');
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      width={520}
      className="neo-portal dv-modal"
      icon={<span className="dv-modal-icon"><ListTodo /></span>}
      title="Create a task from this file"
      subtitle={item.name}
      footer={
        done ? (
          <>
            <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
              Done
            </button>
            <button type="button" className="neo-btn neo-btn--plasma" onClick={() => (onClose(), navigate(done))}>
              <ExternalLink /> Open task
            </button>
          </>
        ) : (
          <>
            <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="neo-btn neo-btn--plasma" disabled={!title.trim() || failed} onClick={() => void create()}>
              <Check /> Create task
            </button>
          </>
        )
      }
    >
      {done ? (
        <NeoEmpty compact icon={<Check />} title="Task created">
          It links back to this file so everyone lands in the right place.
        </NeoEmpty>
      ) : failed ? (
        <div className="dv-banner dv-banner--warn">
          <ShieldAlert />
          <span>Projects isn’t reachable right now. Try again in a moment.</span>
        </div>
      ) : (
        <div className="dv-form">
          <label className="neo-field">
            <span className="neo-label">Task</span>
            <input className="neo-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="dv-form__row">
            <label className="neo-field grow">
              <span className="neo-label">Project</span>
              {projects === null ? (
                <span className="row neo-faint text-sm" style={{ gap: 8, height: 40 }}>
                  <Typing label="Loading projects" /> Loading projects…
                </span>
              ) : (
                <select className="neo-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">My Tasks (personal)</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      <ProjectSigil icon={p.icon} color={p.color} size={18} /> {p.name}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <label className="neo-field">
              <span className="neo-label">Due</span>
              <input type="date" className="neo-input" value={due} onChange={(e) => setDue(e.target.value)} />
            </label>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ---------------- Send to channel (Pulse) ---------------- */

export function ChannelDialog({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const ui = useDriveUI();
  const navigate = useNavigate();
  const item = ui.engine.ctx.item.get(itemId);
  const [channels, setChannels] = useState<BridgeChannel[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [channelId, setChannelId] = useState('');
  const [text, setText] = useState(item ? `Sharing “${item.name}” — take a look.` : '');
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    const v = currentViewer();
    if (!v) return;
    loadBridge('chat')
      .then((api) => {
        const list = api.listChannels(v).filter((c) => c.kind === 'channel');
        setChannels(list);
        if (list[0]) setChannelId(list[0].id);
      })
      .catch(() => setFailed(true));
  }, []);
  if (!item) return null;
  const sensitive = LABEL_RANK[item.label] >= 2;
  const post = async () => {
    const v = currentViewer();
    if (!v || !channelId) return;
    try {
      const api = await loadBridge('chat');
      const r = api.postToChannel(v, { channelId, text, card: { app: 'drive', title: item.name, subtitle: `${LABEL_NAME[item.label]} · Helix Drive`, to: itemRoute(item), status: 'Shared' } });
      if (!r.ok) return toast.error('Not posted', r.error);
      toast.success('Posted to Pulse');
      setDone(r.to);
    } catch {
      toast.info('Pulse Chat is unavailable right now', 'Try again in a moment.');
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      width={520}
      className="neo-portal dv-modal"
      icon={<span className="dv-modal-icon"><MessagesSquare /></span>}
      title="Send to a Pulse channel"
      subtitle={item.name}
      footer={
        done ? (
          <>
            <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
              Done
            </button>
            <button type="button" className="neo-btn neo-btn--plasma" onClick={() => (onClose(), navigate(done))}>
              <ExternalLink /> Open in Pulse
            </button>
          </>
        ) : (
          <>
            <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="neo-btn neo-btn--plasma" disabled={!channelId || failed} onClick={() => void post()}>
              <MessagesSquare /> Post
            </button>
          </>
        )
      }
    >
      {done ? (
        <NeoEmpty compact icon={<Check />} title="Posted">
          Channel members see a file card — people without access get a request button.
        </NeoEmpty>
      ) : failed ? (
        <div className="dv-banner dv-banner--warn">
          <ShieldAlert />
          <span>Pulse Chat isn’t reachable right now. Try again in a moment.</span>
        </div>
      ) : (
        <div className="dv-form">
          {sensitive && (
            <div className="dv-banner dv-banner--warn">
              <Lock />
              <span>
                This file is <strong>{LABEL_NAME[item.label]}</strong>. Posting doesn’t grant access — members still need permission to open it.
              </span>
            </div>
          )}
          <div className="neo-field">
            <span className="neo-label">Channel</span>
            {channels === null ? (
              <span className="row neo-faint text-sm" style={{ gap: 8 }}>
                <Typing label="Loading channels" /> Loading channels…
              </span>
            ) : channels.length === 0 ? (
              <span className="neo-faint text-sm">You’re not in any channels yet.</span>
            ) : (
              <div className="dv-chanlist">
                {channels.slice(0, 8).map((c) => (
                  <button key={c.id} type="button" className={cx('dv-chan', channelId === c.id && 'is-on')} onClick={() => setChannelId(c.id)} aria-pressed={channelId === c.id}>
                    <Hash /> {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <label className="neo-field">
            <span className="neo-label">Message</span>
            <textarea className="neo-textarea" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
        </div>
      )}
    </Modal>
  );
}

