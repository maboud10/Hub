/** Icon / gradient pickers and the live launchpad-tile preview used by the app editors. */
import type { CSSProperties } from 'react';
import { ArrowUpRight, EyeOff } from 'lucide-react';
import { AppIcon } from '@/components/ui/primitives';
import { APP_ICON_CHOICES, getIcon, type IconName } from '@/icons';
import type { AppCategory, AppStatus } from '@/types';
import { GRADIENT_PRESETS } from './shared';

const sameGradient = (a: [string, string], b: [string, string]) =>
  a[0].toLowerCase() === b[0].toLowerCase() && a[1].toLowerCase() === b[1].toLowerCase();

export function IconPicker({ value, onChange, labelledBy }: { value: IconName; onChange: (v: IconName) => void; labelledBy: string }) {
  const choices = APP_ICON_CHOICES.includes(value) ? APP_ICON_CHOICES : [value, ...APP_ICON_CHOICES];
  return (
    <div className="adm-icon-grid" role="radiogroup" aria-labelledby={labelledBy}>
      {choices.map((name) => {
        const Icon = getIcon(name);
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={value === name}
            aria-label={name}
            data-tip={name}
            className="adm-icon-opt"
            onClick={() => onChange(name)}
          >
            <Icon aria-hidden="true" strokeWidth={1.8} />
          </button>
        );
      })}
    </div>
  );
}

export function GradientPicker({
  value,
  onChange,
  labelledBy,
}: {
  value: [string, string];
  onChange: (g: [string, string]) => void;
  labelledBy: string;
}) {
  const presets = GRADIENT_PRESETS.some((g) => sameGradient(g, value)) ? GRADIENT_PRESETS : [value, ...GRADIENT_PRESETS];
  return (
    <div className="adm-grad-grid" role="radiogroup" aria-labelledby={labelledBy}>
      {presets.map((g, i) => (
        <button
          key={`${g[0]}-${g[1]}`}
          type="button"
          role="radio"
          aria-checked={sameGradient(g, value)}
          aria-label={`Gradient ${i + 1}: ${g[0]} to ${g[1]}`}
          className="adm-grad-opt"
          style={{ '--c1': g[0], '--c2': g[1] } as CSSProperties}
          onClick={() => onChange(g)}
        />
      ))}
    </div>
  );
}

const STATUS_TEXT: Record<AppStatus, string> = { operational: 'Operational', degraded: 'Degraded', maintenance: 'Maintenance' };

export function TilePreview({
  name,
  tagline,
  category,
  icon,
  gradient,
  badge,
  discoverable,
  status = 'operational',
}: {
  name: string;
  tagline: string;
  category: AppCategory;
  icon: IconName;
  gradient: [string, string];
  badge?: 'new' | 'beta' | null;
  discoverable: boolean;
  status?: AppStatus;
}) {
  const app = { icon, gradient };
  return (
    <div className="adm-preview" aria-label="Live tile preview">
      <div className="adm-micro adm-preview__label">
        <span className="dot dot--pulse" aria-hidden="true" /> Live preview
      </div>
      <div className="adm-tile" style={{ '--c1': gradient[0], '--c2': gradient[1] } as CSSProperties}>
        <span className="adm-tile__glow" aria-hidden="true" />
        <div className="row row--between row--top">
          <AppIcon app={app} size={54} />
          {badge && <span className="badge badge--solid">{badge.toUpperCase()}</span>}
        </div>
        <div className="adm-tile__text">
          <div className="adm-tile__name truncate">{name.trim() || 'Untitled app'}</div>
          <div className="adm-tile__tagline clamp-2">{tagline.trim() || 'A short tagline that says what it does'}</div>
        </div>
        <div className="row text-xs faint">
          <span className={`dot dot--${status}`} aria-hidden="true" /> {STATUS_TEXT[status]}
          <span className="spacer" />
          <span className="tag">{category}</span>
          <ArrowUpRight className="adm-tile__go" aria-hidden="true" />
        </div>
      </div>
      <div className="adm-preview__variants">
        <div className="adm-preview__variant">
          <AppIcon app={app} size={40} />
          <span className="text-xs muted">Dock</span>
        </div>
        <div className="adm-preview__variant">
          {discoverable ? (
            <AppIcon app={app} size={40} locked />
          ) : (
            <span className="adm-preview__hidden" aria-hidden="true">
              <EyeOff />
            </span>
          )}
          <span className="text-xs muted">{discoverable ? 'Locked tile' : 'Hidden'}</span>
        </div>
      </div>
      <p className="text-xs faint">
        {discoverable
          ? 'People without access see a locked tile and can request it.'
          : 'Not discoverable — only people with access will see it.'}
      </p>
    </div>
  );
}
