/**
 * Pickers for role-based sharing: people (with DLP gates explained inline),
 * group principals (department / hub role / permission / everyone) and the
 * membership-rules editor used by shared drives.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Building2, Check, Globe, KeyRound, Plus, Search, Shield, UserRound, X } from 'lucide-react';
import type { Department, User } from '@/types';
import { useHub } from '@/store/hub';
import { Avatar } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { clearanceOf } from '@/lib/rbac';
import type { Gate } from '@/drive/access';
import { ROLE_META } from '@/drive/constants';
import type { DriveRole, Principal } from '@/drive/types';
import { DEPARTMENTS, PRINCIPAL_TYPE_LABEL, PrincipalAvatar, usePermissionCatalog, usePrincipalLabel } from './shared';

export const samePrincipal = (a: Principal, b: Principal) => a.type === b.type && (a.type === 'company' || (a as { id?: string }).id === (b as { id?: string }).id);

// ───────────────────────── people ─────────────────────────

export function PeoplePicker({
  picked,
  onChange,
  gate,
  excludeIds = [],
  placeholder = 'Search people by name, title or department',
  max = 8,
  autoFocus,
}: {
  picked: string[];
  onChange: (ids: string[]) => void;
  /** DLP gate per user — blocked people stay visible but disabled, with the reason. */
  gate?: (user: User, clearance: number) => Gate;
  excludeIds?: string[];
  placeholder?: string;
  max?: number;
  autoFocus?: boolean;
}) {
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  const me = useHub((s) => s.sessionUserId);
  const [q, setQ] = useState('');

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users
      .filter((u) => u.active && u.id !== me && !excludeIds.includes(u.id) && !picked.includes(u.id))
      .filter((u) => !needle || `${u.name} ${u.title} ${u.department} ${u.email}`.toLowerCase().includes(needle))
      .slice(0, needle ? max : max)
      .map((u) => {
        const clearance = clearanceOf(u, roles);
        const g: Gate = gate ? gate(u, clearance) : { ok: true };
        return { u, clearance, gate: g, contractor: u.roleIds.includes('contractor') };
      });
  }, [users, roles, me, q, excludeIds, picked, gate, max]);

  const blocked = results.filter((r) => !r.gate.ok).length;

  return (
    <div className="dr-people">
      {picked.length > 0 && (
        <div className="dr-picked">
          {picked.map((id) => {
            const u = users.find((x) => x.id === id);
            if (!u) return null;
            return (
              <span key={id} className="dr-picked__chip">
                <Avatar user={u} size={18} />
                {u.name}
                <button type="button" aria-label={`Remove ${u.name}`} onClick={() => onChange(picked.filter((x) => x !== id))}>
                  <X />
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div className="input-wrap">
        <Search />
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label="Search people" autoFocus={autoFocus} />
      </div>
      <div className="dr-people__list" role="listbox" aria-label="People">
        {results.length === 0 && <div className="text-sm muted" style={{ padding: '10px 4px' }}>No one matches “{q}”.</div>}
        {results.map(({ u, clearance, gate: g, contractor }) => (
          <button
            key={u.id}
            type="button"
            role="option"
            aria-selected={false}
            className={cx('dr-person', !g.ok && 'is-blocked')}
            disabled={!g.ok}
            title={!g.ok ? g.reason : undefined}
            onClick={() => onChange([...picked, u.id])}
          >
            <Avatar user={u} size={30} />
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="dr-person__name truncate">
                {u.name}
                {contractor && <span className="tag">Contractor</span>}
                <span className="dr-person__clr mono">L{clearance}</span>
              </span>
              <span className="dr-person__sub truncate">
                {u.title} · {u.department}
              </span>
              {!g.ok && <span className="dr-person__why">{g.reason}</span>}
            </span>
            {g.ok && <Plus className="dr-person__add" />}
          </button>
        ))}
      </div>
      {blocked > 0 && (
        <div className="dr-dlp-note">
          <Shield /> {blocked} {blocked === 1 ? 'person is' : 'people are'} shown greyed out — the sensitivity label blocks sharing with them. Hover a name for the exact reason.
        </div>
      )}
    </div>
  );
}

// ───────────────────────── group principals ─────────────────────────

export type GroupPrincipalType = Exclude<Principal['type'], 'user'>;
const GROUP_TYPES: { type: GroupPrincipalType; icon: ReactNode; hint: string }[] = [
  { type: 'department', icon: <Building2 />, hint: 'Everyone currently in a department (contractors excluded).' },
  { type: 'role', icon: <KeyRound />, hint: 'Everyone holding a Hub role, e.g. Finance or People Ops.' },
  { type: 'permission', icon: <Shield />, hint: 'Anyone whose roles grant a permission — e.g. app:payroll means “anyone who can open Payroll”.' },
  { type: 'company', icon: <Globe />, hint: 'All employees. Contractors are never included.' },
];

export function PrincipalPicker({ value, onChange, gate, allowed }: { value: Principal | null; onChange: (p: Principal) => void; gate?: (p: Principal) => Gate; allowed?: GroupPrincipalType[] }) {
  const roles = useHub((s) => s.roles);
  const perms = usePermissionCatalog();
  const types = GROUP_TYPES.filter((t) => !allowed || allowed.includes(t.type));
  const type: GroupPrincipalType = value && value.type !== 'user' ? value.type : types[0]?.type ?? 'department';
  const current = types.find((t) => t.type === type);
  const g: Gate | null = value && gate ? gate(value) : null;

  const pick = (t: GroupPrincipalType) => {
    if (t === 'company') onChange({ type: 'company' });
    else if (t === 'department') onChange({ type: 'department', id: DEPARTMENTS[0] });
    else if (t === 'role') onChange({ type: 'role', id: roles[0]?.id ?? 'employee' });
    else onChange({ type: 'permission', id: perms.find((p) => p.id.startsWith('app:'))?.id ?? perms[0]?.id ?? 'app:drive' });
  };

  return (
    <div className="dr-pp">
      <div className="dr-seg" role="group" aria-label="Principal type">
        {types.map((t) => (
          <button key={t.type} type="button" aria-pressed={type === t.type} onClick={() => pick(t.type)}>
            {t.icon}
            {PRINCIPAL_TYPE_LABEL[t.type]}
          </button>
        ))}
      </div>
      <div className="dr-pp__row">
        {type === 'department' && (
          <select className="select" value={value?.type === 'department' ? value.id : ''} onChange={(e) => onChange({ type: 'department', id: e.target.value as Department })} aria-label="Department">
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}
        {type === 'role' && (
          <select className="select" value={value?.type === 'role' ? value.id : ''} onChange={(e) => onChange({ type: 'role', id: e.target.value })} aria-label="Hub role">
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · L{r.clearance}
              </option>
            ))}
          </select>
        )}
        {type === 'permission' && (
          <select className="select" value={value?.type === 'permission' ? value.id : ''} onChange={(e) => onChange({ type: 'permission', id: e.target.value })} aria-label="Permission">
            <optgroup label="Apps">
              {perms
                .filter((p) => p.category === 'Apps')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} ({p.id})
                  </option>
                ))}
            </optgroup>
            <optgroup label="Hub capabilities">
              {perms
                .filter((p) => p.category !== 'Apps')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} ({p.id})
                  </option>
                ))}
            </optgroup>
          </select>
        )}
        {type === 'company' && (
          <div className="dr-pp__company">
            <Globe /> Everyone at Helix <span className="muted">· employees only</span>
          </div>
        )}
      </div>
      <p className="field-hint">{current?.hint}</p>
      {g && !g.ok && (
        <div className="dr-dlp-note is-blocked">
          <Shield /> {g.reason}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── membership rules (shared drives) ─────────────────────────

export interface MembershipRule {
  principal: Principal;
  role: DriveRole;
}

export function MembershipRulesEditor({ rules, onChange, roleOptions = ['viewer', 'commenter', 'editor', 'manager'] }: { rules: MembershipRule[]; onChange: (rules: MembershipRule[]) => void; roleOptions?: DriveRole[] }) {
  const label = usePrincipalLabel();
  const [mode, setMode] = useState<'group' | 'person'>('group');
  const [draft, setDraft] = useState<Principal | null>({ type: 'department', id: DEPARTMENTS[0] });
  const [people, setPeople] = useState<string[]>([]);
  const [role, setRole] = useState<DriveRole>('editor');

  const add = () => {
    const adds: MembershipRule[] = mode === 'person' ? people.map((id) => ({ principal: { type: 'user', id } as Principal, role })) : draft ? [{ principal: draft, role }] : [];
    if (!adds.length) return;
    const next = rules.filter((r) => !adds.some((a) => samePrincipal(a.principal, r.principal)));
    onChange([...next, ...adds]);
    setPeople([]);
  };

  return (
    <div className="dr-rules">
      <div className="dr-rules__list">
        {rules.length === 0 && <div className="text-sm muted">No membership rules yet — only managers can see this drive.</div>}
        {rules.map((r, i) => (
          <div key={`${r.principal.type}-${(r.principal as { id?: string }).id ?? 'all'}`} className="dr-rule">
            <PrincipalAvatar principal={r.principal} size={28} />
            <span className="grow truncate">
              {label(r.principal)}
              <span className="dr-rule__type">{PRINCIPAL_TYPE_LABEL[r.principal.type]}</span>
            </span>
            <select className="select select--sm" value={r.role} aria-label={`Role for ${label(r.principal)}`} onChange={(e) => onChange(rules.map((x, j) => (j === i ? { ...x, role: e.target.value as DriveRole } : x)))}>
              {roleOptions.map((o) => (
                <option key={o} value={o}>
                  {ROLE_META[o].label}
                </option>
              ))}
            </select>
            <button type="button" className="icon-btn icon-btn--sm" aria-label={`Remove ${label(r.principal)}`} onClick={() => onChange(rules.filter((_, j) => j !== i))}>
              <X />
            </button>
          </div>
        ))}
      </div>
      <div className="dr-rules__add">
        <div className="dr-seg dr-seg--mini" role="group" aria-label="Add rule for">
          <button type="button" aria-pressed={mode === 'group'} onClick={() => setMode('group')}>
            <Building2 /> Group
          </button>
          <button type="button" aria-pressed={mode === 'person'} onClick={() => setMode('person')}>
            <UserRound /> Person
          </button>
        </div>
        {mode === 'group' ? <PrincipalPicker value={draft} onChange={setDraft} /> : <PeoplePicker picked={people} onChange={setPeople} max={6} />}
        <div className="dr-rules__addrow">
          <select className="select" value={role} onChange={(e) => setRole(e.target.value as DriveRole)} aria-label="Role">
            {roleOptions.map((o) => (
              <option key={o} value={o}>
                {ROLE_META[o].label} — {ROLE_META[o].description}
              </option>
            ))}
          </select>
          <button type="button" className="btn" onClick={add} disabled={mode === 'person' ? people.length === 0 : !draft}>
            <Check /> Add rule
          </button>
        </div>
      </div>
    </div>
  );
}
