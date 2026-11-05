import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  AlertTriangle,
  Award,
  BellRing,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react';
import { FORMAT_LABEL, LEVEL_META, TRACK_META, TRACK_ORDER } from '@/academy/constants';
import { useAcademyCaps, useTeamCompliance } from '@/academy/selectors';
import { useAcademy } from '@/academy/store';
import type { AcademyTrack, CourseFormat, CourseLevel } from '@/academy/types';
import { useWiki } from '@/wiki/store';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { AccessDenied } from '@/components/auth/AccessDenied';
import { Modal } from '@/components/ui/Modal';
import { Avatar, EmptyState, Segmented, Switch } from '@/components/ui/primitives';
import { addDaysISO, todayISO } from '@/hr/calendar';
import { cx } from '@/lib/cx';
import { DuePill, SourceBadge, TrackBadge } from './shared';

const PHASE_BADGE: Record<string, string> = {
  'pre-boarding': 'Pre-boarding',
  'day-1': 'Day 1',
  'week-1': 'Week 1',
  'day-30': 'Day 30',
  'day-60': 'Day 60',
  'day-90': 'Day 90',
};

export function ComplianceStudio() {
  const caps = useAcademyCaps();
  const navigate = useNavigate();
  const roles = useHub((s) => s.roles);
  const courses = useAcademy((s) => s.courses);
  const rules = useAcademy((s) => s.rules);
  const assignCourse = useAcademy((s) => s.assignCourse);
  const nudgeLearner = useAcademy((s) => s.nudgeLearner);
  const toggleOnboardingRule = useAcademy((s) => s.toggleOnboardingRule);
  const syncOnboarding = useAcademy((s) => s.syncOnboarding);
  const createCourse = useAcademy((s) => s.createCourse);
  const wikiArticles = useWiki((s) => s.articles);

  const [scope, setScope] = useState<'team' | 'company'>(() =>
    caps.manage && !caps.manager ? 'company' : 'team',
  );

  useEffect(() => {
    if (!caps.manage && scope === 'company') setScope('team');
    if (caps.manage && !caps.manager && scope === 'team') setScope('company');
  }, [caps.manage, caps.manager, scope]);

  const rows = useTeamCompliance(scope);

  // Filters & expansion state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'overdue' | 'incomplete' | 'compliant'>('all');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  // Assign Course Modal state
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignUserIds, setAssignUserIds] = useState<string[]>([]);
  const [assignSearch, setAssignSearch] = useState('');
  const [assignCourseId, setAssignCourseId] = useState<string>('');
  const [assignDueDate, setAssignDueDate] = useState<string>(() => addDaysISO(todayISO(), 14));
  const [assignRequired, setAssignRequired] = useState<boolean>(true);
  const [assignNote, setAssignNote] = useState<string>('');

  // Author New Course Modal state
  const [authorOpen, setAuthorOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTagline, setNewTagline] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newTrack, setNewTrack] = useState<AcademyTrack>('ai');
  const [newLevel, setNewLevel] = useState<CourseLevel>('practitioner');
  const [newFormat, setNewFormat] = useState<CourseFormat>('interactive');
  const [newDuration, setNewDuration] = useState<number>(20);
  const [newSkills, setNewSkills] = useState('Structured Prompting, Governance');
  const [newMandatory, setNewMandatory] = useState(false);
  const [newCompanions, setNewCompanions] = useState<string[]>([]);
  const [newLessonTitle, setNewLessonTitle] = useState('Core Concepts & Practical Guardrails');
  const [newLessonSummary, setNewLessonSummary] = useState('');
  const [newLessonBody, setNewLessonBody] = useState('');
  const [newQuizPrompt, setNewQuizPrompt] = useState('');
  const [newQuizOpts, setNewQuizOpts] = useState<string[]>(['', '', '']);
  const [newQuizCorrect, setNewQuizCorrect] = useState<number>(0);
  const [newQuizExplanation, setNewQuizExplanation] = useState('');

  const kpis = useMemo(() => {
    const reqTotal = rows.reduce((s, r) => s + r.requiredTotal, 0);
    const reqDone = rows.reduce((s, r) => s + r.requiredDone, 0);
    const rate = reqTotal > 0 ? Math.round((reqDone / reqTotal) * 100) : 100;
    const overdue = rows.reduce((s, r) => s + r.overdueCount, 0);
    const activeLearners = rows.filter((r) => r.inProgressCount > 0).length;
    const certs = rows.reduce((s, r) => s + r.certificatesCount, 0);
    return { rate, overdue, activeLearners, certs, reqDone, reqTotal };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter === 'overdue' && r.overdueCount === 0) return false;
      if (statusFilter === 'incomplete' && r.requiredDone >= r.requiredTotal) return false;
      if (statusFilter === 'compliant' && (r.overdueCount > 0 || r.requiredDone < r.requiredTotal)) return false;
      if (!q) return true;
      return `${r.user.name} ${r.user.title} ${r.user.department}`.toLowerCase().includes(q);
    });
  }, [rows, search, statusFilter]);

  const eligiblePickerUsers = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    return rows
      .map((r) => r.user)
      .filter((u) => !q || `${u.name} ${u.department} ${u.title}`.toLowerCase().includes(q));
  }, [rows, assignSearch]);

  if (!caps.manage && !caps.manager) {
    return <AccessDenied area="Team & L&D Compliance Studio" required={['academy.manage']} />;
  }

  const openAssignModal = (presetUserIds: string[] = []) => {
    setAssignUserIds(presetUserIds);
    setAssignCourseId((prev) => prev || courses[0]?.id || '');
    setAssignDueDate(addDaysISO(todayISO(), 14));
    setAssignRequired(true);
    setAssignNote('');
    setAssignSearch('');
    setAssignOpen(true);
  };

  const handleConfirmAssign = () => {
    const res = assignCourse({
      userIds: assignUserIds,
      courseId: assignCourseId,
      dueDate: assignDueDate || undefined,
      required: assignRequired,
      note: assignNote.trim() || undefined,
    });
    if (toast.result(res, 'Training assigned')) {
      setAssignOpen(false);
    }
  };

  const handleSyncOnboarding = () => {
    const count = syncOnboarding();
    if (count > 0) {
      toast.success(`Synced ${count} new onboarding enrollment${count === 1 ? '' : 's'}`);
    } else {
      toast.info('All active HR onboarding journeys are already synced');
    }
  };

  const handleCreateCourse = () => {
    const res = createCourse({
      title: newTitle,
      tagline: newTagline || newDesc.slice(0, 88),
      description: newDesc || newTagline,
      track: newTrack,
      level: newLevel,
      format: newFormat,
      durationMins: newDuration,
      skills: newSkills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      mandatory: newMandatory,
      companionSlugs: newCompanions,
      lessonTitle: newLessonTitle,
      lessonSummary: newLessonSummary || newTagline,
      lessonBody: newLessonBody,
      quizPrompt: newQuizPrompt,
      quizOptions: newQuizOpts,
      quizCorrectIndex: newQuizCorrect,
      quizExplanation: newQuizExplanation,
    });
    if (toast.result(res, 'Course published to catalog') && res.courseId) {
      setAuthorOpen(false);
      navigate(`/academy/course/${res.courseId}`);
    }
  };

  return (
    <div className="stack stack--lg">
      {/* Studio Action Bar & Scope Switcher */}
      <div className="row row--between row--wrap" style={{ gap: 12 }}>
        <div className="row row--wrap" style={{ gap: 10 }}>
          {caps.manage && caps.manager ? (
            <Segmented
              label="Compliance scope"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'team', label: `My Direct Reports (${caps.reportIds.length})`, icon: <Users size={15} /> },
                { value: 'company', label: 'All Company', icon: <Building2 size={15} /> },
              ]}
            />
          ) : (
            <span className="badge badge--info" style={{ height: 32, padding: '0 12px', fontSize: 12.5 }}>
              {scope === 'company' ? <Building2 /> : <Users />}
              {scope === 'company' ? `Company-wide L&D Scope (${rows.length} staff)` : `My Direct Reports (${rows.length})`}
            </span>
          )}
        </div>

        <div className="row row--wrap" style={{ gap: 8 }}>
          <button type="button" className="btn ac-btn-indigo btn--sm" onClick={() => openAssignModal([])}>
            <UserPlus /> Assign Course
          </button>
          {caps.manage && (
            <button type="button" className="btn btn--sm" onClick={() => setAuthorOpen(true)}>
              <Plus /> Author New Course
            </button>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="ac-kpi-grid" style={{ marginBottom: 0 }}>
        <div className="ac-kpi-card">
          <span className="text-xs muted mono">COMPLIANCE RATE</span>
          <div className="ac-kpi-val" style={{ color: kpis.rate >= 90 ? 'var(--success)' : 'var(--warning)' }}>
            {kpis.rate}%
          </div>
          <span className="text-xs faint">
            {kpis.reqDone}/{kpis.reqTotal} required trainings complete
          </span>
        </div>

        <div className="ac-kpi-card">
          <span className="text-xs muted mono">OVERDUE TRAININGS</span>
          <div className="ac-kpi-val" style={{ color: kpis.overdue > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {kpis.overdue}
          </div>
          <span className="text-xs faint">
            {kpis.overdue > 0 ? 'Needs friendly manager nudge' : 'Zero overdue items'}
          </span>
        </div>

        <div className="ac-kpi-card">
          <span className="text-xs muted mono">ACTIVE LEARNERS</span>
          <div className="ac-kpi-val">{kpis.activeLearners}</div>
          <span className="text-xs faint">Currently progressing in courses</span>
        </div>

        <div className="ac-kpi-card">
          <span className="text-xs muted mono">CERTIFICATES ISSUED</span>
          <div className="ac-kpi-val" style={{ color: '#818cf8' }}>
            {kpis.certs}
          </div>
          <span className="text-xs faint">Verified digital credentials</span>
        </div>
      </div>

      {/* Learner Compliance Roster */}
      <section className="stack">
        <div className="row row--between row--wrap" style={{ gap: 10 }}>
          <h2 className="section-title">
            <ShieldCheck size={19} style={{ color: '#818cf8' }} /> Learner Compliance & Progress
            <span className="count">{filteredRows.length}</span>
          </h2>

          <div className="row row--wrap" style={{ gap: 8 }}>
            <div className="input-wrap" style={{ width: 230 }}>
              <Search />
              <input
                type="search"
                className="input"
                style={{ height: 34, fontSize: 13 }}
                placeholder="Filter employees…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="chips">
              {(
                [
                  ['all', 'All'],
                  ['overdue', 'Overdue'],
                  ['incomplete', 'Action Needed'],
                  ['compliant', '100% Compliant'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={cx('chip', statusFilter === id && 'is-active')}
                  style={{ height: 32, fontSize: 12 }}
                  onClick={() => setStatusFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredRows.length === 0 ? (
          <EmptyState icon={<Users />} title="No learners match this filter">
            Try clearing the status filter or search query.
          </EmptyState>
        ) : (
          <div className="ac-learner-list">
            {filteredRows.map((row) => {
              const pct = row.requiredTotal > 0 ? Math.round((row.requiredDone / row.requiredTotal) * 100) : 100;
              const isExpanded = expandedUserId === row.user.id;
              const enrolledItems = row.items.filter((x) => !!x.enrollment);
              const urgentOpen = row.items.find(
                (x) => x.enrollment && x.enrollment.status !== 'completed' && (x.overdue || x.enrollment.required),
              );

              return (
                <div
                  key={row.user.id}
                  className={cx('ac-learner-card', row.overdueCount > 0 && 'ac-learner-card--overdue')}
                >
                  <div className="ac-learner-row">
                    {/* Employee Identity */}
                    <div className="row" style={{ gap: 11, minWidth: 0 }}>
                      <Avatar user={row.user} size={38} presence />
                      <div className="grow">
                        <div className="row row--wrap" style={{ gap: 6 }}>
                          <strong style={{ fontSize: 14.5 }}>{row.user.name}</strong>
                          {row.overdueCount > 0 ? (
                            <span className="badge badge--danger">
                              <AlertTriangle /> {row.overdueCount} overdue
                            </span>
                          ) : pct === 100 ? (
                            <span className="badge badge--success">
                              <Check /> Compliant
                            </span>
                          ) : (
                            <span className="badge badge--warning">In progress</span>
                          )}
                        </div>
                        <div className="text-xs muted truncate">
                          {row.user.title} · {row.user.department}
                        </div>
                      </div>
                    </div>

                    {/* Required Progress Bar */}
                    <div className="ac-learner-row__prog stack stack--sm" style={{ minWidth: 0 }}>
                      <div className="row row--between text-xs">
                        <span className="muted">
                          Required: <strong style={{ color: 'var(--text)' }}>{row.requiredDone}/{row.requiredTotal}</strong>
                        </span>
                        <span className="mono muted">{pct}%</span>
                      </div>
                      <div className="ac-bar" style={{ '--th': pct === 100 ? 152 : row.overdueCount > 0 ? 350 : 245 } as CSSProperties}>
                        <i style={{ width: `${pct}%` }} />
                      </div>
                    </div>

                    {/* Certs Badge */}
                    <span className="badge badge--muted mono" title="Earned certificates">
                      <Award /> {row.certificatesCount} certs
                    </span>

                    {/* Actions */}
                    <div className="ac-learner-row__actions row" style={{ gap: 6 }}>
                      {urgentOpen && (
                        <button
                          type="button"
                          className="btn btn--sm"
                          title={`Nudge on ${urgentOpen.course.title}`}
                          onClick={() => toast.result(nudgeLearner(row.user.id, urgentOpen.course.id))}
                        >
                          <BellRing /> Nudge
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn--sm"
                        onClick={() => openAssignModal([row.user.id])}
                      >
                        <UserPlus /> Assign
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setExpandedUserId(isExpanded ? null : row.user.id)}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? <ChevronUp /> : <ChevronDown />}
                        {enrolledItems.length}
                      </button>
                    </div>
                  </div>

                  {/* Expandable Per-Learner Course Breakdown */}
                  {isExpanded && (
                    <div className="ac-learner-detail">
                      {enrolledItems.map((item) => {
                        const enr = item.enrollment!;
                        const done = enr.status === 'completed';
                        return (
                          <div key={item.course.id} className="ac-learner-item">
                            <div className="row row--between row--wrap" style={{ gap: 6 }}>
                              <TrackBadge track={item.course.track} short />
                              {done ? (
                                <span className="badge badge--success">
                                  <Check /> {enr.bestQuizScore ?? 100}%
                                </span>
                              ) : (
                                <DuePill
                                  dueDate={enr.dueDate}
                                  daysUntilDue={item.daysUntilDue}
                                  overdue={item.overdue}
                                  dueSoon={item.dueSoon}
                                />
                              )}
                            </div>

                            <Link
                              to={`/academy/course/${item.course.id}`}
                              style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)' }}
                              className="truncate"
                            >
                              {item.course.title}
                            </Link>

                            <div className="row row--between" style={{ marginTop: 'auto' }}>
                              <SourceBadge source={enr.source} />
                              {!done ? (
                                <button
                                  type="button"
                                  className="btn btn--ghost btn--sm"
                                  onClick={() => toast.result(nudgeLearner(row.user.id, item.course.id))}
                                >
                                  <BellRing /> Nudge ({item.progressPct}%)
                                </button>
                              ) : (
                                <span className="mono text-xs faint">Completed</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Onboarding Auto-Assignment Rules Engine (People Ops / L&D Admin) */}
      {caps.manage && (
        <section className="stack" style={{ marginTop: 8 }}>
          <div className="row row--between row--wrap" style={{ gap: 10 }}>
            <div>
              <h2 className="section-title">
                <Rocket size={18} style={{ color: '#818cf8' }} /> Onboarding Auto-Assignment Rules Engine
                <span className="count">{rules.filter((r) => r.enabled).length}/{rules.length} active</span>
              </h2>
              <p className="text-xs muted" style={{ marginTop: 3 }}>
                Declarative rules connecting Talent Hub / HR Portal onboarding phases (`day-1`, `week-1`, `day-30`) to automatic Academy enrollments.
              </p>
            </div>
            <button type="button" className="btn btn--sm" onClick={handleSyncOnboarding}>
              <RefreshCw /> Sync Onboarding Now
            </button>
          </div>

          <div className="ac-rules-grid">
            {rules.map((rule) => {
              const c = courses.find((x) => x.id === rule.courseId);
              const roleNames = rule.roleIds.map((rid) => roles.find((ro) => ro.id === rid)?.name ?? rid);
              return (
                <div key={rule.id} className={cx('ac-rule-card', !rule.enabled && 'is-paused')}>
                  <div className="row row--between" style={{ gap: 8 }}>
                    <div className="row row--wrap" style={{ gap: 6 }}>
                      <span className="badge badge--info">{PHASE_BADGE[rule.phase] ?? rule.phase}</span>
                      <span className="tag">Due +{rule.dueOffsetDays}d</span>
                    </div>
                    <Switch
                      checked={rule.enabled}
                      label={`Toggle auto-assignment for ${c?.title ?? rule.courseId}`}
                      onChange={(next) => {
                        toast.result(toggleOnboardingRule(rule.id, next));
                      }}
                    />
                  </div>

                  <div style={{ fontWeight: 650, fontSize: 14.5, color: 'var(--text)' }}>
                    {c?.title ?? rule.courseId}
                  </div>
                  <p className="text-xs muted">{rule.rationale}</p>

                  <div className="row row--wrap" style={{ gap: 5, marginTop: 'auto', paddingTop: 4 }}>
                    {rule.departments.length === 0 && rule.roleIds.length === 0 ? (
                      <span className="tag">All New Hires</span>
                    ) : (
                      <>
                        {rule.departments.map((d) => (
                          <span key={d} className="tag">
                            Dept: {d}
                          </span>
                        ))}
                        {roleNames.map((rn) => (
                          <span key={rn} className="tag">
                            Role: {rn}
                          </span>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Modal 1: Assign Course Modal */}
      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        width={560}
        title="Assign Training Course"
        subtitle="Notify team members in NEXUS & track completion on your compliance dashboard"
        footer={
          <div className="row row--between" style={{ width: '100%' }}>
            <span className="text-xs muted">{assignUserIds.length} selected</span>
            <div className="row">
              <button type="button" className="btn btn--ghost" onClick={() => setAssignOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn ac-btn-indigo"
                disabled={assignUserIds.length === 0 || !assignCourseId}
                onClick={handleConfirmAssign}
              >
                <Send /> Assign Training
              </button>
            </div>
          </div>
        }
      >
        <div className="stack">
          <div className="field">
            <label className="field-label" htmlFor="ac-assign-course">
              Course
            </label>
            <select
              id="ac-assign-course"
              className="select"
              value={assignCourseId}
              onChange={(e) => setAssignCourseId(e.target.value)}
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({TRACK_META[c.track].short} · {c.durationMins}m)
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <div className="row row--between">
              <span className="field-label">Recipients ({assignUserIds.length})</span>
              <div className="row" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setAssignUserIds(eligiblePickerUsers.map((u) => u.id))}
                >
                  Select all
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAssignUserIds([])}>
                  Clear
                </button>
              </div>
            </div>
            <input
              type="search"
              className="input"
              style={{ height: 36, fontSize: 13 }}
              placeholder="Search team members…"
              value={assignSearch}
              onChange={(e) => setAssignSearch(e.target.value)}
            />
            <div className="ac-picker-list">
              {eligiblePickerUsers.map((u) => {
                const checked = assignUserIds.includes(u.id);
                return (
                  <label key={u.id} className="ac-picker-row">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setAssignUserIds((prev) =>
                          prev.includes(u.id) ? prev.filter((id) => id !== u.id) : [...prev, u.id],
                        )
                      }
                    />
                    <Avatar user={u} size={24} />
                    <span className="grow truncate">
                      <strong>{u.name}</strong> <span className="muted text-xs">· {u.department}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="ac-form-grid-2">
            <div className="field">
              <label className="field-label" htmlFor="ac-assign-due">
                Target Due Date
              </label>
              <input
                id="ac-assign-due"
                type="date"
                className="input"
                value={assignDueDate}
                onChange={(e) => setAssignDueDate(e.target.value)}
              />
              <div className="row" style={{ gap: 6 }}>
                {[7, 14, 30].map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="btn btn--ghost btn--sm"
                    style={{ height: 26, padding: '0 8px', fontSize: 11.5 }}
                    onClick={() => setAssignDueDate(addDaysISO(todayISO(), d))}
                  >
                    +{d}d
                  </button>
                ))}
              </div>
            </div>

            <div className="field" style={{ justifyContent: 'center' }}>
              <span className="field-label">Compliance Requirement</span>
              <div className="row" style={{ gap: 10, marginTop: 4 }}>
                <Switch
                  checked={assignRequired}
                  onChange={setAssignRequired}
                  label="Mark as required training"
                />
                <span className="text-sm">{assignRequired ? 'Required milestone' : 'Optional recommendation'}</span>
              </div>
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="ac-assign-note">
              Personal Manager / L&D Note (optional)
            </label>
            <textarea
              id="ac-assign-note"
              className="textarea"
              rows={2}
              placeholder="e.g., Great prep before taking primary on-call next sprint!"
              value={assignNote}
              onChange={(e) => setAssignNote(e.target.value)}
            />
          </div>
        </div>
      </Modal>

      {/* Modal 2: Course Studio Modal (`Author New Course`) */}
      <Modal
        open={authorOpen}
        onClose={() => setAuthorOpen(false)}
        width={680}
        title="Course Studio — Publish Interactive Course"
        subtitle="Author a new micro-learning module + graded certification quiz live to Helix Academy"
        footer={
          <div className="row row--between" style={{ width: '100%' }}>
            <span className="text-xs muted">Awards +{Math.max(100, Math.round((newDuration || 20) * 10))} XP upon certification</span>
            <div className="row">
              <button type="button" className="btn btn--ghost" onClick={() => setAuthorOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn ac-btn-indigo" onClick={handleCreateCourse}>
                <Sparkles /> Publish Course
              </button>
            </div>
          </div>
        }
      >
        <div className="stack">
          <div className="ac-form-grid-2">
            <div className="field">
              <label className="field-label" htmlFor="ac-new-title">
                Course Title *
              </label>
              <input
                id="ac-new-title"
                className="input"
                placeholder="e.g., Agentic Incident Triage with Gemini"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="ac-new-tagline">
                Short Tagline *
              </label>
              <input
                id="ac-new-tagline"
                className="input"
                placeholder="One-line value proposition for learners"
                value={newTagline}
                onChange={(e) => setNewTagline(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="ac-new-desc">
              Course Overview
            </label>
            <textarea
              id="ac-new-desc"
              className="textarea"
              rows={2}
              placeholder="What skills and real-world decisions will learners master?"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </div>

          <div className="ac-form-grid-3">
            <div className="field">
              <label className="field-label" htmlFor="ac-new-track">
                Track
              </label>
              <select
                id="ac-new-track"
                className="select"
                value={newTrack}
                onChange={(e) => setNewTrack(e.target.value as AcademyTrack)}
              >
                {TRACK_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {TRACK_META[t].label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="ac-new-level">
                Level
              </label>
              <select
                id="ac-new-level"
                className="select"
                value={newLevel}
                onChange={(e) => setNewLevel(e.target.value as CourseLevel)}
              >
                {(Object.keys(LEVEL_META) as CourseLevel[]).map((lv) => (
                  <option key={lv} value={lv}>
                    {LEVEL_META[lv].label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="ac-new-format">
                Format
              </label>
              <select
                id="ac-new-format"
                className="select"
                value={newFormat}
                onChange={(e) => setNewFormat(e.target.value as CourseFormat)}
              >
                {(Object.keys(FORMAT_LABEL) as CourseFormat[]).map((f) => (
                  <option key={f} value={f}>
                    {FORMAT_LABEL[f]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="ac-form-grid-2">
            <div className="field">
              <label className="field-label" htmlFor="ac-new-mins">
                Duration (mins)
              </label>
              <input
                id="ac-new-mins"
                type="number"
                min={5}
                max={180}
                className="input"
                value={newDuration}
                onChange={(e) => setNewDuration(Number(e.target.value) || 15)}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="ac-new-skills">
                Endorsed Skills (comma-separated)
              </label>
              <input
                id="ac-new-skills"
                className="input"
                value={newSkills}
                onChange={(e) => setNewSkills(e.target.value)}
              />
            </div>
          </div>

          <div className="row row--between row--wrap" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 10 }}>
              <Switch checked={newMandatory} onChange={setNewMandatory} label="Universal annual compliance" />
              <span className="text-sm">Universal Annual Compliance (365-day recertification)</span>
            </div>
          </div>

          {wikiArticles.length > 0 && (
            <div className="field">
              <span className="field-label">Companion Knowledge Base Playbooks (optional)</span>
              <div className="chips">
                {wikiArticles.slice(0, 8).map((art) => {
                  const active = newCompanions.includes(art.slug);
                  return (
                    <button
                      key={art.slug}
                      type="button"
                      className={cx('chip', active && 'is-active')}
                      style={{ height: 30, fontSize: 12 }}
                      onClick={() =>
                        setNewCompanions((prev) =>
                          prev.includes(art.slug) ? prev.filter((s) => s !== art.slug) : [...prev, art.slug],
                        )
                      }
                    >
                      {art.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <hr className="divider" style={{ margin: '4px 0' }} />

          <div className="ac-form-grid-2">
            <div className="field">
              <label className="field-label" htmlFor="ac-lesson-title">
                Lesson 1 Title
              </label>
              <input
                id="ac-lesson-title"
                className="input"
                value={newLessonTitle}
                onChange={(e) => setNewLessonTitle(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="ac-lesson-sum">
                Lesson Summary
              </label>
              <input
                id="ac-lesson-sum"
                className="input"
                placeholder="Key outcome of this lesson"
                value={newLessonSummary}
                onChange={(e) => setNewLessonSummary(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="ac-lesson-body">
              Lesson Content * (separate paragraphs with a blank line)
            </label>
            <textarea
              id="ac-lesson-body"
              className="textarea"
              rows={3}
              placeholder="Write clear, actionable Helix guidance (at least 20 characters)…"
              value={newLessonBody}
              onChange={(e) => setNewLessonBody(e.target.value)}
            />
          </div>

          <hr className="divider" style={{ margin: '4px 0' }} />

          <div className="field">
            <label className="field-label" htmlFor="ac-quiz-prompt">
              Certification Quiz Question *
            </label>
            <input
              id="ac-quiz-prompt"
              className="input"
              placeholder="Ask a scenario-based verification question…"
              value={newQuizPrompt}
              onChange={(e) => setNewQuizPrompt(e.target.value)}
            />
          </div>

          <div className="stack stack--sm">
            <span className="field-label">Answer Options (select the radio button for the correct answer) *</span>
            {newQuizOpts.map((opt, idx) => (
              <div key={idx} className="row" style={{ gap: 8 }}>
                <input
                  type="radio"
                  name="ac-correct-opt"
                  checked={newQuizCorrect === idx}
                  onChange={() => setNewQuizCorrect(idx)}
                  aria-label={`Mark option ${idx + 1} as correct`}
                />
                <input
                  className="input"
                  style={{ height: 36 }}
                  placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                  value={opt}
                  onChange={(e) =>
                    setNewQuizOpts((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))
                  }
                />
              </div>
            ))}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="ac-quiz-exp">
              Coaching Explanation
            </label>
            <input
              id="ac-quiz-exp"
              className="input"
              placeholder="Explain why the correct answer protects or empowers the team"
              value={newQuizExplanation}
              onChange={(e) => setNewQuizExplanation(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
