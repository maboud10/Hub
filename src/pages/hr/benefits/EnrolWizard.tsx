/**
 * Benefits enrolment wizard — health plan → dependents → add-ons → review —
 * with a live monthly cost, pre-filled from the current election, life-event
 * shortcuts (new baby / marriage start on the dependents step with a row
 * ready) and a celebration once People Ops has it. Opened via `?enrol=1`.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, Baby, Check, CircleCheckBig, Gem, Glasses, HeartPulse, PartyPopper, Plus, ShieldCheck, Smile, Sparkles, Trash2, Umbrella, UserRound, Users } from 'lucide-react';
import type { Dependent, HealthTier, Relation } from '@/hr/types';
import { useHr, type ElectionInput } from '@/hr/store';
import { ADD_ONS, HEALTH_PLAN_BY_ID, HEALTH_PLANS, LIFE_COVER, RELATION_LABEL } from '@/hr/constants';
import { COMPANY_PREMIUM, electionCost } from '@/hr/engine';
import { daysBetween, formatDay, todayISO } from '@/hr/calendar';
import type { BenefitElection } from '@/hr/types';
import { toast } from '@/store/toast';
import { uid } from '@/lib/id';
import { cx } from '@/lib/cx';
import { Modal } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/primitives';
import { Stepper, type StepDef } from '@/pages/talent/components/shared';
import { aed, celebrate, deadlineInfo, money, planYear, useMyComp, useMyElection, type LifeEvent } from './model';

const STEPS: StepDef[] = [
  { id: 'plan', label: 'Health plan', icon: HeartPulse, hint: 'Compare the three plans' },
  { id: 'family', label: 'Dependents', icon: Users, hint: 'Spouse, children or parents' },
  { id: 'extras', label: 'Add-ons', icon: Sparkles, hint: 'Dental, vision and life cover' },
  { id: 'review', label: 'Review', icon: ShieldCheck, hint: 'Check the cost and submit' },
];
const RELATIONS: Relation[] = ['spouse', 'child', 'parent'];
const RELATION_ICON = { spouse: Gem, child: Baby, parent: UserRound } as const;
const MAX_DEPENDENTS = 6;

function initialDraft(e: BenefitElection | undefined, event: LifeEvent | null): ElectionInput {
  const dependents: Dependent[] = (e?.dependents ?? []).map((d) => ({ ...d }));
  if (event === 'baby') dependents.push({ id: uid('dep'), name: '', relation: 'child' });
  if (event === 'marriage' && !dependents.some((d) => d.relation === 'spouse')) dependents.push({ id: uid('dep'), name: '', relation: 'spouse' });
  return { health: e?.health ?? 'plus', dental: e?.dental ?? false, vision: e?.vision ?? false, lifeMultiple: e?.lifeMultiple ?? 2, dependents: dependents.slice(0, MAX_DEPENDENTS) };
}

function dependentIssues(d: Dependent, today: string) {
  return {
    name: d.name.trim().length < 2 ? 'Add their full name' : null,
    birthDate: d.birthDate && d.birthDate > today ? 'This date is in the future' : null,
  };
}

function ageLabel(birthDate: string | undefined, today: string) {
  if (!birthDate) return null;
  const days = daysBetween(birthDate, today);
  if (days < 0) return null;
  if (days < 60) return `${days} day${days === 1 ? '' : 's'} old`;
  const years = Math.floor(days / 365.25);
  return years < 2 ? `${Math.floor(days / 30.44)} months` : `${years} years`;
}

/** Remounts the dialog on every open so the draft is re-filled from the store. */
export function EnrolWizard({ open, onClose, event }: { open: boolean; onClose: () => void; event: LifeEvent | null }) {
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((n) => n + 1);
  }
  return <WizardDialog key={session} open={open} onClose={onClose} event={event} />;
}

function WizardDialog({ open, onClose, event }: { open: boolean; onClose: () => void; event: LifeEvent | null }) {
  const election = useMyElection();
  const comp = useMyComp();
  const submitElection = useHr((s) => s.submitElection);
  const today = todayISO();
  const firstStep = event ? 1 : 0;
  const [step, setStep] = useState(firstStep);
  const [reached, setReached] = useState(firstStep);
  const [draft, setDraft] = useState<ElectionInput>(() => initialDraft(election, event));
  const [focusId, setFocusId] = useState<string | null>(() => (event ? (draft.dependents[draft.dependents.length - 1]?.id ?? null) : null));
  const [showErrors, setShowErrors] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const cost = useMemo(() => electionCost(draft), [draft]);
  const plan = HEALTH_PLAN_BY_ID[draft.health];
  const issues = draft.dependents.map((d) => dependentIssues(d, today));
  const depsValid = issues.every((x) => !x.name && !x.birthDate);
  // Captured when the wizard opens: submitting flips the stored status to 'submitted'.
  const [isChange] = useState(() => election?.status === 'confirmed' || election?.status === 'submitted');
  const [deadline] = useState(() => (election?.status === 'not-started' ? election.deadline : undefined));
  const dl = deadlineInfo(deadline, today);
  const full = draft.dependents.length >= MAX_DEPENDENTS;

  const goTo = (i: number) => {
    if (i > 1 && !depsValid) {
      setShowErrors(true);
      setStep(1);
      return;
    }
    setStep(i);
    setReached((r) => Math.max(r, i));
    setError(null);
  };
  const setHealth = (health: HealthTier) => setDraft((d) => ({ ...d, health }));
  const updateDep = (id: string, patch: Partial<Dependent>) => setDraft((d) => ({ ...d, dependents: d.dependents.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const removeDep = (id: string) => setDraft((d) => ({ ...d, dependents: d.dependents.filter((x) => x.id !== id) }));
  const addDep = (relation: Relation) => {
    if (full) return;
    const id = uid('dep');
    setDraft((d) => ({ ...d, dependents: [...d.dependents, { id, name: '', relation }] }));
    setFocusId(id);
  };

  const submit = () => {
    if (!depsValid) {
      goTo(1);
      return;
    }
    const res = submitElection({ ...draft, dependents: draft.dependents.map((d) => ({ ...d, birthDate: d.birthDate || undefined })) });
    if (!res.ok) {
      setError(res.error);
      toast.result(res);
      return;
    }
    toast.result(res);
    setDone(true);
    celebrate();
  };

  const subtitle = done
    ? 'Nice work. Here’s what happens next.'
    : dl && deadline
      ? `Enrol by ${formatDay(deadline)} · ${dl.label}`
      : isChange
        ? 'Changes go to People Ops, who confirm them with the insurer.'
        : 'Health, family, extras and life cover in four short steps.';

  const footer = done ? (
    <button type="button" className="btn btn--primary" onClick={onClose}>
      Done
    </button>
  ) : (
    <>
      <div className="hr-bn-wiz-total" aria-live="polite">
        <span>You pay</span>
        <b>{cost.employeeMonthly ? aed(cost.employeeMonthly) : 'Nothing'}</b>
        <small>{cost.employeeMonthly ? 'a month' : 'Helix covers it'}</small>
      </div>
      {step > 0 && (
        <button type="button" className="btn btn--ghost" onClick={() => goTo(step - 1)}>
          <ArrowLeft aria-hidden="true" /> Back
        </button>
      )}
      {step < STEPS.length - 1 ? (
        <button type="button" className="btn btn--primary" onClick={() => goTo(step + 1)}>
          Continue <ArrowRight aria-hidden="true" />
        </button>
      ) : (
        <button type="button" className="btn btn--primary" disabled={!consent} onClick={submit}>
          <Check aria-hidden="true" /> {isChange ? 'Submit changes' : 'Submit enrolment'}
        </button>
      )}
    </>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={940}
      className="hr-bn-wizard"
      title={isChange ? 'Update your benefits' : `Benefits enrolment ${planYear()}`}
      subtitle={subtitle}
      icon={
        <span className="hr-bn-modal-icon" aria-hidden="true">
          <HeartPulse />
        </span>
      }
      footer={footer}
    >
      {done ? (
        <div className="hr-bn-done" role="status">
          <span className="hr-bn-done__icon">
            <PartyPopper aria-hidden="true" />
          </span>
          <h3>{isChange ? 'Changes submitted' : 'You’re enrolled!'}</h3>
          <p className="muted">
            {plan.label} with {plan.insurer}
            {draft.dependents.length ? ` for you and ${draft.dependents.length} dependent${draft.dependents.length === 1 ? '' : 's'}` : ''}. People Ops will confirm with the insurer, usually within a day, and your digital card goes live as soon as they do.
          </p>
          <ol className="hr-bn-track hr-bn-track--center" aria-label="What happens next">
            <li className="is-done">
              <span className="hr-bn-track__dot">
                <Check aria-hidden="true" />
              </span>
              <span>
                <b>Submitted</b>
                <small>Just now</small>
              </span>
            </li>
            <li className="is-active">
              <span className="hr-bn-track__dot">
                <ShieldCheck aria-hidden="true" />
              </span>
              <span>
                <b>People Ops confirms</b>
                <small>Usually within a day</small>
              </span>
            </li>
            <li>
              <span className="hr-bn-track__dot">
                <CircleCheckBig aria-hidden="true" />
              </span>
              <span>
                <b>Card goes live</b>
                <small>In Benefits</small>
              </span>
            </li>
          </ol>
        </div>
      ) : (
        <>
          <Stepper steps={STEPS} current={step} maxReached={reached} onStep={goTo} />
          {step === 0 && (
            <div className="hr-bn-step">
              <div className="hr-bn-step__intro">
                <h3>Pick your health plan</h3>
                <p className="muted text-sm">All plans cover you from day one. Helix pays the premium; you only pay the contribution shown.</p>
              </div>
              <div className="hr-bn-plans" role="group" aria-label="Health plans">
                {HEALTH_PLANS.map((p) => {
                  const selected = draft.health === p.id;
                  const family = p.monthlyEmployee + p.monthlyPerDependent * draft.dependents.length;
                  const current = isChange && election?.health === p.id;
                  return (
                    <div key={p.id} className={cx('hr-bn-plan', selected && 'is-selected', p.recommended && 'is-recommended')} style={{ '--plan-h': p.hue } as CSSProperties} onClick={() => setHealth(p.id)}>
                      <div className="hr-bn-plan__tags">
                        {p.recommended && <span className="hr-bn-plan__tag hr-bn-plan__tag--rec">Recommended</span>}
                        {current && <span className="hr-bn-plan__tag">Current plan</span>}
                      </div>
                      <span className="hr-bn-plan__insurer">{p.insurer}</span>
                      <h4 className="hr-bn-plan__name">{p.label}</h4>
                      <div className="hr-bn-plan__price">
                        <b>{p.monthlyEmployee ? aed(p.monthlyEmployee) : 'Free'}</b>
                        <small>{p.monthlyEmployee ? 'a month for you' : 'Helix pays it all'}</small>
                      </div>
                      <dl className="hr-bn-plan__facts">
                        <div>
                          <dt>Annual limit</dt>
                          <dd>{aed(p.annualLimit, { compact: true })}</dd>
                        </div>
                        <div>
                          <dt>Network</dt>
                          <dd>{p.network}</dd>
                        </div>
                        <div>
                          <dt>Each dependent</dt>
                          <dd>+{aed(p.monthlyPerDependent)}/mo</dd>
                        </div>
                        <div>
                          <dt>Helix pays</dt>
                          <dd>{aed(COMPANY_PREMIUM[p.id])}/mo</dd>
                        </div>
                      </dl>
                      <ul className="hr-bn-plan__list">
                        {p.highlights.map((h) => (
                          <li key={h}>
                            <Check aria-hidden="true" />
                            {h}
                          </li>
                        ))}
                      </ul>
                      {draft.dependents.length > 0 && (
                        <p className="hr-bn-plan__family">
                          With your {draft.dependents.length} dependent{draft.dependents.length === 1 ? '' : 's'}: <b>{aed(family)}/mo</b>
                        </p>
                      )}
                      <button
                        type="button"
                        className={cx('btn btn--block hr-bn-plan__choose', selected && 'btn--primary')}
                        aria-pressed={selected}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setHealth(p.id);
                        }}
                      >
                        {selected ? (
                          <>
                            <CircleCheckBig aria-hidden="true" /> {p.label} selected
                          </>
                        ) : (
                          `Choose ${p.label}`
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="hr-bn-step">
              {event && (
                <div className="hr-bn-event">
                  <span aria-hidden="true">{event === 'baby' ? '👶' : '💍'}</span>
                  <p>
                    <b>{event === 'baby' ? 'Congratulations on your new arrival!' : 'Congratulations on your wedding!'}</b>{' '}
                    {event === 'baby' ? 'Add your little one below. Cover can start from their birth date if you submit within 30 days.' : 'Add your spouse below and we’ll take care of the rest with the insurer.'}
                  </p>
                </div>
              )}
              <div className="hr-bn-step__intro">
                <h3>Who should be covered?</h3>
                <p className="muted text-sm">
                  Add your spouse, children or parents. On {plan.label}, each dependent adds {aed(plan.monthlyPerDependent)} a month, and Helix tops up their premium too.
                </p>
              </div>
              {draft.dependents.length === 0 ? (
                <div className="hr-bn-deps-empty">
                  <Users aria-hidden="true" />
                  <div>
                    <b>Just you for now</b>
                    <p className="text-sm muted">That’s completely fine. You can add family later after a life event, like a wedding or a new baby.</p>
                  </div>
                </div>
              ) : (
                <ul className="hr-bn-deps">
                  {draft.dependents.map((d, i) => {
                    const err = showErrors ? issues[i] : { name: null, birthDate: null };
                    const Icon = RELATION_ICON[d.relation];
                    const age = ageLabel(d.birthDate, today);
                    return (
                      <li key={d.id} className="hr-bn-dep">
                        <span className="hr-bn-dep__badge" data-rel={d.relation} aria-hidden="true">
                          <Icon />
                        </span>
                        <div className="hr-bn-dep__fields">
                          <label className="field">
                            <span className="field-label">Full name</span>
                            <input
                              className={cx('input', err.name && 'is-invalid')}
                              value={d.name}
                              placeholder="As on their passport"
                              autoFocus={d.id === focusId}
                              aria-invalid={!!err.name}
                              onChange={(e) => updateDep(d.id, { name: e.target.value })}
                            />
                            {err.name && <span className="hr-bn-err">{err.name}</span>}
                          </label>
                          <label className="field">
                            <span className="field-label">Relationship</span>
                            <select className="select" value={d.relation} onChange={(e) => updateDep(d.id, { relation: e.target.value as Relation })}>
                              {RELATIONS.map((r) => (
                                <option key={r} value={r}>
                                  {RELATION_LABEL[r]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="field">
                            <span className="field-label">Date of birth {age && <span className="faint">· {age}</span>}</span>
                            <input
                              type="date"
                              className={cx('input', err.birthDate && 'is-invalid')}
                              value={d.birthDate ?? ''}
                              max={today}
                              aria-invalid={!!err.birthDate}
                              onChange={(e) => updateDep(d.id, { birthDate: e.target.value || undefined })}
                            />
                            {err.birthDate && <span className="hr-bn-err">{err.birthDate}</span>}
                          </label>
                        </div>
                        <div className="hr-bn-dep__side">
                          <span className="hr-bn-dep__cost">
                            +{aed(plan.monthlyPerDependent)}
                            <small>/mo</small>
                          </span>
                          <button type="button" className="icon-btn icon-btn--sm" aria-label={`Remove ${d.name.trim() || RELATION_LABEL[d.relation].toLowerCase()}`} onClick={() => removeDep(d.id)}>
                            <Trash2 />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="hr-bn-deps-add">
                <span className="text-sm muted">Add</span>
                {RELATIONS.map((r) => (
                  <button key={r} type="button" className="chip" disabled={full} onClick={() => addDep(r)}>
                    <Plus aria-hidden="true" /> {RELATION_LABEL[r]}
                  </button>
                ))}
                {full && <span className="text-xs faint">Up to {MAX_DEPENDENTS} dependents. Ask People Ops about more.</span>}
              </div>
              {draft.dependents.length > 0 && (
                <p className="hr-bn-subtotal">
                  {draft.dependents.length} × {aed(plan.monthlyPerDependent)} = <b>{aed(plan.monthlyPerDependent * draft.dependents.length)}</b> a month for your family
                </p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="hr-bn-step">
              <div className="hr-bn-step__intro">
                <h3>Extras</h3>
                <p className="muted text-sm">Optional add-ons on top of {plan.label}. You can change them at the next enrolment or after a life event.</p>
              </div>
              <div className="hr-bn-addons">
                {(['dental', 'vision'] as const).map((k) => {
                  const a = ADD_ONS[k];
                  const on = draft[k];
                  const Icon = k === 'dental' ? Smile : Glasses;
                  return (
                    <div key={k} className={cx('hr-bn-addon', on && 'is-on')} onClick={() => setDraft((d) => ({ ...d, [k]: !d[k] }))}>
                      <span className="hr-bn-addon__icon" aria-hidden="true">
                        <Icon />
                      </span>
                      <div className="grow">
                        <b>{a.label}</b>
                        <p className="text-sm muted">{a.description}</p>
                      </div>
                      <span className="hr-bn-addon__price">
                        +{aed(a.monthly)}
                        <small>/mo</small>
                      </span>
                      <span className="hr-bn-addon__switch" onClick={(e) => e.stopPropagation()}>
                        <Switch checked={on} onChange={(v) => setDraft((d) => ({ ...d, [k]: v }))} label={`${a.label}, ${aed(a.monthly)} a month`} />
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="hr-bn-life">
                <div className="hr-bn-life__head">
                  <span className="hr-bn-addon__icon" aria-hidden="true">
                    <Umbrella />
                  </span>
                  <div>
                    <b>Life &amp; disability cover</b>
                    <p className="text-sm muted">A multiple of your annual base salary, including permanent disability and critical illness. 2× is on Helix.</p>
                  </div>
                </div>
                <div className="hr-bn-life__opts" role="group" aria-label="Life cover">
                  {([2, 3, 4] as const).map((m) => (
                    <button key={m} type="button" aria-pressed={draft.lifeMultiple === m} className={cx('hr-bn-life__opt', draft.lifeMultiple === m && 'is-selected')} onClick={() => setDraft((d) => ({ ...d, lifeMultiple: m }))}>
                      <b>{m}×</b>
                      <span>{LIFE_COVER[m] ? `+${aed(LIFE_COVER[m])}/mo` : 'Free'}</span>
                      {comp && <small>{money(m * comp.baseMonthly * 12, comp.currency, { compact: true })} cover</small>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="hr-bn-step">
              <div className="hr-bn-review">
                <div className="hr-bn-review__choices">
                  <section className="hr-bn-choice">
                    <header>
                      <HeartPulse aria-hidden="true" /> Health plan
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => goTo(0)}>
                        Edit
                      </button>
                    </header>
                    <b>
                      {plan.label} · {plan.insurer}
                    </b>
                    <span className="text-sm muted">
                      {plan.network} · {aed(plan.annualLimit, { compact: true })} a year
                    </span>
                  </section>
                  <section className="hr-bn-choice">
                    <header>
                      <Users aria-hidden="true" /> Covered
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => goTo(1)}>
                        Edit
                      </button>
                    </header>
                    <b>{draft.dependents.length ? `You + ${draft.dependents.length}` : 'Just you'}</b>
                    <span className="text-sm muted">{draft.dependents.length ? draft.dependents.map((d) => `${d.name.trim()} (${RELATION_LABEL[d.relation].toLowerCase()})`).join(', ') : 'No dependents'}</span>
                  </section>
                  <section className="hr-bn-choice">
                    <header>
                      <Sparkles aria-hidden="true" /> Extras
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => goTo(2)}>
                        Edit
                      </button>
                    </header>
                    <b>{[draft.dental && 'Dental plus', draft.vision && 'Vision'].filter(Boolean).join(' + ') || 'No add-ons'}</b>
                    <span className="text-sm muted">Life cover {draft.lifeMultiple}× salary</span>
                  </section>
                </div>
                <div className="hr-bn-bill">
                  <div className="hr-bn-bill__head stat-label">Your monthly contribution</div>
                  <ul>
                    {cost.lines.map((l) => (
                      <li key={l.label}>
                        <span>{l.label}</span>
                        <span>{l.amount ? aed(l.amount) : 'Free'}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="hr-bn-bill__total">
                    <span>Total per month</span>
                    <b>{aed(cost.employeeMonthly)}</b>
                  </div>
                  <div className="hr-bn-bill__year">
                    <span>Per year</span>
                    <span>{aed(cost.employeeMonthly * 12)}</span>
                  </div>
                  <p className="hr-bn-bill__helix">
                    <Sparkles aria-hidden="true" />
                    <span>
                      Helix adds <b>{aed(cost.companyMonthly)}</b> a month on top ({aed(cost.companyMonthly * 12)} a year).
                    </span>
                  </p>
                </div>
              </div>
              <label className="hr-bn-consent">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>
                  I confirm these details are correct
                  {cost.employeeMonthly ? `, and agree that ${aed(cost.employeeMonthly)} a month is deducted from my salary once People Ops confirms my enrolment.` : ' and can be shared with the insurer.'}
                </span>
              </label>
              {error && (
                <p className="hr-bn-error" role="alert">
                  {error}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
