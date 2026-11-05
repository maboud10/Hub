import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import {
  ArrowRight,
  Award,
  Check,
  Lock,
  Printer,
  Sparkles,
  Zap,
} from 'lucide-react';
import { TRACK_META } from '@/academy/constants';
import { useMyLearning } from '@/academy/selectors';
import type { Certificate } from '@/academy/types';
import { EmptyState } from '@/components/ui/primitives';
import { formatDate } from '@/lib/format';
import { CertificateModal, TrackBadge } from './shared';

export function CertificatesView() {
  const { all, certificates, totalXp, rank } = useMyLearning();
  const [selectedCert, setSelectedCert] = useState<Certificate | null>(null);

  const certifiedCourseIds = useMemo(() => new Set(certificates.map((c) => c.courseId)), [certificates]);
  const lockedCourses = useMemo(
    () => all.filter((item) => !certifiedCourseIds.has(item.course.id)),
    [all, certifiedCourseIds],
  );

  const uniqueSkillsCount = useMemo(() => {
    const set = new Set<string>();
    for (const c of certificates) {
      for (const sk of c.skills) set.add(sk);
    }
    return set.size;
  }, [certificates]);

  const selectedCourse = useMemo(
    () => (selectedCert ? all.find((x) => x.course.id === selectedCert.courseId)?.course : undefined),
    [selectedCert, all],
  );

  return (
    <div className="stack stack--lg">
      {/* Summary KPI Strip */}
      <div className="ac-kpi-grid" style={{ marginBottom: 4 }}>
        <div className="ac-kpi-card">
          <span className="text-xs muted mono">EARNED CREDENTIALS</span>
          <div className="ac-kpi-val">{certificates.length}</div>
          <span className="text-xs faint">of {all.length} total certifications</span>
        </div>
        <div className="ac-kpi-card">
          <span className="text-xs muted mono">MASTERY RANK</span>
          <div className="ac-kpi-val" style={{ color: '#818cf8' }}>
            Lv.{rank.level} · {rank.title}
          </div>
          <span className="text-xs faint">{totalXp} XP lifetime earned</span>
        </div>
        <div className="ac-kpi-card">
          <span className="text-xs muted mono">VERIFIED SKILLS</span>
          <div className="ac-kpi-val">{uniqueSkillsCount}</div>
          <span className="text-xs faint">Endorsed on NEXUS directory</span>
        </div>
        <div className="ac-kpi-card">
          <span className="text-xs muted mono">VERIFICATION STANDARD</span>
          <div className="ac-kpi-val" style={{ fontSize: 18, paddingTop: 4 }}>
            FNV-1a Signed
          </div>
          <span className="text-xs faint">Printable & audit-verifiable</span>
        </div>
      </div>

      {/* Earned Holographic Credentials Gallery */}
      <section className="stack">
        <div className="section-head" style={{ marginBottom: 2 }}>
          <h2 className="section-title">
            <Award size={19} style={{ color: '#818cf8' }} /> Verified Digital Credentials Vault
            <span className="count">{certificates.length}</span>
          </h2>
          <span className="text-xs muted">Click any credential to inspect or print official PDF</span>
        </div>

        {certificates.length === 0 ? (
          <EmptyState
            icon={<Award />}
            title="No certificates earned yet"
            action={
              <Link to="/academy/catalog" className="btn ac-btn-indigo btn--sm">
                Browse Courses <ArrowRight />
              </Link>
            }
          >
            Pass any course’s graded assessment to unlock your first holographic Helix Academy credential.
          </EmptyState>
        ) : (
          <div className="ac-certs-grid">
            {certificates.map((cert) => {
              const meta = TRACK_META[cert.track];
              return (
                <button
                  key={cert.id}
                  type="button"
                  className="ac-cert-card hud"
                  style={{ '--th': meta.hue } as CSSProperties}
                  onClick={() => setSelectedCert(cert)}
                >
                  <div className="row row--between" style={{ width: '100%' }}>
                    <span className="ac-cert-seal" style={{ '--th': meta.hue } as CSSProperties}>
                      <Award />
                    </span>
                    <div className="row" style={{ gap: 6 }}>
                      <TrackBadge track={cert.track} short />
                      <span className="badge badge--success">{cert.score}%</span>
                    </div>
                  </div>

                  <div>
                    <div className="mono text-xs faint" style={{ letterSpacing: '0.06em' }}>
                      {cert.credentialCode}
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 17.5, fontWeight: 700, color: 'var(--text)', marginTop: 3 }}>
                      {cert.courseTitle}
                    </div>
                  </div>

                  {cert.skills.length > 0 && (
                    <div className="row row--wrap" style={{ gap: 5 }}>
                      {cert.skills.slice(0, 3).map((sk) => (
                        <span key={sk} className="tag">
                          <Check size={10} /> {sk}
                        </span>
                      ))}
                    </div>
                  )}

                  <div
                    className="row row--between row--wrap"
                    style={{ width: '100%', marginTop: 'auto', paddingTop: 10, borderTop: '1px solid var(--border)' }}
                  >
                    <div className="text-xs muted">
                      Issued {formatDate(cert.issuedAt)}
                      {cert.expiresAt ? ` · Valid thru ${formatDate(cert.expiresAt)}` : ''}
                    </div>
                    <span className="mono text-xs accent-ink" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
                      <Printer size={12} /> View / Print
                    </span>
                  </div>

                  <div className="row row--between" style={{ width: '100%', fontSize: 11, color: 'var(--text-3)' }}>
                    <span className="mono">SHA: {cert.verificationHash}</span>
                    <span className="mono">+{cert.xpEarned} XP</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Locked / Upcoming Certifications Preview */}
      {lockedCourses.length > 0 && (
        <section className="stack">
          <div className="section-head" style={{ marginBottom: 2 }}>
            <h2 className="section-title">
              <Sparkles size={18} style={{ color: '#818cf8' }} /> Next Credentials to Unlock
              <span className="count">{lockedCourses.length}</span>
            </h2>
            <span className="text-xs muted">Complete lessons & pass the quiz to claim</span>
          </div>

          <div className="ac-certs-grid">
            {lockedCourses.map(({ course, enrollment, progressPct }) => (
              <div
                key={course.id}
                className="ac-cert-card ac-cert-card--locked"
                style={{ '--th': course.hue } as CSSProperties}
              >
                <div className="row row--between" style={{ width: '100%' }}>
                  <span
                    className="ac-cert-seal"
                    style={{ background: 'var(--surface-2)', borderColor: 'var(--border-2)', color: 'var(--text-3)' }}
                  >
                    <Lock />
                  </span>
                  <div className="row" style={{ gap: 6 }}>
                    <TrackBadge track={course.track} short />
                    <span className="badge badge--muted">
                      <Zap /> +{course.xp} XP
                    </span>
                  </div>
                </div>

                <div>
                  <div className="mono text-xs faint">LOCKED CREDENTIAL · PASS {course.passScore}%</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 16.5, fontWeight: 650, color: 'var(--text)', marginTop: 3 }}>
                    {course.title}
                  </div>
                  <p className="text-xs muted clamp-2" style={{ marginTop: 4 }}>
                    {course.tagline}
                  </p>
                </div>

                <div className="row row--wrap" style={{ gap: 5 }}>
                  {course.skills.slice(0, 3).map((sk) => (
                    <span key={sk} className="tag">
                      {sk}
                    </span>
                  ))}
                </div>

                <div
                  className="row row--between"
                  style={{ width: '100%', marginTop: 'auto', paddingTop: 10, borderTop: '1px solid var(--border)' }}
                >
                  <span className="mono text-xs muted">
                    {enrollment ? `${progressPct}% complete` : `${course.durationMins} mins`}
                  </span>
                  <Link to={`/academy/course/${course.id}`} className="btn btn--sm">
                    {enrollment ? 'Continue' : 'Unlock'} <ArrowRight />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Printable Official Certificate Modal */}
      <CertificateModal
        certificate={selectedCert}
        course={selectedCourse}
        onClose={() => setSelectedCert(null)}
      />
    </div>
  );
}
