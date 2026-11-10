/**
 * Shared Helpdesk UI atoms: viewer hook, category/status/priority pills,
 * live SLA rings, health rings, tag chips, people, panels and the
 * "open the New Ticket flow with a prefill" helper.
 */
import { useCallback, useMemo, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { create } from 'zustand';
import {
  AppWindow,
  CircleHelp,
  Clock3,
  Headphones,
  KeyRound,
  Keyboard,
  Laptop,
  Mail,
  Monitor,
  MonitorSmartphone,
  PauseCircle,
  Plug,
  ShieldAlert,
  Smartphone,
  Tablet,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import { Avatar } from '@/components/ui/primitives';
import { Ring } from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { usePermissions, useRoles, useSessionUser } from '@/store/selectors';
import { useHub } from '@/store/hub';
import { cx } from '@/lib/cx';
import type { DeviceKind, DeviceTag, Impact, Priority, Ticket, TicketCategory, TicketStatus, Urgency } from '@/helpdesk/types';
import { isIT, isSecurity, isStaff } from '@/helpdesk/access';
import { CATEGORY_LABEL, CATEGORY_TONE, PRIORITY_LABEL, STATUS_LABEL, STATUS_LABEL_AGENT, STATUS_TONE } from '@/helpdesk/meta';
import { headlineSla, slaClock, slaLabel, type SlaState } from '@/helpdesk/sla';
import { healthBand, healthColor, HEALTH_BAND_LABEL } from '@/helpdesk/fleet';

/* ---------------------------------------------------------------- viewer */

export interface HdViewer {
  user: NonNullable<ReturnType<typeof useSessionUser>>;
  perms: ReadonlySet<string>;
  roles: ReturnType<typeof useRoles>;
  it: boolean;
  staff: boolean;
  security: boolean;
}

export function useViewer(): HdViewer | null {
  const user = useSessionUser();
  const perms = usePermissions();
  const roles = useRoles();
  return useMemo(() => {
    if (!user) return null;
    const v = { user, perms };
    return { user, perms, roles, it: isIT(v), staff: isStaff(user.id), security: isSecurity(v) };
  }, [user, perms, roles]);
}

export const useUsers = () => useHub((s) => s.users);

/* ---------------------------------------------------------------- icons */

export const CATEGORY_ICON: Record<TicketCategory, LucideIcon> = {
  hardware: Laptop,
  software: AppWindow,
  access: KeyRound,
  network: Wifi,
  email: Mail,
  security: ShieldAlert,
  other: CircleHelp,
};

export const KIND_ICON: Record<DeviceKind, LucideIcon> = {
  laptop: Laptop,
  desktop: MonitorSmartphone,
  monitor: Monitor,
  phone: Smartphone,
  tablet: Tablet,
  'security-key': KeyRound,
  headset: Headphones,
  dock: Plug,
  keyboard: Keyboard,
};

export function CategoryGlyph({ category, size = 36 }: { category: TicketCategory; size?: number }) {
  const Icon = CATEGORY_ICON[category];
  return (
    <span className="hd-catglyph" data-tone={CATEGORY_TONE[category]} style={{ width: size, height: size }} title={CATEGORY_LABEL[category]}>
      <Icon />
    </span>
  );
}

/* ---------------------------------------------------------------- pills */

export function StatusPill({ status, agent, size }: { status: TicketStatus; agent?: boolean; size?: 'sm' }) {
  return (
    <span className={cx('hd-status', size === 'sm' && 'hd-status--sm')} data-tone={STATUS_TONE[status]}>
      <i />
      {agent ? STATUS_LABEL_AGENT[status] : STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityPill({ priority, full }: { priority: Priority; full?: boolean }) {
  return (
    <span className="hd-prio" data-p={priority} title={`${priority} · ${PRIORITY_LABEL[priority]}`}>
      <b>{priority}</b>
      {full && <span>{PRIORITY_LABEL[priority]}</span>}
    </span>
  );
}

export function TagChip({ tag, onRemove, size }: { tag: DeviceTag; onRemove?: () => void; size?: 'sm' }) {
  return (
    <span className={cx('hd-tag', size === 'sm' && 'hd-tag--sm')} style={{ ['--tag' as string]: tag.color }} title={tag.description}>
      <i />#{tag.name}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove #${tag.name}`}>
          ×
        </button>
      )}
    </span>
  );
}

/* ---------------------------------------------------------------- SLA */

const SLA_COLOR: Record<SlaState['state'], string> = {
  ok: 'var(--hd-ok)',
  met: 'var(--hd-ok)',
  risk: 'var(--hd-warn)',
  breached: 'var(--hd-bad)',
  missed: 'var(--hd-bad)',
  paused: 'var(--text-3)',
};

export function slaFill(s: SlaState): number {
  if (s.state === 'met' || s.state === 'breached' || s.state === 'missed') return 1;
  return Math.max(0.02, Math.min(1, s.remaining / s.target));
}

/** Live countdown ring for one clock. */
export function SlaRing({ sla, size = 56, label, caption }: { sla: SlaState; size?: number; label?: ReactNode; caption?: string }) {
  return (
    <span className={cx('hd-slaring', sla.state === 'breached' && 'is-breached')} data-state={sla.state}>
      <Ring value={slaFill(sla)} size={size} stroke={size > 48 ? 5 : 4} color={SLA_COLOR[sla.state]} label={`${caption ?? 'SLA'}: ${slaLabel(sla)}`}>
        {label}
      </Ring>
    </span>
  );
}

/** Compact SLA indicator for list rows and kanban cards (ticks every 15s). */
export function SlaChip({ ticket, compact }: { ticket: Ticket; compact?: boolean }) {
  const now = useNow(15_000);
  const sla = headlineSla(ticket, now);
  const Icon = sla.state === 'paused' ? PauseCircle : Clock3;
  if (ticket.status === 'resolved') {
    return (
      <span className="hd-slachip" data-state={sla.state}>
        <Icon /> {sla.state === 'met' ? 'SLA met' : 'SLA missed'}
      </span>
    );
  }
  return (
    <span className={cx('hd-slachip', sla.state === 'breached' && 'is-breached')} data-state={sla.state} title={`${sla.kind === 'response' ? 'First response' : 'Resolution'} · ${slaLabel(sla)}`}>
      <Icon />
      {!compact && <span className="hd-slachip__k">{sla.kind === 'response' ? 'Reply' : 'Fix'}</span>}
      {slaLabel(sla)}
    </span>
  );
}

/** Both clocks, ticking every second (ticket header). */
export function SlaPair({ ticket, size = 58 }: { ticket: Ticket; size?: number }) {
  const now = useNow(1000);
  const { response, resolve } = slaClock(ticket, now);
  return (
    <div className="hd-slapair">
      {[
        { s: response, k: 'First response' },
        { s: resolve, k: 'Resolution' },
      ].map(({ s, k }) => (
        <div key={k} className="hd-slapair__item" data-state={s.state}>
          <SlaRing sla={s} size={size} caption={k} label={<SlaIcon state={s.state} />} />
          <div>
            <div className="neo-hud">{k}</div>
            <div className="hd-slapair__v">{slaLabel(s)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SlaIcon({ state }: { state: SlaState['state'] }) {
  if (state === 'paused') return <PauseCircle size={16} />;
  if (state === 'met') return <span className="hd-slaicon">✓</span>;
  return <Clock3 size={16} />;
}

/* ---------------------------------------------------------------- health */

export function HealthRing({ score, size = 52, stroke, showLabel = true }: { score: number; size?: number; stroke?: number; showLabel?: boolean }) {
  return (
    <span className="hd-health" title={`Health ${score} · ${HEALTH_BAND_LABEL[healthBand(score)]}`}>
      <Ring value={score / 100} size={size} stroke={stroke ?? (size > 60 ? 6 : 4)} color={healthColor(score)} label={`Health ${score}`}>
        {showLabel ? score : undefined}
      </Ring>
    </span>
  );
}

/* ---------------------------------------------------------------- people */

export function Person({ userId, sub, size = 28, nameOnly }: { userId?: string; sub?: ReactNode; size?: number; nameOnly?: boolean }) {
  const user = useHub((s) => (userId ? s.users.find((u) => u.id === userId) : undefined));
  if (!user)
    return (
      <span className="hd-person">
        <span className="avatar hd-person__none" style={{ ['--size' as string]: `${size}px` }}>
          –
        </span>
        <span className="hd-person__text">
          <span className="hd-person__name neo-faint">Unassigned</span>
        </span>
      </span>
    );
  return (
    <span className="hd-person">
      <Avatar user={user} size={size} presence={!nameOnly && size >= 30} />
      <span className="hd-person__text">
        <span className="hd-person__name">{user.name}</span>
        {sub !== undefined ? <span className="hd-person__sub">{sub}</span> : !nameOnly && <span className="hd-person__sub">{user.title}</span>}
      </span>
    </span>
  );
}

/* ---------------------------------------------------------------- layout */

export function Panel({ title, hud, actions, children, className, id, flush }: { title?: ReactNode; hud?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string; flush?: boolean }) {
  return (
    <section className={cx('hd-panel', flush && 'hd-panel--flush', className)} id={id}>
      {(title || hud || actions) && (
        <header className="hd-panel__head">
          <div className="hd-panel__titles">
            {hud && <div className="neo-hud">{hud}</div>}
            {title && <h2 className="hd-panel__title">{title}</h2>}
          </div>
          {actions && <div className="hd-panel__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function HudStat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className="hd-hudstat" data-tone={tone}>
      <div className="neo-hud">{label}</div>
      <div className="hd-hudstat__v neo-num">{value}</div>
      {sub && <div className="hd-hudstat__s">{sub}</div>}
    </div>
  );
}

export const Kbd = ({ children }: { children: ReactNode }) => <kbd className="kbd">{children}</kbd>;

/* ---------------------------------------------------------------- new ticket draft */

export interface TicketDraft {
  description?: string;
  impact?: Impact;
  urgency?: Urgency;
}

export const useTicketDraft = create<{ draft: TicketDraft; set(d: TicketDraft): void; clear(): void }>()((set) => ({
  draft: {},
  set: (draft) => set({ draft }),
  clear: () => set({ draft: {} }),
}));

export interface TicketPrefill extends TicketDraft {
  category?: TicketCategory;
  device?: string;
  subject?: string;
}

/** Open the New Ticket flow over the current screen, optionally prefilled. */
export function useOpenTicket() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  return useCallback(
    (prefill: TicketPrefill = {}) => {
      useTicketDraft.getState().set({ description: prefill.description, impact: prefill.impact, urgency: prefill.urgency });
      const sp = new URLSearchParams(search);
      for (const k of ['category', 'device', 'subject', 'diag', 'scan']) sp.delete(k);
      sp.set('new', '1');
      if (prefill.category) sp.set('category', prefill.category);
      if (prefill.device) sp.set('device', prefill.device);
      if (prefill.subject) sp.set('subject', prefill.subject);
      navigate(`${pathname}?${sp.toString()}`);
    },
    [navigate, pathname, search],
  );
}

/** Add/remove a query param on the current route. */
export function useSetParam() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  return useCallback(
    (key: string, value: string | null, opts: { replace?: boolean } = {}) => {
      const sp = new URLSearchParams(search);
      if (value === null) sp.delete(key);
      else sp.set(key, value);
      const qs = sp.toString();
      navigate(`${pathname}${qs ? `?${qs}` : ''}`, { replace: opts.replace });
    },
    [navigate, pathname, search],
  );
}

export function plural(n: number, word: string, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`;
}
