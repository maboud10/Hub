import { create } from 'zustand';
import { SEED_APPS } from '@/data/apps';

export interface NavEntry {
  path: string;
  areaKey: string;
  label: string;
  sublabel?: string;
  icon: string;
  gradient: [string, string];
  isApp: boolean;
  appId?: string;
  at: number;
}

interface NavTrailState {
  /** Current location entry */
  current: NavEntry | null;
  /** The page the user was on immediately before entering the current app/module */
  appOrigin: NavEntry | null;
  /** Recent navigation trail (most recent first, deduplicated by path) */
  trail: NavEntry[];
  /** Record a route change; automatically updates appOrigin when crossing into an app */
  recordLocation: (pathname: string, search?: string) => void;
  /** Explicitly capture the current page as the origin right before launching an app */
  captureOriginForLaunch: (currentPathname: string, currentSearch?: string, targetAppId?: string) => void;
  /** Clear or pop origin */
  clearOrigin: () => void;
}

const APP_AREA_META: Record<
  string,
  { appId: string; label: string; icon: string; gradient: [string, string] }
> = {
  chat: { appId: 'chat', label: 'Pulse Chat', icon: 'MessagesSquare', gradient: ['#22d3ee', '#d946ef'] },
  projects: { appId: 'projects', label: 'Projects', icon: 'SquareKanban', gradient: ['#a78bfa', '#7c3aed'] },
  drive: { appId: 'drive', label: 'Drive', icon: 'FolderOpen', gradient: ['#fbbf24', '#f97316'] },
  wiki: { appId: 'wiki', label: 'Knowledge Base', icon: 'BookOpen', gradient: ['#2dd4bf', '#0d9488'] },
  academy: { appId: 'learning', label: 'Academy', icon: 'GraduationCap', gradient: ['#818cf8', '#4f46e5'] },
  hr: { appId: 'hr', label: 'HR Portal', icon: 'Contact', gradient: ['#c084fc', '#9333ea'] },
  talent: { appId: 'recruit', label: 'Talent Hub', icon: 'UserPlus', gradient: ['#f59e0b', '#d97706'] },
  expenses: { appId: 'expenses', label: 'Expenses & Travel', icon: 'Receipt', gradient: ['#2dd4bf', '#0891b2'] },
  travel: { appId: 'travel', label: 'Travel Desk', icon: 'Plane', gradient: ['#7dd3fc', '#0284c7'] },
  payroll: { appId: 'payroll', label: 'Payroll Console', icon: 'Wallet', gradient: ['#4ade80', '#16a34a'] },
  helpdesk: { appId: 'helpdesk', label: 'IT Helpdesk', icon: 'LifeBuoy', gradient: ['#34d399', '#0ea5e9'] },
  performance: { appId: 'performance', label: 'Performance & OKRs', icon: 'Target', gradient: ['#f472b6', '#a855f7'] },
  procurement: { appId: 'procurement', label: 'Procurement', icon: 'ShoppingCart', gradient: ['#fbbf24', '#10b981'] },
  crm: { appId: 'crm', label: 'CRM', icon: 'Handshake', gradient: ['#fb923c', '#ec4899'] },
  insights: { appId: 'analytics', label: 'Insights', icon: 'ChartPie', gradient: ['#38bdf8', '#6366f1'] },
  meet: { appId: 'meet', label: 'Meet', icon: 'Video', gradient: ['#34d399', '#06b6d4'] },
  calendar: { appId: 'calendar', label: 'Calendar', icon: 'CalendarDays', gradient: ['#f472b6', '#8b5cf6'] },
  // The Control Center is a hub area, but it runs as an immersive NEO workspace like the apps.
  admin: { appId: 'admin', label: 'Control Center', icon: 'ShieldCheck', gradient: ['#38bdf8', '#818cf8'] },
};

const CORE_AREA_META: Record<
  string,
  { label: string; sublabel: string; icon: string; gradient: [string, string] }
> = {
  home: { label: 'Launchpad', sublabel: 'Home workspace', icon: 'Sparkles', gradient: ['#6366f1', '#22d3ee'] },
  apps: { label: 'Apps Catalog', sublabel: 'All applications', icon: 'Compass', gradient: ['#38bdf8', '#818cf8'] },
  people: { label: 'People Directory', sublabel: 'Org & profiles', icon: 'Users', gradient: ['#f472b6', '#a855f7'] },
  news: { label: 'Newsroom', sublabel: 'Company updates', icon: 'Globe', gradient: ['#fb923c', '#f43f5e'] },
  settings: { label: 'Settings', sublabel: 'Preferences', icon: 'KeyRound', gradient: ['#94a3b8', '#64748b'] },
};

function humanizeSubpath(seg: string | undefined): string | undefined {
  if (!seg) return undefined;
  const clean = seg
    .replace(/^(prj-|drv-|fo-|df-|ch-|dm-|col-|crs-|path-|obj-|kr-|rv-|cyc-|oo-|tk-|hx-)/i, '')
    .replace(/[-_]/g, ' ')
    .trim();
  if (!clean) return undefined;
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export function describeLocation(pathname: string, search = ''): NavEntry {
  const cleanSearch = search
    .replace(/([?&])persona=[^&]+(&|$)/, '$1')
    .replace(/[?&]$/, '');
  const fullPath = `${pathname}${cleanSearch}`;
  const parts = pathname.split('/').filter(Boolean);
  const first = parts[0] ?? 'home';

  if (first in APP_AREA_META) {
    const meta = APP_AREA_META[first];
    const sub = humanizeSubpath(parts[2] ?? parts[1]);
    return {
      path: fullPath,
      areaKey: first,
      label: meta.label,
      sublabel: sub ?? 'App workspace',
      icon: meta.icon,
      gradient: meta.gradient,
      isApp: true,
      appId: meta.appId,
      at: Date.now(),
    };
  }

  const core = CORE_AREA_META[first] ?? CORE_AREA_META.home;
  const sub = humanizeSubpath(parts[1]);
  return {
    path: fullPath,
    areaKey: first in CORE_AREA_META ? first : 'home',
    label: core.label,
    sublabel: sub ?? core.sublabel,
    icon: core.icon,
    gradient: core.gradient,
    isApp: false,
    at: Date.now(),
  };
}

export const useNavTrail = create<NavTrailState>()((set, get) => ({
  current: null,
  appOrigin: null,
  trail: [],

  recordLocation: (pathname, search = '') => {
    if (pathname === '/login') return;
    const next = describeLocation(pathname, search);
    const prev = get().current;

    // Ignore identical path updates
    if (prev && prev.path === next.path) return;

    let nextOrigin = get().appOrigin;

    if (next.isApp) {
      // Entering an app from either a Hub page OR a different app captures that previous page as the origin
      if (prev && prev.areaKey !== next.areaKey) {
        nextOrigin = prev;
      } else if (!nextOrigin) {
        // Direct deep-link into an app: default origin to Launchpad so user always has a creative way back
        nextOrigin = describeLocation('/', '');
      }
    } else {
      // Back on a core Hub page (Home, Apps, People, News, Settings):
      // Keep the last app in trail so they can also hop forward, and clear appOrigin
      nextOrigin = null;
    }

    const existingTrail = get().trail.filter((t) => t.path !== next.path);
    const nextTrail = [next, ...existingTrail].slice(0, 10);

    set({
      current: next,
      appOrigin: nextOrigin,
      trail: nextTrail,
    });
  },

  captureOriginForLaunch: (currentPathname, currentSearch = '', targetAppId) => {
    if (currentPathname === '/login') return;
    const origin = describeLocation(currentPathname, currentSearch);
    const app = targetAppId ? SEED_APPS.find((a) => a.id === targetAppId) : undefined;
    // If we're already inside the same app, keep the earlier origin so we don't overwrite it with self
    const currentOrigin = get().appOrigin;
    if (origin.isApp && app && origin.appId === app.id && currentOrigin) {
      return;
    }
    set({ appOrigin: origin });
  },

  clearOrigin: () => set({ appOrigin: null }),
}));
