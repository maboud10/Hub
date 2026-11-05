/**
 * Shared building blocks for the Admin Control Center: data hooks, small
 * presentational components and constants used across the tabs.
 */
import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Ban,
  Bot,
  CircleCheck,
  Info,
  LockKeyhole,
  Shield,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useHub } from '@/store/hub';
import { Modal } from '@/components/ui/Modal';
import { Avatar, Segmented } from '@/components/ui/primitives';
import { HUB_PERMISSIONS } from '@/data/permissions';
import { DURATION_LABEL, effectivePermissions, type RiskLevel } from '@/lib/rbac';
import { formatDate } from '@/lib/format';
import { cx } from '@/lib/cx';
import type { AuditEntry, AuditSeverity, Grant, GrantDuration, HubApp, User } from '@/types';

export const DAY = 86_400_000;
export const EMPTY_PERMS: ReadonlySet<string> = new Set<string>();

// ─────────────────────────── tones ───────────────────────────

export type Tone = 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'muted';
/** Sets `--tone`, `--tone-bg`, `--tone-border`, `--tone-glow` (see admin.css). */
export const toneClass = (tone: Tone) => `adm-tone--${tone}`;

// ─────────────────────────── hooks ───────────────────────────

/** Open/close state that remembers its payload while the overlay animates out. */
export function useDisclosure<T>() {
  const [state, setState] = useState<{ open: boolean; value: T | null }>({ open: false, value: null });
  const show = useCallback((value: T) => setState({ open: true, value }), []);
  const hide = useCallback(() => setState((s) => ({ open: false, value: s.value })), []);
  return { open: state.open, value: state.value, show, hide };
}

export function useUserMap(): Map<string, User> {
  const users = useHub((s) => s.users);
  return useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
}

export function useAppMap(): Map<string, HubApp> {
  const apps = useHub((s) => s.apps);
  return useMemo(() => new Map(apps.map((a) => [a.id, a])), [apps]);
}

/** Effective permission set of every user (inactive users resolve to an empty set). */
export function usePermsByUser(now: number): Map<string, Set<string>> {
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  return useMemo(() => new Map(users.map((u) => [u.id, effectivePermissions(u, roles, now)])), [users, roles, now]);
}

// ─────────────────────────── helpers ───────────────────────────

/** Human label for any permission id (`app:x` → app name, hub perms → catalog label). */
export function permLabel(perm: string, apps: Map<string, HubApp>): string {
  if (perm === '*') return 'Everything (∗)';
  if (perm.startsWith('app:')) {
    const id = perm.slice(4);
    if (id === '*') return 'All apps';
    return apps.get(id)?.name ?? id;
  }
  return HUB_PERMISSIONS.find((p) => p.id === perm)?.label ?? perm;
}

export const isExpiringSoon = (g: Grant, now: number, days = 7) =>
  g.expiresAt !== null && g.expiresAt > now && g.expiresAt - now <= days * DAY;

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "Today" / "Yesterday" / "Monday, 2 November". */
export function dayLabel(ts: number, now: number): string {
  const diff = Math.round((startOfDay(now) - startOfDay(ts)) / DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  const sameYear = new Date(ts).getFullYear() === new Date(now).getFullYear();
  return formatDate(ts, { weekday: 'long', day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
}

export const sameMembers = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

export const DURATIONS: GrantDuration[] = ['7d', '30d', '90d', 'permanent'];

/** Launch URL validation — stricter than the store (which accepts a bare "https://"). */
export const URL_PATTERN = /^https?:\/\/[^\s/?#]+[^\s]*$/i;

/** Best guess of the window a grant was issued for (used by "Renew"). */
export function grantSpan(g: Grant): GrantDuration {
  if (g.expiresAt === null) return 'permanent';
  const days = Math.round((g.expiresAt - g.grantedAt) / DAY);
  return days <= 10 ? '7d' : days <= 45 ? '30d' : '90d';
}

export const GRADIENT_PRESETS: [string, string][] = [
  ['#22d3ee', '#6366f1'],
  ['#a78bfa', '#7c3aed'],
  ['#f472b6', '#db2777'],
  ['#fb7185', '#e11d48'],
  ['#fbbf24', '#f97316'],
  ['#a3e635', '#65a30d'],
  ['#34d399', '#059669'],
  ['#2dd4bf', '#0e7490'],
  ['#60a5fa', '#2563eb'],
  ['#e879f9', '#c026d3'],
];

export const ROLE_COLORS = [
  '#22d3ee',
  '#38bdf8',
  '#60a5fa',
  '#818cf8',
  '#b18cff',
  '#e879f9',
  '#ff5c8a',
  '#fb923c',
  '#fbbf24',
  '#a3e635',
  '#34d399',
  '#94a3b8',
];

export const CLEARANCE_NAMES: Record<number, string> = {
  1: 'Restricted',
  2: 'Standard',
  3: 'Elevated',
  4: 'Privileged',
  5: 'Full control',
};

// ─────────────────────────── components ───────────────────────────

/** Duration choice (7d / 30d / 90d / Permanent). Marks the requested option with a dot. */
export function DurationPicker({
  value,
  onChange,
  requested,
  label = 'Access duration',
}: {
  value: GrantDuration;
  onChange: (d: GrantDuration) => void;
  requested?: GrantDuration;
  label?: string;
}) {
  return (
    <Segmented<GrantDuration>
      value={value}
      onChange={onChange}
      label={label}
      options={DURATIONS.map((d) => ({
        value: d,
        title: `${DURATION_LABEL[d]}${requested === d ? ' · requested' : ''}`,
        label: (
          <>
            {d === 'permanent' ? 'Permanent' : d}
            {requested === d && <i className="adm-requested-dot" aria-hidden="true" />}
          </>
        ),
      }))}
    />
  );
}

const RISK: Record<RiskLevel, { cls: string; label: string; Icon: LucideIcon; hint: string }> = {
  low: { cls: 'badge--success', label: 'Low risk', Icon: ShieldCheck, hint: 'Everyday app and a short window' },
  medium: { cls: 'badge--warning', label: 'Medium risk', Icon: Shield, hint: 'Business data or a longer window' },
  high: { cls: 'badge--danger', label: 'High risk', Icon: ShieldAlert, hint: 'Sensitive app, long window or low-clearance requester' },
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  const r = RISK[level];
  return (
    <span className={cx('badge', r.cls)} title={r.hint}>
      <r.Icon aria-hidden="true" />
      {r.label}
    </span>
  );
}

const SEVERITY: Record<AuditSeverity, { cls: string; label: string; tone: Tone; Icon: LucideIcon }> = {
  info: { cls: 'badge--info', label: 'Info', tone: 'info', Icon: Info },
  warning: { cls: 'badge--warning', label: 'Warning', tone: 'warning', Icon: TriangleAlert },
  critical: { cls: 'badge--danger', label: 'Critical', tone: 'danger', Icon: ShieldAlert },
};

export const severityTone = (s: AuditSeverity): Tone => SEVERITY[s].tone;
export const SEVERITY_LABEL: Record<AuditSeverity, string> = { info: 'Info', warning: 'Warning', critical: 'Critical' };

export function SeverityBadge({ severity }: { severity: AuditSeverity }) {
  const s = SEVERITY[severity];
  return (
    <span className={cx('badge', s.cls)}>
      <s.Icon aria-hidden="true" />
      {s.label}
    </span>
  );
}

export function OutcomeBadge({ outcome }: { outcome: AuditEntry['outcome'] }) {
  return outcome === 'denied' ? (
    <span className="badge badge--danger">
      <Ban aria-hidden="true" />
      Denied
    </span>
  ) : (
    <span className="badge badge--success">
      <CircleCheck aria-hidden="true" />
      Success
    </span>
  );
}

/** Avatar + name for an actor id (falls back to a "System" bot). */
export function Actor({ user, size = 22, className }: { user: User | undefined; size?: number; className?: string }) {
  return (
    <span className={cx('adm-actor', className)}>
      {user ? (
        <Avatar user={user} size={size} />
      ) : (
        <span className="adm-actor__bot" style={{ '--size': `${size}px` } as CSSProperties} aria-hidden="true">
          <Bot />
        </span>
      )}
      <span className="truncate">{user?.name ?? 'System'}</span>
    </span>
  );
}

/** CSS tooltip wrapper (works around disabled controls not being hoverable targets). */
export function Tip({
  tip,
  pos,
  children,
  className,
}: {
  tip?: string | null | false;
  pos?: 'bottom' | 'right';
  children: ReactNode;
  className?: string;
}) {
  if (!tip) return <>{children}</>;
  return (
    <span className={cx('adm-tip', className)} data-tip={tip} data-tip-pos={pos}>
      {children}
    </span>
  );
}

export function LockNote({ children, tone = 'muted', icon: Icon = LockKeyhole }: { children: ReactNode; tone?: Tone; icon?: LucideIcon }) {
  return (
    <div className={cx('adm-note', toneClass(tone))}>
      <Icon aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

/** Small icon chip for modal headers. */
export function ModalIcon({ icon: Icon, tone = 'accent' }: { icon: LucideIcon; tone?: Tone }) {
  return (
    <span className={cx('adm-modal-icon', toneClass(tone))} aria-hidden="true">
      <Icon />
    </span>
  );
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  subtitle,
  children,
  confirmLabel = 'Confirm',
  tone = 'danger',
  icon = TriangleAlert,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'warning' | 'accent';
  icon?: LucideIcon;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      width={480}
      className="adm-overlay"
      icon={<ModalIcon icon={icon} tone={tone} />}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} data-autofocus>
            Cancel
          </button>
          <button type="button" className={cx('btn', tone === 'danger' ? 'btn--danger' : 'btn--primary')} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

/**
 * Two-step destructive button for use inside sheets (avoids stacking a modal
 * on top of a sheet).
 */
export function InlineConfirm({
  label,
  prompt,
  confirmLabel,
  onConfirm,
  icon: Icon,
  disabled,
}: {
  label: string;
  prompt: string;
  confirmLabel: string;
  onConfirm: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button type="button" className="btn btn--danger" onClick={() => setArmed(true)} disabled={disabled}>
        {Icon && <Icon aria-hidden="true" />}
        {label}
      </button>
    );
  }
  return (
    <div className="adm-inline-confirm" role="group" aria-label={prompt}>
      <TriangleAlert aria-hidden="true" />
      <span className="grow text-sm">{prompt}</span>
      <div className="row">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setArmed(false)} autoFocus>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--danger btn--sm"
          onClick={() => {
            setArmed(false);
            onConfirm();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

/** Facet chip with an optional count. */
export function FilterChip({
  active,
  onClick,
  children,
  count,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
  icon?: LucideIcon;
}) {
  return (
    <button type="button" className={cx('chip', active && 'is-active')} aria-pressed={active} onClick={onClick}>
      {Icon && <Icon aria-hidden="true" />}
      {children}
      {count !== undefined && <span className="count">{count}</span>}
    </button>
  );
}
