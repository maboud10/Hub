import { useNavigate } from 'react-router';
import { Check, Keyboard } from 'lucide-react';
import { useHub } from '@/store/hub';
import { useUI } from '@/store/ui';
import { toast } from '@/store/toast';
import { useSessionUser } from '@/store/selectors';
import { Modal } from '@/components/ui/Modal';
import { Avatar, ClearanceBadge, RoleChip } from '@/components/ui/primitives';
import { clearanceOf, primaryRole } from '@/lib/rbac';
import { cx } from '@/lib/cx';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

export const SHORTCUTS: { group: string; items: { keys: string[]; label: string }[] }[] = [
  {
    group: 'Everywhere',
    items: [
      { keys: [MOD, 'K'], label: 'Open command palette' },
      { keys: ['/'], label: 'Search' },
      { keys: ['?'], label: 'Show shortcuts' },
      { keys: ['Esc'], label: 'Close overlays' },
    ],
  },
  {
    group: 'Navigate',
    items: [
      { keys: ['G', 'H'], label: 'Home' },
      { keys: ['G', 'A'], label: 'Apps' },
      { keys: ['G', 'P'], label: 'People' },
      { keys: ['G', 'N'], label: 'Newsroom' },
      { keys: ['G', 'S'], label: 'Settings' },
      { keys: ['G', 'X'], label: 'Control Center' },
    ],
  },
  {
    group: 'Actions',
    items: [
      { keys: ['1–9'], label: 'Launch pinned app' },
      { keys: ['T'], label: 'Toggle theme' },
      { keys: ['L'], label: 'Toggle Arabic / English' },
      { keys: ['F'], label: 'Start / stop focus' },
      { keys: ['N'], label: 'Notifications' },
    ],
  },
];

export function ShortcutsDialog() {
  const open = useUI((s) => s.shortcutsOpen);
  const setOpen = useUI((s) => s.setShortcutsOpen);
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Keyboard shortcuts" subtitle="Fly through NEXUS without touching the mouse." icon={<span className="modal-icon"><Keyboard /></span>} width={620}>
      <div className="shortcuts">
        {SHORTCUTS.map((g) => (
          <div key={g.group}>
            <div className="stat-label" style={{ marginBottom: 8 }}>
              {g.group}
            </div>
            {g.items.map((s) => (
              <div key={s.label} className="shortcut-row">
                <span>{s.label}</span>
                <span className="row" style={{ gap: 4 }}>
                  {s.keys.map((k, i) => (
                    <span key={i} className="kbd">
                      {k}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}

/** Demo-only: jump between personas to see permission control in action. */
export function PersonaSwitcher() {
  const open = useUI((s) => s.personaSwitcherOpen);
  const setOpen = useUI((s) => s.setPersonaSwitcherOpen);
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  const login = useHub((s) => s.login);
  const me = useSessionUser();
  const navigate = useNavigate();
  const personas = users.filter((u) => u.persona);

  const pick = (id: string) => {
    if (id === me?.id) return setOpen(false);
    const res = login(id);
    if (toast.result(res, `Now signed in as ${users.find((u) => u.id === id)?.name}`)) {
      setOpen(false);
      navigate('/');
    }
  };

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Switch persona" subtitle="Each persona holds different roles — watch tiles, menus and admin powers change." width={600}>
      <div className="persona-list">
        {personas.map((u) => {
          const role = primaryRole(u, roles);
          const current = u.id === me?.id;
          return (
            <button key={u.id} className={cx('persona-row', current && 'is-current')} onClick={() => pick(u.id)} disabled={!u.active}>
              <Avatar user={u} size={44} presence />
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="row persona-row__name" style={{ gap: 8 }}>
                  <strong className="truncate">{u.name}</strong>
                  {role && <RoleChip name={role.name} color={role.color} />}
                </span>
                <span className="text-sm muted truncate" style={{ display: 'block' }}>
                  {u.title}
                </span>
                <span className="text-xs faint" style={{ display: 'block' }}>
                  {u.personaBlurb}
                </span>
              </span>
              <ClearanceBadge level={clearanceOf(u, roles)} compact />
              {current && <Check size={18} className="accent-ink" />}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
