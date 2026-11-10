import { useEffect } from 'react';
import { usePrefs } from '@/store/selectors';
import { useDomTranslator } from '@/lib/domTranslator';
import { useI18n } from '@/lib/i18n';
import { useMediaQuery } from './useMediaQuery';

/** Resolved theme ('dark' | 'light') from prefs + OS setting. */
export function useResolvedTheme(): 'dark' | 'light' {
  const prefs = usePrefs();
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  return prefs.theme === 'system' ? (systemDark ? 'dark' : 'light') : prefs.theme;
}

/** Applies the signed-in user's appearance & language preferences to <html>. */
export function useApplyTheme() {
  const prefs = usePrefs();
  const theme = useResolvedTheme();
  const systemReduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const locale = useI18n((s) => s.locale);
  const numerals = useI18n((s) => s.numerals);

  useDomTranslator();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.accent = prefs.accent;
    root.dataset.density = prefs.density;
    root.dataset.motion = prefs.reducedMotion || systemReduced ? 'reduced' : 'full';
    root.dataset.ambient = prefs.ambient ? 'on' : 'off';
    root.dataset.locale = locale;
    root.dataset.numerals = numerals;
    root.lang = locale;
    root.dir = locale === 'ar' ? 'rtl' : 'ltr';
    root.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#05060d' : '#eef1f8');
  }, [theme, prefs.accent, prefs.density, prefs.reducedMotion, prefs.ambient, systemReduced, locale, numerals]);

  return theme;
}
