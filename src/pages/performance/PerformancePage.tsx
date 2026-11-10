/**
 * Performance & OKRs — "Growth HQ".
 * Align (OKRs) · Reflect (quarterly check-ins, feedback, 1:1s) · Grow (ladders, plans).
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { CalendarCheck2, Gauge, Grid3x3, House, LineChart, Lock, MessageSquareHeart, MessagesSquare, Orbit, Sprout, Target, Users } from 'lucide-react';
import '@/styles/neo.css';
import '@/styles/performance.css';
import { NeoEmpty, NeoHead, NeoRail, NeoStage, NeoWorkspace, type NeoNavItem } from '@/components/neo';
import { useHotkeys } from '@/hooks/useHotkeys';
import { PERF_TINT } from '@/performance/constants';
import { todosFor } from '@/performance/selectors';
import { usePerf } from '@/performance/store';
import { useMinute, usePerfCtx, useSearchFlag } from './hooks';
import { UndoHost } from './ui';
import { HomeView } from './HomeView';
import { OkrsView } from './OkrsView';
import { ObjectiveView } from './ObjectiveView';
import { CheckinModal } from './CheckinModal';
import { CheckinsView } from './CheckinsView';
import { ReviewView } from './ReviewView';
import { FeedbackView } from './FeedbackView';
import { OneOnOnesView } from './OneOnOnesView';
import { GrowthView } from './GrowthView';
import { TeamView } from './TeamView';
import { CalibrationView } from './CalibrationView';
import { CyclesView } from './CyclesView';
import { InsightsView } from './InsightsView';

interface ShellState {
  peek: boolean;
  setPeek: (v: boolean | ((p: boolean) => boolean)) => void;
}
const ShellContext = createContext<ShellState>({ peek: false, setPeek: () => undefined });
/** Side-panel peek state (narrow screens) for views that render a <NeoSide>. */
export const useShell = () => useContext(ShellContext);

const SIDE_ROUTES = /^\/performance\/one-on-ones(\/|$)/;

function Gate({ allow, title, children, icon }: { allow: boolean; title: string; children: ReactNode; icon?: ReactNode }) {
  if (allow) return <>{children}</>;
  return (
    <NeoStage>
      <NeoHead icon={icon ?? <Lock />} eyebrow="Performance & OKRs" title={title} sub="Not available for your role" />
      <div className="neo-body neo-pad">
        <NeoEmpty icon={<Lock />} title={`${title} isn’t available to you`} action={<Link className="neo-btn neo-btn--soft" to="/performance">Back to Home</Link>}>
          {title === 'People Ops'
            ? 'Cycles, templates and org-wide insights are run by People Ops (performance.manage).'
            : 'This space is for people managers and People Ops. If you start managing a team, it appears automatically.'}
        </NeoEmpty>
      </div>
    </NeoStage>
  );
}

export function PerformancePage() {
  const ctx = usePerfCtx();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const now = useMinute();
  const [peek, setPeek] = useState(false);
  const [checkin, clearCheckin, openCheckin] = useSearchFlag('checkin');
  const data = usePerf();

  const todos = useMemo(() => (ctx ? todosFor(data, ctx.me, ctx.v, ctx.users, now) : []), [data, ctx, now]);
  const checkinBadge = todos.filter((t) => ['self', 'ack', 'peer', 'upward', 'nominations', 'manager'].includes(t.kind)).length;
  const feedbackBadge = todos.filter((t) => t.kind === 'request').length;

  useHotkeys({ i: () => openCheckin('1') });

  if (!ctx) return null;
  const side = SIDE_ROUTES.test(pathname);

  const items: NeoNavItem[] = [
    { to: '/performance', label: 'Home', icon: <House />, end: true },
    { to: '/performance/okrs', label: 'OKRs', icon: <Target /> },
    { to: '/performance/checkins', label: 'Check-ins', icon: <CalendarCheck2 />, badge: checkinBadge || null },
    { to: '/performance/feedback', label: 'Feedback', icon: <MessageSquareHeart />, badge: feedbackBadge || null },
    { to: '/performance/one-on-ones', label: '1:1s', icon: <MessagesSquare /> },
    { to: '/performance/growth', label: 'Growth', icon: <Sprout /> },
  ];
  if (ctx.canTeam) items.push({ to: '/performance/team', label: 'Team', icon: <Users /> });
  if (ctx.canCalibrate) items.push({ to: '/performance/calibration', label: 'Calibrate', icon: <Grid3x3 /> });
  if (ctx.isAdmin) items.push({ to: '/performance/cycles', label: 'People Ops', icon: <Gauge />, match: (p) => /^\/performance\/(cycles|insights)/.test(p), title: 'Cycles, templates & insights' });
  else if (ctx.canInsights) items.push({ to: '/performance/insights', label: 'Insights', icon: <LineChart /> });

  return (
    <ShellContext.Provider value={{ peek, setPeek }}>
      <NeoWorkspace app="performance" tint={PERF_TINT} side={side} sidePeek={peek} onSidePeekChange={setPeek}>
        <NeoRail brand={{ icon: <Orbit />, label: 'Performance & OKRs', to: '/performance' }} items={items} label="Performance & OKRs" />
        <Routes>
          <Route index element={<HomeView />} />
          <Route path="okrs" element={<OkrsView />} />
          <Route path="okrs/:objectiveId" element={<ObjectiveView />} />
          <Route path="checkins" element={<CheckinsView />} />
          <Route path="checkins/:reviewId" element={<ReviewView />} />
          <Route path="feedback" element={<FeedbackView />} />
          <Route path="one-on-ones" element={<OneOnOnesView />} />
          <Route path="one-on-ones/:seriesId" element={<OneOnOnesView />} />
          <Route path="growth" element={<GrowthView />} />
          <Route
            path="team"
            element={
              <Gate allow={ctx.canTeam} title="Team" icon={<Users />}>
                <TeamView />
              </Gate>
            }
          />
          <Route
            path="calibration"
            element={
              <Gate allow={ctx.canCalibrate} title="Calibration" icon={<Grid3x3 />}>
                <CalibrationView />
              </Gate>
            }
          />
          <Route
            path="cycles"
            element={
              <Gate allow={ctx.isAdmin} title="People Ops" icon={<Gauge />}>
                <CyclesView />
              </Gate>
            }
          />
          <Route
            path="insights"
            element={
              <Gate allow={ctx.canInsights} title="Insights" icon={<LineChart />}>
                <InsightsView />
              </Gate>
            }
          />
          <Route path="*" element={<Navigate to="/performance" replace />} />
        </Routes>
        <CheckinModal open={!!checkin} onClose={clearCheckin} onOpenObjective={(id) => navigate(`/performance/okrs/${id}`)} />
        <UndoHost />
      </NeoWorkspace>
    </ShellContext.Provider>
  );
}
