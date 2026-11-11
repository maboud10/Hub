/**
 * DevHub ("Forge") — ReviewsView (/devhub/reviews)
 * Interactive PR workbench: 5-stage PR NeoTracker, explainable risk breakdown,
 * push-protection secret-scan banner (Vault + Security SOC hand-offs),
 * syntax-tinted diff hunks with inline comments & 1-click Nova suggestions.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  AlertTriangle,
  Award,
  Check,
  CheckCircle2,
  FileCode2,
  FolderKanban,
  GitMerge,
  GitPullRequest,
  KeyRound,
  MessageSquare,
  MessagesSquare,
  Plus,
  Send,
  ShieldAlert,
  Sparkles,
  UserPlus,
  Video,
  XCircle,
} from 'lucide-react';
import {
  Chip,
  NeoEmpty,
  NeoPanel,
  NeoSearch,
  NeoTabs,
  NeoTracker,
  NovaChip,
  Orb,
  PeoplePicker,
} from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { useI18n } from '@/lib/i18n';
import { useSessionUser } from '@/store/selectors';
import { useDevHubAccess } from '@/devhub/access';
import {
  checksSummary,
  diffStats,
  fileStats,
  isAwaiting,
  prStage,
  reviewQueue,
  RiskFactor,
  riskScore,
  suggestReviewers,
  tokenize,
} from '@/devhub/engine';
import { useDevHub } from '@/devhub/store';
import {
  RISK_FACTOR_LABELS,
  RelTime,
  RiskBadge,
  UserPill,
  createProjectTaskFromDevhub,
  launchPairRoom,
  logPerformanceEvidenceFromDevhub,
  reportSecretToSecuritySoc,
  rotateSecretInVault,
  shareToPulseChat,
} from './parts';

type FilterTab = 'all' | 'awaiting' | 'mine' | 'queued' | 'merged';

const FIVE_STAGE_PR_STEPS = [
  { id: 'open', label: 'Opened' },
  { id: 'review', label: 'Code Review' },
  { id: 'checks', label: 'CI & Security' },
  { id: 'queue', label: 'Merge Queue' },
  { id: 'deployed', label: 'Deployed' },
];

export function ReviewsView() {
  const me = useSessionUser();
  const userId = me?.id ?? 'u-priya';
  const caps = useDevHubAccess();
  const locale = useI18n((s) => s.locale);
  const now = useNow(20_000);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const prs = useDevHub((s) => s.prs);
  const services = useDevHub((s) => s.services);
  const owners = useDevHub((s) => s.owners);
  const deploys = useDevHub((s) => s.deploys);

  const submitReview = useDevHub((s) => s.submitReview);
  const addComment = useDevHub((s) => s.addComment);
  const applySuggestion = useDevHub((s) => s.applySuggestion);
  const resolveComment = useDevHub((s) => s.resolveComment);
  const requestReviewer = useDevHub((s) => s.requestReviewer);
  const enqueuePr = useDevHub((s) => s.enqueuePr);
  const mergePr = useDevHub((s) => s.mergePr);
  const markPrTaskLinked = useDevHub((s) => s.markPrTaskLinked);
  const markPrEvidence = useDevHub((s) => s.markPrEvidence);
  const markPrChatShared = useDevHub((s) => s.markPrChatShared);

  const [tab, setTab] = useState<FilterTab>('all');
  const [q, setQ] = useState('');
  const [commentText, setCommentText] = useState('');
  const [inlineTarget, setInlineTarget] = useState<{ file: string; line: number } | null>(null);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return prs.filter((p) => {
      if (tab === 'awaiting' && !isAwaiting(p, userId)) return false;
      if (tab === 'mine' && p.authorId !== userId) return false;
      if (tab === 'queued' && p.state !== 'queued' && p.state !== 'approved') return false;
      if (tab === 'merged' && p.state !== 'merged') return false;
      if (!query) return true;
      return `${p.number} ${p.title} ${p.service} ${p.branch} ${p.labels.join(' ')}`.toLowerCase().includes(query);
    });
  }, [prs, tab, q, userId]);

  const selectedId = params.get('pr') ?? filtered[0]?.id ?? prs[0]?.id;
  const pr = prs.find((p) => p.id === selectedId) ?? filtered[0] ?? prs[0];

  const selectPr = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('pr', id);
    setParams(next, { replace: true });
    setInlineTarget(null);
  };

  if (!pr) {
    return <NeoEmpty icon={<GitPullRequest />} title="No pull requests match your filter" />;
  }

  const svc = services.find((s) => s.id === pr.service);
  const risk = riskScore(pr, svc);
  const stats = diffStats(pr.files);
  const ckStatus = checksSummary(pr.checks);
  const linkedDeploy = deploys.find((d) => d.id === pr.deployId || d.prId === pr.id);
  const rawStage = prStage(pr, linkedDeploy);
  const fiveStageCurrent =
    rawStage.current >= 6 ? 5 : rawStage.current >= 4 ? 3 : rawStage.current >= 2 ? 2 : rawStage.current >= 1 ? 1 : 0;

  const reviewerLoads = useMemo(() => {
    const map: Record<string, number> = {};
    for (const u of ['u-priya', 'u-lucas', 'u-omar', 'u-ethan', 'u-kwame', 'u-layla']) {
      map[u] = reviewQueue(prs, u).length;
    }
    return map;
  }, [prs]);

  const suggested = suggestReviewers(pr, owners, reviewerLoads, 3);

  return (
    <div className="dh-stack">
      <div className="dh-toolbar-row">
        <NeoTabs<FilterTab>
          label="Filter pull requests"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'all', label: 'All PRs', count: prs.length },
            { value: 'awaiting', label: 'Awaiting my review', count: reviewQueue(prs, userId).length },
            { value: 'mine', label: 'My PRs', count: prs.filter((p) => p.authorId === userId).length },
            { value: 'queued', label: 'Merge queue', count: prs.filter((p) => p.state === 'queued' || p.state === 'approved').length },
            { value: 'merged', label: 'Merged', count: prs.filter((p) => p.state === 'merged').length },
          ]}
        />
        <NeoSearch
          value={q}
          onChange={setQ}
          placeholder="Search PR #, title, branch or service…"
          className="dh-search-wide"
        />
      </div>

      <div className="dh-split">
        {/* Left column: PR list */}
        <aside className="dh-split__list" aria-label="Pull requests list">
          {filtered.map((item) => {
            const itemSvc = services.find((s) => s.id === item.service);
            const itemRisk = riskScore(item, itemSvc);
            const itemCk = checksSummary(item.checks);
            const active = item.id === pr.id;
            return (
              <button
                key={item.id}
                type="button"
                className="dh-list-card neo-spot"
                data-active={active || undefined}
                onClick={() => selectPr(item.id)}
              >
                <div className="dh-list-card__top">
                  <span className="neo-mono dh-pr-num">{`#${item.number}`}</span>
                  <Orb
                    tone={
                      item.secret?.status === 'blocking' || itemCk === 'failure'
                        ? 'danger'
                        : item.state === 'merged'
                          ? 'violet'
                          : itemCk === 'running'
                            ? 'warning'
                            : 'success'
                    }
                    size={8}
                  />
                  <span className="dh-list-card__title">{item.title}</span>
                </div>
                <div className="dh-list-card__meta">
                  <span className="neo-mono">{item.service}</span>
                  <span>·</span>
                  <UserPill userId={item.authorId} size={16} />
                  <RiskBadge report={itemRisk} compact />
                </div>
                {item.secret && (
                  <div className="dh-list-card__flag">
                    <ShieldAlert />
                    <span>{item.secret.id ?? 'secret-scan'}</span>
                    <span>·</span>
                    <span>{item.secret.status}</span>
                  </div>
                )}
              </button>
            );
          })}
        </aside>

        {/* Right column: PR detail workbench */}
        <div className="dh-split__detail dh-stack">
          <NeoPanel
            hud={`${pr.repo} · ${pr.branch} → ${pr.base}`}
            title={`#${pr.number} · ${pr.title}`}
            icon={<GitPullRequest />}
            actions={
              <div className="dh-inline-actions">
                <RiskBadge report={risk} />
                <Chip
                  tone={
                    pr.state === 'merged'
                      ? 'violet'
                      : pr.state === 'approved' || pr.state === 'queued'
                        ? 'success'
                        : pr.state === 'changes_requested'
                          ? 'danger'
                          : 'app'
                  }
                >
                  <span>{pr.state.replace('_', ' ')}</span>
                </Chip>
              </div>
            }
          >
            <p className="dh-pr-body">{pr.body}</p>

            <div className="dh-pr-meta-bar">
              <div className="dh-pr-meta-bar__group">
                <span className="neo-hud">Author</span>
                <UserPill userId={pr.authorId} size={22} />
              </div>

              <div className="dh-pr-meta-bar__group">
                <span className="neo-hud">Reviewers</span>
                <div className="dh-inline-actions">
                  {pr.reviewers.map((r) => (
                    <Chip
                      key={r.reviewerId}
                      tone={r.state === 'approved' ? 'success' : r.state === 'changes_requested' ? 'danger' : 'slate'}
                      size="sm"
                    >
                      <UserPill userId={r.reviewerId} size={16} />
                      <span>{r.state.replace('_', ' ')}</span>
                    </Chip>
                  ))}
                  {caps.canReview && (
                    <PeoplePicker
                      value={pr.reviewers.map((r) => r.reviewerId)}
                      onChange={(ids) => {
                        const added = ids.find((id) => !pr.reviewers.some((r) => r.reviewerId === id));
                        if (added) requestReviewer(pr.id, added);
                      }}
                      trigger={(p) => (
                        <button {...p} type="button" className="neo-btn neo-btn--ghost neo-btn--xs">
                          <UserPlus />
                          <span>Add reviewer</span>
                        </button>
                      )}
                    />
                  )}
                </div>
              </div>

              {suggested.length > 0 && pr.state !== 'merged' && (
                <div className="dh-pr-meta-bar__group">
                  <span className="neo-hud">CODEOWNERS suggested</span>
                  <div className="dh-inline-actions">
                    {suggested.map((s) => (
                      <button
                        key={s.userId}
                        type="button"
                        className="neo-chip neo-chip--sm"
                        data-tone="slate"
                        onClick={() => requestReviewer(pr.id, s.userId)}
                        title={`Owns ${Math.round(s.share * 100)}% of touched files`}
                      >
                        <Plus />
                        <UserPill userId={s.userId} size={15} />
                        <span className="neo-mono">{`${Math.round(s.share * 100)}%`}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <NeoTracker
              bare
              hud="Pull Request Delivery Tracker"
              steps={FIVE_STAGE_PR_STEPS}
              current={fiveStageCurrent}
              state={rawStage.state}
              eta={
                pr.secret?.status === 'blocking'
                  ? 'Blocked by push protection'
                  : pr.state === 'queued'
                    ? `Queue #${pr.queuePosition ?? 1}`
                    : ckStatus === 'success'
                      ? 'All required checks green'
                      : 'Checks in progress'
              }
            />

            {/* Review & Merge Action Bar */}
            <div className="dh-action-strip">
              {caps.canReview && pr.state !== 'merged' && (
                <>
                  <button
                    type="button"
                    className="neo-btn neo-btn--success neo-btn--sm"
                    onClick={() => submitReview(pr.id, userId, 'approved', commentText || undefined)}
                  >
                    <Check />
                    <span>Approve PR</span>
                  </button>
                  <button
                    type="button"
                    className="neo-btn neo-btn--danger neo-btn--sm"
                    onClick={() => submitReview(pr.id, userId, 'changes_requested', commentText || 'Please address inline review feedback.')}
                  >
                    <XCircle />
                    <span>Request Changes</span>
                  </button>
                </>
              )}

              {caps.canMerge && pr.state !== 'merged' && (
                <>
                  {pr.state !== 'queued' && (
                    <button
                      type="button"
                      className="neo-btn neo-btn--soft neo-btn--sm"
                      onClick={() => enqueuePr(pr.id, userId)}
                    >
                      <GitPullRequest />
                      <span>Enqueue Merge</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="neo-btn neo-btn--plasma neo-btn--sm"
                    onClick={() => mergePr(pr.id, userId)}
                  >
                    <GitMerge />
                    <span>Merge & Deploy Staging</span>
                  </button>
                </>
              )}

              <div className="dh-action-strip__spacer" />

              {/* Cross-App Hand-offs */}
              <button
                type="button"
                className="neo-btn neo-btn--ghost neo-btn--xs"
                onClick={async () => {
                  const task = await createProjectTaskFromDevhub({
                    title: `Follow up on PR #${pr.number}: ${pr.title}`,
                    notes: pr.body,
                    to: `/devhub/reviews?pr=${pr.id}`,
                    label: `PR #${pr.number}`,
                  });
                  markPrTaskLinked(pr.id, task);
                }}
              >
                <FolderKanban />
                <span>{pr.linkedTask ? 'Linked in Projects' : 'Task in Projects'}</span>
              </button>

              <button
                type="button"
                className="neo-btn neo-btn--ghost neo-btn--xs"
                onClick={async () => {
                  await shareToPulseChat({
                    title: `PR #${pr.number} · ${pr.title}`,
                    subtitle: `${pr.repo} · Risk ${risk.score}/100`,
                    to: `/devhub/reviews?pr=${pr.id}`,
                    status: pr.state.toUpperCase(),
                    text: `Please review PR #${pr.number} (${pr.title}) on ${pr.service}.`,
                  });
                  markPrChatShared(pr.id);
                }}
              >
                <MessagesSquare />
                <span>Share to Chat</span>
              </button>

              <button
                type="button"
                className="neo-btn neo-btn--ghost neo-btn--xs"
                onClick={async () => {
                  await logPerformanceEvidenceFromDevhub({
                    userId: pr.authorId,
                    title: `Shipped PR #${pr.number}: ${pr.title}`,
                    detail: `${pr.repo} (+${stats.additions}/-${stats.deletions})`,
                    to: `/devhub/reviews?pr=${pr.id}`,
                    label: `DevHub PR #${pr.number}`,
                  });
                  markPrEvidence(pr.id);
                }}
              >
                <Award />
                <span>{pr.evidenceLogged ? 'Evidence Logged' : 'Log OKR Evidence'}</span>
              </button>

              <button
                type="button"
                className="neo-btn neo-btn--ghost neo-btn--xs"
                onClick={() => void launchPairRoom(`Pair Review · PR #${pr.number}`, navigate)}
              >
                <Video />
                <span>Pair in HoloMeet</span>
              </button>
            </div>
          </NeoPanel>

          {/* Push Protection Secret Finding Banner */}
          {pr.secret && (
            <NeoPanel
              hud={`Aegis Push Protection · ${pr.secret.id ?? 'secret-scan'}`}
              title={`High-Entropy Credential Detected (${pr.secret.kind})`}
              icon={<ShieldAlert />}
              className="dh-secret-panel"
              actions={
                <Chip
                  tone={pr.secret.status === 'rotated' ? 'success' : pr.secret.status === 'reported' ? 'warning' : 'danger'}
                >
                  <span>{pr.secret.status}</span>
                </Chip>
              }
            >
              <div className="dh-secret-panel__body">
                <p>
                  <span>Committed in </span>
                  <code className="neo-mono">{`${pr.secret.file}:${pr.secret.line}`}</code>
                  <span> · Redacted preview: </span>
                  <code className="neo-mono">{pr.secret.preview}</code>
                </p>
                <div className="dh-inline-actions">
                  {pr.secret.status !== 'rotated' && (
                    <button
                      type="button"
                      className="neo-btn neo-btn--plasma neo-btn--sm"
                      onClick={() =>
                        void rotateSecretInVault({
                          prId: pr.id,
                          resource: `vault://${pr.service}/${pr.secret?.file ?? 'secret'}`,
                          reason: `Rotate leaked ${pr.secret?.kind} on PR #${pr.number}`,
                        })
                      }
                    >
                      <KeyRound />
                      <span>Rotate Secret in Vault</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="neo-btn neo-btn--soft neo-btn--sm"
                    onClick={() =>
                      void reportSecretToSecuritySoc({
                        prId: pr.id,
                        title: `Leaked ${pr.secret?.kind} in ${pr.repo} PR #${pr.number}`,
                        detail: `File ${pr.secret?.file}:${pr.secret?.line} (${pr.secret?.id ?? 'secret'})`,
                      })
                    }
                  >
                    <AlertTriangle />
                    <span>Report to Security SOC</span>
                  </button>
                  <Link to="/vault/secrets" className="neo-btn neo-btn--ghost neo-btn--sm">
                    <span>Open Aegis Vault</span>
                  </Link>
                </div>
              </div>
            </NeoPanel>
          )}

          {/* Explainable Risk & Nova AI Review */}
          <div className="dh-grid-2">
            <NeoPanel
              hud="Explainable Risk Engine"
              title={`Risk Breakdown · ${risk.score}/100`}
              icon={<Sparkles />}
            >
              <div className="dh-risk-list">
                {risk.factors.map((f: RiskFactor) => (
                  <div key={f.key} className="dh-risk-item">
                    <div className="dh-risk-item__top">
                      <span>{RISK_FACTOR_LABELS[f.key] ?? f.key}</span>
                      <span className="neo-mono">{`+${f.points} pts`}</span>
                    </div>
                    {f.files && f.files.length > 0 && (
                      <div className="dh-risk-item__files neo-mono">{f.files.join(', ')}</div>
                    )}
                  </div>
                ))}
              </div>
            </NeoPanel>

            <NeoPanel
              hud="Nova AI Reviewer & CI Checks"
              title="Automated Verification"
              icon={<CheckCircle2 />}
              actions={<NovaChip>Nova Code Audit</NovaChip>}
            >
              {pr.nova && (
                <p className="dh-nova-summary">
                  {locale === 'ar' ? pr.nova.ar : pr.nova.en}
                </p>
              )}
              <div className="dh-checks-grid">
                {pr.checks.map((ck) => (
                  <div key={ck.name} className="dh-check-pill">
                    <Orb
                      tone={
                        ck.status === 'success'
                          ? 'success'
                          : ck.status === 'failure'
                            ? 'danger'
                            : ck.status === 'running'
                              ? 'warning'
                              : 'slate'
                      }
                      size={7}
                    />
                    <span className="neo-mono">{ck.name}</span>
                    <span className="dh-check-pill__status">{ck.status}</span>
                  </div>
                ))}
              </div>
            </NeoPanel>
          </div>

          {/* Interactive Diff Viewer */}
          <NeoPanel
            hud={`Changed Files (${stats.files}) · +${stats.additions} / -${stats.deletions}`}
            title="Interactive Code Diff & Inline Threads"
            icon={<FileCode2 />}
            flush
          >
            <div className="dh-diffs">
              {pr.files.map((file) => {
                const fStats = fileStats(file);
                return (
                  <div key={file.path} className="dh-diff-file">
                    <header className="dh-diff-file__head">
                      <span className="neo-mono dh-diff-file__path">{file.path}</span>
                      <div className="dh-inline-actions">
                        <Chip tone="slate" size="sm">
                          <span>{file.status}</span>
                        </Chip>
                        <span className="neo-mono dh-diff-add">{`+${fStats.additions}`}</span>
                        <span className="neo-mono dh-diff-del">{`-${fStats.deletions}`}</span>
                      </div>
                    </header>

                    {file.hunks.map((hunk) => (
                      <div key={hunk.id} className="dh-hunk">
                        <div className="dh-hunk__header neo-mono">{hunk.header}</div>
                        <div className="dh-hunk__lines" dir="ltr">
                          {hunk.lines.map((line, idx) => {
                            const lineNo = line.newNo ?? line.oldNo ?? idx + 1;
                            const lineComments = pr.comments.filter(
                              (c) => c.file === file.path && c.line === line.newNo,
                            );
                            const tokens = tokenize(line.text, file.lang);
                            const isTarget =
                              inlineTarget?.file === file.path && inlineTarget?.line === lineNo;

                            return (
                              <div key={`${hunk.id}-${idx}`}>
                                <div
                                  className="dh-diff-line"
                                  data-kind={line.kind}
                                  onClick={() => setInlineTarget({ file: file.path, line: lineNo })}
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') setInlineTarget({ file: file.path, line: lineNo });
                                  }}
                                >
                                  <span className="dh-diff-line__no neo-mono">{line.oldNo ?? ''}</span>
                                  <span className="dh-diff-line__no neo-mono">{line.newNo ?? ''}</span>
                                  <span className="dh-diff-line__sign neo-mono">
                                    {line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '}
                                  </span>
                                  <span className="dh-diff-line__code neo-mono">
                                    {tokens.map((t, ti) => (
                                      <span key={ti} className={`dh-tok-${t.k}`}>
                                        {t.v}
                                      </span>
                                    ))}
                                  </span>
                                </div>

                                {lineComments.map((cm) => (
                                  <div
                                    key={cm.id}
                                    className="dh-inline-thread"
                                    data-nova={cm.nova || undefined}
                                    dir={locale === 'ar' ? 'rtl' : 'ltr'}
                                  >
                                    <div className="dh-inline-thread__head">
                                      <UserPill userId={cm.authorId} size={18} />
                                      <RelTime at={cm.at} now={now} />
                                      {cm.resolved && (
                                        <Chip tone="success" size="sm">
                                          <span>Resolved</span>
                                        </Chip>
                                      )}
                                    </div>
                                    <p className="dh-inline-thread__body">{cm.body}</p>
                                    {cm.suggestion && (
                                      <div className="dh-suggestion" dir="ltr">
                                        <div className="dh-suggestion__del neo-mono">{`- ${cm.suggestion.replace}`}</div>
                                        <div className="dh-suggestion__add neo-mono">{`+ ${cm.suggestion.with}`}</div>
                                        {!cm.applied && caps.canReview && (
                                          <button
                                            type="button"
                                            className="neo-btn neo-btn--plasma neo-btn--xs"
                                            onClick={() => applySuggestion(pr.id, cm.id, userId)}
                                          >
                                            <Sparkles />
                                            <span>Apply Nova Suggestion</span>
                                          </button>
                                        )}
                                      </div>
                                    )}
                                    <div className="dh-inline-actions">
                                      <button
                                        type="button"
                                        className="neo-btn neo-btn--ghost neo-btn--xs"
                                        onClick={() => resolveComment(pr.id, cm.id)}
                                      >
                                        <span>{cm.resolved ? 'Reopen Thread' : 'Resolve Thread'}</span>
                                      </button>
                                    </div>
                                  </div>
                                ))}

                                {isTarget && (
                                  <div className="dh-inline-composer" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
                                    <input
                                      type="text"
                                      className="neo-input neo-input--sm"
                                      placeholder={`Comment on ${file.path}:${lineNo}…`}
                                      value={commentText}
                                      onChange={(e) => setCommentText(e.target.value)}
                                    />
                                    <button
                                      type="button"
                                      className="neo-btn neo-btn--plasma neo-btn--xs"
                                      onClick={() => {
                                        addComment(pr.id, {
                                          authorId: userId,
                                          body: commentText,
                                          file: file.path,
                                          line: lineNo,
                                        });
                                        setCommentText('');
                                        setInlineTarget(null);
                                      }}
                                    >
                                      <Send />
                                      <span>Post Inline</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </NeoPanel>

          {/* General Conversation Thread */}
          <NeoPanel hud="Discussion" title="Review Conversation" icon={<MessageSquare />}>
            <div className="dh-stack">
              {pr.comments
                .filter((c) => !c.file)
                .map((cm) => (
                  <div key={cm.id} className="dh-comment-card">
                    <div className="dh-inline-thread__head">
                      <UserPill userId={cm.authorId} size={20} />
                      <RelTime at={cm.at} now={now} />
                    </div>
                    <p className="dh-inline-thread__body">{cm.body}</p>
                  </div>
                ))}

              <div className="dh-comment-box">
                <input
                  type="text"
                  className="neo-input"
                  placeholder="Leave a review comment or summary note…"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                />
                <button
                  type="button"
                  className="neo-btn neo-btn--soft"
                  onClick={() => {
                    addComment(pr.id, { authorId: userId, body: commentText });
                    setCommentText('');
                  }}
                >
                  <Send />
                  <span>Comment</span>
                </button>
              </div>
            </div>
          </NeoPanel>
        </div>
      </div>
    </div>
  );
}
