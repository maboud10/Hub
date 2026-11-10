/**
 * Guides — the self-service library (fuzzy search, category filters, a
 * most-helpful spotlight, one-click quick fixes and live known issues) and the
 * step-by-step reader (progress rail, per-step done toggles, contextual
 * actions, helpful votes and a prefilled "still stuck?" ticket).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CircleCheck,
  Clock3,
  Copy,
  Laptop,
  LayoutGrid,
  LifeBuoy,
  ListChecks,
  Plus,
  RotateCcw,
  ShoppingBag,
  Siren,
  Sparkles,
  Stethoscope,
  ThumbsDown,
  ThumbsUp,
  TicketPlus,
  Wand2,
} from 'lucide-react';
import { NeoBanner, NeoBanners, NeoEmpty, NeoHead, NeoSearch, NeoStage, Orb, Ring, type Tone } from '@/components/neo';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useNow } from '@/hooks/useNow';
import { toast } from '@/store/toast';
import { useHelpdesk } from '@/helpdesk/store';
import type { Guide, GuideStep, PlaybookId, TicketCategory } from '@/helpdesk/types';
import { CATEGORIES, CATEGORY_TONE, officeOf, SEVERITY_TONE } from '@/helpdesk/meta';
import { PLAYBOOKS, QUICK_FIXES } from '@/helpdesk/playbooks';
import { activeIncidents } from '@/helpdesk/queries';
import { PlaybookModal } from './playbook';
import { PLAYBOOK_ICON } from './icons';
import { CATEGORY_ICON, CategoryGlyph, Kbd, Panel, plural, useOpenTicket, useSetParam, useViewer } from './ui';
import { GUIDE_CATEGORY_LABEL, GuideCard, guideScore, highlightTerms, indexGuides, liveIssueFor, relatedGuides, searchGuides, type GuideScore } from './guides-parts';
import '@/styles/helpdesk/guides.css';

type Cat = 'all' | TicketCategory;
type Sort = 'helpful' | 'newest' | 'quickest';

const POPULAR = ['VPN keeps dropping', 'Passkey', 'Printer', 'Disk full', 'Phishing email', 'New phone'];
const SORTS: { id: Sort; label: string }[] = [
  { id: 'helpful', label: 'Most helpful' },
  { id: 'newest', label: 'Newest' },
  { id: 'quickest', label: 'Quickest' },
];

/** The library's last search/filter, so "back" from a guide lands where you were. */
let lastListSearch = '';

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const smooth = (): ScrollBehavior =>
  typeof window !== 'undefined' && (document.documentElement.dataset.motion === 'reduced' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) ? 'auto' : 'smooth';

/* ==========================================================================
   Library
   ========================================================================== */

export function GuidesView() {
  const viewer = useViewer();
  const guides = useHelpdesk((s) => s.guides);
  const votes = useHelpdesk((s) => s.guideVotes);
  const services = useHelpdesk((s) => s.services);
  const incidents = useHelpdesk((s) => s.incidents);
  const openTicket = useOpenTicket();
  const now = useNow(60_000);
  const [sp, setSp] = useSearchParams();
  const [sort, setSort] = useState<Sort>('helpful');
  const [fix, setFix] = useState<PlaybookId | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const me = viewer?.user.id ?? '';
  const office = officeOf(viewer?.user.location);
  const q = sp.get('q') ?? '';
  const cat: Cat = CATEGORIES.some((c) => c.id === sp.get('cat')) ? (sp.get('cat') as TicketCategory) : 'all';
  const searching = q.trim().length > 0;

  const focusSearch = (e: KeyboardEvent) => {
    e.preventDefault();
    search.current?.focus();
  };
  useHotkeys({ s: focusSearch, '/': focusSearch });

  const setFilter = (k: 'q' | 'cat', v: string | null) =>
    setSp(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (v) next.set(k, v);
        else next.delete(k);
        return next;
      },
      { replace: true },
    );
  const clearFilters = () => {
    setFilter('q', null);
    setFilter('cat', null);
  };

  useEffect(() => {
    const keep = new URLSearchParams();
    if (q) keep.set('q', q);
    if (cat !== 'all') keep.set('cat', cat);
    lastListSearch = keep.size ? `?${keep.toString()}` : '';
  }, [q, cat]);

  const scores = useMemo(() => new Map(guides.map((g) => [g.slug, guideScore(g, votes[g.slug], me)])), [guides, votes, me]);
  const scoreOf = (g: Guide) => scores.get(g.slug) ?? guideScore(g, undefined);
  const index = useMemo(() => indexGuides(guides), [guides]);
  const terms = useMemo(() => highlightTerms(q), [q]);
  const issues = useMemo(() => new Map(guides.map((g) => [g.slug, liveIssueFor(g, services, incidents, office)])), [guides, services, incidents, office]);
  const matches = useMemo(() => (searching ? searchGuides(index, q) : guides.map((guide) => ({ guide, score: 0, step: undefined }))), [searching, index, q, guides]);
  const counts = useMemo(() => {
    const m = new Map<Cat, number>([['all', matches.length]]);
    for (const h of matches) m.set(h.guide.category, (m.get(h.guide.category) ?? 0) + 1);
    return m;
  }, [matches]);
  const results = useMemo(() => {
    const list = matches.filter((h) => cat === 'all' || h.guide.category === cat);
    if (searching) return list;
    const up = (g: Guide) => scores.get(g.slug)?.up ?? g.helpful;
    const by: Record<Sort, (a: Guide, b: Guide) => number> = {
      helpful: (a, b) => up(b) - up(a),
      newest: (a, b) => b.updatedAt - a.updatedAt,
      quickest: (a, b) => a.minutes - b.minutes || up(b) - up(a),
    };
    return [...list].sort((a, b) => by[sort](a.guide, b.guide));
  }, [matches, cat, searching, sort, scores]);
  const featured = useMemo(() => [...guides].sort((a, b) => (scores.get(b.slug)?.up ?? 0) - (scores.get(a.slug)?.up ?? 0)).slice(0, 3), [guides, scores]);
  const totals = useMemo(() => {
    let up = 0;
    let total = 0;
    for (const s of scores.values()) {
      up += s.up;
      total += s.total;
    }
    return { up, pct: total ? Math.round((up / total) * 100) : 0, fixable: guides.filter((g) => g.playbookId).length };
  }, [scores, guides]);
  const fixes = useMemo(() => {
    if (cat === 'all') return QUICK_FIXES;
    const inCat = (Object.keys(PLAYBOOKS) as PlaybookId[]).filter((id) => PLAYBOOKS[id].category === cat);
    return inCat.length ? inCat : QUICK_FIXES;
  }, [cat]);
  const fresh = useMemo(() => [...guides].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4), [guides]);
  const live = activeIncidents(incidents);
  const mine = live.filter((i) => !i.offices || i.offices.includes(office));
  const elsewhere = live.length - mine.length;

  const listHud = searching ? 'Search' : cat !== 'all' ? 'Category' : 'Library';
  const listTitle = searching
    ? `${plural(results.length, 'match', 'matches')} for “${q.trim()}”${cat !== 'all' ? ` in ${GUIDE_CATEGORY_LABEL[cat]}` : ''}`
    : cat !== 'all'
      ? GUIDE_CATEGORY_LABEL[cat]
      : 'All guides';

  return (
    <NeoStage label="Guides">
      <NeoHead
        icon={<BookOpen />}
        eyebrow="Support deck · Self-service"
        title="Guides"
        sub={`${guides.length} step-by-step fixes from IT — most take under 5 minutes.`}
        actions={
          <>
            <Link to="/helpdesk" className="neo-btn neo-btn--soft" data-qa="guides-nova">
              <Sparkles /> <span className="neo-btn__label">Ask Nova</span>
            </Link>
            <button type="button" className="neo-btn neo-btn--plasma" onClick={() => openTicket()} data-tip="New ticket (C)" data-qa="guides-new">
              <Plus /> <span className="neo-btn__label">New ticket</span>
            </button>
          </>
        }
      />
      <div className="neo-body neo-pad">
        <div className="hd-guides">
          <div className="hd-guides__main">
            <section className="hd-guides-hero" aria-label="Search guides">
              <div className="hd-guides-hero__grid" aria-hidden="true" />
              <div className="hd-guides-hero__main">
                <div className="neo-hud neo-hud--tint">Knowledge base</div>
                <h2 className="hd-guides-hero__title">Find a fix in seconds</h2>
                <NeoSearch
                  value={q}
                  onChange={(v) => setFilter('q', v || null)}
                  placeholder="Search guides — try “vpn drops”, “passkey” or “printer”"
                  label="Search guides"
                  kbd="S"
                  inputRef={search}
                  className="hd-guides-hero__search"
                />
                <div className="hd-guides-hero__chips" role="list" aria-label="Popular searches">
                  <span className="neo-hud">Popular</span>
                  {POPULAR.map((p) => (
                    <button key={p} type="button" role="listitem" className="hd-suggest hd-suggest--sm" onClick={() => setFilter('q', p)} data-on={q === p || undefined}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="hd-guides-hero__stats">
                <Ring value={totals.pct / 100} size={96} stroke={7} label={`${totals.pct}% of votes say the guides helped`}>
                  <span className="hd-guides-hero__pct">
                    {totals.pct}
                    <small>%</small>
                  </span>
                </Ring>
                <span className="neo-hud hd-guides-hero__ringcap">Found helpful</span>
                <dl className="hd-guides-hero__kv">
                  <div>
                    <dt className="neo-hud">Guides</dt>
                    <dd className="neo-num">{guides.length}</dd>
                  </div>
                  <div>
                    <dt className="neo-hud">1-click fixes</dt>
                    <dd className="neo-num">{totals.fixable}</dd>
                  </div>
                  <div>
                    <dt className="neo-hud">Votes</dt>
                    <dd className="neo-num">{compact(totals.up)}</dd>
                  </div>
                </dl>
              </div>
            </section>

            <div className="hd-guides-cats" role="radiogroup" aria-label="Filter guides by category">
              <CatChip active={cat === 'all'} onClick={() => setFilter('cat', null)} icon={<LayoutGrid />} label="All" count={counts.get('all') ?? 0} />
              {CATEGORIES.filter((c) => guides.some((g) => g.category === c.id)).map((c) => {
                const Icon = CATEGORY_ICON[c.id];
                return (
                  <CatChip
                    key={c.id}
                    tone={c.tone}
                    active={cat === c.id}
                    onClick={() => setFilter('cat', cat === c.id ? null : c.id)}
                    icon={<Icon />}
                    label={GUIDE_CATEGORY_LABEL[c.id]}
                    count={counts.get(c.id) ?? 0}
                  />
                );
              })}
            </div>

            {!searching && cat === 'all' && (
              <Panel hud="Crowd favourites" title="Most helpful guides" actions={<span className="neo-faint text-sm hd-guides-hint">ranked by colleagues’ votes</span>}>
                <div className="hd-guides-featured neo-stagger">
                  {featured.map((g, i) => (
                    <FeaturedGuide key={g.slug} g={g} rank={i + 1} score={scoreOf(g)} onFix={setFix} />
                  ))}
                </div>
              </Panel>
            )}

            <Panel
              className="hd-guides-list"
              hud={listHud}
              title={listTitle}
              actions={
                <>
                  {!searching && (
                    <div className="hd-guides-sort" role="radiogroup" aria-label="Sort guides">
                      {SORTS.map((s) => (
                        <button key={s.id} type="button" role="radio" aria-checked={sort === s.id} onClick={() => setSort(s.id)}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {(searching || cat !== 'all') && (
                    <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={clearFilters} data-qa="guides-clear">
                      Clear
                    </button>
                  )}
                </>
              }
            >
              {results.length === 0 ? (
                <NeoEmpty
                  icon={<BookOpen />}
                  title={searching ? `No guide matches “${q.trim()}”` : 'No guides here yet'}
                  action={
                    <div className="hd-guides-empty">
                      <Link to="/helpdesk" className="neo-btn neo-btn--soft">
                        <Sparkles /> Describe it to Nova
                      </Link>
                      <button type="button" className="neo-btn neo-btn--plasma" onClick={() => openTicket({ subject: q.trim() || undefined, category: cat !== 'all' ? cat : undefined })}>
                        <TicketPlus /> Open a ticket
                      </button>
                    </div>
                  }
                >
                  {searching ? 'Try fewer or different words — or tell Nova what’s happening in plain language.' : 'Pick another category to keep browsing.'}
                </NeoEmpty>
              ) : (
                <div className="hd-guides-grid neo-stagger">
                  {results.map((h, i) => (
                    <GuideCard key={h.guide.slug} g={h.guide} score={scoreOf(h.guide)} terms={terms} hit={searching ? h.step : undefined} issue={issues.get(h.guide.slug)} onFix={setFix} i={i} />
                  ))}
                </div>
              )}
            </Panel>
            <div className="hd-listfoot">
              <Kbd>S</Kbd> search · <Kbd>C</Kbd> new ticket · typos and everyday words are fine — “wifi”, “login”, “pasword”
            </div>
          </div>

          <aside className="hd-guides__side" aria-label="Quick fixes and live status">
            <Panel hud="One-click fixes" title="Let Nova fix it" actions={<Link to="/helpdesk" className="neo-btn neo-btn--ghost neo-btn--xs">Nova <ArrowRight /></Link>}>
              <ul className="hd-guides-fixes">
                {fixes.map((id) => {
                  const Icon = PLAYBOOK_ICON[id];
                  const p = PLAYBOOKS[id];
                  const guide = guides.find((g) => g.playbookId === id);
                  return (
                    <li key={id} className="hd-guides-fix">
                      <button type="button" className="hd-guides-fix__run" onClick={() => setFix(id)} data-qa={`guides-fix-${id}`}>
                        <span className="hd-guides-fix__icon">
                          <Icon />
                        </span>
                        <span className="hd-guides-fix__text">
                          <b>{p.title}</b>
                          <span>{p.blurb}</span>
                        </span>
                        <span className="hd-guides-fix__go">Run</span>
                      </button>
                      {guide && (
                        <Link to={`/helpdesk/guides/${guide.slug}`} className="neo-iconbtn neo-iconbtn--sm" aria-label={`Read the guide: ${guide.title}`} data-tip="Read the guide">
                          <BookOpen />
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Panel>

            <Panel hud="Live" title="Known issues" actions={<Link to="/helpdesk/status" className="neo-btn neo-btn--ghost neo-btn--xs">Status <ArrowRight /></Link>}>
              {mine.length === 0 ? (
                <div className="hd-allclear">
                  <CircleCheck />
                  <div>
                    <b>Nothing known right now</b>
                    <span>All services are healthy{office !== 'Remote' ? ` in ${office}` : ''} — if a guide doesn’t do it, Nova can dig deeper.</span>
                  </div>
                </div>
              ) : (
                <div className="hd-guides-issues">
                  {mine.map((inc) => {
                    const last = inc.updates[inc.updates.length - 1];
                    return (
                      <Link key={inc.id} to="/helpdesk/status" className="hd-guides-issue" data-tone={SEVERITY_TONE[inc.severity]}>
                        <span className="hd-guides-issue__icon">
                          <Siren />
                        </span>
                        <span className="hd-guides-issue__text">
                          <b>{inc.title}</b>
                          <span>{last?.body}</span>
                          <em>Affects you · updated {relativeTime(last?.at ?? inc.startedAt, now)}</em>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
              {elsewhere > 0 && (
                <p className="hd-guides-elsewhere">
                  <Orb tone="slate" size={6} /> {plural(elsewhere, 'incident')} elsewhere — not affecting {office === 'Remote' ? 'you' : office}
                </p>
              )}
            </Panel>

            <Panel hud="Fresh from IT" title="Recently updated">
              <ul className="hd-guides-rows">
                {fresh.map((g) => (
                  <li key={g.slug}>
                    <GuideRow g={g} meta={`Updated ${relativeTime(g.updatedAt, now)} · ${g.minutes} min`} />
                  </li>
                ))}
              </ul>
            </Panel>
          </aside>
        </div>
      </div>
      <PlaybookModal playbookId={fix} onClose={() => setFix(null)} />
    </NeoStage>
  );
}

function CatChip({ active, onClick, icon, label, count, tone = 'app' }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; count: number; tone?: string }) {
  return (
    <button type="button" role="radio" aria-checked={active} className="hd-guides-cat" data-tone={tone} onClick={onClick} disabled={!active && count === 0}>
      {icon}
      <span>{label}</span>
      <b>{count}</b>
    </button>
  );
}

function FeaturedGuide({ g, rank, score, onFix }: { g: Guide; rank: number; score: GuideScore; onFix: (id: PlaybookId) => void }) {
  const book = g.playbookId ? PLAYBOOKS[g.playbookId] : undefined;
  return (
    <article className="hd-guides-feat neo-spot" data-tone={CATEGORY_TONE[g.category]} style={{ ['--i' as string]: rank }} data-qa={`guide-top-${g.slug}`}>
      <Link to={`/helpdesk/guides/${g.slug}`} className="hd-guides-card__link" aria-label={`${g.title} · ${score.pct}% found it helpful`} />
      <div className="hd-guides-feat__top">
        <CategoryGlyph category={g.category} size={44} />
        <Ring value={score.pct / 100} size={48} stroke={4} label={`${score.pct}% helpful`}>
          <span className="hd-guides-feat__pct">{score.pct}</span>
        </Ring>
      </div>
      <div className="neo-hud">
        #{rank} · {GUIDE_CATEGORY_LABEL[g.category]}
      </div>
      <h3 className="hd-guides-feat__title">{g.title}</h3>
      <p className="hd-guides-feat__sum">{g.summary}</p>
      <div className="hd-guides-feat__foot">
        <span>
          <ThumbsUp /> {score.up.toLocaleString()} helped
        </span>
        <span>
          <Clock3 /> {g.minutes} min
        </span>
        {book && (
          <button type="button" className="hd-guides-card__fix" onClick={() => onFix(book.id)} data-tip={book.blurb}>
            <Wand2 /> {book.verb}
          </button>
        )}
      </div>
    </article>
  );
}

function GuideRow({ g, meta }: { g: Guide; meta: ReactNode }) {
  return (
    <Link to={`/helpdesk/guides/${g.slug}`} className="hd-guides-row">
      <CategoryGlyph category={g.category} size={32} />
      <span className="hd-guides-row__text">
        <b>{g.title}</b>
        <span>{meta}</span>
      </span>
      <ArrowRight className="hd-guides-row__go" />
    </Link>
  );
}

/* ==========================================================================
   Reader
   ========================================================================== */

export function GuideDetailView() {
  const { slug = '' } = useParams();
  const guide = useHelpdesk((s) => s.guides.find((g) => g.slug === slug));
  if (!guide) return <GuideNotFound slug={slug} />;
  return <GuideReader key={guide.slug} g={guide} />;
}

function GuideReader({ g }: { g: Guide }) {
  const viewer = useViewer();
  const guides = useHelpdesk((s) => s.guides);
  const votes = useHelpdesk((s) => s.guideVotes[g.slug]);
  const services = useHelpdesk((s) => s.services);
  const incidents = useHelpdesk((s) => s.incidents);
  const runs = useHelpdesk((s) => s.fixRuns);
  const openTicket = useOpenTicket();
  const setParam = useSetParam();
  const now = useNow(60_000);
  const [done, setDone] = useState<Set<number>>(() => new Set());
  const [fix, setFix] = useState<PlaybookId | null>(null);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);
  const voteRef = useRef<HTMLDivElement>(null);
  const me = viewer?.user.id ?? '';
  const office = officeOf(viewer?.user.location);
  const score = guideScore(g, votes, me);
  const issue = liveIssueFor(g, services, incidents, office);
  const issueLast = issue?.updates[issue.updates.length - 1];
  const related = useMemo(() => relatedGuides(g, guides, 4), [g, guides]);
  const book = g.playbookId ? PLAYBOOKS[g.playbookId] : undefined;
  const BookIcon = book ? PLAYBOOK_ICON[book.id] : Wand2;
  const myRun = book ? runs.filter((r) => r.userId === me && r.playbookId === book.id).sort((a, b) => b.at - a.at)[0] : undefined;
  const total = g.steps.length;
  const current = g.steps.findIndex((_, i) => !done.has(i));
  const allDone = total > 0 && done.size === total;

  const toggle = (i: number) => {
    const next = new Set(done);
    const marking = !next.has(i);
    if (marking) next.add(i);
    else next.delete(i);
    setDone(next);
    if (!marking) return;
    const upcoming = g.steps.findIndex((_, k) => !next.has(k));
    requestAnimationFrame(() => {
      const el = upcoming >= 0 ? stepRefs.current[upcoming] : voteRef.current;
      el?.scrollIntoView({ block: 'nearest', behavior: smooth() });
    });
  };

  const vote = (v: 1 | -1) => {
    const prev = score.mine;
    const r = useHelpdesk.getState().voteGuide(g.slug, v, viewer);
    toast.result(r, prev === v ? 'Vote removed' : v === 1 ? 'Thanks — glad it helped!' : 'Thanks — we’ll make this guide better');
  };

  const stuck = () => {
    const completed = g.steps.filter((_, i) => done.has(i)).map((s) => `• ${s.title}`);
    openTicket({
      category: g.category,
      subject: `Still stuck after “${g.title}”`,
      description: `I followed the guide “${g.title}” (${done.size}/${total} steps done) but the problem isn’t fixed.${completed.length ? `\n\nSteps I completed:\n${completed.join('\n')}` : ''}`,
    });
  };

  const actionsFor = (s: GuideStep): ReactNode[] => {
    const t = `${s.title} ${s.body}`.toLowerCase();
    const out: ReactNode[] = [];
    if (/status page|incident/.test(t))
      out.push(
        <Link key="status" to="/helpdesk/status" className="neo-btn neo-btn--ghost neo-btn--xs">
          <Orb tone={issue ? (SEVERITY_TONE[issue.severity] as Tone) : 'emerald'} pulse={!!issue} size={7} /> {issue ? 'Live incident' : 'Live status'}
        </Link>,
      );
    if (book && /quick fix|self service|fix is for/.test(t))
      out.push(
        <button key="fix" type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => setFix(book.id)}>
          <Wand2 /> {book.verb}
        </button>,
      );
    if (/catalog/.test(t))
      out.push(
        <Link key="catalog" to="/helpdesk/catalog" className="neo-btn neo-btn--ghost neo-btn--xs">
          <ShoppingBag /> Open catalog
        </Link>,
      );
    if (/health check/.test(t))
      out.push(
        <button key="diag" type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => setParam('diag', '1')}>
          <Stethoscope /> Run health check
        </button>,
      );
    if (/devices →|report lost|lost\/stolen/.test(t))
      out.push(
        <Link key="devices" to="/helpdesk/devices" className="neo-btn neo-btn--ghost neo-btn--xs">
          <Laptop /> My devices
        </Link>,
      );
    if (/ticket/.test(t))
      out.push(
        <button key="ticket" type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={stuck}>
          <TicketPlus /> Open a ticket
        </button>,
      );
    return out.slice(0, 2);
  };

  return (
    <NeoStage label={`Guide: ${g.title}`}>
      <NeoHead
        className="hd-thead"
        icon={
          <Link to={`/helpdesk/guides${lastListSearch}`} className="hd-back" aria-label="All guides" data-tip="All guides">
            <ArrowLeft />
          </Link>
        }
        eyebrow={<>Guides · {GUIDE_CATEGORY_LABEL[g.category]}</>}
        title={g.title}
        sub={`${g.minutes} min read · ${plural(total, 'step')} · updated ${relativeTime(g.updatedAt, now)}`}
        actions={
          <>
            <Link to="/helpdesk" className="neo-btn neo-btn--soft" data-qa="guide-nova">
              <Sparkles /> <span className="neo-btn__label">Ask Nova</span>
            </Link>
            {book ? (
              <button type="button" className="neo-btn neo-btn--plasma" onClick={() => setFix(book.id)} data-tip={book.blurb} data-qa="guide-run-fix-head">
                <Wand2 /> <span className="neo-btn__label">{book.verb}</span>
              </button>
            ) : (
              <button type="button" className="neo-btn neo-btn--plasma" onClick={stuck} data-qa="guide-ticket-head">
                <TicketPlus /> <span className="neo-btn__label">Open a ticket</span>
              </button>
            )}
          </>
        }
      />
      <div className="neo-body neo-pad">
        {issue && (
          <NeoBanners>
            <NeoBanner
              tone={SEVERITY_TONE[issue.severity] as Tone}
              icon={<Siren />}
              title={`Known issue · ${issue.title}`}
              meta={`Affects you${office === 'Remote' ? '' : ` in ${office}`} · updated ${relativeTime(issueLast?.at ?? issue.startedAt, now)}`}
              to="/helpdesk/status"
            >
              The fix is on IT — {issueLast?.body}
            </NeoBanner>
          </NeoBanners>
        )}
        <div className="hd-guide">
          <div className="hd-guide__main">
            <section className="hd-guide-reader" aria-label="Steps" data-done={allDone || undefined}>
              <header className="hd-guide-reader__head">
                <CategoryGlyph category={g.category} size={52} />
                <div className="hd-guide-reader__intro">
                  <div className="neo-hud neo-hud--tint">Step-by-step · {plural(total, 'step')}</div>
                  <p>{g.summary}</p>
                </div>
                <Ring value={total ? done.size / total : 0} size={66} stroke={5} label={`${done.size} of ${total} steps done`}>
                  <span className="hd-guide-reader__frac">
                    {done.size}
                    <small>/{total}</small>
                  </span>
                </Ring>
              </header>
              <div className="hd-guide-reader__track">
                <div className="hd-guide-reader__bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done.size} aria-label="Guide progress">
                  <i style={{ width: `${total ? (done.size / total) * 100 : 0}%` }} />
                </div>
                <span className="hd-guide-reader__next">{allDone ? 'All steps done' : done.size === 0 ? 'Start with step 1' : `Up next · step ${current + 1}`}</span>
                {done.size > 0 && (
                  <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => setDone(new Set())} data-qa="guide-reset">
                    <RotateCcw /> Reset
                  </button>
                )}
              </div>

              <ol className="hd-guide-steps">
                {g.steps.map((s, i) => {
                  const state = done.has(i) ? 'done' : i === current ? 'current' : 'todo';
                  const extras = actionsFor(s);
                  return (
                    <li
                      key={`${i}-${s.title}`}
                      ref={(el) => {
                        stepRefs.current[i] = el;
                      }}
                      className="hd-guide-step"
                      data-state={state}
                    >
                      <button type="button" className="hd-guide-step__node" onClick={() => toggle(i)} tabIndex={-1} aria-hidden="true">
                        {state === 'done' ? <Check /> : i + 1}
                      </button>
                      <div className="hd-guide-step__card">
                        <div className="neo-hud">
                          Step {i + 1}
                          {state === 'current' && <span className="hd-guide-step__here"> · you are here</span>}
                        </div>
                        <h3 className="hd-guide-step__title">{s.title}</h3>
                        <p className="hd-guide-step__body">{s.body}</p>
                        {s.code && <CodeBlock code={s.code} />}
                        <div className="hd-guide-step__foot">
                          {extras}
                          <span className="grow" />
                          <button
                            type="button"
                            className={cx('neo-btn neo-btn--xs', state === 'done' ? 'neo-btn--success' : state === 'current' ? 'neo-btn--soft' : 'neo-btn--ghost')}
                            onClick={() => toggle(i)}
                            aria-pressed={state === 'done'}
                            aria-label={state === 'done' ? `Step ${i + 1} done — undo` : `Mark step ${i + 1} as done`}
                            data-qa={`guide-step-${i + 1}`}
                          >
                            {state === 'done' ? <Check /> : <CircleCheck />} {state === 'done' ? 'Done' : 'Mark done'}
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>

              <div ref={voteRef} className="hd-guide-vote" data-done={allDone || undefined} data-mine={score.mine ?? undefined}>
                <div className="hd-guide-vote__text">
                  <div className="neo-hud neo-hud--tint">{allDone ? 'All steps done' : 'Feedback'}</div>
                  <b>{allDone ? 'Did that fix it?' : 'Was this guide helpful?'}</b>
                  <span>
                    {score.pct}% of {score.total.toLocaleString()} people found it helpful
                  </span>
                </div>
                <div className="hd-guide-vote__btns">
                  <button type="button" className="hd-guide-vote__btn" data-kind="up" aria-pressed={score.mine === 1} onClick={() => vote(1)} data-qa="guide-helpful">
                    <ThumbsUp /> {allDone ? 'Yes, fixed' : 'Helpful'}
                  </button>
                  <button type="button" className="hd-guide-vote__btn" data-kind="down" aria-pressed={score.mine === -1} onClick={() => vote(-1)} data-qa="guide-not-helpful">
                    <ThumbsDown /> {allDone ? 'Not yet' : 'Not helpful'}
                  </button>
                </div>
              </div>
            </section>

            <section className="hd-guide-stuck" data-emph={score.mine === -1 || undefined} aria-label="Still stuck">
              <span className="hd-guide-stuck__icon">
                <LifeBuoy />
              </span>
              <div className="hd-guide-stuck__text">
                <div className="neo-hud">Human help</div>
                <b>Still stuck? Open a ticket</b>
                <span>
                  We’ll prefill it with this guide{done.size ? ` and the ${plural(done.size, 'step')} you finished` : ''} — no need to repeat yourself.
                </span>
              </div>
              <div className="hd-guide-stuck__actions">
                <Link to="/helpdesk" className="neo-btn neo-btn--ghost neo-btn--sm">
                  <Sparkles /> Ask Nova
                </Link>
                <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={stuck} data-qa="guide-stuck">
                  <TicketPlus /> Open a ticket
                </button>
              </div>
            </section>
          </div>

          <aside className="hd-guide__side" aria-label="Guide details">
            {book && (
              <Panel hud="One click" title="Let Nova do it for you">
                <div className="hd-guide-fix">
                  <span className="hd-guide-fix__icon">
                    <BookIcon />
                  </span>
                  <div>
                    <b>{book.title}</b>
                    <p>{book.blurb}</p>
                  </div>
                </div>
                <button type="button" className="neo-btn neo-btn--plasma neo-btn--block" onClick={() => setFix(book.id)} data-qa="guide-run-fix">
                  <Wand2 /> {book.verb}
                </button>
                <p className="hd-guide-fix__note">
                  {myRun ? `You ran this ${relativeTime(myRun.at, now)} — ${myRun.outcome === 'success' ? 'it worked' : myRun.outcome === 'partial' ? 'partly fixed' : 'it didn’t fix it'}.` : 'Runs on your device in about a minute — every step is logged to your history.'}
                </p>
              </Panel>
            )}

            <Panel hud="Community" title="How it’s rated">
              <div className="hd-guide-stats">
                <Ring value={score.pct / 100} size={78} stroke={6} color={score.pct >= 85 ? undefined : 'var(--hd-warn)'} label={`${score.pct}% found it helpful`}>
                  <span className="hd-guide-stats__pct">
                    {score.pct}
                    <small>%</small>
                  </span>
                </Ring>
                <dl className="hd-guide-stats__kv">
                  <div>
                    <dt>Helpful</dt>
                    <dd className="neo-num">{score.up.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Not helpful</dt>
                    <dd className="neo-num">{score.down.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Read time</dt>
                    <dd className="neo-num">{g.minutes} min</dd>
                  </div>
                  <div>
                    <dt>Steps</dt>
                    <dd className="neo-num">{total}</dd>
                  </div>
                </dl>
              </div>
              {score.mine && <p className="hd-guide-stats__mine">You voted {score.mine === 1 ? '“helpful”' : '“not helpful”'} · tap it again to undo</p>}
            </Panel>

            <Panel hud="Keep going" title="Related guides" actions={<Link to="/helpdesk/guides" className="neo-btn neo-btn--ghost neo-btn--xs">All <ArrowRight /></Link>}>
              <ul className="hd-guides-rows">
                {related.map((r) => (
                  <li key={r.slug}>
                    <GuideRow
                      g={r}
                      meta={
                        <>
                          <ListChecks /> {r.steps.length} steps · {r.minutes} min
                        </>
                      }
                    />
                  </li>
                ))}
              </ul>
            </Panel>
          </aside>
        </div>
      </div>
      <PlaybookModal playbookId={fix} onClose={() => setFix(null)} />
    </NeoStage>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);
  return (
    <div className="hd-guide-code">
      <span className="hd-guide-code__prompt" aria-hidden="true">
        $
      </span>
      <code>{code}</code>
      <button
        type="button"
        className="neo-iconbtn neo-iconbtn--sm"
        aria-label="Copy command"
        data-tip="Copy"
        onClick={() => {
          void navigator.clipboard?.writeText(code).catch(() => undefined);
          setCopied(true);
          toast.success('Copied to clipboard', code);
        }}
      >
        {copied ? <Check /> : <Copy />}
      </button>
    </div>
  );
}

function GuideNotFound({ slug }: { slug: string }) {
  const guides = useHelpdesk((s) => s.guides);
  const index = useMemo(() => indexGuides(guides), [guides]);
  const guesses = useMemo(() => searchGuides(index, slug.replace(/[-_]+/g, ' ')).slice(0, 3), [index, slug]);
  return (
    <NeoStage label="Guide not found">
      <NeoHead
        icon={
          <Link to="/helpdesk/guides" className="hd-back" aria-label="All guides" data-tip="All guides">
            <ArrowLeft />
          </Link>
        }
        eyebrow="Support deck · Self-service"
        title="Guide not found"
        sub="The link may be old, or the guide was retired."
      />
      <div className="neo-body neo-pad">
        <NeoEmpty
          icon={<BookOpen />}
          title="We couldn’t find that guide"
          action={
            <Link to="/helpdesk/guides" className="neo-btn neo-btn--plasma" data-qa="guide-404-back">
              <BookOpen /> Browse all guides
            </Link>
          }
        >
          Nothing in the library is called “{slug}”.{guesses.length ? ' Were you looking for one of these?' : ' Try a search, or describe the problem to Nova.'}
        </NeoEmpty>
        {guesses.length > 0 && (
          <div className="hd-guides-guesses">
            {guesses.map((h) => (
              <Link key={h.guide.slug} to={`/helpdesk/guides/${h.guide.slug}`} className="hd-guidechip">
                <BookOpen /> {h.guide.title}
                <span>{h.guide.minutes} min</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </NeoStage>
  );
}
