/**
 * Launchpad "Customize" popover — toggle Home widgets and the tile layout in
 * place (mirrors Settings › Home widgets, which stays the full editor).
 */
import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Activity, ArrowRight, Award, Cake, CalendarDays, LayoutGrid, LayoutList, Newspaper, Signal, SlidersHorizontal, Timer, type LucideIcon } from 'lucide-react';
import type { WidgetId } from '@/types';
import { NeoPopover } from '@/components/neo';
import { useHub } from '@/store/hub';
import { usePrefs } from '@/store/selectors';
import { cx } from '@/lib/cx';

export const WIDGET_META: { id: WidgetId; label: string; hint: string; icon: LucideIcon }[] = [
  { id: 'agenda', label: 'Today’s agenda', hint: 'Next meetings & events', icon: CalendarDays },
  { id: 'focus', label: 'Focus timer', hint: 'Pomodoro + “Focusing” status', icon: Timer },
  { id: 'news', label: 'Newsroom digest', hint: 'Announcements for you', icon: Newspaper },
  { id: 'pulse', label: 'Daily pulse', hint: 'Anonymous mood check-in', icon: Activity },
  { id: 'kudos', label: 'Kudos wall', hint: 'Recent recognition', icon: Award },
  { id: 'status', label: 'System status', hint: 'Live health of your apps', icon: Signal },
  { id: 'celebrations', label: 'Celebrations', hint: 'Birthdays & anniversaries', icon: Cake },
];

/** Read-modify-write against the live store so rapid toggles never clobber each other. */
function liveWidgets() {
  const s = useHub.getState();
  return s.sessionUserId ? s.prefs[s.sessionUserId]?.widgets : undefined;
}

export function CustomizeButton() {
  const prefs = usePrefs();
  const updatePrefs = useHub((s) => s.updatePrefs);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const on = WIDGET_META.filter((w) => prefs.widgets[w.id] !== false).length;
  const all = on === WIDGET_META.length;

  const setWidget = (id: WidgetId, value: boolean) => updatePrefs({ widgets: { ...(liveWidgets() ?? prefs.widgets), [id]: value } });
  const setAll = (value: boolean) => updatePrefs({ widgets: Object.fromEntries(WIDGET_META.map((w) => [w.id, value])) as Record<WidgetId, boolean> });

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="neo-btn neo-btn--soft"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-tip="Widgets & layout"
        data-qa="home-customize"
      >
        <SlidersHorizontal /> <span className="neo-btn__label">Customize</span>
      </button>
      <NeoPopover open={open} anchor={btn.current} onClose={close} placement="bottom-end" width={330} label="Customize Launchpad" className="lp-custom">
        <div className="lp-custom__head">
          <div className="lp-custom__titles">
            <div className="neo-hud neo-hud--tint">Launchpad</div>
            <div className="lp-custom__title">Make it yours</div>
          </div>
          <span className="neo-count" title="Widgets shown">
            {on}/{WIDGET_META.length}
          </span>
        </div>

        <div className="neo-menu__label">Tile layout</div>
        <div className="lp-custom__seg" role="group" aria-label="Tile layout">
          <button type="button" aria-pressed={prefs.tileView === 'grid'} onClick={() => updatePrefs({ tileView: 'grid' })}>
            <LayoutGrid /> Grid
          </button>
          <button type="button" aria-pressed={prefs.tileView === 'list'} onClick={() => updatePrefs({ tileView: 'list' })}>
            <LayoutList /> List
          </button>
        </div>

        <div className="neo-menu__label lp-custom__label">
          <span>Widgets</span>
          <button type="button" className="lp-custom__all" onClick={() => setAll(!all)}>
            {all ? 'Hide all' : 'Show all'}
          </button>
        </div>
        <div role="group" aria-label="Widgets">
          {WIDGET_META.map((w) => {
            const checked = prefs.widgets[w.id] !== false;
            const Icon = w.icon;
            return (
              <button key={w.id} type="button" role="switch" aria-checked={checked} className="neo-menu__item lp-custom__item" onClick={() => setWidget(w.id, !checked)}>
                <Icon />
                <span className="lp-custom__text">
                  <span className="lp-custom__name">{w.label}</span>
                  <span className="lp-custom__hint">{w.hint}</span>
                </span>
                <span className={cx('lp-switch', checked && 'is-on')} aria-hidden="true">
                  <i />
                </span>
              </button>
            );
          })}
        </div>
        <div className="neo-menu__sep" />
        <Link to="/settings#widgets" className="neo-menu__item lp-custom__more" onClick={close}>
          <SlidersHorizontal />
          <span className="grow">All Home settings</span>
          <ArrowRight />
        </Link>
      </NeoPopover>
    </>
  );
}
