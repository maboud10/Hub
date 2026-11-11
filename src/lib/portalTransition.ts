/**
 * Portal transitions — the shared-element "dive" between the Hub and an app.
 *
 * Launch:  the app icon you clicked (tile, pinned dock, sidebar pin, palette)
 *          flies into the app rail's brand tile while the app irises open
 *          from that icon; the Hub sidebar steps aside as the app rail slides in.
 * Return:  the reverse — the app irises shut into its rail icon, which flies
 *          back home into its Launchpad tile.
 * Switch:  app → app — the rail icon morphs into the next app's icon.
 *
 * Built on the View Transitions API (Chrome/Edge 111+, Safari 18+, Firefox 144+).
 * Returns `false` (and does nothing) when unsupported or with reduced motion,
 * so callers simply navigate. Styles: `styles/shell.css` → "Portal transitions".
 */

export type PortalKind = 'launch' | 'return' | 'switch';

interface ViewTransitionLike {
  finished: Promise<void>;
}
type DocumentWithVT = Document & { startViewTransition?: (update: () => Promise<void> | void) => ViewTransitionLike };

const ICON_NAME = 'nexus-app-icon';
let lastPointer: { x: number; y: number; target: Element | null } | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (e) => {
      lastPointer = { x: e.clientX, y: e.clientY, target: e.target instanceof Element ? e.target : null };
    },
    { capture: true, passive: true },
  );
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = document.activeElement;
      if (!(el instanceof HTMLElement)) return;
      const r = el.getBoundingClientRect();
      lastPointer = { x: r.left + r.width / 2, y: r.top + r.height / 2, target: el };
    },
    { capture: true, passive: true },
  );
}

const isVisible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
};

/** The app icon closest to what was just clicked, else the first visible icon for the app. */
function iconFor(appId: string | undefined, near?: Element | null): HTMLElement | null {
  if (near) {
    const own =
      near.closest<HTMLElement>('[data-app-icon]') ??
      near.closest('a, button, [role="button"], [role="option"], li')?.querySelector<HTMLElement>('[data-app-icon]') ??
      null;
    if (own && (!appId || own.dataset.appIcon === appId) && isVisible(own)) return own;
  }
  if (!appId) return null;
  return [...document.querySelectorAll<HTMLElement>(`[data-app-icon="${CSS.escape(appId)}"]`)].find(isVisible) ?? null;
}

function until(check: () => boolean, timeout = 1500): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      if (check() || performance.now() - t0 > timeout) resolve();
      else window.setTimeout(tick, 16);
    };
    tick();
  });
}

function reducedMotion() {
  return document.documentElement.dataset.motion === 'reduced' || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Navigate with a portal transition. Returns `false` when no transition was
 * started — the caller should then navigate normally.
 */
export function portalNavigate(navigate: (to: string) => void, to: string, { kind, appId }: { kind: PortalKind; appId?: string }): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as DocumentWithVT;
  const root = document.documentElement;
  if (!doc.startViewTransition || reducedMotion() || root.dataset.vt) return false;

  const fromApp = document.querySelector<HTMLElement>('.neo')?.dataset.app ?? 'hub';
  const src = kind === 'launch' ? iconFor(appId, lastPointer?.target) : document.querySelector<HTMLElement>('.neo-rail__brand');
  const rect = src && isVisible(src) ? src.getBoundingClientRect() : null;
  root.style.setProperty('--vt-x', `${rect ? rect.left + rect.width / 2 : (lastPointer?.x ?? window.innerWidth / 2)}px`);
  root.style.setProperty('--vt-y', `${rect ? rect.top + rect.height / 2 : (lastPointer?.y ?? window.innerHeight / 2)}px`);
  root.dataset.vt = kind;

  const named: HTMLElement[] = [];
  if (rect && src) {
    src.style.viewTransitionName = ICON_NAME;
    named.push(src);
  }

  const cleanup = () => {
    delete root.dataset.vt;
    for (const el of named) el.style.viewTransitionName = '';
  };

  try {
    const vt = doc.startViewTransition(async () => {
      if (src) src.style.viewTransitionName = '';
      navigate(to);
      // Route chunks are lazy: wait until the destination has really rendered.
      await until(() => {
        const neo = document.querySelector<HTMLElement>('.neo');
        const app = neo?.dataset.app ?? 'hub';
        if (app === fromApp) return false;
        return kind === 'return' ? true : !!neo?.querySelector('.neo-rail__brand');
      });
      if (!named.length) return;
      const dest = kind === 'return' ? iconFor(appId) : document.querySelector<HTMLElement>('.neo-rail__brand');
      if (dest) {
        dest.style.viewTransitionName = ICON_NAME;
        named.push(dest);
      }
    });
    vt.finished.then(cleanup, cleanup);
  } catch {
    cleanup();
    return false;
  }
  return true;
}
