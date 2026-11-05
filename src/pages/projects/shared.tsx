/**
 * Shared UI kit for Helix Projects pages: user/avatar helpers, pills & flags,
 * a portal-based Dropdown/Menu, collapsibles, confirm dialogs, approval
 * actions and small formatting helpers. Everything is `pj-*` namespaced.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router';
import {
  AlertTriangle,
  Bug,
  Check,
  ChevronRight,
  Diamond,
  Eye,
  Flag,
  Lock,
  MessageSquare,
  Pencil,
  Search,
  ShieldCheck,
  Stamp,
  UserRound,
} from 'lucide-react';
import type { ActionResult, Department, User } from '@/types';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { Avatar } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { useEscapeToClose } from '@/hooks/useOverlay';
import { cx } from '@/lib/cx';
import { daysBetween, formatDay, todayISO } from '@/hr/calendar';
import { HEALTH_META, PRIORITY_META, ROLE_META, STATUS_META, TASK_TYPE_META } from '@/projects/constants';
import { useProjects } from '@/projects/store';
import type { Project, ProjectHealth, ProjectRole, Task, TaskPriority, TaskStatus, TaskType } from '@/projects/types';

export const DEPARTMENTS: Department[] = [
  'Engineering',
  'Design',
  'Product',
  'People Ops',
  'Finance',
  'Sales',
  'Marketing',
  'IT & Security',
  'Operations',
  'Customer Success',
];

/** Direct access to store actions inside event handlers (no subscriptions). */
export const api = () => useProjects.getState();

/** Toast the outcome of a store action. Success toasts only when the action has a message. */
export function report(res: ActionResult, successFallback?: string): boolean {
  if (res.ok) {
    const msg = res.message ?? successFallback;
    if (msg) toast.success(msg);
  } else {
    toast.error(res.error);
  }
  return res.ok;
}

// ───────────────────────── users ─────────────────────────
export function useUserMap(): Map<string, User> {
  const users = useHub((s) => s.users);
  return useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
}

export function useActiveUsers(): User[] {
  const users = useHub((s) => s.users);
  return useMemo(() => users.filter((u) => u.active).sort((a, b) => a.name.localeCompare(b.name)), [users]);
}

export function UserAvatar({ userId, size = 24, name = false, className, title }: { userId?: string; size?: number; name?: boolean; className?: string; title?: string }) {
  const users = useUserMap();
  const u = userId ? users.get(userId) : undefined;
  if (!u) {
    return (
      <span className={cx('pj-user', className)} title={title ?? 'Unassigned'}>
        <span className="pj-avatar-empty" style={{ '--size': `${size}px` } as CSSProperties} aria-hidden="true">
          <UserRound />
        </span>
        {name && <span className="pj-user__name muted">Unassigned</span>}
      </span>
    );
  }
  return (
    <span className={cx('pj-user', className)} title={title ?? u.name}>
      <Avatar user={u} size={size} />
      {name && <span className="pj-user__name truncate">{u.name}</span>}
    </span>
  );
}

export function AvatarStack({ userIds, max = 4, size = 26 }: { userIds: string[]; max?: number; size?: number }) {
  const users = useUserMap();
  const shown = userIds.filter((id) => users.has(id)).slice(0, max);
  const rest = userIds.length - shown.length;
  return (
    <span className="avatar-stack pj-stack" style={{ '--size': `${size}px` } as CSSProperties}>
      {shown.map((id) => (
        <Avatar key={id} user={users.get(id)!} size={size} />
      ))}
      {rest > 0 && (
        <span className="avatar pj-stack__more" style={{ '--size': `${size}px` } as CSSProperties}>
          +{rest}
        </span>
      )}
    </span>
  );
}

// ───────────────────────── pills & glyphs ─────────────────────────
export function Pill({ color, children, className, title, dot = false }: { color: string; children: ReactNode; className?: string; title?: string; dot?: boolean }) {
  return (
    <span className={cx('pj-pill', className)} style={{ '--pill': color } as CSSProperties} title={title}>
      {dot && <i className="pj-pill__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function HealthPill({ health, compact = false }: { health: ProjectHealth; compact?: boolean }) {
  const m = HEALTH_META[health];
  return (
    <Pill color={m.color} dot title={m.label}>
      {compact ? m.label.split(' ')[0] : m.label}
    </Pill>
  );
}

export function StatusPill({ status }: { status: TaskStatus }) {
  const m = STATUS_META[status];
  return (
    <Pill color={m.color} dot>
      {m.label}
    </Pill>
  );
}

export function PriorityFlag({ priority, label = false }: { priority: TaskPriority; label?: boolean }) {
  const m = PRIORITY_META[priority];
  return (
    <span className={cx('pj-prio', priority === 'none' && 'pj-prio--none')} style={{ '--pill': m.color } as CSSProperties} title={m.label}>
      <Flag />
      {label && <span>{m.label}</span>}
    </span>
  );
}

export function TypeGlyph({ type, label = false }: { type: TaskType; label?: boolean }) {
  if (type === 'task' && !label) return null;
  const m = TASK_TYPE_META[type];
  const Icon = type === 'milestone' ? Diamond : type === 'approval' ? Stamp : type === 'bug' ? Bug : Check;
  return (
    <span className="pj-type" style={{ '--pill': m.color } as CSSProperties} title={m.label}>
      <Icon />
      {label && <span>{m.label}</span>}
    </span>
  );
}

export function RoleBadge({ role }: { role: ProjectRole }) {
  const text = role === 'owner' ? 'You’re a project admin' : role === 'editor' ? 'You’re an editor' : role === 'commenter' ? 'You can comment' : 'View only';
  const Icon = role === 'owner' ? ShieldCheck : role === 'editor' ? Pencil : role === 'commenter' ? MessageSquare : Eye;
  return (
    <span className={cx('pj-role', `pj-role--${role}`)} title={ROLE_META[role].description}>
      <Icon />
      {text}
    </span>
  );
}

export function PrivacyBadge({ privacy }: { privacy: Project['privacy'] }) {
  const label = privacy === 'public' ? 'Public' : privacy === 'team' ? 'Team' : 'Private';
  return (
    <span className="pj-privacy" title={PRIVACY_HELP[privacy]}>
      {privacy === 'private' && <Lock />}
      {label}
    </span>
  );
}

export const PRIVACY_HELP: Record<Project['privacy'], string> = {
  public: 'Members, plus your department as editors. Everyone else at Helix can view and comment.',
  team: 'Members, plus everyone in the department as editors. Hidden from other teams.',
  private: 'Invited members only. Workspace admins may view it read-only for governance.',
};

export function ProjectIcon({ project, size = 32 }: { project: Pick<Project, 'icon' | 'color'>; size?: number }) {
  return (
    <span className="pj-picon" style={{ '--c': project.color, '--size': `${size}px` } as CSSProperties} aria-hidden="true">
      {project.icon}
    </span>
  );
}

export function ProjectChip({ project, className, link = true }: { project: Pick<Project, 'id' | 'name' | 'color' | 'icon'>; className?: string; link?: boolean }) {
  const inner = (
    <>
      <i className="pj-chip__dot" style={{ background: project.color }} aria-hidden="true" />
      <span className="truncate">{project.name}</span>
    </>
  );
  if (!link) return <span className={cx('pj-chip', className)}>{inner}</span>;
  return (
    <Link to={`/projects/p/${project.id}`} className={cx('pj-chip', className)} onClick={(e) => e.stopPropagation()} title={project.name}>
      {inner}
    </Link>
  );
}

export function TagChip({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  return (
    <span className="pj-tag">
      #{tag}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove tag ${tag}`}>
          ×
        </button>
      )}
    </span>
  );
}

// ───────────────────────── dates ─────────────────────────
export const fmtDay = (iso: string) => formatDay(iso, { day: 'numeric', month: 'short' });
export const fmtDayFull = (iso: string) => formatDay(iso, { weekday: 'short', day: 'numeric', month: 'short' });

export function dueInfo(dueDate: string | undefined, status: TaskStatus, today = todayISO()): { label: string; tone: 'overdue' | 'today' | 'soon' | 'normal' | 'done' | 'none' } {
  if (!dueDate) return { label: 'No date', tone: 'none' };
  if (status === 'done') return { label: fmtDay(dueDate), tone: 'done' };
  const diff = daysBetween(today, dueDate);
  if (diff < 0) return { label: `${-diff}d overdue`, tone: 'overdue' };
  if (diff === 0) return { label: 'Today', tone: 'today' };
  if (diff === 1) return { label: 'Tomorrow', tone: 'soon' };
  if (diff <= 6) return { label: formatDay(dueDate, { weekday: 'short' }), tone: 'soon' };
  return { label: fmtDay(dueDate), tone: 'normal' };
}

export function DuePill({ dueDate, status, today, showEmpty = false }: { dueDate?: string; status: TaskStatus; today?: string; showEmpty?: boolean }) {
  const info = dueInfo(dueDate, status, today);
  if (info.tone === 'none' && !showEmpty) return null;
  return (
    <span className={cx('pj-due', `pj-due--${info.tone}`)} title={dueDate ? fmtDayFull(dueDate) : 'No due date'}>
      {info.tone === 'overdue' && <AlertTriangle />}
      {info.label}
    </span>
  );
}

// ───────────────────────── progress ─────────────────────────
export function ProgressRing({ pct, size = 72, stroke = 7, color = '#a78bfa', children }: { pct: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <span className="pj-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="pj-ring__track" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="pj-ring__value"
          strokeWidth={stroke}
          stroke={color}
          strokeDasharray={`${(clamped / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="pj-ring__label">{children ?? `${clamped}%`}</span>
    </span>
  );
}

export function Bar({ pct, color, className, height }: { pct: number; color?: string; className?: string; height?: number }) {
  return (
    <span className={cx('pj-bar', className)} style={{ height }} aria-hidden="true">
      <i style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </span>
  );
}

// ───────────────────────── dropdown / menu ─────────────────────────
interface DropdownProps {
  trigger: (open: boolean, toggle: () => void) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  width?: number;
  className?: string;
}

/** Portal-based popover anchored to its trigger; flips upward near the bottom edge and closes on outside click / Escape. */
export function Dropdown({ trigger, children, align = 'left', width = 240, className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const close = useCallback(() => setOpen(false), []);
  useEscapeToClose(open, close);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect();
      if (!a) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(width, vw - 16);
      const popH = popRef.current?.offsetHeight ?? 280;
      let left = align === 'right' ? a.right - w : a.left;
      left = Math.max(8, Math.min(left, vw - w - 8));
      const up = a.bottom + popH + 8 > vh && a.top > popH + 8;
      const top = up ? Math.max(8, a.top - popH - 6) : a.bottom + 6;
      setPos({ top, left });
    };
    place();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align, width]);

  return (
    <>
      <span ref={anchorRef} className={cx('pj-dd', className)}>
        {trigger(open, () => setOpen((o) => !o))}
      </span>
      {open &&
        createPortal(
          <div
            ref={popRef}
            className={cx('pj-pop', pos && 'is-placed')}
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, width: Math.min(width, window.innerWidth - 16) }}
          >
            {children(close)}
          </div>,
          document.body,
        )}
    </>
  );
}

export interface MenuItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  onSelect?: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  hint?: ReactNode;
}

export function Menu({ items, header, footer, ...dd }: { items: MenuItem[]; header?: ReactNode; footer?: ReactNode } & Omit<DropdownProps, 'children'>) {
  return (
    <Dropdown {...dd}>
      {(close) => (
        <div className="pj-menu" role="menu">
          {header && <div className="pj-menu__head">{header}</div>}
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              className={cx('pj-menu__item', it.active && 'is-active', it.danger && 'is-danger')}
              disabled={it.disabled}
              onClick={() => {
                it.onSelect?.();
                close();
              }}
            >
              {it.icon && <span className="pj-menu__icon">{it.icon}</span>}
              <span className="grow truncate">{it.label}</span>
              {it.hint && <span className="pj-menu__hint">{it.hint}</span>}
              {it.active && <Check className="pj-menu__check" />}
            </button>
          ))}
          {footer && <div className="pj-menu__foot">{footer}</div>}
        </div>
      )}
    </Dropdown>
  );
}

/** Searchable people picker. `candidates` are shown first (e.g. project members); `others` behind a search. */
export function UserPicker({
  value,
  onChange,
  candidates,
  others = [],
  allowNone = true,
  trigger,
  align = 'left',
  title = 'Assign to',
  noneLabel = 'Unassigned',
}: {
  value?: string;
  onChange: (userId: string | undefined) => void;
  candidates: User[];
  others?: User[];
  allowNone?: boolean;
  trigger: (open: boolean, toggle: () => void) => ReactNode;
  align?: 'left' | 'right';
  title?: string;
  noneLabel?: string;
}) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const match = (u: User) => !query || u.name.toLowerCase().includes(query) || u.title.toLowerCase().includes(query) || u.department.toLowerCase().includes(query);
  const first = candidates.filter(match);
  const firstIds = new Set(first.map((u) => u.id));
  const rest = others.filter((u) => !firstIds.has(u.id) && match(u)).slice(0, query ? 12 : 0);
  return (
    <Dropdown trigger={trigger} align={align} width={280}>
      {(close) => (
        <div className="pj-menu">
          <div className="pj-menu__head">{title}</div>
          <div className="pj-menu__search">
            <Search />
            <input className="pj-menu__input" placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </div>
          <div className="pj-menu__scroll">
            {allowNone && (
              <button
                type="button"
                className={cx('pj-menu__item', !value && 'is-active')}
                onClick={() => {
                  onChange(undefined);
                  close();
                }}
              >
                <span className="pj-avatar-empty" style={{ '--size': '24px' } as CSSProperties}>
                  <UserRound />
                </span>
                <span className="grow">{noneLabel}</span>
                {!value && <Check className="pj-menu__check" />}
              </button>
            )}
            {first.map((u) => (
              <button
                key={u.id}
                type="button"
                className={cx('pj-menu__item', value === u.id && 'is-active')}
                onClick={() => {
                  onChange(u.id);
                  close();
                }}
              >
                <Avatar user={u} size={24} />
                <span className="grow truncate">
                  {u.name}
                  <small className="pj-menu__sub">{u.title}</small>
                </span>
                {value === u.id && <Check className="pj-menu__check" />}
              </button>
            ))}
            {rest.length > 0 && <div className="pj-menu__group">Everyone else</div>}
            {rest.map((u) => (
              <button
                key={u.id}
                type="button"
                className={cx('pj-menu__item', value === u.id && 'is-active')}
                onClick={() => {
                  onChange(u.id);
                  close();
                }}
              >
                <Avatar user={u} size={24} />
                <span className="grow truncate">
                  {u.name}
                  <small className="pj-menu__sub">
                    {u.title} · {u.department}
                  </small>
                </span>
              </button>
            ))}
            {!first.length && !rest.length && <div className="pj-menu__empty">No one matches “{q}”.</div>}
          </div>
        </div>
      )}
    </Dropdown>
  );
}

// ───────────────────────── layout helpers ─────────────────────────
export function Collapsible({
  title,
  count,
  right,
  defaultOpen = true,
  children,
  className,
  tone,
}: {
  title: ReactNode;
  count?: number;
  right?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  tone?: 'danger' | 'warning' | 'success';
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={cx('pj-collapse', open && 'is-open', tone && `pj-collapse--${tone}`, className)}>
      <header className="pj-collapse__head">
        <button type="button" className="pj-collapse__toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <ChevronRight className="pj-collapse__chev" />
          <span className="pj-collapse__title">{title}</span>
          {count !== undefined && <span className="pj-collapse__count">{count}</span>}
        </button>
        {right && <div className="pj-collapse__right">{right}</div>}
      </header>
      {open && <div className="pj-collapse__body">{children}</div>}
    </section>
  );
}

export function ConfirmModal({
  open,
  onClose,
  title,
  children,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={440}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={cx('btn', danger ? 'btn--danger' : 'btn--primary')}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm muted">{children}</div>
    </Modal>
  );
}

export function SectionTitle({ children, count, right }: { children: ReactNode; count?: number; right?: ReactNode }) {
  return (
    <div className="pj-sec-title">
      <h3>
        {children}
        {count !== undefined && <span className="pj-sec-title__count">{count}</span>}
      </h3>
      {right}
    </div>
  );
}

// ───────────────────────── approvals ─────────────────────────
export function ApprovalActions({ taskId, compact = false, onDone }: { taskId: string; compact?: boolean; onDone?: () => void }) {
  const [mode, setMode] = useState<null | 'changes_requested' | 'rejected'>(null);
  const [note, setNote] = useState('');
  const decide = (decision: 'approved' | 'changes_requested' | 'rejected') => {
    const ok = report(api().decideApproval(taskId, decision, note));
    if (ok) {
      setMode(null);
      setNote('');
      onDone?.();
    }
  };
  return (
    <div className={cx('pj-approve', compact && 'pj-approve--compact')}>
      {mode ? (
        <div className="pj-approve__note">
          <textarea
            className="textarea"
            rows={2}
            placeholder={mode === 'rejected' ? 'Why is this rejected?' : 'What should change?'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            autoFocus
          />
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className={cx('btn btn--sm', mode === 'rejected' ? 'btn--danger' : 'btn--primary')} onClick={() => decide(mode)}>
              {mode === 'rejected' ? 'Reject' : 'Send back'}
            </button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setMode(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="row row--wrap" style={{ gap: 6 }}>
          <button type="button" className="btn btn--sm btn--success" onClick={() => decide('approved')}>
            <Check /> Approve
          </button>
          <button type="button" className="btn btn--sm" onClick={() => setMode('changes_requested')}>
            Request changes
          </button>
          <button type="button" className="btn btn--sm btn--ghost pj-danger-text" onClick={() => setMode('rejected')}>
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── url & shortcuts ─────────────────────────
export function useTaskParam() {
  const [sp, setSp] = useSearchParams();
  const taskId = sp.get('task');
  const open = useCallback(
    (id: string) => {
      const next = new URLSearchParams(sp);
      next.set('task', id);
      setSp(next);
    },
    [sp, setSp],
  );
  const close = useCallback(() => {
    const next = new URLSearchParams(sp);
    next.delete('task');
    setSp(next, { replace: true });
  }, [sp, setSp]);
  return { taskId, open, close };
}

export const QUICK_ADD_EVENT = 'pj:quick-add';
export const emitQuickAdd = () => window.dispatchEvent(new CustomEvent(QUICK_ADD_EVENT));

/** Subscribe to the global `c` shortcut (dispatched by the page shell). */
export function useQuickAddShortcut(handler: () => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const fn = () => ref.current();
    window.addEventListener(QUICK_ADD_EVENT, fn);
    return () => window.removeEventListener(QUICK_ADD_EVENT, fn);
  }, []);
}

export const roleRank = (r: ProjectRole) => ROLE_META[r].rank;
export const isEditorRole = (r: ProjectRole) => roleRank(r) >= ROLE_META.editor.rank;

export const sortTasksByDue = (a: Task, b: Task) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank;

export const pluralize = (n: number, word: string, plural = `${word}s`) => `${n} ${n === 1 ? word : plural}`;
