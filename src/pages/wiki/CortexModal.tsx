import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GraduationCap,
  Lock,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useAcademy } from '@/academy/store';
import { useHasApp } from '@/store/selectors';
import { cx } from '@/lib/cx';
import { SUGGESTED_CORTEX_PROMPTS } from '@/wiki/constants';
import { askCortex, type CortexCitation } from '@/wiki/cortex';
import { useVisibleArticles } from '@/wiki/selectors';
import { useWiki } from '@/wiki/store';

interface CortexModalProps {
  open: boolean;
  initialQuery?: string;
  onClose: () => void;
}

export function CortexModal({ open, initialQuery = '', onClose }: CortexModalProps) {
  const spaces = useWiki((s) => s.spaces);
  const allArticles = useWiki((s) => s.articles);
  const visibleArticles = useVisibleArticles();
  const courses = useAcademy((s) => s.courses);
  const hasAcademy = useHasApp('learning');

  const [query, setQuery] = useState(initialQuery || SUGGESTED_CORTEX_PROMPTS[0]);
  const [activeCite, setActiveCite] = useState<number | null>(null);
  const [expandedCites, setExpandedCites] = useState<Set<number>>(() => new Set([1]));
  const sourceRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    if (open && initialQuery.trim()) {
      setQuery(initialQuery.trim());
      setActiveCite(null);
      setExpandedCites(new Set([1]));
    }
  }, [open, initialQuery]);

  const answer = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return null;
    return askCortex(trimmed, visibleArticles, spaces, allArticles.length);
  }, [query, visibleArticles, spaces, allArticles.length]);

  const relatedCourses = useMemo(() => {
    if (!answer?.relatedCourseIds.length) return [];
    const byId = new Map(courses.map((c) => [c.id, c]));
    return answer.relatedCourseIds.map((id) => byId.get(id)).filter((c): c is NonNullable<typeof c> => !!c);
  }, [answer, courses]);

  const handleCitationClick = (idx: number) => {
    setActiveCite(idx);
    setExpandedCites((prev) => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
    const el = sourceRefs.current[idx];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const toggleExpand = (idx: number) => {
    setExpandedCites((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const renderCitedText = (text: string): ReactNode => {
    const parts = text.split(/(\[\d+\])/g);
    return parts.map((part, i) => {
      const match = /^\[(\d+)\]$/.exec(part);
      if (!match) return <span key={i}>{part}</span>;
      const idx = Number(match[1]);
      const cite: CortexCitation | undefined = answer?.citations.find((c) => c.index === idx);
      return (
        <button
          key={i}
          type="button"
          className={cx('wk-cite-pill', activeCite === idx && 'is-active')}
          title={cite ? `${cite.articleTitle} · ${cite.sectionHeading}` : `Source [${idx}]`}
          onClick={() => handleCitationClick(idx)}
        >
          [{idx}]
        </button>
      );
    });
  };

  const excludedCount = Math.max(0, allArticles.length - visibleArticles.length);

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={760}
      icon={
        <span
          className="wk-space-icon"
          style={{ '--sp-h': 174, '--sz': '42px' } as CSSProperties}
          aria-hidden="true"
        >
          <Sparkles />
        </span>
      }
      title="Ask Nova Docs · Living Cortex"
      subtitle="Permission-first AI Knowledge Synthesizer with line-level playbook citations"
      footer={
        <div className="wk-cortex-sec-foot">
          <ShieldCheck aria-hidden="true" />
          <span className="grow">
            <strong>Security guarantee:</strong> Grounded strictly in spaces cleared for your role — restricted spaces are excluded
            before synthesis ({visibleArticles.length} of {allArticles.length} playbooks active
            {excludedCount > 0 ? ` · ${excludedCount} restricted excluded` : ''}).
          </span>
          <button type="button" className="btn btn--sm" onClick={onClose}>
            Done
          </button>
        </div>
      }
    >
      <div className="stack">
        {/* Query Input */}
        <div className="input-wrap">
          <Search />
          <input
            type="text"
            className="input"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveCite(null);
            }}
            placeholder="Ask any operational, policy, onboarding, or incident question…"
            aria-label="Ask Nova Docs"
            autoFocus
          />
          {query && (
            <button
              type="button"
              className="icon-btn icon-btn--sm input-trail"
              onClick={() => setQuery('')}
              aria-label="Clear question"
            >
              <X />
            </button>
          )}
        </div>

        {/* Suggested Prompts */}
        <div className="stack stack--sm">
          <span className="stat-label">Suggested Cortex Questions</span>
          <div className="wk-cortex-prompt-grid">
            {SUGGESTED_CORTEX_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                className="wk-cortex-prompt"
                onClick={() => {
                  setQuery(p);
                  setActiveCite(null);
                  setExpandedCites(new Set([1]));
                }}
              >
                <Sparkles style={{ width: 12, height: 12, color: 'var(--wk-ink, #2dd4bf)', flex: 'none' }} />
                <span>{p}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Synthesized Answer */}
        {answer && (
          <div className="wk-cortex-answer">
            <div className="row row--between row--wrap" style={{ gap: 8 }}>
              <span className="badge" style={{ '--b-rgb': '45 212 191' } as CSSProperties}>
                <Sparkles /> Grounded Synthesis
              </span>
              {answer.citations.some((c) => c.isStale) && (
                <span className="badge badge--warning">
                  <AlertTriangle /> 1+ cited source flagged or due for review
                </span>
              )}
              {answer.restrictedHint && (
                <span className="badge badge--muted">
                  <Lock /> Restricted spaces excluded
                </span>
              )}
            </div>

            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 650, margin: 0 }}>
              {answer.headline}
            </h3>

            <div className="stack stack--sm">
              {answer.paragraphs.map((p, idx) => (
                <p key={idx} className="text-sm" style={{ margin: 0, lineHeight: 1.62, color: 'var(--text)' }}>
                  {renderCitedText(p)}
                </p>
              ))}
            </div>

            {answer.bullets.length > 0 && (
              <ul style={{ margin: '2px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {answer.bullets.map((b, idx) => (
                  <li key={idx} className="text-sm" style={{ lineHeight: 1.55, color: 'var(--text-2)' }}>
                    {renderCitedText(b)}
                  </li>
                ))}
              </ul>
            )}

            {/* Companion Academy Courses & Cross-App Deep Link */}
            {(relatedCourses.length > 0 || answer.relatedRoute) && (
              <div
                className="row row--wrap"
                style={{ gap: 8, paddingTop: 10, borderTop: '1px solid var(--border)' }}
              >
                {relatedCourses.map((course) =>
                  hasAcademy ? (
                    <Link
                      key={course.id}
                      to={`/academy/course/${course.id}`}
                      onClick={onClose}
                      className="chip"
                      style={{ height: 32, fontSize: 12.5 }}
                    >
                      <GraduationCap style={{ color: '#2dd4bf' }} />
                      <span>Academy: {course.title}</span>
                      <span className="count">{course.durationMins}m</span>
                      <ArrowUpRight />
                    </Link>
                  ) : (
                    <span
                      key={course.id}
                      className="chip"
                      style={{ height: 32, fontSize: 12.5, opacity: 0.72 }}
                      title="Requires Helix Academy (app:learning) permission"
                    >
                      <Lock />
                      <span>Academy: {course.title}</span>
                    </span>
                  ),
                )}

                {answer.relatedRoute && (
                  <Link
                    to={answer.relatedRoute.to}
                    onClick={onClose}
                    className="chip"
                    style={{ height: 32, fontSize: 12.5 }}
                  >
                    <ExternalLink style={{ color: 'var(--accent-ink)' }} />
                    <span>{answer.relatedRoute.label}</span>
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {/* Expandable Source Cards */}
        {answer && answer.citations.length > 0 && (
          <div className="stack stack--sm">
            <span className="stat-label">Verified Source Citations ({answer.citations.length})</span>
            {answer.citations.map((c) => {
              const expanded = expandedCites.has(c.index);
              const deepUrl = `/wiki/doc/${c.articleSlug}${c.sectionId ? `#${c.sectionId}` : ''}`;
              return (
                <div
                  key={`${c.articleId}-${c.index}`}
                  ref={(el) => {
                    sourceRefs.current[c.index] = el;
                  }}
                  className={cx('wk-source-card', activeCite === c.index && 'is-highlighted')}
                >
                  <div className="row row--between row--wrap" style={{ gap: 8 }}>
                    <div className="row row--wrap" style={{ gap: 8, minWidth: 0 }}>
                      <span className="wk-cite-pill is-active">[{c.index}]</span>
                      <span className="wk-space-pill" style={{ '--sp-h': c.spaceHue } as CSSProperties}>
                        {c.spaceName}
                      </span>
                      <span
                        className={cx('wk-fresh', c.isStale ? 'wk-fresh--stale' : 'wk-fresh--verified')}
                      >
                        {c.isStale ? <AlertTriangle /> : <CheckCircle2 />}
                        {c.freshnessLabel}
                      </span>
                    </div>

                    <div className="row" style={{ gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => toggleExpand(c.index)}
                        aria-expanded={expanded}
                      >
                        {expanded ? <ChevronUp /> : <ChevronDown />}
                        {expanded ? 'Hide excerpt' : 'Excerpt'}
                      </button>
                      <Link
                        to={deepUrl}
                        onClick={onClose}
                        className="btn btn--sm"
                      >
                        Open section <ArrowUpRight />
                      </Link>
                    </div>
                  </div>

                  <div className="text-sm" style={{ fontWeight: 600 }}>
                    {c.articleTitle}{' '}
                    <span className="muted" style={{ fontWeight: 500 }}>
                      § {c.sectionHeading}
                    </span>
                  </div>

                  {expanded && (
                    <p
                      className="text-xs muted"
                      style={{
                        margin: 0,
                        padding: '9px 11px',
                        borderRadius: 'var(--r-xs)',
                        background: 'var(--bg-2)',
                        border: '1px solid var(--border)',
                        lineHeight: 1.55,
                      }}
                    >
                      “{c.excerpt}”
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
