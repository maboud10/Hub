/**
 * Native-feeling previews: Doc (markdown-lite), Sheet (grid + formula bar), Slides (rail + stage),
 * PDF (paged), Image (upload or generative art), Code (line numbers + colouring), Video/Audio
 * (player mock), Archive (file list) — plus the Restricted watermark and line diffs.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, File, Folder, Minus, Pause, Play, Plus } from 'lucide-react';
import { cx } from '@/lib/cx';
import type { Content, Item, Slide } from '@/drive/types';
import { formatBytes, hashStr, kindFromFile } from '@/drive/meta';
import { parseBlocks, parseInline, type Block } from '@/drive/content';
import { colName, evaluateSheet } from '@/drive/sheet';
import { ArtSvg, KIND_ICON, codeTokens } from './bits';

/* ---------------- inline + doc ---------------- */

export function InlineText({ text, names }: { text: string; names?: string[] }) {
  return (
    <>
      {parseInline(text, names).map((s, i) => {
        if (s.t === 'b') return <strong key={i}>{s.v}</strong>;
        if (s.t === 'i') return <em key={i}>{s.v}</em>;
        if (s.t === 'code') return <code key={i}>{s.v}</code>;
        if (s.t === 'mention')
          return (
            <span key={i} className="dv-mention">
              @{s.v}
            </span>
          );
        return <span key={i}>{s.v}</span>;
      })}
    </>
  );
}

function BlockView({ b, names }: { b: Block; names?: string[] }) {
  switch (b.t) {
    case 'h1':
      return <h1>{b.text}</h1>;
    case 'h2':
      return <h2>{b.text}</h2>;
    case 'h3':
      return <h3>{b.text}</h3>;
    case 'hr':
      return <hr />;
    case 'quote':
      return (
        <blockquote>
          <InlineText text={b.text} names={names} />
        </blockquote>
      );
    case 'code':
      return (
        <pre>
          <code>{b.text}</code>
        </pre>
      );
    case 'table':
      return (
        <div className="dv-doc__tablewrap">
          <table>
            <thead>
              <tr>
                {b.rows[0]?.map((c, i) => (
                  <th key={i}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.slice(1).map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>
                      {/^#[0-9a-f]{6}$/i.test(c) && <i className="dv-swatch" style={{ background: c }} />}
                      <InlineText text={c} names={names} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'ul':
    case 'ol': {
      const Tag = b.t;
      return (
        <Tag className={b.items.some((i) => i.checked !== undefined) ? 'is-checklist' : undefined}>
          {b.items.map((it, i) => (
            <li key={i} className={it.checked ? 'is-done' : undefined}>
              {it.checked !== undefined && <span className={cx('dv-cb', it.checked && 'is-on')} aria-label={it.checked ? 'Done' : 'Open'} />}
              <InlineText text={it.text} names={names} />
            </li>
          ))}
        </Tag>
      );
    }
    default:
      return (
        <p>
          <InlineText text={b.text} names={names} />
        </p>
      );
  }
}

export function DocView({ text, names, compact }: { text: string; names?: string[]; compact?: boolean }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <article className={cx('dv-doc', compact && 'dv-doc--compact')}>
      {blocks.map((b, i) => (
        <BlockView key={i} b={b} names={names} />
      ))}
    </article>
  );
}

/* ---------------- sheet ---------------- */

export function SheetView({ rows }: { rows: string[][] }) {
  const vals = useMemo(() => evaluateSheet(rows), [rows]);
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const [sel, setSel] = useState<{ r: number; c: number }>({ r: 1, c: Math.min(1, cols - 1) });
  const raw = rows[sel.r]?.[sel.c] ?? '';
  return (
    <div className="dv-sheet">
      <div className="dv-sheet__bar">
        <span className="dv-sheet__ref neo-mono">
          {colName(sel.c)}
          {sel.r + 1}
        </span>
        <span className="dv-sheet__fx">ƒx</span>
        <span className="dv-sheet__formula neo-mono">{raw || ' '}</span>
      </div>
      <div className="dv-sheet__scroll">
        <table className="dv-sheet__grid">
          <thead>
            <tr>
              <th className="dv-sheet__corner" />
              {Array.from({ length: cols }, (_, c) => (
                <th key={c} className={cx(sel.c === c && 'is-sel')}>
                  {colName(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vals.map((r, ri) => (
              <tr key={ri} className={cx(ri === 0 && 'is-head', /^total$/i.test(rows[ri]?.[0] ?? '') || /^total$/i.test(rows[ri]?.[1] ?? '') ? 'is-total' : undefined)}>
                <th className={cx(sel.r === ri && 'is-sel')}>{ri + 1}</th>
                {Array.from({ length: cols }, (_, ci) => {
                  const v = r[ci];
                  return (
                    <td
                      key={ci}
                      className={cx(v?.num !== null && v?.num !== undefined && ri > 0 && 'is-num', v?.formula && 'is-fx', v?.error && 'is-err', sel.r === ri && sel.c === ci && 'is-active')}
                      onClick={() => setSel({ r: ri, c: ci })}
                      title={v?.formula}
                    >
                      {v?.value ?? ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- slides ---------------- */

function SlideFace({ s, hue, index, total, mini }: { s: Slide; hue: number; index: number; total: number; mini?: boolean }) {
  return (
    <div className={cx('dv-slideface', `dv-slideface--${s.kind ?? 'bullets'}`, mini && 'is-mini')} style={{ '--h': (hue + index * 9) % 360 } as CSSProperties}>
      {s.kind === 'stat' ? (
        <>
          <div className="dv-slideface__eyebrow">{s.title}</div>
          <div className="dv-slideface__stat">{s.stat}</div>
          {s.body?.[0] && <div className="dv-slideface__sub">{s.body[0]}</div>}
        </>
      ) : s.kind === 'quote' ? (
        <>
          <div className="dv-slideface__quote">{s.title}</div>
          {s.body?.[0] && <div className="dv-slideface__sub">{s.body[0]}</div>}
        </>
      ) : s.kind === 'title' ? (
        <>
          <div className="dv-slideface__title">{s.title}</div>
          {s.body?.[0] && <div className="dv-slideface__sub">{s.body[0]}</div>}
        </>
      ) : (
        <>
          <div className="dv-slideface__h">{s.title}</div>
          <ul>
            {(s.body ?? []).map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </>
      )}
      {!mini && (
        <span className="dv-slideface__num">
          {index + 1} / {total}
        </span>
      )}
    </div>
  );
}

export function SlidesView({ slides, seed }: { slides: Slide[]; seed: string }) {
  const [i, setI] = useState(0);
  const hue = hashStr(seed) % 360;
  const cur = Math.min(i, slides.length - 1);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (document.querySelector('.modal, .sheet')) return;
      if (e.key === 'ArrowRight') setI((v) => Math.min(slides.length - 1, v + 1));
      if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slides.length]);
  return (
    <div className="dv-slides">
      <div className="dv-slides__rail" role="tablist" aria-label="Slides">
        {slides.map((s, k) => (
          <button key={k} type="button" role="tab" aria-selected={k === cur} className={cx('dv-slides__thumb', k === cur && 'is-on')} onClick={() => setI(k)}>
            <span className="dv-slides__n">{k + 1}</span>
            <SlideFace s={s} hue={hue} index={k} total={slides.length} mini />
          </button>
        ))}
      </div>
      <div className="dv-slides__stage">
        <SlideFace s={slides[cur]} hue={hue} index={cur} total={slides.length} />
        <div className="dv-slides__nav">
          <button type="button" className="neo-iconbtn" onClick={() => setI(Math.max(0, cur - 1))} disabled={cur === 0} aria-label="Previous slide">
            <ChevronLeft />
          </button>
          <span className="neo-mono neo-faint">
            {cur + 1} / {slides.length}
          </span>
          <button type="button" className="neo-iconbtn" onClick={() => setI(Math.min(slides.length - 1, cur + 1))} disabled={cur === slides.length - 1} aria-label="Next slide">
            <ChevronRight />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- pdf ---------------- */

export function PdfView({ pages, name }: { pages: { heading: string; body: string[] }[]; name: string }) {
  const [zoom, setZoom] = useState(1);
  return (
    <div className="dv-pdf">
      <div className="dv-pdf__tools">
        <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.1).toFixed(1)))} aria-label="Zoom out">
          <Minus />
        </button>
        <span className="neo-mono neo-faint">{Math.round(zoom * 100)}%</span>
        <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(1)))} aria-label="Zoom in">
          <Plus />
        </button>
        <span className="neo-faint text-xs">{pages.length} pages</span>
      </div>
      <div className="dv-pdf__pages" style={{ '--zoom': zoom } as CSSProperties}>
        {pages.map((p, i) => (
          <section key={i} className="dv-pdf__page" aria-label={`Page ${i + 1}`}>
            {i === 0 && <div className="dv-pdf__doc">{name.replace(/\.pdf$/i, '')}</div>}
            <h2>{p.heading}</h2>
            {p.body.map((t, j) => (
              <p key={j}>{t}</p>
            ))}
            <div className="dv-pdf__filler" aria-hidden="true">
              {Array.from({ length: 6 }, (_, k) => (
                <i key={k} style={{ width: `${62 + ((i * 7 + k * 13) % 34)}%` }} />
              ))}
            </div>
            <span className="dv-pdf__no">{i + 1}</span>
          </section>
        ))}
      </div>
    </div>
  );
}

/* ---------------- image / code / media / archive ---------------- */

export function ImageView({ item, content }: { item: Item; content: Extract<Content, { type: 'image' }> }) {
  const [zoom, setZoom] = useState(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(content.w ? { w: content.w, h: content.h } : null);
  return (
    <div className={cx('dv-image', zoom && 'is-zoom')}>
      <button type="button" className="dv-image__frame" onClick={() => setZoom((z) => !z)} aria-label={zoom ? 'Fit to screen' : 'Zoom in'}>
        {content.src ? (
          <img src={content.src} alt={item.name} onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
        ) : (
          <ArtSvg hue={content.hue} motif={content.motif} seed={hashStr(item.id)} className="dv-image__art" />
        )}
      </button>
      <div className="dv-image__meta neo-mono">
        {dims ? `${dims.w} × ${dims.h}` : 'Generated preview'} · {formatBytes(item.size)}
      </div>
    </div>
  );
}

export function CodeView({ text, lang }: { text: string; lang: string }) {
  const lines = text.split('\n');
  return (
    <div className="dv-code">
      <div className="dv-code__head">
        <span className="dv-code__dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="neo-mono">{lang}</span>
        <span className="neo-faint text-xs">{lines.length} lines</span>
      </div>
      <pre className="dv-code__body">
        {lines.map((l, i) => (
          <div key={i} className="dv-code__line">
            <span className="dv-code__ln">{i + 1}</span>
            <code>
              {codeTokens(l, lang).map((t, j) => (
                <span key={j} className={t.c ? `tk-${t.c}` : undefined}>
                  {t.t}
                </span>
              ))}
              {l === '' ? ' ' : null}
            </code>
          </div>
        ))}
      </pre>
    </div>
  );
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function MediaView({ item, content }: { item: Item; content: Extract<Content, { type: 'media' }> }) {
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      setT((v) => {
        const nv = v + ((now - last) / 1000) * 8;
        if (nv >= content.duration) {
          setPlaying(false);
          return content.duration;
        }
        return nv;
      });
      last = now;
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, content.duration]);
  const seed = hashStr(item.id);
  const p = content.duration ? t / content.duration : 0;
  const isAudio = item.kind === 'audio';
  return (
    <div className={cx('dv-media', isAudio && 'dv-media--audio')}>
      <div className="dv-media__screen">
        {isAudio ? (
          <div className="dv-media__wave" style={{ '--h': content.hue } as CSSProperties}>
            {Array.from({ length: 72 }, (_, i) => (
              <i key={i} className={i / 72 <= p ? 'is-on' : undefined} style={{ height: `${16 + (((seed >> (i % 24)) ^ (i * 53)) % 78)}%` }} />
            ))}
          </div>
        ) : (
          <ArtSvg hue={content.hue} motif="wave" seed={seed} className={cx('dv-media__art', playing && 'is-playing')} />
        )}
        <button type="button" className="dv-media__big" onClick={() => setPlaying((v) => !v)} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause /> : <Play />}
        </button>
      </div>
      <div className="dv-media__controls">
        <button type="button" className="neo-iconbtn" onClick={() => setPlaying((v) => !v)} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause /> : <Play />}
        </button>
        <span className="neo-mono text-xs">{fmt(t)}</span>
        <input
          type="range"
          className="dv-media__seek"
          min={0}
          max={content.duration}
          step={1}
          value={Math.round(t)}
          onChange={(e) => setT(Number(e.target.value))}
          aria-label="Seek"
          style={{ '--p': `${p * 100}%` } as CSSProperties}
        />
        <span className="neo-mono text-xs neo-faint">{fmt(content.duration)}</span>
      </div>
      {content.chapters && (
        <div className="dv-media__chapters">
          {content.chapters.map((c, i) => {
            const at = (content.duration / content.chapters!.length) * i;
            return (
              <button key={c} type="button" className={cx('neo-chip', t >= at && t < at + content.duration / content.chapters!.length && 'is-on')} data-tone="slate" onClick={() => setT(at)}>
                <span className="neo-mono">{fmt(at)}</span> {c}
              </button>
            );
          })}
        </div>
      )}
      <p className="dv-media__note neo-faint text-xs">Preview player — playback is simulated in the demo.</p>
    </div>
  );
}

export function ArchiveView({ entries }: { entries: { path: string; size: number }[] }) {
  const total = entries.reduce((s, e) => s + e.size, 0);
  const tree = useMemo(() => {
    const out: { depth: number; name: string; size?: number; folder: boolean; key: string }[] = [];
    const seen = new Set<string>();
    for (const e of [...entries].sort((a, b) => a.path.localeCompare(b.path))) {
      const parts = e.path.split('/');
      parts.forEach((p, i) => {
        const key = parts.slice(0, i + 1).join('/');
        if (seen.has(key)) return;
        seen.add(key);
        const isFile = i === parts.length - 1;
        out.push({ depth: i, name: p, size: isFile ? e.size : undefined, folder: !isFile, key });
      });
    }
    return out;
  }, [entries]);
  return (
    <div className="dv-archive">
      <div className="dv-archive__head">
        <span className="neo-hud">Archive contents</span>
        <span className="neo-faint text-xs">
          {entries.length} files · {formatBytes(total)} uncompressed
        </span>
      </div>
      <ul className="dv-archive__list">
        {tree.map((n) => {
          const I = n.folder ? Folder : KIND_ICON[kindFromFile(n.name)] ?? File;
          return (
            <li key={n.key} style={{ paddingLeft: 14 + n.depth * 18 }}>
              <I className={n.folder ? 'is-folder' : undefined} />
              <span className="grow truncate">{n.name}</span>
              {n.size !== undefined && <span className="neo-mono neo-faint text-xs">{formatBytes(n.size)}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------------- watermark & diff ---------------- */

export function Watermark({ text }: { text: string }) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='360' height='200'><text x='10' y='110' transform='rotate(-24 180 100)' font-family='ui-monospace,monospace' font-size='13' fill='rgba(127,127,160,0.22)'>${text.replace(/[<>&'"]/g, '')}</text></svg>`;
  return <div className="dv-watermark" aria-hidden="true" style={{ backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")` }} />;
}

export function DiffView({ lines }: { lines: { t: 'same' | 'add' | 'del'; text: string }[] }) {
  return (
    <pre className="dv-diff">
      {lines.map((l, i) => (
        <div key={i} className={cx('dv-diff__line', `is-${l.t}`)}>
          <span className="dv-diff__sign">{l.t === 'add' ? '+' : l.t === 'del' ? '−' : ' '}</span>
          <span>{l.text || ' '}</span>
        </div>
      ))}
    </pre>
  );
}

/** Dispatch a content object to its preview. */
export function Preview({ item, content, names }: { item: Item; content: Content | null; names?: string[] }): ReactNode {
  if (!content)
    return (
      <div className="dv-nopreview">
        {(() => {
          const I = KIND_ICON[item.kind];
          return <I />;
        })()}
        <div className="neo-title">No preview for this file type</div>
        <div className="neo-faint text-sm">{formatBytes(item.size)} · download it to open in its native app.</div>
      </div>
    );
  switch (content.type) {
    case 'doc':
      return <DocView text={content.text} names={names} />;
    case 'sheet':
      return <SheetView rows={content.rows} />;
    case 'slides':
      return <SlidesView slides={content.slides} seed={item.id} />;
    case 'pdf':
      return <PdfView pages={content.pages} name={item.name} />;
    case 'image':
      return <ImageView item={item} content={content} />;
    case 'code':
      return <CodeView text={content.text} lang={content.lang} />;
    case 'media':
      return <MediaView item={item} content={content} />;
    case 'archive':
      return <ArchiveView entries={content.entries} />;
  }
}
