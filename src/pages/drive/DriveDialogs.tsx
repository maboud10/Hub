/**
 * Modals for creating folders, documents from templates, uploading files with
 * drag-and-drop & sensitivity label selection, and creating/editing shared drives.
 */
import { useEffect, useState, type CSSProperties, type DragEvent } from 'react';
import { useNavigate } from 'react-router';
import { Check, FilePlus2, FolderPlus, HardDrive, Shield, Sparkles, Upload, X } from 'lucide-react';
import type { Department } from '@/types';
import { toast } from '@/store/toast';
import { Modal } from '@/components/ui/Modal';
import { cx } from '@/lib/cx';
import { DEPARTMENT_DRIVE_COLORS, KIND_META, NEW_FILE_TEMPLATES, SENSITIVITY_META, formatBytes, kindFromFileName } from '@/drive/constants';
import { folderLink, itemLink, useDrive, type UploadInput } from '@/drive/store';
import { useDriveCaps, useVisibleDrives } from '@/drive/selectors';
import type { Sensitivity, SharedDrive } from '@/drive/types';
import { MembershipRulesEditor, PeoplePicker, type MembershipRule } from './pickers';
import { DEPARTMENTS, KindIcon, KindTile, SensitivityPill } from './shared';

export type CreateTarget = {
  driveId: string;
  folderId: string | null;
  label: string;
};

export type TemplateKind = 'doc' | 'sheet' | 'slides';

const SENSITIVITIES = Object.keys(SENSITIVITY_META) as Sensitivity[];
const DRIVE_ICONS = ['📁', '🏗️', '🎨', '🤝', '💸', '📈', '🛡️', '🚀', '🧪', '🌐', '⚡', '📦'];
const DRIVE_COLORS = ['#60a5fa', '#a78bfa', '#f472b6', '#c084fc', '#4ade80', '#fb923c', '#2dd4bf', '#38bdf8', '#fbbf24', '#f87171'];

const DEMO_SAMPLES: UploadInput[] = [
  { name: 'Q4-architecture-diagram.png', sizeBytes: 2_840_000 },
  { name: 'vendor-security-assessment.pdf', sizeBytes: 4_120_000 },
  { name: 'headcount-forecast-fy27.csv', sizeBytes: 184_000 },
  { name: 'api-rate-limiter-config.ts', sizeBytes: 18_400 },
  { name: 'exec-board-briefing.slides', sizeBytes: 9_650_000 },
];

// ───────────────────────── New Folder Modal ─────────────────────────

export function NewFolderModal({
  open,
  onClose,
  target,
  defaultDriveId,
  defaultParentId = null,
}: {
  open: boolean;
  onClose: () => void;
  target?: CreateTarget | null;
  defaultDriveId?: string;
  defaultParentId?: string | null;
}) {
  const createFolder = useDrive((s) => s.createFolder);
  const setSensitivity = useDrive((s) => s.setSensitivity);
  const drives = useVisibleDrives();
  const initialDriveId = target?.driveId ?? defaultDriveId ?? drives[0]?.drive.id ?? '';
  const parentFolderId = target ? target.folderId : (defaultParentId ?? null);

  const [driveId, setDriveId] = useState(initialDriveId);
  const [name, setName] = useState('');
  const [sensitivity, setSens] = useState<Sensitivity>('internal');

  useEffect(() => {
    if (!open) return;
    const resolvedDriveId = target?.driveId ?? defaultDriveId ?? drives[0]?.drive.id ?? '';
    setDriveId(resolvedDriveId);
    setName('');
    const d = drives.find((x) => x.drive.id === resolvedDriveId)?.drive;
    setSens(d?.defaultSensitivity ?? 'internal');
  }, [open, target, defaultDriveId, drives]);

  const submit = () => {
    if (!driveId) return;
    const res = createFolder(driveId, parentFolderId, name);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    if (res.itemId && sensitivity) {
      setSensitivity(res.itemId, sensitivity);
    }
    toast.success(res.message ?? 'Folder created.');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={480}
      title="New folder"
      subtitle={target ? `Creating in ${target.label}. Folders inherit drive permissions by default.` : 'Folders inherit drive permissions by default and can carry a sensitivity label.'}
      icon={
        <span className="dr-modal-icon">
          <FolderPlus />
        </span>
      }
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn dr-btn-amber" disabled={!name.trim()} onClick={submit}>
            <Check /> Create folder
          </button>
        </>
      }
    >
      <div className="stack">
        {!parentFolderId && !target && (
          <label className="field">
            <span className="field-label">Destination drive</span>
            <select className="select" value={driveId} onChange={(e) => setDriveId(e.target.value)}>
              {drives.map((d) => (
                <option key={d.drive.id} value={d.drive.id}>
                  {d.drive.icon} {d.drive.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span className="field-label">Folder name</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Q1 Launch Assets, Security Audits…"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) submit();
            }}
          />
        </label>
        <div className="field">
          <span className="field-label">Default sensitivity label</span>
          <div className="dr-sens-opts dr-sens-opts--compact">
            {SENSITIVITIES.map((s) => {
              const m = SENSITIVITY_META[s];
              const active = sensitivity === s;
              return (
                <button
                  key={s}
                  type="button"
                  className={cx('dr-sens-opt', active && 'is-active')}
                  style={{ '--sens': m.color } as CSSProperties}
                  aria-pressed={active}
                  onClick={() => setSens(s)}
                >
                  <span className="dr-sens-opt__title">
                    <i />
                    {m.label}
                  </span>
                  <span className="dr-sens-opt__desc">{m.description}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ───────────────────────── Template Chooser / New Document Modal ─────────────────────────

export function TemplateChooser({
  open,
  onClose,
  target,
  kind = 'all',
  defaultDriveId,
  defaultParentId = null,
  initialTemplateId,
}: {
  open: boolean;
  onClose: () => void;
  target?: CreateTarget | null;
  kind?: TemplateKind | 'all';
  defaultDriveId?: string;
  defaultParentId?: string | null;
  initialTemplateId?: string;
}) {
  const navigate = useNavigate();
  const createFile = useDrive((s) => s.createFile);
  const setSensitivity = useDrive((s) => s.setSensitivity);
  const drives = useVisibleDrives();
  const initialDriveId = target?.driveId ?? defaultDriveId ?? drives[0]?.drive.id ?? '';
  const parentFolderId = target ? target.folderId : (defaultParentId ?? null);

  const filteredTemplates = kind === 'all' ? NEW_FILE_TEMPLATES : NEW_FILE_TEMPLATES.filter((t) => t.kind === kind);
  const [driveId, setDriveId] = useState(initialDriveId);
  const [templateId, setTemplateId] = useState(initialTemplateId ?? filteredTemplates[0]?.id ?? NEW_FILE_TEMPLATES[0].id);
  const [name, setName] = useState('');
  const [sensitivity, setSens] = useState<Sensitivity>('internal');

  useEffect(() => {
    if (!open) return;
    const resolvedDriveId = target?.driveId ?? defaultDriveId ?? drives[0]?.drive.id ?? '';
    setDriveId(resolvedDriveId);
    const list = kind === 'all' ? NEW_FILE_TEMPLATES : NEW_FILE_TEMPLATES.filter((t) => t.kind === kind);
    const tpl = list.find((t) => t.id === initialTemplateId) ?? list[0] ?? NEW_FILE_TEMPLATES[0];
    setTemplateId(tpl.id);
    setName(tpl.name);
    const d = drives.find((x) => x.drive.id === resolvedDriveId)?.drive;
    setSens(d?.defaultSensitivity ?? 'internal');
  }, [open, target, defaultDriveId, initialTemplateId, kind, drives]);

  const selectTemplate = (id: string) => {
    setTemplateId(id);
    const tpl = NEW_FILE_TEMPLATES.find((t) => t.id === id);
    if (tpl) setName(tpl.name);
  };

  const submit = () => {
    if (!driveId) return;
    const res = createFile(driveId, parentFolderId, templateId, name.trim() || undefined);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    if (res.itemId) {
      if (sensitivity) setSensitivity(res.itemId, sensitivity);
      toast.success(res.message ?? 'Document created.');
      onClose();
      navigate(itemLink(res.itemId));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={620}
      title="New document"
      subtitle={target ? `Create in ${target.label}. Pick a starter template and initial DLP sensitivity label.` : 'Pick a starter template, name your file, and set its initial DLP sensitivity label.'}
      icon={
        <span className="dr-modal-icon">
          <FilePlus2 />
        </span>
      }
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn dr-btn-amber" onClick={submit}>
            <Check /> Create & open
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="field">
          <span className="field-label">Template</span>
          <div className="dr-tpl-grid">
            {filteredTemplates.map((t) => {
              const active = t.id === templateId;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={cx('dr-tpl-card', active && 'is-active')}
                  onClick={() => selectTemplate(t.id)}
                  aria-pressed={active}
                >
                  <KindTile kind={t.kind} size={36} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="dr-tpl-card__title truncate">{t.name}</div>
                    <div className="dr-tpl-card__desc truncate">{t.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="dr-form-row">
          <label className="field grow">
            <span className="field-label">File name</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Document title"
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />
          </label>
          {!parentFolderId && !target && (
            <label className="field" style={{ minWidth: 200 }}>
              <span className="field-label">Drive</span>
              <select className="select" value={driveId} onChange={(e) => setDriveId(e.target.value)}>
                {drives.map((d) => (
                  <option key={d.drive.id} value={d.drive.id}>
                    {d.drive.icon} {d.drive.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="field">
          <span className="field-label">Sensitivity label (DLP)</span>
          <div className="dr-sens-opts dr-sens-opts--compact">
            {SENSITIVITIES.map((s) => {
              const m = SENSITIVITY_META[s];
              const active = sensitivity === s;
              return (
                <button
                  key={s}
                  type="button"
                  className={cx('dr-sens-opt', active && 'is-active')}
                  style={{ '--sens': m.color } as CSSProperties}
                  aria-pressed={active}
                  onClick={() => setSens(s)}
                >
                  <span className="dr-sens-opt__title">
                    <i />
                    {m.label}
                  </span>
                  <span className="dr-sens-opt__desc">{m.description}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export const NewFileModal = TemplateChooser;

// ───────────────────────── Upload File Dialog ─────────────────────────

export function UploadDialog({
  open,
  onClose,
  target,
  defaultDriveId,
  defaultParentId = null,
}: {
  open: boolean;
  onClose: () => void;
  target?: CreateTarget | null;
  defaultDriveId?: string;
  defaultParentId?: string | null;
}) {
  const uploadFiles = useDrive((s) => s.uploadFiles);
  const setSensitivity = useDrive((s) => s.setSensitivity);
  const drives = useVisibleDrives();
  const initialDriveId = target?.driveId ?? defaultDriveId ?? drives[0]?.drive.id ?? '';
  const parentFolderId = target ? target.folderId : (defaultParentId ?? null);

  const [driveId, setDriveId] = useState(initialDriveId);
  const [staged, setStaged] = useState<UploadInput[]>([]);
  const [customName, setCustomName] = useState('');
  const [customSizeMb, setCustomSizeMb] = useState('1.5');
  const [sensitivity, setSens] = useState<Sensitivity>('internal');
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!open) return;
    const resolvedDriveId = target?.driveId ?? defaultDriveId ?? drives[0]?.drive.id ?? '';
    setDriveId(resolvedDriveId);
    setStaged([DEMO_SAMPLES[0]]);
    setCustomName('');
    const d = drives.find((x) => x.drive.id === resolvedDriveId)?.drive;
    setSens(d?.defaultSensitivity ?? 'internal');
  }, [open, target, defaultDriveId, drives]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const list = Array.from(e.dataTransfer.files);
    if (list.length) {
      setStaged((prev) => [...prev, ...list.map((f) => ({ name: f.name, sizeBytes: f.size || 250_000 }))]);
    }
  };

  const addCustom = () => {
    const clean = customName.trim();
    if (!clean) return;
    const bytes = Math.max(1024, Math.round((parseFloat(customSizeMb) || 1) * 1024 * 1024));
    setStaged((prev) => [...prev, { name: clean.includes('.') ? clean : `${clean}.pdf`, sizeBytes: bytes }]);
    setCustomName('');
  };

  const submit = () => {
    if (!driveId || !staged.length) return;
    const res = uploadFiles(driveId, parentFolderId, staged);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    if (res.itemIds?.length) {
      for (const id of res.itemIds) {
        setSensitivity(id, sensitivity);
      }
    }
    toast.success(res.message ?? 'Uploaded.');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={620}
      title="Upload files"
      subtitle={target ? `Uploading to ${target.label}. Files inherit folder access and carry your chosen DLP label.` : 'Drop real files from your desktop or simulate enterprise uploads with DLP classification.'}
      icon={
        <span className="dr-modal-icon">
          <Upload />
        </span>
      }
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn dr-btn-amber" disabled={staged.length === 0} onClick={submit}>
            <Upload /> Upload {staged.length > 0 ? `(${staged.length})` : ''}
          </button>
        </>
      }
    >
      <div className="stack">
        <label
          className={cx('dr-dropzone', dragOver && 'is-over')}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <input
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []);
              if (list.length) {
                setStaged((prev) => [...prev, ...list.map((f) => ({ name: f.name, sizeBytes: f.size || 250_000 }))]);
              }
            }}
          />
          <Upload className="dr-dropzone__icon" />
          <div className="dr-dropzone__title">Drop files here or click to browse</div>
          <div className="dr-dropzone__sub">Supports documents, spreadsheets, decks, PDFs, images, code & archives</div>
        </label>

        <div className="field">
          <span className="field-label">
            <Sparkles style={{ width: 13, height: 13 }} /> Quick-add simulated files
          </span>
          <div className="row row--wrap" style={{ gap: 6 }}>
            {DEMO_SAMPLES.map((s) => (
              <button
                key={s.name}
                type="button"
                className="btn btn--xs btn--ghost"
                onClick={() => setStaged((prev) => (prev.some((x) => x.name === s.name) ? prev : [...prev, s]))}
              >
                + {s.name} <span className="faint mono">({formatBytes(s.sizeBytes)})</span>
              </button>
            ))}
          </div>
        </div>

        <div className="dr-form-row">
          <input
            className="input grow"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Or type a custom file name (e.g. soc2-report.pdf)"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustom();
              }
            }}
          />
          <input
            className="input"
            style={{ width: 96 }}
            type="number"
            step="0.5"
            min="0.1"
            value={customSizeMb}
            onChange={(e) => setCustomSizeMb(e.target.value)}
            aria-label="Size in MB"
            title="Size in MB"
          />
          <button type="button" className="btn btn--sm" onClick={addCustom} disabled={!customName.trim()}>
            Add
          </button>
        </div>

        {staged.length > 0 && (
          <div className="dr-staged-list">
            {staged.map((f, idx) => {
              const k = kindFromFileName(f.name);
              return (
                <div key={`${f.name}-${idx}`} className="dr-staged-item">
                  <KindIcon kind={k} size={18} />
                  <span className="grow truncate">{f.name}</span>
                  <span className="text-xs muted">{KIND_META[k].label}</span>
                  <span className="text-xs mono muted">{formatBytes(f.sizeBytes)}</span>
                  <SensitivityPill sensitivity={sensitivity} compact />
                  <button
                    type="button"
                    className="icon-btn icon-btn--sm"
                    onClick={() => setStaged((prev) => prev.filter((_, i) => i !== idx))}
                    aria-label={`Remove ${f.name}`}
                  >
                    <X />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="dr-form-row">
          {!parentFolderId && !target && (
            <label className="field grow">
              <span className="field-label">Destination drive</span>
              <select className="select" value={driveId} onChange={(e) => setDriveId(e.target.value)}>
                {drives.map((d) => (
                  <option key={d.drive.id} value={d.drive.id}>
                    {d.drive.icon} {d.drive.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="field grow">
            <span className="field-label">
              <Shield style={{ width: 13, height: 13 }} /> Sensitivity classification
            </span>
            <select className="select" value={sensitivity} onChange={(e) => setSens(e.target.value as Sensitivity)}>
              {SENSITIVITIES.map((s) => (
                <option key={s} value={s}>
                  {SENSITIVITY_META[s].label} — {SENSITIVITY_META[s].description}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export const UploadModal = UploadDialog;

// ───────────────────────── Shared Drive Modal (Create / Edit) ─────────────────────────

export function SharedDriveModal({
  open,
  onClose,
  drive,
}: {
  open: boolean;
  onClose: () => void;
  /** When passed, edits an existing shared drive instead of creating a new one. */
  drive?: SharedDrive | null;
}) {
  const navigate = useNavigate();
  const caps = useDriveCaps();
  const createSharedDrive = useDrive((s) => s.createSharedDrive);
  const updateSharedDrive = useDrive((s) => s.updateSharedDrive);
  const setDriveAccess = useDrive((s) => s.setDriveAccess);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState<Department>('Engineering');
  const [icon, setIcon] = useState('📁');
  const [color, setColor] = useState('#60a5fa');
  const [defaultSensitivity, setDefaultSensitivity] = useState<Sensitivity>('internal');
  const [managerIds, setManagerIds] = useState<string[]>([]);
  const [rules, setRules] = useState<MembershipRule[]>([]);

  useEffect(() => {
    if (!open) return;
    if (drive) {
      setName(drive.name);
      setDescription(drive.description);
      setDepartment(drive.department ?? 'Engineering');
      setIcon(drive.icon);
      setColor(drive.color);
      setDefaultSensitivity(drive.defaultSensitivity);
      setManagerIds(drive.managerIds);
      setRules(drive.access.map((a) => ({ principal: a.principal, role: a.role })));
    } else {
      const dept = caps.viewer?.department ?? 'Engineering';
      setName('');
      setDescription('');
      setDepartment(dept);
      setIcon('📁');
      setColor(DEPARTMENT_DRIVE_COLORS[dept] ?? '#60a5fa');
      setDefaultSensitivity('internal');
      setManagerIds(caps.viewer ? [caps.viewer.userId] : []);
      setRules([{ principal: { type: 'department', id: dept }, role: 'editor' }]);
    }
  }, [open, drive, caps.viewer]);

  const submit = () => {
    if (drive) {
      const r1 = updateSharedDrive(drive.id, {
        name,
        description,
        icon,
        color,
        defaultSensitivity,
        managerIds: managerIds.length ? managerIds : drive.managerIds,
      });
      if (!r1.ok) {
        toast.error(r1.error);
        return;
      }
      const r2 = setDriveAccess(drive.id, rules);
      if (!r2.ok) {
        toast.error(r2.error);
        return;
      }
      toast.success('Shared drive settings & membership updated.');
      onClose();
      return;
    }

    const res = createSharedDrive({
      name,
      description,
      department,
      icon,
      color,
      managerIds,
      access: rules,
      defaultSensitivity,
    });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(res.message ?? 'Shared drive created.');
    onClose();
    if (res.driveId) navigate(folderLink(res.driveId));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={660}
      title={drive ? `Manage “${drive.name}”` : 'New shared drive'}
      subtitle="Shared drives belong to a team or department — every item inside inherits these membership rules."
      icon={
        <span className="dr-modal-icon" style={{ '--c': color } as CSSProperties}>
          <HardDrive />
        </span>
      }
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn dr-btn-amber" disabled={name.trim().length < 3} onClick={submit}>
            <Check /> {drive ? 'Save changes' : 'Create shared drive'}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="dr-form-row">
          <label className="field grow">
            <span className="field-label">Drive name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Platform Architecture, Brand Studio…" />
          </label>
          {!drive && (
            <label className="field" style={{ minWidth: 190 }}>
              <span className="field-label">Department</span>
              <select
                className="select"
                value={department}
                disabled={!caps.canGovern}
                onChange={(e) => {
                  const d = e.target.value as Department;
                  setDepartment(d);
                  setColor(DEPARTMENT_DRIVE_COLORS[d] ?? '#60a5fa');
                }}
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <label className="field">
          <span className="field-label">Description</span>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What lives in this shared drive?" />
        </label>

        <div className="dr-form-row">
          <div className="field grow">
            <span className="field-label">Icon</span>
            <div className="dr-swatch-row">
              {DRIVE_ICONS.map((ic) => (
                <button key={ic} type="button" className={cx('dr-icon-pick', icon === ic && 'is-active')} onClick={() => setIcon(ic)}>
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field-label">Accent color</span>
            <div className="dr-swatch-row">
              {DRIVE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={cx('dr-color-pick', color === c && 'is-active')}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>
        </div>

        <label className="field">
          <span className="field-label">Default sensitivity for new files</span>
          <select className="select" value={defaultSensitivity} onChange={(e) => setDefaultSensitivity(e.target.value as Sensitivity)}>
            {SENSITIVITIES.map((s) => (
              <option key={s} value={s}>
                {SENSITIVITY_META[s].label} — {SENSITIVITY_META[s].description}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span className="field-label">Drive managers (full control over membership & settings)</span>
          <PeoplePicker picked={managerIds} onChange={setManagerIds} max={6} placeholder="Add drive managers…" />
        </div>

        <div className="field">
          <span className="field-label">Inherited membership rules (Role, Department, Permission, Everyone)</span>
          <MembershipRulesEditor rules={rules} onChange={setRules} />
        </div>
      </div>
    </Modal>
  );
}

export function NewSharedDriveModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <SharedDriveModal open={open} onClose={onClose} />;
}

export function DriveSettingsDrawer({ driveId, open, onClose }: { driveId?: string; open: boolean; onClose: () => void }) {
  const drive = useDrive((s) => (driveId ? s.drives.find((d) => d.id === driveId) : undefined));
  if (!drive) return null;
  return <SharedDriveModal open={open} onClose={onClose} drive={drive} />;
}
