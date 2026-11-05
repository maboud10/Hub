/**
 * Letters: pick a template (instant vs "within 1 working day"), fill a short
 * form and watch the letter build live on letterhead. Instant letters open in
 * the viewer straight away; reviewed ones are tracked in "Your letters" with
 * their status. `&new=<letterKind>` preselects a template.
 */
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Clock, Eye, FileText, Inbox, Lock, Send, TriangleAlert, Zap } from 'lucide-react';
import type { LetterKind } from '@/hr/types';
import { LETTER_BY_ID, LETTER_STATUS_META, LETTER_TYPES } from '@/hr/constants';
import { letterReference } from '@/hr/engine';
import { useHr } from '@/hr/store';
import { todayISO } from '@/hr/calendar';
import { useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { formatDate, relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { EmptyState, Segmented, Switch } from '@/components/ui/primitives';
import { HrPanel, ToneBadge } from '../components/shared';
import { celebrate, useMyComp } from '../benefits/model';
import { LetterSheet, type LetterLike } from './sheets';

interface LetterForm {
  addressedTo: string;
  addresseeTouched: boolean;
  purpose: string;
  includeSalary: boolean;
  country: string;
  travelFrom: string;
  travelTo: string;
}

const PURPOSES: Record<LetterKind, string[]> = {
  'salary-certificate': ['Renting an apartment', 'Credit card application', 'Visa application'],
  employment: ['Visa application', 'School enrolment', 'Apartment rental'],
  bank: ['Opening a salary account', 'Personal loan application', 'Credit card application'],
  embassy: ['Tourist visa', 'Business visa', 'Visiting family'],
  noc: ['Driving licence application', 'Side project', 'Family sponsorship'],
};

const blankForm = (kind: LetterKind | null): LetterForm => ({
  addressedTo: kind ? LETTER_BY_ID[kind].defaultAddressee : '',
  addresseeTouched: false,
  purpose: '',
  includeSalary: false,
  country: '',
  travelFrom: '',
  travelTo: '',
});

export function LettersTab({ preset, onOpenDoc, onClearPreset }: { preset: LetterKind | null; onOpenDoc: (id: string) => void; onClearPreset: () => void }) {
  const me = useSessionUser();
  const comp = useMyComp();
  const letters = useHr((s) => s.letters);
  const requestLetter = useHr((s) => s.requestLetter);
  const isMobile = useIsMobile();
  const today = todayISO();
  const [kind, setKind] = useState<LetterKind | null>(preset);
  const [form, setForm] = useState<LetterForm>(() => blankForm(preset));
  const [lastPreset, setLastPreset] = useState(preset);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'form' | 'preview'>('form');
  const genRef = useRef<HTMLDivElement>(null);

  const retarget = (k: LetterKind) => setForm((f) => (f.addresseeTouched ? f : { ...f, addressedTo: LETTER_BY_ID[k].defaultAddressee }));
  if (preset !== lastPreset) {
    setLastPreset(preset);
    if (preset) {
      setKind(preset);
      retarget(preset);
    }
  }

  const mine = useMemo(() => (me ? letters.filter((l) => l.userId === me.id).sort((a, b) => b.createdAt - a.createdAt) : []), [letters, me]);
  if (!me) return null;

  const meta = kind ? LETTER_BY_ID[kind] : null;
  const salaryIncluded = meta ? (meta.salary === 'always' ? true : meta.salary === 'never' ? false : form.includeSalary) : false;
  const issues = {
    addressedTo: form.addressedTo.trim().length < 2 ? 'Who should it be addressed to?' : null,
    purpose: form.purpose.trim().length < 3 ? 'Add the purpose (it’s printed on the letter)' : null,
    country: meta?.needsTravel && !form.country.trim() ? 'Which country are you travelling to?' : null,
    travel: meta?.needsTravel && (!form.travelFrom || !form.travelTo || form.travelTo < form.travelFrom) ? 'Add valid travel dates' : null,
    pay: salaryIncluded && !comp ? 'We don’t have a pay record for you yet. Ask People Ops.' : null,
  };
  const valid = Object.values(issues).every((x) => !x);
  const show = (k: keyof typeof issues) => (tried ? issues[k] : null);
  const patch = (p: Partial<LetterForm>) => {
    setForm((f) => ({ ...f, ...p }));
    setError(null);
  };

  const choose = (k: LetterKind) => {
    setKind(k);
    retarget(k);
    setTried(false);
    setError(null);
    setView('form');
    if (preset && k !== preset) onClearPreset();
    requestAnimationFrame(() => genRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' }));
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    setTried(true);
    if (!kind || !meta || !valid) return;
    const res = requestLetter({
      kind,
      addressedTo: form.addressedTo,
      purpose: form.purpose,
      includeSalary: salaryIncluded,
      country: meta.needsTravel ? form.country : undefined,
      travelFrom: meta.needsTravel ? form.travelFrom : undefined,
      travelTo: meta.needsTravel ? form.travelTo : undefined,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.result(res);
    setKind(null);
    setForm(blankForm(null));
    setTried(false);
    if (res.issued && res.id) {
      celebrate();
      onOpenDoc(`doc-${res.id}`);
    } else if (preset) onClearPreset();
  };

  const draft: LetterLike | null =
    kind && meta
      ? {
          kind,
          addressedTo: form.addressedTo,
          purpose: form.purpose,
          includeSalary: salaryIncluded,
          country: form.country,
          travelFrom: form.travelFrom || undefined,
          travelTo: form.travelTo || undefined,
          reference: letterReference(new Date().getFullYear(), 45 + letters.length),
          status: 'draft',
        }
      : null;

  return (
    <div className="hr-doc-letters">
      <section className="hr-doc-lpick" aria-labelledby="hr-doc-lpick-title">
        <div className="hr-doc-lpick__head">
          <h2 id="hr-doc-lpick-title" className="section-title">
            <FileText aria-hidden="true" /> What do you need?
          </h2>
          <ol className="hr-doc-lsteps" aria-label="How it works">
            <li className={cx(!kind && 'is-active', kind && 'is-done')}>Choose a letter</li>
            <li className={cx(kind && 'is-active')}>Add the details</li>
            <li>Download or wait for review</li>
          </ol>
        </div>
        <div className="hr-doc-ltypes" role="group" aria-label="Letter templates">
          {LETTER_TYPES.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} type="button" className={cx('hr-doc-ltype', kind === t.id && 'is-selected')} aria-pressed={kind === t.id} onClick={() => choose(t.id)}>
                <span className="hr-doc-ltype__icon" aria-hidden="true">
                  <Icon />
                </span>
                <span className="hr-doc-ltype__label">{t.label}</span>
                <span className="hr-doc-ltype__desc">{t.description}</span>
                <span className={cx('hr-doc-ltype__badge', t.instant ? 'is-instant' : 'is-review')}>
                  {t.instant ? <Zap aria-hidden="true" /> : <Clock aria-hidden="true" />}
                  {t.instant ? 'Instant' : t.turnaround}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {kind && meta && draft ? (
        <div className="hr-doc-lgen" ref={genRef}>
          {isMobile && (
            <div className="hr-doc-lgen__toggle">
              <Segmented
                label="Letter view"
                value={view}
                onChange={setView}
                options={[
                  { value: 'form', label: 'Details' },
                  { value: 'preview', label: 'Live preview', icon: <Eye aria-hidden="true" /> },
                ]}
              />
            </div>
          )}
          <form className={cx('card hr-doc-lform', isMobile && view !== 'form' && 'is-hidden')} onSubmit={submit} noValidate>
            <header className="hr-doc-lform__head">
              <b>{meta.label}</b>
              <span className={cx('hr-doc-ltype__badge', meta.instant ? 'is-instant' : 'is-review')}>
                {meta.instant ? <Zap aria-hidden="true" /> : <Clock aria-hidden="true" />}
                {meta.instant ? 'Instant' : meta.turnaround}
              </span>
            </header>
            <label className="field">
              <span className="field-label">Addressed to</span>
              <input className={cx('input', show('addressedTo') && 'is-invalid')} value={form.addressedTo} onChange={(e) => patch({ addressedTo: e.target.value, addresseeTouched: true })} placeholder={meta.defaultAddressee} />
              {show('addressedTo') && <span className="hr-doc-err">{show('addressedTo')}</span>}
            </label>
            <label className="field">
              <span className="field-label">Purpose</span>
              <input className={cx('input', show('purpose') && 'is-invalid')} value={form.purpose} onChange={(e) => patch({ purpose: e.target.value })} placeholder="e.g. Renting an apartment" />
              {show('purpose') ? <span className="hr-doc-err">{show('purpose')}</span> : <span className="field-hint">Printed on the letter.</span>}
            </label>
            <div className="hr-doc-suggest" role="group" aria-label="Common purposes">
              {PURPOSES[kind].map((s) => (
                <button key={s} type="button" className={cx('chip', form.purpose === s && 'is-active')} onClick={() => patch({ purpose: s })}>
                  {s}
                </button>
              ))}
            </div>
            {meta.needsTravel && (
              <div className="hr-doc-travel">
                <label className="field hr-doc-travel__country">
                  <span className="field-label">Country</span>
                  <input className={cx('input', show('country') && 'is-invalid')} value={form.country} onChange={(e) => patch({ country: e.target.value })} placeholder="e.g. Japan" />
                  {show('country') && <span className="hr-doc-err">{show('country')}</span>}
                </label>
                <label className="field">
                  <span className="field-label">From</span>
                  <input type="date" className={cx('input', show('travel') && 'is-invalid')} value={form.travelFrom} min={today} onChange={(e) => patch({ travelFrom: e.target.value })} />
                </label>
                <label className="field">
                  <span className="field-label">To</span>
                  <input type="date" className={cx('input', show('travel') && 'is-invalid')} value={form.travelTo} min={form.travelFrom || today} onChange={(e) => patch({ travelTo: e.target.value })} />
                </label>
                {show('travel') && <span className="hr-doc-err hr-doc-travel__err">{show('travel')}</span>}
              </div>
            )}
            {meta.salary === 'optional' && (
              <div className="hr-doc-switch-row">
                <span>
                  <b>Include my salary</b>
                  <small>Leave it off unless the recipient asks for it. Your pay stays private by default.</small>
                </span>
                <Switch checked={form.includeSalary} onChange={(v) => patch({ includeSalary: v })} label="Include my salary" />
              </div>
            )}
            {meta.salary === 'always' && (
              <p className="hr-doc-note">
                <Lock aria-hidden="true" /> Includes your monthly salary breakdown, so it’s marked confidential.
              </p>
            )}
            {show('pay') && (
              <p className="hr-doc-error" role="alert">
                <TriangleAlert aria-hidden="true" /> {show('pay')}
              </p>
            )}
            {error && (
              <p className="hr-doc-error" role="alert">
                <TriangleAlert aria-hidden="true" /> {error}
              </p>
            )}
            <footer className="hr-doc-lform__foot">
              <span className="text-xs faint">{meta.instant ? 'Generated now, with a reference and a verification code.' : `People Ops reviews and signs it, usually ${meta.turnaround.toLowerCase()}.`}</span>
              <div className="row row--wrap">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    setKind(null);
                    setTried(false);
                    if (preset) onClearPreset();
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary" disabled={tried && !valid}>
                  {meta.instant ? <Zap aria-hidden="true" /> : <Send aria-hidden="true" />}
                  {meta.instant ? 'Generate letter' : 'Send to People Ops'}
                </button>
              </div>
            </footer>
          </form>
          <div className={cx('hr-doc-lpreview', isMobile && view !== 'preview' && 'is-hidden')} aria-label="Live letter preview">
            <span className="hr-doc-lpreview__label">
              <span className="dot dot--pulse" aria-hidden="true" /> Live preview
            </span>
            <div className="hr-doc-stage hr-doc-stage--preview">
              <LetterSheet letter={draft} person={me} comp={comp} />
            </div>
          </div>
        </div>
      ) : (
        <div className="hr-doc-lhint">
          <FileText aria-hidden="true" />
          <span>Pick a letter above. You’ll see it build live on letterhead as you type, and instant letters are ready in seconds.</span>
        </div>
      )}

      <HrPanel title="Your letters" icon={<Inbox aria-hidden="true" />} sub="Issued letters keep their reference and verification code, so anyone can check they’re genuine.">
        {mine.length === 0 ? (
          <EmptyState icon={<Inbox />} title="No letters yet">
            Salary certificates, bank and employment letters are generated instantly.
          </EmptyState>
        ) : (
          <ul className="hr-doc-lhist">
            {mine.map((l) => {
              const m = LETTER_BY_ID[l.kind];
              const st = LETTER_STATUS_META[l.status];
              const Icon = m.icon;
              return (
                <li key={l.id} className={cx('hr-doc-lrow', `is-${l.status}`)}>
                  <span className="hr-doc-kind" aria-hidden="true">
                    <Icon />
                  </span>
                  <div className="hr-doc-lrow__main">
                    <b>
                      {m.label} <span className="muted">· {l.addressedTo}</span>
                    </b>
                    <span className="hr-doc-lrow__ref">
                      {l.reference}
                      {l.status === 'issued' ? ` · code ${l.verifyCode}` : ''}
                    </span>
                    <span className="text-xs faint">
                      {l.status === 'pending'
                        ? `Requested ${relativeTime(l.createdAt)} · People Ops usually turns it around ${m.turnaround.toLowerCase()}`
                        : l.status === 'issued'
                          ? `Issued ${formatDate(l.issuedAt ?? l.createdAt)}${l.issuedBy === 'auto' ? ' · generated instantly' : ''}`
                          : `Declined ${formatDate(l.createdAt)}`}
                    </span>
                    {l.note && <span className="hr-doc-lrow__note">“{l.note}”</span>}
                  </div>
                  <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
                  {l.status === 'issued' && (
                    <button type="button" className="btn btn--sm" onClick={() => onOpenDoc(`doc-${l.id}`)}>
                      <Eye aria-hidden="true" /> Open
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </HrPanel>
    </div>
  );
}
