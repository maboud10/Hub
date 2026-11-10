/**
 * Pulse Chat shared visual parts: author avatars (people / bots / Pulse), conversation icons,
 * the markdown-lite renderer (mention chips with profile cards, channel links), time helpers.
 */
import { memo, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  AudioWaveform,
  FileArchive,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  FolderKanban,
  HardDrive,
  LifeBuoy,
  MessageCircle,
  Presentation,
  Sparkles,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { Avatar, PRESENCE_LABEL } from '@/components/ui/primitives';
import { NeoPopover } from '@/components/neo';
import { cx } from '@/lib/cx';
import { toast } from '@/store/toast';
import { BOTS, APP_META } from '@/chat/constants';
import { dmId, isBotId } from '@/chat/ids';
import { parseCached, type Block, type Inline, type ParseContext } from '@/chat/markdown';
import type { Conversation } from '@/chat/types';
import { ProjectSigil } from '@/projects/sigils';
import { useNames, useParseCtx, useViewer, type Names } from './hooks';

const CHANNEL_COLOR: Record<string, string> = {
  'ch-general': '#22d3ee',
  'ch-announcements': '#fbbf24',
  'ch-ship-it': '#f472b6',
  'ch-watercooler': '#fb923c',
  'ch-kudos': '#34d399',
  'ch-celebrations': '#e879f9',
  'ch-design-crit': '#f472b6',
  'ch-eng-platform': '#a78bfa',
  'ch-it-help': '#38bdf8',
  'ch-dubai-office': '#2dd4bf',
  'ch-exec-sync': '#f59e0b',
  'ch-proj-prism': '#f472b6',
  'ch-proj-mfa': '#38bdf8',
};

function channelColor(conv: Conversation): string {
  if (CHANNEL_COLOR[conv.id]) return CHANNEL_COLOR[conv.id];
  return conv.visibility === 'private' ? '#fbbf24' : '#22d3ee';
}

/* ---------------------------------------------------------------- time */

export const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

export function dayLabel(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const t = new Date(now);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(t) - start(d)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function localTime(timeZone: string | undefined) {
  try {
    return new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone });
  } catch {
    return '';
  }
}

export const bytes = (n?: number) => (!n ? '' : n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`);

const FILE_ICONS: Record<string, LucideIcon> = {
  doc: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  pdf: FileText,
  image: FileImage,
  video: FileVideo,
  code: FileCode2,
  archive: FileArchive,
};
export const fileIcon = (kind: string): LucideIcon => FILE_ICONS[kind] ?? FileText;
export const FILE_TONE: Record<string, string> = { doc: '#60a5fa', sheet: '#34d399', slides: '#fbbf24', pdf: '#fb7185', image: '#f472b6', video: '#a78bfa', code: '#22d3ee', archive: '#94a3b8' };

/* ---------------------------------------------------------------- bots */

const BOT_ICON: Record<string, LucideIcon> = {
  'bot-projects': FolderKanban,
  'bot-drive': HardDrive,
  'bot-helpdesk': LifeBuoy,
  'bot-nova': Sparkles,
};
export const APP_ICON: Record<string, LucideIcon> = { projects: FolderKanban, drive: HardDrive, helpdesk: LifeBuoy, performance: Trophy, chat: MessageCircle };

export function GlyphTile({ c1, c2, icon: Icon, size = 36, round }: { c1: string; c2: string; icon: LucideIcon; size?: number; round?: boolean }) {
  return (
    <span className={cx('pc-glyph', round && 'pc-glyph--round')} style={{ width: size, height: size, background: `linear-gradient(135deg, ${c1}, ${c2})`, borderRadius: round ? '50%' : Math.round(size * 0.32) }} aria-hidden="true">
      <Icon style={{ width: size * 0.5, height: size * 0.5 }} />
    </span>
  );
}

/** Avatar for any author id: person (with presence), integration bot, or Pulse/system. */
export function AuthorAvatar({ id, size = 36, presence = false, names }: { id: string; size?: number; presence?: boolean; names?: Names }) {
  const fallback = useNames();
  const n = names ?? fallback;
  if (id === 'system') return <GlyphTile c1="#22d3ee" c2="#d946ef" icon={AudioWaveform} size={size} />;
  if (isBotId(id)) return <GlyphTile c1={BOTS[id].c1} c2={BOTS[id].c2} icon={BOT_ICON[id]} size={size} />;
  const u = n.user(id);
  if (!u) return <span className="avatar" style={{ ['--size' as string]: `${size}px`, background: 'var(--surface-3)' }} aria-hidden="true" />;
  return <Avatar user={{ ...u, presence: n.presence(id) }} size={size} presence={presence} />;
}

/** Icon for a conversation in lists and headers. */
export function ConvIcon({ conv, viewerId, size = 22, presence = true }: { conv: Conversation; viewerId?: string; size?: number; presence?: boolean }) {
  const names = useNames();
  if (conv.kind === 'channel') {
    const fallbackSigil = conv.visibility === 'private' ? 'lock' : 'wave';
    return (
      <ProjectSigil
        icon={conv.icon || conv.name || fallbackSigil}
        color={channelColor(conv)}
        size={size}
        className={cx('pc-convicon', conv.visibility === 'private' && 'is-private')}
      />
    );
  }
  if (conv.kind === 'app' && conv.botId) return <AuthorAvatar id={conv.botId} size={size} names={names} />;
  const others = conv.memberIds.filter((m) => m !== viewerId);
  if (conv.kind === 'group') {
    const [a, b] = others;
    return (
      <span className="pc-groupicon" style={{ width: size, height: size }} aria-hidden="true">
        {a && <AuthorAvatar id={a} size={Math.round(size * 0.72)} names={names} />}
        {b && <AuthorAvatar id={b} size={Math.round(size * 0.72)} names={names} />}
      </span>
    );
  }
  return <AuthorAvatar id={others[0] ?? viewerId ?? ''} size={size} presence={presence} names={names} />;
}

/* ---------------------------------------------------------------- profile card */

export function ProfileCard({ userId, onClose }: { userId: string; onClose?: () => void }) {
  const names = useNames();
  const v = useViewer();
  const navigate = useNavigate();
  const u = names.user(userId);
  if (!u) return null;
  const p = names.presence(userId);
  const handle = names.handle(userId);
  return (
    <div className="pc-profile">
      <div className="pc-profile__band" style={{ background: `linear-gradient(120deg, hsl(${u.avatarHue} 80% 60% / 0.55), hsl(${(u.avatarHue + 60) % 360} 80% 55% / 0.25))` }} />
      <div className="pc-profile__body">
        <Avatar user={{ ...u, presence: p }} size={56} presence />
        <div className="pc-profile__name">{u.name}</div>
        <div className="neo-faint text-sm">
          {u.title} · {u.department}
        </div>
        <div className="pc-profile__meta">
          <span className={`dot dot--${p}`} /> {PRESENCE_LABEL[p]}
          {u.statusMessage && <span className="pc-profile__status">“{u.statusMessage}”</span>}
        </div>
        <div className="pc-profile__meta neo-mono">
          @{handle} · {localTime(u.timezone)} local · {u.location}
        </div>
        {v && v.user.id !== userId && (
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button
              type="button"
              className="neo-btn neo-btn--plasma neo-btn--sm"
              onClick={() => {
                onClose?.();
                navigate(`/chat/c/${dmId([v.user.id, userId])}`);
              }}
            >
              <MessageCircle /> Message
            </button>
            <button
              type="button"
              className="neo-btn neo-btn--soft neo-btn--sm"
              onClick={() => {
                void navigator.clipboard?.writeText(`@${handle}`).catch(() => undefined);
                toast.info('Handle copied', `@${handle}`);
              }}
            >
              Copy @{handle}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MentionChip({ userId, handle, me }: { userId: string; handle: string; me: boolean }) {
  const names = useNames();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button ref={ref} type="button" className={cx('pc-mention', me && 'is-me')} onClick={(e) => (e.stopPropagation(), setOpen((o) => !o))}>
        @{names.user(userId)?.name.split(' ')[0] ?? handle}
      </button>
      <NeoPopover open={open} anchor={ref.current} onClose={() => setOpen(false)} width={300} label="Profile" autoFocus={false}>
        <ProfileCard userId={userId} onClose={() => setOpen(false)} />
      </NeoPopover>
    </>
  );
}

function StillMention({ userId, handle, me }: { userId: string; handle: string; me: boolean }) {
  const names = useNames();
  return <span className={cx('pc-mention', me && 'is-me')}>@{names.user(userId)?.name.split(' ')[0] ?? handle}</span>;
}

/* ---------------------------------------------------------------- markdown */

function InlineNodes({ nodes, meId, still }: { nodes: Inline[]; meId?: string; still?: boolean }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case 'text':
            return <span key={i}>{n.v}</span>;
          case 'br':
            return <br key={i} />;
          case 'b':
            return (
              <strong key={i}>
                <InlineNodes nodes={n.c} meId={meId} still={still} />
              </strong>
            );
          case 'i':
            return (
              <em key={i}>
                <InlineNodes nodes={n.c} meId={meId} still={still} />
              </em>
            );
          case 's':
            return (
              <del key={i}>
                <InlineNodes nodes={n.c} meId={meId} still={still} />
              </del>
            );
          case 'code':
            return (
              <code key={i} className="pc-code">
                {n.v}
              </code>
            );
          case 'link':
            if (still)
              return (
                <span key={i} className="pc-link">
                  <InlineNodes nodes={n.c} meId={meId} still />
                </span>
              );
            return n.href.startsWith('/') ? (
              <Link key={i} to={n.href} className="pc-link" onClick={(e) => e.stopPropagation()}>
                <InlineNodes nodes={n.c} meId={meId} still={still} />
              </Link>
            ) : (
              <a key={i} href={n.href} target="_blank" rel="noreferrer noopener" className="pc-link" onClick={(e) => e.stopPropagation()}>
                <InlineNodes nodes={n.c} meId={meId} still={still} />
              </a>
            );
          case 'mention':
            return still ? (
              <StillMention key={i} userId={n.userId} handle={n.handle} me={n.userId === meId} />
            ) : (
              <MentionChip key={i} userId={n.userId} handle={n.handle} me={n.userId === meId} />
            );
          case 'special':
            return (
              <span key={i} className="pc-mention is-special">
                @{n.v}
              </span>
            );
          case 'channel':
            if (still)
              return (
                <span key={i} className="pc-chanref">
                  #{n.name}
                </span>
              );
            return (
              <Link key={i} to={`/chat/c/${n.convId}`} className="pc-chanref" onClick={(e) => e.stopPropagation()}>
                #{n.name}
              </Link>
            );
          case 'emoji':
            return (
              <span key={i} title={`:${n.code}:`}>
                {n.v}
              </span>
            );
        }
      })}
    </>
  );
}

function Blocks({ blocks, meId, still }: { blocks: Block[]; meId?: string; still?: boolean }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'p':
            return (
              <p key={i}>
                <InlineNodes nodes={b.c} meId={meId} still={still} />
              </p>
            );
          case 'quote':
            return (
              <blockquote key={i}>
                <Blocks blocks={b.c} meId={meId} still={still} />
              </blockquote>
            );
          case 'ul':
            return (
              <ul key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>
                    <InlineNodes nodes={it} meId={meId} still={still} />
                  </li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={i} start={b.start}>
                {b.items.map((it, j) => (
                  <li key={j}>
                    <InlineNodes nodes={it} meId={meId} still={still} />
                  </li>
                ))}
              </ol>
            );
          case 'pre':
            return (
              <pre key={i} className="pc-pre" data-lang={b.lang}>
                <code>{b.v}</code>
              </pre>
            );
        }
      })}
    </>
  );
}

/** Render markdown-lite. `still` renders mentions/links as plain spans (for previews inside clickable rows). */
export const Md = memo(function Md({ text, className, ctx: ctxProp, still }: { text: string; className?: string; ctx?: ParseContext; still?: boolean }) {
  const ctxHook = useParseCtx();
  const ctx = ctxProp ?? ctxHook;
  const v = useViewer();
  const blocks = useMemo(() => parseCached(text, ctx), [text, ctx]);
  return (
    <div className={cx('pc-md', className)}>
      <Blocks blocks={blocks} meId={v?.user.id} still={still} />
    </div>
  );
});

/* ---------------------------------------------------------------- misc */

export function AppBadge({ app }: { app: keyof typeof APP_META }) {
  const meta = APP_META[app];
  const Icon = APP_ICON[app] ?? MessageCircle;
  return <GlyphTile c1={meta.c1} c2={meta.c2} icon={Icon} size={30} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}
