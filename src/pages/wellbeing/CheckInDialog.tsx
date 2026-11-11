/**
 * Helix Wellbeing — the 20-second check-in (mood · energy · stress · sleep ·
 * private note). Prefills mood from today's Launchpad pulse vote, saves to the
 * person's private record, casts the anonymous Team pulse vote and then shows
 * the freshly tuned aura with Nova's top prescriptions.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Battery, BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, ChevronRight, HeartPulse, Users, X } from 'lucide-react';
import { Chip, CountUp, Ring } from '@/components/neo';
import { useHub } from '@/store/hub';
import { prefillMood } from '@/wellbeing/engine';
import { ENERGY_LEVELS, MOODS, STRESS_LEVELS } from '@/wellbeing/seed';
import { useWellbeing } from '@/wellbeing/store';
import type { Level5, Mood } from '@/wellbeing/types';
import { PrivateChip, RadioPills, U, useAuraModel, useDialogA11y, useLocale } from './parts';

const ENERGY_ICON = [<Battery key={1} />, <BatteryLow key={2} />, <BatteryMedium key={3} />, <BatteryFull key={4} />, <BatteryCharging key={5} />];
const SLEEP_QUICK = [5, 6, 7, 8];

export function CheckInDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open || typeof document === 'undefined') return null;
  return createPortal(<CheckInBody onClose={onClose} />, document.body);
}

function CheckInBody({ onClose }: { onClose: () => void }) {
  const model = useAuraModel();
  const { uid, data, today, checkin: existing } = model;
  const pulse = useHub((s) => s.pulse);
  const checkIn = useWellbeing((s) => s.checkIn);
  const recordScore = useWellbeing((s) => s.recordScore);
  const locale = useLocale();

  const pulseMood = prefillMood(pulse, uid, today);
  const [mood, setMood] = useState<Mood | null>(existing?.mood ?? pulseMood);
  const [energy, setEnergy] = useState<Level5>(existing?.energy ?? 3);
  const [stress, setStress] = useState<Level5>(existing?.stress ?? 3);
  const [sleep, setSleep] = useState<number>(existing?.sleepHours ?? Math.round(data.profile.sleepAvg * 2) / 2);
  const [note, setNote] = useState(existing?.note ?? '');
  const [step, setStep] = useState<'form' | 'done'>('form');
  const [needMood, setNeedMood] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Focus management: first control on open, Tab stays inside, Esc closes, focus returns on close.
  useDialogA11y(ref, onClose, '[role="radio"][tabindex="0"]');

  // Snapshot the tuned score for the bridge once the model has recomputed.
  useEffect(() => {
    if (step === 'done' && model.recharge !== null) recordScore(uid, model.recharge);
  }, [step, model.recharge, recordScore, uid]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!mood) {
      setNeedMood(true);
      ref.current?.querySelector<HTMLElement>('.wb-ci__mood [role="radio"]')?.focus();
      return;
    }
    checkIn(uid, { mood, energy, stress, sleepHours: sleep, note });
    setStep('done');
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('.wb-ci__done .neo-btn--plasma')?.focus({ preventScroll: true }));
  };

  const seePlan = () => {
    onClose();
    window.setTimeout(() => document.getElementById('wb-rx')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  return (
    <div className="neo-portal wb-portal wb-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="wb-dialog" role="dialog" aria-modal="true" aria-labelledby="wb-ci-title">
        <header className="wb-dialog__head">
          <span className="wb-dialog__orb" aria-hidden="true">
            <HeartPulse />
          </span>
          <div className="wb-dialog__titles">
            <div className="neo-hud">20-second check-in</div>
            <h2 id="wb-ci-title" className="wb-dialog__title">
              {step === 'form' ? 'How are you, really?' : 'Aura tuned'}
            </h2>
          </div>
          <button type="button" className="neo-iconbtn" onClick={onClose} aria-label="Close check-in">
            <X />
          </button>
        </header>

        {step === 'form' ? (
          <form className="wb-ci" onSubmit={submit}>
            <section className="wb-ci__q wb-ci__mood" data-invalid={needMood && !mood ? 'true' : undefined}>
              <div className="wb-ci__label">
                <span id="wb-ci-mood">Mood</span>
                {pulseMood && !existing && (
                  <Chip tone="app" size="sm">
                    From your Launchpad pulse
                  </Chip>
                )}
                {needMood && !mood && <span className="wb-ci__err">Pick the face that fits</span>}
              </div>
              <RadioPills
                label="Mood"
                variant="tile"
                value={mood}
                onChange={(v) => {
                  setMood(v);
                  setNeedMood(false);
                }}
                options={MOODS.map((m) => ({ value: m.v, label: m.label, icon: <span className="wb-emoji">{m.emoji}</span> }))}
              />
            </section>

            <section className="wb-ci__q">
              <div className="wb-ci__label">
                <span>Energy</span>
              </div>
              <RadioPills label="Energy" className="wb-ci__scale" value={energy} onChange={setEnergy} options={ENERGY_LEVELS.map((l, i) => ({ value: l.v, label: l.label, icon: ENERGY_ICON[i] }))} />
            </section>

            <section className="wb-ci__q">
              <div className="wb-ci__label">
                <span>Stress</span>
              </div>
              <RadioPills
                label="Stress"
                className="wb-ci__scale wb-ci__stress"
                value={stress}
                onChange={setStress}
                options={STRESS_LEVELS.map((l) => ({ value: l.v, label: l.label, icon: <i className="wb-stressdot" data-level={l.v} /> }))}
              />
            </section>

            <section className="wb-ci__q wb-ci__sleep">
              <div className="wb-ci__label">
                <label htmlFor="wb-ci-sleep">Sleep last night</label>
                <output className="wb-ci__sleepval" htmlFor="wb-ci-sleep">
                  {sleep}
                  <U u="h" />
                </output>
              </div>
              <input
                id="wb-ci-sleep"
                className="wb-range"
                type="range"
                min={3}
                max={10}
                step={0.5}
                value={sleep}
                onChange={(e) => setSleep(Number(e.target.value))}
                aria-valuetext={locale === 'ar' ? `${sleep} ساعات` : `${sleep} hours`}
                style={{ ['--p' as string]: `${((sleep - 3) / 7) * 100}%` }}
              />
              <div className="wb-ci__quick" role="group" aria-label="Quick sleep picks">
                {SLEEP_QUICK.map((h) => (
                  <button key={h} type="button" className="wb-quick" aria-pressed={sleep === h} onClick={() => setSleep(h)}>
                    {h}
                    <U u="h" />
                  </button>
                ))}
              </div>
            </section>

            <section className="wb-ci__q">
              <div className="wb-ci__label">
                <label htmlFor="wb-ci-note">Private note</label>
                <span className="wb-ci__opt">Optional</span>
              </div>
              <textarea id="wb-ci-note" className="neo-textarea wb-ci__note" rows={2} maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything on your mind? Only you will see this." />
            </section>

            <footer className="wb-ci__foot">
              <div className="wb-ci__privacy">
                <PrivateChip />
                <p>
                  <Users aria-hidden="true" />
                  <span>Your mood also counts, anonymously, in the Launchpad team pulse.</span>
                </p>
              </div>
              <div className="wb-ci__actions">
                <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="neo-btn neo-btn--plasma">
                  <HeartPulse />
                  <span>Tune my aura</span>
                </button>
              </div>
            </footer>
          </form>
        ) : (
          <div className="wb-ci__done" aria-live="polite">
            <div className="wb-ci__score">
              <Ring value={(model.recharge ?? 0) / 100} size={120} stroke={9} label="Recharge score">
                <span className="wb-ci__num">
                  <CountUp value={model.recharge ?? 0} />
                </span>
              </Ring>
              <div>
                <div className="neo-hud">Recharge score</div>
                <p className="wb-ci__lede">{model.weakest ? WEAK_HINT[model.weakest.id] : null}</p>
              </div>
            </div>
            {model.rx.length > 0 && (
              <ol className="wb-ci__rx" aria-label="Nova recharge prescriptions">
                {model.rx.map((r) => (
                  <li key={r.id}>
                    <span className="wb-ci__rxdot" data-tone={r.tone} aria-hidden="true" />
                    <span className="wb-ci__rxtitle">{r.title}</span>
                    {r.chip && <b className="wb-ci__rxchip">{r.chip}</b>}
                  </li>
                ))}
              </ol>
            )}
            <div className="wb-ci__actions">
              <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
                Close
              </button>
              <button type="button" className="neo-btn neo-btn--plasma" onClick={seePlan}>
                <span>See my recharge plan</span>
                <ChevronRight className="wb-flip" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const WEAK_HINT: Record<string, string> = {
  sleep: 'Sleep is your lowest dimension today. Nova planned around it.',
  movement: 'Movement is your lowest dimension today. Nova planned around it.',
  focus: 'Focus is your lowest dimension today. Nova planned around it.',
  connection: 'Connection is your lowest dimension today. Nova planned around it.',
  calm: 'Calm is your lowest dimension today. Nova planned around it.',
};
