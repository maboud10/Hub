import { useMemo, useState } from 'react';
import { Check, Search, Shield, UserPlus, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { ROLE_META } from '@/projects/constants';
import type { Project, ProjectRole } from '@/projects/types';
import { api, PRIVACY_HELP, report, useActiveUsers, useUserMap } from './shared';

const ASSIGNABLE: ProjectRole[] = ['editor', 'commenter', 'viewer'];

export function MembersModal({ open, onClose, project, canAdmin }: { open: boolean; onClose: () => void; project: Project; canAdmin: boolean }) {
  const users = useUserMap();
  const all = useActiveUsers();
  const [q, setQ] = useState('');
  const [role, setRole] = useState<ProjectRole>('editor');
  const memberIds = useMemo(() => new Set(project.members.map((m) => m.userId)), [project.members]);
  const query = q.trim().toLowerCase();
  const candidates = useMemo(
    () => (query ? all.filter((u) => !memberIds.has(u.id) && (u.name.toLowerCase().includes(query) || u.title.toLowerCase().includes(query) || u.department.toLowerCase().includes(query))).slice(0, 6) : []),
    [all, memberIds, query],
  );

  return (
    <Modal open={open} onClose={onClose} title="Members & sharing" subtitle={`${project.members.length} member${project.members.length === 1 ? '' : 's'} · ${project.privacy} project`} icon={<Shield className="pj-modal-icon" />} width={560}>
      <div className="pj-note pj-note--muted">
        <span>{PRIVACY_HELP[project.privacy]}</span>
      </div>

      {canAdmin && (
        <div className="pj-addmember">
          <div className="pj-menu__search pj-menu__search--block">
            <Search />
            <input className="pj-menu__input" placeholder="Add people by name, title or team…" value={q} onChange={(e) => setQ(e.target.value)} />
            {q && (
              <button type="button" className="pj-search__clear" onClick={() => setQ('')} aria-label="Clear">
                <X />
              </button>
            )}
          </div>
          <select className="select pj-select-sm" value={role} onChange={(e) => setRole(e.target.value as ProjectRole)} aria-label="Role for new members">
            {ASSIGNABLE.map((r) => (
              <option key={r} value={r}>
                {ROLE_META[r].label}
              </option>
            ))}
          </select>
        </div>
      )}
      {candidates.length > 0 && (
        <ul className="pj-people pj-people--compact">
          {candidates.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className="pj-people__item"
                onClick={() => {
                  if (report(api().addMember(project.id, u.id, role))) setQ('');
                }}
              >
                <Avatar user={u} size={28} />
                <span className="grow truncate">
                  <span className="pj-people__name">{u.name}</span>
                  <small>
                    {u.title} · {u.department}
                  </small>
                </span>
                <span className="btn btn--sm">
                  <UserPlus /> Add as {ROLE_META[role].label.toLowerCase()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <ul className="pj-members">
        {project.members.map((m) => {
          const u = users.get(m.userId);
          if (!u) return null;
          const isOwner = m.userId === project.ownerId;
          return (
            <li key={m.userId} className="pj-members__row">
              <Avatar user={u} size={32} />
              <span className="grow truncate">
                <span className="pj-people__name">
                  {u.name}
                  {isOwner && <span className="pj-owner-tag">Owner</span>}
                </span>
                <small>
                  {u.title} · {u.department}
                </small>
              </span>
              {canAdmin && !isOwner ? (
                <>
                  <select className="select pj-select-sm" value={m.role} onChange={(e) => report(api().updateMemberRole(project.id, m.userId, e.target.value as ProjectRole))} aria-label={`Role for ${u.name}`}>
                    {(['owner', ...ASSIGNABLE] as ProjectRole[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_META[r].label}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="icon-btn icon-btn--sm" onClick={() => report(api().removeMember(project.id, m.userId))} aria-label={`Remove ${u.name}`} title="Remove from project">
                    <X />
                  </button>
                </>
              ) : (
                <span className={cx('badge', m.role === 'owner' ? 'badge--info' : 'badge--muted')} title={ROLE_META[m.role].description}>
                  {m.role === 'owner' && <Check />}
                  {ROLE_META[m.role].label}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="field-hint" style={{ marginTop: 12 }}>
        {ASSIGNABLE.map((r) => `${ROLE_META[r].label}: ${ROLE_META[r].description}`).join(' · ')}
      </p>
    </Modal>
  );
}
