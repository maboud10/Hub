/**
 * Pipeline (/talent/pipeline) — every candidate in flight across the
 * requisitions you can see, as a phase-grouped Kanban board or a sortable
 * list. `?req=<id>` pre-filters to one requisition and stays in the URL.
 * Moves always go through the gate-checklist dialog.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ArrowUpRight, Briefcase, Hand, LayoutList, MousePointerClick, Radar, Search, SearchX, SquareKanban, Users, X, Zap } from 'lucide-react';
import type { Interview, Outreach, Requisition, Scorecard } from '@/talent/types';
import { WORK_MODEL_LABEL } from '@/talent/constants';
import { useNextActions, useTalentCaps, useTalentLookups, useTalentScope } from '@/talent/selectors';
import { useTalent } from '@/talent/store';
import { useNow } from '@/hooks/useNow';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { EmptyState, Segmented, Switch } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { PersonChip, PriorityBadge, ReqStatusBadge } from './components/shared';
import { daysInStage, slaState } from './components/format';
import { PipelineBoard } from './pipeline/PipelineBoard';
import { PipelineList } from './pipeline/PipelineList';
import type { PipeRow } from './pipeline/PipelineCard';
import { PHASE_GROUPS, hueVars, isClosedApp } from './pipeline/pipelineUtils';

type View = 'board' | 'list';
const VIEW_KEY = 'nexus.talent.pipeline.view';

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'board';
  } catch {
    return 'board';
  }
}

const REQ_GROUPS: { label: string; match: (r: Requisition) => boolean }[] = [
  { label: 'Open', match: (r) => r.status === 'open' },
  { label: 'On hold', match: (r) => r.status === 'on-hold' },
  { label: 'Awaiting approval & drafts', match: (r) => r.status === 'pending-approval' || r.status === 'draft' },
  { label: 'Filled & closed', match: (r) => r.status === 'filled' || r.status === 'closed' },
];

export function PipelineTab() {
  const scope = useTalentScope();
  const { candById, reqById } = useTalentLookups();
  const actions = useNextActions();
  const interviews = useTalent((s) => s.interviews);
  const scorecards = useTalent((s) => s.scorecards);
  const outreach = useTalent((s) => s.outreach);
  const caps = useTalentCaps();
  const now = useNow(60_000);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [q, setQ] = useState('');
  const [needsAction, setNeedsAction] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [view, setView] = useState<View>(readView);
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* private mode: keep the in-memory choice */
    }
  }, [view]);

  const reqParam = params.get('req');
  const reqFilter = reqParam && scope.reqIds.has(reqParam) ? reqParam : 'all';
  const unknownReq = !!reqParam && !scope.reqIds.has(reqParam) && scope.requisitions.length > 0;
  const req = reqFilter === 'all' ? undefined : reqById.get(reqFilter);
  const setReqFilter = (id: string) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (id === 'all') p.delete('req');
        else p.set('req', id);
        return p;
      },
      { replace: true },
    );

  // ── derived indicators per application
  const ivByApp = useMemo(() => {
    const m = new Map<string, Interview[]>();
    for (const i of interviews) {
      if (i.status === 'cancelled') continue;
      const list = m.get(i.applicationId);
      if (list) list.push(i);
      else m.set(i.applicationId, [i]);
    }
    return m;
  }, [interviews]);
  const cardsByApp = useMemo(() => {
    const m = new Map<string, Scorecard[]>();
    for (const s of scorecards) {
      const list = m.get(s.applicationId);
      if (list) list.push(s);
      else m.set(s.applicationId, [s]);
    }
    return m;
  }, [scorecards]);
  const outreachByKey = useMemo(() => {
    const m = new Map<string, Outreach>();
    for (const o of outreach) {
      if (o.status === 'draft') continue;
      const key = `${o.candidateId}|${o.requisitionId ?? ''}`;
      const prev = m.get(key);
      if (!prev || (o.sentAt ?? o.createdAt) > (prev.sentAt ?? prev.createdAt)) m.set(key, o);
    }
    return m;
  }, [outreach]);

  const rows = useMemo<PipeRow[]>(
    () =>
      scope.applications.map((app) => {
        const ivs = ivByApp.get(app.id) ?? [];
        const cards = cardsByApp.get(app.id) ?? [];
        const action = actions.get(app.id);
        const upcoming = ivs.filter((i) => i.scheduledAt > now).sort((a, b) => a.scheduledAt - b.scheduledAt)[0];
        return {
          app,
          cand: candById.get(app.candidateId),
          req: reqById.get(app.requisitionId),
          action,
          needsAction: (app.status === 'active' || app.status === 'hired') && !!action && action.kind !== 'none' && !action.waiting,
          days: daysInStage(app, now),
          sla: app.status === 'active' ? slaState(app, now) : 'ok',
          ivTotal: ivs.length,
          ivDone: ivs.filter((i) => i.status === 'completed' || i.scheduledAt + i.durationMins * 60_000 < now).length,
          nextIv: upcoming?.scheduledAt,
          cards: cards.length,
          cardsPositive: cards.filter((c) => c.recommendation === 'yes' || c.recommendation === 'strong-yes').length,
          outreach: outreachByKey.get(`${app.candidateId}|${app.requisitionId}`) ?? outreachByKey.get(`${app.candidateId}|`),
          closedAt: app.status === 'active' ? undefined : app.status === 'hired' ? app.stageEnteredAt : (app.rejection?.at ?? app.updatedAt),
        };
      }),
    [scope.applications, ivByApp, cardsByApp, actions, candById, reqById, outreachByKey, now],
  );

  // ── filters
  const needle = q.trim().toLowerCase();
  const base = useMemo(
    () =>
      rows.filter((r) => {
        if (reqFilter !== 'all' && r.app.requisitionId !== reqFilter) return false;
        if (isClosedApp(r.app) && !showClosed) return false;
        if (needle) {
          const c = r.cand;
          const hay = [c?.name, c?.currentTitle, c?.currentCompany, c?.headline, ...(c?.skills ?? []), r.req?.title].join(' ').toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      }),
    [rows, reqFilter, showClosed, needle],
  );
  const needsCount = base.filter((r) => r.needsAction).length;
  const visible = useMemo(() => {
    const list = needsAction ? base.filter((r) => r.needsAction) : base;
    const slaRank = { stale: 0, warn: 1, ok: 2 } as const;
    return [...list].sort(
      (a, b) =>
        Number(isClosedApp(a.app)) - Number(isClosedApp(b.app)) ||
        Number(!a.action?.urgent) - Number(!b.action?.urgent) ||
        slaRank[a.sla] - slaRank[b.sla] ||
        (b.app.match?.score ?? -1) - (a.app.match?.score ?? -1) ||
        (a.cand?.name ?? '').localeCompare(b.cand?.name ?? ''),
    );
  }, [base, needsAction]);

  // ── telemetry for the current requisition filter
  const inScope = useMemo(() => rows.filter((r) => reqFilter === 'all' || r.app.requisitionId === reqFilter), [rows, reqFilter]);
  const live = inScope.filter((r) => r.app.status === 'active');
  const stale = live.filter((r) => r.sla === 'stale').length;
  const hired = inScope.filter((r) => r.app.status === 'hired').length;
  const phaseCounts = PHASE_GROUPS.map((g) => ({
    ...g,
    count: inScope.filter((r) => (g.phase === 'Onboard' ? r.app.status === 'hired' : r.app.status === 'active' && g.stages.some((s) => s.id === r.app.stage))).length,
  }));

  const reqGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of scope.applications) if (a.status === 'active') counts.set(a.requisitionId, (counts.get(a.requisitionId) ?? 0) + 1);
    return REQ_GROUPS.map((g) => ({ label: g.label, reqs: scope.requisitions.filter(g.match).map((r) => ({ r, n: counts.get(r.id) ?? 0 })) })).filter((g) => g.reqs.length);
  }, [scope.applications, scope.requisitions]);

  const filtersOn = !!needle || needsAction;
  const clearFilters = () => {
    setQ('');
    setNeedsAction(false);
  };
  const showReq = reqFilter === 'all';

  return (
    <div className="tl-pipe">
      {req && (
        <section className="tl-pipe-context hud" aria-label="Requisition filter">
          <div className="tl-pipe-context__main">
            <span className="tl-pipe-context__eyebrow">Pipeline for</span>
            <div className="tl-pipe-context__titlerow">
              <h2 className="tl-pipe-context__title">{req.title}</h2>
              <ReqStatusBadge status={req.status} />
              <PriorityBadge priority={req.priority} />
            </div>
            <div className="tl-pipe-context__meta">
              <span>{req.department}</span>
              <span>
                {req.location} · {WORK_MODEL_LABEL[req.workModel]}
              </span>
              <span>
                {req.hires}/{req.headcount} filled
              </span>
              <span className="tl-pipe-context__people">
                HM <PersonChip userId={req.hiringManagerId} />
              </span>
              <span className="tl-pipe-context__people">
                Recruiter <PersonChip userId={req.recruiterId} />
              </span>
            </div>
          </div>
          <div className="tl-pipe-context__actions">
            <button type="button" className="btn btn--sm" onClick={() => navigate(`/talent/requisitions/${req.id}`)}>
              <ArrowUpRight aria-hidden="true" /> Requisition
            </button>
            {caps.source && req.status === 'open' && (
              <button type="button" className="btn btn--sm btn--primary" onClick={() => navigate(`/talent/sourcing?req=${req.id}`)}>
                <Radar aria-hidden="true" /> Source more
              </button>
            )}
            <button type="button" className="icon-btn icon-btn--sm" onClick={() => setReqFilter('all')} aria-label="Show all requisitions" title="Show all requisitions">
              <X />
            </button>
          </div>
        </section>
      )}

      <section className="tl-pipe-toolbar glass" aria-label="Pipeline filters">
        <div className="tl-pipe-toolbar__top">
          <div className="tl-pipe-telemetry" role="status" aria-live="polite">
            <span className="tl-pipe-telemetry__title">Pipeline</span>
            <span className="tl-pipe-stat">
              <b>{live.length}</b> in flight
            </span>
            <span className={cx('tl-pipe-stat', stale > 0 && 'is-warn')}>
              <b>{stale}</b> over SLA
            </span>
            <span className="tl-pipe-stat">
              <b>{hired}</b> hired
            </span>
          </div>
          <div className="tl-pipe-legend" aria-label="Phases">
            {phaseCounts.map((p) => (
              <span key={p.phase} className="tl-pipe-legend__item" style={hueVars(p.hue)} title={p.blurb}>
                <i aria-hidden="true" />
                {p.phase}
                <b>{p.count}</b>
              </span>
            ))}
          </div>
          <Segmented<View>
            value={view}
            onChange={setView}
            label="Pipeline view"
            options={[
              { value: 'board', label: <span className="tl-pipe-seg-label">Board</span>, icon: <SquareKanban aria-hidden="true" />, title: 'Kanban board' },
              { value: 'list', label: <span className="tl-pipe-seg-label">List</span>, icon: <LayoutList aria-hidden="true" />, title: 'Table' },
            ]}
          />
        </div>
        <div className="tl-pipe-toolbar__filters">
          <label className="tl-pipe-reqselect">
            <Briefcase aria-hidden="true" />
            <span className="sr-only">Requisition</span>
            <select className="select" value={reqFilter} onChange={(e) => setReqFilter(e.target.value)}>
              <option value="all">All requisitions</option>
              {reqGroups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.reqs.map(({ r, n }) => (
                    <option key={r.id} value={r.id}>
                      {r.title} · {n} active
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="input-wrap tl-pipe-search">
            <Search aria-hidden="true" />
            <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, title or skill" aria-label="Search candidates by name, title or skill" />
            {q && (
              <button type="button" className="icon-btn icon-btn--sm input-trail" onClick={() => setQ('')} aria-label="Clear search">
                <X />
              </button>
            )}
          </div>
          <button type="button" className={cx('chip tl-pipe-toggle', needsAction && 'is-active')} aria-pressed={needsAction} onClick={() => setNeedsAction((v) => !v)}>
            <Zap aria-hidden="true" />
            Needs action
            <span className="count">{needsCount}</span>
          </button>
          <label className="tl-pipe-switch">
            <Switch checked={showClosed} onChange={setShowClosed} label="Show closed applications" />
            <span>Show closed</span>
          </label>
        </div>
        {unknownReq && (
          <p className="tl-pipe-notice" role="note">
            That requisition isn’t visible to you (or no longer exists), so you’re seeing all requisitions.
          </p>
        )}
      </section>

      <p className="sr-only" role="status">
        {visible.length} candidate{visible.length === 1 ? '' : 's'} shown
      </p>

      {scope.applications.length === 0 ? (
        <div className="card tl-pipe-empty">
          <EmptyState
            icon={<Users />}
            title={caps.manage || caps.source ? 'Your pipeline is waiting for its first candidate' : 'No candidates on your requisitions yet'}
            action={
              caps.source ? (
                <div className="row row--wrap" style={{ justifyContent: 'center' }}>
                  <button type="button" className="btn btn--primary" onClick={() => navigate('/talent/sourcing')}>
                    <Radar aria-hidden="true" /> Source from a JD
                  </button>
                  <button type="button" className="btn" onClick={() => navigate('/talent/candidates')}>
                    <Users aria-hidden="true" /> Browse the talent pool
                  </button>
                </div>
              ) : undefined
            }
          >
            {caps.manage || caps.source
              ? 'Decode a job description, shortlist people with AI matching and add them here. Every move is guided by a gate checklist.'
              : 'Your recruiter adds candidates as they are sourced. You’ll see them here as soon as they reach your requisitions.'}
          </EmptyState>
        </div>
      ) : visible.length === 0 ? (
        <div className="card tl-pipe-empty">
          {filtersOn ? (
            <EmptyState
              icon={<SearchX />}
              title="No candidates match these filters"
              action={
                <button type="button" className="btn" onClick={clearFilters}>
                  <X aria-hidden="true" /> Clear filters
                </button>
              }
            >
              {needsAction && !needle ? 'Nothing needs your action right now. Everything else is waiting on candidates or colleagues.' : 'Try a different name, title or skill.'}
            </EmptyState>
          ) : (
            <EmptyState
              icon={<Briefcase />}
              title={req ? `No candidates in ${req.title} yet` : 'Nothing to show'}
              action={
                req && (caps.source || caps.manage) ? (
                  <div className="row row--wrap" style={{ justifyContent: 'center' }}>
                    {caps.source && req.status === 'open' && (
                      <button type="button" className="btn btn--primary" onClick={() => navigate(`/talent/sourcing?req=${req.id}`)}>
                        <Radar aria-hidden="true" /> Source candidates
                      </button>
                    )}
                    <button type="button" className="btn" onClick={() => navigate('/talent/candidates')}>
                      <Users aria-hidden="true" /> Add from talent pool
                    </button>
                  </div>
                ) : undefined
              }
            >
              {req ? 'Source people from the decoded JD or add silver medalists from the talent pool.' : 'Turn on “Show closed” to see closed applications.'}
            </EmptyState>
          )}
        </div>
      ) : view === 'board' ? (
        <>
          <PipelineBoard rows={visible} showReq={showReq} />
          <p className="tl-pipe-tip">
            {isMobile ? <Hand aria-hidden="true" /> : <MousePointerClick aria-hidden="true" />}
            {isMobile
              ? 'Tap a stage chip to switch columns. Long-press a card and drop it on a chip to move it, or use the move button.'
              : 'Drag a card to another stage: nothing moves until you review the gate checklist. Keyboard: focus the grip, press Space, then use ← →.'}
          </p>
        </>
      ) : (
        <PipelineList rows={visible} showReq={showReq} />
      )}
    </div>
  );
}
