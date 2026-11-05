/**
 * Import a candidate from LinkedIn — without scraping (modal kind `import`).
 *   1 Source  — a LinkedIn profile URL (name guessed from the vanity), the
 *               profile's own "More → Save to PDF" export, pasted profile text,
 *               or a blank manual profile.
 *   2 Review  — edit every field, skills with taxonomy suggestions, previews of
 *               experience / education, source and (optional) consent, plus a
 *               duplicate check against the talent pool.
 *   3 Place   — optionally add them to a requisition, with a live match preview.
 * Nothing is saved until the last step; then the new profile opens.
 */
import { useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CircleCheck,
  ClipboardPaste,
  FileText,
  FileUp,
  GraduationCap,
  Link2,
  Linkedin,
  LoaderCircle,
  PenLine,
  Plus,
  ShieldCheck,
  TriangleAlert,
  UserPlus,
  UserRound,
  X,
} from 'lucide-react';
import type { CandidateSource, Consent, Education, Experience } from '@/talent/types';
import { useTalentUI, type TalentModal } from '@/talent/ui';
import { SOURCE_META, STAGE_BY_ID } from '@/talent/constants';
import { ACCEPTED_DOC_TYPES, extractDocumentText, matchTier, scoreMatch } from '@/talent/ai/engine';
import { MAX_DOC_BYTES } from '@/talent/ai/docs';
import { suggestSkills } from '@/talent/ai/taxonomy';
import { parseLinkedInUrl, parseProfileText, type ProfileDraft } from '@/talent/linkedin/importProfile';
import { useTalent } from '@/talent/store';
import { useTalentCaps, useTalentScope } from '@/talent/selectors';
import { toast } from '@/store/toast';
import { Modal } from '@/components/ui/Modal';
import { cx } from '@/lib/cx';
import { CandidateAvatar, MatchRing, SkillChips, Stepper, type StepDef } from '../components/shared';

type Origin = 'url' | 'pdf' | 'paste' | 'manual';
type ConsentMethod = NonNullable<Consent['method']>;

interface Form {
  name: string;
  headline: string;
  currentTitle: string;
  currentCompany: string;
  location: string;
  email: string;
  linkedinUrl: string;
  years: string;
  skills: string[];
  experience: Experience[];
  education: Education[];
  source: CandidateSource;
  consent: '' | ConsentMethod;
  origin: Origin;
  fileName?: string;
}

const EMPTY: Form = {
  name: '',
  headline: '',
  currentTitle: '',
  currentCompany: '',
  location: '',
  email: '',
  linkedinUrl: '',
  years: '',
  skills: [],
  experience: [],
  education: [],
  source: 'linkedin',
  consent: '',
  origin: 'manual',
};

const STEPS: StepDef[] = [
  { id: 'source', label: 'Source', icon: Linkedin, hint: 'URL, PDF, pasted text or manual' },
  { id: 'review', label: 'Review & edit', icon: PenLine, hint: 'Check every field before saving' },
  { id: 'place', label: 'Add to a requisition', icon: Briefcase, hint: 'Optional, with a live match preview' },
];

const TABS: { id: Origin; label: string; hint: string; icon: typeof Link2 }[] = [
  { id: 'url', label: 'LinkedIn URL', hint: 'Name + profile link', icon: Link2 },
  { id: 'pdf', label: 'LinkedIn PDF', hint: '“Save to PDF” export', icon: FileUp },
  { id: 'paste', label: 'Paste profile', hint: 'Copied profile text', icon: ClipboardPaste },
  { id: 'manual', label: 'Manual', hint: 'Blank profile', icon: UserRound },
];

const CONSENT_LABEL: Record<ConsentMethod, string> = {
  email: 'By email',
  linkedin: 'LinkedIn message',
  application: 'Applied (application form)',
  verbal: 'Verbally (call / event)',
};

const ORIGIN_DETAIL: Record<Origin, string> = {
  url: 'LinkedIn · URL import',
  pdf: 'LinkedIn · PDF import',
  paste: 'LinkedIn · pasted profile',
  manual: 'Added manually',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtYm = (ym: string | null) => {
  if (!ym) return 'present';
  const [y, m] = ym.split('-');
  return m ? `${MONTHS[Number(m) - 1] ?? ''} ${y}`.trim() : y;
};
const hueOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const first = (name: string) => name.trim().split(/\s+/)[0] || 'them';
const normUrl = (u: string) => u.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');

/** Drop parser noise from skills (the name, location or headline leaking into "Top Skills"). */
function cleanSkills(d: ProfileDraft): string[] {
  const noise = new Set([d.name, d.location, d.headline, d.currentTitle, d.currentCompany].filter(Boolean).map((x) => x!.toLowerCase()));
  return d.skills.filter((s) => !noise.has(s.toLowerCase()) && s.split(/\s+/).length <= 4 && !/[,|·•@]/.test(s));
}

function fromDraft(d: ProfileDraft, origin: Origin, extra: Partial<Form> = {}): Form {
  return {
    ...EMPTY,
    name: d.name ?? '',
    headline: d.headline ?? '',
    currentTitle: d.currentTitle ?? '',
    currentCompany: d.currentCompany ?? '',
    location: d.location ?? '',
    email: d.email ?? '',
    linkedinUrl: d.linkedinUrl ?? '',
    years: d.yearsExperience != null ? String(d.yearsExperience) : '',
    skills: cleanSkills(d),
    experience: d.experience,
    education: d.education,
    origin,
    ...extra,
  };
}

export function ImportModal({ modal, open, onClose }: { modal: Extract<TalentModal, { kind: 'import' }>; open: boolean; onClose: () => void }) {
  const caps = useTalentCaps();
  const canAdd = caps.manage || caps.source;
  const { requisitions } = useTalentScope();
  const candidates = useTalent((s) => s.candidates);

  const [phase, setPhase] = useState(0);
  const [tab, setTab] = useState<Origin>('url');
  const [url, setUrl] = useState('');
  const [paste, setPaste] = useState('');
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string>();
  const [drag, setDrag] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [tried, setTried] = useState(false);
  const openReqs = useMemo(() => requisitions.filter((r) => r.status === 'open'), [requisitions]);
  const [reqId, setReqId] = useState<string>(() => (modal.requisitionId && requisitions.some((r) => r.id === modal.requisitionId && r.status === 'open') ? modal.requisitionId : ''));
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => (url.trim() ? parseLinkedInUrl(url) : null), [url]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  // ── validation + duplicate detection
  const nameOk = form.name.trim().split(/\s+/).filter(Boolean).length >= 2;
  const titleOk = form.currentTitle.trim().length > 1;
  const valid = nameOk && titleOk;
  const dupe = useMemo(() => {
    const n = form.name.trim().toLowerCase();
    const li = form.linkedinUrl.trim() ? normUrl(form.linkedinUrl) : '';
    if (!n && !li) return undefined;
    return candidates.find((c) => (n && c.name.toLowerCase() === n) || (li && c.linkedinUrl && normUrl(c.linkedinUrl) === li));
  }, [candidates, form.name, form.linkedinUrl]);

  const req = openReqs.find((r) => r.id === reqId) ?? null;
  const avatarHue = useMemo(() => hueOf(form.name || 'x'), [form.name]);
  const matchable = useMemo(
    () => ({
      skills: form.skills,
      yearsExperience: Number(form.years) || 0,
      location: form.location,
      currentTitle: form.currentTitle,
      headline: form.headline,
      source: form.source,
    }),
    [form.skills, form.years, form.location, form.currentTitle, form.headline, form.source],
  );
  const match = useMemo(() => (req?.jd.profile ? scoreMatch(req.jd.profile, matchable, { location: req.location, workModel: req.workModel }) : null), [req, matchable]);

  // ── source → review
  const toReview = (next: Form) => {
    setForm(next);
    setTried(false);
    setPhase(1);
  };
  const fromUrl = () => {
    if (!parsed?.ok) return;
    toReview({ ...EMPTY, name: parsed.nameGuess, linkedinUrl: parsed.url, origin: 'url' });
  };
  const fromPaste = () => {
    const d = parseProfileText(paste);
    toReview(fromDraft(d, 'paste'));
  };
  const loadPdf = async (file: File) => {
    if (file.size > MAX_DOC_BYTES) return setReadError('That file is over 10 MB.');
    setReading(true);
    setReadError(undefined);
    try {
      const out = await extractDocumentText(file);
      const d = parseProfileText(out.text);
      if (!d.name && !d.headline && !d.experience.length) throw new Error('We couldn’t recognise a LinkedIn profile in that file. Try pasting the profile text instead.');
      toReview(fromDraft(d, 'pdf', { fileName: out.fileName }));
    } catch (e) {
      setReadError(e instanceof Error ? e.message : 'Could not read that file.');
    } finally {
      setReading(false);
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void loadPdf(f);
  };

  const openExisting = (id: string) => {
    onClose();
    useTalentUI.getState().openCandidate(id);
  };

  // ── save
  const submit = () => {
    if (!valid || !canAdd) return;
    const t = useTalent.getState();
    const title = form.currentTitle.trim();
    const company = form.currentCompany.trim();
    const res = t.addCandidate({
      name: form.name.trim(),
      headline: form.headline.trim() || `${title}${company ? ` at ${company}` : ''}`,
      currentTitle: title,
      currentCompany: company,
      location: form.location.trim(),
      yearsExperience: Number(form.years) || 0,
      skills: form.skills,
      source: form.source,
      sourceDetail: form.source === 'linkedin' ? ORIGIN_DETAIL[form.origin] : undefined,
      email: form.email.trim() || undefined,
      linkedinUrl: form.linkedinUrl.trim() || undefined,
      experience: form.experience,
      education: form.education,
      avatarHue,
      consentMethod: form.consent || undefined,
    });
    if (!res.ok || !res.id) {
      toast.result(res);
      return;
    }
    const id = res.id;
    if (req) {
      const added = t.addToPipeline(id, req.id, { match });
      if (added.ok) toast.success(`${form.name.trim()} imported`, `Added to ${req.title}.`);
      else toast.result(added);
    } else toast.result(res);
    onClose();
    useTalentUI.getState().openCandidate(id);
  };

  // ── footer per phase
  let footer: ReactNode;
  if (phase === 0) {
    const cta =
      tab === 'url'
        ? { label: 'Continue', onClick: fromUrl, disabled: !parsed?.ok }
        : tab === 'paste'
          ? { label: 'Parse profile', onClick: fromPaste, disabled: paste.trim().length < 40 }
          : tab === 'manual'
            ? { label: 'Start blank', onClick: () => toReview({ ...EMPTY, origin: 'manual' }), disabled: false }
            : null;
    footer = (
      <>
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Cancel
        </button>
        {cta && (
          <button type="button" className="btn btn--primary" onClick={cta.onClick} disabled={cta.disabled}>
            {cta.label} <ArrowRight aria-hidden="true" />
          </button>
        )}
      </>
    );
  } else if (phase === 1) {
    footer = (
      <>
        <button type="button" className="btn btn--ghost" onClick={() => setPhase(0)}>
          <ArrowLeft aria-hidden="true" /> Back
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            setTried(true);
            if (valid) setPhase(2);
          }}
        >
          Continue <ArrowRight aria-hidden="true" />
        </button>
      </>
    );
  } else {
    footer = (
      <>
        <button type="button" className="btn btn--ghost" onClick={() => setPhase(1)}>
          <ArrowLeft aria-hidden="true" /> Back
        </button>
        <button type="button" className="btn btn--primary" onClick={submit} disabled={!valid || !canAdd}>
          <UserPlus aria-hidden="true" /> {req ? `Import & add to ${req.title}` : 'Import to talent pool'}
        </button>
      </>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={760}
      className="tl-imp"
      icon={
        <span className="tl-imp__icon" aria-hidden="true">
          <Linkedin />
        </span>
      }
      title="Import a candidate"
      subtitle="From a LinkedIn URL, the profile’s PDF export or pasted text. Reviewed by you before anything is saved."
      footer={footer}
    >
      <div className="tl-imp__body">
        <Stepper steps={STEPS} current={phase} maxReached={phase} onStep={(i) => i < phase && setPhase(i)} />

        {!canAdd && (
          <div className="tl-src-notice" role="note">
            <TriangleAlert aria-hidden="true" />
            <span>Importing candidates needs recruiting or sourcing access. You can still preview the import.</span>
          </div>
        )}

        {phase === 0 && (
          <>
            <div className="tl-imp-tabs" role="tablist" aria-label="Import source">
              {TABS.map((t) => {
                const Icon = t.icon;
                return (
                  <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={cx('tl-imp-tab', tab === t.id && 'is-active')} onClick={() => setTab(t.id)}>
                    <Icon aria-hidden="true" />
                    <span className="tl-imp-tab__label">{t.label}</span>
                    <span className="tl-imp-tab__hint">{t.hint}</span>
                  </button>
                );
              })}
            </div>

            <div className="tl-imp-pane" role="tabpanel">
              {tab === 'url' && (
                <>
                  <label className="field">
                    <span className="field-label">LinkedIn profile URL</span>
                    <div className="input-wrap">
                      <Link2 aria-hidden="true" />
                      <input
                        className="input"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && parsed?.ok && fromUrl()}
                        placeholder="https://www.linkedin.com/in/jane-doe"
                        inputMode="url"
                        data-autofocus
                      />
                    </div>
                  </label>
                  {parsed &&
                    (parsed.ok ? (
                      <div className="tl-imp-parsed">
                        <CandidateAvatar person={{ name: parsed.nameGuess || '?', avatarHue: hueOf(parsed.vanity) }} size={40} />
                        <div className="grow">
                          <div className="tl-imp-parsed__name">{parsed.nameGuess || 'No name in this URL. You can add it next.'}</div>
                          <code className="tl-imp-parsed__url">{parsed.url}</code>
                        </div>
                        <CircleCheck aria-hidden="true" className="tl-imp-parsed__ok" />
                      </div>
                    ) : (
                      <div className="tl-imp-error" role="alert">
                        <TriangleAlert aria-hidden="true" /> {parsed.error}
                      </div>
                    ))}
                  <div className="tl-imp-note">
                    <ShieldCheck aria-hidden="true" />
                    <span>
                      <b>We never scrape LinkedIn.</b> NEXUS only reads the URL to guess the name and link the profile. Fill in the title, company and skills from their profile on the next step, or use the PDF option for a complete import.
                    </span>
                  </div>
                </>
              )}

              {tab === 'pdf' && (
                <>
                  <ol className="tl-imp-howto">
                    <li>
                      <b>Open their LinkedIn profile</b>
                      <span>Any profile you can see</span>
                    </li>
                    <li>
                      <b>More → Save to PDF</b>
                      <span>LinkedIn’s own export</span>
                    </li>
                    <li>
                      <b>Drop the PDF here</b>
                      <span>Parsed in your browser</span>
                    </li>
                  </ol>
                  <div
                    className={cx('tl-imp-drop', drag && 'is-drag', reading && 'is-busy')}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDrag(true);
                    }}
                    onDragLeave={() => setDrag(false)}
                    onDrop={onDrop}
                  >
                    <span className="tl-imp-drop__icon" aria-hidden="true">
                      {reading ? <LoaderCircle className="spin" /> : <FileUp />}
                    </span>
                    <div className="grow">
                      <div className="tl-imp-drop__title">{reading ? 'Reading the profile…' : 'Drop a LinkedIn profile PDF'}</div>
                      <div className="faint text-xs">PDF, DOCX or TXT · up to 10 MB · nothing is uploaded</div>
                    </div>
                    <button type="button" className="btn btn--sm" onClick={() => fileRef.current?.click()} disabled={reading}>
                      <FileText aria-hidden="true" /> Browse
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept={ACCEPTED_DOC_TYPES}
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void loadPdf(f);
                        e.target.value = '';
                      }}
                    />
                  </div>
                  {readError && (
                    <div className="tl-imp-error" role="alert">
                      <TriangleAlert aria-hidden="true" /> {readError}
                    </div>
                  )}
                </>
              )}

              {tab === 'paste' && (
                <label className="field">
                  <span className="field-label">Profile text</span>
                  <textarea
                    className="textarea tl-imp-paste"
                    rows={9}
                    value={paste}
                    onChange={(e) => setPaste(e.target.value)}
                    placeholder="On their LinkedIn profile, select everything (Ctrl/⌘ + A), copy and paste it here. We pick out the name, headline, roles, education and skills."
                    data-autofocus
                  />
                  <span className="field-hint">{paste.trim() ? `${paste.trim().split(/\s+/).length.toLocaleString()} words` : 'Nothing is saved until you review it.'}</span>
                </label>
              )}

              {tab === 'manual' && (
                <div className="tl-imp-manual">
                  <span className="tl-imp-manual__icon" aria-hidden="true">
                    <UserRound />
                  </span>
                  <div>
                    <b>Start from a blank profile</b>
                    <p>For referrals, event contacts or agency CVs. You’ll add the name, role and skills on the next step.</p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {phase === 1 && (
          <div className="tl-imp-review">
            <div className="tl-imp-origin">
              {(() => {
                const Icon = TABS.find((t) => t.id === form.origin)?.icon ?? UserRound;
                return <Icon aria-hidden="true" />;
              })()}
              <span>
                {form.origin === 'manual' ? 'Blank profile' : `Imported from ${TABS.find((t) => t.id === form.origin)?.label}`}
                {form.fileName ? ` · ${form.fileName}` : ''}
                {form.origin !== 'manual' && form.origin !== 'url'
                  ? ` · ${form.experience.length} role${form.experience.length === 1 ? '' : 's'} · ${form.education.length} school${form.education.length === 1 ? '' : 's'} · ${form.skills.length} skills`
                  : ''}
              </span>
            </div>

            {dupe && (
              <div className="tl-imp-dupe" role="alert">
                <TriangleAlert aria-hidden="true" />
                <span className="grow">
                  <b>{dupe.name}</b> is already in your talent pool ({dupe.currentTitle}
                  {dupe.currentCompany ? ` at ${dupe.currentCompany}` : ''}).
                </span>
                <button type="button" className="btn btn--sm" onClick={() => openExisting(dupe.id)}>
                  Open existing
                </button>
              </div>
            )}

            <div className="tl-imp-form">
              <Field label="Full name" required error={tried && !nameOk ? 'Add their first and last name.' : undefined}>
                <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" data-autofocus />
              </Field>
              <Field label="Current title" required error={tried && !titleOk ? 'Add their current title.' : undefined}>
                <input className="input" value={form.currentTitle} onChange={(e) => set('currentTitle', e.target.value)} autoComplete="off" />
              </Field>
              <Field label="Company">
                <input className="input" value={form.currentCompany} onChange={(e) => set('currentCompany', e.target.value)} autoComplete="off" />
              </Field>
              <Field label="Location">
                <input className="input" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Dubai, UAE" autoComplete="off" />
              </Field>
              <Field label="Headline" wide>
                <input className="input" value={form.headline} onChange={(e) => set('headline', e.target.value)} placeholder="Defaults to “Title at Company”" autoComplete="off" />
              </Field>
              <Field label="Email">
                <input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="off" />
              </Field>
              <Field label="Years of experience">
                <input className="input" type="number" min={0} max={50} value={form.years} onChange={(e) => set('years', e.target.value)} />
              </Field>
              <Field label="LinkedIn URL" wide>
                <input className="input" value={form.linkedinUrl} onChange={(e) => set('linkedinUrl', e.target.value)} placeholder="https://www.linkedin.com/in/…" autoComplete="off" />
              </Field>
            </div>

            <SkillsField skills={form.skills} onChange={(skills) => set('skills', skills)} />

            {(form.experience.length > 0 || form.education.length > 0) && (
              <div className="tl-imp-previews">
                {form.experience.length > 0 && (
                  <section className="tl-imp-preview">
                    <h4>
                      <Briefcase aria-hidden="true" /> Experience
                    </h4>
                    <ul>
                      {form.experience.slice(0, 4).map((e, i) => (
                        <li key={`${e.title}-${i}`}>
                          <b>{e.title}</b>
                          {e.company && <span> · {e.company}</span>}
                          <span className="tl-imp-preview__when">
                            {fmtYm(e.start)} – {fmtYm(e.end)}
                          </span>
                        </li>
                      ))}
                      {form.experience.length > 4 && <li className="faint">+{form.experience.length - 4} more</li>}
                    </ul>
                  </section>
                )}
                {form.education.length > 0 && (
                  <section className="tl-imp-preview">
                    <h4>
                      <GraduationCap aria-hidden="true" /> Education
                    </h4>
                    <ul>
                      {form.education.map((e, i) => (
                        <li key={`${e.school}-${i}`}>
                          <b>{e.school}</b>
                          <span> · {e.degree}</span>
                          {e.year && <span className="tl-imp-preview__when">{e.year}</span>}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}

            <div className="tl-imp-form tl-imp-form--meta">
              <Field label="Source">
                <select className="select" value={form.source} onChange={(e) => set('source', e.target.value as CandidateSource)}>
                  {(Object.keys(SOURCE_META) as CandidateSource[]).map((s) => (
                    <option key={s} value={s}>
                      {SOURCE_META[s].label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Consent to process their data" hint="Only record consent the candidate actually gave. Retained for 18 months.">
                <select className="select" value={form.consent} onChange={(e) => set('consent', e.target.value as Form['consent'])}>
                  <option value="">Not yet (ask during outreach)</option>
                  {(Object.keys(CONSENT_LABEL) as ConsentMethod[]).map((m) => (
                    <option key={m} value={m}>
                      {CONSENT_LABEL[m]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        )}

        {phase === 2 && (
          <div className="tl-imp-place">
            <label className="field">
              <span className="field-label">Add to a requisition (optional)</span>
              <select className="select" value={reqId} onChange={(e) => setReqId(e.target.value)}>
                <option value="">Talent pool only</option>
                {openReqs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title} · {r.location}
                  </option>
                ))}
              </select>
            </label>

            <section className="tl-imp-summary">
              <CandidateAvatar person={{ name: form.name || '?', avatarHue }} size={52} />
              <div className="tl-imp-summary__who">
                <div className="tl-imp-summary__name">{form.name.trim()}</div>
                <div className="tl-imp-summary__role">
                  {form.currentTitle}
                  {form.currentCompany ? ` @ ${form.currentCompany}` : ''}
                  {form.location ? ` · ${form.location}` : ''}
                </div>
                {form.skills.length > 0 && <SkillChips skills={form.skills} matched={match?.matched} max={8} />}
              </div>
              {match ? (
                <div className="tl-imp-summary__match">
                  <MatchRing score={match.score} size={66} stroke={6} />
                  <span>{matchTier(match.score).label}</span>
                </div>
              ) : (
                req && <span className="tl-imp-summary__nomatch">No decoded JD on this requisition yet, so there’s no match preview.</span>
              )}
            </section>

            {match && (
              <ul className="tl-src-reasons tl-imp-reasons">
                {match.reasons.slice(0, 4).map((r) => (
                  <li key={r} className={r.startsWith('Gap') ? 'is-gap' : undefined}>
                    {r}
                  </li>
                ))}
              </ul>
            )}

            <ul className="tl-imp-plan" aria-label="What happens when you import">
              <li>
                <CircleCheck aria-hidden="true" />
                <span>
                  Adds {first(form.name)} to the talent pool · source: {SOURCE_META[form.source].label}
                  {form.consent ? ` · consent: ${CONSENT_LABEL[form.consent].toLowerCase()}` : ' · no consent recorded yet'}
                </span>
              </li>
              {req && (
                <li>
                  <CircleCheck aria-hidden="true" />
                  <span>
                    Adds them to the {req.title} pipeline at <b>{STAGE_BY_ID[form.source === 'linkedin' ? 'sourced' : 'applied'].label}</b>
                  </span>
                </li>
              )}
              <li>
                <CircleCheck aria-hidden="true" />
                <span>Opens their profile so you can reach out</span>
              </li>
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Field({ label, required, error, hint, wide, children }: { label: string; required?: boolean; error?: string; hint?: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={cx('field', 'tl-imp-field', wide && 'is-wide', error && 'is-invalid')}>
      <span className="field-label">
        {label}
        {required && <span className="tl-imp-req"> *</span>}
      </span>
      {children}
      {error ? <span className="tl-imp-field__error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

/** Plain skill chips with taxonomy suggestions (Enter adds, Backspace removes the last). */
function SkillsField({ skills, onChange }: { skills: string[]; onChange: (skills: string[]) => void }) {
  const [q, setQ] = useState('');
  const suggestions = useMemo(() => (q.trim() ? suggestSkills(q, skills, 6) : []), [q, skills]);
  const add = (raw: string) => {
    const clean = raw.trim();
    if (!clean || skills.some((s) => s.toLowerCase() === clean.toLowerCase())) return setQ('');
    onChange([...skills, clean]);
    setQ('');
  };
  return (
    <div className="field">
      <span className="field-label">
        Skills <span className="tl-imp-count">{skills.length}</span>
      </span>
      <div className="tl-imp-skills">
        {skills.map((s) => (
          <span key={s} className="tl-imp-skill">
            {s}
            <button type="button" aria-label={`Remove ${s}`} onClick={() => onChange(skills.filter((x) => x !== s))}>
              <X />
            </button>
          </span>
        ))}
        <input
          className="tl-imp-skills__input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(suggestions[0] ?? q);
            } else if (e.key === 'Backspace' && !q && skills.length) onChange(skills.slice(0, -1));
          }}
          placeholder={skills.length ? 'Add a skill…' : 'Add skills (e.g. React, Kubernetes, IFRS)…'}
          aria-label="Add a skill"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="tl-imp-suggest">
          {suggestions.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => add(s)}>
              <Plus aria-hidden="true" /> {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
