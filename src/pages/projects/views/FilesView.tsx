/**
 * Files — everything attached to the project: files pinned to the project
 * itself plus every task attachment. Attach from Helix Drive (bridge), add
 * links (or drop a URL anywhere on the view), remove with Undo.
 */
import { useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Archive, ExternalLink, FileCode, FileImage, FileSpreadsheet, FileText, FileVideo, HardDrive, Link2, Paperclip, Pin, Presentation, X } from 'lucide-react';
import { NeoEmpty, NeoSearch, NeoTabs } from '@/components/neo';
import { Modal } from '@/components/ui/Modal';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { toast } from '@/store/toast';
import { canEditProject, canEditTask } from '@/projects/access';
import { taskKey } from '@/projects/metrics';
import { useProjects } from '@/projects/store';
import type { Attachment, Project, Task } from '@/projects/types';
import { pushUndo, useActor, useProjectsUI, useUsersMap } from '../ctx';
import { DrivePicker, LinkForm } from '../TaskPanel';

type Scope = 'all' | 'project' | 'tasks';
type Kind = 'all' | 'docs' | 'sheets' | 'slides' | 'media' | 'links';

const FILE_TONE: Record<string, string> = { doc: '#60a5fa', sheet: '#34d399', slides: '#fbbf24', pdf: '#fb7185', image: '#f472b6', video: '#a78bfa', code: '#22d3ee', archive: '#fb923c', link: '#94a3b8' };
const KIND_LABEL: Record<string, string> = { doc: 'Document', sheet: 'Spreadsheet', slides: 'Slides', pdf: 'PDF', image: 'Image', video: 'Video', code: 'Code', archive: 'Archive', link: 'Link' };

function kindIcon(kind: string): ReactNode {
  switch (kind) {
    case 'sheet':
      return <FileSpreadsheet />;
    case 'slides':
      return <Presentation />;
    case 'image':
      return <FileImage />;
    case 'video':
      return <FileVideo />;
    case 'code':
      return <FileCode />;
    case 'archive':
      return <Archive />;
    case 'link':
      return <Link2 />;
    default:
      return <FileText />;
  }
}

function matchesKind(a: Attachment, k: Kind) {
  if (k === 'all') return true;
  if (k === 'docs') return a.fileKind === 'doc' || a.fileKind === 'pdf';
  if (k === 'sheets') return a.fileKind === 'sheet';
  if (k === 'slides') return a.fileKind === 'slides';
  if (k === 'media') return a.fileKind === 'image' || a.fileKind === 'video';
  return a.kind === 'link';
}

interface Row {
  a: Attachment;
  task?: Task;
}

export function FilesView({ project, tasks }: { project: Project; tasks: Task[] }) {
  const actor = useActor();
  const store = useProjects.getState;
  const [scope, setScope] = useState<Scope>('all');
  const [kind, setKind] = useState<Kind>('all');
  const [q, setQ] = useState('');
  const [drive, setDrive] = useState(false);
  const [link, setLink] = useState(false);
  const [dropping, setDropping] = useState(false);
  const canEdit = actor ? canEditProject(project, actor) : false;

  const pinned: Row[] = useMemo(() => [...project.attachments].sort((a, b) => b.at - a.at).map((a) => ({ a })), [project.attachments]);
  const fromTasks: Row[] = useMemo(
    () =>
      tasks
        .flatMap((t) => t.attachments.map((a) => ({ a, task: t })))
        .sort((x, y) => y.a.at - x.a.at),
    [tasks],
  );

  const filter = (rows: Row[]) => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => matchesKind(r.a, kind) && (!s || `${r.a.name} ${r.task?.title ?? ''} ${r.a.url ?? ''}`.toLowerCase().includes(s)));
  };
  const shownPinned = scope === 'tasks' ? [] : filter(pinned);
  const shownTasks = scope === 'project' ? [] : filter(fromTasks);
  const total = pinned.length + fromTasks.length;

  const attach = (att: Omit<Attachment, 'id' | 'addedBy' | 'at'>) => {
    const r = store().addProjectAttachment(project.id, att);
    if (r.ok) toast.success('Pinned to project', att.name);
    else toast.error(r.error);
    return r.ok;
  };

  const removePinned = (a: Attachment) => {
    const r = store().removeProjectAttachment(project.id, a.id);
    if (!r.ok) return toast.error(r.error);
    pushUndo(`Removed “${a.name.slice(0, 40)}”`, () => store().addProjectAttachment(project.id, { kind: a.kind, fileId: a.fileId, url: a.url, name: a.name, fileKind: a.fileKind }));
  };
  const removeFromTask = (t: Task, a: Attachment) => {
    const r = store().removeAttachment(t.id, a.id);
    if (!r.ok) return toast.error(r.error);
    pushUndo(`Removed “${a.name.slice(0, 40)}”`, () => store().addAttachment(t.id, { kind: a.kind, fileId: a.fileId, url: a.url, name: a.name, fileKind: a.fileKind }));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDropping(false);
    if (!canEdit) return toast.error('You have view-only access to this project.');
    if (e.dataTransfer.files.length) return toast.info('Upload files to Helix Drive first', 'Then attach them here with “Attach from Drive”.');
    const raw = (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')).trim().split('\n')[0];
    if (!/^https?:\/\//i.test(raw)) return toast.error('Drop a link that starts with http:// or https://');
    attach({ kind: 'link', url: raw, name: raw.replace(/^https?:\/\//, '').slice(0, 60), fileKind: 'link' });
  };

  return (
    <div
      className={cx('neo-pad pj-files', dropping && 'is-dropping')}
      onDragOver={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false);
      }}
      onDrop={onDrop}
    >
      <div className="pj-files__bar">
        <NeoTabs
          label="Attachment scope"
          value={scope}
          onChange={setScope}
          items={[
            { value: 'all', label: 'All', count: total },
            { value: 'project', label: 'Pinned', icon: <Pin />, count: pinned.length },
            { value: 'tasks', label: 'From tasks', icon: <Paperclip />, count: fromTasks.length },
          ]}
        />
        <NeoSearch value={q} onChange={setQ} size="sm" placeholder="Search files" className="pj-files__search" label="Search files" />
        <span className="grow" />
        {canEdit && (
          <>
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => setLink(true)}>
              <Link2 /> <span className="neo-btn__label">Add link</span>
            </button>
            <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => setDrive(true)} data-qa="files-attach-drive">
              <HardDrive /> <span className="neo-btn__label">Attach from Drive</span>
            </button>
          </>
        )}
      </div>
      <div className="pj-files__kinds" role="group" aria-label="File type">
        {(['all', 'docs', 'sheets', 'slides', 'media', 'links'] as Kind[]).map((k) => (
          <button key={k} type="button" className={cx('pj-fchip pj-fchip--sm', kind === k && 'is-on')} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {k === 'all' ? 'Any type' : k[0].toUpperCase() + k.slice(1)}
          </button>
        ))}
      </div>

      {total === 0 ? (
        <NeoEmpty
          icon={<Paperclip />}
          title="No files yet"
          action={
            canEdit ? (
              <button type="button" className="neo-btn neo-btn--plasma" onClick={() => setDrive(true)}>
                <HardDrive /> Attach from Drive
              </button>
            ) : undefined
          }
        >
          Pin specs, decks and sheets here so the whole team finds them in one place. Files attached to tasks show up too. Tip: drop a link anywhere on this page.
        </NeoEmpty>
      ) : shownPinned.length + shownTasks.length === 0 ? (
        <NeoEmpty
          compact
          icon={<Paperclip />}
          title="No files match"
          action={
            <button
              type="button"
              className="neo-btn neo-btn--soft neo-btn--sm"
              onClick={() => {
                setQ('');
                setKind('all');
                setScope('all');
              }}
            >
              Clear filters
            </button>
          }
        >
          Try another search or file type.
        </NeoEmpty>
      ) : (
        <>
          {shownPinned.length > 0 && (
            <section className="pj-files__sec" aria-label="Pinned to project">
              <div className="neo-section-head">
                <Pin className="pj-ico" />
                <h2 className="neo-title">Pinned to project</h2>
                <span className="neo-count">{shownPinned.length}</span>
              </div>
              <ul className="pj-filegrid">
                {shownPinned.map((r) => (
                  <FileCard key={r.a.id} row={r} project={project} onRemove={canEdit ? () => removePinned(r.a) : undefined} />
                ))}
              </ul>
            </section>
          )}
          {shownTasks.length > 0 && (
            <section className="pj-files__sec" aria-label="Attached to tasks">
              <div className="neo-section-head">
                <Paperclip className="pj-ico" />
                <h2 className="neo-title">From tasks</h2>
                <span className="neo-count">{shownTasks.length}</span>
              </div>
              <ul className="pj-filegrid">
                {shownTasks.map((r) => (
                  <FileCard
                    key={`${r.task!.id}-${r.a.id}`}
                    row={r}
                    project={project}
                    onRemove={actor && (canEditTask(r.task!, project, actor) || r.a.addedBy === actor.id) ? () => removeFromTask(r.task!, r.a) : undefined}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {dropping && (
        <div className="pj-files__drop" aria-hidden="true">
          <Link2 />
          <span>Drop a link to pin it to {project.name}</span>
        </div>
      )}

      <DrivePicker open={drive} onClose={() => setDrive(false)} onPick={(f) => attach({ kind: 'drive', fileId: f.id, name: f.name, fileKind: f.kind })} />
      <Modal open={link} onClose={() => setLink(false)} title="Add a link" subtitle={`Pinned to ${project.name} for everyone who can see it.`} width={460} className="neo-portal pj-modal">
        <LinkForm
          onCancel={() => setLink(false)}
          onAdd={(name, url) => {
            if (attach({ kind: 'link', url, name, fileKind: 'link' })) setLink(false);
          }}
        />
      </Modal>
    </div>
  );
}

function FileCard({ row, project, onRemove }: { row: Row; project: Project; onRemove?: () => void }) {
  const { a, task } = row;
  const navigate = useNavigate();
  const ui = useProjectsUI();
  const users = useUsersMap();
  const open = () => {
    if (a.kind === 'drive' && a.fileId) navigate(`/drive/file/${a.fileId}`);
    else if (a.url) window.open(a.url, '_blank', 'noopener');
  };
  const host = a.kind === 'drive' ? 'Helix Drive' : (a.url ?? '').replace(/^https?:\/\//, '').split('/')[0];
  return (
    <li className="pj-file neo-spot" style={{ ['--fc' as string]: FILE_TONE[a.fileKind] ?? '#94a3b8' }}>
      <button type="button" className="pj-file__main" onClick={open} title={a.kind === 'drive' ? 'Open in Helix Drive' : a.url}>
        <span className="pj-file__icon">{kindIcon(a.fileKind)}</span>
        <span className="pj-file__text">
          <span className="pj-file__name">{a.name}</span>
          <span className="pj-file__meta">
            {KIND_LABEL[a.fileKind] ?? a.fileKind} · {host}
          </span>
        </span>
        <ExternalLink className="pj-file__go" />
      </button>
      <div className="pj-file__foot">
        <span className="pj-file__who truncate">
          {users.get(a.addedBy)?.name.split(' ')[0] ?? 'Someone'} · {relativeTime(a.at)}
        </span>
        {task && (
          <button type="button" className="pj-file__task" onClick={() => ui.openTask(task.id)} title={task.title}>
            <span className="neo-mono">{taskKey(project, task)}</span>
            <span className="truncate">{task.title}</span>
          </button>
        )}
        {onRemove && (
          <button type="button" className="neo-iconbtn neo-iconbtn--sm pj-file__rm" aria-label={`Remove ${a.name}`} data-tip="Remove" onClick={onRemove}>
            <X />
          </button>
        )}
      </div>
    </li>
  );
}
