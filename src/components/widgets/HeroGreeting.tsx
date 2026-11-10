/**
 * Launchpad Nova console — the hub's front-door prompt.
 *
 * The old Home hero is folded into the NEO header (greeting, date) and this
 * console: a Nova prompt that resolves what you type into an app, action,
 * colleague or page (see `novaIntent.ts`), falls back to the ⌘K palette with
 * the text prefilled, and carries the day brief — what's live / next, meetings
 * left, reviews waiting, unread — plus your clearance.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import {
  ArrowRight,
  Bell,
  CalendarClock,
  ClipboardList,
  LayoutGrid,
  Newspaper,
  PartyPopper,
  Radio,
  Search,
  Settings,
  Timer,
  Video,
  X,
  type LucideIcon,
} from 'lucide-react';
import { NeoNovaPrompt } from '@/components/neo';
import { useUI } from '@/store/ui';
import { useClearance, usePrimaryRole, useSessionUser, useUnreadCount } from '@/store/selectors';
import { useNow } from '@/hooks/useNow';
import { buildAgenda } from '@/data/agenda';
import { pluralize } from '@/lib/format';
import { getIcon } from '@/icons';
import { AppIcon, Avatar, ClearanceBadge } from '@/components/ui/primitives';
import { useLaunchApp } from '@/components/apps/useLaunchApp';
import { BRAND } from '@/config/brand';
import { cx } from '@/lib/cx';
import { useNovaIntents, type IntentGlyph, type IntentKind, type NovaResolution } from './novaIntent';

/** Ordered pool of suggested asks; only ones the person can act on right now are shown. */
const SUGGESTIONS = ['Request time off', 'Book travel', 'My payslip', 'Reset my passkey', 'Raise an IT ticket', 'Submit an expense', 'Give kudos', 'Ask Nova Docs', 'Focus mode'];

/** Lucide icons the shared icon registry doesn't carry. */
const EXTRA_ICONS: Record<string, LucideIcon> = { PartyPopper, Timer, ClipboardList, LayoutGrid, Newspaper, Settings };
export const glyphIcon = (name: string): LucideIcon => EXTRA_ICONS[name] ?? getIcon(name);

const KIND_LABEL: Record<IntentKind, string> = { action: 'Action', app: 'App', person: 'Person', page: 'Page' };

export function IntentGlyphView({ glyph, size = 34 }: { glyph: IntentGlyph; size?: number }) {
  if (glyph.kind === 'app') return <AppIcon app={glyph.app} size={size} locked={glyph.locked} />;
  if (glyph.kind === 'user') return <Avatar user={glyph.user} size={size} presence />;
  const Icon = glyphIcon(glyph.icon);
  const style = { '--size': `${size}px`, ...(glyph.gradient ? { '--c1': glyph.gradient[0], '--c2': glyph.gradient[1] } : {}) } as CSSProperties;
  return (
    <span className={cx('lp-glyph', !glyph.gradient && 'lp-glyph--tint')} style={style} aria-hidden="true">
      <Icon />
    </span>
  );
}

export function NovaLaunch() {
  const resolve = useNovaIntents();
  const openPalette = useUI((s) => s.openPalette);
  const [result, setResult] = useState<NovaResolution | null>(null);

  const suggestions = useMemo(() => SUGGESTIONS.filter((s) => resolve(s).confident).slice(0, 4), [resolve]);

  const onSubmit = (text: string) => {
    const r = resolve(text);
    if (r.confident && r.matches[0]) {
      setResult(null);
      r.matches[0].run();
      return;
    }
    if (!r.matches.length) {
      setResult(null);
      openPalette(text);
      return;
    }
    setResult(r);
  };

  return (
    <NeoNovaPrompt
      className="lp-nova"
      hud={`${BRAND.assistant} · Launch console`}
      title="What do you need?"
      badge={
        <>
          <kbd className="lp-kbd">⌘K</kbd> works everywhere
        </>
      }
      placeholder={`Ask ${BRAND.assistant} or jump to an app, person or action…`}
      suggestions={suggestions}
      onSubmit={onSubmit}
      submitLabel="Go"
      submitIcon={<ArrowRight />}
      label={`Ask ${BRAND.assistant}`}
    >
      {result && <NovaResults result={result} onClose={() => setResult(null)} onSearch={() => (setResult(null), openPalette(result.query))} />}
      <DayBrief />
    </NeoNovaPrompt>
  );
}

/** Inline "here's what I found" list when the ask isn't a clear one-shot. */
function NovaResults({ result, onClose, onSearch }: { result: NovaResolution; onClose: () => void; onSearch: () => void }) {
  return (
    <div className="lp-results" role="region" aria-live="polite" aria-label={`${BRAND.assistant} results`}>
      <div className="lp-results__head">
        <span className="neo-hud neo-hud--tint">
          {pluralize(result.matches.length, 'match', 'matches')} for “{result.query}”
        </span>
        <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={onClose} aria-label="Dismiss results">
          <X />
        </button>
      </div>
      <ul className="lp-results__list neo-stagger">
        {result.matches.map((m, i) => (
          <li key={m.id} style={{ ['--i' as string]: i }}>
            <button
              type="button"
              className={cx('lp-result neo-spot', m.locked && 'is-locked')}
              onClick={() => {
                onClose();
                m.run();
              }}
            >
              <IntentGlyphView glyph={m.glyph} />
              <span className="lp-result__text">
                <b className="truncate">{m.title}</b>
                <small className="truncate">{m.detail}</small>
              </span>
              <span className="lp-result__kind neo-hud">{m.locked ? 'Request' : KIND_LABEL[m.kind]}</span>
              <ArrowRight className="lp-result__go" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="lp-results__more" onClick={onSearch}>
        <Search /> Search everything for “{result.query}” <kbd className="lp-kbd">⌘K</kbd>
      </button>
    </div>
  );
}

/** The day at a glance — what used to be the hero's subtitle and chips. */
export function DayBrief() {
  const user = useSessionUser();
  const role = usePrimaryRole();
  const clearance = useClearance();
  const unread = useUnreadCount();
  const launch = useLaunchApp();
  const setNotificationsOpen = useUI((s) => s.setNotificationsOpen);
  const now = useNow(30_000);
  const agenda = useMemo(() => buildAgenda(new Date(now)), [Math.floor(now / 60_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!user) return null;

  const live = agenda.find((e) => e.start.getTime() <= now && e.end.getTime() > now);
  const next = agenda.find((e) => e.start.getTime() > now);
  const meetingsLeft = agenda.filter((e) => e.end.getTime() > now && e.appId === 'meet').length;
  const focus = live ?? next;
  const mins = next ? Math.max(1, Math.round((next.start.getTime() - now) / 60_000)) : 0;

  return (
    <div className="lp-brief" aria-label="Your day">
      {focus ? (
        <div className={cx('lp-brief__now', live && 'is-live')}>
          <span className="lp-brief__tag neo-hud">
            {live ? <Radio /> : <CalendarClock />}
            {live ? 'Live now' : `Next · in ${mins}m`}
          </span>
          <span className="lp-brief__title truncate">{focus.title}</span>
          {live && live.appId === 'meet' ? (
            <button type="button" className="neo-btn neo-btn--plasma neo-btn--xs" onClick={() => launch('meet', `Join “${live.title}”`)}>
              <Video /> Join
            </button>
          ) : (
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => launch(focus.appId)}>
              Open <ArrowRight />
            </button>
          )}
        </div>
      ) : (
        <div className="lp-brief__now">
          <span className="lp-brief__tag neo-hud">
            <CalendarClock /> Clear
          </span>
          <span className="lp-brief__title">Your day looks clear — perfect for deep work.</span>
        </div>
      )}
      <div className="lp-brief__stats">
        {meetingsLeft > 0 && <span className="lp-brief__stat">{pluralize(meetingsLeft, 'meeting')} left</span>}
        {unread > 0 && (
          <button type="button" className="lp-brief__stat" onClick={() => setNotificationsOpen(true)}>
            <Bell /> {unread} unread
          </button>
        )}
        <ClearanceBadge level={clearance} label={role?.name} />
      </div>
    </div>
  );
}

/** @deprecated The hero is now the Launchpad header + `NovaLaunch`. */
export const HeroGreeting = NovaLaunch;
