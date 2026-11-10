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
      className="wk-portal neo-portal"
      icon={
        <span className="neo-novaorb wk-cortex-orb" aria-hidden="true">
          <i />
        </span>
      }
      title="Ask Nova Docs · Living Cortex"
      subtitle="Permission-first AI Knowledge Synthesizer with line-level playbook citations"
      footer={
        <div className="wk-cortex-sec-foot">
          <ShieldCheck aria-hidden="true" />
          <span className="wk-cortex-sec-foot__text">
            <strong>Security guarantee:</strong> Grounded strictly in spaces cleared for your role — restricted spaces are excluded
            before synthesis ({visibleArticles.length} of {allArticles.length} playbooks active
            {excludedCount > 0 ? ` · ${excludedCount} restricted excluded` : ''}).
          </span>
          <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={onClose}>
            Done
          </button>
        </div>
      }
    >
      <div className="wk-cortex">
        {/* Query Input */}
        <div className="wk-cortex__search">
          <Search className="wk-cortex__search-icon" aria-hidden="true" />
          <input
            type="text"
            className="wk-cortex__search-input"
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
              className="neo-iconbtn neo-iconbtn--sm"
              onClick={() => setQuery('')}
              aria-label="Clear question"
            >
              <X />
            </button>
          )}
        </div>

        {/* Suggested Prompts */}
        <div className="wk-cortex__prompts">
          <span className="neo-hud">Suggested Cortex questions</span>
          <div className="wk-cortex-prompt-grid">
            {SUGGESTED_CORTEX_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                className={cx('wk-cortex-prompt', query === p && 'is-active')}
                onClick={() => {
                  setQuery(p);
                  setActiveCite(null);
                  setExpandedCites(new Set([1]));
                }}
              >
                <Sparkles aria-hidden="true" />
                <span>{p}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Synthesized Answer */}
        {answer && (
          <div className="wk-cortex-answer">
            <div className="wk-cortex-answer__chips">
              <span className="neo-nova-chip">
                <Sparkles /> Grounded synthesis
              </span>
              {answer.citations.some((c) => c.isStale) && (
                <span className="neo-chip" data-tone="warning">
                  <AlertTriangle /> 1+ cited source flagged or due for review
                </span>
              )}
              {answer.restrictedHint && (
                <span className="neo-chip" data-tone="slate">
                  <Lock /> Restricted spaces excluded
                </span>
              )}
            </div>

            <h3 className="wk-cortex-answer__title">{answer.headline}</h3>

            <div className="wk-cortex-answer__body">
              {answer.paragraphs.map((p, idx) => (
                <p key={idx}>{renderCitedText(p)}</p>
              ))}
            </div>

            {answer.bullets.length > 0 && (
              <ul className="wk-cortex-answer__list">
                {answer.bullets.map((b, idx) => (
                  <li key={idx}>{renderCitedText(b)}</li>
                ))}
              </ul>
            )}

            {/* Companion Academy Courses & Cross-App Deep Link */}
            {(relatedCourses.length > 0 || answer.relatedRoute) && (
              <div className="wk-cortex-answer__links">
                {relatedCourses.map((course) =>
                  hasAcademy ? (
                    <Link
                      key={course.id}
                      to={`/academy/course/${course.id}`}
                      onClick={onClose}
                      className="neo-chip neo-chip--lg"
                      data-tone="teal"
                    >
                      <GraduationCap />
                      <span>Academy: {course.title}</span>
                      <span className="neo-count">{course.durationMins}m</span>
                      <ArrowUpRight />
                    </Link>
                  ) : (
                    <span
                      key={course.id}
                      className="neo-chip neo-chip--lg"
                      data-tone="slate"
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
                    className="neo-chip neo-chip--lg"
                    data-tone="app"
                  >
                    <ExternalLink />
                    <span>{answer.relatedRoute.label}</span>
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {/* Expandable Source Cards */}
        {answer && answer.citations.length > 0 && (
          <div className="wk-cortex-sources">
            <div className="wk-cortex-sources__head">
              <span className="neo-hud">Verified source citations</span>
              <span className="neo-count">{answer.citations.length}</span>
            </div>
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
                  <div className="wk-source-card__top">
                    <div className="wk-source-card__chips">
                      <span className="wk-cite-pill is-active">[{c.index}]</span>
                      <span className="wk-space-pill" style={{ '--sp-h': c.spaceHue } as CSSProperties}>
                        {c.spaceName}
                      </span>
                      <span
                        className="neo-chip neo-chip--sm wk-fresh"
                        data-tone={c.isStale ? 'danger' : 'success'}
                      >
                        {c.isStale ? <AlertTriangle /> : <CheckCircle2 />}
                        {c.freshnessLabel}
                      </span>
                    </div>

                    <div className="wk-source-card__acts">
                      <button
                        type="button"
                        className="neo-btn neo-btn--ghost neo-btn--xs"
                        onClick={() => toggleExpand(c.index)}
                        aria-expanded={expanded}
                      >
                        {expanded ? <ChevronUp /> : <ChevronDown />}
                        {expanded ? 'Hide excerpt' : 'Excerpt'}
                      </button>
                      <Link
                        to={deepUrl}
                        onClick={onClose}
                        className="neo-btn neo-btn--soft neo-btn--xs"
                      >
                        Open section <ArrowUpRight />
                      </Link>
                    </div>
                  </div>

                  <div className="wk-source-card__title">
                    {c.articleTitle} <span>· § {c.sectionHeading}</span>
                  </div>

                  {expanded && <p className="wk-source-card__excerpt">“{c.excerpt}”</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
