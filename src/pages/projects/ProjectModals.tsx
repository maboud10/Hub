/**
 * Project modals: Share (members & roles, privacy), Settings, Status update (Nova draft).
 */
import { useEffect, useMemo, useState } from 'react';
import { Building2, Check, Copy, Globe2, Hash, Lock, Sparkles, UserPlus, Users } from 'lucide-react';
import { NovaChip, PeoplePicker, Typing, useTypewriter, type MenuEntry, NeoMenu } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { currentViewer, loadBridge, type BridgeChannel } from '@/lib/appBridge';
import { cx } from '@/lib/cx';
import { toast } from '@/store/toast';
import type { Department } from '@/types';
import { PRIVACY_LABEL, canAdminProject, canEditProject, ROLE_LABEL } from '@/projects/access';
import { formatDue } from '@/projects/dates';
import { draftStatusUpdate, STATUS_LABEL } from '@/projects/metrics';
import { PRIORITY_NAME } from '@/projects/nlp';
import { ProjectSigil, SIGIL_IDS, SIGIL_LABEL, sigilIdFor } from '@/projects/sigils';
import { useProjects } from '@/projects/store';
import type { Privacy, Project, ProjectRole, ProjectStatus, Task } from '@/projects/types';
import { useActor, useUsersMap } from './ctx';
import { DatePicker, PRIORITIES, PriorityGlyph, StatusPill, STATUSES } from './ui';

export const DEPARTMENTS: Department[] = ['Engineering', 'Design', 'Product', 'People Ops', 'Finance', 'Sales', 'Marketing', 'IT & Security', 'Operations', 'Customer Success'];
export const EMOJIS = ['🚀', '🎨', '🛡️', '🛰️', '🤝', '🌱', '📣', '✨', '🧭', '🏗️', '📊', '💳', '🧪', '🎯', '🗂️', '⚡', '🔐', '📦', '🧠', '🎤', '🏁', '💡', '🌍', '🔭'];
export const COLORS = ['#a78bfa', '#818cf8', '#38bdf8', '#22d3ee', '#2dd4bf', '#34d399', '#a3e635', '#fbbf24', '#fb923c', '#f472b6', '#fb7185', '#94a3b8'];

const PRIVACY_ICON: Record<Privacy, React.ReactNode> = { public: <Globe2 />, team: <Building2 />, private: <Lock /> };
const PRIVACY_HELP: Record<Privacy, string> = {
  public: 'Everyone at Helix can find and view it. Contractors only see projects they’re added to.',
  team: 'Only the department (and Projects admins) can view it.',
  private: 'Only members can see it — not even admins.',
};

function useChannels(open: boolean) {
  const [channels, setChannels] = useState<BridgeChannel[]>([]);
  useEffect(() => {
    if (!open) return;
    const viewer = currentViewer();
    if (!viewer) return;
    let alive = true;
    loadBridge('chat')
      .then((api) => alive && setChannels(api.listChannels(viewer).filter((c) => c.kind === 'channel')))
      .catch(() => alive && setChannels([]));
    return () => {
      alive = false;
    };
  }, [open]);
  return channels;
}

/* ───────────────────────── Share ───────────────────────── */

export function ShareModal({ open, onClose, project }: { open: boolean; onClose: () => void; project: Project }) {
  const actor = useActor()!;
  const users = useUsersMap();
  const store = useProjects.getState;
  const canAdmin = canAdminProject(project, actor);
  const canEdit = canEditProject(project, actor);
  const [invite, setInvite] = useState<string[]>([]);
  const [role, setRole] = useState<ProjectRole>('editor');
  const channels = useChannels(open);

  const add = () => {
    const r = store().addMembers(project.id, invite, role);
    if (!r.ok) return toast.error(r.error);
    toast.success(`Added ${r.added} ${r.added === 1 ? 'person' : 'people'}`, `as ${ROLE_LABEL[role].toLowerCase()}`);
    setInvite([]);
  };

  const roleMenu = (userId: string, current: ProjectRole): MenuEntry[] => [
    ...(['editor', 'commenter', 'viewer'] as ProjectRole[]).map((r) => ({
      label: ROLE_LABEL[r],
      checked: current === r,
      onSelect: () => toast.result(store().setMemberRole(project.id, userId, r), `${users.get(userId)?.name.split(' ')[0]} is now ${r === 'editor' ? 'an' : 'a'} ${r}`),
    })),
    { kind: 'sep' },
    { label: 'Make owner', onSelect: () => toast.result(store().setMemberRole(project.id, userId, 'owner'), `Ownership transferred to ${users.get(userId)?.name.split(' ')[0]}`) },
    { label: 'Remove from project', danger: true, onSelect: () => toast.result(store().setMemberRole(project.id, userId, null), 'Removed') },
  ];

  const members = [...project.members].sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0));
  const candidates = useMemo(() => [...users.values()].filter((u) => u.active && !project.members.some((m) => m.userId === u.id)), [users, project.members]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Share ${project.name}`}
      subtitle={`${PRIVACY_LABEL[project.privacy]} · ${project.members.length} members`}
      width={580}
      className="neo-portal pj-modal pj-share"
      footer={
        <>
          <button
            type="button"
            className="neo-btn neo-btn--ghost"
            onClick={() => {
              void navigator.clipboard?.writeText(`${window.location.origin}/projects/p/${project.id}`);
              toast.success('Link copied', 'Only people with access can open it.');
            }}
          >
            <Copy /> Copy link
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className="pj-share__privacy" role="radiogroup" aria-label="Privacy">
        {(['public', 'team', 'private'] as Privacy[]).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={project.privacy === p}
            disabled={!canAdmin}
            className={cx('pj-privopt', project.privacy === p && 'is-on')}
            onClick={() => toast.result(store().setPrivacy(project.id, p), `Privacy: ${PRIVACY_LABEL[p]}`)}
          >
            {PRIVACY_ICON[p]}
            <span className="pj-privopt__t">{p === 'team' ? project.department : PRIVACY_LABEL[p]}</span>
            <span className="pj-privopt__d">{PRIVACY_HELP[p]}</span>
          </button>
        ))}
      </div>
      {!canAdmin && <p className="neo-hint pj-share__hint">Only the owner or a Projects admin can change privacy and roles.</p>}

      {canAdmin && (
        <div className="pj-share__invite">
          <PeoplePicker
            multiple
            value={invite}
            onChange={setInvite}
            users={candidates}
            label="Invite people"
            trigger={(p) => (
              <button {...p} type="button" className="pj-invitebox">
                <UserPlus />
                {invite.length ? (
                  <span className="pj-invitebox__people">
                    {invite.map((id) => (
                      <span key={id} className="pj-invitebox__chip">
                        <Avatar user={users.get(id)!} size={18} /> {users.get(id)?.name.split(' ')[0]}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="neo-faint">Add people by name…</span>
                )}
              </button>
            )}
          />
          <select className="neo-select neo-select--sm pj-share__role" value={role} onChange={(e) => setRole(e.target.value as ProjectRole)} aria-label="Role for new members">
            <option value="editor">Editor</option>
            <option value="commenter">Commenter</option>
            <option value="viewer">Viewer</option>
          </select>
          <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" disabled={!invite.length} onClick={add} data-qa="invite">
            Invite
          </button>
        </div>
      )}

      <div className="neo-section-head pj-share__head">
        <Users className="pj-ico" />
        <span className="neo-title" style={{ fontSize: 14 }}>
          Members &amp; roles
        </span>
      </div>
      <ul className="pj-members">
        {members.map((m) => {
          const u = users.get(m.userId);
          if (!u) return null;
          return (
            <li key={m.userId} className="pj-member">
              <Avatar user={u} size={32} presence />
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="pj-member__name truncate">
                  {u.name}
                  {u.id === actor.id && <span className="neo-faint"> (you)</span>}
                </span>
                <span className="pj-member__sub truncate">
                  {u.title} · {u.department}
                  {u.roleIds.includes('contractor') ? ' · Contractor' : ''}
                </span>
              </span>
              {m.role === 'owner' || !canAdmin ? (
                <span className={cx('pj-role', m.role === 'owner' && 'is-owner')}>{ROLE_LABEL[m.role]}</span>
              ) : (
                <NeoMenu
                  items={roleMenu(m.userId, m.role)}
                  width={210}
                  label="Role"
                  trigger={(p) => (
                    <button {...p} type="button" className="pj-role pj-role--btn">
                      {ROLE_LABEL[m.role]} ▾
                    </button>
                  )}
                />
              )}
            </li>
          );
        })}
      </ul>

      <div className="pj-share__channel">
        <Hash className="pj-ico" />
        <span className="grow">
          <span className="pj-member__name">Pulse channel</span>
          <span className="pj-member__sub">Task cards from “Discuss in Pulse” and automations land here.</span>
        </span>
        <select
          className="neo-select neo-select--sm"
          value={project.channelId ?? ''}
          disabled={!canEdit}
          onChange={(e) => toast.result(store().updateProject(project.id, { channelId: e.target.value }), e.target.value ? 'Channel linked' : 'Channel unlinked')}
          aria-label="Linked Pulse channel"
        >
          <option value="">Not linked</option>
          {project.channelId && !channels.some((c) => c.id === project.channelId) && <option value={project.channelId}>#{project.channelId.replace(/^ch-/, '')}</option>}
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              #{c.name.replace(/^#/, '')}
            </option>
          ))}
        </select>
      </div>
    </Modal>
  );
}

/* ───────────────────────── Settings ───────────────────────── */

export function ProjectSettingsModal({ open, onClose, project }: { open: boolean; onClose: () => void; project: Project }) {
  const store = useProjects.getState;
  const [name, setName] = useState(project.name);
  const [icon, setIcon] = useState(project.icon);
  const [color, setColor] = useState(project.color);
  const [start, setStart] = useState(project.startDate);
  const [due, setDue] = useState(project.dueDate);
  const [dept, setDept] = useState<Department>(project.department);
  const [prio, setPrio] = useState(project.priority);
  useEffect(() => {
    if (!open) return;
    setName(project.name);
    setIcon(project.icon);
    setColor(project.color);
    setStart(project.startDate);
    setDue(project.dueDate);
    setDept(project.department);
    setPrio(project.priority);
  }, [open, project]);
  const save = () => {
    const r = store().updateProject(project.id, { name, icon, color, startDate: start, dueDate: due, department: dept, priority: prio });
    if (toast.result(r, 'Project updated')) onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Project settings"
      subtitle={project.key}
      width={560}
      className="neo-portal pj-modal"
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div className="pj-form">
        <label className="neo-field">
          <span className="neo-label">Name</span>
          <input className="neo-input" value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
        </label>
        <div className="neo-field">
          <span className="neo-label">Sigil</span>
          <div className="pj-emojigrid pj-sigilgrid" role="radiogroup" aria-label="Project sigil">
            {SIGIL_IDS.map((id) => {
              const on = sigilIdFor(icon) === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={cx(on && 'is-on')}
                  onClick={() => setIcon(id)}
                  aria-label={`Use ${SIGIL_LABEL[id]} sigil`}
                  title={SIGIL_LABEL[id]}
                >
                  <ProjectSigil icon={id} color={color} size={32} />
                </button>
              );
            })}
          </div>
        </div>
        <div className="neo-field">
          <span className="neo-label">Colour</span>
          <div className="pj-swatches">
            {COLORS.map((c) => (
              <button key={c} type="button" className={cx('pj-swatch', color === c && 'is-on')} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Colour ${c}`}>
                {color === c && <Check />}
              </button>
            ))}
          </div>
        </div>
        <div className="pj-form__row">
          <div className="neo-field">
            <span className="neo-label">Start</span>
            <DatePicker value={start} onChange={(v) => v && setStart(v)} allowClear={false} trigger={(p) => <button {...p} type="button" className="neo-input pj-dateinput">{formatDue(start)}</button>} />
          </div>
          <div className="neo-field">
            <span className="neo-label">Due</span>
            <DatePicker value={due} onChange={(v) => v && setDue(v)} allowClear={false} trigger={(p) => <button {...p} type="button" className="neo-input pj-dateinput">{formatDue(due)}</button>} />
          </div>
        </div>
        <div className="pj-form__row">
          <label className="neo-field">
            <span className="neo-label">Department</span>
            <select className="neo-select" value={dept} onChange={(e) => setDept(e.target.value as Department)}>
              {DEPARTMENTS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <div className="neo-field">
            <span className="neo-label">Priority</span>
            <div className="pj-filterpop__chips">
              {PRIORITIES.filter((p) => p !== 'none').map((p) => (
                <button key={p} type="button" className={cx('pj-fchip pj-fchip--sm', prio === p && 'is-on')} onClick={() => setPrio(p)}>
                  <PriorityGlyph priority={p} /> {PRIORITY_NAME[p]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ───────────────────────── Status update ───────────────────────── */

export function StatusUpdateModal({ open, onClose, project, tasks, initialStatus }: { open: boolean; onClose: () => void; project: Project; tasks: Task[]; initialStatus: ProjectStatus }) {
  const store = useProjects.getState;
  const users = useUsersMap();
  const [status, setStatus] = useState<ProjectStatus>(initialStatus);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [nova, setNova] = useState<'idle' | 'thinking' | 'typing'>('idle');
  const [draft, setDraft] = useState('');
  const [typed, done] = useTypewriter(draft, 220);
  const [byNova, setByNova] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStatus(initialStatus);
    setTitle('');
    setBody('');
    setNova('idle');
    setDraft('');
    setByNova(false);
  }, [open, initialStatus]);

  useEffect(() => {
    if (nova === 'typing') {
      setBody(typed);
      if (done) setNova('idle');
    }
  }, [typed, done, nova]);

  const runNova = () => {
    setNova('thinking');
    window.setTimeout(() => {
      const d = draftStatusUpdate(project, tasks, Date.now(), (id) => (id ? (users.get(id)?.name ?? 'Someone') : 'Unassigned'));
      setStatus(d.status);
      setTitle(d.title);
      setDraft(d.body);
      setByNova(true);
      setNova('typing');
    }, 800);
  };

  const post = () => {
    const r = store().postStatusUpdate(project.id, { status, title, body, byNova });
    if (toast.result(r, 'Status update posted')) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Post a status update"
      subtitle={`${project.name} · members are notified`}
      width={600}
      className="neo-portal pj-modal"
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--nova" onClick={runNova} disabled={nova !== 'idle'} data-qa="nova-draft">
            <Sparkles /> {nova === 'thinking' ? 'Reading the project…' : 'Draft with Nova'}
          </button>
          <span className="grow" />
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={post} disabled={!title.trim() && !body.trim()} data-qa="post-update">
            Post update
          </button>
        </>
      }
    >
      <div className="pj-statuspick" role="radiogroup" aria-label="Status">
        {STATUSES.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={status === s} className={cx('pj-statusopt', status === s && 'is-on')} onClick={() => setStatus(s)}>
            <StatusPill status={s} />
          </button>
        ))}
      </div>
      <label className="neo-field" style={{ marginTop: 14 }}>
        <span className="neo-label">Headline</span>
        <input className="neo-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`e.g. ${STATUS_LABEL[status]} — tokens lock this week`} data-autofocus />
      </label>
      <label className="neo-field" style={{ marginTop: 12 }}>
        <span className="neo-label pj-labelrow">
          What changed?
          {byNova && <NovaChip>Drafted by Nova</NovaChip>}
          {nova === 'thinking' && <Typing label="Nova is drafting" />}
        </span>
        <textarea className="neo-textarea pj-statusbody" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Wins, risks, blockers and what’s next. **Bold** and - bullets work." />
      </label>
    </Modal>
  );
}
