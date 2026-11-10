import '@/styles/academy.css';
import { useEffect, useMemo, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import {
  Award,
  BookOpen,
  Compass,
  GraduationCap,
  Play,
  Users,
} from 'lucide-react';
import { NeoAppFrame, isNavActive, type NeoNavItem } from '@/components/neo';
import { TRACK_META } from '@/academy/constants';
import { initAcademy, useAcademy } from '@/academy/store';
import { useAcademyCaps, useMyLearning, useTeamCompliance } from '@/academy/selectors';
import { useSessionUser } from '@/store/selectors';
import { firstName, greeting } from '@/lib/format';
import { AcademyHome } from './AcademyHome';
import { CatalogToolbar, CatalogView } from './CatalogView';
import { CoursePlayer } from './CoursePlayer';
import { CertificatesView } from './CertificatesView';
import { ComplianceStudio } from './ComplianceStudio';
import { CertificateModal, XpMeter, useCertParam } from './shared';

const TINT = { c1: '#818cf8', c2: '#4f46e5' };

interface Section {
  to: string;
  end?: boolean;
  match?: (pathname: string) => boolean;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  sub: string;
}

const SECTIONS: Section[] = [
  {
    to: '/academy',
    end: true,
    icon: <GraduationCap />,
    eyebrow: 'Learning deck',
    title: 'My learning',
    sub: 'Interactive concept studios, scenario labs, and verifiable credentials synced with HR.',
  },
  {
    to: '/academy/catalog',
    icon: <Compass />,
    eyebrow: 'Academy · Catalog & paths',
    title: 'Catalog & learning paths',
    sub: 'Role-curated multi-course sequences, scenario labs, and certifications across every track.',
  },
  {
    to: '/academy/course',
    match: (p) => p.startsWith('/academy/course/'),
    icon: <BookOpen />,
    eyebrow: 'Academy · Course studio',
    title: 'Interactive course studio',
    sub: 'Micro-lessons, branching workplace scenario simulator, and graded certification assessment.',
  },
  {
    to: '/academy/certificates',
    icon: <Award />,
    eyebrow: 'Academy · Credentials vault',
    title: 'Certificates & credentials',
    sub: 'Verifiable FNV-1a signed digital credentials and endorsed NEXUS profile skills.',
  },
  {
    to: '/academy/manage',
    icon: <Users />,
    eyebrow: 'Academy · People Ops & managers',
    title: 'Team & compliance studio',
    sub: 'Track required training completion, nudge overdue learners, assign courses, and manage rules.',
  },
];

export function AcademyPage() {
  const me = useSessionUser();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const caps = useAcademyCaps();
  const { all, active, certificates, totalXp, rank } = useMyLearning();
  const allCertificates = useAcademy((s) => s.certificates);
  const courses = useAcademy((s) => s.courses);
  const teamScope = caps.manage && !caps.manager ? 'company' : 'team';
  const complianceRows = useTeamCompliance(teamScope);
  const { certId, close: closeCert } = useCertParam();

  useEffect(() => {
    initAcademy();
  }, []);

  const teamOverdueCount = useMemo(
    () => complianceRows.reduce((sum, row) => sum + row.overdueCount, 0),
    [complianceRows],
  );

  // Pick best course for "Resume next course" / "Start a course" CTA
  const resumeTarget = useMemo(() => {
    if (active.length > 0) return active[0].course;
    const uncertified = all.find((x) => x.enrollment?.status !== 'completed');
    return uncertified?.course ?? all[0]?.course;
  }, [active, all]);

  const showManageTab = caps.manage || caps.manager;

  const items: NeoNavItem[] = [
    {
      to: '/academy',
      label: 'Learning',
      icon: <GraduationCap />,
      end: true,
      title: 'My learning & progress',
    },
    {
      to: '/academy/catalog',
      label: 'Catalog',
      icon: <Compass />,
      title: 'Catalog & learning paths',
    },
    {
      to: '/academy/certificates',
      label: 'Certs',
      icon: <Award />,
      badge: certificates.length || null,
      title: 'Verified digital certificates',
    },
  ];

  const footer: NeoNavItem[] = showManageTab
    ? [
        {
          to: '/academy/manage',
          label: 'Team',
          icon: <Users />,
          badge: teamOverdueCount || null,
          badgeTone: 'danger',
          title: 'Team & L&D compliance studio',
        },
      ]
    : [];

  const section = SECTIONS.find((s) => isNavActive(s, pathname)) ?? SECTIONS[0];
  const isHome = section.to === '/academy';
  const isCatalog = section.to === '/academy/catalog';
  const isCourse = section.to === '/academy/course';

  const activeCourse = useMemo(() => {
    if (!isCourse) return undefined;
    const rawId = decodeURIComponent(pathname.replace(/^\/academy\/course\//, '').split('/')[0] ?? '');
    return courses.find((c) => c.id === rawId || c.slug === rawId);
  }, [isCourse, pathname, courses]);

  const modalCert = useMemo(
    () => (certId ? allCertificates.find((c) => c.id === certId || c.credentialCode === certId) ?? null : null),
    [certId, allCertificates],
  );
  const modalCourse = useMemo(
    () => (modalCert ? courses.find((c) => c.id === modalCert.courseId) : undefined),
    [modalCert, courses],
  );

  return (
    <NeoAppFrame
      app="academy"
      tint={TINT}
      className="ac-page"
      brand={{ icon: <GraduationCap />, label: 'Academy', to: '/academy' }}
      items={items}
      footer={footer}
      toolbar={isCatalog ? <CatalogToolbar /> : undefined}
      head={{
        icon: section.icon,
        eyebrow: activeCourse ? `Academy · ${TRACK_META[activeCourse.track].label}` : section.eyebrow,
        title: isHome
          ? `${greeting()}${me ? `, ${firstName(me.name)}` : ''}`
          : activeCourse
            ? activeCourse.title
            : section.title,
        sub: activeCourse ? activeCourse.tagline : section.sub,
        actions: (
          <>
            <XpMeter xp={totalXp} rank={rank} />
            <button type="button" className="neo-btn neo-btn--soft" onClick={() => navigate('/academy/catalog')}>
              <Compass /> <span className="neo-btn__label">Browse catalog</span>
            </button>
            {resumeTarget && (
              <button
                type="button"
                className="neo-btn neo-btn--plasma"
                onClick={() => navigate(`/academy/course/${resumeTarget.id}`)}
              >
                <Play />{' '}
                <span className="neo-btn__label">
                  {active.length > 0 ? 'Resume next course' : 'Start a course'}
                </span>
              </button>
            )}
          </>
        ),
      }}
      overlays={<CertificateModal certificate={modalCert} course={modalCourse} onClose={closeCert} />}
    >
      <Routes>
        <Route index element={<AcademyHome />} />
        <Route path="catalog" element={<CatalogView />} />
        <Route path="course/:courseId" element={<CoursePlayer />} />
        <Route path="certificates" element={<CertificatesView />} />
        <Route path="manage" element={<ComplianceStudio />} />
        <Route path="*" element={<Navigate to="/academy" replace />} />
      </Routes>
    </NeoAppFrame>
  );
}

