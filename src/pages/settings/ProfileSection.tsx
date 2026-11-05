import { useMemo, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { Check, Eye, MessageSquareText, UserRound, X } from 'lucide-react';
import type { Presence, Role, User } from '@/types';
import { useHub } from '@/store/hub';
import { useCan, useClearance, usePrimaryRole, useRoles } from '@/store/selectors';
import { toast } from '@/store/toast';
import { Avatar, ClearanceBadge, PRESENCE_LABEL, RoleChip } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { SettingsSection, SubHead } from './SettingsSection';

const PRESENCE_OPTIONS: { value: Presence; hint: string }[] = [
  { value: 'online', hint: 'Open for chats and calls' },
  { value: 'focus', hint: 'Heads-down, only urgent pings' },
  { value: 'meeting', hint: 'Shown as busy to colleagues' },
  { value: 'away', hint: 'Stepped away for a bit' },
];

const SUGGESTIONS = ['🎧 Deep work', '🌴 On leave', '🚀 Shipping', '🏠 Working from home'];
const STATUS_MAX = 80;

export function ProfileSection({ me }: { me: User }) {
  const roles = useRoles();
  const primary = usePrimaryRole();
  const clearance = useClearance();
  const canPeople = useCan('hub.people.view');
  const setPresence = useHub((s) => s.setPresence);

  const myRoles = useMemo(
    () =>
      me.roleIds
        .map((id) => roles.find((r) => r.id === id))
        .filter((r): r is Role => !!r)
        .sort((a, b) => b.clearance - a.clearance),
    [me.roleIds, roles],
  );

  // Draft mirrors the stored message; re-syncs when it changes elsewhere (e.g. the focus timer).
  const current = me.statusMessage ?? '';
  const [draft, setDraft] = useState(current);
  const [synced, setSynced] = useState(current);
  if (current !== synced) {
    setSynced(current);
    setDraft(current);
  }
  const dirty = draft.trim() !== current;

  const saveStatus = (message: string) => {
    const msg = message.trim().slice(0, STATUS_MAX);
    setPresence(me.presence, msg);
    setDraft(msg);
    toast.success(msg ? 'Status updated' : 'Status cleared', msg || undefined);
  };

  const choosePresence = (p: Presence) => {
    if (p !== me.presence) setPresence(p);
  };

  const onRadioKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
    if (!forward && !back) return;
    e.preventDefault();
    const idx = Math.max(
      0,
      PRESENCE_OPTIONS.findIndex((o) => o.value === me.presence),
    );
    const next = PRESENCE_OPTIONS[(idx + (forward ? 1 : -1) + PRESENCE_OPTIONS.length) % PRESENCE_OPTIONS.length];
    choosePresence(next.value);
    e.currentTarget.querySelector<HTMLElement>(`[data-value="${next.value}"]`)?.focus();
  };

  const anyChecked = PRESENCE_OPTIONS.some((o) => o.value === me.presence);

  return (
    <SettingsSection
      id="profile"
      icon={<UserRound />}
      title="Profile & status"
      description="How colleagues see you across NEXUS — availability updates instantly everywhere."
    >
      <div className="set-identity">
        <div className="set-identity__avatar">
          <Avatar user={me} size={72} presence />
        </div>
        <div className="set-identity__text">
          <div className="set-identity__name">
            {me.name}
            {me.pronouns && <span className="set-identity__pronouns">{me.pronouns}</span>}
          </div>
          <div className="muted">{me.title}</div>
          <div className="set-identity__meta">
            <span className="mono">{me.email}</span>
            <span className="faint">
              {me.department} · {me.location}
            </span>
          </div>
          <div className="set-identity__roles">
            {myRoles.map((r) => (
              <RoleChip key={r.id} name={r.name} color={r.color} />
            ))}
            <ClearanceBadge level={clearance} label={primary?.name} />
          </div>
        </div>
        {canPeople && (
          <Link className="btn set-identity__cta" to={`/people?u=${encodeURIComponent(me.id)}`}>
            <Eye /> View my profile
          </Link>
        )}
      </div>
      <p className="field-hint">Name, title and department sync from the HR system of record — ask People Ops to change them.</p>

      <div className="divider" />

      <SubHead>Availability</SubHead>
      <div className="set-presence" role="radiogroup" aria-label="Availability" onKeyDown={onRadioKeys}>
        {PRESENCE_OPTIONS.map((o, i) => {
          const checked = me.presence === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked || (!anyChecked && i === 0) ? 0 : -1}
              data-value={o.value}
              className={cx('set-presence__opt', `dot--${o.value}`, checked && 'is-active')}
              onClick={() => choosePresence(o.value)}
            >
              <span className={cx('dot', `dot--${o.value}`, checked && 'dot--pulse')} aria-hidden="true" />
              <span className="set-presence__text">
                <span className="set-presence__label">{PRESENCE_LABEL[o.value]}</span>
                <span className="set-presence__hint">{o.hint}</span>
              </span>
              {checked && <Check className="set-presence__check" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <form
        className="set-status"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty) saveStatus(draft);
        }}
      >
        <label className="field-label" htmlFor="set-status-input">
          Status message
        </label>
        <div className="set-status__row">
          <div className="input-wrap set-status__input">
            <MessageSquareText aria-hidden="true" />
            <input
              id="set-status-input"
              className="input"
              value={draft}
              maxLength={STATUS_MAX}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="What are you up to?"
              autoComplete="off"
              aria-describedby="set-status-hint"
            />
            {draft && (
              <button type="button" className="icon-btn input-trail" onClick={() => saveStatus('')} aria-label="Clear status message">
                <X />
              </button>
            )}
          </div>
          <button type="submit" className="btn btn--primary" disabled={!dirty}>
            <Check /> Save
          </button>
        </div>
        <div className="set-status__meta" id="set-status-hint">
          <span className="field-hint">Shown on your profile card and in the directory.</span>
          <span className="field-hint mono">
            {draft.length}/{STATUS_MAX}
          </span>
        </div>
        <div className="chips set-suggestions" role="group" aria-label="Status suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className={cx('chip', current === s && 'is-active')} aria-pressed={current === s} onClick={() => saveStatus(s)}>
              {s}
            </button>
          ))}
        </div>
      </form>
    </SettingsSection>
  );
}
