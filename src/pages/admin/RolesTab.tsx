import { useMemo, useState, type CSSProperties } from 'react';
import { LockKeyhole, Pencil, Plus, ShieldHalf, Trash2 } from 'lucide-react';
import { useHub } from '@/store/hub';
import { useClearance } from '@/store/selectors';
import { toast } from '@/store/toast';
import { Avatar, ClearanceBadge } from '@/components/ui/primitives';
import { pluralize } from '@/lib/format';
import type { Role, User } from '@/types';
import { PermissionMatrix } from './PermissionMatrix';
import { RoleFormModal } from './RoleFormModal';
import { ConfirmModal, Tip, useDisclosure } from './shared';

export function RolesTab() {
  const roles = useHub((s) => s.roles);
  const users = useHub((s) => s.users);
  const myClearance = useClearance();
  const [form, setForm] = useState<{ open: boolean; roleId: string | null; key: number }>({ open: false, roleId: null, key: 0 });
  const del = useDisclosure<string>();

  const sorted = useMemo(() => [...roles].sort((a, b) => b.clearance - a.clearance || a.name.localeCompare(b.name)), [roles]);
  const membersByRole = useMemo(() => {
    const map = new Map<string, User[]>();
    for (const r of roles) map.set(r.id, []);
    for (const u of users) for (const id of u.roleIds) map.get(id)?.push(u);
    return map;
  }, [roles, users]);

  const openForm = (roleId: string | null) => setForm((f) => ({ open: true, roleId, key: f.key + 1 }));
  const closeForm = () => setForm((f) => ({ ...f, open: false }));
  const formRole = form.roleId ? (roles.find((r) => r.id === form.roleId) ?? null) : null;

  const delRole = del.value ? roles.find((r) => r.id === del.value) : undefined;
  const delMembers = delRole ? (membersByRole.get(delRole.id) ?? []) : [];
  const orphaned = delMembers.filter((u) => u.roleIds.length === 1);

  return (
    <div className="adm-panel">
      <section aria-labelledby="adm-roles-cat-h">
        <div className="section-head adm-wrap-head">
          <div>
            <h2 id="adm-roles-cat-h" className="section-title">
              <ShieldHalf aria-hidden="true" /> Roles <span className="count">{roles.length}</span>
            </h2>
            <p className="text-sm faint">People can hold several roles; their clearance is the highest among them.</p>
          </div>
          <button type="button" className="btn btn--primary" onClick={() => openForm(null)}>
            <Plus aria-hidden="true" /> New role
          </button>
        </div>

        <div className="adm-roles-grid stagger">
          {sorted.map((role, i) => {
            const members = membersByRole.get(role.id) ?? [];
            const active = members.filter((u) => u.active);
            const above = role.clearance > myClearance;
            const editLock = above ? `Above your clearance (L${role.clearance} > L${myClearance})` : null;
            const deleteLock = role.system ? 'Built-in roles can’t be deleted' : editLock;
            const fullAccess = role.locked || role.permissions.includes('*');
            return (
              <article
                key={role.id}
                className="card adm-role-card"
                style={{ '--role': role.color, '--i': i } as CSSProperties}
                aria-labelledby={`adm-role-${role.id}`}
              >
                <span className="adm-role-card__bar" aria-hidden="true" />
                <span className="adm-role-card__glow" aria-hidden="true" />
                <div className="adm-role-card__head">
                  <span className="adm-swatch-dot adm-swatch-dot--lg" aria-hidden="true" />
                  <div className="grow">
                    <h3 id={`adm-role-${role.id}`} className="adm-role-card__name truncate">
                      {role.name}
                    </h3>
                    <div className="row row--wrap adm-gap-6">
                      {role.system ? <span className="tag">System</span> : <span className="tag adm-tag--custom">Custom</span>}
                      {role.locked && (
                        <span className="tag">
                          <LockKeyhole aria-hidden="true" /> Locked
                        </span>
                      )}
                    </div>
                  </div>
                  <ClearanceBadge level={role.clearance} compact />
                </div>
                <p className="text-sm muted clamp-2 adm-role-card__desc">{role.description}</p>
                <div className="adm-role-card__stats">
                  <div className="adm-role-card__stat">
                    <span className="adm-micro">Members</span>
                    <strong>{members.length}</strong>
                    <span className="text-xs faint">{members.length === active.length ? 'all active' : `${active.length} active`}</span>
                  </div>
                  <div className="adm-role-card__stat">
                    <span className="adm-micro">Permissions</span>
                    <strong>{fullAccess ? 'All (∗)' : role.permissions.length}</strong>
                    <span className="text-xs faint">
                      {fullAccess ? 'every app & capability' : `${role.permissions.filter((p) => p.startsWith('app:')).length} apps`}
                    </span>
                  </div>
                </div>
                <div className="adm-role-card__foot">
                  {members.length > 0 ? (
                    <span className="avatar-stack" role="img" aria-label={pluralize(members.length, 'member')}>
                      {members.slice(0, 5).map((u) => (
                        <Avatar key={u.id} user={u} size={26} />
                      ))}
                      {members.length > 5 && <span className="adm-stack-more">+{members.length - 5}</span>}
                    </span>
                  ) : (
                    <span className="text-xs faint">No members yet</span>
                  )}
                  <span className="spacer" />
                  <Tip tip={editLock}>
                    <button
                      type="button"
                      className="icon-btn icon-btn--sm"
                      aria-label={`Edit ${role.name}`}
                      disabled={!!editLock}
                      onClick={() => openForm(role.id)}
                    >
                      <Pencil />
                    </button>
                  </Tip>
                  {!role.system && (
                    <Tip tip={deleteLock}>
                      <button
                        type="button"
                        className="icon-btn icon-btn--sm adm-icon-danger"
                        aria-label={`Delete ${role.name}`}
                        disabled={!!deleteLock}
                        onClick={() => del.show(role.id)}
                      >
                        <Trash2 />
                      </button>
                    </Tip>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <PermissionMatrix />

      <RoleFormModal key={form.key} open={form.open} onClose={closeForm} role={formRole} myClearance={myClearance} />

      <ConfirmModal
        open={del.open}
        onClose={del.hide}
        title={delRole ? `Delete “${delRole.name}”?` : 'Delete role?'}
        subtitle="This can’t be undone."
        icon={Trash2}
        confirmLabel="Delete role"
        onConfirm={() => {
          if (delRole) toast.result(useHub.getState().deleteRole(delRole.id));
          del.hide();
        }}
      >
        {delRole && <DeleteImpact role={delRole} members={delMembers} orphaned={orphaned} />}
      </ConfirmModal>
    </div>
  );
}

function DeleteImpact({ role, members, orphaned }: { role: Role; members: User[]; orphaned: User[] }) {
  return (
    <div className="stack">
      <p className="muted">
        {members.length
          ? `${pluralize(members.length, 'person', 'people')} will lose ${role.name} and its ${pluralize(role.permissions.length, 'permission')}.`
          : `No one holds ${role.name}. Its ${pluralize(role.permissions.length, 'permission')} will be discarded.`}{' '}
        It’s also removed from announcement audiences.
      </p>
      {orphaned.length > 0 && (
        <div className="adm-note adm-tone--danger">
          <LockKeyhole aria-hidden="true" />
          <span>
            {orphaned.map((u) => u.name).join(', ')} {orphaned.length === 1 ? 'has' : 'have'} no other role and will be left without any
            role-based access. Assign them another role first.
          </span>
        </div>
      )}
    </div>
  );
}
