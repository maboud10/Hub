/**
 * AI outreach composer (modal kind `outreach`).
 *
 * Drafts a personalised LinkedIn connection note, InMail or email for a
 * talent-pool candidate — or for a LinkedIn prospect that isn't in the pool yet
 * (`prospect` given, `candidateId` may be ''). Options: requisition, channel,
 * tone and sequence step (follow-ups reply in-thread with the previous
 * subject). Drafts regenerate automatically when an option changes, respect
 * the channel's character limits and show the personalisation hooks used.
 *
 * Assisted mode: NEXUS never sends anything. Copy (or "Copy & open LinkedIn"),
 * send it yourself, then "Log as sent" — prospects are added to the pool (and
 * the requisition's pipeline) first, and follow-ups get scheduled.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Copy, ExternalLink, History, Info, Linkedin, LoaderCircle, Mail, RefreshCw, Save, Send, ShieldAlert, Sparkles } from 'lucide-react';
import type { AiEngine, OutreachChannel, OutreachTone } from '@/talent/types';
import type { TalentModal } from '@/talent/ui';
import { CHANNEL_META, FOLLOW_UP_DAYS } from '@/talent/constants';
import { roleFromProfile, scoreMatch, writeOutreach } from '@/talent/ai/engine';
import { useTalent } from '@/talent/store';
import { useTalentCaps, useTalentScope } from '@/talent/selectors';
import { toast } from '@/store/toast';
import { Modal } from '@/components/ui/Modal';
import { Segmented } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { CandidateAvatar, EngineBadge, MatchRing, OutreachStatusBadge, SampleTag, SourceBadge } from '../components/shared';
import { copyText, fmtRelativeDay, fmtWhen } from '../components/format';
import { ChannelPicker, CharMeter, DegreeBadge, FallbackNotice, HookChips, STEP_LABEL, TonePicker, daysAgo, mailtoHref, toOutreachPerson, useSender } from '../sourcing/kit';
import { useStudio } from '../sourcing/store';

type Step = 1 | 2 | 3;
interface Draft {
  subject: string;
  body: string;
  hooks: string[];
  engine: AiEngine;
  fallbackReason?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const first = (name: string) => name.split(/\s+/)[0];

export function OutreachModal({ modal, open, onClose }: { modal: Extract<TalentModal, { kind: 'outreach' }>; open: boolean; onClose: () => void }) {
  const caps = useTalentCaps();
  const canLog = caps.source || caps.manage;
  const prospect = modal.prospect;
  // The talent-pool record: by id, or a prospect that was already saved (same name + company).
  const candidate = useTalent((s) =>
    modal.candidateId
      ? s.candidates.find((c) => c.id === modal.candidateId)
      : prospect
        ? s.candidates.find((c) => c.name.toLowerCase() === prospect.name.toLowerCase() && c.currentCompany === prospect.currentCompany)
        : undefined,
  );
  const person = candidate ?? prospect;
  const outreach = useTalent((s) => s.outreach);
  const applications = useTalent((s) => s.applications);
  const { requisitions } = useTalentScope();
  const studioProfile = useStudio((s) => s.profile);
  const sender = useSender();

  const history = useMemo(() => (candidate ? outreach.filter((o) => o.candidateId === candidate.id).sort((a, b) => b.createdAt - a.createdAt) : []), [outreach, candidate]);
  const candApps = useMemo(() => (candidate ? applications.filter((a) => a.candidateId === candidate.id) : []), [applications, candidate]);
  const reqTitle = useMemo(() => new Map(requisitions.map((r) => [r.id, r.title])), [requisitions]);

  const [reqId, setReqId] = useState<string>(() => {
    if (modal.requisitionId) return modal.requisitionId;
    const active = candApps.filter((a) => a.status === 'active').sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return active?.requisitionId ?? '';
  });
  const reqOptions = useMemo(() => {
    const mine = new Set(candApps.map((a) => a.requisitionId));
    return requisitions.filter((r) => r.status === 'open' || r.status === 'pending-approval' || r.id === reqId || mine.has(r.id));
  }, [requisitions, candApps, reqId]);
  const req = requisitions.find((r) => r.id === reqId) ?? null;

  /** Last message for this requisition that actually went out (drives the default step + thread). */
  const threadFor = useCallback(
    (id: string) => {
      const list = history.filter((o) => (o.requisitionId ?? '') === id);
      return { lastSent: list.find((o) => o.status !== 'draft'), subject: list.find((o) => o.subject)?.subject };
    },
    [history],
  );
  const thread = threadFor(reqId);
  /** Follow up only while the thread is unanswered; after a reply, start fresh. */
  const nextStep = (id: string): Step => {
    const last = threadFor(id).lastSent;
    return last && (last.status === 'sent' || last.status === 'no-response') ? (Math.min(3, last.step + 1) as Step) : 1;
  };

  const [step, setStep] = useState<Step>(() => modal.step ?? nextStep(reqId));
  const [channel, setChannel] = useState<OutreachChannel>(() => thread.lastSent?.channel ?? (candidate ? 'linkedin-inmail' : 'linkedin-connect'));
  const [tone, setTone] = useState<OutreachTone>(() => thread.lastSent?.tone ?? 'warm');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const run = useRef(0);

  const profile = req?.jd.profile ?? studioProfile ?? null;
  const role = useMemo(() => roleFromProfile(profile, req), [profile, req]);
  const match = useMemo(
    () => (profile && person ? scoreMatch(profile, person, { location: req?.location ?? profile.location, workModel: req?.workModel ?? profile.workModel }) : null),
    [profile, person, req],
  );
  const previousSubject = step > 1 ? thread.subject : undefined;

  const generate = useCallback(async () => {
    if (!person) return;
    const id = ++run.current;
    setBusy(true);
    const started = Date.now();
    const res = await writeOutreach({ role, person: toOutreachPerson(person), match, channel, tone, step, sender, previousSubject });
    const wait = 420 - (Date.now() - started);
    if (wait > 0) await sleep(wait);
    if (id !== run.current) return;
    setDraft({ subject: res.draft.subject ?? '', body: res.draft.body, hooks: res.draft.hooks, engine: res.draft.engine, fallbackReason: res.fallbackReason });
    setBusy(false);
  }, [person, role, match, channel, tone, step, sender, previousSubject]);

  // Auto-generate on open and whenever an option changes.
  useEffect(() => {
    if (open) void generate();
  }, [reqId, channel, tone, step]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!person)
    return (
      <Modal open={open} onClose={onClose} title="Message unavailable">
        <p className="muted">This person is no longer in the talent pool.</p>
      </Modal>
    );

  const meta = CHANNEL_META[channel];
  const subject = draft?.subject ?? '';
  const body = draft?.body ?? '';
  const over = body.length > meta.limit;
  const subjectOver = !!meta.subjectLimit && subject.length > meta.subjectLimit;
  const tooShort = body.trim().length < 20;
  const dnc = candidate?.status === 'do-not-contact';
  const blocked = !draft || busy || over || subjectOver || tooShort || dnc || !canLog;
  const linkedinUrl = candidate?.linkedinUrl;
  const email = candidate?.email;
  const isSample = !!(candidate?.sample ?? prospect?.sample);
  const notInPool = !candidate && !!prospect;

  const edit = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const changeReq = (id: string) => {
    setReqId(id);
    if (!modal.step) setStep(nextStep(id));
  };

  const copyBody = async () => {
    if (await copyText(body)) toast.success('Message copied', channel === 'email' ? 'Paste it into your email.' : 'Paste it into LinkedIn.');
    else toast.error('Couldn’t copy. Select the text and copy it manually.');
  };
  const copySubject = async () => {
    if (await copyText(subject)) toast.success('Subject copied');
  };
  const copyAndOpen = async () => {
    if (!linkedinUrl) return;
    await copyText(body);
    window.open(linkedinUrl, '_blank', 'noopener,noreferrer');
    toast.info('Message copied', 'Paste it into LinkedIn, send it, then log it here.');
  };

  const persist = (status: 'draft' | 'sent') => {
    if (!draft || blocked) return;
    const t = useTalent.getState();
    let candidateId = candidate?.id;
    if (prospect && !modal.candidateId) {
      // Prospects join the pool first (and the requisition's pipeline when it's open).
      const res = t.addProspect(prospect, req && req.status === 'open' ? req.id : null, match);
      if (!res.candidateId) {
        toast.result(res);
        return;
      }
      candidateId = res.candidateId;
    }
    if (!candidateId) return;
    const res = useTalent.getState().logOutreach({
      candidateId,
      requisitionId: reqId || null,
      channel,
      tone,
      subject: meta.subjectLimit ? subject : undefined,
      body,
      step,
      engine: draft.engine,
      status,
    });
    if (toast.result(res)) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={780}
      className="tl-out-modal"
      icon={
        <span className="tl-out-modal__icon" aria-hidden="true">
          <Send />
        </span>
      }
      title={`Message ${first(person.name)}`}
      subtitle="AI-drafted and personalised. You send it; NEXUS logs it and schedules follow-ups."
      footer={
        <>
          <span className="tl-out-modal__foot-note">
            <Info aria-hidden="true" /> Log it once it’s sent{step < 3 ? ` · next follow-up in ${FOLLOW_UP_DAYS[(step + 1) as 2 | 3] - FOLLOW_UP_DAYS[step]} days` : ''}
          </span>
          <button type="button" className="btn" onClick={() => persist('draft')} disabled={blocked}>
            <Save aria-hidden="true" /> Save draft
          </button>
          <button type="button" className="btn btn--primary" onClick={() => persist('sent')} disabled={blocked}>
            <Send aria-hidden="true" /> Log as sent
          </button>
        </>
      }
    >
      <div className="tl-out-modal__body">
        {/* Recipient */}
        <section className="tl-out-recipient">
          <CandidateAvatar person={person} size={48} />
          <div className="tl-out-recipient__who">
            <div className="tl-out-recipient__name">
              <span className="truncate">{person.name}</span>
              {isSample && <SampleTag />}
              {candidate ? <SourceBadge source={candidate.source} detail={candidate.sourceDetail} /> : prospect && <DegreeBadge degree={prospect.connectionDegree} />}
            </div>
            <div className="tl-out-recipient__role truncate">
              {person.currentTitle}
              {person.currentCompany ? ` @ ${person.currentCompany}` : ''} · {person.location}
            </div>
            {notInPool && <div className="tl-out-recipient__note">LinkedIn prospect · logging the message adds them to your talent pool{req?.status === 'open' ? ` and the ${req.title} pipeline` : ''}.</div>}
            {candidate?.lastContactedAt && <div className="tl-out-recipient__note">Last contacted {daysAgo(candidate.lastContactedAt)}</div>}
          </div>
          {match ? (
            <div className="tl-out-recipient__match" title={match.reasons.slice(0, 3).join(' · ')}>
              <MatchRing score={match.score} size={50} stroke={5} />
              <span>match</span>
            </div>
          ) : null}
        </section>

        {dnc && (
          <div className="tl-src-notice tl-src-notice--warn" role="alert">
            <ShieldAlert aria-hidden="true" />
            <span>
              <b>{person.name} asked not to be contacted.</b> Outreach is disabled for this person.
            </span>
          </div>
        )}
        {!canLog && (
          <div className="tl-src-notice" role="note">
            <Info aria-hidden="true" />
            <span>You can preview drafts, but logging outreach needs sourcing or recruiting access.</span>
          </div>
        )}

        {/* Options */}
        <section className="tl-out-options">
          <label className="field">
            <span className="field-label">Requisition</span>
            <select className="select" value={reqId} onChange={(e) => changeReq(e.target.value)}>
              <option value="">{studioProfile ? `No requisition · ${studioProfile.title} (studio JD)` : 'No requisition (general)'}</option>
              {reqOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} · {r.location}
                  {r.status === 'pending-approval' ? ' (awaiting approval)' : r.status !== 'open' ? ` (${r.status})` : ''}
                </option>
              ))}
            </select>
            {!profile && <span className="field-hint">Pick a requisition so the message references the right role.</span>}
          </label>
          <div className="field">
            <span className="field-label">Sequence</span>
            <Segmented
              label="Sequence step"
              value={String(step) as '1' | '2' | '3'}
              onChange={(v) => setStep(Number(v) as Step)}
              options={[
                { value: '1', label: '1st touch' },
                { value: '2', label: 'Follow-up #1' },
                { value: '3', label: 'Follow-up #2' },
              ]}
            />
            {step > 1 && (
              <span className="field-hint">
                {thread.lastSent ? `Replies in-thread to your ${STEP_LABEL[thread.lastSent.step].toLowerCase()} from ${fmtRelativeDay(thread.lastSent.sentAt ?? thread.lastSent.createdAt)}.` : 'No earlier message logged for this requisition.'}
              </span>
            )}
          </div>
          <div className="field">
            <span className="field-label">Channel</span>
            <ChannelPicker value={channel} onChange={setChannel} />
          </div>
          <div className="field">
            <span className="field-label">Tone</span>
            <TonePicker value={tone} onChange={setTone} />
          </div>
        </section>

        {/* Composer */}
        <section className={cx('tl-out-composer', over && 'is-over', busy && 'is-busy')} aria-busy={busy}>
          <header className="tl-out-composer__head">
            <span className="tl-out-composer__title" title={meta.hint}>
              <Sparkles aria-hidden="true" />
              <span className="tl-out-composer__long">{meta.label}</span>
              <span className="tl-out-composer__short">{meta.short}</span>
            </span>
            {draft && !busy && <EngineBadge engine={draft.engine} />}
            <span className="spacer" />
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void generate()} disabled={busy}>
              {busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />} {busy ? 'Writing…' : 'Regenerate'}
            </button>
          </header>
          {!draft ? (
            <div className="tl-out-skel" role="status">
              <span className="tl-out-skel__label">
                <LoaderCircle className="spin" aria-hidden="true" /> Writing a personal note for {first(person.name)}…
              </span>
              <span className="skeleton" style={{ width: '92%' }} />
              <span className="skeleton" style={{ width: '78%' }} />
              <span className="skeleton" style={{ width: '60%' }} />
            </div>
          ) : (
            <>
              {meta.subjectLimit && (
                <div className="tl-out-subject">
                  <input className="input" value={subject} onChange={(e) => edit({ subject: e.target.value })} aria-label="Subject" placeholder="Subject" />
                  <span className={cx('tl-out-subject__count', subjectOver && 'is-over')}>
                    {subject.length}/{meta.subjectLimit}
                  </span>
                  <button type="button" className="icon-btn icon-btn--sm tl-out-subject__copy" onClick={() => void copySubject()} aria-label="Copy subject" data-tip="Copy subject">
                    <Copy />
                  </button>
                </div>
              )}
              <textarea
                className="textarea tl-out-body"
                value={body}
                onChange={(e) => edit({ body: e.target.value })}
                rows={channel === 'linkedin-connect' ? 5 : 11}
                aria-label={`Message to ${person.name}`}
              />
              <CharMeter count={body.length} limit={meta.limit} label={meta.short} />
              <HookChips hooks={draft.hooks} />
              <FallbackNotice reason={draft.fallbackReason} />
            </>
          )}
          <div className="tl-out-composer__tools">
            <button type="button" className="btn btn--sm" onClick={() => void copyBody()} disabled={!draft || busy}>
              <Copy aria-hidden="true" /> Copy message
            </button>
            {linkedinUrl ? (
              <button type="button" className="btn btn--sm tl-src-li-btn btn--primary" onClick={() => void copyAndOpen()} disabled={!draft || busy}>
                <Linkedin aria-hidden="true" /> Copy & open LinkedIn <ExternalLink aria-hidden="true" />
              </button>
            ) : (
              <span className="tl-out-composer__note">
                <Linkedin aria-hidden="true" />
                {isSample ? 'Sample profile: no real LinkedIn page to open. Copy the message instead.' : 'No LinkedIn URL on file. Add one to their profile to open it from here.'}
              </span>
            )}
            {channel === 'email' && caps.contact && email && (
              <a className="btn btn--sm" href={mailtoHref(email, subject, body)}>
                <Mail aria-hidden="true" /> Open in mail app
              </a>
            )}
          </div>
        </section>

        {/* History */}
        {candidate && (
          <section className="tl-out-history">
            <button type="button" className="tl-out-history__toggle" aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)} disabled={!history.length}>
              <History aria-hidden="true" />
              <span className="grow">Outreach history</span>
              <span className="tl-out-history__count">{history.length}</span>
              {history.length > 0 && <ChevronDown aria-hidden="true" className={cx('tl-out-history__chev', showHistory && 'is-open')} />}
            </button>
            {showHistory && (
              <ol className="tl-out-history__list">
                {history.map((o) => (
                  <li key={o.id} className="tl-out-history__item">
                    <div className="tl-out-history__top">
                      <OutreachStatusBadge status={o.status} />
                      <span className="tl-out-history__meta">
                        {CHANNEL_META[o.channel].short} · {STEP_LABEL[o.step]}
                        {o.requisitionId ? ` · ${reqTitle.get(o.requisitionId) ?? 'Requisition'}` : ''}
                      </span>
                      <span className="tl-out-history__when">{fmtWhen(o.sentAt ?? o.createdAt)}</span>
                    </div>
                    <p className="tl-out-history__text clamp-2">
                      {o.subject && <b>{o.subject} · </b>}
                      {o.body}
                    </p>
                    {o.status === 'sent' && o.followUpAt && <span className="tl-out-history__fu">Follow-up due {fmtRelativeDay(o.followUpAt)}</span>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}
