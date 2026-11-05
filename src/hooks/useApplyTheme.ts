import { useEffect } from 'react';
import { usePrefs } from '@/store/selectors';
import { useMediaQuery } from './useMediaQuery';

/** Resolved theme ('dark' | 'light') from prefs + OS setting. */
export function useResolvedTheme(): 'dark' | 'light' {
  const prefs = usePrefs();
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  return prefs.theme === 'system' ? (systemDark ? 'dark' : 'light') : prefs.theme;
}

/** Applies the signed-in user's appearance preferences to <html>. */
export function useApplyTheme() {
  const prefs = usePrefs();
  const theme = useResolvedTheme();
  const systemReduced = useMediaQuery('(prefers-reduced-motion: reduce)');

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.accent = prefs.accent;
    root.dataset.density = prefs.density;
    root.dataset.motion = prefs.reducedMotion || systemReduced ? 'reduced' : 'full';
    root.dataset.ambient = prefs.ambient ? 'on' : 'off';
    root.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#05060d' : '#eef1f8');
  }, [theme, prefs.accent, prefs.density, prefs.reducedMotion, prefs.ambient, systemReduced]);

  return theme;
}
