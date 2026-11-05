import '@/styles/academy.css';
import { useEffect, useMemo } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router';
import {
  AlertTriangle,
  Award,
  Compass,
  GraduationCap,
  Play,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { initAcademy } from '@/academy/store';
import { useAcademyCaps, useMyLearning, useTeamCompliance } from '@/academy/selectors';
import { useSessionUser } from '@/store/selectors';
import { firstName, greeting } from '@/lib/format';
import { cx } from '@/lib/cx';
import { AcademyHome } from './AcademyHome';
import { CatalogView } from './CatalogView';
import { CoursePlayer } from './CoursePlayer';
import { CertificatesView } from './CertificatesView';
import { ComplianceStudio } from './ComplianceStudio';

interface AcademyTab {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  count?: number;
  alert?: boolean;
}

export function AcademyPage() {
  const me = useSessionUser();
  const navigate = useNavigate();
  const caps = useAcademyCaps();
  const { all, active, requiredOpen, certificates, totalXp, rank } = useMyLearning();
  const teamScope = caps.manage && !caps.manager ? 'company' : 'team';
  const complianceRows = useTeamCompliance(teamScope);

  useEffect(() => {
    initAcademy();
  }, []);

  const overdueSelfCount = useMemo(() => requiredOpen.filter((x) => x.overdue).length, [requiredOpen]);
  const teamOverdueCount = useMemo(
    () => complianceRows.reduce((sum, row) => sum + row.overdueCount, 0),
    [complianceRows],
  );

  // Pick best course for "Resume next course" CTA
  const resumeTarget = useMemo(() => {
    if (active.length > 0) return active[0].course;
    const uncertified = all.find((x) => x.enrollment?.status !== 'completed');
    return uncertified?.course ?? all[0]?.course;
  }, [active, all]);

  const showManageTab = caps.manage || caps.manager;

  const tabs = useMemo<AcademyTab[]>(() => {
    const items: AcademyTab[] = [
      {
        to: '/academy',
        label: 'My Learning',
        icon: GraduationCap,
        end: true,
        count: requiredOpen.length,
        alert: overdueSelfCount > 0,
      },
      {
        to: '/academy/catalog',
        label: 'Catalog & Paths',
        icon: Compass,
      },
      {
        to: '/academy/certificates',
        label: 'Certificates',
        icon: Award,
        count: certificates.length,
      },
    ];
    if (showManageTab) {
      items.push({
        to: '/academy/manage',
        label: 'Team & Compliance',
        icon: Users,
        count: teamOverdueCount > 0 ? teamOverdueCount : undefined,
        alert: teamOverdueCount > 0,
      });
    }
    return items;
  }, [requiredOpen.length, overdueSelfCount, certificates.length, showManageTab, teamOverdueCount]);

  return (
    <div className="page ac-page">
      {/* Module Hero */}
      <header className="ac-hero hud">
        <div className="ac-hero__glow" aria-hidden="true" />
        <div className="ac-hero__main">
          <div className="eyebrow ac-hero__eyebrow">Helix Academy · Mastery & Onboarding</div>
          <h1 className="page-title">
            {greeting()}
            {me ? `, ${firstName(me.name)}` : ''}.{' '}
            <span className="ac-hero__accent">Practice, certify, and level up</span>
          </h1>
          <p className="page-sub">
            Interactive concept studios, branching workplace scenario labs, verifiable credentials, and live Day-1 to Day-30 HR Onboarding sync.
          </p>

          <div className="ac-hero__pills">
            {/* Live XP & Rank Pill */}
            <div className="ac-rank-pill" title={`${totalXp} XP earned (${rank.progressPct}% to next rank)`}>
              <span className="ac-rank-pill__lvl">
                <Sparkles /> Lv.{rank.level} · {rank.title}
              </span>
              <span className="ac-rank-pill__bar" aria-hidden="true">
                <i style={{ width: `${rank.progressPct}%` }} />
              </span>
              <span className="ac-rank-pill__xp">
                {totalXp}/{rank.nextXp} XP
              </span>
            </div>

            {/* Compliance Status Chip */}
            {requiredOpen.length === 0 ? (
              <span className="ac-stat-chip ac-stat-chip--ok">
                <ShieldCheck /> All required trainings current
              </span>
            ) : overdueSelfCount > 0 ? (
              <button
                type="button"
                className="ac-stat-chip ac-stat-chip--danger"
                onClick={() => navigate('/academy')}
              >
                <AlertTriangle /> <b>{overdueSelfCount}</b> overdue · {requiredOpen.length} required due
              </button>
            ) : (
              <button
                type="button"
                className="ac-stat-chip ac-stat-chip--warn"
                onClick={() => navigate('/academy')}
              >
                <ShieldCheck /> <b>{requiredOpen.length}</b> required due
              </button>
            )}

            {/* Certificates Earned Chip */}
            <button
              type="button"
              className="ac-stat-chip"
              onClick={() => navigate('/academy/certificates')}
            >
              <Award style={{ color: '#818cf8' }} />
              <b>{certificates.length}</b> certificate{certificates.length === 1 ? '' : 's'} earned
            </button>
          </div>
        </div>

        {/* Quick CTAs */}
        <div className="ac-hero__cta">
          {resumeTarget && (
            <button
              type="button"
              className="btn ac-btn-indigo"
              onClick={() => navigate(`/academy/course/${resumeTarget.id}`)}
            >
              <Play /> {active.length > 0 ? 'Resume next course' : 'Start a course'}
            </button>
          )}
          <button type="button" className="btn" onClick={() => navigate('/academy/catalog')}>
            <Compass /> Browse catalog
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="tabs ac-tabs" aria-label="Helix Academy sections">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) => cx('tab', isActive && 'is-active')}
            >
              <Icon aria-hidden="true" />
              {t.label}
              {!!t.count && (
                <span className={cx('ac-tab-count', t.alert && 'ac-tab-count--alert')}>{t.count}</span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Nested Academy Routes */}
      <Routes>
        <Route index element={<AcademyHome />} />
        <Route path="catalog" element={<CatalogView />} />
        <Route path="course/:courseId" element={<CoursePlayer />} />
        <Route path="certificates" element={<CertificatesView />} />
        <Route path="manage" element={<ComplianceStudio />} />
        <Route path="*" element={<Navigate to="/academy" replace />} />
      </Routes>
    </div>
  );
}
