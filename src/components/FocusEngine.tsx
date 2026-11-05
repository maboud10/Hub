import { useEffect } from 'react';
import { useFocus } from '@/store/focus';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { formatTime, mmss } from '@/lib/format';
import { BRAND } from '@/config/brand';

/** Start a focus session and set presence to "Focusing" (auto-DND). */
export function startFocusSession(minutes = 25) {
  useFocus.getState().start('focus', minutes);
  const until = formatTime(Date.now() + minutes * 60_000);
  useHub.getState().setPresence('focus', `Focus session · back at ${until}`);
  toast.info(`Focus mode on for ${minutes} min`, 'Your status is set to Focusing.');
}

export function startBreak(minutes = 5) {
  useFocus.getState().start('break', minutes);
  useHub.getState().setPresence('online', 'On a short break ☕');
}

export function stopFocusSession() {
  const wasFocus = useFocus.getState().mode === 'focus';
  useFocus.getState().stop();
  if (wasFocus) useHub.getState().setPresence('online', '');
}

/** Background ticker: completes sessions, restores presence, mirrors the timer in the tab title. */
export function FocusEngine() {
  const { mode, endsAt, pausedRemaining } = useFocus();

  useEffect(() => {
    const base = `${BRAND.product} · Employee Hub`;
    if (mode === 'idle') {
      document.title = base;
      return;
    }
    const tick = () => {
      const remaining = pausedRemaining ?? (endsAt ? endsAt - Date.now() : 0);
      document.title = `${mmss(remaining)} ${mode === 'focus' ? '● Focus' : '☕ Break'} · ${BRAND.product}`;
      if (endsAt && remaining <= 0) {
        useFocus.getState().stop();
        if (mode === 'focus') {
          useHub.getState().setPresence('online', '');
          toast.success('Focus session complete 🎉', 'Great work — take a 5-minute break.');
        } else {
          toast.info('Break’s over', 'Ready for another focus session?');
          useHub.getState().setPresence('online', '');
        }
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [mode, endsAt, pausedRemaining]);

  return null;
}
