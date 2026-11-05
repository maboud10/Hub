import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Archive, ArchiveRestore, ChevronDown, ChevronUp, Plus, Settings, Trash2, Workflow, X, Zap } from 'lucide-react';
import { Segmented, Switch } from '@/components/ui/primitives';
import { useEscapeToClose, usePresence } from '@/hooks/useOverlay';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { PRIORITY_META, PROJECT_COLORS, PROJECT_ICONS, QUICK_TAGS, RULE_ACTION_META, RULE_TRIGGER_META, STATUS_META, VIEW_META } from '@/projects/constants';
import { useProjects } from '@/projects/store';
import type { AutomationRule, CustomFieldDef, FormField, IntakeForm, Project, ProjectPrivacy, ProjectView, RuleAction, RuleTrigger, TaskPriority } from '@/projects/types';
import { api, ConfirmModal, PRIVACY_HELP, report, UserPicker, useActiveUsers, UserAvatar, useUserMap } from './shared';

type Tab = 'details' | 'sections' | 'fields' | 'rules' | 'forms';

export function ProjectSettingsDrawer({ open, onClose, project }: { open: boolean; onClose: () => void; project: Project }) {
  const { mounted, closing } = usePresence(open, 200);
  useEscapeToClose(open, onClose);
  const [tab, setTab] = useState<Tab>('details');
  if (!mounted) return null;
  return createPortal(
    <>
      <div className={cx('scrim', closing && 'is-closing')} onClick={onClose} />
      <aside className={cx('sheet sheet--right pj-drawer', closing && 'is-closing')} role="dialog" aria-modal="true" aria-label="Project settings" style={{ '--sheet-w': '620px' } as CSSProperties}>
        <header className="sheet__head">
          <Settings className="pj-modal-icon" />
          <div className="grow" style={{ minWidth: 0 }}>
            <h2 className="sheet__title truncate">{project.name} · Settings</h2>
            <p className="text-xs muted">Project admins only. Changes apply immediately.</p>
          </div>
          <button type="button" className="icon-btn icon-btn--sm" onClick={onClose} aria-label="Close settings">
            <X />
          </button>
        </header>
        <div className="pj-drawer__tabs">
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            label="Settings section"
            options={[
              { value: 'details', label: 'Details' },
              { value: 'sections', label: 'Sections' },
              { value: 'fields', label: 'Fields' },
              { value: 'rules', label: 'Rules' },
              { value: 'forms', label: 'Forms' },
            ]}
          />
        </div>
        <div className="sheet__body pj-drawer__body">
          {tab === 'details' && <DetailsTab project={project} onArchived={onClose} />}
          {tab === 'sections' && <SectionsTab project={project} />}
          {tab === 'fields' && <FieldsTab project={project} />}
          {tab === 'rules' && <RulesTab project={project} />}
          {tab === 'forms' && <FormsTab project={project} />}
        </div>
      </aside>
    </>,
    document.body,
  );
}

// ───────────────────────── Details ─────────────────────────
function DetailsTab({ project, onArchived }: { project: Project; onArchived: () => void }) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [icon, setIcon] = useState(project.icon);
  const [color, setColor] = useState(project.color);
  const [privacy, setPrivacy] = useState<ProjectPrivacy>(project.privacy);
  const [startDate, setStartDate] = useState(project.startDate);
  const [dueDate, setDueDate] = useState(project.dueDate);
  const [defaultView, setDefaultView] = useState<ProjectView>(project.defaultView);
  const [archiveOpen, setArchiveOpen] = useState(false);
  useEffect(() => {
    setName(project.name);
    setDescription(project.description);
    setIcon(project.icon);
    setColor(project.color);
    setPrivacy(project.privacy);
    setStartDate(project.startDate);
    setDueDate(project.dueDate);
    setDefaultView(project.defaultView);
  }, [project]);
  const dirty = name !== project.name || description !== project.description || icon !== project.icon || color !== project.color || privacy !== project.privacy || startDate !== project.startDate || dueDate !== project.dueDate || defaultView !== project.defaultView;
  const save = () => report(api().updateProject(project.id, { name: name.trim(), description, icon, color, privacy, startDate, dueDate, defaultView }));
  return (
    <div className="pj-form">
      <label className="field">
        <span className="field-label">Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Description</span>
        <textarea className="textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div className="pj-form__grid">
        <div className="field">
          <span className="field-label">Icon</span>
          <div className="pj-swatches">
            {PROJECT_ICONS.map((ic) => (
              <button key={ic} type="button" className={cx('pj-swatch pj-swatch--icon', icon === ic && 'is-active')} onClick={() => setIcon(ic)} aria-label={`Icon ${ic}`}>
                {ic}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">Color</span>
          <div className="pj-swatches">
            {PROJECT_COLORS.map((c) => (
              <button key={c} type="button" className={cx('pj-swatch', color === c && 'is-active')} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Color ${c}`} />
            ))}
          </div>
        </div>
        <label className="field">
          <span className="field-label">Start date</span>
          <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Target date</span>
          <input type="date" className="input" value={dueDate} min={startDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Privacy</span>
          <select className="select" value={privacy} onChange={(e) => setPrivacy(e.target.value as ProjectPrivacy)}>
            <option value="public">Public</option>
            <option value="team">Team</option>
            <option value="private">Private</option>
          </select>
          <span className="field-hint">{PRIVACY_HELP[privacy]}</span>
        </label>
        <label className="field">
          <span className="field-label">Default view</span>
          <select className="select" value={defaultView} onChange={(e) => setDefaultView(e.target.value as ProjectView)}>
            {(Object.keys(VIEW_META) as ProjectView[]).map((v) => (
              <option key={v} value={v}>
                {VIEW_META[v].label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn--primary pj-btn-violet" disabled={!dirty || name.trim().length < 3} onClick={save}>
          Save changes
        </button>
      </div>
      <div className="pj-danger-zone">
        <div className="grow">
          <b>{project.archived ? 'Restore project' : 'Archive project'}</b>
          <p className="text-sm muted">{project.archived ? 'Bring it back to Browse and My Tasks.' : 'Hides it from Browse and My Tasks; tasks and history are kept. You can restore it any time.'}</p>
        </div>
        {project.archived ? (
          <button type="button" className="btn btn--sm" onClick={() => report(api().archiveProject(project.id, false))}>
            <ArchiveRestore /> Restore
          </button>
        ) : (
          <button type="button" className="btn btn--sm btn--danger" onClick={() => setArchiveOpen(true)}>
            <Archive /> Archive
          </button>
        )}
      </div>
      <ConfirmModal
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        title={`Archive ${project.name}?`}
        confirmLabel="Archive"
        danger
        onConfirm={() => {
          if (report(api().archiveProject(project.id, true))) onArchived();
        }}
      >
        Members keep read access; the project disappears from Browse unless “Archived” is toggled on.
      </ConfirmModal>
    </div>
  );
}

// ───────────────────────── Sections ─────────────────────────
function SectionsTab({ project }: { project: Project }) {
  const [newName, setNewName] = useState('');
  const [drafts, setDrafts] = useState<Record<string, { name: string; wip: string }>>({});
  const draft = (id: string) => drafts[id] ?? { name: project.sections.find((s) => s.id === id)?.name ?? '', wip: String(project.sections.find((s) => s.id === id)?.wipLimit ?? '') };
  const move = (idx: number, dir: -1 | 1) => {
    const ids = project.sections.map((s) => s.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    report(api().reorderSections(project.id, ids));
  };
  return (
    <div className="pj-form">
      <p className="text-sm muted">Sections are the columns on the board and the groups in the list. A section named “Done” (or Complete/Shipped) completes tasks moved into it.</p>
      <ul className="pj-settings-list">
        {project.sections.map((s, i) => {
          const d = draft(s.id);
          const changed = d.name !== s.name || d.wip !== String(s.wipLimit ?? '');
          return (
            <li key={s.id} className="pj-settings-row">
              <div className="pj-settings-row__order">
                <button type="button" className="icon-btn icon-btn--sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                  <ChevronUp />
                </button>
                <button type="button" className="icon-btn icon-btn--sm" disabled={i === project.sections.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                  <ChevronDown />
                </button>
              </div>
              <input className="input" value={d.name} onChange={(e) => setDrafts({ ...drafts, [s.id]: { ...d, name: e.target.value } })} aria-label="Section name" />
              <input className="input pj-input-wip" type="number" min={1} placeholder="WIP" value={d.wip} onChange={(e) => setDrafts({ ...drafts, [s.id]: { ...d, wip: e.target.value } })} aria-label="WIP limit" />
              <button
                type="button"
                className="btn btn--sm"
                disabled={!changed || !d.name.trim()}
                onClick={() => {
                  if (report(api().updateSection(project.id, s.id, { name: d.name, wipLimit: d.wip.trim() === '' ? null : Math.max(1, Number(d.wip)) }))) {
                    const next = { ...drafts };
                    delete next[s.id];
                    setDrafts(next);
                  }
                }}
              >
                Save
              </button>
              <button type="button" className="icon-btn icon-btn--sm" disabled={project.sections.length <= 1} onClick={() => report(api().deleteSection(project.id, s.id))} aria-label={`Delete ${s.name}`} title="Delete section (tasks move to the first section)">
                <Trash2 />
              </button>
            </li>
          );
        })}
      </ul>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (report(api().addSection(project.id, newName))) setNewName('');
        }}
      >
        <input className="input" placeholder="New section name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button type="submit" className="btn" disabled={!newName.trim()}>
          <Plus /> Add
        </button>
      </form>
    </div>
  );
}

// ───────────────────────── Custom fields ─────────────────────────
function FieldsTab({ project }: { project: Project }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<CustomFieldDef['type']>('select');
  const [options, setOptions] = useState('');
  const [unit, setUnit] = useState('');
  const save = (fields: CustomFieldDef[]) => report(api().updateProject(project.id, { customFields: fields }));
  const add = () => {
    const id = `cf-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now().toString(36)}`;
    const def: CustomFieldDef = { id, name: name.trim(), type };
    if (type === 'select') {
      def.options = options
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
        .map((label, i) => ({ id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'), label, color: PROJECT_COLORS[i % PROJECT_COLORS.length] }));
      if (!def.options.length) return;
    }
    if (type === 'number' && unit.trim()) def.unit = unit.trim();
    if (save([...project.customFields, def])) {
      setName('');
      setOptions('');
      setUnit('');
    }
  };
  return (
    <div className="pj-form">
      <p className="text-sm muted">Custom fields appear as extra columns in the list and as editable fields in every task.</p>
      {project.customFields.length === 0 ? (
        <p className="pj-empty-row">No custom fields yet.</p>
      ) : (
        <ul className="pj-settings-list">
          {project.customFields.map((f) => (
            <li key={f.id} className="pj-settings-row">
              <div className="grow" style={{ minWidth: 0 }}>
                <b>{f.name}</b> <span className="badge badge--muted">{f.type}</span>
                {f.unit && <span className="text-xs muted"> · {f.unit}</span>}
                {f.options && (
                  <div className="row row--wrap" style={{ gap: 4, marginTop: 4 }}>
                    {f.options.map((o) => (
                      <span key={o.id} className="pj-pill" style={{ '--pill': o.color } as CSSProperties}>
                        {o.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" className="icon-btn icon-btn--sm" onClick={() => save(project.customFields.filter((x) => x.id !== f.id))} aria-label={`Remove ${f.name}`}>
                <Trash2 />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="pj-subcard">
        <b className="text-sm">Add a field</b>
        <div className="pj-form__grid">
          <label className="field">
            <span className="field-label">Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Component area" />
          </label>
          <label className="field">
            <span className="field-label">Type</span>
            <select className="select" value={type} onChange={(e) => setType(e.target.value as CustomFieldDef['type'])}>
              <option value="select">Select</option>
              <option value="number">Number</option>
              <option value="text">Text</option>
            </select>
          </label>
          {type === 'select' && (
            <label className="field pj-form__span2">
              <span className="field-label">Options (comma separated)</span>
              <input className="input" value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Tokens, Forms, Navigation" />
            </label>
          )}
          {type === 'number' && (
            <label className="field">
              <span className="field-label">Unit</span>
              <input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pts, AED, %" />
            </label>
          )}
        </div>
        <button type="button" className="btn btn--sm" disabled={!name.trim()} onClick={add}>
          <Plus /> Add field
        </button>
      </div>
    </div>
  );
}

// ───────────────────────── Rules ─────────────────────────
const ACTION_VALUE_KIND: Record<RuleAction, 'section' | 'status' | 'tag' | 'user' | 'priority' | 'none'> = {
  move_to_section: 'section',
  set_status: 'status',
  add_tag: 'tag',
  assign_to: 'user',
  notify_owner: 'none',
  set_priority: 'priority',
  add_collaborator: 'user',
};

function RulesTab({ project }: { project: Project }) {
  const rules = useProjects((s) => s.rules);
  const mine = useMemo(() => rules.filter((r) => r.projectId === project.id), [rules, project.id]);
  const [editing, setEditing] = useState<Partial<AutomationRule> | null>(null);
  const users = useUserMap();
  const describe = (r: AutomationRule) => {
    const kind = ACTION_VALUE_KIND[r.action];
    const value =
      kind === 'section' ? project.sections.find((s) => s.id === r.actionValue)?.name : kind === 'status' ? STATUS_META[r.actionValue as keyof typeof STATUS_META]?.label : kind === 'priority' ? PRIORITY_META[r.actionValue as TaskPriority]?.label : kind === 'user' ? users.get(r.actionValue ?? '')?.name : kind === 'tag' ? `#${r.actionValue}` : '';
    const trig = r.trigger === 'task_moved_to_section' ? `${RULE_TRIGGER_META[r.trigger]} “${project.sections.find((s) => s.id === r.triggerSectionId)?.name ?? '?'}”` : RULE_TRIGGER_META[r.trigger];
    return `When ${trig.toLowerCase()} → ${RULE_ACTION_META[r.action].toLowerCase()}${value ? ` ${value}` : ''}`;
  };
  return (
    <div className="pj-form">
      <div className="row row--between">
        <p className="text-sm muted grow">No-code automations run instantly when work changes. Time-based rules run when the app loads.</p>
        <button type="button" className="btn btn--sm btn--primary pj-btn-violet" onClick={() => setEditing({ trigger: 'task_completed', action: 'notify_owner', enabled: true })}>
          <Plus /> New rule
        </button>
      </div>
      {mine.length === 0 ? (
        <p className="pj-empty-row">No rules yet — try “When a task is moved to Done → set status Done”.</p>
      ) : (
        <ul className="pj-settings-list">
          {mine.map((r) => (
            <li key={r.id} className={cx('pj-rule', !r.enabled && 'is-paused')}>
              <Zap className="pj-rule__icon" />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="pj-rule__name">{r.name}</div>
                <div className="text-xs muted">{describe(r)}</div>
                <div className="text-xs faint">
                  {r.runs} run{r.runs === 1 ? '' : 's'}
                  {r.lastRunAt ? ` · last ${relativeTime(r.lastRunAt)}` : ' · never run'}
                </div>
              </div>
              <Switch checked={r.enabled} onChange={(v) => report(api().toggleRule(r.id, v))} label={`Enable ${r.name}`} />
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => setEditing(r)}>
                Edit
              </button>
              <button type="button" className="icon-btn icon-btn--sm" onClick={() => report(api().deleteRule(r.id))} aria-label={`Delete ${r.name}`}>
                <Trash2 />
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && <RuleBuilder project={project} initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RuleBuilder({ project, initial, onClose }: { project: Project; initial: Partial<AutomationRule>; onClose: () => void }) {
  const all = useActiveUsers();
  const members = project.members.map((m) => all.find((u) => u.id === m.userId)).filter((u): u is NonNullable<typeof u> => Boolean(u));
  const [name, setName] = useState(initial.name ?? '');
  const [trigger, setTrigger] = useState<RuleTrigger>(initial.trigger ?? 'task_completed');
  const [triggerSectionId, setTriggerSectionId] = useState(initial.triggerSectionId ?? project.sections[project.sections.length - 1]?.id ?? '');
  const [action, setAction] = useState<RuleAction>(initial.action ?? 'notify_owner');
  const [actionValue, setActionValue] = useState<string | undefined>(initial.actionValue);
  const [enabled, setEnabled] = useState(initial.enabled ?? true);
  const kind = ACTION_VALUE_KIND[action];
  const valueOk = kind === 'none' || Boolean(actionValue);
  const save = () => {
    const res = api().upsertRule(project.id, { id: initial.id, name, trigger, triggerSectionId: trigger === 'task_moved_to_section' ? triggerSectionId : undefined, action, actionValue: kind === 'none' ? undefined : actionValue, enabled });
    if (report(res)) onClose();
  };
  const changeAction = (a: RuleAction) => {
    setAction(a);
    const k = ACTION_VALUE_KIND[a];
    setActionValue(k === 'section' ? project.sections[0]?.id : k === 'status' ? 'done' : k === 'priority' ? 'high' : k === 'tag' ? QUICK_TAGS[0] : undefined);
  };
  return (
    <div className="pj-subcard pj-rule-builder">
      <div className="row row--between">
        <b className="text-sm">
          <Workflow className="pj-inline-icon" /> {initial.id ? 'Edit rule' : 'New rule'}
        </b>
        <button type="button" className="icon-btn icon-btn--sm" onClick={onClose} aria-label="Close builder">
          <X />
        </button>
      </div>
      <label className="field">
        <span className="field-label">Rule name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Complete when moved to Done" autoFocus />
      </label>
      <div className="pj-rule-builder__flow">
        <div className="pj-rule-step">
          <span className="pj-rule-step__label">When</span>
          <select className="select" value={trigger} onChange={(e) => setTrigger(e.target.value as RuleTrigger)}>
            {(Object.keys(RULE_TRIGGER_META) as RuleTrigger[]).map((t) => (
              <option key={t} value={t}>
                {RULE_TRIGGER_META[t]}
              </option>
            ))}
          </select>
          {trigger === 'task_moved_to_section' && (
            <select className="select" value={triggerSectionId} onChange={(e) => setTriggerSectionId(e.target.value)} aria-label="Section">
              {project.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="pj-rule-step">
          <span className="pj-rule-step__label">Then</span>
          <select className="select" value={action} onChange={(e) => changeAction(e.target.value as RuleAction)}>
            {(Object.keys(RULE_ACTION_META) as RuleAction[]).map((a) => (
              <option key={a} value={a}>
                {RULE_ACTION_META[a]}
              </option>
            ))}
          </select>
          {kind === 'section' && (
            <select className="select" value={actionValue ?? ''} onChange={(e) => setActionValue(e.target.value)} aria-label="Target section">
              {project.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {kind === 'status' && (
            <select className="select" value={actionValue ?? ''} onChange={(e) => setActionValue(e.target.value)} aria-label="Status">
              {(Object.keys(STATUS_META) as (keyof typeof STATUS_META)[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </select>
          )}
          {kind === 'priority' && (
            <select className="select" value={actionValue ?? ''} onChange={(e) => setActionValue(e.target.value)} aria-label="Priority">
              {(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_META[p].label}
                </option>
              ))}
            </select>
          )}
          {kind === 'tag' && <input className="input" list="pj-quick-tags" value={actionValue ?? ''} onChange={(e) => setActionValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-'))} placeholder="tag" aria-label="Tag" />}
          {kind === 'user' && (
            <UserPicker
              value={actionValue}
              onChange={(id) => setActionValue(id)}
              candidates={members}
              others={all}
              allowNone={false}
              trigger={(open, toggle) => (
                <button type="button" className={cx('pj-pickbtn', open && 'is-open')} onClick={toggle}>
                  <UserAvatar userId={actionValue} size={22} name title={actionValue ? undefined : 'Choose a person'} />
                  <ChevronDown />
                </button>
              )}
            />
          )}
          <datalist id="pj-quick-tags">
            {QUICK_TAGS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
      </div>
      <div className="row row--between">
        <label className="pj-switch-label">
          <Switch checked={enabled} onChange={setEnabled} label="Enabled" />
          <span>{enabled ? 'Enabled' : 'Paused'}</span>
        </label>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn--sm btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--sm btn--primary pj-btn-violet" disabled={name.trim().length < 3 || !valueOk} onClick={save}>
            Save rule
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Forms ─────────────────────────
function FormsTab({ project }: { project: Project }) {
  const forms = useProjects((s) => s.forms);
  const mine = useMemo(() => forms.filter((f) => f.projectId === project.id), [forms, project.id]);
  const [editing, setEditing] = useState<Partial<IntakeForm> | null>(null);
  return (
    <div className="pj-form">
      <div className="row row--between">
        <p className="text-sm muted grow">Intake forms let anyone with Projects access submit requests that become tasks in a section of your choice.</p>
        <button type="button" className="btn btn--sm btn--primary pj-btn-violet" onClick={() => setEditing({})}>
          <Plus /> New form
        </button>
      </div>
      {mine.length === 0 ? (
        <p className="pj-empty-row">No forms yet.</p>
      ) : (
        <ul className="pj-settings-list">
          {mine.map((f) => (
            <li key={f.id} className={cx('pj-rule', !f.enabled && 'is-paused')}>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="pj-rule__name">{f.title}</div>
                <div className="text-xs muted">
                  {f.fields.length} fields → {project.sections.find((s) => s.id === f.targetSectionId)?.name ?? 'first section'} · {f.submissions} submission{f.submissions === 1 ? '' : 's'}
                </div>
              </div>
              <Switch checked={f.enabled} onChange={(v) => report(api().upsertForm(project.id, { ...f, enabled: v }))} label={`Enable ${f.title}`} />
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => setEditing(f)}>
                Edit
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && <FormBuilder project={project} initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

const newField = (): FormField => ({ id: `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, label: '', type: 'text', required: false });

function FormBuilder({ project, initial, onClose }: { project: Project; initial: Partial<IntakeForm>; onClose: () => void }) {
  const all = useActiveUsers();
  const members = project.members.map((m) => all.find((u) => u.id === m.userId)).filter((u): u is NonNullable<typeof u> => Boolean(u));
  const [title, setTitle] = useState(initial.title ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [fields, setFields] = useState<FormField[]>(initial.fields?.length ? initial.fields : [{ ...newField(), label: 'Title', required: true, mapsTo: 'title' }, { ...newField(), label: 'Details', type: 'textarea', required: true, mapsTo: 'description' }]);
  const [targetSectionId, setTargetSectionId] = useState(initial.targetSectionId ?? project.sections[0]?.id ?? '');
  const [defaultAssigneeId, setDefaultAssigneeId] = useState<string | undefined>(initial.defaultAssigneeId);
  const [defaultPriority, setDefaultPriority] = useState<TaskPriority>(initial.defaultPriority ?? 'medium');
  const [enabled, setEnabled] = useState(initial.enabled ?? true);
  const patch = (id: string, p: Partial<FormField>) => setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...p } : f)));
  const save = () => {
    const clean = fields.filter((f) => f.label.trim()).map((f) => ({ ...f, label: f.label.trim(), options: f.type === 'select' ? (f.options ?? []).filter(Boolean) : undefined }));
    const res = api().upsertForm(project.id, { id: initial.id, title, description, fields: clean, targetSectionId, defaultAssigneeId, defaultPriority, enabled });
    if (report(res)) onClose();
  };
  return (
    <div className="pj-subcard">
      <div className="row row--between">
        <b className="text-sm">{initial.id ? 'Edit form' : 'New form'}</b>
        <button type="button" className="icon-btn icon-btn--sm" onClick={onClose} aria-label="Close builder">
          <X />
        </button>
      </div>
      <label className="field">
        <span className="field-label">Title</span>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Request a security review" autoFocus />
      </label>
      <label className="field">
        <span className="field-label">Description</span>
        <textarea className="textarea" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tell requesters what to expect." />
      </label>
      <div className="field">
        <span className="field-label">Fields</span>
        <ul className="pj-settings-list">
          {fields.map((f) => (
            <li key={f.id} className="pj-field-row">
              <input className="input" value={f.label} onChange={(e) => patch(f.id, { label: e.target.value })} placeholder="Label" aria-label="Field label" />
              <select className="select" value={f.type} onChange={(e) => patch(f.id, { type: e.target.value as FormField['type'] })} aria-label="Field type">
                <option value="text">Text</option>
                <option value="textarea">Paragraph</option>
                <option value="select">Select</option>
                <option value="date">Date</option>
              </select>
              <select className="select" value={f.mapsTo ?? ''} onChange={(e) => patch(f.id, { mapsTo: (e.target.value || undefined) as FormField['mapsTo'] })} aria-label="Maps to">
                <option value="">Include in description</option>
                <option value="title">→ Task title</option>
                <option value="description">→ Description</option>
                <option value="dueDate">→ Due date</option>
                <option value="tag">→ Tag</option>
              </select>
              <label className="pj-switch-label">
                <Switch checked={f.required} onChange={(v) => patch(f.id, { required: v })} label="Required" />
                <span className="text-xs">Req.</span>
              </label>
              <button type="button" className="icon-btn icon-btn--sm" onClick={() => setFields((fs) => fs.filter((x) => x.id !== f.id))} aria-label="Remove field" disabled={fields.length <= 1}>
                <Trash2 />
              </button>
              {f.type === 'select' && <input className="input pj-field-row__options" value={(f.options ?? []).join(', ')} onChange={(e) => patch(f.id, { options: e.target.value.split(',').map((o) => o.trim()) })} placeholder="Options, comma separated" aria-label="Options" />}
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => setFields((fs) => [...fs, newField()])}>
          <Plus /> Add field
        </button>
      </div>
      <div className="pj-form__grid">
        <label className="field">
          <span className="field-label">Create tasks in</span>
          <select className="select" value={targetSectionId} onChange={(e) => setTargetSectionId(e.target.value)}>
            {project.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Default priority</span>
          <select className="select" value={defaultPriority} onChange={(e) => setDefaultPriority(e.target.value as TaskPriority)}>
            {(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_META[p].label}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span className="field-label">Default assignee</span>
          <UserPicker
            value={defaultAssigneeId}
            onChange={setDefaultAssigneeId}
            candidates={members}
            others={all}
            trigger={(open, toggle) => (
              <button type="button" className={cx('pj-pickbtn', open && 'is-open')} onClick={toggle}>
                <UserAvatar userId={defaultAssigneeId} size={22} name />
                <ChevronDown />
              </button>
            )}
          />
        </div>
        <label className="pj-switch-label" style={{ alignSelf: 'end' }}>
          <Switch checked={enabled} onChange={setEnabled} label="Form enabled" />
          <span>{enabled ? 'Accepting submissions' : 'Closed'}</span>
        </label>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="btn btn--sm btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn--sm btn--primary pj-btn-violet" disabled={title.trim().length < 3 || !fields.some((f) => f.label.trim())} onClick={save}>
          Save form
        </button>
      </div>
    </div>
  );
}
