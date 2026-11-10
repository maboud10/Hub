import { describe, expect, it } from 'vitest';
import { isEmojiOnly, mentionHandles, mentions, parseBlocks, parseInline, replaceShortcodes, toPlainText, type ParseContext } from './markdown';
import { matchSlash, parseSlash, parseWhen, SHRUG } from './slash';
import { formatQuery, highlightParts, isEmptyQuery, matchMessage, parseSearch, type SearchContext } from './search';
import { buildHandles, dmId, dmMembers, slugifyChannel } from './ids';
import type { ChatMessage } from './types';

const ctx: ParseContext = {
  resolveUser: (h) => ({ omar: 'u-omar', mei: 'u-mei' })[h],
  resolveChannel: (n) => ({ general: 'ch-general', 'ship-it': 'ch-ship-it' })[n],
};

describe('markdown-lite inline', () => {
  it('parses bold, italic, strike and code', () => {
    expect(parseInline('**bold** _it_ ~~gone~~ `x = 1`', ctx)).toEqual([
      { t: 'b', c: [{ t: 'text', v: 'bold' }] },
      { t: 'text', v: ' ' },
      { t: 'i', c: [{ t: 'text', v: 'it' }] },
      { t: 'text', v: ' ' },
      { t: 's', c: [{ t: 'text', v: 'gone' }] },
      { t: 'text', v: ' ' },
      { t: 'code', v: 'x = 1' },
    ]);
  });

  it('does not treat snake_case or 2*3*4 as emphasis', () => {
    expect(parseInline('use snake_case_names and 2*3*4', ctx)).toEqual([{ t: 'text', v: 'use snake_case_names and 2*3*4' }]);
  });

  it('keeps markdown inside code untouched', () => {
    expect(parseInline('`**not bold**`', ctx)).toEqual([{ t: 'code', v: '**not bold**' }]);
  });

  it('parses labelled links and only allows safe hrefs', () => {
    expect(parseInline('[Spec](/drive/file/df-prism-spec)', ctx)).toEqual([{ t: 'link', href: '/drive/file/df-prism-spec', c: [{ t: 'text', v: 'Spec' }] }]);
    expect(parseInline('[x](javascript:alert(1))', ctx)[0]).toMatchObject({ t: 'text' });
  });

  it('detects bare URLs and trims trailing punctuation', () => {
    const out = parseInline('see https://helix.co/docs.', ctx);
    expect(out[1]).toEqual({ t: 'link', href: 'https://helix.co/docs', c: [{ t: 'text', v: 'helix.co/docs' }] });
    expect(out[2]).toEqual({ t: 'text', v: '.' });
  });

  it('resolves @mentions, @here and #channels, ignoring emails and unknown names', () => {
    const out = parseInline('hey @omar and @Mei, ping @here in #ship-it — mail omar@helix.co @nobody #nowhere', ctx);
    expect(out).toContainEqual({ t: 'mention', userId: 'u-omar', handle: 'omar' });
    expect(out).toContainEqual({ t: 'mention', userId: 'u-mei', handle: 'mei' });
    expect(out).toContainEqual({ t: 'special', v: 'here' });
    expect(out).toContainEqual({ t: 'channel', convId: 'ch-ship-it', name: 'ship-it' });
    expect(out.filter((n) => n.t === 'mention')).toHaveLength(2);
    expect(toPlainText('mail omar@helix.co', ctx)).toBe('mail omar@helix.co');
  });

  it('expands :shortcodes: and supports escapes', () => {
    expect(parseInline(':rocket: launch', ctx)[0]).toEqual({ t: 'emoji', v: '🚀', code: 'rocket' });
    expect(parseInline(':notanemoji:', ctx)).toEqual([{ t: 'text', v: ':notanemoji:' }]);
    expect(toPlainText(SHRUG)).toBe('¯\\_(ツ)_/¯');
    expect(replaceShortcodes('ship it :tada: `:tada:`')).toBe('ship it 🎉 `:tada:`');
  });
});

describe('markdown-lite blocks', () => {
  it('parses code fences, quotes, lists and paragraphs with line breaks', () => {
    const blocks = parseBlocks('Intro line\nsecond line\n\n```ts\nconst a = **1**;\n```\n> quoted **bit**\n- one\n- two\n1. first\n2. second', ctx);
    expect(blocks.map((b) => b.t)).toEqual(['p', 'pre', 'quote', 'ul', 'ol']);
    expect(blocks[0]).toMatchObject({ t: 'p', c: [{ t: 'text', v: 'Intro line' }, { t: 'br' }, { t: 'text', v: 'second line' }] });
    expect(blocks[1]).toEqual({ t: 'pre', v: 'const a = **1**;', lang: 'ts' });
    expect(blocks[3]).toMatchObject({ t: 'ul', items: [[{ t: 'text', v: 'one' }], [{ t: 'text', v: 'two' }]] });
    expect(blocks[4]).toMatchObject({ t: 'ol', start: 1 });
  });

  it('flattens to plain text with names', () => {
    expect(toPlainText('**Ship** it @omar in #general', ctx, { userName: () => 'Omar Khalid' })).toBe('Ship it @Omar Khalid in #general');
  });

  it('detects emoji-only messages (1–3 emoji)', () => {
    expect(isEmojiOnly('🎉')).toBe(true);
    expect(isEmojiOnly('🚀 🔥 :tada:')).toBe(true);
    expect(isEmojiOnly('🎉🎉🎉🎉')).toBe(false);
    expect(isEmojiOnly('nice 🎉')).toBe(false);
    expect(isEmojiOnly('123')).toBe(false);
  });

  it('scans mentions quickly, ignoring code', () => {
    expect(mentionHandles('hi @omar, see `@mei` and @everyone')).toEqual(['omar', 'channel']);
    expect(mentions('ping @here', 'mei')).toBe(true);
    expect(mentions('ping @here', 'mei', false)).toBe(false);
    expect(mentions('mail mei@helix.co', 'helix')).toBe(false);
  });
});

describe('slash commands', () => {
  const now = new Date(2026, 10, 6, 10, 0, 0).getTime(); // Fri 6 Nov 2026 10:00

  it('suggests commands by prefix', () => {
    expect(matchSlash('/po').map((c) => c.name)).toEqual(['poll']);
    expect(matchSlash('/').length).toBeGreaterThan(8);
    expect(matchSlash('/poll Q')).toEqual([]);
  });

  it('parses polls with pipes, quotes and flags', () => {
    expect(parseSlash('/poll Lunch? | Tacos | Sushi --multi')).toEqual({ cmd: 'poll', question: 'Lunch?', options: ['Tacos', 'Sushi'], multi: true, anonymous: false });
    expect(parseSlash('/poll "Best editor?" "Vim" "VS Code" --anon')).toMatchObject({ question: 'Best editor?', options: ['Vim', 'VS Code'], anonymous: true });
  });

  it('parses kudos with optional value', () => {
    expect(parseSlash('/kudos @mei craft The motion study was stunning')).toEqual({ cmd: 'kudos', handle: 'mei', value: 'craft', message: 'The motion study was stunning' });
    expect(parseSlash('/kudos @priya thanks for the review!')).toEqual({ cmd: 'kudos', handle: 'priya', value: undefined, message: 'thanks for the review!' });
  });

  it('parses reminders with leading or trailing time phrases', () => {
    const a = parseSlash('/remind me in 20m to stretch', now);
    expect(a).toMatchObject({ cmd: 'remind', at: now + 20 * 60_000, text: 'stretch' });
    const b = parseSlash('/remind review the deck tomorrow at 9', now);
    expect(b).toMatchObject({ cmd: 'remind', text: 'review the deck' });
    expect(new Date((b as { at: number }).at).getHours()).toBe(9);
    expect(parseSlash('/remind something', now)).toEqual({ cmd: 'remind', text: 'something' });
  });

  it('parses time phrases', () => {
    expect(parseWhen('in 2 hours', now)?.at).toBe(now + 2 * 3_600_000);
    expect(new Date(parseWhen('at 9', now)!.at).getDate()).toBe(7); // 9:00 already passed → tomorrow
    expect(new Date(parseWhen('monday', now)!.at).getDay()).toBe(1);
    expect(parseWhen('soon', now)).toBeNull();
  });

  it('parses status, shrug and unknown commands', () => {
    expect(parseSlash('/status focus Heads down')).toEqual({ cmd: 'status', presence: 'focus', message: 'Heads down' });
    expect(parseSlash('/status Back at 3')).toEqual({ cmd: 'status', presence: undefined, message: 'Back at 3' });
    expect((parseSlash('/shrug ok') as { text: string }).text).toBe(`ok ${SHRUG}`);
    expect(parseSlash('/teleport')).toEqual({ cmd: 'unknown', name: 'teleport' });
    expect(parseSlash('not a command')).toBeNull();
  });
});

describe('search', () => {
  const now = new Date(2026, 10, 6, 12, 0).getTime();
  const m = (over: Partial<ChatMessage>): ChatMessage => ({ id: 'm1', convId: 'ch-general', authorId: 'u-omar', text: 'Shipping the passkeys rollout today', at: now - 3_600_000, reactions: {}, ...over });
  const sctx: SearchContext = {
    now,
    plain: (x) => x.text,
    handleOf: (id) => id.replace('u-', ''),
    authorName: (id) => ({ 'u-omar': 'Omar Khalid', 'u-mei': 'Mei Tanaka' })[id] ?? id,
    convKeys: (id) => (id === 'ch-general' ? ['general'] : ['@mei']),
    isSaved: () => false,
    isPinned: () => false,
    replyCount: () => 0,
  };

  it('parses filters, phrases and terms (and formats back)', () => {
    const q = parseSearch('from:@omar in:#general has:poll is:pinned during:week "exact words" rollout');
    expect(q).toMatchObject({ from: ['omar'], in: ['general'], has: ['poll'], is: ['pinned'], during: 'week', phrases: ['exact words'], terms: ['rollout'] });
    expect(parseSearch(formatQuery(q))).toEqual(q);
    expect(isEmptyQuery(parseSearch('   '))).toBe(true);
  });

  it('matches all terms and filters', () => {
    expect(matchMessage(m({}), parseSearch('passkeys rollout'), sctx)).toBeGreaterThan(0);
    expect(matchMessage(m({}), parseSearch('passkeys tacos'), sctx)).toBeNull();
    expect(matchMessage(m({}), parseSearch('from:@mei passkeys'), sctx)).toBeNull();
    expect(matchMessage(m({}), parseSearch('in:#general'), sctx)).not.toBeNull();
    expect(matchMessage(m({ convId: 'dm-u-mei--u-omar' }), parseSearch('in:@mei'), sctx)).not.toBeNull();
    expect(matchMessage(m({}), parseSearch('has:poll'), sctx)).toBeNull();
    expect(matchMessage(m({ at: now - 10 * 86_400_000 }), parseSearch('during:week'), sctx)).toBeNull();
    expect(matchMessage(m({}), parseSearch('"passkeys rollout"'), sctx)).not.toBeNull();
    expect(matchMessage(m({ deleted: true }), parseSearch('passkeys'), sctx)).toBeNull();
  });

  it('searches rich payloads (poll options, cards, files)', () => {
    const poll = m({ text: '', poll: { question: 'Lunch?', options: [{ id: 'o1', text: 'Shawarma' }], multi: false, anonymous: false, closed: false, votes: {} } });
    expect(matchMessage(poll, parseSearch('shawarma'), sctx)).not.toBeNull();
    const card = m({ text: '', card: { app: 'projects', title: 'Token contrast audit', to: '/projects' } });
    expect(matchMessage(card, parseSearch('contrast has:card'), sctx)).not.toBeNull();
  });

  it('highlights matches', () => {
    expect(highlightParts('Ship the rollout', parseSearch('rollout'))).toEqual([
      { text: 'Ship the ', hit: false },
      { text: 'rollout', hit: true },
    ]);
  });
});

describe('ids & handles', () => {
  it('builds deterministic, sorted DM ids and decodes them', () => {
    expect(dmId(['u-omar', 'u-mei'])).toBe('dm-u-mei--u-omar');
    expect(dmId(['u-mei', 'u-omar', 'u-mei'])).toBe('dm-u-mei--u-omar');
    expect(dmId(['u-mei', 'bot-helpdesk'])).toBe('dm-bot-helpdesk--u-mei');
    expect(dmMembers('dm-u-alex--u-mei--u-omar')).toEqual(['u-alex', 'u-mei', 'u-omar']);
  });

  it('resolves handle collisions deterministically', () => {
    const h = buildHandles([
      { id: 'u-omar', name: 'Omar Khalid' },
      { id: 'u-omar2', name: 'Omar Farouk' },
      { id: 'u-mateo', name: 'Mateo García' },
    ]);
    expect(h.byUser.get('u-omar')).toBe('omar');
    expect(h.byUser.get('u-omar2')).toBe('omar.farouk');
    expect(h.byHandle.get('mateo')).toBe('u-mateo');
  });

  it('slugifies channel names', () => {
    expect(slugifyChannel('#Design Crit!!')).toBe('design-crit');
    expect(slugifyChannel('  Café  Talk ')).toBe('cafe-talk');
  });
});
