/**
 * Selectable option cards with radio-group semantics — used by the pipeline
 * modals (rejection reasons, consent method, reply outcome, decision…).
 * Arrow keys move the selection, only the selected card is in the tab order.
 */
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Check, type LucideIcon } from 'lucide-react';
import { cx } from '@/lib/cx';
import { hueVars } from './pipelineUtils';

export type ChoiceTone = 'success' | 'warning' | 'danger' | 'info' | 'accent';

export interface ChoiceOption<T extends string> {
  value: T;
  label: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: ChoiceTone;
  /** Optional hue (0–360) tint instead of a tone. */
  hue?: number;
  disabled?: boolean;
  /** Extra right-aligned content (e.g. a count or score). */
  aside?: ReactNode;
}

export function ChoiceCards<T extends string>({
  options,
  value,
  onChange,
  label,
  columns = 3,
  size = 'md',
  className,
}: {
  options: ChoiceOption<T>[];
  value: T | null;
  onChange: (v: T) => void;
  label: string;
  columns?: 1 | 2 | 3 | 4;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const selected = options.findIndex((o) => o.value === value);
  const tabStop = selected >= 0 && !options[selected].disabled ? selected : enabled[0];

  const onKey = (e: KeyboardEvent, i: number) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir || !enabled.length) return;
    e.preventDefault();
    const pos = Math.max(0, enabled.indexOf(i));
    const next = enabled[(pos + dir + enabled.length) % enabled.length];
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className={cx('tl-mm-choices', `tl-mm-choices--c${columns}`, `tl-mm-choices--${size}`, className)}>
      {options.map((o, i) => {
        const Icon = o.icon;
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={i === tabStop ? 0 : -1}
            disabled={o.disabled}
            className={cx('tl-mm-choice', checked && 'is-selected', o.tone && `tl-mm-choice--${o.tone}`, o.hue !== undefined && 'tl-mm-choice--hue')}
            style={o.hue !== undefined ? hueVars(o.hue) : undefined}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {Icon && (
              <span className="tl-mm-choice__icon" aria-hidden="true">
                <Icon />
              </span>
            )}
            <span className="tl-mm-choice__text">
              <span className="tl-mm-choice__label">{o.label}</span>
              {o.hint && <span className="tl-mm-choice__hint">{o.hint}</span>}
            </span>
            {o.aside}
            <span className="tl-mm-choice__check" aria-hidden="true">
              <Check />
            </span>
          </button>
        );
      })}
    </div>
  );
}
