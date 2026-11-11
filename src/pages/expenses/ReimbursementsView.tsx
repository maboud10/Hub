import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ArrowRight,
  Banknote,
  CalendarClock,
  Clock,
  ExternalLink,
  Wallet,
} from 'lucide-react';
import { Chip, NeoBanner, NeoBanners, NeoEmpty, NeoKpi, NeoKpis, NeoPanel, NeoTracker } from '@/components/neo';
import { formatDay } from '@/hr/calendar';
import { useMySpendSummary } from '@/expenses/selectors';
import {
  compactAed,
  formatAed,
  ReportStatusBadge,
  useActivePaydayInfo,
} from './shared';
import { reportTrack, useSpendTrackCtx } from './trackers';

export function ReimbursementsView() {
  const navigate = useNavigate();
  const summary = useMySpendSummary();
  const payday = useActivePaydayInfo();
  const trackCtx = useSpendTrackCtx();

  const inReviewAed = useMemo(
    () =>
      summary.myReports
        .filter((r) => r.status === 'submitted' || r.status === 'manager_approved')
        .reduce((s, r) => s + r.reimbursableAed, 0),
    [summary.myReports],
  );

  const trackedClaims = useMemo(
    () =>
      summary.myReports.filter(
        (r) =>
          r.status === 'submitted' ||
          r.status === 'manager_approved' ||
          r.status === 'payroll_queued' ||
          r.status === 'reimbursed' ||
          r.status === 'changes_requested',
      ),
    [summary.myReports],
  );

  return (
    <div className="neo-stack">
      <NeoKpis label="Reimbursements at a glance" className="ex-kpis-flush">
        <NeoKpi icon={<Clock />} label="In review" value={compactAed(inReviewAed)} sub="Manager or Finance sign-off" />
        <NeoKpi
          icon={<Wallet />}
          label="Queued for payday"
          value={compactAed(summary.queuedPayrollAed)}
          sub={`Synced into the ${payday.label} run`}
          tone={summary.queuedPayrollAed > 0 ? 'success' : undefined}
        />
        <NeoKpi icon={<Banknote />} label="Reimbursed YTD" value={compactAed(summary.reimbursedYtdAed)} sub="Tax-free on your payslips" />
        <NeoKpi
          icon={<CalendarClock />}
          label="Next payday"
          value={formatDay(payday.payDate, { day: 'numeric', month: 'short' })}
          sub={payday.statusLabel}
        />
      </NeoKpis>

      {/* Live Payroll Console Sync */}
      <NeoBanners>
        <NeoBanner tone="cyan" icon={<CalendarClock />} title={`Cut-off ${formatDay(payday.cutoffDate, { day: 'numeric', month: 'short' })} → payday ${formatDay(payday.payDate, { day: 'numeric', month: 'short' })}`} meta={payday.label}>
          Claims audited before cut-off ride the {payday.label} WPS batch and land tax-free on your HR payslip.
        </NeoBanner>
      </NeoBanners>

      {/* Claim-by-Claim Audit & Payday Timelines */}
      <NeoPanel hud="Claims" title="Claim tracker" actions={<Chip size="sm">{trackedClaims.length}</Chip>}>
        {trackedClaims.length === 0 ? (
          <NeoEmpty
            compact
            icon={<Wallet />}
            title="No submitted or settled claims yet"
            action={
              <button
                type="button"
                className="neo-btn neo-btn--plasma neo-btn--sm"
                onClick={() => navigate('/expenses/reports?new=1')}
              >
                Submit an expense report <ArrowRight />
              </button>
            }
          >
            Once you submit a report, every approval step, Finance GL check, payroll period and WPS payout reference is tracked here.
          </NeoEmpty>
        ) : (
          <ul className="ex-claims">
            {trackedClaims.map((rep) => {
              const track = reportTrack(rep, trackCtx);

              return (
                <li key={rep.id} className="ex-claim">
                  <div className="ex-claim__head">
                    <div className="ex-claim__text">
                      <div className="ex-chips">
                        <span className="neo-mono ex-faint">{rep.reference}</span>
                        <ReportStatusBadge status={rep.status} size="sm" />
                        <Chip size="sm">{rep.costCenter}</Chip>
                      </div>
                      <h3 className="ex-claim__title">{rep.title}</h3>
                      <span className="ex-claim__meta">
                        {`${rep.receiptIds.length} receipt${rep.receiptIds.length === 1 ? '' : 's'} · VAT ${formatAed(rep.vatTotalAed, true)}`}
                      </span>
                    </div>
                    <div className="ex-amt ex-amt--lg">
                      <span className="neo-hud">Out-of-pocket</span>
                      <b className={rep.status === 'reimbursed' ? 'neo-num ex-pos' : 'neo-num neo-tint'}>{formatAed(rep.reimbursableAed, true)}</b>
                      {rep.corporateCardAed > 0 && <span>+ {formatAed(rep.corporateCardAed)} on the virtual card</span>}
                    </div>
                  </div>

                  {/* Live reimbursement journey (reflows to a vertical timeline on phones) */}
                  <NeoTracker {...track} title={undefined} bare label={`${rep.reference} · Reimbursement tracker`} />

                  {/* Footer Action Row */}
                  <div className="ex-claim__foot">
                    <span className="ex-faint">
                      {rep.reviewNote ? `Audit note: “${rep.reviewNote}”` : 'Tax-free employee expense settlement'}
                    </span>
                    <Link
                      to="/hr/documents?tab=payslips"
                      className={rep.status === 'reimbursed' ? 'neo-btn neo-btn--success neo-btn--sm' : 'neo-btn neo-btn--ghost neo-btn--sm'}
                    >
                      HR payslip <ExternalLink />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </NeoPanel>
    </div>
  );
}
