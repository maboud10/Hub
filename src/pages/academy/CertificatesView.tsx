import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import {
  ArrowRight,
  Award,
  Check,
  Lock,
  Printer,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { NeoEmpty, NeoKpi, NeoKpis, NeoPanel, NeoTabs } from '@/components/neo';
import { TRACK_META } from '@/academy/constants';
import { useMyLearning } from '@/academy/selectors';
import { formatDate } from '@/lib/format';
import { TrackBadge, useCertParam } from './shared';

type VaultFilter = 'all' | 'earned' | 'locked';

export function CertificatesView() {
  const { all, certificates, totalXp, rank } = useMyLearning();
  const { open: openCert } = useCertParam();
  const [filter, setFilter] = useState<VaultFilter>('all');

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

  const showEarned = filter === 'all' || filter === 'earned';
  const showLocked = (filter === 'all' || filter === 'locked') && lockedCourses.length > 0;

  return (
    <div className="neo-stack">
      <NeoKpis label="Credentials overview">
        <NeoKpi
          icon={<Award />}
          label="Earned credentials"
          value={certificates.length}
          sub={`of ${all.length} total certifications`}
        />
        <NeoKpi
          icon={<Sparkles />}
          label="Mastery rank"
          value={`Lv.${rank.level} · ${rank.title}`}
          sub={`${totalXp} XP lifetime earned`}
        />
        <NeoKpi
          icon={<Check />}
          label="Verified skills"
          value={uniqueSkillsCount}
          sub="Endorsed on NEXUS directory"
        />
        <NeoKpi
          icon={<ShieldCheck />}
          label="Verification standard"
          value="FNV-1a Signed"
          sub="Printable & audit-verifiable"
        />
      </NeoKpis>

      <div className="row row--between row--wrap" style={{ gap: 10 }}>
        <NeoTabs<VaultFilter>
          label="Filter credentials"
          value={filter}
          onChange={setFilter}
          items={[
            { value: 'all', label: 'All', count: all.length },
            { value: 'earned', label: 'Earned', count: certificates.length },
            { value: 'locked', label: 'In reach', count: lockedCourses.length },
          ]}
        />
        <span className="ac-panel-note">Click any earned credential to inspect or print official PDF</span>
      </div>

      {/* Earned Holographic Credentials Gallery */}
      {showEarned && (
        <NeoPanel
          icon={<Award />}
          hud="Credentials vault"
          title="Verified digital credentials"
          actions={
            <span className="neo-chip" data-tone="emerald">
              <ShieldCheck /> {certificates.length} active
            </span>
          }
        >
          {certificates.length === 0 ? (
            <NeoEmpty
              icon={<Award />}
              title="No certificates earned yet"
              action={
                <Link to="/academy/catalog" className="neo-btn neo-btn--plasma neo-btn--sm">
                  Browse courses <ArrowRight />
                </Link>
              }
            >
              Pass any course’s graded assessment to unlock your first holographic Helix Academy credential.
            </NeoEmpty>
          ) : (
            <div className="ac-certs-grid neo-stagger">
              {certificates.map((cert, i) => {
                const meta = TRACK_META[cert.track];
                return (
                  <button
                    key={cert.id}
                    type="button"
                    className="ac-cert-card neo-spot"
                    style={{ '--th': meta.hue, '--i': i } as CSSProperties}
                    onClick={() => openCert(cert.id)}
                  >
                    <div className="row row--between" style={{ width: '100%' }}>
                      <span className="ac-cert-seal" style={{ '--th': meta.hue } as CSSProperties}>
                        <Award />
                      </span>
                      <div className="row" style={{ gap: 6 }}>
                        <TrackBadge track={cert.track} short />
                        <span className="neo-chip" data-tone="emerald">
                          {cert.score}%
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="neo-mono text-xs faint" style={{ letterSpacing: '0.06em' }}>
                        {cert.credentialCode}
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: 17.5,
                          fontWeight: 700,
                          color: 'var(--text)',
                          marginTop: 3,
                        }}
                      >
                        {cert.courseTitle}
                      </div>
                    </div>

                    {cert.skills.length > 0 && (
                      <div className="row row--wrap" style={{ gap: 5 }}>
                        {cert.skills.slice(0, 3).map((sk) => (
                          <span key={sk} className="ac-skill ac-skill--ok">
                            <Check size={10} /> {sk}
                          </span>
                        ))}
                      </div>
                    )}

                    <div
                      className="row row--between row--wrap"
                      style={{
                        width: '100%',
                        marginTop: 'auto',
                        paddingTop: 10,
                        borderTop: '1px solid var(--plane-border)',
                      }}
                    >
                      <div className="text-xs muted">
                        Issued {formatDate(cert.issuedAt)}
                        {cert.expiresAt ? ` · Valid thru ${formatDate(cert.expiresAt)}` : ''}
                      </div>
                      <span
                        className="neo-mono text-xs"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          fontWeight: 600,
                          color: 'var(--app-ink)',
                        }}
                      >
                        <Printer size={12} /> View / Print
                      </span>
                    </div>

                    <div className="row row--between" style={{ width: '100%', fontSize: 11, color: 'var(--text-3)' }}>
                      <span className="neo-mono">SHA: {cert.verificationHash}</span>
                      <span className="neo-mono">+{cert.xpEarned} XP</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </NeoPanel>
      )}

      {/* Locked / Upcoming Certifications Preview */}
      {showLocked && (
        <NeoPanel
          icon={<Sparkles />}
          hud="In reach"
          title="Next credentials to unlock"
          actions={
            <Link to="/academy/catalog" className="neo-btn neo-btn--ghost neo-btn--xs">
              Catalog <ArrowRight />
            </Link>
          }
        >
          <div className="ac-certs-grid neo-stagger">
            {lockedCourses.map(({ course, enrollment, progressPct }, i) => (
              <div
                key={course.id}
                className="ac-cert-card ac-cert-card--locked"
                style={{ '--th': course.hue, '--i': i } as CSSProperties}
              >
                <div className="row row--between" style={{ width: '100%' }}>
                  <span
                    className="ac-cert-seal"
                    style={{
                      background: 'var(--plane-2)',
                      borderColor: 'var(--plane-border-2)',
                      color: 'var(--text-3)',
                    }}
                  >
                    <Lock />
                  </span>
                  <div className="row" style={{ gap: 6 }}>
                    <TrackBadge track={course.track} short />
                    <span className="neo-chip" data-tone="slate">
                      <Zap /> +{course.xp} XP
                    </span>
                  </div>
                </div>

                <div>
                  <div className="neo-mono text-xs faint">LOCKED CREDENTIAL · PASS {course.passScore}%</div>
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 16.5,
                      fontWeight: 650,
                      color: 'var(--text)',
                      marginTop: 3,
                    }}
                  >
                    {course.title}
                  </div>
                  <p className="text-xs muted clamp-2" style={{ marginTop: 4 }}>
                    {course.tagline}
                  </p>
                </div>

                <div className="row row--wrap" style={{ gap: 5 }}>
                  {course.skills.slice(0, 3).map((sk) => (
                    <span key={sk} className="ac-skill">
                      {sk}
                    </span>
                  ))}
                </div>

                <div
                  className="row row--between"
                  style={{
                    width: '100%',
                    marginTop: 'auto',
                    paddingTop: 10,
                    borderTop: '1px solid var(--plane-border)',
                  }}
                >
                  <span className="neo-mono text-xs muted">
                    {enrollment ? `${progressPct}% complete` : `${course.durationMins} mins`}
                  </span>
                  <Link
                    to={`/academy/course/${course.id}`}
                    className={enrollment ? 'neo-btn neo-btn--plasma neo-btn--sm' : 'neo-btn neo-btn--soft neo-btn--sm'}
                  >
                    {enrollment ? 'Continue' : 'Unlock'} <ArrowRight />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </NeoPanel>
      )}
    </div>
  );
}

