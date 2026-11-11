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
import { Switch } from '@/components/ui/primitives';
import { NeoEmpty, NeoPanel, NeoTabs } from '@/components/neo';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { canDirectEdit, canProposeEdit, canReadArticle, canReadSpace } from '@/wiki/access';
import { ARTICLE_TEMPLATES } from '@/wiki/constants';
import { useWikiCaps, useWikiViewer } from '@/wiki/selectors';
import { useWiki } from '@/wiki/store';
import type { ArticleSection, ChangeProposal, SpaceId } from '@/wiki/types';
import { ProposalTracker, useMyArticleProposals } from './wikiTrackers';
import { DocSection, SpaceBoundaryCard, SpacePill, WikiHeadActions } from './wikiUi';

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

  /** Your latest proposal on this page (pending, or decided in the last 14 days) — shown in the mode banner. */
  const myLatestProposal: ChangeProposal | undefined = useMyArticleProposals(
    mode === 'edit' ? existingArticle?.id : undefined,
    1,
  )[0];

  // Contractor / Read-only gate
  if (!caps.canWrite) {
    return (
      <div className="neo-denied wk-wall">
        <NeoEmpty
          icon={<Lock />}
          title="Contributor permission required to author or edit"
          action={
            <Link to="/wiki" className="neo-btn neo-btn--soft">
              <ArrowLeft /> Back to Knowledge Base
            </Link>
          }
        >
          Your current account has read-only access to cleared Knowledge Base spaces and <strong>Ask Nova Docs</strong>. Publishing
          new playbooks or submitting Change Proposals requires the <code className="neo-mono">wiki.write</code> permission.
        </NeoEmpty>
      </div>
    );
  }

  if (mode === 'edit' && !existingArticle) {
    return (
      <NeoPanel>
        <NeoEmpty
          icon={<BookOpen />}
          title="Playbook not found"
          action={
            <Link to="/wiki" className="neo-btn neo-btn--soft">
              <ArrowLeft /> Back to Knowledge Base
            </Link>
          }
        >
          Cannot edit unknown playbook “{slug}”.
        </NeoEmpty>
      </NeoPanel>
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
  const selectedSpace = spaces.find((s) => s.id === spaceId);

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
        navigate(res.proposalId ? `/wiki/governance?proposal=${res.proposalId}` : '/wiki/governance');
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
    <div className="wk-studio">
      {/* Studio actions portal into NeoHead — no duplicated page header */}
      <WikiHeadActions>
        <Link
          to={mode === 'edit' && existingArticle ? `/wiki/doc/${existingArticle.slug}` : '/wiki'}
          className="neo-btn neo-btn--ghost"
        >
          <ArrowLeft /> <span className="neo-btn__label">{mode === 'edit' ? 'Back to page' : 'Cancel'}</span>
        </Link>
        <NeoTabs<'compose' | 'preview'>
          label="Editor mode"
          value={viewMode}
          onChange={setViewMode}
          items={[
            { value: 'compose', label: 'Compose', icon: <PenLine /> },
            { value: 'preview', label: 'Live preview', icon: <Eye /> },
          ]}
        />
      </WikiHeadActions>

      {/* Governance / Four-Eyes Banner on Edit */}
      {mode === 'edit' && existingArticle && (
        <div className={cx('wk-studio-mode', isProposalSubmission && 'is-proposal')}>
          <div className="wk-studio-mode__main">
            <span className="wk-space-icon" style={{ '--sp-h': 174, '--sz': '38px' } as CSSProperties}>
              {isProposalSubmission ? <GitPullRequest /> : <Save />}
            </span>
            <div className="wk-studio-mode__text">
              <strong>
                {!directAllowed
                  ? 'Locked Canonical Policy — Four-Eyes Change Proposal Mode'
                  : isProposalSubmission
                    ? 'Submitting as a Change Proposal for Curator Review'
                    : 'Direct Versioned Edit Mode'}
              </strong>
              <span>
                {!directAllowed
                  ? 'Because this canonical page is locked, your edits will enter the Governance queue for curator approval.'
                  : isProposalSubmission
                    ? 'Another curator (separation of duties) will review and publish this proposal.'
                    : 'Your edit will immediately publish a new verified revision to the version timeline.'}
              </span>
            </div>
          </div>

          {directAllowed && (
            <label className="wk-studio-mode__switch">
              <span>Submit as Change Proposal (four-eyes review)</span>
              <Switch
                checked={forceProposal}
                onChange={setForceProposal}
                label="Submit as Change Proposal for four-eyes review"
              />
            </label>
          )}

          {/* Your proposal already in flight on this page (or its recent outcome) */}
          {myLatestProposal && (
            <ProposalTracker
              proposal={myLatestProposal}
              article={existingArticle}
              space={existingSpace}
              variant="bare"
              title={myLatestProposal.summary}
            />
          )}
        </div>
      )}

      {/* Starter Template Picker on /wiki/new */}
      {mode === 'create' && viewMode === 'compose' && (
        <NeoPanel
          hud="Step 1 · Blueprint"
          title="Choose a starter blueprint"
          icon={<Sparkles />}
          actions={<span className="neo-hud">Hydrates structured sections &amp; checklists</span>}
        >
          <div className="wk-tpl-grid">
            {ARTICLE_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                className={cx('wk-tpl-card', selectedTpl === tpl.id && 'is-selected')}
                onClick={() => applyTemplate(tpl.id)}
              >
                <div className="wk-tpl-card__top">
                  <Sparkles aria-hidden="true" />
                  <strong>{tpl.name}</strong>
                </div>
                <span className="wk-tpl-card__desc">{tpl.description}</span>
              </button>
            ))}
            <button
              type="button"
              className={cx('wk-tpl-card', selectedTpl === 'blank' && 'is-selected')}
              onClick={() => applyTemplate('blank')}
            >
              <div className="wk-tpl-card__top">
                <FilePlus2 aria-hidden="true" />
                <strong>Blank Playbook</strong>
              </div>
              <span className="wk-tpl-card__desc">Start from a clean slate with custom sections.</span>
            </button>
          </div>
        </NeoPanel>
      )}

      {viewMode === 'preview' ? (
        /* Live Preview Pane */
        <article className="wk-doc wk-studio__preview">
          <header className="wk-doc__intro">
            <div className="wk-doc__chips">
              <span className="neo-chip" data-tone="app">
                <Eye /> Live preview
              </span>
              {selectedSpace && <SpacePill space={selectedSpace} />}
              {lockedCanonical && (
                <span className="neo-chip" data-tone="amber">
                  <Lock /> Locked canonical policy
                </span>
              )}
            </div>
            <h2 className="wk-studio__preview-title">{title || 'Untitled Playbook'}</h2>
            <p className="wk-studio__preview-sub">{subtitle || 'Playbook subtitle preview'}</p>
            {tldr && (
              <div className="wk-tldr">
                <span className="neo-hud neo-hud--tint">
                  <Sparkles aria-hidden="true" /> Executive TL;DR
                </span>
                <p>{tldr}</p>
              </div>
            )}
            {parsedTags.length > 0 && (
              <div className="wk-doc__tags">
                {parsedTags.map((t) => (
                  <span key={t} className="wk-tag">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </header>

          <div className="wk-doc__sections">
            {previewSections.map((sec, i) => (
              <DocSection key={sec.id} section={sec} index={i} preview />
            ))}
          </div>
        </article>
      ) : (
        /* Structured Composer Form */
        <form onSubmit={handleSubmit} className="wk-studio__form">
          <NeoPanel
            hud={mode === 'create' ? 'Step 2 · Metadata' : 'Playbook metadata'}
            title="Placement, summary & governance"
            icon={<BookOpen />}
          >
            <div className="wk-stack">
              <div className="wk-form-grid-2">
                <label className="neo-field">
                  <span className="neo-label">Knowledge Space</span>
                  <select
                    className="neo-select"
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

                <label className="neo-field">
                  <span className="neo-label">Freshness Review Cadence</span>
                  <select
                    className="neo-select"
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
                <label className="neo-field">
                  <span className="neo-label">Playbook Title *</span>
                  <input
                    type="text"
                    className="neo-input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Canary Rollback & Cell Traffic Drain Runbook"
                    required
                  />
                </label>

                <label className="neo-field">
                  <span className="neo-label">One-Line Subtitle</span>
                  <input
                    type="text"
                    className="neo-input"
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    placeholder="Who this guide is for and what outcome it unlocks"
                  />
                </label>
              </div>

              <label className="neo-field">
                <span className="neo-label">Executive TL;DR (used by Nova Docs synthesis) *</span>
                <textarea
                  className="neo-textarea"
                  value={tldr}
                  onChange={(e) => setTldr(e.target.value)}
                  placeholder="Two crisp sentences summarizing the policy or workflow…"
                  required
                />
              </label>

              <div className="wk-form-grid-2">
                <label className="neo-field">
                  <span className="neo-label">Tags (comma-separated)</span>
                  <input
                    type="text"
                    className="neo-input"
                    value={tagsText}
                    onChange={(e) => setTagsText(e.target.value)}
                    placeholder="runbook, incident, security, onboarding"
                  />
                  {parsedTags.length > 0 && (
                    <div className="wk-doc__tags">
                      {parsedTags.map((t) => (
                        <span key={t} className="wk-tag">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </label>

                {mode === 'create' && caps.canManage && (
                  <div className="neo-field">
                    <span className="neo-label">Canonical Governance</span>
                    <label className="wk-studio__toggle-row">
                      <Switch
                        checked={lockedCanonical}
                        onChange={setLockedCanonical}
                        label="Lock as Canonical Policy"
                      />
                      <span>Lock canonical page (contributors submit Change Proposals)</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Companion Helix Academy Courses Picker */}
              {academyCourses.length > 0 && !isProposalSubmission && (
                <div className="neo-field">
                  <span className="neo-label">Companion Helix Academy Courses (optional)</span>
                  <div className="wk-tags" role="group" aria-label="Select companion Academy courses">
                    {academyCourses.map((c) => {
                      const active = relatedCourseIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className="neo-chip"
                          data-tone={active ? 'app' : 'slate'}
                          aria-pressed={active}
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
                <label className="neo-field">
                  <span className="neo-label">
                    {isProposalSubmission
                      ? 'Change Proposal Rationale (shown to reviewing curators) *'
                      : 'Revision Summary (recorded in Version History) *'}
                  </span>
                  <input
                    type="text"
                    className="neo-input"
                    value={changeSummary}
                    onChange={(e) => setChangeSummary(e.target.value)}
                    placeholder="e.g., Updated canary abort CLI command for mesh v4.8 and clarified escalation SLA"
                    required
                  />
                </label>
              )}
            </div>
          </NeoPanel>

          {/* Dynamic Section Builder */}
          <NeoPanel
            hud={mode === 'create' ? 'Step 3 · Content' : 'Structured content'}
            title="Playbook sections"
            icon={<PenLine />}
            actions={
              <>
                <span className="neo-count">{sections.length}</span>
                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--sm"
                  onClick={() => setSections((prev) => [...prev, blankSection(prev.length + 1)])}
                >
                  <Plus /> Add section
                </button>
              </>
            }
          >
            <div className="wk-stack">
              {sections.map((sec, idx) => (
                <div key={sec.id} className="wk-editor-sec">
                  <div className="wk-editor-sec__head">
                    <span className="wk-sec__num">0{idx + 1}</span>
                    <span className="wk-editor-sec__label">Section {idx + 1}</span>
                    <div className="wk-editor-sec__acts">
                      <button
                        type="button"
                        className="neo-btn neo-btn--ghost neo-btn--xs"
                        disabled={idx === 0}
                        onClick={() => moveSection(idx, -1)}
                        aria-label="Move section up"
                      >
                        <ArrowUp />
                      </button>
                      <button
                        type="button"
                        className="neo-btn neo-btn--ghost neo-btn--xs"
                        disabled={idx === sections.length - 1}
                        onClick={() => moveSection(idx, 1)}
                        aria-label="Move section down"
                      >
                        <ArrowDown />
                      </button>
                      <button
                        type="button"
                        className="neo-btn neo-btn--danger neo-btn--xs"
                        onClick={() => removeSection(idx)}
                        aria-label="Delete section"
                      >
                        <Trash2 />
                      </button>
                    </div>
                  </div>

                  <label className="neo-field">
                    <span className="neo-label">Section Heading *</span>
                    <input
                      type="text"
                      className="neo-input"
                      value={sec.heading}
                      onChange={(e) => updateSec(idx, { heading: e.target.value })}
                      placeholder="e.g., Immediate Mitigation (First 5 Minutes)"
                      required
                    />
                  </label>

                  <label className="neo-field">
                    <span className="neo-label">Section Body *</span>
                    <textarea
                      className="neo-textarea"
                      value={sec.body}
                      onChange={(e) => updateSec(idx, { body: e.target.value })}
                      placeholder="Write clear, actionable guidance…"
                      required
                    />
                  </label>

                  {/* Optional Block Toggles */}
                  <div className="wk-tags">
                    <button
                      type="button"
                      className="neo-chip"
                      data-tone={sec.hasCallout ? 'app' : 'slate'}
                      aria-pressed={sec.hasCallout}
                      onClick={() => updateSec(idx, { hasCallout: !sec.hasCallout })}
                    >
                      <Info /> {sec.hasCallout ? 'Callout enabled' : '+ Callout box'}
                    </button>
                    <button
                      type="button"
                      className="neo-chip"
                      data-tone={sec.hasCode ? 'app' : 'slate'}
                      aria-pressed={sec.hasCode}
                      onClick={() => updateSec(idx, { hasCode: !sec.hasCode })}
                    >
                      <Code2 /> {sec.hasCode ? 'Code snippet enabled' : '+ Code snippet'}
                    </button>
                    <button
                      type="button"
                      className="neo-chip"
                      data-tone={sec.hasChecklist ? 'app' : 'slate'}
                      aria-pressed={sec.hasChecklist}
                      onClick={() => updateSec(idx, { hasChecklist: !sec.hasChecklist })}
                    >
                      <ListChecks /> {sec.hasChecklist ? 'Runbook checklist enabled' : '+ Interactive checklist'}
                    </button>
                  </div>

                  {/* Callout Sub-editor */}
                  {sec.hasCallout && (
                    <div className="wk-editor-sub">
                      <div className="wk-form-grid-2">
                        <label className="neo-field">
                          <span className="neo-label">Callout Tone</span>
                          <select
                            className="neo-select"
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
                        <label className="neo-field">
                          <span className="neo-label">Callout Title</span>
                          <input
                            type="text"
                            className="neo-input"
                            value={sec.calloutTitle}
                            onChange={(e) => updateSec(idx, { calloutTitle: e.target.value })}
                            placeholder="e.g., Golden Rule"
                          />
                        </label>
                      </div>
                      <label className="neo-field">
                        <span className="neo-label">Callout Message</span>
                        <input
                          type="text"
                          className="neo-input"
                          value={sec.calloutText}
                          onChange={(e) => updateSec(idx, { calloutText: e.target.value })}
                          placeholder="Key guardrail or reminder…"
                        />
                      </label>
                    </div>
                  )}

                  {/* Code Snippet Sub-editor */}
                  {sec.hasCode && (
                    <div className="wk-editor-sub">
                      <label className="neo-field">
                        <span className="neo-label">Snippet Header Label</span>
                        <input
                          type="text"
                          className="neo-input"
                          value={sec.codeLabel}
                          onChange={(e) => updateSec(idx, { codeLabel: e.target.value })}
                          placeholder="e.g., bash · rollback canary"
                        />
                      </label>
                      <label className="neo-field">
                        <span className="neo-label">Command or Code Snippet</span>
                        <textarea
                          className="neo-textarea neo-mono"
                          value={sec.codeSnippet}
                          onChange={(e) => updateSec(idx, { codeSnippet: e.target.value })}
                          placeholder="hx rollout undo --cell eu-central-1"
                        />
                      </label>
                    </div>
                  )}

                  {/* Interactive Checklist Sub-editor */}
                  {sec.hasChecklist && (
                    <div className="wk-editor-sub">
                      <div className="wk-editor-sub__head">
                        <span className="neo-label">Interactive Runbook Steps</span>
                        <button
                          type="button"
                          className="neo-btn neo-btn--ghost neo-btn--xs"
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
                        <div key={item.id} className="wk-editor-sub__row">
                          <input
                            type="text"
                            className="neo-input"
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
                              className="neo-iconbtn neo-iconbtn--sm"
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
            </div>
          </NeoPanel>

          <div className="wk-studio__foot">
            <button
              type="button"
              className="neo-btn neo-btn--ghost"
              onClick={() =>
                navigate(mode === 'edit' && existingArticle ? `/wiki/doc/${existingArticle.slug}` : '/wiki')
              }
            >
              Cancel
            </button>

            <div className="wk-studio__foot-acts">
              <button
                type="button"
                className="neo-btn neo-btn--soft"
                onClick={() => setViewMode('preview')}
              >
                <Eye /> Preview playbook
              </button>
              <button type="submit" className="neo-btn neo-btn--plasma">
                {mode === 'create' ? (
                  <>
                    <Sparkles /> Publish playbook
                  </>
                ) : isProposalSubmission ? (
                  <>
                    <GitPullRequest /> Submit change proposal
                  </>
                ) : (
                  <>
                    <Save /> Save verified revision
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
