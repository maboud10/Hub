/**
 * Public App Bridge for Helix Wellbeing (see src/lib/appBridge.ts).
 *
 * Powers ⌘K (actions + the viewer's own work objects), Settings → Reset demo,
 * Mail's schedule-send (`quietHours`) and hub surfaces (`rechargeScore`).
 * Everything here is strictly about the viewer themself — the bridge never
 * returns another person's wellbeing data, and Care entries stay discreet.
 */
import { Footprints, HandHeart, HeartPulse, Moon, Trophy, Users, Wallet, Wind } from 'lucide-react';
import type { PaletteEntry, QuietHours, WellbeingBridge } from '@/lib/appBridge';
import {
  canUseWellbeing,
  formatDayLabel,
  formatHour,
  hourOf,
  quickRecharge,
  teamOf,
  teamStandings,
  todaysCheckin,
  walletSummary,
} from './engine';
import { CARE_CIRCLES, DEFAULT_QUIET, isoDay, TEAM_BY_ID, WALLET_CURRENCY } from './seed';
import { useWellbeing } from './store';
import type { QuietHoursSettings } from './types';
import { translateToArabic, useI18n } from '@/lib/i18n';

const DAY = 86_400_000;

/** Palette subtitles mix words with live values, so they're composed per language. */
const ar = () => useI18n.getState().locale === 'ar';
const money = (n: number) => {
  const v = Math.round(n).toLocaleString('en-US');
  return ar() ? `${v} د.إ` : `${WALLET_CURRENCY} ${v}`;
};

export const api: WellbeingBridge = {
  appId: 'wellbeing',

  paletteEntries(viewer) {
    if (!canUseWellbeing(viewer.perms)) return [];
    const st = useWellbeing.getState();
    const me = st.users[viewer.user.id];
    const now = Date.now();
    const today = isoDay(now);
    const out: PaletteEntry[] = [];
    const action = (id: string, title: string, to: string, icon: PaletteEntry['icon'], keywords: string[], subtitle?: string) =>
      out.push({ id: `wellbeing:${id}`, group: 'Actions', title, subtitle, to, icon, keywords: ['wellbeing', 'wellness', 'aura', ...keywords], hint: 'Open', glyphColor: '#fb7185' });

    const checkedIn = !!me && !!todaysCheckin(me.checkins, today);
    const q = me?.quiet ?? DEFAULT_QUIET;
    const wallet = walletSummary(me?.claims ?? []);

    action('checkin', 'Daily check-in', '/wellbeing?checkin=1', <HeartPulse />, ['check in', 'mood', 'energy', 'pulse', 'recharge', 'tired', 'stress'], checkedIn ? 'Done today · update your aura' : '20 seconds · tunes your private aura');
    action('breather', 'Two-minute breather', '/wellbeing/breathe?pattern=box&mins=2', <Wind />, ['breathe', 'breathing', 'calm', 'anxious', 'box breathing', 'meditate'], 'Guided box breathing');
    action('counsellor', 'Book a counsellor', '/wellbeing/care', <HandHeart />, ['counsellor', 'counselor', 'therapy', 'eap', 'mental health', 'talk to someone'], 'Fully confidential · English & Arabic · 24/7');
    action('challenge', 'Movement challenge', '/wellbeing/move', <Footprints />, ['steps', 'walk', 'run', 'challenge', 'hub cup', 'fitness'], 'Helix Hub Cup · Silk Road Relay');
    action('quiet', 'Quiet hours', '/wellbeing/rhythm#quiet', <Moon />, ['quiet hours', 'right to disconnect', 'after hours', 'notifications', 'burnout'], q.enabled ? `Right to disconnect · ${formatHour(q.startHour)}–${formatHour(q.endHour)}` : 'Right to disconnect · Paused');
    action('perks', 'Perks wallet', '/wellbeing/perks', <Wallet />, ['perks', 'allowance', 'gym', 'claim', 'benefits', 'wallet'], ar() ? `متبقٍ ${money(wallet.remaining)} هذا العام` : `${money(wallet.remaining)} left this year`);

    // Work objects — only the viewer's own.
    const teamId = teamOf(viewer.user.location);
    const standing = teamStandings(st.challenge, st.users).find((t) => t.id === teamId);
    if (standing && st.challenge.endsAt > now) {
      const daysLeft = Math.max(0, Math.ceil((st.challenge.endsAt - now) / DAY));
      const pct = Math.round(standing.pct * 100);
      out.push({
        id: `wellbeing:challenge:${teamId}`,
        group: 'Work',
        title: `Helix Hub Cup · ${TEAM_BY_ID[teamId].label}`,
        subtitle: ar() ? `${pct}% من المسار · المركز #${standing.rank} · متبقٍ ${daysLeft} يوماً` : `${pct}% of the route · rank #${standing.rank} · ${daysLeft} days left`,
        icon: <Trophy />,
        glyphColor: '#34d399',
        keywords: ['wellbeing', 'challenge', 'hub cup', 'steps', 'team', TEAM_BY_ID[teamId].label.toLowerCase()],
        hint: 'Open race',
        to: '/wellbeing/move',
      });
    }

    const session = me?.care.find((b) => b.stage === 2 && (b.sessionAt ?? 0) > now - 2 * 3_600_000);
    if (session?.sessionAt) {
      const when = `${formatDayLabel(isoDay(session.sessionAt))} ${formatHour(hourOf(session.sessionAt))}`;
      out.push({
        id: `wellbeing:care:${session.id}`,
        group: 'Work',
        title: 'Your confidential session',
        subtitle: `Personal appointment · ${ar() ? translateToArabic(when) : when}`,
        icon: <HandHeart />,
        glyphColor: '#a855f7',
        keywords: ['wellbeing', 'care', 'session', 'appointment', 'counsellor'],
        hint: 'Open',
        to: '/wellbeing/care',
      });
    }

    for (const id of me?.circles ?? []) {
      const c = CARE_CIRCLES.find((x) => x.id === id);
      if (!c) continue;
      out.push({
        id: `wellbeing:circle:${id}`,
        group: 'Work',
        title: `Care circle · ${c.name}`,
        subtitle: `Anonymous · ${c.meets}`,
        icon: <Users />,
        glyphColor: `hsl(${c.hue} 70% 55%)`,
        keywords: ['wellbeing', 'care', 'circle', 'support group', c.name.toLowerCase()],
        hint: 'Open',
        to: '/wellbeing/care#circles',
      });
    }

    return out;
  },

  resetDemo() {
    useWellbeing.getState().resetDemo();
  },

  quietHours(viewer) {
    const q: QuietHoursSettings = (canUseWellbeing(viewer.perms) ? useWellbeing.getState().users[viewer.user.id]?.quiet : undefined) ?? DEFAULT_QUIET;
    // Superset of `QuietHours`: Mail may also honour weekends and the hold policy.
    const out: QuietHours & Pick<QuietHoursSettings, 'weekendsOff' | 'holdPolicy'> = {
      enabled: q.enabled,
      startHour: q.startHour,
      endHour: q.endHour,
      weekendsOff: q.weekendsOff,
      holdPolicy: q.holdPolicy,
    };
    return out;
  },

  rechargeScore(viewer) {
    if (!canUseWellbeing(viewer.perms)) return null;
    const me = useWellbeing.getState().users[viewer.user.id];
    if (!me) return null;
    const now = Date.now();
    const today = isoDay(now);
    if (!todaysCheckin(me.checkins, today)) return null;
    if (me.lastScore?.date === today) return me.lastScore.score;
    return quickRecharge(me, now);
  },
};
