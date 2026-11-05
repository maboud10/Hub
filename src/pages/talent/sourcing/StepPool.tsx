/**
 * Sourcing studio · step 3 — rediscover the talent pool first.
 * Ranks everyone you already know against the Search DNA (explainable
 * scores), grouped by fit tier, with silver medalists and referrals called
 * out. Select people for bulk outreach, add them to the target pipeline,
 * draft a one-off message or open their profile.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { CheckCheck, Handshake, MapPin, Recycle, Send, Sparkles, UserPlus, UserRound, Users, X } from 'lucide-react';
import type { Application, Candidate, CandidateSource, MatchResult, Requisition } from '@/talent/types';
import { APPLICATION_STATUS_LABEL, SOURCE_META } from '@/talent/constants';
import { matchTier, type MatchTier } from '@/talent/ai/match';
import { useTalent } from '@/talent/store';
import { useTalentCaps } from '@/talent/selectors';
import { useTalentUI } from '@/talent/ui';
import { toast } from '@/store/toast';
import { EmptyState, Switch } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { CandidateAvatar, MatchRing, PersonChip, SampleTag, SkillChips, SourceBadge, StageBadge } from '../components/shared';
import { CheckToggle, ReqInlinePicker, daysAgo } from './kit';
import { pickKey, studio, useStudio, type PoolMin, type StudioPick } from './store';

export interface RankedCandidate {
  item: Candidate;
  match: MatchResult;
}

export const TIERS: { tier: MatchTier; label: string; range: string }[] = [
  { tier: 'exceptional', label: 'Exceptional fit', range: '85+' },
  { tier: 'strong', label: 'Strong fit', range: '72–84' },
  { tier: 'good', label: 'Good fit', range: '58–71' },
  { tier: 'partial', label: 'Partial fit', range: '45–57' },
  { tier: 'low', label: 'Low fit', range: '< 45' },
];

const MIN_OPTIONS: { value: PoolMin; label: string }[] = [
  { value: 0, label: 'Any score' },
  { value: 58, label: 'Good 58+' },
  { value: 72, label: 'Strong 72+' },
  { value: 85, label: 'Exceptional 85+' },
];

const first = (name: string) => name.split(/\s+/)[0];
const candPick = (c: Candidate): StudioPick => ({ key: pickKey.candidate(c.id), kind: 'candidate', candidateId: c.id, from: 'pool' });

export function StepPool({ ranked, targetReq, requisitions }: { ranked: RankedCandidate[]; targetReq: Requisition | null; requisitions: Requisition[] }) {
  const caps = useTalentCaps();
  const canPipe = caps.manage || caps.source;
  const poolMin = useStudio((s) => s.poolMin);
  const openToWork = useStudio((s) => s.poolOpenToWork);
  const source = useStudio((s) => s.poolSource);
  const hideInPipe = useStudio((s) => s.poolHideInPipe);
  const showLow = useStudio((s) => s.poolShowLow);
  const picks = useStudio((s) => s.picks);
  const applications = useTalent((s) => s.applications);

  const picked = useMemo(() => new Set(picks.map((p) => p.key)), [picks]);

  /** Latest application per candidate for the target requisition (active wins). */
  const appByCand = useMemo(() => {
    const m = new Map<string, Application>();
    if (!targetReq) return m;
    for (const a of applications) {
      if (a.requisitionId !== targetReq.id) continue;
      const prev = m.get(a.candidateId);
      if (!prev || (a.status === 'active' && prev.status !== 'active') || (a.status === prev.status && a.updatedAt > prev.updatedAt)) m.set(a.candidateId, a);
    }
    return m;
  }, [applications, targetReq]);

  const elsewhere = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of applications) if (a.status === 'active' && a.requisitionId !== targetReq?.id) m.set(a.candidateId, (m.get(a.candidateId) ?? 0) + 1);
    return m;
  }, [applications, targetReq]);

  const sources = useMemo(() => {
    const m = new Map<CandidateSource, number>();
    for (const r of ranked) m.set(r.item.source, (m.get(r.item.source) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [ranked]);

  const filtered = useMemo(
    () =>
      ranked.filter(
        (r) =>
          r.match.score >= poolMin &&
          (!openToWork || r.item.openToWork) &&
          (source === 'all' || r.item.source === source) &&
          (!hideInPipe || appByCand.get(r.item.id)?.status !== 'active'),
      ),
    [ranked, poolMin, openToWork, source, hideInPipe, appByCand],
  );

  const groups = useMemo(
    () => TIERS.map((t) => ({ ...t, rows: filtered.filter((r) => matchTier(r.match.score).tier === t.tier) })).filter((g) => g.rows.length > 0),
    [filtered],
  );

  const strongVisible = filtered.filter((r) => r.match.score >= 72);
  const selectedHere = ranked.filter((r) => picked.has(pickKey.candidate(r.item.id))).length;
  const filtersOn = poolMin > 0 || openToWork || source !== 'all' || hideInPipe;

  return (
    <div className="stack stack--lg">
      <PoolHero ranked={ranked} />

      <section className="tl-src-toolbar tl-src-toolbar--pool" aria-label="Filter the talent pool">
        <div className="tl-src-toolbar__chips">
          <div className="chips" role="group" aria-label="Minimum match score">
            {MIN_OPTIONS.map((o) => (
              <button key={o.value} type="button" className={cx('chip', poolMin === o.value && 'is-active')} aria-pressed={poolMin === o.value} onClick={() => studio.setPool({ poolMin: o.value })}>
                {o.label}
              </button>
            ))}
          </div>
          <span className="tl-src-toolbar__sep" aria-hidden="true" />
          <div className="chips" role="group" aria-label="Source">
            <button type="button" className={cx('chip', source === 'all' && 'is-active')} aria-pressed={source === 'all'} onClick={() => studio.setPool({ poolSource: 'all' })}>
              All sources <span className="count">{ranked.length}</span>
            </button>
            {sources.map(([s, n]) => {
              const Icon = SOURCE_META[s].icon;
              return (
                <button key={s} type="button" className={cx('chip', source === s && 'is-active')} aria-pressed={source === s} onClick={() => studio.setPool({ poolSource: s })}>
                  <Icon aria-hidden="true" /> {SOURCE_META[s].label} <span className="count">{n}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="tl-src-toolbar__bar">
          <div className="tl-src-toolbar__switches">
            <label className="tl-src-switch">
              <Switch checked={openToWork} onChange={(v) => studio.setPool({ poolOpenToWork: v })} label="Only people open to work" />
              <span>Open to work</span>
            </label>
            {targetReq && (
              <label className="tl-src-switch">
                <Switch checked={hideInPipe} onChange={(v) => studio.setPool({ poolHideInPipe: v })} label="Hide people already in this pipeline" />
                <span>Hide people in pipeline</span>
              </label>
            )}
            {filtersOn && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => studio.setPool({ poolMin: 0, poolOpenToWork: false, poolSource: 'all', poolHideInPipe: false })}
              >
                <X aria-hidden="true" /> Clear filters
              </button>
            )}
          </div>
          <div className="tl-src-toolbar__select">
            <span className="tl-src-toolbar__count" role="status">
              <b>{selectedHere}</b> selected for outreach
            </span>
            <button type="button" className="btn btn--sm" disabled={!strongVisible.length} onClick={() => studio.addPicks(strongVisible.map((r) => candPick(r.item)))}>
              <CheckCheck aria-hidden="true" /> Select strong fits ({strongVisible.length})
            </button>
            {selectedHere > 0 && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => studio.removePicks(ranked.map((r) => pickKey.candidate(r.item.id)))}>
                Clear
              </button>
            )}
          </div>
        </div>
      </section>

      {groups.length ? (
        groups.map((g) => {
          const collapsed = g.tier === 'low' && !showLow;
          return (
            <section key={g.tier} className={cx('tl-src-tier', `tl-src-tier--${g.tier}`)} aria-label={`${g.label}, ${g.rows.length} people`}>
              <header className="tl-src-tier__head">
                <span className="tl-src-tier__dot" aria-hidden="true" />
                <h4 className="tl-src-tier__title">{g.label}</h4>
                <span className="tl-src-tier__range">{g.range}</span>
                <span className="tl-src-tier__count">{g.rows.length}</span>
                <span className="tl-src-tier__line" aria-hidden="true" />
                {!collapsed &&
                  (g.rows.every((r) => picked.has(pickKey.candidate(r.item.id))) ? (
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => studio.removePicks(g.rows.map((r) => pickKey.candidate(r.item.id)))}>
                      Deselect all
                    </button>
                  ) : (
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => studio.addPicks(g.rows.map((r) => candPick(r.item)))}>
                      Select all
                    </button>
                  ))}
              </header>
              {collapsed ? (
                <button type="button" className="tl-src-tier__more" onClick={() => studio.setPool({ poolShowLow: true })}>
                  Show {g.rows.length} low-fit {g.rows.length === 1 ? 'person' : 'people'}
                </button>
              ) : (
                <div className="tl-src-people">
                  {g.rows.map((r, i) => (
                    <PoolRow
                      key={r.item.id}
                      c={r.item}
                      match={r.match}
                      index={i}
                      app={appByCand.get(r.item.id)}
                      elsewhere={elsewhere.get(r.item.id) ?? 0}
                      picked={picked.has(pickKey.candidate(r.item.id))}
                      targetReq={targetReq}
                      requisitions={requisitions}
                      canPipe={canPipe}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })
      ) : (
        <div className="card">
          <EmptyState icon={<Users />} title={ranked.length ? 'No one matches these filters' : 'Your talent pool is empty'}>
            {ranked.length ? 'Loosen the filters, or head to LinkedIn for fresh prospects.' : 'Import candidates or head to LinkedIn for fresh prospects.'}
          </EmptyState>
        </div>
      )}
    </div>
  );
}

/** "Rediscover first" headline: fit distribution across the pool + warm-source call-outs. */
function PoolHero({ ranked }: { ranked: RankedCandidate[] }) {
  const stats = useMemo(() => {
    const byTier = new Map<MatchTier, number>();
    for (const r of ranked) {
      const t = matchTier(r.match.score).tier;
      byTier.set(t, (byTier.get(t) ?? 0) + 1);
    }
    return {
      byTier,
      strong: ranked.filter((r) => r.match.score >= 72).length,
      silver: ranked.filter((r) => r.item.source === 'silver-medalist').length,
      referrals: ranked.filter((r) => r.item.source === 'referral').length,
      otw: ranked.filter((r) => r.item.openToWork).length,
      best: ranked[0],
    };
  }, [ranked]);
  const total = Math.max(1, ranked.length);

  return (
    <section className="tl-src-poolhero hud">
      <div className="tl-src-poolhero__main">
        <span className="eyebrow">Rediscover first</span>
        <h3 className="tl-src-poolhero__title">
          <span className="tl-src-grad">{stats.strong}</span> strong {stats.strong === 1 ? 'fit' : 'fits'} already in your talent pool
        </h3>
        <p className="tl-src-poolhero__sub">
          Scanned {ranked.length} people you already know. Silver medalists and referrals have met the team before, so start with them before cold outreach.
        </p>
        <div className="tl-src-dist" role="img" aria-label={TIERS.map((t) => `${t.label}: ${stats.byTier.get(t.tier) ?? 0}`).join(', ')}>
          {TIERS.map((t) => {
            const n = stats.byTier.get(t.tier) ?? 0;
            return n ? <span key={t.tier} className={cx('tl-src-dist__seg', `is-${t.tier}`)} style={{ '--w': `${(n / total) * 100}%` } as CSSProperties} title={`${t.label}: ${n}`} /> : null;
          })}
        </div>
        <div className="tl-src-dist__legend">
          {TIERS.map((t) => (
            <span key={t.tier} className={cx('tl-src-dist__key', `is-${t.tier}`)}>
              <i aria-hidden="true" />
              {t.label.replace(' fit', '')} <b>{stats.byTier.get(t.tier) ?? 0}</b>
            </span>
          ))}
        </div>
      </div>
      <dl className="tl-src-readouts">
        <div className="is-silver">
          <dt>
            <Recycle aria-hidden="true" /> Silver medalists
          </dt>
          <dd>{stats.silver}</dd>
        </div>
        <div className="is-referral">
          <dt>
            <Handshake aria-hidden="true" /> Referrals
          </dt>
          <dd>{stats.referrals}</dd>
        </div>
        <div>
          <dt>
            <Sparkles aria-hidden="true" /> Open to work
          </dt>
          <dd>{stats.otw}</dd>
        </div>
        {stats.best && (
          <div className="is-best">
            <dt>Top match</dt>
            <dd className="tl-src-readouts__best">
              <MatchRing score={stats.best.match.score} size={30} stroke={3} />
              <span className="truncate">{stats.best.item.name}</span>
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function PoolRow({
  c,
  match,
  index,
  app,
  elsewhere,
  picked,
  targetReq,
  requisitions,
  canPipe,
}: {
  c: Candidate;
  match: MatchResult;
  index: number;
  app?: Application;
  elsewhere: number;
  picked: boolean;
  targetReq: Requisition | null;
  requisitions: Requisition[];
  canPipe: boolean;
}) {
  const [choosing, setChoosing] = useState(false);
  const ui = useTalentUI.getState();
  const reqOpen = targetReq?.status === 'open';
  const tier = matchTier(match.score);

  const add = (reqId: string) => {
    const res = useTalent.getState().addToPipeline(c.id, reqId, { stage: 'sourced', match });
    toast.result(res);
    setChoosing(false);
  };
  const onAdd = () => {
    if (targetReq && reqOpen) add(targetReq.id);
    else setChoosing(true);
  };

  return (
    <article
      className={cx('tl-src-person', `is-${tier.tier}`, picked && 'is-picked', c.source === 'silver-medalist' && 'is-silver', c.source === 'referral' && 'is-referral')}
      style={{ '--i': Math.min(index, 12) } as CSSProperties}
    >
      <CheckToggle checked={picked} onChange={() => studio.togglePick(candPick(c))} label={`Select ${c.name} for outreach`} className="tl-src-person__check" />
      <div className="tl-src-person__score">
        <MatchRing score={match.score} size={56} stroke={5} />
        <span className={cx('tl-src-person__tier', `is-${tier.tier}`)}>{tier.label.replace(' fit', '')}</span>
      </div>
      <div className="tl-src-person__main">
        <div className="tl-src-person__top">
          <CandidateAvatar person={c} size={28} />
          <button type="button" className="tl-src-person__name" onClick={() => ui.openCandidate(c.id)}>
            {c.name}
          </button>
          {c.sample && <SampleTag />}
          <SourceBadge source={c.source} detail={c.sourceDetail} />
          {c.openToWork && <span className="badge badge--success">Open to work</span>}
        </div>
        <div className="tl-src-person__role">
          <span className="truncate">
            {c.currentTitle}
            {c.currentCompany ? ` @ ${c.currentCompany}` : ''}
          </span>
          {c.location && (
            <span className="tl-src-person__loc">
              <MapPin aria-hidden="true" /> {c.location}
            </span>
          )}
        </div>
        {c.source === 'silver-medalist' && (
          <div className="tl-src-ribbon tl-src-ribbon--silver">
            <Recycle aria-hidden="true" />
            <span>Silver medalist: reached the late stages of a past process. Warm, proven and quick to re-engage.</span>
          </div>
        )}
        {c.source === 'referral' && (
          <div className="tl-src-ribbon tl-src-ribbon--referral">
            <Handshake aria-hidden="true" />
            <span>Referred by</span>
            {c.referrerId ? <PersonChip userId={c.referrerId} size={18} /> : <span>a colleague</span>}
            <span className="tl-src-ribbon__tail">· historically the strongest hire source</span>
          </div>
        )}
        <ul className="tl-src-reasons">
          {match.reasons.slice(0, 3).map((r) => (
            <li key={r} className={r.startsWith('Gap') ? 'is-gap' : undefined}>
              {r}
            </li>
          ))}
        </ul>
        {match.matched.length + match.missing.length > 0 && <SkillChips skills={[...match.matched, ...match.missing]} matched={match.matched} missing={match.missing} max={7} />}
      </div>
      <div className="tl-src-person__side">
        <div className="tl-src-person__status">
          {app ? (
            app.status === 'active' ? (
              <StageBadge stage={app.stage} />
            ) : (
              <span className="badge badge--muted" title="Reopen from their profile to consider them again">
                {APPLICATION_STATUS_LABEL[app.status]}
              </span>
            )
          ) : targetReq ? (
            <span className="tl-src-person__none">Not in this pipeline</span>
          ) : null}
          {elsewhere > 0 && (
            <span className="faint text-xs">
              Active in {elsewhere} other pipeline{elsewhere > 1 ? 's' : ''}
            </span>
          )}
          {c.lastContactedAt && <span className="faint text-xs">Contacted {daysAgo(c.lastContactedAt)}</span>}
        </div>
        <div className="tl-src-person__actions">
          {canPipe && !app && (
            <button
              type="button"
              className="btn btn--sm"
              onClick={onAdd}
              disabled={!!targetReq && !reqOpen}
              title={targetReq && !reqOpen ? `${targetReq.title} opens for candidates once it’s approved` : targetReq ? `Add to ${targetReq.title}` : 'Pick a requisition'}
            >
              <UserPlus aria-hidden="true" /> Add to pipeline
            </button>
          )}
          <button type="button" className="btn btn--sm" onClick={() => ui.openModal({ kind: 'outreach', candidateId: c.id, requisitionId: targetReq?.id ?? null })}>
            <Send aria-hidden="true" /> Draft message
          </button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => ui.openCandidate(c.id)}>
            <UserRound aria-hidden="true" /> Profile
          </button>
        </div>
      </div>
      {choosing && (
        <ReqInlinePicker
          requisitions={requisitions}
          who={first(c.name)}
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
