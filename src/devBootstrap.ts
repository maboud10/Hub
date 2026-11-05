import { useHub } from '@/store/hub';
import type { AccentId, ThemeMode } from '@/types';

/**
 * DEV-ONLY helper for demos and visual QA:
 *   /?persona=u-omar&theme=light&accent=violet
 * Stripped from production builds via `import.meta.env.DEV`.
 */
export function devBootstrap() {
  if (!import.meta.env.DEV) return;
  const params = new URLSearchParams(window.location.search);
  const persona = params.get('persona');
  if (!persona) return;
  const store = useHub.getState();
  if (params.has('reset')) {
    store.resetDemo();
    localStorage.removeItem('nexus-talent');
    localStorage.removeItem('nexus-hr');
  }
  if (store.login(persona).ok) {
    const theme = params.get('theme') as ThemeMode | null;
    const accent = params.get('accent') as AccentId | null;
    if (theme) store.updatePrefs({ theme });
    if (accent) store.updatePrefs({ accent });
    if (params.has('collapsed')) store.updatePrefs({ sidebarCollapsed: true });
  }
}
