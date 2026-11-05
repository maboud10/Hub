import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { Check, Rocket, Sparkles, Zap } from 'lucide-react';
import type { Department } from '@/types';
import { useSessionUser } from '@/store/selectors';
import { Modal } from '@/components/ui/Modal';
import { addDaysISO, todayISO } from '@/hr/calendar';
import { cx } from '@/lib/cx';
import { PROJECT_TEMPLATES, RULE_ACTION_META, RULE_TRIGGER_META, VIEW_META } from '@/projects/constants';
import { slugKey } from '@/projects/engine';
import { useProjectsCaps } from '@/projects/selectors';
import type { ProjectPrivacy, ProjectTemplate } from '@/projects/types';
import { api, DEPARTMENTS, PriorityFlag, PRIVACY_HELP, report, TypeGlyph } from './shared';

const CATEGORIES = ['All', 'Product', 'Engineering', 'People', 'Operations', 'Go-to-market', 'Finance'] as const;

export function TemplatesView() {
  const caps = useProjectsCaps();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All');
  const [selected, setSelected] = useState<ProjectTemplate | null>(null);

  const templates = PROJECT_TEMPLATES.filter((t) => category === 'All' || t.category === category);

  return (
    <div className="pj-view pj-templates">
      <div className="pj-view__head">
        <div>
          <h2 className="pj-view__title">Project Templates</h2>
          <p className="pj-view__sub">Battle-tested blueprints with pre-built sections, starter tasks, relative due dates and no-code automation rules.</p>
        </div>
      </div>

      <div className="pj-filters">
        <div className="chips pj-filters__chips">
          {CATEGORIES.map((c) => (
            <button key={c} type="button" className={cx('chip', category === c && 'is-active')} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="pj-tpl-gallery stagger">
        {templates.map((tpl, i) => (
          <article key={tpl.id} className="pj-panelcard pj-tpl-full" style={{ '--i': i, '--c': tpl.color } as CSSProperties}>
            <div className="pj-tpl-full__head">
              <span className="pj-picon" style={{ '--c': tpl.color, '--size': '44px' } as CSSProperties}>
                {tpl.icon}
              </span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row row--wrap" style={{ gap: 8 }}>
                  <h3 className="pj-tpl-full__name">{tpl.name}</h3>
                  <span className="badge badge--muted">{tpl.category}</span>
                  <span className="badge badge--info">Recommended: {VIEW_META[tpl.recommendedView].label}</span>
                </div>
                <p className="pj-tpl-full__desc muted">{tpl.description}</p>
              </div>
              {caps.canCreate && (
                <button type="button" className="btn btn--primary pj-btn-violet" onClick={() => setSelected(tpl)}>
                  <Rocket /> Use template
                </button>
              )}
            </div>

            <div className="pj-tpl-full__sections">
              <span className="text-xs muted">Sections:</span>
              <div className="pj-tpl-steps">
                {tpl.sections.map((s, idx) => (
                  <span key={s} className="pj-tpl-step">
                    <small className="mono">{idx + 1}</small> {s}
                  </span>
                ))}
              </div>
            </div>

            <div className="pj-tpl-full__body">
              <div>
                <div className="pj-sec-title">
                  <h3>
                    Starter tasks <span className="pj-sec-title__count">{tpl.tasks.length}</span>
                  </h3>
                </div>
                <ul className="pj-tpl-tasks">
                  {tpl.tasks.map((t, idx) => (
                    <li key={idx} className="pj-tpl-task">
                      <TypeGlyph type={t.type ?? 'task'} />
                      <span className="grow truncate">{t.title}</span>
                      <span className="badge badge--muted">{t.section}</span>
                      <span className="mono text-xs muted">Day {t.offsetDays >= 0 ? `+${t.offsetDays}` : t.offsetDays}</span>
                      <PriorityFlag priority={t.priority ?? 'medium'} />
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="pj-sec-title">
                  <h3>
                    Default automation rules <span className="pj-sec-title__count">{tpl.defaultRules.length}</span>
                  </h3>
                </div>
                <ul className="pj-tpl-rules">
                  {tpl.defaultRules.map((r, idx) => (
                    <li key={idx} className="pj-tpl-rule">
                      <Zap className="pj-tpl-rule__icon" />
                      <div>
                        <div className="pj-tpl-rule__name">{r.name}</div>
                        <small className="muted">
                          When <b>{RULE_TRIGGER_META[r.trigger].toLowerCase()}</b> → <b>{RULE_ACTION_META[r.action].toLowerCase()}</b>
                          {r.actionValue ? ` (${r.actionValue})` : ''}
                        </small>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </article>
        ))}
      </div>

      {selected && <UseTemplateModal template={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function UseTemplateModal({ template, onClose }: { template: ProjectTemplate; onClose: () => void }) {
  const me = useSessionUser();
  const caps = useProjectsCaps();
  const navigate = useNavigate();
  const today = todayISO();

  const [name, setName] = useState(template.name);
  const [key, setKey] = useState(slugKey(template.name));
  const [description, setDescription] = useState(template.description);
  const [privacy, setPrivacy] = useState<ProjectPrivacy>('team');
  const [department, setDepartment] = useState<Department>(me?.department ?? 'Engineering');
  const [startDate, setStartDate] = useState(today);
  const [dueDate, setDueDate] = useState(addDaysISO(today, 30));

  const submit = () => {
    const res = api().createProject({
      name,
      key: key || slugKey(name),
      description,
      privacy,
      department: caps.canManage ? department : undefined,
      startDate,
      dueDate,
      templateId: template.id,
      icon: template.icon,
      color: template.color,
      defaultView: template.recommendedView,
    });
    if (report(res) && res.projectId) {
      onClose();
      navigate(`/projects/p/${res.projectId}?view=${template.recommendedView}`);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Use template · ${template.name}`}
      subtitle={`Creates ${template.sections.length} sections, ${template.tasks.length} tasks and ${template.defaultRules.length} automation rule${template.defaultRules.length === 1 ? '' : 's'}.`}
      icon={<Sparkles className="pj-modal-icon" />}
      width={560}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary pj-btn-violet" disabled={name.trim().length < 3 || dueDate < startDate} onClick={submit}>
            <Check /> Create project from template
          </button>
        </>
      }
    >
      <div className="pj-form">
        <div className="pj-form__grid">
          <label className="field">
            <span className="field-label">Project name</span>
            <input
              className="input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setKey(slugKey(e.target.value));
              }}
              autoFocus
            />
          </label>
          <label className="field">
            <span className="field-label">Project key</span>
            <input className="input mono" maxLength={6} value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} />
          </label>
          <label className="field pj-form__span2">
            <span className="field-label">Summary</span>
            <textarea className="textarea" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Start date</span>
            <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Target date</span>
            <input type="date" className="input" min={startDate} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
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
          {caps.canManage && (
            <label className="field">
              <span className="field-label">Department</span>
              <select className="select" value={department} onChange={(e) => setDepartment(e.target.value as Department)}>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>
    </Modal>
  );
}
