/**
 * Sourcing studio · steps 1–2.
 *   StepJD     — bring a job description: upload / paste / sample, or load an
 *                open requisition (its JD + decoded profile become the target).
 *   StepDecode — the decoded Search DNA as an editable HUD: facts, skill
 *                signature, skills editor, JD health and the highlighted X-ray.
 * Every edit feeds the ranking, LinkedIn searches and outreach downstream.
 */
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowRight,
  BrainCircuit,
  Briefcase,
  CircleCheck,
  FileText,
  Linkedin,
  ListChecks,
  Recycle,
  ScanText,
  Send,
  ShieldCheck,
  TriangleAlert,
  Users,
} from 'lucide-react';
import type { JobProfile, Requisition, SkillRequirement } from '@/talent/types';
import { EMPLOYMENT_LABEL, PRIORITY_META, SENIORITY_LABEL, WORK_MODEL_LABEL } from '@/talent/constants';
import { useTalentCaps, useTalentScope } from '@/talent/selectors';
import { EmptyState } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { JDHealth, JDInput, JDScanning, JDXray, SearchDNA, SkillEditor, type JDAnalysis } from '../components/jd';
import { Comp, PriorityBadge, ReqStatusBadge } from '../components/shared';
import { formatRange } from '../components/format';
import { PanelHead } from './kit';
import { STEP, studio } from './store';

// ───────────────────────── step 1 · job description ─────────────────────────
export function StepJD({ jd, activeReqId }: { jd: JDAnalysis; activeReqId: string | null }) {
  const busy = jd.status === 'reading' || jd.status === 'analyzing';
  const must = jd.profile?.skills.filter((s) => s.must).length ?? 0;
  return (
    <div className="tl-src-grid tl-src-grid--jd">
      <section className="card tl-src-panel tl-src-panel--hero hud">
        <PanelHead
          n="01"
          title="Drop in a job description"
          sub="Upload the JD document, paste it, or try a sample. We decode skills, seniority, location and salary signals, then search your talent pool and LinkedIn."
        />
        {busy && <JDScanning label={jd.status === 'reading' ? 'Reading the document' : 'Decoding the job description'} />}
        <JDInput jd={jd} cta="Decode & find talent" />
        {jd.profile && jd.status === 'ready' && (
          <button type="button" className="tl-src-resume" onClick={() => studio.goTo(STEP.decode)}>
            <CircleCheck aria-hidden="true" />
            <span className="grow">
              <b className="truncate">Decoded: {jd.profile.title}</b>
              <span className="faint text-xs">
                {must} must-have skills · JD health {jd.profile.quality.score}
              </span>
            </span>
            <span className="tl-src-resume__cta">
              Review Search DNA <ArrowRight aria-hidden="true" />
            </span>
          </button>
        )}
      </section>
      <aside className="tl-src-aside">
        <ReqPicker activeReqId={activeReqId} />
        <HowItWorks />
      </aside>
    </div>
  );
}

const PRIORITY_RANK = { critical: 0, high: 1, normal: 2, low: 3 } as const;

function ReqPicker({ activeReqId }: { activeReqId: string | null }) {
  const { requisitions, applications } = useTalentScope();
  const reqs = useMemo(
    () =>
      requisitions
        .filter((r) => r.status === 'open' || r.status === 'pending-approval')
        .sort((a, b) => Number(a.status !== 'open') - Number(b.status !== 'open') || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.createdAt - a.createdAt),
    [requisitions],
  );
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of applications) if (a.status === 'active') m.set(a.requisitionId, (m.get(a.requisitionId) ?? 0) + 1);
    return m;
  }, [applications]);

  return (
    <section className="card tl-src-panel">
      <PanelHead icon={Briefcase} title="Or use an open requisition" sub="Loads its JD and decoded profile. People you add go straight into its pipeline." />
      {reqs.length ? (
        <ul className="tl-src-reqs">
          {reqs.map((r) => (
            <li key={r.id}>
              <button type="button" className={cx('tl-src-req', activeReqId === r.id && 'is-active')} onClick={() => studio.loadRequisition(r)} aria-current={activeReqId === r.id || undefined}>
                <span className="tl-src-req__main">
                  <span className="tl-src-req__title">{r.title}</span>
                  <span className="tl-src-req__meta">
                    {r.department} · {r.location} · {WORK_MODEL_LABEL[r.workModel]}
                  </span>
                  <span className="tl-src-req__badges">
                    <ReqStatusBadge status={r.status} />
                    {(r.priority === 'critical' || r.priority === 'high') && <PriorityBadge priority={r.priority} />}
                    <span className="tl-src-req__count" title={`${PRIORITY_META[r.priority].label} priority`}>
                      <Users aria-hidden="true" /> {counts.get(r.id) ?? 0} in pipeline
                    </span>
                  </span>
                </span>
                <span className="tl-src-req__go">
                  {activeReqId === r.id ? 'Loaded' : r.jd.profile ? 'Use JD' : 'Decode JD'}
                  <ArrowRight aria-hidden="true" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<Briefcase />} title="No open requisitions">
          Paste a JD on the left — you can create a requisition from it after decoding.
        </EmptyState>
      )}
    </section>
  );
}

const HOW = [
  { icon: BrainCircuit, title: 'Decode', text: 'Skills, level, location and JD health. Explainable and editable.' },
  { icon: Recycle, title: 'Rediscover', text: 'Rank the people you already know first: silver medalists, referrals, past applicants.' },
  { icon: Linkedin, title: 'Search LinkedIn', text: 'Ready-to-run Boolean and X-ray searches plus a ranked prospect feed.' },
  { icon: Send, title: 'Reach out', text: 'A personal draft for each person. You send it; NEXUS logs it and schedules follow-ups.' },
];

function HowItWorks() {
  return (
    <section className="card card--flat tl-src-how">
      <div className="stat-label">How it works</div>
      <ol className="tl-src-how__list">
        {HOW.map((h, i) => {
          const Icon = h.icon;
          return (
            <li key={h.title} style={{ '--i': i } as CSSProperties}>
              <span className="tl-src-how__icon" aria-hidden="true">
                <Icon />
              </span>
              <div>
                <b>{h.title}</b>
                <p>{h.text}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="tl-src-how__trust">
        <ShieldCheck aria-hidden="true" />
        Nothing is sent automatically. LinkedIn messages are drafted for you to send yourself (assisted mode).
      </p>
    </section>
  );
}

// ───────────────────────── step 2 · decode ─────────────────────────
export function StepDecode({ jd, profile, targetReq }: { jd: JDAnalysis; profile: JobProfile; targetReq: Requisition | null }) {
  const caps = useTalentCaps();
  const navigate = useNavigate();
  const createReq = () => navigate('/talent/requisitions/new', { state: { jd: { text: jd.text, fileName: jd.fileName, profile } } });

  return (
    <div className="stack stack--lg">
      {jd.fallbackReason && (
        <div className="tl-src-notice tl-src-notice--warn" role="note">
          <TriangleAlert aria-hidden="true" />
          <span>
            <b>Gemini was unavailable</b> ({jd.fallbackReason}), so the offline engine decoded this JD. Every signal below is still explainable and editable.
          </span>
        </div>
      )}

      <DnaHero profile={profile} targetReq={targetReq} fileName={jd.fileName} />

      <div className="tl-src-grid tl-src-grid--decode">
        <div className="stack">
          <section className="card tl-src-panel">
            <SearchDNA profile={profile} onChange={studio.setProfile} />
          </section>
          <section className="card tl-src-panel">
            <PanelHead icon={ListChecks} title="Skills that drive the match" sub="Toggle must / nice and tap the bars to change weight. Edits re-rank everyone downstream." />
            <SkillEditor skills={profile.skills} onChange={(skills) => studio.setProfile({ ...profile, skills })} />
          </section>
        </div>
        <div className="stack">
          <JDHealth quality={profile.quality} />
          <section className="card tl-src-panel">
            <PanelHead icon={ScanText} title="JD X-ray" sub="Everything the engine detected, highlighted in the original text." />
            <JDXray text={jd.text} profile={profile} maxHeight={440} />
          </section>
        </div>
      </div>

      <section className="tl-src-cta">
        <div className="grow">
          <b>Search DNA locked in.</b>
          <span className="muted">
            {' '}
            We’ll rank your talent pool first, then build LinkedIn searches{targetReq ? ` for ${targetReq.title}` : ''}.
          </span>
        </div>
        {!targetReq && caps.hire && (
          <button type="button" className="btn" onClick={createReq}>
            <Briefcase aria-hidden="true" /> Create requisition from this JD
          </button>
        )}
        <button type="button" className="btn btn--primary btn--lg" onClick={() => studio.goTo(STEP.pool)}>
          <Users aria-hidden="true" /> Find talent <ArrowRight aria-hidden="true" />
        </button>
      </section>
    </div>
  );
}

function DnaHero({ profile, targetReq, fileName }: { profile: JobProfile; targetReq: Requisition | null; fileName?: string }) {
  const caps = useTalentCaps();
  const workModel = targetReq?.workModel ?? profile.workModel;
  const facts: { label: string; value: ReactNode }[] = [
    { label: 'Seniority', value: SENIORITY_LABEL[profile.seniority] },
    { label: 'Experience', value: profile.yearsMin != null ? `${profile.yearsMin}+ yrs` : 'Not stated' },
    { label: 'Location', value: targetReq?.location ?? profile.location ?? 'Anywhere' },
    { label: 'Work model', value: workModel ? WORK_MODEL_LABEL[workModel] : 'Not stated' },
    { label: 'Type', value: EMPLOYMENT_LABEL[profile.employmentType] },
    {
      label: 'Salary',
      value: profile.salary ? (
        caps.comp ? (
          `${formatRange(profile.salary.min, profile.salary.max, profile.salary.currency)} / ${profile.salary.period === 'month' ? 'mo' : 'yr'}`
        ) : (
          <Comp amount={profile.salary.min} currency={profile.salary.currency} />
        )
      ) : (
        'Not stated'
      ),
    },
  ];
  return (
    <section className="tl-src-dna hud">
      <div className="tl-src-dna__main">
        <div className="tl-src-dna__kicker">
          <span className="eyebrow">Decoded search DNA</span>
          {fileName && (
            <span className="tl-src-dna__file">
              <FileText aria-hidden="true" /> {fileName}
            </span>
          )}
        </div>
        <h3 className="tl-src-dna__title">{profile.title}</h3>
        {profile.summary && <p className="tl-src-dna__summary clamp-2">{profile.summary}</p>}
        <dl className="tl-src-facts">
          {facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <SkillSignature skills={profile.skills} />
    </section>
  );
}

/** A "barcode" of the role: one bar per skill, height = weight, amber = must, blue = nice. */
function SkillSignature({ skills }: { skills: SkillRequirement[] }) {
  const sorted = useMemo(() => [...skills].sort((a, b) => Number(b.must) - Number(a.must) || b.weight - a.weight), [skills]);
  const must = sorted.filter((s) => s.must).length;
  const nice = sorted.length - must;
  return (
    <figure className="tl-src-sig" aria-label={`Skill signature: ${must} must-have and ${nice} nice-to-have skills`}>
      <figcaption className="tl-src-sig__cap">
        <span className="stat-label">Skill signature</span>
        <span className="tl-src-sig__legend">
          <i className="is-must" /> {must} must <i className="is-nice" /> {nice} nice
        </span>
      </figcaption>
      <div className="tl-src-sig__bars" aria-hidden="true">
        {sorted.length ? (
          sorted.map((s, i) => (
            <span
              key={s.skill}
              className={cx('tl-src-sig__bar', s.must ? 'is-must' : 'is-nice')}
              style={{ '--w': s.weight, '--i': i } as CSSProperties}
              title={`${s.skill} · ${s.must ? 'must-have' : 'nice-to-have'} · weight ${s.weight}/3`}
            >
              <i />
            </span>
          ))
        ) : (
          <span className="faint text-sm">No skills detected yet. Add some below.</span>
        )}
      </div>
      <div className="tl-src-sig__labels">
        {sorted.slice(0, 8).map((s) => (
          <span key={s.skill} className={cx('tl-src-sig__label', s.must ? 'is-must' : 'is-nice')}>
            {s.skill}
          </span>
        ))}
        {sorted.length > 8 && <span className="tl-src-sig__label is-more">+{sorted.length - 8}</span>}
      </div>
    </figure>
  );
}
