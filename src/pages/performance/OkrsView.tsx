/**
 * OKRs — Align. Company → team → individual objectives with live status and
 * forecasts: an alignment tree, team groups, "mine", and the Goal Galaxy
 * (signature) with an inspector. Search, status/department filters, Q3 history.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  ArrowRight,
  Building2,
  ChevronDown,
  Compass,
  Download,
  Ellipsis,
  Flame,
  GitBranch,
  Link2,
  Lock,
  Orbit,
  Plus,
  Sparkles,
  Target,
  TriangleAlert,
  Unlink,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';
import { Bar, NeoEmpty, NeoHead, NeoMenu, NeoSearch, NeoStage, NeoTabs, NovaChip } from '@/components/neo';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { downloadCsv } from '@/lib/csv';
import { fuzzyScore } from '@/lib/fuzzy';
import { toast } from '@/store/toast';
import { canViewObjective } from '@/performance/access';
import { STATUS_META } from '@/performance/constants';
import { checkinDue, checkinStreak, elapsed, forecastKr, formatValue, krProgress, objectiveScore, rollupStatus, scoreLabel } from '@/performance/okr';
import { currentPeriod, myCheckinKrs, rollup, visibleObjectives, type ObjectiveRollup } from '@/performance/selectors';
import { usePerf } from '@/performance/store';
import type { KeyResult, KrStatus, Objective, Period } from '@/performance/types';
import { GalaxyLegend, GoalGalaxy } from './GoalGalaxy';
import { ObjectiveEditor } from './ObjectiveEditor';
import { shortDate, useMinute, usePerfCtx, useSearchFlag, type PerfCtx } from './hooks';
import { Confidence, Face, LevelChip, OkrRing, Seg, StatusChip, StatusIcon, pctText } from './ui';
import './styles/okrs.css';

type Tab = 'company' | 'team' | 'mine' | 'galaxy';
type StatusFilter = 'all' | 'attention' | KrStatus;

const TABS: Tab[] = ['company', 'team', 'mine', 'galaxy'];
const STATUS_ORDER: KrStatus[] = ['off-track', 'at-risk', 'on-track', 'done'];
const bySeverity = (a: ObjectiveRollup, b: ObjectiveRollup) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.o.title.localeCompare(b.o.title);

const owns = (o: Pick<Objective, 'ownerId' | 'coOwnerIds'>, id: string) => o.ownerId === id || o.coOwnerIds.includes(id);

export function OkrsView() {
  const ctx = usePerfCtx();
  const now = useMinute();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [isNew, clearNew, openNew] = useSearchFlag('new');
  const [, , openCheckin] = useSearchFlag('checkin');
  const data = usePerf();
  const current = currentPeriod(data, now);
  const periodParam = params.get('period');
  const period = data.periods.find((p) => p.id === periodParam) ?? current;
  const isCurrent = period.id === current.id;
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [dept, setDept] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => (ctx ? visibleObjectives(data, ctx.v, ctx.users, period.id).map((o) => rollup(data, o, now)) : []), [data, ctx, period.id, now]);
  const myKrs = useMemo(() => (ctx ? myCheckinKrs(data, ctx.me.id, current.id) : []), [data, ctx, current.id]);

  const mine = ctx ? rows.filter((r) => owns(r.o, ctx.me.id)) : [];
  const tabParam = params.get('view') === 'galaxy' ? 'galaxy' : params.get('tab');
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : mine.length ? 'mine' : 'company';

  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (value === null) n.delete(key);
        else n.set(key, value);
        if (key === 'tab') n.delete('view');
        return n;
      },
      { replace: true },
    );

  useHotkeys(
    {
      c: (e) => {
        e.preventDefault();
        openNew('1');
      },
      s: (e) => {
        e.preventDefault();
        searchRef.current?.focus();
      },
    },
    !isNew,
  );

  const departments = useMemo(() => [...new Set(rows.map((r) => r.o.department).filter((d): d is NonNullable<typeof d> => !!d))].sort(), [rows]);

  if (!ctx) return null;

  const query = q.trim();
  const matchQ = (r: ObjectiveRollup) => !query || !!fuzzyScore(query, r.o.title, [ctx.name(r.o.ownerId), r.o.department ?? '', ...r.o.tags, ...r.krs.map((k) => k.title)]);
  const matchStatus = (r: ObjectiveRollup) => status === 'all' || (status === 'attention' ? r.status === 'at-risk' || r.status === 'off-track' : r.status === status);
  const matchDept = (r: ObjectiveRollup) => dept === 'all' || r.o.department === dept;
  const filtering = !!query || status !== 'all' || dept !== 'all';
  const matches = (r: ObjectiveRollup) => matchQ(r) && matchStatus(r) && matchDept(r);
  const exp = elapsed(period, now);

  const scope = tab === 'company' ? rows : tab === 'team' ? rows.filter((r) => r.o.level !== 'company') : tab === 'mine' ? mine : rows;

  const exportCsv = () => {
    const out = scope.filter(matches).flatMap((r) =>
      r.krs.map((k) => ({
        Objective: r.o.title,
        Level: r.o.level,
        Owner: ctx.name(r.o.ownerId),
        Department: r.o.department ?? '',
        Period: r.period.label,
        'Objective status': STATUS_META[r.status].label,
        'Key result': k.title,
        Current: formatValue(k, k.current),
        Target: formatValue(k, k.target),
        Progress: `${Math.round(krProgress(k) * 100)}%`,
        Confidence: k.confidence,
        'KR status': STATUS_META[r.statuses[k.id]].label,
      })),
    );
    if (!out.length) {
      toast.info('Nothing to export', 'Clear the filters and try again.');
      return;
    }
    downloadCsv(`okrs-${period.id}-${tab}.csv`, out);
    toast.success('Exported', `${out.length} key results`);
  };

  const tabItems = [
    { value: 'company' as const, label: 'Company', icon: <Building2 />, count: rows.filter((r) => r.o.level === 'company').length },
    { value: 'team' as const, label: 'Teams', icon: <Users />, count: rows.filter((r) => r.o.level !== 'company').length },
    { value: 'mine' as const, label: 'Mine', icon: <UserIcon />, count: mine.length },
    { value: 'galaxy' as const, label: 'Galaxy', icon: <Orbit /> },
  ];

  return (
    <NeoStage label="OKRs">
      <NeoHead
        icon={<Target />}
        eyebrow={
          <>
            {period.label}
            <span aria-hidden="true"> · </span>
            {isCurrent ? `${pctText(exp)} of the quarter gone` : 'Closed quarter'}
          </>
        }
        title="OKRs"
        sub="Align on what matters — company, teams and you."
        center={
          <Seg
            size="sm"
            label="Quarter"
            value={period.id}
            onChange={(id) => setParam('period', id === current.id ? null : id)}
            options={[...data.periods].reverse().map((p) => ({ value: p.id, label: p.label, title: p.id === current.id ? 'Current quarter' : `${p.label} history` }))}
          />
        }
        actions={
          <>
            {myKrs.length > 0 && (
              <button type="button" className="neo-btn neo-btn--soft" onClick={() => openCheckin('1')} data-tip="Weekly check-in (I)">
                <Target />
                <span className="neo-btn__label">Check in</span>
              </button>
            )}
            <button type="button" className="neo-btn neo-btn--plasma" onClick={() => openNew('1')} data-qa="okr-new" data-tip="New objective (C)">
              <Plus />
              <span className="neo-btn__label">New objective</span>
            </button>
            <NeoMenu
              label="More OKR actions"
              items={[
                { label: 'Export CSV', icon: <Download />, onSelect: exportCsv },
                {
                  label: 'Copy link to this view',
                  icon: <Link2 />,
                  onSelect: () => {
                    void navigator.clipboard?.writeText(window.location.href).then(
                      () => toast.success('Link copied'),
                      () => toast.error('Couldn’t copy the link'),
                    );
                  },
                },
                { kind: 'sep' },
                { label: 'Weekly check-in', icon: <Target />, hint: 'I', onSelect: () => openCheckin('1') },
                { label: 'Open the Goal Galaxy', icon: <Orbit />, onSelect: () => setParam('tab', 'galaxy') },
              ]}
              trigger={(p) => (
                <button {...p} type="button" className="neo-iconbtn" aria-label="More OKR actions">
                  <Ellipsis />
                </button>
              )}
            />
          </>
        }
      />
      <div className="neo-toolbar pf-ok-toolbar">
        <NeoTabs value={tab} onChange={(t) => setParam('tab', t)} items={tabItems} label="OKR views" />
        <span className="pf-spacer" />
        <NeoSearch value={q} onChange={setQ} placeholder="Search objectives, people, tags" kbd="S" inputRef={searchRef} size="sm" className="pf-ok-search" label="Search objectives" />
        <select className="neo-select neo-select--sm" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Filter by status">
          <option value="all">All statuses</option>
          <option value="attention">Needs attention</option>
          <option value="on-track">On track</option>
          <option value="at-risk">At risk</option>
          <option value="off-track">Off track</option>
          <option value="done">Done</option>
        </select>
        {(tab === 'team' || tab === 'galaxy' || tab === 'company') && departments.length > 1 && (
          <select className="neo-select neo-select--sm" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Filter by department">
            <option value="all">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}
      </div>

      {tab === 'galaxy' ? (
        <GalaxyPanel ctx={ctx} rows={rows} period={period} now={now} matches={filtering ? new Set(rows.filter(matches).map((r) => r.o.id)) : null} selected={selected} onSelect={setSelected} />
      ) : (
        <div className="neo-body neo-pad pf-ok">
          {scope.length > 0 && !(tab === 'mine' && isCurrent) && (
            <StatusSpectrum
              rows={scope}
              exp={isCurrent ? exp : null}
              active={status}
              onPick={(s) => setStatus((cur) => (cur === s ? 'all' : s))}
              label={tab === 'mine' ? 'Your objectives' : tab === 'team' ? 'Team & individual objectives' : 'All objectives'}
            />
          )}
          {tab === 'mine' && <MineTab ctx={ctx} rows={rows} mine={mine} period={period} isCurrent={isCurrent} now={now} myKrs={myKrs} matches={matches} filtering={filtering} onCheckin={() => openCheckin('1')} onNew={() => openNew('1')} onBrowse={() => setParam('tab', 'company')} />}
          {tab === 'company' && <AlignmentTree ctx={ctx} rows={rows} now={now} matches={matches} filtering={filtering} />}
          {tab === 'team' && <TeamGroups ctx={ctx} rows={rows.filter((r) => r.o.level !== 'company')} now={now} matches={matches} filtering={filtering} />}
          {filtering && scope.length > 0 && !scope.some(matches) && (
            <NeoEmpty
              icon={<Compass />}
              title="No objectives match"
              action={
                <button
                  type="button"
                  className="neo-btn neo-btn--soft"
                  onClick={() => {
                    setQ('');
                    setStatus('all');
                    setDept('all');
                  }}
                >
                  <X /> Clear filters
                </button>
              }
            >
              Try another search, status or department.
            </NeoEmpty>
          )}
        </div>
      )}

      <ObjectiveEditor
        open={!!isNew}
        onClose={clearNew}
        defaults={{ periodId: isCurrent ? period.id : current.id }}
        onSaved={(id) => {
          clearNew();
          navigate(`/performance/okrs/${id}`);
        }}
      />
    </NeoStage>
  );
}

/* ───────── Status spectrum ───────── */

function StatusSpectrum({ rows, exp, active, onPick, label }: { rows: ObjectiveRollup[]; exp: number | null; active: StatusFilter; onPick: (s: KrStatus) => void; label: string }) {
  const counts = STATUS_ORDER.map((s) => ({ s, n: rows.filter((r) => r.status === s).length }));
  const avg = rows.length ? rows.reduce((t, r) => t + r.progress, 0) / rows.length : 0;
  return (
    <section className="pf-spec" aria-label={`${label}: status overview`}>
      <div className="pf-spec__top">
        <span className="neo-hud">{label}</span>
        <span className="pf-spacer" />
        <span className="pf-spec__avg">
          Avg progress <b className="neo-num">{pctText(avg)}</b>
          {exp !== null && <span className="pf-faint"> · {pctText(exp)} of the quarter gone</span>}
        </span>
      </div>
      <div className="pf-spec__bar" role="img" aria-label={counts.map((c) => `${c.n} ${STATUS_META[c.s].label}`).join(', ')}>
        {counts
          .filter((c) => c.n)
          .map((c) => (
            <span key={c.s} data-status={c.s} style={{ flexGrow: c.n }} />
          ))}
      </div>
      <div className="pf-spec__legend">
        {counts.map((c) => (
          <button key={c.s} type="button" className="pf-spec__item" data-status={c.s} aria-pressed={active === c.s} onClick={() => onPick(c.s)} disabled={!c.n} title={`Show ${STATUS_META[c.s].label.toLowerCase()} only`}>
            <StatusIcon status={c.s} />
            <b>{c.n}</b> {STATUS_META[c.s].label}
          </button>
        ))}
      </div>
    </section>
  );
}

/* ───────── Objective card ───────── */

function KrLine({ kr, status, period, now }: { kr: KeyResult; status: KrStatus; period: Period; now: number }) {
  const exp = elapsed(period, now);
  const showExpected = kr.metric !== 'boolean' && !kr.ceiling && status !== 'done' && now < period.end;
  const f = forecastKr(kr, period, now);
  const tip =
    status === 'done' ? 'Target reached' : kr.metric === 'boolean' ? `Confidence ${kr.confidence}/10` : `Forecast ${formatValue(kr, f.value)} by ${shortDate(period.end)} · target ${formatValue(kr, kr.target)}`;
  return (
    <li className="pf-kl" data-status={status}>
      <span className="pf-kl__st" role="img" aria-label={STATUS_META[status].label} title={STATUS_META[status].label}>
        <StatusIcon status={status} />
      </span>
      <span className="pf-kl__title">{kr.title}</span>
      <span className="pf-kl__bar">
        <Bar value={krProgress(kr)} fill={`rgb(${STATUS_META[status].rgb})`} label={`${kr.title}: ${Math.round(krProgress(kr) * 100)}%`} />
        {showExpected && <i className="pf-kl__exp" style={{ left: `${exp * 100}%` }} title={`Expected by today: ${pctText(exp)}`} aria-hidden="true" />}
      </span>
      <span className="pf-kl__val neo-mono" data-tip={tip}>
        {formatValue(kr, kr.current, { unit: false })}
        <span className="pf-faint"> / {formatValue(kr, kr.target)}</span>
      </span>
      <Confidence value={kr.confidence} compact />
    </li>
  );
}

export function ObjectiveCard({ ctx, r, now, parent, aligned, showParent = true }: { ctx: PerfCtx; r: ObjectiveRollup; now: number; parent?: Objective; aligned?: number; showParent?: boolean }) {
  const closed = r.o.state === 'closed';
  const score = closed ? objectiveScore(r.krs) : null;
  const to = `/performance/okrs/${r.o.id}`;
  const co = r.o.coOwnerIds.filter((id) => ctx.user(id));
  return (
    <article className="neo-card neo-spot pf-oc" data-status={r.status} data-level={r.o.level}>
      <header className="pf-oc__head">
        <OkrRing value={r.progress} status={r.status} size={56} />
        <div className="pf-oc__titles">
          <div className="pf-oc__chips">
            <LevelChip level={r.o.level} />
            <StatusChip status={r.status} />
            {r.o.visibility === 'private' && (
              <span className="pf-oc__private" title="Private: visible to owners, their managers and People Ops">
                <Lock aria-hidden="true" /> Private
              </span>
            )}
            {score !== null && (
              <span className="pf-oc__score" title={`Graded ${score.toFixed(1)} — ${scoreLabel(score)}`}>
                {score.toFixed(1)} · {scoreLabel(score)}
              </span>
            )}
          </div>
          <h3 className="pf-oc__title">
            <Link to={to} className="pf-oc__link">
              {r.o.title}
            </Link>
          </h3>
          {showParent && parent && (
            <div className="pf-oc__parent">
              <GitBranch aria-hidden="true" /> Aligns to <Link to={`/performance/okrs/${parent.id}`}>{parent.title}</Link>
            </div>
          )}
        </div>
        <div className="pf-oc__owners">
          <Face ctx={ctx} id={r.o.ownerId} size={28} title={`Owner: ${ctx.name(r.o.ownerId)}`} />
          {co.slice(0, 2).map((id) => (
            <Face key={id} ctx={ctx} id={id} size={24} title={`Co-owner: ${ctx.name(id)}`} />
          ))}
        </div>
      </header>
      {r.krs.length > 0 ? (
        <ul className="pf-oc__krs" aria-label="Key results">
          {r.krs.map((k) => (
            <KrLine key={k.id} kr={k} status={r.statuses[k.id]} period={r.period} now={now} />
          ))}
        </ul>
      ) : (
        <p className="pf-oc__nokr">No key results yet — add 2–4 measurable outcomes.</p>
      )}
      <footer className="pf-oc__foot">
        <span className="pf-oc__owner">{ctx.name(r.o.ownerId)}</span>
        {r.o.department && <span className="pf-faint">· {r.o.department}</span>}
        {aligned ? (
          <span className="pf-oc__aligned" title={`${aligned} objective${aligned === 1 ? '' : 's'} ladder up to this`}>
            <GitBranch aria-hidden="true" /> {aligned} aligned
          </span>
        ) : null}
        <span className="pf-spacer" />
        {r.o.tags.slice(0, 3).map((t) => (
          <span key={t} className="pf-tag">
            #{t}
          </span>
        ))}
        <ArrowRight className="pf-oc__go" aria-hidden="true" />
      </footer>
    </article>
  );
}

/* ───────── Compact row (tree nodes) ───────── */

function ObjectiveRow({ ctx, r, depth = 0, children }: { ctx: PerfCtx; r: ObjectiveRollup; depth?: number; children?: ReactNode }) {
  return (
    <div className="pf-tn" style={{ ['--depth' as string]: depth }}>
      <Link to={`/performance/okrs/${r.o.id}`} className="pf-tn__row" data-status={r.status}>
        <OkrRing value={r.progress} status={r.status} size={38} stroke={4} />
        <span className="pf-tn__text">
          <span className="pf-tn__title">{r.o.title}</span>
          <span className="pf-tn__sub">
            {r.o.level === 'team' ? 'Team' : 'Individual'} · {ctx.name(r.o.ownerId)} · {r.krs.length} KR{r.krs.length === 1 ? '' : 's'}
          </span>
        </span>
        <StatusChip status={r.status} className="pf-tn__status" />
        <Face ctx={ctx} id={r.o.ownerId} size={26} />
      </Link>
      {children}
    </div>
  );
}

/* ───────── Company: alignment tree ───────── */

function AlignmentTree({ ctx, rows, now, matches, filtering }: { ctx: PerfCtx; rows: ObjectiveRollup[]; now: number; matches: (r: ObjectiveRollup) => boolean; filtering: boolean }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const byId = useMemo(() => new Map(rows.map((r) => [r.o.id, r])), [rows]);
  const kids = useMemo(() => {
    const m = new Map<string, ObjectiveRollup[]>();
    for (const r of rows) if (r.o.parentId && byId.has(r.o.parentId)) m.set(r.o.parentId, [...(m.get(r.o.parentId) ?? []), r]);
    for (const list of m.values()) list.sort((a, b) => (a.o.level === b.o.level ? bySeverity(a, b) : a.o.level === 'team' ? -1 : 1));
    return m;
  }, [rows, byId]);

  // keep = matches + their ancestors (so a match deep in the tree stays reachable)
  const keep = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      if (!matches(r)) continue;
      let cur: ObjectiveRollup | undefined = r;
      while (cur && !s.has(cur.o.id)) {
        s.add(cur.o.id);
        cur = cur.o.parentId ? byId.get(cur.o.parentId) : undefined;
      }
    }
    return s;
  }, [rows, matches, byId]);

  const roots = rows.filter((r) => r.o.level === 'company').sort(bySeverity);
  const unaligned = rows.filter((r) => r.o.level !== 'company' && (!r.o.parentId || !byId.has(r.o.parentId))).sort(bySeverity);
  const count = (id: string): number => (kids.get(id) ?? []).reduce((n, c) => n + 1 + count(c.o.id), 0);

  const renderKids = (id: string, depth: number): ReactNode => {
    const list = (kids.get(id) ?? []).filter((c) => keep.has(c.o.id));
    if (!list.length) return null;
    return (
      <div className="pf-tree__kids">
        {list.map((c) => (
          <ObjectiveRow key={c.o.id} ctx={ctx} r={c} depth={depth}>
            {renderKids(c.o.id, depth + 1)}
          </ObjectiveRow>
        ))}
      </div>
    );
  };

  if (!roots.length && !unaligned.length)
    return (
      <NeoEmpty icon={<Building2 />} title="No company objectives this quarter">
        Company objectives are set by leadership and People Ops. Team and individual objectives align to them.
      </NeoEmpty>
    );

  return (
    <div className="pf-tree">
      {roots
        .filter((r) => keep.has(r.o.id))
        .map((r) => {
          const n = count(r.o.id);
          const open = filtering || !collapsed.has(r.o.id);
          return (
            <section key={r.o.id} className="pf-tree__branch" aria-label={r.o.title}>
              <ObjectiveCard ctx={ctx} r={r} now={now} aligned={n} />
              {n > 0 && (
                <>
                  <button
                    type="button"
                    className="pf-tree__toggle"
                    aria-expanded={open}
                    onClick={() =>
                      setCollapsed((s) => {
                        const next = new Set(s);
                        if (next.has(r.o.id)) next.delete(r.o.id);
                        else next.add(r.o.id);
                        return next;
                      })
                    }
                  >
                    <ChevronDown aria-hidden="true" />
                    {open ? 'Hide' : 'Show'} {n} aligned objective{n === 1 ? '' : 's'}
                  </button>
                  {open && renderKids(r.o.id, 0)}
                </>
              )}
            </section>
          );
        })}
      {unaligned.some((r) => keep.has(r.o.id)) && (
        <section className="pf-tree__branch pf-tree__branch--loose" aria-label="Not aligned yet">
          <header className="pf-tree__loosehead">
            <span className="pf-section__icon">
              <Unlink />
            </span>
            <div>
              <div className="pf-tree__loosetitle">Not aligned yet</div>
              <div className="pf-faint text-sm">Align these to a company objective so everyone sees how the work ladders up.</div>
            </div>
          </header>
          <div className="pf-tree__kids">
            {unaligned
              .filter((r) => keep.has(r.o.id))
              .map((r) => (
                <ObjectiveRow key={r.o.id} ctx={ctx} r={r}>
                  {renderKids(r.o.id, 1)}
                </ObjectiveRow>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ───────── Teams: grouped by department ───────── */

function TeamGroups({ ctx, rows, now, matches, filtering }: { ctx: PerfCtx; rows: ObjectiveRollup[]; now: number; matches: (r: ObjectiveRollup) => boolean; filtering: boolean }) {
  const data = usePerf();
  const groups = useMemo(() => {
    const m = new Map<string, ObjectiveRollup[]>();
    for (const r of rows) {
      const d = r.o.department ?? ctx.user(r.o.ownerId)?.department ?? 'Other';
      m.set(d, [...(m.get(d) ?? []), r]);
    }
    const mine = ctx.me.department;
    return [...m.entries()].sort((a, b) => (a[0] === mine ? -1 : b[0] === mine ? 1 : a[0].localeCompare(b[0])));
  }, [rows, ctx]);

  if (!rows.length)
    return (
      <NeoEmpty icon={<Users />} title="No team objectives yet">
        Team objectives translate company goals into what each department will deliver.
      </NeoEmpty>
    );

  return (
    <div className="pf-depts">
      {groups.map(([d, list]) => {
        const shown = list.filter(matches);
        if (filtering && !shown.length) return null;
        const items = filtering ? shown : list;
        const teams = items.filter((r) => r.o.level === 'team').sort(bySeverity);
        const people = items.filter((r) => r.o.level === 'individual').sort(bySeverity);
        const avg = list.reduce((t, r) => t + r.progress, 0) / list.length;
        const st = rollupStatus(list.map((r) => r.status));
        return (
          <section key={d} className="pf-dept" aria-label={d}>
            <header className="pf-dept__head">
              <OkrRing value={avg} status={st} size={44} />
              <div className="grow">
                <h3 className="pf-dept__title">{d}</h3>
                <div className="pf-faint text-sm">
                  {teams.length} team · {people.length} individual · avg {pctText(avg)}
                </div>
              </div>
              <StatusChip status={st} />
            </header>
            {teams.length > 0 && (
              <div className="pf-dept__cards">
                {teams.map((r) => (
                  <ObjectiveCard key={r.o.id} ctx={ctx} r={r} now={now} parent={parentOf(data.objectives, r.o, ctx)} aligned={rows.filter((x) => x.o.parentId === r.o.id).length} />
                ))}
              </div>
            )}
            {people.length > 0 && (
              <div className="pf-dept__people">
                <div className="neo-hud">Individual objectives</div>
                {people.map((r) => (
                  <ObjectiveRow key={r.o.id} ctx={ctx} r={r} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function parentOf(all: Objective[], o: Objective, ctx: PerfCtx): Objective | undefined {
  if (!o.parentId) return undefined;
  const p = all.find((x) => x.id === o.parentId);
  return p && canViewObjective(ctx.v, ctx.users, p) ? p : undefined;
}

/* ───────── Mine ───────── */

function MineTab({
  ctx,
  rows,
  mine,
  period,
  isCurrent,
  now,
  myKrs,
  matches,
  filtering,
  onCheckin,
  onNew,
  onBrowse,
}: {
  ctx: PerfCtx;
  rows: ObjectiveRollup[];
  mine: ObjectiveRollup[];
  period: Period;
  isCurrent: boolean;
  now: number;
  myKrs: KeyResult[];
  matches: (r: ObjectiveRollup) => boolean;
  filtering: boolean;
  onCheckin: () => void;
  onNew: () => void;
  onBrowse: () => void;
}) {
  const data = usePerf();
  const mineIds = new Set(mine.map((r) => r.o.id));
  const extra = myKrs.filter((k) => !mineIds.has(k.objectiveId));
  const alignedToMe = rows.filter((r) => r.o.parentId && mineIds.has(r.o.parentId) && !owns(r.o, ctx.me.id));
  const shown = mine.filter(matches).sort(bySeverity);

  if (!mine.length && !extra.length) {
    return (
      <div className="pf-firstokr neo-card neo-spot">
        <div className="pf-firstokr__orb" aria-hidden="true">
          <Compass />
        </div>
        <div className="pf-firstokr__text">
          <div className="neo-hud neo-hud--tint">{period.label}</div>
          <h2 className="pf-firstokr__title">{isCurrent ? 'Set your first OKRs' : `No objectives in ${period.label}`}</h2>
          <p className="pf-muted">
            {isCurrent
              ? 'Write one sentence about what you want to achieve. Nova turns it into an objective with measurable key results and suggests what it should align to.'
              : 'Switch to the current quarter to set objectives.'}
          </p>
          {isCurrent && (
            <div className="pf-row pf-row--wrap">
              <button type="button" className="neo-btn neo-btn--nova" onClick={onNew} data-qa="first-okr">
                <NovaChip>Draft with Nova</NovaChip>
              </button>
              <button type="button" className="neo-btn neo-btn--ghost" onClick={onBrowse}>
                Browse company OKRs <ArrowRight />
              </button>
            </div>
          )}
        </div>
        <ul className="pf-firstokr__tips" aria-label="What makes a great OKR">
          <li>
            <Sparkles aria-hidden="true" /> An objective is qualitative and inspiring.
          </li>
          <li>
            <Target aria-hidden="true" /> 2–4 key results, each a number with a baseline and a target.
          </li>
          <li>
            <GitBranch aria-hidden="true" /> Align it to a team or company objective.
          </li>
        </ul>
      </div>
    );
  }

  return (
    <div className="pf-mine">
      {isCurrent && <MyQuarter ctx={ctx} mine={mine} myKrs={myKrs} now={now} period={period} onCheckin={onCheckin} />}
      {shown.length > 0 && (
        <div className="pf-mine__cards">
          {shown.map((r) => (
            <ObjectiveCard key={r.o.id} ctx={ctx} r={r} now={now} parent={parentOf(data.objectives, r.o, ctx)} aligned={rows.filter((x) => x.o.parentId === r.o.id).length} />
          ))}
        </div>
      )}
      {!filtering && extra.length > 0 && (
        <section className="neo-card pf-section" aria-label="Key results you own on others’ objectives">
          <header className="pf-section__head">
            <span className="pf-section__icon">
              <Target />
            </span>
            <div className="pf-section__titles">
              <div className="neo-hud">Contributing</div>
              <h2 className="pf-section__title">Key results you own on others’ objectives</h2>
            </div>
          </header>
          <ul className="pf-oc__krs">
            {extra.map((k) => {
              const r = rollup(data, data.objectives.find((o) => o.id === k.objectiveId)!, now);
              return (
                <li key={k.id} className="pf-mine__extra">
                  <Link to={`/performance/okrs/${r.o.id}`} className="pf-mine__extrao">
                    <LevelChip level={r.o.level} /> <span className="truncate">{r.o.title}</span>
                  </Link>
                  <ul className="pf-oc__krs">
                    <KrLine kr={k} status={r.statuses[k.id]} period={r.period} now={now} />
                  </ul>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {!filtering && alignedToMe.length > 0 && (
        <section className="neo-card pf-section" aria-label="Aligned to your objectives">
          <header className="pf-section__head">
            <span className="pf-section__icon">
              <GitBranch />
            </span>
            <div className="pf-section__titles">
              <div className="neo-hud">Laddering up to you</div>
              <h2 className="pf-section__title">
                {alignedToMe.length} objective{alignedToMe.length === 1 ? '' : 's'} aligned to yours
              </h2>
            </div>
          </header>
          <div className="pf-tree__kids pf-tree__kids--flat">
            {alignedToMe.sort(bySeverity).map((r) => (
              <ObjectiveRow key={r.o.id} ctx={ctx} r={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function MyQuarter({ ctx, mine, myKrs, now, period, onCheckin }: { ctx: PerfCtx; mine: ObjectiveRollup[]; myKrs: KeyResult[]; now: number; period: Period; onCheckin: () => void }) {
  const data = usePerf();
  const active = mine.filter((r) => r.o.state === 'active');
  const avg = active.length ? active.reduce((t, r) => t + r.progress, 0) / active.length : 0;
  const st = active.length ? rollupStatus(active.map((r) => r.status)) : 'on-track';
  const exp = elapsed(period, now);
  const attention = active.filter((r) => r.status === 'at-risk' || r.status === 'off-track').length;
  const due = myKrs.filter((k) => checkinDue(k, now)).length;
  const streak = checkinStreak(
    data.keyResults.flatMap((k) => k.checkins.filter((c) => c.byId === ctx.me.id).map((c) => c.at)),
    now,
  );
  const pace = avg - exp;
  const headline = !active.length
    ? 'All your objectives are closed.'
    : attention
      ? `${active.length - attention} on track, ${attention} need${attention === 1 ? 's' : ''} attention`
      : `All ${active.length} objective${active.length === 1 ? '' : 's'} on track`;
  return (
    <section className="neo-card neo-spot pf-myq" aria-label="Your quarter">
      <OkrRing value={avg} status={st} size={84} />
      <div className="pf-myq__text">
        <div className="neo-hud neo-hud--tint">Your {period.label}</div>
        <h2 className="pf-myq__title">{headline}</h2>
        <p className="pf-muted text-sm">
          Average progress {pctText(avg)} with {pctText(exp)} of the quarter gone —{' '}
          {Math.abs(pace) < 0.05 ? 'right on pace.' : pace > 0 ? `${pctText(pace)} ahead of pace.` : `${pctText(-pace)} behind pace.`}
        </p>
      </div>
      <div className="pf-myq__facts">
        <div className="pf-myq__fact" data-tip={streak ? `${streak} consecutive weeks with a check-in` : 'Check in weekly to start a streak'}>
          <Flame aria-hidden="true" />
          <b className="neo-num">{streak}w</b>
          <span>streak</span>
        </div>
        <div className="pf-myq__fact" data-tone={due ? 'warning' : undefined}>
          {due ? <TriangleAlert aria-hidden="true" /> : <Target aria-hidden="true" />}
          <b className="neo-num">{due}</b>
          <span>due check-in</span>
        </div>
      </div>
      {myKrs.length > 0 && (
        <button type="button" className="neo-btn neo-btn--soft" onClick={onCheckin} data-qa="mine-checkin">
          <Target /> Check in
        </button>
      )}
    </section>
  );
}

/* ───────── Galaxy ───────── */

function GalaxyPanel({ ctx, rows, period, now, matches, selected, onSelect }: { ctx: PerfCtx; rows: ObjectiveRollup[]; period: Period; now: number; matches: Set<string> | null; selected: string | null; onSelect: (id: string | null) => void }) {
  const navigate = useNavigate();
  const wide = useMediaQuery('(min-width: 1101px)');
  const sel = selected ? rows.find((r) => r.o.id === selected) : undefined;
  const byId = useMemo(() => new Map(rows.map((r) => [r.o.id, r])), [rows]);
  const attention = rows.filter((r) => r.status === 'at-risk' || r.status === 'off-track').sort(bySeverity);
  const unaligned = rows.filter((r) => r.o.level !== 'company' && (!r.o.parentId || !byId.has(r.o.parentId)));
  const levels = { company: rows.filter((r) => r.o.level === 'company').length, team: rows.filter((r) => r.o.level === 'team').length, individual: rows.filter((r) => r.o.level === 'individual').length };

  if (!rows.length)
    return (
      <div className="neo-body neo-pad">
        <NeoEmpty icon={<Orbit />} title="The galaxy is empty this quarter">
          Objectives appear here as stars once they are created.
        </NeoEmpty>
      </div>
    );

  const chain: ObjectiveRollup[] = [];
  for (let cur = sel; cur; cur = cur.o.parentId ? byId.get(cur.o.parentId) : undefined) chain.unshift(cur);

  return (
    <div className="neo-split pf-galaxy">
      <div className="pf-galaxy__stage">
        <GoalGalaxy ctx={ctx} rows={rows} matches={matches} selected={selected} onSelect={onSelect} onOpen={(id) => navigate(`/performance/okrs/${id}`)} centerLabel={period.label} />
        <GalaxyLegend />
      </div>
      {(wide || sel) && (
        <aside className="neo-inspector pf-galaxy__insp" aria-label={sel ? sel.o.title : 'Galaxy overview'}>
          {sel ? (
            <div className="pf-gi">
              <div className="pf-gi__top">
                <span className="neo-hud">Focused objective</span>
                <span className="pf-spacer" />
                <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label="Clear focus" onClick={() => onSelect(null)}>
                  <X />
                </button>
              </div>
              <div className="pf-gi__hero">
                <OkrRing value={sel.progress} status={sel.status} size={64} />
                <div className="pf-stack">
                  <div className="pf-row pf-row--wrap">
                    <LevelChip level={sel.o.level} />
                    <StatusChip status={sel.status} />
                  </div>
                  <h2 className="pf-gi__title">{sel.o.title}</h2>
                  <span className="pf-faint text-sm">
                    {ctx.name(sel.o.ownerId)}
                    {sel.o.department ? ` · ${sel.o.department}` : ''}
                  </span>
                </div>
              </div>
              {chain.length > 1 && (
                <ol className="pf-gi__chain" aria-label="Alignment path">
                  {chain.map((c) => (
                    <li key={c.o.id} data-status={c.status} aria-current={c.o.id === sel.o.id ? 'true' : undefined}>
                      <button type="button" onClick={() => onSelect(c.o.id)}>
                        <span className="pf-dot" aria-hidden="true" />
                        <span className="truncate">{c.o.title}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              <ul className="pf-oc__krs" aria-label="Key results">
                {sel.krs.map((k) => (
                  <KrLine key={k.id} kr={k} status={sel.statuses[k.id]} period={sel.period} now={now} />
                ))}
              </ul>
              {(() => {
                const kids = rows.filter((r) => r.o.parentId === sel.o.id);
                return kids.length ? (
                  <div className="pf-gi__kids">
                    <div className="neo-hud">Aligned ({kids.length})</div>
                    {kids.sort(bySeverity).map((k) => (
                      <button key={k.o.id} type="button" className="pf-gi__kid" data-status={k.status} onClick={() => onSelect(k.o.id)}>
                        <StatusIcon status={k.status} />
                        <span className="truncate">{k.o.title}</span>
                        <span className="neo-mono pf-faint">{pctText(k.progress)}</span>
                      </button>
                    ))}
                  </div>
                ) : null;
              })()}
              <Link to={`/performance/okrs/${sel.o.id}`} className="neo-btn neo-btn--plasma neo-btn--block" data-qa="galaxy-open">
                Open objective <ArrowRight />
              </Link>
            </div>
          ) : (
            <div className="pf-gi">
              <div className="pf-gi__top">
                <span className="neo-hud">Alignment at a glance</span>
              </div>
              <div className="pf-gi__levels">
                <div>
                  <b className="neo-num">{levels.company}</b>
                  <span>Company</span>
                </div>
                <div>
                  <b className="neo-num">{levels.team}</b>
                  <span>Team</span>
                </div>
                <div>
                  <b className="neo-num">{levels.individual}</b>
                  <span>Individual</span>
                </div>
              </div>
              <p className="pf-muted text-sm">Click a star to focus its branch, click again to open it. Press Escape to zoom out.</p>
              {attention.length > 0 && (
                <div className="pf-gi__kids">
                  <div className="neo-hud">Needs attention ({attention.length})</div>
                  {attention.slice(0, 6).map((k) => (
                    <button key={k.o.id} type="button" className="pf-gi__kid" data-status={k.status} onClick={() => onSelect(k.o.id)}>
                      <StatusIcon status={k.status} />
                      <span className="truncate">{k.o.title}</span>
                      <span className="neo-mono pf-faint">{pctText(k.progress)}</span>
                    </button>
                  ))}
                </div>
              )}
              {unaligned.length > 0 && (
                <div className="pf-gi__kids">
                  <div className="neo-hud">Not aligned ({unaligned.length})</div>
                  {unaligned.map((k) => (
                    <button key={k.o.id} type="button" className="pf-gi__kid" data-status={k.status} onClick={() => onSelect(k.o.id)}>
                      <Unlink />
                      <span className="truncate">{k.o.title}</span>
                      <span className="pf-faint text-xs">{ctx.first(k.o.ownerId)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
