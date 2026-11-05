/**
 * Budget guardrail for a new requisition's salary range: plots the range
 * against the JD's advertised salary and internal peers on the same band, and
 * flags spreads or positions that would hurt pay equity.
 */
import { CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { Requisition } from '@/talent/types';
import { cx } from '@/lib/cx';
import { formatMoney } from '../components/format';

interface Range {
  min: number;
  max: number;
  currency: string;
}

export function CompGuardrail({ min, max, currency, band, peers, jdSalary }: { min: number; max: number; currency: string; band: string; peers: Requisition[]; jdSalary: Range | null }) {
  const peerRanges = peers.filter((r) => r.band === band && r.salary && r.salary.currency === currency).map((r) => r.salary!);
  const peer = peerRanges.length ? { min: Math.min(...peerRanges.map((p) => p.min)), max: Math.max(...peerRanges.map((p) => p.max)), n: peerRanges.length } : null;
  const jd = jdSalary && jdSalary.currency === currency ? jdSalary : null;
  const valid = min > 0 && max > 0 && min <= max;
  const values = [...(valid ? [min, max] : []), ...(peer ? [peer.min, peer.max] : []), ...(jd ? [jd.min, jd.max] : [])];
  const fmt = (n: number) => formatMoney(n, currency, { compact: true });

  if (!values.length)
    return (
      <div className="tl-wiz-guard tl-wiz-guard--empty">
        <Info aria-hidden="true" /> Enter a range to see how it compares with the JD and internal {band} roles.
      </div>
    );

  const lo = Math.min(...values) * 0.9;
  const hi = Math.max(...values) * 1.06;
  const pos = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
  const span = (a: number, b: number) => ({ left: `${pos(a)}%`, width: `${Math.max(0.8, pos(b) - pos(a))}%` });
  const mid = valid ? (min + max) / 2 : null;
  const spread = valid ? Math.round(((max - min) / min) * 100) : null;

  const flags: { tone: 'ok' | 'warn' | 'info'; text: string }[] = [];
  if (spread !== null) {
    if (spread > 50) flags.push({ tone: 'warn', text: `Very wide range (${spread}% spread). Tighten it to protect pay equity.` });
    else if (spread < 10) flags.push({ tone: 'info', text: `Narrow range (${spread}% spread) leaves little room to negotiate.` });
    else flags.push({ tone: 'ok', text: `Healthy spread of ${spread}% between minimum and maximum.` });
  }
  if (peer && valid) {
    if (min > peer.max) flags.push({ tone: 'warn', text: `The whole range sits above internal ${band} roles (${fmt(peer.min)}–${fmt(peer.max)}). Expect a parity review.` });
    else if (max < peer.min) flags.push({ tone: 'warn', text: `The whole range sits below internal ${band} roles (${fmt(peer.min)}–${fmt(peer.max)}). You may lose candidates.` });
    else flags.push({ tone: 'ok', text: `Overlaps ${peer.n} internal ${band} role${peer.n === 1 ? '' : 's'} (${fmt(peer.min)}–${fmt(peer.max)}).` });
  } else if (!peer) flags.push({ tone: 'info', text: `No other ${band} roles in ${currency} to compare with yet.` });
  if (jd && valid && (Math.abs(jd.min - min) / jd.min > 0.05 || Math.abs(jd.max - max) / jd.max > 0.05))
    flags.push({ tone: 'info', text: `Differs from the JD’s advertised ${fmt(jd.min)}–${fmt(jd.max)}. Align them before posting.` });

  return (
    <div className="tl-wiz-guard">
      <div className="tl-wiz-guard__head">
        <span className="stat-label">Budget guardrail</span>
        {valid && (
          <span className="tl-wiz-guard__mid">
            <b>
              {fmt(min)}–{fmt(max)}
            </b>{' '}
            · midpoint <b>{fmt(mid!)}</b>
          </span>
        )}
      </div>
      <div className="tl-wiz-guard__track" aria-hidden="true">
        {peer && <span className="tl-wiz-guard__peer" style={span(peer.min, peer.max)} />}
        {jd && <span className="tl-wiz-guard__jd" style={span(jd.min, jd.max)} />}
        {valid && <span className="tl-wiz-guard__range" style={span(min, max)} />}
        {mid !== null && <span className="tl-wiz-guard__midmark" style={{ left: `${pos(mid)}%` }} />}
      </div>
      <div className="tl-wiz-guard__legend">
        <span className="tl-wiz-guard__key tl-wiz-guard__key--range">
          <i aria-hidden="true" /> This requisition
        </span>
        {peer && (
          <span className="tl-wiz-guard__key tl-wiz-guard__key--peer">
            <i aria-hidden="true" /> Internal {band} peers
          </span>
        )}
        {jd && (
          <span className="tl-wiz-guard__key tl-wiz-guard__key--jd">
            <i aria-hidden="true" /> JD advertised
          </span>
        )}
      </div>
      <ul className="tl-wiz-guard__flags">
        {flags.map((f) => (
          <li key={f.text} className={cx('tl-wiz-guard__flag', `is-${f.tone}`)}>
            {f.tone === 'warn' ? <TriangleAlert aria-hidden="true" /> : f.tone === 'ok' ? <CircleCheck aria-hidden="true" /> : <Info aria-hidden="true" />}
            {f.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
