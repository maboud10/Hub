/**
 * Job-description intelligence building blocks shared by the AI Sourcing
 * studio and the requisition wizard:
 *   useJDAnalysis  – upload/paste → extract → decode (Gemini or offline)
 *   JDInput        – dropzone + paste + sample JDs + "Decode" button
 *   JDXray         – the JD with every detected signal highlighted
 *   JDHealth       – JD health score + inclusive-language / clarity flags
 *   SkillEditor    – edit must-have / nice-to-have skills and weights
 *   SearchDNA      – the decoded profile facts (title, level, location…)
 */
import { useCallback, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { AlertTriangle, BrainCircuit, FileText, FileUp, Info, Loader2, Plus, ScanText, Sparkles, X } from 'lucide-react';
import type { JDFlag, JDQuality, JobProfile, Seniority, SkillRequirement, WorkModel } from '@/talent/types';
import { SENIORITY_LABEL, WORK_MODEL_LABEL } from '@/talent/constants';
import { ACCEPTED_DOC_TYPES, aiStatus, analyzeJD, extractDocumentText, highlightJD } from '@/talent/ai/engine';
import { MAX_DOC_BYTES } from '@/talent/ai/docs';
import { suggestSkills } from '@/talent/ai/taxonomy';
import { SAMPLE_JDS } from '@/talent/seed';
import { cx } from '@/lib/cx';
import { EngineBadge } from './shared';

// ───────────────────────── analysis hook ─────────────────────────
export type JDStatus = 'idle' | 'reading' | 'analyzing' | 'ready' | 'error';

export interface JDAnalysis {
  text: string;
  fileName?: string;
  profile: JobProfile | null;
  status: JDStatus;
  error?: string;
  /** Gemini was attempted but failed; the offline engine answered instead. */
  fallbackReason?: string;
  doc?: { kind: 'pdf' | 'docx' | 'text'; pages?: number; bytes: number };
  setText(text: string): void;
  loadFile(file: File): Promise<void>;
  analyze(text?: string, fileName?: string): Promise<JobProfile | null>;
  setProfile(profile: JobProfile): void;
  reset(): void;
}

const MIN_SCAN_MS = 650;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useJDAnalysis(initial?: { text?: string; fileName?: string; profile?: JobProfile | null }): JDAnalysis {
  const [text, setTextState] = useState(initial?.text ?? '');
  const [fileName, setFileName] = useState<string | undefined>(initial?.fileName);
  const [profile, setProfileState] = useState<JobProfile | null>(initial?.profile ?? null);
  const [status, setStatus] = useState<JDStatus>(initial?.profile ? 'ready' : 'idle');
  const [error, setError] = useState<string>();
  const [fallbackReason, setFallbackReason] = useState<string>();
  const [doc, setDoc] = useState<JDAnalysis['doc']>();
  const run = useRef(0);

  const analyze = useCallback(
    async (t?: string, f?: string) => {
      const body = (t ?? text).trim();
      if (body.length < 40) {
        setError('Add a little more of the job description (at least a few sentences).');
        setStatus('error');
        return null;
      }
      const id = ++run.current;
      setStatus('analyzing');
      setError(undefined);
      const started = Date.now();
      const res = await analyzeJD(body, { fileName: f ?? fileName });
      const wait = MIN_SCAN_MS - (Date.now() - started);
      if (wait > 0) await sleep(wait);
      if (id !== run.current) return null;
      setProfileState(res.profile);
      setFallbackReason(res.fallbackReason);
      setStatus('ready');
      return res.profile;
    },
    [text, fileName],
  );

  const loadFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_DOC_BYTES) {
        setError('That file is over 10 MB. Try a smaller export or paste the text.');
        setStatus('error');
        return;
      }
      const id = ++run.current;
      setStatus('reading');
      setError(undefined);
      try {
        const out = await extractDocumentText(file);
        if (id !== run.current) return;
        if (out.text.trim().length < 40) throw new Error('We couldn’t find readable text in that file. If it’s a scanned PDF, paste the text instead.');
        setTextState(out.text);
        setFileName(out.fileName);
        setDoc({ kind: out.kind, pages: out.pages, bytes: out.bytes });
        await analyze(out.text, out.fileName);
      } catch (e) {
        if (id !== run.current) return;
        setError(e instanceof Error ? e.message : 'Could not read that file.');
        setStatus('error');
      }
    },
    [analyze],
  );

  const setText = useCallback((t: string) => {
    setTextState(t);
    setStatus((s) => (s === 'error' ? 'idle' : s));
  }, []);

  const setProfile = useCallback((p: JobProfile) => setProfileState(p), []);

  const reset = useCallback(() => {
    run.current += 1;
    setTextState('');
    setFileName(undefined);
    setProfileState(null);
    setStatus('idle');
    setError(undefined);
    setFallbackReason(undefined);
    setDoc(undefined);
  }, []);

  return { text, fileName, profile, status, error, fallbackReason, doc, setText, loadFile, analyze, setProfile, reset };
}

// ───────────────────────── input ─────────────────────────
/** Upload / paste / sample picker with a single "Decode" call to action. */
export function JDInput({ jd, cta = 'Decode with AI', compact = false }: { jd: JDAnalysis; cta?: string; compact?: boolean }) {
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const ai = aiStatus();
  const busy = jd.status === 'reading' || jd.status === 'analyzing';
  const words = jd.text.trim() ? jd.text.trim().split(/\s+/).length : 0;

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void jd.loadFile(f);
  };

  return (
    <div className={cx('jd-input', compact && 'jd-input--compact')}>
      <div
        className={cx('jd-drop', drag && 'is-drag', busy && 'is-busy')}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        <span className="jd-drop__icon" aria-hidden="true">
          {jd.status === 'reading' ? <Loader2 className="spin" /> : <FileUp />}
        </span>
        <div className="grow">
          <div className="jd-drop__title">{jd.status === 'reading' ? 'Reading document…' : 'Drop a job description'}</div>
          <div className="jd-drop__hint">PDF, Word (.docx), TXT or Markdown · up to 10 MB · parsed in your browser</div>
        </div>
        <button type="button" className="btn btn--sm" onClick={() => fileRef.current?.click()} disabled={busy}>
          <FileText /> Browse
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_DOC_TYPES}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void jd.loadFile(f);
            e.target.value = '';
          }}
        />
      </div>

      <div className="jd-or">
        <span>or paste it</span>
      </div>

      <textarea
        className="textarea jd-text"
        value={jd.text}
        onChange={(e) => jd.setText(e.target.value)}
        placeholder="Paste the full job description: responsibilities, requirements, location, salary…"
        rows={compact ? 7 : 10}
        aria-label="Job description text"
      />

      <div className="jd-samples">
        <span className="faint text-xs">Try a sample:</span>
        {SAMPLE_JDS.map((s) => (
          <button
            key={s.id}
            type="button"
            className="chip jd-sample"
            disabled={busy}
            onClick={() => {
              jd.setText(s.text);
              void jd.analyze(s.text, s.fileName);
            }}
          >
            <FileText aria-hidden="true" />
            {s.label}
          </button>
        ))}
      </div>

      {jd.error && (
        <div className="jd-error" role="alert">
          <AlertTriangle aria-hidden="true" /> {jd.error}
        </div>
      )}

      <div className="jd-input__foot">
        <span className="faint text-xs">
          {jd.fileName ? (
            <>
              <FileText aria-hidden="true" className="inline-icon" /> {jd.fileName}
              {jd.doc?.pages ? ` · ${jd.doc.pages} page${jd.doc.pages === 1 ? '' : 's'}` : ''} ·{' '}
            </>
          ) : null}
          {words.toLocaleString()} words
        </span>
        <span className="spacer" />
        <EngineBadge engine={ai.engine} />
        <button type="button" className="btn btn--primary" disabled={busy || jd.text.trim().length < 40} onClick={() => void jd.analyze()}>
          {jd.status === 'analyzing' ? <Loader2 className="spin" /> : <BrainCircuit />}
          {jd.status === 'analyzing' ? 'Decoding…' : cta}
        </button>
      </div>
    </div>
  );
}

/** Animated "scanning" placeholder while the JD is being decoded. */
export function JDScanning({ label = 'Decoding the job description' }: { label?: string }) {
  return (
    <div className="jd-scanning" role="status" aria-live="polite">
      <span className="jd-scanning__beam" aria-hidden="true" />
      <ScanText aria-hidden="true" />
      <div>
        <div className="jd-scanning__title">{label}…</div>
        <div className="faint text-xs">Skills, seniority, location, salary signals and JD health</div>
      </div>
    </div>
  );
}

// ───────────────────────── X-ray ─────────────────────────
const XRAY_LEGEND: { kind: string; label: string }[] = [
  { kind: 'must', label: 'Must-have skill' },
  { kind: 'nice', label: 'Nice-to-have' },
  { kind: 'years', label: 'Experience' },
  { kind: 'location', label: 'Location' },
  { kind: 'work', label: 'Work model' },
  { kind: 'salary', label: 'Salary' },
  { kind: 'flag', label: 'Needs attention' },
];

/** The JD text with everything the engine detected highlighted. */
export function JDXray({ text, profile, maxHeight = 360 }: { text: string; profile: Pick<JobProfile, 'skills' | 'quality'>; maxHeight?: number }) {
  const segments = useMemo(() => highlightJD(text, profile), [text, profile]);
  return (
    <div className="jd-xray">
      <div className="jd-xray__legend" aria-hidden="true">
        {XRAY_LEGEND.map((l) => (
          <span key={l.kind} className={cx('xr-key', `xr--${l.kind}`)}>
            {l.label}
          </span>
        ))}
      </div>
      <div className="jd-xray__body" style={{ maxHeight } as CSSProperties} tabIndex={0} aria-label="Job description with detected signals highlighted">
        {segments.map((s, i) =>
          s.kind ? (
            <mark key={i} className={cx('xr', `xr--${s.kind}`)} title={s.label ?? s.kind}>
              {s.text}
            </mark>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </div>
    </div>
  );
}

// ───────────────────────── health ─────────────────────────
function healthTone(score: number) {
  return score >= 80 ? 'good' : score >= 60 ? 'ok' : 'poor';
}

/** JD health score with actionable flags (inclusive language, clarity, salary…). */
export function JDHealth({ quality, compact = false }: { quality: JDQuality; compact?: boolean }) {
  const tone = healthTone(quality.score);
  const warnings = quality.flags.filter((f) => f.severity === 'warning');
  const infos = quality.flags.filter((f) => f.severity === 'info');
  const flags: JDFlag[] = [...warnings, ...infos];
  return (
    <div className={cx('jd-health', `jd-health--${tone}`, compact && 'jd-health--compact')}>
      <div className="jd-health__head">
        <span className="jd-health__score" style={{ '--p': quality.score } as CSSProperties} aria-label={`JD health ${quality.score} of 100`}>
          <span>{quality.score}</span>
        </span>
        <div className="grow">
          <div className="jd-health__title">JD health</div>
          <div className="faint text-xs">
            {tone === 'good' ? 'Clear, inclusive and complete.' : tone === 'ok' ? 'Solid. A few tweaks will widen your pool.' : 'Fix these before posting to attract more applicants.'}
          </div>
        </div>
        {warnings.length > 0 && <span className="badge badge--warning">{warnings.length} to fix</span>}
      </div>
      {flags.length > 0 && (
        <ul className="jd-flags">
          {(compact ? flags.slice(0, 3) : flags).map((f, i) => (
            <li key={`${f.kind}-${i}`} className={cx('jd-flag', `jd-flag--${f.severity}`)}>
              {f.severity === 'warning' ? <AlertTriangle aria-hidden="true" /> : <Info aria-hidden="true" />}
              <div className="grow">
                <div>{f.message}</div>
                {f.suggestion && <div className="jd-flag__fix">Try: {f.suggestion}</div>}
              </div>
            </li>
          ))}
          {compact && flags.length > 3 && <li className="faint text-xs">+{flags.length - 3} more</li>}
        </ul>
      )}
    </div>
  );
}

// ───────────────────────── skills ─────────────────────────
/** Edit decoded skills: toggle must / nice, cycle weight, remove, add with suggestions. */
export function SkillEditor({ skills, onChange, readOnly = false }: { skills: SkillRequirement[]; onChange?: (skills: SkillRequirement[]) => void; readOnly?: boolean }) {
  const [q, setQ] = useState('');
  const suggestions = useMemo(() => (q.trim() ? suggestSkills(q, skills.map((s) => s.skill), 6) : []), [q, skills]);
  const must = skills.filter((s) => s.must);
  const nice = skills.filter((s) => !s.must);
  const update = (skill: string, fn: (s: SkillRequirement) => SkillRequirement | null) => {
    const next: SkillRequirement[] = [];
    for (const s of skills) {
      if (s.skill !== skill) next.push(s);
      else {
        const r = fn(s);
        if (r) next.push(r);
      }
    }
    onChange?.(next);
  };
  const add = (label: string, isMust = true) => {
    const clean = label.trim();
    if (!clean || skills.some((s) => s.skill.toLowerCase() === clean.toLowerCase())) return;
    onChange?.([...skills, { skill: clean, weight: 2, must: isMust }]);
    setQ('');
  };

  const chip = (s: SkillRequirement) => (
    <span key={s.skill} className={cx('skill-req', s.must ? 'skill-req--must' : 'skill-req--nice')}>
      <span className="skill-req__label">{s.skill}</span>
      <button
        type="button"
        className="skill-req__weight"
        disabled={readOnly}
        title={`Weight ${s.weight}/3 (${s.weight === 3 ? 'core' : s.weight === 2 ? 'important' : 'supporting'}). Click to change.`}
        aria-label={`${s.skill} weight ${s.weight} of 3`}
        onClick={() => update(s.skill, (x) => ({ ...x, weight: (x.weight === 3 ? 1 : x.weight + 1) as 1 | 2 | 3 }))}
      >
        {[1, 2, 3].map((n) => (
          <i key={n} className={n <= s.weight ? 'on' : ''} />
        ))}
      </button>
      {!readOnly && (
        <>
          <button type="button" className="skill-req__toggle" title={s.must ? 'Make nice-to-have' : 'Make must-have'} onClick={() => update(s.skill, (x) => ({ ...x, must: !x.must }))}>
            {s.must ? 'must' : 'nice'}
          </button>
          <button type="button" className="skill-req__remove" aria-label={`Remove ${s.skill}`} onClick={() => update(s.skill, () => null)}>
            <X />
          </button>
        </>
      )}
    </span>
  );

  return (
    <div className="skill-editor">
      <div className="skill-editor__group">
        <div className="skill-editor__label">
          Must-have <span className="count">{must.length}</span>
        </div>
        <div className="skill-editor__chips">{must.length ? must.map(chip) : <span className="faint text-sm">No must-have skills yet.</span>}</div>
      </div>
      <div className="skill-editor__group">
        <div className="skill-editor__label">
          Nice-to-have <span className="count">{nice.length}</span>
        </div>
        <div className="skill-editor__chips">{nice.length ? nice.map(chip) : <span className="faint text-sm">None.</span>}</div>
      </div>
      {!readOnly && (
        <div className="skill-editor__add">
          <div className="input-wrap">
            <Plus aria-hidden="true" />
            <input
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add(suggestions[0] ?? q);
                }
              }}
              placeholder="Add a skill (e.g. Kubernetes, Figma, IFRS)…"
              aria-label="Add a skill"
            />
          </div>
          {suggestions.length > 0 && (
            <div className="skill-editor__suggest">
              {suggestions.map((s) => (
                <button key={s} type="button" className="chip" onClick={() => add(s)}>
                  <Plus aria-hidden="true" /> {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── search DNA ─────────────────────────
const SENIORITIES = Object.keys(SENIORITY_LABEL) as Seniority[];
const WORK_MODELS = Object.keys(WORK_MODEL_LABEL) as WorkModel[];

/** The decoded profile as editable facts. Edits feed matching and LinkedIn searches. */
export function SearchDNA({ profile, onChange, readOnly = false }: { profile: JobProfile; onChange?: (p: JobProfile) => void; readOnly?: boolean }) {
  const set = <K extends keyof JobProfile>(k: K, v: JobProfile[K]) => onChange?.({ ...profile, [k]: v });
  const [alias, setAlias] = useState('');
  return (
    <div className="search-dna">
      <div className="search-dna__head">
        <Sparkles aria-hidden="true" />
        <span className="grow">Search DNA</span>
        <EngineBadge engine={profile.engine} />
      </div>
      <div className="search-dna__grid">
        <label className="field search-dna__title">
          <span className="field-label">Role title</span>
          <input className="input" value={profile.title} readOnly={readOnly} onChange={(e) => set('title', e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Seniority</span>
          <select className="select" value={profile.seniority} disabled={readOnly} onChange={(e) => set('seniority', e.target.value as Seniority)}>
            {SENIORITIES.map((s) => (
              <option key={s} value={s}>
                {SENIORITY_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Min. years</span>
          <input
            className="input"
            type="number"
            min={0}
            max={30}
            value={profile.yearsMin ?? ''}
            readOnly={readOnly}
            onChange={(e) => set('yearsMin', e.target.value === '' ? null : Math.max(0, Math.min(30, Number(e.target.value))))}
          />
        </label>
        <label className="field">
          <span className="field-label">Location</span>
          <input className="input" value={profile.location ?? ''} readOnly={readOnly} onChange={(e) => set('location', e.target.value || null)} placeholder="Anywhere" />
        </label>
        <label className="field">
          <span className="field-label">Work model</span>
          <select className="select" value={profile.workModel ?? ''} disabled={readOnly} onChange={(e) => set('workModel', (e.target.value || null) as WorkModel | null)}>
            <option value="">Not stated</option>
            {WORK_MODELS.map((w) => (
              <option key={w} value={w}>
                {WORK_MODEL_LABEL[w]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="search-dna__aliases">
        <span className="field-label">Also search as</span>
        <div className="row row--wrap" style={{ gap: 6 }}>
          {profile.titleAliases.map((a) => (
            <span key={a} className="tag search-dna__alias">
              {a}
              {!readOnly && (
                <button type="button" aria-label={`Remove ${a}`} onClick={() => set('titleAliases', profile.titleAliases.filter((x) => x !== a))}>
                  <X />
                </button>
              )}
            </span>
          ))}
          {!readOnly && (
            <input
              className="search-dna__alias-input"
              value={alias}
              placeholder="+ add title"
              aria-label="Add an alternative title"
              onChange={(e) => setAlias(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && alias.trim()) {
                  e.preventDefault();
                  set('titleAliases', [...new Set([...profile.titleAliases, alias.trim()])]);
                  setAlias('');
                }
              }}
            />
          )}
        </div>
      </div>
      {profile.keywords.length > 0 && (
        <div className="search-dna__aliases">
          <span className="field-label">Domain keywords</span>
          <div className="row row--wrap" style={{ gap: 6 }}>
            {profile.keywords.map((k) => (
              <span key={k} className="tag">
                {k}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
