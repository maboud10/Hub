import { useState, type CSSProperties } from 'react';
import { AlignJustify, Check, LayoutGrid, LayoutList, Monitor, Moon, Orbit, Palette, Rows3, Sun, Waves } from 'lucide-react';
import type { AccentId, ThemeMode, User, UserPrefs } from '@/types';
import { useHub } from '@/store/hub';
import { usePrefs } from '@/store/selectors';
import { Segmented, Switch } from '@/components/ui/primitives';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { firstName, greeting } from '@/lib/format';
import { cx } from '@/lib/cx';
import { SettingRow, SettingsSection, SubHead } from './SettingsSection';

/** Swatch colours mirror the accent palettes defined in tokens.css. */
export const ACCENTS: { id: AccentId; label: string; from: string; to: string }[] = [
  { id: 'cyan', label: 'Cyan', from: '#22d3ee', to: '#8b5cf6' },
  { id: 'violet', label: 'Violet', from: '#a78bfa', to: '#ec4899' },
  { id: 'magenta', label: 'Magenta', from: '#f472b6', to: '#fb923c' },
  { id: 'lime', label: 'Lime', from: '#a3e635', to: '#22d3ee' },
  { id: 'amber', label: 'Amber', from: '#fbbf24', to: '#f43f5e' },
];

const THEME_LABEL: Record<ThemeMode, string> = { dark: 'Dark', light: 'Light', system: 'System' };

export function AppearanceSection({ me }: { me: User }) {
  const prefs = usePrefs();
  const updatePrefs = useHub((s) => s.updatePrefs);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const systemReduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  /** Hover/focus a swatch to preview it before committing. */
  const [previewAccent, setPreviewAccent] = useState<AccentId | null>(null);

  const set = (patch: Partial<UserPrefs>) => updatePrefs(patch);
  const resolvedTheme = prefs.theme === 'system' ? (systemDark ? 'dark' : 'light') : prefs.theme;
  const shownAccent = previewAccent ?? prefs.accent;
  const accentLabel = ACCENTS.find((a) => a.id === shownAccent)?.label ?? shownAccent;

  return (
    <SettingsSection id="appearance" icon={<Palette />} title="Appearance" description="Make NEXUS yours. Changes apply instantly and are saved to your profile.">
      <div className="set-appearance">
        <div className="set-appearance__controls">
          <SettingRow
            className="set-row--wide"
            icon={resolvedTheme === 'dark' ? <Moon /> : <Sun />}
            title="Theme"
            description={prefs.theme === 'system' ? `Following your system — currently ${resolvedTheme}.` : 'Dark for the full neon effect, light for daylight.'}
          >
            <Segmented<ThemeMode>
              label="Theme"
              value={prefs.theme}
              onChange={(theme) => set({ theme })}
              options={[
                { value: 'dark', label: 'Dark', icon: <Moon /> },
                { value: 'light', label: 'Light', icon: <Sun /> },
                { value: 'system', label: 'System', icon: <Monitor /> },
              ]}
            />
          </SettingRow>

          <div className="set-row set-row--stack">
            <span className="set-row__icon" aria-hidden="true">
              <Palette />
            </span>
            <div className="set-row__text">
              <div className="set-row__title" id="set-accent-label">
                Accent
              </div>
              <div className="set-row__desc">Hover to preview, click to apply.</div>
            </div>
            <div className="set-swatches" role="group" aria-labelledby="set-accent-label" onMouseLeave={() => setPreviewAccent(null)}>
              {ACCENTS.map((a) => {
                const active = prefs.accent === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={cx('set-swatch', active && 'is-active')}
                    style={{ '--sw-from': a.from, '--sw-to': a.to } as CSSProperties}
                    aria-pressed={active}
                    aria-label={`${a.label} accent`}
                    data-tip={a.label}
                    onMouseEnter={() => setPreviewAccent(a.id)}
                    onFocus={() => setPreviewAccent(a.id)}
                    onBlur={() => setPreviewAccent(null)}
                    onClick={() => set({ accent: a.id })}
                  >
                    {active && <Check aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>

          <SettingRow
            className="set-row--wide"
            icon={prefs.density === 'compact' ? <AlignJustify /> : <Rows3 />}
            title="Density"
            description="Compact fits more on screen; comfortable breathes."
          >
            <Segmented<UserPrefs['density']>
              label="Density"
              value={prefs.density}
              onChange={(density) => set({ density })}
              options={[
                { value: 'comfortable', label: 'Comfortable', icon: <Rows3 /> },
                { value: 'compact', label: 'Compact', icon: <AlignJustify /> },
              ]}
            />
          </SettingRow>

          <SettingRow
            className="set-row--wide"
            icon={prefs.tileView === 'list' ? <LayoutList /> : <LayoutGrid />}
            title="Default app view"
            description="How the Apps launchpad lays out your tools."
          >
            <Segmented<UserPrefs['tileView']>
              label="Default app view"
              value={prefs.tileView}
              onChange={(tileView) => set({ tileView })}
              options={[
                { value: 'grid', label: 'Grid', icon: <LayoutGrid /> },
                { value: 'list', label: 'List', icon: <LayoutList /> },
              ]}
            />
          </SettingRow>

          <SettingRow icon={<Orbit />} title="Ambient background effects" description="Aurora glow, HUD grid and film grain behind the interface.">
            <Switch checked={prefs.ambient} onChange={(ambient) => set({ ambient })} label="Ambient background effects" />
          </SettingRow>

          <SettingRow
            icon={<Waves />}
            title="Reduce motion"
            description={
              systemReduced && !prefs.reducedMotion
                ? 'Your system already asks for reduced motion, so animations stay minimal.'
                : 'Tone down animations, parallax and transitions.'
            }
          >
            <Switch checked={prefs.reducedMotion} onChange={(reducedMotion) => set({ reducedMotion })} label="Reduce motion" />
          </SettingRow>
        </div>

        <div className="set-appearance__preview">
          <SubHead>Live preview</SubHead>
          <div
            className={cx('set-preview', prefs.tileView === 'list' && 'is-list', prefs.ambient && 'has-ambient')}
            data-accent={shownAccent}
            data-density={prefs.density}
            aria-hidden="true"
          >
            <div className="set-preview__chrome">
              <i />
              <i />
              <i />
              <span className="mono">nexus://home</span>
            </div>
            <div className="set-preview__body">
              <div className="set-preview__aurora" />
              <div className="set-preview__eyebrow mono">{greeting()}</div>
              <div className="set-preview__title">
                {firstName(me.name)}
                <span className="set-preview__caret" />
              </div>
              <div className="set-preview__apps">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className="set-preview__app" style={{ '--n': i } as CSSProperties}>
                    <b />
                    <em />
                  </span>
                ))}
              </div>
              <div className="set-preview__progress">
                <span />
              </div>
              <div className="set-preview__row">
                <span className="set-preview__btn">Launch</span>
                <span className="set-preview__chip">● Focus 25:00</span>
                <span className="set-preview__switch" />
              </div>
            </div>
          </div>
          <div className="set-preview__caption mono">
            {accentLabel} · {THEME_LABEL[prefs.theme]}
            {prefs.theme === 'system' ? ` (${resolvedTheme})` : ''} · {prefs.density}
            {previewAccent && previewAccent !== prefs.accent && <span className="accent-ink"> · previewing</span>}
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}
