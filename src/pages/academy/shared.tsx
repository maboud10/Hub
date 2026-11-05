import { useState, type CSSProperties } from 'react';
import {
  AlertTriangle,
  Award,
  Check,
  Clock,
  Copy,
  Printer,
  Rocket,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { TRACK_META } from '@/academy/constants';
import type { AcademyTrack, AssignmentSource, Certificate, Course } from '@/academy/types';
import { Modal } from '@/components/ui/Modal';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { formatDate } from '@/lib/format';
import { formatDay } from '@/hr/calendar';
import { cx } from '@/lib/cx';

export function TrackBadge({ track, short = false }: { track: AcademyTrack; short?: boolean }) {
  const meta = TRACK_META[track];
  return (
    <span className="ac-track-badge" style={{ '--th': meta.hue } as CSSProperties}>
      {short ? meta.short : meta.label}
    </span>
  );
}

export function SourceBadge({ source, managerName }: { source: AssignmentSource; managerName?: string }) {
  if (source === 'onboarding') {
    return (
      <span className="badge badge--info">
        <Rocket /> Onboarding
      </span>
    );
  }
  if (source === 'compliance') {
    return (
      <span className="badge badge--warning">
        <ShieldCheck /> Compliance
      </span>
    );
  }
  if (source === 'manager') {
    return (
      <span className="badge">
        <UserCheck /> {managerName ? `Assigned by ${managerName}` : 'Assigned by Manager'}
      </span>
    );
  }
  return <span className="badge badge--muted">Self-enrolled</span>;
}

export function DuePill({
  dueDate,
  daysUntilDue,
  overdue,
  dueSoon,
}: {
  dueDate?: string;
  daysUntilDue: number | null;
  overdue: boolean;
  dueSoon: boolean;
}) {
  if (!dueDate || daysUntilDue === null) return null;
  if (overdue) {
    return (
      <span className="badge badge--danger">
        <AlertTriangle /> Overdue by {Math.abs(daysUntilDue)}d
      </span>
    );
  }
  if (daysUntilDue === 0) {
    return (
      <span className="badge badge--warning">
        <Clock /> Due today
      </span>
    );
  }
  if (dueSoon) {
    return (
      <span className="badge badge--warning">
        <Clock /> Due in {daysUntilDue}d
      </span>
    );
  }
  return (
    <span className="badge badge--muted">
      <Clock /> Due {formatDay(dueDate, { day: 'numeric', month: 'short' })}
    </span>
  );
}

export function ProgressRing({
  pct,
  size = 52,
  stroke = 4.5,
  hue = 245,
  label,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  hue?: number;
  label?: string;
}) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = circ - (clamped / 100) * circ;

  return (
    <div
      style={{ position: 'relative', width: size, height: size, display: 'inline-grid', placeItems: 'center', flex: 'none' }}
      aria-label={label ?? `${clamped}% complete`}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={clamped === 100 ? 'var(--success)' : `hsl(${hue} 84% 62%)`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 450ms cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>
      <span className="mono" style={{ position: 'absolute', fontSize: size >= 64 ? 14 : 11, fontWeight: 700, color: 'var(--text)' }}>
        {clamped}%
      </span>
    </div>
  );
}

export interface RadarDomainPoint {
  id: AcademyTrack;
  label: string;
  hue: number;
  value: number;
  completedCount: number;
  totalCount: number;
}

export function SkillRadarChart({
  domains,
  skills,
  onSelectTrack,
}: {
  domains: RadarDomainPoint[];
  skills: string[];
  onSelectTrack?: (track: AcademyTrack) => void;
}) {
  const [activeId, setActiveId] = useState<AcademyTrack | null>(null);
  const cxPt = 145;
  const cyPt = 132;
  const radius = 84;
  const levels = [0.25, 0.5, 0.75, 1];

  const angleFor = (idx: number) => -Math.PI / 2 + (idx * 2 * Math.PI) / domains.length;
  const pointAt = (idx: number, ratio: number) => {
    const a = angleFor(idx);
    return {
      x: cxPt + Math.cos(a) * radius * ratio,
      y: cyPt + Math.sin(a) * radius * ratio,
    };
  };

  const polygonPoints = domains
    .map((d, idx) => {
      const ratio = Math.max(0.08, Math.min(1, d.value / 100));
      const p = pointAt(idx, ratio);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(' ');

  const activeDomain = domains.find((d) => d.id === activeId) ?? null;

  return (
    <div className="card ac-radar-card">
      <div className="row row--between row--wrap">
        <div>
          <div className="section-title">
            <Sparkles size={17} style={{ color: '#818cf8' }} /> Skill Radar & Mastery
          </div>
          <p className="text-xs muted" style={{ marginTop: 2 }}>
            Live proficiency across Helix’s 6 capability pillars
          </p>
        </div>
        {activeDomain && (
          <span className="ac-track-badge" style={{ '--th': activeDomain.hue } as CSSProperties}>
            {activeDomain.label}: {activeDomain.value}%
          </span>
        )}
      </div>

      <div className="ac-radar-wrap">
        <svg viewBox="0 0 290 264" className="ac-radar-svg" role="img" aria-label="Skill mastery radar chart">
          {/* Concentric hexagon rings */}
          {levels.map((lv) => {
            const ringPts = domains
              .map((_, i) => {
                const p = pointAt(i, lv);
                return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
              })
              .join(' ');
            return <polygon key={lv} points={ringPts} className="ac-radar-ring" />;
          })}

          {/* Axes */}
          {domains.map((d, i) => {
            const outer = pointAt(i, 1);
            return <line key={d.id} x1={cxPt} y1={cyPt} x2={outer.x} y2={outer.y} className="ac-radar-axis" />;
          })}

          {/* Learner Polygon */}
          <polygon points={polygonPoints} className="ac-radar-shape" />

          {/* Vertices & Labels */}
          {domains.map((d, i) => {
            const ratio = Math.max(0.08, Math.min(1, d.value / 100));
            const pt = pointAt(i, ratio);
            const labelPt = pointAt(i, 1.24);
            const isActive = activeId === d.id;
            const anchor = Math.abs(labelPt.x - cxPt) < 12 ? 'middle' : labelPt.x > cxPt ? 'start' : 'end';

            return (
              <g
                key={d.id}
                onMouseEnter={() => setActiveId(d.id)}
                onMouseLeave={() => setActiveId(null)}
                onClick={() => onSelectTrack?.(d.id)}
              >
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isActive ? 6 : 4.2}
                  fill={`hsl(${d.hue} 85% 62%)`}
                  stroke="var(--surface-solid)"
                  strokeWidth={1.8}
                  className="ac-radar-dot"
                />
                <text
                  x={labelPt.x}
                  y={labelPt.y + 3}
                  textAnchor={anchor}
                  className={cx('ac-radar-label', isActive && 'is-active')}
                >
                  {TRACK_META[d.id].short}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Domain Progress Breakdown */}
      <div className="ac-domain-list">
        {domains.map((d) => (
          <button
            key={d.id}
            type="button"
            className={cx('ac-domain-item', activeId === d.id && 'is-active')}
            style={{ '--th': d.hue } as CSSProperties}
            onMouseEnter={() => setActiveId(d.id)}
            onMouseLeave={() => setActiveId(null)}
            onClick={() => onSelectTrack?.(d.id)}
          >
            <div className="row row--between" style={{ gap: 6, marginBottom: 5 }}>
              <span className="text-xs truncate" style={{ fontWeight: 600, color: 'var(--text)' }}>
                {d.label}
              </span>
              <span className="mono text-xs muted">
                {d.completedCount}/{d.totalCount}
              </span>
            </div>
            <div className="ac-bar" style={{ '--th': d.hue } as CSSProperties}>
              <i style={{ width: `${d.value}%` }} />
            </div>
          </button>
        ))}
      </div>

      {/* Endorsed Profile Skills */}
      {skills.length > 0 && (
        <div style={{ paddingTop: 4, borderTop: '1px solid var(--border)' }}>
          <div className="text-xs faint mono" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Endorsed Directory Skills ({skills.length})
          </div>
          <div className="ac-skills-cloud">
            {skills.map((sk) => (
              <span key={sk} className="ac-skill-pill">
                <Check /> {sk}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Deterministic SVG verification matrix (QR-style visual block) from credential hash. */
function VerificationMatrix({ hash }: { hash: string }) {
  const cells: boolean[] = [];
  for (let i = 0; i < 25; i++) {
    const ch = hash.charCodeAt(i % hash.length) || 65;
    cells.push(((ch + i * 7) & 1) === 0 || i === 0 || i === 4 || i === 20 || i === 12);
  }
  return (
    <svg width={44} height={44} viewBox="0 0 25 25" aria-hidden="true" style={{ borderRadius: 6, background: 'var(--surface-solid)', padding: 3, border: '1px solid var(--border-2)', flex: 'none' }}>
      {cells.map((on, idx) => {
        if (!on) return null;
        const x = (idx % 5) * 5;
        const y = Math.floor(idx / 5) * 5;
        return <rect key={idx} x={x + 0.5} y={y + 0.5} width={4} height={4} rx={0.8} fill="#6366f1" />;
      })}
    </svg>
  );
}

export function CertificateModal({
  certificate,
  course,
  onClose,
}: {
  certificate: Certificate | null;
  course?: Course;
  onClose: () => void;
}) {
  const users = useHub((s) => s.users);
  const [copied, setCopied] = useState(false);

  if (!certificate) return null;

  const recipient = users.find((u) => u.id === certificate.userId);
  const instructor = course ? users.find((u) => u.id === course.instructorId) : undefined;
  const peopleOps = users.find((u) => u.id === 'u-sara');
  const trackMeta = TRACK_META[certificate.track];

  const handleCopy = () => {
    const text = `${certificate.credentialCode} · SHA:${certificate.verificationHash}`;
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    toast.success('Copied verifiable credential ID', text);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      open={!!certificate}
      onClose={onClose}
      width={680}
      icon={
        <span className="ac-cert-seal" style={{ '--th': trackMeta.hue } as CSSProperties}>
          <Award />
        </span>
      }
      title="Official Digital Credential"
      subtitle={`${certificate.credentialCode} · Verified by Helix Academy`}
      footer={
        <div className="row row--between row--wrap ac-no-print" style={{ width: '100%' }}>
          <button type="button" className="btn btn--sm" onClick={handleCopy}>
            {copied ? <Check /> : <Copy />}
            {copied ? 'Copied ID' : 'Copy Credential ID'}
          </button>
          <div className="row">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Close
            </button>
            <button type="button" className="btn ac-btn-indigo" onClick={() => window.print()}>
              <Printer /> Print / Save PDF
            </button>
          </div>
        </div>
      }
    >
      <div className="ac-official-cert ac-print-root" style={{ '--th': trackMeta.hue } as CSSProperties}>
        <div className="ac-official-cert__frame">
          <div className="row row--between row--wrap">
            <div className="eyebrow" style={{ marginBottom: 0 }}>
              Helix Academy · Verified Digital Credential
            </div>
            <TrackBadge track={certificate.track} />
          </div>

          <div>
            <div className="text-xs muted" style={{ marginBottom: 4 }}>
              This certifies that
            </div>
            <div className="ac-official-cert__recipient">{recipient?.name ?? 'Helix Team Member'}</div>
            {recipient && (
              <div className="text-sm muted" style={{ marginTop: 2 }}>
                {recipient.title} · {recipient.department}
              </div>
            )}
          </div>

          <div>
            <div className="text-xs muted" style={{ marginBottom: 4 }}>
              has successfully completed the interactive curriculum & certification assessment for
            </div>
            <div className="ac-official-cert__course">{certificate.courseTitle}</div>
          </div>

          <div className="row row--wrap" style={{ gap: 10 }}>
            <span className="badge badge--success">Assessment Score: {certificate.score}%</span>
            <span className="badge badge--info">+{certificate.xpEarned} XP Awarded</span>
            <span className="badge badge--muted">Issued {formatDate(certificate.issuedAt)}</span>
            {certificate.expiresAt && (
              <span className="badge badge--muted">Valid thru {formatDate(certificate.expiresAt)}</span>
            )}
          </div>

          {certificate.skills.length > 0 && (
            <div>
              <div className="text-xs faint mono" style={{ textTransform: 'uppercase', marginBottom: 6 }}>
                Verified Competencies
              </div>
              <div className="row row--wrap" style={{ gap: 6 }}>
                {certificate.skills.map((s) => (
                  <span key={s} className="tag">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="ac-official-cert__sigs">
            <div>
              <div className="ac-sig-line">{instructor?.name ?? 'Helix Faculty'}</div>
              <div className="text-xs muted">{instructor?.title ?? 'Course Lead · Helix Academy'}</div>
            </div>
            <div>
              <div className="ac-sig-line">{peopleOps?.name ?? 'Sara Al Mansoori'}</div>
              <div className="text-xs muted">Head of People Ops & L&D · Helix</div>
            </div>
          </div>

          <div className="ac-verify-box">
            <div className="row" style={{ gap: 12, minWidth: 0 }}>
              <VerificationMatrix hash={certificate.verificationHash} />
              <div style={{ minWidth: 0 }}>
                <div className="mono text-xs" style={{ fontWeight: 700, color: 'var(--text)' }}>
                  {certificate.credentialCode}
                </div>
                <div className="mono text-xs faint truncate">
                  Verification Hash: {certificate.verificationHash} · Issuer: {certificate.issuedBy}
                </div>
              </div>
            </div>
            <span className="badge badge--success">
              <ShieldCheck /> Authentic
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
