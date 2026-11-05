/**
 * Sourcing studio · step 4 — LinkedIn (assisted mode).
 * Ready-to-run searches built from the Search DNA (Boolean for Recruiter /
 * Sales Navigator, a one-click people search and a Google X-ray), plus the
 * ranked prospect feed. The feed is clearly-labelled sample data until
 * LinkedIn Recruiter System Connect is configured. Nothing is scraped, nothing
 * is sent automatically, and sample prospects never link to real profiles.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  Activity,
  ArrowRight,
  BookmarkPlus,
  Check,
  CheckCheck,
  CircleCheck,
  ClipboardCopy,
  Copy,
  ExternalLink,
  FileUp,
  FlaskConical,
  Globe,
  Linkedin,
  MapPin,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  TriangleAlert,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { Application, Candidate, JobProfile, Requisition } from '@/talent/types';
import { buildLinkedInSearch, type LinkedInSearchPack } from '@/talent/linkedin/search';
import { getLinkedInConnector, type LinkedInConnector, type ProspectHit } from '@/talent/linkedin/connector';
import { useTalent } from '@/talent/store';
import { useTalentCaps } from '@/talent/selectors';
import { useTalentUI } from '@/talent/ui';
import { toast } from '@/store/toast';
import { EmptyState, Switch } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { CandidateAvatar, MatchRing, SampleTag, SkillChips, StageBadge } from '../components/shared';
import { copyText } from '../components/format';
import { CheckToggle, DegreeBadge, PanelHead, QueryCode, ReqInlinePicker } from './kit';
import { pickKey, studio, useStudio, type StudioPick } from './store';

const first = (name: string) => name.split(/\s+/)[0];
const poolKey = (name: string, company: string) => `${name.toLowerCase()}|${company}`;
const prospectPick = (h: ProspectHit): StudioPick => ({ key: pickKey.prospect(h.prospect.id), kind: 'prospect', prospect: h.prospect, from: 'linkedin' });

async function copy(text: string, what: string) {
  if (await copyText(text)) toast.success(`${what} copied`, 'Paste it into LinkedIn.');
  else toast.error('Couldn’t copy. Select the text and copy it manually.');
}

function recruiterBlock(pack: LinkedInSearchPack) {
  return [
    `Job titles: ${pack.titles.map((t) => `"${t}"`).join(' OR ')}`,
    `Skills: ${pack.skills.join(', ')}`,
    `Locations: ${pack.location ?? 'Any (remote-friendly)'}`,
    `Keywords: ${pack.boolean}`,
  ].join('\n');
}

export function StepLinkedIn({ profile, targetReq, requisitions }: { profile: JobProfile; targetReq: Requisition | null; requisitions: Requisition[] }) {
  const caps = useTalentCaps();
  const liLocation = useStudio((s) => s.liLocation);
  const liOpenToWork = useStudio((s) => s.liOpenToWork);
  const hits = useStudio((s) => s.hits);
  const hitsStatus = useStudio((s) => s.hitsStatus);
  const hitsError = useStudio((s) => s.hitsError);
  const picks = useStudio((s) => s.picks);
  const candidates = useTalent((s) => s.candidates);
  const applications = useTalent((s) => s.applications);
  const connector = getLinkedInConnector();

  const locationOpt = liLocation === undefined ? undefined : liLocation.trim() || null;
  const pack = useMemo(() => buildLinkedInSearch(profile, { location: locationOpt }), [profile, locationOpt]);
  const defaultLocation = useMemo(() => buildLinkedInSearch(profile).location, [profile]);
  const workModel = targetReq?.workModel ?? profile.workModel;

  // Re-run the prospect search whenever the Search DNA / location / filters change.
  const sig = useMemo(
    () => JSON.stringify([profile.title, profile.titleAliases, profile.skills, profile.yearsMin, profile.seniority, pack.location, workModel, liOpenToWork]),
    [profile, pack.location, workModel, liOpenToWork],
  );
  const runSearch = (force = false) => {
    if (!force && sig === useStudio.getState().hitsSig) return;
    // Names already in the pool are de-duplicated (they show up in step 3 instead).
    const excludeNames = useTalent.getState().candidates.map((c) => c.name);
    void studio.searchProspects(profile, { location: pack.location, workModel, openToWorkOnly: liOpenToWork, excludeNames }, sig);
  };
  useEffect(() => {
    runSearch();
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  const pooled = useMemo(() => {
    const m = new Map<string, Candidate>();
    for (const c of candidates) m.set(poolKey(c.name, c.currentCompany), c);
    return m;
  }, [candidates]);
  const appFor = useMemo(() => {
    const m = new Map<string, Application>();
    if (!targetReq) return m;
    for (const a of applications) if (a.requisitionId === targetReq.id && (a.status === 'active' || !m.has(a.candidateId))) m.set(a.candidateId, a);
    return m;
  }, [applications, targetReq]);
  const picked = useMemo(() => new Set(picks.map((p) => p.key)), [picks]);
  const strong = hits.filter((h) => h.match.score >= 72);
  const selectedHere = hits.filter((h) => picked.has(pickKey.prospect(h.prospect.id))).length;

  return (
    <div className="stack stack--lg">
      <ConnectorBanner connector={connector} />

      <div className="tl-src-grid tl-src-grid--pack">
        <section className="card tl-src-panel tl-src-pack hud">
          <PanelHead
            icon={Linkedin}
            title="LinkedIn Boolean search"
            sub="Paste into LinkedIn Recruiter, Sales Navigator or the basic search bar."
            right={<LocationField value={liLocation} fallback={defaultLocation} />}
          />
          <div className="tl-src-code">
            <span className="tl-src-code__tag">BOOLEAN</span>
            <QueryCode query={pack.boolean} label="LinkedIn Boolean search string" />
          </div>
          <div className="tl-src-built">
            <span className="stat-label">Built from</span>
            {pack.titles.map((t) => (
              <span key={t} className="tl-src-built__chip is-title">
                {t}
              </span>
            ))}
            {pack.skills.map((s) => (
              <span key={s} className="tl-src-built__chip is-skill">
                {s}
              </span>
            ))}
            <span className="tl-src-built__chip is-loc">
              <MapPin aria-hidden="true" /> {pack.location ?? 'Anywhere'}
            </span>
          </div>
          <div className="tl-src-pack__actions">
            <button type="button" className="btn btn--sm" onClick={() => void copy(pack.boolean, 'Boolean string')}>
              <Copy aria-hidden="true" /> Copy Boolean
            </button>
            <button type="button" className="btn btn--sm" onClick={() => void copy(recruiterBlock(pack), 'Recruiter search')} title="Job titles, skills, locations and keywords, one line per Recruiter field">
              <ClipboardCopy aria-hidden="true" /> Copy for LinkedIn Recruiter
            </button>
            <a className="btn btn--sm btn--primary tl-src-li-btn" href={pack.peopleSearchUrl} target="_blank" rel="noopener noreferrer">
              <Linkedin aria-hidden="true" /> Open LinkedIn people search <ExternalLink aria-hidden="true" />
            </a>
          </div>
          {caps.source && (
            <button type="button" className="tl-src-import" onClick={() => useTalentUI.getState().openModal({ kind: 'import', requisitionId: targetReq?.status === 'open' ? targetReq.id : null })}>
              <span className="tl-src-import__icon" aria-hidden="true">
                <FileUp />
              </span>
              <span className="grow">
                <b>Found someone great on LinkedIn?</b>
                <span>Import their profile from its URL or “Save to PDF” export, reviewed by you{targetReq?.status === 'open' ? `, straight into ${targetReq.title}` : ''}.</span>
              </span>
              <ArrowRight aria-hidden="true" className="tl-src-import__go" />
            </button>
          )}
        </section>

        <section className="card tl-src-panel tl-src-pack">
          <PanelHead icon={Globe} title="Google X-ray" sub="Finds public LinkedIn profiles through Google, handy without a Recruiter seat." />
          <div className="tl-src-code tl-src-code--xray">
            <span className="tl-src-code__tag">X-RAY</span>
            <QueryCode query={pack.xrayQuery} label="Google X-ray query" />
          </div>
          <div className="tl-src-pack__actions">
            <button type="button" className="btn btn--sm" onClick={() => void copy(pack.xrayQuery, 'X-ray query')}>
              <Copy aria-hidden="true" /> Copy
            </button>
            <a className="btn btn--sm" href={pack.xrayUrl} target="_blank" rel="noopener noreferrer">
              <Search aria-hidden="true" /> Open in Google <ExternalLink aria-hidden="true" />
            </a>
          </div>
          <div className="tl-src-kw">
            <span className="stat-label">People-search keywords</span>
            <code>{pack.keywords}</code>
          </div>
        </section>
      </div>

      <section className="tl-src-feed" aria-label="Prospect feed">
        <div className="tl-src-feed__label" role="note">
          <FlaskConical aria-hidden="true" />
          <span>
            <b>Sample prospect feed · demo data</b> (switches to LinkedIn Recruiter System Connect in production)
          </span>
        </div>
        <div className="tl-src-toolbar tl-src-toolbar--feed">
          <div className="tl-src-toolbar__filters">
            <span className="tl-src-feed__count" role="status">
              {hitsStatus === 'loading' ? 'Scanning…' : `${hits.length} prospect${hits.length === 1 ? '' : 's'} ranked`}
            </span>
            <label className="tl-src-switch">
              <Switch checked={liOpenToWork} onChange={(v) => studio.setLinkedIn({ liOpenToWork: v })} label="Only prospects open to work" />
              <span>Open to work only</span>
            </label>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => runSearch(true)} disabled={hitsStatus === 'loading'}>
              <RefreshCw aria-hidden="true" className={hitsStatus === 'loading' ? 'spin' : undefined} /> Re-run
            </button>
          </div>
          <div className="tl-src-toolbar__select">
            <span className="tl-src-toolbar__count">
              <b>{selectedHere}</b> selected
            </span>
            <button type="button" className="btn btn--sm" disabled={!strong.length || hitsStatus === 'loading'} onClick={() => studio.addPicks(strong.map(prospectPick))}>
              <CheckCheck aria-hidden="true" /> Select strong fits ({strong.length})
            </button>
            {selectedHere > 0 && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => studio.removePicks(hits.map((h) => pickKey.prospect(h.prospect.id)))}>
                Clear
              </button>
            )}
          </div>
        </div>

        {hitsStatus === 'loading' ? (
          <RadarScan location={pack.location} />
        ) : hitsStatus === 'error' ? (
          <div className="tl-src-notice tl-src-notice--warn" role="alert">
            <TriangleAlert aria-hidden="true" />
            <span>
              <b>The prospect search failed.</b> {hitsError} The Boolean and X-ray searches above still work.
            </span>
          </div>
        ) : hits.length ? (
          <div className="tl-src-prospects">
            {hits.map((h, i) => {
              const inPool = pooled.get(poolKey(h.prospect.name, h.prospect.currentCompany));
              return (
                <ProspectCard
                  key={h.prospect.id}
                  hit={h}
                  index={i}
                  inPool={inPool}
                  app={inPool ? appFor.get(inPool.id) : undefined}
                  picked={picked.has(pickKey.prospect(h.prospect.id))}
                  targetReq={targetReq}
                  requisitions={requisitions}
                  canSource={caps.source}
                />
              );
            })}
          </div>
        ) : (
          <div className="card">
            <EmptyState icon={<Users />} title="No prospects above the bar">
              Widen the location, add title aliases or relax must-have skills in the Decode step.
            </EmptyState>
          </div>
        )}
      </section>
    </div>
  );
}

/** Location override for both the searches and the feed (debounced). */
function LocationField({ value, fallback }: { value: string | undefined; fallback: string | null }) {
  const [draft, setDraft] = useState(value ?? fallback ?? '');
  useEffect(() => {
    setDraft(value ?? fallback ?? '');
  }, [value, fallback]);
  useEffect(() => {
    const current = value ?? fallback ?? '';
    if (draft === current) return;
    const t = window.setTimeout(() => studio.setLinkedIn({ liLocation: draft }), 550);
    return () => window.clearTimeout(t);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="tl-src-loc">
      <div className="input-wrap">
        <MapPin aria-hidden="true" />
        <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Anywhere" aria-label="Search location" />
      </div>
      {value !== undefined && (
        <button type="button" className="icon-btn icon-btn--sm" onClick={() => studio.setLinkedIn({ liLocation: undefined })} aria-label="Reset location to the job description" data-tip="Reset to JD">
          <RotateCcw />
        </button>
      )}
    </div>
  );
}

function ConnectorBanner({ connector }: { connector: LinkedInConnector }) {
  const assisted = connector.id === 'assisted';
  return (
    <section className={cx('tl-src-connector', assisted ? 'is-assisted' : 'is-rsc')}>
      <span className="tl-src-connector__logo" aria-hidden="true">
        <Linkedin />
      </span>
      <div className="tl-src-connector__body">
        <div className="tl-src-connector__title">
          LinkedIn · {connector.label}
          <span className={cx('badge', assisted ? 'badge--info' : 'badge--success')}>{assisted ? 'Active' : 'Connected'}</span>
        </div>
        <p>
          {assisted
            ? 'NEXUS builds the searches and drafts the messages. You run them on LinkedIn and send every message yourself: no scraping, no automation on your account, within LinkedIn’s terms.'
            : connector.description}
        </p>
        {assisted && <p className="tl-src-connector__fine">Recruiter System Connect (LinkedIn’s official partner API) isn’t configured in this workspace, so the feed below uses sample profiles.</p>}
      </div>
      <ul className="tl-src-connector__facts">
        <li>
          <Check aria-hidden="true" /> Searches built from your JD
        </li>
        <li className={connector.canSendMessages ? undefined : 'is-manual'}>
          {connector.canSendMessages ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
          {connector.canSendMessages ? 'Sends through the API' : 'You send each message'}
        </li>
        <li>
          <ShieldCheck aria-hidden="true" /> Every touch logged in NEXUS
        </li>
      </ul>
    </section>
  );
}

const BLIPS = [
  { x: 28, y: 34, d: 0 },
  { x: 66, y: 26, d: 1 },
  { x: 72, y: 64, d: 2 },
  { x: 38, y: 70, d: 3 },
  { x: 52, y: 46, d: 4 },
];

function RadarScan({ location }: { location: string | null }) {
  return (
    <div className="tl-src-radar" role="status" aria-live="polite">
      <div className="tl-src-radar__scope" aria-hidden="true">
        <span className="tl-src-radar__sweep" />
        {BLIPS.map((b) => (
          <i key={b.d} style={{ '--x': `${b.x}%`, '--y': `${b.y}%`, '--d': b.d } as CSSProperties} />
        ))}
      </div>
      <div className="tl-src-radar__text">
        <div className="tl-src-radar__title">Scanning the prospect feed{location ? ` around ${location}` : ''}…</div>
        <div className="faint text-sm">Ranking every profile against your Search DNA: skills, experience, title and location.</div>
        <div className="tl-src-radar__skel" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className="skeleton" />
          ))}
        </div>
      </div>
    </div>
  );
}

function ProspectCard({
  hit,
  index,
  inPool,
  app,
  picked,
  targetReq,
  requisitions,
  canSource,
}: {
  hit: ProspectHit;
  index: number;
  inPool?: Candidate;
  app?: Application;
  picked: boolean;
  targetReq: Requisition | null;
  requisitions: Requisition[];
  canSource: boolean;
}) {
  const { prospect: p, match } = hit;
  const [choosing, setChoosing] = useState(false);
  const reqOpen = targetReq?.status === 'open';
  const inPipe = app?.status === 'active';

  const save = () => toast.result(useTalent.getState().addProspect(p, null, match));
  const add = (reqId: string) => {
    toast.result(useTalent.getState().addProspect(p, reqId, match));
    setChoosing(false);
  };
  const onAdd = () => (targetReq && reqOpen ? add(targetReq.id) : setChoosing(true));
  const draft = () =>
    useTalentUI.getState().openModal({ kind: 'outreach', candidateId: inPool?.id ?? '', requisitionId: targetReq?.id ?? null, prospect: inPool ? undefined : p });
  const skills = match.matched.length + match.bonus.length ? [...match.matched, ...match.bonus] : p.skills;

  return (
    <article className={cx('tl-src-prospect', picked && 'is-picked', inPool && 'is-pooled')} style={{ '--i': Math.min(index, 12) } as CSSProperties}>
      <header className="tl-src-prospect__head">
        <CheckToggle checked={picked} onChange={() => studio.togglePick(prospectPick(hit))} label={`Select ${p.name} for outreach`} />
        <span className={cx('tl-src-prospect__avatar', p.openToWork && 'is-otw')} title={p.openToWork ? 'Open to work' : undefined}>
          <CandidateAvatar person={p} size={46} />
        </span>
        <div className="tl-src-prospect__who">
          <div className="tl-src-prospect__name">
            <span className="truncate">{p.name}</span>
            {p.sample && <SampleTag />}
          </div>
          <div className="tl-src-prospect__headline clamp-2">{p.headline}</div>
        </div>
        <MatchRing score={match.score} size={50} stroke={5} />
      </header>
      <div className="tl-src-prospect__meta">
        <span>
          <MapPin aria-hidden="true" /> {p.location}
        </span>
        <DegreeBadge degree={p.connectionDegree} />
        <span>
          <Users aria-hidden="true" /> {p.mutualConnections} mutual
        </span>
        {p.openToWork && <span className="badge badge--success">Open to work</span>}
      </div>
      <ul className="tl-src-reasons tl-src-reasons--compact">
        {match.reasons.slice(0, 3).map((r) => (
          <li key={r} className={r.startsWith('Gap') ? 'is-gap' : undefined}>
              {r}
            </li>
        ))}
      </ul>
      <SkillChips skills={skills} matched={[...match.matched, ...match.bonus]} max={6} />
      {p.recentActivity && (
        <div className="tl-src-prospect__activity">
          <Activity aria-hidden="true" />
          <span className="clamp-2">{p.recentActivity}</span>
        </div>
      )}
      <footer className="tl-src-prospect__foot">
        <div className="tl-src-prospect__row">
          {inPool ? (
            <span className="tl-src-inpool">
              <CircleCheck aria-hidden="true" /> In talent pool
              {app && app.status === 'active' && <StageBadge stage={app.stage} />}
            </span>
          ) : (
            canSource && (
              <button type="button" className="btn btn--sm" onClick={save}>
                <BookmarkPlus aria-hidden="true" /> Save to pool
              </button>
            )
          )}
          {canSource && !inPipe && (
            <button
              type="button"
              className="btn btn--sm"
              onClick={onAdd}
              disabled={!!targetReq && !reqOpen}
              title={targetReq && !reqOpen ? `${targetReq.title} opens for candidates once it’s approved` : undefined}
            >
              <UserPlus aria-hidden="true" /> Add to pipeline
            </button>
          )}
        </div>
        <button type="button" className="btn btn--sm tl-src-prospect__draft" onClick={draft}>
          <Send aria-hidden="true" /> Draft message
        </button>
      </footer>
      {choosing && (
        <ReqInlinePicker
          requisitions={requisitions}
          who={first(p.name)}
          onPick={(id) => {
            studio.setTarget(id);
            add(id);
          }}
          onCancel={() => setChoosing(false)}
          note="It also becomes the studio’s target requisition."
        />
      )}
    </article>
  );
}
