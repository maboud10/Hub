/**
 * "Move to…" menu — the keyboard- and touch-friendly alternative to dragging
 * a pipeline card. Lists every stage (disallowed ones explain why), plus
 * close-out / reopen / open profile. Rendered in a portal so it is never
 * clipped by the board's scroll containers.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRightLeft, ChevronDown, IdCard, Lock, RotateCcw, UserX } from 'lucide-react';
import type { Application, Requisition } from '@/talent/types';
import { STAGE_BY_ID } from '@/talent/constants';
import { useTalentCaps, useTalentViewer } from '@/talent/selectors';
import { useTalent } from '@/talent/store';
import { useTalentUI } from '@/talent/ui';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { actionVerdict, firstName, moveTargets, stageVars, type MoveTarget } from './pipelineUtils';

export function MoveMenu({
  app,
  req,
  name,
  variant = 'icon',
  showProfile = false,
  className,
}: {
  app: Application;
  req: Requisition | undefined;
  name: string;
  variant?: 'icon' | 'button';
  showProfile?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const viewer = useTalentViewer();
  const caps = useTalentCaps();
  const reopenApplication = useTalent((s) => s.reopenApplication);
  const targets = useMemo(() => moveTargets(viewer, app, req), [viewer, app, req]);
  const active = app.status === 'active';
  const canClose = active && actionVerdict('reject', viewer, app, req).ok;
  const canReopen = (app.status === 'rejected' || app.status === 'withdrawn') && caps.manage;
  const anyMove = targets.some((t) => t.ok);
  const first = firstName(name);

  const place = useCallback(() => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const w = menuRef.current?.offsetWidth ?? 252;
    const h = menuRef.current?.offsetHeight ?? 380;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const below = vh - r.bottom;
    const up = below < h + 12 && r.top > below;
    const top = up ? Math.max(8, r.top - h - 6) : Math.max(8, Math.min(vh - h - 8, r.bottom + 6));
    const left = Math.min(Math.max(8, r.right - w), vw - w - 8);
    setPos({ top, left, up });
  }, []);

  const close = useCallback((refocus = false) => {
    setOpen(false);
    setPos(null);
    if (refocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close();
    };
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      close();
    };
    const onResize = () => close();
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    const raf = requestAnimationFrame(() => {
      const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
      const firstEnabled = items && [...items].find((el) => el.getAttribute('aria-disabled') !== 'true');
      (firstEnabled ?? items?.[0])?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, close]);

  if (!anyMove && !canClose && !canReopen && !showProfile) return null;

  const choose = (t: MoveTarget) => {
    if (t.current) return;
    if (!t.ok) {
      toast.info(`Can’t move ${first} to ${STAGE_BY_ID[t.stage].label}`, t.reason);
      return;
    }
    close();
    useTalentUI.getState().openModal({ kind: 'move', applicationId: app.id, to: t.stage });
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const idx = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => items[(i + items.length) % items.length]?.focus();
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        go(idx + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        go(idx - 1);
        break;
      case 'Home':
        e.preventDefault();
        go(0);
        break;
      case 'End':
        e.preventDefault();
        go(items.length - 1);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
      case 'Tab':
        close();
        break;
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={cx(variant === 'icon' ? 'icon-btn icon-btn--sm' : 'btn btn--sm', 'tl-pipe-menu-trigger', open && 'is-open', className)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={variant === 'icon' ? `Move ${name} to another stage` : undefined}
        title={variant === 'icon' ? 'Move to…' : undefined}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (open) close();
          else setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <ArrowRightLeft aria-hidden="true" />
        {variant === 'button' && (
          <>
            Move <ChevronDown aria-hidden="true" className="tl-pipe-menu-trigger__chev" />
          </>
        )}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={`Move ${name}`}
            className={cx('tl-pipe-menu', pos?.up && 'is-up')}
            style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}
            onKeyDown={onMenuKey}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="tl-pipe-menu__head" aria-hidden="true">
              Move {first} to…
            </div>
            {targets.map((t) => {
              const m = STAGE_BY_ID[t.stage];
              const Icon = m.icon;
              return (
                <button
                  key={t.stage}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  aria-disabled={!t.ok || undefined}
                  className={cx('tl-pipe-menu__item', t.current && 'is-current', !t.ok && !t.current && 'is-disabled')}
                  style={stageVars(t.stage)}
                  title={!t.ok && !t.current ? t.reason : m.description}
                  onClick={() => choose(t)}
                >
                  <span className="tl-pipe-menu__icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span className="tl-pipe-menu__label">{m.label}</span>
                  {t.current ? (
                    <span className="tl-pipe-menu__tag">Now</span>
                  ) : !t.ok ? (
                    <Lock className="tl-pipe-menu__lock" aria-hidden="true" />
                  ) : t.stage === 'hired' ? (
                    <span className="tl-pipe-menu__tag">via offer</span>
                  ) : t.backwards ? (
                    <span className="tl-pipe-menu__tag">back</span>
                  ) : null}
                  {!t.ok && !t.current && <span className="sr-only">. Unavailable: {t.reason}</span>}
                </button>
              );
            })}
            {(canClose || canReopen || showProfile) && <div className="tl-pipe-menu__sep" role="separator" />}
            {canClose && (
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                className="tl-pipe-menu__item tl-pipe-menu__item--danger"
                onClick={() => {
                  close();
                  useTalentUI.getState().openModal({ kind: 'reject', applicationId: app.id });
                }}
              >
                <span className="tl-pipe-menu__icon" aria-hidden="true">
                  <UserX />
                </span>
                <span className="tl-pipe-menu__label">Close out…</span>
              </button>
            )}
            {canReopen && (
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                className="tl-pipe-menu__item"
                onClick={() => {
                  close();
                  toast.result(reopenApplication(app.id));
                }}
              >
                <span className="tl-pipe-menu__icon" aria-hidden="true">
                  <RotateCcw />
                </span>
                <span className="tl-pipe-menu__label">Reopen in {STAGE_BY_ID[app.stage].label}</span>
              </button>
            )}
            {showProfile && (
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                className="tl-pipe-menu__item"
                onClick={() => {
                  close();
                  useTalentUI.getState().openCandidate(app.candidateId);
                }}
              >
                <span className="tl-pipe-menu__icon" aria-hidden="true">
                  <IdCard />
                </span>
                <span className="tl-pipe-menu__label">Open profile</span>
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
