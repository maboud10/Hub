/**
 * IT device console panels: lifecycle (assign / loan / repair / retire / lost),
 * remote MDM actions with a live command log, and tag editing.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowDownToLine, Download, Eraser, KeyRound, Loader2, Lock, LockOpen, Plus, RefreshCw, Search, ShieldOff, Truck, UserMinus, UserPlus, Wrench } from 'lucide-react';
import { NeoMenu, PeoplePicker, type MenuEntry } from '@/components/neo';
import { formatDate, relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { toast } from '@/store/toast';
import { useHub } from '@/store/hub';
import { useNow } from '@/hooks/useNow';
import { useHelpdesk } from '@/helpdesk/store';
import type { Device, MdmAction, MdmCommand } from '@/helpdesk/types';
import { DAY, DEVICE_STATUS_LABEL, isManagedKind, MDM_LABEL } from '@/helpdesk/meta';
import { firstNameOf } from '@/helpdesk/util';
import { EditDeviceModal, LifecycleModal, WipeModal, type LifecycleMode } from './DeviceAdminModals';
import { Person, TagChip } from './ui';

export function LifecyclePanel({ d }: { d: Device }) {
  const users = useHub((s) => s.users);
  const now = useNow(60_000);
  const [mode, setMode] = useState<LifecycleMode | null>(null);
  const [edit, setEdit] = useState(false);
  const s = useHelpdesk.getState;
  const owner = users.find((u) => u.id === d.assigneeId);
  const done = (r: { ok: boolean; error?: string }, msg: string, sub?: string) => (r.ok ? toast.success(msg, sub) : toast.error(r.error ?? 'Something went wrong.'));
  const assign = (ids: string[]) => {
    const to = ids[0] ?? null;
    const name = users.find((u) => u.id === to)?.name;
    done(s().assignDevice(d.assetTag, to), to ? `Assigned to ${name}` : 'Returned to stock', to ? 'They’ve been notified · custody logged' : d.assetTag);
  };
  const active = d.status !== 'retired' && d.status !== 'lost';

  return (
    <div className="hd-life">
      <div className="hd-life__state">
        {owner ? <Person userId={owner.id} size={38} sub={`${d.status === 'loaner' ? 'Borrowing' : 'Assigned'} · ${owner.department}`} /> : <span className="hd-life__stock">{d.status === 'in_stock' ? `In stock · ${d.office}` : DEVICE_STATUS_LABEL[d.status]}</span>}
        <span className="hd-devstate" data-status={d.status}>
          {DEVICE_STATUS_LABEL[d.status]}
        </span>
      </div>
      {d.loan && (
        <p className="hd-life__note" data-tone={d.loan.dueAt < now ? 'bad' : undefined}>
          Loan due {formatDate(d.loan.dueAt)} ({relativeTime(d.loan.dueAt, now)}) · since {formatDate(d.loan.since)}
        </p>
      )}
      {d.repair && (
        <p className="hd-life__note">
          With {d.repair.vendor} since {formatDate(d.repair.since)}
          {d.repair.eta ? ` · back ${relativeTime(d.repair.eta, now)}` : ''}
          {d.repair.note ? ` · ${d.repair.note}` : ''}
        </p>
      )}
      {d.returnAt && <p className="hd-life__note">Return booked for {formatDate(d.returnAt)}</p>}
      <div className="hd-life__actions">
        {active && d.status !== 'loaner' && d.status !== 'in_repair' && (
          <PeoplePicker
            value={d.assigneeId ? [d.assigneeId] : []}
            onChange={assign}
            label="Assign device"
            trigger={(p) => (
              <button {...p} type="button" className="neo-btn neo-btn--plasma neo-btn--sm" data-qa="dev-assign">
                <UserPlus /> {d.assigneeId ? 'Reassign' : 'Assign'}
              </button>
            )}
          />
        )}
        {d.status === 'in_use' && (
          <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => assign([])}>
            <UserMinus /> Unassign
          </button>
        )}
        {d.status === 'in_stock' && (
          <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => setMode('loan')} data-qa="dev-loan">
            <Truck /> Loan out
          </button>
        )}
        {d.status === 'loaner' && (
          <>
            <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={() => done(s().checkinLoaner(d.assetTag), `${d.assetTag} checked in`, 'Wiped & back in the loaner pool')} data-qa="dev-checkin">
              <ArrowDownToLine /> Check in
            </button>
            <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => done(s().extendLoan(d.assetTag, Math.max(d.loan?.dueAt ?? now, now) + 7 * DAY), 'Loan extended by a week', `${firstNameOf(owner?.name)} has been notified`)}>
              +7 days
            </button>
          </>
        )}
        {d.status === 'in_repair' ? (
          <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={() => done(s().returnFromRepair(d.assetTag), `${d.assetTag} is back`, d.assigneeId ? `Returned to ${owner?.name}` : 'Back in stock')}>
            <Wrench /> Back from repair
          </button>
        ) : (
          active && (
            <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => setMode('repair')}>
              <Wrench /> Repair
            </button>
          )
        )}
        {d.status === 'lost' && (
          <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={() => done(s().markFound(d.assetTag), `${d.assetTag} recovered`, 'Unlocked · custody logged')} data-qa="dev-found">
            <Search /> Mark found
          </button>
        )}
        <NeoMenu
          label="More lifecycle actions"
          items={[
            { label: 'Edit details', icon: <Wrench />, onSelect: () => setEdit(true) },
            ...(active ? ([{ kind: 'sep' }, { label: 'Mark lost', icon: <ShieldOff />, danger: true, onSelect: () => setMode('lost') }] as MenuEntry[]) : []),
            ...(d.status !== 'retired' ? ([{ label: 'Retire…', icon: <ArrowDownToLine />, danger: true, onSelect: () => setMode('retire') }] as MenuEntry[]) : []),
          ]}
          trigger={(p) => (
            <button {...p} type="button" className="neo-btn neo-btn--ghost neo-btn--sm">
              More
            </button>
          )}
        />
      </div>
      {mode && <LifecycleModal key={mode} d={d} mode={mode} onClose={() => setMode(null)} />}
      {edit && <EditDeviceModal d={d} open onClose={() => setEdit(false)} />}
    </div>
  );
}

/* ---------------------------------------------------------------- MDM */

const MDM_ICON: Record<MdmAction, typeof RefreshCw> = { sync: RefreshCw, lock: Lock, unlock: LockOpen, wipe: Eraser, rotate_key: KeyRound, push_update: Download };
const inFlight = (c: MdmCommand) => c.state !== 'completed' && c.state !== 'failed';
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

export function MdmPanel({ d }: { d: Device }) {
  const users = useHub((s) => s.users);
  const [wipe, setWipe] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const lines = d.mdm.reduce((n, c) => n + c.log.length, 0);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = 0;
  }, [lines]);

  if (!isManagedKind(d.kind)) return <p className="hd-muted-note">Peripherals aren’t MDM-enrolled — firmware updates arrive through the dock agent.</p>;
  const busy = (a: MdmAction) => d.mdm.some((c) => c.action === a && inFlight(c));
  const run = (a: MdmAction) => {
    const r = useHelpdesk.getState().mdmAction(d.assetTag, a);
    if (!r.ok) return toast.error(r.error);
    toast.info(`${MDM_LABEL[a]} sent`, d.assetTag);
  };
  const actions: { a: MdmAction; disabled?: boolean; tip?: string }[] = [
    { a: 'sync' },
    d.locked ? { a: 'unlock' } : { a: 'lock' },
    { a: 'rotate_key', disabled: !d.compliance?.encrypted, tip: !d.compliance?.encrypted ? 'Turn on encryption first' : undefined },
    { a: 'push_update', disabled: !!d.compliance?.osCurrent, tip: d.compliance?.osCurrent ? 'Already up to date' : `Install ${d.osTarget ?? 'latest'}` },
  ];
  const disabled = d.status === 'retired';
  return (
    <div className="hd-mdm">
      <div className="hd-mdm__btns">
        {actions.map(({ a, disabled: dis, tip }) => {
          const Icon = MDM_ICON[a];
          const b = busy(a);
          return (
            <button key={a} type="button" className="hd-mdmbtn" onClick={() => run(a)} disabled={disabled || dis || b} data-tip={tip} data-qa={`mdm-${a}`}>
              {b ? <Loader2 className="hd-spin" /> : <Icon />}
              <span>{MDM_LABEL[a]}</span>
            </button>
          );
        })}
        <button type="button" className="hd-mdmbtn hd-mdmbtn--danger" onClick={() => setWipe(true)} disabled={disabled || busy('wipe')} data-qa="mdm-wipe">
          {busy('wipe') ? <Loader2 className="hd-spin" /> : <Eraser />}
          <span>Wipe</span>
        </button>
      </div>
      <div className="hd-mdmlog" ref={logRef} aria-live="polite" aria-label="MDM command log">
        {d.mdm.length === 0 ? (
          <div className="hd-mdmlog__empty">No remote commands yet. Sync pulls a fresh inventory in seconds.</div>
        ) : (
          d.mdm.slice(0, 5).map((c) => (
            <div key={c.id} className="hd-mdmcmd" data-state={c.state}>
              <div className="hd-mdmcmd__head">
                <span className="hd-mdmcmd__state">{c.state}</span>
                <b>{MDM_LABEL[c.action]}</b>
                <span className="neo-faint">
                  {firstNameOf(users.find((u) => u.id === c.actorId)?.name)} · {relativeTime(c.createdAt)}
                </span>
              </div>
              {c.log.map((l, i) => (
                <div key={i} className={cx('hd-mdmcmd__line', i === c.log.length - 1 && inFlight(c) && 'is-live')}>
                  <time>{clock(l.at)}</time>
                  <span>{l.line}</span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
      <WipeModal d={d} open={wipe} onClose={() => setWipe(false)} />
    </div>
  );
}

/* ---------------------------------------------------------------- tags */

export function TagEditor({ d }: { d: Device }) {
  const tags = useHelpdesk((s) => s.tags);
  const navigate = useNavigate();
  const set = (ids: string[]) => {
    const r = useHelpdesk.getState().setDeviceTags(d.assetTag, ids);
    if (!r.ok) toast.error(r.error);
  };
  const on = tags.filter((t) => d.tags.includes(t.id));
  return (
    <div className="hd-tagedit">
      {on.map((t) => (
        <TagChip key={t.id} tag={t} onRemove={() => set(d.tags.filter((x) => x !== t.id))} />
      ))}
      {!on.length && <span className="neo-faint text-sm">No tags yet</span>}
      <NeoMenu
        label="Add tag"
        width={240}
        items={[
          ...tags.map<MenuEntry>((t) => ({
            label: (
              <span className="hd-menutag">
                <i style={{ background: t.color }} />#{t.name}
              </span>
            ),
            checked: d.tags.includes(t.id),
            onSelect: () => set(d.tags.includes(t.id) ? d.tags.filter((x) => x !== t.id) : [...d.tags, t.id]),
          })),
          { kind: 'sep' },
          { label: 'Manage tags…', onSelect: () => navigate('/helpdesk/tags') },
        ]}
        trigger={(p) => (
          <button {...p} type="button" className="hd-tagadd" aria-label="Add tag" data-qa="tag-add">
            <Plus /> Tag
          </button>
        )}
      />
    </div>
  );
}
