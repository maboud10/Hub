/**
 * New requisition — a five-step guided flow: decode the JD, confirm the role
 * details, assemble the hiring team and interview loop, set the salary range
 * (People Ops) and review the approval routing before submitting.
 * Accepts router state `{ jd: { text, fileName?, profile? } }` from the
 * Sourcing studio ("Create requisition from this JD").
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CircleCheck,
  CircleDashed,
  ClipboardCheck,
  FileText,
  Lock,
  Pencil,
  RotateCcw,
  Route,
  Save,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import type { Candidate, Department, EmploymentType, InterviewStep, JobProfile, ReqPriority, Requisition, Seniority, WorkModel } from '@/talent/types';
import { BANDS, CURRENCIES, EMPLOYMENT_LABEL, INTERVIEW_KIND_META, PRIORITY_META, SENIORITY_LABEL, WORK_MODEL_LABEL } from '@/talent/constants';
import { canApproveRequisition } from '@/talent/access';
import { useTalent } from '@/talent/store';
import { useTalentCaps, useTalentScope, useTalentViewer } from '@/talent/selectors';
import { toISODate } from '@/talent/onboarding';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { useNow } from '@/hooks/useNow';
import { usersWithPermission } from '@/lib/rbac';
import { cx } from '@/lib/cx';
import { Segmented, Switch } from '@/components/ui/primitives';
import { EngineBadge, PeopleStack, PersonChip, Stepper, type StepDef } from './components/shared';
import { JDHealth, JDInput, JDScanning, SearchDNA, SkillEditor, useJDAnalysis } from './components/jd';
import { UserSelect } from './components/pickers';
import { formatMoney, fmtDay } from './components/format';
import { ReqCard } from './reqs/ReqCard';
import { InterviewPlanEditor, PlanSummary } from './reqs/InterviewPlan';
import { CompGuardrail } from './reqs/CompGuardrail';
import { CompRange, LocationInput, NumberStepper, WorkModelPicker } from './reqs/pieces';
import { DEPARTMENTS, PLAN_TEMPLATES, PRIORITY_ORDER, annualSalary, bandForSeniority, isPeopleOps, normaliseLocation, planFamily, templatePlan } from './reqs/helpers';

const STEPS: StepDef[] = [
  { id: 'jd', label: 'Role & JD', icon: FileText, hint: 'Upload or paste the job description; AI decodes it.' },
  { id: 'details', label: 'Details', icon: SlidersHorizontal, hint: 'Title, team, location, level and headcount.' },
  { id: 'team', label: 'Team & loop', icon: Users, hint: 'Hiring manager, recruiter and the interview plan.' },
  { id: 'comp', label: 'Compensation', icon: Wallet, hint: 'Salary range with budget guardrails.' },
  { id: 'review', label: 'Review', icon: ClipboardCheck, hint: 'Check everything and route it for approval.' },
];

const PRIORITY_HINT: Record<ReqPriority, string> = {
  critical: 'Business-critical: daily pipeline reviews and first call on interviewers.',
  high: 'Top of the recruiter’s queue.',
  normal: 'Standard cadence.',
  low: 'Opportunistic: hire when the right person appears.',
};

interface Details {
  title: string;
  department: Department;
  location: string;
  workModel: WorkModel;
  employmentType: EmploymentType;
  seniority: Seniority;
  band: string;
  headcount: number;
  priority: ReqPriority;
  targetStartDate: string;
}

interface CompState {
  enabled: boolean;
  min: string;
  max: string;
  currency: string;
}

const CURRENCY_BY_PLACE: [RegExp, string][] = [
  [/riyadh|jeddah|saudi|ksa/i, 'SAR'],
  [/london|\buk\b|united kingdom/i, 'GBP'],
  [/berlin|lisbon|madrid|paris|amsterdam|dublin/i, 'EUR'],
  [/bengaluru|bangalore|india|mumbai/i, 'INR'],
  [/singapore/i, 'SGD'],
  [/new york|toronto|usa|canada|san francisco/i, 'USD'],
];
const currencyFor = (location: string) => CURRENCY_BY_PLACE.find(([re]) => re.test(location))?.[1] ?? 'AED';

type RouteJD = { text: string; fileName?: string; profile?: JobProfile | null };

export function RequisitionWizard() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeJd = (location.state as { jd?: RouteJD } | null)?.jd;
  const jd = useJDAnalysis(routeJd ? { text: routeJd.text, fileName: routeJd.fileName, profile: routeJd.profile ?? null } : undefined);
  const caps = useTalentCaps();
  const viewer = useTalentViewer();
  const me = useSessionUser();
  const scope = useTalentScope();
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  const topRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [skipJd, setSkipJd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [overrides, setOverrides] = useState<Partial<Details>>({});
  const [compOverrides, setCompOverrides] = useState<Partial<CompState>>({});
  const [hmOverride, setHmOverride] = useState<string | null>(null);
  const [recOverride, setRecOverride] = useState<string | null>(null);
  const [customPlan, setCustomPlan] = useState<InterviewStep[] | null>(null);

  // A JD handed over without a decoded profile is decoded once on arrival.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    if (routeJd?.text && !routeJd.profile && routeJd.text.trim().length >= 40) void jd.analyze(routeJd.text, routeJd.fileName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const profile = skipJd ? null : jd.profile;

  // ── details: decoded defaults + whatever the user changed
  const details = useMemo<Details>(() => {
    const myDept = DEPARTMENTS.includes(me?.department as Department) ? (me!.department as Department) : 'Engineering';
    const base: Details = {
      title: profile?.title ?? '',
      department: profile?.department ?? myDept,
      location: normaliseLocation(profile?.location) || 'Dubai',
      workModel: profile?.workModel ?? 'hybrid',
      employmentType: profile?.employmentType ?? 'full-time',
      seniority: profile?.seniority ?? 'senior',
      band: '',
      headcount: 1,
      priority: 'normal',
      targetStartDate: '',
    };
    const merged = { ...base, ...overrides };
    if (!overrides.band) merged.band = bandForSeniority(merged.seniority);
    return merged;
  }, [profile, overrides, me]);
  const setField = <K extends keyof Details>(k: K, v: Details[K]) => setOverrides((o) => ({ ...o, [k]: v }));

  // ── team
  const hiringManagerId = caps.manage ? hmOverride ?? '' : me?.id ?? '';
  const suggestedRecruiter = useMemo(() => {
    const pool = users.filter((u) => u.active && isPeopleOps(u));
    if (me && caps.manage && isPeopleOps(me)) return me.id;
    const count = new Map<string, number>();
    for (const r of scope.requisitions) if (r.department === details.department && pool.some((u) => u.id === r.recruiterId)) count.set(r.recruiterId, (count.get(r.recruiterId) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? pool[0]?.id ?? '';
  }, [users, me, caps.manage, scope.requisitions, details.department]);
  const recruiterId = recOverride ?? suggestedRecruiter;
  const family = planFamily(details.department, details.title);
  const autoPlan = useMemo(() => templatePlan(family, { recruiterId, hiringManagerId }), [family, recruiterId, hiringManagerId]);
  const plan = customPlan ?? autoPlan;

  // ── compensation
  const jdSalary = annualSalary(profile);
  const comp = useMemo<CompState>(() => {
    const base: CompState = jdSalary
      ? { enabled: true, min: String(jdSalary.min), max: String(jdSalary.max), currency: (CURRENCIES as readonly string[]).includes(jdSalary.currency) ? jdSalary.currency : 'AED' }
      : { enabled: true, min: '', max: '', currency: currencyFor(details.location) };
    return { ...base, ...compOverrides };
  }, [jdSalary?.min, jdSalary?.max, jdSalary?.currency, details.location, compOverrides]); // eslint-disable-line react-hooks/exhaustive-deps
  const setComp = <K extends keyof CompState>(k: K, v: CompState[K]) => setCompOverrides((o) => ({ ...o, [k]: v }));
  const compMin = Number(comp.min);
  const compMax = Number(comp.max);
  const salary = caps.comp && comp.enabled && compMin > 0 && compMax >= compMin ? { min: Math.round(compMin), max: Math.round(compMax), currency: comp.currency } : null;

  // ── preview + routing
  const now = useNow(60_000);
  const previewReq: Requisition = {
    id: 'preview',
    title: details.title.trim(),
    department: details.department,
    location: details.location.trim(),
    workModel: details.workModel,
    employmentType: details.employmentType,
    seniority: details.seniority,
    band: details.band,
    salary,
    headcount: details.headcount,
    hires: 0,
    status: 'draft',
    priority: details.priority,
    hiringManagerId,
    recruiterId,
    interviewPlan: plan,
    jd: { text: skipJd ? '' : jd.text, fileName: jd.fileName, profile },
    createdBy: me?.id ?? '',
    createdAt: now,
    targetStartDate: details.targetStartDate || undefined,
  };
  const opensDirectly = !!viewer && !!hiringManagerId && canApproveRequisition(viewer, previewReq).ok;
  const approvers = useMemo(
    () =>
      usersWithPermission(users, roles, 'talent.manage')
        .filter((u) => u.active && u.id !== hiringManagerId)
        .map((u) => u.id),
    [users, roles, hiringManagerId],
  );

  // ── validation
  const today = toISODate(Date.now());
  const validate = (s: number): string[] => {
    const e: string[] = [];
    if (s === 0 && !profile && !skipJd) e.push('Decode a job description, or skip and fill in the details manually.');
    if (s === 1) {
      if (details.title.trim().length < 3) e.push('Give the role a title (3+ characters).');
      if (!details.location.trim()) e.push('Add a location.');
      if (details.headcount < 1 || details.headcount > 50) e.push('Headcount must be between 1 and 50.');
      if (details.targetStartDate && details.targetStartDate < today) e.push('The target start date is in the past.');
    }
    if (s === 2) {
      if (!hiringManagerId) e.push('Pick the hiring manager.');
      if (!recruiterId) e.push('Pick a recruiter.');
      if (!plan.length) e.push('Add at least one interview step.');
    }
    if (s === 3 && caps.comp && comp.enabled) {
      if (!(compMin > 0) || !(compMax > 0)) e.push('Enter both ends of the salary range, or switch it off for now.');
      else if (compMin > compMax) e.push('The salary minimum is above the maximum.');
    }
    return e;
  };
  const errors = validate(step);
  const stepDone = [0, 1, 2, 3].map((s) => validate(s).length === 0);

  const goTo = (i: number) => {
    setStep(i);
    setShowErrors(false);
    window.requestAnimationFrame(() => topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };

  const next = async () => {
    if (step === 0 && !profile && !skipJd && jd.text.trim().length >= 40) {
      setBusy(true);
      const p = await jd.analyze();
      setBusy(false);
      if (!p) return;
    } else if (errors.length) {
      setShowErrors(true);
      return;
    }
    const to = Math.min(STEPS.length - 1, step + 1);
    setMaxReached((m) => Math.max(m, to));
    goTo(to);
  };

  const skip = () => {
    setSkipJd(true);
    setMaxReached((m) => Math.max(m, 1));
    goTo(1);
  };

  const create = (submit: boolean) => {
    const firstBad = [0, 1, 2, 3].find((s) => validate(s).length > 0);
    if (firstBad !== undefined) {
      goTo(firstBad);
      setShowErrors(true);
      return;
    }
    const res = useTalent.getState().createRequisition({
      title: details.title.trim(),
      department: details.department,
      location: details.location.trim(),
      workModel: details.workModel,
      employmentType: details.employmentType,
      seniority: details.seniority,
      band: details.band,
      salary,
      headcount: details.headcount,
      priority: details.priority,
      hiringManagerId,
      recruiterId,
      interviewPlan: plan,
      jd: skipJd || !jd.text.trim() ? { text: '', profile: null } : { text: jd.text, fileName: jd.fileName, profile: jd.profile },
      targetStartDate: details.targetStartDate || undefined,
      submit,
    });
    if (toast.result(res) && res.id) navigate(`/talent/requisitions/${res.id}`);
  };

  const scanning = jd.status === 'analyzing' || jd.status === 'reading';
  const isLast = step === STEPS.length - 1;

  return (
    <div className="tl-wiz" ref={topRef}>
      <div className="tl-wiz__head">
        <div className="grow">
          <div className="eyebrow">New requisition</div>
          <h2 className="tl-wiz__title">{details.title.trim() || 'Raise a requisition'}</h2>
          <p className="page-sub">JD → details → team & loop → compensation → review. Nothing is saved until the last step.</p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={() => navigate('/talent/requisitions')}>
          <X /> Cancel
        </button>
      </div>

      <Stepper steps={STEPS} current={step} maxReached={maxReached} onStep={goTo} />

      <div className="tl-wiz__body">
        <section className="tl-wiz__main" aria-labelledby="tl-wiz-step-title">
          <div className="tl-wiz__stephead">
            <span className="tl-wiz__stepno">
              Step {step + 1} / {STEPS.length}
            </span>
            <h3 id="tl-wiz-step-title">{STEPS[step].label}</h3>
            <p className="muted text-sm">{STEPS[step].hint}</p>
          </div>

          {showErrors && errors.length > 0 && (
            <ul className="tl-wiz__errors" role="alert">
              {errors.map((e) => (
                <li key={e}>
                  <TriangleAlert aria-hidden="true" /> {e}
                </li>
              ))}
            </ul>
          )}

          {step === 0 && (
            <div className="tl-wiz-jd">
              {routeJd && !skipJd && (
                <p className="tl-wiz-note">
                  <Sparkles aria-hidden="true" /> Job description handed over from the Sourcing studio{routeJd.profile ? ', already decoded' : ''}.
                </p>
              )}
              {skipJd ? (
                <div className="tl-wiz-skipped">
                  <Pencil aria-hidden="true" />
                  <div className="grow">
                    <b>Filling it in manually</b>
                    <span className="muted text-sm">No JD attached. You can add one later from the requisition page.</span>
                  </div>
                  <button type="button" className="btn btn--sm" onClick={() => setSkipJd(false)}>
                    Add a JD instead
                  </button>
                </div>
              ) : scanning ? (
                <JDScanning />
              ) : jd.profile ? (
                <DecodedSummary profile={jd.profile} fallbackReason={jd.fallbackReason} fileName={jd.fileName} onChange={jd.setProfile} onReplace={jd.reset} showSalary={caps.comp} />
              ) : (
                <JDInput jd={jd} />
              )}
              {!skipJd && !jd.profile && !scanning && (
                <div className="tl-wiz-skip">
                  <span className="faint text-sm">No JD yet?</span>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={skip}>
                    Skip JD, fill in manually <ArrowRight />
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="tl-req-form">
              <label className="field tl-req-form__wide">
                <span className="field-label">Role title</span>
                <input
                  className="input tl-wiz__title-input"
                  value={details.title}
                  onChange={(e) => setField('title', e.target.value)}
                  placeholder="e.g. Senior Frontend Engineer"
                  aria-invalid={showErrors && details.title.trim().length < 3 ? true : undefined}
                  maxLength={90}
                />
                {profile && overrides.title === undefined && <span className="field-hint">From the decoded JD.</span>}
              </label>
              <label className="field">
                <span className="field-label">Department</span>
                <select className="select" value={details.department} onChange={(e) => setField('department', e.target.value as Department)}>
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Location</span>
                <LocationInput value={details.location} onChange={(v) => setField('location', v)} invalid={showErrors && !details.location.trim()} />
              </label>
              <div className="field">
                <span className="field-label">Work model</span>
                <WorkModelPicker value={details.workModel} onChange={(v) => setField('workModel', v)} />
              </div>
              <label className="field">
                <span className="field-label">Employment type</span>
                <select className="select" value={details.employmentType} onChange={(e) => setField('employmentType', e.target.value as EmploymentType)}>
                  {(Object.keys(EMPLOYMENT_LABEL) as EmploymentType[]).map((t) => (
                    <option key={t} value={t}>
                      {EMPLOYMENT_LABEL[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Seniority</span>
                <select className="select" value={details.seniority} onChange={(e) => setField('seniority', e.target.value as Seniority)}>
                  {(Object.keys(SENIORITY_LABEL) as Seniority[]).map((s) => (
                    <option key={s} value={s}>
                      {SENIORITY_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Band</span>
                <select className="select" value={details.band} onChange={(e) => setField('band', e.target.value)}>
                  {BANDS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
                <span className="field-hint">
                  Typical for {SENIORITY_LABEL[details.seniority]}: {bandForSeniority(details.seniority)}
                </span>
              </label>
              <div className="field">
                <span className="field-label">Headcount</span>
                <NumberStepper value={details.headcount} onChange={(n) => setField('headcount', n)} min={1} max={50} label="Headcount" />
                <span className="field-hint">Seats to fill with this requisition.</span>
              </div>
              <label className="field">
                <span className="field-label">Target start date</span>
                <input className="input" type="date" min={today} value={details.targetStartDate} onChange={(e) => setField('targetStartDate', e.target.value)} />
              </label>
              <div className="field tl-req-form__wide">
                <span className="field-label">Priority</span>
                <Segmented value={details.priority} onChange={(v) => setField('priority', v)} label="Priority" options={PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITY_META[p].label }))} />
                <span className="field-hint">{PRIORITY_HINT[details.priority]}</span>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="stack stack--lg">
              <div className="tl-req-form">
                <div className="field">
                  <span className="field-label">Hiring manager</span>
                  {caps.manage ? (
                    <UserSelect value={hiringManagerId} onChange={setHmOverride} placeholder="Pick the hiring manager" ariaLabel="Hiring manager" />
                  ) : (
                    <div className="tl-wiz-locked">
                      <PersonChip userId={me?.id} size={24} label={me ? `${me.name} (you)` : undefined} />
                      <Lock aria-hidden="true" />
                    </div>
                  )}
                  <span className="field-hint">{caps.manage ? 'Owns the hire decision and the hiring-manager offer sign-off.' : 'Hiring managers raise requisitions for their own team.'}</span>
                </div>
                <div className="field">
                  <span className="field-label">Recruiter</span>
                  <UserSelect value={recruiterId} onChange={setRecOverride} filter={isPeopleOps} placeholder="Pick a recruiter" ariaLabel="Recruiter" />
                  <span className="field-hint">{recOverride === null && recruiterId ? (recruiterId === me?.id ? 'You’ll run the process.' : `Suggested: partners on ${details.department} roles.`) : 'People Ops partner who runs the process.'}</span>
                </div>
              </div>
              <div className="tl-wiz-plan">
                <div className="tl-wiz-plan__head">
                  <div className="grow">
                    <h4>Interview loop</h4>
                    <span className="muted text-sm">{customPlan ? 'Custom loop' : `${PLAN_TEMPLATES[family].label} for ${details.department}. Tweak it freely.`}</span>
                  </div>
                  {customPlan && (
                    <button type="button" className="btn btn--sm btn--ghost" onClick={() => setCustomPlan(null)}>
                      <RotateCcw /> Reset to template
                    </button>
                  )}
                </div>
                <InterviewPlanEditor steps={plan} onChange={setCustomPlan} />
              </div>
            </div>
          )}

          {step === 3 &&
            (caps.comp ? (
              <div className="tl-wiz-comp">
                <div className="tl-wiz-comp__toggle">
                  <Switch checked={comp.enabled} onChange={(v) => setComp('enabled', v)} label="Set the salary range now" />
                  <div className="grow">
                    <b>Set the salary range now</b>
                    <span className="muted text-sm">{jdSalary ? 'Prefilled from the salary in the JD (annualised).' : 'Annual base salary. Offers are checked against it.'}</span>
                  </div>
                </div>
                {comp.enabled ? (
                  <>
                    <div className="tl-req-form__money">
                      <label className="field">
                        <span className="field-label">Minimum</span>
                        <input className="input" type="number" min={0} step={1000} inputMode="numeric" value={comp.min} onChange={(e) => setComp('min', e.target.value)} aria-invalid={showErrors && !(compMin > 0) ? true : undefined} />
                      </label>
                      <label className="field">
                        <span className="field-label">Maximum</span>
                        <input className="input" type="number" min={0} step={1000} inputMode="numeric" value={comp.max} onChange={(e) => setComp('max', e.target.value)} aria-invalid={showErrors && !(compMax >= compMin) ? true : undefined} />
                      </label>
                      <label className="field">
                        <span className="field-label">Currency</span>
                        <select className="select" value={comp.currency} onChange={(e) => setComp('currency', e.target.value)}>
                          {CURRENCIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <CompGuardrail min={compMin} max={compMax} currency={comp.currency} band={details.band} peers={scope.requisitions} jdSalary={jdSalary} />
                  </>
                ) : (
                  <p className="tl-wiz-note">
                    <Lock aria-hidden="true" /> The requisition can be approved without a range, but offers can’t be checked against a band until you add one.
                  </p>
                )}
              </div>
            ) : (
              <div className="tl-wiz-lockcard">
                <span className="tl-wiz-lockcard__icon" aria-hidden="true">
                  <Lock />
                </span>
                <div>
                  <b>People Ops will set the range</b>
                  <p className="muted text-sm">Salary bands are restricted to People Ops (“View compensation”). Your recruiter adds the range before offers go out. Carry on to review.</p>
                </div>
              </div>
            ))}

          {step === 4 && (
            <div className="tl-wiz-review">
              <ReviewBlock title="Role & JD" icon={FileText} onEdit={() => goTo(0)}>
                {profile ? (
                  <div className="tl-wiz-review__jd">
                    <span>
                      <FileText aria-hidden="true" className="inline-icon" /> {jd.fileName ?? 'Pasted job description'} · {profile.skills.filter((s) => s.must).length} must-have / {profile.skills.filter((s) => !s.must).length} nice-to-have skills
                    </span>
                    <span className={cx('tag', profile.quality.score >= 80 ? 'is-good' : profile.quality.score >= 60 ? 'is-ok' : 'is-poor', 'tl-req-health-tag')}>JD health {profile.quality.score}</span>
                  </div>
                ) : (
                  <span className="muted text-sm">No JD attached. Filled in manually.</span>
                )}
              </ReviewBlock>
              <ReviewBlock title="Details" icon={SlidersHorizontal} onEdit={() => goTo(1)}>
                <dl className="tl-wiz-dl">
                  <div>
                    <dt>Title</dt>
                    <dd>{details.title || '—'}</dd>
                  </div>
                  <div>
                    <dt>Department</dt>
                    <dd>{details.department}</dd>
                  </div>
                  <div>
                    <dt>Location</dt>
                    <dd>
                      {details.location} · {WORK_MODEL_LABEL[details.workModel]}
                    </dd>
                  </div>
                  <div>
                    <dt>Type · level</dt>
                    <dd>
                      {EMPLOYMENT_LABEL[details.employmentType]} · {SENIORITY_LABEL[details.seniority]} · <span className="mono">{details.band}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>Headcount</dt>
                    <dd>
                      {details.headcount} seat{details.headcount === 1 ? '' : 's'}
                    </dd>
                  </div>
                  <div>
                    <dt>Priority</dt>
                    <dd>{PRIORITY_META[details.priority].label}</dd>
                  </div>
                  <div>
                    <dt>Target start</dt>
                    <dd>{details.targetStartDate ? fmtDay(details.targetStartDate) : 'Not set'}</dd>
                  </div>
                </dl>
              </ReviewBlock>
              <ReviewBlock title="Hiring team & loop" icon={Users} onEdit={() => goTo(2)}>
                <div className="tl-wiz-review__team">
                  <span>
                    <span className="stat-label">HM</span> <PersonChip userId={hiringManagerId} />
                  </span>
                  <span>
                    <span className="stat-label">Recruiter</span> <PersonChip userId={recruiterId} />
                  </span>
                  <PlanSummary steps={plan} />
                </div>
                <ol className="tl-wiz-review__plan">
                  {plan.map((s, i) => {
                    const Icon = INTERVIEW_KIND_META[s.kind].icon;
                    return (
                      <li key={s.id}>
                        <span className="tl-wiz-review__n">{i + 1}</span>
                        <Icon aria-hidden="true" />
                        <span className="grow truncate">{s.label}</span>
                        <span className="faint text-xs">{s.durationMins}m</span>
                        {s.interviewerIds.length ? <PeopleStack userIds={s.interviewerIds} size={20} /> : <span className="tl-req-plan__warn">No interviewer</span>}
                      </li>
                    );
                  })}
                </ol>
              </ReviewBlock>
              <ReviewBlock title="Compensation" icon={Wallet} onEdit={() => goTo(3)}>
                {caps.comp ? (
                  salary ? (
                    <span className="tl-wiz-review__money">
                      {formatMoney(salary.min, salary.currency)} – {formatMoney(salary.max, salary.currency)} <span className="faint">per year</span>
                    </span>
                  ) : (
                    <span className="muted text-sm">No range yet. Add it before offers go out.</span>
                  )
                ) : (
                  <span className="muted text-sm row" style={{ gap: 6 }}>
                    <CompRange salary={null} /> People Ops will set the range.
                  </span>
                )}
              </ReviewBlock>
              <div className={cx('tl-wiz-route', opensDirectly ? 'is-direct' : 'is-approval')}>
                <span className="tl-wiz-route__icon" aria-hidden="true">
                  {opensDirectly ? <ShieldCheck /> : <Route />}
                </span>
                <div className="grow">
                  <b>{opensDirectly ? 'Opens immediately when you submit' : 'Routed for headcount approval'}</b>
                  <p className="muted text-sm">
                    {opensDirectly
                      ? 'You have “Run recruiting” and you aren’t the hiring manager, so your submission is the approval. The hiring manager and recruiter are notified.'
                      : 'Headcount is approved by a recruiter with “Run recruiting” who isn’t the hiring manager (separation of duties). Once approved, the requisition opens for sourcing.'}
                  </p>
                  {!opensDirectly && approvers.length > 0 && (
                    <span className="tl-wiz-route__who">
                      <span className="faint text-xs">Can approve:</span> <PeopleStack userIds={approvers} max={5} size={22} />
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="tl-wiz__aside" aria-label="Live preview">
          <div className="tl-wiz__aside-label">
            <span className="stat-label">Live preview</span>
          </div>
          <ReqCard req={previewReq} apps={[]} candById={EMPTY_CANDS} now={now} preview />
          <ol className="tl-wiz-check" aria-label="Checklist">
            {[
              { label: profile ? 'JD decoded' : skipJd ? 'JD skipped' : 'Decode the JD', done: stepDone[0] },
              { label: 'Role details', done: stepDone[1] },
              { label: 'Team & interview loop', done: stepDone[2] },
              { label: caps.comp ? (salary ? 'Salary range set' : comp.enabled ? 'Salary range' : 'Range later') : 'Range by People Ops', done: stepDone[3] },
            ].map((c, i) => (
              <li key={c.label} className={cx('tl-wiz-check__item', c.done && i <= maxReached && 'is-done')}>
                {c.done && i <= maxReached ? <CircleCheck aria-hidden="true" /> : <CircleDashed aria-hidden="true" />}
                {c.label}
              </li>
            ))}
          </ol>
        </aside>
      </div>

      <div className={cx('tl-wiz__foot', isLast && 'is-last')}>
        <button type="button" className="btn btn--ghost" onClick={() => goTo(Math.max(0, step - 1))} disabled={step === 0}>
          <ArrowLeft /> Back
        </button>
        <span className="tl-wiz__progress" aria-hidden="true">
          <span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </span>
        {isLast ? (
          <>
            <button type="button" className="btn" onClick={() => create(false)}>
              <Save /> Save as draft
            </button>
            <button type="button" className="btn btn--primary" onClick={() => create(true)}>
              {opensDirectly ? <Briefcase /> : <Send />} {opensDirectly ? 'Submit & open' : 'Submit for approval'}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--primary" onClick={() => void next()} disabled={busy || scanning}>
            {step === 0 && !profile && !skipJd && jd.text.trim().length >= 40 ? 'Decode & continue' : 'Next'} <ArrowRight />
          </button>
        )}
      </div>
    </div>
  );
}

const EMPTY_CANDS = new Map<string, Candidate>();

function ReviewBlock({ title, icon: Icon, onEdit, children }: { title: string; icon: typeof FileText; onEdit: () => void; children: ReactNode }) {
  return (
    <section className="tl-wiz-block">
      <header className="tl-wiz-block__head">
        <Icon aria-hidden="true" />
        <h4 className="grow">{title}</h4>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onEdit}>
          <Pencil /> Edit
        </button>
      </header>
      {children}
    </section>
  );
}

function DecodedSummary({
  profile,
  fallbackReason,
  fileName,
  onChange,
  onReplace,
  showSalary,
}: {
  profile: JobProfile;
  fallbackReason?: string;
  fileName?: string;
  onChange: (p: JobProfile) => void;
  onReplace: () => void;
  showSalary: boolean;
}) {
  const salary = annualSalary(profile);
  return (
    <div className="tl-wiz-decoded">
      <div className="tl-wiz-decoded__head">
        <Sparkles aria-hidden="true" />
        <span className="stat-label grow">Decoded{fileName ? ` · ${fileName}` : ''}</span>
        <EngineBadge engine={profile.engine} />
        <button type="button" className="btn btn--ghost btn--sm" onClick={onReplace}>
          <RotateCcw /> Replace JD
        </button>
      </div>
      <div className="tl-wiz-decoded__title">{profile.title}</div>
      {profile.summary && <p className="tl-wiz-decoded__summary clamp-2">{profile.summary}</p>}
      <div className="tl-wiz-decoded__facts">
        <span className="tag">{SENIORITY_LABEL[profile.seniority]}</span>
        {profile.department && <span className="tag">{profile.department}</span>}
        {profile.location && <span className="tag">{profile.location}</span>}
        {profile.workModel && <span className="tag">{WORK_MODEL_LABEL[profile.workModel]}</span>}
        <span className="tag">{EMPLOYMENT_LABEL[profile.employmentType]}</span>
        {profile.yearsMin !== null && <span className="tag">{profile.yearsMin}+ yrs</span>}
        {salary &&
          (showSalary ? (
            <span className="tag tl-wiz-decoded__salary">
              {formatMoney(salary.min, salary.currency, { compact: true })}–{formatMoney(salary.max, salary.currency, { compact: true })} / yr
            </span>
          ) : (
            <span className="tag">
              <Lock aria-hidden="true" className="inline-icon" /> Salary stated
            </span>
          ))}
      </div>
      <div className="tl-wiz-decoded__grid">
        <div className="tl-wiz-decoded__skills">
          <span className="stat-label">Skills · tap to tune must / nice and weight</span>
          <SkillEditor skills={profile.skills} onChange={(skills) => onChange({ ...profile, skills })} />
        </div>
        <JDHealth quality={profile.quality} compact />
      </div>
      <details className="tl-wiz-refine">
        <summary>Refine the Search DNA (title, level, location)</summary>
        <SearchDNA profile={profile} onChange={onChange} />
      </details>
      {fallbackReason && <p className="faint text-xs">Gemini was unavailable ({fallbackReason}); decoded with the offline engine.</p>}
    </div>
  );
}
