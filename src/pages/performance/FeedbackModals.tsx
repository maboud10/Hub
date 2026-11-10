/**
 * Continuous feedback composers — shared by Feedback, Team and any other Performance screen.
 *
 *  - <GiveFeedbackModal>     the SBI coach (signature): Situation → Behaviour → Impact (+ Next time for
 *                            constructive), live tone meter, SBI completeness and wording check (bias.ts),
 *                            Nova "Polish" that composes a ready-to-send message (typewriter, editable),
 *                            visibility (private · recipient + manager · public praise → Hub kudos and an
 *                            optional #kudos post in Pulse Chat), competency + OKR links.
 *  - <RequestFeedbackModal>  ask 1–6 people about a topic, with a due date (default: next Friday).
 *  - <KindChip>, <VisibilityChip>, <CompetencyChip>  small, consistent chips (icon + label, never colour only).
 *
 * Usage: <GiveFeedbackModal open onClose toId? requestId? objectiveId? onSent? />
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import {
  CalendarDays,
  Check,
  ChevronDown,
  Flag,
  Frown,
  Globe,
  Hammer,
  HandHeart,
  Handshake,
  HeartHandshake,
  Lightbulb,
  Lock,
  Meh,
  MessageSquareHeart,
  MessageSquarePlus,
  Reply,
  Rocket,
  RotateCcw,
  Smile,
  Sprout,
  UserRound,
  Users,
  UsersRound,
  WandSparkles,
  X,
} from 'lucide-react';
import { Chip, NovaChip, PeoplePicker } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { currentViewer, loadBridge } from '@/lib/appBridge';
import { burstConfetti } from '@/lib/confetti';
import { cx } from '@/lib/cx';
import { analyzeTone, applySuggestion, checkReview, sbiCompleteness, type BiasFlag } from '@/performance/bias';
import { COMPETENCIES, COMPETENCY } from '@/performance/constants';
import { composeFeedback } from '@/performance/nova';
import { currentPeriod, objectivesOwnedBy, visibleObjectives } from '@/performance/selectors';
import { usePerf } from '@/performance/store';
import type { CompetencyId, FeedbackKind, FeedbackVisibility, Objective } from '@/performance/types';
import { toast } from '@/store/toast';
import type { KudosValue } from '@/types';
import { dueLabel, report, useMinute, usePerfCtx } from './hooks';
import { Kbd, NovaThinking, PfModal, Seg, useNova } from './ui';
import './styles/feedback.css';

const DAY = 86_400_000;

/* ═════════════════════════ Chips ═════════════════════════ */

const COMP_ICON: Record<CompetencyId, ReactNode> = {
  craft: <Hammer />,
  collaboration: <Handshake />,
  ownership: <Flag />,
  impact: <Rocket />,
  customer: <HeartHandshake />,
};

export function KindChip({ kind, size = 'sm' }: { kind: FeedbackKind; size?: 'sm' | 'md' }) {
  return kind === 'praise' ? (
    <Chip tone="pink" size={size === 'sm' ? 'sm' : undefined} icon={<HandHeart />} className="pf-fb-kind">
      Praise
    </Chip>
  ) : (
    <Chip tone="teal" size={size === 'sm' ? 'sm' : undefined} icon={<Sprout />} className="pf-fb-kind">
      Constructive
    </Chip>
  );
}

export function VisibilityChip({ visibility, viewerIsRecipient }: { visibility: FeedbackVisibility; viewerIsRecipient?: boolean }) {
  if (visibility === 'private')
    return (
      <Chip tone="slate" size="sm" icon={<Lock />} title="Only the recipient (and the author) can see this">
        Private
      </Chip>
    );
  if (visibility === 'manager')
    return (
      <Chip tone="blue" size="sm" icon={<UsersRound />} title="The recipient and their manager can see this">
        {viewerIsRecipient ? 'You + manager' : 'Recipient + manager'}
      </Chip>
    );
  return (
    <Chip tone="violet" size="sm" icon={<Globe />} title="Public praise — also shared as kudos on the Hub">
      Public praise
    </Chip>
  );
}

export function CompetencyChip({ id }: { id: CompetencyId }) {
  return (
    <Chip tone="slate" size="sm" icon={COMP_ICON[id]} title={COMPETENCY[id].blurb}>
      {COMPETENCY[id].label}
    </Chip>
  );
}

/* ═════════════════════════ Helpers ═════════════════════════ */

const KUDOS: { id: KudosValue; label: string; icon: ReactNode }[] = [
  { id: 'teamwork', label: 'Teamwork', icon: <Users /> },
  { id: 'innovation', label: 'Innovation', icon: <Lightbulb /> },
  { id: 'customer', label: 'Customer', icon: <HeartHandshake /> },
  { id: 'ownership', label: 'Ownership', icon: <Flag /> },
  { id: 'craft', label: 'Craft', icon: <Hammer /> },
];
const KUDOS_FOR: Record<CompetencyId, KudosValue> = { craft: 'craft', collaboration: 'teamwork', ownership: 'ownership', impact: 'innovation', customer: 'customer' };

const COMP_HINTS: Record<CompetencyId, RegExp> = {
  craft: /\b(quality|craft|code|design|detail|rfc|polish|tests?|architecture|pixel|accessib\w*|runbooks?|docs?|review)\b/gi,
  collaboration: /\b(pair(ed|ing)?|together|helped|team|cross[- ]team|shared|context|aligned|partner(ed)?|mentor(ed|ing)?|crit|facilitat\w*)\b/gi,
  ownership: /\b(owned|ownership|follow[- ]?ups?|deadlines?|risks?|escalat\w*|flag(ged)?|proactive(ly)?|loop|commit(ted|ments?)?|on-call|incidents?|slipped)\b/gi,
  impact: /\b(shipped|launched|cut|reduced|increased|grew|metrics?|revenue|latency|p99|faster|saved|unblocked|delivered|\d+%)/gi,
  customer: /\b(customers?|clients?|users?|qbr|renewals?|research|interviews?|pilot)\b/gi,
};

/** Tiny deterministic competency suggestion from the words used. */
function suggestCompetency(text: string): CompetencyId | null {
  if (text.trim().length < 12) return null;
  let best: CompetencyId | null = null;
  let top = 0;
  for (const c of COMPETENCIES) {
    const n = (text.match(COMP_HINTS[c.id]) ?? []).length;
    if (n > top) {
      top = n;
      best = c.id;
    }
  }
  return best;
}

/** Light deterministic tidy-up when there is no SBI to compose from. */
function tidy(text: string, kind: FeedbackKind, firstName: string): string {
  let t = text.trim().replace(/\s+/g, ' ');
  if (!t) return t;
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!?]$/.test(t)) t += '.';
  if (firstName && !new RegExp(`\\b${firstName}\\b`, 'i').test(t)) {
    const lowerFirst = /^[A-Z][a-z]/.test(t) && !/^I\b/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
    t = `${firstName}, ${lowerFirst}`;
  }
  if (kind === 'praise' && !/\bthank/i.test(t)) t += ' Thank you!';
  if (kind === 'constructive' && !/(talk it through|happy to)/i.test(t)) t += ' Happy to talk it through.';
  return t;
}

type FieldId = 'situation' | 'behaviour' | 'impact' | 'next' | 'body';
const FIELD_LABEL: Record<FieldId, string> = { situation: 'Situation', behaviour: 'Behaviour', impact: 'Impact', next: 'Next time', body: 'Message' };

/** Wording flags worth coaching on in feedback (vague praise, labels, coded terms, absolutes, hedging). */
function wordingFlags(fields: { id: FieldId; text: string }[], now: number): BiasFlag[] {
  const answers = fields.filter((f) => f.text.trim());
  if (!answers.length) return [];
  return checkReview({ answers, evidence: [], cited: [], now }).flags.filter((f) => f.kind === 'vague' || f.kind === 'personality' || f.kind === 'coded' || f.kind === 'absolute' || f.kind === 'hedging');
}

async function shareToKudos(toName: string, body: string, subtitle: string) {
  try {
    const api = await loadBridge('chat');
    const viewer = currentViewer();
    if (!viewer) throw new Error('signed out');
    const res = api.postToChannel(viewer, {
      channelId: 'ch-kudos',
      text: `Praise for ${toName}: ${body}`,
      card: { app: 'performance', title: `Praise for ${toName}`, subtitle, to: '/performance/feedback', status: 'Praise' },
    });
    if (res.ok) toast.success('Shared to #kudos', 'Your praise is live in Pulse Chat.');
    else toast.warning('Couldn’t post to #kudos', `${res.error} Your praise was still sent.`);
  } catch {
    toast.warning('Pulse Chat is unavailable right now', 'Your praise was still sent — you can share it to #kudos later.');
  }
}

/** Remount the dialog body on every open so each session starts fresh (drafts are restored explicitly). */
function useSession(open: boolean) {
  const [prevOpen, setPrevOpen] = useState(open);
  const [session, setSession] = useState(open ? 1 : 0);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setSession((s) => s + 1);
  }
  return session;
}

/* ═════════════════════════ Give feedback — the SBI coach ═════════════════════════ */

interface GiveDraft {
  to?: string;
  kind: FeedbackKind;
  situation: string;
  behaviour: string;
  impact: string;
  next: string;
  body: string;
  competency: CompetencyId | '';
  objectiveId: string;
  visibility: FeedbackVisibility;
  kudosValue: KudosValue;
  shareChat: boolean;
}
/** Unsent drafts survive closing the dialog (per viewer + recipient/request) for this session. */
const drafts = new Map<string, GiveDraft>();
const hasText = (d: Pick<GiveDraft, 'situation' | 'behaviour' | 'impact' | 'next' | 'body'>) => [d.situation, d.behaviour, d.impact, d.next, d.body].some((t) => t.trim());

export interface GiveFeedbackModalProps {
  open: boolean;
  onClose: () => void;
  /** Pre-selected recipient. */
  toId?: string;
  /** Answer a feedback request (the recipient becomes the requester). */
  requestId?: string;
  /** Pre-linked objective. */
  objectiveId?: string;
  /** Called with the new feedback id after a successful send. */
  onSent?: (feedbackId: string) => void;
}

export function GiveFeedbackModal(props: GiveFeedbackModalProps) {
  const session = useSession(props.open);
  if (!session) return null;
  return <GiveFeedbackDialog key={session} {...props} />;
}

const PROMPTS: Record<FeedbackKind, Record<'situation' | 'behaviour' | 'impact' | 'next', { q: string; ph: string }>> = {
  praise: {
    situation: { q: 'When and where did it happen?', ph: 'e.g. In Tuesday’s Prism crit' },
    behaviour: { q: 'What exactly did they do? Actions, not traits.', ph: 'e.g. you opened with three customer clips before we debated the nav' },
    impact: { q: 'What changed because of it?', ph: 'e.g. we decided in ten minutes and nobody argued from opinion' },
    next: { q: '', ph: '' },
  },
  constructive: {
    situation: { q: 'When and where did it happen?', ph: 'e.g. In Monday’s sprint planning' },
    behaviour: { q: 'What did you observe? Describe actions, not the person.', ph: 'e.g. priorities changed twice without context' },
    impact: { q: 'What was the effect?', ph: 'e.g. the team spent two days on work we then parked' },
    next: { q: 'What would help next time?', ph: 'e.g. share the why whenever priorities move' },
  },
};

function GiveFeedbackDialog({ open, onClose, toId, requestId, objectiveId, onSent }: GiveFeedbackModalProps) {
  const ctx = usePerfCtx();
  const now = useMinute();
  const requests = usePerf((s) => s.requests);
  const objectives = usePerf((s) => s.objectives);
  const periods = usePerf((s) => s.periods);
  const feedback = usePerf((s) => s.feedback);
  const me = ctx?.me.id ?? '';

  const request = useMemo(() => (requestId ? requests.find((r) => r.id === requestId && r.respondentIds.includes(me)) : undefined), [requests, requestId, me]);
  const lockedTo = request?.requesterId;
  const draftKey = `${me}:${request ? `req:${request.id}` : (toId ?? 'new')}`;
  const [saved] = useState(() => drafts.get(draftKey));

  const [to, setTo] = useState<string | undefined>(lockedTo ?? saved?.to ?? toId);
  const [kind, setKindRaw] = useState<FeedbackKind>(saved?.kind ?? 'praise');
  const [situation, setSituation] = useState(saved?.situation ?? '');
  const [behaviour, setBehaviour] = useState(saved?.behaviour ?? '');
  const [impact, setImpact] = useState(saved?.impact ?? '');
  const [next, setNext] = useState(saved?.next ?? '');
  const [body, setBody] = useState(saved?.body ?? '');
  const [competency, setCompetency] = useState<CompetencyId | ''>(saved?.competency ?? '');
  const [objective, setObjective] = useState(saved?.objectiveId ?? objectiveId ?? '');
  const [visibility, setVisibility] = useState<FeedbackVisibility>(saved?.visibility ?? (request ? 'private' : 'manager'));
  const [kudosValue, setKudosValue] = useState<KudosValue>(saved?.kudosValue ?? 'teamwork');
  const [kudosTouched, setKudosTouched] = useState(!!saved);
  const [shareChat, setShareChat] = useState(saved?.shareChat ?? true);
  const [restored, setRestored] = useState(!!saved && hasText(saved));
  const [polished, setPolished] = useState(false);
  const sentRef = useRef(false);
  const sendRef = useRef<HTMLButtonElement>(null);

  const setKind = (k: FeedbackKind) => {
    setKindRaw(k);
    if (k === 'constructive' && visibility === 'public') setVisibility('private');
  };

  // Remember unsent work (per viewer + recipient/request) until it is sent.
  useEffect(() => {
    if (!me || sentRef.current) return;
    const d: GiveDraft = { to, kind, situation, behaviour, impact, next, body, competency, objectiveId: objective, visibility, kudosValue, shareChat };
    if (hasText(d)) drafts.set(draftKey, d);
    else drafts.delete(draftKey);
  }, [me, draftKey, to, kind, situation, behaviour, impact, next, body, competency, objective, visibility, kudosValue, shareChat]);

  const candidates = useMemo(() => (ctx ? ctx.people.filter((u) => u.id !== ctx.me.id) : []), [ctx]);
  const quick = useMemo(() => {
    if (!ctx) return [] as string[];
    const score = new Map<string, number>();
    const bump = (id: string | undefined, n: number) => {
      if (!id || id === me || !ctx.peopleIds.has(id)) return;
      score.set(id, (score.get(id) ?? 0) + n);
    };
    for (const id of ctx.reportIds) bump(id, 3);
    bump(ctx.me.managerId, 2);
    for (const u of ctx.people) if (ctx.me.managerId && u.managerId === ctx.me.managerId) bump(u.id, 1);
    for (const f of feedback) {
      if (now - f.at > 60 * DAY) continue;
      if (f.fromId === me) bump(f.toId, 2);
      if (f.toId === me) bump(f.fromId, 2);
    }
    return [...score.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);
  }, [ctx, feedback, me, now]);

  const toUser = ctx?.user(to);
  const toFirst = toUser ? toUser.name.split(' ')[0] : '';
  const mgr = toUser?.managerId ? ctx?.user(toUser.managerId) : undefined;
  const isConstructive = kind === 'constructive';
  const nextText = isConstructive ? next : '';

  const sbi = useMemo(() => sbiCompleteness({ situation, behaviour, impact }), [situation, behaviour, impact]);
  const composed = useMemo(
    () => (behaviour.trim() ? composeFeedback({ situation, behaviour, impact, next: nextText }, kind, toFirst || 'Hey') : ''),
    [situation, behaviour, impact, nextText, kind, toFirst],
  );
  const message = body.trim() ? body.trim() : composed;
  const combined = [situation, behaviour, impact, nextText, body].filter((t) => t.trim()).join('. ');
  const tone = useMemo(() => analyzeTone(combined), [combined]);
  const flags = useMemo(
    () =>
      wordingFlags(
        [
          { id: 'situation', text: situation },
          { id: 'behaviour', text: behaviour },
          { id: 'impact', text: impact },
          { id: 'next', text: nextText },
          { id: 'body', text: body },
        ],
        now,
      ),
    [situation, behaviour, impact, nextText, body, now],
  );
  const suggested = useMemo(() => suggestCompetency(combined), [combined]);

  // Keep the kudos value in step with the competency until the user picks one.
  useEffect(() => {
    if (!kudosTouched && competency) setKudosValue(KUDOS_FOR[competency]);
  }, [competency, kudosTouched]);

  const period = useMemo(() => currentPeriod({ periods }, now), [periods, now]);
  const okrGroups = useMemo(() => {
    if (!ctx || !period) return [] as { label: string; items: Objective[] }[];
    const vis = visibleObjectives({ objectives }, ctx.v, ctx.users, period.id).sort((a, b) => a.title.localeCompare(b.title));
    const owns = (o: Objective, id?: string) => !!id && (o.ownerId === id || o.coOwnerIds.includes(id));
    const theirs = vis.filter((o) => owns(o, to));
    const mine = vis.filter((o) => !owns(o, to) && owns(o, me));
    const shared = vis.filter((o) => !owns(o, to) && !owns(o, me) && o.level !== 'individual');
    const others = vis.filter((o) => !owns(o, to) && !owns(o, me) && o.level === 'individual');
    return [
      { label: toFirst ? `${toFirst}’s objectives` : 'Their objectives', items: theirs },
      { label: 'Your objectives', items: mine },
      { label: 'Company & team', items: shared },
      { label: 'Other people', items: others },
    ].filter((g) => g.items.length);
  }, [ctx, period, objectives, to, me, toFirst]);

  /* ───── Nova polish (typewriter into the editable message) ───── */
  const nova = useNova(() => (behaviour.trim() ? composeFeedback({ situation, behaviour, impact, next: nextText }, kind, toFirst || 'Hey') : tidy(body, kind, toFirst)), 'polish', 700);
  const streaming = nova.thinking || (!!nova.text && !nova.done);
  useEffect(() => {
    if (nova.done && nova.text) {
      setBody(nova.text);
      setPolished(true);
      nova.clear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nova.done, nova.text]);
  const polish = () => {
    if (!behaviour.trim() && body.trim().length < 6) {
      toast.info('Give Nova something to work with', 'Describe what they did in step 2, or jot a quick note first.');
      return;
    }
    nova.run();
  };

  const fieldState: Record<FieldId, [string, (v: string) => void]> = {
    situation: [situation, setSituation],
    behaviour: [behaviour, setBehaviour],
    impact: [impact, setImpact],
    next: [next, setNext],
    body: [body, setBody],
  };
  const applyFlag = (f: BiasFlag) => {
    const id = f.questionId as FieldId | undefined;
    if (!id || !fieldState[id]) return;
    const [value, set] = fieldState[id];
    set(applySuggestion(value, f));
  };

  const startOver = () => {
    setSituation('');
    setBehaviour('');
    setImpact('');
    setNext('');
    setBody('');
    setCompetency('');
    setPolished(false);
    setRestored(false);
    drafts.delete(draftKey);
  };

  const tooShort = message.trim().length < 12;
  const disabledReason = !to ? 'Choose who it’s for' : tooShort ? 'Describe what they did (step 2), or write a short message' : streaming ? 'Nova is still writing' : '';

  const send = () => {
    if (!ctx || disabledReason || !to) {
      if (disabledReason) toast.info(disabledReason);
      return;
    }
    const res = usePerf.getState().giveFeedback({
      toId: to,
      kind,
      visibility,
      situation,
      behaviour,
      impact,
      body: message,
      competency: competency || undefined,
      objectiveId: objective || undefined,
      requestId: request?.id,
      kudosValue: visibility === 'public' ? kudosValue : undefined,
    });
    if (!report(res, '')) return;
    if (!res.ok) return;
    sentRef.current = true;
    drafts.delete(draftKey);
    const toName = toUser?.name ?? 'them';
    toast.success(
      res.message ?? 'Sent',
      res.kudos ? 'Also posted as kudos on the Hub feed.' : visibility === 'manager' ? `${toFirst} and their manager can see it.` : visibility === 'private' ? `Only ${toFirst} can see it.` : undefined,
    );
    if (kind === 'praise') {
      const r = sendRef.current?.getBoundingClientRect();
      burstConfetti(r ? { x: r.left + r.width / 2, y: r.top } : undefined);
    }
    if (kind === 'praise' && visibility === 'public' && shareChat) {
      const subtitle = competency ? COMPETENCY[competency].label : (KUDOS.find((k) => k.id === kudosValue)?.label ?? 'Continuous feedback');
      void shareToKudos(toName, message, subtitle);
    }
    onSent?.(res.id);
    onClose();
  };

  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    }
  };

  if (!ctx) return null;
  const P = PROMPTS[kind];
  const toneLabel = !combined ? 'Waiting for words' : tone.tone === 'warm' ? 'Warm' : tone.tone === 'harsh' ? 'Harsh' : 'Neutral';
  const requester = request ? ctx.user(request.requesterId) : undefined;

  const tips: { id: string; text: string; tone: 'info' | 'warn' | 'ok' }[] = [];
  if (!to) tips.push({ id: 'to', text: 'Start by choosing who it’s for.', tone: 'info' });
  if (sbi.missing.includes('behaviour')) tips.push({ id: 'b', text: 'Describe what they did — observable actions, not traits.', tone: 'info' });
  else if (sbi.missing.includes('impact')) tips.push({ id: 'i', text: isConstructive ? 'Name the effect — what happened as a result?' : 'Say why it mattered — what changed because of it?', tone: 'info' });
  if (sbi.missing.includes('situation') && !sbi.missing.includes('behaviour')) tips.push({ id: 's', text: 'Anchor it in a moment: when and where did this happen?', tone: 'info' });
  if (isConstructive && !next.trim() && !sbi.missing.includes('behaviour')) tips.push({ id: 'n', text: 'Offer a way forward — what would you like to see next time?', tone: 'info' });
  for (const t of tone.tips) tips.push({ id: t, text: t, tone: 'warn' });
  if (combined && !isConstructive && tone.tone === 'neutral' && !sbi.missing.length) tips.push({ id: 'warm', text: 'Add a thank-you — praise lands best when it is specific and warm.', tone: 'info' });
  if (combined && !tips.length) tips.push({ id: 'ok', text: isConstructive ? 'Clear, kind and actionable. Nicely done.' : 'Specific and warm — this will land well.', tone: 'ok' });

  const VIS: { id: FeedbackVisibility; title: string; desc: string; icon: ReactNode; disabled?: string }[] = [
    { id: 'private', title: 'Private', desc: toFirst ? `Only ${toFirst} sees it` : 'Only the recipient sees it', icon: <Lock /> },
    { id: 'manager', title: 'Recipient + manager', desc: toFirst ? (mgr ? `${toFirst} and ${mgr.name.split(' ')[0]}` : `${toFirst} (no manager on file)`) : 'Recipient and their manager', icon: <UsersRound /> },
    {
      id: 'public',
      title: 'Public praise',
      desc: isConstructive ? 'For praise only' : 'Shared as kudos on the Hub',
      icon: <Globe />,
      disabled: isConstructive ? 'Constructive feedback stays private or goes to their manager.' : undefined,
    },
  ];

  const steps: { id: 'situation' | 'behaviour' | 'impact' | 'next'; n: number; label: string; value: string; set: (v: string) => void; done: boolean }[] = [
    { id: 'situation', n: 1, label: 'Situation', value: situation, set: setSituation, done: !sbi.missing.includes('situation') },
    { id: 'behaviour', n: 2, label: 'Behaviour', value: behaviour, set: setBehaviour, done: !sbi.missing.includes('behaviour') },
    { id: 'impact', n: 3, label: 'Impact', value: impact, set: setImpact, done: !sbi.missing.includes('impact') },
  ];
  if (isConstructive) steps.push({ id: 'next', n: 4, label: 'Next time', value: next, set: setNext, done: next.trim().split(/\s+/).filter(Boolean).length >= 3 });

  return (
    <PfModal
      open={open}
      onClose={onClose}
      width={940}
      className="pf-fb-modal"
      icon={request ? <Reply /> : <MessageSquareHeart />}
      title={request && requester ? `Answer ${requester.name.split(' ')[0]}’s request` : 'Give feedback'}
      subtitle={request ? `On “${request.topic}”` : 'Specific, kind and timely — the SBI coach helps you say it well.'}
      footer={
        <>
          <span className="pf-fb-foot__meta">
            {restored ? (
              <button type="button" className="pf-fb-restored" onClick={startOver}>
                <RotateCcw aria-hidden="true" /> Draft restored · Start over
              </button>
            ) : (
              <>
                <b>{3 - sbi.missing.length}/3</b> SBI · {toneLabel.toLowerCase()} tone
              </>
            )}
          </span>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button ref={sendRef} type="button" className="neo-btn neo-btn--plasma" onClick={send} disabled={!!disabledReason} title={disabledReason || 'Send (⌘/Ctrl + Enter)'} data-qa="fb-send">
            {isConstructive ? <Sprout /> : <HandHeart />}
            {isConstructive ? 'Share feedback' : 'Send praise'}
            <span className="pf-fb-kbdhint">
              <Kbd>⌘↵</Kbd>
            </span>
          </button>
        </>
      }
    >
      <div className="pf-fb-give" onKeyDown={onKey}>
        <div className="pf-fb-give__main">
          {request && requester && (
            <div className="pf-fb-answer">
              <Avatar user={requester} size={34} />
              <div className="pf-fb-answer__text">
                <b>
                  {requester.name.split(' ')[0]} asked for feedback on “{request.topic}”
                </b>
                {request.note && <p>“{request.note}”</p>}
              </div>
              <Chip tone={dueLabel(request.dueAt, now).tone} size="sm" icon={<CalendarDays />}>
                {dueLabel(request.dueAt, now).text}
              </Chip>
            </div>
          )}

          <div className="pf-fb-row">
            <div className="neo-field grow">
              <span className="neo-label">To</span>
              <PeoplePicker
                value={to ? [to] : []}
                onChange={(ids) => setTo(ids[0])}
                users={candidates}
                label="Who is this feedback for?"
                trigger={(p) => (
                  <button {...p} type="button" className="pf-fb-who" disabled={!!lockedTo} data-qa="fb-to" aria-label={toUser ? `Recipient: ${toUser.name}` : 'Choose a recipient'}>
                    {toUser ? (
                      <>
                        <Avatar user={toUser} size={30} presence />
                        <span className="pf-fb-who__text">
                          <b>{toUser.name}</b>
                          <small>{toUser.title}</small>
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="pf-fb-who__ph" aria-hidden="true">
                          <UserRound />
                        </span>
                        <span className="pf-fb-who__text">
                          <b>Choose a person</b>
                          <small>Anyone who uses Performance &amp; OKRs</small>
                        </span>
                      </>
                    )}
                    {!lockedTo && <ChevronDown className="pf-fb-who__chev" aria-hidden="true" />}
                  </button>
                )}
              />
            </div>
            <div className="neo-field">
              <span className="neo-label">Kind</span>
              <Seg
                value={kind}
                onChange={setKind}
                label="Kind of feedback"
                options={[
                  { value: 'praise', label: <><HandHeart aria-hidden="true" /> Praise</>, title: 'Celebrate something specific' },
                  { value: 'constructive', label: <><Sprout aria-hidden="true" /> Constructive</>, title: 'Help them grow' },
                ]}
              />
            </div>
          </div>

          {!to && !lockedTo && quick.length > 0 && (
            <div className="pf-fb-quick" aria-label="Suggested people">
              <span className="neo-hud">Suggested</span>
              {quick.map((id) => {
                const u = ctx.user(id);
                if (!u) return null;
                return (
                  <button key={id} type="button" className="pf-fb-quick__btn" onClick={() => setTo(id)}>
                    <Avatar user={u} size={20} />
                    {u.name.split(' ')[0]}
                  </button>
                );
              })}
            </div>
          )}

          <ol className="pf-fb-steps" aria-label="Situation, behaviour, impact">
            {steps.map((s) => (
              <li key={s.id} className={cx('pf-fb-step', s.done && 'is-done')} data-step={s.id}>
                <span className="pf-fb-step__node" aria-hidden="true">
                  {s.done ? <Check /> : s.n}
                </span>
                <div className="pf-fb-step__body">
                  <label className="pf-fb-step__label" htmlFor={`fb-${s.id}`}>
                    <b>{s.label}</b>
                    <span>{P[s.id].q}</span>
                  </label>
                  <textarea id={`fb-${s.id}`} className="neo-textarea pf-fb-step__input" rows={2} value={s.value} onChange={(e) => s.set(e.target.value)} placeholder={P[s.id].ph} data-qa={`fb-${s.id}`} />
                </div>
              </li>
            ))}
          </ol>

          <div className="pf-fb-msg">
            <div className="pf-fb-msg__head">
              <label className="neo-label" htmlFor="fb-body">
                Message {toFirst ? `${toFirst} will read` : 'they will read'}
              </label>
              <span className={cx('pf-fb-tonepill')} data-tone={!combined ? 'empty' : tone.tone}>
                {tone.tone === 'warm' ? <Smile aria-hidden="true" /> : tone.tone === 'harsh' ? <Frown aria-hidden="true" /> : <Meh aria-hidden="true" />}
                {toneLabel}
              </span>
              <button type="button" className="neo-btn neo-btn--nova neo-btn--xs" onClick={polish} disabled={streaming} data-qa="fb-polish">
                <WandSparkles /> Polish with Nova
              </button>
            </div>
            <div className="pf-fb-msg__box">
              <textarea
                id="fb-body"
                className={cx('neo-textarea pf-fb-msg__input', streaming && 'is-streaming')}
                rows={4}
                value={streaming ? nova.shown : body}
                readOnly={streaming}
                onChange={(e) => {
                  setBody(e.target.value);
                  setPolished(false);
                }}
                placeholder={composed || 'Write it your way — or fill in the steps above and Nova will compose it.'}
                data-qa="fb-body"
              />
              {nova.thinking && (
                <span className="pf-fb-msg__thinking">
                  <NovaThinking label="Nova is polishing" />
                </span>
              )}
            </div>
            <div className="pf-hint-row">
              {polished ? (
                <>
                  <NovaChip>Polished</NovaChip> Edit freely — it’s your voice.
                </>
              ) : !body.trim() && composed ? (
                'Live preview from your steps — send as is, or polish and edit.'
              ) : (
                'Tip: ⌘/Ctrl + Enter sends.'
              )}
            </div>
          </div>

          <div className="pf-form-row">
            <div className="neo-field">
              <label className="neo-label" htmlFor="fb-comp">
                Competency
              </label>
              <select id="fb-comp" className="neo-select neo-select--sm" value={competency} onChange={(e) => setCompetency(e.target.value as CompetencyId | '')}>
                <option value="">No competency</option>
                {COMPETENCIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              {suggested && !competency && (
                <button type="button" className="pf-fb-suggest" onClick={() => setCompetency(suggested)}>
                  <NovaChip>Suggest</NovaChip> {COMPETENCY[suggested].label}
                </button>
              )}
            </div>
            <div className="neo-field">
              <label className="neo-label" htmlFor="fb-okr">
                Link to an OKR
              </label>
              <select id="fb-okr" className="neo-select neo-select--sm" value={objective} onChange={(e) => setObjective(e.target.value)}>
                <option value="">No objective</option>
                {okrGroups.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.items.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.title.length > 60 ? `${o.title.slice(0, 58)}…` : o.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          <div className="neo-field">
            <span className="neo-label">Who can see it</span>
            <div className="pf-fb-vis" role="radiogroup" aria-label="Who can see this feedback">
              {VIS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={visibility === o.id}
                  disabled={!!o.disabled}
                  title={o.disabled}
                  className="pf-fb-vis__opt"
                  onClick={() => setVisibility(o.id)}
                  data-qa={`fb-vis-${o.id}`}
                >
                  <span className="pf-fb-vis__icon">{o.icon}</span>
                  <span className="pf-fb-vis__text">
                    <b>{o.title}</b>
                    <small>{o.desc}</small>
                  </span>
                  {visibility === o.id && <Check className="pf-fb-vis__check" aria-hidden="true" />}
                </button>
              ))}
            </div>
          </div>

          {visibility === 'public' && !isConstructive && (
            <div className="pf-fb-kudos neo-rise">
              <span className="neo-label">Kudos value</span>
              <div className="pf-fb-kudos__values" role="radiogroup" aria-label="Kudos value">
                {KUDOS.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    role="radio"
                    aria-checked={kudosValue === k.id}
                    className="neo-chip pf-fb-kudos__chip"
                    data-tone="app"
                    onClick={() => {
                      setKudosValue(k.id);
                      setKudosTouched(true);
                    }}
                  >
                    {k.icon}
                    {k.label}
                  </button>
                ))}
              </div>
              <label className="pf-fb-share">
                <input type="checkbox" className="neo-check" checked={shareChat} onChange={(e) => setShareChat(e.target.checked)} />
                <span>
                  Also share to <b>#kudos</b> in Pulse Chat
                </span>
              </label>
            </div>
          )}
        </div>

        <aside className="pf-fb-coach" aria-label="Feedback coach">
          <div className="pf-fb-coach__head">
            <NovaChip>Coach</NovaChip>
            <span className="neo-hud">Live</span>
          </div>
          <ToneGauge score={tone.score} tone={tone.tone} empty={!combined} label={toneLabel} />
          <div className="pf-fb-coach__block">
            <div className="pf-fb-coach__row">
              <span className="neo-hud">Specific</span>
              <b className="neo-num">{3 - sbi.missing.length}/3</b>
            </div>
            <div className="pf-fb-sbimeter" role="img" aria-label={`${3 - sbi.missing.length} of 3 SBI parts complete`}>
              {(['situation', 'behaviour', 'impact'] as const).map((k) => (
                <span key={k} className={cx('pf-fb-sbimeter__seg', !sbi.missing.includes(k) && 'is-on')}>
                  <i />
                  {FIELD_LABEL[k]}
                </span>
              ))}
            </div>
          </div>
          <ul className="pf-fb-tips" aria-live="polite">
            {tips.slice(0, 4).map((t) => (
              <li key={t.id} data-tone={t.tone}>
                {t.tone === 'ok' ? <Check aria-hidden="true" /> : t.tone === 'warn' ? <Frown aria-hidden="true" /> : <Lightbulb aria-hidden="true" />}
                <span>{t.text}</span>
              </li>
            ))}
          </ul>
          {flags.length > 0 && (
            <div className="pf-fb-coach__block">
              <span className="neo-hud">Wording</span>
              <ul className="pf-fb-flags">
                {flags.slice(0, 4).map((f) => (
                  <li key={f.id} className="pf-fb-flag">
                    <div className="pf-fb-flag__top">
                      <b>{f.title}</b>
                      <small>{FIELD_LABEL[(f.questionId as FieldId) ?? 'body']}</small>
                    </div>
                    <p>{f.kind === 'vague' ? `“${f.match}” doesn’t say what they did. Describe the behaviour in step 2.` : f.message}</p>
                    {f.kind !== 'vague' && f.suggestion !== undefined && (
                      <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={() => applyFlag(f)}>
                        {f.suggestion ? (
                          <>
                            <WandSparkles /> Use “{f.suggestion.length > 34 ? `${f.suggestion.slice(0, 32)}…` : f.suggestion}”
                          </>
                        ) : (
                          <>
                            <X /> Remove “{f.match}”
                          </>
                        )}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </PfModal>
  );
}

/** Semicircle tone gauge: harsh (left) → neutral → warm (right). Label + icon, never colour alone. */
function ToneGauge({ score, tone, empty, label }: { score: number; tone: 'warm' | 'neutral' | 'harsh'; empty: boolean; label: string }) {
  const gid = useId().replace(/:/g, '');
  const angle = empty ? 0 : Math.max(-88, Math.min(88, score * 88));
  return (
    <div className="pf-fb-gauge" data-tone={empty ? 'empty' : tone} role="img" aria-label={`Tone: ${label}`}>
      <svg viewBox="0 0 120 70" aria-hidden="true">
        <defs>
          <linearGradient id={`tg${gid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fb7185" />
            <stop offset="50%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
        </defs>
        <path d="M12 62 A48 48 0 0 1 108 62" className="pf-fb-gauge__track" />
        <path d="M12 62 A48 48 0 0 1 108 62" className="pf-fb-gauge__arc" stroke={`url(#tg${gid})`} />
        <g className="pf-fb-gauge__needle" style={{ transform: `rotate(${angle}deg)` }}>
          <line x1="60" y1="62" x2="60" y2="22" />
        </g>
        <circle cx="60" cy="62" r="5" className="pf-fb-gauge__hub" />
      </svg>
      <div className="pf-fb-gauge__scale" aria-hidden="true">
        <span>Harsh</span>
        <span>Warm</span>
      </div>
      <div className="pf-fb-gauge__label">
        {tone === 'warm' && !empty ? <Smile aria-hidden="true" /> : tone === 'harsh' && !empty ? <Frown aria-hidden="true" /> : <Meh aria-hidden="true" />}
        <b>{label}</b>
      </div>
    </div>
  );
}

/* ═════════════════════════ Request feedback ═════════════════════════ */

function nextFriday(now: number) {
  const d = new Date(now);
  const add = (5 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + add);
  d.setHours(17, 0, 0, 0);
  return d.getTime();
}
const toDateInput = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fromDateInput = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return Number.NaN;
  return new Date(y, m - 1, d, 17, 0, 0, 0).getTime();
};

export interface RequestFeedbackModalProps {
  open: boolean;
  onClose: () => void;
  respondentIds?: string[];
  topic?: string;
  onSent?: (requestId: string) => void;
}

export function RequestFeedbackModal(props: RequestFeedbackModalProps) {
  const session = useSession(props.open);
  if (!session) return null;
  return <RequestFeedbackDialog key={session} {...props} />;
}

function RequestFeedbackDialog({ open, onClose, respondentIds, topic: topic0, onSent }: RequestFeedbackModalProps) {
  const ctx = usePerfCtx();
  const now = useMinute();
  const feedback = usePerf((s) => s.feedback);
  const objectives = usePerf((s) => s.objectives);
  const periods = usePerf((s) => s.periods);
  const me = ctx?.me.id ?? '';
  const [ids, setIds] = useState<string[]>(() => (respondentIds ?? []).filter((id) => id !== me).slice(0, 6));
  const [topic, setTopic] = useState(topic0 ?? '');
  const [note, setNote] = useState('');
  const [due, setDue] = useState(() => toDateInput(nextFriday(Date.now())));

  const candidates = useMemo(() => (ctx ? ctx.people.filter((u) => u.id !== ctx.me.id) : []), [ctx]);
  const suggestions = useMemo(() => {
    if (!ctx) return [] as { id: string; why: string }[];
    const out = new Map<string, string>();
    const add = (id: string | undefined, why: string) => {
      if (!id || id === me || !ctx.peopleIds.has(id) || out.has(id)) return;
      out.set(id, why);
    };
    add(ctx.me.managerId, 'Your manager');
    const recent = new Map<string, number>();
    for (const f of feedback) {
      if (now - f.at > 90 * DAY) continue;
      const other = f.fromId === me ? f.toId : f.toId === me ? f.fromId : null;
      if (other) recent.set(other, (recent.get(other) ?? 0) + 1);
    }
    for (const [id] of [...recent.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)) add(id, 'Worked together recently');
    for (const u of ctx.people) if (ctx.me.managerId && u.managerId === ctx.me.managerId) add(u.id, 'Same team');
    for (const id of ctx.reportIds) add(id, 'Reports to you');
    return [...out.entries()].map(([id, why]) => ({ id, why })).slice(0, 6);
  }, [ctx, feedback, me, now]);

  const topics = useMemo(() => {
    if (!ctx) return [] as string[];
    const period = currentPeriod({ periods }, now);
    const out = ['My impact this quarter'];
    if (period) for (const o of objectivesOwnedBy({ objectives }, me, period.id).slice(0, 2)) out.push(o.title);
    out.push(ctx.reportIds.length ? 'How I run our team rituals' : 'How I run meetings');
    out.push('Working with me');
    return [...new Set(out)].slice(0, 5);
  }, [ctx, periods, objectives, me, now]);

  if (!ctx) return null;

  const set = (next: string[]) => {
    const unique = [...new Set(next)].filter((id) => id !== me);
    if (unique.length > 6) {
      toast.info('Ask up to 6 people at a time', 'Smaller asks get better answers.');
      return;
    }
    setIds(unique);
  };
  const dueAt = fromDateInput(due);
  const quickDue = [
    { label: 'Next Friday', at: nextFriday(now) },
    { label: 'In 1 week', at: now + 7 * DAY },
    { label: 'In 2 weeks', at: now + 14 * DAY },
  ];
  const reason = !ids.length ? 'Pick at least one person' : topic.trim().length < 3 ? 'What would you like feedback on?' : !Number.isFinite(dueAt) || dueAt < now ? 'Pick a due date in the future' : '';

  const send = () => {
    if (reason) {
      toast.info(reason);
      return;
    }
    const res = usePerf.getState().requestFeedback({ respondentIds: ids, topic, note, dueAt });
    if (!report(res)) return;
    if (res.ok) onSent?.(res.id);
    onClose();
  };

  return (
    <PfModal
      open={open}
      onClose={onClose}
      width={620}
      className="pf-fb-modal"
      icon={<MessageSquarePlus />}
      title="Request feedback"
      subtitle="Ask specific people about something specific — you’ll get better answers."
      footer={
        <>
          <span className="pf-fb-foot__meta">
            <b>{ids.length}</b>/6 people · due {Number.isFinite(dueAt) ? new Date(dueAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : '—'}
          </span>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={send} disabled={!!reason} title={reason || 'Send request'} data-qa="fb-request-send">
            <MessageSquarePlus /> Send request
          </button>
        </>
      }
    >
      <div
        className="pf-fb-ask"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            send();
          }
        }}
      >
        <div className="neo-field">
          <span className="neo-label">Who would you like to hear from?</span>
          <div className="pf-fb-picked">
            {ids.map((id) => {
              const u = ctx.user(id);
              if (!u) return null;
              return (
                <span key={id} className="pf-fb-picked__chip">
                  <Avatar user={u} size={22} />
                  {u.name}
                  <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label={`Remove ${u.name}`} onClick={() => set(ids.filter((x) => x !== id))}>
                    <X />
                  </button>
                </span>
              );
            })}
            <PeoplePicker
              multiple
              value={ids}
              onChange={set}
              users={candidates}
              label="Choose people to ask"
              trigger={(p) => (
                <button {...p} type="button" className="neo-btn neo-btn--soft neo-btn--sm" data-qa="fb-request-people">
                  <UsersRound /> {ids.length ? 'Add or remove' : 'Choose people'}
                </button>
              )}
            />
          </div>
          {suggestions.filter((s) => !ids.includes(s.id)).length > 0 && ids.length < 6 && (
            <div className="pf-fb-quick">
              <span className="neo-hud">Suggested</span>
              {suggestions
                .filter((s) => !ids.includes(s.id))
                .map((s) => {
                  const u = ctx.user(s.id);
                  if (!u) return null;
                  return (
                    <button key={s.id} type="button" className="pf-fb-quick__btn" title={s.why} onClick={() => set([...ids, s.id])}>
                      <Avatar user={u} size={20} />
                      {u.name.split(' ')[0]}
                      <small>{s.why}</small>
                    </button>
                  );
                })}
            </div>
          )}
        </div>

        <div className="neo-field">
          <label className="neo-label" htmlFor="fr-topic">
            Topic
          </label>
          <input id="fr-topic" className="neo-input" value={topic} maxLength={120} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. How the Prism v4 rollout landed" data-qa="fb-request-topic" />
          <div className="pf-fb-topics">
            {topics.map((t) => (
              <button key={t} type="button" className="neo-chip neo-chip--sm" data-tone={topic === t ? 'app' : 'slate'} aria-pressed={topic === t} onClick={() => setTopic(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="neo-field">
          <label className="neo-label" htmlFor="fr-note">
            Note <span className="pf-faint">(optional)</span>
          </label>
          <textarea id="fr-note" className="neo-textarea" rows={3} value={note} maxLength={600} onChange={(e) => setNote(e.target.value)} placeholder="What would make this feedback most useful? e.g. What should I change for the next wave?" />
        </div>

        <div className="neo-field">
          <label className="neo-label" htmlFor="fr-due">
            Due
          </label>
          <div className="pf-fb-due">
            <input id="fr-due" type="date" className="neo-input neo-input--sm" value={due} min={toDateInput(now)} onChange={(e) => setDue(e.target.value)} />
            {quickDue.map((q) => (
              <button key={q.label} type="button" className="neo-chip neo-chip--sm" data-tone={due === toDateInput(q.at) ? 'app' : 'slate'} aria-pressed={due === toDateInput(q.at)} onClick={() => setDue(toDateInput(q.at))}>
                {q.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </PfModal>
  );
}
