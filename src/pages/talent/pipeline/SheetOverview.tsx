/**
 * Candidate sheet · Overview tab: recent signal, snapshot facts (comp is
 * permission-aware via <Comp>), skills highlighted against the active
 * requisition, experience timeline, education, tags and consent.
 */
import type { ReactNode } from 'react';
import { BadgeCheck, Building2, GraduationCap, ShieldAlert, ShieldCheck, Sparkles, Tag } from 'lucide-react';
import type { Candidate, MatchResult } from '@/talent/types';
import { WORK_MODEL_LABEL } from '@/talent/constants';
import { useTalentCaps } from '@/talent/selectors';
import { useTalentUI } from '@/talent/ui';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { Comp, SkillChips } from '../components/shared';
import { fmtDay } from '../components/format';
import { fmtYearMonth, tenure } from './pipelineUtils';

const CONSENT_METHOD: Record<NonNullable<Candidate['consent']['method']>, string> = {
  email: 'email',
  linkedin: 'LinkedIn message',
  application: 'application form',
  verbal: 'verbal confirmation',
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="tl-sheet-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function ConsentPanel({ cand }: { cand: Candidate }) {
  const caps = useTalentCaps();
  const c = cand.consent;
  const canRecord = caps.manage || caps.source;
  if (c.given) {
    const soon = !!c.retentionUntil && c.retentionUntil - Date.now() < 30 * 86_400_000;
    return (
      <div className={cx('tl-sheet-consent', soon ? 'is-warn' : 'is-ok')}>
        <ShieldCheck aria-hidden="true" />
        <div className="grow">
          <div className="tl-sheet-consent__title">{soon ? 'Consent expires soon' : 'Data-processing consent recorded'}</div>
          <p>
            Via {c.method ? CONSENT_METHOD[c.method] : 'an unspecified method'}
            {c.at ? ` on ${fmtDay(c.at)}` : ''}. Retained until {c.retentionUntil ? fmtDay(c.retentionUntil) : '—'} under GDPR / UAE PDPL.
          </p>
        </div>
        {soon && canRecord && (
          <button type="button" className="btn btn--sm" onClick={() => useTalentUI.getState().openModal({ kind: 'consent', candidateId: cand.id })}>
            Renew
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="tl-sheet-consent is-missing">
      <ShieldAlert aria-hidden="true" />
      <div className="grow">
        <div className="tl-sheet-consent__title">No consent on file</div>
        <p>Record data-processing consent before assessing {cand.name.split(' ')[0]}. Screening is gated on it.</p>
      </div>
      {canRecord && (
        <button type="button" className="btn btn--sm" onClick={() => useTalentUI.getState().openModal({ kind: 'consent', candidateId: cand.id })}>
          Record
        </button>
      )}
    </div>
  );
}

export function SheetOverview({ cand, match, matchFor }: { cand: Candidate; match: MatchResult | null; matchFor?: string }) {
  const matched = match ? [...match.matched, ...match.bonus] : [];
  const exp = cand.salaryExpectation;
  return (
    <div className="tl-sheet-stack">
      {cand.recentActivity && (
        <div className="tl-sheet-signal">
          <span className="tl-sheet-signal__icon" aria-hidden="true">
            <Sparkles />
          </span>
          <div>
            <span className="tl-sheet-label">Recent signal</span>
            <p>{cand.recentActivity}</p>
          </div>
        </div>
      )}

      <section className="tl-sheet-sec" aria-labelledby="tl-sheet-h-snap">
        <h3 className="tl-sheet-h" id="tl-sheet-h-snap">
          Snapshot
        </h3>
        <dl className="tl-sheet-facts">
          <Fact label="Current role">
            {cand.currentTitle}
            <span className="faint"> · {cand.currentCompany}</span>
          </Fact>
          <Fact label="Experience">{cand.yearsExperience} years</Fact>
          <Fact label="Expected salary">
            <Comp amount={exp?.amount ?? null} currency={exp?.currency ?? 'AED'} suffix={exp ? `/ ${exp.period}` : undefined} />
          </Fact>
          <Fact label="Notice period">{cand.noticePeriodDays != null ? `${cand.noticePeriodDays} days` : <span className="faint">Not shared</span>}</Fact>
          <Fact label="Work model">{cand.workModelPreference ? WORK_MODEL_LABEL[cand.workModelPreference] : <span className="faint">No preference</span>}</Fact>
          <Fact label="Open to work">{cand.openToWork ? <span className="tl-sheet-yes">Yes, signalled</span> : <span className="faint">Not signalled</span>}</Fact>
          <Fact label="In talent pool">Since {fmtDay(cand.createdAt)}</Fact>
          <Fact label="Last contacted">{cand.lastContactedAt ? relativeTime(cand.lastContactedAt) : <span className="faint">Not yet</span>}</Fact>
        </dl>
      </section>

      <section className="tl-sheet-sec" aria-labelledby="tl-sheet-h-skills">
        <h3 className="tl-sheet-h" id="tl-sheet-h-skills">
          Skills <span className="tl-sheet-h__count">{cand.skills.length}</span>
        </h3>
        <SkillChips skills={cand.skills} matched={matched} max={40} size="md" />
        {match && matchFor && matched.length > 0 && (
          <p className="tl-sheet-hint">
            <BadgeCheck aria-hidden="true" /> Highlighted skills match the {matchFor} profile.
          </p>
        )}
      </section>

      <section className="tl-sheet-sec" aria-labelledby="tl-sheet-h-exp">
        <h3 className="tl-sheet-h" id="tl-sheet-h-exp">
          Experience
        </h3>
        {cand.experience.length ? (
          <ol className="tl-sheet-timeline">
            {cand.experience.map((e, i) => (
              <li key={`${e.company}-${e.start}-${i}`} className={cx('tl-sheet-timeline__item', !e.end && 'is-current')}>
                <span className="tl-sheet-timeline__dot" aria-hidden="true" />
                <div className="tl-sheet-timeline__title">{e.title}</div>
                <div className="tl-sheet-timeline__org">
                  <Building2 aria-hidden="true" />
                  {e.company}
                </div>
                <div className="tl-sheet-timeline__when">
                  {fmtYearMonth(e.start)} – {e.end ? fmtYearMonth(e.end) : 'Present'} · {tenure(e.start, e.end)}
                </div>
                {e.summary && <p className="tl-sheet-timeline__summary">{e.summary}</p>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="faint text-sm">No experience captured yet.</p>
        )}
      </section>

      <section className="tl-sheet-sec" aria-labelledby="tl-sheet-h-edu">
        <h3 className="tl-sheet-h" id="tl-sheet-h-edu">
          Education
        </h3>
        {cand.education.length ? (
          <ul className="tl-sheet-edu">
            {cand.education.map((ed, i) => (
              <li key={`${ed.school}-${i}`}>
                <span className="tl-sheet-edu__icon" aria-hidden="true">
                  <GraduationCap />
                </span>
                <div>
                  <div className="tl-sheet-edu__school">{ed.school}</div>
                  <div className="tl-sheet-edu__degree">
                    {ed.degree}
                    {ed.year ? ` · ${ed.year}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="faint text-sm">No education captured yet.</p>
        )}
      </section>

      <section className="tl-sheet-sec" aria-labelledby="tl-sheet-h-tags">
        <h3 className="tl-sheet-h" id="tl-sheet-h-tags">
          Tags
        </h3>
        {cand.tags.length ? (
          <div className="tl-sheet-tags">
            {cand.tags.map((t) => (
              <span key={t} className="tl-sheet-tag">
                <Tag aria-hidden="true" />
                {t}
              </span>
            ))}
          </div>
        ) : (
          <p className="faint text-sm">No tags yet. Closing out with “Keep warm” tags people as silver medalists.</p>
        )}
      </section>

      <section className="tl-sheet-sec" aria-labelledby="tl-sheet-h-consent">
        <h3 className="tl-sheet-h" id="tl-sheet-h-consent">
          Data & consent
        </h3>
        <ConsentPanel cand={cand} />
      </section>
    </div>
  );
}
