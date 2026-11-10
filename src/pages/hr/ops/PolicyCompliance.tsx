/**
 * People Ops console · policy compliance: every mandatory policy with
 * acknowledged / total employees, who's still pending and a "Nudge" (demo:
 * toasts "Reminder sent") per person or for everyone pending.
 */
import { Fragment, useMemo, useState } from 'react';
import { BellRing, Check, ChevronDown, ChevronUp, ScrollText } from 'lucide-react';
import type { User } from '@/types';
import { POLICIES, type PolicyMeta } from '@/hr/constants';
import { isEmployee } from '@/hr/seed';
import { useHr } from '@/hr/store';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { useNow } from '@/hooks/useNow';
import { Avatar } from '@/components/ui/primitives';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { HrPanel, UserLine } from '../components/shared';

const MANDATORY = POLICIES.filter((p) => p.mandatory);
const first = (name: string) => name.split(/\s+/)[0];

export function PolicyCompliance() {
  const users = useHub((s) => s.users);
  const acks = useHr((s) => s.acks);
  const now = useNow(60_000);
  const [openId, setOpenId] = useState<string | null>(null);
  const [nudged, setNudged] = useState<ReadonlySet<string>>(() => new Set());
  const staff = useMemo(() => users.filter(isEmployee).sort((a, b) => a.name.localeCompare(b.name)), [users]);
  const rows = useMemo(
    () =>
      MANDATORY.map((p) => {
        const done = new Set(acks.filter((a) => a.policyId === p.id && a.version === p.version).map((a) => a.userId));
        return { p, acked: staff.filter((u) => done.has(u.id)).length, pending: staff.filter((u) => !done.has(u.id)) };
      }),
    [staff, acks],
  );

  const nudge = (p: PolicyMeta, people: User[]) => {
    const fresh = people.filter((u) => !nudged.has(`${p.id}:${u.id}`));
    if (!fresh.length) return;
    setNudged((prev) => new Set([...prev, ...fresh.map((u) => `${p.id}:${u.id}`)]));
    if (fresh.length === 1) toast.success('Reminder sent', `${first(fresh[0].name)} will get a friendly nudge to read ${p.title} v${p.version}.`);
    else toast.success(`${fresh.length} reminders sent`, `Everyone still pending gets a friendly nudge to read ${p.title} v${p.version}.`);
  };

  return (
    <HrPanel className="hr-ops-pol" hud="Governance" title="Policy compliance" icon={<ScrollText aria-hidden="true" />} sub={`Must-read policies across ${staff.length} employees. Re-acknowledgement is needed whenever a new version is published.`}>
      <div className="table-wrap hr-ops-pol__wrap">
        <table className="table hr-ops-pol__table">
          <thead>
            <tr>
              <th scope="col">Policy</th>
              <th scope="col">Acknowledged</th>
              <th scope="col">Still to read</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, acked, pending }) => {
              const pct = staff.length ? Math.round((acked / staff.length) * 100) : 100;
              const Icon = p.icon;
              const open = openId === p.id;
              const left = pending.filter((u) => !nudged.has(`${p.id}:${u.id}`));
              return (
                <Fragment key={p.id}>
                  <tr className={cx('hr-ops-pol__row', pct === 100 && 'is-done', pct < 50 && 'is-low')}>
                    <td data-label="Policy">
                      <span className="hr-ops-pol__policy">
                        <span className="hr-ops-pol__icon" aria-hidden="true">
                          <Icon />
                        </span>
                        <span className="grow">
                          <b>
                            {p.title} <span className="hr-ops-pol__ver">v{p.version}</span>
                          </b>
                          <span className="text-xs faint">{p.changes ? `Updated ${relativeTime(p.publishedAt, now)} · ${p.changes.replace(/^v\d+:\s*/, '')}` : `Published ${relativeTime(p.publishedAt, now)}`}</span>
                        </span>
                      </span>
                    </td>
                    <td data-label="Acknowledged">
                      <span className="hr-ops-pol__meter">
                        <span className="progress" aria-hidden="true">
                          <span style={{ width: `${pct}%` }} />
                        </span>
                        <span className="hr-ops-pol__pct">
                          <b>{pct}%</b> · {acked}/{staff.length}
                        </span>
                      </span>
                    </td>
                    <td data-label="Still to read">
                      {pending.length ? (
                        <span className="hr-ops-pol__stack" aria-label={`${pending.length} people still to read`}>
                          {pending.slice(0, 6).map((u) => (
                            <span key={u.id} title={u.name}>
                              <Avatar user={u} size={26} />
                            </span>
                          ))}
                          {pending.length > 6 && <span className="hr-ops-pol__more">+{pending.length - 6}</span>}
                        </span>
                      ) : (
                        <span className="hr-ops-pol__all">
                          <Check aria-hidden="true" /> Everyone’s read it
                        </span>
                      )}
                    </td>
                    <td className="hr-ops-pol__actions">
                      {pending.length > 0 && (
                        <>
                          <button type="button" className="btn btn--sm" onClick={() => nudge(p, pending)} disabled={!left.length}>
                            <BellRing /> {left.length ? `Nudge all (${left.length})` : 'All nudged'}
                          </button>
                          <button type="button" className="icon-btn icon-btn--sm" aria-expanded={open} aria-label={open ? `Hide who still needs to read ${p.title}` : `Show who still needs to read ${p.title}`} onClick={() => setOpenId(open ? null : p.id)}>
                            {open ? <ChevronUp /> : <ChevronDown />}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                  {open && pending.length > 0 && (
                    <tr className="hr-ops-pol__detail">
                      <td colSpan={4}>
                        <ul className="hr-ops-pol__people">
                          {pending.map((u) => {
                            const sent = nudged.has(`${p.id}:${u.id}`);
                            return (
                              <li key={u.id}>
                                <UserLine
                                  userId={u.id}
                                  size={28}
                                  right={
                                    <button type="button" className={cx('btn btn--sm', sent ? 'btn--ghost' : '')} onClick={() => nudge(p, [u])} disabled={sent}>
                                      {sent ? (
                                        <>
                                          <Check /> Sent
                                        </>
                                      ) : (
                                        <>
                                          <BellRing /> Nudge
                                        </>
                                      )}
                                    </button>
                                  }
                                />
                              </li>
                            );
                          })}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </HrPanel>
  );
}
