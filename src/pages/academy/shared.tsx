import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BookOpen,
  Check,
  Clock,
  Copy,
  FlaskConical,
  Layers,
  Printer,
  Rocket,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { FORMAT_LABEL, LEVEL_META, TRACK_META } from '@/academy/constants';
import { useMyLearning, type EnrichedCourseItem } from '@/academy/selectors';
import type { AcademyTrack, AssignmentSource, Certificate, Course, CourseFormat, CourseLevel } from '@/academy/types';
import type { Tone } from '@/components/neo';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/primitives';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { formatDate } from '@/lib/format';
import { formatDay } from '@/hr/calendar';
import { cx } from '@/lib/cx';

/* ==========================================================================
   Helix Academy — shared NEO building blocks (badges, rings, radar, course
   cards, XP meter, credential modal) and small URL helpers.
   ========================================================================== */

export const LEVEL_TONE: Record<CourseLevel, Tone> = {
  foundations: 'cyan',
  practitioner: 'emerald',
  advanced: 'amber',
};

export const FORMAT_ICON: Record<CourseFormat, LucideIcon> = {
  interactive: Layers,
  scenario: FlaskConical,
  certification: Award,
  workshop: Wrench,
};

const RANK_TITLES = ['Explorer', 'Practitioner', 'Specialist', 'Vanguard', 'Fellow'];
/** Title of the rank after `level` (1-based), or null at the top rank. */
export const nextRankTitle = (level: number): string | null => RANK_TITLES[level] ?? null;

/** Minutes left in a course, rounded up to 5 (never below 5). */
export function minutesLeft(course: Course, progressPct: number): number {
  return Math.max(5, Math.ceil((course.durationMins * (100 - progressPct)) / 100 / 5) * 5);
}

/** `200` → "3h 20m", `45` → "45m". */
export function formatMins(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** "today" / "tomorrow" / "in 4 days" / "3 days ago". */
export function dueWords(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days > 1) return `in ${days} days`;
  return `${Math.abs(days)} day${days === -1 ? '' : 's'} ago`;
}

/* ---------- URL helpers ---------- */

/**
 * Patches the live query string. Reads `window.location` (not the render's
 * snapshot) so delayed calls never clobber params that changed meanwhile.
 * `null` / `''` remove a key.
 */
export function usePatchParams() {
  const [, setSp] = useSearchParams();
  return useCallback(
    (patch: Record<string, string | null | undefined>, opts?: { replace?: boolean }) => {
      const next = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === '') next.delete(k);
        else next.set(k, v);
      }
      setSp(next, { replace: opts?.replace ?? true });
    },
    [setSp],
  );
}

/**
 * Text input state mirrored to a query param. Typing stays local (router
 * updates run in transitions, which controlled inputs can't use) and is
 * written to the URL after a short pause; outside URL changes flow back in.
 */
export function useParamText(key: string, delay = 220): [string, (v: string) => void] {
  const [sp] = useSearchParams();
  const patch = usePatchParams();
  const urlValue = sp.get(key) ?? '';
  const [text, setText] = useState(urlValue);
  const synced = useRef(urlValue);

  useEffect(() => {
    if (urlValue !== synced.current) {
      synced.current = urlValue;
      setText(urlValue);
    }
  }, [urlValue]);

  useEffect(() => {
    const norm = text.trim() ? text : '';
    if (norm === synced.current) return;
    const t = window.setTimeout(() => {
      synced.current = norm;
      patch({ [key]: norm || null });
    }, delay);
    return () => window.clearTimeout(t);
  }, [text, key, delay, patch]);

  return [text, setText];
}

/** Certificates open from any Academy route via `?cert=<id>`. */
export function useCertParam() {
  const [sp] = useSearchParams();
  const patch = usePatchParams();
  const certId = sp.get('cert');
  const open = useCallback((id: string) => patch({ cert: id }, { replace: false }), [patch]);
  const close = useCallback(() => patch({ cert: null }), [patch]);
  return { certId, open, close };
}

/** Nova's best next course: weakest skill pillar first, featured and short first. */
export function useNovaPick(): { course: Course; domain: string } | null {
  const { all, radar } = useMyLearning();
  return useMemo(() => {
    const open = all.filter((x) => !x.enrollment);
    for (const gap of [...radar].sort((a, b) => a.value - b.value)) {
      const best = open
        .filter((x) => x.course.track === gap.id)
        .sort((a, b) => Number(!!b.course.featured) - Number(!!a.course.featured) || a.course.durationMins - b.course.durationMins)[0];
      if (best) return { course: best.course, domain: gap.label };
    }
    return null;
  }, [all, radar]);
}

/* ---------- Badges ---------- */

export function TrackBadge({ track, short = false }: { track: AcademyTrack; short?: boolean }) {
  const meta = TRACK_META[track];
  return (
    <span className="ac-track" style={{ '--th': meta.hue } as CSSProperties}>
      {short ? meta.short : meta.label}
    </span>
  );
}

export function SourceBadge({ source, managerName }: { source: AssignmentSource; managerName?: string }) {
  if (source === 'onboarding') {
    return (
      <span className="neo-chip" data-tone="violet">
        <Rocket /> Onboarding
      </span>
    );
  }
  if (source === 'compliance') {
    return (
      <span className="neo-chip" data-tone="warning">
        <ShieldCheck /> Compliance
      </span>
    );
  }
  if (source === 'manager') {
    return (
      <span className="neo-chip" data-tone="blue">
        <UserCheck /> {managerName ? `Assigned by ${managerName}` : 'Assigned by manager'}
      </span>
    );
  }
  return (
    <span className="neo-chip" data-tone="slate">
      Self-enrolled
    </span>
  );
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
      <span className="neo-chip" data-tone="danger">
        <AlertTriangle /> Overdue by {Math.abs(daysUntilDue)}d
      </span>
    );
  }
  if (daysUntilDue === 0) {
    return (
      <span className="neo-chip" data-tone="warning">
        <Clock /> Due today
      </span>
    );
  }
  if (dueSoon) {
    return (
      <span className="neo-chip" data-tone="warning">
        <Clock /> Due in {daysUntilDue}d
      </span>
    );
  }
  return (
    <span className="neo-chip" data-tone="slate">
      <Clock /> Due {formatDay(dueDate, { day: 'numeric', month: 'short' })}
    </span>
  );
}

/* ---------- Progress ring (course hue; green when complete) ---------- */

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
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const offset = circ - (clamped / 100) * circ;

  return (
    <span
      className="ac-pring"
      data-done={clamped === 100 || undefined}
      style={{ width: size, height: size, '--th': hue } as CSSProperties}
      role="img"
      aria-label={label ?? `${clamped}% complete`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ac-pring__track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle
          className="ac-pring__value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="ac-pring__label" style={{ fontSize: size >= 64 ? 14 : size >= 48 ? 11.5 : 10 }}>
        {clamped}%
      </span>
    </span>
  );
}

/* ---------- Header XP meter (replaces the old rank pill) ---------- */

export function XpMeter({ xp, rank }: { xp: number; rank: { level: number; title: string; nextXp: number; progressPct: number } }) {
  const next = nextRankTitle(rank.level);
  return (
    <div
      className="ac-xp"
      role="img"
      aria-label={next ? `Level ${rank.level} ${rank.title}: ${xp} of ${rank.nextXp} XP to ${next}` : `Level ${rank.level} ${rank.title}: ${xp} XP, top rank`}
      title={next ? `${Math.max(0, rank.nextXp - xp)} XP to ${next}` : 'Top rank reached'}
    >
      <span className="ac-xp__lvl">
        <Sparkles /> Lv.{rank.level}
      </span>
      <span className="ac-xp__title">{rank.title}</span>
      <span className="ac-xp__bar" aria-hidden="true">
        <i style={{ width: `${rank.progressPct}%` }} />
      </span>
      <span className="ac-xp__num">{next ? `${xp}/${rank.nextXp}` : xp} XP</span>
    </div>
  );
}

/* ---------- Course card (home + catalog) ---------- */

export function CourseCard({ item, i = 0, compact, pick }: { item: EnrichedCourseItem; i?: number; compact?: boolean; pick?: boolean }) {
  const users = useHub((s) => s.users);
  const { course, enrollment, progressPct } = item;
  const instructor = users.find((u) => u.id === course.instructorId);
  const Icon = FORMAT_ICON[course.format];
  const done = enrollment?.status === 'completed';
  const to = `/academy/course/${course.id}`;
  const cta = done ? 'Review' : enrollment ? 'Continue' : compact ? 'Start' : 'Open course';

  return (
    <article className={cx('ac-card neo-spot', compact && 'ac-card--compact')} style={{ '--th': course.hue, '--i': i } as CSSProperties}>
      <div className="ac-card__cover">
        <span className="ac-card__glyph" aria-hidden="true">
          <Icon />
        </span>
        <div className="ac-card__flags">
          {pick && (
            <span className="neo-chip neo-chip--sm" data-tone="violet">
              <Sparkles /> Nova pick
            </span>
          )}
          {course.mandatory && (
            <span className="neo-chip neo-chip--sm" data-tone="warning">
              <ShieldCheck /> Mandatory
            </span>
          )}
          <span className="neo-chip neo-chip--sm" data-tone={LEVEL_TONE[course.level]}>
            {LEVEL_META[course.level].label}
          </span>
        </div>
        {enrollment && <ProgressRing pct={progressPct} hue={course.hue} size={40} stroke={3.5} />}
      </div>
      <div className="ac-card__body">
        <div className="ac-card__track">
          <TrackBadge track={course.track} short />
          <span>{FORMAT_LABEL[course.format]}</span>
        </div>
        <Link to={to} className="ac-card__title">
          {course.title}
        </Link>
        <p className="ac-card__tagline">{course.tagline}</p>
        {!compact && (
          <div className="ac-card__skills">
            {course.skills.slice(0, 4).map((sk) => (
              <span key={sk} className="ac-skill">
                {sk}
              </span>
            ))}
          </div>
        )}
        <div className="ac-card__meta">
          <span>
            <Clock /> {course.durationMins}m
          </span>
          <span>
            <Zap /> +{course.xp} XP
          </span>
          <span>
            <BookOpen /> {course.lessons.length} lessons
          </span>
        </div>
      </div>
      <footer className="ac-card__foot">
        {instructor && !compact ? (
          <span className="ac-card__by">
            <Avatar user={instructor} size={24} />
            <span className="truncate">{instructor.name}</span>
          </span>
        ) : (
          <span className={cx('ac-card__state', done && 'is-done')}>{done ? 'Certified' : enrollment ? `In progress · ${progressPct}%` : 'Not started'}</span>
        )}
        <Link to={to} className={cx('neo-btn neo-btn--sm', done ? 'neo-btn--ghost' : enrollment ? 'neo-btn--plasma' : 'neo-btn--soft')}>
          {cta} <ArrowRight />
        </Link>
      </footer>
    </article>
  );
}

/* ---------- Skill radar (panel content) ---------- */

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
  const cyPt = 128;
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
  const overall = domains.length ? Math.round(domains.reduce((s, d) => s + d.value, 0) / domains.length) : 0;
  const shownSkills = skills.slice(0, 10);

  return (
    <div className="ac-radar">
      <div className="ac-radar__wrap">
        <svg viewBox="0 0 290 256" className="ac-radar__svg" role="img" aria-label="Skill mastery radar chart">
          {/* Concentric rings */}
          {levels.map((lv) => {
            const ringPts = domains
              .map((_, i) => {
                const p = pointAt(i, lv);
                return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
              })
              .join(' ');
            return <polygon key={lv} points={ringPts} className="ac-radar__ring" />;
          })}

          {/* Axes */}
          {domains.map((d, i) => {
            const outer = pointAt(i, 1);
            return <line key={d.id} x1={cxPt} y1={cyPt} x2={outer.x} y2={outer.y} className="ac-radar__axis" />;
          })}

          {/* Learner polygon */}
          <polygon points={polygonPoints} className="ac-radar__shape" />

          {/* Vertices & labels */}
          {domains.map((d, i) => {
            const ratio = Math.max(0.08, Math.min(1, d.value / 100));
            const pt = pointAt(i, ratio);
            const labelPt = pointAt(i, 1.24);
            const isActive = activeId === d.id;
            const anchor = Math.abs(labelPt.x - cxPt) < 12 ? 'middle' : labelPt.x > cxPt ? 'start' : 'end';

            return (
              <g
                key={d.id}
                className="ac-radar__node"
                onMouseEnter={() => setActiveId(d.id)}
                onMouseLeave={() => setActiveId(null)}
                onClick={() => onSelectTrack?.(d.id)}
              >
                <circle cx={pt.x} cy={pt.y} r={isActive ? 6 : 4.2} fill={`hsl(${d.hue} 85% 62%)`} className="ac-radar__dot" />
                <text x={labelPt.x} y={labelPt.y + 3} textAnchor={anchor} className={cx('ac-radar__label', isActive && 'is-active')}>
                  {TRACK_META[d.id].short}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="ac-radar__readout" aria-live="polite">
          {activeDomain ? (
            <>
              <b>{activeDomain.label}</b> <span className="neo-num">{activeDomain.value}%</span> · {activeDomain.completedCount}/{activeDomain.totalCount} courses
            </>
          ) : (
            <>
              Overall mastery <span className="neo-num">{overall}%</span> · tap a pillar to browse it
            </>
          )}
        </div>
      </div>

      {/* Per-pillar breakdown */}
      <div className="ac-domains">
        {domains.map((d) => (
          <button
            key={d.id}
            type="button"
            className={cx('ac-domain', activeId === d.id && 'is-active')}
            style={{ '--th': d.hue } as CSSProperties}
            onMouseEnter={() => setActiveId(d.id)}
            onMouseLeave={() => setActiveId(null)}
            onFocus={() => setActiveId(d.id)}
            onBlur={() => setActiveId(null)}
            onClick={() => onSelectTrack?.(d.id)}
            title={`Browse ${TRACK_META[d.id].label}`}
          >
            <span className="ac-domain__row">
              <span className="ac-domain__name">{d.label}</span>
              <span className="ac-domain__count">
                {d.completedCount}/{d.totalCount}
              </span>
            </span>
            <span className="ac-domain__bar" aria-hidden="true">
              <i style={{ width: `${Math.max(3, d.value)}%` }} />
            </span>
          </button>
        ))}
      </div>

      {/* Endorsed profile skills */}
      {skills.length > 0 && (
        <div className="ac-skills">
          <div className="neo-hud">Endorsed skills · {skills.length}</div>
          <div className="ac-skills__cloud">
            {shownSkills.map((sk) => (
              <span key={sk} className="ac-skill ac-skill--ok">
                <Check /> {sk}
              </span>
            ))}
            {skills.length > shownSkills.length && <span className="ac-skill">+{skills.length - shownSkills.length} more</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Verification matrix (QR-style block from the credential hash) ---------- */

export function VerificationMatrix({ hash, size = 44 }: { hash: string; size?: number }) {
  const cells: boolean[] = [];
  for (let i = 0; i < 25; i++) {
    const ch = hash.charCodeAt(i % hash.length) || 65;
    cells.push(((ch + i * 7) & 1) === 0 || i === 0 || i === 4 || i === 20 || i === 12);
  }
  return (
    <svg className="ac-matrix" width={size} height={size} viewBox="0 0 25 25" aria-hidden="true">
      {cells.map((on, idx) => {
        if (!on) return null;
        const x = (idx % 5) * 5;
        const y = Math.floor(idx / 5) * 5;
        return <rect key={idx} x={x + 0.5} y={y + 0.5} width={4} height={4} rx={0.8} />;
      })}
    </svg>
  );
}

/* ---------- Official credential (modal) ---------- */

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
      width={700}
      className="ac-certmodal"
      icon={
        <span className="ac-seal" style={{ '--th': trackMeta.hue } as CSSProperties}>
          <Award />
        </span>
      }
      title="Verified digital credential"
      subtitle={`${certificate.credentialCode} · Issued by Helix Academy`}
      footer={
        <div className="ac-certmodal__foot ac-no-print">
          <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={handleCopy}>
            {copied ? <Check /> : <Copy />}
            {copied ? 'Copied ID' : 'Copy credential ID'}
          </button>
          <span className="grow" />
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Close
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={() => window.print()}>
            <Printer /> Print / save PDF
          </button>
        </div>
      }
    >
      <div className="ac-official-cert ac-print-root" style={{ '--th': trackMeta.hue } as CSSProperties}>
        <div className="ac-official-cert__frame">
          <div className="ac-official-cert__top">
            <span className="neo-hud">Helix Academy · Verified digital credential</span>
            <TrackBadge track={certificate.track} />
          </div>

          <div>
            <div className="ac-official-cert__lead">This certifies that</div>
            <div className="ac-official-cert__recipient">{recipient?.name ?? 'Helix Team Member'}</div>
            {recipient && (
              <div className="ac-official-cert__role">
                {recipient.title} · {recipient.department}
              </div>
            )}
          </div>

          <div>
            <div className="ac-official-cert__lead">has successfully completed the interactive curriculum &amp; certification assessment for</div>
            <div className="ac-official-cert__course">{certificate.courseTitle}</div>
          </div>

          <div className="ac-official-cert__chips">
            <span className="neo-chip" data-tone="success">
              Assessment score {certificate.score}%
            </span>
            <span className="neo-chip" data-tone="app">
              +{certificate.xpEarned} XP awarded
            </span>
            <span className="neo-chip" data-tone="slate">
              Issued {formatDate(certificate.issuedAt)}
            </span>
            {certificate.expiresAt && (
              <span className="neo-chip" data-tone="slate">
                Valid thru {formatDate(certificate.expiresAt)}
              </span>
            )}
          </div>

          {certificate.skills.length > 0 && (
            <div>
              <div className="neo-hud" style={{ marginBottom: 6 }}>
                Verified competencies
              </div>
              <div className="ac-official-cert__chips">
                {certificate.skills.map((s) => (
                  <span key={s} className="ac-skill ac-skill--ok">
                    <Check /> {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="ac-official-cert__sigs">
            <div>
              <div className="ac-sig-line">{instructor?.name ?? 'Helix Faculty'}</div>
              <div className="ac-official-cert__role">{instructor?.title ?? 'Course Lead · Helix Academy'}</div>
            </div>
            <div>
              <div className="ac-sig-line">{peopleOps?.name ?? 'Sara Al Mansoori'}</div>
              <div className="ac-official-cert__role">Head of People Ops &amp; L&amp;D · Helix</div>
            </div>
          </div>

          <div className="ac-verify">
            <VerificationMatrix hash={certificate.verificationHash} />
            <div className="ac-verify__text">
              <div className="ac-verify__code">{certificate.credentialCode}</div>
              <div className="ac-verify__hash">
                Verification hash {certificate.verificationHash} · Issuer {certificate.issuedBy}
              </div>
            </div>
            <span className="neo-chip" data-tone="success">
              <ShieldCheck /> Authentic
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
