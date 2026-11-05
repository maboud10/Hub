/**
 * Governance (drive.manage): KPIs, sensitivity distribution, risk lists with
 * one-click fixes (turn off link, remove share, relabel, extend) and drive
 * capacity.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, Clock, Database, Gavel, Globe, HardDrive, Inbox, Link2, Shield, ShieldAlert, Timer, Users, X } from 'lucide-react';
import { EmptyState } from '@/components/ui/primitives';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { LINK_ACCESS_META, SENSITIVITY_META, formatBytes } from '@/drive/constants';
import { itemLink, useDrive } from '@/drive/store';
import { useGovernanceReport } from '@/drive/selectors';
import type { DriveItem, Sensitivity } from '@/drive/types';
import { ExpiryBadge, KindIcon, SensitivityPill, StorageBar, UserChip } from './shared';

const SENS = Object.keys(SENSITIVITY_META) as Sensitivity[];

function ItemLink({ item }: { item: DriveItem }) {
  return (
    <Link to={itemLink(item.id)} className="dr-gov-item">
      <KindIcon kind={item.kind} size={18} />
      <span className="truncate">{item.name}</span>
    </Link>
  );
}

function Section({ icon, title, count, tone, children, hint }: { icon: ReactNode; title: string; count: number; tone?: 'danger' | 'warn' | 'info'; children: ReactNode; hint: string }) {
  const [open, setOpen] = useState(count > 0);
  return (
    <section className={cx('dr-gov', tone && `dr-gov--${tone}`)}>
      <button type="button" className="dr-gov__head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="dr-gov__icon">{icon}</span>
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="dr-gov__title">
            {title} <span className="count">{count}</span>
          </span>
          <span className="dr-gov__hint">{hint}</span>
        </span>
        <span className={cx('badge', count === 0 ? 'badge--success' : tone === 'danger' ? 'badge--danger' : tone === 'warn' ? 'badge--warning' : 'badge--info')}>{count === 0 ? 'Clear' : `${count} to review`}</span>
      </button>
      {open && count > 0 && <div className="dr-gov__body">{children}</div>}
    </section>
  );
}

export function GovernanceView() {
  const report = useGovernanceReport();
  const setLinkAccess = useDrive((s) => s.setLinkAccess);
  const removeShare = useDrive((s) => s.removeShare);
  const setSensitivity = useDrive((s) => s.setSensitivity);
  const shareItem = useDrive((s) => s.shareItem);

  if (!report) {
    return (
      <EmptyState icon={<Shield />} title="Governance is for Drive administrators">
        You need the <code>drive.manage</code> permission to see every drive, public links, contractor shares and retention holds.
      </EmptyState>
    );
  }

  const totalForDist = Math.max(1, report.totalItems);
  const shareIdFor = (item: DriveItem, userId: string) => item.shares.find((s) => s.principal.type === 'user' && s.principal.id === userId)?.id;
  const companyShareId = (item: DriveItem) => item.shares.find((s) => s.principal.type === 'company')?.id;

  return (
    <div className="dr-view dr-governance">
      <header className="dr-view__head">
        <div className="grow" style={{ minWidth: 0 }}>
          <h1 className="dr-view__title">
            <ShieldAlert /> Governance
          </h1>
          <p className="text-sm muted">Company-wide posture across every drive. Each row deep-links to the item and offers a one-click fix; every fix is audited.</p>
        </div>
      </header>

      <div className="dr-kpis">
        <div className="dr-kpi">
          <span className="dr-kpi__label">
            <Database /> Items
          </span>
          <b>{report.totalItems}</b>
          <span className="dr-kpi__sub">{formatBytes(report.totalBytes)} live</span>
        </div>
        <div className="dr-kpi">
          <span className="dr-kpi__label">
            <HardDrive /> Shared drives
          </span>
          <b>{report.drives.length}</b>
          <span className="dr-kpi__sub">{report.drives.filter((d) => d.pct >= 75).length} near capacity</span>
        </div>
        <Link to="/drive/requests" className="dr-kpi">
          <span className="dr-kpi__label">
            <Inbox /> Pending requests
          </span>
          <b>{report.pendingRequests}</b>
          <span className="dr-kpi__sub">across all owners</span>
        </Link>
        <div className="dr-kpi">
          <span className="dr-kpi__label">
            <Gavel /> Legal holds
          </span>
          <b>{report.legalHolds.length}</b>
          <span className="dr-kpi__sub">frozen · no deletion or moves</span>
        </div>
      </div>

      <section className="dr-dist">
        <div className="row row--between row--wrap" style={{ gap: 8 }}>
          <h2 className="dr-h3">
            <Shield /> Sensitivity distribution
          </h2>
          <span className="text-xs muted">share of live items</span>
        </div>
        <div className="dr-dist__bar" role="img" aria-label="Sensitivity distribution">
          {report.bySensitivity.map((b) => (
            <i key={b.sensitivity} style={{ width: `${(b.count / totalForDist) * 100}%`, background: SENSITIVITY_META[b.sensitivity].color }} title={`${SENSITIVITY_META[b.sensitivity].label}: ${b.count}`} />
          ))}
        </div>
        <div className="dr-dist__legend">
          {report.bySensitivity.map((b) => (
            <span key={b.sensitivity} className="dr-dist__item" style={{ '--sens': SENSITIVITY_META[b.sensitivity].color } as CSSProperties}>
              <i />
              <b>{SENSITIVITY_META[b.sensitivity].label}</b>
              <span className="muted">
                {b.count} · {formatBytes(b.bytes)}
              </span>
            </span>
          ))}
        </div>
      </section>

      <Section icon={<Globe />} title="Public links" count={report.publicLinks.length} tone="danger" hint="Anyone with the link — including contractors and externals — can open these.">
        <ul className="dr-gov-list">
          {report.publicLinks.map((item) => (
            <li key={item.id}>
              <ItemLink item={item} />
              <SensitivityPill sensitivity={item.sensitivity} compact />
              <span className="text-xs muted dr-hide-sm">
                link role {item.linkRole} · owner <UserChip userId={item.ownerId} size={14} />
              </span>
              <button type="button" className="btn btn--sm" onClick={() => toast.result(setLinkAccess(item.id, 'restricted'))}>
                <Link2 /> Turn off link
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section icon={<AlertTriangle />} title="Overshared confidential" count={report.oversharedConfidential.length} tone="danger" hint="Confidential or Restricted items with a broad link or an everyone-at-Helix share.">
        <ul className="dr-gov-list">
          {report.oversharedConfidential.map((item) => {
            const cs = companyShareId(item);
            return (
              <li key={item.id}>
                <ItemLink item={item} />
                <SensitivityPill sensitivity={item.sensitivity} compact />
                <span className="text-xs muted">
                  {item.linkAccess !== 'restricted' && <>link: {LINK_ACCESS_META[item.linkAccess].label}</>}
                  {item.linkAccess !== 'restricted' && cs && ' · '}
                  {cs && 'shared with everyone'}
                </span>
                <span className="row" style={{ gap: 6 }}>
                  {item.linkAccess !== 'restricted' && (
                    <button type="button" className="btn btn--sm" onClick={() => toast.result(setLinkAccess(item.id, 'restricted'))}>
                      <Link2 /> Turn off link
                    </button>
                  )}
                  {cs && (
                    <button type="button" className="btn btn--sm" onClick={() => toast.result(removeShare(item.id, cs))}>
                      <X /> Remove company share
                    </button>
                  )}
                  <select className="select select--sm" style={{ width: 'auto' }} value={item.sensitivity} aria-label="Relabel" onChange={(e) => toast.result(setSensitivity(item.id, e.target.value as Sensitivity))}>
                    {SENS.map((s) => (
                      <option key={s} value={s}>
                        Relabel: {SENSITIVITY_META[s].label}
                      </option>
                    ))}
                  </select>
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section icon={<Users />} title="Contractor shares" count={report.contractorShares.length} tone="warn" hint="Direct shares with contractors. Prefer short expiries; Confidential/Restricted never allow them.">
        <ul className="dr-gov-list">
          {report.contractorShares.map(({ item, userId, expiresAt }) => {
            const sid = shareIdFor(item, userId);
            return (
              <li key={`${item.id}-${userId}`}>
                <ItemLink item={item} />
                <UserChip userId={userId} size={18} />
                <ExpiryBadge expiresAt={expiresAt} />
                <span className="row" style={{ gap: 6 }}>
                  {!expiresAt && (
                    <button type="button" className="btn btn--sm" title="Re-share with a 30-day expiry" onClick={() => {
                      const role = item.shares.find((s) => s.id === sid)?.role ?? 'viewer';
                      toast.result(shareItem(item.id, { type: 'user', id: userId }, role, { expiresInDays: 30, note: 'Time-boxed by governance' }));
                    }}>
                      <Timer /> Time-box 30d
                    </button>
                  )}
                  {sid && (
                    <button type="button" className="btn btn--sm btn--danger" onClick={() => toast.result(removeShare(item.id, sid))}>
                      <X /> Remove
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section icon={<Clock />} title="Shares expiring in 30 days" count={report.expiringShares.length} tone="info" hint="Time-boxed access that will lapse soon. Extend if the work continues, or let it expire.">
        <ul className="dr-gov-list">
          {report.expiringShares.map(({ item, userId, expiresAt }) => {
            const sid = shareIdFor(item, userId);
            const role = item.shares.find((s) => s.id === sid)?.role ?? 'viewer';
            return (
              <li key={`${item.id}-${userId}`}>
                <ItemLink item={item} />
                <UserChip userId={userId} size={18} />
                <ExpiryBadge expiresAt={expiresAt} />
                <span className="row" style={{ gap: 6 }}>
                  <button type="button" className="btn btn--sm" onClick={() => toast.result(shareItem(item.id, { type: 'user', id: userId }, role, { expiresInDays: 30, note: 'Extended by governance' }))}>
                    <Timer /> Extend 30d
                  </button>
                  {sid && (
                    <button type="button" className="btn btn--sm btn--ghost" onClick={() => toast.result(removeShare(item.id, sid))}>
                      <X /> Revoke now
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section icon={<Timer />} title="Stale files (180+ days)" count={report.stale.length} tone="info" hint="Not modified in six months. Candidates for archiving or a retention review.">
        <ul className="dr-gov-list">
          {report.stale.map((item) => (
            <li key={item.id}>
              <ItemLink item={item} />
              <SensitivityPill sensitivity={item.sensitivity} compact />
              <span className="text-xs muted">
                modified {relativeTime(item.modifiedAt)} · <UserChip userId={item.ownerId} size={14} />
              </span>
              <span className="text-xs mono muted">{formatBytes(item.sizeBytes)}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section icon={<Gavel />} title="Legal holds" count={report.legalHolds.length} tone="info" hint="Frozen items — no deletion, no moves, until governance lifts the hold from the file’s Share dialog.">
        <ul className="dr-gov-list">
          {report.legalHolds.map((item) => (
            <li key={item.id}>
              <ItemLink item={item} />
              <SensitivityPill sensitivity={item.sensitivity} compact />
              <span className="text-xs muted">
                owner <UserChip userId={item.ownerId} size={14} />
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <section className="dr-gov dr-gov--open">
        <div className="dr-gov__head">
          <span className="dr-gov__icon">
            <HardDrive />
          </span>
          <span className="grow">
            <span className="dr-gov__title">
              Drives capacity <span className="count">{report.drives.length}</span>
            </span>
            <span className="dr-gov__hint">Usage against quota and membership rule counts for every shared drive.</span>
          </span>
        </div>
        <div className="dr-gov__body">
          <div className="dr-listwrap">
            <table className="dr-list dr-list--plain">
              <thead>
                <tr>
                  <th>Drive</th>
                  <th className="dr-hide-sm">Department</th>
                  <th>Members</th>
                  <th style={{ width: '32%' }}>Usage</th>
                  <th className="dr-hide-sm">Default label</th>
                </tr>
              </thead>
              <tbody>
                {report.drives.map(({ drive, used, pct, members }) => (
                  <tr key={drive.id}>
                    <td>
                      <Link to={`/drive/d/${drive.id}`} className="row" style={{ gap: 8 }}>
                        <span className="dr-drive-emoji" style={{ '--c': drive.color } as CSSProperties}>
                          {drive.icon}
                        </span>
                        <b className="truncate">{drive.name}</b>
                      </Link>
                    </td>
                    <td className="dr-hide-sm muted">{drive.department ?? 'Company-wide'}</td>
                    <td className="muted">
                      {members} rule{members === 1 ? '' : 's'}
                    </td>
                    <td>
                      <StorageBar used={used} quota={drive.quotaBytes} color={drive.color} />
                      <span className="sr-only">{pct}%</span>
                    </td>
                    <td className="dr-hide-sm">
                      <SensitivityPill sensitivity={drive.defaultSensitivity} compact />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
