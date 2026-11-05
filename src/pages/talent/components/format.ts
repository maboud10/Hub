/**
 * Talent Hub display helpers.
 */
import type { Application, StageId } from '@/talent/types';
import { STAGE_BY_ID } from '@/talent/constants';

const DAY = 86_400_000;

export function formatMoney(amount: number, currency: string, opts: { compact?: boolean } = {}): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
      notation: opts.compact ? 'compact' : 'standard',
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
}

export function formatRange(min: number, max: number, currency: string) {
  return `${formatMoney(min, currency, { compact: true })} – ${formatMoney(max, currency, { compact: true })}`;
}

export function daysInStage(app: Pick<Application, 'stageEnteredAt'>, now = Date.now()) {
  return Math.max(0, Math.floor((now - app.stageEnteredAt) / DAY));
}

/** SLA health for the time spent in the current stage. */
export function slaState(app: Pick<Application, 'stage' | 'stageEnteredAt'>, now = Date.now()): 'ok' | 'warn' | 'stale' {
  const sla = STAGE_BY_ID[app.stage as StageId].slaDays;
  if (!sla) return 'ok';
  const d = (now - app.stageEnteredAt) / DAY;
  return d > sla ? 'stale' : d > sla * 0.7 ? 'warn' : 'ok';
}

export function fmtWhen(ts: number) {
  return new Date(ts).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function fmtDay(ts: number | string) {
  return new Date(typeof ts === 'string' ? `${ts}T00:00:00` : ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "Today 15:00", "Tomorrow 11:00", "Thu 10:30". */
export function fmtRelativeDay(ts: number, now = Date.now()) {
  const d = new Date(ts);
  const today = new Date(now);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diff = Math.floor((ts - start) / DAY);
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (diff === 0) return `Today ${time}`;
  if (diff === 1) return `Tomorrow ${time}`;
  if (diff === -1) return `Yesterday ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
