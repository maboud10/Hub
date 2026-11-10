/**
 * Objective detail — every key result with its trajectory and forecast cone,
 * Nova "explain status", linked Helix projects, aligned objectives, the
 * alignment path, updates & comments, and owner actions (edit, add KR,
 * close & grade, reopen, delete with undo).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  Archive,
  ArrowLeft,
  Award,
  Building2,
  CheckCheck,
  CircleDashed,
  Ellipsis,
  FolderKanban,
  GitBranch,
  Globe,
  Link2,
  Lock,
  Megaphone,
  MessagesSquare,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  User as UserIcon,
  Users,
} from 'lucide-react';
import { Bar, Chip, NeoEmpty, NeoHead, NeoMenu, NeoStage, type MenuEntry } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { currentViewer, loadBridge, type BridgeProject } from '@/lib/appBridge';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { useHotkeys } from '@/hooks/useHotkeys';
import { canCheckIn, canEditObjective, canViewObjective } from '@/performance/access';
import { STATUS_META } from '@/performance/constants';
import { explainObjective } from '@/performance/nova';
import { clamp01, elapsed, forecastKr, formatDelta, formatPace, formatRange, formatValue, isImprovement, krProgress, lastCheckinAt, objectiveScore, scoreLabel } from '@/performance/okr';
import { myCheckinKrs, rollup, visibleObjectives, type ObjectiveRollup } from '@/performance/selectors';
import { usePerf } from '@/performance/store';
import type { KeyResult, KrStatus, Objective, OkrLevel } from '@/performance/types';
import { ProjectSigil } from '@/projects/sigils';
import { toast } from '@/store/toast';
import { GiveFeedbackModal } from './FeedbackModals';
import { GradeModal, KrEditor, ObjectiveEditor } from './ObjectiveEditor';
import { Trajectory } from './Trajectory';
import { shortDate, useMinute, usePerfCtx, useSearchFlag, withUndo, type PerfCtx } from './hooks';
import { Confidence, Face, LevelChip, NovaBox, NovaThinking, OkrRing, Seg, StatusChip, StatusIcon, Who, pctText, useNova } from './ui';
import './styles/okrs.css';

const LEVEL_ICON: Record<OkrLevel, ReactNode> = { company: <Building2 />, team: <Users />, individual: <UserIcon /> };

/** Helix projects that contribute to these key results (via the Projects bridge). */
function useLinkedProjects(krIds: string[]) {
  const key = krIds.join(',');
  const [state, setState] = useState<{ key: string; status: 'loading' | 'ready' | 'unavailable'; items: BridgeProject[] }>({ key: '', status: 'loading', items: [] });
  useEffect(() => {
    let alive = true;
    loadBridge('projects')
      .then((api) => {
        const viewer = currentViewer();
        if (!viewer) throw new Error('signed out');
        const ids = new Set(key.split(',').filter(Boolean));
        const items = (api.listProjects(viewer) ?? []).filter((p) => p.keyResultIds?.some((id) => ids.has(id)));
        if (alive) setState({ key, status: 'ready', items });
      })
      .catch(() => alive && setState({ key, status: 'unavailable', items: [] }));
    return () => {
      alive = false;
    };
  }, [key]);
  return state.key === key ? state : { key, status: 'loading' as const, items: [] };
}

const PROJECT_STATUS: Record<string, { label: string; status: KrStatus }> = {
  'on-track': { label: 'On track', status: 'on-track' },
  'at-risk': { label: 'At risk', status: 'at-risk' },
  'off-track': { label: 'Off track', status: 'off-track' },
  complete: { label: 'Complete', status: 'done' },
};

export function ObjectiveView() {
  const { objectiveId = '' } = useParams();
  const ctx = usePerfCtx();
  const now = useMinute();
  const navigate = useNavigate();
  const data = usePerf();
  const [, , openCheckin] = useSearchFlag('checkin');
  const [editing, setEditing] = useState(false);
  const [krEditor, setKrEditor] = useState<{ krId?: string } | null>(null);
  const [grading, setGrading] = useState(false);
  const [aligning, setAligning] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const o = data.objectives.find((x) => x.id === objectiveId);
  const krIds = useMemo(() => data.keyResults.filter((k) => k.objectiveId === objectiveId).map((k) => k.id), [data.keyResults, objectiveId]);
  const projects = useLinkedProjects(krIds);
  const editable = !!(ctx && o && canEditObjective(ctx.v, ctx.users, o));
  useHotkeys({ e: () => editable && setEditing(true) }, editable && !editing && !krEditor && !grading && !aligning && !feedback);

  if (!ctx) return null;
  if (!o || !canViewObjective(ctx.v, ctx.users, o)) {
    return (
      <NeoStage label="Objective">
        <NeoHead icon={<Target />} eyebrow={<Link to="/performance/okrs">OKRs</Link>} title="Objective not found" sub="It may have been deleted, or it’s private." />
        <div className="neo-body neo-pad">
          <NeoEmpty
            icon={<Lock />}
            title="This objective isn’t available"
            action={
              <Link to="/performance/okrs" className="neo-btn neo-btn--soft">
                <ArrowLeft /> All OKRs
              </Link>
            }
          >
            Private objectives are visible to their owners, their managers and People Ops.
          </NeoEmpty>
        </div>
      </NeoStage>
    );
  }

  const r = rollup(data, o, now);
  const canEdit = canEditObjective(ctx.v, ctx.users, o);
  const active = o.state === 'active';
  const mine = new Set(myCheckinKrs(data, ctx.me.id, o.periodId).map((k) => k.id));
  const canCheckinHere = active && r.krs.some((k) => mine.has(k.id));
  const isOwner = o.ownerId === ctx.me.id;

  const chain: Objective[] = [];
  for (let cur = o.parentId ? data.objectives.find((x) => x.id === o.parentId) : undefined, guard = 0; cur && guard < 6; guard++) {
    if (!canViewObjective(ctx.v, ctx.users, cur)) break;
    chain.unshift(cur);
    cur = cur.parentId ? data.objectives.find((x) => x.id === cur!.parentId) : undefined;
  }
  const children = visibleObjectives(data, ctx.v, ctx.users, o.periodId)
    .filter((x) => x.parentId === o.id)
    .map((x) => rollup(data, x, now));

  const del = () => {
    if (withUndo(usePerf.getState().deleteObjective(o.id), `Deleted “${o.title}”`)) navigate('/performance/okrs');
  };
  const reopen = () => {
    const res = usePerf.getState().reopenObjective(o.id);
    if (res.ok) toast.success('Objective reopened', 'Check-ins are open again.');
    else toast.error(res.error);
  };

  const primary: ReactNode = canCheckinHere ? (
    <button type="button" className="neo-btn neo-btn--plasma" onClick={() => openCheckin('1')} data-qa="obj-checkin">
      <Target />
      <span className="neo-btn__label">Check in</span>
    </button>
  ) : active && canEdit ? (
    <button type="button" className="neo-btn neo-btn--plasma" onClick={() => setKrEditor({})} data-qa="obj-add-kr">
      <Plus />
      <span className="neo-btn__label">Add key result</span>
    </button>
  ) : !active && canEdit ? (
    <button type="button" className="neo-btn neo-btn--plasma" onClick={reopen}>
      <RotateCcw />
      <span className="neo-btn__label">Reopen</span>
    </button>
  ) : !isOwner ? (
    <button type="button" className="neo-btn neo-btn--plasma" onClick={() => setFeedback(true)}>
      <Send />
      <span className="neo-btn__label">Give {ctx.first(o.ownerId)} feedback</span>
    </button>
  ) : null;

  const menu: MenuEntry[] = [];
  if (canEdit) {
    menu.push({ label: 'Edit objective', icon: <Pencil />, hint: 'E', onSelect: () => setEditing(true) });
    if (active) {
      menu.push({ label: 'Add key result', icon: <Plus />, onSelect: () => setKrEditor({}) });
      menu.push({ label: 'Close & grade', icon: <Award />, onSelect: () => setGrading(true) });
    } else menu.push({ label: 'Reopen', icon: <RotateCcw />, onSelect: reopen });
  }
  if (!isOwner && canCheckinHere) menu.push({ label: `Give ${ctx.first(o.ownerId)} feedback`, icon: <Send />, onSelect: () => setFeedback(true) });
  if (o.level !== 'individual' && active) menu.push({ label: 'Align an objective to this', icon: <GitBranch />, onSelect: () => setAligning(true) });
  menu.push({
    label: 'Copy link',
    icon: <Link2 />,
    onSelect: () =>
      void navigator.clipboard?.writeText(`${window.location.origin}/performance/okrs/${o.id}`).then(
        () => toast.success('Link copied'),
        () => toast.error('Couldn’t copy the link'),
      ),
  });
  if (canEdit) menu.push({ kind: 'sep' }, { label: 'Delete objective', icon: <Trash2 />, danger: true, onSelect: del });

  return (
    <NeoStage label={o.title}>
      <NeoHead
        icon={LEVEL_ICON[o.level]}
        eyebrow={
          <>
            <Link to="/performance/okrs" className="pf-crumb">
              OKRs
            </Link>
            <span aria-hidden="true"> / </span>
            {o.level === 'company' ? 'Company' : o.level === 'team' ? `${o.department ?? 'Team'}` : 'Individual'} objective · {r.period.label}
          </>
        }
        title={o.title}
        sub={
          <>
            {ctx.name(o.ownerId)}
            {o.coOwnerIds.length > 0 && ` + ${o.coOwnerIds.length}`}
            {chain.length > 0 && ` · aligns to “${chain[chain.length - 1].title}”`}
          </>
        }
        actions={
          <>
            {canEdit && (
              <button type="button" className="neo-btn neo-btn--soft" onClick={() => setEditing(true)} data-qa="obj-edit">
                <Pencil />
                <span className="neo-btn__label">Edit</span>
              </button>
            )}
            {primary}
            <NeoMenu
              label="Objective actions"
              items={menu}
              trigger={(p) => (
                <button {...p} type="button" className="neo-iconbtn" aria-label="Objective actions">
                  <Ellipsis />
                </button>
              )}
            />
          </>
        }
      />
      <div className="neo-body neo-pad pf-obj">
        <div className="pf-obj__main">
          <Hero ctx={ctx} r={r} now={now} />
          {active && r.krs.length > 0 && <ExplainStatus ctx={ctx} r={r} now={now} />}
          <section className="pf-obj__krs" aria-label="Key results">
            <div className="pf-obj__krshead">
              <span className="neo-hud">Key results · {r.krs.length}</span>
              {active && canEdit && r.krs.length < 7 && (
                <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => setKrEditor({})}>
                  <Plus /> Add
                </button>
              )}
            </div>
            {r.krs.length === 0 && (
              <NeoEmpty
                compact
                icon={<Target />}
                title="No key results yet"
                action={
                  canEdit && active ? (
                    <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={() => setKrEditor({})}>
                      <Plus /> Add key result
                    </button>
                  ) : undefined
                }
              >
                Key results are the 2–4 measurable outcomes that tell you the objective is achieved.
              </NeoEmpty>
            )}
            {r.krs.map((k) => (
              <KrCard
                key={k.id}
                ctx={ctx}
                kr={k}
                o={o}
                r={r}
                now={now}
                canEdit={canEdit && active}
                projects={projects.items.filter((p) => p.keyResultIds.includes(k.id))}
                onEdit={() => setKrEditor({ krId: k.id })}
                onDelete={() => withUndo(usePerf.getState().deleteKeyResult(k.id), `Deleted “${k.title}”`)}
              />
            ))}
          </section>
          <Activity ctx={ctx} o={o} canEdit={canEdit} />
        </div>
        <aside className="pf-obj__aside" aria-label="Objective details">
          {o.state === 'closed' && <GradeCard ctx={ctx} o={o} krs={r.krs} canEdit={canEdit} onReopen={reopen} />}
          <Details ctx={ctx} o={o} r={r} />
          <AlignmentPath ctx={ctx} chain={chain} self={r} kids={children} canAlign={o.level !== 'individual' && active} onAlign={() => setAligning(true)} now={now} />
          <LinkedProjects status={projects.status} items={projects.items} />
        </aside>
      </div>

      <ObjectiveEditor open={editing} onClose={() => setEditing(false)} editId={o.id} />
      <ObjectiveEditor
        open={aligning}
        onClose={() => setAligning(false)}
        defaults={{ periodId: o.periodId, parentId: o.id, level: o.level === 'company' && ctx.canTeam ? 'team' : 'individual' }}
        onSaved={(id) => navigate(`/performance/okrs/${id}`)}
      />
      <KrEditor open={!!krEditor} onClose={() => setKrEditor(null)} objectiveId={o.id} krId={krEditor?.krId} />
      <GradeModal open={grading} onClose={() => setGrading(false)} objectiveId={o.id} />
      <GiveFeedbackModal open={feedback} onClose={() => setFeedback(false)} toId={o.ownerId} objectiveId={o.id} />
    </NeoStage>
  );
}

/* ───────── Hero ───────── */

function Hero({ ctx, r, now }: { ctx: PerfCtx; r: ObjectiveRollup; now: number }) {
  const o = r.o;
  const closed = o.state === 'closed';
  const exp = elapsed(r.period, now);
  const forecast = r.krs.length ? r.krs.reduce((t, k) => t + clamp01(forecastKr(k, r.period, now).progress), 0) / r.krs.length : 0;
  const last = r.krs.map((k) => lastCheckinAt(k)).filter((t): t is number => !!t).sort((a, b) => b - a)[0];
  const score = closed ? objectiveScore(r.krs) : null;
  return (
    <section className="neo-card neo-spot pf-oh" data-status={r.status} aria-label="Summary">
      <OkrRing value={r.progress} status={r.status} size={104} stroke={9} />
      <div className="pf-oh__body">
        <div className="pf-row pf-row--wrap">
          <LevelChip level={o.level} />
          <StatusChip status={r.status} size="md" />
          {o.visibility === 'private' ? (
            <Chip tone="slate" size="sm" icon={<Lock />}>
              Private
            </Chip>
          ) : (
            <Chip tone="slate" size="sm" icon={<Globe />}>
              Public
            </Chip>
          )}
          {o.tags.map((t) => (
            <span key={t} className="pf-tag">
              #{t}
            </span>
          ))}
        </div>
        {o.description ? <p className="pf-oh__desc">{o.description}</p> : <p className="pf-oh__desc pf-faint">No description yet.</p>}
        <dl className="pf-oh__facts">
          {closed && score !== null ? (
            <div>
              <dt>Final score</dt>
              <dd>
                <b className="neo-num">{score.toFixed(1)}</b> <span>{scoreLabel(score)}</span>
              </dd>
            </div>
          ) : (
            <>
              <div>
                <dt>Forecast</dt>
                <dd>
                  <b className="neo-num">{pctText(forecast)}</b> <span>by {shortDate(r.period.end)}</span>
                </dd>
              </div>
              <div>
                <dt>Expected today</dt>
                <dd>
                  <b className="neo-num">{pctText(exp)}</b> <span>{r.progress >= exp ? 'you’re ahead' : 'you’re behind'}</span>
                </dd>
              </div>
            </>
          )}
          <div>
            <dt>Key results</dt>
            <dd>
              <b className="neo-num">{r.krs.length}</b> <span>{r.krs.filter((k) => r.statuses[k.id] === 'done').length} done</span>
            </dd>
          </div>
          <div>
            <dt>Last check-in</dt>
            <dd>
              <b className="neo-num pf-oh__rel">{last ? relativeTime(last) : '—'}</b> <span>{last ? `by ${ctx.first(r.krs.flatMap((k) => k.checkins).sort((a, b) => b.at - a.at)[0]?.byId)}` : 'none yet'}</span>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

/* ───────── Nova: explain status ───────── */

function ExplainStatus({ ctx, r, now }: { ctx: PerfCtx; r: ObjectiveRollup; now: number }) {
  const risky = r.status === 'at-risk' || r.status === 'off-track';
  const nova = useNova(
    () => {
      const e = explainObjective(r.o, r.krs, r.period, now, ctx.name);
      const lines = [e.headline, '', ...e.bullets.map((b) => `• ${b.text}`)];
      if (e.suggestions.length) lines.push('', 'What would help', ...e.suggestions.map((s) => `→ ${s}`));
      return lines.join('\n');
    },
    r.o.id,
    750,
  );
  const { run } = nova;
  useEffect(() => {
    if (risky) run();
    // run once per objective when it needs attention
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.o.id]);
  return (
    <NovaBox
      title="Nova · status"
      hud={nova.text ? 'From forecasts, confidence and check-in notes' : undefined}
      className="pf-explain"
      actions={
        <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={run} disabled={nova.thinking} data-qa="obj-explain">
          <Sparkles /> {nova.text ? 'Refresh' : 'Explain status'}
        </button>
      }
    >
      {nova.thinking ? (
        <NovaThinking label="Reading forecasts and check-ins" />
      ) : nova.text ? (
        <p className={cx('pf-explain__text', !nova.done && 'pf-caret')}>{nova.shown}</p>
      ) : (
        <p className="pf-faint">{risky ? 'Nova can explain what’s driving the risk and what would help.' : 'Ask Nova why this objective is where it is — every claim comes from the forecasts and check-ins below.'}</p>
      )}
    </NovaBox>
  );
}

/* ───────── Key result card ───────── */

function KrCard({
  ctx,
  kr,
  o,
  r,
  now,
  canEdit,
  projects,
  onEdit,
  onDelete,
}: {
  ctx: PerfCtx;
  kr: KeyResult;
  o: Objective;
  r: ObjectiveRollup;
  now: number;
  canEdit: boolean;
  projects: BridgeProject[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const st = r.statuses[kr.id];
  const f = forecastKr(kr, r.period, now);
  const checkable = canCheckIn(ctx.v, ctx.users, kr.ownerId, o).ok;
  const history = [...kr.checkins].sort((a, b) => b.at - a.at);
  const ended = now >= r.period.end;
  const toggleBool = () => {
    const res = usePerf.getState().checkIn([{ krId: kr.id, value: kr.current >= 1 ? 0 : 1, confidence: kr.confidence }]);
    if (!res.ok) toast.error(res.error);
    else if (res.completed.length) toast.success('Key result done!', kr.title);
  };
  return (
    <article className="neo-card pf-krc" data-status={st} id={`kr-${kr.id}`} aria-label={kr.title}>
      <header className="pf-krc__head">
        <span className="pf-krc__st" role="img" aria-label={STATUS_META[st].label}>
          <StatusIcon status={st} />
        </span>
        <div className="pf-krc__titles">
          <h3 className="pf-krc__title">{kr.title}</h3>
          <div className="pf-krc__meta">
            <Face ctx={ctx} id={kr.ownerId} size={20} />
            <span>{ctx.name(kr.ownerId)}</span>
            <span aria-hidden="true">·</span>
            <span className="neo-mono">{formatRange(kr)}</span>
            {kr.autoProjectId && (
              <>
                <span aria-hidden="true">·</span>
                <span title="Progress updates automatically from a linked Helix project">Auto-progress</span>
              </>
            )}
          </div>
        </div>
        <StatusChip status={st} />
        {canEdit && (
          <NeoMenu
            label="Key result actions"
            items={[
              { label: 'Edit key result', icon: <Pencil />, onSelect: onEdit },
              { kind: 'sep' },
              { label: 'Delete key result', icon: <Trash2 />, danger: true, onSelect: onDelete },
            ]}
            trigger={(p) => (
              <button {...p} type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label={`Actions for ${kr.title}`}>
                <Ellipsis />
              </button>
            )}
          />
        )}
      </header>

      <div className="pf-krc__nums">
        <div className="pf-krc__num pf-krc__num--now">
          <span className="neo-hud">Now</span>
          <b className="neo-num">{formatValue(kr, kr.current)}</b>
        </div>
        <div className="pf-krc__num">
          <span className="neo-hud">{kr.ceiling ? 'Limit' : 'Target'}</span>
          <b className="neo-num">{formatValue(kr, kr.target)}</b>
        </div>
        <div className="pf-krc__num">
          <span className="neo-hud">Progress</span>
          <b className="neo-num">{pctText(krProgress(kr))}</b>
        </div>
        {kr.metric !== 'boolean' && !ended && st !== 'done' && (
          <div className="pf-krc__num">
            <span className="neo-hud">Forecast</span>
            <b className="neo-num">{formatValue(kr, f.value)}</b>
            <small className={cx(isImprovement(kr, f.perWeek) ? 'is-good' : f.perWeek !== 0 ? 'is-bad' : undefined)}>
              {isImprovement(kr, f.perWeek) ? <TrendingUp aria-hidden="true" /> : <TrendingDown aria-hidden="true" />} {formatPace(kr, f.perWeek)}
            </small>
          </div>
        )}
        <div className="pf-krc__num">
          <span className="neo-hud">Confidence</span>
          <Confidence value={kr.confidence} />
        </div>
      </div>

      {kr.metric !== 'boolean' && <Trajectory kr={kr} period={r.period} now={now} height={196} />}

      {kr.metric === 'milestone' && kr.milestones && (
        <ol className="pf-ms" aria-label="Milestones">
          {kr.milestones.map((m) => (
            <li key={m.id} className={cx('pf-ms__item', m.done && 'is-done')}>
              <label className="pf-ms__label">
                <input
                  type="checkbox"
                  checked={m.done}
                  disabled={!checkable}
                  onChange={() => {
                    const res = usePerf.getState().toggleMilestone(kr.id, m.id);
                    if (!res.ok) toast.error(res.error);
                    else if (res.completed) toast.success('All milestones done!', kr.title);
                  }}
                />
                <span>{m.title}</span>
              </label>
              {m.doneAt && <span className="pf-faint text-xs">{shortDate(m.doneAt)}</span>}
            </li>
          ))}
        </ol>
      )}

      {kr.metric === 'boolean' && (
        <div className="pf-krc__bool">
          {kr.current >= 1 ? <CheckCheck aria-hidden="true" /> : <CircleDashed aria-hidden="true" />}
          <span>{kr.current >= 1 ? 'Done' : 'Not done yet'}</span>
          {checkable && (
            <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={toggleBool}>
              {kr.current >= 1 ? 'Mark not done' : 'Mark done'}
            </button>
          )}
        </div>
      )}

      {projects.length > 0 && (
        <div className="pf-krc__projects">
          <span className="neo-hud">Contributing projects</span>
          {projects.map((p) => (
            <ProjectLine key={p.id} p={p} />
          ))}
        </div>
      )}

      {history.length > 0 && (
        <details className="pf-krc__hist">
          <summary>
            Check-in history <span className="neo-count">{history.length}</span>
          </summary>
          <ol>
            {history.map((c, i) => {
              const prev = history[i + 1]?.value ?? kr.start;
              const delta = c.value - prev;
              return (
                <li key={c.id}>
                  <span className="pf-krc__hdate neo-mono">{shortDate(c.at)}</span>
                  <b className="neo-mono">{formatValue(kr, c.value)}</b>
                  <span className={cx('pf-krc__hdelta neo-mono', isImprovement(kr, delta) ? 'is-good' : delta !== 0 ? 'is-bad' : undefined)}>{formatDelta(kr, delta)}</span>
                  <Confidence value={c.confidence} compact />
                  <span className="pf-krc__hnote">{c.note ?? <span className="pf-faint">No note</span>}</span>
                  <Face ctx={ctx} id={c.byId} size={20} />
                </li>
              );
            })}
          </ol>
        </details>
      )}
    </article>
  );
}

function ProjectLine({ p }: { p: BridgeProject }) {
  const s = PROJECT_STATUS[p.status];
  return (
    <a href={p.to} className="pf-proj" onClick={(e) => e.stopPropagation()}>
      <span className="pf-proj__icon" style={{ background: p.color }} aria-hidden="true">
        <ProjectSigil icon={p.icon} color={p.color} size={18} />
      </span>
      <span className="pf-proj__name truncate">{p.name}</span>
      <Bar value={p.progress} className="pf-proj__bar" label={`${p.name}: ${Math.round(p.progress * 100)}% of tasks done`} fill={s ? `rgb(${STATUS_META[s.status].rgb})` : undefined} />
      <span className="neo-mono pf-faint text-xs">{Math.round(p.progress * 100)}%</span>
      {s ? <StatusChip status={s.status} /> : <Chip size="sm">{p.status.replace('-', ' ')}</Chip>}
    </a>
  );
}

/* ───────── Activity ───────── */

function Activity({ ctx, o, canEdit }: { ctx: PerfCtx; o: Objective; canEdit: boolean }) {
  const comments = usePerf((s) => s.comments);
  const list = useMemo(() => comments.filter((c) => c.objectiveId === o.id).sort((a, b) => b.at - a.at), [comments, o.id]);
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<'comment' | 'update'>('comment');
  const post = () => {
    const res = usePerf.getState().addComment(o.id, body, kind);
    if (!res.ok) return toast.error(res.error);
    setBody('');
    toast.success(kind === 'update' ? 'Update posted' : 'Comment posted', o.ownerId !== ctx.me.id ? `${ctx.first(o.ownerId)} has been notified` : undefined);
  };
  return (
    <section className="neo-card pf-section pf-activity" aria-label="Updates and comments">
      <header className="pf-section__head">
        <span className="pf-section__icon">
          <MessagesSquare />
        </span>
        <div className="pf-section__titles">
          <div className="neo-hud">{list.length} entries</div>
          <h2 className="pf-section__title">Updates & comments</h2>
        </div>
      </header>
      <div className="pf-composer">
        <Avatar user={ctx.me} size={30} />
        <div className="pf-composer__box">
          <textarea
            className="neo-textarea"
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={kind === 'update' ? 'Share progress, risks and what’s next…' : `Comment on “${o.title}”…`}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') post();
            }}
            aria-label="Write a comment"
          />
          <div className="pf-row">
            {canEdit && (
              <Seg
                size="sm"
                label="Post type"
                value={kind}
                onChange={setKind}
                options={[
                  { value: 'comment', label: 'Comment' },
                  {
                    value: 'update',
                    label: (
                      <>
                        <Megaphone aria-hidden="true" /> Status update
                      </>
                    ),
                  },
                ]}
              />
            )}
            <span className="pf-spacer" />
            <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={post} disabled={body.trim().length < 2} data-qa="obj-post">
              <Send /> Post
            </button>
          </div>
        </div>
      </div>
      {list.length === 0 ? (
        <p className="pf-faint text-sm pf-activity__empty">No updates yet. Owners post weekly updates; anyone can comment.</p>
      ) : (
        <ol className="pf-feed">
          {list.map((c) => (
            <li key={c.id} className="pf-feed__item" data-kind={c.kind}>
              {c.kind === 'system' ? (
                <span className="pf-feed__sys" aria-hidden="true">
                  <Archive />
                </span>
              ) : (
                <Face ctx={ctx} id={c.authorId} size={30} />
              )}
              <div className="pf-feed__body">
                <div className="pf-feed__meta">
                  <b>{c.kind === 'system' ? 'System' : ctx.name(c.authorId)}</b>
                  {c.kind === 'update' && (
                    <Chip tone="app" size="sm" icon={<Megaphone />}>
                      Update
                    </Chip>
                  )}
                  <span className="pf-faint">{relativeTime(c.at)}</span>
                </div>
                <p className="pf-feed__text">{c.body}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ───────── Aside ───────── */

function Details({ ctx, o, r }: { ctx: PerfCtx; o: Objective; r: ObjectiveRollup }) {
  return (
    <section className="neo-card pf-section" aria-label="Details">
      <header className="pf-section__head">
        <div className="pf-section__titles">
          <div className="neo-hud">Details</div>
        </div>
      </header>
      <dl className="neo-kv pf-kv">
        <dt>Owner</dt>
        <dd>
          <Who ctx={ctx} id={o.ownerId} size={26} />
        </dd>
        {o.coOwnerIds.length > 0 && (
          <>
            <dt>Co-owners</dt>
            <dd className="pf-stack">
              {o.coOwnerIds.map((id) => (
                <Who key={id} ctx={ctx} id={id} size={22} />
              ))}
            </dd>
          </>
        )}
        <dt>Level</dt>
        <dd>{o.level === 'company' ? 'Company' : o.level === 'team' ? 'Team' : 'Individual'}</dd>
        {o.department && (
          <>
            <dt>Department</dt>
            <dd>{o.department}</dd>
          </>
        )}
        <dt>Quarter</dt>
        <dd>
          {r.period.label} <span className="pf-faint">· ends {shortDate(r.period.end)}</span>
        </dd>
        <dt>Visibility</dt>
        <dd>{o.visibility === 'public' ? 'Public — anyone can align to it' : 'Private — owners, managers, People Ops'}</dd>
        <dt>Created</dt>
        <dd>
          {shortDate(o.createdAt)} <span className="pf-faint">by {ctx.first(o.createdBy)}</span>
        </dd>
      </dl>
    </section>
  );
}

function AlignmentPath({ ctx, chain, self, kids, canAlign, onAlign, now }: { ctx: PerfCtx; chain: Objective[]; self: ObjectiveRollup; kids: ObjectiveRollup[]; canAlign: boolean; onAlign: () => void; now: number }) {
  const data = usePerf();
  return (
    <section className="neo-card pf-section" aria-label="Alignment">
      <header className="pf-section__head">
        <span className="pf-section__icon">
          <GitBranch />
        </span>
        <div className="pf-section__titles">
          <div className="neo-hud">Alignment</div>
          <h2 className="pf-section__title">How it ladders up</h2>
        </div>
        {canAlign && (
          <div className="pf-section__actions">
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={onAlign}>
              <Plus /> Align
            </button>
          </div>
        )}
      </header>
      <ol className="pf-path">
        {chain.map((p) => {
          const pr = rollup(data, p, now);
          return (
            <li key={p.id} data-status={pr.status}>
              <Link to={`/performance/okrs/${p.id}`} className="pf-path__link">
                <OkrRing value={pr.progress} status={pr.status} size={30} stroke={3} label={<span />} />
                <span className="pf-path__text">
                  <span className="pf-path__lvl">{p.level}</span>
                  <span className="truncate">{p.title}</span>
                </span>
              </Link>
            </li>
          );
        })}
        <li data-status={self.status} aria-current="true">
          <span className="pf-path__link is-self">
            <OkrRing value={self.progress} status={self.status} size={30} stroke={3} label={<span />} />
            <span className="pf-path__text">
              <span className="pf-path__lvl">This objective</span>
              <span className="truncate">{self.o.title}</span>
            </span>
          </span>
        </li>
        {kids.map((c) => (
          <li key={c.o.id} data-status={c.status} className="pf-path__child">
            <Link to={`/performance/okrs/${c.o.id}`} className="pf-path__link">
              <OkrRing value={c.progress} status={c.status} size={26} stroke={3} label={<span />} />
              <span className="pf-path__text">
                <span className="pf-path__lvl">
                  {c.o.level} · {ctx.first(c.o.ownerId)}
                </span>
                <span className="truncate">{c.o.title}</span>
              </span>
              <span className="neo-mono pf-faint text-xs">{pctText(c.progress)}</span>
            </Link>
          </li>
        ))}
      </ol>
      {!chain.length && self.o.level !== 'company' && <p className="neo-hint">Not aligned yet — edit the objective to align it to a team or company objective.</p>}
      {!kids.length && self.o.level !== 'individual' && <p className="neo-hint">No objectives align to this yet.</p>}
    </section>
  );
}

function LinkedProjects({ status, items }: { status: 'loading' | 'ready' | 'unavailable'; items: BridgeProject[] }) {
  return (
    <section className="neo-card pf-section" aria-label="Linked projects">
      <header className="pf-section__head">
        <span className="pf-section__icon">
          <FolderKanban />
        </span>
        <div className="pf-section__titles">
          <div className="neo-hud">Helix Projects</div>
          <h2 className="pf-section__title">Linked work</h2>
        </div>
      </header>
      {status === 'loading' ? (
        <p className="pf-faint text-sm">Looking for projects…</p>
      ) : status === 'unavailable' ? (
        <p className="pf-faint text-sm">Helix Projects isn’t reachable right now — linked work will appear when it is.</p>
      ) : items.length ? (
        <div className="pf-stack">
          {items.map((p) => (
            <ProjectLine key={p.id} p={p} />
          ))}
        </div>
      ) : (
        <p className="pf-faint text-sm">No projects contribute to these key results yet. Link a key result from a project in Helix Projects.</p>
      )}
    </section>
  );
}

function GradeCard({ ctx, o, krs, canEdit, onReopen }: { ctx: PerfCtx; o: Objective; krs: KeyResult[]; canEdit: boolean; onReopen: () => void }) {
  const score = objectiveScore(krs) ?? 0;
  return (
    <section className="neo-card neo-spot pf-section pf-gradecard" data-band={score >= 0.7 ? 'great' : score >= 0.4 ? 'solid' : 'missed'} aria-label="Final grade">
      <div className="pf-gradecard__top">
        <Award aria-hidden="true" />
        <div>
          <div className="neo-hud">Closed {o.closedAt ? shortDate(o.closedAt) : ''}</div>
          <div className="pf-gradecard__score">
            <b className="neo-num">{score.toFixed(1)}</b> {scoreLabel(score)}
          </div>
        </div>
      </div>
      <ul className="pf-gradecard__krs">
        {krs.map((k) => (
          <li key={k.id}>
            <span className="truncate">{k.title}</span>
            <b className="neo-mono">{(k.score ?? 0).toFixed(1)}</b>
          </li>
        ))}
      </ul>
      {o.reflection && <blockquote className="pf-gradecard__quote">“{o.reflection}”</blockquote>}
      <div className="pf-row">
        <span className="pf-faint text-xs">Graded by {ctx.first(o.closedBy)}</span>
        <span className="pf-spacer" />
        {canEdit && (
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={onReopen}>
            <RotateCcw /> Reopen
          </button>
        )}
      </div>
    </section>
  );
}
