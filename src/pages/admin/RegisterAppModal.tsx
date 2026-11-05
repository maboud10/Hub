import { useState, type CSSProperties, type FormEvent } from 'react';
import { PackagePlus, Rocket } from 'lucide-react';
import { useHub, type NewAppInput } from '@/store/hub';
import { useClearance, usePermissions } from '@/store/selectors';
import { toast } from '@/store/toast';
import { Modal } from '@/components/ui/Modal';
import { Segmented, Switch } from '@/components/ui/primitives';
import { APP_CATEGORIES } from '@/data/apps';
import { hasPermission } from '@/lib/rbac';
import { cx } from '@/lib/cx';
import type { AppCategory } from '@/types';
import { GradientPicker, IconPicker, TilePreview } from './AppDesign';
import { GRADIENT_PRESETS, LockNote, ModalIcon, URL_PATTERN } from './shared';

type BadgeChoice = 'none' | 'new' | 'beta';

/** "Register app" dialog with a live tile preview. Mount with a fresh `key` per open. */
export function RegisterAppModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const roles = useHub((s) => s.roles);
  const perms = usePermissions();
  const myClearance = useClearance();
  const canRoles = hasPermission(perms, 'hub.roles.manage');
  const [form, setForm] = useState<NewAppInput>({
    name: '',
    tagline: '',
    description: '',
    category: 'Productivity',
    icon: 'Rocket',
    gradient: GRADIENT_PRESETS[0],
    url: 'https://',
    discoverable: true,
    badge: 'new',
  });
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const set = <K extends keyof NewAppInput>(key: K, value: NewAppInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const errors = {
    name: form.name.trim().length < 2 ? 'App name is required (2+ characters).' : null,
    url: URL_PATTERN.test(form.url.trim()) ? null : 'Enter a full URL starting with https:// (or http://).',
  };
  const assignable = roles.filter((r) => !r.locked).sort((a, b) => b.clearance - a.clearance || a.name.localeCompare(b.name));
  const badgeChoice: BadgeChoice = form.badge ?? 'none';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, url: true });
    if (errors.name || errors.url) return;
    const input: NewAppInput = {
      ...form,
      name: form.name.trim(),
      tagline: form.tagline.trim() || 'Internal tool',
      description: form.description.trim() || form.tagline.trim() || 'Registered from the Control Center.',
      url: form.url.trim(),
    };
    if (toast.result(useHub.getState().createApp(input, canRoles ? roleIds : []))) onClose();
  };

  const err = (k: 'name' | 'url') => (touched[k] ? errors[k] : null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={960}
      className="adm-overlay adm-register-modal"
      icon={<ModalIcon icon={PackagePlus} />}
      title="Register an app"
      subtitle="Add an internal or SaaS tool to everyone’s launchpad."
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="adm-register-form" className="btn btn--primary">
            <Rocket aria-hidden="true" /> Register app
          </button>
        </>
      }
    >
      <form id="adm-register-form" className="adm-register" onSubmit={submit} noValidate>
        <div className="adm-register__form">
          <fieldset className="adm-fieldset">
            <legend className="adm-micro">Identity</legend>
            <div className="field">
              <label className="field-label" htmlFor="adm-app-name">
                Name
              </label>
              <input
                id="adm-app-name"
                className="input"
                value={form.name}
                maxLength={32}
                placeholder="e.g. Signal Desk"
                onChange={(e) => set('name', e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                aria-invalid={!!err('name')}
                aria-describedby="adm-app-name-hint"
                data-autofocus
              />
              <span id="adm-app-name-hint" className={cx('field-hint', err('name') && 'adm-text-danger')}>
                {err('name') ?? 'Shown on the tile, in search and in the command palette.'}
              </span>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="adm-app-tagline">
                Tagline
              </label>
              <input
                id="adm-app-tagline"
                className="input"
                value={form.tagline}
                maxLength={48}
                placeholder="e.g. Tickets, SLAs & customer chat"
                onChange={(e) => set('tagline', e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="adm-app-desc">
                Description
              </label>
              <textarea
                id="adm-app-desc"
                className="textarea"
                rows={2}
                maxLength={200}
                value={form.description}
                placeholder="What can people do with it?"
                onChange={(e) => set('description', e.target.value)}
              />
            </div>
          </fieldset>

          <fieldset className="adm-fieldset">
            <legend className="adm-micro">Placement</legend>
            <div className="adm-form-2">
              <div className="field">
                <label className="field-label" htmlFor="adm-app-cat">
                  Category
                </label>
                <select id="adm-app-cat" className="select" value={form.category} onChange={(e) => set('category', e.target.value as AppCategory)}>
                  {APP_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <span className="field-label">Badge</span>
                <Segmented<BadgeChoice>
                  value={badgeChoice}
                  onChange={(v) => set('badge', v === 'none' ? null : v)}
                  label="Tile badge"
                  options={[
                    { value: 'none', label: 'None' },
                    { value: 'new', label: 'New' },
                    { value: 'beta', label: 'Beta' },
                  ]}
                />
              </div>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="adm-app-url">
                Launch URL
              </label>
              <input
                id="adm-app-url"
                className="input mono"
                type="url"
                inputMode="url"
                value={form.url}
                onChange={(e) => set('url', e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, url: true }))}
                aria-invalid={!!err('url')}
                aria-describedby="adm-app-url-hint"
              />
              <span id="adm-app-url-hint" className={cx('field-hint', err('url') && 'adm-text-danger')}>
                {err('url') ?? 'Opens in a new tab when launched.'}
              </span>
            </div>
            <div className="adm-switch-row adm-switch-row--lg">
              <div className="grow">
                <div className="adm-switch-row__label">Discoverable</div>
                <div className="text-xs faint">People without access see a locked tile and can request access.</div>
              </div>
              <Switch checked={form.discoverable} onChange={(v) => set('discoverable', v)} label="Discoverable" />
            </div>
          </fieldset>

          <fieldset className="adm-fieldset">
            <legend className="adm-micro">Look</legend>
            <div className="field">
              <span className="field-label" id="adm-app-icon-l">
                Icon
              </span>
              <IconPicker value={form.icon} onChange={(v) => set('icon', v)} labelledBy="adm-app-icon-l" />
            </div>
            <div className="field">
              <span className="field-label" id="adm-app-grad-l">
                Gradient
              </span>
              <GradientPicker value={form.gradient} onChange={(g) => set('gradient', g)} labelledBy="adm-app-grad-l" />
            </div>
          </fieldset>

          <fieldset className="adm-fieldset">
            <legend className="adm-micro">Access</legend>
            {!canRoles && (
              <LockNote>
                Assigning roles requires “Manage roles &amp; permissions”. Until a role manager grants access, only System Admins can open
                the app.
              </LockNote>
            )}
            <div className="adm-role-toggles" role="group" aria-label="Roles with access">
              {assignable.map((role) => {
                const above = role.clearance > myClearance;
                const disabled = !canRoles || above;
                const checked = roleIds.includes(role.id);
                return (
                  <label
                    key={role.id}
                    className={cx('adm-role-toggle', disabled && 'is-locked', checked && 'is-checked')}
                    style={{ '--role': role.color } as CSSProperties}
                    title={above ? `Above your clearance (L${role.clearance})` : undefined}
                  >
                    <input
                      type="checkbox"
                      className="adm-check"
                      checked={checked}
                      disabled={disabled}
                      onChange={(e) => setRoleIds((ids) => (e.target.checked ? [...ids, role.id] : ids.filter((x) => x !== role.id)))}
                    />
                    <span className="truncate">{role.name}</span>
                    <span className="tag">L{role.clearance}</span>
                  </label>
                );
              })}
            </div>
            <span className="field-hint">System Admins always have access (∗). You can fine-tune access later from the app’s settings.</span>
          </fieldset>
        </div>

        <aside className="adm-register__preview">
          <TilePreview
            name={form.name}
            tagline={form.tagline}
            category={form.category}
            icon={form.icon}
            gradient={form.gradient}
            badge={form.badge}
            discoverable={form.discoverable}
          />
          {canRoles && (
            <p className="text-xs faint adm-preview__roles">
              {roleIds.length
                ? `Visible to ${roleIds.length} role${roleIds.length === 1 ? '' : 's'} + System Admins.`
                : 'No roles selected — System Admins only.'}
            </p>
          )}
        </aside>
      </form>
    </Modal>
  );
}
