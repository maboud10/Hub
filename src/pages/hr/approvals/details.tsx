/**
 * Approvals detail views — full context and actions for each kind of request:
 * time off (balance after approval, team coverage strip, cover availability),
 * allowance claims (budget left), letters (linked travel / time off),
 * benefits enrolments (plan, dependents, monthly cost) and Ask People Ops
 * cases (thread, confidentiality, reply and resolve). Every action goes
 * through the store, which re-checks permissions.
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  BadgeCheck,
  CalendarRange,
  Check,
  CircleCheckBig,
  Info,
  Lock,
  Paperclip,
  Send,
  Stamp,
  TriangleAlert,
  UsersRound,
} from 'lucide-react';
import type { User } from '@/types';
import { ALLOWANCE_BY_ID, ADD_ONS, CASE_CATEGORY_META, CASE_STATUS_META, HEALTH_PLAN_BY_ID, LEAVE_TYPE_BY_ID, LETTER_BY_ID, RELATION_LABEL } from '@/hr/constants';
import { canDecideClaim, canDecideLeave, canDecideLetter, canConfirmElection, canReplyCase, canSeeCase, canSeeLeaveDetail, isManagerOf } from '@/hr/access';
import { daysBetween, eachDay, formatDay, formatDays, holidaySet, isWeekend, overlaps, todayISO } from '@/hr/calendar';
import { electionCost } from '@/hr/engine';
import { useAbsences, useAllowanceUsage, useBalances, useHrCaps, useHrViewer, type ApprovalItem } from '@/hr/selectors';
import { useHr } from '@/hr/store';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { useNow } from '@/hooks/useNow';
import { Avatar } from '@/components/ui/primitives';
import { formatDateTime, relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { PeopleStack, PersonChip } from '@/pages/talent/components/shared';
import { LeaveTypeBadge, Money, ToneBadge, UserLine } from '../components/shared';
import { fmtRange as formatRange } from '../timeoff/utils';
import { DecisionBar } from './DecisionBar';
import { KIND_META, slaOf } from './meta';

const first = (name?: string) => (name ?? '').split(/\s+/)[0];
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="hr-ap-facts">
      {rows.map(([k, v]) => (
        <div key={k} className="hr-ap-facts__row">
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Sec({ title, icon, children, className }: { title: ReactNode; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('hr-ap-sec', className)}>
      <h4 className="hr-ap-sec__h">
        {icon}
        {title}
      </h4>
      {children}
    </section>
  );
}

function Note({ tone = 'info', icon, children }: { tone?: 'info' | 'warning' | 'success'; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className={cx('hr-ap-note', `hr-ap-note--${tone}`)}>
      {icon ?? (tone === 'warning' ? <TriangleAlert aria-hidden="true" /> : <Info aria-hidden="true" />)}
      <div>{children}</div>
    </div>
  );
}

function Gone() {
  return (
    <div className="hr-ap-gone" role="status">
      <CircleCheckBig aria-hidden="true" />
      <p>This was just handled. Nothing left to do here.</p>
    </div>
  );
}

/** Header + body for one inbox item. */
export function ApprovalDetail({ item }: { item: ApprovalItem }) {
  const meta = KIND_META[item.kind];
  const now = useNow(60_000);
  const sla = slaOf(item, now);
  const Icon = meta.icon;
  return (
    <article className="hr-ap-detail" style={{ '--k-h': meta.hue } as CSSProperties} aria-label={item.title}>
      <header className="hr-ap-detail__head">
        <span className="hr-ap-kind" aria-hidden="true">
          <Icon />
        </span>
        <div className="hr-ap-detail__title">
          <span className="hr-ap-detail__kind">{meta.label}</span>
          <h3>{item.title}</h3>
        </div>
        <span className={cx('hr-ap-sla', `is-${sla.state}`)} title={`Waiting ${sla.label} · target ${sla.target}h`}>
          <i style={{ '--p': sla.ratio } as CSSProperties} aria-hidden="true" />
          {sla.label}
        </span>
      </header>
      {item.kind === 'leave' && <LeaveDetail item={item} />}
      {item.kind === 'claim' && <ClaimDetail item={item} />}
      {item.kind === 'letter' && <LetterDetail item={item} />}
      {item.kind === 'election' && <ElectionDetail item={item} />}
      {item.kind === 'case' && <CaseDetail item={item} />}
    </article>
  );
}

// ───────────────────────── time off ─────────────────────────
function quickApprovesFor(type: string) {
  if (type === 'sick' || type === 'compassionate') return ['Take care of yourself 💜', 'No rush back. We’ve got it covered'];
  if (type === 'wfa') return ['Enjoy the change of scenery 🌍', 'Sounds great, same core hours'];
  if (type === 'study') return ['Good luck with the exams! 🍀', 'Proud of you for doing this'];
  return ['Enjoy! 🌴', 'Have a wonderful break', 'Thanks for planning ahead'];
}

function LeaveDetail({ item }: { item: ApprovalItem }) {
  const req = useHr((s) => s.leave.find((r) => r.id === item.refId));
  const viewer = useHrViewer();
  const caps = useHrCaps();
  const users = useHub((s) => s.users);
  const requester = users.find((u) => u.id === req?.userId);
  const year = req ? Number(req.start.slice(0, 4)) : new Date().getFullYear();
  const balances = useBalances(req?.userId, year);
  const absences = useAbsences(caps.manage ? 'company' : 'team', req?.start ?? '', req?.end ?? '');
  const today = todayISO(useNow(60_000));
  const circle = useMemo(() => {
    if (!req || !requester) return [];
    const inCircle = (u?: User) => !!u && u.id !== requester.id && ((!!requester.managerId && u.managerId === requester.managerId) || u.id === requester.managerId || u.managerId === requester.id);
    return absences.filter((a) => inCircle(users.find((u) => u.id === a.userId)));
  }, [absences, req, requester, users]);
  if (!req || !requester) return <Gone />;

  const meta = LEAVE_TYPE_BY_ID[req.type];
  const detail = !!viewer && canSeeLeaveDetail(viewer, req, requester);
  const verdict = viewer ? canDecideLeave(viewer, req, requester) : { ok: false, reason: 'Sign in again.' };
  const bal = balances.find((b) => b.type === req.type);
  const hols = holidaySet(requester.location);
  const days = eachDay(req.start, req.end).filter((d) => !isWeekend(d));
  const skipped = days.filter((d) => hols.has(d)).length;
  const strip = days.slice(0, 15);
  const coverAway = !!req.coverId && circle.some((a) => a.userId === req.coverId);
  const notice = daysBetween(todayISO(req.createdAt), req.start);
  const shortNotice = !!meta.noticeDays && req.days > 2 && notice < meta.noticeDays && req.start >= today;
  const steppingIn = !!viewer && !isManagerOf(viewer, requester) && req.approverId !== viewer.userId;
  const approverName = users.find((u) => u.id === req.approverId)?.name;
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? 'Colleague';
  const decide = (decision: 'approved' | 'rejected', note: string) => toast.result(useHr.getState().decideLeave(req.id, decision, note || undefined));

  return (
    <div className="hr-ap-body">
      <UserLine userId={req.userId} size={40} sub={`${requester.title} · ${requester.location}`} right={<LeaveTypeBadge type={req.type} hidden={!detail} size="md" />} />
      {steppingIn && caps.manage && (
        <Note>
          {approverName ? `${first(approverName)} is their approver.` : 'They have no active line manager.'} As People Ops you can decide{approverName ? ' if needed' : ''}.
        </Note>
      )}
      <div className="hr-ap-when" style={{ '--lt-h': meta.hue } as CSSProperties}>
        <CalendarRange aria-hidden="true" />
        <div>
          <b>{formatRange(req.start, req.end, req.halfDay)}</b>
          <span>
            {formatDays(req.days)}
            {skipped ? ` · ${skipped} public holiday${skipped === 1 ? '' : 's'} not counted` : ''} · starts {req.start <= today ? 'today or earlier' : `in ${daysBetween(today, req.start)} day${daysBetween(today, req.start) === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>
      <Facts
        rows={[
          ['Reason', detail ? req.reason || <span className="faint">No note</span> : <span className="faint">Private</span>],
          ['Cover', req.coverId ? <PersonChip userId={req.coverId} label={nameOf(req.coverId)} /> : <span className="faint">No cover named</span>],
          ...(req.attachmentName
            ? ([
                [
                  'Document',
                  <span className="hr-ap-file">
                    <Paperclip aria-hidden="true" /> {req.attachmentName}
                  </span>,
                ],
              ] as [string, ReactNode][])
            : []),
          ['Requested', `${relativeTime(req.createdAt)} · ${formatDateTime(req.createdAt)}`],
        ]}
      />
      {shortNotice && (
        <Note tone="warning">
          Short notice: {notice} day{notice === 1 ? '' : 's'}, the policy suggests {meta.noticeDays}. It’s guidance, not a rule.
        </Note>
      )}

      <Sec title="Balance after approval" icon={<BadgeCheck aria-hidden="true" />}>
        {bal && bal.available !== null && bal.entitled !== null ? (
          <div className="hr-ap-bal" style={{ '--lt-h': meta.hue } as CSSProperties}>
            <div className="hr-ap-bal__nums">
              <span>
                <b>{num(bal.available + req.days)}</b>
                <small>before</small>
              </span>
              <span aria-hidden="true">→</span>
              <span className={cx(bal.available < 0 && 'is-neg')}>
                <b>{num(bal.available)}</b>
                <small>after approval</small>
              </span>
            </div>
            <div className="hr-ap-bal__bar" aria-hidden="true">
              <span style={{ width: `${Math.max(0, Math.min(100, (bal.available / Math.max(1, bal.entitled)) * 100))}%` }} />
              <span className="is-this" style={{ width: `${Math.max(0, Math.min(100, (req.days / Math.max(1, bal.entitled)) * 100))}%` }} />
            </div>
            <p className="text-xs muted">
              {detail ? meta.short : 'Leave'} days left of {num(bal.entitled)} in {year}
              {bal.pending > req.days ? `, also counting ${num(bal.pending - req.days)} other pending` : ''}.
            </p>
          </div>
        ) : (
          <p className="text-sm muted">No fixed allowance for this type.{meta.paid ? '' : ' Unpaid.'}</p>
        )}
      </Sec>

      <Sec title="Team coverage" icon={<UsersRound aria-hidden="true" />}>
        <div className="hr-ap-cov" role="list">
          {strip.map((d) => {
            const away = circle.filter((a) => a.start <= d && a.end >= d);
            const hol = hols.has(d);
            return (
              <div
                key={d}
                role="listitem"
                className={cx('hr-ap-cov__day', hol ? 'is-holiday' : away.length >= 2 ? 'is-thin' : away.length === 1 ? 'is-one' : 'is-clear')}
                aria-label={`${formatDay(d, { weekday: 'long', day: 'numeric', month: 'short' })}: ${hol ? 'public holiday' : away.length ? `${away.map((a) => nameOf(a.userId)).join(', ')} away` : 'everyone else in'}`}
              >
                <span className="hr-ap-cov__wd">{formatDay(d, { weekday: 'short' })}</span>
                <b>{Number(d.slice(8))}</b>
                {hol ? <span className="hr-ap-cov__tag">Holiday</span> : away.length ? <PeopleStack userIds={away.map((a) => a.userId)} max={2} size={18} /> : <Check className="hr-ap-cov__ok" aria-hidden="true" />}
              </div>
            );
          })}
          {days.length > strip.length && <span className="hr-ap-cov__more">+{days.length - strip.length} more days</span>}
        </div>
        {circle.length ? (
          <ul className="hr-ap-away">
            {circle.map((a) => (
              <li key={a.id}>
                <span className="truncate">
                  <b>{nameOf(a.userId)}</b> · {formatRange(a.start, a.end, a.halfDay)}
                </span>
                <LeaveTypeBadge type={a.type} />
                {a.status === 'pending' && <span className="hr-to-pending-tag">pending</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm muted">Nobody else on {first(requester.name)}’s team is away then. 👍</p>
        )}
        {coverAway && <Note tone="warning">{first(nameOf(req.coverId!))}, the named cover, is also away on some of these days.</Note>}
      </Sec>

      <DecisionBar
        quickApproves={quickApprovesFor(req.type)}
        quickDeclines={['Can we move it a week?', 'That week is a release crunch. Could you pick other dates?', 'Please line up cover first, then resubmit', 'Let’s talk 1:1 about timing']}
        onApprove={(note) => decide('approved', note)}
        onDecline={(note) => decide('rejected', note)}
        disabledReason={verdict.ok ? undefined : verdict.reason}
      />
    </div>
  );
}

// ───────────────────────── claims ─────────────────────────
function ClaimDetail({ item }: { item: ApprovalItem }) {
  const claim = useHr((s) => s.claims.find((c) => c.id === item.refId));
  const viewer = useHrViewer();
  const usage = useAllowanceUsage(claim?.userId);
  if (!claim) return <Gone />;
  const meta = ALLOWANCE_BY_ID[claim.allowance];
  const Icon = meta.icon;
  const u = usage.find((x) => x.id === claim.allowance);
  const verdict = viewer ? canDecideClaim(viewer, claim) : { ok: false, reason: 'Sign in again.' };
  const d = new Date();
  const payroll = (d.getDate() <= 20 ? d : new Date(d.getFullYear(), d.getMonth() + 1, 1)).toLocaleDateString(undefined, { month: 'long' });
  const pct = (n: number) => `${u ? Math.max(0, Math.min(100, (n / u.budget) * 100)) : 0}%`;
  const decide = (decision: 'approved' | 'rejected', note: string) => toast.result(useHr.getState().decideClaim(claim.id, decision, note || undefined));
  return (
    <div className="hr-ap-body">
      <UserLine userId={claim.userId} size={40} />
      <div className="hr-ap-amount" style={{ '--lt-h': meta.hue } as CSSProperties}>
        <span className="hr-ap-amount__icon" aria-hidden="true">
          <Icon />
        </span>
        <div>
          <span className="hr-ap-amount__label">{meta.label}</span>
          <b>
            <Money amount={claim.amount} currency={claim.currency} />
          </b>
        </div>
      </div>
      <Facts
        rows={[
          ['Merchant', claim.merchant],
          ['What', claim.description],
          ['Spent on', formatDay(claim.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })],
          [
            'Receipt',
            claim.receiptName ? (
              <span className="hr-ap-file">
                <Paperclip aria-hidden="true" /> {claim.receiptName}
              </span>
            ) : (
              <span className="hr-to-error-text">Missing</span>
            ),
          ],
          ['Submitted', relativeTime(claim.createdAt)],
        ]}
      />
      {u && (
        <Sec title="Allowance this year" icon={<BadgeCheck aria-hidden="true" />}>
          <div className="hr-ap-budget" style={{ '--lt-h': meta.hue } as CSSProperties}>
            <div className="hr-ap-budget__bar" aria-hidden="true">
              <span className="is-spent" style={{ width: pct(u.spent) }} />
              <span className="is-pending" style={{ width: pct(u.pending) }} />
            </div>
            <div className="hr-ap-budget__legend">
              <span>
                <i className="is-spent" /> Spent <Money amount={u.spent} currency="AED" />
              </span>
              <span>
                <i className="is-pending" /> Pending <Money amount={u.pending} currency="AED" />
              </span>
              <span>
                <b>
                  <Money amount={u.remaining} currency="AED" />
                </b>{' '}
                left of <Money amount={u.budget} currency="AED" />
              </span>
            </div>
          </div>
          <p className="text-xs muted">{meta.description} Approved claims are paid with the {payroll} payroll.</p>
        </Sec>
      )}
      <DecisionBar
        quickApproves={['Enjoy! 🎉', 'Great investment']}
        quickDeclines={['Please attach an itemised receipt', `This isn’t covered by the ${meta.label.toLowerCase()}`, 'Over the remaining budget. Could you split it?', 'Please resubmit with the purchase date']}
        onApprove={(note) => decide('approved', note)}
        onDecline={(note) => decide('rejected', note)}
        disabledReason={verdict.ok ? undefined : verdict.reason}
      />
    </div>
  );
}

// ───────────────────────── letters ─────────────────────────
function LetterDetail({ item }: { item: ApprovalItem }) {
  const letter = useHr((s) => s.letters.find((l) => l.id === item.refId));
  const leave = useHr((s) => s.leave);
  const viewer = useHrViewer();
  const users = useHub((s) => s.users);
  const linked = useMemo(
    () =>
      letter?.travelFrom && letter.travelTo
        ? leave.filter((r) => r.userId === letter.userId && (r.status === 'approved' || r.status === 'pending') && overlaps(r.start, r.end, letter.travelFrom!, letter.travelTo!))
        : [],
    [leave, letter],
  );
  if (!letter) return <Gone />;
  const meta = LETTER_BY_ID[letter.kind];
  const Icon = meta.icon;
  const owner = users.find((u) => u.id === letter.userId);
  const verdict = viewer ? canDecideLetter(viewer, letter) : { ok: false, reason: 'Sign in again.' };
  const decide = (decision: 'issued' | 'rejected', note: string) => toast.result(useHr.getState().decideLetter(letter.id, decision, note || undefined));
  return (
    <div className="hr-ap-body">
      <UserLine userId={letter.userId} size={40} />
      <Facts
        rows={[
          [
            'Letter',
            <span className="hr-ap-inline">
              <Icon aria-hidden="true" /> {meta.label} · {meta.turnaround.toLowerCase()}
            </span>,
          ],
          ['Addressed to', letter.addressedTo],
          ['Purpose', letter.purpose],
          [
            'Salary',
            letter.includeSalary ? (
              <span className="hr-ap-inline">
                <Lock aria-hidden="true" /> Included (confidential)
              </span>
            ) : (
              'Not included'
            ),
          ],
          ...(letter.country ? ([['Country', letter.country]] as [string, ReactNode][]) : []),
          ...(letter.travelFrom && letter.travelTo ? ([['Travel', formatRange(letter.travelFrom, letter.travelTo)]] as [string, ReactNode][]) : []),
          ['Reference', <span className="mono">{letter.reference}</span>],
          ['Requested', relativeTime(letter.createdAt)],
        ]}
      />
      {linked.length > 0 && (
        <Note tone="success" icon={<CalendarRange aria-hidden="true" />}>
          Matches their time off: {linked.map((r) => `${LEAVE_TYPE_BY_ID[r.type].label} · ${formatRange(r.start, r.end, r.halfDay)}${r.status === 'pending' ? ' (pending)' : ''}`).join('; ')}.
        </Note>
      )}
      <Sec title="Preview" icon={<Stamp aria-hidden="true" />}>
        <div className="hr-ap-paper">
          <span className="hr-ap-paper__ref">{letter.reference}</span>
          <p>{letter.addressedTo},</p>
          <p>
            This is to confirm that <b>{owner?.name ?? 'the employee'}</b> is employed by Helix as <b>{owner?.title ?? 'a team member'}</b>
            {owner ? ` since ${formatDay(owner.startDate, { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}
            {letter.includeSalary ? ', with their monthly salary stated below' : ''}.
            {letter.country && letter.travelFrom && letter.travelTo ? ` They will travel to ${letter.country} from ${formatRange(letter.travelFrom, letter.travelTo)} and will resume their duties on return.` : ''}
          </p>
          <p className="faint">Purpose: {letter.purpose}</p>
        </div>
      </Sec>
      <DecisionBar
        approveLabel="Issue letter"
        approveIcon={<Stamp />}
        quickApproves={['Issued, safe travels! ✈️', 'All set']}
        quickDeclines={['Please confirm your travel dates first', 'We need the full addressee name and address', 'Your time off for these dates isn’t approved yet']}
        onApprove={(note) => decide('issued', note)}
        onDecline={(note) => decide('rejected', note)}
        disabledReason={verdict.ok ? undefined : verdict.reason}
      />
    </div>
  );
}

// ───────────────────────── benefits ─────────────────────────
function ElectionDetail({ item }: { item: ApprovalItem }) {
  const e = useHr((s) => s.elections.find((x) => x.id === item.refId));
  const viewer = useHrViewer();
  const today = todayISO(useNow(60_000));
  if (!e) return <Gone />;
  const plan = HEALTH_PLAN_BY_ID[e.health];
  const cost = electionCost(e);
  const verdict = viewer ? canConfirmElection(viewer, e) : { ok: false, reason: 'Sign in again.' };
  const babies = e.dependents.filter((d) => d.relation === 'child' && d.birthDate && daysBetween(d.birthDate, today) <= 90);
  const age = (iso?: string) => {
    if (!iso) return '';
    const days = daysBetween(iso, today);
    if (days < 60) return `born ${days < 14 ? `${days} days` : `${Math.round(days / 7)} weeks`} ago`;
    const years = Math.floor(days / 365.25);
    return years ? `${years} yr${years === 1 ? '' : 's'}` : `${Math.floor(days / 30.4)} months`;
  };
  return (
    <div className="hr-ap-body">
      <UserLine userId={e.userId} size={40} />
      {babies.length > 0 && <Note tone="success">Life event: a new baby 🎉 Adding {babies.map((b) => first(b.name)).join(' and ')} keeps them covered from birth.</Note>}
      <div className="hr-ap-plan" style={{ '--lt-h': plan.hue } as CSSProperties}>
        <div>
          <span className="hr-ap-plan__tier">{plan.label} plan</span>
          <b>
            {plan.insurer} · {plan.network}
          </b>
          <span className="text-xs muted">
            Annual limit <Money amount={plan.annualLimit} currency="AED" compact />
          </span>
        </div>
        <div className="hr-ap-plan__addons">
          <span className={cx('hr-ap-pill', e.dental && 'is-on')}>{e.dental ? <Check aria-hidden="true" /> : null}{ADD_ONS.dental.label}</span>
          <span className={cx('hr-ap-pill', e.vision && 'is-on')}>{e.vision ? <Check aria-hidden="true" /> : null}{ADD_ONS.vision.label}</span>
          <span className="hr-ap-pill is-on">Life cover {e.lifeMultiple}× salary</span>
        </div>
      </div>
      <Sec title={`Dependents (${e.dependents.length})`} icon={<UsersRound aria-hidden="true" />}>
        {e.dependents.length ? (
          <ul className="hr-ap-deps">
            {e.dependents.map((d) => (
              <li key={d.id}>
                <Avatar user={{ name: d.name, avatarHue: (d.name.length * 47) % 360 }} size={28} />
                <span className="grow truncate">
                  <b>{d.name}</b> · {RELATION_LABEL[d.relation]}
                </span>
                {d.birthDate && <span className="text-xs muted">{age(d.birthDate)}</span>}
                {babies.includes(d) && <ToneBadge tone="success">New</ToneBadge>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm muted">Just themselves.</p>
        )}
      </Sec>
      <Sec title="Monthly cost" icon={<BadgeCheck aria-hidden="true" />}>
        <ul className="hr-ap-cost">
          {cost.lines.map((l) => (
            <li key={l.label}>
              <span>{l.label}</span>
              <Money amount={l.amount} currency="AED" />
            </li>
          ))}
          <li className="is-total">
            <span>Employee pays</span>
            <Money amount={cost.employeeMonthly} currency="AED" />
          </li>
        </ul>
        <p className="text-xs muted">
          Helix contributes about <Money amount={Math.round(cost.companyMonthly)} currency="AED" /> a month on top.
          {e.deadline ? ` Enrolment deadline ${formatDay(e.deadline, { day: 'numeric', month: 'short' })}.` : ''}
          {e.submittedAt ? ` Submitted ${relativeTime(e.submittedAt)}.` : ''}
        </p>
      </Sec>
      <DecisionBar
        approveLabel="Confirm with insurer"
        quickApproves={['Confirmed, congratulations! 🎉', 'All set, your card is ready']}
        onApprove={(note) => toast.result(useHr.getState().confirmElection(e.id, note || undefined))}
        disabledReason={verdict.ok ? undefined : verdict.reason}
      />
    </div>
  );
}

// ───────────────────────── cases ─────────────────────────
function CaseDetail({ item }: { item: ApprovalItem }) {
  const c = useHr((s) => s.cases.find((x) => x.id === item.refId));
  const viewer = useHrViewer();
  const users = useHub((s) => s.users);
  const [text, setText] = useState('');
  if (!c) return <Gone />;
  if (!viewer || !canSeeCase(viewer, c))
    return (
      <div className="hr-ap-gone">
        <Lock aria-hidden="true" />
        <p>Only People Ops can see this case.</p>
      </div>
    );
  const cat = CASE_CATEGORY_META[c.category];
  const CatIcon = cat.icon;
  const status = CASE_STATUS_META[c.status];
  const reply = canReplyCase(viewer, c);
  const userOf = (id: string) => users.find((u) => u.id === id);
  const send = () => {
    if (toast.result(useHr.getState().replyCase(c.id, text))) setText('');
  };
  const resolve = () => toast.result(useHr.getState().closeCase(c.id));
  const quick = [`Hi ${first(userOf(c.userId)?.name)}, thanks for reaching out! I’m on it and will come back to you today.`, 'Could you share a little more detail so we can help?', 'Happy to talk it through. Shall I book 20 minutes this week?'];
  return (
    <div className="hr-ap-body">
      {c.confidential && (
        <div className="hr-ap-lock" role="note">
          <Lock aria-hidden="true" />
          <div>
            <b>Confidential</b>
            <span>Only People Ops can see this. Never shared with managers, never in notifications.</span>
          </div>
        </div>
      )}
      <UserLine userId={c.userId} size={40} right={<ToneBadge tone={status.tone}>{status.label}</ToneBadge>} />
      <div className="hr-ap-case-subject">
        <span className="hr-ap-inline">
          <CatIcon aria-hidden="true" /> {cat.label}
        </span>
        <h4>{c.subject}</h4>
      </div>
      <ol className="hr-ap-thread" aria-label="Conversation">
        {c.messages.map((m) => {
          const u = userOf(m.by);
          const mine = m.by !== c.userId;
          return (
            <li key={m.id} className={cx('hr-ap-msg', mine && 'is-ops')}>
              {u && <Avatar user={u} size={28} />}
              <div className="hr-ap-msg__bubble">
                <span className="hr-ap-msg__meta">
                  <b>{u?.name ?? 'People Ops'}</b> · {relativeTime(m.at)}
                </span>
                <p>{m.text}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {reply.ok ? (
        <div className="hr-ap-reply">
          <div className="hr-ap-decide__chips" role="group" aria-label="Suggested replies">
            {quick.map((q) => (
              <button key={q} type="button" className={cx('chip', text === q && 'is-active')} onClick={() => setText(q)}>
                {q.length > 46 ? `${q.slice(0, 44)}…` : q}
              </button>
            ))}
          </div>
          <textarea className="textarea" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Reply to ${first(userOf(c.userId)?.name)}…`} aria-label="Reply" />
          <div className="hr-ap-decide__row">
            <button type="button" className="btn btn--primary" disabled={text.trim().length < 2} onClick={send}>
              <Send /> Send reply
            </button>
            <button type="button" className="btn btn--success" onClick={resolve}>
              <CircleCheckBig /> Resolve
            </button>
          </div>
          <p className="text-xs muted">Replying marks it answered and notifies {first(userOf(c.userId)?.name)}. Resolve when there’s nothing left to do.</p>
        </div>
      ) : (
        <div className="hr-ap-decide hr-ap-decide--blocked">{reply.reason}</div>
      )}
    </div>
  );
}
