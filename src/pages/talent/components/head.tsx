/**
 * Talent Hub header slot — lets a view put its own section actions into the
 * NEO stage header (NeoHead) instead of rendering a second, duplicated header
 * inside the body. The shell (TalentPage) owns the header; views portal into it:
 *
 *   <HeadActions>
 *     <button className="neo-btn neo-btn--soft">…</button>
 *   </HeadActions>
 *
 * Actions rendered this way keep their state and handlers inside the view.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export const HeadSlotContext = createContext<HTMLElement | null>(null);

/** Renders `children` inside the stage header's action area (before the shell's own actions). */
export function HeadActions({ children }: { children: ReactNode }) {
  const slot = useContext(HeadSlotContext);
  return slot ? createPortal(children, slot) : null;
}

/** Scrolls the closest scrolling ancestor (NEO stage body on desktop, the window on phones) so `el` is in view. */
export function scrollStageTo(el: HTMLElement | null, offset = 12, smooth = true) {
  if (!el) return;
  let parent: HTMLElement | null = el.parentElement;
  while (parent) {
    const oy = getComputedStyle(parent).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && parent.scrollHeight > parent.clientHeight) break;
    parent = parent.parentElement;
  }
  const reduced = document.documentElement.dataset.motion === 'reduced' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const behavior: ScrollBehavior = smooth && !reduced ? 'smooth' : 'auto';
  if (parent) {
    const top = el.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop - offset;
    if (parent.scrollTop > top) parent.scrollTo({ top, behavior });
    return;
  }
  const top = el.getBoundingClientRect().top + window.scrollY - 84;
  if (window.scrollY > top) window.scrollTo({ top, behavior });
}
