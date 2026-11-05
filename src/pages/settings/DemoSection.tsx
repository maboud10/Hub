import { useMemo, useState } from 'react';
import { Database, RotateCcw, Sparkles, TriangleAlert, UserCog } from 'lucide-react';
import { useHub } from '@/store/hub';
import { useRoles, useSessionUser } from '@/store/selectors';
import { useUI } from '@/store/ui';
import { toast } from '@/store/toast';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/primitives';
import { primaryRole } from '@/lib/rbac';
import { BRAND } from '@/config/brand';
import { cx } from '@/lib/cx';
import { SettingsSection } from './SettingsSection';

const RESET_SCOPE = [
  'People, roles, grants and account status',
  'The app catalog and its availability',
  'Access requests and the audit trail',
  'Announcements, kudos and notifications',
  'Talent Hub pipeline, offers and HR Portal onboarding journeys',
  'Everyone’s preferences — theme, pins and widgets',
];

export function DemoSection() {
  const users = useHub((s) => s.users);
  const roles = useRoles();
  const me = useSessionUser();
  const openPersonas = useUI((s) => s.setPersonaSwitcherOpen);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const personas = useMemo(() => users.filter((u) => u.persona), [users]);

  const reset = () => {
    useHub.getState().resetDemo();
    void import('@/talent/store').then((m) => m.useTalent.getState().resetTalentDemo());
    void import('@/hr/store').then((m) => m.useHr.getState().resetHrDemo());
    setConfirmOpen(false);
    toast.success('Demo data restored', 'Personas, apps, requests, posts and hiring data are back to their starting state.');
  };

  return (
    <SettingsSection id="demo" icon={<Database />} title="Demo data" description="This workspace is a sandbox — explore freely, then reset whenever you like." className="set-demo">
      <div className="set-callout">
        <span className="set-callout__icon" aria-hidden="true">
          <Sparkles />
        </span>
        <div>
          <div className="set-callout__title">Demo mode</div>
          <p className="text-sm muted">
            {BRAND.product} runs entirely in your browser: data is stored locally and every action is permission-checked like a real API,
            including the audit trail. Switch personas to feel how roles reshape the hub — from full admin control to a scoped contractor.
          </p>
        </div>
      </div>

      <ul className="set-personas">
        {personas.map((p) => (
          <li key={p.id} className={cx('set-persona', p.id === me?.id && 'is-me')}>
            <Avatar user={p} size={36} presence />
            <div className="set-persona__text">
              <div className="set-persona__name">
                <span className="truncate">{p.name}</span>
                {p.id === me?.id && <span className="badge badge--solid">You</span>}
              </div>
              <div className="set-persona__role mono">{primaryRole(p, roles)?.name ?? 'No role'}</div>
              {p.personaBlurb && <div className="set-persona__blurb">{p.personaBlurb}</div>}
            </div>
          </li>
        ))}
      </ul>

      <div className="set-demo__actions">
        <button type="button" className="btn" onClick={() => openPersonas(true)}>
          <UserCog /> Switch persona
        </button>
        <span className="spacer" />
        <button type="button" className="btn btn--danger" onClick={() => setConfirmOpen(true)}>
          <RotateCcw /> Reset demo data
        </button>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Reset all demo data?"
        subtitle="Everything goes back to the original seed. This can’t be undone."
        icon={
          <span className="set-modal-icon" aria-hidden="true">
            <TriangleAlert />
          </span>
        }
        width={500}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmOpen(false)}>
              Keep my changes
            </button>
            <button type="button" className="btn btn--danger" onClick={reset}>
              <RotateCcw /> Reset everything
            </button>
          </>
        }
      >
        <p className="text-sm muted">This restores:</p>
        <ul className="set-reset-list">
          {RESET_SCOPE.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {me && <p className="field-hint">You’ll stay signed in as {me.name}.</p>}
      </Modal>
    </SettingsSection>
  );
}
