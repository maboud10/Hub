/**
 * Weekly check-in — one fast modal with every key result you own: drag a value,
 * set confidence, add a note. Live deltas, live status and a live forecast.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, Check, Flame, Target } from 'lucide-react';
import { NeoEmpty } from '@/components/neo';
import { burstConfetti } from '@/lib/confetti';
import { cx } from '@/lib/cx';
import { useHotkeys } from '@/hooks/useHotkeys';
import { checkinStreak, forecastKr, formatDelta, formatValue, isImprovement, krStatus, milestoneTotal } from '@/performance/okr';
import { currentPeriod, myCheckinKrs } from '@/performance/selectors';
import { usePerf, type CheckinEntry } from '@/performance/store';
import type { KeyResult } from '@/performance/types';
import { toast } from '@/store/toast';
import { useMinute, usePerfCtx } from './hooks';
import { Kbd, PfModal, StatusChip } from './ui';

interface Draft {
  value: number;
  confidence: number;
  note: string;
  done: string[];
  touched: boolean;
}

function bounds(kr: KeyResult) {
  const lo = Math.min(kr.start, kr.target, kr.current);
  const hi = Math.max(kr.start, kr.target, kr.current);
  const span = hi - lo || Math.abs(hi) || 1;
  let min = lo - span * 0.15;
  let max = hi + span * 0.15;
  if (kr.metric === 'percent') {
    min = Math.max(0, min);
    max = Math.min(100, max);
  } else min = Math.max(0, min);
  const step = kr.decimals ? 10 ** -kr.decimals : kr.metric === 'currency' ? 10 ** Math.max(0, Math.floor(Math.log10(span)) - 2) : kr.metric === 'percent' ? 0.5 : span <= 20 ? 0.1 : 1;
  return { min: +min.toFixed(4), max: +max.toFixed(4), step };
}

export function CheckinModal({ open, onClose, onOpenObjective }: { open: boolean; onClose: () => void; onOpenObjective: (id: string) => void }) {
  const ctx = usePerfCtx();
  const now = useMinute();
  const navigate = useNavigate();
  const objectives = usePerf((s) => s.objectives);
  const keyResults = usePerf((s) => s.keyResults);
  const periods = usePerf((s) => s.periods);
  const period = currentPeriod({ periods }, now);
  const krs = useMemo(() => (ctx ? myCheckinKrs({ objectives, keyResults }, ctx.me.id, period.id) : []), [ctx, objectives, keyResults, period.id]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  useEffect(() => {
    if (!open) return;
    setDrafts(Object.fromEntries(krs.map((k) => [k.id, { value: k.current, confidence: k.confidence, note: '', done: k.milestones?.filter((m) => m.done).map((m) => m.id) ?? [], touched: false }])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const touched = krs.filter((k) => drafts[k.id]?.touched);
  const streak = useMemo(() => (ctx ? checkinStreak(keyResults.flatMap((k) => k.checkins.filter((c) => c.byId === ctx.me.id).map((c) => c.at)), now) : 0), [keyResults, ctx, now]);

  const patch = (id: string, p: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...p, touched: true } }));

  const submit = () => {
    if (!touched.length) {
      toast.info('Update at least one key result', 'Or mark it as “No change”.');
      return;
    }
    const entries: CheckinEntry[] = touched.map((k) => {
      const d = drafts[k.id];
      return { krId: k.id, value: k.metric === 'milestone' ? d.done.length : d.value, confidence: d.confidence, note: d.note.trim() || undefined, doneMilestones: k.metric === 'milestone' ? d.done : undefined };
    });
    const res = usePerf.getState().checkIn(entries);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const nextStreak = checkinStreak([...keyResults.flatMap((k) => k.checkins.filter((c) => c.byId === ctx?.me.id).map((c) => c.at)), Date.now()], Date.now());
    if (res.completed.length || res.improved) burstConfetti();
    toast.success(res.completed.length ? `${res.completed.length} key result${res.completed.length === 1 ? '' : 's'} hit target!` : res.message ?? 'Checked in', nextStreak > 1 ? `${nextStreak}-week check-in streak — keep it going.` : 'Your forecasts just got sharper.');
    onClose();
  };

  useHotkeys({ 'mod+enter': () => open && submit() }, open);

  if (!ctx) return null;
  const byObjective = new Map<string, KeyResult[]>();
  for (const k of krs) byObjective.set(k.objectiveId, [...(byObjective.get(k.objectiveId) ?? []), k]);
  const weekOf = new Date(now);
  weekOf.setDate(weekOf.getDate() - ((weekOf.getDay() + 6) % 7));

  return (
    <PfModal
      open={open}
      onClose={onClose}
      width={780}
      icon={<Target />}
      title="Weekly check-in"
      subtitle={
        <span className="pf-row pf-row--wrap">
          <span>
            Week of {weekOf.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · {krs.length} key result{krs.length === 1 ? '' : 's'}
          </span>
          {streak > 0 && (
            <span className="pf-streak pf-streak--sm">
              <Flame /> {streak}-week streak
            </span>
          )}
        </span>
      }
      footer={
        krs.length ? (
          <>
            <span className="pf-hint-row grow">
              {touched.length ? `${touched.length} of ${krs.length} updated` : 'Drag a value, tap confidence, or mark “No change”'} · <Kbd>⌘</Kbd>
              <Kbd>Enter</Kbd>
            </span>
            <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="neo-btn neo-btn--plasma" onClick={submit} disabled={!touched.length} data-qa="checkin-submit">
              <Check /> Check in{touched.length ? ` ${touched.length}` : ''}
            </button>
          </>
        ) : undefined
      }
    >
      {krs.length === 0 ? (
        <NeoEmpty
          icon={<Target />}
          title="No key results to check in on"
          action={
            <button
              type="button"
              className="neo-btn neo-btn--plasma"
              onClick={() => {
                onClose();
                navigate('/performance/okrs?new=1');
              }}
            >
              Create an objective
            </button>
          }
        >
          Set an objective with measurable key results and you’ll check in here every week.
        </NeoEmpty>
      ) : (
        <div className="pf-ck">
          {[...byObjective.entries()].map(([oid, list]) => {
            const o = objectives.find((x) => x.id === oid)!;
            return (
              <section key={oid} className="pf-ck__group" aria-label={o.title}>
                <button
                  type="button"
                  className="pf-ck__obj"
                  onClick={() => {
                    onClose();
                    onOpenObjective(oid);
                  }}
                >
                  <span className="neo-hud">{o.level}</span>
                  <span className="truncate">{o.title}</span>
                  <ArrowRight />
                </button>
                {list.map((k) => (
                  <CheckinRow key={k.id} kr={k} draft={drafts[k.id]} now={now} period={period} onChange={(p) => patch(k.id, p)} />
                ))}
              </section>
            );
          })}
        </div>
      )}
    </PfModal>
  );
}

function CheckinRow({ kr, draft, now, period, onChange }: { kr: KeyResult; draft?: Draft; now: number; period: { start: number; end: number; id: string; label: string }; onChange: (p: Partial<Draft>) => void }) {
  if (!draft) return null;
  const value = kr.metric === 'milestone' ? draft.done.length : draft.value;
  const next: KeyResult = {
    ...kr,
    current: value,
    confidence: draft.confidence,
    checkins: draft.touched ? [...kr.checkins, { id: 'draft', at: now, value, confidence: draft.confidence, byId: 'me' }] : kr.checkins,
  };
  const status = krStatus(next, period, now);
  const f = forecastKr(next, period, now);
  const delta = value - kr.current;
  const b = bounds(kr);
  const good = isImprovement(kr, delta);
  return (
    <div className={cx('pf-ck__row', draft.touched && 'is-touched')} data-status={status}>
      <div className="pf-ck__top">
        <div className="pf-ck__title">
          <b>{kr.title}</b>
          <span className="pf-faint text-xs">
            Now {formatValue(kr, kr.current)} · target {formatValue(kr, kr.target)}
            {kr.metric !== 'boolean' && f.method === 'trend' ? ` · forecast ${formatValue(kr, f.value)}` : ''}
          </span>
        </div>
        <StatusChip status={status} />
      </div>

      {kr.metric === 'milestone' ? (
        <div className="pf-ck__ms" role="group" aria-label={`${kr.title} milestones`}>
          {(kr.milestones ?? []).map((m) => {
            const on = draft.done.includes(m.id);
            return (
              <label key={m.id} className={cx('pf-ck__msitem', on && 'is-on')}>
                <input type="checkbox" className="neo-check" checked={on} onChange={() => onChange({ done: on ? draft.done.filter((x) => x !== m.id) : [...draft.done, m.id] })} />
                <span>{m.title}</span>
              </label>
            );
          })}
          <span className="pf-faint text-xs">
            {draft.done.length}/{milestoneTotal(kr)} done
          </span>
        </div>
      ) : kr.metric === 'boolean' ? (
        <div className="pf-seg" role="radiogroup" aria-label={kr.title}>
          {[0, 1].map((v) => (
            <button key={v} type="button" role="radio" aria-checked={value === v} className="pf-seg__btn" onClick={() => onChange({ value: v })}>
              {v ? 'Done' : 'Not yet'}
            </button>
          ))}
        </div>
      ) : (
        <div className="pf-ck__value">
          <input
            type="range"
            className="pf-range"
            min={b.min}
            max={b.max}
            step={b.step}
            value={value}
            aria-label={`${kr.title} value`}
            onChange={(e) => onChange({ value: Number(e.target.value) })}
            style={{ ['--fill' as string]: `${((value - b.min) / (b.max - b.min || 1)) * 100}%` }}
          />
          <input type="number" className="neo-input neo-input--sm pf-ck__num" value={Number.isFinite(value) ? value : ''} step={b.step} aria-label={`${kr.title} exact value`} onChange={(e) => onChange({ value: e.target.value === '' ? kr.current : Number(e.target.value) })} />
          <span className={cx('pf-ck__delta neo-mono', delta !== 0 && (good ? 'is-good' : 'is-bad'))}>{delta === 0 ? '±0' : formatDelta(kr, delta)}</span>
        </div>
      )}

      <div className="pf-ck__bottom">
        <div className="pf-ck__conf" role="radiogroup" aria-label="Confidence">
          <span className="neo-hud">Confidence</span>
          <div className="pf-ck__confbtns">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" role="radio" aria-checked={draft.confidence === n} className={cx('pf-ck__confbtn', n <= draft.confidence && 'is-lit')} data-tone={draft.confidence >= 7 ? 'ok' : draft.confidence >= 4 ? 'risk' : 'off'} onClick={() => onChange({ confidence: n })} title={`${n}/10`}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <input className="neo-input neo-input--sm pf-ck__note" placeholder="What moved? Any blockers?" value={draft.note} onChange={(e) => onChange({ note: e.target.value })} aria-label={`Note for ${kr.title}`} />
        {!draft.touched && (
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => onChange({})}>
            No change
          </button>
        )}
      </div>
    </div>
  );
}
