/**
 * HR Portal · Approvals — one inbox for managers and People Ops, built on
 * `useApprovals()` (which already scopes what each person may decide; never
 * bypassed here). Kind filters with counts, urgent first, SLA age chips, a
 * master–detail layout on desktop (a sheet on tablets and phones) with full
 * context and actions, "Decided recently", and a proper inbox-zero moment.
 */
import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { CalendarDays, CheckCheck, ChevronRight, Flame, Inbox, ShieldHalf } from 'lucide-react';
import { useApprovals, useHrCaps, type ApprovalItem, type ApprovalKind } from '@/hr/selectors';
import { useHub } from '@/store/hub';
import { useNow } from '@/hooks/useNow';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Sheet } from '@/components/ui/Sheet';
import { Avatar, EmptyState } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { ApprovalDetail } from './approvals/details';
import { DecidedRecently } from './approvals/DecidedRecently';
import { KIND_META, KIND_ORDER, ageLabel, slaOf } from './approvals/meta';

type Filter = ApprovalKind | 'all';

export function ApprovalsPage() {
  const items = useApprovals();
  const caps = useHrCaps();
  const users = useHub((s) => s.users);
  const now = useNow(60_000);
  const wide = useMediaQuery('(min-width: 1081px)');
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const lastIndex = useRef(0);
  const lastSheet = useRef<ApprovalItem | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: items.length, leave: 0, claim: 0, letter: 0, election: 0, case: 0 };
    for (const i of items) c[i.kind] += 1;
    return c;
  }, [items]);
  const kinds = KIND_ORDER.filter((k) => caps.manage || counts[k] > 0 || k === 'leave');
  const shown = filter === 'all' ? items : items.filter((i) => i.kind === filter);

  // Selection survives decisions: when the open item is decided, the next one slides in.
  let selected = shown.find((i) => i.id === selectedId);
  if (!selected && shown.length) selected = shown[Math.min(lastIndex.current, shown.length - 1)];
  const selIndex = selected ? shown.indexOf(selected) : -1;
  if (selIndex >= 0) lastIndex.current = selIndex;

  const sheetItem = sheetId ? items.find((i) => i.id === sheetId) : undefined;
  if (sheetItem) lastSheet.current = sheetItem;

  const urgent = items.filter((i) => i.urgent).length;
  const oldest = items.length ? Math.min(...items.map((i) => i.at)) : now;

  const open = (i: ApprovalItem, idx: number) => {
    setSelectedId(i.id);
    lastIndex.current = idx;
    if (!wide) setSheetId(i.id);
  };

  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const next = Math.max(0, Math.min(shown.length - 1, selIndex + (e.key === 'ArrowDown' ? 1 : -1)));
    const item = shown[next];
    if (!item) return;
    setSelectedId(item.id);
    lastIndex.current = next;
    listRef.current?.querySelector<HTMLButtonElement>(`[data-index="${next}"]`)?.focus();
  };

  return (
    <div className="hr-ap">
      <div className="neo-panel hr-ap-toolbar">
        <div className="chips hr-ap-chips" role="group" aria-label="Filter by kind">
          <button type="button" className={cx('chip', filter === 'all' && 'is-active')} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            <Inbox aria-hidden="true" /> All <span className="count">{counts.all}</span>
          </button>
          {kinds.map((k) => {
            const m = KIND_META[k];
            const Icon = m.icon;
            return (
              <button key={k} type="button" className={cx('chip', filter === k && 'is-active', counts[k] === 0 && 'is-zero')} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                <Icon aria-hidden="true" /> {m.plural} <span className="count">{counts[k]}</span>
              </button>
            );
          })}
        </div>
        {items.length > 0 && (
          <span className="hr-ap-toolbar__meta">
            {urgent > 0 && (
              <span className="hr-ap-urgent">
                <Flame aria-hidden="true" /> {urgent} urgent
              </span>
            )}
            <span className="neo-hud">Oldest {ageLabel((now - oldest) / 3_600_000)}</span>
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <InboxZero manage={caps.manage} />
      ) : shown.length === 0 ? (
        <div className="card card--flat">
          <EmptyState
            icon={<Inbox />}
            title={`No ${filter === 'all' ? 'requests' : KIND_META[filter].plural.toLowerCase()} waiting`}
            action={
              <button type="button" className="btn btn--sm" onClick={() => setFilter('all')}>
                Show everything
              </button>
            }
          >
            Everything in this lane is handled.
          </EmptyState>
        </div>
      ) : (
        <div className={cx('hr-ap-split', wide && 'is-wide')}>
          <ul className="hr-ap-list" ref={listRef} onKeyDown={onListKey} aria-label="Waiting on you">
            {shown.map((i, idx) => {
              const meta = KIND_META[i.kind];
              const Icon = meta.icon;
              const u = users.find((x) => x.id === i.userId);
              const sla = slaOf(i, now);
              const active = wide && selected?.id === i.id;
              return (
                <li key={i.id}>
                  <button
                    type="button"
                    data-index={idx}
                    className={cx('hr-ap-item', i.urgent && 'is-urgent', active && 'is-selected')}
                    style={{ '--k-h': meta.hue, '--i': idx } as CSSProperties}
                    aria-current={active ? 'true' : undefined}
                    onClick={() => open(i, idx)}
                  >
                    <span className="hr-ap-kind" aria-hidden="true">
                      <Icon />
                    </span>
                    <span className="hr-ap-item__body">
                      <span className="hr-ap-item__top">
                        {u && <Avatar user={u} size={20} />}
                        <b className="truncate">{i.title}</b>
                      </span>
                      <span className="hr-ap-item__detail">{i.detail}</span>
                    </span>
                    <span className="hr-ap-item__side">
                      {i.urgent && (
                        <span className="hr-ap-urgent">
                          <Flame aria-hidden="true" /> Urgent
                        </span>
                      )}
                      <span className={cx('hr-ap-sla', `is-${sla.state}`)} title={`Waiting ${sla.label} · target ${sla.target}h`}>
                        <i style={{ '--p': sla.ratio } as CSSProperties} aria-hidden="true" />
                        {sla.label}
                      </span>
                    </span>
                    {!wide && <ChevronRight className="hr-ap-item__chev" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
          {wide && selected && (
            <aside className="neo-panel hr-ap-pane" aria-label="Request details">
              <ApprovalDetail key={selected.id} item={selected} />
            </aside>
          )}
        </div>
      )}

      <DecidedRecently />

      {!wide && (
        <Sheet open={!!sheetItem} onClose={() => setSheetId(null)} title="Review request" className="hr-ap-sheet" width={600}>
          {(sheetItem ?? lastSheet.current) && <ApprovalDetail key={(sheetItem ?? lastSheet.current)!.id} item={(sheetItem ?? lastSheet.current)!} />}
        </Sheet>
      )}
    </div>
  );
}

function InboxZero({ manage }: { manage: boolean }) {
  return (
    <section className="neo-panel hr-ap-zero" aria-live="polite">
      <div className="hr-ap-zero__orb" aria-hidden="true">
        <CheckCheck />
      </div>
      <h2>Inbox zero — nothing needs you</h2>
      <p className="muted">
        {manage
          ? 'Time off, claims, letters, benefits and Ask People Ops cases land here the moment someone needs a decision. We’ll notify you.'
          : 'When someone on your team requests time off it lands here, and you’ll get a notification.'}
      </p>
      <div className="hr-ap-zero__actions">
        <Link className="btn" to="/hr/time-off">
          <CalendarDays /> See who’s away
        </Link>
        {manage && (
          <Link className="btn btn--ghost" to="/hr/ops">
            <ShieldHalf /> People Ops dashboard
          </Link>
        )}
      </div>
    </section>
  );
}
