/**
 * "Edit basics" for a requisition: priority, headcount, target start,
 * recruiter, location and work model — plus the salary range for People Ops
 * (it's how a range gets set on a requisition raised by a hiring manager).
 */
import { useState } from 'react';
import { Pencil } from 'lucide-react';
import type { ReqPriority, Requisition } from '@/talent/types';
import { CURRENCIES, PRIORITY_META } from '@/talent/constants';
import { useTalent, type TalentActions } from '@/talent/store';
import { useTalentCaps } from '@/talent/selectors';
import { toast } from '@/store/toast';
import { Modal } from '@/components/ui/Modal';
import { Segmented, Switch } from '@/components/ui/primitives';
import { toISODate } from '@/talent/onboarding';
import { UserSelect } from '../components/pickers';
import { LocationInput, NumberStepper, WorkModelPicker } from './pieces';
import { PRIORITY_ORDER, isPeopleOps } from './helpers';

type ReqPatch = Parameters<TalentActions['updateRequisition']>[1];

export function ReqEditModal({ req, open, onClose }: { req: Requisition; open: boolean; onClose: () => void }) {
  const caps = useTalentCaps();
  const [priority, setPriority] = useState<ReqPriority>(req.priority);
  const [headcount, setHeadcount] = useState(req.headcount);
  const [target, setTarget] = useState(req.targetStartDate ?? '');
  const [recruiterId, setRecruiterId] = useState(req.recruiterId);
  const [location, setLocation] = useState(req.location);
  const [workModel, setWorkModel] = useState(req.workModel);
  const [salaryOn, setSalaryOn] = useState(!!req.salary);
  const [min, setMin] = useState<string>(req.salary ? String(req.salary.min) : '');
  const [max, setMax] = useState<string>(req.salary ? String(req.salary.max) : '');
  const [currency, setCurrency] = useState(req.salary?.currency ?? 'AED');

  const minHead = Math.max(1, req.hires);
  const errors: string[] = [];
  if (!location.trim()) errors.push('Add a location.');
  if (!recruiterId) errors.push('Pick a recruiter.');
  if (caps.comp && salaryOn) {
    if (!(Number(min) > 0) || !(Number(max) > 0)) errors.push('Enter both ends of the salary range.');
    else if (Number(min) > Number(max)) errors.push('The salary minimum is above the maximum.');
  }

  const save = () => {
    if (errors.length) return;
    const patch: ReqPatch = { priority, headcount, targetStartDate: target || undefined, recruiterId, location: location.trim(), workModel };
    if (caps.comp) patch.salary = salaryOn ? { min: Math.round(Number(min)), max: Math.round(Number(max)), currency } : null;
    if (toast.result(useTalent.getState().updateRequisition(req.id, patch))) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit requisition basics"
      subtitle={req.title}
      icon={
        <span className="tl-req-note__icon">
          <Pencil />
        </span>
      }
      width={640}
      className="tl-req-edit"
      footer={
        <>
          {errors.length > 0 && <span className="tl-req-edit__err">{errors[0]}</span>}
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={save} disabled={errors.length > 0}>
            Save changes
          </button>
        </>
      }
    >
      <div className="tl-req-form">
        <div className="field tl-req-form__wide">
          <span className="field-label">Priority</span>
          <Segmented value={priority} onChange={setPriority} label="Priority" options={PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITY_META[p].label }))} />
        </div>
        <div className="field">
          <span className="field-label">Headcount</span>
          <NumberStepper value={headcount} onChange={setHeadcount} min={minHead} max={50} label="Headcount" />
          {req.hires > 0 && <span className="field-hint">Can’t go below the {req.hires} seat(s) already filled.</span>}
        </div>
        <label className="field">
          <span className="field-label">Target start date</span>
          <input className="input" type="date" value={target} min={toISODate(Date.now())} onChange={(e) => setTarget(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Recruiter</span>
          <UserSelect value={recruiterId} onChange={setRecruiterId} filter={isPeopleOps} placeholder="Pick a recruiter" ariaLabel="Recruiter" />
        </label>
        <label className="field">
          <span className="field-label">Location</span>
          <LocationInput value={location} onChange={setLocation} invalid={!location.trim()} />
        </label>
        <div className="field tl-req-form__wide">
          <span className="field-label">Work model</span>
          <WorkModelPicker value={workModel} onChange={setWorkModel} />
        </div>
        {caps.comp && (
          <fieldset className="tl-req-form__wide tl-req-edit__salary">
            <legend className="row">
              <Switch checked={salaryOn} onChange={setSalaryOn} label="Set a salary range" />
              <span className="field-label">Salary range (annual)</span>
              <span className="faint text-xs">People Ops only</span>
            </legend>
            {salaryOn && (
              <div className="tl-req-form__money">
                <label className="field">
                  <span className="field-label">Minimum</span>
                  <input className="input" type="number" min={0} step={1000} value={min} onChange={(e) => setMin(e.target.value)} inputMode="numeric" />
                </label>
                <label className="field">
                  <span className="field-label">Maximum</span>
                  <input className="input" type="number" min={0} step={1000} value={max} onChange={(e) => setMax(e.target.value)} inputMode="numeric" />
                </label>
                <label className="field">
                  <span className="field-label">Currency</span>
                  <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </fieldset>
        )}
      </div>
    </Modal>
  );
}
