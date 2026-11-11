import { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { useApplyTheme } from '@/hooks/useApplyTheme';
import { ADMIN_PERMISSIONS } from '@/data/permissions';
import { RequireAuth, RequirePermission } from '@/components/auth/Can';
import { AppShell } from '@/components/shell/AppShell';
import { Toaster } from '@/components/ui/Toaster';
import { LoginPage } from '@/pages/LoginPage';
import { HomePage } from '@/pages/HomePage';
import { AppsPage } from '@/pages/AppsPage';
import { NotFound } from '@/pages/NotFound';

// Secondary areas are code-split so the launchpad loads fast.
const PeoplePage = lazy(() => import('@/pages/PeoplePage').then((m) => ({ default: m.PeoplePage })));
const NewsPage = lazy(() => import('@/pages/NewsPage').then((m) => ({ default: m.NewsPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const AdminPage = lazy(() => import('@/pages/admin/AdminPage').then((m) => ({ default: m.AdminPage })));
const TalentPage = lazy(() => import('@/pages/talent/TalentPage').then((m) => ({ default: m.TalentPage })));
const HRPage = lazy(() => import('@/pages/hr/HRPage').then((m) => ({ default: m.HRPage })));
const WikiPage = lazy(() => import('@/pages/wiki/WikiPage').then((m) => ({ default: m.WikiPage })));
const AcademyPage = lazy(() => import('@/pages/academy/AcademyPage').then((m) => ({ default: m.AcademyPage })));
const ExpensesPage = lazy(() => import('@/pages/expenses/ExpensesPage').then((m) => ({ default: m.ExpensesPage })));
const PayrollPage = lazy(() => import('@/pages/payroll/PayrollPage').then((m) => ({ default: m.PayrollPage })));
const ProjectsPage = lazy(() => import('@/pages/projects/ProjectsPage').then((m) => ({ default: m.ProjectsPage })));
const DrivePage = lazy(() => import('@/pages/drive/DrivePage').then((m) => ({ default: m.DrivePage })));
const ChatPage = lazy(() => import('@/pages/chat/ChatPage').then((m) => ({ default: m.ChatPage })));
const HelpdeskPage = lazy(() => import('@/pages/helpdesk/HelpdeskPage').then((m) => ({ default: m.HelpdeskPage })));
const PerformancePage = lazy(() => import('@/pages/performance/PerformancePage').then((m) => ({ default: m.PerformancePage })));
const ProcurementPage = lazy(() => import('@/pages/procurement/ProcurementPage').then((m) => ({ default: m.ProcurementPage })));
const CrmPage = lazy(() => import('@/pages/crm/CrmPage').then((m) => ({ default: m.CrmPage })));
const InsightsPage = lazy(() => import('@/pages/insights/InsightsPage').then((m) => ({ default: m.InsightsPage })));
const MeetPage = lazy(() => import('@/pages/meet/MeetPage').then((m) => ({ default: m.MeetPage })));
const CalendarPage = lazy(() => import('@/pages/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const MailPage = lazy(() => import('@/pages/mail/MailPage').then((m) => ({ default: m.MailPage })));
const WellbeingPage = lazy(() => import('@/pages/wellbeing/WellbeingPage').then((m) => ({ default: m.WellbeingPage })));
const DevHubPage = lazy(() => import('@/pages/devhub/DevHubPage').then((m) => ({ default: m.DevHubPage })));
const CloudPage = lazy(() => import('@/pages/cloud/CloudPage').then((m) => ({ default: m.CloudPage })));
const IncidentsPage = lazy(() => import('@/pages/incidents/IncidentsPage').then((m) => ({ default: m.IncidentsPage })));
const VaultPage = lazy(() => import('@/pages/vault/VaultPage').then((m) => ({ default: m.VaultPage })));
const SecurityPage = lazy(() => import('@/pages/security/SecurityPage').then((m) => ({ default: m.SecurityPage })));
const SpacesPage = lazy(() => import('@/pages/spaces/SpacesPage').then((m) => ({ default: m.SpacesPage })));

function TravelRedirect() {
  const loc = useLocation();
  return <Navigate to={`/expenses/travel${loc.search}`} replace />;
}

export default function App() {
  useApplyTheme();
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="apps" element={<AppsPage />} />
          <Route
            path="people"
            element={
              <RequirePermission perm="hub.people.view" area="People directory">
                <PeoplePage />
              </RequirePermission>
            }
          />
          <Route path="news" element={<NewsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route
            path="admin/*"
            element={
              <RequirePermission perm={ADMIN_PERMISSIONS} area="Control Center">
                <AdminPage />
              </RequirePermission>
            }
          />
          <Route
            path="talent/*"
            element={
              <RequirePermission perm="app:recruit" area="Talent Hub">
                <TalentPage />
              </RequirePermission>
            }
          />
          <Route
            path="hr/*"
            element={
              <RequirePermission perm="app:hr" area="HR Portal">
                <HRPage />
              </RequirePermission>
            }
          />
          <Route
            path="wiki/*"
            element={
              <RequirePermission perm="app:wiki" area="Knowledge Base">
                <WikiPage />
              </RequirePermission>
            }
          />
          <Route
            path="academy/*"
            element={
              <RequirePermission perm="app:learning" area="Academy">
                <AcademyPage />
              </RequirePermission>
            }
          />
          <Route
            path="expenses/*"
            element={
              <RequirePermission perm={['app:expenses', 'app:travel']} area="Travel & Expenses">
                <ExpensesPage />
              </RequirePermission>
            }
          />
          <Route
            path="travel/*"
            element={
              <RequirePermission perm={['app:travel', 'app:expenses']} area="Travel Desk">
                <TravelRedirect />
              </RequirePermission>
            }
          />
          <Route
            path="payroll/*"
            element={
              <RequirePermission perm="app:payroll" area="Payroll Console">
                <PayrollPage />
              </RequirePermission>
            }
          />
          <Route
            path="projects/*"
            element={
              <RequirePermission perm="app:projects" area="Projects">
                <ProjectsPage />
              </RequirePermission>
            }
          />
          <Route
            path="drive/*"
            element={
              <RequirePermission perm="app:drive" area="Drive">
                <DrivePage />
              </RequirePermission>
            }
          />
          <Route
            path="chat/*"
            element={
              <RequirePermission perm="app:chat" area="Pulse Chat">
                <ChatPage />
              </RequirePermission>
            }
          />
          <Route
            path="helpdesk/*"
            element={
              <RequirePermission perm="app:helpdesk" area="IT Helpdesk">
                <HelpdeskPage />
              </RequirePermission>
            }
          />
          <Route
            path="performance/*"
            element={
              <RequirePermission perm="app:performance" area="Performance & OKRs">
                <PerformancePage />
              </RequirePermission>
            }
          />
          <Route
            path="procurement/*"
            element={
              <RequirePermission perm="app:procurement" area="Procurement">
                <ProcurementPage />
              </RequirePermission>
            }
          />
          <Route
            path="crm/*"
            element={
              <RequirePermission perm="app:crm" area="CRM">
                <CrmPage />
              </RequirePermission>
            }
          />
          <Route
            path="insights/*"
            element={
              <RequirePermission perm="app:analytics" area="Insights">
                <InsightsPage />
              </RequirePermission>
            }
          />
          <Route
            path="meet/*"
            element={
              <RequirePermission perm="app:meet" area="Helix Meet">
                <MeetPage />
              </RequirePermission>
            }
          />
          <Route
            path="calendar/*"
            element={
              <RequirePermission perm="app:calendar" area="Helix Calendar">
                <CalendarPage />
              </RequirePermission>
            }
          />
          <Route
            path="mail/*"
            element={
              <RequirePermission perm="app:mail" area="Helix Mail">
                <MailPage />
              </RequirePermission>
            }
          />
          <Route
            path="wellbeing/*"
            element={
              <RequirePermission perm="app:wellness" area="Helix Wellbeing">
                <WellbeingPage />
              </RequirePermission>
            }
          />
          <Route
            path="devhub/*"
            element={
              <RequirePermission perm="app:devhub" area="DevHub">
                <DevHubPage />
              </RequirePermission>
            }
          />
          <Route
            path="cloud/*"
            element={
              <RequirePermission perm="app:cloud" area="Cloud Console">
                <CloudPage />
              </RequirePermission>
            }
          />
          <Route
            path="incidents/*"
            element={
              <RequirePermission perm="app:incidents" area="Incident Command">
                <IncidentsPage />
              </RequirePermission>
            }
          />
          <Route
            path="vault/*"
            element={
              <RequirePermission perm="app:vault" area="Vault">
                <VaultPage />
              </RequirePermission>
            }
          />
          <Route
            path="security/*"
            element={
              <RequirePermission perm="app:security" area="Security Center">
                <SecurityPage />
              </RequirePermission>
            }
          />
          <Route
            path="spaces/*"
            element={
              <RequirePermission perm="app:spaces" area="Spaces">
                <SpacesPage />
              </RequirePermission>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
