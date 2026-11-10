/**
 * Vault: every document in my HR file — newest first (with hue-coded kind
 * labels) or grouped by kind — with kind filters, search, confidential /
 * signature / source badges and a quick upload (only the file name and size
 * are stored).
 */
import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowDownWideNarrow, FileUp, FolderOpen, LayoutGrid, Lock, Search, Signature, Stamp, Upload, X } from 'lucide-react';
import type { DocKind, EmployeeDocument } from '@/hr/types';
import { DOC_KIND_META } from '@/hr/constants';
import { useHr } from '@/hr/store';
import { toast } from '@/store/toast';
import { formatDate } from '@/lib/format';
import { cx } from '@/lib/cx';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, Segmented, Switch } from '@/components/ui/primitives';
import { HrPanel } from '../components/shared';
import { fileSize, KIND_ORDER, SOURCE_LABEL, useMyDocuments } from './model';

interface PickedFile {
  key: number;
  name: string;
  sizeKb: number;
}

const UPLOAD_KINDS: DocKind[] = ['id', 'certificate', 'letter', 'contract', 'other'];
const MAX_KB = 10 * 1024;

export function Vault({ onOpen, onSign, onLetters }: { onOpen: (id: string) => void; onSign: (id: string) => void; onLetters: () => void }) {
  const mine = useMyDocuments();
  const [kind, setKind] = useState<DocKind | 'all'>('all');
  const [view, setView] = useState<'newest' | 'type'>('newest');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    const m = new Map<DocKind, number>();
    for (const d of mine) m.set(d.kind, (m.get(d.kind) ?? 0) + 1);
    return m;
  }, [mine]);
  const kinds = KIND_ORDER.filter((k) => counts.has(k));
  const query = q.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      mine.filter(
        (d) =>
          (kind === 'all' || d.kind === kind) &&
          (!query || [d.title, d.description, d.fileName, DOC_KIND_META[d.kind].label, SOURCE_LABEL[d.source]].some((s) => s?.toLowerCase().includes(query))),
      ),
    [mine, kind, query],
  );
  const groups = useMemo(() => {
    if (view !== 'type' || kind !== 'all') return null;
    return KIND_ORDER.map((k) => ({ kind: k, docs: filtered.filter((d) => d.kind === k) }))
      .filter((g) => g.docs.length)
      .sort((a, b) => b.docs[0].createdAt - a.docs[0].createdAt);
  }, [filtered, kind, view]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    const sizeKb = Math.max(1, Math.round(f.size / 1024));
    if (sizeKb > MAX_KB) {
      toast.error('That file is over 10 MB', 'Try a compressed PDF or a photo.');
      return;
    }
    setPicked({ key: Date.now(), name: f.name, sizeKb });
    setUploadOpen(true);
  };

  return (
    <HrPanel
      className="hr-doc-vault"
      hud="Personal records"
      title="Your document vault"
      sub="Contracts, letters, certificates and IDs — only visible to you and People Ops."
      actions={
        <div className="hr-doc-toolbar__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onLetters}>
            <Stamp aria-hidden="true" /> Get a letter
          </button>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => fileRef.current?.click()}>
            <Upload aria-hidden="true" /> Upload
          </button>
          <input
            ref={fileRef}
            type="file"
            hidden
            accept=".pdf,image/*,.doc,.docx"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      }
    >
      <div className="hr-doc-toolbar">
        <label className="input-wrap hr-doc-search">
          <Search aria-hidden="true" />
          <input className="input" type="search" placeholder="Search your documents" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search your documents" />
          {q && (
            <button type="button" className="icon-btn icon-btn--sm input-trail" aria-label="Clear search" onClick={() => setQ('')}>
              <X />
            </button>
          )}
        </label>
        {kind === 'all' && mine.length > 1 && (
          <Segmented
            label="Arrange documents"
            value={view}
            onChange={setView}
            options={[
              { value: 'newest', label: 'Newest', icon: <ArrowDownWideNarrow aria-hidden="true" /> },
              { value: 'type', label: 'By type', icon: <LayoutGrid aria-hidden="true" /> },
            ]}
          />
        )}
      </div>
      <div className="hr-doc-filterbar">
        <div className="chips hr-doc-chips" role="group" aria-label="Filter by type">
          <button type="button" className={cx('chip', kind === 'all' && 'is-active')} aria-pressed={kind === 'all'} onClick={() => setKind('all')}>
            All <span className="count">{mine.length}</span>
          </button>
          {kinds.map((k) => {
            const Icon = DOC_KIND_META[k].icon;
            return (
              <button key={k} type="button" className={cx('chip', kind === k && 'is-active')} aria-pressed={kind === k} onClick={() => setKind(k)}>
                <Icon aria-hidden="true" /> {DOC_KIND_META[k].label}
                <span className="count">{counts.get(k)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card card--flat">
          <EmptyState
            icon={mine.length ? <Search /> : <FolderOpen />}
            title={mine.length ? 'Nothing matches' : 'Your vault is empty'}
            action={
              mine.length ? (
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => {
                    setQ('');
                    setKind('all');
                  }}
                >
                  Clear filters
                </button>
              ) : (
                <button type="button" className="btn btn--sm btn--primary" onClick={() => fileRef.current?.click()}>
                  <FileUp aria-hidden="true" /> Upload a document
                </button>
              )
            }
          >
            {mine.length ? 'Try another word or clear the filters.' : 'Contracts, letters and certificates appear here automatically. You can add your own too.'}
          </EmptyState>
        </div>
      ) : groups ? (
        <div className="hr-doc-groups">
          {groups.map((g) => {
            const meta = DOC_KIND_META[g.kind];
            const Icon = meta.icon;
            return (
              <section key={g.kind} className="hr-doc-group" aria-label={meta.label}>
                <h3 className="hr-doc-group__title" style={{ '--doc-h': meta.hue } as CSSProperties}>
                  <Icon aria-hidden="true" /> {g.kind === 'nda' ? 'Agreements' : g.kind === 'id' ? 'Identity' : `${meta.label}s`}
                  <span className="count">{g.docs.length}</span>
                </h3>
                <div className="hr-doc-group__list">
                  {g.docs.map((d) => (
                    <DocTile key={d.id} doc={d} onOpen={onOpen} onSign={onSign} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="hr-doc-grid">
          {filtered.map((d) => (
            <DocTile key={d.id} doc={d} onOpen={onOpen} onSign={onSign} showKind={kind === 'all'} />
          ))}
        </div>
      )}
      {picked && <UploadModal key={picked.key} file={picked} open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={onOpen} />}
    </HrPanel>
  );
}

function DocTile({ doc, onOpen, onSign, showKind }: { doc: EmployeeDocument; onOpen: (id: string) => void; onSign: (id: string) => void; showKind?: boolean }) {
  const meta = DOC_KIND_META[doc.kind];
  const Icon = meta.icon;
  const unsigned = !!doc.signature?.required && !doc.signature.signedAt;
  return (
    <article className={cx('hr-doc-tile', unsigned && 'is-unsigned')} style={{ '--doc-h': meta.hue } as CSSProperties}>
      <button type="button" className="hr-doc-tile__open" onClick={() => onOpen(doc.id)} aria-label={`Open ${doc.title}`}>
        <span className="hr-doc-tile__page" aria-hidden="true">
          <Icon />
        </span>
        <span className="hr-doc-tile__body">
          {showKind && <span className="hr-doc-tile__kind">{meta.label}</span>}
          <span className="hr-doc-tile__title">{doc.title}</span>
          {(doc.description || doc.fileName) && <span className="hr-doc-tile__desc">{doc.description ?? `${doc.fileName}${doc.sizeKb ? ` · ${fileSize(doc.sizeKb)}` : ''}`}</span>}
          <span className="hr-doc-tile__meta">
            <span className={cx('hr-doc-src', `is-${doc.source}`)}>{SOURCE_LABEL[doc.source]}</span>
            <span>{formatDate(doc.createdAt)}</span>
            {doc.confidential && (
              <span className="hr-doc-lock" title="Confidential: only you and People Ops">
                <Lock aria-hidden="true" /> Confidential
              </span>
            )}
          </span>
        </span>
      </button>
      {doc.signature?.required && (
        <div className="hr-doc-tile__sig">
          {unsigned ? (
            <button type="button" className="btn btn--primary btn--sm" onClick={() => onSign(doc.id)}>
              <Signature aria-hidden="true" /> Review &amp; sign
            </button>
          ) : (
            <span className="hr-doc-signed">
              <span className="hr-doc-script">{doc.signature.signedName}</span>
              <small>Signed {doc.signature.signedAt ? formatDate(doc.signature.signedAt) : ''}</small>
            </span>
          )}
        </div>
      )}
    </article>
  );
}

function UploadModal({ file, open, onClose, onUploaded }: { file: PickedFile; open: boolean; onClose: () => void; onUploaded: (id: string) => void }) {
  const uploadDocument = useHr((s) => s.uploadDocument);
  const guess: DocKind = /passport|visa|emirates|id\b|identity|licen[cs]e/i.test(file.name) ? 'id' : /certif|diploma|degree|award/i.test(file.name) ? 'certificate' : 'other';
  const [title, setTitle] = useState(() =>
    file.name
      .replace(/\.[^.]+$/, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\w/, (c) => c.toUpperCase()),
  );
  const [kind, setKind] = useState<DocKind>(guess);
  const [confidential, setConfidential] = useState(guess === 'id');
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const res = uploadDocument({ title, kind, fileName: file.name, sizeKb: file.sizeKb, confidential });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.result(res);
    onClose();
    if (res.id) onUploaded(res.id);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={520}
      title="Add to your vault"
      subtitle="Only you and People Ops can see your documents."
      icon={
        <span className="hr-doc-kind" aria-hidden="true">
          <FileUp />
        </span>
      }
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={submit} disabled={title.trim().length < 2}>
            <Upload aria-hidden="true" /> Upload
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="hr-doc-upfile">
          <FileUp aria-hidden="true" />
          <span className="truncate">{file.name}</span>
          <small>{fileSize(file.sizeKb)}</small>
        </div>
        <label className="field">
          <span className="field-label">Name</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Passport copy" />
        </label>
        <label className="field">
          <span className="field-label">Type</span>
          <select
            className="select"
            value={kind}
            onChange={(e) => {
              const k = e.target.value as DocKind;
              setKind(k);
              if (k === 'id') setConfidential(true);
            }}
          >
            {UPLOAD_KINDS.map((k) => (
              <option key={k} value={k}>
                {DOC_KIND_META[k].label}
              </option>
            ))}
          </select>
        </label>
        <div className="hr-doc-switch-row">
          <span>
            <b>Confidential</b>
            <small>Marked with a lock. Only you and People Ops can ever open it.</small>
          </span>
          <Switch checked={confidential} onChange={setConfidential} label="Confidential" />
        </div>
        {error && (
          <p className="hr-doc-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
