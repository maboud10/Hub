import { describe, expect, it } from 'vitest';
import { canBotPost, canInvite, canJoin, canLeave, canManage, canPost, canRemoveMember, canView, deleteMode, toViewer } from './access';
import { detectIntent, planResponses, type SimUser } from './engine';
import { buildHandles, dateKey } from './ids';
import { badgeProgress, heartbeat, heartbeatPath, kudosLeaders, levelOf, pickCoffeeMatch, streakOf, upcomingOccasions, vibeDistribution, vibeSeries, xpOf, emptyStats } from './pulse';
import { digest, digestMarkdown, huddleScript, novaAnswer, recapFrom, smartReplies, threadRecap, type NovaCtx, type NovaWorld } from './nova';
import { activityFeed, convState, emptyPerson, indexMessages } from './selectors';
import type { ChatMessage, Conversation, Mood } from './types';

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 6, 12, 0).getTime();

const chan = (over: Partial<Conversation> = {}): Conversation => ({
  id: 'ch-test',
  kind: 'channel',
  name: 'test',
  visibility: 'public',
  posting: 'everyone',
  memberIds: ['u-omar', 'u-mei'],
  adminIds: ['u-omar'],
  createdBy: 'u-omar',
  createdAt: NOW - 30 * DAY,
  pinnedIds: [],
  ...over,
});
const msg = (over: Partial<ChatMessage>): ChatMessage => ({ id: 'm1', convId: 'ch-test', authorId: 'u-mei', text: 'hello', at: NOW - 60_000, reactions: {}, ...over });

const employee = (id: string, extra: string[] = []) => toViewer({ id, roleIds: ['employee'] }, new Set(['app:chat', 'hub.kudos.give', ...extra]));
const contractor = toViewer({ id: 'u-alex', roleIds: ['contractor'] }, new Set(['app:chat']));
const admin = toViewer({ id: 'u-layla', roleIds: ['admin'] }, new Set(['*']));
const peopleOps = toViewer({ id: 'u-sara', roleIds: ['people-ops', 'employee'] }, new Set(['app:chat', 'hub.news.publish', 'hub.users.manage']));

describe('access policy', () => {
  it('scopes contractors to channels they are members of', () => {
    const pub = chan();
    expect(canView(pub, employee('u-hana'))).toBe(true);
    expect(canView(pub, contractor)).toBe(false);
    expect(canJoin(pub, contractor)).toBe(false);
    expect(canView(chan({ memberIds: ['u-alex'] }), contractor)).toBe(true);
  });

  it('keeps private channels and DMs members-only (even for admins)', () => {
    const priv = chan({ visibility: 'private' });
    expect(canView(priv, employee('u-hana'))).toBe(false);
    expect(canView(priv, admin)).toBe(false);
    expect(canJoin(priv, employee('u-hana'))).toBe(false);
    const dm: Conversation = { ...chan({ id: 'dm-u-mei--u-omar', kind: 'dm', visibility: 'private', adminIds: [] }) };
    expect(canView(dm, admin)).toBe(false);
    expect(canView(dm, employee('u-mei'))).toBe(true);
  });

  it('enforces membership and announcement-only posting', () => {
    expect(canPost(chan(), employee('u-hana'))).toMatchObject({ ok: false, reason: 'Join #test to post.' });
    const ann = chan({ posting: 'admins', memberIds: ['u-omar', 'u-mei', 'u-sara', 'u-layla'], adminIds: ['u-layla'] });
    expect(canPost(ann, employee('u-mei')).ok).toBe(false);
    expect(canPost(ann, peopleOps).ok).toBe(true);
    expect(canPost(ann, admin).ok).toBe(true);
    expect(canBotPost(ann, employee('u-mei')).ok).toBe(false);
    expect(canPost(chan({ archived: true }), employee('u-mei')).ok).toBe(false);
  });

  it('lets authors delete their own messages and moderators delete any (visible) message', () => {
    const c = chan();
    expect(deleteMode(msg({ authorId: 'u-mei' }), c, employee('u-mei'))).toBe('own');
    expect(deleteMode(msg({ authorId: 'u-mei' }), c, employee('u-omar'))).toBeNull();
    expect(deleteMode(msg({ authorId: 'u-mei' }), c, peopleOps)).toBe('moderator');
    expect(deleteMode(msg({ authorId: 'u-mei' }), chan({ visibility: 'private' }), admin)).toBeNull();
  });

  it('manages channel membership rules', () => {
    const c = chan();
    expect(canManage(c, employee('u-omar'))).toBe(true);
    expect(canManage(c, employee('u-mei'))).toBe(false);
    expect(canRemoveMember(c, employee('u-omar'), 'u-mei').ok).toBe(true);
    expect(canRemoveMember(chan({ mandatory: true }), employee('u-omar'), 'u-mei').ok).toBe(false);
    expect(canLeave(chan({ mandatory: true }), employee('u-mei'))).toBe(false);
    expect(canInvite(chan({ memberIds: ['u-alex'] }), contractor)).toBe(false);
  });
});

describe('simulated teammates', () => {
  const users: SimUser[] = [
    { id: 'u-omar', name: 'Omar Khalid', presence: 'online', department: 'Engineering', active: true, title: 'EM' },
    { id: 'u-mei', name: 'Mei Tanaka', presence: 'online', department: 'Design', active: true, title: 'Designer' },
    { id: 'u-noah', name: 'Noah Kim', presence: 'offline', department: 'Sales', active: true, title: 'AE' },
    { id: 'u-hana', name: 'Hana Park', presence: 'meeting', department: 'Design', active: true, title: 'Researcher' },
  ];
  const handles = buildHandles(users);
  const dm = (other: string): Conversation => chan({ id: `dm-x`, kind: 'dm', visibility: 'private', memberIds: ['u-omar', other], adminIds: [] });
  const base = { viewerId: 'u-omar', users, handles, recent: [] as ChatMessage[], now: NOW };

  it('detects intents', () => {
    expect(detectIntent('thanks a lot!')).toBe('thanks');
    expect(detectIntent('can you review my PR?')).toBe('review');
    expect(detectIntent('what is the ETA on this?')).toBe('status');
    expect(detectIntent('🎉🎉')).toBe('emoji');
    expect(detectIntent('prod is down, urgent')).toBe('urgent');
    expect(detectIntent('Is the deploy green?')).toBe('question');
  });

  it('the other person replies in a DM, deterministically', () => {
    const input = { ...base, conv: dm('u-mei'), message: msg({ id: 'mx', authorId: 'u-omar', text: 'can you review the spec?' }) };
    const a = planResponses(input);
    const b = planResponses(input);
    expect(a).toEqual(b);
    expect(a.replies).toHaveLength(1);
    expect(a.replies[0].authorId).toBe('u-mei');
    expect(a.replies[0].typingMs).toBeGreaterThanOrEqual(1100);
  });

  it('offline people never reply; busy people send a short acknowledgement', () => {
    expect(planResponses({ ...base, conv: dm('u-noah'), message: msg({ authorId: 'u-omar', text: 'hey there' }) }).replies).toHaveLength(0);
    const busy = planResponses({ ...base, conv: dm('u-hana'), message: msg({ authorId: 'u-omar', text: 'quick question?' }) });
    expect(busy.replies[0].text).toMatch(/meeting|call/i);
  });

  it('respects the rate limit and ignores other authors', () => {
    expect(planResponses({ ...base, conv: dm('u-mei'), message: msg({ authorId: 'u-omar', text: 'hi' }), lastSimulatedAt: NOW - 5_000 }).replies).toHaveLength(0);
    expect(planResponses({ ...base, conv: dm('u-mei'), message: msg({ authorId: 'u-mei', text: 'hi' }) }).replies).toHaveLength(0);
  });

  it('in channels, the mentioned person replies', () => {
    const c = chan({ memberIds: ['u-omar', 'u-mei', 'u-hana'] });
    const plan = planResponses({ ...base, conv: c, message: msg({ authorId: 'u-omar', text: '@mei can you take a look at the tokens?' }) });
    expect(plan.replies[0]?.authorId).toBe('u-mei');
  });

  it('statements in quiet channels do not trigger replies', () => {
    const c = chan({ memberIds: ['u-omar', 'u-mei'] });
    expect(planResponses({ ...base, conv: c, message: msg({ authorId: 'u-omar', text: 'Deployed the fix.' }) }).replies).toHaveLength(0);
  });
});

describe('pulse engagement', () => {
  it('computes streaks (today optional) and best streak', () => {
    const days = [1, 2, 3, 5, 6].map((i) => dateKey(NOW - i * DAY));
    expect(streakOf(days, NOW)).toEqual({ current: 3, best: 3, activeToday: false });
    expect(streakOf([dateKey(NOW), ...days], NOW).current).toBe(4);
    expect(streakOf([dateKey(NOW - 3 * DAY)], NOW).current).toBe(0);
  });

  it('turns stats into XP, levels and badges', () => {
    const s = { ...emptyStats(), polls: 1, sparks: 2, messages: 10, activeDays: ['2026-11-01'] };
    expect(xpOf(s)).toBe(5 + 15 + 20 + 20);
    expect(levelOf(0)).toMatchObject({ level: 1, floor: 0, next: 120 });
    expect(levelOf(130)).toMatchObject({ level: 2, floor: 120, next: 360 });
    const b = badgeProgress(s, 3);
    expect(b.find((x) => x.id === 'first-poll')?.earned).toBe(true);
    expect(b.find((x) => x.id === 'on-fire')?.progress).toBeCloseTo(3 / 7);
  });

  it('finds upcoming birthdays, anniversaries and recent joiners', () => {
    const d = (offset: number) => new Date(NOW + offset * DAY);
    const mmdd = (x: Date) => `${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    const users = [
      { id: 'a', active: true, birthday: mmdd(d(1)), startDate: '2020-01-01' },
      { id: 'b', active: true, startDate: `${d(3).getFullYear() - 4}-${mmdd(d(3))}` },
      { id: 'c', active: true, startDate: dateKey(NOW - 10 * DAY) },
      { id: 'z', active: false, birthday: mmdd(d(0)), startDate: '2020-01-01' },
    ];
    const occ = upcomingOccasions(users, NOW, 14);
    expect(occ.map((o) => `${o.type}:${o.userId}`)).toEqual(['welcome:c', 'birthday:a', 'anniversary:b']);
    expect(occ.find((o) => o.userId === 'b')?.years).toBe(4);
    expect(occ.find((o) => o.userId === 'a')?.inDays).toBe(1);
  });

  it('prefers coffee partners from another department and skips recent matches', () => {
    const cands = [
      { id: 'u-omar', department: 'Engineering' as const, active: true, optedIn: true },
      { id: 'u-priya', department: 'Engineering' as const, active: true, optedIn: true },
      { id: 'u-mei', department: 'Design' as const, active: true, optedIn: true },
      { id: 'u-noah', department: 'Sales' as const, active: true, optedIn: false },
    ];
    expect(pickCoffeeMatch({ id: 'u-omar', department: 'Engineering' }, cands, 0.99)).toBe('u-mei');
    expect(pickCoffeeMatch({ id: 'u-omar', department: 'Engineering' }, cands, 0.1, ['u-mei'])).toBe('u-priya');
    expect(pickCoffeeMatch({ id: 'u-omar', department: 'Engineering' }, [cands[0]], 0.5)).toBeNull();
  });

  it('aggregates vibes and kudos', () => {
    const vibes: Record<string, Record<string, Mood>> = { [dateKey(NOW)]: { a: 5, b: 3 }, [dateKey(NOW - DAY)]: { a: 4 } };
    const series = vibeSeries(vibes, NOW, 3);
    expect(series.map((x) => x.avg)).toEqual([null, 4, 4]);
    expect(vibeDistribution(vibes, NOW)).toEqual([0, 0, 1, 0, 1]);
    const leaders = kudosLeaders([{ fromId: 'a', toId: 'b', at: NOW }, { fromId: 'c', toId: 'b', at: NOW }, { fromId: 'a', toId: 'c', at: NOW - 40 * DAY }], NOW - 30 * DAY);
    expect(leaders.receivers[0]).toEqual({ id: 'b', count: 2 });
  });

  it('builds a heartbeat series and ECG path', () => {
    const beats = heartbeat([{ at: NOW - 10 * 60_000 }, { at: NOW - 15 * 60_000 }, { at: NOW - 5 * 3_600_000, system: 'join' }], NOW, 2, 30);
    expect(beats).toEqual([0, 0, 0, 2]);
    expect(heartbeatPath(beats, 100, 40)).toMatch(/^M0,/);
  });
});

describe('Nova', () => {
  const names: Record<string, string> = { 'u-omar': 'Omar Khalid', 'u-mei': 'Mei Tanaka', 'u-priya': 'Priya Raman' };
  const ctx: NovaCtx = { meId: 'u-omar', meHandle: 'omar', now: NOW, userName: (id) => names[id] ?? id, plain: (m) => m.text, convLabel: () => '#test', replyCount: () => 0 };
  const list: ChatMessage[] = [
    msg({ id: 'a', authorId: 'u-mei', text: '@omar can you confirm the alias naming for tokens?', at: NOW - 50 * 60_000 }),
    msg({ id: 'b', authorId: 'u-priya', text: 'Shipped the query planner rewrite — p99 latency down 40% for tokens service', at: NOW - 40 * 60_000, reactions: { '🚀': ['u-mei', 'u-omar'] } }),
    msg({ id: 'c', authorId: 'u-mei', text: '', poll: { question: 'Freeze tokens Thursday?', options: [{ id: 'o1', text: 'Yes' }], multi: false, anonymous: false, closed: false, votes: {} }, at: NOW - 30 * 60_000 }),
    msg({ id: 'd', authorId: 'u-omar', text: 'my own message', at: NOW - 20 * 60_000 }),
  ];

  it('digests unread messages: mentions, polls, highlights and topics', () => {
    const d = digest(list, ctx);
    expect(d.count).toBe(3);
    expect(d.mentions.map((x) => x.messageId)).toEqual(['a']);
    expect(d.polls[0]).toMatchObject({ messageId: 'c', voted: false });
    expect(d.highlights.map((x) => x.messageId)).toContain('b');
    expect(d.topics).toContain('tokens');
    const md = digestMarkdown(d, (l) => `/chat/c/${l.convId}?msg=${l.messageId}`);
    expect(md).toMatch(/3 new messages/);
    expect(md).toMatch(/you haven’t voted/);
  });

  it('recaps threads with open questions', () => {
    const parent = list[0];
    const replies = [msg({ id: 'r1', authorId: 'u-priya', text: 'I’ll check with platform today', at: NOW - 10 * 60_000 }), msg({ id: 'r2', authorId: 'u-mei', text: 'Do we keep the brand prefix?', at: NOW - 5 * 60_000 })];
    const md = threadRecap(parent, replies, ctx);
    expect(md).toMatch(/2 replies/);
    expect(md).toMatch(/Next step/);
    expect(md).toMatch(/Open question/);
  });

  it('writes huddle scripts and recaps from what was heard', () => {
    const lines = huddleScript({ id: 'ch-design-crit', name: 'design-crit', kind: 'channel' }, ['u-mei', 'u-hana']);
    expect(lines.length).toBeGreaterThan(4);
    expect(new Set(lines.map((l) => l.speakerId))).toEqual(new Set(['u-mei', 'u-hana']));
    const recap = recapFrom(lines);
    expect(recap.keyPoints.length).toBeGreaterThan(1);
    expect(recap.actionItems[0].text).not.toMatch(/^I’ll/);
  });

  it('suggests smart replies by intent', () => {
    expect(smartReplies('can you review my PR?')[0]).toMatch(/On it/);
    expect(smartReplies('thanks!')).toContain('Happy to help');
  });

  it('answers in the Nova DM with real actions', () => {
    const world: NovaWorld = {
      ctx,
      unread: [{ convId: 'ch-test', label: '#test', messages: list }],
      recentFor: (k) => (k === 'test' ? { convId: 'ch-test', label: '#test', messages: list } : null),
      online: ['Mei Tanaka'],
      search: (q) => list.filter((m) => m.text.toLowerCase().includes(q.toLowerCase())),
      person: (h) => (h === 'priya' ? { id: 'u-priya', name: 'Priya Raman', title: 'Staff Engineer' } : null),
      authoredBy: (id) => list.filter((m) => m.authorId === id),
      link: (c, m) => `/chat/c/${c}${m ? `?msg=${m}` : ''}`,
    };
    expect(novaAnswer('catch me up', world).text).toMatch(/unread/);
    expect(novaAnswer('summarize #test', world).text).toMatch(/#test/);
    expect(novaAnswer('summarize #nope', world).text).toMatch(/couldn’t find/);
    const r = novaAnswer('remind me to review the deck in 2 hours', world);
    expect(r.action).toMatchObject({ kind: 'remind', at: NOW + 2 * 3_600_000, text: 'review the deck' });
    expect(novaAnswer('draft kudos for @priya', world).text).toMatch(/\/kudos @priya/);
    expect(novaAnswer('who is online', world).text).toMatch(/Mei Tanaka/);
    expect(novaAnswer('find planner', world).text).toMatch(/Priya/);
  });
});

describe('selectors', () => {
  const c = chan({ memberIds: ['u-omar', 'u-mei'] });
  const messages: ChatMessage[] = [
    msg({ id: 'p', authorId: 'u-omar', text: 'Thread starter', at: NOW - 5 * 60_000, reactions: { '🎉': ['u-mei'] } }),
    msg({ id: 'r', authorId: 'u-mei', text: 'reply', parentId: 'p', at: NOW - 4 * 60_000 }),
    msg({ id: 'q', authorId: 'u-mei', text: 'hey @omar look', at: NOW - 3 * 60_000 }),
    msg({ id: 's', authorId: 'u-mei', text: 'and this', at: NOW - 2 * 60_000 }),
  ];

  it('indexes top-level messages and threads', () => {
    const idx = indexMessages(messages);
    expect(idx.byConv.get('ch-test')?.map((m) => m.id)).toEqual(['p', 'q', 's']);
    expect(idx.threads.get('p')?.map((m) => m.id)).toEqual(['r']);
    expect(indexMessages(messages)).toBe(idx);
  });

  it('counts unread and mentions per person', () => {
    const person = { ...emptyPerson(), lastRead: { 'ch-test': NOW - 5 * 60_000 } };
    expect(convState(c, indexMessages(messages).byConv.get('ch-test'), person, 'u-omar', 'omar')).toMatchObject({ unread: 2, mentions: 1, firstUnreadId: 'q' });
    const dm = { ...c, id: 'dm', kind: 'dm' as const };
    expect(convState(dm, messages.filter((m) => !m.parentId).map((m) => ({ ...m, convId: 'dm' })), emptyPerson(), 'u-omar', 'omar').mentions).toBe(2);
  });

  it('builds the activity feed (mentions, reactions, thread replies)', () => {
    const feed = activityFeed({ messages }, { userId: 'u-omar', handle: 'omar', visible: () => true, now: NOW });
    expect(feed.map((i) => i.kind).sort()).toEqual(['mention', 'reaction', 'thread']);
    expect(feed.find((i) => i.kind === 'thread')).toMatchObject({ parentId: 'p', actorIds: ['u-mei'] });
  });
});
