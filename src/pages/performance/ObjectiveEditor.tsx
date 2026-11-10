/**
 * OKR editors: create/edit an objective (with "Draft with Nova" from one
 * sentence and the live KR quality checker), add/edit a key result, and the
 * end-of-quarter close & grade flow.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Award, Check, ChevronDown, Compass, Flag, Globe, Lock, Plus, Sparkles, Target, Wand2, X } from 'lucide-react';
import { NovaChip, PeoplePicker } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { burstConfetti } from '@/lib/confetti';
import { cx } from '@/lib/cx';
import { useHotkeys } from '@/hooks/useHotkeys';
import { canCreateObjective } from '@/performance/access';
import { checkKrQuality, draftObjective, type DraftKr, type DraftObjective } from '@/performance/nova';
import { formatValue, krProgress, scoreLabel, suggestedScore } from '@/performance/okr';
import { currentPeriod, krsOf, visibleObjectives } from '@/performance/selectors';
import { usePerf, type KrInput } from '@/performance/store';
import type { KeyResult, MetricType, OkrLevel, Visibility } from '@/performance/types';
import { toast } from '@/store/toast';
import { useMinute, usePerfCtx, type PerfCtx } from './hooks';
import { Kbd, NovaBox, NovaThinking, PfModal, Seg, useNova } from './ui';

const LEVEL_RANK: Record<OkrLevel, number> = { company: 0, team: 1, individual: 2 };
const METRICS: { value: MetricType; label: string }[] = [
  { value: 'number', label: 'Number' },
  { value: 'percent', label: 'Percent' },
  { value: 'currency', label: 'Currency' },
  { value: 'milestone', label: 'Milestones' },
  { value: 'boolean', label: 'Yes / no' },
];

/* ───────── KR draft model ───────── */

export interface KrDraft {
  key: string;
  title: string;
  metric: MetricType;
  start: string;
  target: string;
  unit: string;
  ceiling: boolean;
  decimals?: number;
  milestones: string[];
  ownerId?: string;
}

let krSeq = 0;
const blankKr = (): KrDraft => ({ key: `k${++krSeq}`, title: '', metric: 'number', start: '0', target: '', unit: '', ceiling: false, milestones: ['', ''] });
const fromDraft = (k: DraftKr): KrDraft => ({
  key: `k${++krSeq}`,
  title: k.title,
  metric: k.metric,
  start: String(k.start),
  target: String(k.target),
  unit: k.unit ?? '',
  ceiling: !!k.ceiling,
  decimals: k.decimals,
  milestones: k.milestones?.length ? [...k.milestones] : ['', ''],
});

/** `2.4M` → 2400000, `62%` → 62, `$1,200` → 1200. */
export function parseNum(s: string): number {
  const t = s.trim().replace(/[,\s$%]/g, '');
  const m = t.match(/^(-?\d*\.?\d+)([kKmM]?)$/);
  if (!m) return Number.NaN;
  const n = Number(m[1]);
  return m[2].toLowerCase() === 'm' ? n * 1e6 : m[2].toLowerCase() === 'k' ? n * 1e3 : n;
}

function toInput(k: KrDraft): KrInput {
  return {
    title: k.title.trim(),
    metric: k.metric,
    start: k.metric === 'boolean' || k.metric === 'milestone' ? 0 : parseNum(k.start || '0'),
    target: k.metric === 'boolean' ? 1 : k.metric === 'milestone' ? k.milestones.filter((m) => m.trim()).length : parseNum(k.target),
    unit: k.metric === 'number' ? k.unit.trim() || undefined : undefined,
    decimals: k.decimals,
    ceiling: (k.metric === 'number' || k.metric === 'currency') && k.ceiling ? true : undefined,
    ownerId: k.ownerId,
    milestones: k.metric === 'milestone' ? k.milestones.map((m) => m.trim()).filter(Boolean) : undefined,
  };
}

/* ───────── KR quality (Nova) ───────── */

function KrQualityBar({ draft, periodLabel, onApply }: { draft: KrDraft; periodLabel: string; onApply: (title: string) => void }) {
  const input = toInput(draft);
  const q = checkKrQuality({ title: input.title, metric: input.metric, start: Number.isFinite(input.start) ? input.start : 0, target: Number.isFinite(input.target) ? input.target : 0, unit: input.unit, ceiling: input.ceiling }, periodLabel);
  if (draft.title.trim().length < 4) return null;
  const missing = q.checks.filter((c) => !c.pass);
  const level = q.score >= 84 ? 'good' : q.score >= 60 ? 'ok' : 'low';
  return (
    <div className="pf-krq" data-level={level} aria-live="polite">
      <span className="pf-krq__score" title="Nova checks that the key result is measurable, has a baseline and target, and describes an outcome">
        <Sparkles aria-hidden="true" /> Quality <b>{q.score}%</b>
      </span>
      {missing.length === 0 ? (
        <span className="pf-krq__ok">
          <Check aria-hidden="true" /> Measurable outcome with a baseline and target
        </span>
      ) : (
        missing.map((c) => (
          <span key={c.id} className="pf-krq__miss" title={c.tip} data-tip={c.tip}>
            {c.label}
          </span>
        ))
      )}
      {q.rewrite && q.rewrite.toLowerCase() !== draft.title.trim().toLowerCase() && (
        <button type="button" className="pf-krq__apply" onClick={() => onApply(q.rewrite!)} title="Apply Nova’s rewrite">
          <Wand2 aria-hidden="true" /> Try “{q.rewrite}”
        </button>
      )}
    </div>
  );
}

/* ───────── KR fields ───────── */

function KrFields({
  ctx,
  draft,
  index,
  periodLabel,
  onChange,
  onRemove,
  lockMetric,
  ownerFallback,
}: {
  ctx: PerfCtx;
  draft: KrDraft;
  index?: number;
  periodLabel: string;
  onChange: (p: Partial<KrDraft>) => void;
  onRemove?: () => void;
  lockMetric?: boolean;
  ownerFallback: string;
}) {
  const owner = ctx.user(draft.ownerId ?? ownerFallback);
  const numeric = draft.metric === 'number' || draft.metric === 'percent' || draft.metric === 'currency';
  const placeholder =
    draft.metric === 'percent'
      ? 'e.g. Raise passkey enrolment from 62% to 95%'
      : draft.metric === 'currency'
        ? 'e.g. Grow new GCC ARR from $0 to $2.4M'
        : draft.metric === 'milestone'
          ? 'e.g. Deliver the Prism v4 migration'
          : draft.metric === 'boolean'
            ? 'e.g. Passkey login is live for every employee'
            : 'e.g. Cut password-reset tickets from 140 to 20 a month';
  return (
    <div className="pf-krf">
      <div className="pf-krf__row">
        {index !== undefined && <span className="pf-krf__idx neo-mono">KR{index + 1}</span>}
        <input className="neo-input" value={draft.title} onChange={(e) => onChange({ title: e.target.value })} placeholder={placeholder} aria-label={`Key result ${index !== undefined ? index + 1 : ''} title`} maxLength={140} />
        {onRemove && (
          <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={onRemove} aria-label="Remove key result">
            <X />
          </button>
        )}
      </div>
      <div className="pf-krf__row pf-krf__row--meta">
        <select className="neo-select neo-select--sm" value={draft.metric} disabled={lockMetric} onChange={(e) => onChange({ metric: e.target.value as MetricType })} aria-label="Metric type">
          {METRICS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        {numeric && (
          <>
            <label className="pf-krf__num">
              <span>{draft.ceiling ? 'Now' : 'Start'}</span>
              <input className="neo-input neo-input--sm" inputMode="decimal" value={draft.start} onChange={(e) => onChange({ start: e.target.value })} aria-label="Start value" />
            </label>
            <label className="pf-krf__num">
              <span>{draft.ceiling ? 'Limit' : 'Target'}</span>
              <input className="neo-input neo-input--sm" inputMode="decimal" value={draft.target} onChange={(e) => onChange({ target: e.target.value })} aria-label="Target value" placeholder={draft.metric === 'percent' ? '95' : draft.metric === 'currency' ? '2.4M' : '20'} />
            </label>
            {draft.metric === 'number' && (
              <label className="pf-krf__num pf-krf__num--unit">
                <span>Unit</span>
                <input className="neo-input neo-input--sm" value={draft.unit} onChange={(e) => onChange({ unit: e.target.value })} placeholder="days" aria-label="Unit" maxLength={20} />
              </label>
            )}
            {draft.metric !== 'percent' && (
              <label className="neo-check pf-krf__ceil" title="Lower is better and the target is a ceiling to stay under (e.g. ≤ 2 P1 incidents)">
                <input type="checkbox" checked={draft.ceiling} onChange={(e) => onChange({ ceiling: e.target.checked })} /> Stay under
              </label>
            )}
          </>
        )}
        {draft.metric === 'boolean' && <span className="pf-faint text-xs">Done or not done — use sparingly; numbers forecast better.</span>}
        <span className="pf-spacer" />
        <PeoplePicker
          value={[draft.ownerId ?? ownerFallback]}
          onChange={(ids) => onChange({ ownerId: ids[0] })}
          users={ctx.people}
          label="Key result owner"
          trigger={(p) => (
            <button {...p} type="button" className="pf-krf__owner" aria-label={`Owner: ${owner?.name ?? 'choose'}`} title={`Owner: ${owner?.name ?? 'choose'}`}>
              {owner && <Avatar user={owner} size={22} />}
              <span className="truncate">{owner?.name.split(' ')[0] ?? 'Owner'}</span>
              <ChevronDown aria-hidden="true" />
            </button>
          )}
        />
      </div>
      {draft.metric === 'milestone' && (
        <ol className="pf-krf__ms" aria-label="Milestones">
          {draft.milestones.map((m, i) => (
            <li key={i}>
              <Flag aria-hidden="true" />
              <input
                className="neo-input neo-input--sm"
                value={m}
                disabled={lockMetric}
                onChange={(e) => onChange({ milestones: draft.milestones.map((x, j) => (j === i ? e.target.value : x)) })}
                placeholder={`Milestone ${i + 1}`}
                aria-label={`Milestone ${i + 1}`}
              />
              {!lockMetric && draft.milestones.length > 2 && (
                <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label={`Remove milestone ${i + 1}`} onClick={() => onChange({ milestones: draft.milestones.filter((_, j) => j !== i) })}>
                  <X />
                </button>
              )}
            </li>
          ))}
          {!lockMetric && draft.milestones.length < 8 && (
            <li>
              <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => onChange({ milestones: [...draft.milestones, ''] })}>
                <Plus /> Milestone
              </button>
            </li>
          )}
        </ol>
      )}
      <KrQualityBar draft={draft} periodLabel={periodLabel} onApply={(title) => onChange({ title })} />
    </div>
  );
}

/* ───────── Objective editor ───────── */

const EXAMPLES: Record<string, string[]> = {
  Engineering: ['Get productive fast in my first quarter on the platform team', 'Make our APIs feel instant for customers', 'Cut on-call pages so the team can focus'],
  Design: ['Make Prism v4 the obvious choice for every team', 'Ground every design decision in customer research', 'Raise accessibility across the product'],
  Sales: ['Win our first enterprise logos in Saudi Arabia', 'Build a pipeline we can forecast with confidence', 'Shorten our sales cycle'],
  'People Ops': ['Make onboarding something people rave about', 'Make feedback a weekly habit across the company', 'Hire the GCC go-to-market team'],
  Finance: ['Close the books in three days', 'Automate bank reconciliations', 'Give managers real-time budget visibility'],
};
const GENERIC_EXAMPLES = ['Make our customers’ first week delightful', 'Cut the time it takes to ship a change', 'Grow my craft as a mentor'];

export interface ObjectiveEditorProps {
  open: boolean;
  onClose: () => void;
  /** Edit an existing objective (KRs are edited on the detail page). */
  editId?: string;
  defaults?: { periodId?: string; level?: OkrLevel; parentId?: string; ownerId?: string };
  onSaved?: (id: string) => void;
}

export function ObjectiveEditor(props: ObjectiveEditorProps) {
  // Remount per open so every session starts fresh.
  if (!props.open) return null;
  return <ObjectiveEditorDialog {...props} />;
}

function ObjectiveEditorDialog({ open, onClose, editId, defaults, onSaved }: ObjectiveEditorProps) {
  const ctx = usePerfCtx()!;
  const now = useMinute();
  const data = usePerf();
  const editing = editId ? data.objectives.find((o) => o.id === editId) : undefined;
  const period = data.periods.find((p) => p.id === (editing?.periodId ?? defaults?.periodId)) ?? currentPeriod(data, now);

  const [step, setStep] = useState<'describe' | 'form'>(editing ? 'form' : 'describe');
  const [goal, setGoal] = useState('');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [level, setLevel] = useState<OkrLevel>(editing?.level ?? defaults?.level ?? 'individual');
  const [ownerId, setOwnerId] = useState(editing?.ownerId ?? defaults?.ownerId ?? ctx.me.id);
  const [coOwnerIds, setCoOwnerIds] = useState<string[]>(editing?.coOwnerIds ?? []);
  const [parentId, setParentId] = useState(editing?.parentId ?? defaults?.parentId ?? '');
  const [visibility, setVisibility] = useState<Visibility>(editing?.visibility ?? 'public');
  const [tags, setTags] = useState((editing?.tags ?? []).join(', '));
  const [krs, setKrs] = useState<KrDraft[]>(() => [blankKr(), blankKr()]);
  const [suggestedParent, setSuggestedParent] = useState<string | undefined>();
  const draftRef = useRef<DraftObjective | null>(null);
  const goalRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const owner = ctx.user(ownerId);
  const parents = useMemo(
    () => visibleObjectives(data, ctx.v, ctx.users, period.id).filter((o) => LEVEL_RANK[o.level] < LEVEL_RANK[level] && o.id !== editId && o.state === 'active'),
    [data, ctx, period.id, level, editId],
  );
  const parentChoices = useMemo(() => visibleObjectives(data, ctx.v, ctx.users, period.id).filter((o) => o.level !== 'individual' && o.state === 'active'), [data, ctx, period.id]);

  const nova = useNova(
    () => {
      const d = draftObjective(goal, { department: owner?.department, parents: parentChoices });
      draftRef.current = d;
      const lines = [`Objective — ${d.title}`, '', ...d.keyResults.map((k, i) => `KR${i + 1} · ${k.title}`), ''];
      if (d.parentTitle) lines.push(`Aligns to — ${d.parentTitle}`);
      lines.push(d.rationale);
      return lines.join('\n');
    },
    'objective-draft',
    700,
  );

  useEffect(() => {
    if (step === 'describe') goalRef.current?.focus();
    else titleRef.current?.focus();
  }, [step]);

  const useDraft = () => {
    const d = draftRef.current;
    if (!d) return;
    setTitle(d.title);
    setDescription(d.description);
    setKrs(d.keyResults.map(fromDraft));
    if (d.parentId) {
      const p = parentChoices.find((x) => x.id === d.parentId);
      // a team draft can only align to a company objective
      if (p && LEVEL_RANK[p.level] < LEVEL_RANK[level]) {
        setParentId(d.parentId);
        setSuggestedParent(d.parentId);
      }
    }
    setStep('form');
  };

  const levelOptions = (['individual', 'team', 'company'] as OkrLevel[]).map((l) => {
    const c = canCreateObjective(ctx.v, ctx.users, l, l === 'individual' ? ownerId : ctx.me.id);
    return { value: l, label: l === 'individual' ? 'Individual' : l === 'team' ? 'Team' : 'Company', title: c.ok ? undefined : c.reason, ok: c.ok };
  });

  const submit = () => {
    const tagList = tags
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean);
    if (editing) {
      const res = usePerf.getState().updateObjective(editing.id, { title, description, visibility, tags: tagList, parentId: parentId || '', ownerId, coOwnerIds });
      if (!res.ok) return toast.error(res.error);
      toast.success('Objective updated');
      onSaved?.(editing.id);
      onClose();
      return;
    }
    const filled = krs.filter((k) => k.title.trim());
    if (!filled.length) return toast.error('Add at least one key result', 'Key results are how you’ll know you got there.');
    const res = usePerf.getState().createObjective({
      title,
      description,
      level,
      ownerId,
      coOwnerIds,
      periodId: period.id,
      parentId: parentId || undefined,
      visibility,
      tags: tagList,
      keyResults: filled.map(toInput),
    });
    if (!res.ok) return toast.error(res.error);
    const firstEver = !data.objectives.some((o) => o.ownerId === ownerId);
    burstConfetti();
    toast.success(firstEver ? 'Your first objective is live' : 'Objective created', firstEver ? 'Check in weekly and Nova will forecast where you’ll land.' : `${filled.length} key result${filled.length === 1 ? '' : 's'} · ${period.label}`);
    onSaved?.(res.id);
    onClose();
  };

  useHotkeys({ 'mod+enter': () => (step === 'form' ? submit() : goal.trim().length > 6 && nova.run()) }, open);

  const examples = EXAMPLES[owner?.department ?? ''] ?? GENERIC_EXAMPLES;

  if (step === 'describe') {
    return (
      <PfModal
        open={open}
        onClose={onClose}
        width={720}
        icon={<Compass />}
        title="New objective"
        subtitle={`${period.label} · describe it in one sentence — Nova drafts the rest`}
        footer={
          <>
            <button type="button" className="neo-btn neo-btn--ghost" onClick={() => setStep('form')} data-qa="okr-scratch">
              Start from scratch
            </button>
            <span className="grow" />
            {nova.done ? (
              <button type="button" className="neo-btn neo-btn--plasma" onClick={useDraft} data-qa="okr-use-draft">
                <Check /> Use this draft
              </button>
            ) : (
              <button type="button" className="neo-btn neo-btn--nova" onClick={nova.run} disabled={goal.trim().length < 6 || nova.thinking} data-qa="okr-draft">
                <NovaChip>Draft with Nova</NovaChip>
              </button>
            )}
          </>
        }
      >
        <div className="pf-ed">
          <label className="neo-field">
            <span className="neo-label">What do you want to achieve this quarter?</span>
            <textarea
              ref={goalRef}
              className="neo-textarea pf-ed__goal"
              rows={3}
              value={goal}
              onChange={(e) => {
                setGoal(e.target.value);
                if (nova.text) nova.clear();
              }}
              placeholder="e.g. Get productive fast in my first quarter on the platform team"
              maxLength={240}
              data-qa="okr-goal"
            />
          </label>
          <div className="pf-ed__examples" aria-label="Examples">
            <span className="neo-hud">Try</span>
            {examples.map((x) => (
              <button
                key={x}
                type="button"
                className="pf-ed__example"
                onClick={() => {
                  setGoal(x);
                  if (nova.text) nova.clear();
                }}
              >
                {x}
              </button>
            ))}
          </div>
          {(nova.thinking || nova.text) && (
            <NovaBox title="Nova draft" hud={nova.done ? 'Editable on the next step' : undefined} className="pf-ed__draft">
              {nova.thinking ? (
                <NovaThinking label="Drafting your objective" />
              ) : (
                <pre className={cx('pf-ed__draftText', !nova.done && 'pf-caret')}>{nova.shown}</pre>
              )}
            </NovaBox>
          )}
          {!nova.thinking && !nova.text && (
            <ul className="pf-ed__how">
              <li>
                <Target aria-hidden="true" /> Three measurable key results with baselines and targets
              </li>
              <li>
                <Compass aria-hidden="true" /> Aligned to the best-matching team or company objective
              </li>
              <li>
                <Sparkles aria-hidden="true" /> Everything stays editable before you save
              </li>
            </ul>
          )}
        </div>
      </PfModal>
    );
  }

  const parentObj = parents.find((p) => p.id === parentId);
  return (
    <PfModal
      open={open}
      onClose={onClose}
      width={820}
      icon={editing ? <Target /> : <Compass />}
      title={editing ? 'Edit objective' : 'New objective'}
      subtitle={`${period.label}${editing ? ` · ${editing.level} objective` : ''}`}
      footer={
        <>
          {!editing && (
            <button type="button" className="neo-btn neo-btn--ghost" onClick={() => setStep('describe')}>
              <ArrowLeft /> Back
            </button>
          )}
          <span className="pf-hint-row grow">
            <Kbd>⌘</Kbd>
            <Kbd>Enter</Kbd> to save
          </span>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={submit} data-qa="okr-save">
            <Check /> {editing ? 'Save changes' : 'Create objective'}
          </button>
        </>
      }
    >
      <div className="pf-ed pf-ed--form">
        <label className="neo-field">
          <span className="neo-label">Objective</span>
          <input ref={titleRef} className="neo-input pf-ed__title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Qualitative and inspiring, e.g. Make onboarding something people rave about" maxLength={120} data-qa="okr-title" />
        </label>
        <label className="neo-field">
          <span className="neo-label">Why it matters (optional)</span>
          <textarea className="neo-textarea" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="The context someone new would need" maxLength={600} />
        </label>

        <div className="pf-ed__grid">
          <div className="neo-field">
            <span className="neo-label">Level</span>
            {editing ? (
              <span className="pf-ed__static">{level === 'individual' ? 'Individual' : level === 'team' ? 'Team' : 'Company'}</span>
            ) : (
              <Seg
                label="Level"
                value={level}
                onChange={(l) => {
                  const opt = levelOptions.find((o) => o.value === l);
                  if (!opt?.ok) return toast.info(opt?.title ?? 'Not available');
                  setLevel(l);
                  if (parentId && !visibleObjectives(data, ctx.v, ctx.users, period.id).some((o) => o.id === parentId && LEVEL_RANK[o.level] < LEVEL_RANK[l])) setParentId('');
                }}
                options={levelOptions.map((o) => ({ value: o.value, label: o.ok ? o.label : <span className="pf-ed__locked">{o.label}</span>, title: o.title }))}
              />
            )}
          </div>
          <div className="neo-field">
            <span className="neo-label">Owner</span>
            <PeoplePicker
              value={[ownerId]}
              onChange={(ids) => ids[0] && setOwnerId(ids[0])}
              users={ctx.people}
              label="Objective owner"
              trigger={(p) => (
                <button {...p} type="button" className="pf-ed__person">
                  {owner && <Avatar user={owner} size={24} />}
                  <span className="truncate">{owner?.name ?? 'Choose owner'}</span>
                  <ChevronDown aria-hidden="true" />
                </button>
              )}
            />
          </div>
          <div className="neo-field">
            <span className="neo-label">Visibility</span>
            <Seg
              label="Visibility"
              value={visibility}
              onChange={setVisibility}
              options={[
                {
                  value: 'public',
                  label: (
                    <>
                      <Globe aria-hidden="true" /> Public
                    </>
                  ),
                  title: 'Everyone can see it and align to it',
                },
                {
                  value: 'private',
                  label: (
                    <>
                      <Lock aria-hidden="true" /> Private
                    </>
                  ),
                  title: 'Owners, their managers and People Ops',
                },
              ]}
            />
          </div>
          <div className="neo-field">
            <span className="neo-label">Co-owners</span>
            <PeoplePicker
              multiple
              value={coOwnerIds}
              onChange={(ids) => setCoOwnerIds(ids.filter((id) => id !== ownerId).slice(0, 4))}
              users={ctx.people}
              label="Co-owners"
              trigger={(p) => (
                <button {...p} type="button" className="pf-ed__person">
                  {coOwnerIds.length ? (
                    <span className="pf-ed__faces">
                      {coOwnerIds.map((id) => {
                        const u = ctx.user(id);
                        return u ? <Avatar key={id} user={u} size={22} /> : null;
                      })}
                    </span>
                  ) : (
                    <span className="pf-faint">None</span>
                  )}
                  <ChevronDown aria-hidden="true" />
                </button>
              )}
            />
          </div>
        </div>

        <div className="pf-ed__grid pf-ed__grid--2">
          <label className="neo-field">
            <span className="neo-label">
              Aligns to {suggestedParent && suggestedParent === parentId && <span className="pf-ed__nova">Suggested by Nova</span>}
            </span>
            {level === 'company' ? (
              <span className="pf-ed__static">Company objectives are the top of the tree</span>
            ) : (
              <select className="neo-select" value={parentId} onChange={(e) => setParentId(e.target.value)} data-qa="okr-parent">
                <option value="">Not aligned</option>
                {(['company', 'team'] as OkrLevel[]).map((l) => {
                  const list = parents.filter((p) => p.level === l);
                  return list.length ? (
                    <optgroup key={l} label={l === 'company' ? 'Company objectives' : 'Team objectives'}>
                      {list.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title} — {ctx.first(p.ownerId)}
                        </option>
                      ))}
                    </optgroup>
                  ) : null;
                })}
              </select>
            )}
            {level !== 'company' && !parentObj && <span className="neo-hint">Aligned objectives show up in the Goal Galaxy and roll up to their parent.</span>}
          </label>
          <label className="neo-field">
            <span className="neo-label">Tags</span>
            <input className="neo-input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="security, q4-launch" />
          </label>
        </div>

        {!editing && (
          <section className="pf-ed__krs" aria-label="Key results">
            <div className="pf-ed__krshead">
              <span className="neo-label">Key results</span>
              <span className="neo-hint">2–4 measurable outcomes · Nova checks each one as you type</span>
            </div>
            {krs.map((k, i) => (
              <KrFields
                key={k.key}
                ctx={ctx}
                draft={k}
                index={i}
                periodLabel={period.label}
                ownerFallback={ownerId}
                onChange={(p) => setKrs((list) => list.map((x) => (x.key === k.key ? { ...x, ...p } : x)))}
                onRemove={krs.length > 1 ? () => setKrs((list) => list.filter((x) => x.key !== k.key)) : undefined}
              />
            ))}
            {krs.length < 7 && (
              <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => setKrs((l) => [...l, blankKr()])}>
                <Plus /> Add key result
              </button>
            )}
          </section>
        )}
      </div>
    </PfModal>
  );
}

/* ───────── Key result editor ───────── */

export function KrEditor({ open, onClose, objectiveId, krId }: { open: boolean; onClose: () => void; objectiveId: string; krId?: string }) {
  if (!open) return null;
  return <KrEditorDialog onClose={onClose} objectiveId={objectiveId} krId={krId} />;
}

function KrEditorDialog({ onClose, objectiveId, krId }: { onClose: () => void; objectiveId: string; krId?: string }) {
  const ctx = usePerfCtx()!;
  const data = usePerf();
  const o = data.objectives.find((x) => x.id === objectiveId);
  const kr = krId ? data.keyResults.find((k) => k.id === krId) : undefined;
  const period = data.periods.find((p) => p.id === o?.periodId) ?? data.periods[0];
  const [draft, setDraft] = useState<KrDraft>(() =>
    kr
      ? {
          key: kr.id,
          title: kr.title,
          metric: kr.metric,
          start: String(kr.start),
          target: String(kr.target),
          unit: kr.unit ?? '',
          ceiling: !!kr.ceiling,
          decimals: kr.decimals,
          milestones: kr.milestones?.map((m) => m.title) ?? ['', ''],
          ownerId: kr.ownerId,
        }
      : blankKr(),
  );
  if (!o) return null;

  const submit = () => {
    const input = toInput(draft);
    if (kr) {
      const patch: Parameters<ReturnType<typeof usePerf.getState>['updateKeyResult']>[1] = { title: input.title, ownerId: input.ownerId ?? kr.ownerId };
      if (kr.metric !== 'boolean' && kr.metric !== 'milestone') {
        if (!Number.isFinite(input.start) || !Number.isFinite(input.target)) return toast.error('Start and target must be numbers.');
        patch.start = input.start;
        patch.target = input.target;
        if (kr.metric === 'number') patch.unit = input.unit;
      }
      const res = usePerf.getState().updateKeyResult(kr.id, patch);
      if (!res.ok) return toast.error(res.error);
      toast.success('Key result updated');
      onClose();
      return;
    }
    const res = usePerf.getState().addKeyResult(o.id, input);
    if (!res.ok) return toast.error(res.error);
    toast.success('Key result added', 'Check in weekly to grow its forecast.');
    onClose();
  };

  return (
    <PfModal
      open
      onClose={onClose}
      width={720}
      icon={<Target />}
      title={kr ? 'Edit key result' : 'Add key result'}
      subtitle={o.title}
      footer={
        <>
          <span className="grow" />
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={submit} data-qa="kr-save">
            <Check /> {kr ? 'Save' : 'Add key result'}
          </button>
        </>
      }
    >
      <div className="pf-ed">
        <KrFields ctx={ctx} draft={draft} periodLabel={period.label} ownerFallback={o.ownerId} lockMetric={!!kr} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} />
        {kr && (kr.metric === 'milestone' || kr.metric === 'boolean') && <p className="neo-hint">The metric type and milestones are fixed once check-ins exist — add a new key result to change them.</p>}
      </div>
    </PfModal>
  );
}

/* ───────── Close & grade ───────── */

function draftReflection(krs: KeyResult[], scores: Record<string, number>, nameOf: (id: string) => string): string {
  if (!krs.length) return '';
  const graded = krs.map((k) => ({ k, s: scores[k.id] ?? suggestedScore(k) })).sort((a, b) => b.s - a.s);
  const landed = graded.filter((g) => g.s >= 0.7).length;
  const avg = graded.reduce((t, g) => t + g.s, 0) / graded.length;
  const best = graded[0];
  const worst = graded[graded.length - 1];
  const parts = [`We landed ${landed} of ${graded.length} key result${graded.length === 1 ? '' : 's'} at 0.7 or better (average ${avg.toFixed(1)} — ${scoreLabel(avg).toLowerCase()}).`];
  parts.push(`The biggest win was “${best.k.title}”, which finished at ${formatValue(best.k, best.k.current)} against ${formatValue(best.k, best.k.target)}.`);
  if (worst !== best && worst.s < 0.7) {
    const note = [...worst.k.checkins].sort((a, b) => b.at - a.at).find((c) => c.note)?.note;
    parts.push(`“${worst.k.title}” fell short at ${formatValue(worst.k, worst.k.current)}${note ? ` — ${nameOf(worst.k.ownerId).split(' ')[0]} noted: “${note.slice(0, 120)}”` : ''}.`);
    parts.push(`Next quarter we’ll carry the lesson forward: agree owners for blockers earlier and check in weekly so the forecast flags risk sooner.`);
  } else parts.push('Next quarter we’ll raise the bar — these targets were within reach, so the next ones should stretch us further.');
  return parts.join(' ');
}

export function GradeModal({ open, onClose, objectiveId }: { open: boolean; onClose: () => void; objectiveId: string }) {
  if (!open) return null;
  return <GradeDialog onClose={onClose} objectiveId={objectiveId} />;
}

function GradeDialog({ onClose, objectiveId }: { onClose: () => void; objectiveId: string }) {
  const ctx = usePerfCtx()!;
  const data = usePerf();
  const o = data.objectives.find((x) => x.id === objectiveId);
  const krs = useMemo(() => krsOf(data, objectiveId), [data, objectiveId]);
  const [scores, setScores] = useState<Record<string, number>>(() => Object.fromEntries(krs.map((k) => [k.id, k.score ?? suggestedScore(k)])));
  const [reflection, setReflection] = useState(o?.reflection ?? '');
  const nova = useNova(() => draftReflection(krs, scores, ctx.name), 'grade', 600);
  if (!o) return null;
  const avg = krs.length ? krs.reduce((t, k) => t + (scores[k.id] ?? 0), 0) / krs.length : 0;

  const submit = () => {
    const res = usePerf.getState().closeObjective(o.id, scores, reflection);
    if (!res.ok) return toast.error(res.error);
    if (avg >= 0.7) burstConfetti();
    toast.success(`Graded ${avg.toFixed(1)} — ${scoreLabel(avg)}`, 'The objective is closed. Its story stays in your evidence for reviews.');
    onClose();
  };

  return (
    <PfModal
      open
      onClose={onClose}
      width={760}
      icon={<Award />}
      title="Close & grade"
      subtitle={o.title}
      footer={
        <>
          <span className="pf-hint-row grow">0.7 is great for an ambitious key result</span>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={submit} data-qa="grade-save">
            <Award /> Close with {avg.toFixed(1)}
          </button>
        </>
      }
    >
      <div className="pf-grade">
        <div className="pf-grade__total" data-band={avg >= 0.7 ? 'great' : avg >= 0.4 ? 'solid' : 'missed'}>
          <span className="neo-hud">Objective score</span>
          <b className="neo-num">{avg.toFixed(1)}</b>
          <span>{scoreLabel(avg)}</span>
        </div>
        <ul className="pf-grade__krs">
          {krs.map((k) => {
            const s = scores[k.id] ?? 0;
            return (
              <li key={k.id} className="pf-grade__kr">
                <div className="pf-grade__krhead">
                  <span className="pf-grade__krtitle">{k.title}</span>
                  <span className="pf-faint text-xs neo-mono">
                    {formatValue(k, k.current)} / {formatValue(k, k.target)} · {Math.round(krProgress(k) * 100)}%
                  </span>
                </div>
                <div className="pf-grade__slider">
                  <input
                    type="range"
                    className="pf-range"
                    min={0}
                    max={1}
                    step={0.1}
                    value={s}
                    onChange={(e) => setScores((m) => ({ ...m, [k.id]: Number(e.target.value) }))}
                    aria-label={`Grade for ${k.title}`}
                    style={{ ['--pct' as string]: `${s * 100}%` }}
                  />
                  <b className="neo-num pf-grade__val">{s.toFixed(1)}</b>
                  <span className="pf-grade__label">{scoreLabel(s)}</span>
                </div>
                {Math.abs(s - suggestedScore(k)) >= 0.1 && (
                  <button type="button" className="pf-link text-xs" onClick={() => setScores((m) => ({ ...m, [k.id]: suggestedScore(k) }))}>
                    Reset to suggested {suggestedScore(k).toFixed(1)}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <label className="neo-field">
          <span className="neo-label">Reflection</span>
          <textarea className="neo-textarea" rows={4} value={reflection} onChange={(e) => setReflection(e.target.value)} placeholder="What worked, what didn’t, and what you’ll do differently next quarter" maxLength={1200} />
        </label>
        <NovaBox
          title="Nova"
          hud="Drafts from your grades and check-in notes"
          actions={
            nova.done ? (
              <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={() => setReflection(nova.text)}>
                <Check /> Use this
              </button>
            ) : (
              <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={nova.run} disabled={nova.thinking} data-qa="grade-nova">
                <Sparkles /> Draft reflection
              </button>
            )
          }
        >
          {nova.thinking ? <NovaThinking label="Reading your check-ins" /> : nova.text ? <p className={cx(!nova.done && 'pf-caret')}>{nova.shown}</p> : <p className="pf-faint">Nova summarizes the wins, the misses and the lesson — you edit before saving.</p>}
        </NovaBox>
      </div>
    </PfModal>
  );
}

