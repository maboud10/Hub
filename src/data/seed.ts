import type { HubData, UserPrefs } from '@/types';
import { SEED_APPS } from './apps';
import { SEED_ROLES } from './roles';
import { SEED_USERS } from './users';
import { SEED_ANNOUNCEMENTS, SEED_AUDIT, SEED_KUDOS, SEED_NOTIFICATIONS, SEED_REQUESTS } from './content';

/** v6: Projects (/projects) + Drive (/drive) modules, `projects.manage` / `drive.manage` and the `work` notification kind. */
export const DATA_VERSION = 6;

export function defaultPrefs(pinned: string[] = ['mail', 'chat', 'calendar', 'projects']): UserPrefs {
  return {
    pinned,
    recents: [],
    launchCounts: {},
    theme: 'dark',
    accent: 'cyan',
    density: 'comfortable',
    reducedMotion: false,
    ambient: true,
    tileView: 'grid',
    sidebarCollapsed: false,
    widgets: {
      agenda: true,
      focus: true,
      news: true,
      pulse: true,
      kudos: true,
      status: true,
      celebrations: true,
    },
    notifyKinds: { access: true, request: true, announcement: true, kudos: true, talent: true, hr: true, learning: true, work: true, system: true },
  };
}

/** Persona-specific starting layouts so each role "feels" different out of the box. */
const PERSONA_PINS: Record<string, string[]> = {
  'u-layla': ['security', 'vault', 'helpdesk', 'mail', 'chat', 'incidents'],
  'u-sara': ['hr', 'recruit', 'performance', 'mail', 'calendar', 'wiki'],
  'u-omar': ['devhub', 'projects', 'chat', 'meet', 'analytics', 'incidents'],
  'u-daniel': ['finance', 'payroll', 'expenses', 'procurement', 'mail', 'analytics'],
  'u-mei': ['projects', 'drive', 'chat', 'analytics', 'learning', 'calendar'],
  'u-alex': ['projects', 'chat', 'wiki', 'helpdesk'],
};

const PERSONA_ACCENT: Record<string, UserPrefs['accent']> = {
  'u-layla': 'magenta',
  'u-sara': 'violet',
  'u-omar': 'cyan',
  'u-daniel': 'lime',
  'u-mei': 'amber',
  'u-alex': 'cyan',
};

export function createSeed(): HubData {
  const prefs: Record<string, UserPrefs> = {};
  for (const u of SEED_USERS) {
    const p = defaultPrefs(PERSONA_PINS[u.id]);
    p.accent = PERSONA_ACCENT[u.id] ?? 'cyan';
    // A little usage history so "Recent" and "Most used" are meaningful on first run.
    p.recents = (PERSONA_PINS[u.id] ?? []).slice(0, 3).map((appId, i) => ({ appId, at: Date.now() - (i + 1) * 3_600_000 }));
    p.launchCounts = Object.fromEntries((PERSONA_PINS[u.id] ?? []).map((id, i) => [id, 12 - i * 2]));
    prefs[u.id] = p;
  }

  return {
    version: DATA_VERSION,
    sessionUserId: null,
    users: structuredClone(SEED_USERS),
    roles: structuredClone(SEED_ROLES),
    apps: structuredClone(SEED_APPS),
    requests: structuredClone(SEED_REQUESTS),
    audit: structuredClone(SEED_AUDIT),
    announcements: structuredClone(SEED_ANNOUNCEMENTS),
    notifications: structuredClone(SEED_NOTIFICATIONS),
    kudos: structuredClone(SEED_KUDOS),
    prefs,
    pulse: {},
  };
}
