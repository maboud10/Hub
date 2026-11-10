/**
 * Requisitions — every seat from headcount approval to a filled role.
 * Status chips with counts, department / priority / "Mine" filters, search,
 * cards or table (cards on phones) and headcount-approval call-outs.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Briefcase, Clock, Hourglass, LayoutGrid, Plus, Search, SearchX, ShieldCheck, Table2, Users } from 'lucide-react';
import type { Department, ReqPriority, ReqStatus, Requisition } from '@/talent/types';
import { PRIORITY_META, WORK_MODEL_LABEL } from '@/talent/constants';
import { canApproveRequisition, canEditRequisition, type TalentViewer } from '@/talent/access';
import { useTalent } from '@/talent/store';
import { useTalentCaps, useTalentLookups, useTalentScope, useTalentViewer } from '@/talent/selectors';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { useNow } from '@/hooks/useNow';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { cx } from '@/lib/cx';
import { EmptyState, Segmented, Switch } from '@/components/ui/primitives';
import { NeoBanner, NeoBanners, NeoKpi, NeoKpis } from '@/components/neo';
import type { Application } from '@/talent/types';
import { HeadActions } from './components/head';
import { MatchRing, PeopleStack, PriorityBadge, ReqStatusBadge } from './components/shared';
import { ReqCard } from './reqs/ReqCard';
import { CompRange, ReqApprovalFacts, ReqPipelineBar, SeatMeter } from './reqs/pieces';
import { useNoteDialog } from './reqs/NoteDialog';
import { PRIORITY_ORDER, PRIORITY_RANK, STATUS_RANK, appsByReq, avgMatch, daysOpen, daysSince, isMine } from './reqs/helpers';

type StatusFilter = ReqStatus | 'all';
type SortKey = 'priority' | 'newest' | 'oldest' | 'pipeline';

const STATUS_CHIPS: { id: StatusFilter; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'pending-approval', label: 'Awaiting approval' },
  { id: 'draft', label: 'Draft' },
  { id: 'on-hold', label: 'On hold' },
  { id: 'filled', label: 'Filled' },
  { id: 'closed', label: 'Closed' },
  { id: 'all', label: 'All' },
];

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'priority', label: 'Priority' },
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Longest open' },
  { id: 'pipeline', label: 'Biggest pipeline' },
];

const VIEW_KEY = 'nexus.talent.reqs.view';

function readView(): 'cards' | 'table' {
  try {
    return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'cards';
  } catch {
    return 'cards';
  }
}

export function RequisitionsTab() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const scope = useTalentScope();
  const caps = useTalentCaps();
  const viewer = useTalentViewer();
  const me = useSessionUser();
  const users = useHub((s) => s.users);
  const { candById } = useTalentLookups();
  const now = useNow(60_000);
  const isMobile = useIsMobile();
  const note = useNoteDialog();

  const initialStatus = params.get('status');
  const [status, setStatus] = useState<StatusFilter>(STATUS_CHIPS.some((c) => c.id === initialStatus) ? (initialStatus as StatusFilter) : 'open');
  const [dept, setDept] = useState<Department | 'all'>('all');
  const [priority, setPriority] = useState<ReqPriority | 'all'>('all');
  const [mine, setMine] = useState(params.get('mine') === '1');
  const [q, setQ] = useState(params.get('q') ?? '');
  const [sort, setSort] = useState<SortKey>('priority');
  const [view, setView] = useState<'cards' | 'table'>(readView);
  const effectiveView = isMobile ? 'cards' : view;

  const byReq = useMemo(() => appsByReq(scope.applications), [scope.applications]);
  const nameOf = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);
  const departments = useMemo(() => [...new Set(scope.requisitions.map((r) => r.department))].sort(), [scope.requisitions]);

  /** Everything but the status filter (chip counts reflect these). */
  const base = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return scope.requisitions.filter(
      (r) =>
        (dept === 'all' || r.department === dept) &&
        (priority === 'all' || r.priority === priority) &&
        (!mine || isMine(r, me?.id)) &&
        (!needle || [r.title, r.department, r.location, r.band, r.id, nameOf.get(r.hiringManagerId), nameOf.get(r.recruiterId)].some((x) => x?.toLowerCase().includes(needle))),
    );
  }, [scope.requisitions, dept, priority, mine, me?.id, q, nameOf]);

  const counts = useMemo(() => {
    const m = new Map<StatusFilter, number>([['all', base.length]]);
    for (const r of base) m.set(r.status, (m.get(r.status) ?? 0) + 1);
    return m;
  }, [base]);

  const list = useMemo(() => {
    const filtered = status === 'all' ? base : base.filter((r) => r.status === status);
    const active = (r: Requisition) => (byReq.get(r.id) ?? []).filter((a) => a.status === 'active').length;
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case 'newest':
          return b.createdAt - a.createdAt;
        case 'oldest':
          return (a.openedAt ?? a.createdAt) - (b.openedAt ?? b.createdAt);
        case 'pipeline':
          return active(b) - active(a);
        default:
          return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.createdAt - a.createdAt;
      }
    });
  }, [base, status, sort, byReq]);

  const kpi = useMemo(() => {
    const open = scope.requisitions.filter((r) => r.status === 'open');
    const openIds = new Set(open.map((r) => r.id));
    const ages = open.map((r) => daysOpen(r, now)).filter((d): d is number => d !== null);
    return {
      openReqs: open.length,
      seats: open.reduce((n, r) => n + Math.max(0, r.headcount - r.hires), 0),
      inFlight: scope.applications.filter((a) => a.status === 'active' && openIds.has(a.requisitionId)).length,
      pending: scope.requisitions.filter((r) => r.status === 'pending-approval').length,
      avgOpen: ages.length ? Math.round(ages.reduce((s, n) => s + n, 0) / ages.length) : null,
      hires: scope.requisitions.reduce((n, r) => n + r.hires, 0),
    };
  }, [scope, now]);

  const approvable = useMemo(() => (viewer ? scope.requisitions.filter((r) => r.status === 'pending-approval' && canApproveRequisition(viewer, r).ok) : []), [viewer, scope.requisitions]);

  const approve = (r: Requisition) =>
    note.ask({
      title: 'Approve headcount',
      subtitle: `${r.title} · ${r.department}`,
      icon: <ShieldCheck />,
      tone: 'success',
      confirmLabel: 'Approve & open',
      label: 'Approval note',
      placeholder: 'e.g. Budgeted in the Q4 plan; band confirmed with Finance.',
      body: <ReqApprovalFacts req={r} />,
      onConfirm: (text) => toast.result(useTalent.getState().approveRequisition(r.id, text || undefined)),
    });

  const canSubmit = (r: Requisition) => r.status === 'draft' && !!viewer && canEditRequisition(viewer, r).ok;
  const submit = (r: Requisition) => toast.result(useTalent.getState().submitRequisition(r.id));

  const setViewPersist = (v: 'cards' | 'table') => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private mode */
    }
  };

  const filtersActive = dept !== 'all' || priority !== 'all' || mine || q.trim() !== '';
  const clearFilters = () => {
    setDept('all');
    setPriority('all');
    setMine(false);
    setQ('');
  };

  return (
    <section className="tl-req-page" aria-label="Requisitions">
      <HeadActions>
        {!isMobile && (
          <Segmented
            value={view}
            onChange={setViewPersist}
            label="Layout"
            options={[
              { value: 'cards', label: 'Cards', icon: <LayoutGrid /> },
              { value: 'table', label: 'Table', icon: <Table2 /> },
            ]}
          />
        )}
        {caps.hire && (
          <button type="button" className="neo-btn neo-btn--plasma" onClick={() => navigate('/talent/requisitions/new')}>
            <Plus /> <span className="neo-btn__label">New requisition</span>
          </button>
        )}
      </HeadActions>

      {approvable.length > 0 && status !== 'pending-approval' && (
        <NeoBanners>
          <NeoBanner
            tone="warning"
            icon={<ShieldCheck />}
            title={`${approvable.length} requisition${approvable.length === 1 ? '' : 's'} waiting for your headcount approval`}
            meta="Needs sign-off"
            onClick={() => (approvable.length === 1 ? approve(approvable[0]) : setStatus('pending-approval'))}
          >
            {approvable.map((r) => r.title).join(' · ')}
          </NeoBanner>
        </NeoBanners>
      )}

      <NeoKpis label="Requisitions at a glance">
        <NeoKpi icon={<Briefcase />} label="Open requisitions" value={kpi.openReqs} sub={`${kpi.seats} open seat${kpi.seats === 1 ? '' : 's'} · ${kpi.hires} filled`} />
        <NeoKpi icon={<Users />} label="In flight" value={kpi.inFlight} sub="Active candidates on open roles" to="/talent/pipeline" />
        <NeoKpi
          icon={<Hourglass />}
          label="Awaiting approval"
          value={kpi.pending}
          sub={approvable.length ? `${approvable.length} waiting on you` : 'Headcount sign-off'}
          tone={approvable.length ? 'warning' : undefined}
        />
        <NeoKpi icon={<Clock />} label="Avg days open" value={kpi.avgOpen ?? '—'} sub="Across open requisitions" />
      </NeoKpis>

      <div className="tl-req-toolbar">
        <div className="chips tl-req-status" role="group" aria-label="Filter by status">
          {STATUS_CHIPS.map((c) => (
            <button key={c.id} type="button" className={cx('chip', status === c.id && 'is-active')} aria-pressed={status === c.id} onClick={() => setStatus(c.id)}>
              {c.label}
              <span className="count">{counts.get(c.id) ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="tl-req-filters">
          <div className="input-wrap tl-req-search">
            <Search aria-hidden="true" />
            <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search roles, teams, places, people…" aria-label="Search requisitions" />
          </div>
          <select className="select" value={dept} onChange={(e) => setDept(e.target.value as Department | 'all')} aria-label="Department">
            <option value="all">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as ReqPriority | 'all')} aria-label="Priority">
            <option value="all">Any priority</option>
            {PRIORITY_ORDER.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_META[p].label}
              </option>
            ))}
          </select>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort by">
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                Sort: {s.label}
              </option>
            ))}
          </select>
          <span className="tl-req-mine">
            <Switch checked={mine} onChange={setMine} label="Only requisitions where I’m the hiring manager or recruiter" />
            <span aria-hidden="true" onClick={() => setMine(!mine)}>
              Mine
            </span>
          </span>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="card card--flat">
          <EmptyState
            icon={<SearchX />}
            title={scope.requisitions.length ? 'No requisitions match' : 'No requisitions yet'}
            action={
              filtersActive || status !== 'all' ? (
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => {
                    clearFilters();
                    setStatus('all');
                  }}
                >
                  Show everything
                </button>
              ) : caps.hire ? (
                <button type="button" className="btn btn--sm btn--primary" onClick={() => navigate('/talent/requisitions/new')}>
                  <Plus /> New requisition
                </button>
              ) : undefined
            }
          >
            {scope.requisitions.length ? 'Try another status or clear the filters.' : 'Raise a requisition to start hiring: decode the JD, plan the loop and route it for headcount approval.'}
          </EmptyState>
        </div>
      ) : effectiveView === 'cards' ? (
        <div className="tl-req-grid">
          {list.map((r, i) => (
            <ReqCard
              key={r.id}
              req={r}
              apps={byReq.get(r.id) ?? []}
              candById={candById}
              now={now}
              approval={r.status === 'pending-approval' && viewer ? canApproveRequisition(viewer, r) : null}
              onApprove={() => approve(r)}
              onSubmit={canSubmit(r) ? () => submit(r) : undefined}
              style={{ '--i': i } as CSSProperties}
            />
          ))}
        </div>
      ) : (
        <ReqTable list={list} byReq={byReq} now={now} viewer={viewer} onApprove={approve} />
      )}
      {note.dialog}
    </section>
  );
}

function ReqTable({
  list,
  byReq,
  now,
  viewer,
  onApprove,
}: {
  list: Requisition[];
  byReq: Map<string, Application[]>;
  now: number;
  viewer: TalentViewer | null;
  onApprove: (r: Requisition) => void;
}) {
  const navigate = useNavigate();
  return (
    <div className="table-wrap tl-req-tablewrap">
      <table className="table tl-req-table">
        <thead>
          <tr>
            <th scope="col">Requisition</th>
            <th scope="col">Status</th>
            <th scope="col">Seats</th>
            <th scope="col">Pipeline</th>
            <th scope="col" className="tl-req-col--md">
              Match
            </th>
            <th scope="col">Open</th>
            <th scope="col" className="tl-req-col--lg">
              Team
            </th>
            <th scope="col" className="tl-req-col--lg">
              Salary
            </th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => {
            const apps = byReq.get(r.id) ?? [];
            const active = apps.filter((a) => a.status === 'active').length;
            const avg = avgMatch(apps);
            const open = daysOpen(r, now);
            const approval = r.status === 'pending-approval' && viewer ? canApproveRequisition(viewer, r) : null;
            return (
              <tr key={r.id} className="tl-req-row" onClick={() => navigate(`/talent/requisitions/${r.id}`)}>
                <td>
                  <div className="tl-req-row__title">
                    <Link to={`/talent/requisitions/${r.id}`} onClick={(e) => e.stopPropagation()}>
                      {r.title}
                    </Link>
                    <span className="faint text-xs">
                      {r.department} · {r.location} · {WORK_MODEL_LABEL[r.workModel]} · <span className="mono">{r.band}</span>
                    </span>
                  </div>
                </td>
                <td>
                  <div className="tl-req-row__badges">
                    <ReqStatusBadge status={r.status} />
                    <PriorityBadge priority={r.priority} />
                    {approval?.ok && (
                      <button
                        type="button"
                        className="btn btn--sm btn--primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          onApprove(r);
                        }}
                      >
                        <ShieldCheck /> Approve
                      </button>
                    )}
                  </div>
                </td>
                <td>
                  <SeatMeter hires={r.hires} headcount={r.headcount} />
                </td>
                <td className="tl-req-row__pipe">
                  <ReqPipelineBar apps={apps} />
                  <span className="faint text-xs">{active ? `${active} active` : 'No candidates'}</span>
                </td>
                <td className="tl-req-col--md">{avg !== null ? <MatchRing score={avg} size={32} stroke={3} /> : <span className="faint">—</span>}</td>
                <td className="mono tl-req-row__days">{open !== null ? `${open}d` : <span className="faint">raised {daysSince(r.createdAt, now)}d ago</span>}</td>
                <td className="tl-req-col--lg">
                  <PeopleStack userIds={[r.hiringManagerId, r.recruiterId].filter(Boolean)} size={24} />
                </td>
                <td className="tl-req-col--lg tl-req-row__salary">
                  <CompRange salary={r.salary} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
