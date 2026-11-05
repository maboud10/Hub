/**
 * File previews for Helix Drive: a small markdown renderer, a sheet grid, a
 * mini slide deck, generated image heroes and code blocks — plus the inline
 * editors used by editors to save a new version.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ChevronLeft, ChevronRight, ExternalLink, Minus, Plus, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { cx } from '@/lib/cx';
import { KIND_META, formatBytes } from '@/drive/constants';
import { useItem } from '@/drive/selectors';
import { itemLink } from '@/drive/store';
import type { DriveItem, FilePreview } from '@/drive/types';
import { KindTile, SensitivityPill } from './shared';

// ───────────────────────── markdown ─────────────────────────

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_)/g;

export function renderInline(text: string): ReactNode {
  const parts = text.split(INLINE);
  return parts.map((part, i) => {
    if (!part) return null;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) return <em key={i}>{part.slice(1, -1)}</em>;
    return <span key={i}>{part}</span>;
  });
}

type Block =
  | { t: 'h'; level: number; text: string }
  | { t: 'p'; text: string }
  | { t: 'ul'; items: { text: string; task?: boolean; done?: boolean }[] }
  | { t: 'ol'; items: string[] }
  | { t: 'code'; lang?: string; code: string }
  | { t: 'table'; head: string[]; rows: string[][] }
  | { t: 'quote'; text: string }
  | { t: 'hr' };

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
const isSeparatorRow = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim() || undefined;
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i += 1;
      blocks.push({ t: 'code', lang, code: buf.join('\n') });
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ t: 'h', level: h[1].length, text: h[2] });
      i += 1;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ t: 'hr' });
      i += 1;
      continue;
    }
    if (line.trim().startsWith('|') && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(splitRow(lines[i++]));
      blocks.push({ t: 'table', head, rows });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: { text: string; task?: boolean; done?: boolean }[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const raw = lines[i].replace(/^\s*[-*]\s+/, '');
        const task = /^\[( |x|X)\]\s*/.exec(raw);
        items.push(task ? { text: raw.slice(task[0].length), task: true, done: task[1].toLowerCase() === 'x' } : { text: raw });
        i += 1;
      }
      blocks.push({ t: 'ul', items });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ''));
      blocks.push({ t: 'ol', items });
      continue;
    }
    if (line.trim().startsWith('>')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push({ t: 'quote', text: buf.join(' ') });
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\s*[-*]\s+|\s*\d+[.)]\s+|\s*>|\s*\|)/.test(lines[i])) buf.push(lines[i++]);
    if (!buf.length) buf.push(lines[i++]);
    blocks.push({ t: 'p', text: buf.join(' ') });
  }
  return blocks;
}

export function MarkdownView({ content, className }: { content: string; className?: string }) {
  const blocks = useMemo(() => parseMarkdown(content), [content]);
  return (
    <div className={cx('dr-md', className)}>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'h': {
            const Tag = (`h${Math.min(4, b.level + 1)}` as 'h2' | 'h3' | 'h4');
            return (
              <Tag key={i} className={`dr-md__h dr-md__h--${b.level}`}>
                {renderInline(b.text)}
              </Tag>
            );
          }
          case 'p':
            return <p key={i}>{renderInline(b.text)}</p>;
          case 'ul':
            return (
              <ul key={i} className={cx(b.items.some((x) => x.task) && 'dr-md__tasks')}>
                {b.items.map((it, j) => (
                  <li key={j} className={cx(it.task && 'is-task', it.done && 'is-done')}>
                    {it.task && <span className="dr-md__box" aria-hidden="true">{it.done ? '✓' : ''}</span>}
                    {renderInline(it.text)}
                  </li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it)}</li>
                ))}
              </ol>
            );
          case 'code':
            return (
              <pre key={i} className="dr-md__code">
                {b.lang && <span className="dr-md__lang">{b.lang}</span>}
                <code>{b.code}</code>
              </pre>
            );
          case 'table':
            return (
              <div key={i} className="dr-md__tablewrap">
                <table>
                  <thead>
                    <tr>
                      {b.head.map((c, j) => (
                        <th key={j}>{renderInline(c)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, k) => (
                          <td key={k}>{renderInline(c)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'quote':
            return <blockquote key={i}>{renderInline(b.text)}</blockquote>;
          case 'hr':
            return <hr key={i} />;
        }
      })}
    </div>
  );
}

// ───────────────────────── table (sheet) ─────────────────────────

const colLetter = (n: number) => {
  let s = '';
  let x = n;
  do {
    s = String.fromCharCode(65 + (x % 26)) + s;
    x = Math.floor(x / 26) - 1;
  } while (x >= 0);
  return s;
};

export function SheetView({ rows, editable, onChange }: { rows: string[][]; editable?: boolean; onChange?: (rows: string[][]) => void }) {
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const set = (r: number, c: number, v: string) => {
    if (!onChange) return;
    const next = rows.map((row) => [...row]);
    while (next[r].length < cols) next[r].push('');
    next[r][c] = v;
    onChange(next);
  };
  const addRow = () => onChange?.([...rows, Array.from({ length: cols }, () => '')]);
  const addCol = () => onChange?.(rows.map((r) => [...r, '']));
  const removeRow = (r: number) => onChange?.(rows.filter((_, i) => i !== r));
  return (
    <div className="dr-sheetwrap">
      <table className={cx('dr-sheet', editable && 'is-editing')}>
        <thead>
          <tr>
            <th className="dr-sheet__corner" />
            {Array.from({ length: cols }, (_, c) => (
              <th key={c}>{colLetter(c)}</th>
            ))}
            {editable && (
              <th className="dr-sheet__add">
                <button type="button" className="icon-btn icon-btn--sm" onClick={addCol} aria-label="Add column">
                  <Plus />
                </button>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className={cx(r === 0 && 'is-header')}>
              <th className="dr-sheet__rownum">{r + 1}</th>
              {Array.from({ length: cols }, (_, c) => (
                <td key={c}>{editable ? <input value={row[c] ?? ''} aria-label={`Cell ${colLetter(c)}${r + 1}`} onChange={(e) => set(r, c, e.target.value)} /> : row[c] ?? ''}</td>
              ))}
              {editable && (
                <td className="dr-sheet__add">
                  {rows.length > 1 && (
                    <button type="button" className="icon-btn icon-btn--sm" onClick={() => removeRow(r)} aria-label={`Remove row ${r + 1}`}>
                      <Minus />
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {editable && (
        <button type="button" className="btn btn--sm btn--ghost" onClick={addRow}>
          <Plus /> Add row
        </button>
      )}
    </div>
  );
}

// ───────────────────────── slides ─────────────────────────

export function DeckView({ slides, editable, onChange, accent = KIND_META.slides.color }: { slides: string[]; editable?: boolean; onChange?: (slides: string[]) => void; accent?: string }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (index > slides.length - 1) setIndex(Math.max(0, slides.length - 1));
  }, [slides.length, index]);
  const cur = slides[index] ?? '';
  const rename = (i: number, v: string) => onChange?.(slides.map((s, j) => (j === i ? v : s)));
  const add = () => {
    onChange?.([...slides, `Slide ${slides.length + 1}`]);
    setIndex(slides.length);
  };
  const remove = (i: number) => onChange?.(slides.filter((_, j) => j !== i));
  return (
    <div className="dr-deck" style={{ '--kind': accent } as CSSProperties}>
      <div className="dr-deck__stage">
        <button type="button" className="icon-btn dr-deck__nav" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} aria-label="Previous slide">
          <ChevronLeft />
        </button>
        <div className="dr-deck__slide" aria-live="polite">
          <span className="dr-deck__num">
            {index + 1} / {slides.length}
          </span>
          {editable ? <input className="dr-deck__title-input" value={cur} aria-label="Slide title" onChange={(e) => rename(index, e.target.value)} /> : <h2 className="dr-deck__title">{cur}</h2>}
          <div className="dr-deck__lines" aria-hidden="true">
            <i style={{ width: '72%' }} />
            <i style={{ width: '58%' }} />
            <i style={{ width: '64%' }} />
          </div>
        </div>
        <button type="button" className="icon-btn dr-deck__nav" onClick={() => setIndex((i) => Math.min(slides.length - 1, i + 1))} disabled={index >= slides.length - 1} aria-label="Next slide">
          <ChevronRight />
        </button>
      </div>
      <div className="dr-deck__thumbs">
        {slides.map((s, i) => (
          <button key={i} type="button" className={cx('dr-deck__thumb', i === index && 'is-active')} onClick={() => setIndex(i)} title={s}>
            <span className="dr-deck__thumb-num">{i + 1}</span>
            <span className="truncate">{s || 'Untitled'}</span>
            {editable && slides.length > 1 && (
              <span
                role="button"
                tabIndex={0}
                className="dr-deck__thumb-x"
                aria-label={`Remove slide ${i + 1}`}
                onClick={(e) => {
                  e.stopPropagation();
                  remove(i);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation();
                    remove(i);
                  }
                }}
              >
                <X />
              </span>
            )}
          </button>
        ))}
        {editable && (
          <button type="button" className="dr-deck__thumb dr-deck__thumb--add" onClick={add}>
            <Plus /> Add slide
          </button>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── image & code ─────────────────────────

export function ImageView({ gradient, name, sizeBytes }: { gradient?: [string, string]; name: string; sizeBytes: number }) {
  const [a, b] = gradient ?? ['#38bdf8', '#a78bfa'];
  return (
    <figure className="dr-image" style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}>
      <div className="dr-image__grain" aria-hidden="true" />
      <figcaption>
        <span className="truncate">{name}</span>
        <span className="mono">{formatBytes(sizeBytes)} · generated preview</span>
      </figcaption>
    </figure>
  );
}

export function CodeView({ content, language }: { content: string; language?: string }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  return (
    <div className="dr-codeview">
      <div className="dr-codeview__bar">
        <span className="tag">{language ?? 'text'}</span>
        <span className="text-xs muted">{lines.length} lines</span>
      </div>
      <pre>
        {lines.map((l, i) => (
          <div key={i} className="dr-codeview__line">
            <span className="dr-codeview__num">{i + 1}</span>
            <code>{l || ' '}</code>
          </div>
        ))}
      </pre>
    </div>
  );
}

// ───────────────────────── composite renderer / editor ─────────────────────────

export const isEditablePreview = (p: FilePreview) => p.type === 'markdown' || p.type === 'table' || p.type === 'slides';

export function PreviewRenderer({ item }: { item: DriveItem }) {
  const p = item.preview;
  switch (p.type) {
    case 'markdown':
      return <MarkdownView content={p.content ?? ''} />;
    case 'table':
      return <SheetView rows={p.rows ?? [[]]} />;
    case 'slides':
      return <DeckView slides={p.slides ?? []} />;
    case 'image':
      return <ImageView gradient={p.gradient} name={item.name} sizeBytes={item.sizeBytes} />;
    case 'code':
      return <CodeView content={p.content ?? ''} language={p.language} />;
    default:
      return (
        <div className="dr-nopreview">
          <KindTile kind={item.kind} size={64} />
          <div className="dr-nopreview__title">{KIND_META[item.kind].label}</div>
          <p className="text-sm muted">No inline preview for this file type. {item.kind === 'video' ? 'Download it to play locally.' : ''}</p>
        </div>
      );
  }
}

export function PreviewEditor({ preview, onChange }: { preview: FilePreview; onChange: (p: FilePreview) => void }) {
  switch (preview.type) {
    case 'markdown':
      return (
        <div className="dr-mdedit">
          <textarea className="textarea dr-mdedit__ta" value={preview.content ?? ''} onChange={(e) => onChange({ ...preview, content: e.target.value })} spellCheck aria-label="Document body (markdown)" />
          <div className="dr-mdedit__preview">
            <div className="field-label">Live preview</div>
            <MarkdownView content={preview.content ?? ''} />
          </div>
        </div>
      );
    case 'table':
      return <SheetView rows={preview.rows ?? [['']]} editable onChange={(rows) => onChange({ ...preview, rows })} />;
    case 'slides':
      return <DeckView slides={preview.slides ?? []} editable onChange={(slides) => onChange({ ...preview, slides })} />;
    default:
      return <p className="muted text-sm">This file type can’t be edited inline. Upload a new version instead.</p>;
  }
}

// ───────────────────────── quick preview modal ─────────────────────────

export function QuickPreviewModal({ itemId, open, onClose }: { itemId: string | null; open: boolean; onClose: () => void }) {
  const data = useItem(itemId ?? undefined);
  const navigate = useNavigate();
  if (!data || !data.canView) return null;
  const { item } = data;
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={820}
      className="dr-quickpreview"
      icon={<KindTile kind={item.kind} size={40} />}
      title={item.name}
      subtitle={
        <span className="row row--wrap" style={{ gap: 8 }}>
          <SensitivityPill sensitivity={item.sensitivity} compact />
          <span>
            {KIND_META[item.kind].label} · {formatBytes(item.sizeBytes)}
          </span>
        </span>
      }
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="btn dr-btn-amber"
            onClick={() => {
              onClose();
              navigate(itemLink(item.id));
            }}
          >
            <ExternalLink /> Open
          </button>
        </>
      }
    >
      <PreviewRenderer item={item} />
    </Modal>
  );
}
