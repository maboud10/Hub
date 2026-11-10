/**
 * Nova — Pulse Chat's local, deterministic AI teammate (pure).
 * Extractive summaries over real messages, catch-up digests, thread recaps, huddle scripts & recaps,
 * smart replies and answers for the Nova DM. Everything is computed from store data — no canned text.
 */
import { mentions } from './markdown';
import { detectIntent } from './engine';
import { parseWhen } from './slash';
import type { ChatMessage, Conversation } from './types';

export interface NovaCtx {
  meId: string;
  meHandle?: string;
  now: number;
  userName: (id: string) => string;
  plain: (m: ChatMessage) => string;
  convLabel: (convId: string) => string;
  replyCount: (messageId: string) => number;
}

const KEY = /\b(ship|shipped|launch|launched|release|decid|decision|blocker|blocked|deadline|today|tomorrow|eta|incident|resolved|merged|freeze|rollout|approve|approval|urgent|please|can you|could you|need)\w*/i;
const ASK = /\b(can you|could you|would you|please|need you|any chance|pls)\b/i;
const STOP = new Set(
  'the a an and or but if then than that this these those for from with without into onto over under about above after before again also just very really still more most less such some any each every both all can could would should will shall may might must have has had having do does did doing be is are was were been being it its it’s i me my we our you your they them their he she his her him who whom what which when where why how not no yes so too of on in at to by as up out off here there now new get got let lets let’s okay ok thanks thank team today tomorrow yesterday week time going gonna sure great good nice love like make made one two three back first next last way much many lot something anything everyone someone anyone need want know think see look looks looking going still well yeah'.split(
    ' ',
  ),
);

const first = (n: string) => n.split(' ')[0];
const clip = (s: string, n = 110) => {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), n - 18)).replace(/[,;:.\s]+$/, '')}…`;
};
const firstSentence = (s: string) => {
  const m = /^(.{12,}?[.!?])(\s|$)/.exec(s.trim());
  return m ? m[1] : s.trim();
};
const reactionCount = (m: ChatMessage) => Object.values(m.reactions).reduce((a, u) => a + u.length, 0);

export function scoreMessage(m: ChatMessage, ctx: NovaCtx): number {
  if (m.system || m.deleted) return -10;
  const text = ctx.plain(m);
  let s = Math.min(text.length, 220) / 40;
  s += reactionCount(m) * 1.4 + ctx.replyCount(m.id) * 1.8;
  if (m.poll) s += 4;
  if (m.decision) s += 6;
  if (m.kudos) s += 3;
  if (m.card) s += 2;
  if (m.huddle) s += 4;
  if (m.standup) s += 1.5;
  if (m.celebration) s += 2;
  if (KEY.test(text)) s += 3;
  if (mentions(m.text, ctx.meHandle, false)) s += 5;
  return s;
}

/** One-line description of a message for digests. */
export function describe(m: ChatMessage, ctx: NovaCtx): string {
  const who = `**${first(ctx.userName(m.authorId))}**`;
  if (m.poll) return `${who} opened a poll: “${clip(m.poll.question, 80)}”`;
  if (m.decision) return `Decision: **${clip(m.decision.title, 80)}** (${first(ctx.userName(m.decision.decidedBy))})`;
  if (m.kudos) return `${who} sent kudos to **${first(ctx.userName(m.kudos.toId))}** — “${clip(ctx.plain(m), 70)}”`;
  if (m.huddle) return `Huddle recap: ${m.huddle.keyPoints.length} key points, ${m.huddle.actionItems.length} action items`;
  if (m.standup) return `${who} posted a standup${m.standup.blockers.length ? ` (${m.standup.blockers.length} blocker${m.standup.blockers.length > 1 ? 's' : ''})` : ''}`;
  if (m.celebration) return `${who} started a card for **${first(ctx.userName(m.celebration.userId))}**’s ${m.celebration.type === 'anniversary' ? 'work anniversary' : m.celebration.type}`;
  if (m.voice) return `${who} sent a voice note${m.voice.transcript ? `: “${clip(m.voice.transcript, 70)}”` : ''}`;
  if (m.card) return `${who}: ${clip(m.card.title, 70)}${m.card.status ? ` · ${m.card.status}` : ''}`;
  const text = ctx.plain(m);
  if (!text && (m.attachments?.length || m.files?.length)) return `${who} shared ${m.files?.[0]?.name ?? m.attachments?.[0]?.name ?? 'a file'}`;
  return `${who}: ${clip(firstSentence(text))}`;
}

export function topicsOf(messages: ChatMessage[], ctx: NovaCtx, names: string[] = [], limit = 3): string[] {
  const counts = new Map<string, number>();
  const nameSet = new Set(names.map((n) => n.toLowerCase()));
  for (const m of messages) {
    const words = ctx
      .plain(m)
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, ' ')
      .match(/[\p{L}][\p{L}\p{N}-]{3,}/gu);
    if (!words) continue;
    for (const w of new Set(words)) {
      if (STOP.has(w) || nameSet.has(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([w]) => w);
}

export interface DigestLine {
  messageId: string;
  convId: string;
  line: string;
}

export interface NovaDigest {
  count: number;
  people: string[];
  topics: string[];
  highlights: DigestLine[];
  mentions: DigestLine[];
  asks: DigestLine[];
  decisions: DigestLine[];
  polls: (DigestLine & { voted: boolean })[];
}

/** Extractive digest of a set of messages (e.g. unread ones). */
export function digest(messages: ChatMessage[], ctx: NovaCtx, maxHighlights = 4): NovaDigest {
  const live = messages.filter((m) => !m.system && !m.deleted && m.authorId !== ctx.meId);
  const byAuthor = new Map<string, number>();
  for (const m of live) byAuthor.set(m.authorId, (byAuthor.get(m.authorId) ?? 0) + 1);
  const people = [...byAuthor.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => ctx.userName(id));
  const used = new Set<string>();
  const line = (m: ChatMessage): DigestLine => ({ messageId: m.id, convId: m.convId, line: describe(m, ctx) });

  const mentionsMe = live.filter((m) => mentions(m.text, ctx.meHandle, false));
  mentionsMe.forEach((m) => used.add(m.id));
  const asks = live.filter((m) => !used.has(m.id) && ASK.test(ctx.plain(m)) && (mentions(m.text, ctx.meHandle) || /^dm-/.test(m.convId)));
  asks.forEach((m) => used.add(m.id));
  const decisions = live.filter((m) => m.decision);
  decisions.forEach((m) => used.add(m.id));
  const polls = live.filter((m) => m.poll && !m.poll.closed);
  polls.forEach((m) => used.add(m.id));
  const highlights = live
    .filter((m) => !used.has(m.id))
    .map((m) => ({ m, s: scoreMessage(m, ctx) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, maxHighlights)
    .sort((a, b) => a.m.at - b.m.at)
    .map(({ m }) => line(m));

  return {
    count: live.length,
    people,
    topics: topicsOf(live, ctx, people.flatMap((p) => p.split(' '))),
    highlights,
    mentions: mentionsMe.map(line),
    asks: asks.map(line),
    decisions: decisions.map(line),
    polls: polls.map((m) => ({ ...line(m), voted: Object.values(m.poll!.votes).some((v) => v.includes(ctx.meId)) })),
  };
}

const listNames = (names: string[]) => {
  const f = names.map(first);
  if (f.length <= 1) return f.join('');
  if (f.length === 2) return `${f[0]} and ${f[1]}`;
  if (f.length === 3) return `${f[0]}, ${f[1]} and ${f[2]}`;
  return `${f[0]}, ${f[1]} and ${f.length - 2} others`;
};

/** Markdown for a digest. `link` builds an in-app route for a line (omit for plain bullets). */
export function digestMarkdown(d: NovaDigest, link?: (l: DigestLine) => string): string {
  if (!d.count) return 'You’re all caught up — nothing new here. ✨';
  const out: string[] = [];
  out.push(`**${d.count} new message${d.count === 1 ? '' : 's'}** from ${listNames(d.people)}${d.topics.length ? ` — mostly about _${d.topics.join(', ')}_` : ''}.`);
  const bullet = (l: DigestLine, prefix = '') => `- ${prefix}${l.line}${link ? ` · [jump](${link(l)})` : ''}`;
  if (d.mentions.length) out.push(...d.mentions.slice(0, 3).map((l) => bullet(l, 'Mentioned you — ')));
  if (d.asks.length) out.push(...d.asks.slice(0, 2).map((l) => bullet(l, 'Needs you — ')));
  if (d.decisions.length) out.push(...d.decisions.slice(0, 2).map((l) => bullet(l)));
  if (d.polls.length) out.push(...d.polls.slice(0, 2).map((p) => `${bullet(p)}${p.voted ? '' : ' — _you haven’t voted_'}`));
  out.push(...d.highlights.map((l) => bullet(l)));
  return out.join('\n');
}

/** Recap of a thread. */
export function threadRecap(parent: ChatMessage, replies: ChatMessage[], ctx: NovaCtx): string {
  const live = replies.filter((r) => !r.deleted);
  if (!live.length) return 'No replies yet — nothing to summarize.';
  const people = [...new Set(live.map((r) => r.authorId))].map(ctx.userName);
  const out = [`**${live.length} repl${live.length === 1 ? 'y' : 'ies'}** from ${listNames(people)}.`];
  out.push(`- Started by **${first(ctx.userName(parent.authorId))}**: ${clip(firstSentence(ctx.plain(parent)) || describe(parent, ctx), 120)}`);
  const commits = live.filter((r) => /\b(i['’]ll|i will|we['’]ll|let['’]?s|agreed|decided|going with|will do|on it|next step|ship it)\b/i.test(ctx.plain(r)));
  for (const c of commits.slice(-2)) out.push(`- Next step — **${first(ctx.userName(c.authorId))}**: ${clip(ctx.plain(c), 110)}`);
  const lastQ = [...live].reverse().find((r) => ctx.plain(r).trim().endsWith('?'));
  const answered = lastQ ? live.some((r) => r.at > lastQ.at && r.authorId !== lastQ.authorId) : true;
  if (lastQ && !answered) out.push(`- Open question — **${first(ctx.userName(lastQ.authorId))}**: ${clip(ctx.plain(lastQ), 110)}`);
  const latest = live[live.length - 1];
  if (!commits.includes(latest) && !(lastQ === latest && !answered)) out.push(`- Latest — **${first(ctx.userName(latest.authorId))}**: ${clip(ctx.plain(latest), 110)}`);
  return out.join('\n');
}

/* ---------------------------------------------------------------- smart replies */

export function smartReplies(text: string): string[] {
  switch (detectIntent(text)) {
    case 'question':
      return ['Yes, that works 👍', 'Let me check and get back to you', 'Not yet — soon!'];
    case 'review':
      return ['On it 👀', 'Will do today', 'Can it wait until tomorrow?'];
    case 'thanks':
      return ['Anytime! 🙌', 'Happy to help', '💜'];
    case 'greeting':
      return ['Hey! 👋', 'Morning! ☀️', 'Hi — what’s up?'];
    case 'meeting':
      return ['Sure — start a huddle 🎧', 'After 3 works', 'Works for me'];
    case 'celebrate':
      return ['Congrats! 🎉', 'Huge! 🚀', 'So well deserved'];
    case 'help':
    case 'urgent':
      return ['Looking now 🔍', 'Can you share the steps?', 'Raising a ticket'];
    case 'status':
      return ['On track ✅', 'Almost there', 'Running a bit late — will update'];
    case 'food':
      return ['I’m in! 🍜', '12:30?', 'Next time!'];
    case 'plan':
      return ['Love it', 'Let’s do it 👍', 'Any risks?'];
    default:
      return ['Sounds good 👍', 'Thanks!', 'Love it'];
  }
}

/* ---------------------------------------------------------------- huddles */

export interface ScriptLine {
  speakerId: string;
  text: string;
  kind: 'chat' | 'point' | 'action';
}

type Tpl = [kind: ScriptLine['kind'], text: string];

const SCRIPTS: Record<'design' | 'eng' | 'security' | 'social' | 'general', Tpl[]> = {
  design: [
    ['chat', 'Okay, sharing the latest motion study now.'],
    ['point', 'The new easing curves feel calmer — everyone preferred option B.'],
    ['chat', 'Can we check contrast on the dark surfaces too?'],
    ['point', 'Two token pairs still fail AA on dark — they need a lighter ink.'],
    ['action', 'I’ll update the dark-mode ink tokens and re-run the audit.'],
    ['chat', 'Love the empty states, honestly.'],
    ['point', 'We keep the illustration style but cut the animation length in half.'],
    ['action', 'I’ll share the updated spec in #design-crit by tomorrow.'],
  ],
  eng: [
    ['chat', 'Pulling up the dashboard — p99 is looking better already.'],
    ['point', 'The index change dropped p99 latency by roughly 40%.'],
    ['chat', 'Did the canary catch anything overnight?'],
    ['point', 'Canary was clean; one flaky test in the payments suite.'],
    ['action', 'I’ll quarantine the flaky test and open a ticket for it.'],
    ['point', 'Freeze window starts Thursday at 18:00.'],
    ['action', 'I’ll write the rollback runbook before the freeze.'],
    ['chat', 'Nice. Ship it 🚀'],
  ],
  security: [
    ['chat', 'Quick one on the passkey rollout numbers.'],
    ['point', 'Enrolment is at 71% — Engineering is the furthest behind.'],
    ['action', 'I’ll nudge the remaining folks in my org this week.'],
    ['point', 'The exception policy needs approval before enforcement on Dec 1.'],
    ['action', 'I’ll send the exception policy for approval today.'],
    ['chat', 'Helpdesk is ready for the ticket spike.'],
  ],
  social: [
    ['chat', 'Okay who brought the karak today? ☕'],
    ['point', 'Friday lunch is moving to the new Lebanese place.'],
    ['chat', 'Padel league sign-ups close tomorrow!'],
    ['action', 'I’ll book a table for twelve.'],
    ['point', 'National Day plans: office closes early on Dec 1.'],
  ],
  general: [
    ['chat', 'Hey everyone — thanks for jumping on.'],
    ['point', 'The goal is to agree on next steps for this week.'],
    ['chat', 'Makes sense. I have a couple of updates.'],
    ['point', 'Most open items are on track; one dependency is at risk.'],
    ['action', 'I’ll follow up on the at-risk dependency today.'],
    ['point', 'We’ll keep updates async in the channel.'],
    ['action', 'I’ll post a written summary after this call.'],
  ],
};

export function scriptTheme(conv: Pick<Conversation, 'id' | 'name' | 'kind'>): keyof typeof SCRIPTS {
  const k = `${conv.id} ${conv.name}`.toLowerCase();
  if (/design|prism|crit/.test(k)) return 'design';
  if (/eng|platform|ship|release/.test(k)) return 'eng';
  if (/mfa|security|it-help|passkey/.test(k)) return 'security';
  if (/watercooler|dubai|celebration|kudos|social/.test(k)) return 'social';
  return 'general';
}

/** Scripted huddle conversation spoken by the (non-viewer) participants. */
export function huddleScript(conv: Pick<Conversation, 'id' | 'name' | 'kind'>, speakerIds: string[]): ScriptLine[] {
  if (!speakerIds.length) return [];
  return SCRIPTS[scriptTheme(conv)].map(([kind, text], i) => ({ kind, text, speakerId: speakerIds[i % speakerIds.length] }));
}

/** Key points + action items from the lines heard during the huddle. */
export function recapFrom(lines: ScriptLine[]): { keyPoints: string[]; actionItems: { text: string; ownerId: string }[] } {
  const keyPoints = [...new Set(lines.filter((l) => l.kind === 'point').map((l) => l.text))];
  const actionItems = lines
    .filter((l) => l.kind === 'action')
    .map((l) => ({
      ownerId: l.speakerId,
      text: l.text.replace(/^I[’']ll\s+/i, '').replace(/^\w/, (c) => c.toUpperCase()).replace(/\.$/, ''),
    }));
  return { keyPoints, actionItems };
}

/* ---------------------------------------------------------------- Nova DM */

export type NovaAction = { kind: 'remind'; at: number; label: string; text: string };

export interface NovaWorld {
  ctx: NovaCtx;
  /** Unread messages grouped by conversation (viewer-visible only). */
  unread: { convId: string; label: string; messages: ChatMessage[] }[];
  /** Recent messages for a `#channel` name or person handle (viewer-visible only). */
  recentFor: (key: string) => { convId: string; label: string; messages: ChatMessage[] } | null;
  /** People currently online (names). */
  online: string[];
  search: (q: string) => ChatMessage[];
  /** Resolve a handle to { id, name, title }. */
  person: (handle: string) => { id: string; name: string; title: string } | null;
  /** Messages authored by a user (recent first). */
  authoredBy: (userId: string) => ChatMessage[];
  link: (convId: string, messageId?: string) => string;
}

export function novaAnswer(prompt: string, w: NovaWorld): { text: string; action?: NovaAction } {
  const p = prompt.trim();
  const lower = p.toLowerCase();
  const { ctx } = w;

  if (!p || /^(help|\?|what can you do|commands)\b/.test(lower)) {
    return {
      text: [
        `Hi ${first(ctx.userName(ctx.meId))} — here’s what I can do right now:`,
        '- **Catch me up** — a digest of everything unread',
        '- **Summarize #channel** — the last day of a channel in a few bullets',
        '- **Remind me to …** in 20 min / in 2 hours / tomorrow',
        '- **Find** messages, e.g. “find passkeys from @layla”',
        '- **Draft kudos for @name** — I’ll write it from their recent work',
        '- **Who’s online?**',
      ].join('\n'),
    };
  }

  if (/\b(what did i miss|catch me up|catch up|catchup|digest|anything new|summari[sz]e (everything|all)|what'?s new)\b/.test(lower)) {
    const groups = w.unread.filter((g) => g.messages.length);
    if (!groups.length) return { text: 'You’re all caught up — inbox zero across every conversation ✨' };
    const total = groups.reduce((a, g) => a + g.messages.length, 0);
    const out = [`**${total} unread** across ${groups.length} conversation${groups.length === 1 ? '' : 's'}. Here’s what matters:`];
    for (const g of groups.sort((a, b) => b.messages.length - a.messages.length).slice(0, 5)) {
      const d = digest(g.messages, ctx, 2);
      out.push(`\n**[${g.label}](${w.link(g.convId)})** · ${g.messages.length} new${d.topics.length ? ` · _${d.topics.slice(0, 2).join(', ')}_` : ''}`);
      for (const l of [...d.mentions.slice(0, 1).map((x) => ({ ...x, line: `Mentioned you — ${x.line}` })), ...d.polls.filter((x) => !x.voted).slice(0, 1).map((x) => ({ ...x, line: `${x.line} — _vote needed_` })), ...d.decisions.slice(0, 1), ...d.highlights.slice(0, 2)].slice(0, 3))
        out.push(`- ${l.line} · [jump](${w.link(l.convId, l.messageId)})`);
    }
    return { text: out.join('\n') };
  }

  const sum = /\b(summari[sz]e|summary of|tl;?dr|recap)\s+(?:of\s+)?([#@]?[\w.-]+)/i.exec(p);
  if (sum) {
    const key = sum[2].replace(/^#/, '').toLowerCase();
    const r = w.recentFor(key);
    if (!r) return { text: `I couldn’t find a conversation called “${sum[2]}” that you can see.` };
    const day = r.messages.filter((m) => m.at >= ctx.now - 86_400_000);
    const set = day.length >= 3 ? day : r.messages.slice(-15);
    const d = digest(set, { ...ctx, meId: '__nobody__' }, 4);
    return { text: `**${r.label}** — ${day.length >= 3 ? 'last 24 hours' : 'latest messages'}:\n${digestMarkdown(d, (l) => w.link(l.convId, l.messageId))}` };
  }

  if (/^remind me\b/.test(lower) || /^\/?remind\b/.test(lower)) {
    const body = p.replace(/^\/?remind( me)?\s*/i, '');
    const when = parseWhen(body, ctx.now) ?? (() => {
      const t = /\s+(in\s+\d{1,3}\s*\w+|tomorrow(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)$/i.exec(body);
      if (!t) return null;
      const w2 = parseWhen(t[1], ctx.now);
      return w2 ? { ...w2, rest: body.slice(0, t.index) } : null;
    })();
    if (!when) return { text: 'When should I remind you? Try “remind me to review the deck in 2 hours” or “… tomorrow”.' };
    const what = when.rest.replace(/^(to|about)\s+/i, '').trim() || 'check back here';
    const time = new Date(when.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return { text: `Got it — I’ll remind you **${when.label}** (${time}) to _${what}_. It’s saved in **Saved → Reminders**.`, action: { kind: 'remind', at: when.at, label: when.label, text: what } };
  }

  if (/\b(who'?s|who is|anyone)\s+(online|around|free|available)\b/.test(lower)) {
    if (!w.online.length) return { text: 'Nobody is showing as available right now.' };
    return { text: `**${w.online.length} people available:** ${w.online.slice(0, 12).join(', ')}${w.online.length > 12 ? '…' : ''}` };
  }

  const kd = /\b(?:draft|write)?\s*kudos\s+(?:for|to)\s+@?([a-z][\w.-]*)/i.exec(p);
  if (kd) {
    const person = w.person(kd[1].toLowerCase());
    if (!person) return { text: `I couldn’t find @${kd[1]} in the directory.` };
    const top = w
      .authoredBy(person.id)
      .slice(0, 30)
      .map((m) => ({ m, s: scoreMessage(m, { ...ctx, meHandle: undefined }) }))
      .sort((a, b) => b.s - a.s)[0]?.m;
    const what = top ? clip(firstSentence(ctx.plain(top)), 90).replace(/^[A-Z]/, (c) => c.toLowerCase()) : `everything you do as ${person.title}`;
    const value = top && /ship|launch|release|merged|fix/i.test(ctx.plain(top)) ? 'ownership' : top && /design|motion|token|craft|detail/i.test(ctx.plain(top)) ? 'craft' : 'teamwork';
    const draft = `Huge thanks @${kd[1].toLowerCase()} — ${what.replace(/[.!]$/, '')}. You make the whole team better 🙌`;
    return { text: `Here’s a draft (value: **${value}**):\n> ${draft}\nSend it with:\n\`/kudos @${kd[1].toLowerCase()} ${value} ${draft.replace(`@${kd[1].toLowerCase()} `, '')}\`` };
  }

  const find = /^(?:find|search|look for|where did|show me)\s+(.+)$/i.exec(p);
  if (find) {
    const hits = w.search(find[1]).slice(0, 5);
    if (!hits.length) return { text: `No messages match “${find[1]}”. Try fewer words or a filter like \`from:@name\` or \`in:#channel\`.` };
    return { text: [`Top ${hits.length} match${hits.length === 1 ? '' : 'es'} for “${find[1]}”:`, ...hits.map((m) => `- ${describe(m, ctx)} · _${ctx.convLabel(m.convId)}_ · [open](${w.link(m.convId, m.id)})`)].join('\n') };
  }

  // Fallback: treat as a search, then offer help.
  const hits = w.search(p).slice(0, 3);
  if (hits.length)
    return { text: [`Here’s what I found about “${clip(p, 40)}”:`, ...hits.map((m) => `- ${describe(m, ctx)} · _${ctx.convLabel(m.convId)}_ · [open](${w.link(m.convId, m.id)})`), '', 'Try **catch me up** or **summarize #channel** for more.'].join('\n') };
  return { text: 'I’m not sure how to help with that yet. Try **catch me up**, **summarize #design-crit**, **remind me to … in 1h**, **find …**, or **draft kudos for @name**.' };
}
