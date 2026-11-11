/**
 * Helix Mail — shared UI bits: context hooks, locale-aware formatting, avatars,
 * Nova reason chips, sensitivity/attachment chips, press-and-hold button,
 * Mail-scoped hotkeys and the keyboard shortcut overlay.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import {
  AlarmClock,
  Archive,
  BellRing,
  CalendarClock,
  CheckCheck,
  Crown,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Hourglass,
  Inbox,
  Keyboard,
  Lock,
  MessageSquareMore,
  Newspaper,
  Presentation,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
  Sunrise,
  Timer,
  Users,
  X,
} from 'lucide-react';
import { Chip, Ring, type Tone } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import type { BridgeViewer } from '@/lib/appBridge';
import { useI18n } from '@/lib/i18n';
import { effectivePermissions } from '@/lib/rbac';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import { useUI } from '@/store/ui';
import { dayOffsetOf, resolveContact, snoozePresets, type RankReason } from '@/mail/engine';
import { useMail } from '@/mail/store';
import type { AttachmentKind, MailAttachment, MailStream, ResolvedContact, Sensitivity } from '@/mail/types';
import { useMailUi } from './ui';

export const MAIL_TINT = { c1: '#38bdf8', c2: '#6366f1' };

/* ==========================================================================
   Context
   ========================================================================== */

export function useMailCtx() {
  const me = useSessionUser();
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  const contacts = useMail((s) => s.contacts);
  return useMemo(() => {
    const userMap = new Map(users.map((u) => [u.id, u]));
    const contactMap = new Map(contacts.map((c) => [c.id, c]));
    const resolve = (key: string): ResolvedContact => resolveContact(key, userMap, contactMap);
    const viewer: BridgeViewer | null = me ? { user: me, roles, perms: effectivePermissions(me, roles) } : null;
    return { me, users, userMap, contacts, contactMap, resolve, viewer, ownerId: me?.id ?? 'u-layla' };
  }, [me, users, roles, contacts]);
}

export type MailCtx = ReturnType<typeof useMailCtx>;

export const firstOf = (name: string) => name.split(/\s+/)[0];

/** Names (first names for hub people), one text node each so the shell translator can localise them. */
export function FirstNames({ names, full }: { names: string[]; full?: boolean[] }) {
  const sep = useI18n((s) => s.locale) === 'ar' ? '، ' : ', ';
  return (
    <span className="ml-names">
      {names.map((n, i) => (
        <span key={`${n}-${i}`}>
          {i > 0 && sep}
          <span>{full?.[i] ? n : firstOf(n)}</span>
        </span>
      ))}
    </span>
  );
}

/* ==========================================================================
   Locale-aware formatting (Intl does the Arabic; no translator needed)
   ========================================================================== */

export function useFmt() {
  const locale = useI18n((s) => s.locale);
  const numerals = useI18n((s) => s.numerals);
  return useMemo(() => {
    const tag = locale === 'ar' ? (numerals === 'arab' ? 'ar' : 'ar-u-nu-latn') : 'en-GB';
    const mk = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(tag, o);
    const fTime = mk({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const fWeekday = mk({ weekday: 'short' });
    const fWeekdayLong = mk({ weekday: 'long' });
    const fDate = mk({ day: 'numeric', month: 'short' });
    const fDayTime = mk({ weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const fFull = mk({ weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const timeIn = (ts: number, tz?: string) => {
      try {
        return new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).format(ts);
      } catch {
        return fTime.format(ts);
      }
    };
    /** Inbox-style stamp: time today, weekday this week, date otherwise. */
    const when = (ts: number, now = Date.now()) => {
      const off = dayOffsetOf(ts, now);
      if (off === 0) return fTime.format(ts);
      if (off > -6 && off < 0) return fWeekday.format(ts);
      if (off > 0 && off < 7) return fDayTime.format(ts);
      return fDate.format(ts);
    };
    const num = (n: number) => n.toLocaleString(tag);
    return {
      locale,
      tag,
      time: (ts: number) => fTime.format(ts),
      timeIn,
      weekday: (ts: number) => fWeekday.format(ts),
      weekdayLong: (ts: number) => fWeekdayLong.format(ts),
      date: (ts: number) => fDate.format(ts),
      dayTime: (ts: number) => fDayTime.format(ts),
      full: (ts: number) => fFull.format(ts),
      when,
      num,
      duration: (ms: number) => fmtDuration(ms, locale),
    };
  }, [locale, numerals]);
}

export function fmtDuration(ms: number, locale: 'en' | 'ar' = 'en'): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const u = locale === 'ar' ? { d: 'ي', h: 'س', m: 'د', s: 'ث' } : { d: 'd', h: 'h', m: 'm', s: 's' };
  if (d) return `${d}${u.d} ${h}${u.h}`;
  if (h) return `${h}${u.h} ${m}${u.m}`;
  if (m) return `${m}${u.m} ${String(s).padStart(2, '0')}${u.s}`;
  return `${s}${u.s}`;
}

/* ==========================================================================
   Streams
   ========================================================================== */

export const STREAM_META: Record<MailStream, { label: string; hint: string; icon: ReactNode }> = {
  priority: { label: 'Priority', hint: 'Nova-ranked: people and decisions that need you', icon: <Sparkles /> },
  approvals: { label: 'Approvals', hint: 'Approve Procurement, HR, Expenses and Talent requests in place', icon: <CheckCheck /> },
  updates: { label: 'Updates', hint: 'Notifications, announcements and FYIs', icon: <BellRing /> },
  feed: { label: 'Feed', hint: 'Newsletters to read when you have time', icon: <Newspaper /> },
  paper: { label: 'Paper trail', hint: 'Receipts, invoices and confirmations', icon: <Receipt /> },
  other: { label: 'Other', hint: 'Everything else', icon: <Inbox /> },
};

/* ==========================================================================
   Avatars & chips
   ========================================================================== */

export function ContactAvatar({ c, size = 34, presence = false }: { c: ResolvedContact; size?: number; presence?: boolean }) {
  return (
    <span className="ml-avatar" data-external={c.external || undefined} data-kind={c.kind}>
      <Avatar user={{ name: c.name, avatarHue: c.avatarHue, presence: c.presence }} size={size} presence={presence && c.hub} />
      {c.vip && (
        <span className="ml-avatar__vip" aria-hidden="true">
          <Crown />
        </span>
      )}
    </span>
  );
}

/** A Nova reason chip; static words and dynamic values sit in separate nodes for the translator. */
export function ReasonChip({ r, now, size = 'sm' }: { r: RankReason; now: number; size?: 'sm' }) {
  const fmt = useFmt();
  const tone = r.tone as Tone;
  switch (r.id) {
    case 'deadline': {
      const off = r.at ? dayOffsetOf(r.at, now) : 99;
      return (
        <Chip tone={tone} size={size} icon={<Hourglass />}>
          <span>Deadline</span> <b>{off <= 0 ? <span>today</span> : off === 1 ? <span>tomorrow</span> : fmt.weekday(r.at ?? now)}</b>
        </Chip>
      );
    }
    case 'blocking':
      return (
        <Chip tone={tone} size={size} icon={<Users />}>
          <span>Blocks</span> <b>{r.value}</b> <span>people</span>
        </Chip>
      );
    case 'waiting':
      return (
        <Chip tone={tone} size={size} icon={<Timer />}>
          <span>Waiting</span> <b>{fmt.duration((r.value ?? 1) * 86_400_000)}</b>
        </Chip>
      );
    case 'manager':
      return (
        <Chip tone={tone} size={size} icon={<Crown />}>
          <span>From your manager</span>
        </Chip>
      );
    case 'exec':
      return (
        <Chip tone={tone} size={size} icon={<Crown />}>
          <span>Exec office</span>
        </Chip>
      );
    case 'vip':
      return (
        <Chip tone={tone} size={size} icon={<Sparkles />}>
          <span>VIP customer</span>
        </Chip>
      );
    case 'team':
      return (
        <Chip tone={tone} size={size} icon={<Users />}>
          <span>From your team</span>
        </Chip>
      );
    case 'asked':
      return (
        <Chip tone={tone} size={size} icon={<MessageSquareMore />}>
          <span>Asks you</span>
        </Chip>
      );
    case 'security':
      return (
        <Chip tone={tone} size={size} icon={<ShieldAlert />}>
          <span>Security</span>
        </Chip>
      );
    case 'meeting':
      return (
        <Chip tone={tone} size={size} icon={<CalendarClock />}>
          <span>Meeting request</span>
        </Chip>
      );
    case 'mention':
      return (
        <Chip tone={tone} size={size} icon={<Sparkles />}>
          <span>Mentions you</span>
        </Chip>
      );
  }
}

const SENS_META: Record<Sensitivity, { label: string; tone: Tone }> = {
  public: { label: 'Public', tone: 'slate' },
  internal: { label: 'Internal', tone: 'cyan' },
  confidential: { label: 'Confidential', tone: 'amber' },
  restricted: { label: 'Restricted', tone: 'danger' },
};

export function SensitivityChip({ s }: { s: Sensitivity }) {
  const m = SENS_META[s] ?? SENS_META.internal;
  return (
    <Chip tone={m.tone} size="sm" icon={s === 'confidential' || s === 'restricted' ? <Lock /> : undefined}>
      {m.label}
    </Chip>
  );
}

const KIND_ICON: Record<AttachmentKind, ReactNode> = {
  pdf: <FileText />,
  doc: <FileText />,
  sheet: <FileSpreadsheet />,
  slides: <Presentation />,
  image: <FileImage />,
  archive: <FileArchive />,
  other: <FileText />,
};

export function KindIcon({ kind }: { kind: AttachmentKind }) {
  return <>{KIND_ICON[kind] ?? KIND_ICON.other}</>;
}

export function fmtSize(kb: number, num: (n: number) => string = (n) => String(n)): ReactNode {
  return kb >= 1024 ? (
    <>
      <b>{num(Math.round((kb / 1024) * 10) / 10)}</b> <span>MB</span>
    </>
  ) : (
    <>
      <b>{num(kb)}</b> <span>KB</span>
    </>
  );
}

export function AttachmentChip({ a, onRemove, action }: { a: MailAttachment; onRemove?: () => void; action?: ReactNode }) {
  const fmt = useFmt();
  return (
    <span className="ml-att" data-sensitivity={a.sensitivity} data-offloaded={a.offloaded || undefined}>
      <span className="ml-att__icon" aria-hidden="true">
        <KindIcon kind={a.kind} />
      </span>
      <span className="ml-att__text">
        <span className="ml-att__name" data-no-i18n>
          {a.name}
        </span>
        <span className="ml-att__meta">
          {fmtSize(a.sizeKb, fmt.num)}
          {a.protectedLink && (
            <span className="ml-att__flag">
              <ShieldCheck aria-hidden="true" /> <span>Protected link</span>
            </span>
          )}
          {a.offloaded && (
            <span className="ml-att__flag">
              <Archive aria-hidden="true" /> <span>In Drive</span>
            </span>
          )}
        </span>
      </span>
      <SensitivityChip s={a.sensitivity} />
      {action}
      {onRemove && (
        <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={onRemove} aria-label="Remove attachment">
          <X />
        </button>
      )}
    </span>
  );
}

/** Accessible on/off switch. */
export function Switch({ on, onChange, label, children }: { on: boolean; onChange: (v: boolean) => void; label: string; children?: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="ml-switch" data-on={on || undefined} onClick={() => onChange(!on)}>
      <span className="ml-switch__track" aria-hidden="true">
        <i />
      </span>
      {children}
    </button>
  );
}

/* ==========================================================================
   Press-and-hold (batch approve)
   ========================================================================== */

export function HoldButton({
  onComplete,
  ms = 1200,
  disabled,
  label,
  children,
  tone = 'success',
}: {
  onComplete: () => void;
  ms?: number;
  disabled?: boolean;
  label: string;
  children: ReactNode;
  tone?: 'success' | 'danger';
}) {
  const [p, setP] = useState(0);
  const raf = useRef(0);
  const start = useRef(0);
  const done = useRef(false);
  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    if (!done.current) setP(0);
  }, []);
  const begin = useCallback(() => {
    if (disabled || raf.current) return;
    done.current = false;
    start.current = performance.now();
    const step = (t: number) => {
      const v = Math.min(1, (t - start.current) / ms);
      setP(v);
      if (v >= 1) {
        done.current = true;
        raf.current = 0;
        onComplete();
        window.setTimeout(() => setP(0), 450);
        return;
      }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [disabled, ms, onComplete]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const onKey = (e: ReactKeyboardEvent, down: boolean) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (down && !e.repeat) begin();
    if (!down) stop();
  };
  return (
    <button
      type="button"
      className={`neo-btn neo-btn--${tone} ml-hold`}
      disabled={disabled}
      aria-label={label}
      title={label}
      onPointerDown={begin}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => onKey(e, true)}
      onKeyUp={(e) => onKey(e, false)}
      style={{ ['--hold' as string]: p } as CSSProperties}
    >
      <Ring value={p} size={22} stroke={3} color="currentColor" track="rgb(255 255 255 / 0.25)" label={label} />
      {children}
    </button>
  );
}

/* ==========================================================================
   Hotkeys (capture phase so Mail's j/k/e/s/f… win over the shell's globals)
   ========================================================================== */

const isTyping = (el: EventTarget | null) => {
  const n = el as HTMLElement | null;
  if (!n) return false;
  return n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.tagName === 'SELECT' || n.isContentEditable;
};

export function useMailKeys(map: Record<string, (e: KeyboardEvent) => void>, enabled = true) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const ui = useUI.getState();
      if (ui.paletteOpen || ui.shortcutsOpen || ui.personaSwitcherOpen || ui.appSheetId || ui.launch || ui.kudos.open) return;
      if (document.querySelector('.neo-pop, .modal, .ml-shortcuts')) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
      const fn = ref.current[key];
      if (!fn) return;
      e.preventDefault();
      e.stopPropagation();
      fn(e);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled]);
}

/* ==========================================================================
   Snooze presets
   ========================================================================== */

const SNOOZE_ICON: Record<string, ReactNode> = { later: <Sun />, tomorrow: <Sunrise />, weekend: <AlarmClock />, nextweek: <CalendarClock /> };

export function SnoozeList({ onPick, now = Date.now() }: { onPick: (at: number) => void; now?: number }) {
  const fmt = useFmt();
  return (
    <div role="menu" aria-label="Snooze until" className="ml-snooze">
      <div className="neo-menu__label">Snooze until</div>
      {snoozePresets(now).map((p) => (
        <button key={p.id} type="button" role="menuitem" className="neo-menu__item" onClick={() => onPick(p.at)}>
          {SNOOZE_ICON[p.id]}
          <span className="grow">{p.label}</span>
          <span className="neo-menu__hint">{fmt.dayTime(p.at)}</span>
        </button>
      ))}
    </div>
  );
}

/* ==========================================================================
   Keyboard shortcut overlay
   ========================================================================== */

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['j', 'k'], label: 'Next / previous thread' },
  { keys: ['Enter', 'o'], label: 'Open thread' },
  { keys: ['e'], label: 'Archive' },
  { keys: ['s'], label: 'Snooze' },
  { keys: ['r'], label: 'Reply' },
  { keys: ['a'], label: 'Reply all' },
  { keys: ['f'], label: 'Forward' },
  { keys: ['#'], label: 'Delete' },
  { keys: ['x'], label: 'Select thread' },
  { keys: ['/'], label: 'Search mail' },
  { keys: ['c'], label: 'Compose' },
  { keys: ['Esc'], label: 'Close / clear selection' },
  { keys: ['?'], label: 'Show shortcuts' },
];

export function ShortcutsOverlay() {
  const open = useMailUi((s) => s.shortcutsOpen);
  const setOpen = useMailUi((s) => s.setShortcuts);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [open, setOpen]);
  if (!open) return null;
  return (
    <div className="ml-shortcuts" role="presentation" onClick={() => setOpen(false)}>
      <div className="ml-shortcuts__panel neo-plane" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" tabIndex={-1} ref={panel} onClick={(e) => e.stopPropagation()}>
        <header className="ml-shortcuts__head">
          <span className="ml-shortcuts__icon" aria-hidden="true">
            <Keyboard />
          </span>
          <div className="grow">
            <div className="neo-hud">Nova Inbox</div>
            <h2 className="ml-shortcuts__title">Keyboard shortcuts</h2>
          </div>
          <button type="button" className="neo-iconbtn" onClick={() => setOpen(false)} aria-label="Close shortcuts">
            <X />
          </button>
        </header>
        <ul className="ml-shortcuts__list">
          {SHORTCUTS.map((s) => (
            <li key={s.label}>
              <span className="ml-shortcuts__keys">
                {s.keys.map((k) => (
                  <kbd key={k} className="kbd">
                    {k}
                  </kbd>
                ))}
              </span>
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
        <p className="ml-shortcuts__foot">
          <span>Command palette</span> <kbd className="kbd">⌘K</kbd>
        </p>
      </div>
    </div>
  );
}
