/**
 * Public App Bridge for Performance & OKRs (see src/lib/appBridge.ts).
 *
 * Powers the global ⌘K palette, Settings → Reset demo, and cross-app features:
 * Helix Projects links projects to key results (`listKeyResults`) and pins shipped
 * work to people's highlights (`addEvidence`). Every call re-checks permissions.
 */
import { CalendarClock, Compass, Gauge, Grid3x3, LineChart, MessageSquarePlus, MessagesSquare, Orbit, Send, Sprout, Target, Users } from 'lucide-react';
import type { BridgeKeyResult, BridgeViewer, PaletteEntry, PerformanceBridge } from '@/lib/appBridge';
import { useHub } from '@/store/hub';
import { fuzzyScore } from '@/lib/fuzzy';
import { canSeeTeam, canViewObjective, hasApp, isAdmin, isSeriesMember } from './access';
import { STATUS_META } from './constants';
import { krProgress, krStatus, objectiveProgress, objectiveStatus } from './okr';
import { usePerf } from './store';

const LEVEL_LABEL = { company: 'Company objective', team: 'Team objective', individual: 'Objective' } as const;

function visibleObjectives(viewer: BridgeViewer) {
  const st = usePerf.getState();
  const users = useHub.getState().users;
  const v = { id: viewer.user.id, perms: viewer.perms };
  return st.objectives.filter((o) => canViewObjective(v, users, o));
}

export const api: PerformanceBridge = {
  appId: 'performance',

  paletteEntries(viewer) {
    const v = { id: viewer.user.id, perms: viewer.perms };
    if (!hasApp(v)) return [];
    const st = usePerf.getState();
    const users = useHub.getState().users;
    const name = (id: string) => users.find((u) => u.id === id)?.name ?? '';
    const now = Date.now();
    const current = st.periods[0];
    const out: PaletteEntry[] = [];
    const action = (id: string, title: string, to: string, icon: PaletteEntry['icon'], keywords: string[], subtitle?: string) =>
      out.push({ id: `performance:${id}`, group: 'Actions', title, subtitle, to, icon, keywords: ['performance', 'okr', ...keywords], hint: 'Open' });

    action('checkin', 'Check in on my OKRs', '/performance/okrs?checkin=1', <Target />, ['check in', 'weekly', 'key results', 'confidence', 'progress']);
    const myReview = st.reviews.find((r) => r.employeeId === v.id && st.cycles.some((c) => c.id === r.cycleId && c.status === 'active'));
    action('self', 'Write my self-reflection', myReview ? `/performance/checkins/${myReview.id}` : '/performance/checkins', <CalendarClock />, ['review', 'self review', 'self-reflection', 'quarterly', 'check-in', 'appraisal']);
    action('give', 'Give feedback', '/performance/feedback?give=1', <Send />, ['feedback', 'praise', 'sbi', 'recognition', 'kudos']);
    action('request', 'Request feedback', '/performance/feedback?request=1', <MessageSquarePlus />, ['ask for feedback', '360', 'request']);
    action('new', 'Create an objective', '/performance/okrs?new=1', <Compass />, ['new okr', 'goal', 'objective', 'nova draft']);
    action('galaxy', 'Open the Goal Galaxy', '/performance/okrs?view=galaxy', <Orbit />, ['alignment', 'galaxy', 'company goals', 'tree']);
    action('growth', 'My growth plan', '/performance/growth', <Sprout />, ['career', 'ladder', 'promotion', 'competencies', 'development']);

    const mySeries = st.series.filter((s) => isSeriesMember(v, s)).sort((a, b) => a.nextAt - b.nextAt);
    const next = mySeries.find((s) => s.nextAt >= now - 30 * 60_000) ?? mySeries[0];
    if (next) {
      const other = next.leadId === v.id ? next.memberId : next.leadId;
      action('next-1on1', `Next 1:1 · ${name(other)}`, `/performance/one-on-ones/${next.id}`, <MessagesSquare />, ['1:1', 'one on one', 'agenda', 'meeting', name(other).toLowerCase()], new Date(next.nextAt).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' }));
    }
    if (canSeeTeam(v, users)) {
      action('team', 'Team overview', '/performance/team', <Users />, ['team', 'reports', 'manager', 'direct reports']);
      action('calibration', 'Calibration · 9-box', '/performance/calibration', <Grid3x3 />, ['9-box', 'calibrate', 'talent', 'potential']);
      action('insights', 'Performance insights', '/performance/insights', <LineChart />, ['analytics', 'insights', 'distribution']);
    }
    if (isAdmin(v)) action('cycles', 'Cycles & templates', '/performance/cycles', <Gauge />, ['cycle', 'launch', 'template', 'nudge', 'release reviews']);

    // Work: objectives (current period) + 1:1 series
    for (const o of visibleObjectives(viewer).filter((x) => x.periodId === current?.id)) {
      const krs = st.keyResults.filter((k) => k.objectiveId === o.id);
      const status = current ? objectiveStatus(krs, current, now) : 'on-track';
      out.push({
        id: `performance:obj:${o.id}`,
        group: 'Work',
        title: o.title,
        subtitle: `${LEVEL_LABEL[o.level]} · ${name(o.ownerId)} · ${Math.round(objectiveProgress(krs) * 100)}% · ${STATUS_META[status].label}`,
        icon: <Target />,
        glyphColor: STATUS_META[status].color,
        keywords: ['okr', 'objective', o.level, ...o.tags, name(o.ownerId).toLowerCase(), ...krs.map((k) => k.title.toLowerCase())],
        hint: 'Open',
        to: `/performance/okrs/${o.id}`,
      });
    }
    for (const s of mySeries) {
      const other = s.leadId === v.id ? s.memberId : s.leadId;
      out.push({
        id: `performance:1on1:${s.id}`,
        group: 'Work',
        title: `1:1 · ${name(other)}`,
        subtitle: `${s.kind === 'mentor' ? 'Mentoring' : 'Manager 1:1'} · next ${new Date(s.nextAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`,
        icon: <MessagesSquare />,
        keywords: ['1:1', 'one on one', 'agenda', name(other).toLowerCase()],
        hint: 'Open',
        to: `/performance/one-on-ones/${s.id}`,
      });
    }
    return out;
  },

  resetDemo() {
    usePerf.getState().resetDemo();
  },

  listKeyResults(viewer, opts = {}) {
    const v = { id: viewer.user.id, perms: viewer.perms };
    if (!hasApp(v)) return [];
    const st = usePerf.getState();
    const now = Date.now();
    const objs = new Map(visibleObjectives(viewer).map((o) => [o.id, o]));
    const rank = { company: 0, team: 1, individual: 2 } as const;
    const q = opts.query?.trim().toLowerCase() ?? '';
    const tokens = q.split(/\s+/).filter(Boolean);
    const rows = st.keyResults
      .filter((k) => objs.has(k.objectiveId) && (!opts.ownerId || k.ownerId === opts.ownerId))
      .map((k) => {
        const o = objs.get(k.objectiveId)!;
        const period = st.periods.find((p) => p.id === o.periodId) ?? st.periods[0];
        const hay = `${k.title} ${o.title} ${o.tags.join(' ')}`.toLowerCase();
        const matches = tokens.every((t) => hay.includes(t));
        const score = q && matches ? (fuzzyScore(q, k.title, [o.title])?.score ?? 1) : 0;
        const row: BridgeKeyResult = {
          id: k.id,
          title: k.title,
          objectiveId: o.id,
          objectiveTitle: o.title,
          ownerId: k.ownerId,
          progress: krProgress(k),
          status: krStatus(k, period, now),
          period: period.label,
          to: `/performance/okrs/${o.id}`,
        };
        return { row, score, current: period.id === st.periods[0]?.id ? 0 : 1, rank: rank[o.level] };
      })
      .filter((x) => !q || x.score > 0);
    rows.sort((a, b) => (q ? b.score - a.score : 0) || a.current - b.current || a.rank - b.rank || a.row.title.localeCompare(b.row.title));
    return rows.map((x) => x.row);
  },

  addEvidence(viewer, input) {
    const res = usePerf.getState().addEvidence(input, viewer);
    return res.ok ? { ok: true, id: res.id } : { ok: false, error: res.error };
  },
};
