import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, Check, Globe, Lock, Rocket, Search, Users, X } from 'lucide-react';
import type { Department } from '@/types';
import { useSessionUser } from '@/store/selectors';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/primitives';
import { addDaysISO, todayISO } from '@/hr/calendar';
import { cx } from '@/lib/cx';
import { PROJECT_COLORS, PROJECT_ICONS, PROJECT_TEMPLATES, TEMPLATE_BY_ID } from '@/projects/constants';
import { slugKey } from '@/projects/engine';
import { useProjectsCaps } from '@/projects/selectors';
import type { ProjectPrivacy } from '@/projects/types';
import { api, DEPARTMENTS, PRIVACY_HELP, report, useActiveUsers } from './shared';

const PRIVACY_OPTIONS: { value: ProjectPrivacy; label: string; icon: typeof Globe }[] = [
  { value: 'public', label: 'Public', icon: Globe },
  { value: 'team', label: 'Team', icon: Users },
  { value: 'private', label: 'Private', icon: Lock },
];

export function NewProjectWizard({ open, onClose, initialTemplateId }: { open: boolean; onClose: () => void; initialTemplateId?: string }) {
  const me = useSessionUser();
  const caps = useProjectsCaps();
  const users = useActiveUsers();
  const navigate = useNavigate();
  const today = todayISO();

  const [step, setStep] = useState(0);
  const [templateId, setTemplateId] = useState<string | undefined>(initialTemplateId);
  const [name, setName] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState(PROJECT_ICONS[0]);
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [privacy, setPrivacy] = useState<ProjectPrivacy>('team');
  const [department, setDepartment] = useState<Department | ''>('');
  const [startDate, setStartDate] = useState(today);
  const [dueDate, setDueDate] = useState(addDaysISO(today, 30));
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [memberQuery, setMemberQuery] = useState('');

  // Reset when (re)opened; adopt the template's look.
  useEffect(() => {
    if (!open) return;
    const tpl = initialTemplateId ? TEMPLATE_BY_ID[initialTemplateId] : undefined;
    setStep(tpl ? 1 : 0);
    setTemplateId(tpl?.id);
    setName('');
    setKey('');
    setKeyTouched(false);
    setDescription(tpl?.description ?? '');
    setIcon(tpl?.icon ?? PROJECT_ICONS[0]);
    setColor(tpl?.color ?? PROJECT_COLORS[0]);
    setPrivacy('team');
    setDepartment('');
    setStartDate(today);
    setDueDate(addDaysISO(today, 30));
    setMemberIds([]);
    setMemberQuery('');
  }, [open, initialTemplateId, today]);

  const chooseTemplate = (id?: string) => {
    setTemplateId(id);
    const tpl = id ? TEMPLATE_BY_ID[id] : undefined;
    if (tpl) {
      setIcon(tpl.icon);
      setColor(tpl.color);
      if (!description) setDescription(tpl.description);
    }
    setStep(1);
  };

  const effectiveKey = (keyTouched ? key : slugKey(name)).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const tpl = templateId ? TEMPLATE_BY_ID[templateId] : undefined;

  const candidates = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    return users.filter((u) => u.id !== me?.id && (!q || u.name.toLowerCase().includes(q) || u.title.toLowerCase().includes(q) || u.department.toLowerCase().includes(q))).slice(0, q ? 12 : 8);
  }, [users, memberQuery, me?.id]);

  const toggleMember = (id: string) => setMemberIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const create = () => {
    const res = api().createProject({
      name,
      description,
      privacy,
      color,
      icon,
      startDate,
      dueDate,
      templateId,
      memberIds,
      key: effectiveKey || undefined,
      department: department || undefined,
    });
    if (report(res) && res.projectId) {
      onClose();
      navigate(`/projects/p/${res.projectId}?view=${tpl?.recommendedView ?? 'board'}`);
    }
  };

  const canNext = step === 1 ? name.trim().length >= 3 && dueDate >= startDate : true;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New project"
      subtitle={step === 0 ? 'Start from a template or a blank canvas.' : step === 1 ? 'Name it, pick a look and decide who can see it.' : 'Invite teammates — you can always add more later.'}
      icon={<Rocket className="pj-modal-icon" />}
      width={720}
      footer={
        <>
          <div className="pj-wizard__steps" aria-label="Steps">
            {['Template', 'Details', 'Members'].map((s, i) => (
              <span key={s} className={cx('pj-wizard__step', i === step && 'is-active', i < step && 'is-done')}>
                {i < step ? <Check /> : i + 1} {s}
              </span>
            ))}
          </div>
          <div className="spacer" />
          {step > 0 && (
            <button type="button" className="btn btn--ghost" onClick={() => setStep(step - 1)}>
              <ArrowLeft /> Back
            </button>
          )}
          {step < 2 ? (
            <button type="button" className="btn btn--primary pj-btn-violet" disabled={!canNext} onClick={() => setStep(step + 1)}>
              {step === 0 ? 'Skip template' : 'Next'} <ArrowRight />
            </button>
          ) : (
            <button type="button" className="btn btn--primary pj-btn-violet" onClick={create}>
              <Check /> Create project
            </button>
          )}
        </>
      }
    >
      {step === 0 && (
        <div className="pj-tplgrid">
          <button type="button" className={cx('pj-tplcard', !templateId && 'is-active')} onClick={() => chooseTemplate(undefined)}>
            <span className="pj-tplcard__icon" style={{ '--c': '#94a3b8' } as CSSProperties}>
              ✨
            </span>
            <span className="pj-tplcard__name">Blank project</span>
            <span className="pj-tplcard__desc">Four simple sections: To do, In progress, In review, Done.</span>
          </button>
          {PROJECT_TEMPLATES.map((t) => (
            <button key={t.id} type="button" className={cx('pj-tplcard', templateId === t.id && 'is-active')} onClick={() => chooseTemplate(t.id)}>
              <span className="pj-tplcard__icon" style={{ '--c': t.color } as CSSProperties}>
                {t.icon}
              </span>
              <span className="pj-tplcard__name">{t.name}</span>
              <span className="pj-tplcard__desc">{t.description}</span>
              <span className="pj-tplcard__meta">
                {t.tasks.length} tasks · {t.sections.length} sections · {t.category}
              </span>
            </button>
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="pj-form">
          {tpl && (
            <div className="pj-note">
              <span className="pj-tplcard__icon" style={{ '--c': tpl.color, '--size': '28px' } as CSSProperties}>
                {tpl.icon}
              </span>
              <span>
                Using the <b>{tpl.name}</b> template: {tpl.sections.join(' → ')} with {tpl.tasks.length} starter tasks and {tpl.defaultRules.length} automation rule{tpl.defaultRules.length === 1 ? '' : 's'}.
              </span>
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => setStep(0)}>
                Change
              </button>
            </div>
          )}
          <div className="pj-form__grid">
            <label className="field pj-form__span2">
              <span className="field-label">Project name</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q1 Customer Portal" data-autofocus autoFocus />
            </label>
            <label className="field">
              <span className="field-label">Key</span>
              <input
                className="input mono"
                value={effectiveKey}
                onChange={(e) => {
                  setKeyTouched(true);
                  setKey(e.target.value);
                }}
                maxLength={6}
                placeholder="KEY"
              />
              <span className="field-hint">Tasks are numbered {effectiveKey || 'KEY'}-1, {effectiveKey || 'KEY'}-2…</span>
            </label>
            <label className="field pj-form__span2">
              <span className="field-label">Description</span>
              <textarea className="textarea" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does success look like?" />
            </label>
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
            {caps.canManage && (
              <label className="field">
                <span className="field-label">Department</span>
                <select className="select" value={department} onChange={(e) => setDepartment(e.target.value as Department | '')}>
                  <option value="">My department{me ? ` (${me.department})` : ''}</option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="field pj-form__span2">
              <span className="field-label">Privacy</span>
              <div className="pj-privacy-grid" role="radiogroup" aria-label="Privacy">
                {PRIVACY_OPTIONS.map((o) => {
                  const Icon = o.icon;
                  return (
                    <button key={o.value} type="button" role="radio" aria-checked={privacy === o.value} className={cx('pj-privacy-opt', privacy === o.value && 'is-active')} onClick={() => setPrivacy(o.value)}>
                      <span className="pj-privacy-opt__head">
                        <Icon /> {o.label}
                      </span>
                      <span className="pj-privacy-opt__desc">{PRIVACY_HELP[o.value]}</span>
                    </button>
                  );
                })}
              </div>
              <span className="field-hint">Contractors only ever see projects they’re explicitly invited to, whatever the privacy setting.</span>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="pj-form">
          <div className="pj-note">
            <Users />
            <span>
              Invited people join as <b>editors</b>. {privacy === 'private' ? 'Only invited members can see this private project.' : privacy === 'team' ? 'Everyone in the department can already edit; invite people from other teams here.' : 'Everyone at Helix can view and comment; invite people who should edit.'}
            </span>
          </div>
          <div className="pj-menu__search pj-menu__search--block">
            <Search />
            <input className="pj-menu__input" placeholder="Search teammates by name, title or team…" value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} autoFocus />
          </div>
          {memberIds.length > 0 && (
            <div className="row row--wrap" style={{ gap: 6 }}>
              {memberIds.map((id) => {
                const u = users.find((x) => x.id === id);
                if (!u) return null;
                return (
                  <span key={id} className="pj-person-chip">
                    <Avatar user={u} size={18} /> {u.name}
                    <button type="button" onClick={() => toggleMember(id)} aria-label={`Remove ${u.name}`}>
                      <X />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          <ul className="pj-people">
            {candidates.map((u) => {
              const on = memberIds.includes(u.id);
              return (
                <li key={u.id}>
                  <button type="button" className={cx('pj-people__item', on && 'is-active')} onClick={() => toggleMember(u.id)} aria-pressed={on}>
                    <Avatar user={u} size={30} />
                    <span className="grow truncate">
                      <span className="pj-people__name">{u.name}</span>
                      <small>
                        {u.title} · {u.department}
                      </small>
                    </span>
                    <span className={cx('pj-people__check', on && 'is-on')}>
                      <Check />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Modal>
  );
}
