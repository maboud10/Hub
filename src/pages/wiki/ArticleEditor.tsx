import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Code2,
  Eye,
  FilePlus2,
  GitPullRequest,
  GraduationCap,
  Info,
  ListChecks,
  Lock,
  PenLine,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useAcademy } from '@/academy/store';
import { EmptyState, Segmented, Switch } from '@/components/ui/primitives';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { canDirectEdit, canProposeEdit, canReadArticle, canReadSpace } from '@/wiki/access';
import { ARTICLE_TEMPLATES } from '@/wiki/constants';
import { useWikiCaps, useWikiViewer } from '@/wiki/selectors';
import { useWiki } from '@/wiki/store';
import type { ArticleSection, SpaceId } from '@/wiki/types';
import { SpaceBoundaryCard } from './wikiUi';

interface EditableSection {
  id: string;
  heading: string;
  body: string;
  hasCallout: boolean;
  calloutTone: 'tip' | 'warning' | 'policy' | 'info';
  calloutTitle: string;
  calloutText: string;
  hasCode: boolean;
  codeLabel: string;
  codeSnippet: string;
  hasChecklist: boolean;
  checklistItems: { id: string; label: string }[];
}

function toEditableSection(sec: ArticleSection, idx: number): EditableSection {
  return {
    id: sec.id || `sec-${idx + 1}`,
    heading: sec.heading,
    body: sec.body,
    hasCallout: !!sec.callout,
    calloutTone: sec.callout?.tone ?? 'info',
    calloutTitle: sec.callout?.title ?? '',
    calloutText: sec.callout?.text ?? '',
    hasCode: !!sec.code,
    codeLabel: sec.code?.label ?? 'Terminal / CLI',
    codeSnippet: sec.code?.snippet ?? '',
    hasChecklist: !!(sec.checklist && sec.checklist.length > 0),
    checklistItems: sec.checklist?.length
      ? sec.checklist.map((c) => ({ ...c }))
      : [{ id: `chk-${Date.now()}-1`, label: '' }],
  };
}

function fromEditableSections(list: EditableSection[]): ArticleSection[] {
  return list.map((s, idx) => {
    const out: ArticleSection = {
      id: s.id || `sec-${idx + 1}`,
      heading: s.heading.trim() || `Section ${idx + 1}`,
      body: s.body.trim(),
    };
    if (s.hasCallout && (s.calloutTitle.trim() || s.calloutText.trim())) {
      out.callout = {
        tone: s.calloutTone,
        title: s.calloutTitle.trim() || 'Key Note',
        text: s.calloutText.trim(),
      };
    }
    if (s.hasCode && s.codeSnippet.trim()) {
      out.code = {
        label: s.codeLabel.trim() || 'Command Snippet',
        snippet: s.codeSnippet,
      };
    }
    if (s.hasChecklist) {
      const items = s.checklistItems
        .map((c, cIdx) => ({ id: c.id || `chk-${idx + 1}-${cIdx + 1}`, label: c.label.trim() }))
        .filter((c) => c.label.length > 0);
      if (items.length > 0) out.checklist = items;
    }
    return out;
  });
}

function blankSection(idx: number): EditableSection {
  return {
    id: `sec-${Date.now()}-${idx}`,
    heading: '',
    body: '',
    hasCallout: false,
    calloutTone: 'tip',
    calloutTitle: '',
    calloutText: '',
    hasCode: false,
    codeLabel: 'Terminal / CLI',
    codeSnippet: '',
    hasChecklist: false,
    checklistItems: [{ id: `chk-${Date.now()}-1`, label: '' }],
  };
}

export function ArticleEditor({ mode }: { mode: 'create' | 'edit' }) {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const viewer = useWikiViewer();
  const caps = useWikiCaps();
  const spaces = useWiki((s) => s.spaces);
  const articles = useWiki((s) => s.articles);
  const createArticle = useWiki((s) => s.createArticle);
  const updateArticle = useWiki((s) => s.updateArticle);
  const proposeEdit = useWiki((s) => s.proposeEdit);
  const academyCourses = useAcademy((s) => s.courses);

  const readableSpaces = useMemo(
    () => spaces.filter((s) => canReadSpace(viewer, s)),
    [spaces, viewer],
  );

  const existingArticle = mode === 'edit' ? articles.find((a) => a.slug === slug) : undefined;
  const existingSpace = spaces.find((s) => s.id === existingArticle?.spaceId);
  const canReadExisting = mode === 'edit' ? canReadArticle(viewer, existingArticle, spaces) : true;
  const directAllowed = mode === 'edit' ? canDirectEdit(viewer, existingArticle, spaces) : true;
  const proposeAllowed = mode === 'edit' ? canProposeEdit(viewer, existingArticle, spaces) : false;

  const initialSpaceParam = searchParams.get('space') as SpaceId | null;
  const defaultSpaceId: SpaceId =
    (initialSpaceParam && readableSpaces.some((s) => s.id === initialSpaceParam)
      ? initialSpaceParam
      : readableSpaces[0]?.id) ?? 'handbook';

  const [selectedTpl, setSelectedTpl] = useState<string>('tpl-howto');
  const [viewMode, setViewMode] = useState<'compose' | 'preview'>('compose');
  const [spaceId, setSpaceId] = useState<SpaceId>(defaultSpaceId);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [tldr, setTldr] = useState(ARTICLE_TEMPLATES[0].tldr);
  const [tagsText, setTagsText] = useState(ARTICLE_TEMPLATES[0].tags.join(', '));
  const [reviewCadenceDays, setReviewCadenceDays] = useState<number>(90);
  const [lockedCanonical, setLockedCanonical] = useState<boolean>(false);
  const [relatedCourseIds, setRelatedCourseIds] = useState<string[]>([]);
  const [sections, setSections] = useState<EditableSection[]>(() =>
    ARTICLE_TEMPLATES[0].sections.map(toEditableSection),
  );

  const [changeSummary, setChangeSummary] = useState('');
  const [forceProposal, setForceProposal] = useState<boolean>(
    () => searchParams.get('propose') === '1',
  );

  useEffect(() => {
    if (mode === 'edit' && existingArticle) {
      setSpaceId(existingArticle.spaceId);
      setTitle(existingArticle.title);
      setSubtitle(existingArticle.subtitle);
      setTldr(existingArticle.tldr);
      setTagsText(existingArticle.tags.join(', '));
      setReviewCadenceDays(existingArticle.reviewCadenceDays);
      setLockedCanonical(existingArticle.locked);
      setRelatedCourseIds(existingArticle.relatedCourseIds);
      setSections(existingArticle.sections.map(toEditableSection));
      setForceProposal(!directAllowed || searchParams.get('propose') === '1');
    }
  }, [mode, existingArticle, directAllowed, searchParams]);

  // Contractor / Read-only gate
  if (!caps.canWrite) {
    return (
      <div className="card glow-border hud" style={{ maxWidth: 620, margin: '18px auto', textAlign: 'center', padding: '32px 24px' }}>
        <div className="empty__icon" style={{ margin: '0 auto 12px', color: 'var(--warning)' }}>
          <Lock />
        </div>
        <div className="eyebrow" style={{ justifyContent: 'center' }}>
          Read-Only Clearance · Contractor Access
        </div>
        <h2 className="page-title" style={{ fontSize: 24 }}>
          Contributor permission required to author or edit
        </h2>
        <p className="muted text-sm" style={{ maxWidth: 480, margin: '8px auto 18px', lineHeight: 1.55 }}>
          Your current account has read-only access to cleared Knowledge Base spaces and <strong>Ask Nova Docs</strong>. Publishing
          new playbooks or submitting Change Proposals requires the <code className="mono">wiki.write</code> permission.
        </p>
        <Link to="/wiki" className="btn btn--primary">
          <ArrowLeft /> Back to Knowledge Base
        </Link>
      </div>
    );
  }

  if (mode === 'edit' && !existingArticle) {
    return (
      <div className="card">
        <EmptyState
          icon={<BookOpen />}
          title="Playbook not found"
          action={
            <Link to="/wiki" className="btn btn--primary">
              <ArrowLeft /> Back to Knowledge Base
            </Link>
          }
        >
          Cannot edit unknown playbook “{slug}”.
        </EmptyState>
      </div>
    );
  }

  if (mode === 'edit' && !canReadExisting) {
    return <SpaceBoundaryCard space={existingSpace} />;
  }

  const isProposalSubmission = mode === 'edit' && (!directAllowed || forceProposal);

  const applyTemplate = (tplId: string) => {
    setSelectedTpl(tplId);
    if (tplId === 'blank') {
      setTldr('');
      setTagsText('');
      setSections([blankSection(1)]);
      return;
    }
    const tpl = ARTICLE_TEMPLATES.find((t) => t.id === tplId);
    if (!tpl) return;
    setTldr(tpl.tldr);
    setTagsText(tpl.tags.join(', '));
    setSections(tpl.sections.map(toEditableSection));
  };

  const updateSec = (idx: number, patch: Partial<EditableSection>) => {
    setSections((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= sections.length) return;
    setSections((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const removeSection = (idx: number) => {
    if (sections.length <= 1) {
      toast.warning('Keep at least one section in your playbook');
      return;
    }
    setSections((prev) => prev.filter((_, i) => i !== idx));
  };

  const toggleCourse = (courseId: string) => {
    setRelatedCourseIds((prev) =>
      prev.includes(courseId) ? prev.filter((id) => id !== courseId) : [...prev, courseId],
    );
  };

  const parsedTags = tagsText
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const previewSections = fromEditableSections(sections);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const builtSections = fromEditableSections(sections);

    if (mode === 'create') {
      const res = createArticle({
        spaceId,
        title,
        subtitle,
        tldr,
        tags: parsedTags,
        reviewCadenceDays,
        locked: caps.canManage ? lockedCanonical : false,
        relatedCourseIds,
        sections: builtSections,
      });
      if (toast.result(res) && res.slug) {
        navigate(`/wiki/doc/${res.slug}`);
      }
      return;
    }

    if (!existingArticle) return;

    if (isProposalSubmission && proposeAllowed) {
      const res = proposeEdit(existingArticle.slug, {
        summary: changeSummary,
        proposedTitle: title,
        proposedTldr: tldr,
        proposedSections: builtSections,
      });
      if (toast.result(res)) {
        navigate('/wiki/governance');
      }
      return;
    }

    const res = updateArticle(existingArticle.slug, {
      title,
      subtitle,
      tldr,
      tags: parsedTags,
      relatedCourseIds,
      sections: builtSections,
      summary: changeSummary || 'Updated content & verified accuracy',
    });
    if (toast.result(res)) {
      navigate(`/wiki/doc/${existingArticle.slug}`);
    }
  };

  return (
    <div className="stack stack--lg">
      {/* Studio Header */}
      <div className="row row--between row--wrap" style={{ gap: 12 }}>
        <div className="stack stack--sm">
          <Link
            to={mode === 'edit' && existingArticle ? `/wiki/doc/${existingArticle.slug}` : '/wiki'}
            className="text-xs muted row"
            style={{ gap: 6, textDecoration: 'none' }}
          >
            <ArrowLeft style={{ width: 14, height: 14 }} />
            {mode === 'edit' && existingArticle ? `Back to ${existingArticle.title}` : 'Back to Knowledge Base'}
          </Link>
          <h2 className="page-title" style={{ fontSize: 'clamp(22px, 2.8vw, 30px)' }}>
            {mode === 'create'
              ? 'Publish New Playbook or Runbook'
              : isProposalSubmission
                ? `Propose Change · ${existingArticle?.title}`
                : `Edit Playbook · ${existingArticle?.title}`}
          </h2>
        </div>

        <Segmented<'compose' | 'preview'>
          label="Editor mode"
          value={viewMode}
          onChange={setViewMode}
          options={[
            { value: 'compose', label: 'Compose', icon: <PenLine /> },
            { value: 'preview', label: 'Live Preview', icon: <Eye /> },
          ]}
        />
      </div>

      {/* Governance / Four-Eyes Banner on Edit */}
      {mode === 'edit' && existingArticle && (
        <div
          className="card card--tight row row--between row--wrap"
          style={{
            gap: 14,
            borderColor: isProposalSubmission ? 'rgb(var(--wk-1-rgb) / 0.45)' : 'var(--border-2)',
          }}
        >
          <div className="row" style={{ gap: 12, minWidth: 0 }}>
            <span className="wk-space-icon" style={{ '--sp-h': 174, '--sz': '38px' } as CSSProperties}>
              {isProposalSubmission ? <GitPullRequest /> : <Save />}
            </span>
            <div className="stack stack--sm" style={{ gap: 2, minWidth: 0 }}>
              <strong className="text-sm">
                {!directAllowed
                  ? 'Locked Canonical Policy — Four-Eyes Change Proposal Mode'
                  : isProposalSubmission
                    ? 'Submitting as a Change Proposal for Curator Review'
                    : 'Direct Versioned Edit Mode'}
              </strong>
              <span className="text-xs muted">
                {!directAllowed
                  ? 'Because this canonical page is locked, your edits will enter the Governance queue for curator approval.'
                  : isProposalSubmission
                    ? 'Another curator (separation of duties) will review and publish this proposal.'
                    : 'Your edit will immediately publish a new verified revision to the version timeline.'}
              </span>
            </div>
          </div>

          {directAllowed && (
            <label className="row" style={{ gap: 10, cursor: 'pointer' }}>
              <span className="text-xs" style={{ fontWeight: 600 }}>
                Submit as Change Proposal (four-eyes review)
              </span>
              <Switch
                checked={forceProposal}
                onChange={setForceProposal}
                label="Submit as Change Proposal for four-eyes review"
              />
            </label>
          )}
        </div>
      )}

      {/* Starter Template Picker on /wiki/new */}
      {mode === 'create' && viewMode === 'compose' && (
        <div className="card stack">
          <div className="row row--between row--wrap">
            <span className="stat-label">1. Choose a Starter Blueprint</span>
            <span className="text-xs faint">Hydrates structured sections & checklists</span>
          </div>
          <div className="wk-tpl-grid">
            {ARTICLE_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                className={cx('wk-tpl-card', selectedTpl === tpl.id && 'is-selected')}
                onClick={() => applyTemplate(tpl.id)}
              >
                <div className="row" style={{ gap: 7 }}>
                  <Sparkles style={{ width: 15, height: 15, color: 'var(--wk-ink)' }} />
                  <strong className="text-sm">{tpl.name}</strong>
                </div>
                <span className="text-xs muted">{tpl.description}</span>
              </button>
            ))}
            <button
              type="button"
              className={cx('wk-tpl-card', selectedTpl === 'blank' && 'is-selected')}
              onClick={() => applyTemplate('blank')}
            >
              <div className="row" style={{ gap: 7 }}>
                <FilePlus2 style={{ width: 15, height: 15, color: 'var(--text-2)' }} />
                <strong className="text-sm">Blank Playbook</strong>
              </div>
              <span className="text-xs muted">Start from a clean slate with custom sections.</span>
            </button>
          </div>
        </div>
      )}

      {viewMode === 'preview' ? (
        /* Live Preview Pane */
        <div className="stack">
          <div className="wk-doc-head">
            <div className="row row--wrap" style={{ gap: 8 }}>
              <span className="badge">Live Preview</span>
              <span className="tag">{spaces.find((s) => s.id === spaceId)?.name ?? spaceId}</span>
              {parsedTags.map((t) => (
                <span key={t} className="tag">
                  #{t}
                </span>
              ))}
            </div>
            <h1 className="wk-doc-title">{title || 'Untitled Playbook'}</h1>
            <p className="wk-doc-subtitle">{subtitle || 'Playbook subtitle preview'}</p>
            {tldr && (
              <div className="wk-tldr-card">
                <span className="wk-tldr-card__label">
                  <Sparkles /> Executive TL;DR
                </span>
                <p className="wk-tldr-card__text">{tldr}</p>
              </div>
            )}
          </div>

          {previewSections.map((sec, i) => (
            <section key={sec.id} className="wk-section-card">
              <h3 className="wk-section-heading">
                <span className="wk-section-num">0{i + 1}</span>
                <span>{sec.heading}</span>
              </h3>
              <p className="wk-section-body">{sec.body || '(Empty section body)'}</p>
              {sec.callout && (
                <div className={cx('wk-callout', `wk-callout--${sec.callout.tone}`)}>
                  <Info className="wk-callout__icon" />
                  <div>
                    <div className="wk-callout__title">{sec.callout.title}</div>
                    <div className="wk-callout__text">{sec.callout.text}</div>
                  </div>
                </div>
              )}
              {sec.code && (
                <div className="wk-code">
                  <div className="wk-code__head">{sec.code.label}</div>
                  <pre className="wk-code__pre">
                    <code>{sec.code.snippet}</code>
                  </pre>
                </div>
              )}
              {sec.checklist && sec.checklist.length > 0 && (
                <div className="wk-checklist">
                  <div className="wk-checklist__head">Interactive Checklist ({sec.checklist.length} steps)</div>
                  {sec.checklist.map((item) => (
                    <div key={item.id} className="wk-check-item">
                      <span className="wk-check-box" />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      ) : (
        /* Structured Composer Form */
        <form onSubmit={handleSubmit} className="stack stack--lg">
          <div className="card stack">
            <span className="stat-label">Playbook Metadata & Placement</span>

            <div className="wk-form-grid-2">
              <label className="field">
                <span className="field-label">Knowledge Space</span>
                <select
                  className="select"
                  value={spaceId}
                  disabled={mode === 'edit'}
                  onChange={(e) => setSpaceId(e.target.value as SpaceId)}
                >
                  {readableSpaces.map((sp) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.name} — {sp.tagline}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field-label">Freshness Review Cadence</span>
                <select
                  className="select"
                  value={reviewCadenceDays}
                  disabled={mode === 'edit'}
                  onChange={(e) => setReviewCadenceDays(Number(e.target.value))}
                >
                  <option value={30}>Every 30 days (Fast-moving runbook)</option>
                  <option value={60}>Every 60 days</option>
                  <option value={90}>Every 90 days (Standard playbook)</option>
                  <option value={180}>Every 180 days (Foundational charter)</option>
                </select>
              </label>
            </div>

            <div className="wk-form-grid-2">
              <label className="field">
                <span className="field-label">Playbook Title *</span>
                <input
                  type="text"
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Canary Rollback & Cell Traffic Drain Runbook"
                  required
                />
              </label>

              <label className="field">
                <span className="field-label">One-Line Subtitle</span>
                <input
                  type="text"
                  className="input"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="Who this guide is for and what outcome it unlocks"
                />
              </label>
            </div>

            <label className="field">
              <span className="field-label">Executive TL;DR (used by Nova Docs synthesis) *</span>
              <textarea
                className="textarea"
                style={{ minHeight: 74 }}
                value={tldr}
                onChange={(e) => setTldr(e.target.value)}
                placeholder="Two crisp sentences summarizing the policy or workflow…"
                required
              />
            </label>

            <div className="wk-form-grid-2">
              <label className="field">
                <span className="field-label">Tags (comma-separated)</span>
                <input
                  type="text"
                  className="input"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="runbook, incident, security, onboarding"
                />
                {parsedTags.length > 0 && (
                  <div className="row row--wrap" style={{ gap: 5, marginTop: 4 }}>
                    {parsedTags.map((t) => (
                      <span key={t} className="tag">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </label>

              {mode === 'create' && caps.canManage && (
                <div className="field" style={{ justifyContent: 'center' }}>
                  <span className="field-label">Canonical Governance</span>
                  <label className="row" style={{ gap: 10, cursor: 'pointer', marginTop: 4 }}>
                    <Switch
                      checked={lockedCanonical}
                      onChange={setLockedCanonical}
                      label="Lock as Canonical Policy"
                    />
                    <span className="text-sm muted">
                      Lock canonical page (contributors submit Change Proposals)
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* Companion Helix Academy Courses Picker */}
            {academyCourses.length > 0 && !isProposalSubmission && (
              <div className="field">
                <span className="field-label">
                  <GraduationCap style={{ width: 15, height: 15, verticalAlign: '-3px', marginRight: 5 }} />
                  Companion Helix Academy Courses (optional)
                </span>
                <div className="chips" role="group" aria-label="Select companion Academy courses">
                  {academyCourses.map((c) => {
                    const active = relatedCourseIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={cx('chip', active && 'is-active')}
                        onClick={() => toggleCourse(c.id)}
                      >
                        <GraduationCap />
                        {c.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Change Summary / Proposal Rationale on Edit */}
            {mode === 'edit' && (
              <label className="field">
                <span className="field-label">
                  {isProposalSubmission
                    ? 'Change Proposal Rationale (shown to reviewing curators) *'
                    : 'Revision Summary (recorded in Version History) *'}
                </span>
                <input
                  type="text"
                  className="input"
                  value={changeSummary}
                  onChange={(e) => setChangeSummary(e.target.value)}
                  placeholder="e.g., Updated canary abort CLI command for mesh v4.8 and clarified escalation SLA"
                  required
                />
              </label>
            )}
          </div>

          {/* Dynamic Section Builder */}
          <div className="stack">
            <div className="row row--between row--wrap">
              <h3 className="section-title" style={{ margin: 0 }}>
                Structured Sections
                <span className="count">{sections.length}</span>
              </h3>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => setSections((prev) => [...prev, blankSection(prev.length + 1)])}
              >
                <Plus /> Add Section
              </button>
            </div>

            {sections.map((sec, idx) => (
              <div key={sec.id} className="wk-editor-sec">
                <div className="row row--between row--wrap" style={{ gap: 8 }}>
                  <span className="wk-section-num">Section 0{idx + 1}</span>
                  <div className="row" style={{ gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={idx === 0}
                      onClick={() => moveSection(idx, -1)}
                      aria-label="Move section up"
                    >
                      <ArrowUp />
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={idx === sections.length - 1}
                      onClick={() => moveSection(idx, 1)}
                      aria-label="Move section down"
                    >
                      <ArrowDown />
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger btn--sm"
                      onClick={() => removeSection(idx)}
                      aria-label="Delete section"
                    >
                      <Trash2 />
                    </button>
                  </div>
                </div>

                <label className="field">
                  <span className="field-label">Section Heading *</span>
                  <input
                    type="text"
                    className="input"
                    value={sec.heading}
                    onChange={(e) => updateSec(idx, { heading: e.target.value })}
                    placeholder="e.g., Immediate Mitigation (First 5 Minutes)"
                    required
                  />
                </label>

                <label className="field">
                  <span className="field-label">Section Body *</span>
                  <textarea
                    className="textarea"
                    value={sec.body}
                    onChange={(e) => updateSec(idx, { body: e.target.value })}
                    placeholder="Write clear, actionable guidance…"
                    required
                  />
                </label>

                {/* Optional Block Toggles */}
                <div className="row row--wrap" style={{ gap: 8 }}>
                  <button
                    type="button"
                    className={cx('chip', sec.hasCallout && 'is-active')}
                    onClick={() => updateSec(idx, { hasCallout: !sec.hasCallout })}
                  >
                    <Info /> {sec.hasCallout ? 'Callout enabled' : '+ Callout box'}
                  </button>
                  <button
                    type="button"
                    className={cx('chip', sec.hasCode && 'is-active')}
                    onClick={() => updateSec(idx, { hasCode: !sec.hasCode })}
                  >
                    <Code2 /> {sec.hasCode ? 'Code snippet enabled' : '+ Code snippet'}
                  </button>
                  <button
                    type="button"
                    className={cx('chip', sec.hasChecklist && 'is-active')}
                    onClick={() => updateSec(idx, { hasChecklist: !sec.hasChecklist })}
                  >
                    <ListChecks /> {sec.hasChecklist ? 'Runbook checklist enabled' : '+ Interactive checklist'}
                  </button>
                </div>

                {/* Callout Sub-editor */}
                {sec.hasCallout && (
                  <div
                    className="stack stack--sm"
                    style={{ padding: 12, borderRadius: 'var(--r-sm)', background: 'var(--bg-2)', border: '1px solid var(--border)' }}
                  >
                    <div className="wk-form-grid-2">
                      <label className="field">
                        <span className="field-label">Callout Tone</span>
                        <select
                          className="select"
                          value={sec.calloutTone}
                          onChange={(e) =>
                            updateSec(idx, {
                              calloutTone: e.target.value as EditableSection['calloutTone'],
                            })
                          }
                        >
                          <option value="tip">Tip (Emerald)</option>
                          <option value="warning">Warning (Amber)</option>
                          <option value="policy">Canonical Policy (Teal)</option>
                          <option value="info">Info (Blue)</option>
                        </select>
                      </label>
                      <label className="field">
                        <span className="field-label">Callout Title</span>
                        <input
                          type="text"
                          className="input"
                          value={sec.calloutTitle}
                          onChange={(e) => updateSec(idx, { calloutTitle: e.target.value })}
                          placeholder="e.g., Golden Rule"
                        />
                      </label>
                    </div>
                    <label className="field">
                      <span className="field-label">Callout Message</span>
                      <input
                        type="text"
                        className="input"
                        value={sec.calloutText}
                        onChange={(e) => updateSec(idx, { calloutText: e.target.value })}
                        placeholder="Key guardrail or reminder…"
                      />
                    </label>
                  </div>
                )}

                {/* Code Snippet Sub-editor */}
                {sec.hasCode && (
                  <div
                    className="stack stack--sm"
                    style={{ padding: 12, borderRadius: 'var(--r-sm)', background: 'var(--bg-2)', border: '1px solid var(--border)' }}
                  >
                    <label className="field">
                      <span className="field-label">Snippet Header Label</span>
                      <input
                        type="text"
                        className="input"
                        value={sec.codeLabel}
                        onChange={(e) => updateSec(idx, { codeLabel: e.target.value })}
                        placeholder="e.g., bash · rollback canary"
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">Command or Code Snippet</span>
                      <textarea
                        className="textarea mono"
                        style={{ fontSize: 12.5, minHeight: 84 }}
                        value={sec.codeSnippet}
                        onChange={(e) => updateSec(idx, { codeSnippet: e.target.value })}
                        placeholder="hx rollout undo --cell eu-central-1"
                      />
                    </label>
                  </div>
                )}

                {/* Interactive Checklist Sub-editor */}
                {sec.hasChecklist && (
                  <div
                    className="stack stack--sm"
                    style={{ padding: 12, borderRadius: 'var(--r-sm)', background: 'var(--bg-2)', border: '1px solid var(--border)' }}
                  >
                    <div className="row row--between">
                      <span className="field-label">Interactive Runbook Steps</span>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() =>
                          updateSec(idx, {
                            checklistItems: [
                              ...sec.checklistItems,
                              { id: `chk-${Date.now()}-${sec.checklistItems.length + 1}`, label: '' },
                            ],
                          })
                        }
                      >
                        <Plus /> Add step
                      </button>
                    </div>
                    {sec.checklistItems.map((item, cIdx) => (
                      <div key={item.id} className="row" style={{ gap: 8 }}>
                        <input
                          type="text"
                          className="input grow"
                          value={item.label}
                          onChange={(e) => {
                            const next = sec.checklistItems.map((x, j) =>
                              j === cIdx ? { ...x, label: e.target.value } : x,
                            );
                            updateSec(idx, { checklistItems: next });
                          }}
                          placeholder={`Step ${cIdx + 1} action…`}
                        />
                        {sec.checklistItems.length > 1 && (
                          <button
                            type="button"
                            className="icon-btn icon-btn--sm"
                            aria-label="Remove checklist item"
                            onClick={() =>
                              updateSec(idx, {
                                checklistItems: sec.checklistItems.filter((_, j) => j !== cIdx),
                              })
                            }
                          >
                            <Trash2 />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <div className="row row--between row--wrap" style={{ gap: 12, paddingTop: 6 }}>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  navigate(mode === 'edit' && existingArticle ? `/wiki/doc/${existingArticle.slug}` : '/wiki')
                }
              >
                Cancel
              </button>

              <div className="row row--wrap" style={{ gap: 10 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setViewMode('preview')}
                >
                  <Eye /> Preview Playbook
                </button>
                <button type="submit" className="wk-btn-cortex">
                  {mode === 'create' ? (
                    <>
                      <Sparkles /> Publish Playbook
                    </>
                  ) : isProposalSubmission ? (
                    <>
                      <GitPullRequest /> Submit Change Proposal
                    </>
                  ) : (
                    <>
                      <Save /> Save Verified Revision
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
