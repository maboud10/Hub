import { useHub } from '@/store/hub';
import { useI18n } from '@/lib/i18n';
import type { AccentId, LocaleId, NumeralSystem, ThemeMode } from '@/types';

/**
 * DEV-ONLY helper for demos and visual QA:
 *   /?persona=u-omar&theme=light&accent=violet&lang=ar&numerals=arab
 * Stripped from production builds via `import.meta.env.DEV`.
 */
export function devBootstrap() {
  if (!import.meta.env.DEV) return;
  const params = new URLSearchParams(window.location.search);
  const lang = params.get('lang') as LocaleId | null;
  const numerals = params.get('numerals') as NumeralSystem | null;
  if (lang === 'ar' || lang === 'en') {
    useI18n.getState().setLocale(lang, true);
  }
  if (numerals === 'arab' || numerals === 'latn') {
    useI18n.getState().setNumerals(numerals);
  }
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
    if (lang === 'ar' || lang === 'en') store.updatePrefs({ locale: lang });
    if (numerals === 'arab' || numerals === 'latn') store.updatePrefs({ numerals });
    if (params.has('collapsed')) store.updatePrefs({ sidebarCollapsed: true });
  }
}
