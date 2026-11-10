/**
 * Talent pool (/talent/candidates) — everyone you may see in the pool,
 * searchable (`?q=` honoured and kept in the URL), faceted (status, source,
 * signals, top skills), sortable, and rankable against any requisition's
 * decoded JD with explainable match scores.
 */
import { useDeferredValue, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  Archive,
  ArrowDownWideNarrow,
  ArrowRight,
  Ban,
  BriefcaseBusiness,
  Linkedin,
  ListFilter,
  MapPin,
  Radar,
  Search,
  SearchX,
  Sparkles,
  Target,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { Application, Candidate, CandidateSource, MatchResult, Requisition } from '@/talent/types';
import { SOURCE_META, WORK_MODEL_LABEL } from '@/talent/constants';
import { scoreMatch } from '@/talent/ai/engine';
import { useTalentCaps, useTalentLookups, useTalentScope } from '@/talent/selectors';
import { useTalentUI } from '@/talent/ui';
import { EmptyState, Switch } from '@/components/ui/primitives';
import { Chip } from '@/components/neo';
import { cx } from '@/lib/cx';
import { HeadActions } from './components/head';
import { CandidateAvatar, MatchRing, SampleTag, SkillChips, SourceBadge, StageBadge } from './components/shared';
import { ConsentBadge } from './pipeline/ConsentBadge';

type StatusFilter = 'all' | Candidate['status'];
type SortKey = 'recent' | 'name' | 'experience' | 'match';
const PAGE = 36;

const STATUSES: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'archived', label: 'Archived' },
  { id: 'do-not-contact', label: 'Do not contact' },
];

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'recent', label: 'Recently updated' },
  { id: 'name', label: 'Name (A–Z)' },
  { id: 'experience', label: 'Most experienced' },
  { id: 'match', label: 'Best match' },
];

type Facet = 'status' | 'source' | 'signals' | 'skills';

function PoolCard({
  cand,
  apps,
  match,
  reqById,
  canAdd,
  rankReq,
  index,
}: {
  cand: Candidate;
  apps: Application[];
  match: MatchResult | null;
  reqById: Map<string, Requisition>;
  canAdd: boolean;
  rankReq?: Requisition;
  index: number;
}) {
  const open = () => useTalentUI.getState().openCandidate(cand.id);
  const inRankReq = rankReq ? apps.find((a) => a.requisitionId === rankReq.id && a.status === 'active') : undefined;
  const shown = apps.slice(0, 3);
  return (
    <article
      className={cx('tl-pool-card', cand.status !== 'active' && `is-${cand.status}`)}
      style={{ '--cand-h': cand.avatarHue, '--i': index } as CSSProperties}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button, a')) return;
        open();
      }}
    >
      <div className="tl-pool-card__top">
        <CandidateAvatar person={cand} size={46} />
        <div className="tl-pool-card__id">
          <div className="tl-pool-card__namerow">
            <button type="button" className="tl-pool-card__name" onClick={open}>
              {cand.name}
            </button>
            {cand.sample && <SampleTag />}
          </div>
          <div className="tl-pool-card__title">
            {cand.currentTitle} <span className="faint">@</span> {cand.currentCompany}
          </div>
        </div>
        {match && <MatchRing score={match.score} size={46} />}
      </div>

      <p className="tl-pool-card__headline">{cand.headline}</p>

      <div className="tl-pool-card__facts">
        <span>
          <MapPin aria-hidden="true" />
          {cand.location}
        </span>
        <span>
          <BriefcaseBusiness aria-hidden="true" />
          {cand.yearsExperience} yrs
        </span>
        {cand.openToWork && (
          <span className="is-otw">
            <Sparkles aria-hidden="true" />
            Open to work
          </span>
        )}
      </div>

      <SkillChips skills={cand.skills} matched={match ? [...match.matched, ...match.bonus] : []} max={6} />
      {match && match.missing.length > 0 && (
        <div className="tl-pool-card__gap">
          Gap: {match.missing.slice(0, 3).join(', ')}
          {match.missing.length > 3 ? ` +${match.missing.length - 3}` : ''}
        </div>
      )}

      <div className="tl-pool-card__badges">
        <SourceBadge source={cand.source} detail={cand.sourceDetail} />
        <ConsentBadge consent={cand.consent} compact />
        {cand.status === 'archived' && (
          <span className="badge badge--muted">
            <Archive aria-hidden="true" /> Archived
          </span>
        )}
        {cand.status === 'do-not-contact' && (
          <span className="badge badge--danger">
            <Ban aria-hidden="true" /> Do not contact
          </span>
        )}
      </div>

      <div className="tl-pool-card__apps" aria-label="Pipelines">
        {shown.length ? (
          shown.map((a) => {
            const r = reqById.get(a.requisitionId);
            const closed = a.status === 'rejected' || a.status === 'withdrawn';
            return (
              <span key={a.id} className={cx('tl-pool-app', closed && 'is-closed')} title={`${r?.title ?? 'Requisition'}${closed ? ' · closed' : ''}`}>
                <span className="tl-pool-app__req">{r?.title ?? 'Requisition'}</span>
                <StageBadge stage={a.status === 'hired' ? 'hired' : a.stage} />
              </span>
            );
          })
        ) : (
          <span className="tl-pool-app tl-pool-app--none">Not in a pipeline</span>
        )}
        {apps.length > 3 && <span className="tl-pool-app tl-pool-app--more">+{apps.length - 3}</span>}
      </div>

      <footer className="tl-pool-card__foot">
        {inRankReq ? (
          <span className="tl-pool-card__in">In this pipeline</span>
        ) : (
          canAdd &&
          cand.status !== 'do-not-contact' && (
            <button type="button" className="btn btn--sm" onClick={() => useTalentUI.getState().openModal({ kind: 'add-to-pipeline', candidateId: cand.id })}>
              <UserPlus aria-hidden="true" /> Add to pipeline
            </button>
          )
        )}
        <span className="spacer" />
        <button type="button" className="btn btn--sm btn--ghost" onClick={open} aria-label={`Open ${cand.name}’s profile`}>
          Profile <ArrowRight aria-hidden="true" />
        </button>
      </footer>
    </article>
  );
}

export function CandidatesTab() {
  const scope = useTalentScope();
  const { reqById } = useTalentLookups();
  const caps = useTalentCaps();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  // ── search, honouring ?q= (and external navigation to a new ?q=)
  const urlQ = params.get('q') ?? '';
  const [q, setQ] = useState(urlQ);
  useEffect(() => {
    setQ((cur) => (cur === urlQ ? cur : urlQ));
  }, [urlQ]);
  const updateQ = (v: string) => {
    setQ(v);
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (v.trim()) p.set('q', v);
        else p.delete('q');
        return p;
      },
      { replace: true },
    );
  };
  const deferredQ = useDeferredValue(q);

  const [status, setStatus] = useState<StatusFilter>('active');
  const [sources, setSources] = useState<CandidateSource[]>([]);
  const [openToWork, setOpenToWork] = useState(false);
  const [consent, setConsent] = useState(false);
  const [skills, setSkills] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>('recent');
  const [rankId, setRankId] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const appsByCand = useMemo(() => {
    const m = new Map<string, Application[]>();
    for (const a of scope.applications) {
      const list = m.get(a.candidateId);
      if (list) list.push(a);
      else m.set(a.candidateId, [a]);
    }
    for (const list of m.values()) list.sort((a, b) => Number(a.status !== 'active') - Number(b.status !== 'active') || b.updatedAt - a.updatedAt);
    return m;
  }, [scope.applications]);

  const rankable = useMemo(
    () => scope.requisitions.filter((r) => r.jd.profile).sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open') || a.title.localeCompare(b.title)),
    [scope.requisitions],
  );
  const rankReq = rankId ? reqById.get(rankId) : undefined;
  const scores = useMemo(() => {
    const m = new Map<string, MatchResult>();
    const profile = rankReq?.jd.profile;
    if (!rankReq || !profile) return m;
    for (const c of scope.candidates) m.set(c.id, scoreMatch(profile, c, { location: rankReq.location, workModel: rankReq.workModel }));
    return m;
  }, [rankReq, scope.candidates]);
  const bestExisting = (c: Candidate) => Math.max(-1, ...(appsByCand.get(c.id) ?? []).map((a) => a.match?.score ?? -1));
  const scoreOf = (c: Candidate) => (rankReq ? (scores.get(c.id)?.score ?? -1) : bestExisting(c));

  // ── facets
  const needle = deferredQ.trim().toLowerCase();
  const pass = (c: Candidate, except?: Facet) => {
    if (needle && ![c.name, c.headline, c.currentTitle, c.currentCompany, c.location, ...c.skills, ...c.tags].join(' ').toLowerCase().includes(needle)) return false;
    if (except !== 'status' && status !== 'all' && c.status !== status) return false;
    if (except !== 'source' && sources.length && !sources.includes(c.source)) return false;
    if (except !== 'signals' && ((openToWork && !c.openToWork) || (consent && !c.consent.given))) return false;
    if (except !== 'skills' && skills.length) {
      const own = new Set(c.skills.map((s) => s.toLowerCase()));
      if (!skills.every((s) => own.has(s.toLowerCase()))) return false;
    }
    return true;
  };
  const all = scope.candidates;
  const statusCounts = new Map<StatusFilter, number>();
  const sourceCounts = new Map<CandidateSource, number>();
  let otwCount = 0;
  let consentCount = 0;
  const skillCounts = new Map<string, number>();
  for (const c of all) {
    if (pass(c, 'status')) {
      statusCounts.set('all', (statusCounts.get('all') ?? 0) + 1);
      statusCounts.set(c.status, (statusCounts.get(c.status) ?? 0) + 1);
    }
    if (pass(c, 'source')) sourceCounts.set(c.source, (sourceCounts.get(c.source) ?? 0) + 1);
    if (pass(c, 'signals')) {
      if (c.openToWork) otwCount += 1;
      if (c.consent.given) consentCount += 1;
    }
    if (pass(c, 'skills')) for (const s of c.skills) skillCounts.set(s, (skillCounts.get(s) ?? 0) + 1);
  }
  const topSkills = [...new Set([...skills, ...[...skillCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 14).map(([s]) => s)])];
  const sourceList = (Object.keys(SOURCE_META) as CandidateSource[]).filter((s) => (sourceCounts.get(s) ?? 0) > 0 || sources.includes(s));

  const results = all
    .filter((c) => pass(c))
    .sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'experience':
          return b.yearsExperience - a.yearsExperience || a.name.localeCompare(b.name);
        case 'match':
          return scoreOf(b) - scoreOf(a) || a.name.localeCompare(b.name);
        default:
          return Math.max(b.updatedAt, b.lastContactedAt ?? 0) - Math.max(a.updatedAt, a.lastContactedAt ?? 0);
      }
    });

  useEffect(() => setLimit(PAGE), [needle, status, sources, openToWork, consent, skills, sort, rankId]);

  const activeFilters = (status !== 'active' ? 1 : 0) + sources.length + (openToWork ? 1 : 0) + (consent ? 1 : 0) + skills.length;
  const clearAll = () => {
    setStatus('active');
    setSources([]);
    setOpenToWork(false);
    setConsent(false);
    setSkills([]);
    updateQ('');
  };
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const canAdd = caps.manage || caps.source;
  const must = rankReq?.jd.profile?.skills.filter((s) => s.must).map((s) => s.skill) ?? [];

  return (
    <div className="tl-pool">
      <HeadActions>
        <Chip tone="app">{all.length} in pool</Chip>
        {caps.source && (
          <button type="button" className="neo-btn neo-btn--soft" onClick={() => navigate('/talent/sourcing')}>
            <Radar aria-hidden="true" /> <span className="neo-btn__label">AI sourcing</span>
          </button>
        )}
        {(caps.source || caps.manage) && (
          <button type="button" className="neo-btn neo-btn--plasma" onClick={() => useTalentUI.getState().openModal({ kind: 'import' })}>
            <Linkedin aria-hidden="true" /> <span className="neo-btn__label">Import from LinkedIn</span>
          </button>
        )}
      </HeadActions>

      <section className="tl-pool-bar glass" aria-label="Search and sort">
        <div className="input-wrap tl-pool-search">
          <Search aria-hidden="true" />
          <input className="input" type="search" value={q} onChange={(e) => updateQ(e.target.value)} placeholder="Search name, title, company, skill or tag" aria-label="Search the talent pool" />
          {q && (
            <button type="button" className="icon-btn icon-btn--sm input-trail" onClick={() => updateQ('')} aria-label="Clear search">
              <X />
            </button>
          )}
        </div>
        <label className="tl-pool-select tl-pool-select--rank">
          <Target aria-hidden="true" />
          <span className="sr-only">Rank for requisition</span>
          <select
            className="select"
            value={rankId}
            onChange={(e) => {
              setRankId(e.target.value);
              setSort(e.target.value ? 'match' : 'recent');
            }}
          >
            <option value="">Rank for requisition…</option>
            {rankable.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
                {r.status !== 'open' ? ` (${r.status.replace('-', ' ')})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="tl-pool-select">
          <ArrowDownWideNarrow aria-hidden="true" />
          <span className="sr-only">Sort by</span>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={cx('btn tl-pool-filters-toggle', filtersOpen && 'is-open')} aria-expanded={filtersOpen} aria-controls="tl-pool-facets" onClick={() => setFiltersOpen((v) => !v)}>
          <ListFilter aria-hidden="true" /> Filters {activeFilters > 0 && <span className="counter">{activeFilters}</span>}
        </button>
      </section>

      {rankReq && (
        <section className="tl-pool-rankbar" aria-label="Ranking">
          <span className="tl-pool-rankbar__icon" aria-hidden="true">
            <Target />
          </span>
          <div className="tl-pool-rankbar__text">
            <b>Ranked for {rankReq.title}</b>
            <span>
              {must.length} must-have skill{must.length === 1 ? '' : 's'} · {rankReq.location} · {WORK_MODEL_LABEL[rankReq.workModel]} · explainable offline scoring
            </span>
          </div>
          <SkillChips skills={must} max={6} />
          <button type="button" className="icon-btn icon-btn--sm" onClick={() => (setRankId(''), setSort('recent'))} aria-label="Stop ranking">
            <X />
          </button>
        </section>
      )}

      <div className="tl-pool-layout">
        <aside id="tl-pool-facets" className={cx('tl-pool-facets', filtersOpen && 'is-open')} aria-label="Filters">
          <div className="tl-pool-facet">
            <h3 className="tl-pool-facet__title">Status</h3>
            <div className="tl-pool-facet__chips">
              {STATUSES.map((s) => (
                <button key={s.id} type="button" className={cx('chip', status === s.id && 'is-active')} aria-pressed={status === s.id} onClick={() => setStatus(s.id)}>
                  {s.label}
                  <span className="count">{statusCounts.get(s.id) ?? 0}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="tl-pool-facet">
            <h3 className="tl-pool-facet__title">Source</h3>
            <div className="tl-pool-facet__chips">
              {sourceList.map((s) => {
                const m = SOURCE_META[s];
                const Icon = m.icon;
                const on = sources.includes(s);
                return (
                  <button key={s} type="button" className={cx('chip tl-pool-source', on && 'is-active')} style={{ '--src-h': m.hue } as CSSProperties} aria-pressed={on} onClick={() => setSources((l) => toggle(l, s))}>
                    <Icon aria-hidden="true" />
                    {m.label}
                    <span className="count">{sourceCounts.get(s) ?? 0}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="tl-pool-facet">
            <h3 className="tl-pool-facet__title">Signals</h3>
            <label className="tl-pool-toggle">
              <Switch checked={openToWork} onChange={setOpenToWork} label="Only people open to work" />
              <span className="grow">Open to work</span>
              <span className="tl-pool-toggle__count">{otwCount}</span>
            </label>
            <label className="tl-pool-toggle">
              <Switch checked={consent} onChange={setConsent} label="Only people who gave consent" />
              <span className="grow">Consent given</span>
              <span className="tl-pool-toggle__count">{consentCount}</span>
            </label>
          </div>

          <div className="tl-pool-facet">
            <h3 className="tl-pool-facet__title">Top skills</h3>
            <div className="tl-pool-facet__chips">
              {topSkills.map((s) => {
                const on = skills.includes(s);
                return (
                  <button key={s} type="button" className={cx('chip tl-pool-skill', on && 'is-active')} aria-pressed={on} onClick={() => setSkills((l) => toggle(l, s))}>
                    {s}
                    <span className="count">{skillCounts.get(s) ?? 0}</span>
                  </button>
                );
              })}
              {!topSkills.length && <span className="faint text-sm">No skills to filter by.</span>}
            </div>
          </div>

          {activeFilters > 0 && (
            <button type="button" className="btn btn--ghost btn--sm tl-pool-clear" onClick={clearAll}>
              <X aria-hidden="true" /> Reset filters
            </button>
          )}
        </aside>

        <section className="tl-pool-results" aria-label="Candidates">
          <div className="tl-pool-results__head">
            <span className="tl-pool-results__count" role="status">
              <b>{results.length}</b> of {all.length} {all.length === 1 ? 'person' : 'people'}
              {rankReq ? ' · best match first' : ''}
            </span>
            <div className="tl-pool-active">
              {status !== 'active' && (
                <button type="button" className="tl-pool-pill" onClick={() => setStatus('active')}>
                  {STATUSES.find((s) => s.id === status)?.label} <X aria-hidden="true" />
                </button>
              )}
              {sources.map((s) => (
                <button key={s} type="button" className="tl-pool-pill" onClick={() => setSources((l) => l.filter((x) => x !== s))}>
                  {SOURCE_META[s].label} <X aria-hidden="true" />
                </button>
              ))}
              {openToWork && (
                <button type="button" className="tl-pool-pill" onClick={() => setOpenToWork(false)}>
                  Open to work <X aria-hidden="true" />
                </button>
              )}
              {consent && (
                <button type="button" className="tl-pool-pill" onClick={() => setConsent(false)}>
                  Consent <X aria-hidden="true" />
                </button>
              )}
              {skills.map((s) => (
                <button key={s} type="button" className="tl-pool-pill" onClick={() => setSkills((l) => l.filter((x) => x !== s))}>
                  {s} <X aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>

          {!all.length ? (
            <div className="card">
              <EmptyState
                icon={<Users />}
                title={caps.manage || caps.source ? 'Your talent pool is empty' : 'No candidates in your pipelines yet'}
                action={
                  caps.source || caps.manage ? (
                    <button type="button" className="btn btn--primary" onClick={() => useTalentUI.getState().openModal({ kind: 'import' })}>
                      <Linkedin aria-hidden="true" /> Import from LinkedIn
                    </button>
                  ) : undefined
                }
              >
                {caps.manage || caps.source ? 'Import a LinkedIn profile or source from a JD to start building your pool.' : 'People appear here once they are added to your requisitions.'}
              </EmptyState>
            </div>
          ) : !results.length ? (
            <div className="card">
              <EmptyState
                icon={<SearchX />}
                title="No one matches"
                action={
                  <button type="button" className="btn" onClick={clearAll}>
                    <X aria-hidden="true" /> Clear search & filters
                  </button>
                }
              >
                Try fewer skills, another source or a broader search.
              </EmptyState>
            </div>
          ) : (
            <>
              <div className="tl-pool-grid">
                {results.slice(0, limit).map((c, i) => (
                  <PoolCard
                    key={c.id}
                    cand={c}
                    apps={appsByCand.get(c.id) ?? []}
                    match={rankReq ? (scores.get(c.id) ?? null) : null}
                    reqById={reqById}
                    canAdd={canAdd}
                    rankReq={rankReq}
                    index={i}
                  />
                ))}
              </div>
              {results.length > limit && (
                <button type="button" className="btn btn--block tl-pool-more" onClick={() => setLimit((l) => l + PAGE)}>
                  Show {Math.min(PAGE, results.length - limit)} more
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
