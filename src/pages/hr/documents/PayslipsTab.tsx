/**
 * Payslips: next payday, last and year-to-date net pay, a 12-month net pay
 * sparkline and the payslip list; each opens a printable payslip (earnings,
 * deductions, bank, pro-rated first month, reimbursed claims).
 */
import { useRef, useState } from 'react';
import { ChevronRight, Landmark, MessageCircleQuestion, PartyPopper, Printer, Receipt, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router';
import { nextPayDate, type Payslip } from '@/hr/engine';
import { usePayslips } from '@/hr/selectors';
import { daysBetween, formatDay, todayISO } from '@/hr/calendar';
import { useSessionUser } from '@/store/selectors';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/primitives';
import { HrPanel } from '../components/shared';
import { money, useMyComp } from '../benefits/model';
import { PayslipSheet } from './sheets';
import { monthLabel, printSheet } from './model';

const hasClaims = (s: Payslip) => s.earnings.some((e) => /reimbursement$/i.test(e.label));

function NetSparkline({ slips }: { slips: Payslip[] }) {
  const data = [...slips].reverse();
  if (!data.length) return null;
  const W = 280;
  const H = 72;
  const P = 8;
  const nets = data.map((d) => d.net);
  const max = Math.max(...nets);
  const min = Math.min(...nets);
  const span = max - min || 1;
  const x = (i: number) => (data.length === 1 ? W / 2 : P + (i * (W - 2 * P)) / (data.length - 1));
  const y = (v: number) => (data.length === 1 || max === min ? H / 2 : H - P - ((v - min) / span) * (H - 2 * P));
  const points = data.map((d, i) => `${x(i).toFixed(1)},${y(d.net).toFixed(1)}`);
  const last = data[data.length - 1];
  return (
    <figure className="hr-doc-spark">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Net pay over the last ${data.length} month${data.length === 1 ? '' : 's'}: latest ${money(last.net, last.currency)}`}>
        <line x1={P} x2={W - P} y1={H - 1} y2={H - 1} className="hr-doc-spark__base" />
        {data.length > 1 && (
          <>
            <path d={`M${points[0]} L${points.slice(1).join(' L')} L${x(data.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`} className="hr-doc-spark__area" />
            <polyline points={points.join(' ')} className="hr-doc-spark__line" fill="none" />
          </>
        )}
        {data.map((d, i) => (
          <circle key={d.id} cx={x(i)} cy={y(d.net)} r={i === data.length - 1 ? 4.5 : 2.5} className={i === data.length - 1 ? 'is-last' : undefined} />
        ))}
      </svg>
      <figcaption>
        {data.length > 1 ? (
          <>
            <span>{monthLabel(data[0].period, 'short')}</span>
            <span>{monthLabel(last.period, 'short')}</span>
          </>
        ) : (
          <span>Your first payslip · more months appear here as you go</span>
        )}
      </figcaption>
    </figure>
  );
}

export function PayslipsTab() {
  const me = useSessionUser();
  const comp = useMyComp();
  const slips = usePayslips(undefined, 12);
  const navigate = useNavigate();
  const [openId, setOpenId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const sheet = useRef<HTMLElement>(null);
  const today = todayISO();

  if (!me) return null;
  if (!comp)
    return (
      <div className="card card--flat">
        <EmptyState
          icon={<Wallet />}
          title="No pay record yet"
          action={
            <button type="button" className="btn btn--sm" onClick={() => navigate('/hr?ask=1')}>
              <MessageCircleQuestion aria-hidden="true" /> Ask People Ops
            </button>
          }
        >
          Once People Ops sets up your pay, your payslips appear here every month.
        </EmptyState>
      </div>
    );

  const next = nextPayDate(comp);
  const until = daysBetween(today, next);
  const latest = slips[0];
  const year = String(new Date().getFullYear());
  const thisYear = slips.filter((s) => s.period.startsWith(year));
  const ytd = thisYear.reduce((n, s) => n + s.net, 0);
  const current = slips.find((s) => s.id === openId);
  const first = slips.length === 1 && !!slips[0].partial;

  return (
    <div className="hr-doc-pay">
      <section className="neo-panel card hr-doc-payhero" aria-label="Pay summary">
        <div className="hr-doc-payhero__next">
          <span className="stat-label">Next payday</span>
          <b>{formatDay(next, { weekday: 'short', day: 'numeric', month: 'long' })}</b>
          <span className="hr-doc-payhero__until">{until <= 0 ? 'Today 🎉' : `in ${until} day${until === 1 ? '' : 's'}`}</span>
          <span className="hr-doc-payhero__bank">
            <Landmark aria-hidden="true" /> {comp.bank.name} ••{comp.bank.ibanLast4}
          </span>
        </div>
        <div className="hr-doc-payhero__stats">
          <div className="hr-doc-pstat">
            <span className="stat-label">Last net pay</span>
            <b>{latest ? money(latest.net, latest.currency) : '—'}</b>
            <span>{latest ? monthLabel(latest.period) : 'No payslips yet'}</span>
          </div>
          <div className="hr-doc-pstat">
            <span className="stat-label">Net pay in {year}</span>
            <b>{thisYear.length ? money(ytd, comp.currency) : '—'}</b>
            <span>
              {thisYear.length} payslip{thisYear.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <div className="hr-doc-payhero__spark">
          <span className="stat-label">Net pay · last {Math.max(1, slips.length)} month{slips.length === 1 ? '' : 's'}</span>
          {slips.length ? <NetSparkline slips={slips} /> : <p className="text-sm muted">Your first payslip arrives on {formatDay(next)}.</p>}
        </div>
      </section>

      {first && (
        <div className="hr-doc-first" role="status">
          <PartyPopper aria-hidden="true" />
          <span>
            <b>Your first payslip is here!</b> It’s pro-rated from your start date, and every month after this is a full one.
          </span>
        </div>
      )}

      <HrPanel hud="Monthly statements" title="Payslips" sub="Open any payslip to view earnings, deductions and reimbursed claims, or save a PDF.">
        {slips.length === 0 ? (
          <EmptyState icon={<Receipt />} title="No payslips yet">
            Your first payslip arrives on {formatDay(next, { weekday: 'long', day: 'numeric', month: 'long' })}. We’ll let you know.
          </EmptyState>
        ) : (
          <ul className="hr-doc-slips" aria-label="Payslips">
            {slips.map((s) => {
              const [y, m] = s.period.split('-').map(Number);
              const mon = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' });
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className="hr-doc-slip"
                    onClick={() => {
                      setOpenId(s.id);
                      setOpen(true);
                    }}
                  >
                    <span className="hr-doc-slip__cal" aria-hidden="true">
                      <b>{mon}</b>
                      <small>{y}</small>
                    </span>
                    <span className="hr-doc-slip__main">
                      <b>{monthLabel(s.period)}</b>
                      <span>
                        Paid {formatDay(s.payDate, { day: 'numeric', month: 'short' })} · gross {money(s.gross, s.currency)}
                      </span>
                    </span>
                    <span className="hr-doc-slip__tags">
                      {s.partial && <span className="badge badge--info">Pro-rated</span>}
                      {hasClaims(s) && <span className="badge badge--success">+ claims</span>}
                    </span>
                    <span className="hr-doc-slip__net">
                      <small>Net</small>
                      {money(s.net, s.currency)}
                    </span>
                    <ChevronRight className="hr-doc-slip__chev" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </HrPanel>

      <Modal
        open={open && !!current}
        onClose={() => setOpen(false)}
        width={860}
        className="hr-doc-viewer"
        title={current ? `Payslip · ${monthLabel(current.period)}` : 'Payslip'}
        subtitle={current ? `Paid ${formatDay(current.payDate, { weekday: 'short', day: 'numeric', month: 'long' })} · ${current.currency}` : undefined}
        icon={
          <span className="hr-doc-kind" aria-hidden="true">
            <Receipt />
          </span>
        }
        footer={
          <>
            <button type="button" className="btn" onClick={() => printSheet(sheet.current, current ? `Payslip ${current.period}` : undefined)}>
              <Printer aria-hidden="true" /> Print / save PDF
            </button>
            <button type="button" className="btn btn--primary" onClick={() => setOpen(false)}>
              Done
            </button>
          </>
        }
      >
        {current && (
          <div className="hr-doc-stage">
            <PayslipSheet ref={sheet} slip={current} person={me} comp={comp} />
          </div>
        )}
      </Modal>
    </div>
  );
}
