/**
 * Drive visual bits: kind icons, generated thumbnails (doc lines, sheet grid, slide frame, PDF page,
 * generative image art, code lines, video frame, waveform, archive), label chips, drive glyphs,
 * principal glyphs, access stacks, highlight, level/expiry selects and the Undo dock.
 */
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Archive,
  Box,
  Briefcase,
  Building2,
  Cloud,
  Code2,
  Database,
  File,
  FileAudio,
  FileCode,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  FlaskConical,
  Folder,
  Globe,
  HardDrive,
  Heart,
  Image as ImageIcon,
  Landmark,
  Library,
  Link2,
  Lock,
  Megaphone,
  Palette,
  Play,
  Presentation,
  Rocket,
  Shield,
  ShieldAlert,
  TrendingUp,
  Undo2,
  Users,
  X,
} from 'lucide-react';
import { Avatar } from '@/components/ui/primitives';
import { Chip } from '@/components/neo';
import { cx } from '@/lib/cx';
import type { User } from '@/types';
import type { ArtMotif, Drive, Item, ItemKind, Level, Principal, Sensitivity } from '@/drive/types';
import { DAY, KIND_COLOR, LABEL_HINT, LABEL_NAME, LABEL_TONE, LEVEL_LABEL, extOf, hashStr } from '@/drive/meta';
import { contentOf, parseBlocks } from '@/drive/content';
import { evaluateSheet } from '@/drive/sheet';
import { highlight } from '@/drive/query';
import { useUndo } from './ctx';

/* ---------------- icons ---------------- */

export const KIND_ICON: Record<ItemKind, typeof File> = {
  folder: Folder,
  doc: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  pdf: FileType,
  image: ImageIcon,
  video: FileVideo,
  audio: FileAudio,
  code: FileCode,
  text: FileText,
  archive: Archive,
  other: File,
};

export function KindIcon({ kind, className }: { kind: ItemKind; className?: string }) {
  const I = KIND_ICON[kind];
  return <I className={className} style={{ color: KIND_COLOR[kind] }} aria-hidden="true" />;
}

/** Small coloured tile with the kind icon (list rows, search results). */
export function KindTile({ item, size = 30 }: { item: Item; size?: number }) {
  const c = item.kind === 'image' ? contentOf(item) : null;
  const src = c?.type === 'image' ? c.src : undefined;
  const color = item.kind === 'folder' && item.color ? item.color : KIND_COLOR[item.kind];
  const I = KIND_ICON[item.kind];
  return (
    <span className="dv-kindtile" style={{ '--k': color, width: size, height: size } as CSSProperties} aria-hidden="true">
      {src ? <img src={src} alt="" /> : <I />}
    </span>
  );
}

export const LABEL_ICON: Record<Sensitivity, typeof Globe> = { public: Globe, internal: Building2, confidential: Lock, restricted: ShieldAlert };

export function LabelChip({ label, size = 'sm', quiet }: { label: Sensitivity; size?: 'sm' | 'md'; quiet?: boolean }) {
  if (quiet && label === 'internal') return null;
  const I = LABEL_ICON[label];
  return (
    <Chip tone={LABEL_TONE[label]} size={size === 'sm' ? 'sm' : undefined} icon={<I />} title={`${LABEL_NAME[label]} — ${LABEL_HINT[label]}`} className="dv-label">
      {LABEL_NAME[label]}
    </Chip>
  );
}

export const DRIVE_ICONS: Record<string, typeof Folder> = {
  library: Library,
  code: Code2,
  palette: Palette,
  heart: Heart,
  landmark: Landmark,
  shield: Shield,
  trending: TrendingUp,
  user: HardDrive,
  rocket: Rocket,
  megaphone: Megaphone,
  briefcase: Briefcase,
  flask: FlaskConical,
  globe: Globe,
  database: Database,
  cloud: Cloud,
  box: Box,
};
export const DRIVE_COLORS = ['#fbbf24', '#f97316', '#fb7185', '#f472b6', '#a78bfa', '#818cf8', '#60a5fa', '#22d3ee', '#2dd4bf', '#34d399', '#a3e635', '#94a3b8'];

export function DriveGlyph({ drive, size = 26 }: { drive: Pick<Drive, 'icon' | 'color' | 'kind'>; size?: number }) {
  const I = drive.kind === 'personal' ? HardDrive : (DRIVE_ICONS[drive.icon] ?? Folder);
  return (
    <span className="dv-driveglyph" style={{ '--d': drive.color, width: size, height: size } as CSSProperties} aria-hidden="true">
      <I />
    </span>
  );
}

export function PrincipalGlyph({ p, user, roleColor, size = 28 }: { p: Principal | { type: 'link'; scope: 'org' | 'anyone' } | { type: 'gov' }; user?: User; roleColor?: string; size?: number }) {
  if (p.type === 'user' && user) return <Avatar user={user} size={size} />;
  const icon = p.type === 'role' ? <Shield /> : p.type === 'dept' ? <Users /> : p.type === 'org' ? <Building2 /> : p.type === 'link' ? p.scope === 'anyone' ? <Globe /> : <Link2 /> : <ShieldAlert />;
  const color = p.type === 'role' ? (roleColor ?? '#94a3b8') : p.type === 'dept' ? '#60a5fa' : p.type === 'org' ? '#fbbf24' : p.type === 'link' ? (p.scope === 'anyone' ? '#fb7185' : '#22d3ee') : '#f97316';
  return (
    <span className="dv-pglyph" style={{ '--p': color, width: size, height: size } as CSSProperties} aria-hidden="true">
      {icon}
    </span>
  );
}

/* ---------------- generative art ---------------- */

export function ArtSvg({ hue, motif, seed, dark = true, className }: { hue: number; motif: ArtMotif; seed: number; dark?: boolean; className?: string }) {
  const h2 = (hue + 42) % 360;
  const h3 = (hue + 200) % 360;
  const r = (n: number) => ((seed >> n) & 255) / 255;
  const bg = dark ? `hsl(${hue} 45% 9%)` : `hsl(${hue} 60% 94%)`;
  let body: ReactNode = null;
  if (motif === 'mesh')
    body = (
      <>
        <circle cx={30 + r(1) * 50} cy={30 + r(3) * 30} r={46} fill={`hsl(${hue} 90% 58%)`} opacity={0.75} />
        <circle cx={110 + r(5) * 30} cy={60 + r(7) * 25} r={40} fill={`hsl(${h2} 90% 60%)`} opacity={0.7} />
        <circle cx={80} cy={95} r={34} fill={`hsl(${h3} 80% 55%)`} opacity={0.55} />
      </>
    );
  else if (motif === 'orbit')
    body = (
      <>
        {[0, 1, 2, 3].map((i) => (
          <ellipse key={i} cx={80} cy={50} rx={18 + i * 16} ry={10 + i * 9} fill="none" stroke={`hsl(${i % 2 ? h2 : hue} 90% 62%)`} strokeOpacity={0.7 - i * 0.12} strokeWidth={1.4} transform={`rotate(${-18 + i * 6} 80 50)`} />
        ))}
        <circle cx={80} cy={50} r={9} fill={`hsl(${hue} 95% 62%)`} />
        <circle cx={80 + 34 * Math.cos(r(2) * 6.28)} cy={50 + 19 * Math.sin(r(2) * 6.28)} r={3.4} fill={`hsl(${h2} 95% 70%)`} />
        <circle cx={80 + 66 * Math.cos(r(4) * 6.28)} cy={50 + 37 * Math.sin(r(4) * 6.28)} r={2.6} fill={`hsl(${h3} 95% 72%)`} />
      </>
    );
  else if (motif === 'wave')
    body = (
      <>
        {[0, 1, 2, 3, 4].map((i) => {
          const y = 38 + i * 13;
          const a = 6 + r(i) * 8;
          return <path key={i} d={`M0 ${y} C 40 ${y - a}, 60 ${y + a}, 100 ${y} S 150 ${y - a}, 160 ${y}`} fill="none" stroke={`hsl(${(hue + i * 14) % 360} 90% ${58 + i * 3}%)`} strokeWidth={2.2} strokeOpacity={0.85 - i * 0.12} />;
        })}
        <circle cx={120} cy={22} r={10} fill={`hsl(${h2} 95% 70%)`} opacity={0.9} />
      </>
    );
  else if (motif === 'grid')
    body = (
      <>
        <circle cx={80} cy={46} r={22} fill={`hsl(${hue} 95% 60%)`} opacity={0.9} />
        <rect x={0} y={52} width={160} height={48} fill={bg} />
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`v${i}`} x1={80} y1={52} x2={-80 + i * 40} y2={100} stroke={`hsl(${h2} 90% 62%)`} strokeOpacity={0.55} strokeWidth={0.8} />
        ))}
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={`h${i}`} x1={0} x2={160} y1={54 + i * i * 2.4} y2={54 + i * i * 2.4} stroke={`hsl(${h2} 90% 62%)`} strokeOpacity={0.5} strokeWidth={0.8} />
        ))}
      </>
    );
  else
    body = (
      <>
        {Array.from({ length: 8 }, (_, i) => (
          <ellipse key={i} cx={80} cy={50} rx={8} ry={30} fill={`hsl(${(hue + i * 12) % 360} 90% 62%)`} opacity={0.42} transform={`rotate(${i * 22.5} 80 50)`} />
        ))}
        <circle cx={80} cy={50} r={7} fill={`hsl(${h2} 95% 75%)`} />
      </>
    );
  return (
    <svg className={cx('dv-art', className)} viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width={160} height={100} fill={bg} />
      <g style={{ filter: motif === 'mesh' ? 'blur(10px)' : undefined }}>{body}</g>
    </svg>
  );
}

/* ---------------- code tokens ---------------- */

const KW = new Set('import export from const let var function return if else for while switch case break continue new class extends interface type implements async await try catch finally throw default typeof keyof in of as true false null undefined void echo set do done then fi local readonly'.split(' '));

export function codeTokens(line: string, lang: string): { t: string; c?: string }[] {
  const out: { t: string; c?: string }[] = [];
  const shellish = lang === 'shell' || lang === 'yaml' || lang === 'python' || lang === 'toml';
  const re = /(\/\/.*$|#.*$|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b\d+(?:\.\d+)?\b|<\/?[A-Za-z][\w.]*|[A-Za-z_$][\w$]*|\s+|.)/g;
  for (const m of line.matchAll(re)) {
    const s = m[0];
    if (s.startsWith('//') && !shellish) out.push({ t: s, c: 'cm' });
    else if (s.startsWith('#') && shellish) out.push({ t: s, c: 'cm' });
    else if (/^["'`]/.test(s)) out.push({ t: s, c: 'st' });
    else if (/^\d/.test(s)) out.push({ t: s, c: 'nu' });
    else if (/^<\/?[A-Za-z]/.test(s)) out.push({ t: s, c: 'tg' });
    else if (KW.has(s)) out.push({ t: s, c: 'kw' });
    else if (/^[A-Z][\w$]*$/.test(s)) out.push({ t: s, c: 'ty' });
    else out.push({ t: s });
  }
  return out;
}

/* ---------------- thumbnails ---------------- */

const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export function Thumb({ item, className }: { item: Item; className?: string }) {
  const c = useMemo(() => contentOf(item), [item]);
  const seed = hashStr(item.id);
  const color = KIND_COLOR[item.kind];
  let inner: ReactNode;
  if (item.kind === 'folder') {
    inner = (
      <div className="dv-th-folder" style={{ '--k': item.color ?? KIND_COLOR.folder } as CSSProperties}>
        <Folder />
      </div>
    );
  } else if (c?.type === 'doc') {
    const blocks = parseBlocks(c.text).slice(0, 9);
    inner = (
      <div className={cx('dv-paper', item.kind === 'text' && 'dv-paper--md')}>
        {blocks.map((b, i) => {
          if (b.t === 'h1') return <div key={i} className="dv-paper__h1">{b.text.replace(/\*\*/g, '')}</div>;
          if (b.t === 'h2' || b.t === 'h3') return <div key={i} className="dv-paper__h2">{b.text}</div>;
          if (b.t === 'ul' || b.t === 'ol')
            return (
              <div key={i} className="dv-paper__list">
                {b.items.slice(0, 3).map((it, j) => (
                  <div key={j}>• {it.text.replace(/\*\*|`/g, '')}</div>
                ))}
              </div>
            );
          if (b.t === 'table')
            return (
              <div key={i} className="dv-paper__table">
                {b.rows.slice(0, 3).map((r, j) => (
                  <div key={j}>{r.slice(0, 3).map((cell, k) => <span key={k}>{cell}</span>)}</div>
                ))}
              </div>
            );
          if (b.t === 'p' || b.t === 'quote') return <div key={i} className="dv-paper__p">{b.text.replace(/\*\*|`/g, '')}</div>;
          return null;
        })}
      </div>
    );
  } else if (c?.type === 'sheet') {
    const vals = evaluateSheet(c.rows.slice(0, 8).map((r) => r.slice(0, 5)));
    inner = (
      <div className="dv-th-sheet">
        {vals.map((r, i) => (
          <div key={i} className={cx('dv-th-sheet__row', i === 0 && 'is-head')}>
            {Array.from({ length: 5 }, (_, j) => (
              <span key={j} className={r[j]?.num !== null && r[j]?.num !== undefined ? 'is-num' : undefined}>
                {r[j]?.value ?? ''}
              </span>
            ))}
          </div>
        ))}
      </div>
    );
  } else if (c?.type === 'slides') {
    const s = c.slides[0];
    const hue = seed % 360;
    inner = (
      <div className="dv-th-slide" style={{ '--h': hue } as CSSProperties}>
        <div className="dv-th-slide__frame">
          <div className="dv-th-slide__title">{s?.title ?? item.name}</div>
          {s?.body?.[0] && <div className="dv-th-slide__sub">{s.body[0]}</div>}
          <span className="dv-th-slide__count">{c.slides.length} slides</span>
        </div>
      </div>
    );
  } else if (c?.type === 'pdf') {
    inner = (
      <div className="dv-paper dv-paper--pdf">
        <span className="dv-paper__tag">PDF</span>
        <div className="dv-paper__h1">{c.pages[0]?.heading}</div>
        {c.pages.slice(0, 2).flatMap((p, i) => [
          i > 0 ? <div key={`h${i}`} className="dv-paper__h2">{p.heading}</div> : null,
          ...p.body.slice(0, 2).map((t, j) => (
            <div key={`${i}-${j}`} className="dv-paper__p">
              {t}
            </div>
          )),
        ])}
      </div>
    );
  } else if (c?.type === 'image') {
    inner = c.src ? <img className="dv-th-img" src={c.src} alt="" loading="lazy" /> : <ArtSvg hue={c.hue} motif={c.motif} seed={seed} />;
  } else if (c?.type === 'code') {
    const lines = c.text.split('\n').slice(0, 12);
    inner = (
      <div className="dv-th-code">
        {lines.map((l, i) => (
          <div key={i}>
            <i>{i + 1}</i>
            {codeTokens(l, c.lang).map((t, j) => (
              <span key={j} className={t.c ? `tk-${t.c}` : undefined}>
                {t.t}
              </span>
            ))}
          </div>
        ))}
      </div>
    );
  } else if (c?.type === 'media' && item.kind === 'video') {
    inner = (
      <div className="dv-th-video">
        <ArtSvg hue={c.hue} motif={(['wave', 'mesh', 'orbit'] as ArtMotif[])[seed % 3]} seed={seed} />
        <span className="dv-th-video__play">
          <Play />
        </span>
        <span className="dv-th-dur">{fmtDur(c.duration)}</span>
      </div>
    );
  } else if (c?.type === 'media') {
    inner = (
      <div className="dv-th-audio" style={{ '--h': c.hue } as CSSProperties}>
        <div className="dv-wave">
          {Array.from({ length: 36 }, (_, i) => (
            <i key={i} style={{ height: `${18 + (((seed >> (i % 24)) ^ (i * 37)) % 70)}%` }} />
          ))}
        </div>
        <span className="dv-th-dur">{fmtDur(c.duration)}</span>
      </div>
    );
  } else if (c?.type === 'archive') {
    inner = (
      <div className="dv-th-archive">
        <Archive />
        <div className="dv-th-archive__list">
          {c.entries.slice(0, 4).map((e) => (
            <div key={e.path}>{e.path}</div>
          ))}
        </div>
      </div>
    );
  } else {
    const I = KIND_ICON[item.kind];
    inner = (
      <div className="dv-th-generic" style={{ '--k': color } as CSSProperties}>
        <I />
        <span>.{extOf(item.name) || item.kind}</span>
      </div>
    );
  }
  return (
    <div className={cx('dv-thumb', `dv-thumb--${item.kind}`, className)} aria-hidden="true">
      {inner}
    </div>
  );
}

/* ---------------- misc ---------------- */

export function Hl({ text, hits }: { text: string; hits: number[] }) {
  return (
    <>
      {highlight(text, hits).map((s, i) =>
        s.hit ? (
          <mark key={i} className="dv-mark">
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

export function LevelSelect({ value, onChange, levels, label = 'Access level', disabled, size = 'sm' }: { value: Level; onChange: (l: Level) => void; levels: Level[]; label?: string; disabled?: boolean; size?: 'sm' | 'md' }) {
  return (
    <select className={cx('neo-select dv-levelsel', size === 'sm' && 'neo-select--sm')} value={value} onChange={(e) => onChange(e.target.value as Level)} aria-label={label} disabled={disabled}>
      {levels.map((l) => (
        <option key={l} value={l}>
          {LEVEL_LABEL[l]}
        </option>
      ))}
    </select>
  );
}

export const EXPIRY_OPTIONS: { value: string; label: string; days: number | null }[] = [
  { value: 'never', label: 'No expiry', days: null },
  { value: '7', label: '7 days', days: 7 },
  { value: '14', label: '14 days', days: 14 },
  { value: '30', label: '30 days', days: 30 },
  { value: '45', label: '45 days', days: 45 },
  { value: '90', label: '90 days', days: 90 },
];

export function ExpirySelect({ value, onChange, maxDays, label = 'Expiry', size = 'sm' }: { value: number | null; onChange: (ts: number | null) => void; maxDays?: number | null; label?: string; size?: 'sm' | 'md' }) {
  const now = Date.now();
  const days = value === null ? null : Math.max(1, Math.round((value - now) / DAY));
  const opts = EXPIRY_OPTIONS.filter((o) => (maxDays ? o.days !== null && o.days <= maxDays : true));
  const match = opts.find((o) => o.days === days);
  const current = value === null ? 'never' : match ? match.value : 'custom';
  return (
    <select
      className={cx('neo-select dv-expsel', size === 'sm' && 'neo-select--sm')}
      value={current}
      aria-label={label}
      onChange={(e) => {
        const o = EXPIRY_OPTIONS.find((x) => x.value === e.target.value);
        if (!o) return;
        onChange(o.days === null ? null : now + o.days * DAY);
      }}
    >
      {current === 'custom' && <option value="custom">{`${days} days left`}</option>}
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Owner + direct people, a group marker and the link state — a compact "who can open this". */
export function AccessStack({ item, users, size = 22 }: { item: Item; users: Map<string, User>; size?: number }) {
  const ids = [item.ownerId, ...item.shares.filter((s) => s.principal.type === 'user' && (s.expiresAt === null || s.expiresAt > Date.now())).map((s) => (s.principal as { id: string }).id)];
  const people = [...new Set(ids)].map((id) => users.get(id)).filter((u): u is User => !!u);
  const groups = item.shares.filter((s) => s.principal.type !== 'user').length;
  const shown = people.slice(0, 3);
  return (
    <span className="dv-access" title={`${people.map((p) => p.name).join(', ')}${groups ? ` + ${groups} group${groups > 1 ? 's' : ''}` : ''}${item.link.scope !== 'restricted' ? ' · link sharing on' : ''}`}>
      <span className="neo-avatars">
        {shown.map((u) => (
          <Avatar key={u.id} user={u} size={size} />
        ))}
        {people.length > 3 && (
          <span className="neo-avatars__more" style={{ ['--size' as string]: `${size}px` }}>
            +{people.length - 3}
          </span>
        )}
      </span>
      {groups > 0 && (
        <span className="dv-access__ico" data-tip={`${groups} group share${groups > 1 ? 's' : ''}`}>
          <Users />
        </span>
      )}
      {item.link.scope !== 'restricted' && (
        <span className={cx('dv-access__ico', item.link.scope === 'anyone' && 'is-public')} data-tip={item.link.scope === 'anyone' ? 'Anyone with the link' : 'Anyone at Helix with the link'}>
          {item.link.scope === 'anyone' ? <Globe /> : <Link2 />}
        </span>
      )}
    </span>
  );
}

export function UndoDock() {
  const entry = useUndo((s) => s.entry);
  const run = useUndo((s) => s.run);
  const clear = useUndo((s) => s.clear);
  if (!entry) return null;
  return createPortal(
    <div className="neo-portal dv-undo" role="status" key={entry.id}>
      <span className="dv-undo__title">{entry.title}</span>
      <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={run}>
        <Undo2 /> Undo <kbd className="kbd">⌘Z</kbd>
      </button>
      <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={clear} aria-label="Dismiss">
        <X />
      </button>
      <i className="dv-undo__timer" />
    </div>,
    document.body,
  );
}
