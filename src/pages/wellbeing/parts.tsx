/**
 * Helix Wellbeing — shared UI bits: hooks over the person's private record,
 * live snapshots of other apps (Calendar, HR Portal, Mail) loaded lazily
 * through dynamic imports / the App Bridge, small accessible controls and the
 * cross-app actions (calendar holds, walk-and-talks, leave, chat, claims).
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Brain, Crosshair, Footprints, Leaf, Lock, Moon, Users } from 'lucide-react';
import { currentViewer, loadBridge, type BridgeCard, type BridgeChannel } from '@/lib/appBridge';
import { useHub } from '@/store/hub';
import { useFocus } from '@/store/focus';
import { useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { useNow } from '@/hooks/useNow';
import { cx } from '@/lib/cx';
import { translateToArabic, useI18n } from '@/lib/i18n';
import {
  afterHoursEvents,
  auraVisual,
  bestBridgeDay,
  calmMinutes,
  checkinStreak,
  daysSinceLastLeave,
  daysUntilNextLeave,
  energyForecast,
  findFreeGap,
  freeNowMinutes,
  hourOf,
  isMine,
  meetingStats,
  prescribe,
  previousCheckin,
  privateHold,
  readDimensions,
  rechargeScore,
  scoresOf,
  stepsOn,
  todaysCheckin,
  userDayEvents,
  weakest,
  weekActiveMinutes,
} from '@/wellbeing/engine';
import { isoDay, seedUserWellbeing, startOfDay } from '@/wellbeing/seed';
import { useWellbeing } from '@/wellbeing/store';
import type { CalEventLite, DimensionId, HrClaimLite, LeaveLite, MailRhythmLite, UserWellbeing } from '@/wellbeing/types';

const DAY = 86_400_000;

/**
 * Locale-aware copy for strings that mix words with live values (toasts,
 * prefilled drafts). Static UI stays English and is translated by the shell's
 * DOM translator; only these composed strings need an explicit Arabic form.
 */
export const isArabic = () => useI18n.getState().locale === 'ar';
export const say = (en: string, ar: string) => (isArabic() ? ar : en);
/** Reactive locale for components that prefill composed text (re-run effects on toggle). */
export const useLocale = () => useI18n((s) => s.locale);
/** Arabic form of a known label (team, city, category) — falls back to the English label. */
export const arLabel = (label: string) => translateToArabic(label);

/** Opens the page-level 20-second check-in dialog. */
export const CheckInCtx = createContext<() => void>(() => undefined);
export const useOpenCheckIn = () => useContext(CheckInCtx);

/** Modal dialog behaviour: focus the first control, keep Tab inside, Esc closes, focus returns on close. */
export function useDialogA11y(ref: { current: HTMLElement | null }, onClose: () => void, firstSelector = '[role="radio"][tabindex="0"], input, textarea, select, button') {
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>(firstSelector)?.focus({ preventScroll: true }));
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !ref.current) return;
      const els = [...ref.current.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), textarea, select, [tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null);
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey, true);
      prev?.focus?.({ preventScroll: true });
    };
  }, [ref, onClose, firstSelector]);
}

/* ───────────────────────── session record ───────────────────────── */

/** The signed-in person and their private wellbeing record (seeded on first visit). */
export function useMe() {
  const me = useSessionUser();
  const uid = me?.id ?? '';
  const rec = useWellbeing((s) => (uid ? s.users[uid] : undefined));
  const ensureUser = useWellbeing((s) => s.ensureUser);
  useEffect(() => {
    if (uid && !rec) ensureUser(uid);
  }, [uid, rec, ensureUser]);
  const fallback = useMemo(() => seedUserWellbeing(uid || 'anon'), [uid]);
  return { me, uid, data: (rec ?? fallback) as UserWellbeing };
}

/* ───────────────────────── live snapshots of other apps ───────────────────────── */

/** Helix Calendar events, loaded lazily and kept in sync (never a static import). */
export function useCalendarEvents(): CalEventLite[] {
  const [events, setEvents] = useState<CalEventLite[]>([]);
  useEffect(() => {
    let alive = true;
    let unsub: (() => void) | undefined;
    import('@/calendar/store')
      .then(({ useCalendar }) => {
        if (!alive) return;
        setEvents(useCalendar.getState().events);
        unsub = useCalendar.subscribe((s, prev) => {
          if (s.events !== prev.events) setEvents(s.events);
        });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      unsub?.();
    };
  }, []);
  return events;
}

export interface HrSnapshot {
  ready: boolean;
  leave: LeaveLite[];
  claims: HrClaimLite[];
  holidays: ReadonlySet<string>;
}

const EMPTY_SET: ReadonlySet<string> = new Set();

/** HR Portal leave, benefit claims and the public holidays for a location. */
export function useHrSnapshot(location?: string): HrSnapshot {
  const [snap, setSnap] = useState<HrSnapshot>({ ready: false, leave: [], claims: [], holidays: EMPTY_SET });
  useEffect(() => {
    let alive = true;
    let unsub: (() => void) | undefined;
    Promise.all([import('@/hr/store'), import('@/hr/calendar')])
      .then(([store, cal]) => {
        if (!alive) return;
        const holidays = cal.holidaySet(location ?? '');
        const pick = () => {
          const s = store.useHr.getState();
          setSnap({ ready: true, leave: s.leave, claims: s.claims, holidays });
        };
        pick();
        unsub = store.useHr.subscribe((s, prev) => {
          if (s.leave !== prev.leave || s.claims !== prev.claims) pick();
        });
      })
      .catch(() => alive && setSnap((x) => ({ ...x, ready: true })));
    return () => {
      alive = false;
      unsub?.();
    };
  }, [location]);
  return snap;
}

/** Inbox load + after-hours sending from Helix Mail (zeros until Mail has data). */
export function useMailRhythm(): MailRhythmLite & { ready: boolean; live: boolean } {
  const [r, setR] = useState<MailRhythmLite & { ready: boolean; live: boolean }>({ afterHoursSentThisWeek: 0, unread: 0, avgReplyMins: 0, ready: false, live: false });
  const uid = useHub((s) => s.sessionUserId);
  useEffect(() => {
    let alive = true;
    const viewer = currentViewer();
    if (!viewer) return;
    loadBridge('mail')
      .then((m) => {
        if (!alive) return;
        const v = m.rhythm(viewer);
        const safe = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, n) : 0);
        const out = { afterHoursSentThisWeek: safe(v?.afterHoursSentThisWeek), unread: safe(v?.unread), avgReplyMins: safe(v?.avgReplyMins) };
        setR({ ...out, ready: true, live: out.afterHoursSentThisWeek + out.unread + out.avgReplyMins > 0 });
      })
      .catch(() => alive && setR((x) => ({ ...x, ready: true })));
    return () => {
      alive = false;
    };
  }, [uid]);
  return r;
}

/** OS "reduce motion" or the hub's own motion preference. */
export function useReducedMotion(): boolean {
  const read = () =>
    typeof document !== 'undefined' &&
    (document.documentElement.dataset.motion === 'reduced' || (typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
  const [reduced, setReduced] = useState(read);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(read());
    mq?.addEventListener?.('change', on);
    const mo = new MutationObserver(on);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
    return () => {
      mq?.removeEventListener?.('change', on);
      mo.disconnect();
    };
  }, []);
  return reduced;
}

/* ───────────────────────── the Aura model ───────────────────────── */

/** Everything Aura derives for the signed-in person (re-evaluated every minute). */
export function useAuraModel() {
  const { me, uid, data } = useMe();
  const events = useCalendarEvents();
  const hr = useHrSnapshot(me?.location);
  const kudos = useHub((s) => s.kudos);
  const users = useHub((s) => s.users);
  const focusMode = useFocus((s) => s.mode);
  const now = useNow(60_000);

  return useMemo(() => {
    const today = isoDay(now);
    const hourNow = hourOf(now);
    const checkin = todaysCheckin(data.checkins, today);
    const previous = previousCheckin(data.checkins, today);
    const meeting = meetingStats(events, uid, 0);
    const myToday = userDayEvents(events, uid, 0);
    const oneOnOnesWeek = events.filter((e) => e.category === '1on1' && isMine(e, uid) && e.dayOffset >= -2 && e.dayOffset <= 4).length;
    const kudos30d = kudos.filter((k) => k.toId === uid && k.at >= now - 30 * DAY).length;
    const calmWeek = calmMinutes(data.breaths, startOfDay(now) - 6 * DAY);
    const afterHours = afterHoursEvents(events, uid, data.quiet, now);
    const stepsToday = stepsOn(data, today, now);
    const weekMins = weekActiveMinutes(data, now);

    const readings = readDimensions({
      checkin,
      previous,
      stepsToday,
      stepGoal: data.stepGoal,
      weekActiveMins: weekMins,
      meeting,
      oneOnOnesWeek,
      circles: data.circles.length,
      kudos30d,
      calmMinsWeek: calmWeek,
      afterHours,
    });
    const scores = scoresOf(readings);
    const estimate = rechargeScore(scores);
    const recharge = checkin ? estimate : null;
    const visual = auraVisual(readings, recharge);

    const gap = findFreeGap(events, { userId: uid, nowHour: hourNow, durationMins: 25 });
    const hrDays = hr.ready ? daysSinceLastLeave(hr.leave, uid, today) : null;
    const daysSinceLeave = hrDays ?? data.lastLeaveDaysAgo;
    const daysUntilLeave = hr.ready ? daysUntilNextLeave(hr.leave, uid, today) : null;
    const bridgeDay = bestBridgeDay(today, hr.holidays);

    const nameOf = (id: string) => users.find((u) => u.id === id)?.name.split(' ')[0] ?? 'your colleague';
    const oneOnOnes = events
      .filter((e) => e.category === '1on1' && isMine(e, uid) && !/^walk & talk/i.test(e.title) && (e.dayOffset > 0 || (e.dayOffset === 0 && e.startHour > hourNow)) && e.dayOffset <= 4)
      .sort((a, b) => a.dayOffset - b.dayOffset || a.startHour - b.startHour);
    const next1on1 = oneOnOnes[0];
    const oneOnOne = next1on1
      ? { eventId: next1on1.id, startHour: next1on1.startHour, dayOffset: next1on1.dayOffset, withName: nameOf(next1on1.attendeeIds.find((a) => a !== uid) ?? next1on1.organizerId) }
      : null;

    const rx = checkin
      ? prescribe({
          checkin,
          meeting,
          gap: gap ? { dayOffset: gap.dayOffset, startHour: gap.startHour } : null,
          oneOnOne,
          focusRunning: focusMode !== 'idle',
          freeNowMins: freeNowMinutes(events, uid, hourNow),
          daysSinceLeave,
          daysUntilLeave,
          bridgeDay,
          stepsToday,
          stepGoal: data.stepGoal,
          hourNow,
          quietStart: data.quiet.enabled ? data.quiet.startHour : 21,
        })
      : [];

    const forecast = energyForecast({ events: myToday, checkin: checkin ?? previous, peakFrom: hourNow });
    return {
      uid,
      me,
      data,
      now,
      today,
      hourNow,
      events,
      myToday,
      checkin,
      previous,
      meeting,
      readings,
      scores,
      estimate,
      recharge,
      visual,
      weakest: weakest(readings),
      gap,
      daysSinceLeave,
      daysUntilLeave,
      bridgeDay,
      rx,
      forecast,
      stepsToday,
      calmWeek,
      streak: checkinStreak(data.checkins, today),
      hr,
    };
  }, [data, events, hr, kudos, users, focusMode, now, uid, me]);
}

export type AuraModel = ReturnType<typeof useAuraModel>;

/* ───────────────────────── small components ───────────────────────── */

/** Persistent "Only you can see this" lock chip for personal data. */
export function PrivateChip({ compact }: { compact?: boolean }) {
  return (
    <span className={cx('wb-private', compact && 'wb-private--compact')} title="Private to you. Never shared with your manager, People Ops or admins.">
      <Lock aria-hidden="true" />
      <span>Only you can see this</span>
    </span>
  );
}

export const DIM_ICON: Record<DimensionId, ReactNode> = {
  sleep: <Moon />,
  movement: <Footprints />,
  focus: <Crosshair />,
  connection: <Users />,
  calm: <Leaf />,
};

export function DimIcon({ id }: { id: DimensionId }) {
  return <span className="wb-dimicon" data-dim={id} aria-hidden="true">{DIM_ICON[id] ?? <Brain />}</span>;
}

export interface RadioOption<T extends string | number> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  /** Accessible name when the visible label is an emoji/icon. */
  aria?: string;
  title?: string;
}

/** Accessible radiogroup of pills with roving focus (arrow keys follow reading direction). */
export function RadioPills<T extends string | number>({
  value,
  onChange,
  options,
  label,
  className,
  variant = 'pill',
}: {
  value: T | null;
  onChange: (v: T) => void;
  options: RadioOption<T>[];
  label: string;
  className?: string;
  variant?: 'pill' | 'tile';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const idx = options.findIndex((o) => o.value === value);
  const onKey = (e: KeyboardEvent) => {
    const rtl = document.documentElement.dir === 'rtl';
    const fwd = ['ArrowDown', rtl ? 'ArrowLeft' : 'ArrowRight'];
    const back = ['ArrowUp', rtl ? 'ArrowRight' : 'ArrowLeft'];
    let next = -1;
    if (fwd.includes(e.key)) next = (Math.max(0, idx) + 1) % options.length;
    else if (back.includes(e.key)) next = (Math.max(0, idx) - 1 + options.length) % options.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next].value);
    requestAnimationFrame(() => ref.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus());
  };
  return (
    <div ref={ref} role="radiogroup" aria-label={label} className={cx('wb-radios', `wb-radios--${variant}`, className)} onKeyDown={onKey}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.aria}
            title={o.title}
            tabIndex={on || (idx < 0 && i === 0) ? 0 : -1}
            className={cx('wb-radio', on && 'is-on')}
            onClick={() => onChange(o.value)}
          >
            {o.icon && <span className="wb-radio__icon" aria-hidden="true">{o.icon}</span>}
            <span className="wb-radio__label">{o.label}</span>
            {o.hint && <span className="wb-radio__hint">{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** On/off switch (`role="switch"`). */
export function Switch({ checked, onChange, label, children, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; children?: ReactNode; id?: string }) {
  return (
    <button type="button" role="switch" id={id} aria-checked={checked} aria-label={label} className={cx('wb-switch', checked && 'is-on')} onClick={() => onChange(!checked)}>
      <span className="wb-switch__track" aria-hidden="true">
        <i />
      </span>
      {children && <span className="wb-switch__text">{children}</span>}
    </button>
  );
}

/** Explainable facts: static label + dynamic value in separate nodes (translatable). */
export function Facts({ facts, className }: { facts: { label: string; value: string }[]; className?: string }) {
  const locale = useLocale();
  return (
    <ul className={cx('wb-facts', className)}>
      {facts.map((f) => (
        <li key={f.label}>
          <span>{f.label}</span>
          <b>{localValue(f.value, locale)}</b>
        </li>
      ))}
    </ul>
  );
}

const UNIT_AR = { h: ' س', m: ' د', s: ' ث', d: ' يوم' } as const;

/**
 * Compact unit suffix after a number ("7.5h", "30m", "40s"). Single letters
 * can't go in the shared dictionary (its case-insensitive lookup would hit
 * avatar initials), so the unit follows the active language here instead.
 */
export function U({ u }: { u: keyof typeof UNIT_AR }) {
  const locale = useLocale();
  return <>{locale === 'ar' ? UNIT_AR[u] : u}</>;
}

/** Engine-formatted values ("4 · 2.8h", "45m", "3/5") with Arabic unit letters when needed. */
export function localValue(v: string, locale: string): string {
  if (locale !== 'ar') return v;
  return v.replace(/(\d)(h|m|s|d)\b/g, (_, d: string, u: keyof typeof UNIT_AR) => `${d}${UNIT_AR[u]}`);
}

/** Mood sparkline (1..5 with gaps); mirrored in RTL via CSS. */
export function MoodSpark({ values, width = 260, height = 64 }: { values: (number | null)[]; width?: number; height?: number }) {
  const pad = 8;
  const n = values.length;
  const x = (i: number) => pad + (i / Math.max(1, n - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - 1) / 4) * (height - pad * 2);
  const segs: string[] = [];
  let cur = '';
  values.forEach((v, i) => {
    if (v === null) {
      if (cur) segs.push(cur);
      cur = '';
      return;
    }
    cur += `${cur ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
  });
  if (cur) segs.push(cur);
  return (
    <svg className="wb-moodspark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="wb-mood-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--app-c2)" />
          <stop offset="100%" stopColor="var(--app-c1)" />
        </linearGradient>
      </defs>
      {[1, 3, 5].map((v) => (
        <line key={v} x1={pad} x2={width - pad} y1={y(v)} y2={y(v)} className="wb-moodspark__grid" />
      ))}
      {segs.map((d) => (
        <path key={d} d={d} className="wb-moodspark__line" />
      ))}
      {values.map((v, i) => (v === null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={i === n - 1 ? 4.2 : 3} className="wb-moodspark__dot" />))}
    </svg>
  );
}

/* ───────────────────────── cross-app actions ───────────────────────── */

const calendarDown = () => toast.error('Calendar is unavailable', 'Try again in a moment.');

/** Block a focus-category slot on the person's own calendar, linked back to Aura. */
export async function blockCalendarSlot(uid: string, slot: { dayOffset: number; startHour: number; durationMins: number; title: string; description: string; to?: string; label?: string; agenda?: string[] }): Promise<boolean> {
  try {
    const { useCalendar } = await import('@/calendar/store');
    useCalendar.getState().createEvent({
      title: slot.title,
      description: slot.description,
      category: 'focus',
      dayOffset: slot.dayOffset,
      startHour: slot.startHour,
      durationMins: slot.durationMins,
      organizerId: uid,
      attendeeIds: [uid],
      roomName: 'Anywhere · screens down',
      linkedContext: { app: 'wellbeing', label: slot.label ?? 'Aura', to: slot.to ?? '/wellbeing' },
      agendaBullets: slot.agenda ?? ['Step away from screens', 'Two-minute breath', 'Water refill'],
    });
    return true;
  } catch {
    calendarDown();
    return false;
  }
}

/** Turn a calendar 1:1 into a walking meeting (same slot, same people, a walking route). */
export async function convertToWalk(eventId: string, route: string): Promise<string | null> {
  try {
    const { useCalendar } = await import('@/calendar/store');
    const st = useCalendar.getState();
    const orig = st.events.find((e) => e.id === eventId);
    if (!orig) {
      toast.error('That 1:1 has moved', 'Refresh your calendar and try again.');
      return null;
    }
    const created = st.createEvent({
      title: `Walk & talk · ${orig.title}`,
      description: `${orig.description}\n\nConverted to a walking 1:1 with Helix Wellbeing.`,
      category: '1on1',
      dayOffset: orig.dayOffset,
      startHour: orig.startHour,
      durationMins: orig.durationMins,
      organizerId: orig.organizerId,
      attendeeIds: orig.attendeeIds,
      roomName: route,
      linkedContext: { app: 'wellbeing', label: 'Walk & talk', to: '/wellbeing/move' },
      agendaBullets: ['Walk side by side, no slides', ...orig.agendaBullets.slice(0, 2)],
    });
    useCalendar.getState().deleteEvent(orig.id);
    return created.id;
  } catch {
    calendarDown();
    return null;
  }
}

/** Generic "Personal appointment" hold for a counselling session (no details disclosed). */
export async function addPrivateHold(uid: string, sessionAt: number): Promise<boolean> {
  try {
    const { useCalendar } = await import('@/calendar/store');
    useCalendar.getState().createEvent(privateHold(sessionAt, uid, Date.now()));
    return true;
  } catch {
    calendarDown();
    return false;
  }
}

/** Request a one-day annual leave in the HR Portal; returns the HR verdict. */
export async function requestRechargeDay(date: string): Promise<{ ok: boolean; message: string }> {
  try {
    const { useHr } = await import('@/hr/store');
    const hr = useHr.getState();
    const preview = hr.previewLeave({ type: 'annual', start: date, end: date });
    if (preview.errors.length) return { ok: false, message: preview.errors[0] };
    const res = hr.requestLeave({ type: 'annual', start: date, end: date, reason: 'Recharge day · planned with Aura' });
    return res.ok ? { ok: true, message: res.message ?? 'Requested' } : { ok: false, message: res.error };
  } catch {
    return { ok: false, message: 'The HR Portal is unavailable right now.' };
  }
}

/** Channels the viewer can post to in Pulse Chat. */
export async function loadChannels(): Promise<BridgeChannel[]> {
  try {
    const viewer = currentViewer();
    if (!viewer) return [];
    const chat = await loadBridge('chat');
    return chat.listChannels(viewer).filter((c) => c.kind === 'channel');
  } catch {
    return [];
  }
}

export async function shareToChat(channelId: string, text: string, card: BridgeCard): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  try {
    const viewer = currentViewer();
    if (!viewer) return { ok: false, error: 'You are not signed in.' };
    const chat = await loadBridge('chat');
    const res = chat.postToChannel(viewer, { channelId, text, card });
    return res.ok ? { ok: true, to: res.to } : { ok: false, error: res.error };
  } catch {
    return { ok: false, error: 'Pulse Chat is unavailable right now.' };
  }
}

/**
 * File a wellness-allowance claim with People Ops in the HR Portal.
 * `localOnly` = HR isn't available to this person, so the claim stays in the wallet queue.
 */
export async function fileHrClaim(input: { amount: number; merchant: string; description: string; date: string; receiptName: string }): Promise<{ ok: true; id?: string } | { ok: false; error: string; localOnly?: boolean }> {
  try {
    const { useHr } = await import('@/hr/store');
    const res = useHr.getState().submitClaim({ allowance: 'wellness', ...input });
    if (res.ok) return { ok: true, id: res.id };
    const localOnly = /access|signed in/i.test(res.error);
    return { ok: false, error: res.error, localOnly };
  } catch {
    return { ok: false, error: 'The HR Portal is unavailable right now.', localOnly: true };
  }
}
