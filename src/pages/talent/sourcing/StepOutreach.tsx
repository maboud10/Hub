/**
 * Sourcing studio · step 5 — personalised outreach for everyone picked in
 * steps 3–4. One draft per person (channel + tone aware, LinkedIn limits
 * respected), editable, with the personalisation hooks shown so recruiters can
 * verify them. Assisted mode: copy → send on LinkedIn / email → "Log as sent".
 * Logging adds prospects to the pool (and the target pipeline), moves them
 * Sourced → Engaged and schedules follow-ups. Ends with a wrap-up summary.
 */
import { useEffect, useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router';
import {
  ArrowRight,
  Briefcase,
  CalendarClock,
  Check,
  CircleCheck,
  Copy,
  ExternalLink,
  Linkedin,
  LoaderCircle,
  MailCheck,
  PartyPopper,
  RefreshCw,
  RotateCcw,
  Send,
  SquareKanban,
  Trash2,
  TriangleAlert,
  Users,
} from 'lucide-react';
import type { Candidate, JobProfile, MatchResult, OutreachChannel, Prospect, Requisition } from '@/talent/types';
import { CHANNEL_META, FOLLOW_UP_DAYS, TONE_META } from '@/talent/constants';
import { roleFromProfile, scoreMatch } from '@/talent/ai/engine';
import { useTalent } from '@/talent/store';
import { useTalentCaps } from '@/talent/selectors';
import { useTalentUI } from '@/talent/ui';
import { toast } from '@/store/toast';
import { EmptyState, Switch } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { CandidateAvatar, EngineBadge, MatchRing, SampleTag } from '../components/shared';
import { copyText } from '../components/format';
import { ChannelPicker, CharMeter, FallbackNotice, HookChips, TonePicker, daysAgo, toOutreachPerson, useSender } from './kit';
import { STEP, studio, useStudio, type StudioDraft, type StudioPick } from './store';

interface QueueItem {
  pick: StudioPick;
  person: Candidate | Prospect;
  /** The talent-pool record (candidates, or prospects already saved). */
  pooled?: Candidate;
  match: MatchResult;
}

const first = (name: string) => name.split(/\s+/)[0];
const cardId = (key: string) => `tl-out-card-${key.replace(/[^a-z0-9-]/gi, '-')}`;
const reducedMotion = () => document.documentElement.dataset.motion === 'reduced' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const scrollToCard = (key: string) =>
  requestAnimationFrame(() => document.getElementById(cardId(key))?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' }));

type CardState = 'drafting' | 'ready' | 'over' | 'logged';
const STATE_LABEL: Record<CardState, string> = { drafting: 'Drafting…', ready: 'Ready to send', over: 'Over the limit', logged: 'Logged as sent' };

function cardState(d: StudioDraft | undefined, limit: number): CardState {
  if (d?.logged) return 'logged';
  if (!d || d.status === 'drafting') return 'drafting';
  return d.body.length > limit ? 'over' : 'ready';
}

export function StepOutreach({ profile, targetReq }: { profile: JobProfile; targetReq: Requisition | null }) {
  const caps = useTalentCaps();
  const canPipe = caps.manage || caps.source;
  const picks = useStudio((s) => s.picks);
  const drafts = useStudio((s) => s.drafts);
  const channel = useStudio((s) => s.channel);
  const tone = useStudio((s) => s.tone);
  const autoPipeline = useStudio((s) => s.autoPipeline);
  const finished = useStudio((s) => s.finished);
  const profileRev = useStudio((s) => s.profileRev);
  const candidates = useTalent((s) => s.candidates);
  const outreach = useTalent((s) => s.outreach);
  const sender = useSender();

  const role = useMemo(() => roleFromProfile(profile, targetReq), [profile, targetReq]);
  const ctxLocation = targetReq?.location ?? profile.location;
  const ctxWorkModel = targetReq?.workModel ?? profile.workModel;
  const sig = `${channel}|${tone}|${targetReq?.id ?? ''}|${profileRev}`;
  const meta = CHANNEL_META[channel];
  const reqOpen = targetReq?.status === 'open';
  const willPipe = !!targetReq && reqOpen && autoPipeline && canPipe;

  const queue = useMemo<QueueItem[]>(() => {
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const byName = new Map(candidates.map((c) => [`${c.name.toLowerCase()}|${c.currentCompany}`, c]));
    const out: QueueItem[] = [];
    for (const pick of picks) {
      const person = pick.kind === 'candidate' ? byId.get(pick.candidateId ?? '') : pick.prospect;
      if (!person) continue;
      const pooled = pick.kind === 'candidate' ? (person as Candidate) : byName.get(`${person.name.toLowerCase()}|${person.currentCompany}`);
      out.push({ pick, person, pooled, match: scoreMatch(profile, person, { location: ctxLocation, workModel: ctxWorkModel }) });
    }
    return out;
  }, [picks, candidates, profile, ctxLocation, ctxWorkModel]);

  /** Last first-touch already sent for this role (warn before double-messaging). */
  const lastTouch = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of outreach) {
      if (o.status === 'draft' || (o.requisitionId ?? null) !== (targetReq?.id ?? null)) continue;
      const at = o.sentAt ?? o.createdAt;
      if (at > (m.get(o.candidateId) ?? 0)) m.set(o.candidateId, at);
    }
    return m;
  }, [outreach, targetReq]);

  // Draft everyone who needs it: new picks, and un-edited drafts whose settings changed.
  useEffect(() => {
    const current = useStudio.getState().drafts;
    const todo = queue.filter((q) => {
      const d = current[q.pick.key];
      if (!d) return true;
      if (d.logged || d.sig === sig) return false;
      return !d.edited;
    });
    if (!todo.length) return;
    studio.markDrafting(
      todo.map((q) => q.pick.key),
      sig,
    );
    todo.forEach((q, i) => {
      window.setTimeout(() => void studio.draft(q.pick.key, { role, person: toOutreachPerson(q.person), match: q.match, channel, tone, step: 1, sender }, sig), i * 140);
    });
  }, [sig, queue]); // eslint-disable-line react-hooks/exhaustive-deps

  const regenerate = (q: QueueItem) => void studio.draft(q.pick.key, { role, person: toOutreachPerson(q.person), match: q.match, channel, tone, step: 1, sender }, sig);
  const regenerateAll = () =>
    queue
      .filter((q) => !drafts[q.pick.key]?.logged)
      .forEach((q, i) => window.setTimeout(() => regenerate(q), i * 120));

  const logOne = (q: QueueItem) => {
    const d = useStudio.getState().drafts[q.pick.key];
    if (!d || d.status !== 'ready' || d.logged) return;
    const t = useTalent.getState();
    let candidateId = q.pooled?.id;
    let savedToPool = false;
    if (q.pick.kind === 'prospect' && q.pick.prospect) {
      const res = t.addProspect(q.pick.prospect, willPipe ? targetReq!.id : null, q.match);
      if (!res.candidateId) {
        toast.result(res);
        return;
      }
      savedToPool = !q.pooled;
      candidateId = res.candidateId;
    } else if (candidateId && willPipe) {
      const inPipe = t.applications.some((a) => a.candidateId === candidateId && a.requisitionId === targetReq!.id && a.status === 'active');
      if (!inPipe) {
        const added = t.addToPipeline(candidateId, targetReq!.id, { stage: 'sourced', match: q.match });
        if (!added.ok) toast.result(added);
      }
    }
    if (!candidateId) return;
    const res = useTalent.getState().logOutreach({
      candidateId,
      requisitionId: targetReq?.id ?? null,
      channel,
      tone,
      subject: meta.subjectLimit ? d.subject : undefined,
      body: d.body,
      step: 1,
      engine: d.engine,
      status: 'sent',
    });
    if (!toast.result(res)) return;
    const pipeline = !!targetReq && useTalent.getState().applications.some((a) => a.candidateId === candidateId && a.requisitionId === targetReq.id && a.status === 'active');
    studio.markLogged(q.pick.key, { candidateId, at: Date.now(), pipeline, savedToPool, channel });
    const next = queue.find((x) => x.pick.key !== q.pick.key && !useStudio.getState().drafts[x.pick.key]?.logged);
    if (next) scrollToCard(next.pick.key);
  };

  if (!queue.length)
    return (
      <div className="card tl-out-empty">
        <EmptyState
          icon={<Send />}
          title="Pick people to message"
          action={
            <div className="row row--wrap" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn" onClick={() => studio.goTo(STEP.pool)}>
                <Users aria-hidden="true" /> Talent pool
              </button>
              <button type="button" className="btn" onClick={() => studio.goTo(STEP.linkedin)}>
                <Linkedin aria-hidden="true" /> LinkedIn prospects
              </button>
            </div>
          }
        >
          Tick the people you want to reach in the Talent pool or LinkedIn steps. We’ll write a personal first message for each of them.
        </EmptyState>
      </div>
    );

  const loggedCount = queue.filter((q) => drafts[q.pick.key]?.logged).length;

  if (finished) return <WrapUp queue={queue} drafts={drafts} targetReq={targetReq} />;

  const pct = Math.round((loggedCount / queue.length) * 100);
  return (
    <div className="stack stack--lg">
      <section className="card tl-out-settings hud">
        <div className="tl-out-settings__grid">
          <div className="field">
            <span className="field-label">Channel</span>
            <ChannelPicker value={channel} onChange={(c: OutreachChannel) => studio.setOutreach({ channel: c })} />
          </div>
          <div className="field">
            <span className="field-label">Tone · {TONE_META[tone].description}</span>
            <TonePicker value={tone} onChange={(t) => studio.setOutreach({ tone: t })} />
          </div>
          <div className="tl-out-progress" role="status" aria-label={`${loggedCount} of ${queue.length} logged`}>
            <span className="tl-out-progress__ring" style={{ '--p': pct } as CSSProperties}>
              <span>{loggedCount}</span>
            </span>
            <div className="grow">
              <b>
                {loggedCount} of {queue.length} logged
              </b>
              <div className="progress">
                <span style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        </div>
        <div className="tl-out-settings__foot">
          <span className="tl-out-role">
            <Briefcase aria-hidden="true" /> Writing about <b>{role.title}</b> · {role.location}
          </span>
          {targetReq && reqOpen && canPipe && (
            <label className="tl-src-switch">
              <Switch checked={autoPipeline} onChange={(v) => studio.setOutreach({ autoPipeline: v })} label={`Add people to the ${targetReq.title} pipeline when logged`} />
              <span>Add to {targetReq.title} pipeline when logged</span>
            </label>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn--sm" onClick={regenerateAll}>
            <RefreshCw aria-hidden="true" /> Regenerate all
          </button>
        </div>
        <p className="tl-out-hint">
          <MailCheck aria-hidden="true" />
          {meta.hint} NEXUS never sends on your behalf: copy each message, send it on LinkedIn or email, then log it here.
        </p>
      </section>

      <nav className="tl-out-queue" aria-label="Message queue">
        {queue.map((q) => {
          const st = cardState(drafts[q.pick.key], meta.limit);
          return (
            <button key={q.pick.key} type="button" className={cx('tl-out-queue__item', `is-${st}`)} onClick={() => scrollToCard(q.pick.key)} title={`${q.person.name} · ${STATE_LABEL[st]}`}>
              <span className="tl-out-queue__avatar">
                <CandidateAvatar person={q.person} size={34} />
                <span className="tl-out-queue__state" aria-hidden="true">
                  {st === 'logged' ? <Check /> : st === 'drafting' ? <LoaderCircle className="spin" /> : st === 'over' ? <TriangleAlert /> : null}
                </span>
              </span>
              <span className="tl-out-queue__name">{first(q.person.name)}</span>
            </button>
          );
        })}
      </nav>

      <div className="tl-out-list">
        {queue.map((q, i) => (
          <MessageCard
            key={q.pick.key}
            q={q}
            index={i}
            draft={drafts[q.pick.key]}
            channel={channel}
            sig={sig}
            touchedAt={q.pooled ? lastTouch.get(q.pooled.id) : undefined}
            willPipe={willPipe}
            targetReq={targetReq}
            onLog={() => logOne(q)}
            onRegenerate={() => regenerate(q)}
          />
        ))}
      </div>

      {loggedCount === queue.length && (
        <button type="button" className="tl-out-alldone" onClick={() => studio.setOutreach({ finished: true })}>
          <PartyPopper aria-hidden="true" />
          <span className="grow">
            <b>All {queue.length} messages logged.</b> See the follow-up plan and next steps.
          </span>
          <span className="tl-out-alldone__cta">
            Wrap up <ArrowRight aria-hidden="true" />
          </span>
        </button>
      )}
    </div>
  );
}

function MessageCard({
  q,
  index,
  draft,
  channel,
  sig,
  touchedAt,
  willPipe,
  targetReq,
  onLog,
  onRegenerate,
}: {
  q: QueueItem;
  index: number;
  draft?: StudioDraft;
  channel: OutreachChannel;
  sig: string;
  touchedAt?: number;
  willPipe: boolean;
  targetReq: Requisition | null;
  onLog: () => void;
  onRegenerate: () => void;
}) {
  const meta = CHANNEL_META[channel];
  const { person, pick, match } = q;
  const st = cardState(draft, meta.limit);
  const key = pick.key;
  const stale = !!draft && draft.edited && draft.sig !== sig && !draft.logged;
  const subjectOver = !!meta.subjectLimit && (draft?.subject.length ?? 0) > meta.subjectLimit;
  const canLog = st === 'ready' && !subjectOver && (draft?.body.trim().length ?? 0) >= 20;
  const linkedinUrl = q.pooled?.linkedinUrl;

  const copyBody = async () => {
    if (!draft) return;
    if (await copyText(draft.body)) toast.success('Message copied', channel === 'email' ? 'Paste it into your email.' : 'Paste it into LinkedIn.');
    else toast.error('Couldn’t copy. Select the text and copy it manually.');
  };
  const copyAndOpen = async () => {
    if (!draft || !linkedinUrl) return;
    await copyText(draft.body);
    window.open(linkedinUrl, '_blank', 'noopener,noreferrer');
  };

  if (draft?.logged)
    return (
      <article id={cardId(key)} className="tl-out-card is-logged">
        <div className="tl-out-card__logged">
          <span className="tl-out-card__tick" aria-hidden="true">
            <Check />
          </span>
          <CandidateAvatar person={person} size={34} />
          <div className="grow">
            <div className="tl-out-card__name">
              {person.name} {person.sample && <SampleTag />}
            </div>
            <div className="faint text-sm">
              Logged as sent · {CHANNEL_META[draft.logged.channel].short} · follow-up in {FOLLOW_UP_DAYS[2]} days
              {draft.logged.savedToPool ? ' · saved to talent pool' : ''}
              {draft.logged.pipeline && targetReq ? ` · in ${targetReq.title} pipeline` : ''}
            </div>
          </div>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => useTalentUI.getState().openCandidate(draft.logged!.candidateId)}>
            Profile
          </button>
        </div>
      </article>
    );

  return (
    <article id={cardId(key)} className={cx('tl-out-card', `is-${st}`)} style={{ '--i': Math.min(index, 10) } as CSSProperties}>
      <header className="tl-out-card__head">
        <CandidateAvatar person={person} size={40} />
        <div className="tl-out-card__who">
          <div className="tl-out-card__name">
            <span className="truncate">{person.name}</span>
            {person.sample && <SampleTag />}
            <span className={cx('tl-out-card__kind', pick.kind === 'prospect' && !q.pooled ? 'is-prospect' : 'is-pool')}>
              {pick.kind === 'prospect' && !q.pooled ? (
                <>
                  <Linkedin aria-hidden="true" /> Prospect
                </>
              ) : (
                <>
                  <Users aria-hidden="true" /> Talent pool
                </>
              )}
            </span>
          </div>
          <div className="tl-out-card__role truncate">
            {person.currentTitle}
            {person.currentCompany ? ` @ ${person.currentCompany}` : ''} · {person.location}
          </div>
        </div>
        <MatchRing score={match.score} size={42} stroke={4} />
        <span className={cx('tl-out-card__state', `is-${st}`)}>{STATE_LABEL[st]}</span>
      </header>

      {touchedAt && (
        <div className="tl-out-card__warn" role="note">
          <TriangleAlert aria-hidden="true" /> Already messaged about {targetReq ? targetReq.title : 'this'} {daysAgo(touchedAt)}. Consider a follow-up instead of a new first touch.
        </div>
      )}

      {!draft || draft.status === 'drafting' ? (
        <div className="tl-out-skel" role="status" aria-label={`Drafting a message for ${person.name}`}>
          <span className="tl-out-skel__label">
            <LoaderCircle className="spin" aria-hidden="true" /> Writing a personal note for {first(person.name)}…
          </span>
          <span className="skeleton" style={{ width: '92%' }} />
          <span className="skeleton" style={{ width: '80%' }} />
          <span className="skeleton" style={{ width: '64%' }} />
        </div>
      ) : (
        <div className="tl-out-card__body">
          {meta.subjectLimit && (
            <div className="tl-out-subject">
              <input
                className="input"
                value={draft.subject}
                onChange={(e) => studio.editDraft(key, { subject: e.target.value })}
                aria-label={`Subject for ${person.name}`}
                placeholder="Subject"
              />
              <span className={cx('tl-out-subject__count', subjectOver && 'is-over')}>
                {draft.subject.length}/{meta.subjectLimit}
              </span>
            </div>
          )}
          <textarea
            className="textarea tl-out-body"
            value={draft.body}
            onChange={(e) => studio.editDraft(key, { body: e.target.value })}
            rows={channel === 'linkedin-connect' ? 4 : 10}
            aria-label={`Message to ${person.name}`}
          />
          <CharMeter count={draft.body.length} limit={meta.limit} label={meta.short} />
          <HookChips hooks={draft.hooks} />
          <FallbackNotice reason={draft.fallbackReason} />
          {stale && (
            <div className="tl-out-card__stale" role="note">
              <RotateCcw aria-hidden="true" />
              <span className="grow">Channel, tone or role changed since you edited this message.</span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={onRegenerate}>
                Regenerate
              </button>
            </div>
          )}
        </div>
      )}

      <footer className="tl-out-card__foot">
        {draft && draft.status === 'ready' && <EngineBadge engine={draft.engine} />}
        {willPipe && targetReq && <span className="tl-out-card__pipe">→ {targetReq.title} pipeline</span>}
        <span className="spacer" />
        <button type="button" className="icon-btn icon-btn--sm" onClick={() => studio.removePicks([key])} aria-label={`Remove ${person.name} from the queue`} data-tip="Remove">
          <Trash2 />
        </button>
        <button type="button" className="btn btn--sm btn--ghost" onClick={onRegenerate} disabled={!draft || draft.status === 'drafting'}>
          <RefreshCw aria-hidden="true" /> Regenerate
        </button>
        {linkedinUrl ? (
          <button type="button" className="btn btn--sm" onClick={() => void copyAndOpen()} disabled={!draft || draft.status !== 'ready'}>
            <ExternalLink aria-hidden="true" /> Copy & open LinkedIn
          </button>
        ) : (
          <button type="button" className="btn btn--sm" onClick={() => void copyBody()} disabled={!draft || draft.status !== 'ready'}>
            <Copy aria-hidden="true" /> Copy
          </button>
        )}
        <button type="button" className="btn btn--sm btn--primary" onClick={onLog} disabled={!canLog} title={canLog ? 'Use this after you have sent it on LinkedIn or email' : undefined}>
          <CircleCheck aria-hidden="true" /> Log as sent
        </button>
      </footer>
    </article>
  );
}

const CADENCE: { step: 1 | 2 | 3; title: string; text: string }[] = [
  { step: 1, title: 'First touch', text: 'Logged today. Pipeline candidates move from Sourced to Engaged automatically.' },
  { step: 2, title: 'Follow-up #1', text: 'A short, friendly bump in the same thread if there’s no reply.' },
  { step: 3, title: 'Follow-up #2', text: 'A last note that leaves the door open for future roles.' },
];

function WrapUp({ queue, drafts, targetReq }: { queue: QueueItem[]; drafts: Record<string, StudioDraft>; targetReq: Requisition | null }) {
  const logged = queue.filter((q) => drafts[q.pick.key]?.logged);
  const inPipe = logged.filter((q) => drafts[q.pick.key]?.logged?.pipeline).length;
  const saved = logged.filter((q) => drafts[q.pick.key]?.logged?.savedToPool).length;
  const pending = queue.length - logged.length;
  return (
    <section className="tl-src-finish hud">
      <div className="tl-src-finish__glow" aria-hidden="true" />
      <span className="tl-src-finish__badge" aria-hidden="true">
        <PartyPopper />
      </span>
      <h3 className="tl-src-finish__title">{logged.length ? `${logged.length} personalised message${logged.length === 1 ? '' : 's'} logged` : 'Nothing logged yet'}</h3>
      <p className="tl-src-finish__sub">
        {logged.length
          ? 'Nice work. NEXUS tracks every touch from here, so nobody falls through the cracks.'
          : 'Send your drafts on LinkedIn or email, then log them so NEXUS can schedule the follow-ups.'}
      </p>
      <dl className="tl-src-finish__stats">
        <div>
          <dt>Messages logged</dt>
          <dd>{logged.length}</dd>
        </div>
        <div>
          <dt>{targetReq ? 'In the pipeline' : 'Pipeline'}</dt>
          <dd>{targetReq ? inPipe : '—'}</dd>
        </div>
        <div>
          <dt>New in talent pool</dt>
          <dd>{saved}</dd>
        </div>
        <div className={pending ? 'is-pending' : undefined}>
          <dt>Still to send</dt>
          <dd>{pending}</dd>
        </div>
      </dl>

      <div className="tl-src-cadence">
        <div className="tl-src-cadence__head">
          <CalendarClock aria-hidden="true" /> Follow-up cadence
        </div>
        <ol className="tl-src-cadence__list">
          {CADENCE.map((c) => (
            <li key={c.step}>
              <span className="tl-src-cadence__day">Day {FOLLOW_UP_DAYS[c.step]}</span>
              <span className="tl-src-cadence__dot" aria-hidden="true" />
              <b>{c.title}</b>
              <p>{c.text}</p>
            </li>
          ))}
        </ol>
        <p className="tl-src-cadence__note">
          Due follow-ups show up in your tasks and on the Pipeline tab. When someone replies “interested” and gives consent, they move to Interested automatically.
        </p>
      </div>

      <div className="tl-src-finish__actions">
        {targetReq && (
          <Link className="btn btn--primary" to={`/talent/pipeline?req=${targetReq.id}`}>
            <SquareKanban aria-hidden="true" /> Open {targetReq.title} pipeline
          </Link>
        )}
        <Link className="btn" to="/talent/candidates">
          <Users aria-hidden="true" /> Talent pool
        </Link>
        {pending > 0 && (
          <button type="button" className="btn" onClick={() => studio.setOutreach({ finished: false })}>
            <Send aria-hidden="true" /> Back to messages ({pending})
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={studio.startOver}>
          <RotateCcw aria-hidden="true" /> Start a new search
        </button>
      </div>
    </section>
  );
}
