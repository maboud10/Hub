/**
 * Shared Helix Projects UI atoms (Neo-kit based).
 */
import { useCallback, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { Bot, CalendarDays, ChevronLeft, ChevronRight, Diamond, Lock, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { Avatar } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { MenuList, NeoPopover, type MenuEntry, type MenuTriggerProps, type PopPlacement, type Tone } from '@/components/neo';
import { cx } from '@/lib/cx';
import { MONTHS, addDays, dueState, formatDue, iso, parseIso, startOfWeek, todayIso } from '@/projects/dates';
import { STATUS_LABEL } from '@/projects/metrics';
import { PRIORITY_NAME } from '@/projects/nlp';
import type { Priority, Project, ProjectStatus, TaskKind } from '@/projects/types';
import { ProjectSigil } from '@/projects/sigils';
import { useUndo, useUsersMap } from './ctx';

export const PRIORITY_TONE: Record<Priority, Tone> = { urgent: 'rose', high: 'orange', medium: 'amber', low: 'blue', none: 'slate' };
export const STATUS_TONE: Record<ProjectStatus, Tone> = { 'on-track': 'emerald', 'at-risk': 'amber', 'off-track': 'rose', 'on-hold': 'slate', complete: 'violet' };
export const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low', 'none'];
export const STATUSES: ProjectStatus[] = ['on-track', 'at-risk', 'off-track', 'on-hold', 'complete'];

/* ───────────── glyphs ───────────── */

export function ProjectGlyph({ project, size = 28, className }: { project: Pick<Project, 'icon' | 'color' | 'name'> | undefined; size?: number; className?: string }) {
  if (!project)
    return (
      <span className={cx('pj-glyph pj-glyph--me', className)} style={{ '--g': `${size}px` } as CSSProperties} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.85} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8.4" opacity={0.42} />
          <path d="m8.3 12.2 2.4 2.4 5.2-5.3" />
          <circle cx="18.6" cy="6.6" r="1.35" fill="currentColor" stroke="none" />
        </svg>
      </span>
    );
  return <ProjectSigil icon={project.icon} color={project.color} size={size} className={className} />;
}

export function StatusPill({ status, size = 'sm' }: { status: ProjectStatus; size?: 'sm' | 'md' }) {
  return (
    <span className={cx('pj-status', size === 'md' && 'pj-status--md')} data-tone={STATUS_TONE[status]}>
      <i className="pj-status__orb" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityGlyph({ priority, title }: { priority: Priority; title?: string }) {
  const label = title ?? `Priority: ${PRIORITY_NAME[priority]}`;
  if (priority === 'urgent')
    return (
      <span className="pj-prio pj-prio--urgent" role="img" aria-label={label} title={label}>
        !
      </span>
    );
  const lit = priority === 'high' ? 3 : priority === 'medium' ? 2 : priority === 'low' ? 1 : 0;
  return (
    <span className="pj-prio" data-p={priority} role="img" aria-label={label} title={label}>
      {[0, 1, 2].map((i) => (
        <i key={i} className={i < lit ? 'on' : undefined} style={{ height: 5 + i * 3 }} />
      ))}
    </span>
  );
}

export function KindGlyph({ kind }: { kind: TaskKind }) {
  if (kind === 'milestone') return <Diamond className="pj-kind pj-kind--ms" aria-label="Milestone" />;
  if (kind === 'approval') return <ShieldCheck className="pj-kind pj-kind--ap" aria-label="Approval" />;
  return null;
}

export function DueChip({ due, time, done, className }: { due?: string; time?: string; done?: boolean; className?: string }) {
  if (!due) return null;
  const st = done ? null : dueState(due);
  return (
    <span className={cx('pj-due', className)} data-state={st ?? 'none'} title={due}>
      <CalendarDays aria-hidden="true" />
      {formatDue(due, Date.now(), time)}
    </span>
  );
}

export function BlockedBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="pj-blocked" title={`Waiting on ${count} ${count === 1 ? 'task' : 'tasks'}`}>
      <Lock aria-hidden="true" />
      Blocked
    </span>
  );
}

export function UserAvatar({ id, size = 24, presence }: { id: string | null | undefined; size?: number; presence?: boolean }) {
  const users = useUsersMap();
  if (id === 'automation')
    return (
      <span className="pj-bot" style={{ '--g': `${size}px` } as CSSProperties} aria-label="Automation">
        <Bot />
      </span>
    );
  const u = id ? users.get(id) : undefined;
  if (!u) return <span className="pj-avatar-empty" style={{ '--g': `${size}px` } as CSSProperties} aria-label="Unassigned" />;
  return <Avatar user={u} size={size} presence={presence} />;
}

/* ───────────── animated completion check ───────────── */

export function TaskCheck({
  done,
  onToggle,
  disabled,
  size = 20,
  kind = 'task',
  label,
  reason,
}: {
  done: boolean;
  onToggle: (e: ReactMouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  size?: number;
  kind?: TaskKind;
  label?: string;
  reason?: string;
}) {
  const [pop, setPop] = useState(false);
  return (
    <button
      type="button"
      className={cx('pj-check', done && 'is-done', pop && 'is-pop', kind === 'milestone' && 'pj-check--ms')}
      style={{ '--s': `${size}px` } as CSSProperties}
      aria-pressed={done}
      aria-label={label ?? (done ? 'Mark incomplete' : 'Mark complete')}
      title={disabled ? reason : undefined}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!done) {
          setPop(true);
          window.setTimeout(() => setPop(false), 650);
        }
        onToggle(e);
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {kind === 'milestone' ? <path className="pj-check__ring" d="M12 2.6 21.4 12 12 21.4 2.6 12Z" /> : <circle className="pj-check__ring" cx="12" cy="12" r="9.4" />}
        <path className="pj-check__tick" d="M7.4 12.4 10.6 15.5 16.8 8.9" />
      </svg>
    </button>
  );
}

/* ───────────── date picker ───────────── */

export function DatePicker({
  value,
  onChange,
  trigger,
  placement = 'bottom-start',
  allowClear = true,
  label = 'Pick a date',
}: {
  value?: string;
  onChange: (v: string | undefined) => void;
  trigger: (p: MenuTriggerProps) => ReactNode;
  placement?: PopPlacement;
  allowClear?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const [cursor, setCursor] = useState(() => (value ?? todayIso()).slice(0, 7) + '-01');
  const close = useCallback(() => setOpen(false), []);
  const today = todayIso();
  const days = useMemo(() => {
    const first = startOfWeek(cursor);
    return Array.from({ length: 42 }, (_, i) => addDays(first, i));
  }, [cursor]);
  const month = parseIso(cursor);
  const pick = (v: string | undefined) => {
    onChange(v);
    setOpen(false);
  };
  const quick = [
    { label: 'Today', v: today },
    { label: 'Tomorrow', v: addDays(today, 1) },
    { label: 'Next week', v: addDays(startOfWeek(today), 7) },
    { label: 'In 2 weeks', v: addDays(today, 14) },
  ];
  return (
    <>
      {trigger({
        ref: btn,
        onClick: (e) => {
          e.stopPropagation();
          setCursor((value ?? todayIso()).slice(0, 7) + '-01');
          setOpen((o) => !o);
        },
        'aria-expanded': open,
        'aria-haspopup': 'menu',
      })}
      <NeoPopover open={open} anchor={btn.current} onClose={close} placement={placement} width={272} label={label} className="pj-datepop">
        <div className="pj-datepop__quick">
          {quick.map((q) => (
            <button key={q.label} type="button" className={cx('pj-datepop__q', value === q.v && 'is-on')} onClick={() => pick(q.v)}>
              <span>{q.label}</span>
              <span className="neo-faint">{formatDue(q.v)}</span>
            </button>
          ))}
        </div>
        <div className="pj-datepop__head">
          <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label="Previous month" onClick={() => setCursor(iso(new Date(month.getFullYear(), month.getMonth() - 1, 1)))}>
            <ChevronLeft />
          </button>
          <span className="pj-datepop__month">
            {MONTHS[month.getMonth()]} {month.getFullYear()}
          </span>
          <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label="Next month" onClick={() => setCursor(iso(new Date(month.getFullYear(), month.getMonth() + 1, 1)))}>
            <ChevronRight />
          </button>
        </div>
        <div className="pj-datepop__grid" role="grid" aria-label={label}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <span key={i} className="pj-datepop__dow">
              {d}
            </span>
          ))}
          {days.map((d) => {
            const inMonth = d.slice(0, 7) === cursor.slice(0, 7);
            return (
              <button
                key={d}
                type="button"
                className={cx('pj-datepop__day', !inMonth && 'is-out', d === today && 'is-today', d === value && 'is-on')}
                onClick={() => pick(d)}
                aria-label={formatDue(d)}
                aria-pressed={d === value}
              >
                {Number(d.slice(8))}
              </button>
            );
          })}
        </div>
        {allowClear && value && (
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs neo-btn--block" onClick={() => pick(undefined)}>
            <X /> Clear date
          </button>
        )}
      </NeoPopover>
    </>
  );
}

/* ───────────── menus ───────────── */

export function priorityEntries(value: Priority, onChange: (p: Priority) => void): MenuEntry[] {
  return PRIORITIES.map((p) => ({ label: PRIORITY_NAME[p], icon: <PriorityGlyph priority={p} />, checked: value === p, onSelect: () => onChange(p) }));
}

export function PriorityMenu({ value, onChange, trigger, disabled }: { value: Priority; onChange: (p: Priority) => void; trigger: (p: MenuTriggerProps) => ReactNode; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      {trigger({
        ref: btn,
        onClick: (e) => {
          e.stopPropagation();
          if (!disabled) setOpen((o) => !o);
        },
        'aria-expanded': open,
        'aria-haspopup': 'menu',
      })}
      <NeoPopover open={open} anchor={btn.current} onClose={close} placement="bottom-start" width={200} label="Priority">
        <MenuList items={priorityEntries(value, onChange)} onDone={close} />
      </NeoPopover>
    </>
  );
}

/* ───────────── confirm ───────────── */

export function ConfirmModal({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={440}
      className="neo-portal pj-modal"
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={cx('neo-btn', danger ? 'neo-btn--danger' : 'neo-btn--plasma')}
            onClick={() => {
              onConfirm();
              onClose();
            }}
            data-qa="confirm"
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="neo-muted" style={{ fontSize: 14, lineHeight: 1.55 }}>
        {children}
      </div>
    </Modal>
  );
}

/* ───────────── undo bar ───────────── */

export function UndoBar() {
  const item = useUndo((s) => s.item);
  const run = useUndo((s) => s.run);
  const dismiss = useUndo((s) => s.dismiss);
  if (!item) return null;
  return (
    <div className="pj-undo" role="status" aria-live="polite" key={item.id}>
      <span className="pj-undo__timer" aria-hidden="true" />
      <span className="pj-undo__label truncate">{item.label}</span>
      <button type="button" className="pj-undo__btn" onClick={run} data-qa="undo">
        <RotateCcw /> Undo
      </button>
      <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label="Dismiss" onClick={dismiss}>
        <X />
      </button>
    </div>
  );
}

/* ───────────── markdown-lite ───────────── */

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|@[A-Z][\p{L}'-]+)/gu;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(<strong key={`${keyBase}-${i++}`}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={`${keyBase}-${i++}`}>{tok.slice(1, -1)}</code>);
    else out.push(<span key={`${keyBase}-${i++}`} className="pj-mention">{tok}</span>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Paragraphs, `- bullets`, **bold**, `code` and @mentions. */
export function MarkdownLite({ text, className }: { text: string; className?: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className={cx('pj-md', className)}>
      {blocks.map((b, bi) => {
        const lines = b.split('\n');
        if (lines.every((l) => /^\s*[-*]\s+/.test(l)))
          return (
            <ul key={bi}>
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*[-*]\s+/, ''), `${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <span key={li}>
                {li > 0 && <br />}
                {inline(l, `${bi}-${li}`)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}
