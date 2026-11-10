import { describe, expect, it } from 'vitest';
import { activeTrigger, applyTrigger, parseQuickAdd, resolveProject, resolveUser, type ParseContext } from './nlp';

// Thursday 5 Nov 2026, 10:00 local
const NOW = new Date(2026, 10, 5, 10, 0, 0, 0);
const users = [
  { id: 'u-priya', name: 'Priya Raman' },
  { id: 'u-omar', name: 'Omar Khalid' },
  { id: 'u-mei', name: 'Mei Tanaka' },
  { id: 'u-mateo', name: 'Mateo García' },
  { id: 'u-layla', name: 'Layla Haddad' },
];
const projects = [
  { id: 'prj-prism', key: 'PRISM', name: 'Prism v4 Design System' },
  { id: 'prj-mfa', key: 'MFA', name: 'Passkeys & MFA Rollout' },
  { id: 'prj-gcc', key: 'GCC', name: 'GCC Enterprise Expansion' },
];
const ctx: ParseContext = { now: NOW, users, projects, meId: 'u-mei' };
const p = (s: string) => parseQuickAdd(s, ctx);

describe('parseQuickAdd — the brief example', () => {
  it('extracts title, date, time, assignee, project and priority', () => {
    const r = p('Review token PR tomorrow 3pm @priya #prism !high');
    expect(r.title).toBe('Review token PR');
    expect(r.dueDate).toBe('2026-11-06');
    expect(r.dueTime).toBe('15:00');
    expect(r.assigneeId).toBe('u-priya');
    expect(r.projectId).toBe('prj-prism');
    expect(r.priority).toBe('high');
    expect(r.tokens.map((t) => t.kind).sort()).toEqual(['assignee', 'date', 'priority', 'project', 'time']);
  });

  it('records token ranges that map back onto the input', () => {
    const text = 'Fix bug !high';
    const r = p(text);
    const tok = r.tokens.find((t) => t.kind === 'priority')!;
    expect(text.slice(tok.start, tok.end)).toBe('!high');
    expect(tok.label).toBe('High');
  });
});

describe('relative dates', () => {
  it.each([
    ['Call today', '2026-11-05'],
    ['Call tomorrow', '2026-11-06'],
    ['Call tmrw', '2026-11-06'],
    ['Plan offsite friday', '2026-11-06'],
    ['Plan offsite thursday', '2026-11-12'],
    ['Sync this thursday', '2026-11-05'],
    ['Sync next tuesday', '2026-11-10'],
    ['Retro mon', '2026-11-09'],
    ['Draft brief next week', '2026-11-09'],
    ['Report end of week', '2026-11-06'],
    ['Report eow', '2026-11-06'],
    ['Budget eom', '2026-11-30'],
    ['Plan next month', '2026-12-01'],
    ['Hike this weekend', '2026-11-07'],
    ['Kickoff in 3 days', '2026-11-08'],
    ['Kickoff in 3d', '2026-11-08'],
    ['Kickoff in 2 weeks', '2026-11-19'],
    ['Kickoff in a week', '2026-11-12'],
  ])('%s → %s', (text, due) => {
    expect(p(text).dueDate).toBe(due);
  });

  it('only accepts weekday abbreviations with a connector or at the end', () => {
    expect(p('mon sync with design').dueDate).toBeUndefined();
    expect(p('mon sync with design').title).toBe('mon sync with design');
    const r = p('Sync on mon with design');
    expect(r.dueDate).toBe('2026-11-09');
    expect(r.title).toBe('Sync with design');
  });

  it('tonight implies 20:00 unless a time is given', () => {
    expect(p('Ship it tonight')).toMatchObject({ dueDate: '2026-11-05', dueTime: '20:00', title: 'Ship it' });
    expect(p('Ship it tonight 11pm')).toMatchObject({ dueDate: '2026-11-05', dueTime: '23:00' });
  });
});

describe('explicit dates', () => {
  it.each([
    ['Launch 12 Nov', '2026-11-12'],
    ['Launch Nov 12th', '2026-11-12'],
    ['Launch 12 November 2027', '2027-11-12'],
    ['Launch 3 Jan', '2027-01-03'],
    ['Launch 1 Nov', '2027-11-01'],
    ['Pay 11/12', '2026-11-12'],
    ['Pay 25/12', '2026-12-25'],
    ['Pay 2026-12-01', '2026-12-01'],
  ])('%s → %s', (text, due) => {
    expect(p(text).dueDate).toBe(due);
  });

  it('ignores impossible dates', () => {
    expect(p('Pay 31 Feb').dueDate).toBeUndefined();
    expect(p('Pay 2026-02-30').dueDate).toBeUndefined();
  });

  it('removes connector words with the date', () => {
    expect(p('Send invoice by friday').title).toBe('Send invoice');
    expect(p('Prepare deck for tomorrow').title).toBe('Prepare deck');
    expect(p('Board pack due 12 Nov').title).toBe('Board pack');
  });
});

describe('times', () => {
  it('rolls a past time to tomorrow and keeps a future time today', () => {
    expect(p('Standup 9:30am')).toMatchObject({ dueDate: '2026-11-06', dueTime: '09:30' });
    expect(p('Review 15:00')).toMatchObject({ dueDate: '2026-11-05', dueTime: '15:00' });
  });
  it.each([
    ['Call at 3', '15:00'],
    ['Call at 9', '09:00'],
    ['Lunch noon', '12:00'],
    ['Deploy by eod', '17:00'],
    ['Wrap up by midnight', '23:59'],
    ['Call 12pm', '12:00'],
    ['Call 12am tomorrow', '00:00'],
  ])('%s → %s', (text, time) => {
    expect(p(text).dueTime).toBe(time);
  });
});

describe('people, projects, priority and tags', () => {
  it('fuzzy-matches people by first name, last name and @me', () => {
    expect(p('Ping @pri').assigneeId).toBe('u-priya');
    expect(p('Ping @khalid').assigneeId).toBe('u-omar');
    expect(p('Ping @mateo').assigneeId).toBe('u-mateo');
    expect(p('Ping @me').assigneeId).toBe('u-mei');
  });

  it('leaves unknown references in the title and reports them', () => {
    const r = p('Ask @zed about #nothing');
    expect(r.assigneeId).toBeUndefined();
    expect(r.projectId).toBeUndefined();
    expect(r.title).toBe('Ask @zed about #nothing');
    expect(r.unresolved.map((u) => u.kind)).toEqual(['assignee', 'project']);
  });

  it('does not treat emails or C# as references', () => {
    const r = p('Email omar@helix.co about the C# migration');
    expect(r.assigneeId).toBeUndefined();
    expect(r.projectId).toBeUndefined();
    expect(r.title).toBe('Email omar@helix.co about the C# migration');
  });

  it('matches projects by key or by a word in the name', () => {
    expect(p('Fix #prism').projectId).toBe('prj-prism');
    expect(p('Fix #passkeys').projectId).toBe('prj-mfa');
    expect(p('Fix #gcc').projectId).toBe('prj-gcc');
  });

  it.each([
    ['Fix bug p1', 'urgent'],
    ['Fix bug p2', 'high'],
    ['Fix bug !urgent', 'urgent'],
    ['Fix bug !2', 'high'],
    ['Fix bug !medium', 'medium'],
    ['Fix bug !low', 'low'],
  ])('%s → %s', (text, prio) => {
    expect(p(text).priority).toBe(prio);
    expect(p(text).title).toBe('Fix bug');
  });

  it('collects multiple tags, lowercased and de-duplicated', () => {
    const r = p('Fix focus ring +A11y +frontend +a11y');
    expect(r.tags).toEqual(['a11y', 'frontend']);
    expect(r.title).toBe('Fix focus ring');
  });

  it('only takes the first date and keeps later ones as text', () => {
    const r = p('Move review from tomorrow to friday');
    expect(r.dueDate).toBe('2026-11-06');
  });
});

describe('resolvers', () => {
  it('prefers an exact first name over prefixes', () => {
    const list = [
      { id: 'a', name: 'Mei Tanaka' },
      { id: 'b', name: 'Meiko Sato' },
    ];
    expect(resolveUser('mei', list)?.id).toBe('a');
    expect(resolveUser('meik', list)?.id).toBe('b');
  });
  it('returns null for empty or unmatched queries', () => {
    expect(resolveUser('', users)).toBeNull();
    expect(resolveProject('zzz', projects)).toBeNull();
  });
});

describe('autocomplete triggers', () => {
  it('finds the fragment under the caret', () => {
    expect(activeTrigger('Review @pr', 10)).toEqual({ sigil: '@', query: 'pr', start: 7, end: 10 });
    expect(activeTrigger('Ship #pri now', 9)).toEqual({ sigil: '#', query: 'pri', start: 5, end: 9 });
    expect(activeTrigger('mail omar@helix', 15)).toBeNull();
    expect(activeTrigger('plain text', 5)).toBeNull();
  });
  it('replaces the fragment and moves the caret after it', () => {
    const t = activeTrigger('Review @pr today', 10)!;
    expect(applyTrigger('Review @pr today', t, '@Priya')).toEqual({ text: 'Review @Priya today', caret: 14 });
  });
});
