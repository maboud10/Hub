import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Code2,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  FlaskConical,
  HelpCircle,
  Lightbulb,
  Mail,
  MessageSquare,
  NotebookPen,
  Play,
  RotateCcw,
  Save,
  ShieldAlert,
  Sparkles,
  Zap,
} from 'lucide-react';
import { FORMAT_LABEL, LEVEL_META } from '@/academy/constants';
import { enrollmentProgressPct } from '@/academy/selectors';
import { useAcademy, type QuizSubmissionResult } from '@/academy/store';
import type { ConceptLesson, LessonBlock, ScenarioLesson } from '@/academy/types';
import { useWiki } from '@/wiki/store';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { Avatar, EmptyState } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { CertificateModal, ProgressRing, SourceBadge, TrackBadge } from './shared';

function CalloutIcon({ tone }: { tone: 'tip' | 'warning' | 'policy' | 'insight' }) {
  if (tone === 'tip') return <CheckCircle2 />;
  if (tone === 'warning') return <AlertTriangle />;
  if (tone === 'policy') return <ShieldAlert />;
  return <Lightbulb />;
}

function ArtifactIcon({ kind }: { kind: 'message' | 'email' | 'code' | 'document' }) {
  if (kind === 'message') return <MessageSquare />;
  if (kind === 'email') return <Mail />;
  if (kind === 'code') return <Code2 />;
  return <FileText />;
}

function FlashcheckCard({ question, answer }: { question: string; answer: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="ac-flashcheck">
      <div className="row row--between row--wrap" style={{ gap: 8 }}>
        <span className="eyebrow" style={{ marginBottom: 0 }}>
          <Sparkles size={13} /> Check Your Intuition
        </span>
        <button type="button" className="btn btn--sm" onClick={() => setRevealed((v) => !v)}>
          <Eye /> {revealed ? 'Hide Answer' : 'Reveal Answer'}
        </button>
      </div>
      <div style={{ fontWeight: 600, fontSize: 14.5, color: 'var(--text)', lineHeight: 1.5 }}>{question}</div>
      {revealed && (
        <div className="ac-flashcheck__answer">
          <strong style={{ color: 'var(--success)' }}>Recommended move: </strong>
          {answer}
        </div>
      )}
    </div>
  );
}

function LessonBlockRenderer({ block }: { block: LessonBlock }) {
  const [copied, setCopied] = useState(false);

  if (block.kind === 'paragraph') {
    return (
      <div>
        {block.heading && <h4 className="ac-block-h">{block.heading}</h4>}
        <p className="ac-block-p">{block.text}</p>
      </div>
    );
  }

  if (block.kind === 'bullets') {
    return (
      <div>
        {block.heading && <h4 className="ac-block-h">{block.heading}</h4>}
        <ul className="ac-bullets">
          {block.items.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (block.kind === 'callout') {
    return (
      <div className={`ac-callout ac-callout--${block.tone}`}>
        <CalloutIcon tone={block.tone} />
        <div className="grow">
          <div style={{ fontWeight: 650, fontSize: 14, color: 'var(--text)', marginBottom: 3 }}>{block.title}</div>
          <p className="text-sm muted" style={{ lineHeight: 1.55 }}>
            {block.text}
          </p>
        </div>
      </div>
    );
  }

  if (block.kind === 'code') {
    const copyCode = () => {
      void navigator.clipboard?.writeText(block.code);
      setCopied(true);
      toast.info('Copied snippet to clipboard');
      window.setTimeout(() => setCopied(false), 1800);
    };
    return (
      <div className="ac-code-box">
        <div className="ac-code-box__head">
          <span>{block.label}</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={copyCode}>
            {copied ? <Check /> : <Copy />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre>
          <code>{block.code}</code>
        </pre>
      </div>
    );
  }

  return <FlashcheckCard question={block.question} answer={block.answer} />;
}

export function CoursePlayer() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const me = useSessionUser();
  const users = useHub((s) => s.users);

  const courses = useAcademy((s) => s.courses);
  const enrollments = useAcademy((s) => s.enrollments);
  const certificates = useAcademy((s) => s.certificates);
  const enrol = useAcademy((s) => s.enrol);
  const setLastLesson = useAcademy((s) => s.setLastLesson);
  const completeLesson = useAcademy((s) => s.completeLesson);
  const answerScenario = useAcademy((s) => s.answerScenario);
  const saveLessonNote = useAcademy((s) => s.saveLessonNote);
  const submitQuiz = useAcademy((s) => s.submitQuiz);

  const wikiArticles = useWiki((s) => s.articles);

  const course = courses.find((c) => c.id === courseId || c.slug === courseId);
  const enrollment = useMemo(
    () => (course && me ? enrollments.find((e) => e.userId === me.id && e.courseId === course.id) : undefined),
    [course, me, enrollments],
  );
  const existingCert = useMemo(
    () => (course && me ? certificates.find((c) => c.userId === me.id && c.courseId === course.id) : undefined),
    [course, me, certificates],
  );

  // Active stage: lesson.id or 'quiz'
  const [activeStage, setActiveStage] = useState<string>('');
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [quizResult, setQuizResult] = useState<QuizSubmissionResult | null>(null);
  const [notesOpen, setNotesOpen] = useState<boolean>(true);
  const [noteDraft, setNoteDraft] = useState<string>('');
  const [noteDirty, setNoteDirty] = useState<boolean>(false);
  const [modalCertOpen, setModalCertOpen] = useState<boolean>(false);

  // Initialize stage when course changes
  useEffect(() => {
    if (!course) return;
    const allLessonsDone =
      enrollment && course.lessons.length > 0 && course.lessons.every((l) => enrollment.completedLessonIds.includes(l.id));
    if (allLessonsDone && enrollment?.status !== 'completed' && course.quiz.length > 0) {
      setActiveStage('quiz');
    } else if (enrollment?.lastLessonId && course.lessons.some((l) => l.id === enrollment.lastLessonId)) {
      setActiveStage(enrollment.lastLessonId);
    } else {
      setActiveStage(course.lessons[0]?.id ?? 'quiz');
    }
    setQuizAnswers(new Array(course.quiz.length).fill(-1));
    setQuizResult(null);
  }, [course?.id]);

  // Sync study note draft whenever activeStage or saved note changes
  const noteKey = activeStage || 'general';
  const savedNote = enrollment?.notes?.[noteKey] ?? '';
  useEffect(() => {
    setNoteDraft(savedNote);
    setNoteDirty(false);
  }, [course?.id, noteKey, savedNote]);

  const companionPlaybooks = useMemo(() => {
    if (!course) return [];
    return course.companionSlugs.map((slug) => {
      const article = wikiArticles.find((a) => a.slug === slug);
      return {
        slug,
        title: article?.title ?? slug.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
        subtitle: article?.tldr ?? article?.subtitle ?? 'Canonical Knowledge Base playbook',
        readMins: article?.readMins ?? 4,
      };
    });
  }, [course, wikiArticles]);

  if (!course) {
    return (
      <EmptyState
        icon={<BookOpen />}
        title="Course not found"
        action={
          <Link to="/academy/catalog" className="btn ac-btn-indigo">
            <ArrowLeft /> Back to Catalog
          </Link>
        }
      >
        That course ID does not exist in Helix Academy or may have been moved.
      </EmptyState>
    );
  }

  const instructor = users.find((u) => u.id === course.instructorId);
  const levelMeta = LEVEL_META[course.level];
  const progressPct = enrollmentProgressPct(course, enrollment);
  const currentLessonIndex = course.lessons.findIndex((l) => l.id === activeStage);
  const currentLesson = currentLessonIndex >= 0 ? course.lessons[currentLessonIndex] : undefined;

  const selectStage = (stageId: string) => {
    setActiveStage(stageId);
    if (stageId !== 'quiz' && enrollment) {
      setLastLesson(course.id, stageId);
    }
  };

  const advanceAfterLesson = (lessonId: string) => {
    const idx = course.lessons.findIndex((l) => l.id === lessonId);
    if (idx >= 0 && idx + 1 < course.lessons.length) {
      const next = course.lessons[idx + 1];
      setActiveStage(next.id);
      setLastLesson(course.id, next.id);
    } else if (course.quiz.length > 0) {
      setActiveStage('quiz');
    }
  };

  const handleCompleteConcept = (lesson: ConceptLesson) => {
    const res = completeLesson(course.id, lesson.id);
    if (toast.result(res, 'Lesson completed')) {
      advanceAfterLesson(lesson.id);
    }
  };

  const handleSelectScenarioChoice = (lesson: ScenarioLesson, choiceId: string) => {
    const res = answerScenario(course.id, lesson.id, choiceId);
    if (!res.ok) {
      toast.error(res.error);
    } else if (res.optimal) {
      toast.success('Optimal decision! Scenario lab completed.');
    }
  };

  const handleSaveNote = () => {
    const res = saveLessonNote(course.id, noteKey, noteDraft);
    if (toast.result(res, 'Saved study note')) {
      setNoteDirty(false);
    }
  };

  const handleSubmitQuiz = () => {
    const res = submitQuiz(course.id, quizAnswers);
    if (!res.ok) {
      toast.error(res.error ?? 'Unable to submit quiz');
      return;
    }
    setQuizResult(res);
    if (res.passed) {
      toast.success(
        `Passed with ${res.score}%! Earned +${course.xp} XP`,
        res.syncedOnboarding ? `Synced HR Onboarding: ${res.syncedOnboarding.taskTitle}` : 'Digital credential unlocked!',
      );
    } else {
      toast.warning(`Scored ${res.score}% (${course.passScore}% needed)`, 'Review the explanations below and retry anytime.');
    }
  };

  const handleEnrolNow = () => {
    const res = enrol(course.id);
    toast.result(res, `Enrolled in ${course.title}`);
  };

  const selectedScenarioChoiceId = currentLesson?.kind === 'scenario' ? enrollment?.scenarioAnswers?.[currentLesson.id] : undefined;
  const selectedScenarioChoice =
    currentLesson?.kind === 'scenario' && selectedScenarioChoiceId
      ? currentLesson.choices.find((c) => c.id === selectedScenarioChoiceId)
      : undefined;

  return (
    <div className="stack stack--lg">
      {/* Top Course Banner */}
      <div className="ac-player-top" style={{ '--th': course.hue } as CSSProperties}>
        <div className="stack stack--sm" style={{ flex: '1 1 480px', minWidth: 0 }}>
          <div className="row row--wrap" style={{ gap: 8 }}>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate('/academy')}>
              <ArrowLeft /> My Learning
            </button>
            <TrackBadge track={course.track} />
            <span className={`badge badge--${levelMeta.badgeTone}`}>{levelMeta.label}</span>
            <span className="tag">{FORMAT_LABEL[course.format]}</span>
            {course.mandatory && <span className="badge badge--warning">Annual Compliance</span>}
            {enrollment && <SourceBadge source={enrollment.source} />}
          </div>

          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(20px, 2.6vw, 26px)', fontWeight: 700, marginTop: 4 }}>
            {course.title}
          </h2>
          <p className="text-sm muted" style={{ maxWidth: '72ch' }}>
            {course.description}
          </p>

          <div className="row row--wrap" style={{ gap: 14, marginTop: 4 }}>
            {instructor && (
              <div className="row" style={{ gap: 8 }}>
                <Avatar user={instructor} size={26} />
                <span className="text-xs muted">
                  Taught by <strong style={{ color: 'var(--text)' }}>{instructor.name}</strong> ({instructor.title})
                </span>
              </div>
            )}
            <span className="text-xs muted mono">
              <Clock size={13} style={{ verticalAlign: '-2px' }} /> {course.durationMins} mins · +{course.xp} XP · Pass {course.passScore}%
            </span>
          </div>
        </div>

        <div className="row row--wrap" style={{ gap: 12, alignItems: 'center' }}>
          <ProgressRing pct={progressPct} hue={course.hue} size={58} />
          {!enrollment ? (
            <button type="button" className="btn ac-btn-indigo" onClick={handleEnrolNow}>
              <Play /> Enrol & Start
            </button>
          ) : existingCert ? (
            <button type="button" className="btn btn--success" onClick={() => setModalCertOpen(true)}>
              <Award /> View Certificate
            </button>
          ) : null}
        </div>
      </div>

      {/* Main Split: Curriculum Rail + Interactive Stage */}
      <div className="ac-player-layout">
        {/* Left/Top Curriculum Rail */}
        <aside className="ac-player-rail">
          <div className="card card--tight stack stack--sm">
            <div className="row row--between">
              <span className="text-xs mono faint" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Course Curriculum
              </span>
              <span className="mono text-xs muted">{progressPct}%</span>
            </div>
            <div className="ac-bar" style={{ '--th': course.hue } as CSSProperties}>
              <i style={{ width: `${progressPct}%` }} />
            </div>

            <div className="ac-stage-list" style={{ marginTop: 6 }}>
              {course.lessons.map((lesson, idx) => {
                const isDone = enrollment?.completedLessonIds.includes(lesson.id) ?? false;
                const isActive = activeStage === lesson.id;
                return (
                  <button
                    key={lesson.id}
                    type="button"
                    className={cx('ac-stage-btn', isActive && 'is-active', isDone && 'is-done')}
                    onClick={() => selectStage(lesson.id)}
                  >
                    <span className="ac-stage-btn__icon">
                      {isDone ? <Check /> : lesson.kind === 'scenario' ? <FlaskConical /> : idx + 1}
                    </span>
                    <div className="grow">
                      <div className="ac-stage-btn__title">{lesson.title}</div>
                      <div className="ac-stage-btn__sub">
                        {lesson.kind === 'scenario' ? 'Scenario Lab' : 'Concept Lesson'} · {lesson.durationMins}m
                      </div>
                    </div>
                  </button>
                );
              })}

              {course.quiz.length > 0 && (
                <button
                  type="button"
                  className={cx(
                    'ac-stage-btn',
                    activeStage === 'quiz' && 'is-active',
                    enrollment?.status === 'completed' && 'is-done',
                  )}
                  onClick={() => selectStage('quiz')}
                >
                  <span className="ac-stage-btn__icon">
                    {enrollment?.status === 'completed' ? <Check /> : <ClipboardCheck />}
                  </span>
                  <div className="grow">
                    <div className="ac-stage-btn__title">Certification Assessment</div>
                    <div className="ac-stage-btn__sub">
                      {course.quiz.length} questions · Pass {course.passScore}% · +{course.xp} XP
                    </div>
                  </div>
                </button>
              )}
            </div>
          </div>

          {/* Companion Knowledge Base Playbooks */}
          {companionPlaybooks.length > 0 && (
            <div className="card card--tight stack stack--sm">
              <div className="row" style={{ gap: 7 }}>
                <BookOpen size={15} style={{ color: '#818cf8' }} />
                <span style={{ fontWeight: 650, fontSize: 13.5 }}>Companion Playbooks</span>
              </div>
              <p className="text-xs muted">Reference guides in Helix Knowledge Base linked to this curriculum:</p>
              <div className="stack stack--sm">
                {companionPlaybooks.map((pb) => (
                  <Link key={pb.slug} to={`/wiki/doc/${pb.slug}`} className="ac-playbook-link">
                    <FileText size={16} style={{ color: '#818cf8', flex: 'none', marginTop: 2 }} />
                    <div className="grow">
                      <div className="text-sm" style={{ fontWeight: 600, color: 'var(--text)' }}>
                        {pb.title}
                      </div>
                      <div className="text-xs muted clamp-2">{pb.subtitle}</div>
                      <div className="mono text-xs faint" style={{ marginTop: 3 }}>
                        {pb.readMins} min read →
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Main Interactive Stage */}
        <div className="stack" style={{ minWidth: 0 }}>
          {/* STAGE A: Concept Lesson */}
          {currentLesson?.kind === 'concept' && (
            <article className="card ac-lesson-card">
              <div className="stack stack--sm">
                <div className="row row--between row--wrap">
                  <span className="eyebrow" style={{ marginBottom: 0 }}>
                    Lesson {currentLessonIndex + 1} of {course.lessons.length} · Concept Studio · {currentLesson.durationMins} mins
                  </span>
                  {enrollment?.completedLessonIds.includes(currentLesson.id) && (
                    <span className="badge badge--success">
                      <Check /> Completed
                    </span>
                  )}
                </div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(19px, 2.3vw, 23px)', fontWeight: 700 }}>
                  {currentLesson.title}
                </h3>
                <p className="text-sm muted">{currentLesson.summary}</p>
              </div>

              <hr className="divider" style={{ margin: 0 }} />

              <div className="stack" style={{ gap: 18 }}>
                {currentLesson.blocks.map((block, bIdx) => (
                  <LessonBlockRenderer key={bIdx} block={block} />
                ))}
              </div>

              {currentLesson.keyTakeaways.length > 0 && (
                <div className="ac-takeaways">
                  <div className="row" style={{ gap: 7, marginBottom: 8 }}>
                    <Zap size={15} style={{ color: '#818cf8' }} />
                    <strong style={{ fontSize: 13.5 }}>Key Takeaways</strong>
                  </div>
                  <ul className="ac-bullets">
                    {currentLesson.keyTakeaways.map((kt, idx) => (
                      <li key={idx}>{kt}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="row row--between row--wrap" style={{ paddingTop: 6 }}>
                {currentLessonIndex > 0 ? (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => selectStage(course.lessons[currentLessonIndex - 1].id)}
                  >
                    <ArrowLeft /> Previous Lesson
                  </button>
                ) : (
                  <span />
                )}
                <button type="button" className="btn ac-btn-indigo" onClick={() => handleCompleteConcept(currentLesson)}>
                  Mark Lesson Complete & Next <ArrowRight />
                </button>
              </div>
            </article>
          )}

          {/* STAGE B: Workplace Scenario Simulator */}
          {currentLesson?.kind === 'scenario' && (
            <article className="card ac-lesson-card">
              <div className="stack stack--sm">
                <div className="row row--between row--wrap">
                  <span className="eyebrow" style={{ marginBottom: 0 }}>
                    <FlaskConical size={13} /> Lesson {currentLessonIndex + 1} of {course.lessons.length} · Workplace Scenario Simulator
                  </span>
                  {enrollment?.completedLessonIds.includes(currentLesson.id) && (
                    <span className="badge badge--success">
                      <Check /> Optimal Move Mastered
                    </span>
                  )}
                </div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(19px, 2.3vw, 23px)', fontWeight: 700 }}>
                  {currentLesson.title}
                </h3>
                <p className="text-sm muted">{currentLesson.summary}</p>
              </div>

              <div className="ac-sim-frame hud">
                <div className="row row--between row--wrap">
                  <span className="tag">Simulation Context · {currentLesson.contextLabel}</span>
                  <span className="text-xs muted">Choose a response to inspect real-world blast radius & coaching</span>
                </div>

                {currentLesson.artifact && (
                  <div className={cx('ac-artifact', currentLesson.artifact.kind === 'code' && 'ac-artifact--code')}>
                    <div className="ac-artifact__bar">
                      <ArtifactIcon kind={currentLesson.artifact.kind} />
                      <span>{currentLesson.artifact.header}</span>
                    </div>
                    <div className="ac-artifact__body">{currentLesson.artifact.body}</div>
                  </div>
                )}

                <div style={{ fontWeight: 650, fontSize: 15, color: 'var(--text)', lineHeight: 1.45 }}>
                  {currentLesson.prompt}
                </div>

                <div className="ac-choices">
                  {currentLesson.choices.map((choice, cIdx) => {
                    const isPicked = selectedScenarioChoiceId === choice.id;
                    const letter = String.fromCharCode(65 + cIdx);
                    return (
                      <button
                        key={choice.id}
                        type="button"
                        className={cx(
                          'ac-choice',
                          isPicked && choice.optimal && 'is-optimal',
                          isPicked && !choice.optimal && 'is-suboptimal',
                        )}
                        onClick={() => handleSelectScenarioChoice(currentLesson, choice.id)}
                      >
                        <span className="ac-choice__key">{letter}</span>
                        <span className="grow">{choice.label}</span>
                      </button>
                    );
                  })}
                </div>

                {selectedScenarioChoice && (
                  <div className={cx('ac-coaching', selectedScenarioChoice.optimal ? 'ac-coaching--optimal' : 'ac-coaching--retry')}>
                    <div className="row row--wrap" style={{ gap: 8 }}>
                      <span className={cx('badge', selectedScenarioChoice.optimal ? 'badge--success' : 'badge--warning')}>
                        {selectedScenarioChoice.optimal ? <CheckCircle2 /> : <AlertTriangle />}
                        {selectedScenarioChoice.optimal ? 'Optimal Response' : 'Suboptimal — Try Another Move'}
                      </span>
                      <span className="text-xs mono" style={{ fontWeight: 600, color: 'var(--text)' }}>
                        Impact: {selectedScenarioChoice.impact}
                      </span>
                    </div>
                    <p className="text-sm" style={{ color: 'var(--text)', lineHeight: 1.55 }}>
                      {selectedScenarioChoice.feedback}
                    </p>
                  </div>
                )}
              </div>

              <div className="row row--between row--wrap">
                {currentLessonIndex > 0 ? (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => selectStage(course.lessons[currentLessonIndex - 1].id)}
                  >
                    <ArrowLeft /> Previous Lesson
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  className="btn ac-btn-indigo"
                  disabled={!enrollment?.completedLessonIds.includes(currentLesson.id)}
                  onClick={() => advanceAfterLesson(currentLesson.id)}
                >
                  {course.lessons[currentLessonIndex + 1] ? 'Next Lesson' : 'Proceed to Certification Quiz'} <ArrowRight />
                </button>
              </div>
            </article>
          )}

          {/* STAGE C: Graded Certification Quiz */}
          {activeStage === 'quiz' && (
            <article className="card ac-lesson-card">
              <div className="row row--between row--wrap" style={{ gap: 12 }}>
                <div className="stack stack--sm">
                  <span className="eyebrow" style={{ marginBottom: 0 }}>
                    <ClipboardCheck size={13} /> Final Stage · Graded Certification Assessment
                  </span>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(19px, 2.3vw, 23px)', fontWeight: 700 }}>
                    Verify Mastery & Unlock Credential
                  </h3>
                  <p className="text-sm muted">
                    Score at least <strong>{course.passScore}%</strong> across {course.quiz.length} questions to earn{' '}
                    <strong>+{course.xp} XP</strong>, endorse your directory skills, and issue your verifiable certificate.
                  </p>
                </div>
                {enrollment?.bestQuizScore !== undefined && (
                  <span className="badge badge--info">
                    Best Score: {enrollment.bestQuizScore}% ({enrollment.attempts} {enrollment.attempts === 1 ? 'attempt' : 'attempts'})
                  </span>
                )}
              </div>

              {/* Celebratory Credential Unlocked Banner */}
              {(quizResult?.passed || existingCert) && (
                <div className="ac-unlock-banner">
                  <div className="row row--between row--wrap" style={{ gap: 14 }}>
                    <div className="row" style={{ gap: 14, minWidth: 0 }}>
                      <ProgressRing pct={quizResult?.score ?? existingCert?.score ?? 100} hue={150} size={64} />
                      <div className="grow">
                        <div className="eyebrow" style={{ color: 'var(--success)', marginBottom: 4 }}>
                          Credential Unlocked · +{course.xp} XP Earned
                        </div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 700 }}>
                          {course.title} — Certified!
                        </div>
                        {existingCert && (
                          <div className="mono text-xs muted" style={{ marginTop: 2 }}>
                            {existingCert.credentialCode} · Hash {existingCert.verificationHash}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="row row--wrap" style={{ gap: 8 }}>
                      {existingCert && (
                        <button type="button" className="btn ac-btn-indigo btn--sm" onClick={() => setModalCertOpen(true)}>
                          <Award /> View Certificate
                        </button>
                      )}
                      <Link to="/academy/certificates" className="btn btn--sm">
                        Certificates Vault <ArrowRight />
                      </Link>
                    </div>
                  </div>

                  {/* Endorsed Skills */}
                  <div className="row row--wrap" style={{ gap: 6 }}>
                    <span className="text-xs muted">Endorsed on your NEXUS profile:</span>
                    {course.skills.map((sk) => (
                      <span key={sk} className="badge badge--success">
                        <Check /> {sk}
                      </span>
                    ))}
                  </div>

                  {/* Live HR Portal Onboarding Sync Callout */}
                  {quizResult?.syncedOnboarding && (
                    <div className="ac-onb-sync-callout">
                      <div className="row" style={{ gap: 10, minWidth: 0 }}>
                        <Sparkles size={18} style={{ color: 'var(--success)', flex: 'none' }} />
                        <div className="grow">
                          <div style={{ fontWeight: 650, fontSize: 13.5, color: 'var(--text)' }}>
                            Synced with HR Portal Onboarding — task marked complete!
                          </div>
                          <div className="text-xs muted">
                            Auto-completed milestone: <strong>{quizResult.syncedOnboarding.taskTitle}</strong>
                          </div>
                        </div>
                      </div>
                      <Link to={`/hr/onboarding/${quizResult.syncedOnboarding.journeyId}`} className="btn btn--sm btn--success">
                        View Onboarding Journey <ExternalLink size={13} />
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {/* Retry banner when below passScore */}
              {quizResult && !quizResult.passed && (
                <div className="ac-coaching ac-coaching--retry">
                  <div className="row row--between row--wrap" style={{ gap: 12 }}>
                    <div className="row" style={{ gap: 12 }}>
                      <ProgressRing pct={quizResult.score ?? 0} hue={38} size={56} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>
                          Scored {quizResult.score}% ({quizResult.correctCount}/{quizResult.total} correct) — {course.passScore}% required
                        </div>
                        <p className="text-xs muted">
                          Review the per-question explanations below, adjust your selections, and submit again.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => {
                        setQuizResult(null);
                        setQuizAnswers(new Array(course.quiz.length).fill(-1));
                      }}
                    >
                      <RotateCcw /> Reset Answers
                    </button>
                  </div>
                </div>
              )}

              {/* Questions List */}
              <div className="stack" style={{ gap: 14 }}>
                {course.quiz.map((q, qIdx) => {
                  const chosen = quizAnswers[qIdx] ?? -1;
                  const showReview = !!quizResult;
                  return (
                    <div key={q.id} className="ac-quiz-q">
                      <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                        <span className="badge badge--muted mono">Q{qIdx + 1}</span>
                        <div style={{ fontWeight: 650, fontSize: 14.5, lineHeight: 1.45, color: 'var(--text)' }}>
                          {q.prompt}
                        </div>
                      </div>

                      <div className="stack stack--sm">
                        {q.options.map((opt, oIdx) => {
                          const isSelected = chosen === oIdx;
                          const isCorrect = showReview && oIdx === q.correctIndex;
                          const isWrong = showReview && isSelected && oIdx !== q.correctIndex;

                          return (
                            <button
                              key={oIdx}
                              type="button"
                              className={cx(
                                'ac-quiz-opt',
                                isSelected && !showReview && 'is-selected',
                                isCorrect && 'is-correct',
                                isWrong && 'is-wrong',
                              )}
                              onClick={() => {
                                if (quizResult?.passed) return;
                                setQuizResult(null);
                                setQuizAnswers((prev) => {
                                  const next = [...prev];
                                  next[qIdx] = oIdx;
                                  return next;
                                });
                              }}
                            >
                              <span className="ac-choice__key">{String.fromCharCode(65 + oIdx)}</span>
                              <span className="grow">{opt}</span>
                              {isCorrect && <CheckCircle2 size={16} style={{ color: 'var(--success)', flex: 'none' }} />}
                            </button>
                          );
                        })}
                      </div>

                      {showReview && (
                        <div className="text-xs muted" style={{ padding: '8px 11px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                          <strong style={{ color: chosen === q.correctIndex ? 'var(--success)' : 'var(--warning)' }}>
                            {chosen === q.correctIndex ? 'Correct · ' : 'Explanation · '}
                          </strong>
                          {q.explanation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="row row--between row--wrap">
                {course.lessons.length > 0 ? (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => selectStage(course.lessons[course.lessons.length - 1].id)}
                  >
                    <ArrowLeft /> Back to Lessons
                  </button>
                ) : (
                  <span />
                )}

                <div className="row" style={{ gap: 10 }}>
                  {quizResult?.passed && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setQuizResult(null);
                        setQuizAnswers(new Array(course.quiz.length).fill(-1));
                      }}
                    >
                      <RotateCcw /> Retake Quiz
                    </button>
                  )}
                  {!quizResult?.passed && (
                    <button
                      type="button"
                      className="btn ac-btn-indigo"
                      disabled={quizAnswers.some((a) => a < 0)}
                      onClick={handleSubmitQuiz}
                    >
                      <Award /> Submit Certification Assessment
                    </button>
                  )}
                </div>
              </div>
            </article>
          )}

          {/* Personal Study Notes Pad */}
          <section className="card card--tight stack stack--sm">
            <div className="row row--between row--wrap">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                style={{ paddingLeft: 6 }}
                onClick={() => setNotesOpen((v) => !v)}
              >
                <NotebookPen size={15} style={{ color: '#818cf8' }} />
                <strong>My Personal Study Notes</strong>
                <span className="text-xs muted">
                  ({activeStage === 'quiz' ? 'Assessment prep' : currentLesson?.title ?? 'Lesson'})
                </span>
              </button>
              <div className="row" style={{ gap: 8 }}>
                {noteDirty && <span className="text-xs warning">Unsaved changes</span>}
                {notesOpen && (
                  <button type="button" className="btn btn--sm" onClick={handleSaveNote}>
                    <Save /> Save Note
                  </button>
                )}
              </div>
            </div>

            {notesOpen && (
              <textarea
                className="textarea"
                rows={3}
                placeholder="Jot down takeaways, prompts, or action items for your team (private to your Academy profile)…"
                value={noteDraft}
                onChange={(e) => {
                  setNoteDraft(e.target.value);
                  setNoteDirty(true);
                }}
              />
            )}

            {!notesOpen && savedNote && (
              <p className="text-xs muted truncate" style={{ paddingLeft: 6 }}>
                Saved: “{savedNote}”
              </p>
            )}
          </section>

          {/* Helpful hint for unenrolled viewers */}
          {!enrollment && (
            <div className="row" style={{ gap: 8, fontSize: 12.5, color: 'var(--text-3)', paddingLeft: 4 }}>
              <HelpCircle size={14} /> Completing any lesson, scenario lab, or saving a note automatically enrols you in this course.
            </div>
          )}
        </div>
      </div>

      {/* Printable Official Certificate Modal */}
      <CertificateModal
        certificate={modalCertOpen ? existingCert ?? null : null}
        course={course}
        onClose={() => setModalCertOpen(false)}
      />
    </div>
  );
}
