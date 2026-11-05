/**
 * A4 "paper" renderers for the document viewer, signing flow, letter
 * generator and payslips: letterhead, verification seal, signature blocks and
 * one sheet per document kind (offer letter from Talent Hub, contract summary,
 * confidentiality & IP agreement, issued letters, certificates, uploads,
 * payslips). Paper stays paper in both themes, and sheets avoid SVG ids so
 * they can be cloned for printing.
 */
import type { CSSProperties, ReactNode, Ref } from 'react';
import { BadgeCheck, Info, Lock, Paperclip, ShieldCheck, Sparkles } from 'lucide-react';
import type { User } from '@/types';
import type { CompRecord, EmployeeDocument, LetterKind, LetterRequest } from '@/hr/types';
import { HEALTH_PLAN_BY_ID, isUaeLocation, LETTER_BY_ID } from '@/hr/constants';
import type { Payslip } from '@/hr/engine';
import { useHr } from '@/hr/store';
import { useTalent } from '@/talent/store';
import { useUserById } from '@/store/selectors';
import { BRAND } from '@/config/brand';
import { formatDateTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { money } from '../benefits/model';
import { HelixMark } from './brand';
import { fileSize, longDate, monthLabel, ordinal } from './model';

type SheetRef = Ref<HTMLElement> | undefined;

// ───────────────────────── building blocks ─────────────────────────
export function Paper({ ref, children, className, watermark, label }: { ref?: SheetRef; children: ReactNode; className?: string; watermark?: string; label?: string }) {
  return (
    <article ref={ref} className={cx('hr-doc-sheet', className)} aria-label={label}>
      {watermark && (
        <span className="hr-doc-sheet__wm" aria-hidden="true">
          {watermark}
        </span>
      )}
      {children}
    </article>
  );
}

export function Letterhead({ tag }: { tag?: string }) {
  return (
    <header className="hr-doc-lh">
      <div className="hr-doc-lh__brand">
        <HelixMark />
        <span>
          <b>{BRAND.company}</b>
          <small>People Operations</small>
        </span>
      </div>
      <div className="hr-doc-lh__contact">
        <span>{BRAND.domain}</span>
        <span>people@{BRAND.domain}</span>
        {tag && <span className="hr-doc-lh__tag">{tag}</span>}
      </div>
    </header>
  );
}

function DocMeta({ date, reference }: { date: number | string; reference?: string }) {
  return (
    <div className="hr-doc-metarow">
      <span>{longDate(date)}</span>
      {reference && (
        <span>
          Ref. <b>{reference}</b>
        </span>
      )}
    </div>
  );
}

function Terms({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="hr-doc-terms">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function SalaryTable({ comp }: { comp: CompRecord }) {
  const rows: [string, number][] = (
    [
      ['Basic salary', comp.baseMonthly],
      ['Housing allowance', comp.housingMonthly],
      ['Transport allowance', comp.transportMonthly],
    ] as [string, number][]
  ).filter(([, v]) => v > 0);
  const total = comp.baseMonthly + comp.housingMonthly + comp.transportMonthly;
  return (
    <table className="hr-doc-table">
      <tbody>
        {rows.map(([label, v]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td>{money(v, comp.currency)}</td>
          </tr>
        ))}
        <tr className="is-total">
          <th scope="row">Total gross monthly salary</th>
          <td>{money(total, comp.currency)}</td>
        </tr>
      </tbody>
    </table>
  );
}

const RING = 'HELIX · VERIFIED · PEOPLE OPS · ';

export function VerifySeal({ reference, code, pending }: { reference: string; code?: string; pending?: boolean }) {
  const chars = [...RING];
  return (
    <div className={cx('hr-doc-seal', pending && 'is-pending')}>
      <span className="hr-doc-seal__badge" aria-hidden="true">
        <span className="hr-doc-seal__ring">
          {chars.map((ch, i) => (
            <i key={i} style={{ '--i': i, '--n': chars.length } as CSSProperties}>
              {ch}
            </i>
          ))}
        </span>
        <span className="hr-doc-seal__core">
          <BadgeCheck />
        </span>
      </span>
      <span className="hr-doc-seal__text">
        <b>{pending ? 'Verification code issued with the letter' : 'Digitally issued · verifiable'}</b>
        <span>
          Reference <code>{reference}</code>
        </span>
        {code && !pending && (
          <span>
            Verification code <code>{code}</code>
          </span>
        )}
        <span>
          Verify at{' '}
          <b>
            verify.{BRAND.domain}/{pending || !code ? '…' : code}
          </b>
        </span>
      </span>
    </div>
  );
}

export interface Signer {
  role: string;
  name: string;
  title?: string;
  signedAt?: number;
  /** Rendered in the handwriting font when signed (defaults to `name`). */
  signedName?: string;
  /** Company signatures render as an e-stamp instead of handwriting. */
  stamp?: boolean;
  pendingLabel?: string;
}

export function Signatures({ signers }: { signers: Signer[] }) {
  return (
    <div className="hr-doc-sigs">
      {signers.map((s) => (
        <div key={s.role} className={cx('hr-doc-sig', !s.signedAt && 'is-pending')}>
          <span className="hr-doc-sig__role">{s.role}</span>
          <span className="hr-doc-sig__line">
            {s.signedAt ? (
              s.stamp ? (
                <span className="hr-doc-stamp">
                  <ShieldCheck aria-hidden="true" /> Signed for {BRAND.company}
                </span>
              ) : (
                <span className="hr-doc-script">{s.signedName ?? s.name}</span>
              )
            ) : (
              <span className="hr-doc-sig__pending">{s.pendingLabel ?? 'Awaiting signature'}</span>
            )}
          </span>
          <span className="hr-doc-sig__name">
            {s.name}
            {s.title ? `, ${s.title}` : ''}
          </span>
          {s.signedAt && <span className="hr-doc-sig__when">Signed electronically · {formatDateTime(s.signedAt)}</span>}
        </div>
      ))}
    </div>
  );
}

function CompanySignOff({ issuer, issued }: { issuer: User | null; issued: boolean }) {
  if (issued && issuer)
    return (
      <div className="hr-doc-signoff">
        <span className="hr-doc-script">{issuer.name}</span>
        <b>{issuer.name}</b>
        <span>
          {issuer.title}, {BRAND.company}
        </span>
      </div>
    );
  return (
    <div className="hr-doc-signoff">
      <span className="hr-doc-stamp">
        <ShieldCheck aria-hidden="true" /> {issued ? 'Issued electronically' : 'Signed when issued'}
      </span>
      <b>{BRAND.company} People Operations</b>
      <span>{issued ? 'No handwritten signature needed: verify it with the code below.' : 'People Ops signs it once it’s ready.'}</span>
    </div>
  );
}

// ───────────────────────── letters ─────────────────────────
export interface LetterLike {
  kind: LetterKind;
  addressedTo: string;
  purpose: string;
  includeSalary: boolean;
  country?: string;
  travelFrom?: string;
  travelTo?: string;
  reference: string;
  verifyCode?: string;
  status: LetterRequest['status'] | 'draft';
  createdAt?: number;
  issuedAt?: number;
  issuedBy?: string;
}

function letterBlocks(l: LetterLike, person: User, comp: CompRecord | undefined): ReactNode[] {
  const first = person.name.split(' ')[0];
  const name = <b>{person.name}</b>;
  const role = <b>{person.title}</b>;
  const dept = <b>{person.department}</b>;
  const since = <b>{longDate(person.startDate)}</b>;
  const purpose = <i>{l.purpose.trim() || '…'}</i>;
  const total = comp ? comp.baseMonthly + comp.housingMonthly + comp.transportMonthly : 0;
  const salary = comp ? <b>{money(total, comp.currency)}</b> : <b>…</b>;
  const table = comp ? (
    <SalaryTable key="salary" comp={comp} />
  ) : (
    <p key="salary" className="hr-doc-missing">
      Salary details are added from your pay record.
    </p>
  );
  const out: ReactNode[] = [];
  const p = (key: string, node: ReactNode) => out.push(<p key={key}>{node}</p>);
  switch (l.kind) {
    case 'salary-certificate':
      p(
        'a',
        <>
          This is to certify that {name} (employee ID {person.employeeId}) has been employed by {BRAND.company} on a permanent, full-time basis since {since}, and currently holds the position of {role} in our {dept} department.
        </>,
      );
      p('b', <>{first}’s gross monthly salary is {salary}, made up as follows:</>);
      out.push(table);
      p(
        'c',
        <>
          Salary is paid by bank transfer on the {ordinal(comp?.payDay ?? 25)} of every month. This certificate is issued at {first}’s request for: {purpose}. It carries no liability for {BRAND.company} beyond confirming the information above.
        </>,
      );
      break;
    case 'employment':
      p(
        'a',
        <>
          This letter confirms that {name} is employed by {BRAND.company} as {role} in our {dept} department, on a permanent, full-time basis since {since}.
        </>,
      );
      p('b', <>{first} is based in {person.location} and is a valued member of our team, in good standing.</>);
      if (l.includeSalary) {
        p('c', <>{first}’s gross monthly salary is {salary}:</>);
        out.push(table);
      }
      p('d', <>This letter is issued at {first}’s request for: {purpose}.</>);
      break;
    case 'bank':
      p(
        'a',
        <>
          We confirm that {name} (employee ID {person.employeeId}) has been employed by {BRAND.company} as {role} since {since}, with a gross monthly salary of {salary}:
        </>,
      );
      out.push(table);
      p(
        'b',
        <>
          At {first}’s request, {BRAND.company} will pay {first}’s monthly salary into their account with <b>{l.addressedTo.trim() || 'your bank'}</b>, and will not redirect it without first receiving a clearance letter from the bank.
        </>,
      );
      p('c', <>Purpose: {purpose}.</>);
      break;
    case 'embassy':
      p(
        'a',
        <>
          We are pleased to confirm that {name} has been employed by {BRAND.company} as {role} in our {dept} department since {since}.
        </>,
      );
      p(
        'b',
        <>
          {first} plans to travel to <b>{l.country?.trim() || '…'}</b> from <b>{l.travelFrom ? longDate(l.travelFrom) : '…'}</b> to <b>{l.travelTo ? longDate(l.travelTo) : '…'}</b> for: {purpose}. {BRAND.company} supports this trip, and {first}’s position will be held for their return.
        </>,
      );
      if (l.includeSalary) {
        p('c', <>{first}’s gross monthly salary is {salary}:</>);
        out.push(table);
      }
      p('d', <>We would be grateful for any assistance you can give {first} with their visa application.</>);
      break;
    case 'noc':
      p(
        'a',
        <>
          {BRAND.company} has no objection to {name}, employed as {role} since {since}, for the following purpose: <b>{l.purpose.trim() || '…'}</b>.
        </>,
      );
      p('b', <>This certificate does not change the terms of {first}’s employment and is valid for 90 days from the date of issue.</>);
      break;
  }
  return out;
}

/** Letter on letterhead — used for the live preview and for issued letters. */
export function LetterSheet({ ref, letter, person, comp }: { ref?: SheetRef; letter: LetterLike; person: User; comp?: CompRecord }) {
  const meta = LETTER_BY_ID[letter.kind];
  const issuer = useUserById(letter.issuedBy && letter.issuedBy !== 'auto' ? letter.issuedBy : null);
  const issued = letter.status === 'issued';
  const addressee = letter.addressedTo.trim() || meta.defaultAddressee;
  const twimc = /to whom it may concern/i.test(addressee);
  const watermark = letter.status === 'draft' ? 'Preview' : letter.status === 'pending' ? 'In review' : letter.status === 'rejected' ? 'Declined' : undefined;
  return (
    <Paper ref={ref} watermark={watermark} label={`${meta.label} for ${person.name}`} className="hr-doc-sheet--letter">
      <Letterhead tag={letter.includeSalary ? 'Confidential' : undefined} />
      <DocMeta date={letter.issuedAt ?? letter.createdAt ?? Date.now()} reference={letter.reference} />
      <p className="hr-doc-addressee">{addressee}</p>
      <h1 className="hr-doc-subject">
        {meta.label}: {person.name}
      </h1>
      {!twimc && <p>Dear Sir or Madam,</p>}
      {letterBlocks(letter, person, letter.includeSalary ? comp : undefined)}
      <p>Yours faithfully,</p>
      <CompanySignOff issuer={issuer} issued={issued} />
      <VerifySeal reference={letter.reference} code={letter.verifyCode} pending={!issued} />
    </Paper>
  );
}

// ───────────────────────── payslips ─────────────────────────
export function PayslipSheet({ ref, slip, person, comp }: { ref?: SheetRef; slip: Payslip; person: User; comp?: CompRecord }) {
  const c = (n: number) => money(n, slip.currency, { cents: true });
  const deductions = slip.deductions.reduce((n, d) => n + d.amount, 0);
  const [y, m] = slip.period.split('-').map(Number);
  const dim = new Date(y, m, 0).getDate();
  const startDay = Number(person.startDate.slice(8, 10));
  return (
    <Paper ref={ref} className="hr-doc-sheet--payslip" label={`Payslip ${monthLabel(slip.period)}`}>
      <header className="hr-doc-ps-head">
        <div className="hr-doc-lh__brand">
          <HelixMark />
          <span>
            <b>{BRAND.company}</b>
            <small>Payroll</small>
          </span>
        </div>
        <div className="hr-doc-ps-title">
          <span>Payslip</span>
          <b>{monthLabel(slip.period)}</b>
        </div>
      </header>
      <div className="hr-doc-ps-net">
        <span>Net pay</span>
        <b>{c(slip.net)}</b>
        <small>Paid {longDate(slip.payDate)}</small>
      </div>
      <Terms
        rows={[
          ['Employee', person.name],
          ['Employee ID', person.employeeId],
          ['Role', `${person.title} · ${person.department}`],
          ['Pay date', longDate(slip.payDate)],
          ['Paid to', comp ? `${comp.bank.name} ••${comp.bank.ibanLast4}` : '—'],
          ['Currency', slip.currency],
        ]}
      />
      {slip.partial && (
        <p className="hr-doc-callout">
          <Info aria-hidden="true" />
          <span>
            Your first month, pro-rated from your start date: paid for <b>{dim - startDay + 1}</b> of {dim} days from {longDate(person.startDate)}.
          </span>
        </p>
      )}
      <div className="hr-doc-ps-cols">
        <table className="hr-doc-table">
          <caption>Earnings</caption>
          <tbody>
            {slip.earnings.map((e) => (
              <tr key={e.label} className={cx(/reimbursement$/i.test(e.label) && 'is-reimb')}>
                <th scope="row">
                  {e.label}
                  {/reimbursement$/i.test(e.label) && <span className="hr-doc-chip">Claim</span>}
                </th>
                <td>{c(e.amount)}</td>
              </tr>
            ))}
            <tr className="is-total">
              <th scope="row">Gross pay</th>
              <td>{c(slip.gross)}</td>
            </tr>
          </tbody>
        </table>
        <table className="hr-doc-table">
          <caption>Deductions</caption>
          <tbody>
            {slip.deductions.length ? (
              slip.deductions.map((d) => (
                <tr key={d.label}>
                  <th scope="row">{d.label}</th>
                  <td>−{c(d.amount)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <th scope="row" className="faint">
                  No deductions this month
                </th>
                <td>{c(0)}</td>
              </tr>
            )}
            <tr className="is-total">
              <th scope="row">Total deductions</th>
              <td>{deductions ? `−${c(deductions)}` : c(0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="hr-doc-ps-total">
        <span>Net pay</span>
        <b>{c(slip.net)}</b>
      </div>
      <footer className="hr-doc-foot">
        Generated by {BRAND.company} Payroll · {slip.id.toUpperCase()} · Questions? Ask People Ops in the HR Portal.
      </footer>
    </Paper>
  );
}

// ───────────────────────── employee documents ─────────────────────────
function OfferSheet({ ref, doc, person }: { ref?: SheetRef; doc: EmployeeDocument; person: User }) {
  const offer = useTalent((s) => (doc.offerId ? s.offers.find((o) => o.id === doc.offerId) : undefined));
  const req = useTalent((s) => (offer ? s.requisitions.find((r) => r.id === offer.requisitionId) : undefined));
  const signer = useUserById(offer?.createdBy);
  const manager = useUserById(req?.hiringManagerId ?? person.managerId);
  if (!offer) return <NoticeSheet ref={ref} doc={doc} person={person} note="The full offer is kept in Talent Hub. Ask People Ops if you need a copy." />;
  const first = person.name.split(' ')[0];
  return (
    <Paper ref={ref} label={`Offer letter for ${person.name}`}>
      <Letterhead tag="Private & confidential" />
      <DocMeta date={offer.sentAt ?? offer.createdAt} reference={`HX-OFR-${offer.id.replace(/^of-/i, '').toUpperCase().padStart(4, '0')}`} />
      <p className="hr-doc-addressee">{person.name}</p>
      <h1 className="hr-doc-subject">Offer of employment: {offer.title}</h1>
      <p>Dear {first},</p>
      <p>
        We’re delighted to offer you the position of <b>{offer.title}</b> at {BRAND.company}. Everyone you met was impressed, and we can’t wait to welcome you to the team.
      </p>
      <Terms
        rows={[
          ['Position', `${offer.title} · Band ${offer.band}`],
          ['Team', req?.department ?? person.department],
          ['Reporting to', manager ? `${manager.name}, ${manager.title}` : '—'],
          ['Start date', longDate(offer.startDate)],
          [
            'Base salary',
            <>
              {money(offer.baseSalary, offer.currency)} a year <span className="hr-doc-muted">({money(Math.round(offer.baseSalary / 12), offer.currency)} a month)</span>
            </>,
          ],
          ['Annual bonus', `Target ${offer.bonusPct}% of base salary`],
          ['Equity', offer.equity || 'None'],
          ['Sign-on bonus', offer.signOnBonus ? money(offer.signOnBonus, offer.currency) : 'None'],
          ['Location', person.location],
        ]}
      />
      <p>This offer is subject to satisfactory references and right-to-work checks. Your employment contract sets out the full terms, and benefits enrolment opens on your first day.</p>
      <p>Welcome to {BRAND.company}. We’re thrilled to have you.</p>
      <Signatures
        signers={[
          { role: `For ${BRAND.company}`, name: signer?.name ?? `${BRAND.company} Talent`, title: signer?.title, signedAt: offer.sentAt ?? offer.createdAt },
          {
            role: 'Accepted by',
            name: person.name,
            signedAt: offer.status === 'accepted' ? offer.respondedAt : undefined,
            pendingLabel: offer.status === 'accepted' ? undefined : 'Not accepted yet',
          },
        ]}
      />
      <p className="hr-doc-source">
        <Sparkles aria-hidden="true" /> Accepted in Talent Hub{offer.respondedAt ? ` on ${longDate(offer.respondedAt)}` : ''} · handed over to People Ops
      </p>
    </Paper>
  );
}

function ContractSheet({ ref, doc, person, comp }: { ref?: SheetRef; doc: EmployeeDocument; person: User; comp?: CompRecord }) {
  const year = new Date().getFullYear();
  const election = useHr((s) => s.elections.find((e) => e.userId === doc.userId && e.year === year));
  const total = comp ? comp.baseMonthly + comp.housingMonthly + comp.transportMonthly : 0;
  const contractType = doc.description?.split('·')[1]?.trim();
  const sig = doc.signature;
  return (
    <Paper ref={ref} label={`Employment contract for ${person.name}`}>
      <Letterhead tag="Confidential" />
      <DocMeta date={doc.createdAt} reference={`HX-EMP-${person.employeeId.replace(/^HX-/, '')}`} />
      <h1 className="hr-doc-subject">Employment contract · summary of terms</h1>
      <p>
        This summary sets out the main terms agreed between <b>{BRAND.company}</b> (“the Company”) and <b>{person.name}</b> (“you”). The full contract prevails if anything here differs.
      </p>
      <Terms
        rows={[
          ['Position', `${person.title}, ${person.department}`],
          ['Employee ID', person.employeeId],
          ['Start date', longDate(person.startDate)],
          ['Contract', contractType ? contractType[0].toUpperCase() + contractType.slice(1) : 'Permanent, full-time'],
          ['Probation', '6 months, with a check-in at 3 months'],
          ['Place of work', `${person.location} · hybrid, per the Flexible & Remote Work policy`],
          ['Working hours', '40 hours a week · core hours 10:00–15:00 Gulf time'],
          ['Annual leave', '25 working days, plus public holidays'],
          ['Notice period', '30 days (14 days during probation)'],
          ['Pay', comp ? `${money(total, comp.currency)} gross a month, paid on the ${ordinal(comp.payDay)}` : 'As set out in your offer letter'],
          ['Benefits', `Health insurance${election && election.status !== 'not-started' ? ` (${HEALTH_PLAN_BY_ID[election.health].label})` : ''}, life cover, allowances and perks`],
          ['Governing law', isUaeLocation(person.location) ? 'UAE Federal Labour Law' : `Employment law applicable in ${person.location}`],
        ]}
      />
      <h2 className="hr-doc-h2">Also part of your contract</h2>
      <ul className="hr-doc-list">
        <li>Confidentiality &amp; IP agreement</li>
        <li>Code of Conduct and company policies (see Policies)</li>
      </ul>
      <Signatures
        signers={[
          { role: 'Employee', name: person.name, signedAt: sig?.signedAt, signedName: sig?.signedName, pendingLabel: sig?.required ? 'Awaiting your signature' : undefined },
          { role: `For ${BRAND.company}`, name: `${BRAND.company} People Operations`, signedAt: doc.createdAt, stamp: true },
        ]}
      />
    </Paper>
  );
}

function AgreementSheet({ ref, doc, person }: { ref?: SheetRef; doc: EmployeeDocument; person: User }) {
  const sig = doc.signature;
  return (
    <Paper ref={ref} label={doc.title}>
      <Letterhead tag="Confidential" />
      <DocMeta date={doc.createdAt} reference={`HX-NDA-${person.employeeId.replace(/^HX-/, '')}`} />
      <h1 className="hr-doc-subject">{doc.title}</h1>
      {doc.description && <p className="hr-doc-lede">{doc.description}</p>}
      <p>
        Between <b>{BRAND.company}</b> and <b>{person.name}</b>, {person.title}.
      </p>
      <ol className="hr-doc-clauses">
        <li>
          <b>Confidential information.</b> You’ll keep {BRAND.company}, customer and colleague information confidential, during and after your employment, and use it only to do your job.
        </li>
        <li>
          <b>Intellectual property.</b> Work you create for {BRAND.company}, or with company resources, belongs to {BRAND.company}. Projects you build in your own time without company resources stay yours.
        </li>
        <li>
          <b>Open-source contributions.</b> You’re encouraged to contribute to open source. Declare projects related to our business, and never publish company code without approval.
        </li>
        <li>
          <b>AI tools.</b> Use only approved AI tools for work, and never put confidential information into personal or unapproved services (see Information Security v3).
        </li>
        <li>
          <b>Returning property.</b> When you leave, return devices and documents and delete company information from personal devices.
        </li>
        <li>
          <b>Duration.</b> Confidentiality continues for two years after you leave, and indefinitely for trade secrets and personal data.
        </li>
      </ol>
      <Signatures
        signers={[
          { role: 'Employee', name: person.name, signedAt: sig?.signedAt, signedName: sig?.signedName, pendingLabel: sig?.required ? 'Awaiting your signature' : 'No signature needed' },
          { role: `For ${BRAND.company}`, name: `${BRAND.company} People Operations`, signedAt: doc.createdAt, stamp: true },
        ]}
      />
    </Paper>
  );
}

function CertificateSheet({ ref, doc, person }: { ref?: SheetRef; doc: EmployeeDocument; person: User }) {
  return (
    <Paper ref={ref} className="hr-doc-sheet--cert" label={doc.title}>
      <div className="hr-doc-cert">
        <HelixMark />
        <span className="hr-doc-cert__eyebrow">Certificate of recognition</span>
        <h1 className="hr-doc-cert__title">{doc.title}</h1>
        <span className="hr-doc-cert__to">proudly presented to</span>
        <b className="hr-doc-cert__name">{person.name}</b>
        {doc.description && <p className="hr-doc-cert__text">{doc.description}</p>}
        <div className="hr-doc-cert__foot">
          <span>
            <b>{longDate(doc.createdAt)}</b>
            <small>Date</small>
          </span>
          <span>
            <span className="hr-doc-script">{BRAND.company} People Ops</span>
            <small>On behalf of everyone at {BRAND.company}</small>
          </span>
        </div>
      </div>
    </Paper>
  );
}

function NoticeSheet({ ref, doc, person, note }: { ref?: SheetRef; doc: EmployeeDocument; person: User; note?: string }) {
  return (
    <Paper ref={ref} label={doc.title}>
      <Letterhead tag={doc.confidential ? 'Confidential' : undefined} />
      <DocMeta date={doc.createdAt} />
      <p className="hr-doc-addressee">
        {person.name}
        <br />
        {person.title} · {person.department}
      </p>
      <h1 className="hr-doc-subject">{doc.title}</h1>
      {doc.description && <p>{doc.description}</p>}
      <p className="hr-doc-callout">
        <Info aria-hidden="true" />
        <span>{note ?? 'This is the record held in your HR file. People Ops keeps the signed original and can send you a certified copy any time through Ask People Ops.'}</span>
      </p>
      <CompanySignOff issuer={null} issued />
    </Paper>
  );
}

function FileSheet({ ref, doc }: { ref?: SheetRef; doc: EmployeeDocument }) {
  return (
    <Paper ref={ref} className="hr-doc-sheet--file" label={doc.title}>
      <div className="hr-doc-file">
        <span className="hr-doc-file__icon" aria-hidden="true">
          <Paperclip />
        </span>
        <b className="hr-doc-file__name">{doc.fileName ?? doc.title}</b>
        <span className="hr-doc-muted">
          {[fileSize(doc.sizeKb), `uploaded ${longDate(doc.createdAt)}`].filter(Boolean).join(' · ')}
        </span>
        {doc.confidential && (
          <span className="hr-doc-file__lock">
            <Lock aria-hidden="true" /> Confidential: only you and People Ops can see it
          </span>
        )}
        <p>Previews aren’t available for uploaded files. We keep the file details on record, and People Ops will ask you for the original if they ever need it.</p>
      </div>
    </Paper>
  );
}

function IssuedLetterSheet({ ref, doc, person, comp }: { ref?: SheetRef; doc: EmployeeDocument; person: User; comp?: CompRecord }) {
  const letter = useHr((s) => (doc.letterId ? s.letters.find((l) => l.id === doc.letterId) : undefined));
  if (!letter) return <NoticeSheet ref={ref} doc={doc} person={person} />;
  return <LetterSheet ref={ref} letter={letter} person={person} comp={comp} />;
}

/** Renders any of my documents as a sheet. */
export function DocSheet({ ref, doc }: { ref?: SheetRef; doc: EmployeeDocument }) {
  const person = useUserById(doc.userId);
  const comp = useHr((s) => s.comp.find((c) => c.userId === doc.userId));
  if (!person) return null;
  if (doc.source === 'self' || (doc.fileName && doc.kind !== 'letter')) return <FileSheet ref={ref} doc={doc} />;
  switch (doc.kind) {
    case 'offer':
      return <OfferSheet ref={ref} doc={doc} person={person} />;
    case 'contract':
      return <ContractSheet ref={ref} doc={doc} person={person} comp={comp} />;
    case 'nda':
      return <AgreementSheet ref={ref} doc={doc} person={person} />;
    case 'letter':
      return doc.letterId ? <IssuedLetterSheet ref={ref} doc={doc} person={person} comp={comp} /> : <NoticeSheet ref={ref} doc={doc} person={person} />;
    case 'certificate':
      return <CertificateSheet ref={ref} doc={doc} person={person} />;
    default:
      return <NoticeSheet ref={ref} doc={doc} person={person} />;
  }
}
