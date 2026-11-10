/**
 * Pulse Chat — demo seed.
 *
 * `createChatSeed(now)` is pure and deterministic for a given `now`. Every timestamp is relative to `now`
 * (or to today's / yesterday's local midnight for date-bound items such as Daily Spark answers, standups
 * and yesterday's huddle recap). Nothing is in the future except `scheduled[].deliverAt`.
 *
 * Message ids are readable: `m-<conv>-<n>` (e.g. `m-ship-25`), thread replies `<parentId>-r<n>`.
 */
import type {
  BotId,
  CelebrationSigner,
  ChatData,
  ChatMessage,
  Conversation,
  DriveFileRef,
  EngagementStats,
  Mood,
  UserChatState,
} from './types';
import { dateKey, dmId, hash, wavePeaks } from './ids';
import { COFFEE_PROMPTS, sparkOfDay } from './constants';
import { SEED_USERS } from '@/data/users';
import { SEED_KUDOS } from '@/data/content';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Milliseconds ago, or a compact spec such as `'2d4h'`, `'3h10m'`, `'45m'`. */
type Ago = number | string;
/** Extra message fields. `rx` = reactions as `{ '🚀': 'omar mei' }`; `edit` = edited this long after posting. */
type Extra = Omit<Partial<ChatMessage>, 'reactions' | 'editedAt'> & { rx?: Record<string, string>; edit?: Ago };
type Post = (author: string, ago: Ago, text: string, extra?: Extra) => string;
type ThreadItem = [author: string, ago: Ago, text: string, extra?: Extra];

function toMs(a: Ago): number {
  if (typeof a === 'number') return a;
  let ms = 0;
  for (const [, n, unit] of a.matchAll(/(\d+)([dhms])/g)) {
    ms += Number(n) * (unit === 'd' ? DAY : unit === 'h' ? HOUR : unit === 'm' ? MIN : 1000);
  }
  return ms;
}

/** `'omar'` → `'u-omar'`; bot ids, `system` and full user ids pass through. */
const U = (s: string) => (s === 'system' || s.startsWith('u-') || s.startsWith('bot-') ? s : `u-${s}`);
/** `'omar mei'` → `['u-omar', 'u-mei']` */
const ids = (s: string) => s.split(/\s+/).filter(Boolean).map(U);
/** Reactions spec → `emoji → user ids` (optionally dropping one user, e.g. the author). */
function rx(spec: Record<string, string>, without?: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [emoji, who] of Object.entries(spec)) {
    const list = ids(who).filter((id) => id !== without);
    if (list.length) out[emoji] = list;
  }
  return out;
}
const lines = (...parts: string[]) => parts.join('\n');

/**
 * Daily Spark answers keyed by question (see `SPARK_QUESTIONS` in ./constants). Today's question gets five
 * answers from colleagues (never the demo personas, so they can still answer); yesterday's gets the first three.
 */
const SPARK_ANSWERS: Record<string, [author: string, text: string][]> = {
  'What’s a hill you will gladly die on about food or tech?': [
    ['lucas', 'Tabs over spaces. Also pineapple on pizza is fine and I will not be taking questions 🍍'],
    ['priya', 'Every service needs a `/healthz` that actually checks its dependencies. A 200 that lies is worse than a 500.'],
    ['mateo', 'Paella is a **lunch** dish. Paella at 9pm is a crime against Valencia 🥘'],
    ['grace', 'Spreadsheets should never, ever have merged cells. I have seen things.'],
    ['noah', 'Dark mode is a personality trait and I’m proud of mine 🌚'],
  ],
  'Show us your desk right now — what’s the one item you can’t work without?': [
    ['hana', 'Sticky notes in four colours. Research synthesis is basically a craft project 🟨🟦🟩🟥'],
    ['kwame', 'My grandmother’s little brass sankofa bird. Reminds me to look back at the data before moving forward 🐦'],
    ['sofia', 'A paper notebook. Every brand idea starts life as a terrible sketch ✏️'],
    ['ethan', 'A YubiKey on a lanyard. Yes, I am that person 🔑'],
    ['daniel', 'Second monitor in portrait mode. Month-end spreadsheets are tall, okay?'],
  ],
  'If you could teleport anywhere for lunch today, where are we going and what are we ordering?': [
    ['mateo', 'Casa Montaña in Valencia — all i pebre and a vermut. Booking for 12, who’s in? 🥘'],
    ['yusuf', 'Karaköy, Istanbul: balık ekmek by the Bosphorus, then baklava at Güllüoğlu. Non-negotiable.'],
    ['grace', 'Tian Tian at Maxwell for chicken rice, kaya toast for dessert 🍗'],
    ['priya', 'MTR in Bengaluru — rava idli, filter coffee, and a long nap afterwards.'],
    ['fatima', 'Tagine at my aunt’s place in Fez. Sorry, no reservations, family only 😄'],
  ],
  'What was the first album, concert or video game you were completely obsessed with?': [
    ['lucas', 'Daft Punk, _Discovery_. Still my deploy soundtrack 🤖'],
    ['noah', 'Pokémon Red. I kept a notebook mapping every route — product manager energy at age nine.'],
    ['sofia', 'Laura Pausini at San Siro. I cried, I screamed, I lost a shoe.'],
    ['kwame', 'FIFA 07 on the PS2 — Ghana on Legendary, Essien in midfield. Undefeated (in my memory) ⚽'],
    ['aisha', 'Destiny’s Child, _Survivor_. Knew every word, still do 💃'],
  ],
  'What tiny habit or shortcut saves you 30 minutes every week?': [
    ['priya', '`git commit --fixup` + `git rebase --autosquash`. My PRs look like I got it right the first time 😇'],
    ['daniel', 'Text-expansion snippets for every finance email. Typing `;close` writes my whole month-end reminder.'],
    ['hana', 'Auto-transcripts for every interview, so I search instead of rewatching. Saves hours.'],
    ['sara', 'No-meeting Wednesday afternoons. Protect them like your life depends on it 🛡️'],
    ['ethan', 'Passkeys everywhere. I haven’t typed a password in months 🔐 (yes, this is a hint)'],
  ],
  'Coffee, matcha, karak chai or sparkling water — what fuels your afternoon?': [
    ['mateo', 'Karak from downstairs. Two of them. Don’t judge me ☕'],
    ['grace', 'Iced kopi-o kosong. Bitter, like a reconciliation that won’t balance.'],
    ['sofia', 'Espresso, standing up, in under 30 seconds. I’m Italian, it’s the law ☕'],
    ['hana', 'Oat matcha latte. My one personality trait 🍵'],
    ['lucas', 'Club-Mate. It’s a Berlin thing. It’s an acquired taste. I have acquired it.'],
  ],
  'What’s something you learned this month that surprised you?': [
    ['kwame', 'BigQuery bills by bytes scanned, so `SELECT *` on a 4 TB table is basically lighting money on fire 🔥 (learned it in a sandbox, thankfully)'],
    ['yusuf', 'Octopuses have three hearts. I mentioned it on a customer call and we closed the renewal. Unrelated? Possibly.'],
    ['aisha', 'Activation jumps when the first screen greets people by name instead of “Hi there”. People love being seen.'],
    ['ethan', 'Most phishing clicks happen between 2pm and 4pm. Post-lunch brain is real.'],
    ['fatima', 'Candidates now ask about parental leave more often than salary in final rounds 💜'],
  ],
  'Which app on your phone would you keep if you could only keep three?': [
    ['noah', 'Maps, Calendar and the airline app. I basically live in airports now ✈️'],
    ['priya', 'Kindle, Spotify and Pulse (not contractually obliged to say that, I promise).'],
    ['lucas', 'PagerDuty (sadly), Komoot, and the BVG app so I can blame the U-Bahn accurately.'],
    ['sara', 'WhatsApp for the family group, Calm, and Talabat 🍔'],
    ['daniel', 'My banking app, a second banking app… and a third. Finance person, what did you expect?'],
  ],
  'What’s the best piece of career advice you’ve ever received?': [
    ['sara', '“Hire people who make you slightly nervous because they’re better than you.”'],
    ['aisha', '“Write the press release before you build the thing.” If you can’t, you don’t know what you’re building.'],
    ['ethan', '“Security people hate becomes security people bypass.” Design for humans first.'],
    ['grace', 'My first manager: “Never be the person who’s surprised by the numbers.”'],
    ['yusuf', '“Customers don’t remember what you said — they remember how fast you called back.”'],
  ],
  'If our team had a theme song, what would it be?': [
    ['lucas', '“Harder, Better, Faster, Stronger” — release week only.'],
    ['sofia', '“Don’t Stop Me Now”. Especially the night before a deadline 🎸'],
    ['kwame', '“Under Pressure” for on-call, “Celebration” for deploy day 🎉'],
    ['fatima', '“Ain’t No Mountain High Enough” — recruiting edition 🏔️'],
    ['noah', '“Eye of the Tiger” on the last day of the quarter 🐯'],
  ],
  'What’s a skill you’d love to learn from someone at Helix?': [
    ['kwame', 'Priya reading a query plan like it’s a novel. Teach me your ways 🙏'],
    ['noah', 'Sofia’s storytelling. My decks have the narrative arc of a phone book.'],
    ['daniel', 'Hana’s interviewing — getting people to say what they actually think is magic.'],
    ['mateo', 'Lucas staying calm during incidents. I panic when the printer jams.'],
    ['hana', 'Grace’s spreadsheet wizardry. She built a pivot table in four seconds — I timed it.'],
  ],
  'Describe your perfect weekend in three emoji.': [
    ['mateo', '🎾 🥘 😴'],
    ['grace', '🥾 🌿 🍜'],
    ['lucas', '🚲 🎧 🥨'],
    ['sofia', '🍝 📚 🌅'],
    ['yusuf', '⚽ 🫖 🌊'],
  ],
  'What’s the most underrated city you’ve ever visited?': [
    ['priya', 'Mysuru. The palace lit up at night is unreal and nobody talks about it.'],
    ['yusuf', 'Gaziantep — best baklava on Earth, and I say that as someone from Istanbul.'],
    ['aisha', 'Porto! Everyone goes to Lisbon, but Porto has the views and the francesinha 🇵🇹'],
    ['kwame', 'Kumasi. Kejetia market alone is worth the trip.'],
    ['ethan', 'Halifax. Lobster rolls, lighthouses and the nicest people in Canada (which is saying something).'],
  ],
  'Which fictional character would be the best teammate — and why?': [
    ['aisha', 'Leslie Knope. Binders for everything, endless enthusiasm, remembers your birthday.'],
    ['lucas', 'Samwise Gamgee. Carries the whole project and never asks for credit.'],
    ['hana', 'Hermione. Always did the reading.'],
    ['ethan', 'Q from James Bond — every gadget ships with a security briefing 🔐'],
    ['fatima', 'Paddington. Polite, kind, and somehow everyone ends up better off 🐻'],
  ],
};
/** Used only if the Spark question list changes and an answer set is missing. */
const SPARK_FALLBACK: [author: string, text: string][] = [
  ['lucas', 'Ooh, good one. Answering properly after my coffee ☕'],
  ['priya', 'This one needs a whiteboard. Thinking 🤔'],
  ['mateo', 'Strong opinions incoming at lunch 😄'],
  ['grace', 'Reading everyone’s answers before I commit to mine 👀'],
  ['noah', 'Love this question — mine is in the thread later!'],
];

export function createChatSeed(now = Date.now()): ChatData {
  /* ───────────────────────── time ───────────────────────── */
  const at = (a: Ago) => now - toMs(a);
  const today0 = new Date(now).setHours(0, 0, 0, 0);
  const yesterday0 = new Date(today0 - 1).setHours(0, 0, 0, 0);
  const sinceMidnight = now - today0;
  const TODAY_SPAN = 6 * HOUR;
  /** `ago` squeezed into today's date (order kept) — for date-bound items: Daily Spark answers, standups. */
  const today = (a: Ago) => {
    const ms = toMs(a);
    if (sinceMidnight > TODAY_SPAN) return ms;
    return Math.max(15_000, Math.round((ms / TODAY_SPAN) * Math.max(0, sinceMidnight - MIN)));
  };
  /** Absolute timestamp / “ago” for a wall-clock time yesterday (local). */
  const yAbs = (h: number, m = 0) => new Date(yesterday0).setHours(h, m, 0, 0);
  const yesterdayAt = (h: number, m = 0) => now - yAbs(h, m);
  /** “ago” for `base + a`, never closer to `now` than 15 seconds. */
  const after = (base: number, a: Ago) => Math.max(15_000, now - (base + toMs(a)));

  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  /** Next occurrence (today or later) of an `MM-DD` date → `yyyy-mm-dd`. */
  const nextOccurrence = (mmdd: string) => {
    const [mm, dd] = mmdd.split('-').map(Number);
    const y = new Date(today0).getFullYear();
    const d = new Date(y, mm - 1, dd);
    return iso(d.getTime() < today0 ? new Date(y + 1, mm - 1, dd) : d);
  };
  const when = (isoDate: string) => {
    const [y, m, d] = isoDate.split('-').map(Number);
    const n = Math.round((new Date(y, m - 1, d).getTime() - today0) / DAY);
    return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
  };

  /* ───────────────────────── message DSL ───────────────────────── */
  const messages: ChatMessage[] = [];
  const byId = new Map<string, ChatMessage>();
  const add = (msg: ChatMessage) => {
    messages.push(msg);
    byId.set(msg.id, msg);
    return msg.id;
  };
  const build = (id: string, convId: string, author: string, a: Ago, text: string, extra: Extra): ChatMessage => {
    const { rx: reactions, edit, ...rest } = extra;
    const ts = at(a);
    return {
      id,
      convId,
      authorId: U(author),
      text,
      at: ts,
      reactions: reactions ? rx(reactions, U(author)) : {},
      ...(edit !== undefined ? { editedAt: ts + toMs(edit) } : {}),
      ...rest,
    };
  };
  /** Writer for one conversation: auto-numbered ids `m-<short>-<n>`. */
  const conv = (convId: string, short: string): Post => {
    let n = 0;
    return (author, a, text, extra = {}) => add(build(extra.id ?? `m-${short}-${++n}`, convId, author, a, text, extra));
  };
  const replyCount = new Map<string, number>();
  const reply = (parentId: string, [author, a, text, extra = {}]: ThreadItem) => {
    const n = (replyCount.get(parentId) ?? 0) + 1;
    replyCount.set(parentId, n);
    const convId = byId.get(parentId)?.convId ?? '';
    return add({ ...build(`${parentId}-r${n}`, convId, author, a, text, extra), parentId });
  };
  const thread = (parentId: string, ...items: ThreadItem[]) => {
    for (const item of items) reply(parentId, item);
    return parentId;
  };
  /** Voice notes need their own id for deterministic waveform peaks. */
  const voice = (id: string, durationSec: number, transcript: string) => {
    const msg = byId.get(id);
    if (msg) msg.voice = { durationSec, transcript, peaks: wavePeaks(id) };
    return id;
  };
  const signers = (list: [who: string, ago: Ago, note: string][]): CelebrationSigner[] =>
    list.map(([who, a, note]) => ({ userId: U(who), note, at: at(a) }));
  const pins: Record<string, string[]> = {};
  const pin = (convId: string, ...messageIds: string[]) => {
    pins[convId] = [...(pins[convId] ?? []), ...messageIds];
  };

  /* ───────────────────────── Drive files ───────────────────────── */
  const file = (id: string, name: string, kind: string, owner: string, updated: Ago, sensitivity: string, size: number): DriveFileRef => ({
    id,
    name,
    kind,
    to: `/drive/file/${id}`,
    ownerId: U(owner),
    updatedAt: at(updated),
    sensitivity,
    size,
  });
  const SPEC = file('df-prism-spec', 'Prism v4 Component Spec', 'doc', 'mei', '5d6h', 'internal', 2_480_000);
  const MOTION = file('df-motion-study', 'Prism motion study v3', 'video', 'mei', '4d5h', 'internal', 48_200_000);
  const RUNBOOK = file('df-mfa-runbook', 'Passkeys Enforcement Runbook', 'doc', 'layla', '5d6h', 'confidential', 910_000);

  /* ───────────────────────── conversations ───────────────────────── */
  const conversations: Conversation[] = [];
  const ALL = SEED_USERS.map((u) => u.id);
  const CORE = ALL.filter((id) => id !== 'u-alex' && id !== 'u-elena');
  const channel = (c: {
    id: string;
    icon: string;
    topic: string;
    description: string;
    members: string[];
    admins: string;
    createdBy: string;
    created: Ago;
    visibility?: 'public' | 'private';
    posting?: 'everyone' | 'admins';
    mandatory?: boolean;
    linked?: Conversation['linked'];
  }) => {
    conversations.push({
      id: c.id,
      kind: 'channel',
      name: c.id.slice(3),
      icon: c.icon,
      topic: c.topic,
      description: c.description,
      visibility: c.visibility ?? 'public',
      posting: c.posting ?? 'everyone',
      memberIds: c.members,
      adminIds: ids(c.admins),
      createdBy: U(c.createdBy),
      createdAt: at(c.created),
      pinnedIds: [],
      ...(c.mandatory ? { mandatory: true } : {}),
      ...(c.linked ? { linked: c.linked } : {}),
    });
    return c.id;
  };
  const direct = (members: string, created: Ago, createdBy: string, name = '') => {
    const memberIds = [...new Set(ids(members))].sort();
    const id = dmId(memberIds);
    conversations.push({
      id,
      kind: memberIds.length > 2 ? 'group' : 'dm',
      name,
      visibility: 'private',
      posting: 'everyone',
      memberIds,
      adminIds: [],
      createdBy: U(createdBy),
      createdAt: at(created),
      pinnedIds: [],
    });
    return id;
  };
  const appConv = (botId: BotId, user: string, created: Ago) => {
    const memberIds = [botId, U(user)];
    const id = dmId(memberIds);
    conversations.push({
      id,
      kind: 'app',
      name: '',
      visibility: 'private',
      posting: 'everyone',
      memberIds,
      adminIds: [],
      createdBy: botId,
      createdAt: at(created),
      pinnedIds: [],
      botId,
    });
    return id;
  };

  channel({
    id: 'ch-general',
    icon: '🌍',
    topic: 'Company-wide chatter · be kind, be curious',
    description: 'Everyone at Helix is here. News, wins, questions — and the occasional cat photo.',
    members: ALL,
    admins: 'layla sara',
    createdBy: 'layla',
    created: '240d',
    mandatory: true,
  });
  channel({
    id: 'ch-announcements',
    icon: '📣',
    topic: 'Official updates from People Ops, IT & leadership',
    description: 'Important company news lands here first. Posting is limited to admins — discuss in threads.',
    members: CORE,
    admins: 'layla sara',
    createdBy: 'sara',
    created: '240d',
    posting: 'admins',
    mandatory: true,
  });
  channel({
    id: 'ch-ship-it',
    icon: '🚀',
    topic: 'Demo Day deploy freeze from tomorrow 18:00 GST · Prism v4 tokens freeze Thursday 🧊',
    description: 'Releases, deploys, launches and the occasional rollback. Celebrate loudly, roll back calmly.',
    members: ids('omar mei priya lucas kwame aisha hana sofia layla ethan yusuf noah'),
    admins: 'omar',
    createdBy: 'omar',
    created: '200d',
  });
  channel({
    id: 'ch-watercooler',
    icon: '☕',
    topic: 'Daily Spark every morning ✨ · pets, food & weekend plans',
    description: 'Off-topic, on-culture. Meet the people you usually only see as a 40px avatar.',
    members: CORE,
    admins: 'sara',
    createdBy: 'sara',
    created: '238d',
  });
  channel({
    id: 'ch-kudos',
    icon: '🙌',
    topic: 'Say thank you out loud',
    description: 'Recognise teammates for teamwork, innovation, customer love, ownership and craft. Mirrors the Hub kudos wall.',
    members: CORE,
    admins: 'sara',
    createdBy: 'sara',
    created: '236d',
  });
  channel({
    id: 'ch-celebrations',
    icon: '🎉',
    topic: 'Birthdays, anniversaries & welcomes — sign the cards!',
    description: 'Pulse posts a card a few days before every occasion. Add a note, a doodle or an emoji.',
    members: CORE,
    admins: 'sara fatima',
    createdBy: 'sara',
    created: '236d',
  });
  channel({
    id: 'ch-design-crit',
    icon: '🎨',
    topic: 'Prism v4 crit · Tue/Thu 15:00 SGT · critique the work, not the person',
    description: 'Share work at any fidelity. Give specific, kind and actionable feedback.',
    members: ids('mei hana sofia omar aisha priya'),
    admins: 'mei',
    createdBy: 'mei',
    created: '150d',
  });
  channel({
    id: 'ch-eng-platform',
    icon: '🛠️',
    topic: 'On call: Lucas 📟 · deploy freeze from tomorrow 18:00 GST',
    description: 'Platform engineering: infrastructure, data, reliability and deploys. Every incident gets a thread.',
    members: ids('omar priya lucas kwame ethan layla'),
    admins: 'omar',
    createdBy: 'omar',
    created: '210d',
  });
  channel({
    id: 'ch-it-help',
    icon: '🛟',
    topic: 'VPN degraded in Singapore — use the Helix-HK gateway meanwhile',
    description: 'Ask IT anything. Include your device, OS and office. Urgent or private? Open a ticket in IT Helpdesk.',
    members: ids('layla ethan alex omar mei kwame mateo sara daniel noah grace hana'),
    admins: 'layla ethan',
    createdBy: 'layla',
    created: '230d',
  });
  channel({
    id: 'ch-dubai-office',
    icon: '🌴',
    topic: 'Padel Tuesdays 🎾 · karak at 3:30 · National Day breakfast on the 1st',
    description: 'Everything Dubai office: parking, events, facilities and lunch plans.',
    members: ids('layla sara omar fatima mateo'),
    admins: 'mateo',
    createdBy: 'mateo',
    created: '180d',
  });
  channel({
    id: 'ch-exec-sync',
    icon: '🔒',
    topic: 'Weekly exec sync · Thursdays 10:00 GST',
    description: 'Leadership coordination. Confidential — please don’t forward outside this channel.',
    members: ids('layla sara omar aisha grace daniel'),
    admins: 'layla',
    createdBy: 'layla',
    created: '220d',
    visibility: 'private',
  });
  channel({
    id: 'ch-proj-prism',
    icon: '💠',
    topic: 'Prism v4 · tokens freeze Thursday · reveal at Demo Day 🎬',
    description: 'Working channel for the Prism v4 Design System. Task updates from Helix Projects post here.',
    members: ids('mei omar priya alex hana aisha sofia elena'),
    admins: 'mei omar',
    createdBy: 'mei',
    created: '64d',
    linked: { app: 'projects', label: 'Prism v4 Design System', to: '/projects/p/prj-prism' },
  });
  channel({
    id: 'ch-proj-mfa',
    icon: '🔐',
    topic: 'Enrol by Nov 15 · passkeys mandatory from Dec 1',
    description: 'Working channel for the Passkeys & MFA Rollout. Task updates from Helix Projects post here.',
    members: ids('layla ethan omar lucas mateo grace'),
    admins: 'layla',
    createdBy: 'layla',
    created: '75d',
    linked: { app: 'projects', label: 'Passkeys & MFA Rollout', to: '/projects/p/prj-mfa' },
  });

  const DM_OMAR_MEI = direct('omar mei', '210d', 'omar');
  const DM_OMAR_ALEX = direct('omar alex', '79d', 'omar');
  const DM_LAYLA_ETHAN = direct('layla ethan', '200d', 'layla');
  const DM_MEI_HANA = direct('mei hana', '190d', 'hana');
  const DM_OMAR_PRIYA = direct('omar priya', '205d', 'priya');
  const DM_LAYLA_OMAR = direct('layla omar', '215d', 'layla');
  const DM_ALEX_MEI = direct('alex mei', '70d', 'alex');
  const DM_SARA_FATIMA = direct('sara fatima', '225d', 'sara');
  const DM_OMAR_KWAME = direct('omar kwame', '26d', 'omar');
  const GROUP_SQUAD = direct('mei omar priya alex', '1d3h5m', 'mei', 'Prism launch squad');
  const DM_COFFEE = direct('daniel hana', '6d', 'system');
  const APP_PROJECTS_OMAR = appConv('bot-projects', 'omar', '200d');
  const APP_PROJECTS_MEI = appConv('bot-projects', 'mei', '180d');
  const APP_PROJECTS_ALEX = appConv('bot-projects', 'alex', '79d');
  const APP_HELPDESK_MEI = appConv('bot-helpdesk', 'mei', '160d');
  const APP_HELPDESK_LAYLA = appConv('bot-helpdesk', 'layla', '230d');
  const APP_HELPDESK_OMAR = appConv('bot-helpdesk', 'omar', '170d');
  const APP_DRIVE_ALEX = appConv('bot-drive', 'alex', '79d');
  const APP_DRIVE_OMAR = appConv('bot-drive', 'omar', '190d');

  /* ───────────────────────── #general ───────────────────────── */
  {
    const g = conv('ch-general', 'gen');
    const welcome = g('bot-nova', '5d23h', lines(
      '👋 Hi Helix! I’m **Nova**, your AI teammate here in Pulse.',
      '',
      'Ask me to:',
      '- catch you up on a busy channel (“what did I miss in #ship-it?”)',
      '- turn a long thread into decisions + action items',
      '- draft a reply, a kudos note or your standup',
      '',
      'Open a DM with me from the sidebar. I only ever see what you can see 🔒',
    ), { rx: { '👋': 'sara mateo kwame hana fatima noah yusuf', '✨': 'sofia aisha' } });
    g('sara', '5d22h', 'Good morning, Helix ☀️ Reminder that **benefits enrollment closes Friday** — details in #announcements. People Ops office hours are 14:00–17:00 GST all week: bring your questions (and snacks).', { edit: '3m', rx: { '🙏': 'fatima daniel grace', '☀️': 'mateo' } });
    g('mateo', '5d20h', '🚗 Dubai office: parking level **B2** is being repainted Tuesday–Wednesday. Please use B3 or the Al Wasl lot — reception validates tickets for both.', { rx: { '👍': 'layla omar sara fatima' } });
    const renewal = g('noah', '5d18h', 'Morning from NYC 🗽 We just closed **Meridian Health** — 3-year renewal + the data residency add-on. Huge thanks to @yusuf for the onboarding plan that won it, and to @aisha for the pricing gymnastics 🤸', { rx: { '🎉': 'aisha yusuf sara omar daniel grace fatima', '🔥': 'lucas priya kwame' } });
    thread(renewal,
      ['yusuf', '5d17h', 'Team effort! Their admins were so prepared for kickoff — best onboarding I’ve run this year.'],
      ['aisha', '5d16h', 'Pricing gymnastics are my cardio 😅 Congrats, Noah!'],
    );
    g('layla', '5d8h', '🛟 Bookmark the new [status page](/helpdesk/status) — it’s the first place IT posts when something is wobbly (VPN, SSO, Wi-Fi). Subscribe and you’ll hear about incidents before you notice them.', { rx: { '🙏': 'ethan mateo sara', '🔖': 'grace daniel' } });
    g('hana', '4d22h', lines(
      '📚 New in the research repo: _“How new admins set up Helix in week one”_ — 14 interviews, 3 personas and a 6-minute highlights reel. My favourite quote:',
      '> I don’t need more features, I need to know what good looks like.',
      'It’s shaping the Prism v4 empty states — come find me if you want the raw clips.',
    ), { rx: { '💡': 'mei sofia aisha yusuf', '🙌': 'omar' } });
    g('lucas', '4d9h', 'Friendly reminder that #it-help exists and Layla’s team is lovely there. Please stop DMing Ethan at 2am about your Bluetooth mouse 🙏 (He told me. He’s too polite to say it.)', { rx: { '😂': 'ethan layla noah sara', '🙏': 'ethan' } });
    g('daniel', '4d6h', 'Finance PSA 🧾 Month-end close starts Monday. Please submit **October expenses by Friday 17:00 GMT** so they make this month’s payroll run. Receipts under AED 50 still need a photo — sorry, the auditors insist 😅', { rx: { '👍': 'grace sara lucas', '😅': 'noah' } });
    const demoDay = g('aisha', '3d23h', 'Demo Day signups are open! 🎬 Growth is bringing the new self-serve trial flow. Who else is demoing? Reply in thread 👇', { rx: { '🙋': 'priya mei kwame sofia' } });
    thread(demoDay,
      ['priya', '3d22h', 'Planner v2 before/after — live flame graphs, no slides 🔥'],
      ['mei', '3d21h', 'Prism v4: motion + tokens. Five minutes of pure eye candy 💠'],
      ['kwame', '3d20h', 'The new hourly accruals pipeline — if @omar lets me 😄'],
      ['omar', '3d19h', 'Of course! Five minutes, show the DAG, skip the slides.'],
      ['sofia', '3d18h', 'Brand refresh sneak peek. I’m bringing the good speakers 🔊'],
    );
    g('sofia', '3d20h', 'The new brand guidelines are live 🎨 Fonts, colours, voice, and how (not) to use the helix mark. Tl;dr: **never** stretch the logo. Ever. 🙃', { rx: { '😂': 'lucas noah fatima', '🎨': 'mei hana' } });
    g('kwame', '3d5h', 'Hi all 👋 Kwame here, almost four weeks in as a Data Engineer on Platform. Fun fact: I’ve now visited three of our offices virtually and zero in person. Accra is lovely in November if anyone wants to reverse the trend ☀️', { rx: { '👋': 'sara fatima priya lucas omar hana mateo', '🇬🇭': 'daniel' } });
    g('grace', '3d2h', 'Expense policy clarification: cabs to the airport are fine. ~~Helicopters~~ are not. (This was a real question. I love you all.) 🚁', { rx: { '😂': 'daniel sara noah lucas omar aisha' } });
    const machine = g('mateo', '2d22h', '☕ The new espresso machine on Dubai 14F is **live**! It grinds per cup, steams oat milk properly and has a karak preset (yes, really). One rule: please don’t put the milk jug back empty 🙏', { rx: { '☕': 'sara omar fatima layla', '😍': 'priya' } });
    thread(machine,
      ['omar', '2d21h', 'The karak preset is dangerous. I’ve had three before 10am.'],
      ['layla', '2d20h', 'Is it on the network? 👀 Asking for security reasons.'],
      ['mateo', '2d19h30m', '@layla IoT VLAN, no internet access — Ethan already checked 😄'],
      ['sara', '2d19h', 'Can we name it? I propose **Brewce Wayne** 🦇'],
      ['fatima', '2d18h', 'Brewce Wayne it is ☕🦇'],
      ['mateo', '2d17h', 'Label printed. It’s official.', { rx: { '😂': 'sara fatima omar' } }],
    );
    g('grace', '2d8h', 'The Singapore office just hit **100% passkey enrolment** 🎉 Credit to @hana’s “enrol and get a kaya toast” booth. Bribery works.', { rx: { '🔐': 'layla ethan', '🍞': 'hana mei', '🎉': 'sara omar' } });
    g('ethan', '2d6h', '🎣 PSA: a few phishing emails are going around pretending to be _“Helix Payroll — action required”_. Real payroll emails never ask you to sign in from a link. Report them with the ⚠️ button in Mail, or drop a screenshot in #it-help.', { rx: { '🙏': 'layla daniel grace sara', '👀': 'noah' } });
    g('aisha', '2d3h', 'Shoutout to the London crew who stayed late to help a customer migrate 40k records without a single support ticket. Pizza on me tomorrow 🍕', { rx: { '🍕': 'daniel noah', '👏': 'yusuf sofia' } });
    g('yusuf', '2d1h', 'Istanbul weather report: 19° and sunny ☀️ Customer onsite next week — anyone want me to bring back lokum?', { rx: { '🙋': 'sara fatima mei priya kwame noah', '🍬': 'hana' } });
    const allHands = g('sara', '1d22h', lines(
      '✨ **Q4 All-Hands & Demo Day is next Thursday** ✨',
      'Atrium + Meet · 16:00 GST · dinner after.',
      'Bring a teammate you haven’t met yet — and your best questions for the AMA.',
    ), { effect: 'spotlight', rx: { '🎉': 'layla omar mei priya fatima mateo kwame hana noah', '🙌': 'aisha sofia yusuf grace', '✨': 'alex lucas' } });
    g('lucas', '1d9h', 'New Berlin office rule: whoever breaks the build brings Franzbrötchen. Productivity is down, morale is up 🥐', { rx: { '😂': 'priya kwame omar sofia', '🥐': 'mei' } });
    g('yusuf', '1d4h', lines(
      'Customer quote of the week, from Atlas Logistics:',
      '> Helix is the first tool my team opened without me asking.',
      '🥹 Passing it straight to @mei, @hana and the whole onboarding squad.',
    ), { rx: { '❤️': 'mei hana sofia aisha noah', '🥹': 'sara' } });
    const running = g('kwame', '1d1h', 'Is there a Helix running club? Asking for my sedentary data pipelines 🏃🏾', { rx: { '🏃': 'lucas priya' } });
    thread(running,
      ['lucas', '1d', 'Berlin has one! Sunday 10k along the Spree, virtual members welcome — log your run in the thread.'],
      ['priya', '23h', 'Bengaluru Cubbon Park crew checking in 🌳 6am, before the traffic wakes up.'],
      ['kwame', '22h30m', 'Signed up. Accra chapter: population one (for now) 🇬🇭'],
    );
    const lisbon = g('noah', '23h', 'Anyone else going to Web Summit in Lisbon? Trying to organise a Helix dinner 🇵🇹');
    thread(lisbon,
      ['alex', '22h', 'I’m in Lisbon! Happy to recommend a spot — Taberna da Rua das Flores. Book early, order everything 🐟'],
      ['noah', '21h30m', '@alex you’re officially the dinner captain. I’ll bring the expense code 😄'],
    );
    g('fatima', '20h', '🎯 We’re hiring! New roles are live: Senior Frontend Engineer (Dubai), Data Engineer (Accra), Product Designer, Growth (London) and Cloud Security Engineer (Toronto). Referrals get the famous Helix hoodie — and the bonus 😉 [Open roles](/talent)', { rx: { '🙌': 'sara kwame lucas', '🧥': 'noah' } });
    g('priya', '18h', 'TIL our CI spends 11% of its time downloading the same three Docker layers. Fixing that this week — expect faster pipelines and one very smug SRE (@lucas) 😎', { rx: { '🚀': 'omar kwame ethan', '😎': 'lucas' } });
    g('sofia', '12h', 'Photo dump from the Milan brand shoot is up 📸 (sorry — retouching took longer than the croissants lasted). The office plants are now professional models.', { rx: { '🌿': 'lucas hana', '😂': 'aisha' } });
    g('omar', '9h', 'Heads-up for anyone shipping customer-facing changes: the **Demo Day deploy freeze** starts tomorrow at 18:00 GST. Land risky changes before then 🙏 Train status lives in #ship-it.', { rx: { '👍': 'priya lucas kwame aisha', '🧊': 'mei' } });
    g('daniel', '7h', 'Final call: October expenses by **Friday 17:00 GMT** 🙏 (Looking at you, conference travellers.)', { rx: { '😅': 'noah sofia', '👍': 'grace' } });
    g('mateo', '4h', 'Dubai: water is back on 14F 🚰 Thanks for your patience — and sorry to everyone who just discovered the 12F kitchen exists.', { rx: { '🙏': 'sara fatima layla omar' } });
    const poll = g('sara', '3h', 'Help us plan the finale 🎉 Voting closes Monday.', {
      id: 'm-gen-poll',
      poll: {
        question: 'Q4 All-Hands & Demo Day — what should we do for the last 20 minutes?',
        options: [
          { id: 'ama', text: '🎤 Open-mic AMA with leadership' },
          { id: 'awards', text: '🏆 Demo Day people’s choice awards' },
          { id: 'trivia', text: '🧠 Helix trivia — teams by office' },
          { id: 'karaoke', text: '🎶 Karaoke. Yes, really.' },
        ],
        multi: false,
        anonymous: false,
        closed: false,
        votes: { ama: ids('daniel grace'), awards: ids('priya kwame aisha'), trivia: ids('hana lucas'), karaoke: ids('sofia mateo') },
      },
      rx: { '🗳️': 'fatima noah' },
    });
    thread(poll,
      ['mateo', '2h40m', 'Just saying: the karaoke machine is already booked 🎤'],
      ['fatima', '2h20m', 'Trivia, but every question is Helix lore. Who named Brewce Wayne? 😂'],
    );
    g('fatima', '1h', '📸 Team photos for the new careers page are on **Tuesday in the Dubai office** — wear something you love. Remote folks: Sofia is sending out self-shoot kits 💌', { rx: { '📸': 'sara', '💌': 'sofia' } });
    pin('ch-general', welcome, allHands);
  }

  /* ───────────────────────── #announcements ───────────────────────── */
  {
    const a = conv('ch-announcements', 'ann');
    const benefits = a('sara', '5d21h', lines(
      '📋 **2027 benefits enrollment is open** — it closes **Friday at 23:59 GST**.',
      '',
      'What’s new this year:',
      '- Dental now covers orthodontics for dependents',
      '- Wellness stipend goes up to **AED 400/month** (or local equivalent)',
      '- New: 3 mental-health days a year, no questions asked',
      '',
      'Enroll in HR Portal → Benefits. Questions? Office hours 14:00–17:00 GST, or ask in the thread 👇',
    ), { rx: { '🙌': 'layla omar mei priya daniel fatima grace kwame hana', '💚': 'sofia aisha lucas noah yusuf mateo' } });
    thread(benefits,
      ['daniel', '5d20h', 'Does the wellness stipend cover climbing gyms? Asking for my bouldering habit 🧗'],
      ['sara', '5d19h', '@daniel yes! Any fitness membership with a receipt counts.'],
      ['grace', '5d18h', 'Bouldering gang, assemble 🙌'],
    );
    const passkeys = a('layla', '4d23h', lines(
      '🔐 **Passkeys become mandatory on December 1**',
      '',
      '1. **Now → Nov 15:** enrol a passkey (or a security key) in IT Helpdesk → Security. It takes under two minutes.',
      '2. **Nov 16:** accounts without MFA are paused until you enrol.',
      '3. **Dec 1:** passwords are retired for Helix SSO — passkeys only.',
      '',
      'Stuck? Ask in #it-help or visit the IT bar (Dubai 14F, Singapore 3F). Thank you for making Helix harder to phish 💪',
    ), { rx: { '🔐': 'ethan omar sara grace mateo priya lucas kwame', '👍': 'mei daniel noah hana aisha yusuf sofia', '🙏': 'fatima' } });
    thread(passkeys,
      ['noah', '4d22h', 'What happens if I lose my phone while travelling? 😬'],
      ['ethan', '4d21h', 'Register two passkeys (phone + laptop) and you’re covered. Worst case, Helpdesk issues a temporary code after a quick video ID check.'],
      ['layla', '4d20h', '+1 — and YubiKeys are now in the IT catalog for frequent travellers.'],
      ['noah', '4d19h', 'Ordered one. Thank you both 🙏'],
    );
    a('aisha', '3d22h', lines(
      '🚀 **Product update — October recap**',
      '- Self-serve trials: conversion up **18%** since the new onboarding',
      '- Prism v4 design system in beta across 3 surfaces',
      '- Planner v2 canary: p99 down 40% for our heaviest tenants',
      '- Mobile: offline mode is in TestFlight',
      '',
      'The full plan is in the [Q4 Roadmap](/drive/file/df-q4-roadmap). Thank you all — this was a big month.',
    ), { rx: { '🚀': 'omar mei priya lucas kwame noah yusuf sofia hana', '🎉': 'sara layla' } });
    a('sara', '2d23h', '🇦🇪 **UAE National Day** — the Dubai office is closed on **December 2 & 3**. Other offices: business as usual, but please be kind with meeting invites for Dubai folks that week. Mateo is planning a team breakfast on the 1st — details in #dubai-office.', { rx: { '🇦🇪': 'layla omar fatima mateo', '❤️': 'mei priya grace' } });
    const agenda = a('sara', '1d21h', lines(
      '🎤 **Q4 All-Hands & Demo Day — next Thursday, 16:00 GST** (Atrium + Meet)',
      '',
      '1. Welcome & 2026 in review',
      '2. 2027 strategy + open AMA with the leadership team',
      '3. Demo Day — 8 teams × 5 minutes, no slides allowed',
      '4. People’s choice awards + dinner 🍽️',
      '',
      'Deck and AMA question form: [All-Hands deck](/drive/file/df-allhands-deck). Mateo turned the Atrium into a venue in 48 hours, so please clap extra loud for him 👏',
    ), { rx: { '🎉': 'layla omar mei priya kwame hana noah fatima mateo', '👏': 'aisha sofia grace lucas yusuf daniel ethan' } });
    a('sara', '1d3h', lines(
      '👶 **New parental leave policy** — effective January 1',
      '- **20 weeks** fully paid for birthing parents, **12 weeks** for all other parents (including adoption and surrogacy)',
      '- Phased return: work 60% for 4 weeks at full pay',
      '- The same policy in every country we operate in, from day one of employment',
      '',
      'Full details in HR Portal → Policies. We’re really proud of this one 💜',
    ), { rx: { '💜': 'layla fatima mei hana grace aisha sofia priya', '🙌': 'omar kwame lucas noah yusuf daniel mateo ethan', '🥹': 'kwame' } });
    a('layla', '6h', '🛰️ **VPN is degraded in Singapore** — packet loss on the SG gateway. Workaround: switch to the _Helix-HK_ gateway in the VPN client. Live updates on the [status page](/helpdesk/status).', { rx: { '🙏': 'mei hana grace', '👀': 'omar ethan' } });
    a('sara', '2h', '📝 **Q4 check-ins:** 68% of you have submitted your self-reflection — thank you! Calibration opens in 9 days. Stuck on a blank page? Nova can draft yours from your quarter’s highlights ✨ [Open Performance](/performance)', { rx: { '🙏': 'omar layla', '✅': 'priya hana kwame' } });
    pin('ch-announcements', passkeys, agenda);
  }

  /* ───────────────────────── #ship-it ───────────────────────── */
  {
    const s = conv('ch-ship-it', 'ship');
    const train = s('omar', '5d22h', lines(
      '🚂 **Release train 26.11** is boarding',
      '- Cut: Tuesday 10:00 GST',
      '- Staging soak: 48h',
      '- Prod: Thursday — canary 5% → 25% → 100%',
      '',
      'Add your PRs to the train doc by Monday EOD. Anything not on it waits for 26.12 🙏',
    ), { edit: '12m', rx: { '🚂': 'priya lucas kwame mei aisha', '👍': 'ethan' } });
    const planner = s('priya', '5d20h', 'Planner v2 is live on staging behind the `planner_v2` flag. p99 on the heavy tenants: **840ms → 505ms** 📉', { rx: { '🔥': 'omar lucas kwame mei aisha yusuf noah', '🤯': 'hana sofia' } });
    thread(planner,
      ['omar', '5d19h', 'This is huge. What’s the plan for prod?'],
      ['priya', '5d18h', 'Canary on 3 internal tenants first, then 10% of EU once 26.11 is out.'],
      ['lucas', '5d17h', 'I’ll add a per-tenant p99 panel to the release dashboard 📊'],
    );
    s('lucas', '5d6h', '✅ `api-gateway` 4.18.2 is out in prod (EU + ME). Error rate flat, p50 latency −6%.', { rx: { '✅': 'omar priya' } });
    s('mei', '4d22h', 'Prism v4 milestone 💠 **All 42 components** now consume the new token set in Storybook. Next up: contrast audit + motion pass.', { rx: { '💠': 'omar hana sofia priya aisha', '🎉': 'layla kwame' } });
    s('bot-projects', '4d21h', 'Milestone reached in **Prism v4 Design System** 🎯', {
      card: { app: 'projects', title: 'Milestone · All components on v4 tokens', subtitle: 'Prism v4 Design System · 42/42 components · 3 days early', to: '/projects/p/prj-prism', status: 'Reached' },
      rx: { '🎯': 'mei omar' },
    });
    const firstDeploy = s('kwame', '4d8h', 'First prod deploy as a Helixer 🙌 The `billing-accruals` dbt models now run ~~nightly~~ hourly.', { rx: { '🎉': 'omar priya lucas mei aisha hana layla', '🥳': 'sofia' } });
    thread(firstDeploy,
      ['omar', '4d7h', 'Welcome to the deploy club 😄 Did you get the ceremonial rubber duck?'],
      ['kwame', '4d6h', 'It’s on my desk next to my Airflow sticker 🦆'],
      ['priya', '4d5h', 'Hourly freshness already made Daniel’s close dashboard useful before lunch 👏'],
    );
    s('priya', '3d23h', lines(
      'PSA for anyone touching queries: please stop forcing plans — give planner v2 fresh stats and let it choose 🙏',
      '```sql',
      '-- before',
      'SET enable_seqscan = off;  -- please stop doing this 🙃',
      'SELECT * FROM events WHERE tenant_id = $1;',
      '',
      '-- after',
      'ANALYZE events;',
      "SELECT * FROM events WHERE tenant_id = $1 AND ts > now() - interval '7 days';",
      '```',
    ), { rx: { '👍': 'lucas kwame omar', '💯': 'ethan' } });
    s('aisha', '3d7h', 'Growth’s trial-flow experiment wraps tomorrow. If we win, it rides 26.12. If we lose, it rides 26.12 anyway because Mei made it beautiful 😄', { rx: { '😂': 'mei omar hana sofia' } });
    const rollback = s('lucas', '3d3h', '⚠️ Rolling back `notifications-svc` 2.31.0 — push delivery 5xx at ~2.1% in the ME region. Rollback in progress.', { rx: { '👀': 'omar priya ethan yusuf' } });
    thread(rollback,
      ['lucas', '3d2h52m', 'Rollback complete ✅ 5xx back to 0.02%. Looks like the new APNs client times out on cold connections.'],
      ['ethan', '3d2h45m', 'No security impact — no tokens in the logs. Checked.'],
      ['priya', '3d2h30m', lines(
        'Found it — the connection pool is created lazily on the first push. Fix:',
        '```go',
        '// warm the APNs pool at startup instead of on the first send',
        'pool := apns.NewPool(cfg, apns.WithWarmConnections(4))',
        'if err := pool.Warm(ctx); err != nil {',
        '    log.Fatal("apns warmup failed", "err", err)',
        '}',
        '```',
      )],
      ['omar', '3d2h10m', 'Great work, both. We re-ship in 26.11 with the warm pool **and** a canary alert on push 5xx > 0.5%.', { broadcast: true, rx: { '👍': 'lucas priya ethan' } }],
      ['lucas', '3d1h55m', 'Alert added: `push_5xx_ratio > 0.005 for 5m` → pages Platform on-call 📟'],
    );
    s('hana', '2d23h', 'Usability round on the Prism v4 date picker: 8/8 participants completed the task, median **14s** (v3: 31s) 🎯 Clips are in the research repo.', { rx: { '🎯': 'mei aisha', '🔥': 'omar sofia priya' } });
    const freeze = s('omar', '2d9h', 'Decision 🧊 **Freeze Prism v4 tokens on Thursday.**', {
      decision: {
        title: 'Freeze Prism v4 tokens on Thursday',
        context: 'Contrast audit fixes (PRISM-3) land by Wednesday and the engineering alias naming (PRISM-1) must be confirmed before the freeze. Anything after Thursday rides v4.1.',
        decidedBy: 'u-omar',
        decidedAt: at('2d9h'),
        status: 'decided',
      },
      rx: { '👍': 'mei priya hana aisha sofia', '🧊': 'lucas kwame' },
    });
    const blog = s('sofia', '2d5h', 'The Prism v4 launch blog draft is ready ✍️ Would love a sanity check on the technical bits from @priya 🙏');
    thread(blog,
      ['priya', '2d4h', 'Reviewed — two nits on the perf numbers (quote p99, not the average), otherwise 🔥'],
      ['sofia', '2d3h', 'Fixed, grazie mille!'],
    );
    s('lucas', '1d23h', 'Staging soak for 26.11: **47h clean** ✅ Zero new alerts, one flaky test quarantined (`checkout.spec.ts › applies coupon`).', { rx: { '✅': 'omar priya kwame' } });
    const launch = s('omar', '1d2h', lines(
      '🚀 **26.11 is live — 100% of traffic.**',
      'Planner v2 (flagged), hourly accruals, the APNs fix and 61 other PRs. Thank you all — especially @priya, @lucas and @kwame for the late nights.',
      'Now go home. Seriously. :tada:',
    ), { effect: 'confetti', rx: { '🚀': 'priya lucas kwame mei aisha hana sofia layla ethan', '🎉': 'yusuf noah priya lucas kwame mei hana sofia', '🙌': 'layla aisha ethan yusuf noah', '❤️': 'mei hana sofia kwame' } });
    thread(launch,
      ['priya', '1d1h50m', 'Best release we’ve done all year 🥹'],
      ['kwame', '1d1h40m', 'My first train! 🚂'],
      ['layla', '1d1h20m', 'Proud of this team. Zero sev-1s this quarter 👏'],
    );
    s('yusuf', '1d1h', 'Customers noticed! Atlas Logistics just emailed: _“dashboards feel instant today — did you do something?”_ 😄 cc @priya', { rx: { '🥹': 'priya', '🔥': 'omar lucas kwame' } });
    const flag = s('noah', '21h', 'Sales q: Meridian Health is asking for planner v2 on their dedicated cell. Is that a config flag or a deploy? 🙏');
    thread(flag,
      ['lucas', '20h30m', 'A flag! I can flip it for their cell tomorrow once the EU canary looks good.'],
      ['noah', '20h', 'Perfect, I’ll let them know 🙌'],
    );
    s('ethan', '18h', 'Security sign-off for the 26.12 cut is **Wednesday**. Anything touching auth or session handling needs a review ticket by Tuesday, please 🔐', { rx: { '👍': 'omar priya lucas' } });
    s('mei', '10h', 'Contrast audit: **37/42** components pass AA. The remaining 5 are all `ghost` variants — fixes are in review and should land tomorrow.', { rx: { '💪': 'omar hana priya' } });
    s('kwame', '8h', 'Heads-up: re-running the `usage_daily` backfill tonight (22:00–02:00 GST) to add the new freshness columns. Dashboards may show partial data for yesterday until it finishes 🌙', { rx: { '👍': 'priya lucas' } });
    s('system', '5h55m', 'Omar changed the topic to: Demo Day deploy freeze from tomorrow 18:00 GST · Prism v4 tokens freeze Thursday 🧊', { system: 'topic' });
    s('lucas', '5h', 'The 26.12 train doc is open 📝 Cut is the Monday after Demo Day — fixes only during the freeze, please.', { rx: { '👍': 'priya kwame' } });
    s('aisha', '3h', 'Trial-flow experiment results: **+11.4% activation** (p = 0.01) 🎉 Shipping to 100% in 26.12.', { rx: { '🎉': 'mei hana omar sofia yusuf noah', '📈': 'priya kwame' } });
    s('sofia', '1h10m', 'The Prism v4 launch video is cut 🎬 58 seconds, zero stock footage, all real components. Preview going up in #design-crit shortly.', { rx: { '😍': 'mei hana' } });
    s('priya', '35m', 'Planner v2 is at **100% on EU** 🎉 p99 holding at ~500ms. ME is next.', { rx: { '🔥': 'lucas kwame', '🎉': 'aisha' } });
    s('lucas', '12m', '@omar can we get a go/no-go on flipping planner v2 for the ME region before the freeze kicks in tomorrow? Dashboards look clean and rollback is a single flag.', { rx: { '👀': 'priya' } });
    pin('ch-ship-it', train, freeze);
  }

  /* ───────────────────────── #watercooler ───────────────────────── */
  {
    const w = conv('ch-watercooler', 'wc');
    // Daily Spark — today's answers (date-bound) and yesterday's.
    const todaysQuestion = sparkOfDay(now);
    const todaysReactions: Record<string, string>[] = [
      { '😂': 'kwame noah fatima', '💯': 'priya' },
      { '🔥': 'lucas yusuf', '❤️': 'hana sofia grace' },
      { '🙌': 'aisha mateo', '😄': 'sara daniel' },
      { '👏': 'fatima kwame grace', '🤝': 'yusuf' },
      { '😍': 'sofia hana', '😂': 'lucas mateo priya noah' },
    ];
    const todaysAgo = ['18m', '52m', '1h40m', '2h55m', '4h20m'];
    (SPARK_ANSWERS[todaysQuestion] ?? SPARK_FALLBACK).slice(0, 5).forEach(([author, text], i) => {
      w(author, today(todaysAgo[i]), text, { spark: { date: dateKey(now), question: todaysQuestion }, rx: todaysReactions[i] });
    });
    const yesterdaysQuestion = sparkOfDay(now - DAY);
    const yesterdaysTimes: [number, number][] = [[9, 40], [12, 15], [16, 50]];
    const yesterdaysReactions: Record<string, string>[] = [{ '😂': 'omar mei sara' }, { '🔥': 'layla priya' }, { '❤️': 'hana omar' }];
    (SPARK_ANSWERS[yesterdaysQuestion] ?? SPARK_FALLBACK).slice(0, 3).forEach(([author, text], i) => {
      const [h, m] = yesterdaysTimes[i];
      w(author, yesterdayAt(h, m), text, { spark: { date: dateKey(now - DAY), question: yesterdaysQuestion }, rx: yesterdaysReactions[i] });
    });

    const coffeeCard = w('system', '6d', '☕ **Coffee Roulette** — this week’s match is @hana × @daniel! Grab a virtual coffee and say hi 👋', {
      coffee: { userIds: ['u-hana', 'u-daniel'], prompt: COFFEE_PROMPTS[0] },
      rx: { '☕': 'sara mateo', '👋': 'hana daniel' },
    });
    const weekend = w('sara', '5d21h', 'Weekend recap thread! What did everyone get up to? 🌞', { rx: { '🌞': 'mateo grace' } });
    thread(weekend,
      ['mateo', '5d20h', 'Padel tournament — lost in the semis, blaming my shoes 🎾'],
      ['grace', '5d19h', 'Hiked MacRitchie and met a monitor lizard the size of a sofa 🦎'],
      ['lucas', '5d18h', 'Assembled IKEA furniture. One screw left over. Living dangerously.'],
      ['kwame', '5d17h', 'Watched the Black Stars with my uncles — loud, emotional, perfect ⚽'],
    );
    w('hana', '5d5h', 'My cat Mochi now attends every standup. She has strong opinions about Figma auto-layout 🐱', { rx: { '😻': 'mei sofia grace aisha priya fatima sara' } });
    const plant = w('lucas', '4d23h', 'Unpopular opinion: the Berlin office plant needs a name 🪴');
    thread(plant,
      ['sofia', '4d22h', 'Fernando. Obviously. 🌿'],
      ['lucas', '4d21h', 'Fernando it is. He has a name tag now.'],
    );
    w('priya', '4d4h', 'Bengaluru traffic update: 7km in 55 minutes. I finished an entire audiobook about the Roman Empire 🏛️', { rx: { '😂': 'lucas kwame omar mei', '🏛️': 'aisha' } });
    w('aisha', '4d1h', 'Book club pick for November: _The Mom Test_ — short, practical, and it’ll make your customer calls better. Discussion on the 28th 📚', { rx: { '📚': 'yusuf noah hana', '🙋': 'sofia' } });
    const dog = w('yusuf', '3d22h', 'Dog tax 🐶 This is Pamuk (“cotton” in Turkish). He has never once respected a meeting boundary.', { rx: { '🐶': 'fatima hana noah sara grace mei kwame aisha lucas', '😍': 'sofia priya omar' } });
    thread(dog,
      ['fatima', '3d21h', 'Pamuk deserves a Helix badge.'],
      ['yusuf', '3d20h', 'He’s already in the org chart as Chief Morale Officer 🐾'],
    );
    thread(coffeeCard,
      ['daniel', '2d23h', 'Done! 45 minutes on research ops vs. finance ops — turns out we both love a good spreadsheet 📊'],
      ['hana', '2d22h', '10/10, would roulette again ☕'],
    );
    voice(w('sofia', '2d21h', '', { rx: { '🥐': 'mei lucas aisha', '😂': 'hana noah' } }), 23,
      'Ciao everyone! Quick one from Milan — the brand shoot just wrapped, our office plants are officially models now, and I may or may not have bought forty croissants for the crew. Photos soon. The croissants are already gone. Ciao!');
    w('mateo', '2d4h', 'Friday lunch, Helix-style 🍽️ Order from wherever you are and eat together on Meet at 13:00 your time. Pick as many as you like!', {
      poll: {
        question: 'Friday virtual lunch theme?',
        options: [
          { id: 'tacos', text: '🌮 Taco Friday' },
          { id: 'noodles', text: '🍜 Noodle Friday' },
          { id: 'pizza', text: '🍕 Pizza Friday' },
          { id: 'healthy', text: '🥗 “Healthy” Friday (we’ll see)' },
        ],
        multi: true,
        anonymous: false,
        closed: false,
        votes: { tacos: ids('noah sofia lucas fatima'), noodles: ids('grace hana priya kwame mei'), pizza: ids('lucas kwame yusuf sofia omar'), healthy: ids('sara fatima') },
      },
      rx: { '🍜': 'grace' },
    });
    w('lucas', '2d2h', '', { deleted: true });
    w('lucas', '2d1h59m', 'Sorry, wrong channel 🙈 That deploy log was meant for #eng-platform.', { rx: { '😂': 'priya kwame' } });
    w('fatima', '1d23h', 'Who else is doing the 10k-steps challenge? Day 9 and my dog is exhausted 🐕', { rx: { '🐕': 'yusuf hana', '💪': 'sara grace' } });
    const jollof = w('kwame', '1d20h', 'Jollof wars incoming: I’m bringing Ghanaian jollof to the All-Hands potluck. Nigerian colleagues, you have been warned 😤🍚', { rx: { '😂': 'daniel aisha sara fatima noah', '🍚': 'priya' } });
    thread(jollof,
      ['daniel', '1d19h', 'Challenge accepted. May the best rice win 🇳🇬'],
      ['aisha', '1d18h30m', 'I’ll be the impartial judge. (I will not be impartial.) 😂'],
      ['kwame', '1d17h', 'Ghana jollof doesn’t need a judge, it needs a fan club 🇬🇭'],
    );
    w('lucas', '1d18h', 'The Berlin office is debating whether a hot dog is a sandwich. Productivity has stopped. Please advise 🌭', { rx: { '😂': 'noah aisha kwame sofia' } });
    w('grace', '1d8h', 'Singapore weather update: it’s raining. That’s the update 🌧️', { rx: { '😂': 'hana mei' } });
    w('noah', '1d2h', 'To whoever left a _“you’re doing great”_ sticky note on my monitor in the NY office — it made my week 🥹', { rx: { '❤️': 'sara fatima aisha yusuf' } });
    w('ethan', '22h', 'Toronto got its first snow ❄️ Calling it now: worst winter yet. (I say this every year.)', { rx: { '❄️': 'lucas noah', '😂': 'layla' } });
    const sparkHowTo = w('sara', '6h', 'Reminder: the **Daily Spark** drops here every morning ✨ Answer, react, and get to know the folks you usually only see as a 40px avatar.', { rx: { '✨': 'fatima mateo' } });
    w('hana', '2h', 'Mochi update: she has learned to unmute me. I am not okay 🐱', { rx: { '😂': 'sofia grace priya aisha fatima' } });
    pin('ch-watercooler', sparkHowTo);
  }

  /* ───────────────────────── #kudos ───────────────────────── */
  {
    const k = conv('ch-kudos', 'kudos');
    // Mirror the Hub kudos wall exactly (shifted only if `now` predates the module-level seed, e.g. in tests).
    const newestHub = Math.max(0, ...SEED_KUDOS.map((x) => x.at));
    const shift = newestHub > now - MIN ? newestHub - (now - 2 * HOUR) : 0;
    const hubRx: Record<string, Record<string, string>> = {
      'k-1': { '🔥': 'kwame lucas mei hana', '🙌': 'sara aisha ethan' },
      'k-2': { '👏': 'layla fatima omar grace kwame', '🙌': 'priya noah' },
      'k-3': { '💖': 'hana sofia aisha omar', '🙌': 'noah sara' },
      'k-4': { '🔐': 'omar lucas mateo grace', '🙌': 'sara priya kwame' },
    };
    const hubMsg: Record<string, { id: string; at: number }> = {};

    k('priya', '5d6h', 'Kwame wrote the clearest on-call handoff notes I’ve seen in years — in his third week. Every shift since has been calmer because of them 🙌', { kudos: { toId: 'u-kwame', value: 'teamwork' }, rx: { '🙌': 'omar lucas sara', '🫶': 'fatima' } });
    k('aisha', '4d2h', 'Noah flew to Boston on 12 hours’ notice to sit with Meridian Health’s admins through their migration. That renewal is his 🏆', { kudos: { toId: 'u-noah', value: 'customer' }, rx: { '🏆': 'yusuf sara daniel', '👏': 'sofia' } });
    k('fatima', '3d4h', 'Sofia’s careers-page refresh doubled applications from designers. The photos, the copy, the tiny animations — _chef’s kiss_ 🤌', { kudos: { toId: 'u-sofia', value: 'craft' }, rx: { '🤌': 'mei hana aisha', '🎨': 'sara' } });
    k('omar', '1d5h', 'Alex added keyboard focus states and screen-reader labels to every Prism v4 form component — unasked, in the same sprint. Accessibility done right. Thank you! ♿', { kudos: { toId: 'u-alex', value: 'craft' }, rx: { '♿': 'mei priya', '🙌': 'hana sofia' } });
    k('kwame', '20h', 'Lucas spent an evening pairing with me on my first incident and never once made me feel slow. Best on-call buddy 🫶', { kudos: { toId: 'u-lucas', value: 'teamwork' }, rx: { '🫶': 'priya omar ethan' } });
    for (const hk of SEED_KUDOS) {
      const ts = hk.at - shift;
      hubMsg[hk.id] = {
        id: k(hk.fromId, now - ts, hk.message, { kudos: { toId: hk.toId, value: hk.value, hubKudosId: hk.id }, rx: hubRx[hk.id] }),
        at: ts,
      };
    }
    const k1 = hubMsg['k-1'];
    if (k1) {
      thread(k1.id,
        ['priya', after(k1.at, '15m'), '🥹 Thank you, Omar! Huge shoutout to @kwame for the benchmark harness — the 40% wouldn’t exist without it.'],
        ['kwame', after(k1.at, '32m'), 'Happy to help! Still can’t believe that flame graph before/after 🔥'],
      );
      k('omar', after(k1.at, '2m'), 'Also added this to Priya’s Q4 check-in 📈', {
        card: { app: 'performance', title: 'Priya’s praise was added to her performance timeline', subtitle: 'Query planner rewrite · Q4 2026 check-in', to: '/performance', status: 'Added' },
      });
    }
    const k2 = hubMsg['k-2'];
    if (k2) k('mateo', after(k2.at, '10m'), 'Thank you @sara 🥹 Couldn’t have done it without the facilities crew — Rashid and Joy carried 300 chairs up two floors.', { rx: { '❤️': 'sara fatima layla' } });
    const k3 = hubMsg['k-3'];
    if (k3) {
      thread(k3.id,
        ['mei', after(k3.at, '1h'), 'This made my week, Yusuf 💛 Thank you for bringing customers’ voices to us every single time.'],
        ['hana', after(k3.at, '1h25m'), 'Seconded — Yusuf’s call notes are basically free research 🙏'],
      );
    }
    k('hana', '40m', 'Mei sat in on all 14 onboarding interviews and turned them into the prototype that won the trial-flow test (+11% activation!). The best design partner a researcher could ask for ✨', { kudos: { toId: 'u-mei', value: 'teamwork' }, rx: { '✨': 'sofia aisha', '💖': 'priya' } });
  }

  /* ───────────────────────── #celebrations ───────────────────────── */
  {
    const c = conv('ch-celebrations', 'cel');
    const user = (id: string) => SEED_USERS.find((u) => u.id === id);
    const kwameStart = user('u-kwame')?.startDate ?? iso(new Date(now - 26 * DAY));
    const omarBirthday = nextOccurrence(user('u-omar')?.birthday ?? iso(new Date(now + DAY)).slice(5));
    const meiBirthday = nextOccurrence(user('u-mei')?.birthday ?? iso(new Date(now + 3 * DAY)).slice(5));
    const saraStart = user('u-sara')?.startDate ?? iso(new Date(now + 2 * DAY - 4 * 365 * DAY));
    const saraAnniversary = nextOccurrence(saraStart.slice(5));
    const saraYears = Number(saraAnniversary.slice(0, 4)) - Number(saraStart.slice(0, 4));

    c('sara', '26d', 'Please welcome **Kwame Mensah** to Helix! 🎉 Kwame joins Platform as a Data Engineer from Accra — BigQuery, dbt and Airflow wizard, and (we’re told) a formidable FIFA player. Sign his welcome card 👇', {
      celebration: {
        type: 'welcome',
        userId: 'u-kwame',
        date: kwameStart,
        key: `welcome:u-kwame:${kwameStart.slice(0, 4)}`,
        signers: signers([
          ['sara', '26d', 'Akwaaba, Kwame! So happy you’re here 💜'],
          ['omar', '25d23h', 'Welcome to Platform! Your first PR review is on me ☕'],
          ['priya', '25d22h', 'Can’t wait to nerd out about query plans with you.'],
          ['lucas', '25d21h', 'Welcome! On-call shadowing starts in week 3 — I’ll bring snacks 🍫'],
          ['fatima', '25d20h', 'It was a joy to recruit you. Welcome home 🏡'],
          ['layla', '25d19h', 'Welcome aboard! Enrol your passkey on day one 😉🔐'],
          ['mei', '25d6h', 'Welcome, Kwame! Ask me anything about the Singapore food scene 🍜'],
          ['hana', '25d5h', 'Welcome! Virtual coffee soon? ☕'],
        ]),
      },
      rx: { '👋': 'omar priya lucas fatima layla mei hana mateo grace', '🎉': 'aisha noah yusuf sofia ethan daniel' },
    });
    c('fatima', '5d22h', 'Big news 🎉 **Salma Darwish** accepted our Senior Frontend Engineer offer! She joins the Prism team in Dubai — and she was referred by @mei 💛 Hoodie incoming.', { rx: { '🎉': 'sara omar priya layla hana aisha', '💛': 'mei sofia' } });
    const award = c('sofia', '4d3h', 'Congrats to @aisha for being named one of _Product Leaders to Watch 2026_ 🏆 So deserved!', { rx: { '🏆': 'noah yusuf sara layla omar mei hana', '👏': 'priya grace' } });
    thread(award,
      ['aisha', '4d2h', 'Stop it, I’m blushing 🙈 The team did all the hard parts.'],
      ['noah', '4d1h', 'Our PM is famous now. Autographs at Demo Day ✍️'],
    );
    c('priya', '2d6h', 'Congrats to **Lucas** on passing his CKS (Certified Kubernetes Security Specialist) exam! 🎓 Two months of studying before Berlin stand-up, every single morning.', { rx: { '🎓': 'omar kwame ethan layla', '💪': 'sara mei' } });
    c('layla', '1d', `🎈 **Sara’s ${saraYears}-year Helix anniversary** is ${when(saraAnniversary)}! ${saraYears} years of making this place feel like home — sign her card 👇`, {
      celebration: {
        type: 'anniversary',
        userId: 'u-sara',
        years: saraYears,
        date: saraAnniversary,
        key: `anniversary:u-sara:${saraAnniversary.slice(0, 4)}`,
        signers: signers([
          ['layla', '1d', 'Years of you making Helix a better place to work. Thank you, Sara 💜'],
          ['fatima', '23h', 'Best manager, best mentor, best karak recommendations. Happy anniversary! 🎈'],
          ['mateo', '20h', 'Happy Helixversary! Here’s to many more (and many more office moves) 📦'],
        ]),
      },
      rx: { '💜': 'fatima mateo omar mei priya grace hana', '🎈': 'aisha daniel' },
    });
    c('mei', '5h', `🎂 **Omar’s birthday is ${when(omarBirthday)}!** Sign the card before he sees this… (Omar, if you’re reading this: act surprised.)`, {
      celebration: {
        type: 'birthday',
        userId: 'u-omar',
        date: omarBirthday,
        key: `birthday:u-omar:${omarBirthday.slice(0, 4)}`,
        signers: signers([
          ['mei', '5h', 'Happy birthday to the calmest person in every incident 🎂'],
          ['priya', '4h30m', 'Happy birthday, Omar! Thanks for always shielding us from the chaos 🛡️'],
          ['lucas', '3h45m', 'Alles Gute zum Geburtstag! 🎈 May all your deploys be green.'],
          ['kwame', '2h50m', 'Happy birthday, boss! Thank you for the warmest onboarding 🙏'],
        ]),
      },
      rx: { '🎂': 'priya lucas kwame sara fatima hana', '🎉': 'layla aisha' },
    });
    c('sara', '2h', `🎂 **Mei’s birthday is ${when(meiBirthday)}!** Let’s fill her card with doodles, pixel art and gratitude 💖`, {
      celebration: {
        type: 'birthday',
        userId: 'u-mei',
        date: meiBirthday,
        key: `birthday:u-mei:${meiBirthday.slice(0, 4)}`,
        signers: signers([
          ['sara', '2h', 'Happy early birthday, Mei! You make everything more beautiful (literally) 🎂'],
          ['hana', '1h40m', 'To my favourite research partner — happy birthday! 🌸 The next kaya toast is on me.'],
          ['priya', '1h5m', 'Happy birthday, Mei! Prism v4 is gorgeous because of you 💠'],
          ['sofia', '25m', 'Tanti auguri! 🎉 Our brand has never looked better.'],
        ]),
      },
      rx: { '🎂': 'hana priya sofia aisha', '💖': 'fatima' },
    });
    c('fatima', '35m', 'Congrats to @yusuf — Atlas Logistics just renewed for 3 years **and** doubled their seats! 🥂', { rx: { '🥂': 'sara aisha noah', '🎉': 'sofia grace' } });
  }

  /** Message ids referenced later by per-person state (saved items, thread read markers, forwards). */
  const refs: Record<string, string> = {};

  /* ───────────────────────── #design-crit ───────────────────────── */
  {
    const d = conv('ch-design-crit', 'crit');
    d('mei', '5d22h', lines(
      'Crit agenda this week 🎨',
      '1. Motion study v3 — easing + durations',
      '2. Contrast audit status',
      '3. Empty states: illustration or not?',
      '',
      'Drop WIP here at any fidelity. Critique the work, not the person 💜',
    ), { rx: { '👍': 'hana sofia aisha' } });
    d('hana', '5d21h', 'Research input for crit: in the date-picker study **5/8** participants missed the “clear” affordance on the ghost button. Probably relevant for the contrast audit 👀', { rx: { '👀': 'mei priya' } });
    const spec = d('mei', '5d6h', 'Updated the spec with the new token tiers (core → semantic → component). Comments welcome — especially on §4 _Engineering aliases_.', { files: [SPEC], rx: { '🙏': 'priya omar' } });
    const accent = d('sofia', '4d23h', 'Brand note: the new accent `violet-500` reads a little cold next to our photography. Could we use `violet-400` on marketing surfaces only?');
    thread(accent,
      ['mei', '4d22h', 'Good catch — let’s add a `brand.accent` alias: violet-400 on marketing, violet-500 in product.'],
      ['sofia', '4d21h', 'Perfect, that keeps everyone happy 🙌'],
      ['aisha', '4d20h', '+1 — and the trial flow should use the product one.'],
    );
    const motion = d('mei', '4d5h', 'Motion study v3 🎬 240ms standard, 160ms for micro-interactions, `cubic-bezier(0.2, 0, 0, 1)` everywhere. The sheet transition is my favourite bit.', { files: [MOTION], rx: { '😍': 'hana sofia aisha omar', '🔥': 'priya' } });
    thread(motion,
      ['aisha', '4d4h', 'That sheet transition is so good. Can we borrow it for the trial checklist?'],
      ['priya', '4d3h', 'Perf check: all transform/opacity, no layout thrash ✅'],
      ['mei', '4d2h', 'That was the goal — thanks for checking, Priya!'],
    );
    const reduced = d('priya', '3d22h', 'Engineering q: do reduced-motion variants ship in v4.0 or v4.1? We should respect `prefers-reduced-motion` from day one.');
    thread(reduced,
      ['mei', '3d21h', 'v4.0! Every transition has a reduced variant (fade only). It’s in §6 of the spec.'],
      ['priya', '3d20h', '🙌 perfect'],
    );
    d('mei', '3d6h', 'Quick vote before Thursday’s crit 🗳️', {
      poll: {
        question: 'Empty states — which illustration style?',
        options: [
          { id: 'line', text: 'Line illustrations (monochrome)' },
          { id: 'duotone', text: 'Duotone with the brand accent' },
          { id: 'none', text: 'No illustrations — icon + copy only' },
        ],
        multi: false,
        anonymous: false,
        closed: true,
        closedAt: at('2d6h'),
        votes: { line: ids('hana'), duotone: ids('sofia aisha omar priya'), none: ids('mei') },
      },
    });
    d('mei', '2d5h59m', 'Poll closed: **duotone with the brand accent** wins 4–1–1 🎨 I’ll do a pass on all 12 empty states this week.', { rx: { '🎉': 'sofia aisha' } });
    const trial = d('aisha', '2d23h', 'Trial-flow screens are in Figma — would love eyes on the progress indicator. Is 5 steps too many?');
    thread(trial,
      ['hana', '2d22h', 'From research: people tolerate 5 steps if each one shows progress. Name the steps instead of numbering them.'],
      ['mei', '2d21h', 'Agree — and merge steps 4 + 5 into a single “Invite your team” step?'],
      ['aisha', '2d20h', 'Love it. Four named steps it is ✨'],
    );
    voice(d('mei', '2d8h', '', { rx: { '👍': 'hana sofia' } }), 41,
      'Hey team — quick async crit on the nav rail. I tried the collapsed state at 64 pixels and it finally feels balanced, but the hover labels pop in too fast. I’m going to slow them to 160 milliseconds with a tiny delay. Shout if anything feels off in the dark theme.');
    d('sofia', '2d2h', 'Launch video storyboard is up — 6 frames, all real Prism components, no stock footage 🎬 Feedback by Friday?', { rx: { '👀': 'mei aisha' } });
    d('omar', '2d1h', 'Love where this is going 💠 Reminder: the token freeze is **Thursday** 🧊 — anything not in by then rides v4.1.', { rx: { '👍': 'mei priya' } });
    refs.aliasAsk = d('mei', '1d23h', lines(
      '@omar before I lock the token names on PRISM-1 — can you confirm the engineering alias naming? Proposal:',
      '```',
      'color.bg.surface    → --hx-bg-surface',
      'color.text.muted    → --hx-text-muted',
      'color.border.focus  → --hx-border-focus',
      '```',
      '`--hx-` prefix + semantic path, no component names. [PRISM-1](/projects/p/prj-prism?task=t-p1)',
    ), { rx: { '👀': 'priya hana' } });
    thread(refs.aliasAsk,
      ['priya', '1d22h', 'From the eng side `--hx-` works — it won’t clash with the legacy `--helix-*` vars during the migration.'],
      ['omar', '1d20h', 'Mostly 👍 One question before I confirm: do we keep a `--hx-legacy-*` shim for a release so Alex’s migration PRs stay small? Checking with Alex.'],
      ['mei', '1d19h', 'Happy to add a shim for v4.0 if engineering needs it — just let me know before the freeze 🧊'],
    );
    refs.synthesis = d('hana', '1d6h', lines(
      'Synthesis from the Prism v4 usability round 🔍 Top 3 issues:',
      '1. Ghost buttons are too faint on dark (ties into the contrast audit)',
      '2. The focus ring is invisible on violet backgrounds',
      '3. Toasts disappear too fast for screen-reader users',
      '',
      'Full notes are in the spec comments.',
    ), { rx: { '🙏': 'mei priya aisha' } });
    d('mei', '1d2h', lines(
      'Contrast audit update: **37/42** pass AA. The remaining 5 are ghost variants — proposed values:',
      '- `ghost.fg` → `indigo-600` (4.8:1 on white)',
      '- `ghost.fg.dark` → `indigo-200` (7.1:1 on `surface-900`)',
      '- `focus.ring` → 3px `violet-400` + a 1px white inner ring',
    ), { edit: '6m', rx: { '💯': 'priya hana omar' } });
    d('aisha', '23h', 'These empty states are 😍 — the duotone works so well with the brand accent.', { rx: { '❤️': 'mei sofia' } });
    const still = d('sofia', '20h', 'Could I get a still from the motion study for the launch blog header? 1600×900 if possible 🙏');
    thread(still,
      ['mei', '19h', 'Exporting tonight ✨'],
      ['sofia', '18h30m', 'Grazie! 🙏'],
    );
    d('priya', '9h', 'Implemented the new focus ring in Storybook — crisp on violet now ✅ Screenshot is in the spec.', { rx: { '🙌': 'mei hana' } });
    const decisions = d('mei', '7h', lines(
      'Thanks all for a great crit today 💜 Decisions:',
      '- Duotone empty states ✅',
      '- Reduced-motion variants ship in v4.0 ✅',
      '- Ghost button values updated (pending the final contrast check)',
      '',
      'Next crit: launch video + nav rail.',
    ), { rx: { '🙌': 'hana sofia aisha priya' } });
    d('hana', '5h', 'Booked 6 participants for next week’s nav-rail test (2 admins, 4 end users), mostly Singapore + London time zones 🗓️', { rx: { '👍': 'mei' } });
    d('sofia', '50m', 'Launch video preview is up 🎬 58 seconds — the motion study does all the heavy lifting. Link is in §9 of the [Prism spec](/drive/file/df-prism-spec).', { rx: { '😍': 'hana aisha' } });
    d('hana', '15m', '@mei the nav-rail participants keep asking about the collapsed state — do you have 10 minutes before my 4pm to align on the test script? 🙏');
    pin('ch-design-crit', spec, decisions);
  }

  /* ───────────────────────── #eng-platform ───────────────────────── */
  {
    const e = conv('ch-eng-platform', 'plat');
    e('omar', '5d23h', lines(
      'Week plan 🗓️',
      '- Planner v2 canary — @priya',
      '- Postgres 16 on the `billing-db` replicas — @lucas',
      '- `usage_daily` backfill + dbt tests — @kwame',
      '- Pen-test fixes for session handling — @ethan',
      '',
      'Shout early if something slips. No heroics 🙏',
    ), { rx: { '👍': 'priya lucas kwame ethan' } });
    e('lucas', '5d20h', 'Maintenance window: **Sunday 02:00–04:00 GST** for the Postgres 16 replica upgrade. Reads fail over to the standby; writes are unaffected.', { edit: '4m', rx: { '✅': 'omar priya' } });
    const dbt = e('kwame', '5d4h', 'dbt question 🙋🏾 For `usage_daily` (partitioned by day, ~40M rows/day), do we prefer `incremental` with `merge` or `insert_overwrite`?');
    thread(dbt,
      ['priya', '5d3h', '`insert_overwrite` on the partition — `merge` gets expensive at that size.'],
      ['lucas', '5d2h', '+1, and set `partition_expiration_days` so old partitions don’t pile up.'],
      ['kwame', '5d1h', 'Switched — the dry run scans ~6× fewer bytes 🎉'],
    );
    e('ethan', '4d22h', 'Pen-test retest is booked for Thursday. Remaining finding on our side: session cookies missing `SameSite=Strict` on the admin subdomain. PR incoming 🔐');
    const incident = e('lucas', '4d20h', '🔥 **INC-2291** — elevated latency on `search-api` (p99 3.2s, normally ~400ms). Investigating.', { rx: { '👀': 'omar priya kwame' } });
    thread(incident,
      ['priya', '4d19h52m', lines(
        'The new tenant filter isn’t using the composite index:',
        '```',
        'Seq Scan on documents  (cost=0.00..482113.20 rows=1204 width=412)',
        '  Filter: ((tenant_id = $1) AND (archived = false))',
        '  Rows Removed by Filter: 18403311',
        '```',
      )],
      ['lucas', '4d19h45m', 'Confirmed — stats on `documents` have been stale since the bulk import. Running `ANALYZE documents;` now.'],
      ['lucas', '4d19h38m', 'p99 back to 410ms ✅ Mitigated.', { rx: { '🙌': 'omar priya kwame' } }],
      ['omar', '4d19h20m', 'Great teamwork. Let’s auto-analyze after big imports and write the postmortem — @lucas can you own it?'],
      ['lucas', '4d19h15m', 'On it. Draft by tomorrow 📝'],
    );
    refs.postmortem = e('lucas', '4d6h', 'Postmortem for INC-2291 is up 📝 Key action: run `ANALYZE` automatically after any import over 1M rows. Reviews by Friday please 🙏', { rx: { '👍': 'omar priya ethan' } });
    e('kwame', '3d4h', 'Backfill done ✅ 18 months of `usage_daily` rebuilt in 3h40m. Row counts match the old pipeline to the row.', { rx: { '🎉': 'omar priya lucas', '💯': 'ethan' } });
    e('layla', '2d22h', 'Security posture note: all prod access now requires a passkey via the bastion. Thanks for being the pilot team 🔐', { rx: { '🙏': 'omar ethan' } });
    e('lucas', '2d7h', 'Sunday maintenance done ✅ Replicas are on PG16, failover took 11s, zero errors.', { rx: { '🙌': 'omar priya kwame' } });
    const pg16 = e('omar', '2d5h', 'Decision 🐘 **Postgres 16 is the default for all new services.**', {
      decision: {
        title: 'Postgres 16 is the default for all new services',
        context: 'The billing-db replica upgrade went clean (11s failover, zero errors). Existing services migrate opportunistically in Q1 — no big bang.',
        decidedBy: 'u-omar',
        decidedAt: at('2d5h'),
        status: 'decided',
      },
      rx: { '🐘': 'lucas priya kwame', '👍': 'ethan layla' },
    });
    e('ethan', '2d3h', '`SameSite=Strict` fix is merged and verified on staging. Thursday’s retest should close it ✅', { rx: { '👍': 'layla omar' } });
    e('priya', '1d23h', 'Benchmark day: planner v2 vs v1 on the 50 slowest queries — **49 faster**, 1 unchanged 🎉 The `audit_events` regression is gone thanks to extended stats.', { rx: { '🔥': 'omar lucas kwame' } });
    refs.q1Bets = e('omar', '1d5h', 'Q1 planning 🗺️ I’d like each of you to pick **one reliability bet** for Q1 (max two weeks of work). Ideas in the thread 👇', { rx: { '👍': 'priya lucas' } });
    thread(refs.q1Bets,
      ['lucas', '1d4h', 'Monthly automated failover drills — we’ve only ever done them by hand.'],
      ['priya', '1d2h', 'Query regression tests in CI using the benchmark set.'],
      ['kwame', '21h', 'Freshness SLOs for our top 10 tables, with alerts that page the owner.'],
      ['ethan', '40m', 'Short-lived prod credentials via the bastion — kill static keys for good 🔐'],
    );
    const maintenance = e('omar', '1d1h', 'Provider heads-up: **ME-1 network maintenance Saturday 01:00–03:00 GST**. No action expected — @lucas is on call 📟');
    thread(maintenance,
      ['lucas', '1d', 'I’ll pre-scale the NAT gateways just in case.'],
      ['ethan', '23h30m', 'Can we double-check the bastion has a fallback route? It flapped last time.'],
      ['lucas', '23h', 'Added to the runbook ✅'],
    );
    e('system', yesterdayAt(15, 25), '', {
      huddle: {
        startedAt: yAbs(15, 2),
        endedAt: yAbs(15, 24),
        participantIds: ids('omar priya lucas kwame ethan'),
        keyPoints: [
          'Planner v2 goes to 100% on EU after a clean night at 50%; ME follows once p99 holds for 24h',
          'PG16 replica failover took 11s — acceptable, now documented',
          'Kwame’s backfill matches the legacy pipeline to the row; freshness alerts are next',
          'Demo Day deploy freeze: risky changes must land before the 18:00 cutoff',
        ],
        actionItems: [
          { id: 'ai-plat-1', text: 'Write the ME rollout checklist for planner v2', ownerId: 'u-priya' },
          { id: 'ai-plat-2', text: 'Add failover timings to the PG16 runbook', ownerId: 'u-lucas', taskTo: '/projects/p/prj-platform' },
          { id: 'ai-plat-3', text: 'Set up freshness alerts for usage_daily', ownerId: 'u-kwame' },
        ],
      },
    });
    e('bot-helpdesk', '7h', '🟠 Incident opened — **VPN degraded in Singapore**', {
      card: { app: 'helpdesk', title: 'VPN degraded in Singapore', subtitle: 'Minor incident · packet loss on the SG gateway · workaround: Helix-HK', to: '/helpdesk/status', status: 'Investigating' },
      rx: { '👀': 'lucas layla' },
    });
    const vpn = e('layla', '6h40m', 'We’re on it with the provider. Anyone on the team blocked? The HK gateway is a safe workaround.');
    thread(vpn,
      ['lucas', '6h20m', 'Our SG synthetic checks show ~4% packet loss on the SG POP — dashboard: https://grafana.helix.co/d/vpn-pops'],
      ['layla', '6h', 'Thanks Lucas — sharing it with the provider now.'],
    );
    e('priya', today('3h10m'), '', {
      standup: {
        yesterday: ['Planner v2 EU ramp: 25% → 50%', 'Reviewed Kwame’s backfill validation queries'],
        today: ['Planner v2 EU → 100%', 'ME rollout checklist for the go/no-go'],
        blockers: [],
      },
      rx: { '👍': 'lucas kwame' },
    });
    e('lucas', today('2h25m'), '', {
      standup: {
        yesterday: ['Added PG16 failover timings to the runbook', 'Pre-scaled NAT gateways for the ME-1 maintenance'],
        today: ['Flip planner v2 for the ME region', 'SG VPN: synthetic checks + provider follow-up'],
        blockers: ['Need Omar’s go/no-go on the ME flip before the freeze'],
      },
      rx: { '👍': 'priya' },
    });
    e('kwame', '2h', 'Freshness alerts PR is up: page if `usage_daily` is more than 2h stale, routed here. Reviews welcome 🙏 https://git.helix.co/platform/data/pull/482', { rx: { '👀': 'priya' } });
    e('system', '14m', 'Priya started a huddle', { system: 'huddle-start' });
    e('kwame', '11m', 'Joining! Bringing the backfill dashboard 📊');
    e('lucas', '8m', 'In the huddle — walking through the ME rollout checklist. Notes here after.');
    e('priya', '5m', '@omar we’d love 5 minutes of you in the huddle for the ME go/no-go if you’re free 🙏');
    e('ethan', '2m', 'Can’t join (pen-test window), but +1 on ME from security — no auth changes in this flip ✅');
    pin('ch-eng-platform', refs.postmortem, pg16);
  }

  /* ───────────────────────── #it-help ───────────────────────── */
  {
    const it = conv('ch-it-help', 'it');
    const howTo = it('layla', '5d23h', lines(
      'Welcome to #it-help 🛟 Fastest path to a fix:',
      '1. What’s wrong (screenshots help)',
      '2. Your device + OS',
      '3. Your office or time zone',
      '',
      'Urgent or private? Open a ticket in [IT Helpdesk](/helpdesk/tickets). Known incidents live on the [status page](/helpdesk/status).',
    ));
    const noahPasskey = it('noah', '5d22h', 'Hi team — my passkey works on my laptop, but my iPhone says “no passkeys available” when I sign in to Helix on mobile. iOS 18 🙏');
    thread(noahPasskey,
      ['ethan', '5d21h', 'Passkeys sync through iCloud Keychain — turn it on in Settings → your name → iCloud → Passwords & Keychain, then try again!'],
      ['noah', '5d20h', 'That was it. Thank you!! 🙌'],
    );
    const addin = it('daniel', '5d3h', 'Is there a fast lane for Excel add-ins? I need the Power Query connector for month-end 📊');
    thread(addin,
      ['layla', '5d2h', 'Request it in the catalog (Software → Excel add-ins) — finance add-ins are pre-approved, so it auto-installs within the hour.'],
      ['daniel', '5d1h', 'Installed already. You’re the best 🙏'],
    );
    it('bot-helpdesk', '4d22h', 'New in the IT catalog ✨', {
      card: { app: 'helpdesk', title: 'YubiKey 5C NFC is now in the catalog', subtitle: 'Recommended for frequent travellers · ships in 2 days', to: '/helpdesk', status: 'Available' },
      rx: { '🔑': 'noah grace' },
    });
    const yubikey = it('grace', '4d4h', 'Passkey question: can I use a YubiKey instead of my phone? I’d rather keep work off my personal phone.');
    thread(yubikey,
      ['layla', '4d3h', 'Absolutely — security keys are first-class. Enrol under Security → Passkeys → _Add security key_. Register two if you can (one as a backup).'],
      ['grace', '4d2h', 'Done, both keys enrolled 🔑 Thanks Layla!'],
    );
    const printer = it('mateo', '3d7h', 'The 14F printer has been printing everything in “draft quality” since this morning. Is it… tired? 🖨️');
    thread(printer,
      ['ethan', '3d6h', 'A firmware update reset the defaults 🙃 Fixed — try again.'],
      ['mateo', '3d5h', 'It lives! Thank you 🙌'],
    );
    const flicker = it('hana', '2d23h', 'Anyone else seeing monitor flicker on the Dell docks in SG? Only over USB-C.');
    thread(flicker,
      ['ethan', '2d22h', 'Known issue with dock firmware 1.0.12 — update to 1.0.15 from Self Service. If it persists, open a ticket and we’ll swap the cable.'],
      ['hana', '2d21h', 'Updated — flicker gone ✨'],
    );
    const loaner = it('alex', '2d2h', 'Hi! 👋 Question about my loaner laptop: it’s due back on the 15th, but my contract was extended through Q1. Do I return it and get a new one, or can the loan be extended?');
    thread(loaner,
      ['ethan', '2d1h', 'Good question! You can extend it — open a request under Devices → _Extend loan_ and Omar approves it as your manager. No need to ship anything.'],
      ['alex', '2d', 'Perfect, thank you! I’ll file it today 🙏'],
    );
    const linuxVpn = it('kwame', '1d21h', 'Setting up the VPN on Ubuntu 24.04 — is the WireGuard CLI supported, or should I use the GUI app?');
    thread(linuxVpn,
      ['ethan', '1d20h', 'CLI is supported 👍 Grab the config from Self Service → VPN → Linux, then `sudo wg-quick up helix-dxb`.'],
      ['kwame', '1d19h', 'Connected ✅ Thanks!'],
    );
    it('sara', '1d3h', 'People Ops folks: please enrol your passkeys before the 15th — HR Portal will require them. Ethan is running a drop-in at 14:00 GST in the Dubai office 🔐', { rx: { '🙏': 'layla ethan' } });
    it('bot-helpdesk', '7h', '🟠 **Minor incident** — VPN degraded in Singapore', {
      card: { app: 'helpdesk', title: 'VPN degraded in Singapore', subtitle: 'Packet loss on the SG gateway · workaround: connect to Helix-HK', to: '/helpdesk/status', status: 'Investigating' },
      rx: { '👀': 'hana mei grace' },
    });
    const sgVpn = it('mei', '6h30m', 'VPN keeps dropping every few minutes in SG 😩 Is the HK gateway safe to use for Figma + Drive?');
    thread(sgVpn,
      ['layla', '6h15m', 'Yes — Helix-HK is a full gateway with the same policies. Expect ~30ms more latency, nothing else.', { broadcast: true, rx: { '🙏': 'mei hana grace' } }],
      ['mei', '6h', 'Switched, much better 🙏'],
    );
    const omarVpn = it('omar', '4h', 'My VPN ticket from earlier this week is still waiting on IT — the split tunnel drops `*.staging.helix.internal` routes after sleep. Anything I can try meanwhile? 🙏');
    thread(omarVpn,
      ['ethan', '3h45m', lines(
        'Sorry Omar — it’s on my list for today. Meanwhile, re-upping the tunnel after wake restores the routes:',
        '```',
        'sudo wg-quick down helix-dxb && sudo wg-quick up helix-dxb',
        '```',
      )],
      ['omar', '3h30m', 'Works for now, thanks 👍'],
    );
    it('grace', '1h30m', 'SG office: the HK gateway is flaky for some folks too. Any ETA from the provider?');
    it('hana', '45m', 'Same here — Figma uploads time out on HK as well. Happy to share a trace if it helps 🙏');
    it('daniel', '10m', '@layla quick check before I escalate — is the Singapore VPN incident why uploads to the Finance SG share are crawling? Month-end files are stuck at 40% 😅');
    pin('ch-it-help', howTo);
  }

  /* ───────────────────────── #dubai-office ───────────────────────── */
  {
    const dx = conv('ch-dubai-office', 'dxb');
    const padel = dx('mateo', '5d21h', lines(
      '🎾 Padel league, round 3 — tonight 19:30 at Dubai Sports City. Standings:',
      '1. Sara & Fatima — 6 pts',
      '2. Omar & Mateo — 4 pts',
      '3. Layla & Rashid — 3 pts',
      '',
      'Trash talk encouraged.',
    ), { edit: '2m', rx: { '🎾': 'sara fatima omar layla' } });
    thread(padel,
      ['omar', '5d20h', 'We’re coming for that top spot 😤'],
      ['sara', '5d19h', 'Bring your best excuses, Omar.'],
      ['fatima', '5d18h', 'We’ve been practising our victory dance 💃'],
    );
    const karak = dx('fatima', '5d2h', 'Karak run at 3:30 — Filli downstairs. Taking orders! ☕', { rx: { '🙋': 'mateo sara omar' } });
    thread(karak,
      ['mateo', '5d1h50m', 'Zafran karak + a chips oman paratha, please 🙏'],
      ['sara', '5d1h45m', 'Regular karak, less sugar!'],
    );
    dx('mateo', '4d3h', 'Parking update: B2 repainting is done — back to your usual spots. B3 is closed Thursday for cleaning 🚗', { rx: { '👍': 'layla sara' } });
    dx('sara', '3d21h', 'Padel result: Sara & Fatima win 6–4, 6–3 🏆 Omar & Mateo fought bravely.', { rx: { '🏆': 'fatima layla', '😂': 'mateo' } });
    dx('layla', '3d2h', 'Heads-up: building security is auditing access cards next week — please make sure your badge photo is current. Old badges stop working on the 20th.', { rx: { '👍': 'mateo fatima' } });
    const nationalDay = dx('mateo', '2d21h', lines(
      '🇦🇪 **National Day plans!** The office is closed Dec 2–3, so we’re doing a team breakfast on the 1st:',
      '- Emirati spread: balaleet, chebab, regag 🥞',
      '- Traditional dress very welcome',
      '- Families welcome too',
      '',
      'Who’s in?',
    ), { rx: { '🇦🇪': 'layla sara omar fatima', '🙋': 'sara fatima omar layla' } });
    thread(nationalDay,
      ['fatima', '2d20h', 'In! Bringing my mum’s luqaimat 🍯'],
      ['layla', '2d19h', 'Count me in 🇦🇪'],
      ['omar', '2d18h', 'In — I’ll handle the karak.'],
      ['sara', '2d17h', 'Yes! Let’s invite the Abu Dhabi partner team too.'],
    );
    const phone = dx('omar', '2d3h', 'Anyone know a good place to fix a cracked phone screen near the office? Asking for a clumsy friend (me) 📱');
    thread(phone,
      ['mateo', '2d2h', 'iFix in Business Bay — 45-minute turnaround. Tell them Mateo sent you.'],
      ['omar', '2d1h', 'Legend 🙏'],
    );
    dx('fatima', '1d6h', 'Karak run again? It’s been one of those days ☕', { rx: { '🙋': 'sara mateo layla' } });
    dx('mateo', '1d1h', 'The 14F espresso machine has an official name thanks to #general: **Brewce Wayne** 🦇☕ Please treat him with respect.', { rx: { '😂': 'sara layla fatima omar' } });
    dx('sara', '9h', 'Breakfast at Tom & Serg after Tuesday’s team photos? 🥐', { rx: { '🙋': 'fatima mateo' } });
    dx('layla', '5h', 'The Abu Dhabi partner team confirmed for the National Day breakfast 🇦🇪 I’ll bring them up at 9.', { rx: { '🙌': 'mateo sara' } });
    dx('mateo', '1h20m', 'Padel round 4 draw is out 🎾 Omar & Mateo vs. Layla & Rashid — Tuesday 19:30. No mercy.', { rx: { '😂': 'sara' } });
    pin('ch-dubai-office', nationalDay);
  }

  /* ───────────────────────── #exec-sync ───────────────────────── */
  {
    const x = conv('ch-exec-sync', 'exec');
    const agenda = x('layla', '5d22h', lines(
      'Agenda for Thursday’s exec sync:',
      '1. Q1 headcount plan — Sara',
      '2. FY27 budget guardrails — Grace & Daniel',
      '3. Security posture: passkeys + pen-test — me',
      '4. Offsite prep — Aisha',
      '',
      'Pre-reads by Wednesday, please 🙏',
    ), { rx: { '👍': 'sara grace aisha omar' } });
    const headcount = x('sara', '5d5h', 'Q1 headcount draft: **+9 roles** — 4 Engineering, 2 Sales, 1 Design, 1 Security, 1 People. Fatima is pre-sourcing the senior frontend and data roles so we can start on Jan 4.');
    thread(headcount,
      ['omar', '5d4h', 'Engineering asked for 4 — I can live with 3 if the data engineer stays.'],
      ['grace', '5d3h', 'The budget supports 8 without a reforecast. The 9th needs the Q1 revenue gate.'],
      ['sara', '5d2h', 'Let’s plan for 8, plus 1 gated on Q1 revenue.'],
    );
    x('grace', '4d2h', lines(
      'FY27 budget guardrails (draft):',
      '- Opex growth capped at **14%**',
      '- Any new tool over USD 20k/yr needs a Finance + Security review',
      '- Travel: economy under 6h, premium economy above',
      '',
      'Comments by Friday, please.',
    ), { rx: { '👍': 'layla daniel' } });
    x('daniel', '3d3h', 'Q4 forecast update: tracking **3% above plan** on revenue, opex flat. The Meridian renewal pulls ~USD 180k forward 📈', { rx: { '📈': 'grace aisha layla' } });
    x('layla', '2d22h', 'Security posture: **83%** of employees are on passkeys, with 14 legacy service accounts left. Ethan’s exception policy (MFA-6) is with me for approval this week. Pen-test retest on Thursday 🔐', { rx: { '🔐': 'omar sara' } });
    const offsite = x('aisha', '2d1h', 'Offsite prep: venue options are Ras Al Khaimah (beach) or Hatta (mountains), late January. 2 nights, ~40 people. Vote by Monday? 🏖️⛰️');
    thread(offsite,
      ['sara', '2d', 'Hatta! Less beach, more strategy 😄'],
      ['grace', '1d23h', 'Both fit the budget. RAK has better meeting rooms.'],
      ['omar', '1d22h', 'Hatta — the team would love the hiking.'],
    );
    x('omar', '1d3h', 'Engineering update for the board deck: 26.11 shipped, p99 down 40% on the heaviest tenants, zero sev-1s this quarter 🎉', { rx: { '🎉': 'layla aisha sara' } });
    x('sara', '9h', 'Comp review timeline (draft): calibration Dec 8, letters out Jan 15. Flagging early because the holidays eat December 🎄', { rx: { '👍': 'grace' } });
    x('grace', '1h40m', 'Updated the headcount model in the FY27 sheet — 8 roles fit under the 14% opex cap with ~USD 60k to spare.');
    x('aisha', '25m', 'Offsite: Hatta wins 4–1 🏔️ I’ll hold the venue for Jan 27–29 unless anyone objects by tomorrow.');
    pin('ch-exec-sync', agenda);
  }

  /* ───────────────────────── #proj-prism ───────────────────────── */
  {
    const p = conv('ch-proj-prism', 'prism');
    const plan = p('mei', '5d23h', lines(
      'Prism v4 — week of the big push 💠',
      '- **Tokens:** freeze Thursday 🧊',
      '- **Contrast audit:** 37/42 → 42/42',
      '- **Components:** Button, Input and Select migrating (@alex)',
      '- **Docs:** spec §4 _Engineering aliases_ (waiting on @omar)',
      '',
      'One thread per topic, please 🙏',
    ), { edit: '20m', rx: { '💠': 'omar priya alex hana' } });
    p('bot-projects', '5d22h', 'Task moved to **In review**', {
      card: { app: 'projects', title: 'PRISM-1 · Lock engineering token alias naming', subtitle: 'Mei Tanaka · waiting on Omar to confirm the alias naming', to: '/projects/p/prj-prism?task=t-p1', status: 'In review' },
    });
    const migration = p('alex', '5d5h', 'Button + Input are migrated to v4 tokens on the `prism-v4` branch 🎉 Storybook preview: https://storybook.helix.co/prism-v4/?path=/story/button', { rx: { '🎉': 'mei omar priya' } });
    thread(migration,
      ['mei', '5d4h', 'Looks great! The focus ring on `ghost` feels thin — 2px → 3px?'],
      ['alex', '5d3h', 'Done ✅ Also switched to `:focus-visible` so mouse users don’t see it.'],
      ['priya', '5d2h', 'And the bundle went down 4KB 🎉'],
    );
    p('hana', '4d22h', 'Prism usability round 2 is booked: 6 sessions on forms + error states. Observers welcome (cameras off, please 🙏).', { rx: { '👀': 'mei alex' } });
    const specCard = p('mei', '4d6h', 'Spec **v4.0-rc** is up 📄 New: §4 _Engineering aliases_, §6 _Motion_, §9 _Launch_. Please comment in the doc so we keep one source of truth.', {
      card: { app: 'drive', title: 'Prism v4 Component Spec', subtitle: 'Doc · Mei Tanaka · Internal', to: '/drive/file/df-prism-spec', status: 'Updated' },
      rx: { '🙏': 'omar priya' },
    });
    p('bot-projects', '3d23h', 'Milestone update', {
      card: { app: 'projects', title: 'Milestone · Form components on v4 tokens', subtitle: 'Prism v4 Design System · 6/12 done · on track', to: '/projects/p/prj-prism', status: 'On track' },
    });
    p('priya', '3d5h', 'Perf budget check: every v4 component is under 8KB gzipped except DataTable (14KB). Splitting the column-resize logic into a lazy chunk.', { rx: { '👍': 'mei alex omar' } });
    p('mei', '2d22h', 'Help Sofia pick the hero shot for the launch video 🎬', {
      poll: {
        question: 'Which component should open the Prism v4 launch video?',
        options: [
          { id: 'datatable', text: 'DataTable — power + perf' },
          { id: 'datepicker', text: 'Date picker — the 31s → 14s story' },
          { id: 'palette', text: 'Command palette' },
          { id: 'toasts', text: 'Toasts & motion' },
        ],
        multi: false,
        anonymous: false,
        closed: false,
        votes: { datatable: ids('priya'), datepicker: ids('hana sofia aisha'), palette: ids('omar'), toasts: [] },
      },
      rx: { '🎬': 'sofia' },
    });
    const blog = p('sofia', '2d4h', 'The launch blog says “Prism v4 makes every Helix surface feel like one product”. Too bold? 😅');
    thread(blog,
      ['aisha', '2d3h', 'Bold is good — we have the usability numbers to back it.'],
      ['mei', '2d2h', 'Keep it! Maybe add the date-picker stat as proof.'],
      ['sofia', '2d1h', 'Added ✨'],
    );
    p('bot-projects', '1d23h', '⚠️ Task overdue', {
      card: { app: 'projects', title: 'PRISM-3 · Token contrast audit', subtitle: 'Mei Tanaka · overdue · urgent', to: '/projects/p/prj-prism?task=t-p3', status: 'Overdue' },
    });
    p('omar', '1d6h', 'Reminder: the token freeze is **Thursday** 🧊 @mei I’ll get you the alias confirmation before then — reviewing the shim approach with Alex first.', { rx: { '🙏': 'mei' } });
    p('alex', '1d2h', '', {
      standup: {
        yesterday: ['Migrated Select + Combobox to v4 tokens', 'Added `:focus-visible` rings to all form controls'],
        today: ['Checkbox + Radio migration', 'Pair with Priya on the DataTable lazy chunk'],
        blockers: ['Waiting on the alias naming confirmation (PRISM-1) before renaming CSS variables'],
      },
      rx: { '👍': 'mei priya' },
    });
    p('hana', '23h', 'Usability round 2 results: error states are much clearer (6/6 recovered without help). Toasts are still too short for screen readers — suggest a 6s minimum. Notes are in the spec 🙏', { rx: { '🙌': 'mei alex sofia' } });
    p('aisha', '20h', 'Growth will adopt Prism v4 in the trial flow first — it’s our biggest surface for the Prism adoption KR 📈', { rx: { '🙌': 'mei omar' } });
    p('priya', '9h', 'DataTable lazy chunk landed — **14KB → 7.6KB** on initial load 🎉', { rx: { '🎉': 'mei alex omar hana' } });
    p('alex', '4h', 'Checkbox + Radio migrated ✅ That’s 9/12 form components. [PR 1187](https://git.helix.co/web/prism/pull/1187)', { rx: { '🙌': 'mei priya' } });
    p('bot-projects', '2h30m', 'Task assigned', {
      card: { app: 'projects', title: 'Migrate DataTable to v4 tokens', subtitle: 'Assigned to Alex Rivera by Mei Tanaka · due in 6 days', to: '/projects/p/prj-prism', status: 'To do' },
    });
    p('omar', '1h5m', 'Heads-up: I’m out tomorrow afternoon (birthday lunch, apparently 🎂) — @priya has the Prism merge queue.', { rx: { '🎂': 'priya hana' } });
    p('hana', '35m', 'Toast timing (6s minimum) tested with VoiceOver + NVDA — both happy now 🎧');
    p('priya', '10m', '@alex the DataTable migration will touch the lazy chunk I just landed — want to pair tomorrow at 10:00 Lisbon / 14:00 Dubai? I can walk you through the resize logic.', { rx: { '👍': 'hana' } });
    pin('ch-proj-prism', plan, specCard);
  }

  /* ───────────────────────── #proj-mfa ───────────────────────── */
  {
    const f = conv('ch-proj-mfa', 'mfa');
    f('layla', '5d23h', lines(
      'Rollout status 📊',
      '- Pilot (IT + Eng leads): **100%**',
      '- Wave 1 (Dubai): **84%**',
      '- Wave 2 (London, Berlin, Singapore, remote): **61%**',
      '',
      'Company-wide: **78%**. Target: 100% by Nov 15.',
    ), { rx: { '🔐': 'ethan omar grace' } });
    const runbook = f('ethan', '5d6h', 'The enforcement-day runbook is ready for review 👇', { files: [RUNBOOK], rx: { '🙏': 'layla lucas' } });
    thread(runbook,
      ['layla', '5d5h', 'Great work. Can we add a rollback step if SSO errors spike above 2%?'],
      ['ethan', '5d4h', 'Added as step 7, with the exact IdP toggle 👍'],
      ['lucas', '5d3h', 'I’ll wire an SSO error-rate alert to the same dashboard.'],
    );
    const mailbox = f('grace', '3d22h', 'Finance question: our shared AP mailbox can’t use a passkey (it’s a shared account). Does it need an exception?');
    thread(mailbox,
      ['ethan', '3d21h', 'Shared mailboxes move to delegated access instead — everyone signs in with their own passkey. I’ll set it up with you.'],
      ['grace', '3d20h', 'Perfect, thank you!'],
    );
    const kiosks = f('mateo', '3d4h', 'Office kiosks and the meeting-room iPads can’t do passkeys. Exception or replace? 🤔');
    thread(kiosks,
      ['ethan', '3d3h', 'Kiosk accounts go into the exception policy (MFA-6) with device-bound certificates instead of passwords.'],
      ['mateo', '3d2h', 'Got it 👍'],
    );
    refs.mfa6 = f('ethan', '2d23h', 'Raised [MFA-6 · Approve enforcement exception policy](/projects/p/prj-mfa?task=t-m6) for @layla to approve. Scope: 14 legacy service accounts + kiosk devices, each with a named owner and a 90-day expiry.', { rx: { '👀': 'layla' } });
    f('bot-helpdesk', '2d5h', '📈 Enrolment milestone', {
      card: { app: 'helpdesk', title: 'Passkey enrolment passed 85%', subtitle: 'Helix-wide · 3 open enrolment tickets', to: '/helpdesk', status: 'On track' },
      rx: { '🎉': 'layla ethan' },
    });
    const mandatory = f('layla', '1d22h', 'Decision 🔐 **Passkeys mandatory from Dec 1.**', {
      decision: {
        title: 'Passkeys mandatory from Dec 1',
        context: 'The enrolment deadline stays Nov 15 (accounts without MFA are paused on Nov 16). From Dec 1, password sign-in is retired for Helix SSO; exceptions only via MFA-6.',
        decidedBy: 'u-layla',
        decidedAt: at('1d22h'),
        status: 'decided',
      },
      rx: { '🔐': 'ethan omar lucas grace', '👍': 'mateo' },
    });
    f('lucas', '1d2h', 'SSO error-rate alert is live: `sso_auth_error_ratio > 0.02 for 10m` → pages security on-call 📟', { rx: { '👍': 'ethan layla' } });
    f('ethan', '8h', 'Passkeys KR update 🎯', {
      card: { app: 'performance', title: 'Passkeys adoption · 88%', subtitle: 'Key result · Make Helix passwordless · target 100% by Nov 15', to: '/performance', status: 'At risk' },
      rx: { '💪': 'layla' },
    });
    const nudge = f('layla', '6h', '@omar Engineering still has **11 people** without a passkey — can you nudge your org this week? The list is on [MFA-2](/projects/p/prj-mfa?task=t-m2) 🙏', { rx: { '👍': 'omar' } });
    thread(nudge,
      ['omar', '5h40m', 'On it — pinging them individually today 👍'],
      ['lucas', '5h20m', 'I’m one of the 11 😅 Enrolling right now.'],
    );
    f('grace', '1h15m', 'Finance is at **100%** 🎉 Delegated access on the AP mailbox works great.', { rx: { '🎉': 'ethan' } });
    f('ethan', '30m', 'Exception policy updated with Grace’s delegated-access pattern — ready for your approval on MFA-6 whenever you have 10 minutes 🙏');
    pin('ch-proj-mfa', runbook, mandatory);
  }

  /* ───────────────────────── DMs ───────────────────────── */
  {
    const om = conv(DM_OMAR_MEI, 'om');
    om('mei', '3d5h', 'Hey! Do you have 15 minutes tomorrow for my Q4 check-in prep? I want to make sure the Prism impact story lands.');
    om('omar', '3d4h', 'Of course — 11:30 GST? Also, I’d love your take on Alex’s ramp-up. They’re doing great on the migration.');
    om('mei', '3d3h55m', '11:30 works 👍 And yes, Alex is fantastic — the focus-ring work was completely unprompted.');
    om('omar', '1d6h', 'Quick one: I’m off for 4 days in early December (Priya covering). Want to make sure the v4.1 plan doesn’t depend on me.');
    om('mei', '1d5h', 'All good — v4.1 is mostly docs + removing the legacy shim. Hana’s covering my leave too, so we’re symmetrical 😄');
    om('mei', '7h', 'Also — I requested your feedback on _Prism v4 rollout_ in Performance (due Friday). No rush, but I’d love it before my check-in 🙏');
    om('omar', '6h', 'Saw it, writing it this weekend. Fair warning: it’ll be glowing.', { rx: { '🥹': 'mei' } });
    om('mei', '20m', 'One more thing 🙈 can you confirm the engineering alias naming on [PRISM-1](/projects/p/prj-prism?task=t-p1) today? The shim question is the only open bit and I’d love to lock it before the freeze.');

    const oa = conv(DM_OMAR_ALEX, 'oa');
    oa('alex', '5d4h', 'Hi Omar! Quick check — for the Prism migration, should I target the `prism-v4` branch or main behind a flag?');
    oa('omar', '5d3h', '`prism-v4` for now — we merge to main at the token freeze. And welcome to the Prism squad, officially 🎉 Really glad you’re on this one.');
    oa('alex', '5d2h55m', 'Thank you! Excited to be here 😊');
    oa('omar', '2d58m', 'Shared the [Prism frontend kit](/drive/folder/fo-prism-fe) folder with you — editor access for 45 days. It has the token map, the Storybook conventions and Priya’s perf checklist.');
    oa('alex', '2d50m', 'Got it, thanks! The perf checklist is super useful.', { rx: { '🙌': 'omar' } });
    oa('alex', '36m', 'FYI I just requested edit access to the Prism spec so I can add engineering notes to the Button & Input sections — hope that’s ok!');
    oa('omar', '22m', 'Totally fine — Mei owns it and will approve. Meanwhile, could you review my PR for the `--hx-legacy-*` shim? It’s small but touches every component. If it looks clean, I’ll confirm the alias naming with Mei today 🙏 [PR 1192](https://git.helix.co/web/prism/pull/1192)');

    const le = conv(DM_LAYLA_ETHAN, 'le');
    le('ethan', '4d23h', 'Pen-test Q4 prelim is in: **0 critical, 1 high, 4 medium, 7 low**. The high is the `SameSite` cookie issue on admin — the fix is already in review.');
    le('layla', '4d22h', 'Good news overall. Can you get me a one-pager for Thursday’s exec sync? Severity, owner and ETA per finding.');
    le('ethan', '4d21h', 'Will do 👍');
    le('ethan', '2d21h', 'The one-pager is in the restricted pen-test folder. Mediums: 2 fixed, 2 in progress (rate limiting on password reset, verbose errors on the export API).');
    le('layla', '2d20h', 'Perfect, thank you. Let’s land the rate-limiting one before Dec 1 — password reset stops mattering after that, but not before 😄');
    le('layla', '1d5h', 'Read the MFA-6 draft — the scope looks right. Two asks: a named owner for every service account, and a hard 90-day expiry.');
    le('ethan', '1d4h', 'Both are already in v2 — sending it over shortly.');
    le('ethan', '50m', 'Retest results: the `SameSite` high is **closed** ✅ The tester confirmed it on every admin subdomain.');
    le('ethan', '20m', 'And the verbose-errors medium on the export API is fixed too — 3 of 4 mediums closed 🎉');

    const mh = conv(DM_MEI_HANA, 'mh');
    mh('hana', '4d6h', 'The synthesis board for the onboarding interviews is ready 🟨🟦 14 interviews → 5 themes. Want to jam on it tomorrow?');
    mh('mei', '4d5h', 'Yes!! 10:00 SGT? I’ll bring kaya toast.');
    mh('hana', '4d4h56m', 'Deal 🍞');
    mh('mei', '3d2h', 'That session was so good. Theme 3 (_“I don’t know what good looks like”_) is the one — let’s make it the north star for the empty states.');
    mh('hana', '3d1h', 'Agreed. I’ll pull 3 clips for crit — the one with the Atlas admin is gold.');
    mh('mei', '1d3h', 'Could you cover the Prism crit while I’m on leave in December? You know the research better than anyone.');
    mh('hana', '1d2h', 'Of course 💛 I’ll shadow Thursday’s crit to get ready.', { rx: { '💛': 'mei' } });
    mh('hana', '55m', 'Clips are uploaded to the research repo, tagged `onboarding-north-star` — 3 clips, 4 minutes total.');
    mh('hana', '14m', 'Also… the nav-rail participants keep asking about the collapsed state 😅 Can we align on the test script before my 4pm? (pinged you in #design-crit too)');

    const op = conv(DM_OMAR_PRIYA, 'op');
    op('priya', '5d21h', 'Got 10 minutes? Planner v2 is faster on 46 of the top 50 queries, but one regresses 3× — `audit_events` with a nasty join order.');
    op('omar', '5d20h', 'Ouch. Can we pin the join order for that one query while you dig?');
    op('priya', '5d19h55m', 'That’s my plan — I don’t want to block the canary on one query.');
    op('priya', '2d6h', lines(
      'Found it 🎯 The cardinality estimate on `audit_events.actor_id` was off by 200× because of one skewed tenant. Extended stats fixed it:',
      '```sql',
      'CREATE STATISTICS audit_actor_tenant (dependencies, ndistinct)',
      '  ON tenant_id, actor_id FROM audit_events;',
      'ANALYZE audit_events;',
      '```',
    ));
    op('omar', '2d5h', 'Beautiful. That’s going in your Demo Day talk, right? 😄');
    op('priya', '2d4h57m', 'Only if I get to show the flame graph 🔥');
    op('omar', '3h', 'Just shared some feedback with you in Performance — the planner rewrite unblocked three teams. Thank you, genuinely 🙏');
    op('priya', '2h40m', '🥹 Thank you, Omar. That means a lot.');
    op('priya', '2h38m', 'Also: happy to cover during your December leave — send me the merge-queue rules whenever.', { rx: { '🙏': 'omar' } });

    const lo = conv(DM_LAYLA_OMAR, 'lo');
    lo('layla', '4d4h', lines(
      '1:1 agenda for Thursday — add anything 👇',
      '- Q1 headcount (your ask of 4)',
      '- Planner v2 rollout risk',
      '- Your December leave: coverage plan',
      '- Career: Priya’s principal promo case',
    ));
    lo('omar', '4d3h', 'Adding: Kwame’s first month has been excellent — I’d like to discuss a faster ramp to on-call.');
    lo('layla', '4d2h56m', 'Love that. Added ✅');
    lo('layla', '2d2h', 'Approved your December time off, by the way 🎄 Priya covering is perfect.');
    lo('omar', '2d1h', 'Thank you! I’ll make sure she has the release calendar.');
    lo('layla', '6h5m', 'Thanks for jumping on MFA-2 so fast 🙏 If any of the 11 are blocked on hardware, send them to Ethan — we have YubiKeys in stock.');
    lo('omar', '5h10m', 'Will do. Lucas is already enrolling 😄 I’ll get the rest done by Thursday.', { rx: { '🙌': 'layla' } });

    const am = conv(DM_ALEX_MEI, 'am');
    am('alex', '4d23h', 'Hi Mei! Quick handoff question on Select — should the chevron rotate on open, or swap icons?');
    am('mei', '4d22h', 'Rotate! 180°, 160ms, standard easing. It’s in the motion section 🙂');
    am('alex', '4d21h57m', 'Perfect, thanks!');
    am('alex', '3d6h', 'For the error state on Input — is the red border enough, or do we need the icon too? Thinking about colour-blind users.');
    am('mei', '3d5h', 'Great call — always icon + text, never colour alone. I’ll add it to the spec. Thank you for catching that 💜');
    am('alex', '1d21h', 'Is the `ghost` hover `violet-50` or `violet-100` in dark mode? The spec has both 😅');
    am('mei', '1d20h', '`violet-100` at 12% opacity in dark mode — fixing the typo now. Thanks!');
    am('alex', '38m', 'I sent an access request for the spec — I’d like to add engineering notes to the Button & Input sections for the token migration. Whenever you get a chance 🙏');

    const sf = conv(DM_SARA_FATIMA, 'sf');
    sf('fatima', '5d2h', 'Salma signed! 🎉 Start date confirmed — I’ll hand off to onboarding today.');
    sf('sara', '5d1h', 'Amazing work, Fatima. That was a tough close. Let’s make sure Mei is set as her buddy.');
    sf('fatima', '5d55m', 'Already done 💛');
    sf('sara', '2d4h', 'Could you take the benefits Q&A tomorrow, 14:00–15:00? I have comp review prep.');
    sf('fatima', '2d3h', 'Of course! Send me the FAQ doc?');
    sf('sara', '2d2h58m', 'Sent! Thank you 🙏');
    sf('fatima', '1d2h', 'I’d love to take two study days next week for my CIPD exam — I’ve submitted the request in HR Portal.');
    sf('sara', '1d1h', 'Approving now. You’ve got this! 📚', { rx: { '🙏': 'fatima' } });
    sf('fatima', '3h', 'Also — your work anniversary is this week?! 🎈 Layla started a card in #celebrations 😄');
    sf('sara', '2h50m', 'Haha, I saw 🥹 You’re all too kind.');

    const ok = conv(DM_OMAR_KWAME, 'ok');
    ok('omar', '5d22h', 'Hey Kwame — how’s week 4 going? Anything blocking you?');
    ok('kwame', '5d21h', 'Going well! The `usage_daily` backfill is my big one this week. Only blocker: I’m still waiting on prod read access for BigQuery.');
    ok('omar', '5d20h55m', 'Approving it now — should land within the hour 🙏');
    ok('kwame', '3d3h', 'Backfill done and validated 🎉 Thanks for unblocking the access so quickly.');
    ok('omar', '3d2h', 'Great work. For your 30-day check-in, could you draft 2–3 onboarding OKRs? Nova can help you get started.');
    ok('kwame', '1d20h', 'Drafted three OKRs — data freshness SLOs, dbt test coverage and on-call readiness. They’re in Performance.');
    ok('omar', '1d19h', 'These are great — I’ll sign off the Day-30 milestone once you’ve walked me through them 👏');
    ok('omar', '2h5m', 'Quick reminder: the IP agreement in HR Portal is due today ([ONB-6](/projects/p/prj-onb-kwame?task=t-o6)) 📝');
    ok('kwame', '13m', 'Signing it right after the huddle 🙏');
  }

  /* ───────────────────────── group: Prism launch squad ───────────────────────── */
  {
    const sq = conv(GROUP_SQUAD, 'squad');
    sq('mei', '1d3h', 'Made this so we stop cluttering #proj-prism with launch logistics 😄 Plan: tokens freeze Thursday → v4.0 tag → reveal at Demo Day 🎬 → blog + video the morning after.', { rx: { '🚀': 'omar priya alex' } });
    sq('priya', '1d2h', 'Love it. I’ll own the perf section of the blog.');
    sq('alex', '1d1h56m', 'I can write the migration guide for teams adopting v4 🙋');
    sq('omar', '1d1h', 'Perfect split. I’ll do the release notes + the exec summary.');
    const src = byId.get(refs.synthesis ?? '');
    sq('mei', '23h', 'Forwarding Hana’s synthesis so @alex has it too — points 2 and 3 are in your area 💜', {
      ...(src ? { forwarded: { messageId: src.id, convId: src.convId, authorId: src.authorId, at: src.at, text: src.text } } : {}),
      rx: { '👀': 'alex' },
    });
    sq('mei', '5h', lines(
      'Launch checklist v1 ✅',
      '1. Contrast audit 42/42 (5 to go)',
      '2. Alias naming confirmed — @omar 👀',
      '3. Migration guide draft — Alex',
      '4. Perf numbers — Priya',
      '5. Video + blog — Sofia',
    ));
    sq('alex', '4h40m', 'The migration guide is ~60% done — the Button/Input/Select sections are ready for review.', { rx: { '🙌': 'mei' } });
    sq('priya', '3h20m', 'Perf numbers: median bundle −11%, DataTable −46% on initial load. Charts coming 📊', { rx: { '🔥': 'mei omar alex' } });
    sq('omar', '2h10m', '👀 Noted on the alias naming — reviewing the shim PR with Alex today, then I’ll confirm.');
    sq('mei', '1h30m', '🙏 Thank you! Also: launch-day cake? Asking for a birthday person 🎂', { rx: { '😂': 'priya alex' } });
    sq('priya', '1h10m', 'Cake is non-negotiable.');
    sq('alex', '40m', 'I’ll be there virtually with a pastel de nata in hand 🇵🇹');
    sq('priya', '18m', 'The migration guide looks great, Alex — left 3 small comments 💬', { rx: { '🙏': 'alex' } });
  }

  /* ───────────────────────── Coffee Roulette DM ───────────────────────── */
  {
    const cf = conv(DM_COFFEE, 'coffee');
    cf('system', '6d', '☕ You’ve been matched for **Coffee Roulette**! Here’s a conversation starter to get you going 👇', {
      coffee: { userIds: ['u-hana', 'u-daniel'], prompt: COFFEE_PROMPTS[0] },
    });
    cf('daniel', '5d23h', 'Hi Hana! 👋 Finance meets research — love it. Does Thursday 9:00 London / 17:00 Singapore work for a virtual coffee?');
    cf('hana', '5d22h', 'Perfect! I’ll bring my matcha, you bring your strongest builder’s tea ☕');
    cf('hana', '3d1h', 'That was so fun! Still thinking about your “every spreadsheet tells a story” line 📊');
    cf('daniel', '3d', 'Ha! And I’m stealing your “what did you do right before this?” interview trick for budget reviews. Same time next month?');
    cf('hana', '2d23h30m', 'Deal 🤝', { rx: { '🙌': 'daniel' } });
  }

  /* ───────────────────────── app conversations ───────────────────────── */
  {
    const bpOmar = conv(APP_PROJECTS_OMAR, 'bp-omar');
    bpOmar('bot-projects', '1d2h', 'A task in **Prism v4 Design System** is overdue', {
      card: { app: 'projects', title: 'PRISM-3 · Token contrast audit', subtitle: 'Mei Tanaka · overdue · urgent', to: '/projects/p/prj-prism?task=t-p3', status: 'Overdue' },
    });
    bpOmar('bot-projects', '6h', 'Layla Haddad mentioned you', {
      card: { app: 'projects', title: 'MFA-2 · Nudge the remaining 11 in Engineering', subtitle: '“Can Engineering nudge the remaining 11 in your org this week?”', to: '/projects/p/prj-mfa?task=t-m2', status: 'Mentioned' },
    });
    bpOmar('bot-projects', '3h', 'Your approval is needed', {
      card: { app: 'projects', title: 'Approve Kwame’s 30-day milestone', subtitle: 'Kwame · 30-60-90 Onboarding · Day-30 goals ready for sign-off', to: '/projects/p/prj-onb-kwame', status: 'Needs approval' },
    });

    const bpMei = conv(APP_PROJECTS_MEI, 'bp-mei');
    bpMei('bot-projects', '2d3h', 'Heads-up: a task is due soon', {
      card: { app: 'projects', title: 'PRISM-3 · Token contrast audit', subtitle: 'Prism v4 Design System · urgent · 37/42 components pass', to: '/projects/p/prj-prism?task=t-p3', status: 'Due soon' },
    });
    bpMei('bot-projects', '2h', 'Reminder: this task is overdue', {
      card: { app: 'projects', title: 'PRISM-3 · Token contrast audit', subtitle: 'Was due 2 days ago · urgent', to: '/projects/p/prj-prism?task=t-p3', status: 'Overdue' },
    });

    const bpAlex = conv(APP_PROJECTS_ALEX, 'bp-alex');
    bpAlex('bot-projects', '5d4h59m', 'Task completed 🎉', {
      card: { app: 'projects', title: 'Migrate Button & Input to v4 tokens', subtitle: 'Prism v4 Design System · completed by you', to: '/projects/p/prj-prism', status: 'Done' },
    });
    bpAlex('bot-projects', '2h30m', 'Mei Tanaka assigned you a task', {
      card: { app: 'projects', title: 'Migrate DataTable to v4 tokens', subtitle: 'Prism v4 Design System · due in 6 days', to: '/projects/p/prj-prism', status: 'To do' },
    });

    const bhMei = conv(APP_HELPDESK_MEI, 'bh-mei');
    bhMei('bot-helpdesk', '1d6h', 'We received your ticket', {
      card: { app: 'helpdesk', title: 'Wacom tablet driver blocked by device policy', subtitle: 'Hardware & peripherals · normal priority', to: '/helpdesk/tickets', status: 'Open' },
    });
    bhMei('bot-helpdesk', '3h', 'Your ticket is waiting on you', {
      card: { app: 'helpdesk', title: 'Wacom tablet driver blocked by device policy', subtitle: 'Ethan asked: which driver version does your Intuos Pro need?', to: '/helpdesk/tickets', status: 'Waiting on you' },
    });

    const bhLayla = conv(APP_HELPDESK_LAYLA, 'bh-layla');
    bhLayla('bot-helpdesk', '1d8h', 'Your weekly IT digest', {
      card: { app: 'helpdesk', title: 'Weekly digest · 42 tickets resolved', subtitle: 'Median first response 18 min · CSAT 4.8/5', to: '/helpdesk', status: 'Weekly' },
    });
    bhLayla('bot-helpdesk', '7h', 'Incident opened', {
      card: { app: 'helpdesk', title: 'VPN degraded in Singapore', subtitle: 'Minor · packet loss on the SG gateway · 23 people affected', to: '/helpdesk/status', status: 'Investigating' },
    });
    bhLayla('bot-helpdesk', '25m', 'Incident update', {
      card: { app: 'helpdesk', title: 'VPN degraded in Singapore', subtitle: 'Provider confirmed a faulty line card at the SG POP · fix ETA ~2h', to: '/helpdesk/status', status: 'Identified' },
    });

    const bhOmar = conv(APP_HELPDESK_OMAR, 'bh-omar');
    bhOmar('bot-helpdesk', '3d5h', 'We received your ticket', {
      card: { app: 'helpdesk', title: 'VPN split tunnel drops staging routes', subtitle: 'Network & VPN · normal priority', to: '/helpdesk/tickets', status: 'Open' },
    });
    bhOmar('bot-helpdesk', '1d3h', 'Ticket update', {
      card: { app: 'helpdesk', title: 'VPN split tunnel drops staging routes', subtitle: 'Ethan reproduced it on macOS 15 — testing a client config fix', to: '/helpdesk/tickets', status: 'Waiting on IT' },
    });
    bhOmar('bot-helpdesk', '4h20m', 'Approval needed', {
      card: { app: 'helpdesk', title: 'Hana Park requested a Keychron Q1 keyboard', subtitle: 'IT catalog · Peripherals · USD 210 · needs your approval', to: '/helpdesk/requests?tab=approvals', status: 'Needs approval' },
    });

    const bdAlex = conv(APP_DRIVE_ALEX, 'bd-alex');
    bdAlex('bot-drive', '2d1h', 'Omar Khalid shared a folder with you', {
      card: { app: 'drive', title: 'Prism frontend kit', subtitle: 'Folder · editor access for 45 days', to: '/drive/folder/fo-prism-fe', status: 'Shared' },
    });
    bdAlex('bot-drive', '40m', 'Your access request was sent', {
      card: { app: 'drive', title: 'Prism v4 Component Spec', subtitle: 'Editor access requested · pending with Mei Tanaka', to: '/drive/file/df-prism-spec', status: 'Pending' },
    });

    const bdOmar = conv(APP_DRIVE_OMAR, 'bd-omar');
    bdOmar('bot-drive', '2d2h', 'One of your files is getting attention', {
      card: { app: 'drive', title: 'Q4 Roadmap', subtitle: 'Slides · viewed by 12 people this week', to: '/drive/file/df-q4-roadmap', status: 'Trending' },
    });
    bdOmar('bot-drive', '5h', 'Mei Tanaka commented on a file', {
      card: { app: 'drive', title: 'Prism v4 Component Spec', subtitle: '§4 Engineering aliases — “Omar, does the --hx- prefix work with the legacy shim?”', to: '/drive/file/df-prism-spec', status: 'Comment' },
    });
  }

  /* ───────────────────────── finalise messages & pins ───────────────────────── */
  for (const c of conversations) c.pinnedIds = pins[c.id] ?? [];
  messages.sort((a, b) => a.at - b.at);

  /* ───────────────────────── per-person state ───────────────────────── */
  /** Messages shown in the conversation timeline: top-level + replies also sent to the conversation. */
  const visible = (convId: string) => messages.filter((m) => m.convId === convId && (!m.parentId || m.broadcast));
  const newestAt = new Map<string, number>();
  const latestReply = new Map<string, number>();
  const participants = new Map<string, Set<string>>();
  for (const m of messages) {
    if (!m.parentId || m.broadcast) newestAt.set(m.convId, Math.max(newestAt.get(m.convId) ?? 0, m.at));
    if (!m.parentId) continue;
    latestReply.set(m.parentId, Math.max(latestReply.get(m.parentId) ?? 0, m.at));
    const who = participants.get(m.parentId) ?? new Set([byId.get(m.parentId)?.authorId ?? '']);
    who.add(m.authorId);
    participants.set(m.parentId, who);
  }

  const PERSONA_EMOJI: Record<string, string[]> = {
    'u-omar': ['🚀', '🔥', '👀', '🙌', '🧊'],
    'u-mei': ['💠', '✨', '😍', '🙏', '🎨'],
    'u-layla': ['🔐', '👍', '🙏', '👀', '🛟'],
    'u-alex': ['🙏', '🎉', '👀', '♿'],
    'u-sara': ['💜', '🎉', '🙌', '✨', '🥹'],
    'u-daniel': ['👍', '📈', '😅', '🙏'],
  };
  const DEFAULT_EMOJI = ['👍', '🎉', '❤️', '😂', '🙏', '🔥', '👀', '🙌'];
  const people: Record<string, UserChatState> = {};
  for (const u of SEED_USERS) {
    const lastRead: Record<string, number> = {};
    for (const c of conversations) if (c.memberIds.includes(u.id)) lastRead[c.id] = newestAt.get(c.id) ?? c.createdAt;
    // Threads the person took part in are read up to their latest reply.
    const threadRead: Record<string, number> = {};
    for (const [parentId, who] of participants) if (who.has(u.id)) threadRead[parentId] = latestReply.get(parentId) ?? 0;
    const offset = hash(`emoji:${u.id}`) % DEFAULT_EMOJI.length;
    people[u.id] = {
      lastRead,
      threadRead,
      starred: [],
      muted: [],
      hidden: [],
      saved: [],
      drafts: {},
      emojiRecents: PERSONA_EMOJI[u.id] ?? [...DEFAULT_EMOJI.slice(offset), ...DEFAULT_EMOJI.slice(0, offset)].slice(0, 5),
      activitySeenAt: u.persona ? now - 6 * HOUR : now,
      notify: {},
      coffeeOptIn: u.id !== 'u-layla' && u.id !== 'u-alex',
    };
  }

  /** Leave the newest `n` timeline messages written by others unread. */
  const markUnread = (userId: string, convId: string, n: number) => {
    const nth = visible(convId)
      .filter((m) => m.authorId !== userId)
      .sort((a, b) => b.at - a.at)[n - 1];
    const state = people[userId];
    if (state && nth) state.lastRead[convId] = nth.at - 1;
  };
  const UNREAD: [userId: string, convId: string, n: number][] = [
    ['u-omar', 'ch-ship-it', 3],
    ['u-omar', 'ch-eng-platform', 4],
    ['u-omar', DM_OMAR_MEI, 1],
    ['u-omar', 'ch-general', 2],
    ['u-omar', 'ch-celebrations', 2],
    ['u-mei', 'ch-design-crit', 2],
    ['u-mei', DM_MEI_HANA, 2],
    ['u-mei', 'ch-proj-prism', 3],
    ['u-mei', 'ch-general', 2],
    ['u-mei', 'ch-kudos', 1],
    ['u-layla', 'ch-it-help', 3],
    ['u-layla', DM_LAYLA_ETHAN, 2],
    ['u-layla', 'ch-exec-sync', 2],
    ['u-layla', 'ch-proj-mfa', 2],
    ['u-layla', APP_HELPDESK_LAYLA, 1],
    ['u-alex', 'ch-proj-prism', 3],
    ['u-alex', DM_OMAR_ALEX, 1],
    ['u-alex', 'ch-general', 2],
    ['u-alex', APP_DRIVE_ALEX, 1],
  ];
  for (const [userId, convId, n] of UNREAD) markUnread(userId, convId, n);

  const persona = (id: string, patch: Partial<UserChatState>) => {
    const state = people[id];
    if (state) Object.assign(state, patch);
  };
  persona('u-omar', {
    starred: ['ch-ship-it', 'ch-eng-platform', DM_OMAR_MEI],
    muted: ['ch-dubai-office'],
    drafts: { 'ch-design-crit': 'Love the motion study — can we try ' },
    saved: [
      { messageId: refs.aliasAsk, savedAt: at('1d18h'), remindAt: now + 40 * MIN },
      { messageId: refs.postmortem, savedAt: at('4d5h') },
    ],
    lastConvId: 'ch-ship-it',
  });
  persona('u-mei', {
    starred: ['ch-design-crit', 'ch-proj-prism'],
    saved: [{ messageId: refs.synthesis, savedAt: at('1d5h') }],
    lastConvId: 'ch-design-crit',
  });
  persona('u-layla', {
    starred: ['ch-it-help', 'ch-proj-mfa', 'ch-exec-sync'],
    saved: [{ messageId: refs.mfa6, savedAt: at('2d22h'), remindAt: now + 2 * HOUR }],
    lastConvId: 'ch-it-help',
  });
  persona('u-alex', { starred: ['ch-proj-prism'], lastConvId: 'ch-proj-prism' });
  // Ethan's newest reply on Omar's “Q1 reliability bets” thread is still unread for Omar.
  const q1Replies = messages.filter((m) => m.parentId === refs.q1Bets);
  if (people['u-omar'] && q1Replies.length > 1) people['u-omar'].threadRead[refs.q1Bets] = q1Replies[q1Replies.length - 2].at;

  /* ───────────────────────── engagement stats ───────────────────────── */
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, k) => from + k);
  const daysBack = (list: number[]) => [...new Set(list.map((i) => dateKey(now - i * DAY)))];
  const FIXED_STATS: Record<string, Omit<EngagementStats, 'activeDays'> & { days: number[] }> = {
    // Omar: a 12-day streak ending yesterday — today not yet active.
    'u-omar': { days: range(1, 12), messages: 342, reactions: 510, polls: 6, kudosGiven: 14, huddles: 23, sparks: 9, coffees: 3, cardsSigned: 5 },
    'u-mei': { days: range(1, 7), messages: 287, reactions: 446, polls: 5, kudosGiven: 11, huddles: 14, sparks: 7, coffees: 2, cardsSigned: 4 },
    'u-layla': { days: range(1, 4), messages: 251, reactions: 302, polls: 3, kudosGiven: 9, huddles: 19, sparks: 4, coffees: 0, cardsSigned: 6 },
    'u-alex': { days: [1, 2, 4, 5, 6], messages: 46, reactions: 71, polls: 0, kudosGiven: 1, huddles: 2, sparks: 2, coffees: 0, cardsSigned: 0 },
    'u-sara': { days: range(1, 20), messages: 405, reactions: 690, polls: 8, kudosGiven: 22, huddles: 12, sparks: 18, coffees: 4, cardsSigned: 14 },
  };
  const stats: Record<string, EngagementStats> = {};
  for (const u of SEED_USERS) {
    const fixed = FIXED_STATS[u.id];
    if (fixed) {
      const { days, ...counters } = fixed;
      stats[u.id] = { activeDays: daysBack(days), ...counters };
      continue;
    }
    const pick = (salt: string, min: number, max: number) => min + (hash(`${salt}:${u.id}`) % (max - min + 1));
    stats[u.id] = {
      activeDays: u.active ? daysBack(range(1, pick('streak', 2, 9))) : [],
      messages: pick('messages', 60, 280),
      reactions: pick('reactions', 90, 420),
      polls: pick('polls', 0, 4),
      kudosGiven: pick('kudos', 1, 12),
      huddles: pick('huddles', 1, 16),
      sparks: pick('sparks', 1, 12),
      coffees: pick('coffees', 0, 3),
      cardsSigned: pick('cards', 1, 9),
    };
  }

  /* ───────────────────────── team vibes (anonymous moods) ───────────────────────── */
  const voters = SEED_USERS.filter((u) => u.active && !u.roleIds.includes('contractor')).map((u) => u.id);
  const moodFor = (i: number, id: string): Mood => {
    const r = hash(`mood:${i}:${id}`) % 100;
    if (i === 5) return r < 12 ? 1 : r < 40 ? 2 : r < 78 ? 3 : 4; // the mid-week dip
    if (i === 4 || i === 6) return r < 6 ? 2 : r < 45 ? 3 : r < 85 ? 4 : 5;
    return r < 4 ? 2 : r < 26 ? 3 : r < 70 ? 4 : 5;
  };
  const shuffled = (day: number, pool: string[]) => [...pool].sort((a, b) => hash(`vote:${day}:${a}`) - hash(`vote:${day}:${b}`));
  const vibes: Record<string, Record<string, Mood>> = {};
  for (let i = 1; i <= 14; i++) {
    const count = 9 + (hash(`vibes:${i}`) % 6);
    vibes[dateKey(now - i * DAY)] = Object.fromEntries(shuffled(i, voters).slice(0, count).map((id) => [id, moodFor(i, id)]));
  }
  const notYetVoted = ['u-omar', 'u-mei', 'u-layla', 'u-alex'];
  vibes[dateKey(now)] = Object.fromEntries(
    shuffled(0, voters.filter((id) => !notYetVoted.includes(id)))
      .slice(0, 6)
      .map((id) => [id, moodFor(0, id)]),
  );

  /* ───────────────────────── scheduled, huddles, coffee ───────────────────────── */
  const tomorrowAt9 = new Date(now);
  tomorrowAt9.setDate(tomorrowAt9.getDate() + 1);
  tomorrowAt9.setHours(9, 0, 0, 0);

  return {
    conversations,
    messages,
    people,
    stats,
    huddles: {
      'ch-eng-platform': { convId: 'ch-eng-platform', startedAt: now - 14 * MIN, startedBy: 'u-priya', participantIds: ['u-priya', 'u-lucas', 'u-kwame'] },
    },
    scheduled: [
      {
        id: 'sch-1',
        convId: 'ch-eng-platform',
        authorId: 'u-omar',
        text: 'Reminder: freeze window starts at 18:00 — please land risky changes before then 🙏',
        deliverAt: tomorrowAt9.getTime(),
        createdAt: now - 2 * HOUR,
      },
    ],
    vibes,
    coffee: { matches: [{ id: 'cm-1', userIds: ['u-hana', 'u-daniel'], at: now - 6 * DAY, convId: DM_COFFEE }] },
  };
}
