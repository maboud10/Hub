/**
 * Simulated teammates (pure, deterministic). Given a message the viewer just sent, plan who replies, what
 * they say and when — so DMs and active channels feel alive without ever being spammy:
 *  - at most one reply per viewer message, plus at most one reaction;
 *  - nobody replies within 20 s of the previous simulated reply in the same conversation;
 *  - offline / inactive people never reply; focus / meeting replies are short “busy” acknowledgements;
 *  - channel replies only when someone is @mentioned or a question is asked in an active channel.
 */
import type { Presence, User } from '@/types';
import { mentionHandles } from './markdown';
import type { HandleMaps } from './ids';
import { hash } from './ids';
import type { ChatMessage, Conversation } from './types';

export type Intent =
  | 'greeting'
  | 'thanks'
  | 'status'
  | 'review'
  | 'meeting'
  | 'food'
  | 'help'
  | 'celebrate'
  | 'howareyou'
  | 'urgent'
  | 'bye'
  | 'question'
  | 'plan'
  | 'emoji'
  | 'statement';

export type SimUser = Pick<User, 'id' | 'name' | 'presence' | 'department' | 'active' | 'title'>;

export interface PlannedReply {
  authorId: string;
  text: string;
  /** Wait before the typing indicator appears. */
  delayMs: number;
  /** How long the typing indicator shows before the message lands. */
  typingMs: number;
}

export interface PlannedReaction {
  userId: string;
  emoji: string;
  delayMs: number;
}

export interface EnginePlan {
  replies: PlannedReply[];
  reactions: PlannedReaction[];
}

export interface EngineInput {
  conv: Conversation;
  message: ChatMessage;
  viewerId: string;
  users: SimUser[];
  handles: HandleMaps;
  /** Messages in the conversation (any order) — used for activity & rate limiting. */
  recent: ChatMessage[];
  now: number;
  /** Override presence (live simulation). */
  presenceOf?: (userId: string) => Presence;
  /** Timestamp of the previous simulated reply in this conversation. */
  lastSimulatedAt?: number;
}

const RATE_LIMIT_MS = 20_000;

export function detectIntent(raw: string): Intent {
  const t = raw.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
  const stripped = t.replace(/[\s\p{Extended_Pictographic}\u200d\ufe0f]/gu, '');
  if (!stripped && t) return 'emoji';
  if (/\b(asap|urgent|blocker|blocked|sev ?1|p1|outage|down)\b/.test(t)) return 'urgent';
  if (/\b(thanks|thank you|thx|ty|cheers|appreciate)\b/.test(t)) return 'thanks';
  if (/\b(congrats|congratulations|shipped|launched|we did it|merged|released|nailed it|well done)\b/.test(t)) return 'celebrate';
  if (/\b(how are you|how's it going|hows it going|how are things|you ok)\b/.test(t)) return 'howareyou';
  if (/^(hey|hi|hello|yo|morning|good morning|gm|salam|hiya)\b/.test(t)) return t.includes('?') ? 'question' : 'greeting';
  if (/\b(bye|good night|gn|signing off|logging off|eod|end of day|see you)\b/.test(t)) return 'bye';
  if (/\b(review|take a look|look at|feedback|pr\b|pull request|thoughts on|sanity check)\b/.test(t)) return 'review';
  if (/\b(huddle|call|sync|meet|meeting|zoom|catch up|1:1|chat live)\b/.test(t)) return 'meeting';
  if (/\b(lunch|coffee|karak|chai|dinner|pizza|tacos|snack|breakfast|matcha)\b/.test(t)) return 'food';
  if (/\b(help|issue|bug|broken|error|stuck|crash|fail|failing|doesn't work|not working)\b/.test(t)) return 'help';
  if (/\b(eta|when|status|update|progress|done yet|how far|timeline|deadline)\b/.test(t)) return 'status';
  if (/\b(let's|lets|should we|how about|proposal|propose|idea|what if)\b/.test(t)) return 'plan';
  if (t.endsWith('?') || /^(can|could|would|will|do|does|did|is|are|any|what|why|where|who|which|how)\b/.test(t)) return 'question';
  return 'statement';
}

const T: Record<Intent, string[]> = {
  greeting: ['Hey {first}! 👋', 'Morning {first} ☀️ what’s up?', 'Hi {first}! Good timing — I was about to ping you.', 'Hey hey 👋'],
  thanks: ['Anytime! 🙌', 'Of course — happy to help 💜', 'No problem at all {first}!', 'You got it 🙏'],
  status: [
    'Making good progress — should have something to show by tomorrow EOD.',
    'About 80% there. I’ll post an update in the thread once it’s green ✅',
    'On track! Last bit is the review, then it’s done.',
    'Slightly behind — waiting on one dependency. I’ll flag if it slips.',
  ],
  review: ['On it — I’ll take a look this afternoon 👀', 'Sure! Send it over, I’ll leave comments today.', 'Happy to. Give me 30 min to finish what I’m on?', 'Looking now 👀'],
  meeting: ['Sure — I’m free in 15 if that works?', 'Yes! Start a huddle and I’ll jump in 🎧', 'Can we do after 3? Back-to-back until then.', 'Works for me 👍'],
  food: ['I’m in! 12:30? 🍜', 'Always yes to that ☕', 'Count me in — I’ll grab a table.', 'Ooh yes. The new place downstairs?'],
  help: ['Ugh, sorry! Can you drop the steps to reproduce? I’ll dig in.', 'Let me check — does it happen every time or just sometimes?', 'Hmm, I saw something similar last week. Raising a ticket might be fastest — I’ll take a look too.', 'Looking into it now 🔍'],
  celebrate: ['Huge! 🎉 Congrats to everyone involved', 'Let’s gooo 🚀', 'This is awesome — well deserved!', 'Massive. Confetti time 🎊'],
  howareyou: ['Doing well, thanks! Busy week but a good one. You?', 'Pretty good! Coffee is working ☕ How about you?', 'All good here — heads down on a fun problem.'],
  urgent: ['On it right now.', 'Looking immediately — give me 5 min.', 'Jumping in. I’ll update here as I learn more.'],
  bye: ['Have a great evening {first}! 👋', 'Night! See you tomorrow.', 'Enjoy the rest of your day 🙌'],
  question: [
    'Good question — let me check and come back to you.',
    'I think so, but let me double-check before I promise anything 😅',
    'Not 100% sure — {expert} would know best, but I’ll find out.',
    'Yes, I believe that’s right.',
    'Let me look into it and reply in a bit.',
  ],
  plan: ['I like it 👍 Let’s try it this week.', 'Love that idea — want me to draft something?', 'Makes sense to me. Any risks we should flag?', '+1 from me'],
  emoji: ['😄', '🙌', '💯', '🔥'],
  statement: ['👍 Sounds good', 'Nice, thanks for sharing!', 'Love it', 'Makes sense 👌', 'Noted ✅'],
};

const BUSY: Record<'focus' | 'meeting', string[]> = {
  focus: ['Heads down for a bit — I’ll get back to you within the hour 🎧', 'In focus mode, will reply properly soon!'],
  meeting: ['In a meeting — will get back to you right after 🙏', 'Stuck in a call, back in 20!'],
};

const FLAVOR: Partial<Record<User['department'], string[]>> = {
  Design: ['I’ll drop it in Figma.', 'Will share a quick mock.'],
  Engineering: ['I’ll open a PR.', 'Will link the PR here.'],
  'IT & Security': ['I’ll raise a ticket so we can track it.'],
  Product: ['Adding it to the roadmap doc.'],
  'People Ops': ['I’ll loop in the People team.'],
};

const REACTION: Record<Intent, string[]> = {
  greeting: ['👋'],
  thanks: ['💜', '🙏'],
  status: ['👀'],
  review: ['👀'],
  meeting: ['👍'],
  food: ['🍕', '☕', '😋'],
  help: ['👀', '🫡'],
  celebrate: ['🎉', '🚀', '🔥'],
  howareyou: ['😊'],
  urgent: ['🚨', '👀'],
  bye: ['👋'],
  question: ['👀', '🤔'],
  plan: ['👍', '💡'],
  emoji: ['😂', '🙌'],
  statement: ['👍', '🔥', '🙌', '💯'],
};

const pick = <T>(arr: T[], seed: number): T => arr[seed % arr.length];
const firstName = (n: string) => n.split(' ')[0];

/** Fill a template for the replier. */
export function composeReply(intent: Intent, replier: SimUser, viewer: SimUser | undefined, seed: number, others: SimUser[] = []): string {
  let text = pick(T[intent], seed);
  const expert = others.find((u) => u.id !== replier.id && u.id !== viewer?.id);
  text = text.replace('{first}', viewer ? firstName(viewer.name) : 'there').replace('{expert}', expert ? firstName(expert.name) : 'the team');
  const flavor = FLAVOR[replier.department];
  if ((intent === 'review' || intent === 'plan' || intent === 'help') && flavor && seed % 3 === 0) text = `${text} ${pick(flavor, seed >> 3)}`;
  return text;
}

/** Plan simulated replies/reactions to a message the viewer just sent. */
export function planResponses(input: EngineInput): EnginePlan {
  const { conv, message, viewerId, users, handles, now } = input;
  const plan: EnginePlan = { replies: [], reactions: [] };
  if (message.authorId !== viewerId || message.system || conv.kind === 'app') return plan;
  if (input.lastSimulatedAt && now - input.lastSimulatedAt < RATE_LIMIT_MS) return plan;

  const byId = new Map(users.map((u) => [u.id, u]));
  const viewer = byId.get(viewerId);
  const presence = (id: string) => input.presenceOf?.(id) ?? byId.get(id)?.presence ?? 'offline';
  const reachable = (id: string) => {
    const u = byId.get(id);
    return !!u && u.active && id !== viewerId && presence(id) !== 'offline';
  };
  const members = conv.memberIds.filter(reachable);
  if (!members.length) return plan;

  const text = message.text.trim();
  if (!text && !message.attachments?.length && !message.files?.length) return plan;
  const intent = message.attachments?.length || message.files?.length ? (text ? detectIntent(text) : 'statement') : detectIntent(text);
  const seed = hash(`${message.id}:${text}`);

  const mentioned = mentionHandles(text)
    .map((h) => handles.byHandle.get(h))
    .filter((id): id is string => !!id && members.includes(id));
  const broadcast = /(^|\s)@(here|channel|everyone)\b/i.test(text);

  let replierId: string | undefined;
  if (conv.kind === 'dm') replierId = members[0];
  else if (mentioned.length) replierId = mentioned[0];
  else if (conv.kind === 'group') replierId = members[seed % members.length];
  else {
    // channels: only questions/requests in active channels get a reply
    const since = now - 6 * 3_600_000;
    const activity = input.recent.filter((m) => m.at >= since && m.authorId !== viewerId && !m.system).length;
    const asks = ['question', 'status', 'review', 'help', 'urgent', 'meeting', 'food', 'plan'].includes(intent) || broadcast;
    if (asks && activity >= 2 && seed % 100 < 75) {
      const online = members.filter((id) => presence(id) === 'online');
      const pool = online.length ? online : members;
      replierId = pool[seed % pool.length];
    }
  }

  if (replierId) {
    const replier = byId.get(replierId)!;
    const p = presence(replierId);
    let body: string;
    if ((p === 'focus' || p === 'meeting') && conv.kind === 'dm' && intent !== 'urgent') body = pick(BUSY[p], seed);
    else body = composeReply(intent, replier, viewer, seed, members.map((id) => byId.get(id)!));
    const factor = p === 'away' ? 3 : p === 'focus' || p === 'meeting' ? 1.6 : 1;
    plan.replies.push({
      authorId: replierId,
      text: body,
      delayMs: Math.round((900 + (seed % 1400)) * factor),
      typingMs: Math.min(3600, Math.max(1100, body.length * 38)),
    });
  }

  // one friendly reaction from someone else (never the replier) — skipped for very short DMs half the time
  const reactorPool = members.filter((id) => id !== replierId);
  if (reactorPool.length && (conv.kind !== 'dm' || seed % 2 === 0) && (seed >> 4) % 100 < 70) {
    const reactor = reactorPool[(seed >> 2) % reactorPool.length];
    plan.reactions.push({ userId: reactor, emoji: pick(REACTION[intent], seed >> 5), delayMs: 1200 + ((seed >> 6) % 2600) });
  } else if (!replierId && conv.kind === 'dm' && members[0]) {
    plan.reactions.push({ userId: members[0], emoji: pick(REACTION[intent], seed >> 5), delayMs: 1500 });
  }
  return plan;
}

/* ---------------------------------------------------------------- ambient activity */

const AMBIENT: Record<string, string[]> = {
  'ch-general': ['Reminder: the 4th floor kitchen has fresh dates and Arabic coffee today ☕', 'Who else is joining the town hall later? 🙋', 'PSA: the Wi-Fi in meeting room Atlas is back to normal.'],
  'ch-ship-it': ['Deploy #482 is out — canary looks healthy ✅', 'Staging is green again after the cache fix 🟢', 'Release notes draft is up — comments welcome 📝'],
  'ch-watercooler': ['Just saw the most majestic cat outside the office 🐱', 'Hot take: pineapple belongs on pizza 🍍🍕', 'Anyone tried the new matcha place on the corner?'],
  'ch-design-crit': ['Uploaded a new pass of the empty states — feedback welcome 🎨', 'Contrast check on the new tokens passes AA everywhere now ✨'],
  'ch-eng-platform': ['p99 latency is down another 6% since the index change 📉', 'Heads-up: rotating the staging certs at 17:00.'],
  'ch-it-help': ['FYI: VPN in Singapore is recovering — reconnect if you see drops.', 'Passkey enrolment is now at 71% 🔐'],
  'ch-proj-prism': ['Merged the new spacing tokens into main 💠', 'Updated the component spec with the motion guidelines.'],
};

/** A gentle ambient post for a channel (or null). `seed` decides author & line. */
export function ambientPost(conv: Conversation, users: SimUser[], viewerId: string, seed: number, presenceOf?: (id: string) => Presence): { authorId: string; text: string } | null {
  const lines = AMBIENT[conv.id];
  if (!lines || conv.kind !== 'channel') return null;
  const pool = conv.memberIds.filter((id) => {
    const u = users.find((x) => x.id === id);
    return !!u && u.active && id !== viewerId && (presenceOf?.(id) ?? u.presence) === 'online';
  });
  if (!pool.length) return null;
  return { authorId: pool[seed % pool.length], text: lines[(seed >> 3) % lines.length] };
}
