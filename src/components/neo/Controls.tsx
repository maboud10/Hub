import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, Search, X } from 'lucide-react';
import type { User } from '@/types';
import { useHub } from '@/store/hub';
import { Avatar } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';

/* ==========================================================================
   Tabs with sliding ink
   ========================================================================== */

export interface NeoTabItem<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  count?: number | null;
  title?: string;
}

export function NeoTabs<T extends string>({
  value,
  onChange,
  items,
  variant = 'pill',
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: NeoTabItem<T>[];
  variant?: 'pill' | 'underline';
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ink, setInk] = useState<{ x: number; w: number } | null>(null);

  const measure = useCallback(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    setInk(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
  }, []);

  useLayoutEffect(measure, [value, items.length, measure]);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = items.findIndex((it) => it.value === value);
    const next = items[(i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length];
    if (next) {
      onChange(next.value);
      requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
    }
  };

  return (
    <div ref={ref} role="tablist" aria-label={label} className={cx('neo-tabs', variant === 'underline' && 'neo-tabs--underline', className)} onKeyDown={onKey}>
      {ink && <span className="neo-tabs__ink" style={{ width: ink.w, translate: `${ink.x}px 0` }} aria-hidden="true" />}
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          role="tab"
          aria-selected={it.value === value}
          tabIndex={it.value === value ? 0 : -1}
          className="neo-tab"
          title={it.title}
          onClick={() => onChange(it.value)}
        >
          {it.icon}
          {it.label}
          {it.count !== undefined && it.count !== null && <span className="neo-count">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ==========================================================================
   Popover (portal, auto-flip, outside click / Esc to close)
   ========================================================================== */

export type PopAnchor = HTMLElement | DOMRect | { x: number; y: number } | null;
export type PopPlacement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end' | 'right-start' | 'left-start';

function anchorRect(a: PopAnchor): DOMRect | null {
  if (!a) return null;
  if (a instanceof HTMLElement) return a.getBoundingClientRect();
  if ('width' in a) return a;
  return new DOMRect(a.x, a.y, 0, 0);
}

export function NeoPopover({
  open,
  anchor,
  onClose,
  placement = 'bottom-start',
  width,
  className,
  children,
  label,
  autoFocus = true,
}: {
  open: boolean;
  anchor: PopAnchor;
  onClose: () => void;
  placement?: PopPlacement;
  width?: number;
  className?: string;
  children: ReactNode;
  label?: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; origin: string } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const r = anchorRect(anchor);
      const el = ref.current;
      if (!r || !el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const gap = 6;
      let left = r.left;
      let top = r.bottom + gap;
      let originY = 'top';
      let originX = 'left';
      if (placement.endsWith('end')) {
        left = r.right - w;
        originX = 'right';
      }
      if (placement.startsWith('top')) {
        top = r.top - h - gap;
        originY = 'bottom';
      }
      if (placement === 'right-start') {
        left = r.right + gap;
        top = r.top;
      }
      if (placement === 'left-start') {
        left = r.left - w - gap;
        top = r.top;
        originX = 'right';
      }
      // flip vertically when overflowing
      if (top + h > vh - 8 && r.top - h - gap > 8) {
        top = r.top - h - gap;
        originY = 'bottom';
      }
      if (top < 8) top = Math.min(r.bottom + gap, vh - h - 8);
      left = Math.max(8, Math.min(left, vw - w - 8));
      top = Math.max(8, Math.min(top, vh - h - 8));
      setPos({ left, top, origin: `${originY} ${originX}` });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, anchor, placement]);

  // focus first item
  useEffect(() => {
    if (!open || !autoFocus) return;
    const id = requestAnimationFrame(() => {
      const el = ref.current?.querySelector<HTMLElement>('input, [role="menuitem"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled), [role="option"], button:not(:disabled)');
      el?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [open, autoFocus]);

  // outside click / Esc / scroll-away
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (anchor instanceof HTMLElement && anchor.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        if (anchor instanceof HTMLElement) anchor.focus({ preventScroll: true });
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, anchor, onClose]);

  if (!open) return null;
  const style: CSSProperties = {
    left: pos?.left ?? -9999,
    top: pos?.top ?? -9999,
    width,
    visibility: pos ? 'visible' : 'hidden',
    ['--pop-origin' as string]: pos?.origin,
  };
  return createPortal(
    <div ref={ref} className={cx('neo-portal neo-pop', className)} style={style} role="dialog" aria-label={label}>
      {children}
    </div>,
    document.body,
  );
}

/* ==========================================================================
   Menus
   ========================================================================== */

export type MenuEntry =
  | {
      kind?: 'item';
      label: ReactNode;
      icon?: ReactNode;
      hint?: ReactNode;
      danger?: boolean;
      disabled?: boolean;
      /** Renders a check mark slot (menuitemcheckbox). */
      checked?: boolean;
      onSelect: () => void;
    }
  | { kind: 'sep' }
  | { kind: 'label'; label: ReactNode };

/** Plain list of menu entries with arrow-key roving focus. */
export function MenuList({ items, onDone }: { items: MenuEntry[]; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: ReactKeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const els = [...(ref.current?.querySelectorAll<HTMLElement>('.neo-menu__item:not(:disabled)') ?? [])];
    if (!els.length) return;
    const i = els.indexOf(document.activeElement as HTMLElement);
    let n = 0;
    if (e.key === 'ArrowDown') n = (i + 1) % els.length;
    if (e.key === 'ArrowUp') n = (i - 1 + els.length) % els.length;
    if (e.key === 'End') n = els.length - 1;
    els[n]?.focus();
  };
  return (
    <div ref={ref} role="menu" onKeyDown={onKey}>
      {items.map((it, i) => {
        if (it.kind === 'sep') return <div key={`s${i}`} className="neo-menu__sep" role="separator" />;
        if (it.kind === 'label')
          return (
            <div key={`l${i}`} className="neo-menu__label">
              {it.label}
            </div>
          );
        const checkable = it.checked !== undefined;
        return (
          <button
            key={i}
            type="button"
            role={checkable ? 'menuitemcheckbox' : 'menuitem'}
            aria-checked={checkable ? it.checked : undefined}
            disabled={it.disabled}
            className={cx('neo-menu__item', it.danger && 'neo-menu__item--danger')}
            onClick={() => {
              onDone();
              it.onSelect();
            }}
          >
            {it.icon}
            <span className="grow truncate">{it.label}</span>
            {it.hint && <span className="neo-menu__hint">{it.hint}</span>}
            {checkable && <Check className="neo-menu__check" />}
          </button>
        );
      })}
    </div>
  );
}

export interface MenuTriggerProps {
  ref: Ref<HTMLButtonElement>;
  onClick: (e: ReactMouseEvent<HTMLElement>) => void;
  'aria-expanded': boolean;
  'aria-haspopup': 'menu';
}

/**
 * Dropdown menu with a render-prop trigger:
 *   <NeoMenu items={[…]} trigger={(p) => <button {...p} className="neo-iconbtn"><MoreHorizontal/></button>} />
 */
export function NeoMenu({
  items,
  trigger,
  placement = 'bottom-end',
  width,
  label = 'Menu',
}: {
  items: MenuEntry[];
  trigger: (props: MenuTriggerProps) => ReactNode;
  placement?: PopPlacement;
  width?: number;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      {trigger({
        ref: btn,
        onClick: (e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        },
        'aria-expanded': open,
        'aria-haspopup': 'menu',
      })}
      <NeoPopover open={open} anchor={btn.current} onClose={close} placement={placement} width={width} label={label}>
        <MenuList items={items} onDone={close} />
      </NeoPopover>
    </>
  );
}

/**
 * Right-click menus:
 *   const ctx = useContextMenu();
 *   <div onContextMenu={(e) => ctx.open(e, items)} />  {ctx.element}
 */
export function useContextMenu() {
  const [state, setState] = useState<{ x: number; y: number; items: MenuEntry[] } | null>(null);
  const close = useCallback(() => setState(null), []);
  const open = useCallback((e: ReactMouseEvent | { clientX: number; clientY: number; preventDefault?: () => void }, items: MenuEntry[]) => {
    e.preventDefault?.();
    setState({ x: e.clientX, y: e.clientY, items });
  }, []);
  const anchor = useMemo(() => (state ? { x: state.x, y: state.y } : null), [state]);
  const element = (
    <NeoPopover open={!!state} anchor={anchor} onClose={close} label="Context menu">
      {state && <MenuList items={state.items} onDone={close} />}
    </NeoPopover>
  );
  return { open, close, element, isOpen: !!state };
}

/* ==========================================================================
   Search field
   ========================================================================== */

export function NeoSearch({
  value,
  onChange,
  placeholder = 'Search…',
  kbd,
  inputRef,
  onKeyDown,
  className,
  autoFocus,
  label,
  size,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Hint rendered on the right, e.g. "/" or "⌘F". */
  kbd?: string;
  inputRef?: Ref<HTMLInputElement>;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
  className?: string;
  autoFocus?: boolean;
  label?: string;
  size?: 'sm';
}) {
  return (
    <label className={cx('neo-search', className)}>
      <Search />
      <input
        ref={inputRef}
        className={cx('neo-input', size === 'sm' && 'neo-input--sm')}
        value={value}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.stopPropagation();
            onChange('');
          }
          onKeyDown?.(e);
        }}
      />
      {value ? (
        <button
          type="button"
          className="neo-iconbtn neo-iconbtn--sm"
          style={{ position: 'absolute', right: 6 }}
          onClick={() => onChange('')}
          aria-label="Clear search"
        >
          <X />
        </button>
      ) : (
        kbd && <kbd className="kbd">{kbd}</kbd>
      )}
    </label>
  );
}

/* ==========================================================================
   People picker (single or multi) backed by the NEXUS directory
   ========================================================================== */

export function PeoplePicker({
  value,
  onChange,
  multiple = false,
  users: usersProp,
  trigger,
  placement = 'bottom-start',
  label = 'Choose people',
  allowNone = false,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  /** Candidate people (defaults to every active NEXUS user). */
  users?: User[];
  trigger: (props: MenuTriggerProps) => ReactNode;
  placement?: PopPlacement;
  label?: string;
  /** Single mode: show an "Unassigned" option. */
  allowNone?: boolean;
}) {
  const all = useHub((s) => s.users);
  const users = useMemo(() => (usersProp ?? all).filter((u) => u.active), [usersProp, all]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    setQ('');
  }, []);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const filtered = s ? users.filter((u) => `${u.name} ${u.title} ${u.department}`.toLowerCase().includes(s)) : users;
    // selected first
    return [...filtered].sort((a, b) => Number(value.includes(b.id)) - Number(value.includes(a.id)));
  }, [q, users, value]);

  const toggle = (id: string) => {
    if (multiple) onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
    else {
      onChange([id]);
      close();
    }
  };

  return (
    <>
      {trigger({
        ref: btn,
        onClick: (e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        },
        'aria-expanded': open,
        'aria-haspopup': 'menu',
      })}
      <NeoPopover open={open} anchor={btn.current} onClose={close} placement={placement} width={300} label={label}>
        <div className="neo-pop__search">
          <NeoSearch value={q} onChange={setQ} placeholder="Search people…" size="sm" autoFocus />
        </div>
        <div role="listbox" aria-multiselectable={multiple} aria-label={label}>
          {allowNone && !multiple && (
            <button
              type="button"
              role="option"
              aria-selected={value.length === 0}
              className="neo-menu__item"
              onClick={() => {
                onChange([]);
                close();
              }}
            >
              <span className="avatar" style={{ ['--size' as string]: '26px', background: 'var(--surface-3)' }}>
                –
              </span>
              <span className="grow">Unassigned</span>
              {value.length === 0 && <Check style={{ color: 'var(--app-ink)' }} />}
            </button>
          )}
          {list.map((u) => {
            const on = value.includes(u.id);
            return (
              <button key={u.id} type="button" role="option" aria-selected={on} className="neo-menu__item" onClick={() => toggle(u.id)}>
                <Avatar user={u} size={26} presence />
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="truncate" style={{ display: 'block', color: 'var(--text)', fontWeight: 600 }}>
                    {u.name}
                  </span>
                  <span className="truncate" style={{ display: 'block', fontSize: 11.5, color: 'var(--text-3)' }}>
                    {u.title}
                  </span>
                </span>
                {on && <Check style={{ color: 'var(--app-ink)' }} />}
              </button>
            );
          })}
          {list.length === 0 && <div className="neo-menu__label">No one matches “{q}”</div>}
        </div>
      </NeoPopover>
    </>
  );
}
