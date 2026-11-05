/**
 * "Decided recently": the last 14 days of decisions made by the signed-in
 * person — time off they decided, claims they reviewed, letters they issued
 * and benefits they confirmed — with the outcome and the note they left.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { History, Quote } from 'lucide-react';
import type { ApprovalKind } from '@/hr/selectors';
import { ALLOWANCE_BY_ID, HEALTH_PLAN_BY_ID, LEAVE_TYPE_BY_ID, LETTER_BY_ID } from '@/hr/constants';
import { fmtRange as formatRange } from '../timeoff/utils';
import { useHr } from '@/hr/store';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import { useNow } from '@/hooks/useNow';
import { Avatar } from '@/components/ui/primitives';
import { relativeTime } from '@/lib/format';
import { HrPanel, ToneBadge, type Tone } from '../components/shared';
import { formatMoney } from '@/pages/talent/components/format';
import { KIND_META } from './meta';

const DAY = 86_400_000;

interface Decided {
  id: string;
  kind: ApprovalKind;
  userId: string;
  at: number;
  title: string;
  outcome: string;
  tone: Tone;
  note?: string;
}

export function DecidedRecently() {
  const me = useSessionUser();
  const leave = useHr((s) => s.leave);
  const claims = useHr((s) => s.claims);
  const letters = useHr((s) => s.letters);
  const elections = useHr((s) => s.elections);
  const users = useHub((s) => s.users);
  const now = useNow(60_000);
  const [all, setAll] = useState(false);

  const rows = useMemo(() => {
    if (!me) return [] as Decided[];
    const since = now - 14 * DAY;
    const out: Decided[] = [];
    for (const r of leave)
      if (r.decidedBy === me.id && (r.decidedAt ?? 0) >= since)
        out.push({
          id: `l-${r.id}`,
          kind: 'leave',
          userId: r.userId,
          at: r.decidedAt ?? 0,
          title: `${LEAVE_TYPE_BY_ID[r.type].label} · ${formatRange(r.start, r.end, r.halfDay)}`,
          outcome: r.status === 'rejected' ? 'Declined' : r.status === 'cancelled' ? 'Approved · later cancelled' : 'Approved',
          tone: r.status === 'rejected' ? 'danger' : r.status === 'cancelled' ? 'muted' : 'success',
          note: r.decisionNote,
        });
    for (const c of claims)
      if (c.reviewerId === me.id && (c.decidedAt ?? 0) >= since)
        out.push({
          id: `c-${c.id}`,
          kind: 'claim',
          userId: c.userId,
          at: c.decidedAt ?? 0,
          title: `${ALLOWANCE_BY_ID[c.allowance].label} · ${formatMoney(c.amount, c.currency)}`,
          outcome: c.status === 'rejected' ? 'Declined' : c.status === 'paid' ? 'Approved · paid' : 'Approved',
          tone: c.status === 'rejected' ? 'danger' : 'success',
          note: c.note,
        });
    for (const l of letters)
      if (l.issuedBy === me.id && (l.issuedAt ?? 0) >= since)
        out.push({ id: `t-${l.id}`, kind: 'letter', userId: l.userId, at: l.issuedAt ?? 0, title: `${LETTER_BY_ID[l.kind].label} · ${l.addressedTo}`, outcome: 'Issued', tone: 'success', note: l.note });
    for (const e of elections)
      if (e.confirmedBy === me.id && (e.confirmedAt ?? 0) >= since)
        out.push({ id: `e-${e.id}`, kind: 'election', userId: e.userId, at: e.confirmedAt ?? 0, title: `Benefits · ${HEALTH_PLAN_BY_ID[e.health].label} plan`, outcome: 'Confirmed', tone: 'success' });
    return out.sort((a, b) => b.at - a.at);
  }, [me, leave, claims, letters, elections, now]);

  const shown = all ? rows : rows.slice(0, 6);
  return (
    <HrPanel className="hr-ap-recent" title="Decided recently" icon={<History aria-hidden="true" />} sub="Your decisions in the last 14 days.">
      {rows.length === 0 ? (
        <p className="text-sm muted">Nothing decided in the last 14 days. Decisions you make show up here, with the note you left.</p>
      ) : (
        <ul className="hr-ap-recent__list">
          {shown.map((r) => {
            const u = users.find((x) => x.id === r.userId);
            const meta = KIND_META[r.kind];
            const Icon = meta.icon;
            return (
              <li key={r.id} className="hr-ap-recent__row" style={{ '--k-h': meta.hue } as CSSProperties}>
                <span className="hr-ap-kind hr-ap-kind--sm" aria-hidden="true">
                  <Icon />
                </span>
                {u && <Avatar user={u} size={26} />}
                <div className="hr-ap-recent__text">
                  <span className="truncate">
                    <b>{u?.name ?? 'Someone'}</b> · {r.title}
                  </span>
                  {r.note && (
                    <span className="hr-ap-recent__note truncate">
                      <Quote aria-hidden="true" /> {r.note}
                    </span>
                  )}
                </div>
                <ToneBadge tone={r.tone}>{r.outcome}</ToneBadge>
                <span className="hr-ap-recent__when">{relativeTime(r.at, Math.max(now, Date.now()))}</span>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > 6 && (
        <button type="button" className="btn btn--ghost btn--sm hr-ap-recent__more" onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
    </HrPanel>
  );
}
