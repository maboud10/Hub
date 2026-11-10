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
import { NeoEmpty, NeoPanel, NeoTabs } from '@/components/neo';
import { FORMAT_LABEL, LEVEL_META } from '@/academy/constants';
import { enrollmentProgressPct } from '@/academy/selectors';
import { useAcademy, type QuizSubmissionResult } from '@/academy/store';
import type { ConceptLesson, LessonBlock, ScenarioLesson } from '@/academy/types';
import { useWiki } from '@/wiki/store';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { Avatar } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { LEVEL_TONE, ProgressRing, SourceBadge, TrackBadge, useCertParam } from './shared';

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
        <span className="neo-hud" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={13} /> Check your intuition
        </span>
        <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={() => setRevealed((v) => !v)}>
          <Eye /> {revealed ? 'Hide answer' : 'Reveal answer'}
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
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={copyCode}>
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
  const { open: openCert } = useCertParam();

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
      <NeoPanel hud="Course studio" title="Course not found">
        <NeoEmpty
          icon={<BookOpen />}
          title="Course not found"
          action={
            <Link to="/academy/catalog" className="neo-btn neo-btn--plasma neo-btn--sm">
              <ArrowLeft /> Back to catalog
            </Link>
          }
        >
          That course ID does not exist in Helix Academy or may have been moved.
        </NeoEmpty>
      </NeoPanel>
    );
  }

  const instructor = users.find((u) => u.id === course.instructorId);
  const levelMeta = LEVEL_META[course.level];
  const progressPct = enrollmentProgressPct(course, enrollment);
  const currentLessonIndex = course.lessons.findIndex((l) => l.id === activeStage);
  const currentLesson = currentLessonIndex >= 0 ? course.lessons[currentLessonIndex] : undefined;
  const totalStages = course.lessons.length + (course.quiz.length ? 1 : 0);
  const completedStages =
    (enrollment?.completedLessonIds.length ?? 0) + (enrollment?.status === 'completed' ? 1 : 0);

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

  const stageTabItems = [
    ...course.lessons.map((l, idx) => ({
      value: l.id,
      label: l.kind === 'scenario' ? `Lab ${idx + 1}` : `Lesson ${idx + 1}`,
      title: l.title,
    })),
    ...(course.quiz.length > 0
      ? [
          {
            value: 'quiz',
            label: 'Assessment',
            count: course.quiz.length,
            title: 'Graded certification quiz',
          },
        ]
      : []),
  ];

  return (
    <div className="neo-stack">
      {/* Compact Course Meta & Stage Switcher Strip */}
      <NeoPanel className="ac-player-bar" style={{ '--th': course.hue } as CSSProperties}>
        <div className="ac-player-bar__row">
          <div className="row row--wrap" style={{ gap: 8 }}>
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => navigate('/academy')}>
              <ArrowLeft /> Learning
            </button>
            <TrackBadge track={course.track} />
            <span className="neo-chip" data-tone={LEVEL_TONE[course.level]}>
              {levelMeta.label}
            </span>
            <span className="neo-chip" data-tone="slate">
              {FORMAT_LABEL[course.format]}
            </span>
            {course.mandatory && (
              <span className="neo-chip" data-tone="warning">
                Annual compliance
              </span>
            )}
            {enrollment && <SourceBadge source={enrollment.source} />}
          </div>

          <div className="row row--wrap" style={{ gap: 12, alignItems: 'center' }}>
            {instructor && (
              <div className="row" style={{ gap: 8 }}>
                <Avatar user={instructor} size={24} />
                <span className="text-xs muted">
                  <strong style={{ color: 'var(--text)' }}>{instructor.name}</strong> · {instructor.title}
                </span>
              </div>
            )}
            <span className="text-xs muted neo-mono">
              <Clock size={12} style={{ verticalAlign: '-2px' }} /> {course.durationMins}m · +{course.xp} XP · Pass{' '}
              {course.passScore}%
            </span>
            <ProgressRing pct={progressPct} hue={course.hue} size={44} stroke={4} />
            {!enrollment ? (
              <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={handleEnrolNow}>
                <Play /> Enrol &amp; start
              </button>
            ) : existingCert ? (
              <button
                type="button"
                className="neo-btn neo-btn--soft neo-btn--sm"
                onClick={() => openCert(existingCert.id)}
              >
                <Award /> View certificate
              </button>
            ) : null}
          </div>
        </div>

        <div className="ac-player-bar__tabs">
          <NeoTabs<string>
            label="Course stages"
            value={activeStage}
            onChange={selectStage}
            items={stageTabItems}
          />
        </div>
      </NeoPanel>

      {/* Main Split: Curriculum Rail + Interactive Stage */}
      <div className="ac-player-layout">
        {/* Left/Top Curriculum Rail */}
        <aside className="ac-player-rail">
          <NeoPanel
            hud="Course curriculum"
            title={`${completedStages}/${totalStages} stages`}
            actions={<span className="neo-mono text-xs muted">{progressPct}%</span>}
          >
            <div className="ac-bar" style={{ '--th': course.hue, marginBottom: 12 } as CSSProperties}>
              <i style={{ width: `${progressPct}%` }} />
            </div>

            <div className="ac-stage-list">
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
                    <div className="grow" style={{ minWidth: 0 }}>
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
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="ac-stage-btn__title">Certification Assessment</div>
                    <div className="ac-stage-btn__sub">
                      {course.quiz.length} questions · Pass {course.passScore}% · +{course.xp} XP
                    </div>
                  </div>
                </button>
              )}
            </div>
          </NeoPanel>

          {/* Companion Knowledge Base Playbooks */}
          {companionPlaybooks.length > 0 && (
            <NeoPanel icon={<BookOpen />} hud="Knowledge base" title="Companion playbooks">
              <div className="stack stack--sm">
                {companionPlaybooks.map((pb) => (
                  <Link key={pb.slug} to={`/wiki/doc/${pb.slug}`} className="ac-playbook-link">
                    <FileText size={16} style={{ color: 'var(--app-ink)', flex: 'none', marginTop: 2 }} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="text-sm" style={{ fontWeight: 600, color: 'var(--text)' }}>
                        {pb.title}
                      </div>
                      <div className="text-xs muted clamp-2">{pb.subtitle}</div>
                      <div className="neo-mono text-xs faint" style={{ marginTop: 3 }}>
                        {pb.readMins} min read →
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </NeoPanel>
          )}
        </aside>

        {/* Main Interactive Stage */}
        <div className="neo-stack" style={{ minWidth: 0 }}>
          {/* STAGE A: Concept Lesson */}
          {currentLesson?.kind === 'concept' && (
            <NeoPanel
              className="ac-lesson-card"
              hud={`Lesson ${currentLessonIndex + 1} of ${course.lessons.length} · Concept studio · ${currentLesson.durationMins}m`}
              title={currentLesson.title}
              actions={
                enrollment?.completedLessonIds.includes(currentLesson.id) ? (
                  <span className="neo-chip" data-tone="emerald">
                    <Check /> Completed
                  </span>
                ) : undefined
              }
            >
              <p className="ac-panel-lead">{currentLesson.summary}</p>

              <hr className="neo-divider" style={{ margin: '4px 0' }} />

              <div className="stack" style={{ gap: 18 }}>
                {currentLesson.blocks.map((block, bIdx) => (
                  <LessonBlockRenderer key={bIdx} block={block} />
                ))}
              </div>

              {currentLesson.keyTakeaways.length > 0 && (
                <div className="ac-takeaways">
                  <div className="row" style={{ gap: 7, marginBottom: 8 }}>
                    <Zap size={15} style={{ color: 'var(--app-ink)' }} />
                    <strong style={{ fontSize: 13.5 }}>Key Takeaways</strong>
                  </div>
                  <ul className="ac-bullets">
                    {currentLesson.keyTakeaways.map((kt, idx) => (
                      <li key={idx}>{kt}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="row row--between row--wrap" style={{ paddingTop: 6, gap: 10 }}>
                {currentLessonIndex > 0 ? (
                  <button
                    type="button"
                    className="neo-btn neo-btn--ghost"
                    onClick={() => selectStage(course.lessons[currentLessonIndex - 1].id)}
                  >
                    <ArrowLeft /> Previous lesson
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  className="neo-btn neo-btn--plasma"
                  onClick={() => handleCompleteConcept(currentLesson)}
                >
                  Mark complete &amp; next <ArrowRight />
                </button>
              </div>
            </NeoPanel>
          )}

          {/* STAGE B: Workplace Scenario Simulator */}
          {currentLesson?.kind === 'scenario' && (
            <NeoPanel
              className="ac-lesson-card"
              icon={<FlaskConical />}
              hud={`Lesson ${currentLessonIndex + 1} of ${course.lessons.length} · Workplace scenario simulator`}
              title={currentLesson.title}
              actions={
                enrollment?.completedLessonIds.includes(currentLesson.id) ? (
                  <span className="neo-chip" data-tone="emerald">
                    <Check /> Optimal move mastered
                  </span>
                ) : undefined
              }
            >
              <p className="ac-panel-lead">{currentLesson.summary}</p>

              <div className="ac-sim-frame">
                <div className="row row--between row--wrap" style={{ gap: 8 }}>
                  <span className="neo-chip" data-tone="violet">
                    Simulation context · {currentLesson.contextLabel}
                  </span>
                  <span className="text-xs muted">
                    Choose a response to inspect real-world blast radius &amp; coaching
                  </span>
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
                  <div
                    className={cx(
                      'ac-coaching',
                      selectedScenarioChoice.optimal ? 'ac-coaching--optimal' : 'ac-coaching--retry',
                    )}
                  >
                    <div className="row row--wrap" style={{ gap: 8 }}>
                      <span
                        className="neo-chip"
                        data-tone={selectedScenarioChoice.optimal ? 'emerald' : 'warning'}
                      >
                        {selectedScenarioChoice.optimal ? <CheckCircle2 /> : <AlertTriangle />}
                        {selectedScenarioChoice.optimal ? 'Optimal response' : 'Suboptimal — try another move'}
                      </span>
                      <span className="text-xs neo-mono" style={{ fontWeight: 600, color: 'var(--text)' }}>
                        Impact: {selectedScenarioChoice.impact}
                      </span>
                    </div>
                    <p className="text-sm" style={{ color: 'var(--text)', lineHeight: 1.55 }}>
                      {selectedScenarioChoice.feedback}
                    </p>
                  </div>
                )}
              </div>

              <div className="row row--between row--wrap" style={{ gap: 10 }}>
                {currentLessonIndex > 0 ? (
                  <button
                    type="button"
                    className="neo-btn neo-btn--ghost"
                    onClick={() => selectStage(course.lessons[currentLessonIndex - 1].id)}
                  >
                    <ArrowLeft /> Previous lesson
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  className="neo-btn neo-btn--plasma"
                  disabled={!enrollment?.completedLessonIds.includes(currentLesson.id)}
                  onClick={() => advanceAfterLesson(currentLesson.id)}
                >
                  {course.lessons[currentLessonIndex + 1] ? 'Next lesson' : 'Proceed to certification quiz'}{' '}
                  <ArrowRight />
                </button>
              </div>
            </NeoPanel>
          )}

          {/* STAGE C: Graded Certification Quiz */}
          {activeStage === 'quiz' && (
            <NeoPanel
              className="ac-lesson-card"
              icon={<ClipboardCheck />}
              hud="Final stage · Graded certification assessment"
              title="Verify mastery & unlock credential"
              actions={
                enrollment?.bestQuizScore !== undefined ? (
                  <span className="neo-chip" data-tone="cyan">
                    Best: {enrollment.bestQuizScore}% ({enrollment.attempts}{' '}
                    {enrollment.attempts === 1 ? 'attempt' : 'attempts'})
                  </span>
                ) : undefined
              }
            >
              <p className="ac-panel-lead">
                Score at least <strong>{course.passScore}%</strong> across {course.quiz.length} questions to earn{' '}
                <strong>+{course.xp} XP</strong>, endorse your directory skills, and issue your verifiable certificate.
              </p>

              {/* Celebratory Credential Unlocked Banner */}
              {(quizResult?.passed || existingCert) && (
                <div className="ac-unlock-banner">
                  <div className="row row--between row--wrap" style={{ gap: 14 }}>
                    <div className="row" style={{ gap: 14, minWidth: 0 }}>
                      <ProgressRing pct={quizResult?.score ?? existingCert?.score ?? 100} hue={150} size={60} />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="neo-hud" style={{ color: 'var(--success)', marginBottom: 4 }}>
                          Credential unlocked · +{course.xp} XP earned
                        </div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700 }}>
                          {course.title} — Certified!
                        </div>
                        {existingCert && (
                          <div className="neo-mono text-xs muted" style={{ marginTop: 2 }}>
                            {existingCert.credentialCode} · Hash {existingCert.verificationHash}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="row row--wrap" style={{ gap: 8 }}>
                      {existingCert && (
                        <button
                          type="button"
                          className="neo-btn neo-btn--plasma neo-btn--sm"
                          onClick={() => openCert(existingCert.id)}
                        >
                          <Award /> View certificate
                        </button>
                      )}
                      <Link to="/academy/certificates" className="neo-btn neo-btn--soft neo-btn--sm">
                        Certificates vault <ArrowRight />
                      </Link>
                    </div>
                  </div>

                  {/* Endorsed Skills */}
                  <div className="row row--wrap" style={{ gap: 6 }}>
                    <span className="text-xs muted">Endorsed on your NEXUS profile:</span>
                    {course.skills.map((sk) => (
                      <span key={sk} className="ac-skill ac-skill--ok">
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
                      <Link
                        to={`/hr/onboarding/${quizResult.syncedOnboarding.journeyId}`}
                        className="neo-btn neo-btn--soft neo-btn--sm"
                      >
                        View onboarding journey <ExternalLink size={13} />
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
                      <ProgressRing pct={quizResult.score ?? 0} hue={38} size={52} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>
                          Scored {quizResult.score}% ({quizResult.correctCount}/{quizResult.total} correct) —{' '}
                          {course.passScore}% required
                        </div>
                        <p className="text-xs muted">
                          Review the per-question explanations below, adjust your selections, and submit again.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="neo-btn neo-btn--soft neo-btn--sm"
                      onClick={() => {
                        setQuizResult(null);
                        setQuizAnswers(new Array(course.quiz.length).fill(-1));
                      }}
                    >
                      <RotateCcw /> Reset answers
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
                        <span className="neo-chip neo-mono" data-tone="slate">
                          Q{qIdx + 1}
                        </span>
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
                              {isCorrect && (
                                <CheckCircle2 size={16} style={{ color: 'var(--success)', flex: 'none' }} />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {showReview && (
                        <div className="ac-quiz-review">
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

              <div className="row row--between row--wrap" style={{ gap: 10 }}>
                {course.lessons.length > 0 ? (
                  <button
                    type="button"
                    className="neo-btn neo-btn--ghost"
                    onClick={() => selectStage(course.lessons[course.lessons.length - 1].id)}
                  >
                    <ArrowLeft /> Back to lessons
                  </button>
                ) : (
                  <span />
                )}

                <div className="row" style={{ gap: 10 }}>
                  {quizResult?.passed && (
                    <button
                      type="button"
                      className="neo-btn neo-btn--soft"
                      onClick={() => {
                        setQuizResult(null);
                        setQuizAnswers(new Array(course.quiz.length).fill(-1));
                      }}
                    >
                      <RotateCcw /> Retake quiz
                    </button>
                  )}
                  {!quizResult?.passed && (
                    <button
                      type="button"
                      className="neo-btn neo-btn--plasma"
                      disabled={quizAnswers.some((a) => a < 0)}
                      onClick={handleSubmitQuiz}
                    >
                      <Award /> Submit assessment
                    </button>
                  )}
                </div>
              </div>
            </NeoPanel>
          )}

          {/* Personal Study Notes Pad */}
          <NeoPanel
            icon={<NotebookPen />}
            hud="Private study pad"
            title={`Personal notes · ${activeStage === 'quiz' ? 'Assessment prep' : currentLesson?.title ?? 'Lesson'}`}
            actions={
              <div className="row" style={{ gap: 8 }}>
                {noteDirty && (
                  <span className="neo-chip" data-tone="warning">
                    Unsaved
                  </span>
                )}
                <button
                  type="button"
                  className="neo-btn neo-btn--ghost neo-btn--xs"
                  onClick={() => setNotesOpen((v) => !v)}
                >
                  {notesOpen ? 'Collapse' : 'Expand'}
                </button>
                {notesOpen && (
                  <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={handleSaveNote}>
                    <Save /> Save note
                  </button>
                )}
              </div>
            }
          >
            {notesOpen ? (
              <textarea
                className="neo-textarea"
                rows={3}
                placeholder="Jot down takeaways, prompts, or action items for your team (private to your Academy profile)…"
                value={noteDraft}
                onChange={(e) => {
                  setNoteDraft(e.target.value);
                  setNoteDirty(true);
                }}
              />
            ) : savedNote ? (
              <p className="text-xs muted truncate">Saved: “{savedNote}”</p>
            ) : (
              <p className="text-xs muted">No study note saved for this stage yet.</p>
            )}
          </NeoPanel>

          {/* Helpful hint for unenrolled viewers */}
          {!enrollment && (
            <div className="row" style={{ gap: 8, fontSize: 12.5, color: 'var(--text-3)', paddingLeft: 4 }}>
              <HelpCircle size={14} /> Completing any lesson, scenario lab, or saving a note automatically enrols you in this course.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

