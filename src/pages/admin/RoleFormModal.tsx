import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Check, Copy, PenLine, Plus, Save } from 'lucide-react';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { Modal } from '@/components/ui/Modal';
import { ClearanceBadge, RoleChip } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import type { ActionResult, Clearance, Role } from '@/types';
import { CLEARANCE_NAMES, ModalIcon, ROLE_COLORS } from './shared';

const LEVELS: Clearance[] = [1, 2, 3, 4, 5];

/** Create (role = null) or edit a role. Mount with a fresh `key` per open to reset the form. */
export function RoleFormModal({
  open,
  onClose,
  role,
  myClearance,
}: {
  open: boolean;
  onClose: () => void;
  role: Role | null;
  myClearance: number;
}) {
  const roles = useHub((s) => s.roles);
  const isEdit = !!role;
  const maxLevel = Math.max(1, myClearance) as Clearance;
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [clearance, setClearance] = useState<Clearance>(role?.clearance ?? (Math.min(2, maxLevel) as Clearance));
  const [color, setColor] = useState(role?.color ?? ROLE_COLORS[0]);
  const [template, setTemplate] = useState('');
  const [touched, setTouched] = useState(false);

  const templates = useMemo(() => roles.filter((r) => !r.locked && r.clearance <= myClearance), [roles, myClearance]);
  const tpl = templates.find((r) => r.id === template);

  const trimmed = name.trim();
  const nameError =
    trimmed.length < 3
      ? 'Use at least 3 characters.'
      : roles.some((r) => r.id !== role?.id && r.name.toLowerCase() === trimmed.toLowerCase())
        ? 'A role with that name already exists.'
        : null;
  const formId = isEdit ? `adm-role-form-${role.id}` : 'adm-role-form-new';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (nameError) return;
    const api = useHub.getState();
    let res: ActionResult;
    if (role) {
      const patch: Partial<Pick<Role, 'name' | 'description' | 'clearance' | 'color'>> = {};
      if (trimmed !== role.name) patch.name = trimmed;
      if (description.trim() !== role.description) patch.description = description.trim();
      if (clearance !== role.clearance) patch.clearance = clearance;
      if (color !== role.color) patch.color = color;
      if (!Object.keys(patch).length) {
        onClose();
        return;
      }
      res = api.updateRole(role.id, patch);
    } else {
      res = api.createRole({ name: trimmed, description: description.trim(), clearance, color, permissions: tpl ? [...tpl.permissions] : [] });
    }
    if (toast.result(res)) onClose();
  };

  const isCustomColor = !ROLE_COLORS.includes(color);

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={560}
      className="adm-overlay"
      icon={<ModalIcon icon={isEdit ? PenLine : Plus} />}
      title={isEdit ? `Edit ${role.name}` : 'New role'}
      subtitle={isEdit ? 'Name, description, clearance and color. Permissions live in the matrix.' : 'Bundle permissions for a group of people.'}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className="btn btn--primary">
            {isEdit ? <Save aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {isEdit ? 'Save changes' : 'Create role'}
          </button>
        </>
      }
    >
      <form id={formId} className="stack stack--lg" onSubmit={submit} noValidate>
        <div className="adm-role-preview" style={{ '--role': color } as CSSProperties}>
          <span className="adm-micro">Preview</span>
          <div className="row row--wrap adm-gap-6">
            <RoleChip name={trimmed || 'Role name'} color={color} />
            <ClearanceBadge level={clearance} label={CLEARANCE_NAMES[clearance]} />
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor={`${formId}-name`}>
            Name
          </label>
          <input
            id={`${formId}-name`}
            className="input"
            value={name}
            maxLength={32}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="e.g. Support Lead"
            aria-invalid={touched && !!nameError}
            aria-describedby={`${formId}-name-err`}
            data-autofocus
          />
          <span id={`${formId}-name-err`} className={cx('field-hint', touched && nameError && 'adm-text-danger')}>
            {touched && nameError ? nameError : 'Shown on role chips across the hub.'}
          </span>
        </div>

        <div className="field">
          <label className="field-label" htmlFor={`${formId}-desc`}>
            Description
          </label>
          <textarea
            id={`${formId}-desc`}
            className="textarea"
            rows={2}
            maxLength={160}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Who holds this role and why?"
          />
        </div>

        <div className="field">
          <span className="field-label" id={`${formId}-lvl`}>
            Clearance
          </span>
          <div className="adm-levels" role="radiogroup" aria-labelledby={`${formId}-lvl`}>
            {LEVELS.map((lvl) => {
              const disabled = lvl > myClearance || (!!role?.locked && lvl !== role.clearance);
              return (
                <button
                  key={lvl}
                  type="button"
                  role="radio"
                  aria-checked={clearance === lvl}
                  className="adm-level"
                  disabled={disabled}
                  onClick={() => setClearance(lvl)}
                  title={disabled ? (role?.locked ? 'Locked roles keep their clearance' : `Above your clearance (L${myClearance})`) : CLEARANCE_NAMES[lvl]}
                >
                  <span className="adm-level__bars" aria-hidden="true">
                    {LEVELS.map((i) => (
                      <i key={i} className={i <= lvl ? 'on' : ''} style={{ height: `${3 + i * 2}px` }} />
                    ))}
                  </span>
                  <span className="adm-level__l">L{lvl}</span>
                </button>
              );
            })}
          </div>
          <span className="field-hint">
            {role?.locked
              ? 'Locked roles keep their clearance.'
              : `${CLEARANCE_NAMES[clearance]} · you can create roles up to L${myClearance}. People can only manage roles at or below their own clearance.`}
          </span>
        </div>

        <div className="field">
          <span className="field-label" id={`${formId}-color`}>
            Color
          </span>
          <div className="adm-swatches" role="radiogroup" aria-labelledby={`${formId}-color`}>
            {ROLE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={`Color ${c}`}
                className="adm-swatch"
                style={{ '--sw': c } as CSSProperties}
                onClick={() => setColor(c)}
              >
                {color === c && <Check aria-hidden="true" />}
              </button>
            ))}
            <label className={cx('adm-swatch adm-swatch--custom', isCustomColor && 'is-selected')} style={{ '--sw': color } as CSSProperties} title="Custom color">
              <span className="sr-only">Custom color</span>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
              <Plus aria-hidden="true" />
            </label>
          </div>
        </div>

        {!isEdit && (
          <div className="field">
            <label className="field-label" htmlFor={`${formId}-tpl`}>
              <Copy aria-hidden="true" className="adm-inline-icon" /> Start from
            </label>
            <select id={`${formId}-tpl`} className="select" value={template} onChange={(e) => setTemplate(e.target.value)}>
              <option value="">Blank — no permissions</option>
              {templates.map((r) => (
                <option key={r.id} value={r.id}>
                  Copy {r.name} ({r.permissions.length} permissions)
                </option>
              ))}
            </select>
            <span className="field-hint">
              {tpl ? 'Only permissions you hold yourself are copied.' : 'You can toggle permissions in the matrix after creating the role.'}
            </span>
          </div>
        )}
      </form>
    </Modal>
  );
}
