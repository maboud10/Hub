/**
 * Automations — "Autopilot" for a project. Rules read WHEN → IF → THEN and are
 * drawn as a little circuit. Rules execute in the store when triggers fire
 * (posts go to Pulse through the chat bridge). Presets, enable/disable, run
 * count + last run, and a builder with a live plain-English preview.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlarmClock,
  ArrowRightLeft,
  BellRing,
  Bot,
  CircleCheckBig,
  Copy,
  Flame,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  UserPlus,
  UserRound,
  X,
  Zap,
} from 'lucide-react';
import { NeoEmpty, NeoMenu, type MenuEntry } from '@/components/neo';
import { Modal } from '@/components/ui/Modal';
import { currentViewer, loadBridge, type BridgeChannel } from '@/lib/appBridge';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { toast } from '@/store/toast';
import { canEditProject } from '@/projects/access';
import { describeAction, describeCondition, describeTrigger, RULE_PRESETS, TRIGGER_LABEL } from '@/projects/automation';
import { PRIORITY_NAME } from '@/projects/nlp';
import { useProjects } from '@/projects/store';
import type { ActionKind, ConditionField, Priority, Project, Rule, RuleAction, RuleCondition, RuleTrigger, TriggerKind } from '@/projects/types';
import { useActor, useUsersMap } from '../ctx';
import { ConfirmModal, PRIORITIES, PriorityGlyph } from '../ui';

const TRIGGER_ICON: Record<TriggerKind, ReactNode> = {
  created: <Plus />,
  completed: <CircleCheckBig />,
  moved: <ArrowRightLeft />,
  assigned: <UserPlus />,
  'due-soon': <AlarmClock />,
};
const ACTION_ICON: Record<ActionKind, ReactNode> = {
  move: <ArrowRightLeft />,
  assign: <UserPlus />,
  priority: <Flame />,
  tag: <Tag />,
  notify: <BellRing />,
  post: <MessageSquare />,
};
const COND_ICON: Record<ConditionField, ReactNode> = { priority: <Flame />, assignee: <UserRound />, tag: <Tag /> };
const ACTION_LABEL: Record<ActionKind, string> = { move: 'Move to section', assign: 'Set assignee', priority: 'Set priority', tag: 'Add tag', notify: 'Notify someone', post: 'Post to Pulse' };
const COND_LABEL: Record<ConditionField, string> = { priority: 'Priority is', assignee: 'Assignee is', tag: 'Tag is' };
const TRIGGERS: TriggerKind[] = ['created', 'moved', 'completed', 'assigned', 'due-soon'];

type Draft = Pick<Rule, 'name' | 'trigger' | 'conditions' | 'actions'>;

function useChannels(): BridgeChannel[] {
  const [channels, setChannels] = useState<BridgeChannel[]>([]);
  useEffect(() => {
    const viewer = currentViewer();
    if (!viewer) return;
    let alive = true;
    loadBridge('chat')
      .then((api) => alive && setChannels(api.listChannels(viewer).filter((c) => c.kind === 'channel')))
      .catch(() => alive && setChannels([]));
    return () => {
      alive = false;
    };
  }, []);
  return channels;
}

export function AutomationsView({ project }: { project: Project }) {
  const actor = useActor();
  const users = useUsersMap();
  const allRules = useProjects((s) => s.rules);
  const store = useProjects.getState;
  const rules = useMemo(() => allRules.filter((r) => r.projectId === project.id), [allRules, project.id]);
  const channels = useChannels();
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [confirm, setConfirm] = useState<Rule | null>(null);
  const canEdit = actor ? canEditProject(project, actor) : false;
  const nameOf = (id: string) => users.get(id)?.name ?? 'someone';
  const channelName = (id: string) => {
    const c = channels.find((x) => x.id === id);
    return c ? `#${c.name.replace(/^#/, '')}` : `#${id.replace(/^ch-/, '')}`;
  };
  const active = rules.filter((r) => r.enabled).length;
  const runs = rules.reduce((a, r) => a + r.runs, 0);
  const lastRun = rules.reduce((mx, r) => Math.max(mx, r.lastRunAt ?? 0), 0);

  const blank = (): Draft => ({ name: '', trigger: { kind: 'created' }, conditions: [], actions: [{ kind: 'notify' }] });

  const toggle = (r: Rule) => {
    const res = store().updateRule(r.id, { enabled: !r.enabled });
    if (!res.ok) toast.error(res.error);
    else toast.success(r.enabled ? 'Rule paused' : 'Rule is live', r.name);
  };
  const duplicate = (r: Rule) => {
    const res = store().createRule(project.id, { name: `${r.name} (copy)`.slice(0, 60), trigger: r.trigger, conditions: r.conditions, actions: r.actions });
    toast.result(res, 'Rule duplicated');
  };

  return (
    <div className="neo-pad pj-auto">
      <section className="pj-auto__hero neo-card">
        <span className="pj-auto__orb" aria-hidden="true">
          <Bot />
        </span>
        <div className="pj-auto__intro">
          <h2 className="neo-title">Autopilot for {project.name}</h2>
          <p className="neo-muted text-sm">Rules run the moment a task is created, moved, completed, assigned or nears its due date — so the busywork happens on its own.</p>
        </div>
        <dl className="pj-auto__stats">
          <div>
            <dt>Live rules</dt>
            <dd className="neo-num">
              {active}
              <small>/{rules.length}</small>
            </dd>
          </div>
          <div>
            <dt>Runs</dt>
            <dd className="neo-num">{runs}</dd>
          </div>
          <div>
            <dt>Last run</dt>
            <dd>{lastRun ? relativeTime(lastRun) : '—'}</dd>
          </div>
        </dl>
        {canEdit && (
          <button type="button" className="neo-btn neo-btn--soft" onClick={() => setEditing({ id: null, draft: blank() })} data-qa="new-rule">
            <Plus /> New rule
          </button>
        )}
      </section>

      {rules.length === 0 ? (
        <NeoEmpty
          icon={<Zap />}
          title="No automations yet"
          action={
            canEdit ? (
              <button type="button" className="neo-btn neo-btn--plasma" onClick={() => setEditing({ id: null, draft: blank() })}>
                <Plus /> Build a rule
              </button>
            ) : undefined
          }
        >
          Start from a recipe below or build your own WHEN → IF → THEN rule.
        </NeoEmpty>
      ) : (
        <ul className="pj-rules">
          {rules.map((r) => {
            const menu: MenuEntry[] = [
              { label: 'Edit rule', icon: <Pencil />, disabled: !canEdit, onSelect: () => setEditing({ id: r.id, draft: { name: r.name, trigger: r.trigger, conditions: r.conditions, actions: r.actions } }) },
              { label: 'Duplicate', icon: <Copy />, disabled: !canEdit, onSelect: () => duplicate(r) },
              { kind: 'sep' },
              { label: 'Delete rule', icon: <Trash2 />, danger: true, disabled: !canEdit, onSelect: () => setConfirm(r) },
            ];
            return (
              <li key={r.id} className={cx('pj-rule', !r.enabled && 'is-off')}>
                <div className="pj-rule__head">
                  <span className="pj-rule__name">{r.name}</span>
                  <span className="pj-rule__runs">
                    {r.runs} {r.runs === 1 ? 'run' : 'runs'}
                    {r.lastRunAt ? ` · last ${relativeTime(r.lastRunAt)}` : ' · never run'}
                  </span>
                  <span className="grow" />
                  <button
                    type="button"
                    role="switch"
                    aria-checked={r.enabled}
                    aria-label={r.enabled ? `Pause ${r.name}` : `Turn on ${r.name}`}
                    className={cx('pj-switch', r.enabled && 'is-on')}
                    disabled={!canEdit}
                    title={canEdit ? undefined : 'Only editors can change automations'}
                    onClick={() => toggle(r)}
                    data-qa="rule-toggle"
                  >
                    <i />
                  </button>
                  <NeoMenu
                    items={menu}
                    width={200}
                    trigger={(p) => (
                      <button {...p} type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label={`Actions for ${r.name}`}>
                        <MoreHorizontal />
                      </button>
                    )}
                  />
                </div>
                <div className="pj-circuit" aria-label={`When ${describeTrigger(r.trigger, project)}`}>
                  <span className="pj-node2 pj-node2--when">
                    <span className="pj-node2__tag">When</span>
                    {TRIGGER_ICON[r.trigger.kind]}
                    <span>{describeTrigger(r.trigger, project)}</span>
                  </span>
                  {r.conditions.map((c, i) => (
                    <span key={`c${i}`} className="pj-node2 pj-node2--if">
                      <span className="pj-node2__tag">{i === 0 ? 'If' : 'And'}</span>
                      {COND_ICON[c.field]}
                      <span>{describeCondition(c, nameOf)}</span>
                    </span>
                  ))}
                  {r.actions.map((a, i) => (
                    <span key={`a${i}`} className="pj-node2 pj-node2--then">
                      <span className="pj-node2__tag">{i === 0 ? 'Then' : 'And'}</span>
                      {ACTION_ICON[a.kind]}
                      <span>{describeAction(a, project, nameOf, channelName)}</span>
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <section className="pj-recipes" aria-label="Recipes">
        <div className="neo-section-head">
          <Sparkles className="pj-ico" />
          <h2 className="neo-title">Recipes</h2>
          <span className="neo-faint text-xs">one click, then tweak</span>
        </div>
        <ul className="pj-recipes__grid">
          {RULE_PRESETS.map((pr) => {
            const built = pr.build(project);
            const exists = rules.some((r) => r.name === pr.name);
            const reason = !built ? (pr.id === 'celebrate' ? 'Link a Pulse channel in Share first' : 'Needs a matching section') : exists ? 'Already added' : !canEdit ? 'Editors only' : null;
            return (
              <li key={pr.id}>
                <button type="button" className="pj-recipe neo-spot" disabled={!!reason} onClick={() => built && setEditing({ id: null, draft: built })} title={reason ?? 'Customise and add'}>
                  <span className="pj-recipe__ico">{built ? TRIGGER_ICON[built.trigger.kind] : <Zap />}</span>
                  <span className="pj-recipe__name">{pr.name}</span>
                  <span className="pj-recipe__blurb">{pr.blurb}</span>
                  <span className="pj-recipe__cta">{reason ?? 'Use recipe'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {editing && (
        <RuleBuilder
          key={editing.id ?? 'new'}
          project={project}
          channels={channels}
          initial={editing.draft}
          ruleId={editing.id}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={`Delete “${confirm?.name ?? ''}”?`}
        confirmLabel="Delete rule"
        danger
        onConfirm={() => {
          if (!confirm) return;
          toast.result(store().deleteRule(confirm.id), 'Rule deleted');
        }}
      >
        The rule stops immediately and its run history ({confirm?.runs ?? 0} runs) is removed. Tasks it already changed stay as they are.
      </ConfirmModal>
    </div>
  );
}

/* ───────────────────────── builder ───────────────────────── */

function RuleBuilder({ project, channels, initial, ruleId, onClose }: { project: Project; channels: BridgeChannel[]; initial: Draft; ruleId: string | null; onClose: () => void }) {
  const users = useUsersMap();
  const store = useProjects.getState;
  const [d, setD] = useState<Draft>(initial);
  const members = project.members.map((m) => users.get(m.userId)).filter((u): u is NonNullable<typeof u> => !!u);
  const nameOf = (id: string) => users.get(id)?.name ?? 'someone';
  const channelName = (id: string) => {
    const c = channels.find((x) => x.id === id);
    return c ? `#${c.name.replace(/^#/, '')}` : `#${id.replace(/^ch-/, '')}`;
  };

  const setTrigger = (t: RuleTrigger) => setD((x) => ({ ...x, trigger: t }));
  const setCond = (i: number, c: RuleCondition | null) => setD((x) => ({ ...x, conditions: c ? x.conditions.map((y, j) => (j === i ? c : y)) : x.conditions.filter((_, j) => j !== i) }));
  const setAct = (i: number, a: RuleAction | null) => setD((x) => ({ ...x, actions: a ? x.actions.map((y, j) => (j === i ? a : y)) : x.actions.filter((_, j) => j !== i) }));

  const problems: string[] = [];
  if (!d.actions.length) problems.push('Add at least one action.');
  if (d.actions.some((a) => (a.kind === 'move' || a.kind === 'assign' || a.kind === 'priority' || a.kind === 'post') && !a.value)) problems.push('Finish every action.');
  if (d.actions.some((a) => a.kind === 'tag' && !(a.value ?? '').trim())) problems.push('Name the tag to add.');
  if (d.conditions.some((c) => !c.value.trim())) problems.push('Finish every condition.');
  const lc1 = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  const when =
    d.trigger.kind === 'due-soon'
      ? `a task is due within ${d.trigger.days ?? 2} ${(d.trigger.days ?? 2) === 1 ? 'day' : 'days'}`
      : d.trigger.kind === 'moved'
        ? `a task moves to ${project.sections.find((s) => s.id === d.trigger.sectionId)?.name ?? 'any section'}`
        : `a task is ${d.trigger.kind}`;
  const sentence = `When ${when}${d.conditions.length ? ` and ${d.conditions.map((c) => lc1(describeCondition(c, nameOf))).join(' and ')}` : ''}, then ${d.actions.map((a) => lc1(describeAction(a, project, nameOf, channelName))).join(', then ') || '…'}.`;
  const autoName = describeTrigger(d.trigger, project) + ' → ' + (d.actions[0] ? describeAction(d.actions[0], project, nameOf, channelName) : '…');

  const save = () => {
    if (problems.length) return toast.error(problems[0]);
    const payload: Draft = { ...d, name: d.name.trim() || autoName.slice(0, 60), actions: d.actions.map((a) => (a.kind === 'tag' ? { ...a, value: (a.value ?? '').trim().toLowerCase().replace(/\s+/g, '-') } : a)) };
    const r = ruleId ? store().updateRule(ruleId, payload) : store().createRule(project.id, payload);
    if (toast.result(r, ruleId ? 'Rule updated' : 'Rule is live')) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={ruleId ? 'Edit rule' : 'New rule'}
      subtitle={project.name}
      width={680}
      className="neo-portal pj-modal pj-builder"
      footer={
        <>
          <span className="neo-faint text-sm grow">{problems[0] ?? 'Ready to go live'}</span>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={save} disabled={problems.length > 0} data-qa="save-rule">
            <Zap /> {ruleId ? 'Save rule' : 'Turn on rule'}
          </button>
        </>
      }
    >
      <label className="neo-field">
        <span className="neo-label">Name</span>
        <input className="neo-input" value={d.name} onChange={(e) => setD((x) => ({ ...x, name: e.target.value }))} placeholder={autoName} maxLength={60} data-autofocus />
      </label>

      <div className="pj-builder__step" data-step="when">
        <span className="pj-builder__tag">When</span>
        <div className="pj-builder__triggers" role="radiogroup" aria-label="Trigger">
          {TRIGGERS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={d.trigger.kind === k}
              className={cx('pj-trig', d.trigger.kind === k && 'is-on')}
              onClick={() => setTrigger(k === 'due-soon' ? { kind: k, days: d.trigger.days ?? 2 } : k === 'moved' ? { kind: k, sectionId: d.trigger.sectionId } : { kind: k })}
            >
              {TRIGGER_ICON[k]}
              <span>{TRIGGER_LABEL[k]}</span>
            </button>
          ))}
        </div>
        {d.trigger.kind === 'moved' && (
          <label className="pj-builder__inline">
            <span>to</span>
            <select className="neo-select neo-select--sm" value={d.trigger.sectionId ?? ''} onChange={(e) => setTrigger({ kind: 'moved', sectionId: e.target.value || undefined })} aria-label="Section">
              <option value="">any section</option>
              {project.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {d.trigger.kind === 'due-soon' && (
          <label className="pj-builder__inline">
            <span>within</span>
            <input
              type="number"
              min={1}
              max={14}
              className="neo-input neo-input--sm pj-builder__num"
              value={d.trigger.days ?? 2}
              onChange={(e) => setTrigger({ kind: 'due-soon', days: Math.max(1, Math.min(14, Number(e.target.value) || 1)) })}
              aria-label="Days before due"
            />
            <span>days of the due date</span>
          </label>
        )}
      </div>

      <div className="pj-builder__step" data-step="if">
        <span className="pj-builder__tag">If</span>
        <div className="pj-builder__rows">
          {d.conditions.length === 0 && <span className="neo-faint text-sm">Any task (no conditions)</span>}
          {d.conditions.map((c, i) => (
            <div key={i} className="pj-builder__row">
              <select className="neo-select neo-select--sm" value={c.field} onChange={(e) => setCond(i, { field: e.target.value as ConditionField, value: e.target.value === 'priority' ? 'urgent' : e.target.value === 'assignee' ? 'none' : '' })} aria-label="Condition">
                {(Object.keys(COND_LABEL) as ConditionField[]).map((f) => (
                  <option key={f} value={f}>
                    {COND_LABEL[f]}
                  </option>
                ))}
              </select>
              {c.field === 'priority' && (
                <PrioritySelect value={c.value as Priority} onChange={(v) => setCond(i, { ...c, value: v })} />
              )}
              {c.field === 'assignee' && (
                <select className="neo-select neo-select--sm" value={c.value} onChange={(e) => setCond(i, { ...c, value: e.target.value })} aria-label="Assignee">
                  <option value="none">Nobody (unassigned)</option>
                  {members.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              )}
              {c.field === 'tag' && <input className="neo-input neo-input--sm" value={c.value} onChange={(e) => setCond(i, { ...c, value: e.target.value })} placeholder="e.g. customer" aria-label="Tag" />}
              <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label="Remove condition" onClick={() => setCond(i, null)}>
                <X />
              </button>
            </div>
          ))}
          {d.conditions.length < 3 && (
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs pj-builder__add" onClick={() => setD((x) => ({ ...x, conditions: [...x.conditions, { field: 'priority', value: 'urgent' }] }))}>
              <Plus /> Add condition
            </button>
          )}
        </div>
      </div>

      <div className="pj-builder__step" data-step="then">
        <span className="pj-builder__tag">Then</span>
        <div className="pj-builder__rows">
          {d.actions.map((a, i) => (
            <div key={i} className="pj-builder__row">
              <select
                className="neo-select neo-select--sm"
                value={a.kind}
                onChange={(e) => {
                  const kind = e.target.value as ActionKind;
                  setAct(i, { kind, value: kind === 'post' ? project.channelId : kind === 'priority' ? 'high' : undefined });
                }}
                aria-label="Action"
              >
                {(Object.keys(ACTION_LABEL) as ActionKind[]).map((k) => (
                  <option key={k} value={k}>
                    {ACTION_LABEL[k]}
                  </option>
                ))}
              </select>
              {a.kind === 'move' && (
                <select className="neo-select neo-select--sm" value={a.value ?? ''} onChange={(e) => setAct(i, { ...a, value: e.target.value || undefined })} aria-label="Section">
                  <option value="">Pick a section…</option>
                  {project.sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
              {(a.kind === 'assign' || a.kind === 'notify') && (
                <select className="neo-select neo-select--sm" value={a.value ?? ''} onChange={(e) => setAct(i, { ...a, value: e.target.value || undefined })} aria-label="Person">
                  <option value="">{a.kind === 'notify' ? 'The assignee' : 'Pick a person…'}</option>
                  {members.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              )}
              {a.kind === 'priority' && <PrioritySelect value={(a.value as Priority) ?? 'high'} onChange={(v) => setAct(i, { ...a, value: v })} />}
              {a.kind === 'tag' && <input className="neo-input neo-input--sm" value={a.value ?? ''} onChange={(e) => setAct(i, { ...a, value: e.target.value })} placeholder="e.g. needs-review" aria-label="Tag" />}
              {a.kind === 'post' && (
                <select className="neo-select neo-select--sm" value={a.value ?? ''} onChange={(e) => setAct(i, { ...a, value: e.target.value || undefined })} aria-label="Channel">
                  <option value="">Pick a channel…</option>
                  {project.channelId && !channels.some((c) => c.id === project.channelId) && <option value={project.channelId}>{channelName(project.channelId)} (project channel)</option>}
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.name.replace(/^#/, '')}
                      {c.id === project.channelId ? ' (project channel)' : ''}
                    </option>
                  ))}
                </select>
              )}
              {d.actions.length > 1 && (
                <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label="Remove action" onClick={() => setAct(i, null)}>
                  <X />
                </button>
              )}
            </div>
          ))}
          {d.actions.length < 4 && (
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs pj-builder__add" onClick={() => setD((x) => ({ ...x, actions: [...x.actions, { kind: 'tag', value: '' }] }))}>
              <Plus /> Add action
            </button>
          )}
        </div>
      </div>

      <div className="pj-builder__preview" aria-live="polite">
        <Zap />
        <span>{sentence}</span>
      </div>
    </Modal>
  );
}

function PrioritySelect({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  return (
    <span className="pj-builder__prio">
      <PriorityGlyph priority={value} />
      <select className="neo-select neo-select--sm" value={value} onChange={(e) => onChange(e.target.value as Priority)} aria-label="Priority">
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {PRIORITY_NAME[p]}
          </option>
        ))}
      </select>
    </span>
  );
}
